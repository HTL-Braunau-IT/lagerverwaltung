import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const sessionInput = z.object({
  sessionId: z.string().min(1).max(128),
});

export const cartRouter = createTRPCRouter({
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
});
