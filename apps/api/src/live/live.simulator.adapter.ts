import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LiveAdapter, LivePublish } from './live.adapter';
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

const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const roundMillis = (value: number): number => Math.round(value);

const roundSecs = (value: number): number => Number(value.toFixed(3));

const rotateCompound = (
  current: LiveLeaderboardEntry['tireCompound'],
): LiveLeaderboardEntry['tireCompound'] => {
  if (current === 'SOFT') {
    return 'MEDIUM';
  }

  if (current === 'MEDIUM') {
    return 'HARD';
  }

  return 'MEDIUM';
};

const appendRaceControl = (
  raceControl: LiveRaceControlMessage[],
  category: LiveRaceControlMessage['category'],
  message: string,
  flag?: LiveFlagStatus,
): LiveRaceControlMessage[] => {
  const next: LiveRaceControlMessage = {
    id: `sim-${Date.now()}-${Math.round(Math.random() * 100000)}`,
    emittedAt: new Date().toISOString(),
    category,
    message,
    flag,
  };

  return [next, ...raceControl].slice(0, MAX_RACE_CONTROL_MESSAGES);
};

export const createSimulatorInitialState = (now = new Date()): LiveState => ({
  generatedAt: now.toISOString(),
  session: {
    weekendId: 'sim-2026-round-1',
    sessionId: 'sim-2026-round-1-race',
    sessionName: 'Bahrain Grand Prix Race (Simulator)',
    phase: 'running',
    flag: 'green',
    currentLap: 1,
    totalLaps: 57,
    clockIso: now.toISOString(),
  },
  leaderboard: SIMULATOR_DRIVERS.map((driver, index) => {
    const interval = index === 0 ? 0 : roundSecs(0.95 + index * 0.08);
    const gap =
      index === 0
        ? 0
        : roundSecs(1.2 + index * 1.22 + (index % 3 === 0 ? 0.25 : 0));

    return {
      position: index + 1,
      driverCode: driver.code,
      driverName: driver.name,
      teamName: driver.team,
      gapToLeaderSec: gap,
      intervalToAheadSec: interval,
      lastLapMs: 92000 + index * 175,
      bestLapMs: 92000 + index * 175,
      tireCompound: index < 7 ? 'SOFT' : index < 14 ? 'MEDIUM' : 'HARD',
      stintLap: 1 + (index % 8),
    };
  }),
  raceControl: [],
});

export const evolveSimulatorState = (
  previous: LiveState,
  tick: number,
  random: () => number = Math.random,
  now = new Date(),
): SimulatorStepResult => {
  const lapAdvanced =
    tick % LAP_ADVANCE_INTERVAL === 0 &&
    previous.session.currentLap < previous.session.totalLaps;

  const changedFields = new Set<string>(['leaderboard', 'generatedAt']);

  const nextLeaderboard: LiveLeaderboardEntry[] = [];
  let cumulativeGap = 0;

  for (let index = 0; index < previous.leaderboard.length; index += 1) {
    const current = previous.leaderboard[index];
    const noise = roundMillis((random() - 0.5) * 520);
    const paceBias = index * 14;
    const nextLastLap = clampNumber(
      current.lastLapMs + noise + paceBias,
      86000,
      111000,
    );

    const nextBestLap = Math.min(current.bestLapMs, nextLastLap);

    let nextStintLap = current.stintLap;
    let nextCompoundValue = current.tireCompound;

    if (lapAdvanced) {
      nextStintLap += 1;
    }

    if (lapAdvanced && nextStintLap > 22 && random() > 0.88) {
      nextStintLap = 1;
      nextCompoundValue = rotateCompound(current.tireCompound);
    }

    if (index === 0) {
      nextLeaderboard.push({
        ...current,
        lastLapMs: nextLastLap,
        bestLapMs: nextBestLap,
        gapToLeaderSec: 0,
        intervalToAheadSec: 0,
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
      lastLapMs: nextLastLap,
      bestLapMs: nextBestLap,
      gapToLeaderSec: cumulativeGap,
      intervalToAheadSec: roundSecs(interval),
      stintLap: nextStintLap,
      tireCompound: nextCompoundValue,
    });
  }

  let nextFlag = previous.session.flag;
  let nextRaceControl = previous.raceControl;

  const controlRoll = random();
  if (controlRoll < 0.025) {
    nextFlag = 'yellow';
    nextRaceControl = appendRaceControl(
      nextRaceControl,
      'flag',
      'Yellow flag in sector 2. Reduce speed and no overtaking.',
      'yellow',
    );
    changedFields.add('session.flag');
    changedFields.add('raceControl');
  } else if (controlRoll > 0.992) {
    nextFlag = 'green';
    nextRaceControl = appendRaceControl(
      nextRaceControl,
      'flag',
      'Track clear. Green flag.',
      'green',
    );
    changedFields.add('session.flag');
    changedFields.add('raceControl');
  }

  const nextLap = lapAdvanced
    ? previous.session.currentLap + 1
    : previous.session.currentLap;
  const isFinished = nextLap >= previous.session.totalLaps;

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
    );
  }

  const nextState: LiveState = {
    generatedAt: now.toISOString(),
    session: {
      ...previous.session,
      phase: isFinished ? 'finished' : 'running',
      flag: nextFlag,
      currentLap: nextLap,
      clockIso: now.toISOString(),
    },
    leaderboard: nextLeaderboard.map((entry, index) => ({
      ...entry,
      position: index + 1,
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

  private readonly tickMs: number;
  private readonly heartbeatMs: number;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private lastEventAt: string | null = null;
  private startedAt: string | null = null;
  private state: LiveState = createSimulatorInitialState();
  private running = false;

  constructor(private readonly configService: ConfigService) {
    this.tickMs = this.configService.get<number>(
      'LIVE_SIMULATOR_TICK_MS',
      2000,
    );
    this.heartbeatMs = this.configService.get<number>(
      'LIVE_HEARTBEAT_MS',
      15000,
    );
  }

  start(publish: LivePublish): Promise<void> {
    if (this.running) {
      return Promise.resolve();
    }

    this.running = true;
    this.tickCount = 0;
    this.startedAt = new Date().toISOString();
    this.state = createSimulatorInitialState();

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
      const step = evolveSimulatorState(this.state, this.tickCount);
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
    };
  }
}
