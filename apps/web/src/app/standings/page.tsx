import Link from "next/link";
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

const formatPointsDelta = (value: number | null): string => {
  if (value == null) {
    return "-";
  }

  if (value > 0) {
    return `+${value.toFixed(1)}`;
  }

  if (value < 0) {
    return value.toFixed(1);
  }

  return "0.0";
};

const parseRoundParam = (value: string | string[] | undefined): number | null => {
  const raw = Array.isArray(value) ? value.at(0) : value;
  if (!raw) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const movementTone = (value: number | null): string => {
  if (value == null || value === 0) {
    return "text-[var(--muted)]";
  }

  return value > 0 ? "text-emerald-300" : "text-amber-300";
};

const movementLabel = (value: number | null): string => {
  if (value == null || value === 0) {
    return "-";
  }

  return value > 0 ? `+${value}` : `${value}`;
};

interface StandingsPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function StandingsPage({
  searchParams,
}: StandingsPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const requestedRound = parseRoundParam(resolvedSearchParams.round);

  const [drivers, constructors] = await Promise.all([
    getDriverStandings(undefined, requestedRound ?? undefined),
    getConstructorStandings(undefined, requestedRound ?? undefined),
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

  const driverAvailableRounds = Array.isArray(drivers.availableRounds)
    ? drivers.availableRounds
    : [];
  const constructorAvailableRounds = Array.isArray(constructors.availableRounds)
    ? constructors.availableRounds
    : [];
  const availableRounds = Array.from(
    new Set([...driverAvailableRounds, ...constructorAvailableRounds]),
  ).sort((left, right) => left - right);
  const latestRound = availableRounds.at(-1) ?? null;
  const selectedRound = drivers.round ?? constructors.round;
  const previousRound = drivers.previousRound ?? constructors.previousRound;
  const isHistoricalView =
    selectedRound != null && latestRound != null && selectedRound !== latestRound;

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
          {selectedRound ? `, round ${selectedRound}` : ""}
          {previousRound ? ` (vs round ${previousRound})` : ""}. Updated{" "}
          {formatUpdatedAt(drivers.freshness.updatedAt)}.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            href="/standings"
            className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
              !isHistoricalView
                ? "border-[#67d6ff] bg-[#10304a] text-[#d9efff]"
                : "border-[var(--line)] bg-[#0e1827] text-[var(--muted)] hover:border-[#3d5f85] hover:text-[#d9efff]"
            }`}
          >
            Latest
          </Link>
          {availableRounds.map((round) => (
            <Link
              key={round}
              href={`/standings?round=${round}`}
              className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                selectedRound === round
                  ? "border-[#67d6ff] bg-[#10304a] text-[#d9efff]"
                  : "border-[var(--line)] bg-[#0e1827] text-[var(--muted)] hover:border-[#3d5f85] hover:text-[#d9efff]"
              }`}
            >
              R{round}
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <article className="panel overflow-hidden p-0">
          <div className="border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-xl uppercase tracking-wide text-[var(--ink)]">Drivers</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-[#0f1824] text-left text-xs uppercase tracking-wide text-[#94a7c2]">
                <tr>
                  <th className="px-4 py-2">Pos</th>
                  <th className="px-4 py-2">Driver</th>
                  <th className="px-4 py-2">Team</th>
                  <th className="px-4 py-2">Wins</th>
                  <th className="px-4 py-2">Gap Ldr</th>
                  <th className="px-4 py-2">Gap Ahead</th>
                  <th className="px-4 py-2">Prev</th>
                  <th className="px-4 py-2">Move</th>
                  <th className="px-4 py-2">Pts Δ</th>
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
                    <td className="px-4 py-2 font-mono text-[var(--muted)]">
                      {item.previousRoundPosition == null
                        ? "-"
                        : `P${item.previousRoundPosition}`}
                    </td>
                    <td
                      className={`px-4 py-2 font-mono ${movementTone(
                        item.positionDelta,
                      )}`}
                    >
                      {movementLabel(item.positionDelta)}
                    </td>
                    <td
                      className={`px-4 py-2 font-mono ${movementTone(
                        item.pointsDelta,
                      )}`}
                    >
                      {formatPointsDelta(item.pointsDelta)}
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
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-[#0f1824] text-left text-xs uppercase tracking-wide text-[#94a7c2]">
                <tr>
                  <th className="px-4 py-2">Pos</th>
                  <th className="px-4 py-2">Team</th>
                  <th className="px-4 py-2">Wins</th>
                  <th className="px-4 py-2">Gap Ldr</th>
                  <th className="px-4 py-2">Gap Ahead</th>
                  <th className="px-4 py-2">Prev</th>
                  <th className="px-4 py-2">Move</th>
                  <th className="px-4 py-2">Pts Δ</th>
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
                    <td className="px-4 py-2 font-mono text-[var(--muted)]">
                      {item.previousRoundPosition == null
                        ? "-"
                        : `P${item.previousRoundPosition}`}
                    </td>
                    <td
                      className={`px-4 py-2 font-mono ${movementTone(
                        item.positionDelta,
                      )}`}
                    >
                      {movementLabel(item.positionDelta)}
                    </td>
                    <td
                      className={`px-4 py-2 font-mono ${movementTone(
                        item.pointsDelta,
                      )}`}
                    >
                      {formatPointsDelta(item.pointsDelta)}
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
