# Provider Topic Catalog

Current status: real-provider captures recorded on `2026-03-07` for Australian Grand Prix qualifying and on `2026-03-08` for the race, both including late-session finalisation traffic.

## Capture Snapshot

- Snapshot taken at `2026-03-07T06:25:06Z`
- Active run: `provider:australian-grand-prix:australian-grand-prix-qualifying`
- Raw events captured across local runs at snapshot time: `12593`
- Decode errors at snapshot time: `0`
- Observed topics: `9 / 12` subscribed topics
- Not yet observed in this capture window: `LapCount`, `CarData.z`, `Position.z`

## Observed Topics

| Raw topic | Normalized topic | Events @ snapshot | Shapes @ snapshot | Observed structure notes | Samples |
| --- | --- | ---: | ---: | --- | --- |
| `SessionInfo` | `SessionInfo` | 2 | 1 | nested meeting metadata under `Meeting`; session identity under `Key`, `Name`, `Type`, `Path`; `_kf` present; repeated later with `SessionStatus: Finalised` | `samples/session-info.qualifying.json` |
| `SessionStatus` | `SessionStatus` | 15 | 1 | simple root object with `_kf`, `Status`, `Started`; observed values included `Started`, `Inactive`, `Aborted`, `Finished`, and `Finalised` | `samples/session-status.started.json` |
| `LapCount` | `LapCount` | 0 | 0 | subscribed but not seen in this qualifying window | - |
| `TrackStatus` | `TrackStatus` | 14 | 1 | simple root payload with `_kf`, numeric/string `Status`, and textual `Message`; observed `AllClear`, `Yellow`, and `Red` late in the session | `samples/track-status.all-clear.json` |
| `DriverList` | `DriverList` | 143 | 1 | root object keyed directly by racing number; only `Line` observed, no names/teams in payload | `samples/driver-list.line-only.json` |
| `TimingData` | `TimingData` | 11123 | 246 | highly sparse incremental updates; dominant shapes are `Sectors.*.Segments.*.Status`, `PreviousValue`, `Status`, speed traps, pit state, lap times, and occasional richer line snapshots with `Position`, `Stats`, `BestLapTime`, `BestLapTimes`, `Cutoff`, `ShowPosition` | `samples/timing-data.segment-status.json`, `samples/timing-data.previous-value.json`, `samples/timing-data.line-snapshot.json` |
| `TimingStats` | `TimingStats` | 581 | 20 | mostly `BestSectors` and `BestSpeeds` by trap; `PersonalBestLapTime` appears less often; `_deleted` array observed inside `PersonalBestLapTime` | `samples/timing-stats.best-sectors.json`, `samples/timing-stats.personal-best-lap.json` |
| `TimingAppData` | `TimingAppData` | 604 | 15 | mixed `Line` reorder updates plus stint lifecycle objects; `Stints` seen as both object-map and array; lap-level updates carry `LapTime`, `LapFlags`, `LapNumber` | `samples/timing-app-data.stint-declare.json`, `samples/timing-app-data.stint-lap-time.json` |
| `CarData.z` | `CarData` | 0 | 0 | subscribed but not seen in this qualifying window | - |
| `Position.z` | `Position` | 0 | 0 | subscribed but not seen in this qualifying window | - |
| `RaceControlMessages` | `RaceControlMessages` | 99 | 4 | observed both as `Messages` array and as object keyed by provider ids; keyed-object variants carried `CLEAR`, `DOUBLE YELLOW`, and control messages like `Q1 WILL RESUME AT 16:19` | `samples/race-control.array-green-light.json`, `samples/race-control.object-penalty.json` |
| `ExtrapolatedClock` | `ExtrapolatedClock` | 12 | 2 | root object with `Utc`, `Remaining`, `Extrapolating`; later payload flipped `Extrapolating` to `false` and updated `Remaining` | `samples/extrapolated-clock.initial.json` |

## Key Findings From Initial Capture

- `TimingData` is still the highest-churn topic by far and should be treated as an append-only stream of micro-patches, not as full rows.
- `DriverList` did not provide driver identity in this session; only `Line` ordering was seen, so local roster fallback remains important.
- `TrackStatus` did eventually appear as a tiny control payload and covered `AllClear`, `Yellow`, and `Red` states.
- `RaceControlMessages` is polymorphic in real traffic: the first message arrived as an array, later messages arrived as keyed objects.
- `SessionStatus` stayed shape-stable while its semantic values evolved through the session lifecycle (`Started` -> `Aborted`/`Inactive` -> `Finished` -> `Finalised`).
- `TimingData.Stats.0` used mixed spellings for interval fields, including `TimeDifftoPositionAhead` with a lowercase `to`.
- `TimingAppData.Stints` arrived both as object-map updates and as array payloads containing empty lists for many cars.
- Neither of the subscribed compressed telemetry topics (`CarData.z`, `Position.z`) appeared during this initial qualifying capture window, and `LapCount` also never arrived.

## Parser Notes After Real Capture

- The adapter now tolerates both `RaceControlMessages.Messages` arrays and keyed objects.
- The gap/interval mapper now accepts `TimeDifftoFastest`, `TimeDifftoFirst`, and `TimeDifftoPositionAhead` alongside the existing camel-case aliases.
- `TimingData` still preserves previous sector display values while segment-status-only updates stream in.

## Next Catalog Updates

- Extend this catalog further when `CarData.z` or `Position.z` finally appear.
- Export first/last seen data for each shape signature once the current session ends.
- Curate any unusual payloads with deletion markers or new nested keys into additional sample files.

## Race Capture Update

- The race capture finally observed `LapCount` continuously and confirmed that it is reliable enough to anchor session-lap display.
- `TimingData` during the race also emitted explicit `InPit`, `PitOut`, `NumberOfPitStops`, `NumberOfLaps`, and lap-gap text such as `1L`, which is useful for a richer board projection.
- `TimingAppData` during the race emitted richer stint payloads with `Compound`, `TotalLaps`, `LapNumber`, `LapFlags`, and `New`, which is enough to build tyre-age and used/new indicators without waiting for compressed telemetry topics.
- `TrackStatus` still appeared only sparsely in the race capture, so it remains a weak source for continuous row-level state.
- `CarData.z` and `Position.z` still did not appear, so the near-term rich board should continue to treat them as optional enhancements rather than hard dependencies.
