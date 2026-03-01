import { Freshness } from "@/lib/types";

interface FreshnessBadgeProps {
  freshness: Freshness | null;
}

export function FreshnessBadge({ freshness }: FreshnessBadgeProps) {
  if (!freshness?.updatedAt || freshness.ageSeconds == null) {
    return (
      <span className="inline-flex rounded-full border border-black/15 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-black/65">
        Data warming up
      </span>
    );
  }

  const ageMinutes = Math.floor(freshness.ageSeconds / 60);
  const label =
    ageMinutes < 1 ? `${freshness.ageSeconds}s ago` : `${ageMinutes}m ago`;

  return (
    <span className="inline-flex rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
      Updated {label}
    </span>
  );
}
