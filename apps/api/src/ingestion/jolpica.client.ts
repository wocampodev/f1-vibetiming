import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConstructorStandingsPayload,
  DriverStandingsPayload,
  ErgastConstructorStanding,
  ErgastDriverStanding,
  ErgastQualifyingResult,
  ErgastRace,
  ErgastRaceResult,
} from './ergast.types';

interface ErgastRacesResponse<T> {
  MRData: {
    RaceTable: {
      season: string;
      round?: string;
      Races: T[];
    };
  };
}

interface ErgastStandingsResponse<T> {
  MRData: {
    StandingsTable: {
      season: string;
      round: string;
      StandingsLists: Array<{
        round: string;
        DriverStandings?: T[];
        ConstructorStandings?: T[];
      }>;
    };
  };
}

@Injectable()
export class JolpicaClient {
  constructor(private readonly configService: ConfigService) {}

  private buildRoundPathSegment(round?: number): string {
    return round && round > 0 ? `/${round}` : '';
  }

  async fetchCalendar(season: number): Promise<ErgastRace[]> {
    const response = await this.request<ErgastRacesResponse<ErgastRace>>(
      `/f1/${season}.json`,
    );
    return response.MRData.RaceTable.Races;
  }

  async fetchRaceResults(
    season: number,
    round: number,
  ): Promise<ErgastRaceResult[]> {
    const response = await this.request<
      ErgastRacesResponse<{ Results?: ErgastRaceResult[] }>
    >(`/f1/${season}/${round}/results.json`);
    return response.MRData.RaceTable.Races.at(0)?.Results ?? [];
  }

  async fetchQualifyingResults(
    season: number,
    round: number,
  ): Promise<ErgastQualifyingResult[]> {
    const response = await this.request<
      ErgastRacesResponse<{ QualifyingResults?: ErgastQualifyingResult[] }>
    >(`/f1/${season}/${round}/qualifying.json`);
    return response.MRData.RaceTable.Races.at(0)?.QualifyingResults ?? [];
  }

  async fetchDriverStandings(
    season: number,
    round?: number,
  ): Promise<DriverStandingsPayload> {
    const roundPath = this.buildRoundPathSegment(round);
    const response = await this.request<
      ErgastStandingsResponse<ErgastDriverStanding>
    >(`/f1/${season}${roundPath}/driverStandings.json`);
    const standings = response.MRData.StandingsTable.StandingsLists.at(0);

    return {
      round: Number.parseInt(standings?.round ?? '0', 10),
      items: standings?.DriverStandings ?? [],
    };
  }

  async fetchConstructorStandings(
    season: number,
    round?: number,
  ): Promise<ConstructorStandingsPayload> {
    const roundPath = this.buildRoundPathSegment(round);
    const response = await this.request<
      ErgastStandingsResponse<ErgastConstructorStanding>
    >(`/f1/${season}${roundPath}/constructorStandings.json`);
    const standings = response.MRData.StandingsTable.StandingsLists.at(0);

    return {
      round: Number.parseInt(standings?.round ?? '0', 10),
      items: standings?.ConstructorStandings ?? [],
    };
  }

  private async request<T>(path: string): Promise<T> {
    const baseUrl =
      this.configService.get<string>('ERGAST_BASE_URL') ??
      'https://api.jolpi.ca/ergast';
    const response = await fetch(`${baseUrl}${path}`);

    if (!response.ok) {
      throw new Error(
        `Provider request failed (${response.status}) for ${path}`,
      );
    }

    return (await response.json()) as T;
  }
}
