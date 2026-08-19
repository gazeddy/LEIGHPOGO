#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script with sudo." >&2
  exit 1
fi

SERVICE_NAME="${1:-leighpogo}"
PORT="${2:-3000}"
SERVICE_NAME="${SERVICE_NAME%.service}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
APP_SERVICE="${SERVICE_NAME}.service"
WORKER_SERVICE="${SERVICE_NAME}-pokedex-import-worker.service"
WORKER_TIMER="${SERVICE_NAME}-pokedex-import-worker.timer"
ENV_DIR="/etc/leighpogo"
ENV_FILE="${ENV_DIR}/${SERVICE_NAME}-pokedex-import.env"
DROPIN_DIR="/etc/systemd/system/${APP_SERVICE}.d"
DROPIN_FILE="${DROPIN_DIR}/pokedex-import-worker.conf"
QUEUE_DIR="${REPO_DIR}/data/pokedex-import-queue"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

[[ "$SERVICE_NAME" =~ ^[A-Za-z0-9_.@-]+$ ]] || fail "Invalid service name: $SERVICE_NAME"
[[ "$PORT" =~ ^[0-9]+$ ]] && (( PORT >= 1 && PORT <= 65535 )) || fail "Invalid port: $PORT"

for command in systemctl curl openssl install grep sed id; do
  command -v "$command" >/dev/null 2>&1 || fail "$command is required."
done

systemctl cat "$APP_SERVICE" >/dev/null 2>&1 || fail "${APP_SERVICE} does not exist."

APP_USER="$(systemctl show "$APP_SERVICE" -p User --value)"
[[ -n "$APP_USER" ]] || APP_USER="$(stat -c '%U' "$REPO_DIR")"
[[ -n "$APP_USER" ]] || fail "Unable to determine application user."
APP_GROUP="$(id -gn "$APP_USER")"

install -d -m 0750 "$ENV_DIR"
install -d -m 0700 -o "$APP_USER" -g "$APP_GROUP" "$QUEUE_DIR"

if [[ -f "$ENV_FILE" ]] && grep -q '^POKEDEX_IMPORT_WORKER_SECRET=' "$ENV_FILE"; then
  WORKER_SECRET="$(sed -n 's/^POKEDEX_IMPORT_WORKER_SECRET=//p' "$ENV_FILE" | head -n 1)"
else
  WORKER_SECRET="$(openssl rand -hex 32)"
fi

[[ -n "$WORKER_SECRET" ]] || fail "Unable to create the Pokédex import worker secret."

cat > "$ENV_FILE" <<EOF
POKEDEX_IMPORT_WORKER_SECRET=${WORKER_SECRET}
POKEDEX_IMPORT_QUEUE_DIR=${QUEUE_DIR}
EOF
chmod 0600 "$ENV_FILE"

install -d -m 0755 "$DROPIN_DIR"
cat > "$DROPIN_FILE" <<EOF
[Service]
EnvironmentFile=${ENV_FILE}
EOF

cat > "/etc/systemd/system/${WORKER_SERVICE}" <<EOF
[Unit]
Description=LEIGHPOGO Pokédex import queue worker
After=network-online.target ${APP_SERVICE}

[Service]
Type=oneshot
User=${APP_USER}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/curl --fail-with-body --silent --show-error --max-time 900 --output /dev/null --request POST --header=X-Pokedex-Import-Worker-Secret:\${POKEDEX_IMPORT_WORKER_SECRET} http://127.0.0.1:${PORT}/api/pokedex-import/process-next
EOF

cat > "/etc/systemd/system/${WORKER_TIMER}" <<EOF
[Unit]
Description=Run LEIGHPOGO Pokédex import queue worker

[Timer]
OnBootSec=20s
OnUnitInactiveSec=10s
AccuracySec=1s
Persistent=true
Unit=${WORKER_SERVICE}

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl restart "$APP_SERVICE"
systemctl enable --now "$WORKER_TIMER"

systemctl is-active --quiet "$APP_SERVICE" || fail "${APP_SERVICE} is not active after worker setup."
systemctl is-enabled --quiet "$WORKER_TIMER" || fail "${WORKER_TIMER} is not enabled."

echo
echo "Pokédex import queue worker installed."
echo "Application service: ${APP_SERVICE}"
echo "Worker service: ${WORKER_SERVICE}"
echo "Worker timer: ${WORKER_TIMER}"
echo "Queue directory: ${QUEUE_DIR}"
echo "Poll interval: 10 seconds after each worker run"
