import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { inflateRawSync } from 'node:zlib';
import WebSocket, { RawData } from 'ws';
import { LiveAdapter, LivePublish } from './live.adapter';
import {
  LiveAdapterHealth,
  LiveFeedSource,
  LiveFlagStatus,
  LiveLeaderboardEntry,
  LiveRaceControlMessage,
  LiveSpeedSample,
  LiveState,
  LiveTrackStatusSample,
} from './live.types';

interface SignalrNegotiationResponse {
  ConnectionToken: string;
}

interface SignalrHubMessage {
  H?: unknown;
  M?: unknown;
  A?: unknown;
}

interface FeedEnvelope {
  rawTopic: string;
  topic: string;
  payload: unknown;
  emittedAt: string;
  decodeError: boolean;
}

export interface SignalrFeedMessage {
  rawTopic: string;
  topic: string;
  payload: unknown;
  emittedAt: string;
  decodeError: boolean;
}

export interface SignalrFeedExtractionResult {
  messages: SignalrFeedMessage[];
  invalidFrames: number;
}

type JsonRecord = Record<string, unknown>;

const DEFAULT_TOPICS = [
  'SessionInfo',
  'SessionStatus',
  'LapCount',
  'TrackStatus',
  'DriverList',
  'TimingData',
  'TimingStats',
  'TimingAppData',
  'CarData.z',
  'Position.z',
  'RaceControlMessages',
  'ExtrapolatedClock',
];

const TRACK_STATUS_FLAG_MAP: Record<string, LiveFlagStatus> = {
  '1': 'green',
  '2': 'yellow',
  '3': 'red',
  '4': 'safety_car',
  '5': 'virtual_safety_car',
  '6': 'checkered',
};

const TIRE_COMPOUNDS = new Set([
  'SOFT',
  'MEDIUM',
  'HARD',
  'INTERMEDIATE',
  'WET',
]);

const MAX_RACE_CONTROL_MESSAGES = 30;
const MAX_SPEED_HISTORY_POINTS = 16;
const MAX_TRACK_STATUS_HISTORY_POINTS = 10;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): JsonRecord | null =>
  isRecord(value) ? value : null;

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const asRecordArray = (value: unknown): JsonRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is JsonRecord => isRecord(item));
};

const toInt = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
};

const toIso = (value: unknown, fallback = new Date().toISOString()): string => {
  const raw = asString(value);
  if (!raw) {
    return fallback;
  }

  const timestamp = new Date(raw);
  return Number.isNaN(timestamp.getTime()) ? fallback : timestamp.toISOString();
};

const parseLapOrSectorMs = (value: unknown): number | null => {
  const raw = asString(value);
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }

  const minutesPattern = /^(\d+):(\d{1,2})\.(\d{3})$/;
  const secondsPattern = /^(\d{1,2})\.(\d{3})$/;

  const minutesMatch = trimmed.match(minutesPattern);
  if (minutesMatch) {
    const minutes = Number.parseInt(minutesMatch[1], 10);
    const seconds = Number.parseInt(minutesMatch[2], 10);
    const millis = Number.parseInt(minutesMatch[3], 10);
    return minutes * 60_000 + seconds * 1000 + millis;
  }

  const secondsMatch = trimmed.match(secondsPattern);
  if (secondsMatch) {
    const seconds = Number.parseInt(secondsMatch[1], 10);
    const millis = Number.parseInt(secondsMatch[2], 10);
    return seconds * 1000 + millis;
  }

  return null;
};

const parseGapSeconds = (value: unknown): number | null => {
  const raw = asString(value);
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (
    trimmed === '' ||
    trimmed === '-' ||
    trimmed.toUpperCase().includes('LAP')
  ) {
    return null;
  }

  const sanitized = trimmed.replace(/\+/g, '');
  const parsed = Number.parseFloat(sanitized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseSpeedKph = (value: unknown): number | null => {
  const parsed = asNumber(value);
  if (parsed == null) {
    return null;
  }

  return Math.round(parsed);
};

const normalizeTrackStatus = (value: unknown): string | null => {
  const raw = asString(value);
  if (!raw) {
    return null;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized.includes('ontrack') || normalized === 'on_track') {
    return 'on_track';
  }
  if (normalized.includes('pitlane') || normalized.includes('pit lane')) {
    return 'pit_lane';
  }
  if (normalized.includes('garage')) {
    return 'pit_garage';
  }
  if (normalized.includes('stopped')) {
    return 'stopped';
  }
  if (normalized.includes('offtrack') || normalized.includes('off track')) {
    return 'off_track';
  }

  return normalized;
};

const normalizeFlag = (value: unknown): LiveFlagStatus | null => {
  const raw = asString(value);
  if (!raw) {
    return null;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized.includes('virtual') && normalized.includes('safety')) {
    return 'virtual_safety_car';
  }
  if (normalized.includes('safety')) {
    return 'safety_car';
  }
  if (normalized.includes('red')) {
    return 'red';
  }
  if (normalized.includes('yellow')) {
    return 'yellow';
  }
  if (normalized.includes('green')) {
    return 'green';
  }
  if (normalized.includes('checkered') || normalized.includes('chequered')) {
    return 'checkered';
  }

  return null;
};

const normalizeCompound = (
  value: unknown,
): LiveLeaderboardEntry['tireCompound'] => {
  const raw = asString(value);
  if (!raw) {
    return null;
  }

  const upper = raw.toUpperCase();
  return TIRE_COMPOUNDS.has(upper)
    ? (upper as NonNullable<LiveLeaderboardEntry['tireCompound']>)
    : null;
};

const parseTopSpeedKphFromStats = (
  timingStats: JsonRecord | undefined,
): number | null => {
  if (!timingStats) {
    return null;
  }

  const bestSpeeds = asRecord(timingStats.BestSpeeds);
  if (!bestSpeeds) {
    return null;
  }

  const values = Object.values(bestSpeeds)
    .map((node) => {
      const speedValue = asRecord(node)?.Value ?? node;
      return parseSpeedKph(speedValue);
    })
    .filter((value): value is number => value != null);

  if (values.length === 0) {
    return null;
  }

  return Math.max(...values);
};

const parseTimingStatsSector = (
  timingStats: JsonRecord | undefined,
  index: number,
): number | null => {
  if (!timingStats) {
    return null;
  }

  const bestSectors = asRecordArray(timingStats.BestSectors);
  const node = bestSectors.at(index);
  return node ? parseLapOrSectorMs(node.Value) : null;
};

const mergeRecords = (
  current: JsonRecord,
  incoming: JsonRecord,
): JsonRecord => {
  const merged: JsonRecord = { ...current };

  for (const [key, value] of Object.entries(incoming)) {
    const currentValue = merged[key];
    if (isRecord(value) && isRecord(currentValue)) {
      merged[key] = mergeRecords(currentValue, value);
      continue;
    }

    merged[key] = value;
  }

  return merged;
};

const appendSpeedHistoryPoint = (
  history: LiveSpeedSample[],
  point: LiveSpeedSample,
): LiveSpeedSample[] => {
  const next = [...history, point];
  return next.slice(-MAX_SPEED_HISTORY_POINTS);
};

const appendTrackStatusHistoryPoint = (
  history: LiveTrackStatusSample[],
  point: LiveTrackStatusSample,
): LiveTrackStatusSample[] => {
  const last = history.at(-1);
  if (last?.status === point.status) {
    return history;
  }

  const next = [...history, point];
  return next.slice(-MAX_TRACK_STATUS_HISTORY_POINTS);
};

const parseCookiePair = (setCookieValue: string): [string, string] | null => {
  const firstPart = setCookieValue.split(';', 1)[0]?.trim() ?? '';
  if (firstPart.length === 0) {
    return null;
  }

  const separatorIndex = firstPart.indexOf('=');
  if (separatorIndex <= 0) {
    return null;
  }

  const name = firstPart.slice(0, separatorIndex).trim();
  const value = firstPart.slice(separatorIndex + 1).trim();
  if (name.length === 0 || value.length === 0) {
    return null;
  }

  return [name, value];
};

export const extractCookieJarEntries = (
  setCookieValues: string[],
): Array<[string, string]> => {
  const jar = new Map<string, string>();

  for (const setCookieValue of setCookieValues) {
    const parsed = parseCookiePair(setCookieValue);
    if (!parsed) {
      continue;
    }

    jar.set(parsed[0], parsed[1]);
  }

  return [...jar.entries()];
};

const readSetCookieValues = (headers: Headers): string[] => {
  const withGetSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof withGetSetCookie.getSetCookie === 'function') {
    return withGetSetCookie.getSetCookie();
  }

  const singleHeader = headers.get('set-cookie');
  return singleHeader ? [singleHeader] : [];
};

export const decodeTopicPayload = (
  topic: string,
  payload: unknown,
): FeedEnvelope => {
  const emittedAt = new Date().toISOString();
  if (!topic.endsWith('.z')) {
    if (typeof payload === 'string') {
      const trimmed = payload.trim();
      if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
      ) {
        try {
          return {
            rawTopic: topic,
            topic,
            payload: JSON.parse(trimmed) as unknown,
            emittedAt,
            decodeError: false,
          };
        } catch {
          return {
            rawTopic: topic,
            topic,
            payload,
            emittedAt,
            decodeError: false,
          };
        }
      }
    }

    return {
      rawTopic: topic,
      topic,
      payload,
      emittedAt,
      decodeError: false,
    };
  }

  if (typeof payload !== 'string') {
    return {
      rawTopic: topic,
      topic: topic.replace(/\.z$/, ''),
      payload,
      emittedAt,
      decodeError: true,
    };
  }

  try {
    const compressed = Buffer.from(payload, 'base64');
    const decompressed = inflateRawSync(compressed).toString('utf-8');
    return {
      rawTopic: topic,
      topic: topic.replace(/\.z$/, ''),
      payload: JSON.parse(decompressed) as unknown,
      emittedAt,
      decodeError: false,
    };
  } catch {
    return {
      rawTopic: topic,
      topic: topic.replace(/\.z$/, ''),
      payload,
      emittedAt,
      decodeError: true,
    };
  }
};

export const extractFeedMessagesFromRawTextWithStats = (
  rawText: string,
  hubName: string,
): SignalrFeedExtractionResult => {
  const frames = rawText.includes('\u001e')
    ? rawText
        .split('\u001e')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    : [rawText.trim()].filter((value) => value.length > 0);

  const messages: SignalrFeedMessage[] = [];
  let invalidFrames = 0;

  for (const frame of frames) {
    let envelope: JsonRecord;
    try {
      envelope = JSON.parse(frame) as JsonRecord;
    } catch {
      invalidFrames += 1;
      continue;
    }

    const hubMessages = Array.isArray(envelope.M) ? envelope.M : [];
    for (const item of hubMessages) {
      const hubMessage = asRecord(item) as SignalrHubMessage | null;
      if (!hubMessage) {
        continue;
      }

      const hub = (asString(hubMessage.H) ?? '').toLowerCase();
      const method = (asString(hubMessage.M) ?? '').toLowerCase();
      if (hub !== hubName.toLowerCase() || method !== 'feed') {
        continue;
      }

      const args = Array.isArray(hubMessage.A) ? hubMessage.A : [];
      const topicRaw = asString(args[0]);
      if (!topicRaw) {
        continue;
      }

      const decoded = decodeTopicPayload(topicRaw, args[1]);
      const emittedAt = toIso(args[2], decoded.emittedAt);

      messages.push({
        rawTopic: decoded.rawTopic,
        topic: decoded.topic,
        payload: decoded.payload,
        emittedAt,
        decodeError: decoded.decodeError,
      });
    }
  }

  return {
    messages,
    invalidFrames,
  };
};

export const extractFeedMessagesFromRawText = (
  rawText: string,
  hubName: string,
): SignalrFeedMessage[] => {
  return extractFeedMessagesFromRawTextWithStats(rawText, hubName).messages;
};

export class ProviderStateAccumulator {
  private readonly driverByNumber = new Map<string, JsonRecord>();
  private readonly timingByNumber = new Map<string, JsonRecord>();
  private readonly timingStatsByNumber = new Map<string, JsonRecord>();
  private readonly timingAppByNumber = new Map<string, JsonRecord>();
  private readonly carDataByNumber = new Map<string, JsonRecord>();
  private readonly positionByNumber = new Map<string, JsonRecord>();
  private readonly speedHistoryByNumber = new Map<string, LiveSpeedSample[]>();
  private readonly trackStatusHistoryByNumber = new Map<
    string,
    LiveTrackStatusSample[]
  >();

  private sessionName: string | null = null;
  private weekendId: string | null = null;
  private sessionId: string | null = null;
  private currentLap: number | null = null;
  private totalLaps: number | null = null;
  private phase: 'running' | 'finished' | 'unknown' = 'unknown';
  private flag: LiveFlagStatus = 'green';
  private clockIso: string | null = null;
  private raceControl: LiveRaceControlMessage[] = [];

  private appendSpeedHistory(number: string, kph: number, at: string): void {
    const history = this.speedHistoryByNumber.get(number) ?? [];
    this.speedHistoryByNumber.set(
      number,
      appendSpeedHistoryPoint(history, { at, kph }),
    );
  }

  private appendTrackStatusHistory(
    number: string,
    status: string,
    at: string,
  ): void {
    const history = this.trackStatusHistoryByNumber.get(number) ?? [];
    this.trackStatusHistoryByNumber.set(
      number,
      appendTrackStatusHistoryPoint(history, { at, status }),
    );
  }

  ingest(topic: string, payload: unknown, emittedAt: string): string[] {
    const changed = new Set<string>(['generatedAt']);
    const record = asRecord(payload);

    if (topic === 'DriverList' && record) {
      for (const [number, lineValue] of Object.entries(record)) {
        const line = asRecord(lineValue);
        if (!line) {
          continue;
        }

        const current = this.driverByNumber.get(number) ?? {};
        this.driverByNumber.set(number, mergeRecords(current, line));
      }
      changed.add('leaderboard');
    }

    if (topic === 'TimingData' && record) {
      const lines = asRecord(record.Lines);
      if (lines) {
        for (const [number, lineValue] of Object.entries(lines)) {
          const line = asRecord(lineValue);
          if (!line) {
            continue;
          }

          const current = this.timingByNumber.get(number) ?? {};
          this.timingByNumber.set(number, mergeRecords(current, line));
        }
        changed.add('leaderboard');
      }
    }

    if (topic === 'TimingStats' && record) {
      const lines = asRecord(record.Lines);
      if (lines) {
        for (const [number, lineValue] of Object.entries(lines)) {
          const line = asRecord(lineValue);
          if (!line) {
            continue;
          }

          const current = this.timingStatsByNumber.get(number) ?? {};
          this.timingStatsByNumber.set(number, mergeRecords(current, line));
        }
        changed.add('leaderboard');
      }
    }

    if (topic === 'TimingAppData' && record) {
      const lines = asRecord(record.Lines);
      if (lines) {
        for (const [number, lineValue] of Object.entries(lines)) {
          const line = asRecord(lineValue);
          if (!line) {
            continue;
          }

          const current = this.timingAppByNumber.get(number) ?? {};
          this.timingAppByNumber.set(number, mergeRecords(current, line));
        }
        changed.add('leaderboard');
      }
    }

    if (topic === 'CarData' && record) {
      const entries = asRecordArray(record.Entries);
      for (const entry of entries) {
        const cars = asRecord(entry.Cars);
        if (!cars) {
          continue;
        }

        const telemetryAt = toIso(entry.Utc, emittedAt);

        for (const [number, carValue] of Object.entries(cars)) {
          const car = asRecord(carValue);
          if (!car) {
            continue;
          }

          const current = this.carDataByNumber.get(number) ?? {};
          const merged = mergeRecords(current, car);
          merged.Utc = telemetryAt;
          this.carDataByNumber.set(number, merged);

          const channels = asRecord(merged.Channels);
          const speedKph = parseSpeedKph(channels?.['2']);
          if (speedKph != null) {
            this.appendSpeedHistory(number, speedKph, telemetryAt);
          }
        }
      }

      if (entries.length > 0) {
        changed.add('leaderboard');
      }
    }

    if (topic === 'Position' && record) {
      const positions = asRecordArray(record.Position);
      for (const position of positions) {
        const entries = asRecord(position.Entries);
        if (!entries) {
          continue;
        }

        const positionAt = toIso(position.Utc ?? position.Timestamp, emittedAt);

        for (const [number, entryValue] of Object.entries(entries)) {
          const entry = asRecord(entryValue);
          if (!entry) {
            continue;
          }

          const current = this.positionByNumber.get(number) ?? {};
          this.positionByNumber.set(number, mergeRecords(current, entry));

          const normalizedStatus = normalizeTrackStatus(entry.Status);
          if (normalizedStatus) {
            this.appendTrackStatusHistory(number, normalizedStatus, positionAt);
          }
        }
      }

      if (positions.length > 0) {
        changed.add('leaderboard');
      }
    }

    if (topic === 'LapCount' && record) {
      this.currentLap = toInt(record.CurrentLap);
      this.totalLaps = toInt(record.TotalLaps);
      changed.add('session.currentLap');
      changed.add('session.totalLaps');
    }

    if (topic === 'SessionInfo' && record) {
      const meeting = asRecord(record.Meeting);
      const meetingKey =
        asString(meeting?.Key) ??
        asString(meeting?.Name) ??
        asString(record.Meeting);
      const meetingName = asString(meeting?.Name);
      const sessionName = asString(record.Name);

      this.weekendId = meetingKey ?? this.weekendId;
      this.sessionId = asString(record.Key) ?? this.sessionId;
      this.sessionName =
        [meetingName, sessionName]
          .filter((part) => Boolean(part))
          .join(' - ') || this.sessionName;

      changed.add('session.weekendId');
      changed.add('session.sessionId');
      changed.add('session.sessionName');
    }

    if (topic === 'SessionStatus' && record) {
      const status = (asString(record.Status) ?? '').toLowerCase();
      if (status.includes('finish') || status.includes('ended')) {
        this.phase = 'finished';
        this.flag = 'checkered';
      } else if (status.includes('start') || status.includes('running')) {
        this.phase = 'running';
      }

      changed.add('session.phase');
      changed.add('session.flag');
    }

    if (topic === 'TrackStatus' && record) {
      const mapped = TRACK_STATUS_FLAG_MAP[asString(record.Status) ?? ''];
      const fromMessage = normalizeFlag(record.Message);
      const flag = mapped ?? fromMessage;
      if (flag) {
        this.flag = flag;
        changed.add('session.flag');
      }
    }

    if (topic === 'ExtrapolatedClock' && record) {
      const value = asString(record.Utc) ?? asString(record.Remaining);
      this.clockIso = value ? toIso(value, emittedAt) : emittedAt;
      changed.add('session.clockIso');
    }

    if (topic === 'RaceControlMessages' && record) {
      const messagesRecord = asRecord(record.Messages);
      if (messagesRecord) {
        const nextMessages: LiveRaceControlMessage[] = [];

        for (const [key, messageValue] of Object.entries(messagesRecord)) {
          const message = asRecord(messageValue);
          if (!message) {
            continue;
          }

          const emitted = toIso(message.Utc, emittedAt);
          const text = asString(message.Message) ?? asString(message.Status);
          if (!text) {
            continue;
          }

          const categoryRaw = (
            asString(message.Category) ?? 'control'
          ).toLowerCase();
          const category: LiveRaceControlMessage['category'] =
            categoryRaw.includes('incident')
              ? 'incident'
              : categoryRaw.includes('pit')
                ? 'pit'
                : categoryRaw.includes('flag')
                  ? 'flag'
                  : 'control';

          const flag =
            normalizeFlag(message.Flag) ?? normalizeFlag(message.Message);

          nextMessages.push({
            id: asString(message.MessageId) ?? `rc-${key}-${emitted}`,
            emittedAt: emitted,
            category,
            message: text,
            flag: flag ?? undefined,
          });
        }

        nextMessages.sort((a, b) => (a.emittedAt < b.emittedAt ? 1 : -1));
        this.raceControl = nextMessages.slice(0, MAX_RACE_CONTROL_MESSAGES);
        changed.add('raceControl');
      }
    }

    return [...changed];
  }

  buildState(emittedAt: string): LiveState | null {
    const numbers = new Set<string>([
      ...this.driverByNumber.keys(),
      ...this.timingByNumber.keys(),
    ]);

    const leaderboard: LiveLeaderboardEntry[] = [];

    for (const number of numbers) {
      const driver = this.driverByNumber.get(number);
      const timing = this.timingByNumber.get(number);
      const timingStats = this.timingStatsByNumber.get(number);
      const timingApp = this.timingAppByNumber.get(number);
      const carData = this.carDataByNumber.get(number);
      const positionData = this.positionByNumber.get(number);

      if (!timing) {
        continue;
      }

      const position = toInt(timing.Position) ?? toInt(timing.Line);
      if (position == null) {
        continue;
      }

      const sectors = asRecord(timing.Sectors);
      const sector1 = asRecord(sectors?.['0']);
      const sector2 = asRecord(sectors?.['1']);
      const sector3 = asRecord(sectors?.['2']);
      const sector1Ms =
        parseLapOrSectorMs(sector1?.Value) ??
        parseTimingStatsSector(timingStats, 0);
      const sector2Ms =
        parseLapOrSectorMs(sector2?.Value) ??
        parseTimingStatsSector(timingStats, 1);
      const sector3Ms =
        parseLapOrSectorMs(sector3?.Value) ??
        parseTimingStatsSector(timingStats, 2);

      const statsBestLap = parseLapOrSectorMs(
        asRecord(timingStats?.PersonalBestLapTime)?.Value,
      );
      const bestLapMs =
        parseLapOrSectorMs(asRecord(timing.BestLapTime)?.Value) ?? statsBestLap;

      const channels = asRecord(carData?.Channels);
      const speedHistoryKph = this.speedHistoryByNumber.get(number) ?? [];
      const speedKph =
        parseSpeedKph(channels?.['2']) ?? speedHistoryKph.at(-1)?.kph ?? null;
      const topSpeedKph =
        parseTopSpeedKphFromStats(timingStats) ??
        speedKph ??
        parseSpeedKph(asRecord(timingStats?.Speeds)?.ST);
      const trackStatusHistory =
        this.trackStatusHistoryByNumber.get(number) ?? [];
      const normalizedTrackStatus = normalizeTrackStatus(positionData?.Status);
      const resolvedTrackStatusHistory = normalizedTrackStatus
        ? appendTrackStatusHistoryPoint(trackStatusHistory, {
            at: emittedAt,
            status: normalizedTrackStatus,
          })
        : trackStatusHistory;
      const trackStatus =
        normalizedTrackStatus ??
        resolvedTrackStatusHistory.at(-1)?.status ??
        null;

      const intervalValue =
        asString(asRecord(timing.IntervalToPositionAhead)?.Value) ??
        asString(timing.IntervalToPositionAhead);

      const rawStints = timingApp ? timingApp.Stints : null;
      const stints: unknown[] = Array.isArray(rawStints)
        ? rawStints
        : isRecord(rawStints)
          ? Object.values(rawStints).reduce<unknown[]>((accumulator, value) => {
              if (Array.isArray(value)) {
                for (const item of value) {
                  accumulator.push(item);
                }
              }
              return accumulator;
            }, [])
          : [];
      const latestStint =
        stints.length > 0 ? asRecord(stints[stints.length - 1]) : null;

      const firstName = asString(driver?.FirstName);
      const lastName = asString(driver?.LastName);
      const combinedName = [firstName, lastName]
        .filter((value) => Boolean(value))
        .join(' ')
        .trim();

      leaderboard.push({
        position,
        driverCode:
          asString(driver?.Tla) ?? asString(driver?.RacingNumber) ?? number,
        driverName:
          asString(driver?.FullName) ??
          (combinedName.length > 0 ? combinedName : null) ??
          asString(driver?.BroadcastName),
        teamName: asString(driver?.TeamName),
        trackStatus,
        speedKph,
        topSpeedKph,
        gapToLeaderSec: parseGapSeconds(timing.GapToLeader),
        intervalToAheadSec: parseGapSeconds(intervalValue),
        sector1Ms,
        sector2Ms,
        sector3Ms,
        lastLapMs: parseLapOrSectorMs(asRecord(timing.LastLapTime)?.Value),
        bestLapMs,
        speedHistoryKph,
        trackStatusHistory: resolvedTrackStatusHistory,
        tireCompound:
          normalizeCompound(latestStint?.Compound) ??
          normalizeCompound(timing.Compound),
        stintLap: toInt(latestStint?.TotalLaps),
      });
    }

    leaderboard.sort((a, b) => a.position - b.position);

    const hasSessionInfo =
      this.sessionName !== null ||
      this.currentLap !== null ||
      this.totalLaps !== null ||
      leaderboard.length > 0;
    if (!hasSessionInfo) {
      return null;
    }

    return {
      generatedAt: emittedAt,
      session: {
        weekendId: this.weekendId,
        sessionId: this.sessionId,
        sessionName: this.sessionName,
        phase: this.phase,
        flag: this.flag,
        currentLap: this.currentLap,
        totalLaps: this.totalLaps,
        clockIso: this.clockIso ?? emittedAt,
      },
      leaderboard,
      raceControl: this.raceControl,
    };
  }
}

@Injectable()
export class LiveProviderAdapter implements LiveAdapter {
  readonly source: LiveFeedSource = 'provider';

  private readonly logger = new Logger(LiveProviderAdapter.name);
  private readonly baseUrl: string;
  private readonly hubName: string;
  private readonly topics: string[];
  private readonly heartbeatMs: number;
  private readonly reconnectMinMs: number;
  private readonly reconnectMaxMs: number;

  private running = false;
  private startedAt: string | null = null;
  private connectedAt: string | null = null;
  private lastEventAt: string | null = null;
  private lastFrameAt: string | null = null;
  private publish: LivePublish | null = null;
  private socket: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private invokeId = 1;
  private framesReceived = 0;
  private feedMessagesReceived = 0;
  private frameParseErrors = 0;
  private topicDecodeErrors = 0;
  private readonly cookieJar = new Map<string, string>();
  private readonly topicMessageCount = new Map<string, number>();
  private readonly topicLastSeenAt = new Map<string, string>();
  private initialStatePublished = false;
  private readonly accumulator = new ProviderStateAccumulator();

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>(
      'LIVE_SIGNALR_BASE_URL',
      'https://livetiming.formula1.com/signalr',
    );
    this.hubName = this.configService.get<string>(
      'LIVE_SIGNALR_HUB',
      'streaming',
    );
    const topicInput = this.configService.get<string>(
      'LIVE_SIGNALR_TOPICS',
      '',
    );
    const parsedTopics = topicInput
      .split(',')
      .map((topic) => topic.trim())
      .filter((topic) => topic.length > 0);
    this.topics = parsedTopics.length > 0 ? parsedTopics : DEFAULT_TOPICS;
    this.heartbeatMs = this.configService.get<number>(
      'LIVE_HEARTBEAT_MS',
      15000,
    );
    this.reconnectMinMs = this.configService.get<number>(
      'LIVE_SIGNALR_RECONNECT_MIN_MS',
      1000,
    );
    this.reconnectMaxMs = this.configService.get<number>(
      'LIVE_SIGNALR_RECONNECT_MAX_MS',
      30000,
    );
  }

  async start(publish: LivePublish): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    this.publish = publish;
    this.startedAt = new Date().toISOString();
    this.connectedAt = null;
    this.lastEventAt = this.startedAt;
    this.lastFrameAt = null;
    this.reconnectAttempt = 0;
    this.invokeId = 1;
    this.framesReceived = 0;
    this.feedMessagesReceived = 0;
    this.frameParseErrors = 0;
    this.topicDecodeErrors = 0;
    this.cookieJar.clear();
    this.topicMessageCount.clear();
    this.topicLastSeenAt.clear();
    this.initialStatePublished = false;

    publish({
      type: 'status',
      status: 'connecting',
      message: 'Connecting to Formula 1 live SignalR stream',
    });

    this.startHeartbeatLoop();
    await this.connectAndSubscribe();
  }

  stop(): Promise<void> {
    this.running = false;
    this.publish = null;
    this.connectedAt = null;
    this.clearReconnectTimer();

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      socket.removeAllListeners();
      socket.close();
    }

    return Promise.resolve();
  }

  getHealth(): LiveAdapterHealth {
    const topicMessageCount = Object.fromEntries(
      [...this.topicMessageCount.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
    const topicLastSeenAt = Object.fromEntries(
      [...this.topicLastSeenAt.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
    const connectionUptimeSec = this.connectedAt
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(this.connectedAt).getTime()) / 1000,
          ),
        )
      : null;

    return {
      running: this.running,
      startedAt: this.startedAt,
      lastEventAt: this.lastEventAt,
      tickMs: 0,
      heartbeatMs: this.heartbeatMs,
      seed: null,
      speedMultiplier: null,
      details: {
        baseUrl: this.baseUrl,
        hub: this.hubName,
        topics: this.topics,
        reconnectAttempt: this.reconnectAttempt,
        socketOpen: this.socket?.readyState === WebSocket.OPEN,
        connectedAt: this.connectedAt,
        connectionUptimeSec,
        lastFrameAt: this.lastFrameAt,
        framesReceived: this.framesReceived,
        feedMessagesReceived: this.feedMessagesReceived,
        frameParseErrors: this.frameParseErrors,
        topicDecodeErrors: this.topicDecodeErrors,
        cookieNames: [...this.cookieJar.keys()].sort((left, right) =>
          left.localeCompare(right),
        ),
        topicMessageCount,
        topicLastSeenAt,
      },
    };
  }

  private startHeartbeatLoop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      const now = new Date().toISOString();
      this.publish?.({ type: 'heartbeat', at: now });
    }, this.heartbeatMs);
  }

  private async connectAndSubscribe(): Promise<void> {
    if (!this.running) {
      return;
    }

    try {
      const negotiation = await this.negotiate();
      const socket = await this.openWebSocket(negotiation.ConnectionToken);
      this.attachSocketHandlers(socket);
      await this.startSignalrTransport(negotiation.ConnectionToken);
      this.sendSubscribe();

      this.reconnectAttempt = 0;
      this.connectedAt = new Date().toISOString();
      this.publish?.({
        type: 'status',
        status: 'live',
        message: 'Connected to Formula 1 live SignalR stream',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`SignalR connection failed: ${message}`);
      this.publish?.({
        type: 'status',
        status: 'degraded',
        message: `Live provider connection failed: ${message}`,
      });
      this.scheduleReconnect('connection failure');
    }
  }

  private createConnectionData(): string {
    return JSON.stringify([{ name: this.hubName }]);
  }

  private buildHttpUrl(path: string, connectionToken?: string): string {
    const url = new URL(
      path,
      this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`,
    );
    url.searchParams.set('clientProtocol', '1.5');
    url.searchParams.set('connectionData', this.createConnectionData());

    if (connectionToken) {
      url.searchParams.set('transport', 'webSockets');
      url.searchParams.set('connectionToken', connectionToken);
    }

    return url.toString();
  }

  private buildWebSocketUrl(connectionToken: string): string {
    const url = new URL(
      'connect',
      this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`,
    );
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('transport', 'webSockets');
    url.searchParams.set('clientProtocol', '1.5');
    url.searchParams.set('connectionData', this.createConnectionData());
    url.searchParams.set('connectionToken', connectionToken);
    url.searchParams.set('tid', `${Math.floor(Math.random() * 11)}`);
    return url.toString();
  }

  private getCookieHeader(): string | null {
    if (this.cookieJar.size === 0) {
      return null;
    }

    return [...this.cookieJar.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  private getRequestHeaders(): Record<string, string> | undefined {
    const cookieHeader = this.getCookieHeader();
    if (!cookieHeader) {
      return undefined;
    }

    return {
      Cookie: cookieHeader,
    };
  }

  private updateCookieJarFromHeaders(headers: Headers): void {
    const setCookieValues = readSetCookieValues(headers);
    const entries = extractCookieJarEntries(setCookieValues);

    for (const [name, value] of entries) {
      this.cookieJar.set(name, value);
    }
  }

  private async negotiate(): Promise<SignalrNegotiationResponse> {
    const url = this.buildHttpUrl('negotiate');
    const response = await fetch(url, {
      headers: this.getRequestHeaders(),
    });
    this.updateCookieJarFromHeaders(response.headers);
    if (!response.ok) {
      throw new Error(`negotiate failed (${response.status})`);
    }

    const payload =
      (await response.json()) as Partial<SignalrNegotiationResponse>;
    const token = asString(payload.ConnectionToken);
    if (!token) {
      throw new Error('negotiate response missing ConnectionToken');
    }

    return {
      ConnectionToken: token,
    };
  }

  private async openWebSocket(connectionToken: string): Promise<WebSocket> {
    const url = this.buildWebSocketUrl(connectionToken);
    const requestHeaders = this.getRequestHeaders();

    return new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(url, {
        handshakeTimeout: 15_000,
        headers: requestHeaders,
      });
      const timeout = setTimeout(() => {
        socket.removeAllListeners();
        socket.terminate();
        reject(new Error('websocket connect timeout'));
      }, 15_000);

      const cleanup = () => {
        clearTimeout(timeout);
        socket.removeAllListeners('open');
        socket.removeAllListeners('error');
      };

      socket.once('open', () => {
        cleanup();
        this.socket = socket;
        resolve(socket);
      });

      socket.once('error', (error: unknown) => {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  private async startSignalrTransport(connectionToken: string): Promise<void> {
    const url = this.buildHttpUrl('start', connectionToken);
    const response = await fetch(url, {
      headers: this.getRequestHeaders(),
    });
    this.updateCookieJarFromHeaders(response.headers);
    if (!response.ok) {
      throw new Error(`start failed (${response.status})`);
    }
  }

  private sendSubscribe(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const invocation = {
      H: this.hubName,
      M: 'Subscribe',
      A: [this.topics],
      I: this.invokeId++,
    };

    this.socket.send(JSON.stringify(invocation));
  }

  private attachSocketHandlers(socket: WebSocket): void {
    socket.on('message', (data: RawData) => {
      this.handleSocketMessage(data);
    });

    socket.on('error', (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`SignalR socket error: ${message}`);
    });

    socket.on('close', () => {
      if (!this.running) {
        return;
      }

      this.publish?.({
        type: 'status',
        status: 'degraded',
        message: 'Live provider stream disconnected, attempting reconnect',
      });
      this.scheduleReconnect('socket closed');
    });
  }

  private handleSocketMessage(data: RawData): void {
    const frameReceivedAt = new Date().toISOString();
    this.framesReceived += 1;
    this.lastFrameAt = frameReceivedAt;

    const rawText =
      typeof data === 'string'
        ? data
        : Buffer.isBuffer(data)
          ? data.toString('utf-8')
          : Array.isArray(data)
            ? Buffer.concat(
                data.map((chunk) =>
                  Buffer.isBuffer(chunk)
                    ? chunk
                    : Buffer.from(chunk as ArrayBuffer),
                ),
              ).toString('utf-8')
            : Buffer.from(data).toString('utf-8');

    const extraction = extractFeedMessagesFromRawTextWithStats(
      rawText,
      this.hubName,
    );
    this.frameParseErrors += extraction.invalidFrames;

    for (const message of extraction.messages) {
      this.feedMessagesReceived += 1;
      this.topicMessageCount.set(
        message.topic,
        (this.topicMessageCount.get(message.topic) ?? 0) + 1,
      );
      this.topicLastSeenAt.set(message.topic, message.emittedAt);
      if (message.decodeError) {
        this.topicDecodeErrors += 1;
      }

      const changedFields = this.accumulator.ingest(
        message.topic,
        message.payload,
        message.emittedAt,
      );
      this.lastEventAt = message.emittedAt;
      this.publishState(changedFields, message.emittedAt);
    }
  }

  private publishState(changedFields: string[], emittedAt: string): void {
    const state = this.accumulator.buildState(emittedAt);
    if (!state) {
      return;
    }

    if (!this.initialStatePublished) {
      this.publish?.({ type: 'initial_state', state });
      this.initialStatePublished = true;
      return;
    }

    this.publish?.({
      type: 'delta_update',
      state,
      changedFields,
    });
  }

  private scheduleReconnect(reason: string): void {
    if (!this.running || this.reconnectTimer) {
      return;
    }

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.close();
      this.socket = null;
    }

    this.connectedAt = null;

    this.reconnectAttempt += 1;
    const delay = Math.min(
      this.reconnectMaxMs,
      this.reconnectMinMs * 2 ** Math.max(0, this.reconnectAttempt - 1),
    );

    this.publish?.({
      type: 'status',
      status: 'connecting',
      message: `Reconnecting to live provider in ${delay}ms (${reason})`,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectAndSubscribe();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) {
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}
