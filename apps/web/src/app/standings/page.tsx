import { FreshnessBadge } from "@/components/freshness-badge";
import { StandingsChart } from "@/components/standings-chart";
import { getConstructorStandings, getDriverStandings } from "@/lib/api";

export default async function StandingsPage() {
  const [drivers, constructors] = await Promise.all([
    getDriverStandings(),
    getConstructorStandings(),
  ]);

  if (!drivers || !constructors) {
    return (
      <section className="panel p-6">
        <h1 className="text-3xl uppercase tracking-wide">Standings</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Standings are unavailable. Ensure ingestion has run for at least one season.
        </p>
      </section>
    );
  }

  const chartData = drivers.standings.slice(0, 10).map((item) => ({
    name: item.driver.code ?? item.driver.familyName,
    points: item.points,
  }));

  return (
    <div className="space-y-6">
      <section className="panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h1 className="text-3xl uppercase tracking-wide text-[var(--ink)]">
            {drivers.season} Standings
          </h1>
          <p className="text-sm text-[var(--muted)]">
            Driver and constructor rankings from the latest ingested round.
          </p>
        </div>
        <FreshnessBadge freshness={drivers.freshness} />
      </section>

      <section className="panel p-5">
        <h2 className="text-2xl uppercase tracking-wide">Top 10 Driver Points</h2>
        <StandingsChart data={chartData} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="panel p-5">
          <h2 className="mb-3 text-2xl uppercase tracking-wide">Drivers</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/12 text-xs uppercase tracking-wide text-black/55">
                  <th className="py-2 pr-2">Pos</th>
                  <th className="py-2 pr-2">Driver</th>
                  <th className="py-2 pr-2">Team</th>
                  <th className="py-2 pr-2">Wins</th>
                  <th className="py-2 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {drivers.standings.map((item) => (
                  <tr key={item.driver.id} className="border-b border-black/6 last:border-b-0">
                    <td className="py-2 pr-2 font-semibold">{item.position}</td>
                    <td className="py-2 pr-2">
                      {item.driver.givenName} {item.driver.familyName}
                    </td>
                    <td className="py-2 pr-2 text-[var(--muted)]">{item.team?.name ?? "-"}</td>
                    <td className="py-2 pr-2">{item.wins}</td>
                    <td className="py-2 text-right font-semibold text-[var(--accent)]">
                      {item.points.toFixed(0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel p-5">
          <h2 className="mb-3 text-2xl uppercase tracking-wide">Constructors</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/12 text-xs uppercase tracking-wide text-black/55">
                  <th className="py-2 pr-2">Pos</th>
                  <th className="py-2 pr-2">Team</th>
                  <th className="py-2 pr-2">Wins</th>
                  <th className="py-2 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {constructors.standings.map((item) => (
                  <tr key={item.team.id} className="border-b border-black/6 last:border-b-0">
                    <td className="py-2 pr-2 font-semibold">{item.position}</td>
                    <td className="py-2 pr-2">{item.team.name}</td>
                    <td className="py-2 pr-2">{item.wins}</td>
                    <td className="py-2 text-right font-semibold text-[var(--accent)]">
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
