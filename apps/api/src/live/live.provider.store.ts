import {
  buildDraftLeaderboardEntry,
  DisplayedSectorTimes,
  LiveLeaderboardDraftEntry,
  LiveResolvedPositionMetadata,
  resolveLeaderboard,
} from './live.provider.leaderboard';
import {
  appendSpeedHistoryPoint,
  appendTrackStatusHistoryPoint,
  asRecord,
  asRecordArray,
  JsonRecord,
  mergeRecords,
  normalizeTrackStatus,
  parseSpeedKph,
  toInt,
  toIso,
} from './live.provider.parsers';
import { LiveSpeedSample, LiveTrackStatusSample } from './live.types';

export class ProviderTelemetryStore {
  private readonly driverByNumber = new Map<string, JsonRecord>();
  private readonly timingByNumber = new Map<string, JsonRecord>();
  private readonly timingStatsByNumber = new Map<string, JsonRecord>();
  private readonly timingAppByNumber = new Map<string, JsonRecord>();
  private readonly carDataByNumber = new Map<string, JsonRecord>();
  private readonly positionByNumber = new Map<string, JsonRecord>();
  private readonly explicitPositionUpdatedAtByNumber = new Map<
    string,
    string
  >();
  private readonly displayedSectorTimesByNumber = new Map<
    string,
    DisplayedSectorTimes
  >();
  private readonly resolvedPositionMetaByNumber = new Map<
    string,
    LiveResolvedPositionMetadata
  >();
  private readonly speedHistoryByNumber = new Map<string, LiveSpeedSample[]>();
  private readonly trackStatusHistoryByNumber = new Map<
    string,
    LiveTrackStatusSample[]
  >();

  ingestDriverList(record: JsonRecord): boolean {
    let updated = false;

    for (const [number, lineValue] of Object.entries(record)) {
      const line = asRecord(lineValue);
      if (!line) {
        continue;
      }

      const current = this.driverByNumber.get(number) ?? {};
      this.driverByNumber.set(number, mergeRecords(current, line));
      updated = true;
    }

    return updated;
  }

  ingestTimingData(record: JsonRecord, emittedAt: string): boolean {
    const lines = asRecord(record.Lines);
    if (!lines) {
      return false;
    }

    let updated = false;
    for (const [number, lineValue] of Object.entries(lines)) {
      const line = asRecord(lineValue);
      if (!line) {
        continue;
      }

      const explicitPosition = toInt(line.Position);
      if (explicitPosition != null) {
        this.explicitPositionUpdatedAtByNumber.set(number, emittedAt);
      }

      const current = this.timingByNumber.get(number) ?? {};
      this.timingByNumber.set(number, mergeRecords(current, line));
      updated = true;
    }

    return updated;
  }

  ingestTimingStats(record: JsonRecord): boolean {
    const lines = asRecord(record.Lines);
    if (!lines) {
      return false;
    }

    let updated = false;
    for (const [number, lineValue] of Object.entries(lines)) {
      const line = asRecord(lineValue);
      if (!line) {
        continue;
      }

      const current = this.timingStatsByNumber.get(number) ?? {};
      this.timingStatsByNumber.set(number, mergeRecords(current, line));
      updated = true;
    }

    return updated;
  }

  ingestTimingAppData(record: JsonRecord): boolean {
    const lines = asRecord(record.Lines);
    if (!lines) {
      return false;
    }

    let updated = false;
    for (const [number, lineValue] of Object.entries(lines)) {
      const line = asRecord(lineValue);
      if (!line) {
        continue;
      }

      const current = this.timingAppByNumber.get(number) ?? {};
      this.timingAppByNumber.set(number, mergeRecords(current, line));
      updated = true;
    }

    return updated;
  }

  ingestCarData(record: JsonRecord, emittedAt: string): boolean {
    const entries = asRecordArray(record.Entries);
    let updated = false;

    for (const entry of entries) {
      const cars = asRecord(entry.Cars);
      if (!cars) {
        continue;
      }

      const telemetryAt = toIso(entry.Utc, emittedAt);

      for (const [number, carValue] of Object.entries(cars)) {
        const car = asRecord(carValue);
        if (!car) {
          continue;
        }

        const current = this.carDataByNumber.get(number) ?? {};
        const merged = mergeRecords(current, car);
        merged.Utc = telemetryAt;
        this.carDataByNumber.set(number, merged);

        const channels = asRecord(merged.Channels);
        const speedKph = parseSpeedKph(channels?.['2']);
        if (speedKph != null) {
          this.appendSpeedHistory(number, speedKph, telemetryAt);
        }

        updated = true;
      }
    }

    return updated;
  }

  ingestPosition(record: JsonRecord, emittedAt: string): boolean {
    const positions = asRecordArray(record.Position);
    let updated = false;

    for (const position of positions) {
      const entries = asRecord(position.Entries);
      if (!entries) {
        continue;
      }

      const positionAt = toIso(position.Utc ?? position.Timestamp, emittedAt);

      for (const [number, entryValue] of Object.entries(entries)) {
        const entry = asRecord(entryValue);
        if (!entry) {
          continue;
        }

        const current = this.positionByNumber.get(number) ?? {};
        this.positionByNumber.set(number, mergeRecords(current, entry));

        const normalizedStatus = normalizeTrackStatus(entry.Status);
        if (normalizedStatus) {
          this.appendTrackStatusHistory(number, normalizedStatus, positionAt);
        }

        updated = true;
      }
    }

    return updated;
  }

  buildDraftLeaderboard(emittedAt: string): LiveLeaderboardDraftEntry[] {
    const draftLeaderboard: LiveLeaderboardDraftEntry[] = [];

    for (const number of this.getTrackedDriverNumbers()) {
      const result = buildDraftLeaderboardEntry({
        driverNumber: number,
        driver: this.driverByNumber.get(number),
        timing: this.timingByNumber.get(number),
        timingStats: this.timingStatsByNumber.get(number),
        timingApp: this.timingAppByNumber.get(number),
        carData: this.carDataByNumber.get(number),
        positionData: this.positionByNumber.get(number),
        previousResolvedMetadata:
          this.resolvedPositionMetaByNumber.get(number) ?? null,
        cachedSectorTimes: this.displayedSectorTimesByNumber.get(number),
        explicitPositionUpdatedAt:
          this.explicitPositionUpdatedAtByNumber.get(number) ?? null,
        speedHistoryKph: this.speedHistoryByNumber.get(number) ?? [],
        trackStatusHistory: this.trackStatusHistoryByNumber.get(number) ?? [],
        emittedAt,
      });

      if (result.displayedSectorTimes) {
        this.displayedSectorTimesByNumber.set(
          number,
          result.displayedSectorTimes,
        );
      }

      if (result.entry) {
        draftLeaderboard.push(result.entry);
      }
    }

    return draftLeaderboard;
  }

  resolveLeaderboard(
    draftLeaderboard: LiveLeaderboardDraftEntry[],
    emittedAt: string,
  ) {
    const result = resolveLeaderboard(draftLeaderboard, emittedAt);
    this.resolvedPositionMetaByNumber.clear();
    for (const [
      number,
      metadata,
    ] of result.resolvedPositionMetaByNumber.entries()) {
      this.resolvedPositionMetaByNumber.set(number, metadata);
    }

    return result.leaderboard;
  }

  private getTrackedDriverNumbers(): Set<string> {
    return new Set<string>([
      ...this.driverByNumber.keys(),
      ...this.timingByNumber.keys(),
    ]);
  }

  private appendSpeedHistory(number: string, kph: number, at: string): void {
    const history = this.speedHistoryByNumber.get(number) ?? [];
    this.speedHistoryByNumber.set(
      number,
      appendSpeedHistoryPoint(history, { at, kph }),
    );
  }

  private appendTrackStatusHistory(
    number: string,
    status: string,
    at: string,
  ): void {
    const history = this.trackStatusHistoryByNumber.get(number) ?? [];
    this.trackStatusHistoryByNumber.set(
      number,
      appendTrackStatusHistoryPoint(history, { at, status }),
    );
  }
}
