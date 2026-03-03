# F1 VibeTiming Backlog

Last updated: 2026-03-03

## Product Focus

- Live dashboard at `/` and `/live` powered by real upstream live timing data.
- Championship standings at `/standings` with actionable context (round, gaps, freshness).
- No synthetic runtime fallback data in default application behavior.

## Current Delivery Tracks

### Track 1 - Live Provider Runtime

- [x] LIVE-001 Keep simulator available only as explicit local-dev opt-in.
- [x] LIVE-002 Make provider source the default live runtime path.
- [x] LIVE-003 Remove runtime approval gate from adapter selection.
- [x] LIVE-004 Add SignalR provider transport bootstrap (`negotiate`/`connect`/`start`).
- [x] LIVE-005 Add provider reconnect/backoff and heartbeat loop.
- [x] LIVE-006 Normalize provider feed updates into live state envelopes.
- [x] LIVE-007 Harden topic decoding coverage for additional upstream message variants (`TimingStats`, `CarData`, `Position`).
- [x] LIVE-008 Add integration-style tests for provider message normalization and raw frame parsing.
- [x] LIVE-009 Add bounded speed history and track-status timeline data to normalized leaderboard entries.
- [x] LIVE-010 Add provider diagnostics counters for frame parse failures, compressed decode failures, and per-topic throughput.
- [x] LIVE-011 Add mixed-frame fixture coverage for malformed SignalR frames and compressed decode fallbacks.

### Track 2 - Live Dashboard Quality

- [x] DASH-001 Add stream lifecycle state machine (connect/reconnect/degraded).
- [x] DASH-002 Add fallback polling from `/api/live/state` during stream disruption.
- [x] DASH-003 Add health diagnostics paneling from `/api/live/health`.
- [x] DASH-004 Render partial/null-safe timing data without synthetic placeholders.
- [x] DASH-005 Add race-control strip and flag context on the live board.
- [x] DASH-006 Add speed trend sparkline and track-status timeline rendering per leaderboard row.
- [x] DASH-007 Expand diagnostics panel with socket, throughput, and parser reliability metrics.

### Track 3 - Standings Depth

- [x] STAND-001 Enrich standings API with round and points-gap context.
- [x] STAND-002 Upgrade standings UI with gap-to-leader and gap-to-ahead columns.
- [ ] STAND-003 Add standings round selector and previous-round delta movement.
- [ ] STAND-004 Add standings history persistence by round.

### Track 4 - Cleanup and Documentation

- [x] CLEAN-001 Remove old scope references from web client types/API helpers.
- [x] CLEAN-002 Remove deprecated planning tracks and approval-gate docs references.
- [x] CLEAN-003 Align handoff docs with current runtime strategy.
- [ ] CLEAN-004 Final pass: remove stale architecture terms after provider soak testing.

## Validation Gates

- `pnpm --filter api test`
- `pnpm --filter web lint`
- `pnpm --filter web test:smoke`
- `pnpm build`
