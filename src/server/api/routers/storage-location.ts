import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";

const storageLocationByIdInput = z.object({
  id: z.string().min(1),
});

const backendListStorageLocationsInput = z.object({
  search: z.string().trim().optional(),
  storageRoomId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(300).default(100),
  cursor: z.string().min(1).optional(),
});

const backendCreateStorageLocationInput = z.object({
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  storageRoomId: z.string().min(1),
  description: z.string().trim().max(500).nullable(),
});

const backendUpdateStorageLocationInput = backendCreateStorageLocationInput.extend({
  id: z.string().min(1),
});

const backendDeleteStorageLocationInput = z.object({
  id: z.string().min(1),
});

export const storageLocationRouter = createTRPCRouter({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.storageLocation.findMany({
      orderBy: [{ code: "asc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        storageRoomId: true,
        storageRoom: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            products: true,
          },
        },
      },
    });
  }),

  byId: adminProcedure
    .input(storageLocationByIdInput)
    .query(async ({ ctx, input }) => {
      return ctx.db.storageLocation.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          storageRoomId: true,
          storageRoom: {
            select: {
              id: true,
              name: true,
            },
          },
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              products: true,
            },
          },
        },
      });
    }),

  backendList: adminProcedure
    .input(backendListStorageLocationsInput)
    .query(async ({ ctx, input }) => {
      const search = input.search?.trim();
      const andFilters: Array<Record<string, unknown>> = [];

      if (search) {
        andFilters.push({
          OR: [
            { code: { contains: search, mode: "insensitive" as const } },
            { name: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
            { storageRoom: { name: { contains: search, mode: "insensitive" as const } } },
          ],
        });
      }

      if (input.storageRoomId) {
        andFilters.push({ storageRoomId: input.storageRoomId });
      }

      const where = andFilters.length > 0 ? { AND: andFilters } : undefined;

      const items = await ctx.db.storageLocation.findMany({
        where,
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        orderBy: [{ code: "asc" }, { id: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          storageRoomId: true,
          storageRoom: {
            select: {
              id: true,
              name: true,
            },
          },
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              products: true,
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
    .input(backendCreateStorageLocationInput)
    .mutation(async ({ ctx, input }) => {
      const room = await ctx.db.storageRoom.findUnique({
        where: { id: input.storageRoomId },
        select: { id: true },
      });
      if (!room) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Der ausgewaehlte Lagerraum wurde nicht gefunden.",
        });
      }

      const existingCode = await ctx.db.storageLocation.findFirst({
        where: { code: input.code },
        select: { id: true },
      });
      if (existingCode) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Der Lagerplatz-Code ist bereits vergeben.",
        });
      }

      return ctx.db.storageLocation.create({
        data: {
          code: input.code,
          name: input.name,
          storageRoomId: input.storageRoomId,
          description: input.description?.length ? input.description : null,
        },
        select: {
          id: true,
        },
      });
    }),

  backendUpdate: adminProcedure
    .input(backendUpdateStorageLocationInput)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.storageLocation.findUnique({
        where: { id: input.id },
        select: { id: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lagerplatz wurde nicht gefunden." });
      }

      const room = await ctx.db.storageRoom.findUnique({
        where: { id: input.storageRoomId },
        select: { id: true },
      });
      if (!room) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Der ausgewaehlte Lagerraum wurde nicht gefunden.",
        });
      }

      const conflictingCode = await ctx.db.storageLocation.findFirst({
        where: {
          code: input.code,
          NOT: { id: input.id },
        },
        select: { id: true },
      });
      if (conflictingCode) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Der Lagerplatz-Code ist bereits vergeben.",
        });
      }

      return ctx.db.storageLocation.update({
        where: { id: input.id },
        data: {
          code: input.code,
          name: input.name,
          storageRoomId: input.storageRoomId,
          description: input.description?.length ? input.description : null,
        },
        select: {
          id: true,
        },
      });
    }),

  backendDelete: adminProcedure
    .input(backendDeleteStorageLocationInput)
    .mutation(async ({ ctx, input }) => {
      await ctx.db.storageLocation.delete({
        where: { id: input.id },
        select: { id: true },
      });

      return { ok: true as const };
    }),
});
