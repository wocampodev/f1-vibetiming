import { LiveSpeedSample, LiveTrackStatusSample } from './live.types';

export type JsonRecord = Record<string, unknown>;

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
