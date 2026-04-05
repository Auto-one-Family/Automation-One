"""Unit tests: ActuatorService.send_command result contract (Epic 1-02)."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import select

from src.db.models.actuator import ActuatorConfig, ActuatorState
from src.db.models.command_contract import CommandIntent
from src.db.models.esp import ESPDevice
from src.db.repositories.actuator_repo import ActuatorRepository
from src.services.actuator_service import ActuatorService
from src.services.safety_service import SafetyCheckResult


@pytest.fixture
async def cmd_test_esp_actuator(db_session):
    esp = ESPDevice(
        device_id="ESP_CMDUNIT01",
        name="Cmd Unit",
        ip_address="192.168.1.1",
        mac_address="AA:BB:CC:DD:EE:99",
        firmware_version="1.0.0",
        hardware_type="ESP32_WROOM",
        status="online",
        metadata={},
    )
    db_session.add(esp)
    await db_session.commit()
    await db_session.refresh(esp)
    ac = ActuatorConfig(
        esp_id=esp.id,
        gpio=5,
        actuator_type="digital",
        actuator_name="Pump",
        enabled=True,
        safety_constraints={},
        actuator_metadata={},
    )
    db_session.add(ac)
    await db_session.commit()
    await db_session.refresh(ac)
    return esp, ac


def _patch_ws():
    mock_manager = MagicMock()
    mock_manager.broadcast = AsyncMock()
    return patch(
        "src.websocket.manager.WebSocketManager.get_instance",
        AsyncMock(return_value=mock_manager),
    )


@pytest.mark.asyncio
async def test_send_command_correlation_id_matches_mqtt_kwarg(db_session, cmd_test_esp_actuator):
    esp, ac = cmd_test_esp_actuator
    actuator_repo = ActuatorRepository(db_session)
    safety = MagicMock()
    safety.validate_actuator_command = AsyncMock(
        return_value=SafetyCheckResult(valid=True, warnings=None)
    )
    publisher = MagicMock()
    publisher.publish_actuator_command.return_value = True
    svc = ActuatorService(actuator_repo, safety, publisher)
    with _patch_ws():
        result = await svc.send_command(
            esp_id=esp.device_id,
            gpio=ac.gpio,
            command="OFF",
            value=0.0,
            issued_by="test",
        )
    assert result.success is True
    assert result.command_sent is True
    uuid.UUID(result.correlation_id)
    publisher.publish_actuator_command.assert_called_once()
    kwargs = publisher.publish_actuator_command.call_args.kwargs
    assert kwargs["correlation_id"] == result.correlation_id

    row = (await db_session.execute(select(CommandIntent).where(CommandIntent.intent_id == result.correlation_id))).scalar_one_or_none()
    assert row is not None
    assert row.orchestration_state == "sent"


@pytest.mark.asyncio
async def test_send_command_noop_has_correlation_without_publish(db_session, cmd_test_esp_actuator):
    esp, ac = cmd_test_esp_actuator
    db_session.add(
        ActuatorState(
            esp_id=esp.id,
            gpio=ac.gpio,
            actuator_type="digital",
            current_value=0.0,
            state="off",
            runtime_seconds=0,
        )
    )
    await db_session.commit()

    actuator_repo = ActuatorRepository(db_session)
    safety = MagicMock()
    safety.validate_actuator_command = AsyncMock(
        return_value=SafetyCheckResult(valid=True, warnings=None)
    )
    publisher = MagicMock()
    svc = ActuatorService(actuator_repo, safety, publisher)
    with _patch_ws():
        result = await svc.send_command(
            esp_id=esp.device_id,
            gpio=ac.gpio,
            command="OFF",
            value=0.0,
            issued_by="test",
        )
    assert result.success is True
    assert result.command_sent is False
    uuid.UUID(result.correlation_id)
    publisher.publish_actuator_command.assert_not_called()


@pytest.mark.asyncio
async def test_send_command_propagates_safety_warnings_when_valid(db_session, cmd_test_esp_actuator):
    esp, ac = cmd_test_esp_actuator
    actuator_repo = ActuatorRepository(db_session)
    safety = MagicMock()
    safety.validate_actuator_command = AsyncMock(
        return_value=SafetyCheckResult(
            valid=True,
            warnings=["cooldown_near_limit", "runtime_advisory"],
        )
    )
    publisher = MagicMock()
    publisher.publish_actuator_command.return_value = True
    svc = ActuatorService(actuator_repo, safety, publisher)
    with _patch_ws():
        result = await svc.send_command(
            esp_id=esp.device_id,
            gpio=ac.gpio,
            command="ON",
            value=1.0,
            issued_by="test",
        )
    assert result.success is True
    assert result.safety_warnings == ["cooldown_near_limit", "runtime_advisory"]
