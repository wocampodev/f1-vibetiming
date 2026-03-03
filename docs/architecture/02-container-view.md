# 02. Container View

This diagram decomposes the runtime into deployable containers/services.

```mermaid
flowchart TB
  subgraph Client
    browser["Browser"]
  end

  subgraph Web["Web App Container"]
    webRoutes["Next.js App Router<br/>/, /calendar, /standings,<br/>/weekend/[eventId], /session/[sessionId]"]
    webApiClient["apps/web/src/lib/api.ts"]
  end

  subgraph Api["API Container"]
    f1Controller["F1 Controller<br/>calendar/weekend/session/standings"]
    healthController["Health Controller<br/>/api/health/data"]
    f1Service["F1 Service<br/>read/query shaping"]
    healthService["Health Service<br/>ingestion freshness checks"]
    ingestionScheduler["Ingestion Scheduler<br/>cron jobs"]
    ingestionService["Ingestion Service<br/>startup + refresh + upsert"]
    jolpicaClient["Jolpica Client<br/>provider adapter"]
    exceptionFilter["Global API Exception Filter"]
  end

  db[("PostgreSQL<br/>Prisma")]
  provider["Jolpica/Ergast"]

  browser --> webRoutes
  webRoutes --> webApiClient
  webApiClient --> f1Controller
  webApiClient --> healthController

  f1Controller --> f1Service
  healthController --> healthService
  f1Service --> db
  healthService --> db

  ingestionScheduler --> ingestionService
  ingestionService --> jolpicaClient
  ingestionService --> db
  jolpicaClient --> provider

  f1Controller --> exceptionFilter
  healthController --> exceptionFilter
```

Source of truth:

- `apps/web/src/app/layout.tsx`
- `apps/web/src/lib/api.ts`
- `apps/api/src/f1/f1.controller.ts`
- `apps/api/src/f1/f1.service.ts`
- `apps/api/src/ingestion/ingestion.scheduler.ts`
- `apps/api/src/ingestion/ingestion.service.ts`
- `apps/api/src/main.ts`
