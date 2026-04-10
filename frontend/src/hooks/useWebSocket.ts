"use client";

import { useEffect, useRef, useCallback, useState } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";

interface WSMessage {
  event: string;
  [key: string]: unknown;
}

interface UseWebSocketOptions {
  screenId: string;
  onMessage?: (msg: WSMessage) => void;
  onContentUpdate?: () => void;
  onForceReload?: () => void;
  onTickerUpdate?: () => void;
  onEmergencyMessage?: (message: string | null) => void;
  reconnectDelay?: number;
}

export function useDisplayWebSocket({
  screenId,
  onMessage,
  onContentUpdate,
  onForceReload,
  onTickerUpdate,
  onEmergencyMessage,
  reconnectDelay = 3000,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimer = useRef<NodeJS.Timeout | null>(null);
  const isMounted = useRef(true);
  const [connected, setConnected] = useState(false);

  const onMessageRef = useRef(onMessage);
  const onContentUpdateRef = useRef(onContentUpdate);
  const onForceReloadRef = useRef(onForceReload);
  const onTickerUpdateRef = useRef(onTickerUpdate);
  const onEmergencyMessageRef = useRef(onEmergencyMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
    onContentUpdateRef.current = onContentUpdate;
    onForceReloadRef.current = onForceReload;
    onTickerUpdateRef.current = onTickerUpdate;
    onEmergencyMessageRef.current = onEmergencyMessage;
  });

  const connect = useCallback(() => {
    if (!isMounted.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_URL}/ws/screen/${screenId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WS] Conectado:", screenId);
      setConnected(true);
      ws.send(JSON.stringify({ event: "SCREEN_HEARTBEAT" }));
      heartbeatTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: "SCREEN_HEARTBEAT" }));
        }
      }, 20_000);
    };

    ws.onmessage = (evt) => {
      try {
        const msg: WSMessage = JSON.parse(evt.data);
        onMessageRef.current?.(msg);

        switch (msg.event) {
          case "CONTENT_UPDATE":
          case "BANNER_UPDATE":
          case "VIDEO_UPDATE":
            onContentUpdateRef.current?.();
            break;
          case "TICKER_UPDATE":
            onTickerUpdateRef.current?.();
            break;
          case "FORCE_RELOAD":
            onForceReloadRef.current?.();
            break;
          case "EMERGENCY_MESSAGE":
            onEmergencyMessageRef.current?.(msg.message as string | null);
            break;
          case "EMERGENCY_CLEAR":
            onEmergencyMessageRef.current?.(null);
            break;
        }
      } catch {
        // non-JSON message, ignore
      }
    };

    ws.onclose = () => {
      clearInterval(heartbeatTimer.current!);
      setConnected(false);
      console.log("[WS] Desconectado, reconectando em", reconnectDelay, "ms");
      if (isMounted.current) {
        reconnectTimer.current = setTimeout(connect, reconnectDelay);
      }
    };

    ws.onerror = (err) => {
      console.error("[WS] Erro:", err);
      ws.close();
    };
  }, [screenId, reconnectDelay]);

  const sendMessage = useCallback((msg: WSMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    connect();

    return () => {
      isMounted.current = false;
      clearTimeout(reconnectTimer.current!);
      clearInterval(heartbeatTimer.current!);
      wsRef.current?.close();
    };
  }, [connect]);

  return { sendMessage, connected };
}
