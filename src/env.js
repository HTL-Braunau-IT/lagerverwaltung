import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    AUTH_SECRET: z.string().min(1),
    AUTH_URL: z.string().url(),
    AZURE_AD_TENANT_ID: z.string().min(1),
    AZURE_AD_CLIENT_ID: z.string().min(1),
    AZURE_AD_CLIENT_SECRET: z.string().min(1),
    ROLE_ADMIN_GROUP_ID: z.string().min(1),
    ROLE_TEACHER_GROUP_ID: z.string().min(1),
    ROLE_STUDENT_GROUP_ID: z.string().min(1),
    MAIL_FROM_ADDRESS: z.string().email().optional(),
    MAIL_OPS_BCC_ADDRESS: z.string().email().optional(),
    LOAN_REMINDER_CRON_SECRET: z.string().min(1).optional(),
    CRON_SECRET: z.string().min(1).optional(),
    SCHOOL_NAME: z.string().trim().min(1).default("HTL Braunau"),
    // Baked into the Docker image by CI (build arg GIT_SHA); shown by /api/health.
    APP_COMMIT: z.string().default("unknown"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_URL: process.env.AUTH_URL,
    AZURE_AD_TENANT_ID: process.env.AZURE_AD_TENANT_ID,
    AZURE_AD_CLIENT_ID: process.env.AZURE_AD_CLIENT_ID,
    AZURE_AD_CLIENT_SECRET: process.env.AZURE_AD_CLIENT_SECRET,
    ROLE_ADMIN_GROUP_ID: process.env.ROLE_ADMIN_GROUP_ID,
    ROLE_TEACHER_GROUP_ID: process.env.ROLE_TEACHER_GROUP_ID,
    ROLE_STUDENT_GROUP_ID: process.env.ROLE_STUDENT_GROUP_ID,
    MAIL_FROM_ADDRESS: process.env.MAIL_FROM_ADDRESS,
    MAIL_OPS_BCC_ADDRESS: process.env.MAIL_OPS_BCC_ADDRESS,
    LOAN_REMINDER_CRON_SECRET: process.env.LOAN_REMINDER_CRON_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
    // Fallback here too: the Docker image runs with SKIP_ENV_VALIDATION, which skips Zod defaults.
    SCHOOL_NAME: process.env.SCHOOL_NAME?.trim() || "HTL Braunau",
    APP_COMMIT: process.env.APP_COMMIT ?? "unknown",
    NODE_ENV: process.env.NODE_ENV,
    // NEXT_PUBLIC_CLIENTVAR: process.env.NEXT_PUBLIC_CLIENTVAR,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
