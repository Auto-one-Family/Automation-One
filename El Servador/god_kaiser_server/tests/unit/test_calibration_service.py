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
