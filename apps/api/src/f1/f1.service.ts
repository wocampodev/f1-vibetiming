import { Injectable, NotFoundException } from '@nestjs/common';
import { IngestionStatus, SessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface SeasonPaginationOptions {
  season?: number;
  page?: number;
  limit?: number;
}

@Injectable()
export class F1Service {
  constructor(private readonly prisma: PrismaService) {}

  async getCalendar(options: SeasonPaginationOptions = {}) {
    const { season, page, limit } = options;
    const resolvedSeason = await this.resolveSeason(season);
    const pagination = this.resolvePagination(page, limit);
    const total = await this.prisma.event.count({
      where: { season: resolvedSeason },
    });

    const events = await this.prisma.event.findMany({
      where: { season: resolvedSeason },
      orderBy: { round: 'asc' },
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        sessions: {
          orderBy: { startsAt: 'asc' },
        },
      },
    });

    return {
      season: resolvedSeason,
      freshness: await this.getFreshness(),
      meta: this.buildPaginationMeta(total, pagination.page, pagination.limit),
      events: events.map((event) => ({
        id: event.id,
        season: event.season,
        round: event.round,
        name: event.name,
        circuitName: event.circuitName,
        locality: event.locality,
        country: event.country,
        raceStartTime: event.raceStartTime,
        sessions: event.sessions.map((session) => ({
          id: session.id,
          name: session.name,
          type: session.type,
          startsAt: session.startsAt,
          status: session.status,
        })),
      })),
    };
  }

  async getWeekend(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        sessions: {
          orderBy: { startsAt: 'asc' },
        },
      },
    });

    if (!event) {
      throw new NotFoundException(`Event ${eventId} was not found`);
    }

    return {
      freshness: await this.getFreshness(),
      event: {
        id: event.id,
        season: event.season,
        round: event.round,
        name: event.name,
        circuitName: event.circuitName,
        locality: event.locality,
        country: event.country,
        raceStartTime: event.raceStartTime,
      },
      sessions: event.sessions.map((session) => ({
        id: session.id,
        name: session.name,
        type: session.type,
        startsAt: session.startsAt,
        status: session.status,
      })),
    };
  }

  async getSessionResults(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        event: true,
        results: {
          include: {
            driver: true,
            team: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} was not found`);
    }

    const results = session.results.sort((a, b) => {
      const aPos = a.position ?? Number.MAX_SAFE_INTEGER;
      const bPos = b.position ?? Number.MAX_SAFE_INTEGER;
      return aPos - bPos;
    });

    return {
      freshness: await this.getFreshness(),
      session: {
        id: session.id,
        eventId: session.eventId,
        eventName: session.event.name,
        round: session.event.round,
        season: session.event.season,
        name: session.name,
        type: session.type,
        startsAt: session.startsAt,
        status: session.status,
      },
      results: results.map((result) => ({
        position: result.position,
        grid: result.grid,
        points: result.points,
        laps: result.laps,
        status: result.status,
        time: result.time,
        q1: result.q1,
        q2: result.q2,
        q3: result.q3,
        fastestLapTime: result.fastestLapTime,
        fastestLapRank: result.fastestLapRank,
        driver: {
          id: result.driver.id,
          externalId: result.driver.externalId,
          code: result.driver.code,
          number: result.driver.number,
          givenName: result.driver.givenName,
          familyName: result.driver.familyName,
        },
        team: result.team
          ? {
              id: result.team.id,
              externalId: result.team.externalId,
              name: result.team.name,
            }
          : null,
      })),
    };
  }

  async getDriverStandings(options: SeasonPaginationOptions = {}) {
    const { season, page, limit } = options;
    const resolvedSeason = await this.resolveSeason(season);
    const pagination = this.resolvePagination(page, limit);
    const total = await this.prisma.driverStanding.count({
      where: { season: resolvedSeason },
    });

    const standings = await this.prisma.driverStanding.findMany({
      where: { season: resolvedSeason },
      orderBy: { position: 'asc' },
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        driver: {
          include: {
            team: true,
          },
        },
      },
    });

    return {
      season: resolvedSeason,
      freshness: await this.getFreshness(),
      meta: this.buildPaginationMeta(total, pagination.page, pagination.limit),
      standings: standings.map((standing) => ({
        position: standing.position,
        points: standing.points,
        wins: standing.wins,
        driver: {
          id: standing.driver.id,
          externalId: standing.driver.externalId,
          givenName: standing.driver.givenName,
          familyName: standing.driver.familyName,
          code: standing.driver.code,
          number: standing.driver.number,
          nationality: standing.driver.nationality,
        },
        team: standing.driver.team
          ? {
              id: standing.driver.team.id,
              externalId: standing.driver.team.externalId,
              name: standing.driver.team.name,
            }
          : null,
      })),
    };
  }

  async getConstructorStandings(options: SeasonPaginationOptions = {}) {
    const { season, page, limit } = options;
    const resolvedSeason = await this.resolveSeason(season);
    const pagination = this.resolvePagination(page, limit);
    const total = await this.prisma.constructorStanding.count({
      where: { season: resolvedSeason },
    });

    const standings = await this.prisma.constructorStanding.findMany({
      where: { season: resolvedSeason },
      orderBy: { position: 'asc' },
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        team: true,
      },
    });

    return {
      season: resolvedSeason,
      freshness: await this.getFreshness(),
      meta: this.buildPaginationMeta(total, pagination.page, pagination.limit),
      standings: standings.map((standing) => ({
        position: standing.position,
        points: standing.points,
        wins: standing.wins,
        team: {
          id: standing.team.id,
          externalId: standing.team.externalId,
          name: standing.team.name,
          nationality: standing.team.nationality,
        },
      })),
    };
  }

  private async resolveSeason(season?: number): Promise<number> {
    if (season) {
      return season;
    }

    const latestEvent = await this.prisma.event.findFirst({
      orderBy: [{ season: 'desc' }, { round: 'desc' }],
      select: { season: true },
    });

    return latestEvent?.season ?? new Date().getUTCFullYear();
  }

  private async getFreshness() {
    const lastSuccess = await this.prisma.ingestionRun.findFirst({
      where: { status: IngestionStatus.SUCCESS },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true },
    });

    if (!lastSuccess) {
      return {
        updatedAt: null,
        ageSeconds: null,
      };
    }

    return {
      updatedAt: lastSuccess.finishedAt,
      ageSeconds: Math.floor(
        (Date.now() - lastSuccess.finishedAt.getTime()) / 1000,
      ),
    };
  }

  private resolvePagination(page?: number, limit?: number) {
    const resolvedPage = page && page > 0 ? page : 1;
    const resolvedLimit = limit && limit > 0 ? Math.min(limit, 100) : 20;

    return {
      page: resolvedPage,
      limit: resolvedLimit,
      skip: (resolvedPage - 1) * resolvedLimit,
    };
  }

  private buildPaginationMeta(total: number, page: number, limit: number) {
    return {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async markSessionsCompleted(now: Date = new Date()): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: {
        startsAt: { lt: now },
        status: SessionStatus.SCHEDULED,
      },
      data: {
        status: SessionStatus.COMPLETED,
      },
    });

    return result.count;
  }
}
