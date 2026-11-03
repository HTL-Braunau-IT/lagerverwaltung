import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // Unit tests import modules (e.g. ~/server/settings) that transitively pull in
    // ~/env and ~/server/db at load time. Skip env validation and hand db.ts a dummy
    // connection string so those imports don't throw; no test actually hits the DB.
    env: {
      SKIP_ENV_VALIDATION: "1",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    },
  },
});

