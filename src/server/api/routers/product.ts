import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const listProductsInput = z.object({
  search: z.string().trim().optional(),
  categoryId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(24),
  cursor: z.string().min(1).optional(),
});

export const productRouter = createTRPCRouter({
  list: publicProcedure.input(listProductsInput).query(async ({ ctx, input }) => {
    const search = input.search?.trim();
    const where = {
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { sku: { contains: search, mode: "insensitive" as const } },
              { description: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const items = await ctx.db.product.findMany({
      where,
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        sku: true,
        description: true,
        price: true,
        quantityOnHand: true,
        minimumQuantity: true,
        unitKind: true,
        baseUnit: true,
        unitStep: true,
        categoryId: true,
        storageLocationId: true,
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        storageLocation: {
          select: {
            id: true,
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
    });

    let nextCursor: string | undefined;
    if (items.length > input.limit) {
      const next = items.pop();
      nextCursor = next?.id;
    }

    return { items, nextCursor };
  }),

  byId: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.product.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          sku: true,
          description: true,
          price: true,
          quantityOnHand: true,
          minimumQuantity: true,
          unitKind: true,
          baseUnit: true,
          unitStep: true,
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          storageLocation: {
            select: {
              id: true,
              code: true,
              name: true,
              description: true,
            },
          },
          images: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              url: true,
              altText: true,
              sortOrder: true,
            },
          },
        },
      });
    }),
});
