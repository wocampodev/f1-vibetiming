import Link from "next/link";
import { FreshnessBadge } from "@/components/freshness-badge";
import { getWeekend } from "@/lib/api";

interface WeekendPageProps {
  params: Promise<{ eventId: string }>;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function WeekendPage({ params }: WeekendPageProps) {
  const { eventId } = await params;
  const weekend = await getWeekend(eventId);

  if (!weekend) {
    return (
      <section className="panel p-6">
        <h1 className="text-3xl uppercase tracking-wide">Weekend not found</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          This event is missing or has not been ingested yet.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-black/55">
            Round {weekend.event.round} · {weekend.event.season}
          </p>
          <h1 className="text-3xl leading-tight uppercase tracking-wide text-[var(--ink)]">
            {weekend.event.name}
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {weekend.event.circuitName} · {weekend.event.locality}, {weekend.event.country}
          </p>
        </div>
        <FreshnessBadge freshness={weekend.freshness} />
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {weekend.sessions.map((session) => (
          <article key={session.id} className="panel p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-black/55">
              {session.type.replaceAll("_", " ")}
            </p>
            <h2 className="text-2xl leading-tight text-[var(--ink)]">{session.name}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{formatDateTime(session.startsAt)}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
              {session.status}
            </p>
            <Link
              href={`/session/${session.id}`}
              className="mt-3 inline-block rounded-full border border-black/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide hover:bg-black/5"
            >
              Session results
            </Link>
          </article>
        ))}
      </section>
    </div>
  );
}
