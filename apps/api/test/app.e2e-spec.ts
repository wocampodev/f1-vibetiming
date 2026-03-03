import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  IngestionKind,
  IngestionStatus,
  SessionStatus,
  SessionType,
} from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App as SupertestApp } from 'supertest/types';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter';
import { F1Module } from '../src/f1/f1.module';
import { HealthModule } from '../src/health/health.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';

const fallbackDatabaseUrl =
  'postgresql://postgres:postgres@localhost:5432/f1_vibetiming?schema=public';

process.env.DATABASE_URL ??= fallbackDatabaseUrl;

interface CalendarBody {
  season: number;
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  events: Array<{
    name: string;
    sessions: unknown[];
  }>;
}

interface WeekendBody {
  event: {
    id: string;
    round: number;
  };
  sessions: unknown[];
}

interface SessionResultsBody {
  session: {
    type: string;
  };
  results: Array<{
    position: number;
    driver: {
      familyName: string;
    };
  }>;
}

interface DriverStandingsBody {
  round: number | null;
  previousRound: number | null;
  availableRounds: number[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  standings: Array<{
    position: number;
    previousRoundPosition: number | null;
    positionDelta: number | null;
    pointsDelta: number | null;
    driver: {
      familyName: string;
    };
  }>;
}

interface ConstructorStandingsBody {
  round: number | null;
  previousRound: number | null;
  availableRounds: number[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  standings: Array<{
    position: number;
    previousRoundPosition: number | null;
    positionDelta: number | null;
    pointsDelta: number | null;
    team: {
      name: string;
    };
  }>;
}

interface HealthBody {
  status: string;
  checks: {
    calendar: { status: string };
    results: { status: string };
    standings: { status: string };
  };
}

interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details: string[] | null;
  };
  path: string;
  timestamp: string;
}

describe('F1 API (e2e)', () => {
  let app: INestApplication;
  let httpServer: SupertestApp;
  let prisma: PrismaService;
  let seededEventId: string;
  let seededRaceSessionId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule, F1Module, HealthModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidUnknownValues: false,
      }),
    );

    await app.init();
    httpServer = app.getHttpServer() as SupertestApp;

    prisma = app.get(PrismaService);

    await cleanupDatabase(prisma);
    const seed = await seedDatabase(prisma);
    seededEventId = seed.eventId;
    seededRaceSessionId = seed.raceSessionId;
  });

  afterAll(async () => {
    await cleanupDatabase(prisma);
    await app.close();
  });

  it('GET /api/calendar returns season events', async () => {
    const response = await request(httpServer)
      .get('/api/calendar?season=2024')
      .expect(200);

    const body = response.body as unknown as CalendarBody;

    expect(response.headers['cache-control']).toBe(
      'public, max-age=30, stale-while-revalidate=120',
    );
    expect(body.season).toBe(2024);
    expect(body.meta).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
    expect(body.events).toHaveLength(1);
    expect(body.events[0].name).toBe('Bahrain Grand Prix');
    expect(body.events[0].sessions).toHaveLength(2);
  });

  it('GET /api/weekends/:eventId returns weekend details', async () => {
    const response = await request(httpServer)
      .get(`/api/weekends/${seededEventId}`)
      .expect(200);

    const body = response.body as unknown as WeekendBody;

    expect(body.event.id).toBe(seededEventId);
    expect(body.event.round).toBe(1);
    expect(body.sessions).toHaveLength(2);
  });

  it('GET /api/sessions/:sessionId/results returns sorted race results', async () => {
    const response = await request(httpServer)
      .get(`/api/sessions/${seededRaceSessionId}/results`)
      .expect(200);

    const body = response.body as unknown as SessionResultsBody;

    expect(body.session.type).toBe('RACE');
    expect(body.results).toHaveLength(2);
    expect(body.results[0].position).toBe(1);
    expect(body.results[0].driver.familyName).toBe('Norris');
  });

  it('GET /api/standings/drivers returns driver standings', async () => {
    const response = await request(httpServer)
      .get('/api/standings/drivers?season=2024')
      .expect(200);

    const body = response.body as unknown as DriverStandingsBody;

    expect(body.meta).toEqual({
      page: 1,
      limit: 20,
      total: 2,
      totalPages: 1,
    });
    expect(body.round).toBe(2);
    expect(body.previousRound).toBe(1);
    expect(body.availableRounds).toEqual([1, 2]);
    expect(body.standings).toHaveLength(2);
    expect(body.standings[0].position).toBe(1);
    expect(body.standings[0].driver.familyName).toBe('Verstappen');
    expect(body.standings[0].positionDelta).toBe(1);
    expect(body.standings[0].previousRoundPosition).toBe(2);
    expect(body.standings[0].pointsDelta).toBe(17);
  });

  it('GET /api/standings/drivers supports selecting a specific round', async () => {
    const response = await request(httpServer)
      .get('/api/standings/drivers?season=2024&round=1')
      .expect(200);

    const body = response.body as unknown as DriverStandingsBody;

    expect(body.round).toBe(1);
    expect(body.previousRound).toBeNull();
    expect(body.availableRounds).toEqual([1, 2]);
    expect(body.standings[0].driver.familyName).toBe('Norris');
    expect(body.standings[0].positionDelta).toBeNull();
    expect(body.standings[0].pointsDelta).toBeNull();
  });

  it('GET /api/standings/constructors returns constructor standings', async () => {
    const response = await request(httpServer)
      .get('/api/standings/constructors?season=2024')
      .expect(200);

    const body = response.body as unknown as ConstructorStandingsBody;

    expect(body.meta).toEqual({
      page: 1,
      limit: 20,
      total: 2,
      totalPages: 1,
    });
    expect(body.round).toBe(2);
    expect(body.previousRound).toBe(1);
    expect(body.availableRounds).toEqual([1, 2]);
    expect(body.standings).toHaveLength(2);
    expect(body.standings[0].position).toBe(1);
    expect(body.standings[0].team.name).toBe('Red Bull');
    expect(body.standings[0].positionDelta).toBe(1);
    expect(body.standings[0].pointsDelta).toBe(17);
  });

  it('GET /api/standings/constructors supports selecting a specific round', async () => {
    const response = await request(httpServer)
      .get('/api/standings/constructors?season=2024&round=1')
      .expect(200);

    const body = response.body as unknown as ConstructorStandingsBody;

    expect(body.round).toBe(1);
    expect(body.previousRound).toBeNull();
    expect(body.availableRounds).toEqual([1, 2]);
    expect(body.standings[0].team.name).toBe('McLaren');
    expect(body.standings[0].positionDelta).toBeNull();
    expect(body.standings[0].pointsDelta).toBeNull();
  });

  it('GET /api/health/data returns ingestion freshness checks', async () => {
    const response = await request(httpServer)
      .get('/api/health/data')
      .expect(200);

    const body = response.body as unknown as HealthBody;

    expect(body.status).toBe('ok');
    expect(body.checks.calendar.status).toBe('success');
    expect(body.checks.results.status).toBe('success');
    expect(body.checks.standings.status).toBe('success');
  });

  it('GET /api/weekends/:eventId returns 404 envelope for unknown event', async () => {
    const response = await request(httpServer)
      .get('/api/weekends/unknown-event')
      .expect(404);

    const body = response.body as unknown as ErrorBody;

    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toContain('unknown-event');
    expect(body.path).toBe('/api/weekends/unknown-event');
    expect(body.timestamp).toEqual(expect.any(String));
  });

  it('GET /api/sessions/:sessionId/results returns 404 envelope for unknown session', async () => {
    const response = await request(httpServer)
      .get('/api/sessions/unknown-session/results')
      .expect(404);

    const body = response.body as unknown as ErrorBody;

    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toContain('unknown-session');
  });

  it('GET /api/calendar validates pagination query params', async () => {
    const response = await request(httpServer)
      .get('/api/calendar?season=2024&page=0')
      .expect(400);

    const body = response.body as unknown as ErrorBody;

    expect(body.success).toBe(false);
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.details).toEqual(
      expect.arrayContaining(['page must not be less than 1']),
    );
  });
});

async function cleanupDatabase(prisma: PrismaService) {
  await prisma.sessionResult.deleteMany();
  await prisma.driverStanding.deleteMany();
  await prisma.constructorStanding.deleteMany();
  await prisma.session.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.team.deleteMany();
  await prisma.event.deleteMany();
  await prisma.ingestionRun.deleteMany();
}

async function seedDatabase(prisma: PrismaService) {
  const redBull = await prisma.team.create({
    data: {
      externalId: 'red_bull',
      name: 'Red Bull',
      nationality: 'Austrian',
    },
  });

  const mclaren = await prisma.team.create({
    data: {
      externalId: 'mclaren',
      name: 'McLaren',
      nationality: 'British',
    },
  });

  const verstappen = await prisma.driver.create({
    data: {
      externalId: 'max_verstappen',
      code: 'VER',
      number: 1,
      givenName: 'Max',
      familyName: 'Verstappen',
      nationality: 'Dutch',
      teamId: redBull.id,
    },
  });

  const norris = await prisma.driver.create({
    data: {
      externalId: 'norris',
      code: 'NOR',
      number: 4,
      givenName: 'Lando',
      familyName: 'Norris',
      nationality: 'British',
      teamId: mclaren.id,
    },
  });

  const event = await prisma.event.create({
    data: {
      externalId: '2024-1',
      season: 2024,
      round: 1,
      name: 'Bahrain Grand Prix',
      circuitName: 'Bahrain International Circuit',
      locality: 'Sakhir',
      country: 'Bahrain',
      raceStartTime: new Date('2024-03-02T15:00:00.000Z'),
    },
  });

  const qualifying = await prisma.session.create({
    data: {
      externalId: '2024-1-qualifying',
      eventId: event.id,
      type: SessionType.QUALIFYING,
      name: 'Qualifying',
      startsAt: new Date('2024-03-01T16:00:00.000Z'),
      status: SessionStatus.COMPLETED,
    },
  });

  const race = await prisma.session.create({
    data: {
      externalId: '2024-1-race',
      eventId: event.id,
      type: SessionType.RACE,
      name: 'Race',
      startsAt: new Date('2024-03-02T15:00:00.000Z'),
      status: SessionStatus.COMPLETED,
    },
  });

  await prisma.sessionResult.createMany({
    data: [
      {
        sessionId: qualifying.id,
        driverId: norris.id,
        teamId: mclaren.id,
        position: 1,
        q1: '1:30.111',
        q2: '1:29.777',
        q3: '1:29.333',
      },
      {
        sessionId: qualifying.id,
        driverId: verstappen.id,
        teamId: redBull.id,
        position: 2,
        q1: '1:30.222',
        q2: '1:29.888',
        q3: '1:29.555',
      },
      {
        sessionId: race.id,
        driverId: norris.id,
        teamId: mclaren.id,
        position: 1,
        grid: 1,
        points: 25,
        laps: 57,
        status: 'Finished',
        time: '1:31:44.742',
      },
      {
        sessionId: race.id,
        driverId: verstappen.id,
        teamId: redBull.id,
        position: 2,
        grid: 2,
        points: 18,
        laps: 57,
        status: 'Finished',
        time: '+3.201',
      },
    ],
  });

  await prisma.driverStanding.createMany({
    data: [
      {
        season: 2024,
        round: 1,
        position: 1,
        points: 25,
        wins: 1,
        driverId: norris.id,
      },
      {
        season: 2024,
        round: 1,
        position: 2,
        points: 18,
        wins: 0,
        driverId: verstappen.id,
      },
      {
        season: 2024,
        round: 2,
        position: 1,
        points: 35,
        wins: 1,
        driverId: verstappen.id,
      },
      {
        season: 2024,
        round: 2,
        position: 2,
        points: 33,
        wins: 1,
        driverId: norris.id,
      },
    ],
  });

  await prisma.constructorStanding.createMany({
    data: [
      {
        season: 2024,
        round: 1,
        position: 1,
        points: 25,
        wins: 1,
        teamId: mclaren.id,
      },
      {
        season: 2024,
        round: 1,
        position: 2,
        points: 18,
        wins: 0,
        teamId: redBull.id,
      },
      {
        season: 2024,
        round: 2,
        position: 1,
        points: 35,
        wins: 1,
        teamId: redBull.id,
      },
      {
        season: 2024,
        round: 2,
        position: 2,
        points: 33,
        wins: 1,
        teamId: mclaren.id,
      },
    ],
  });

  const now = new Date();
  await prisma.ingestionRun.createMany({
    data: [
      {
        kind: IngestionKind.CALENDAR,
        status: IngestionStatus.SUCCESS,
        startedAt: now,
        finishedAt: now,
        recordsProcessed: 10,
        season: 2024,
      },
      {
        kind: IngestionKind.RESULTS,
        status: IngestionStatus.SUCCESS,
        startedAt: now,
        finishedAt: now,
        recordsProcessed: 20,
        season: 2024,
      },
      {
        kind: IngestionKind.STANDINGS,
        status: IngestionStatus.SUCCESS,
        startedAt: now,
        finishedAt: now,
        recordsProcessed: 4,
        season: 2024,
      },
    ],
  });

  return {
    eventId: event.id,
    raceSessionId: race.id,
  };
}
