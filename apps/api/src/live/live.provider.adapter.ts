import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { inflateRawSync } from 'node:zlib';
import WebSocket, { RawData } from 'ws';
import { LiveAdapter, LivePublish } from './live.adapter';
import {
  LiveAdapterHealth,
  LiveFeedSource,
  LiveFlagStatus,
  LiveLeaderboardEntry,
  LiveRaceControlMessage,
  LiveState,
} from './live.types';

interface SignalrNegotiationResponse {
  ConnectionToken: string;
}

interface SignalrHubMessage {
  H?: unknown;
  M?: unknown;
  A?: unknown;
}

interface FeedEnvelope {
  topic: string;
  payload: unknown;
  emittedAt: string;
}

type JsonRecord = Record<string, unknown>;

const DEFAULT_TOPICS = [
  'SessionInfo',
  'SessionStatus',
  'LapCount',
  'TrackStatus',
  'DriverList',
  'TimingData',
  'TimingAppData',
  'RaceControlMessages',
  'ExtrapolatedClock',
];

const TRACK_STATUS_FLAG_MAP: Record<string, LiveFlagStatus> = {
  '1': 'green',
  '2': 'yellow',
  '3': 'red',
  '4': 'safety_car',
  '5': 'virtual_safety_car',
  '6': 'checkered',
};

const TIRE_COMPOUNDS = new Set([
  'SOFT',
  'MEDIUM',
  'HARD',
  'INTERMEDIATE',
  'WET',
]);

const MAX_RACE_CONTROL_MESSAGES = 30;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): JsonRecord | null =>
  isRecord(value) ? value : null;

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const toInt = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
};

const toIso = (value: unknown, fallback = new Date().toISOString()): string => {
  const raw = asString(value);
  if (!raw) {
    return fallback;
  }

  const timestamp = new Date(raw);
  return Number.isNaN(timestamp.getTime()) ? fallback : timestamp.toISOString();
};

const parseLapOrSectorMs = (value: unknown): number | null => {
  const raw = asString(value);
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }

  const minutesPattern = /^(\d+):(\d{1,2})\.(\d{3})$/;
  const secondsPattern = /^(\d{1,2})\.(\d{3})$/;

  const minutesMatch = trimmed.match(minutesPattern);
  if (minutesMatch) {
    const minutes = Number.parseInt(minutesMatch[1], 10);
    const seconds = Number.parseInt(minutesMatch[2], 10);
    const millis = Number.parseInt(minutesMatch[3], 10);
    return minutes * 60_000 + seconds * 1000 + millis;
  }

  const secondsMatch = trimmed.match(secondsPattern);
  if (secondsMatch) {
    const seconds = Number.parseInt(secondsMatch[1], 10);
    const millis = Number.parseInt(secondsMatch[2], 10);
    return seconds * 1000 + millis;
  }

  return null;
};

const parseGapSeconds = (value: unknown): number | null => {
  const raw = asString(value);
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (
    trimmed === '' ||
    trimmed === '-' ||
    trimmed.toUpperCase().includes('LAP')
  ) {
    return null;
  }

  const sanitized = trimmed.replace(/\+/g, '');
  const parsed = Number.parseFloat(sanitized);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeFlag = (value: unknown): LiveFlagStatus | null => {
  const raw = asString(value);
  if (!raw) {
    return null;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized.includes('virtual') && normalized.includes('safety')) {
    return 'virtual_safety_car';
  }
  if (normalized.includes('safety')) {
    return 'safety_car';
  }
  if (normalized.includes('red')) {
    return 'red';
  }
  if (normalized.includes('yellow')) {
    return 'yellow';
  }
  if (normalized.includes('green')) {
    return 'green';
  }
  if (normalized.includes('checkered') || normalized.includes('chequered')) {
    return 'checkered';
  }

  return null;
};

const normalizeCompound = (
  value: unknown,
): LiveLeaderboardEntry['tireCompound'] => {
  const raw = asString(value);
  if (!raw) {
    return null;
  }

  const upper = raw.toUpperCase();
  return TIRE_COMPOUNDS.has(upper)
    ? (upper as NonNullable<LiveLeaderboardEntry['tireCompound']>)
    : null;
};

const mergeRecords = (
  current: JsonRecord,
  incoming: JsonRecord,
): JsonRecord => {
  const merged: JsonRecord = { ...current };

  for (const [key, value] of Object.entries(incoming)) {
    const currentValue = merged[key];
    if (isRecord(value) && isRecord(currentValue)) {
      merged[key] = mergeRecords(currentValue, value);
      continue;
    }

    merged[key] = value;
  }

  return merged;
};

export const decodeTopicPayload = (
  topic: string,
  payload: unknown,
): FeedEnvelope => {
  const emittedAt = new Date().toISOString();
  if (!topic.endsWith('.z')) {
    if (typeof payload === 'string') {
      const trimmed = payload.trim();
      if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
      ) {
        try {
          return {
            topic,
            payload: JSON.parse(trimmed) as unknown,
            emittedAt,
          };
        } catch {
          return { topic, payload, emittedAt };
        }
      }
    }

    return { topic, payload, emittedAt };
  }

  if (typeof payload !== 'string') {
    return { topic: topic.replace(/\.z$/, ''), payload, emittedAt };
  }

  try {
    const compressed = Buffer.from(payload, 'base64');
    const decompressed = inflateRawSync(compressed).toString('utf-8');
    return {
      topic: topic.replace(/\.z$/, ''),
      payload: JSON.parse(decompressed) as unknown,
      emittedAt,
    };
  } catch {
    return { topic: topic.replace(/\.z$/, ''), payload, emittedAt };
  }
};

export class ProviderStateAccumulator {
  private readonly driverByNumber = new Map<string, JsonRecord>();
  private readonly timingByNumber = new Map<string, JsonRecord>();
  private readonly timingAppByNumber = new Map<string, JsonRecord>();

  private sessionName: string | null = null;
  private weekendId: string | null = null;
  private sessionId: string | null = null;
  private currentLap: number | null = null;
  private totalLaps: number | null = null;
  private phase: 'running' | 'finished' | 'unknown' = 'unknown';
  private flag: LiveFlagStatus = 'green';
  private clockIso: string | null = null;
  private raceControl: LiveRaceControlMessage[] = [];

  ingest(topic: string, payload: unknown, emittedAt: string): string[] {
    const changed = new Set<string>(['generatedAt']);
    const record = asRecord(payload);

    if (topic === 'DriverList' && record) {
      for (const [number, lineValue] of Object.entries(record)) {
        const line = asRecord(lineValue);
        if (!line) {
          continue;
        }

        const current = this.driverByNumber.get(number) ?? {};
        this.driverByNumber.set(number, mergeRecords(current, line));
      }
      changed.add('leaderboard');
    }

    if (topic === 'TimingData' && record) {
      const lines = asRecord(record.Lines);
      if (lines) {
        for (const [number, lineValue] of Object.entries(lines)) {
          const line = asRecord(lineValue);
          if (!line) {
            continue;
          }

          const current = this.timingByNumber.get(number) ?? {};
          this.timingByNumber.set(number, mergeRecords(current, line));
        }
        changed.add('leaderboard');
      }
    }

    if (topic === 'TimingAppData' && record) {
      const lines = asRecord(record.Lines);
      if (lines) {
        for (const [number, lineValue] of Object.entries(lines)) {
          const line = asRecord(lineValue);
          if (!line) {
            continue;
          }

          const current = this.timingAppByNumber.get(number) ?? {};
          this.timingAppByNumber.set(number, mergeRecords(current, line));
        }
        changed.add('leaderboard');
      }
    }

    if (topic === 'LapCount' && record) {
      this.currentLap = toInt(record.CurrentLap);
      this.totalLaps = toInt(record.TotalLaps);
      changed.add('session.currentLap');
      changed.add('session.totalLaps');
    }

    if (topic === 'SessionInfo' && record) {
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
        [meetingName, sessionName]
          .filter((part) => Boolean(part))
          .join(' - ') || this.sessionName;

      changed.add('session.weekendId');
      changed.add('session.sessionId');
      changed.add('session.sessionName');
    }

    if (topic === 'SessionStatus' && record) {
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

    if (topic === 'TrackStatus' && record) {
      const mapped = TRACK_STATUS_FLAG_MAP[asString(record.Status) ?? ''];
      const fromMessage = normalizeFlag(record.Message);
      const flag = mapped ?? fromMessage;
      if (flag) {
        this.flag = flag;
        changed.add('session.flag');
      }
    }

    if (topic === 'ExtrapolatedClock' && record) {
      const value = asString(record.Utc) ?? asString(record.Remaining);
      this.clockIso = value ? toIso(value, emittedAt) : emittedAt;
      changed.add('session.clockIso');
    }

    if (topic === 'RaceControlMessages' && record) {
      const messagesRecord = asRecord(record.Messages);
      if (messagesRecord) {
        const nextMessages: LiveRaceControlMessage[] = [];

        for (const [key, messageValue] of Object.entries(messagesRecord)) {
          const message = asRecord(messageValue);
          if (!message) {
            continue;
          }

          const emitted = toIso(message.Utc, emittedAt);
          const text = asString(message.Message) ?? asString(message.Status);
          if (!text) {
            continue;
          }

          const categoryRaw = (
            asString(message.Category) ?? 'control'
          ).toLowerCase();
          const category: LiveRaceControlMessage['category'] =
            categoryRaw.includes('incident')
              ? 'incident'
              : categoryRaw.includes('pit')
                ? 'pit'
                : categoryRaw.includes('flag')
                  ? 'flag'
                  : 'control';

          const flag =
            normalizeFlag(message.Flag) ?? normalizeFlag(message.Message);

          nextMessages.push({
            id: asString(message.MessageId) ?? `rc-${key}-${emitted}`,
            emittedAt: emitted,
            category,
            message: text,
            flag: flag ?? undefined,
          });
        }

        nextMessages.sort((a, b) => (a.emittedAt < b.emittedAt ? 1 : -1));
        this.raceControl = nextMessages.slice(0, MAX_RACE_CONTROL_MESSAGES);
        changed.add('raceControl');
      }
    }

    return [...changed];
  }

  buildState(emittedAt: string): LiveState | null {
    const numbers = new Set<string>([
      ...this.driverByNumber.keys(),
      ...this.timingByNumber.keys(),
    ]);

    const leaderboard: LiveLeaderboardEntry[] = [];

    for (const number of numbers) {
      const driver = this.driverByNumber.get(number);
      const timing = this.timingByNumber.get(number);
      const timingApp = this.timingAppByNumber.get(number);

      if (!timing) {
        continue;
      }

      const position = toInt(timing.Position) ?? toInt(timing.Line);
      if (position == null) {
        continue;
      }

      const sectors = asRecord(timing.Sectors);
      const sector1 = asRecord(sectors?.['0']);
      const sector2 = asRecord(sectors?.['1']);
      const sector3 = asRecord(sectors?.['2']);

      const intervalValue =
        asString(asRecord(timing.IntervalToPositionAhead)?.Value) ??
        asString(timing.IntervalToPositionAhead);

      const rawStints = timingApp ? timingApp.Stints : null;
      const stints: unknown[] = Array.isArray(rawStints)
        ? rawStints
        : isRecord(rawStints)
          ? Object.values(rawStints).reduce<unknown[]>((accumulator, value) => {
              if (Array.isArray(value)) {
                for (const item of value) {
                  accumulator.push(item);
                }
              }
              return accumulator;
            }, [])
          : [];
      const latestStint =
        stints.length > 0 ? asRecord(stints[stints.length - 1]) : null;

      const firstName = asString(driver?.FirstName);
      const lastName = asString(driver?.LastName);
      const combinedName = [firstName, lastName]
        .filter((value) => Boolean(value))
        .join(' ')
        .trim();

      leaderboard.push({
        position,
        driverCode:
          asString(driver?.Tla) ?? asString(driver?.RacingNumber) ?? number,
        driverName:
          asString(driver?.FullName) ??
          (combinedName.length > 0 ? combinedName : null) ??
          asString(driver?.BroadcastName),
        teamName: asString(driver?.TeamName),
        gapToLeaderSec: parseGapSeconds(timing.GapToLeader),
        intervalToAheadSec: parseGapSeconds(intervalValue),
        sector1Ms: parseLapOrSectorMs(sector1?.Value),
        sector2Ms: parseLapOrSectorMs(sector2?.Value),
        sector3Ms: parseLapOrSectorMs(sector3?.Value),
        lastLapMs: parseLapOrSectorMs(asRecord(timing.LastLapTime)?.Value),
        bestLapMs: parseLapOrSectorMs(asRecord(timing.BestLapTime)?.Value),
        tireCompound:
          normalizeCompound(latestStint?.Compound) ??
          normalizeCompound(timing.Compound),
        stintLap: toInt(latestStint?.TotalLaps),
      });
    }

    leaderboard.sort((a, b) => a.position - b.position);

    const hasSessionInfo =
      this.sessionName !== null ||
      this.currentLap !== null ||
      this.totalLaps !== null ||
      leaderboard.length > 0;
    if (!hasSessionInfo) {
      return null;
    }

    return {
      generatedAt: emittedAt,
      session: {
        weekendId: this.weekendId,
        sessionId: this.sessionId,
        sessionName: this.sessionName,
        phase: this.phase,
        flag: this.flag,
        currentLap: this.currentLap,
        totalLaps: this.totalLaps,
        clockIso: this.clockIso ?? emittedAt,
      },
      leaderboard,
      raceControl: this.raceControl,
    };
  }
}

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

  private running = false;
  private startedAt: string | null = null;
  private lastEventAt: string | null = null;
  private publish: LivePublish | null = null;
  private socket: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private invokeId = 1;
  private initialStatePublished = false;
  private readonly accumulator = new ProviderStateAccumulator();

  constructor(private readonly configService: ConfigService) {
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
  }

  async start(publish: LivePublish): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    this.publish = publish;
    this.startedAt = new Date().toISOString();
    this.lastEventAt = this.startedAt;
    this.reconnectAttempt = 0;
    this.invokeId = 1;
    this.initialStatePublished = false;

    publish({
      type: 'status',
      status: 'connecting',
      message: 'Connecting to Formula 1 live SignalR stream',
    });

    this.startHeartbeatLoop();
    await this.connectAndSubscribe();
  }

  stop(): Promise<void> {
    this.running = false;
    this.publish = null;
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

    return Promise.resolve();
  }

  getHealth(): LiveAdapterHealth {
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
      this.publish?.({
        type: 'status',
        status: 'live',
        message: 'Connected to Formula 1 live SignalR stream',
      });
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

  private async negotiate(): Promise<SignalrNegotiationResponse> {
    const url = this.buildHttpUrl('negotiate');
    const response = await fetch(url);
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

    return new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(url);
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
    const response = await fetch(url);
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

    const frames = rawText.includes('\u001e')
      ? rawText
          .split('\u001e')
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      : [rawText.trim()].filter((value) => value.length > 0);

    for (const frame of frames) {
      let envelope: JsonRecord;
      try {
        envelope = JSON.parse(frame) as JsonRecord;
      } catch {
        continue;
      }

      const messages = Array.isArray(envelope.M) ? envelope.M : [];
      for (const item of messages) {
        const hubMessage = asRecord(item) as SignalrHubMessage | null;
        if (!hubMessage) {
          continue;
        }

        const hub = (asString(hubMessage.H) ?? '').toLowerCase();
        const method = (asString(hubMessage.M) ?? '').toLowerCase();
        if (hub !== this.hubName.toLowerCase() || method !== 'feed') {
          continue;
        }

        const args = Array.isArray(hubMessage.A) ? hubMessage.A : [];
        const topicRaw = asString(args[0]);
        if (!topicRaw) {
          continue;
        }

        const decoded = decodeTopicPayload(topicRaw, args[1]);
        const emittedAt = toIso(args[2], decoded.emittedAt);

        const changedFields = this.accumulator.ingest(
          decoded.topic,
          decoded.payload,
          emittedAt,
        );
        this.lastEventAt = emittedAt;
        this.publishState(changedFields, emittedAt);
      }
    }
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
