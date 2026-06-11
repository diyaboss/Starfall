import React, { useState, useCallback } from "react";
import {
  useGameStore,
  selectMyPlayer,
  selectMissions,
} from "@/store/gameStore";
import { useEmit } from "@/hooks/useSocket";
import type { Mission, MissionStatus } from "@shared/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<MissionStatus, string> = {
  available:  "#94a3b8",
  active:     "#3b82f6",
  completed:  "#22c55e",
  failed:     "#ef4444",
  expired:    "#475569",
};

const STATUS_LABELS: Record<MissionStatus, string> = {
  available: "Available",
  active:    "Active",
  completed: "Complete",
  failed:    "Failed",
  expired:   "Expired",
};

function formatReward(mission: Mission): string {
  const r = mission.reward;
  const parts: string[] = [];
  if (r.fuel)        parts.push(`+${r.fuel} Fuel`);
  if (r.health)      parts.push(`+${r.health} HP`);
  if (r.energy)      parts.push(`+${r.energy} Energy`);
  if (r.navKey)      parts.push(`Nav Key (${r.navKey})`);
  if (r.coordDecode) parts.push("Coord Decode");
  if (mission.fleetPowerReward) parts.push(`+${mission.fleetPowerReward} FP`);
  return parts.length > 0 ? parts.join(", ") : "—";
}

function timeLeft(expiresAt: number | null): string | null {
  if (!expiresAt) return null;
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return "Expired";
  const s = Math.floor(remaining / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

// ---------------------------------------------------------------------------
// Mission card
// ---------------------------------------------------------------------------

interface MissionCardProps {
  mission: Mission;
  isOwn: boolean;
  canAccept: boolean;
  canAdvance: boolean;
  onAccept: (id: string) => void;
  onAdvance: (id: string) => void;
}

function MissionCard({
  mission,
  isOwn,
  canAccept,
  canAdvance,
  onAccept,
  onAdvance,
}: MissionCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const remaining = timeLeft(mission.expiresAt);

  const borderColor =
    mission.status === "active" && isOwn
      ? "#3b82f6"
      : STATUS_COLORS[mission.status];

  return (
    <div
      style={{
        background: "#0f172a",
        border: `1px solid ${borderColor}44`,
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: 6,
        padding: "10px 12px",
        marginBottom: 8,
        cursor: "pointer",
      }}
      onClick={() => setExpanded((v) => !v)}
    >
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, paddingRight: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#f1f5f9", lineHeight: 1.4 }}>
            {mission.title}
          </div>
          <div style={{ fontSize: 10, color: STATUS_COLORS[mission.status], marginTop: 2 }}>
            {STATUS_LABELS[mission.status]}
            {remaining && (
              <span style={{ marginLeft: 8, color: "#f59e0b" }}>{remaining}</span>
            )}
          </div>
        </div>
        <span style={{ fontSize: 10, color: "#475569" }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.6, marginBottom: 8 }}>
            {mission.description}
          </div>

          {/* Requirements */}
          {(mission.requiredNavKey || mission.minFleetMembers > 1 || mission.requiresCrossFleet) && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                Requirements
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {mission.requiredNavKey && (
                  <div style={{ fontSize: 11, color: "#facc15" }}>
                    Nav Key: {mission.requiredNavKey}
                  </div>
                )}
                {mission.minFleetMembers > 1 && (
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>
                    Fleet members: {mission.minFleetMembers}+
                  </div>
                )}
                {mission.requiresCrossFleet && (
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>
                    Requires cross-fleet cooperation
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Progress bar for active missions */}
          {mission.status === "active" && mission.totalSteps > 1 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#64748b", marginBottom: 3 }}>
                <span>Progress</span>
                <span>{mission.currentStep}/{mission.totalSteps}</span>
              </div>
              <div style={{ height: 4, background: "#1e293b", borderRadius: 2, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${(mission.currentStep / mission.totalSteps) * 100}%`,
                    background: "#3b82f6",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            </div>
          )}

          {/* Reward */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>
              Reward
            </div>
            <div style={{ fontSize: 11, color: "#22c55e" }}>{formatReward(mission)}</div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8 }} onClick={(e) => e.stopPropagation()}>
            {canAccept && (
              <button
                onClick={() => onAccept(mission.id)}
                style={{
                  background: "#3b82f6",
                  border: "none",
                  borderRadius: 5,
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "6px 14px",
                  cursor: "pointer",
                  fontFamily: "monospace",
                }}
              >
                Accept
              </button>
            )}
            {canAdvance && (
              <button
                onClick={() => onAdvance(mission.id)}
                style={{
                  background: "#1e293b",
                  border: "1px solid #3b82f6",
                  borderRadius: 5,
                  color: "#60a5fa",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "6px 14px",
                  cursor: "pointer",
                  fontFamily: "monospace",
                }}
              >
                Advance Step
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MissionPanel
// ---------------------------------------------------------------------------

export function MissionPanel(): React.ReactElement {
  const emit = useEmit();
  const myPlayer = useGameStore(selectMyPlayer);
  const missions = useGameStore(selectMissions);

  const [open, setOpen] = useState(false);

  const handleAccept = useCallback(
    (missionId: string) => {
      emit("mission:accept", { missionId });
    },
    [emit],
  );

  const handleAdvance = useCallback(
    (missionId: string) => {
      emit("mission:step", { missionId });
    },
    [emit],
  );

  if (!myPlayer) return <></>;

  const currentSectorId = myPlayer.sectorId;
  const activeMissionId = myPlayer.activeMissionId;

  // Sector missions (available in current sector)
  const sectorMissions = Object.values(missions).filter(
    (m) =>
      m.sectorId === currentSectorId &&
      (m.status === "available" || m.assignedPlayerId === myPlayer.id),
  );

  // Active mission (may be in another sector)
  const activeMission =
    activeMissionId && missions[activeMissionId]
      ? missions[activeMissionId]
      : null;

  // Combine: active mission first (if not already in sector list), then sector list
  const displayList: Mission[] = [];
  if (activeMission && !sectorMissions.find((m) => m.id === activeMission.id)) {
    displayList.push(activeMission);
  }
  displayList.push(...sectorMissions);

  const missionCount = sectorMissions.filter((m) => m.status === "available").length;

  return (
    <>
      {/* Toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          position: "absolute",
          top: 124,
          right: 12,
          background: activeMission ? "#1e293b" : "#0f172a",
          border: `1px solid ${activeMission ? "#3b82f6" : "#334155"}`,
          borderRadius: 6,
          color: activeMission ? "#60a5fa" : "#94a3b8",
          fontSize: 11,
          padding: "4px 10px",
          cursor: "pointer",
          fontFamily: "monospace",
          zIndex: 10,
        }}
      >
        Missions{missionCount > 0 ? ` (${missionCount})` : ""} ▾
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: 154,
            right: 12,
            width: 280,
            background: "rgba(15,23,42,0.97)",
            border: "1px solid #1e293b",
            borderRadius: 8,
            padding: "12px",
            fontFamily: "monospace",
            color: "#e2e8f0",
            zIndex: 50,
            backdropFilter: "blur(4px)",
            maxHeight: 420,
            overflowY: "auto",
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "#475569",
              letterSpacing: 1,
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            {activeMission ? "Active & Nearby Missions" : "Missions in This Sector"}
          </div>

          {displayList.length === 0 ? (
            <div style={{ fontSize: 11, color: "#334155", padding: "4px 0" }}>
              No missions available here.
            </div>
          ) : (
            displayList.map((mission) => {
              const isOwn = mission.assignedPlayerId === myPlayer.id;
              const canAccept =
                mission.status === "available" &&
                !activeMissionId &&
                mission.sectorId === currentSectorId;
              const canAdvance =
                isOwn &&
                mission.status === "active" &&
                mission.sectorId === currentSectorId &&
                mission.currentStep < mission.totalSteps;

              return (
                <MissionCard
                  key={mission.id}
                  mission={mission}
                  isOwn={isOwn}
                  canAccept={canAccept}
                  canAdvance={canAdvance}
                  onAccept={handleAccept}
                  onAdvance={handleAdvance}
                />
              );
            })
          )}
        </div>
      )}
    </>
  );
}
