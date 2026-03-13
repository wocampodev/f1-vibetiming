import { Injectable, Logger } from '@nestjs/common';
import {
  LiveCaptureRunStatus,
  LiveCaptureSource,
  Prisma,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  LiveBoardProjectionState,
  LiveFeedSource,
  LivePublicState,
  LiveState,
} from './live.types';

export interface LiveCaptureContext {
  weekendId: string | null;
  sessionId: string | null;
  sessionName: string | null;
}

export interface LiveCapturedProviderMessage {
  rawTopic: string;
  topic: string;
  payload: unknown;
  emittedAt: string;
  decodeError: boolean;
}

export interface LivePersistedSnapshot {
  sessionKey: string;
  generatedAt: string;
  version: number;
  changedFields: string[];
  internalState: LiveState;
  publicState: LivePublicState;
  projectionState: LiveBoardProjectionState | null;
}

const EMPTY_CAPTURE_CONTEXT: LiveCaptureContext = {
  weekendId: null,
  sessionId: null,
  sessionName: null,
};

const TRUE_CONFIG_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_CONFIG_VALUES = new Set(['0', 'false', 'no', 'off']);
const DEFAULT_RESTORE_MAX_AGE_SEC = 6 * 60 * 60;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseBooleanConfigValue = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return fallback;
  }

  if (TRUE_CONFIG_VALUES.has(normalized)) {
    return true;
  }

  if (FALSE_CONFIG_VALUES.has(normalized)) {
    return false;
  }

  return fallback;
};

const normalizeShapeKey = (key: string): string =>
  /^\d+$/.test(key) ? '*' : key;

const sanitizeKeyPart = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized.length > 0 ? normalized : null;
};

const normalizeJsonValue = (value: unknown): unknown => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonValue(item));
  }

  if (isRecord(value)) {
    const normalizedEntries = Object.entries(value)
      .filter(([, nestedValue]) => nestedValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => [key, normalizeJsonValue(nestedValue)]);

    return Object.fromEntries(normalizedEntries);
  }

  return Object.prototype.toString.call(value);
};

const toStoredJsonValue = (
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull => {
  const normalized = normalizeJsonValue(value);
  if (normalized === null) {
    return Prisma.JsonNull;
  }

  return normalized as Prisma.InputJsonValue;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
};

const toProjectionState = (value: unknown): LiveBoardProjectionState | null => {
  if (!isRecord(value)) {
    return null;
  }

  return value as unknown as LiveBoardProjectionState;
};

const stableStringify = (value: unknown): string =>
  JSON.stringify(normalizeJsonValue(value));

const hashValue = (value: unknown): string =>
  createHash('sha256').update(stableStringify(value)).digest('hex');

const collectJsonPaths = (value: unknown, basePath = ''): string[] => {
  if (Array.isArray(value)) {
    const arrayPath = basePath.length > 0 ? `${basePath}[]` : '[]';
    const nestedPaths = value.flatMap((item) =>
      collectJsonPaths(item, arrayPath),
    );
    return [...new Set([arrayPath, ...nestedPaths])];
  }

  if (isRecord(value)) {
    const paths = new Set<string>();

    for (const [key, nestedValue] of Object.entries(value)) {
      const nextPath =
        basePath.length > 0
          ? `${basePath}.${normalizeShapeKey(key)}`
          : normalizeShapeKey(key);
      paths.add(nextPath);

      for (const nestedPath of collectJsonPaths(nestedValue, nextPath)) {
        paths.add(nestedPath);
      }
    }

    return [...paths].sort((left, right) => left.localeCompare(right));
  }

  return basePath.length > 0 ? [basePath] : ['$'];
};

const collectTopLevelKeys = (value: unknown): string[] => {
  if (!isRecord(value)) {
    return [];
  }

  return [
    ...new Set(Object.keys(value).map((key) => normalizeShapeKey(key))),
  ].sort((left, right) => left.localeCompare(right));
};

const mapCaptureSource = (source: LiveFeedSource): LiveCaptureSource =>
  source === 'provider'
    ? LiveCaptureSource.PROVIDER
    : LiveCaptureSource.SIMULATOR;

const buildSessionKey = (
  source: LiveFeedSource,
  context: LiveCaptureContext,
): string => {
  const weekendKey = sanitizeKeyPart(context.weekendId) ?? 'unknown-weekend';
  const sessionKey =
    sanitizeKeyPart(context.sessionId) ??
    sanitizeKeyPart(context.sessionName) ??
    'unknown-session';

  return `${source}:${weekendKey}:${sessionKey}`;
};

const mergeCaptureContext = (
  current: LiveCaptureContext,
  next: LiveCaptureContext,
): LiveCaptureContext => ({
  weekendId: next.weekendId ?? current.weekendId,
  sessionId: next.sessionId ?? current.sessionId,
  sessionName: next.sessionName ?? current.sessionName,
});

@Injectable()
export class LiveCaptureService {
  private readonly logger = new Logger(LiveCaptureService.name);
  private readonly captureEnabled: boolean;
  private readonly rawRetentionDays: number;
  private readonly snapshotRetentionDays: number;
  private readonly restoreMaxAgeSec: number;

  private activeProviderRunId: string | null = null;
  private activeProviderRunStartedAt: string | null = null;
  private activeProviderSequence = 0;
  private latestSnapshotAt: string | null = null;
  private providerContext: LiveCaptureContext = { ...EMPTY_CAPTURE_CONTEXT };
  private eventWriteQueue: Promise<void> = Promise.resolve();
  private snapshotWriteQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.captureEnabled = parseBooleanConfigValue(
      this.configService.get<string>('LIVE_PROVIDER_CAPTURE_ENABLED', 'true'),
      true,
    );
    this.rawRetentionDays = this.configService.get<number>(
      'LIVE_PROVIDER_RAW_RETENTION_DAYS',
      30,
    );
    this.snapshotRetentionDays = this.configService.get<number>(
      'LIVE_PROVIDER_SNAPSHOT_RETENTION_DAYS',
      30,
    );
    this.restoreMaxAgeSec = this.configService.get<number>(
      'LIVE_PROVIDER_SNAPSHOT_RESTORE_MAX_AGE_SEC',
      DEFAULT_RESTORE_MAX_AGE_SEC,
    );
  }

  getHealth(source: LiveFeedSource) {
    return {
      enabled: this.isCaptureEnabled(source),
      activeRunId:
        source === 'provider' && this.captureEnabled
          ? this.activeProviderRunId
          : null,
      activeRunStartedAt:
        source === 'provider' && this.captureEnabled
          ? this.activeProviderRunStartedAt
          : null,
      latestSnapshotAt:
        source === 'provider' && this.captureEnabled
          ? this.latestSnapshotAt
          : null,
      rawRetentionDays: this.captureEnabled ? this.rawRetentionDays : null,
      snapshotRetentionDays: this.captureEnabled
        ? this.snapshotRetentionDays
        : null,
      restoreMaxAgeSec: this.captureEnabled ? this.restoreMaxAgeSec : null,
    };
  }

  async startProviderCapture(): Promise<void> {
    if (!this.isCaptureEnabled('provider') || this.activeProviderRunId) {
      return;
    }

    try {
      const startedAt = new Date();
      const sessionKey = buildSessionKey('provider', this.providerContext);
      await this.prisma.liveCaptureRun.updateMany({
        where: { status: LiveCaptureRunStatus.ACTIVE },
        data: {
          status: LiveCaptureRunStatus.INTERRUPTED,
          finishedAt: startedAt,
        },
      });
      const run = await this.prisma.liveCaptureRun.create({
        data: {
          source: LiveCaptureSource.PROVIDER,
          sessionKey,
          weekendId: this.providerContext.weekendId,
          sessionId: this.providerContext.sessionId,
          sessionName: this.providerContext.sessionName,
          status: LiveCaptureRunStatus.ACTIVE,
          startedAt,
          lastEventAt: startedAt,
        },
      });

      this.activeProviderRunId = run.id;
      this.activeProviderRunStartedAt = run.startedAt.toISOString();
      this.activeProviderSequence = 0;
      this.logger.log(`Started provider capture run ${run.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Unable to start provider capture run: ${message}`);
    }
  }

  async completeProviderCapture(
    status: LiveCaptureRunStatus = LiveCaptureRunStatus.COMPLETED,
  ): Promise<void> {
    if (!this.captureEnabled || !this.activeProviderRunId) {
      return;
    }

    await Promise.all([this.eventWriteQueue, this.snapshotWriteQueue]);

    const runId = this.activeProviderRunId;
    this.activeProviderRunId = null;
    this.activeProviderRunStartedAt = null;
    this.activeProviderSequence = 0;

    try {
      await this.prisma.liveCaptureRun.update({
        where: { id: runId },
        data: {
          status,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Unable to finish provider capture run ${runId}: ${message}`,
      );
    }
  }

  recordProviderMessage(
    message: LiveCapturedProviderMessage,
    context: LiveCaptureContext,
    changedFields: string[],
  ): void {
    if (!this.captureEnabled || !this.activeProviderRunId) {
      return;
    }

    const runId = this.activeProviderRunId;
    const runSequence = ++this.activeProviderSequence;
    this.providerContext = mergeCaptureContext(this.providerContext, context);
    this.eventWriteQueue = this.eventWriteQueue
      .then(async () => {
        const source = LiveCaptureSource.PROVIDER;
        const resolvedContext = mergeCaptureContext(
          this.providerContext,
          context,
        );
        const sessionKey = buildSessionKey('provider', resolvedContext);
        const emittedAt = new Date(message.emittedAt);
        const payloadHash = hashValue(message.payload);
        const fieldPaths = collectJsonPaths(message.payload);
        const topLevelKeys = collectTopLevelKeys(message.payload);
        const shapeSignature = hashValue({
          rawTopic: message.rawTopic,
          fieldPaths,
        });

        const runUpdate: Prisma.LiveCaptureRunUpdateInput = {
          sessionKey,
          weekendId: resolvedContext.weekendId,
          sessionId: resolvedContext.sessionId,
          sessionName: resolvedContext.sessionName,
          lastEventAt: emittedAt,
          lastTopic: message.topic,
          eventsCaptured: { increment: 1 },
        };

        if (message.decodeError) {
          runUpdate.decodeErrors = { increment: 1 };
        }

        await this.prisma.$transaction([
          this.prisma.liveProviderEvent.create({
            data: {
              captureRunId: runId,
              source,
              sessionKey,
              weekendId: resolvedContext.weekendId,
              sessionId: resolvedContext.sessionId,
              sessionName: resolvedContext.sessionName,
              runSequence,
              rawTopic: message.rawTopic,
              topic: message.topic,
              emittedAt,
              receivedAt: new Date(),
              decodeError: message.decodeError,
              payloadHash,
              payload: toStoredJsonValue(message.payload),
              changedFields: toStoredJsonValue(changedFields),
            },
          }),
          this.prisma.liveCaptureRun.update({
            where: { id: runId },
            data: runUpdate,
          }),
          this.prisma.liveTopicSchemaCatalog.upsert({
            where: {
              source_rawTopic_shapeSignature: {
                source,
                rawTopic: message.rawTopic,
                shapeSignature,
              },
            },
            create: {
              source,
              rawTopic: message.rawTopic,
              topic: message.topic,
              shapeSignature,
              topLevelKeys: toStoredJsonValue(topLevelKeys),
              fieldPaths: toStoredJsonValue(fieldPaths),
              samplePayload: toStoredJsonValue(message.payload),
              firstSeenAt: emittedAt,
              lastSeenAt: emittedAt,
              observations: 1,
              decodeErrorCount: message.decodeError ? 1 : 0,
            },
            update: {
              topic: message.topic,
              topLevelKeys: toStoredJsonValue(topLevelKeys),
              fieldPaths: toStoredJsonValue(fieldPaths),
              samplePayload: toStoredJsonValue(message.payload),
              lastSeenAt: emittedAt,
              observations: { increment: 1 },
              ...(message.decodeError
                ? { decodeErrorCount: { increment: 1 } }
                : {}),
            },
          }),
        ]);
      })
      .catch((error) => {
        const messageText =
          error instanceof Error ? error.message : String(error);
        this.logger.warn(`Unable to persist provider message: ${messageText}`);
      });
  }

  persistSnapshot(
    source: LiveFeedSource,
    state: LiveState,
    publicState: LivePublicState,
    projectionState: LiveBoardProjectionState,
    changedFields: string[],
  ): void {
    if (!this.isCaptureEnabled(source)) {
      return;
    }

    if (source === 'provider') {
      this.providerContext = mergeCaptureContext(this.providerContext, {
        weekendId: state.session.weekendId,
        sessionId: state.session.sessionId,
        sessionName: state.session.sessionName,
      });
    }

    const captureRunId =
      source === 'provider' ? this.activeProviderRunId : null;
    const sessionKey = buildSessionKey(source, state.session);
    const captureSource = mapCaptureSource(source);

    this.snapshotWriteQueue = this.snapshotWriteQueue
      .then(async () => {
        const generatedAt = new Date(state.generatedAt);

        await this.prisma.$transaction(async (tx) => {
          const previousLatestSnapshot = await tx.liveSessionSnapshot.findFirst(
            {
              where: {
                source: captureSource,
                sessionKey,
              },
              orderBy: [{ version: 'desc' }, { generatedAt: 'desc' }],
              select: {
                version: true,
              },
            },
          );

          await tx.liveSessionSnapshot.updateMany({
            where: {
              source: captureSource,
              sessionKey,
              isLatest: true,
            },
            data: {
              isLatest: false,
            },
          });

          await tx.liveSessionSnapshot.create({
            data: {
              captureRunId,
              source: captureSource,
              sessionKey,
              weekendId: state.session.weekendId,
              sessionId: state.session.sessionId,
              sessionName: state.session.sessionName,
              generatedAt,
              lastEventAt: generatedAt,
              version: (previousLatestSnapshot?.version ?? 0) + 1,
              isLatest: true,
              publicState: toStoredJsonValue(publicState),
              internalState: toStoredJsonValue(state),
              projectionState: toStoredJsonValue(projectionState),
              changedFields: toStoredJsonValue(changedFields),
            },
          });
        });

        this.latestSnapshotAt = state.generatedAt;
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Unable to persist live snapshot: ${message}`);
      });
  }

  async loadLatestSnapshotBundle(
    source: LiveFeedSource,
  ): Promise<LivePersistedSnapshot | null> {
    if (!this.isCaptureEnabled(source)) {
      return null;
    }

    try {
      const snapshot = await this.prisma.liveSessionSnapshot.findFirst({
        where: {
          source: mapCaptureSource(source),
          isLatest: true,
        },
        orderBy: [{ generatedAt: 'desc' }, { version: 'desc' }],
      });

      if (!snapshot) {
        return null;
      }

      const ageSec = Math.floor(
        (Date.now() - snapshot.generatedAt.getTime()) / 1000,
      );
      if (ageSec > this.restoreMaxAgeSec) {
        return null;
      }

      this.latestSnapshotAt = snapshot.generatedAt.toISOString();
      return {
        sessionKey: snapshot.sessionKey,
        generatedAt: snapshot.generatedAt.toISOString(),
        version: snapshot.version,
        changedFields: toStringArray(snapshot.changedFields),
        internalState: snapshot.internalState as unknown as LiveState,
        publicState: snapshot.publicState as unknown as LivePublicState,
        projectionState: toProjectionState(snapshot.projectionState),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Unable to load persisted live snapshot: ${message}`);
      return null;
    }
  }

  async loadLatestSnapshot(source: LiveFeedSource): Promise<LiveState | null> {
    const snapshot = await this.loadLatestSnapshotBundle(source);
    return snapshot?.internalState ?? null;
  }

  seedProviderContext(context: LiveCaptureContext): void {
    this.providerContext = mergeCaptureContext(this.providerContext, context);
  }

  async purgeExpiredData(): Promise<void> {
    if (!this.captureEnabled) {
      return;
    }

    const rawCutoff = new Date(
      Date.now() - this.rawRetentionDays * 24 * 60 * 60 * 1000,
    );
    const snapshotCutoff = new Date(
      Date.now() - this.snapshotRetentionDays * 24 * 60 * 60 * 1000,
    );

    const [deletedEvents, deletedSnapshots, deletedRuns] = await Promise.all([
      this.prisma.liveProviderEvent.deleteMany({
        where: { receivedAt: { lt: rawCutoff } },
      }),
      this.prisma.liveSessionSnapshot.deleteMany({
        where: { generatedAt: { lt: snapshotCutoff } },
      }),
      this.prisma.liveCaptureRun.deleteMany({
        where: {
          status: {
            in: [
              LiveCaptureRunStatus.COMPLETED,
              LiveCaptureRunStatus.INTERRUPTED,
            ],
          },
          finishedAt: { lt: rawCutoff },
        },
      }),
    ]);

    await this.refreshLatestSnapshotAt();

    this.logger.log(
      `Live capture retention cleanup deleted ${deletedEvents.count} events, ${deletedSnapshots.count} snapshots, and ${deletedRuns.count} runs`,
    );
  }

  private isCaptureEnabled(source: LiveFeedSource): boolean {
    return this.captureEnabled && source === 'provider';
  }

  private async refreshLatestSnapshotAt(): Promise<void> {
    const snapshot = await this.prisma.liveSessionSnapshot.findFirst({
      where: {
        source: LiveCaptureSource.PROVIDER,
        isLatest: true,
      },
      orderBy: { generatedAt: 'desc' },
      select: { generatedAt: true },
    });

    this.latestSnapshotAt = snapshot?.generatedAt.toISOString() ?? null;
  }
}
