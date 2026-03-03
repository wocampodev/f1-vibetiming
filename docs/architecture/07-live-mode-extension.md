# 07. Live Runtime View

This diagram captures the current provider-first live runtime.

```mermaid
flowchart LR
  signalr["Formula 1 Live SignalR\nlivetiming.formula1.com/signalr"]
  rest["Jolpica/Ergast REST"]

  subgraph Api[API Service]
    providerAdapter[SignalR Provider Adapter]
    normalizer[Live Feed Normalizer]
    streamGateway[SSE Stream Gateway]
    stateEndpoint[/api/live/state]
    healthEndpoint[/api/live/health]
    standingsIngestion[Standings Ingestion]
  end

  db[(PostgreSQL)]
  web[Next.js Web]

  signalr --> providerAdapter
  providerAdapter --> normalizer
  normalizer --> streamGateway
  normalizer --> stateEndpoint
  normalizer --> healthEndpoint

  rest --> standingsIngestion
  standingsIngestion --> db

  db --> web
  streamGateway --> web
  stateEndpoint --> web
  healthEndpoint --> web
```

Implementation notes:

- Live stream transport is SignalR with reconnect/backoff handling in API and web.
- Provider normalization currently covers session, timing, timing stats, car telemetry, position, and race-control topics.
- Web consumes SSE first and uses `/api/live/state` as fallback polling path.
- Standings remain DB-backed with ingestion freshness metadata.

Source of truth:

- `apps/api/src/live/live.provider.adapter.ts`
- `apps/api/src/live/live.service.ts`
- `apps/web/src/components/live-dashboard.tsx`
- `apps/api/src/ingestion/ingestion.service.ts`
