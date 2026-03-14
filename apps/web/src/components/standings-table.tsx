export interface StandingsTableRow {
  id: string;
  label: string;
  subLabel?: string | null;
  points: number;
  wins: number;
  gapToLeaderPoints: number | null;
  positionDelta: number | null;
  pointsDelta: number | null;
}

const formatPositionDelta = (value: number | null) => {
  if (value == null) {
    return null;
  }

  if (value > 0) {
    return `+${value} vs prev`;
  }

  if (value < 0) {
    return `${value} vs prev`;
  }

  return "No change";
};

const formatPointsDelta = (value: number | null) => {
  if (value == null) {
    return null;
  }

  if (value > 0) {
    return `+${value.toFixed(0)} pts`;
  }

  if (value < 0) {
    return `${value.toFixed(0)} pts`;
  }

  return "0 pts";
};

const formatGapToLeader = (
  position: number,
  gapToLeaderPoints: number | null,
) => {
  if (position === 1) {
    return "Championship leader";
  }

  if (gapToLeaderPoints == null) {
    return null;
  }

  return `${gapToLeaderPoints.toFixed(0)} pts to leader`;
};

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
                <td className="px-4 py-2 text-[var(--ink)]">
                  <div>
                    <p>{row.label}</p>
                    {row.subLabel ? (
                      <p className="mt-0.5 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                        {row.subLabel}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-[#8aa0be]">
                      <span className="rounded-full border border-[#25415d] bg-[#0f1c2d] px-2 py-1 text-[#9ec5e8]">
                        {row.wins} wins
                      </span>
                      {formatGapToLeader(index + 1, row.gapToLeaderPoints) ? (
                        <span className="rounded-full border border-[#2a4058] bg-[#0f1824] px-2 py-1">
                          {formatGapToLeader(index + 1, row.gapToLeaderPoints)}
                        </span>
                      ) : null}
                      {formatPositionDelta(row.positionDelta) ? (
                        <span className="rounded-full border border-[#2a4058] bg-[#0f1824] px-2 py-1">
                          {formatPositionDelta(row.positionDelta)}
                        </span>
                      ) : null}
                      {formatPointsDelta(row.pointsDelta) ? (
                        <span className="rounded-full border border-[#2a4058] bg-[#0f1824] px-2 py-1">
                          {formatPointsDelta(row.pointsDelta)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </td>
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
