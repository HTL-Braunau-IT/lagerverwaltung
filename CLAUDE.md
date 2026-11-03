# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`lagerverwaltung` — the internal warehouse/webshop for HTL Braunau. Students browse a
product catalog, build carts, and place orders; teachers approve requests and lend out
equipment; admins manage the catalog, storage, users, and approval rules. Built on the
**T3 Stack**: Next.js 16 (App Router + Turbopack), React 19, tRPC 11, Prisma 7 on
PostgreSQL, NextAuth 4 (Azure AD), Tailwind 4, Zod 4, strict TypeScript.

**All user-facing text and error messages must be in German.** (See `.cursor/rules/`.)

## Commands

```bash
npm run dev            # Next dev server (Turbopack)
npm run build          # production build
npm run check          # eslint . && tsc --noEmit  — run this before considering work done
npm run typecheck      # tsc --noEmit only
npm run lint           # eslint . (lint:fix to autofix)
npm run format:write   # prettier

npm run test           # vitest run (all tests)
npx vitest run src/server/approval/rules.test.ts   # single test file
npx vitest             # watch mode

npm run db:generate    # prisma migrate dev  (create + apply a migration in dev)
npm run db:migrate     # prisma migrate deploy (apply migrations, prod)
npm run db:push        # prisma db push (sync schema without a migration)
npm run db:studio      # prisma studio
npm run db:seed        # prisma db seed  (prisma/seed.js)
```

Tests are `src/**/*.test.{ts,tsx}`, run in a `node` environment (Vitest), colocated next
to the code they cover. The `~` alias resolves to `src/` in both tsconfig and vitest.

Local DB: `./start-database.sh` spins up Postgres in Docker. Env is validated by
`src/env.js` (`@t3-oss/env-nextjs` + Zod) — add new vars to **both** the `server`/`client`
schema and the `runtimeEnv` map there, or the build fails. Copy `.env.example` to `.env`.

## Architecture

**Request flow:** React components (RSC + client) → tRPC client (`src/trpc/`) → routers in
`src/server/api/routers/` → Prisma (`ctx.db`) → Postgres. The client is fully typed from
`AppRouter` (`src/server/api/root.ts`); every new router must be registered there.

**tRPC procedures** (`src/server/api/trpc.ts`) — pick the right one; authorization lives in
the procedure, not the handler body:
- `publicProcedure` — unauthenticated (catalog browsing, etc.)
- `protectedProcedure` — requires a session
- `teacherProcedure` — role ∈ {ADMIN, TEACHER}
- `adminProcedure` — role ADMIN only

Convention: catalog read procedures are often public; backend/management procedures are
prefixed `backend*` and gated to `adminProcedure`. Validate every input with Zod. Throw
`TRPCError` with a German `message`.

**Auth** (`src/server/auth/index.ts`): Azure AD / Entra ID via NextAuth with the Prisma
adapter and database sessions. Role (`ADMIN` | `TEACHER` | `STUDENT`) is derived from Entra
group membership in the id-token, with a Microsoft Graph fallback when groups are absent or
overflow (`_claim_names`). Group→role mapping comes from `ROLE_*_GROUP_ID` env vars.
`session.user` is augmented with `id`, `role`, and `azureAdObjectId`.

**Domain modules** under `src/server/`:
- `approval/` — order approval workflow. `rules.ts` is pure decision logic (unit-tested);
  `service.ts` resolves requirements against approval groups + `AppSetting`s; `notifications.ts`
  and `mail/approval-events.ts` send mail. `releasedOrderWhere` / approval-status filters
  control which orders the warehouse may act on.
- `api/routers/utils/` — shared server logic: `stock.ts` (stock checks, Decimal→number,
  requirement aggregation), `loan-stock.ts`, `storage-access.ts` (per-user storage-room
  scoping). Prefer reusing these over reimplementing.
- `graph/` — Microsoft Graph calls (teacher directory, role resolution).
- `mail/` — Graph-based mailer and event-specific templates.
- `settings.ts` — typed access to the `AppSetting` key/value table.

**Pages/API** in `src/app/`: App Router. `backend/*` = admin/management UI, `teacher/*` =
teacher UI, rest = storefront. `api/trpc/[trpc]` is the tRPC entrypoint. `api/backend/*`
route handlers cover file uploads (product/parts-list images & documents, served back via
`image/[id]` and `document/[id]` routes) and **cron jobs** (`loans/reminders`,
`orders/approval-reminders`) guarded by an `x-cron-secret` header checked against
`LOAN_REMINDER_CRON_SECRET` / `CRON_SECRET`.

**UI**: reusable primitives in `src/components/ui/`; feature components grouped under
`src/components/{backend,shop,teacher,layout,auth}`. PDF generation via `@react-pdf/renderer`
in `*/pdf/` subfolders.

## Data model conventions (Prisma, `prisma/schema.prisma`)

- IDs are `cuid()`. Postgres via the `@prisma/adapter-pg` driver adapter (`src/server/db.ts`),
  not the default engine.
- **Money and quantities are `Decimal`, never float** — `price` as `Decimal(12,2)`, quantities
  as `Decimal(14,3)`. On the server, convert with `decimalToNumber()` from `utils/stock.ts`.
- Units: `UnitKind` + `BaseUnit` + `unitStep`. Quantity stepping/validation rules live in
  `src/lib/quantity-rules.ts` (integer-step units vs. 0.001-step units).
- Stock shortfalls surface as a `TRPCError` whose message is the sentinel
  `INSUFFICIENT_STOCK:<productId>:<available>` — clients parse this; keep the format.
- Follow `.cursor/rules/postgres.mdc`: wrap balance/stock mutations in `$transaction`,
  add indexes for queried fields, use `select`/`include` to avoid N+1, assume concurrent writes.

## Code style

Enforced by ESLint (flat config, `typescript-eslint`) + Prettier (with Tailwind plugin) +
strict TS (`noUncheckedIndexedAccess`, `checkJs`, `verbatimModuleSyntax`). React 19 idioms:
`ref` as a plain prop (no `forwardRef`), `use(Context)` over `useContext`. The `.cursor/rules/`
files carry the full React composition, Next.js performance, and frontend-design guidance —
consult them when writing components.

Git: on `main`, branch before committing; don't commit or push unless asked (SSH remotes, LF line endings).
