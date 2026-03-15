import {
  LiveLeaderboardDraftEntry,
  LiveResolvedPositionMetadata,
} from './live.provider.leaderboard.draft';
import { LiveLeaderboardEntry, LivePositionSource } from './live.types';

export interface ResolveLeaderboardResult {
  leaderboard: LiveLeaderboardEntry[];
  resolvedPositionMetaByNumber: Map<string, LiveResolvedPositionMetadata>;
}

const LEADER_GAP_PATTERN = /^LAP\s+\d+$/i;

const isTimingDataLeaderCandidate = (
  entry: LiveLeaderboardDraftEntry,
): boolean => {
  if (entry.explicitPosition != null) {
    return false;
  }

  return LEADER_GAP_PATTERN.test(entry.gapToLeaderText ?? '');
};

export const sortDraftLeaderboard = (
  draftLeaderboard: LiveLeaderboardDraftEntry[],
): boolean => {
  const explicitPositions = draftLeaderboard
    .map((entry) => entry.explicitPosition)
    .filter((position): position is number => position != null && position > 0);
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

  return hasExplicitOrder;
};

export const resolveLeaderboard = (
  draftLeaderboard: LiveLeaderboardDraftEntry[],
  emittedAt: string,
): ResolveLeaderboardResult => {
  const hasExplicitOrder = sortDraftLeaderboard(draftLeaderboard);
  const leaderboard: LiveLeaderboardEntry[] = [];
  const resolvedPositionMetaByNumber = new Map<
    string,
    LiveResolvedPositionMetadata
  >();
  const assignedPositions = new Set<number>();
  let nextFallbackPosition = 1;

  for (const entry of draftLeaderboard) {
    const resolvedPositionMetadata = resolveEntryPosition({
      entry,
      emittedAt,
      hasExplicitOrder,
      assignedPositions,
      nextFallbackPosition,
    });

    assignedPositions.add(resolvedPositionMetadata.position);
    if (resolvedPositionMetadata.position >= nextFallbackPosition) {
      nextFallbackPosition = resolvedPositionMetadata.position + 1;
    }

    leaderboard.push(
      toResolvedLeaderboardEntry(entry, resolvedPositionMetadata),
    );
    resolvedPositionMetaByNumber.set(
      entry.driverNumber,
      resolvedPositionMetadata,
    );
  }

  leaderboard.sort((left, right) => left.position - right.position);
  applyDerivedLapGaps(leaderboard);

  return {
    leaderboard,
    resolvedPositionMetaByNumber,
  };
};

const resolveEntryPosition = (input: {
  entry: LiveLeaderboardDraftEntry;
  emittedAt: string;
  hasExplicitOrder: boolean;
  assignedPositions: Set<number>;
  nextFallbackPosition: number;
}): LiveResolvedPositionMetadata => {
  const { entry, emittedAt, hasExplicitOrder, assignedPositions } = input;

  if (
    hasExplicitOrder &&
    entry.explicitPosition != null &&
    entry.explicitPosition > 0 &&
    !assignedPositions.has(entry.explicitPosition)
  ) {
    return {
      position: entry.explicitPosition,
      source: 'timing_data',
      updatedAt: entry.positionUpdatedAt,
      confidence: 'high',
    };
  }

  if (!assignedPositions.has(1) && isTimingDataLeaderCandidate(entry)) {
    return {
      position: 1,
      source: 'timing_data',
      updatedAt: emittedAt,
      confidence: 'high',
    };
  }

  if (
    entry.previousResolvedMetadata != null &&
    entry.previousResolvedMetadata.position > 0 &&
    !assignedPositions.has(entry.previousResolvedMetadata.position)
  ) {
    return {
      ...entry.previousResolvedMetadata,
      confidence:
        entry.previousResolvedMetadata.source === 'timing_data'
          ? 'medium'
          : entry.previousResolvedMetadata.confidence,
    };
  }

  let fallbackPosition = input.nextFallbackPosition;
  while (assignedPositions.has(fallbackPosition)) {
    fallbackPosition += 1;
  }

  return {
    position: fallbackPosition,
    source: entry.fallbackPositionSource,
    updatedAt:
      entry.fallbackPositionSource === 'driver_code' ? null : emittedAt,
    confidence: 'low',
  };
};

const toResolvedLeaderboardEntry = (
  entry: LiveLeaderboardDraftEntry,
  metadata: LiveResolvedPositionMetadata,
): LiveLeaderboardEntry => {
  const leaderboardEntry = {
    ...entry,
  } as LiveLeaderboardEntry & {
    explicitPosition?: number | null;
    previousResolvedMetadata?: LiveResolvedPositionMetadata | null;
    fallbackPositionSource?: LivePositionSource;
  };

  delete leaderboardEntry.explicitPosition;
  delete leaderboardEntry.previousResolvedMetadata;
  delete leaderboardEntry.fallbackPositionSource;

  return {
    ...leaderboardEntry,
    position: metadata.position,
    positionSource: metadata.source,
    positionUpdatedAt: metadata.updatedAt,
    positionConfidence: metadata.confidence,
  };
};

const applyDerivedLapGaps = (leaderboard: LiveLeaderboardEntry[]): void => {
  const leader = leaderboard.at(0);
  if (leader?.lastLapMs == null) {
    return;
  }

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
};
