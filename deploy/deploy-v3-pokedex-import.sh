#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="/projects/V3"
INSTALLER="${REPO_DIR}/deploy/install-v3-test.sh"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

[[ ${EUID} -eq 0 ]] || fail "Run this deploy script with sudo."
[[ -d "$REPO_DIR/.git" ]] || fail "$REPO_DIR is not the V3 Git checkout."
[[ -f "$INSTALLER" ]] || fail "$INSTALLER is missing. Pull the v3 branch first."

command -v apt-get >/dev/null 2>&1 || fail "apt-get is required to install OCR dependencies."

echo "Installing Pokédex OCR runtime dependencies..."
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  tesseract-ocr \
  python3-pil

command -v tesseract >/dev/null 2>&1 || fail "tesseract was not installed successfully."
python3 - <<'PY'
from PIL import Image
print("Pillow OCR image support: OK")
PY

echo "Deploying the current v3 branch with the existing V3 test installer..."
exec bash "$INSTALLER"
