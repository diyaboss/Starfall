import React from "react";
import {
  useGameStore,
  selectMyPlayer,
  selectVisibleSectors,
} from "@/store/gameStore";
import { useEmit } from "@/hooks/useSocket";
import type { UseServicePayload } from "@shared/types";

export function StationPanel({ onClose }: { onClose: () => void }): React.ReactElement | null {
  const myPlayer = useGameStore(selectMyPlayer);
  const visibleSectors = useGameStore(selectVisibleSectors);
  const npcServices = useGameStore((s) => s.gameState?.npcServices ?? {});
  const emit = useEmit();

  if (!myPlayer) return null;

  const currentSector = visibleSectors[myPlayer.sectorId];
  if (!currentSector || !currentSector.factionServiceId) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>
          Station Services
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <div style={{ padding: 16, fontSize: 12, color: "#64748b" }}>
          No station detected in this sector.
        </div>
      </div>
    );
  }

  const station = npcServices[currentSector.factionServiceId];
  if (!station) {
    return null;
  }

  const handleUseService = (type: string, id: string) => {
    const payload: UseServicePayload = {
      serviceType: type as any,
      serviceId: id,
    };
    emit("service:use", payload);
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        {currentSector.name} Station
        <button onClick={onClose} style={closeBtnStyle}>✕</button>
      </div>

      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {station.services.map((svc) => (
          <div
            key={svc.type}
            style={{
              background: "#0f172a",
              border: "1px solid #1e293b",
              borderRadius: 6,
              padding: 10,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", marginBottom: 2 }}>
                {svc.label}
              </div>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4 }}>
                {svc.description}
              </div>
              <div style={{ fontSize: 10, color: "#94a3b8", display: "flex", gap: 8 }}>
                {svc.energyCost > 0 && <span>⚡ {svc.energyCost} EN</span>}
                {svc.fuelCost > 0 && <span>⛽ {svc.fuelCost} FL</span>}
              </div>
            </div>
            
            <button
              onClick={() => handleUseService(svc.type, station.id)}
              disabled={myPlayer.energy < svc.energyCost || myPlayer.fuel < svc.fuelCost}
              style={{
                background: (myPlayer.energy < svc.energyCost || myPlayer.fuel < svc.fuelCost) ? "#1e293b" : "#2563eb",
                color: (myPlayer.energy < svc.energyCost || myPlayer.fuel < svc.fuelCost) ? "#475569" : "#f8fafc",
                border: "none",
                borderRadius: 4,
                padding: "6px 12px",
                fontSize: 11,
                fontWeight: 600,
                cursor: (myPlayer.energy < svc.energyCost || myPlayer.fuel < svc.fuelCost) ? "not-allowed" : "pointer",
                fontFamily: "monospace",
              }}
            >
              PURCHASE
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  position: "absolute",
  top: 150,
  right: 12,
  width: 320,
  background: "rgba(9,16,32,0.95)",
  border: "1px solid #1e293b",
  borderRadius: 8,
  color: "#e2e8f0",
  fontFamily: "monospace",
  backdropFilter: "blur(8px)",
  boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
  zIndex: 50,
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  padding: "10px 14px",
  background: "#0f172a",
  borderBottom: "1px solid #1e293b",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  color: "#94a3b8",
};

const closeBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#64748b",
  cursor: "pointer",
  fontSize: 14,
  padding: 0,
};
