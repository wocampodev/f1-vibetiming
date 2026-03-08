import {
  ConstructorStandingsResponse,
  DriverStandingsResponse,
  LiveBoardState,
} from "./types";

const API_BASE_URL =
  process.env.F1_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4000/api";

async function fetchFromApi<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function buildStandingsQuery(season?: number, round?: number): string {
  const params = new URLSearchParams();
  if (season) {
    params.set("season", `${season}`);
  }
  if (round) {
    params.set("round", `${round}`);
  }

  const query = params.toString();
  return query.length > 0 ? `?${query}` : "";
}

export function getDriverStandings(season?: number, round?: number) {
  const query = buildStandingsQuery(season, round);
  return fetchFromApi<DriverStandingsResponse>(`/standings/drivers${query}`);
}

export function getConstructorStandings(season?: number, round?: number) {
  const query = buildStandingsQuery(season, round);
  return fetchFromApi<ConstructorStandingsResponse>(
    `/standings/constructors${query}`,
  );
}

export function getLiveBoard() {
  return fetchFromApi<LiveBoardState>("/live/board");
}
