#!/usr/bin/env bash
set -Eeuo pipefail

LIVE_DIR="${LIVE_DIR:-/projects/LIVE}"
SOURCE_DIR="${SOURCE_DIR:-/projects/V3}"
BRANCH="${BRANCH:-v3}"
LIVE_SERVICE="${LIVE_SERVICE:-leighpogo.service}"
LIVE_DB="${LIVE_DB:-${LIVE_DIR}/prisma/dev.db}"
BACKUP_ROOT="${BACKUP_ROOT:-/projects/backups/leighpogo}"
STAMP="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="${BACKUP_ROOT}/v3-promotion-${STAMP}"

LIVE_HEAD_BEFORE=""
LIVE_WAS_ACTIVE=0
CUTOVER_STARTED=0
CODE_UPDATED=0
SUCCESS=0
LIVE_DB_OWNER=""
LIVE_DB_MODE=""
LIVE_ENV_OWNER=""
LIVE_ENV_MODE=""
ORIGINAL_USERS=""

log() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$*"
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

service_is_active() {
  systemctl is-active --quiet "$1"
}

assert_live_user_database() {
  local db="$1"
  local has_user_table user_count integrity

  [[ -f "$db" ]] || die "Database does not exist: $db"
  integrity="$(sqlite3 "$db" 'PRAGMA integrity_check;')"
  [[ "$integrity" == "ok" ]] || die "Database integrity check failed for $db: $integrity"

  has_user_table="$(sqlite3 "$db" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='User';")"
  [[ "$has_user_table" == "1" ]] || die "Refusing to use $db: User table is missing"

  user_count="$(sqlite3 "$db" 'SELECT COUNT(*) FROM User;')"
  [[ "$user_count" =~ ^[0-9]+$ ]] || die "Unable to read User count from $db"
  (( user_count > 0 )) || die "Refusing to use $db: User table is empty"

  printf '%s' "$user_count"
}

sqlite_snapshot() {
  local source="$1"
  local destination="$2"

  mkdir -p "$(dirname "$destination")"
  rm -f "$destination"
  sqlite3 "$source" "PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null
  sqlite3 "$source" ".backup '$destination'"
  [[ -s "$destination" ]] || die "SQLite snapshot was not created: $destination"
}

snapshot_runtime() {
  local destination="$1"

  mkdir -p "$destination/data" "$destination/public-uploads"

  for filename in \
    event-overrides.json \
    event-type-rules.json \
    local-events.json \
    gyms.json \
    pokemon-availability-overrides.json; do
    if [[ -f "$LIVE_DIR/data/$filename" ]]; then
      cp -a "$LIVE_DIR/data/$filename" "$destination/data/$filename"
    fi
  done

  if [[ -d "$LIVE_DIR/content/guides" ]]; then
    mkdir -p "$destination/content-guides"
    rsync -a "$LIVE_DIR/content/guides/" "$destination/content-guides/"
  fi

  if [[ -d "$LIVE_DIR/public/uploads/guides" ]]; then
    mkdir -p "$destination/public-uploads/guides"
    rsync -a "$LIVE_DIR/public/uploads/guides/" "$destination/public-uploads/guides/"
  fi
}

restore_runtime() {
  local source="$1"

  for filename in \
    event-overrides.json \
    event-type-rules.json \
    local-events.json \
    gyms.json \
    pokemon-availability-overrides.json; do
    if [[ -f "$source/data/$filename" ]]; then
      mkdir -p "$LIVE_DIR/data"
      cp -a "$source/data/$filename" "$LIVE_DIR/data/$filename"
    fi
  done

  if [[ -d "$source/content-guides" ]]; then
    mkdir -p "$LIVE_DIR/content/guides"
    rsync -a --delete "$source/content-guides/" "$LIVE_DIR/content/guides/"
  fi

  if [[ -d "$source/public-uploads/guides" ]]; then
    mkdir -p "$LIVE_DIR/public/uploads/guides"
    rsync -a --delete "$source/public-uploads/guides/" "$LIVE_DIR/public/uploads/guides/"
  fi
}

set_database_url() {
  local env_file="$LIVE_DIR/.env"
  if grep -q '^DATABASE_URL=' "$env_file"; then
    sed -i 's|^DATABASE_URL=.*$|DATABASE_URL="file:./dev.db"|' "$env_file"
  else
    printf '%s\n' 'DATABASE_URL="file:./dev.db"' >> "$env_file"
  fi
}

rollback() {
  local exit_code=$?
  trap - ERR EXIT

  if (( SUCCESS )); then
    exit 0
  fi

  if (( ! CUTOVER_STARTED )); then
    exit "$exit_code"
  fi

  echo >&2
  echo "V3 promotion failed; restoring the previous LIVE release and database." >&2
  systemctl stop "$LIVE_SERVICE" >/dev/null 2>&1 || true

  if [[ -n "$LIVE_HEAD_BEFORE" ]] && (( CODE_UPDATED )); then
    git -C "$LIVE_DIR" reset --hard "$LIVE_HEAD_BEFORE" >/dev/null 2>&1 || true
  fi

  if [[ -f "$RUN_DIR/live.env" ]]; then
    cp -a "$RUN_DIR/live.env" "$LIVE_DIR/.env"
    [[ -n "$LIVE_ENV_OWNER" ]] && chown "$LIVE_ENV_OWNER" "$LIVE_DIR/.env" || true
    [[ -n "$LIVE_ENV_MODE" ]] && chmod "$LIVE_ENV_MODE" "$LIVE_DIR/.env" || true
  fi

  if [[ -f "$RUN_DIR/live.db" ]]; then
    mkdir -p "$(dirname "$LIVE_DB")"
    rm -f "$LIVE_DB" "$LIVE_DB-wal" "$LIVE_DB-shm"
    cp -a "$RUN_DIR/live.db" "$LIVE_DB"
    [[ -n "$LIVE_DB_OWNER" ]] && chown "$LIVE_DB_OWNER" "$LIVE_DB" || true
    [[ -n "$LIVE_DB_MODE" ]] && chmod "$LIVE_DB_MODE" "$LIVE_DB" || true
  fi

  [[ -d "$RUN_DIR/runtime" ]] && restore_runtime "$RUN_DIR/runtime" || true

  if (( CODE_UPDATED )); then
    (
      cd "$LIVE_DIR"
      npm ci >/dev/null 2>&1 && npm run build >/dev/null 2>&1
    ) || true
  fi

  if (( LIVE_WAS_ACTIVE )); then
    systemctl start "$LIVE_SERVICE" >/dev/null 2>&1 || true
  fi

  echo "Rollback finished. Backup retained at: $RUN_DIR" >&2
  exit "$exit_code"
}

trap rollback ERR EXIT

[[ ${EUID} -eq 0 ]] || die "Run this script with sudo."
for command in git npm sqlite3 rsync systemctl stat sed grep chown chmod; do
  need "$command"
done

[[ -d "$LIVE_DIR/.git" ]] || die "LIVE checkout not found at $LIVE_DIR"
[[ -d "$SOURCE_DIR/.git" ]] || die "V3 checkout not found at $SOURCE_DIR"
[[ -f "$LIVE_DIR/.env" ]] || die "LIVE .env not found at $LIVE_DIR/.env"
[[ -f "$LIVE_DB" ]] || die "LIVE database not found at $LIVE_DB"

ORIGINAL_USERS="$(assert_live_user_database "$LIVE_DB")"
LIVE_HEAD_BEFORE="$(git -C "$LIVE_DIR" rev-parse HEAD)"
LIVE_DB_OWNER="$(stat -c '%u:%g' "$LIVE_DB")"
LIVE_DB_MODE="$(stat -c '%a' "$LIVE_DB")"
LIVE_ENV_OWNER="$(stat -c '%u:%g' "$LIVE_DIR/.env")"
LIVE_ENV_MODE="$(stat -c '%a' "$LIVE_DIR/.env")"

if service_is_active "$LIVE_SERVICE"; then
  LIVE_WAS_ACTIVE=1
fi
CUTOVER_STARTED=1

log "Fetching the V3 release"
git -C "$SOURCE_DIR" fetch origin "$BRANCH"
SOURCE_SHA="$(git -C "$SOURCE_DIR" rev-parse "origin/$BRANCH")"
git -C "$LIVE_DIR" fetch origin "$BRANCH"

log "Stopping LIVE before taking the final database snapshot"
systemctl stop "$LIVE_SERVICE"
service_is_active "$LIVE_SERVICE" && die "$LIVE_SERVICE is still active"

log "Backing up the real LIVE database, environment and runtime data"
mkdir -p "$RUN_DIR"
sqlite_snapshot "$LIVE_DB" "$RUN_DIR/live.db"
BACKUP_USERS="$(assert_live_user_database "$RUN_DIR/live.db")"
[[ "$BACKUP_USERS" == "$ORIGINAL_USERS" ]] || die "Backup user count changed: $ORIGINAL_USERS -> $BACKUP_USERS"
cp -a "$LIVE_DIR/.env" "$RUN_DIR/live.env"
snapshot_runtime "$RUN_DIR/runtime"
printf '%s\n' "$LIVE_HEAD_BEFORE" > "$RUN_DIR/live-git-head.txt"
printf '%s\n' "$SOURCE_SHA" > "$RUN_DIR/v3-git-head.txt"

log "Switching LIVE code to V3 while keeping runtime state outside Git"
git -C "$LIVE_DIR" reset --hard "$SOURCE_SHA"
CODE_UPDATED=1

# A hard reset may replace tracked runtime files. Put the live state back before running Prisma.
cp -a "$RUN_DIR/live.env" "$LIVE_DIR/.env"
chown "$LIVE_ENV_OWNER" "$LIVE_DIR/.env"
chmod "$LIVE_ENV_MODE" "$LIVE_DIR/.env"
set_database_url

mkdir -p "$(dirname "$LIVE_DB")"
rm -f "$LIVE_DB" "$LIVE_DB-wal" "$LIVE_DB-shm"
cp -a "$RUN_DIR/live.db" "$LIVE_DB"
chown "$LIVE_DB_OWNER" "$LIVE_DB"
chmod "$LIVE_DB_MODE" "$LIVE_DB"
restore_runtime "$RUN_DIR/runtime"

PRE_MIGRATION_USERS="$(assert_live_user_database "$LIVE_DB")"
[[ "$PRE_MIGRATION_USERS" == "$ORIGINAL_USERS" ]] || die "Live user count changed before migration"

log "Installing dependencies, migrating the existing LIVE database and building V3"
(
  cd "$LIVE_DIR"
  npm ci
  npm run db:deploy
  npm run db:status
  npm run build
)

POST_MIGRATION_USERS="$(assert_live_user_database "$LIVE_DB")"
[[ "$POST_MIGRATION_USERS" == "$ORIGINAL_USERS" ]] || die \
  "Refusing to start V3: user count changed from $ORIGINAL_USERS to $POST_MIGRATION_USERS"

FK_ERRORS="$(sqlite3 "$LIVE_DB" 'PRAGMA foreign_key_check;')"
[[ -z "$FK_ERRORS" ]] || die "Foreign-key violations found after V3 migration: $FK_ERRORS"

log "Starting LIVE on V3"
systemctl start "$LIVE_SERVICE"
systemctl is-active --quiet "$LIVE_SERVICE" || die "$LIVE_SERVICE failed to start"

SUCCESS=1
trap - ERR EXIT

log "V3 promotion completed successfully"
echo "LIVE database preserved: $LIVE_DB"
echo "Users preserved: $POST_MIGRATION_USERS"
echo "Backup directory: $RUN_DIR"
echo "V3 commit: $SOURCE_SHA"
