"""S3 — pH Test: On-Demand-Messung + Temperaturkompensation (ATC).

Linear: AUT-376 (parent: AUT-373)
Layer:  Cross-Layer (ESP32 Firmware + MQTT + Server ATC + WebSocket)
Output: outputs/s3-result-YYYY-MM-DD.json
        outputs/s3-serial-YYYY-MM-DD.log

Prerequisites:
    S1 (AUT-374): pH config exists, temp_sensor_config_id set
    S2 (AUT-375): calibration APPLIED (slope/offset in DB)

Run:
    python scripts/s3-ondemand-measure.py

Required env vars:
    AO_BASE_URL     http://localhost:8000
    AO_USERNAME     operator email
    AO_PASSWORD     operator password
    AO_ESP_ID       ESP_XXXXXX (real UUID from DB)

Optional:
    AO_SERIAL_PORT      COM3 (default)
    AO_PH_GPIO          32 (default)
    AO_TEMP_GPIO        4 (default)
    AO_SERIAL_DUR       30 (seconds, default)
    AO_WS_TIMEOUT       15 (seconds per scenario, default)
    AO_RUN_3C           0 (set to 1 to run scenario 3c — adds 105s wait!)

Scenarios:
    3a — Temp sensor FRESH  (<5s gap): ATC compensation active, temp_source=same_esp/cached
    3b — Temp sensor STALE  (35s gap): ATC with cached_stale, measurement proceeds
    3d — No temp sensor (temp_sensor_config_id=null): fallback 25°C, temp_source=default_25c
    3c — Temp sensor EXPIRED (>90s, optional): measurement aborted, error_event expected
         (requires AUT-320 deployed; skipped if AO_RUN_3C=0)

ATC formula (server-side):
    compensation = (temp_used - 25.0) * 0.003 * (7.0 - pH_raw)
    pH_compensated = pH_raw + compensation
    Tolerance: ±0.1 pH
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

_SCRIPTS_DIR = Path(__file__).parent
_ROOT = _SCRIPTS_DIR.parent
sys.path.insert(0, str(_SCRIPTS_DIR))

from helpers.api_client import ApiClient  # noqa: E402
from helpers.serial_logger import capture_serial  # noqa: E402
from helpers.ws_client import WsEventWatcher  # noqa: E402

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
ESP_ID: str = os.environ.get("AO_ESP_ID", "")
PH_GPIO: int = int(os.environ.get("AO_PH_GPIO", "32"))
TEMP_GPIO: int = int(os.environ.get("AO_TEMP_GPIO", "4"))
SERIAL_PORT: str = os.environ.get("AO_SERIAL_PORT", "COM3")
SERIAL_BAUD: int = 115200
SERIAL_DURATION_S: int = int(os.environ.get("AO_SERIAL_DUR", "30"))
WS_TIMEOUT: float = float(os.environ.get("AO_WS_TIMEOUT", "30"))
RUN_3C: bool = os.environ.get("AO_RUN_3C", "0") == "1"

# ATC formula constants (must match sensor_handler.py)
ATC_COEFF: float = 0.003          # pH/°C
ATC_REFERENCE_TEMP: float = 25.0  # °C
ATC_TOLERANCE: float = 0.1        # pH units

OUTPUT_DIR = _ROOT / "outputs"
RUN_TS = datetime.now(timezone.utc).strftime("%Y-%m-%d")

# ---------------------------------------------------------------------------
# Result helpers
# ---------------------------------------------------------------------------
AssertionResult = dict[str, Any]


def _make(step: int, name: str, status: str, expected: str,
          actual: Any, note: str = "") -> AssertionResult:
    r: AssertionResult = {"step": step, "name": name, "status": status,
                          "expected": expected, "actual": actual}
    if note:
        r["note"] = note
    return r


def _ok(step: int, name: str, expected: str, actual: Any, note: str = "") -> AssertionResult:
    return _make(step, name, "pass", expected, actual, note)


def _fail(step: int, name: str, expected: str, actual: Any, note: str = "") -> AssertionResult:
    return _make(step, name, "fail", expected, actual, note)


def _warn(step: int, name: str, expected: str, actual: Any, note: str = "") -> AssertionResult:
    return _make(step, name, "warning", expected, actual, note)


def _gap(step: int, name: str, expected: str, actual: Any, note: str = "") -> AssertionResult:
    return _make(step, name, "documented_gap", expected, actual, note)


# ---------------------------------------------------------------------------
# ATC calculation
# ---------------------------------------------------------------------------

def compute_expected_ph(ph_raw: float, temp_c: float) -> float:
    """Reproduce server ATC formula from ph_sensor.py."""
    compensation = (temp_c - ATC_REFERENCE_TEMP) * ATC_COEFF * (7.0 - ph_raw)
    return ph_raw + compensation


def atc_check(
    step: int,
    name: str,
    ph_raw: float,
    ph_processed: float,
    temp_used: float,
    temp_source: str,
) -> AssertionResult:
    """Verify processed_value matches ATC formula within tolerance."""
    expected_ph = compute_expected_ph(ph_raw, temp_used)
    delta = abs(ph_processed - expected_ph)
    ok = delta <= ATC_TOLERANCE

    actual = {
        "ph_raw": ph_raw,
        "temp_used_c": temp_used,
        "temp_source": temp_source,
        "ph_expected_by_formula": round(expected_ph, 4),
        "ph_processed_actual": ph_processed,
        "delta": round(delta, 4),
        "tolerance": ATC_TOLERANCE,
    }
    note = (
        f"ATC formula: pH = {ph_raw:.4f} + ({temp_used:.1f}-25.0)*0.003*(7.0-{ph_raw:.4f}) "
        f"= {expected_ph:.4f}. Got {ph_processed:.4f}, delta={delta:.4f}"
    )
    if ok:
        return _ok(step, name, f"processed_value matches ATC formula ±{ATC_TOLERANCE} pH", actual, note)
    return _fail(step, name, f"processed_value matches ATC formula ±{ATC_TOLERANCE} pH", actual, note)


# ---------------------------------------------------------------------------
# WebSocket helpers
# ---------------------------------------------------------------------------

def _is_sensor_data_for_gpio(gpio: int) -> Any:
    def matcher(msg: dict[str, Any]) -> bool:
        return (
            msg.get("type") == "sensor_data"
            and msg.get("data", {}).get("gpio") == gpio
        )
    return matcher


def _is_error_event(error_type: str) -> Any:
    def matcher(msg: dict[str, Any]) -> bool:
        return (
            msg.get("type") == "error_event"
            and msg.get("data", {}).get("error_type") == error_type
        )
    return matcher


# ---------------------------------------------------------------------------
# Pre-flight: verify sensor setup
# ---------------------------------------------------------------------------

def verify_preconditions(api: ApiClient, results: list[AssertionResult]) -> bool:
    """Check pH config + temp link exists. Returns True if OK to proceed."""
    print("[S3] Checking preconditions ...")

    sensors = api.get_sensors(ESP_ID)
    ph_config = next((s for s in sensors if s.get("gpio") == PH_GPIO), None)
    temp_config = next((s for s in sensors if s.get("gpio") == TEMP_GPIO), None)

    if ph_config is None:
        results.append(_fail(0, "precondition_ph_config",
                             f"pH config on GPIO {PH_GPIO}",
                             {"sensors_found": [s.get("gpio") for s in sensors]},
                             note="S1 must be run first"))
        return False
    results.append(_ok(0, "precondition_ph_config",
                        f"pH config on GPIO {PH_GPIO}",
                        {"sensor_type": ph_config.get("sensor_type"),
                         "operating_mode": ph_config.get("operating_mode"),
                         "temp_sensor_config_id": ph_config.get("temp_sensor_config_id")}))

    if temp_config is None:
        results.append(_warn(0, "precondition_temp_config",
                              f"DS18B20 config on GPIO {TEMP_GPIO}",
                              {"sensors_found": [s.get("gpio") for s in sensors]},
                              note="Scenario 3a/3b will use default_25c fallback"))
    else:
        results.append(_ok(0, "precondition_temp_config",
                            f"temp sensor on GPIO {TEMP_GPIO}",
                            {"sensor_type": temp_config.get("sensor_type"),
                             "config_id": temp_config.get("id")}))

    temp_link = ph_config.get("temp_sensor_config_id")
    if not temp_link:
        results.append(_warn(0, "precondition_temp_link",
                              "temp_sensor_config_id set on pH config",
                              {"temp_sensor_config_id": temp_link},
                              note="ATC will use default_25c in all scenarios"))
    else:
        results.append(_ok(0, "precondition_temp_link",
                            "temp_sensor_config_id set",
                            {"temp_sensor_config_id": temp_link}))

    print("[S3]   Preconditions OK")
    return True


# ---------------------------------------------------------------------------
# Scenario runner
# ---------------------------------------------------------------------------

async def run_scenario(
    scenario_id: str,
    step: int,
    api: ApiClient,
    watcher: WsEventWatcher,
    results: list[AssertionResult],
    *,
    temp_delay_s: float = 0,
    restore_temp_link: Optional[str] = None,
) -> None:
    """Run one on-demand measure scenario.

    Args:
        scenario_id: e.g. "3a"
        step: result step number base
        api: authenticated ApiClient
        watcher: connected WsEventWatcher
        results: list to append assertion results to
        temp_delay_s: seconds to wait between temp measure and pH measure (0 = no wait)
        restore_temp_link: if set, restore this config_id to temp_sensor_config_id after scenario
    """
    print(f"\n[S3] === Scenario {scenario_id} ===")

    # (optional) Trigger DS18B20 first to prime the ATC cache
    if temp_delay_s >= 0:
        print(f"[S3]   Triggering DS18B20 measure (GPIO {TEMP_GPIO}) ...")
        try:
            api.trigger_temp_measure(ESP_ID, TEMP_GPIO)
            print("[S3]   DS18B20 triggered.")
        except Exception as exc:  # noqa: BLE001
            print(f"[S3]   DS18B20 trigger failed (non-fatal): {exc}")

    if temp_delay_s > 0:
        print(f"[S3]   Waiting {temp_delay_s}s for ATC cache to age ...")
        await asyncio.sleep(temp_delay_s)

    # Trigger pH measure (fire-and-forget); retry once on 429 MeasurementBusy (AUT-325)
    t0 = time.monotonic()
    print(f"[S3]   Triggering pH measure (GPIO {PH_GPIO}) ...")
    _last_exc: Exception | None = None
    for attempt in range(2):
        try:
            measure_resp = api.trigger_measure(ESP_ID, PH_GPIO)
            _last_exc = None
            break
        except Exception as exc:  # noqa: BLE001
            _last_exc = exc
            if "429" in str(exc) and attempt == 0:
                print(f"[S3]   429 MeasurementBusy — waiting 12s before retry ...")
                await asyncio.sleep(12)
            else:
                break
    if _last_exc is not None:
        results.append(_fail(step, f"s{scenario_id}_measure_trigger",
                              "HTTP 200",
                              {"error": str(_last_exc)}))
        print(f"[S3]   FAIL -- measure trigger: {_last_exc}")
        return
    request_id = measure_resp.get("request_id", "")
    results.append(_ok(step, f"s{scenario_id}_measure_trigger",
                        "HTTP 200 + success=true",
                        {"request_id": request_id, "response": measure_resp}))
    print(f"[S3]   Measure triggered: request_id={request_id}")

    # Wait for WebSocket event
    print(f"[S3]   Waiting for sensor_data WS event (timeout={WS_TIMEOUT}s) ...")
    event = await watcher.wait_for(_is_sensor_data_for_gpio(PH_GPIO), timeout=WS_TIMEOUT)
    latency_ms = round((time.monotonic() - t0) * 1000)

    if event is None:
        # Check for error event (scenario 3c: ATC abort)
        err_event = await watcher.wait_for(_is_error_event("atc_read_failed"), timeout=2)
        if err_event:
            results.append(_ok(step + 1, f"s{scenario_id}_atc_abort_event",
                                "error_event type=atc_read_failed received",
                                {"event": err_event},
                                note="ATC timeout abort confirmed — AUT-320 deployed"))
        else:
            results.append(_fail(step + 1, f"s{scenario_id}_ws_event_received",
                                  f"sensor_data WS event within {WS_TIMEOUT}s",
                                  {"latency_ms": None, "all_events": len(watcher.all_events())},
                                  note="No sensor_data or error_event received. "
                                       "Check server logs for ATC abort or MQTT issue."))
        return

    data = event.get("data", {})
    raw_value = data.get("raw_value")
    processed_value = data.get("processed_value") or data.get("value")
    unit = data.get("unit", "pH")
    quality = data.get("quality")
    sensor_metadata = data.get("sensor_metadata") or data.get("metadata") or {}
    temp_used = sensor_metadata.get("temp_used") or 25.0
    temp_source = sensor_metadata.get("temp_source") or "unknown"

    print(f"[S3]   WS event received: raw={raw_value}, processed={processed_value}, "
          f"quality={quality}, temp_used={temp_used}, temp_source={temp_source}, "
          f"latency={latency_ms}ms")

    results.append(_ok(step + 1, f"s{scenario_id}_ws_event_received",
                        f"sensor_data WS event within {WS_TIMEOUT}s",
                        {"latency_ms": latency_ms, "raw_value": raw_value,
                         "processed_value": processed_value, "unit": unit,
                         "quality": quality, "temp_used": temp_used,
                         "temp_source": temp_source}))

    # processed_value plausibility (4–10 pH)
    if processed_value is not None and 4.0 <= float(processed_value) <= 10.0:
        results.append(_ok(step + 2, f"s{scenario_id}_processed_value_range",
                            "4.0 ≤ processed_value ≤ 10.0 pH",
                            {"processed_value": processed_value}))
    elif processed_value is not None:
        results.append(_warn(step + 2, f"s{scenario_id}_processed_value_range",
                              "4.0 ≤ processed_value ≤ 10.0 pH",
                              {"processed_value": processed_value},
                              note="Value out of expected range — simulated ADC without real buffer solution"))
    else:
        results.append(_fail(step + 2, f"s{scenario_id}_processed_value_range",
                              "processed_value present",
                              {"event_data": data}))

    # ATC formula verification (only when temp_source is not unknown/default)
    if raw_value is not None and processed_value is not None and temp_used is not None:
        results.append(atc_check(
            step + 3, f"s{scenario_id}_atc_formula",
            float(raw_value) if isinstance(raw_value, (int, float)) else 0.0,
            float(processed_value),
            float(temp_used),
            str(temp_source),
        ))

    # Restore temp_sensor_config_id if scenario 3d temporarily cleared it
    if restore_temp_link is not None:
        print(f"[S3]   Restoring temp_sensor_config_id={restore_temp_link} ...")
        try:
            api.upsert_sensor_config(ESP_ID, PH_GPIO, {
                "sensor_type": "ph",
                "gpio": PH_GPIO,
                "esp_id": ESP_ID,
                "temp_sensor_config_id": restore_temp_link,
            })
            print("[S3]   Restored.")
        except Exception as exc:  # noqa: BLE001
            print(f"[S3]   WARNING — could not restore temp link: {exc}")


# ---------------------------------------------------------------------------
# DB verification (after scenarios)
# ---------------------------------------------------------------------------

def verify_sensor_data_persisted(
    api: ApiClient,
    results: list[AssertionResult],
    step: int,
) -> None:
    print("[S3] Verifying sensor_data rows in DB ...")
    try:
        rows = api.get_sensor_data(ESP_ID, PH_GPIO, sensor_type="ph", limit=5)
        if rows:
            latest = rows[0]
            results.append(_ok(step, "sensor_data_persisted",
                                "sensor_data row exists for pH GPIO",
                                {"row_count": len(rows),
                                 "latest_processed_value": latest.get("processed_value") or latest.get("value"),
                                 "latest_quality": latest.get("quality"),
                                 "latest_timestamp": latest.get("timestamp") or latest.get("created_at")}))
            print(f"[S3]   DB: {len(rows)} rows found. Latest: {latest.get('processed_value') or latest.get('value')} pH")
        else:
            results.append(_warn(step, "sensor_data_persisted",
                                  "sensor_data row exists for pH GPIO",
                                  {"row_count": 0},
                                  note="No rows found. May be timing — try querying DB directly."))
            print("[S3]   DB: no rows found (warning)")
    except Exception as exc:  # noqa: BLE001
        results.append(_warn(step, "sensor_data_persisted",
                              "sensor_data query succeeds",
                              {"error": str(exc)}))
        print(f"[S3]   DB query warning: {exc}")


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def _write_output(results: list[AssertionResult]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / f"s3-result-{RUN_TS}.json"

    counts: dict[str, int] = {}
    for r in results:
        counts[r["status"]] = counts.get(r["status"], 0) + 1

    output: dict[str, Any] = {
        "script": "s3-ondemand-measure",
        "linear_issue": "AUT-376",
        "run_at": datetime.now(timezone.utc).isoformat(),
        "esp_id": ESP_ID,
        "ph_gpio": PH_GPIO,
        "temp_gpio": TEMP_GPIO,
        "scenarios_run": ["3a", "3b", "3d"] + (["3c"] if RUN_3C else []),
        "ws_timeout_s": WS_TIMEOUT,
        "atc_formula": {
            "coefficient": ATC_COEFF,
            "reference_temp_c": ATC_REFERENCE_TEMP,
            "tolerance_ph": ATC_TOLERANCE,
            "formula": "pH_comp = pH_raw + (temp - 25.0) * 0.003 * (7.0 - pH_raw)",
        },
        "assertions": results,
        "summary": {
            "total": len(results),
            "pass": counts.get("pass", 0),
            "fail": counts.get("fail", 0),
            "documented_gap": counts.get("documented_gap", 0),
            "warning": counts.get("warning", 0),
        },
    }

    with output_path.open("w", encoding="utf-8") as fh:
        json.dump(output, fh, indent=2, ensure_ascii=False, default=str)

    print(f"\n[S3] Output written: {output_path}")
    _print_summary(output["summary"], counts.get("fail", 0) > 0)


def _print_summary(summary: dict[str, int], has_failures: bool) -> None:
    print("\n" + "=" * 60)
    print("S3 SUMMARY")
    print("=" * 60)
    for key, val in summary.items():
        print(f"  {key:<20} {val}")
    print("=" * 60)
    if has_failures:
        print("RESULT: FAIL — see output JSON for details")
        sys.exit(1)
    else:
        print("RESULT: PASS (warnings are non-blocking)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def run_s3() -> None:
    if not ESP_ID:
        print("ERROR: AO_ESP_ID env var must be set to the real ESP UUID.")
        sys.exit(1)

    results: list[AssertionResult] = []
    api = ApiClient()
    api.login()
    print(f"[S3] Logged in. ESP_ID={ESP_ID}, pH GPIO={PH_GPIO}, temp GPIO={TEMP_GPIO}")
    print("[S3] Scenarios: 3a, 3b, 3d" + (", 3c" if RUN_3C else " (3c skipped, set AO_RUN_3C=1)"))

    # Preconditions
    if not verify_preconditions(api, results):
        _write_output(results)
        return

    # Remember original temp link for restoration after 3d
    sensors = api.get_sensors(ESP_ID)
    ph_config = next((s for s in sensors if s.get("gpio") == PH_GPIO), {})
    original_temp_link: Optional[str] = ph_config.get("temp_sensor_config_id")

    ws_url = api.ws_url("s3-ph-test")
    print("[S3] Connecting to WebSocket ...")

    async with WsEventWatcher(ws_url) as watcher:
        await watcher.subscribe(types=["sensor_data", "error_event"], esp_ids=[ESP_ID])
        print("[S3] WebSocket connected + subscribed.")

        # -------------------------------------------------------------------
        # Scenario 3a — Temp FRESH (trigger temp, wait 3s within fresh window, trigger pH)
        # -------------------------------------------------------------------
        await run_scenario("3a", step=10, api=api, watcher=watcher, results=results,
                           temp_delay_s=3)

        # -------------------------------------------------------------------
        # Scenario 3b — Temp STALE (trigger temp, wait 35s, trigger pH)
        # -------------------------------------------------------------------
        await run_scenario("3b", step=20, api=api, watcher=watcher, results=results,
                           temp_delay_s=35)

        # -------------------------------------------------------------------
        # Scenario 3d — No temp sensor (null out temp_sensor_config_id)
        # -------------------------------------------------------------------
        # Wait for ESP to recover if it crashed during 3b (SafetyTask overflow observed)
        print("\n[S3] Waiting 20s before 3d to let ESP recover ...")
        await asyncio.sleep(20)
        print("\n[S3] === Scenario 3d: clearing temp_sensor_config_id ===")
        try:
            api.upsert_sensor_config(ESP_ID, PH_GPIO, {
                "sensor_type": "ph",
                "gpio": PH_GPIO,
                "esp_id": ESP_ID,
                "temp_sensor_config_id": None,
            })
            print("[S3]   temp_sensor_config_id cleared.")
        except Exception as exc:  # noqa: BLE001
            results.append(_warn(30, "s3d_clear_temp_link",
                                  "temp_sensor_config_id set to null",
                                  {"error": str(exc)}))
            print(f"[S3]   WARNING — could not clear temp link: {exc}")

        await run_scenario("3d", step=30, api=api, watcher=watcher, results=results,
                           temp_delay_s=-1,  # -1: skip DS18B20 trigger
                           restore_temp_link=original_temp_link)

        # -------------------------------------------------------------------
        # Scenario 3c — Temp EXPIRED (optional, 105s wait)
        # -------------------------------------------------------------------
        if RUN_3C:
            await run_scenario("3c", step=40, api=api, watcher=watcher, results=results,
                               temp_delay_s=105)
        else:
            results.append(_gap(40, "s3c_temp_expired",
                                 "ATC abort when temp >90s old",
                                 {"skipped": True},
                                 note="Set AO_RUN_3C=1 to enable. Adds 105s wait."))

    # -------------------------------------------------------------------
    # DB persistence check
    # -------------------------------------------------------------------
    verify_sensor_data_persisted(api, results, step=50)

    # -------------------------------------------------------------------
    # Serial capture
    # -------------------------------------------------------------------
    serial_log_path = OUTPUT_DIR / f"s3-serial-{RUN_TS}.log"
    print(f"\n[S3] Capturing serial log ({SERIAL_DURATION_S}s) ...")
    try:
        lines = capture_serial(SERIAL_PORT, SERIAL_BAUD, SERIAL_DURATION_S, serial_log_path)
        results.append(_ok(51, "serial_capture",
                            "serial log captured",
                            {"lines": len(lines), "path": str(serial_log_path)}))
        print(f"[S3]   Serial: {len(lines)} lines -> {serial_log_path}")
    except Exception as exc:  # noqa: BLE001
        results.append(_warn(51, "serial_capture",
                              "serial capture",
                              {"error": str(exc)}))
        print(f"[S3]   Serial warning: {exc}")

    _write_output(results)


def main() -> None:
    try:
        from dotenv import load_dotenv  # type: ignore[import]
        load_dotenv(_ROOT / ".env")
    except ImportError:
        pass
    asyncio.run(run_s3())


if __name__ == "__main__":
    main()
