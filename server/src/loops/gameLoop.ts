// =============================================================================
// STARFALL — Game Loop
//
// Runs on a fixed 2-second tick while the game is in the "active" phase.
//
// Each tick handles:
//   1. Passive fuel / energy / health regeneration for living players
//   2. Beacon Core convoy movement (time-gated, per convoy.moveIntervalMs)
//   3. Beacon phase transitions:
//        pre_hunt   → convoy_hunt   (config.sightingsBeginAt ms after start)
//        convoy_hunt → convergence  (config.convergenceRevealAt ms after start)
//   4. Game-over by time expiry (config.gameDurationMs ms after start)
//
// Regen is capped at STAT_MAX (100) and skipped for dead players.
// The loop is started by socket.ts after phase transitions to "active" and
// stopped when the game ends. Only one loop may run at a time.
//
// Broadcast discipline:
//   - player:updated is emitted for each player whose stats changed this tick
//   - beacon:moved / beacon:phaseChanged are emitted on convoy/phase events
//   - game:ended is emitted on time expiry
// =============================================================================

import type { Server } from "socket.io";
import type {
  PlayerUpdatedPayload,
  BeaconMovedPayload,
  BeaconPhaseChangedPayload,
  ConvoySightingPayload,
  GameEndedPayload,
  SystemMessagePayload,
  ChatMessage,
} from "@shared/types";
import {
  gameState,
  advanceBeaconConvoy,
  revealConvergenceSector,
  setGamePhase,
  setWinner,
  appendChatMessage,
} from "../state/GameState";
import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Tick interval in milliseconds. Must match fuelRegenPerTick intent in config. */
const TICK_MS = 2_000;

/** Maximum value for fuel / health / energy. */
const STAT_MAX = 100;

/** Room that receives all global broadcasts. */
const ROOM_GLOBAL = "global";

// ---------------------------------------------------------------------------
// Module-level loop handle
// ---------------------------------------------------------------------------

let loopHandle: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

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

// ---------------------------------------------------------------------------
// Passive regeneration
// ---------------------------------------------------------------------------

/**
 * Apply one tick of passive regen to every living, connected player.
 * Emits player:updated for each player whose stats actually changed.
 */
function tickRegen(io: Server): void {
  const { fuelRegenPerTick, energyRegenPerTick, healthRegenPerTick } =
    gameState.config;

  for (const player of Object.values(gameState.players)) {
    if (!player.isConnected || player.isDead) continue;

    const prevFuel = player.fuel;
    const prevEnergy = player.energy;
    const prevHealth = player.health;

    player.fuel = clamp(player.fuel + fuelRegenPerTick, 0, STAT_MAX);
    player.energy = clamp(player.energy + energyRegenPerTick, 0, STAT_MAX);
    player.health = clamp(player.health + healthRegenPerTick, 0, STAT_MAX);

    // Only emit if at least one stat changed (avoids flooding at cap)
    if (
      player.fuel !== prevFuel ||
      player.energy !== prevEnergy ||
      player.health !== prevHealth
    ) {
      const payload: PlayerUpdatedPayload = {
        playerId: player.id,
        fuel: player.fuel,
        energy: player.energy,
        health: player.health,
      };
      io.to(ROOM_GLOBAL).emit("player:updated", payload);
    }
  }
}

// ---------------------------------------------------------------------------
// Beacon convoy movement
// ---------------------------------------------------------------------------

/**
 * Advance the Beacon Core convoy if its move interval has elapsed.
 * Emits beacon:moved to all clients. The sectorId field of the payload is
 * only non-null for clients who can see the new sector — that filtering is
 * done client-side based on visibleSectors; the server broadcasts the region
 * unconditionally, which is public knowledge once convoy_hunt phase begins.
 */
function tickBeaconConvoy(io: Server): void {
  const convoy = gameState.npcConvoys["convoy-beacon-core"];
  if (!convoy || convoy.defeated) return;

  const now = Date.now();
  if (now - convoy.lastMovedAt < convoy.moveIntervalMs) return;

  // Move the convoy (mutates gameState)
  advanceBeaconConvoy();

  const updatedConvoy = gameState.npcConvoys["convoy-beacon-core"];
  if (!updatedConvoy) return;

  const newSector = gameState.sectors[updatedConvoy.sectorId];
  const region = newSector?.region ?? "Unknown Region";

  // Precise sector name only broadcast during convergence phase
  const isPrecise =
    gameState.beacon.phase === "convergence" ||
    gameState.beacon.phase === "activated";

  // Sighting payload — sectorId is null unless precise
  // The broad beacon:moved payload carries region for fog-of-war.
  // Clients who can see the sector will show it on their map; others see only region.
  const beaconMovedPayload: BeaconMovedPayload = {
    sectorId: updatedConvoy.sectorId, // clients filter visibility themselves
    region,
  };
  io.to(ROOM_GLOBAL).emit("beacon:moved", beaconMovedPayload);

  // Broadcast a sighting message if sightings have begun
  if (
    gameState.beacon.phase === "convoy_hunt" ||
    gameState.beacon.phase === "convergence"
  ) {
    const sightingPayload: ConvoySightingPayload = {
      region,
      sectorName: isPrecise ? (newSector?.name ?? null) : null,
      timestamp: now,
    };
    io.to(ROOM_GLOBAL).emit("convoy:sighting", sightingPayload);

    const sightingText = isPrecise
      ? `⚠ Beacon Core convoy detected in ${newSector?.name ?? region}.`
      : `📡 Beacon Core convoy sighted in ${region}.`;
    broadcastSystem(io, sightingText);
  }
}

// ---------------------------------------------------------------------------
// Phase transitions
// ---------------------------------------------------------------------------

/**
 * Check elapsed time since game start and fire phase transitions when due.
 * Transitions fire at most once each (idempotent checks on current phase).
 */
function tickPhaseTransitions(io: Server): void {
  if (gameState.startedAt === null) return;

  const elapsed = Date.now() - gameState.startedAt;
  const { sightingsBeginAt, convergenceRevealAt, gameDurationMs } =
    gameState.config;

  // pre_hunt → convoy_hunt
  if (
    gameState.beacon.phase === "pre_hunt" &&
    elapsed >= sightingsBeginAt
  ) {
    gameState.beacon.phase = "convoy_hunt";

    const payload: BeaconPhaseChangedPayload = {
      phase: "convoy_hunt",
      convergenceSectorId: null,
    };
    io.to(ROOM_GLOBAL).emit("beacon:phaseChanged", payload);
    broadcastSystem(
      io,
      "🚨 Beacon Core convoy is on the move. Sightings will now be broadcast."
    );
  }

  // convoy_hunt → convergence
  if (
    gameState.beacon.phase === "convoy_hunt" &&
    elapsed >= convergenceRevealAt
  ) {
    revealConvergenceSector(); // sets phase to "convergence"

    const payload: BeaconPhaseChangedPayload = {
      phase: "convergence",
      convergenceSectorId: gameState.beacon.convergenceSectorId,
    };
    io.to(ROOM_GLOBAL).emit("beacon:phaseChanged", payload);
    broadcastSystem(
      io,
      "🌟 Convergence sector revealed! Race to activate the Beacon Core."
    );
  }

  // Time expiry → game ended
  if (gameState.phase === "active" && elapsed >= gameDurationMs) {
    setGamePhase("ended");

    // Determine highest fleet power as tiebreak winner
    let topFleetId: string | null = null;
    let topFP = -1;
    for (const fleet of Object.values(gameState.fleets)) {
      if (fleet.fleetPower > topFP) {
        topFP = fleet.fleetPower;
        topFleetId = fleet.id;
      }
    }

    const winningFleet = topFleetId ? gameState.fleets[topFleetId] : null;
    const winnerId = winningFleet?.leaderSocketId ?? null;
    if (winnerId && topFleetId) {
      setWinner(winnerId, topFleetId);
    }

    const finalFleetPower: Record<string, number> = {};
    for (const [fid, fleet] of Object.entries(gameState.fleets)) {
      finalFleetPower[fid] = fleet.fleetPower;
    }

    const endedPayload: GameEndedPayload = {
      winner: gameState.winner,
      winnerFleetId: gameState.winnerFleetId,
      winnerFleetName: winningFleet?.name ?? null,
      reason: "time_expired",
      finalFleetPower,
    };
    io.to(ROOM_GLOBAL).emit("game:ended", endedPayload);
    broadcastSystem(io, "⏱ Time expired. The Beacon Core was never activated.");

    stopGameLoop();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the game loop. Safe to call only when phase is "active".
 * Calling while a loop is already running is a no-op (logs a warning).
 */
export function startGameLoop(io: Server): void {
  if (loopHandle !== null) {
    console.warn("[gameLoop] startGameLoop called while loop is already running — ignored.");
    return;
  }

  console.log("[gameLoop] Starting game loop (tick every %dms).", TICK_MS);

  loopHandle = setInterval(() => {
    try {
      tickRegen(io);
      tickBeaconConvoy(io);
      tickPhaseTransitions(io);
    } catch (err) {
      console.error("[gameLoop] Uncaught error in tick:", err);
    }
  }, TICK_MS);
}

/**
 * Stop the game loop. Safe to call even when the loop is not running.
 */
export function stopGameLoop(): void {
  if (loopHandle !== null) {
    clearInterval(loopHandle);
    loopHandle = null;
    console.log("[gameLoop] Game loop stopped.");
  }
}

/**
 * Returns true if the loop is currently running.
 */
export function isGameLoopRunning(): boolean {
  return loopHandle !== null;
}
