"use client";

import Link from "next/link";

export default function StandingsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="panel p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#67d6ff]">
        Standings error
      </p>
      <h1 className="mt-2 text-4xl tracking-wide text-[var(--ink)] sm:text-5xl">
        The standings board did not settle cleanly.
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
        Try the request again or jump back to the live board while the standings
        snapshot catches up.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-full border border-[#67d6ff]/50 bg-[#67d6ff]/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-[#d9f8ff] transition hover:bg-[#67d6ff]/15"
        >
          Retry standings
        </button>
        <Link
          href="/live"
          className="rounded-full border border-[var(--line)] bg-[#0f1824] px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-[#cddbed] transition hover:border-[#31506f] hover:text-[#e5efff]"
        >
          Go to live
        </Link>
      </div>
    </section>
  );
}
