import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IngestionKind, IngestionStatus } from '@prisma/client';
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
}

describe('F1 API (e2e)', () => {
  let app: INestApplication;
  let httpServer: SupertestApp;
  let prisma: PrismaService;

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
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await cleanupDatabase(prisma);
    await app.close();
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

  it('GET /api/standings/drivers validates pagination query params', async () => {
    const response = await request(httpServer)
      .get('/api/standings/drivers?season=2024&page=0')
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
}
