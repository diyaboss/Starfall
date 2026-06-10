import React, { useEffect } from "react";
import {
  useGameStore,
  selectMyPlayer,
  selectPhase,
  selectBeacon,
  selectFleets,
} from "@/store/gameStore";
import { useConnectionStatus } from "@/hooks/useSocket";
import type { Notification } from "@/types/game";

// ---------------------------------------------------------------------------
// Stat bar
// ---------------------------------------------------------------------------

interface StatBarProps {
  label: string;
  value: number;
  max?: number;
  color: string;
}

function StatBar({ label, value, max = 100, color }: StatBarProps): React.ReactElement {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>
        <span>{label}</span>
        <span>{Math.round(value)}/{max}</span>
      </div>
      <div style={{ height: 6, background: "#1e293b", borderRadius: 3, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: color,
            borderRadius: 3,
            transition: "width 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notification toast
// ---------------------------------------------------------------------------

interface ToastProps {
  notification: Notification;
  onDismiss: (id: string) => void;
}

const SEVERITY_COLORS: Record<Notification["severity"], string> = {
  info:    "#3b82f6",
  success: "#22c55e",
  warning: "#f59e0b",
  error:   "#ef4444",
};

function Toast({ notification, onDismiss }: ToastProps): React.ReactElement {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(notification.id), notification.ttlMs ?? 6000);
    return () => clearTimeout(timer);
  }, [notification, onDismiss]);

  return (
    <div
      style={{
        background: "#1e293b",
        border: `1px solid ${SEVERITY_COLORS[notification.severity]}`,
        borderLeft: `4px solid ${SEVERITY_COLORS[notification.severity]}`,
        borderRadius: 6,
        padding: "8px 12px",
        fontSize: 12,
        color: "#e2e8f0",
        marginBottom: 6,
        cursor: "pointer",
        maxWidth: 320,
      }}
      onClick={() => onDismiss(notification.id)}
      role="alert"
    >
      {notification.text}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connection badge
// ---------------------------------------------------------------------------

function ConnectionBadge(): React.ReactElement {
  const status = useConnectionStatus();
  const colors: Record<string, string> = {
    connected:    "#22c55e",
    connecting:   "#f59e0b",
    disconnected: "#ef4444",
    error:        "#ef4444",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#94a3b8" }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: colors[status] ?? "#64748b" }} />
      {status}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Beacon status
// ---------------------------------------------------------------------------

function BeaconStatus(): React.ReactElement | null {
  const beacon = useGameStore(selectBeacon);
  if (!beacon) return null;

  const phaseLabel: Record<string, string> = {
    pre_hunt:     "Pre-hunt",
    convoy_hunt:  "Convoy hunt",
    convergence:  "Convergence!",
    activated:    "Activated",
  };

  return (
    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
      <span style={{ color: "#a855f7" }}>Beacon: </span>
      {phaseLabel[beacon.phase] ?? beacon.phase}
      {beacon.convergenceSectorId && (
        <span style={{ color: "#f59e0b", marginLeft: 6 }}>
          → {beacon.convergenceSectorId}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fleet info strip
// ---------------------------------------------------------------------------

function FleetStrip(): React.ReactElement | null {
  const myPlayer = useGameStore(selectMyPlayer);
  const fleets = useGameStore(selectFleets);

  if (!myPlayer?.fleetId) return null;
  const fleet = fleets[myPlayer.fleetId];
  if (!fleet) return null;

  return (
    <div
      style={{
        background: "#1e293b",
        borderRadius: 6,
        padding: "6px 10px",
        fontSize: 11,
        color: "#cbd5e1",
        marginTop: 6,
      }}
    >
      <div style={{ color: "#94a3b8", marginBottom: 2 }}>Fleet</div>
      <div style={{ fontWeight: 600, color: "#e2e8f0" }}>{fleet.name}</div>
      <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
        <span>Members: {fleet.memberIds.length}</span>
        <span>FP: {fleet.fleetPower}</span>
        <span>Coords: {fleet.coordsAssembled}/4</span>
      </div>
      {fleet.sharedNavKeys.length > 0 && (
        <div style={{ marginTop: 4 }}>
          Keys: {fleet.sharedNavKeys.join(", ")}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main HUD
// ---------------------------------------------------------------------------

export function HUD(): React.ReactElement {
  const myPlayer = useGameStore(selectMyPlayer);
  const phase = useGameStore(selectPhase);
  const notifications = useGameStore((s) => s.notifications);
  const dismissNotification = useGameStore((s) => s.dismissNotification);

  const panelStyle: React.CSSProperties = {
    background: "rgba(15,23,42,0.92)",
    border: "1px solid #1e293b",
    borderRadius: 8,
    padding: "10px 12px",
    color: "#e2e8f0",
    fontFamily: "monospace",
    backdropFilter: "blur(4px)",
  };

  return (
    <>
      {/* Top-left: player stats */}
      <div style={{ position: "absolute", top: 12, left: 12, width: 200, ...panelStyle }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>
              {myPlayer?.callsign ?? "—"}
            </div>
            <div style={{ fontSize: 10, color: "#64748b" }}>
              {myPlayer?.username ?? ""}
            </div>
          </div>
          <ConnectionBadge />
        </div>

        {myPlayer ? (
          <>
            <StatBar label="Fuel"   value={myPlayer.fuel}   color="#3b82f6" />
            <StatBar label="Health" value={myPlayer.health} color="#22c55e" />
            <StatBar label="Energy" value={myPlayer.energy} color="#a855f7" />

            <div style={{ marginTop: 6, fontSize: 11, color: "#94a3b8" }}>
              <div>Sector: <span style={{ color: "#e2e8f0" }}>{myPlayer.sectorId}</span></div>
              {myPlayer.navKeys.length > 0 && (
                <div>Nav keys: <span style={{ color: "#facc15" }}>{myPlayer.navKeys.join(", ")}</span></div>
              )}
              {myPlayer.isDead && (
                <div style={{ color: "#ef4444", marginTop: 4, fontWeight: 600 }}>ELIMINATED</div>
              )}
            </div>

            <BeaconStatus />
            <FleetStrip />
          </>
        ) : (
          <div style={{ fontSize: 11, color: "#64748b" }}>Waiting for snapshot…</div>
        )}
      </div>

      {/* Top-right: phase badge */}
      <div style={{ position: "absolute", top: 12, right: 12, ...panelStyle, padding: "6px 12px" }}>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>Phase: </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9", textTransform: "uppercase" }}>
          {phase}
        </span>
      </div>

      {/* Bottom-right: notifications */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          right: 12,
          display: "flex",
          flexDirection: "column-reverse",
          maxHeight: "40vh",
          overflow: "hidden",
        }}
      >
        {notifications.map((n) => (
          <Toast key={n.id} notification={n} onDismiss={dismissNotification} />
        ))}
      </div>
    </>
  );
}
