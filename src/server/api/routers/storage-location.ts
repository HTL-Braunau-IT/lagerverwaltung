import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";

export const storageLocationRouter = createTRPCRouter({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.storageLocation.findMany({
      orderBy: [{ code: "asc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
      },
    });
  }),
});
