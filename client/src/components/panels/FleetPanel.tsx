import React, { useState, useCallback } from "react";
import {
  useGameStore,
  selectMyPlayer,
  selectPlayers,
  selectFleets,
} from "@/store/gameStore";
import { useEmit } from "@/hooks/useSocket";
import type { NavKey } from "@shared/types";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps): React.ReactElement {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 10,
          color: "#475569",
          letterSpacing: 1,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// No-fleet view: Create or Join
// ---------------------------------------------------------------------------

function NoFleetView(): React.ReactElement {
  const emit = useEmit();
  const players = useGameStore(selectPlayers);
  const myPlayer = useGameStore(selectMyPlayer);
  const fleets = useGameStore(selectFleets);

  const [tab, setTab] = useState<"create" | "join">("create");
  const [fleetName, setFleetName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const handleCreate = useCallback(() => {
    const name = fleetName.trim();
    if (!name) { setCreateError("Fleet name is required."); return; }
    if (name.length < 2 || name.length > 28) { setCreateError("Name must be 2–28 characters."); return; }
    setCreateError(null);
    emit("fleet:create", { name });
    setFleetName("");
  }, [fleetName, emit]);

  const handleJoin = useCallback(
    (fleetId: string) => {
      setJoinError(null);
      emit("fleet:join", { fleetId });
    },
    [emit],
  );

  const availableFleets = Object.values(fleets);

  // Players without a fleet (potential solo allies visible on map)
  const soloPlayers = Object.values(players).filter(
    (p) => !p.fleetId && !p.isDead && p.id !== myPlayer?.id,
  );

  const tabBtn = (id: "create" | "join", label: string) => (
    <button
      onClick={() => setTab(id)}
      style={{
        flex: 1,
        background: tab === id ? "#1e293b" : "transparent",
        border: "none",
        borderBottom: `2px solid ${tab === id ? "#3b82f6" : "transparent"}`,
        color: tab === id ? "#f1f5f9" : "#64748b",
        fontFamily: "monospace",
        fontSize: 12,
        padding: "8px 0",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div style={{ display: "flex", borderBottom: "1px solid #1e293b", marginBottom: 14 }}>
        {tabBtn("create", "Create")}
        {tabBtn("join", "Join")}
      </div>

      {tab === "create" && (
        <Section title="New Fleet">
          <input
            type="text"
            value={fleetName}
            onChange={(e) => setFleetName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            maxLength={28}
            placeholder="Fleet name…"
            style={inputStyle}
          />
          {createError && (
            <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>{createError}</div>
          )}
          <button onClick={handleCreate} style={{ ...primaryBtn, marginTop: 8, width: "100%" }}>
            Create Fleet
          </button>
        </Section>
      )}

      {tab === "join" && (
        <Section title="Open Fleets">
          {availableFleets.length === 0 ? (
            <div style={{ fontSize: 11, color: "#475569" }}>No fleets yet. Create one.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {availableFleets.map((fleet) => (
                <div
                  key={fleet.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "#0f172a",
                    border: "1px solid #1e293b",
                    borderRadius: 6,
                    padding: "8px 10px",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: fleet.hasBeaconCore ? "#a855f7" : "#e2e8f0" }}>
                      {fleet.name}
                      {fleet.hasBeaconCore && <span style={{ marginLeft: 6 }}>★</span>}
                    </div>
                    <div style={{ fontSize: 10, color: "#64748b" }}>
                      {fleet.memberIds.length} member{fleet.memberIds.length !== 1 ? "s" : ""} · FP {fleet.fleetPower}
                    </div>
                  </div>
                  <button onClick={() => handleJoin(fleet.id)} style={secondaryBtn}>
                    Join
                  </button>
                </div>
              ))}
            </div>
          )}
          {joinError && (
            <div style={{ fontSize: 11, color: "#ef4444", marginTop: 6 }}>{joinError}</div>
          )}
        </Section>
      )}

      {soloPlayers.length > 0 && (
        <Section title="Solo Pilots">
          <div style={{ fontSize: 11, color: "#475569" }}>
            {soloPlayers.map((p) => (
              <span key={p.id} style={{ marginRight: 8, color: p.color }}>
                {p.callsign}
              </span>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// In-fleet view
// ---------------------------------------------------------------------------

function InFleetView(): React.ReactElement {
  const emit = useEmit();
  const myPlayer = useGameStore(selectMyPlayer);
  const players = useGameStore(selectPlayers);
  const fleets = useGameStore(selectFleets);

  const fleet = myPlayer?.fleetId ? fleets[myPlayer.fleetId] : null;

  const handleLeave = useCallback(() => {
    emit("fleet:leave");
  }, [emit]);

  const handleShareKey = useCallback(
    (key: NavKey) => {
      emit("fleet:shareKey", { navKey: key });
    },
    [emit],
  );

  if (!fleet || !myPlayer) return <div style={{ fontSize: 11, color: "#64748b" }}>Loading…</div>;

  const members = fleet.memberIds
    .map((id) => players[id])
    .filter(Boolean);

  const isLeader = fleet.leaderSocketId === myPlayer.id;

  // Keys the player holds but hasn't shared yet
  const unshareds = myPlayer.navKeys.filter((k) => !fleet.sharedNavKeys.includes(k));

  return (
    <div>
      <Section title="Fleet">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: fleet.hasBeaconCore ? "#a855f7" : "#f1f5f9" }}>
              {fleet.name}
              {fleet.hasBeaconCore && <span style={{ marginLeft: 6, fontSize: 12 }}>★ Beacon Core</span>}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              Fleet Power: <span style={{ color: "#e2e8f0" }}>{fleet.fleetPower}</span>
              &nbsp;·&nbsp;Coords: {fleet.coordsAssembled}/4
            </div>
          </div>
          {!isLeader && (
            <button onClick={handleLeave} style={{ ...secondaryBtn, color: "#ef4444", borderColor: "#ef4444" }}>
              Leave
            </button>
          )}
        </div>
      </Section>

      <Section title="Members">
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {members.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                opacity: p.isConnected ? 1 : 0.45,
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 12, color: "#e2e8f0" }}>{p.callsign}</span>
                {p.id === fleet.leaderSocketId && (
                  <span style={{ fontSize: 9, color: "#f59e0b", marginLeft: 6 }}>LEAD</span>
                )}
                {p.isDead && (
                  <span style={{ fontSize: 9, color: "#ef4444", marginLeft: 6 }}>DEAD</span>
                )}
              </div>
              <span style={{ fontSize: 10, color: "#475569" }}>
                {p.navKeys.length > 0 ? p.navKeys.map((k) => k.toUpperCase()[0]).join("") : "—"}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {fleet.sharedNavKeys.length > 0 && (
        <Section title="Shared Nav Keys">
          <div style={{ display: "flex", gap: 6 }}>
            {fleet.sharedNavKeys.map((k) => (
              <span
                key={k}
                style={{
                  background: "#1e293b",
                  border: "1px solid #facc15",
                  borderRadius: 4,
                  fontSize: 10,
                  color: "#facc15",
                  padding: "2px 8px",
                  textTransform: "uppercase",
                }}
              >
                {k}
              </span>
            ))}
          </div>
        </Section>
      )}

      {unshareds.length > 0 && (
        <Section title="Share Your Keys">
          <div style={{ display: "flex", gap: 6 }}>
            {unshareds.map((k) => (
              <button
                key={k}
                onClick={() => handleShareKey(k)}
                style={{
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: 4,
                  fontSize: 11,
                  color: "#94a3b8",
                  padding: "4px 10px",
                  cursor: "pointer",
                  fontFamily: "monospace",
                  textTransform: "uppercase",
                }}
              >
                Share {k}
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: 6,
  padding: "7px 10px",
  color: "#f1f5f9",
  fontSize: 12,
  outline: "none",
  fontFamily: "monospace",
  boxSizing: "border-box",
};

const primaryBtn: React.CSSProperties = {
  background: "#3b82f6",
  border: "none",
  borderRadius: 6,
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
  padding: "7px 14px",
  cursor: "pointer",
  fontFamily: "monospace",
};

const secondaryBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #334155",
  borderRadius: 6,
  color: "#94a3b8",
  fontSize: 11,
  padding: "5px 10px",
  cursor: "pointer",
  fontFamily: "monospace",
};

// ---------------------------------------------------------------------------
// FleetPanel
// ---------------------------------------------------------------------------

export function FleetPanel(): React.ReactElement {
  const myPlayer = useGameStore(selectMyPlayer);
  const [open, setOpen] = useState(false);

  if (!myPlayer) return <></>;

  const inFleet = Boolean(myPlayer.fleetId);

  return (
    <>
      {/* Toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          position: "absolute",
          top: 56,
          right: 12,
          background: inFleet ? "#1e293b" : "#0f172a",
          border: `1px solid ${inFleet ? "#3b82f6" : "#334155"}`,
          borderRadius: 6,
          color: inFleet ? "#60a5fa" : "#94a3b8",
          fontSize: 11,
          padding: "4px 10px",
          cursor: "pointer",
          fontFamily: "monospace",
          zIndex: 10,
        }}
      >
        {inFleet ? "Fleet ▾" : "Fleet ▾"}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: 86,
            right: 12,
            width: 260,
            background: "rgba(15,23,42,0.97)",
            border: "1px solid #1e293b",
            borderRadius: 8,
            padding: "14px 14px",
            fontFamily: "monospace",
            color: "#e2e8f0",
            zIndex: 50,
            backdropFilter: "blur(4px)",
          }}
        >
          {inFleet ? <InFleetView /> : <NoFleetView />}
        </div>
      )}
    </>
  );
}
