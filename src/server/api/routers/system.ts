import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";

export const systemRouter = createTRPCRouter({
  dbInfo: adminProcedure.query(async ({ ctx }) => {
    const databaseNameRows = await ctx.db.$queryRaw<Array<{ db: string }>>`
      SELECT current_database() AS db
    `;
    const versionRows = await ctx.db.$queryRaw<Array<{ version: string }>>`
      SELECT version() AS version
    `;

    const fullVersion = versionRows[0]?.version ?? null;
    const shortVersion = fullVersion
      ? // Example: "PostgreSQL 16.2 (Debian 16.2-1.pgdg120+1) ..."
        (() => {
          const m = /^PostgreSQL\s+([0-9]+(?:\.[0-9]+)?)/i.exec(fullVersion);
          return m ? `PostgreSQL ${m[1]}` : fullVersion;
        })()
      : null;

    return {
      databaseName: databaseNameRows[0]?.db ?? null,
      version: fullVersion,
      versionShort: shortVersion,
    };
  }),

  dbHealth: adminProcedure.query(async ({ ctx }) => {
    const start = performance.now();

    try {
      await ctx.db.$queryRaw`SELECT 1`;
    } catch (err) {
      const end = performance.now();
      return {
        healthy: false as const,
        pingMs: Math.max(0, Math.round(end - start)),
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }

    const end = performance.now();
    return {
      healthy: true as const,
      pingMs: Math.max(0, Math.round(end - start)),
    };
  }),
});

