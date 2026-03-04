# Redeployment Quick-Reference

Use this guide when you make changes to the agent code (AI logic, personality, or network protocol) and need to update your AWS server.

---

## Logging In

### SSH into EC2

```bash
# This server runs Amazon Linux — use ec2-user (NOT ubuntu)
ssh -i ~/Downloads/root0-ai-agents-aws-key.pem ec2-user@13.204.77.125
```

> **Permission error?** Run `chmod 400 ~/.ssh/YOUR_KEY.pem` first.

---

### AWS CLI Login (for ECR push/pull)

Required before any `docker push` or `docker pull` from ECR. Runs on both your Mac and EC2.

```bash
# First-time setup (run once on a new machine)
aws configure
# Enter: Access Key ID, Secret Access Key, Region: ap-south-1, Output: json

# Login to ECR (token expires every 12 hours — re-run when you get "unauthorized")
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 428589675370.dkr.ecr.ap-south-1.amazonaws.com
```

---

### Git / GitHub Login

```bash
# Option A: GitHub CLI (easiest)
gh auth login

# Option B: Personal Access Token (PAT) via HTTPS
git remote set-url origin https://<YOUR_PAT>@github.com/YOUR_USERNAME/root0.git
```

---

## 1. On Your Local Mac — Build & Push

```bash
# A. Build for AWS (Intel/AMD) — required flag on Mac
docker build --platform linux/amd64 -t root0-agent .

# B. Login to ECR (see above)
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 428589675370.dkr.ecr.ap-south-1.amazonaws.com

# C. Tag and Push
docker tag root0-agent:latest 428589675370.dkr.ecr.ap-south-1.amazonaws.com/root0-agent:latest
docker push 428589675370.dkr.ecr.ap-south-1.amazonaws.com/root0-agent:latest
```

### Local Fleet Manager

```bash
# Restart locally
docker-compose down --remove-orphans && docker-compose up -d

# View logs
docker logs -f root0-agent-fleet-1
```

---

## 2. On EC2 — Pull & Restart

SSH in first (see above), then:

```bash
# A. Stop old container and clean up
docker rm -f agent-fleet
docker system prune -a -f

# B. Login to ECR (on EC2)
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 428589675370.dkr.ecr.ap-south-1.amazonaws.com

# C. Pull latest image
docker pull 428589675370.dkr.ecr.ap-south-1.amazonaws.com/root0-agent:latest

# D. Run the Fleet Manager
docker run -d --name agent-fleet -p 3000:3000 --restart always \
  -e OPENROUTER_API_KEY="..." \
  -e NEXT_PUBLIC_PARTYKIT_HOST="root0-server.vdud.partykit.dev" \
  -e DATABASE_URL="..." \
  428589675370.dkr.ecr.ap-south-1.amazonaws.com/root0-agent:latest

# E. Check logs
docker logs -f --tail 0 agent-fleet
docker logs -f agent-fleet
```

---

## 3. Frontend (Vercel)

If you modified anything in `src/`, push to GitHub to trigger a Vercel redeploy:

```bash
git add .
git commit -m "chore: update agent"
git push origin main
```

---

## Ignore Files Reference

| File              | Purpose                                                        |
| ----------------- | -------------------------------------------------------------- |
| `.gitignore`      | Files Git will never commit (secrets, build outputs, OS junk)  |
| `.dockerignore`   | Excluded from the Docker build context — keeps images lean     |
| `.prettierignore` | Files Prettier won't auto-format (lock files, generated files) |

**Key things that are ignored:**

- `.env` / `.env.*` — **API keys and secrets** — never committed ⚠️
- `node_modules/` — always reinstalled, never shipped
- `.svelte-kit/`, `/build` — build artifacts, regenerated on deploy
- `.agent/memories` — local agent memory (not shipped in Docker image)
- `pnpm-lock.yaml` — not formatted by Prettier (auto-generated)

---

## Troubleshooting

| Problem                                 | Fix                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| `exec format error`                     | Image built for `arm64` (Mac). Re-build with `--platform linux/amd64`               |
| `unauthorized: authentication required` | ECR token expired. Re-run the `aws ecr get-login-password` login                    |
| `Permission denied (publickey)`         | Wrong key file or wrong user. Try `ubuntu@` or `ec2-user@`. Run `chmod 400 key.pem` |
| Port 3000 not reachable                 | AWS Console → Security Groups → Inbound Rules → allow TCP 3000                      |
