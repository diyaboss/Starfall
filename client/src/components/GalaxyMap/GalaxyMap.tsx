import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  useGameStore,
  selectMyPlayer,
  selectPlayers,
  selectVisibleSectors,
  selectPreviewSectors,
  selectBeacon,
} from "@/store/gameStore";
import { useEmit } from "@/hooks/useSocket";
import type { Sector, SectorPreview, PublicPlayerInfo } from "@shared/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_RADIUS = 20;
const CANVAS_PADDING = 80;

const FACTION_COLORS: Record<string, string> = {
  science_collective: "#3b82f6",
  traders_guild:      "#eab308",
  mining_consortium:  "#f97316",
  pirate_clans:       "#ef4444",
  explorer_guild:     "#22c55e",
};

const FACTION_LABELS: Record<string, string> = {
  science_collective: "Science Collective",
  traders_guild:      "Traders Guild",
  mining_consortium:  "Mining Consortium",
  pirate_clans:       "Pirate Clans",
  explorer_guild:     "Explorer Guild",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface HoverInfo {
  sector: Sector;
  screenX: number;
  screenY: number;
  isReachable: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeViewBox(
  sectors: Record<string, Sector | SectorPreview>,
): ViewBox {
  const entries = Object.values(sectors);
  if (entries.length === 0) {
    return { x: 0, y: 0, width: 800, height: 600 };
  }
  const xs = entries.map((s) => (s as Sector).x ?? 0).filter((v) => v !== 0 || true);
  const ys = entries.map((s) => (s as Sector).y ?? 0);
  const minX = Math.min(...xs) - CANVAS_PADDING;
  const minY = Math.min(...ys) - CANVAS_PADDING;
  const maxX = Math.max(...xs) + CANVAS_PADDING;
  const maxY = Math.max(...ys) + CANVAS_PADDING;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// ---------------------------------------------------------------------------
// Edge
// ---------------------------------------------------------------------------

interface EdgeProps {
  from: Sector;
  to: Sector;
  isReachable: boolean;
  fuelCost: number;
}

function Edge({ from, to, isReachable, fuelCost }: EdgeProps): React.ReactElement {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;

  return (
    <g>
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={isReachable ? "#3b82f633" : "#1e293b"}
        strokeWidth={isReachable ? 2 : 1.5}
        strokeDasharray={isReachable ? "none" : "5 4"}
      />
      {isReachable && (
        <text
          x={midX}
          y={midY - 5}
          fontSize={8}
          fill="#3b82f6"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ pointerEvents: "none" }}
        >
          -{fuelCost}⛽
        </text>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// SectorNode
// ---------------------------------------------------------------------------

interface SectorNodeProps {
  sector: Sector;
  isCurrentSector: boolean;
  isReachable: boolean;
  hasPlayers: boolean;
  hasBeacon: boolean;
  hasConvergence: boolean;
  isHovered: boolean;
  onClick: (sectorId: string) => void;
}

function SectorNode({
  sector,
  isCurrentSector,
  isReachable,
  hasPlayers,
  hasBeacon,
  hasConvergence,
  isHovered,
  onClick,
}: SectorNodeProps): React.ReactElement {
  const factionColor = sector.faction
    ? (FACTION_COLORS[sector.faction] ?? "#64748b")
    : "#475569";

  // Visual state hierarchy: current > reachable > default
  const fillColor = isCurrentSector
    ? factionColor
    : isReachable
    ? `${factionColor}66`
    : `${factionColor}22`;

  const strokeColor = isCurrentSector
    ? "#ffffff"
    : isReachable
    ? factionColor
    : "#1e293b";

  const strokeWidth = isCurrentSector ? 2.5 : isReachable ? 1.5 : 1;

  const glowRadius = NODE_RADIUS + (isHovered && isReachable ? 10 : isReachable ? 6 : 0);
  const glowOpacity = isHovered && isReachable ? 0.35 : isReachable ? 0.18 : 0;

  return (
    <g
      onClick={() => onClick(sector.id)}
      style={{ cursor: isReachable || isCurrentSector ? "pointer" : "default" }}
      role="button"
      aria-label={`Sector ${sector.name}`}
    >
      {/* Convergence pulse ring */}
      {hasConvergence && (
        <circle
          cx={sector.x}
          cy={sector.y}
          r={NODE_RADIUS + 12}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={2}
          strokeDasharray="6 3"
          opacity={0.8}
        />
      )}

      {/* Beacon ring */}
      {hasBeacon && (
        <circle
          cx={sector.x}
          cy={sector.y}
          r={NODE_RADIUS + 8}
          fill="none"
          stroke="#a855f7"
          strokeWidth={2}
          opacity={0.9}
        />
      )}

      {/* Reachable glow */}
      {glowOpacity > 0 && (
        <circle
          cx={sector.x}
          cy={sector.y}
          r={glowRadius}
          fill={factionColor}
          opacity={glowOpacity}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Main node */}
      <circle
        cx={sector.x}
        cy={sector.y}
        r={NODE_RADIUS}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
      />

      {/* Current sector inner dot */}
      {isCurrentSector && (
        <circle
          cx={sector.x}
          cy={sector.y}
          r={5}
          fill="#ffffff"
          opacity={0.9}
        />
      )}

      {/* Has players indicator */}
      {hasPlayers && !isCurrentSector && (
        <circle
          cx={sector.x}
          cy={sector.y}
          r={4}
          fill="#ffffff"
          opacity={0.6}
        />
      )}

      {/* Nav key icon */}
      {sector.navKeyPresent && (
        <text
          x={sector.x + NODE_RADIUS - 2}
          y={sector.y - NODE_RADIUS + 6}
          fontSize={11}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ pointerEvents: "none" }}
        >
          🔑
        </text>
      )}

      {/* Station dot — sector has a faction service */}
      {sector.factionServiceId && (
        <circle
          cx={sector.x - NODE_RADIUS + 6}
          cy={sector.y - NODE_RADIUS + 6}
          r={3.5}
          fill={factionColor}
          stroke="#0f172a"
          strokeWidth={1}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Sector name label */}
      <text
        x={sector.x}
        y={sector.y + NODE_RADIUS + 13}
        fontSize={9}
        fill={isCurrentSector ? "#f1f5f9" : "#64748b"}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ pointerEvents: "none" }}
      >
        {sector.name}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// PreviewNode
// ---------------------------------------------------------------------------

interface PreviewNodeProps {
  sector: SectorPreview;
  x: number;
  y: number;
  isReachable: boolean;
  onClick: (sectorId: string) => void;
}

function PreviewNode({
  sector,
  x,
  y,
  isReachable,
  onClick,
}: PreviewNodeProps): React.ReactElement {
  const factionColor = sector.faction
    ? (FACTION_COLORS[sector.faction] ?? "#64748b")
    : "#334155";

  return (
    <g
      opacity={isReachable ? 0.85 : 0.35}
      onClick={() => {
        if (isReachable) onClick(sector.id);
      }}
      style={{ cursor: isReachable ? "pointer" : "default" }}
      role="button"
      aria-label={`Unknown sector ${sector.name}`}
    >
      {isReachable && (
        <circle
          cx={x}
          cy={y}
          r={NODE_RADIUS + 8}
          fill={factionColor}
          opacity={0.18}
          style={{ pointerEvents: "none" }}
        />
      )}

      <circle
        cx={x}
        cy={y}
        r={NODE_RADIUS * 0.72}
        fill={`${factionColor}22`}
        stroke={isReachable ? factionColor : "#475569"}
        strokeWidth={isReachable ? 1.8 : 1}
        strokeDasharray="3 2"
      />

      <text
        x={x}
        y={y - NODE_RADIUS - 6}
        fontSize={8}
        fill={isReachable ? "#3b82f6" : "#334155"}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ pointerEvents: "none" }}
      >
        {isReachable ? "JUMP" : "UNKNOWN"}
      </text>

      <text
        x={x}
        y={y + NODE_RADIUS + 8}
        fontSize={8}
        fill={isReachable ? "#94a3b8" : "#475569"}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ pointerEvents: "none" }}
      >
        {sector.name}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// PlayerDot
// ---------------------------------------------------------------------------

interface PlayerDotProps {
  player: PublicPlayerInfo;
  sector: Sector;
  index: number;
  total: number;
}

function PlayerDot({ player, sector, index, total }: PlayerDotProps): React.ReactElement {
  const angle = total > 1 ? (index / total) * 2 * Math.PI - Math.PI / 2 : 0;
  const offset = total > 1 ? NODE_RADIUS * 0.6 : 0;
  const cx = sector.x + Math.cos(angle) * offset;
  const cy = sector.y + Math.sin(angle) * offset;

  return (
    <circle
      cx={cx}
      cy={cy}
      r={4.5}
      fill={player.color}
      stroke="#0f172a"
      strokeWidth={1.5}
      opacity={player.isDead ? 0.25 : player.isConnected ? 1 : 0.45}
    />
  );
}

// ---------------------------------------------------------------------------
// Hover card (rich tooltip replacing the simple text tooltip)
// ---------------------------------------------------------------------------

interface HoverCardProps {
  info: HoverInfo;
}

function HoverCard({ info }: HoverCardProps): React.ReactElement {
  const { sector, screenX, screenY, isReachable } = info;
  const factionColor = sector.faction
    ? (FACTION_COLORS[sector.faction] ?? "#64748b")
    : "#475569";
  const factionLabel = sector.faction
    ? (FACTION_LABELS[sector.faction] ?? sector.faction)
    : "Independent";

  // Offset so the card doesn't sit under the cursor
  const left = screenX + 14;
  const top = screenY - 14;

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        background: "#0f172a",
        border: `1px solid ${factionColor}55`,
        borderLeft: `3px solid ${factionColor}`,
        borderRadius: 7,
        padding: "10px 13px",
        pointerEvents: "none",
        zIndex: 40,
        minWidth: 160,
        maxWidth: 220,
        fontFamily: "monospace",
        boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>
        {sector.name}
      </div>
      <div style={{ fontSize: 10, color: factionColor, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {factionLabel}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ fontSize: 11, color: "#94a3b8" }}>
          <span style={{ color: "#475569" }}>Fuel cost </span>
          <span style={{ color: isReachable ? "#3b82f6" : "#94a3b8", fontWeight: 600 }}>
            -{sector.fuelCost}
          </span>
        </div>

        {sector.navKeyPresent && (
          <div style={{ fontSize: 11, color: "#facc15" }}>
            🔑 Nav key: {sector.navKeyPresent}
          </div>
        )}

        {sector.factionServiceId && (
          <div style={{ fontSize: 11, color: factionColor }}>
            ◆ Station available
          </div>
        )}
      </div>

      {isReachable && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 7,
            borderTop: "1px solid #1e293b",
            fontSize: 10,
            color: "#3b82f6",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          Click to travel →
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Map legend
// ---------------------------------------------------------------------------

function MapLegend(): React.ReactElement {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 48,
        left: 12,
        background: "rgba(15,23,42,0.82)",
        border: "1px solid #1e293b",
        borderRadius: 7,
        padding: "8px 12px",
        fontFamily: "monospace",
        fontSize: 10,
        color: "#475569",
        backdropFilter: "blur(4px)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        zIndex: 5,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#3b82f6", border: "2px solid white" }} />
        <span>Current</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#3b82f655", border: "1.5px solid #3b82f6" }} />
        <span>Reachable</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#33415522", border: "1px solid #1e293b" }} />
        <span>Explored</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "transparent", border: "1px dashed #475569", opacity: 0.5 }} />
        <span>Unknown</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function GalaxyMap(): React.ReactElement {
  const myPlayer = useGameStore(selectMyPlayer);
  const players = useGameStore(selectPlayers);
  const visibleSectors = useGameStore(selectVisibleSectors);
  const previewSectors = useGameStore(selectPreviewSectors);
  const beacon = useGameStore(selectBeacon);
  const emit = useEmit();

  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [activeSectorId, setActiveSectorId] = useState<string | null>(null);

  const allSectors = useMemo(
    () => ({ ...visibleSectors, ...previewSectors } as Record<string, Sector | SectorPreview>),
    [visibleSectors, previewSectors],
  );

  const viewBox = useMemo(() => computeViewBox(allSectors), [allSectors]);
  const viewBoxStr = `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;

  const currentSectorId = myPlayer?.sectorId ?? null;

  const reachableSectorIds = useMemo<Set<string>>(() => {
    if (!currentSectorId) return new Set();
  
    const current = visibleSectors[currentSectorId];
    if (!current) return new Set();
  
    return new Set(
      current.connectedTo.filter((id) => allSectors[id])
    );
  }, [currentSectorId, visibleSectors, allSectors]);

  // Deduplicated edges between visible sectors
  const edges = useMemo(() => {
    const seen = new Set<string>();
    const result: { from: Sector; to: Sector }[] = [];
    for (const sector of Object.values(visibleSectors)) {
      for (const connId of sector.connectedTo) {
        const key = [sector.id, connId].sort().join("--");
        if (seen.has(key)) continue;
        seen.add(key);
        const target = visibleSectors[connId];
        if (target) result.push({ from: sector, to: target });
      }
    }
    return result;
  }, [visibleSectors]);

  // Players grouped by sector
  const playersBySector = useMemo(() => {
    const map: Record<string, PublicPlayerInfo[]> = {};
    for (const p of Object.values(players)) {
      if (!map[p.sectorId]) map[p.sectorId] = [];
      map[p.sectorId].push(p);
    }
    return map;
  }, [players]);

  const handleSectorClick = useCallback(
    (sectorId: string) => {
      if (!myPlayer || myPlayer.isDead) return;
      if (sectorId === currentSectorId) return;
      if (!reachableSectorIds.has(sectorId)) return;
      setActiveSectorId(sectorId);
      emit("player:move", { targetSectorId: sectorId });
      // Clear the visual "moving" state after a moment
      setTimeout(() => setActiveSectorId(null), 1200);
    },
    [emit, myPlayer, currentSectorId, reachableSectorIds],
  );

  const handleMouseEnter = useCallback(
    (sector: Sector, event: React.MouseEvent<SVGGElement>) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      setHoverInfo({
        sector,
        screenX: event.clientX - rect.left,
        screenY: event.clientY - rect.top,
        isReachable: reachableSectorIds.has(sector.id),
      });
    },
    [reachableSectorIds],
  );

  const handleMouseMove = useCallback(
    (_sector: Sector, event: React.MouseEvent<SVGGElement>) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      setHoverInfo((prev) =>
        prev
          ? { ...prev, screenX: event.clientX - rect.left, screenY: event.clientY - rect.top }
          : null,
      );
    },
    [],
  );

  const handleMouseLeave = useCallback(() => setHoverInfo(null), []);

  if (!myPlayer) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background: "#050d1a",
          color: "#334155",
          fontFamily: "monospace",
          fontSize: 13,
        }}
      >
        Awaiting game state…
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "radial-gradient(ellipse at 50% 40%, #0a1628 0%, #050d1a 100%)",
      }}
    >
      {/* Subtle grid overlay */}
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0.04,
          pointerEvents: "none",
        }}
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#94a3b8" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Galaxy SVG */}
      <svg
        ref={svgRef}
        viewBox={viewBoxStr}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "100%", position: "relative", zIndex: 1 }}
        aria-label="Galaxy map"
      >
        {/* Edges */}
        <g>
          {edges.map(({ from, to }) => {
            
            const toIsReachable = reachableSectorIds.has(to.id);
            
            const fromIsReachable = reachableSectorIds.has(from.id);

            // An edge is "reachable" if one end is current and the other is reachable
            const isReachableEdge =
              (from.id === currentSectorId && toIsReachable) ||
              (to.id === currentSectorId && fromIsReachable);

            const fuelCost = isReachableEdge
              ? (reachableSectorIds.has(to.id) ? to.fuelCost : from.fuelCost)
              : 0;

            return (
              <Edge
                key={`${from.id}--${to.id}`}
                from={from}
                to={to}
                isReachable={isReachableEdge}
                fuelCost={fuelCost}
              />
            );
          })}
        </g>

        {/* Preview nodes */}
        <g>
          {Object.values(previewSectors).map((sector) => {
            if (visibleSectors[sector.id]) return null;
            const s = sector as Partial<Sector> & SectorPreview;
            if (s.x == null || s.y == null) return null;
            return (
              <PreviewNode
                key={sector.id}
                sector={sector}
                x={s.x}
                y={s.y}
                isReachable={reachableSectorIds.has(sector.id)}
                onClick={handleSectorClick}
              />
            );
          })}
        </g>

        {/* Visible sector nodes */}
        <g>
          {Object.values(visibleSectors).map((sector) => {
            const sectorPlayers = playersBySector[sector.id] ?? [];
            const isMovingTo = activeSectorId === sector.id;

            return (
              <g
                key={sector.id}
                onMouseEnter={(e) => handleMouseEnter(sector, e)}
                onMouseMove={(e) => handleMouseMove(sector, e)}
                onMouseLeave={handleMouseLeave}
                style={{ opacity: isMovingTo ? 0.7 : 1, transition: "opacity 0.3s" }}
              >
                <SectorNode
                  sector={sector}
                  isCurrentSector={sector.id === currentSectorId}
                  isReachable={reachableSectorIds.has(sector.id)}
                  hasPlayers={sectorPlayers.length > 0}
                  hasBeacon={beacon?.convoyCurrentSectorId === sector.id}
                  hasConvergence={beacon?.convergenceSectorId === sector.id}
                  isHovered={hoverInfo?.sector.id === sector.id}
                  onClick={handleSectorClick}
                />
                {sectorPlayers.map((p, i) => (
                  <PlayerDot
                    key={p.id}
                    player={p}
                    sector={sector}
                    index={i}
                    total={sectorPlayers.length}
                  />
                ))}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Hover card */}
      {hoverInfo && <HoverCard info={hoverInfo} />}

      {/* Legend */}
      <MapLegend />
    </div>
  );
}