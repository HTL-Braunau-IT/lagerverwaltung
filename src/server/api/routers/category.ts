import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

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
});
