import { z } from "zod";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "~/server/api/trpc";

const sessionInput = z.object({
  sessionId: z.string().min(1).max(128),
});

function formatOrderNumber(year: number, runningNumber: number) {
  return `${year}${runningNumber.toString().padStart(6, "0")}`;
}

export const cartRouter = createTRPCRouter({
  listCostCenters: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.costCenter.findMany({
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

        await tx.cartItem.upsert({
          where: {
            cartId_productId: {
              cartId: cart.id,
              productId: input.productId,
            },
          },
          create: {
            cartId: cart.id,
            productId: input.productId,
            quantity,
          },
          update: {
            quantity: {
              increment: quantity,
            },
          },
        });

        return cart;
      });
    }),

  setItemQuantity: publicProcedure
    .input(
      sessionInput.extend({
        productId: z.string().min(1),
        quantity: z.number().nonnegative(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const cart = await ctx.db.cart.findUnique({
        where: { sessionId: input.sessionId },
        select: { id: true },
      });

      if (!cart) return null;

      if (input.quantity === 0) {
        await ctx.db.cartItem.deleteMany({
          where: {
            cartId: cart.id,
            productId: input.productId,
          },
        });
      } else {
        await ctx.db.cartItem.upsert({
          where: {
            cartId_productId: {
              cartId: cart.id,
              productId: input.productId,
            },
          },
          create: {
            cartId: cart.id,
            productId: input.productId,
            quantity: input.quantity.toString(),
          },
          update: {
            quantity: input.quantity.toString(),
          },
        });
      }

      return { ok: true };
    }),

  removeItem: publicProcedure
    .input(
      sessionInput.extend({
        productId: z.string().min(1),
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
          productId: input.productId,
        },
      });

      return { ok: true };
    }),

  checkout: protectedProcedure
    .input(
      sessionInput.extend({
        costCenterId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
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
              },
            },
          },
        });

        if (!cart || cart.items.length === 0) {
          return { ok: false as const, reason: "EMPTY_CART" as const };
        }

        const costCenter = await tx.costCenter.findUnique({
          where: { id: input.costCenterId },
          select: { id: true },
        });

        if (!costCenter) {
          return { ok: false as const, reason: "INVALID_COST_CENTER" as const };
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
        };
      });

      return result;
    }),

  listMyOrders: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.order.findMany({
      where: {
        userId: ctx.session.user.id,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        orderNumber: true,
        status: true,
        createdAt: true,
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
