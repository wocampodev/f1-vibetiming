import Link from "next/link";

export default function NotFound() {
  return (
    <section className="panel p-6 sm:p-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#67d6ff]">
        Route not found
      </p>
      <h1 className="mt-2 text-4xl leading-none tracking-[0.06em] text-[var(--ink)] sm:text-5xl">
        This part of the timing board does not exist.
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">
        The URL may be malformed, outdated, or pointing at a standings snapshot
        that cannot be resolved.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/live"
          className="rounded-full border border-[#67d6ff]/50 bg-[#67d6ff]/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-[#d9f8ff] transition hover:bg-[#67d6ff]/15"
        >
          Open live board
        </Link>
        <Link
          href="/standings"
          className="rounded-full border border-[var(--line)] bg-[#0f1824] px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-[#cddbed] transition hover:border-[#31506f] hover:text-[#e5efff]"
        >
          Open standings
        </Link>
      </div>
    </section>
  );
}
