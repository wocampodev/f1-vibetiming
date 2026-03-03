import {
  LiveAdapterEvent,
  LiveAdapterHealth,
  LiveFeedSource,
} from './live.types';

export type LivePublish = (event: LiveAdapterEvent) => void;

export interface LiveAdapter {
  readonly source: LiveFeedSource;
  start(publish: LivePublish): Promise<void>;
  stop(): Promise<void>;
  getHealth(): LiveAdapterHealth;
}
