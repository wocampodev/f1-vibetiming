export interface StandingsTableRow {
  id: string;
  label: string;
  points: number;
}

export function StandingsTable({
  title,
  labelHeader,
  rows,
}: {
  title: string;
  labelHeader: string;
  rows: StandingsTableRow[];
}) {
  return (
    <article className="panel overflow-hidden p-0">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-xl uppercase tracking-wide text-[var(--ink)]">
          {title}
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="bg-[#0f1824] text-left text-xs uppercase tracking-wide text-[#94a7c2]">
            <tr>
              <th className="px-4 py-2">Pos</th>
              <th className="px-4 py-2">{labelHeader}</th>
              <th className="px-4 py-2 text-right">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id} className="border-t border-[var(--line)]/70">
                <td className="px-4 py-2 font-semibold text-[#cfe2ff]">
                  P{index + 1}
                </td>
                <td className="px-4 py-2 text-[var(--ink)]">{row.label}</td>
                <td className="px-4 py-2 text-right font-semibold text-[#67d6ff]">
                  {row.points.toFixed(0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
