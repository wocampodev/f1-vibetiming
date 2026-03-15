export default function StandingsLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <section className="panel p-6">
        <div className="h-3 w-40 rounded-full bg-[#17314a]" />
        <div className="mt-4 h-12 w-full max-w-[28rem] rounded-full bg-[#102034]" />
        <div className="mt-3 h-4 w-full max-w-[20rem] rounded-full bg-[#0f1c2d]" />
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="rounded-xl border border-[var(--line)] bg-[#0f1824] px-4 py-3"
            >
              <div className="h-3 w-20 rounded-full bg-[#17314a]" />
              <div className="mt-3 h-8 w-28 rounded-full bg-[#102034]" />
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <article key={index} className="panel overflow-hidden p-0">
            <div className="border-b border-[var(--line)] px-4 py-3">
              <div className="h-6 w-28 rounded-full bg-[#102034]" />
            </div>
            <div className="space-y-3 px-4 py-4">
              {Array.from({ length: 7 }, (_, rowIndex) => (
                <div
                  key={rowIndex}
                  className="h-11 rounded-xl border border-[var(--line)]/70 bg-[#0f1824]"
                />
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
