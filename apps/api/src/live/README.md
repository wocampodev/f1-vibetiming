# Live Module Map

This folder contains the provider-first live runtime for F1 VibeTiming.

## Public entry points

- `live.module.ts`: Nest wiring for the live runtime
- `live.controller.ts`: HTTP and SSE surface (`/api/live/*`)
- `live.service.ts`: runtime orchestrator for restore, adapter events, public projection, and health

## Provider pipeline

- `live.provider.adapter.ts`: SignalR transport, reconnect loop, subscribe/unsubscribe, and raw provider event publishing
- `live.provider.protocol.ts`: SignalR frame parsing, topic decode, and cookie/session protocol helpers
- `live.provider.values.ts`: generic parsing primitives and low-level value normalization helpers
- `live.provider.topic-parsers.ts`: provider-domain parsing helpers for flags, gaps, sectors, tires, race control, and topic-specific semantics
- `live.provider.leaderboard.draft.ts`: draft leaderboard row assembly from merged provider maps
- `live.provider.leaderboard.positioning.ts`: leaderboard ordering, fallback positioning, and derived gap resolution
- `live.provider.leaderboard.ts`: compatibility barrel for leaderboard helpers
- `live.provider.store.ts`: merged provider map store for drivers, timing, timing stats, timing app, telemetry, and position topics
- `live.provider.session.ts`: session metadata and race-control state accumulator
- `live.provider.state.ts`: provider reducer that coordinates the telemetry store and session state into a `LiveState`

## Public projection and board shaping

- `live.public-state.ts`: public-state stabilization and projection-memory restore logic
- `live.board.ts`: browser-facing `/api/live/board` projection builder
- `live.topic-freshness.ts`: topic freshness payload builder from adapter diagnostics

## Persistence and replay

- `live.capture.service.ts`: provider raw-event persistence, snapshot persistence, retention, and restore bundle loading
- `live.capture.scheduler.ts`: retention cleanup scheduling
- `live.replay.service.ts`: provider-session replay and ranking audit helpers from persisted events

## Shared support

- `live.adapter.ts`: adapter interface used by `live.service.ts`
- `live.types.ts`: canonical shared types for internal runtime, public state, board state, health, and SSE envelopes
- `live.driver-roster.ts`: local driver/team fallback roster for incomplete provider identity payloads
- `live.provider.logging.ts`: provider logging mode parsing and safe log formatting

## Naming guide

- `*.adapter.ts`: transport boundary
- `*.protocol.ts`: wire-level parsing and framing
- `*.values.ts`: generic scalar/object normalization helpers
- `*.topic-parsers.ts`: provider topic/domain parsing helpers
- `*.store.ts`: merged mutable maps keyed by driver/topic identity
- `*.session.ts`: session-scoped metadata and race-control state
- `*.state.ts`: reducer/coordinator that turns inputs into `LiveState`
- `*.public-state.ts`: projection from internal state to public state
- `*.board.ts`: UI-facing board shaping
- `*.replay.service.ts` / `*.capture.service.ts`: persistence and restore workflows

## Reading order

1. `live.module.ts`
2. `live.controller.ts`
3. `live.service.ts`
4. `live.provider.adapter.ts`
5. `live.provider.protocol.ts`
6. `live.provider.state.ts`
7. `live.provider.store.ts`
8. `live.provider.session.ts`
9. `live.provider.leaderboard.ts`
10. `live.public-state.ts`
11. `live.board.ts`
12. `live.capture.service.ts`
13. `live.replay.service.ts`
