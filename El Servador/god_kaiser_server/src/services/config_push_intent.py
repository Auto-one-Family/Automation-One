"""
Config push intent handles for REST responses (AUT-586).

Guarantees every sensor/actuator config CRUD response carries a valid
correlation_id UUID and an explicit push_status so the frontend can
terminalize config intents without silent null handles.
"""

from __future__ import annotations

import uuid
from typing import Any, Literal, Optional

from ..core.logging_config import get_logger
from .esp_service import ESPService

logger = get_logger(__name__)

ConfigPushStatus = Literal["queued", "published", "db_only"]


def _mqtt_broker_ready(esp_service: ESPService) -> bool:
    publisher = esp_service.publisher
    client = getattr(publisher, "client", None)
    if client is None or not hasattr(client, "is_connected"):
        return True
    return bool(client.is_connected())


def resolve_config_push_status(
    schedule_result: dict[str, Any],
    *,
    mqtt_connected: bool,
) -> ConfigPushStatus:
    """Map ESPService schedule/send result to REST push_status."""
    if not mqtt_connected:
        return "db_only"
    if schedule_result.get("scheduled"):
        return "queued"
    if schedule_result.get("sent") and schedule_result.get("success"):
        return "published"
    if schedule_result.get("success") is False:
        return "db_only"
    if schedule_result.get("success") and not schedule_result.get("sent"):
        return "db_only"
    return "queued"


async def schedule_config_push_intent(
    esp_service: ESPService,
    esp_id: str,
    *,
    reason_code: str,
    extra_sensor_entries: Optional[list[dict]] = None,
) -> tuple[str, ConfigPushStatus]:
    """
    Schedule debounced config push and return stable intent handle + push_status.

    correlation_id is ALWAYS a valid UUID — even when scheduling or MQTT fails.
    """
    fallback_correlation_id = str(uuid.uuid4())
    mqtt_connected = _mqtt_broker_ready(esp_service)

    try:
        schedule_result = await esp_service.trigger_config_push_debounced(
            esp_id,
            reason_code=reason_code,
            extra_sensor_entries=extra_sensor_entries,
        )
        correlation_id = schedule_result.get("correlation_id") or fallback_correlation_id
        push_status = resolve_config_push_status(
            schedule_result,
            mqtt_connected=mqtt_connected,
        )
        logger.info(
            "Config push intent esp_id=%s correlation_id=%s push_status=%s reason=%s",
            esp_id,
            correlation_id,
            push_status,
            reason_code,
        )
        return correlation_id, push_status
    except Exception as exc:
        logger.error(
            "Failed to schedule config push for ESP %s: %s",
            esp_id,
            exc,
            exc_info=True,
        )
        return fallback_correlation_id, "db_only"
