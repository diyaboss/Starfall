import React, { useCallback, useRef, useState } from "react";
import { useGameStore, selectMyPlayer, selectPhase, selectPlayers, selectFleets } from "@/store/gameStore";
import { useEmit } from "@/hooks/useSocket";
import { GalaxyMap } from "@/components/GalaxyMap/GalaxyMap";
import { HUD } from "@/components/HUD/HUD";
import type { ChatMessage, ChatChannel } from "@shared/types";

// ---------------------------------------------------------------------------
// Chat panel
// ---------------------------------------------------------------------------

function ChatPanel(): React.ReactElement {
  const messages = useGameStore((s) => s.gameState?.globalChatLog ?? []);
  const myPlayer = useGameStore(selectMyPlayer);
  const emit = useEmit();
  const [text, setText] = useState("");
  const [channel, setChannel] = useState<ChatChannel>("global");
  const bottomRef = useRef<HTMLDivElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || !myPlayer) return;
    emit("chat:send", { channel, text: trimmed });
    setText("");
  }, [text, channel, emit, myPlayer]);

  const channelColor: Record<string, string> = {
    global: "#94a3b8",
    fleet:  "#3b82f6",
    local:  "#22c55e",
    system: "#f59e0b",
    admin:  "#ef4444",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#0f172a",
        borderLeft: "1px solid #1e293b",
        fontFamily: "monospace",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid #1e293b",
          fontSize: 12,
          color: "#64748b",
          flexShrink: 0,
        }}
      >
        Chat
      </div>

      {/* Message list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {messages.map((msg: ChatMessage) => (
          <div key={msg.id} style={{ fontSize: 11, lineHeight: 1.5 }}>
            <span
              style={{
                color: channelColor[msg.channel] ?? "#64748b",
                marginRight: 6,
                fontSize: 9,
                textTransform: "uppercase",
              }}
            >
              [{msg.channel}]
            </span>
            <span style={{ color: msg.senderColor, fontWeight: 600 }}>
              {msg.senderCallsign}
            </span>
            <span style={{ color: "#64748b" }}>: </span>
            <span style={{ color: "#cbd5e1" }}>{msg.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        style={{
          padding: "8px 12px",
          borderTop: "1px solid #1e293b",
          display: "flex",
          gap: 6,
          flexShrink: 0,
        }}
      >
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as ChatChannel)}
          style={{
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 4,
            color: "#94a3b8",
            fontSize: 11,
            padding: "4px 6px",
          }}
        >
          <option value="global">Global</option>
          {myPlayer?.fleetId && <option value="fleet">Fleet</option>}
          <option value="local">Local</option>
        </select>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          maxLength={200}
          placeholder="Send message…"
          style={{
            flex: 1,
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 4,
            color: "#f1f5f9",
            fontSize: 11,
            padding: "4px 8px",
            outline: "none",
          }}
        />
        <button
          onClick={handleSend}
          style={{
            background: "#3b82f6",
            border: "none",
            borderRadius: 4,
            color: "#fff",
            fontSize: 11,
            padding: "4px 10px",
            cursor: "pointer",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scoreboard panel
// ---------------------------------------------------------------------------

function ScoreboardPanel(): React.ReactElement {
  const fleets = useGameStore(selectFleets);
  const players = useGameStore(selectPlayers);
  const entries = Object.values(fleets).sort((a, b) => b.fleetPower - a.fleetPower);
  const soloPlayers = Object.values(players).filter((p) => !p.fleetId && !p.isDead);

  return (
    <div
      style={{
        background: "#0f172a",
        borderTop: "1px solid #1e293b",
        padding: "8px 12px",
        fontFamily: "monospace",
        fontSize: 11,
        color: "#94a3b8",
      }}
    >
      <div style={{ marginBottom: 6, color: "#64748b" }}>Leaderboard</div>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {entries.map((fleet) => (
          <div key={fleet.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ color: fleet.hasBeaconCore ? "#a855f7" : "#e2e8f0", fontWeight: 600 }}>
              {fleet.name}
            </span>
            <span style={{ color: "#64748b" }}>FP: {fleet.fleetPower}</span>
            <span style={{ color: "#64748b" }}>({fleet.memberIds.length})</span>
            {fleet.hasBeaconCore && <span style={{ color: "#a855f7" }}>★</span>}
          </div>
        ))}
        {soloPlayers.length > 0 && (
          <div style={{ color: "#475569" }}>
            +{soloPlayers.length} solo
          </div>
        )}
      </div>
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
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        fontFamily: "monospace",
      }}
    >
      <div
        style={{
          background: "#0f172a",
          border: "1px solid #334155",
          borderRadius: 12,
          padding: "40px 60px",
          textAlign: "center",
          color: "#f1f5f9",
        }}
      >
        <div style={{ fontSize: 32, fontWeight: 800, marginBottom: 12 }}>Game Over</div>
        {gameState.winner ? (
          <>
            <div style={{ fontSize: 16, color: "#94a3b8", marginBottom: 8 }}>Winner</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#22c55e" }}>
              {gameState.winner}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 14, color: "#64748b" }}>No winner — time expired.</div>
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
          background: "#0f172a",
          color: "#94a3b8",
          fontFamily: "monospace",
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
        background: "#0f172a",
        overflow: "hidden",
      }}
    >
      {/* Main content row */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Map area */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <GalaxyMap />
          <HUD />
          <GameOverOverlay />

          {/* Chat toggle button */}
          <button
            onClick={() => setShowChat((v) => !v)}
            style={{
              position: "absolute",
              bottom: 12,
              left: 12,
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 6,
              color: "#94a3b8",
              fontSize: 11,
              padding: "4px 10px",
              cursor: "pointer",
              zIndex: 10,
            }}
          >
            {showChat ? "Hide Chat" : "Show Chat"}
          </button>
        </div>

        {/* Chat panel */}
        {showChat && (
          <div style={{ width: 280, flexShrink: 0 }}>
            <ChatPanel />
          </div>
        )}
      </div>

      {/* Scoreboard footer */}
      <ScoreboardPanel />
    </div>
  );
}
