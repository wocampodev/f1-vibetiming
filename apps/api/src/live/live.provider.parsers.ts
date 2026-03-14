import {
  LiveFlagStatus,
  LiveLeaderboardEntry,
  LiveMiniSector,
  LivePitState,
  LivePositionSource,
  LiveRaceControlMessage,
  LiveSpeedSample,
  LiveTrackStatusSample,
} from './live.types';

export type JsonRecord = Record<string, unknown>;

export const TRACK_STATUS_FLAG_MAP: Record<string, LiveFlagStatus> = {
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

export const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const asRecord = (value: unknown): JsonRecord | null =>
  isRecord(value) ? value : null;

export const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

export const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

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

export const parseBooleanValue = (value: unknown): boolean | null => {
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

export const asRecordArray = (value: unknown): JsonRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is JsonRecord => isRecord(item));
};

export const toInt = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
};

export const toIso = (
  value: unknown,
  fallback = new Date().toISOString(),
): string => {
  const raw = asString(value);
  if (!raw) {
    return fallback;
  }

  const timestamp = new Date(raw);
  return Number.isNaN(timestamp.getTime()) ? fallback : timestamp.toISOString();
};

export const parseLapOrSectorMs = (value: unknown): number | null => {
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

export const parseGapSeconds = (value: unknown): number | null => {
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

export const parseGapText = (value: unknown): string | null => {
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

export const parseSpeedKph = (value: unknown): number | null => {
  const parsed = asNumber(value);
  if (parsed == null) {
    return null;
  }

  return Math.round(parsed);
};

export const normalizeTrackStatus = (value: unknown): string | null => {
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

export const resolvePitState = (
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

export const normalizeFlag = (value: unknown): LiveFlagStatus | null => {
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

export const normalizeCompound = (
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

export const parseTopSpeedKphFromStats = (
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

export const parseTimingStatsSector = (
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

export const parseTimingStatsBestLap = (
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

export const parseTimingGapField = (
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

export const parseTimingGapTextField = (
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

export const parseMiniSectors = (
  timing: JsonRecord | undefined,
): LiveMiniSector[] => {
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

export const resolveFallbackPositionSource = (
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

export const mergeRecords = (
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

export const appendSpeedHistoryPoint = (
  history: LiveSpeedSample[],
  point: LiveSpeedSample,
): LiveSpeedSample[] => {
  const next = [...history, point];
  return next.slice(-MAX_SPEED_HISTORY_POINTS);
};

export const appendTrackStatusHistoryPoint = (
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

export const buildRaceControlMessages = (
  record: JsonRecord,
  emittedAt: string,
): LiveRaceControlMessage[] => {
  const messagesRecord = asRecord(record.Messages);
  const messageEntries: Array<[string, JsonRecord]> = messagesRecord
    ? Object.entries(messagesRecord).map(
        ([key, message]) => [key, message] as [string, JsonRecord],
      )
    : asRecordArray(record.Messages).map(
        (message, index) => [String(index), message] as const,
      );

  if (messageEntries.length === 0) {
    return [];
  }

  const nextMessages: LiveRaceControlMessage[] = [];

  for (const [key, message] of messageEntries) {
    const emitted = toIso(message.Utc, emittedAt);
    const text = asString(message.Message) ?? asString(message.Status);
    if (!text) {
      continue;
    }

    const categoryRaw = (asString(message.Category) ?? 'control').toLowerCase();
    const category: LiveRaceControlMessage['category'] = categoryRaw.includes(
      'incident',
    )
      ? 'incident'
      : categoryRaw.includes('pit')
        ? 'pit'
        : categoryRaw.includes('flag')
          ? 'flag'
          : 'control';

    const flag = normalizeFlag(message.Flag) ?? normalizeFlag(message.Message);

    nextMessages.push({
      id: asString(message.MessageId) ?? `rc-${key}-${emitted}`,
      emittedAt: emitted,
      category,
      message: text,
      flag: flag ?? undefined,
    });
  }

  nextMessages.sort((a, b) => (a.emittedAt < b.emittedAt ? 1 : -1));
  return nextMessages.slice(0, MAX_RACE_CONTROL_MESSAGES);
};
