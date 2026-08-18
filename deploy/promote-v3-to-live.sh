#!/usr/bin/env bash
set -Eeuo pipefail

LIVE_DIR="${LIVE_DIR:-/projects/LIVE}"
SOURCE_DIR="${SOURCE_DIR:-/projects/V3}"
BRANCH="${BRANCH:-v3}"
LIVE_SERVICE="${LIVE_SERVICE:-leighpogo.service}"
DEV_SERVICE="${DEV_SERVICE:-leighpogo-test.service}"
LIVE_DB="${LIVE_DB:-${LIVE_DIR}/prisma/dev.db}"
DEV_DB="${DEV_DB:-${SOURCE_DIR}/prisma/dev.db}"
BACKUP_ROOT="${BACKUP_ROOT:-/projects/backups/leighpogo}"
STAMP="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="${BACKUP_ROOT}/v3-promotion-${STAMP}"
CANDIDATE_DB="${LIVE_DIR}/prisma/v3-candidate-${STAMP}.db"
MERGER="${LIVE_DIR}/scripts/merge-dev-data.py"
V3_STATE_MERGER="${LIVE_DIR}/scripts/merge-v3-cutover-state.py"

LIVE_HEAD_BEFORE=""
LIVE_WAS_ACTIVE=0
DEV_WAS_ACTIVE=0
CUTOVER_STARTED=0
CODE_UPDATED=0
DB_SWAPPED=0
RUNTIME_APPLIED=0
SUCCESS=0
LIVE_DB_OWNER=""
LIVE_DB_MODE=""
LIVE_ENV_OWNER=""
LIVE_ENV_MODE=""
LIVE_OWNER=""
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

assert_user_database() {
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

snapshot_live_runtime() {
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

snapshot_dev_merge_data() {
  local destination="$1"
  mkdir -p "$destination"

  for filename in \
    event-overrides.json \
    event-type-rules.json \
    local-events.json \
    gyms.json \
    pokemon-availability-overrides.json; do
    if [[ -f "$SOURCE_DIR/data/$filename" ]]; then
      cp -a "$SOURCE_DIR/data/$filename" "$destination/$filename"
    fi
  done
}

restore_live_runtime() {
  local source="$1"

  for filename in \
    event-overrides.json \
    event-type-rules.json \
    local-events.json \
    gyms.json \
    pokemon-availability-overrides.json; do
    rm -f "$LIVE_DIR/data/$filename"
    if [[ -f "$source/data/$filename" ]]; then
      mkdir -p "$LIVE_DIR/data"
      cp -a "$source/data/$filename" "$LIVE_DIR/data/$filename"
    fi
  done

  mkdir -p "$LIVE_DIR/content/guides"
  if [[ -d "$source/content-guides" ]]; then
    rsync -a --delete "$source/content-guides/" "$LIVE_DIR/content/guides/"
  else
    find "$LIVE_DIR/content/guides" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  fi

  mkdir -p "$LIVE_DIR/public/uploads/guides"
  if [[ -d "$source/public-uploads/guides" ]]; then
    rsync -a --delete "$source/public-uploads/guides/" "$LIVE_DIR/public/uploads/guides/"
  else
    find "$LIVE_DIR/public/uploads/guides" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  fi
}

apply_merged_runtime_data() {
  local source="$1"
  [[ -d "$source" ]] || return
  mkdir -p "$LIVE_DIR/data"
  rsync -a "$source/" "$LIVE_DIR/data/"
}

set_database_url() {
  local env_file="$LIVE_DIR/.env"
  if grep -q '^DATABASE_URL=' "$env_file"; then
    sed -i 's|^DATABASE_URL=.*$|DATABASE_URL="file:./dev.db"|' "$env_file"
  else
    printf '%s\n' 'DATABASE_URL="file:./dev.db"' >> "$env_file"
  fi
  chown "$LIVE_ENV_OWNER" "$env_file"
  chmod "$LIVE_ENV_MODE" "$env_file"
}

restore_service_states() {
  if (( LIVE_WAS_ACTIVE )); then
    systemctl start "$LIVE_SERVICE" >/dev/null 2>&1 || true
  fi
  if (( DEV_WAS_ACTIVE )); then
    systemctl start "$DEV_SERVICE" >/dev/null 2>&1 || true
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
  systemctl stop "$DEV_SERVICE" >/dev/null 2>&1 || true

  rm -f "$CANDIDATE_DB" "$CANDIDATE_DB-wal" "$CANDIDATE_DB-shm"

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

  [[ -d "$RUN_DIR/runtime" ]] && restore_live_runtime "$RUN_DIR/runtime" || true

  if (( CODE_UPDATED )); then
    (
      cd "$LIVE_DIR"
      npm ci >/dev/null 2>&1 && npm run build >/dev/null 2>&1
    ) || true
  fi

  restore_service_states

  echo "Rollback finished. Backup retained at: $RUN_DIR" >&2
  exit "$exit_code"
}

trap rollback ERR EXIT

[[ ${EUID} -eq 0 ]] || die "Run this script with sudo."
for command in git npm python3 sqlite3 rsync systemctl stat sed grep chown chmod tee; do
  need "$command"
done

[[ -d "$LIVE_DIR/.git" ]] || die "LIVE checkout not found at $LIVE_DIR"
[[ -d "$SOURCE_DIR/.git" ]] || die "V3 checkout not found at $SOURCE_DIR"
[[ -f "$LIVE_DIR/.env" ]] || die "LIVE .env not found at $LIVE_DIR/.env"
[[ -f "$LIVE_DB" ]] || die "LIVE database not found at $LIVE_DB"
[[ -f "$DEV_DB" ]] || die "V3 database not found at $DEV_DB"

ORIGINAL_USERS="$(assert_user_database "$LIVE_DB")"
DEV_USERS="$(assert_user_database "$DEV_DB")"
LIVE_HEAD_BEFORE="$(git -C "$LIVE_DIR" rev-parse HEAD)"
LIVE_DB_OWNER="$(stat -c '%u:%g' "$LIVE_DB")"
LIVE_DB_MODE="$(stat -c '%a' "$LIVE_DB")"
LIVE_ENV_OWNER="$(stat -c '%u:%g' "$LIVE_DIR/.env")"
LIVE_ENV_MODE="$(stat -c '%a' "$LIVE_DIR/.env")"
LIVE_OWNER="$(stat -c '%u:%g' "$LIVE_DIR")"

if service_is_active "$LIVE_SERVICE"; then LIVE_WAS_ACTIVE=1; fi
if service_is_active "$DEV_SERVICE"; then DEV_WAS_ACTIVE=1; fi
CUTOVER_STARTED=1

log "Fetching the V3 release"
git -C "$SOURCE_DIR" fetch origin "$BRANCH"
SOURCE_SHA="$(git -C "$SOURCE_DIR" rev-parse "origin/$BRANCH")"
git -C "$LIVE_DIR" fetch origin "$BRANCH"

log "Stopping LIVE and V3 test before taking final SQLite snapshots"
systemctl stop "$LIVE_SERVICE"
if (( DEV_WAS_ACTIVE )); then systemctl stop "$DEV_SERVICE"; fi
service_is_active "$LIVE_SERVICE" && die "$LIVE_SERVICE is still active"
service_is_active "$DEV_SERVICE" && die "$DEV_SERVICE is still active"

log "Backing up LIVE and V3 databases plus LIVE runtime state"
mkdir -p "$RUN_DIR"
sqlite_snapshot "$LIVE_DB" "$RUN_DIR/live.db"
sqlite_snapshot "$DEV_DB" "$RUN_DIR/dev.db"
BACKUP_USERS="$(assert_user_database "$RUN_DIR/live.db")"
DEV_BACKUP_USERS="$(assert_user_database "$RUN_DIR/dev.db")"
[[ "$BACKUP_USERS" == "$ORIGINAL_USERS" ]] || die "LIVE backup user count changed: $ORIGINAL_USERS -> $BACKUP_USERS"
[[ "$DEV_BACKUP_USERS" == "$DEV_USERS" ]] || die "DEV backup user count changed: $DEV_USERS -> $DEV_BACKUP_USERS"
cp -a "$LIVE_DIR/.env" "$RUN_DIR/live.env"
snapshot_live_runtime "$RUN_DIR/runtime"
snapshot_dev_merge_data "$RUN_DIR/dev-data"
printf '%s\n' "$LIVE_HEAD_BEFORE" > "$RUN_DIR/live-git-head.txt"
printf '%s\n' "$SOURCE_SHA" > "$RUN_DIR/v3-git-head.txt"

log "Switching LIVE code to V3 while keeping production state outside Git"
git -C "$LIVE_DIR" reset --hard "$SOURCE_SHA"
CODE_UPDATED=1

[[ -f "$MERGER" ]] || die "Merge helper missing after V3 checkout: $MERGER"
[[ -f "$V3_STATE_MERGER" ]] || die "V3 state merge helper missing after V3 checkout: $V3_STATE_MERGER"

# A hard reset may replace tracked runtime files. Restore production state immediately.
cp -a "$RUN_DIR/live.env" "$LIVE_DIR/.env"
chown "$LIVE_ENV_OWNER" "$LIVE_DIR/.env"
chmod "$LIVE_ENV_MODE" "$LIVE_DIR/.env"
set_database_url

mkdir -p "$(dirname "$LIVE_DB")"
rm -f "$LIVE_DB" "$LIVE_DB-wal" "$LIVE_DB-shm"
cp -a "$RUN_DIR/live.db" "$LIVE_DB"
chown "$LIVE_DB_OWNER" "$LIVE_DB"
chmod "$LIVE_DB_MODE" "$LIVE_DB"
restore_live_runtime "$RUN_DIR/runtime"

PRE_MIGRATION_USERS="$(assert_user_database "$LIVE_DB")"
[[ "$PRE_MIGRATION_USERS" == "$ORIGINAL_USERS" ]] || die "LIVE user count changed before candidate migration"

log "Creating and migrating a disposable V3 LIVE candidate"
cp -a "$RUN_DIR/live.db" "$CANDIDATE_DB"
CANDIDATE_BASENAME="$(basename "$CANDIDATE_DB")"
CANDIDATE_URL="file:./${CANDIDATE_BASENAME}"
(
  cd "$LIVE_DIR"
  npm ci
  DATABASE_URL="$CANDIDATE_URL" npm run db:deploy
)

log "Merging safe DEV user/admin data into the migrated LIVE candidate"
mkdir -p "$RUN_DIR/merged-data"
python3 "$MERGER" \
  --live-db "$CANDIDATE_DB" \
  --dev-db "$RUN_DIR/dev.db" \
  --live-data-dir "$RUN_DIR/runtime/data" \
  --dev-data-dir "$RUN_DIR/dev-data" \
  --output-data-dir "$RUN_DIR/merged-data" \
  | tee "$RUN_DIR/merge-report.txt"
python3 "$V3_STATE_MERGER" \
  --live-db "$CANDIDATE_DB" \
  --dev-db "$RUN_DIR/dev.db" \
  | tee -a "$RUN_DIR/merge-report.txt"

log "Validating the merged V3 candidate"
CANDIDATE_USERS="$(assert_user_database "$CANDIDATE_DB")"
[[ "$CANDIDATE_USERS" == "$ORIGINAL_USERS" ]] || die \
  "Refusing to promote: LIVE user count changed from $ORIGINAL_USERS to $CANDIDATE_USERS"
FK_ERRORS="$(sqlite3 "$CANDIDATE_DB" 'PRAGMA foreign_key_check;')"
[[ -z "$FK_ERRORS" ]] || die "Foreign-key violations found in merged V3 candidate: $FK_ERRORS"

log "Validating migration status and production build against the candidate"
(
  cd "$LIVE_DIR"
  DATABASE_URL="$CANDIDATE_URL" npm run db:status
  DATABASE_URL="$CANDIDATE_URL" npm run build
)

log "Atomically replacing LIVE with the validated merged candidate"
chown "$LIVE_DB_OWNER" "$CANDIDATE_DB"
chmod "$LIVE_DB_MODE" "$CANDIDATE_DB"
rm -f "$LIVE_DB" "$LIVE_DB-wal" "$LIVE_DB-shm"
mv -f "$CANDIDATE_DB" "$LIVE_DB"
DB_SWAPPED=1

apply_merged_runtime_data "$RUN_DIR/merged-data"
RUNTIME_APPLIED=1
chown -R "$LIVE_OWNER" "$LIVE_DIR/data" "$LIVE_DIR/content/guides" "$LIVE_DIR/public/uploads/guides"

FINAL_USERS="$(assert_user_database "$LIVE_DB")"
[[ "$FINAL_USERS" == "$ORIGINAL_USERS" ]] || die \
  "Refusing to start V3: final user count changed from $ORIGINAL_USERS to $FINAL_USERS"

(
  cd "$LIVE_DIR"
  npm run db:status
)

log "Starting LIVE on V3"
systemctl start "$LIVE_SERVICE"
systemctl is-active --quiet "$LIVE_SERVICE" || die "$LIVE_SERVICE failed to start"

if (( DEV_WAS_ACTIVE )); then
  log "Restoring the V3 test service"
  systemctl start "$DEV_SERVICE"
  systemctl is-active --quiet "$DEV_SERVICE" || die "$DEV_SERVICE failed to restart"
fi

SUCCESS=1
trap - ERR EXIT

log "V3 promotion completed successfully"
echo "LIVE database preserved and merged: $LIVE_DB"
echo "LIVE users preserved: $FINAL_USERS"
echo "DEV users considered: $DEV_BACKUP_USERS"
echo "Merge report: $RUN_DIR/merge-report.txt"
echo "Backup directory: $RUN_DIR"
echo "V3 commit: $SOURCE_SHA"
