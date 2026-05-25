from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from helpers.ec_stats import calc_stats


def load_records(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def main() -> int:
    parser = argparse.ArgumentParser(description="S3 continuous jump quantification")
    parser.add_argument("--input-csv", required=True)
    parser.add_argument("--output-dir", default="tests/ec-sensor-integration/outputs")
    args = parser.parse_args()

    records = load_records(Path(args.input_csv))
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    raw_values = [float(row["raw_value"]) for row in records]
    proc_values = [float(row["processed_value"]) for row in records]
    raw_zero_count = sum(1 for value in raw_values if value == 0.0)
    temp_sources = Counter(row.get("temp_source", "unknown") for row in records)
    processing_modes = Counter(row.get("processing_mode", "unknown") for row in records)

    result = {
        "step": "S3",
        "issue": "AUT-434",
        "verified_at_utc": datetime.now(timezone.utc).isoformat(),
        "record_count": len(records),
        "raw_stats": calc_stats(raw_values).to_dict(),
        "processed_stats": calc_stats(proc_values).to_dict(),
        "raw_zero_count": raw_zero_count,
        "temp_source_counts": dict(temp_sources),
        "processing_mode_counts": dict(processing_modes),
    }

    out_json = output_dir / f"s3-continuous-jumps-{ts}.json"
    out_json.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(str(out_json))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
