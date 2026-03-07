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
- Local Postgres bind mount: `./.data/postgres`
- Local SQL backups: `./.data/backups`

## Local Deploy-Like Run

```bash
make stack-up
```

Run in provider mode (without an override file):

```bash
make stack-up-provider
```

Run in provider mode with container-visible provider frame and payload logs:

```bash
make stack-up-provider-verbose
make logs-api
```

Run in provider mode with capture enabled and ready for later analysis:

```bash
make stack-up-provider-capture
```

Stop stack:

```bash
make stack-down
```

Health checks:

```bash
make health
```

See all supported operational commands:

```bash
make help
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
- `LIVE_PROVIDER_CAPTURE_ENABLED`: persist decoded provider messages and normalized snapshots
- `LIVE_PROVIDER_RAW_RETENTION_DAYS`: retention window for `live_provider_event` rows
- `LIVE_PROVIDER_SNAPSHOT_RETENTION_DAYS`: retention window for `live_session_snapshot` rows
- `LIVE_PROVIDER_SNAPSHOT_RESTORE_MAX_AGE_SEC`: max snapshot age restored back into live state on API startup

### Postgres Backup Sidecar

- `POSTGRES_BACKUP_SCHEDULE_CRON`: daily cron expression used inside the backup container
- `POSTGRES_BACKUP_RETENTION_DAYS`: backup file retention window
- `POSTGRES_BACKUP_TZ`: timezone used by the backup container cron scheduler

## Local Persistence Notes

- Postgres now writes to `./.data/postgres` through a bind mount so captured live data survives container recreation.
- The `postgres-backup` sidecar writes compressed `pg_dump` files to `./.data/backups` once per day.
- The backup sidecar also prunes backup files older than the configured retention window.
- Keep `./.data` out of git and do not delete it if you want to preserve local capture history.
- On the first run after switching from Docker named volumes to the bind mount, PostgreSQL starts with the local data already present in `./.data/postgres`; restore from backup if you need to seed older local data.

Run an immediate backup on demand:

```bash
make backup-now
```

Restore from a backup file:

```bash
make backup-restore BACKUP_FILE=./.data/backups/<backup-file>.sql.gz
```

### Web

- `F1_API_BASE_URL`: API base URL used by server-side fetches
- `NEXT_PUBLIC_API_BASE_URL`: browser-visible API base URL

## Notes

- `api` service runs `prisma db push` at startup before `start:prod`.
- `postgres-init` prepares bind-mounted local directories before PostgreSQL starts.
- Product scope is intentionally minimal: live dashboard + championship standings.
- Runtime should stay provider-first without synthetic fallback data.
- `/api/live/health` is the primary provider diagnostics endpoint (transport throughput + parser/decode reliability).
- `/standings` now relies on per-round standings history persisted in Postgres; keep schema synced with `prisma db push` during deploys.
