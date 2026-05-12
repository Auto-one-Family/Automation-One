"""S2 — pH Test: 2-Punkt-Kalibrierung simuliert (Rohwert-Injektion).

Linear: AUT-375 (parent: AUT-373)
Layer:  Cross-Layer (Server CalibrationService + DB)
Output: outputs/s2-result-YYYY-MM-DD-HH.json
        outputs/s2-serial-YYYY-MM-DD-HH.log

Run:
    python scripts/s2-calibration-sim.py

Required env vars:
    AO_BASE_URL   http://localhost:8000
    AO_USERNAME   operator email
    AO_PASSWORD   operator password
    AO_ESP_ID     ESP_XXXXXX (real UUID from DB)

Optional:
    AO_SERIAL_PORT   COM3 (default)
    AO_PH_GPIO       32 (default)
    AO_SERIAL_DUR    60 (seconds, default)

ADC value derivation (Haoshi H-101 fallback formula: pH = 7.0 + (-3.5) * (V - 1.5)):
    pH 4.0 → V = (7.0 - 4.0) / 3.5 + 1.5 = 2.357 V → ADC = round(2.357 / 3.3 * 4095) ≈ 2924
    pH 7.0 → V = 1.5 V (equipotential)          → ADC = round(1.5  / 3.3 * 4095) ≈ 1861

These are theoretical values; real slope/offset will differ with actual buffer solutions.
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
from helpers.serial_logger import capture_serial

# ---------------------------------------------------------------------------
# Config (override via env)
# ---------------------------------------------------------------------------
ESP_ID: str = os.environ.get("AO_ESP_ID", "")
PH_GPIO: int = int(os.environ.get("AO_PH_GPIO", "32"))
SERIAL_PORT: str = os.environ.get("AO_SERIAL_PORT", "COM3")
SERIAL_BAUD: int = 115200
SERIAL_DURATION_S: int = int(os.environ.get("AO_SERIAL_DUR", "60"))

# Simulated ADC values — derived from Haoshi H-101 fallback formula (see docstring)
ADC_PH4: float = 2924.0   # pH 4.0 buffer_low
ADC_PH7: float = 1861.0   # pH 7.0 buffer_high
REF_PH4: float = 4.0
REF_PH7: float = 7.0

# Nernst slope plausibility threshold for amplified H-101
# Note: unamplified glass electrode Nernst = 59.16 mV/pH; amplified H-101 ~285 mV/pH.
# The 56.2 mV/pH threshold is a conservative lower bound from AUT-375 spec.
MIN_RESPONSE_MV_PER_PH: float = 56.2

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

def run_s2() -> None:
    if not ESP_ID:
        print("ERROR: AO_ESP_ID env var must be set to the real ESP UUID.")
        sys.exit(1)

    results: list[AssertionResult] = []
    api = ApiClient()
    api.login()
    print(f"[S2] Logged in. ESP_ID={ESP_ID}, pH GPIO={PH_GPIO}")

    # Document simulated ADC derivation in results metadata
    adc_derivation = {
        "formula": "pH = 7.0 + (-3.5) * (V - 1.5)",
        "ph4_voltage_V": round(2.357, 3),
        "ph4_adc": int(ADC_PH4),
        "ph7_voltage_V": 1.5,
        "ph7_adc": int(ADC_PH7),
        "adc_ref_V": 3.3,
        "adc_bits": 12,
        "note": "Theoretical values from H-101 fallback formula. Real calibration uses actual buffer solutions.",
    }

    session_id: Optional[str] = None

    try:
        # -------------------------------------------------------------------
        # Step 1 — Start calibration session → expect status=PENDING
        # -------------------------------------------------------------------
        print("[S2] Step 1: starting calibration session ...")
        session = api.start_calibration_session(
            esp_id=ESP_ID,
            gpio=PH_GPIO,
            sensor_type="ph",
            method="ph_2point",
            expected_points=2,
            calibration_temperature=25.0,
            correlation_id="s2-sim-test",
        )
        session_id = session.get("id")
        status_1 = session.get("status", "").upper()

        if status_1 == "PENDING":
            results.append(_ok(1, "session_start_pending",
                               "status=PENDING",
                               {"session_id": session_id, "status": status_1}))
            print(f"[S2]   Step 1: PASS (session_id={session_id})")
        else:
            results.append(_fail(1, "session_start_pending",
                                 "status=PENDING",
                                 {"session_id": session_id, "status": status_1}))
            print(f"[S2]   Step 1: FAIL — expected PENDING, got {status_1!r}")
            _write_output(results, adc_derivation)
            sys.exit(1)

        # -------------------------------------------------------------------
        # Step 2 — GET session → confirm PENDING
        # -------------------------------------------------------------------
        print("[S2] Step 2: re-reading session to confirm PENDING ...")
        session_get = api.get_calibration_session(session_id)
        status_2 = session_get.get("status", "").upper()

        if status_2 == "PENDING":
            results.append(_ok(2, "session_get_pending",
                               "status=PENDING",
                               {"status": status_2, "points_collected": session_get.get("points_collected")}))
            print("[S2]   Step 2: PASS")
        else:
            results.append(_fail(2, "session_get_pending",
                                 "status=PENDING",
                                 {"status": status_2}))
            print(f"[S2]   Step 2: FAIL — expected PENDING, got {status_2!r}")

        # -------------------------------------------------------------------
        # Step 3 — Add point 1 (buffer_low, pH 4.0, ADC 2924) → COLLECTING
        # -------------------------------------------------------------------
        print(f"[S2] Step 3: adding buffer_low (pH={REF_PH4}, ADC={int(ADC_PH4)}) ...")
        session_p1 = api.add_calibration_point(
            session_id=session_id,
            raw_value=ADC_PH4,
            reference_value=REF_PH4,
            point_role="buffer_low",
            quality="good",
        )
        status_3 = session_p1.get("status", "").upper()
        collected_3 = session_p1.get("points_collected", 0)

        if status_3 == "COLLECTING" and collected_3 == 1:
            results.append(_ok(3, "point1_buffer_low_accepted",
                               "status=COLLECTING, points_collected=1",
                               {"status": status_3, "points_collected": collected_3,
                                "raw": ADC_PH4, "reference": REF_PH4}))
            print("[S2]   Step 3: PASS")
        else:
            results.append(_fail(3, "point1_buffer_low_accepted",
                                 "status=COLLECTING, points_collected=1",
                                 {"status": status_3, "points_collected": collected_3}))
            print(f"[S2]   Step 3: FAIL — status={status_3!r}, points_collected={collected_3}")

        # -------------------------------------------------------------------
        # Step 4 — Add point 2 (buffer_high, pH 7.0, ADC 1861) → points_collected=2
        # -------------------------------------------------------------------
        print(f"[S2] Step 4: adding buffer_high (pH={REF_PH7}, ADC={int(ADC_PH7)}) ...")
        session_p2 = api.add_calibration_point(
            session_id=session_id,
            raw_value=ADC_PH7,
            reference_value=REF_PH7,
            point_role="buffer_high",
            quality="good",
        )
        status_4 = session_p2.get("status", "").upper()
        collected_4 = session_p2.get("points_collected", 0)

        if collected_4 == 2:
            results.append(_ok(4, "point2_buffer_high_accepted",
                               "points_collected=2, no HTTP 409",
                               {"status": status_4, "points_collected": collected_4,
                                "raw": ADC_PH7, "reference": REF_PH7}))
            print(f"[S2]   Step 4: PASS (status={status_4})")
        else:
            results.append(_fail(4, "point2_buffer_high_accepted",
                                 "points_collected=2",
                                 {"status": status_4, "points_collected": collected_4}))
            print(f"[S2]   Step 4: FAIL — points_collected={collected_4}")

        # -------------------------------------------------------------------
        # Step 5 — finalize() → FINALIZING
        # -------------------------------------------------------------------
        print("[S2] Step 5: finalizing session ...")
        session_fin = api.finalize_calibration_session(session_id)
        status_5 = session_fin.get("status", "").upper()

        if status_5 in ("FINALIZING", "APPLIED"):
            results.append(_ok(5, "finalize_ok",
                               "status=FINALIZING (or APPLIED if auto-apply)",
                               {"status": status_5}))
            print(f"[S2]   Step 5: PASS (status={status_5})")
        else:
            results.append(_fail(5, "finalize_ok",
                                 "status=FINALIZING",
                                 {"status": status_5,
                                  "failure_reason": session_fin.get("failure_reason")}))
            print(f"[S2]   Step 5: FAIL — status={status_5!r}, reason={session_fin.get('failure_reason')!r}")
            _write_output(results, adc_derivation)
            sys.exit(1)

        # -------------------------------------------------------------------
        # Step 6 — apply() → APPLIED
        # -------------------------------------------------------------------
        if status_5 == "APPLIED":
            # Some server versions auto-apply on finalize
            session_app = session_fin
            status_6 = "APPLIED"
            results.append(_ok(6, "apply_ok",
                               "status=APPLIED",
                               {"status": status_6, "note": "auto-applied by finalize"}))
            print("[S2]   Step 6: PASS (auto-applied during finalize)")
        else:
            print("[S2] Step 6: applying session ...")
            session_app = api.apply_calibration_session(session_id)
            status_6 = session_app.get("status", "").upper()

            if status_6 == "APPLIED":
                results.append(_ok(6, "apply_ok",
                                   "status=APPLIED",
                                   {"status": status_6}))
                print("[S2]   Step 6: PASS")
            else:
                results.append(_fail(6, "apply_ok",
                                     "status=APPLIED",
                                     {"status": status_6,
                                      "failure_reason": session_app.get("failure_reason")}))
                print(f"[S2]   Step 6: FAIL — status={status_6!r}")
                _write_output(results, adc_derivation)
                sys.exit(1)

        # -------------------------------------------------------------------
        # Step 7 — calibration_result: slope + offset present
        # -------------------------------------------------------------------
        print("[S2] Step 7: checking calibration_result ...")
        cal_result = session_app.get("calibration_result") or {}
        # Server stores slope/offset under cal_result["derived"] for ph_2point/ec methods
        derived = cal_result.get("derived") or {}
        slope = derived.get("slope") if derived else cal_result.get("slope")
        offset = derived.get("offset") if derived else cal_result.get("offset")

        if slope is not None and offset is not None:
            results.append(_ok(7, "calibration_result_present",
                               "slope and offset in calibration_result",
                               {"slope": slope, "offset": offset,
                                "slope_deviation_pct": derived.get("slope_deviation_pct"),
                                "measured_response_mv_per_ph": derived.get("measured_response_mv_per_ph"),
                                "full_result": cal_result}))
            print(f"[S2]   Step 7: PASS (slope={slope}, offset={offset})")
        else:
            results.append(_fail(7, "calibration_result_present",
                                 "slope and offset in calibration_result",
                                 {"calibration_result": cal_result}))
            print(f"[S2]   Step 7: FAIL — calibration_result missing slope/offset: {cal_result!r}")

        # -------------------------------------------------------------------
        # Step 8 — Slope plausibility (>= 56.2 mV/pH per AUT-375 spec)
        # -------------------------------------------------------------------
        print("[S2] Step 8: slope plausibility check ...")
        if slope is not None and slope != 0:
            # Use server-computed measured_response if available, else calculate from slope
            server_mv_per_ph = derived.get("measured_response_mv_per_ph")
            measured_mv_per_ph = float(server_mv_per_ph) if server_mv_per_ph else 1000.0 / abs(float(slope))
            slope_dev_pct = derived.get("slope_deviation_pct")
            plausible = measured_mv_per_ph >= MIN_RESPONSE_MV_PER_PH

            actual_slope_info = {
                "slope_pH_per_V": slope,
                "measured_response_mV_per_pH": round(measured_mv_per_ph, 2),
                "min_expected_mV_per_pH": MIN_RESPONSE_MV_PER_PH,
                "slope_deviation_pct": slope_dev_pct,
                "note": (
                    "Amplified H-101 typical response ~285 mV/pH. "
                    "56.2 mV/pH is conservative lower bound (AUT-375 spec)."
                ),
            }
            if plausible:
                results.append(_ok(8, "slope_plausibility",
                                   f"measured_response >= {MIN_RESPONSE_MV_PER_PH} mV/pH",
                                   actual_slope_info))
                print(f"[S2]   Step 8: PASS ({measured_mv_per_ph:.2f} mV/pH >= {MIN_RESPONSE_MV_PER_PH})")
            else:
                results.append(_warn(8, "slope_plausibility",
                                     f"measured_response >= {MIN_RESPONSE_MV_PER_PH} mV/pH",
                                     actual_slope_info,
                                     note=f"Slope {measured_mv_per_ph:.2f} mV/pH is below threshold. "
                                          f"Server may have flagged a deviation warning."))
                print(f"[S2]   Step 8: WARNING — {measured_mv_per_ph:.2f} mV/pH < {MIN_RESPONSE_MV_PER_PH}")
        else:
            results.append(_warn(8, "slope_plausibility",
                                 f"measured_response >= {MIN_RESPONSE_MV_PER_PH} mV/pH",
                                 {"slope": slope},
                                 note="Slope is None or zero — cannot compute mV/pH. Check step 7."))
            print("[S2]   Step 8: WARNING — slope unavailable, skipping plausibility check")

    except Exception as exc:  # noqa: BLE001
        # Cleanup: reject session if it was started but not applied
        if session_id:
            try:
                api.reject_calibration_session(session_id, reason=f"Script error cleanup: {exc}")
                print(f"[S2] Session {session_id} rejected (cleanup after error).")
            except Exception:  # noqa: BLE001
                pass
        results.append(_fail(0, "unexpected_error",
                             "no exception",
                             {"error": str(exc)}))
        print(f"[S2] UNEXPECTED ERROR: {exc}")
        _write_output(results, adc_derivation)
        raise

    # -----------------------------------------------------------------------
    # Step 9 — Serial capture + on-demand measure trigger (soft assertion)
    # -----------------------------------------------------------------------
    serial_log_path = OUTPUT_DIR / f"s2-serial-{RUN_TS}.log"
    print(f"[S2] Step 9: triggering on-demand measure + capturing serial ({SERIAL_DURATION_S}s) ...")

    measure_resp: Optional[dict[str, Any]] = None
    try:
        measure_resp = api.trigger_measure(ESP_ID, PH_GPIO)
        measure_ok = measure_resp.get("success", False)
        print(f"[S2]   Measure triggered: {measure_resp}")
    except Exception as exc:  # noqa: BLE001
        measure_ok = False
        print(f"[S2]   Measure trigger failed: {exc}")

    try:
        serial_lines = capture_serial(SERIAL_PORT, SERIAL_BAUD, SERIAL_DURATION_S, serial_log_path)
        print(f"[S2]   Serial captured: {len(serial_lines)} lines -> {serial_log_path}")

        if measure_ok:
            results.append(_warn(9, "ondemand_measure_after_calibration",
                                 "processed_value in 4.0–10.0 pH range (manual verify)",
                                 {
                                     "measure_response": measure_resp,
                                     "serial_lines": len(serial_lines),
                                     "serial_log": str(serial_log_path),
                                 },
                                 note="On-demand measure triggered successfully. "
                                      "Verify processed_value in serial log or S3 script. "
                                      "Simulated ADC values without real buffer will yield arbitrary raw readings."))
        else:
            results.append(_warn(9, "ondemand_measure_after_calibration",
                                 "measure trigger success=True",
                                 {"measure_response": measure_resp, "serial_lines": len(serial_lines)},
                                 note="Measure trigger returned success=False or failed. Check server logs."))
    except Exception as exc:  # noqa: BLE001
        results.append(_warn(9, "ondemand_measure_after_calibration",
                             "serial capture and measure trigger",
                             {"measure_response": measure_resp, "serial_error": str(exc)},
                             note=f"Serial capture failed: {exc}. "
                                  f"Measure trigger {'succeeded' if measure_ok else 'also failed'}."))
        print(f"[S2]   Step 9: WARNING — serial error: {exc}")

    # -----------------------------------------------------------------------
    # Step 10 — History: session appears
    # -----------------------------------------------------------------------
    print("[S2] Step 10: verifying session in calibration history ...")
    try:
        history = api.get_calibration_history(ESP_ID, PH_GPIO)
        history_ids = [s.get("id") for s in history]
        session_in_history = session_id in history_ids

        if session_in_history:
            history_entry = next((s for s in history if s.get("id") == session_id), {})
            results.append(_ok(10, "session_in_history",
                               f"session_id {session_id} appears in history",
                               {
                                   "history_count": len(history),
                                   "session_status": history_entry.get("status"),
                                   "completed_at": history_entry.get("completed_at"),
                               }))
            print(f"[S2]   Step 10: PASS ({len(history)} sessions in history)")
        else:
            results.append(_warn(10, "session_in_history",
                                 f"session_id {session_id} in history",
                                 {"history_count": len(history), "history_ids": history_ids[:5]},
                                 note="Session not found in history. May appear after DB commit propagation."))
            print(f"[S2]   Step 10: WARNING — session not found in {len(history)} history entries")
    except Exception as exc:  # noqa: BLE001
        results.append(_warn(10, "session_in_history",
                             "history endpoint returns session",
                             None,
                             note=f"History endpoint error: {exc}"))
        print(f"[S2]   Step 10: WARNING — history error: {exc}")

    # -----------------------------------------------------------------------
    # Write output
    # -----------------------------------------------------------------------
    _write_output(results, adc_derivation)


def _write_output(
    results: list[AssertionResult],
    adc_derivation: Optional[dict[str, Any]] = None,
) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / f"s2-result-{RUN_TS}.json"

    counts: dict[str, int] = {}
    for r in results:
        counts[r["status"]] = counts.get(r["status"], 0) + 1

    output: dict[str, Any] = {
        "script": "s2-calibration-sim",
        "linear_issue": "AUT-375",
        "run_at": datetime.now(timezone.utc).isoformat(),
        "esp_id": ESP_ID,
        "ph_gpio": PH_GPIO,
        "adc_derivation": adc_derivation or {},
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

    print(f"\n[S2] Output written: {output_path}")
    _print_summary(output["summary"], counts.get("fail", 0) > 0)


def _print_summary(summary: dict[str, int], has_failures: bool) -> None:
    print("\n" + "=" * 60)
    print("S2 SUMMARY")
    print("=" * 60)
    for key, val in summary.items():
        print(f"  {key:<20} {val}")
    print("=" * 60)
    if has_failures:
        print("RESULT: FAIL — see output JSON for details")
        sys.exit(1)
    else:
        print("RESULT: PASS (warnings are non-blocking)")


if __name__ == "__main__":
    # Load .env if present (convenience for local runs)
    try:
        from dotenv import load_dotenv  # type: ignore[import]
        load_dotenv(_ROOT / ".env")
    except ImportError:
        pass

    run_s2()
