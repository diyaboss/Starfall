// =============================================================================
// STARFALL — Shared Types
// Single source of truth. Imported by both client and server.
// Never import from project-local files here — zero dependencies.
// =============================================================================

// -----------------------------------------------------------------------------
// Enumerations
// -----------------------------------------------------------------------------

export type GamePhase =
  | "lobby"
  | "tutorial"
  | "active"
  | "ended";

export type BeaconPhase =
  | "pre_hunt"       // Convoy is dark, no sightings
  | "convoy_hunt"    // Sightings broadcast, players chasing convoy
  | "convergence"    // Convergence sector revealed, final race
  | "activated";     // Beacon activated, game over

export type NavKey = "alpha" | "beta" | "gamma";

export type CoordShardType = "X" | "Y" | "Z" | "sector_code";

export type FactionID =
  | "science_collective"
  | "traders_guild"
  | "mining_consortium"
  | "pirate_clans"
  | "explorer_guild";

export type MissionStatus =
  | "available"
  | "active"
  | "completed"
  | "failed"
  | "expired";

export type MissionType =
  | "relay_signal"
  | "supply_run"
  | "faction_diplomacy"
  | "sector_survey"
  | "pirate_intercept"
  | "trade_escort"
  | "nav_key_recovery"
  | "resource_extraction"
  | "convoy_tracking"
  | "first_contact"
  | "sector_defense"
  | "intelligence_breach";

export type ChatChannel = "global" | "local" | "fleet" | "system" | "admin";

export type ServiceType =
  | "sector_scan"
  | "coord_decode"
  | "beacon_triangulation"
  | "fuel_purchase"
  | "health_purchase"
  | "energy_purchase"
  | "nav_key_broker"
  | "supply_contract"
  | "refuel_discount"
  | "mine_fuel"
  | "extraction_rights"
  | "raid_contract"
  | "black_market_intel"
  | "mercenary_hire"
  | "map_reveal"
  | "exploration_contract";

// -----------------------------------------------------------------------------
// Coordinate Shards
// -----------------------------------------------------------------------------

export interface CoordShard {
  id: string;
  type: CoordShardType;
  /** Full value — server sends this only to the owning player */
  value: string;
  /** Masked value shown to other players after a trade (last digit hidden) */
  maskedValue: string;
  /** Socket ID of the player who owns this shard */
  ownerId: string;
  /** Socket IDs of players who have received the masked value via exchange */
  sharedWith: string[];
}

/**
 * What the server sends to non-owning players who have received a trade.
 * Never includes the full value.
 */
export interface CoordShardTrade {
  fromPlayerId: string;
  fromPlayerName: string;
  shardType: CoordShardType;
  maskedValue: string;
}

// -----------------------------------------------------------------------------
// Sectors
// -----------------------------------------------------------------------------

export interface Sector {
  id: string;
  name: string;
  /** Vague geographic label used in convoy sighting broadcasts */
  region: string;
  /** SVG/canvas grid position */
  x: number;
  y: number;
  connectedTo: string[];
  /** Fuel cost to travel into this sector */
  fuelCost: number;
  faction: FactionID | null;
  /** ID of the NPCService stationed here, if any */
  factionServiceId: string | null;
  /** Mission IDs currently available in this sector */
  missionIds: string[];
  navKeyPresent: NavKey | null;
  /** IDs of NPC convoys currently in this sector */
  npcConvoyIds: string[];
  /** Socket IDs of players who have physically visited this sector */
  discoveredBy: string[];
}

/**
 * Minimal sector data sent to clients who can see a sector exists
 * but have not visited it (connected but unvisited neighbors).
 */
export interface SectorPreview {
  id: string;
  name: string;
  region: string;
  x: number;
  y: number;
  connectedTo: string[];
  /** Faction color hint visible even on dark nodes */
  faction: FactionID | null;
}

// -----------------------------------------------------------------------------
// NPC Services (Faction Stations)
// -----------------------------------------------------------------------------

export interface ServiceOption {
  type: ServiceType;
  label: string;
  description: string;
  /** Fuel cost to use this service */
  fuelCost: number;
  /** Energy cost to use this service */
  energyCost: number;
  /** Minimum faction reputation required */
  minReputation: number;
}

export interface NPCService {
  id: string;
  factionId: FactionID;
  sectorId: string;
  services: ServiceOption[];
  /** Per-player reputation: Record<socketId, number -100..100> */
  reputationMap: Record<string, number>;
}

// -----------------------------------------------------------------------------
// NPC Convoys
// -----------------------------------------------------------------------------

export interface NPCConvoy {
  id: string;
  name: string;
  faction: FactionID;
  sectorId: string;
  /**
   * Pre-generated sector ID path — server-only.
   * Never sent to clients.
   */
  path: string[];
  pathIndex: number;
  /** Milliseconds between sector hops */
  moveIntervalMs: number;
  lastMovedAt: number;
  isBeaconCore: boolean;
  /** Progress toward intercept: 0..requiredSteps */
  interceptProgress: number;
  /** Required intercept steps (scales with fleet size) */
  interceptStepsRequired: number;
  /** Socket IDs of players currently intercepting */
  interceptingPlayerIds: string[];
  defeated: boolean;
}

// -----------------------------------------------------------------------------
// Missions
// -----------------------------------------------------------------------------

export interface MissionReward {
  fuel?: number;
  health?: number;
  energy?: number;
  navKey?: NavKey;
  fleetPower?: number;
  coordDecode?: boolean;
}

export interface Mission {
  id: string;
  type: MissionType;
  title: string;
  description: string;
  /** Sector where this mission must be completed */
  sectorId: string;
  requiredNavKey: NavKey | null;
  /** Minimum number of players from the same fleet required in sector */
  minFleetMembers: number;
  /** Whether a second fleet's member must also be present */
  requiresCrossFleet: boolean;
  reward: MissionReward;
  fleetPowerReward: number;
  status: MissionStatus;
  /** Socket ID of the player who accepted this mission */
  assignedPlayerId: string | null;
  /** Fleet ID of the accepting player */
  assignedFleetId: string | null;
  expiresAt: number | null;
  totalSteps: number;
  currentStep: number;
}

// -----------------------------------------------------------------------------
// Players
// -----------------------------------------------------------------------------

export interface Player {
  id: string; // socket.id
  username: string;
  /** Callsign auto-generated on spawn e.g. "Red Falcon" */
  callsign: string;
  /** Hex color for map marker e.g. "#e74c3c" */
  color: string;
  sectorId: string;
  fuel: number;      // 0–100
  health: number;    // 0–100
  energy: number;    // 0–100
  shard: CoordShard;
  navKeys: NavKey[];
  fleetId: string | null;
  factionReputation: Record<FactionID, number>; // -100..100
  /** Sector IDs this player has physically visited */
  exploredSectors: string[];
  activeMissionId: string | null;
  isAdmin: boolean;
  /** True while socket is connected */
  isConnected: boolean;
  /** True when health reaches 0 */
  isDead: boolean;
  joinedAt: number;
  /** Populated when health reaches 0 */
  /** Populated when health reaches 0 */
  diedAt: number | null;
  /** True if the player individually holds the Beacon Core */
  hasBeaconCore: boolean;
}

// -----------------------------------------------------------------------------
// Fleets
// -----------------------------------------------------------------------------

export interface Fleet {
  id: string;
  name: string;
  leaderSocketId: string;
  memberIds: string[];
  sharedNavKeys: NavKey[];
  fleetPower: number;
  /**
   * Coordinate values pooled from fleet members' shards.
   * Key = CoordShardType, value = full shard value.
   * Only populated if the owning member is in the fleet.
   */
  assembledCoords: Partial<Record<CoordShardType, string>>;
  /** Union of all member explored sector IDs */
  combinedExploredSectors: string[];
  hasBeaconCore: boolean;
  chatHistory: ChatMessage[];
}

// -----------------------------------------------------------------------------
// Chat
// -----------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  /** Callsign shown alongside username */
  senderCallsign: string;
  /** Hex color matching player's map marker */
  senderColor: string;
  channel: ChatChannel;
  text: string;
  timestamp: number;
  /** Populated for local channel messages */
  sectorId?: string;
  /** Populated for fleet channel messages */
  fleetId?: string;
}

// -----------------------------------------------------------------------------
// Beacon
// -----------------------------------------------------------------------------

export interface BeaconState {
  phase: BeaconPhase;
  /** Current sector of the Beacon Core convoy */
  convoyCurrentSectorId: string;
  /**
   * Convergence sector — server-only until phase === "convergence".
   * Sent as null to clients until revealed.
   */
  convergenceSectorId: string | null;
  activated: boolean;
  activatedBy: string | null;
  activatingFleetId: string | null;
  /** Minimum Fleet Power required to activate */
  requiredFleetPower: number;
  revealedAt: number | null;
}

// -----------------------------------------------------------------------------
// Game Configuration
// -----------------------------------------------------------------------------

export interface GameConfig {
  maxPlayers: number;
  /** Total match duration in ms */
  gameDurationMs: number;
  tutorialDurationMs: number;
  /** Passive fuel regen per tick (ms defined by server TICK_MS) */
  fuelRegenPerTick: number;
  /** Passive energy regen per tick */
  energyRegenPerTick: number;
  /** Passive health regen per tick (very slow) */
  healthRegenPerTick: number;
  beaconMoveIntervalMs: number;
  /** ms after game start when convoy sightings begin */
  sightingsBeginAt: number;
  /** ms after game start when convergence sector is auto-revealed */
  convergenceRevealAt: number;
  /** Base Fleet Power required for beacon activation */
  baseFpRequirement: number;
  /** Admin toggle: enable pirate faction services */
  piratesEnabled: boolean;
}

// -----------------------------------------------------------------------------
// Master Game State
// -----------------------------------------------------------------------------

export interface GameState {
  phase: GamePhase;
  startedAt: number | null;
  endedAt: number | null;
  winner: string | null;       // socket ID
  winnerFleetId: string | null;
  winnerFleetName: string | null;
  finalExploredSectorCount: number;
  finalFuelRemaining: number;
  finalShardCount: number;
  sectors: Record<string, Sector>;
  players: Record<string, Player>;
  fleets: Record<string, Fleet>;
  missions: Record<string, Mission>;
  /** All faction NPC service stations */
  npcServices: Record<string, NPCService>;
  /** All NPC convoys including Beacon Core */
  npcConvoys: Record<string, NPCConvoy>;
  beacon: BeaconState;
  /** Global chat only — local stored in sector context, fleet stored in fleet */
  globalChatLog: ChatMessage[];
  config: GameConfig;
}

// -----------------------------------------------------------------------------
// Socket Event Payloads
// Client → Server
// -----------------------------------------------------------------------------

export interface JoinPayload {
  username: string;
  adminCode?: string;
}

export interface MovePayload {
  targetSectorId: string;
}

export interface CollectNavKeyPayload {
  sectorId: string;
}

export interface CoordExchangeRequestPayload {
  targetPlayerId: string;
}

export interface CoordExchangeResponsePayload {
  requesterId: string;
  accepted: boolean;
}

export interface MissionAcceptPayload {
  missionId: string;
}

export interface MissionStepPayload {
  missionId: string;
}

export interface FleetCreatePayload {
  name: string;
}

export interface FleetJoinPayload {
  fleetId: string;
}

export interface FleetShareKeyPayload {
  navKey: NavKey;
}

export interface ChatSendPayload {
  channel: ChatChannel;
  text: string;
  fleetId?: string;
}

export interface UseServicePayload {
  serviceId: string;
  serviceType: ServiceType;
  /** Optional target player for brokered trades */
  targetPlayerId?: string;
}

export interface BeaconActivatePayload {
  fleetId: string;
}

export interface AdminAdjustPlayerPayload {
  playerId: string;
  fuel?: number;
  health?: number;
  energy?: number;
  hasBeaconCore?: boolean;
}

export interface AdminKickPayload {
  playerId: string;
  message: string;
}

export interface AdminBroadcastPayload {
  text: string;
}

export interface AdminTriggerSightingPayload {
  sectorId: string;
}

export interface AdminRevealConvergencePayload {
  sectorId?: string; // override convergence sector if desired
}

// -----------------------------------------------------------------------------
// Socket Event Payloads
// Server → Client
// -----------------------------------------------------------------------------

/**
 * Full state snapshot — sent on join.
 * Server filters out hidden data before sending (convoy path, full coord values
 * belonging to other players, unrevealed convergence sector).
 */
export interface StateSnapshotPayload {
  gameState: ClientGameState;
  yourPlayerId: string;
}

/**
 * Client-facing game state.
 * Differs from server GameState in that sensitive fields are omitted/nulled.
 */
export interface ClientGameState {
  phase: GamePhase;
  startedAt: number | null;
  endedAt: number | null;
  winner: string | null;
  winnerFleetId: string | null;
  winnerFleetName: string | null;
  finalExploredSectorCount: number | null;
  finalFuelRemaining: number | null;
  finalShardCount: number | null;
  /** Only sectors the player can see — filtered by server */
  visibleSectors: Record<string, Sector>;
  /** Sectors visible as name-only previews (connected but unvisited) */
  previewSectors: Record<string, SectorPreview>;
  players: Record<string, PublicPlayerInfo>;
  fleets: Record<string, PublicFleetInfo>;
  /** Your own full player record */
  yourPlayer: Player;
  missions: Record<string, Mission>;
  npcServices: Record<string, NPCService>;
  /** Convoys without server-only path data */
  npcConvoys: Record<string, PublicConvoyInfo>;
  beacon: ClientBeaconState;
  globalChatLog: ChatMessage[];
  config: GameConfig;
}

/**
 * Public player info visible to all other clients.
 * Shard value and full explored sectors are hidden.
 */
export interface PublicPlayerInfo {
  id: string;
  username: string;
  callsign: string;
  color: string;
  sectorId: string;
  fleetId: string | null;
  isConnected: boolean;
  isDead: boolean;
  /** Only the shard type is public, not the value */
  shardType: CoordShardType;
  navKeys: NavKey[];
}

/**
 * Public fleet info. Full coord assembly and chat history hidden.
 */
export interface PublicFleetInfo {
  id: string;
  name: string;
  leaderSocketId: string;
  memberIds: string[];
  sharedNavKeys: NavKey[];
  fleetPower: number;
  hasBeaconCore: boolean;
  /** How many of the 4 coord types have been assembled */
  coordsAssembled: number;
}

/**
 * Public convoy info. Path is never sent to clients.
 */
export interface PublicConvoyInfo {
  id: string;
  name: string;
  faction: FactionID;
  sectorId: string;
  isBeaconCore: boolean;
  defeated: boolean;
  interceptProgress: number;
  interceptStepsRequired: number;
}

/**
 * Beacon state as sent to clients.
 * convergenceSectorId is null until phase === "convergence".
 */
export interface ClientBeaconState {
  phase: BeaconPhase;
  /** Only revealed once convoy is in a player's visible sector */
  convoyCurrentSectorId: string | null;
  /** Only revealed when phase === "convergence" */
  convergenceSectorId: string | null;
  activated: boolean;
  activatedBy: string | null;
  activatingFleetId: string | null;
  requiredFleetPower: number;
  revealedAt: number | null;
}

export interface PlayerMovedPayload {
  playerId: string;
  fromSectorId: string;
  toSectorId: string;
  fuelRemaining: number;
}

export interface PlayerJoinedPayload {
  player: PublicPlayerInfo;
  sectorId: string;
}

export interface PlayerDisconnectedPayload {
  playerId: string;
}

export interface PlayerDiedPayload {
  playerId: string;
  sectorId: string;
}

export interface PlayerRevivedPayload {
  playerId: string;
}

export interface PlayerUpdatedPayload {
  playerId: string;
  fuel?: number;
  health?: number;
  energy?: number;
  navKeys?: NavKey[];
  fleetId?: string | null;
  isDead?: boolean;
}

export interface FleetCreatedPayload {
  fleet: PublicFleetInfo;
}

export interface FleetUpdatedPayload {
  fleet: PublicFleetInfo;
}

export interface FleetDisbandedPayload {
  fleetId: string;
}

export interface MissionUpdatedPayload {
  mission: Mission;
}

export interface MissionExpiredPayload {
  missionId: string;
  sectorId: string;
}

export interface BeaconMovedPayload {
  /** Only sent if the convoy is in a player's visible sector */
  sectorId: string | null;
  region: string;
}

export interface BeaconPhaseChangedPayload {
  phase: BeaconPhase;
  convergenceSectorId: string | null;
}

export interface BeaconActivatedPayload {
  activatedBy: string;
  activatingFleetId: string;
  fleetName: string;
}

export interface ConvoySightingPayload {
  region: string;
  /** Populated only when sightings become precise (late game) */
  sectorName: string | null;
  timestamp: number;
}

export interface CoordExchangeRequestedPayload {
  requesterId: string;
  requesterName: string;
  requesterCallsign: string;
}

export interface CoordExchangeCompletedPayload {
  withPlayerId: string;
  withPlayerName: string;
  shardType: CoordShardType;
  maskedValue: string;
}

export interface SystemMessagePayload {
  text: string;
  timestamp: number;
  /** If true, admin triggered this message */
  isAdminBroadcast: boolean;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface GameEndedPayload {
  winner: string | null;
  winnerFleetId: string | null;
  winnerFleetName: string | null;
  reason: "beacon_activated" | "time_expired" | "admin_ended";
  finalExploredSectorCount: number;
  finalFuelRemaining: number;
  finalShardCount: number;
}

export interface KickedPayload {
  message: string;
}

// -----------------------------------------------------------------------------
// Utility Types
// -----------------------------------------------------------------------------

/** Partial update applied on top of existing ClientGameState in the store */
export type GameStatePatch = Partial<ClientGameState>;

/** All faction IDs as a readonly array for iteration */
export const ALL_FACTION_IDS: readonly FactionID[] = [
  "science_collective",
  "traders_guild",
  "mining_consortium",
  "pirate_clans",
  "explorer_guild",
] as const;

/** All nav key types */
export const ALL_NAV_KEYS: readonly NavKey[] = [
  "alpha",
  "beta",
  "gamma",
] as const;

/** All coord shard types */
export const ALL_SHARD_TYPES: readonly CoordShardType[] = [
  "X",
  "Y",
  "Z",
  "sector_code",
] as const;

/** Default game config values */
export const DEFAULT_GAME_CONFIG: GameConfig = {
  maxPlayers: 100,
  gameDurationMs: 45 * 60 * 1000,         // 45 minutes
  tutorialDurationMs: 3 * 60 * 1000,       // 3 minutes
  fuelRegenPerTick: 0.5,                    // per 2s tick → ~15/min
  energyRegenPerTick: 0.4,
  healthRegenPerTick: 0.1,
  beaconMoveIntervalMs: 90 * 1000,          // 90 seconds
  sightingsBeginAt: 18 * 60 * 1000,         // 18 min after start
  convergenceRevealAt: 28 * 60 * 1000,      // 28 min after start
  baseFpRequirement: 500,
  piratesEnabled: true,
};
