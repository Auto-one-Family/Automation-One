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
    def test_scheduled_is_queued(self) -> None:
        status = resolve_config_push_status(
            {"success": True, "scheduled": True, "sent": False},
        )
        assert status == "queued"

    def test_scheduled_stays_queued_when_mqtt_client_disconnected(self) -> None:
        """Coalesce success must not become db_only just because is_connected is false."""
        status = resolve_config_push_status(
            {"success": True, "scheduled": True, "sent": False},
        )
        assert status == "queued"

    def test_publish_success_is_published(self) -> None:
        status = resolve_config_push_status({"success": True, "sent": True})
        assert status == "published"

    def test_publish_failure_is_db_only(self) -> None:
        status = resolve_config_push_status({"success": False, "sent": False})
        assert status == "db_only"


class TestScheduleConfigPushIntent:
    @pytest.mark.asyncio
    async def test_returns_schedule_correlation_id_when_push_succeeds(self) -> None:
        scheduled_id = str(uuid.uuid4())
        esp_service = MagicMock()
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
    async def test_disconnected_mqtt_client_still_returns_queued_when_scheduled(self) -> None:
        scheduled_id = str(uuid.uuid4())
        esp_service = MagicMock()
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
