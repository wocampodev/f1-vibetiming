import {
  createSimulatorInitialState,
  evolveSimulatorState,
} from './live.simulator.adapter';

describe('LiveSimulatorAdapter helpers', () => {
  it('creates a full initial state snapshot', () => {
    const state = createSimulatorInitialState(
      new Date('2026-01-01T00:00:00.000Z'),
    );

    expect(state.session.currentLap).toBe(1);
    expect(state.session.totalLaps).toBeGreaterThan(1);
    expect(state.leaderboard).toHaveLength(20);
    expect(state.leaderboard[0]?.position).toBe(1);
    expect(state.leaderboard[0]?.gapToLeaderSec).toBe(0);
  });

  it('advances live timing data without changing lap on non-lap ticks', () => {
    const initial = createSimulatorInitialState(
      new Date('2026-01-01T00:00:00.000Z'),
    );

    const next = evolveSimulatorState(
      initial,
      1,
      () => 0.5,
      new Date('2026-01-01T00:00:02.000Z'),
    );

    expect(next.state.session.currentLap).toBe(initial.session.currentLap);
    expect(next.changedFields).toContain('leaderboard');
    expect(next.state.leaderboard).toHaveLength(initial.leaderboard.length);
  });

  it('advances lap counter on lap-advance ticks', () => {
    const initial = createSimulatorInitialState(
      new Date('2026-01-01T00:00:00.000Z'),
    );

    const next = evolveSimulatorState(
      initial,
      5,
      () => 0.5,
      new Date('2026-01-01T00:00:10.000Z'),
    );

    expect(next.state.session.currentLap).toBe(initial.session.currentLap + 1);
    expect(next.changedFields).toContain('session.currentLap');
  });

  it('marks session finished when total laps are reached', () => {
    const initial = createSimulatorInitialState(
      new Date('2026-01-01T00:00:00.000Z'),
    );
    const nearFinish = {
      ...initial,
      session: {
        ...initial.session,
        currentLap: initial.session.totalLaps - 1,
      },
    };

    const next = evolveSimulatorState(
      nearFinish,
      5,
      () => 0.5,
      new Date('2026-01-01T01:35:00.000Z'),
    );

    expect(next.state.session.phase).toBe('finished');
    expect(next.state.session.flag).toBe('checkered');
    expect(next.changedFields).toContain('session.phase');
  });
});
