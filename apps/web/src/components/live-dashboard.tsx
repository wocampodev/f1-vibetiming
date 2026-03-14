"use client";

import { useMemo } from "react";
import { resolveGapMode } from "@/lib/live-board";
import { LiveBoardTable } from "@/components/live-dashboard-table";
import { LiveRaceControlPanel } from "@/components/live-race-control-panel";
import { useLiveBoardStream } from "@/components/use-live-board-stream";

export function LiveDashboard() {
  const { boardState, streamStale, noFeedYet } = useLiveBoardStream();
  const rows = boardState?.rows ?? [];
  const gapMode = useMemo(
    () => resolveGapMode(boardState?.session ?? null),
    [boardState?.session],
  );

  return (
    <section className="panel overflow-hidden p-0">
      {boardState ? (
        <div>
          {(streamStale ||
            boardState?.projection.mode === "stabilized" ||
            boardState?.projection.mode === "withheld") && (
            <div className="space-y-2 border-b border-[var(--line)] bg-[#0a121e] px-5 py-4">
              {streamStale ? (
                <p className="rounded-md border border-orange-400/40 bg-orange-400/10 px-3 py-2 text-xs text-orange-200">
                  Feed is stale. Showing the latest available board projection.
                </p>
              ) : null}

              {boardState?.projection.mode === "stabilized" ? (
                <p className="rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100">
                  Leader order is being stabilized while provider confidence
                  catches up.
                </p>
              ) : null}

              {boardState?.projection.mode === "withheld" ? (
                <p className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                  Public leader is temporarily withheld until a trustworthy
                  running order is available.
                </p>
              ) : null}
            </div>
          )}
          <LiveBoardTable rows={rows} gapMode={gapMode} />
          <LiveRaceControlPanel
            fastestBestLapMs={boardState.fastestBestLapMs}
            raceControl={boardState.raceControl}
          />
        </div>
      ) : (
        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-[var(--muted)]">
            Waiting for live board projection.
          </p>
          {noFeedYet ? (
            <p className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
              Provider is connected but no timing updates are being published
              yet. This usually means there is no active official live session
              at the moment.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
