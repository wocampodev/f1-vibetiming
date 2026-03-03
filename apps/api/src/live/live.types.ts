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

export interface LiveLeaderboardEntry {
  position: number;
  driverCode: string;
  driverName: string | null;
  teamName: string | null;
  trackStatus: string | null;
  speedKph: number | null;
  topSpeedKph: number | null;
  gapToLeaderSec: number | null;
  intervalToAheadSec: number | null;
  sector1Ms: number | null;
  sector2Ms: number | null;
  sector3Ms: number | null;
  lastLapMs: number | null;
  bestLapMs: number | null;
  speedHistoryKph: LiveSpeedSample[];
  trackStatusHistory: LiveTrackStatusSample[];
  tireCompound: 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET' | null;
  stintLap: number | null;
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
