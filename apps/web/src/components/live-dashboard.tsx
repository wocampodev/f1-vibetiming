"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LiveBoardRow,
  LiveBoardSectorCell,
  LiveBoardState,
  LiveEnvelope,
  LiveHealthState,
  LiveHeartbeatPayload,
  LiveTopicFreshnessHealthEntry,
} from "@/lib/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
const FALLBACK_POLL_MS = 5000;
const HEALTH_POLL_MS = 10000;
const STALE_THRESHOLD_MS = 40000;
const NO_FEED_NOTICE_THRESHOLD_SEC = 20;

const flagToneByValue: Record<string, string> = {
  green: "border-emerald-400/50 bg-emerald-400/10 text-emerald-200",
  yellow: "border-yellow-400/50 bg-yellow-400/10 text-yellow-200",
  red: "border-red-400/50 bg-red-400/10 text-red-200",
  safety_car: "border-orange-400/50 bg-orange-400/10 text-orange-200",
  virtual_safety_car: "border-cyan-400/50 bg-cyan-400/10 text-cyan-200",
  checkered: "border-zinc-200/50 bg-zinc-300/10 text-zinc-100",
};

const tireToneByCompound: Record<string, string> = {
  SOFT: "border-red-400/40 bg-red-500/10 text-red-100",
  MEDIUM: "border-yellow-400/40 bg-yellow-400/10 text-yellow-100",
  HARD: "border-zinc-300/40 bg-zinc-400/10 text-zinc-100",
  INTERMEDIATE: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
  WET: "border-sky-400/40 bg-sky-500/10 text-sky-100",
};

const pitToneByState: Record<string, string> = {
  on_track: "border-slate-700/80 bg-slate-900/70 text-slate-200",
  pit_lane: "border-amber-400/40 bg-amber-400/10 text-amber-100",
  pit_out: "border-cyan-400/40 bg-cyan-400/10 text-cyan-100",
  pit_garage: "border-orange-400/40 bg-orange-400/10 text-orange-100",
  in_pit: "border-orange-400/40 bg-orange-400/10 text-orange-100",
  off_track: "border-rose-400/40 bg-rose-400/10 text-rose-100",
  stopped: "border-red-400/40 bg-red-500/10 text-red-100",
  unknown: "border-slate-700/80 bg-slate-900/70 text-slate-300",
};

const confidenceToneByValue: Record<string, string> = {
  high: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
  medium: "border-amber-400/30 bg-amber-400/10 text-amber-100",
  low: "border-rose-400/30 bg-rose-400/10 text-rose-100",
};

type SectorTone = "session_best" | "personal_best" | "timed" | "empty";

const parseEnvelope = <TPayload,>(raw: string): LiveEnvelope<TPayload> | null => {
  try {
    return JSON.parse(raw) as LiveEnvelope<TPayload>;
  } catch {
    return null;
  }
};

const formatClock = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));

const formatLapTime = (milliseconds: number | null): string => {
  if (milliseconds == null) {
    return "-";
  }

  const totalSeconds = milliseconds / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
};

const formatSectorTime = (milliseconds: number | null): string => {
  if (milliseconds == null) {
    return "-";
  }

  return (milliseconds / 1000).toFixed(3);
};

const formatGap = (value: string | null, fallbackSeconds: number | null, leader: boolean): string => {
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

const formatFlagLabel = (value: string): string =>
  value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

const formatProjectionLabel = (value: LiveBoardState["projection"]["mode"]): string =>
  value.replace(/_/g, " ");

const formatPitLabel = (value: string | null): string => {
  if (!value) {
    return "On track";
  }

  return value.replace(/_/g, " ");
};

const formatAgeSeconds = (value: number | null): string => {
  if (value == null) {
    return "No sample";
  }

  if (value < 60) {
    return `${value}s old`;
  }

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return seconds === 0 ? `${minutes}m old` : `${minutes}m ${seconds}s old`;
};

const freshnessTone = (topic: LiveTopicFreshnessHealthEntry): string => {
  if (topic.lastSeenAt == null || topic.messageCount === 0) {
    return "border-slate-700/80 bg-slate-950/70 text-slate-300";
  }

  if ((topic.ageSeconds ?? 0) <= 15) {
    return "border-emerald-400/35 bg-emerald-500/10 text-emerald-100";
  }

  if ((topic.ageSeconds ?? 0) <= 60) {
    return "border-amber-400/35 bg-amber-400/10 text-amber-100";
  }

  return "border-rose-400/35 bg-rose-500/10 text-rose-100";
};

const getSectorTone = (cell: LiveBoardSectorCell): SectorTone => {
  if (cell.valueMs == null) {
    return "empty";
  }

  if (cell.sessionBestMs != null && cell.valueMs <= cell.sessionBestMs) {
    return "session_best";
  }

  if (cell.personalBestMs != null && cell.valueMs <= cell.personalBestMs) {
    return "personal_best";
  }

  return "timed";
};

const miniSectorClassName = (status: number, active: boolean): string => {
  if (status === 2050 || status === 2051) {
    return active ? "bg-fuchsia-300" : "bg-fuchsia-500/80";
  }

  if (
    status === 2044 ||
    status === 2045 ||
    status === 2064 ||
    status === 2065
  ) {
    return active ? "bg-emerald-300" : "bg-emerald-500/80";
  }

  if (status === 2048 || status === 2049) {
    return active ? "bg-yellow-200" : "bg-yellow-400/80";
  }

  if (status >= 0) {
    return active ? "bg-slate-300" : "bg-slate-500/70";
  }

  return "bg-slate-800";
};

function SectorCluster({
  cell,
  miniSectors,
}: {
  cell: LiveBoardSectorCell;
  miniSectors: LiveBoardRow["miniSectors"];
}) {
  const tone = getSectorTone(cell);
  const valueTone =
    tone === "session_best"
      ? "text-fuchsia-100"
      : tone === "personal_best"
        ? "text-emerald-100"
        : tone === "timed"
          ? "text-[#f4f9ff]"
          : "text-[#5a6c86]";
  const placeholderSegments = Array.from({ length: 6 }, (_, index) => index);

  return (
    <div className="min-w-[9rem] space-y-2">
      <div className="flex min-h-2 flex-wrap gap-2.5">
        {miniSectors.length > 0
          ? miniSectors.map((miniSector) => (
              <span
                key={`${miniSector.sector}-${miniSector.segment}`}
                className={`h-2 w-4 rounded-full ${miniSectorClassName(
                  miniSector.status,
                  miniSector.active,
                )}`}
                title={`S${miniSector.sector} M${miniSector.segment} ${miniSector.status}`}
              />
            ))
          : placeholderSegments.map((segment) => (
              <span
                key={`placeholder-${cell.index}-${segment}`}
                className="h-2 w-4 rounded-full bg-slate-900/90"
              />
            ))}
      </div>
      <div className="flex items-end gap-2">
        <span className={`font-mono text-2xl font-semibold leading-none ${valueTone}`}>
          {formatSectorTime(cell.valueMs)}
        </span>
        {cell.personalBestMs != null ? (
          <span className="pb-0.5 font-mono text-xs text-[#7085a0]">
            {formatSectorTime(cell.personalBestMs)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function DriverCell({ row }: { row: LiveBoardRow }) {
  return (
    <div className="flex min-w-[15rem] items-center gap-3">
      <div
        className="h-11 w-1 rounded-full"
        style={{ backgroundColor: row.teamColor ?? "#38506e" }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-slate-700/80 bg-slate-950/70 px-2 py-1 text-xs font-bold tracking-[0.18em] text-slate-200">
            {row.driverNumber}
          </span>
          <span className="text-sm font-semibold text-[#f4f9ff]">
            {row.driverName ?? row.driverCode}
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#78c6ff]">
            {row.driverCode}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[#7f96b5]">
          {row.teamName ? <span>{row.teamName}</span> : null}
          <span className={`rounded-full border px-2 py-0.5 ${confidenceToneByValue[row.positionConfidence]}`}>
            {row.positionConfidence}
          </span>
          <span>src {row.positionSource.replace(/_/g, " ")}</span>
        </div>
      </div>
    </div>
  );
}

function TireCell({ row }: { row: LiveBoardRow }) {
  const compound = row.tire.compound;
  const tone = compound ? tireToneByCompound[compound] : "border-slate-700/80 bg-slate-950/70 text-slate-200";

  return (
    <div className="space-y-1">
      <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${tone}`}>
        {compound ?? "Unknown"}
      </span>
      <div className="text-[11px] uppercase tracking-[0.16em] text-[#8aa0be]">
        {row.tire.ageLaps != null ? `${row.tire.ageLaps} laps` : "Age -"}
        {row.tire.isNew != null ? ` · ${row.tire.isNew ? "new" : "used"}` : ""}
      </div>
    </div>
  );
}

function PitCell({ row }: { row: LiveBoardRow }) {
  const pitState = row.pitState ?? "unknown";

  return (
    <div className="space-y-1">
      <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${pitToneByState[pitState] ?? pitToneByState.unknown}`}>
        {formatPitLabel(row.pitState)}
      </span>
      <div className="text-[11px] uppercase tracking-[0.16em] text-[#8aa0be]">
        Stops {row.pitStops ?? "-"}
      </div>
    </div>
  );
}

function TopicFreshnessCard({ topic }: { topic: LiveTopicFreshnessHealthEntry }) {
  return (
    <div className={`rounded-xl border px-3 py-3 ${freshnessTone(topic)}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em]">{topic.topic}</p>
          <p className="mt-1 text-sm">{formatAgeSeconds(topic.ageSeconds)}</p>
        </div>
        <div className="text-right text-[11px] uppercase tracking-[0.16em] text-inherit/80">
          <div>{topic.messageCount} msgs</div>
          <div className="mt-1">{topic.lastSeenAt ? formatClock(topic.lastSeenAt) : "Never"}</div>
        </div>
      </div>
    </div>
  );
}

function DiagnosticsPanel({ health }: { health: LiveHealthState | null }) {
  const capture = health?.details?.capture ?? null;
  const topicFreshness = capture?.latestSnapshotTopicFreshness ?? null;

  const visibleTopics = useMemo(() => {
    return [...(topicFreshness?.topics ?? [])]
      .sort((left, right) => {
        const leftAge = left.ageSeconds ?? Number.POSITIVE_INFINITY;
        const rightAge = right.ageSeconds ?? Number.POSITIVE_INFINITY;
        return rightAge - leftAge || left.topic.localeCompare(right.topic);
      })
      .slice(0, 6);
  }, [topicFreshness]);

  if (!health || !capture) {
    return null;
  }

  return (
    <div className="border-b border-[var(--line)] bg-[#09111b] px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#8aa0be]">Diagnostics</p>
          <p className="mt-1 text-sm text-[#dce9fb]">
            Snapshot-aware provider health and topic freshness.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em]">
          <span className="rounded-full border border-slate-700/80 bg-slate-950/70 px-3 py-1 text-slate-200">
            Socket {health.details?.socketOpen ? "open" : "closed"}
          </span>
          {capture.latestSnapshotVersion != null ? (
            <span className="rounded-full border border-cyan-400/35 bg-cyan-400/10 px-3 py-1 text-cyan-100">
              Snapshot v{capture.latestSnapshotVersion}
            </span>
          ) : null}
          {health.details?.publicProjection ? (
            <span className="rounded-full border border-amber-400/35 bg-amber-400/10 px-3 py-1 text-amber-100">
              Projection {formatProjectionLabel(health.details.publicProjection.mode)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-[#8aa0be]">
        {capture.latestSnapshotAt ? <span>Snapshot {formatClock(capture.latestSnapshotAt)}</span> : null}
        {capture.latestSnapshotSessionKey ? <span>{capture.latestSnapshotSessionKey}</span> : null}
        {topicFreshness?.capturedAt ? <span>Topic freshness {formatClock(topicFreshness.capturedAt)}</span> : null}
      </div>

      {visibleTopics.length > 0 ? (
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {visibleTopics.map((topic) => (
            <TopicFreshnessCard key={topic.topic} topic={topic} />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-[#6f86a5]">No persisted topic freshness samples yet.</p>
      )}
    </div>
  );
}

function LiveRow({ row }: { row: LiveBoardRow }) {
  const sectors = row.lastSectors.map((cell) => ({
    cell,
    miniSectors: row.miniSectors
      .filter((miniSector) => miniSector.sector === cell.index)
      .sort((left, right) => left.segment - right.segment),
  }));
  const gapText = formatGap(
    row.gapToLeaderText,
    row.gapToLeaderSec,
    row.position === 1,
  );
  const intervalText =
    row.position === 1
      ? null
      : formatGap(row.intervalToAheadText, row.intervalToAheadSec, false);

  return (
    <tr className="border-b border-[var(--line)]/60 hover:bg-[#0d1623]">
      <td className="px-3 py-3 align-top">
        <span className="inline-flex min-w-11 items-center justify-center rounded-md border border-[#2f4c69] bg-[#102034] px-2 py-1 text-base font-bold text-[#f4f9ff]">
          {row.position}
        </span>
      </td>
      <td className="px-3 py-3 align-top">
        <DriverCell row={row} />
      </td>
      <td className="px-3 py-3 align-top">
        <div className="flex flex-wrap gap-6">
          {sectors.map(({ cell, miniSectors }) => (
            <SectorCluster key={cell.index} cell={cell} miniSectors={miniSectors} />
          ))}
        </div>
      </td>
      <td className="px-3 py-3 align-top">
        <div className="space-y-1 font-mono text-sm text-[#dce9fb]">
          <div>{formatLapTime(row.lastLapMs)}</div>
          <div className={row.isSessionFastestLap ? "text-fuchsia-200" : "text-[#8aa0be]"}>
            {formatLapTime(row.bestLapMs)}
          </div>
        </div>
      </td>
      <td className="px-3 py-3 align-top">
        <TireCell row={row} />
      </td>
      <td className="px-3 py-3 align-top">
        <PitCell row={row} />
      </td>
      <td className="px-3 py-3 align-top font-mono text-sm">
        <div className="space-y-1">
          <div className="text-lg font-semibold text-[#f4f9ff]">{gapText}</div>
          {intervalText ? <div className="text-xs text-[#7f96b5]">{intervalText}</div> : null}
        </div>
      </td>
    </tr>
  );
}

export function LiveDashboard() {
  const [boardState, setBoardState] = useState<LiveBoardState | null>(null);
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null);
  const [health, setHealth] = useState<LiveHealthState | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    const loadHealth = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/live/health`, {
          cache: "no-store",
        });
        if (!response.ok || cancelled) {
          return;
        }

        const payload = (await response.json()) as LiveHealthState;
        if (!cancelled) {
          setHealth(payload);
        }
      } catch {
        if (!cancelled) {
          setHealth(null);
        }
      }
    };

    void loadHealth();
    const timer = window.setInterval(() => {
      void loadHealth();
    }, HEALTH_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let stream: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let fallbackTimer: number | null = null;
    let closed = false;
    let reconnectAttempt = 0;

    const loadBoard = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/live/board`, {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }

        const nextBoard = (await response.json()) as LiveBoardState | null;
        setBoardState(nextBoard);
      } catch {
        // keep retrying on next event or interval
      }
    };

    const stopFallback = () => {
      if (!fallbackTimer) {
        return;
      }

      window.clearInterval(fallbackTimer);
      fallbackTimer = null;
    };

    const startFallback = () => {
      if (fallbackTimer) {
        return;
      }

      void loadBoard();
      fallbackTimer = window.setInterval(() => {
        void loadBoard();
      }, FALLBACK_POLL_MS);
    };

    const closeStream = () => {
      if (!stream) {
        return;
      }

      stream.close();
      stream = null;
    };

    const scheduleReconnect = () => {
      if (closed || reconnectTimer) {
        return;
      }

      reconnectAttempt += 1;
      const delayMs = Math.min(
        RECONNECT_MAX_DELAY_MS,
        RECONNECT_BASE_DELAY_MS * 2 ** Math.max(0, reconnectAttempt - 1),
      );

      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        openStream();
      }, delayMs);
    };

    const openStream = () => {
      if (closed) {
        return;
      }

      closeStream();
      stream = new EventSource(`${API_BASE_URL}/live/stream`);

      stream.onopen = () => {
        reconnectAttempt = 0;
        stopFallback();
        void loadBoard();
      };

      stream.onerror = () => {
        startFallback();
        closeStream();
        scheduleReconnect();
      };

      const handleUpdate = () => {
        void loadBoard();
      };

      const handleHeartbeat = (event: MessageEvent<string>) => {
        const envelope = parseEnvelope<LiveHeartbeatPayload>(event.data);
        if (!envelope) {
          return;
        }

        setLastHeartbeat(envelope.payload.at);
      };

      stream.addEventListener("initial_state", handleUpdate as EventListener);
      stream.addEventListener("delta_update", handleUpdate as EventListener);
      stream.addEventListener("heartbeat", handleHeartbeat as EventListener);
    };

    void loadBoard();
    openStream();

    return () => {
      closed = true;

      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }

      stopFallback();
      closeStream();
    };
  }, []);

  const streamStale = useMemo(() => {
    const reference = lastHeartbeat ?? boardState?.generatedAt ?? null;
    if (!reference) {
      return false;
    }

    return nowMs - new Date(reference).getTime() > STALE_THRESHOLD_MS;
  }, [boardState?.generatedAt, lastHeartbeat, nowMs]);

  const rows = boardState?.rows ?? [];
  const raceControl = boardState?.raceControl ?? [];
  const noFeedYet =
    !boardState &&
    health?.details?.socketOpen === true &&
    (health.details.connectionUptimeSec ?? 0) >= NO_FEED_NOTICE_THRESHOLD_SEC &&
    (health.details.feedMessagesReceived ?? 0) === 0;
  const lapLabel =
    boardState?.session.currentLap != null && boardState.session.totalLaps != null
      ? `L${boardState.session.currentLap}/${boardState.session.totalLaps}`
      : "L-/-";

  return (
    <section className="panel overflow-hidden p-0">
      <div className="border-b border-[var(--line)] bg-[#0a121e] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#8aa0be]">Timing Feed</p>
            <p className="text-3xl font-bold leading-tight text-[#f4f9ff]">
              {boardState?.session.sessionName ?? "Formula 1 Live Timing"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[var(--line)] bg-[#0e1827] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#d3e1f5]">
              {lapLabel}
            </span>
            {boardState ? (
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${flagToneByValue[boardState.session.flag] ?? "border-zinc-400/40 bg-zinc-400/10 text-zinc-200"}`}
              >
                {formatFlagLabel(boardState.session.flag)}
              </span>
            ) : null}
            {boardState ? (
              <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-100">
                {formatProjectionLabel(boardState.projection.mode)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
          {boardState ? <span>Updated {formatClock(boardState.generatedAt)}</span> : null}
          {boardState?.session.clockIso ? <span>Clock {formatClock(boardState.session.clockIso)}</span> : null}
          {boardState ? <span>{boardState.rows.length} rows</span> : null}
          {boardState?.projection.lowConfidenceLeaderSuppressions ? (
            <span>{boardState.projection.lowConfidenceLeaderSuppressions} suppressed leader projections</span>
          ) : null}
        </div>

        {streamStale ? (
          <p className="mt-3 rounded-md border border-orange-400/40 bg-orange-400/10 px-3 py-2 text-xs text-orange-200">
            Feed is stale. Showing the latest available board projection.
          </p>
        ) : null}

        {boardState?.projection.mode === "stabilized" ? (
          <p className="mt-3 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100">
            Leader order is being stabilized while provider confidence catches up.
          </p>
        ) : null}

        {boardState?.projection.mode === "withheld" ? (
          <p className="mt-3 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
            Public leader is temporarily withheld until a trustworthy running order is available.
          </p>
        ) : null}
      </div>

      <DiagnosticsPanel health={health} />

      {boardState ? (
        <div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] bg-[#070d15] text-sm">
              <thead className="border-b border-[var(--line)] bg-[#101b2a] text-left text-[11px] uppercase tracking-[0.18em] text-[#94a7c2]">
                <tr>
                  <th className="px-3 py-3">Pos</th>
                  <th className="px-3 py-3">Driver</th>
                  <th className="px-3 py-3">Sectors</th>
                  <th className="px-3 py-3">Lap Pace</th>
                  <th className="px-3 py-3">Tire</th>
                  <th className="px-3 py-3">Pit</th>
                  <th className="px-3 py-3">Gap</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <LiveRow key={row.driverCode} row={row} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-[var(--line)] bg-[#0a121e] px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.2em] text-[#8aa0be]">Race Control</p>
              {boardState.fastestBestLapMs != null ? (
                <p className="text-xs uppercase tracking-[0.18em] text-fuchsia-200">
                  Fastest lap {formatLapTime(boardState.fastestBestLapMs)}
                </p>
              ) : null}
            </div>
            {raceControl.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted)]">No race control messages yet.</p>
            ) : (
              <div className="mt-2 grid gap-2">
                {raceControl.slice(0, 8).map((message) => (
                  <div
                    key={message.id}
                    className="rounded-md border border-[var(--line)] bg-[#0e1827] px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs uppercase tracking-wide text-[#9ec5e8]">
                        {message.category}
                      </span>
                      <span className="text-xs text-[var(--muted)]">
                        {formatClock(message.emittedAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[#e5eefc]">{message.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-[var(--muted)]">Waiting for live board projection.</p>
          {noFeedYet ? (
            <p className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
              Provider is connected but no timing updates are being published yet. This usually
              means there is no active official live session at the moment.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
