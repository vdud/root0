# Root0 Production Deployment Guide

This document outlines the architecture and steps used to deploy the Root0 Agentic Metaverse with a centralized Agent Fleet Manager on AWS and a frontend on Vercel.

## Architecture Overview

- **Frontend:** SvelteKit hosted on **Vercel**.
- **Game Server:** Hosted on **PartyKit** (`root0-server.vdud.partykit.dev`).
- **Agent Fleet Manager:** Node.js API hosted on **AWS EC2** (t2.micro) running in Docker.
- **Image Registry:** **AWS ECR** (ap-south-1).
- **AI Brain:** **OpenRouter API** (Trinity Large model).

---

## 1. The Infrastructure (AWS)

### Elastic Container Registry (ECR)

We created a private repository named `root0-agent`.

- **URI:** `428589675370.dkr.ecr.ap-south-1.amazonaws.com/root0-agent`

### EC2 Instance (The Host)

- **Type:** `t2.micro` (Free Tier)
- **OS:** Amazon Linux 2023
- **Public IP:** `13.204.77.125`
- **Security Group:** Inbound **TCP Port 3000** must be open to `0.0.0.0/0` for the Fleet API.
- **IAM Role:** `EC2-ECR-ReadOnly` (Allows the server to pull images from ECR without manual keys).

---

## 2. Local Build & Push (Mac M-Series)

Because AWS EC2 uses `amd64` architecture and Macs use `arm64`, we use multi-platform builds.

```bash
# 1. Login to AWS ECR
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 428589675370.dkr.ecr.ap-south-1.amazonaws.com

# 2. Build for Intel/AMD (Targeting AWS)
docker build --platform linux/amd64 -t root0-agent .

# 3. Tag and Push
docker tag root0-agent:latest 428589675370.dkr.ecr.ap-south-1.amazonaws.com/root0-agent:latest
docker push 428589675370.dkr.ecr.ap-south-1.amazonaws.com/root0-agent:latest
```

---

## 3. Server Setup (Fleet Manager)

On the EC2 instance terminal, the Fleet Manager is run as a background container. It listens on port 3000 for commands to start/stop AI agents.

```bash
# Start the Fleet Manager
docker run -d \
  --name agent-fleet \
  -p 3000:3000 \
  --restart always \
  -e OPENROUTER_API_KEY="sk-or-v1-..." \
  -e NEXT_PUBLIC_PARTYKIT_HOST="root0-server.vdud.partykit.dev" \
  428589675370.dkr.ecr.ap-south-1.amazonaws.com/root0-agent:latest
```

---

## 4. Frontend Integration (Vercel)

The `AgentManager.svelte.ts` has been updated to point to the EC2 IP.

- **Local Development:** Talks to `http://localhost:3000`.
- **Production:** Talks to `http://13.204.77.125:3000`.

### Important Security Note (Mixed Content)

Vercel uses HTTPS. AWS IP currently uses HTTP. Browsers will block this by default.

- **Temporary Fix:** Click the "Shield/Lock" icon in the browser address bar and "Allow insecure content" for the site.
- **Permanent Fix:** Assign a domain name (e.g., `api.root0.com`) to the EC2 IP and use Cloudflare or Let's Encrypt for SSL.

---

## 5. Operations

### Checking Logs

To see the Fleet Manager logs:
`docker logs -f agent-fleet`

### Cleaning Up

If the server gets slow (too many agents):
`docker restart agent-fleet` (This will stop all running agents).

### Memory Persistence

Currently, agent memories are stored inside the container's ephemeral storage. For long-term memory across server restarts, we should later mount an **AWS EFS** volume to `/app/.agent/memories`.

```

```
