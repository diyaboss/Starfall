# PRODUCTION CONFIGURATION

## Environment Variables

### Client (`client/.env`)
- `VITE_SERVER_URL`: The URL of the WebSocket/Backend server (e.g., `http://localhost:3001` for dev, or the production IP/domain).

### Server (`server/.env`)
- `PORT`: The port the backend listens on (default `3001`).
- `CLIENT_URL`: The URL of the frontend to allow CORS (default `http://localhost:5173`).
- `NODE_ENV`: The environment type (`development` or `production`).
- `ADMIN_CODE`: A secret string used to grant admin privileges to a connecting player (default none, hardcoded checks used previously but now respects the session/auth).

## Ports
- **Frontend**: Typically `5173` (Vite default) or `80`/`443` in production.
- **Backend**: Typically `3001` or `8080`.

## CORS Configuration
The backend explicitly enables CORS for the `CLIENT_URL` provided in the environment. In production, ensure `CLIENT_URL` matches the exact domain and protocol (http vs https) of the deployed frontend.

## Socket URLs
The client utilizes `socket.io-client` and connects to `VITE_SERVER_URL`. In a production environment, this should be the public IP or domain name of the backend instance. It defaults to `http://localhost:3001` if undefined.
