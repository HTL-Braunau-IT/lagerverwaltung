# Supporting self-hosting schools: our side

The German [`README.md`](../README.md) is the guide for schools that run the
Lagershop on their own servers. It relies on a few things on **our** side. This
file lists them, plus the rules we have to keep because partner installs update
unattended.

Status legend: ☐ open · ☑ done

---

## 1. Distribution

| | Status |
|---|---|
| **Repository is public**, so partners fetch `docker-compose.yaml` and `self-hosting/*` from `raw.githubusercontent.com` and the update script can read the latest release. Until then the compose sync only warns and keeps the partner's file. **Blocker first:** `dump-lager.sql` (25 MB dump of the old production DB) and the `scripts/import-legacy-*` reports are in git history. Deleting them is not enough; the history must be rewritten (e.g. `git filter-repo`) or the repo published as a fresh history before going public. | ☐ |
| **GHCR package is public.** Package visibility is separate from repo visibility: GitHub → org → *Packages* → `lagerverwaltung` → *Package settings* → *Change visibility* → Public. The org must allow public packages (*Org settings → Packages*). Until then `docker compose pull` fails for partners. | ☐ |
| `stable` channel: `.github/workflows/promote-stable.yml` retags `sha-<commit>` as `stable` + `v<x.y.z>` when a release is published | ☑ |
| **Publish a first release** once a `main` build has succeeded: publish the draft Release Drafter keeps. `:stable` does not exist until then, and the update script resolves the compose file from the latest release. | ☐ |
| Images are only published after typecheck, tests and lint pass (`ci.yml`); PRs build the image without publishing | ☑ |
| Update script keeps the partner's compose file in sync with the release they run, and refuses a compose file their `.env` cannot satisfy | ☑ |
| `/api/health` reports DB reachability and the running commit | ☑ |

## 2. Release rules

- Only publish a release once that version has run on our own production for a
  few days. Publishing **is** the rollout to every partner school.
- Release notes must name any change to `docker-compose.yaml` and any new
  required env var under *„Hinweise für Betreiber“* (PR label `operator`, or edit
  the draft by hand). A new
  `${VAR:?…}` in compose makes the partner's update stop until they add the var.
- Never retag `stable` by hand; publish a release (or re-run *Promote stable*).

## 3. Migration discipline

Partners roll out unattended, and we never see their failures.

- Migrations must be forward-compatible with the previous image. The update
  script rolls the app back but not the DB. That means expand → deploy → contract
  across two releases, never a rename or drop in the same release that stops
  using the column.
- No data migration may assume HTL-Braunau-specific rows (storage rooms, cost
  centers, categories) exist.
- ☐ Consider a CI check that fails a PR when a migration contains `DROP COLUMN`,
  `DROP TABLE` or `ALTER … RENAME` without a marker comment.

## 4. School-specific values still in the code

| Where | What | Action |
|---|---|---|
| `public/images/htl-login-background.jpg` | Our building as login background | Partners override it via `docker-compose.override.yaml` (README 3.5). ☐ Consider a neutral default. |
| `prisma/seed.js` | Demo products | Not run on partner installs. Fine. |
| `scripts/import-legacy-*` | VirtueMart import from our old shop | Ours only. |
| `scheduler` in compose | Reminders 07:00, `TZ` default `Europe/Vienna` | Fine for Austrian schools; `TZ` is configurable. |

## 5. Support

- Partners report through GitHub issues (README, *Kontakt*).
- ☐ Keep a list of partner installations: school, contact, channel followed.
- ☐ Decide what we promise: response times and how long a release is supported.
  Write it down before the first incident, not during it.
- ☑ Licensed under MIT (`LICENSE`).

## 6. Nothing changes for us

Our own deployment is untouched: it does not use `docker-compose.yaml` or the
self-hosting scripts. Do **not** register a self-hosted runner at a partner school.
It would execute our workflows inside their network with access to our repo.
