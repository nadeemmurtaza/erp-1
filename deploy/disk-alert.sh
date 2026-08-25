#!/usr/bin/env bash
#
# Disk threshold alert.
#
# A full disk on this box does not degrade the shop, it stops it: Postgres
# refuses writes, so checkout fails. Docker is the usual culprit — image
# layers from every deploy, plus container logs that grow without limit.
#
# Warns at WARN_PCT, and at CRIT_PCT reclaims what is provably safe (dangling
# build layers, nothing referenced by a running container) before alerting.

set -Eeuo pipefail

WARN_PCT="${WARN_PCT:-75}"
CRIT_PCT="${CRIT_PCT:-90}"
MOUNT="${MOUNT:-/}"
LOG_TAG="yaseen-disk"
# Optional: an email address, or a webhook that takes a JSON {"text": "..."}.
ALERT_EMAIL="${ALERT_EMAIL:-}"
ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"

log() { echo "[$(date -u +%FT%TZ)] $*"; logger -t "$LOG_TAG" -- "$*" 2>/dev/null || true; }

notify() {
  local subject="$1" body="$2"
  log "$subject — $body"
  if [ -n "$ALERT_EMAIL" ] && command -v mail >/dev/null; then
    printf '%s\n' "$body" | mail -s "$subject" "$ALERT_EMAIL" || log "email alert failed"
  fi
  if [ -n "$ALERT_WEBHOOK" ] && command -v curl >/dev/null; then
    curl -fsS -m 10 -X POST -H 'Content-Type: application/json' \
      --data "$(printf '{"text":"%s: %s"}' "$subject" "$body")" \
      "$ALERT_WEBHOOK" >/dev/null || log "webhook alert failed"
  fi
  if [ -z "$ALERT_EMAIL" ] && [ -z "$ALERT_WEBHOOK" ]; then
    log "no ALERT_EMAIL or ALERT_WEBHOOK configured — this alert reached syslog only"
  fi
}

USED_PCT=$(df --output=pcent "$MOUNT" | tail -1 | tr -dc '0-9')
AVAIL=$(df -h --output=avail "$MOUNT" | tail -1 | tr -d ' ')
log "${MOUNT} at ${USED_PCT}% used, ${AVAIL} free"

if [ "$USED_PCT" -ge "$CRIT_PCT" ]; then
  # Only ever prunes what nothing references: dangling layers and stopped
  # build cache. Named volumes — which is where the database lives — are
  # never touched, so this cannot delete the shop's data.
  log "at or above ${CRIT_PCT}% — reclaiming dangling docker layers"
  BEFORE=$(df --output=avail "$MOUNT" | tail -1)
  docker image prune -f >/dev/null 2>&1 || true
  docker builder prune -f >/dev/null 2>&1 || true
  AFTER=$(df --output=avail "$MOUNT" | tail -1)
  RECLAIMED=$(( (AFTER - BEFORE) / 1024 ))
  NOW_PCT=$(df --output=pcent "$MOUNT" | tail -1 | tr -dc '0-9')
  log "reclaimed ${RECLAIMED}MB, now ${NOW_PCT}%"

  if [ "$NOW_PCT" -ge "$CRIT_PCT" ]; then
    notify "CRITICAL: yaseen.pk disk ${NOW_PCT}% full" \
      "${MOUNT} is ${NOW_PCT}% full with ${AVAIL} free after an automatic prune. Postgres will refuse writes and checkout will fail. Investigate now: docker system df; du -xh --max-depth=2 / | sort -h | tail"
  else
    notify "Recovered: yaseen.pk disk back to ${NOW_PCT}%" \
      "Crossed ${CRIT_PCT}%, reclaimed ${RECLAIMED}MB of docker layers, now ${NOW_PCT}%."
  fi
  exit 0
fi

if [ "$USED_PCT" -ge "$WARN_PCT" ]; then
  notify "Warning: yaseen.pk disk ${USED_PCT}% full" \
    "${MOUNT} is ${USED_PCT}% full, ${AVAIL} free. Automatic pruning begins at ${CRIT_PCT}%."
fi
