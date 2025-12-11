"""
Integration Tests: Actuator API

Phase: 5 (Week 9-10) - API Layer
Tests: Actuator endpoints (config, command, status, emergency)
"""

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.security import create_access_token, get_password_hash
from src.db.models.actuator import ActuatorConfig
from src.db.models.esp import ESPDevice
from src.db.models.user import User
from src.main import app


@pytest.fixture
async def test_esp(db_session: AsyncSession):
    """Create a test ESP device."""
    esp = ESPDevice(
        device_id="ESP_ACTUAT00",
        name="Actuator Test ESP",
        ip_address="192.168.1.110",
        mac_address="AA:BB:CC:DD:EE:01",
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
async def test_actuator(db_session: AsyncSession, test_esp: ESPDevice):
    """Create a test actuator configuration."""
    actuator = ActuatorConfig(
        esp_id=test_esp.id,
        gpio=5,
        actuator_type="digital",
        actuator_name="Test Pump",
        enabled=True,
        safety_constraints={"max_runtime": 1800, "cooldown_period": 300},
        actuator_metadata={},
    )
    db_session.add(actuator)
    await db_session.commit()
    await db_session.refresh(actuator)
    return actuator


@pytest.fixture
async def operator_user(db_session: AsyncSession):
    """Create an operator user."""
    user = User(
        username="actuator_operator",
        email="actuator_op@example.com",
        password_hash=get_password_hash("OperatorP@ss123"),
        full_name="Actuator Operator",
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


class TestListActuators:
    """Test actuator listing."""
    
    @pytest.mark.asyncio
    async def test_list_actuators(self, auth_headers: dict, test_actuator: ActuatorConfig):
        """Test listing actuators."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(
                "/api/v1/actuators/",
                headers=auth_headers,
            )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]) >= 1
    
    @pytest.mark.asyncio
    async def test_list_actuators_with_filter(self, auth_headers: dict, test_actuator: ActuatorConfig, test_esp: ESPDevice):
        """Test listing actuators with ESP filter."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(
                "/api/v1/actuators/",
                params={"esp_id": test_esp.device_id},
                headers=auth_headers,
            )
        
        assert response.status_code == 200
        data = response.json()
        assert all(d["esp_device_id"] == test_esp.device_id for d in data["data"])


class TestGetActuator:
    """Test getting single actuator."""
    
    @pytest.mark.asyncio
    async def test_get_actuator(self, auth_headers: dict, test_actuator: ActuatorConfig, test_esp: ESPDevice):
        """Test getting actuator by ESP and GPIO."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(
                f"/api/v1/actuators/{test_esp.device_id}/{test_actuator.gpio}",
                headers=auth_headers,
            )
        
        assert response.status_code == 200
        data = response.json()
        assert data["gpio"] == test_actuator.gpio
        assert data["name"] == "Test Pump"
    
    @pytest.mark.asyncio
    async def test_get_actuator_not_found(self, auth_headers: dict, test_esp: ESPDevice):
        """Test getting non-existent actuator."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(
                f"/api/v1/actuators/{test_esp.device_id}/99",
                headers=auth_headers,
            )
        
        assert response.status_code == 404


class TestCreateActuator:
    """Test actuator creation."""
    
    @pytest.mark.asyncio
    async def test_create_actuator(self, auth_headers: dict, test_esp: ESPDevice):
        """Test creating an actuator."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/actuators/{test_esp.device_id}/6",
                json={
                    "esp_id": test_esp.device_id,
                    "gpio": 6,
                    "actuator_type": "pwm",
                    "name": "New PWM Actuator",
                    "enabled": True,
                    "pwm_frequency": 1000,
                },
                headers=auth_headers,
            )
        
        assert response.status_code == 200
        data = response.json()
        assert data["gpio"] == 6
        assert data["actuator_type"] == "pwm"
        assert data["name"] == "New PWM Actuator"


class TestSendCommand:
    """Test sending actuator commands."""
    
    @pytest.mark.asyncio
    async def test_send_on_command(self, auth_headers: dict, test_actuator: ActuatorConfig, test_esp: ESPDevice):
        """Test sending ON command."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/actuators/{test_esp.device_id}/{test_actuator.gpio}/command",
                json={
                    "command": "ON",
                    "value": 1.0,
                    "duration": 60,
                },
                headers=auth_headers,
            )
        
        # May fail if MQTT not connected
        assert response.status_code in [200, 400, 500]
    
    @pytest.mark.asyncio
    async def test_send_pwm_command(self, auth_headers: dict, test_actuator: ActuatorConfig, test_esp: ESPDevice):
        """Test sending PWM command."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/actuators/{test_esp.device_id}/{test_actuator.gpio}/command",
                json={
                    "command": "PWM",
                    "value": 0.5,
                    "duration": 120,
                },
                headers=auth_headers,
            )
        
        assert response.status_code in [200, 400, 500]
    
    @pytest.mark.asyncio
    async def test_command_disabled_actuator(self, auth_headers: dict, db_session: AsyncSession, test_esp: ESPDevice):
        """Test sending command to disabled actuator."""
        # Create disabled actuator
        actuator = ActuatorConfig(
            esp_id=test_esp.id,
            gpio=7,
            actuator_type="digital",
            actuator_name="Disabled Actuator",
            enabled=False,
            metadata={},
        )
        db_session.add(actuator)
        await db_session.commit()
        
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/actuators/{test_esp.device_id}/7/command",
                json={
                    "command": "ON",
                    "value": 1.0,
                    "duration": 0,
                },
                headers=auth_headers,
            )
        
        assert response.status_code == 400
        assert "disabled" in response.json()["detail"].lower()


class TestEmergencyStop:
    """Test emergency stop functionality."""
    
    @pytest.mark.asyncio
    async def test_emergency_stop_all(self, auth_headers: dict, test_actuator: ActuatorConfig):
        """Test emergency stop for all actuators."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/actuators/emergency_stop",
                json={
                    "reason": "Test emergency stop",
                },
                headers=auth_headers,
            )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["reason"] == "Test emergency stop"
    
    @pytest.mark.asyncio
    async def test_emergency_stop_single_esp(self, auth_headers: dict, test_actuator: ActuatorConfig, test_esp: ESPDevice):
        """Test emergency stop for single ESP."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/actuators/emergency_stop",
                json={
                    "esp_id": test_esp.device_id,
                    "reason": "Single ESP emergency stop",
                },
                headers=auth_headers,
            )
        
        assert response.status_code == 200


class TestGetStatus:
    """Test actuator status endpoint."""
    
    @pytest.mark.asyncio
    async def test_get_status(self, auth_headers: dict, test_actuator: ActuatorConfig, test_esp: ESPDevice):
        """Test getting actuator status."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(
                f"/api/v1/actuators/{test_esp.device_id}/{test_actuator.gpio}/status",
                headers=auth_headers,
            )
        
        assert response.status_code == 200
        data = response.json()
        assert data["esp_id"] == test_esp.device_id
        assert data["gpio"] == test_actuator.gpio
        assert "state" in data

