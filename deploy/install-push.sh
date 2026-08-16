#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script with sudo." >&2
  exit 1
fi

SERVICE_NAME="${1:-leighpogo}"
VAPID_SUBJECT="${2:-https://leighpogo.co.uk}"
SERVICE_NAME="${SERVICE_NAME%.service}"

if [[ ! "$SERVICE_NAME" =~ ^[A-Za-z0-9_.@-]+$ ]]; then
  echo "Invalid systemd service name: $SERVICE_NAME" >&2
  exit 1
fi

if [[ "$VAPID_SUBJECT" != mailto:* && "$VAPID_SUBJECT" != https://* ]]; then
  echo "VAPID subject must start with mailto: or https://" >&2
  exit 1
fi

for command in systemctl node; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "$command is required." >&2
    exit 1
  fi
done

APP_SERVICE="${SERVICE_NAME}.service"
ENV_DIR="/etc/leighpogo"
ENV_FILE="${ENV_DIR}/${SERVICE_NAME}-push.env"
DROPIN_DIR="/etc/systemd/system/${APP_SERVICE}.d"
DROPIN_FILE="${DROPIN_DIR}/push-notifications.conf"

if ! systemctl cat "$APP_SERVICE" >/dev/null 2>&1; then
  echo "${APP_SERVICE} does not exist." >&2
  exit 1
fi

install -d -m 0750 "$ENV_DIR"

if [[ -f "$ENV_FILE" ]] \
  && grep -q '^VAPID_PUBLIC_KEY=' "$ENV_FILE" \
  && grep -q '^VAPID_PRIVATE_KEY=' "$ENV_FILE"; then
  echo "Reusing existing VAPID keys in ${ENV_FILE}."
else
  umask 077
  VAPID_KEYS="$(node <<'NODE'
const crypto = require('node:crypto')
const ecdh = crypto.createECDH('prime256v1')
ecdh.generateKeys()
process.stdout.write(
  `${ecdh.getPublicKey().toString('base64url')}\n${ecdh.getPrivateKey().toString('base64url')}`,
)
NODE
)"
  VAPID_PUBLIC_KEY="$(printf '%s\n' "$VAPID_KEYS" | sed -n '1p')"
  VAPID_PRIVATE_KEY="$(printf '%s\n' "$VAPID_KEYS" | sed -n '2p')"

  cat > "$ENV_FILE" <<EOF
VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}
VAPID_SUBJECT=${VAPID_SUBJECT}
EOF
  chmod 0600 "$ENV_FILE"
  echo "Generated VAPID keys in ${ENV_FILE}."
fi

# Keep the subject current without rotating the key pair.
if grep -q '^VAPID_SUBJECT=' "$ENV_FILE"; then
  sed -i "s|^VAPID_SUBJECT=.*$|VAPID_SUBJECT=${VAPID_SUBJECT}|" "$ENV_FILE"
else
  printf 'VAPID_SUBJECT=%s\n' "$VAPID_SUBJECT" >> "$ENV_FILE"
fi
chmod 0600 "$ENV_FILE"

install -d -m 0755 "$DROPIN_DIR"
cat > "$DROPIN_FILE" <<EOF
[Service]
EnvironmentFile=${ENV_FILE}
EOF

systemctl daemon-reload
systemctl restart "$APP_SERVICE"

echo
echo "Push notification VAPID configuration installed."
echo "Application service: ${APP_SERVICE}"
echo "Environment file: ${ENV_FILE}"
echo "VAPID subject: ${VAPID_SUBJECT}"
echo
echo "Next, install the Raid Hour scheduler from the app checkout:"
echo "  sudo bash deploy/install-raid-hour-timer.sh ${SERVICE_NAME} 3000"
echo
echo "Then sign in to LEIGHPOGO, open Notifications, enable push, and use Send test push."
