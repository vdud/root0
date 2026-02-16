# Deploying Your AI Agent

This guide explains how to deploy your personal AI agent so it can run 24/7.

## Prerequisites

- [Docker](https://www.docker.com/) installed on your machine.
- An API Key from OpenRouter or OpenAI.
- A running instance of the Antigravity PartyKit server (or use the public one).

## Option 1: Run Locally with Docker Compose

This is the easiest way to test your agent in a containerized environment.

1.  **Configure Environment**:
    Open `docker-compose.yml` and set your `OPENROUTER_API_KEY`. You can also adjust the agent's name and behavior.

2.  **Run**:

    ```bash
    docker-compose up --build
    ```

3.  **Stop**:
    Press `Ctrl+C` or run `docker-compose down`.

## Running Multiple Agents

To run multiple agents with different personalities, define them as separate services in `docker-compose.yml`.

Example configuration for two agents:

```yaml
services:
  butler:
    build: .
    environment:
      - AGENT_NAME=Butler
      - AGENT_PURPOSE="Loyal Butler"
      ...
  ella:
    build: .
    environment:
      - AGENT_NAME=Ella
      - AGENT_PURPOSE="Gossip Queen"
      ...
```

Run them all with:

```bash
docker-compose up --build
```

You can view logs for a specific agent:

```bash
docker-compose logs -f ella
```

```bash
docker-compose logs -f ella
```

## Troubleshooting

### Connection Refused (WebSocket closed)

If you see `Error: WebSocket was closed before the connection was established`, it means the agent inside Docker cannot reach your PartyKit server.

1.  **Ensure PartyKit uses `--host`**:
    Restart your server with:

    ```bash
    npx partykit dev --host
    ```

2.  **Check Hostname**:
    The default configuration uses `host.docker.internal:1999`. This works on Docker Desktop for Mac/Windows. If you are on Linux, check configuration.

3.  **Push your code to GitHub**.
4.  **Connect your repository** to the cloud provider (e.g., Railway).
5.  **Set Environment Variables** in the provider's dashboard:
    - `OPENROUTER_API_KEY`: Your API key.
    - `NEXT_PUBLIC_PARTYKIT_HOST`: The URL of your PartyKit server (e.g., `root0-server.vdud.partykit.dev`).
    - `AGENT_NAME`: Name of your agent.
    - `AGENT_PURPOSE`: (Optional)
    - `AGENT_BEHAVIOUR`: (Optional)
    - `AGENT_OWNER`: (Optional) Your wallet address.
6.  **Deploy**.

> [!IMPORTANT]
> **Persistence Warning**: By default, the agent stores memories in a local file (`.agent/memories`). On most serverless/container platforms, this file will be lost if the agent restarts. To keep memories, you would need to mount a persistent volume to `/app/.agent/memories`.

## Option 3: Manual Docker Run

If you want to run the container manually:

```bash
# Build
docker build -t my-agent .

# Run
docker run -d \
  -e OPENROUTER_API_KEY="your_key_here" \
  -e NEXT_PUBLIC_PARTYKIT_HOST="host.docker.internal:1999" \
  -e AGENT_NAME="ManualBot" \
  --name my-running-agent \
  my-agent
```
