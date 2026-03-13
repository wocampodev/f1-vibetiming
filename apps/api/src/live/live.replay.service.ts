import { Injectable } from '@nestjs/common';
import { LiveCaptureSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderStateAccumulator } from './live.provider.adapter';
import {
  LivePositionConfidence,
  LivePositionSource,
  LiveState,
  LiveTopicFreshnessState,
} from './live.types';

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
  topicFreshness: LiveTopicFreshnessState | null;
}

export interface LiveRankingAuditResult {
  sessionKey: string;
  eventCount: number;
  timingDataPositionFields: number;
  timingDataLineOnlyHints: number;
  timingAppLineHints: number;
  driverListLineOnlyHints: number;
  projectionSamples: number;
  projectedPositionSourceCounts: Array<{
    source: LivePositionSource;
    count: number;
  }>;
  projectedPositionConfidenceCounts: Array<{
    confidence: LivePositionConfidence;
    count: number;
  }>;
  riskyLeaderSamples: Array<{
    driverCode: string;
    driverName: string | null;
    source: LivePositionSource;
    confidence: LivePositionConfidence;
    count: number;
    firstSeenAt: string;
    lastSeenAt: string;
  }>;
  finalLeaderboard: Array<{
    position: number;
    driverCode: string;
    driverName: string | null;
    positionSource: LivePositionSource;
    positionConfidence: LivePositionConfidence;
    positionUpdatedAt: string | null;
  }>;
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

const incrementCount = <T extends string>(
  map: Map<T, number>,
  key: T,
): void => {
  map.set(key, (map.get(key) ?? 0) + 1);
};

const buildTopicFreshness = (
  events: ReplayEventRow[],
): LiveTopicFreshnessState | null => {
  if (events.length === 0) {
    return null;
  }

  const topicCounts = new Map<string, number>();
  const topicLastSeenAt = new Map<string, string>();

  for (const event of events) {
    topicCounts.set(event.topic, (topicCounts.get(event.topic) ?? 0) + 1);
    topicLastSeenAt.set(event.topic, event.emittedAt.toISOString());
  }

  return {
    capturedAt:
      events.at(-1)?.emittedAt.toISOString() ?? new Date().toISOString(),
    topics: [...topicCounts.entries()]
      .map(([topic, messageCount]) => ({
        topic,
        lastSeenAt: topicLastSeenAt.get(topic) ?? null,
        messageCount,
      }))
      .sort((left, right) => left.topic.localeCompare(right.topic)),
  };
};

@Injectable()
export class LiveReplayService {
  constructor(private readonly prisma: PrismaService) {}

  async auditLatestProviderSession(
    maxAgeSec?: number,
  ): Promise<LiveRankingAuditResult | null> {
    const latestSession = await this.loadLatestProviderSession(maxAgeSec);
    if (!latestSession) {
      return null;
    }

    return this.auditProviderRanking(latestSession.sessionKey);
  }

  async replayLatestProviderSession(
    maxAgeSec?: number,
  ): Promise<LiveSessionReplayResult | null> {
    const latestSession = await this.loadLatestProviderSession(maxAgeSec);
    if (!latestSession) {
      return null;
    }

    return this.replayProviderSession(latestSession.sessionKey);
  }

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
      topicFreshness: buildTopicFreshness(events),
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
    const projectedPositionSourceCounts = new Map<LivePositionSource, number>();
    const projectedPositionConfidenceCounts = new Map<
      LivePositionConfidence,
      number
    >();
    const riskyLeaderSampleCounts = new Map<
      string,
      {
        driverCode: string;
        driverName: string | null;
        source: LivePositionSource;
        confidence: LivePositionConfidence;
        count: number;
        firstSeenAt: string;
        lastSeenAt: string;
      }
    >();
    let projectionSamples = 0;
    let latestState: LiveState | null = null;
    const accumulator = new ProviderStateAccumulator();

    for (const event of events) {
      if (isRecord(event.payload)) {
        if (event.topic === 'TimingData') {
          const lines = isRecord(event.payload.Lines)
            ? event.payload.Lines
            : null;

          if (lines) {
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
        }

        if (event.topic === 'TimingAppData') {
          const lines = isRecord(event.payload.Lines)
            ? event.payload.Lines
            : null;

          if (lines) {
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
        }

        if (event.topic === 'DriverList') {
          for (const [driverNumber, lineValue] of Object.entries(
            event.payload,
          )) {
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

      accumulator.ingest(
        event.topic,
        event.payload as unknown,
        event.emittedAt.toISOString(),
      );
      const state = accumulator.buildState(event.emittedAt.toISOString());
      if (!state) {
        continue;
      }

      latestState = state;
      projectionSamples += 1;

      for (const entry of state.leaderboard) {
        incrementCount(projectedPositionSourceCounts, entry.positionSource);
        incrementCount(
          projectedPositionConfidenceCounts,
          entry.positionConfidence,
        );
      }

      const leader = state.leaderboard[0];
      if (
        leader &&
        (leader.positionSource !== 'timing_data' ||
          leader.positionConfidence !== 'high')
      ) {
        const key = [
          leader.driverCode,
          leader.positionSource,
          leader.positionConfidence,
        ].join(':');
        const existing = riskyLeaderSampleCounts.get(key);
        if (existing) {
          existing.count += 1;
          existing.lastSeenAt = state.generatedAt;
        } else {
          riskyLeaderSampleCounts.set(key, {
            driverCode: leader.driverCode,
            driverName: leader.driverName,
            source: leader.positionSource,
            confidence: leader.positionConfidence,
            count: 1,
            firstSeenAt: state.generatedAt,
            lastSeenAt: state.generatedAt,
          });
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

    const projectionSourceCounts = [...projectedPositionSourceCounts.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort(
        (left, right) =>
          right.count - left.count || left.source.localeCompare(right.source),
      );

    const confidenceOrder: LivePositionConfidence[] = ['high', 'medium', 'low'];
    const projectionConfidenceCounts = confidenceOrder
      .map((confidence) => ({
        confidence,
        count: projectedPositionConfidenceCounts.get(confidence) ?? 0,
      }))
      .filter((entry) => entry.count > 0);

    const riskyLeaderSamples = [...riskyLeaderSampleCounts.values()].sort(
      (left, right) =>
        right.count - left.count ||
        left.driverCode.localeCompare(right.driverCode),
    );

    const finalLeaderboard = (latestState?.leaderboard ?? []).map((entry) => ({
      position: entry.position,
      driverCode: entry.driverCode,
      driverName: entry.driverName,
      positionSource: entry.positionSource,
      positionConfidence: entry.positionConfidence,
      positionUpdatedAt: entry.positionUpdatedAt,
    }));

    return {
      sessionKey,
      eventCount: events.length,
      timingDataPositionFields,
      timingDataLineOnlyHints,
      timingAppLineHints,
      driverListLineOnlyHints,
      projectionSamples,
      projectedPositionSourceCounts: projectionSourceCounts,
      projectedPositionConfidenceCounts: projectionConfidenceCounts,
      riskyLeaderSamples,
      finalLeaderboard,
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

  private async loadLatestProviderSession(
    maxAgeSec?: number,
  ): Promise<{ sessionKey: string; emittedAt: Date } | null> {
    const latestEvent = await this.prisma.liveProviderEvent.findFirst({
      where: {
        source: LiveCaptureSource.PROVIDER,
      },
      orderBy: [{ emittedAt: 'desc' }, { runSequence: 'desc' }],
      select: {
        sessionKey: true,
        emittedAt: true,
      },
    });

    if (!latestEvent?.sessionKey) {
      return null;
    }

    if (maxAgeSec != null) {
      const ageSec = Math.floor(
        (Date.now() - latestEvent.emittedAt.getTime()) / 1000,
      );
      if (ageSec > maxAgeSec) {
        return null;
      }
    }

    return latestEvent;
  }
}
