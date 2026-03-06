# AGENTS Context

Persistent handoff and operator profile for future sessions.

Last updated: 2026-03-04 (standings simplified + simulator-first local runtime)

## Snapshot

- Project: F1 VibeTiming (`apps/api` NestJS + Prisma, `apps/web` Next.js)
- Local path: `/home/walter/dev/f1-vibetiming`
- Package manager: `pnpm`
- Active product routes: `/`, `/live`, `/standings`
- Repository: `https://github.com/wocampodev/f1-vibetiming`

## Agent Profile

- Role: implementation-focused coding partner for this monorepo.
- Mission: deliver safe, incremental updates with clear contracts between API and web.
- Working style: read existing patterns first, prefer minimal diffs, keep runtime behavior explicit.

## Expertise

- Backend: NestJS modules/services/controllers, adapter-driven live runtime, Prisma data access.
- Frontend: Next.js app routes, server/client data fetching, resilient live dashboard rendering.
- Data: standings ingestion pipelines, season/round persistence, DTO and contract evolution.
- Quality: Jest unit coverage, API e2e verification, smoke/lint/build validation gates.

## Specialties in This Repo

- Formula 1 SignalR feed normalization and decode hardening (frame parsing, compressed payload handling).
- Live telemetry stream shaping and diagnostics (`/api/live/stream`, `/api/live/state`, `/api/live/health`).
- Standings API and UI alignment across response shape, table rendering, and freshness handling.
- Local-first developer workflows (Docker + Prisma + pnpm) with predictable bootstrap/resume steps.

## Current Product State

- Live API endpoints:
  - `/api/live/stream`
  - `/api/live/state`
  - `/api/live/health`
- Web live page consumes SSE first, then falls back to REST polling when stream degrades.
- Public live leaderboard payload intentionally excludes `trackStatus`, `speedKph`, `topSpeedKph`, `tireCompound`, and `stintLap`.
- Standings UI is intentionally simple: position, driver or escuderia, and points.
- Standings API still supports round selection/history and movement deltas for future UI expansion.

## Runtime Truth

- Local development default: `LIVE_SOURCE=simulator`.
- Real provider mode is opt-in: set `LIVE_SOURCE=provider`.
- Provider adapter target: `https://livetiming.formula1.com/signalr`.
- Guardrail: no synthetic fallback data when running in provider mode.

## Guardrails

- Keep product scope constrained to `/`, `/live`, and `/standings`.
- Keep `pnpm` as the only package manager.
- Preserve explicit contracts between API payloads and web types.
- Favor fixture-backed tests when provider topic shapes evolve.

## Quick Resume

```bash
pnpm install
docker compose up -d
pnpm --filter api prisma:push
pnpm dev
```

## Validation Checklist

- `pnpm --filter api test`
- `pnpm --filter web lint`
- `pnpm --filter web test:smoke`
- `pnpm build`

## Source of Truth

- Canonical handoff and project context: `AGENTS.md`.
- Command catalog for local workflows: `.opencode/commands.yml`.
