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
import { buildLiveBoardState } from './live.board';
import { LiveCaptureService } from './live.capture.service';
import {
  buildProjectionState,
  createInitialPublicProjectionMemory,
  projectPublicState,
  restoreProjectionMemory,
} from './live.public-state';
import { LiveProviderAdapter } from './live.provider.adapter';
import { LiveReplayService } from './live.replay.service';
import { buildLiveTopicFreshness } from './live.topic-freshness';
import {
  LiveDeltaPayload,
  LiveEnvelope,
  LiveHeartbeatPayload,
  LiveBoardProjectionState,
  LiveBoardState,
  LiveLeaderboardEntry,
  LivePublicState,
  LiveState,
  LiveStatusPayload,
  LiveStreamEventType,
  LiveStreamStatus,
  LiveTopicFreshnessState,
} from './live.types';

const mergeOptionalArray = <T>(
  next: T[] | undefined,
  previous: T[] | undefined,
): T[] => (next != null && next.length > 0 ? next : (previous ?? []));

const mergeProviderSessionState = (
  previousState: LiveState['session'],
  nextState: LiveState['session'],
): LiveState['session'] => ({
  weekendId: nextState.weekendId ?? previousState.weekendId,
  sessionId: nextState.sessionId ?? previousState.sessionId,
  sessionName: nextState.sessionName ?? previousState.sessionName,
  phase: nextState.phase === 'unknown' ? previousState.phase : nextState.phase,
  flag: nextState.flag,
  currentLap: nextState.currentLap ?? previousState.currentLap,
  totalLaps: nextState.totalLaps ?? previousState.totalLaps,
  clockIso: nextState.clockIso ?? previousState.clockIso,
});

const hasSessionIdentity = (session: LiveState['session']): boolean =>
  session.weekendId != null ||
  session.sessionId != null ||
  session.sessionName != null;

const shouldCarryForwardProviderState = (
  previousState: LiveState,
  nextState: LiveState,
): boolean => {
  if (
    previousState.session.sessionId != null &&
    nextState.session.sessionId != null
  ) {
    return previousState.session.sessionId === nextState.session.sessionId;
  }

  if (
    previousState.session.sessionName != null &&
    nextState.session.sessionName != null
  ) {
    return previousState.session.sessionName === nextState.session.sessionName;
  }

  if (
    previousState.session.weekendId != null &&
    nextState.session.weekendId != null
  ) {
    return previousState.session.weekendId === nextState.session.weekendId;
  }

  if (hasSessionIdentity(nextState.session)) {
    return false;
  }

  return true;
};

const shouldPreservePreviousPosition = (
  previousEntry: LiveLeaderboardEntry,
  nextEntry: LiveLeaderboardEntry,
): boolean => {
  if (
    previousEntry.positionSource !== 'timing_data' ||
    previousEntry.positionConfidence === 'low'
  ) {
    return false;
  }

  return (
    nextEntry.positionSource !== 'timing_data' ||
    nextEntry.positionConfidence === 'low'
  );
};

const mergeProviderLeaderboardEntry = (
  previousEntry: LiveLeaderboardEntry | null,
  nextEntry: LiveLeaderboardEntry,
): LiveLeaderboardEntry => {
  if (!previousEntry) {
    return nextEntry;
  }

  const preservePreviousPosition = shouldPreservePreviousPosition(
    previousEntry,
    nextEntry,
  );

  return {
    position: preservePreviousPosition
      ? previousEntry.position
      : nextEntry.position,
    driverNumber: nextEntry.driverNumber,
    driverCode: nextEntry.driverCode,
    driverName: nextEntry.driverName ?? previousEntry.driverName,
    teamName: nextEntry.teamName ?? previousEntry.teamName,
    trackStatus: nextEntry.trackStatus ?? previousEntry.trackStatus,
    pitState: nextEntry.pitState ?? previousEntry.pitState,
    pitStops: nextEntry.pitStops ?? previousEntry.pitStops,
    speedKph: nextEntry.speedKph ?? previousEntry.speedKph,
    topSpeedKph: nextEntry.topSpeedKph ?? previousEntry.topSpeedKph,
    gapToLeaderSec: nextEntry.gapToLeaderSec ?? previousEntry.gapToLeaderSec,
    gapToLeaderText: nextEntry.gapToLeaderText ?? previousEntry.gapToLeaderText,
    intervalToAheadSec:
      nextEntry.intervalToAheadSec ?? previousEntry.intervalToAheadSec,
    intervalToAheadText:
      nextEntry.intervalToAheadText ?? previousEntry.intervalToAheadText,
    sector1Ms: nextEntry.sector1Ms ?? previousEntry.sector1Ms,
    sector2Ms: nextEntry.sector2Ms ?? previousEntry.sector2Ms,
    sector3Ms: nextEntry.sector3Ms ?? previousEntry.sector3Ms,
    bestSector1Ms: nextEntry.bestSector1Ms ?? previousEntry.bestSector1Ms,
    bestSector2Ms: nextEntry.bestSector2Ms ?? previousEntry.bestSector2Ms,
    bestSector3Ms: nextEntry.bestSector3Ms ?? previousEntry.bestSector3Ms,
    lastLapMs: nextEntry.lastLapMs ?? previousEntry.lastLapMs,
    bestLapMs: nextEntry.bestLapMs ?? previousEntry.bestLapMs,
    completedLaps: nextEntry.completedLaps ?? previousEntry.completedLaps,
    speedHistoryKph: mergeOptionalArray(
      nextEntry.speedHistoryKph,
      previousEntry.speedHistoryKph,
    ),
    trackStatusHistory: mergeOptionalArray(
      nextEntry.trackStatusHistory,
      previousEntry.trackStatusHistory,
    ),
    miniSectors: mergeOptionalArray(
      nextEntry.miniSectors,
      previousEntry.miniSectors,
    ),
    tireCompound: nextEntry.tireCompound ?? previousEntry.tireCompound,
    stintLap: nextEntry.stintLap ?? previousEntry.stintLap,
    tireIsNew: nextEntry.tireIsNew ?? previousEntry.tireIsNew,
    positionSource: preservePreviousPosition
      ? previousEntry.positionSource
      : nextEntry.positionSource,
    positionUpdatedAt: preservePreviousPosition
      ? previousEntry.positionUpdatedAt
      : (nextEntry.positionUpdatedAt ?? previousEntry.positionUpdatedAt),
    positionConfidence: preservePreviousPosition
      ? previousEntry.positionConfidence === 'high'
        ? 'medium'
        : previousEntry.positionConfidence
      : nextEntry.positionConfidence,
  };
};

const reconcileProviderState = (
  previousState: LiveState | null,
  nextState: LiveState,
): LiveState => {
  if (
    !previousState ||
    !shouldCarryForwardProviderState(previousState, nextState)
  ) {
    return nextState;
  }

  const previousEntriesByNumber = new Map(
    previousState.leaderboard.map((entry) => [entry.driverNumber, entry]),
  );
  const previousEntriesByCode = new Map(
    previousState.leaderboard.map((entry) => [entry.driverCode, entry]),
  );

  const resolvePreviousEntry = (entry: LiveLeaderboardEntry) =>
    previousEntriesByCode.get(entry.driverCode) ??
    previousEntriesByNumber.get(entry.driverNumber) ??
    null;

  const mergedLeaderboard =
    nextState.leaderboard.length > 0
      ? nextState.leaderboard.map((entry) =>
          mergeProviderLeaderboardEntry(resolvePreviousEntry(entry), entry),
        )
      : previousState.leaderboard;
  const seenDriverNumbers = new Set(
    mergedLeaderboard.map((entry) => entry.driverNumber),
  );

  for (const previousEntry of previousState.leaderboard) {
    if (!seenDriverNumbers.has(previousEntry.driverNumber)) {
      mergedLeaderboard.push(previousEntry);
      seenDriverNumbers.add(previousEntry.driverNumber);
    }
  }

  const leaderboard = [...mergedLeaderboard].sort(
    (left, right) => left.position - right.position,
  );

  return {
    generatedAt: nextState.generatedAt,
    session: mergeProviderSessionState(
      previousState.session,
      nextState.session,
    ),
    leaderboard,
    raceControl:
      nextState.raceControl.length > 0
        ? nextState.raceControl
        : previousState.raceControl,
  };
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
  private projectionMemory = createInitialPublicProjectionMemory();

  constructor(
    private readonly configService: ConfigService,
    private readonly providerAdapter: LiveProviderAdapter,
    private readonly liveCaptureService: LiveCaptureService,
    private readonly liveReplayService: LiveReplayService,
  ) {
    this.adapter = this.providerAdapter;
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
      heartbeatMs: adapterHealth.heartbeatMs,
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
      restoredPublicState ??
      projectPublicState({
        source: this.adapter.source,
        state: restoredState,
        projectionMemory: this.projectionMemory,
      }).publicState;
    this.projectionMemory = restoreProjectionMemory({
      projectionState: restoredProjectionState,
      restoredState,
      restoredPublicState: this.currentPublicState,
    });

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
          const nextState = reconcileProviderState(
            this.currentState,
            event.state,
          );
          this.currentState = nextState;
          const publicProjection = projectPublicState({
            source: this.adapter.source,
            state: nextState,
            previousPublicState,
            projectionMemory: this.projectionMemory,
          });
          const publicState = publicProjection.publicState;
          this.projectionMemory = publicProjection.projectionMemory;
          this.currentPublicState = publicState;
          const projectionState = this.getProjectionState();
          const topicFreshness = this.getCurrentTopicFreshness(
            event.state.generatedAt,
          );
          this.liveCaptureService.persistSnapshot(
            this.adapter.source,
            nextState,
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
          const nextState = reconcileProviderState(
            this.currentState,
            event.state,
          );
          this.currentState = nextState;
          const publicProjection = projectPublicState({
            source: this.adapter.source,
            state: nextState,
            previousPublicState,
            projectionMemory: this.projectionMemory,
          });
          const publicState = publicProjection.publicState;
          this.projectionMemory = publicProjection.projectionMemory;
          this.currentPublicState = publicState;
          const projectionState = this.getProjectionState();
          const topicFreshness = this.getCurrentTopicFreshness(
            event.state.generatedAt,
          );
          this.liveCaptureService.persistSnapshot(
            this.adapter.source,
            nextState,
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

  private getCurrentTopicFreshness(capturedAt: string) {
    if (this.adapter.source !== 'provider') {
      return null;
    }

    return buildLiveTopicFreshness(
      capturedAt,
      this.adapter.getHealth().details,
    );
  }

  private getProjectionState() {
    return buildProjectionState({
      projectionMemory: this.projectionMemory,
      currentState: this.currentState,
      currentPublicState: this.currentPublicState,
    });
  }
}
