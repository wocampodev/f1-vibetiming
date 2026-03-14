import Link from "next/link";
import { getConstructorStandings, getDriverStandings } from "@/lib/api";
import { StandingsTable } from "@/components/standings-table";
import {
  buildStandingsHref,
  formatStandingsUpdatedAt,
  parseStandingsNumberParam,
  sortConstructorStandings,
  sortDriverStandings,
} from "@/lib/standings";

export default async function StandingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams: Record<string, string | string[] | undefined> =
    await Promise.resolve(searchParams ?? {});
  const requestedSeason = parseStandingsNumberParam(
    resolvedSearchParams.season,
  );
  const requestedRound = parseStandingsNumberParam(resolvedSearchParams.round);
  const [drivers, constructors] = await Promise.all([
    getDriverStandings(requestedSeason, requestedRound),
    getConstructorStandings(requestedSeason, requestedRound),
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
    subLabel: item.team?.name ?? null,
    points: item.points,
    wins: item.wins,
    gapToLeaderPoints: item.gapToLeaderPoints,
    positionDelta: item.positionDelta,
    pointsDelta: item.pointsDelta,
  }));
  const constructorRows = sortedConstructors.map((item) => ({
    id: item.team.id,
    label: item.team.name,
    subLabel: item.team.nationality ?? null,
    points: item.points,
    wins: item.wins,
    gapToLeaderPoints: item.gapToLeaderPoints,
    positionDelta: item.positionDelta,
    pointsDelta: item.pointsDelta,
  }));
  const availableRounds = drivers.availableRounds;
  const selectedRound = drivers.round;
  const driverLeader = driverRows[0] ?? null;
  const constructorLeader = constructorRows[0] ?? null;

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
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-[var(--line)] bg-[#0f1824] px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#8aa0be]">
              Snapshot
            </p>
            <p className="mt-2 text-2xl uppercase tracking-wide text-[var(--ink)]">
              {selectedRound ? `Round ${selectedRound}` : "Season total"}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {drivers.previousRound
                ? `Previous round ${drivers.previousRound}`
                : "Opening standings snapshot"}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[#0f1824] px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#8aa0be]">
              Driver leader
            </p>
            <p className="mt-2 text-2xl uppercase tracking-wide text-[var(--ink)]">
              {driverLeader?.label ?? "-"}
            </p>
            <p className="mt-1 text-sm text-[#67d6ff]">
              {driverLeader
                ? `${driverLeader.points.toFixed(0)} pts`
                : "No data"}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[#0f1824] px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#8aa0be]">
              Constructor leader
            </p>
            <p className="mt-2 text-2xl uppercase tracking-wide text-[var(--ink)]">
              {constructorLeader?.label ?? "-"}
            </p>
            <p className="mt-1 text-sm text-[#67d6ff]">
              {constructorLeader
                ? `${constructorLeader.points.toFixed(0)} pts`
                : "No data"}
            </p>
          </div>
        </div>
        {availableRounds.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {availableRounds.map((round) => {
              const active = round === selectedRound;

              return (
                <Link
                  key={round}
                  href={buildStandingsHref({ season: drivers.season, round })}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                    active
                      ? "border-[#67d6ff] bg-[#67d6ff]/10 text-[#d9f8ff]"
                      : "border-[var(--line)] bg-[#0f1824] text-[#8aa0be] hover:border-[#31506f] hover:text-[#dce9fb]"
                  }`}
                >
                  Round {round}
                </Link>
              );
            })}
          </div>
        ) : null}
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
