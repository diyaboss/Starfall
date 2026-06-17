import { io } from "socket.io-client";

const SERVER_URL = "http://localhost:3001";
const ADMIN_CODE = "blackstar-omega-927";
const ioOpts = { withCredentials: true };

const admin = io(SERVER_URL, ioOpts);
const player1 = io(SERVER_URL, ioOpts);

let state = null;
let p1Id = null;
let phaseActive = false;
let gameEnded = false;
let winnerId = null;
let convergenceId = null;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log("=== FULL GAME LOOP END-TO-END TEST ===");
  
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

  player1.on("beacon:phaseChanged", (data) => {
    if (data.phase === "convergence") {
       convergenceId = data.convergenceSectorId;
       console.log(`[Event] Convergence Revealed at ${convergenceId}`);
    }
  });

  player1.on("game:ended", (data) => {
    gameEnded = true;
    winnerId = data.winner;
    console.log(`[Event] Game Ended! Reason: ${data.reason}, Winner: ${data.winner}`);
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

  // 3. Force Convergence Reveal
  admin.emit("admin:revealConvergence", {});
  await sleep(500);

  if (!convergenceId) {
     console.log("❌ Failed to reveal convergence sector!");
     process.exit(1);
  }

  // 4. Cheat: Give Beacon Core to Player 1
  admin.emit("admin:adjustPlayer", { playerId: p1Id, hasBeaconCore: true });
  await sleep(500);
  console.log("✅ Admin granted Beacon Core to Alpha.");

  // 5. Jump to Convergence Sector
  // Actually, player:move doesn't check adjacency heavily if we just pass targetSectorId.
  // Wait, player:move might check adjacency! Let's see if player:move allows arbitrary jumps or if it fails.
  // Let's just emit player:move and see if the server allows it.
  console.log(`Attempting to move Alpha to ${convergenceId}...`);
  player1.emit("player:move", { targetSectorId: convergenceId });
  await sleep(500);
  
  // 6. Activate Beacon
  console.log("Activating the Beacon...");
  player1.emit("beacon:activate", {});
  
  await sleep(1000);
  
  if (gameEnded && winnerId === p1Id) {
     console.log("✅ WIN CONDITION MET! Player Alpha activated the Beacon and won.");
  } else {
     console.log("❌ WIN CONDITION FAILED! Game did not end or winner mismatch.");
  }

  console.log("=== TEST COMPLETE ===");
  admin.disconnect();
  player1.disconnect();
  process.exit(0);
}

run().catch(console.error);
