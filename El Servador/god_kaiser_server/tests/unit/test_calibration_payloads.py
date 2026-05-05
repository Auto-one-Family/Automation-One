"""Unit tests for canonical calibration payload adapters."""

from src.services.calibration_payloads import (
    build_canonical_calibration_result,
    canonicalize_calibration_data,
    resolve_calibration_for_processor,
)
from src.sensors.sensor_libraries.active.moisture import MoistureSensorProcessor


def test_canonicalize_calibration_data_accepts_none_for_legacy_nulls():
    assert canonicalize_calibration_data(None) is None


def test_canonicalize_calibration_data_preserves_canonical_shape():
    payload = {
        "method": "linear_2point",
        "points": [{"point_role": "dry", "raw": 900.0, "reference": 0.0}],
        "derived": {"slope": 0.5, "offset": -10.0},
        "metadata": {"schema_version": 1, "source": "test"},
    }
    normalized = canonicalize_calibration_data(payload)
    assert normalized is not None
    assert normalized["method"] == "linear_2point"
    assert normalized["points"][0]["point_role"] == "dry"
    assert normalized["derived"]["slope"] == 0.5
    assert normalized["metadata"]["schema_version"] == 1


def test_canonicalize_calibration_data_maps_legacy_object_to_derived():
    legacy = {"type": "linear_2point", "slope": 0.2, "offset": 1.0}
    normalized = canonicalize_calibration_data(legacy, source="legacy_db_row")
    assert normalized is not None
    assert normalized["method"] == "linear_2point"
    assert normalized["points"] == []
    assert normalized["derived"]["slope"] == 0.2
    assert normalized["metadata"]["source"] == "legacy_db_row"


def test_build_canonical_calibration_result_produces_strict_write_shape():
    payload = build_canonical_calibration_result(
        method="linear_2point",
        points=[{"point_role": "dry", "raw": 800.0, "reference": 0.0}],
        derived={"slope": 0.6, "offset": -5.0},
        source="unit-test",
    )
    assert set(payload.keys()) == {"method", "points", "derived", "metadata"}
    assert payload["metadata"]["schema_version"] == 1
    assert payload["metadata"]["source"] == "unit-test"


def test_resolve_calibration_for_processor_unwraps_derived():
    canonical = {
        "method": "moisture_2point",
        "points": [],
        "derived": {"type": "moisture_2point", "dry_value": 3100.0, "wet_value": 1600.0},
        "metadata": {"schema_version": 1},
    }
    flat = resolve_calibration_for_processor(canonical)
    assert flat == {"type": "moisture_2point", "dry_value": 3100.0, "wet_value": 1600.0}


def test_resolve_calibration_for_processor_returns_none_for_empty_canonical_derived():
    canonical = {
        "method": "moisture_2point",
        "points": [],
        "derived": {},
        "metadata": {},
    }
    assert resolve_calibration_for_processor(canonical) is None


def test_resolve_calibration_for_processor_passes_through_flat_legacy():
    legacy = {"dry_value": 3000.0, "wet_value": 1400.0}
    assert resolve_calibration_for_processor(legacy) == legacy


def test_moisture_processor_uses_canonical_calibration_via_resolver():
    """Regression: Pi-Enhanced must see dry/wet inside ``derived`` after session apply."""
    canonical = build_canonical_calibration_result(
        method="moisture_2point",
        points=[{"raw": 3100.0, "reference": 0.0}, {"raw": 1600.0, "reference": 100.0}],
        derived={
            "type": "moisture_2point",
            "dry_value": 3100.0,
            "wet_value": 1600.0,
        },
        source="test",
    )
    proc_cal = resolve_calibration_for_processor(canonical)
    result = MoistureSensorProcessor().process(raw_value=3100.0, calibration=proc_cal)
    assert result.metadata.get("calibrated") is True
    assert result.value == 0.0
