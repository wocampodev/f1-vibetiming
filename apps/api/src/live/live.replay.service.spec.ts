import { LiveCaptureSource } from '@prisma/client';
import { LiveReplayService } from './live.replay.service';

function createPrismaMock(events: Array<Record<string, unknown>>) {
  return {
    liveProviderEvent: {
      findMany: jest.fn(() => Promise.resolve(events)),
      findFirst: jest.fn(() =>
        Promise.resolve(
          events.length > 0
            ? {
                captureRunId: 'run-1',
                sessionKey: 'provider:australia:qualifying',
                emittedAt: (events.at(-1)?.emittedAt as Date) ?? new Date(),
              }
            : null,
        ),
      ),
    },
    liveCaptureRun: {
      findMany: jest.fn(() => Promise.resolve([])),
    },
  };
}

describe('LiveReplayService', () => {
  it('replays a provider session from persisted events', async () => {
    const emittedAt = new Date('2026-03-03T00:00:00.000Z');
    const prisma = createPrismaMock([
      {
        topic: 'SessionInfo',
        payload: {
          Key: 'session-1',
          Name: 'Qualifying',
          Meeting: { Key: 'weekend-1', Name: 'Australian Grand Prix' },
        },
        emittedAt,
      },
      {
        topic: 'TimingData',
        payload: {
          Lines: {
            '1': {
              Position: '1',
              LastLapTime: { Value: '1:20.000' },
            },
            '81': {
              Position: '2',
              LastLapTime: { Value: '1:20.500' },
            },
          },
        },
        emittedAt: new Date('2026-03-03T00:00:01.000Z'),
      },
    ]);

    const service = new LiveReplayService(prisma as never);
    const replay = await service.replayProviderSession(
      'provider:australia:qualifying',
    );

    expect(prisma.liveProviderEvent.findMany).toHaveBeenCalledWith({
      where: {
        source: LiveCaptureSource.PROVIDER,
        sessionKey: 'provider:australia:qualifying',
      },
      orderBy: [{ emittedAt: 'asc' }, { runSequence: 'asc' }],
      select: {
        topic: true,
        payload: true,
        emittedAt: true,
      },
    });
    expect(replay).not.toBeNull();
    expect(replay).toMatchObject({
      sessionKey: 'provider:australia:qualifying',
      eventCount: 2,
      firstEventAt: '2026-03-03T00:00:00.000Z',
      lastEventAt: '2026-03-03T00:00:01.000Z',
      topicFreshness: {
        capturedAt: '2026-03-03T00:00:01.000Z',
        topics: [
          {
            topic: 'SessionInfo',
            lastSeenAt: '2026-03-03T00:00:00.000Z',
            messageCount: 1,
          },
          {
            topic: 'TimingData',
            lastSeenAt: '2026-03-03T00:00:01.000Z',
            messageCount: 1,
          },
        ],
      },
      state: {
        session: {
          sessionName: 'Australian Grand Prix - Qualifying',
        },
      },
    });
    expect(replay?.state?.leaderboard[0]).toMatchObject({ position: 1 });
    expect(replay?.state?.leaderboard[1]).toMatchObject({ position: 2 });
  });

  it('replays the latest provider session within the allowed age window', async () => {
    const emittedAt = new Date();
    const prisma = createPrismaMock([
      {
        topic: 'TimingData',
        payload: {
          Lines: {
            '1': {
              Position: '1',
            },
          },
        },
        emittedAt,
      },
    ]);

    const service = new LiveReplayService(prisma as never);
    const replay = await service.replayLatestProviderSession(300);

    expect(prisma.liveProviderEvent.findFirst).toHaveBeenCalledWith({
      where: {
        source: LiveCaptureSource.PROVIDER,
      },
      orderBy: [{ emittedAt: 'desc' }, { runSequence: 'desc' }],
      select: {
        captureRunId: true,
        sessionKey: true,
        emittedAt: true,
      },
    });
    expect(replay).not.toBeNull();
    expect(replay?.sessionKey).toBe('provider:australia:qualifying');
    expect(replay?.topicFreshness).toMatchObject({
      capturedAt: emittedAt.toISOString(),
      topics: [
        {
          topic: 'TimingData',
          lastSeenAt: emittedAt.toISOString(),
          messageCount: 1,
        },
      ],
    });
  });

  it('returns null when the latest provider session is too old to restore', async () => {
    const emittedAt = new Date('2026-03-01T00:00:00.000Z');
    const prisma = createPrismaMock([
      {
        topic: 'TimingData',
        payload: {
          Lines: {
            '1': {
              Position: '1',
            },
          },
        },
        emittedAt,
      },
    ]);

    const service = new LiveReplayService(prisma as never);
    await expect(service.replayLatestProviderSession(1)).resolves.toBeNull();
    expect(prisma.liveProviderEvent.findMany).not.toHaveBeenCalled();
  });

  it('audits the latest provider session within the allowed age window', async () => {
    const emittedAt = new Date();
    const prisma = createPrismaMock([
      {
        topic: 'TimingData',
        payload: {
          Lines: {
            '1': {
              Position: '1',
            },
          },
        },
        emittedAt,
      },
    ]);

    const service = new LiveReplayService(prisma as never);
    const audit = await service.auditLatestProviderSession(300);

    expect(prisma.liveProviderEvent.findFirst).toHaveBeenCalledWith({
      where: {
        source: LiveCaptureSource.PROVIDER,
      },
      orderBy: [{ emittedAt: 'desc' }, { runSequence: 'desc' }],
      select: {
        captureRunId: true,
        sessionKey: true,
        emittedAt: true,
      },
    });
    expect(audit).not.toBeNull();
    expect(audit?.sessionKey).toBe('provider:australia:qualifying');
  });

  it('returns null when the latest provider session is too old to audit', async () => {
    const emittedAt = new Date('2026-03-01T00:00:00.000Z');
    const prisma = createPrismaMock([
      {
        topic: 'TimingData',
        payload: {
          Lines: {
            '1': {
              Position: '1',
            },
          },
        },
        emittedAt,
      },
    ]);

    const service = new LiveReplayService(prisma as never);
    await expect(service.auditLatestProviderSession(1)).resolves.toBeNull();
    expect(prisma.liveProviderEvent.findMany).not.toHaveBeenCalled();
  });

  it('replays only the recent run chain for unknown provider sessions', async () => {
    const recentSessionKey = 'provider:unknown-weekend:unknown-session';
    const replayEvents = [
      {
        topic: 'TimingAppData',
        payload: {
          Lines: {
            '12': {
              Stints: {
                '0': {
                  Compound: 'MEDIUM',
                },
                '1': {
                  Compound: 'HARD',
                  TotalLaps: 10,
                },
              },
            },
          },
        },
        emittedAt: new Date('2026-03-15T07:20:51.260Z'),
      },
      {
        topic: 'TimingData',
        payload: {
          Lines: {
            '12': {
              GapToLeader: 'LAP 43',
              NumberOfLaps: 42,
              LastLapTime: { Value: '1:31.000' },
            },
            '63': {
              Position: '2',
              GapToLeader: '+7.500',
              NumberOfLaps: 42,
              LastLapTime: { Value: '1:31.500' },
            },
          },
        },
        emittedAt: new Date('2026-03-15T08:10:00.000Z'),
      },
    ];
    const prisma = {
      liveProviderEvent: {
        findFirst: jest.fn(() =>
          Promise.resolve({
            captureRunId: 'run-current',
            sessionKey: recentSessionKey,
            emittedAt: new Date('2026-03-15T08:10:00.000Z'),
          }),
        ),
        findMany: jest.fn(() => Promise.resolve(replayEvents)),
      },
      liveCaptureRun: {
        findMany: jest.fn(() =>
          Promise.resolve([
            {
              id: 'run-current',
              startedAt: new Date('2026-03-15T08:00:00.000Z'),
              lastEventAt: new Date('2026-03-15T08:10:00.000Z'),
              finishedAt: null,
            },
            {
              id: 'run-previous',
              startedAt: new Date('2026-03-15T07:20:00.000Z'),
              lastEventAt: new Date('2026-03-15T07:59:00.000Z'),
              finishedAt: new Date('2026-03-15T07:59:00.000Z'),
            },
            {
              id: 'run-yesterday',
              startedAt: new Date('2026-03-14T07:00:00.000Z'),
              lastEventAt: new Date('2026-03-14T08:00:00.000Z'),
              finishedAt: new Date('2026-03-14T08:00:00.000Z'),
            },
          ]),
        ),
      },
    };

    const service = new LiveReplayService(prisma as never);
    const replay = await service.replayLatestProviderSession(21600);

    expect(prisma.liveCaptureRun.findMany).toHaveBeenCalledWith({
      where: {
        source: LiveCaptureSource.PROVIDER,
        sessionKey: recentSessionKey,
      },
      orderBy: [{ startedAt: 'desc' }],
      select: {
        id: true,
        startedAt: true,
        lastEventAt: true,
        finishedAt: true,
      },
    });
    expect(prisma.liveProviderEvent.findMany).toHaveBeenCalledWith({
      where: {
        source: LiveCaptureSource.PROVIDER,
        captureRunId: {
          in: ['run-current', 'run-previous'],
        },
      },
      orderBy: [{ emittedAt: 'asc' }, { runSequence: 'asc' }],
      select: {
        topic: true,
        payload: true,
        emittedAt: true,
      },
    });
    expect(replay?.state?.leaderboard[0]).toMatchObject({
      driverCode: '12',
      position: 1,
      tireCompound: 'HARD',
    });
    expect(replay?.state?.leaderboard[1]).toMatchObject({
      driverCode: '63',
      position: 2,
    });
  });

  it('audits risky line-hint ranking inputs from persisted events', async () => {
    const prisma = createPrismaMock([
      {
        topic: 'TimingData',
        payload: {
          Lines: {
            '1': {
              Position: '1',
            },
            '81': {
              Line: '1',
            },
          },
        },
        emittedAt: new Date('2026-03-03T00:00:01.000Z'),
      },
      {
        topic: 'TimingAppData',
        payload: {
          Lines: {
            '81': {
              Line: 1,
            },
          },
        },
        emittedAt: new Date('2026-03-03T00:00:02.000Z'),
      },
      {
        topic: 'DriverList',
        payload: {
          '81': {
            Line: 1,
          },
        },
        emittedAt: new Date('2026-03-03T00:00:03.000Z'),
      },
    ]);

    const service = new LiveReplayService(prisma as never);
    const audit = await service.auditProviderRanking(
      'provider:australia:qualifying',
    );

    expect(audit).toMatchObject({
      sessionKey: 'provider:australia:qualifying',
      eventCount: 3,
      timingDataPositionFields: 1,
      timingDataLineOnlyHints: 1,
      timingAppLineHints: 1,
      driverListLineOnlyHints: 1,
      projectionSamples: 3,
      projectedPositionSourceCounts: [
        {
          source: 'driver_code',
          count: 3,
        },
        {
          source: 'timing_data',
          count: 3,
        },
      ],
      projectedPositionConfidenceCounts: [
        {
          confidence: 'high',
          count: 3,
        },
        {
          confidence: 'low',
          count: 3,
        },
      ],
      riskyLeaderSamples: [],
      leadingLineHints: [
        {
          topic: 'DriverList',
          driverNumber: '81',
          count: 1,
        },
        {
          topic: 'TimingAppData',
          driverNumber: '81',
          count: 1,
        },
        {
          topic: 'TimingData',
          driverNumber: '81',
          count: 1,
        },
      ],
    });
    expect(audit?.finalLeaderboard[0]).toMatchObject({
      position: 1,
      driverCode: '1',
      positionSource: 'timing_data',
      positionConfidence: 'high',
      positionUpdatedAt: '2026-03-03T00:00:01.000Z',
    });
    expect(audit?.finalLeaderboard[1]).toMatchObject({
      position: 2,
      driverCode: '81',
      driverName: 'Oscar Piastri',
      positionSource: 'driver_code',
      positionConfidence: 'low',
      positionUpdatedAt: null,
    });
  });

  it('audits risky projected leaders when replay relies on best-lap ordering', async () => {
    const prisma = createPrismaMock([
      {
        topic: 'TimingData',
        payload: {
          Lines: {
            '81': {
              LastLapTime: { Value: '1:20.000' },
              BestLapTime: { Value: '1:19.500' },
            },
            '16': {
              LastLapTime: { Value: '1:21.000' },
              BestLapTime: { Value: '1:20.500' },
            },
          },
        },
        emittedAt: new Date('2026-03-03T00:00:01.000Z'),
      },
    ]);

    const service = new LiveReplayService(prisma as never);
    const audit = await service.auditProviderRanking(
      'provider:australia:qualifying',
    );

    expect(audit).toMatchObject({
      sessionKey: 'provider:australia:qualifying',
      eventCount: 1,
      timingDataPositionFields: 0,
      timingDataLineOnlyHints: 0,
      timingAppLineHints: 0,
      driverListLineOnlyHints: 0,
      projectionSamples: 1,
      projectedPositionSourceCounts: [
        {
          source: 'best_lap',
          count: 2,
        },
      ],
      projectedPositionConfidenceCounts: [
        {
          confidence: 'low',
          count: 2,
        },
      ],
      riskyLeaderSamples: [
        {
          driverCode: '81',
          driverName: 'Oscar Piastri',
          source: 'best_lap',
          confidence: 'low',
          count: 1,
          firstSeenAt: '2026-03-03T00:00:01.000Z',
          lastSeenAt: '2026-03-03T00:00:01.000Z',
        },
      ],
    });
    expect(audit?.finalLeaderboard[0]).toMatchObject({
      position: 1,
      driverCode: '81',
      driverName: 'Oscar Piastri',
      positionSource: 'best_lap',
      positionConfidence: 'low',
      positionUpdatedAt: '2026-03-03T00:00:01.000Z',
    });
  });

  it('returns null when a session has no persisted events', async () => {
    const prisma = createPrismaMock([]);
    const service = new LiveReplayService(prisma as never);

    await expect(
      service.replayProviderSession('provider:australia:qualifying'),
    ).resolves.toBeNull();
    await expect(
      service.auditProviderRanking('provider:australia:qualifying'),
    ).resolves.toBeNull();
  });
});
