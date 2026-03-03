export interface Freshness {
  updatedAt: string | null;
  ageSeconds: number | null;
}

export interface SessionSummary {
  id: string;
  name: string;
  type: string;
  startsAt: string;
  status: string;
}

export interface EventSummary {
  id: string;
  season: number;
  round: number;
  name: string;
  circuitName: string;
  locality: string | null;
  country: string | null;
  raceStartTime: string;
  sessions: SessionSummary[];
}

export interface CalendarResponse {
  season: number;
  freshness: Freshness;
  events: EventSummary[];
}

export interface WeekendResponse {
  freshness: Freshness;
  event: Omit<EventSummary, "sessions">;
  sessions: SessionSummary[];
}

export interface SessionResultItem {
  position: number | null;
  grid: number | null;
  points: number | null;
  laps: number | null;
  status: string | null;
  time: string | null;
  q1: string | null;
  q2: string | null;
  q3: string | null;
  fastestLapTime: string | null;
  fastestLapRank: number | null;
  driver: {
    id: string;
    externalId: string;
    code: string | null;
    number: number | null;
    givenName: string;
    familyName: string;
  };
  team: {
    id: string;
    externalId: string;
    name: string;
  } | null;
}

export interface SessionResultsResponse {
  freshness: Freshness;
  session: {
    id: string;
    eventId: string;
    eventName: string;
    round: number;
    season: number;
    name: string;
    type: string;
    startsAt: string;
    status: string;
  };
  results: SessionResultItem[];
}

export interface DriverStandingItem {
  position: number;
  points: number;
  wins: number;
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
  position: number;
  points: number;
  wins: number;
  team: {
    id: string;
    externalId: string;
    name: string;
    nationality: string | null;
  };
}

export interface DriverStandingsResponse {
  season: number;
  freshness: Freshness;
  standings: DriverStandingItem[];
}

export interface ConstructorStandingsResponse {
  season: number;
  freshness: Freshness;
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
  source: 'simulator' | 'provider';
  eventType: 'initial_state' | 'delta_update' | 'heartbeat' | 'status';
  emittedAt: string;
  payload: TPayload;
}
