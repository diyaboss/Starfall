# STARTUP GUIDE

## One-Command Startup
Starfall can now be launched entirely from the root directory using standard npm commands. We have implemented `concurrently` to orchestrate both the client and server.

1. Ensure you have installed dependencies in the root: `npm run install:all`
2. Run `npm run dev:all` to start both the Vite development server and the Express backend simultaneously.

### Scripts Added
- `npm run dev:all`: Starts both dev servers.
- `npm run build:all`: Compiles both the client (`tsc && vite build`) and server (`tsc`).
- `npm run install:all`: Installs root dependencies, then runs `npm install` inside both `client/` and `server/`.
- `npm run start:all`: Uses Vite's preview mode for the frontend and starts the compiled Node backend.

## Docker Alternative
If you prefer running inside a containerized environment, ensure you create a `docker-compose.yml` defining the Node environment and mapping port 3001 and 5173 to the host. (A basic setup simply runs `npm run dev:all` as the command inside a `node:18` or `node:20` image).
