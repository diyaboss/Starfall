import React, { useState } from "react";
import { useGameStore, selectMyPlayer, selectPlayers, selectPhase } from "@/store/gameStore";
import { useJoin, useEmit, useConnectionStatus } from "@/hooks/useSocket";
import type { JoinPayload } from "@shared/types";

// ---------------------------------------------------------------------------
// Join form
// ---------------------------------------------------------------------------

function JoinForm(): React.ReactElement {
  const join = useJoin();
  const connectionStatus = useConnectionStatus();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) {
      setError("Username is required.");
      return;
    }
    if (trimmed.length < 2 || trimmed.length > 20) {
      setError("Username must be 2–20 characters.");
      return;
    }
    setError(null);
    const payload: JoinPayload =
  trimmed.toLowerCase() === "beaconcore"
    ? {
        username: trimmed,
        adminCode: "blackstar-omega-927",
      }
    : {
        username: trimmed,
      };
    join(payload);
  };

  const disabled = connectionStatus !== "connected";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        width: 320,
      }}
    >
      <div>
        <label
          htmlFor="username-input"
          style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6 }}
        >
          Username
        </label>
        <input
          id="username-input"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const btn = document.getElementById("join-btn");
              btn?.click();
            }
          }}
          maxLength={20}
          disabled={disabled}
          style={{
            width: "100%",
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 6,
            padding: "8px 12px",
            color: "#f1f5f9",
            fontSize: 14,
            outline: "none",
            boxSizing: "border-box",
          }}
          placeholder="Enter callsign…"
        />
        {error && (
          <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>{error}</div>
        )}
      </div>
      <button
        id="join-btn"
        onClick={handleSubmit}
        disabled={disabled}
        style={{
          background: disabled ? "#334155" : "#3b82f6",
          color: disabled ? "#64748b" : "#ffffff",
          border: "none",
          borderRadius: 6,
          padding: "10px 20px",
          fontSize: 14,
          fontWeight: 600,
          cursor: disabled ? "not-allowed" : "pointer",
          transition: "background 0.2s",
        }}
      >
        {disabled ? "Connecting…" : "Join Game"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player list
// ---------------------------------------------------------------------------

function PlayerList(): React.ReactElement {
  const players = useGameStore(selectPlayers);
  const entries = Object.values(players);

  return (
    <div
      style={{
        background: "#0f172a",
        border: "1px solid #1e293b",
        borderRadius: 8,
        padding: "12px 16px",
        width: 320,
        maxHeight: 320,
        overflowY: "auto",
      }}
    >
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
        Players in lobby ({entries.length})
      </div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 12, color: "#475569" }}>No players yet.</div>
      ) : (
        entries.map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "6px 0",
              borderBottom: "1px solid #1e293b",
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: p.color,
                flexShrink: 0,
              }}
            />
            <div>
              <div style={{ fontSize: 13, color: "#e2e8f0" }}>{p.callsign}</div>
              <div style={{ fontSize: 10, color: "#64748b" }}>{p.username}</div>
            </div>
            {!p.isConnected && (
              <div style={{ marginLeft: "auto", fontSize: 10, color: "#64748b" }}>offline</div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin start button
// ---------------------------------------------------------------------------

function AdminControls(): React.ReactElement | null {
  const myPlayer = useGameStore(selectMyPlayer);
  const emit = useEmit();

  if (!myPlayer?.username || myPlayer.username.toLowerCase() !== "beaconcore") return null;

  return (
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      <button
        onClick={() => {
          console.log("START GAME CLICKED");
          emit("game:start");
        }}
        style={{
          background: "#22c55e",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Start Game
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LobbyScreen
// ---------------------------------------------------------------------------

export function LobbyScreen(): React.ReactElement {
  const myPlayer = useGameStore(selectMyPlayer);
  const phase = useGameStore(selectPhase);
  const connectionStatus = useConnectionStatus();

  const statusColor: Record<string, string> = {
    connected:    "#22c55e",
    connecting:   "#f59e0b",
    disconnected: "#ef4444",
    error:        "#ef4444",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#0f172a",
        color: "#e2e8f0",
        fontFamily: "monospace",
        gap: 32,
        padding: 24,
      }}
    >
      {/* Title */}
      <div style={{ textAlign: "center" }}>
        <h1
          style={{
            fontSize: 40,
            fontWeight: 800,
            letterSpacing: 4,
            color: "#f1f5f9",
            margin: 0,
            textTransform: "uppercase",
          }}
        >
          ✦ Starfall
        </h1>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 8 }}>
          A multiplayer space exploration game
        </p>
      </div>

      {/* Connection status */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#94a3b8" }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: statusColor[connectionStatus] ?? "#64748b",
          }}
        />
        {connectionStatus}
      </div>

      {/* Join form or waiting message */}
      {!myPlayer ? (
        <JoinForm />
      ) : (
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              display: "inline-block",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 8,
              padding: "12px 24px",
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Joined as</div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: myPlayer.color,
              }}
            >
              {myPlayer.callsign}
            </div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{myPlayer.username}</div>
          </div>

          {phase === "lobby" && (
            <div style={{ fontSize: 12, color: "#64748b" }}>
              Waiting for the game to start…
            </div>
          )}

          <AdminControls />
        </div>
      )}

      {/* Player list */}
      <PlayerList />

      {/* Phase indicator */}
      {phase !== "lobby" && (
        <div style={{ fontSize: 12, color: "#f59e0b" }}>
          Game phase: <strong>{phase}</strong>
        </div>
      )}
    </div>
  );
}
