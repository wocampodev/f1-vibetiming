import { createLiveBoardProjection } from './live.board';
import {
  LiveBoardProjectionState,
  LiveFeedSource,
  LivePositionConfidence,
  LivePositionSource,
  LivePublicState,
  LiveState,
} from './live.types';

export interface LivePublicProjectionMemory {
  mode: LiveBoardProjectionState['mode'];
  lowConfidenceLeaderSuppressions: number;
  lastLowConfidenceLeaderAt: string | null;
  lastLowConfidenceLeaderCode: string | null;
  lastLowConfidenceLeaderSource: LivePositionSource | null;
  lastLowConfidenceLeaderConfidence: LivePositionConfidence | null;
}

export const createInitialPublicProjectionMemory =
  (): LivePublicProjectionMemory => ({
    mode: 'pass_through',
    lowConfidenceLeaderSuppressions: 0,
    lastLowConfidenceLeaderAt: null,
    lastLowConfidenceLeaderCode: null,
    lastLowConfidenceLeaderSource: null,
    lastLowConfidenceLeaderConfidence: null,
  });

export const projectPublicState = (input: {
  source: LiveFeedSource;
  state: LiveState;
  previousPublicState?: LivePublicState | null;
  projectionMemory?: LivePublicProjectionMemory;
}): {
  publicState: LivePublicState;
  projectionMemory: LivePublicProjectionMemory;
} => {
  const nextProjectionMemory = {
    ...(input.projectionMemory ?? createInitialPublicProjectionMemory()),
  };
  const leaderboard = input.state.leaderboard.map((entry) => ({
    position: entry.position,
    driverCode: entry.driverCode,
    driverName: entry.driverName,
    teamName: entry.teamName,
    gapToLeaderSec: entry.gapToLeaderSec,
    intervalToAheadSec: entry.intervalToAheadSec,
    sector1Ms: entry.sector1Ms,
    sector2Ms: entry.sector2Ms,
    sector3Ms: entry.sector3Ms,
    bestSector1Ms: entry.bestSector1Ms,
    bestSector2Ms: entry.bestSector2Ms,
    bestSector3Ms: entry.bestSector3Ms,
    lastLapMs: entry.lastLapMs,
    bestLapMs: entry.bestLapMs,
    speedHistoryKph: entry.speedHistoryKph,
    trackStatusHistory: entry.trackStatusHistory,
  }));

  return {
    publicState: {
      generatedAt: input.state.generatedAt,
      session: input.state.session,
      leaderboard: stabilizeProviderLeaderboard({
        source: input.source,
        state: input.state,
        leaderboard,
        previousPublicState: input.previousPublicState ?? null,
        projectionMemory: nextProjectionMemory,
      }),
      raceControl: input.state.raceControl,
    },
    projectionMemory: nextProjectionMemory,
  };
};

const stabilizeProviderLeaderboard = (input: {
  source: LiveFeedSource;
  state: LiveState;
  leaderboard: LivePublicState['leaderboard'];
  previousPublicState: LivePublicState | null;
  projectionMemory: LivePublicProjectionMemory;
}): LivePublicState['leaderboard'] => {
  if (input.source !== 'provider') {
    input.projectionMemory.mode = 'pass_through';
    return input.leaderboard;
  }

  const leader = input.state.leaderboard[0];
  if (!leader) {
    input.projectionMemory.mode = 'pass_through';
    return input.leaderboard;
  }

  if (leader.positionConfidence !== 'low') {
    input.projectionMemory.mode = 'pass_through';
    return input.leaderboard;
  }

  input.projectionMemory.lowConfidenceLeaderSuppressions += 1;
  input.projectionMemory.lastLowConfidenceLeaderAt = input.state.generatedAt;
  input.projectionMemory.lastLowConfidenceLeaderCode = leader.driverCode;
  input.projectionMemory.lastLowConfidenceLeaderSource = leader.positionSource;
  input.projectionMemory.lastLowConfidenceLeaderConfidence =
    leader.positionConfidence;

  const previousPublicState = input.previousPublicState;
  if (!previousPublicState) {
    input.projectionMemory.mode = 'withheld';
    return [];
  }

  const sameSession =
    (previousPublicState.session.sessionId != null &&
      previousPublicState.session.sessionId ===
        input.state.session.sessionId) ||
    (previousPublicState.session.sessionId == null &&
      previousPublicState.session.sessionName != null &&
      previousPublicState.session.sessionName ===
        input.state.session.sessionName);

  if (!sameSession) {
    input.projectionMemory.mode = 'withheld';
    return [];
  }

  const currentEntriesByCode = new Map(
    input.leaderboard.map((entry) => [entry.driverCode, entry]),
  );
  const stabilized = previousPublicState.leaderboard
    .map((entry) => currentEntriesByCode.get(entry.driverCode) ?? null)
    .filter(
      (entry): entry is (typeof input.leaderboard)[number] => entry != null,
    );
  const includedDriverCodes = new Set(
    stabilized.map((entry) => entry.driverCode),
  );

  for (const entry of input.leaderboard) {
    if (!includedDriverCodes.has(entry.driverCode)) {
      stabilized.push(entry);
      includedDriverCodes.add(entry.driverCode);
    }
  }

  input.projectionMemory.mode = 'stabilized';
  return stabilized.map((entry, index) => ({
    ...entry,
    position: index + 1,
    gapToLeaderSec: null,
    intervalToAheadSec: null,
  }));
};

export const restoreProjectionMemory = (input: {
  projectionState: LiveBoardProjectionState | null;
  restoredState: LiveState;
  restoredPublicState: LivePublicState | null;
}): LivePublicProjectionMemory => {
  if (input.projectionState) {
    return {
      mode: input.projectionState.mode,
      lowConfidenceLeaderSuppressions:
        input.projectionState.lowConfidenceLeaderSuppressions,
      lastLowConfidenceLeaderAt:
        input.projectionState.lastLowConfidenceLeaderAt,
      lastLowConfidenceLeaderCode:
        input.projectionState.lastLowConfidenceLeaderCode,
      lastLowConfidenceLeaderSource:
        input.projectionState.lastLowConfidenceLeaderSource,
      lastLowConfidenceLeaderConfidence:
        input.projectionState.lastLowConfidenceLeaderConfidence,
    };
  }

  if (!input.restoredPublicState) {
    return createInitialPublicProjectionMemory();
  }

  return {
    ...createInitialPublicProjectionMemory(),
    mode: inferProjectionMode(input.restoredState, input.restoredPublicState),
  };
};

export const inferProjectionMode = (
  restoredState: LiveState,
  restoredPublicState: LivePublicState,
): LiveBoardProjectionState['mode'] => {
  if (
    restoredPublicState.leaderboard.length === 0 &&
    restoredState.leaderboard.length > 0
  ) {
    return 'withheld';
  }

  if (
    restoredPublicState.leaderboard.length !== restoredState.leaderboard.length
  ) {
    return 'stabilized';
  }

  const internalRowsByCode = new Map(
    restoredState.leaderboard.map((entry) => [entry.driverCode, entry]),
  );

  const hasStabilizedOrder = restoredPublicState.leaderboard.some(
    (entry, index) =>
      entry.driverCode !== restoredState.leaderboard[index]?.driverCode,
  );
  if (hasStabilizedOrder) {
    return 'stabilized';
  }

  const hasRedactedGaps = restoredPublicState.leaderboard.some((entry) => {
    if (entry.position <= 1) {
      return false;
    }

    const internalEntry = internalRowsByCode.get(entry.driverCode);
    if (!internalEntry) {
      return false;
    }

    return (
      entry.gapToLeaderSec == null &&
      entry.intervalToAheadSec == null &&
      (internalEntry.gapToLeaderSec != null ||
        internalEntry.intervalToAheadSec != null)
    );
  });

  return hasRedactedGaps ? 'stabilized' : 'pass_through';
};

export const buildProjectionState = (input: {
  projectionMemory: LivePublicProjectionMemory;
  currentState: LiveState | null;
  currentPublicState: LivePublicState | null;
}): LiveBoardProjectionState => {
  return createLiveBoardProjection({
    mode: input.projectionMemory.mode,
    lowConfidenceLeaderSuppressions:
      input.projectionMemory.lowConfidenceLeaderSuppressions,
    lastLowConfidenceLeaderAt: input.projectionMemory.lastLowConfidenceLeaderAt,
    lastLowConfidenceLeaderCode:
      input.projectionMemory.lastLowConfidenceLeaderCode,
    lastLowConfidenceLeaderSource:
      input.projectionMemory.lastLowConfidenceLeaderSource,
    lastLowConfidenceLeaderConfidence:
      input.projectionMemory.lastLowConfidenceLeaderConfidence,
    internalLeaderboardRows: input.currentState?.leaderboard.length ?? 0,
    publicLeaderboardRows: input.currentPublicState?.leaderboard.length ?? 0,
    internalLeaderCode: input.currentState?.leaderboard[0]?.driverCode ?? null,
    internalLeaderSource:
      input.currentState?.leaderboard[0]?.positionSource ?? null,
    internalLeaderConfidence:
      input.currentState?.leaderboard[0]?.positionConfidence ?? null,
    publicLeaderCode:
      input.currentPublicState?.leaderboard[0]?.driverCode ?? null,
  });
};
