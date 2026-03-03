"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LiveDeltaPayload,
  LiveEnvelope,
  LiveFlagStatus,
  LiveHeartbeatPayload,
  LiveLeaderboardEntry,
  LiveRaceControlMessage,
  LiveState,
  LiveStatusPayload,
  LiveStreamStatus,
} from "@/lib/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

const formatLapTime = (milliseconds: number): string => {
  const totalSeconds = milliseconds / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
};

const formatSignedSeconds = (seconds: number): string => {
  if (seconds === 0) {
    return "0.000s";
  }

  const sign = seconds > 0 ? "+" : "-";
  return `${sign}${Math.abs(seconds).toFixed(3)}s`;
};

const getPaceTrend = (deltaMs: number): "on pace" | "steady" | "fading" => {
  if (deltaMs <= 180) {
    return "on pace";
  }

  if (deltaMs <= 450) {
    return "steady";
  }

  return "fading";
};

const formatClock = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));

const formatFlag = (value: string): string => value.replaceAll("_", " ");

const parseEnvelope = <TPayload,>(raw: string): LiveEnvelope<TPayload> | null => {
  try {
    return JSON.parse(raw) as LiveEnvelope<TPayload>;
  } catch {
    return null;
  }
};

const badgeToneByStatus: Record<LiveStreamStatus, string> = {
  connecting: "bg-amber-500/20 text-amber-800 border-amber-700/20",
  live: "bg-emerald-500/20 text-emerald-800 border-emerald-700/20",
  degraded: "bg-orange-500/20 text-orange-800 border-orange-700/20",
  stopped: "bg-zinc-500/20 text-zinc-800 border-zinc-700/20",
};

const flagToneByValue: Record<string, string> = {
  green: "bg-emerald-500/15 text-emerald-800 border-emerald-700/20",
  yellow: "bg-amber-500/15 text-amber-900 border-amber-700/20",
  red: "bg-red-500/15 text-red-900 border-red-700/20",
  safety_car: "bg-orange-500/15 text-orange-900 border-orange-700/20",
  virtual_safety_car: "bg-orange-500/15 text-orange-900 border-orange-700/20",
  checkered: "bg-zinc-500/20 text-zinc-900 border-zinc-700/20",
};

const compoundTone: Record<string, string> = {
  SOFT: "bg-red-500/15 text-red-900 border-red-700/20",
  MEDIUM: "bg-amber-400/20 text-amber-950 border-amber-700/20",
  HARD: "bg-zinc-500/20 text-zinc-900 border-zinc-700/20",
  INTERMEDIATE: "bg-emerald-600/20 text-emerald-900 border-emerald-700/20",
  WET: "bg-blue-500/20 text-blue-900 border-blue-700/20",
};

interface TrackPoint {
  x: number;
  y: number;
}

interface TrackMarker {
  entry: LiveLeaderboardEntry;
  progress: number;
  point: TrackPoint;
}

interface SectorSnapshot {
  sector: 1 | 2 | 3;
  flag: LiveFlagStatus;
  detail: string;
}

const TRACK_PATH_POINTS: TrackPoint[] = [
  { x: 12, y: 55 },
  { x: 20, y: 28 },
  { x: 46, y: 18 },
  { x: 73, y: 26 },
  { x: 85, y: 44 },
  { x: 82, y: 68 },
  { x: 62, y: 80 },
  { x: 34, y: 76 },
  { x: 16, y: 62 },
  { x: 12, y: 55 },
];

const TRACK_PATH_D = TRACK_PATH_POINTS.map((point, index) =>
  `${index === 0 ? "M" : "L"}${point.x} ${point.y}`,
).join(" ");

const TRACK_SEGMENTS = TRACK_PATH_POINTS.slice(1).map((point, index) => {
  const start = TRACK_PATH_POINTS[index];
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  return {
    start,
    end: point,
    length: Math.sqrt(dx ** 2 + dy ** 2),
  };
});

const TRACK_TOTAL_LENGTH = TRACK_SEGMENTS.reduce(
  (total, segment) => total + segment.length,
  0,
);

const normalizeProgress = (value: number): number => {
  const remainder = value % 1;
  return remainder < 0 ? remainder + 1 : remainder;
};

const getTrackPointAtProgress = (progress: number): TrackPoint => {
  const normalized = normalizeProgress(progress);
  const targetDistance = normalized * TRACK_TOTAL_LENGTH;
  let traversed = 0;

  for (const segment of TRACK_SEGMENTS) {
    if (traversed + segment.length >= targetDistance) {
      const localDistance = targetDistance - traversed;
      const ratio = segment.length === 0 ? 0 : localDistance / segment.length;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
        y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
      };
    }

    traversed += segment.length;
  }

  return TRACK_PATH_POINTS[TRACK_PATH_POINTS.length - 1] ?? { x: 12, y: 55 };
};

const getSectorFromProgress = (progress: number): 1 | 2 | 3 => {
  const normalized = normalizeProgress(progress);
  if (normalized < 1 / 3) {
    return 1;
  }

  if (normalized < 2 / 3) {
    return 2;
  }

  return 3;
};

const deriveSectorSnapshots = (state: LiveState): SectorSnapshot[] => {
  const baseline: SectorSnapshot[] = [
    { sector: 1, flag: "green", detail: "Sector clear" },
    { sector: 2, flag: "green", detail: "Sector clear" },
    { sector: 3, flag: "green", detail: "Sector clear" },
  ];

  if (state.session.flag === "green") {
    return baseline;
  }

  if (state.session.flag === "yellow") {
    const sectorMessage = state.raceControl.find(
      (message) =>
        message.flag === "yellow" &&
        /sector\s*[1-3]/i.test(message.message),
    );

    const sectorMatch = sectorMessage?.message.match(/sector\s*([1-3])/i);
    const flaggedSector = Number(sectorMatch?.[1] ?? NaN);

    return baseline.map((snapshot) => {
      if (flaggedSector && snapshot.sector === flaggedSector) {
        return {
          ...snapshot,
          flag: "yellow",
          detail: "Local yellow",
        };
      }

      if (!flaggedSector) {
        return {
          ...snapshot,
          flag: "yellow",
          detail: "Yellow caution",
        };
      }

      return snapshot;
    });
  }

  if (state.session.flag === "checkered") {
    return baseline.map((snapshot) => ({
      ...snapshot,
      flag: "checkered",
      detail: "Chequered flag",
    }));
  }

  if (state.session.flag === "red") {
    return baseline.map((snapshot) => ({
      ...snapshot,
      flag: "red",
      detail: "Session stopped",
    }));
  }

  return baseline.map((snapshot) => ({
    ...snapshot,
    flag: state.session.flag,
    detail: state.session.flag === "safety_car" ? "Safety car" : "Virtual safety car",
  }));
};

export function LiveDashboard() {
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const [status, setStatus] = useState<LiveStreamStatus>("connecting");
  const [statusMessage, setStatusMessage] = useState("Connecting to live stream");
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null);
  const [focusedDriverCode, setFocusedDriverCode] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const streamUrl = `${API_BASE_URL}/live/stream`;
    const stream = new EventSource(streamUrl);

    stream.onopen = () => {
      setStatus("live");
      setStatusMessage("Live simulator stream connected");
    };

    stream.onerror = () => {
      setStatus("degraded");
      setStatusMessage("Connection issue detected, retrying stream");
    };

    const handleInitial = (event: MessageEvent<string>) => {
      const envelope = parseEnvelope<LiveState>(event.data);
      if (!envelope) {
        return;
      }

      setLiveState(envelope.payload);
    };

    const handleDelta = (event: MessageEvent<string>) => {
      const envelope = parseEnvelope<LiveDeltaPayload>(event.data);
      if (!envelope) {
        return;
      }

      setLiveState(envelope.payload.state);
    };

    const handleStatus = (event: MessageEvent<string>) => {
      const envelope = parseEnvelope<LiveStatusPayload>(event.data);
      if (!envelope) {
        return;
      }

      setStatus(envelope.payload.status);
      setStatusMessage(envelope.payload.message);
    };

    const handleHeartbeat = (event: MessageEvent<string>) => {
      const envelope = parseEnvelope<LiveHeartbeatPayload>(event.data);
      if (!envelope) {
        return;
      }

      setLastHeartbeat(envelope.payload.at);
    };

    stream.addEventListener("initial_state", handleInitial as EventListener);
    stream.addEventListener("delta_update", handleDelta as EventListener);
    stream.addEventListener("status", handleStatus as EventListener);
    stream.addEventListener("heartbeat", handleHeartbeat as EventListener);

    return () => {
      stream.removeEventListener("initial_state", handleInitial as EventListener);
      stream.removeEventListener("delta_update", handleDelta as EventListener);
      stream.removeEventListener("status", handleStatus as EventListener);
      stream.removeEventListener("heartbeat", handleHeartbeat as EventListener);
      stream.close();
    };
  }, []);

  const topRunners = useMemo(
    () => liveState?.leaderboard.slice(0, 10) ?? [],
    [liveState],
  );

  const recentRaceControl: LiveRaceControlMessage[] = useMemo(
    () => liveState?.raceControl.slice(0, 8) ?? [],
    [liveState],
  );

  const streamStale = useMemo(() => {
    if (!lastHeartbeat) {
      return false;
    }

    return nowMs - new Date(lastHeartbeat).getTime() > 40_000;
  }, [lastHeartbeat, nowMs]);

  const compoundBreakdown = useMemo(() => {
    if (!liveState) {
      return [];
    }

    const counts = new Map<string, number>();
    for (const entry of liveState.leaderboard) {
      counts.set(entry.tireCompound, (counts.get(entry.tireCompound) ?? 0) + 1);
    }

    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([compound, count]) => ({
        compound,
        count,
      }));
  }, [liveState]);

  const longestStints = useMemo(() => {
    if (!liveState) {
      return [];
    }

    return [...liveState.leaderboard]
      .sort((left, right) => right.stintLap - left.stintLap)
      .slice(0, 6);
  }, [liveState]);

  const sessionTimeline = useMemo(() => {
    if (!liveState) {
      return [];
    }

    return [
      {
        id: `session-lap-${liveState.session.currentLap}`,
        at: liveState.generatedAt,
        title: `Lap ${liveState.session.currentLap}`,
        detail: `Track ${formatFlag(liveState.session.flag)}`,
      },
      ...recentRaceControl.map((message) => ({
        id: message.id,
        at: message.emittedAt,
        title: message.category.toUpperCase(),
        detail: message.message,
      })),
    ];
  }, [liveState, recentRaceControl]);

  const selectedEntry = useMemo<LiveLeaderboardEntry | null>(() => {
    if (!liveState) {
      return null;
    }

    if (!focusedDriverCode) {
      return liveState.leaderboard[0] ?? null;
    }

    return (
      liveState.leaderboard.find(
        (entry) => entry.driverCode === focusedDriverCode,
      ) ?? null
    );
  }, [focusedDriverCode, liveState]);

  const selectedDriverCode = selectedEntry?.driverCode ?? null;

  const selectedAhead = useMemo(() => {
    if (!liveState || !selectedEntry) {
      return null;
    }

    return (
      liveState.leaderboard.find(
        (entry) => entry.position === selectedEntry.position - 1,
      ) ?? null
    );
  }, [liveState, selectedEntry]);

  const selectedBehind = useMemo(() => {
    if (!liveState || !selectedEntry) {
      return null;
    }

    return (
      liveState.leaderboard.find(
        (entry) => entry.position === selectedEntry.position + 1,
      ) ?? null
    );
  }, [liveState, selectedEntry]);

  const selectedTeammate = useMemo(() => {
    if (!liveState || !selectedEntry) {
      return null;
    }

    return (
      liveState.leaderboard.find(
        (entry) =>
          entry.teamName === selectedEntry.teamName &&
          entry.driverCode !== selectedEntry.driverCode,
      ) ?? null
    );
  }, [liveState, selectedEntry]);

  const selectedPaceDeltaMs = selectedEntry
    ? selectedEntry.lastLapMs - selectedEntry.bestLapMs
    : null;

  const sectorSnapshots = useMemo(
    () => (liveState ? deriveSectorSnapshots(liveState) : []),
    [liveState],
  );

  const trackMarkers = useMemo<TrackMarker[]>(() => {
    if (!liveState || liveState.leaderboard.length === 0) {
      return [];
    }

    const leader = liveState.leaderboard[0];
    const estimatedLeaderLapSec = Math.max(leader.lastLapMs / 1000, 85);
    const leaderProgress =
      ((Date.parse(liveState.generatedAt) / 1000) % estimatedLeaderLapSec) /
      estimatedLeaderLapSec;

    return liveState.leaderboard.slice(0, 10).map((entry) => {
      const trailingProgress = entry.gapToLeaderSec / estimatedLeaderLapSec;
      const progress = normalizeProgress(leaderProgress - trailingProgress);

      return {
        entry,
        progress,
        point: getTrackPointAtProgress(progress),
      };
    });
  }, [liveState]);

  return (
    <div className="space-y-5">
      <section className="panel p-5">
        <div className="flex flex-wrap items-center gap-3">
          <p
            className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${badgeToneByStatus[status]}`}
          >
            {status}
          </p>
          <p className="text-sm text-[var(--muted)]">{statusMessage}</p>
          {lastHeartbeat ? (
            <p className="text-xs text-[var(--muted)]">
              Last heartbeat {formatClock(lastHeartbeat)}
            </p>
          ) : null}
        </div>

        {streamStale ? (
          <p className="mt-3 rounded-lg border border-orange-700/20 bg-orange-500/10 px-3 py-2 text-sm text-orange-900">
            Live heartbeat is stale. Data may be delayed while the stream reconnects.
          </p>
        ) : null}

        {liveState ? (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <article className="rounded-lg border border-black/10 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-black/55">Session</p>
                <p className="text-lg text-[var(--ink)]">{liveState.session.sessionName}</p>
              </article>
              <article className="rounded-lg border border-black/10 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-black/55">Lap</p>
                <p className="text-lg text-[var(--ink)]">
                  {liveState.session.currentLap} / {liveState.session.totalLaps}
                </p>
              </article>
              <article className="rounded-lg border border-black/10 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-black/55">Track Flag</p>
                <p
                  className={`mt-1 inline-flex rounded-full border px-2 py-1 text-sm font-semibold uppercase tracking-wide ${flagToneByValue[liveState.session.flag] ?? "bg-zinc-500/20 text-zinc-900 border-zinc-700/20"}`}
                >
                  {formatFlag(liveState.session.flag)}
                </p>
              </article>
              <article className="rounded-lg border border-black/10 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-black/55">Session Clock</p>
                <p className="text-lg text-[var(--ink)]">{formatClock(liveState.session.clockIso)}</p>
              </article>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {sectorSnapshots.map((snapshot) => (
                <article
                  key={`sector-${snapshot.sector}`}
                  className="rounded-lg border border-black/10 px-3 py-2"
                >
                  <p className="text-xs uppercase tracking-wide text-black/55">
                    Sector {snapshot.sector}
                  </p>
                  <p
                    className={`mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-semibold uppercase tracking-wide ${flagToneByValue[snapshot.flag] ?? "bg-zinc-500/20 text-zinc-900 border-zinc-700/20"}`}
                  >
                    {formatFlag(snapshot.flag)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{snapshot.detail}</p>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--muted)]">
            Waiting for initial snapshot from live stream.
          </p>
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <article className="panel overflow-hidden p-0">
          <div className="border-b border-black/10 px-4 py-3">
            <h2 className="text-2xl uppercase tracking-wide text-[var(--ink)]">Live Leaderboard</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-black/[0.04] text-left text-xs uppercase tracking-wide text-black/55">
                <tr>
                  <th className="px-4 py-2">Pos</th>
                  <th className="px-4 py-2">Driver</th>
                  <th className="px-4 py-2">Team</th>
                  <th className="px-4 py-2">Gap</th>
                  <th className="px-4 py-2">Last</th>
                  <th className="px-4 py-2">Best</th>
                  <th className="px-4 py-2">Tire</th>
                </tr>
              </thead>
              <tbody>
                {topRunners.map((entry) => (
                  <tr
                    key={entry.driverCode}
                    className={`border-t border-black/5 ${selectedDriverCode === entry.driverCode ? "bg-[var(--accent)]/6" : ""}`}
                  >
                    <td className="px-4 py-2 font-semibold text-black/75">P{entry.position}</td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => setFocusedDriverCode(entry.driverCode)}
                        className="text-left"
                      >
                        <p className="font-semibold text-[var(--ink)]">{entry.driverCode}</p>
                        <p className="text-xs text-[var(--muted)]">{entry.driverName}</p>
                      </button>
                    </td>
                    <td className="px-4 py-2 text-[var(--muted)]">{entry.teamName}</td>
                    <td className="px-4 py-2 text-[var(--muted)]">
                      {entry.gapToLeaderSec === 0
                        ? "LEADER"
                        : `+${entry.gapToLeaderSec.toFixed(3)}s`}
                    </td>
                    <td className="px-4 py-2">{formatLapTime(entry.lastLapMs)}</td>
                    <td className="px-4 py-2">{formatLapTime(entry.bestLapMs)}</td>
                    <td className="px-4 py-2 text-xs uppercase tracking-wide text-black/65">
                      {entry.tireCompound} (L{entry.stintLap})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel p-4">
          <h2 className="text-2xl uppercase tracking-wide text-[var(--ink)]">Race Control</h2>
          <ul className="mt-3 space-y-2">
            {recentRaceControl.length > 0 ? (
              recentRaceControl.map((message) => (
                <li key={message.id} className="rounded-lg border border-black/10 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-black/55">
                    {message.category}
                    {message.flag ? ` - ${message.flag.replaceAll("_", " ")}` : ""}
                  </p>
                  <p className="text-sm text-[var(--ink)]">{message.message}</p>
                  <p className="text-xs text-[var(--muted)]">{formatClock(message.emittedAt)}</p>
                </li>
              ))
            ) : (
              <li className="rounded-lg border border-dashed border-black/20 px-3 py-2 text-sm text-[var(--muted)]">
                Waiting for race control updates.
              </li>
            )}
          </ul>
        </article>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <article className="panel p-4">
          <h2 className="text-2xl uppercase tracking-wide text-[var(--ink)]">Track Map</h2>
          {trackMarkers.length > 0 ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-lg border border-black/10 bg-black/[0.02] p-2">
                <svg viewBox="0 0 100 100" className="h-[250px] w-full" role="img" aria-label="Live track map">
                  <path d={TRACK_PATH_D} fill="none" stroke="rgba(17, 19, 24, 0.13)" strokeWidth="7" />
                  <path
                    d={TRACK_PATH_D}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="2 3"
                  />
                  {[1 / 3, 2 / 3].map((boundary, index) => {
                    const boundaryPoint = getTrackPointAtProgress(boundary);
                    return (
                      <g key={`sector-boundary-${index + 1}`}>
                        <circle
                          cx={boundaryPoint.x}
                          cy={boundaryPoint.y}
                          r={1.8}
                          fill="var(--panel)"
                          stroke="rgba(17, 19, 24, 0.55)"
                          strokeWidth="0.35"
                        />
                        <text
                          x={boundaryPoint.x + 2}
                          y={boundaryPoint.y - 2}
                          fontSize="2.9"
                          fill="rgba(17, 19, 24, 0.75)"
                        >
                          S{index + 2}
                        </text>
                      </g>
                    );
                  })}

                  {trackMarkers.map((marker) => {
                    const isFocused = selectedDriverCode === marker.entry.driverCode;
                    const isLeader = marker.entry.position === 1;
                    return (
                      <g key={`track-marker-${marker.entry.driverCode}`}>
                        {isFocused ? (
                          <circle
                            cx={marker.point.x}
                            cy={marker.point.y}
                            r={3.3}
                            fill="none"
                            stroke="var(--accent)"
                            strokeWidth="0.85"
                            opacity="0.6"
                          />
                        ) : null}
                        <circle
                          cx={marker.point.x}
                          cy={marker.point.y}
                          r={isLeader ? 2.6 : 2.1}
                          fill={isLeader ? "var(--panel)" : "rgba(17, 19, 24, 0.88)"}
                          stroke={isLeader ? "var(--accent)" : "var(--panel)"}
                          strokeWidth={isLeader ? 1 : 0.45}
                        />
                      </g>
                    );
                  })}
                </svg>
              </div>

              <ul className="space-y-2">
                {trackMarkers.slice(0, 6).map((marker) => (
                  <li
                    key={`track-row-${marker.entry.driverCode}`}
                    className="flex items-center justify-between rounded-lg border border-black/10 px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => setFocusedDriverCode(marker.entry.driverCode)}
                      className="text-left"
                    >
                      <p className="text-sm font-semibold text-[var(--ink)]">
                        P{marker.entry.position} {marker.entry.driverCode}
                      </p>
                      <p className="text-xs text-[var(--muted)]">{marker.entry.teamName}</p>
                    </button>
                    <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      S{getSectorFromProgress(marker.progress)} - {Math.round(marker.progress * 100)}%
                    </p>
                  </li>
                ))}
              </ul>

              <p className="text-xs text-[var(--muted)]">
                Relative positions are estimated from gaps to leader until provider-grade GPS telemetry is enabled.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--muted)]">Track map will render once live positions arrive.</p>
          )}
        </article>

        <article className="panel p-4">
          <h2 className="text-2xl uppercase tracking-wide text-[var(--ink)]">Session Timeline</h2>
          <ol className="mt-3 space-y-2">
            {sessionTimeline.length > 0 ? (
              sessionTimeline.map((item) => (
                <li key={item.id} className="rounded-lg border border-black/10 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-black/55">{item.title}</p>
                  <p className="text-sm text-[var(--ink)]">{item.detail}</p>
                  <p className="text-xs text-[var(--muted)]">{formatClock(item.at)}</p>
                </li>
              ))
            ) : (
              <li className="rounded-lg border border-dashed border-black/20 px-3 py-2 text-sm text-[var(--muted)]">
                Timeline will populate when session updates arrive.
              </li>
            )}
          </ol>
        </article>

        <article className="panel p-4">
          <h2 className="text-2xl uppercase tracking-wide text-[var(--ink)]">Tire Strategy</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {compoundBreakdown.length > 0 ? (
              compoundBreakdown.map((item) => (
                <span
                  key={item.compound}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${compoundTone[item.compound] ?? "bg-zinc-500/20 text-zinc-900 border-zinc-700/20"}`}
                >
                  {item.compound}: {item.count}
                </span>
              ))
            ) : (
              <p className="text-sm text-[var(--muted)]">Waiting for tire data.</p>
            )}
          </div>

          <div className="mt-4 space-y-2">
            {longestStints.map((entry) => (
              <div
                key={`${entry.driverCode}-${entry.position}`}
                className="rounded-lg border border-black/10 px-3 py-2"
              >
                <p className="text-sm font-semibold text-[var(--ink)]">
                  {entry.driverCode} ({entry.teamName})
                </p>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  {entry.tireCompound} stint - lap {entry.stintLap}
                </p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel p-4">
        <h2 className="text-2xl uppercase tracking-wide text-[var(--ink)]">Driver Focus</h2>
        {selectedEntry ? (
          <div className="mt-3 space-y-3">
            <div className="rounded-lg border border-black/10 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-black/55">Selected Driver</p>
              <p className="text-lg font-semibold text-[var(--ink)]">
                P{selectedEntry.position} {selectedEntry.driverCode}
              </p>
              <p className="text-sm text-[var(--muted)]">{selectedEntry.driverName}</p>
              <p className="text-sm text-[var(--muted)]">{selectedEntry.teamName}</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-black/10 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-black/55">Last Lap</p>
                <p className="text-sm text-[var(--ink)]">{formatLapTime(selectedEntry.lastLapMs)}</p>
              </div>
              <div className="rounded-lg border border-black/10 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-black/55">Best Lap</p>
                <p className="text-sm text-[var(--ink)]">{formatLapTime(selectedEntry.bestLapMs)}</p>
              </div>
              <div className="rounded-lg border border-black/10 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-black/55">Gap to Leader</p>
                <p className="text-sm text-[var(--ink)]">
                  {selectedEntry.gapToLeaderSec === 0
                    ? "LEADER"
                    : formatSignedSeconds(selectedEntry.gapToLeaderSec)}
                </p>
              </div>
              <div className="rounded-lg border border-black/10 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-black/55">Interval Ahead</p>
                <p className="text-sm text-[var(--ink)]">
                  {selectedEntry.intervalToAheadSec === 0
                    ? "-"
                    : formatSignedSeconds(selectedEntry.intervalToAheadSec)}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-black/10 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-black/55">Pace Delta</p>
              <p className="text-sm text-[var(--ink)]">
                {selectedPaceDeltaMs != null
                  ? `${formatSignedSeconds(selectedPaceDeltaMs / 1000)} vs personal best (${getPaceTrend(selectedPaceDeltaMs)})`
                  : "-"}
              </p>
            </div>

            <div className="rounded-lg border border-black/10 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-black/55">Closest Rivals</p>
              <p className="text-sm text-[var(--ink)]">
                Ahead: {selectedAhead ? `P${selectedAhead.position} ${selectedAhead.driverCode}` : "none"}
              </p>
              <p className="text-sm text-[var(--ink)]">
                Behind: {selectedBehind ? `P${selectedBehind.position} ${selectedBehind.driverCode}` : "none"}
              </p>
              <p className="text-sm text-[var(--ink)]">
                Team mate: {selectedTeammate ? `P${selectedTeammate.position} ${selectedTeammate.driverCode}` : "none"}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--muted)]">
            Select a driver in the leaderboard to inspect pace and track position context.
          </p>
        )}
      </section>
    </div>
  );
}
