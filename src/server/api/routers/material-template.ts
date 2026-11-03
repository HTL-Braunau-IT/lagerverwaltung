import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

const upsertInput = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(120),
  /** g/cm³ */
  density: z.coerce.number().positive().max(100000),
  /** price per kg */
  pricePerKg: z.coerce.number().min(0).max(1_000_000),
  isActive: z.boolean().default(true),
});

export const materialTemplateRouter = createTRPCRouter({
  // Active templates for the product-form material picker.
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.materialTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, density: true, pricePerKg: true },
    });
  }),

  backendList: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.materialTemplate.findMany({
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        density: true,
        pricePerKg: true,
        isActive: true,
        _count: { select: { products: true } },
      },
    });
  }),

  backendUpsert: adminProcedure.input(upsertInput).mutation(async ({ ctx, input }) => {
    if (input.id) {
      await ctx.db.materialTemplate.update({
        where: { id: input.id },
        data: {
          name: input.name,
          density: input.density,
          pricePerKg: input.pricePerKg,
          isActive: input.isActive,
        },
        select: { id: true },
      });
      return { ok: true as const };
    }
    await ctx.db.materialTemplate.create({
      data: {
        name: input.name,
        density: input.density,
        pricePerKg: input.pricePerKg,
        isActive: input.isActive,
      },
      select: { id: true },
    });
    return { ok: true as const };
  }),

  backendDelete: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const inUse = await ctx.db.product.count({ where: { materialTemplateId: input.id } });
      if (inUse > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Materialvorlage wird von ${inUse} Produkt(en) verwendet und kann nicht gelöscht werden.`,
        });
      }
      await ctx.db.materialTemplate.delete({ where: { id: input.id }, select: { id: true } });
      return { ok: true as const };
    }),
});
