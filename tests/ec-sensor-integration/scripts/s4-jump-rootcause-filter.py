from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="S4 root-cause and median concept generator")
    parser.add_argument("--output-dir", default="tests/ec-sensor-integration/outputs")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    content = f"""# S4 Root Cause Report

- generated_at_utc: {datetime.now(timezone.utc).isoformat()}
- issue: AUT-435

## Verified canonical code locations
- continuous single-sample path: `El Trabajante/src/services/sensor/sensor_manager.cpp` (around lines 1644-1670)
- on-demand median path: `El Trabajante/src/services/sensor/sensor_manager.cpp` (around lines 1563-1600)

## Root cause statement
Continuous EC path uses single-sample `analogRead` and has no smoothing, while on-demand path uses median of 3 samples.

## Canonical fix location
Reuse existing on-demand median function in continuous path. Do not introduce a second median implementation.

## Future concept (no implementation)
- sample window in continuous path: 5-15 reads
- short delay between reads
- publish only median value
- expected result: lower stddev and outlier count with minimal latency increase
"""

    out_md = output_dir / f"s4-rootcause-{ts}.md"
    out_md.write_text(content, encoding="utf-8")
    print(str(out_md))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
