# 07. Live Mode Extension (Phase 2)

This is the target extension path without breaking current MVP contracts.

Delivery strategy for Phase 2:

- Build and validate the pipeline with a simulator/replay source first.
- Keep the live-provider adapter behind a legal/compliance gate.
- Enable real-provider production traffic only after legal sign-off.

```mermaid
flowchart LR
  providerLive["Live Feed Provider<br/>SignalR or equivalent"]
  providerSim["Simulator / Replay Source"]
  legalGate{"Provider Legal Gate"}
  providerRest["Public REST Provider<br/>Jolpica/Ergast"]

  subgraph Api[API Service]
    liveAdapter[Live Adapter]
    pollFallback[Polling Fallback]
    normalizer[Live Event Normalizer]
    streamGateway[WebSocket Gateway]
    readApi[Existing REST Read APIs]
  end

  db[(PostgreSQL)]
  web[Next.js Web App]

  providerLive --> legalGate
  legalGate --> liveAdapter
  providerSim --> liveAdapter
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
- Treat legal/provider approval as a release gate for non-simulator live feeds.

Roadmap source:

- `AGENTS.md`
