import { LiveCaptureService } from './live.capture.service';
import {
  LiveBoardProjectionState,
  LivePublicState,
  LiveState,
} from './live.types';

function createConfigMock(values: Record<string, unknown>) {
  return {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      if (key in values) {
        return values[key];
      }

      return defaultValue;
    }),
  };
}

function createLiveState(): LiveState {
  return {
    generatedAt: '2026-03-09T05:00:00.000Z',
    session: {
      weekendId: 'australian-grand-prix',
      sessionId: 'australian-grand-prix-race',
      sessionName: 'Australian Grand Prix - Race',
      phase: 'running',
      flag: 'green',
      currentLap: 18,
      totalLaps: 57,
      clockIso: '2026-03-09T05:00:00.000Z',
    },
    leaderboard: [
      {
        position: 1,
        driverNumber: '4',
        driverCode: 'NOR',
        driverName: 'Lando Norris',
        teamName: 'McLaren',
        trackStatus: 'on_track',
        pitState: 'on_track',
        pitStops: 0,
        speedKph: 315,
        topSpeedKph: 326,
        gapToLeaderSec: 0,
        gapToLeaderText: null,
        intervalToAheadSec: 0,
        intervalToAheadText: null,
        sector1Ms: 28500,
        sector2Ms: 30200,
        sector3Ms: 29900,
        bestSector1Ms: 28400,
        bestSector2Ms: 30100,
        bestSector3Ms: 29800,
        lastLapMs: 89400,
        bestLapMs: 89300,
        completedLaps: 18,
        speedHistoryKph: [{ at: '2026-03-09T05:00:00.000Z', kph: 315 }],
        trackStatusHistory: [
          { at: '2026-03-09T05:00:00.000Z', status: 'on_track' },
        ],
        miniSectors: [{ sector: 1, segment: 0, status: 2048, active: true }],
        tireCompound: 'MEDIUM',
        stintLap: 18,
        tireIsNew: false,
        positionSource: 'timing_data',
        positionUpdatedAt: '2026-03-09T05:00:00.000Z',
        positionConfidence: 'high',
      },
    ],
    raceControl: [],
  };
}

function createPublicState(state: LiveState): LivePublicState {
  return {
    generatedAt: state.generatedAt,
    session: state.session,
    leaderboard: state.leaderboard.map((entry) => ({
      position: entry.position,
      driverCode: entry.driverCode,
      driverName: entry.driverName,
      teamName: entry.teamName,
      gapToLeaderSec: entry.gapToLeaderSec,
      intervalToAheadSec: entry.intervalToAheadSec,
      sector1Ms: entry.sector1Ms,
      sector2Ms: entry.sector2Ms,
      sector3Ms: entry.sector3Ms,
      bestSector1Ms: entry.bestSector1Ms,
      bestSector2Ms: entry.bestSector2Ms,
      bestSector3Ms: entry.bestSector3Ms,
      lastLapMs: entry.lastLapMs,
      bestLapMs: entry.bestLapMs,
      speedHistoryKph: entry.speedHistoryKph,
      trackStatusHistory: entry.trackStatusHistory,
    })),
    raceControl: state.raceControl,
  };
}

function createProjectionState(): LiveBoardProjectionState {
  return {
    mode: 'pass_through',
    lowConfidenceLeaderSuppressions: 2,
    lastLowConfidenceLeaderAt: '2026-03-09T04:59:00.000Z',
    lastLowConfidenceLeaderCode: 'NOR',
    lastLowConfidenceLeaderSource: 'timing_data',
    lastLowConfidenceLeaderConfidence: 'high',
    internalLeaderboardRows: 1,
    publicLeaderboardRows: 1,
    internalLeaderCode: 'NOR',
    internalLeaderSource: 'timing_data',
    internalLeaderConfidence: 'high',
    publicLeaderCode: 'NOR',
  };
}

function createPrismaMock() {
  const liveSessionSnapshot = {
    findFirst: jest.fn(),
    updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
    create: jest.fn(() => Promise.resolve(undefined)),
    deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
  };

  return {
    liveSessionSnapshot,
    liveProviderEvent: {
      deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
    liveCaptureRun: {
      deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ liveSessionSnapshot }),
    ),
  };
}

function flushSnapshotQueue(service: LiveCaptureService): Promise<void> {
  return (service as unknown as { snapshotWriteQueue: Promise<void> })
    .snapshotWriteQueue;
}

describe('LiveCaptureService', () => {
  it('stores append-only checkpoint snapshots and marks only the latest row', async () => {
    const config = createConfigMock({
      LIVE_PROVIDER_CAPTURE_ENABLED: 'true',
    });
    const prisma = createPrismaMock();
    prisma.liveSessionSnapshot.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ version: 1 });

    const service = new LiveCaptureService(config as never, prisma as never);
    const firstState = createLiveState();
    const secondState = {
      ...createLiveState(),
      generatedAt: '2026-03-09T05:00:05.000Z',
      session: {
        ...createLiveState().session,
        clockIso: '2026-03-09T05:00:05.000Z',
      },
    };

    service.persistSnapshot(
      'provider',
      firstState,
      createPublicState(firstState),
      createProjectionState(),
      ['leaderboard'],
    );
    await flushSnapshotQueue(service);

    service.persistSnapshot(
      'provider',
      secondState,
      createPublicState(secondState),
      createProjectionState(),
      ['leaderboard', 'generatedAt'],
    );
    await flushSnapshotQueue(service);

    const createCalls = prisma.liveSessionSnapshot.create.mock
      .calls as unknown as Array<
      [
        {
          data: {
            source: string;
            sessionKey: string;
            version: number;
            isLatest: boolean;
          };
        },
      ]
    >;

    expect(prisma.liveSessionSnapshot.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        source: 'PROVIDER',
        sessionKey: 'provider:australian-grand-prix:australian-grand-prix-race',
        isLatest: true,
      },
      data: {
        isLatest: false,
      },
    });
    expect(createCalls[0]?.[0].data).toEqual(
      expect.objectContaining({
        source: 'PROVIDER',
        sessionKey: 'provider:australian-grand-prix:australian-grand-prix-race',
        version: 1,
        isLatest: true,
      }),
    );
    expect(createCalls[1]?.[0].data).toEqual(
      expect.objectContaining({
        source: 'PROVIDER',
        sessionKey: 'provider:australian-grand-prix:australian-grand-prix-race',
        version: 2,
        isLatest: true,
      }),
    );
  });

  it('loads the latest persisted snapshot bundle with projection metadata', async () => {
    const config = createConfigMock({
      LIVE_PROVIDER_CAPTURE_ENABLED: 'true',
      LIVE_PROVIDER_SNAPSHOT_RESTORE_MAX_AGE_SEC: 999999999,
    });
    const prisma = createPrismaMock();
    const state = createLiveState();
    const publicState = createPublicState(state);
    const projectionState = createProjectionState();
    prisma.liveSessionSnapshot.findFirst.mockResolvedValue({
      sessionKey: 'provider:australian-grand-prix:australian-grand-prix-race',
      generatedAt: new Date(state.generatedAt),
      version: 7,
      changedFields: ['leaderboard', 'generatedAt'],
      internalState: state,
      publicState,
      projectionState,
    });

    const service = new LiveCaptureService(config as never, prisma as never);

    await expect(service.loadLatestSnapshotBundle('provider')).resolves.toEqual(
      {
        sessionKey: 'provider:australian-grand-prix:australian-grand-prix-race',
        generatedAt: state.generatedAt,
        version: 7,
        changedFields: ['leaderboard', 'generatedAt'],
        internalState: state,
        publicState,
        projectionState,
      },
    );
    expect(prisma.liveSessionSnapshot.findFirst).toHaveBeenCalledWith({
      where: {
        source: 'PROVIDER',
        isLatest: true,
      },
      orderBy: [{ generatedAt: 'desc' }, { version: 'desc' }],
    });
  });
});
