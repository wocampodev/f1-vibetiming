# 02. Container View

This diagram decomposes the runtime into deployable containers/services.

```mermaid
flowchart TB
  subgraph Client
    browser[Browser]
  end

  subgraph Web[Web App Container]
    webRoutes[Next.js App Router\n/, /calendar, /standings,\n/weekend/[eventId], /session/[sessionId]]
    webApiClient[apps/web/src/lib/api.ts]
  end

  subgraph Api[API Container]
    f1Controller[F1 Controller\ncalendar/weekend/session/standings]
    healthController[Health Controller\n/api/health/data]
    f1Service[F1 Service\nread/query shaping]
    healthService[Health Service\ningestion freshness checks]
    ingestionScheduler[Ingestion Scheduler\ncron jobs]
    ingestionService[Ingestion Service\nstartup + refresh + upsert]
    jolpicaClient[Jolpica Client\nprovider adapter]
    exceptionFilter[Global API Exception Filter]
  end

  db[(PostgreSQL\nPrisma)]
  provider[Jolpica/Ergast]

  browser --> webRoutes
  webRoutes --> webApiClient
  webApiClient --> f1Controller
  webApiClient --> healthController

  f1Controller --> f1Service
  healthController --> healthService
  healthController --> db
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
