"""
Actuator alert → NotificationRouter: MQTT ingress correlation_id (STEUER 05).

Uses integration db_session + patches resilient_session to the same session (handler default).
"""

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.request_context import clear_request_id, set_request_id
from src.db.models.esp import ESPDevice
from src.db.models.user import User
from src.mqtt.handlers.actuator_alert_handler import ActuatorAlertHandler
from src.mqtt.topics import TopicBuilder


@pytest.fixture
async def corr_test_user(db_session: AsyncSession):
    user = User(
        username="corr_alert_user",
        email="corr@example.com",
        password_hash="hashed",
        role="operator",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.fixture
async def corr_test_esp(db_session: AsyncSession):
    device = ESPDevice(
        device_id="ESP_CORR_ALERT",
        name="Corr Test ESP",
        ip_address="192.168.1.240",
        mac_address="AA:BB:CC:DD:EE:CA",
        firmware_version="1.0.0",
        hardware_type="ESP32_WROOM",
        status="online",
        capabilities={"max_actuators": 12},
    )
    db_session.add(device)
    await db_session.flush()
    await db_session.refresh(device)
    return device


def _patch_resilient(db_session: AsyncSession):
    @asynccontextmanager
    async def _use_test_session():
        yield db_session

    return patch(
        "src.mqtt.handlers.actuator_alert_handler.resilient_session",
        _use_test_session,
    )


@pytest.mark.asyncio
async def test_actuator_alert_notification_uses_request_context_correlation_id(
    db_session: AsyncSession,
    corr_test_user,
    corr_test_esp,
):
    await db_session.commit()

    topic = TopicBuilder.build_actuator_alert_topic("ESP_CORR_ALERT", 25, "god")
    payload = {
        "ts": 1733000000,
        "esp_id": "ESP_CORR_ALERT",
        "gpio": 25,
        "alert_type": "emergency_stop",
        "message": "stop",
        "seq": 42,
    }
    expected_cid = "ESP_CORR_ALERT:alert:42:test-ms"
    token = set_request_id(expected_cid)

    try:
        mock_ws = AsyncMock()
        mock_ws.broadcast = AsyncMock()
        mock_route = AsyncMock(return_value=None)

        with (
            _patch_resilient(db_session),
            patch(
                "src.websocket.manager.WebSocketManager.get_instance",
                new=AsyncMock(return_value=mock_ws),
            ),
            patch("src.services.notification_router.NotificationRouter") as MockRouter,
        ):
            MockRouter.return_value.route = mock_route

            handler = ActuatorAlertHandler()
            await handler.handle_actuator_alert(topic, payload)

        assert mock_route.called
        n_create = mock_route.call_args[0][0]
        assert n_create.correlation_id == expected_cid
        assert n_create.metadata.get("mqtt_ingress_correlation_id") == expected_cid
        assert n_create.metadata.get("esp_id") == "ESP_CORR_ALERT"

        ws_payload = mock_ws.broadcast.call_args_list[0][0][1]
        assert ws_payload.get("correlation_id") == expected_cid
    finally:
        clear_request_id(token)


@pytest.mark.asyncio
async def test_actuator_alert_device_correlation_id_in_metadata(
    db_session: AsyncSession,
    corr_test_user,
    corr_test_esp,
):
    await db_session.commit()

    topic = TopicBuilder.build_actuator_alert_topic("ESP_CORR_ALERT", 25, "god")
    payload = {
        "ts": 1733000000,
        "esp_id": "ESP_CORR_ALERT",
        "gpio": 25,
        "alert_type": "runtime_protection",
        "message": "timeout",
        "seq": 43,
        "correlation_id": "  device-corr-uuid  ",
    }
    ingress = "ESP_CORR_ALERT:alert:43:ctx"
    token = set_request_id(ingress)
    try:
        mock_ws = AsyncMock()
        mock_ws.broadcast = AsyncMock()
        mock_route = AsyncMock(return_value=None)
        with (
            _patch_resilient(db_session),
            patch(
                "src.websocket.manager.WebSocketManager.get_instance",
                new=AsyncMock(return_value=mock_ws),
            ),
            patch("src.services.notification_router.NotificationRouter") as MockRouter,
        ):
            MockRouter.return_value.route = mock_route
            handler = ActuatorAlertHandler()
            await handler.handle_actuator_alert(topic, payload)

        n_create = mock_route.call_args[0][0]
        assert n_create.correlation_id == ingress
        assert n_create.metadata.get("device_correlation_id") == "device-corr-uuid"
    finally:
        clear_request_id(token)
