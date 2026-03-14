import { LiveState } from './live.types';
import { ProviderSessionState } from './live.provider.session';
import { ProviderTelemetryStore } from './live.provider.store';
import { asRecord } from './live.provider.parsers';

export class ProviderStateAccumulator {
  private readonly telemetryStore = new ProviderTelemetryStore();
  private readonly sessionState = new ProviderSessionState();

  ingest(topic: string, payload: unknown, emittedAt: string): string[] {
    const changed = new Set<string>(['generatedAt']);
    const record = asRecord(payload);

    if (!record) {
      return [...changed];
    }

    switch (topic) {
      case 'DriverList':
        if (this.telemetryStore.ingestDriverList(record)) {
          changed.add('leaderboard');
        }
        break;
      case 'TimingData':
        if (this.telemetryStore.ingestTimingData(record, emittedAt)) {
          changed.add('leaderboard');
        }
        break;
      case 'TimingStats':
        if (this.telemetryStore.ingestTimingStats(record)) {
          changed.add('leaderboard');
        }
        break;
      case 'TimingAppData':
        if (this.telemetryStore.ingestTimingAppData(record)) {
          changed.add('leaderboard');
        }
        break;
      case 'CarData':
        if (this.telemetryStore.ingestCarData(record, emittedAt)) {
          changed.add('leaderboard');
        }
        break;
      case 'Position':
        if (this.telemetryStore.ingestPosition(record, emittedAt)) {
          changed.add('leaderboard');
        }
        break;
      case 'LapCount':
        this.sessionState.ingestLapCount(record, changed);
        break;
      case 'SessionInfo':
        this.sessionState.ingestSessionInfo(record, changed);
        break;
      case 'SessionStatus':
        this.sessionState.ingestSessionStatus(record, changed);
        break;
      case 'TrackStatus':
        this.sessionState.ingestTrackStatus(record, changed);
        break;
      case 'ExtrapolatedClock':
        this.sessionState.ingestExtrapolatedClock(record, emittedAt, changed);
        break;
      case 'RaceControlMessages':
        this.sessionState.ingestRaceControlMessages(record, emittedAt, changed);
        break;
      default:
        break;
    }

    return [...changed];
  }

  getSessionMetadata() {
    return this.sessionState.getMetadata();
  }

  buildState(emittedAt: string): LiveState | null {
    const draftLeaderboard =
      this.telemetryStore.buildDraftLeaderboard(emittedAt);
    const leaderboard = this.telemetryStore.resolveLeaderboard(
      draftLeaderboard,
      emittedAt,
    );

    if (!this.sessionState.hasSessionInfo(leaderboard.length)) {
      return null;
    }

    return {
      generatedAt: emittedAt,
      session: this.sessionState.buildSessionState(emittedAt),
      leaderboard,
      raceControl: this.sessionState.getRaceControl(),
    };
  }
}
