import { SessionStatus, SessionType } from '@prisma/client';
import { ErgastRace } from './ergast.types';

export interface SessionSeed {
  externalId: string;
  type: SessionType;
  name: string;
  startsAt: Date;
  status: SessionStatus;
}

export const toDate = (date: string, time?: string): Date => {
  return new Date(`${date}T${time ?? '00:00:00Z'}`);
};

export const toInt = (value?: string): number | null => {
  if (value == null || value === '') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

export const toNumber = (value?: string): number | null => {
  if (value == null || value === '') {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export const buildSessionSeeds = (
  season: number,
  round: number,
  race: ErgastRace,
  nowMs = Date.now(),
): SessionSeed[] => {
  const sessions: SessionSeed[] = [];

  const pushSession = (
    key: string,
    type: SessionType,
    name: string,
    date?: string,
    time?: string,
  ) => {
    if (!date) {
      return;
    }

    const startsAt = toDate(date, time);
    sessions.push({
      externalId: `${season}-${round}-${key}`,
      type,
      name,
      startsAt,
      status:
        startsAt.getTime() < nowMs
          ? SessionStatus.COMPLETED
          : SessionStatus.SCHEDULED,
    });
  };

  pushSession(
    'practice-1',
    SessionType.PRACTICE_1,
    'Practice 1',
    race.FirstPractice?.date,
    race.FirstPractice?.time,
  );
  pushSession(
    'practice-2',
    SessionType.PRACTICE_2,
    'Practice 2',
    race.SecondPractice?.date,
    race.SecondPractice?.time,
  );
  pushSession(
    'practice-3',
    SessionType.PRACTICE_3,
    'Practice 3',
    race.ThirdPractice?.date,
    race.ThirdPractice?.time,
  );
  pushSession(
    'sprint-qualifying',
    SessionType.SPRINT_QUALIFYING,
    'Sprint Qualifying',
    race.SprintQualifying?.date,
    race.SprintQualifying?.time,
  );
  pushSession(
    'sprint',
    SessionType.SPRINT,
    'Sprint',
    race.Sprint?.date,
    race.Sprint?.time,
  );
  pushSession(
    'qualifying',
    SessionType.QUALIFYING,
    'Qualifying',
    race.Qualifying?.date,
    race.Qualifying?.time,
  );
  pushSession('race', SessionType.RACE, 'Race', race.date, race.time);

  return sessions;
};
