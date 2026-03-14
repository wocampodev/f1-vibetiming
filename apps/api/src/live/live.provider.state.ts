import { LIVE_DRIVER_ROSTER_BY_NUMBER } from './live.driver-roster';
import {
  LiveFlagStatus,
  LiveLeaderboardEntry,
  LivePositionConfidence,
  LivePositionSource,
  LiveRaceControlMessage,
  LiveSpeedSample,
  LiveState,
  LiveTrackStatusSample,
} from './live.types';
import {
  appendSpeedHistoryPoint,
  appendTrackStatusHistoryPoint,
  asRecord,
  asRecordArray,
  asString,
  buildRaceControlMessages,
  isRecord,
  JsonRecord,
  mergeRecords,
  normalizeCompound,
  normalizeFlag,
  normalizeTrackStatus,
  parseBooleanValue,
  parseLapOrSectorMs,
  parseMiniSectors,
  parseSpeedKph,
  parseTimingGapField,
  parseTimingGapTextField,
  parseTimingStatsBestLap,
  parseTimingStatsSector,
  parseTopSpeedKphFromStats,
  resolveFallbackPositionSource,
  resolvePitState,
  toInt,
  toIso,
  TRACK_STATUS_FLAG_MAP,
} from './live.provider.parsers';

interface LiveLeaderboardDraftEntry extends LiveLeaderboardEntry {
  driverNumber: string;
  explicitPosition: number | null;
  previousResolvedMetadata: LiveResolvedPositionMetadata | null;
  fallbackPositionSource: LivePositionSource;
}

interface LiveResolvedPositionMetadata {
  position: number;
  source: LivePositionSource;
  updatedAt: string | null;
  confidence: LivePositionConfidence;
}

interface DisplayedSectorTimes {
  sector1Ms: number | null;
  sector2Ms: number | null;
  sector3Ms: number | null;
}

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
    const driver = this.driverByNumber.get(number);
    const timing = this.timingByNumber.get(number);
    const timingStats = this.timingStatsByNumber.get(number);
    const timingApp = this.timingAppByNumber.get(number);
    const carData = this.carDataByNumber.get(number);
    const positionData = this.positionByNumber.get(number);

    if (!timing) {
      return null;
    }

    const explicitPosition = toInt(timing.Position);
    const previousResolvedMetadata =
      this.resolvedPositionMetaByNumber.get(number) ?? null;

    const sectors = asRecord(timing.Sectors);
    const sector1 = asRecord(sectors?.['0']);
    const sector2 = asRecord(sectors?.['1']);
    const sector3 = asRecord(sectors?.['2']);
    const cachedSectorTimes = this.displayedSectorTimesByNumber.get(number);
    const parsedSector1Ms = parseLapOrSectorMs(sector1);
    const parsedSector2Ms = parseLapOrSectorMs(sector2);
    let parsedSector3Ms = parseLapOrSectorMs(sector3);
    const statsSector1Ms = parseTimingStatsSector(timingStats, 0);
    const statsSector2Ms = parseTimingStatsSector(timingStats, 1);
    const statsSector3Ms = parseTimingStatsSector(timingStats, 2);

    const lastLapMs = parseLapOrSectorMs(timing.LastLapTime);
    if (
      parsedSector3Ms == null &&
      parsedSector1Ms != null &&
      parsedSector2Ms != null &&
      lastLapMs != null
    ) {
      const derivedSector3Ms = lastLapMs - parsedSector1Ms - parsedSector2Ms;
      if (derivedSector3Ms > 0) {
        parsedSector3Ms = derivedSector3Ms;
      }
    }

    const sector1Ms =
      parsedSector1Ms ?? cachedSectorTimes?.sector1Ms ?? statsSector1Ms;
    const sector2Ms =
      parsedSector2Ms ?? cachedSectorTimes?.sector2Ms ?? statsSector2Ms;
    const sector3Ms =
      parsedSector3Ms ?? cachedSectorTimes?.sector3Ms ?? statsSector3Ms;
    const bestSector1Ms = statsSector1Ms ?? sector1Ms;
    const bestSector2Ms = statsSector2Ms ?? sector2Ms;
    const bestSector3Ms = statsSector3Ms ?? sector3Ms;

    this.displayedSectorTimesByNumber.set(number, {
      sector1Ms: parsedSector1Ms ?? cachedSectorTimes?.sector1Ms ?? null,
      sector2Ms: parsedSector2Ms ?? cachedSectorTimes?.sector2Ms ?? null,
      sector3Ms: parsedSector3Ms ?? cachedSectorTimes?.sector3Ms ?? null,
    });

    const bestLapMs =
      parseLapOrSectorMs(timing.BestLapTime) ??
      parseTimingStatsBestLap(timingStats) ??
      lastLapMs;
    const fallbackPositionSource = resolveFallbackPositionSource(
      bestLapMs,
      lastLapMs,
    );

    const channels = asRecord(carData?.Channels);
    const speedHistoryKph = this.speedHistoryByNumber.get(number) ?? [];
    const speedKph =
      parseSpeedKph(channels?.['2']) ?? speedHistoryKph.at(-1)?.kph ?? null;
    const topSpeedKph =
      parseTopSpeedKphFromStats(timingStats) ??
      speedKph ??
      parseSpeedKph(asRecord(timingStats?.Speeds)?.ST);
    const trackStatusHistory =
      this.trackStatusHistoryByNumber.get(number) ?? [];
    const normalizedTrackStatus = normalizeTrackStatus(positionData?.Status);
    const resolvedTrackStatusHistory = normalizedTrackStatus
      ? appendTrackStatusHistoryPoint(trackStatusHistory, {
          at: emittedAt,
          status: normalizedTrackStatus,
        })
      : trackStatusHistory;
    const trackStatus =
      normalizedTrackStatus ??
      resolvedTrackStatusHistory.at(-1)?.status ??
      null;

    const gapToLeaderSec = parseTimingGapField(timing, [
      'GapToLeader',
      'TimeDiffToFastest',
      'TimeDifftoFastest',
      'TimeDiffToFirst',
      'TimeDifftoFirst',
    ]);
    const gapToLeaderText = parseTimingGapTextField(timing, [
      'GapToLeader',
      'TimeDiffToFastest',
      'TimeDifftoFastest',
      'TimeDiffToFirst',
      'TimeDifftoFirst',
    ]);

    const intervalToAheadSec = parseTimingGapField(timing, [
      'IntervalToPositionAhead',
      'TimeDiffToPositionAhead',
      'TimeDifftoPositionAhead',
      'GapToPositionAhead',
      'TimeDiffToCarAhead',
    ]);
    const intervalToAheadText = parseTimingGapTextField(timing, [
      'IntervalToPositionAhead',
      'TimeDiffToPositionAhead',
      'TimeDifftoPositionAhead',
      'GapToPositionAhead',
      'TimeDiffToCarAhead',
    ]);

    const rawStints = timingApp ? timingApp.Stints : null;
    const stints: unknown[] = Array.isArray(rawStints)
      ? rawStints
      : isRecord(rawStints)
        ? Object.values(rawStints).reduce<unknown[]>((accumulator, value) => {
            if (Array.isArray(value)) {
              for (const item of value) {
                accumulator.push(item);
              }
            } else if (isRecord(value)) {
              accumulator.push(value);
            }
            return accumulator;
          }, [])
        : [];
    const latestStint =
      stints.length > 0 ? asRecord(stints[stints.length - 1]) : null;
    const pitState = resolvePitState(timing, trackStatus);
    const miniSectors = parseMiniSectors(timing);
    const completedLaps =
      toInt(timing.NumberOfLaps) ?? toInt(latestStint?.LapNumber);

    const firstName = asString(driver?.FirstName);
    const lastName = asString(driver?.LastName);
    const combinedName = [firstName, lastName]
      .filter((value) => Boolean(value))
      .join(' ')
      .trim();
    const rosterEntry = LIVE_DRIVER_ROSTER_BY_NUMBER[number];

    return {
      driverNumber: number,
      position: explicitPosition ?? 0,
      driverCode:
        asString(driver?.Tla) ?? asString(driver?.RacingNumber) ?? number,
      driverName:
        asString(driver?.FullName) ??
        (combinedName.length > 0 ? combinedName : null) ??
        asString(driver?.BroadcastName) ??
        rosterEntry?.driverName ??
        null,
      teamName: asString(driver?.TeamName) ?? rosterEntry?.teamName ?? null,
      trackStatus,
      pitState,
      pitStops: toInt(timing.NumberOfPitStops),
      speedKph,
      topSpeedKph,
      gapToLeaderSec,
      gapToLeaderText,
      intervalToAheadSec,
      intervalToAheadText,
      sector1Ms,
      sector2Ms,
      sector3Ms,
      bestSector1Ms,
      bestSector2Ms,
      bestSector3Ms,
      lastLapMs,
      bestLapMs,
      completedLaps,
      speedHistoryKph,
      trackStatusHistory: resolvedTrackStatusHistory,
      miniSectors,
      tireCompound:
        normalizeCompound(latestStint?.Compound) ??
        normalizeCompound(timing.Compound),
      stintLap: toInt(latestStint?.TotalLaps),
      tireIsNew: parseBooleanValue(latestStint?.New),
      positionSource:
        explicitPosition != null
          ? 'timing_data'
          : (previousResolvedMetadata?.source ?? fallbackPositionSource),
      positionUpdatedAt:
        explicitPosition != null
          ? (this.explicitPositionUpdatedAtByNumber.get(number) ?? emittedAt)
          : (previousResolvedMetadata?.updatedAt ??
            (fallbackPositionSource === 'driver_code' ? null : emittedAt)),
      positionConfidence:
        explicitPosition != null
          ? 'high'
          : (previousResolvedMetadata?.confidence ?? 'low'),
      explicitPosition,
      previousResolvedMetadata,
      fallbackPositionSource,
    };
  }

  private resolveLeaderboard(
    draftLeaderboard: LiveLeaderboardDraftEntry[],
    emittedAt: string,
  ): LiveLeaderboardEntry[] {
    const hasExplicitOrder = this.sortDraftLeaderboard(draftLeaderboard);
    const leaderboard = this.applyResolvedPositions(
      draftLeaderboard,
      emittedAt,
      hasExplicitOrder,
    );

    leaderboard.sort((a, b) => a.position - b.position);
    this.applyDerivedLapGaps(leaderboard);
    return leaderboard;
  }

  private sortDraftLeaderboard(
    draftLeaderboard: LiveLeaderboardDraftEntry[],
  ): boolean {
    const explicitPositions = draftLeaderboard
      .map((entry) => entry.explicitPosition)
      .filter(
        (position): position is number => position != null && position > 0,
      );
    const hasExplicitOrder = explicitPositions.length > 0;

    draftLeaderboard.sort((left, right) => {
      if (hasExplicitOrder) {
        if (
          left.explicitPosition != null &&
          right.explicitPosition != null &&
          left.explicitPosition !== right.explicitPosition
        ) {
          return left.explicitPosition - right.explicitPosition;
        }

        if (left.explicitPosition != null && right.explicitPosition == null) {
          return -1;
        }

        if (left.explicitPosition == null && right.explicitPosition != null) {
          return 1;
        }
      }

      if (
        left.previousResolvedMetadata?.position != null &&
        right.previousResolvedMetadata?.position != null &&
        left.previousResolvedMetadata.position !==
          right.previousResolvedMetadata.position
      ) {
        return (
          left.previousResolvedMetadata.position -
          right.previousResolvedMetadata.position
        );
      }

      if (
        left.previousResolvedMetadata?.position != null &&
        right.previousResolvedMetadata?.position == null
      ) {
        return -1;
      }

      if (
        left.previousResolvedMetadata?.position == null &&
        right.previousResolvedMetadata?.position != null
      ) {
        return 1;
      }

      const leftBestLap = left.bestLapMs ?? Number.MAX_SAFE_INTEGER;
      const rightBestLap = right.bestLapMs ?? Number.MAX_SAFE_INTEGER;
      if (leftBestLap !== rightBestLap) {
        return leftBestLap - rightBestLap;
      }

      const leftLastLap = left.lastLapMs ?? Number.MAX_SAFE_INTEGER;
      const rightLastLap = right.lastLapMs ?? Number.MAX_SAFE_INTEGER;
      if (leftLastLap !== rightLastLap) {
        return leftLastLap - rightLastLap;
      }

      return left.driverCode.localeCompare(right.driverCode);
    });

    return hasExplicitOrder;
  }

  private applyResolvedPositions(
    draftLeaderboard: LiveLeaderboardDraftEntry[],
    emittedAt: string,
    hasExplicitOrder: boolean,
  ): LiveLeaderboardEntry[] {
    const leaderboard: LiveLeaderboardEntry[] = [];
    const nextResolvedPositions = new Map<
      string,
      LiveResolvedPositionMetadata
    >();
    const assignedPositions = new Set<number>();
    let nextFallbackPosition = 1;

    for (const entry of draftLeaderboard) {
      let resolvedPositionMetadata: LiveResolvedPositionMetadata;

      if (
        hasExplicitOrder &&
        entry.explicitPosition != null &&
        entry.explicitPosition > 0 &&
        !assignedPositions.has(entry.explicitPosition)
      ) {
        resolvedPositionMetadata = {
          position: entry.explicitPosition,
          source: 'timing_data',
          updatedAt:
            this.explicitPositionUpdatedAtByNumber.get(entry.driverNumber) ??
            emittedAt,
          confidence: 'high',
        };
      } else if (
        entry.previousResolvedMetadata != null &&
        entry.previousResolvedMetadata.position > 0 &&
        !assignedPositions.has(entry.previousResolvedMetadata.position)
      ) {
        resolvedPositionMetadata = {
          ...entry.previousResolvedMetadata,
          confidence:
            entry.previousResolvedMetadata.source === 'timing_data'
              ? 'medium'
              : entry.previousResolvedMetadata.confidence,
        };
      } else {
        while (assignedPositions.has(nextFallbackPosition)) {
          nextFallbackPosition += 1;
        }
        resolvedPositionMetadata = {
          position: nextFallbackPosition,
          source: entry.fallbackPositionSource,
          updatedAt:
            entry.fallbackPositionSource === 'driver_code' ? null : emittedAt,
          confidence: 'low',
        };
      }

      assignedPositions.add(resolvedPositionMetadata.position);
      const leaderboardEntry = {
        ...entry,
      } as LiveLeaderboardEntry & {
        explicitPosition?: number | null;
        previousResolvedMetadata?: LiveResolvedPositionMetadata | null;
        fallbackPositionSource?: LivePositionSource;
      };
      delete leaderboardEntry.explicitPosition;
      delete leaderboardEntry.previousResolvedMetadata;
      delete leaderboardEntry.fallbackPositionSource;

      leaderboard.push({
        ...leaderboardEntry,
        position: resolvedPositionMetadata.position,
        positionSource: resolvedPositionMetadata.source,
        positionUpdatedAt: resolvedPositionMetadata.updatedAt,
        positionConfidence: resolvedPositionMetadata.confidence,
      });
      nextResolvedPositions.set(entry.driverNumber, resolvedPositionMetadata);
    }

    this.resolvedPositionMetaByNumber.clear();
    for (const [number, metadata] of nextResolvedPositions.entries()) {
      this.resolvedPositionMetaByNumber.set(number, metadata);
    }

    return leaderboard;
  }

  private applyDerivedLapGaps(leaderboard: LiveLeaderboardEntry[]): void {
    const leader = leaderboard.at(0);
    if (leader?.lastLapMs == null) {
      return;
    }

    for (let index = 1; index < leaderboard.length; index += 1) {
      const current = leaderboard[index];
      if (!current) {
        continue;
      }

      if (current.gapToLeaderSec == null && current.lastLapMs != null) {
        const fallbackGapSec = Number(
          ((current.lastLapMs - leader.lastLapMs) / 1000).toFixed(3),
        );
        if (fallbackGapSec >= 0) {
          current.gapToLeaderSec = fallbackGapSec;
          current.gapToLeaderText = `+${fallbackGapSec.toFixed(3)}`;
        }
      }

      const previous = leaderboard[index - 1];
      if (
        current.intervalToAheadSec == null &&
        current.lastLapMs != null &&
        previous?.lastLapMs != null
      ) {
        const fallbackIntervalSec = Number(
          ((current.lastLapMs - previous.lastLapMs) / 1000).toFixed(3),
        );
        if (fallbackIntervalSec >= 0) {
          current.intervalToAheadSec = fallbackIntervalSec;
          current.intervalToAheadText = `+${fallbackIntervalSec.toFixed(3)}`;
        }
      }
    }
  }

  private hasSessionInfo(leaderboard: LiveLeaderboardEntry[]): boolean {
    return (
      this.sessionName !== null ||
      this.currentLap !== null ||
      this.totalLaps !== null ||
      leaderboard.length > 0
    );
  }
}
