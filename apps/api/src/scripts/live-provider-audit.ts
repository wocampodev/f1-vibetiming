import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { LivePositionConfidence, LivePositionSource } from '../live/live.types';
import { LiveReplayService } from '../live/live.replay.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [LiveReplayService],
})
class LiveProviderAuditCliModule {}

const MAX_LEADERBOARD_ROWS = 10;
const OUTPUT_FORMAT = process.env.OUTPUT_FORMAT?.trim().toLowerCase() ?? 'text';

const parsePositiveInt = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
};

const formatSourceCounts = (
  counts: Array<{ source: LivePositionSource; count: number }>,
): string => {
  if (counts.length === 0) {
    return 'none';
  }

  return counts.map((entry) => `${entry.source}=${entry.count}`).join(', ');
};

const formatConfidenceCounts = (
  counts: Array<{ confidence: LivePositionConfidence; count: number }>,
): string => {
  if (counts.length === 0) {
    return 'none';
  }

  return counts.map((entry) => `${entry.confidence}=${entry.count}`).join(', ');
};

async function bootstrap(): Promise<void> {
  const sessionKey = process.argv[2]?.trim() || null;
  const maxAgeSec = parsePositiveInt(process.env.MAX_AGE_SEC);
  const app = await NestFactory.createApplicationContext(
    LiveProviderAuditCliModule,
    {
      logger: ['error', 'warn'],
    },
  );

  try {
    const replayService = app.get(LiveReplayService);
    const audit = sessionKey
      ? await replayService.auditProviderRanking(sessionKey)
      : await replayService.auditLatestProviderSession(maxAgeSec);

    if (!audit) {
      if (OUTPUT_FORMAT === 'json') {
        process.stdout.write('null\n');
        return;
      }

      process.stdout.write(
        'No provider session available for ranking audit.\n',
      );
      return;
    }

    if (OUTPUT_FORMAT === 'json') {
      process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
      return;
    }

    process.stdout.write(`Session: ${audit.sessionKey}\n`);
    process.stdout.write(`Events: ${audit.eventCount}\n`);
    process.stdout.write(`Projection samples: ${audit.projectionSamples}\n`);
    process.stdout.write(
      `Position sources: ${formatSourceCounts(audit.projectedPositionSourceCounts)}\n`,
    );
    process.stdout.write(
      `Position confidence: ${formatConfidenceCounts(audit.projectedPositionConfidenceCounts)}\n`,
    );
    process.stdout.write(
      `Line hints: timingData=${audit.timingDataLineOnlyHints}, timingApp=${audit.timingAppLineHints}, driverList=${audit.driverListLineOnlyHints}\n`,
    );

    if (audit.riskyLeaderSamples.length === 0) {
      process.stdout.write('Risky projected leaders: none\n');
    } else {
      process.stdout.write('Risky projected leaders:\n');
      for (const sample of audit.riskyLeaderSamples) {
        process.stdout.write(
          `- ${sample.driverCode} ${sample.driverName ?? ''} source=${sample.source} confidence=${sample.confidence} count=${sample.count} first=${sample.firstSeenAt} last=${sample.lastSeenAt}\n`,
        );
      }
    }

    process.stdout.write('Final leaderboard provenance:\n');
    for (const entry of audit.finalLeaderboard.slice(0, MAX_LEADERBOARD_ROWS)) {
      process.stdout.write(
        `- P${entry.position} ${entry.driverCode} ${entry.driverName ?? ''} source=${entry.positionSource} confidence=${entry.positionConfidence} updatedAt=${entry.positionUpdatedAt ?? 'n/a'}\n`,
      );
    }
  } finally {
    await app.close();
  }
}

void bootstrap();
