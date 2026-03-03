import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  IngestionKind,
  IngestionStatus,
  SessionStatus,
  SessionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ErgastConstructor,
  ErgastDriver,
  ErgastQualifyingResult,
  ErgastRace,
  ErgastRaceResult,
} from './ergast.types';
import { JolpicaClient } from './jolpica.client';

interface SessionSeed {
  externalId: string;
  type: SessionType;
  name: string;
  startsAt: Date;
  status: SessionStatus;
}

@Injectable()
export class IngestionService implements OnModuleInit {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jolpicaClient: JolpicaClient,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.refreshAll();
    } catch (error) {
      const message =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      this.logger.error('Initial ingestion sync failed', message);
    }
  }

  async refreshAll(season = this.getCurrentSeason()): Promise<void> {
    const calendarSeason = await this.refreshCalendar(season);
    const seasonToRefresh = await this.resolveSeasonWithData(calendarSeason);

    await this.refreshResults(seasonToRefresh);
    await this.refreshStandings(seasonToRefresh);
    await this.markPastSessionsCompleted();
  }

  async refreshCalendar(season = this.getCurrentSeason()): Promise<number> {
    const { season: targetSeason, races } =
      await this.resolveCalendarSeason(season);

    await this.trackRun(IngestionKind.CALENDAR, targetSeason, async () => {
      return this.upsertCalendar(targetSeason, races);
    });

    return targetSeason;
  }

  async refreshResults(season = this.getCurrentSeason()): Promise<number> {
    return this.trackRun(IngestionKind.RESULTS, season, async () => {
      const events = await this.prisma.event.findMany({
        where: { season },
        orderBy: { round: 'asc' },
      });

      let processed = 0;

      for (const event of events) {
        if (event.raceStartTime > new Date()) {
          continue;
        }

        processed += await this.upsertRaceResults(season, event.round);
        processed += await this.upsertQualifyingResults(season, event.round);
      }

      return processed;
    });
  }

  async refreshStandings(season = this.getCurrentSeason()): Promise<number> {
    return this.trackRun(IngestionKind.STANDINGS, season, async () => {
      const latestDriverStandings =
        await this.jolpicaClient.fetchDriverStandings(season);
      const latestConstructorStandings =
        await this.jolpicaClient.fetchConstructorStandings(season);
      const latestRound = Math.max(
        latestDriverStandings.round,
        latestConstructorStandings.round,
      );

      let processed = 0;

      await this.prisma.driverStanding.deleteMany({ where: { season } });
      await this.prisma.constructorStanding.deleteMany({ where: { season } });

      for (let round = 1; round <= latestRound; round += 1) {
        const driverStandings =
          round === latestDriverStandings.round
            ? latestDriverStandings
            : await this.jolpicaClient.fetchDriverStandings(season, round);
        const constructorStandings =
          round === latestConstructorStandings.round
            ? latestConstructorStandings
            : await this.jolpicaClient.fetchConstructorStandings(season, round);

        for (const standing of driverStandings.items) {
          const team = standing.Constructors.at(0);
          const teamId = team ? await this.upsertTeam(team) : null;
          const driverId = await this.upsertDriver(standing.Driver, teamId);

          await this.prisma.driverStanding.create({
            data: {
              season,
              round,
              position: this.toInt(standing.position) ?? 0,
              points: this.toNumber(standing.points) ?? 0,
              wins: this.toInt(standing.wins) ?? 0,
              driverId,
            },
          });

          processed += 1;
        }

        for (const standing of constructorStandings.items) {
          const teamId = await this.upsertTeam(standing.Constructor);

          await this.prisma.constructorStanding.create({
            data: {
              season,
              round,
              position: this.toInt(standing.position) ?? 0,
              points: this.toNumber(standing.points) ?? 0,
              wins: this.toInt(standing.wins) ?? 0,
              teamId,
            },
          });

          processed += 1;
        }
      }

      return processed;
    });
  }

  async markPastSessionsCompleted(): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: {
        startsAt: { lt: new Date() },
        status: SessionStatus.SCHEDULED,
      },
      data: {
        status: SessionStatus.COMPLETED,
      },
    });

    return result.count;
  }

  private async resolveCalendarSeason(
    season: number,
  ): Promise<{ season: number; races: ErgastRace[] }> {
    const currentRaces = await this.jolpicaClient.fetchCalendar(season);
    if (currentRaces.length > 0) {
      return { season, races: currentRaces };
    }

    const fallbackSeason = season - 1;
    const fallbackRaces =
      await this.jolpicaClient.fetchCalendar(fallbackSeason);
    if (fallbackRaces.length > 0) {
      this.logger.warn(
        `No calendar entries for ${season}, using ${fallbackSeason} instead`,
      );
      return { season: fallbackSeason, races: fallbackRaces };
    }

    return { season, races: [] };
  }

  private async upsertCalendar(
    season: number,
    races: ErgastRace[],
  ): Promise<number> {
    let processed = 0;

    for (const race of races) {
      const round = this.toInt(race.round) ?? 0;
      const raceStartTime = this.toDate(race.date, race.time);
      const eventExternalId = `${season}-${round}`;

      const event = await this.prisma.event.upsert({
        where: { externalId: eventExternalId },
        create: {
          externalId: eventExternalId,
          season,
          round,
          name: race.raceName,
          circuitName: race.Circuit.circuitName,
          locality: race.Circuit.Location.locality,
          country: race.Circuit.Location.country,
          raceStartTime,
        },
        update: {
          name: race.raceName,
          circuitName: race.Circuit.circuitName,
          locality: race.Circuit.Location.locality,
          country: race.Circuit.Location.country,
          raceStartTime,
        },
      });

      const sessions = this.buildSessions(season, round, race);
      for (const session of sessions) {
        await this.prisma.session.upsert({
          where: { externalId: session.externalId },
          create: {
            externalId: session.externalId,
            eventId: event.id,
            type: session.type,
            name: session.name,
            startsAt: session.startsAt,
            status: session.status,
          },
          update: {
            name: session.name,
            startsAt: session.startsAt,
            status: session.status,
          },
        });

        processed += 1;
      }

      processed += 1;
    }

    return processed;
  }

  private async upsertRaceResults(
    season: number,
    round: number,
  ): Promise<number> {
    const session = await this.prisma.session.findUnique({
      where: { externalId: `${season}-${round}-race` },
      select: { id: true },
    });

    if (!session) {
      return 0;
    }

    const results = await this.jolpicaClient.fetchRaceResults(season, round);
    if (results.length === 0) {
      return 0;
    }

    let processed = 0;
    for (const result of results) {
      processed += await this.upsertResultRow(session.id, result);
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { status: SessionStatus.COMPLETED },
    });

    return processed;
  }

  private async upsertQualifyingResults(
    season: number,
    round: number,
  ): Promise<number> {
    const session = await this.prisma.session.findUnique({
      where: { externalId: `${season}-${round}-qualifying` },
      select: { id: true },
    });

    if (!session) {
      return 0;
    }

    const results = await this.jolpicaClient.fetchQualifyingResults(
      season,
      round,
    );
    if (results.length === 0) {
      return 0;
    }

    let processed = 0;
    for (const result of results) {
      processed += await this.upsertQualifyingRow(session.id, result);
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { status: SessionStatus.COMPLETED },
    });

    return processed;
  }

  private async upsertResultRow(
    sessionId: string,
    result: ErgastRaceResult,
  ): Promise<number> {
    const teamId = await this.upsertTeam(result.Constructor);
    const driverId = await this.upsertDriver(result.Driver, teamId);

    await this.prisma.sessionResult.upsert({
      where: {
        sessionId_driverId: {
          sessionId,
          driverId,
        },
      },
      create: {
        sessionId,
        driverId,
        teamId,
        position: this.toInt(result.position),
        grid: this.toInt(result.grid),
        points: this.toNumber(result.points),
        laps: this.toInt(result.laps),
        status: result.status,
        time: result.Time?.time,
        fastestLapTime: result.FastestLap?.Time?.time,
        fastestLapRank: this.toInt(result.FastestLap?.rank),
      },
      update: {
        teamId,
        position: this.toInt(result.position),
        grid: this.toInt(result.grid),
        points: this.toNumber(result.points),
        laps: this.toInt(result.laps),
        status: result.status,
        time: result.Time?.time,
        fastestLapTime: result.FastestLap?.Time?.time,
        fastestLapRank: this.toInt(result.FastestLap?.rank),
      },
    });

    return 1;
  }

  private async upsertQualifyingRow(
    sessionId: string,
    result: ErgastQualifyingResult,
  ): Promise<number> {
    const teamId = await this.upsertTeam(result.Constructor);
    const driverId = await this.upsertDriver(result.Driver, teamId);

    await this.prisma.sessionResult.upsert({
      where: {
        sessionId_driverId: {
          sessionId,
          driverId,
        },
      },
      create: {
        sessionId,
        driverId,
        teamId,
        position: this.toInt(result.position),
        q1: result.Q1,
        q2: result.Q2,
        q3: result.Q3,
      },
      update: {
        teamId,
        position: this.toInt(result.position),
        q1: result.Q1,
        q2: result.Q2,
        q3: result.Q3,
      },
    });

    return 1;
  }

  private async upsertTeam(constructor: ErgastConstructor): Promise<string> {
    const team = await this.prisma.team.upsert({
      where: { externalId: constructor.constructorId },
      create: {
        externalId: constructor.constructorId,
        name: constructor.name,
        nationality: constructor.nationality,
      },
      update: {
        name: constructor.name,
        nationality: constructor.nationality,
      },
    });

    return team.id;
  }

  private async upsertDriver(
    driver: ErgastDriver,
    teamId: string | null,
  ): Promise<string> {
    const row = await this.prisma.driver.upsert({
      where: { externalId: driver.driverId },
      create: {
        externalId: driver.driverId,
        code: driver.code,
        number: this.toInt(driver.permanentNumber),
        givenName: driver.givenName,
        familyName: driver.familyName,
        nationality: driver.nationality,
        teamId,
      },
      update: {
        code: driver.code,
        number: this.toInt(driver.permanentNumber),
        givenName: driver.givenName,
        familyName: driver.familyName,
        nationality: driver.nationality,
        teamId,
      },
    });

    return row.id;
  }

  private buildSessions(
    season: number,
    round: number,
    race: ErgastRace,
  ): SessionSeed[] {
    const now = Date.now();
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

      const startsAt = this.toDate(date, time);
      sessions.push({
        externalId: `${season}-${round}-${key}`,
        type,
        name,
        startsAt,
        status:
          startsAt.getTime() < now
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
  }

  private toDate(date: string, time?: string): Date {
    return new Date(`${date}T${time ?? '00:00:00Z'}`);
  }

  private toInt(value?: string): number | null {
    if (value == null || value === '') {
      return null;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  private toNumber(value?: string): number | null {
    if (value == null || value === '') {
      return null;
    }

    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  private getCurrentSeason(): number {
    return new Date().getUTCFullYear();
  }

  private async resolveSeasonWithData(preferred: number): Promise<number> {
    const count = await this.prisma.event.count({
      where: { season: preferred },
    });
    if (count > 0) {
      return preferred;
    }

    const latest = await this.prisma.event.findFirst({
      orderBy: [{ season: 'desc' }, { round: 'desc' }],
      select: { season: true },
    });

    return latest?.season ?? preferred;
  }

  private async trackRun(
    kind: IngestionKind,
    season: number,
    action: () => Promise<number>,
  ): Promise<number> {
    const startedAt = new Date();

    try {
      const recordsProcessed = await action();

      await this.prisma.ingestionRun.create({
        data: {
          kind,
          status: IngestionStatus.SUCCESS,
          startedAt,
          finishedAt: new Date(),
          recordsProcessed,
          season,
        },
      });

      return recordsProcessed;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown ingestion error';

      await this.prisma.ingestionRun.create({
        data: {
          kind,
          status: IngestionStatus.FAILED,
          startedAt,
          finishedAt: new Date(),
          recordsProcessed: 0,
          errorMessage,
          season,
        },
      });

      this.logger.error(`Ingestion ${kind} failed for season ${season}`);
      this.logger.error(errorMessage);
      return 0;
    }
  }
}
