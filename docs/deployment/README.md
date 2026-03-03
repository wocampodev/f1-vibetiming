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
- `LIVE_SOURCE`: `provider` (default) or `simulator`
- `LIVE_SIGNALR_BASE_URL`: SignalR base URL
- `LIVE_SIGNALR_HUB`: SignalR hub name
- `LIVE_SIGNALR_TOPICS`: live topic subscription list

### Web

- `F1_API_BASE_URL`: API base URL used by server-side fetches
- `NEXT_PUBLIC_API_BASE_URL`: browser-visible API base URL

## Notes

- `api` service runs `prisma db push` at startup before `start:prod`.
- Product scope is intentionally minimal: live dashboard + championship standings.
- Runtime should stay provider-first without synthetic fallback data.
- `/api/live/health` is the primary provider diagnostics endpoint (transport throughput + parser/decode reliability).
