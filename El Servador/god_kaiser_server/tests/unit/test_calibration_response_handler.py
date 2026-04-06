"""Unit tests for calibration MQTT response handler."""

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest

from src.mqtt.handlers.calibration_response_handler import CalibrationResponseHandler


@pytest.mark.asyncio
async def test_measurement_event_does_not_persist_point(db_session):
    handler = CalibrationResponseHandler()
    broadcast_mock = AsyncMock()

    class _ActiveSession:
        id = "session-123"

    @asynccontextmanager
    async def _session_ctx():
        yield db_session

    with (
        patch(
            "src.mqtt.handlers.calibration_response_handler.resilient_session",
            side_effect=_session_ctx,
        ),
        patch(
            "src.mqtt.handlers.calibration_response_handler.CalibrationSessionRepository"
        ) as repo_cls,
        patch.object(handler, "_broadcast_calibration_event", broadcast_mock),
    ):
        repo_instance = repo_cls.return_value
        repo_instance.get_active_session = AsyncMock(return_value=_ActiveSession())

        topic = "kaiser/main/esp/ESP_TEST_001/sensor/4/response"
        payload = {
            "success": True,
            "raw": 1234.5,
            "quality": "good",
            "sensor_type": "moisture",
            "intent_id": "intent-1",
            "correlation_id": "corr-1",
        }

        result = await handler.handle_sensor_response(topic, payload)

    assert result is True
    assert broadcast_mock.await_count == 1
    event_type = broadcast_mock.await_args.args[0]
    event_kwargs = broadcast_mock.await_args.kwargs
    assert event_type == "calibration_measurement_received"
    assert event_kwargs["raw"] == 1234.5
    assert event_kwargs["raw_value"] == 1234.5
    assert event_kwargs["session_id"] == "session-123"
