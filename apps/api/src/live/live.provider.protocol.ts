import { inflateRawSync } from 'node:zlib';

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

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): JsonRecord | null =>
  isRecord(value) ? value : null;

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const toIso = (value: unknown, fallback = new Date().toISOString()): string => {
  const raw = asString(value);
  if (!raw) {
    return fallback;
  }

  const timestamp = new Date(raw);
  return Number.isNaN(timestamp.getTime()) ? fallback : timestamp.toISOString();
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

export const readSetCookieValues = (headers: Headers): string[] => {
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
