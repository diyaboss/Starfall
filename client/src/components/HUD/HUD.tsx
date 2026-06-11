import React, { useEffect } from "react";
import {
  useGameStore,
  selectMyPlayer,
  selectPhase,
  selectBeacon,
  selectFleets,
  selectVisibleSectors,
} from "@/store/gameStore";
import { useConnectionStatus } from "@/hooks/useSocket";
import type { Notification } from "@/types/game";

// ---------------------------------------------------------------------------
// Stat bar
// ---------------------------------------------------------------------------

interface StatBarProps {
  label: string;
  icon: string;
  value: number;
  max?: number;
  color: string;
  warnBelow?: number;
}

function StatBar({ label, icon, value, max = 100, color, warnBelow = 20 }: StatBarProps): React.ReactElement {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const isLow = value < warnBelow;
  const displayColor = isLow ? "#ef4444" : color;

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 10,
          color: isLow ? "#ef4444" : "#64748b",
          marginBottom: 3,
          letterSpacing: "0.04em",
        }}
      >
        <span>
          {icon} {label}
        </span>
        <span style={{ color: isLow ? "#ef4444" : "#94a3b8", fontVariantNumeric: "tabular-nums" }}>
          {Math.round(value)}<span style={{ color: "#334155" }}>/100</span>
        </span>
      </div>
      <div
        style={{
          height: 5,
          background: "#0f172a",
          borderRadius: 3,
          overflow: "hidden",
          border: "1px solid #1e293b",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: displayColor,
            borderRadius: 3,
            transition: "width 0.4s ease, background 0.3s",
            boxShadow: isLow ? `0 0 6px ${displayColor}` : "none",
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
        background: "rgba(15,23,42,0.95)",
        border: `1px solid ${SEVERITY_COLORS[notification.severity]}44`,
        borderLeft: `3px solid ${SEVERITY_COLORS[notification.severity]}`,
        borderRadius: 6,
        padding: "9px 13px",
        fontSize: 12,
        color: "#e2e8f0",
        marginBottom: 6,
        cursor: "pointer",
        maxWidth: 300,
        fontFamily: "monospace",
        backdropFilter: "blur(4px)",
        lineHeight: 1.5,
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
  const color = colors[status] ?? "#64748b";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#475569" }}>
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
          boxShadow: status === "connected" ? `0 0 5px ${color}` : "none",
        }}
      />
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
    pre_hunt:    "Pre-hunt",
    convoy_hunt: "Convoy hunt",
    convergence: "Convergence",
    activated:   "Activated",
  };

  const phaseColor: Record<string, string> = {
    pre_hunt:    "#475569",
    convoy_hunt: "#3b82f6",
    convergence: "#f59e0b",
    activated:   "#a855f7",
  };

  const color = phaseColor[beacon.phase] ?? "#64748b";

  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 8,
        borderTop: "1px solid #1e293b",
      }}
    >
      <div style={{ fontSize: 9, color: "#334155", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
        Beacon
      </div>
      <div style={{ fontSize: 11, color }}>
        {phaseLabel[beacon.phase] ?? beacon.phase}
      </div>
      {beacon.convergenceSectorId && (
        <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 2 }}>
          ⟶ {beacon.convergenceSectorId}
        </div>
      )}
      {beacon.convoyCurrentSectorId && (
        <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 1 }}>
          Convoy: {beacon.convoyCurrentSectorId}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fleet strip
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
        marginTop: 10,
        paddingTop: 8,
        borderTop: "1px solid #1e293b",
      }}
    >
      <div style={{ fontSize: 9, color: "#334155", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>
        Fleet
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: fleet.hasBeaconCore ? "#a855f7" : "#e2e8f0", marginBottom: 4 }}>
        {fleet.name}
        {fleet.hasBeaconCore && <span style={{ marginLeft: 5, fontSize: 10 }}>★</span>}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#64748b", marginBottom: 3 }}>
        <span>{fleet.memberIds.length} pilots</span>
        <span>FP {fleet.fleetPower}</span>
        <span>{fleet.coordsAssembled}/4 coords</span>
      </div>
      {fleet.sharedNavKeys.length > 0 && (
        <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
          {fleet.sharedNavKeys.map((k) => (
            <span
              key={k}
              style={{
                background: "#1e293b",
                border: "1px solid #facc1555",
                borderRadius: 3,
                fontSize: 9,
                color: "#facc15",
                padding: "1px 6px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {k}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase badge (top right)
// ---------------------------------------------------------------------------

function PhaseBadge(): React.ReactElement {
  const phase = useGameStore(selectPhase);

  const phaseColor: Record<string, string> = {
    lobby:    "#475569",
    tutorial: "#3b82f6",
    active:   "#22c55e",
    ended:    "#ef4444",
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        background: "rgba(15,23,42,0.92)",
        border: "1px solid #1e293b",
        borderRadius: 6,
        padding: "5px 12px",
        fontFamily: "monospace",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: phaseColor[phase] ?? "#64748b",
          boxShadow: phase === "active" ? "0 0 6px #22c55e" : "none",
        }}
      />
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#94a3b8",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}
      >
        {phase}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main HUD
// ---------------------------------------------------------------------------

export function HUD(): React.ReactElement {
  const myPlayer = useGameStore(selectMyPlayer);
  const visibleSectors = useGameStore(selectVisibleSectors);
  const notifications = useGameStore((s) => s.notifications);
  const dismissNotification = useGameStore((s) => s.dismissNotification);

  // Resolve sector name from ID
  const currentSectorName = myPlayer?.sectorId
    ? (visibleSectors[myPlayer.sectorId]?.name ?? myPlayer.sectorId)
    : "—";

  return (
    <>
      {/* Top-left: player panel */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          width: 210,
          background: "rgba(9,16,32,0.93)",
          border: "1px solid #1e293b",
          borderRadius: 9,
          padding: "12px 14px",
          color: "#e2e8f0",
          fontFamily: "monospace",
          backdropFilter: "blur(6px)",
          boxShadow: "0 2px 16px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header: callsign + connection */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 10,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: myPlayer?.color ?? "#f1f5f9",
                letterSpacing: "0.04em",
                lineHeight: 1.2,
              }}
            >
              {myPlayer?.callsign ?? "—"}
            </div>
            <div style={{ fontSize: 9, color: "#334155", marginTop: 1 }}>
              {myPlayer?.username ?? ""}
            </div>
          </div>
          <ConnectionBadge />
        </div>

        {myPlayer ? (
          <>
            <StatBar label="Fuel"   icon="⛽" value={myPlayer.fuel}   color="#3b82f6" warnBelow={15} />
            <StatBar label="Health" icon="♥"  value={myPlayer.health} color="#22c55e" warnBelow={20} />
            <StatBar label="Energy" icon="⚡" value={myPlayer.energy} color="#a855f7" warnBelow={15} />

            {/* Sector + nav keys */}
            <div style={{ marginTop: 8, paddingTop: 7, borderTop: "1px solid #1e293b" }}>
              <div
                style={{
                  fontSize: 9,
                  color: "#334155",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Location
              </div>
              <div style={{ fontSize: 12, color: "#e2e8f0" }}>{currentSectorName}</div>

              {myPlayer.navKeys.length > 0 && (
                <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
                  {myPlayer.navKeys.map((k) => (
                    <span
                      key={k}
                      style={{
                        background: "#1e293b",
                        border: "1px solid #facc1555",
                        borderRadius: 3,
                        fontSize: 9,
                        color: "#facc15",
                        padding: "1px 6px",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      🔑 {k}
                    </span>
                  ))}
                </div>
              )}

              {myPlayer.isDead && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#ef4444",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}
                >
                  ✕ Eliminated
                </div>
              )}
            </div>

            <BeaconStatus />
            <FleetStrip />
          </>
        ) : (
          <div style={{ fontSize: 11, color: "#334155" }}>Awaiting snapshot…</div>
        )}
      </div>

      {/* Top-right: phase */}
      <PhaseBadge />

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
          zIndex: 20,
        }}
      >
        {notifications.map((n) => (
          <Toast key={n.id} notification={n} onDismiss={dismissNotification} />
        ))}
      </div>
    </>
  );
}