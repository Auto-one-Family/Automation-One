#!/usr/bin/env bash
set -euo pipefail

# Installs a deterministic wokwi-cli version for CI/local reproducibility.
# Usage:
#   scripts/wokwi/install_wokwi_cli.sh 0.26.1
#   WOKWI_CLI_VERSION=0.26.1 scripts/wokwi/install_wokwi_cli.sh

VERSION="${1:-${WOKWI_CLI_VERSION:-0.26.1}}"

if [[ -z "${VERSION}" ]]; then
  echo "[ERROR] Missing Wokwi CLI version" >&2
  exit 2
fi

echo "[INFO] Installing wokwi-cli version ${VERSION}"
curl -L https://wokwi.com/ci/install.sh | sh -s "${VERSION}"
echo "$HOME/.wokwi/bin" >> "${GITHUB_PATH:-/dev/null}" || true

if ! command -v wokwi-cli >/dev/null 2>&1; then
  export PATH="$HOME/.wokwi/bin:$HOME/bin:$PATH"
fi

INSTALLED_VERSION="$(wokwi-cli --short-version 2>/dev/null || true)"
if [[ -z "${INSTALLED_VERSION}" ]]; then
  INSTALLED_VERSION="$(wokwi-cli --version | awk '{print $NF}' | tr -d '\r' || true)"
fi

if [[ -z "${INSTALLED_VERSION}" ]]; then
  echo "[ERROR] wokwi-cli was not found after installation" >&2
  exit 3
fi

if [[ "${INSTALLED_VERSION}" != "${VERSION}" ]]; then
  echo "[ERROR] Version mismatch: expected=${VERSION}, installed=${INSTALLED_VERSION}" >&2
  exit 4
fi

echo "[OK] wokwi-cli pinned and verified: ${INSTALLED_VERSION}"
