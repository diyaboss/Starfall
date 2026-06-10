import { getSocket } from "./socket";
import { useGameStore } from "@/store/gameStore";
import { v4 as uuidv4 } from "uuid";
import type {
  ServerToClientEvents,
} from "./socket";
import type { SightingEntry, Notification } from "@/types/game";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function addNotification(
  text: string,
  severity: Notification["severity"],
  ttlMs = 6000
): void {
  const n: Notification = {
    id: uuidv4(),
    text,
    severity,
    timestamp: Date.now(),
    ttlMs,
  };
  useGameStore.getState().addNotification(n);
}

// ---------------------------------------------------------------------------
// Register all server → client event handlers
// ---------------------------------------------------------------------------

export function registerSocketEvents(): void {
  const socket = getSocket();
  const store = useGameStore.getState;

  // ── state:snapshot ───────────────────────────────────────────────────────
  socket.on("game:stateSnapshot", (payload) => {
    store().applySnapshot(payload.gameState, payload.yourPlayerId);
  });

  // ── game:phaseChanged ────────────────────────────────────────────────────
  socket.on("game:phaseChanged", (payload) => {
    store().setPhase(payload.phase);
  });

  // ── game:ended ───────────────────────────────────────────────────────────
  socket.on("game:ended", (payload) => {
    store().setGameEnded(payload);
    store().openModal("game_over");
  });

  // ── player:joined ────────────────────────────────────────────────────────
  socket.on("player:joined", (payload) => {
    store().upsertPublicPlayer(payload.player);
    addNotification(`${payload.player.callsign} joined the game.`, "info", 4000);
  });

  // ── player:disconnected ──────────────────────────────────────────────────
  socket.on("player:disconnected", (payload) => {
    store().markPlayerDisconnected(payload.playerId);
  });

  // ── player:moved ─────────────────────────────────────────────────────────
  socket.on("player:moved", (payload) => {
    store().applyPlayerMoved(payload);
  });

  // ── player:died ──────────────────────────────────────────────────────────
  socket.on("player:died", (payload) => {
    store().applyPlayerDied(payload.playerId);
    const gs = store().gameState;
    if (gs) {
      const p = gs.players[payload.playerId];
      const name = p?.callsign ?? "A player";
      addNotification(`${name} has been eliminated.`, "warning", 5000);
    }
  });

  // ── player:revived ───────────────────────────────────────────────────────
  socket.on("player:revived", (payload) => {
    store().applyPlayerRevived(payload.playerId);
  });

  // ── player:updated ───────────────────────────────────────────────────────
  socket.on("player:updated", (payload) => {
    store().applyPlayerUpdated(payload);
  });

  // ── player:kicked ────────────────────────────────────────────────────────
  socket.on("player:kicked", (payload) => {
    addNotification(`You were kicked: ${payload.message}`, "error");
    store().reset();
  });

  // ── fleet:created ────────────────────────────────────────────────────────
  socket.on("fleet:created", (payload) => {
    store().upsertFleet(payload.fleet);
  });

  // ── fleet:updated ────────────────────────────────────────────────────────
  socket.on("fleet:updated", (payload) => {
    store().upsertFleet(payload.fleet);
  });

  // ── fleet:disbanded ──────────────────────────────────────────────────────
  socket.on("fleet:disbanded", (payload) => {
    store().removeFleet(payload.fleetId);
  });

  // ── mission:updated ──────────────────────────────────────────────────────
  socket.on("mission:updated", (payload) => {
    store().upsertMission(payload.mission);
  });

  // ── mission:expired ──────────────────────────────────────────────────────
  socket.on("mission:expired", (payload) => {
    store().removeMission(payload.missionId);
    addNotification("A mission has expired.", "warning", 4000);
  });

  // ── beacon:moved ─────────────────────────────────────────────────────────
  socket.on("beacon:moved", (payload) => {
    store().applyBeaconMoved(payload);
  });

  // ── beacon:phaseChanged ──────────────────────────────────────────────────
  socket.on("beacon:phaseChanged", (payload) => {
    store().applyBeaconPhaseChanged(payload);
    if (payload.phase === "convergence") {
      addNotification("🌟 Convergence sector revealed!", "warning", 10_000);
    }
  });

  // ── beacon:activated ─────────────────────────────────────────────────────
  socket.on("beacon:activated", (payload) => {
    addNotification(
      `🎉 Beacon activated by ${payload.fleetName}!`,
      "success",
      15_000
    );
  });

  // ── convoy:sighting ──────────────────────────────────────────────────────
  socket.on("convoy:sighting", (payload) => {
    const entry: SightingEntry = {
      id: uuidv4(),
      region: payload.region,
      sectorName: payload.sectorName,
      timestamp: payload.timestamp,
    };
    store().addSighting(entry);
    addNotification(
      `📡 Convoy sighting: ${payload.sectorName ?? payload.region}`,
      "info",
      7000
    );
  });

  // ── coord:exchangeRequested ──────────────────────────────────────────────
  socket.on("coord:exchangeRequested", (payload) => {
    store().setPendingExchange(payload);
    addNotification(
      `${payload.requesterCallsign} wants to exchange coordinates.`,
      "info",
      12_000
    );
  });

  // ── coord:exchangeCompleted ──────────────────────────────────────────────
  socket.on("coord:exchangeCompleted", (payload) => {
    addNotification(
      `Coord shard exchanged with ${payload.withPlayerName}.`,
      "success",
      5000
    );
    store().clearPendingExchange();
  });

  // ── chat:message ─────────────────────────────────────────────────────────
  socket.on("chat:message", (msg) => {
    store().appendChatMessage(msg);
  });

  // ── chat:system ──────────────────────────────────────────────────────────
  socket.on("chat:system", (payload) => {
    const msg = {
      id: uuidv4(),
      senderId: "system",
      senderName: "System",
      senderCallsign: "System",
      senderColor: "#95a5a6",
      channel: "system" as const,
      text: payload.text,
      timestamp: payload.timestamp,
    };
    store().appendChatMessage(msg);
    if (payload.isAdminBroadcast) {
      addNotification(`📢 ${payload.text}`, "warning", 10_000);
    }
  });

  // ── error:action ─────────────────────────────────────────────────────────
  socket.on("error:action", (payload) => {
    addNotification(`Error: ${payload.message}`, "error", 6000);
  });

  // ── connection lifecycle ─────────────────────────────────────────────────
  socket.on("connect", () => {
    store().setConnectionStatus("connected");
  });

  socket.on("disconnect", () => {
    store().setConnectionStatus("disconnected");
  });

  socket.on("connect_error", () => {
    store().setConnectionStatus("error");
  });
}

// ---------------------------------------------------------------------------
// Type alias to silence unused-import warning for ServerToClientEvents
// ---------------------------------------------------------------------------

export type { ServerToClientEvents };