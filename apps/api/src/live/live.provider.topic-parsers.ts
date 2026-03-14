import {
  LiveFlagStatus,
  LiveLeaderboardEntry,
  LiveMiniSector,
  LivePitState,
  LivePositionSource,
  LiveRaceControlMessage,
} from './live.types';
import {
  asRecord,
  asRecordArray,
  asString,
  JsonRecord,
  parseBooleanValue,
  parseGapSeconds,
  parseGapText,
  parseLapOrSectorMs,
  parseSpeedKph,
  toInt,
  toIso,
} from './live.provider.values';

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
