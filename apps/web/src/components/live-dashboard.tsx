"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LiveDeltaPayload,
  LiveEnvelope,
  LiveHeartbeatPayload,
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

const formatClock = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));

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

export function LiveDashboard() {
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const [status, setStatus] = useState<LiveStreamStatus>("connecting");
  const [statusMessage, setStatusMessage] = useState("Connecting to live stream");
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null);

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

        {liveState ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
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
              <p className="text-lg uppercase text-[var(--ink)]">
                {liveState.session.flag.replaceAll("_", " ")}
              </p>
            </article>
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
                  <tr key={entry.driverCode} className="border-t border-black/5">
                    <td className="px-4 py-2 font-semibold text-black/75">P{entry.position}</td>
                    <td className="px-4 py-2">
                      <p className="font-semibold text-[var(--ink)]">{entry.driverCode}</p>
                      <p className="text-xs text-[var(--muted)]">{entry.driverName}</p>
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
    </div>
  );
}
