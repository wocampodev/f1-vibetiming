import { LiveDashboard } from "@/components/live-dashboard";

export default function LivePage() {
  return (
    <div className="space-y-4">
      <section className="panel p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          Live weekend mode
        </p>
        <h1 className="mt-2 text-4xl leading-tight tracking-wide text-[var(--ink)] sm:text-5xl">
          Simulator-powered live race control and leaderboard.
        </h1>
        <p className="mt-3 max-w-3xl text-base text-[var(--muted)]">
          This page runs on the simulator-first pipeline for Phase 2. Real
          provider integration remains behind legal and compliance sign-off.
        </p>
      </section>

      <LiveDashboard />
    </div>
  );
}
