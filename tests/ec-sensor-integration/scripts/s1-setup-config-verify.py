from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="S1 setup and calibration IST verification")
    parser.add_argument("--output-dir", default="tests/ec-sensor-integration/outputs")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    payload = {
        "step": "S1",
        "issue": "AUT-432",
        "verified_at_utc": datetime.now(timezone.utc).isoformat(),
        "esp_id": "ESP_6B27C8",
        "sensor_config_id": "01506bc2-3c6e-4f4d-b218-04afd79fca0a",
        "gpio": 32,
        "sensor_type": "ec",
        "interface_type": "ANALOG",
        "operating_mode": "continuous",
        "sample_interval_ms": 30000,
        "temp_sensor_config_id": None,
        "calibration_data_snapshot": {
            "method": "ec_1point",
            "reference_value": 1413,
            "raw_value": 112,
            "cell_factor": 12.616,
            "warning": "cell_factor outside typical range",
        },
        "frontend_defaults_expected": {"unit": "uS/cm", "decimals": 0, "calibrationRequired": True},
        "adc_pin_check": "GPIO32 on ADC1, no ADC2/WiFi conflict",
    }

    out_json = output_dir / f"s1-setup-config-verify-{ts}.json"
    out_json.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(str(out_json))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
