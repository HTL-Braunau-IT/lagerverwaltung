import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const categoryByIdInput = z.object({
  id: z.string().min(1),
});

const backendListCategoriesInput = z.object({
  search: z.string().trim().optional(),
  limit: z.number().int().min(1).max(300).default(100),
  cursor: z.string().min(1).optional(),
});

const backendCreateCategoryInput = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().max(160).nullable(),
});

const backendUpdateCategoryInput = backendCreateCategoryInput.extend({
  id: z.string().min(1),
});

const backendDeleteCategoryInput = z.object({
  id: z.string().min(1),
});

function slugifyCategoryName(value: string) {
  const base = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return base || null;
}

async function buildUniqueCategorySlug(
  db: {
    category: {
      findMany: (args: {
        where: { slug: { startsWith: string } };
        select: { slug: true };
      }) => Promise<Array<{ slug: string | null }>>;
      findUnique: (args: {
        where: { id: string };
        select: { slug: true };
      }) => Promise<{ slug: string | null } | null>;
    };
  },
  preferredSlug: string | null,
  categoryIdToIgnore?: string,
) {
  if (!preferredSlug) {
    return null;
  }

  const existing = await db.category.findMany({
    where: { slug: { startsWith: preferredSlug } },
    select: { slug: true },
  });

  const taken = new Set(
    existing
      .map((item) => item.slug)
      .filter((slug): slug is string => Boolean(slug && slug.length > 0)),
  );

  if (!taken.has(preferredSlug)) {
    return preferredSlug;
  }

  if (categoryIdToIgnore) {
    const current = await db.category.findUnique({
      where: { id: categoryIdToIgnore },
      select: { slug: true },
    });
    if (current?.slug === preferredSlug) {
      return preferredSlug;
    }
  }

  for (let i = 2; i < 10_000; i += 1) {
    const candidate = `${preferredSlug}-${i}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Konnte keinen eindeutigen Kategorie-Slug erzeugen.",
  });
}

export const categoryRouter = createTRPCRouter({
  list: publicProcedure.query(async ({ ctx }) => {
    const categories = await ctx.db.category.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        _count: {
          select: {
            products: true,
            productLinks: true,
          },
        },
      },
    });

    return categories.map((category) => ({
      ...category,
      _count: {
        products: Math.max(category._count.products, category._count.productLinks),
      },
    }));
  }),

  byId: publicProcedure.input(categoryByIdInput).query(async ({ ctx, input }) => {
    return ctx.db.category.findUnique({
      where: { id: input.id },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            products: true,
            productLinks: true,
          },
        },
      },
    });
  }),

  backendList: adminProcedure
    .input(backendListCategoriesInput)
    .query(async ({ ctx, input }) => {
      const search = input.search?.trim();

      const items = await ctx.db.category.findMany({
        where: search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { slug: { contains: search, mode: "insensitive" } },
              ],
            }
          : undefined,
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              products: true,
              productLinks: true,
            },
          },
        },
      });

      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const nextItem = items.pop();
        nextCursor = nextItem?.id;
      }

      return {
        items: items.map((category) => ({
          ...category,
          _count: {
            products: Math.max(category._count.products, category._count.productLinks),
          },
        })),
        nextCursor,
      };
    }),

  backendCreate: adminProcedure
    .input(backendCreateCategoryInput)
    .mutation(async ({ ctx, input }) => {
      const explicitSlug = input.slug?.length ? slugifyCategoryName(input.slug) : null;
      const generatedFromName = slugifyCategoryName(input.name);
      const preferredSlug = explicitSlug ?? generatedFromName;
      const slug = await buildUniqueCategorySlug(ctx.db, preferredSlug);

      return ctx.db.category.create({
        data: {
          name: input.name,
          slug,
        },
        select: {
          id: true,
        },
      });
    }),

  backendUpdate: adminProcedure
    .input(backendUpdateCategoryInput)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.category.findUnique({
        where: { id: input.id },
        select: { id: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Kategorie wurde nicht gefunden." });
      }

      const explicitSlug = input.slug?.length ? slugifyCategoryName(input.slug) : null;
      const generatedFromName = slugifyCategoryName(input.name);
      const preferredSlug = explicitSlug ?? generatedFromName;
      const slug = await buildUniqueCategorySlug(ctx.db, preferredSlug, input.id);

      return ctx.db.category.update({
        where: { id: input.id },
        data: {
          name: input.name,
          slug,
        },
        select: {
          id: true,
        },
      });
    }),

  backendDelete: adminProcedure
    .input(backendDeleteCategoryInput)
    .mutation(async ({ ctx, input }) => {
      await ctx.db.category.delete({
        where: { id: input.id },
        select: { id: true },
      });

      return { ok: true as const };
    }),
});
