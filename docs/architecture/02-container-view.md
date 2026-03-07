# 02. Container View

This diagram decomposes the runtime into deployable containers/services.

```mermaid
flowchart TB
  subgraph Client
    browser["Browser"]
  end

  subgraph Web["Web App Container"]
    webRoutes["Next.js App Router<br/>/, /live, /standings"]
    webApiClient["apps/web/src/lib/api.ts"]
  end

  subgraph Api["API Container"]
    f1Controller["F1 Controller<br/>standings APIs"]
    liveController["Live Controller<br/>/api/live/state|health|stream"]
    healthController["Health Controller<br/>/api/health/data"]
    f1Service["F1 Service<br/>read/query shaping"]
    liveService["Live Service<br/>stream orchestration"]
    healthService["Health Service<br/>ingestion freshness checks"]
    ingestionScheduler["Ingestion Scheduler<br/>cron jobs"]
    ingestionService["Ingestion Service<br/>startup + refresh + upsert"]
    jolpicaClient["Jolpica Client<br/>standings/results ingestion"]
    signalrProvider["SignalR Provider Adapter<br/>live transport"]
    liveCapture["Live Capture Service<br/>raw events + snapshots"]
    exceptionFilter["Global API Exception Filter"]
  end

  db[("PostgreSQL<br/>Prisma")]
  backup["Postgres Backup Sidecar<br/>daily pg_dump"]
  provider["Jolpica/Ergast"]

  browser --> webRoutes
  webRoutes --> webApiClient
  webApiClient --> f1Controller
  webApiClient --> liveController
  webApiClient --> healthController

  f1Controller --> f1Service
  liveController --> liveService
  liveService --> signalrProvider
  signalrProvider --> liveCapture
  liveCapture --> db
  healthController --> healthService
  f1Service --> db
  liveService --> db
  healthService --> db

  ingestionScheduler --> ingestionService
  ingestionService --> jolpicaClient
  ingestionService --> db
  backup --> db
  jolpicaClient --> provider

  f1Controller --> exceptionFilter
  liveController --> exceptionFilter
  healthController --> exceptionFilter
```

Source of truth:

- `apps/web/src/app/layout.tsx`
- `apps/web/src/lib/api.ts`
- `apps/api/src/f1/f1.controller.ts`
- `apps/api/src/f1/f1.service.ts`
- `apps/api/src/live/live.controller.ts`
- `apps/api/src/live/live.capture.service.ts`
- `apps/api/src/live/live.service.ts`
- `apps/api/src/ingestion/ingestion.scheduler.ts`
- `apps/api/src/ingestion/ingestion.service.ts`
- `apps/api/src/main.ts`
