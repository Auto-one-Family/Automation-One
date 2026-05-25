from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime, timezone
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="S6 on-demand verification and concept summary")
    parser.add_argument("--input-csv", required=True, help="CSV with columns success,latency_ms")
    parser.add_argument("--output-dir", default="tests/ec-sensor-integration/outputs")
    args = parser.parse_args()

    input_csv = Path(args.input_csv)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    total = 0
    ok = 0
    latencies: list[int] = []
    with input_csv.open("r", encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            total += 1
            success = str(row.get("success", "")).lower() in {"1", "true", "yes"}
            if success:
                ok += 1
            latency = int(float(row.get("latency_ms", "0")))
            latencies.append(latency)

    failed = max(total - ok, 0)
    success_rate = (ok / total * 100.0) if total else 0.0
    avg_latency = (sum(latencies) / len(latencies)) if latencies else 0.0
    max_latency = max(latencies) if latencies else 0

    result = {
        "step": "S6",
        "issue": "AUT-437",
        "verified_at_utc": datetime.now(timezone.utc).isoformat(),
        "runs_total": total,
        "runs_success": ok,
        "runs_failed": failed,
        "success_rate_percent": success_rate,
        "avg_latency_ms": avg_latency,
        "max_latency_ms": max_latency,
        "future_fix_concept": {
            "measurement_window_seconds": 7,
            "sampling_rate_hz": 1,
            "selection": "best-value via median/outlier rejection",
            "required_transport_fix": "align QoS and add robust ACK correlation",
        },
    }

    out_json = output_dir / f"s6-ondemand-verify-{ts}.json"
    out_json.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(str(out_json))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
