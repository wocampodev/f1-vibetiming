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
  weekendId: string;
  sessionId: string;
  sessionName: string;
  phase: 'running' | 'finished';
  flag: LiveFlagStatus;
  currentLap: number;
  totalLaps: number;
  clockIso: string;
}

export interface LiveLeaderboardEntry {
  position: number;
  driverCode: string;
  driverName: string;
  teamName: string;
  gapToLeaderSec: number;
  intervalToAheadSec: number;
  sector1Ms: number;
  sector2Ms: number;
  sector3Ms: number;
  lastLapMs: number;
  bestLapMs: number;
  tireCompound: 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET';
  stintLap: number;
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
}
