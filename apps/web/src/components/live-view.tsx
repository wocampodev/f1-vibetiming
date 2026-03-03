import { LiveDashboard } from "@/components/live-dashboard";

export function LiveView() {
  return (
    <div className="space-y-4">
      <section className="panel p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#67d6ff]">
          Live dashboard
        </p>
        <h1 className="mt-2 text-4xl leading-tight tracking-wide text-[var(--ink)] sm:text-5xl">
          Real-time race table with tire, sectors, and gaps.
        </h1>
        <p className="mt-3 max-w-3xl text-base text-[var(--muted)]">
          Broadcast-style board focused on fast readability and timing deltas.
        </p>
      </section>

      <LiveDashboard />
    </div>
  );
}
