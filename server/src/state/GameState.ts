// =============================================================================
// STARFALL — Master Game State
//
// Single in-memory singleton that all server handlers read from and write to.
// Node.js module caching guarantees every import gets the same object.
//
// Responsibilities:
//   - Hold the authoritative game state
//   - Expose typed mutator functions (no direct field mutation outside this file)
//   - Build filtered client snapshots (hidden map, hidden coords, hidden convoy path)
//   - Enforce collection size caps to prevent unbounded memory growth
//
// Stable Player IDs:
//   Players are identified internally by a UUID (player.id) generated at join.
//   socket.id is stored separately and updated on reconnect.
//   All game state maps key on player.id, not socket.id.
//   A separate socketToPlayer map allows O(1) lookup from socket.id → player.id.
// =============================================================================

import { v4 as uuidv4 } from "uuid";
import type {
  GameState,
  GamePhase,
  Player,
  Fleet,
  Sector,
  Mission,
  NPCConvoy,
  NPCService,
  BeaconState,
  ChatMessage,
  ChatChannel,
  CoordShard,
  CoordShardType,
  NavKey,
  FactionID,
  ClientGameState,
  PublicPlayerInfo,
  PublicFleetInfo,
  PublicConvoyInfo,
  ClientBeaconState,
  SectorPreview,
  GameConfig,
  DEFAULT_GAME_CONFIG as _DefaultConfig,
} from "@shared/types";
import {
  ALL_FACTION_IDS,
  ALL_SHARD_TYPES,
  DEFAULT_GAME_CONFIG,
} from "@shared/types";
import {
  buildGalaxy,
  buildNPCServices,
  buildBeaconCoreConvoy,
  getSpawnSectorIds,
  getConvergenceSectorId,
  generateCallsign,
  assignPlayerColour,
  generateBeaconCoords,
  resetCallsigns,
  resetColourAssignments,
} from "./galaxy";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum global chat messages retained in memory. */
const MAX_GLOBAL_CHAT = 200;

/** Maximum fleet chat messages retained per fleet. */
const MAX_FLEET_CHAT = 100;

/** Maximum fuel/health/energy value. */
const STAT_MAX = 100;

/** Starting stats for a newly spawned player. */
const SPAWN_FUEL = 80;
const SPAWN_HEALTH = 100;
const SPAWN_ENERGY = 80;

// ---------------------------------------------------------------------------
// Secondary index: socket.id → stable player.id
// Updated on join and reconnect. Deleted on permanent leave / kick.
// ---------------------------------------------------------------------------

const socketToPlayerId = new Map<string, string>();

// ---------------------------------------------------------------------------
// Spawn point rotation
// Distributes players across spawn sectors in round-robin order.
// ---------------------------------------------------------------------------

let spawnIndex = 0;
let cachedSpawnSectors: string[] = [];

function getNextSpawnSector(sectors: Record<string, Sector>): string {
  if (cachedSpawnSectors.length === 0) {
    // Re-derive from current sector map in case of reset
    cachedSpawnSectors = Object.values(sectors)
      .filter((s) => {
        // Spawn sectors are inner + mid ring sectors with lower fuel cost
        return s.fuelCost <= 18 && s.id !== "core-nexus";
      })
      .map((s) => s.id);
  }

  if (cachedSpawnSectors.length === 0) {
    // Fallback — should never happen with the defined map
    return Object.keys(sectors)[0] ?? "inner-aether";
  }

  const sectorId = cachedSpawnSectors[spawnIndex % cachedSpawnSectors.length];
  spawnIndex++;
  return sectorId ?? "inner-aether";
}

// ---------------------------------------------------------------------------
// Coordinate shard assignment
// One complete beacon set is distributed across the first 4 players.
// Additional players receive shard types cycling through the 4 types.
// ---------------------------------------------------------------------------

let shardAssignmentIndex = 0;
let beaconCoords: Record<"X" | "Y" | "Z" | "sector_code", string> | null = null;

function assignShard(playerId: string): CoordShard {
  if (beaconCoords === null) {
    beaconCoords = generateBeaconCoords();
  }

  const type = ALL_SHARD_TYPES[shardAssignmentIndex % ALL_SHARD_TYPES.length] as CoordShardType;
  shardAssignmentIndex++;

  const value = beaconCoords[type];

  // Mask: hide last character of value for trades
  const maskedValue =
    value.length > 1 ? `${value.slice(0, -1)}?` : "?";

  return {
    id: uuidv4(),
    type,
    value,
    maskedValue,
    ownerId: playerId,
    sharedWith: [],
  };
}

// ---------------------------------------------------------------------------
// Initial state factory
// ---------------------------------------------------------------------------

function createInitialState(): GameState {
  const sectors = buildGalaxy();
  const npcServices = buildNPCServices();
  const beaconCoreConvoy = buildBeaconCoreConvoy();
  const convergenceSectorId = getConvergenceSectorId();

  const npcs: Record<string, NPCConvoy> = {
    [beaconCoreConvoy.id]: beaconCoreConvoy,
  };

  const config: GameConfig = { ...DEFAULT_GAME_CONFIG };

  const beacon: BeaconState = {
    phase: "pre_hunt",
    convoyCurrentSectorId: beaconCoreConvoy.sectorId,
    convergenceSectorId,
    activated: false,
    activatedBy: null,
    activatingFleetId: null,
    requiredFleetPower: config.baseFpRequirement,
    revealedAt: null,
  };

  return {
    phase: "lobby",
    startedAt: null,
    endedAt: null,
    winner: null,
    winnerFleetId: null,
    sectors,
    players: {},
    fleets: {},
    missions: {},
    npcServices,
    npcConvoys: npcs,
    beacon,
    globalChatLog: [],
    config,
  };
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const gameState: GameState = createInitialState();

// ---------------------------------------------------------------------------
// Socket ↔ Player ID index helpers
// ---------------------------------------------------------------------------

/** Register a socket → player mapping. Call on join and reconnect. */
export function registerSocket(socketId: string, playerId: string): void {
  socketToPlayerId.set(socketId, playerId);
}

/** Remove a socket mapping. Call on disconnect. */
export function unregisterSocket(socketId: string): void {
  socketToPlayerId.delete(socketId);
}

/** Resolve a socket ID to a stable player ID. Returns undefined if unknown. */
export function playerIdFromSocket(socketId: string): string | undefined {
  return socketToPlayerId.get(socketId);
}

/** Resolve a stable player ID to the current socket ID, if any. */
export function socketIdFromPlayer(playerId: string): string | undefined {
  for (const [sid, pid] of socketToPlayerId.entries()) {
    if (pid === playerId) return sid;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Player mutators
// ---------------------------------------------------------------------------

/**
 * Add a new player to the game state.
 * Assigns a stable UUID, callsign, colour, shard, and spawn sector.
 * Returns the fully constructed Player.
 */
export function addPlayer(socketId: string, username: string): Player {
  const playerId = uuidv4();
  const sectorId = getNextSpawnSector(gameState.sectors);
  const callsign = generateCallsign();
  const color = assignPlayerColour();
  const shard = assignShard(playerId);

  // Initialise faction reputation to 0 for all factions
  const factionReputation = Object.fromEntries(
    ALL_FACTION_IDS.map((fid) => [fid, 0])
  ) as Record<FactionID, number>;

  const player: Player = {
    id: playerId,
    username,
    callsign,
    color,
    sectorId,
    fuel: SPAWN_FUEL,
    health: SPAWN_HEALTH,
    energy: SPAWN_ENERGY,
    shard,
    navKeys: [],
    fleetId: null,
    factionReputation,
    exploredSectors: [sectorId],
    activeMissionId: null,
    isAdmin: false,
    isConnected: true,
    isDead: false,
    joinedAt: Date.now(),
    diedAt: null,
  };

  gameState.players[playerId] = player;

  // Mark sector as discovered
  const sector = gameState.sectors[sectorId];
  if (sector && !sector.discoveredBy.includes(playerId)) {
    sector.discoveredBy.push(playerId);
  }

  registerSocket(socketId, playerId);
  return player;
}

/**
 * Mark a player as disconnected (but keep their state for reconnect).
 * If they are in a fleet, remove them from the fleet roster.
 */
export function disconnectPlayer(socketId: string): Player | undefined {
  const playerId = playerIdFromSocket(socketId);
  if (playerId === undefined) return undefined;

  const player = gameState.players[playerId];
  if (!player) return undefined;

  player.isConnected = false;
  unregisterSocket(socketId);
  return player;
}

/**
 * Reconnect an existing player to a new socket.
 * Restores isConnected and updates the socket index.
 */
export function reconnectPlayer(
  socketId: string,
  playerId: string
): Player | undefined {
  const player = gameState.players[playerId];
  if (!player) return undefined;

  player.isConnected = true;
  registerSocket(socketId, playerId);
  return player;
}

/**
 * Permanently remove a player (kick / game reset).
 * Cleans up fleet membership and socket index.
 */
export function removePlayer(playerId: string): void {
  const player = gameState.players[playerId];
  if (!player) return;

  // Remove from fleet
  if (player.fleetId) {
    removePlayerFromFleet(playerId, player.fleetId);
  }

  // Remove socket mapping
  const socketId = socketIdFromPlayer(playerId);
  if (socketId) unregisterSocket(socketId);

  delete gameState.players[playerId];
}

/**
 * Apply fuel/health/energy changes to a player, clamping to [0, STAT_MAX].
 * Negative deltas reduce stats; positive deltas restore them.
 * Returns true if the player died (health reached 0).
 */
export function applyStatDelta(
  playerId: string,
  delta: { fuel?: number; health?: number; energy?: number }
): boolean {
  const player = gameState.players[playerId];
  if (!player) return false;

  if (delta.fuel !== undefined) {
    player.fuel = Math.max(0, Math.min(STAT_MAX, player.fuel + delta.fuel));
  }
  if (delta.health !== undefined) {
    player.health = Math.max(0, Math.min(STAT_MAX, player.health + delta.health));
  }
  if (delta.energy !== undefined) {
    player.energy = Math.max(0, Math.min(STAT_MAX, player.energy + delta.energy));
  }

  // Death check
  if (player.health === 0 && !player.isDead) {
    player.isDead = true;
    player.diedAt = Date.now();
    return true;
  }

  return false;
}

/**
 * Force-set a player's stats (admin override).
 * Values are clamped to [0, STAT_MAX].
 */
export function setPlayerStats(
  playerId: string,
  stats: { fuel?: number; health?: number; energy?: number }
): void {
  const player = gameState.players[playerId];
  if (!player) return;

  if (stats.fuel !== undefined) {
    player.fuel = Math.max(0, Math.min(STAT_MAX, stats.fuel));
  }
  if (stats.health !== undefined) {
    player.health = Math.max(0, Math.min(STAT_MAX, stats.health));
    if (player.health > 0 && player.isDead) {
      player.isDead = false;
      player.diedAt = null;
    }
  }
  if (stats.energy !== undefined) {
    player.energy = Math.max(0, Math.min(STAT_MAX, stats.energy));
  }
}

// ---------------------------------------------------------------------------
// Movement mutators
// ---------------------------------------------------------------------------

/**
 * Move a player to a target sector.
 * Validates:
 *   - Player exists and is alive
 *   - Target sector exists
 *   - Target is directly connected to current sector
 *   - Player has enough fuel
 *
 * On success:
 *   - Deducts fuel
 *   - Updates sectorId
 *   - Marks sector discovered (player + fleet)
 *   - Updates sector.discoveredBy
 *   - Updates fleet combinedExploredSectors
 *
 * Returns a discriminated result for handler use.
 */
export type MoveResult =
  | { ok: true; fromSectorId: string; toSectorId: string; fuelRemaining: number }
  | { ok: false; code: string; message: string };

export function movePlayer(playerId: string, targetSectorId: string): MoveResult {
  const player = gameState.players[playerId];
  if (!player) {
    return { ok: false, code: "player_not_found", message: "Player not found." };
  }
  if (player.isDead) {
    return { ok: false, code: "player_dead", message: "Dead players cannot move." };
  }
  if (gameState.phase !== "active") {
    return { ok: false, code: "game_not_active", message: "Game is not active." };
  }

  const currentSector = gameState.sectors[player.sectorId];
  const targetSector = gameState.sectors[targetSectorId];

  if (!currentSector) {
    return { ok: false, code: "invalid_sector", message: "Current sector not found." };
  }
  if (!targetSector) {
    return { ok: false, code: "invalid_sector", message: "Target sector not found." };
  }
  if (!currentSector.connectedTo.includes(targetSectorId)) {
    return { ok: false, code: "not_connected", message: "Sectors are not connected." };
  }

  const fuelCost = targetSector.fuelCost;
  if (player.fuel < fuelCost) {
    return {
      ok: false,
      code: "insufficient_fuel",
      message: `Not enough fuel. Need ${fuelCost}, have ${Math.floor(player.fuel)}.`,
    };
  }

  const fromSectorId = player.sectorId;

  // Deduct fuel and move
  player.fuel = Math.max(0, player.fuel - fuelCost);
  player.sectorId = targetSectorId;

  // Record discovery
  if (!player.exploredSectors.includes(targetSectorId)) {
    player.exploredSectors.push(targetSectorId);
  }
  if (!targetSector.discoveredBy.includes(playerId)) {
    targetSector.discoveredBy.push(playerId);
  }

  // Propagate to fleet map
  if (player.fleetId) {
    const fleet = gameState.fleets[player.fleetId];
    if (fleet && !fleet.combinedExploredSectors.includes(targetSectorId)) {
      fleet.combinedExploredSectors.push(targetSectorId);
    }
  }

  return {
    ok: true,
    fromSectorId,
    toSectorId: targetSectorId,
    fuelRemaining: player.fuel,
  };
}

// ---------------------------------------------------------------------------
// Fleet mutators
// ---------------------------------------------------------------------------

export function createFleet(
  leaderId: string,
  name: string
): { ok: true; fleet: Fleet } | { ok: false; code: string; message: string } {
  const leader = gameState.players[leaderId];
  if (!leader) {
    return { ok: false, code: "player_not_found", message: "Player not found." };
  }
  if (leader.fleetId) {
    return { ok: false, code: "already_in_fleet", message: "Already in a fleet." };
  }

  const fleetId = uuidv4();
  const fleet: Fleet = {
    id: fleetId,
    name: name.trim().slice(0, 32),
    leaderSocketId: leaderId,   // stored as player ID in V1
    memberIds: [leaderId],
    sharedNavKeys: [],
    fleetPower: 0,
    assembledCoords: {
      [leader.shard.type]: leader.shard.value,
    },
    combinedExploredSectors: [...leader.exploredSectors],
    hasBeaconCore: false,
    chatHistory: [],
  };

  gameState.fleets[fleetId] = fleet;
  leader.fleetId = fleetId;

  return { ok: true, fleet };
}

export function joinFleet(
  playerId: string,
  fleetId: string
): { ok: true; fleet: Fleet } | { ok: false; code: string; message: string } {
  const player = gameState.players[playerId];
  if (!player) {
    return { ok: false, code: "player_not_found", message: "Player not found." };
  }
  if (player.fleetId) {
    return { ok: false, code: "already_in_fleet", message: "Leave current fleet first." };
  }

  const fleet = gameState.fleets[fleetId];
  if (!fleet) {
    return { ok: false, code: "fleet_not_found", message: "Fleet not found." };
  }

  fleet.memberIds.push(playerId);
  player.fleetId = fleetId;

  // Pool this player's shard coord into the fleet
  fleet.assembledCoords[player.shard.type] = player.shard.value;

  // Expand fleet map
  for (const sectorId of player.exploredSectors) {
    if (!fleet.combinedExploredSectors.includes(sectorId)) {
      fleet.combinedExploredSectors.push(sectorId);
    }
  }

  return { ok: true, fleet };
}

export function removePlayerFromFleet(playerId: string, fleetId: string): void {
  const fleet = gameState.fleets[fleetId];
  const player = gameState.players[playerId];

  if (!fleet) return;

  fleet.memberIds = fleet.memberIds.filter((id) => id !== playerId);

  if (player) {
    player.fleetId = null;
  }

  // Rebuild assembled coords from remaining members
  const rebuiltCoords: Partial<Record<CoordShardType, string>> = {};
  for (const memberId of fleet.memberIds) {
    const member = gameState.players[memberId];
    if (member) {
      rebuiltCoords[member.shard.type] = member.shard.value;
    }
  }
  fleet.assembledCoords = rebuiltCoords;

  // Disband if empty
  if (fleet.memberIds.length === 0) {
    delete gameState.fleets[fleetId];
    return;
  }

  // Transfer leadership if leader left
  if (fleet.leaderSocketId === playerId) {
    fleet.leaderSocketId = fleet.memberIds[0] ?? "";
  }
}

// ---------------------------------------------------------------------------
// Chat mutators
// ---------------------------------------------------------------------------

/**
 * Append a message to the appropriate log.
 * Enforces per-log size caps by dropping the oldest entries when full.
 */
export function appendChatMessage(
  message: ChatMessage
): void {
  const channel: ChatChannel = message.channel;

  if (channel === "global" || channel === "system" || channel === "admin") {
    gameState.globalChatLog.push(message);
    if (gameState.globalChatLog.length > MAX_GLOBAL_CHAT) {
      // Remove oldest 20 entries in one splice to avoid per-message overhead
      gameState.globalChatLog.splice(0, 20);
    }
    return;
  }

  if (channel === "fleet" && message.fleetId) {
    const fleet = gameState.fleets[message.fleetId];
    if (!fleet) return;
    fleet.chatHistory.push(message);
    if (fleet.chatHistory.length > MAX_FLEET_CHAT) {
      fleet.chatHistory.splice(0, 20);
    }
    return;
  }

  // Local messages are broadcast in real time and not persisted server-side.
  // They are stored transiently in the global log with sectorId attached
  // so players who join a sector mid-session see recent context.
  if (channel === "local") {
    gameState.globalChatLog.push(message);
    if (gameState.globalChatLog.length > MAX_GLOBAL_CHAT) {
      gameState.globalChatLog.splice(0, 20);
    }
  }
}

// ---------------------------------------------------------------------------
// Game phase mutators
// ---------------------------------------------------------------------------

export function setGamePhase(phase: GamePhase): void {
  gameState.phase = phase;
  if (phase === "active") {
    gameState.startedAt = Date.now();
  }
  if (phase === "ended") {
    gameState.endedAt = Date.now();
  }
}

export function setWinner(playerId: string, fleetId: string | null): void {
  gameState.winner = playerId;
  gameState.winnerFleetId = fleetId;
}

// ---------------------------------------------------------------------------
// Beacon mutators
// ---------------------------------------------------------------------------

export function advanceBeaconConvoy(): void {
  const convoy = gameState.npcConvoys["convoy-beacon-core"];
  if (!convoy || convoy.defeated) return;

  const nextIndex = (convoy.pathIndex + 1) % convoy.path.length;
  const nextSectorId = convoy.path[nextIndex];
  if (!nextSectorId) return;

  // Remove from old sector
  const oldSector = gameState.sectors[convoy.sectorId];
  if (oldSector) {
    oldSector.npcConvoyIds = oldSector.npcConvoyIds.filter(
      (id) => id !== convoy.id
    );
  }

  // Move to new sector
  convoy.pathIndex = nextIndex;
  convoy.sectorId = nextSectorId;
  convoy.lastMovedAt = Date.now();
  convoy.interceptProgress = 0;
  convoy.interceptingPlayerIds = [];

  // Record in new sector
  const newSector = gameState.sectors[nextSectorId];
  if (newSector && !newSector.npcConvoyIds.includes(convoy.id)) {
    newSector.npcConvoyIds.push(convoy.id);
  }

  // Update beacon state
  gameState.beacon.convoyCurrentSectorId = nextSectorId;
}

export function revealConvergenceSector(): void {
  gameState.beacon.phase = "convergence";
  gameState.beacon.revealedAt = Date.now();
}

// ---------------------------------------------------------------------------
// Game reset
// ---------------------------------------------------------------------------

export function resetGameState(): void {
  // Reset galaxy helpers
  resetCallsigns();
  resetColourAssignments();
  spawnIndex = 0;
  cachedSpawnSectors = [];
  shardAssignmentIndex = 0;
  beaconCoords = null;
  socketToPlayerId.clear();

  // Rebuild state in-place (mutate the exported singleton)
  const fresh = createInitialState();
  Object.assign(gameState, fresh);
}

// ---------------------------------------------------------------------------
// Client snapshot builder
// ---------------------------------------------------------------------------

/**
 * Build the filtered ClientGameState to send to a specific player.
 *
 * Hidden data filtered out:
 *   - Other players' full shard values (only maskedValue + type visible after trade)
 *   - NPC convoy path arrays
 *   - Beacon convergence sector (until phase === "convergence")
 *   - Sectors the player (and their fleet) have not discovered
 */
export function buildClientSnapshot(playerId: string): ClientGameState | null {
  const player = gameState.players[playerId];
  if (!player) return null;

  const fleet = player.fleetId ? gameState.fleets[player.fleetId] : null;

  // Sectors this player is allowed to see in full detail
  const fullVisibleIds = new Set<string>([
    ...player.exploredSectors,
    ...(fleet?.combinedExploredSectors ?? []),
  ]);

  // Connected-but-unvisited sectors (preview only)
  const previewIds = new Set<string>();
  for (const sectorId of fullVisibleIds) {
    const sector = gameState.sectors[sectorId];
    if (!sector) continue;
    for (const neighborId of sector.connectedTo) {
      if (!fullVisibleIds.has(neighborId)) {
        previewIds.add(neighborId);
      }
    }
  }

  // Build visible sectors record
  const visibleSectors: Record<string, Sector> = {};
  for (const sectorId of fullVisibleIds) {
    const sector = gameState.sectors[sectorId];
    if (sector) visibleSectors[sectorId] = sector;
  }

  // Build preview sectors record
  const previewSectors: Record<string, SectorPreview> = {};
  for (const sectorId of previewIds) {
    const sector = gameState.sectors[sectorId];
    if (!sector) continue;
    previewSectors[sectorId] = {
      id: sector.id,
      name: sector.name,
      region: sector.region,
      connectedTo: sector.connectedTo,
      faction: sector.faction,
    };
  }

  // Build public player info (strip shard values)
  const players: Record<string, PublicPlayerInfo> = {};
  for (const [pid, p] of Object.entries(gameState.players)) {
    players[pid] = toPublicPlayerInfo(p);
  }

  // Build public fleet info
  const fleets: Record<string, PublicFleetInfo> = {};
  for (const [fid, f] of Object.entries(gameState.fleets)) {
    fleets[fid] = toPublicFleetInfo(f);
  }

  // Build public convoy info (strip path)
  const npcConvoys: Record<string, PublicConvoyInfo> = {};
  for (const [cid, c] of Object.entries(gameState.npcConvoys)) {
    npcConvoys[cid] = toPublicConvoyInfo(c);
  }

  // Build client beacon state
  const beacon: ClientBeaconState = buildClientBeacon(player, fullVisibleIds);

  return {
    phase: gameState.phase,
    startedAt: gameState.startedAt,
    endedAt: gameState.endedAt,
    winner: gameState.winner,
    winnerFleetId: gameState.winnerFleetId,
    visibleSectors,
    previewSectors,
    players,
    fleets,
    yourPlayer: player,
    missions: { ...gameState.missions },
    npcServices: { ...gameState.npcServices },
    npcConvoys,
    beacon,
    globalChatLog: [...gameState.globalChatLog],
    config: gameState.config,
  };
}

// ---------------------------------------------------------------------------
// Private snapshot helpers
// ---------------------------------------------------------------------------

function toPublicPlayerInfo(player: Player): PublicPlayerInfo {
  return {
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
}

function toPublicFleetInfo(fleet: Fleet): PublicFleetInfo {
  return {
    id: fleet.id,
    name: fleet.name,
    leaderSocketId: fleet.leaderSocketId,
    memberIds: [...fleet.memberIds],
    sharedNavKeys: [...fleet.sharedNavKeys],
    fleetPower: fleet.fleetPower,
    hasBeaconCore: fleet.hasBeaconCore,
    coordsAssembled: Object.keys(fleet.assembledCoords).length,
  };
}

function toPublicConvoyInfo(convoy: NPCConvoy): PublicConvoyInfo {
  return {
    id: convoy.id,
    name: convoy.name,
    faction: convoy.faction,
    sectorId: convoy.sectorId,
    isBeaconCore: convoy.isBeaconCore,
    defeated: convoy.defeated,
    interceptProgress: convoy.interceptProgress,
    interceptStepsRequired: convoy.interceptStepsRequired,
  };
}

function buildClientBeacon(
  player: Player,
  visibleSectorIds: Set<string>
): ClientBeaconState {
  const beacon = gameState.beacon;
  const convoy = gameState.npcConvoys["convoy-beacon-core"];

  // Convoy location is only visible if it is in a sector the player can see
  const convoyVisible =
    convoy !== undefined && visibleSectorIds.has(convoy.sectorId);

  // Convergence sector revealed only when beacon phase is "convergence" or later
  const convergenceVisible =
    beacon.phase === "convergence" || beacon.phase === "activated";

  return {
    phase: beacon.phase,
    convoyCurrentSectorId: convoyVisible ? convoy?.sectorId ?? null : null,
    convergenceSectorId: convergenceVisible ? beacon.convergenceSectorId : null,
    activated: beacon.activated,
    activatedBy: beacon.activatedBy,
    activatingFleetId: beacon.activatingFleetId,
    requiredFleetPower: beacon.requiredFleetPower,
    revealedAt: beacon.revealedAt,
  };
}

// ---------------------------------------------------------------------------
// Admin helpers
// ---------------------------------------------------------------------------

/** Returns all players sorted by join time — useful for admin panel table. */
export function getPlayersSortedByJoinTime(): Player[] {
  return Object.values(gameState.players).sort(
    (a, b) => a.joinedAt - b.joinedAt
  );
}

/** Returns the number of currently connected players. */
export function getConnectedPlayerCount(): number {
  return Object.values(gameState.players).filter((p) => p.isConnected).length;
}
