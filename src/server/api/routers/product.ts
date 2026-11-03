import { rm, stat } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { adminProcedure, createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { getQuantityStepForBaseUnit, isQuantityAlignedToStep } from "~/lib/quantity-rules";
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

const backendCategoryCountsInput = z.object({
  search: z.string().trim().optional(),
  storageRoomId: z.string().min(1).optional(),
  storageLocationId: z.string().min(1).optional(),
});

const baseUnitSchema = z.enum(["PCS", "MM", "CM", "M", "CM2", "DM2", "MM2", "M2", "G", "KG", "ML", "L"]);
type BaseUnitValue = z.infer<typeof baseUnitSchema>;

// Prices are stored as Decimal(12,2); more than two decimals would be silently
// truncated on save (e.g. 0.00048 -> 0.00). Reject that up front with a clear
// message instead of reporting a false success (#117).
const priceSchema = z.coerce
  .number()
  .min(0)
  .refine((value) => Math.abs(value - Math.round(value * 100) / 100) < 1e-9, {
    message: "Der Preis darf höchstens zwei Nachkommastellen haben.",
  });

function normalizeBaseUnit(baseUnit: BaseUnitValue): BaseUnitValue {
  return baseUnit === "CM2" ? "DM2" : baseUnit;
}

const updateProductInput = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  sku: z.string().trim().min(1),
  description: z.string().trim().nullable(),
  price: priceSchema,
  minimumQuantity: z.coerce.number().min(0),
  unitKind: z.enum(["PIECE", "LENGTH", "AREA", "WEIGHT", "VOLUME"]),
  baseUnit: baseUnitSchema,
  unitStep: z.coerce.number().gt(0),
  isVisible: z.boolean(),
  categoryIds: z
    .array(z.string().min(1))
    .min(1, { message: "Bitte mindestens eine Kategorie auswählen." }),
  storageLocationId: z.string().min(1).nullable(),
  compartment: z.string().trim().max(120).nullable(),
  /** When set, `imageUrl` / `imageAltText` update this row only; omit to leave images unchanged. */
  editingImageId: z.string().min(1).optional(),
  imageUrl: z.string().trim().nullable().refine((value) => value === null || isValidImageUrl(value), {
    message: "Invalid URL",
  }),
  imageAltText: z.string().trim().nullable(),
});

const createProductInput = z.object({
  name: z.string().trim().min(1),
  sku: z.string().trim().min(1),
  description: z.string().trim().nullable(),
  price: priceSchema,
  minimumQuantity: z.coerce.number().min(0),
  startingQuantity: z.coerce.number().min(0),
  unitKind: z.enum(["PIECE", "LENGTH", "AREA", "WEIGHT", "VOLUME"]),
  baseUnit: baseUnitSchema,
  unitStep: z.coerce.number().gt(0),
  isVisible: z.boolean().default(true),
  categoryIds: z
    .array(z.string().min(1))
    .min(1, { message: "Bitte mindestens eine Kategorie auswählen." }),
  storageLocationId: z.string().min(1).nullable(),
  compartment: z.string().trim().max(120).nullable(),
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

function assertQuantityOnStep(quantity: number, baseUnit: string, label: string) {
  const step = getQuantityStepForBaseUnit(baseUnit);
  if (!isQuantityAlignedToStep(quantity, step)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${label} muss in ${step.toLocaleString("de-AT")}er-Schritten angegeben werden.`,
    });
  }
}

function assertProductQuantitiesAreValid(input: {
  baseUnit: BaseUnitValue;
  unitStep: number;
  minimumQuantity: number;
  startingQuantity?: number;
}) {
  const normalizedBaseUnit = normalizeBaseUnit(input.baseUnit);
  const expectedStep = getQuantityStepForBaseUnit(normalizedBaseUnit);
  if (input.unitStep !== expectedStep) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Schrittweite für ${normalizedBaseUnit} muss ${expectedStep.toLocaleString("de-AT")} sein.`,
    });
  }
  assertQuantityOnStep(input.minimumQuantity, normalizedBaseUnit, "Mindestbestand");
  if (input.startingQuantity !== undefined) {
    assertQuantityOnStep(input.startingQuantity, normalizedBaseUnit, "Startbestand");
  }
}

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
    const availableWhere = { AND: [where, { quantityOnHand: { gt: 0 } }] };
    const [items, filteredAvailableCount, totalAvailableCount] = await Promise.all([
      ctx.db.product.findMany({
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
          compartment: true,
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
            select: {
              id: true,
              url: true,
              altText: true,
            },
          },
        },
      }),
      input.cursor
        ? Promise.resolve<number | undefined>(undefined)
        : ctx.db.product.count({
            where: availableWhere,
          }),
      input.cursor
        ? Promise.resolve<number | undefined>(undefined)
        : ctx.db.product.count({
            where: { AND: [{ isVisible: true }, { quantityOnHand: { gt: 0 } }] },
          }),
    ]);

    let nextCursor: string | undefined;
    if (items.length > input.limit) {
      const next = items.pop();
      nextCursor = next?.id;
    }

    return {
      items: items.map((item) => ({ ...item, baseUnit: normalizeBaseUnit(item.baseUnit) })),
      nextCursor,
      filteredAvailableCount,
      totalAvailableCount,
    };
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
        baseUnit: normalizeBaseUnit(product.baseUnit),
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
          compartment: true,
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
          baseUnit: normalizeBaseUnit(item.baseUnit),
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

  backendCategoryCounts: adminProcedure
    .input(backendCategoryCountsInput)
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

      const [products, categories] = await Promise.all([
        ctx.db.product.findMany({
          where,
          select: {
            id: true,
            categoryId: true,
            categories: {
              select: {
                categoryId: true,
              },
            },
          },
        }),
        ctx.db.category.findMany({
          select: {
            id: true,
            name: true,
          },
          orderBy: [{ name: "asc" }, { id: "asc" }],
        }),
      ]);

      const countsById = new Map<string, number>();
      for (const category of categories) {
        countsById.set(category.id, 0);
      }

      for (const product of products) {
        const membershipIds = new Set(
          [...product.categories.map((entry) => entry.categoryId), product.categoryId].filter(
            (categoryId): categoryId is string => Boolean(categoryId),
          ),
        );
        for (const categoryId of membershipIds) {
          countsById.set(categoryId, (countsById.get(categoryId) ?? 0) + 1);
        }
      }

      return categories.map((category) => ({
        id: category.id,
        name: category.name,
        productCount: countsById.get(category.id) ?? 0,
      }));
    }),

  backendUpdate: adminProcedure
    .input(updateProductInput)
    .mutation(async ({ ctx, input }) => {
      const normalizedBaseUnit = normalizeBaseUnit(input.baseUnit);
      assertProductQuantitiesAreValid({
        baseUnit: normalizedBaseUnit,
        unitStep: input.unitStep,
        minimumQuantity: input.minimumQuantity,
      });
      const primaryCategoryId = input.categoryIds[0];
      if (!primaryCategoryId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bitte mindestens eine Kategorie auswählen.",
        });
      }
      const access = await getStorageRoomAccessForUser(ctx.db, ctx.session.user.id);
      await assertProductsAccessibleByRoomAccess(ctx.db, access, [input.id]);

      if (!input.storageLocationId && !access.hasAllStorageRoomAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Produkte müssen einem erlaubten Lagerraum zugeordnet sein.",
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
            message: "Ausgewählter Lagerplatz existiert nicht.",
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
            baseUnit: normalizedBaseUnit,
            unitStep: input.unitStep,
            isVisible: input.isVisible,
            categoryId: primaryCategoryId,
            storageLocationId: input.storageLocationId,
            compartment: input.compartment,
          },
          select: {
            id: true,
          },
        });

        if (input.editingImageId && input.imageUrl?.trim()) {
          const target = await tx.productImage.findFirst({
            where: { id: input.editingImageId, productId: input.id },
            select: { id: true },
          });
          if (target) {
            await tx.productImage.update({
              where: { id: target.id },
              data: {
                url: input.imageUrl.trim(),
                altText: input.imageAltText?.length ? input.imageAltText : null,
              },
            });
          }
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
      const normalizedBaseUnit = normalizeBaseUnit(input.baseUnit);
      assertProductQuantitiesAreValid({
        baseUnit: normalizedBaseUnit,
        unitStep: input.unitStep,
        minimumQuantity: input.minimumQuantity,
        startingQuantity: input.startingQuantity,
      });
      const primaryCategoryId = input.categoryIds[0];
      if (!primaryCategoryId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bitte mindestens eine Kategorie auswählen.",
        });
      }
      const access = await getStorageRoomAccessForUser(ctx.db, ctx.session.user.id);

      if (!input.storageLocationId && !access.hasAllStorageRoomAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Produkte müssen einem erlaubten Lagerraum zugeordnet sein.",
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
            message: "Ausgewählter Lagerplatz existiert nicht.",
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
            baseUnit: normalizedBaseUnit,
            unitStep: input.unitStep,
            isVisible: input.isVisible,
            categoryId: primaryCategoryId,
            storageLocationId: input.storageLocationId,
            compartment: input.compartment,
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

  backendAddProductImage: adminProcedure
    .input(
      z.object({
        productId: z.string().min(1),
        url: z.string().trim().min(1).refine((value) => isValidImageUrl(value), {
          message: "Invalid URL",
        }),
        altText: z.string().trim().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const access = await getStorageRoomAccessForUser(ctx.db, ctx.session.user.id);
      await assertProductsAccessibleByRoomAccess(ctx.db, access, [input.productId]);

      const maxSort = await ctx.db.productImage.aggregate({
        where: { productId: input.productId },
        _max: { sortOrder: true },
      });
      const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

      const created = await ctx.db.productImage.create({
        data: {
          productId: input.productId,
          url: input.url,
          altText: input.altText?.length ? input.altText : null,
          sortOrder,
        },
        select: {
          id: true,
          url: true,
          altText: true,
          sortOrder: true,
        },
      });

      return created;
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
          message: "Die Menge muss eine gültige Zahl und ungleich 0 sein.",
        });
      }

      const userId = ctx.session.user.id;
      const access = await getStorageRoomAccessForUser(ctx.db, userId);
      await assertProductsAccessibleByRoomAccess(ctx.db, access, [input.productId]);

      const product = await ctx.db.product.findUnique({
        where: { id: input.productId },
        select: { id: true, baseUnit: true },
      });
      if (!product) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Produkt wurde nicht gefunden.",
        });
      }
      assertQuantityOnStep(input.quantityDelta, product.baseUnit, "Menge");

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
