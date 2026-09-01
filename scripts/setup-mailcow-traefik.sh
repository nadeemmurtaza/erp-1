#!/bin/bash
# Mailcow + Coolify Traefik Integration Script
# Run this on your Contabo VPS as root
#
# This script:
# 1. Finds Coolify's Traefik container
# 2. Creates a shared Docker network
# 3. Connects both Traefik and Mailcow nginx to it
# 4. Reconfigures Mailcow to bind internally only (127.0.0.1:8080/8443)
# 5. Adds Traefik labels to Mailcow's nginx service
# 6. Disables Mailcow's ACME (Traefik handles Let's Encrypt)
# 7. Restarts Mailcow
#
# After running, access:
#   https://mail.yaseen.pk/admin/   (admin UI)
#   https://mail.yaseen.pk/SOGo     (webmail)

set -e

MAILCOW_DIR="/opt/mailcow-dockerized"
SHARED_NETWORK="mailcow-shared"

echo "=== Mailcow + Traefik Integration ==="
echo ""

# Step 1: Find Traefik container
echo "[1/7] Finding Coolify's Traefik container..."
TRAEFIK_CONTAINER=$(docker ps --format '{{.Names}}' | grep -i traefik | head -1)

if [ -z "$TRAEFIK_CONTAINER" ]; then
    echo "ERROR: No Traefik container found. Is Coolify running?"
    echo "Run: docker ps | grep -i traefik"
    exit 1
fi
echo "  Found: $TRAEFIK_CONTAINER"

# Step 2: Create shared network
echo ""
echo "[2/7] Creating shared Docker network..."
if docker network inspect "$SHARED_NETWORK" >/dev/null 2>&1; then
    echo "  Network '$SHARED_NETWORK' already exists"
else
    docker network create "$SHARED_NETWORK"
    echo "  Created: $SHARED_NETWORK"
fi

# Step 3: Connect Traefik to shared network
echo ""
echo "[3/7] Connecting Traefik to shared network..."
if docker network inspect "$SHARED_NETWORK" --format '{{range .Containers}}{{.Name}} {{end}}' | grep -q "$TRAEFIK_CONTAINER"; then
    echo "  Traefik already connected"
else
    docker network connect "$SHARED_NETWORK" "$TRAEFIK_CONTAINER"
    echo "  Connected: $TRAEFIK_CONTAINER"
fi

# Step 4: Connect Mailcow nginx to shared network
echo ""
echo "[4/7] Connecting Mailcow nginx to shared network..."
if docker network inspect "$SHARED_NETWORK" --format '{{range .Containers}}{{.Name}} {{end}}' | grep -q "nginx-mailcow"; then
    echo "  Mailcow nginx already connected"
else
    docker network connect "$SHARED_NETWORK" nginx-mailcow
    echo "  Connected: nginx-mailcow"
fi

# Step 5: Reconfigure Mailcow ports to internal-only
echo ""
echo "[5/7] Reconfiguring Mailcow to bind internally (127.0.0.1:8080/8443)..."
cd "$MAILCOW_DIR"

# Update mailcow.conf
sed -i 's/^HTTP_PORT=.*/HTTP_PORT=8080/' mailcow.conf
sed -i 's/^HTTPS_PORT=.*/HTTPS_PORT=8443/' mailcow.conf
sed -i 's/^HTTP_BIND=.*/HTTP_BIND=127.0.0.1/' mailcow.conf
sed -i 's/^HTTPS_BIND=.*/HTTPS_BIND=127.0.0.1/' mailcow.conf

# Update .env (Mailcow reads from here)
sed -i 's/^HTTP_PORT=.*/HTTP_PORT=8080/' .env
sed -i 's/^HTTPS_PORT=.*/HTTPS_PORT=8443/' .env
sed -i 's/^HTTP_BIND=.*/HTTP_BIND=127.0.0.1/' .env
sed -i 's/^HTTPS_BIND=.*/HTTPS_BIND=127.0.0.1/' .env

echo "  Updated mailcow.conf and .env"

# Step 6: Add Traefik labels to nginx-mailcow in docker-compose.yml
echo ""
echo "[6/7] Adding Traefik labels to nginx-mailcow..."

# Check if labels already exist
if grep -q "traefik.enable=true" docker-compose.yml; then
    echo "  Traefik labels already present"
else
    # Create a temporary file with the nginx-mailcow service updated
    python3 << 'PYEOF'
import re

with open('docker-compose.yml', 'r') as f:
    content = f.read()

# Find the nginx-mailcow service and add labels + networks
# This is a targeted edit - find the service block and add labels
old_nginx = '''  nginx-mailcow:
    image: ghcr.io/mailcow/nginx:1.30.4-1
    restart: unless-stopped
    environment:
      TZ: ${TZ}
    volumes:
      - ./data/conf/nginx/:/etc/nginx/conf.d/:ro
      - ./data/assets/:/assets/:ro
    networks:
      - mailcow-network'''

new_nginx = '''  nginx-mailcow:
    image: ghcr.io/mailcow/nginx:1.30.4-1
    restart: unless-stopped
    environment:
      TZ: ${TZ}
    volumes:
      - ./data/conf/nginx/:/etc/nginx/conf.d/:ro
      - ./data/assets/:/assets/:ro
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.mailcow.rule=Host(`mail.yaseen.pk`)"
      - "traefik.http.routers.mailcow.entrypoints=websecure"
      - "traefik.http.routers.mailcow.tls.certresolver=letsencrypt"
      - "traefik.http.services.mailcow.loadbalancer.server.port=80"
    networks:
      - mailcow-network
      - mailcow-shared'''

if old_nginx in content:
    content = content.replace(old_nginx, new_nginx)
    with open('docker-compose.yml', 'w') as f:
        f.write(content)
    print("  Added Traefik labels and shared network")
else:
    print("  WARNING: Could not find nginx-mailcow service block.")
    print("  You may need to add labels manually. See docs/email.md step 3.")
PYEOF
fi

# Step 7: Stop ACME and restart Mailcow
echo ""
echo "[7/7] Stopping ACME and restarting Mailcow..."
docker compose stop acme-mailcow 2>/dev/null || echo "  ACME already stopped"
docker compose down
docker compose up -d

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Mailcow is now running behind Traefik on standard HTTPS."
echo ""
echo "Test it:"
echo "  curl -I https://mail.yaseen.pk/admin/"
echo ""
echo "If that returns HTTP 200, you're done."
echo ""
echo "Next steps:"
echo "  1. Set PTR record in Contabo panel: mail.yaseen.pk"
echo "  2. Publish DNS records (see docs/email.md step 4)"
echo "  3. Create mailboxes in admin UI"
echo "  4. Generate DKIM key and publish DNS"
echo "  5. Set SMTP env vars on API resource in Coolify"
