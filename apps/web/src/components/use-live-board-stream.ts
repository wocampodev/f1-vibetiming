"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LiveBoardState,
  LiveDeltaPayload,
  LiveHealthState,
  LiveHeartbeatPayload,
  LiveState,
} from "@/lib/types";
import { parseEnvelope } from "@/lib/live-board";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
const FALLBACK_POLL_MS = 5000;
const HEALTH_POLL_MS = 10000;
const STALE_THRESHOLD_MS = 40000;
const NO_FEED_NOTICE_THRESHOLD_SEC = 20;
const BOARD_REFRESH_MIN_INTERVAL_MS = 750;

export function useLiveBoardStream({
  initialBoardState = null,
  initialHealth = null,
}: {
  initialBoardState?: LiveBoardState | null;
  initialHealth?: LiveHealthState | null;
} = {}) {
  const [boardState, setBoardState] = useState<LiveBoardState | null>(
    initialBoardState,
  );
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(
    initialHealth?.lastEventAt ?? initialBoardState?.generatedAt ?? null,
  );
  const [health, setHealth] = useState<LiveHealthState | null>(initialHealth);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    const loadHealth = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/live/health`, {
          cache: "no-store",
        });
        if (!response.ok || cancelled) {
          return;
        }

        const payload = (await response.json()) as LiveHealthState;
        if (!cancelled) {
          setHealth(payload);
        }
      } catch {
        if (!cancelled) {
          setHealth(null);
        }
      }
    };

    void loadHealth();
    const timer = window.setInterval(() => {
      void loadHealth();
    }, HEALTH_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let stream: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let fallbackTimer: number | null = null;
    let boardRefreshTimer: number | null = null;
    let closed = false;
    let reconnectAttempt = 0;
    let lastBoardLoadStartedAt = 0;
    let pendingBoardRefresh = false;
    let inFlightBoardRequest: Promise<void> | null = null;

    const loadBoard = async () => {
      if (inFlightBoardRequest) {
        return inFlightBoardRequest;
      }

      lastBoardLoadStartedAt = Date.now();

      inFlightBoardRequest = (async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/live/board`, {
            cache: "no-store",
          });
          if (!response.ok) {
            return;
          }

          const nextBoard = (await response.json()) as LiveBoardState | null;
          setBoardState(nextBoard);
        } catch {
          // keep retrying on next scheduled refresh or fallback interval
        }
      })();

      try {
        await inFlightBoardRequest;
      } finally {
        inFlightBoardRequest = null;

        if (pendingBoardRefresh && !closed) {
          scheduleBoardRefresh();
        }
      }
    };

    const clearBoardRefreshTimer = () => {
      if (boardRefreshTimer == null) {
        return;
      }

      window.clearTimeout(boardRefreshTimer);
      boardRefreshTimer = null;
    };

    const scheduleBoardRefresh = (preferImmediate = false) => {
      if (closed) {
        return;
      }

      pendingBoardRefresh = true;
      if (boardRefreshTimer != null) {
        return;
      }

      const elapsedMs = Date.now() - lastBoardLoadStartedAt;
      const delayMs =
        lastBoardLoadStartedAt === 0
          ? 0
          : Math.max(
              0,
              BOARD_REFRESH_MIN_INTERVAL_MS - elapsedMs,
            );

      boardRefreshTimer = window.setTimeout(() => {
        boardRefreshTimer = null;
        if (!pendingBoardRefresh || closed) {
          return;
        }

        pendingBoardRefresh = false;
        void loadBoard();
      }, preferImmediate ? delayMs : Math.max(delayMs, 100));
    };

    const stopFallback = () => {
      if (!fallbackTimer) {
        return;
      }

      window.clearInterval(fallbackTimer);
      fallbackTimer = null;
    };

    const startFallback = () => {
      if (fallbackTimer) {
        return;
      }

      scheduleBoardRefresh(true);
      fallbackTimer = window.setInterval(() => {
        scheduleBoardRefresh(true);
      }, FALLBACK_POLL_MS);
    };

    const closeStream = () => {
      if (!stream) {
        return;
      }

      stream.close();
      stream = null;
    };

    const scheduleReconnect = () => {
      if (closed || reconnectTimer) {
        return;
      }

      reconnectAttempt += 1;
      const delayMs = Math.min(
        RECONNECT_MAX_DELAY_MS,
        RECONNECT_BASE_DELAY_MS * 2 ** Math.max(0, reconnectAttempt - 1),
      );

      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        openStream();
      }, delayMs);
    };

    const openStream = () => {
      if (closed) {
        return;
      }

      closeStream();
      stream = new EventSource(`${API_BASE_URL}/live/stream`);

      stream.onopen = () => {
        reconnectAttempt = 0;
        stopFallback();
      };

      stream.onerror = () => {
        startFallback();
        closeStream();
        scheduleReconnect();
      };

      const handleUpdate = (event: MessageEvent<string>) => {
        const envelope = parseEnvelope<LiveState | LiveDeltaPayload>(event.data);
        const generatedAt = envelope
          ? "state" in envelope.payload
            ? envelope.payload.state.generatedAt
            : envelope.payload.generatedAt
          : null;

        if (generatedAt) {
          setLastHeartbeat(generatedAt);
        }

        scheduleBoardRefresh(true);
      };

      const handleHeartbeat = (event: MessageEvent<string>) => {
        const envelope = parseEnvelope<LiveHeartbeatPayload>(event.data);
        if (!envelope) {
          return;
        }

        setLastHeartbeat(envelope.payload.at);
      };

      stream.addEventListener("initial_state", handleUpdate as EventListener);
      stream.addEventListener("delta_update", handleUpdate as EventListener);
      stream.addEventListener("heartbeat", handleHeartbeat as EventListener);
    };

    if (!initialBoardState) {
      scheduleBoardRefresh(true);
    }

    openStream();

    return () => {
      closed = true;

      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }

      stopFallback();
      clearBoardRefreshTimer();
      closeStream();
    };
  }, [initialBoardState]);

  const streamStale = useMemo(() => {
    const reference = lastHeartbeat ?? boardState?.generatedAt ?? null;
    if (!reference) {
      return false;
    }

    return nowMs - new Date(reference).getTime() > STALE_THRESHOLD_MS;
  }, [boardState?.generatedAt, lastHeartbeat, nowMs]);

  const noFeedYet =
    !boardState &&
    health?.details?.socketOpen === true &&
    (health.details.connectionUptimeSec ?? 0) >= NO_FEED_NOTICE_THRESHOLD_SEC &&
    (health.details.feedMessagesReceived ?? 0) === 0;

  return {
    boardState,
    health,
    streamStale,
    noFeedYet,
  };
}
