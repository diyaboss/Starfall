import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  useGameStore,
  selectMyPlayer,
  selectPhase,
  selectPlayers,
  selectFleets,
} from "@/store/gameStore";
import { useEmit } from "@/hooks/useSocket";
import { GalaxyMap } from "@/components/GalaxyMap/GalaxyMap";
import { HUD } from "@/components/HUD/HUD";
import type { ChatMessage, ChatChannel } from "@shared/types";

// ---------------------------------------------------------------------------
// Chat panel
// ---------------------------------------------------------------------------

const CHANNEL_COLORS: Record<string, string> = {
  global: "#64748b",
  fleet:  "#3b82f6",
  local:  "#22c55e",
  system: "#f59e0b",
  admin:  "#ef4444",
};

function ChatPanel(): React.ReactElement {
  const messages = useGameStore((s) => s.gameState?.globalChatLog ?? []);
  const myPlayer = useGameStore(selectMyPlayer);
  const emit = useEmit();
  const [text, setText] = useState("");
  const [channel, setChannel] = useState<ChatChannel>("global");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || !myPlayer) return;
    emit("chat:send", { channel, text: trimmed });
    setText("");
  }, [text, channel, emit, myPlayer]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#070f1e",
        borderLeft: "1px solid #0f172a",
        fontFamily: "monospace",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid #0f172a",
          fontSize: 10,
          color: "#334155",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "#334155",
          }}
        />
        Comms
      </div>

      {/* Message list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "10px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 5,
        }}
      >
        {messages.length === 0 && (
          <div style={{ fontSize: 11, color: "#1e293b", fontStyle: "italic", marginTop: 8 }}>
            No messages yet.
          </div>
        )}
        {messages.map((msg: ChatMessage) => (
          <div key={msg.id} style={{ fontSize: 11, lineHeight: 1.55 }}>
            <span
              style={{
                color: CHANNEL_COLORS[msg.channel] ?? "#475569",
                marginRight: 5,
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              [{msg.channel}]
            </span>
            <span
              style={{
                color: msg.senderColor,
                fontWeight: 700,
              }}
            >
              {msg.senderCallsign}
            </span>
            <span style={{ color: "#334155" }}>: </span>
            <span style={{ color: "#94a3b8" }}>{msg.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        style={{
          padding: "8px 10px",
          borderTop: "1px solid #0f172a",
          display: "flex",
          gap: 5,
          flexShrink: 0,
          background: "#050d1a",
        }}
      >
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as ChatChannel)}
          style={{
            background: "#0f172a",
            border: "1px solid #1e293b",
            borderRadius: 5,
            color: CHANNEL_COLORS[channel] ?? "#64748b",
            fontSize: 10,
            padding: "5px 4px",
            fontFamily: "monospace",
            cursor: "pointer",
          }}
        >
          <option value="global">GLB</option>
          {myPlayer?.fleetId && <option value="fleet">FLT</option>}
          <option value="local">LCL</option>
        </select>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          maxLength={200}
          placeholder="Transmit…"
          style={{
            flex: 1,
            background: "#0f172a",
            border: "1px solid #1e293b",
            borderRadius: 5,
            color: "#e2e8f0",
            fontSize: 11,
            padding: "5px 8px",
            outline: "none",
            fontFamily: "monospace",
          }}
        />
        <button
          onClick={handleSend}
          style={{
            background: "#1e3a5f",
            border: "1px solid #2563eb44",
            borderRadius: 5,
            color: "#60a5fa",
            fontSize: 10,
            padding: "5px 10px",
            cursor: "pointer",
            fontFamily: "monospace",
            fontWeight: 700,
            letterSpacing: "0.04em",
          }}
        >
          ▶
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scoreboard footer
// ---------------------------------------------------------------------------

function ScoreboardPanel(): React.ReactElement {
  const fleets = useGameStore(selectFleets);
  const players = useGameStore(selectPlayers);
  const entries = Object.values(fleets).sort((a, b) => b.fleetPower - a.fleetPower);
  const soloCount = Object.values(players).filter((p) => !p.fleetId && !p.isDead).length;

  return (
    <div
      style={{
        background: "#050d1a",
        borderTop: "1px solid #0f172a",
        padding: "7px 16px",
        fontFamily: "monospace",
        fontSize: 11,
        color: "#334155",
        display: "flex",
        alignItems: "center",
        gap: 4,
        flexShrink: 0,
        minHeight: 36,
        overflowX: "auto",
      }}
    >
      <span
        style={{
          fontSize: 9,
          color: "#1e293b",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginRight: 8,
          flexShrink: 0,
        }}
      >
        Standings
      </span>

      {entries.length === 0 && soloCount === 0 ? (
        <span style={{ fontSize: 10, color: "#1e293b" }}>No fleets yet.</span>
      ) : (
        <>
          {entries.map((fleet, i) => (
            <React.Fragment key={fleet.id}>
              {i > 0 && (
                <span style={{ color: "#1e293b", margin: "0 6px" }}>·</span>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {fleet.hasBeaconCore && (
                  <span style={{ fontSize: 10, color: "#a855f7" }}>★</span>
                )}
                <span
                  style={{
                    fontWeight: 700,
                    color: fleet.hasBeaconCore ? "#a855f7" : "#475569",
                  }}
                >
                  {fleet.name}
                </span>
                <span style={{ fontSize: 10, color: "#1e293b" }}>
                  FP {fleet.fleetPower}
                </span>
                <span style={{ fontSize: 9, color: "#1e293b" }}>
                  {fleet.memberIds.length}p
                </span>
              </div>
            </React.Fragment>
          ))}

          {soloCount > 0 && (
            <>
              {entries.length > 0 && (
                <span style={{ color: "#1e293b", margin: "0 6px" }}>·</span>
              )}
              <span style={{ fontSize: 10, color: "#1e293b" }}>
                {soloCount} solo
              </span>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Game-over overlay
// ---------------------------------------------------------------------------

function GameOverOverlay(): React.ReactElement | null {
  const phase = useGameStore(selectPhase);
  const gameState = useGameStore((s) => s.gameState);

  if (phase !== "ended" || !gameState) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        fontFamily: "monospace",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          background: "#070f1e",
          border: "1px solid #1e293b",
          borderRadius: 14,
          padding: "48px 64px",
          textAlign: "center",
          color: "#f1f5f9",
          boxShadow: "0 0 60px rgba(0,0,0,0.8)",
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.2em",
            color: "#334155",
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          Mission Complete
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 900,
            letterSpacing: "0.08em",
            marginBottom: 20,
            color: "#f1f5f9",
          }}
        >
          GAME OVER
        </div>
        {gameState.winner ? (
          <>
            <div style={{ fontSize: 12, color: "#475569", marginBottom: 8, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Winner
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 800,
                color: "#22c55e",
                textShadow: "0 0 30px #22c55e66",
              }}
            >
              {gameState.winner}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 14, color: "#334155" }}>No winner — time expired.</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GameScreen
// ---------------------------------------------------------------------------

export function GameScreen(): React.ReactElement {
  const myPlayer = useGameStore(selectMyPlayer);
  const [showChat, setShowChat] = useState(true);

  if (!myPlayer) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#050d1a",
          color: "#334155",
          fontFamily: "monospace",
          fontSize: 13,
          letterSpacing: "0.06em",
        }}
      >
        Loading game state…
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#050d1a",
        overflow: "hidden",
      }}
    >
      {/* Main content row */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
        {/* Map area */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <GalaxyMap />
          <HUD />
          <GameOverOverlay />

          {/* Chat toggle */}
          <button
            onClick={() => setShowChat((v) => !v)}
            style={{
              position: "absolute",
              bottom: 12,
              left: 12,
              background: "rgba(9,16,32,0.85)",
              border: "1px solid #1e293b",
              borderRadius: 6,
              color: "#334155",
              fontSize: 10,
              padding: "5px 10px",
              cursor: "pointer",
              zIndex: 10,
              fontFamily: "monospace",
              letterSpacing: "0.06em",
              backdropFilter: "blur(4px)",
            }}
          >
            {showChat ? "HIDE COMMS" : "SHOW COMMS"}
          </button>
        </div>

        {/* Chat panel */}
        {showChat && (
          <div style={{ width: 260, flexShrink: 0 }}>
            <ChatPanel />
          </div>
        )}
      </div>

      {/* Scoreboard footer */}
      <ScoreboardPanel />
    </div>
  );
}