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

- Default mode is provider-first (`LIVE_SOURCE=provider`).
- Simulator mode is local opt-in only (`LIVE_SOURCE=simulator`).
- Web consumes SSE from `/api/live/stream` and falls back to polling `/api/live/state` when needed.
- Live health diagnostics are exposed at `/api/live/health`.

## Planning Artifacts

- Backlog tracker: `BACKLOG.md`
- Session handoff: `AGENTS.md`
- Architecture docs: `docs/architecture/README.md`
- Deployment notes: `docs/deployment/README.md`
