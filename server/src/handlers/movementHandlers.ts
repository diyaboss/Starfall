// =============================================================================
// STARFALL — Movement Handlers
//
// Handles all player movement through the galaxy map.
//
// Movement rules:
//   1. Game must be in "active" phase
//   2. Player must be alive (health > 0)
//   3. Target sector must be directly connected to current sector
//   4. Player must have enough fuel to pay the sector's fuelCost
//   5. Movement updates the player's socket rooms (sector:old → sector:new)
//   6. Newly entered sectors are marked as discovered for the player
//   7. Discovery propagates to the player's fleet's combinedExploredSectors
//
// All validation is performed in GameState.movePlayer() which returns a
// discriminated MoveResult. Handlers translate results into socket events.
//
// Discovery propagation detail:
//   When a player enters a sector for the first time:
//     - sector.discoveredBy gains the player's stable ID
//     - player.exploredSectors gains the sector ID
//     - if the player is in a fleet:
//         fleet.combinedExploredSectors gains the sector ID
//         all fleet members get a map:sectorDiscovered event so their
//         client can render the newly visible sector without a full re-sync
// =============================================================================

import type { Server, Socket } from "socket.io";
import type {
  MovePayload,
  CollectNavKeyPayload,
  PlayerMovedPayload,
  PlayerUpdatedPayload,
  ErrorPayload,
  SystemMessagePayload,
  ChatMessage,
} from "@shared/types";
import {
  gameState,
  playerIdFromSocket,
  movePlayer,
  appendChatMessage,
} from "../state/GameState";
import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function emitError(socket: Socket, code: string, message: string): void {
  const payload: ErrorPayload = { code, message };
  socket.emit("error:action", payload);
}

function sectorRoom(sectorId: string): string {
  return `sector:${sectorId}`;
}

function fleetRoom(fleetId: string): string {
  return `fleet:${fleetId}`;
}

/**
 * Notify all fleet members that a new sector has been discovered and is now
 * part of the fleet's shared map. Sends a lightweight event rather than a
 * full snapshot so clients can incrementally reveal the sector node.
 *
 * Only called when the sector was not already in combinedExploredSectors
 * before this move — prevents redundant events.
 */
function notifyFleetDiscovery(
  io: Server,
  fleetId: string,
  discoveredBySectorId: string,
  discoveredByPlayerId: string
): void {
  const fleet = gameState.fleets[fleetId];
  const sector = gameState.sectors[discoveredBySectorId];
  if (!fleet || !sector) return;

  io.to(fleetRoom(fleetId)).emit("map:sectorDiscovered", {
    sectorId: discoveredBySectorId,
    discoveredByPlayerId,
    sector: {
      id: sector.id,
      name: sector.name,
      region: sector.region,
      x: sector.x,
      y: sector.y,
      connectedTo: sector.connectedTo,
      fuelCost: sector.fuelCost,
      faction: sector.faction,
      factionServiceId: sector.factionServiceId,
      missionIds: sector.missionIds,
      navKeyPresent: sector.navKeyPresent,
      npcConvoyIds: sector.npcConvoyIds,
      discoveredBy: sector.discoveredBy,
    },
  });
}

/**
 * Emit a system message to the sector room when notable events occur.
 * e.g. a player entering a sector that has an NPC or nav key.
 */
function sectorSystemMessage(
  io: Server,
  sectorId: string,
  text: string
): void {
  const payload: SystemMessagePayload = {
    text,
    timestamp: Date.now(),
    isAdminBroadcast: false,
  };
  io.to(sectorRoom(sectorId)).emit("chat:system", payload);

  const message: ChatMessage = {
    id: uuidv4(),
    senderId: "system",
    senderName: "System",
    senderCallsign: "System",
    senderColor: "#95a5a6",
    channel: "local",
    text,
    timestamp: Date.now(),
    sectorId,
  };
  appendChatMessage(message);
}

// ---------------------------------------------------------------------------
// Handler registration
// ---------------------------------------------------------------------------

/**
 * Register all movement-related socket event handlers for one connection.
 * Called once per socket connection from socket.ts.
 */
export function registerMovementHandlers(io: Server, socket: Socket): void {

  // ── player:move ──────────────────────────────────────────────────────────
  /**
   * Player attempts to move to an adjacent sector.
   *
   * Payload: { targetSectorId: string }
   *
   * Validation (in order):
   *   1. Socket has a registered player ID
   *   2. targetSectorId is a non-empty string
   *   3. Game phase is "active"               (enforced in GameState)
   *   4. Player is alive                       (enforced in GameState)
   *   5. Target sector exists                  (enforced in GameState)
   *   6. Target is connected to current sector (enforced in GameState)
   *   7. Player has sufficient fuel            (enforced in GameState)
   *
   * On success:
   *   1. Player leaves old sector socket room
   *   2. Player joins new sector socket room
   *   3. player:moved broadcast to ROOM_GLOBAL (everyone sees markers move)
   *   4. player:updated sent to moving player (updated fuel)
   *   5. If sector newly discovered by this player:
   *      a. Fleet gets map:sectorDiscovered event
   *   6. If sector has a nav key:
   *      a. System message sent to new sector room
   *   7. If other players are in the new sector:
   *      a. System message noting the arrival (local chat)
   */
  socket.on("player:move", (payload: MovePayload) => {
    const playerId = playerIdFromSocket(socket.id);
    if (!playerId) {
      emitError(socket, "not_joined", "Join the game before moving.");
      return;
    }

    const targetSectorId =
      typeof payload?.targetSectorId === "string"
        ? payload.targetSectorId.trim()
        : "";

    if (!targetSectorId) {
      emitError(socket, "invalid_payload", "Missing targetSectorId.");
      return;
    }

    // Record whether this sector was already known to the player before moving
    const player = gameState.players[playerId];
    if (!player) {
      emitError(socket, "player_not_found", "Player not found.");
      return;
    }

    const wasAlreadyDiscovered = player.exploredSectors.includes(targetSectorId);
    const wasAlreadyFleetDiscovered =
      player.fleetId !== null &&
      (gameState.fleets[player.fleetId]?.combinedExploredSectors.includes(
        targetSectorId
      ) ?? false);

    const fromSectorId = player.sectorId;

    // ── Core move validation + state mutation ─────────────────────────────
    const result = movePlayer(playerId, targetSectorId);

    if (!result.ok) {
      emitError(socket, result.code, result.message);
      return;
    }

    // ── Socket room update ────────────────────────────────────────────────
    socket.leave(sectorRoom(fromSectorId));
    socket.join(sectorRoom(result.toSectorId));

    // ── Broadcast movement to all players ────────────────────────────────
    const movedPayload: PlayerMovedPayload = {
      playerId,
      fromSectorId: result.fromSectorId,
      toSectorId: result.toSectorId,
      fuelRemaining: result.fuelRemaining,
    };
    io.to("global").emit("player:moved", movedPayload);

    // ── Update moving player's own stats display ──────────────────────────
    const updatedPayload: PlayerUpdatedPayload = {
      playerId,
      fuel: result.fuelRemaining,
    };
    socket.emit("player:updated", updatedPayload);
    // Send discovered sector to the moving player so solo players can promote
// preview sector -> visible sector after movement.
if (!wasAlreadyDiscovered) {
  const discoveredSector = gameState.sectors[result.toSectorId];

  if (discoveredSector) {
    socket.emit("map:sectorDiscovered", {
      sectorId: result.toSectorId,
      discoveredByPlayerId: playerId,
      sector: {
        id: discoveredSector.id,
        name: discoveredSector.name,
        region: discoveredSector.region,
        x: discoveredSector.x,
        y: discoveredSector.y,
        connectedTo: discoveredSector.connectedTo,
        fuelCost: discoveredSector.fuelCost,
        faction: discoveredSector.faction,
        factionServiceId: discoveredSector.factionServiceId,
        missionIds: discoveredSector.missionIds,
        navKeyPresent: discoveredSector.navKeyPresent,
        npcConvoyIds: discoveredSector.npcConvoyIds,
        discoveredBy: discoveredSector.discoveredBy,
      },
    });
  }
}

    // ── Discovery propagation ─────────────────────────────────────────────
    // Only fire the fleet discovery event if:
    //   a) The player is in a fleet
    //   b) The sector was NOT already in the fleet's combined map
    if (
      player.fleetId &&
      !wasAlreadyFleetDiscovered &&
      !wasAlreadyDiscovered
    ) {
      notifyFleetDiscovery(io, player.fleetId, result.toSectorId, playerId);
    }

    // ── Arrival context: nav key present ─────────────────────────────────
    const arrivedSector = gameState.sectors[result.toSectorId];
    if (arrivedSector?.navKeyPresent) {
      sectorSystemMessage(
        io,
        result.toSectorId,
        `A Navigation Key (${arrivedSector.navKeyPresent.toUpperCase()}) signal is detected in this sector.`
      );
    }

    // ── Arrival context: faction NPC present ─────────────────────────────
    if (arrivedSector?.factionServiceId) {
      const service =
        gameState.npcServices[arrivedSector.factionServiceId];
      if (service) {
        const factionLabel = factionDisplayName(service.factionId);
        sectorSystemMessage(
          io,
          result.toSectorId,
          `${factionLabel} station detected. Open faction panel to access services.`
        );
      }
    }

    // ── Arrival context: other players present ───────────────────────────
    const playersInSector = Object.values(gameState.players).filter(
      (p) =>
        p.sectorId === result.toSectorId &&
        p.id !== playerId &&
        p.isConnected &&
        !p.isDead
    );

    if (playersInSector.length > 0) {
      const names = playersInSector
        .slice(0, 3)
        .map((p) => p.callsign)
        .join(", ");
      const extra =
        playersInSector.length > 3
          ? ` and ${playersInSector.length - 3} others`
          : "";

      sectorSystemMessage(
        io,
        result.toSectorId,
        `${player.callsign} arrives. Also present: ${names}${extra}.`
      );
    }

    // ── Low fuel warning ─────────────────────────────────────────────────
    if (result.fuelRemaining <= 15) {
      const warningPayload: SystemMessagePayload = {
        text: `WARNING: Fuel critical (${Math.floor(result.fuelRemaining)}). Find a faction station or wait for passive regen.`,
        timestamp: Date.now(),
        isAdminBroadcast: false,
      };
      socket.emit("chat:system", warningPayload);
    }
  });

  // ── nav:collectKey ───────────────────────────────────────────────────────
  /**
   * Player attempts to collect the Navigation Key in their current sector.
   *
   * Payload: { sectorId: string }
   *
   * Validation:
   *   1. Player exists and is alive
   *   2. Player is in the specified sector
   *   3. Sector has a navKeyPresent value
   *   4. Player does not already hold this nav key type
   *
   * On success:
   *   - navKeyPresent removed from sector (atomic — first player wins)
   *   - Nav key added to player's navKeys array
   *   - player:updated emitted to all (so map can remove the key indicator)
   *   - System message broadcast to sector
   *
   * Atomicity:
   *   Because this runs on a single-threaded Node.js event loop, the
   *   read-check-write sequence for navKeyPresent is atomic — no two
   *   handlers can interleave between the null-check and the assignment.
   */
  socket.on("nav:collectKey", (payload: CollectNavKeyPayload) => {
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

    if (player.isDead) {
      emitError(socket, "player_dead", "Dead players cannot collect keys.");
      return;
    }

    const sectorId =
      typeof payload?.sectorId === "string" ? payload.sectorId : "";

    if (!sectorId || sectorId !== player.sectorId) {
      emitError(
        socket,
        "wrong_sector",
        "You must be in the sector to collect its key."
      );
      return;
    }

    const sector = gameState.sectors[sectorId];
    if (!sector) {
      emitError(socket, "invalid_sector", "Sector not found.");
      return;
    }

    if (!sector.navKeyPresent) {
      emitError(socket, "no_key_present", "No Navigation Key in this sector.");
      return;
    }

    const key = sector.navKeyPresent;

    if (player.navKeys.includes(key)) {
      emitError(
        socket,
        "already_have_key",
        `You already hold the ${key.toUpperCase()} key.`
      );
      return;
    }

    // ── Atomic collect ────────────────────────────────────────────────────
    sector.navKeyPresent = null;
    player.navKeys.push(key);

    // ── Notify all clients ────────────────────────────────────────────────

    // Everyone sees the key disappear from the map
    const sectorUpdatePayload = {
      sectorId,
      navKeyPresent: null as null,
    };
    io.to("global").emit("map:sectorKeyCollected", sectorUpdatePayload);

    // Everyone sees the player now holds the key
    const playerUpdate: PlayerUpdatedPayload = {
      playerId,
      navKeys: [...player.navKeys],
    };
    io.to("global").emit("player:updated", playerUpdate);

    // Local sector chat
    sectorSystemMessage(
      io,
      sectorId,
      `${player.callsign} has secured the ${key.toUpperCase()} Navigation Key.`
    );

    // Global broadcast — nav keys are major events
    const globalAnnounce: SystemMessagePayload = {
      text: `ALERT: ${player.callsign} has claimed the ${key.toUpperCase()} Navigation Key in ${sector.name}.`,
      timestamp: Date.now(),
      isAdminBroadcast: false,
    };
    io.to("global").emit("chat:system", globalAnnounce);

    const announceMessage: ChatMessage = {
      id: uuidv4(),
      senderId: "system",
      senderName: "System",
      senderCallsign: "System",
      senderColor: "#f39c12",
      channel: "system",
      text: globalAnnounce.text,
      timestamp: globalAnnounce.timestamp,
    };
    appendChatMessage(announceMessage);
  });
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function factionDisplayName(
  factionId:
    | "science_collective"
    | "traders_guild"
    | "mining_consortium"
    | "pirate_clans"
    | "explorer_guild"
): string {
  const names: Record<typeof factionId, string> = {
    science_collective: "Science Collective",
    traders_guild: "Traders Guild",
    mining_consortium: "Mining Consortium",
    pirate_clans: "Pirate Clans",
    explorer_guild: "Explorer Guild",
  };
  return names[factionId];
}
