# 07. Live Mode Extension (Phase 2)

This is the target extension path without breaking current MVP contracts.

```mermaid
flowchart LR
  providerLive[Live Feed Provider\nSignalR or equivalent]
  providerRest[Public REST Provider\nJolpica/Ergast]

  subgraph Api[API Service]
    liveAdapter[Live Adapter]
    pollFallback[Polling Fallback]
    normalizer[Live Event Normalizer]
    streamGateway[WebSocket Gateway]
    readApi[Existing REST Read APIs]
  end

  db[(PostgreSQL)]
  web[Next.js Web App]

  providerLive --> liveAdapter
  providerRest --> pollFallback
  liveAdapter --> normalizer
  pollFallback --> normalizer
  normalizer --> db
  normalizer --> streamGateway
  db --> readApi

  web --> readApi
  streamGateway --> web
```

Design guardrails:

- Keep current REST endpoints backward compatible.
- Keep provider adapter boundary explicit so sources can be swapped.
- Use fallback polling whenever live transport is unavailable.

Roadmap source:

- `AGENTS.md`
