import React, { useState, useEffect, useRef } from "react";
import { useGameStore, selectMyPlayer, selectPlayers, selectPhase } from "@/store/gameStore";
import { useJoin, useEmit, useConnectionStatus } from "@/hooks/useSocket";
import type { JoinPayload } from "@shared/types";

// ---------------------------------------------------------------------------
// Animated star background
// ---------------------------------------------------------------------------

function StarField(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Generate stars once
    const stars = Array.from({ length: 160 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.4 + 0.3,
      a: Math.random() * 0.7 + 0.2,
      speed: Math.random() * 0.00008 + 0.00002,
      phase: Math.random() * Math.PI * 2,
    }));

    let frame = 0;
    let animId: number;

    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      const t = frame * 0.016;
      for (const s of stars) {
        const pulse = s.a * (0.6 + 0.4 * Math.sin(t * s.speed * 400 + s.phase));
        ctx.beginPath();
        ctx.arc(s.x * width, s.y * height, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(226,232,240,${pulse})`;
        ctx.fill();
      }
      frame++;
      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Join form
// ---------------------------------------------------------------------------

function JoinForm(): React.ReactElement {
  const join = useJoin();
  const connectionStatus = useConnectionStatus();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (connectionStatus === "connected") {
      inputRef.current?.focus();
    }
  }, [connectionStatus]);
  

  const handleSubmit = () => {
    const trimmed = username.trim();
    if (!trimmed) {
      setError("Enter a callsign to continue.");
      return;
    }
    if (trimmed.length < 2 || trimmed.length > 20) {
      setError("Callsign must be 2–20 characters.");
      return;
    }
    setError(null);
    const payload: JoinPayload =
      trimmed.toLowerCase() === "beaconcore"
        ? { username: trimmed, adminCode: "blackstar-omega-927" }
        : { username: trimmed };
    join(payload);
  };

  const disabled = connectionStatus !== "connected";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        width: 340,
      }}
    >
      <div
        style={{
          background: "rgba(15,23,42,0.85)",
          border: "1px solid #1e293b",
          borderRadius: 12,
          padding: "28px 28px 24px",
          backdropFilter: "blur(8px)",
        }}
      >
        <label
          htmlFor="username-input"
          style={{
            display: "block",
            fontSize: 11,
            color: "#64748b",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          Callsign
        </label>
        <input
          ref={inputRef}
          id="username-input"
          type="text"
          value={username}
          onChange={(e) => { setUsername(e.target.value); setError(null); }}
          onKeyDown={(e) => e.key === "Enter" && !disabled && handleSubmit()}
          maxLength={20}
          disabled={disabled}
          autoComplete="off"
          style={{
            width: "100%",
            background: "#0f172a",
            border: `1px solid ${error ? "#ef4444" : "#334155"}`,
            borderRadius: 7,
            padding: "11px 14px",
            color: "#f1f5f9",
            fontSize: 15,
            outline: "none",
            boxSizing: "border-box",
            fontFamily: "monospace",
            letterSpacing: "0.05em",
            transition: "border-color 0.15s",
          }}
          placeholder="e.g. Iron Falcon"
        />
        {error && (
          <div
            style={{
              fontSize: 11,
              color: "#ef4444",
              marginTop: 6,
              paddingLeft: 2,
            }}
          >
            {error}
          </div>
        )}

        <button
          id="join-btn"
          type="button"
          onClick={(e) => {
            e.preventDefault();
            
            handleSubmit();
          }}
          disabled={disabled}
          style={{
            marginTop: 14,
            width: "100%",
            background: disabled
              ? "#1e293b"
              : "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
            color: disabled ? "#475569" : "#ffffff",
            border: "none",
            borderRadius: 7,
            padding: "12px 20px",
            fontSize: 14,
            fontWeight: 700,
            fontFamily: "monospace",
            letterSpacing: "0.06em",
            cursor: disabled ? "not-allowed" : "pointer",
            transition: "opacity 0.15s",
            opacity: disabled ? 0.6 : 1,
          }}
        >
          {disabled ? "Connecting…" : "LAUNCH"}
        </button>
      </div>
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
        background: "rgba(15,23,42,0.8)",
        border: "1px solid #1e293b",
        borderRadius: 10,
        padding: "16px 20px",
        width: 340,
        maxHeight: 240,
        overflowY: "auto",
        backdropFilter: "blur(8px)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#475569",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        Pilots in lobby — {entries.length}
      </div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 12, color: "#334155", fontStyle: "italic" }}>
          No pilots yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {entries.map((p, i) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 0",
                borderBottom:
                  i < entries.length - 1 ? "1px solid #0f172a" : "none",
              }}
            >
              <div
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: p.isConnected ? p.color : "#334155",
                  flexShrink: 0,
                  boxShadow: p.isConnected ? `0 0 6px ${p.color}88` : "none",
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: "#e2e8f0",
                    fontFamily: "monospace",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {p.callsign}
                </div>
                <div style={{ fontSize: 10, color: "#475569" }}>{p.username}</div>
              </div>
              {!p.isConnected && (
                <div style={{ fontSize: 9, color: "#334155", letterSpacing: 1, textTransform: "uppercase" }}>
                  away
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin controls
// ---------------------------------------------------------------------------

function AdminControls(): React.ReactElement | null {
  const myPlayer = useGameStore(selectMyPlayer);
  const emit = useEmit();

  if (!myPlayer?.username || myPlayer.username.toLowerCase() !== "beaconcore") return null;

  return (
    <button
      onClick={() => emit("game:start")}
      style={{
        marginTop: 4,
        background: "linear-gradient(135deg, #16a34a, #22c55e)",
        color: "#fff",
        border: "none",
        borderRadius: 7,
        padding: "10px 24px",
        fontSize: 13,
        fontWeight: 700,
        fontFamily: "monospace",
        letterSpacing: "0.06em",
        cursor: "pointer",
      }}
    >
      ▶ START GAME
    </button>
  );
}

// ---------------------------------------------------------------------------
// LobbyScreen
// ---------------------------------------------------------------------------

export function LobbyScreen(): React.ReactElement {
  const myPlayer = useGameStore(selectMyPlayer);
  const phase = useGameStore(selectPhase);
  const connectionStatus = useConnectionStatus();

  const statusDot: Record<string, string> = {
    connected:    "#22c55e",
    connecting:   "#f59e0b",
    disconnected: "#ef4444",
    error:        "#ef4444",
  };

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#050d1a",
        color: "#e2e8f0",
        fontFamily: "monospace",
        gap: 24,
        padding: 24,
        overflow: "hidden",
      }}
    >
      <StarField />

      {/* Title */}
      <div style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.3em",
            color: "#3b82f6",
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          ✦ ✦ ✦
        </div>
        <h1
          style={{
            fontSize: 48,
            fontWeight: 900,
            letterSpacing: "0.18em",
            color: "#f1f5f9",
            margin: 0,
            textTransform: "uppercase",
            textShadow: "0 0 40px rgba(59,130,246,0.4)",
          }}
        >
          STARFALL
        </h1>
        <p style={{ fontSize: 12, color: "#475569", marginTop: 8, letterSpacing: "0.12em" }}>
          MULTIPLAYER SPACE EXPLORATION
        </p>
      </div>

      {/* Connection pill */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          background: "rgba(15,23,42,0.7)",
          border: "1px solid #1e293b",
          borderRadius: 20,
          padding: "5px 12px",
          fontSize: 11,
          color: "#64748b",
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: statusDot[connectionStatus] ?? "#64748b",
            boxShadow: connectionStatus === "connected" ? "0 0 6px #22c55e" : "none",
          }}
        />
        {connectionStatus}
      </div>

      {/* Main content */}
      <div style={{ position: "relative", zIndex: 1 }}>
        {!myPlayer ? (
          <JoinForm />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            {/* Joined card */}
            <div
              style={{
                background: "rgba(15,23,42,0.85)",
                border: `1px solid ${myPlayer.color}44`,
                borderLeft: `3px solid ${myPlayer.color}`,
                borderRadius: 10,
                padding: "18px 28px",
                textAlign: "center",
                backdropFilter: "blur(8px)",
                width: 340,
                boxSizing: "border-box",
              }}
            >
              <div style={{ fontSize: 10, color: "#475569", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                Pilot Identity
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: myPlayer.color,
                  letterSpacing: "0.05em",
                  textShadow: `0 0 20px ${myPlayer.color}66`,
                }}
              >
                {myPlayer.callsign}
              </div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>
                {myPlayer.username}
              </div>
            </div>

            {phase === "lobby" && (
              <div
                style={{
                  fontSize: 11,
                  color: "#334155",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Awaiting launch…
              </div>
            )}

            <AdminControls />
          </div>
        )}
      </div>

      {/* Player list */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <PlayerList />
      </div>

      {phase !== "lobby" && (
        <div
          style={{
            position: "relative",
            zIndex: 1,
            fontSize: 11,
            color: "#f59e0b",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Phase: {phase}
        </div>
      )}
    </div>
  );
}