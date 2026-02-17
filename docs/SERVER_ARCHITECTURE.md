# Server Code Classification

This document outlines which parts of the codebase belong to which server/environment to help you navigate the project.

## 1. AWS Server (Agent Fleet Manager)

This is your **Backend / AI Logic Layer**. It runs as a Docker container on an AWS EC2 instance.

- **Primary Directory:** `agent/`
- **Key Files:**
  - `agent/fleet.ts`: The main entry point for the Fleet Manager API (starts/stops agents).
  - `agent/main.ts`: The logic for individual AI agents.
  - `Dockerfile`: Defines how this server is built.
  - `docker-compose.yml`: Local orchestration for this server.
- **Role:** Manages AI agent processes, handles OpenAI API calls, and (optionally) connects to Postgres for memory.

## 2. PartyKit Server (Game Server)

This is your **Real-time / Multiplayer Layer**. It runs on the PartyKit edge network.

- **Primary Directory:** `src/party/`
- **Key Files:**
  - `src/party/server.ts`: The main entry point. Handles WebSockets, player movement sync, chat broadcasting, and world object state.
  - `partykit.json`: Configuration for the PartyKit server.
- **Role:** The "glues" that connects players. It syncs positions, messages, and game state in real-time.

## 3. Vercel Server (Frontend Web App)

This is your **Frontend / User Interface Layer**. It runs as a SvelteKit application on Vercel's serverless infrastructure.

- **Primary Directories:**
  - `src/routes/`: The pages and API endpoints of your website.
  - `src/lib/`: Reusable UI components (Svelte), utility functions, and client-side logic.
  - `static/`: Public assets like images, models, and global CSS.
- **Key Files:**
  - `svelte.config.js`: Configured with `@sveltejs/adapter-vercel`.
  - `vercel.json`: Vercel-specific configuration.
- **Role:** Delivers the web page to the user's browser, handles routing, and renders the 3D scene (using Three.js/Threlte).

---

## Docker Container Optimization

The `Dockerfile` builds the image for the **AWS Server (Agent Fleet)**.

To keep the container light and secure, we use `.dockerignore` to exclude files not needed by the agent fleet.

**Excluded from Docker Image:**

- `src/routes` (Frontend pages)
- `src/lib/components` (UI components)
- `src/party` (Game server code)
- `static` (3D models, images)
- `docs` (Documentation)

**Included in Docker Image:**

- `agent/` (The core logic)
- `src/lib/network/` (Shared networking logic used by agents)
- `.agent/skills/` (Agent behaviors)
- `package.json` (Dependencies)
