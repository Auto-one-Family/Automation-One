#!/usr/bin/env bash
set -euo pipefail

# Usage: ./load_stage.sh <stage> <api_base> <esp_id>
# stage: 1, 2a, 2b
if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <stage> <api_base> <esp_id>" >&2
  exit 1
fi

STAGE="$1"
API="${2%/}"
ESP_ID="$3"

case "${STAGE}" in
  1)  AKTOR_SAVES=3; AKTOR_WINDOW=2; CMD_COUNT=5 ;;
  2a) AKTOR_SAVES=6; AKTOR_WINDOW=3; CMD_COUNT=10 ;;
  2b) AKTOR_SAVES=9; AKTOR_WINDOW=3; CMD_COUNT=15 ;;
  *)  echo "Unknown stage: ${STAGE}" >&2; exit 1 ;;
esac

API_USER="${API_USER:-}"
API_PASSWORD="${API_PASSWORD:-}"
API_PASSWORD_FALLBACK="${API_PASSWORD_FALLBACK:-}"
ACTUATOR_GPIO="${ACTUATOR_GPIO:-}"
AUTH_HEADER=""

login_if_needed() {
  if [[ -z "${API_USER}" || -z "${API_PASSWORD}" ]]; then
    return 0
  fi

  local token pw
  for pw in "${API_PASSWORD}" "${API_PASSWORD_FALLBACK}"; do
    [[ -z "${pw}" ]] && continue
    if token="$(python3 - "${API}" "${API_USER}" "${pw}" <<'PY'
import json
import sys
import urllib.request
import urllib.error

api, user, password = sys.argv[1], sys.argv[2], sys.argv[3]
payload = json.dumps({"username": user, "password": password}).encode()
req = urllib.request.Request(
    f"{api}/api/v1/auth/login",
    data=payload,
    headers={"Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.loads(r.read().decode())
except urllib.error.HTTPError as e:
    print(f"login_failed_http_{e.code}")
    sys.exit(2)
token = data.get("tokens", {}).get("access_token")
if not token:
    print("login_failed_missing_token")
    sys.exit(3)
print(token)
PY
)"; then
      AUTH_HEADER="Authorization: Bearer ${token}"
      return 0
    fi
  done

  echo "login_failed for configured API credentials" >&2
  return 1
}

pick_gpio_if_needed() {
  if [[ -n "${ACTUATOR_GPIO}" ]]; then
    return 0
  fi

  # Discovery-Fallback: erste vorhandene Aktor-GPIO der ESP aus API lesen.
  ACTUATOR_GPIO="$(python3 - "${API}" "${ESP_ID}" "${AUTH_HEADER}" <<'PY'
import json
import sys
import urllib.request

api, esp_id, auth_header = sys.argv[1], sys.argv[2], sys.argv[3]
headers = {}
if auth_header:
    k, v = auth_header.split(": ", 1)
    headers[k] = v
req = urllib.request.Request(f"{api}/api/v1/actuators/", headers=headers, method="GET")
with urllib.request.urlopen(req, timeout=10) as r:
    body = json.loads(r.read().decode())
data = body.get("data", [])
gpios = sorted({item.get("gpio") for item in data if item.get("esp_device_id") == esp_id and isinstance(item.get("gpio"), int)})
print(gpios[0] if gpios else "")
PY
)"

  if [[ -z "${ACTUATOR_GPIO}" ]]; then
    echo "No actuator GPIO found. Set ACTUATOR_GPIO in config.env." >&2
    exit 1
  fi
}

call_api() {
  local method="$1"
  local url="$2"
  local data="$3"
  if [[ -n "${AUTH_HEADER}" ]]; then
    curl -sS -o /dev/null -w "%{http_code}" -X "${method}" "${url}" \
      -H "Content-Type: application/json" -H "${AUTH_HEADER}" -d "${data}"
  else
    curl -sS -o /dev/null -w "%{http_code}" -X "${method}" "${url}" \
      -H "Content-Type: application/json" -d "${data}"
  fi
}

login_if_needed
pick_gpio_if_needed

echo "[$(date -Ins)] Load stage ${STAGE} start: saves=${AKTOR_SAVES} window=${AKTOR_WINDOW}s commands=${CMD_COUNT} gpio=${ACTUATOR_GPIO}"

declare -a STATUSES=()

for i in $(seq 1 "${AKTOR_SAVES}"); do
  payload="{\"name\":\"test_aktor_${STAGE}_${i}\"}"
  code="$(call_api "POST" "${API}/api/v1/actuators/${ESP_ID}/${ACTUATOR_GPIO}" "${payload}")"
  STATUSES+=("${code}")
done

sleep "${AKTOR_WINDOW}"

for i in $(seq 1 "${CMD_COUNT}"); do
  if (( i % 2 == 0 )); then
    CMD="ON"
  else
    CMD="OFF"
  fi
  payload="{\"command\":\"${CMD}\"}"
  code="$(call_api "POST" "${API}/api/v1/actuators/${ESP_ID}/${ACTUATOR_GPIO}/command" "${payload}")"
  STATUSES+=("${code}")
  sleep 0.1
done

bad=0
for s in "${STATUSES[@]}"; do
  if [[ "${s}" == "401" || "${s}" == "404" || "${s}" == "000" ]]; then
    bad=1
    break
  fi
done

echo "[$(date -Ins)] Load stage ${STAGE} done status_codes=${STATUSES[*]}"
if (( bad == 1 )); then
  echo "load_stage_failed due to 401/404/000 response" >&2
  exit 2
fi
