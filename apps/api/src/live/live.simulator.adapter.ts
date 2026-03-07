import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LiveAdapter, LivePublish } from './live.adapter';
import {
  LIVE_SIMULATOR_FIXTURE,
  LiveSimulatorFixtureEvent,
} from './live.simulator.fixture';
import {
  LiveAdapterHealth,
  LiveFeedSource,
  LiveFlagStatus,
  LiveLeaderboardEntry,
  LiveRaceControlMessage,
  LiveState,
} from './live.types';

interface DriverSeed {
  code: string;
  name: string;
  team: string;
}

interface SimulatorStepResult {
  state: LiveState;
  changedFields: string[];
}

interface AppendRaceControlOptions {
  id?: string;
  emittedAt?: string;
}

interface SimulatorSectorTimes {
  sector1Ms: number;
  sector2Ms: number;
  sector3Ms: number;
}

const SIMULATOR_DRIVERS: DriverSeed[] = [
  { code: 'VER', name: 'Max Verstappen', team: 'Red Bull Racing' },
  { code: 'NOR', name: 'Lando Norris', team: 'McLaren' },
  { code: 'LEC', name: 'Charles Leclerc', team: 'Ferrari' },
  { code: 'PIA', name: 'Oscar Piastri', team: 'McLaren' },
  { code: 'RUS', name: 'George Russell', team: 'Mercedes' },
  { code: 'HAM', name: 'Lewis Hamilton', team: 'Ferrari' },
  { code: 'SAI', name: 'Carlos Sainz', team: 'Williams' },
  { code: 'ALO', name: 'Fernando Alonso', team: 'Aston Martin' },
  { code: 'GAS', name: 'Pierre Gasly', team: 'Alpine' },
  { code: 'ALB', name: 'Alexander Albon', team: 'Williams' },
  { code: 'TSU', name: 'Yuki Tsunoda', team: 'RB' },
  { code: 'HUL', name: 'Nico Hulkenberg', team: 'Sauber' },
  { code: 'STR', name: 'Lance Stroll', team: 'Aston Martin' },
  { code: 'OCO', name: 'Esteban Ocon', team: 'Haas' },
  { code: 'BEA', name: 'Oliver Bearman', team: 'Haas' },
  { code: 'ANT', name: 'Andrea Kimi Antonelli', team: 'Mercedes' },
  { code: 'DOO', name: 'Jack Doohan', team: 'Alpine' },
  { code: 'BOR', name: 'Gabriel Bortoleto', team: 'Sauber' },
  { code: 'LAW', name: 'Liam Lawson', team: 'RB' },
  { code: 'HAD', name: 'Isack Hadjar', team: 'RB' },
];

const LAP_ADVANCE_INTERVAL = 5;
const MAX_RACE_CONTROL_MESSAGES = 25;
const MAX_SPEED_HISTORY_POINTS = 16;
const MAX_TRACK_STATUS_HISTORY_POINTS = 10;
const MIN_EFFECTIVE_TICK_MS = 100;

const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const roundMillis = (value: number): number => Math.round(value);

const roundSecs = (value: number): number => Number(value.toFixed(3));

export const createSeededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};

export const normalizeSpeedMultiplier = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  return clampNumber(value, 0.25, 8);
};

export const resolveSimulatorTickMs = (
  baseTickMs: number,
  speedMultiplier: number,
): number => {
  const multiplier = normalizeSpeedMultiplier(speedMultiplier);
  return Math.max(MIN_EFFECTIVE_TICK_MS, Math.round(baseTickMs / multiplier));
};

const rotateCompound = (
  current: NonNullable<LiveLeaderboardEntry['tireCompound']>,
): NonNullable<LiveLeaderboardEntry['tireCompound']> => {
  if (current === 'SOFT') {
    return 'MEDIUM';
  }

  if (current === 'MEDIUM') {
    return 'HARD';
  }

  return 'MEDIUM';
};

const splitLapIntoSectors = (
  lapMs: number,
  random: () => number = Math.random,
): SimulatorSectorTimes => {
  const s1 = roundMillis(lapMs * 0.327 + (random() - 0.5) * 260);
  const s2 = roundMillis(lapMs * 0.338 + (random() - 0.5) * 260);
  const s3 = lapMs - s1 - s2;

  return {
    sector1Ms: s1,
    sector2Ms: s2,
    sector3Ms: s3,
  };
};

const appendRaceControl = (
  raceControl: LiveRaceControlMessage[],
  category: LiveRaceControlMessage['category'],
  message: string,
  flag?: LiveFlagStatus,
  options?: AppendRaceControlOptions,
): LiveRaceControlMessage[] => {
  const next: LiveRaceControlMessage = {
    id:
      options?.id ?? `sim-${Date.now()}-${Math.round(Math.random() * 100000)}`,
    emittedAt: options?.emittedAt ?? new Date().toISOString(),
    category,
    message,
    flag,
  };

  return [next, ...raceControl].slice(0, MAX_RACE_CONTROL_MESSAGES);
};

const appendSpeedSample = (
  history: LiveLeaderboardEntry['speedHistoryKph'],
  kph: number,
  at: string,
): LiveLeaderboardEntry['speedHistoryKph'] => {
  const safeHistory = Array.isArray(history) ? history : [];
  const next = [...safeHistory, { at, kph }];
  return next.slice(-MAX_SPEED_HISTORY_POINTS);
};

const appendTrackStatusSample = (
  history: LiveLeaderboardEntry['trackStatusHistory'],
  status: string,
  at: string,
): LiveLeaderboardEntry['trackStatusHistory'] => {
  const safeHistory = Array.isArray(history) ? history : [];
  const last = safeHistory.at(-1);
  if (last?.status === status) {
    return safeHistory;
  }

  const next = [...safeHistory, { at, status }];
  return next.slice(-MAX_TRACK_STATUS_HISTORY_POINTS);
};

export const createSimulatorInitialState = (now = new Date()): LiveState => {
  const nowIso = now.toISOString();

  return {
    generatedAt: nowIso,
    session: {
      weekendId: 'sim-2026-round-1',
      sessionId: 'sim-2026-round-1-race',
      sessionName: 'Bahrain Grand Prix Race (Simulator)',
      phase: 'running',
      flag: 'green',
      currentLap: 1,
      totalLaps: 57,
      clockIso: nowIso,
    },
    leaderboard: SIMULATOR_DRIVERS.map((driver, index) => {
      const interval = index === 0 ? 0 : roundSecs(0.95 + index * 0.08);
      const gap =
        index === 0
          ? 0
          : roundSecs(1.2 + index * 1.22 + (index % 3 === 0 ? 0.25 : 0));
      const speedKph = 311 - index * 2;
      const lastLapMs = 92000 + index * 175;
      const sectors = splitLapIntoSectors(
        lastLapMs,
        () => ((index % 6) + 1) / 8,
      );

      return {
        position: index + 1,
        driverCode: driver.code,
        driverName: driver.name,
        teamName: driver.team,
        trackStatus: 'on_track',
        speedKph,
        topSpeedKph: 321 - index,
        gapToLeaderSec: gap,
        intervalToAheadSec: interval,
        ...sectors,
        bestSector1Ms: sectors.sector1Ms,
        bestSector2Ms: sectors.sector2Ms,
        bestSector3Ms: sectors.sector3Ms,
        lastLapMs,
        bestLapMs: lastLapMs,
        speedHistoryKph: [{ at: nowIso, kph: speedKph }],
        trackStatusHistory: [{ at: nowIso, status: 'on_track' }],
        tireCompound: index < 7 ? 'SOFT' : index < 14 ? 'MEDIUM' : 'HARD',
        stintLap: 1 + (index % 8),
        positionSource: 'simulator',
        positionUpdatedAt: nowIso,
        positionConfidence: 'high',
      };
    }),
    raceControl: [],
  };
};

export const evolveSimulatorState = (
  previous: LiveState,
  tick: number,
  random: () => number = Math.random,
  now = new Date(),
  fixture: LiveSimulatorFixtureEvent[] = LIVE_SIMULATOR_FIXTURE,
): SimulatorStepResult => {
  const nowIso = now.toISOString();
  const currentLap = previous.session.currentLap ?? 0;
  const totalLaps = previous.session.totalLaps ?? 0;
  const lapAdvanced =
    tick % LAP_ADVANCE_INTERVAL === 0 && currentLap < totalLaps;

  const changedFields = new Set<string>(['leaderboard', 'generatedAt']);

  const nextLeaderboard: LiveLeaderboardEntry[] = [];
  let cumulativeGap = 0;

  for (let index = 0; index < previous.leaderboard.length; index += 1) {
    const current = previous.leaderboard[index];
    const currentLastLap = current.lastLapMs ?? 92000;
    const currentBestLap = current.bestLapMs ?? currentLastLap;
    const currentTopSpeed = current.topSpeedKph ?? 0;
    const noise = roundMillis((random() - 0.5) * 520);
    const paceBias = index * 14;
    const nextLastLap = clampNumber(
      currentLastLap + noise + paceBias,
      86000,
      111000,
    );
    const nextSpeed = clampNumber(
      (current.speedKph ?? 285) + Math.round((random() - 0.5) * 12),
      190,
      335,
    );
    const nextTopSpeed = Math.max(currentTopSpeed, nextSpeed);

    const nextBestLap = Math.min(currentBestLap, nextLastLap);
    const sectors = splitLapIntoSectors(nextLastLap, random);
    const nextBestSector1Ms = Math.min(
      current.bestSector1Ms ?? current.sector1Ms ?? sectors.sector1Ms,
      sectors.sector1Ms,
    );
    const nextBestSector2Ms = Math.min(
      current.bestSector2Ms ?? current.sector2Ms ?? sectors.sector2Ms,
      sectors.sector2Ms,
    );
    const nextBestSector3Ms = Math.min(
      current.bestSector3Ms ?? current.sector3Ms ?? sectors.sector3Ms,
      sectors.sector3Ms,
    );

    let nextStintLap = current.stintLap ?? 1;
    let nextCompoundValue = current.tireCompound ?? 'MEDIUM';
    let pittedThisTick = false;

    if (lapAdvanced) {
      nextStintLap += 1;
    }

    if (lapAdvanced && nextStintLap > 22 && random() > 0.88) {
      nextStintLap = 1;
      nextCompoundValue = rotateCompound(current.tireCompound ?? 'MEDIUM');
      pittedThisTick = true;
    }

    const nextTrackStatus = pittedThisTick ? 'pit_lane' : 'on_track';
    const speedHistoryKph = appendSpeedSample(
      current.speedHistoryKph,
      nextSpeed,
      nowIso,
    );
    const trackStatusHistory = appendTrackStatusSample(
      current.trackStatusHistory,
      nextTrackStatus,
      nowIso,
    );

    if (index === 0) {
      nextLeaderboard.push({
        ...current,
        ...sectors,
        lastLapMs: nextLastLap,
        bestLapMs: nextBestLap,
        bestSector1Ms: nextBestSector1Ms,
        bestSector2Ms: nextBestSector2Ms,
        bestSector3Ms: nextBestSector3Ms,
        speedKph: nextSpeed,
        topSpeedKph: nextTopSpeed,
        trackStatus: nextTrackStatus,
        gapToLeaderSec: 0,
        intervalToAheadSec: 0,
        speedHistoryKph,
        trackStatusHistory,
        stintLap: nextStintLap,
        tireCompound: nextCompoundValue,
      });
      continue;
    }

    const intervalNoise = (random() - 0.5) * 0.2;
    const baselineInterval = 0.9 + index * 0.05;
    const interval = clampNumber(baselineInterval + intervalNoise, 0.28, 4.8);
    cumulativeGap = roundSecs(cumulativeGap + interval);

    nextLeaderboard.push({
      ...current,
      ...sectors,
      lastLapMs: nextLastLap,
      bestLapMs: nextBestLap,
      bestSector1Ms: nextBestSector1Ms,
      bestSector2Ms: nextBestSector2Ms,
      bestSector3Ms: nextBestSector3Ms,
      speedKph: nextSpeed,
      topSpeedKph: nextTopSpeed,
      trackStatus: nextTrackStatus,
      gapToLeaderSec: cumulativeGap,
      intervalToAheadSec: roundSecs(interval),
      speedHistoryKph,
      trackStatusHistory,
      stintLap: nextStintLap,
      tireCompound: nextCompoundValue,
    });
  }

  let nextFlag = previous.session.flag;
  let nextRaceControl = previous.raceControl;

  const fixtureEvents = fixture.filter((event) => event.tick === tick);
  for (const event of fixtureEvents) {
    nextRaceControl = appendRaceControl(
      nextRaceControl,
      event.category,
      event.message,
      event.flag,
      {
        id: event.id,
        emittedAt: now.toISOString(),
      },
    );
    changedFields.add('raceControl');

    if (event.setFlag) {
      nextFlag = event.setFlag;
      changedFields.add('session.flag');
    }
  }

  const nextLap = lapAdvanced ? currentLap + 1 : currentLap;
  const isFinished = totalLaps > 0 && nextLap >= totalLaps;

  if (lapAdvanced) {
    changedFields.add('session.currentLap');
  }

  if (isFinished && previous.session.phase !== 'finished') {
    nextFlag = 'checkered';
    changedFields.add('session.flag');
    changedFields.add('session.phase');
    changedFields.add('raceControl');
    nextRaceControl = appendRaceControl(
      nextRaceControl,
      'control',
      'Chequered flag. Session finished.',
      'checkered',
      {
        id: `rc-checkered-${nextLap}`,
        emittedAt: now.toISOString(),
      },
    );
  }

  const nextState: LiveState = {
    generatedAt: nowIso,
    session: {
      ...previous.session,
      phase: isFinished ? 'finished' : 'running',
      flag: nextFlag,
      currentLap: nextLap,
      totalLaps,
      clockIso: nowIso,
    },
    leaderboard: nextLeaderboard.map((entry, index) => ({
      ...entry,
      position: index + 1,
      positionSource: 'simulator',
      positionUpdatedAt: nowIso,
      positionConfidence: 'high',
    })),
    raceControl: nextRaceControl,
  };

  return {
    state: nextState,
    changedFields: [...changedFields],
  };
};

@Injectable()
export class LiveSimulatorAdapter implements LiveAdapter {
  readonly source: LiveFeedSource = 'simulator';

  private readonly baseTickMs: number;
  private readonly tickMs: number;
  private readonly speedMultiplier: number;
  private readonly heartbeatMs: number;
  private readonly seed: number;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private lastEventAt: string | null = null;
  private startedAt: string | null = null;
  private state: LiveState = createSimulatorInitialState();
  private random: () => number;
  private running = false;

  constructor(private readonly configService: ConfigService) {
    this.baseTickMs = this.configService.get<number>(
      'LIVE_SIMULATOR_TICK_MS',
      2000,
    );
    this.speedMultiplier = normalizeSpeedMultiplier(
      this.configService.get<number>('LIVE_SIMULATOR_SPEED_MULTIPLIER', 1),
    );
    this.tickMs = resolveSimulatorTickMs(this.baseTickMs, this.speedMultiplier);
    this.heartbeatMs = this.configService.get<number>(
      'LIVE_HEARTBEAT_MS',
      15000,
    );
    this.seed = this.configService.get<number>('LIVE_SIMULATOR_SEED', 2026);
    this.random = createSeededRandom(this.seed);
  }

  start(publish: LivePublish): Promise<void> {
    if (this.running) {
      return Promise.resolve();
    }

    this.running = true;
    this.tickCount = 0;
    this.startedAt = new Date().toISOString();
    this.state = createSimulatorInitialState();
    this.random = createSeededRandom(this.seed);

    publish({
      type: 'status',
      status: 'connecting',
      message: 'Starting simulator live source',
    });
    publish({ type: 'initial_state', state: this.state });
    publish({
      type: 'status',
      status: 'live',
      message: 'Simulator source is active',
    });
    this.lastEventAt = new Date().toISOString();

    this.tickTimer = setInterval(() => {
      this.tickCount += 1;
      const step = evolveSimulatorState(
        this.state,
        this.tickCount,
        this.random,
      );
      this.state = step.state;
      this.lastEventAt = new Date().toISOString();

      publish({
        type: 'delta_update',
        state: this.state,
        changedFields: step.changedFields,
      });
    }, this.tickMs);

    this.heartbeatTimer = setInterval(() => {
      const now = new Date().toISOString();
      this.lastEventAt = now;
      publish({ type: 'heartbeat', at: now });
    }, this.heartbeatMs);

    return Promise.resolve();
  }

  stop(): Promise<void> {
    if (!this.running) {
      return Promise.resolve();
    }

    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.running = false;

    return Promise.resolve();
  }

  getHealth(): LiveAdapterHealth {
    return {
      running: this.running,
      startedAt: this.startedAt,
      lastEventAt: this.lastEventAt,
      tickMs: this.tickMs,
      heartbeatMs: this.heartbeatMs,
      seed: this.seed,
      speedMultiplier: this.speedMultiplier,
    };
  }
}
