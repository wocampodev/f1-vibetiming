import { LiveService } from './live.service';
import { LiveState } from './live.types';

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
        gapToLeaderSec: 0,
        intervalToAheadSec: 0,
        lastLapMs: 91000,
        bestLapMs: 90800,
        tireCompound: 'SOFT',
        stintLap: 5,
      },
    ],
    raceControl: [],
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
    })),
  };
}

function createProviderAdapterMock() {
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
    })),
  };
}

describe('LiveService', () => {
  it('starts simulator source and exposes current state', async () => {
    const config = createConfigMock({
      LIVE_SOURCE: 'simulator',
      LIVE_PROVIDER_LEGAL_APPROVED: false,
    });
    const simulator = createSimulatorAdapterMock();
    const provider = createProviderAdapterMock();
    const service = new LiveService(
      config as never,
      simulator as never,
      provider as never,
    );

    await service.onModuleInit();

    expect(simulator.start).toHaveBeenCalledTimes(1);
    expect(service.getState()).not.toBeNull();
    expect(service.getHealth()).toMatchObject({
      source: 'simulator',
      legalGateActive: false,
      legalGateMessage: null,
    });
  });

  it('keeps provider source behind legal gate and falls back to simulator', async () => {
    const config = createConfigMock({
      LIVE_SOURCE: 'provider',
      LIVE_PROVIDER_LEGAL_APPROVED: false,
    });
    const simulator = createSimulatorAdapterMock();
    const provider = createProviderAdapterMock();
    const service = new LiveService(
      config as never,
      simulator as never,
      provider as never,
    );

    await service.onModuleInit();

    expect(simulator.start).toHaveBeenCalledTimes(1);
    expect(service.getHealth()).toMatchObject({
      source: 'simulator',
      legalGateActive: true,
    });
    expect(service.getHealth().legalGateMessage).toContain('legal/compliance');
  });

  it('uses provider adapter when legal gate is approved', async () => {
    const config = createConfigMock({
      LIVE_SOURCE: 'provider',
      LIVE_PROVIDER_LEGAL_APPROVED: true,
    });
    const simulator = createSimulatorAdapterMock();
    const provider = createProviderAdapterMock();
    const service = new LiveService(
      config as never,
      simulator as never,
      provider as never,
    );

    await service.onModuleInit();

    expect(simulator.start).not.toHaveBeenCalled();
    expect(provider.start).toHaveBeenCalledTimes(1);
    expect(service.getHealth()).toMatchObject({
      source: 'provider',
      legalGateActive: false,
      legalGateMessage: null,
      status: 'degraded',
    });
  });

  it('stops adapter on module destroy', async () => {
    const config = createConfigMock({ LIVE_SOURCE: 'simulator' });
    const simulator = createSimulatorAdapterMock();
    const provider = createProviderAdapterMock();
    const service = new LiveService(
      config as never,
      simulator as never,
      provider as never,
    );

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(simulator.stop).toHaveBeenCalledTimes(1);
    expect(service.getHealth().status).toBe('stopped');
  });
});
