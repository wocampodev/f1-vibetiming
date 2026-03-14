export interface Freshness {
  updatedAt: string | null;
  ageSeconds: number | null;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface DriverStandingItem {
  round: number;
  position: number;
  points: number;
  wins: number;
  gapToLeaderPoints: number | null;
  gapToAheadPoints: number | null;
  previousRoundPosition: number | null;
  positionDelta: number | null;
  pointsDelta: number | null;
  driver: {
    id: string;
    externalId: string;
    givenName: string;
    familyName: string;
    code: string | null;
    number: number | null;
    nationality: string | null;
  };
  team: {
    id: string;
    externalId: string;
    name: string;
  } | null;
}

export interface ConstructorStandingItem {
  round: number;
  position: number;
  points: number;
  wins: number;
  gapToLeaderPoints: number | null;
  gapToAheadPoints: number | null;
  previousRoundPosition: number | null;
  positionDelta: number | null;
  pointsDelta: number | null;
  team: {
    id: string;
    externalId: string;
    name: string;
    nationality: string | null;
  };
}

export interface StandingsSnapshot {
  season: number;
  round: number | null;
  previousRound: number | null;
  availableRounds: number[];
  freshness: Freshness;
  meta: PaginationMeta;
}

export interface DriverStandingsResponse extends StandingsSnapshot {
  standings: DriverStandingItem[];
}

export interface ConstructorStandingsResponse extends StandingsSnapshot {
  standings: ConstructorStandingItem[];
}

export type LiveStreamStatus = "connecting" | "live" | "degraded" | "stopped";

export type LiveFlagStatus =
  | "green"
  | "yellow"
  | "red"
  | "safety_car"
  | "virtual_safety_car"
  | "checkered";

export type LiveSessionPhase = "running" | "finished" | "unknown";

export type TireCompound = "SOFT" | "MEDIUM" | "HARD" | "INTERMEDIATE" | "WET";

export type LiveRaceControlCategory = "flag" | "control" | "incident" | "pit";

export interface LiveSessionState {
  weekendId: string | null;
  sessionId: string | null;
  sessionName: string | null;
  phase: LiveSessionPhase;
  flag: LiveFlagStatus;
  currentLap: number | null;
  totalLaps: number | null;
  clockIso: string | null;
}

export interface LiveSpeedSample {
  at: string;
  kph: number;
}

export interface LiveTrackStatusSample {
  at: string;
  status: string;
}

export type LivePitState =
  | "on_track"
  | "pit_lane"
  | "pit_out"
  | "pit_garage"
  | "in_pit"
  | "off_track"
  | "stopped"
  | "unknown";

export type LivePositionSource =
  | "timing_data"
  | "best_lap"
  | "last_lap"
  | "driver_code";

export type LivePositionConfidence = "high" | "medium" | "low";

export interface LiveMiniSector {
  sector: number;
  segment: number;
  status: number;
  active: boolean;
}

export interface LiveLeaderboardEntry {
  position: number;
  driverCode: string;
  driverName: string | null;
  teamName: string | null;
  gapToLeaderSec: number | null;
  intervalToAheadSec: number | null;
  sector1Ms: number | null;
  sector2Ms: number | null;
  sector3Ms: number | null;
  bestSector1Ms: number | null;
  bestSector2Ms: number | null;
  bestSector3Ms: number | null;
  lastLapMs: number | null;
  bestLapMs: number | null;
  speedHistoryKph: LiveSpeedSample[];
  trackStatusHistory: LiveTrackStatusSample[];
}

export interface LiveRaceControlMessage {
  id: string;
  emittedAt: string;
  category: LiveRaceControlCategory;
  message: string;
  flag?: LiveFlagStatus;
}

export interface LiveState {
  generatedAt: string;
  session: LiveSessionState;
  leaderboard: LiveLeaderboardEntry[];
  raceControl: LiveRaceControlMessage[];
}

export interface LiveBoardSectorCell {
  index: number;
  valueMs: number | null;
  personalBestMs: number | null;
  sessionBestMs: number | null;
}

export interface LiveBoardTireState {
  compound: TireCompound | null;
  ageLaps: number | null;
  isNew: boolean | null;
}

export interface LiveBoardProjectionState {
  mode: "pass_through" | "stabilized" | "withheld";
  lowConfidenceLeaderSuppressions: number;
  lastLowConfidenceLeaderAt: string | null;
  lastLowConfidenceLeaderCode: string | null;
  lastLowConfidenceLeaderSource: LivePositionSource | null;
  lastLowConfidenceLeaderConfidence: LivePositionConfidence | null;
  internalLeaderboardRows: number;
  publicLeaderboardRows: number;
  internalLeaderCode: string | null;
  internalLeaderSource: LivePositionSource | null;
  internalLeaderConfidence: LivePositionConfidence | null;
  publicLeaderCode: string | null;
}

export interface LiveBoardRow {
  position: number;
  driverNumber: string;
  driverCode: string;
  driverName: string | null;
  teamName: string | null;
  teamKey: string | null;
  teamColor: string | null;
  completedLaps: number | null;
  intervalToAheadSec: number | null;
  intervalToAheadText: string | null;
  gapToLeaderSec: number | null;
  gapToLeaderText: string | null;
  pitState: LivePitState | null;
  pitStops: number | null;
  tire: LiveBoardTireState;
  bestLapMs: number | null;
  lastLapMs: number | null;
  lastSectors: LiveBoardSectorCell[];
  bestSectors: LiveBoardSectorCell[];
  miniSectors: LiveMiniSector[];
  positionSource: LivePositionSource;
  positionUpdatedAt: string | null;
  positionConfidence: LivePositionConfidence;
  isSessionFastestLap: boolean;
}

export interface LiveBoardState {
  generatedAt: string;
  session: LiveSessionState;
  fastestBestLapMs: number | null;
  rows: LiveBoardRow[];
  raceControl: LiveRaceControlMessage[];
  projection: LiveBoardProjectionState;
}

export interface LiveTopicFreshnessEntry {
  topic: string;
  lastSeenAt: string | null;
  messageCount: number;
}

export interface LiveTopicFreshnessHealthEntry extends LiveTopicFreshnessEntry {
  ageSeconds: number | null;
}

export interface LiveTopicFreshnessHealthState {
  capturedAt: string;
  topics: LiveTopicFreshnessHealthEntry[];
}

export interface LiveCaptureHealthState {
  enabled: boolean;
  activeRunId: string | null;
  activeRunStartedAt: string | null;
  latestSnapshotAt: string | null;
  latestSnapshotVersion: number | null;
  latestSnapshotSessionKey: string | null;
  latestSnapshotTopicFreshness: LiveTopicFreshnessHealthState | null;
  rawRetentionDays: number | null;
  snapshotRetentionDays: number | null;
  restoreMaxAgeSec: number | null;
}

export interface LiveHealthDetails {
  socketOpen?: boolean;
  connectionUptimeSec?: number | null;
  feedMessagesReceived?: number;
  topics?: string[];
  topicMessageCount?: Record<string, number>;
  topicLastSeenAt?: Record<string, string>;
  capture?: LiveCaptureHealthState | null;
  publicProjection?: LiveBoardProjectionState | null;
}

export interface LiveHealthState {
  source: "provider";
  status: LiveStreamStatus;
  running: boolean;
  startedAt: string | null;
  lastEventAt: string | null;
  heartbeatMs: number;
  details?: LiveHealthDetails | null;
}

export interface LiveDeltaPayload {
  changedFields: string[];
  state: LiveState;
}

export interface LiveHeartbeatPayload {
  at: string;
}

export interface LiveStatusPayload {
  status: LiveStreamStatus;
  message: string;
}

export interface LiveEnvelope<TPayload> {
  sequence: number;
  source: "provider";
  eventType: "initial_state" | "delta_update" | "heartbeat" | "status";
  emittedAt: string;
  payload: TPayload;
}
