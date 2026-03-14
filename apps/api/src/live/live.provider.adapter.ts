import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket, { RawData } from 'ws';
import { LiveAdapter, LivePublish } from './live.adapter';
import { LiveCaptureService } from './live.capture.service';
import {
  DEFAULT_PROVIDER_LOG_MAX_CHARS,
  formatProviderLogValue,
  resolveProviderLogSettings,
} from './live.provider.logging';
import {
  extractCookieJarEntries,
  extractFeedMessagesFromRawTextWithStats,
  readSetCookieValues,
  SignalrFeedExtractionResult,
  SignalrFeedMessage,
} from './live.provider.protocol';
import { ProviderStateAccumulator } from './live.provider.state';
import { LiveAdapterHealth, LiveFeedSource } from './live.types';

interface SignalrNegotiationResponse {
  ConnectionToken: string;
}

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const DEFAULT_TOPICS = [
  'SessionInfo',
  'SessionStatus',
  'LapCount',
  'TrackStatus',
  'DriverList',
  'TimingData',
  'TimingStats',
  'TimingAppData',
  'CarData.z',
  'Position.z',
  'RaceControlMessages',
  'ExtrapolatedClock',
];

export { formatProviderLogValue } from './live.provider.logging';
export {
  decodeTopicPayload,
  extractCookieJarEntries,
  extractFeedMessagesFromRawText,
  extractFeedMessagesFromRawTextWithStats,
} from './live.provider.protocol';
export { ProviderStateAccumulator } from './live.provider.state';

@Injectable()
export class LiveProviderAdapter implements LiveAdapter {
  readonly source: LiveFeedSource = 'provider';

  private readonly logger = new Logger(LiveProviderAdapter.name);
  private readonly baseUrl: string;
  private readonly hubName: string;
  private readonly topics: string[];
  private readonly heartbeatMs: number;
  private readonly reconnectMinMs: number;
  private readonly reconnectMaxMs: number;
  private readonly logFrames: boolean;
  private readonly logMessages: boolean;
  private readonly logMaxChars: number;

  private running = false;
  private startedAt: string | null = null;
  private connectedAt: string | null = null;
  private lastEventAt: string | null = null;
  private lastFrameAt: string | null = null;
  private publish: LivePublish | null = null;
  private socket: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private invokeId = 1;
  private framesReceived = 0;
  private feedMessagesReceived = 0;
  private frameParseErrors = 0;
  private topicDecodeErrors = 0;
  private readonly cookieJar = new Map<string, string>();
  private readonly topicMessageCount = new Map<string, number>();
  private readonly topicLastSeenAt = new Map<string, string>();
  private initialStatePublished = false;
  private readonly accumulator = new ProviderStateAccumulator();

  constructor(
    private readonly configService: ConfigService,
    private readonly liveCaptureService: LiveCaptureService,
  ) {
    this.baseUrl = this.configService.get<string>(
      'LIVE_SIGNALR_BASE_URL',
      'https://livetiming.formula1.com/signalr',
    );
    this.hubName = this.configService.get<string>(
      'LIVE_SIGNALR_HUB',
      'streaming',
    );
    const topicInput = this.configService.get<string>(
      'LIVE_SIGNALR_TOPICS',
      '',
    );
    const parsedTopics = topicInput
      .split(',')
      .map((topic) => topic.trim())
      .filter((topic) => topic.length > 0);
    this.topics = parsedTopics.length > 0 ? parsedTopics : DEFAULT_TOPICS;
    this.heartbeatMs = this.configService.get<number>(
      'LIVE_HEARTBEAT_MS',
      15000,
    );
    this.reconnectMinMs = this.configService.get<number>(
      'LIVE_SIGNALR_RECONNECT_MIN_MS',
      1000,
    );
    this.reconnectMaxMs = this.configService.get<number>(
      'LIVE_SIGNALR_RECONNECT_MAX_MS',
      30000,
    );
    const logSettings = resolveProviderLogSettings({
      modeValue: this.configService.get<string>('LIVE_PROVIDER_LOG', 'off'),
      legacyFramesValue: this.configService.get<string>(
        'LIVE_PROVIDER_LOG_FRAMES',
      ),
      legacyMessagesValue: this.configService.get<string>(
        'LIVE_PROVIDER_LOG_MESSAGES',
      ),
      maxCharsValue: this.configService.get<string>(
        'LIVE_PROVIDER_LOG_MAX_CHARS',
        String(DEFAULT_PROVIDER_LOG_MAX_CHARS),
      ),
    });
    this.logFrames = logSettings.framesEnabled;
    this.logMessages = logSettings.messagesEnabled;
    this.logMaxChars = logSettings.maxChars;
  }

  async start(publish: LivePublish): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    this.publish = publish;
    this.startedAt = new Date().toISOString();
    this.connectedAt = null;
    this.lastEventAt = this.startedAt;
    this.lastFrameAt = null;
    this.reconnectAttempt = 0;
    this.invokeId = 1;
    this.framesReceived = 0;
    this.feedMessagesReceived = 0;
    this.frameParseErrors = 0;
    this.topicDecodeErrors = 0;
    this.cookieJar.clear();
    this.topicMessageCount.clear();
    this.topicLastSeenAt.clear();
    this.initialStatePublished = false;
    await this.liveCaptureService.startProviderCapture();

    publish({
      type: 'status',
      status: 'connecting',
      message: 'Connecting to Formula 1 live SignalR stream',
    });

    this.startHeartbeatLoop();
    await this.connectAndSubscribe();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.publish = null;
    this.connectedAt = null;
    this.clearReconnectTimer();

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      socket.removeAllListeners();
      socket.close();
    }

    await this.liveCaptureService.completeProviderCapture();
  }

  getHealth(): LiveAdapterHealth {
    const topicMessageCount = Object.fromEntries(
      [...this.topicMessageCount.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
    const topicLastSeenAt = Object.fromEntries(
      [...this.topicLastSeenAt.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
    const connectionUptimeSec = this.connectedAt
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(this.connectedAt).getTime()) / 1000,
          ),
        )
      : null;

    return {
      running: this.running,
      startedAt: this.startedAt,
      lastEventAt: this.lastEventAt,
      tickMs: 0,
      heartbeatMs: this.heartbeatMs,
      seed: null,
      speedMultiplier: null,
      details: {
        baseUrl: this.baseUrl,
        hub: this.hubName,
        topics: this.topics,
        reconnectAttempt: this.reconnectAttempt,
        socketOpen: this.socket?.readyState === WebSocket.OPEN,
        connectedAt: this.connectedAt,
        connectionUptimeSec,
        lastFrameAt: this.lastFrameAt,
        framesReceived: this.framesReceived,
        feedMessagesReceived: this.feedMessagesReceived,
        frameParseErrors: this.frameParseErrors,
        topicDecodeErrors: this.topicDecodeErrors,
        cookieNames: [...this.cookieJar.keys()].sort((left, right) =>
          left.localeCompare(right),
        ),
        topicMessageCount,
        topicLastSeenAt,
      },
    };
  }

  private startHeartbeatLoop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      const now = new Date().toISOString();
      this.publish?.({ type: 'heartbeat', at: now });
    }, this.heartbeatMs);
  }

  private async connectAndSubscribe(): Promise<void> {
    if (!this.running) {
      return;
    }

    try {
      const negotiation = await this.negotiate();
      const socket = await this.openWebSocket(negotiation.ConnectionToken);
      this.attachSocketHandlers(socket);
      await this.startSignalrTransport(negotiation.ConnectionToken);
      this.sendSubscribe();

      this.reconnectAttempt = 0;
      this.connectedAt = new Date().toISOString();
      this.publish?.({
        type: 'status',
        status: 'live',
        message: 'Connected to Formula 1 live SignalR stream',
      });
      if (this.logFrames || this.logMessages) {
        this.logger.log(
          `Provider payload logging enabled (frames=${this.logFrames}, messages=${this.logMessages}, maxChars=${this.logMaxChars})`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`SignalR connection failed: ${message}`);
      this.publish?.({
        type: 'status',
        status: 'degraded',
        message: `Live provider connection failed: ${message}`,
      });
      this.scheduleReconnect('connection failure');
    }
  }

  private createConnectionData(): string {
    return JSON.stringify([{ name: this.hubName }]);
  }

  private buildHttpUrl(path: string, connectionToken?: string): string {
    const url = new URL(
      path,
      this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`,
    );
    url.searchParams.set('clientProtocol', '1.5');
    url.searchParams.set('connectionData', this.createConnectionData());

    if (connectionToken) {
      url.searchParams.set('transport', 'webSockets');
      url.searchParams.set('connectionToken', connectionToken);
    }

    return url.toString();
  }

  private buildWebSocketUrl(connectionToken: string): string {
    const url = new URL(
      'connect',
      this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`,
    );
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('transport', 'webSockets');
    url.searchParams.set('clientProtocol', '1.5');
    url.searchParams.set('connectionData', this.createConnectionData());
    url.searchParams.set('connectionToken', connectionToken);
    url.searchParams.set('tid', `${Math.floor(Math.random() * 11)}`);
    return url.toString();
  }

  private getCookieHeader(): string | null {
    if (this.cookieJar.size === 0) {
      return null;
    }

    return [...this.cookieJar.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  private getRequestHeaders(): Record<string, string> | undefined {
    const cookieHeader = this.getCookieHeader();
    if (!cookieHeader) {
      return undefined;
    }

    return {
      Cookie: cookieHeader,
    };
  }

  private updateCookieJarFromHeaders(headers: Headers): void {
    const setCookieValues = readSetCookieValues(headers);
    const entries = extractCookieJarEntries(setCookieValues);

    for (const [name, value] of entries) {
      this.cookieJar.set(name, value);
    }
  }

  private async negotiate(): Promise<SignalrNegotiationResponse> {
    const url = this.buildHttpUrl('negotiate');
    const response = await fetch(url, {
      headers: this.getRequestHeaders(),
    });
    this.updateCookieJarFromHeaders(response.headers);
    if (!response.ok) {
      throw new Error(`negotiate failed (${response.status})`);
    }

    const payload =
      (await response.json()) as Partial<SignalrNegotiationResponse>;
    const token = asString(payload.ConnectionToken);
    if (!token) {
      throw new Error('negotiate response missing ConnectionToken');
    }

    return {
      ConnectionToken: token,
    };
  }

  private async openWebSocket(connectionToken: string): Promise<WebSocket> {
    const url = this.buildWebSocketUrl(connectionToken);
    const requestHeaders = this.getRequestHeaders();

    return new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(url, {
        handshakeTimeout: 15_000,
        headers: requestHeaders,
      });
      const timeout = setTimeout(() => {
        socket.removeAllListeners();
        socket.terminate();
        reject(new Error('websocket connect timeout'));
      }, 15_000);

      const cleanup = () => {
        clearTimeout(timeout);
        socket.removeAllListeners('open');
        socket.removeAllListeners('error');
      };

      socket.once('open', () => {
        cleanup();
        this.socket = socket;
        resolve(socket);
      });

      socket.once('error', (error: unknown) => {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  private async startSignalrTransport(connectionToken: string): Promise<void> {
    const url = this.buildHttpUrl('start', connectionToken);
    const response = await fetch(url, {
      headers: this.getRequestHeaders(),
    });
    this.updateCookieJarFromHeaders(response.headers);
    if (!response.ok) {
      throw new Error(`start failed (${response.status})`);
    }
  }

  private sendSubscribe(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const invocation = {
      H: this.hubName,
      M: 'Subscribe',
      A: [this.topics],
      I: this.invokeId++,
    };

    this.socket.send(JSON.stringify(invocation));
  }

  private attachSocketHandlers(socket: WebSocket): void {
    socket.on('message', (data: RawData) => {
      this.handleSocketMessage(data);
    });

    socket.on('error', (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`SignalR socket error: ${message}`);
    });

    socket.on('close', () => {
      if (!this.running) {
        return;
      }

      this.publish?.({
        type: 'status',
        status: 'degraded',
        message: 'Live provider stream disconnected, attempting reconnect',
      });
      this.scheduleReconnect('socket closed');
    });
  }

  private handleSocketMessage(data: RawData): void {
    const frameReceivedAt = new Date().toISOString();
    this.framesReceived += 1;
    this.lastFrameAt = frameReceivedAt;

    const rawText =
      typeof data === 'string'
        ? data
        : Buffer.isBuffer(data)
          ? data.toString('utf-8')
          : Array.isArray(data)
            ? Buffer.concat(
                data.map((chunk) =>
                  Buffer.isBuffer(chunk)
                    ? chunk
                    : Buffer.from(chunk as ArrayBuffer),
                ),
              ).toString('utf-8')
            : Buffer.from(data).toString('utf-8');

    const extraction = extractFeedMessagesFromRawTextWithStats(
      rawText,
      this.hubName,
    );
    this.frameParseErrors += extraction.invalidFrames;
    this.logProviderFrame(frameReceivedAt, rawText, extraction);

    for (const message of extraction.messages) {
      this.feedMessagesReceived += 1;
      this.topicMessageCount.set(
        message.topic,
        (this.topicMessageCount.get(message.topic) ?? 0) + 1,
      );
      this.topicLastSeenAt.set(message.topic, message.emittedAt);
      if (message.decodeError) {
        this.topicDecodeErrors += 1;
      }

      const changedFields = this.accumulator.ingest(
        message.topic,
        message.payload,
        message.emittedAt,
      );
      this.liveCaptureService.recordProviderMessage(
        message,
        this.accumulator.getSessionMetadata(),
        changedFields,
      );
      this.logProviderMessage(message, changedFields);
      this.lastEventAt = message.emittedAt;
      this.publishState(changedFields, message.emittedAt);
    }
  }

  private logProviderFrame(
    frameReceivedAt: string,
    rawText: string,
    extraction: SignalrFeedExtractionResult,
  ): void {
    if (!this.logFrames) {
      return;
    }

    const preview = formatProviderLogValue(rawText, this.logMaxChars);
    this.logger.log(
      `Provider frame at=${frameReceivedAt} extractedMessages=${extraction.messages.length} invalidFrames=${extraction.invalidFrames} preview=${preview}`,
    );
  }

  private logProviderMessage(
    message: SignalrFeedMessage,
    changedFields: string[],
  ): void {
    if (!this.logMessages) {
      return;
    }

    const changed = changedFields.length > 0 ? changedFields.join(',') : 'none';
    const payload = formatProviderLogValue(message.payload, this.logMaxChars);
    this.logger.log(
      `Provider message topic=${message.topic} rawTopic=${message.rawTopic} at=${message.emittedAt} decodeError=${message.decodeError} changed=${changed} payload=${payload}`,
    );
  }

  private publishState(changedFields: string[], emittedAt: string): void {
    const state = this.accumulator.buildState(emittedAt);
    if (!state) {
      return;
    }

    if (!this.initialStatePublished) {
      this.publish?.({ type: 'initial_state', state });
      this.initialStatePublished = true;
      return;
    }

    this.publish?.({
      type: 'delta_update',
      state,
      changedFields,
    });
  }

  private scheduleReconnect(reason: string): void {
    if (!this.running || this.reconnectTimer) {
      return;
    }

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.close();
      this.socket = null;
    }

    this.connectedAt = null;

    this.reconnectAttempt += 1;
    const delay = Math.min(
      this.reconnectMaxMs,
      this.reconnectMinMs * 2 ** Math.max(0, this.reconnectAttempt - 1),
    );

    this.publish?.({
      type: 'status',
      status: 'connecting',
      message: `Reconnecting to live provider in ${delay}ms (${reason})`,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectAndSubscribe();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) {
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}
