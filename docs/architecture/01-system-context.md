# 01. System Context

This diagram shows the external systems and primary boundaries for current runtime.

```mermaid
flowchart LR
  user[Fan / User]
  browser[Browser]
  web["Web App<br/>Next.js<br/>apps/web"]
  api["API Service<br/>NestJS<br/>apps/api"]
  standingsProvider["Jolpica/Ergast API<br/>api.jolpi.ca/ergast"]
  liveProvider["F1 SignalR Live Feed<br/>livetiming.formula1.com/signalr"]
  db[("PostgreSQL<br/>f1_vibetiming")]
  gha[GitHub Actions CI]
  repo[("GitHub Repo<br/>wocampodev/f1-vibetiming")]

  user --> browser --> web
  web -->|HTTP JSON| api
  api -->|Read/Write| db
  api -->|Scheduled fetch| standingsProvider
  api -->|Live stream transport| liveProvider
  gha -->|Lint/Test/Build| repo
  gha -->|e2e DB service| db
```

Source of truth:

- `apps/api/src/app.module.ts`
- `apps/api/src/ingestion/ingestion.service.ts`
- `apps/web/src/lib/api.ts`
- `compose.yml`
- `.github/workflows/ci.yml`
