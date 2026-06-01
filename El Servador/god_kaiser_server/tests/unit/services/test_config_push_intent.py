"""Unit tests for config push intent handles (AUT-586)."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.services.config_push_intent import (
    resolve_config_push_status,
    schedule_config_push_intent,
)


class TestResolveConfigPushStatus:
    def test_scheduled_with_mqtt_connected_is_queued(self) -> None:
        status = resolve_config_push_status(
            {"success": True, "scheduled": True, "sent": False},
            mqtt_connected=True,
        )
        assert status == "queued"

    def test_scheduled_with_mqtt_down_is_db_only(self) -> None:
        status = resolve_config_push_status(
            {"success": True, "scheduled": True, "sent": False},
            mqtt_connected=False,
        )
        assert status == "db_only"

    def test_publish_success_is_published(self) -> None:
        status = resolve_config_push_status(
            {"success": True, "sent": True},
            mqtt_connected=True,
        )
        assert status == "published"

    def test_publish_failure_is_db_only(self) -> None:
        status = resolve_config_push_status(
            {"success": False, "sent": False},
            mqtt_connected=True,
        )
        assert status == "db_only"


class TestScheduleConfigPushIntent:
    @pytest.mark.asyncio
    async def test_returns_schedule_correlation_id_when_push_succeeds(self) -> None:
        scheduled_id = str(uuid.uuid4())
        esp_service = MagicMock()
        esp_service.publisher = MagicMock()
        esp_service.publisher.client = MagicMock()
        esp_service.publisher.client.is_connected = MagicMock(return_value=True)
        esp_service.trigger_config_push_debounced = AsyncMock(
            return_value={
                "success": True,
                "scheduled": True,
                "sent": False,
                "correlation_id": scheduled_id,
            }
        )

        correlation_id, push_status = await schedule_config_push_intent(
            esp_service,
            "ESP_12345678",
            reason_code="sensor_config_change",
        )

        assert correlation_id == scheduled_id
        assert push_status == "queued"

    @pytest.mark.asyncio
    async def test_returns_fallback_uuid_when_schedule_raises(self) -> None:
        esp_service = MagicMock()
        esp_service.publisher = MagicMock()
        esp_service.publisher.client = MagicMock()
        esp_service.publisher.client.is_connected = MagicMock(return_value=True)
        esp_service.trigger_config_push_debounced = AsyncMock(
            side_effect=RuntimeError("build_combined_config failed")
        )

        correlation_id, push_status = await schedule_config_push_intent(
            esp_service,
            "ESP_12345678",
            reason_code="sensor_config_change",
        )

        uuid.UUID(correlation_id)
        assert push_status == "db_only"

    @pytest.mark.asyncio
    async def test_mqtt_down_returns_db_only_with_valid_uuid(self) -> None:
        scheduled_id = str(uuid.uuid4())
        esp_service = MagicMock()
        esp_service.publisher = MagicMock()
        esp_service.publisher.client = MagicMock()
        esp_service.publisher.client.is_connected = MagicMock(return_value=False)
        esp_service.trigger_config_push_debounced = AsyncMock(
            return_value={
                "success": True,
                "scheduled": True,
                "sent": False,
                "correlation_id": scheduled_id,
            }
        )

        correlation_id, push_status = await schedule_config_push_intent(
            esp_service,
            "ESP_12345678",
            reason_code="sensor_config_change",
        )

        assert correlation_id == scheduled_id
        assert push_status == "db_only"
