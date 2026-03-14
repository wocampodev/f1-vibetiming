import { firstValueFrom } from 'rxjs';
import { LiveService } from './live.service';
import {
  LiveBoardProjectionState,
  LivePublicState,
  LiveState,
  LiveTopicFreshnessState,
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
    generatedAt: '2026-03-03T00:00:00.000Z',
    session: {
      weekendId: 'provider-weekend',
      sessionId: 'provider-session',
      sessionName: 'Provider Session',
      phase: 'running',
      flag: 'green',
      currentLap: 5,
      totalLaps: 57,
      clockIso: '2026-03-03T00:00:00.000Z',
    },
    leaderboard: [
      {
        position: 1,
        driverNumber: '3',
        driverCode: 'VER',
        driverName: 'Max Verstappen',
        teamName: 'Red Bull Racing',
        trackStatus: 'on_track',
        pitState: 'on_track',
        pitStops: 0,
        speedKph: 311,
        topSpeedKph: 322,
        gapToLeaderSec: 0,
        gapToLeaderText: null,
        intervalToAheadSec: 0,
        intervalToAheadText: null,
        sector1Ms: 29810,
        sector2Ms: 30760,
        sector3Ms: 30430,
        bestSector1Ms: 29790,
        bestSector2Ms: 30680,
        bestSector3Ms: 30330,
        lastLapMs: 91000,
        bestLapMs: 90800,
        completedLaps: 5,
        speedHistoryKph: [{ at: '2026-03-03T00:00:00.000Z', kph: 311 }],
        trackStatusHistory: [
          { at: '2026-03-03T00:00:00.000Z', status: 'on_track' },
        ],
        miniSectors: [
          { sector: 1, segment: 0, status: 2048, active: true },
          { sector: 1, segment: 1, status: 2048, active: true },
        ],
        tireCompound: 'SOFT',
        stintLap: 5,
        tireIsNew: false,
        positionSource: 'timing_data',
        positionUpdatedAt: '2026-03-03T00:00:00.000Z',
        positionConfidence: 'high',
      },
    ],
    raceControl: [],
  };
}

function cloneLiveState(): LiveState {
  return JSON.parse(JSON.stringify(createLiveState())) as LiveState;
}

function createPublicState(
  state: LiveState = createLiveState(),
): LivePublicState {
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

function createProjectionState(
  overrides?: Partial<LiveBoardProjectionState>,
): LiveBoardProjectionState {
  return {
    mode: 'pass_through',
    lowConfidenceLeaderSuppressions: 0,
    lastLowConfidenceLeaderAt: null,
    lastLowConfidenceLeaderCode: null,
    lastLowConfidenceLeaderSource: null,
    lastLowConfidenceLeaderConfidence: null,
    internalLeaderboardRows: 1,
    publicLeaderboardRows: 1,
    internalLeaderCode: 'VER',
    internalLeaderSource: 'timing_data',
    internalLeaderConfidence: 'high',
    publicLeaderCode: 'VER',
    ...overrides,
  };
}

function createTopicFreshnessState(
  overrides?: Partial<LiveTopicFreshnessState>,
): LiveTopicFreshnessState {
  return {
    capturedAt: '2026-03-03T00:00:00.000Z',
    topics: [
      {
        topic: 'LapCount',
        lastSeenAt: '2026-03-03T00:00:00.000Z',
        messageCount: 2,
      },
      {
        topic: 'TimingData',
        lastSeenAt: '2026-03-03T00:00:00.000Z',
        messageCount: 18,
      },
    ],
    ...overrides,
  };
}

function createLeaderboardEntry(
  overrides?: Partial<LiveState['leaderboard'][number]>,
): LiveState['leaderboard'][number] {
  return {
    ...createLiveState().leaderboard[0],
    ...overrides,
  };
}

function createProviderAdapterMock(overrides?: Record<string, unknown>) {
  const state = createLiveState();

  return {
    source: 'provider' as const,
    start: jest.fn((publish: (event: unknown) => void) => {
      publish({
        type: 'status',
        status: 'connecting',
        message: 'Connecting to Formula 1 live SignalR stream',
      });
      publish({ type: 'initial_state', state });
      publish({
        type: 'status',
        status: 'live',
        message: 'Connected to Formula 1 live SignalR stream',
      });
      return Promise.resolve();
    }),
    stop: jest.fn(() => Promise.resolve()),
    getHealth: jest.fn(() => ({
      running: true,
      startedAt: '2026-03-03T00:00:00.000Z',
      lastEventAt: '2026-03-03T00:00:02.000Z',
      heartbeatMs: 15000,
      details: {
        framesReceived: 42,
        feedMessagesReceived: 180,
        frameParseErrors: 1,
        topics: ['LapCount', 'TimingData'],
        topicMessageCount: {
          LapCount: 2,
          TimingData: 180,
        },
        topicLastSeenAt: {
          LapCount: '2026-03-03T00:00:00.000Z',
          TimingData: '2026-03-03T00:00:00.000Z',
        },
      },
    })),
    ...overrides,
  };
}

function createLiveCaptureServiceMock(overrides?: Record<string, unknown>) {
  return {
    loadLatestSnapshotBundle: jest.fn(() => Promise.resolve(null)),
    persistSnapshot: jest.fn(),
    getHealth: jest.fn(() => ({ enabled: false })),
    seedProviderContext: jest.fn(),
    ...overrides,
  };
}

function createLiveReplayServiceMock(overrides?: Record<string, unknown>) {
  return {
    replayLatestProviderSession: jest.fn(() => Promise.resolve(null)),
    ...overrides,
  };
}

describe('LiveService', () => {
  it('starts the provider source and exposes current state', async () => {
    const config = createConfigMock({});
    const provider = createProviderAdapterMock();
    const capture = createLiveCaptureServiceMock();
    const replay = createLiveReplayServiceMock();
    const service = new LiveService(
      config as never,
      provider as never,
      capture as never,
      replay as never,
    );

    await service.onModuleInit();

    expect(provider.start).toHaveBeenCalledTimes(1);
    expect(service.getState()).toMatchObject({
      session: {
        sessionName: 'Provider Session',
      },
    });
    expect(service.getState()?.leaderboard[0]).not.toHaveProperty(
      'trackStatus',
    );
    expect(service.getState()?.leaderboard[0]).not.toHaveProperty('speedKph');
    expect(service.getState()?.leaderboard[0]).not.toHaveProperty(
      'tireCompound',
    );
    expect(service.getHealth()).toMatchObject({
      source: 'provider',
      status: 'live',
    });
  });

  it('builds a rich live board projection without changing the live state contract', async () => {
    const config = createConfigMock({});
    const provider = createProviderAdapterMock();
    const capture = createLiveCaptureServiceMock();
    const replay = createLiveReplayServiceMock();
    const service = new LiveService(
      config as never,
      provider as never,
      capture as never,
      replay as never,
    );

    await service.onModuleInit();

    expect(service.getBoard()).toMatchObject({
      session: {
        sessionName: 'Provider Session',
      },
      fastestBestLapMs: 90800,
      projection: {
        mode: 'pass_through',
        internalLeaderboardRows: 1,
        publicLeaderboardRows: 1,
      },
      rows: [
        {
          position: 1,
          driverNumber: '3',
          driverCode: 'VER',
          teamKey: 'red_bull',
          teamColor: '#2d66d5',
          pitState: 'on_track',
          tire: {
            compound: 'SOFT',
            ageLaps: 5,
            isNew: false,
          },
          intervalToAheadText: 'LAP 5',
          gapToLeaderText: 'LAP 5',
          miniSectors: [
            { sector: 1, segment: 0, status: 2048, active: true },
            { sector: 1, segment: 1, status: 2048, active: true },
          ],
          isSessionFastestLap: true,
        },
      ],
    });
  });

  it('streams an initial_state envelope when state is available', async () => {
    const config = createConfigMock({});
    const provider = createProviderAdapterMock();
    const capture = createLiveCaptureServiceMock();
    const replay = createLiveReplayServiceMock();
    const service = new LiveService(
      config as never,
      provider as never,
      capture as never,
      replay as never,
    );

    await service.onModuleInit();
    const event = await firstValueFrom(service.stream());
    const data = event.data as {
      eventType: string;
      source: string;
      payload: LivePublicState;
    };

    expect(event.type).toBe('initial_state');
    expect(data.eventType).toBe('initial_state');
    expect(data.source).toBe('provider');
    expect(data.payload.session.sessionName).toContain('Provider');
    expect(data.payload.leaderboard[0]).not.toHaveProperty('trackStatus');
    expect(data.payload.leaderboard[0]).not.toHaveProperty('speedKph');
    expect(data.payload.leaderboard[0]).not.toHaveProperty('tireCompound');
  });

  it('streams status envelope when provider is degraded without state', async () => {
    const config = createConfigMock({});
    const provider = createProviderAdapterMock({
      start: jest.fn((publish: (event: unknown) => void) => {
        publish({
          type: 'status',
          status: 'degraded',
          message: 'Provider adapter failed to start',
        });
        return Promise.resolve();
      }),
    });
    const capture = createLiveCaptureServiceMock();
    const replay = createLiveReplayServiceMock();
    const service = new LiveService(
      config as never,
      provider as never,
      capture as never,
      replay as never,
    );

    await service.onModuleInit();
    const event = await firstValueFrom(service.stream());
    const data = event.data as {
      eventType: string;
      source: string;
      payload: { status: string; message: string };
    };

    expect(event.type).toBe('status');
    expect(data.eventType).toBe('status');
    expect(data.source).toBe('provider');
    expect(data.payload.status).toBe('degraded');
  });

  it('passes adapter diagnostics through the health payload', async () => {
    const config = createConfigMock({});
    const provider = createProviderAdapterMock();
    const capture = createLiveCaptureServiceMock();
    const replay = createLiveReplayServiceMock();
    const service = new LiveService(
      config as never,
      provider as never,
      capture as never,
      replay as never,
    );

    await service.onModuleInit();

    expect(service.getHealth()).toMatchObject({
      source: 'provider',
      details: {
        framesReceived: 42,
        feedMessagesReceived: 180,
        frameParseErrors: 1,
        capture: {
          enabled: false,
        },
      },
    });
  });

  it('persists provider topic freshness metadata with snapshots', async () => {
    const config = createConfigMock({});
    const providerState = createLiveState();
    const provider = createProviderAdapterMock({
      start: jest.fn((publish: (event: unknown) => void) => {
        publish({ type: 'initial_state', state: providerState });
        return Promise.resolve();
      }),
      getHealth: jest.fn(() => ({
        running: true,
        startedAt: '2026-03-03T00:00:00.000Z',
        lastEventAt: '2026-03-03T00:00:00.000Z',
        heartbeatMs: 15000,
        details: {
          topics: ['TimingData', 'LapCount', 'CarData.z'],
          topicMessageCount: {
            TimingData: 18,
            LapCount: 2,
            CarData: 0,
          },
          topicLastSeenAt: {
            TimingData: '2026-03-03T00:00:00.000Z',
            LapCount: '2026-03-03T00:00:00.000Z',
          },
        },
      })),
    });
    const capture = createLiveCaptureServiceMock();
    const replay = createLiveReplayServiceMock();
    const service = new LiveService(
      config as never,
      provider as never,
      capture as never,
      replay as never,
    );

    await service.onModuleInit();

    expect(capture.persistSnapshot).toHaveBeenCalledWith(
      'provider',
      expect.objectContaining({ generatedAt: providerState.generatedAt }),
      expect.any(Object),
      expect.any(Object),
      createTopicFreshnessState({
        topics: [
          {
            topic: 'CarData',
            lastSeenAt: null,
            messageCount: 0,
          },
          {
            topic: 'LapCount',
            lastSeenAt: '2026-03-03T00:00:00.000Z',
            messageCount: 2,
          },
          {
            topic: 'TimingData',
            lastSeenAt: '2026-03-03T00:00:00.000Z',
            messageCount: 18,
          },
        ],
      }),
      ['generatedAt', 'session', 'leaderboard', 'raceControl'],
    );
  });

  it('replays a recent persisted provider session before adapter updates', async () => {
    const config = createConfigMock({});
    const provider = createProviderAdapterMock({
      start: jest.fn(() => Promise.resolve()),
    });
    const restoredState = createLiveState();
    restoredState.session.sessionName = 'Restored Session';
    const capture = createLiveCaptureServiceMock({
      loadLatestSnapshotBundle: jest.fn(() => Promise.resolve(null)),
      getHealth: jest.fn(() => ({ enabled: true })),
    });
    const replayTopicFreshness = createTopicFreshnessState({
      capturedAt: '2026-03-03T00:00:05.000Z',
      topics: [
        {
          topic: 'SessionInfo',
          lastSeenAt: '2026-03-03T00:00:00.000Z',
          messageCount: 1,
        },
        {
          topic: 'TimingData',
          lastSeenAt: '2026-03-03T00:00:05.000Z',
          messageCount: 12,
        },
      ],
    });
    const replay = createLiveReplayServiceMock({
      replayLatestProviderSession: jest.fn(() =>
        Promise.resolve({
          sessionKey: 'provider:restored:session',
          eventCount: 12,
          firstEventAt: '2026-03-03T00:00:00.000Z',
          lastEventAt: '2026-03-03T00:00:05.000Z',
          state: restoredState,
          topicFreshness: replayTopicFreshness,
        }),
      ),
    });
    const service = new LiveService(
      config as never,
      provider as never,
      capture as never,
      replay as never,
    );

    await service.onModuleInit();

    expect(service.getState()).toMatchObject({
      session: {
        sessionName: 'Restored Session',
      },
    });
    expect(capture.seedProviderContext).toHaveBeenCalledWith({
      weekendId: restoredState.session.weekendId,
      sessionId: restoredState.session.sessionId,
      sessionName: restoredState.session.sessionName,
    });
    expect(capture.loadLatestSnapshotBundle).not.toHaveBeenCalled();
    expect(capture.persistSnapshot).toHaveBeenCalledWith(
      'provider',
      restoredState,
      expect.any(Object),
      expect.any(Object),
      replayTopicFreshness,
      ['generatedAt', 'session', 'leaderboard', 'raceControl'],
    );
  });

  it('falls back to the persisted snapshot when replay has no recent provider session', async () => {
    const config = createConfigMock({});
    const provider = createProviderAdapterMock({
      start: jest.fn(() => Promise.resolve()),
    });
    const restoredState = createLiveState();
    restoredState.session.sessionName = 'Snapshot Session';
    const restoredPublicState = createPublicState(restoredState);
    const restoredProjectionState = createProjectionState({
      mode: 'stabilized',
      lowConfidenceLeaderSuppressions: 12,
      lastLowConfidenceLeaderAt: restoredState.generatedAt,
      lastLowConfidenceLeaderCode: restoredState.leaderboard[0].driverCode,
      lastLowConfidenceLeaderSource:
        restoredState.leaderboard[0].positionSource,
      lastLowConfidenceLeaderConfidence:
        restoredState.leaderboard[0].positionConfidence,
      internalLeaderboardRows: restoredState.leaderboard.length,
      publicLeaderboardRows: restoredPublicState.leaderboard.length,
      internalLeaderCode: restoredState.leaderboard[0].driverCode,
      internalLeaderSource: restoredState.leaderboard[0].positionSource,
      internalLeaderConfidence: restoredState.leaderboard[0].positionConfidence,
      publicLeaderCode: restoredPublicState.leaderboard[0].driverCode,
    });
    const capture = createLiveCaptureServiceMock({
      loadLatestSnapshotBundle: jest.fn(() =>
        Promise.resolve({
          sessionKey: 'provider:snapshot:session',
          generatedAt: restoredState.generatedAt,
          version: 4,
          changedFields: ['leaderboard'],
          internalState: restoredState,
          publicState: restoredPublicState,
          projectionState: restoredProjectionState,
        }),
      ),
      getHealth: jest.fn(() => ({ enabled: true })),
    });
    const replay = createLiveReplayServiceMock();
    const service = new LiveService(
      config as never,
      provider as never,
      capture as never,
      replay as never,
    );

    await service.onModuleInit();

    expect(replay.replayLatestProviderSession).toHaveBeenCalledWith(21600);
    expect(capture.loadLatestSnapshotBundle).toHaveBeenCalledWith('provider');
    expect(service.getBoard()).toMatchObject({
      projection: {
        mode: 'stabilized',
        lowConfidenceLeaderSuppressions: 12,
      },
    });
    expect(capture.persistSnapshot).not.toHaveBeenCalled();
  });

  it('keeps the previous provider order when a later update would publish a low-confidence P1', async () => {
    const config = createConfigMock({});
    const trustedState = cloneLiveState();
    trustedState.session.sessionName = 'Australian Grand Prix - Qualifying';
    trustedState.leaderboard = [
      createLeaderboardEntry({
        position: 1,
        driverCode: '63',
        driverName: 'George Russell',
        teamName: 'Mercedes',
        gapToLeaderSec: 0,
        intervalToAheadSec: 0,
        positionSource: 'timing_data',
        positionUpdatedAt: '2026-03-07T05:00:00.000Z',
        positionConfidence: 'high',
      }),
      createLeaderboardEntry({
        position: 2,
        driverCode: '27',
        driverName: 'Nico Hulkenberg',
        teamName: 'Sauber',
        gapToLeaderSec: 0.481,
        intervalToAheadSec: 0.481,
        positionSource: 'timing_data',
        positionUpdatedAt: '2026-03-07T05:00:00.000Z',
        positionConfidence: 'high',
      }),
    ];

    const weakState = cloneLiveState();
    weakState.generatedAt = '2026-03-07T05:00:02.960Z';
    weakState.session = { ...trustedState.session };
    weakState.leaderboard = [
      createLeaderboardEntry({
        position: 1,
        driverCode: '27',
        driverName: 'Nico Hulkenberg',
        teamName: 'Sauber',
        gapToLeaderSec: 0,
        intervalToAheadSec: 0,
        positionSource: 'driver_code',
        positionUpdatedAt: null,
        positionConfidence: 'low',
      }),
      createLeaderboardEntry({
        position: 2,
        driverCode: '63',
        driverName: 'George Russell',
        teamName: 'Mercedes',
        gapToLeaderSec: 0,
        intervalToAheadSec: 0,
        positionSource: 'driver_code',
        positionUpdatedAt: null,
        positionConfidence: 'low',
      }),
    ];

    const provider = createProviderAdapterMock({
      start: jest.fn((publish: (event: unknown) => void) => {
        publish({ type: 'initial_state', state: trustedState });
        publish({
          type: 'delta_update',
          state: weakState,
          changedFields: ['leaderboard'],
        });
        return Promise.resolve();
      }),
    });
    const capture = createLiveCaptureServiceMock();
    const replay = createLiveReplayServiceMock();
    const service = new LiveService(
      config as never,
      provider as never,
      capture as never,
      replay as never,
    );

    await service.onModuleInit();

    expect(service.getState()?.leaderboard).toMatchObject([
      {
        position: 1,
        driverCode: '63',
        driverName: 'George Russell',
        gapToLeaderSec: null,
        intervalToAheadSec: null,
      },
      {
        position: 2,
        driverCode: '27',
        driverName: 'Nico Hulkenberg',
        gapToLeaderSec: null,
        intervalToAheadSec: null,
      },
    ]);
    expect(service.getBoard()).toMatchObject({
      projection: {
        mode: 'stabilized',
      },
      rows: [
        {
          position: 1,
          driverCode: '63',
          teamKey: 'mercedes',
          positionSource: 'driver_code',
          positionConfidence: 'low',
        },
        {
          position: 2,
          driverCode: '27',
          teamKey: 'sauber',
          positionSource: 'driver_code',
          positionConfidence: 'low',
        },
      ],
    });
  });

  it('withholds provider leaderboard rows when startup data only has a low-confidence driver-code leader', async () => {
    const config = createConfigMock({});
    const weakState = cloneLiveState();
    weakState.session.sessionName = 'Australian Grand Prix - Qualifying';
    weakState.leaderboard = [
      createLeaderboardEntry({
        position: 1,
        driverCode: '27',
        driverName: 'Nico Hulkenberg',
        teamName: 'Sauber',
        positionSource: 'driver_code',
        positionUpdatedAt: null,
        positionConfidence: 'low',
      }),
    ];

    const provider = createProviderAdapterMock({
      start: jest.fn((publish: (event: unknown) => void) => {
        publish({ type: 'initial_state', state: weakState });
        return Promise.resolve();
      }),
    });
    const capture = createLiveCaptureServiceMock();
    const replay = createLiveReplayServiceMock();
    const service = new LiveService(
      config as never,
      provider as never,
      capture as never,
      replay as never,
    );

    await service.onModuleInit();

    expect(service.getState()).toMatchObject({ leaderboard: [] });
    expect(service.getBoard()).toMatchObject({
      projection: {
        mode: 'withheld',
      },
      rows: [],
    });
  });

  it('withholds provider leaderboard rows when startup data only has a low-confidence best-lap leader', async () => {
    const config = createConfigMock({});
    const weakState = cloneLiveState();
    weakState.session.sessionName = 'Australian Grand Prix - Qualifying';
    weakState.leaderboard = [
      createLeaderboardEntry({
        position: 1,
        driverCode: '81',
        driverName: 'Oscar Piastri',
        teamName: 'McLaren',
        bestLapMs: 79500,
        positionSource: 'best_lap',
        positionUpdatedAt: '2026-03-07T05:00:02.960Z',
        positionConfidence: 'low',
      }),
    ];

    const provider = createProviderAdapterMock({
      start: jest.fn((publish: (event: unknown) => void) => {
        publish({ type: 'initial_state', state: weakState });
        return Promise.resolve();
      }),
    });
    const capture = createLiveCaptureServiceMock();
    const replay = createLiveReplayServiceMock();
    const service = new LiveService(
      config as never,
      provider as never,
      capture as never,
      replay as never,
    );

    await service.onModuleInit();

    expect(service.getState()).toMatchObject({ leaderboard: [] });
    expect(service.getBoard()).toMatchObject({
      projection: {
        mode: 'withheld',
      },
      rows: [],
    });
  });

  it('stops the provider adapter on module destroy', async () => {
    const config = createConfigMock({});
    const provider = createProviderAdapterMock();
    const capture = createLiveCaptureServiceMock();
    const replay = createLiveReplayServiceMock();
    const service = new LiveService(
      config as never,
      provider as never,
      capture as never,
      replay as never,
    );

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(provider.stop).toHaveBeenCalledTimes(1);
    expect(service.getHealth().status).toBe('stopped');
  });
});
