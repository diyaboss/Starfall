import React, { useState, useCallback } from "react";
import {
  useGameStore,
  selectMyPlayer,
  selectPlayers,
  selectFleets,
} from "@/store/gameStore";
import { useEmit } from "@/hooks/useSocket";
import type { CoordShardType } from "@shared/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SHARD_LABELS: Record<CoordShardType, string> = {
  X:           "X Coordinate",
  Y:           "Y Coordinate",
  Z:           "Z Coordinate",
  sector_code: "Sector Code",
};

const SHARD_COLORS: Record<CoordShardType, string> = {
  X:           "#3b82f6",
  Y:           "#22c55e",
  Z:           "#f59e0b",
  sector_code: "#a855f7",
};

// ---------------------------------------------------------------------------
// Pending exchange banner
// ---------------------------------------------------------------------------

// Moved ExchangeBanner to HUD.tsx

// ---------------------------------------------------------------------------
// CoordinatePanel
// ---------------------------------------------------------------------------

export function CoordinatePanel(): React.ReactElement {
  const emit = useEmit();
  const myPlayer = useGameStore(selectMyPlayer);
  const players = useGameStore(selectPlayers);
  const fleets = useGameStore(selectFleets);
  

  // received trades live on the player's own shard.sharedWith → but the client
  // representation stores received trades separately on coordTrades (if present)
  // We pull them from gameState.yourPlayer.shard directly.
  const ownShard = useGameStore((s) => s.gameState?.yourPlayer?.shard ?? null);

  const [open, setOpen] = useState(false);
  const [requesting, setRequesting] = useState<string | null>(null);

  // Players in the same sector who haven't traded yet
  const nearbyPlayers = Object.values(players).filter(
    (p) =>
      p.sectorId === myPlayer?.sectorId &&
      p.id !== myPlayer?.id &&
      !p.isDead,
  );

  const handleRequest = useCallback(
    (targetPlayerId: string) => {
      setRequesting(targetPlayerId);
      emit("coord:exchangeRequest", { targetPlayerId });
      // Clear after short delay (server will respond)
      setTimeout(() => setRequesting(null), 5000);
    },
    [emit],
  );

  if (!myPlayer || !ownShard) return <></>;

  const shardColor = SHARD_COLORS[ownShard.type];

  return (
    <>
      {/* Toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          position: "absolute",
          top: 90,
          right: 12,
          background: "#0f172a",
          border: `1px solid ${shardColor}55`,
          borderRadius: 6,
          color: shardColor,
          fontSize: 11,
          padding: "4px 10px",
          cursor: "pointer",
          fontFamily: "monospace",
          zIndex: 10,
        }}
      >
        Coords ▾
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: 120,
            right: 12,
            width: 260,
            background: "rgba(15,23,42,0.97)",
            border: "1px solid #1e293b",
            borderRadius: 8,
            padding: "14px",
            fontFamily: "monospace",
            color: "#e2e8f0",
            zIndex: 50,
            backdropFilter: "blur(4px)",
          }}
        >

          {/* Own shard */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: "#475569", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
              Your Shard
            </div>
            <div
              style={{
                background: "#0f172a",
                border: `1px solid ${shardColor}66`,
                borderRadius: 6,
                padding: "10px 12px",
              }}
            >
              <div style={{ fontSize: 10, color: shardColor, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                {SHARD_LABELS[ownShard.type]}
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: "#f1f5f9",
                  letterSpacing: 2,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {ownShard.value}
              </div>
              <div style={{ fontSize: 10, color: "#475569", marginTop: 4 }}>
                Shared with {ownShard.sharedWith.length} pilot{ownShard.sharedWith.length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>

          {/* Received trades */}
          {ownShard.sharedWith.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: "#475569", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
                Shared With
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {ownShard.sharedWith.map((pid) => {
                  const p = players[pid];
                  return (
                    <div key={pid} style={{ fontSize: 11, color: "#64748b" }}>
                      {p ? (
                        <span style={{ color: p.color }}>{p.callsign}</span>
                      ) : (
                        <span>{pid.slice(0, 8)}…</span>
                      )}
                      <span style={{ color: "#334155" }}>
                        {" "}— masked value sent
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Beacon Progress */}
          {myPlayer.fleetId && fleets[myPlayer.fleetId] && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: "#475569", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
                Beacon Progress
              </div>
              <div style={{ fontSize: 11, color: fleets[myPlayer.fleetId].coordsAssembled === 4 ? "#22c55e" : "#e2e8f0", fontFamily: "monospace" }}>
                {fleets[myPlayer.fleetId].coordsAssembled} / 4 Coordinates Assembled
              </div>
            </div>
          )}

          {/* Nearby exchange */}
          <div>
            <div style={{ fontSize: 10, color: "#475569", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
              Nearby Pilots
            </div>
            {nearbyPlayers.length === 0 ? (
              <div style={{ fontSize: 11, color: "#334155" }}>
                No other pilots in this sector.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {nearbyPlayers.map((p) => {
                  const isRequesting = requesting === p.id;
                  const alreadyShared = ownShard.sharedWith.includes(p.id);
                  return (
                    <div
                      key={p.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: "#0f172a",
                        border: "1px solid #1e293b",
                        borderRadius: 5,
                        padding: "7px 10px",
                      }}
                    >
                      <div>
                        <span style={{ fontSize: 12, color: p.color }}>{p.callsign}</span>
                        <span style={{ fontSize: 10, color: "#475569", marginLeft: 6 }}>
                          {SHARD_LABELS[p.shardType]}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRequest(p.id)}
                        disabled={isRequesting || alreadyShared}
                        style={{
                          background: "transparent",
                          border: `1px solid ${alreadyShared ? "#22c55e" : "#334155"}`,
                          borderRadius: 4,
                          color: alreadyShared ? "#22c55e" : isRequesting ? "#64748b" : "#94a3b8",
                          fontSize: 10,
                          padding: "3px 8px",
                          cursor: isRequesting || alreadyShared ? "default" : "pointer",
                          fontFamily: "monospace",
                        }}
                      >
                        {alreadyShared ? "Traded" : isRequesting ? "Sent…" : "Trade"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
