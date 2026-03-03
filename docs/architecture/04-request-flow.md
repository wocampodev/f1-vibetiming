# 04. Request Flow

This diagram shows the read-path from web pages to API responses.

```mermaid
sequenceDiagram
  autonumber
  participant User
  participant Page as Next.js Route
  participant WebApi as apps/web/src/lib/api.ts
  participant Controller as F1Controller
  participant Service as F1Service
  participant Prisma as PrismaService
  participant DB as PostgreSQL

  User->>Page: Open /calendar
  Page->>WebApi: getCalendar(season?)
  WebApi->>Controller: GET /api/calendar?season=...&page=...&limit=...
  Controller->>Service: getCalendar(query)
  Service->>Prisma: event.findMany + event.count
  Prisma->>DB: SQL queries
  DB-->>Prisma: rows + total
  Service-->>Controller: { season, freshness, meta, events }
  Controller-->>WebApi: 200 + Cache-Control header
  WebApi-->>Page: typed JSON response
  Page-->>User: render list/table/cards

  alt Not found or bad request
    Service-->>Controller: throw HttpException
    Controller-->>WebApi: standardized error envelope
  end
```

API contract notes (MVP):

- List endpoints include pagination metadata (`meta.page`, `meta.limit`, `meta.total`, `meta.totalPages`).
- Read endpoints set short cache headers.
- Errors follow a shared envelope (`error.code`, `error.message`, `error.details`).

Source of truth:

- `apps/web/src/lib/api.ts`
- `apps/api/src/f1/f1.controller.ts`
- `apps/api/src/f1/f1.service.ts`
- `apps/api/src/common/filters/api-exception.filter.ts`
