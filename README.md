# F1 VibeTiming MVP

Fast MVP live-timing dashboard for Formula 1 practice, qualifying, and race tracking.

Hero tagline options:

- F1 live timing, built in public with vibecoding speed.
- Turn raw race data into instant weekend signal.
- From pit wall pulse to dashboard in seconds.
- Build fast, ship laps, iterate race by race.

## Stack

- `apps/api`: NestJS + Prisma + PostgreSQL + scheduled ingestion
- `apps/web`: Next.js App Router + Tailwind + Recharts
- Data provider: Jolpica/Ergast-compatible public endpoints

## Quick Start

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Start infrastructure:

   ```bash
   docker compose up -d
   ```

4. Push Prisma schema:

   ```bash
   pnpm --filter api prisma:push
   ```

5. Start both apps:

   ```bash
   pnpm dev
   ```

## Quality Checks

- `pnpm lint`
- `pnpm --filter api test`
- `pnpm --filter api test:e2e`
- `pnpm --filter web test:smoke`
- `pnpm build`

## Deployment (MVP)

- Local full stack (Docker only): `docker compose --profile app up -d --build`
- Stop full stack: `docker compose --profile app down`
- Deployment docs: `docs/deployment/README.md`

## Docker Local Environment

- Infra only up: `docker compose up -d`
- Infra only down: `docker compose down`
- Full stack up (db + redis + api + web): `docker compose --profile app up -d --build`
- Full stack down: `docker compose --profile app down`

## Key Endpoints

- `GET /api/calendar?season=2026&page=1&limit=20`
- `GET /api/weekends/:eventId`
- `GET /api/sessions/:sessionId/results`
- `GET /api/standings/drivers?season=2026&page=1&limit=20`
- `GET /api/standings/constructors?season=2026&page=1&limit=20`
- `GET /api/health/data`

## Notes

- Ingestion runs automatically at API startup, then every 10 minutes.
- If current season has no data yet, ingestion falls back to the previous season.
- MVP currently ingests qualifying + race results and both standings tables.
- List endpoints include `meta` pagination fields (`page`, `limit`, `total`, `totalPages`).
- API errors use a shared envelope with `error.code`, `error.message`, and `error.details`.

## Planning Artifacts

- Backlog checklist: `BACKLOG.md`
- Session handoff and future phases: `AGENTS.md`
- Local assistant session configs: `.opencode/`
- Architecture diagrams: `docs/architecture/README.md`
- Deployment setup and env mapping: `docs/deployment/README.md`
- Provider compliance gate checklist: `docs/legal/provider-readiness-checklist.md`
