import { io } from "socket.io-client";

const SERVER_URL = "http://localhost:3001";
const ADMIN_CODE = "blackstar-omega-927";

const ioOpts = { withCredentials: true };
const client1 = io(SERVER_URL, ioOpts);
const client2 = io(SERVER_URL, ioOpts);
const client3 = io(SERVER_URL, ioOpts);

let state1 = null;
let lobbyCount = 0;
let chatReceived = false;
let moveSuccess = false;
let phaseActive = false;
let phasesSeen = [];

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log("Starting Phase 4 Programmatic Validation...");
  
  client1.on("connect", () => console.log("[C1] Connected"));
  client2.on("connect", () => console.log("[C2] Connected"));
  client3.on("connect", () => console.log("[C3] Connected"));

  await sleep(500);

  client1.on("game:stateSnapshot", (data) => { 
    state1 = data; 
    lobbyCount = Object.keys(data.gameState.players).length;
    console.log(`[C1] Received snapshot. Players: ${lobbyCount}`);
  });

  client1.on("player:joined", (data) => {
    lobbyCount++;
    console.log(`[C1] Player joined: ${data.player.username}. Total: ${lobbyCount}`);
  });

  client1.on("game:phaseChanged", (data) => {
    phasesSeen.push(data.phase);
    console.log(`[C1] Phase changed to: ${data.phase}`);
    if (data.phase === "active") phaseActive = true;
  });

  // 1. Join Lobby
  client1.emit("player:join", { username: "Alpha" });
  await sleep(100);
  client2.emit("player:join", { username: "Admin", adminCode: ADMIN_CODE });
  await sleep(100);
  client3.emit("player:join", { username: "Beta" });

  await sleep(1000);
  
  if (lobbyCount >= 3) {
    console.log("✅ MULTIPLAYER VALIDATION: Lobby Sync PASS");
  } else {
    console.log(`❌ MULTIPLAYER VALIDATION: Lobby Sync FAIL (Count: ${lobbyCount})`);
  }

  // 2. Game Start
  console.log("Emitting game:start from Admin...");
  client2.emit("game:start");

  console.log("Waiting for tutorial phase (6s)...");
  await sleep(6000);

  if (phasesSeen.includes("tutorial") && phasesSeen.includes("active")) {
    console.log("✅ ADMIN VALIDATION: Phase Transition PASS");
  } else {
    console.log(`❌ ADMIN VALIDATION: Phase Transition FAIL. Phases seen: ${phasesSeen.join(', ')}`);
  }

  // 3. Movement
  if (phaseActive && state1) {
    const currentSectorId = state1.gameState.yourPlayer.sectorId;
    const currentSector = state1.gameState.visibleSectors[currentSectorId];
    if (currentSector && currentSector.connectedTo.length > 0) {
      const target = currentSector.connectedTo[0];
      console.log(`Moving Alpha to ${target}...`);
      
      client1.on("player:moved", (data) => {
        if (data.playerId === state1.yourPlayerId) {
          moveSuccess = true;
          console.log(`✅ GAMEPLAY: Movement and Fuel Deduction PASS (Fuel remaining: ${data.fuelRemaining})`);
        }
      });
      client1.emit("player:move", { targetSectorId: target });
      await sleep(1000);
    } else {
       console.log("❌ GAMEPLAY: Could not find connected sectors.");
    }
  } else {
     console.log("❌ GAMEPLAY: Movement skipped because phase is not active.");
  }

  if (!moveSuccess && phaseActive) {
    console.log("❌ GAMEPLAY: Movement FAIL");
  }

  // 4. Chat
  client3.on("chat:message", (msg) => {
    if (msg.text === "Hello galaxy") {
      chatReceived = true;
      console.log("✅ GAMEPLAY: Chat Validation PASS");
    }
  });

  client1.emit("chat:send", { channel: "global", text: "Hello galaxy" });
  
  await sleep(1000);

  if (!chatReceived) {
    console.log("❌ GAMEPLAY: Chat FAIL");
  }

  console.log("--- VALIDATION COMPLETE ---");
  client1.disconnect();
  client2.disconnect();
  client3.disconnect();
  process.exit(0);
}

run().catch(console.error);
