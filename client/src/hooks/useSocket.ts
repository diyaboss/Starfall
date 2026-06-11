import { useCallback, useEffect } from "react";
import { getSocket, connectSocket, disconnectSocket } from "@/socket/socket";
import { registerSocketEvents } from "@/socket/events";
import { useGameStore } from "@/store/gameStore";
import type { JoinPayload } from "@shared/types";

// ---------------------------------------------------------------------------
// useSocketConnection
// Initialises the socket, registers all event handlers, and connects.
// Also wires the socket-level connect/disconnect/connect_error events so that
// connectionStatus in the store is always accurate.
// Call once at the app root level.
// ---------------------------------------------------------------------------

export function useSocketConnection(): void {
  useEffect(() => {
    const socket = getSocket();
    const store = useGameStore.getState();

    // Register game-level events first.
    registerSocketEvents();

    // Wire transport-level lifecycle events so the store stays in sync.
    const onConnect = () => store.setConnectionStatus("connected");
    const onDisconnect = () => store.setConnectionStatus("disconnected");
    const onConnectError = () => store.setConnectionStatus("error");
    const onReconnectAttempt = () => store.setConnectionStatus("connecting");

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.io.on("reconnect_attempt", onReconnectAttempt);

    // If the socket is already connected by the time this effect runs (e.g. hot
    // reload), set the status immediately rather than waiting for a new event.
    if (socket.connected) {
      store.setConnectionStatus("connected");
    } else {
      store.setConnectionStatus("connecting");
      connectSocket();
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      disconnectSocket();
      useGameStore.getState().setConnectionStatus("disconnected");
    };
  }, []);
}

// ---------------------------------------------------------------------------
// useJoin
// Returns a stable callback to emit player:join.
// ---------------------------------------------------------------------------

export function useJoin(): (payload: JoinPayload) => void {
    return useCallback((payload: JoinPayload) => {
      const socket = getSocket();
  
      
  
      socket.emit("player:join", payload);
    }, []);
  }

// ---------------------------------------------------------------------------
// useEmit
// Returns a type-safe emit function bound to the shared socket.
// Usage: const emit = useEmit(); emit("player:move", { ... });
// ---------------------------------------------------------------------------

type EmitFn = <E extends keyof import("@/socket/socket").ClientToServerEvents>(
  event: E,
  ...args: Parameters<import("@/socket/socket").ClientToServerEvents[E]>
) => void;

export function useEmit(): EmitFn {
  return useCallback(<E extends keyof import("@/socket/socket").ClientToServerEvents>(
    event: E,
    ...args: Parameters<import("@/socket/socket").ClientToServerEvents[E]>
  ) => {
    const socket = getSocket();
    (socket.emit as (...a: unknown[]) => void)(event, ...args);
  }, []);
}

// ---------------------------------------------------------------------------
// useConnectionStatus
// ---------------------------------------------------------------------------

export function useConnectionStatus(): import("@/types/game").ConnectionStatus {
  return useGameStore((s) => s.connectionStatus);
}

// ---------------------------------------------------------------------------
// useIsConnected
// ---------------------------------------------------------------------------

export function useIsConnected(): boolean {
  return useGameStore((s) => s.connectionStatus === "connected");
}