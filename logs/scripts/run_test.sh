#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./run_test.sh --dry-run-checks
#   ./run_test.sh <stage> [runs]
# stage: 1, 2a, 2b

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DISCONNECT_ROOT="${ROOT_DIR}/logs/current/hardware/disconnect-repro"
mkdir -p "${DISCONNECT_ROOT}"

source "${SCRIPT_DIR}/config.env"
export API_BASE API_USER API_PASSWORD API_PASSWORD_FALLBACK ESP_ID SERIAL_DEV BAUD ACTUATOR_GPIO CONTAINERS LOKI_URL
export SERVER_CONTAINER BROKER_CONTAINER LOKI_CONTAINER

usage() {
  cat <<EOF
Usage:
  $0 --dry-run-checks
  $0 <stage> [runs]
EOF
}

cleanup_pids() {
  local run_dir="$1"
  if [[ -d "${run_dir}" ]]; then
    while IFS= read -r pidfile; do
      if [[ -f "${pidfile}" ]]; then
        pid="$(cat "${pidfile}" 2>/dev/null || true)"
        if [[ -n "${pid}" ]]; then
          kill "${pid}" 2>/dev/null || true
        fi
        rm -f "${pidfile}"
      fi
    done < <(ls "${run_dir}"/*.pid 2>/dev/null || true)
  fi
}

validate_serial_ts() {
  local file="$1"
  if [[ ! -f "${file}" ]]; then
    return 1
  fi
  awk '
    /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]\.[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][+-][0-9][0-9]:[0-9][0-9] / {ok=1; exit}
    END{exit(ok?0:1)}
  ' "${file}"
}

latest_old_run_dir() {
  python3 - "${DISCONNECT_ROOT}" <<'PY'
import os
import sys
from pathlib import Path
root = Path(sys.argv[1])
cands = []
for d in root.iterdir():
    if d.is_dir() and (d / "esp32_serial.log").exists():
        cands.append(d)
cands.sort(key=lambda p: p.name, reverse=True)
print(cands[0] if cands else "")
PY
}

run_dry_checks() {
  local ts run_dir serial_file docker_container first_container loki_out old_dir
  ts="$(date +%Y%m%d_%H%M%S)"
  run_dir="${DISCONNECT_ROOT}/dryrun_${ts}"
  mkdir -p "${run_dir}"
  echo "=== Dry-Run Checks | $(date -Ins) | Dir: ${run_dir} ==="

  local pass=0 total=5

  # 1) Serial capture 30s
  serial_file="${run_dir}/dry_serial.log"
  "${SCRIPT_DIR}/capture_serial.sh" "${serial_file}" "${SERIAL_DEV}" "${BAUD}"
  sleep 30
  cleanup_pids "${run_dir}"
  if validate_serial_ts "${serial_file}"; then
    echo "[PASS] serial_capture_timestamp"
    pass=$((pass + 1))
  else
    echo "[FAIL] serial_capture_timestamp"
  fi

  # 2) Docker capture 30s
  first_container="$(awk '{print $1}' <<<"${CONTAINERS}")"
  "${SCRIPT_DIR}/capture_docker.sh" "${run_dir}" ${CONTAINERS}
  sleep 30
  cleanup_pids "${run_dir}"
  if [[ -f "${run_dir}/${first_container}.log" ]] && [[ -s "${run_dir}/${first_container}.log" ]]; then
    echo "[PASS] docker_capture_logs"
    pass=$((pass + 1))
  else
    echo "[FAIL] docker_capture_logs"
  fi

  # 3) Loki query last 5 minutes
  loki_out="${run_dir}/dry_loki.log"
  start_iso="$(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%S.%NZ)"
  end_iso="$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)"
  if "${SCRIPT_DIR}/query_loki.sh" "${start_iso}" "${end_iso}" '{job=~".*autoone.*"} |= "MQTT_EVENT_DISCONNECTED"' "${loki_out}" 2>/dev/null; then
    echo "[PASS] loki_query_response"
    pass=$((pass + 1))
  else
    echo "[FAIL] loki_query_response"
  fi

  # 4) Load stage 1 once
  if "${SCRIPT_DIR}/load_stage.sh" "1" "${API_BASE}" "${ESP_ID}"; then
    echo "[PASS] load_stage_http"
    pass=$((pass + 1))
  else
    echo "[FAIL] load_stage_http"
  fi

  # 5) Analyze on old run directory
  old_dir="$(latest_old_run_dir)"
  if [[ -n "${old_dir}" ]] && "${SCRIPT_DIR}/analyze_run.sh" "${old_dir}" >/dev/null; then
    echo "[PASS] analyze_old_run"
    pass=$((pass + 1))
  else
    echo "[FAIL] analyze_old_run"
  fi

  echo "Dry-Run Result: ${pass}/${total} PASS"
  if (( pass != total )); then
    echo "Dry-run gate failed." >&2
    return 1
  fi
}

query_required_loki_set() {
  local run_start="$1"
  local run_end="$2"
  local run_dir="$3"
  local run_no="$4"
  local q label

  for q in \
    '{job=~".*autoone.*"} |= "err_4062"' \
    '{job=~".*autoone.*"} |= "MQTT_EVENT_DISCONNECTED"' \
    '{job=~".*autoone.*"} |= "write_timeout"' \
    '{job=~".*autoone.*"} |= "tls_timeout"' \
    '{job=~".*autoone.*"} |= "inbound_inbox_evict"' \
    '{job=~".*autoone.*"} |= "config_push_coalesce"'
  do
    label="$(awk -F'"' '{print $4}' <<<"${q}")"
    "${SCRIPT_DIR}/query_loki.sh" "${run_start}" "${run_end}" "${q}" \
      "${run_dir}/loki_${label}_run${run_no}.log" || true
  done
}

extract_metrics_from_summary() {
  local summary="$1"
  awk -F': ' '
    /mqtt_disconnected:/ {md=$2}
    /write_timeout_classified:/ {wt=$2}
    /err_4062:/ {e=$2}
    /tls_timeout:/ {tt=$2}
    END {printf "%s,%s,%s,%s", md+0, wt+0, e+0, tt+0}
  ' "${summary}"
}

first_loki_error_iso() {
  local run_dir="$1"
  python3 - "${run_dir}" <<'PY'
import os
import re
import sys
from datetime import datetime, timezone

run_dir = sys.argv[1]
files = [f for f in os.listdir(run_dir) if f.startswith("loki_") and f.endswith(".log")]
best = None
for fn in files:
    path = os.path.join(run_dir, fn)
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            m = re.match(r"^(\d{10,})\s", line)
            if not m:
                continue
            ns = int(m.group(1))
            if best is None or ns < best:
                best = ns
            break
if best is None:
    print("none")
else:
    sec = best / 1_000_000_000
    dt = datetime.fromtimestamp(sec, tz=timezone.utc).astimezone()
    print(dt.isoformat())
PY
}

first_serial_error_iso() {
  local serial_log="$1"
  if [[ ! -f "${serial_log}" ]]; then
    echo "none"
    return 0
  fi
  awk '
    /MQTT_EVENT_DISCONNECTED|write_timeout|tls_timeout|Publish queue full/ {
      print $1
      exit
    }
  ' "${serial_log}"
}

write_stage_report() {
  local stage="$1"
  local stage_dir="$2"
  local runs="$3"
  local out="${stage_dir}/STAGE_REPORT.md"
  local no_go=0

  {
    echo "# Stage Report ${stage}"
    echo "Generated: $(date -Ins)"
    echo
    echo "Stufe: ${stage}"
    for run_no in $(seq 1 "${runs}"); do
      summary="${stage_dir}/run${run_no}/SUMMARY.md"
      if [[ -f "${summary}" ]]; then
        metrics="$(extract_metrics_from_summary "${summary}")"
        IFS=',' read -r md wt e tt <<<"${metrics}"
      else
        md=0; wt=0; e=0; tt=0
      fi
      if (( md > 0 || wt > 0 || e > 0 || tt > 0 )); then
        no_go=1
      fi
      echo "Run ${run_no}: disconnected=${md}, write_timeout=${wt}, err_4062=${e}, tls_timeout=${tt}"
    done
    if (( no_go == 1 )); then
      echo "Gate: No-Go"
    else
      echo "Gate: Go"
    fi
    echo
    loki_ts="$(first_loki_error_iso "${stage_dir}")"
    serial_ts="$(first_serial_error_iso "${stage_dir}/run1/esp32_serial.log")"
    echo "Loki-Korrelation: ${loki_ts} vs ${serial_ts}"
    if [[ "${loki_ts}" != "none" && "${serial_ts}" != "none" ]]; then
      echo
      echo "No-Go Analyse-Hinweis: Falls Loki früher als Serial liegt, deutet das auf Server-first hin; sonst eher Firmware-first."
    fi
  } > "${out}"

  cat "${out}"
}

run_stage() {
  local stage="$1"
  local runs="$2"
  local stage_ts stage_dir
  stage_ts="$(date +%Y%m%d_%H%M%S)"
  stage_dir="${DISCONNECT_ROOT}/stage_${stage}_${stage_ts}"
  mkdir -p "${stage_dir}"

  echo "=== Stage ${stage} | $(date -Ins) | Dir: ${stage_dir} ==="

  trap 'cleanup_pids "${stage_dir}"' EXIT
  "${SCRIPT_DIR}/capture_serial.sh" "${stage_dir}/esp32_serial.log" "${SERIAL_DEV}" "${BAUD}"
  "${SCRIPT_DIR}/capture_docker.sh" "${stage_dir}" ${CONTAINERS}
  sleep 5

  for run_no in $(seq 1 "${runs}"); do
    run_sub="${stage_dir}/run${run_no}"
    mkdir -p "${run_sub}"
    echo "--- Run ${run_no}/${runs} start ---"
    run_start="$(date -Ins)"
    "${SCRIPT_DIR}/load_stage.sh" "${stage}" "${API_BASE}" "${ESP_ID}" | tee "${run_sub}/load_stage.log"
    sleep 120
    run_end="$(date -Ins)"
    echo "--- Run ${run_no}/${runs} end ---"

    # Stage-weite Serial/Docker-Sicht plus Run-Kopie für Analyse
    cp "${stage_dir}/esp32_serial.log" "${run_sub}/esp32_serial.log"
    for c in ${CONTAINERS}; do
      if [[ -f "${stage_dir}/${c}.log" ]]; then
        cp "${stage_dir}/${c}.log" "${run_sub}/${c}.log"
      fi
    done

    query_required_loki_set "${run_start}" "${run_end}" "${run_sub}" "${run_no}"
    "${SCRIPT_DIR}/analyze_run.sh" "${run_sub}" >/dev/null
    sleep 10
  done

  cleanup_pids "${stage_dir}"
  trap - EXIT
  write_stage_report "${stage}" "${stage_dir}" "${runs}"
}

run_full_protocol() {
  echo "=== Gate-0 Idle 60s | $(date -Ins) ==="
  gate_ts="$(date +%Y%m%d_%H%M%S)"
  gate_dir="${DISCONNECT_ROOT}/gate0_${gate_ts}"
  mkdir -p "${gate_dir}"
  trap 'cleanup_pids "${gate_dir}"' EXIT
  "${SCRIPT_DIR}/capture_serial.sh" "${gate_dir}/esp32_serial.log" "${SERIAL_DEV}" "${BAUD}"
  "${SCRIPT_DIR}/capture_docker.sh" "${gate_dir}" ${CONTAINERS}
  sleep 60
  cleanup_pids "${gate_dir}"
  trap - EXIT
  "${SCRIPT_DIR}/analyze_run.sh" "${gate_dir}" >/dev/null || true

  run_stage "1" "2"
  run_stage "2a" "2"
  run_stage "2b" "2"
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

if [[ "$1" == "--dry-run-checks" ]]; then
  run_dry_checks
  exit 0
fi

if [[ "$1" == "--full-protocol" ]]; then
  run_full_protocol
  exit 0
fi

STAGE="$1"
RUNS="${2:-2}"
run_stage "${STAGE}" "${RUNS}"
