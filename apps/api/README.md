# API App

This is the NestJS backend for the F1 VibeTiming MVP.

Run from repository root:

```bash
pnpm dev
```

Or run only the API app:

```bash
pnpm --filter api start:dev
```

Common commands:

```bash
pnpm --filter api prisma:push
pnpm --filter api prisma:generate
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter api build
```

Live mode foundation endpoints (simulator-first):

- `GET /api/live/state`
- `GET /api/live/health`
- `GET /api/live/stream` (SSE)

Live mode environment variables:

- `LIVE_SOURCE` (`simulator` default; provider path is gated)
- `LIVE_SIMULATOR_TICK_MS` (default `2000`)
- `LIVE_HEARTBEAT_MS` (default `15000`)
- `LIVE_SIMULATOR_SEED` (default `2026`, keeps simulator timing deterministic)

Deterministic replay fixture source:

- `apps/api/src/live/live.simulator.fixture.ts`
