import React, { useCallback, useMemo, useRef, useState } from "react";
import { useGameStore, selectMyPlayer, selectPlayers, selectVisibleSectors, selectPreviewSectors, selectBeacon } from "@/store/gameStore";
import { useEmit } from "@/hooks/useSocket";
import type { Sector, SectorPreview, PublicPlayerInfo } from "@shared/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_RADIUS = 18;
const CANVAS_PADDING = 60;

const FACTION_COLORS: Record<string, string> = {
  science_collective: "#3498db",
  traders_guild:      "#f1c40f",
  mining_consortium:  "#e67e22",
  pirate_clans:       "#e74c3c",
  explorer_guild:     "#2ecc71",
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
  const xs = entries.map((s) => (s as Sector).x ?? 0);
  const ys = entries.map((s) => (s as Sector).y ?? 0);
  const minX = Math.min(...xs) - CANVAS_PADDING;
  const minY = Math.min(...ys) - CANVAS_PADDING;
  const maxX = Math.max(...xs) + CANVAS_PADDING;
  const maxY = Math.max(...ys) + CANVAS_PADDING;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface EdgeProps {
  from: Sector;
  to: Sector | SectorPreview;
}

function Edge({ from, to }: EdgeProps): React.ReactElement {
  const toX = (to as Sector).x ?? 0;
  const toY = (to as Sector).y ?? 0;
  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={toX}
      y2={toY}
      stroke="#334155"
      strokeWidth={1.5}
      strokeDasharray="4 3"
    />
  );
}

interface SectorNodeProps {
  sector: Sector;
  isCurrentSector: boolean;
  isReachable: boolean;
  hasPlayer: boolean;
  hasBeacon: boolean;
  hasConvergence: boolean;
  onClick: (sectorId: string) => void;
}

function SectorNode({
  sector,
  isCurrentSector,
  isReachable,
  hasPlayer,
  hasBeacon,
  hasConvergence,
  onClick,
}: SectorNodeProps): React.ReactElement {
  const factionColor = sector.faction ? (FACTION_COLORS[sector.faction] ?? "#64748b") : "#475569";
  const strokeColor = isCurrentSector
    ? "#ffffff"
    : isReachable
    ? "#94a3b8"
    : "#1e293b";
  const strokeWidth = isCurrentSector ? 3 : isReachable ? 2 : 1;
  const fillColor = isCurrentSector ? factionColor : `${factionColor}55`;

  return (
    <g
      onClick={() => onClick(sector.id)}
      style={{ cursor: isReachable || isCurrentSector ? "pointer" : "default" }}
      role="button"
      aria-label={`Sector ${sector.name}`}
    >
      {hasConvergence && (
        <circle
          cx={sector.x}
          cy={sector.y}
          r={NODE_RADIUS + 8}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={2}
          strokeDasharray="6 3"
          opacity={0.8}
        />
      )}
      {hasBeacon && (
        <circle
          cx={sector.x}
          cy={sector.y}
          r={NODE_RADIUS + 5}
          fill="none"
          stroke="#a855f7"
          strokeWidth={2}
          opacity={0.9}
        />
      )}
      <circle
        cx={sector.x}
        cy={sector.y}
        r={NODE_RADIUS}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
      />
      {hasPlayer && (
        <circle
          cx={sector.x}
          cy={sector.y}
          r={4}
          fill="#ffffff"
        />
      )}
      {sector.navKeyPresent && (
        <text
          x={sector.x + NODE_RADIUS - 4}
          y={sector.y - NODE_RADIUS + 8}
          fontSize={10}
          fill="#facc15"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          🔑
        </text>
      )}
      <text
        x={sector.x}
        y={sector.y + NODE_RADIUS + 12}
        fontSize={9}
        fill="#94a3b8"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {sector.name}
      </text>
    </g>
  );
}

interface PreviewNodeProps {
  sector: SectorPreview;
  x: number;
  y: number;
}

function PreviewNode({ sector, x, y }: PreviewNodeProps): React.ReactElement {
  const factionColor = sector.faction ? (FACTION_COLORS[sector.faction] ?? "#64748b") : "#334155";
  return (
    <g opacity={0.4}>
      <circle
        cx={x}
        cy={y}
        r={NODE_RADIUS * 0.7}
        fill={`${factionColor}33`}
        stroke={factionColor}
        strokeWidth={1}
        strokeDasharray="3 2"
      />
      <text
        x={x}
        y={y + NODE_RADIUS + 6}
        fontSize={8}
        fill="#64748b"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {sector.name}
      </text>
    </g>
  );
}

interface PlayerDotProps {
  player: PublicPlayerInfo;
  sector: Sector;
  index: number;
  total: number;
}

function PlayerDot({ player, sector, index, total }: PlayerDotProps): React.ReactElement {
  const angle = total > 1 ? (index / total) * 2 * Math.PI : 0;
  const offset = total > 1 ? NODE_RADIUS * 0.55 : 0;
  const cx = sector.x + Math.cos(angle) * offset;
  const cy = sector.y + Math.sin(angle) * offset;

  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={player.color}
      stroke="#0f172a"
      strokeWidth={1}
      opacity={player.isDead ? 0.3 : player.isConnected ? 1 : 0.5}
    />
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
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

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
    return new Set(current.connectedTo.filter((id) => visibleSectors[id]));
  }, [currentSectorId, visibleSectors]);

  // Build edges (only between visible sectors, deduplicated)
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
      emit("player:move", { targetSectorId: sectorId });
    },
    [emit, myPlayer, currentSectorId, reachableSectorIds],
  );

  const handleMouseEnter = useCallback(
    (sector: Sector, event: React.MouseEvent<SVGGElement>) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const lines: string[] = [
        sector.name,
        sector.faction ? `Faction: ${sector.faction.replace(/_/g, " ")}` : "Independent",
        `Fuel cost: ${sector.fuelCost}`,
      ];
      if (sector.navKeyPresent) lines.push(`Nav key: ${sector.navKeyPresent}`);
      setTooltip({
        text: lines.join(" | "),
        x: event.clientX - rect.left,
        y: event.clientY - rect.top - 12,
      });
    },
    [],
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  if (!myPlayer) {
    return (
      <div className="galaxy-map galaxy-map--empty">
        <span>Awaiting game state…</span>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#0f172a" }}>
      <svg
        ref={svgRef}
        viewBox={viewBoxStr}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "100%" }}
        aria-label="Galaxy map"
      >
        {/* Edges */}
        <g>
          {edges.map(({ from, to }) => (
            <Edge key={`${from.id}--${to.id}`} from={from} to={to} />
          ))}
        </g>

        {/* Preview nodes */}
        <g>
          {Object.values(previewSectors).map((sector) => {
            if (visibleSectors[sector.id]) return null;
            // Preview sectors lack x/y; skip rendering without coords
            const s = sector as Partial<Sector> & SectorPreview;
            if (s.x == null || s.y == null) return null;
            return (
              <PreviewNode key={sector.id} sector={sector} x={s.x} y={s.y} />
            );
          })}
        </g>

        {/* Visible sector nodes */}
        <g>
          {Object.values(visibleSectors).map((sector) => {
            const sectorPlayers = playersBySector[sector.id] ?? [];
            return (
              <g
                key={sector.id}
                onMouseEnter={(e) => handleMouseEnter(sector, e)}
                onMouseLeave={handleMouseLeave}
              >
                <SectorNode
                  sector={sector}
                  isCurrentSector={sector.id === currentSectorId}
                  isReachable={reachableSectorIds.has(sector.id)}
                  hasPlayer={sectorPlayers.length > 0}
                  hasBeacon={beacon?.convoyCurrentSectorId === sector.id}
                  hasConvergence={beacon?.convergenceSectorId === sector.id}
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

      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x,
            top: tooltip.y,
            background: "#1e293b",
            color: "#e2e8f0",
            fontSize: 11,
            padding: "4px 8px",
            borderRadius: 4,
            pointerEvents: "none",
            whiteSpace: "nowrap",
            border: "1px solid #334155",
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
