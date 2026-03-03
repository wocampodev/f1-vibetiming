# 01. System Context

This diagram shows the external systems and primary boundaries for the MVP.

```mermaid
flowchart LR
  user[Fan / User]
  browser[Browser]
  web["Web App<br/>Next.js<br/>apps/web"]
  api["API Service<br/>NestJS<br/>apps/api"]
  provider["Jolpica/Ergast API<br/>api.jolpi.ca/ergast"]
  db[("PostgreSQL<br/>f1_vibetiming")]
  cache[(Redis)]
  gha[GitHub Actions CI]
  repo[("GitHub Repo<br/>wocampodev/f1-vibetiming")]

  user --> browser --> web
  web -->|HTTP JSON| api
  api -->|Read/Write| db
  api -->|Scheduled fetch| provider
  api --> cache
  gha -->|Lint/Test/Build| repo
  gha -->|e2e DB service| db
```

Source of truth:

- `apps/api/src/app.module.ts`
- `apps/api/src/ingestion/ingestion.service.ts`
- `apps/web/src/lib/api.ts`
- `compose.yml`
- `.github/workflows/ci.yml`
