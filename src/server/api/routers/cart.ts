import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure, publicProcedure, teacherProcedure } from "~/server/api/trpc";
import { listTeachersFromGraph } from "~/server/graph/teachers";
import { notifyStudentRequestCreated } from "~/server/mail/order-events";
import { dispatchOrderPlaced } from "~/server/approval/notifications";
import { orderTotal } from "~/server/approval/rules";
import {
  buildApprovalSnapshot,
  loadApproversForOrder,
  resolveApprovalForOrderer,
} from "~/server/approval/service";
import {
  aggregateProductRequirements,
  assertSufficientStock,
  calculatePartListMaxOrderable,
  decimalToNumber,
} from "~/server/api/routers/utils/stock";
import { resolveSingleStorageRoomForProductIds } from "~/server/api/routers/utils/storage-access";
import { getQuantityStepForBaseUnit, isQuantityAlignedToStep } from "~/lib/quantity-rules";

const sessionInput = z.object({
  sessionId: z.string().min(1).max(128),
});

const workerNoteInput = z.string().trim().max(500).optional();

const submitForTeacherApprovalInput = sessionInput.extend({
  teacherExternalId: z.string().min(1),
  workerNote: workerNoteInput,
});
const addPartListInput = sessionInput.extend({
  partListId: z.string().min(1),
  quantity: z.coerce.number().positive(),
});
const cartItemLineInput = z.object({
  productId: z.string().min(1),
  sourcePartListId: z.string().min(1).nullable().optional(),
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

function normalizeWorkerNote(workerNote: string | undefined) {
  const normalized = workerNote?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

function createMixedStorageRoomsError(existingRoomName: string, incomingRoomName: string): TRPCError {
  return new TRPCError({
    code: "BAD_REQUEST",
    message: `MIXED_STORAGE_ROOMS:${existingRoomName}:${incomingRoomName}`,
  });
}

async function resolveProductStorageRoom(
  db: {
    product: {
      findUnique: (args: {
        where: { id: string };
        select: {
          storageLocation: {
            select: {
              storageRoom: {
                select: {
                  id: true;
                  name: true;
                };
              };
            };
          };
        };
      }) => Promise<{ storageLocation: { storageRoom: { id: string; name: string } } | null } | null>;
    };
  },
  productId: string,
) {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: {
      storageLocation: {
        select: {
          storageRoom: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!product?.storageLocation?.storageRoom) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `PRODUCT_WITHOUT_STORAGE_ROOM:${productId}`,
    });
  }

  return product.storageLocation.storageRoom;
}

async function resolveCurrentCartStorageRoom(
  db: {
    cartItem: {
      findMany: (args: {
        where: { cartId: string };
        select: { productId: true };
      }) => Promise<Array<{ productId: string }>>;
    };
    product: {
      findMany: (args: {
        where: { id: { in: string[] } };
        select: {
          id: true;
          storageLocation: {
            select: {
              storageRoom: {
                select: {
                  id: true;
                  name: true;
                };
              };
            };
          };
        };
      }) => Promise<
        Array<{
          id: string;
          storageLocation: {
            storageRoom: {
              id: string;
              name: string;
            };
          } | null;
        }>
      >;
    };
  },
  cartId: string,
) {
  const cartItems = await db.cartItem.findMany({
    where: { cartId },
    select: { productId: true },
  });
  if (cartItems.length === 0) return null;

  try {
    return await resolveSingleStorageRoomForProductIds(
      db,
      cartItems.map((item) => item.productId),
    );
  } catch (error) {
    if (error instanceof TRPCError && error.message === "MIXED_STORAGE_ROOMS_INTERNAL") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "MIXED_STORAGE_ROOMS",
      });
    }
    throw error;
  }
}

function requireWorkerNoteForStudent(role: string, workerNote: string | undefined) {
  const normalized = normalizeWorkerNote(workerNote);
  if (role === "STUDENT" && !normalized) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "WORKER_NOTE_REQUIRED",
    });
  }
  return normalized;
}

function assertCartQuantityStep(quantity: number, baseUnit: string) {
  const step = getQuantityStepForBaseUnit(baseUnit);
  if (!isQuantityAlignedToStep(quantity, step)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Menge muss in ${step.toLocaleString("de-AT")}er-Schritten für ${baseUnit} angegeben werden.`,
    });
  }
}

export const cartRouter = createTRPCRouter({
  listTeachersForCheckout: protectedProcedure.query(async ({ ctx }) => {
    if (!["STUDENT", "ADMIN"].includes(ctx.session.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    try {
      return await listTeachersFromGraph();
    } catch (error) {
      console.error("[cart.listTeachersForCheckout] graph lookup failed", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "TEACHER_DIRECTORY_UNAVAILABLE",
      });
    }
  }),

  listCostCenters: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.costCenter.findMany({
      where: { isActive: true },
      orderBy: [{ code: "asc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
      },
    });
  }),

  get: publicProcedure.input(sessionInput).query(async ({ ctx, input }) => {
    const cart = await ctx.db.cart.findUnique({
      where: { sessionId: input.sessionId },
      select: {
        id: true,
        sessionId: true,
        updatedAt: true,
        items: {
          // `id` tiebreaker keeps a stable order: items added together (e.g. from a parts
          // list) share a `createdAt`, and without it tied rows shuffle on each refetch,
          // so cart lines visibly jump around after a quantity edit (#108).
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            productId: true,
            sourcePartListId: true,
            quantity: true,
            sourcePartList: {
              select: {
                id: true,
                name: true,
              },
            },
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                price: true,
                baseUnit: true,
                unitKind: true,
                unitStep: true,
                quantityOnHand: true,
                minimumQuantity: true,
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

    return cart;
  }),

  addItem: publicProcedure
    .input(
      sessionInput.extend({
        productId: z.string().min(1),
        quantity: z.number().positive().default(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const quantity = input.quantity.toString();

      return ctx.db.$transaction(async (tx) => {
        const cart = await tx.cart.upsert({
          where: { sessionId: input.sessionId },
          create: { sessionId: input.sessionId },
          update: {},
          select: { id: true, sessionId: true },
        });

        const [currentCartRoom, incomingProductRoom] = await Promise.all([
          resolveCurrentCartStorageRoom(tx, cart.id),
          resolveProductStorageRoom(tx, input.productId),
        ]);

        const product = await tx.product.findUnique({
          where: { id: input.productId },
          select: { id: true, baseUnit: true },
        });
        if (!product) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Produkt wurde nicht gefunden.",
          });
        }
        assertCartQuantityStep(input.quantity, product.baseUnit);

        if (currentCartRoom && currentCartRoom.id !== incomingProductRoom.id) {
          throw createMixedStorageRoomsError(currentCartRoom.name, incomingProductRoom.name);
        }

        const cartItems = await tx.cartItem.findMany({
          where: { cartId: cart.id },
          select: {
            productId: true,
            sourcePartListId: true,
            quantity: true,
          },
        });

        const existingDirectLine = await tx.cartItem.findFirst({
          where: {
            cartId: cart.id,
            productId: input.productId,
            sourcePartListId: null,
          },
          select: { id: true },
        });

        const requestedQuantity = Number(quantity);
        const existingDirectItem = cartItems.find(
          (item) => item.productId === input.productId && item.sourcePartListId === null,
        );
        const nextItems: Array<{ productId: string; quantity: unknown }> = cartItems
          .filter((item) => !(item.productId === input.productId && item.sourcePartListId === null))
          .map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          }));
        nextItems.push({
          productId: input.productId,
          quantity: (existingDirectItem ? Number(existingDirectItem.quantity) : 0) + requestedQuantity,
        });
        await assertSufficientStock(tx, aggregateProductRequirements(nextItems));

        if (existingDirectLine) {
          await tx.cartItem.update({
            where: { id: existingDirectLine.id },
            data: {
              quantity: {
                increment: quantity,
              },
            },
          });
        } else {
          await tx.cartItem.create({
            data: {
              cartId: cart.id,
              productId: input.productId,
              sourcePartListId: null,
              quantity,
            },
          });
        }

        return cart;
      });
    }),

  addPartList: publicProcedure.input(addPartListInput).mutation(async ({ ctx, input }) => {
    const requestedQuantity = Math.floor(input.quantity);
    if (requestedQuantity < 1) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Menge muss mindestens 1 sein." });
    }

    return ctx.db.$transaction(async (tx) => {
      const partList = await tx.partList.findUnique({
        where: { id: input.partListId },
        select: {
          id: true,
          name: true,
          items: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              productId: true,
              quantity: true,
              product: {
                select: {
                  id: true,
                  quantityOnHand: true,
                },
              },
            },
          },
        },
      });

      if (!partList || partList.items.length === 0) {
        return { ok: false as const, reason: "INVALID_PART_LIST" as const };
      }

      const maxOrderable = calculatePartListMaxOrderable(partList.items);
      if (requestedQuantity > maxOrderable) {
        return {
          ok: false as const,
          reason: "INSUFFICIENT_PART_LIST_STOCK" as const,
          maxOrderable,
          partListName: partList.name,
        };
      }

      const cart = await tx.cart.upsert({
        where: { sessionId: input.sessionId },
        create: { sessionId: input.sessionId },
        update: {},
        select: { id: true },
      });

      let incomingPartListRoom: { id: string; name: string };
      try {
        incomingPartListRoom = await resolveSingleStorageRoomForProductIds(
          tx,
          partList.items.map((item) => item.productId),
        );
      } catch (error) {
        if (error instanceof TRPCError && error.message === "MIXED_STORAGE_ROOMS_INTERNAL") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "MIXED_STORAGE_ROOMS",
          });
        }
        throw error;
      }

      const currentCartRoom = await resolveCurrentCartStorageRoom(tx, cart.id);

      if (currentCartRoom && currentCartRoom.id !== incomingPartListRoom.id) {
        throw createMixedStorageRoomsError(currentCartRoom.name, incomingPartListRoom.name);
      }

      for (const item of partList.items) {
        const incrementQuantity = (Number(item.quantity) * requestedQuantity).toString();
        await tx.cartItem.upsert({
          where: {
            cartId_productId_sourcePartListId: {
              cartId: cart.id,
              productId: item.productId,
              sourcePartListId: partList.id,
            },
          },
          create: {
            cartId: cart.id,
            productId: item.productId,
            sourcePartListId: partList.id,
            quantity: incrementQuantity,
          },
          update: {
            quantity: {
              increment: incrementQuantity,
            },
          },
        });
      }

      return { ok: true as const };
    });
  }),

  // Refill the cart from one of the user's past orders (#114). Adds each still-orderable
  // product (exists, visible, in stock) as a standalone line, capped at current stock.
  reorder: protectedProcedure
    .input(sessionInput.extend({ orderId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: input.orderId, userId: ctx.session.user.id },
          select: {
            id: true,
            items: {
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              select: {
                productId: true,
                quantity: true,
                product: { select: { id: true, isVisible: true, quantityOnHand: true } },
              },
            },
          },
        });

        if (!order || order.items.length === 0) {
          return { ok: false as const, reason: "ORDER_NOT_FOUND" as const };
        }

        const orderable = order.items.filter(
          (item) =>
            item.product && item.product.isVisible && decimalToNumber(item.product.quantityOnHand) > 0,
        );
        if (orderable.length === 0) {
          return { ok: false as const, reason: "NOTHING_AVAILABLE" as const };
        }

        const cart = await tx.cart.upsert({
          where: { sessionId: input.sessionId },
          create: { sessionId: input.sessionId },
          update: {},
          select: { id: true },
        });

        let incomingRoom: { id: string; name: string };
        try {
          incomingRoom = await resolveSingleStorageRoomForProductIds(
            tx,
            orderable.map((item) => item.productId),
          );
        } catch (error) {
          if (error instanceof TRPCError && error.message === "MIXED_STORAGE_ROOMS_INTERNAL") {
            return { ok: false as const, reason: "MIXED_STORAGE_ROOMS" as const };
          }
          throw error;
        }

        const currentCartRoom = await resolveCurrentCartStorageRoom(tx, cart.id);
        if (currentCartRoom && currentCartRoom.id !== incomingRoom.id) {
          throw createMixedStorageRoomsError(currentCartRoom.name, incomingRoom.name);
        }

        let addedCount = 0;
        let adjustedCount = 0;
        for (const item of orderable) {
          const available = decimalToNumber(item.product!.quantityOnHand);
          const wanted = decimalToNumber(item.quantity);

          const existingLine = await tx.cartItem.findFirst({
            where: { cartId: cart.id, productId: item.productId, sourcePartListId: null },
            select: { id: true, quantity: true },
          });
          const existingQty = existingLine ? decimalToNumber(existingLine.quantity) : 0;
          const cappedTotal = Math.min(existingQty + wanted, available);
          const increment = cappedTotal - existingQty;
          if (increment <= 0) continue;
          if (cappedTotal < existingQty + wanted) adjustedCount += 1;

          if (existingLine) {
            await tx.cartItem.update({
              where: { id: existingLine.id },
              data: { quantity: { increment: increment.toString() } },
            });
          } else {
            await tx.cartItem.create({
              data: {
                cartId: cart.id,
                productId: item.productId,
                sourcePartListId: null,
                quantity: increment.toString(),
              },
            });
          }
          addedCount += 1;
        }

        if (addedCount === 0) {
          return { ok: false as const, reason: "NOTHING_AVAILABLE" as const };
        }

        return {
          ok: true as const,
          addedCount,
          adjustedCount,
          skippedCount: order.items.length - orderable.length,
        };
      });
    }),

  setItemQuantity: publicProcedure
    .input(
      sessionInput.extend({
        line: cartItemLineInput,
        quantity: z.number().nonnegative(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const cart = await tx.cart.findUnique({
          where: { sessionId: input.sessionId },
          select: { id: true },
        });

        if (!cart) return null;

        const targetSourcePartListId = input.line.sourcePartListId ?? null;
        const lineWhere = {
          cartId: cart.id,
          productId: input.line.productId,
          sourcePartListId: targetSourcePartListId,
        };

        const cartItems = await tx.cartItem.findMany({
          where: { cartId: cart.id },
          select: {
            productId: true,
            sourcePartListId: true,
            quantity: true,
          },
        });

        if (input.quantity > 0) {
          const product = await tx.product.findUnique({
            where: { id: input.line.productId },
            select: { id: true, baseUnit: true },
          });
          if (!product) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Produkt wurde nicht gefunden.",
            });
          }
          assertCartQuantityStep(input.quantity, product.baseUnit);
        }

        const nextItems: Array<{ productId: string; quantity: unknown }> = cartItems
          .filter(
            (item) =>
              !(
                item.productId === input.line.productId &&
                item.sourcePartListId === targetSourcePartListId
              ),
          )
          .map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          }));
        if (input.quantity > 0) {
          nextItems.push({
            productId: input.line.productId,
            quantity: input.quantity,
          });
          try {
            await resolveSingleStorageRoomForProductIds(
              tx,
              nextItems.map((item) => item.productId),
            );
          } catch (error) {
            if (error instanceof TRPCError && error.message === "MIXED_STORAGE_ROOMS_INTERNAL") {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "MIXED_STORAGE_ROOMS",
              });
            }
            throw error;
          }
        }
        await assertSufficientStock(tx, aggregateProductRequirements(nextItems));

        if (input.quantity === 0) {
          await tx.cartItem.deleteMany({
            where: lineWhere,
          });
        } else {
          const existing = await tx.cartItem.findFirst({
            where: lineWhere,
            select: { id: true },
          });
          if (existing) {
            await tx.cartItem.update({
              where: { id: existing.id },
              data: {
                quantity: input.quantity.toString(),
              },
            });
          } else {
            await tx.cartItem.create({
              data: {
                cartId: cart.id,
                productId: input.line.productId,
                sourcePartListId: targetSourcePartListId,
                quantity: input.quantity.toString(),
              },
            });
          }
        }

        return { ok: true };
      });
    }),

  removeItem: publicProcedure
    .input(
      sessionInput.extend({
        line: cartItemLineInput,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const cart = await ctx.db.cart.findUnique({
        where: { sessionId: input.sessionId },
        select: { id: true },
      });

      if (!cart) return { ok: true };

      await ctx.db.cartItem.deleteMany({
        where: {
          cartId: cart.id,
          productId: input.line.productId,
          sourcePartListId: input.line.sourcePartListId ?? null,
        },
      });

      return { ok: true };
    }),

  // Students must route through `submitForTeacherApproval`; only ADMIN/TEACHER may place an
  // order directly. `teacherProcedure` enforces the {ADMIN, TEACHER} role set.
  checkout: teacherProcedure
    .input(
      sessionInput.extend({
        costCenterId: z.string().min(1),
        workerNote: workerNoteInput,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const workerNote = requireWorkerNoteForStudent(ctx.session.user.role, input.workerNote);
      const result = await ctx.db.$transaction(async (tx) => {
        const cart = await tx.cart.findUnique({
          where: { sessionId: input.sessionId },
          select: {
            id: true,
            items: {
              orderBy: { createdAt: "asc" },
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

        if (!cart || cart.items.length === 0) {
          return { ok: false as const, reason: "EMPTY_CART" as const };
        }

        const costCenter = await tx.costCenter.findUnique({
          where: { id: input.costCenterId },
          select: { id: true, code: true, name: true, isActive: true },
        });

        if (!costCenter || !costCenter.isActive) {
          return { ok: false as const, reason: "INVALID_COST_CENTER" as const };
        }

        try {
          await assertSufficientStock(tx, aggregateProductRequirements(cart.items));
        } catch (error) {
          if (error instanceof TRPCError && error.code === "BAD_REQUEST") {
            const parsed = parseInsufficientStockMessage(error.message);
            if (parsed) {
              return {
                ok: false as const,
                reason: "INSUFFICIENT_STOCK" as const,
                productId: parsed.productId,
                maxOrderable: parsed.maxOrderable,
              };
            }
          }
          throw error;
        }

        let targetStorageRoom: { id: string; name: string };
        try {
          targetStorageRoom = await resolveSingleStorageRoomForProductIds(
            tx,
            cart.items.map((item) => item.productId),
          );
        } catch (error) {
          if (error instanceof TRPCError && error.message === "MIXED_STORAGE_ROOMS_INTERNAL") {
            return { ok: false as const, reason: "MIXED_STORAGE_ROOMS" as const };
          }
          throw error;
        }

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
          orderTotal(cart.items.map((item) => ({ quantity: item.quantity, price: item.product.price }))),
        );

        const order = await tx.order.create({
          data: {
            orderNumber,
            userId: ctx.session.user.id,
            costCenterId: input.costCenterId,
            storageRoomId: targetStorageRoom.id,
            workerNote,
            status: "OPEN",
            ...(approval.required
              ? {
                  approvalStatus: "PENDING" as const,
                  approvalGroupId: approval.approvalGroupId,
                  approvalSnapshot: buildApprovalSnapshot({ costCenter, items: cart.items }),
                }
              : {}),
            items: {
              create: cart.items.map((item) => ({
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

        await tx.cartItem.deleteMany({
          where: { cartId: cart.id },
        });

        return {
          ok: true as const,
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          approvalStatus: order.approvalStatus,
          items: cart.items.map((item) => ({
            name: item.product.name,
            quantity: item.quantity,
            unit: item.product.baseUnit,
            price: item.product.price,
          })),
        };
      });

      if (result.ok) {
        dispatchOrderPlaced(ctx.db, result.orderId);
      }

      return result;
    }),

  submitForTeacherApproval: protectedProcedure
    .input(submitForTeacherApprovalInput)
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.user.role !== "STUDENT") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const workerNote = requireWorkerNoteForStudent(ctx.session.user.role, input.workerNote);

      let selectedTeacher:
        | {
            externalId: string;
            displayName: string;
            email: string;
          }
        | undefined;
      try {
        const teachers = await listTeachersFromGraph();
        selectedTeacher = teachers.find(
          (teacher: { externalId: string; displayName: string; email: string }) =>
            teacher.externalId === input.teacherExternalId,
        );
      } catch (error) {
        console.error("[cart.submitForTeacherApproval] graph lookup failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "TEACHER_DIRECTORY_UNAVAILABLE",
        });
      }

      if (!selectedTeacher) {
        return { ok: false as const, reason: "INVALID_TEACHER" as const };
      }

      const result = await ctx.db.$transaction(async (tx) => {
        const cart = await tx.cart.findUnique({
          where: { sessionId: input.sessionId },
          select: {
            id: true,
            items: {
              orderBy: { createdAt: "asc" },
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

        if (!cart || cart.items.length === 0) {
          return { ok: false as const, reason: "EMPTY_CART" as const };
        }

        try {
          await resolveSingleStorageRoomForProductIds(
            tx,
            cart.items.map((item) => item.productId),
          );
        } catch (error) {
          if (error instanceof TRPCError && error.message === "MIXED_STORAGE_ROOMS_INTERNAL") {
            return { ok: false as const, reason: "MIXED_STORAGE_ROOMS" as const };
          }
          throw error;
        }

        try {
          await assertSufficientStock(tx, aggregateProductRequirements(cart.items));
        } catch (error) {
          if (error instanceof TRPCError && error.code === "BAD_REQUEST") {
            const parsed = parseInsufficientStockMessage(error.message);
            if (parsed) {
              return {
                ok: false as const,
                reason: "INSUFFICIENT_STOCK" as const,
                productId: parsed.productId,
                maxOrderable: parsed.maxOrderable,
              };
            }
          }
          throw error;
        }

        const teacherUser = await tx.user.findUnique({
          where: { azureAdObjectId: selectedTeacher.externalId },
          select: { id: true },
        });

        const request = await tx.orderRequest.create({
          data: {
            studentId: ctx.session.user.id,
            teacherUserId: teacherUser?.id ?? null,
            teacherExternalId: selectedTeacher.externalId,
            teacherDisplayName: selectedTeacher.displayName,
            teacherEmail: selectedTeacher.email,
            workerNote,
            status: "PENDING",
            items: {
              create: cart.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
              })),
            },
          },
          select: {
            id: true,
          },
        });

        await tx.cartItem.deleteMany({
          where: { cartId: cart.id },
        });

        return {
          ok: true as const,
          requestId: request.id,
          items: cart.items.map((item) => ({
            name: item.product.name,
            quantity: item.quantity,
            unit: item.product.baseUnit,
            price: item.product.price,
          })),
        };
      });

      if (result.ok) {
        notifyStudentRequestCreated({
          requestId: result.requestId,
          teacher: {
            name: selectedTeacher.displayName,
            email: selectedTeacher.email,
          },
          student: {
            name: ctx.session.user.name,
            email: ctx.session.user.email,
          },
          items: result.items,
        }).catch((error) => {
          console.error("[mail.notifyStudentRequestCreated] request notification failed", error);
        });
      }

      return result;
    }),

  listMyOrders: protectedProcedure.query(async ({ ctx }) => {
    const orders = await ctx.db.order.findMany({
      where: {
        userId: ctx.session.user.id,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        orderNumber: true,
        status: true,
        createdAt: true,
        approvalStatus: true,
        approvalNote: true,
        approvalDecidedAt: true,
        approvalGroupId: true,
        approvalDecidedBy: {
          select: {
            name: true,
            email: true,
          },
        },
        sourceRequest: {
          select: {
            id: true,
            status: true,
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
          orderBy: { createdAt: "asc" },
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

    const pendingGroupIds = [
      ...new Set(orders.filter((order) => order.approvalStatus === "PENDING").map((order) => order.approvalGroupId ?? "")),
    ];
    const approverNamesByGroup = new Map<string, string[]>();
    for (const groupId of pendingGroupIds) {
      const approvers = await loadApproversForOrder(ctx.db, groupId || null);
      approverNamesByGroup.set(
        groupId,
        approvers.map((approver) => approver.name ?? approver.email ?? "-"),
      );
    }

    return orders.map(({ approvalGroupId, ...order }) => ({
      ...order,
      pendingApprovers:
        order.approvalStatus === "PENDING" ? (approverNamesByGroup.get(approvalGroupId ?? "") ?? []) : [],
    }));
  }),

  listMySubmittedRequests: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.orderRequest.findMany({
      where: {
        studentId: ctx.session.user.id,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        teacherDisplayName: true,
        teacherEmail: true,
        approvedOrder: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            approvalStatus: true,
            createdAt: true,
          },
        },
        items: {
          orderBy: { createdAt: "asc" },
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
  }),

  listSavedCarts: protectedProcedure.query(async ({ ctx }) => {
    const savedCarts = await ctx.db.savedCart.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            productId: true,
            quantity: true,
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                price: true,
                baseUnit: true,
              },
            },
          },
        },
      },
    });

    return savedCarts;
  }),

  saveCurrentCart: protectedProcedure
    .input(
      sessionInput.extend({
        name: z.string().trim().min(1).max(80),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const cart = await ctx.db.cart.findUnique({
        where: { sessionId: input.sessionId },
        select: {
          id: true,
          items: {
            orderBy: { createdAt: "asc" },
            select: {
              productId: true,
              quantity: true,
            },
          },
        },
      });

      if (!cart || cart.items.length === 0) {
        return { ok: false as const, reason: "EMPTY_CART" as const };
      }

      const savedCart = await ctx.db.$transaction(async (tx) => {
        const created = await tx.savedCart.create({
          data: {
            userId: ctx.session.user.id,
            name: input.name,
          },
          select: { id: true },
        });

        await tx.savedCartItem.createMany({
          data: cart.items.map((item) => ({
            savedCartId: created.id,
            productId: item.productId,
            quantity: item.quantity,
          })),
        });

        return created;
      });

      return { ok: true as const, savedCartId: savedCart.id };
    }),

  loadSavedCart: protectedProcedure
    .input(
      sessionInput.extend({
        savedCartId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const savedCart = await ctx.db.savedCart.findFirst({
        where: {
          id: input.savedCartId,
          userId: ctx.session.user.id,
        },
        select: {
          id: true,
          items: {
            orderBy: { createdAt: "asc" },
            select: {
              productId: true,
              quantity: true,
            },
          },
        },
      });

      if (!savedCart) {
        return { ok: false as const, reason: "NOT_FOUND" as const };
      }

      if (savedCart.items.length > 0) {
        try {
          await resolveSingleStorageRoomForProductIds(
            ctx.db,
            savedCart.items.map((item) => item.productId),
          );
        } catch (error) {
          if (error instanceof TRPCError && error.message === "MIXED_STORAGE_ROOMS_INTERNAL") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "MIXED_STORAGE_ROOMS",
            });
          }
          throw error;
        }
      }

      await ctx.db.$transaction(async (tx) => {
        const activeCart = await tx.cart.upsert({
          where: { sessionId: input.sessionId },
          create: { sessionId: input.sessionId },
          update: {},
          select: { id: true },
        });

        await tx.cartItem.deleteMany({
          where: { cartId: activeCart.id },
        });

        if (savedCart.items.length > 0) {
          await tx.cartItem.createMany({
            data: savedCart.items.map((item) => ({
              cartId: activeCart.id,
              productId: item.productId,
              quantity: item.quantity,
            })),
          });
        }
      });

      return { ok: true as const };
    }),

  deleteSavedCart: protectedProcedure
    .input(
      z.object({
        savedCartId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.savedCart.deleteMany({
        where: {
          id: input.savedCartId,
          userId: ctx.session.user.id,
        },
      });

      return { ok: true as const };
    }),
});
