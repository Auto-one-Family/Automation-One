"""
MQTT Handler: Device Heartbeat Messages

Processes heartbeat messages from ESP32 devices:
- Updates device status (online/offline)
- Tracks last_seen timestamp
- Logs device health metrics (with structured error codes)
- Detects stale connections
- AUTO-DISCOVERY: Automatically registers unknown ESP devices

Note: Heartbeat is the primary discovery mechanism.
ESP32 sends initial heartbeat on startup for registration.
Separate discovery topic (kaiser/god/discovery/esp32_nodes) is deprecated.

Error Codes:
- Uses ValidationErrorCode for payload validation errors
- Uses ConfigErrorCode for ESP device lookup errors
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

import json
import time as time_module

from ...core.error_codes import (
    ValidationErrorCode,
)
from ...core.logging_config import get_logger
from ...core.metrics import update_esp_heartbeat_timestamp, update_esp_boot_count
from ...core import constants
from ...db.models.audit_log import AuditEventType, AuditSeverity
from ...db.models.enums import DataSource
from ...db.models.esp import ESPDevice
from ...db.repositories import ESPRepository, ESPHeartbeatRepository
from ...db.repositories.actuator_repo import ActuatorRepository
from ...db.repositories.audit_log_repo import AuditLogRepository
from ...db.session import resilient_session
from ..topics import TopicBuilder

logger = get_logger(__name__)

# Heartbeat timeout: device considered offline after 5 minutes
HEARTBEAT_TIMEOUT_SECONDS = 300

# Full-State-Push: Reconnect threshold (seconds offline before triggering)
RECONNECT_THRESHOLD_SECONDS = 60
# Full-State-Push: Cooldown between pushes (prevent rapid-fire on boot)
STATE_PUSH_COOLDOWN_SECONDS = 120

# Config-Push: Cooldown between auto config pushes (prevent mismatch loop)
CONFIG_PUSH_COOLDOWN_SECONDS = 120

# Module-level MQTTCommandBridge reference (set via set_command_bridge())
_command_bridge = None


def set_command_bridge(bridge) -> None:
    """Set the MQTTCommandBridge for ACK-driven Full-State-Push on reconnect."""
    global _command_bridge
    _command_bridge = bridge


class HeartbeatHandler:
    """
    Handles incoming heartbeat messages from ESP32 devices.

    Flow:
    1. Parse topic → extract esp_id
    2. Validate payload structure
    3. Check if ESP exists in DB
    4. If NOT: Auto-register (Discovery via Heartbeat)
    5. Update ESP device status to "online"
    6. Update last_seen timestamp and metadata
    7. Log health metrics
    """

    async def handle_heartbeat(self, topic: str, payload: dict) -> bool:
        """
        Handle heartbeat message with auto-discovery.

        Expected topic: kaiser/god/esp/{esp_id}/system/heartbeat

        Expected payload (from ESP32):
        {
            "esp_id": "ESP_12AB34CD",
            "zone_id": "zone_main",
            "master_zone_id": "master",
            "zone_assigned": true,
            "ts": 1735818000,
            "uptime": 123456,
            "heap_free": 45000,
            "wifi_rssi": -45,
            "sensor_count": 3,
            "actuator_count": 2
        }

        Args:
            topic: MQTT topic string
            payload: Parsed JSON payload dict

        Returns:
            True if message processed successfully, False otherwise
        """
        try:
            # Step 1: Parse topic
            parsed_topic = TopicBuilder.parse_heartbeat_topic(topic)
            if not parsed_topic:
                logger.error(
                    f"[{ValidationErrorCode.MISSING_REQUIRED_FIELD}] "
                    f"Failed to parse heartbeat topic: {topic}"
                )
                return False

            esp_id_str = parsed_topic["esp_id"]

            logger.debug(f"Processing heartbeat: esp_id={esp_id_str}")

            # Step 2: Validate payload
            validation_result = self._validate_payload(payload)
            if not validation_result["valid"]:
                error_code = validation_result.get(
                    "error_code", ValidationErrorCode.MISSING_REQUIRED_FIELD
                )
                logger.error(
                    f"[{error_code}] Invalid heartbeat payload from {esp_id_str}: "
                    f"{validation_result['error']}"
                )
                return False

            # Step 3: Get database session and repositories
            async with resilient_session() as session:
                esp_repo = ESPRepository(session)

                # Step 4: Lookup ESP device
                esp_device = await esp_repo.get_by_device_id(esp_id_str)

                if not esp_device:
                    # ============================================
                    # NEW DEVICE: Auto-Discovery
                    # ============================================
                    esp_device, status_msg = await self._discover_new_device(
                        session, esp_repo, esp_id_str, payload
                    )
                    if not esp_device:
                        # Rate limited - silently ignore
                        logger.debug(f"Discovery rate limited for {esp_id_str}: {status_msg}")
                        return True  # Don't log as error

                    # Broadcast discovery event (pass esp_device for hardware_type etc.)
                    await self._broadcast_device_discovered(esp_id_str, payload, esp_device)
                    await session.commit()

                    # Phase 2: ACK with pending_approval status
                    await self._send_heartbeat_ack(
                        esp_id=esp_id_str, status="pending_approval", config_available=False
                    )
                    return True

                # ============================================
                # EXISTING DEVICE: Status-based processing
                # ============================================
                status = esp_device.status

                # T13-Phase3: Reconnect detection — BEFORE update_status() overwrites last_seen
                is_reconnect = False
                if isinstance(esp_device.last_seen, datetime):
                    offline_seconds = (
                        datetime.now(timezone.utc) - esp_device.last_seen
                    ).total_seconds()
                    is_reconnect = offline_seconds > RECONNECT_THRESHOLD_SECONDS

                if status == "rejected":
                    # Check cooldown before rediscovery
                    if await self._check_rejection_cooldown(esp_device):
                        await self._rediscover_device(esp_device, payload, session)
                        await self._broadcast_device_rediscovered(esp_id_str, payload)
                        await session.commit()
                        return True
                    else:
                        # Still in cooldown - notify ESP of rejection
                        logger.debug(f"Rejected device {esp_id_str} in cooldown, ignoring")

                        # Phase 2: ACK - ESP knows it's rejected
                        await self._send_heartbeat_ack(
                            esp_id=esp_id_str, status="rejected", config_available=False
                        )
                        return True

                if status == "pending_approval":
                    # Update heartbeat count but don't process normally
                    await self._update_pending_heartbeat(esp_device, payload)
                    await session.commit()
                    logger.debug(f"Pending device {esp_id_str} heartbeat recorded")

                    # Phase 2: ACK - ESP knows it's still pending
                    await self._send_heartbeat_ack(
                        esp_id=esp_id_str, status="pending_approval", config_available=False
                    )
                    return True

                if status == "approved":
                    # First heartbeat after approval -> set to online
                    esp_device.status = "online"
                    logger.info(f"✅ Device {esp_id_str} now online after approval")

                    # Audit Logging: device_online (status change approved → online)
                    try:
                        audit_repo = AuditLogRepository(session)
                        await audit_repo.log_device_event(
                            esp_id=esp_id_str,
                            event_type=AuditEventType.DEVICE_ONLINE,
                            status="success",
                            message=f"Device came online after admin approval",
                            details={
                                "previous_status": "approved",
                                "heap_free": payload.get("heap_free", payload.get("free_heap")),
                                "wifi_rssi": payload.get("wifi_rssi"),
                                "uptime": payload.get("uptime"),
                            },
                            severity=AuditSeverity.INFO,
                        )
                    except Exception as audit_error:
                        logger.warning(f"Failed to audit log device_online: {audit_error}")

                # Step 5: Update device status and last_seen (for online/approved devices)
                # BUG-06 fix: ts<=0 (Wokwi without NTP) → use server timestamp
                ts_raw = payload["ts"]
                if ts_raw is None or ts_raw <= 0:
                    last_seen = datetime.now(timezone.utc)
                else:
                    ts_value = ts_raw / 1000 if ts_raw > 1e10 else ts_raw
                    last_seen = datetime.fromtimestamp(ts_value, tz=timezone.utc)
                await esp_repo.update_status(esp_id_str, "online", last_seen)

                # Step 5b: Clear stale retained LWT message from broker
                # After ESP reconnects, the broker still holds the retained
                # offline LWT message. Publishing empty payload with retain=True
                # clears it, preventing new subscribers from receiving stale
                # offline status.
                try:
                    from ..client import MQTTClient

                    lwt_topic = TopicBuilder.build_lwt_topic(esp_id_str)
                    mqtt_client = MQTTClient.get_instance()
                    mqtt_client.publish(lwt_topic, "", qos=1, retain=True)
                    logger.debug(f"Cleared retained LWT message for {esp_id_str}")
                except Exception as lwt_clear_error:
                    logger.warning(
                        f"Failed to clear retained LWT for {esp_id_str}: {lwt_clear_error}"
                    )

                # Step 6: Update metadata with latest heartbeat info
                await self._update_esp_metadata(esp_device, payload, session, is_reconnect)

                # Step 7: Log health metrics
                self._log_health_metrics(esp_id_str, payload)

                # Commit transaction
                await session.commit()

                # T13-Phase3: Fire Full-State-Push as background task after commit
                if is_reconnect and esp_device.zone_id and _command_bridge:
                    import asyncio

                    asyncio.create_task(
                        self._handle_reconnect_state_push(esp_device.device_id)
                    )

                # Update Prometheus metrics for Grafana alerting
                update_esp_heartbeat_timestamp(esp_id_str)
                boot_count = payload.get("boot_count")
                if boot_count is not None:
                    update_esp_boot_count(esp_id_str, int(boot_count))

                # ============================================
                # HEARTBEAT HISTORY LOGGING (Time-Series)
                # ============================================
                # Non-blocking: Errors are logged but don't fail the handler
                device_source = self._detect_device_source(esp_device, payload)
                try:
                    heartbeat_repo = ESPHeartbeatRepository(session)
                    await heartbeat_repo.log_heartbeat(
                        esp_uuid=esp_device.id,
                        device_id=esp_id_str,
                        payload=payload,
                        data_source=device_source,
                    )
                    await session.commit()
                except Exception as hb_log_error:
                    logger.warning(
                        f"Failed to log heartbeat history for {esp_id_str}: {hb_log_error}"
                    )
                    # Rollback partial history insert to keep session clean for subsequent ops
                    await session.rollback()

                source_indicator = (
                    f"[{device_source.upper()}]"
                    if device_source != DataSource.PRODUCTION.value
                    else ""
                )

                logger.debug(
                    f"Heartbeat processed{source_indicator}: esp_id={esp_id_str}, "
                    f"uptime={payload.get('uptime')}s, "
                    f"heap_free={payload.get('heap_free', payload.get('free_heap'))} bytes"
                )

                # WebSocket Broadcast
                try:
                    from ...websocket.manager import WebSocketManager

                    ws_manager = await WebSocketManager.get_instance()

                    # Build unified message (Server-Centric: Single Source of Truth)
                    # Same format as EventAggregatorService._transform_heartbeat_to_unified()
                    heap_free = payload.get("heap_free", payload.get("free_heap", 0))
                    heap_kb = heap_free // 1024 if heap_free else 0
                    wifi_rssi = payload.get("wifi_rssi", 0)
                    uptime = payload.get("uptime", 0)

                    ws_message = f"{esp_id_str} online ({heap_kb}KB frei, RSSI: {wifi_rssi}dBm)"
                    if uptime and uptime > 0:
                        hours = uptime // 3600
                        minutes = (uptime % 3600) // 60
                        if hours > 0:
                            ws_message += f" | Uptime: {hours}h {minutes}m"
                        elif minutes > 0:
                            ws_message += f" | Uptime: {minutes}m"

                    await ws_manager.broadcast(
                        "esp_health",
                        {
                            "esp_id": esp_id_str,
                            "status": "online",
                            "message": ws_message,  # Unified message for Frontend
                            "heap_free": heap_free,
                            "wifi_rssi": wifi_rssi,
                            "uptime": uptime,
                            "sensor_count": payload.get(
                                "sensor_count", payload.get("active_sensors", 0)
                            ),
                            "actuator_count": payload.get(
                                "actuator_count", payload.get("active_actuators", 0)
                            ),
                            "timestamp": payload.get("ts"),
                            # GPIO STATUS (Phase 1)
                            "gpio_status": payload.get("gpio_status", []),
                            "gpio_reserved_count": payload.get("gpio_reserved_count", 0),
                        },
                    )
                except Exception as e:
                    logger.warning(f"Failed to broadcast ESP health via WebSocket: {e}")

                # ============================================
                # Phase 2: Send Heartbeat-ACK to ESP
                # ============================================
                # Allows ESP to transition from PENDING_APPROVAL → OPERATIONAL
                # without requiring a reboot after admin approval
                # Check if ESP lost its config (e.g., after reboot)
                esp_sensor_count = payload.get("sensor_count", payload.get("active_sensors", 0))
                esp_actuator_count = payload.get(
                    "actuator_count", payload.get("active_actuators", 0)
                )
                config_pending = await self._has_pending_config(
                    esp_device, session, esp_sensor_count, esp_actuator_count
                )

                await self._send_heartbeat_ack(
                    esp_id=esp_id_str,
                    status="online",  # Device is now online
                    config_available=config_pending,
                )

                return True

        except Exception as e:
            logger.error(
                f"Error handling heartbeat: {e}",
                exc_info=True,
            )
            return False

        # If processing fell through without explicit return, treat as failure
        return False

    async def _auto_register_esp(
        self, session, esp_repo: ESPRepository, esp_id: str, payload: dict
    ) -> Optional[ESPDevice]:
        """
        Auto-register a new ESP device from heartbeat data with pending_approval status.

        This implements "Discovery via Heartbeat" - ESP32 sends initial
        heartbeat on startup, server auto-registers as pending_approval.

        The device must be approved by an administrator before it can
        operate normally. This ensures security in industrial environments.

        Args:
            session: Database session
            esp_repo: ESP repository
            esp_id: ESP device ID
            payload: Heartbeat payload

        Returns:
            Created ESPDevice or None on failure
        """
        try:
            # Extract available info from heartbeat
            zone_id = payload.get("zone_id", "")
            master_zone_id = payload.get("master_zone_id", "")
            zone_assigned = payload.get("zone_assigned", False)

            # Detect mock devices by ID prefix — mocks skip approval gate
            is_mock = esp_id.startswith("MOCK_") or esp_id.startswith("ESP_MOCK_")
            if is_mock:
                hardware_type = "MOCK_ESP32"
                device_status = "online"
            else:
                hardware_type = payload.get("hardware_type", "ESP32_WROOM")
                device_status = "pending_approval"

            # Create new ESP device
            new_esp = ESPDevice(
                device_id=esp_id,
                hardware_type=hardware_type,
                status=device_status,
                discovered_at=datetime.now(timezone.utc),  # Audit field
                kaiser_id=constants.get_kaiser_id(),  # WP2-Fix1: Default kaiser_id from config
                ip_address=payload.get("wifi_ip"),  # IP from heartbeat (if ESP sends it)
                capabilities={
                    "max_sensors": 20,  # Default for ESP32_WROOM
                    "max_actuators": 12,
                    "features": ["heartbeat", "sensors", "actuators"],
                },
                device_metadata={
                    "discovery_source": "heartbeat",
                    "initial_heartbeat": payload,
                    "heartbeat_count": 1,
                    "zone_id": zone_id,
                    "master_zone_id": master_zone_id,
                    "zone_assigned": zone_assigned,
                    "initial_heap_free": payload.get("heap_free", payload.get("free_heap")),
                    "initial_wifi_rssi": payload.get("wifi_rssi"),
                },
                last_seen=datetime.now(timezone.utc),
            )

            session.add(new_esp)
            await session.flush()  # Get ID without committing

            logger.info(
                f"🔔 New ESP discovered: {esp_id} "
                f"(hardware_type={hardware_type}, status={device_status}) "
                f"(Zone: {zone_id or 'unassigned'}, "
                f"Sensors: {payload.get('sensor_count', 0)}, "
                f"Actuators: {payload.get('actuator_count', 0)})"
            )

            return new_esp

        except Exception as e:
            logger.error(f"Error auto-registering ESP {esp_id}: {e}", exc_info=True)
            return None

    # =========================================================================
    # Discovery/Approval Helper Methods
    # =========================================================================

    async def _discover_new_device(
        self, session, esp_repo: ESPRepository, esp_id: str, payload: dict
    ) -> tuple[Optional[ESPDevice], str]:
        """
        Discover new device with rate limiting.

        Args:
            session: Database session
            esp_repo: ESP repository
            esp_id: ESP device ID
            payload: Heartbeat payload

        Returns:
            Tuple of (device, status_message)
        """
        from ...services.esp_service import _discovery_rate_limiter

        # Check rate limits
        allowed, reason = _discovery_rate_limiter.can_discover(esp_id)
        if not allowed:
            return None, reason

        # Create pending device
        new_esp = await self._auto_register_esp(session, esp_repo, esp_id, payload)
        if new_esp:
            _discovery_rate_limiter.record_discovery(esp_id)

            # Audit Logging: device_discovered
            try:
                audit_repo = AuditLogRepository(session)
                await audit_repo.log_device_event(
                    esp_id=esp_id,
                    event_type=AuditEventType.DEVICE_DISCOVERED,
                    status="success",
                    message=f"New ESP device discovered via heartbeat",
                    details={
                        "zone_id": payload.get("zone_id"),
                        "heap_free": payload.get("heap_free", payload.get("free_heap")),
                        "wifi_rssi": payload.get("wifi_rssi"),
                        "sensor_count": payload.get("sensor_count", 0),
                        "actuator_count": payload.get("actuator_count", 0),
                    },
                    severity=AuditSeverity.INFO,
                )
            except Exception as audit_error:
                logger.warning(f"Failed to audit log device_discovered: {audit_error}")

        return new_esp, "discovered"

    async def _check_rejection_cooldown(
        self, esp_device: ESPDevice, cooldown_seconds: int = 300
    ) -> bool:
        """
        Check if rejection cooldown has expired.

        Args:
            esp_device: ESP device model
            cooldown_seconds: Cooldown period in seconds (default 5 minutes)

        Returns:
            True if cooldown expired (can rediscover), False otherwise
        """
        if not esp_device.last_rejection_at:
            return True

        last_rejection = esp_device.last_rejection_at
        if last_rejection.tzinfo is None:
            last_rejection = last_rejection.replace(tzinfo=timezone.utc)

        cooldown = timedelta(seconds=cooldown_seconds)
        return (datetime.now(timezone.utc) - last_rejection) >= cooldown

    async def _rediscover_device(self, esp_device: ESPDevice, payload: dict, session) -> None:
        """
        Rediscover a previously rejected device.

        Args:
            esp_device: ESP device model
            payload: Heartbeat payload
            session: Database session
        """
        old_status = esp_device.status
        esp_device.status = "pending_approval"
        esp_device.rejection_reason = None

        metadata = esp_device.device_metadata or {}
        metadata["rediscovered_at"] = datetime.now(timezone.utc).isoformat()
        metadata["rediscovery_heartbeat"] = payload
        metadata["heartbeat_count"] = metadata.get("heartbeat_count", 0) + 1
        esp_device.device_metadata = metadata
        esp_device.last_seen = datetime.now(timezone.utc)
        # Update IP from rediscovery heartbeat (ESP may have new IP after WiFi reconnect)
        wifi_ip = payload.get("wifi_ip")
        if wifi_ip:
            esp_device.ip_address = wifi_ip

        logger.info(f"🔔 Device rediscovered: {esp_device.device_id} (pending_approval again)")

        # Audit Logging: device_rediscovered
        try:
            audit_repo = AuditLogRepository(session)
            await audit_repo.log_device_event(
                esp_id=esp_device.device_id,
                event_type=AuditEventType.DEVICE_REDISCOVERED,
                status="pending",
                message=f"Previously rejected device is sending heartbeats again",
                details={
                    "previous_status": old_status,
                    "zone_id": payload.get("zone_id"),
                    "heap_free": payload.get("heap_free", payload.get("free_heap")),
                    "wifi_rssi": payload.get("wifi_rssi"),
                },
                severity=AuditSeverity.WARNING,
            )
        except Exception as audit_error:
            logger.warning(f"Failed to audit log device_rediscovered: {audit_error}")

    async def _update_pending_heartbeat(self, esp_device: ESPDevice, payload: dict) -> None:
        """
        Update pending device heartbeat count and IP address.

        Args:
            esp_device: ESP device model
            payload: Heartbeat payload
        """
        metadata = esp_device.device_metadata or {}
        metadata["heartbeat_count"] = metadata.get("heartbeat_count", 0) + 1
        metadata["last_heartbeat"] = datetime.now(timezone.utc).isoformat()
        # Store latest metrics for REST /devices/pending (avoid stale initial_heartbeat)
        metadata["last_heap_free"] = payload.get("heap_free", payload.get("free_heap"))
        metadata["last_wifi_rssi"] = payload.get("wifi_rssi")
        metadata["last_sensor_count"] = payload.get("sensor_count", 0)
        metadata["last_actuator_count"] = payload.get("actuator_count", 0)
        esp_device.device_metadata = metadata
        esp_device.last_seen = datetime.now(timezone.utc)
        # Update IP address if provided (ESP sends wifi_ip in heartbeat)
        wifi_ip = payload.get("wifi_ip")
        if wifi_ip:
            esp_device.ip_address = wifi_ip

    async def _broadcast_device_discovered(
        self, esp_id: str, payload: dict, esp_device: Optional[ESPDevice] = None
    ) -> None:
        """
        Broadcast device_discovered WebSocket event.

        Args:
            esp_id: ESP device ID
            payload: Heartbeat payload
            esp_device: Newly created ESPDevice model (for hardware_type etc.)
        """
        try:
            from ...websocket.manager import WebSocketManager

            ws_manager = await WebSocketManager.get_instance()
            discovered_at = datetime.now(timezone.utc).isoformat()
            await ws_manager.broadcast(
                "device_discovered",
                {
                    "esp_id": esp_id,
                    "device_id": esp_id,  # Frontend expects device_id
                    "discovered_at": discovered_at,
                    "last_seen": discovered_at,  # Initially same as discovered_at
                    "zone_id": payload.get("zone_id"),
                    "heap_free": payload.get("heap_free", payload.get("free_heap")),
                    "wifi_rssi": payload.get("wifi_rssi"),
                    "sensor_count": payload.get("sensor_count", 0),
                    "actuator_count": payload.get("actuator_count", 0),
                    "hardware_type": (esp_device.hardware_type if esp_device else None)
                    or "ESP32_WROOM",
                    "ip_address": payload.get("wifi_ip"),  # ESP sends wifi_ip if available
                },
            )
            logger.info(f"📡 Broadcast device_discovered for {esp_id}")
        except Exception as e:
            logger.warning(f"Failed to broadcast device_discovered: {e}")

    async def _broadcast_device_rediscovered(self, esp_id: str, payload: dict) -> None:
        """
        Broadcast device_rediscovered WebSocket event.

        Args:
            esp_id: ESP device ID
            payload: Heartbeat payload
        """
        try:
            from ...websocket.manager import WebSocketManager

            ws_manager = await WebSocketManager.get_instance()
            await ws_manager.broadcast(
                "device_rediscovered",
                {
                    "esp_id": esp_id,
                    "device_id": esp_id,  # Frontend expects device_id
                    "rediscovered_at": datetime.now(timezone.utc).isoformat(),
                    "zone_id": payload.get("zone_id"),
                    "ip_address": payload.get("wifi_ip"),  # ESP sends wifi_ip in heartbeat
                },
            )
            logger.info(f"📡 Broadcast device_rediscovered for {esp_id}")
        except Exception as e:
            logger.warning(f"Failed to broadcast device_rediscovered: {e}")

    async def _update_esp_metadata(
        self, esp_device: ESPDevice, payload: dict, session, is_reconnect: bool = False,
    ) -> None:
        """
        Update ESP metadata with latest heartbeat information.

        Args:
            esp_device: ESP device model
            payload: Heartbeat payload
            session: Database session
            is_reconnect: True if ESP was offline >60s (Full-State-Push will handle resync)
        """
        try:
            # Update device_metadata with latest values
            current_metadata = esp_device.device_metadata or {}

            # Update zone info if provided
            if "zone_id" in payload:
                current_metadata["zone_id"] = payload["zone_id"]
            if "master_zone_id" in payload:
                current_metadata["master_zone_id"] = payload["master_zone_id"]
            if "zone_assigned" in payload:
                current_metadata["zone_assigned"] = payload["zone_assigned"]

            # WP7: Zone Mismatch Detection & Auto-Reassignment
            # Server is authoritative for zone assignment.
            # Two detection signals:
            #   1. zone_id string mismatch (ESP vs DB)
            #   2. zone_assigned: false flag in heartbeat (ESP lost NVS after reboot)
            heartbeat_zone_id = payload.get("zone_id", "")
            heartbeat_zone_assigned = payload.get("zone_assigned", True)
            db_zone_id = esp_device.zone_id or ""

            # Normalize: ESP sends "" for unassigned, DB uses None
            esp_has_zone = bool(heartbeat_zone_id)
            db_has_zone = bool(db_zone_id)

            # Detect zone loss: ESP explicitly reports zone_assigned=false
            # while server has a zone in DB (common after Wokwi/ESP reboot
            # where NVS is cleared)
            esp_lost_zone = not heartbeat_zone_assigned and db_has_zone

            if heartbeat_zone_id != db_zone_id or esp_lost_zone:
                # T13-Phase3: Reconnect detected — Full-State-Push handles resync
                if is_reconnect and db_has_zone:
                    logger.info(
                        "Zone mismatch for %s tolerated (reconnect state push pending)",
                        esp_device.device_id,
                    )
                # Check: Is a zone assignment currently pending? If so, tolerate mismatch.
                elif (pending := current_metadata.get("pending_zone_assignment")):
                    pending_target = (
                        pending.get("zone_id", "?")
                        if isinstance(pending, dict)
                        else str(pending)
                    )
                    logger.info(
                        "Zone mismatch for %s tolerated (pending assignment to %s)",
                        esp_device.device_id, pending_target,
                    )
                    # No warning, no resync — wait for ACK or timeout
                elif esp_has_zone and not db_has_zone:
                    # ESP has zone from NVS, Server has None
                    # This happens after: (1) Server restart, (2) failed zone removal
                    logger.info(
                        f"ZONE_MISMATCH [{esp_device.device_id}]: "
                        f"ESP reports zone_id='{heartbeat_zone_id}' but DB has zone_id=None. "
                        f"ESP may have stale zone from NVS. Consider re-sending zone removal."
                    )
                elif (not esp_has_zone and db_has_zone) or esp_lost_zone:
                    # Server has zone, ESP does not (or ESP explicitly reports zone_assigned=false)
                    # This happens after: (1) ESP reboot without persistent NVS (Wokwi),
                    # (2) ESP factory reset, (3) ESP NVS corruption
                    mismatch_reason = (
                        "zone_assigned=false"
                        if esp_lost_zone
                        else f"zone_id mismatch (ESP='{heartbeat_zone_id}', DB='{db_zone_id}')"
                    )
                    # Auto-resend zone/assign with rate-limiting
                    # Use 60s cooldown (not 300s) because zone loss after reboot
                    # should be resolved quickly for zone-based logic to work
                    zone_resync_cooldown_seconds = 60
                    last_resync = current_metadata.get("zone_resync_sent_at")
                    now_ts = int(time_module.time())
                    should_resync = True

                    if last_resync:
                        elapsed = now_ts - last_resync
                        if elapsed < zone_resync_cooldown_seconds:
                            should_resync = False
                            logger.debug(
                                "ZONE_MISMATCH [%s]: zone lost (%s), but resync cooldown active (%ds remaining)",
                                esp_device.device_id, mismatch_reason,
                                zone_resync_cooldown_seconds - elapsed,
                            )

                    if should_resync and esp_device.status == "offline":
                        should_resync = False
                        logger.debug(
                            "Skipping zone resync for offline ESP %s",
                            esp_device.device_id,
                        )

                    if should_resync:
                        logger.warning(
                            f"ZONE_MISMATCH [{esp_device.device_id}]: "
                            f"ESP lost zone config ({mismatch_reason}). "
                            f"DB has zone_id='{db_zone_id}'. Auto-reassigning zone."
                        )
                        try:
                            from ..client import MQTTClient

                            resync_topic = TopicBuilder.build_zone_assign_topic(
                                esp_device.device_id
                            )
                            resync_payload = {
                                "zone_id": db_zone_id,
                                "master_zone_id": esp_device.master_zone_id or "",
                                "zone_name": esp_device.zone_name or "",
                                "kaiser_id": esp_device.kaiser_id or constants.get_kaiser_id(),
                                "timestamp": now_ts,
                            }
                            mqtt_client = MQTTClient.get_instance()
                            mqtt_client.publish(
                                resync_topic,
                                json.dumps(resync_payload),
                                qos=1,
                            )
                            current_metadata["zone_resync_sent_at"] = now_ts
                            current_metadata["zone_resync_reason"] = mismatch_reason
                            logger.info(
                                f"Auto-reassigning zone '{db_zone_id}' to ESP {esp_device.device_id} "
                                f"(zone lost after reboot). Topic: {resync_topic}"
                            )

                            # For Mock-ESPs: also update the SimulationScheduler runtime
                            # so the next heartbeat sends zone_assigned=true, breaking
                            # the ZONE_MISMATCH loop (real ESPs handle this via NVS)
                            try:
                                from ...services.simulation import get_simulation_scheduler

                                sim_scheduler = get_simulation_scheduler()
                                if sim_scheduler.is_mock_active(esp_device.device_id):
                                    sim_scheduler.update_zone(
                                        esp_device.device_id,
                                        db_zone_id,
                                        esp_device.kaiser_id or constants.get_kaiser_id(),
                                    )
                                    logger.debug(
                                        f"Updated Mock-ESP runtime zone for {esp_device.device_id}"
                                    )
                            except Exception:
                                pass  # SimulationScheduler not initialized (no mock-ESP mode)
                        except Exception as resync_error:
                            logger.error(
                                f"Failed to resend zone assignment to "
                                f"{esp_device.device_id}: {resync_error}",
                                exc_info=True,
                            )
                else:
                    # Both have zone but different values
                    logger.info(
                        f"ZONE_MISMATCH [{esp_device.device_id}]: "
                        f"ESP reports zone_id='{heartbeat_zone_id}' but DB has zone_id='{db_zone_id}'. "
                        f"Zone assignment may be inconsistent."
                    )

            # Update health metrics
            current_metadata["last_heap_free"] = payload.get("heap_free", payload.get("free_heap"))
            current_metadata["last_wifi_rssi"] = payload.get("wifi_rssi")
            # Update IP address if provided (ESP may get new IP via DHCP lease renewal)
            wifi_ip = payload.get("wifi_ip")
            if wifi_ip:
                esp_device.ip_address = wifi_ip
            current_metadata["last_uptime"] = payload.get("uptime")
            current_metadata["last_sensor_count"] = payload.get(
                "sensor_count", payload.get("active_sensors", 0)
            )
            current_metadata["last_actuator_count"] = payload.get(
                "actuator_count", payload.get("active_actuators", 0)
            )
            current_metadata["last_heartbeat"] = datetime.now(timezone.utc).isoformat()

            # ============================================
            # GPIO STATUS (Phase 1) - With Pydantic Validation
            # ============================================
            if "gpio_status" in payload:
                validated_gpio_status = self._validate_gpio_status(
                    payload.get("gpio_status", []),
                    payload.get("gpio_reserved_count", 0),
                    esp_device.device_id,
                )
                if validated_gpio_status is not None:
                    current_metadata["gpio_status"] = validated_gpio_status["gpio_status"]
                    current_metadata["gpio_reserved_count"] = validated_gpio_status[
                        "gpio_reserved_count"
                    ]
                    current_metadata["gpio_status_updated_at"] = datetime.now(
                        timezone.utc
                    ).isoformat()
                    logger.debug(
                        f"GPIO status validated and updated for {esp_device.device_id}: "
                        f"{len(validated_gpio_status['gpio_status'])} reserved pins"
                    )
                else:
                    logger.warning(
                        f"GPIO status validation failed for {esp_device.device_id}, "
                        f"skipping GPIO metadata update"
                    )

            esp_device.device_metadata = current_metadata

        except (AttributeError, TypeError, KeyError) as e:
            # Structured data errors: log and roll back the in-progress metadata
            # changes so we never commit a partially-updated device_metadata blob.
            logger.error(
                f"Failed to update ESP metadata for {esp_device.device_id}: {e}",
                exc_info=True,
            )
            # Restore original metadata to avoid partial state commit
            esp_device.device_metadata = esp_device.device_metadata or {}
        except Exception as e:
            # Unexpected errors: same defensive rollback, re-raise so the caller
            # (handle_heartbeat) can decide whether the whole transaction should
            # be aborted.
            logger.error(
                f"Unexpected error updating ESP metadata for {esp_device.device_id}: {e}",
                exc_info=True,
            )
            esp_device.device_metadata = esp_device.device_metadata or {}
            raise

    def _validate_payload(self, payload: dict) -> dict:
        """
        Validate heartbeat payload structure.

        Required fields: ts, uptime, heap_free OR free_heap, wifi_rssi

        Args:
            payload: Payload dict to validate

        Returns:
            {"valid": bool, "error": str, "error_code": int}
        """
        # Check required fields (with alternatives for compatibility)
        if "ts" not in payload:
            return {
                "valid": False,
                "error": "Missing required field: ts",
                "error_code": ValidationErrorCode.MISSING_REQUIRED_FIELD,
            }

        if "uptime" not in payload:
            return {
                "valid": False,
                "error": "Missing required field: uptime",
                "error_code": ValidationErrorCode.MISSING_REQUIRED_FIELD,
            }

        # Accept both heap_free (ESP32) and free_heap (legacy)
        if "heap_free" not in payload and "free_heap" not in payload:
            return {
                "valid": False,
                "error": "Missing required field: heap_free or free_heap",
                "error_code": ValidationErrorCode.MISSING_REQUIRED_FIELD,
            }

        if "wifi_rssi" not in payload:
            return {
                "valid": False,
                "error": "Missing required field: wifi_rssi",
                "error_code": ValidationErrorCode.MISSING_REQUIRED_FIELD,
            }

        # Type validation
        if not isinstance(payload["ts"], int):
            return {
                "valid": False,
                "error": "Field 'ts' must be integer (Unix timestamp)",
                "error_code": ValidationErrorCode.FIELD_TYPE_MISMATCH,
            }

        if not isinstance(payload["uptime"], int):
            return {
                "valid": False,
                "error": "Field 'uptime' must be integer",
                "error_code": ValidationErrorCode.FIELD_TYPE_MISMATCH,
            }

        # Validate heap field (whichever is present)
        heap_value = payload.get("heap_free", payload.get("free_heap"))
        if not isinstance(heap_value, int):
            return {
                "valid": False,
                "error": "Field 'heap_free/free_heap' must be integer",
                "error_code": ValidationErrorCode.FIELD_TYPE_MISMATCH,
            }

        if not isinstance(payload["wifi_rssi"], int):
            return {
                "valid": False,
                "error": "Field 'wifi_rssi' must be integer",
                "error_code": ValidationErrorCode.FIELD_TYPE_MISMATCH,
            }

        return {"valid": True, "error": "", "error_code": ValidationErrorCode.NONE}

    def _detect_device_source(self, esp_device: ESPDevice, payload: dict) -> str:
        """
        Detect the device source for logging purposes.

        Detection priority:
        1. Explicit _source field in payload → use value
        2. Device hardware_type == "MOCK_ESP32" → MOCK
        3. Device capabilities.mock == True → MOCK
        4. ESP ID starts with "MOCK_" or "ESP_MOCK" → MOCK
        5. ESP ID starts with "TEST_" → TEST
        6. ESP ID starts with "SIM_" → SIMULATION
        7. Default → PRODUCTION

        Args:
            esp_device: ESPDevice instance
            payload: MQTT payload dict

        Returns:
            Data source string value
        """
        esp_id = esp_device.device_id or "unknown"
        detection_reason = None

        # Priority 1: Explicit source field
        if "_source" in payload:
            source_value = payload["_source"].lower()
            try:
                result = DataSource(source_value).value
                detection_reason = f"payload._source='{source_value}'"
                logger.debug(
                    f"DeviceSource detection [{esp_id}]: {result} (reason: {detection_reason})"
                )
                return result
            except ValueError:
                return DataSource.PRODUCTION.value

        # Priority 2: Device hardware_type
        if esp_device.hardware_type == "MOCK_ESP32":
            detection_reason = "esp_device.hardware_type='MOCK_ESP32'"
            result = DataSource.MOCK.value
            logger.debug(
                f"DeviceSource detection [{esp_id}]: {result} (reason: {detection_reason})"
            )
            return result

        # Priority 3: Device capabilities flag
        if esp_device.capabilities and esp_device.capabilities.get("mock"):
            detection_reason = "esp_device.capabilities.mock=True"
            result = DataSource.MOCK.value
            logger.debug(
                f"DeviceSource detection [{esp_id}]: {result} (reason: {detection_reason})"
            )
            return result

        # Priority 4-6: ESP ID prefix detection
        if esp_id.startswith("MOCK_") or esp_id.startswith("ESP_MOCK"):
            detection_reason = f"esp_id prefix 'MOCK_' or 'ESP_MOCK'"
            result = DataSource.MOCK.value
            logger.debug(
                f"DeviceSource detection [{esp_id}]: {result} (reason: {detection_reason})"
            )
            return result
        if esp_id.startswith("TEST_"):
            detection_reason = f"esp_id prefix 'TEST_'"
            result = DataSource.TEST.value
            logger.debug(
                f"DeviceSource detection [{esp_id}]: {result} (reason: {detection_reason})"
            )
            return result
        if esp_id.startswith("SIM_"):
            detection_reason = f"esp_id prefix 'SIM_'"
            result = DataSource.SIMULATION.value
            logger.debug(
                f"DeviceSource detection [{esp_id}]: {result} (reason: {detection_reason})"
            )
            return result

        # Default
        detection_reason = "default (no matching criteria)"
        result = DataSource.PRODUCTION.value
        logger.debug(f"DeviceSource detection [{esp_id}]: {result} (reason: {detection_reason})")
        return result

    def _validate_gpio_status(
        self, gpio_status: list, gpio_reserved_count: int, device_id: str
    ) -> Optional[dict]:
        """
        Validate GPIO status data using Pydantic models.

        Ensures data integrity before storing in database.
        Returns validated data dict or None on validation failure.

        Args:
            gpio_status: Raw GPIO status list from payload
            gpio_reserved_count: Reported count from payload
            device_id: ESP device ID for logging

        Returns:
            Dict with validated gpio_status and gpio_reserved_count, or None on error
        """
        try:
            from ...schemas.esp import GpioStatusItem
            from pydantic import ValidationError

            # Validate each GPIO status item
            validated_items = []
            for idx, item in enumerate(gpio_status):
                try:
                    validated_item = GpioStatusItem(**item)
                    validated_items.append(validated_item.model_dump())
                except ValidationError as e:
                    logger.warning(f"GPIO status item {idx} validation failed for {device_id}: {e}")
                    # Skip invalid items but continue processing
                    continue

            # Log count mismatch but don't reject
            # Bus-GPIOs (I2C SDA/SCL, OneWire) may cause validation mismatches —
            # only warn if mismatch exceeds the number of bus-GPIOs in the raw input
            mismatch = abs(gpio_reserved_count - len(validated_items))
            if mismatch > 0:
                bus_gpio_count = sum(
                    1
                    for g in gpio_status
                    if isinstance(g, dict) and str(g.get("owner", "")).startswith("bus/")
                )
                if mismatch > bus_gpio_count:
                    logger.warning(
                        f"GPIO count mismatch for {device_id}: "
                        f"reported={gpio_reserved_count}, validated={len(validated_items)}, "
                        f"bus_gpios={bus_gpio_count}"
                    )
                else:
                    logger.debug(
                        f"GPIO count minor mismatch for {device_id}: "
                        f"reported={gpio_reserved_count}, validated={len(validated_items)}, "
                        f"bus_gpios={bus_gpio_count}"
                    )

            # Return validated items as dicts (already converted via model_dump)
            return {"gpio_status": validated_items, "gpio_reserved_count": len(validated_items)}

        except ImportError as e:
            logger.error(
                f"Failed to import GPIO schemas for {device_id}: {e}. "
                f"GPIO status will be skipped to avoid storing unvalidated data."
            )
            # Return None (not raw data) so the caller skips the metadata update
            # rather than persisting unvalidated GPIO status into the database.
            return None
        except Exception as e:
            logger.error(
                f"Unexpected error validating GPIO status for {device_id}: {e}", exc_info=True
            )
            return None

    def _log_health_metrics(self, esp_id: str, payload: dict):
        """
        Log device health metrics.

        Args:
            esp_id: ESP device ID string
            payload: Heartbeat payload with metrics
        """
        uptime = payload.get("uptime", 0)
        # Accept both heap_free (ESP32) and free_heap (legacy)
        free_heap = payload.get("heap_free", payload.get("free_heap", 0))
        wifi_rssi = payload.get("wifi_rssi", 0)
        error_count = payload.get("error_count", 0)
        # Accept both sensor_count (ESP32) and active_sensors (legacy)
        active_sensors = payload.get("sensor_count", payload.get("active_sensors", 0))
        # Accept both actuator_count (ESP32) and active_actuators (legacy)
        active_actuators = payload.get("actuator_count", payload.get("active_actuators", 0))

        # Check for low memory
        if free_heap < 10000:  # Less than 10KB free
            logger.warning(f"Low memory on {esp_id}: heap_free={free_heap} bytes")

        # Check for weak WiFi signal
        if wifi_rssi < -70:  # Weak signal
            logger.warning(f"Weak WiFi signal on {esp_id}: rssi={wifi_rssi} dBm")

        # Check for errors
        if error_count > 0:
            logger.warning(f"Device {esp_id} reported {error_count} error(s)")

        logger.debug(
            f"Health metrics for {esp_id}: "
            f"uptime={uptime}s, free_heap={free_heap}B, rssi={wifi_rssi}dBm, "
            f"sensors={active_sensors}, actuators={active_actuators}, errors={error_count}"
        )

    async def _send_heartbeat_ack(
        self, esp_id: str, status: str, config_available: bool = False
    ) -> bool:
        """
        Send heartbeat ACK to ESP device (Phase 2: Bidirectional Approval).

        Sends device approval status back to ESP after each heartbeat.
        This allows ESP to transition from PENDING_APPROVAL → OPERATIONAL
        without requiring a reboot after admin approval.

        Fire-and-Forget Pattern:
        - ESP does NOT block waiting for this ACK
        - QoS 0 (at most once) - not critical if missed
        - Next heartbeat will trigger another ACK

        Args:
            esp_id: ESP device ID (e.g., "ESP_12AB34CD")
            status: Current device status from DB
                    ("pending_approval", "approved", "online", "offline", "rejected")
            config_available: True if server has pending config for this device

        Returns:
            True if publish successful, False otherwise
        """
        try:
            # Import MQTTClient only when needed (avoid circular imports)
            from ..client import MQTTClient

            # Build ACK topic
            topic = TopicBuilder.build_heartbeat_ack_topic(esp_id)

            # Build payload
            payload = {
                "status": status,
                "config_available": config_available,
                "server_time": int(time_module.time()),
            }

            # Get MQTT client instance
            mqtt_client = MQTTClient.get_instance()

            # Publish with QoS 0 (fire-and-forget, not critical)
            success = mqtt_client.publish(topic, json.dumps(payload), qos=0)

            if success:
                logger.debug(f"Heartbeat ACK sent to {esp_id}: status={status}")
            else:
                # Not critical - ESP will receive next ACK on next heartbeat
                logger.warning(f"Failed to send heartbeat ACK to {esp_id}")

            return success

        except Exception as e:
            # Not critical - don't fail the heartbeat handler
            logger.warning(f"Error sending heartbeat ACK to {esp_id}: {e}")
            return False

    async def _has_pending_config(
        self,
        esp_device: ESPDevice,
        session,
        esp_sensor_count: int = 0,
        esp_actuator_count: int = 0,
    ) -> bool:
        """
        Check if server has unsent configuration for this ESP.

        Detects config loss after ESP reboot by comparing the sensor/actuator
        counts reported in the heartbeat against the DB. If the ESP reports 0
        but the DB has configs, triggers an automatic config push.

        Args:
            esp_device: ESPDevice instance
            session: Active DB session
            esp_sensor_count: sensor_count from heartbeat payload
            esp_actuator_count: actuator_count from heartbeat payload

        Returns:
            True if there is pending configuration, False otherwise
        """
        try:
            # Skip config push to offline ESPs
            if esp_device.status == "offline":
                logger.debug(
                    "Skipping config push for offline ESP %s", esp_device.device_id
                )
                return False

            from ...db.repositories import SensorRepository, ActuatorRepository

            sensor_repo = SensorRepository(session)
            actuator_repo = ActuatorRepository(session)

            db_sensor_count = await sensor_repo.count_by_esp(esp_device.id)
            db_actuator_count = await actuator_repo.count_by_esp(esp_device.id)

            # ESP reports 0 configs but DB has configs → reboot detected
            needs_sensor_push = esp_sensor_count == 0 and db_sensor_count > 0
            needs_actuator_push = esp_actuator_count == 0 and db_actuator_count > 0

            if needs_sensor_push or needs_actuator_push:
                # Check cooldown (analog to zone_resync_sent_at pattern)
                metadata = esp_device.device_metadata or {}
                last_push = metadata.get("config_push_sent_at")
                now_ts = int(time_module.time())

                if last_push:
                    elapsed = now_ts - last_push
                    if elapsed < CONFIG_PUSH_COOLDOWN_SECONDS:
                        logger.debug(
                            "Config push for %s skipped (cooldown: %ds remaining). "
                            "ESP: sensors=%d/actuators=%d, DB: sensors=%d/actuators=%d",
                            esp_device.device_id,
                            int(CONFIG_PUSH_COOLDOWN_SECONDS - elapsed),
                            esp_sensor_count, esp_actuator_count,
                            db_sensor_count, db_actuator_count,
                        )
                        return False

                # Cooldown expired or first push — update metadata and trigger
                metadata["config_push_sent_at"] = now_ts
                esp_device.device_metadata = metadata

                logger.info(
                    f"Config mismatch detected for {esp_device.device_id}: "
                    f"ESP reports sensors={esp_sensor_count}/actuators={esp_actuator_count}, "
                    f"DB has sensors={db_sensor_count}/actuators={db_actuator_count}. "
                    f"Triggering auto config push."
                )
                import asyncio

                asyncio.create_task(self._auto_push_config(esp_device.device_id))
                return True

            return False

        except Exception as e:
            logger.warning(f"Failed to check pending config for {esp_device.device_id}: {e}")
            return False

    async def _auto_push_config(self, esp_device_id: str) -> None:
        """
        Auto-push configuration to ESP after reboot detection.

        Runs as a separate async task so it doesn't block heartbeat processing.
        Uses its own DB session to avoid conflicts with the heartbeat session.
        """
        try:
            from ...services.config_builder import ConfigPayloadBuilder
            from ...services.esp_service import ESPService

            async with resilient_session() as session:
                config_builder = ConfigPayloadBuilder()
                combined_config = await config_builder.build_combined_config(esp_device_id, session)

                esp_repo = ESPRepository(session)
                esp_service = ESPService(esp_repo)
                result = await esp_service.send_config(esp_device_id, combined_config)

                if result.get("success"):
                    logger.info(
                        f"Auto config push successful for {esp_device_id}: "
                        f"{len(combined_config.get('sensors', []))} sensors, "
                        f"{len(combined_config.get('actuators', []))} actuators"
                    )
                else:
                    logger.warning(
                        f"Auto config push failed for {esp_device_id}: "
                        f"{result.get('message', 'unknown error')}"
                    )

        except Exception as e:
            logger.error(
                f"Auto config push error for {esp_device_id}: {e}",
                exc_info=True,
            )

    async def _handle_reconnect_state_push(self, device_id: str) -> None:
        """
        T13-Phase3: Full-State-Push after ESP reconnect (>60s offline).

        Sends zone/assign + all active subzone/assign via MQTTCommandBridge (ACK-driven).
        Runs as async task — does not block heartbeat processing.
        Uses its own DB session to avoid conflicts with the heartbeat session.
        """
        try:
            if not _command_bridge:
                logger.warning("No command_bridge for state push to %s", device_id)
                return

            async with resilient_session() as session:
                esp_repo = ESPRepository(session)
                esp_device = await esp_repo.get_by_device_id(device_id)
                if not esp_device or not esp_device.zone_id:
                    return

                # Skip mock ESPs (no real reboot)
                if (
                    device_id.startswith("ESP_MOCK_")
                    or device_id.startswith("MOCK_")
                    or "MOCK" in device_id
                ):
                    logger.debug("Skipping state push for mock ESP %s", device_id)
                    return

                # Cooldown: prevent rapid-fire pushes
                metadata = dict(esp_device.device_metadata or {})
                last_push = metadata.get("full_state_push_sent_at", 0)
                now_ts = int(time_module.time())
                if now_ts - last_push < STATE_PUSH_COOLDOWN_SECONDS:
                    logger.debug(
                        "State push cooldown for %s (%ds remaining)",
                        device_id,
                        STATE_PUSH_COOLDOWN_SECONDS - (now_ts - last_push),
                    )
                    return

                # Set cooldown BEFORE attempting send to prevent retry spam on timeout
                metadata["full_state_push_sent_at"] = now_ts
                esp_device.device_metadata = metadata
                await session.commit()

                # 1. Zone assign via command_bridge (ACK-driven)
                zone_topic = TopicBuilder.build_zone_assign_topic(device_id)
                zone_payload = {
                    "zone_id": esp_device.zone_id,
                    "master_zone_id": esp_device.master_zone_id or "",
                    "zone_name": esp_device.zone_name or "",
                    "kaiser_id": esp_device.kaiser_id or constants.get_kaiser_id(),
                    "timestamp": now_ts,
                }
                try:
                    await _command_bridge.send_and_wait_ack(
                        topic=zone_topic,
                        payload=zone_payload,
                        esp_id=device_id,
                        command_type="zone",
                        timeout=_command_bridge.DEFAULT_TIMEOUT,
                    )
                except Exception as e:
                    logger.warning(
                        "Zone ACK timeout during state push for %s: %s", device_id, e
                    )
                    return

                # 2. Load and send active subzones sequentially
                from ...db.repositories.subzone_repo import SubzoneRepository

                subzone_repo = SubzoneRepository(session)
                subzones = await subzone_repo.get_by_esp(device_id)
                active_subzones = [sz for sz in subzones if sz.is_active][:8]  # Max 8

                subzone_count = 0
                for sz in active_subzones:
                    sz_topic = TopicBuilder.build_subzone_assign_topic(device_id)
                    sz_payload = {
                        "subzone_id": sz.subzone_id,
                        "subzone_name": sz.subzone_name or "",
                        "parent_zone_id": "",  # Firmware sets current zone automatically
                        "assigned_gpios": [
                            g for g in (sz.assigned_gpios or []) if g != 0
                        ],
                        # Reconnect state push restores operational state — never
                        # activate safe-mode during resync (safe-mode is only for
                        # explicit user actions). Prevents GPIO conflict where
                        # safe-mode sets actuator pins to INPUT_PULLUP.
                        "safe_mode_active": False,
                        "timestamp": now_ts,
                    }
                    try:
                        await _command_bridge.send_and_wait_ack(
                            topic=sz_topic,
                            payload=sz_payload,
                            esp_id=device_id,
                            command_type="subzone",
                            timeout=_command_bridge.DEFAULT_TIMEOUT,
                        )
                        subzone_count += 1
                    except Exception as e:
                        logger.warning(
                            "Subzone ACK timeout for %s/%s: %s",
                            device_id,
                            sz.subzone_id,
                            e,
                        )

                logger.info(
                    "Full-State-Push completed for %s: zone=%s, subzones=%d/%d",
                    device_id,
                    esp_device.zone_id,
                    subzone_count,
                    len(active_subzones),
                )

        except Exception as e:
            logger.error(
                "Full-State-Push failed for %s: %s", device_id, e, exc_info=True
            )

    async def check_device_timeouts(self) -> dict:
        """
        Check for devices that haven't sent heartbeat recently.

        Marks devices as offline if last_seen > HEARTBEAT_TIMEOUT_SECONDS.

        Returns:
            {
                "checked": int,
                "timed_out": int,
                "offline_devices": [str]
            }
        """
        try:
            async with resilient_session() as session:
                esp_repo = ESPRepository(session)

                # Get all online devices
                online_devices = await esp_repo.get_by_status("online")

                offline_devices = []
                actuator_reset_counts: dict[str, int] = {}
                now = datetime.now(timezone.utc)
                timeout_threshold = now - timedelta(seconds=HEARTBEAT_TIMEOUT_SECONDS)

                for device in online_devices:
                    last_seen = device.last_seen
                    if last_seen:
                        # Make timezone-aware if naive (assume UTC for database values)
                        if last_seen.tzinfo is None:
                            last_seen = last_seen.replace(tzinfo=timezone.utc)
                        if last_seen < timeout_threshold:
                            # Device timed out
                            await esp_repo.update_status(device.device_id, "offline")
                            offline_devices.append(device.device_id)

                            # Reset actuator states to idle for offline device
                            try:
                                actuator_repo = ActuatorRepository(session)
                                reset_count = await actuator_repo.reset_states_for_device(
                                    esp_id=device.id,
                                    new_state="idle",
                                    reason="heartbeat_timeout",
                                )
                                if reset_count > 0:
                                    actuator_reset_counts[device.device_id] = reset_count
                                    logger.info(
                                        f"[Heartbeat] Reset {reset_count} actuator state(s) to idle "
                                        f"for offline device {device.device_id}"
                                    )
                            except Exception as reset_err:
                                logger.warning(
                                    f"[Heartbeat] Failed to reset actuator states for "
                                    f"{device.device_id}: {reset_err}"
                                )

                            logger.warning(
                                f"Device {device.device_id} timed out. "
                                f"Last seen: {device.last_seen}"
                            )

                            # Audit Logging: device_offline (heartbeat timeout)
                            try:
                                audit_repo = AuditLogRepository(session)
                                await audit_repo.log_device_event(
                                    esp_id=device.device_id,
                                    event_type=AuditEventType.DEVICE_OFFLINE,
                                    status="success",
                                    message=f"Device timed out - no heartbeat for {HEARTBEAT_TIMEOUT_SECONDS}s",
                                    details={
                                        "last_seen": (
                                            device.last_seen.isoformat()
                                            if device.last_seen
                                            else None
                                        ),
                                        "timeout_threshold_seconds": HEARTBEAT_TIMEOUT_SECONDS,
                                        "reason": "heartbeat_timeout",
                                    },
                                    severity=AuditSeverity.WARNING,
                                )
                            except Exception as audit_error:
                                logger.warning(f"Failed to audit log device_offline: {audit_error}")

                # Commit transaction
                await session.commit()

                # Broadcast esp_health offline events via WebSocket
                if offline_devices:
                    try:
                        from ...websocket.manager import WebSocketManager

                        ws_manager = await WebSocketManager.get_instance()
                        for device_id in offline_devices:
                            await ws_manager.broadcast(
                                "esp_health",
                                {
                                    "esp_id": device_id,
                                    "status": "offline",
                                    "reason": "heartbeat_timeout",
                                    "timeout_seconds": HEARTBEAT_TIMEOUT_SECONDS,
                                    "timestamp": int(now.timestamp()),
                                    "actuator_states_reset": actuator_reset_counts.get(device_id, 0),
                                },
                            )
                            logger.info(f"📡 Broadcast esp_health offline event for {device_id}")
                    except Exception as e:
                        logger.warning(f"Failed to broadcast ESP offline events: {e}")

                return {
                    "checked": len(online_devices),
                    "timed_out": len(offline_devices),
                    "offline_devices": offline_devices,
                }

        except Exception as e:
            logger.error(f"Error checking device timeouts: {e}", exc_info=True)
            return {
                "checked": 0,
                "timed_out": 0,
                "offline_devices": [],
            }


# Global handler instance
_handler_instance: Optional[HeartbeatHandler] = None


def get_heartbeat_handler() -> HeartbeatHandler:
    """
    Get singleton heartbeat handler instance.

    Returns:
        HeartbeatHandler instance
    """
    global _handler_instance
    if _handler_instance is None:
        _handler_instance = HeartbeatHandler()
    return _handler_instance


async def handle_heartbeat(topic: str, payload: dict) -> bool:
    """
    Handle heartbeat message (convenience function).

    Args:
        topic: MQTT topic string
        payload: Parsed JSON payload dict

    Returns:
        True if message processed successfully
    """
    handler = get_heartbeat_handler()
    return await handler.handle_heartbeat(topic, payload)
