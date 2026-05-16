#!/usr/bin/env bash
set -euo pipefail

# Usage: ./capture_serial.sh <output_file> [device] [baudrate]
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <output_file> [device] [baudrate]" >&2
  exit 1
fi

OUT="$1"
DEVICE="${2:-/dev/ttyUSB0}"
BAUD="${3:-115200}"
PID_FILE="${OUT}.pid"

if [[ ! -e "${DEVICE}" ]]; then
  echo "Serial device not found: ${DEVICE}" >&2
  exit 1
fi

mkdir -p "$(dirname "${OUT}")"
touch "${OUT}"

stty -F "${DEVICE}" "${BAUD}" cs8 -cstopb -parenb -ixon -ixoff -echo raw

(
  exec >> "${OUT}"
  cat "${DEVICE}" | while IFS= read -r line || [[ -n "${line}" ]]; do
    printf '%s %s\n' "$(date +%Y-%m-%dT%H:%M:%S.%N%:z)" "${line}"
  done
) &

echo $! > "${PID_FILE}"
echo "serial_capture_started pid=$(cat "${PID_FILE}") device=${DEVICE} baud=${BAUD} out=${OUT}"
