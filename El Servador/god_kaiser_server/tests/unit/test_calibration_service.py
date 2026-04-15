"""Unit tests for calibration service session flow and guards."""

import pytest

from src.db.models.esp import ESPDevice
from src.db.models.sensor import SensorConfig
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

    # Realistic Nernst response (glass electrode):
    # Higher pH → lower raw mV (negative slope per Nernst equation)
    # pH 7.00 buffer (reference) at ~0 mV, pH 4.01 at ~178 mV (59.16 mV/pH * 3 units ≈ 177)
    session = await service.add_point(
        session_id=session.id,
        raw=0.0,
        reference=7.00,
        point_role="buffer_high",
    )
    assert session.points_collected == 1

    session = await service.add_point(
        session_id=session.id,
        raw=178.0,
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
    # slope = (7.00 - 4.01) / (0.0 - 178.0) = 2.99 / (-178.0) ≈ -0.01679 pH/mV
    # This is close to Nernst ideal of 1/(-59.16) ≈ -0.01689 pH/mV
    # Deviation: |(−0.01679 − (−0.01689))| / 0.01689 * 100 ≈ 0.6% ✓ within 15%
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

    # Standard 1.413 mS/cm reference
    session = await service.add_point(
        session_id=session.id,
        raw=1050.0,  # ADC raw reading
        reference=1.413,  # mS/cm
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
    # cell_factor = 1.413 / 1050 ≈ 0.001346
    assert 0.001 < derived["cell_factor"] < 0.002
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

    # Unrealistic: raw=1 with reference=100 → cell_factor = 100 (way too high)
    session = await service.add_point(
        session_id=session.id,
        raw=1.0,
        reference=100.0,
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

    session = await service.add_point(
        session_id=session.id,
        raw=1050.0,
        reference=1.413,
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

    # Check derived has cell_factor
    assert "cell_factor" in result["derived"]
    assert 0.5 <= result["derived"]["cell_factor"] <= 2.0
