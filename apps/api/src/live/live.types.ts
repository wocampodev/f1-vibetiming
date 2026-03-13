export type LiveFeedSource = 'simulator' | 'provider';

export type LiveStreamEventType =
  | 'initial_state'
  | 'delta_update'
  | 'heartbeat'
  | 'status';

export type LiveStreamStatus = 'connecting' | 'live' | 'degraded' | 'stopped';

export type LiveFlagStatus =
  | 'green'
  | 'yellow'
  | 'red'
  | 'safety_car'
  | 'virtual_safety_car'
  | 'checkered';

export interface LiveSessionState {
  weekendId: string | null;
  sessionId: string | null;
  sessionName: string | null;
  phase: 'running' | 'finished' | 'unknown';
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
  | 'on_track'
  | 'pit_lane'
  | 'pit_out'
  | 'pit_garage'
  | 'in_pit'
  | 'off_track'
  | 'stopped'
  | 'unknown';

export type LivePositionSource =
  | 'simulator'
  | 'timing_data'
  | 'best_lap'
  | 'last_lap'
  | 'driver_code';

export type LivePositionConfidence = 'high' | 'medium' | 'low';

export interface LiveMiniSector {
  sector: number;
  segment: number;
  status: number;
  active: boolean;
}

export interface LiveLeaderboardEntry {
  position: number;
  driverNumber: string;
  driverCode: string;
  driverName: string | null;
  teamName: string | null;
  trackStatus: string | null;
  pitState: LivePitState | null;
  pitStops: number | null;
  speedKph: number | null;
  topSpeedKph: number | null;
  gapToLeaderSec: number | null;
  gapToLeaderText: string | null;
  intervalToAheadSec: number | null;
  intervalToAheadText: string | null;
  sector1Ms: number | null;
  sector2Ms: number | null;
  sector3Ms: number | null;
  bestSector1Ms: number | null;
  bestSector2Ms: number | null;
  bestSector3Ms: number | null;
  lastLapMs: number | null;
  bestLapMs: number | null;
  completedLaps: number | null;
  speedHistoryKph: LiveSpeedSample[];
  trackStatusHistory: LiveTrackStatusSample[];
  miniSectors: LiveMiniSector[];
  tireCompound: 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET' | null;
  stintLap: number | null;
  tireIsNew: boolean | null;
  positionSource: LivePositionSource;
  positionUpdatedAt: string | null;
  positionConfidence: LivePositionConfidence;
}

export type LivePublicLeaderboardEntry = Omit<
  LiveLeaderboardEntry,
  | 'driverNumber'
  | 'trackStatus'
  | 'pitState'
  | 'pitStops'
  | 'speedKph'
  | 'topSpeedKph'
  | 'gapToLeaderText'
  | 'intervalToAheadText'
  | 'completedLaps'
  | 'miniSectors'
  | 'tireCompound'
  | 'stintLap'
  | 'tireIsNew'
  | 'positionSource'
  | 'positionUpdatedAt'
  | 'positionConfidence'
>;

export interface LiveBoardSectorCell {
  index: number;
  valueMs: number | null;
  personalBestMs: number | null;
  sessionBestMs: number | null;
}

export interface LiveBoardTireState {
  compound: LiveLeaderboardEntry['tireCompound'];
  ageLaps: number | null;
  isNew: boolean | null;
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

export interface LiveBoardProjectionState {
  mode: 'pass_through' | 'stabilized' | 'withheld';
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

export interface LiveTopicFreshnessEntry {
  topic: string;
  lastSeenAt: string | null;
  messageCount: number;
}

export interface LiveTopicFreshnessState {
  capturedAt: string;
  topics: LiveTopicFreshnessEntry[];
}

export interface LiveTopicFreshnessHealthEntry extends LiveTopicFreshnessEntry {
  ageSeconds: number | null;
}

export interface LiveTopicFreshnessHealthState {
  capturedAt: string;
  topics: LiveTopicFreshnessHealthEntry[];
}

export interface LiveBoardState {
  generatedAt: string;
  session: LiveSessionState;
  fastestBestLapMs: number | null;
  rows: LiveBoardRow[];
  raceControl: LiveRaceControlMessage[];
  projection: LiveBoardProjectionState;
}

export interface LiveRaceControlMessage {
  id: string;
  emittedAt: string;
  category: 'flag' | 'control' | 'incident' | 'pit';
  message: string;
  flag?: LiveFlagStatus;
}

export interface LiveState {
  generatedAt: string;
  session: LiveSessionState;
  leaderboard: LiveLeaderboardEntry[];
  raceControl: LiveRaceControlMessage[];
}

export interface LivePublicState {
  generatedAt: string;
  session: LiveSessionState;
  leaderboard: LivePublicLeaderboardEntry[];
  raceControl: LiveRaceControlMessage[];
}

export interface LiveDeltaPayload {
  changedFields: string[];
  state: LivePublicState;
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
  source: LiveFeedSource;
  eventType: LiveStreamEventType;
  emittedAt: string;
  payload: TPayload;
}

export type LiveAdapterEvent =
  | { type: 'initial_state'; state: LiveState }
  | { type: 'delta_update'; state: LiveState; changedFields: string[] }
  | { type: 'heartbeat'; at: string }
  | { type: 'status'; status: LiveStreamStatus; message: string };

export interface LiveAdapterHealth {
  running: boolean;
  startedAt: string | null;
  lastEventAt: string | null;
  tickMs: number;
  heartbeatMs: number;
  seed: number | null;
  speedMultiplier: number | null;
  details?: Record<string, unknown>;
}
