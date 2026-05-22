import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";

const byIdInput = z.object({
  id: z.string().min(1),
});

const backendListInput = z.object({
  search: z.string().trim().optional(),
  isActive: z.boolean().optional(),
  limit: z.number().int().min(1).max(300).default(100),
  cursor: z.string().min(1).optional(),
});

const backendCreateInput = z.object({
  code: z.string().trim().min(1).max(180),
  name: z.string().trim().min(1).max(180),
});

const backendUpdateInput = backendCreateInput.extend({
  id: z.string().min(1),
  isActive: z.boolean().optional(),
});

const backendDeleteInput = z.object({
  id: z.string().min(1),
});

export const costCenterRouter = createTRPCRouter({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.costCenter.findMany({
      orderBy: [{ code: "asc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        _count: {
          select: {
            orders: true,
          },
        },
      },
    });
  }),

  byId: adminProcedure.input(byIdInput).query(async ({ ctx, input }) => {
    return ctx.db.costCenter.findUnique({
      where: { id: input.id },
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            orders: true,
          },
        },
      },
    });
  }),

  backendList: adminProcedure.input(backendListInput).query(async ({ ctx, input }) => {
    const search = input.search?.trim();
    const items = await ctx.db.costCenter.findMany({
      where: {
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(search
          ? {
              OR: [
                { code: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      orderBy: [{ code: "asc" }, { id: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            orders: true,
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

  backendCreate: adminProcedure.input(backendCreateInput).mutation(async ({ ctx, input }) => {
    const conflict = await ctx.db.costCenter.findFirst({
      where: {
        OR: [{ code: input.code }, { name: input.name }],
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });
    if (conflict) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          conflict.code === input.code
            ? "Der Kostenstellen-Code ist bereits vergeben."
            : "Der Kostenstellen-Name ist bereits vergeben.",
      });
    }

    return ctx.db.costCenter.create({
      data: {
        code: input.code,
        name: input.name,
      },
      select: {
        id: true,
      },
    });
  }),

  backendUpdate: adminProcedure.input(backendUpdateInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.db.costCenter.findUnique({
      where: { id: input.id },
      select: { id: true },
    });
    if (!existing) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Kostenstelle wurde nicht gefunden." });
    }

    const conflict = await ctx.db.costCenter.findFirst({
      where: {
        OR: [{ code: input.code }, { name: input.name }],
        NOT: { id: input.id },
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });
    if (conflict) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          conflict.code === input.code
            ? "Der Kostenstellen-Code ist bereits vergeben."
            : "Der Kostenstellen-Name ist bereits vergeben.",
      });
    }

    return ctx.db.costCenter.update({
      where: { id: input.id },
      data: {
        code: input.code,
        name: input.name,
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: {
        id: true,
      },
    });
  }),

  backendDelete: adminProcedure.input(backendDeleteInput).mutation(async ({ ctx, input }) => {
    const usage = await ctx.db.order.findFirst({
      where: { costCenterId: input.id },
      select: { id: true },
    });
    if (usage) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Kostenstelle kann nicht geloescht werden, weil bereits Bestellungen existieren.",
      });
    }

    await ctx.db.costCenter.delete({
      where: { id: input.id },
      select: { id: true },
    });

    return { ok: true as const };
  }),
});
