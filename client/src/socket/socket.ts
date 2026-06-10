import { io, type Socket } from "socket.io-client";
import type {
  JoinPayload,
  MovePayload,
  CollectNavKeyPayload,
  FleetCreatePayload,
  FleetJoinPayload,
  FleetShareKeyPayload,
  MissionAcceptPayload,
  MissionStepPayload,
  ChatSendPayload,
  UseServicePayload,
  CoordExchangeRequestPayload,
  CoordExchangeResponsePayload,
  BeaconActivatePayload,
  AdminKickPayload,
  AdminBroadcastPayload,
  AdminAdjustPlayerPayload,
  AdminTriggerSightingPayload,
  AdminRevealConvergencePayload,
  StateSnapshotPayload,
  PlayerMovedPayload,
  PlayerJoinedPayload,
  PlayerDisconnectedPayload,
  PlayerDiedPayload,
  PlayerRevivedPayload,
  PlayerUpdatedPayload,
  FleetCreatedPayload,
  FleetUpdatedPayload,
  FleetDisbandedPayload,
  MissionUpdatedPayload,
  MissionExpiredPayload,
  BeaconMovedPayload,
  BeaconPhaseChangedPayload,
  BeaconActivatedPayload,
  ConvoySightingPayload,
  CoordExchangeRequestedPayload,
  CoordExchangeCompletedPayload,
  SystemMessagePayload,
  GameEndedPayload,
  KickedPayload,
  ErrorPayload,
  ChatMessage,
  GamePhase,
} from "@shared/types";

export interface ServerToClientEvents {
  "game:stateSnapshot": (payload: StateSnapshotPayload) => void;
  "game:phaseChanged": (payload: { phase: GamePhase }) => void;
  "game:ended": (payload: GameEndedPayload) => void;

  "player:joined": (payload: PlayerJoinedPayload) => void;
  "player:disconnected": (payload: PlayerDisconnectedPayload) => void;
  "player:moved": (payload: PlayerMovedPayload) => void;
  "player:died": (payload: PlayerDiedPayload) => void;
  "player:revived": (payload: PlayerRevivedPayload) => void;
  "player:updated": (payload: PlayerUpdatedPayload) => void;
  "player:kicked": (payload: KickedPayload) => void;

  "fleet:created": (payload: FleetCreatedPayload) => void;
  "fleet:updated": (payload: FleetUpdatedPayload) => void;
  "fleet:disbanded": (payload: FleetDisbandedPayload) => void;
  "fleet:chatHistory": (payload: { fleetId: string; messages: ChatMessage[] }) => void;

  "mission:updated": (payload: MissionUpdatedPayload) => void;
  "mission:expired": (payload: MissionExpiredPayload) => void;

  "beacon:moved": (payload: BeaconMovedPayload) => void;
  "beacon:phaseChanged": (payload: BeaconPhaseChangedPayload) => void;
  "beacon:activated": (payload: BeaconActivatedPayload) => void;
  "convoy:sighting": (payload: ConvoySightingPayload) => void;

  "coord:exchangeRequested": (payload: CoordExchangeRequestedPayload) => void;
  "coord:exchangeCompleted": (payload: CoordExchangeCompletedPayload) => void;
  "coord:exchangeRejected": (payload: {
    targetPlayerId: string;
    targetCallsign: string;
  }) => void;

  "chat:message": (payload: ChatMessage) => void;
  "chat:system": (payload: SystemMessagePayload) => void;

  "map:sectorDiscovered": (payload: {
    sectorId: string;
    discoveredByPlayerId: string;
    sector: unknown;
  }) => void;

  "map:sectorKeyCollected": (payload: {
    sectorId: string;
    navKeyPresent: null;
  }) => void;

  "error:action": (payload: ErrorPayload) => void;
}

export interface ClientToServerEvents {
  "player:join": (payload: JoinPayload) => void;
  "player:reconnect": (payload: { playerId: string }) => void;
  "player:move": (payload: MovePayload) => void;

  "nav:collectKey": (payload: CollectNavKeyPayload) => void;

  "chat:send": (payload: ChatSendPayload) => void;

  "fleet:create": (payload: FleetCreatePayload) => void;
  "fleet:join": (payload: FleetJoinPayload) => void;
  "fleet:leave": () => void;
  "fleet:shareKey": (payload: FleetShareKeyPayload) => void;

  "mission:accept": (payload: MissionAcceptPayload) => void;
  "mission:step": (payload: MissionStepPayload) => void;

  "service:use": (payload: UseServicePayload) => void;

  "coord:exchangeRequest": (payload: CoordExchangeRequestPayload) => void;
  "coord:exchangeResponse": (payload: CoordExchangeResponsePayload) => void;

  "beacon:activate": (payload: BeaconActivatePayload) => void;

  "game:start": () => void;
  "admin:endGame": () => void;
  "admin:resetGame": () => void;
  "admin:kick": (payload: AdminKickPayload) => void;
  "admin:broadcast": (payload: AdminBroadcastPayload) => void;
  "admin:adjustPlayer": (payload: AdminAdjustPlayerPayload) => void;
  "admin:triggerSighting": (payload: AdminTriggerSightingPayload) => void;
  "admin:revealConvergence": (payload: AdminRevealConvergencePayload) => void;
}

export type StarfallSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: StarfallSocket | null = null;

export function getSocket(): StarfallSocket {
  if (!socket) {
    const serverUrl =
      import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

    socket = io(serverUrl, {
      autoConnect: false,
      withCredentials: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      timeout: 10_000,
    });
  }

  return socket;
}

export function connectSocket(): void {
  getSocket().connect();
}

export function disconnectSocket(): void {
  getSocket().disconnect();
}