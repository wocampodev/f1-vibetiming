"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LiveDeltaPayload,
  LiveEnvelope,
  LiveHeartbeatPayload,
  LiveLeaderboardEntry,
  LiveState,
  LiveStatusPayload,
  LiveStreamStatus,
} from "@/lib/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

const statusToneByValue: Record<LiveStreamStatus, string> = {
  connecting: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  live: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  degraded: "border-orange-400/40 bg-orange-400/10 text-orange-200",
  stopped: "border-zinc-400/40 bg-zinc-400/10 text-zinc-200",
};

const tireToneByValue: Record<string, string> = {
  SOFT: "border-red-400/40 bg-red-400/10 text-red-200",
  MEDIUM: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  HARD: "border-zinc-300/40 bg-zinc-300/10 text-zinc-100",
  INTERMEDIATE: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  WET: "border-blue-400/40 bg-blue-400/10 text-blue-200",
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

const formatLapTime = (milliseconds: number): string => {
  const totalSeconds = milliseconds / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
};

const formatSectorTime = (milliseconds: number): string =>
  `${(milliseconds / 1000).toFixed(3)}`;

const formatGap = (seconds: number): string =>
  seconds === 0 ? "LEADER" : `+${seconds.toFixed(3)}`;

const getPositionTone = (position: number): string =>
  positionTone[(position - 1) % positionTone.length] ?? "from-slate-500 to-slate-600";

function SectorCell({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
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
  const [status, setStatus] = useState<LiveStreamStatus>("connecting");
  const [statusMessage, setStatusMessage] = useState("Connecting to live stream");
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null);
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
    const stream = new EventSource(`${API_BASE_URL}/live/stream`);

    stream.onopen = () => {
      setStatus("live");
      setStatusMessage("Live stream connected");
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

  const streamStale = useMemo(() => {
    if (!lastHeartbeat) {
      return false;
    }

    return nowMs - new Date(lastHeartbeat).getTime() > 40_000;
  }, [lastHeartbeat, nowMs]);

  const sectorMax = useMemo(() => {
    if (!liveState || liveState.leaderboard.length === 0) {
      return { s1: 1, s2: 1, s3: 1 };
    }

    return {
      s1: Math.max(...liveState.leaderboard.map((entry) => entry.sector1Ms)),
      s2: Math.max(...liveState.leaderboard.map((entry) => entry.sector2Ms)),
      s3: Math.max(...liveState.leaderboard.map((entry) => entry.sector3Ms)),
    };
  }, [liveState]);

  const rows: LiveLeaderboardEntry[] = liveState?.leaderboard ?? [];

  return (
    <section className="panel overflow-hidden p-0">
      <div className="border-b border-[var(--line)] bg-[#0a121e] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#8aa0be]">Timing Feed</p>
            <p className="text-3xl font-bold leading-tight text-[#f4f9ff]">
              {liveState?.session.sessionName ?? "Loading session"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusToneByValue[status]}`}
            >
              {status}
            </span>
            {liveState ? (
              <span className="rounded-full border border-[var(--line)] bg-[#0e1827] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#d3e1f5]">
                L{liveState.session.currentLap}/{liveState.session.totalLaps}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
          <span>{statusMessage}</span>
          {lastHeartbeat ? <span>Heartbeat {formatClock(lastHeartbeat)}</span> : null}
          {liveState ? <span>Updated {formatClock(liveState.generatedAt)}</span> : null}
        </div>

        {streamStale ? (
          <p className="mt-2 rounded-md border border-orange-400/40 bg-orange-400/10 px-3 py-2 text-xs text-orange-200">
            Stream heartbeat is stale. Values may lag while reconnecting.
          </p>
        ) : null}
      </div>

      {liveState ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1160px] bg-[#070d15] text-sm">
            <thead className="border-b border-[var(--line)] bg-[#101b2a] text-left text-xs uppercase tracking-wide text-[#94a7c2]">
              <tr>
                <th className="px-2 py-2">Pos</th>
                <th className="px-2 py-2">Driver</th>
                <th className="px-2 py-2">Team</th>
                <th className="px-2 py-2">Tire</th>
                <th className="px-2 py-2">S1</th>
                <th className="px-2 py-2">S2</th>
                <th className="px-2 py-2">S3</th>
                <th className="px-2 py-2">Lap</th>
                <th className="px-2 py-2">Gap</th>
                <th className="px-2 py-2">Int</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
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
                      <span className="text-xs text-[var(--muted)]">{entry.driverName}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-sm text-[var(--muted)]">{entry.teamName}</td>
                  <td className="px-2 py-2">
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${tireToneByValue[entry.tireCompound] ?? tireToneByValue.HARD}`}
                    >
                      {entry.tireCompound} L{entry.stintLap}
                    </span>
                  </td>
                  <SectorCell label="S1" value={entry.sector1Ms} max={sectorMax.s1} />
                  <SectorCell label="S2" value={entry.sector2Ms} max={sectorMax.s2} />
                  <SectorCell label="S3" value={entry.sector3Ms} max={sectorMax.s3} />
                  <td className="px-2 py-2 font-mono text-[1.65rem] leading-none text-[#f1f7ff]">
                    {formatLapTime(entry.lastLapMs)}
                  </td>
                  <td className="px-2 py-2 font-mono text-xl text-[#dce9fb]">
                    {formatGap(entry.gapToLeaderSec)}
                  </td>
                  <td className="px-2 py-2 font-mono text-xl text-[#9eb3cd]">
                    {entry.position === 1 ? "-" : `+${entry.intervalToAheadSec.toFixed(3)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-4 text-sm text-[var(--muted)]">
          Waiting for initial snapshot from live stream.
        </p>
      )}
    </section>
  );
}
