# AGENTS Context

Persistent handoff for future sessions.

Last updated: 2026-03-03 (standings round history + selector)

## Snapshot

- Project: F1 VibeTiming (`apps/api` NestJS + Prisma, `apps/web` Next.js)
- Local path: `/home/walter/dev/f1-vibetiming`
- Package manager: `pnpm`
- Active product routes: `/`, `/live`, `/standings`
- Runtime live source strategy: provider default, simulator opt-in only (`LIVE_SOURCE=simulator`)
- Repository: `https://github.com/wocampodev/f1-vibetiming`

## Current Runtime Facts

- Live API endpoints:
  - `/api/live/stream`
  - `/api/live/state`
  - `/api/live/health`
- Provider adapter targets Formula 1 SignalR endpoint family (`livetiming.formula1.com/signalr`).
- Web dashboard consumes SSE first, then falls back to REST polling when stream degrades.
- Live leaderboard includes bounded speed history and track-status history for trend rendering.
- `/api/live/health` includes frame/message counters, parser/decode error counters, and topic throughput snapshots.
- Standings API supports round selection, available round discovery, previous-round movement deltas, and points deltas.
- Standings ingestion persists rows by season/round for driver and constructor history.

## Active Priorities

1. Keep provider normalization locked with fixture-based tests as topic shapes evolve.
2. Add standings trend visual polish now that round-history and movement deltas are available.
3. Run provider soak pass and finish stale architecture terminology cleanup.
4. Keep docs and architecture aligned with provider-first runtime and diagnostics payloads.

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

## Operator Notes

- Use `BACKLOG.md` as source-of-truth checkbox tracker.
- Keep runtime behavior free from synthetic fallback data in provider mode.
- Simulator mode is allowed only when explicitly configured for local development.
