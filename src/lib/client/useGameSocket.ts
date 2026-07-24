"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getGameWsUrls } from "@/lib/client/config";
import { isFirebaseConfigured } from "@/lib/client/firebase";
import { useFirebaseGame } from "@/lib/client/useFirebaseGame";
import type { ClientEvent, Direction, PublicRoomState, ServerEvent } from "@/lib/types";

export function useGameSocket() {
  if (isFirebaseConfigured()) return useFirebaseGame();
  return useLocalGameSocket();
}

function useLocalGameSocket() {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(true);
  const socketIndexRef = useRef(0);
  const [state, setState] = useState<PublicRoomState | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [lastEvent, setLastEvent] = useState<ServerEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [socketUrl, setSocketUrl] = useState("");
  const [fallbackRoomId, setFallbackRoomId] = useState("");
  const [fallbackPlayerId, setFallbackPlayerId] = useState("");

  useEffect(() => {
    shouldReconnectRef.current = true;

    const connect = () => {
      const urls = getGameWsUrls();
      const nextUrl = urls[socketIndexRef.current % urls.length];
      setStatus("connecting");
      setSocketUrl(nextUrl);
      const socket = new WebSocket(nextUrl);
      socketRef.current = socket;
      socket.onopen = () => {
        setStatus("connected");
        setError(null);
      };
      socket.onclose = () => {
        setStatus("disconnected");
        socketIndexRef.current += 1;
        if (shouldReconnectRef.current) reconnectTimerRef.current = setTimeout(connect, 700);
      };
      socket.onerror = () => setError(`Socket failed: ${nextUrl}`);
      socket.onmessage = (message) => {
        const event = JSON.parse(message.data) as ServerEvent;
        setLastEvent(event);
        if (event.type === "ROOM_STATE") setState(event.state);
        if (event.type === "ERROR") setError(event.message);
      };
    };

    connect();

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!fallbackRoomId || status === "connected") return;
    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch(`/api/game/state?roomId=${encodeURIComponent(fallbackRoomId)}&playerId=${encodeURIComponent(fallbackPlayerId)}`);
        const data = (await response.json()) as { state?: PublicRoomState; error?: string };
        if (cancelled) return;
        if (data.state) {
          setState(data.state);
          setLastEvent({ type: "ROOM_STATE", state: data.state });
          setError(null);
        } else if (data.error) {
          setState(null);
          setLastEvent({ type: "ERROR", message: data.error });
          setError(data.error);
          if (data.error === "Room not found.") setFallbackRoomId("");
        }
      } catch {
        if (!cancelled) setError("HTTP fallback failed.");
      }
    };

    poll();
    const interval = window.setInterval(poll, 700);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [fallbackPlayerId, fallbackRoomId, status]);

  const send = useCallback((event: ClientEvent) => {
    const socket = socketRef.current;
    if (event.type === "JOIN_ROOM") {
      setFallbackRoomId(event.roomId);
      setFallbackPlayerId(event.playerId);
    }
    if (event.type === "LEAVE_ROOM") {
      setFallbackRoomId("");
      setFallbackPlayerId("");
    }
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(event));
      return true;
    }
    if (event.type === "JOIN_ROOM") {
      postFallback("/api/game/join", event, setState, setLastEvent, setError);
      return true;
    }
    if (event.type === "LEAVE_ROOM") {
      postFallback("/api/game/leave", event, setState, setLastEvent, setError);
      return true;
    }
    if (event.type === "SUBMIT_INPUT") {
      postFallback("/api/game/input", { ...event, roomId: fallbackRoomId, playerId: fallbackPlayerId }, setState, setLastEvent, setError);
      return Boolean(fallbackRoomId && fallbackPlayerId);
    }
    return false;
  }, [fallbackPlayerId, fallbackRoomId]);

  return { state, status, lastEvent, error, socketUrl, send, clearError: () => setError(null) };
}

function postFallback(
  url: string,
  body: unknown,
  setState: (state: PublicRoomState | null) => void,
  setLastEvent: (event: ServerEvent) => void,
  setError: (error: string | null) => void
) {
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  })
    .then(async (response) => {
      const data = (await response.json()) as { state?: PublicRoomState; reason?: string; error?: string; direction?: string; windowId?: string };
      if (data.state) {
        setState(data.state);
        setLastEvent({ type: "ROOM_STATE", state: data.state });
        setError(null);
      }
      if (!response.ok || data.reason || data.error) {
        const message = data.reason || data.error || "Request failed.";
        setError(message);
        if (data.reason) setLastEvent({ type: "INPUT_REJECTED", reason: data.reason });
        else {
          setState(null);
          setLastEvent({ type: "ERROR", message });
        }
      }
      if (response.ok && data.direction && data.windowId) {
        setLastEvent({ type: "INPUT_ACCEPTED", direction: data.direction as Direction, windowId: data.windowId });
      }
    })
    .catch(() => setError("HTTP fallback failed."));
}
