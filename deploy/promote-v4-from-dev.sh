#!/usr/bin/env bash
# Preserve V4's actively used database while importing V3-only production data.
# Defaults to read-only rehearsal. --promote is an explicit downtime operation.
set -Eeuo pipefail

LIVE_DIR="${LIVE_DIR:-/projects/LIVE}"
V4_DIR="${V4_DIR:-/projects/V4}"
LIVE_SERVICE="${LIVE_SERVICE:-leighpogo.service}"
V4_SERVICE="${V4_SERVICE:-leighpogo-test.service}"
BACKUP_ROOT="${BACKUP_ROOT:-/projects/backups/leighpogo}"
LIVE_DB="${LIVE_DB:-${LIVE_DIR}/prisma/dev.db}"
V4_DB="${V4_DB:-${V4_DIR}/prisma/dev.db}"
MODE="${1:---check}"
ALLOW_CONFLICTS=0
[[ "${2:-}" == "--allow-password-conflicts" ]] && ALLOW_CONFLICTS=1
[[ "$MODE" == "--check" || "$MODE" == "--promote" ]] || { echo 'Usage: sudo bash deploy/promote-v4-from-dev.sh [--check|--promote] [--allow-password-conflicts]' >&2; exit 2; }
[[ "${EUID}" == 0 ]] || { echo 'Run with sudo.' >&2; exit 2; }
for bin in git npm node python3 sqlite3 rsync systemctl curl stat; do command -v "$bin" >/dev/null || { echo "Missing $bin" >&2; exit 2; }; done
[[ -f "$LIVE_DB" && -f "$V4_DB" && -f "$LIVE_DIR/.env" && -f "$V4_DIR/package.json" ]] || { echo 'Missing production, V4 SQLite database, or environment.' >&2; exit 2; }
[[ "$LIVE_DB" != "$V4_DB" ]] || { echo 'LIVE and V4 database must differ.' >&2; exit 2; }

STAMP="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="${BACKUP_ROOT}/v4-from-dev-${STAMP}"
mkdir -p "$RUN_DIR" && chmod 700 "$RUN_DIR"
LIVE_ACTIVE=0; V4_ACTIVE=0; CUTOVER=0; SUCCESS=0; CODE_CHANGED=0; DB_CHANGED=0; UNIT_CHANGED=0; REDIRECT_UNIT_CHANGED=0
LIVE_HEAD="$(git -C "$LIVE_DIR" rev-parse HEAD)"
LIVE_BRANCH="$(git -C "$LIVE_DIR" symbolic-ref --short -q HEAD || true)"
LIVE_DB_OWNER="$(stat -c '%u:%g' "$LIVE_DB")"
LIVE_DB_MODE="$(stat -c '%a' "$LIVE_DB")"
LIVE_ENV_OWNER="$(stat -c '%u:%g' "$LIVE_DIR/.env")"
LIVE_ENV_MODE="$(stat -c '%a' "$LIVE_DIR/.env")"
OVERRIDE_DIR="/etc/systemd/system/${LIVE_SERVICE}.d"
OVERRIDE="$OVERRIDE_DIR/override.conf"
REDIRECT_OVERRIDE_DIR="/etc/systemd/system/${V4_SERVICE}.d"
REDIRECT_OVERRIDE="$REDIRECT_OVERRIDE_DIR/override.conf"

active() { systemctl is-active --quiet "$1"; }
log() { echo "[$(date +%H:%M:%S)] $*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }
snapshot_db() { sqlite3 "$1" ".backup '$2'"; [[ -s "$2" ]] || fail "SQLite backup failed: $2"; }
backup_files() {
  local path="$1" dest="$2"
  mkdir -p "$dest"
  for sub in data content/guides public/uploads/guides; do
    if [[ -d "$path/$sub" ]]; then mkdir -p "$dest/$sub"; rsync -a "$path/$sub/" "$dest/$sub/"; fi
  done
  [[ ! -f "$path/.env" ]] || cp -a "$path/.env" "$dest/.env"
}
restore_files() {
  local src="$1" dest="$2"
  for sub in data content/guides public/uploads/guides; do
    if [[ -d "$src/$sub" ]]; then
      mkdir -p "$dest/$sub"
      rsync -a --delete "$src/$sub/" "$dest/$sub/"
    fi
  done
}
rollback() {
  local ec=$?
  trap - ERR EXIT
  if (( SUCCESS )); then exit 0; fi
  if (( ! CUTOVER )); then echo "Rehearsal did not change either running site. Backups: $RUN_DIR" >&2; exit "$ec"; fi
  echo "PROMOTION FAILED: restoring V3 production code/database and prior service settings" >&2
  systemctl stop "$LIVE_SERVICE" >/dev/null 2>&1 || true
  if (( REDIRECT_UNIT_CHANGED )); then
    if [[ -f "$RUN_DIR/test-override.conf" ]]; then cp -a "$RUN_DIR/test-override.conf" "$REDIRECT_OVERRIDE";
    else rm -f "$REDIRECT_OVERRIDE"; fi
  fi
  if (( UNIT_CHANGED )); then
    if [[ -f "$RUN_DIR/live-override.conf" ]]; then cp -a "$RUN_DIR/live-override.conf" "$OVERRIDE";
    else rm -f "$OVERRIDE"; fi
    systemctl daemon-reload || true
  fi
  if (( CODE_CHANGED )); then
    git -C "$LIVE_DIR" checkout -f -B "${LIVE_BRANCH:-previous-live}" "$LIVE_HEAD" >/dev/null 2>&1 || true
  fi
  if [[ -f "$RUN_DIR/live/.env" ]]; then
    cp -a "$RUN_DIR/live/.env" "$LIVE_DIR/.env"
    chown "$LIVE_ENV_OWNER" "$LIVE_DIR/.env" && chmod "$LIVE_ENV_MODE" "$LIVE_DIR/.env"
  fi
  if (( DB_CHANGED )); then
    rm -f "$LIVE_DB" "$LIVE_DB-wal" "$LIVE_DB-shm"
    cp -a "$RUN_DIR/live.db" "$LIVE_DB"
    chown "$LIVE_DB_OWNER" "$LIVE_DB" && chmod "$LIVE_DB_MODE" "$LIVE_DB"
  fi
  restore_files "$RUN_DIR/live" "$LIVE_DIR" || true
  if (( CODE_CHANGED )); then (cd "$LIVE_DIR" && npm ci && npm run build) >/dev/null 2>&1 || true; fi
  if (( UNIT_CHANGED || REDIRECT_UNIT_CHANGED )); then systemctl daemon-reload || true; fi
  if (( LIVE_ACTIVE )); then systemctl start "$LIVE_SERVICE" || true; fi
  if (( V4_ACTIVE )); then systemctl start "$V4_SERVICE" || true; fi
  echo "Rollback complete; retained snapshots at $RUN_DIR" >&2
  exit "$ec"
}
trap rollback ERR EXIT

if active "$LIVE_SERVICE"; then LIVE_ACTIVE=1; fi
if active "$V4_SERVICE"; then V4_ACTIVE=1; fi
[[ -d "$LIVE_DIR/.git" && -d "$V4_DIR/.git" ]] || fail 'Both Git checkouts are required.'

log "Fetching V4 branch; no Git checkout changes on either site yet"
git -C "$V4_DIR" fetch origin v4
git -C "$LIVE_DIR" fetch origin v4
SOURCE_SHA="$(git -C "$V4_DIR" rev-parse origin/v4)"
[[ "$SOURCE_SHA" == "$(git -C "$LIVE_DIR" rev-parse origin/v4)" ]] || fail 'Git fetch refs differ.'
[[ "$(git -C "$V4_DIR" rev-parse HEAD)" == "$SOURCE_SHA" ]] || fail 'Local V4 is behind/ahead of origin/v4; run git pull --ff-only first.'
[[ -f "$V4_DIR/scripts/merge-v3-into-v4.py" ]] || fail 'V4 merge helper not present locally; pull V4 first.'
[[ -f "$V4_DIR/scripts/redirect-dev-to-live.js" ]] || fail 'Dev redirect helper missing.'
[[ -f "$V4_DIR/scripts/merge-dev-data.py" ]] || fail 'V4 runtime merge helper missing.'

if [[ "$MODE" == '--promote' ]]; then
  log 'Stopping both services for final immutable snapshots'
  CUTOVER=1
  systemctl stop "$LIVE_SERVICE"
  systemctl stop "$V4_SERVICE"
  ! active "$LIVE_SERVICE" && ! active "$V4_SERVICE" || fail 'Services still active'
fi
log 'Backing up both SQLite databases and filesystem runtime state'
snapshot_db "$LIVE_DB" "$RUN_DIR/live.db"
snapshot_db "$V4_DB" "$RUN_DIR/v4.db"
backup_files "$LIVE_DIR" "$RUN_DIR/live"
backup_files "$V4_DIR" "$RUN_DIR/v4"
[[ ! -f "$OVERRIDE" ]] || cp -a "$OVERRIDE" "$RUN_DIR/live-override.conf"
[[ ! -f "$REDIRECT_OVERRIDE" ]] || cp -a "$REDIRECT_OVERRIDE" "$RUN_DIR/test-override.conf"
printf '%s\n' "$LIVE_HEAD" > "$RUN_DIR/previous-live-sha"
printf '%s\n' "$SOURCE_SHA" > "$RUN_DIR/new-v4-sha"
[[ "$(sqlite3 "$RUN_DIR/live.db" 'PRAGMA integrity_check')" == 'ok' ]] || fail 'LIVE backup corrupt'
[[ "$(sqlite3 "$RUN_DIR/v4.db" 'PRAGMA integrity_check')" == 'ok' ]] || fail 'V4 backup corrupt'

log 'Making disposable V3 schema upgrade and V4 candidate'
cp -a "$RUN_DIR/live.db" "$RUN_DIR/v3-upgraded.db"
cp -a "$RUN_DIR/v4.db" "$RUN_DIR/v4-candidate.db"
(cd "$V4_DIR" && DATABASE_URL="file:${RUN_DIR}/v3-upgraded.db" npm run db:deploy)
(cd "$V4_DIR" && DATABASE_URL="file:${RUN_DIR}/v4-candidate.db" npm run db:deploy)

MERGE_OPTIONS=()
if (( ALLOW_CONFLICTS )); then MERGE_OPTIONS=(--allow-password-conflicts); fi
log 'Importing V3 accounts and linked data into V4-primary candidate'
python3 "$V4_DIR/scripts/merge-v3-into-v4.py" \
  --v4-candidate "$RUN_DIR/v4-candidate.db" \
  --v3-snapshot "$RUN_DIR/v3-upgraded.db" \
  --report "$RUN_DIR/merge-report.json" "${MERGE_OPTIONS[@]}"

log 'Merging runtime JSON (V4 current data primary; newer timestamp wins for matching records)'
mkdir -p "$RUN_DIR/runtime-merged"
python3 - "$V4_DIR/scripts" "$RUN_DIR" <<'PY'
import sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import runpy
merge_runtime_data=runpy.run_path(str(Path(sys.argv[1])/'merge-dev-data.py'))['merge_runtime_data']
root=Path(sys.argv[2])
merge_runtime_data(root/'v4/data',root/'live/data',root/'runtime-merged',{'runtime_files_merged': 0})
PY

[[ "$(sqlite3 "$RUN_DIR/v4-candidate.db" 'PRAGMA integrity_check')" == 'ok' ]] || fail 'Merged V4 integrity failed'
[[ -z "$(sqlite3 "$RUN_DIR/v4-candidate.db" 'PRAGMA foreign_key_check')" ]] || fail 'Merged V4 foreign keys failed'
log "Candidate ready: $(sqlite3 "$RUN_DIR/v4-candidate.db" 'SELECT COUNT(*) FROM User') total users; $(sqlite3 "$RUN_DIR/v4-candidate.db" 'SELECT COUNT(*) FROM GiftCode') gift codes"
if [[ "$MODE" == '--check' ]]; then
  SUCCESS=1
  log "REHEARSAL SUCCESS. Read $RUN_DIR/merge-report.json before --promote. Neither site was changed."
  exit 0
fi

log 'Switching LIVE checkout to V4 (V4 original checkout/database untouched)'
CODE_CHANGED=1
git -C "$LIVE_DIR" checkout -f -B production-v4 "$SOURCE_SHA"
git -C "$LIVE_DIR" branch --set-upstream-to=origin/v4 production-v4

log 'Installing merged runtime data, preserving both sites guides/uploads'
restore_files "$RUN_DIR/live" "$LIVE_DIR"
for sub in data content/guides public/uploads/guides; do
  if [[ -d "$RUN_DIR/v4/$sub" ]]; then
    mkdir -p "$LIVE_DIR/$sub"
    rsync -a "$RUN_DIR/v4/$sub/" "$LIVE_DIR/$sub/"
  fi
done
rsync -a "$RUN_DIR/runtime-merged/" "$LIVE_DIR/data/"
cp -a "$RUN_DIR/live/.env" "$LIVE_DIR/.env"
python3 - "$LIVE_DIR/.env" <<'PY'
import re,sys
from pathlib import Path
p=Path(sys.argv[1])
s=p.read_text()
for key, val in [('DATABASE_URL','file:./dev.db'), ('NEXTAUTH_URL','https://leighpogo.co.uk')]:
    line=f'{key}="{val}"'
    s=re.sub(rf'(?m)^{key}=.*$',lambda _: line,s) if re.search(rf'(?m)^{key}=',s) else s.rstrip('\n')+'\n'+line+'\n'
p.write_text(s)
PY
chown "$LIVE_ENV_OWNER" "$LIVE_DIR/.env" && chmod "$LIVE_ENV_MODE" "$LIVE_DIR/.env"

log 'Installing dependencies and building V4 production'
(cd "$LIVE_DIR" && npm ci && DATABASE_URL="file:${RUN_DIR}/v4-candidate.db" npm run db:status && DATABASE_URL="file:${RUN_DIR}/v4-candidate.db" npm run build)

log 'Switching the live SQLite database to the validated V4 candidate'
sqlite3 "$RUN_DIR/v4-candidate.db" 'PRAGMA wal_checkpoint(TRUNCATE);' >/dev/null
cp -a "$RUN_DIR/v4-candidate.db" "${LIVE_DB}.v4-ready"
chown "$LIVE_DB_OWNER" "${LIVE_DB}.v4-ready" && chmod "$LIVE_DB_MODE" "${LIVE_DB}.v4-ready"
rm -f "$LIVE_DB-wal" "$LIVE_DB-shm"
mv -f "${LIVE_DB}.v4-ready" "$LIVE_DB"
DB_CHANGED=1

log 'Configuring LIVE to run V4 on port 3000; V4 test port 3001 is unchanged'
mkdir -p "$OVERRIDE_DIR"
NPM_BIN="$(command -v npm)"
cat > "$OVERRIDE" <<EOF
[Service]
WorkingDirectory=$LIVE_DIR
ExecStart=
ExecStart=$NPM_BIN run start:live
EOF
UNIT_CHANGED=1
systemctl daemon-reload
systemctl start "$LIVE_SERVICE"
systemctl is-active --quiet "$LIVE_SERVICE" || fail 'V4 production service failed to start'
curl -fsS --max-time 15 -o /dev/null http://127.0.0.1:3000/ || fail 'V4 production localhost HTTP check failed'

log 'Replacing old test service with a permanent dev-domain redirect on port 3001'
mkdir -p "$REDIRECT_OVERRIDE_DIR"
NODE_BIN="$(command -v node)"
cat > "$REDIRECT_OVERRIDE" <<EOF
[Service]
WorkingDirectory=$V4_DIR
ExecStart=
ExecStart=$NODE_BIN $V4_DIR/scripts/redirect-dev-to-live.js
EOF
REDIRECT_UNIT_CHANGED=1
systemctl daemon-reload
systemctl start "$V4_SERVICE"
systemctl is-active --quiet "$V4_SERVICE" || fail 'Dev hostname redirect service failed to start'
curl -fsSI --max-time 15 http://127.0.0.1:3001/gifts/demo?test=1 | grep -qi 'location: https://leighpogo.co.uk/gifts/demo?test=1' || fail 'Dev domain redirect failed to preserve path/query'

SUCCESS=1
log "SUCCESS: V4 now serves on production port 3000 using merged V4-primary data. Backups: $RUN_DIR"
log 'The old dev service now redirects requests on port 3001 to production without starting another database writer.'
