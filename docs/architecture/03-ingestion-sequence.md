# 03. Ingestion Sequence

This diagram documents startup sync and scheduled refresh behavior.

```mermaid
sequenceDiagram
  autonumber
  participant Boot as NestJS Startup
  participant Svc as IngestionService
  participant Cron as IngestionScheduler
  participant Provider as JolpicaClient
  participant DB as PostgreSQL (Prisma)
  participant Runs as ingestion_run table

  Boot->>Svc: onModuleInit()
  Svc->>Svc: refreshAll(currentSeason)
  Svc->>Provider: fetchCalendar(currentSeason)
  alt No calendar entries
    Svc->>Provider: fetchCalendar(currentSeason - 1)
  end
  Svc->>DB: upsert Event + Session rows
  Svc->>Runs: record CALENDAR run

  Svc->>DB: load events for season
  loop Past events only
    Svc->>Provider: fetchRaceResults(season, round)
    Svc->>DB: upsert Team/Driver/SessionResult (race)
    Svc->>Provider: fetchQualifyingResults(season, round)
    Svc->>DB: upsert Team/Driver/SessionResult (qualifying)
  end
  Svc->>Runs: record RESULTS run

  Svc->>Provider: fetchDriverStandings(season)
  Svc->>Provider: fetchConstructorStandings(season)
  Svc->>DB: replace standings tables for season
  Svc->>Runs: record STANDINGS run
  Svc->>DB: mark past scheduled sessions as COMPLETED

  Cron->>Svc: refreshAll() every 10 minutes
  Cron->>Svc: refreshCalendar() daily
```

Source of truth:

- `apps/api/src/ingestion/ingestion.service.ts`
- `apps/api/src/ingestion/ingestion.scheduler.ts`
- `apps/api/prisma/schema.prisma`
