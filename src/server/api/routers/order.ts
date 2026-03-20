import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";

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
});
