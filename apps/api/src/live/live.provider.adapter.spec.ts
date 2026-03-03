import { deflateRawSync } from 'node:zlib';
import {
  decodeTopicPayload,
  ProviderStateAccumulator,
} from './live.provider.adapter';

describe('decodeTopicPayload', () => {
  it('parses plain JSON payload when topic is not compressed', () => {
    const decoded = decodeTopicPayload('SessionInfo', '{"Name":"Race"}');

    expect(decoded.topic).toBe('SessionInfo');
    expect(decoded.payload).toEqual({ Name: 'Race' });
  });

  it('decodes compressed .z payload and strips suffix', () => {
    const encoded = deflateRawSync(
      Buffer.from(JSON.stringify({ Status: 'Started' }), 'utf-8'),
    ).toString('base64');

    const decoded = decodeTopicPayload('SessionStatus.z', encoded);

    expect(decoded.topic).toBe('SessionStatus');
    expect(decoded.payload).toEqual({ Status: 'Started' });
  });
});

describe('ProviderStateAccumulator', () => {
  it('builds a normalized live state from key SignalR topics', () => {
    const emittedAt = '2026-03-03T00:00:00.000Z';
    const accumulator = new ProviderStateAccumulator();

    accumulator.ingest(
      'SessionInfo',
      {
        Key: 'session-2026-race',
        Name: 'Race',
        Meeting: {
          Key: 'weekend-2026-round-1',
          Name: 'Bahrain Grand Prix',
        },
      },
      emittedAt,
    );

    accumulator.ingest(
      'LapCount',
      {
        CurrentLap: '12',
        TotalLaps: '57',
      },
      emittedAt,
    );

    accumulator.ingest(
      'TrackStatus',
      {
        Status: '4',
      },
      emittedAt,
    );

    accumulator.ingest(
      'DriverList',
      {
        '1': {
          RacingNumber: '1',
          Tla: 'VER',
          FirstName: 'Max',
          LastName: 'Verstappen',
          TeamName: 'Red Bull Racing',
        },
      },
      emittedAt,
    );

    accumulator.ingest(
      'TimingData',
      {
        Lines: {
          '1': {
            Position: '1',
            GapToLeader: '-',
            IntervalToPositionAhead: {
              Value: '-',
            },
            LastLapTime: {
              Value: '1:32.100',
            },
            BestLapTime: {
              Value: '1:31.555',
            },
            Sectors: {
              '0': {
                Value: '30.100',
              },
              '1': {
                Value: '31.000',
              },
              '2': {
                Value: '31.000',
              },
            },
          },
        },
      },
      emittedAt,
    );

    accumulator.ingest(
      'TimingAppData',
      {
        Lines: {
          '1': {
            Stints: [{ Compound: 'SOFT', TotalLaps: '12' }],
          },
        },
      },
      emittedAt,
    );

    const state = accumulator.buildState(emittedAt);
    expect(state).not.toBeNull();
    expect(state?.session.sessionName).toBe('Bahrain Grand Prix - Race');
    expect(state?.session.currentLap).toBe(12);
    expect(state?.session.totalLaps).toBe(57);
    expect(state?.session.flag).toBe('safety_car');

    expect(state?.leaderboard).toHaveLength(1);
    expect(state?.leaderboard[0]).toMatchObject({
      position: 1,
      driverCode: 'VER',
      driverName: 'Max Verstappen',
      teamName: 'Red Bull Racing',
      sector1Ms: 30100,
      sector2Ms: 31000,
      sector3Ms: 31000,
      tireCompound: 'SOFT',
      stintLap: 12,
    });
  });

  it('keeps merged timing fields across partial updates', () => {
    const emittedAt = '2026-03-03T00:00:00.000Z';
    const accumulator = new ProviderStateAccumulator();

    accumulator.ingest(
      'TimingData',
      {
        Lines: {
          '44': {
            Position: '2',
            LastLapTime: { Value: '1:33.500' },
            BestLapTime: { Value: '1:33.000' },
          },
        },
      },
      emittedAt,
    );

    accumulator.ingest(
      'TimingData',
      {
        Lines: {
          '44': {
            Sectors: {
              '0': { Value: '30.000' },
              '1': { Value: '31.000' },
              '2': { Value: '32.500' },
            },
          },
        },
      },
      emittedAt,
    );

    const state = accumulator.buildState(emittedAt);
    expect(state).not.toBeNull();

    const entry = state?.leaderboard.at(0);
    expect(entry).toMatchObject({
      position: 2,
      lastLapMs: 93500,
      bestLapMs: 93000,
      sector1Ms: 30000,
      sector2Ms: 31000,
      sector3Ms: 32500,
    });
  });

  it('maps and sorts race control messages by emitted timestamp', () => {
    const emittedAt = '2026-03-03T00:00:00.000Z';
    const accumulator = new ProviderStateAccumulator();

    accumulator.ingest(
      'LapCount',
      {
        CurrentLap: '9',
        TotalLaps: '57',
      },
      emittedAt,
    );

    accumulator.ingest(
      'RaceControlMessages',
      {
        Messages: {
          older: {
            MessageId: 'rc-1',
            Category: 'Incident',
            Message: 'Car 4 under investigation',
            Utc: '2026-03-03T00:00:01.000Z',
          },
          newer: {
            MessageId: 'rc-2',
            Category: 'Flag',
            Message: 'Virtual safety car deployed',
            Utc: '2026-03-03T00:00:05.000Z',
          },
        },
      },
      emittedAt,
    );

    const state = accumulator.buildState(emittedAt);
    expect(state).not.toBeNull();
    expect(state?.raceControl).toHaveLength(2);
    expect(state?.raceControl[0]).toMatchObject({
      id: 'rc-2',
      category: 'flag',
      flag: 'virtual_safety_car',
    });
    expect(state?.raceControl[1]).toMatchObject({
      id: 'rc-1',
      category: 'incident',
    });
  });
});
