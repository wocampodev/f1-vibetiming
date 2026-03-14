import { deflateRawSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  decodeTopicPayload,
  extractCookieJarEntries,
  extractFeedMessagesFromRawText,
  extractFeedMessagesFromRawTextWithStats,
} from './live.provider.protocol';
import { formatProviderLogValue } from './live.provider.logging';
import { ProviderStateAccumulator } from './live.provider.state';

describe('extractCookieJarEntries', () => {
  it('keeps only cookie pairs and deduplicates by cookie name', () => {
    const entries = extractCookieJarEntries([
      'AWSALB=first; Expires=Fri, 13 Mar 2026 02:28:16 GMT; Path=/',
      'invalid',
      'AWSALBCORS=first; Expires=Fri, 13 Mar 2026 02:28:16 GMT; Path=/; SameSite=None; Secure',
      'AWSALB=second; Expires=Fri, 13 Mar 2026 02:29:16 GMT; Path=/',
    ]);

    expect(entries).toEqual([
      ['AWSALB', 'second'],
      ['AWSALBCORS', 'first'],
    ]);
  });
});

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

describe('formatProviderLogValue', () => {
  it('normalizes whitespace and truncates long payloads', () => {
    const formatted = formatProviderLogValue(
      '{\n  "topic": "TimingData",\n  "value": "1234567890"\n}',
      80,
    );

    expect(formatted).toBe('{ "topic": "TimingData", "value": "1234567890" }');

    const truncated = formatProviderLogValue({ payload: 'x'.repeat(200) }, 80);
    expect(truncated).toHaveLength(80);
    expect(truncated.endsWith('...')).toBe(true);
  });

  it('renders empty strings as a visible placeholder', () => {
    expect(formatProviderLogValue('   ', 120)).toBe('(empty)');
  });
});

describe('extractFeedMessagesFromRawText', () => {
  it('extracts feed messages from a recorded SignalR frame fixture', () => {
    const fixturePath = path.resolve(
      __dirname,
      'fixtures',
      'signalr-feed-frame.json',
    );
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8')) as {
      hubName: string;
      rawFrame: string;
    };

    const messages = extractFeedMessagesFromRawText(
      fixture.rawFrame,
      fixture.hubName,
    );

    expect(messages).toHaveLength(6);
    expect(messages.map((message) => message.topic)).toEqual([
      'LapCount',
      'DriverList',
      'TimingData',
      'TimingStats',
      'CarData',
      'Position',
    ]);
    expect(messages[0].payload).toEqual({ CurrentLap: '14', TotalLaps: '57' });
  });

  it('tracks invalid frames and compressed decode failures from mixed frames', () => {
    const fixturePath = path.resolve(
      __dirname,
      'fixtures',
      'signalr-feed-multiframe.json',
    );
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8')) as {
      hubName: string;
      frames: string[];
    };
    const rawFrame = `${fixture.frames.join('\u001e')}\u001e`;

    const extracted = extractFeedMessagesFromRawTextWithStats(
      rawFrame,
      fixture.hubName,
    );

    expect(extracted.invalidFrames).toBe(1);
    expect(extracted.messages).toHaveLength(3);
    expect(extracted.messages.map((message) => message.topic)).toEqual([
      'LapCount',
      'CarData',
      'Position',
    ]);
    expect(
      extracted.messages.find((message) => message.topic === 'CarData')
        ?.decodeError,
    ).toBe(true);
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
      driverNumber: '1',
      driverCode: 'VER',
      driverName: 'Max Verstappen',
      teamName: 'Red Bull Racing',
      trackStatus: null,
      pitState: null,
      pitStops: null,
      speedKph: null,
      topSpeedKph: null,
      gapToLeaderText: null,
      intervalToAheadText: null,
      sector1Ms: 30100,
      sector2Ms: 31000,
      sector3Ms: 31000,
      bestSector1Ms: 30100,
      bestSector2Ms: 31000,
      bestSector3Ms: 31000,
      completedLaps: null,
      miniSectors: [],
      tireCompound: 'SOFT',
      stintLap: 12,
      tireIsNew: null,
      positionSource: 'timing_data',
      positionUpdatedAt: emittedAt,
      positionConfidence: 'high',
    });
  });

  it('captures board-ready pit, stint, lap, and mini-sector fields', () => {
    const emittedAt = '2026-03-03T00:00:00.000Z';
    const accumulator = new ProviderStateAccumulator();

    accumulator.ingest(
      'TimingData',
      {
        Lines: {
          '44': {
            Position: '5',
            InPit: true,
            NumberOfPitStops: 1,
            NumberOfLaps: 22,
            GapToLeader: '+12.345',
            IntervalToPositionAhead: { Value: '+1.234' },
            Sectors: {
              '0': {
                Segments: {
                  '0': { Status: 2048 },
                  '1': { Status: 2049 },
                },
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
          '44': {
            Stints: {
              '1': {
                Compound: 'HARD',
                TotalLaps: 7,
                New: 'true',
              },
            },
          },
        },
      },
      emittedAt,
    );

    const state = accumulator.buildState(emittedAt);

    expect(state?.leaderboard[0]).toMatchObject({
      driverNumber: '44',
      pitState: 'in_pit',
      pitStops: 1,
      completedLaps: 22,
      gapToLeaderText: '+12.345',
      intervalToAheadText: '+1.234',
      tireCompound: 'HARD',
      stintLap: 7,
      tireIsNew: true,
      miniSectors: [
        { sector: 1, segment: 0, status: 2048, active: true },
        { sector: 1, segment: 1, status: 2049, active: true },
      ],
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

    accumulator.ingest(
      'TimingData',
      {
        Lines: {
          '44': {
            Sectors: {
              '0': { Value: '' },
              '1': { Value: '' },
              '2': {
                Segments: {
                  '0': { Status: '1' },
                },
              },
            },
          },
        },
      },
      emittedAt,
    );

    const updatedState = accumulator.buildState(emittedAt);
    expect(updatedState).not.toBeNull();
    expect(updatedState?.leaderboard[0]).toMatchObject({
      position: 2,
      sector1Ms: 30000,
      sector2Ms: 31000,
      sector3Ms: 32500,
    });
  });

  it('falls back to the local roster when provider driver identity is missing', () => {
    const emittedAt = '2026-03-03T00:00:00.000Z';
    const accumulator = new ProviderStateAccumulator();

    accumulator.ingest(
      'TimingData',
      {
        Lines: {
          '43': {
            Position: '1',
            LastLapTime: { Value: '1:24.222' },
            BestLapTime: { Value: '1:24.222' },
            Sectors: {
              '0': { Value: '29.853' },
              '1': { Value: '18.191' },
              '2': { Value: '36.178' },
            },
          },
        },
      },
      emittedAt,
    );

    const state = accumulator.buildState(emittedAt);
    expect(state).not.toBeNull();
    expect(state?.leaderboard[0]).toMatchObject({
      position: 1,
      driverCode: '43',
      driverName: 'Franco Colapinto',
      teamName: 'Alpine',
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

  it('maps race control message arrays emitted by the real provider', () => {
    const emittedAt = '2026-03-03T00:00:00.000Z';
    const accumulator = new ProviderStateAccumulator();

    accumulator.ingest(
      'SessionStatus',
      {
        Status: 'Started',
      },
      emittedAt,
    );

    accumulator.ingest(
      'LapCount',
      {
        CurrentLap: '1',
        TotalLaps: '16',
      },
      emittedAt,
    );

    accumulator.ingest(
      'RaceControlMessages',
      {
        _kf: true,
        Messages: [
          {
            Utc: '2026-03-03T00:00:02.000Z',
            Flag: 'GREEN',
            Scope: 'Track',
            Message: 'GREEN LIGHT - PIT EXIT OPEN',
            Category: 'Flag',
          },
        ],
      },
      emittedAt,
    );

    const state = accumulator.buildState(emittedAt);
    expect(state).not.toBeNull();
    expect(state?.raceControl).toHaveLength(1);
    expect(state?.raceControl[0]).toMatchObject({
      category: 'flag',
      flag: 'green',
      message: 'GREEN LIGHT - PIT EXIT OPEN',
    });
  });

  it('maps TimingStats, CarData, and Position topics into leaderboard telemetry', () => {
    const emittedAt = '2026-03-03T00:00:00.000Z';
    const accumulator = new ProviderStateAccumulator();

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
            LastLapTime: { Value: '1:32.800' },
            BestLapTime: { Value: '1:31.900' },
          },
        },
      },
      emittedAt,
    );

    accumulator.ingest(
      'TimingStats',
      {
        Lines: {
          '1': {
            BestSpeeds: {
              I1: { Value: '296.2' },
              ST: { Value: '323.8' },
            },
          },
        },
      },
      emittedAt,
    );

    accumulator.ingest(
      'CarData',
      {
        Entries: [
          {
            Cars: {
              '1': {
                Channels: {
                  '2': '312',
                },
              },
            },
            Utc: '2026-03-03T00:00:02.000Z',
          },
        ],
      },
      emittedAt,
    );

    accumulator.ingest(
      'Position',
      {
        Position: [
          {
            Entries: {
              '1': {
                Status: 'OnTrack',
              },
            },
          },
        ],
      },
      emittedAt,
    );

    const state = accumulator.buildState(emittedAt);
    expect(state).not.toBeNull();

    expect(state?.leaderboard[0]).toMatchObject({
      position: 1,
      speedKph: 312,
      topSpeedKph: 324,
      trackStatus: 'on_track',
      speedHistoryKph: [{ at: '2026-03-03T00:00:02.000Z', kph: 312 }],
      trackStatusHistory: [{ at: emittedAt, status: 'on_track' }],
    });
  });

  it('caps telemetry history windows to prevent payload growth', () => {
    const emittedAt = '2026-03-03T00:00:00.000Z';
    const accumulator = new ProviderStateAccumulator();

    accumulator.ingest(
      'DriverList',
      {
        '1': {
          RacingNumber: '1',
          Tla: 'VER',
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
            LastLapTime: { Value: '1:32.500' },
            BestLapTime: { Value: '1:32.100' },
          },
        },
      },
      emittedAt,
    );

    for (let index = 0; index < 30; index += 1) {
      accumulator.ingest(
        'CarData',
        {
          Entries: [
            {
              Cars: {
                '1': {
                  Channels: {
                    '2': `${300 + index}`,
                  },
                },
              },
              Utc: `2026-03-03T00:00:${String(index).padStart(2, '0')}.000Z`,
            },
          ],
        },
        emittedAt,
      );
    }

    for (let index = 0; index < 20; index += 1) {
      accumulator.ingest(
        'Position',
        {
          Position: [
            {
              Utc: `2026-03-03T00:01:${String(index).padStart(2, '0')}.000Z`,
              Entries: {
                '1': {
                  Status: index % 2 === 0 ? 'OnTrack' : 'PitLane',
                },
              },
            },
          ],
        },
        emittedAt,
      );
    }

    const state = accumulator.buildState(emittedAt);
    expect(state).not.toBeNull();

    expect(state?.leaderboard[0]?.speedHistoryKph).toHaveLength(16);
    expect(state?.leaderboard[0]?.speedHistoryKph[0]).toEqual({
      at: '2026-03-03T00:00:14.000Z',
      kph: 314,
    });
    expect(state?.leaderboard[0]?.speedHistoryKph.at(-1)).toEqual({
      at: '2026-03-03T00:00:29.000Z',
      kph: 329,
    });

    expect(state?.leaderboard[0]?.trackStatusHistory).toHaveLength(10);
    expect(state?.leaderboard[0]?.trackStatusHistory.at(-1)).toEqual({
      at: '2026-03-03T00:01:19.000Z',
      status: 'pit_lane',
    });
  });

  it('uses TimingStats sector and personal best fallbacks when TimingData fields are missing', () => {
    const emittedAt = '2026-03-03T00:00:00.000Z';
    const accumulator = new ProviderStateAccumulator();

    accumulator.ingest(
      'TimingData',
      {
        Lines: {
          '44': {
            Position: '2',
            LastLapTime: { Value: '1:34.000' },
          },
        },
      },
      emittedAt,
    );

    accumulator.ingest(
      'TimingStats',
      {
        Lines: {
          '44': {
            PersonalBestLapTime: { Value: '1:33.200' },
            BestSectors: [
              { Value: '30.100' },
              { Value: '31.200' },
              { Value: '31.900' },
            ],
          },
        },
      },
      emittedAt,
    );

    const state = accumulator.buildState(emittedAt);
    expect(state).not.toBeNull();

    expect(state?.leaderboard[0]).toMatchObject({
      position: 2,
      bestLapMs: 93200,
      sector1Ms: 30100,
      sector2Ms: 31200,
      sector3Ms: 31900,
      bestSector1Ms: 30100,
      bestSector2Ms: 31200,
      bestSector3Ms: 31900,
    });
  });

  it('supports object-based BestSectors payloads in TimingStats', () => {
    const emittedAt = '2026-03-03T00:00:00.000Z';
    const accumulator = new ProviderStateAccumulator();

    accumulator.ingest(
      'TimingData',
      {
        Lines: {
          '44': {
            Position: '2',
          },
        },
      },
      emittedAt,
    );

    accumulator.ingest(
      'TimingStats',
      {
        Lines: {
          '44': {
            PersonalBestLapTime: { Value: '1:33.200' },
            BestSectors: {
              '1': { Value: '30.100' },
              '2': { Value: '31.200' },
              '3': { Value: '31.900' },
            },
          },
        },
      },
      emittedAt,
    );

    const state = accumulator.buildState(emittedAt);
    expect(state).not.toBeNull();

    expect(state?.leaderboard[0]).toMatchObject({
      position: 2,
      bestLapMs: 93200,
      sector1Ms: 30100,
      sector2Ms: 31200,
      sector3Ms: 31900,
      bestSector1Ms: 30100,
      bestSector2Ms: 31200,
      bestSector3Ms: 31900,
    });
  });

  it('maps alternative provider gap fields to gap and interval values', () => {
    const emittedAt = '2026-03-03T00:00:00.000Z';
    const accumulator = new ProviderStateAccumulator();

    accumulator.ingest(
      'TimingData',
      {
        Lines: {
          '1': {
            Position: '1',
            LastLapTime: { Value: '1:20.000' },
            TimeDiffToFastest: '+0.000',
          },
          '2': {
            Position: '2',
            LastLapTime: { Value: '1:21.250' },
            TimeDifftoFastest: '+1.250',
            TimeDifftoPositionAhead: '+1.250',
          },
        },
      },
      emittedAt,
    );

    const state = accumulator.buildState(emittedAt);
    expect(state).not.toBeNull();

    expect(state?.leaderboard[1]).toMatchObject({
      position: 2,
      gapToLeaderSec: 1.25,
      intervalToAheadSec: 1.25,
    });
  });

  it('derives missing sector3, best lap, and gaps from lap timings when needed', () => {
    const emittedAt = '2026-03-03T00:00:00.000Z';
    const accumulator = new ProviderStateAccumulator();

    accumulator.ingest(
      'TimingData',
      {
        Lines: {
          '1': {
            Position: '1',
            LastLapTime: { Value: '1:20.000' },
          },
          '2': {
            Position: '2',
            LastLapTime: { Value: '1:21.500' },
            Sectors: {
              '0': { Value: '30.000' },
              '1': { Value: '31.000' },
            },
          },
        },
      },
      emittedAt,
    );

    const state = accumulator.buildState(emittedAt);
    expect(state).not.toBeNull();

    expect(state?.leaderboard[1]).toMatchObject({
      position: 2,
      bestLapMs: 81500,
      sector1Ms: 30000,
      sector2Ms: 31000,
      sector3Ms: 20500,
      gapToLeaderSec: 1.5,
      intervalToAheadSec: 1.5,
    });
  });

  it('reads sector times from previousValue nodes when live value is absent', () => {
    const emittedAt = '2026-03-03T00:00:00.000Z';
    const accumulator = new ProviderStateAccumulator();

    accumulator.ingest(
      'TimingData',
      {
        Lines: {
          '81': {
            Position: '1',
            LastLapTime: { Value: '1:20.941' },
            Sectors: {
              '0': { previousValue: '28.260' },
              '1': { previousValue: '18.020' },
            },
          },
        },
      },
      emittedAt,
    );

    const state = accumulator.buildState(emittedAt);
    expect(state).not.toBeNull();
    expect(state?.leaderboard[0]).toMatchObject({
      position: 1,
      sector1Ms: 28260,
      sector2Ms: 18020,
      sector3Ms: 34661,
      lastLapMs: 80941,
      bestLapMs: 80941,
    });
  });

  it('builds leaderboard rows when timing updates do not include explicit positions', () => {
    const emittedAt = '2026-03-03T00:00:00.000Z';
    const accumulator = new ProviderStateAccumulator();

    accumulator.ingest(
      'TimingData',
      {
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
      emittedAt,
    );

    const state = accumulator.buildState(emittedAt);
    expect(state).not.toBeNull();
    expect(state?.leaderboard).toHaveLength(2);

    expect(state?.leaderboard[0]).toMatchObject({
      position: 1,
      driverCode: '81',
      bestLapMs: 79500,
      positionSource: 'best_lap',
      positionUpdatedAt: emittedAt,
      positionConfidence: 'low',
    });
    expect(state?.leaderboard[1]).toMatchObject({
      position: 2,
      driverCode: '16',
      bestLapMs: 80500,
      gapToLeaderSec: 1,
      intervalToAheadSec: 1,
      positionSource: 'best_lap',
      positionUpdatedAt: emittedAt,
      positionConfidence: 'low',
    });
  });

  it('does not promote line hints over trusted timing positions', () => {
    const emittedAt = '2026-03-03T00:00:00.000Z';
    const accumulator = new ProviderStateAccumulator();

    accumulator.ingest(
      'DriverList',
      {
        '1': {
          RacingNumber: '1',
          Tla: 'NOR',
        },
        '81': {
          RacingNumber: '81',
          Tla: 'PIA',
          Line: 1,
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
            LastLapTime: { Value: '1:21.000' },
            BestLapTime: { Value: '1:20.800' },
          },
          '81': {
            Line: 1,
            LastLapTime: { Value: '1:20.500' },
            BestLapTime: { Value: '1:20.100' },
          },
        },
      },
      emittedAt,
    );

    accumulator.ingest(
      'TimingAppData',
      {
        Lines: {
          '81': {
            Line: 1,
          },
        },
      },
      emittedAt,
    );

    const state = accumulator.buildState(emittedAt);
    expect(state).not.toBeNull();
    expect(state?.leaderboard[0]).toMatchObject({
      position: 1,
      driverCode: 'NOR',
    });
    expect(state?.leaderboard[1]).toMatchObject({
      position: 2,
      driverCode: 'PIA',
    });
  });

  it('keeps the previous resolved position when a later patch clears timing position', () => {
    const emittedAt = '2026-03-03T00:00:00.000Z';
    const accumulator = new ProviderStateAccumulator();

    accumulator.ingest(
      'TimingData',
      {
        Lines: {
          '1': {
            Position: '1',
            LastLapTime: { Value: '1:21.000' },
          },
          '81': {
            Position: '2',
            LastLapTime: { Value: '1:21.300' },
          },
        },
      },
      emittedAt,
    );

    const initialState = accumulator.buildState(emittedAt);
    expect(initialState?.leaderboard[0]?.position).toBe(1);
    expect(initialState?.leaderboard[1]?.position).toBe(2);

    accumulator.ingest(
      'TimingData',
      {
        Lines: {
          '81': {
            Position: '',
            Line: '1',
            BestLapTime: { Value: '1:19.900' },
          },
        },
      },
      emittedAt,
    );

    const updatedState = accumulator.buildState(emittedAt);
    expect(updatedState).not.toBeNull();
    expect(updatedState?.leaderboard[0]).toMatchObject({
      position: 1,
      driverCode: '1',
    });
    expect(updatedState?.leaderboard[1]).toMatchObject({
      position: 2,
      driverCode: '81',
      positionSource: 'timing_data',
      positionUpdatedAt: emittedAt,
      positionConfidence: 'medium',
    });
  });
});
