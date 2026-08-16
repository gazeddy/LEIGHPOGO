#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script with sudo." >&2
  exit 1
fi

SERVICE_NAME="${1:-leighpogo}"
PORT="${2:-3000}"
SERVICE_NAME="${SERVICE_NAME%.service}"

if [[ ! "$SERVICE_NAME" =~ ^[A-Za-z0-9_.@-]+$ ]]; then
  echo "Invalid systemd service name: $SERVICE_NAME" >&2
  exit 1
fi

if [[ ! "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
  echo "Invalid port: $PORT" >&2
  exit 1
fi

for command in systemctl openssl curl; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "$command is required." >&2
    exit 1
  fi
done

APP_SERVICE="${SERVICE_NAME}.service"
TIMER_BASE="${SERVICE_NAME}-raid-hour"
ENV_DIR="/etc/leighpogo"
ENV_FILE="${ENV_DIR}/${TIMER_BASE}.env"
DROPIN_DIR="/etc/systemd/system/${APP_SERVICE}.d"
DROPIN_FILE="${DROPIN_DIR}/raid-hour-push.conf"
SERVICE_FILE="/etc/systemd/system/${TIMER_BASE}.service"
TIMER_FILE="/etc/systemd/system/${TIMER_BASE}.timer"

if ! systemctl cat "$APP_SERVICE" >/dev/null 2>&1; then
  echo "${APP_SERVICE} does not exist." >&2
  exit 1
fi

install -d -m 0750 "$ENV_DIR"

if [[ ! -f "$ENV_FILE" ]] || ! grep -q '^RAID_HOUR_CRON_SECRET=' "$ENV_FILE"; then
  umask 077
  printf 'RAID_HOUR_CRON_SECRET=%s\n' "$(openssl rand -hex 32)" > "$ENV_FILE"
  chmod 0600 "$ENV_FILE"
  echo "Generated a Raid Hour scheduler secret in ${ENV_FILE}."
else
  echo "Reusing the existing Raid Hour scheduler secret in ${ENV_FILE}."
fi

install -d -m 0755 "$DROPIN_DIR"
cat > "$DROPIN_FILE" <<EOF
[Service]
EnvironmentFile=${ENV_FILE}
EOF

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=LEIGHPOGO Wednesday Raid Hour push check for ${SERVICE_NAME}
After=${APP_SERVICE}
Wants=${APP_SERVICE}

[Service]
Type=oneshot
EnvironmentFile=${ENV_FILE}
ExecStart=/bin/sh -c 'exec /usr/bin/curl -fsS --max-time 120 -X POST -H "Authorization: Bearer \$RAID_HOUR_CRON_SECRET" http://127.0.0.1:${PORT}/api/push/raid-hour'
EOF

cat > "$TIMER_FILE" <<EOF
[Unit]
Description=Check for due LEIGHPOGO Raid Hour pushes every 15 minutes

[Timer]
OnCalendar=*-*-* *:00/15:00
Persistent=true
AccuracySec=30s
Unit=${TIMER_BASE}.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl restart "$APP_SERVICE"
systemctl enable --now "${TIMER_BASE}.timer"

echo
echo "Raid Hour push scheduler installed."
echo "Application service: ${APP_SERVICE}"
echo "Scheduler timer: ${TIMER_BASE}.timer"
echo "Scheduler endpoint: http://127.0.0.1:${PORT}/api/push/raid-hour"
systemctl --no-pager --full status "${TIMER_BASE}.timer" || true
