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


def parse_values(path: Path) -> list[float]:
    values: list[float] = []
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            values.append(float(row["raw_value"]))
    return values


def main() -> int:
    parser = argparse.ArgumentParser(description="S2 calibration repeat and precision analysis")
    parser.add_argument("--input-csv", required=True, help="CSV with column raw_value")
    parser.add_argument("--output-dir", default="tests/ec-sensor-integration/outputs")
    parser.add_argument("--target", type=float, default=1413.0)
    parser.add_argument("--processed", type=float, required=True, help="Measured processed value after calibration")
    args = parser.parse_args()

    input_csv = Path(args.input_csv)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    raw_values = parse_values(input_csv)
    stats = calc_stats(raw_values)
    lower = args.target * 0.95
    upper = args.target * 1.05
    within_range = lower <= args.processed <= upper

    result = {
        "step": "S2",
        "issue": "AUT-433",
        "verified_at_utc": datetime.now(timezone.utc).isoformat(),
        "target_us_cm": args.target,
        "accepted_band": {"lower": lower, "upper": upper},
        "processed_value": args.processed,
        "within_band": within_range,
        "raw_stats": stats.to_dict(),
        "hardware_checkpoints_for_robin": [
            "Check DFR0300 supply voltage and analog output range.",
            "Check probe contact and cable integrity.",
            "Check wiring path to GPIO32 and shared ground.",
        ],
    }

    out_json = output_dir / f"s2-calibration-analysis-{ts}.json"
    out_json.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(str(out_json))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
