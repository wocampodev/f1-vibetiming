import Link from "next/link";
import { FreshnessBadge } from "@/components/freshness-badge";
import { getSessionResults } from "@/lib/api";

interface SessionPageProps {
  params: Promise<{ sessionId: string }>;
}

function isQualifying(type: string) {
  return type === "QUALIFYING" || type === "SPRINT_QUALIFYING";
}

export default async function SessionPage({ params }: SessionPageProps) {
  const { sessionId } = await params;
  const data = await getSessionResults(sessionId);

  if (!data) {
    return (
      <section className="panel p-6">
        <h1 className="text-3xl uppercase tracking-wide">Session unavailable</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Session results have not been synced yet.
        </p>
      </section>
    );
  }

  const qualifying = isQualifying(data.session.type);

  return (
    <div className="space-y-5">
      <section className="panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-black/55">
            {data.session.season} · Round {data.session.round}
          </p>
          <h1 className="text-3xl leading-tight uppercase tracking-wide text-[var(--ink)]">
            {data.session.eventName} · {data.session.name}
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {new Intl.DateTimeFormat(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }).format(new Date(data.session.startsAt))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FreshnessBadge freshness={data.freshness} />
          <Link
            href={`/weekend/${data.session.eventId}`}
            className="rounded-full border border-black/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide hover:bg-black/5"
          >
            Back to weekend
          </Link>
        </div>
      </section>

      <section className="panel p-5">
        {data.results.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No official results available for this session yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-black/12 text-xs uppercase tracking-wide text-black/55">
                  <th className="py-2 pr-2">Pos</th>
                  <th className="py-2 pr-2">Driver</th>
                  <th className="py-2 pr-2">Team</th>
                  {qualifying ? (
                    <>
                      <th className="py-2 pr-2">Q1</th>
                      <th className="py-2 pr-2">Q2</th>
                      <th className="py-2 pr-2">Q3</th>
                    </>
                  ) : (
                    <>
                      <th className="py-2 pr-2">Laps</th>
                      <th className="py-2 pr-2">Time / Gap</th>
                      <th className="py-2 pr-2">Status</th>
                    </>
                  )}
                  <th className="py-2 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((row, index) => (
                  <tr
                    key={`${row.driver.id}-${index}`}
                    className="border-b border-black/6 last:border-b-0"
                  >
                    <td className="py-2 pr-2 font-semibold">{row.position ?? "-"}</td>
                    <td className="py-2 pr-2">
                      {row.driver.givenName} {row.driver.familyName}
                    </td>
                    <td className="py-2 pr-2 text-[var(--muted)]">{row.team?.name ?? "-"}</td>
                    {qualifying ? (
                      <>
                        <td className="py-2 pr-2">{row.q1 ?? "-"}</td>
                        <td className="py-2 pr-2">{row.q2 ?? "-"}</td>
                        <td className="py-2 pr-2">{row.q3 ?? "-"}</td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-2">{row.laps ?? "-"}</td>
                        <td className="py-2 pr-2">{row.time ?? row.fastestLapTime ?? "-"}</td>
                        <td className="py-2 pr-2">{row.status ?? "-"}</td>
                      </>
                    )}
                    <td className="py-2 text-right font-semibold text-[var(--accent)]">
                      {row.points?.toFixed(0) ?? "0"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
