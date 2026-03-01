import Link from "next/link";
import { FreshnessBadge } from "@/components/freshness-badge";
import { getCalendar } from "@/lib/api";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function CalendarPage() {
  const calendar = await getCalendar();

  if (!calendar) {
    return (
      <section className="panel p-6">
        <h1 className="text-3xl uppercase tracking-wide">Season Calendar</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          API is unreachable. Start NestJS at <code>localhost:4000</code> and run
          ingestion.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h1 className="text-3xl uppercase tracking-wide text-[var(--ink)]">
            {calendar.season} Calendar
          </h1>
          <p className="text-sm text-[var(--muted)]">
            Every grand prix weekend and session in one table.
          </p>
        </div>
        <FreshnessBadge freshness={calendar.freshness} />
      </div>

      <div className="space-y-3">
        {calendar.events.map((event) => (
          <article key={event.id} className="panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-black/55">
                  Round {event.round}
                </p>
                <h2 className="text-2xl leading-tight text-[var(--ink)]">{event.name}</h2>
                <p className="text-sm text-[var(--muted)]">
                  {event.circuitName} · {event.locality}, {event.country}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/weekend/${event.id}`}
                  className="rounded-full border border-black/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide hover:bg-black/5"
                >
                  Weekend view
                </Link>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {event.sessions.map((session) => (
                <div
                  key={session.id}
                  className="rounded-lg border border-black/8 bg-white px-3 py-2"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-black/55">
                    {session.name}
                  </p>
                  <p className="text-sm text-[var(--ink)]">{formatDate(session.startsAt)}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
