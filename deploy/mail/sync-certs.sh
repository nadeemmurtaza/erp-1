#!/usr/bin/env bash
#
# Hands Caddy's certificate for the mail hostname to Stalwart.
#
# Caddy owns ports 80 and 443 on this box, so Stalwart's own ACME client cannot
# complete an HTTP-01 or TLS-ALPN-01 challenge. DNS-01 would avoid the ports
# entirely, but yaseen.pk is on Contabo's nameservers, which expose no API for
# an ACME client to write the challenge record — so Caddy obtains the
# certificate and this copies it across.
#
# It matters because Stalwart serves SMTP and IMAP itself on 25/465/587/993.
# Without a real certificate there, mail clients get a self-signed one and
# refuse to connect, and the store's own SMTP submission fails TLS verification
# — which is not something to "fix" by turning verification off.
#
# Runs from a systemd timer (deploy/systemd/yaseen-mailcert.timer).
#
# If you ever move DNS to a provider with an API (Cloudflare's is free), drop
# this and let Stalwart do DNS-01 itself. See docs/email.md.

set -Eeuo pipefail

MAIL_HOST="${MAIL_HOST:-mail.yaseen.pk}"
CADDY_CONTAINER="${CADDY_CONTAINER:-yaseen-caddy}"
MAIL_CONTAINER="${MAIL_CONTAINER:-yaseen-stalwart}"
CERT_VOLUME="${CERT_VOLUME:-yaseenecom_mail-certs}"
ACME_DIR="${ACME_DIR:-/data/caddy/certificates/acme-v02.api.letsencrypt.org-directory}"
LOG_TAG="yaseen-mailcert"

log() { echo "[$LOG_TAG] $*"; logger -t "$LOG_TAG" "$*" 2>/dev/null || true; }
die() { log "ERROR: $*"; exit 1; }

SRC_CRT="${ACME_DIR}/${MAIL_HOST}/${MAIL_HOST}.crt"
SRC_KEY="${ACME_DIR}/${MAIL_HOST}/${MAIL_HOST}.key"

# Read the pair out of the Caddy container rather than guessing at the volume's
# path on disk, which depends on the compose project name.
docker exec "$CADDY_CONTAINER" test -f "$SRC_CRT" \
  || die "Caddy has no certificate for ${MAIL_HOST}. Is the ${MAIL_HOST} block in the Caddyfile, and does its DNS point here?"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

docker exec "$CADDY_CONTAINER" cat "$SRC_CRT" > "${TMP}/cert.pem"
docker exec "$CADDY_CONTAINER" cat "$SRC_KEY" > "${TMP}/key.pem"

[ -s "${TMP}/cert.pem" ] && [ -s "${TMP}/key.pem" ] \
  || die 'the copied certificate or key was empty — refusing to install it'

# Compare against what Stalwart is already serving. Let's Encrypt renews every
# 60 days, so a daily timer that restarted regardless would be 59 pointless
# restarts, each one a chance to be down while a customer is ordering.
CURRENT="$(docker run --rm -v "${CERT_VOLUME}:/certs" alpine:3 \
  sh -c 'cat /certs/cert.pem 2>/dev/null || true')"

if [ -n "$CURRENT" ] && [ "$CURRENT" = "$(cat "${TMP}/cert.pem")" ]; then
  log "certificate for ${MAIL_HOST} is already current — nothing to do"
  exit 0
fi

docker run --rm -v "${CERT_VOLUME}:/certs" -v "${TMP}:/src:ro" alpine:3 sh -c '
  set -e
  install -m 0644 /src/cert.pem /certs/cert.pem
  install -m 0600 /src/key.pem  /certs/key.pem
'
log "installed a new certificate for ${MAIL_HOST}"

if docker ps --format '{{.Names}}' | grep -qx "$MAIL_CONTAINER"; then
  # Stalwart is a single Rust binary and comes back in well under a second, so
  # a restart is cheaper here than wiring up its admin API to reload in place.
  docker restart "$MAIL_CONTAINER" >/dev/null
  log "restarted ${MAIL_CONTAINER}"
else
  log "WARNING: ${MAIL_CONTAINER} is not running — certificate staged for its next start"
fi

log "done"
