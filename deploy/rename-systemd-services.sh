#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script with sudo." >&2
  exit 1
fi

rename_service() {
  local old_name="$1"
  local new_name="$2"
  local old_path="/etc/systemd/system/${old_name}.service"
  local new_path="/etc/systemd/system/${new_name}.service"

  if [[ ! -f "$old_path" ]]; then
    if [[ -f "$new_path" ]]; then
      echo "${new_name}.service already exists; verifying it."
      systemctl enable --now "${new_name}.service"
      systemctl is-active --quiet "${new_name}.service"
      return
    fi

    echo "Skipping ${old_name}.service: no old or new unit file was found."
    return
  fi

  echo "Creating ${new_name}.service from ${old_name}.service..."
  install -m 0644 "$old_path" "$new_path"
  systemctl daemon-reload

  if ! systemctl enable --now "${new_name}.service"; then
    echo "Failed to start ${new_name}.service; rolling back the new unit." >&2
    rm -f "$new_path"
    systemctl daemon-reload
    exit 1
  fi

  if ! systemctl is-active --quiet "${new_name}.service"; then
    echo "${new_name}.service did not become active; keeping the old service." >&2
    systemctl disable --now "${new_name}.service" || true
    rm -f "$new_path"
    systemctl daemon-reload
    exit 1
  fi

  echo "${new_name}.service is active. Removing ${old_name}.service..."
  systemctl disable --now "${old_name}.service" || true
  rm -f "$old_path"
  systemctl daemon-reload
  systemctl reset-failed
}

rename_service "pokego-backend" "leighpogo"
rename_service "pokego-test" "leighpogo-test"

echo
echo "Current LeighPoGo services:"
systemctl --no-pager --full status leighpogo.service leighpogo-test.service || true
