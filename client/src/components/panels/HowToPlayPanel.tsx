import React, { useState } from "react";

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

interface RuleSection {
  heading: string;
  items: string[];
}

const SECTIONS: RuleSection[] = [
  {
    heading: "Movement",
    items: [
      "Click an adjacent (highlighted) sector node to move.",
      "Each sector has a fuel cost shown on hover.",
      "You cannot move while dead or into sectors you lack the Nav Key for.",
    ],
  },
  {
    heading: "Resources",
    items: [
      "Fuel, Health, and Energy regenerate slowly over time.",
      "Use faction services at sector stations to buy more.",
      "If Health reaches 0 you are eliminated.",
    ],
  },
  {
    heading: "Nav Keys",
    items: [
      "Alpha, Beta, and Gamma keys unlock restricted sectors.",
      "Pick up keys from sectors showing the 🔑 icon.",
      "Fleet members can share keys via the Fleet panel.",
    ],
  },
  {
    heading: "Fleets",
    items: [
      "Create or join a fleet to pool Fleet Power (FP).",
      "Higher FP unlocks stronger faction services.",
      "Only a fleet above the required FP threshold can activate the Beacon.",
    ],
  },
  {
    heading: "Coordinates",
    items: [
      "You carry one coordinate shard (X, Y, Z, or Sector Code).",
      "Exchange shards with nearby players to reconstruct the Beacon's location.",
      "Shared values are masked — only the owner sees the full value.",
    ],
  },
  {
    heading: "The Beacon",
    items: [
      "A convoy carries the Beacon Core across the galaxy.",
      "Intercept the convoy (stand in its sector) to claim the core for your fleet.",
      "Once your fleet has the core and enough FP, use Beacon Activate to win.",
    ],
  },
  {
    heading: "Missions",
    items: [
      "Missions appear in visited sectors and reward resources or FP.",
      "Accept a mission from the Mission panel, then travel to the target sector.",
      "Some missions require fleet members or specific Nav Keys.",
    ],
  },
];

// ---------------------------------------------------------------------------
// HowToPlayPanel
// ---------------------------------------------------------------------------

export function HowToPlayPanel(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [expandedSection, setExpandedSection] = useState<number | null>(null);

  const toggleSection = (i: number) => {
    setExpandedSection((prev) => (prev === i ? null : i));
  };

  const panelStyle: React.CSSProperties = {
    position: "absolute",
    bottom: 52,
    left: 12,
    width: 280,
    background: "rgba(15,23,42,0.96)",
    border: "1px solid #1e293b",
    borderRadius: 8,
    fontFamily: "monospace",
    fontSize: 12,
    color: "#e2e8f0",
    backdropFilter: "blur(4px)",
    zIndex: 50,
  };

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="How to play"
        style={{
          position: "absolute",
          bottom: 12,
          left: 56,
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
        {open ? "Close Guide" : "How to Play"}
      </button>

      {open && (
        <div style={panelStyle}>
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid #1e293b",
              fontWeight: 700,
              fontSize: 12,
              color: "#f1f5f9",
              letterSpacing: 0.5,
            }}
          >
            Quick Reference
          </div>

          <div style={{ maxHeight: 340, overflowY: "auto", padding: "6px 0" }}>
            {SECTIONS.map((section, i) => {
              const isExpanded = expandedSection === i;
              return (
                <div key={section.heading}>
                  <button
                    onClick={() => toggleSection(i)}
                    style={{
                      width: "100%",
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid #1e293b",
                      padding: "8px 14px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer",
                      color: isExpanded ? "#f1f5f9" : "#94a3b8",
                      fontSize: 12,
                      fontFamily: "monospace",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ fontWeight: isExpanded ? 700 : 400 }}>
                      {section.heading}
                    </span>
                    <span style={{ fontSize: 10, color: "#475569" }}>
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </button>

                  {isExpanded && (
                    <div
                      style={{
                        padding: "8px 14px 10px",
                        borderBottom: "1px solid #1e293b",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      {section.items.map((item, j) => (
                        <div
                          key={j}
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "flex-start",
                            color: "#94a3b8",
                            fontSize: 11,
                            lineHeight: 1.6,
                          }}
                        >
                          <span style={{ color: "#3b82f6", flexShrink: 0, marginTop: 1 }}>
                            ›
                          </span>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
