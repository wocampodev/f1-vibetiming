import {
  CalendarResponse,
  ConstructorStandingsResponse,
  DriverStandingsResponse,
  SessionResultsResponse,
  WeekendResponse,
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

export function getCalendar(season?: number) {
  const query = season ? `?season=${season}` : "";
  return fetchFromApi<CalendarResponse>(`/calendar${query}`);
}

export function getWeekend(eventId: string) {
  return fetchFromApi<WeekendResponse>(`/weekends/${eventId}`);
}

export function getSessionResults(sessionId: string) {
  return fetchFromApi<SessionResultsResponse>(`/sessions/${sessionId}/results`);
}

export function getDriverStandings(season?: number) {
  const query = season ? `?season=${season}` : "";
  return fetchFromApi<DriverStandingsResponse>(`/standings/drivers${query}`);
}

export function getConstructorStandings(season?: number) {
  const query = season ? `?season=${season}` : "";
  return fetchFromApi<ConstructorStandingsResponse>(
    `/standings/constructors${query}`,
  );
}
