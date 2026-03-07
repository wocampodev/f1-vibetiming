import { LiveCaptureSource } from '@prisma/client';
import { LiveReplayService } from './live.replay.service';

function createPrismaMock(events: Array<Record<string, unknown>>) {
  return {
    liveProviderEvent: {
      findMany: jest.fn(() => Promise.resolve(events)),
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
      state: {
        session: {
          sessionName: 'Australian Grand Prix - Qualifying',
        },
      },
    });
    expect(replay?.state?.leaderboard[0]).toMatchObject({ position: 1 });
    expect(replay?.state?.leaderboard[1]).toMatchObject({ position: 2 });
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

    expect(audit).toEqual({
      sessionKey: 'provider:australia:qualifying',
      eventCount: 3,
      timingDataPositionFields: 1,
      timingDataLineOnlyHints: 1,
      timingAppLineHints: 1,
      driverListLineOnlyHints: 1,
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
