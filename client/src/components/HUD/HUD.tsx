import React, { useEffect } from "react";
import {
  useGameStore,
  selectMyPlayer,
  selectPhase,
  selectBeacon,
  selectPlayers,
  selectFleets,
  selectVisibleSectors,
} from "@/store/gameStore";
import { useEmit, useConnectionStatus } from "@/hooks/useSocket";
import { useState, useCallback } from "react";
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
    <div style={{ marginBottom: 6 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 9,
          color: isLow ? "#ef4444" : "#94a3b8",
          marginBottom: 2,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        <span>
          <span style={{ opacity: 0.7, marginRight: 2 }}>{icon}</span> {label}
        </span>
        <span style={{ color: isLow ? "#ef4444" : "#cbd5e1", fontWeight: 600 }}>
          {Math.round(value)}
        </span>
      </div>
      <div
        style={{
          height: 4,
          background: "rgba(15,23,42,0.8)",
          borderRadius: 2,
          overflow: "hidden",
          border: "1px solid #1e293b",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: displayColor,
            transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            boxShadow: isLow ? `0 0 8px ${displayColor}` : "none",
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

// ---------------------------------------------------------------------------
// Objective Panel
// ---------------------------------------------------------------------------

function ObjectivePanel(): React.ReactElement | null {
  const phase = useGameStore(selectPhase);
  const beacon = useGameStore(selectBeacon);
  const myPlayer = useGameStore(selectMyPlayer);
  const fleets = useGameStore(selectFleets);
  const visibleSectors = useGameStore(selectVisibleSectors);

  if (!myPlayer) return null;

  const fleet = myPlayer.fleetId ? fleets[myPlayer.fleetId] : null;
  const currentSectorName = visibleSectors[myPlayer.sectorId]?.name ?? myPlayer.sectorId;

  const phaseColor: Record<string, string> = {
    lobby:    "#475569",
    tutorial: "#3b82f6",
    active:   "#22c55e",
    ended:    "#ef4444",
  };

  const beaconPhaseLabel: Record<string, string> = {
    pre_hunt:    "Pre-hunt",
    convoy_hunt: "Convoy hunt",
    convergence: "Convergence",
    activated:   "Activated",
  };

  const beaconPhaseColor: Record<string, string> = {
    pre_hunt:    "#475569",
    convoy_hunt: "#3b82f6",
    convergence: "#f59e0b",
    activated:   "#a855f7",
  };

  let primaryObjective = "Explore. Click a connected sector to jump.";
  if (beacon?.phase === "convergence" || beacon?.phase === "activated") {
    primaryObjective = `Race to ${beacon.convergenceSectorId}! First fleet to arrive wins.`;
  } else if (beacon?.phase === "convoy_hunt") {
    primaryObjective = "Intercept the convoy to retrieve the Beacon Core.";
  } else if (phase === "tutorial") {
    primaryObjective = "Familiarize yourself with ship systems.";
  } else if (phase === "active") {
    if (!fleet) {
      primaryObjective = "Form a fleet or meet players to exchange coordinate shards.";
    } else if (fleet.coordsAssembled < 4) {
      primaryObjective = "Collect more coordinate shards. Exchange with other players.";
    } else {
      primaryObjective = "All shards assembled! Waiting for convergence signal...";
    }
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        width: 240,
        background: "rgba(9,16,32,0.85)",
        border: "1px solid #1e293b",
        borderRadius: 8,
        padding: "12px 14px",
        color: "#e2e8f0",
        fontFamily: "monospace",
        backdropFilter: "blur(6px)",
        boxShadow: "0 2px 16px rgba(0,0,0,0.5)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Current Phase */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>Game Phase</span>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: phaseColor[phase] ?? "#64748b", boxShadow: phase === "active" ? "0 0 6px #22c55e" : "none" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#f1f5f9", textTransform: "uppercase" }}>{phase}</span>
        </div>
      </div>

      {/* Primary Objective */}
      <div>
        <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>Objective</div>
        <div style={{ fontSize: 11, color: "#3b82f6", lineHeight: 1.3 }}>{primaryObjective}</div>
      </div>

      <div style={{ borderTop: "1px dashed #1e293b", margin: "2px 0" }} />

      {/* Beacon Status */}
      {beacon && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>Beacon</span>
            <span style={{ fontSize: 10, color: beaconPhaseColor[beacon.phase] ?? "#64748b", fontWeight: 600 }}>{beaconPhaseLabel[beacon.phase] ?? beacon.phase}</span>
          </div>
          {beacon.convergenceSectorId && (
            <div style={{ fontSize: 10, color: "#f59e0b", textAlign: "right" }}>
              Target: {beacon.convergenceSectorId}
            </div>
          )}
        </div>
      )}

      {/* Fleet Status */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>Fleet</span>
          <span style={{ fontSize: 10, color: fleet ? (fleet.hasBeaconCore ? "#a855f7" : "#e2e8f0") : "#475569", fontWeight: 600 }}>
            {fleet ? fleet.name : "None"}
            {fleet?.hasBeaconCore && <span style={{ marginLeft: 4 }}>★</span>}
          </span>
        </div>
        {fleet && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#94a3b8" }}>
            <span>{fleet.memberIds.length} pilots</span>
            <span>{fleet.coordsAssembled}/4 coords</span>
          </div>
        )}
      </div>

      <div style={{ borderTop: "1px dashed #1e293b", margin: "2px 0" }} />

      {/* Current Location */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>Location</span>
        <span style={{ fontSize: 11, color: "#cbd5e1", fontWeight: 700 }}>{currentSectorName}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nearby Players
// ---------------------------------------------------------------------------

function NearbyPlayersPanel(): React.ReactElement | null {
  const myPlayer = useGameStore(selectMyPlayer);
  const players = useGameStore(selectPlayers);
  const fleets = useGameStore(selectFleets);
  const emit = useEmit();
  const [requesting, setRequesting] = useState<string | null>(null);

  if (!myPlayer || myPlayer.isDead) return null;

  const myFleet = myPlayer.fleetId ? fleets[myPlayer.fleetId] : null;

  const nearbyPlayers = Object.values(players).filter(
    (p) =>
      p.sectorId === myPlayer.sectorId &&
      p.id !== myPlayer.id &&
      !p.isDead
  );

  if (nearbyPlayers.length === 0) return null;

  const handleRequest = (targetId: string) => {
    setRequesting(targetId);
    emit("coord:exchangeRequest", { targetPlayerId: targetId });
    setTimeout(() => setRequesting(null), 5000);
  };

  return (
    <div
      style={{
        marginTop: 12,
        paddingTop: 12,
        borderTop: "1px dashed #1e293b",
      }}
    >
      <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
        Players in Sector
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {nearbyPlayers.map((p) => {
          const isSameFleet = myFleet?.memberIds.includes(p.id);
          const hasTraded = false;

          return (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: p.color }} />
                <span style={{ fontSize: 11, color: "#e2e8f0" }}>{p.callsign}</span>
              </div>
              {!isSameFleet && !hasTraded && (
                <button
                  onClick={() => handleRequest(p.id)}
                  disabled={requesting === p.id}
                  style={{
                    background: requesting === p.id ? "#334155" : "transparent",
                    border: `1px solid ${requesting === p.id ? "#475569" : "#3b82f6"}`,
                    color: requesting === p.id ? "#94a3b8" : "#3b82f6",
                    borderRadius: 4,
                    fontSize: 9,
                    padding: "2px 6px",
                    cursor: requesting === p.id ? "not-allowed" : "pointer",
                    textTransform: "uppercase",
                  }}
                >
                  {requesting === p.id ? "Sent..." : "Exchange"}
                </button>
              )}
              {isSameFleet && (
                <span style={{ fontSize: 9, color: "#22c55e", textTransform: "uppercase" }}>Fleet</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exchange Banner
// ---------------------------------------------------------------------------

function ExchangeBanner(): React.ReactElement | null {
  const emit = useEmit();
  const pending = useGameStore((s) => s.pendingExchange);
  const clearPendingExchange = useGameStore((s) => s.clearPendingExchange);

  const handleAccept = useCallback(() => {
    if (!pending) return;
    emit("coord:exchangeResponse", { requesterId: pending.requesterId, accepted: true });
    clearPendingExchange();
  }, [emit, pending, clearPendingExchange]);

  const handleDecline = useCallback(() => {
    if (!pending) return;
    emit("coord:exchangeResponse", { requesterId: pending.requesterId, accepted: false });
    clearPendingExchange();
  }, [emit, pending, clearPendingExchange]);

  if (!pending) return null;

  return (
    <div
      style={{
        background: "rgba(15,23,42,0.95)",
        border: "1px solid #f59e0b",
        borderLeft: "3px solid #f59e0b",
        borderRadius: 6,
        padding: "12px 14px",
        marginBottom: 12,
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div style={{ fontSize: 11, color: "#f59e0b", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>
        Exchange Request
      </div>
      <div style={{ fontSize: 12, color: "#e2e8f0", marginBottom: 10 }}>
        <span style={{ color: "#94a3b8" }}>From: </span>
        <strong style={{ color: "#f8fafc" }}>{pending.requesterCallsign}</strong>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleAccept}
          style={{
            flex: 1,
            background: "#22c55e",
            border: "none",
            borderRadius: 5,
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            padding: "6px 0",
            cursor: "pointer",
            fontFamily: "monospace",
          }}
        >
          ACCEPT
        </button>
        <button
          onClick={handleDecline}
          style={{
            flex: 1,
            background: "transparent",
            border: "1px solid #334155",
            borderRadius: 5,
            color: "#94a3b8",
            fontSize: 11,
            padding: "6px 0",
            cursor: "pointer",
            fontFamily: "monospace",
          }}
        >
          DECLINE
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin Status Panel
// ---------------------------------------------------------------------------

function AdminStatusPanel(): React.ReactElement | null {
  const myPlayer = useGameStore(selectMyPlayer);
  const players = useGameStore(selectPlayers);
  const fleets = useGameStore(selectFleets);
  const phase = useGameStore(selectPhase);
  const beacon = useGameStore(selectBeacon);

  if (!myPlayer?.isAdmin) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 232, // Next to player panel
        background: "rgba(15,23,42,0.85)",
        border: "1px solid #3b82f6",
        borderTop: "3px solid #3b82f6",
        borderRadius: 8,
        padding: "12px 16px",
        fontFamily: "monospace",
        color: "#e2e8f0",
        backdropFilter: "blur(4px)",
        boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ fontSize: 10, color: "#3b82f6", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, fontWeight: 700 }}>
        [Admin Spectator]
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: 11 }}>
        <div style={{ color: "#94a3b8" }}>Players:</div>
        <div style={{ textAlign: "right" }}>{Object.keys(players).length}</div>
        
        <div style={{ color: "#94a3b8" }}>Fleets:</div>
        <div style={{ textAlign: "right" }}>{Object.keys(fleets).length}</div>
        
        <div style={{ color: "#94a3b8" }}>Game Phase:</div>
        <div style={{ textAlign: "right" }}>{phase}</div>
        
        <div style={{ color: "#94a3b8" }}>Beacon:</div>
        <div style={{ textAlign: "right" }}>{beacon?.phase ?? "—"}</div>
        
        <div style={{ color: "#94a3b8" }}>Convergence:</div>
        <div style={{ textAlign: "right", color: beacon?.convergenceSectorId ? "#f59e0b" : "#e2e8f0" }}>
          {beacon?.convergenceSectorId ?? "Hidden"}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase badge (top right)
// ---------------------------------------------------------------------------

// Removed PhaseBadge in favor of ObjectivePanel

// ---------------------------------------------------------------------------
// Overlay Banner (Convergence & Countdown)
// ---------------------------------------------------------------------------

function OverlayBanner(): React.ReactElement | null {
  const banner = useGameStore((s) => s.activeOverlayBanner);
  if (!banner) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: "15%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        background: "rgba(15,23,42,0.95)",
        border: "1px solid #f59e0b",
        borderTop: "4px solid #f59e0b",
        borderRadius: 8,
        padding: "24px 48px",
        textAlign: "center",
        zIndex: 50,
        boxShadow: "0 10px 40px rgba(245, 158, 11, 0.2)",
        animation: "pulse-banner 2s infinite alternate",
      }}
    >
      <style>
        {`
          @keyframes pulse-banner {
            from { box-shadow: 0 10px 40px rgba(245, 158, 11, 0.2); }
            to { box-shadow: 0 10px 40px rgba(245, 158, 11, 0.5); }
          }
        `}
      </style>
      <div
        style={{
          color: "#f59e0b",
          fontSize: 28,
          fontWeight: 900,
          letterSpacing: "0.15em",
          marginBottom: banner.subtext ? 12 : 0,
        }}
      >
        {banner.text}
      </div>
      {banner.subtext && (
        <div
          style={{
            color: "#f1f5f9",
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          {banner.subtext}
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
  const notifications = useGameStore((s) => s.notifications);
  const dismissNotification = useGameStore((s) => s.dismissNotification);



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

            {myPlayer.navKeys.length > 0 && (
              <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid #1e293b" }}>
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
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: "1px solid #1e293b",
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
          </>
        ) : (
          <div style={{ fontSize: 11, color: "#334155" }}>Awaiting snapshot…</div>
        )}
        
        <NearbyPlayersPanel />
      </div>

      <AdminStatusPanel />

      <ObjectivePanel />

      {/* Bottom-right: notifications and exchanges */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          right: 12,
          display: "flex",
          flexDirection: "column-reverse",
          maxHeight: "60vh",
          overflow: "hidden",
          zIndex: 20,
        }}
      >
        {notifications.map((n) => (
          <Toast key={n.id} notification={n} onDismiss={dismissNotification} />
        ))}
        <ExchangeBanner />
      </div>

      <OverlayBanner />
    </>
  );
}