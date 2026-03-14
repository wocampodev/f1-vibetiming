# F1 VibeTiming

F1 VibeTiming is a two-view product:

- real-time live dashboard (`/` and `/live`)
- championship standings (`/standings`)

## Stack

- `apps/api`: NestJS + Prisma + PostgreSQL
- `apps/web`: Next.js App Router + Tailwind
- Live transport: Formula 1 SignalR endpoint family
- Standings ingestion: Jolpica/Ergast-compatible REST data

## Quick Start

Primary command surface:

- run `make help`
- use the repo-root `Makefile` as the source of truth for local actions
- `.opencode/commands.yml` only wraps those same `make` targets

Recommended local bootstrap:

```bash
make bootstrap
make run
```

This will:

- install dependencies
- create `.env` from `.env.example` if needed
- start local infrastructure
- push the Prisma schema

Open:

- Live dashboard: `http://localhost:3000/`
- Championship standings: `http://localhost:3000/standings`

## Common Actions

Use `make help` for the full list. Most-used targets:

- `make bootstrap`
- `make validate`
- `make run`
- `make down`
- `make health`
- `make backup`
- `make sql`

## Branching Workflow

- Ongoing development now happens on `develop`
- Stabilized work should go from `develop` to `main` through pull requests
- Local refactors and validation can continue without live provider traffic by using the captured data and automated tests
- The public product surface is intentionally narrow: live timing plus standings only; legacy weekend/session result routes are removed
- Weekly dependency update PRs are proposed by Dependabot against `develop`; merge decisions stay manual

## Quality Checks

- `make validate` runs API format checks, lint, API tests, web smoke tests, and build

## Live Runtime Notes

- Local development now runs provider-first only.
- Raw `docker compose` and `make run` both start the provider-based live runtime.
- For noisier provider payload diagnostics, run `make run PROVIDER_LOG=all`.
- Local provider capture now persists raw events and snapshots into PostgreSQL with a bind mount at `./.data/postgres` and daily SQL backups at `./.data/backups`.
- Local transmission-analysis material belongs in `data-analysis/` only and stays out of git.
- Web consumes SSE from `/api/live/stream`, fetches `/api/live/board` on live updates, and falls back to polling `/api/live/board` when needed.
- `/api/live/state` remains the stable legacy live snapshot contract for non-board consumers.
- Live health diagnostics are exposed at `/api/live/health`.
- Live leaderboard rows include bounded speed-history and track-status-history arrays for trend visuals.
- Standings support round selection with previous-round movement and points delta context.

## Repo Guides

- Primary command catalog: `Makefile`
- OpenCode wrapper catalog: `.opencode/commands.yml`
- Architecture docs: `docs/architecture/README.md`
- Deployment notes: `docs/deployment/README.md`
- Local-only provider analysis exports: `data-analysis/` (gitignored)
