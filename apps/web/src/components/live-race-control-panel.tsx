import { LiveRaceControlMessage } from "@/lib/types";
import { formatClock, formatLapTime } from "@/lib/live-board";

export function LiveRaceControlPanel({
  fastestBestLapMs,
  raceControl,
}: {
  fastestBestLapMs: number | null;
  raceControl: LiveRaceControlMessage[];
}) {
  return (
    <div className="border-t border-[var(--line)] bg-[#0a121e] px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.2em] text-[#8aa0be]">
          Race Control
        </p>
        {fastestBestLapMs != null ? (
          <p className="text-xs uppercase tracking-[0.18em] text-fuchsia-200">
            Fastest lap {formatLapTime(fastestBestLapMs)}
          </p>
        ) : null}
      </div>
      {raceControl.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--muted)]">
          No race control messages yet.
        </p>
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
  );
}
