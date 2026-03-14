import { Injectable } from '@nestjs/common';
import { IngestionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface SeasonPaginationOptions {
  season?: number;
  round?: number;
  page?: number;
  limit?: number;
}

@Injectable()
export class F1Service {
  constructor(private readonly prisma: PrismaService) {}

  async getDriverStandings(options: SeasonPaginationOptions = {}) {
    const { season, round, page, limit } = options;
    const resolvedSeason = await this.resolveSeason(season);
    const pagination = this.resolvePagination(page, limit);
    const availableRounds =
      await this.resolveAvailableDriverStandingRounds(resolvedSeason);
    const selectedRound = this.resolveSelectedRound(round, availableRounds);

    if (selectedRound == null) {
      return {
        season: resolvedSeason,
        round: null,
        previousRound: null,
        availableRounds,
        freshness: await this.getFreshness(),
        meta: this.buildPaginationMeta(0, pagination.page, pagination.limit),
        standings: [],
      };
    }

    const previousRound = this.resolvePreviousRound(
      selectedRound,
      availableRounds,
    );
    const total = await this.prisma.driverStanding.count({
      where: { season: resolvedSeason, round: selectedRound },
    });

    const standings = await this.prisma.driverStanding.findMany({
      where: { season: resolvedSeason, round: selectedRound },
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

    const previousRows =
      previousRound == null
        ? []
        : await this.prisma.driverStanding.findMany({
            where: { season: resolvedSeason, round: previousRound },
            select: {
              driverId: true,
              position: true,
              points: true,
            },
          });
    const previousByDriverId = new Map(
      previousRows.map((row) => [row.driverId, row]),
    );

    const leaderPoints = standings.at(0)?.points ?? null;

    return {
      season: resolvedSeason,
      round: selectedRound,
      previousRound,
      availableRounds,
      freshness: await this.getFreshness(),
      meta: this.buildPaginationMeta(total, pagination.page, pagination.limit),
      standings: standings.map((standing, index) => {
        const pointsAhead = standings.at(index - 1)?.points ?? null;
        const previous = previousByDriverId.get(standing.driverId);

        return {
          round: standing.round,
          position: standing.position,
          points: standing.points,
          wins: standing.wins,
          gapToLeaderPoints:
            leaderPoints == null
              ? null
              : Number((leaderPoints - standing.points).toFixed(1)),
          gapToAheadPoints:
            pointsAhead == null
              ? null
              : Number((pointsAhead - standing.points).toFixed(1)),
          previousRoundPosition: previous?.position ?? null,
          positionDelta:
            previous == null ? null : previous.position - standing.position,
          pointsDelta:
            previous == null
              ? null
              : Number((standing.points - previous.points).toFixed(1)),
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
        };
      }),
    };
  }

  async getConstructorStandings(options: SeasonPaginationOptions = {}) {
    const { season, round, page, limit } = options;
    const resolvedSeason = await this.resolveSeason(season);
    const pagination = this.resolvePagination(page, limit);
    const availableRounds =
      await this.resolveAvailableConstructorStandingRounds(resolvedSeason);
    const selectedRound = this.resolveSelectedRound(round, availableRounds);

    if (selectedRound == null) {
      return {
        season: resolvedSeason,
        round: null,
        previousRound: null,
        availableRounds,
        freshness: await this.getFreshness(),
        meta: this.buildPaginationMeta(0, pagination.page, pagination.limit),
        standings: [],
      };
    }

    const previousRound = this.resolvePreviousRound(
      selectedRound,
      availableRounds,
    );
    const total = await this.prisma.constructorStanding.count({
      where: { season: resolvedSeason, round: selectedRound },
    });

    const standings = await this.prisma.constructorStanding.findMany({
      where: { season: resolvedSeason, round: selectedRound },
      orderBy: { position: 'asc' },
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        team: true,
      },
    });

    const previousRows =
      previousRound == null
        ? []
        : await this.prisma.constructorStanding.findMany({
            where: { season: resolvedSeason, round: previousRound },
            select: {
              teamId: true,
              position: true,
              points: true,
            },
          });
    const previousByTeamId = new Map(
      previousRows.map((row) => [row.teamId, row]),
    );

    const leaderPoints = standings.at(0)?.points ?? null;

    return {
      season: resolvedSeason,
      round: selectedRound,
      previousRound,
      availableRounds,
      freshness: await this.getFreshness(),
      meta: this.buildPaginationMeta(total, pagination.page, pagination.limit),
      standings: standings.map((standing, index) => {
        const pointsAhead = standings.at(index - 1)?.points ?? null;
        const previous = previousByTeamId.get(standing.teamId);

        return {
          round: standing.round,
          position: standing.position,
          points: standing.points,
          wins: standing.wins,
          gapToLeaderPoints:
            leaderPoints == null
              ? null
              : Number((leaderPoints - standing.points).toFixed(1)),
          gapToAheadPoints:
            pointsAhead == null
              ? null
              : Number((pointsAhead - standing.points).toFixed(1)),
          previousRoundPosition: previous?.position ?? null,
          positionDelta:
            previous == null ? null : previous.position - standing.position,
          pointsDelta:
            previous == null
              ? null
              : Number((standing.points - previous.points).toFixed(1)),
          team: {
            id: standing.team.id,
            externalId: standing.team.externalId,
            name: standing.team.name,
            nationality: standing.team.nationality,
          },
        };
      }),
    };
  }

  private async resolveAvailableDriverStandingRounds(
    season: number,
  ): Promise<number[]> {
    const rows = await this.prisma.driverStanding.findMany({
      where: { season },
      distinct: ['round'],
      orderBy: { round: 'asc' },
      select: { round: true },
    });

    return rows.map((row) => row.round);
  }

  private async resolveAvailableConstructorStandingRounds(
    season: number,
  ): Promise<number[]> {
    const rows = await this.prisma.constructorStanding.findMany({
      where: { season },
      distinct: ['round'],
      orderBy: { round: 'asc' },
      select: { round: true },
    });

    return rows.map((row) => row.round);
  }

  private resolveSelectedRound(
    requestedRound: number | undefined,
    availableRounds: number[],
  ): number | null {
    if (availableRounds.length === 0) {
      return null;
    }

    if (requestedRound && availableRounds.includes(requestedRound)) {
      return requestedRound;
    }

    return availableRounds.at(-1) ?? null;
  }

  private resolvePreviousRound(
    selectedRound: number,
    availableRounds: number[],
  ): number | null {
    const selectedIndex = availableRounds.indexOf(selectedRound);
    if (selectedIndex <= 0) {
      return null;
    }

    return availableRounds[selectedIndex - 1] ?? null;
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
}
