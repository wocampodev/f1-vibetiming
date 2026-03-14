import { LIVE_DRIVER_ROSTER_BY_NUMBER } from './live.driver-roster';
import {
  appendTrackStatusHistoryPoint,
  asRecord,
  asString,
  isRecord,
  JsonRecord,
  normalizeCompound,
  normalizeTrackStatus,
  parseBooleanValue,
  parseLapOrSectorMs,
  parseMiniSectors,
  parseSpeedKph,
  parseTimingGapField,
  parseTimingGapTextField,
  parseTimingStatsBestLap,
  parseTimingStatsSector,
  parseTopSpeedKphFromStats,
  resolveFallbackPositionSource,
  resolvePitState,
  toInt,
} from './live.provider.parsers';
import {
  LiveLeaderboardEntry,
  LivePositionConfidence,
  LivePositionSource,
  LiveSpeedSample,
  LiveTrackStatusSample,
} from './live.types';

export interface LiveResolvedPositionMetadata {
  position: number;
  source: LivePositionSource;
  updatedAt: string | null;
  confidence: LivePositionConfidence;
}

export interface DisplayedSectorTimes {
  sector1Ms: number | null;
  sector2Ms: number | null;
  sector3Ms: number | null;
}

export interface LiveLeaderboardDraftEntry extends LiveLeaderboardEntry {
  driverNumber: string;
  explicitPosition: number | null;
  previousResolvedMetadata: LiveResolvedPositionMetadata | null;
  fallbackPositionSource: LivePositionSource;
}

export interface BuildDraftLeaderboardEntryInput {
  driverNumber: string;
  driver: JsonRecord | undefined;
  timing: JsonRecord | undefined;
  timingStats: JsonRecord | undefined;
  timingApp: JsonRecord | undefined;
  carData: JsonRecord | undefined;
  positionData: JsonRecord | undefined;
  previousResolvedMetadata: LiveResolvedPositionMetadata | null;
  cachedSectorTimes: DisplayedSectorTimes | undefined;
  explicitPositionUpdatedAt: string | null;
  speedHistoryKph: LiveSpeedSample[];
  trackStatusHistory: LiveTrackStatusSample[];
  emittedAt: string;
}

export interface BuildDraftLeaderboardEntryResult {
  entry: LiveLeaderboardDraftEntry | null;
  displayedSectorTimes: DisplayedSectorTimes | null;
}

const flattenStints = (rawStints: unknown): unknown[] => {
  if (Array.isArray(rawStints)) {
    return rawStints;
  }

  if (!isRecord(rawStints)) {
    return [];
  }

  return Object.values(rawStints).reduce<unknown[]>((accumulator, value) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        accumulator.push(item);
      }
    } else if (isRecord(value)) {
      accumulator.push(value);
    }

    return accumulator;
  }, []);
};

export const buildDraftLeaderboardEntry = (
  input: BuildDraftLeaderboardEntryInput,
): BuildDraftLeaderboardEntryResult => {
  if (!input.timing) {
    return {
      entry: null,
      displayedSectorTimes: null,
    };
  }

  const explicitPosition = toInt(input.timing.Position);
  const sectors = asRecord(input.timing.Sectors);
  const sector1 = asRecord(sectors?.['0']);
  const sector2 = asRecord(sectors?.['1']);
  const sector3 = asRecord(sectors?.['2']);
  const parsedSector1Ms = parseLapOrSectorMs(sector1);
  const parsedSector2Ms = parseLapOrSectorMs(sector2);
  let parsedSector3Ms = parseLapOrSectorMs(sector3);
  const statsSector1Ms = parseTimingStatsSector(input.timingStats, 0);
  const statsSector2Ms = parseTimingStatsSector(input.timingStats, 1);
  const statsSector3Ms = parseTimingStatsSector(input.timingStats, 2);

  const lastLapMs = parseLapOrSectorMs(input.timing.LastLapTime);
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
    parsedSector1Ms ?? input.cachedSectorTimes?.sector1Ms ?? statsSector1Ms;
  const sector2Ms =
    parsedSector2Ms ?? input.cachedSectorTimes?.sector2Ms ?? statsSector2Ms;
  const sector3Ms =
    parsedSector3Ms ?? input.cachedSectorTimes?.sector3Ms ?? statsSector3Ms;
  const bestSector1Ms = statsSector1Ms ?? sector1Ms;
  const bestSector2Ms = statsSector2Ms ?? sector2Ms;
  const bestSector3Ms = statsSector3Ms ?? sector3Ms;

  const displayedSectorTimes: DisplayedSectorTimes = {
    sector1Ms: parsedSector1Ms ?? input.cachedSectorTimes?.sector1Ms ?? null,
    sector2Ms: parsedSector2Ms ?? input.cachedSectorTimes?.sector2Ms ?? null,
    sector3Ms: parsedSector3Ms ?? input.cachedSectorTimes?.sector3Ms ?? null,
  };

  const bestLapMs =
    parseLapOrSectorMs(input.timing.BestLapTime) ??
    parseTimingStatsBestLap(input.timingStats) ??
    lastLapMs;
  const fallbackPositionSource = resolveFallbackPositionSource(
    bestLapMs,
    lastLapMs,
  );

  const channels = asRecord(input.carData?.Channels);
  const speedKph =
    parseSpeedKph(channels?.['2']) ?? input.speedHistoryKph.at(-1)?.kph ?? null;
  const topSpeedKph =
    parseTopSpeedKphFromStats(input.timingStats) ??
    speedKph ??
    parseSpeedKph(asRecord(input.timingStats?.Speeds)?.ST);
  const normalizedTrackStatus = normalizeTrackStatus(
    input.positionData?.Status,
  );
  const resolvedTrackStatusHistory = normalizedTrackStatus
    ? appendTrackStatusHistoryPoint(input.trackStatusHistory, {
        at: input.emittedAt,
        status: normalizedTrackStatus,
      })
    : input.trackStatusHistory;
  const trackStatus =
    normalizedTrackStatus ?? resolvedTrackStatusHistory.at(-1)?.status ?? null;

  const gapToLeaderSec = parseTimingGapField(input.timing, [
    'GapToLeader',
    'TimeDiffToFastest',
    'TimeDifftoFastest',
    'TimeDiffToFirst',
    'TimeDifftoFirst',
  ]);
  const gapToLeaderText = parseTimingGapTextField(input.timing, [
    'GapToLeader',
    'TimeDiffToFastest',
    'TimeDifftoFastest',
    'TimeDiffToFirst',
    'TimeDifftoFirst',
  ]);

  const intervalToAheadSec = parseTimingGapField(input.timing, [
    'IntervalToPositionAhead',
    'TimeDiffToPositionAhead',
    'TimeDifftoPositionAhead',
    'GapToPositionAhead',
    'TimeDiffToCarAhead',
  ]);
  const intervalToAheadText = parseTimingGapTextField(input.timing, [
    'IntervalToPositionAhead',
    'TimeDiffToPositionAhead',
    'TimeDifftoPositionAhead',
    'GapToPositionAhead',
    'TimeDiffToCarAhead',
  ]);

  const stints = flattenStints(input.timingApp?.Stints);
  const latestStint =
    stints.length > 0 ? asRecord(stints[stints.length - 1]) : null;
  const pitState = resolvePitState(input.timing, trackStatus);
  const miniSectors = parseMiniSectors(input.timing);
  const completedLaps =
    toInt(input.timing.NumberOfLaps) ?? toInt(latestStint?.LapNumber);

  const firstName = asString(input.driver?.FirstName);
  const lastName = asString(input.driver?.LastName);
  const combinedName = [firstName, lastName]
    .filter((value) => Boolean(value))
    .join(' ')
    .trim();
  const rosterEntry = LIVE_DRIVER_ROSTER_BY_NUMBER[input.driverNumber];

  return {
    displayedSectorTimes,
    entry: {
      driverNumber: input.driverNumber,
      position: explicitPosition ?? 0,
      driverCode:
        asString(input.driver?.Tla) ??
        asString(input.driver?.RacingNumber) ??
        input.driverNumber,
      driverName:
        asString(input.driver?.FullName) ??
        (combinedName.length > 0 ? combinedName : null) ??
        asString(input.driver?.BroadcastName) ??
        rosterEntry?.driverName ??
        null,
      teamName:
        asString(input.driver?.TeamName) ?? rosterEntry?.teamName ?? null,
      trackStatus,
      pitState,
      pitStops: toInt(input.timing.NumberOfPitStops),
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
      speedHistoryKph: input.speedHistoryKph,
      trackStatusHistory: resolvedTrackStatusHistory,
      miniSectors,
      tireCompound:
        normalizeCompound(latestStint?.Compound) ??
        normalizeCompound(input.timing.Compound),
      stintLap: toInt(latestStint?.TotalLaps),
      tireIsNew: parseBooleanValue(latestStint?.New),
      positionSource:
        explicitPosition != null
          ? 'timing_data'
          : (input.previousResolvedMetadata?.source ?? fallbackPositionSource),
      positionUpdatedAt:
        explicitPosition != null
          ? (input.explicitPositionUpdatedAt ?? input.emittedAt)
          : (input.previousResolvedMetadata?.updatedAt ??
            (fallbackPositionSource === 'driver_code'
              ? null
              : input.emittedAt)),
      positionConfidence:
        explicitPosition != null
          ? 'high'
          : (input.previousResolvedMetadata?.confidence ?? 'low'),
      explicitPosition,
      previousResolvedMetadata: input.previousResolvedMetadata,
      fallbackPositionSource,
    },
  };
};
