import { LiveService } from './live.service';
import { LivePublicState, LiveState } from './live.types';
import { firstValueFrom } from 'rxjs';

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
      weekendId: 'sim-weekend',
      sessionId: 'sim-session',
      sessionName: 'Simulator Race',
      phase: 'running',
      flag: 'green',
      currentLap: 5,
      totalLaps: 57,
      clockIso: '2026-03-03T00:00:00.000Z',
    },
    leaderboard: [
      {
        position: 1,
        driverCode: 'VER',
        driverName: 'Max Verstappen',
        teamName: 'Red Bull Racing',
        trackStatus: 'on_track',
        speedKph: 311,
        topSpeedKph: 322,
        gapToLeaderSec: 0,
        intervalToAheadSec: 0,
        sector1Ms: 29810,
        sector2Ms: 30760,
        sector3Ms: 30430,
        bestSector1Ms: 29790,
        bestSector2Ms: 30680,
        bestSector3Ms: 30330,
        lastLapMs: 91000,
        bestLapMs: 90800,
        speedHistoryKph: [{ at: '2026-03-03T00:00:00.000Z', kph: 311 }],
        trackStatusHistory: [
          { at: '2026-03-03T00:00:00.000Z', status: 'on_track' },
        ],
        tireCompound: 'SOFT',
        stintLap: 5,
        positionSource: 'simulator',
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

function createLeaderboardEntry(
  overrides?: Partial<LiveState['leaderboard'][number]>,
): LiveState['leaderboard'][number] {
  return {
    ...createLiveState().leaderboard[0],
    ...overrides,
  };
}

function createSimulatorAdapterMock() {
  const state = createLiveState();

  return {
    source: 'simulator' as const,
    start: jest.fn((publish: (event: unknown) => void) => {
      publish({
        type: 'status',
        status: 'connecting',
        message: 'Starting simulator live source',
      });
      publish({ type: 'initial_state', state });
      publish({
        type: 'status',
        status: 'live',
        message: 'Simulator source is active',
      });
      return Promise.resolve();
    }),
    stop: jest.fn(() => Promise.resolve()),
    getHealth: jest.fn(() => ({
      running: true,
      startedAt: '2026-03-03T00:00:00.000Z',
      lastEventAt: '2026-03-03T00:00:02.000Z',
      tickMs: 2000,
      heartbeatMs: 15000,
      seed: 2026,
      speedMultiplier: 1,
    })),
  };
}

function createProviderAdapterMock(overrides?: Record<string, unknown>) {
  return {
    source: 'provider' as const,
    start: jest.fn((publish: (event: unknown) => void) => {
      publish({
        type: 'status',
        status: 'degraded',
        message: 'Provider adapter is not implemented in this build',
      });
      return Promise.resolve();
    }),
    stop: jest.fn(() => Promise.resolve()),
    getHealth: jest.fn(() => ({
      running: true,
      startedAt: '2026-03-03T00:00:00.000Z',
      lastEventAt: '2026-03-03T00:00:00.000Z',
      tickMs: 0,
      heartbeatMs: 0,
      seed: null,
      speedMultiplier: null,
      details: {
        framesReceived: 42,
        feedMessagesReceived: 180,
        frameParseErrors: 1,
      },
    })),
    ...overrides,
  };
}

function createLiveCaptureServiceMock(overrides?: Record<string, unknown>) {
  return {
    loadLatestSnapshot: jest.fn(() => Promise.resolve(null)),
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
  it('starts simulator source and exposes current state', async () => {
    const config = createConfigMock({ LIVE_SOURCE: 'simulator' });
    const simulator = createSimulatorAdapterMock();
    const provider = createProviderAdapterMock();
    const capture = createLiveCaptureServiceMock();
    const replay = createLiveReplayServiceMock();
    const service = new LiveService(
      config as never,
      simulator as never,
      provider as never,
      capture as never,
      replay as never,
    );

    await service.onModuleInit();

    expect(simulator.start).toHaveBeenCalledTimes(1);
    const state = service.getState();
    expect(state).not.toBeNull();
    expect(state?.leaderboard[0]).not.toHaveProperty('trackStatus');
    expect(state?.leaderboard[0]).not.toHaveProperty('speedKph');
    expect(state?.leaderboard[0]).not.toHaveProperty('topSpeedKph');
    expect(state?.leaderboard[0]).not.toHaveProperty('tireCompound');
    expect(state?.leaderboard[0]).not.toHaveProperty('stintLap');
    expect(state?.leaderboard[0]).not.toHaveProperty('positionSource');
    expect(state?.leaderboard[0]).not.toHaveProperty('positionUpdatedAt');
    expect(state?.leaderboard[0]).not.toHaveProperty('positionConfidence');
    expect(state?.leaderboard[0]).toMatchObject({
      bestSector1Ms: 29790,
      bestSector2Ms: 30680,
      bestSector3Ms: 30330,
    });
    expect(service.getHealth()).toMatchObject({
      source: 'simulator',
    });
  });

  it('uses provider adapter when provider source is configured', async () => {
    const config = createConfigMock({ LIVE_SOURCE: 'provider' });
    const simulator = createSimulatorAdapterMock();
    const provider = createProviderAdapterMock();
    const capture = createLiveCaptureServiceMock();
    const replay = createLiveReplayServiceMock();
    const service = new LiveService(
      config as never,
      simulator as never,
      provider as never,
      capture as never,
      replay as never,
    );

    await service.onModuleInit();

    expect(simulator.start).not.toHaveBeenCalled();
    expect(provider.start).toHaveBeenCalledTimes(1);
    expect(service.getHealth()).toMatchObject({
      source: 'provider',
      status: 'degraded',
    });
  });

  it('streams an initial_state envelope when state is available', async () => {
    const config = createConfigMock({ LIVE_SOURCE: 'simulator' });
    const simulator = createSimulatorAdapterMock();
    const provider = createProviderAdapterMock();
    const capture = createLiveCaptureServiceMock();
    const replay = createLiveReplayServiceMock();
    const service = new LiveService(
      config as never,
      simulator as never,
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
    expect(data.source).toBe('simulator');
    expect(data.payload.session.sessionName).toContain('Simulator');
    expect(data.payload.leaderboard[0]).not.toHaveProperty('trackStatus');
    expect(data.payload.leaderboard[0]).not.toHaveProperty('speedKph');
    expect(data.payload.leaderboard[0]).not.toHaveProperty('topSpeedKph');
    expect(data.payload.leaderboard[0]).not.toHaveProperty('tireCompound');
    expect(data.payload.leaderboard[0]).not.toHaveProperty('stintLap');
    expect(data.payload.leaderboard[0]).not.toHaveProperty('positionSource');
    expect(data.payload.leaderboard[0]).not.toHaveProperty('positionUpdatedAt');
    expect(data.payload.leaderboard[0]).not.toHaveProperty(
      'positionConfidence',
    );
    expect(data.payload.leaderboard[0]).toMatchObject({
      bestSector1Ms: 29790,
      bestSector2Ms: 30680,
      bestSector3Ms: 30330,
    });
  });

  it('streams status envelope when provider is degraded without state', async () => {
    const config = createConfigMock({ LIVE_SOURCE: 'provider' });
    const simulator = createSimulatorAdapterMock();
    const provider = createProviderAdapterMock();
    const capture = createLiveCaptureServiceMock();
    const replay = createLiveReplayServiceMock();
    const service = new LiveService(
      config as never,
      simulator as never,
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
    const config = createConfigMock({ LIVE_SOURCE: 'provider' });
    const simulator = createSimulatorAdapterMock();
    const provider = createProviderAdapterMock();
    const capture = createLiveCaptureServiceMock();
    const replay = createLiveReplayServiceMock();
    const service = new LiveService(
      config as never,
      simulator as never,
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

  it('replays a recent persisted provider session before adapter updates', async () => {
    const config = createConfigMock({ LIVE_SOURCE: 'provider' });
    const simulator = createSimulatorAdapterMock();
    const provider = createProviderAdapterMock();
    const restoredState = createLiveState();
    restoredState.session.sessionName = 'Restored Session';
    const capture = createLiveCaptureServiceMock({
      loadLatestSnapshot: jest.fn(() => Promise.resolve(null)),
      getHealth: jest.fn(() => ({ enabled: true })),
    });
    const replay = createLiveReplayServiceMock({
      replayLatestProviderSession: jest.fn(() =>
        Promise.resolve({
          sessionKey: 'provider:restored:session',
          eventCount: 12,
          firstEventAt: '2026-03-03T00:00:00.000Z',
          lastEventAt: '2026-03-03T00:00:05.000Z',
          state: restoredState,
        }),
      ),
    });
    const service = new LiveService(
      config as never,
      simulator as never,
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
    expect(capture.loadLatestSnapshot).not.toHaveBeenCalled();
  });

  it('falls back to the persisted snapshot when replay has no recent provider session', async () => {
    const config = createConfigMock({ LIVE_SOURCE: 'provider' });
    const simulator = createSimulatorAdapterMock();
    const provider = createProviderAdapterMock();
    const restoredState = createLiveState();
    restoredState.session.sessionName = 'Snapshot Session';
    const capture = createLiveCaptureServiceMock({
      loadLatestSnapshot: jest.fn(() => Promise.resolve(restoredState)),
      getHealth: jest.fn(() => ({ enabled: true })),
    });
    const replay = createLiveReplayServiceMock();
    const service = new LiveService(
      config as never,
      simulator as never,
      provider as never,
      capture as never,
      replay as never,
    );

    await service.onModuleInit();

    expect(replay.replayLatestProviderSession).toHaveBeenCalledWith(21600);
    expect(capture.loadLatestSnapshot).toHaveBeenCalledWith('provider');
    expect(service.getState()).toMatchObject({
      session: {
        sessionName: 'Snapshot Session',
      },
    });
  });

  it('keeps the previous provider order when a later update would publish a low-confidence P1', async () => {
    const config = createConfigMock({ LIVE_SOURCE: 'provider' });
    const simulator = createSimulatorAdapterMock();
    const trustedState = cloneLiveState();
    trustedState.session.weekendId = 'provider-weekend';
    trustedState.session.sessionId = 'provider-session';
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
      simulator as never,
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
  });

  it('withholds provider leaderboard rows when startup data only has a driver-code leader', async () => {
    const config = createConfigMock({ LIVE_SOURCE: 'provider' });
    const simulator = createSimulatorAdapterMock();
    const weakState = cloneLiveState();
    weakState.session.weekendId = 'provider-weekend';
    weakState.session.sessionId = 'provider-session';
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
      simulator as never,
      provider as never,
      capture as never,
      replay as never,
    );

    await service.onModuleInit();

    expect(service.getState()).toMatchObject({
      leaderboard: [],
    });
  });

  it('stops adapter on module destroy', async () => {
    const config = createConfigMock({ LIVE_SOURCE: 'simulator' });
    const simulator = createSimulatorAdapterMock();
    const provider = createProviderAdapterMock();
    const capture = createLiveCaptureServiceMock();
    const replay = createLiveReplayServiceMock();
    const service = new LiveService(
      config as never,
      simulator as never,
      provider as never,
      capture as never,
      replay as never,
    );

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(simulator.stop).toHaveBeenCalledTimes(1);
    expect(service.getHealth().status).toBe('stopped');
  });
});
