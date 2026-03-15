"use client";

import { useMemo } from "react";
import { resolveGapMode } from "@/lib/live-board";
import { LiveBoardTable } from "@/components/live-dashboard-table";
import { LiveRaceControlPanel } from "@/components/live-race-control-panel";
import {
  LiveDashboardAlerts,
  LiveDashboardEmptyState,
  LiveDashboardHeader,
} from "@/components/live-dashboard-state";
import { useLiveBoardStream } from "@/components/use-live-board-stream";
import { LiveBoardState, LiveHealthState } from "@/lib/types";

export function LiveDashboard({
  initialBoardState = null,
  initialHealth = null,
}: {
  initialBoardState?: LiveBoardState | null;
  initialHealth?: LiveHealthState | null;
}) {
  const { boardState, streamStale, noFeedYet } = useLiveBoardStream({
    initialBoardState,
    initialHealth,
  });
  const rows = boardState?.rows ?? [];
  const gapMode = useMemo(
    () => resolveGapMode(boardState?.session ?? null),
    [boardState?.session],
  );

  return (
    <section className="panel overflow-hidden p-0">
      {boardState ? (
        <div>
          <LiveDashboardHeader boardState={boardState} />
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
