# F1 Dashboard MVP

Fast MVP dashboard for Formula 1 practice, qualifying, and race tracking.

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

## Key Endpoints

- `GET /api/calendar?season=2026`
- `GET /api/weekends/:eventId`
- `GET /api/sessions/:sessionId/results`
- `GET /api/standings/drivers?season=2026`
- `GET /api/standings/constructors?season=2026`
- `GET /api/health/data`

## Notes

- Ingestion runs automatically at API startup, then every 10 minutes.
- If current season has no data yet, ingestion falls back to the previous season.
- MVP currently ingests qualifying + race results and both standings tables.
