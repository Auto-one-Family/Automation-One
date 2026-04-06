#!/usr/bin/env bash
set -euo pipefail

# Waits for a readiness marker in Wokwi serial logs.
# Supports either explicit --log-file or auto discovery of latest .log.
#
# Exit codes:
# 20 = log file missing
# 21 = timeout (and no fallback)

LOG_FILE=""
AUTO_LATEST=false
PATTERN="MQTT connected"
TIMEOUT_SECONDS=60
POLL_SECONDS=1
FALLBACK_SLEEP_SECONDS=35
REPORT_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --log-file)
      LOG_FILE="$2"
      shift 2
      ;;
    --auto-latest-log)
      AUTO_LATEST=true
      shift
      ;;
    --pattern)
      PATTERN="$2"
      shift 2
      ;;
    --timeout-seconds)
      TIMEOUT_SECONDS="$2"
      shift 2
      ;;
    --poll-seconds)
      POLL_SECONDS="$2"
      shift 2
      ;;
    --fallback-sleep-seconds)
      FALLBACK_SLEEP_SECONDS="$2"
      shift 2
      ;;
    --report-file)
      REPORT_FILE="$2"
      shift 2
      ;;
    *)
      echo "[ERROR] Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ "${AUTO_LATEST}" == "true" && -z "${LOG_FILE}" ]]; then
  LOG_FILE="$(ls -1t ./*.log 2>/dev/null | head -n 1 || true)"
fi

if [[ -z "${LOG_FILE}" || ! -f "${LOG_FILE}" ]]; then
  echo "[ERROR] Log file not found for readiness wait: ${LOG_FILE:-<empty>}" >&2
  exit 20
fi

if [[ -n "${REPORT_FILE}" ]]; then
  mkdir -p "$(dirname "${REPORT_FILE}")"
  {
    echo "- Logfile: ${LOG_FILE}"
    echo "- Readiness pattern: \`${PATTERN}\`"
    echo "- Wait start: $(date -Iseconds)"
  } >> "${REPORT_FILE}"
fi

for i in $(seq 1 "${TIMEOUT_SECONDS}"); do
  if grep -q "${PATTERN}" "${LOG_FILE}" 2>/dev/null; then
    TS="$(date -Iseconds)"
    echo "[READY] Pattern matched after ${i}s in ${LOG_FILE}"
    echo "${TS}"
    if [[ -n "${REPORT_FILE}" ]]; then
      {
        echo "- Readiness matched: ${TS}"
        echo "- Wait duration seconds: ${i}"
      } >> "${REPORT_FILE}"
    fi
    exit 0
  fi
  sleep "${POLL_SECONDS}"
done

if [[ "${FALLBACK_SLEEP_SECONDS}" -gt 0 ]]; then
  echo "[WARN] Readiness not matched after ${TIMEOUT_SECONDS}s. Using temporary fallback sleep ${FALLBACK_SLEEP_SECONDS}s."
  # TODO(g04): remove fallback path once all scenarios expose deterministic readiness markers.
  sleep "${FALLBACK_SLEEP_SECONDS}"
  TS="$(date -Iseconds)"
  echo "${TS}"
  if [[ -n "${REPORT_FILE}" ]]; then
    {
      echo "- Readiness matched: fallback-used"
      echo "- Fallback sleep seconds: ${FALLBACK_SLEEP_SECONDS}"
      echo "- Fallback end: ${TS}"
    } >> "${REPORT_FILE}"
  fi
  exit 0
fi

echo "[ERROR] Readiness timeout after ${TIMEOUT_SECONDS}s (${LOG_FILE})" >&2
exit 21
