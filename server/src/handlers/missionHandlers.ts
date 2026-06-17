import type { Server, Socket } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import {
  gameState,
  playerIdFromSocket,
} from "../state/GameState";
import type {
  Mission,
  MissionType,
  MissionReward,
} from "@shared/types";

// ---------------------------------------------------------------------------
// Mission Generation
// ---------------------------------------------------------------------------

const MAX_ACTIVE_MISSIONS = 5;

const ALLOWED_MISSION_TYPES: MissionType[] = [
  "sector_survey",
  "relay_signal",
  "first_contact",
];

function getRandomSectorId(): string {
  const sectorIds = Object.keys(gameState.sectors);
  return sectorIds[Math.floor(Math.random() * sectorIds.length)] ?? "0,0,0";
}

export function spawnMissionsIfNeeded(io: Server): void {
  // Clear expired missions
  const now = Date.now();
  for (const mission of Object.values(gameState.missions)) {
    if (mission.status === "available" && mission.expiresAt && now > mission.expiresAt) {
      mission.status = "expired";
      io.to("global").emit("mission:expired", { missionId: mission.id });
      delete gameState.missions[mission.id];
    }
  }

  // Count active + available
  const activeCount = Object.values(gameState.missions).filter(
    (m) => m.status === "active" || m.status === "available"
  ).length;

  const toSpawn = MAX_ACTIVE_MISSIONS - activeCount;
  if (toSpawn <= 0) return;

  for (let i = 0; i < toSpawn; i++) {
    const type = ALLOWED_MISSION_TYPES[Math.floor(Math.random() * ALLOWED_MISSION_TYPES.length)] ?? "sector_survey";
    const sectorId = getRandomSectorId();
    const id = uuidv4();

    let title = "";
    let description = "";
    let reward: MissionReward = {};

    if (type === "sector_survey") {
      title = "Sector Survey";
      description = "Travel to target sector and conduct a survey.";
      reward = { fuel: 20, energy: 15 };
    } else if (type === "relay_signal") {
      title = "Relay Signal";
      description = "Travel to destination and activate relay.";
      reward = { energy: 30, coordDecode: true }; // coordDecode maps to 'Beacon hint' conceptually
    } else if (type === "first_contact") {
      title = "First Contact";
      description = "Reach designated sector to establish contact.";
      reward = { energy: 40, fleetPower: 10 }; // Using fleetPower as 'Discovery bonus' placeholder since we don't have a strict Discovery Bonus stat. Wait, let's just use energy and health.
    }

    const mission: Mission = {
      id,
      type,
      title,
      description,
      sectorId, // This is where the mission can be accepted initially
      requiredNavKey: null,
      minFleetMembers: 1,
      requiresCrossFleet: false,
      reward,
      fleetPowerReward: type === "first_contact" ? 50 : 0, // representing discovery bonus
      status: "available",
      assignedPlayerId: null,
      assignedFleetId: null,
      expiresAt: Date.now() + 1000 * 60 * 10, // 10 minutes to accept
      totalSteps: 1,
      currentStep: 0,
    };

    gameState.missions[id] = mission;
    io.to("global").emit("mission:updated", { mission });
  }
}

// ---------------------------------------------------------------------------
// Mission Completion Auto-Trigger
// ---------------------------------------------------------------------------

export function checkAutoCompletion(io: Server, playerId: string, newSectorId: string): void {
  const player = gameState.players[playerId];
  if (!player || !player.activeMissionId) return;

  const mission = gameState.missions[player.activeMissionId];
  if (!mission || mission.status !== "active") return;

  if (mission.sectorId === newSectorId) {
    completeMission(io, playerId, mission.id);
  }
}

function completeMission(io: Server, playerId: string, missionId: string) {
  const player = gameState.players[playerId];
  const mission = gameState.missions[missionId];
  if (!player || !mission) return;

  mission.currentStep = mission.totalSteps;
  mission.status = "completed";

  // Grant rewards
  if (mission.reward.fuel) player.fuel = Math.min(100, player.fuel + mission.reward.fuel);
  if (mission.reward.energy) player.energy = Math.min(100, player.energy + mission.reward.energy);
  if (mission.reward.health) player.health = Math.min(100, player.health + mission.reward.health);
  
  // Fake progress
  if (mission.reward.coordDecode && player.fleetId) {
    const fleet = gameState.fleets[player.fleetId];
    if (fleet) {
      // Just flag that they got a hint, maybe give some energy since we can't do shards.
      player.energy = Math.min(100, player.energy + 20);
    }
  }

  const socketId = Object.keys(io.sockets.sockets).find(
    (sid) => playerIdFromSocket(sid) === playerId
  ) || player.id;

  io.to(socketId).emit("player:updated", {
    playerId,
    fuel: player.fuel,
    energy: player.energy,
    health: player.health,
  });

  io.to("global").emit("mission:updated", { mission });

  // Clear player's active mission
  player.activeMissionId = null;

  // Respawn
  spawnMissionsIfNeeded(io);
}

// ---------------------------------------------------------------------------
// Socket Handlers
// ---------------------------------------------------------------------------

export function registerMissionHandlers(io: Server, socket: Socket): void {
  socket.on("mission:accept", (payload) => {
    const playerId = playerIdFromSocket(socket.id);
    if (!playerId) return;

    const player = gameState.players[playerId];
    const mission = gameState.missions[payload.missionId];

    if (!player || !mission) return;
    if (mission.status !== "available") {
      socket.emit("error:action", { code: "INVALID_MISSION", message: "Mission is no longer available." });
      return;
    }
    if (player.activeMissionId) {
      socket.emit("error:action", { code: "ALREADY_ACTIVE", message: "You already have an active mission." });
      return;
    }
    if (mission.sectorId !== player.sectorId) {
      socket.emit("error:action", { code: "WRONG_SECTOR", message: "You must be in the mission sector to accept it." });
      return;
    }

    // Accept it
    player.activeMissionId = mission.id;
    mission.status = "active";
    mission.assignedPlayerId = player.id;
    mission.assignedFleetId = player.fleetId;
    mission.expiresAt = null; // No longer expires once accepted

    // Dynamic routing: change sectorId to a new destination
    mission.sectorId = getRandomSectorId();
    mission.description = `Travel to ${gameState.sectors[mission.sectorId]?.name || "Unknown Sector"} to complete your objective.`;

    io.to("global").emit("mission:updated", { mission });
  });

  socket.on("mission:step", (payload) => {
    const playerId = playerIdFromSocket(socket.id);
    if (!playerId) return;

    const player = gameState.players[playerId];
    const mission = gameState.missions[payload.missionId];

    if (!player || !mission || mission.assignedPlayerId !== playerId) return;
    if (mission.status !== "active") return;

    if (mission.sectorId !== player.sectorId) {
      socket.emit("error:action", { code: "WRONG_SECTOR", message: "You are not at the mission destination." });
      return;
    }

    // Complete it (fallback for auto-completion)
    completeMission(io, playerId, mission.id);
  });
}
