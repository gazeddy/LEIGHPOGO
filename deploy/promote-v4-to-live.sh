#!/usr/bin/env bash
# One-time V4-primary promotion. Operates on both production services.
# NEVER call this script with automatic scheduled jobs.
set -Eeuo pipefail
umask 077

LIVE=/projects/LIVE
V4=/projects/V4
LIVE_SERVICE=leighpogo.service
V4_SERVICE=leighpogo-test.service
BACKUP_ROOT=/projects/backups/leighpogo/v4-cutovers
SCRIPT="$V4/scripts/merge-v3-into-v4.py"
[[ "${1:-}" == "--activate" && "${2:-}" == "--allow-password-conflicts" && $# -eq 2 ]] || {
  echo "Usage: sudo bash deploy/promote-v4-to-live.sh --activate --allow-password-conflicts" >&2; exit 2;
}
[[ "$EUID" == 0 ]] || { echo "Run with sudo" >&2; exit 2; }
for cmd in git python3 rsync npm systemctl flock stat; do command -v "$cmd" >/dev/null || exit 2; done
exec 9>/run/lock/leighpogo-v4-cutover.lock
flock -n 9 || { echo "Cutover already running"; exit 2; }

log() { printf '[%s] %s\n' "$(date -u '+%FT%TZ')" "$*"; }
die() { echo "ERROR: $*" >&2; exit 1; }
safe_git() { git -c safe.directory="$1" -C "$1" "${@:2}"; }
[[ -d "$LIVE/.git" && -d "$V4/.git" ]] || die "Both git checkouts required"
[[ -f "$LIVE/.env" && -f "$V4/.env" && -f "$SCRIPT" ]] || die "Missing env or merger"
[[ "$(safe_git "$V4" branch --show-current)" == v4 ]] || die "V4 must be on v4 branch"
[[ -z "$(safe_git "$V4" status --porcelain --untracked-files=no)" ]] || die "V4 tracked files modified"
[[ -z "$(safe_git "$LIVE" status --porcelain --untracked-files=no)" ]] || die "LIVE tracked files modified"
safe_git "$V4" fetch origin v4
HEAD_V4="$(safe_git "$V4" rev-parse HEAD)"
REMOTE_V4="$(safe_git "$V4" rev-parse origin/v4)"
[[ "$HEAD_V4" == "$REMOTE_V4" ]] || die "Update V4 checkout to origin/v4 first"
safe_git "$LIVE" fetch origin v4
LIVE_COMMIT="$(safe_git "$LIVE" rev-parse HEAD)"
LIVE_BRANCH="$(safe_git "$LIVE" symbolic-ref -q --short HEAD || true)"
LIVE_ACTIVE=0; V4_ACTIVE=0
systemctl is-active --quiet "$LIVE_SERVICE" && LIVE_ACTIVE=1 || :
systemctl is-active --quiet "$V4_SERVICE" && V4_ACTIVE=1 || :
[[ "$LIVE_ACTIVE" == 1 && "$V4_ACTIVE" == 1 ]] || die "Both services must be active before cutover"

# Prisma relative SQLite DATABASE_URL paths resolve from the prisma/ directory.
DBS="$(python3 - "$LIVE" "$V4" <<'PY'
import pathlib,sys
for raw in sys.argv[1:]:
    root=pathlib.Path(raw).resolve()
    lines=(root/'.env').read_text().splitlines()
    values=[line.partition('=')[2].strip().strip('"').strip("'") for line in lines
            if line.strip().removeprefix('export ').startswith('DATABASE_URL=')]
    if len(values)!=1 or not values[0].startswith('file:'):
        sys.exit('Missing or ambiguous SQLite DATABASE_URL: '+raw)
    path=values[0][5:].split('?',1)[0]
    if not path or path==':memory:': sys.exit('Invalid SQLite DATABASE_URL')
    db=pathlib.Path(path)
    if not db.is_absolute(): db=root/'prisma'/db
    db=db.resolve()
    if not db.is_relative_to(root) or not db.is_file():
        sys.exit('SQLite DB outside checkout or absent: '+str(db))
    print(db)
PY
)" || die "Failed database path validation"
LIVE_DB="$(printf '%s\n' "$DBS" | sed -n '1p')"
V4_DB="$(printf '%s\n' "$DBS" | sed -n '2p')"
[[ -n "$LIVE_DB" && -n "$V4_DB" && "$LIVE_DB" != "$V4_DB" ]] || die "Cannot distinguish databases"
LIVE_OWNER="$(stat -c '%u:%g' "$LIVE_DB")"
LIVE_MODE="$(stat -c '%a' "$LIVE_DB")"
LIVE_RUNTIME_OWNER="$(stat -c '%u:%g' "$LIVE")"

# Production config derives from the existing working V4 config and uses
# the public production URL. Keep the V4 auth/QR/VAPID secrets for its users.
RUN_DIR="$BACKUP_ROOT/$(date -u '+%Y%m%dT%H%M%SZ')-$$"
mkdir -p "$RUN_DIR"/{live,v4,staging}
chmod 700 "$BACKUP_ROOT" "$RUN_DIR" "$RUN_DIR"/{live,v4,staging}
cat "$V4/.env" > "$RUN_DIR/staging/.env"
python3 - "$RUN_DIR/staging/.env" "$V4/.env" "$LIVE/.env" <<'PY'
import pathlib,sys
target,v4,live=map(pathlib.Path,sys.argv[1:])
def get(path,key):
    result=[]
    for line in path.read_text().splitlines():
        test=line.strip().removeprefix('export ')
        if test.startswith(key+'='):
            result.append(test.partition('=')[2].strip().strip('"').strip("'"))
    return result
if len(get(v4,'DATABASE_URL'))!=1 or not get(v4,'DATABASE_URL')[0].startswith('file:'):
    sys.exit('V4 environment has missing or invalid SQLite DATABASE_URL')
# lib/env.js uses NEXTAUTH_SECRET from environment or persisted
# .nextauth-secret in the checkout; never generate a new secret at cutover.
candidate=get(v4,'NEXTAUTH_SECRET')
persisted=v4/'.nextauth-secret'
if candidate and candidate[0] and candidate[0]!='your-secret-key-change-in-production':
    secret=candidate[0]
elif persisted.is_file() and persisted.read_text().strip():
    secret=persisted.read_text().strip()
else:
    sys.exit('Cannot determine V4 effective NextAuth secret from .env or .nextauth-secret')
if chr(10) in secret or chr(13) in secret or '"' in secret:
    sys.exit('Unexpected V4 NextAuth secret format')
content=target.read_text().splitlines()
content=[line for line in content if not line.strip().removeprefix('export ').split('=',1)[0] in ('NEXTAUTH_URL','NEXTAUTH_SECRET')]
content.append('NEXTAUTH_SECRET="'+secret+'"')
content.append('NEXTAUTH_URL="https://leighpogo.co.uk"')
target.write_text('\n'.join(content)+'\n')
target.chmod(0o600)
PY
log "V4 release: $HEAD_V4; old LIVE commit: $LIVE_COMMIT"
log "Fresh backups will be retained in $RUN_DIR"
log "Both services stopping now; submissions must pause during cutover."
STARTED=0
CODE_CHANGED=0
DB_CHANGED=0
FILES_CHANGED=0
SUCCESS=0

restore_services() {
  if (( LIVE_ACTIVE )); then systemctl start "$LIVE_SERVICE" || :; fi
  if (( V4_ACTIVE )); then systemctl start "$V4_SERVICE" || :; fi
}
rollback() {
  rc=$?
  trap - ERR EXIT
  if (( SUCCESS )); then exit 0; fi
  if (( STARTED )); then
    echo "Cutover failed; rolling LIVE back. Logs/backups: $RUN_DIR" >&2
    systemctl stop "$LIVE_SERVICE" || :
    if (( CODE_CHANGED )); then
      if [[ -n "$LIVE_BRANCH" ]]; then
        safe_git "$LIVE" checkout -f "$LIVE_BRANCH" || :
      else
        safe_git "$LIVE" checkout -f --detach "$LIVE_COMMIT" || :
      fi
      safe_git "$LIVE" reset --hard "$LIVE_COMMIT" || :
    fi
    if (( DB_CHANGED )) && [[ -s "$RUN_DIR/live/source.sqlite3" ]]; then
      rm -f "$LIVE_DB-wal" "$LIVE_DB-shm"
      cp -a "$RUN_DIR/live/source.sqlite3" "$LIVE_DB"
      chown "$LIVE_OWNER" "$LIVE_DB"
      chmod "$LIVE_MODE" "$LIVE_DB"
    fi
    if (( FILES_CHANGED || CODE_CHANGED )); then
      for rel in data content public/uploads; do
        mkdir -p "$LIVE/$rel"
        if [[ -d "$RUN_DIR/live/$rel" ]]; then
          rsync -a --delete "$RUN_DIR/live/$rel/" "$LIVE/$rel/" || :
        else
          find "$LIVE/$rel" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + || :
        fi
      done
    fi
    [[ -f "$RUN_DIR/live/.env" ]] && cp -a "$RUN_DIR/live/.env" "$LIVE/.env"
    if [[ -f "$RUN_DIR/live/.nextauth-secret" ]]; then
      cp -a "$RUN_DIR/live/.nextauth-secret" "$LIVE/.nextauth-secret"
    else
      rm -f "$LIVE/.nextauth-secret"
    fi
    if (( CODE_CHANGED )); then
      ( cd "$LIVE"; npm ci && npm run build ) || echo "WARNING: LIVE rollback build needs manual repair" >&2
    fi
    restore_services
  fi
  exit "$rc"
}
trap rollback ERR EXIT

STARTED=1
systemctl stop "$LIVE_SERVICE"
systemctl stop "$V4_SERVICE"
systemctl is-active --quiet "$LIVE_SERVICE" && die "LIVE would not stop"
systemctl is-active --quiet "$V4_SERVICE" && die "V4 would not stop"
log "Taking fresh offline-consistent SQLite snapshots"
python3 - "$LIVE_DB" "$RUN_DIR/live/source.sqlite3" "$V4_DB" "$RUN_DIR/v4/source.sqlite3" <<'PY'
import pathlib, sqlite3,sys
p=list(map(pathlib.Path,sys.argv[1:]))
for source,destination in ((p[0],p[1]),(p[2],p[3])):
    with sqlite3.connect(source) as src, sqlite3.connect(destination) as dest:
        src.backup(dest)
    destination.chmod(0o600)
    with sqlite3.connect(destination) as check:
        if check.execute('PRAGMA integrity_check').fetchone()!=('ok',):
            sys.exit('Corrupt backup: '+str(destination))
        if check.execute('PRAGMA foreign_key_check').fetchall():
            sys.exit('Invalid foreign keys in backup: '+str(destination))
PY
cp -a "$LIVE/.env" "$RUN_DIR/live/.env"
cp -a "$V4/.env" "$RUN_DIR/v4/.env"
if [[ -f "$LIVE/.nextauth-secret" ]]; then cp -a "$LIVE/.nextauth-secret" "$RUN_DIR/live/.nextauth-secret"; fi
if [[ -f "$V4/.nextauth-secret" ]]; then cp -a "$V4/.nextauth-secret" "$RUN_DIR/v4/.nextauth-secret"; fi
for rel in data content public/uploads; do
  for root in live v4; do
    src="$LIVE"; [[ "$root" == v4 ]] && src="$V4"
    if [[ -d "$src/$rel" ]]; then
      mkdir -p "$RUN_DIR/$root/$rel"
      rsync -a "$src/$rel/" "$RUN_DIR/$root/$rel/"
    fi
  done
done
printf '%s\n' "$LIVE_COMMIT" > "$RUN_DIR/live-commit.txt"
printf '%s\n' "$HEAD_V4" > "$RUN_DIR/v4-commit.txt"
log "Merging fresh snapshots into a disposable candidate"
cp "$RUN_DIR/v4/source.sqlite3" "$RUN_DIR/staging/candidate.sqlite3"
python3 "$SCRIPT" --v4-candidate "$RUN_DIR/staging/candidate.sqlite3" \
  --v3-snapshot "$RUN_DIR/live/source.sqlite3" --report "$RUN_DIR/merge-report.json" \
  --allow-password-conflicts
python3 - "$RUN_DIR/staging/candidate.sqlite3" "$RUN_DIR/v4/source.sqlite3" "$RUN_DIR/merge-report.json" <<'PY'
import json,sqlite3,sys
candidate,original,report=sys.argv[1:]
r=json.load(open(report))
if r.get('role_conflicts'):
    sys.exit('Unapproved user role conflicts: '+repr(r['role_conflicts']))
if not r.get('gift_audit_unchanged') or not r.get('gift_codes_unchanged_except_approved_owner'):
    sys.exit('Protected gift record check failed')
with sqlite3.connect(candidate) as merged,sqlite3.connect(original) as before:
    for db in (merged,before):
        if db.execute('PRAGMA integrity_check').fetchone()!=('ok',): sys.exit('Corrupt database')
        if db.execute('PRAGMA foreign_key_check').fetchall(): sys.exit('Foreign key violation')
    for name in ('GiftClaimAudit','GiftBatch'):
        rows=lambda db: db.execute(f'SELECT * FROM "{name}" ORDER BY rowid').fetchall()
        if rows(before)!=rows(merged): sys.exit(name+' changed')
print('Fresh candidate validated; V4 gift audit and batches unchanged')
PY

# Stage production runtime files: LIVE-only files retained, V4 files win.
for rel in data content public/uploads; do
  mkdir -p "$RUN_DIR/staging/$rel"
  for source in live v4; do
    if [[ -d "$RUN_DIR/$source/$rel" ]]; then
      rsync -a "$RUN_DIR/$source/$rel/" "$RUN_DIR/staging/$rel/"
    fi
  done
done

log "Switching LIVE checkout to exact verified V4 commit (main branch untouched)"
CODE_CHANGED=1
safe_git "$LIVE" checkout -f --detach "$HEAD_V4"
cp "$RUN_DIR/staging/.env" "$LIVE/.env"
# Preserve the exact V4 generated secret file as well, even though the
# authoritative value is pinned into the production .env above.
if [[ -f "$RUN_DIR/v4/.nextauth-secret" ]]; then
  cp -a "$RUN_DIR/v4/.nextauth-secret" "$LIVE/.nextauth-secret"
else
  rm -f "$LIVE/.nextauth-secret"
fi
# V4's DATABASE_URL may name the usual prisma/prisma/dev.db relative file.
# Never silently use a different file: override only if resolved paths differ.
python3 - "$LIVE/.env" "$LIVE_DB" "$LIVE" <<'PY'
import pathlib,sys
env,db,root=map(pathlib.Path,sys.argv[1:])
lines=env.read_text().splitlines()
kept=[line for line in lines if not line.strip().removeprefix('export ').startswith('DATABASE_URL=')]
rel=pathlib.Path(db).resolve().relative_to((root/'prisma').resolve())
kept.append('DATABASE_URL="file:./'+rel.as_posix()+'"')
env.write_text('\n'.join(kept)+'\n')
env.chmod(0o600)
PY
log "Installing exact V4 dependencies and building production release"
( cd "$LIVE"; npm ci; npm test -- --runInBand --silent; npm run build )
log "Installing merged candidate into original LIVE SQLite path"
CANDIDATE_TEMP="$LIVE_DB.pending-v4-$"
install -m "$LIVE_MODE" -o "${LIVE_OWNER%:*}" -g "${LIVE_OWNER#*:}" \
  "$RUN_DIR/staging/candidate.sqlite3" "$CANDIDATE_TEMP"
DB_CHANGED=1
rm -f "$LIVE_DB-wal" "$LIVE_DB-shm"
mv -f "$CANDIDATE_TEMP" "$LIVE_DB"
FILES_CHANGED=1
for rel in data content public/uploads; do
  mkdir -p "$LIVE/$rel"
  rsync -a --delete "$RUN_DIR/staging/$rel/" "$LIVE/$rel/"
  chown -R "$LIVE_RUNTIME_OWNER" "$LIVE/$rel"
done
log "Checking final LIVE Prisma migrations"
( cd "$LIVE"; npm run db:status )
log "Starting production service"
systemctl start "$LIVE_SERVICE"
systemctl is-active --quiet "$LIVE_SERVICE" || die "LIVE service failed to start"
# Verify HTTP response on known local service port.
python3 - <<'PY'
import http.client,time,sys
for attempt in range(10):
    try:
        connection=http.client.HTTPConnection('127.0.0.1',3000,timeout=3)
        connection.request('GET','/',headers={'Host':'leighpogo.co.uk'})
        response=connection.getresponse()
        status=response.status
        connection.close()
        if 200 <= status < 400:
            print('LIVE HTTP check:',status)
            break
    except Exception:
        pass
    time.sleep(2)
else:
    sys.exit('LIVE did not respond successfully on localhost:3000')
PY
# Leave the original V4 test service STOPPED on success: otherwise new
# registrations/QR gift claims would split across two independent databases.
# Redirect the old test hostname and reprint QR codes for the production URL.
SUCCESS=1
trap - ERR EXIT
log "V4 production promotion complete"
log "Backup + merge report: $RUN_DIR"
log "Live git checkout is detached at $HEAD_V4; main branch has NOT changed."
log "The V4 test service remains STOPPED to prevent split-database claims."
log "Set up a redirect from the old V4 test hostname to https://leighpogo.co.uk and regenerate event QR codes."
