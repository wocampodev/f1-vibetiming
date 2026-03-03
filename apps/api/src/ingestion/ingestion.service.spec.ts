/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { IngestionKind, IngestionStatus, SessionStatus } from '@prisma/client';
import { IngestionService } from './ingestion.service';

function createPrismaMock() {
  return {
    event: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    session: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    sessionResult: {
      upsert: jest.fn(),
    },
    team: {
      upsert: jest.fn(),
    },
    driver: {
      upsert: jest.fn(),
    },
    driverStanding: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    constructorStanding: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    ingestionRun: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  };
}

function createJolpicaClientMock() {
  return {
    fetchCalendar: jest.fn(),
    fetchRaceResults: jest.fn(),
    fetchQualifyingResults: jest.fn(),
    fetchDriverStandings: jest.fn(),
    fetchConstructorStandings: jest.fn(),
  };
}

describe('IngestionService', () => {
  const realDateNow = Date.now;

  afterEach(() => {
    Date.now = realDateNow;
  });

  it('falls back to prior season calendar and upserts events/sessions', async () => {
    const prisma = createPrismaMock();
    const jolpicaClient = createJolpicaClientMock();
    const service = new IngestionService(
      prisma as never,
      jolpicaClient as never,
    );

    jolpicaClient.fetchCalendar
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          season: '2025',
          round: '1',
          raceName: 'Bahrain Grand Prix',
          date: '2099-03-02',
          time: '15:00:00Z',
          Circuit: {
            circuitName: 'Bahrain International Circuit',
            Location: {
              locality: 'Sakhir',
              country: 'Bahrain',
            },
          },
          Qualifying: {
            date: '2099-03-01',
            time: '16:00:00Z',
          },
        },
      ]);

    prisma.event.upsert.mockResolvedValue({ id: 'event-1' });
    prisma.session.upsert.mockResolvedValue({});
    prisma.ingestionRun.create.mockResolvedValue({});

    const season = await service.refreshCalendar(2026);

    expect(season).toBe(2025);
    expect(jolpicaClient.fetchCalendar).toHaveBeenNthCalledWith(1, 2026);
    expect(jolpicaClient.fetchCalendar).toHaveBeenNthCalledWith(2, 2025);

    expect(prisma.event.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { externalId: '2025-1' },
        create: expect.objectContaining({
          externalId: '2025-1',
          season: 2025,
          round: 1,
        }),
      }),
    );

    expect(prisma.session.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.session.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { externalId: '2025-1-qualifying' },
      }),
    );
    expect(prisma.session.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { externalId: '2025-1-race' },
        create: expect.objectContaining({
          status: SessionStatus.SCHEDULED,
        }),
      }),
    );

    expect(prisma.ingestionRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: IngestionKind.CALENDAR,
          status: IngestionStatus.SUCCESS,
          season: 2025,
        }),
      }),
    );
  });

  it('maps race and qualifying provider rows into session results upserts', async () => {
    const prisma = createPrismaMock();
    const jolpicaClient = createJolpicaClientMock();
    const service = new IngestionService(
      prisma as never,
      jolpicaClient as never,
    );

    Date.now = jest.fn(() => new Date('2024-03-03T00:00:00.000Z').getTime());

    prisma.event.findMany.mockResolvedValue([
      {
        season: 2024,
        round: 1,
        raceStartTime: new Date('2024-03-02T15:00:00.000Z'),
      },
    ]);
    prisma.session.findUnique
      .mockResolvedValueOnce({ id: 'session-race-1' })
      .mockResolvedValueOnce({ id: 'session-quali-1' });

    jolpicaClient.fetchRaceResults.mockResolvedValue([
      {
        position: '1',
        grid: '2',
        points: '25',
        laps: '57',
        status: 'Finished',
        Time: { time: '1:30:11.000' },
        FastestLap: {
          rank: '1',
          Time: { time: '1:31.000' },
        },
        Driver: {
          driverId: 'norris',
          code: 'NOR',
          permanentNumber: '4',
          givenName: 'Lando',
          familyName: 'Norris',
          nationality: 'British',
        },
        Constructor: {
          constructorId: 'mclaren',
          name: 'McLaren',
          nationality: 'British',
        },
      },
    ]);

    jolpicaClient.fetchQualifyingResults.mockResolvedValue([
      {
        position: '1',
        Q1: '1:31.111',
        Q2: '1:30.777',
        Q3: '1:30.333',
        Driver: {
          driverId: 'norris',
          code: 'NOR',
          permanentNumber: '4',
          givenName: 'Lando',
          familyName: 'Norris',
          nationality: 'British',
        },
        Constructor: {
          constructorId: 'mclaren',
          name: 'McLaren',
          nationality: 'British',
        },
      },
    ]);

    prisma.team.upsert.mockResolvedValue({ id: 'team-1' });
    prisma.driver.upsert.mockResolvedValue({ id: 'driver-1' });
    prisma.sessionResult.upsert.mockResolvedValue({});
    prisma.session.update.mockResolvedValue({});
    prisma.ingestionRun.create.mockResolvedValue({});

    const processed = await service.refreshResults(2024);

    expect(processed).toBe(2);
    expect(jolpicaClient.fetchRaceResults).toHaveBeenCalledWith(2024, 1);
    expect(jolpicaClient.fetchQualifyingResults).toHaveBeenCalledWith(2024, 1);

    expect(prisma.sessionResult.upsert).toHaveBeenCalledTimes(2);

    expect(prisma.sessionResult.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        create: expect.objectContaining({
          sessionId: 'session-race-1',
          driverId: 'driver-1',
          teamId: 'team-1',
          position: 1,
          grid: 2,
          points: 25,
          laps: 57,
          status: 'Finished',
          time: '1:30:11.000',
          fastestLapTime: '1:31.000',
          fastestLapRank: 1,
        }),
      }),
    );

    expect(prisma.sessionResult.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        create: expect.objectContaining({
          sessionId: 'session-quali-1',
          driverId: 'driver-1',
          teamId: 'team-1',
          position: 1,
          q1: '1:31.111',
          q2: '1:30.777',
          q3: '1:30.333',
        }),
      }),
    );

    expect(prisma.session.update).toHaveBeenCalledTimes(2);
    expect(prisma.session.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'session-race-1' },
      data: { status: SessionStatus.COMPLETED },
    });
    expect(prisma.session.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'session-quali-1' },
      data: { status: SessionStatus.COMPLETED },
    });

    expect(prisma.ingestionRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: IngestionKind.RESULTS,
          status: IngestionStatus.SUCCESS,
          season: 2024,
        }),
      }),
    );
  });

  it('maps standings payloads and replaces season standings rows', async () => {
    const prisma = createPrismaMock();
    const jolpicaClient = createJolpicaClientMock();
    const service = new IngestionService(
      prisma as never,
      jolpicaClient as never,
    );

    jolpicaClient.fetchDriverStandings.mockImplementation(
      (_season: number, round?: number) => {
        if (round === 1) {
          return Promise.resolve({
            round: 1,
            items: [
              {
                position: '1',
                points: '51',
                wins: '2',
                Driver: {
                  driverId: 'verstappen',
                  code: 'VER',
                  permanentNumber: '1',
                  givenName: 'Max',
                  familyName: 'Verstappen',
                  nationality: 'Dutch',
                },
                Constructors: [
                  {
                    constructorId: 'red_bull',
                    name: 'Red Bull',
                    nationality: 'Austrian',
                  },
                ],
              },
            ],
          });
        }

        return Promise.resolve({
          round: 2,
          items: [
            {
              position: '1',
              points: '101',
              wins: '3',
              Driver: {
                driverId: 'verstappen',
                code: 'VER',
                permanentNumber: '1',
                givenName: 'Max',
                familyName: 'Verstappen',
                nationality: 'Dutch',
              },
              Constructors: [
                {
                  constructorId: 'red_bull',
                  name: 'Red Bull',
                  nationality: 'Austrian',
                },
              ],
            },
          ],
        });
      },
    );

    jolpicaClient.fetchConstructorStandings.mockImplementation(
      (_season: number, round?: number) => {
        if (round === 1) {
          return Promise.resolve({
            round: 1,
            items: [
              {
                position: '1',
                points: '89',
                wins: '2',
                Constructor: {
                  constructorId: 'red_bull',
                  name: 'Red Bull',
                  nationality: 'Austrian',
                },
              },
            ],
          });
        }

        return Promise.resolve({
          round: 2,
          items: [
            {
              position: '1',
              points: '178',
              wins: '4',
              Constructor: {
                constructorId: 'red_bull',
                name: 'Red Bull',
                nationality: 'Austrian',
              },
            },
          ],
        });
      },
    );

    prisma.team.upsert.mockResolvedValue({ id: 'team-rb' });
    prisma.driver.upsert.mockResolvedValue({ id: 'driver-ver' });
    prisma.driverStanding.deleteMany.mockResolvedValue({});
    prisma.driverStanding.create.mockResolvedValue({});
    prisma.constructorStanding.deleteMany.mockResolvedValue({});
    prisma.constructorStanding.create.mockResolvedValue({});
    prisma.ingestionRun.create.mockResolvedValue({});

    const processed = await service.refreshStandings(2024);

    expect(processed).toBe(4);

    expect(jolpicaClient.fetchDriverStandings).toHaveBeenNthCalledWith(1, 2024);
    expect(jolpicaClient.fetchDriverStandings).toHaveBeenNthCalledWith(
      2,
      2024,
      1,
    );
    expect(jolpicaClient.fetchConstructorStandings).toHaveBeenNthCalledWith(
      1,
      2024,
    );
    expect(jolpicaClient.fetchConstructorStandings).toHaveBeenNthCalledWith(
      2,
      2024,
      1,
    );

    expect(prisma.driverStanding.deleteMany).toHaveBeenCalledWith({
      where: { season: 2024 },
    });
    expect(prisma.constructorStanding.deleteMany).toHaveBeenCalledWith({
      where: { season: 2024 },
    });

    expect(prisma.driverStanding.create).toHaveBeenNthCalledWith(1, {
      data: {
        season: 2024,
        round: 1,
        position: 1,
        points: 51,
        wins: 2,
        driverId: 'driver-ver',
      },
    });
    expect(prisma.driverStanding.create).toHaveBeenNthCalledWith(2, {
      data: {
        season: 2024,
        round: 2,
        position: 1,
        points: 101,
        wins: 3,
        driverId: 'driver-ver',
      },
    });

    expect(prisma.constructorStanding.create).toHaveBeenNthCalledWith(1, {
      data: {
        season: 2024,
        round: 1,
        position: 1,
        points: 89,
        wins: 2,
        teamId: 'team-rb',
      },
    });
    expect(prisma.constructorStanding.create).toHaveBeenNthCalledWith(2, {
      data: {
        season: 2024,
        round: 2,
        position: 1,
        points: 178,
        wins: 4,
        teamId: 'team-rb',
      },
    });

    expect(prisma.ingestionRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: IngestionKind.STANDINGS,
          status: IngestionStatus.SUCCESS,
          season: 2024,
        }),
      }),
    );
  });

  it('records failed ingestion runs when provider calls throw', async () => {
    const prisma = createPrismaMock();
    const jolpicaClient = createJolpicaClientMock();
    const service = new IngestionService(
      prisma as never,
      jolpicaClient as never,
    );

    jolpicaClient.fetchDriverStandings.mockRejectedValue(
      new Error('provider unavailable'),
    );
    prisma.ingestionRun.create.mockResolvedValue({});

    const processed = await service.refreshStandings(2024);

    expect(processed).toBe(0);
    expect(prisma.ingestionRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: IngestionKind.STANDINGS,
          status: IngestionStatus.FAILED,
          recordsProcessed: 0,
          season: 2024,
          errorMessage: 'provider unavailable',
        }),
      }),
    );
  });
});
