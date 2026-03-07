# F1 VibeTiming

F1 VibeTiming is a two-view product:

- real-time live dashboard (`/` and `/live`)
- championship standings (`/standings`)

## Stack

- `apps/api`: NestJS + Prisma + PostgreSQL
- `apps/web`: Next.js App Router + Tailwind
- Live transport: Formula 1 SignalR endpoint family
- Standings ingestion: Jolpica/Ergast-compatible REST data

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

5. Start apps:

   ```bash
   pnpm dev
   ```

6. Open:

   - Live dashboard: `http://localhost:3000/`
   - Championship standings: `http://localhost:3000/standings`

## Quality Checks

- `pnpm lint`
- `pnpm --filter api test`
- `pnpm --filter web test:smoke`
- `pnpm build`

## Live Runtime Notes

- Local development defaults to simulator mode (`LIVE_SOURCE=simulator`).
- Switch to provider mode by setting `LIVE_SOURCE=provider`.
- For container logs while waiting on the official feed, enable `LIVE_PROVIDER_LOG_FRAMES=true` and `LIVE_PROVIDER_LOG_MESSAGES=true`, then follow `docker logs -f f1-vibetiming-api`.
- Web consumes SSE from `/api/live/stream` and falls back to polling `/api/live/state` when needed.
- Live health diagnostics are exposed at `/api/live/health`.
- Live leaderboard rows include bounded speed-history and track-status-history arrays for trend visuals.
- Standings support round selection with previous-round movement and points delta context.

## Planning Artifacts

- Session handoff (canonical): `AGENTS.md`
- Command catalog: `.opencode/commands.yml`
- Architecture docs: `docs/architecture/README.md`
- Deployment notes: `docs/deployment/README.md`
