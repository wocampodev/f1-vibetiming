# Initial Capture - 2026-03-07 Australia Qualifying

This note freezes the first real provider observations captured after the local persistence pipeline was enabled, including the later session-finalisation traffic.

## Snapshot

- Snapshot taken at `2026-03-07T06:25:06Z`
- Active run: `provider:australian-grand-prix:australian-grand-prix-qualifying`
- Raw events captured across local runs at snapshot time: `12593`
- Decode errors: `0`
- Provider transport health at the same time: websocket open, live status, cookies present, no frame parse errors

## Topic Totals At Snapshot Time

| Topic | Events | First seen | Last seen |
| --- | ---: | --- | --- |
| `TimingData` | 11123 | `2026-03-07T05:00:02.960Z` | `2026-03-07T06:22:56.110Z` |
| `TimingAppData` | 604 | `2026-03-07T05:00:05.382Z` | `2026-03-07T06:20:31.349Z` |
| `TimingStats` | 581 | `2026-03-07T05:00:09.007Z` | `2026-03-07T06:20:30.048Z` |
| `DriverList` | 143 | `2026-03-07T05:03:14.053Z` | `2026-03-07T06:20:30.025Z` |
| `RaceControlMessages` | 99 | `2026-03-07T05:00:00.570Z` | `2026-03-07T06:24:25.340Z` |
| `SessionStatus` | 15 | `2026-03-07T05:00:00.195Z` | `2026-03-07T06:23:06.604Z` |
| `TrackStatus` | 14 | `2026-03-07T05:10:17.044Z` | `2026-03-07T06:22:59.354Z` |
| `ExtrapolatedClock` | 12 | `2026-03-07T05:00:01.007Z` | `2026-03-07T06:19:47.006Z` |
| `SessionInfo` | 2 | `2026-03-07T05:00:00.195Z` | `2026-03-07T06:23:06.604Z` |

Not yet observed in this window: `LapCount`, `CarData.z`, `Position.z`.

## What Stood Out

- `TimingData` behaved exactly like a patch stream: most events only changed a single segment status, a speed trap value, or one sector field.
- `DriverList` stayed sparse and only delivered `Line`; the provider did not supply names or teams in the observed payloads.
- `TimingStats` frequently updated rankings (`Position`) without always repeating the actual `Value`.
- `TimingAppData` mixed two responsibilities in the same topic: lineup/order updates via `Line` and tire stint lifecycle data via `Stints`.
- `TrackStatus` did appear late in the session and covered `AllClear`, `Yellow`, and `Red` states.
- `RaceControlMessages` was polymorphic in production traffic: one payload used `Messages` as an array and later messages used `Messages` as objects keyed by ids.
- `SessionStatus` eventually progressed all the way to `Finalised`, confirming the provider emits explicit closeout state changes after the competitive running ends.
- Real provider payloads used the spelling `TimeDifftoPositionAhead`, which is different from the more common `TimeDiffToPositionAhead` alias.

## Parser Adjustments Triggered By This Capture

- Added support for `RaceControlMessages.Messages` as either an array or a keyed object.
- Added `TimeDifftoFastest`, `TimeDifftoFirst`, and `TimeDifftoPositionAhead` aliases to the gap parser.
- Kept the existing previous-sector preservation so the UI does not blank out sectors while only segment-status updates are arriving.

## Sample Payload References

- Session metadata: `samples/session-info.qualifying.json`
- Sparse driver list: `samples/driver-list.line-only.json`
- Segment-status micro-update: `samples/timing-data.segment-status.json`
- Completed-sector carry-forward update: `samples/timing-data.previous-value.json`
- Rich timing row snapshot: `samples/timing-data.line-snapshot.json`
- Timing stats ranking: `samples/timing-stats.best-sectors.json`
- Stint declaration: `samples/timing-app-data.stint-declare.json`
- Race control variants: `samples/race-control.array-green-light.json`, `samples/race-control.object-penalty.json`
- Track status sample: `samples/track-status.all-clear.json`
- Rolling count snapshot: `reports/latest-capture-summary.md`

## Follow-Up After This Session

- Re-run the catalog once the current session ends to capture final counts and any late topics.
- Watch for the first appearance of `LapCount`, `TrackStatus`, `CarData.z`, and `Position.z` in a race session.
- Promote especially useful sample payloads into test fixtures under `apps/api/src/live/fixtures/` once the catalog settles.
