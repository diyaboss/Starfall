# INSTALLATION GUIDE

This guide walks through setting up Starfall on a completely fresh machine.

## Prerequisites
- Node.js (v18 or v20 recommended)
- Git

## Step-by-Step Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/diyaboss/Starfall.git
   cd Starfall
   ```

2. **Install Dependencies**
   Run the newly added global install script which installs dependencies in the root, `client/`, and `server/` directories:
   ```bash
   npm run install:all
   ```

3. **Configure the Environment (Optional)**
   The default configuration will work for local testing out of the box. For production or networked play, modify the `.env` files:
   - Create `client/.env` and set `VITE_SERVER_URL=http://<YOUR_IP>:3001`
   - Create `server/.env` and set `CLIENT_URL=http://<YOUR_IP>:5173`

4. **Launch the Game**
   ```bash
   npm run dev:all
   ```

5. **Access the Game**
   - Open a browser and navigate to `http://localhost:5173` (or your IP).
