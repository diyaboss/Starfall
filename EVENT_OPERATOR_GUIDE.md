# EVENT OPERATOR GUIDE

This guide is for admins running live instances of Starfall for a group of players.

## Starting a Match
1. Players will join and spawn into the `inner-aether`.
2. Once the desired number of players have joined, the Admin (with an authenticated admin flag) clicks **Start Simulation** from the HUD.
3. This shifts the server phase from `lobby` to `active` and reveals the map.

## Resetting a Match
At any point, the Admin can click **Reset Simulation** from their Host dashboard. This emits `admin:resetGame` to the server, which:
- Retains all connected socket connections.
- Purges all fleets, inventories, and map exploration.
- Resets the `beacon` and `npcConvoys`.
- Generates new coordinate shards.
- Moves everyone back to the `lobby` phase.

## Observing Players & Spectator Mode
Admins inherently bypass fog of war. The entire map is visible, along with every player's real-time position.
- **Admin Status Panel:** Located in the top left, this gives you at-a-glance metrics for total players, fleets, and beacon phase.
- **Convergence Target:** The target sector is visible to admins from game start, allowing them to anticipate where the final race will end.

## Handling Reconnects
Starfall uses stable `socketToPlayerId` mapping based on the player's initial connection UUID (or auth token).
If a player drops connection (Wi-Fi issue, closed tab):
- They remain in the game state for 5 minutes (`player.isConnected = false`).
- If they refresh the page or reopen the tab within that window, they will automatically rejoin their existing session, retaining their fleet, inventory, and location.

## Stuck Matches
If the Beacon phase is stuck, or players are completely lost, admins have options:
1. **Trigger Beacon Alert**: Emits an early sighting of the convoy.
2. **Reveal Convergence**: Forces the convergence sector to become visible to all players regardless of their shard count.
*(Note: These functions require implementing UI buttons that emit `admin:triggerSighting` or `admin:revealConvergence`)*
