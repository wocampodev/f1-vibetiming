export default function LiveLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <section className="panel overflow-hidden p-0">
        <div className="border-b border-[var(--line)] px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="h-3 w-32 rounded-full bg-[#17314a]" />
              <div className="h-12 w-full max-w-[34rem] rounded-full bg-[#102034]" />
              <div className="h-4 w-full max-w-[28rem] rounded-full bg-[#0f1c2d]" />
            </div>
            <div className="grid min-w-full gap-3 sm:grid-cols-3 lg:min-w-[32rem]">
              {Array.from({ length: 3 }, (_, index) => (
                <div
                  key={index}
                  className="rounded-2xl border border-[var(--line)] bg-[#0f1824]/90 px-4 py-3"
                >
                  <div className="h-3 w-20 rounded-full bg-[#17314a]" />
                  <div className="mt-3 h-8 w-24 rounded-full bg-[#102034]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="panel overflow-hidden p-0">
        <div className="border-b border-[var(--line)] bg-[#0b1420] px-5 py-4">
          <div className="h-8 w-56 rounded-full bg-[#102034]" />
          <div className="mt-3 h-4 w-40 rounded-full bg-[#0f1c2d]" />
        </div>
        <div className="space-y-3 px-5 py-4">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="h-12 rounded-2xl border border-[var(--line)] bg-[#0a121e]"
            />
          ))}
        </div>
      </section>
    </div>
  );
}
