"""
Integration Tests: GET /api/v1/sensors/export

AUT-384 — Sensor-CSV-Export-Endpoint
Tests cover:
  - Correct CSV format with 100 rows
  - Cursor pagination works for >500 rows (no hard cap)
  - Time range filters applied correctly
  - 401 without Authorization header
  - 422 for missing required filter (no esp_id / zone_id / subzone_id)
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.security import create_access_token
from src.db.models.esp import ESPDevice
from src.db.models.sensor import SensorData
from src.db.models.user import User
from src.main import app

# =============================================================================
# Fixtures
# =============================================================================

BASE_TIME = datetime(2026, 5, 1, 12, 0, 0, tzinfo=timezone.utc)


@pytest.fixture
async def export_user(db_session: AsyncSession):
    """Active operator user with JWT token."""
    user = User(
        username="export_tester",
        email="export@example.com",
        password_hash="hashed_pw",
        role="operator",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)
    user.token = create_access_token(user_id=user.id, additional_claims={"role": user.role})
    return user


@pytest.fixture
async def export_esp(db_session: AsyncSession):
    """ESP device for export tests."""
    esp = ESPDevice(
        device_id="ESP_EXPORT_001",
        name="Export Test ESP",
        ip_address="192.168.1.200",
        mac_address="EE:FF:00:11:22:33",
        firmware_version="1.0.0",
        hardware_type="ESP32_WROOM",
        status="online",
        capabilities={"max_sensors": 20, "max_actuators": 12},
    )
    db_session.add(esp)
    await db_session.flush()
    await db_session.refresh(esp)
    return esp


async def _insert_sensor_data(
    db_session: AsyncSession,
    esp: ESPDevice,
    count: int,
    base_time: datetime = BASE_TIME,
    gpio: int = 4,
    sensor_type: str = "temperature",
) -> list[SensorData]:
    """Insert `count` SensorData rows, one per minute starting from base_time."""
    rows = []
    for i in range(count):
        row = SensorData(
            esp_id=esp.id,
            gpio=gpio,
            sensor_type=sensor_type,
            raw_value=20.0 + i * 0.01,
            processed_value=20.0 + i * 0.01,
            unit="°C",
            processing_mode="raw",
            quality="good",
            timestamp=base_time + timedelta(minutes=i),
        )
        db_session.add(row)
        rows.append(row)
    await db_session.flush()
    return rows


# =============================================================================
# Test 1: Export 100 Sensor Values → CSV korrekt formatiert
# =============================================================================


@pytest.mark.asyncio
async def test_export_csv_format_100_rows(
    export_user,
    export_esp,
    db_session: AsyncSession,
):
    """GET /export returns valid CSV with BOM, header, and 100 data rows."""
    await _insert_sensor_data(db_session, export_esp, 100)

    start = BASE_TIME.isoformat()
    end = (BASE_TIME + timedelta(hours=2)).isoformat()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/api/v1/sensors/export",
            params={"esp_id": export_esp.device_id, "start_time": start, "end_time": end},
            headers={"Authorization": f"Bearer {export_user.token}"},
        )

    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert "attachment" in response.headers.get("content-disposition", "")

    content = response.text
    # BOM present
    assert content.startswith("﻿")
    lines = content.lstrip("﻿").strip().splitlines()

    # Header row
    assert lines[0] == "timestamp,processed_value,unit,quality,sensor_type"
    # 100 data rows
    assert len(lines) == 101  # 1 header + 100 data

    # Spot-check a data row
    fields = lines[1].split(",")
    assert len(fields) == 5
    assert "°C" in fields[2]
    assert fields[3] == "good"
    assert fields[4] == "temperature"


# =============================================================================
# Test 2: Export > 500 Werte → Cursor-Pagination funktioniert (kein Hard-Cap)
# =============================================================================


@pytest.mark.asyncio
async def test_export_streams_more_than_500_rows(
    export_user,
    export_esp,
    db_session: AsyncSession,
):
    """
    Export of 501 rows spans two cursor batches (500 + 1).
    All 501 rows must appear in the CSV without truncation.
    """
    await _insert_sensor_data(
        db_session,
        export_esp,
        501,
        base_time=datetime(2026, 4, 1, 0, 0, 0, tzinfo=timezone.utc),
        gpio=5,
    )

    start = datetime(2026, 4, 1, 0, 0, 0, tzinfo=timezone.utc).isoformat()
    end = datetime(2026, 4, 1, 10, 0, 0, tzinfo=timezone.utc).isoformat()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/api/v1/sensors/export",
            params={
                "esp_id": export_esp.device_id,
                "gpio": 5,
                "start_time": start,
                "end_time": end,
            },
            headers={"Authorization": f"Bearer {export_user.token}"},
        )

    assert response.status_code == 200
    lines = response.text.lstrip("﻿").strip().splitlines()
    # 1 header + 501 data rows (not truncated to 1000 or 500)
    assert len(lines) == 502


# =============================================================================
# Test 3: Zeitraum-Parameter wird korrekt angewendet
# =============================================================================


@pytest.mark.asyncio
async def test_export_time_range_filters(
    export_user,
    export_esp,
    db_session: AsyncSession,
):
    """Only rows within [start_time, end_time] appear in the CSV."""
    base = datetime(2026, 3, 1, 0, 0, 0, tzinfo=timezone.utc)
    # Insert 60 rows: minutes 0..59
    await _insert_sensor_data(db_session, export_esp, 60, base_time=base, gpio=6)

    # Request only minutes 10..29 (20 rows)
    start = (base + timedelta(minutes=10)).isoformat()
    end = (base + timedelta(minutes=29, seconds=59)).isoformat()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/api/v1/sensors/export",
            params={
                "esp_id": export_esp.device_id,
                "gpio": 6,
                "start_time": start,
                "end_time": end,
            },
            headers={"Authorization": f"Bearer {export_user.token}"},
        )

    assert response.status_code == 200
    lines = response.text.lstrip("﻿").strip().splitlines()
    data_rows = lines[1:]  # skip header
    assert len(data_rows) == 20

    # Verify timestamps are within range (normalize to UTC-aware for comparison)
    start_dt = datetime.fromisoformat(start)
    end_dt = datetime.fromisoformat(end)
    for line in data_rows:
        ts_str = line.split(",")[0]
        ts = datetime.fromisoformat(ts_str)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        assert ts >= start_dt
        assert ts <= end_dt


# =============================================================================
# Test 4: Auth-Fehler ohne JWT → 401
# =============================================================================


@pytest.mark.asyncio
async def test_export_unauthorized_without_token(export_esp):
    """GET /export without Authorization header returns 401."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/api/v1/sensors/export",
            params={"esp_id": export_esp.device_id},
        )

    assert response.status_code == 401


# =============================================================================
# Test 5: Fehlender Pflichtfilter → 422
# =============================================================================


@pytest.mark.asyncio
async def test_export_missing_required_filter(export_user):
    """GET /export without esp_id, zone_id, or subzone_id returns 422."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/api/v1/sensors/export",
            headers={"Authorization": f"Bearer {export_user.token}"},
        )

    assert response.status_code == 422


# =============================================================================
# Test 6: Spaltenauswahl — columns-Parameter
# =============================================================================


@pytest.mark.asyncio
async def test_export_custom_columns(
    export_user,
    export_esp,
    db_session: AsyncSession,
):
    """columns=timestamp,unit returns CSV with exactly those 2 columns."""
    await _insert_sensor_data(
        db_session,
        export_esp,
        5,
        base_time=datetime(2026, 2, 1, 0, 0, 0, tzinfo=timezone.utc),
        gpio=7,
    )

    start = datetime(2026, 2, 1, 0, 0, 0, tzinfo=timezone.utc).isoformat()
    end = datetime(2026, 2, 1, 1, 0, 0, tzinfo=timezone.utc).isoformat()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/api/v1/sensors/export",
            params={
                "esp_id": export_esp.device_id,
                "gpio": 7,
                "start_time": start,
                "end_time": end,
                "columns": "timestamp,unit",
            },
            headers={"Authorization": f"Bearer {export_user.token}"},
        )

    assert response.status_code == 200
    lines = response.text.lstrip("﻿").strip().splitlines()
    assert lines[0] == "timestamp,unit"
    for line in lines[1:]:
        assert len(line.split(",")) == 2
