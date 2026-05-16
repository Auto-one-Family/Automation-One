#!/usr/bin/env bash
set -euo pipefail

# Usage: ./query_loki.sh <start_iso> <end_iso> <logql_query> <output_file>
if [[ $# -lt 4 ]]; then
  echo "Usage: $0 <start_iso> <end_iso> <logql_query> <output_file>" >&2
  exit 1
fi

LOKI_URL="${LOKI_URL:-http://localhost:3100}"
START="$1"
END="$2"
QUERY="$3"
OUT="$4"

mkdir -p "$(dirname "${OUT}")"
to_ns() {
  local value="$1"
  if [[ "${value}" =~ ^[0-9]{16,}$ ]]; then
    echo "${value}"
    return 0
  fi
  python3 - "${value}" <<'PY'
import sys
from datetime import datetime, timezone

raw = sys.argv[1]
txt = raw.strip()
if txt.endswith("Z"):
    txt = txt[:-1] + "+00:00"
dt = datetime.fromisoformat(txt)
if dt.tzinfo is None:
    dt = dt.replace(tzinfo=timezone.utc)
print(int(dt.timestamp() * 1_000_000_000))
PY
}

START_NS="$(to_ns "${START}")"
END_NS="$(to_ns "${END}")"
TMP_JSON="$(mktemp)"

curl -fsS -G "${LOKI_URL}/loki/api/v1/query_range" \
  --data-urlencode "query=${QUERY}" \
  --data-urlencode "start=${START_NS}" \
  --data-urlencode "end=${END_NS}" \
  --data-urlencode "limit=5000" \
  > "${TMP_JSON}"

python3 - "${TMP_JSON}" "${OUT}" <<'PY'
import json
import sys

src, out = sys.argv[1], sys.argv[2]
with open(src, "r", encoding="utf-8") as f:
    payload = json.load(f)

entries = []
for stream in payload.get("data", {}).get("result", []):
    for item in stream.get("values", []):
        if isinstance(item, list) and len(item) >= 2:
            entries.append(f"{item[0]} {item[1]}")

entries.sort()
with open(out, "a", encoding="utf-8") as f:
    for line in entries:
        f.write(line + "\n")
PY

rm -f "${TMP_JSON}"
