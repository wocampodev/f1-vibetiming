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
  LivePublicState,
  LiveState,
  LiveStatusPayload,
  LiveStreamEventType,
  LiveStreamStatus,
  LiveTopicFreshnessState,
} from './live.types';

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
          this.currentState = event.state;
          const publicProjection = projectPublicState({
            source: this.adapter.source,
            state: event.state,
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
          const publicProjection = projectPublicState({
            source: this.adapter.source,
            state: event.state,
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
