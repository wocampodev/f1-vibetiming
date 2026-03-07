# API App

NestJS backend for F1 VibeTiming.

Run from repository root:

```bash
pnpm dev
```

Run only API app:

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

Live endpoints:

- `GET /api/live/state`
- `GET /api/live/health` (includes transport counters, parser/decode errors, topic throughput)
- `GET /api/live/stream` (SSE)

Standings endpoints:

- `GET /api/standings/drivers?season=<year>&round=<round>`
- `GET /api/standings/constructors?season=<year>&round=<round>`

Live runtime environment variables:

- `LIVE_SOURCE` (`simulator` default for local dev; set `provider` to use real live feed)
- `LIVE_SIGNALR_BASE_URL` (default `https://livetiming.formula1.com/signalr`)
- `LIVE_SIGNALR_HUB` (default `streaming`)
- `LIVE_SIGNALR_TOPICS` (comma-separated topic list)
- `LIVE_SIGNALR_RECONNECT_MIN_MS` (default `1000`)
- `LIVE_SIGNALR_RECONNECT_MAX_MS` (default `30000`)
- `LIVE_HEARTBEAT_MS` (default `15000`)
- `LIVE_PROVIDER_LOG_FRAMES` (default `false`; logs raw websocket frame previews)
- `LIVE_PROVIDER_LOG_MESSAGES` (default `false`; logs decoded topic payload previews)
- `LIVE_PROVIDER_LOG_MAX_CHARS` (default `600`; truncates provider log previews)

Simulator-only tuning env vars:

- `LIVE_SIMULATOR_TICK_MS`
- `LIVE_SIMULATOR_SPEED_MULTIPLIER`
- `LIVE_SIMULATOR_SEED`
