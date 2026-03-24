import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";

const storageRoomByIdInput = z.object({
  id: z.string().min(1),
});

const backendListStorageRoomsInput = z.object({
  search: z.string().trim().optional(),
  limit: z.number().int().min(1).max(300).default(100),
  cursor: z.string().min(1).optional(),
});

const backendCreateStorageRoomInput = z.object({
  name: z.string().trim().min(1).max(120),
});

const backendUpdateStorageRoomInput = backendCreateStorageRoomInput.extend({
  id: z.string().min(1),
});

const backendDeleteStorageRoomInput = z.object({
  id: z.string().min(1),
});

export const storageRoomRouter = createTRPCRouter({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.storageRoom.findMany({
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            storageLocations: true,
          },
        },
      },
    });
  }),

  byId: adminProcedure.input(storageRoomByIdInput).query(async ({ ctx, input }) => {
    return ctx.db.storageRoom.findUnique({
      where: { id: input.id },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            storageLocations: true,
          },
        },
      },
    });
  }),

  backendList: adminProcedure
    .input(backendListStorageRoomsInput)
    .query(async ({ ctx, input }) => {
      const search = input.search?.trim();

      const items = await ctx.db.storageRoom.findMany({
        where: search
          ? {
              name: { contains: search, mode: "insensitive" },
            }
          : undefined,
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              storageLocations: true,
            },
          },
        },
      });

      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const nextItem = items.pop();
        nextCursor = nextItem?.id;
      }

      return { items, nextCursor };
    }),

  backendCreate: adminProcedure
    .input(backendCreateStorageRoomInput)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.storageRoom.findFirst({
        where: { name: input.name },
        select: { id: true },
      });
      if (existing) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Der Lagerraum-Name ist bereits vergeben.",
        });
      }

      return ctx.db.storageRoom.create({
        data: {
          name: input.name,
        },
        select: {
          id: true,
        },
      });
    }),

  backendUpdate: adminProcedure
    .input(backendUpdateStorageRoomInput)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.storageRoom.findUnique({
        where: { id: input.id },
        select: { id: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lagerraum wurde nicht gefunden." });
      }

      const conflict = await ctx.db.storageRoom.findFirst({
        where: {
          name: input.name,
          NOT: { id: input.id },
        },
        select: { id: true },
      });
      if (conflict) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Der Lagerraum-Name ist bereits vergeben.",
        });
      }

      return ctx.db.storageRoom.update({
        where: { id: input.id },
        data: {
          name: input.name,
        },
        select: {
          id: true,
        },
      });
    }),

  backendDelete: adminProcedure
    .input(backendDeleteStorageRoomInput)
    .mutation(async ({ ctx, input }) => {
      const locationIds = await ctx.db.storageLocation.findMany({
        where: { storageRoomId: input.id },
        select: { id: true },
      });

      if (locationIds.length > 0) {
        await ctx.db.$transaction(async (tx) => {
          await tx.product.updateMany({
            where: {
              storageLocationId: {
                in: locationIds.map((location) => location.id),
              },
            },
            data: {
              storageLocationId: null,
            },
          });

          await tx.storageLocation.deleteMany({
            where: {
              id: {
                in: locationIds.map((location) => location.id),
              },
            },
          });
        });
      }

      await ctx.db.storageRoom.delete({
        where: { id: input.id },
        select: { id: true },
      });

      return { ok: true as const };
    }),
});
