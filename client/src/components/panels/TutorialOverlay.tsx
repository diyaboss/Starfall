import React, { useState } from "react";
import { useGameStore, selectPhase, selectMyPlayer } from "@/store/gameStore";

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

interface TutorialStep {
  title: string;
  body: string;
  icon: string;
}

const STEPS: TutorialStep[] = [
  {
    icon: "✦",
    title: "Welcome to Starfall",
    body: "You are a deep-space pilot racing to locate and activate the Beacon Core before rival fleets do. Explore sectors, gather intel, and survive.",
  },
  {
    icon: "🗺",
    title: "Navigating the Galaxy",
    body: "Your ship is the bright node on the map. Click any adjacent sector to travel there. Each hop costs fuel — manage it carefully or you'll drift dead in space.",
  },
  {
    icon: "🔑",
    title: "Nav Keys",
    body: "Sectors marked with a key icon hold Nav Keys (Alpha, Beta, Gamma). Collect them to unlock locked routes and access high-value mission sectors.",
  },
  {
    icon: "🛸",
    title: "Fleets",
    body: "Join or create a fleet to pool Nav Keys and coordinate intel. Fleet Power (FP) determines who can activate the Beacon. Stronger fleets, better odds.",
  },
  {
    icon: "📡",
    title: "The Beacon Convoy",
    body: "A convoy carrying the Beacon Core is moving through the galaxy. Intercept it to claim the core. Once your fleet has enough FP, you can activate the Beacon and win.",
  },
  {
    icon: "📌",
    title: "Coordinates",
    body: "Each pilot holds one coordinate shard (X, Y, Z, or Sector Code). Trade shards with others to assemble the Beacon's full location. Guard your own shard — intel is leverage.",
  },
];

// ---------------------------------------------------------------------------
// TutorialOverlay
// ---------------------------------------------------------------------------

export function TutorialOverlay(): React.ReactElement | null {
  const phase = useGameStore(selectPhase);
  const myPlayer = useGameStore(selectMyPlayer);
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  if (phase !== "tutorial" || !myPlayer || dismissed) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.65)",
        zIndex: 200,
        fontFamily: "monospace",
      }}
    >
      <div
        style={{
          background: "#0f172a",
          border: "1px solid #334155",
          borderRadius: 12,
          padding: "36px 44px",
          width: 480,
          maxWidth: "90vw",
          color: "#e2e8f0",
          position: "relative",
        }}
      >
        {/* Step counter */}
        <div
          style={{
            position: "absolute",
            top: 16,
            right: 20,
            fontSize: 10,
            color: "#475569",
            letterSpacing: 1,
          }}
        >
          {step + 1} / {STEPS.length}
        </div>

        {/* Icon */}
        <div style={{ fontSize: 36, marginBottom: 16, lineHeight: 1 }}>
          {current.icon}
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "#f1f5f9",
            marginBottom: 12,
            letterSpacing: 0.5,
          }}
        >
          {current.title}
        </div>

        {/* Body */}
        <div
          style={{
            fontSize: 13,
            color: "#94a3b8",
            lineHeight: 1.7,
            marginBottom: 28,
          }}
        >
          {current.body}
        </div>

        {/* Step dots */}
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 24,
          }}
        >
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: i === step ? "#3b82f6" : "#1e293b",
                border: "1px solid",
                borderColor: i === step ? "#3b82f6" : "#334155",
                cursor: "pointer",
                transition: "background 0.2s",
              }}
              onClick={() => setStep(i)}
            />
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              style={{
                background: "transparent",
                border: "1px solid #334155",
                borderRadius: 6,
                color: "#94a3b8",
                fontSize: 12,
                padding: "8px 18px",
                cursor: "pointer",
              }}
            >
              Back
            </button>
          )}
          <button
            onClick={() => {
              if (isLast) {
                setDismissed(true);
              } else {
                setStep((s) => s + 1);
              }
            }}
            style={{
              background: "#3b82f6",
              border: "none",
              borderRadius: 6,
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              padding: "8px 20px",
              cursor: "pointer",
            }}
          >
            {isLast ? "Begin" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
