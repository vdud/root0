# Redeployment Quick-Reference

Use this guide when you make changes to the agent code (AI logic, personality, or network protocol) and need to update your AWS server.

## 1. On Your Local Mac

Run these commands in your project root to build the updated image and push it to AWS ECR.

```bash
# A. Build for Intel/AMD architecture (Must use --platform linux/amd64)
docker build --platform linux/amd64 -t root0-agent .

# B. Login to AWS ECR
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 428589675370.dkr.ecr.ap-south-1.amazonaws.com

# C. Tag and Push
docker tag root0-agent:latest 428589675370.dkr.ecr.ap-south-1.amazonaws.com/root0-agent:latest
docker push 428589675370.dkr.ecr.ap-south-1.amazonaws.com/root0-agent:latest
```

### Extras

```bash
# To restart the fleet manager
docker-compose down --remove-orphans && docker-compose up -d
# Check Logs

docker logs -f root0-agent-fleet-1
```

## 2. On Your AWS EC2 Terminal

Connect to your EC2 instance and run these to pull the new version and restart the Fleet Manager.

```bash
# A. Stop and remove the old container
docker rm -f agent-fleet
docker system prune -a -f

# B. Pull the fresh image from ECR
docker pull 428589675370.dkr.ecr.ap-south-1.amazonaws.com/root0-agent:latest

# C. Restart the Fleet Manager
# Replace "YOUR_KEY" with your actual OpenRouter API Key
# docker run -d \
#   --name agent-fleet \
#   -p 3000:3000 \
#   --restart always \
#   -e OPENROUTER_API_KEY="YOUR_KEY" \
#   -e NEXT_PUBLIC_PARTYKIT_HOST="root0-server.vdud.partykit.dev" \
#   428589675370.dkr.ecr.ap-south-1.amazonaws.com/root0-agent:latest


  docker run -d --name agent-fleet -p 3000:3000 --restart always -e OPENROUTER_API_KEY="..." -e NEXT_PUBLIC_PARTYKIT_HOST="root0-server.vdud.partykit.dev" 428589675370.dkr.ecr.ap-south-1.amazonaws.com/root0-agent:latest
```

```bash
# Check logs
docker logs -f agent-fleet
```

> **Note:** The `NEXT_PUBLIC_PARTYKIT_HOST` variable is now optional if you are connecting to production, as it defaults to `root0-server.vdud.partykit.dev` in the code. However, keeping it makes the configuration explicit.

## 3. Update the Frontend (Vercel)

If you modified any files in `src/`, don't forget to push your changes to GitHub to trigger a Vercel redeploy.

```bash
git add .
git commit -m "chore: update agent logic and frontend"
git push origin main
```

---

## Troubleshooting

- **Check Logs:** `docker logs -f agent-fleet`
- **Verify Port 3000:** Check AWS Console -> Security Groups -> Inbound Rules.
- **Architecture Error:** If you see `exec format error`, it means the image was built for `arm64` (Mac) instead of `amd64` (AWS). Re-run the build with the `--platform` flag.

```

```
