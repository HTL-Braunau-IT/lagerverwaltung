import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { adminProcedure, createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const listProductsInput = z.object({
  search: z.string().trim().optional(),
  categoryId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(24),
  cursor: z.string().min(1).optional(),
});

const backendListProductsInput = z.object({
  search: z.string().trim().optional(),
  limit: z.number().int().min(1).max(300).default(100),
});

const updateProductInput = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  sku: z.string().trim().min(1),
  description: z.string().trim().nullable(),
  price: z.coerce.number().min(0),
  minimumQuantity: z.coerce.number().min(0),
  unitKind: z.enum(["PIECE", "LENGTH", "AREA", "WEIGHT", "VOLUME"]),
  baseUnit: z.enum(["PCS", "MM", "CM", "M", "CM2", "M2", "G", "KG", "ML", "L"]),
  unitStep: z.coerce.number().gt(0),
  categoryId: z.string().min(1).nullable(),
  storageLocationId: z.string().min(1).nullable(),
  imageUrl: z.string().trim().url().nullable(),
  imageAltText: z.string().trim().nullable(),
});

const backendBookStockInput = z.object({
  productId: z.string().min(1),
  quantityDelta: z.coerce.number(),
  supplier: z.string().trim().min(1),
  note: z.string().trim().nullable(),
});

export const productRouter = createTRPCRouter({
  list: publicProcedure.input(listProductsInput).query(async ({ ctx, input }) => {
    const search = input.search?.trim();
    const andFilters: Array<Record<string, unknown>> = [];
    if (input.categoryId) {
      andFilters.push({
        OR: [
          { categoryId: input.categoryId },
          { categories: { some: { categoryId: input.categoryId } } },
        ],
      });
    }
    if (search) {
      andFilters.push({
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { sku: { contains: search, mode: "insensitive" as const } },
          { description: { contains: search, mode: "insensitive" as const } },
        ],
      });
    }
    const where = andFilters.length > 0 ? { AND: andFilters } : undefined;

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

  backendList: adminProcedure
    .input(backendListProductsInput)
    .query(async ({ ctx, input }) => {
      const search = input.search?.trim();

      return ctx.db.product.findMany({
        where: search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { sku: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
              ],
            }
          : undefined,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: input.limit,
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
    }),

  backendUpdate: adminProcedure
    .input(updateProductInput)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const updated = await tx.product.update({
          where: { id: input.id },
          data: {
            name: input.name,
            sku: input.sku,
            description: input.description,
            price: input.price,
            minimumQuantity: input.minimumQuantity,
            unitKind: input.unitKind,
            baseUnit: input.baseUnit,
            unitStep: input.unitStep,
            categoryId: input.categoryId,
            storageLocationId: input.storageLocationId,
          },
          select: {
            id: true,
          },
        });

        const existingImage = await tx.productImage.findFirst({
          where: { productId: input.id },
          orderBy: { sortOrder: "asc" },
          select: { id: true },
        });

        if (input.imageUrl) {
          if (existingImage) {
            await tx.productImage.update({
              where: { id: existingImage.id },
              data: {
                url: input.imageUrl,
                altText: input.imageAltText?.length ? input.imageAltText : null,
              },
            });
          } else {
            await tx.productImage.create({
              data: {
                productId: input.id,
                url: input.imageUrl,
                altText: input.imageAltText?.length ? input.imageAltText : null,
                sortOrder: 0,
              },
            });
          }
        } else if (existingImage) {
          await tx.productImage.delete({ where: { id: existingImage.id } });
        }

        if (input.categoryId) {
          await tx.productCategory.upsert({
            where: {
              productId_categoryId: {
                productId: input.id,
                categoryId: input.categoryId,
              },
            },
            update: {},
            create: {
              productId: input.id,
              categoryId: input.categoryId,
            },
          });
        }

        return updated;
      });
    }),

  backendBookStock: adminProcedure
    .input(backendBookStockInput)
    .mutation(async ({ ctx, input }) => {
      if (!Number.isFinite(input.quantityDelta) || input.quantityDelta === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Die Menge muss eine gueltige Zahl und ungleich 0 sein.",
        });
      }

      const userId = ctx.session.user.id;

      return ctx.db.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: input.productId },
          data: {
            quantityOnHand: {
              increment: input.quantityDelta,
            },
          },
        });

        const booking = await tx.productStockBooking.create({
          data: {
            productId: input.productId,
            userId,
            quantityDelta: input.quantityDelta,
            supplier: input.supplier,
            note: input.note?.length ? input.note : null,
          },
          select: {
            id: true,
            createdAt: true,
          },
        });

        return booking;
      });
    }),

  backendStockBookings: adminProcedure
    .input(
      z.object({
        productId: z.string().min(1),
        limit: z.number().int().min(1).max(30).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const [bookings, completedOrders] = await Promise.all([
        ctx.db.productStockBooking.findMany({
          where: { productId: input.productId },
          orderBy: { createdAt: "desc" },
          take: input.limit,
          select: {
            id: true,
            quantityDelta: true,
            supplier: true,
            note: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        }),
        ctx.db.orderItem.findMany({
          where: {
            productId: input.productId,
            order: {
              status: "READY_FOR_PICKUP",
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: input.limit,
          select: {
            id: true,
            quantity: true,
            createdAt: true,
            order: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
                createdAt: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        }),
      ]);

      return {
        bookings,
        completedOrders,
      };
    }),
});
