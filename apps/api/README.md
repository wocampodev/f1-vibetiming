# API App

NestJS backend for F1 VibeTiming.

Run from repository root:

```bash
make dev
```

Run only API app:

```bash
make dev-api
```

Common commands:

```bash
make db-push
make db-generate
make test-api
make test-api-e2e
make build
```

Full local command catalog:

```bash
make help
```

Live endpoints:

- `GET /api/live/board`
- `GET /api/live/state`
- `GET /api/live/health` (includes transport counters, parser/decode errors, topic throughput)
- `GET /api/live/stream` (SSE)

Notes:

- `/api/live/board` is the richer timing-board contract used by the web UI.
- `/api/live/state` remains the stable legacy public snapshot contract.

Standings endpoints:

- `GET /api/standings/drivers?season=<year>&round=<round>`
- `GET /api/standings/constructors?season=<year>&round=<round>`

Scope note:

- Legacy calendar/weekend/session-result endpoints are intentionally removed; product-facing API scope is live timing plus standings.

Live runtime environment variables:

- `LIVE_SIGNALR_BASE_URL` (default `https://livetiming.formula1.com/signalr`)
- `LIVE_SIGNALR_HUB` (default `streaming`)
- `LIVE_SIGNALR_TOPICS` (comma-separated topic list)
- `LIVE_SIGNALR_RECONNECT_MIN_MS` (default `1000`)
- `LIVE_SIGNALR_RECONNECT_MAX_MS` (default `30000`)
- `LIVE_HEARTBEAT_MS` (default `15000`)
- `LIVE_PROVIDER_LOG` (default `off`; one of `off`, `frames`, `messages`, `all`)
- `LIVE_PROVIDER_LOG_MAX_CHARS` (default `600`; truncates provider log previews)
- `LIVE_PROVIDER_CAPTURE_ENABLED` (default `true`; persists decoded provider events and snapshots)
- `LIVE_PROVIDER_RAW_RETENTION_DAYS` (default `30`; raw event retention window)
- `LIVE_PROVIDER_SNAPSHOT_RETENTION_DAYS` (default `30`; snapshot retention window)
- `LIVE_PROVIDER_SNAPSHOT_RESTORE_MAX_AGE_SEC` (default `21600`; max age restored on startup)

Local capture persistence:

- Postgres bind mount: `./.data/postgres`
- Daily SQL backups: `./.data/backups`
- Local provider analysis docs: `docs/live-provider/README.md`
- Internal live module map: `apps/api/src/live/README.md`
