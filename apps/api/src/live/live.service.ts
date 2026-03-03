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
      LiveState | LiveDeltaPayload | LiveHeartbeatPayload | LiveStatusPayload
    >
  >();

  private adapter: LiveAdapter;
  private currentState: LiveState | null = null;
  private currentStatus: LiveStreamStatus = 'connecting';
  private legalGateActive = false;
  private legalGateMessage: string | null = null;
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
        subscriber.next({
          type: 'initial_state',
          data: this.wrapEnvelope('initial_state', this.currentState),
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

  getState(): LiveState | null {
    return this.currentState;
  }

  getHealth() {
    const adapterHealth = this.adapter.getHealth();

    return {
      source: this.adapter.source,
      status: this.currentStatus,
      legalGateActive: this.legalGateActive,
      legalGateMessage: this.legalGateMessage,
      running: adapterHealth.running,
      startedAt: adapterHealth.startedAt,
      lastEventAt: adapterHealth.lastEventAt,
      tickMs: adapterHealth.tickMs,
      heartbeatMs: adapterHealth.heartbeatMs,
      seed: adapterHealth.seed,
    };
  }

  private async startAdapter(): Promise<void> {
    if (this.legalGateActive && this.legalGateMessage) {
      this.currentStatus = 'degraded';
      this.streamSubject.next(
        this.wrapEnvelope('status', {
          status: 'degraded',
          message: this.legalGateMessage,
        }),
      );
    }

    try {
      await this.adapter.start((event) => {
        if (event.type === 'initial_state') {
          this.currentState = event.state;
          this.streamSubject.next(
            this.wrapEnvelope('initial_state', this.currentState),
          );
          return;
        }

        if (event.type === 'delta_update') {
          this.currentState = event.state;
          this.streamSubject.next(
            this.wrapEnvelope('delta_update', {
              state: event.state,
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
    const source = this.configService.get<string>('LIVE_SOURCE', 'simulator');
    const legalApproved = this.configService.get<boolean>(
      'LIVE_PROVIDER_LEGAL_APPROVED',
      false,
    );

    if (source === 'simulator') {
      this.legalGateActive = false;
      this.legalGateMessage = null;
      return this.simulatorAdapter;
    }

    if (!legalApproved) {
      this.legalGateActive = true;
      this.legalGateMessage =
        'Provider source disabled: legal/compliance approval is required. Using simulator.';
      this.logger.warn(this.legalGateMessage);
      return this.simulatorAdapter;
    }

    this.legalGateActive = false;
    this.legalGateMessage = null;
    return this.providerAdapter;
  }

  private wrapEnvelope<
    TPayload extends
      | LiveState
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
}
