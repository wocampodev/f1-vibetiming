# AGENTS Context

Persistent handoff for future sessions.

Last updated: 2026-03-01 (closeout checkpoint)

## Snapshot

- Project: F1 VibeTiming (`apps/api` NestJS + Prisma, `apps/web` Next.js)
- Local path: `/home/walter/dev/f1-vibetiming`
- Package manager: `pnpm` workspace
- MVP data source: Option 1 public REST (`api.jolpi.ca/ergast`)
- Current state: MVP mostly complete, CI covers lint + unit + e2e + build
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
- Frontend routes are implemented:
  - `/`
  - `/calendar`
  - `/standings`
  - `/weekend/[eventId]`
  - `/session/[sessionId]`

## Remaining MVP Items

- MVP-021 unit tests for provider mapping and ingestion upsert behavior
- MVP-023 frontend smoke tests for critical routes
- MVP-024 deployment setup + environment docs

## Release Baseline

- Local runtime validated (`pnpm dev`): API `200` on `/api/health/data`, web `200` on `/`
- Quality gates passed locally: `pnpm lint`, `pnpm --filter api test`, `pnpm --filter api test:e2e`, `pnpm build`
- Infra naming aligned to VibeTiming (`f1_vibetiming` database and compose service naming)

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
pnpm db:up
pnpm --filter api prisma:push
pnpm dev
```

## Operator Notes

- Check `BACKLOG.md` first for checkbox status
- Keep API responses backward compatible for existing web routes
- Verify provider terms/licensing before any live-feed work
