"""
MQTT Handler: Last-Will-Testament (LWT) Messages

Processes LWT messages from MQTT broker when ESP32 disconnects unexpectedly:
- Power loss
- Network failure
- ESP32 crash
- Broker keepalive timeout

Topic: kaiser/{kaiser_id}/esp/{esp_id}/system/will

LWT provides INSTANT offline detection (vs. 300s heartbeat timeout).
The broker publishes this message automatically when ESP32 disconnects
without sending a proper MQTT DISCONNECT packet.

Error Codes:
- Uses ValidationErrorCode for payload validation errors
- Uses ConfigErrorCode for ESP device lookup errors
"""

from datetime import datetime, timezone
from typing import Optional

from ...core.error_codes import (
    ConfigErrorCode,
    ValidationErrorCode,
)
from ...core.logging_config import get_logger
from ...core.metrics import (
    increment_contract_terminalization_blocked,
    increment_disconnect_reason,
)
from ...db.models.audit_log import AuditEventType, AuditSeverity
from ...db.repositories import CommandContractRepository, ESPRepository
from ...db.repositories.actuator_repo import ActuatorRepository
from ...db.repositories.audit_log_repo import AuditLogRepository
from ...db.session import resilient_session
from ...services.event_contract_serializers import serialize_esp_health_event
from ...services.system_event_contract import canonicalize_lwt
from ...services.state_adoption_service import get_state_adoption_service
from ..topics import TopicBuilder

logger = get_logger(__name__)


class LWTHandler:
    """
    Handles Last-Will-Testament messages from MQTT broker.

    Flow:
    1. Parse topic -> extract esp_id
    2. Validate payload structure
    3. Check if ESP exists in DB
    4. Update ESP device status to "offline"
    5. Broadcast via WebSocket for instant UI update
    """

    async def handle_lwt(self, topic: str, payload: dict) -> bool:
        """
        Handle Last-Will-Testament message.

        Expected topic: kaiser/{kaiser_id}/esp/{esp_id}/system/will

        Expected payload (configured by ESP32 in mqtt_client.cpp:178-185):
        {
            "status": "offline",
            "reason": "unexpected_disconnect",
            "timestamp": 1735818000
        }

        Args:
            topic: MQTT topic string
            payload: Parsed JSON payload dict

        Returns:
            True if processed successfully, False otherwise
        """
        try:
            payload = dict(payload)
            canonical = canonicalize_lwt(payload)
            payload = canonical.payload

            # Step 1: Parse topic
            parsed_topic = TopicBuilder.parse_lwt_topic(topic)
            if not parsed_topic:
                logger.error(
                    f"[{ValidationErrorCode.MISSING_REQUIRED_FIELD}] "
                    f"Failed to parse LWT topic: {topic}"
                )
                return False

            esp_id_str = parsed_topic["esp_id"]

            logger.warning(
                f"LWT received: ESP {esp_id_str} disconnected unexpectedly "
                f"(reason: {payload.get('reason', 'unknown')})"
            )
            increment_disconnect_reason(str(payload.get("reason", "unexpected_disconnect")))
            if canonical.is_contract_violation:
                logger.warning(
                    "LWT contract violation normalized: %s (raw=%s)",
                    canonical.contract_reason,
                    canonical.raw_fields,
                )

            # Step 2: Validate payload (minimal validation - LWT is broker-generated)
            if "status" not in payload:
                logger.warning(f"LWT payload missing 'status' field, assuming offline: {payload}")

            # Step 3: Update database
            async with resilient_session() as session:
                esp_repo = ESPRepository(session)
                contract_repo = CommandContractRepository(session)

                # Step 4: Lookup ESP device
                esp_device = await esp_repo.get_by_device_id(esp_id_str)

                if not esp_device:
                    # Device not registered - log but don't fail
                    # This can happen if device was deleted while still connected
                    logger.warning(
                        f"[{ConfigErrorCode.ESP_DEVICE_NOT_FOUND}] "
                        f"LWT for unknown device {esp_id_str} - ignoring"
                    )
                    return True  # Return True to acknowledge message

                # Step 5: Update device status to offline
                # Only update if currently online (avoid duplicate updates)
                if esp_device.status == "online":
                    authority_key = self._build_terminal_authority_key(
                        esp_id=esp_id_str,
                        reason=str(payload.get("reason", "unexpected_disconnect")),
                        correlation_id=payload.get("correlation_id"),
                        payload=payload,
                    )
                    _, was_stale = await contract_repo.upsert_terminal_event_authority(
                        event_class="lwt",
                        dedup_key=authority_key,
                        esp_id=esp_id_str,
                        outcome="offline",
                        correlation_id=payload.get("correlation_id"),
                        is_final=True,
                        code="LWT_DISCONNECT",
                        reason=str(payload.get("reason", "unexpected_disconnect")),
                        retryable=False,
                        generation=payload.get("generation"),
                        seq=payload.get("seq"),
                        payload_ts=payload.get("timestamp"),
                    )
                    if was_stale:
                        increment_contract_terminalization_blocked(
                            event_class="lwt",
                            reason="terminal_authority_guard",
                        )
                        logger.info(
                            "Skipping stale LWT due to terminal authority guard: esp_id=%s key=%s",
                            esp_id_str,
                            authority_key,
                        )
                        return True

                    await esp_repo.update_status(esp_id_str, "offline")
                    # Offline resets reconnect handover lifecycle for this ESP.
                    adoption_service = get_state_adoption_service()
                    await adoption_service.clear_cycle(esp_id_str)

                    # Reset actuator states to idle for offline device
                    reset_count = 0
                    try:
                        actuator_repo = ActuatorRepository(session)
                        # Capture active actuators BEFORE reset for history logging (Fix L2)
                        active_actuators = await actuator_repo.get_active_actuators_for_device(
                            esp_device.id
                        )
                        reset_count = await actuator_repo.reset_states_for_device(
                            esp_id=esp_device.id,
                            new_state="off",
                            reason="lwt_disconnect",
                        )
                        if reset_count > 0:
                            logger.info(
                                f"[LWT] Reset {reset_count} actuator state(s) to idle "
                                f"for disconnected device {esp_id_str}"
                            )
                        # Log history entry for each actuator that was reset (Fix L2)
                        now = datetime.now(timezone.utc)
                        for actuator_state in active_actuators:
                            await actuator_repo.log_command(
                                esp_id=esp_device.id,
                                gpio=actuator_state.gpio,
                                actuator_type=actuator_state.actuator_type,
                                command_type="OFF",
                                value=0.0,
                                success=True,
                                issued_by="system:lwt_disconnect",
                                error_message=(
                                    f"Auto-reset: Device offline (LWT). "
                                    f"Previous state: {actuator_state.state}"
                                ),
                                timestamp=now,
                                metadata={
                                    "trigger": "lwt_disconnect",
                                    "previous_state": actuator_state.state,
                                    "previous_value": actuator_state.current_value,
                                },
                            )
                            logger.info(
                                "Actuator history logged",
                                extra={
                                    "esp_id": str(esp_device.id),
                                    "gpio": actuator_state.gpio,
                                    "command_type": "OFF",
                                    "issued_by": "system:lwt_disconnect",
                                    "trigger": "lwt_disconnect",
                                },
                            )
                    except Exception as reset_err:
                        logger.warning(
                            f"[LWT] Failed to reset actuator states for {esp_id_str}: {reset_err}"
                        )

                    # Update device_metadata with disconnect reason
                    device_metadata = esp_device.device_metadata or {}
                    device_metadata["last_disconnect"] = {
                        "reason": payload.get("reason", "unexpected_disconnect"),
                        "raw_reason": canonical.raw_fields.get("raw_reason"),
                        "timestamp": payload.get(
                            "timestamp", int(datetime.now(timezone.utc).timestamp())
                        ),
                        "source": "lwt",
                        "contract_violation": canonical.is_contract_violation,
                        "contract_code": canonical.contract_code,
                        "contract_reason": canonical.contract_reason,
                    }
                    esp_device.device_metadata = device_metadata

                    # Audit Logging: lwt_received
                    try:
                        audit_repo = AuditLogRepository(session)
                        await audit_repo.log_device_event(
                            esp_id=esp_id_str,
                            event_type=AuditEventType.LWT_RECEIVED,
                            status="success",
                            message=f"Last Will Testament received - device disconnected unexpectedly",
                            details={
                                "reason": payload.get("reason", "unexpected_disconnect"),
                                "raw_reason": canonical.raw_fields.get("raw_reason"),
                                "contract_violation": canonical.is_contract_violation,
                                "contract_code": canonical.contract_code,
                                "contract_reason": canonical.contract_reason,
                                "lwt_timestamp": payload.get("timestamp"),
                                "last_seen": (
                                    esp_device.last_seen.isoformat()
                                    if esp_device.last_seen
                                    else None
                                ),
                            },
                            severity=AuditSeverity.WARNING,
                        )
                    except Exception as audit_error:
                        logger.warning(f"Failed to audit log lwt_received: {audit_error}")

                    await session.commit()

                    logger.info(f"Device {esp_id_str} marked offline via LWT")

                    # Step 6: WebSocket Broadcast for instant UI update
                    try:
                        from ...websocket.manager import WebSocketManager

                        ws_manager = await WebSocketManager.get_instance()
                        broadcast_payload = serialize_esp_health_event(
                            esp_id=esp_id_str,
                            status="offline",
                            reason=payload.get("reason", "unexpected_disconnect"),
                            source="lwt",
                            timestamp=payload.get(
                                "timestamp",
                                int(datetime.now(timezone.utc).timestamp()),
                            ),
                            actuator_states_reset=reset_count,
                        )
                        broadcast_payload["raw_reason"] = canonical.raw_fields.get("raw_reason")
                        broadcast_payload["contract_violation"] = canonical.is_contract_violation
                        broadcast_payload["contract_code"] = canonical.contract_code
                        broadcast_payload["contract_reason"] = canonical.contract_reason
                        await ws_manager.broadcast(
                            "esp_health",
                            broadcast_payload,
                        )
                        logger.debug(f"Broadcast esp_health offline event for {esp_id_str}")
                    except Exception as e:
                        logger.warning(f"Failed to broadcast LWT event via WebSocket: {e}")

                else:
                    logger.debug(f"Device {esp_id_str} already offline, LWT ignored")

                return True

        except Exception as e:
            logger.error(
                f"Error handling LWT: {e}",
                exc_info=True,
            )
            return False

    @staticmethod
    def _build_terminal_authority_key(
        *,
        esp_id: str,
        reason: str,
        correlation_id: Optional[str],
        payload: dict,
    ) -> str:
        """Build stable dedup key for terminal LWT events."""
        if correlation_id:
            return f"corr:{str(correlation_id).strip().lower()}"
        ts_part = str(payload.get("timestamp", "na"))
        return f"esp:{esp_id.strip().lower()}:reason:{reason.strip().lower()}:ts:{ts_part}"


# Global handler instance
_lwt_handler_instance: Optional[LWTHandler] = None


def get_lwt_handler() -> LWTHandler:
    """Get singleton LWT handler instance."""
    global _lwt_handler_instance
    if _lwt_handler_instance is None:
        _lwt_handler_instance = LWTHandler()
    return _lwt_handler_instance


async def handle_lwt(topic: str, payload: dict) -> bool:
    """
    Handle LWT message (convenience function).

    Args:
        topic: MQTT topic string
        payload: Parsed JSON payload dict

    Returns:
        True if message processed successfully
    """
    handler = get_lwt_handler()
    return await handler.handle_lwt(topic, payload)
