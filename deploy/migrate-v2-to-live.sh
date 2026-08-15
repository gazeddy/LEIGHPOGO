#!/usr/bin/env bash
set -Eeuo pipefail

LIVE_DIR="${LIVE_DIR:-/projects/LIVE}"
DEV_DIR="${DEV_DIR:-/projects/TEST}"
LIVE_SERVICE="${LIVE_SERVICE:-leighpogo.service}"
DEV_SERVICE="${DEV_SERVICE:-leighpogo-test.service}"
LIVE_DB="${LIVE_DB:-${LIVE_DIR}/prisma/prisma/dev.db}"
DEV_DB="${DEV_DB:-${DEV_DIR}/prisma/prisma/dev.db}"
BACKUP_ROOT="${BACKUP_ROOT:-/projects/backups/leighpogo}"
STAMP="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="${BACKUP_ROOT}/v2-cutover-${STAMP}"
CANDIDATE_DB="${LIVE_DIR}/prisma/prisma/v2-candidate-${STAMP}.db"
SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MERGER="${SCRIPT_ROOT}/scripts/merge-dev-data.py"

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

tracked_changes_outside_runtime() {
  local repo="$1"
  local changed
  changed="$({ git -C "$repo" diff --name-only; git -C "$repo" diff --cached --name-only; } | sort -u)"

  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    case "$path" in
      .env|content/guides/*) ;;
      *) echo "$path" ;;
    esac
  done <<< "$changed"
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
  local project="$1"
  local destination="$2"

  mkdir -p "$destination/data" "$destination/public-uploads"

  for filename in \
    event-overrides.json \
    event-type-rules.json \
    local-events.json \
    gyms.json \
    pokemon-availability-overrides.json; do
    if [[ -f "$project/data/$filename" ]]; then
      cp -a "$project/data/$filename" "$destination/data/$filename"
    fi
  done

  if [[ -d "$project/content/guides" ]]; then
    mkdir -p "$destination/content-guides"
    rsync -a "$project/content/guides/" "$destination/content-guides/"
  fi

  if [[ -d "$project/public/uploads/guides" ]]; then
    mkdir -p "$destination/public-uploads/guides"
    rsync -a "$project/public/uploads/guides/" "$destination/public-uploads/guides/"
  fi

  if [[ -f "$project/.env" ]]; then
    cp -a "$project/.env" "$destination/.env"
  fi
}

restore_live_runtime() {
  local source="$RUN_DIR/live"

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

  if [[ -f "$source/.env" ]]; then
    cp -a "$source/.env" "$LIVE_DIR/.env"
  fi
}

restore_service_states() {
  if (( LIVE_WAS_ACTIVE )); then
    systemctl start "$LIVE_SERVICE" || true
  fi
  if (( DEV_WAS_ACTIVE )); then
    systemctl start "$DEV_SERVICE" || true
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
  echo "Cutover failed; rolling LIVE back." >&2
  systemctl stop "$LIVE_SERVICE" >/dev/null 2>&1 || true

  if (( DB_SWAPPED )) && [[ -f "$RUN_DIR/live/live.db" ]]; then
    rm -f "$LIVE_DB-wal" "$LIVE_DB-shm"
    cp -a "$RUN_DIR/live/live.db" "$LIVE_DB"
    if [[ -n "$LIVE_DB_OWNER" ]]; then chown "$LIVE_DB_OWNER" "$LIVE_DB" || true; fi
    if [[ -n "$LIVE_DB_MODE" ]]; then chmod "$LIVE_DB_MODE" "$LIVE_DB" || true; fi
  fi

  if (( RUNTIME_APPLIED )) && [[ -d "$RUN_DIR/live" ]]; then
    restore_live_runtime || true
  fi

  if (( CODE_UPDATED )) && [[ -n "$LIVE_HEAD_BEFORE" ]]; then
    git -C "$LIVE_DIR" reset --hard "$LIVE_HEAD_BEFORE" >/dev/null 2>&1 || true
    if [[ -f "$RUN_DIR/live/.env" ]]; then
      cp -a "$RUN_DIR/live/.env" "$LIVE_DIR/.env"
    fi
    restore_live_runtime || true
    (
      cd "$LIVE_DIR"
      npm ci >/dev/null 2>&1 && npm run build >/dev/null 2>&1
    ) || true
  fi

  rm -f "$CANDIDATE_DB" "$CANDIDATE_DB-wal" "$CANDIDATE_DB-shm"
  restore_service_states

  echo "Rollback finished. Snapshots are retained in: $RUN_DIR" >&2
  exit "$exit_code"
}

trap rollback ERR EXIT

[[ ${EUID} -eq 0 ]] || die "Run this script with sudo."
for command in git npm python3 sqlite3 rsync systemctl stat; do
  need "$command"
done

[[ -d "$LIVE_DIR/.git" ]] || die "LIVE checkout not found at $LIVE_DIR"
[[ -d "$DEV_DIR/.git" ]] || die "DEV checkout not found at $DEV_DIR"
[[ -f "$LIVE_DB" ]] || die "LIVE database not found at $LIVE_DB"
[[ -f "$DEV_DB" ]] || die "DEV database not found at $DEV_DB"
[[ -f "$MERGER" ]] || die "Merge helper not found at $MERGER"

log "Refreshing GitHub refs and checking the release state"
git -C "$DEV_DIR" fetch --prune origin
git -C "$LIVE_DIR" fetch --prune origin \
  '+refs/heads/main:refs/remotes/origin/main' \
  '+refs/heads/develop:refs/remotes/origin/develop'

DEV_HEAD="$(git -C "$DEV_DIR" rev-parse HEAD)"
DEV_REMOTE="$(git -C "$DEV_DIR" rev-parse origin/develop)"
[[ "$DEV_HEAD" == "$DEV_REMOTE" ]] || die \
  "TEST is not at the latest origin/develop. Update /projects/TEST before cutover."

git -C "$LIVE_DIR" merge-base --is-ancestor origin/develop origin/main || die \
  "origin/main does not yet contain the current develop branch. Merge develop into main first."

LIVE_HEAD_BEFORE="$(git -C "$LIVE_DIR" rev-parse HEAD)"
UNSAFE_LIVE_CHANGES="$(tracked_changes_outside_runtime "$LIVE_DIR")"
if [[ -n "$UNSAFE_LIVE_CHANGES" ]]; then
  echo "$UNSAFE_LIVE_CHANGES" >&2
  die "LIVE has tracked changes outside .env/content/guides; refusing to overwrite them."
fi

UNSAFE_DEV_CHANGES="$(tracked_changes_outside_runtime "$DEV_DIR")"
if [[ -n "$UNSAFE_DEV_CHANGES" ]]; then
  echo "$UNSAFE_DEV_CHANGES" >&2
  die "TEST has tracked changes outside .env/content/guides; commit or preserve them first."
fi

if service_is_active "$LIVE_SERVICE"; then LIVE_WAS_ACTIVE=1; fi
if service_is_active "$DEV_SERVICE"; then DEV_WAS_ACTIVE=1; fi
CUTOVER_STARTED=1

log "Stopping LIVE and TEST so the final snapshots cannot change"
systemctl stop "$LIVE_SERVICE"
systemctl stop "$DEV_SERVICE"
service_is_active "$LIVE_SERVICE" && die "$LIVE_SERVICE is still active"
service_is_active "$DEV_SERVICE" && die "$DEV_SERVICE is still active"

log "Taking final SQLite and runtime-data snapshots"
mkdir -p "$RUN_DIR/live" "$RUN_DIR/dev"
sqlite_snapshot "$LIVE_DB" "$RUN_DIR/live/live.db"
sqlite_snapshot "$DEV_DB" "$RUN_DIR/dev/dev.db"
snapshot_runtime "$LIVE_DIR" "$RUN_DIR/live"
snapshot_runtime "$DEV_DIR" "$RUN_DIR/dev"
printf '%s\n' "$LIVE_HEAD_BEFORE" > "$RUN_DIR/live-git-head.txt"
printf '%s\n' "$DEV_HEAD" > "$RUN_DIR/dev-git-head.txt"

LIVE_DB_OWNER="$(stat -c '%u:%g' "$LIVE_DB")"
LIVE_DB_MODE="$(stat -c '%a' "$LIVE_DB")"
LIVE_OWNER="$(stat -c '%u:%g' "$LIVE_DIR")"

log "Moving the LIVE checkout to the release already merged into main"
git -C "$LIVE_DIR" reset --hard origin/main
CODE_UPDATED=1
if [[ -f "$RUN_DIR/live/.env" ]]; then
  cp -a "$RUN_DIR/live/.env" "$LIVE_DIR/.env"
fi

log "Installing dependencies and validating the production build"
(
  cd "$LIVE_DIR"
  npm ci
  npm run build
)

log "Creating a disposable migrated LIVE candidate"
cp -a "$RUN_DIR/live/live.db" "$CANDIDATE_DB"
CANDIDATE_BASENAME="$(basename "$CANDIDATE_DB")"
CANDIDATE_URL="file:./prisma/${CANDIDATE_BASENAME}"
(
  cd "$LIVE_DIR"
  DATABASE_URL="$CANDIDATE_URL" npm run db:deploy
)

log "Merging the final DEV snapshot into the candidate"
mkdir -p "$RUN_DIR/merged-data"
python3 "$MERGER" \
  --live-db "$CANDIDATE_DB" \
  --dev-db "$RUN_DIR/dev/dev.db" \
  --live-data-dir "$RUN_DIR/live/data" \
  --dev-data-dir "$RUN_DIR/dev/data" \
  --output-data-dir "$RUN_DIR/merged-data" \
  | tee "$RUN_DIR/merge-report.txt"

log "Merging guide content and uploaded guide images"
mkdir -p "$RUN_DIR/merged-guides" "$RUN_DIR/merged-guide-uploads"
if [[ -d "$RUN_DIR/live/content-guides" ]]; then
  rsync -a "$RUN_DIR/live/content-guides/" "$RUN_DIR/merged-guides/"
fi
if [[ -d "$RUN_DIR/dev/content-guides" ]]; then
  rsync -a "$RUN_DIR/dev/content-guides/" "$RUN_DIR/merged-guides/"
fi
if [[ -d "$RUN_DIR/live/public-uploads/guides" ]]; then
  rsync -a "$RUN_DIR/live/public-uploads/guides/" "$RUN_DIR/merged-guide-uploads/"
fi
if [[ -d "$RUN_DIR/dev/public-uploads/guides" ]]; then
  rsync -a "$RUN_DIR/dev/public-uploads/guides/" "$RUN_DIR/merged-guide-uploads/"
fi

log "Running final SQLite integrity and foreign-key checks"
INTEGRITY="$(sqlite3 "$CANDIDATE_DB" 'PRAGMA integrity_check;')"
[[ "$INTEGRITY" == "ok" ]] || die "Candidate integrity_check returned: $INTEGRITY"
FK_ERRORS="$(sqlite3 "$CANDIDATE_DB" 'PRAGMA foreign_key_check;')"
[[ -z "$FK_ERRORS" ]] || die "Candidate contains foreign-key violations: $FK_ERRORS"

log "Swapping the validated candidate into LIVE"
chown "$LIVE_DB_OWNER" "$CANDIDATE_DB"
chmod "$LIVE_DB_MODE" "$CANDIDATE_DB"
rm -f "$LIVE_DB-wal" "$LIVE_DB-shm"
mv -f "$CANDIDATE_DB" "$LIVE_DB"
DB_SWAPPED=1

mkdir -p "$LIVE_DIR/data" "$LIVE_DIR/content/guides" "$LIVE_DIR/public/uploads/guides"
if [[ -d "$RUN_DIR/merged-data" ]]; then
  rsync -a "$RUN_DIR/merged-data/" "$LIVE_DIR/data/"
fi
rsync -a --delete "$RUN_DIR/merged-guides/" "$LIVE_DIR/content/guides/"
rsync -a --delete "$RUN_DIR/merged-guide-uploads/" "$LIVE_DIR/public/uploads/guides/"
RUNTIME_APPLIED=1
chown -R "$LIVE_OWNER" "$LIVE_DIR/data" "$LIVE_DIR/content/guides" "$LIVE_DIR/public/uploads/guides"

log "Confirming Prisma migration status against the new LIVE database"
(
  cd "$LIVE_DIR"
  npm run db:status
)

if (( LIVE_WAS_ACTIVE )); then
  log "Starting LIVE and verifying the service"
  systemctl start "$LIVE_SERVICE"
  systemctl is-active --quiet "$LIVE_SERVICE" || die "$LIVE_SERVICE failed to start"
fi

if (( DEV_WAS_ACTIVE )); then
  log "Restarting TEST"
  systemctl start "$DEV_SERVICE"
  systemctl is-active --quiet "$DEV_SERVICE" || die "$DEV_SERVICE failed to restart"
fi

SUCCESS=1
trap - ERR EXIT

log "V2 cutover completed successfully"
echo "Backup/snapshot directory: $RUN_DIR"
echo "Merge report: $RUN_DIR/merge-report.txt"
echo "LIVE database: $LIVE_DB"
