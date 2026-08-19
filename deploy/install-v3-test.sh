#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/projects/V3"
BRANCH="v3"
SERVICE_NAME="leighpogo-test"
PORT="3001"
SITE_URL="https://dev.leighpogo.co.uk"
LIVE_DIR="/projects/LIVE"
LIVE_SERVICE="leighpogo.service"
LIVE_PORT="3000"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

if [[ ${EUID} -ne 0 ]]; then
  fail "Run this installer with sudo."
fi

# Hard safety guards: this installer is intentionally test-only.
[[ "$REPO_DIR" != "$LIVE_DIR" ]] || fail "Refusing to use the LIVE checkout."
[[ "$SERVICE_NAME" != "leighpogo" ]] || fail "Refusing to target the live service."
[[ "$PORT" != "$LIVE_PORT" ]] || fail "Refusing to target the live port."

for command in git npm node systemctl runuser stat sed grep cp; do
  command -v "$command" >/dev/null 2>&1 || fail "$command is required."
done

[[ -d "$REPO_DIR/.git" ]] || fail "$REPO_DIR is not a Git checkout."
[[ -f "$REPO_DIR/package.json" ]] || fail "$REPO_DIR/package.json is missing."
[[ -f "$REPO_DIR/.env" ]] || fail "$REPO_DIR/.env is missing."
[[ -f "$REPO_DIR/prisma/dev.db" ]] || fail "$REPO_DIR/prisma/dev.db is missing."
[[ -f "$REPO_DIR/deploy/install-push.sh" ]] || fail "deploy/install-push.sh is missing."
[[ -f "$REPO_DIR/deploy/install-pokedex-import-worker.sh" ]] || fail "deploy/install-pokedex-import-worker.sh is missing."

APP_USER="$(stat -c '%U' "$REPO_DIR")"
APP_GROUP="$(stat -c '%G' "$REPO_DIR")"
[[ -n "$APP_USER" && "$APP_USER" != "root" ]] || fail "Unable to determine the non-root app user from $REPO_DIR."

run_as_app() {
  runuser -u "$APP_USER" -- env PATH="$PATH" "$@"
}

set_env_value() {
  local key="$1"
  local value="$2"
  local env_file="$REPO_DIR/.env"

  if grep -q "^${key}=" "$env_file"; then
    sed -i "s|^${key}=.*$|${key}=\"${value}\"|" "$env_file"
  else
    printf '%s="%s"\n' "$key" "$value" >> "$env_file"
  fi
}

LIVE_WAS_ACTIVE=0
if systemctl is-active --quiet "$LIVE_SERVICE"; then
  LIVE_WAS_ACTIVE=1
fi

if [[ -n "$(run_as_app git -C "$REPO_DIR" status --porcelain --untracked-files=no)" ]]; then
  fail "Tracked files in $REPO_DIR have local changes. Commit/stash them before installing."
fi

echo "Updating V3 from GitHub..."
run_as_app git -C "$REPO_DIR" fetch origin "$BRANCH"
run_as_app git -C "$REPO_DIR" switch "$BRANCH"
run_as_app git -C "$REPO_DIR" pull --ff-only origin "$BRANCH"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ENV_BACKUP="$REPO_DIR/.env.backup.${TIMESTAMP}"
DB_BACKUP="$REPO_DIR/prisma/dev.db.backup.${TIMESTAMP}"
cp -a "$REPO_DIR/.env" "$ENV_BACKUP"
cp -a "$REPO_DIR/prisma/dev.db" "$DB_BACKUP"

set_env_value "DATABASE_URL" "file:./dev.db"
set_env_value "NEXTAUTH_URL" "$SITE_URL"
chown "$APP_USER:$APP_GROUP" "$REPO_DIR/.env"

echo "Installing dependencies, applying V3 migrations, and building..."
run_as_app bash -lc "cd '$REPO_DIR' && npm ci && npm run db:deploy && npm run build"

UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
cat > "$UNIT_FILE" <<EOF
[Unit]
Description=LeighPogo V3 Test Service
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${REPO_DIR}
Environment=NODE_ENV=production
ExecStart=${REPO_DIR}/node_modules/.bin/next start -p ${PORT} -H 0.0.0.0
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}.service"
systemctl is-active --quiet "${SERVICE_NAME}.service" || fail "${SERVICE_NAME}.service did not start."

echo "Installing V3 push configuration and Raid Hour scheduler..."
bash "$REPO_DIR/deploy/install-push.sh" "$SERVICE_NAME" "$PORT" "$SITE_URL"

echo "Installing Pokédex import queue worker..."
bash "$REPO_DIR/deploy/install-pokedex-import-worker.sh" "$SERVICE_NAME" "$PORT"

systemctl is-active --quiet "${SERVICE_NAME}.service" || fail "${SERVICE_NAME}.service is not active after push/worker setup."
systemctl is-enabled --quiet "${SERVICE_NAME}-raid-hour.timer" || fail "${SERVICE_NAME}-raid-hour.timer is not enabled."
systemctl is-enabled --quiet "${SERVICE_NAME}-pokedex-import-worker.timer" || fail "${SERVICE_NAME}-pokedex-import-worker.timer is not enabled."

if (( LIVE_WAS_ACTIVE == 1 )) && ! systemctl is-active --quiet "$LIVE_SERVICE"; then
  fail "$LIVE_SERVICE was active before the test install but is no longer active."
fi

echo
echo "V3 test installation complete."
echo "Checkout: ${REPO_DIR}"
echo "Service: ${SERVICE_NAME}.service"
echo "Port: ${PORT}"
echo "URL: ${SITE_URL}"
echo "Database backup: ${DB_BACKUP}"
echo "Environment backup: ${ENV_BACKUP}"
echo "Push timer: ${SERVICE_NAME}-raid-hour.timer"
echo "Pokédex queue timer: ${SERVICE_NAME}-pokedex-import-worker.timer"
echo
echo "Live service was not targeted: ${LIVE_SERVICE} / port ${LIVE_PORT}."
