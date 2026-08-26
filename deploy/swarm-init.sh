#!/bin/bash
set -euo pipefail

echo "==============================================="
echo " Yaseen Ecom - Docker Swarm Initialization     "
echo "==============================================="

# 1. Initialize Docker Swarm if not already initialized
if ! docker info --format '{{.Swarm.LocalNodeState}}' | grep -q "active"; then
  echo "Initializing Docker Swarm..."
  docker swarm init
else
  echo "Docker Swarm is already active."
fi

# 2. Create the external yaseen-edge network for Caddy to route traffic
if ! docker network ls | grep -q "yaseen-edge"; then
  echo "Creating overlay network 'yaseen-edge'..."
  docker network create -d overlay --attachable yaseen-edge
else
  echo "Network 'yaseen-edge' already exists."
fi

# 3. Log into GitHub Container Registry
echo ""
echo "-----------------------------------------------"
echo " GHCR Authentication"
echo "-----------------------------------------------"
echo "To pull your private Docker images, the server needs to log into GHCR."
echo "Please provide a GitHub Personal Access Token (PAT) with 'read:packages' permission."
echo ""
read -p "GitHub Username: " GH_USER
read -s -p "GitHub PAT (Token): " GH_TOKEN
echo ""

echo $GH_TOKEN | docker login ghcr.io -u $GH_USER --password-stdin
echo "Successfully logged into GHCR."

# 4. Deploy the Edge stack (Caddy)
echo ""
echo "Deploying the Edge routing stack (Caddy)..."
# Using docker compose config to resolve environment variables just in case, though edge doesn't use many
docker stack deploy -c docker-stack.edge.yml edge

echo ""
echo "==============================================="
echo " Swarm Initialization Complete!"
echo "==============================================="
echo "You can now safely push to the 'main' or 'production' branches,"
echo "and GitHub Actions will automatically deploy to Swarm."
