import {
  LiveBoardProjectionState,
  LiveBoardRow,
  LiveBoardSectorCell,
  LiveBoardState,
  LivePositionConfidence,
  LivePositionSource,
  LivePublicState,
  LiveState,
} from './live.types';

interface TeamBoardStyle {
  key: string;
  color: string;
}

interface BuildLiveBoardOptions {
  internalState: LiveState | null;
  publicState: LivePublicState | null;
  projection: LiveBoardProjectionState;
}

const TEAM_BOARD_STYLE_BY_NAME: Record<string, TeamBoardStyle> = {
  'aston martin': { key: 'aston_martin', color: '#1f8f6e' },
  audi: { key: 'audi', color: '#19b4a5' },
  cadillac: { key: 'cadillac', color: '#8d8f98' },
  ferrari: { key: 'ferrari', color: '#dc1f3c' },
  haas: { key: 'haas', color: '#b4b8c5' },
  mclaren: { key: 'mclaren', color: '#ff7a18' },
  mercedes: { key: 'mercedes', color: '#1fb7a6' },
  alpine: { key: 'alpine', color: '#19a7ff' },
  sauber: { key: 'sauber', color: '#29a86f' },
  'red bull': { key: 'red_bull', color: '#2d66d5' },
  rb: { key: 'racing_bulls', color: '#3769ff' },
  'racing bulls': { key: 'racing_bulls', color: '#3769ff' },
  vcarb: { key: 'racing_bulls', color: '#3769ff' },
  williams: { key: 'williams', color: '#2b7cff' },
};

const normalizeTeamName = (teamName: string | null): string | null => {
  if (!teamName) {
    return null;
  }

  return teamName.trim().toLowerCase();
};

const resolveTeamBoardStyle = (
  teamName: string | null,
): TeamBoardStyle | null => {
  const normalized = normalizeTeamName(teamName);
  if (!normalized) {
    return null;
  }

  for (const [pattern, style] of Object.entries(TEAM_BOARD_STYLE_BY_NAME)) {
    if (normalized.includes(pattern)) {
      return style;
    }
  }

  return null;
};

const formatGapText = (seconds: number | null): string | null => {
  if (seconds == null) {
    return null;
  }

  return `+${seconds.toFixed(3)}`;
};

const buildSectorCell = (
  index: number,
  valueMs: number | null,
  personalBestMs: number | null,
  sessionBestMs: number | null,
): LiveBoardSectorCell => {
  return {
    index,
    valueMs,
    personalBestMs,
    sessionBestMs,
  };
};

const resolveSessionBestSectors = (
  rows: LiveState['leaderboard'],
): [number | null, number | null, number | null] => {
  const s1 = rows
    .map((entry) => entry.bestSector1Ms)
    .filter((value): value is number => value != null);
  const s2 = rows
    .map((entry) => entry.bestSector2Ms)
    .filter((value): value is number => value != null);
  const s3 = rows
    .map((entry) => entry.bestSector3Ms)
    .filter((value): value is number => value != null);

  return [
    s1.length > 0 ? Math.min(...s1) : null,
    s2.length > 0 ? Math.min(...s2) : null,
    s3.length > 0 ? Math.min(...s3) : null,
  ];
};

const resolveFastestBestLap = (
  rows: LiveState['leaderboard'],
): number | null => {
  const laps = rows
    .map((entry) => entry.bestLapMs)
    .filter((value): value is number => value != null);

  return laps.length > 0 ? Math.min(...laps) : null;
};

const buildProjection = (
  projection: LiveBoardProjectionState,
): LiveBoardProjectionState => ({
  ...projection,
});

const toBoardFallbackEntries = (
  internalRows: LiveState['leaderboard'],
): LivePublicState['leaderboard'] => {
  return internalRows.map((entry) => ({
    position: entry.position,
    driverCode: entry.driverCode,
    driverName: entry.driverName,
    teamName: entry.teamName,
    gapToLeaderSec: null,
    intervalToAheadSec: null,
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
};

const buildBoardRow = (
  publicEntry: LivePublicState['leaderboard'][number],
  internalEntry: LiveState['leaderboard'][number] | null,
  sessionCurrentLap: number | null,
  fastestBestLapMs: number | null,
  sessionBestSectors: [number | null, number | null, number | null],
  projectionMode: LiveBoardProjectionState['mode'],
): LiveBoardRow => {
  const source = internalEntry?.positionSource ?? 'driver_code';
  const confidence = internalEntry?.positionConfidence ?? 'low';
  const teamStyle = resolveTeamBoardStyle(
    internalEntry?.teamName ?? publicEntry.teamName,
  );
  const redactedGaps =
    projectionMode !== 'pass_through' && publicEntry.position > 1;

  return {
    position: publicEntry.position,
    driverNumber: internalEntry?.driverNumber ?? publicEntry.driverCode,
    driverCode: publicEntry.driverCode,
    driverName: publicEntry.driverName,
    teamName: publicEntry.teamName,
    teamKey: teamStyle?.key ?? null,
    teamColor: teamStyle?.color ?? null,
    completedLaps: internalEntry?.completedLaps ?? null,
    intervalToAheadSec: redactedGaps ? null : publicEntry.intervalToAheadSec,
    intervalToAheadText:
      publicEntry.position === 1
        ? sessionCurrentLap != null
          ? `LAP ${sessionCurrentLap}`
          : 'LEADER'
        : redactedGaps
          ? null
          : (internalEntry?.intervalToAheadText ??
            formatGapText(publicEntry.intervalToAheadSec)),
    gapToLeaderSec: redactedGaps ? null : publicEntry.gapToLeaderSec,
    gapToLeaderText:
      publicEntry.position === 1
        ? sessionCurrentLap != null
          ? `LAP ${sessionCurrentLap}`
          : 'LEADER'
        : redactedGaps
          ? null
          : (internalEntry?.gapToLeaderText ??
            formatGapText(publicEntry.gapToLeaderSec)),
    pitState: internalEntry?.pitState ?? null,
    pitStops: internalEntry?.pitStops ?? null,
    tire: {
      compound: internalEntry?.tireCompound ?? null,
      ageLaps: internalEntry?.stintLap ?? null,
      isNew: internalEntry?.tireIsNew ?? null,
    },
    bestLapMs: publicEntry.bestLapMs,
    lastLapMs: publicEntry.lastLapMs,
    lastSectors: [
      buildSectorCell(
        1,
        publicEntry.sector1Ms,
        internalEntry?.bestSector1Ms ?? publicEntry.bestSector1Ms,
        sessionBestSectors[0],
      ),
      buildSectorCell(
        2,
        publicEntry.sector2Ms,
        internalEntry?.bestSector2Ms ?? publicEntry.bestSector2Ms,
        sessionBestSectors[1],
      ),
      buildSectorCell(
        3,
        publicEntry.sector3Ms,
        internalEntry?.bestSector3Ms ?? publicEntry.bestSector3Ms,
        sessionBestSectors[2],
      ),
    ],
    bestSectors: [
      buildSectorCell(
        1,
        publicEntry.bestSector1Ms,
        publicEntry.bestSector1Ms,
        sessionBestSectors[0],
      ),
      buildSectorCell(
        2,
        publicEntry.bestSector2Ms,
        publicEntry.bestSector2Ms,
        sessionBestSectors[1],
      ),
      buildSectorCell(
        3,
        publicEntry.bestSector3Ms,
        publicEntry.bestSector3Ms,
        sessionBestSectors[2],
      ),
    ],
    miniSectors: internalEntry?.miniSectors ?? [],
    positionSource: source,
    positionUpdatedAt: internalEntry?.positionUpdatedAt ?? null,
    positionConfidence: confidence,
    isSessionFastestLap:
      publicEntry.bestLapMs != null &&
      fastestBestLapMs != null &&
      publicEntry.bestLapMs <= fastestBestLapMs,
  };
};

export const buildLiveBoardState = ({
  internalState,
  publicState,
  projection,
}: BuildLiveBoardOptions): LiveBoardState | null => {
  const baseState = publicState ?? internalState;
  if (!baseState) {
    return null;
  }

  const publicRows = publicState?.leaderboard ?? [];
  const internalRows = internalState?.leaderboard ?? [];
  const boardRows =
    publicRows.length > 0 ? publicRows : toBoardFallbackEntries(internalRows);
  const internalRowsByCode = new Map(
    internalRows.map((entry) => [entry.driverCode, entry]),
  );
  const fastestBestLapMs = resolveFastestBestLap(internalRows);
  const sessionBestSectors = resolveSessionBestSectors(internalRows);

  return {
    generatedAt: baseState.generatedAt,
    session: baseState.session,
    fastestBestLapMs,
    rows: boardRows.map((entry) =>
      buildBoardRow(
        entry,
        internalRowsByCode.get(entry.driverCode) ?? null,
        baseState.session.currentLap,
        fastestBestLapMs,
        sessionBestSectors,
        projection.mode,
      ),
    ),
    raceControl: baseState.raceControl,
    projection: buildProjection(projection),
  };
};

export const createLiveBoardProjection = (input: {
  mode: LiveBoardProjectionState['mode'];
  lowConfidenceLeaderSuppressions: number;
  lastLowConfidenceLeaderAt: string | null;
  lastLowConfidenceLeaderCode: string | null;
  lastLowConfidenceLeaderSource: LivePositionSource | null;
  lastLowConfidenceLeaderConfidence: LivePositionConfidence | null;
  internalLeaderboardRows: number;
  publicLeaderboardRows: number;
  internalLeaderCode: string | null;
  internalLeaderSource: LivePositionSource | null;
  internalLeaderConfidence: LivePositionConfidence | null;
  publicLeaderCode: string | null;
}): LiveBoardProjectionState => {
  return {
    mode: input.mode,
    lowConfidenceLeaderSuppressions: input.lowConfidenceLeaderSuppressions,
    lastLowConfidenceLeaderAt: input.lastLowConfidenceLeaderAt,
    lastLowConfidenceLeaderCode: input.lastLowConfidenceLeaderCode,
    lastLowConfidenceLeaderSource: input.lastLowConfidenceLeaderSource,
    lastLowConfidenceLeaderConfidence: input.lastLowConfidenceLeaderConfidence,
    internalLeaderboardRows: input.internalLeaderboardRows,
    publicLeaderboardRows: input.publicLeaderboardRows,
    internalLeaderCode: input.internalLeaderCode,
    internalLeaderSource: input.internalLeaderSource,
    internalLeaderConfidence: input.internalLeaderConfidence,
    publicLeaderCode: input.publicLeaderCode,
  };
};
