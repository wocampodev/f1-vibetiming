"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LiveDeltaPayload,
  LiveEnvelope,
  LiveHeartbeatPayload,
  LiveLeaderboardEntry,
  LiveState,
  LiveStreamStatus,
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

const positionTone = [
  "from-red-500 to-red-600",
  "from-orange-500 to-orange-600",
  "from-blue-500 to-blue-600",
  "from-cyan-500 to-cyan-600",
  "from-sky-500 to-sky-600",
  "from-slate-500 to-slate-600",
  "from-pink-500 to-pink-600",
  "from-teal-500 to-teal-600",
  "from-indigo-500 to-indigo-600",
  "from-blue-600 to-blue-700",
];

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

  return `${(milliseconds / 1000).toFixed(3)}`;
};

const formatGap = (seconds: number | null, isLeader: boolean): string => {
  if (isLeader) {
    return "LEADER";
  }

  if (seconds == null) {
    return "-";
  }

  return `+${seconds.toFixed(3)}`;
};

const formatFlagLabel = (value: string): string =>
  value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

const getPositionTone = (position: number): string =>
  positionTone[(position - 1) % positionTone.length] ?? "from-slate-500 to-slate-600";

interface LiveHealth {
  status: LiveStreamStatus;
  details?: {
    socketOpen?: boolean;
    connectionUptimeSec?: number | null;
    feedMessagesReceived?: number;
  } | null;
}

function SectorCell({
  label,
  value,
  max,
}: {
  label: string;
  value: number | null;
  max: number;
}) {
  if (value == null) {
    return (
      <td className="px-2 py-2 font-mono text-lg leading-none text-[#8aa0be]">
        <span>-</span>
      </td>
    );
  }

  const widthPct = Math.max(8, Math.round((value / max) * 100));

  return (
    <td className="px-2 py-2 font-mono text-lg leading-none text-[#f1f7ff]">
      <div className="flex flex-col gap-1">
        <div className="h-1.5 w-full rounded-full bg-[#1a2432]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#ffd84f] to-[#ffbf00]"
            style={{ width: `${widthPct}%` }}
            aria-label={`${label} progress`}
          />
        </div>
        <span>{formatSectorTime(value)}</span>
      </div>
    </td>
  );
}

export function LiveDashboard() {
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null);
  const [health, setHealth] = useState<LiveHealth | null>(null);
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

        const payload = (await response.json()) as LiveHealth;
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

    const stopFallback = () => {
      if (!fallbackTimer) {
        return;
      }

      window.clearInterval(fallbackTimer);
      fallbackTimer = null;
    };

    const pollState = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/live/state`, {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }

        const state = (await response.json()) as LiveState | null;
        if (!state) {
          return;
        }

        setLiveState(state);
      } catch {
        // keep retrying on next interval
      }
    };

    const startFallback = () => {
      if (fallbackTimer) {
        return;
      }

      void pollState();
      fallbackTimer = window.setInterval(() => {
        void pollState();
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
      };

      stream.onerror = () => {
        startFallback();
        closeStream();
        scheduleReconnect();
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

      const handleHeartbeat = (event: MessageEvent<string>) => {
        const envelope = parseEnvelope<LiveHeartbeatPayload>(event.data);
        if (!envelope) {
          return;
        }

        setLastHeartbeat(envelope.payload.at);
      };

      stream.addEventListener("initial_state", handleInitial as EventListener);
      stream.addEventListener("delta_update", handleDelta as EventListener);
      stream.addEventListener("heartbeat", handleHeartbeat as EventListener);
    };

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
    const reference = lastHeartbeat ?? liveState?.generatedAt ?? null;
    if (!reference) {
      return false;
    }

    return nowMs - new Date(reference).getTime() > STALE_THRESHOLD_MS;
  }, [lastHeartbeat, liveState?.generatedAt, nowMs]);

  const sectorMax = useMemo(() => {
    if (!liveState || liveState.leaderboard.length === 0) {
      return { s1: 1, s2: 1, s3: 1 };
    }

    const s1Values = liveState.leaderboard
      .map((entry) => entry.sector1Ms)
      .filter((value): value is number => value != null);
    const s2Values = liveState.leaderboard
      .map((entry) => entry.sector2Ms)
      .filter((value): value is number => value != null);
    const s3Values = liveState.leaderboard
      .map((entry) => entry.sector3Ms)
      .filter((value): value is number => value != null);

    return {
      s1: s1Values.length > 0 ? Math.max(...s1Values) : 1,
      s2: s2Values.length > 0 ? Math.max(...s2Values) : 1,
      s3: s3Values.length > 0 ? Math.max(...s3Values) : 1,
    };
  }, [liveState]);

  const rows: LiveLeaderboardEntry[] = liveState?.leaderboard ?? [];
  const raceControl = liveState?.raceControl ?? [];
  const partialLeaderboard = rows.length > 0 && rows[0].position > 1;
  const noFeedYet =
    !liveState &&
    health?.details?.socketOpen === true &&
    (health.details.connectionUptimeSec ?? 0) >= NO_FEED_NOTICE_THRESHOLD_SEC &&
    (health.details.feedMessagesReceived ?? 0) === 0;
  const lapLabel =
    liveState?.session.currentLap != null && liveState.session.totalLaps != null
      ? `L${liveState.session.currentLap}/${liveState.session.totalLaps}`
      : "L-/-";

  return (
    <section className="panel overflow-hidden p-0">
      <div className="border-b border-[var(--line)] bg-[#0a121e] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#8aa0be]">Timing Feed</p>
            <p className="text-3xl font-bold leading-tight text-[#f4f9ff]">
              {liveState?.session.sessionName ?? "Formula 1 Live Timing"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[var(--line)] bg-[#0e1827] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#d3e1f5]">
              {lapLabel}
            </span>
            {liveState ? (
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${flagToneByValue[liveState.session.flag] ?? "border-zinc-400/40 bg-zinc-400/10 text-zinc-200"}`}
                >
                  {formatFlagLabel(liveState.session.flag)}
                </span>
              ) : null}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
          {liveState ? <span>Updated {formatClock(liveState.generatedAt)}</span> : null}
          {liveState?.session.clockIso ? <span>Clock {formatClock(liveState.session.clockIso)}</span> : null}
        </div>

        {streamStale ? (
          <p className="mt-2 rounded-md border border-orange-400/40 bg-orange-400/10 px-3 py-2 text-xs text-orange-200">
            Feed is stale. Showing latest available timing data.
          </p>
        ) : null}

        {partialLeaderboard ? (
          <p className="mt-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            Showing available timing rows while full order data is still arriving.
          </p>
        ) : null}
      </div>

      {liveState ? (
        <div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] bg-[#070d15] text-sm">
              <thead className="border-b border-[var(--line)] bg-[#101b2a] text-left text-xs uppercase tracking-wide text-[#94a7c2]">
                <tr>
                  <th className="px-2 py-2">Pos</th>
                  <th className="px-2 py-2">Driver</th>
                  <th className="px-2 py-2">S1</th>
                  <th className="px-2 py-2">S2</th>
                  <th className="px-2 py-2">S3</th>
                  <th className="px-2 py-2">Lap</th>
                  <th className="px-2 py-2">Best</th>
                  <th className="px-2 py-2">Gap</th>
                  <th className="px-2 py-2">Int</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => {
                  return (
                    <tr key={entry.driverCode} className="border-b border-[var(--line)]/60 hover:bg-[#0c1420]">
                    <td className="px-2 py-2">
                      <span
                        className={`inline-flex min-w-11 items-center justify-center rounded-md bg-gradient-to-r px-2 py-1 text-base font-bold text-white ${getPositionTone(entry.position)}`}
                      >
                        {entry.position}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md border border-[#2f4c69] bg-[#102034] px-2 py-0.5 text-xl font-bold tracking-wide text-[#d7ebff]">
                          {entry.driverCode}
                        </span>
                        {entry.driverName ? (
                          <span className="text-xs text-[var(--muted)]">{entry.driverName}</span>
                        ) : null}
                      </div>
                    </td>
                    <SectorCell label="S1" value={entry.sector1Ms} max={sectorMax.s1} />
                    <SectorCell label="S2" value={entry.sector2Ms} max={sectorMax.s2} />
                    <SectorCell label="S3" value={entry.sector3Ms} max={sectorMax.s3} />
                    <td className="px-2 py-2 font-mono text-[1.65rem] leading-none text-[#f1f7ff]">
                      {formatLapTime(entry.lastLapMs)}
                    </td>
                    <td className="px-2 py-2 font-mono text-xl text-[#9eb3cd]">
                      {formatLapTime(entry.bestLapMs)}
                    </td>
                    <td className="px-2 py-2 font-mono text-xl text-[#dce9fb]">
                      {formatGap(entry.gapToLeaderSec, entry.position === 1)}
                    </td>
                    <td className="px-2 py-2 font-mono text-xl text-[#9eb3cd]">
                      {entry.position === 1
                        ? "-"
                        : entry.intervalToAheadSec == null
                          ? "-"
                          : `+${entry.intervalToAheadSec.toFixed(3)}`}
                    </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="border-t border-[var(--line)] bg-[#0a121e] px-5 py-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[#8aa0be]">Race Control</p>
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
          <p className="text-sm text-[var(--muted)]">Waiting for live snapshot.</p>
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
