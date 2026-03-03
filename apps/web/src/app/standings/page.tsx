import { getConstructorStandings, getDriverStandings } from "@/lib/api";

const formatUpdatedAt = (value: string | null): string => {
  if (!value) {
    return "unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
};

const formatGap = (value: number | null): string => {
  if (value == null || value <= 0) {
    return "-";
  }

  return `+${value.toFixed(1)}`;
};

export default async function StandingsPage() {
  const [drivers, constructors] = await Promise.all([
    getDriverStandings(),
    getConstructorStandings(),
  ]);

  if (!drivers || !constructors) {
    return (
      <section className="panel p-6">
        <h1 className="text-3xl uppercase tracking-wide text-[var(--ink)]">
          Championship standings unavailable
        </h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Championship standings are not available right now.
        </p>
      </section>
    );
  }

  const latestRound = drivers.round ?? constructors.round;

  return (
    <div className="space-y-5">
      <section className="panel p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#67d6ff]">
          Championship standings
        </p>
        <h1 className="mt-2 text-4xl leading-tight tracking-wide text-[var(--ink)] sm:text-5xl">
          Driver and constructor title race.
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Season {drivers.season}
          {latestRound ? `, round ${latestRound}` : ""}. Updated {formatUpdatedAt(drivers.freshness.updatedAt)}.
        </p>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <article className="panel overflow-hidden p-0">
          <div className="border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-xl uppercase tracking-wide text-[var(--ink)]">Drivers</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead className="bg-[#0f1824] text-left text-xs uppercase tracking-wide text-[#94a7c2]">
                <tr>
                  <th className="px-4 py-2">Pos</th>
                  <th className="px-4 py-2">Driver</th>
                  <th className="px-4 py-2">Team</th>
                  <th className="px-4 py-2">Wins</th>
                  <th className="px-4 py-2">Gap Ldr</th>
                  <th className="px-4 py-2">Gap Ahead</th>
                  <th className="px-4 py-2 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {drivers.standings.map((item) => (
                  <tr key={item.driver.id} className="border-t border-[var(--line)]/70">
                    <td className="px-4 py-2 font-semibold text-[#cfe2ff]">P{item.position}</td>
                    <td className="px-4 py-2 text-[var(--ink)]">
                      <div className="flex flex-col">
                        <span>
                          {item.driver.givenName} {item.driver.familyName}
                        </span>
                        <span className="text-xs text-[var(--muted)]">
                          {item.driver.nationality ?? "Nationality n/a"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-[var(--muted)]">{item.team?.name ?? "-"}</td>
                    <td className="px-4 py-2 text-[var(--muted)]">{item.wins}</td>
                    <td className="px-4 py-2 font-mono text-[var(--muted)]">
                      {formatGap(item.gapToLeaderPoints)}
                    </td>
                    <td className="px-4 py-2 font-mono text-[var(--muted)]">
                      {formatGap(item.gapToAheadPoints)}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-[#67d6ff]">
                      {item.points.toFixed(0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel overflow-hidden p-0">
          <div className="border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-xl uppercase tracking-wide text-[var(--ink)]">Constructors</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-[#0f1824] text-left text-xs uppercase tracking-wide text-[#94a7c2]">
                <tr>
                  <th className="px-4 py-2">Pos</th>
                  <th className="px-4 py-2">Team</th>
                  <th className="px-4 py-2">Wins</th>
                  <th className="px-4 py-2">Gap Ldr</th>
                  <th className="px-4 py-2">Gap Ahead</th>
                  <th className="px-4 py-2 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {constructors.standings.map((item) => (
                  <tr key={item.team.id} className="border-t border-[var(--line)]/70">
                    <td className="px-4 py-2 font-semibold text-[#cfe2ff]">P{item.position}</td>
                    <td className="px-4 py-2 text-[var(--ink)]">
                      <div className="flex flex-col">
                        <span>{item.team.name}</span>
                        <span className="text-xs text-[var(--muted)]">
                          {item.team.nationality ?? "Nationality n/a"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-[var(--muted)]">{item.wins}</td>
                    <td className="px-4 py-2 font-mono text-[var(--muted)]">
                      {formatGap(item.gapToLeaderPoints)}
                    </td>
                    <td className="px-4 py-2 font-mono text-[var(--muted)]">
                      {formatGap(item.gapToAheadPoints)}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-[#67d6ff]">
                      {item.points.toFixed(0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );
}
