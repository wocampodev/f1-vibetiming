import Link from "next/link";
import { FreshnessBadge } from "@/components/freshness-badge";
import { getCalendar, getConstructorStandings, getDriverStandings } from "@/lib/api";
import { SessionSummary } from "@/lib/types";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function getNextSession(
  sessions: Array<SessionSummary & { eventName: string; eventId: string }>,
) {
  return sessions
    .filter((session) => new Date(session.startsAt).getTime() > Date.now())
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    )[0];
}

export default async function Home() {
  const [calendar, drivers, constructors] = await Promise.all([
    getCalendar(),
    getDriverStandings(),
    getConstructorStandings(),
  ]);

  const flattenedSessions =
    calendar?.events.flatMap((event) =>
      event.sessions.map((session) => ({
        ...session,
        eventName: event.name,
        eventId: event.id,
      })),
    ) ?? [];

  const nextSession = getNextSession(flattenedSessions);

  return (
    <div className="space-y-6">
      <section className="panel overflow-hidden p-6">
        <div className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              F1 VibeTiming weekend tracker
            </p>
            <h1 className="mt-2 text-4xl leading-tight tracking-wide text-[var(--ink)] sm:text-5xl">
              Follow every practice, qualifying battle, and race result in one place.
            </h1>
            <p className="mt-3 max-w-2xl text-base text-[var(--muted)]">
              Fast MVP using public endpoints with scheduled ingestion into NestJS.
              Live SignalR adapters can plug in next.
            </p>
            <div className="mt-4">
              <FreshnessBadge freshness={calendar?.freshness ?? null} />
            </div>
          </div>
          <div className="panel border-[var(--accent)]/20 bg-gradient-to-br from-white to-[#fff6f1] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-black/55">
              Next Session
            </p>
            {nextSession ? (
              <>
                <p className="mt-2 text-2xl leading-tight text-[var(--ink)]">
                  {nextSession.name}
                </p>
                <p className="text-sm text-[var(--muted)]">{nextSession.eventName}</p>
                <p className="mt-3 text-sm font-semibold text-[var(--accent)]">
                  {formatDateTime(nextSession.startsAt)}
                </p>
                <Link
                  href={`/weekend/${nextSession.eventId}`}
                  className="mt-4 inline-block rounded-full bg-[var(--ink)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-black"
                >
                  Open Weekend
                </Link>
              </>
            ) : (
              <p className="mt-2 text-sm text-[var(--muted)]">
                No upcoming sessions yet. Run ingestion after seeding current season data.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-2xl uppercase tracking-wide text-[var(--ink)]">
              Driver Standings
            </h2>
            <Link href="/standings" className="text-sm text-[var(--accent)] hover:underline">
              Full table
            </Link>
          </div>
          <ul className="space-y-2">
            {drivers?.standings.slice(0, 5).map((item) => (
              <li
                key={item.driver.id}
                className="flex items-center justify-between rounded-lg border border-black/8 px-3 py-2"
              >
                <span className="text-sm font-semibold text-black/75">P{item.position}</span>
                <span className="flex-1 px-3 text-sm">
                  {item.driver.givenName} {item.driver.familyName}
                </span>
                <span className="text-sm font-semibold text-[var(--accent)]">
                  {item.points.toFixed(0)} pts
                </span>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-2xl uppercase tracking-wide text-[var(--ink)]">
              Constructors
            </h2>
            <Link href="/standings" className="text-sm text-[var(--accent)] hover:underline">
              Full table
            </Link>
          </div>
          <ul className="space-y-2">
            {constructors?.standings.slice(0, 5).map((item) => (
              <li
                key={item.team.id}
                className="flex items-center justify-between rounded-lg border border-black/8 px-3 py-2"
              >
                <span className="text-sm font-semibold text-black/75">P{item.position}</span>
                <span className="flex-1 px-3 text-sm">{item.team.name}</span>
                <span className="text-sm font-semibold text-[var(--accent)]">
                  {item.points.toFixed(0)} pts
                </span>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="panel p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-2xl uppercase tracking-wide text-[var(--ink)]">
            Upcoming Weekends
          </h2>
          <Link href="/calendar" className="text-sm text-[var(--accent)] hover:underline">
            Full calendar
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {calendar?.events.slice(0, 6).map((event) => (
            <Link
              key={event.id}
              href={`/weekend/${event.id}`}
              className="rounded-xl border border-black/8 bg-white px-4 py-3 transition hover:-translate-y-0.5 hover:border-black/20"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-black/55">
                Round {event.round}
              </p>
              <p className="text-lg leading-tight text-[var(--ink)]">{event.name}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">{event.circuitName}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
