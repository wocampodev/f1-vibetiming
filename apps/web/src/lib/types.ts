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
