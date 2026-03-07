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
- use the `Makefile` at the repo root as the main place to discover local actions
- `.opencode/commands.yml` now wraps those same `make` targets

Recommended local bootstrap:

```bash
make bootstrap
make dev
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
- `make dev`
- `make lint`
- `make test-all`
- `make stack-up-provider-capture`
- `make logs-api`
- `make provider-inspect`
- `make provider-export`
- `make backup-now`

## Branching Workflow

- Ongoing development now happens on `develop`
- Stabilized work should go from `develop` to `main` through pull requests
- Local refactors and validation can continue without live provider traffic by using the captured data and automated tests

## Quality Checks

- `make lint`
- `make test-api`
- `make test-web-smoke`
- `make build`
- `make test-all`

## Live Runtime Notes

- Local development defaults to simulator mode (`LIVE_SOURCE=simulator`).
- Switch to provider mode by setting `LIVE_SOURCE=provider`.
- For container logs while waiting on the official feed, enable `LIVE_PROVIDER_LOG_FRAMES=true` and `LIVE_PROVIDER_LOG_MESSAGES=true`, then follow `docker logs -f f1-vibetiming-api`.
- Local provider capture now persists raw events and snapshots into PostgreSQL with a bind mount at `./.data/postgres` and daily SQL backups at `./.data/backups`.
- Web consumes SSE from `/api/live/stream` and falls back to polling `/api/live/state` when needed.
- Live health diagnostics are exposed at `/api/live/health`.
- Live leaderboard rows include bounded speed-history and track-status-history arrays for trend visuals.
- Standings support round selection with previous-round movement and points delta context.

## Planning Artifacts

- Session handoff (canonical): `AGENTS.md`
- Primary command catalog: `Makefile`
- OpenCode wrapper catalog: `.opencode/commands.yml`
- Architecture docs: `docs/architecture/README.md`
- Deployment notes: `docs/deployment/README.md`
- Provider analysis docs: `docs/live-provider/README.md`
