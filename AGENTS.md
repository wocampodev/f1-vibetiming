# AGENTS Context

Persistent handoff for future sessions.

Last updated: 2026-03-03 (scope simplified to live + championship standings)

## Snapshot

- Project: F1 VibeTiming (`apps/api` NestJS + Prisma, `apps/web` Next.js)
- Local path: `/home/walter/dev/f1-vibetiming`
- Package manager: `pnpm` workspace
- MVP data source: Option 1 public REST (`api.jolpi.ca/ergast`)
- Current state: MVP complete, UI simplified to live dashboard + championship standings
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
  - `/` (live dashboard)
  - `/live`
  - `/standings`
  - unused routes removed from frontend (`/calendar`, `/weekend/[eventId]`, `/session`, `/session/[sessionId]`)
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
- Phase 2A has started in API:
  - live adapter contract and normalized live schema scaffolding (`apps/api/src/live`)
  - simulator-first stream source with status/heartbeat/delta events
  - deterministic simulator replay fixtures + seedable timeline
  - configurable simulator replay speed multiplier
  - provider adapter stub is present but legally gated and intentionally degraded
  - live endpoints (`/api/live/state`, `/api/live/health`, `/api/live/stream`)
  - unit tests cover legal gate adapter selection + stream envelope behavior
- Phase 2A has started in web:
  - `/` and `/live` consume live SSE stream
  - simplified `/live` dashboard with one driver timing table
  - table columns: tire, sector splits (S1/S2/S3), lap time, gap, interval
  - broadcast-style dark timing-board UI
  - secondary route focused on championship standings (`/standings`)

## Remaining MVP Items

- none

## Release Baseline

- Local runtime validated (`pnpm dev`): API `200` on `/api/health/data`, web `200` on `/`
- Quality gates passed locally: `pnpm lint`, `pnpm --filter api test`, `pnpm --filter web test:smoke`, `pnpm build`
- Infra naming aligned to VibeTiming (`f1_vibetiming` database and compose service naming)
- Full stack deployment validated locally via single compose (`docker compose --profile app up -d --build`): API `200` and web `200`

## Roadmap (Do Not Lose)

### Phase 2 - Live Weekend Mode

- Track A (build first): simulator/replay live pipeline
  - adapter contract + normalized event schema
  - stream envelope (`initial_state`, `delta_update`, `heartbeat`, `status`)
  - API stream gateway + reconnect/backoff + fallback polling
  - live UI slices (leaderboard, session timeline, tires/sectors, radio)
- Track B (gate): provider legal/compliance readiness
  - terms/licensing review and approval record
  - attribution/disclaimer and retention policy
  - go/no-go gate before real-provider production rollout

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
- Track provider legal readiness with `docs/legal/provider-readiness-checklist.md`
- Compose file strategy: one `compose.yml` with `app` profile for full stack and default infra-only startup
- Image publish workflow is manual-only; `publish` input must be true to push to GHCR

## Current Plan

1. Keep product scope simple: live timing table and championship standings only.
2. Implement PH2-103 stream resilience (reconnect/backoff and fallback polling) without adding new dashboard widgets.
3. Keep simulator/provider contract stable, including sector timing fields in leaderboard entries.
4. Maintain legal gate invariants: provider source remains non-production until LEGAL-001 and LEGAL-003 are closed.

## Next Session Checklist

- Start with PH2-103.1/103.2 in web (`live-dashboard` stream lifecycle + fallback state machine).
- Keep `/live` UI as a single table and avoid re-introducing track-map/timeline/radio/session panels.
- Validate with `pnpm --filter web lint`, `pnpm --filter web test:smoke`, and targeted `pnpm --filter api test`.
- Update `BACKLOG.md` checkboxes as each resilience sub-slice lands.
