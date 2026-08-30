#!/usr/bin/env bash
#
# Hands Caddy's certificate for the mail hostname to mailcow.
#
# Caddy owns ports 80 and 443 on this box, so mailcow's own ACME client cannot
# complete a challenge and is switched off (SKIP_LETS_ENCRYPT=y). That solves
# the web UI — Caddy terminates TLS in front of it — but Postfix and Dovecot
# serve SMTP and IMAP on 25/465/587/993 themselves, and they need a real
# certificate of their own. Without this, mail clients get mailcow's
# self-signed snakeoil cert and refuse to connect.
#
# Runs from a systemd timer (deploy/systemd/yaseen-mailcert.timer). Reloading
# Postfix and Dovecot drops nothing: both finish their in-flight connections.
#
# Install: see docs/email.md.

set -Eeuo pipefail

MAIL_HOST="${MAIL_HOST:-mail.yaseen.pk}"
MAILCOW_DIR="${MAILCOW_DIR:-/opt/mailcow-dockerized}"
CADDY_CONTAINER="${CADDY_CONTAINER:-yaseen-caddy}"
ACME_DIR="${ACME_DIR:-/data/caddy/certificates/acme-v02.api.letsencrypt.org-directory}"
LOG_TAG="yaseen-mailcert"

log() { echo "[$LOG_TAG] $*"; logger -t "$LOG_TAG" "$*" 2>/dev/null || true; }
die() { log "ERROR: $*"; exit 1; }

SSL_DIR="${MAILCOW_DIR}/data/assets/ssl"
[ -d "$SSL_DIR" ] || die "mailcow ssl directory not found at ${SSL_DIR} — is MAILCOW_DIR right?"

SRC_CRT="${ACME_DIR}/${MAIL_HOST}/${MAIL_HOST}.crt"
SRC_KEY="${ACME_DIR}/${MAIL_HOST}/${MAIL_HOST}.key"

# Read the pair out of the Caddy container rather than poking at the volume on
# disk: the volume's path on the host depends on the compose project name, and
# Caddy is the component that owns these files anyway.
docker exec "$CADDY_CONTAINER" test -f "$SRC_CRT" \
  || die "Caddy has no certificate for ${MAIL_HOST} yet. Is the ${MAIL_HOST} block in the Caddyfile, and does DNS point at this host?"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

docker exec "$CADDY_CONTAINER" cat "$SRC_CRT" > "${TMP}/cert.pem"
docker exec "$CADDY_CONTAINER" cat "$SRC_KEY" > "${TMP}/key.pem"

[ -s "${TMP}/cert.pem" ] && [ -s "${TMP}/key.pem" ] || die 'copied certificate or key was empty — refusing to install it'

# Only reload when something actually changed. Let's Encrypt renews every 60
# days; a daily timer that restarted Postfix regardless would be 59 pointless
# restarts, each one a chance to be down when a customer orders.
if [ -f "${SSL_DIR}/cert.pem" ] \
  && cmp -s "${TMP}/cert.pem" "${SSL_DIR}/cert.pem" \
  && cmp -s "${TMP}/key.pem" "${SSL_DIR}/key.pem"; then
  log "certificate for ${MAIL_HOST} is already current — nothing to do"
  exit 0
fi

install -m 0644 "${TMP}/cert.pem" "${SSL_DIR}/cert.pem"
install -m 0600 "${TMP}/key.pem" "${SSL_DIR}/key.pem"
log "installed a new certificate for ${MAIL_HOST}"

cd "$MAILCOW_DIR"
for service in postfix-mailcow dovecot-mailcow nginx-mailcow; do
  if docker compose ps --status running --services | grep -qx "$service"; then
    docker compose restart "$service"
    log "restarted ${service}"
  else
    log "WARNING: ${service} is not running — skipped"
  fi
done

log "done"
