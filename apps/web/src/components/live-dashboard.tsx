"use client";

import { useMemo } from "react";
import { resolveGapMode } from "@/lib/live-board";
import { LiveBoardTable } from "@/components/live-dashboard-table";
import { LiveRaceControlPanel } from "@/components/live-race-control-panel";
import {
  LiveDashboardAlerts,
  LiveDashboardEmptyState,
} from "@/components/live-dashboard-state";
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
          <LiveDashboardAlerts
            streamStale={streamStale}
            projectionMode={boardState.projection.mode}
          />
          <LiveBoardTable rows={rows} gapMode={gapMode} />
          <LiveRaceControlPanel
            fastestBestLapMs={boardState.fastestBestLapMs}
            raceControl={boardState.raceControl}
          />
        </div>
      ) : (
        <LiveDashboardEmptyState noFeedYet={noFeedYet} />
      )}
    </section>
  );
}
