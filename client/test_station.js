import { io } from "socket.io-client";

const SERVER_URL = "http://localhost:3001";
const ADMIN_CODE = "blackstar-omega-927";
const ioOpts = { withCredentials: true };

const admin = io(SERVER_URL, ioOpts);
const player1 = io(SERVER_URL, ioOpts);

let state = null;
let p1Id = null;
let phaseActive = false;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log("=== STATION E2E TEST ===");
  
  // 1. Join
  admin.emit("player:join", { username: "Admin", adminCode: ADMIN_CODE });
  await sleep(200);
  player1.emit("player:join", { username: "Alpha" });
  
  player1.on("game:stateSnapshot", (data) => {
    state = data.gameState;
    p1Id = data.yourPlayerId;
  });

  player1.on("game:phaseChanged", (data) => {
    if (data.phase === "active") phaseActive = true;
  });

  player1.on("player:updated", (data) => {
    if (data.playerId === p1Id) {
      console.log(`[Player Update] Fuel: ${data.fuel}, Health: ${data.health}, Energy: ${data.energy}`);
    }
  });

  player1.on("chat:message", (msg) => {
    if (msg.senderId === "system") {
      console.log(`[System] ${msg.text}`);
    }
  });

  player1.on("error:action", (err) => console.log(`[P1 ERROR] ${err.code}: ${err.message}`));
  admin.on("error:action", (err) => console.log(`[ADMIN ERROR] ${err.code}: ${err.message}`));

  await sleep(1000);
  console.log("✅ Lobby joined.");

  // 2. Start
  admin.emit("game:start");
  console.log("✅ Game start initiated. Waiting for tutorial to end (6s)...");
  
  await sleep(6000);
  if (!phaseActive) {
     console.log("❌ Failed to enter active phase!");
     process.exit(1);
  }
  console.log("✅ Active phase entered.");

  // 3. Move to a station sector. Aether Station is 'inner-aether'
  console.log("Jumping to inner-aether (Aether Station)...");
  player1.emit("player:move", { targetSectorId: "inner-aether" });
  await sleep(1000);

  // Deplete some fuel and health so we can refuel and repair
  // We can't do this directly easily, but we know fuel was spent moving!
  console.log("Using 'fuel_purchase' service...");
  player1.emit("service:use", { serviceId: "svc-inner-aether", serviceType: "fuel_purchase" });
  await sleep(500);

  console.log("Using 'health_purchase' service...");
  player1.emit("service:use", { serviceId: "svc-inner-aether", serviceType: "health_purchase" });
  await sleep(500);

  console.log("Using 'sector_scan' service...");
  player1.emit("service:use", { serviceId: "svc-inner-aether", serviceType: "sector_scan" });
  await sleep(500);

  console.log("=== TEST COMPLETE ===");
  admin.disconnect();
  player1.disconnect();
  process.exit(0);
}

run().catch(console.error);
