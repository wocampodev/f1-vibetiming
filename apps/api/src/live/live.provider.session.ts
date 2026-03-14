import {
  asRecord,
  asString,
  buildRaceControlMessages,
  JsonRecord,
  normalizeFlag,
  toInt,
  toIso,
  TRACK_STATUS_FLAG_MAP,
} from './live.provider.parsers';
import {
  LiveFlagStatus,
  LiveRaceControlMessage,
  LiveSessionState,
} from './live.types';

export interface ProviderSessionMetadata {
  weekendId: string | null;
  sessionId: string | null;
  sessionName: string | null;
}

export class ProviderSessionState {
  private sessionName: string | null = null;
  private weekendId: string | null = null;
  private sessionId: string | null = null;
  private currentLap: number | null = null;
  private totalLaps: number | null = null;
  private phase: 'running' | 'finished' | 'unknown' = 'unknown';
  private flag: LiveFlagStatus = 'green';
  private clockIso: string | null = null;
  private raceControl: LiveRaceControlMessage[] = [];

  ingestLapCount(record: JsonRecord, changed: Set<string>): void {
    this.currentLap = toInt(record.CurrentLap);
    this.totalLaps = toInt(record.TotalLaps);
    changed.add('session.currentLap');
    changed.add('session.totalLaps');
  }

  ingestSessionInfo(record: JsonRecord, changed: Set<string>): void {
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

  ingestSessionStatus(record: JsonRecord, changed: Set<string>): void {
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

  ingestTrackStatus(record: JsonRecord, changed: Set<string>): void {
    const mapped = TRACK_STATUS_FLAG_MAP[asString(record.Status) ?? ''];
    const fromMessage = normalizeFlag(record.Message);
    const flag = mapped ?? fromMessage;
    if (!flag) {
      return;
    }

    this.flag = flag;
    changed.add('session.flag');
  }

  ingestExtrapolatedClock(
    record: JsonRecord,
    emittedAt: string,
    changed: Set<string>,
  ): void {
    const value = asString(record.Utc) ?? asString(record.Remaining);
    this.clockIso = value ? toIso(value, emittedAt) : emittedAt;
    changed.add('session.clockIso');
  }

  ingestRaceControlMessages(
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

  getMetadata(): ProviderSessionMetadata {
    return {
      weekendId: this.weekendId,
      sessionId: this.sessionId,
      sessionName: this.sessionName,
    };
  }

  buildSessionState(emittedAt: string): LiveSessionState {
    return {
      weekendId: this.weekendId,
      sessionId: this.sessionId,
      sessionName: this.sessionName,
      phase: this.phase,
      flag: this.flag,
      currentLap: this.currentLap,
      totalLaps: this.totalLaps,
      clockIso: this.clockIso ?? emittedAt,
    };
  }

  getRaceControl(): LiveRaceControlMessage[] {
    return this.raceControl;
  }

  hasSessionInfo(leaderboardLength: number): boolean {
    return (
      this.sessionName !== null ||
      this.currentLap !== null ||
      this.totalLaps !== null ||
      leaderboardLength > 0
    );
  }
}
