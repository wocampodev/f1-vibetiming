# Deployment Setup

Deployment baseline for F1 VibeTiming.

## Targets

- API: NestJS app in `apps/api`
- Web: Next.js app in `apps/web`
- Database: PostgreSQL (`f1_vibetiming`)

## Docker Artifacts

- API image build: `apps/api/Dockerfile`
- Web image build: `apps/web/Dockerfile`
- Compose file: `compose.yml` (`app` profile for API + web)

## Local Deploy-Like Run

```bash
docker compose --profile app up -d --build
```

Run in provider mode (without an override file):

```bash
LIVE_SOURCE=provider docker compose --profile app up -d --build
```

Run in provider mode with container-visible provider frame and payload logs:

```bash
LIVE_SOURCE=provider LIVE_PROVIDER_LOG_FRAMES=true LIVE_PROVIDER_LOG_MESSAGES=true docker compose --profile app up -d --build
docker logs -f f1-vibetiming-api
```

Stop stack:

```bash
docker compose --profile app down
```

Health checks:

```bash
curl http://localhost:4000/api/health/data
curl http://localhost:4000/api/live/health
curl http://localhost:3000
curl http://localhost:3000/standings
```

## Environment Mapping

### API

- `API_PORT`: HTTP port (default `4000`)
- `DATABASE_URL`: Postgres DSN
- `ERGAST_BASE_URL`: standings/results provider base URL
- `LIVE_SOURCE`: `simulator` by default in `compose.yml`; set `provider` to use real live feed
- `LIVE_SIGNALR_BASE_URL`: SignalR base URL
- `LIVE_SIGNALR_HUB`: SignalR hub name
- `LIVE_SIGNALR_TOPICS`: live topic subscription list
- `LIVE_PROVIDER_LOG_FRAMES`: log each raw provider websocket frame to container stdout
- `LIVE_PROVIDER_LOG_MESSAGES`: log each decoded provider topic payload to container stdout
- `LIVE_PROVIDER_LOG_MAX_CHARS`: truncate frame and payload previews in logs

### Web

- `F1_API_BASE_URL`: API base URL used by server-side fetches
- `NEXT_PUBLIC_API_BASE_URL`: browser-visible API base URL

## Notes

- `api` service runs `prisma db push` at startup before `start:prod`.
- Product scope is intentionally minimal: live dashboard + championship standings.
- Runtime should stay provider-first without synthetic fallback data.
- `/api/live/health` is the primary provider diagnostics endpoint (transport throughput + parser/decode reliability).
- `/standings` now relies on per-round standings history persisted in Postgres; keep schema synced with `prisma db push` during deploys.
