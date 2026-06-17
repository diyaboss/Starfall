# ENVIRONMENT GUIDE

## `NODE_ENV`
- `development`: Enables verbose error logging and Vite hot-reloading.
- `production`: Disables Vite server in favor of compiled assets. Enforces strict CORS headers based on `CLIENT_URL`.

## `PORT`
- Controls the port the Express backend binds to.
- Ensure this port is open in your firewall (or Docker configuration).
- Default: `3001`

## `CLIENT_URL`
- In `production`, this restricts WebSocket connections (CORS) strictly to this URL.
- Example: `CLIENT_URL=https://starfall-game.yourdomain.com`

## `ADMIN_CODE`
- *(Deprecated Feature Context)* Previously, a specific username string was used to bypass admin checks. This is now fully handled by session/auth, but `ADMIN_CODE` remains in the backend for potential programmatic headless client setups.
- Set to any secure string if you wish to allow an admin script to attach to the backend.
