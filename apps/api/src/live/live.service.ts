import {
  Injectable,
  Logger,
  MessageEvent,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, Subject } from 'rxjs';
import { LiveAdapter } from './live.adapter';
import { buildLiveBoardState, createLiveBoardProjection } from './live.board';
import { LiveCaptureService } from './live.capture.service';
import { LiveProviderAdapter } from './live.provider.adapter';
import { LiveReplayService } from './live.replay.service';
import { LiveSimulatorAdapter } from './live.simulator.adapter';
import {
  LiveDeltaPayload,
  LiveEnvelope,
  LiveHeartbeatPayload,
  LiveBoardProjectionState,
  LiveBoardState,
  LivePositionConfidence,
  LivePositionSource,
  LivePublicState,
  LiveState,
  LiveStatusPayload,
  LiveStreamEventType,
  LiveStreamStatus,
  LiveTopicFreshnessState,
} from './live.types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeTopicName = (topic: string): string => topic.replace(/\.z$/, '');

const toStringMap = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => typeof entry === 'string')
      .map(([key, entry]) => [normalizeTopicName(key), entry]),
  ) as Record<string, string>;
};

const toNumberMap = (value: unknown): Record<string, number> => {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([, entry]) => typeof entry === 'number' && Number.isFinite(entry),
      )
      .map(([key, entry]) => [normalizeTopicName(key), entry]),
  ) as Record<string, number>;
};

const toTopicList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => normalizeTopicName(entry));
};

@Injectable()
export class LiveService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LiveService.name);
  private readonly streamSubject = new Subject<
    LiveEnvelope<
      | LivePublicState
      | LiveDeltaPayload
      | LiveHeartbeatPayload
      | LiveStatusPayload
    >
  >();

  private adapter: LiveAdapter;
  private currentState: LiveState | null = null;
  private currentPublicState: LivePublicState | null = null;
  private currentStatus: LiveStreamStatus = 'connecting';
  private sequence = 0;
  private publicProjectionMode: 'pass_through' | 'stabilized' | 'withheld' =
    'pass_through';
  private lowConfidenceLeaderSuppressions = 0;
  private lastLowConfidenceLeaderAt: string | null = null;
  private lastLowConfidenceLeaderCode: string | null = null;
  private lastLowConfidenceLeaderSource: LivePositionSource | null = null;
  private lastLowConfidenceLeaderConfidence: LivePositionConfidence | null =
    null;

  constructor(
    private readonly configService: ConfigService,
    private readonly simulatorAdapter: LiveSimulatorAdapter,
    private readonly providerAdapter: LiveProviderAdapter,
    private readonly liveCaptureService: LiveCaptureService,
    private readonly liveReplayService: LiveReplayService,
  ) {
    this.adapter = this.resolveAdapter();
  }

  async onModuleInit(): Promise<void> {
    await this.restorePersistedState();
    await this.startAdapter();
  }

  async onModuleDestroy(): Promise<void> {
    await this.adapter.stop();
    this.currentStatus = 'stopped';
  }

  stream(): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      if (this.currentPublicState) {
        subscriber.next({
          type: 'initial_state',
          data: this.wrapEnvelope('initial_state', this.currentPublicState),
        });
      } else {
        subscriber.next({
          type: 'status',
          data: this.wrapEnvelope('status', {
            status: this.currentStatus,
            message: 'Live stream is warming up',
          }),
        });
      }

      const subscription = this.streamSubject.subscribe((event) => {
        subscriber.next({
          type: event.eventType,
          data: event,
        });
      });

      return () => subscription.unsubscribe();
    });
  }

  getState(): LivePublicState | null {
    return this.currentPublicState;
  }

  getBoard(): LiveBoardState | null {
    return buildLiveBoardState({
      internalState: this.currentState,
      publicState: this.currentPublicState,
      projection: this.getProjectionState(),
    });
  }

  getHealth() {
    const adapterHealth = this.adapter.getHealth();
    const details = {
      ...(adapterHealth.details ?? {}),
      capture: this.liveCaptureService.getHealth(this.adapter.source),
      publicProjection: this.getProjectionState(),
    };

    return {
      source: this.adapter.source,
      status: this.currentStatus,
      running: adapterHealth.running,
      startedAt: adapterHealth.startedAt,
      lastEventAt: adapterHealth.lastEventAt,
      tickMs: adapterHealth.tickMs,
      heartbeatMs: adapterHealth.heartbeatMs,
      seed: adapterHealth.seed,
      speedMultiplier: adapterHealth.speedMultiplier,
      details,
    };
  }

  private async restorePersistedState(): Promise<void> {
    let restoredState: LiveState | null = null;
    let restoredPublicState: LivePublicState | null = null;
    let restoredProjectionState: LiveBoardProjectionState | null = null;
    let replayTopicFreshness: LiveTopicFreshnessState | null = null;

    if (this.adapter.source === 'provider') {
      const restoreMaxAgeSec = this.configService.get<number>(
        'LIVE_PROVIDER_SNAPSHOT_RESTORE_MAX_AGE_SEC',
        6 * 60 * 60,
      );
      const replay =
        await this.liveReplayService.replayLatestProviderSession(
          restoreMaxAgeSec,
        );
      restoredState = replay?.state ?? null;
      replayTopicFreshness = replay?.topicFreshness ?? null;

      if (restoredState) {
        this.logger.log(
          `Replayed persisted provider events for ${replay?.sessionKey ?? 'unknown session'}`,
        );
      }
    }

    if (!restoredState) {
      const persistedSnapshot =
        await this.liveCaptureService.loadLatestSnapshotBundle(
          this.adapter.source,
        );
      restoredState = persistedSnapshot?.internalState ?? null;
      restoredPublicState = persistedSnapshot?.publicState ?? null;
      restoredProjectionState = persistedSnapshot?.projectionState ?? null;
    }

    if (!restoredState) {
      return;
    }

    if (this.adapter.source === 'provider') {
      this.liveCaptureService.seedProviderContext({
        weekendId: restoredState.session.weekendId,
        sessionId: restoredState.session.sessionId,
        sessionName: restoredState.session.sessionName,
      });
    }

    this.currentState = restoredState;
    this.currentPublicState =
      restoredPublicState ?? this.toPublicState(restoredState);
    this.applyRestoredProjectionState(
      restoredProjectionState,
      restoredState,
      this.currentPublicState,
    );

    if (
      this.adapter.source === 'provider' &&
      replayTopicFreshness &&
      this.currentPublicState
    ) {
      this.liveCaptureService.persistSnapshot(
        this.adapter.source,
        restoredState,
        this.currentPublicState,
        this.getProjectionState(),
        replayTopicFreshness,
        ['generatedAt', 'session', 'leaderboard', 'raceControl'],
      );
    }

    this.logger.log(
      `Restored persisted live state for ${restoredState.session.sessionName ?? restoredState.session.sessionId ?? 'unknown session'}`,
    );
  }

  private async startAdapter(): Promise<void> {
    try {
      await this.adapter.start((event) => {
        if (event.type === 'initial_state') {
          const previousPublicState = this.currentPublicState;
          this.currentState = event.state;
          const publicState = this.toPublicState(
            event.state,
            previousPublicState,
          );
          this.currentPublicState = publicState;
          const projectionState = this.getProjectionState();
          const topicFreshness = this.getCurrentTopicFreshness(
            event.state.generatedAt,
          );
          this.liveCaptureService.persistSnapshot(
            this.adapter.source,
            event.state,
            publicState,
            projectionState,
            topicFreshness,
            ['generatedAt', 'session', 'leaderboard', 'raceControl'],
          );
          this.streamSubject.next(
            this.wrapEnvelope('initial_state', publicState),
          );
          return;
        }

        if (event.type === 'delta_update') {
          const previousPublicState = this.currentPublicState;
          this.currentState = event.state;
          const publicState = this.toPublicState(
            event.state,
            previousPublicState,
          );
          this.currentPublicState = publicState;
          const projectionState = this.getProjectionState();
          const topicFreshness = this.getCurrentTopicFreshness(
            event.state.generatedAt,
          );
          this.liveCaptureService.persistSnapshot(
            this.adapter.source,
            event.state,
            publicState,
            projectionState,
            topicFreshness,
            event.changedFields,
          );
          this.streamSubject.next(
            this.wrapEnvelope('delta_update', {
              state: publicState,
              changedFields: event.changedFields,
            }),
          );
          return;
        }

        if (event.type === 'heartbeat') {
          this.streamSubject.next(
            this.wrapEnvelope('heartbeat', { at: event.at }),
          );
          return;
        }

        this.currentStatus = event.status;
        this.streamSubject.next(
          this.wrapEnvelope('status', {
            status: event.status,
            message: event.message,
          }),
        );
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.currentStatus = 'degraded';
      this.logger.error('Live adapter startup failed', message);
      this.streamSubject.next(
        this.wrapEnvelope('status', {
          status: 'degraded',
          message: 'Live adapter failed to start',
        }),
      );
    }
  }

  private resolveAdapter(): LiveAdapter {
    const source = this.configService.get<string>('LIVE_SOURCE', 'provider');

    if (source === 'simulator') {
      return this.simulatorAdapter;
    }
    return this.providerAdapter;
  }

  private wrapEnvelope<
    TPayload extends
      | LivePublicState
      | LiveDeltaPayload
      | LiveHeartbeatPayload
      | LiveStatusPayload,
  >(eventType: LiveStreamEventType, payload: TPayload): LiveEnvelope<TPayload> {
    return {
      sequence: ++this.sequence,
      source: this.adapter.source,
      eventType,
      emittedAt: new Date().toISOString(),
      payload,
    };
  }

  private toPublicState(
    state: LiveState,
    previousPublicState?: LivePublicState | null,
  ): LivePublicState {
    const leaderboard = state.leaderboard.map((entry) => {
      return {
        position: entry.position,
        driverCode: entry.driverCode,
        driverName: entry.driverName,
        teamName: entry.teamName,
        gapToLeaderSec: entry.gapToLeaderSec,
        intervalToAheadSec: entry.intervalToAheadSec,
        sector1Ms: entry.sector1Ms,
        sector2Ms: entry.sector2Ms,
        sector3Ms: entry.sector3Ms,
        bestSector1Ms: entry.bestSector1Ms,
        bestSector2Ms: entry.bestSector2Ms,
        bestSector3Ms: entry.bestSector3Ms,
        lastLapMs: entry.lastLapMs,
        bestLapMs: entry.bestLapMs,
        speedHistoryKph: entry.speedHistoryKph,
        trackStatusHistory: entry.trackStatusHistory,
      };
    });

    return {
      generatedAt: state.generatedAt,
      session: state.session,
      leaderboard: this.stabilizeProviderLeaderboard(
        state,
        leaderboard,
        previousPublicState ?? null,
      ),
      raceControl: state.raceControl,
    };
  }

  private stabilizeProviderLeaderboard(
    state: LiveState,
    leaderboard: LivePublicState['leaderboard'],
    previousPublicState: LivePublicState | null,
  ): LivePublicState['leaderboard'] {
    if (this.adapter.source !== 'provider') {
      this.publicProjectionMode = 'pass_through';
      return leaderboard;
    }

    const leader = state.leaderboard[0];
    if (!leader) {
      this.publicProjectionMode = 'pass_through';
      return leaderboard;
    }

    if (leader.positionConfidence !== 'low') {
      this.publicProjectionMode = 'pass_through';
      return leaderboard;
    }

    this.lowConfidenceLeaderSuppressions += 1;
    this.lastLowConfidenceLeaderAt = state.generatedAt;
    this.lastLowConfidenceLeaderCode = leader.driverCode;
    this.lastLowConfidenceLeaderSource = leader.positionSource;
    this.lastLowConfidenceLeaderConfidence = leader.positionConfidence;

    const sameSession =
      previousPublicState != null &&
      ((previousPublicState.session.sessionId != null &&
        previousPublicState.session.sessionId === state.session.sessionId) ||
        (previousPublicState.session.sessionId == null &&
          previousPublicState.session.sessionName != null &&
          previousPublicState.session.sessionName ===
            state.session.sessionName));

    if (!sameSession) {
      this.publicProjectionMode = 'withheld';
      return [];
    }

    const currentEntriesByCode = new Map(
      leaderboard.map((entry) => [entry.driverCode, entry]),
    );
    const stabilized = previousPublicState.leaderboard
      .map((entry) => currentEntriesByCode.get(entry.driverCode) ?? null)
      .filter((entry): entry is (typeof leaderboard)[number] => entry != null);
    const includedDriverCodes = new Set(
      stabilized.map((entry) => entry.driverCode),
    );

    for (const entry of leaderboard) {
      if (!includedDriverCodes.has(entry.driverCode)) {
        stabilized.push(entry);
        includedDriverCodes.add(entry.driverCode);
      }
    }

    this.publicProjectionMode = 'stabilized';
    return stabilized.map((entry, index) => ({
      ...entry,
      position: index + 1,
      gapToLeaderSec: null,
      intervalToAheadSec: null,
    }));
  }

  private getCurrentTopicFreshness(
    capturedAt: string,
  ): LiveTopicFreshnessState | null {
    if (this.adapter.source !== 'provider') {
      return null;
    }

    const details = this.adapter.getHealth().details;
    if (!isRecord(details)) {
      return null;
    }

    const configuredTopics = toTopicList(details.topics);
    const topicLastSeenAt = toStringMap(details.topicLastSeenAt);
    const topicMessageCount = toNumberMap(details.topicMessageCount);
    const topicNames = [
      ...new Set([
        ...configuredTopics,
        ...Object.keys(topicLastSeenAt),
        ...Object.keys(topicMessageCount),
      ]),
    ].sort((left, right) => left.localeCompare(right));

    if (topicNames.length === 0) {
      return null;
    }

    return {
      capturedAt,
      topics: topicNames.map((topic) => ({
        topic,
        lastSeenAt: topicLastSeenAt[topic] ?? null,
        messageCount: topicMessageCount[topic] ?? 0,
      })),
    };
  }

  private applyRestoredProjectionState(
    projectionState: LiveBoardProjectionState | null,
    restoredState: LiveState,
    restoredPublicState: LivePublicState | null,
  ): void {
    if (projectionState) {
      this.publicProjectionMode = projectionState.mode;
      this.lowConfidenceLeaderSuppressions =
        projectionState.lowConfidenceLeaderSuppressions;
      this.lastLowConfidenceLeaderAt =
        projectionState.lastLowConfidenceLeaderAt;
      this.lastLowConfidenceLeaderCode =
        projectionState.lastLowConfidenceLeaderCode;
      this.lastLowConfidenceLeaderSource =
        projectionState.lastLowConfidenceLeaderSource;
      this.lastLowConfidenceLeaderConfidence =
        projectionState.lastLowConfidenceLeaderConfidence;
      return;
    }

    if (!restoredPublicState) {
      return;
    }

    this.publicProjectionMode = this.inferProjectionMode(
      restoredState,
      restoredPublicState,
    );
    this.lowConfidenceLeaderSuppressions = 0;
    this.lastLowConfidenceLeaderAt = null;
    this.lastLowConfidenceLeaderCode = null;
    this.lastLowConfidenceLeaderSource = null;
    this.lastLowConfidenceLeaderConfidence = null;
  }

  private inferProjectionMode(
    restoredState: LiveState,
    restoredPublicState: LivePublicState,
  ): 'pass_through' | 'stabilized' | 'withheld' {
    if (
      restoredPublicState.leaderboard.length === 0 &&
      restoredState.leaderboard.length > 0
    ) {
      return 'withheld';
    }

    if (
      restoredPublicState.leaderboard.length !==
      restoredState.leaderboard.length
    ) {
      return 'stabilized';
    }

    const internalRowsByCode = new Map(
      restoredState.leaderboard.map((entry) => [entry.driverCode, entry]),
    );

    const hasStabilizedOrder = restoredPublicState.leaderboard.some(
      (entry, index) =>
        entry.driverCode !== restoredState.leaderboard[index]?.driverCode,
    );
    if (hasStabilizedOrder) {
      return 'stabilized';
    }

    const hasRedactedGaps = restoredPublicState.leaderboard.some((entry) => {
      if (entry.position <= 1) {
        return false;
      }

      const internalEntry = internalRowsByCode.get(entry.driverCode);
      if (!internalEntry) {
        return false;
      }

      return (
        entry.gapToLeaderSec == null &&
        entry.intervalToAheadSec == null &&
        (internalEntry.gapToLeaderSec != null ||
          internalEntry.intervalToAheadSec != null)
      );
    });

    return hasRedactedGaps ? 'stabilized' : 'pass_through';
  }

  private getProjectionState() {
    return createLiveBoardProjection({
      mode: this.publicProjectionMode,
      lowConfidenceLeaderSuppressions: this.lowConfidenceLeaderSuppressions,
      lastLowConfidenceLeaderAt: this.lastLowConfidenceLeaderAt,
      lastLowConfidenceLeaderCode: this.lastLowConfidenceLeaderCode,
      lastLowConfidenceLeaderSource: this.lastLowConfidenceLeaderSource,
      lastLowConfidenceLeaderConfidence: this.lastLowConfidenceLeaderConfidence,
      internalLeaderboardRows: this.currentState?.leaderboard.length ?? 0,
      publicLeaderboardRows: this.currentPublicState?.leaderboard.length ?? 0,
      internalLeaderCode: this.currentState?.leaderboard[0]?.driverCode ?? null,
      internalLeaderSource:
        this.currentState?.leaderboard[0]?.positionSource ?? null,
      internalLeaderConfidence:
        this.currentState?.leaderboard[0]?.positionConfidence ?? null,
      publicLeaderCode:
        this.currentPublicState?.leaderboard[0]?.driverCode ?? null,
    });
  }
}
