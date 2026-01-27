"""
Integration Tests: Sensor API

Phase: 5 (Week 9-10) - API Layer
Tests: Sensor endpoints (config CRUD, data query)
"""

import pytest
from datetime import datetime
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.security import create_access_token, get_password_hash
from src.db.models.sensor import SensorConfig
from src.db.models.esp import ESPDevice
from src.db.models.user import User
from src.main import app


@pytest.fixture
async def test_esp(db_session: AsyncSession):
    """Create a test ESP device."""
    esp = ESPDevice(
        device_id="ESP_12345678",  # Must match pattern ^ESP_[A-F0-9]{8}$
        name="Sensor Test ESP",
        ip_address="192.168.1.120",
        mac_address="AA:BB:CC:DD:EE:02",
        firmware_version="2.0.0",
        hardware_type="ESP32_WROOM",
        status="online",
        metadata={},
    )
    db_session.add(esp)
    await db_session.commit()
    await db_session.refresh(esp)
    return esp


@pytest.fixture
async def test_sensor(db_session: AsyncSession, test_esp: ESPDevice):
    """Create a test sensor configuration."""
    sensor = SensorConfig(
        esp_id=test_esp.id,
        gpio=34,
        sensor_type="ph",
        sensor_name="Test pH Sensor",
        interface_type="ANALOG",
        enabled=True,
        sample_interval_ms=30000,
        pi_enhanced=True,
        calibration_data={"slope": -3.5, "offset": 21.34},
        thresholds={"min": 0.0, "max": 14.0, "warning_min": 5.5, "warning_max": 7.5},
        sensor_metadata={},  # Model field is sensor_metadata, not metadata
    )
    db_session.add(sensor)
    await db_session.commit()
    await db_session.refresh(sensor)
    return sensor


@pytest.fixture
async def operator_user(db_session: AsyncSession):
    """Create an operator user."""
    user = User(
        username="sensor_operator",
        email="sensor_op@example.com",
        password_hash=get_password_hash("OperatorP@ss123"),
        full_name="Sensor Operator",
        role="operator",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
def auth_headers(operator_user: User):
    """Get authorization headers."""
    token = create_access_token(user_id=operator_user.id, additional_claims={"role": operator_user.role})
    return {"Authorization": f"Bearer {token}"}


class TestListSensors:
    """Test sensor listing."""
    
    @pytest.mark.asyncio
    async def test_list_sensors(self, auth_headers: dict, test_sensor: SensorConfig):
        """Test listing sensors."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(
                "/api/v1/sensors/",
                headers=auth_headers,
            )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]) >= 1
    
    @pytest.mark.asyncio
    async def test_list_sensors_with_type_filter(self, auth_headers: dict, test_sensor: SensorConfig):
        """Test listing sensors filtered by type."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(
                "/api/v1/sensors/",
                params={"sensor_type": "ph"},
                headers=auth_headers,
            )
        
        assert response.status_code == 200
        data = response.json()
        assert all(d["sensor_type"] == "ph" for d in data["data"])


class TestGetSensor:
    """Test getting single sensor."""
    
    @pytest.mark.asyncio
    async def test_get_sensor(self, auth_headers: dict, test_sensor: SensorConfig, test_esp: ESPDevice):
        """Test getting sensor by ESP and GPIO."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(
                f"/api/v1/sensors/{test_esp.device_id}/{test_sensor.gpio}",
                headers=auth_headers,
            )
        
        assert response.status_code == 200
        data = response.json()
        assert data["gpio"] == test_sensor.gpio
        assert data["sensor_type"] == "ph"
        assert data["name"] == "Test pH Sensor"
    
    @pytest.mark.asyncio
    async def test_get_sensor_not_found(self, auth_headers: dict, test_esp: ESPDevice):
        """Test getting non-existent sensor."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(
                f"/api/v1/sensors/{test_esp.device_id}/99",
                headers=auth_headers,
            )
        
        assert response.status_code == 404


class TestCreateSensor:
    """Test sensor creation."""
    
    @pytest.mark.asyncio
    async def test_create_sensor(self, auth_headers: dict, test_esp: ESPDevice):
        """Test creating a sensor."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/sensors/{test_esp.device_id}/35",
                json={
                    "esp_id": test_esp.device_id,
                    "gpio": 35,
                    "sensor_type": "temperature",
                    "name": "New Temperature Sensor",
                    "enabled": True,
                    "interval_ms": 60000,
                    "processing_mode": "pi_enhanced",
                },
                headers=auth_headers,
            )
        
        assert response.status_code == 200
        data = response.json()
        assert data["gpio"] == 35
        assert data["sensor_type"] == "temperature"


class TestDeleteSensor:
    """Test sensor deletion."""
    
    @pytest.mark.asyncio
    async def test_delete_sensor(self, auth_headers: dict, test_sensor: SensorConfig, test_esp: ESPDevice):
        """Test deleting a sensor."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.delete(
                f"/api/v1/sensors/{test_esp.device_id}/{test_sensor.gpio}",
                headers=auth_headers,
            )
        
        assert response.status_code == 200
        data = response.json()
        assert data["gpio"] == test_sensor.gpio


class TestQueryData:
    """Test sensor data query."""
    
    @pytest.mark.asyncio
    async def test_query_sensor_data(self, auth_headers: dict, test_sensor: SensorConfig, test_esp: ESPDevice):
        """Test querying sensor data."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(
                "/api/v1/sensors/data",
                params={
                    "esp_id": test_esp.device_id,
                    "gpio": test_sensor.gpio,
                },
                headers=auth_headers,
            )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "readings" in data
        assert "count" in data


class TestSensorStats:
    """Test sensor statistics."""
    
    @pytest.mark.asyncio
    async def test_get_sensor_stats(self, auth_headers: dict, test_sensor: SensorConfig, test_esp: ESPDevice):
        """Test getting sensor statistics."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(
                f"/api/v1/sensors/{test_esp.device_id}/{test_sensor.gpio}/stats",
                headers=auth_headers,
            )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "stats" in data

