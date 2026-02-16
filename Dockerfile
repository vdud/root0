# Use a lightweight Node.js image
FROM node:22-slim

# Set working directory
WORKDIR /app

# Copy package.json and pnpm-lock.yaml (if available)
COPY package.json package-lock.json* pnpm-lock.yaml* ./

# Install dependencies
# If you use pnpm, you might need to install it first
RUN npm install -g pnpm && pnpm install

# Copy the rest of the application code
COPY . .

# Build the project if necessary (depends on if the agent needs compiled TS or uses tsx directly)
# For this setup, we will use tsx to run the script directly, so no build step for the agent script itself is strictly needed
# provided we have tsx installed or in dependencies. 
# However, if your project is a SvelteKit app, we might check if we need to build anything shared.
# For the agent script specifically, we just need the source files.

# Ensure the .agent/memories directory exists
RUN mkdir -p .agent/memories

# Define environment variables with defaults
ENV AGENT_NAME="Bunty"
ENV AGENT_PURPOSE="To be a Guide"
ENV AGENT_BEHAVIOUR="Rude yet sarcastic"
ENV NEXT_PUBLIC_PARTYKIT_HOST="localhost:1999"

# Command to run the fleet manager (for multi-agent support)
CMD ["npx", "tsx", "agent/fleet.ts"]
