import {
  LiveFlagStatus,
  LiveRaceControlMessage,
  LiveSpeedSample,
  LiveState,
  LiveTrackStatusSample,
} from './live.types';
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
  asString,
  buildRaceControlMessages,
  JsonRecord,
  mergeRecords,
  normalizeFlag,
  normalizeTrackStatus,
  parseSpeedKph,
  toInt,
  toIso,
  TRACK_STATUS_FLAG_MAP,
} from './live.provider.parsers';

export class ProviderStateAccumulator {
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

  private sessionName: string | null = null;
  private weekendId: string | null = null;
  private sessionId: string | null = null;
  private currentLap: number | null = null;
  private totalLaps: number | null = null;
  private phase: 'running' | 'finished' | 'unknown' = 'unknown';
  private flag: LiveFlagStatus = 'green';
  private clockIso: string | null = null;
  private raceControl: LiveRaceControlMessage[] = [];

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

  ingest(topic: string, payload: unknown, emittedAt: string): string[] {
    const changed = new Set<string>(['generatedAt']);
    const record = asRecord(payload);

    if (!record) {
      return [...changed];
    }

    switch (topic) {
      case 'DriverList':
        this.ingestDriverList(record, changed);
        break;
      case 'TimingData':
        this.ingestTimingData(record, emittedAt, changed);
        break;
      case 'TimingStats':
        this.ingestTimingStats(record, changed);
        break;
      case 'TimingAppData':
        this.ingestTimingAppData(record, changed);
        break;
      case 'CarData':
        this.ingestCarData(record, emittedAt, changed);
        break;
      case 'Position':
        this.ingestPosition(record, emittedAt, changed);
        break;
      case 'LapCount':
        this.ingestLapCount(record, changed);
        break;
      case 'SessionInfo':
        this.ingestSessionInfo(record, changed);
        break;
      case 'SessionStatus':
        this.ingestSessionStatus(record, changed);
        break;
      case 'TrackStatus':
        this.ingestTrackStatus(record, changed);
        break;
      case 'ExtrapolatedClock':
        this.ingestExtrapolatedClock(record, emittedAt, changed);
        break;
      case 'RaceControlMessages':
        this.ingestRaceControlMessages(record, emittedAt, changed);
        break;
      default:
        break;
    }

    return [...changed];
  }

  private ingestDriverList(record: JsonRecord, changed: Set<string>): void {
    for (const [number, lineValue] of Object.entries(record)) {
      const line = asRecord(lineValue);
      if (!line) {
        continue;
      }

      const current = this.driverByNumber.get(number) ?? {};
      this.driverByNumber.set(number, mergeRecords(current, line));
    }

    changed.add('leaderboard');
  }

  private ingestTimingData(
    record: JsonRecord,
    emittedAt: string,
    changed: Set<string>,
  ): void {
    const lines = asRecord(record.Lines);
    if (!lines) {
      return;
    }

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
    }

    changed.add('leaderboard');
  }

  private ingestTimingStats(record: JsonRecord, changed: Set<string>): void {
    const lines = asRecord(record.Lines);
    if (!lines) {
      return;
    }

    for (const [number, lineValue] of Object.entries(lines)) {
      const line = asRecord(lineValue);
      if (!line) {
        continue;
      }

      const current = this.timingStatsByNumber.get(number) ?? {};
      this.timingStatsByNumber.set(number, mergeRecords(current, line));
    }

    changed.add('leaderboard');
  }

  private ingestTimingAppData(record: JsonRecord, changed: Set<string>): void {
    const lines = asRecord(record.Lines);
    if (!lines) {
      return;
    }

    for (const [number, lineValue] of Object.entries(lines)) {
      const line = asRecord(lineValue);
      if (!line) {
        continue;
      }

      const current = this.timingAppByNumber.get(number) ?? {};
      this.timingAppByNumber.set(number, mergeRecords(current, line));
    }

    changed.add('leaderboard');
  }

  private ingestCarData(
    record: JsonRecord,
    emittedAt: string,
    changed: Set<string>,
  ): void {
    const entries = asRecordArray(record.Entries);
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
      }
    }

    if (entries.length > 0) {
      changed.add('leaderboard');
    }
  }

  private ingestPosition(
    record: JsonRecord,
    emittedAt: string,
    changed: Set<string>,
  ): void {
    const positions = asRecordArray(record.Position);
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
      }
    }

    if (positions.length > 0) {
      changed.add('leaderboard');
    }
  }

  private ingestLapCount(record: JsonRecord, changed: Set<string>): void {
    this.currentLap = toInt(record.CurrentLap);
    this.totalLaps = toInt(record.TotalLaps);
    changed.add('session.currentLap');
    changed.add('session.totalLaps');
  }

  private ingestSessionInfo(record: JsonRecord, changed: Set<string>): void {
    const meeting = asRecord(record.Meeting);
    const meetingKey =
      asString(meeting?.Key) ??
      asString(meeting?.Name) ??
      asString(record.Meeting);
    const meetingName = asString(meeting?.Name);
    const sessionName = asString(record.Name);

    this.weekendId = meetingKey ?? this.weekendId;
    this.sessionId = asString(record.Key) ?? this.sessionId;
    this.sessionName =
      [meetingName, sessionName].filter((part) => Boolean(part)).join(' - ') ||
      this.sessionName;

    changed.add('session.weekendId');
    changed.add('session.sessionId');
    changed.add('session.sessionName');
  }

  private ingestSessionStatus(record: JsonRecord, changed: Set<string>): void {
    const status = (asString(record.Status) ?? '').toLowerCase();
    if (status.includes('finish') || status.includes('ended')) {
      this.phase = 'finished';
      this.flag = 'checkered';
    } else if (status.includes('start') || status.includes('running')) {
      this.phase = 'running';
    }

    changed.add('session.phase');
    changed.add('session.flag');
  }

  private ingestTrackStatus(record: JsonRecord, changed: Set<string>): void {
    const mapped = TRACK_STATUS_FLAG_MAP[asString(record.Status) ?? ''];
    const fromMessage = normalizeFlag(record.Message);
    const flag = mapped ?? fromMessage;
    if (!flag) {
      return;
    }

    this.flag = flag;
    changed.add('session.flag');
  }

  private ingestExtrapolatedClock(
    record: JsonRecord,
    emittedAt: string,
    changed: Set<string>,
  ): void {
    const value = asString(record.Utc) ?? asString(record.Remaining);
    this.clockIso = value ? toIso(value, emittedAt) : emittedAt;
    changed.add('session.clockIso');
  }

  private ingestRaceControlMessages(
    record: JsonRecord,
    emittedAt: string,
    changed: Set<string>,
  ): void {
    const nextMessages = buildRaceControlMessages(record, emittedAt);
    if (nextMessages.length === 0) {
      return;
    }

    this.raceControl = nextMessages;
    changed.add('raceControl');
  }

  getSessionMetadata() {
    return {
      weekendId: this.weekendId,
      sessionId: this.sessionId,
      sessionName: this.sessionName,
    };
  }

  buildState(emittedAt: string): LiveState | null {
    const draftLeaderboard = this.buildDraftLeaderboard(emittedAt);
    const leaderboard = this.resolveLeaderboard(draftLeaderboard, emittedAt);

    if (!this.hasSessionInfo(leaderboard)) {
      return null;
    }

    return {
      generatedAt: emittedAt,
      session: {
        weekendId: this.weekendId,
        sessionId: this.sessionId,
        sessionName: this.sessionName,
        phase: this.phase,
        flag: this.flag,
        currentLap: this.currentLap,
        totalLaps: this.totalLaps,
        clockIso: this.clockIso ?? emittedAt,
      },
      leaderboard,
      raceControl: this.raceControl,
    };
  }

  private buildDraftLeaderboard(
    emittedAt: string,
  ): LiveLeaderboardDraftEntry[] {
    const draftLeaderboard: LiveLeaderboardDraftEntry[] = [];

    for (const number of this.getTrackedDriverNumbers()) {
      const entry = this.buildDraftLeaderboardEntry(number, emittedAt);
      if (entry) {
        draftLeaderboard.push(entry);
      }
    }

    return draftLeaderboard;
  }

  private getTrackedDriverNumbers(): Set<string> {
    return new Set<string>([
      ...this.driverByNumber.keys(),
      ...this.timingByNumber.keys(),
    ]);
  }

  private buildDraftLeaderboardEntry(
    number: string,
    emittedAt: string,
  ): LiveLeaderboardDraftEntry | null {
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

    return result.entry;
  }

  private resolveLeaderboard(
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

  private hasSessionInfo(
    leaderboard: ReturnType<typeof resolveLeaderboard>['leaderboard'],
  ): boolean {
    return (
      this.sessionName !== null ||
      this.currentLap !== null ||
      this.totalLaps !== null ||
      leaderboard.length > 0
    );
  }
}
