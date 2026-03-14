import { getConstructorStandings, getDriverStandings } from "@/lib/api";
import { StandingsTable } from "@/components/standings-table";
import {
  formatStandingsUpdatedAt,
  sortConstructorStandings,
  sortDriverStandings,
} from "@/lib/standings";

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

  const sortedDrivers = sortDriverStandings(drivers.standings);
  const sortedConstructors = sortConstructorStandings(constructors.standings);
  const driverRows = sortedDrivers.map((item) => ({
    id: item.driver.id,
    label: `${item.driver.givenName} ${item.driver.familyName}`,
    points: item.points,
  }));
  const constructorRows = sortedConstructors.map((item) => ({
    id: item.team.id,
    label: item.team.name,
    points: item.points,
  }));

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
          Season {drivers.season}. Updated{" "}
          {formatStandingsUpdatedAt(drivers.freshness.updatedAt)}.
        </p>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <StandingsTable
          title="Drivers"
          labelHeader="Driver"
          rows={driverRows}
        />
        <StandingsTable
          title="Constructors"
          labelHeader="Escuderia"
          rows={constructorRows}
        />
      </section>
    </div>
  );
}
