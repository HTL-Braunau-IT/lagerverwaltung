import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, createTRPCRouter, teacherProcedure } from "~/server/api/trpc";
import { aggregateProductRequirements, assertSufficientStock } from "~/server/api/routers/utils/stock";
import {
  assertStorageRoomAllowed,
  getStorageRoomAccessForUser,
  orderRoomWhereForAccess,
  resolveSingleStorageRoomForProductIds,
} from "~/server/api/routers/utils/storage-access";
import { notifyOrderStatusChanged, notifyTeacherRequestApproved } from "~/server/mail/order-events";
import { dispatchOrderPlaced } from "~/server/approval/notifications";
import { orderTotal } from "~/server/approval/rules";
import {
  buildApprovalSnapshot,
  isReleasedApprovalStatus,
  releasedOrderWhere,
  resolveApprovalForOrderer,
} from "~/server/approval/service";

const backendListOrdersInput = z.object({
  search: z.string().trim().optional(),
  status: z.enum(["OPEN", "PREPARING", "READY_FOR_PICKUP"]).optional(),
  approval: z.enum(["RELEASED", "PENDING", "DECLINED"]).default("RELEASED"),
  limit: z.number().int().min(1).max(300).default(150),
  cursor: z.string().min(1).optional(),
});

const backendOrderByIdInput = z.object({
  id: z.string().min(1),
});

const backendUpdateOrderStatusInput = z.object({
  orderId: z.string().min(1),
  nextStatus: z.enum(["OPEN", "PREPARING", "READY_FOR_PICKUP"]),
});

const backendBookOrderReturnInput = z.object({
  orderId: z.string().min(1),
  items: z
    .array(
      z.object({
        orderItemId: z.string().min(1),
        returnQuantity: z.coerce.number().positive(),
      }),
    )
    .min(1),
});

const backendUpdateOrderItemQuantityInput = z.object({
  orderId: z.string().min(1),
  orderItemId: z.string().min(1),
  quantity: z.coerce.number().positive(),
});

const teacherAssignedRequestByIdInput = z.object({
  requestId: z.string().min(1),
});

const teacherApproveRequestInput = z.object({
  requestId: z.string().min(1),
  costCenterId: z.string().min(1),
});

const teacherUpdateRequestItemQuantityInput = z.object({
  requestId: z.string().min(1),
  itemId: z.string().min(1),
  quantity: z.coerce.number().positive(),
});

const teacherRemoveRequestItemInput = z.object({
  requestId: z.string().min(1),
  itemId: z.string().min(1),
});

const teacherRejectRequestInput = z.object({
  requestId: z.string().min(1),
});

function formatOrderNumber(year: number, runningNumber: number) {
  return `${year}${runningNumber.toString().padStart(6, "0")}`;
}

function parseInsufficientStockMessage(message: string) {
  if (!message.startsWith("INSUFFICIENT_STOCK:")) return null;
  const [, productId, maxOrderableRaw] = message.split(":");
  return {
    productId: productId ?? "",
    maxOrderable: Number(maxOrderableRaw ?? "0"),
  };
}

function ensureTeacherCanHandleRequest(
  sessionUser: {
    role: "ADMIN" | "TEACHER" | "STUDENT";
    id: string;
    azureAdObjectId?: string | null;
  },
  request: { teacherUserId: string | null; teacherExternalId: string },
) {
  if (sessionUser.role === "ADMIN") return;

  const allowed =
    request.teacherUserId === sessionUser.id ||
    (sessionUser.azureAdObjectId && request.teacherExternalId === sessionUser.azureAdObjectId);

  if (!allowed) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

function ensureRequestIsPending(status: "PENDING" | "APPROVED" | "REJECTED") {
  if (status === "PENDING") return;

  if (status === "REJECTED") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Diese Anfrage wurde bereits abgelehnt.",
    });
  }

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "Diese Anfrage wurde bereits freigegeben.",
  });
}

type OrderStatus = "OPEN" | "PREPARING" | "READY_FOR_PICKUP";

function approvalWhereForFilter(filter: "RELEASED" | "PENDING" | "DECLINED") {
  if (filter === "PENDING") return { approvalStatus: "PENDING" as const };
  if (filter === "DECLINED") return { approvalStatus: { in: ["REJECTED" as const, "CANCELLED" as const] } };
  return releasedOrderWhere;
}

function assertOrderReleased(approvalStatus: string) {
  if (isReleasedApprovalStatus(approvalStatus)) return;
  throw new TRPCError({
    code: "BAD_REQUEST",
    message:
      approvalStatus === "PENDING"
        ? "Diese Bestellung wartet noch auf Freigabe."
        : "Diese Bestellung wurde nicht freigegeben.",
  });
}

function isTransitionAllowed(currentStatus: OrderStatus, nextStatus: OrderStatus) {
  if (currentStatus === nextStatus) return true;
  if (currentStatus === "READY_FOR_PICKUP" && nextStatus !== "READY_FOR_PICKUP") return false;
  return true;
}

const ORDER_RETURN_SUPPLIER = "Bestellrückgabe";
const ORDER_RETURN_NOTE_PREFIX = "ORDER_RETURN";

function buildOrderReturnNote(orderId: string, orderItemId: string) {
  return `${ORDER_RETURN_NOTE_PREFIX}:${orderId}:ITEM:${orderItemId}`;
}

function orderReturnPrefixForOrder(orderId: string) {
  return `${ORDER_RETURN_NOTE_PREFIX}:${orderId}:ITEM:`;
}

function assertQuantityFitsStep(quantity: number, step: number, label: string) {
  if (!Number.isFinite(quantity) || !Number.isFinite(step) || step <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${label} ist ungültig.`,
    });
  }

  const ratio = quantity / step;
  const rounded = Math.round(ratio);
  if (Math.abs(ratio - rounded) > 1e-9) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${label} muss zur Mengeneinheit passen.`,
    });
  }
}

export const orderRouter = createTRPCRouter({
  backendOpenCount: adminProcedure.query(async ({ ctx }) => {
    const access = await getStorageRoomAccessForUser(ctx.db, ctx.session.user.id);
    const roomWhere = orderRoomWhereForAccess(access);

    const [count, pendingApprovalCount] = await Promise.all([
      ctx.db.order.count({
        where: {
          status: "OPEN",
          ...releasedOrderWhere,
          ...(roomWhere ?? {}),
        },
      }),
      ctx.db.order.count({
        where: {
          approvalStatus: "PENDING",
          ...(roomWhere ?? {}),
        },
      }),
    ]);

    return { count, pendingApprovalCount };
  }),

  backendList: adminProcedure.input(backendListOrdersInput).query(async ({ ctx, input }) => {
    const access = await getStorageRoomAccessForUser(ctx.db, ctx.session.user.id);
    const roomWhere = orderRoomWhereForAccess(access);
    const search = input.search?.trim();

    const items = await ctx.db.order.findMany({
      where: {
        ...(input.status ? { status: input.status } : {}),
        ...approvalWhereForFilter(input.approval),
        ...(search
          ? {
              OR: [
                { orderNumber: { contains: search, mode: "insensitive" } },
                { user: { name: { contains: search, mode: "insensitive" } } },
                { user: { email: { contains: search, mode: "insensitive" } } },
                { sourceRequest: { student: { name: { contains: search, mode: "insensitive" } } } },
                { sourceRequest: { student: { email: { contains: search, mode: "insensitive" } } } },
                { costCenter: { code: { contains: search, mode: "insensitive" } } },
                { costCenter: { name: { contains: search, mode: "insensitive" } } },
              ],
            }
          : {}),
        ...(roomWhere ?? {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        orderNumber: true,
        workerNote: true,
        status: true,
        approvalStatus: true,
        approvalNote: true,
        approvalDecidedAt: true,
        approvalDecidedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        approvalGroup: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        sourceRequest: {
          select: {
            id: true,
            student: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        costCenter: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        items: {
          select: {
            id: true,
            quantity: true,
          },
        },
      },
    });

    let nextCursor: string | undefined;
    if (items.length > input.limit) {
      const nextItem = items.pop();
      nextCursor = nextItem?.id;
    }

    return { items, nextCursor };
  }),

  backendById: adminProcedure.input(backendOrderByIdInput).query(async ({ ctx, input }) => {
    const access = await getStorageRoomAccessForUser(ctx.db, ctx.session.user.id);
    const roomWhere = orderRoomWhereForAccess(access);
    const order = await ctx.db.order.findFirst({
      where: {
        id: input.id,
        ...(roomWhere ?? {}),
      },
      select: {
        id: true,
        orderNumber: true,
        workerNote: true,
        status: true,
        approvalStatus: true,
        approvalNote: true,
        approvalDecidedAt: true,
        approvalDecidedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        approvalGroup: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        sourceRequest: {
          select: {
            id: true,
            student: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        costCenter: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        items: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            quantity: true,
            createdAt: true,
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                compartment: true,
                baseUnit: true,
                unitStep: true,
                quantityOnHand: true,
                storageLocation: {
                  select: {
                    code: true,
                    name: true,
                  },
                },
                images: {
                  orderBy: { sortOrder: "asc" },
                  take: 1,
                  select: {
                    id: true,
                    url: true,
                    altText: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!order) return null;

    const returnBookings = await ctx.db.productStockBooking.findMany({
      where: {
        productId: { in: order.items.map((item) => item.product.id) },
        supplier: ORDER_RETURN_SUPPLIER,
        note: { startsWith: orderReturnPrefixForOrder(order.id) },
      },
      select: {
        productId: true,
        quantityDelta: true,
      },
    });

    const returnedByProduct = new Map<string, number>();
    for (const booking of returnBookings) {
      const current = returnedByProduct.get(booking.productId) ?? 0;
      returnedByProduct.set(booking.productId, current + Number(booking.quantityDelta));
    }

    return {
      ...order,
      items: order.items.map((item) => {
        const quantity = Number(item.quantity);
        const alreadyReturnedQuantity = Math.max(0, returnedByProduct.get(item.product.id) ?? 0);
        const remainingReturnableQuantity = Math.max(0, quantity - alreadyReturnedQuantity);
        return {
          ...item,
          alreadyReturnedQuantity,
          remainingReturnableQuantity,
        };
      }),
    };
  }),

  backendBookReturn: adminProcedure
    .input(backendBookOrderReturnInput)
    .mutation(async ({ ctx, input }) => {
      const access = await getStorageRoomAccessForUser(ctx.db, ctx.session.user.id);
      const userId = ctx.session.user.id;

      return ctx.db.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: input.orderId },
          select: {
            id: true,
            status: true,
            approvalStatus: true,
            orderNumber: true,
            storageRoomId: true,
            items: {
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              select: {
                id: true,
                productId: true,
                quantity: true,
                product: {
                  select: {
                    id: true,
                    name: true,
                    baseUnit: true,
                    unitStep: true,
                  },
                },
              },
            },
          },
        });

        if (!order) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Bestellung wurde nicht gefunden.",
          });
        }

        assertStorageRoomAllowed(access, order.storageRoomId);
        assertOrderReleased(order.approvalStatus);

        if (order.status !== "READY_FOR_PICKUP") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Rückbuchung ist nur bei 'Abholbereit' möglich.",
          });
        }

        const returnPrefix = orderReturnPrefixForOrder(order.id);
        const existingReturns = await tx.productStockBooking.findMany({
          where: {
            productId: { in: order.items.map((item) => item.productId) },
            supplier: ORDER_RETURN_SUPPLIER,
            note: { startsWith: returnPrefix },
          },
          select: {
            productId: true,
            quantityDelta: true,
          },
        });

        const returnedByProductId = new Map<string, number>();
        for (const row of existingReturns) {
          const current = returnedByProductId.get(row.productId) ?? 0;
          returnedByProductId.set(row.productId, current + Number(row.quantityDelta));
        }

        const requestedByOrderItemId = new Map<string, number>();
        for (const entry of input.items) {
          const prev = requestedByOrderItemId.get(entry.orderItemId) ?? 0;
          requestedByOrderItemId.set(entry.orderItemId, prev + entry.returnQuantity);
        }

        const updates = order.items
          .map((item) => {
            const returnQuantity = requestedByOrderItemId.get(item.id) ?? 0;
            if (returnQuantity <= 0) return null;

            assertQuantityFitsStep(returnQuantity, Number(item.product.unitStep), "Rückgabemenge");

            const orderedQuantity = Number(item.quantity);
            const alreadyReturned = Math.max(0, returnedByProductId.get(item.productId) ?? 0);
            const remaining = orderedQuantity - alreadyReturned;

            if (returnQuantity > remaining) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Rückgabemenge für '${item.product.name}' ist zu hoch.`,
              });
            }

            return {
              orderItemId: item.id,
              productId: item.productId,
              returnQuantity,
              productName: item.product.name,
            };
          })
          .filter((value): value is NonNullable<typeof value> => Boolean(value));

        if (updates.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Keine gültigen Rückgabepositionen übermittelt.",
          });
        }

        await Promise.all(
          updates.map((entry) =>
            tx.product.update({
              where: { id: entry.productId },
              data: {
                quantityOnHand: {
                  increment: entry.returnQuantity,
                },
              },
              select: { id: true },
            }),
          ),
        );

        await Promise.all(
          updates.map((entry) =>
            tx.productStockBooking.create({
              data: {
                productId: entry.productId,
                userId,
                quantityDelta: entry.returnQuantity,
                supplier: ORDER_RETURN_SUPPLIER,
                note: buildOrderReturnNote(order.id, entry.orderItemId),
              },
              select: { id: true },
            }),
          ),
        );

        return {
          ok: true as const,
          orderId: order.id,
          orderNumber: order.orderNumber,
          returnedItems: updates.map((item) => ({
            orderItemId: item.orderItemId,
            productId: item.productId,
            productName: item.productName,
            quantity: item.returnQuantity,
          })),
        };
      });
    }),

  backendUpdateItemQuantity: adminProcedure
    .input(backendUpdateOrderItemQuantityInput)
    .mutation(async ({ ctx, input }) => {
      const access = await getStorageRoomAccessForUser(ctx.db, ctx.session.user.id);

      return ctx.db.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: input.orderId },
          select: {
            id: true,
            status: true,
            approvalStatus: true,
            storageRoomId: true,
            items: {
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              select: {
                id: true,
                productId: true,
                quantity: true,
                product: {
                  select: {
                    id: true,
                    name: true,
                    unitStep: true,
                  },
                },
              },
            },
          },
        });

        if (!order) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Bestellung wurde nicht gefunden.",
          });
        }

        assertStorageRoomAllowed(access, order.storageRoomId);
        assertOrderReleased(order.approvalStatus);

        if (order.status !== "OPEN") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Mengenänderung ist nur bei offenen Bestellungen möglich.",
          });
        }

        const orderItem = order.items.find((item) => item.id === input.orderItemId);
        if (!orderItem) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Position wurde nicht gefunden.",
          });
        }

        assertQuantityFitsStep(input.quantity, Number(orderItem.product.unitStep), "Menge");

        const oldQuantity = Number(orderItem.quantity);
        if (oldQuantity === input.quantity) {
          return { ok: true as const, orderId: order.id };
        }

        const nextItems = order.items.map((item) => ({
          productId: item.productId,
          quantity: item.id === input.orderItemId ? input.quantity : item.quantity,
        }));

        try {
          await assertSufficientStock(tx, aggregateProductRequirements(nextItems));
        } catch (error) {
          if (error instanceof TRPCError && error.code === "BAD_REQUEST") {
            const parsed = parseInsufficientStockMessage(error.message);
            if (parsed) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Nicht genug Lagerbestand für diese Menge.",
              });
            }
          }
          throw error;
        }

        await tx.orderItem.update({
          where: { id: input.orderItemId },
          data: {
            quantity: input.quantity.toString(),
          },
          select: { id: true },
        });

        return { ok: true as const, orderId: order.id };
      });
    }),

  backendUpdateStatus: adminProcedure
    .input(backendUpdateOrderStatusInput)
    .mutation(async ({ ctx, input }) => {
      const access = await getStorageRoomAccessForUser(ctx.db, ctx.session.user.id);
      const result = await ctx.db.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: input.orderId },
          select: {
            id: true,
            status: true,
            approvalStatus: true,
            storageRoomId: true,
            orderNumber: true,
            user: {
              select: {
                name: true,
                email: true,
              },
            },
            sourceRequest: {
              select: {
                student: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
            },
            items: {
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              select: {
                quantity: true,
                product: {
                  select: {
                    name: true,
                    price: true,
                    baseUnit: true,
                  },
                },
              },
            },
          },
        });

        if (!order) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Bestellung wurde nicht gefunden.",
          });
        }

        assertStorageRoomAllowed(access, order.storageRoomId);
        assertOrderReleased(order.approvalStatus);

        if (order.status === input.nextStatus) {
          return {
            id: order.id,
            status: order.status,
            orderNumber: order.orderNumber,
            user: order.user,
            requester: order.sourceRequest?.student ?? null,
            items: order.items,
            changed: false as const,
          };
        }

        if (!isTransitionAllowed(order.status, input.nextStatus)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Rückwechsel von 'Abholbereit' ist nicht erlaubt.",
          });
        }

        if (input.nextStatus === "READY_FOR_PICKUP") {
          const orderItems = await tx.orderItem.findMany({
            where: { orderId: input.orderId },
            select: {
              productId: true,
              quantity: true,
            },
          });

          await assertSufficientStock(tx, aggregateProductRequirements(orderItems));

          await Promise.all(
            orderItems.map((item) =>
              tx.product.update({
                where: { id: item.productId },
                data: {
                  quantityOnHand: {
                    decrement: item.quantity,
                  },
                },
                select: { id: true },
              }),
            ),
          );
        }

        const updated = await tx.order.update({
          where: { id: input.orderId },
          data: { status: input.nextStatus },
          select: {
            id: true,
            status: true,
            updatedAt: true,
            orderNumber: true,
            user: {
              select: {
                name: true,
                email: true,
              },
            },
            sourceRequest: {
              select: {
                student: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
            },
            items: {
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              select: {
                quantity: true,
                product: {
                  select: {
                    name: true,
                    price: true,
                    baseUnit: true,
                  },
                },
              },
            },
          },
        });

        return {
          ...updated,
          requester: updated.sourceRequest?.student ?? null,
          changed: true as const,
        };
      });

      if (result.changed) {
        notifyOrderStatusChanged({
          orderNumber: result.orderNumber,
          status: result.status,
          owner: result.user,
          requester: result.requester ?? undefined,
          items: result.items.map((item) => ({
            name: item.product.name,
            quantity: item.quantity,
            unit: item.product.baseUnit,
            price: item.product.price,
          })),
        }).catch((error) => {
          console.error("[mail.notifyOrderStatusChanged] status notification failed", error);
        });
      }

      return result;
    }),

  updateAssignedRequestItemQuantity: teacherProcedure
    .input(teacherUpdateRequestItemQuantityInput)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const request = await tx.orderRequest.findUnique({
          where: { id: input.requestId },
          select: {
            id: true,
            status: true,
            teacherUserId: true,
            teacherExternalId: true,
            items: {
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              select: {
                id: true,
                productId: true,
                quantity: true,
              },
            },
          },
        });

        if (!request) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Anfrage wurde nicht gefunden.",
          });
        }

        ensureTeacherCanHandleRequest(ctx.session.user, request);
        ensureRequestIsPending(request.status);

        const existingItem = request.items.find((item) => item.id === input.itemId);
        if (!existingItem) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Position wurde nicht gefunden.",
          });
        }

        const nextItems = request.items.map((item) => ({
          productId: item.productId,
          quantity: item.id === input.itemId ? input.quantity : item.quantity,
        }));

        try {
          await assertSufficientStock(tx, aggregateProductRequirements(nextItems));
        } catch (error) {
          if (error instanceof TRPCError && error.code === "BAD_REQUEST") {
            const parsed = parseInsufficientStockMessage(error.message);
            if (parsed) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Nicht genug Lagerbestand für diese Menge.",
              });
            }
          }
          throw error;
        }

        await tx.orderRequestItem.update({
          where: { id: input.itemId },
          data: {
            quantity: input.quantity.toString(),
          },
          select: { id: true },
        });

        return { ok: true as const };
      });
    }),

  removeAssignedRequestItem: teacherProcedure
    .input(teacherRemoveRequestItemInput)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const request = await tx.orderRequest.findUnique({
          where: { id: input.requestId },
          select: {
            id: true,
            status: true,
            teacherUserId: true,
            teacherExternalId: true,
            items: {
              select: {
                id: true,
              },
            },
          },
        });

        if (!request) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Anfrage wurde nicht gefunden.",
          });
        }

        ensureTeacherCanHandleRequest(ctx.session.user, request);
        ensureRequestIsPending(request.status);

        const targetItem = request.items.find((item) => item.id === input.itemId);
        if (!targetItem) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Position wurde nicht gefunden.",
          });
        }

        await tx.orderRequestItem.delete({
          where: { id: input.itemId },
          select: { id: true },
        });

        return {
          ok: true as const,
          remainingItemCount: Math.max(request.items.length - 1, 0),
        };
      });
    }),

  rejectAssignedRequest: teacherProcedure
    .input(teacherRejectRequestInput)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const request = await tx.orderRequest.findUnique({
          where: { id: input.requestId },
          select: {
            id: true,
            status: true,
            teacherUserId: true,
            teacherExternalId: true,
          },
        });

        if (!request) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Anfrage wurde nicht gefunden.",
          });
        }

        ensureTeacherCanHandleRequest(ctx.session.user, request);
        ensureRequestIsPending(request.status);

        const updated = await tx.orderRequest.update({
          where: { id: request.id },
          data: {
            status: "REJECTED",
          },
          select: {
            id: true,
            status: true,
          },
        });

        return { ok: true as const, id: updated.id, status: updated.status };
      });
    }),

  listAssignedRequests: teacherProcedure.query(async ({ ctx }) => {
    const teacherWhere =
      ctx.session.user.role === "ADMIN"
        ? {}
        : {
            OR: [
              { teacherUserId: ctx.session.user.id },
              ...(ctx.session.user.azureAdObjectId
                ? [{ teacherExternalId: ctx.session.user.azureAdObjectId }]
                : []),
            ],
          };

    return ctx.db.orderRequest.findMany({
      where: {
        ...teacherWhere,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        approvedOrder: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            createdAt: true,
          },
        },
        teacherDisplayName: true,
        teacherEmail: true,
        student: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        items: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            quantity: true,
            product: {
              select: {
                id: true,
                name: true,
                baseUnit: true,
                quantityOnHand: true,
              },
            },
          },
        },
      },
    });
  }),

  getAssignedRequestById: teacherProcedure
    .input(teacherAssignedRequestByIdInput)
    .query(async ({ ctx, input }) => {
      const request = await ctx.db.orderRequest.findUnique({
        where: { id: input.requestId },
        select: {
          id: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          teacherUserId: true,
          teacherExternalId: true,
          teacherDisplayName: true,
          teacherEmail: true,
          student: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          approvedOrder: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              createdAt: true,
            },
          },
          items: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              quantity: true,
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  baseUnit: true,
                },
              },
            },
          },
        },
      });

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Anfrage wurde nicht gefunden.",
        });
      }

      if (ctx.session.user.role !== "ADMIN") {
        const allowed =
          request.teacherUserId === ctx.session.user.id ||
          (ctx.session.user.azureAdObjectId &&
            request.teacherExternalId === ctx.session.user.azureAdObjectId);
        if (!allowed) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      return request;
    }),

  approveAssignedRequest: teacherProcedure
    .input(teacherApproveRequestInput)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.$transaction(async (tx) => {
        const request = await tx.orderRequest.findUnique({
          where: { id: input.requestId },
          select: {
            id: true,
            status: true,
            teacherUserId: true,
            teacherExternalId: true,
            teacherDisplayName: true,
            teacherEmail: true,
            workerNote: true,
            student: {
              select: {
                name: true,
                email: true,
              },
            },
            items: {
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              select: {
                productId: true,
                quantity: true,
                product: {
                  select: {
                    name: true,
                    price: true,
                    baseUnit: true,
                  },
                },
              },
            },
          },
        });

        if (!request) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Anfrage wurde nicht gefunden.",
          });
        }

        ensureTeacherCanHandleRequest(ctx.session.user, request);
        ensureRequestIsPending(request.status);

        if (request.items.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Anfrage enthält keine Positionen mehr. Bitte Anfrage ablehnen.",
          });
        }

        try {
          await assertSufficientStock(tx, aggregateProductRequirements(request.items));
        } catch (error) {
          if (error instanceof TRPCError && error.code === "BAD_REQUEST") {
            if (error.message.startsWith("INSUFFICIENT_STOCK:")) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Nicht genug Lagerbestand für mindestens ein Produkt.",
              });
            }
          }
          throw error;
        }

        const costCenter = await tx.costCenter.findUnique({
          where: { id: input.costCenterId },
          select: { id: true, code: true, name: true },
        });
        if (!costCenter) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Ungültige Kostenstelle.",
          });
        }

        const targetStorageRoom = await resolveSingleStorageRoomForProductIds(
          tx,
          request.items.map((item) => item.productId),
        );

        const year = new Date().getFullYear();
        const counter = await tx.orderCounter.upsert({
          where: { year },
          create: {
            year,
            lastNumber: 1,
          },
          update: {
            lastNumber: { increment: 1 },
          },
          select: {
            lastNumber: true,
          },
        });
        const orderNumber = formatOrderNumber(year, counter.lastNumber);

        const approval = await resolveApprovalForOrderer(
          tx,
          { id: ctx.session.user.id, role: ctx.session.user.role },
          orderTotal(request.items.map((item) => ({ quantity: item.quantity, price: item.product.price }))),
        );

        const order = await tx.order.create({
          data: {
            orderNumber,
            userId: ctx.session.user.id,
            costCenterId: input.costCenterId,
            storageRoomId: targetStorageRoom.id,
            workerNote: request.workerNote,
            status: "OPEN",
            ...(approval.required
              ? {
                  approvalStatus: "PENDING" as const,
                  approvalGroupId: approval.approvalGroupId,
                  approvalSnapshot: buildApprovalSnapshot({ costCenter, items: request.items }),
                }
              : {}),
            items: {
              create: request.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
              })),
            },
          },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            approvalStatus: true,
          },
        });

        await tx.orderRequest.update({
          where: { id: request.id },
          data: {
            status: "APPROVED",
            teacherUserId:
              request.teacherUserId ?? (ctx.session.user.role === "ADMIN" ? request.teacherUserId : ctx.session.user.id),
            approvedOrderId: order.id,
          },
          select: { id: true },
        });

        return {
          ok: true as const,
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          approvalStatus: order.approvalStatus,
          requestId: request.id,
          teacherDisplayName: request.teacherDisplayName,
          teacherEmail: request.teacherEmail,
          studentName: request.student.name,
          studentEmail: request.student.email,
          items: request.items.map((item) => ({
            name: item.product.name,
            quantity: item.quantity,
            unit: item.product.baseUnit,
            price: item.product.price,
          })),
        };
      });

      if (result.ok) {
        notifyTeacherRequestApproved({
          requestId: result.requestId,
          orderNumber: result.orderNumber,
          teacher: {
            name: result.teacherDisplayName,
            email: result.teacherEmail,
          },
          student: {
            name: result.studentName,
            email: result.studentEmail,
          },
          items: result.items,
          awaitingFinalApproval: result.approvalStatus === "PENDING",
        }).catch((error) => {
          console.error("[mail.notifyTeacherRequestApproved] approval notification failed", error);
        });
        dispatchOrderPlaced(ctx.db, result.orderId);
      }

      return result;
    }),
});
