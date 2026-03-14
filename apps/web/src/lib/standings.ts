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
