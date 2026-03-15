import {
  LiveBoardSectorCell,
  LiveBoardState,
  LiveEnvelope,
  LiveMiniSector,
} from "@/lib/types";

export type SectorTone = "session_best" | "personal_best" | "timed" | "empty";
export type LiveGapMode = "timed" | "race" | "provider";

const SESSION_BEST_MINI_SECTOR_STATUSES = new Set([2050, 2051]);
const PERSONAL_BEST_MINI_SECTOR_STATUSES = new Set([2044, 2045, 2049, 2064, 2065]);

export const parseEnvelope = <TPayload>(
  raw: string,
): LiveEnvelope<TPayload> | null => {
  try {
    return JSON.parse(raw) as LiveEnvelope<TPayload>;
  } catch {
    return null;
  }
};

export const formatClock = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));

export const formatLapTime = (milliseconds: number | null): string => {
  if (milliseconds == null) {
    return "-";
  }

  const totalSeconds = milliseconds / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
};

export const formatSectorTime = (milliseconds: number | null): string => {
  if (milliseconds == null) {
    return "-";
  }

  return (milliseconds / 1000).toFixed(3);
};

export const formatGap = (
  value: string | null,
  fallbackSeconds: number | null,
  leader: boolean,
): string => {
  if (leader) {
    return value ?? "LEADER";
  }

  if (value) {
    return value;
  }

  if (fallbackSeconds == null) {
    return "-";
  }

  return `+${fallbackSeconds.toFixed(3)}`;
};

export const formatLapDelta = (milliseconds: number | null): string | null => {
  if (milliseconds == null) {
    return null;
  }

  const absoluteMs = Math.abs(milliseconds);
  const minutes = Math.floor(absoluteMs / 60000);
  const seconds = (absoluteMs % 60000) / 1000;

  if (minutes > 0) {
    return `+${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
  }

  return `+${seconds.toFixed(3)}`;
};

export const resolveGapMode = (
  session: LiveBoardState["session"] | null,
): LiveGapMode => {
  if (!session) {
    return "provider";
  }

  const descriptor = `${session.sessionId ?? ""} ${session.sessionName ?? ""}`
    .trim()
    .toLowerCase();

  if (/(qualifying|shootout)/.test(descriptor)) {
    return "timed";
  }

  if (/(race|sprint|practice)/.test(descriptor)) {
    return "race";
  }

  return "provider";
};

export const getSectorTone = (
  cell: LiveBoardSectorCell,
  miniSectors: LiveMiniSector[] = [],
): SectorTone => {
  if (cell.valueMs == null) {
    return "empty";
  }

  if (
    miniSectors.some((miniSector) =>
      SESSION_BEST_MINI_SECTOR_STATUSES.has(miniSector.status),
    )
  ) {
    return "session_best";
  }

  if (
    miniSectors.some((miniSector) =>
      PERSONAL_BEST_MINI_SECTOR_STATUSES.has(miniSector.status),
    )
  ) {
    return "personal_best";
  }

  if (miniSectors.length > 0) {
    return "timed";
  }

  if (cell.sessionBestMs != null && cell.valueMs <= cell.sessionBestMs) {
    return "session_best";
  }

  if (cell.personalBestMs != null && cell.valueMs <= cell.personalBestMs) {
    return "personal_best";
  }

  return "timed";
};

export const miniSectorClassName = (
  status: number,
  active: boolean,
  sectorTone: SectorTone,
): string => {
  if (status === 2050 || status === 2051) {
    return active ? "bg-fuchsia-300" : "bg-fuchsia-500/80";
  }

  if (
    status === 2044 ||
    status === 2045 ||
    status === 2049 ||
    status === 2064 ||
    status === 2065
  ) {
    return active ? "bg-emerald-300" : "bg-emerald-500/80";
  }

  if (status === 2048 || status === 0) {
    if (sectorTone === "session_best") {
      return active ? "bg-fuchsia-300" : "bg-fuchsia-500/80";
    }

    if (sectorTone === "personal_best") {
      return active ? "bg-emerald-300" : "bg-emerald-500/80";
    }

    return active ? "bg-yellow-200" : "bg-yellow-400/80";
  }

  if (status >= 0) {
    return active ? "bg-slate-300" : "bg-slate-500/70";
  }

  return "bg-slate-800";
};
