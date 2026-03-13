# 08. Live Provider Persistence

This diagram documents the local-first provider capture flow planned for live analysis.

```mermaid
flowchart LR
  provider["Formula 1 Live SignalR\nlivetiming.formula1.com/signalr"]
  browser["Browser\n/live"]
  backups["Daily SQL Backups\n./.data/backups"]

  subgraph Api[API Container]
    adapter["SignalR Provider Adapter"]
    capture["Live Capture Service\nraw events + topic catalog"]
    projector["Live State Projection\nsnapshots + SSE payloads"]
    stream["/api/live/stream"]
    state["/api/live/state"]
    cleanup["Retention Cleanup Cron"]
  end

  subgraph Db[PostgreSQL]
    raw[("live_provider_event")]
    runs[("live_capture_run")]
    snapshots[("live_session_snapshot")]
    catalog[("live_topic_schema_catalog")]
  end

  subgraph LocalFs[Local Workspace Storage]
    datadir["./.data/postgres\nbind-mounted PGDATA"]
  end

  provider --> adapter
  adapter --> capture
  adapter --> projector
  capture --> raw
  capture --> runs
  capture --> catalog
  projector --> snapshots
  cleanup --> raw
  cleanup --> snapshots
  cleanup --> runs
  stream --> browser
  state --> browser
  snapshots --> state
  snapshots --> stream
  Db --> datadir
  Db --> backups
```

Implementation notes:

- Raw provider messages are persisted after decode and before application-level projection.
- Normalized session snapshots are persisted separately so `/api/live/state` can recover from process restarts.
- Snapshot rows are append-only, versioned checkpoints keyed by session, with the latest row marked for fast restore.
- Each snapshot stores internal state, public state, projection metadata, and per-topic freshness metadata so `/api/live/board` and stabilized public ordering can recover more faithfully after restarts.
- Raw events and local SQL backups are both retained for 30 days in the local-only capture workflow.
- The bind-mounted Postgres datadir keeps captured data on disk even when containers are recreated.
- Topic schema catalog rows summarize observed payload shapes over time without exposing raw provider payloads to the web client.

Source of truth:

- `apps/api/src/live/live.provider.adapter.ts`
- `apps/api/src/live/live.capture.service.ts`
- `apps/api/src/live/live.capture.scheduler.ts`
- `apps/api/src/live/live.service.ts`
- `apps/api/prisma/schema.prisma`
- `compose.yml`
