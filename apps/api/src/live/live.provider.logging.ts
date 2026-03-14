export type LiveProviderLogMode = 'off' | 'frames' | 'messages' | 'all';

export interface LiveProviderLogSettings {
  mode: LiveProviderLogMode;
  framesEnabled: boolean;
  messagesEnabled: boolean;
  maxChars: number;
}

export const DEFAULT_PROVIDER_LOG_MAX_CHARS = 600;

const TRUE_CONFIG_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_CONFIG_VALUES = new Set(['0', 'false', 'no', 'off']);

const parseBooleanConfigValue = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return fallback;
  }

  if (TRUE_CONFIG_VALUES.has(normalized)) {
    return true;
  }

  if (FALSE_CONFIG_VALUES.has(normalized)) {
    return false;
  }

  return fallback;
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

export const parseProviderLogMaxChars = (value: unknown): number => {
  const parsed = toInt(value);
  if (parsed == null || parsed < 80) {
    return DEFAULT_PROVIDER_LOG_MAX_CHARS;
  }

  return parsed;
};

export const parseProviderLogMode = (
  value: unknown,
  fallback: LiveProviderLogMode = 'off',
): LiveProviderLogMode => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'off' ||
    normalized === 'frames' ||
    normalized === 'messages' ||
    normalized === 'all'
  ) {
    return normalized;
  }

  return fallback;
};

const parseProviderLogModeOrNull = (
  value: unknown,
): LiveProviderLogMode | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'off' ||
    normalized === 'frames' ||
    normalized === 'messages' ||
    normalized === 'all'
  ) {
    return normalized;
  }

  return null;
};

const resolveLegacyProviderLogMode = (
  framesValue: unknown,
  messagesValue: unknown,
): LiveProviderLogMode => {
  const logFrames = parseBooleanConfigValue(framesValue, false);
  const logMessages = parseBooleanConfigValue(messagesValue, false);

  if (logFrames && logMessages) {
    return 'all';
  }

  if (logFrames) {
    return 'frames';
  }

  if (logMessages) {
    return 'messages';
  }

  return 'off';
};

export const resolveProviderLogSettings = (input: {
  modeValue: unknown;
  legacyFramesValue?: unknown;
  legacyMessagesValue?: unknown;
  maxCharsValue: unknown;
}): LiveProviderLogSettings => {
  const mode =
    parseProviderLogModeOrNull(input.modeValue) ??
    resolveLegacyProviderLogMode(
      input.legacyFramesValue,
      input.legacyMessagesValue,
    );

  return {
    mode,
    framesEnabled: mode === 'frames' || mode === 'all',
    messagesEnabled: mode === 'messages' || mode === 'all',
    maxChars: parseProviderLogMaxChars(input.maxCharsValue),
  };
};

export const formatProviderLogValue = (
  value: unknown,
  maxChars: number,
): string => {
  const limit = Math.max(80, Math.trunc(maxChars));

  let serialized: string;
  if (typeof value === 'string') {
    serialized = value;
  } else {
    try {
      const json = JSON.stringify(value);
      serialized = typeof json === 'string' ? json : String(value);
    } catch {
      serialized = String(value);
    }
  }

  const normalized = serialized.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) {
    return '(empty)';
  }

  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit - 3)}...`;
};
