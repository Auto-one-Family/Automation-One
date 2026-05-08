"""Unit tests for calibration service session flow and guards."""

import pytest
from sqlalchemy import select

from src.db.models.esp import ESPDevice
from src.db.models.sensor import SensorConfig
from src.services.calibration_payloads import resolve_calibration_for_processor
from src.services.calibration_service import CalibrationError, CalibrationService


async def _create_bound_sensor(
    db_session,
    *,
    esp_id: str,
    gpio: int,
    sensor_type: str = "moisture",
) -> None:
    esp = ESPDevice(device_id=esp_id, hardware_type="ESP32_WROOM", status="online")
    db_session.add(esp)
    await db_session.flush()
    sensor = SensorConfig(
        esp_id=esp.id,
        gpio=gpio,
        sensor_type=sensor_type,
        sensor_name=f"{sensor_type}-sensor-{gpio}",
        enabled=True,
    )
    db_session.add(sensor)
    await db_session.flush()


@pytest.mark.asyncio
async def test_calibration_service_add_finalize_apply_flow(db_session):
    await _create_bound_sensor(db_session, esp_id="ESP_TEST_001", gpio=4)
    service = CalibrationService(db_session)
    session = await service.start_session(
        esp_id="ESP_TEST_001",
        gpio=4,
        sensor_type="moisture",
        method="linear_2point",
        expected_points=2,
        initiated_by="tester",
    )

    session = await service.add_point(
        session_id=session.id,
        raw=850.0,
        reference=0.0,
        point_role="dry",
    )
    assert session.points_collected == 1

    session = await service.add_point(
        session_id=session.id,
        raw=620.0,
        reference=100.0,
        point_role="wet",
    )
    assert session.points_collected == 2

    session = await service.finalize(session.id)
    assert session.status.value == "finalizing"
    assert session.calibration_result is not None

    session = await service.apply(session.id)
    assert session.status.value == "applied"


@pytest.mark.asyncio
async def test_moisture_finalize_apply_persists_moisture_2point_derived(db_session):
    """Nach apply muss calibration_data derived moisture_2point + dry/wet fuer Processor aufloesbar sein."""
    await _create_bound_sensor(db_session, esp_id="ESP_TEST_001", gpio=4)
    service = CalibrationService(db_session)
    session = await service.start_session(
        esp_id="ESP_TEST_001",
        gpio=4,
        sensor_type="moisture",
        method="linear_2point",
        expected_points=2,
        initiated_by="tester",
    )
    await service.add_point(
        session_id=session.id,
        raw=850.0,
        reference=0.0,
        point_role="dry",
    )
    await service.add_point(
        session_id=session.id,
        raw=620.0,
        reference=100.0,
        point_role="wet",
    )
    await service.finalize(session.id)
    await service.apply(session.id)

    stmt = (
        select(SensorConfig)
        .join(ESPDevice, SensorConfig.esp_id == ESPDevice.id)
        .where(ESPDevice.device_id == "ESP_TEST_001", SensorConfig.gpio == 4)
    )
    result = await db_session.execute(stmt)
    sensor_cfg = result.scalar_one()
    cal = sensor_cfg.calibration_data
    assert isinstance(cal, dict)
    derived = cal.get("derived")
    assert isinstance(derived, dict)
    assert derived.get("type") == "moisture_2point"

    flat = resolve_calibration_for_processor(cal)
    assert flat is not None
    assert flat.get("dry_value") == pytest.approx(850.0)
    assert flat.get("wet_value") == pytest.approx(620.0)


@pytest.mark.asyncio
async def test_moisture_2point_method_finalize_apply_persists_derived(db_session):
    """Explizite Session mit method=moisture_2point — gleiche Persistenz-Assertions (API-Variante)."""
    await _create_bound_sensor(db_session, esp_id="ESP_TEST_001", gpio=20)
    service = CalibrationService(db_session)
    session = await service.start_session(
        esp_id="ESP_TEST_001",
        gpio=20,
        sensor_type="moisture",
        method="moisture_2point",
        expected_points=2,
        initiated_by="tester",
    )
    await service.add_point(
        session_id=session.id,
        raw=800.0,
        reference=0.0,
        point_role="dry",
    )
    await service.add_point(
        session_id=session.id,
        raw=600.0,
        reference=100.0,
        point_role="wet",
    )
    await service.finalize(session.id)
    await service.apply(session.id)

    stmt = (
        select(SensorConfig)
        .join(ESPDevice, SensorConfig.esp_id == ESPDevice.id)
        .where(ESPDevice.device_id == "ESP_TEST_001", SensorConfig.gpio == 20)
    )
    result = await db_session.execute(stmt)
    sensor_cfg = result.scalar_one()
    cal = sensor_cfg.calibration_data
    assert isinstance(cal, dict)
    derived = cal.get("derived")
    assert isinstance(derived, dict)
    assert derived.get("type") == "moisture_2point"
    flat = resolve_calibration_for_processor(cal)
    assert flat is not None
    assert flat.get("dry_value") == pytest.approx(800.0)
    assert flat.get("wet_value") == pytest.approx(600.0)


@pytest.mark.asyncio
async def test_add_point_blocks_duplicate_role_without_overwrite(db_session):
    service = CalibrationService(db_session)
    session = await service.start_session(
        esp_id="ESP_TEST_001",
        gpio=5,
        sensor_type="moisture",
        method="linear_2point",
        expected_points=2,
        initiated_by="tester",
    )

    await service.add_point(
        session_id=session.id,
        raw=900.0,
        reference=0.0,
        point_role="dry",
    )

    with pytest.raises(CalibrationError) as exc:
        await service.add_point(
            session_id=session.id,
            raw=910.0,
            reference=5.0,
            point_role="dry",
            overwrite=False,
        )

    assert exc.value.code == "ROLE_POINT_EXISTS"


@pytest.mark.asyncio
async def test_finalize_requires_both_dry_and_wet(db_session):
    service = CalibrationService(db_session)
    session = await service.start_session(
        esp_id="ESP_TEST_001",
        gpio=6,
        sensor_type="moisture",
        method="linear_2point",
        expected_points=2,
        initiated_by="tester",
    )

    await service.add_point(
        session_id=session.id,
        raw=900.0,
        reference=0.0,
        point_role="dry",
    )

    with pytest.raises(CalibrationError) as exc:
        await service.finalize(session.id)

    assert exc.value.code == "INSUFFICIENT_POINTS"


@pytest.mark.asyncio
async def test_add_point_overwrite_replaces_role_deterministically(db_session):
    service = CalibrationService(db_session)
    session = await service.start_session(
        esp_id="ESP_TEST_001",
        gpio=7,
        sensor_type="moisture",
        method="linear_2point",
        expected_points=2,
        initiated_by="tester",
    )

    session = await service.add_point(
        session_id=session.id,
        raw=910.0,
        reference=0.0,
        point_role="dry",
    )
    dry_before = (session.calibration_points or {}).get("points", [])[0]
    assert dry_before.get("point_role") == "dry"

    session = await service.add_point(
        session_id=session.id,
        raw=870.0,
        reference=5.0,
        point_role="dry",
        overwrite=True,
    )
    points = (session.calibration_points or {}).get("points", [])
    dry_after = next(point for point in points if point.get("point_role") == "dry")
    assert len(points) == 1
    assert dry_after.get("id") == dry_before.get("id")
    assert dry_after.get("raw") == 870.0
    assert dry_after.get("reference") == 5.0


@pytest.mark.asyncio
async def test_delete_point_removes_role_and_keeps_collecting(db_session):
    service = CalibrationService(db_session)
    session = await service.start_session(
        esp_id="ESP_TEST_001",
        gpio=8,
        sensor_type="moisture",
        method="linear_2point",
        expected_points=2,
        initiated_by="tester",
    )
    session = await service.add_point(
        session_id=session.id,
        raw=900.0,
        reference=0.0,
        point_role="dry",
    )
    session = await service.add_point(
        session_id=session.id,
        raw=620.0,
        reference=100.0,
        point_role="wet",
    )

    points = (session.calibration_points or {}).get("points", [])
    dry_id = next(point["id"] for point in points if point.get("point_role") == "dry")
    session = await service.delete_point(session_id=session.id, point_id=dry_id)

    remaining_points = (session.calibration_points or {}).get("points", [])
    assert session.status.value == "collecting"
    assert len(remaining_points) == 1
    assert remaining_points[0].get("point_role") == "wet"


@pytest.mark.asyncio
async def test_apply_is_idempotent(db_session):
    await _create_bound_sensor(db_session, esp_id="ESP_TEST_001", gpio=9)
    service = CalibrationService(db_session)
    session = await service.start_session(
        esp_id="ESP_TEST_001",
        gpio=9,
        sensor_type="moisture",
        method="linear_2point",
        expected_points=2,
        initiated_by="tester",
    )
    session = await service.add_point(
        session_id=session.id,
        raw=850.0,
        reference=0.0,
        point_role="dry",
    )
    session = await service.add_point(
        session_id=session.id,
        raw=650.0,
        reference=100.0,
        point_role="wet",
    )
    session = await service.finalize(session.id)
    first_apply = await service.apply(session.id)
    second_apply = await service.apply(session.id)

    assert first_apply.status.value == "applied"
    assert second_apply.status.value == "applied"
    assert second_apply.id == first_apply.id


# ─────────────────────────────────────────────────────────────────────────────
# pH Calibration (2-point) Tests
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_ph_2point_calibration_happy_path(db_session):
    """pH 2-point calibration with typical Nernst buffer values (pH 7.00 and 4.01)."""
    await _create_bound_sensor(db_session, esp_id="ESP_pH_001", gpio=34, sensor_type="ph")
    service = CalibrationService(db_session)

    session = await service.start_session(
        esp_id="ESP_pH_001",
        gpio=34,
        sensor_type="ph",
        method="ph_2point",
        expected_points=2,
        initiated_by="tester",
    )

    # DFR0300 pH sensor: higher pH → lower voltage (Nernst), raw = ADC counts (12-bit).
    # pH 7.00 at ~2.5V → ADC 3103; pH 4.01 at ~2.68V → ADC 3325.
    # Firmware sends raw ADC counts (0-4095), NOT millivolts.
    # PHSensorProcessor converts: voltage = (raw/4095)*3.3, then pH = slope*V + offset.
    # slope ≈ (7.00-4.01) / ((3103-3325)/4095*3.3) ≈ -16.7 pH/V
    # measured_response = 1000/16.7 ≈ 59.8 mV/pH → deviation ≈ 1.1% from Nernst ✓
    session = await service.add_point(
        session_id=session.id,
        raw=3103.0,  # pH 7.00 buffer at ~2.5 V → ADC 3103
        reference=7.00,
        point_role="buffer_high",
    )
    assert session.points_collected == 1

    session = await service.add_point(
        session_id=session.id,
        raw=3325.0,  # pH 4.01 buffer at ~2.68 V → ADC 3325
        reference=4.01,
        point_role="buffer_low",
    )
    assert session.points_collected == 2

    # Finalize and check result
    session = await service.finalize(session.id)
    assert session.status.value == "finalizing"
    assert session.calibration_result is not None

    result = session.calibration_result
    assert result["method"] == "ph_2point"

    derived = result["derived"]
    assert derived["slope"] < 0  # Must be negative per Nernst
    assert "slope_deviation_pct" in derived
    assert derived["slope_deviation_pct"] <= 15.0
    assert "point_high_raw" in derived
    assert "point_low_raw" in derived


@pytest.mark.asyncio
async def test_ph_2point_validation_negative_slope(db_session):
    """pH 2-point should reject if slope is not negative (electrode polarity error)."""
    service = CalibrationService(db_session)
    session = await service.start_session(
        esp_id="ESP_pH_002",
        gpio=34,
        sensor_type="ph",
        method="ph_2point",
        expected_points=2,
    )

    # WRONG polarity: raw increases with pH (opposite of Nernst)
    # This will compute positive slope and should fail
    session = await service.add_point(
        session_id=session.id,
        raw=100.0,
        reference=4.01,
        point_role="buffer_low",
    )
    session = await service.add_point(
        session_id=session.id,
        raw=250.0,
        reference=7.00,
        point_role="buffer_high",
    )

    with pytest.raises(CalibrationError) as exc:
        await service.finalize(session.id)

    assert exc.value.code == "COMPUTE_FAILED"


@pytest.mark.asyncio
async def test_ph_2point_validation_slope_deviation(db_session):
    """pH 2-point should reject if slope deviates more than ±15% from ideal."""
    service = CalibrationService(db_session)
    session = await service.start_session(
        esp_id="ESP_pH_003",
        gpio=34,
        sensor_type="ph",
        method="ph_2point",
        expected_points=2,
    )

    # Extreme slope: nearly 0 mV/pH (electrode nearly dead)
    # raw differs by only 20 mV over 3 pH units: 1/(-0.15) ≈ -6.67 mV/pH
    # Deviation from 59.16 mV/pH: |(6.67 - 59.16) / 59.16| ≈ 89% >> 15% ✗
    session = await service.add_point(
        session_id=session.id,
        raw=100.0,
        reference=4.01,
        point_role="buffer_low",
    )
    session = await service.add_point(
        session_id=session.id,
        raw=120.0,
        reference=7.00,
        point_role="buffer_high",
    )

    with pytest.raises(CalibrationError) as exc:
        await service.finalize(session.id)

    assert exc.value.code == "COMPUTE_FAILED"


# ─────────────────────────────────────────────────────────────────────────────
# EC Calibration Tests
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_ec_1point_calibration_happy_path(db_session):
    """EC 1-point calibration with standard reference solution."""
    await _create_bound_sensor(db_session, esp_id="ESP_EC_001", gpio=35, sensor_type="ec")
    service = CalibrationService(db_session)

    session = await service.start_session(
        esp_id="ESP_EC_001",
        gpio=35,
        sensor_type="ec",
        method="ec_1point",
        expected_points=1,
        initiated_by="tester",
    )

    # Standard 1413 µS/cm reference solution; raw=625 ADC counts (typical DFR0300 at 1413 µS/cm).
    # cell_factor = 1413 / 625 = 2.2608 — within typical range [0.5, 10.0].
    # Firmware sends raw ADC counts (12-bit, 0-4095), NOT processed EC values.
    session = await service.add_point(
        session_id=session.id,
        raw=625.0,  # raw ADC count (12-bit ESP32, 0-4095)
        reference=1413.0,  # µS/cm
        point_role="reference",
    )
    assert session.points_collected == 1

    session = await service.finalize(session.id)
    assert session.status.value == "finalizing"
    assert session.calibration_result is not None

    result = session.calibration_result
    assert result["method"] == "ec_1point"

    derived = result["derived"]
    assert "cell_factor" in derived
    # cell_factor = 1413 / 625 = 2.2608 — within typical range [0.5, 10.0]
    assert 0.5 < derived["cell_factor"] < 10.0
    # slope and offset are now included for ECSensorProcessor compatibility
    assert "slope" in derived
    assert "offset" in derived
    assert derived["offset"] == 0.0
    assert "point_raw" in derived
    assert "point_reference" in derived


@pytest.mark.asyncio
async def test_ec_1point_validation_cell_factor_range(db_session):
    """EC 1-point should reject if cell_factor is outside [0.5, 2.0]."""
    service = CalibrationService(db_session)
    session = await service.start_session(
        esp_id="ESP_EC_002",
        gpio=35,
        sensor_type="ec",
        method="ec_1point",
        expected_points=1,
    )

    # raw=1 ADC count with reference=200 µS/cm → cell_factor = 200 > hard limit 100 → COMPUTE_FAILED
    session = await service.add_point(
        session_id=session.id,
        raw=1.0,
        reference=200.0,
        point_role="reference",
    )

    with pytest.raises(CalibrationError) as exc:
        await service.finalize(session.id)

    assert exc.value.code == "COMPUTE_FAILED"


@pytest.mark.asyncio
async def test_canonical_structure_ph_2point(db_session):
    """Canonical calibration result structure for ph_2point."""
    await _create_bound_sensor(db_session, esp_id="ESP_pH_CANON", gpio=34, sensor_type="ph")
    service = CalibrationService(db_session)

    session = await service.start_session(
        esp_id="ESP_pH_CANON",
        gpio=34,
        sensor_type="ph",
        method="ph_2point",
        expected_points=2,
        initiated_by="tester",
    )

    # Realistic Nernst data: buffer_high (pH 7) at 100 mV, buffer_low (pH 4.01) at 258 mV
    session = await service.add_point(
        session_id=session.id,
        raw=100.0,
        reference=7.00,
        point_role="buffer_high",
    )
    session = await service.add_point(
        session_id=session.id,
        raw=258.0,
        reference=4.01,
        point_role="buffer_low",
    )

    session = await service.finalize(session.id)
    result = session.calibration_result

    # Check canonical structure
    assert "method" in result
    assert result["method"] == "ph_2point"
    assert "points" in result
    assert isinstance(result["points"], list)
    assert len(result["points"]) == 2
    assert "derived" in result
    assert isinstance(result["derived"], dict)
    assert "metadata" in result
    assert isinstance(result["metadata"], dict)

    # Check metadata
    assert result["metadata"]["schema_version"] == 1
    assert "source" in result["metadata"]
    assert "normalized_at" in result["metadata"]

    # Check points preserved
    assert result["points"][0]["point_role"] == "buffer_high"
    assert result["points"][1]["point_role"] == "buffer_low"


@pytest.mark.asyncio
async def test_canonical_structure_ec_1point(db_session):
    """Canonical calibration result structure for ec_1point."""
    await _create_bound_sensor(db_session, esp_id="ESP_EC_CANON", gpio=35, sensor_type="ec")
    service = CalibrationService(db_session)

    session = await service.start_session(
        esp_id="ESP_EC_CANON",
        gpio=35,
        sensor_type="ec",
        method="ec_1point",
        expected_points=1,
        initiated_by="tester",
    )

    # raw=625 ADC counts (12-bit ESP32); reference=1413 µS/cm → cell_factor ≈ 2.26
    # Firmware sends raw ADC counts, NOT processed EC values.
    session = await service.add_point(
        session_id=session.id,
        raw=625.0,
        reference=1413.0,
        point_role="reference",
    )

    session = await service.finalize(session.id)
    result = session.calibration_result

    # Check canonical structure
    assert "method" in result
    assert result["method"] == "ec_1point"
    assert "points" in result
    assert isinstance(result["points"], list)
    assert len(result["points"]) == 1
    assert "derived" in result
    assert isinstance(result["derived"], dict)
    assert "metadata" in result

    # Check derived has cell_factor and voltage-based slope/offset
    assert "cell_factor" in result["derived"]
    assert 0.5 <= result["derived"]["cell_factor"] <= 10.0
    assert "slope" in result["derived"]
    assert "offset" in result["derived"]
    assert result["derived"]["offset"] == 0.0


def test_compute_calibration_linear_moisture_maps_to_moisture_2point_derived():
    """linear_2point + moisture: same derived shape as moisture_2point (dry/wet), not slope/offset."""
    points = [
        {"raw": 850.0, "reference": 0.0, "point_role": "dry"},
        {"raw": 620.0, "reference": 100.0, "point_role": "wet"},
    ]
    result = CalibrationService._compute_calibration("linear_2point", "moisture", points)
    assert result["type"] == "moisture_2point"
    assert result["dry_value"] == 850.0
    assert result["wet_value"] == 620.0
    assert result.get("invert") is False


def test_compute_calibration_linear_ec_stays_linear():
    """Non-moisture linear_2point remains slope/offset."""
    points = [
        {"raw": 100.0, "reference": 0.0, "point_role": "dry"},
        {"raw": 200.0, "reference": 10.0, "point_role": "wet"},
    ]
    result = CalibrationService._compute_calibration("linear_2point", "ec", points)
    assert result["type"] == "linear_2point"
    assert "slope" in result
