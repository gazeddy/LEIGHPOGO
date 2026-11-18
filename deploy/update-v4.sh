#!/usr/bin/env bash
# Safely update the V4 development site. Never touches /projects/LIVE.
set -Eeuo pipefail

V4_DIR="${V4_DIR:-/projects/V4}"
V4_SERVICE="${V4_SERVICE:-leighpogo-test.service}"
BACKUP_DIR="${BACKUP_DIR:-/projects/backups/leighpogo/v4-updates}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
for command in git python3 npm npx systemctl; do
  command -v "$command" >/dev/null 2>&1 || die "Missing required command: $command"
done

[[ -d "$V4_DIR/.git" ]] || die "V4 checkout not found at $V4_DIR"
[[ "$(git -C "$V4_DIR" branch --show-current)" == "v4" ]] || die "Refusing update: checkout must be on branch v4"
[[ -z "$(git -C "$V4_DIR" status --porcelain --untracked-files=no)" ]] || die "Checkout has uncommitted tracked changes; resolve before updating"
[[ "$V4_SERVICE" == "leighpogo-test.service" ]] || die "Refusing to touch a service other than leighpogo-test.service"
cd "$V4_DIR"

# Prisma SQLite file paths are resolved relative to prisma/schema.prisma.
# Read DATABASE_URL without evaluating/sourcing the .env file.
DB_PATH="$(python3 - "$V4_DIR" <<'PY'
import os, pathlib, sys
root = pathlib.Path(sys.argv[1]).resolve()
env = root / ".env"
if not env.is_file():
    sys.exit("Missing .env; cannot verify the actual V4 database")
url = os.environ.get("DATABASE_URL")
if not url:
    for line in env.read_text().splitlines():
        line = line.strip()
        if line.startswith("export "):
            line = line[7:].strip()
        if line.startswith("DATABASE_URL="):
            url = line.split("=", 1)[1].strip().strip('"').strip("'")
if not url or not url.startswith("file:"):
    sys.exit("DATABASE_URL must be an SQLite file: path")
path = url[5:].split("?", 1)[0]
if not path or path == ":memory:":
    sys.exit("Cannot back up an in-memory database")
db = pathlib.Path(path)
if not db.is_absolute():
    db = root / "prisma" / db
db = db.resolve()
if not db.is_file():
    sys.exit(f"Database file does not exist: {db}")
if db.stat().st_size == 0:
    sys.exit(f"Database file is empty: {db}")
# Protect against accidentally backing up the separate production checkout.
if not db.is_relative_to(root):
    sys.exit(f"Database outside V4 checkout; refusing: {db}")
print(db)
PY
)" || die "Unable to find and validate V4 SQLite database"

[[ -n "$DB_PATH" ]] || die "Database path could not be determined"
mkdir -p "$BACKUP_DIR" || die "Cannot create backup directory: $BACKUP_DIR"
chmod 700 "$BACKUP_DIR" || die "Cannot secure backup directory"
STAMP="$(date -u '+%Y%m%dT%H%M%SZ')"
BACKUP_FILE="$BACKUP_DIR/v4-before-update-$STAMP-$$.sqlite3"
log "Backing up $DB_PATH"

# sqlite3 online backup copies a consistent snapshot even in WAL mode.
# Never copy the live .db directly while Next.js may be writing to it.
python3 - "$DB_PATH" "$BACKUP_FILE" <<'PY'
import pathlib, sqlite3, sys
source_path, target_path = map(pathlib.Path, sys.argv[1:])
try:
    source = sqlite3.connect(f"file:{source_path}?mode=ro", uri=True, timeout=30)
    target = sqlite3.connect(str(target_path), timeout=30)
    with source, target:
        source.backup(target)
    source.close()
    target.close()
    with sqlite3.connect(f"file:{target_path}?mode=ro", uri=True) as check:
        result = check.execute("PRAGMA integrity_check").fetchone()
        if result is None or result[0] != "ok":
            raise RuntimeError(f"Backup integrity_check failed: {result}")
    target_path.chmod(0o600)
    if target_path.stat().st_size == 0:
        raise RuntimeError("Backup is empty")
except Exception:
    target_path.unlink(missing_ok=True)
    raise
PY

[[ -s "$BACKUP_FILE" ]] || die "Database backup failed; update cancelled"
log "Verified backup saved to $BACKUP_FILE"
log "Updating v4 code (backup already complete)"
git pull --ff-only origin v4
npm ci
npm run db:deploy
npx prisma generate
npm test -- --runInBand --silent
npm run build
sudo systemctl restart "$V4_SERVICE"
log "V4 update complete. Backup retained at $BACKUP_FILE"
