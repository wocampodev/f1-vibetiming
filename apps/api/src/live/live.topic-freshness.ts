import { LiveTopicFreshnessState } from './live.types';

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeTopicName = (topic: string): string => topic.replace(/\.z$/, '');

const toStringMap = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => typeof entry === 'string')
      .map(([key, entry]) => [normalizeTopicName(key), entry]),
  ) as Record<string, string>;
};

const toNumberMap = (value: unknown): Record<string, number> => {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([, entry]) => typeof entry === 'number' && Number.isFinite(entry),
      )
      .map(([key, entry]) => [normalizeTopicName(key), entry]),
  ) as Record<string, number>;
};

const toTopicList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => normalizeTopicName(entry));
};

export const buildLiveTopicFreshness = (
  capturedAt: string,
  details: unknown,
): LiveTopicFreshnessState | null => {
  if (!isRecord(details)) {
    return null;
  }

  const configuredTopics = toTopicList(details.topics);
  const topicLastSeenAt = toStringMap(details.topicLastSeenAt);
  const topicMessageCount = toNumberMap(details.topicMessageCount);
  const topicNames = [
    ...new Set([
      ...configuredTopics,
      ...Object.keys(topicLastSeenAt),
      ...Object.keys(topicMessageCount),
    ]),
  ].sort((left, right) => left.localeCompare(right));

  if (topicNames.length === 0) {
    return null;
  }

  return {
    capturedAt,
    topics: topicNames.map((topic) => ({
      topic,
      lastSeenAt: topicLastSeenAt[topic] ?? null,
      messageCount: topicMessageCount[topic] ?? 0,
    })),
  };
};
