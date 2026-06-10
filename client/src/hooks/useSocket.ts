import { useEffect, useRef } from "react";
import { getSocket, connectSocket, disconnectSocket } from "@/socket/socket";
import { registerSocketEvents } from "@/socket/events";
import { useGameStore } from "@/store/gameStore";
import type { JoinPayload } from "@shared/types";

// ---------------------------------------------------------------------------
// useSocketConnection
// Initialises the socket, registers all event handlers, and connects.
// Call once at the app root level.
// ---------------------------------------------------------------------------

export function useSocketConnection(): void {
  const registered = useRef(false);

  useEffect(() => {
    if (registered.current) return;
    registered.current = true;

    registerSocketEvents();
    useGameStore.getState().setConnectionStatus("connecting");
    connectSocket();

    return () => {
      disconnectSocket();
    };
  }, []);
}

// ---------------------------------------------------------------------------
// useJoin
// Returns a stable callback to emit player:join.
// ---------------------------------------------------------------------------

export function useJoin(): (payload: JoinPayload) => void {
  return (payload: JoinPayload) => {
    getSocket().emit("player:join", payload);
  };
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
  return (event, ...args) => {
    const socket = getSocket();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socket.emit as (...a: unknown[]) => void)(event, ...args);
  };
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