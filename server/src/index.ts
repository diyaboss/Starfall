// =============================================================================
// STARFALL — Server Entry Point
//
// Boots Express + HTTP server + Socket.IO in the correct order:
//   1. Load .env
//   2. Create Express app (health check, CORS, JSON middleware)
//   3. Create HTTP server wrapping Express
//   4. Attach Socket.IO via initSocketIO()
//   5. Listen
//
// Graceful shutdown:
//   SIGTERM / SIGINT → stop game loop → close HTTP server → exit 0
//   The 5-second hard-kill ensures the process never hangs in CI/CD.
//
// Environment variables (see .env.example):
//   PORT        HTTP port (default 3001)
//   CLIENT_URL  CORS origin for Express AND Socket.IO (default http://localhost:5173)
//   ADMIN_CODE  Secret code granting admin on join (default starfall-admin)
//   NODE_ENV    development | production
// =============================================================================

import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import { initSocketIO } from "./socket";
import { stopGameLoop } from "./loops/gameLoop";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const PORT = Number(process.env["PORT"] ?? 3001);
const CLIENT_URL = process.env["CLIENT_URL"] ?? "http://localhost:5173";
const NODE_ENV = process.env["NODE_ENV"] ?? "development";

// ---------------------------------------------------------------------------
// Express
// ---------------------------------------------------------------------------

const app = express();

// CORS for standard HTTP routes (Socket.IO handles its own CORS in socket.ts)
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json());

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    env: NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ── Catch-all for undefined HTTP routes ──────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const httpServer = http.createServer(app);

// ---------------------------------------------------------------------------
// Socket.IO
// ---------------------------------------------------------------------------

initSocketIO(httpServer);

// ---------------------------------------------------------------------------
// Listen
// ---------------------------------------------------------------------------

httpServer.listen(PORT, () => {
  console.log(
    "[server] Starfall server listening on port %d  (env=%s, cors=%s)",
    PORT,
    NODE_ENV,
    CLIENT_URL
  );
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function shutdown(signal: string): void {
  console.log("\n[server] %s received — shutting down…", signal);

  // Hard-kill after 5 seconds so the process never hangs
  const killTimer = setTimeout(() => {
    console.error("[server] Graceful shutdown timed out. Force-exiting.");
    process.exit(1);
  }, 5_000);

  // Allow the timer to be GC-collected rather than holding the event loop open
  if (typeof killTimer.unref === "function") {
    killTimer.unref();
  }

  stopGameLoop();

  httpServer.close(() => {
    console.log("[server] HTTP server closed. Goodbye.");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
