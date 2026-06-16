// =============================================================================
// STARFALL — Socket.IO Server
//
// Responsibilities:
//   - Create and configure the Socket.IO server instance
//   - Attach CORS policy from CLIENT_URL environment variable
//   - Register playerHandlers and movementHandlers per connection
//   - Handle game:start and game:end admin events (phase transitions + loop)
//   - Handle admin:kick
//   - Export the io instance so other modules (handlers, loop) can import it
//     without circular dependency — they never need to create their own server.
//
// Game phase transitions driven here:
//   lobby    → tutorial  (game:start, then auto-advances after tutorialDurationMs)
//   tutorial → active    (auto after tutorialDurationMs; starts game loop)
//   active   → ended     (beacon activated, time expired, or admin:endGame)
//   ended    → lobby     (admin:resetGame, re-runs resetGameState)
//
// Admin event guards:
//   All admin events require socket.data.isAdmin === true, which is set by
//   playerHandlers when the ADMIN_CODE matches on join.
// =============================================================================

import { Server as HTTPServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import type { Socket } from "socket.io";
import type {
  AdminKickPayload,
  AdminBroadcastPayload,
  AdminAdjustPlayerPayload,
  AdminTriggerSightingPayload,
  AdminRevealConvergencePayload,
  GameEndedPayload,
  SystemMessagePayload,
  BeaconPhaseChangedPayload,
  ChatMessage,
  KickedPayload,
} from "@shared/types";
import {
  gameState,
  setGamePhase,
  setWinner,
  resetGameState,
  socketIdFromPlayer,
  appendChatMessage,
} from "./state/GameState";
import { registerPlayerHandlers } from "./handlers/playerHandlers";
import { registerMovementHandlers } from "./handlers/movementHandlers";
import {
  startGameLoop,
  stopGameLoop,
} from "./loops/gameLoop";
import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Module-level io singleton
// ---------------------------------------------------------------------------

let io: SocketIOServer | null = null;

// ---------------------------------------------------------------------------
// Tutorial timer handle
// ---------------------------------------------------------------------------

let tutorialTimer: ReturnType<typeof setTimeout> | null = null;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROOM_GLOBAL = "global";
const ROOM_ADMIN = "admin";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function broadcastSystem(
  text: string,
  isAdminBroadcast = false
): void {
  if (!io) return;

  const payload: SystemMessagePayload = {
    text,
    timestamp: Date.now(),
    isAdminBroadcast,
  };
  io.to(ROOM_GLOBAL).emit("chat:system", payload);

  const msg: ChatMessage = {
    id: uuidv4(),
    senderId: "system",
    senderName: "System",
    senderCallsign: "System",
    senderColor: "#95a5a6",
    channel: "system",
    text,
    timestamp: Date.now(),
  };
  appendChatMessage(msg);
}

function requireAdmin(socket: Socket): boolean {
  if (!socket.data.isAdmin) {
    socket.emit("error:action", {
      code: "NOT_ADMIN",
      message: "This action requires admin privileges.",
    });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Phase transition helpers
// ---------------------------------------------------------------------------

/**
 * Transition from lobby → tutorial → active.
 * Called by the admin game:start handler.
 */
function startGame(): void {
  if (!io) return;
  if (gameState.phase !== "lobby") {
    console.warn("[socket] startGame called outside lobby phase — ignored.");
    return;
  }

  const tutorialDurationMs = 5000;
  
  console.log("[startGame] tutorialDurationMs =", tutorialDurationMs);

  setGamePhase("tutorial");
  broadcastSystem("📖 Tutorial phase has begun. The game starts shortly…");
  io.to(ROOM_GLOBAL).emit("game:phaseChanged", { phase: "tutorial" });

  // Clear any stale tutorial timer
  if (tutorialTimer !== null) {
    clearTimeout(tutorialTimer);
    tutorialTimer = null;
  }

  tutorialTimer = setTimeout(() => {
    tutorialTimer = null;
    if (gameState.phase !== "tutorial") return; // guard against mid-flow reset

    setGamePhase("active");
    broadcastSystem("🚀 Starfall has begun! Find other players and share your coordinate shards.");
    io?.to(ROOM_GLOBAL).emit("game:phaseChanged", { phase: "active" });
    startGameLoop(io!); // loop now has a non-null io guaranteed
  }, tutorialDurationMs);
}

/**
 * End the game immediately (admin or beacon activation).
 * Accepts the reason and optional winner info.
 */
function endGame(
  reason: GameEndedPayload["reason"],
  winnerPlayerId: string | null = null,
  winnerFleetId: string | null = null
): void {
  if (!io) return;
  if (gameState.phase === "ended") return;

  stopGameLoop();

  if (tutorialTimer !== null) {
    clearTimeout(tutorialTimer);
    tutorialTimer = null;
  }

  setGamePhase("ended");
  if (winnerPlayerId && winnerFleetId) {
    setWinner(winnerPlayerId, winnerFleetId);
  }

  const winningFleet =
    winnerFleetId ? gameState.fleets[winnerFleetId] : null;

  const finalFleetPower: Record<string, number> = {};
  for (const [fid, fleet] of Object.entries(gameState.fleets)) {
    finalFleetPower[fid] = fleet.fleetPower;
  }

  const payload: GameEndedPayload = {
    winner: gameState.winner,
    winnerFleetId: gameState.winnerFleetId,
    winnerFleetName: winningFleet?.name ?? null,
    reason,
    finalFleetPower,
  };
  io.to(ROOM_GLOBAL).emit("game:ended", payload);

  const reasonText: Record<GameEndedPayload["reason"], string> = {
    beacon_activated: "🎉 The Convergence Beacon has been activated! Game over.",
    time_expired: "⏱ Time expired. The Beacon Core was never activated.",
    admin_ended: "🛑 Game ended by administrator.",
  };
  broadcastSystem(reasonText[reason], reason === "admin_ended");
}

// ---------------------------------------------------------------------------
// Admin event handlers (registered once per socket)
// ---------------------------------------------------------------------------

function registerAdminHandlers(socket: Socket): void {

  // ── game:start ───────────────────────────────────────────────────────────
  socket.on("game:start", () => {
    console.log("[admin] game:start received", {
      socketId: socket.id,
      isAdmin: socket.data.isAdmin,
    });
  
    if (!requireAdmin(socket)) return;
    startGame();
  });

  // ── admin:endGame ────────────────────────────────────────────────────────
  socket.on("admin:endGame", () => {
    if (!requireAdmin(socket)) return;
    endGame("admin_ended");
  });

  // ── admin:resetGame ──────────────────────────────────────────────────────
  socket.on("admin:resetGame", () => {
    if (!requireAdmin(socket)) return;
    if (gameState.phase === "active") {
      stopGameLoop();
    }
    if (tutorialTimer !== null) {
      clearTimeout(tutorialTimer);
      tutorialTimer = null;
    }
    resetGameState();
    broadcastSystem("🔄 Game has been reset to lobby.", true);
    io?.to(ROOM_GLOBAL).emit("game:phaseChanged", { phase: "lobby" });
  });

  // ── admin:kick ───────────────────────────────────────────────────────────
  socket.on("admin:kick", (raw: unknown) => {
    if (!requireAdmin(socket)) return;
    if (!isAdminKickPayload(raw)) {
      socket.emit("error:action", { code: "INVALID_PAYLOAD", message: "Invalid kick payload." });
      return;
    }
    const payload = raw;
    const targetSocketId = socketIdFromPlayer(payload.playerId);
    if (!targetSocketId) {
      socket.emit("error:action", { code: "PLAYER_NOT_FOUND", message: "Player not connected." });
      return;
    }
    const kicked: KickedPayload = { message: payload.message };
    io?.to(targetSocketId).emit("player:kicked", kicked);
    io?.sockets.sockets.get(targetSocketId)?.disconnect(true);
  });

  // ── admin:broadcast ──────────────────────────────────────────────────────
  socket.on("admin:broadcast", (raw: unknown) => {
    if (!requireAdmin(socket)) return;
    if (!isAdminBroadcastPayload(raw)) {
      socket.emit("error:action", { code: "INVALID_PAYLOAD", message: "Invalid broadcast payload." });
      return;
    }
    broadcastSystem(raw.text, true);
  });

  // ── admin:adjustPlayer ───────────────────────────────────────────────────
  socket.on("admin:adjustPlayer", (raw: unknown) => {
    if (!requireAdmin(socket)) return;
    if (!isAdminAdjustPlayerPayload(raw)) {
      socket.emit("error:action", { code: "INVALID_PAYLOAD", message: "Invalid adjust payload." });
      return;
    }
    const player = gameState.players[raw.playerId];
    if (!player) {
      socket.emit("error:action", { code: "PLAYER_NOT_FOUND", message: "Player not found." });
      return;
    }
    if (raw.fuel !== undefined) player.fuel = Math.min(100, Math.max(0, raw.fuel));
    if (raw.health !== undefined) player.health = Math.min(100, Math.max(0, raw.health));
    if (raw.energy !== undefined) player.energy = Math.min(100, Math.max(0, raw.energy));

    io?.to(ROOM_GLOBAL).emit("player:updated", {
      playerId: player.id,
      fuel: player.fuel,
      health: player.health,
      energy: player.energy,
    });
  });

  // ── admin:triggerSighting ────────────────────────────────────────────────
  socket.on("admin:triggerSighting", (raw: unknown) => {
    if (!requireAdmin(socket)) return;
    if (!isAdminTriggerSightingPayload(raw)) {
      socket.emit("error:action", { code: "INVALID_PAYLOAD", message: "Invalid sighting payload." });
      return;
    }
    const sector = gameState.sectors[raw.sectorId];
    if (!sector) {
      socket.emit("error:action", { code: "SECTOR_NOT_FOUND", message: "Sector not found." });
      return;
    }
    broadcastSystem(`📡 Admin sighting: Beacon Core convoy detected in ${sector.region}.`, true);
    io?.to(ROOM_GLOBAL).emit("convoy:sighting", {
      region: sector.region,
      sectorName: sector.name,
      timestamp: Date.now(),
    });
  });

  // ── admin:revealConvergence ──────────────────────────────────────────────
  socket.on("admin:revealConvergence", (raw: unknown) => {
    if (!requireAdmin(socket)) return;
    if (gameState.beacon.phase === "convergence" || gameState.beacon.phase === "activated") {
      socket.emit("error:action", { code: "ALREADY_REVEALED", message: "Convergence already revealed." });
      return;
    }

    const override = isAdminRevealConvergencePayload(raw) ? raw.sectorId : undefined;
    if (override) {
      // Allow admin to override the convergence sector
      gameState.beacon.convergenceSectorId = override;
    }

    gameState.beacon.phase = "convergence";
    gameState.beacon.revealedAt = Date.now();

    const payload: BeaconPhaseChangedPayload = {
      phase: "convergence",
      convergenceSectorId: gameState.beacon.convergenceSectorId,
    };
    io?.to(ROOM_GLOBAL).emit("beacon:phaseChanged", payload);
    broadcastSystem("🌟 Admin revealed convergence sector early.", true);
  });
}

// ---------------------------------------------------------------------------
// Payload type guards
// ---------------------------------------------------------------------------

function isAdminKickPayload(v: unknown): v is AdminKickPayload {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>)["playerId"] === "string" &&
    typeof (v as Record<string, unknown>)["message"] === "string"
  );
}

function isAdminBroadcastPayload(v: unknown): v is AdminBroadcastPayload {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>)["text"] === "string"
  );
}

function isAdminAdjustPlayerPayload(v: unknown): v is AdminAdjustPlayerPayload {
  const obj = v as Record<string, unknown>;
  return (
    typeof v === "object" &&
    v !== null &&
    typeof obj["playerId"] === "string"
  );
}

function isAdminTriggerSightingPayload(v: unknown): v is AdminTriggerSightingPayload {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>)["sectorId"] === "string"
  );
}

function isAdminRevealConvergencePayload(v: unknown): v is AdminRevealConvergencePayload {
  return typeof v === "object" && v !== null;
}

// ---------------------------------------------------------------------------
// Public: initialise Socket.IO
// ---------------------------------------------------------------------------

/**
 * Attach Socket.IO to the provided HTTP server.
 * Must be called exactly once, from index.ts.
 * Returns the io instance (also available via getIO()).
 */
export function initSocketIO(httpServer: HTTPServer): SocketIOServer {
  const clientUrl = process.env["CLIENT_URL"] ?? "http://localhost:5173";

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: clientUrl,
      methods: ["GET", "POST"],
      credentials: true,
    },
    // Ping timeout / interval tuned for a 35-45 min session
    pingTimeout: 20_000,
    pingInterval: 15_000,
  });

  io.on("connection", (socket: Socket) => {
    console.log(
      "[socket] Connection: %s  (total: %d)",
      socket.id,
      io?.engine.clientsCount ?? 0
    );

    // Delegate domain handlers
    registerPlayerHandlers(io!, socket);
    registerMovementHandlers(io!, socket);
    registerAdminHandlers(socket);

    socket.on("disconnect", (reason) => {
      console.log("[socket] Disconnect: %s  reason=%s", socket.id, reason);
    });
  });

  return io;
}

/**
 * Retrieve the shared io instance.
 * Throws if called before initSocketIO().
 */
export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error(
      "[socket] getIO() called before initSocketIO() — wire the server first."
    );
  }
  return io;
}

/**
 * Expose endGame so playerHandlers can trigger it on beacon activation.
 */
export { endGame };
