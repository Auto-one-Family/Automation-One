"""S1 — pH Test: Frontend-Setup + Temp-Sensor-Verknuepfung verifizieren.

Linear: AUT-374 (parent: AUT-373)
Layer:  Frontend (Vue 3) + Server (sensor_configs API)
Output: outputs/s1-result-YYYY-MM-DD-HH.json
        outputs/s1-serial-YYYY-MM-DD-HH.log

Run:
    python scripts/s1-setup-config-verify.py

Required env vars:
    AO_BASE_URL   http://localhost:8000
    AO_USERNAME   operator email
    AO_PASSWORD   operator password
    AO_ESP_ID     ESP_XXXXXX (real UUID from DB)

Optional:
    AO_SERIAL_PORT   COM3 (default)
    AO_MQTT_BROKER   localhost (default)
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# ---------------------------------------------------------------------------
# Path setup — allow running from any cwd
# ---------------------------------------------------------------------------
_SCRIPTS_DIR = Path(__file__).parent
_ROOT = _SCRIPTS_DIR.parent
sys.path.insert(0, str(_SCRIPTS_DIR))

from helpers.api_client import ApiClient
from helpers.mqtt_monitor import MqttMonitor
from helpers.serial_logger import capture_serial, find_heartbeat_ack

# ---------------------------------------------------------------------------
# Config (override via env)
# ---------------------------------------------------------------------------
ESP_ID: str = os.environ.get("AO_ESP_ID", "")
PH_GPIO: int = 32
TEMP_GPIO: int = 4
SERIAL_PORT: str = os.environ.get("AO_SERIAL_PORT", "COM3")
SERIAL_BAUD: int = 115200
SERIAL_DURATION_S: int = 90
MQTT_BROKER: str = os.environ.get("AO_MQTT_BROKER", "localhost")

TEMPERATURE_SENSOR_TYPES = {"temperature", "ds18b20", "sht31_temp", "sht31", "bme280_temp"}

OUTPUT_DIR = _ROOT / "outputs"
RUN_TS = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H")

# ---------------------------------------------------------------------------
# Result tracking
# ---------------------------------------------------------------------------

AssertionResult = dict[str, Any]


def make_result(
    step: int,
    name: str,
    status: str,
    expected: str,
    actual: Any,
    note: str = "",
) -> AssertionResult:
    r: AssertionResult = {
        "step": step,
        "name": name,
        "status": status,
        "expected": expected,
        "actual": actual,
    }
    if note:
        r["note"] = note
    return r


def _ok(step: int, name: str, expected: str, actual: Any, note: str = "") -> AssertionResult:
    return make_result(step, name, "pass", expected, actual, note)


def _fail(step: int, name: str, expected: str, actual: Any, note: str = "") -> AssertionResult:
    return make_result(step, name, "fail", expected, actual, note)


def _warn(step: int, name: str, expected: str, actual: Any, note: str = "") -> AssertionResult:
    return make_result(step, name, "warning", expected, actual, note)


def _gap(step: int, name: str, expected: str, actual: Any, note: str = "") -> AssertionResult:
    return make_result(step, name, "documented_gap", expected, actual, note)


# ---------------------------------------------------------------------------
# Main test steps
# ---------------------------------------------------------------------------

def run_s1() -> None:
    if not ESP_ID:
        print("ERROR: AO_ESP_ID env var must be set to the real ESP UUID.")
        sys.exit(1)

    results: list[AssertionResult] = []
    api = ApiClient()
    api.login()
    print(f"[S1] Logged in. ESP_ID={ESP_ID}")

    # -----------------------------------------------------------------------
    # Step 1 — pH config pruefen / anlegen
    # -----------------------------------------------------------------------
    print("[S1] Step 1: checking pH config (GPIO 32) ...")
    ph_config: Optional[dict[str, Any]] = api.get_sensor_config(ESP_ID, PH_GPIO)

    if ph_config is None:
        print("[S1]   pH config not found — creating ...")
        ph_config = api.upsert_sensor_config(
            ESP_ID,
            PH_GPIO,
            {
                "sensor_type": "ph",
                "name": "pH Haoshi H-101",
                "operating_mode": "on_demand",
                "enabled": True,
            },
        )

    checks = (
        ph_config.get("sensor_type") == "ph",
        ph_config.get("gpio") == PH_GPIO,
        ph_config.get("operating_mode") == "on_demand",
    )
    if all(checks):
        results.append(_ok(1, "ph_config_exists", "sensor_type=ph, gpio=32, operating_mode=on_demand", {
            "sensor_type": ph_config.get("sensor_type"),
            "gpio": ph_config.get("gpio"),
            "operating_mode": ph_config.get("operating_mode"),
        }))
        print("[S1]   Step 1: PASS")
    else:
        results.append(_fail(1, "ph_config_exists", "sensor_type=ph, gpio=32, operating_mode=on_demand", {
            "sensor_type": ph_config.get("sensor_type"),
            "gpio": ph_config.get("gpio"),
            "operating_mode": ph_config.get("operating_mode"),
        }))
        print("[S1]   Step 1: FAIL — pH config does not match expected values")

    # -----------------------------------------------------------------------
    # Step 2 — DS18B20 config pruefen
    # -----------------------------------------------------------------------
    print("[S1] Step 2: checking DS18B20 config (GPIO 4) ...")
    temp_config: Optional[dict[str, Any]] = api.get_sensor_config(ESP_ID, TEMP_GPIO)

    if temp_config is None:
        results.append(_fail(2, "ds18b20_config_exists", f"sensor_type in {TEMPERATURE_SENSOR_TYPES}, gpio=4", None,
                             note="DS18B20 sensor not found on GPIO 4. Register it first."))
        print("[S1]   Step 2: FAIL — DS18B20 not found on GPIO 4")
        _write_output(results)
        sys.exit(1)

    ds18b20_config_id: str = temp_config["id"]
    sensor_type_ok = temp_config.get("sensor_type") in TEMPERATURE_SENSOR_TYPES

    if sensor_type_ok:
        results.append(_ok(2, "ds18b20_config_exists", f"sensor_type in {TEMPERATURE_SENSOR_TYPES}, gpio=4", {
            "id": ds18b20_config_id,
            "sensor_type": temp_config.get("sensor_type"),
            "gpio": temp_config.get("gpio"),
        }))
        print(f"[S1]   Step 2: PASS (id={ds18b20_config_id})")
    else:
        results.append(_fail(2, "ds18b20_config_exists", f"sensor_type in {TEMPERATURE_SENSOR_TYPES}, gpio=4", {
            "sensor_type": temp_config.get("sensor_type"),
        }))
        print("[S1]   Step 2: FAIL — unexpected sensor_type on GPIO 4")

    # -----------------------------------------------------------------------
    # Step 3 — temp_sensor_config_id setzen
    # -----------------------------------------------------------------------
    print(f"[S1] Step 3: linking temp_sensor_config_id={ds18b20_config_id} ...")

    update_payload: dict[str, Any] = {
        "sensor_type": ph_config.get("sensor_type", "ph"),
        "name": ph_config.get("name", "pH Haoshi H-101"),
        "operating_mode": ph_config.get("operating_mode", "on_demand"),
        "enabled": ph_config.get("enabled", True),
        "temp_sensor_config_id": ds18b20_config_id,
    }
    updated = api.upsert_sensor_config(ESP_ID, PH_GPIO, update_payload)

    if updated.get("temp_sensor_config_id") == ds18b20_config_id:
        results.append(_ok(3, "temp_sensor_config_id_set",
                           f"temp_sensor_config_id={ds18b20_config_id}",
                           {"temp_sensor_config_id": updated.get("temp_sensor_config_id")}))
        print("[S1]   Step 3: PASS")
    else:
        results.append(_fail(3, "temp_sensor_config_id_set",
                             f"temp_sensor_config_id={ds18b20_config_id}",
                             {"temp_sensor_config_id": updated.get("temp_sensor_config_id")}))
        print("[S1]   Step 3: FAIL — response does not contain expected temp_sensor_config_id")

    # -----------------------------------------------------------------------
    # Step 4 — API re-read verification
    # -----------------------------------------------------------------------
    print("[S1] Step 4: re-reading pH config to verify persisted link ...")
    ph_reread = api.get_sensor_config(ESP_ID, PH_GPIO)

    if ph_reread and ph_reread.get("temp_sensor_config_id") == ds18b20_config_id:
        results.append(_ok(4, "temp_sensor_config_id_persisted",
                           f"temp_sensor_config_id={ds18b20_config_id}",
                           {"temp_sensor_config_id": ph_reread.get("temp_sensor_config_id")}))
        print("[S1]   Step 4: PASS")
    else:
        results.append(_fail(4, "temp_sensor_config_id_persisted",
                             f"temp_sensor_config_id={ds18b20_config_id}",
                             {"temp_sensor_config_id": ph_reread.get("temp_sensor_config_id") if ph_reread else None}))
        print("[S1]   Step 4: FAIL — persisted value does not match")

    # -----------------------------------------------------------------------
    # Step 5 — Serial log 90s (soft assertion)
    # -----------------------------------------------------------------------
    serial_log_path = OUTPUT_DIR / f"s1-serial-{RUN_TS}.log"
    print(f"[S1] Step 5: capturing serial log from {SERIAL_PORT} for {SERIAL_DURATION_S}s ...")
    print(f"[S1]   Output: {serial_log_path}")

    try:
        serial_lines = capture_serial(SERIAL_PORT, SERIAL_BAUD, SERIAL_DURATION_S, serial_log_path)
        heartbeat_line = find_heartbeat_ack(serial_lines)
        if heartbeat_line:
            results.append(_ok(5, "serial_heartbeat_ack",
                               "heartbeat or config_push event in serial log",
                               {"line": heartbeat_line}))
            print(f"[S1]   Step 5: PASS — heartbeat found: {heartbeat_line!r}")
        else:
            results.append(_warn(5, "serial_heartbeat_ack",
                                 "heartbeat or config_push event in serial log",
                                 {"lines_captured": len(serial_lines)},
                                 note=f"No heartbeat pattern in {len(serial_lines)} lines. "
                                      "ESP may not have pushed config yet — wait and retry."))
            print(f"[S1]   Step 5: WARNING — no heartbeat in {len(serial_lines)} lines")
    except Exception as exc:  # noqa: BLE001
        results.append(_warn(5, "serial_heartbeat_ack",
                             "heartbeat event in serial log",
                             None,
                             note=f"Serial capture failed: {exc}. "
                                  f"Verify {SERIAL_PORT} is available and not in use."))
        print(f"[S1]   Step 5: WARNING — serial error: {exc}")

    # -----------------------------------------------------------------------
    # Step 6 — pH sensor on_demand status via API (proxy for frontend check)
    # -----------------------------------------------------------------------
    print("[S1] Step 6: verifying on_demand operating_mode via API ...")
    ph_final = api.get_sensor_config(ESP_ID, PH_GPIO)
    mode = ph_final.get("operating_mode") if ph_final else None

    results.append(make_result(
        6, "ph_on_demand_status",
        "info" if mode == "on_demand" else "fail",
        "operating_mode=on_demand",
        {"operating_mode": mode},
        note="Frontend check (pH card shows On-Demand status) must be verified manually.",
    ))
    print(f"[S1]   Step 6: operating_mode={mode!r} (manual frontend check required)")

    # -----------------------------------------------------------------------
    # Step 7 — Gap-Test D4: set temp_sensor_config_id to null
    # -----------------------------------------------------------------------
    print("[S1] Step 7: Gap-Test D4 — setting temp_sensor_config_id=null ...")
    null_payload: dict[str, Any] = {
        "sensor_type": ph_config.get("sensor_type", "ph"),
        "name": ph_config.get("name", "pH Haoshi H-101"),
        "operating_mode": ph_config.get("operating_mode", "on_demand"),
        "enabled": ph_config.get("enabled", True),
        "temp_sensor_config_id": None,
    }
    null_resp = api.upsert_sensor_config(ESP_ID, PH_GPIO, null_payload)

    if null_resp.get("temp_sensor_config_id") is None:
        results.append(_gap(7, "d4_gap_no_atc_badge",
                            "temp_sensor_config_id=null accepted by API, no ATC badge in UI",
                            {"temp_sensor_config_id": null_resp.get("temp_sensor_config_id")},
                            note="UX Gap D4 (AUT-373): SensorCard.vue shows no badge/warning when "
                                 "temp_sensor_config_id=null. 25°C fallback is treated as normal state. "
                                 "This is documented behavior — not a test failure."))
        print("[S1]   Step 7: documented_gap — D4 confirmed, no ATC badge on null config")
    else:
        results.append(_fail(7, "d4_gap_null_set",
                             "temp_sensor_config_id=null",
                             {"temp_sensor_config_id": null_resp.get("temp_sensor_config_id")}))
        print("[S1]   Step 7: FAIL — temp_sensor_config_id was not cleared to null")

    # Restore original link
    print("[S1]   Restoring temp_sensor_config_id link ...")
    api.upsert_sensor_config(ESP_ID, PH_GPIO, {**update_payload, "temp_sensor_config_id": ds18b20_config_id})
    print("[S1]   Link restored.")

    # -----------------------------------------------------------------------
    # Step 8 — CalibrationWizard access path documentation
    # -----------------------------------------------------------------------
    wizard_info = {
        "route": "/calibration",
        "component": "CalibrationView.vue",
        "wizard_component": "CalibrationWizard.vue (embedded in CalibrationView)",
        "requires_auth": "Admin",
        "note": "CalibrationWizard has no own URL path. Access via router navigation to /calibration. "
                "S2 tests calibration exclusively via API. UI wizard remains a manual test step.",
    }
    results.append(make_result(8, "calibration_wizard_access", "info",
                               "wizard accessible via /calibration route", wizard_info))
    print(f"[S1] Step 8: Wizard access documented — route={wizard_info['route']}")

    # -----------------------------------------------------------------------
    # Write output
    # -----------------------------------------------------------------------
    _write_output(results)


def _write_output(results: list[AssertionResult]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / f"s1-result-{RUN_TS}.json"

    counts: dict[str, int] = {}
    for r in results:
        counts[r["status"]] = counts.get(r["status"], 0) + 1

    output = {
        "script": "s1-setup-config-verify",
        "linear_issue": "AUT-374",
        "run_at": datetime.now(timezone.utc).isoformat(),
        "esp_id": ESP_ID,
        "assertions": results,
        "summary": {
            "total": len(results),
            "pass": counts.get("pass", 0),
            "fail": counts.get("fail", 0),
            "documented_gap": counts.get("documented_gap", 0),
            "warning": counts.get("warning", 0),
            "info": counts.get("info", 0),
        },
    }

    with output_path.open("w", encoding="utf-8") as fh:
        json.dump(output, fh, indent=2, ensure_ascii=False, default=str)

    print(f"\n[S1] Output written: {output_path}")
    _print_summary(output["summary"], counts.get("fail", 0) > 0)


def _print_summary(summary: dict[str, int], has_failures: bool) -> None:
    print("\n" + "=" * 60)
    print("S1 SUMMARY")
    print("=" * 60)
    for key, val in summary.items():
        print(f"  {key:<20} {val}")
    print("=" * 60)
    if has_failures:
        print("RESULT: FAIL — see output JSON for details")
        sys.exit(1)
    else:
        print("RESULT: PASS (warnings/gaps are non-blocking)")


if __name__ == "__main__":
    # Load .env if present (convenience for local runs)
    try:
        from dotenv import load_dotenv  # type: ignore[import]
        load_dotenv(_ROOT / ".env")
    except ImportError:
        pass

    run_s1()
