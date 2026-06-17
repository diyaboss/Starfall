import { create } from "zustand";
import type {
  ClientGameState,
  GamePhase,
  PublicPlayerInfo,
  PublicFleetInfo,
  Mission,
  ChatMessage,
  ClientBeaconState,
} from "@shared/types";
import type {
  PlayerMovedPayload,
  PlayerUpdatedPayload,
  BeaconMovedPayload,
  BeaconPhaseChangedPayload,
  GameEndedPayload,
  CoordExchangeRequestedPayload,
} from "@shared/types";
import type {
  ConnectionStatus,
  ModalId,
  Notification,
  SightingEntry,
  ActiveServiceContext,
  ActiveMissionContext,
  ActivePlayerContext,
} from "@/types/game";

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export interface GameStoreState {
  // Connection
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (status: ConnectionStatus) => void;

  // Identity
  myPlayerId: string | null;

  // Game state (null until snapshot received)
  gameState: ClientGameState | null;

  // Actions — snapshot & phase
  applySnapshot: (gs: ClientGameState, playerId: string) => void;
  setPhase: (phase: GamePhase) => void;
  setGameEnded: (payload: GameEndedPayload) => void;

  // Actions — players
  upsertPublicPlayer: (player: PublicPlayerInfo) => void;
  markPlayerDisconnected: (playerId: string) => void;
  applyPlayerMoved: (payload: PlayerMovedPayload) => void;
  applyPlayerDied: (playerId: string) => void;
  applyPlayerRevived: (playerId: string) => void;
  applyPlayerUpdated: (payload: PlayerUpdatedPayload) => void;

  // Actions — fleets
  upsertFleet: (fleet: PublicFleetInfo) => void;
  removeFleet: (fleetId: string) => void;

  // Actions — missions
  upsertMission: (mission: Mission) => void;
  removeMission: (missionId: string) => void;

  // Actions — beacon
  applyBeaconMoved: (payload: BeaconMovedPayload) => void;
  applyBeaconPhaseChanged: (payload: BeaconPhaseChangedPayload) => void;
  applySectorDiscovered: (payload: {
    sectorId: string;
    discoveredByPlayerId: string;
    sector: import("@shared/types").Sector;
  }) => void;

  // Actions — chat
  appendChatMessage: (msg: ChatMessage) => void;

  // Sightings log
  sightings: SightingEntry[];
  addSighting: (entry: SightingEntry) => void;

  // Notifications
  notifications: Notification[];
  addNotification: (n: Notification) => void;
  dismissNotification: (id: string) => void;

  // Coord exchange
  pendingExchange: CoordExchangeRequestedPayload | null;
  setPendingExchange: (payload: CoordExchangeRequestedPayload) => void;
  clearPendingExchange: () => void;

  // UI
  activeModal: ModalId;
  openModal: (id: ModalId) => void;
  closeModal: () => void;

  activeServiceCtx: ActiveServiceContext | null;
  setActiveServiceCtx: (ctx: ActiveServiceContext | null) => void;

  activeMissionCtx: ActiveMissionContext | null;
  setActiveMissionCtx: (ctx: ActiveMissionContext | null) => void;

  activePlayerCtx: ActivePlayerContext | null;
  setActivePlayerCtx: (ctx: ActivePlayerContext | null) => void;

  activeOverlayBanner: { text: string; subtext?: string } | null;
  setOverlayBanner: (banner: { text: string; subtext?: string } | null) => void;

  // Reset
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: Pick<
  GameStoreState,
  | "connectionStatus"
  | "myPlayerId"
  | "gameState"
  | "sightings"
  | "notifications"
  | "pendingExchange"
  | "activeModal"
  | "activeServiceCtx"
  | "activeMissionCtx"
  | "activePlayerCtx"
  | "activeOverlayBanner"
> = {
  connectionStatus: "disconnected",
  myPlayerId: null,
  gameState: null,
  sightings: [],
  notifications: [],
  pendingExchange: null,
  activeModal: null,
  activeServiceCtx: null,
  activeMissionCtx: null,
  activePlayerCtx: null,
  activeOverlayBanner: null,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useGameStore = create<GameStoreState>((set) => ({
  ...initialState,

  // ── Connection ────────────────────────────────────────────────────────────
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  // ── Snapshot ──────────────────────────────────────────────────────────────
  applySnapshot: (gs, playerId) =>{
    console.log("SNAPSHOT visibleSectors", Object.keys(gs.visibleSectors));
console.log("SNAPSHOT previewSectors", Object.keys(gs.previewSectors));
    
    
    set({ gameState: gs, myPlayerId: playerId })
},

  // ── Phase ─────────────────────────────────────────────────────────────────
  setPhase: (phase) =>
    set((s) => {
      if (!s.gameState) return {};
      return { gameState: { ...s.gameState, phase } };
    }),

  setGameEnded: (payload) =>
    set((s) => {
      if (!s.gameState) return {};
      return {
        gameState: {
          ...s.gameState,
          phase: "ended" as const,
          winner: payload.winner,
          winnerFleetId: payload.winnerFleetId,
          winnerFleetName: payload.winnerFleetName,
          finalExploredSectorCount: payload.finalExploredSectorCount,
          finalFuelRemaining: payload.finalFuelRemaining,
          finalShardCount: payload.finalShardCount,
          endedAt: Date.now(),
        },
      };
    }),

  // ── Players ───────────────────────────────────────────────────────────────
  upsertPublicPlayer: (player) =>
    set((s) => {
      if (!s.gameState) return {};
      return {
        gameState: {
          ...s.gameState,
          players: { ...s.gameState.players, [player.id]: player },
        },
      };
    }),

  markPlayerDisconnected: (playerId) =>
    set((s) => {
      if (!s.gameState) return {};
      const existing = s.gameState.players[playerId];
      if (!existing) return {};
      return {
        gameState: {
          ...s.gameState,
          players: {
            ...s.gameState.players,
            [playerId]: { ...existing, isConnected: false },
          },
        },
      };
    }),

  applyPlayerMoved: (payload) =>
    set((s) => {
      if (!s.gameState) return {};
      const existing = s.gameState.players[payload.playerId];
      const updatedPlayers = existing
        ? {
            ...s.gameState.players,
            [payload.playerId]: {
              ...existing,
              sectorId: payload.toSectorId,
            },
          }
        : s.gameState.players;

      // If this is our own player, update yourPlayer too
      const isOwn = payload.playerId === s.myPlayerId;
      const updatedYourPlayer =
        isOwn && s.gameState.yourPlayer
          ? {
              ...s.gameState.yourPlayer,
              sectorId: payload.toSectorId,
              fuel: payload.fuelRemaining,
            }
          : s.gameState.yourPlayer;

      return {
        gameState: {
          ...s.gameState,
          players: updatedPlayers,
          yourPlayer: updatedYourPlayer,
        },
      };
    }),

  applyPlayerDied: (playerId) =>
    set((s) => {
      if (!s.gameState) return {};
      const existing = s.gameState.players[playerId];
      if (!existing) return {};
      return {
        gameState: {
          ...s.gameState,
          players: {
            ...s.gameState.players,
            [playerId]: { ...existing, isDead: true },
          },
        },
      };
    }),

  applyPlayerRevived: (playerId) =>
    set((s) => {
      if (!s.gameState) return {};
      const existing = s.gameState.players[playerId];
      if (!existing) return {};
      return {
        gameState: {
          ...s.gameState,
          players: {
            ...s.gameState.players,
            [playerId]: { ...existing, isDead: false },
          },
        },
      };
    }),

  applyPlayerUpdated: (payload) =>
    set((s) => {
      if (!s.gameState) return {};
      const existing = s.gameState.players[payload.playerId];
      const updatedPublic = existing
        ? {
            ...s.gameState.players,
            [payload.playerId]: {
              ...existing,
              ...(payload.navKeys !== undefined && { navKeys: payload.navKeys }),
              ...(payload.fleetId !== undefined && { fleetId: payload.fleetId }),
              ...(payload.isDead !== undefined && { isDead: payload.isDead }),
            },
          }
        : s.gameState.players;

      const isOwn = payload.playerId === s.myPlayerId;
      const updatedYourPlayer =
        isOwn && s.gameState.yourPlayer
          ? {
              ...s.gameState.yourPlayer,
              ...(payload.fuel !== undefined && { fuel: payload.fuel }),
              ...(payload.health !== undefined && { health: payload.health }),
              ...(payload.energy !== undefined && { energy: payload.energy }),
              ...(payload.navKeys !== undefined && { navKeys: payload.navKeys }),
              ...(payload.fleetId !== undefined && { fleetId: payload.fleetId }),
              ...(payload.isDead !== undefined && { isDead: payload.isDead }),
            }
          : s.gameState.yourPlayer;

      return {
        gameState: {
          ...s.gameState,
          players: updatedPublic,
          yourPlayer: updatedYourPlayer,
        },
      };
    }),

  // ── Fleets ────────────────────────────────────────────────────────────────
  upsertFleet: (fleet) =>
    set((s) => {
      if (!s.gameState) return {};
      return {
        gameState: {
          ...s.gameState,
          fleets: { ...s.gameState.fleets, [fleet.id]: fleet },
        },
      };
    }),

  removeFleet: (fleetId) =>
    set((s) => {
      if (!s.gameState) return {};
      const { [fleetId]: _removed, ...rest } = s.gameState.fleets;
      return { gameState: { ...s.gameState, fleets: rest } };
    }),

  // ── Missions ─────────────────────────────────────────────────────────────
  upsertMission: (mission) =>
    set((s) => {
      if (!s.gameState) return {};
      return {
        gameState: {
          ...s.gameState,
          missions: { ...s.gameState.missions, [mission.id]: mission },
        },
      };
    }),

  removeMission: (missionId) =>
    set((s) => {
      if (!s.gameState) return {};
      const { [missionId]: _removed, ...rest } = s.gameState.missions;
      return { gameState: { ...s.gameState, missions: rest } };
    }),

  // ── Beacon ────────────────────────────────────────────────────────────────
  applyBeaconMoved: (payload) =>
    set((s) => {
      if (!s.gameState) return {};
      const beacon: ClientBeaconState = {
        ...s.gameState.beacon,
        convoyCurrentSectorId: payload.sectorId,
      };
      return { gameState: { ...s.gameState, beacon } };
    }),

  applyBeaconPhaseChanged: (payload) =>
    set((s) => {
      if (!s.gameState) return {};
      const beacon: ClientBeaconState = {
        ...s.gameState.beacon,
        phase: payload.phase,
        convergenceSectorId: payload.convergenceSectorId,
      };
      return { gameState: { ...s.gameState, beacon } };
    }),
    applySectorDiscovered: (payload) =>
        set((s) => {
          if (!s.gameState) return {};
      
          const nextPreviewSectors = { ...s.gameState.previewSectors };
          delete nextPreviewSectors[payload.sectorId];
      
          return {
            gameState: {
              ...s.gameState,
              visibleSectors: {
                ...s.gameState.visibleSectors,
                [payload.sectorId]: payload.sector,
              },
              previewSectors: nextPreviewSectors,
            },
          };
        }),

  // ── Chat ─────────────────────────────────────────────────────────────────
  appendChatMessage: (msg) =>
    set((s) => {
      if (!s.gameState) return {};
      return {
        gameState: {
          ...s.gameState,
          globalChatLog: [...s.gameState.globalChatLog, msg],
        },
      };
    }),

  // ── Sightings ─────────────────────────────────────────────────────────────
  addSighting: (entry) =>
    set((s) => ({ sightings: [entry, ...s.sightings].slice(0, 50) })),

  // ── Notifications ─────────────────────────────────────────────────────────
  addNotification: (n) =>
    set((s) => ({ notifications: [...s.notifications, n] })),

  dismissNotification: (id) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    })),

  // ── Exchange ──────────────────────────────────────────────────────────────
  setPendingExchange: (payload) => set({ pendingExchange: payload }),
  clearPendingExchange: () => set({ pendingExchange: null }),

  // ── UI ────────────────────────────────────────────────────────────────────
  openModal: (id) => set({ activeModal: id }),
  closeModal: () => set({ activeModal: null }),
  setActiveServiceCtx: (ctx) => set({ activeServiceCtx: ctx }),
  setActiveMissionCtx: (ctx) => set({ activeMissionCtx: ctx }),
  setActivePlayerCtx: (ctx) => set({ activePlayerCtx: ctx }),

  setOverlayBanner: (banner) => set({ activeOverlayBanner: banner }),

  // ── Reset ─────────────────────────────────────────────────────────────────
  reset: () => set({ ...initialState }),
}));

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectMyPlayer = (s: GameStoreState) =>
  s.gameState?.yourPlayer ?? null;

export const selectPhase = (s: GameStoreState) =>
  s.gameState?.phase ?? "lobby";

export const selectPlayers = (s: GameStoreState) =>
  s.gameState?.players ?? {};

export const selectFleets = (s: GameStoreState) =>
  s.gameState?.fleets ?? {};

export const selectMissions = (s: GameStoreState) =>
  s.gameState?.missions ?? {};

export const selectBeacon = (s: GameStoreState) =>
  s.gameState?.beacon ?? null;

export const selectConfig = (s: GameStoreState) =>
  s.gameState?.config ?? null;

export const selectVisibleSectors = (s: GameStoreState) =>
  s.gameState?.visibleSectors ?? {};

export const selectPreviewSectors = (s: GameStoreState) =>
  s.gameState?.previewSectors ?? {};