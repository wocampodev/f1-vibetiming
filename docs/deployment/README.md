# Deployment Setup

This document captures the MVP deployment baseline for F1 VibeTiming.

## Targets

- API: NestJS app in `apps/api`
- Web: Next.js app in `apps/web`
- Database: PostgreSQL (`f1_vibetiming`)

## Docker Artifacts

- API image build: `apps/api/Dockerfile`
- Web image build: `apps/web/Dockerfile`
- End-to-end deploy compose: `compose.deploy.yml`

## Local Deploy-Like Run

From repo root:

```bash
docker compose -f compose.deploy.yml up -d --build
```

Then initialize schema:

```bash
pnpm --filter api prisma:push
```

Health checks:

```bash
curl http://localhost:4000/api/health/data
curl http://localhost:3000
```

## Environment Mapping

### API

- `API_PORT`: HTTP port (default `4000`)
- `DATABASE_URL`: Postgres DSN
- `ERGAST_BASE_URL`: provider base URL (`https://api.jolpi.ca/ergast`)

### Web

- `F1_API_BASE_URL`: API base URL used by server-side fetches
- `NEXT_PUBLIC_API_BASE_URL`: optional browser-visible API base URL

## CI/CD Image Pipeline

The workflow `.github/workflows/deploy-images.yml` builds API and web Docker images.

- On pull requests: build validation only (no push)
- On `main` and manual dispatch: push images to GHCR

Published image names:

- `ghcr.io/<owner>/f1-vibetiming-api`
- `ghcr.io/<owner>/f1-vibetiming-web`

## Notes

- Keep API contract backward compatible for existing web routes.
- For production, use managed Postgres credentials and secure secrets.
- If moving toward live mode, verify provider licensing/terms before enabling live adapters.
