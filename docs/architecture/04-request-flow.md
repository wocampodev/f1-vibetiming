# 04. Request Flow

This diagram shows the current primary read-paths for the simplified product scope.

```mermaid
sequenceDiagram
  autonumber
  participant User
  participant LivePage as Next.js / or /live
  participant StandingsPage as Next.js /standings
  participant WebApi as apps/web/src/lib/api.ts
  participant LiveCtrl as LiveController
  participant LiveSvc as LiveService
  participant F1Ctrl as F1Controller
  participant F1Svc as F1Service
  participant Prisma as PrismaService
  participant DB as PostgreSQL

  User->>LivePage: Open / (or /live)
  LivePage->>LiveCtrl: GET /api/live/stream (SSE)
  LiveCtrl->>LiveSvc: stream()
  LiveSvc-->>LivePage: initial_state + delta_update + heartbeat
  alt Stream degraded
    LivePage->>LiveCtrl: GET /api/live/state (fallback polling)
    LiveCtrl->>LiveSvc: getState()
    LiveSvc-->>LivePage: latest state snapshot
  end
  LivePage-->>User: Render single live timing table

  User->>StandingsPage: Open /standings
  StandingsPage->>WebApi: getDriverStandings(round?) + getConstructorStandings(round?)
  WebApi->>F1Ctrl: GET /api/standings/drivers?round=
  WebApi->>F1Ctrl: GET /api/standings/constructors?round=
  F1Ctrl->>F1Svc: getDriverStandings() + getConstructorStandings()
  F1Svc->>Prisma: standings queries
  Prisma->>DB: SQL queries
  DB-->>Prisma: rows
  F1Svc-->>F1Ctrl: typed response envelopes
  F1Ctrl-->>WebApi: 200 + cache headers
  WebApi-->>StandingsPage: typed JSON responses
  StandingsPage-->>User: Render driver + constructor tables
```

API contract notes:

- Live stream uses SSE envelopes (`initial_state`, `delta_update`, `heartbeat`, `status`).
- Standings responses include available rounds, previous-round references, movement deltas, and points-gap context fields.
- Errors follow a shared envelope (`error.code`, `error.message`, `error.details`).

Source of truth:

- `apps/web/src/components/live-dashboard.tsx`
- `apps/web/src/app/standings/page.tsx`
- `apps/web/src/lib/api.ts`
- `apps/api/src/live/live.controller.ts`
- `apps/api/src/live/live.service.ts`
- `apps/api/src/f1/f1.controller.ts`
- `apps/api/src/f1/f1.service.ts`
