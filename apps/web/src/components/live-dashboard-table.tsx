import { LiveBoardRow, TireCompound } from "@/lib/types";
import {
  formatGap,
  formatLapDelta,
  formatLapTime,
  formatSectorTime,
  getSectorTone,
  LiveGapMode,
  miniSectorClassName,
} from "@/lib/live-board";

const tireToneByCompound: Record<TireCompound, string> = {
  SOFT: "border-red-400/40 bg-red-500/10 text-red-100",
  MEDIUM: "border-yellow-400/40 bg-yellow-400/10 text-yellow-100",
  HARD: "border-zinc-300/40 bg-zinc-400/10 text-zinc-100",
  INTERMEDIATE: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
  WET: "border-sky-400/40 bg-sky-500/10 text-sky-100",
};

function SectorCluster({
  row,
  sectorIndex,
}: {
  row: LiveBoardRow;
  sectorIndex: number;
}) {
  const cell = row.lastSectors[sectorIndex];
  const miniSectors = row.miniSectors
    .filter((miniSector) => miniSector.sector === cell.index)
    .sort((left, right) => left.segment - right.segment);
  const tone = getSectorTone(cell, miniSectors);
  const valueTone =
    tone === "session_best"
      ? "text-fuchsia-300"
      : tone === "personal_best"
        ? "text-emerald-300"
        : tone === "timed"
          ? "text-[#f4f9ff]"
          : "text-[#5a6c86]";
  const referenceTone =
    tone === "session_best"
      ? "text-fuchsia-200/85"
      : tone === "personal_best"
        ? "text-emerald-200/85"
        : "text-[#7085a0]";
  const placeholderSegments = Array.from({ length: 6 }, (_, index) => index);

  return (
    <div className="w-[7.25rem] shrink-0 space-y-1.5">
      <div className="flex min-h-2 flex-nowrap gap-1.5">
        {miniSectors.length > 0
          ? miniSectors.map((miniSector) => (
              <span
                key={`${miniSector.sector}-${miniSector.segment}`}
                className={`h-2 w-3.5 shrink-0 rounded-full ${miniSectorClassName(
                  miniSector.status,
                  miniSector.active,
                  tone,
                )}`}
                title={`S${miniSector.sector} M${miniSector.segment} ${miniSector.status}`}
              />
            ))
          : placeholderSegments.map((segment) => (
              <span
                key={`placeholder-${cell.index}-${segment}`}
                className="h-2 w-3.5 shrink-0 rounded-full bg-slate-900/90"
              />
            ))}
      </div>
      <div className="flex items-end gap-2">
        <span
          className={`font-mono text-[1.35rem] font-semibold leading-none ${valueTone}`}
        >
          {formatSectorTime(cell.valueMs)}
        </span>
        {cell.personalBestMs != null && cell.personalBestMs !== cell.valueMs ? (
          <span className={`pb-0.5 font-mono text-[10px] ${referenceTone}`}>
            {formatSectorTime(cell.personalBestMs)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function DriverCell({ row }: { row: LiveBoardRow }) {
  return (
    <div className="flex min-w-[15rem] items-center gap-3">
      <div
        className="h-11 w-1 rounded-full"
        style={{ backgroundColor: row.teamColor ?? "#38506e" }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-sm font-semibold text-[#f4f9ff]">
            {row.driverName ?? row.driverCode}
          </span>
          <span className="rounded-md border border-slate-700/80 bg-slate-950/70 px-2 py-1 text-xs font-bold tracking-[0.18em] text-slate-200">
            {row.driverNumber}
          </span>
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[#7f96b5]">
          {row.teamName ? <span>{row.teamName}</span> : null}
        </div>
      </div>
    </div>
  );
}

function TireCell({ row }: { row: LiveBoardRow }) {
  const compound = row.tire.compound;
  const tone = compound
    ? tireToneByCompound[compound]
    : "border-slate-700/80 bg-slate-950/70 text-slate-200";

  return (
    <div className="space-y-1">
      <span
        className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${tone}`}
      >
        {compound ?? "Unknown"}
      </span>
      <div className="text-[11px] uppercase tracking-[0.16em] text-[#8aa0be]">
        {row.tire.ageLaps != null ? `${row.tire.ageLaps} laps` : "-"}
      </div>
    </div>
  );
}

function LiveRow({
  row,
  leaderRow,
  previousRow,
  gapMode,
}: {
  row: LiveBoardRow;
  leaderRow: LiveBoardRow | null;
  previousRow: LiveBoardRow | null;
  gapMode: LiveGapMode;
}) {
  const lapReference =
    gapMode === "timed"
      ? row.bestLapMs
      : gapMode === "race"
        ? row.lastLapMs
        : null;
  const leaderLapReference =
    gapMode === "timed"
      ? (leaderRow?.bestLapMs ?? null)
      : gapMode === "race"
        ? (leaderRow?.lastLapMs ?? null)
        : null;
  const previousLapReference =
    gapMode === "timed"
      ? (previousRow?.bestLapMs ?? null)
      : gapMode === "race"
        ? (previousRow?.lastLapMs ?? null)
        : null;
  const derivedGapText =
    row.position === 1 || lapReference == null || leaderLapReference == null
      ? null
      : formatLapDelta(lapReference - leaderLapReference);
  const derivedIntervalText =
    row.position === 1 || lapReference == null || previousLapReference == null
      ? null
      : formatLapDelta(lapReference - previousLapReference);
  const gapText =
    gapMode === "provider"
      ? formatGap(row.gapToLeaderText, row.gapToLeaderSec, row.position === 1)
      : row.position === 1
        ? "LEADER"
        : (derivedGapText ??
          formatGap(row.gapToLeaderText, row.gapToLeaderSec, false));
  const intervalText =
    gapMode === "provider"
      ? row.position === 1
        ? null
        : formatGap(row.intervalToAheadText, row.intervalToAheadSec, false)
      : (derivedIntervalText ??
        (row.position === 1
          ? null
          : formatGap(row.intervalToAheadText, row.intervalToAheadSec, false)));

  return (
    <tr className="border-b border-[var(--line)]/60 hover:bg-[#0d1623]">
      <td className="px-3 py-3 align-top">
        <span className="inline-flex min-w-11 items-center justify-center rounded-md border border-[#2f4c69] bg-[#102034] px-2 py-1 text-base font-bold text-[#f4f9ff]">
          {row.position}
        </span>
      </td>
      <td className="px-3 py-3 align-top">
        <DriverCell row={row} />
      </td>
      <td className="px-3 py-3 align-top">
        <div className="flex min-w-max flex-nowrap gap-4 whitespace-nowrap">
          {row.lastSectors.map((sector, index) => (
            <SectorCluster key={sector.index} row={row} sectorIndex={index} />
          ))}
        </div>
      </td>
      <td className="px-3 py-3 align-top font-mono text-sm">
        <div
          className={
            row.isSessionFastestLap ? "text-fuchsia-200" : "text-[#dce9fb]"
          }
        >
          {formatLapTime(row.bestLapMs)}
        </div>
      </td>
      <td className="px-3 py-3 align-top font-mono text-sm text-[#dce9fb]">
        <div>{formatLapTime(row.lastLapMs)}</div>
      </td>
      <td className="px-3 py-3 align-top">
        <TireCell row={row} />
      </td>
      <td className="px-3 py-3 align-top font-mono text-sm">
        <div className="space-y-1">
          <div className="text-lg font-semibold text-[#f4f9ff]">{gapText}</div>
          {intervalText ? (
            <div className="text-xs text-[#7f96b5]">{intervalText}</div>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

export function LiveBoardTable({
  rows,
  gapMode,
}: {
  rows: LiveBoardRow[];
  gapMode: LiveGapMode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1240px] bg-[#070d15] text-sm">
        <thead className="border-b border-[var(--line)] bg-[#101b2a] text-left text-[11px] uppercase tracking-[0.18em] text-[#94a7c2]">
          <tr>
            <th className="px-3 py-3">Pos</th>
            <th className="px-3 py-3">Driver</th>
            <th className="px-3 py-3 whitespace-nowrap">Sectors</th>
            <th className="px-3 py-3">Best Lap</th>
            <th className="px-3 py-3">Last Lap</th>
            <th className="px-3 py-3">Tire</th>
            <th className="px-3 py-3">Gap</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <LiveRow
              key={row.driverCode}
              row={row}
              leaderRow={rows[0] ?? null}
              previousRow={index > 0 ? rows[index - 1] : null}
              gapMode={gapMode}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
