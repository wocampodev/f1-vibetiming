import { ConstructorStandingItem, DriverStandingItem } from "@/lib/types";

export const formatStandingsUpdatedAt = (value: string | null): string => {
  if (!value) {
    return "unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
};

export const sortDriverStandings = (standings: DriverStandingItem[]) => {
  return [...standings].sort((left, right) => {
    if (right.points !== left.points) {
      return right.points - left.points;
    }

    if (right.wins !== left.wins) {
      return right.wins - left.wins;
    }

    return `${left.driver.givenName} ${left.driver.familyName}`.localeCompare(
      `${right.driver.givenName} ${right.driver.familyName}`,
    );
  });
};

export const sortConstructorStandings = (
  standings: ConstructorStandingItem[],
) => {
  return [...standings].sort((left, right) => {
    if (right.points !== left.points) {
      return right.points - left.points;
    }

    if (right.wins !== left.wins) {
      return right.wins - left.wins;
    }

    return left.team.name.localeCompare(right.team.name);
  });
};

export const parseStandingsNumberParam = (
  value: string | string[] | undefined,
): number | undefined => {
  if (Array.isArray(value) && value.length !== 1) {
    return undefined;
  }

  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) {
    return undefined;
  }

  if (!/^\d+$/.test(raw)) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

export const hasStandingsNumberParam = (
  value: string | string[] | undefined,
): boolean => value !== undefined;

export const buildStandingsHref = (input: {
  season?: number;
  round?: number;
}) => {
  const params = new URLSearchParams();

  if (input.season) {
    params.set("season", `${input.season}`);
  }

  if (input.round) {
    params.set("round", `${input.round}`);
  }

  const query = params.toString();
  return query.length > 0 ? `/standings?${query}` : "/standings";
};
