export interface ErgastSessionInfo {
  date: string;
  time?: string;
}

export interface ErgastRace {
  season: string;
  round: string;
  raceName: string;
  date: string;
  time?: string;
  Circuit: {
    circuitName: string;
    Location: {
      locality: string;
      country: string;
    };
  };
  FirstPractice?: ErgastSessionInfo;
  SecondPractice?: ErgastSessionInfo;
  ThirdPractice?: ErgastSessionInfo;
  Qualifying?: ErgastSessionInfo;
  Sprint?: ErgastSessionInfo;
  SprintQualifying?: ErgastSessionInfo;
}

export interface ErgastConstructor {
  constructorId: string;
  name: string;
  nationality?: string;
}

export interface ErgastDriver {
  driverId: string;
  code?: string;
  permanentNumber?: string;
  givenName: string;
  familyName: string;
  nationality?: string;
}

export interface ErgastRaceResult {
  position?: string;
  grid?: string;
  points?: string;
  laps?: string;
  status?: string;
  Time?: {
    time?: string;
  };
  FastestLap?: {
    rank?: string;
    Time?: {
      time?: string;
    };
  };
  Driver: ErgastDriver;
  Constructor: ErgastConstructor;
}

export interface ErgastQualifyingResult {
  position?: string;
  Q1?: string;
  Q2?: string;
  Q3?: string;
  Driver: ErgastDriver;
  Constructor: ErgastConstructor;
}

export interface ErgastDriverStanding {
  position: string;
  points: string;
  wins: string;
  Driver: ErgastDriver;
  Constructors: ErgastConstructor[];
}

export interface ErgastConstructorStanding {
  position: string;
  points: string;
  wins: string;
  Constructor: ErgastConstructor;
}

export interface DriverStandingsPayload {
  round: number;
  items: ErgastDriverStanding[];
}

export interface ConstructorStandingsPayload {
  round: number;
  items: ErgastConstructorStanding[];
}
