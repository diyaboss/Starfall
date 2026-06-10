import type {
  ClientGameState,
  GamePhase,
  Player,
  PublicPlayerInfo,
  PublicFleetInfo,
  Mission,
  NPCService,
  PublicConvoyInfo,
  ClientBeaconState,
  ChatMessage,
  GameConfig,
  Sector,
  SectorPreview,
} from "@shared/types";

// ---------------------------------------------------------------------------
// Connection state
// ---------------------------------------------------------------------------

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

// ---------------------------------------------------------------------------
// Join form data (client-only)
// ---------------------------------------------------------------------------

export interface JoinFormData {
  username: string;
  adminCode: string;
}

// ---------------------------------------------------------------------------
// UI overlay / modal identifiers
// ---------------------------------------------------------------------------

export type ModalId =
  | "join"
  | "fleet"
  | "mission"
  | "service"
  | "shard_exchange"
  | "player_info"
  | "admin"
  | "game_over"
  | null;

// ---------------------------------------------------------------------------
// Active service / mission context held by UI
// ---------------------------------------------------------------------------

export interface ActiveServiceContext {
  serviceId: string;
  sectorId: string;
}

export interface ActiveMissionContext {
  missionId: string;
}

export interface ActivePlayerContext {
  playerId: string;
}

// ---------------------------------------------------------------------------
// Notification / toast (client-only)
// ---------------------------------------------------------------------------

export type NotificationSeverity = "info" | "success" | "warning" | "error";

export interface Notification {
  id: string;
  text: string;
  severity: NotificationSeverity;
  timestamp: number;
  /** Auto-dismiss after this many ms. Undefined = persistent. */
  ttlMs?: number;
}

// ---------------------------------------------------------------------------
// Convoy sighting log entry (client-only)
// ---------------------------------------------------------------------------

export interface SightingEntry {
  id: string;
  region: string;
  sectorName: string | null;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Re-export frequently used shared types for convenience
// ---------------------------------------------------------------------------

export type {
  ClientGameState,
  GamePhase,
  Player,
  PublicPlayerInfo,
  PublicFleetInfo,
  Mission,
  NPCService,
  PublicConvoyInfo,
  ClientBeaconState,
  ChatMessage,
  GameConfig,
  Sector,
  SectorPreview,
};