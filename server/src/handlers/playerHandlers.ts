// =============================================================================
// STARFALL — Player Handlers
//
// Registers all socket event handlers related to player lifecycle, fleet
// management, and coordinate exchange.
//
// Handler registration pattern:
//   registerPlayerHandlers(io, socket) is called once per connection inside
//   the io.on("connection") callback in socket.ts.
//   io and socket are captured in closures — no module-level globals needed.
//
// Stable player IDs:
//   All game state is keyed on player.id (UUID), not socket.id.
//   socket.id is used only for socket room operations and the initial lookup.
//   On reconnect, the client supplies its stable playerId so state is restored.
//
// Error discipline:
//   Every handler emits "error:action" to the calling socket on failure.
//   Handlers never throw — all error paths are handled explicitly.
// =============================================================================

import type { Server, Socket } from "socket.io";
import type {
  JoinPayload,
  FleetCreatePayload,
  FleetJoinPayload,
  CoordExchangeRequestPayload,
  CoordExchangeResponsePayload,
  ChatSendPayload,
  PlayerJoinedPayload,
  PlayerDisconnectedPayload,
  FleetCreatedPayload,
  FleetUpdatedPayload,
  FleetDisbandedPayload,
  CoordExchangeRequestedPayload,
  CoordExchangeCompletedPayload,
  StateSnapshotPayload,
  SystemMessagePayload,
  ErrorPayload,
  ChatMessage,
  PublicPlayerInfo,
} from "@shared/types";
import {
  gameState,
  addPlayer,
  disconnectPlayer,
  reconnectPlayer,
  removePlayer,
  playerIdFromSocket,
  socketIdFromPlayer,
  buildClientSnapshot,
  createFleet,
  joinFleet,
  removePlayerFromFleet,
  appendChatMessage,
  getConnectedPlayerCount,
} from "../state/GameState";
import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max username length accepted from client. */
const MAX_USERNAME_LENGTH = 24;

/** Min username length. */
const MIN_USERNAME_LENGTH = 2;

/** Socket.IO room that every connected socket joins. */
const ROOM_GLOBAL = "global";

/** Socket.IO room for admin sockets only. */
const ROOM_ADMIN = "admin";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Emit an error:action event to a single socket.
 */
function emitError(socket: Socket, code: string, message: string): void {
  const payload: ErrorPayload = { code, message };
  socket.emit("error:action", payload);
}

/**
 * Broadcast a system message to all connected clients.
 */
function broadcastSystem(
  io: Server,
  text: string,
  isAdminBroadcast = false
): void {
  const payload: SystemMessagePayload = {
    text,
    timestamp: Date.now(),
    isAdminBroadcast,
  };
  io.to(ROOM_GLOBAL).emit("chat:system", payload);

  // Persist in global chat log
  const message: ChatMessage = {
    id: uuidv4(),
    senderId: "system",
    senderName: "System",
    senderCallsign: "System",
    senderColor: "#95a5a6",
    channel: "system",
    text,
    timestamp: Date.now(),
  };
  appendChatMessage(message);
}

/**
 * Sanitise and validate a username string.
 * Returns the cleaned string or null if invalid.
 */
function sanitiseUsername(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, MAX_USERNAME_LENGTH);
  if (trimmed.length < MIN_USERNAME_LENGTH) return null;
  // Allow alphanumeric, spaces, hyphens, underscores
  if (!/^[\w\s\-]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Build the socket room name for a sector.
 */
function sectorRoom(sectorId: string): string {
  return `sector:${sectorId}`;
}

/**
 * Build the socket room name for a fleet.
 */
function fleetRoom(fleetId: string): string {
  return `fleet:${fleetId}`;
}

/**
 * Emit a fresh state snapshot to one socket.
 */
function sendSnapshot(socket: Socket, playerId: string): void {
  const snapshot = buildClientSnapshot(playerId);
  if (!snapshot) return;

  const payload: StateSnapshotPayload = {
    gameState: snapshot,
    yourPlayerId: playerId,
  };
  socket.emit("game:stateSnapshot", payload);
}

/**
 * Convert a player's public info to the shape broadcast on join events.
 */
function toJoinedPayload(player: {
  id: string;
  username: string;
  callsign: string;
  color: string;
  sectorId: string;
  fleetId: string | null;
  isConnected: boolean;
  isDead: boolean;
  shard: { type: "X" | "Y" | "Z" | "sector_code" };
  navKeys: ("alpha" | "beta" | "gamma")[];
}): PlayerJoinedPayload {
  const info: PublicPlayerInfo = {
    id: player.id,
    username: player.username,
    callsign: player.callsign,
    color: player.color,
    sectorId: player.sectorId,
    fleetId: player.fleetId,
    isConnected: player.isConnected,
    isDead: player.isDead,
    shardType: player.shard.type,
    navKeys: [...player.navKeys],
  };
  return { player: info, sectorId: player.sectorId };
}

// ---------------------------------------------------------------------------
// Handler registration
// ---------------------------------------------------------------------------

/**
 * Register all player-related socket event handlers for one connection.
 *
 * Called once per socket connection from socket.ts.
 * io is the server instance; socket is the individual connection.
 */
export function registerPlayerHandlers(io: Server, socket: Socket): void {
  // ── player:join ──────────────────────────────────────────────────────────
  /**
   * A new player requests to join the game.
   *
   * Payload: { username: string, adminCode?: string }
   *
   * Flow:
   *   1. Validate username
   *   2. Reject if game is already ended
   *   3. Add player to game state (assigns UUID, shard, spawn sector)
   *   4. Join socket rooms (global, sector)
   *   5. Mark as admin if adminCode matches env var
   *   6. Send state snapshot to joining player
   *   7. Broadcast player:joined to all other clients
   *   8. Broadcast system message
   */
  socket.on("player:join", (payload: JoinPayload) => {
    const username = sanitiseUsername(payload?.username);
    if (!username) {
      emitError(socket, "invalid_username", "Username must be 2–24 alphanumeric characters.");
      return;
    }

    if (gameState.phase === "ended") {
      emitError(socket, "game_ended", "This game session has ended.");
      return;
    }

    // Reject duplicate socket join (socket already has a player)
    if (playerIdFromSocket(socket.id) !== undefined) {
      emitError(socket, "already_joined", "Already joined.");
      return;
    }

    // Check for duplicate username in lobby/active game
    const duplicate = Object.values(gameState.players).find(
      (p) => p.username.toLowerCase() === username.toLowerCase() && p.isConnected
    );
    if (duplicate) {
      emitError(socket, "username_taken", "That username is already in use.");
      return;
    }

    const player = addPlayer(socket.id, username);

    // Admin elevation
    const adminCode = process.env["ADMIN_CODE"];
    if (
      adminCode &&
      typeof payload?.adminCode === "string" &&
      payload.adminCode === adminCode
    ) {
      player.isAdmin = true;
      socket.join(ROOM_ADMIN);
    }

    // Join socket rooms
    socket.join(ROOM_GLOBAL);
    socket.join(sectorRoom(player.sectorId));

    // Send full snapshot to the new player
    sendSnapshot(socket, player.id);

    // Broadcast arrival to everyone else
    const joinedPayload: PlayerJoinedPayload = toJoinedPayload(player);
    socket.to(ROOM_GLOBAL).emit("player:joined", joinedPayload);

    // System message
    const count = getConnectedPlayerCount();
    broadcastSystem(
      io,
      `${player.callsign} (${player.username}) has entered the galaxy. [${count} connected]`
    );
  });

  // ── player:reconnect ─────────────────────────────────────────────────────
  /**
   * A previously connected player rejoins after a disconnect.
   *
   * Payload: { playerId: string }
   *
   * Flow:
   *   1. Validate playerId exists in game state
   *   2. Reconnect player (update socket index, set isConnected = true)
   *   3. Rejoin socket rooms
   *   4. Send fresh state snapshot
   *   5. Notify others
   */
  socket.on("player:reconnect", (payload: { playerId: string }) => {
    const { playerId } = payload ?? {};

    if (typeof playerId !== "string" || playerId.length === 0) {
      emitError(socket, "invalid_payload", "Missing playerId for reconnect.");
      return;
    }

    const player = reconnectPlayer(socket.id, playerId);
    if (!player) {
      emitError(socket, "player_not_found", "No player found with that ID.");
      return;
    }

    // Rejoin rooms
    socket.join(ROOM_GLOBAL);
    socket.join(sectorRoom(player.sectorId));

    if (player.isAdmin) {
      socket.join(ROOM_ADMIN);
    }

    if (player.fleetId) {
      socket.join(fleetRoom(player.fleetId));
    }

    sendSnapshot(socket, player.id);

    // Notify peers
    const updatePayload: PlayerJoinedPayload = toJoinedPayload(player);
    socket.to(ROOM_GLOBAL).emit("player:joined", updatePayload);

    broadcastSystem(io, `${player.callsign} has reconnected.`);
  });

  // ── disconnect (built-in Socket.IO event) ────────────────────────────────
  /**
   * Socket connection dropped (browser close, network loss, etc.)
   *
   * Flow:
   *   1. Look up player by socket.id
   *   2. Mark player as disconnected (keep state for reconnect)
   *   3. Broadcast player:disconnected to remaining clients
   *   4. System message
   */
  socket.on("disconnect", () => {
    const player = disconnectPlayer(socket.id);
    if (!player) return;

    const payload: PlayerDisconnectedPayload = { playerId: player.id };
    socket.to(ROOM_GLOBAL).emit("player:disconnected", payload);

    broadcastSystem(io, `${player.callsign} has lost signal.`);
  });

  // ── fleet:create ─────────────────────────────────────────────────────────
  /**
   * Player creates a new fleet and becomes its leader.
   *
   * Payload: { name: string }
   *
   * Flow:
   *   1. Resolve player from socket
   *   2. Validate fleet name
   *   3. Create fleet in game state
   *   4. Join fleet socket room
   *   5. Broadcast fleet:created to all
   *   6. System message
   */
  socket.on("fleet:create", (payload: FleetCreatePayload) => {
    const playerId = playerIdFromSocket(socket.id);
    if (!playerId) {
      emitError(socket, "not_joined", "Join the game before creating a fleet.");
      return;
    }

    const name = typeof payload?.name === "string"
      ? payload.name.trim().slice(0, 32)
      : "";

    if (name.length < 2) {
      emitError(socket, "invalid_fleet_name", "Fleet name must be at least 2 characters.");
      return;
    }

    const result = createFleet(playerId, name);
    if (!result.ok) {
      emitError(socket, result.code, result.message);
      return;
    }

    const { fleet } = result;

    // Join the fleet's socket room
    socket.join(fleetRoom(fleet.id));

    const fleetPayload: FleetCreatedPayload = {
      fleet: {
        id: fleet.id,
        name: fleet.name,
        leaderSocketId: fleet.leaderSocketId,
        memberIds: [...fleet.memberIds],
        sharedNavKeys: [...fleet.sharedNavKeys],
        fleetPower: fleet.fleetPower,
        hasBeaconCore: fleet.hasBeaconCore,
        coordsAssembled: Object.keys(fleet.assembledCoords).length,
      },
    };

    io.to(ROOM_GLOBAL).emit("fleet:created", fleetPayload);

    const player = gameState.players[playerId];
    if (player) {
      broadcastSystem(
        io,
        `Fleet "${fleet.name}" has been formed by ${player.callsign}.`
      );
    }
  });

  // ── fleet:join ───────────────────────────────────────────────────────────
  /**
   * Player requests to join an existing fleet.
   *
   * Payload: { fleetId: string }
   *
   * Flow:
   *   1. Resolve player
   *   2. Join fleet in game state
   *   3. Join fleet socket room
   *   4. Broadcast fleet:updated to all
   *   5. Send fleet chat history to joining player
   */
  socket.on("fleet:join", (payload: FleetJoinPayload) => {
    const playerId = playerIdFromSocket(socket.id);
    if (!playerId) {
      emitError(socket, "not_joined", "Join the game first.");
      return;
    }

    const fleetId = typeof payload?.fleetId === "string" ? payload.fleetId : "";
    if (!fleetId) {
      emitError(socket, "invalid_payload", "Missing fleetId.");
      return;
    }

    const result = joinFleet(playerId, fleetId);
    if (!result.ok) {
      emitError(socket, result.code, result.message);
      return;
    }

    const { fleet } = result;

    socket.join(fleetRoom(fleet.id));

    // Send fleet chat history to the new member
    socket.emit("fleet:chatHistory", {
      fleetId: fleet.id,
      messages: fleet.chatHistory,
    });

    const fleetPayload: FleetUpdatedPayload = {
      fleet: {
        id: fleet.id,
        name: fleet.name,
        leaderSocketId: fleet.leaderSocketId,
        memberIds: [...fleet.memberIds],
        sharedNavKeys: [...fleet.sharedNavKeys],
        fleetPower: fleet.fleetPower,
        hasBeaconCore: fleet.hasBeaconCore,
        coordsAssembled: Object.keys(fleet.assembledCoords).length,
      },
    };

    io.to(ROOM_GLOBAL).emit("fleet:updated", fleetPayload);

    const player = gameState.players[playerId];
    if (player) {
      broadcastSystem(io, `${player.callsign} has joined Fleet "${fleet.name}".`);
    }
  });

  // ── fleet:leave ──────────────────────────────────────────────────────────
  /**
   * Player voluntarily leaves their current fleet.
   *
   * Flow:
   *   1. Resolve player
   *   2. Validate they are in a fleet
   *   3. Remove from fleet in game state (auto-disbands if last member)
   *   4. Leave fleet socket room
   *   5. Broadcast fleet:updated or fleet:disbanded
   */
  socket.on("fleet:leave", () => {
    const playerId = playerIdFromSocket(socket.id);
    if (!playerId) {
      emitError(socket, "not_joined", "Not in game.");
      return;
    }

    const player = gameState.players[playerId];
    if (!player) {
      emitError(socket, "player_not_found", "Player not found.");
      return;
    }

    const fleetId = player.fleetId;
    if (!fleetId) {
      emitError(socket, "not_in_fleet", "You are not in a fleet.");
      return;
    }

    const fleetNameBefore = gameState.fleets[fleetId]?.name ?? "Unknown";

    removePlayerFromFleet(playerId, fleetId);

    socket.leave(fleetRoom(fleetId));

    const fleetStillExists = gameState.fleets[fleetId] !== undefined;

    if (fleetStillExists) {
      const updatedFleet = gameState.fleets[fleetId];
      if (updatedFleet) {
        const updatePayload: FleetUpdatedPayload = {
          fleet: {
            id: updatedFleet.id,
            name: updatedFleet.name,
            leaderSocketId: updatedFleet.leaderSocketId,
            memberIds: [...updatedFleet.memberIds],
            sharedNavKeys: [...updatedFleet.sharedNavKeys],
            fleetPower: updatedFleet.fleetPower,
            hasBeaconCore: updatedFleet.hasBeaconCore,
            coordsAssembled: Object.keys(updatedFleet.assembledCoords).length,
          },
        };
        io.to(ROOM_GLOBAL).emit("fleet:updated", updatePayload);
      }
    } else {
      const disbandPayload: FleetDisbandedPayload = { fleetId };
      io.to(ROOM_GLOBAL).emit("fleet:disbanded", disbandPayload);
    }

    broadcastSystem(
      io,
      `${player.callsign} has left Fleet "${fleetNameBefore}".`
    );
  });

  // ── coord:exchangeRequest ────────────────────────────────────────────────
  /**
   * Player A requests a coordinate exchange with Player B.
   * Both players must be in the same sector.
   *
   * Payload: { targetPlayerId: string }
   *
   * Flow:
   *   1. Validate both players exist and are in the same sector
   *   2. Forward the request to Player B's socket
   *   Player B must respond with coord:exchangeResponse
   */
  socket.on("coord:exchangeRequest", (payload: CoordExchangeRequestPayload) => {
    const requesterId = playerIdFromSocket(socket.id);
    if (!requesterId) {
      emitError(socket, "not_joined", "Not in game.");
      return;
    }

    const requester = gameState.players[requesterId];
    if (!requester) {
      emitError(socket, "player_not_found", "Requester not found.");
      return;
    }

    const targetId = typeof payload?.targetPlayerId === "string"
      ? payload.targetPlayerId
      : "";

    if (!targetId || targetId === requesterId) {
      emitError(socket, "invalid_target", "Invalid target player.");
      return;
    }

    const target = gameState.players[targetId];
    if (!target) {
      emitError(socket, "player_not_found", "Target player not found.");
      return;
    }

    if (!target.isConnected) {
      emitError(socket, "player_offline", "That player is not connected.");
      return;
    }

    if (target.sectorId !== requester.sectorId) {
      emitError(
        socket,
        "different_sector",
        "You must be in the same sector to exchange coordinates."
      );
      return;
    }

    // Forward to target's socket
    const targetSocketId = socketIdFromPlayer(targetId);
    if (!targetSocketId) {
      emitError(socket, "player_offline", "Target player socket not found.");
      return;
    }

    const requestPayload: CoordExchangeRequestedPayload = {
      requesterId: requester.id,
      requesterName: requester.username,
      requesterCallsign: requester.callsign,
    };

    io.to(targetSocketId).emit("coord:exchangeRequested", requestPayload);
  });

  // ── coord:exchangeResponse ───────────────────────────────────────────────
  /**
   * Player B responds to a coordinate exchange request.
   *
   * Payload: { requesterId: string, accepted: boolean }
   *
   * Flow:
   *   1. Validate both players exist and are still in the same sector
   *   2. If accepted:
   *      a. Add each player to the other's shard.sharedWith list
   *      b. Emit coord:exchangeCompleted to both players with masked values
   *   3. If rejected:
   *      a. Notify the requester
   */
  socket.on("coord:exchangeResponse", (payload: CoordExchangeResponsePayload) => {
    const responderId = playerIdFromSocket(socket.id);
    if (!responderId) {
      emitError(socket, "not_joined", "Not in game.");
      return;
    }

    const responder = gameState.players[responderId];
    if (!responder) {
      emitError(socket, "player_not_found", "Responder not found.");
      return;
    }

    const requesterId = typeof payload?.requesterId === "string"
      ? payload.requesterId
      : "";

    if (!requesterId) {
      emitError(socket, "invalid_payload", "Missing requesterId.");
      return;
    }

    const requester = gameState.players[requesterId];
    if (!requester) {
      emitError(socket, "player_not_found", "Requester no longer in game.");
      return;
    }

    const requesterSocketId = socketIdFromPlayer(requesterId);
    if (!requesterSocketId) {
      emitError(socket, "player_offline", "Requester is no longer connected.");
      return;
    }

    if (!payload.accepted) {
      // Notify requester of rejection
      io.to(requesterSocketId).emit("coord:exchangeRejected", {
        targetPlayerId: responderId,
        targetCallsign: responder.callsign,
      });
      return;
    }

    // Verify still in same sector (could have moved during request)
    if (requester.sectorId !== responder.sectorId) {
      emitError(
        socket,
        "different_sector",
        "Players are no longer in the same sector."
      );
      io.to(requesterSocketId).emit("error:action", {
        code: "different_sector",
        message: "The other player has moved away.",
      } satisfies ErrorPayload);
      return;
    }

    // Record exchange — add to sharedWith lists (idempotent)
    if (!requester.shard.sharedWith.includes(responderId)) {
      requester.shard.sharedWith.push(responderId);
    }
    if (!responder.shard.sharedWith.includes(requesterId)) {
      responder.shard.sharedWith.push(requesterId);
    }

    // Notify requester: they receive responder's masked shard
    const toRequester: CoordExchangeCompletedPayload = {
      withPlayerId: responderId,
      withPlayerName: responder.username,
      shardType: responder.shard.type,
      maskedValue: responder.shard.maskedValue,
    };
    io.to(requesterSocketId).emit("coord:exchangeCompleted", toRequester);

    // Notify responder: they receive requester's masked shard
    const toResponder: CoordExchangeCompletedPayload = {
      withPlayerId: requesterId,
      withPlayerName: requester.username,
      shardType: requester.shard.type,
      maskedValue: requester.shard.maskedValue,
    };
    socket.emit("coord:exchangeCompleted", toResponder);
  });

  // ── chat:send ────────────────────────────────────────────────────────────
  /**
   * Player sends a chat message on global, local, or fleet channel.
   *
   * Payload: { channel: ChatChannel, text: string, fleetId?: string }
   *
   * Routing:
   *   global → io.to("global")
   *   local  → io.to("sector:{sectorId}")
   *   fleet  → io.to("fleet:{fleetId}")
   */
  socket.on("chat:send", (payload: ChatSendPayload) => {
    const playerId = playerIdFromSocket(socket.id);
    if (!playerId) {
      emitError(socket, "not_joined", "Not in game.");
      return;
    }

    const player = gameState.players[playerId];
    if (!player) {
      emitError(socket, "player_not_found", "Player not found.");
      return;
    }

    const rawText = typeof payload?.text === "string" ? payload.text.trim() : "";
    if (rawText.length === 0 || rawText.length > 280) {
      emitError(socket, "invalid_message", "Message must be 1–280 characters.");
      return;
    }

    const channel = payload?.channel;
    if (
      channel !== "global" &&
      channel !== "local" &&
      channel !== "fleet"
    ) {
      emitError(socket, "invalid_channel", "Invalid chat channel.");
      return;
    }

    const message: ChatMessage = {
      id: uuidv4(),
      senderId: player.id,
      senderName: player.username,
      senderCallsign: player.callsign,
      senderColor: player.color,
      channel,
      text: rawText,
      timestamp: Date.now(),
      sectorId: channel === "local" ? player.sectorId : undefined,
      fleetId: channel === "fleet" ? (player.fleetId ?? undefined) : undefined,
    };

    appendChatMessage(message);

    if (channel === "global") {
      io.to(ROOM_GLOBAL).emit("chat:message", message);
    } else if (channel === "local") {
      io.to(sectorRoom(player.sectorId)).emit("chat:message", message);
    } else if (channel === "fleet") {
      if (!player.fleetId) {
        emitError(socket, "not_in_fleet", "You are not in a fleet.");
        return;
      }
      io.to(fleetRoom(player.fleetId)).emit("chat:message", message);
    }
  });
}
