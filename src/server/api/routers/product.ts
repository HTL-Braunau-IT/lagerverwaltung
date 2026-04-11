import { rm, stat } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { adminProcedure, createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  assertProductsAccessibleByRoomAccess,
  assertStorageRoomAllowed,
  getStorageRoomAccessForUser,
  productRoomWhereForAccess,
} from "~/server/api/routers/utils/storage-access";

function isValidImageUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith("/")) return true;
  return z.string().url().safeParse(trimmed).success;
}

function normalizeProductDocumentUrl(documentId: string) {
  return `/api/backend/products/document/${documentId}`;
}

/** Local files under `public/` only; used for size display and safe deletion. */
function safePublicFilePathFromProductImageUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed.startsWith("/data/uploads/pictures/") || trimmed.includes("..")) {
    return null;
  }
  return path.join(process.cwd(), "public", trimmed.replace(/^\//, ""));
}

async function fileSizeBytesForPublicProductImageUrl(url: string): Promise<number | null> {
  const filePath = safePublicFilePathFromProductImageUrl(url);
  if (!filePath) return null;
  try {
    const s = await stat(filePath);
    return s.isFile() ? s.size : null;
  } catch {
    return null;
  }
}

const listProductsInput = z.object({
  search: z.string().trim().optional(),
  categoryId: z.string().min(1).optional(),
  storageLocationId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(24),
  cursor: z.string().min(1).optional(),
});

const backendListProductsInput = z.object({
  search: z.string().trim().optional(),
  categoryId: z.string().min(1).optional(),
  storageRoomId: z.string().min(1).optional(),
  storageLocationId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(300).default(100),
  cursor: z.string().min(1).optional(),
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
  isVisible: z.boolean(),
  categoryIds: z.array(z.string().min(1)).default([]),
  storageLocationId: z.string().min(1).nullable(),
  imageUrl: z.string().trim().nullable().refine((value) => value === null || isValidImageUrl(value), {
    message: "Invalid URL",
  }),
  imageAltText: z.string().trim().nullable(),
});

const createProductInput = z.object({
  name: z.string().trim().min(1),
  sku: z.string().trim().min(1),
  description: z.string().trim().nullable(),
  price: z.coerce.number().min(0),
  minimumQuantity: z.coerce.number().min(0),
  startingQuantity: z.coerce.number().min(0),
  unitKind: z.enum(["PIECE", "LENGTH", "AREA", "WEIGHT", "VOLUME"]),
  baseUnit: z.enum(["PCS", "MM", "CM", "M", "CM2", "M2", "G", "KG", "ML", "L"]),
  unitStep: z.coerce.number().gt(0),
  isVisible: z.boolean().default(true),
  categoryIds: z.array(z.string().min(1)).default([]),
  storageLocationId: z.string().min(1).nullable(),
  imageUrl: z.string().trim().nullable().refine((value) => value === null || isValidImageUrl(value), {
    message: "Invalid URL",
  }),
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
    if (input.storageLocationId) {
      andFilters.push({ storageLocationId: input.storageLocationId });
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
    const where =
      andFilters.length > 0 ? { AND: [{ isVisible: true }, ...andFilters] } : { isVisible: true };

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
        isVisible: true,
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
            storageRoom: {
              select: {
                id: true,
                name: true,
              },
            },
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
      const product = await ctx.db.product.findFirst({
        where: { id: input.id, isVisible: true },
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
          isVisible: true,
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          categories: {
            select: {
              categoryId: true,
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
          documents: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: {
              id: true,
              originalName: true,
              url: true,
              mimeType: true,
              sizeBytes: true,
            },
          },
        },
      });
      if (!product) return null;
      return {
        ...product,
        documents: product.documents.map((document) => ({
          ...document,
          url: normalizeProductDocumentUrl(document.id),
        })),
      };
    }),

  backendList: adminProcedure
    .input(backendListProductsInput)
    .query(async ({ ctx, input }) => {
      const access = await getStorageRoomAccessForUser(ctx.db, ctx.session.user.id);
      const search = input.search?.trim();
      const andFilters: Array<Record<string, unknown>> = [];
      const roomWhere = productRoomWhereForAccess(access);

      if (search) {
        andFilters.push({
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { sku: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
          ],
        });
      }
      if (input.categoryId) {
        andFilters.push({
          OR: [
            { categoryId: input.categoryId },
            { categories: { some: { categoryId: input.categoryId } } },
          ],
        });
      }
      if (input.storageRoomId) {
        andFilters.push({ storageLocation: { storageRoomId: input.storageRoomId } });
      }
      if (input.storageLocationId) {
        andFilters.push({ storageLocationId: input.storageLocationId });
      }
      if (roomWhere) {
        andFilters.push(roomWhere);
      }
      const where = andFilters.length > 0 ? { AND: andFilters } : undefined;

      const items = await ctx.db.product.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
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
          isVisible: true,
          categoryId: true,
          storageLocationId: true,
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          categories: {
            select: {
              categoryId: true,
            },
          },
          storageLocation: {
            select: {
              id: true,
              code: true,
              name: true,
              storageRoomId: true,
            },
          },
          images: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              url: true,
              altText: true,
            },
          },
          documents: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: {
              id: true,
              originalName: true,
              url: true,
              mimeType: true,
              sizeBytes: true,
              createdAt: true,
            },
          },
        },
      });

      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const nextItem = items.pop();
        nextCursor = nextItem?.id;
      }

      const enrichedItems = await Promise.all(
        items.map(async (item) => ({
          ...item,
          images: await Promise.all(
            item.images.map(async (image) => ({
              ...image,
              sizeBytes: await fileSizeBytesForPublicProductImageUrl(image.url),
            })),
          ),
          documents: item.documents.map((document) => ({
            ...document,
            url: normalizeProductDocumentUrl(document.id),
          })),
        })),
      );

      return {
        items: enrichedItems,
        nextCursor,
      };
    }),

  backendUpdate: adminProcedure
    .input(updateProductInput)
    .mutation(async ({ ctx, input }) => {
      const access = await getStorageRoomAccessForUser(ctx.db, ctx.session.user.id);
      await assertProductsAccessibleByRoomAccess(ctx.db, access, [input.id]);

      if (!input.storageLocationId && !access.hasAllStorageRoomAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Produkte muessen einem erlaubten Lagerraum zugeordnet sein.",
        });
      }

      if (input.storageLocationId) {
        const location = await ctx.db.storageLocation.findUnique({
          where: { id: input.storageLocationId },
          select: { id: true, storageRoomId: true },
        });
        if (!location) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Ausgewaehlter Lagerplatz existiert nicht.",
          });
        }
        assertStorageRoomAllowed(access, location.storageRoomId);
      }

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
            isVisible: input.isVisible,
            categoryId: input.categoryIds[0] ?? null,
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

        await tx.productCategory.deleteMany({
          where: {
            productId: input.id,
            ...(input.categoryIds.length > 0
              ? { categoryId: { notIn: input.categoryIds } }
              : {}),
          },
        });
        if (input.categoryIds.length > 0) {
          await tx.productCategory.createMany({
            data: input.categoryIds.map((categoryId) => ({
              productId: input.id,
              categoryId,
            })),
            skipDuplicates: true,
          });
        }

        return updated;
      });
    }),

  backendCreate: adminProcedure
    .input(createProductInput)
    .mutation(async ({ ctx, input }) => {
      const access = await getStorageRoomAccessForUser(ctx.db, ctx.session.user.id);

      if (!input.storageLocationId && !access.hasAllStorageRoomAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Produkte muessen einem erlaubten Lagerraum zugeordnet sein.",
        });
      }

      if (input.storageLocationId) {
        const location = await ctx.db.storageLocation.findUnique({
          where: { id: input.storageLocationId },
          select: { id: true, storageRoomId: true },
        });
        if (!location) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Ausgewaehlter Lagerplatz existiert nicht.",
          });
        }
        assertStorageRoomAllowed(access, location.storageRoomId);
      }

      return ctx.db.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            name: input.name,
            sku: input.sku,
            description: input.description,
            price: input.price,
            minimumQuantity: input.minimumQuantity,
            quantityOnHand: input.startingQuantity,
            unitKind: input.unitKind,
            baseUnit: input.baseUnit,
            unitStep: input.unitStep,
            isVisible: input.isVisible,
            categoryId: input.categoryIds[0] ?? null,
            storageLocationId: input.storageLocationId,
          },
          select: {
            id: true,
          },
        });

        if (input.imageUrl) {
          await tx.productImage.create({
            data: {
              productId: created.id,
              url: input.imageUrl,
              altText: input.imageAltText?.length ? input.imageAltText : null,
              sortOrder: 0,
            },
          });
        }

        if (input.categoryIds.length > 0) {
          await tx.productCategory.createMany({
            data: input.categoryIds.map((categoryId) => ({
              productId: created.id,
              categoryId,
            })),
            skipDuplicates: true,
          });
        }

        return created;
      });
    }),

  backendDeleteProductImage: adminProcedure
    .input(
      z.object({
        productId: z.string().min(1),
        imageId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const access = await getStorageRoomAccessForUser(ctx.db, ctx.session.user.id);
      await assertProductsAccessibleByRoomAccess(ctx.db, access, [input.productId]);

      const image = await ctx.db.productImage.findFirst({
        where: { id: input.imageId, productId: input.productId },
        select: { id: true, url: true },
      });
      if (!image) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bild wurde nicht gefunden.",
        });
      }

      const filePath = safePublicFilePathFromProductImageUrl(image.url);

      await ctx.db.productImage.delete({
        where: { id: image.id },
        select: { id: true },
      });

      if (filePath) {
        try {
          await rm(filePath, { force: true });
        } catch {
          // File may already be missing; DB row is already removed.
        }
      }

      return { ok: true as const };
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
      const access = await getStorageRoomAccessForUser(ctx.db, userId);
      await assertProductsAccessibleByRoomAccess(ctx.db, access, [input.productId]);

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
      const access = await getStorageRoomAccessForUser(ctx.db, ctx.session.user.id);
      await assertProductsAccessibleByRoomAccess(ctx.db, access, [input.productId]);

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
