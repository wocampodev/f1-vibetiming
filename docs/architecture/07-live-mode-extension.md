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
    boardEndpoint[/api/live/board]
    stateEndpoint[/api/live/state]
    healthEndpoint[/api/live/health]
    standingsIngestion[Standings Ingestion]
  end

  db[(PostgreSQL)]
  web[Next.js Web]

  signalr --> providerAdapter
  providerAdapter --> normalizer
  normalizer --> streamGateway
  normalizer --> boardEndpoint
  normalizer --> stateEndpoint
  normalizer --> healthEndpoint

  rest --> standingsIngestion
  standingsIngestion --> db

  db --> web
  streamGateway --> web
  boardEndpoint --> web
  stateEndpoint --> web
  healthEndpoint --> web
```

Implementation notes:

- Live stream transport is SignalR with reconnect/backoff handling in API and web.
- Provider runtime is now split into protocol helpers, generic value parsers, topic parsers, telemetry store, session state, and reducer/coordinator layers.
- Provider capture can persist raw decoded messages, topic shape summaries, and normalized live snapshots for local analysis.
- Leaderboard entries include bounded speed-history and track-status-history windows for trend rendering.
- Web consumes SSE first and uses `/api/live/board` as its browser-facing polling path.
- `/api/live/state` remains the stable legacy snapshot contract.
- `/api/live/health` includes provider transport diagnostics plus local capture metadata (active run, persisted snapshot freshness, and per-topic snapshot freshness details).
- Standings remain DB-backed with per-round history persistence, selectable round snapshots, and previous-round movement deltas.

Source of truth:

- `apps/api/src/live/live.provider.adapter.ts`
- `apps/api/src/live/live.provider.state.ts`
- `apps/api/src/live/live.provider.store.ts`
- `apps/api/src/live/live.provider.session.ts`
- `apps/api/src/live/live.provider.leaderboard.ts`
- `apps/api/src/live/live.provider.parsers.ts`
- `apps/api/src/live/README.md`
- `apps/api/src/live/live.service.ts`
- `apps/web/src/components/live-dashboard.tsx`
- `apps/api/src/ingestion/ingestion.service.ts`
