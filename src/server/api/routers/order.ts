import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, createTRPCRouter, teacherProcedure } from "~/server/api/trpc";
import { aggregateProductRequirements, assertSufficientStock } from "~/server/api/routers/utils/stock";

const backendListOrdersInput = z.object({
  search: z.string().trim().optional(),
  status: z.enum(["OPEN", "PREPARING", "READY_FOR_PICKUP"]).optional(),
  limit: z.number().int().min(1).max(300).default(150),
});

const backendOrderByIdInput = z.object({
  id: z.string().min(1),
});

const backendUpdateOrderStatusInput = z.object({
  orderId: z.string().min(1),
  nextStatus: z.enum(["OPEN", "PREPARING", "READY_FOR_PICKUP"]),
});

const teacherAssignedRequestByIdInput = z.object({
  requestId: z.string().min(1),
});

const teacherApproveRequestInput = z.object({
  requestId: z.string().min(1),
  costCenterId: z.string().min(1),
});

function formatOrderNumber(year: number, runningNumber: number) {
  return `${year}${runningNumber.toString().padStart(6, "0")}`;
}

const allowedTransitions: Record<"OPEN" | "PREPARING" | "READY_FOR_PICKUP", Array<"OPEN" | "PREPARING" | "READY_FOR_PICKUP">> =
  {
    OPEN: ["PREPARING"],
    PREPARING: ["READY_FOR_PICKUP"],
    READY_FOR_PICKUP: [],
  };

export const orderRouter = createTRPCRouter({
  backendList: adminProcedure.input(backendListOrdersInput).query(async ({ ctx, input }) => {
    const search = input.search?.trim();

    return ctx.db.order.findMany({
      where: {
        ...(input.status ? { status: input.status } : {}),
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
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit,
      select: {
        id: true,
        orderNumber: true,
        status: true,
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
  }),

  backendById: adminProcedure.input(backendOrderByIdInput).query(async ({ ctx, input }) => {
    return ctx.db.order.findUnique({
      where: { id: input.id },
      select: {
        id: true,
        orderNumber: true,
        status: true,
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
                baseUnit: true,
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
  }),

  backendUpdateStatus: adminProcedure
    .input(backendUpdateOrderStatusInput)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: input.orderId },
          select: {
            id: true,
            status: true,
          },
        });

        if (!order) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Bestellung wurde nicht gefunden.",
          });
        }

        if (order.status === input.nextStatus) {
          return order;
        }

        const possibleNextStatuses = allowedTransitions[order.status];
        if (!possibleNextStatuses.includes(input.nextStatus)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Ungueltiger Statuswechsel.",
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

        return tx.order.update({
          where: { id: input.orderId },
          data: { status: input.nextStatus },
          select: {
            id: true,
            status: true,
            updatedAt: true,
          },
        });
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

        if (ctx.session.user.role !== "ADMIN") {
          const allowed =
            request.teacherUserId === ctx.session.user.id ||
            (ctx.session.user.azureAdObjectId &&
              request.teacherExternalId === ctx.session.user.azureAdObjectId);
          if (!allowed) {
            throw new TRPCError({ code: "FORBIDDEN" });
          }
        }

        if (request.status !== "PENDING") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Diese Anfrage wurde bereits bearbeitet.",
          });
        }

        if (request.items.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Anfrage enthaelt keine Positionen.",
          });
        }

        try {
          await assertSufficientStock(tx, aggregateProductRequirements(request.items));
        } catch (error) {
          if (error instanceof TRPCError && error.code === "BAD_REQUEST") {
            if (error.message.startsWith("INSUFFICIENT_STOCK:")) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Nicht genug Lagerbestand fuer mindestens ein Produkt.",
              });
            }
          }
          throw error;
        }

        const costCenter = await tx.costCenter.findUnique({
          where: { id: input.costCenterId },
          select: { id: true },
        });
        if (!costCenter) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Ungueltige Kostenstelle.",
          });
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

        const order = await tx.order.create({
          data: {
            orderNumber,
            userId: ctx.session.user.id,
            costCenterId: input.costCenterId,
            status: "OPEN",
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
        };
      });
    }),
});
