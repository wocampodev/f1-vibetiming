import { formatClock } from "@/lib/live-board";
import { LiveBoardState } from "@/lib/types";

const flagToneByStatus: Record<LiveBoardState["session"]["flag"], string> = {
  green: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
  yellow: "border-yellow-400/40 bg-yellow-400/10 text-yellow-100",
  red: "border-red-400/40 bg-red-500/10 text-red-100",
  safety_car: "border-orange-400/40 bg-orange-500/10 text-orange-100",
  virtual_safety_car: "border-cyan-400/40 bg-cyan-500/10 text-cyan-100",
  checkered: "border-slate-300/40 bg-slate-200/10 text-slate-100",
};

const phaseLabel = (phase: LiveBoardState["session"]["phase"]) => {
  if (phase === "finished") {
    return "Finished";
  }

  if (phase === "running") {
    return "Live";
  }

  return "Waiting";
};

const flagLabel = (flag: LiveBoardState["session"]["flag"]) =>
  flag.replace(/_/g, " ");

export function LiveDashboardHeader({
  boardState,
}: {
  boardState: LiveBoardState;
}) {
  const sessionName = boardState.session.sessionName ?? "Official live session";
  const lapLabel =
    boardState.session.currentLap == null
      ? null
      : boardState.session.totalLaps == null
        ? `Lap ${boardState.session.currentLap}`
        : `Lap ${boardState.session.currentLap}/${boardState.session.totalLaps}`;

  return (
    <div className="border-b border-[var(--line)] bg-[#0b1420] px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#67d6ff]">
            Live timing
          </p>
          <h1 className="mt-1 text-2xl uppercase tracking-wide text-[var(--ink)] sm:text-3xl">
            {sessionName}
          </h1>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 text-xs uppercase tracking-[0.18em]">
          <span className="rounded-full border border-[#31506f] bg-[#122236] px-3 py-1 text-[#cfe2ff]">
            {phaseLabel(boardState.session.phase)}
          </span>
          <span
            className={`rounded-full border px-3 py-1 ${flagToneByStatus[boardState.session.flag]}`}
          >
            {flagLabel(boardState.session.flag)}
          </span>
          {lapLabel ? (
            <span className="rounded-full border border-[#2a4058] bg-[#0f1c2d] px-3 py-1 text-[#9ec5e8]">
              {lapLabel}
            </span>
          ) : null}
          <span className="rounded-full border border-[#2a4058] bg-[#0f1c2d] px-3 py-1 text-[#8aa0be]">
            Updated {formatClock(boardState.generatedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function LiveDashboardAlerts({
  streamStale,
  projectionMode,
}: {
  streamStale: boolean;
  projectionMode: "pass_through" | "stabilized" | "withheld";
}) {
  if (!streamStale && projectionMode === "pass_through") {
    return null;
  }

  return (
    <div className="space-y-2 border-b border-[var(--line)] bg-[#0a121e] px-5 py-4">
      {streamStale ? (
        <p className="rounded-md border border-orange-400/40 bg-orange-400/10 px-3 py-2 text-xs text-orange-200">
          Feed is stale. Showing the latest available board projection.
        </p>
      ) : null}

      {projectionMode === "stabilized" ? (
        <p className="rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100">
          Leader order is being stabilized while provider confidence catches up.
        </p>
      ) : null}

      {projectionMode === "withheld" ? (
        <p className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
          Public leader is temporarily withheld until a trustworthy running
          order is available.
        </p>
      ) : null}
    </div>
  );
}

export function LiveDashboardEmptyState({ noFeedYet }: { noFeedYet: boolean }) {
  return (
    <div className="space-y-3 px-5 py-4">
      <p className="text-sm text-[var(--muted)]">
        Waiting for live board projection.
      </p>
      {noFeedYet ? (
        <p className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          Provider is connected but no timing updates are being published yet.
          This usually means there is no active official live session at the
          moment.
        </p>
      ) : null}
    </div>
  );
}
