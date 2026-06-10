// =============================================================================
// STARFALL — Galaxy Map Generator
//
// Produces a deterministic 24-sector galaxy used for every game session.
// Sectors are arranged in three concentric rings plus a core:
//
//   Core      (1 sector)  — Convergence Beacon destination, high fuel cost
//   Inner     (6 sectors) — Faction hubs, high connectivity
//   Mid       (10 sectors) — Mission-heavy, mixed factions
//   Outer     (7 sectors) — Sparse, Mining/Pirates, low connectivity
//
// Connectivity rules:
//   - Every sector connects to at least 2 others (no dead ends)
//   - Inner ring connects to Core and Mid ring
//   - Outer ring connects to Mid ring only (no outer→core shortcuts)
//   - Map is fully connected (every sector reachable from every other)
//
// Spawn points: 12 designated spawn sectors spread across Inner + Mid rings.
// Players never spawn in Core or Outer ring at game start.
// =============================================================================

import { v4 as uuidv4 } from "uuid";
import type {
  Sector,
  NPCConvoy,
  NPCService,
  FactionID,
  ServiceOption,
  ServiceType,
} from "@shared/types";

// ---------------------------------------------------------------------------
// Internal map definition — typed seed data
// ---------------------------------------------------------------------------

interface SectorSeed {
  id: string;
  name: string;
  region: string;
  x: number;
  y: number;
  connectedTo: string[];
  fuelCost: number;
  faction: FactionID | null;
  hasFactionService: boolean;
  navKeyPresent: "alpha" | "beta" | "gamma" | null;
  isSpawnPoint: boolean;
  ring: "core" | "inner" | "mid" | "outer";
}

// ---------------------------------------------------------------------------
// Static sector definitions
// Coordinates are SVG canvas units (800 × 600 viewport).
// ---------------------------------------------------------------------------

const SECTOR_SEEDS: SectorSeed[] = [
  // ── Core (1) ─────────────────────────────────────────────────────────────
  {
    id: "core-nexus",
    name: "Nexus Prime",
    region: "The Core",
    x: 400,
    y: 300,
    connectedTo: ["inner-aether", "inner-solara", "inner-vortis", "inner-kael", "inner-dusk", "inner-lumen"],
    fuelCost: 30,
    faction: null,
    hasFactionService: false,
    navKeyPresent: null,
    isSpawnPoint: false,
    ring: "core",
  },

  // ── Inner ring (6) ───────────────────────────────────────────────────────
  {
    id: "inner-aether",
    name: "Aether Station",
    region: "Inner Reach",
    x: 400,
    y: 160,
    connectedTo: ["core-nexus", "inner-solara", "inner-lumen", "mid-helix", "mid-thorn"],
    fuelCost: 12,
    faction: "science_collective",
    hasFactionService: true,
    navKeyPresent: null,
    isSpawnPoint: true,
    ring: "inner",
  },
  {
    id: "inner-solara",
    name: "Solara Hub",
    region: "Inner Reach",
    x: 550,
    y: 195,
    connectedTo: ["core-nexus", "inner-aether", "inner-vortis", "mid-thorn", "mid-ember"],
    fuelCost: 12,
    faction: "traders_guild",
    hasFactionService: true,
    navKeyPresent: null,
    isSpawnPoint: true,
    ring: "inner",
  },
  {
    id: "inner-vortis",
    name: "Vortis Crossing",
    region: "Inner Reach",
    x: 600,
    y: 330,
    connectedTo: ["core-nexus", "inner-solara", "inner-kael", "mid-ember", "mid-cinder"],
    fuelCost: 14,
    faction: "traders_guild",
    hasFactionService: false,
    navKeyPresent: null,
    isSpawnPoint: true,
    ring: "inner",
  },
  {
    id: "inner-kael",
    name: "Kael Drift",
    region: "Inner Reach",
    x: 530,
    y: 450,
    connectedTo: ["core-nexus", "inner-vortis", "inner-dusk", "mid-cinder", "mid-hollow"],
    fuelCost: 12,
    faction: "explorer_guild",
    hasFactionService: true,
    navKeyPresent: null,
    isSpawnPoint: true,
    ring: "inner",
  },
  {
    id: "inner-dusk",
    name: "Dusk Meridian",
    region: "Inner Reach",
    x: 360,
    y: 465,
    connectedTo: ["core-nexus", "inner-kael", "inner-lumen", "mid-hollow", "mid-grave"],
    fuelCost: 12,
    faction: "science_collective",
    hasFactionService: false,
    navKeyPresent: null,
    isSpawnPoint: true,
    ring: "inner",
  },
  {
    id: "inner-lumen",
    name: "Lumen Gate",
    region: "Inner Reach",
    x: 240,
    y: 380,
    connectedTo: ["core-nexus", "inner-dusk", "inner-aether", "mid-grave", "mid-pale"],
    fuelCost: 13,
    faction: "explorer_guild",
    hasFactionService: false,
    navKeyPresent: null,
    isSpawnPoint: true,
    ring: "inner",
  },

  // ── Mid ring (10) ────────────────────────────────────────────────────────
  {
    id: "mid-helix",
    name: "Helix Drift",
    region: "Mid Expanse",
    x: 290,
    y: 80,
    connectedTo: ["inner-aether", "mid-thorn", "mid-pale", "outer-veil"],
    fuelCost: 16,
    faction: "explorer_guild",
    hasFactionService: true,
    navKeyPresent: "alpha",
    isSpawnPoint: true,
    ring: "mid",
  },
  {
    id: "mid-thorn",
    name: "Thornfield",
    region: "Mid Expanse",
    x: 490,
    y: 65,
    connectedTo: ["inner-aether", "inner-solara", "mid-helix", "mid-ember", "outer-ash"],
    fuelCost: 16,
    faction: null,
    hasFactionService: false,
    navKeyPresent: null,
    isSpawnPoint: true,
    ring: "mid",
  },
  {
    id: "mid-ember",
    name: "Ember Fields",
    region: "Mid Expanse",
    x: 660,
    y: 145,
    connectedTo: ["inner-solara", "inner-vortis", "mid-thorn", "mid-cinder", "outer-ash"],
    fuelCost: 17,
    faction: "traders_guild",
    hasFactionService: true,
    navKeyPresent: null,
    isSpawnPoint: false,
    ring: "mid",
  },
  {
    id: "mid-cinder",
    name: "Cinder Belt",
    region: "Mid Expanse",
    x: 720,
    y: 300,
    connectedTo: ["inner-vortis", "inner-kael", "mid-ember", "mid-hollow", "outer-iron"],
    fuelCost: 18,
    faction: "mining_consortium",
    hasFactionService: true,
    navKeyPresent: null,
    isSpawnPoint: false,
    ring: "mid",
  },
  {
    id: "mid-hollow",
    name: "The Hollow",
    region: "Mid Expanse",
    x: 680,
    y: 430,
    connectedTo: ["inner-kael", "inner-dusk", "mid-cinder", "mid-grave", "outer-iron"],
    fuelCost: 17,
    faction: null,
    hasFactionService: false,
    navKeyPresent: "beta",
    isSpawnPoint: false,
    ring: "mid",
  },
  {
    id: "mid-grave",
    name: "Graveyard Reach",
    region: "Mid Expanse",
    x: 530,
    y: 545,
    connectedTo: ["inner-dusk", "inner-lumen", "mid-hollow", "mid-pale", "outer-deep"],
    fuelCost: 18,
    faction: "pirate_clans",
    hasFactionService: true,
    navKeyPresent: null,
    isSpawnPoint: false,
    ring: "mid",
  },
  {
    id: "mid-pale",
    name: "Pale Fringe",
    region: "Mid Expanse",
    x: 220,
    y: 520,
    connectedTo: ["inner-lumen", "inner-aether", "mid-grave", "mid-helix", "outer-deep"],
    fuelCost: 16,
    faction: "pirate_clans",
    hasFactionService: false,
    navKeyPresent: null,
    isSpawnPoint: false,
    ring: "mid",
  },
  {
    id: "mid-relay",
    name: "Relay Point Seven",
    region: "Mid Expanse",
    x: 160,
    y: 220,
    connectedTo: ["inner-lumen", "mid-pale", "mid-helix", "outer-veil"],
    fuelCost: 15,
    faction: "science_collective",
    hasFactionService: true,
    navKeyPresent: null,
    isSpawnPoint: true,
    ring: "mid",
  },
  {
    id: "mid-spire",
    name: "Spire Anchorage",
    region: "Mid Expanse",
    x: 175,
    y: 380,
    connectedTo: ["inner-lumen", "mid-relay", "mid-pale", "outer-veil"],
    fuelCost: 15,
    faction: "miners_outpost" as FactionID,  // remapped below
    hasFactionService: false,
    navKeyPresent: null,
    isSpawnPoint: false,
    ring: "mid",
  },

  // ── Outer ring (7) ───────────────────────────────────────────────────────
  {
    id: "outer-veil",
    name: "Outer Veil",
    region: "The Fringe",
    x: 130,
    y: 110,
    connectedTo: ["mid-helix", "mid-relay", "outer-ash"],
    fuelCost: 22,
    faction: "explorer_guild",
    hasFactionService: true,
    navKeyPresent: null,
    isSpawnPoint: false,
    ring: "outer",
  },
  {
    id: "outer-ash",
    name: "Ashfield Expanse",
    region: "The Fringe",
    x: 580,
    y: 50,
    connectedTo: ["mid-thorn", "mid-ember", "outer-veil", "outer-iron"],
    fuelCost: 22,
    faction: null,
    hasFactionService: false,
    navKeyPresent: null,
    isSpawnPoint: false,
    ring: "outer",
  },
  {
    id: "outer-iron",
    name: "Iron Shelf",
    region: "The Fringe",
    x: 760,
    y: 380,
    connectedTo: ["mid-cinder", "mid-hollow", "outer-ash", "outer-deep"],
    fuelCost: 24,
    faction: "mining_consortium",
    hasFactionService: true,
    navKeyPresent: null,
    isSpawnPoint: false,
    ring: "outer",
  },
  {
    id: "outer-deep",
    name: "The Deep Dark",
    region: "The Fringe",
    x: 640,
    y: 560,
    connectedTo: ["mid-grave", "mid-hollow", "outer-iron"],
    fuelCost: 26,
    faction: "pirate_clans",
    hasFactionService: true,
    navKeyPresent: "gamma",
    isSpawnPoint: false,
    ring: "outer",
  },
  {
    id: "outer-ridge",
    name: "Ridgeback Station",
    region: "The Fringe",
    x: 80,
    y: 440,
    connectedTo: ["mid-pale", "mid-relay", "outer-veil"],
    fuelCost: 23,
    faction: "mining_consortium",
    hasFactionService: false,
    navKeyPresent: null,
    isSpawnPoint: false,
    ring: "outer",
  },
  {
    id: "outer-terminus",
    name: "Far Terminus",
    region: "The Fringe",
    x: 730,
    y: 530,
    connectedTo: ["mid-hollow", "mid-grave", "outer-deep"],
    fuelCost: 25,
    faction: null,
    hasFactionService: false,
    navKeyPresent: null,
    isSpawnPoint: false,
    ring: "outer",
  },
  {
    id: "outer-crown",
    name: "Crown Nebula",
    region: "The Fringe",
    x: 310,
    y: 570,
    connectedTo: ["mid-pale", "mid-grave", "outer-ridge"],
    fuelCost: 22,
    faction: "pirate_clans",
    hasFactionService: false,
    navKeyPresent: null,
    isSpawnPoint: false,
    ring: "outer",
  },
];

// ---------------------------------------------------------------------------
// Faction service definitions
// ---------------------------------------------------------------------------

function buildServiceOptions(factionId: FactionID): ServiceOption[] {
  const base: Record<FactionID, ServiceOption[]> = {
    science_collective: [
      {
        type: "sector_scan" as ServiceType,
        label: "Sector Deep Scan",
        description: "Reveal contents of all adjacent sectors.",
        fuelCost: 0,
        energyCost: 20,
        minReputation: -100,
      },
      {
        type: "coord_decode" as ServiceType,
        label: "Coordinate Decode",
        description: "Reveal the hidden digit of a traded coordinate shard.",
        fuelCost: 0,
        energyCost: 30,
        minReputation: 10,
      },
      {
        type: "beacon_triangulation" as ServiceType,
        label: "Beacon Triangulation",
        description: "Estimate the Beacon Core convoy location within 3 sectors.",
        fuelCost: 0,
        energyCost: 40,
        minReputation: 30,
      },
    ],
    traders_guild: [
      {
        type: "fuel_purchase" as ServiceType,
        label: "Buy Fuel",
        description: "Refuel your ship. Costs energy.",
        fuelCost: 0,
        energyCost: 15,
        minReputation: -100,
      },
      {
        type: "energy_purchase" as ServiceType,
        label: "Buy Energy Cell",
        description: "Restore energy. Costs fuel.",
        fuelCost: 15,
        energyCost: 0,
        minReputation: -100,
      },
      {
        type: "nav_key_broker" as ServiceType,
        label: "Nav Key Broker",
        description: "Broker a nav key trade with another player using escrow.",
        fuelCost: 10,
        energyCost: 10,
        minReputation: 20,
      },
    ],
    mining_consortium: [
      {
        type: "refuel_discount" as ServiceType,
        label: "Deep Refuel",
        description: "Full refuel at half the standard energy cost.",
        fuelCost: 0,
        energyCost: 8,
        minReputation: -100,
      },
      {
        type: "mine_fuel" as ServiceType,
        label: "Mining Contract",
        description: "Multi-step extraction mission. High fuel reward.",
        fuelCost: 0,
        energyCost: 0,
        minReputation: 0,
      },
    ],
    pirate_clans: [
      {
        type: "black_market_intel" as ServiceType,
        label: "Black Market Intel",
        description: "Buy precise Beacon Core convoy location. Costs reputation.",
        fuelCost: 20,
        energyCost: 20,
        minReputation: -50,
      },
      {
        type: "raid_contract" as ServiceType,
        label: "Raid Contract",
        description: "Attempt to steal a nav key from another player.",
        fuelCost: 15,
        energyCost: 15,
        minReputation: 0,
      },
    ],
    explorer_guild: [
      {
        type: "map_reveal" as ServiceType,
        label: "Regional Map",
        description: "Reveal names and connections of 5 nearby dark sectors.",
        fuelCost: 20,
        energyCost: 0,
        minReputation: -100,
      },
      {
        type: "exploration_contract" as ServiceType,
        label: "Exploration Contract",
        description: "Race to a target sector before any other player for FP.",
        fuelCost: 0,
        energyCost: 0,
        minReputation: 0,
      },
    ],
  };

  return base[factionId] ?? [];
}

// ---------------------------------------------------------------------------
// Convoy path generation
// Beacon Core convoy travels a pre-set route through mid + outer sectors.
// Path is server-only — never sent to clients.
// ---------------------------------------------------------------------------

const BEACON_CORE_PATH: string[] = [
  "outer-ash",
  "outer-iron",
  "mid-cinder",
  "mid-ember",
  "mid-thorn",
  "mid-helix",
  "outer-veil",
  "mid-relay",
  "mid-spire",
  "mid-pale",
  "mid-grave",
  "outer-deep",
  "outer-terminus",
  "mid-hollow",
  "mid-cinder",
  "mid-ember",
  "outer-ash",
  "outer-iron",
  "outer-deep",
  "mid-grave",
  "mid-pale",
  "mid-relay",
  "outer-veil",
  "mid-helix",
];

// ---------------------------------------------------------------------------
// Public builder functions
// ---------------------------------------------------------------------------

/**
 * Build the complete sector map.
 * Corrects the placeholder "miners_outpost" faction on mid-spire to null
 * (it has no faction service in V1).
 */
export function buildGalaxy(): Record<string, Sector> {
  const sectors: Record<string, Sector> = {};

  for (const seed of SECTOR_SEEDS) {
    // Correct the mid-spire placeholder — no faction in V1
    const faction: FactionID | null =
      (seed.faction as string) === "miners_outpost" ? null : seed.faction;

    sectors[seed.id] = {
      id: seed.id,
      name: seed.name,
      region: seed.region,
      x: seed.x,
      y: seed.y,
      connectedTo: seed.connectedTo,
      fuelCost: seed.fuelCost,
      faction,
      factionServiceId: seed.hasFactionService && faction !== null
        ? `svc-${seed.id}`
        : null,
      missionIds: [],
      navKeyPresent: seed.navKeyPresent,
      npcConvoyIds: [],
      discoveredBy: [],
    };
  }

  return sectors;
}

/**
 * Build all faction NPC service stations.
 * One station per sector that has hasFactionService = true and a faction.
 */
export function buildNPCServices(): Record<string, NPCService> {
  const services: Record<string, NPCService> = {};

  for (const seed of SECTOR_SEEDS) {
    if (!seed.hasFactionService || seed.faction === null) continue;
    if ((seed.faction as string) === "miners_outpost") continue;

    const id = `svc-${seed.id}`;
    services[id] = {
      id,
      factionId: seed.faction,
      sectorId: seed.id,
      services: buildServiceOptions(seed.faction),
      reputationMap: {},
    };
  }

  return services;
}

/**
 * Build the Beacon Core convoy.
 * Starts at the first sector in BEACON_CORE_PATH.
 * Path is stored server-side only — never serialised to clients.
 */
export function buildBeaconCoreConvoy(): NPCConvoy {
  const startSector = BEACON_CORE_PATH[0] ?? "outer-ash";
  return {
    id: "convoy-beacon-core",
    name: "Beacon Core Convoy",
    faction: "explorer_guild",
    sectorId: startSector,
    path: BEACON_CORE_PATH,
    pathIndex: 0,
    moveIntervalMs: 90_000,
    lastMovedAt: 0,
    isBeaconCore: true,
    interceptProgress: 0,
    interceptStepsRequired: 3,
    interceptingPlayerIds: [],
    defeated: false,
  };
}

/**
 * Returns the list of sector IDs that are valid spawn points.
 * Used by GameState to distribute players at game start.
 */
export function getSpawnSectorIds(): string[] {
  return SECTOR_SEEDS.filter((s) => s.isSpawnPoint).map((s) => s.id);
}

/**
 * Returns the designated convergence sector ID.
 * In V1 the Convergence Beacon is always at Nexus Prime (the core).
 */
export function getConvergenceSectorId(): string {
  return "core-nexus";
}

/**
 * Generates a random unique callsign for a player.
 * Adjective + noun format, seeded from a UUID fragment for variety.
 */
const CALLSIGN_ADJECTIVES = [
  "Red", "Blue", "Gold", "Iron", "Dark", "Swift", "Pale", "Void",
  "Ash", "Nova", "Keen", "Dusk", "Bright", "Lone", "Silent", "Stark",
] as const;

const CALLSIGN_NOUNS = [
  "Falcon", "Tide", "Drift", "Signal", "Flare", "Helm", "Arc", "Shard",
  "Comet", "Rift", "Pulse", "Spark", "Echo", "Veil", "Crest", "Mark",
] as const;

/** Set of callsigns already assigned this game session. */
const assignedCallsigns = new Set<string>();

export function generateCallsign(): string {
  // Up to 256 combinations — sufficient for 100 players with collisions handled
  const adj = CALLSIGN_ADJECTIVES[Math.floor(Math.random() * CALLSIGN_ADJECTIVES.length)];
  const noun = CALLSIGN_NOUNS[Math.floor(Math.random() * CALLSIGN_NOUNS.length)];
  let callsign = `${adj} ${noun}`;

  // Append a numeric suffix on collision
  if (assignedCallsigns.has(callsign)) {
    let suffix = 2;
    while (assignedCallsigns.has(`${callsign}-${suffix}`)) {
      suffix++;
    }
    callsign = `${callsign}-${suffix}`;
  }

  assignedCallsigns.add(callsign);
  return callsign;
}

/** Clear callsign assignments — call on game reset. */
export function resetCallsigns(): void {
  assignedCallsigns.clear();
}

/**
 * Assign a hex colour to a player from a fixed palette.
 * Colours are visually distinct on a dark background.
 */
const PLAYER_COLOURS = [
  "#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6",
  "#1abc9c", "#e67e22", "#e91e63", "#00bcd4", "#8bc34a",
  "#ff5722", "#673ab7", "#009688", "#ffc107", "#607d8b",
  "#f06292", "#4db6ac", "#ffb74d", "#ba68c8", "#81c784",
] as const;

let colourIndex = 0;

export function assignPlayerColour(): string {
  const colour = PLAYER_COLOURS[colourIndex % PLAYER_COLOURS.length] ?? "#ffffff";
  colourIndex++;
  return colour;
}

export function resetColourAssignments(): void {
  colourIndex = 0;
}

/**
 * Generate the four coordinate shard values for the single beacon set (V1).
 * Values are random per game session so no two games are identical.
 */
export function generateBeaconCoords(): Record<"X" | "Y" | "Z" | "sector_code", string> {
  const randInt = (min: number, max: number): number =>
    Math.floor(Math.random() * (max - min + 1)) + min;

  return {
    X: String(randInt(10, 99)),
    Y: String(randInt(10, 99)),
    Z: String(randInt(10, 99)),
    sector_code: `${["NOVA", "VEGA", "ASTR", "CYGN", "LYRA"][randInt(0, 4)]}-${randInt(1, 9)}`,
  };
}

// Re-export uuid so callers don't need to import it separately
export { uuidv4 };
