"""
MQTT Handler: ESP32 Configuration Response Messages

Logs configuration acknowledgements from ESP devices and stores in audit log.

Topic: kaiser/god/esp/{esp_id}/config_response
QoS: 2 (Exactly Once)

Note: ESP32 uses 'config_response' topic (not 'config/ack').
Server adapts to ESP32 protocol.

Error Codes (ESP32 → Server):
- NONE: Success
- JSON_PARSE_ERROR: Invalid JSON received
- VALIDATION_FAILED: Config validation failed
- GPIO_CONFLICT: GPIO already in use
- NVS_WRITE_FAILED: NVS storage full or corrupted
- TYPE_MISMATCH: Wrong data type
- MISSING_FIELD: Required field missing
- OUT_OF_RANGE: Value out of valid range
- UNKNOWN_ERROR: Unexpected error

Phase 4 Enhancement:
- Support for partial_success status (some items OK, some failed)
- failures array with detailed per-item error information
- DB update for config_status on sensors/actuators

Audit Logging:
- All config responses are stored in audit_logs table
- Provides history tracking for debugging and compliance
"""

from datetime import datetime, timezone
from typing import List, Optional

from pydantic import ValidationError

from ...core.error_codes import ConfigErrorCode, get_error_code_description
from ...core.logging_config import get_logger
from ...db.repositories.audit_log_repo import AuditLogRepository
from ...db.repositories.esp_repo import ESPRepository
from ...db.repositories.sensor_repo import SensorRepository
from ...db.repositories.actuator_repo import ActuatorRepository
from ...db.session import resilient_session
from ...schemas.esp import ConfigFailureItem, ConfigResponsePayload
from ..topics import TopicBuilder

logger = get_logger(__name__)


# ESP32 Config Error Code mapping (from error_codes.h)
ESP32_ERROR_CODES = {
    "NONE": "Success",
    "JSON_PARSE_ERROR": "Invalid JSON format received",
    "VALIDATION_FAILED": "Config validation failed on ESP32",
    "GPIO_CONFLICT": "GPIO already in use by another sensor/actuator",
    "NVS_WRITE_FAILED": "NVS storage full or corrupted",
    "TYPE_MISMATCH": "Field type mismatch",
    "MISSING_FIELD": "Required field missing",
    "OUT_OF_RANGE": "Value out of valid range",
    "UNKNOWN_ERROR": "Unexpected error on ESP32",
}


class ConfigHandler:
    """
    Handles configuration acknowledgement messages from ESP devices.

    Flow:
    1. Parse topic → extract esp_id
    2. Validate payload structure
    3. Log ACK status (success/failed)
    4. Optional: Store in DB for audit log
    """

    async def handle_config_ack(self, topic: str, payload: dict) -> bool:
        """
        Handle config response message from ESP32.

        Expected topic: kaiser/god/esp/{esp_id}/config_response

        Expected payload (Phase 4 - Extended format):
        {
            "status": "success" | "partial_success" | "error",
            "type": "sensor" | "actuator" | "zone" | "system",
            "count": 2,
            "failed_count": 1,
            "message": "2 configured, 1 failed",
            "failures": [
                {
                    "type": "sensor",
                    "gpio": 5,
                    "error_code": 1002,
                    "error": "GPIO_CONFLICT",
                    "detail": "GPIO 5 reserved by actuator (pump_1)"
                }
            ]
        }

        Also supports legacy format (single failed_item) for backward compatibility.

        Args:
            topic: MQTT topic string
            payload: Parsed JSON payload dict

        Returns:
            True if message processed successfully
        """
        try:
            # Step 1: Parse topic
            parsed_topic = TopicBuilder.parse_config_response_topic(topic)
            if not parsed_topic:
                logger.error(f"Failed to parse config ACK topic: {topic}")
                return False

            esp_id = parsed_topic["esp_id"]

            # Step 2: Validate payload
            validation_result = self._validate_payload(payload)
            if not validation_result["valid"]:
                logger.error(f"Invalid config response payload: {validation_result['error']}")
                return False

            # Step 3: Extract fields (Phase 4 extended format)
            config_type = payload.get("type", payload.get("config_type", "unknown"))
            status = payload["status"]
            count = payload.get("count", 0)
            failed_count = payload.get("failed_count", 0)
            message = payload.get("message", "")
            error_code = payload.get("error_code", "")
            failures = payload.get("failures", [])

            # Step 4: Log response based on status
            if status == "success":
                logger.info(
                    f"✅ Config Response from {esp_id}: {config_type} "
                    f"({count} items) - {message}"
                )
            elif status == "partial_success":
                # Phase 4: Partial success handling
                logger.warning(
                    f"⚠️ Config PARTIAL SUCCESS on {esp_id}: {config_type} "
                    f"- {count} OK, {failed_count} failed - {message}"
                )
                # Log each failure
                for failure in failures:
                    logger.warning(
                        f"   ↳ GPIO {failure.get('gpio', 'N/A')}: "
                        f"{failure.get('error', 'UNKNOWN')} - {failure.get('detail', 'No details')}"
                    )
            else:
                # Full failure
                error_description = ESP32_ERROR_CODES.get(error_code, f"Unknown error: {error_code}")
                failed_item = payload.get("failed_item", {})

                logger.error(
                    f"❌ Config FAILED on {esp_id}: {config_type} "
                    f"- {message} (Error: {error_code} - {error_description})"
                )

                # Log failures from Phase 4 format
                if failures:
                    for failure in failures:
                        logger.error(
                            f"   ↳ GPIO {failure.get('gpio', 'N/A')}: "
                            f"{failure.get('error', 'UNKNOWN')} - {failure.get('detail', 'No details')}"
                        )
                # Legacy: Log single failed_item
                elif failed_item:
                    logger.error(
                        f"   Failed item details: GPIO={failed_item.get('gpio', 'N/A')}, "
                        f"Type={failed_item.get('sensor_type', failed_item.get('actuator_type', 'N/A'))}"
                    )

            # Step 5: Phase 4 - Process failures and update DB
            if failures and (status == "partial_success" or status == "error"):
                await self._process_config_failures(esp_id, config_type, failures)

            # Store in audit_log table for history tracking
            try:
                async with resilient_session() as session:
                    audit_repo = AuditLogRepository(session)
                    await audit_repo.log_config_response(
                        esp_id=esp_id,
                        config_type=config_type,
                        status=status,
                        count=count,
                        message=message,
                        error_code=error_code if status != "success" else None,
                        error_description=ESP32_ERROR_CODES.get(error_code) if error_code else None,
                        failed_item=payload.get("failed_item") if status != "success" else None,
                    )
                    await session.commit()
                    logger.debug(f"Config response stored in audit log: {esp_id}")
            except Exception as audit_error:
                # Don't fail the handler if audit logging fails
                logger.warning(f"Failed to store config response in audit log: {audit_error}")

            # WebSocket Broadcast (Phase 4 extended)
            try:
                from ...websocket.manager import WebSocketManager
                ws_manager = await WebSocketManager.get_instance()

                broadcast_payload = {
                    "esp_id": esp_id,
                    "config_type": config_type,
                    "status": status,
                    "count": count,
                    "failed_count": failed_count,
                    "message": message,
                    "timestamp": int(datetime.now(timezone.utc).timestamp())
                }

                # Include error details for failed/partial configs
                if status != "success":
                    broadcast_payload["error_code"] = error_code
                    broadcast_payload["error_description"] = ESP32_ERROR_CODES.get(error_code, "Unknown error")
                    # Phase 4: Include failures array
                    if failures:
                        broadcast_payload["failures"] = failures
                    # Legacy: Include single failed_item
                    elif payload.get("failed_item"):
                        broadcast_payload["failed_item"] = payload["failed_item"]

                await ws_manager.broadcast("config_response", broadcast_payload)
            except Exception as e:
                logger.warning(f"Failed to broadcast config response via WebSocket: {e}")

            return True

        except Exception as e:
            logger.error(f"Error handling config ACK: {e}", exc_info=True)
            return False

    async def _process_config_failures(
        self,
        esp_id: str,
        config_type: str,
        failures: List[dict]
    ) -> None:
        """
        Phase 4: Process configuration failures and update database.

        Updates sensor/actuator records with config_status="failed" and
        stores the error details for UI display.

        Args:
            esp_id: ESP device ID
            config_type: Configuration type (sensor/actuator)
            failures: List of failure dicts from ESP
        """
        try:
            async with resilient_session() as session:
                esp_repo = ESPRepository(session)
                esp = await esp_repo.get_by_device_id(esp_id)

                if not esp:
                    logger.error(f"ESP not found for config failures: {esp_id}")
                    return

                sensor_repo = SensorRepository(session)
                actuator_repo = ActuatorRepository(session)

                for failure in failures:
                    failure_type = failure.get("type", config_type)
                    gpio = failure.get("gpio")
                    error_name = failure.get("error", "UNKNOWN")
                    error_detail = failure.get("detail", "")

                    if gpio is None:
                        logger.warning(f"Failure without GPIO, skipping: {failure}")
                        continue

                    logger.info(
                        f"Processing config failure: {esp_id} {failure_type} "
                        f"GPIO {gpio} - {error_name}"
                    )

                    if failure_type == "sensor":
                        sensor = await sensor_repo.get_by_esp_and_gpio(esp.id, gpio)
                        if sensor:
                            await sensor_repo.update(
                                sensor.id,
                                config_status="failed",
                                config_error=error_name,
                                config_error_detail=error_detail[:200] if error_detail else None
                            )
                            logger.debug(f"Updated sensor config_status=failed for GPIO {gpio}")
                        else:
                            logger.warning(f"Sensor not found for ESP {esp_id} GPIO {gpio}")

                    elif failure_type == "actuator":
                        actuator = await actuator_repo.get_by_esp_and_gpio(esp.id, gpio)
                        if actuator:
                            await actuator_repo.update(
                                actuator.id,
                                config_status="failed",
                                config_error=error_name,
                                config_error_detail=error_detail[:200] if error_detail else None
                            )
                            logger.debug(f"Updated actuator config_status=failed for GPIO {gpio}")
                        else:
                            logger.warning(f"Actuator not found for ESP {esp_id} GPIO {gpio}")

                await session.commit()
                logger.info(f"Processed {len(failures)} config failures for {esp_id}")

        except Exception as e:
            logger.error(f"Failed to process config failures: {e}", exc_info=True)

    def _validate_payload(self, payload: dict) -> dict:
        """Validate config response payload structure.

        ESP32 ConfigResponseBuilder sends (Phase 4 extended):
        - status: "success", "partial_success", or "error"
        - type: "sensor", "actuator", "zone", "system"
        - count: number of successfully configured items
        - failed_count: (Phase 4) number of failed items
        - message: human-readable message
        - error_code: (on error) error code string
        - failed_item: (legacy) single failed config item
        - failures: (Phase 4) array of failure details
        """
        # Required fields: status and type
        if "status" not in payload:
            return {"valid": False, "error": "Missing required field: status"}

        # Accept both "type" (ESP32) and "config_type" (legacy)
        if "type" not in payload and "config_type" not in payload:
            return {"valid": False, "error": "Missing required field: type"}

        # Type validation
        valid_config_types = ["sensor", "actuator", "zone", "system"]
        config_type = payload.get("type", payload.get("config_type"))
        if config_type not in valid_config_types:
            return {
                "valid": False,
                "error": f"Invalid type. Must be one of: {valid_config_types}",
            }

        # Status validation - Phase 4: Added "partial_success"
        valid_statuses = ["success", "partial_success", "error", "failed"]
        if payload["status"] not in valid_statuses:
            return {
                "valid": False,
                "error": f"Invalid status. Must be one of: {valid_statuses}",
            }

        return {"valid": True, "error": ""}


# Global handler instance
_handler_instance: Optional[ConfigHandler] = None


def get_config_handler() -> ConfigHandler:
    """Get singleton config handler instance."""
    global _handler_instance
    if _handler_instance is None:
        _handler_instance = ConfigHandler()
    return _handler_instance


async def handle_config_ack(topic: str, payload: dict) -> bool:
    """Handle config ACK message (convenience function)."""
    handler = get_config_handler()
    return await handler.handle_config_ack(topic, payload)
