import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, createTRPCRouter, publicProcedure, teacherProcedure } from "~/server/api/trpc";

const partListItemInput = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive(),
});

const backendByIdInput = z.object({
  id: z.string().min(1),
});
const byIdForShopInput = z.object({
  id: z.string().min(1),
});

const backendListInput = z.object({
  search: z.string().trim().optional(),
  limit: z.number().int().min(1).max(300).default(100),
});

const backendCreateInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable(),
  items: z.array(partListItemInput).min(1),
});

const backendUpdateInput = backendCreateInput.extend({
  id: z.string().min(1),
});

const backendDeleteInput = z.object({
  id: z.string().min(1),
});

const backendClearImageInput = z.object({
  id: z.string().min(1),
});

const togglePinnedInput = z.object({
  partListId: z.string().min(1),
});

function normalizePartListImageUrl(partListId: string, imageUrl: string | null) {
  if (!imageUrl) return null;
  return `/api/backend/parts-list/image/${partListId}`;
}

function normalizePartListDocumentUrl(documentId: string) {
  return `/api/backend/parts-list/document/${documentId}`;
}

function ensureUniqueProducts(items: Array<{ productId: string }>) {
  const ids = items.map((item) => item.productId);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Jedes Produkt darf nur einmal in einer Teileliste vorkommen.",
    });
  }
}

async function ensureProductsExist(
  db: {
    product: {
      findMany: (args: {
        where: { id: { in: string[] } };
        select: { id: true };
      }) => Promise<Array<{ id: string }>>;
    };
  },
  items: Array<{ productId: string }>,
) {
  const ids = [...new Set(items.map((item) => item.productId))];
  const existing = await db.product.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (existing.length !== ids.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Mindestens ein ausgewaehltes Produkt existiert nicht mehr.",
    });
  }
}

export const partsListRouter = createTRPCRouter({
  listForShop: publicProcedure.query(async ({ ctx }) => {
    const lists = await ctx.db.partList.findMany({
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        imageUrl: true,
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
                quantityOnHand: true,
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
    return lists.map((list) => ({
      ...list,
      imageUrl: normalizePartListImageUrl(list.id, list.imageUrl),
      documents: list.documents.map((document) => ({
        ...document,
        url: normalizePartListDocumentUrl(document.id),
      })),
    }));
  }),
  pinnedForUser: teacherProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const pins = await ctx.db.userPinnedPartList.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { partListId: true },
    });
    return pins.map((pin) => pin.partListId);
  }),
  togglePinned: teacherProcedure.input(togglePinnedInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const existingPartList = await ctx.db.partList.findUnique({
      where: { id: input.partListId },
      select: { id: true },
    });
    if (!existingPartList) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Teileliste wurde nicht gefunden." });
    }

    const existing = await ctx.db.userPinnedPartList.findUnique({
      where: {
        userId_partListId: {
          userId,
          partListId: input.partListId,
        },
      },
      select: { id: true },
    });

    if (existing) {
      await ctx.db.userPinnedPartList.delete({
        where: { id: existing.id },
        select: { id: true },
      });
      return { pinned: false as const };
    }

    await ctx.db.userPinnedPartList.create({
      data: { userId, partListId: input.partListId },
      select: { id: true },
    });
    return { pinned: true as const };
  }),
  byIdForShop: publicProcedure.input(byIdForShopInput).query(async ({ ctx, input }) => {
    const partList = await ctx.db.partList.findUnique({
      where: { id: input.id },
      select: {
        id: true,
        name: true,
        description: true,
        imageUrl: true,
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
                quantityOnHand: true,
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
    if (!partList) return null;
    return {
      ...partList,
      imageUrl: normalizePartListImageUrl(partList.id, partList.imageUrl),
      documents: partList.documents.map((document) => ({
        ...document,
        url: normalizePartListDocumentUrl(document.id),
      })),
    };
  }),

  backendList: adminProcedure.input(backendListInput).query(async ({ ctx, input }) => {
    const search = input.search?.trim();
    const lists = await ctx.db.partList.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: input.limit,
      select: {
        id: true,
        name: true,
        description: true,
        imageUrl: true,
        createdAt: true,
        updatedAt: true,
        documents: {
          select: {
            id: true,
          },
        },
        items: {
          select: {
            id: true,
          },
        },
      },
    });
    return lists.map((list) => ({
      ...list,
      imageUrl: normalizePartListImageUrl(list.id, list.imageUrl),
    }));
  }),

  backendById: adminProcedure.input(backendByIdInput).query(async ({ ctx, input }) => {
    const partList = await ctx.db.partList.findUnique({
      where: { id: input.id },
      select: {
        id: true,
        name: true,
        description: true,
        imageUrl: true,
        createdAt: true,
        updatedAt: true,
        documents: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            fileName: true,
            originalName: true,
            url: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
        },
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
                sku: true,
                baseUnit: true,
                quantityOnHand: true,
              },
            },
          },
        },
      },
    });
    if (!partList) return null;
    return {
      ...partList,
      imageUrl: normalizePartListImageUrl(partList.id, partList.imageUrl),
      documents: partList.documents.map((document) => ({
        ...document,
        url: normalizePartListDocumentUrl(document.id),
      })),
    };
  }),

  backendCreate: adminProcedure.input(backendCreateInput).mutation(async ({ ctx, input }) => {
    ensureUniqueProducts(input.items);
    await ensureProductsExist(ctx.db, input.items);

    return ctx.db.partList.create({
      data: {
        name: input.name,
        description: input.description?.length ? input.description : null,
        items: {
          createMany: {
            data: input.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
          },
        },
      },
      select: {
        id: true,
      },
    });
  }),

  backendUpdate: adminProcedure.input(backendUpdateInput).mutation(async ({ ctx, input }) => {
    ensureUniqueProducts(input.items);
    await ensureProductsExist(ctx.db, input.items);

    return ctx.db.$transaction(async (tx) => {
      const existing = await tx.partList.findUnique({
        where: { id: input.id },
        select: { id: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Teileliste wurde nicht gefunden." });
      }

      await tx.partList.update({
        where: { id: input.id },
        data: {
          name: input.name,
          description: input.description?.length ? input.description : null,
          items: {
            deleteMany: {},
            createMany: {
              data: input.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
              })),
            },
          },
        },
        select: { id: true },
      });

      return { ok: true as const };
    });
  }),

  backendDelete: adminProcedure.input(backendDeleteInput).mutation(async ({ ctx, input }) => {
    await ctx.db.partList.delete({
      where: { id: input.id },
      select: { id: true },
    });
    return { ok: true as const };
  }),

  backendClearImage: adminProcedure.input(backendClearImageInput).mutation(async ({ ctx, input }) => {
    await ctx.db.partList.update({
      where: { id: input.id },
      data: { imageUrl: null },
      select: { id: true },
    });
    return { ok: true as const };
  }),
});
