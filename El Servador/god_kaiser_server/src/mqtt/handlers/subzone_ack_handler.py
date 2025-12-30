"""
Subzone ACK Handler

Phase: 9 - Subzone Management
Status: IMPLEMENTED

Handles subzone assignment acknowledgments from ESP32 devices.

Topic Pattern: kaiser/{kaiser_id}/esp/{esp_id}/subzone/ack

ACK Payload:
{
    "esp_id": "ESP_AB12CD",
    "status": "subzone_assigned" | "subzone_removed" | "error",
    "subzone_id": "irrigation_section_A",
    "ts": 1734523800,
    "error_code": 2501,  // optional, only on error
    "message": "GPIO conflict"  // optional, only on error
}

References:
- El Trabajante/docs/system-flows/09-subzone-management-flow.md
- El Servador/god_kaiser_server/src/mqtt/handlers/zone_ack_handler.py (Pattern)
"""

from typing import Any, Dict, Optional

from pydantic import ValidationError

from ...core.logging_config import get_logger
from ...db.session import resilient_session
from ...db.repositories import ESPRepository
from ...schemas.subzone import SubzoneAckPayload
from ...services.subzone_service import SubzoneService
from ...websocket.manager import WebSocketManager
from ..topics import TopicBuilder

logger = get_logger(__name__)


class SubzoneAckHandler:
    """
    Handler for subzone assignment ACK messages from ESP devices.

    Processes subzone assignment/removal confirmations and broadcasts
    updates to connected WebSocket clients.
    """

    def __init__(self):
        """Initialize handler with WebSocket manager."""
        self.ws_manager = WebSocketManager()

    async def handle(self, topic: str, payload: dict) -> bool:
        """
        Handle incoming subzone ACK message.

        Args:
            topic: MQTT topic (kaiser/{kaiser_id}/esp/{esp_id}/subzone/ack)
            payload: Parsed JSON payload dict (already parsed by subscriber)

        Returns:
            True if processed successfully, False otherwise
        """
        # Parse topic to extract ESP ID
        topic_info = TopicBuilder.parse_subzone_ack_topic(topic)
        if not topic_info:
            logger.warning(f"Could not parse subzone ACK topic: {topic}")
            return False

        esp_id = topic_info.get("esp_id")
        if not esp_id:
            logger.warning(f"No esp_id in subzone ACK topic: {topic}")
            return False

        # Validate payload (payload is already a dict from subscriber)
        ack_payload = self._validate_payload(payload)
        if not ack_payload:
            logger.warning(f"Subzone ACK payload validation failed from {esp_id}")
            return False

        logger.info(
            f"Received subzone ACK from {esp_id}: "
            f"status={ack_payload.status}, subzone_id={ack_payload.subzone_id}"
        )

        # Process ACK with database session
        async with resilient_session() as session:
            esp_repo = ESPRepository(session)
            service = SubzoneService(esp_repo=esp_repo, session=session)

            success = await service.handle_subzone_ack(
                device_id=ack_payload.esp_id,
                status=ack_payload.status,
                subzone_id=ack_payload.subzone_id,
                timestamp=ack_payload.timestamp,
                error_code=ack_payload.error_code,
                message=ack_payload.message,
            )

            if success:
                await session.commit()
                # Broadcast to WebSocket clients
                await self._broadcast_subzone_update(ack_payload)
                return True
            else:
                logger.warning(f"Subzone ACK processing failed for {esp_id}")
                return False

    def _validate_payload(
        self, payload_data: Dict[str, Any]
    ) -> Optional[SubzoneAckPayload]:
        """
        Validate payload against schema.

        Args:
            payload_data: Parsed JSON dict

        Returns:
            SubzoneAckPayload or None
        """
        try:
            return SubzoneAckPayload.model_validate(payload_data)
        except ValidationError as e:
            logger.error(f"Subzone ACK validation error: {e}")
            return None

    async def _broadcast_subzone_update(self, ack_payload: SubzoneAckPayload) -> None:
        """
        Broadcast subzone update to WebSocket clients.

        Args:
            ack_payload: Validated ACK payload
        """
        message = {
            "type": "subzone_assignment",
            "device_id": ack_payload.esp_id,
            "data": {
                "subzone_id": ack_payload.subzone_id,
                "status": ack_payload.status,
                "timestamp": ack_payload.timestamp,
            },
        }

        # Add error info if present
        if ack_payload.error_code is not None:
            message["data"]["error_code"] = ack_payload.error_code
            message["data"]["message"] = ack_payload.message

        await self.ws_manager.broadcast_thread_safe(message)
        logger.debug(f"Broadcasted subzone update for {ack_payload.esp_id}")


# =============================================================================
# Module-level handler function (for MQTT subscriber registration)
# =============================================================================

# Module-level instance for handler registration (matches zone_ack_handler pattern)
_handler = SubzoneAckHandler()


async def handle_subzone_ack(topic: str, payload: dict) -> bool:
    """
    Module-level handler function for MQTT subscriber registration.

    Args:
        topic: MQTT topic string
        payload: Parsed JSON payload dict

    Returns:
        True if processed successfully
    """
    return await _handler.handle(topic, payload)

