# AGENTS Context

Persistent handoff for future sessions.

Last updated: 2026-03-02 (deploy validation + single-compose checkpoint)

## Snapshot

- Project: F1 VibeTiming (`apps/api` NestJS + Prisma, `apps/web` Next.js)
- Local path: `/home/walter/dev/f1-vibetiming`
- Package manager: `pnpm` workspace
- MVP data source: Option 1 public REST (`api.jolpi.ca/ergast`)
- Current state: MVP complete, CI covers lint + unit + e2e + build
- GitHub: `https://github.com/wocampodev/f1-vibetiming` (public)

## Completed

- Monorepo and core API/web apps are in place
- Ingestion pipeline runs at startup and on schedule
- Core API endpoints are implemented:
  - `/api/calendar`
  - `/api/weekends/:eventId`
  - `/api/sessions/:sessionId/results`
  - `/api/standings/drivers`
  - `/api/standings/constructors`
  - `/api/health/data`
- API contract hardening is done:
  - shared error envelope
  - pagination `meta` on list endpoints
  - cache headers on read endpoints
- MVP-021 is done:
  - unit tests for ingestion/provider mapping and upsert behavior
- Frontend routes are implemented:
  - `/`
  - `/calendar`
  - `/standings`
  - `/weekend/[eventId]`
  - `/session/[sessionId]`
- Architecture docs are in place (`docs/architecture`):
  - system context
  - container view
  - ingestion sequence
  - request flow
  - data model ERD
  - CI flow
  - live mode extension sketch
- MVP-023 is done:
  - frontend smoke tests for critical routes (`apps/web/scripts/smoke-routes.mjs`)
- MVP-024 is done:
  - deployment setup/docs (`apps/api/Dockerfile`, `apps/web/Dockerfile`, `compose.yml`, `docs/deployment/README.md`)
  - container image workflow (`.github/workflows/deploy-images.yml`)

## Remaining MVP Items

- none

## Release Baseline

- Local runtime validated (`pnpm dev`): API `200` on `/api/health/data`, web `200` on `/`
- Quality gates passed locally: `pnpm lint`, `pnpm --filter api test`, `pnpm --filter web test:smoke`, `pnpm build`
- Infra naming aligned to VibeTiming (`f1_vibetiming` database and compose service naming)
- Full stack deployment validated locally via single compose (`docker compose --profile app up -d --build`): API `200` and web `200`

## Roadmap (Do Not Lose)

### Phase 2 - Live Weekend Mode

- Live leaderboard and session status timeline
- Provider adapter for low-latency feed ingestion (SignalR or equivalent)
- Normalized live event schema + fallback polling
- API to web WebSocket streaming

### Phase 3 - Analytics

- Qualifying delta analysis
- Race stint and tire strategy views
- Pace degradation and consistency analytics
- Incident and overtake timeline

## Locked Decisions

- Backend stays on `NestJS`
- MVP stays on public REST (no SignalR dependency yet)
- `pnpm` is the only package manager
- Provider adapter architecture must stay extensible for live mode

## Quick Resume

```bash
pnpm install
docker compose up -d
pnpm --filter api prisma:push
pnpm dev
```

## Operator Notes

- Check `BACKLOG.md` first for checkbox status
- Keep API responses backward compatible for existing web routes
- Verify provider terms/licensing before any live-feed work
- Compose file strategy: one `compose.yml` with `app` profile for full stack and default infra-only startup
- Image publish workflow is manual-only; `publish` input must be true to push to GHCR
