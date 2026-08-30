#!/usr/bin/env bash
#
# Nightly production backup: dump, compress, verify, ship off-site, prune.
#
# A backup that has never been restored is a hope, not a backup — so this
# does not just write a file and call it done. Every dump is restored into a
# throwaway database and checked for the rows it should contain before it is
# allowed to count, and the local copy is only pruned after the off-site copy
# is confirmed present.
#
# Install: see DEPLOYMENT.md §11. Runs as the deploy user from a systemd timer.

set -Eeuo pipefail

STACK_DIR="${STACK_DIR:-$HOME/apps/yaseenecom}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
CONTAINER="${CONTAINER:-yaseen-postgres-prod}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
# Off-site target, e.g. s3://yaseen-backups/postgres. Empty disables shipping,
# and the script then says so loudly rather than pretending it is safe.
S3_TARGET="${S3_TARGET:-}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="${BACKUP_DIR}/prod-${STAMP}.sql.gz"
LOG_TAG="yaseen-backup"

log()  { echo "[$(date -u +%FT%TZ)] $*"; logger -t "$LOG_TAG" -- "$*" 2>/dev/null || true; }
fail() { log "FAILED: $*"; exit 1; }
trap 'fail "aborted on line $LINENO"' ERR

# Read the credentials the stack itself uses, so this never drifts from them.
[ -f "${STACK_DIR}/.env.production" ] || fail "no ${STACK_DIR}/.env.production"
# shellcheck disable=SC1091
set -a; source "${STACK_DIR}/.env.production"; set +a
PGUSER_="${POSTGRES_USER:-yaseen}"
PGDB_="${POSTGRES_DB:-yaseen}"
# The mail server keeps its mailboxes in a second database inside this same
# Postgres (deploy/mail/init-postgres.sql). Dumping only the store's database
# would leave every mailbox unbacked, which nobody notices until a restore.
MAIL_DB_="${MAIL_DB:-stalwart}"
MAIL_ARCHIVE="${BACKUP_DIR}/mail-${STAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

# --- 1. Dump ---------------------------------------------------------------
log "dumping ${PGDB_} from ${CONTAINER}"
docker exec "$CONTAINER" pg_dump -U "$PGUSER_" -d "$PGDB_" --no-owner --clean --if-exists \
  | gzip -9 > "$ARCHIVE"

SIZE=$(stat -c%s "$ARCHIVE")
[ "$SIZE" -gt 1024 ] || fail "dump is only ${SIZE} bytes — refusing to trust it"
gzip -t "$ARCHIVE" || fail "archive fails its gzip integrity check"
log "dump ok: $(basename "$ARCHIVE") ($(numfmt --to=iec "$SIZE"))"

# --- 2. Restoration test ---------------------------------------------------
# The part that turns a file into a backup. Restore into a scratch database
# and assert the tables that must never be empty actually have rows.
SCRATCH="restore_check_${STAMP}"
log "restore test into ${SCRATCH}"
cleanup_scratch() {
  docker exec "$CONTAINER" psql -U "$PGUSER_" -d postgres \
    -c "DROP DATABASE IF EXISTS \"${SCRATCH}\";" >/dev/null 2>&1 || true
}
trap 'cleanup_scratch; fail "aborted on line $LINENO"' ERR

docker exec "$CONTAINER" psql -U "$PGUSER_" -d postgres \
  -c "CREATE DATABASE \"${SCRATCH}\";" >/dev/null

gunzip -c "$ARCHIVE" | docker exec -i "$CONTAINER" \
  psql -v ON_ERROR_STOP=1 -U "$PGUSER_" -d "$SCRATCH" >/dev/null 2>&1 \
  || fail "restore test failed — the dump does not load cleanly"

# A schema can restore perfectly and hold nothing. Check the tables whose
# emptiness would mean the shop is gone.
for table in Product Permission User; do
  COUNT=$(docker exec "$CONTAINER" psql -tAX -U "$PGUSER_" -d "$SCRATCH" \
    -c "SELECT count(*) FROM \"${table}\";" 2>/dev/null || echo 0)
  [ "${COUNT:-0}" -gt 0 ] || fail "restored ${table} is empty — backup is not usable"
  log "  ${table}: ${COUNT} rows"
done

cleanup_scratch
trap 'fail "aborted on line $LINENO"' ERR
log "restore test PASSED"

# --- 2b. Mail database ------------------------------------------------------
# Runs after the shop's dump is proven, so a mail problem can never cost us the
# backup that matters most. Skipped silently when mail is not set up yet.
MAIL_PRESENT=$(docker exec "$CONTAINER" psql -tAX -U "$PGUSER_" -d postgres \
  -c "SELECT 1 FROM pg_database WHERE datname = '${MAIL_DB_}';" 2>/dev/null || echo '')

if [ -z "$MAIL_PRESENT" ]; then
  log "no ${MAIL_DB_} database — skipping mail backup"
else
  log "dumping ${MAIL_DB_} from ${CONTAINER}"
  docker exec "$CONTAINER" pg_dump -U "$PGUSER_" -d "$MAIL_DB_" --no-owner --clean --if-exists \
    | gzip -9 > "$MAIL_ARCHIVE"

  MAIL_SIZE=$(stat -c%s "$MAIL_ARCHIVE")
  [ "$MAIL_SIZE" -gt 1024 ] || fail "mail dump is only ${MAIL_SIZE} bytes — refusing to trust it"
  gzip -t "$MAIL_ARCHIVE" || fail "mail archive fails its gzip integrity check"

  # Same principle as above: prove it loads. The row assertions are structural
  # rather than by name — Stalwart owns this schema and renames tables between
  # versions, so asserting on a table name would turn an upgrade into a failed
  # backup. A restore that produces no tables at all is still caught.
  MAIL_SCRATCH="mail_restore_check_${STAMP}"
  cleanup_mail_scratch() {
    docker exec "$CONTAINER" psql -U "$PGUSER_" -d postgres \
      -c "DROP DATABASE IF EXISTS \"${MAIL_SCRATCH}\";" >/dev/null 2>&1 || true
  }
  trap 'cleanup_mail_scratch; fail "aborted on line $LINENO"' ERR

  docker exec "$CONTAINER" psql -U "$PGUSER_" -d postgres \
    -c "CREATE DATABASE \"${MAIL_SCRATCH}\";" >/dev/null

  gunzip -c "$MAIL_ARCHIVE" | docker exec -i "$CONTAINER" \
    psql -v ON_ERROR_STOP=1 -U "$PGUSER_" -d "$MAIL_SCRATCH" >/dev/null 2>&1 \
    || fail "mail restore test failed — the dump does not load cleanly"

  MAIL_TABLES=$(docker exec "$CONTAINER" psql -tAX -U "$PGUSER_" -d "$MAIL_SCRATCH" \
    -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null || echo 0)
  [ "${MAIL_TABLES:-0}" -gt 0 ] || fail "restored mail database has no tables — backup is not usable"

  cleanup_mail_scratch
  trap 'fail "aborted on line $LINENO"' ERR
  log "mail dump ok: $(basename "$MAIL_ARCHIVE") ($(numfmt --to=iec "$MAIL_SIZE")), ${MAIL_TABLES} tables"
fi

# Message bodies live on a Docker volume, not in Postgres, so they are NOT in
# this dump. That is deliberate — see docker-compose.mail.yml — but it means a
# full mail restore also needs the stalwart-data volume. docs/email.md says how.

# --- 3. Off-site ------------------------------------------------------------
if [ -n "$S3_TARGET" ]; then
  command -v aws >/dev/null || fail "S3_TARGET set but the aws CLI is not installed"
  log "uploading to ${S3_TARGET}"
  for archive in "$ARCHIVE" $([ -f "$MAIL_ARCHIVE" ] && echo "$MAIL_ARCHIVE"); do
    aws s3 cp "$archive" "${S3_TARGET%/}/$(basename "$archive")" --only-show-errors \
      || fail "off-site upload failed for $(basename "$archive")"
    # Confirm it is actually there before the local copy is eligible for pruning.
    aws s3 ls "${S3_TARGET%/}/$(basename "$archive")" >/dev/null \
      || fail "upload of $(basename "$archive") reported success but the object is not listed"
    log "off-site copy confirmed: $(basename "$archive")"
  done
else
  log "WARNING: S3_TARGET is unset — this backup exists only on this VPS, which"
  log "WARNING: does not survive losing this VPS. See DEPLOYMENT.md §11."
fi

# --- 4. Prune ---------------------------------------------------------------
# Local only. Off-site retention belongs in an S3 lifecycle rule, where a
# compromised VPS cannot reach it.
find "$BACKUP_DIR" \( -name 'prod-*.sql.gz' -o -name 'mail-*.sql.gz' \) \
  -mtime "+${RETAIN_DAYS}" -print -delete \
  | while read -r old; do log "pruned $(basename "$old")"; done

log "backup complete"
