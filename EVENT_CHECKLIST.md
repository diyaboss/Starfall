# 10-PLAYER EVENT CHECKLIST

This checklist must be reviewed before initiating any organized 10-player match of Starfall.

## Pre-Event Networking
- [ ] **WiFi & LAN Stability**: Ensure the host server and all 10 players are connected to the same stable local network, or that the server's public IP is securely accessible.
- [ ] **CORS Configuration**: Verify the backend `CLIENT_URL` exactly matches the URL players will use to connect.
- [ ] **Socket Verification**: Have one test device join the lobby to confirm the WebSocket connection succeeds and ping is acceptable.

## Host Machine Setup
- [ ] **Admin Authentication**: The host must join first and ensure their `isAdmin` flag is activated (either via DB edit or predefined admin script hook).
- [ ] **Spectator Screen**: The host should dedicate a large monitor to rendering the game HUD, keeping the Admin Status Panel visible.
- [ ] **Server Logs**: Keep a terminal window running the backend logs open in the background to monitor for silent errors or disconnects.

## Player Setup
- [ ] **Browser Requirement**: Ensure players are using modern, updated browsers (Chrome, Firefox, Safari) with hardware acceleration enabled for smooth SVG animations.
- [ ] **Lobby Check**: Before clicking 'Start Simulation', physically count that 10 distinct usernames are present in the Lobby UI.

## In-Game Administration
- [ ] **Monitoring Phase Transitions**: Ensure the game shifts from `active` -> `pre_hunt` -> `convergence` smoothly by observing the Admin HUD.
- [ ] **Reset Protocol**: If the game encounters a catastrophic disconnect (e.g., WiFi router resets), the host must click **Reset Simulation** to clear the corrupted state rather than restarting the Node server.

## Known Issues to Monitor
- Players refreshing mid-game may see a slight flicker as the state syncs; instruct them not to spam refresh.
- Players with strict ad-blockers or privacy extensions may experience WebSocket drops; advise them to disable these for the host URL.
