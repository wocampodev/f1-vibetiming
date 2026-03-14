import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { inflateRawSync } from 'node:zlib';
import WebSocket, { RawData } from 'ws';
import { LiveAdapter, LivePublish } from './live.adapter';
import { LiveCaptureService } from './live.capture.service';
import { LIVE_DRIVER_ROSTER_BY_NUMBER } from './live.driver-roster';
import {
  DEFAULT_PROVIDER_LOG_MAX_CHARS,
  formatProviderLogValue,
  resolveProviderLogSettings,
} from './live.provider.logging';
import {
  LiveAdapterHealth,
  LiveFeedSource,
  LiveFlagStatus,
  LiveLeaderboardEntry,
  LiveMiniSector,
  LivePitState,
  LivePositionConfidence,
  LivePositionSource,
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

interface LiveLeaderboardDraftEntry extends LiveLeaderboardEntry {
  driverNumber: string;
  explicitPosition: number | null;
  previousResolvedMetadata: LiveResolvedPositionMetadata | null;
  fallbackPositionSource: LivePositionSource;
}

interface LiveResolvedPositionMetadata {
  position: number;
  source: LivePositionSource;
  updatedAt: string | null;
  confidence: LivePositionConfidence;
}

interface DisplayedSectorTimes {
  sector1Ms: number | null;
  sector2Ms: number | null;
  sector3Ms: number | null;
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
const TRUE_BOOLEAN_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_BOOLEAN_VALUES = new Set(['0', 'false', 'no', 'off']);

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): JsonRecord | null =>
  isRecord(value) ? value : null;

export { formatProviderLogValue } from './live.provider.logging';

const unwrapValueNode = (value: unknown): unknown => {
  const record = asRecord(value);
  if (!record) {
    return value;
  }

  return (
    record.Value ??
    record.value ??
    record.PreviousValue ??
    record.previousValue ??
    value
  );
};

const asTextValue = (value: unknown): string | null => {
  const direct = asString(value);
  if (direct) {
    return direct;
  }

  return asString(unwrapValueNode(value));
};

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

const parseBooleanValue = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return null;
  }

  if (TRUE_BOOLEAN_VALUES.has(normalized)) {
    return true;
  }

  if (FALSE_BOOLEAN_VALUES.has(normalized)) {
    return false;
  }

  return null;
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
  const raw = asTextValue(value);
  if (!raw) {
    const numeric = asNumber(unwrapValueNode(value));
    if (numeric == null) {
      return null;
    }

    if (numeric > 1000) {
      return Math.round(numeric);
    }

    return Math.round(numeric * 1000);
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
  const raw = asTextValue(value);
  if (!raw) {
    return asNumber(unwrapValueNode(value));
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

const parseGapText = (value: unknown): string | null => {
  const raw = asTextValue(value);
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-') {
    return null;
  }

  return trimmed;
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

const resolvePitState = (
  timing: JsonRecord | undefined,
  trackStatus: string | null,
): LivePitState | null => {
  const inPit = parseBooleanValue(timing?.InPit);
  if (inPit === true) {
    return 'in_pit';
  }

  const pitOut = parseBooleanValue(timing?.PitOut);
  if (pitOut === true) {
    return 'pit_out';
  }

  if (trackStatus === 'pit_lane') {
    return 'pit_lane';
  }
  if (trackStatus === 'pit_garage') {
    return 'pit_garage';
  }
  if (trackStatus === 'off_track') {
    return 'off_track';
  }
  if (trackStatus === 'stopped') {
    return 'stopped';
  }
  if (trackStatus === 'on_track') {
    return 'on_track';
  }

  return null;
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
  if (bestSectors.length > 0) {
    const node = bestSectors.at(index);
    return node ? parseLapOrSectorMs(node.Value ?? node) : null;
  }

  const bestSectorsRecord = asRecord(timingStats.BestSectors);
  if (!bestSectorsRecord) {
    return null;
  }

  const hasZeroBasedIndex = Object.prototype.hasOwnProperty.call(
    bestSectorsRecord,
    '0',
  );
  const preferredKey = hasZeroBasedIndex ? String(index) : String(index + 1);
  const secondaryKey = hasZeroBasedIndex ? String(index + 1) : String(index);
  const directNode =
    bestSectorsRecord[preferredKey] ?? bestSectorsRecord[secondaryKey];
  if (directNode !== undefined) {
    return parseLapOrSectorMs(directNode);
  }

  const numericNodes = Object.entries(bestSectorsRecord)
    .filter(([key]) => /^\d+$/.test(key))
    .sort(
      ([left], [right]) =>
        Number.parseInt(left, 10) - Number.parseInt(right, 10),
    );

  return parseLapOrSectorMs(numericNodes[index]?.[1]);
};

const parseTimingStatsBestLap = (
  timingStats: JsonRecord | undefined,
): number | null => {
  if (!timingStats) {
    return null;
  }

  return (
    parseLapOrSectorMs(timingStats.PersonalBestLapTime) ??
    parseLapOrSectorMs(timingStats.BestLapTime)
  );
};

const parseTimingGapField = (
  timing: JsonRecord | undefined,
  fieldNames: string[],
): number | null => {
  if (!timing) {
    return null;
  }

  for (const fieldName of fieldNames) {
    const parsed = parseGapSeconds(timing[fieldName]);
    if (parsed != null) {
      return parsed;
    }
  }

  return null;
};

const parseTimingGapTextField = (
  timing: JsonRecord | undefined,
  fieldNames: string[],
): string | null => {
  if (!timing) {
    return null;
  }

  for (const fieldName of fieldNames) {
    const parsed = parseGapText(timing[fieldName]);
    if (parsed != null) {
      return parsed;
    }
  }

  return null;
};

const parseMiniSectors = (timing: JsonRecord | undefined): LiveMiniSector[] => {
  const sectors = asRecord(timing?.Sectors);
  if (!sectors) {
    return [];
  }

  const miniSectors: LiveMiniSector[] = [];

  for (const [sectorKey, sectorValue] of Object.entries(sectors)) {
    const sector = asRecord(sectorValue);
    const segments = asRecord(sector?.Segments);
    if (!segments) {
      continue;
    }

    for (const [segmentKey, segmentValue] of Object.entries(segments)) {
      const rawStatus = toInt(asRecord(segmentValue)?.Status ?? segmentValue);
      if (rawStatus == null) {
        continue;
      }

      miniSectors.push({
        sector: Number.parseInt(sectorKey, 10) + 1,
        segment: Number.parseInt(segmentKey, 10),
        status: rawStatus,
        active: rawStatus !== 0,
      });
    }
  }

  miniSectors.sort(
    (left, right) => left.sector - right.sector || left.segment - right.segment,
  );

  return miniSectors;
};

const resolveFallbackPositionSource = (
  bestLapMs: number | null,
  lastLapMs: number | null,
): LivePositionSource => {
  if (bestLapMs != null) {
    return 'best_lap';
  }

  if (lastLapMs != null) {
    return 'last_lap';
  }

  return 'driver_code';
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
  private readonly explicitPositionUpdatedAtByNumber = new Map<
    string,
    string
  >();
  private readonly displayedSectorTimesByNumber = new Map<
    string,
    DisplayedSectorTimes
  >();
  private readonly resolvedPositionMetaByNumber = new Map<
    string,
    LiveResolvedPositionMetadata
  >();
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

          const explicitPosition = toInt(line.Position);
          if (explicitPosition != null) {
            this.explicitPositionUpdatedAtByNumber.set(number, emittedAt);
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
      const messageEntries: Array<[string, JsonRecord]> = messagesRecord
        ? Object.entries(messagesRecord).map(
            ([key, message]) => [key, message] as [string, JsonRecord],
          )
        : asRecordArray(record.Messages).map(
            (message, index) => [String(index), message] as const,
          );

      if (messageEntries.length > 0) {
        const nextMessages: LiveRaceControlMessage[] = [];

        for (const [key, message] of messageEntries) {
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

  getSessionMetadata() {
    return {
      weekendId: this.weekendId,
      sessionId: this.sessionId,
      sessionName: this.sessionName,
    };
  }

  buildState(emittedAt: string): LiveState | null {
    const numbers = new Set<string>([
      ...this.driverByNumber.keys(),
      ...this.timingByNumber.keys(),
    ]);

    const draftLeaderboard: LiveLeaderboardDraftEntry[] = [];

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

      const explicitPosition = toInt(timing.Position);
      const previousResolvedMetadata =
        this.resolvedPositionMetaByNumber.get(number) ?? null;

      const sectors = asRecord(timing.Sectors);
      const sector1 = asRecord(sectors?.['0']);
      const sector2 = asRecord(sectors?.['1']);
      const sector3 = asRecord(sectors?.['2']);
      const cachedSectorTimes = this.displayedSectorTimesByNumber.get(number);
      const parsedSector1Ms = parseLapOrSectorMs(sector1);
      const parsedSector2Ms = parseLapOrSectorMs(sector2);
      let parsedSector3Ms = parseLapOrSectorMs(sector3);
      const statsSector1Ms = parseTimingStatsSector(timingStats, 0);
      const statsSector2Ms = parseTimingStatsSector(timingStats, 1);
      const statsSector3Ms = parseTimingStatsSector(timingStats, 2);

      const lastLapMs = parseLapOrSectorMs(timing.LastLapTime);

      if (
        parsedSector3Ms == null &&
        parsedSector1Ms != null &&
        parsedSector2Ms != null &&
        lastLapMs != null
      ) {
        const derivedSector3Ms = lastLapMs - parsedSector1Ms - parsedSector2Ms;
        if (derivedSector3Ms > 0) {
          parsedSector3Ms = derivedSector3Ms;
        }
      }

      const sector1Ms =
        parsedSector1Ms ?? cachedSectorTimes?.sector1Ms ?? statsSector1Ms;
      const sector2Ms =
        parsedSector2Ms ?? cachedSectorTimes?.sector2Ms ?? statsSector2Ms;
      const sector3Ms =
        parsedSector3Ms ?? cachedSectorTimes?.sector3Ms ?? statsSector3Ms;
      const bestSector1Ms = statsSector1Ms ?? sector1Ms;
      const bestSector2Ms = statsSector2Ms ?? sector2Ms;
      const bestSector3Ms = statsSector3Ms ?? sector3Ms;

      this.displayedSectorTimesByNumber.set(number, {
        sector1Ms: parsedSector1Ms ?? cachedSectorTimes?.sector1Ms ?? null,
        sector2Ms: parsedSector2Ms ?? cachedSectorTimes?.sector2Ms ?? null,
        sector3Ms: parsedSector3Ms ?? cachedSectorTimes?.sector3Ms ?? null,
      });

      const bestLapMs =
        parseLapOrSectorMs(timing.BestLapTime) ??
        parseTimingStatsBestLap(timingStats) ??
        lastLapMs;
      const fallbackPositionSource = resolveFallbackPositionSource(
        bestLapMs,
        lastLapMs,
      );

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

      const gapToLeaderSec = parseTimingGapField(timing, [
        'GapToLeader',
        'TimeDiffToFastest',
        'TimeDifftoFastest',
        'TimeDiffToFirst',
        'TimeDifftoFirst',
      ]);
      const gapToLeaderText = parseTimingGapTextField(timing, [
        'GapToLeader',
        'TimeDiffToFastest',
        'TimeDifftoFastest',
        'TimeDiffToFirst',
        'TimeDifftoFirst',
      ]);

      const intervalToAheadSec = parseTimingGapField(timing, [
        'IntervalToPositionAhead',
        'TimeDiffToPositionAhead',
        'TimeDifftoPositionAhead',
        'GapToPositionAhead',
        'TimeDiffToCarAhead',
      ]);
      const intervalToAheadText = parseTimingGapTextField(timing, [
        'IntervalToPositionAhead',
        'TimeDiffToPositionAhead',
        'TimeDifftoPositionAhead',
        'GapToPositionAhead',
        'TimeDiffToCarAhead',
      ]);

      const rawStints = timingApp ? timingApp.Stints : null;
      const stints: unknown[] = Array.isArray(rawStints)
        ? rawStints
        : isRecord(rawStints)
          ? Object.values(rawStints).reduce<unknown[]>((accumulator, value) => {
              if (Array.isArray(value)) {
                for (const item of value) {
                  accumulator.push(item);
                }
              } else if (isRecord(value)) {
                accumulator.push(value);
              }
              return accumulator;
            }, [])
          : [];
      const latestStint =
        stints.length > 0 ? asRecord(stints[stints.length - 1]) : null;
      const pitState = resolvePitState(timing, trackStatus);
      const miniSectors = parseMiniSectors(timing);
      const completedLaps =
        toInt(timing.NumberOfLaps) ?? toInt(latestStint?.LapNumber);

      const firstName = asString(driver?.FirstName);
      const lastName = asString(driver?.LastName);
      const combinedName = [firstName, lastName]
        .filter((value) => Boolean(value))
        .join(' ')
        .trim();
      const rosterEntry = LIVE_DRIVER_ROSTER_BY_NUMBER[number];

      draftLeaderboard.push({
        driverNumber: number,
        position: explicitPosition ?? 0,
        driverCode:
          asString(driver?.Tla) ?? asString(driver?.RacingNumber) ?? number,
        driverName:
          asString(driver?.FullName) ??
          (combinedName.length > 0 ? combinedName : null) ??
          asString(driver?.BroadcastName) ??
          rosterEntry?.driverName ??
          null,
        teamName: asString(driver?.TeamName) ?? rosterEntry?.teamName ?? null,
        trackStatus,
        pitState,
        pitStops: toInt(timing.NumberOfPitStops),
        speedKph,
        topSpeedKph,
        gapToLeaderSec,
        gapToLeaderText,
        intervalToAheadSec,
        intervalToAheadText,
        sector1Ms,
        sector2Ms,
        sector3Ms,
        bestSector1Ms,
        bestSector2Ms,
        bestSector3Ms,
        lastLapMs,
        bestLapMs,
        completedLaps,
        speedHistoryKph,
        trackStatusHistory: resolvedTrackStatusHistory,
        miniSectors,
        tireCompound:
          normalizeCompound(latestStint?.Compound) ??
          normalizeCompound(timing.Compound),
        stintLap: toInt(latestStint?.TotalLaps),
        tireIsNew: parseBooleanValue(latestStint?.New),
        positionSource:
          explicitPosition != null
            ? 'timing_data'
            : (previousResolvedMetadata?.source ?? fallbackPositionSource),
        positionUpdatedAt:
          explicitPosition != null
            ? (this.explicitPositionUpdatedAtByNumber.get(number) ?? emittedAt)
            : (previousResolvedMetadata?.updatedAt ??
              (fallbackPositionSource === 'driver_code' ? null : emittedAt)),
        positionConfidence:
          explicitPosition != null
            ? 'high'
            : (previousResolvedMetadata?.confidence ?? 'low'),
        explicitPosition,
        previousResolvedMetadata,
        fallbackPositionSource,
      });
    }

    const explicitPositions = draftLeaderboard
      .map((entry) => entry.explicitPosition)
      .filter(
        (position): position is number => position != null && position > 0,
      );
    const hasExplicitOrder = explicitPositions.length > 0;

    draftLeaderboard.sort((left, right) => {
      if (hasExplicitOrder) {
        if (
          left.explicitPosition != null &&
          right.explicitPosition != null &&
          left.explicitPosition !== right.explicitPosition
        ) {
          return left.explicitPosition - right.explicitPosition;
        }

        if (left.explicitPosition != null && right.explicitPosition == null) {
          return -1;
        }

        if (left.explicitPosition == null && right.explicitPosition != null) {
          return 1;
        }
      }

      if (
        left.previousResolvedMetadata?.position != null &&
        right.previousResolvedMetadata?.position != null &&
        left.previousResolvedMetadata.position !==
          right.previousResolvedMetadata.position
      ) {
        return (
          left.previousResolvedMetadata.position -
          right.previousResolvedMetadata.position
        );
      }

      if (
        left.previousResolvedMetadata?.position != null &&
        right.previousResolvedMetadata?.position == null
      ) {
        return -1;
      }

      if (
        left.previousResolvedMetadata?.position == null &&
        right.previousResolvedMetadata?.position != null
      ) {
        return 1;
      }

      const leftBestLap = left.bestLapMs ?? Number.MAX_SAFE_INTEGER;
      const rightBestLap = right.bestLapMs ?? Number.MAX_SAFE_INTEGER;
      if (leftBestLap !== rightBestLap) {
        return leftBestLap - rightBestLap;
      }

      const leftLastLap = left.lastLapMs ?? Number.MAX_SAFE_INTEGER;
      const rightLastLap = right.lastLapMs ?? Number.MAX_SAFE_INTEGER;
      if (leftLastLap !== rightLastLap) {
        return leftLastLap - rightLastLap;
      }

      return left.driverCode.localeCompare(right.driverCode);
    });

    const leaderboard: LiveLeaderboardEntry[] = [];
    const nextResolvedPositions = new Map<
      string,
      LiveResolvedPositionMetadata
    >();
    const assignedPositions = new Set<number>();
    let nextFallbackPosition = 1;

    for (const entry of draftLeaderboard) {
      let resolvedPositionMetadata: LiveResolvedPositionMetadata;

      if (
        hasExplicitOrder &&
        entry.explicitPosition != null &&
        entry.explicitPosition > 0 &&
        !assignedPositions.has(entry.explicitPosition)
      ) {
        resolvedPositionMetadata = {
          position: entry.explicitPosition,
          source: 'timing_data',
          updatedAt:
            this.explicitPositionUpdatedAtByNumber.get(entry.driverNumber) ??
            emittedAt,
          confidence: 'high',
        };
      } else if (
        entry.previousResolvedMetadata != null &&
        entry.previousResolvedMetadata.position > 0 &&
        !assignedPositions.has(entry.previousResolvedMetadata.position)
      ) {
        resolvedPositionMetadata = {
          ...entry.previousResolvedMetadata,
          confidence:
            entry.previousResolvedMetadata.source === 'timing_data'
              ? 'medium'
              : entry.previousResolvedMetadata.confidence,
        };
      } else {
        while (assignedPositions.has(nextFallbackPosition)) {
          nextFallbackPosition += 1;
        }
        resolvedPositionMetadata = {
          position: nextFallbackPosition,
          source: entry.fallbackPositionSource,
          updatedAt:
            entry.fallbackPositionSource === 'driver_code' ? null : emittedAt,
          confidence: 'low',
        };
      }

      assignedPositions.add(resolvedPositionMetadata.position);
      const leaderboardEntry = {
        ...entry,
      } as LiveLeaderboardEntry & {
        driverNumber?: string;
        explicitPosition?: number | null;
        previousResolvedMetadata?: LiveResolvedPositionMetadata | null;
        fallbackPositionSource?: LivePositionSource;
      };
      delete leaderboardEntry.explicitPosition;
      delete leaderboardEntry.previousResolvedMetadata;
      delete leaderboardEntry.fallbackPositionSource;
      leaderboard.push({
        ...leaderboardEntry,
        position: resolvedPositionMetadata.position,
        positionSource: resolvedPositionMetadata.source,
        positionUpdatedAt: resolvedPositionMetadata.updatedAt,
        positionConfidence: resolvedPositionMetadata.confidence,
      });
      nextResolvedPositions.set(entry.driverNumber, resolvedPositionMetadata);
    }

    this.resolvedPositionMetaByNumber.clear();
    for (const [number, metadata] of nextResolvedPositions.entries()) {
      this.resolvedPositionMetaByNumber.set(number, metadata);
    }

    leaderboard.sort((a, b) => a.position - b.position);

    const leader = leaderboard.at(0);
    if (leader?.lastLapMs != null) {
      for (let index = 1; index < leaderboard.length; index += 1) {
        const current = leaderboard[index];
        if (!current) {
          continue;
        }

        if (current.gapToLeaderSec == null && current.lastLapMs != null) {
          const fallbackGapSec = Number(
            ((current.lastLapMs - leader.lastLapMs) / 1000).toFixed(3),
          );
          if (fallbackGapSec >= 0) {
            current.gapToLeaderSec = fallbackGapSec;
            current.gapToLeaderText = `+${fallbackGapSec.toFixed(3)}`;
          }
        }

        const previous = leaderboard[index - 1];
        if (
          current.intervalToAheadSec == null &&
          current.lastLapMs != null &&
          previous?.lastLapMs != null
        ) {
          const fallbackIntervalSec = Number(
            ((current.lastLapMs - previous.lastLapMs) / 1000).toFixed(3),
          );
          if (fallbackIntervalSec >= 0) {
            current.intervalToAheadSec = fallbackIntervalSec;
            current.intervalToAheadText = `+${fallbackIntervalSec.toFixed(3)}`;
          }
        }
      }
    }

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
  private readonly logFrames: boolean;
  private readonly logMessages: boolean;
  private readonly logMaxChars: number;

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

  constructor(
    private readonly configService: ConfigService,
    private readonly liveCaptureService: LiveCaptureService,
  ) {
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
    const logSettings = resolveProviderLogSettings({
      modeValue: this.configService.get<string>('LIVE_PROVIDER_LOG', 'off'),
      legacyFramesValue: this.configService.get<string>(
        'LIVE_PROVIDER_LOG_FRAMES',
      ),
      legacyMessagesValue: this.configService.get<string>(
        'LIVE_PROVIDER_LOG_MESSAGES',
      ),
      maxCharsValue: this.configService.get<string>(
        'LIVE_PROVIDER_LOG_MAX_CHARS',
        String(DEFAULT_PROVIDER_LOG_MAX_CHARS),
      ),
    });
    this.logFrames = logSettings.framesEnabled;
    this.logMessages = logSettings.messagesEnabled;
    this.logMaxChars = logSettings.maxChars;
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
    await this.liveCaptureService.startProviderCapture();

    publish({
      type: 'status',
      status: 'connecting',
      message: 'Connecting to Formula 1 live SignalR stream',
    });

    this.startHeartbeatLoop();
    await this.connectAndSubscribe();
  }

  async stop(): Promise<void> {
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

    await this.liveCaptureService.completeProviderCapture();
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
      if (this.logFrames || this.logMessages) {
        this.logger.log(
          `Provider payload logging enabled (frames=${this.logFrames}, messages=${this.logMessages}, maxChars=${this.logMaxChars})`,
        );
      }
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
    this.logProviderFrame(frameReceivedAt, rawText, extraction);

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
      this.liveCaptureService.recordProviderMessage(
        message,
        this.accumulator.getSessionMetadata(),
        changedFields,
      );
      this.logProviderMessage(message, changedFields);
      this.lastEventAt = message.emittedAt;
      this.publishState(changedFields, message.emittedAt);
    }
  }

  private logProviderFrame(
    frameReceivedAt: string,
    rawText: string,
    extraction: SignalrFeedExtractionResult,
  ): void {
    if (!this.logFrames) {
      return;
    }

    const preview = formatProviderLogValue(rawText, this.logMaxChars);
    this.logger.log(
      `Provider frame at=${frameReceivedAt} extractedMessages=${extraction.messages.length} invalidFrames=${extraction.invalidFrames} preview=${preview}`,
    );
  }

  private logProviderMessage(
    message: SignalrFeedMessage,
    changedFields: string[],
  ): void {
    if (!this.logMessages) {
      return;
    }

    const changed = changedFields.length > 0 ? changedFields.join(',') : 'none';
    const payload = formatProviderLogValue(message.payload, this.logMaxChars);
    this.logger.log(
      `Provider message topic=${message.topic} rawTopic=${message.rawTopic} at=${message.emittedAt} decodeError=${message.decodeError} changed=${changed} payload=${payload}`,
    );
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
