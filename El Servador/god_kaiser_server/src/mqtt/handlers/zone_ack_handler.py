"""
MQTT Handler: Zone Assignment Acknowledgment Messages

Processes zone ACK messages from ESP32 devices:
- Confirms zone assignment was saved to ESP NVS
- Updates ESP device record in database
- Broadcasts WebSocket event for frontend update

Zone assignment flow:
1. Server publishes zone/assign to ESP
2. ESP saves zone config to NVS
3. ESP sends zone/ack to confirm
4. This handler processes ACK and broadcasts to frontend

Topic: kaiser/{kaiser_id}/esp/{esp_id}/zone/ack

Payload (from ESP32):
{
    "esp_id": "ESP_12AB34CD",
    "status": "zone_assigned" | "error",
    "zone_id": "greenhouse_zone_1",
    "master_zone_id": "greenhouse_master",
    "ts": 1734523800,
    "message": "..." (only on error)
}

Error Codes:
- Uses ValidationErrorCode for payload validation errors
- Uses ConfigErrorCode for ESP device lookup errors
"""

from typing import Any, Dict, Optional

from ...core.error_codes import (
    ConfigErrorCode,
    ValidationErrorCode,
)
from ...core.logging_config import get_logger
from ...db.repositories import ESPRepository
from ...db.session import get_session
from ...websocket.manager import WebSocketManager
from ..topics import TopicBuilder

logger = get_logger(__name__)


class ZoneAckHandler:
    """
    Handles incoming zone assignment acknowledgment messages from ESP32 devices.

    Flow:
    1. Parse topic -> extract esp_id
    2. Validate payload structure
    3. Check if ESP exists in DB
    4. Update ESP zone fields based on ACK status
    5. Broadcast WebSocket event to frontend
    """

    async def handle_zone_ack(self, topic: str, payload: dict) -> bool:
        """
        Handle zone ACK message from ESP.

        Expected topic: kaiser/{kaiser_id}/esp/{esp_id}/zone/ack

        Expected payload (from ESP32):
        {
            "esp_id": "ESP_12AB34CD",
            "status": "zone_assigned" | "error",
            "zone_id": "greenhouse_zone_1",
            "master_zone_id": "greenhouse_master",
            "ts": 1734523800,
            "message": "..." (optional, only on error)
        }

        Args:
            topic: MQTT topic string
            payload: Parsed JSON payload dict

        Returns:
            True if message processed successfully, False otherwise
        """
        try:
            # Step 1: Parse topic
            parsed_topic = TopicBuilder.parse_zone_ack_topic(topic)
            if not parsed_topic:
                logger.error(
                    f"[{ValidationErrorCode.MISSING_REQUIRED_FIELD}] "
                    f"Failed to parse zone/ack topic: {topic}"
                )
                return False

            esp_id_str = parsed_topic["esp_id"]

            logger.debug(f"Processing zone ACK: esp_id={esp_id_str}")

            # Step 2: Validate payload
            validation_result = self._validate_payload(payload)
            if not validation_result["valid"]:
                error_code = validation_result.get(
                    "error_code", ValidationErrorCode.MISSING_REQUIRED_FIELD
                )
                logger.error(
                    f"[{error_code}] Invalid zone/ack payload from {esp_id_str}: "
                    f"{validation_result['error']}"
                )
                return False

            # Extract payload fields
            status = payload.get("status")
            zone_id = payload.get("zone_id", "")
            master_zone_id = payload.get("master_zone_id", "")
            timestamp = payload.get("ts", 0)
            error_message = payload.get("message", "")

            # Step 3: Process ACK via database session
            async for session in get_session():
                esp_repo = ESPRepository(session)

                # Step 4: Get ESP device
                device = await esp_repo.get_by_device_id(esp_id_str)
                if not device:
                    logger.warning(
                        f"[{ConfigErrorCode.ESP_NOT_FOUND}] "
                        f"Zone ACK from unknown device: {esp_id_str}"
                    )
                    return False

                # Step 5: Update ESP based on ACK status
                if status == "zone_assigned":
                    # Update zone fields
                    device.zone_id = zone_id if zone_id else None
                    device.master_zone_id = master_zone_id if master_zone_id else None

                    # Clear pending assignment from metadata
                    if device.device_metadata and "pending_zone_assignment" in device.device_metadata:
                        del device.device_metadata["pending_zone_assignment"]

                    logger.info(
                        f"Zone assignment confirmed for {esp_id_str}: "
                        f"zone_id={zone_id}, master_zone_id={master_zone_id}"
                    )

                elif status == "error":
                    logger.error(
                        f"Zone assignment failed for {esp_id_str}: {error_message}"
                    )
                    # Keep pending assignment for retry

                else:
                    logger.warning(
                        f"Unknown zone ACK status from {esp_id_str}: {status}"
                    )

                await session.commit()

                # Step 6: Broadcast WebSocket event to frontend
                await self._broadcast_zone_update(
                    esp_id=esp_id_str,
                    status=status,
                    zone_id=zone_id,
                    master_zone_id=master_zone_id,
                    timestamp=timestamp,
                    message=error_message,
                )

                return True

        except Exception as e:
            logger.error(f"Error processing zone ACK: {e}", exc_info=True)
            return False

    def _validate_payload(self, payload: dict) -> Dict[str, Any]:
        """
        Validate zone ACK payload structure.

        Required fields:
        - status: "zone_assigned" or "error"
        - ts: Unix timestamp

        Optional fields:
        - esp_id: Device ID (also extracted from topic)
        - zone_id: Assigned zone
        - master_zone_id: Assigned master zone
        - message: Error message (if status == "error")

        Args:
            payload: Raw payload dict

        Returns:
            {
                "valid": bool,
                "error": str | None,
                "error_code": int | None
            }
        """
        # Check for required fields
        if "status" not in payload:
            return {
                "valid": False,
                "error": "Missing required field: status",
                "error_code": ValidationErrorCode.MISSING_REQUIRED_FIELD,
            }

        if "ts" not in payload:
            return {
                "valid": False,
                "error": "Missing required field: ts",
                "error_code": ValidationErrorCode.MISSING_REQUIRED_FIELD,
            }

        # Validate status value
        status = payload.get("status")
        if status not in ("zone_assigned", "error"):
            return {
                "valid": False,
                "error": f"Invalid status value: {status}",
                "error_code": ValidationErrorCode.INVALID_PAYLOAD_FORMAT,
            }

        # Validate timestamp
        ts = payload.get("ts")
        if not isinstance(ts, (int, float)):
            return {
                "valid": False,
                "error": f"Invalid timestamp type: {type(ts).__name__}",
                "error_code": ValidationErrorCode.INVALID_PAYLOAD_FORMAT,
            }

        return {"valid": True, "error": None, "error_code": None}

    async def _broadcast_zone_update(
        self,
        esp_id: str,
        status: str,
        zone_id: str,
        master_zone_id: str,
        timestamp: int,
        message: str,
    ) -> None:
        """
        Broadcast zone assignment update via WebSocket.

        Args:
            esp_id: ESP device ID
            status: "zone_assigned" or "error"
            zone_id: Assigned zone ID
            master_zone_id: Assigned master zone ID
            timestamp: ACK timestamp
            message: Error message (if any)
        """
        try:
            ws_manager = WebSocketManager.get_instance()

            event_data = {
                "esp_id": esp_id,
                "status": status,
                "zone_id": zone_id,
                "master_zone_id": master_zone_id,
                "timestamp": timestamp,
            }

            if message:
                event_data["message"] = message

            await ws_manager.broadcast(
                event_type="zone_assignment",
                data=event_data,
            )

            logger.debug(f"Broadcasted zone_assignment event for {esp_id}")

        except Exception as e:
            logger.error(f"Failed to broadcast zone update: {e}")


# Module-level instance for handler registration
_handler = ZoneAckHandler()


async def handle_zone_ack(topic: str, payload: dict) -> bool:
    """
    Module-level handler function for MQTT subscriber registration.

    Args:
        topic: MQTT topic string
        payload: Parsed JSON payload dict

    Returns:
        True if processed successfully
    """
    return await _handler.handle_zone_ack(topic, payload)
