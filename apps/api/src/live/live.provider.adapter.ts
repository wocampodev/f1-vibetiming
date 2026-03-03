import { Injectable } from '@nestjs/common';
import { LiveAdapter, LivePublish } from './live.adapter';
import { LiveAdapterHealth, LiveFeedSource } from './live.types';

@Injectable()
export class LiveProviderAdapter implements LiveAdapter {
  readonly source: LiveFeedSource = 'provider';

  private running = false;
  private startedAt: string | null = null;
  private lastEventAt: string | null = null;

  start(publish: LivePublish): Promise<void> {
    this.running = true;
    this.startedAt = new Date().toISOString();
    this.lastEventAt = this.startedAt;

    publish({
      type: 'status',
      status: 'connecting',
      message: 'Provider adapter enabled, preparing upstream live connection',
    });
    publish({
      type: 'status',
      status: 'degraded',
      message:
        'Provider adapter is not implemented in this build. Simulator remains recommended for now.',
    });

    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.running = false;
    return Promise.resolve();
  }

  getHealth(): LiveAdapterHealth {
    return {
      running: this.running,
      startedAt: this.startedAt,
      lastEventAt: this.lastEventAt,
      tickMs: 0,
      heartbeatMs: 0,
      seed: null,
      speedMultiplier: null,
    };
  }
}
