import { Injectable } from '@nestjs/common';
import { LiveCaptureSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderStateAccumulator } from './live.provider.adapter';
import { LiveState } from './live.types';

interface ReplayEventRow {
  topic: string;
  payload: Prisma.JsonValue;
  emittedAt: Date;
}

export interface LiveSessionReplayResult {
  sessionKey: string;
  eventCount: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
  state: LiveState | null;
}

export interface LiveRankingAuditResult {
  sessionKey: string;
  eventCount: number;
  timingDataPositionFields: number;
  timingDataLineOnlyHints: number;
  timingAppLineHints: number;
  driverListLineOnlyHints: number;
  leadingLineHints: Array<{
    topic: string;
    driverNumber: string;
    count: number;
  }>;
}

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const toInt = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
};

@Injectable()
export class LiveReplayService {
  constructor(private readonly prisma: PrismaService) {}

  async replayProviderSession(
    sessionKey: string,
  ): Promise<LiveSessionReplayResult | null> {
    const events = await this.loadProviderEvents(sessionKey);
    if (events.length === 0) {
      return null;
    }

    const accumulator = new ProviderStateAccumulator();
    for (const event of events) {
      accumulator.ingest(
        event.topic,
        event.payload as unknown,
        event.emittedAt.toISOString(),
      );
    }

    const firstEventAt = events[0]?.emittedAt.toISOString() ?? null;
    const lastEventAt = events.at(-1)?.emittedAt.toISOString() ?? null;

    return {
      sessionKey,
      eventCount: events.length,
      firstEventAt,
      lastEventAt,
      state: accumulator.buildState(lastEventAt ?? new Date().toISOString()),
    };
  }

  async auditProviderRanking(
    sessionKey: string,
  ): Promise<LiveRankingAuditResult | null> {
    const events = await this.loadProviderEvents(sessionKey);
    if (events.length === 0) {
      return null;
    }

    let timingDataPositionFields = 0;
    let timingDataLineOnlyHints = 0;
    let timingAppLineHints = 0;
    let driverListLineOnlyHints = 0;
    const leadingLineHintCounts = new Map<string, number>();

    for (const event of events) {
      if (!isRecord(event.payload)) {
        continue;
      }

      if (event.topic === 'TimingData') {
        const lines = isRecord(event.payload.Lines)
          ? event.payload.Lines
          : null;
        if (!lines) {
          continue;
        }

        for (const [driverNumber, lineValue] of Object.entries(lines)) {
          if (!isRecord(lineValue)) {
            continue;
          }

          const hasTrustedPosition = asString(lineValue.Position) != null;
          const lineHint = toInt(lineValue.Line);

          if (hasTrustedPosition) {
            timingDataPositionFields += 1;
          }

          if (!hasTrustedPosition && lineHint != null) {
            timingDataLineOnlyHints += 1;
            if (lineHint === 1) {
              const key = `${event.topic}:${driverNumber}`;
              leadingLineHintCounts.set(
                key,
                (leadingLineHintCounts.get(key) ?? 0) + 1,
              );
            }
          }
        }
      }

      if (event.topic === 'TimingAppData') {
        const lines = isRecord(event.payload.Lines)
          ? event.payload.Lines
          : null;
        if (!lines) {
          continue;
        }

        for (const [driverNumber, lineValue] of Object.entries(lines)) {
          if (!isRecord(lineValue)) {
            continue;
          }

          const lineHint = toInt(lineValue.Line);
          if (lineHint == null) {
            continue;
          }

          timingAppLineHints += 1;
          if (lineHint === 1) {
            const key = `${event.topic}:${driverNumber}`;
            leadingLineHintCounts.set(
              key,
              (leadingLineHintCounts.get(key) ?? 0) + 1,
            );
          }
        }
      }

      if (event.topic === 'DriverList') {
        for (const [driverNumber, lineValue] of Object.entries(event.payload)) {
          if (!isRecord(lineValue)) {
            continue;
          }

          const lineHint = toInt(lineValue.Line);
          if (lineHint == null) {
            continue;
          }

          const keys = Object.keys(lineValue);
          const lineOnly = keys.length === 1 && keys[0] === 'Line';
          if (lineOnly) {
            driverListLineOnlyHints += 1;
          }

          if (lineHint === 1) {
            const key = `${event.topic}:${driverNumber}`;
            leadingLineHintCounts.set(
              key,
              (leadingLineHintCounts.get(key) ?? 0) + 1,
            );
          }
        }
      }
    }

    const leadingLineHints = [...leadingLineHintCounts.entries()]
      .map(([key, count]) => {
        const [topic, driverNumber] = key.split(':');
        return {
          topic,
          driverNumber,
          count,
        };
      })
      .sort(
        (left, right) =>
          right.count - left.count || left.topic.localeCompare(right.topic),
      )
      .slice(0, 10);

    return {
      sessionKey,
      eventCount: events.length,
      timingDataPositionFields,
      timingDataLineOnlyHints,
      timingAppLineHints,
      driverListLineOnlyHints,
      leadingLineHints,
    };
  }

  private loadProviderEvents(sessionKey: string): Promise<ReplayEventRow[]> {
    return this.prisma.liveProviderEvent.findMany({
      where: {
        source: LiveCaptureSource.PROVIDER,
        sessionKey,
      },
      orderBy: [{ emittedAt: 'asc' }, { runSequence: 'asc' }],
      select: {
        topic: true,
        payload: true,
        emittedAt: true,
      },
    });
  }
}
