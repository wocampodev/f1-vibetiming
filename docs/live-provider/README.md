# Live Provider Analysis

This folder tracks how the local provider capture pipeline is intended to work and what has been observed so far.

## Goals

- Capture decoded provider messages in PostgreSQL for 30 days.
- Persist normalized live session snapshots so `/api/live/state` does not depend only on in-memory process state.
- Build a durable catalog of provider topics and payload shape variants.
- Keep curated, human-readable documentation in the repo while leaving high-volume raw data in Postgres.

## Capture Strategy

- Logs remain useful for real-time observation, but they are not the source of truth.
- The API captures provider messages inside `LiveProviderAdapter` immediately after decode and before projection.
- Captured messages are written into `live_provider_event`.
- Normalized live snapshots are written into `live_session_snapshot`.
- Topic shape summaries are upserted into `live_topic_schema_catalog`.

## Local Storage

- PostgreSQL data directory: `./.data/postgres`
- Daily SQL backups: `./.data/backups`
- Backup retention: 30 days
- Raw provider event retention in DB: 30 days

## Local Runbook

Primary operational entrypoint:

```bash
make help
```

Start provider capture locally:

```bash
make stack-up-provider-capture
make logs-api
```

Force an immediate SQL backup:

```bash
make backup-now
```

Inspect the current capture summary from the repo root:

```bash
make provider-inspect
```

Inspect the latest payloads for a specific topic:

```bash
make provider-inspect-topic TOPIC=TimingData
```

Export the current DB-backed capture summary into repo-readable reports:

```bash
make provider-export
```

Inspect the latest capture rows:

```bash
make provider-psql
```

Suggested SQL checks:

```sql
select topic, count(*)
from "LiveProviderEvent"
group by topic
order by count(*) desc;

select topic, rawTopic, observations, decodeErrorCount, lastSeenAt
from "LiveTopicSchemaCatalog"
order by lastSeenAt desc;
```

## Repo Artifacts

- `topic-catalog.md`: human-readable topic inventory and notes
- `topic-catalog.json`: structured export of the current observed topic inventory
- `initial-capture-2026-03-07-australia-qualifying.md`: first real-provider capture note
- `samples/`: curated representative payloads taken from observed provider traffic
- `reports/latest-capture-summary.md`: generated snapshot of current DB-backed counts
- `reports/latest-capture-summary.json`: generated structured export of the same snapshot
- `../architecture/08-live-provider-persistence.md`: architecture view of capture and backup flow

## Current Reality

- The first real capture has now observed `SessionInfo`, `SessionStatus`, `TrackStatus`, `DriverList`, `TimingData`, `TimingStats`, `TimingAppData`, `RaceControlMessages`, and `ExtrapolatedClock`.
- `LapCount`, `CarData.z`, and `Position.z` still have not appeared in the initial qualifying window.
- Real traffic already confirmed that `RaceControlMessages.Messages` can be either an array or a keyed object.
- The API now has a `LiveReplayService` foundation for replaying one persisted session and auditing risky ranking inputs from `live_provider_event` rows.

## Future Follow-Up

- Export captured topic summaries from Postgres into the JSON and Markdown files in this folder.
- Add replay tooling that rebuilds a session snapshot from `live_provider_event` rows.
- Move `/api/live/state` recovery to persisted snapshots first, with in-memory state as a short-lived cache.
