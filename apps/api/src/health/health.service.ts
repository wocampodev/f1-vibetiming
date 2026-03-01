import { Injectable } from '@nestjs/common';
import { IngestionKind, IngestionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async getDataHealth() {
    const latestRuns = await Promise.all([
      this.getLastRun(IngestionKind.CALENDAR),
      this.getLastRun(IngestionKind.RESULTS),
      this.getLastRun(IngestionKind.STANDINGS),
    ]);

    const now = Date.now();
    const [calendarRun, resultsRun, standingsRun] = latestRuns;

    const latestSuccess = await this.prisma.ingestionRun.findFirst({
      where: { status: IngestionStatus.SUCCESS },
      orderBy: { finishedAt: 'desc' },
      select: {
        finishedAt: true,
      },
    });

    return {
      status: latestSuccess ? 'ok' : 'degraded',
      updatedAt: latestSuccess?.finishedAt ?? null,
      ageSeconds: latestSuccess
        ? Math.floor((now - latestSuccess.finishedAt.getTime()) / 1000)
        : null,
      checks: {
        calendar: this.formatRun(calendarRun, now),
        results: this.formatRun(resultsRun, now),
        standings: this.formatRun(standingsRun, now),
      },
    };
  }

  private getLastRun(kind: IngestionKind) {
    return this.prisma.ingestionRun.findFirst({
      where: { kind },
      orderBy: { finishedAt: 'desc' },
    });
  }

  private formatRun(
    run: {
      status: IngestionStatus;
      finishedAt: Date;
      recordsProcessed: number;
      errorMessage: string | null;
      season: number | null;
    } | null,
    nowMs: number,
  ) {
    if (!run) {
      return {
        status: 'missing',
        updatedAt: null,
        ageSeconds: null,
        recordsProcessed: 0,
        season: null,
        errorMessage: null,
      };
    }

    return {
      status: run.status.toLowerCase(),
      updatedAt: run.finishedAt,
      ageSeconds: Math.floor((nowMs - run.finishedAt.getTime()) / 1000),
      recordsProcessed: run.recordsProcessed,
      season: run.season,
      errorMessage: run.errorMessage,
    };
  }
}
