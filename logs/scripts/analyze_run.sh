#!/usr/bin/env bash
set -euo pipefail

# Usage: ./analyze_run.sh <run_dir>
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <run_dir>" >&2
  exit 1
fi

RUN_DIR="${1%/}"
SERIAL_LOG="${RUN_DIR}/esp32_serial.log"
SUMMARY="${RUN_DIR}/SUMMARY.md"
SERVER_LOG="${RUN_DIR}/automationone-server.log"

count_pattern() {
  local pattern="$1"
  local file="$2"
  if [[ ! -f "${file}" ]]; then
    echo 0
    return 0
  fi
  awk "/${pattern}/{n++} END{print n+0}" "${file}" 2>/dev/null
}

first_match() {
  local file="$1"
  local patt="$2"
  if [[ ! -f "${file}" ]]; then
    echo "none"
    return 0
  fi
  awk "/${patt}/{print NR\": \"$0; exit}" "${file}" 2>/dev/null || true
}

DISCONNECTED="$(count_pattern "MQTT_EVENT_DISCONNECTED" "${SERIAL_LOG}")"
WRITE_TIMEOUT="$(count_pattern "write_timeout_classified|write_timeout" "${SERIAL_LOG}")"
ERR4062="$(count_pattern "err_4062|Publish queue full" "${SERIAL_LOG}")"
TLS_TIMEOUT="$(count_pattern "tls_timeout" "${SERIAL_LOG}")"
SHED_OBS="$(count_pattern "shed observability payload" "${SERIAL_LOG}")"
COALESCE="$(count_pattern "config_push_coalesce|config_push_scheduled" "${SERVER_LOG}")"
INBOX_EVICT="$(count_pattern "inbound_inbox_evict" "${SERVER_LOG}")"

FIRST_ANOMALY="$(first_match "${SERIAL_LOG}" "MQTT_EVENT_DISCONNECTED|write_timeout|tls_timeout|Publish queue full")"
if [[ -z "${FIRST_ANOMALY}" || "${FIRST_ANOMALY}" == "none" ]]; then
  FIRST_ANOMALY="$(first_match "${SERVER_LOG}" "err_4062|write_timeout|tls_timeout|MQTT_EVENT_DISCONNECTED")"
fi
if [[ -z "${FIRST_ANOMALY}" ]]; then
  FIRST_ANOMALY="none"
fi

DISCOVERY_SERIAL_DEV="${SERIAL_DEV:-/dev/ttyUSB0}"
DISCOVERY_BAUD="${BAUD:-115200}"
DISCOVERY_SERVER_CONTAINER="${SERVER_CONTAINER:-automationone-server}"
DISCOVERY_LOKI_CONTAINER="${LOKI_CONTAINER:-automationone-loki}"
DISCOVERY_BROKER_CONTAINER="${BROKER_CONTAINER:-automationone-mqtt}"
DISCOVERY_API_BASE="${API_BASE:-http://localhost:8000}"
DISCOVERY_LOKI_ENDPOINT="${LOKI_URL:-http://localhost:3100}"
DISCOVERY_ESP_ID="${ESP_ID:-ESP_EA5484}"

cat > "${SUMMARY}" <<EOF
# Run Summary: $(basename "${RUN_DIR}")
Generated: $(date -Ins)

## Discovery Snapshot
- serial_device: ${DISCOVERY_SERIAL_DEV}
- serial_baudrate: ${DISCOVERY_BAUD}
- container_server: ${DISCOVERY_SERVER_CONTAINER}
- container_loki: ${DISCOVERY_LOKI_CONTAINER}
- container_broker: ${DISCOVERY_BROKER_CONTAINER}
- api_base_url: ${DISCOVERY_API_BASE}
- loki_endpoint: ${DISCOVERY_LOKI_ENDPOINT}
- esp_id: ${DISCOVERY_ESP_ID}

## Key Metrics
- mqtt_disconnected: ${DISCONNECTED}
- write_timeout_classified: ${WRITE_TIMEOUT}
- err_4062: ${ERR4062}
- tls_timeout: ${TLS_TIMEOUT}

## Fix-Marker (Aktivitätsnachweis)
- FP1 shed_observability: ${SHED_OBS}
- FP2 inbound_inbox_evict: ${INBOX_EVICT}
- FP3 config_push_coalesce: ${COALESCE}

## First Anomaly
${FIRST_ANOMALY}
EOF

cat "${SUMMARY}"
