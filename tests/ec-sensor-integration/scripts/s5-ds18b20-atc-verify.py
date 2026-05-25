from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from helpers.ec_stats import calc_stats


def load_values(path: Path, column: str) -> list[float]:
    values: list[float] = []
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            values.append(float(row[column]))
    return values


def load_temp_sources(path: Path) -> set[str]:
    sources: set[str] = set()
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            sources.add(row.get("temp_source", "unknown"))
    return sources


def main() -> int:
    parser = argparse.ArgumentParser(description="S5 DS18B20 and ATC verification")
    parser.add_argument("--before-csv", required=True)
    parser.add_argument("--after-csv", required=True)
    parser.add_argument("--output-dir", default="tests/ec-sensor-integration/outputs")
    args = parser.parse_args()

    before_csv = Path(args.before_csv)
    after_csv = Path(args.after_csv)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    before_processed = load_values(before_csv, "processed_value")
    after_processed = load_values(after_csv, "processed_value")
    before_sources = load_temp_sources(before_csv)
    after_sources = load_temp_sources(after_csv)

    result = {
        "step": "S5",
        "issue": "AUT-436",
        "verified_at_utc": datetime.now(timezone.utc).isoformat(),
        "before_temp_sources": sorted(before_sources),
        "after_temp_sources": sorted(after_sources),
        "temp_source_switched": ("default_25" in before_sources) and ("default_25" not in after_sources),
        "before_processed_stats": calc_stats(before_processed).to_dict(),
        "after_processed_stats": calc_stats(after_processed).to_dict(),
        "coefficient_note": "Server uses 0.02; DFRobot reference commonly 0.0185",
    }

    out_json = output_dir / f"s5-atc-verify-{ts}.json"
    out_json.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(str(out_json))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
