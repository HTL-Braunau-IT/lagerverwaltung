import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";
import { getStorageRoomAccessForUser, orderRoomWhereForAccess } from "~/server/api/routers/utils/storage-access";

const backendListInput = z.object({
  search: z.string().trim().optional(),
  storageRoomId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(300).default(100),
});

const backendCreateInput = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().nullable(),
  quantityOnHand: z.coerce.number().int().min(0),
  isVisible: z.boolean().default(true),
  storageRoomId: z.string().min(1),
  imageUrl: z.string().trim().nullable(),
  imageAltText: z.string().trim().nullable(),
});

const backendUpdateInput = backendCreateInput.extend({
  id: z.string().min(1),
});

const backendDeleteInput = z.object({
  id: z.string().min(1),
});

export const lendableItemRouter = createTRPCRouter({
  backendList: adminProcedure.input(backendListInput).query(async ({ ctx, input }) => {
    const access = await getStorageRoomAccessForUser(ctx.db, ctx.session.user.id);
    const roomWhere = orderRoomWhereForAccess(access);
    const search = input.search?.trim();

    const items = await ctx.db.lendableItem.findMany({
      where: {
        ...(roomWhere ?? {}),
        ...(input.storageRoomId ? { storageRoomId: input.storageRoomId } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: input.limit,
      select: {
        id: true,
        name: true,
        description: true,
        quantityOnHand: true,
        isVisible: true,
        storageRoomId: true,
        storageRoom: { select: { id: true, name: true } },
        images: {
          orderBy: { sortOrder: "asc" },
          take: 1,
          select: { id: true, url: true, altText: true },
        },
      },
    });

    return items.map((item) => ({
      ...item,
      images: item.images.map((image) => ({
        ...image,
        url: image.url.startsWith("/data/uploads/lendable-items/")
          ? `/api/backend/lendable-items/image/${item.id}`
          : image.url,
      })),
    }));
  }),

  backendCreate: adminProcedure.input(backendCreateInput).mutation(async ({ ctx, input }) => {
    const access = await getStorageRoomAccessForUser(ctx.db, ctx.session.user.id);
    if (!access.hasAllStorageRoomAccess && !access.allowedStorageRoomIds.includes(input.storageRoomId)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Kein Zugriff auf diesen Lagerraum." });
    }

    return ctx.db.lendableItem.create({
      data: {
        name: input.name,
        description: input.description || null,
        quantityOnHand: input.quantityOnHand,
        isVisible: input.isVisible,
        storageRoomId: input.storageRoomId,
        images: input.imageUrl
          ? {
              create: [
                {
                  url: input.imageUrl,
                  altText: input.imageAltText || null,
                  sortOrder: 0,
                },
              ],
            }
          : undefined,
      },
      select: { id: true },
    });
  }),

  backendUpdate: adminProcedure.input(backendUpdateInput).mutation(async ({ ctx, input }) => {
    const access = await getStorageRoomAccessForUser(ctx.db, ctx.session.user.id);
    if (!access.hasAllStorageRoomAccess && !access.allowedStorageRoomIds.includes(input.storageRoomId)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Kein Zugriff auf diesen Lagerraum." });
    }

    const existing = await ctx.db.lendableItem.findUnique({
      where: { id: input.id },
      select: { id: true },
    });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Artikel wurde nicht gefunden." });

    return ctx.db.$transaction(async (tx) => {
      if (input.imageUrl) {
        await tx.lendableItemImage.deleteMany({ where: { lendableItemId: input.id } });
      } else {
        await tx.lendableItemImage.deleteMany({ where: { lendableItemId: input.id } });
      }

      await tx.lendableItem.update({
        where: { id: input.id },
        data: {
          name: input.name,
          description: input.description || null,
          quantityOnHand: input.quantityOnHand,
          isVisible: input.isVisible,
          storageRoomId: input.storageRoomId,
        },
      });

      if (input.imageUrl) {
        await tx.lendableItemImage.create({
          data: {
            lendableItemId: input.id,
            url: input.imageUrl,
            altText: input.imageAltText || null,
            sortOrder: 0,
          },
        });
      }

      return { id: input.id };
    });
  }),

  backendDelete: adminProcedure.input(backendDeleteInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.db.lendableItem.findUnique({
      where: { id: input.id },
      select: { id: true },
    });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Artikel wurde nicht gefunden." });

    await ctx.db.lendableItem.delete({ where: { id: input.id } });
    return { id: input.id };
  }),
});

