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
import { LiveProviderAdapter } from './live.provider.adapter';
import { LiveSimulatorAdapter } from './live.simulator.adapter';
import {
  LiveDeltaPayload,
  LiveEnvelope,
  LiveHeartbeatPayload,
  LivePublicState,
  LiveState,
  LiveStatusPayload,
  LiveStreamEventType,
  LiveStreamStatus,
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
  private currentStatus: LiveStreamStatus = 'connecting';
  private sequence = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly simulatorAdapter: LiveSimulatorAdapter,
    private readonly providerAdapter: LiveProviderAdapter,
  ) {
    this.adapter = this.resolveAdapter();
  }

  async onModuleInit(): Promise<void> {
    await this.startAdapter();
  }

  async onModuleDestroy(): Promise<void> {
    await this.adapter.stop();
    this.currentStatus = 'stopped';
  }

  stream(): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      if (this.currentState) {
        const publicState = this.toPublicState(this.currentState);
        subscriber.next({
          type: 'initial_state',
          data: this.wrapEnvelope('initial_state', publicState),
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
    return this.currentState ? this.toPublicState(this.currentState) : null;
  }

  getHealth() {
    const adapterHealth = this.adapter.getHealth();

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
      details: adapterHealth.details ?? null,
    };
  }

  private async startAdapter(): Promise<void> {
    try {
      await this.adapter.start((event) => {
        if (event.type === 'initial_state') {
          this.currentState = event.state;
          const publicState = this.toPublicState(event.state);
          this.streamSubject.next(
            this.wrapEnvelope('initial_state', publicState),
          );
          return;
        }

        if (event.type === 'delta_update') {
          this.currentState = event.state;
          this.streamSubject.next(
            this.wrapEnvelope('delta_update', {
              state: this.toPublicState(event.state),
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

  private toPublicState(state: LiveState): LivePublicState {
    return {
      generatedAt: state.generatedAt,
      session: state.session,
      leaderboard: state.leaderboard.map((entry) => {
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
      }),
      raceControl: state.raceControl,
    };
  }
}
