"""
ESP Device Service - Business Logic for ESP Device Operations

Phase: 5 (Week 9-10) - API Layer
Priority: 🟡 HIGH
Status: IMPLEMENTED

Provides:
- ESP device registration and management
- Health tracking and status updates
- Configuration management via MQTT
- Restart and reset commands
- Device discovery and approval workflow

This service provides shared business logic used by both:
- REST API endpoints (api/v1/esp.py)
- MQTT handlers (mqtt/handlers/heartbeat_handler.py, discovery_handler.py)

References:
- .claude/PI_SERVER_REFACTORING.md (Lines 125-133)
- El Trabajante/docs/Mqtt_Protocoll.md
"""

import hashlib
import json
import uuid
from collections import deque
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Any, Dict, List, Optional, Tuple

from ..core.logging_config import get_logger
from ..db.models.audit_log import AuditEventType, AuditSeverity, AuditSourceType
from ..db.models.esp import ESPDevice
from ..db.repositories import ESPRepository
from ..db.repositories.audit_log_repo import AuditLogRepository
from ..mqtt.publisher import Publisher
from .event_contract_serializers import serialize_config_response_event

logger = get_logger(__name__)


# =============================================================================
# Discovery Rate Limiter
# =============================================================================


class DiscoveryRateLimiter:
    """
    Rate limiter for device discovery.

    Limits:
    - Global: 10 discoveries per minute
    - Per-ESP: 1 discovery per 5 minutes (cooldown)

    Thread-safe implementation for use in async context.
    """

    def __init__(
        self,
        global_limit: int = 10,
        global_window_seconds: int = 60,
        per_device_cooldown_seconds: int = 300,  # 5 minutes
    ):
        """
        Initialize rate limiter.

        Args:
            global_limit: Max discoveries per window
            global_window_seconds: Window size in seconds
            per_device_cooldown_seconds: Per-device cooldown in seconds
        """
        self.global_limit = global_limit
        self.global_window = timedelta(seconds=global_window_seconds)
        self.per_device_cooldown = timedelta(seconds=per_device_cooldown_seconds)

        self._global_discoveries: deque = deque()
        self._device_discoveries: Dict[str, datetime] = {}
        self._lock = Lock()

    def can_discover(self, device_id: str) -> Tuple[bool, str]:
        """
        Check if discovery is allowed for this device.

        Args:
            device_id: ESP device ID

        Returns:
            Tuple of (allowed: bool, reason: str)
        """
        with self._lock:
            now = datetime.now(timezone.utc)

            # Check per-device cooldown
            if device_id in self._device_discoveries:
                last_discovery = self._device_discoveries[device_id]
                if now - last_discovery < self.per_device_cooldown:
                    remaining = int(
                        (last_discovery + self.per_device_cooldown - now).total_seconds()
                    )
                    return False, f"Device cooldown: {remaining}s remaining"

            # Check global limit
            window_start = now - self.global_window
            while self._global_discoveries and self._global_discoveries[0] < window_start:
                self._global_discoveries.popleft()

            if len(self._global_discoveries) >= self.global_limit:
                return False, f"Global limit reached: {self.global_limit}/min"

            return True, "OK"

    def record_discovery(self, device_id: str) -> None:
        """
        Record a successful discovery.

        Args:
            device_id: ESP device ID
        """
        with self._lock:
            now = datetime.now(timezone.utc)
            self._global_discoveries.append(now)
            self._device_discoveries[device_id] = now


# Global rate limiter instance
_discovery_rate_limiter = DiscoveryRateLimiter()


class ESPService:
    """
    ESP device business logic service.

    Handles ESP registration, health tracking, and commands.
    """

    def __init__(
        self,
        esp_repo: ESPRepository,
        publisher: Optional[Publisher] = None,
    ):
        """
        Initialize ESPService.

        Args:
            esp_repo: ESP repository
            publisher: MQTT publisher (optional, created if not provided)
        """
        self.esp_repo = esp_repo
        self.publisher = publisher or Publisher()

    # =========================================================================
    # Device Registration
    # =========================================================================

    async def register_device(
        self,
        device_id: str,
        ip_address: str,
        mac_address: str,
        firmware_version: str = "unknown",
        hardware_type: str = "ESP32_WROOM",
        name: Optional[str] = None,
        zone_id: Optional[str] = None,
        zone_name: Optional[str] = None,
        is_zone_master: bool = False,
        capabilities: Optional[Dict[str, Any]] = None,
    ) -> ESPDevice:
        """
        Register a new ESP device or update existing.

        Args:
            device_id: ESP device ID (ESP_XXXXXXXX format)
            ip_address: Device IP address
            mac_address: Device MAC address
            firmware_version: Firmware version
            hardware_type: Hardware type
            name: Human-readable name
            zone_id: Zone identifier
            zone_name: Zone name
            is_zone_master: Whether device is zone master
            capabilities: Device capabilities

        Returns:
            Created or updated ESPDevice
        """
        existing = await self.esp_repo.get_by_device_id(device_id)

        if existing:
            # Update existing device - preserve current status
            existing.ip_address = ip_address
            existing.mac_address = mac_address
            existing.firmware_version = firmware_version
            existing.hardware_type = hardware_type
            if name:
                existing.name = name
            if zone_id:
                existing.zone_id = zone_id
            if zone_name:
                existing.zone_name = zone_name
            existing.is_zone_master = is_zone_master
            if capabilities:
                existing.capabilities = capabilities
            existing.last_seen = datetime.now(timezone.utc)

            logger.info(f"ESP device updated: {device_id}")
            return existing
        else:
            # Create new device with pending_approval status
            # Requires admin approval before device becomes fully operational
            device = ESPDevice(
                device_id=device_id,
                ip_address=ip_address,
                mac_address=mac_address,
                firmware_version=firmware_version,
                hardware_type=hardware_type,
                name=name,
                zone_id=zone_id,
                zone_name=zone_name,
                is_zone_master=is_zone_master,
                capabilities=capabilities or {},
                status="pending_approval",
                last_seen=datetime.now(timezone.utc),
                device_metadata={},
            )
            created = await self.esp_repo.create(device)

            logger.info(f"ESP device registered (pending approval): {device_id}")
            return created

    async def unregister_device(
        self,
        device_id: str,
    ) -> bool:
        """
        Unregister (delete) an ESP device.

        Args:
            device_id: ESP device ID

        Returns:
            True if deleted, False if not found
        """
        device = await self.esp_repo.get_by_device_id(device_id)
        if not device:
            return False

        await self.esp_repo.delete(device.id)
        logger.info(f"ESP device unregistered: {device_id}")
        return True

    # =========================================================================
    # Health Tracking
    # =========================================================================

    async def update_health(
        self,
        device_id: str,
        uptime: int,
        heap_free: int,
        wifi_rssi: int,
        sensor_count: int = 0,
        actuator_count: int = 0,
        timestamp: Optional[int] = None,
    ) -> bool:
        """
        Update ESP device health from heartbeat.

        Args:
            device_id: ESP device ID
            uptime: Seconds since boot
            heap_free: Free heap memory (bytes)
            wifi_rssi: WiFi signal strength (dBm)
            sensor_count: Active sensor count
            actuator_count: Active actuator count
            timestamp: Heartbeat timestamp

        Returns:
            True if updated, False if device not found
        """
        device = await self.esp_repo.get_by_device_id(device_id)
        if not device:
            logger.warning(f"Health update for unknown device: {device_id}")
            return False

        # Update status and last_seen
        device.status = "online"
        device.last_seen = datetime.now(timezone.utc)

        # Store health data in metadata
        health_data = {
            "uptime": uptime,
            "heap_free": heap_free,
            "wifi_rssi": wifi_rssi,
            "sensor_count": sensor_count,
            "actuator_count": actuator_count,
            "timestamp": timestamp or int(datetime.now(timezone.utc).timestamp()),
        }

        metadata = device.device_metadata or {}
        metadata["health"] = health_data
        device.device_metadata = metadata

        logger.debug(
            f"Health updated for {device_id}: uptime={uptime}s, heap={heap_free}, rssi={wifi_rssi}"
        )
        return True

    async def check_device_status(
        self,
        offline_threshold_seconds: int = 120,
    ) -> Dict[str, List[str]]:
        """
        Check all device statuses and mark offline devices.

        Args:
            offline_threshold_seconds: Seconds since last_seen to mark offline

        Returns:
            Dictionary with lists of online, offline, and newly_offline devices
        """
        all_devices = await self.esp_repo.get_all()
        now = datetime.now(timezone.utc)
        threshold = timedelta(seconds=offline_threshold_seconds)

        online = []
        offline = []
        newly_offline = []

        for device in all_devices:
            last_seen = device.last_seen
            if last_seen:
                # Make timezone-aware if naive (assume UTC for database values)
                if last_seen.tzinfo is None:
                    last_seen = last_seen.replace(tzinfo=timezone.utc)
                if (now - last_seen) < threshold:
                    # Device is online
                    if device.status != "online":
                        device.status = "online"
                    online.append(device.device_id)
                else:
                    # Device is offline
                    if device.status == "online":
                        device.status = "offline"
                        newly_offline.append(device.device_id)
                        logger.warning(f"ESP device went offline: {device.device_id}")
                    offline.append(device.device_id)
            else:
                # No last_seen - treat as offline
                if device.status == "online":
                    device.status = "offline"
                    newly_offline.append(device.device_id)
                    logger.warning(f"ESP device went offline: {device.device_id}")
                offline.append(device.device_id)

        # Persist any status changes to the database
        if self.esp_repo.session.dirty:
            await self.esp_repo.session.commit()

        return {
            "online": online,
            "offline": offline,
            "newly_offline": newly_offline,
        }

    # =========================================================================
    # Commands
    # =========================================================================

    @staticmethod
    def _canonicalize_payload(value: Any) -> Any:
        """Build deterministic structures for stable fingerprint hashing."""
        if isinstance(value, dict):
            return {
                str(key): ESPService._canonicalize_payload(val)
                for key, val in sorted(value.items(), key=lambda item: str(item[0]))
            }
        if isinstance(value, list):
            return [ESPService._canonicalize_payload(item) for item in value]
        return value

    @staticmethod
    def _compute_config_fingerprint(config: Dict[str, Any]) -> str:
        normalized = ESPService._canonicalize_payload(config)
        payload_json = json.dumps(
            normalized,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(payload_json.encode("utf-8")).hexdigest()

    @staticmethod
    def _is_mock_device(device: ESPDevice, device_id: str) -> bool:
        hardware_type = str(getattr(device, "hardware_type", "") or "").upper()
        if hardware_type == "MOCK_ESP32":
            return True
        return device_id.startswith("MOCK_") or device_id.startswith("ESP_MOCK_")

    @staticmethod
    def _infer_config_response_type(config: Dict[str, Any]) -> str:
        sensor_count = len(config.get("sensors", []))
        actuator_count = len(config.get("actuators", []))
        offline_rule_count = len(config.get("offline_rules", []))
        if sensor_count > 0 and actuator_count == 0 and offline_rule_count == 0:
            return "sensor"
        if actuator_count > 0 and sensor_count == 0 and offline_rule_count == 0:
            return "actuator"
        return "system"

    @staticmethod
    def _infer_config_response_count(config: Dict[str, Any], config_type: str) -> int:
        if config_type == "sensor":
            return len(config.get("sensors", []))
        if config_type == "actuator":
            return len(config.get("actuators", []))
        return (
            len(config.get("sensors", []))
            + len(config.get("actuators", []))
            + len(config.get("offline_rules", []))
        )

    def _strip_inconsistent_offline_rules(
        self,
        config: Dict[str, Any],
        device_id: str,
        correlation_id: str,
    ) -> List[Dict[str, Any]]:
        """
        AUT-59: Remove offline_rules whose actuator/sensor GPIOs are absent
        from the config frame.  Mutates config["offline_rules"] in place and
        returns details of stripped rules (empty list when everything is clean).

        This is a defense-in-depth guard — the primary validation lives in
        ConfigPayloadBuilder._validate_offline_rules_consistency.
        """
        offline_rules = config.get("offline_rules")
        if not offline_rules:
            return []

        actuator_gpios = {int(a["gpio"]) for a in config.get("actuators", []) if "gpio" in a}
        sensor_gpios = {int(s["gpio"]) for s in config.get("sensors", []) if "gpio" in s}

        consistent = []
        stripped: List[Dict[str, Any]] = []

        for rule in offline_rules:
            a_gpio = rule.get("actuator_gpio")
            s_gpio = rule.get("sensor_gpio")
            sensor_value_type = str(rule.get("sensor_value_type", ""))
            is_time_window_only = sensor_value_type in {"__twindow_on", "__twindow_off"}
            drop = False

            if a_gpio is not None and int(a_gpio) not in actuator_gpios:
                drop = True
            if (
                not is_time_window_only
                and s_gpio is not None
                and int(s_gpio) not in sensor_gpios
            ):
                drop = True

            if drop:
                stripped.append({
                    "actuator_gpio": a_gpio,
                    "sensor_gpio": s_gpio,
                    "sensor_value_type": rule.get("sensor_value_type", ""),
                })
            else:
                consistent.append(rule)

        if stripped:
            config["offline_rules"] = consistent
            logger.warning(
                "AUT-59: Stripped %d inconsistent offline_rules from config for %s "
                "(correlation_id=%s): %s",
                len(stripped),
                device_id,
                correlation_id,
                stripped,
            )

        return stripped

    async def send_config(
        self,
        device_id: str,
        config: Dict[str, Any],
        offline_behavior: str = "warn",
        require_online: bool = False,
        reason_code: str = "manual_config_sync",
        generation: Optional[int] = None,
        config_fingerprint: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Send configuration update to ESP via MQTT.

        Supports configurable behavior for offline devices:
        - "warn": Log warning but send anyway (default, MQTT will queue)
        - "skip": Skip sending, return success with warning
        - "fail": Return failure if device is offline

        Args:
            device_id: ESP device ID
            config: Configuration data
            offline_behavior: How to handle offline devices ("warn", "skip", "fail")
            require_online: Deprecated, use offline_behavior="fail" instead

        Returns:
            Dict with:
            - success: bool
            - sent: bool (whether MQTT publish was attempted)
            - device_status: str
            - message: str
            - error_code: int (if failed)
        """
        from ..core.error_codes import ConfigErrorCode

        correlation_id = str(uuid.uuid4())
        resolved_generation = (
            int(generation)
            if generation is not None and int(generation) > 0
            else int(datetime.now(timezone.utc).timestamp() * 1000)
        )

        result = {
            "success": False,
            "sent": False,
            "device_status": "unknown",
            "message": "",
            "error_code": None,
            "correlation_id": correlation_id,
            "reason_code": reason_code,
            "generation": resolved_generation,
        }

        # Get device
        device = await self.esp_repo.get_by_device_id(device_id)
        if not device:
            logger.error(f"Cannot send config: device {device_id} not found")
            result["message"] = f"Device {device_id} not found"
            result["error_code"] = ConfigErrorCode.ESP_DEVICE_NOT_FOUND
            return result

        result["device_status"] = device.status or "unknown"

        # Handle require_online legacy parameter
        if require_online:
            offline_behavior = "fail"

        # Check if device is online
        is_online = device.status == "online"

        if not is_online:
            if offline_behavior == "fail":
                logger.error(f"Cannot send config: device {device_id} is {device.status}")
                result["message"] = f"Device {device_id} is {device.status} (offline_behavior=fail)"
                result["error_code"] = ConfigErrorCode.ESP_OFFLINE
                return result

            elif offline_behavior == "skip":
                logger.warning(f"Skipping config send to {device_id}: device is {device.status}")
                result["success"] = True
                result["sent"] = False
                result["message"] = (
                    f"Config not sent: device {device_id} is {device.status}. "
                    "Config will be sent when device reconnects."
                )
                return result

            else:  # "warn" (default)
                logger.warning(
                    f"Sending config to offline device {device_id} ({device.status}). "
                    "MQTT broker will queue message until device reconnects."
                )

        # AUT-59: Defense-in-depth — strip offline_rules that reference GPIOs
        # absent from the same config frame before publishing.
        stripped = self._strip_inconsistent_offline_rules(config, device_id, correlation_id)
        resolved_fingerprint = config_fingerprint or self._compute_config_fingerprint(config)
        result["config_fingerprint"] = resolved_fingerprint

        # Publish config via MQTT with stable intent handles for contract tracking.
        # Keep correlation_id as primary key and mirror it in request_id/intent_id
        # for firmware paths that still rely on those fields.
        config_with_correlation = {
            **config,
            "correlation_id": correlation_id,
            "request_id": correlation_id,
            "intent_id": correlation_id,
            "generation": resolved_generation,
            "config_fingerprint": resolved_fingerprint,
            "reason_code": reason_code,
        }
        logger.debug(
            "Config payload for %s (reason=%s generation=%s fingerprint=%s): %s",
            device_id,
            reason_code,
            resolved_generation,
            resolved_fingerprint[:12],
            json.dumps(config, default=str),
        )
        success = self.publisher.publish_config(
            esp_id=device_id,
            config=config_with_correlation,
        )

        result["sent"] = True

        if success:
            result["success"] = True
            status_note = "" if is_online else f" (device is {device.status}, message queued)"
            result["message"] = f"Config sent to {device_id}{status_note}"
            sensor_count = len(config.get("sensors", []))
            actuator_count = len(config.get("actuators", []))
            logger.info(
                "Config sent to %s: %d sensors, %d actuators",
                device_id,
                sensor_count,
                actuator_count,
            )

            # Audit log: config published
            try:
                audit_repo = AuditLogRepository(self.esp_repo.session)
                await audit_repo.create(
                    event_type=AuditEventType.CONFIG_PUBLISHED,
                    severity=AuditSeverity.INFO,
                    source_type=AuditSourceType.ESP32,
                    source_id=device_id,
                    status="success",
                    message=f"Config sent to {device_id}",
                    correlation_id=correlation_id,
                    details={
                        "esp_id": device_id,
                        "config_keys": list(config.keys()),
                        "device_status": device.status or "unknown",
                        "sensor_count": len(config.get("sensors", [])),
                        "actuator_count": len(config.get("actuators", [])),
                        "correlation_id": correlation_id,
                        "reason_code": reason_code,
                        "generation": resolved_generation,
                        "config_fingerprint": resolved_fingerprint,
                    },
                )
            except Exception as audit_err:
                logger.warning(f"Failed to write audit log for config publish: {audit_err}")

            # AUT-59: Audit + WS for stripped offline_rules
            if stripped:
                try:
                    audit_repo_strip = AuditLogRepository(self.esp_repo.session)
                    await audit_repo_strip.create(
                        event_type=AuditEventType.CONFIG_OFFLINE_RULES_STRIPPED,
                        severity=AuditSeverity.WARNING,
                        source_type=AuditSourceType.ESP32,
                        source_id=device_id,
                        status="warning",
                        message=(
                            f"AUT-59: {len(stripped)} offline_rules stripped from config "
                            f"for {device_id} (referenced GPIOs absent in config frame)"
                        ),
                        correlation_id=correlation_id,
                        details={
                            "esp_id": device_id,
                            "stripped_rules": stripped,
                            "correlation_id": correlation_id,
                        },
                    )
                except Exception as audit_err:
                    logger.warning(f"Failed to write audit log for stripped rules: {audit_err}")

            # WebSocket broadcast: config published
            try:
                from ..websocket.manager import WebSocketManager

                ws_manager = await WebSocketManager.get_instance()
                await ws_manager.broadcast(
                    "config_published",
                    {
                        "esp_id": device_id,
                        "config_keys": list(config.keys()),
                        "correlation_id": correlation_id,
                        "queued": not is_online,
                        "device_status": device.status or "unknown",
                        "offline_rules_stripped": len(stripped) if stripped else 0,
                        "reason_code": reason_code,
                        "generation": resolved_generation,
                        "config_fingerprint": resolved_fingerprint,
                    },
                    correlation_id=correlation_id,
                )
                if self._is_mock_device(device, device_id):
                    config_type = self._infer_config_response_type(config)
                    item_count = self._infer_config_response_count(config, config_type)
                    mock_ack_payload = serialize_config_response_event(
                        esp_id=device_id,
                        config_type=config_type,
                        status="success",
                        count=item_count,
                        failed_count=0,
                        message="Mock-ESP Konfiguration serverseitig bestaetigt",
                        timestamp=int(datetime.now(timezone.utc).timestamp()),
                        correlation_id=correlation_id,
                    )
                    await ws_manager.broadcast(
                        "config_response",
                        mock_ack_payload,
                        correlation_id=correlation_id,
                    )
            except Exception as e:
                logger.warning(f"WebSocket broadcast config_published failed for {device_id}: {e}")
        else:
            result["message"] = f"Failed to publish config to {device_id}"
            result["error_code"] = ConfigErrorCode.CONFIG_PUBLISH_FAILED
            logger.error(f"Failed to send config to {device_id}")

            # Audit log: config publish failed
            try:
                audit_repo = AuditLogRepository(self.esp_repo.session)
                await audit_repo.create(
                    event_type=AuditEventType.CONFIG_FAILED,
                    severity=AuditSeverity.ERROR,
                    source_type=AuditSourceType.ESP32,
                    source_id=device_id,
                    status="failed",
                    message=f"Failed to publish config to {device_id}",
                    correlation_id=correlation_id,
                    details={
                        "esp_id": device_id,
                        "config_keys": list(config.keys()),
                        "error": "MQTT publish failed",
                        "correlation_id": correlation_id,
                        "reason_code": reason_code,
                        "generation": resolved_generation,
                        "config_fingerprint": resolved_fingerprint,
                    },
                )
            except Exception as audit_err:
                logger.warning(f"Failed to write audit log for config failure: {audit_err}")

            # WebSocket broadcast: config failed
            try:
                from ..websocket.manager import WebSocketManager

                ws_manager = await WebSocketManager.get_instance()
                await ws_manager.broadcast(
                    "config_failed",
                    {
                        "esp_id": device_id,
                        "config_keys": list(config.keys()) if config else [],
                        "error": "MQTT publish failed",
                        "correlation_id": correlation_id,
                        "reason_code": reason_code,
                        "generation": resolved_generation,
                        "config_fingerprint": resolved_fingerprint,
                    },
                    correlation_id=correlation_id,
                )
            except Exception as e:
                logger.warning(f"WebSocket broadcast config_failed failed for {device_id}: {e}")

        return result

    async def send_restart(
        self,
        device_id: str,
        delay_seconds: int = 0,
        reason: Optional[str] = None,
    ) -> bool:
        """
        Send restart command to ESP.

        Args:
            device_id: ESP device ID
            delay_seconds: Delay before restart
            reason: Restart reason

        Returns:
            True if sent successfully
        """
        device = await self.esp_repo.get_by_device_id(device_id)
        if not device:
            logger.error(f"Cannot restart: device {device_id} not found")
            return False

        success = self.publisher.publish_system_command(
            esp_id=device_id,
            command="REBOOT",
            params={
                "delay_seconds": delay_seconds,
                "reason": reason or "Manual restart",
            },
        )

        if success:
            logger.info(f"Restart command sent to {device_id}")
        else:
            logger.error(f"Failed to send restart to {device_id}")

        return success

    async def send_factory_reset(
        self,
        device_id: str,
        preserve_wifi: bool = False,
    ) -> bool:
        """
        Send factory reset command to ESP.

        Args:
            device_id: ESP device ID
            preserve_wifi: Whether to preserve WiFi credentials

        Returns:
            True if sent successfully
        """
        device = await self.esp_repo.get_by_device_id(device_id)
        if not device:
            logger.error(f"Cannot reset: device {device_id} not found")
            return False

        success = self.publisher.publish_system_command(
            esp_id=device_id,
            command="FACTORY_RESET",
            params={
                "preserve_wifi": preserve_wifi,
            },
        )

        if success:
            logger.warning(f"Factory reset command sent to {device_id}")
        else:
            logger.error(f"Failed to send factory reset to {device_id}")

        return success

    # =========================================================================
    # Queries
    # =========================================================================

    async def get_device(
        self,
        device_id: str,
    ) -> Optional[ESPDevice]:
        """
        Get ESP device by device_id.

        Args:
            device_id: ESP device ID

        Returns:
            ESPDevice or None
        """
        return await self.esp_repo.get_by_device_id(device_id)

    async def get_all_devices(
        self,
        zone_id: Optional[str] = None,
        status: Optional[str] = None,
        hardware_type: Optional[str] = None,
    ) -> List[ESPDevice]:
        """
        Get all ESP devices with optional filters.

        Args:
            zone_id: Filter by zone
            status: Filter by status
            hardware_type: Filter by hardware type

        Returns:
            List of ESPDevice
        """
        if zone_id:
            return await self.esp_repo.get_by_zone(zone_id)
        elif status:
            return await self.esp_repo.get_by_status(status)
        elif hardware_type:
            return await self.esp_repo.get_by_hardware_type(hardware_type)
        else:
            return await self.esp_repo.get_all()

    async def get_health_summary(self) -> Dict[str, Any]:
        """
        Get health summary for all devices.

        Returns:
            Health summary dictionary
        """
        devices = await self.esp_repo.get_all()

        total = len(devices)
        online = sum(1 for d in devices if d.status == "online")
        offline = sum(1 for d in devices if d.status == "offline")
        error = sum(1 for d in devices if d.status == "error")
        unknown = sum(1 for d in devices if d.status == "unknown")

        # Collect health metrics from online devices
        heap_values = []
        rssi_values = []

        for device in devices:
            if device.status == "online" and device.device_metadata:
                health = device.device_metadata.get("health", {})
                if "heap_free" in health:
                    heap_values.append(health["heap_free"])
                if "wifi_rssi" in health:
                    rssi_values.append(health["wifi_rssi"])

        return {
            "total_devices": total,
            "online_count": online,
            "offline_count": offline,
            "error_count": error,
            "unknown_count": unknown,
            "avg_heap_free": sum(heap_values) / len(heap_values) if heap_values else None,
            "avg_wifi_rssi": sum(rssi_values) / len(rssi_values) if rssi_values else None,
        }

    # =========================================================================
    # Kaiser Assignment
    # =========================================================================

    async def assign_to_kaiser(
        self,
        device_id: str,
        kaiser_id: str,
    ) -> bool:
        """
        Assign ESP device to a Kaiser node.

        Args:
            device_id: ESP device ID
            kaiser_id: Kaiser node ID

        Returns:
            True if assigned successfully
        """
        device = await self.esp_repo.get_by_device_id(device_id)
        if not device:
            return False

        # WP2-Fix4: Set kaiser_id in DB column (indexed, queryable)
        device.kaiser_id = kaiser_id
        # Also update metadata for backward compatibility
        metadata = device.device_metadata or {}
        metadata["kaiser_id"] = kaiser_id
        device.device_metadata = metadata

        logger.info(f"ESP {device_id} assigned to Kaiser {kaiser_id}")
        return True

    async def get_devices_by_kaiser(
        self,
        kaiser_id: str,
    ) -> List[ESPDevice]:
        """
        Get all ESP devices assigned to a Kaiser node.

        WP2-Fix5b: Use DB-Query via Repository instead of full-table-scan.

        Args:
            kaiser_id: Kaiser node ID

        Returns:
            List of ESPDevice
        """
        return await self.esp_repo.get_by_kaiser(kaiser_id)

    # =========================================================================
    # Discovery/Approval Methods
    # =========================================================================

    async def discover_device(
        self,
        device_id: str,
        heartbeat_payload: Dict[str, Any],
    ) -> Tuple[Optional[ESPDevice], str]:
        """
        Create new device from heartbeat with pending_approval status.

        Implements rate limiting and cooldown logic.

        Args:
            device_id: ESP device ID
            heartbeat_payload: Original heartbeat payload

        Returns:
            Tuple of (device, status_message) - device is None if rate limited
        """
        # Check rate limits
        allowed, reason = _discovery_rate_limiter.can_discover(device_id)
        if not allowed:
            logger.warning(f"Discovery rate limited for {device_id}: {reason}")
            return None, reason

        # Extract info from heartbeat
        zone_id = heartbeat_payload.get("zone_id", "")
        master_zone_id = heartbeat_payload.get("master_zone_id", "")

        # Create device with pending_approval status
        device = ESPDevice(
            device_id=device_id,
            hardware_type="ESP32_WROOM",  # Default, updated on approval
            status="pending_approval",
            discovered_at=datetime.now(timezone.utc),
            capabilities={
                "max_sensors": 20,
                "max_actuators": 12,
                "features": ["heartbeat", "sensors", "actuators"],
            },
            device_metadata={
                "discovery_source": "heartbeat",
                "initial_heartbeat": heartbeat_payload,
                "heartbeat_count": 1,
                "zone_id": zone_id,
                "master_zone_id": master_zone_id,
            },
            last_seen=datetime.now(timezone.utc),
        )

        created = await self.esp_repo.create(device)
        _discovery_rate_limiter.record_discovery(device_id)

        logger.info(f"New device discovered: {device_id} (pending_approval)")
        return created, "discovered"

    async def approve_device(
        self,
        device_id: str,
        approved_by: str,
        name: Optional[str] = None,
        zone_id: Optional[str] = None,
        zone_name: Optional[str] = None,
    ) -> Optional[ESPDevice]:
        """
        Approve a pending device.

        Args:
            device_id: ESP device ID
            approved_by: Username of approving admin
            name: Optional device name
            zone_id: Optional zone assignment
            zone_name: Optional zone name

        Returns:
            Updated device or None if not found/not pending
        """
        device = await self.esp_repo.get_by_device_id(device_id)
        if not device:
            logger.warning(f"Cannot approve: device {device_id} not found")
            return None

        if device.status not in ("pending_approval", "rejected"):
            logger.warning(f"Cannot approve: device {device_id} status is {device.status}")
            return None

        # Update device
        device.status = "approved"
        device.approved_at = datetime.now(timezone.utc)
        device.approved_by = approved_by
        device.rejection_reason = None  # Clear any previous rejection

        if name:
            device.name = name
        if zone_id:
            device.zone_id = zone_id
        if zone_name:
            device.zone_name = zone_name

        # WP2-Fix2: Set kaiser_id if not already set
        if not device.kaiser_id:
            from ..core import constants

            device.kaiser_id = constants.get_kaiser_id()

        logger.info(f"Device approved: {device_id} by {approved_by}")
        return device

    async def reject_device(
        self,
        device_id: str,
        reason: str,
    ) -> Optional[ESPDevice]:
        """
        Reject a pending device.

        Args:
            device_id: ESP device ID
            reason: Rejection reason

        Returns:
            Updated device or None if not found
        """
        device = await self.esp_repo.get_by_device_id(device_id)
        if not device:
            logger.warning(f"Cannot reject: device {device_id} not found")
            return None

        if device.status not in ("pending_approval", "approved"):
            logger.warning(f"Cannot reject: device {device_id} status is {device.status}")
            return None

        device.status = "rejected"
        device.rejection_reason = reason
        device.last_rejection_at = datetime.now(timezone.utc)

        logger.info(f"Device rejected: {device_id}, reason: {reason}")
        return device

    async def get_pending_devices(self) -> List[ESPDevice]:
        """
        Get all devices awaiting approval.

        Returns:
            List of pending devices
        """
        return await self.esp_repo.get_by_status("pending_approval")

    async def check_rejection_cooldown(
        self,
        device_id: str,
        cooldown_seconds: int = 300,  # 5 minutes
    ) -> bool:
        """
        Check if rejected device cooldown has expired.

        Args:
            device_id: ESP device ID
            cooldown_seconds: Cooldown period in seconds

        Returns:
            True if cooldown expired (can rediscover), False otherwise
        """
        device = await self.esp_repo.get_by_device_id(device_id)
        if not device or device.status != "rejected":
            return True  # Not rejected, allow discovery

        if not device.last_rejection_at:
            return True  # No rejection timestamp, allow

        cooldown = timedelta(seconds=cooldown_seconds)
        now = datetime.now(timezone.utc)

        # Handle timezone-naive timestamps
        last_rejection = device.last_rejection_at
        if last_rejection.tzinfo is None:
            last_rejection = last_rejection.replace(tzinfo=timezone.utc)

        return (now - last_rejection) >= cooldown

    async def rediscover_device(
        self,
        device_id: str,
        heartbeat_payload: Dict[str, Any],
    ) -> Optional[ESPDevice]:
        """
        Re-discover a previously rejected device after cooldown.

        Args:
            device_id: ESP device ID
            heartbeat_payload: Current heartbeat payload

        Returns:
            Updated device or None
        """
        device = await self.esp_repo.get_by_device_id(device_id)
        if not device:
            return None

        device.status = "pending_approval"
        device.rejection_reason = None

        # Update metadata with new heartbeat
        metadata = device.device_metadata or {}
        metadata["rediscovered_at"] = datetime.now(timezone.utc).isoformat()
        metadata["rediscovery_heartbeat"] = heartbeat_payload
        metadata["heartbeat_count"] = metadata.get("heartbeat_count", 0) + 1
        device.device_metadata = metadata
        device.last_seen = datetime.now(timezone.utc)

        logger.info(f"Device rediscovered: {device_id} (pending_approval again)")
        return device
