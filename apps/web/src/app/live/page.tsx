import type { Metadata } from "next";
import { LiveDashboard } from "@/components/live-dashboard";
import { formatClock } from "@/lib/live-board";
import { getLiveBoard, getLiveHealth } from "@/lib/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live Timing",
  description:
    "Track the current F1 session with the live board, sector splits, race control, and feed health.",
  alternates: {
    canonical: "/live",
  },
};

const healthLabel: Record<string, string> = {
  connecting: "Connecting",
  live: "Live",
  degraded: "Degraded",
  stopped: "Stopped",
};

export default async function LivePage() {
  const [initialBoardState, initialHealth] = await Promise.all([
    getLiveBoard(),
    getLiveHealth(),
  ]);
  const sessionName =
    initialBoardState?.session.sessionName ?? "Awaiting official session";
  const liveStatus =
    initialHealth?.status != null
      ? healthLabel[initialHealth.status] ?? initialHealth.status
      : "Offline";
  const feedCount = initialHealth?.details?.feedMessagesReceived ?? 0;
  const lastSignalAt =
    initialHealth?.lastEventAt ?? initialBoardState?.generatedAt ?? null;

  return (
    <div className="space-y-5">
      <section className="panel overflow-hidden p-0">
        <div className="border-b border-[var(--line)] bg-[linear-gradient(135deg,rgba(0,203,255,0.12),rgba(103,214,255,0.02)_55%,rgba(255,255,255,0)_100%)] px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#67d6ff]">
                Canonical live route
              </p>
              <h1 className="mt-2 text-4xl leading-none tracking-[0.06em] text-[var(--ink)] sm:text-5xl">
                {sessionName}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#a9bbd3] sm:text-base">
                Live timing stays here now: server-rendered snapshot first,
                realtime stream immediately after hydration.
              </p>
            </div>

            <div className="grid min-w-full gap-3 sm:grid-cols-3 lg:min-w-[32rem]">
              <div className="rounded-2xl border border-[var(--line)] bg-[#0f1824]/90 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#8aa0be]">
                  Feed state
                </p>
                <p className="mt-2 text-2xl uppercase tracking-[0.08em] text-[var(--ink)]">
                  {liveStatus}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--line)] bg-[#0f1824]/90 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#8aa0be]">
                  Messages seen
                </p>
                <p className="mt-2 text-2xl uppercase tracking-[0.08em] text-[var(--ink)]">
                  {feedCount.toLocaleString()}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--line)] bg-[#0f1824]/90 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#8aa0be]">
                  Last signal
                </p>
                <p className="mt-2 text-2xl uppercase tracking-[0.08em] text-[var(--ink)]">
                  {lastSignalAt ? formatClock(lastSignalAt) : "Waiting"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <LiveDashboard
        initialBoardState={initialBoardState}
        initialHealth={initialHealth}
      />
    </div>
  );
}
