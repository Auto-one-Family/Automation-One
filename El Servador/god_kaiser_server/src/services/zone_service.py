"""
Zone Service - Business Logic for Zone Assignment Operations

Phase: 7 - Zone Management
Priority: HIGH
Status: IMPLEMENTED

Provides:
- Zone assignment via MQTT
- Zone removal via MQTT
- Zone ACK handling from ESP32
- Zone status queries

This service provides shared business logic used by:
- REST API endpoints (api/v1/zone.py)
- MQTT handlers (mqtt/handlers/zone_ack_handler.py)

MQTT Protocol:
- Assignment: kaiser/{kaiser_id}/esp/{esp_id}/zone/assign
- ACK: kaiser/{kaiser_id}/esp/{esp_id}/zone/ack

References:
- El Trabajante/docs/system-flows/08-zone-assignment-flow.md
- .claude/README.md (Developer Briefing)
"""

import time
from typing import Any, Dict, Optional

from ..core import constants
from ..core.logging_config import get_logger
from ..db.models.esp import ESPDevice
from ..db.repositories import ESPRepository
from ..mqtt.publisher import Publisher
from ..schemas.zone import ZoneAssignResponse, ZoneRemoveResponse

logger = get_logger(__name__)


class ZoneService:
    """
    Zone assignment business logic service.

    Handles zone assignment, removal, and ACK processing.
    """

    def __init__(
        self,
        esp_repo: ESPRepository,
        publisher: Optional[Publisher] = None,
    ):
        """
        Initialize ZoneService.

        Args:
            esp_repo: ESP repository for database operations
            publisher: MQTT publisher (optional, created if not provided)
        """
        self.esp_repo = esp_repo
        self.publisher = publisher or Publisher()
        # Get kaiser_id from constants (default: "god")
        self.kaiser_id = getattr(constants, "KAISER_ID", "god")

    # =========================================================================
    # Zone Assignment
    # =========================================================================

    async def assign_zone(
        self,
        device_id: str,
        zone_id: str,
        master_zone_id: Optional[str] = None,
        zone_name: Optional[str] = None,
    ) -> ZoneAssignResponse:
        """
        Assign ESP device to a zone via MQTT.

        Flow:
        1. Validate ESP exists in database
        2. Update ESP zone fields (pending assignment)
        3. Build and publish MQTT zone assignment message
        4. Return response (actual confirmation comes via zone/ack topic)

        Args:
            device_id: ESP device ID (e.g., "ESP_12AB34CD")
            zone_id: Primary zone identifier
            master_zone_id: Parent master zone ID (optional)
            zone_name: Human-readable zone name (optional)

        Returns:
            ZoneAssignResponse with assignment status

        Raises:
            ValueError: If ESP device not found
        """
        # 1. Find ESP device
        device = await self.esp_repo.get_by_device_id(device_id)
        if not device:
            logger.warning(f"Zone assignment failed: ESP {device_id} not found")
            raise ValueError(f"ESP device '{device_id}' not found")

        # 2. Build MQTT topic
        topic = f"kaiser/{self.kaiser_id}/esp/{device_id}/zone/assign"

        # 3. Build payload (matches ESP32 expectations)
        payload = {
            "zone_id": zone_id,
            "master_zone_id": master_zone_id or "",
            "zone_name": zone_name or "",
            "kaiser_id": self.kaiser_id,
            "timestamp": int(time.time()),
        }

        # 4. Publish via MQTT (QoS 1 - At least once)
        mqtt_sent = self._publish_zone_assignment(topic, payload)

        if mqtt_sent:
            # 5. Update ESP record with pending zone assignment
            device.zone_id = zone_id
            device.master_zone_id = master_zone_id
            device.zone_name = zone_name
            device.kaiser_id = self.kaiser_id

            # Store pending assignment in metadata for tracking
            if device.device_metadata is None:
                device.device_metadata = {}
            device.device_metadata["pending_zone_assignment"] = {
                "zone_id": zone_id,
                "master_zone_id": master_zone_id,
                "zone_name": zone_name,
                "sent_at": int(time.time()),
            }

            logger.info(
                f"Zone assignment sent to {device_id}: "
                f"zone_id={zone_id}, master_zone_id={master_zone_id}"
            )
        else:
            logger.error(f"Zone assignment MQTT publish failed for {device_id}")

        return ZoneAssignResponse(
            success=mqtt_sent,
            message="Zone assignment sent to ESP" if mqtt_sent else "MQTT publish failed",
            device_id=device_id,
            zone_id=zone_id,
            master_zone_id=master_zone_id,
            zone_name=zone_name,
            mqtt_topic=topic,
            mqtt_sent=mqtt_sent,
        )

    async def remove_zone(
        self,
        device_id: str,
    ) -> ZoneRemoveResponse:
        """
        Remove zone assignment from ESP device.

        Sends zone assignment with empty values to clear ESP zone config.

        Args:
            device_id: ESP device ID

        Returns:
            ZoneRemoveResponse with removal status

        Raises:
            ValueError: If ESP device not found
        """
        # 1. Find ESP device
        device = await self.esp_repo.get_by_device_id(device_id)
        if not device:
            logger.warning(f"Zone removal failed: ESP {device_id} not found")
            raise ValueError(f"ESP device '{device_id}' not found")

        # 2. Build MQTT topic
        topic = f"kaiser/{self.kaiser_id}/esp/{device_id}/zone/assign"

        # 3. Build empty payload to clear zone
        payload = {
            "zone_id": "",
            "master_zone_id": "",
            "zone_name": "",
            "kaiser_id": self.kaiser_id,
            "timestamp": int(time.time()),
        }

        # 4. Publish via MQTT
        mqtt_sent = self._publish_zone_assignment(topic, payload)

        if mqtt_sent:
            logger.info(f"Zone removal sent to {device_id}")
        else:
            logger.error(f"Zone removal MQTT publish failed for {device_id}")

        return ZoneRemoveResponse(
            success=mqtt_sent,
            message="Zone removal sent to ESP" if mqtt_sent else "MQTT publish failed",
            device_id=device_id,
            mqtt_topic=topic,
            mqtt_sent=mqtt_sent,
        )

    # =========================================================================
    # Zone ACK Handling
    # =========================================================================

    async def handle_zone_ack(
        self,
        device_id: str,
        status: str,
        zone_id: str,
        master_zone_id: Optional[str] = None,
        timestamp: int = 0,
        message: Optional[str] = None,
    ) -> bool:
        """
        Handle zone assignment acknowledgment from ESP.

        Called by zone_ack_handler when ESP confirms zone assignment.

        Args:
            device_id: ESP device ID
            status: "zone_assigned" or "error"
            zone_id: Assigned zone ID
            master_zone_id: Assigned master zone ID
            timestamp: ACK timestamp (Unix seconds)
            message: Error message (if status == "error")

        Returns:
            True if ACK processed successfully
        """
        device = await self.esp_repo.get_by_device_id(device_id)
        if not device:
            logger.warning(f"Zone ACK from unknown ESP: {device_id}")
            return False

        if status == "zone_assigned":
            # Confirm zone assignment
            device.zone_id = zone_id if zone_id else None
            device.master_zone_id = master_zone_id if master_zone_id else None

            # Clear pending assignment
            if device.device_metadata and "pending_zone_assignment" in device.device_metadata:
                del device.device_metadata["pending_zone_assignment"]

            logger.info(
                f"Zone assignment confirmed for {device_id}: "
                f"zone_id={zone_id}, master_zone_id={master_zone_id}"
            )
            return True

        elif status == "error":
            # Log error but keep pending assignment for retry
            logger.error(
                f"Zone assignment failed for {device_id}: {message or 'Unknown error'}"
            )
            return False

        else:
            logger.warning(f"Unknown zone ACK status from {device_id}: {status}")
            return False

    # =========================================================================
    # Zone Queries
    # =========================================================================

    async def get_zone_esps(self, zone_id: str) -> list[ESPDevice]:
        """
        Get all ESPs assigned to a specific zone.

        Args:
            zone_id: Zone identifier

        Returns:
            List of ESPDevice objects in the zone
        """
        return await self.esp_repo.get_by_zone(zone_id)

    async def get_master_zone_esps(self, master_zone_id: str) -> list[ESPDevice]:
        """
        Get all ESPs in a master zone hierarchy.

        Args:
            master_zone_id: Master zone identifier

        Returns:
            List of ESPDevice objects in the master zone
        """
        return await self.esp_repo.get_by_master_zone(master_zone_id)

    async def get_unassigned_esps(self) -> list[ESPDevice]:
        """
        Get all ESPs without zone assignment.

        Returns:
            List of ESPDevice objects without zone_id
        """
        # Get all ESPs and filter for those without zone_id
        all_esps = await self.esp_repo.get_all()
        return [esp for esp in all_esps if not esp.zone_id]

    # =========================================================================
    # Internal Methods
    # =========================================================================

    def _publish_zone_assignment(
        self,
        topic: str,
        payload: Dict[str, Any],
    ) -> bool:
        """
        Publish zone assignment message via MQTT.

        Args:
            topic: MQTT topic
            payload: Zone assignment payload

        Returns:
            True if publish successful
        """
        import json

        try:
            payload_str = json.dumps(payload)
        except Exception as e:
            logger.error(f"Failed to serialize zone payload: {e}")
            return False

        # Use QoS 1 (At least once) for zone assignment
        # This ensures delivery while allowing for duplicate handling by ESP
        qos = constants.QOS_SENSOR_DATA  # QoS 1

        success = self.publisher.client.publish(topic, payload_str, qos)

        if success:
            logger.debug(f"Zone assignment published to {topic}")
        else:
            logger.error(f"Zone assignment publish failed to {topic}")

        return success
