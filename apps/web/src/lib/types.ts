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

export interface DriverStandingsResponse {
  season: number;
  round: number | null;
  previousRound: number | null;
  availableRounds: number[];
  freshness: Freshness;
  meta: PaginationMeta;
  standings: DriverStandingItem[];
}

export interface ConstructorStandingsResponse {
  season: number;
  round: number | null;
  previousRound: number | null;
  availableRounds: number[];
  freshness: Freshness;
  meta: PaginationMeta;
  standings: ConstructorStandingItem[];
}

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
  source: 'simulator' | 'provider';
  eventType: 'initial_state' | 'delta_update' | 'heartbeat' | 'status';
  emittedAt: string;
  payload: TPayload;
}
