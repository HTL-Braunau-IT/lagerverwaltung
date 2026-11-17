# Development

Notes for working on the Lagershop. The [README](../README.md) is the guide for
schools that self-host it; [`CLAUDE.md`](../CLAUDE.md) has the architecture and
conventions in more depth.

## Stack

T3 Stack: Next.js 16 (App Router), React 19, tRPC 11, Prisma 7 on PostgreSQL,
NextAuth 4 (Entra ID), Tailwind 4, Zod 4, strict TypeScript. All user-facing text
is German.

## Local setup

```bash
cp .env.example .env      # fill in Entra app + group IDs
./start-database.sh       # Postgres in Docker
npm install
npm run db:migrate        # apply migrations
npm run db:seed           # optional demo data
npm run dev
```

Env vars are validated by `src/env.js`; a new var goes into both the schema and the
`runtimeEnv` map there, and into `docker-compose.yaml` + `self-hosting/env.example`
if self-hosted installs need it.

## Commands

```bash
npm run check          # eslint + tsc, run before considering work done
npm run test           # vitest
npm run db:generate    # create + apply a migration in dev
npm run db:studio
```

## Releases and the Docker image

- CI (`.github/workflows/ci.yml`) runs typecheck, tests and lint, then builds the
  production image. Pull requests build it without publishing; pushes to `main`
  publish `ghcr.io/htl-braunau-it/lagerverwaltung:latest` and `:sha-<commit>`.
- Release Drafter keeps a draft of the next release (`v<next patch>`) up to date
  on every push to `main`. PR labels sort the notes and pick the version:
  `enhancement`/`feature` → minor, `breaking` → major, otherwise patch. PR titles
  like `feat: …` / `fix: …` are labelled automatically. Direct pushes without a
  PR don't show up in the notes; write those lines into the draft by hand.
- Publishing the draft retags that commit's image as `:stable` and `:<tag>`
  without rebuilding (`.github/workflows/promote-stable.yml`). Publishing a
  release **is** the rollout to every self-hosting school.
- Label a PR `operator` when it changes `docker-compose.yaml` or adds a required
  env var; it then appears under *„Hinweise für Betreiber“* in the notes.

What we owe self-hosting schools (migration rules, release notes, open setup
steps) is in [`SELF_HOSTING_UPSTREAM.md`](SELF_HOSTING_UPSTREAM.md).
