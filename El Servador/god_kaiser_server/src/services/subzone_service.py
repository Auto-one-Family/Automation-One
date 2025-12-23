"""
Subzone Service - Business Logic for Subzone Operations

Phase: 9 - Subzone Management
Status: IMPLEMENTED

Provides:
- Subzone assignment via MQTT
- Subzone removal via MQTT
- Subzone ACK handling from ESP32
- Safe-mode control for subzones
- Subzone queries

This service provides shared business logic used by:
- REST API endpoints (api/v1/subzone.py)
- MQTT handlers (mqtt/handlers/subzone_ack_handler.py)

MQTT Protocol:
- Assignment: kaiser/{kaiser_id}/esp/{esp_id}/subzone/assign
- Removal: kaiser/{kaiser_id}/esp/{esp_id}/subzone/remove
- ACK: kaiser/{kaiser_id}/esp/{esp_id}/subzone/ack
- Safe: kaiser/{kaiser_id}/esp/{esp_id}/subzone/safe

References:
- El Trabajante/docs/system-flows/09-subzone-management-flow.md
- .claude/CLAUDE_SERVER.md
"""

import json
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import constants
from ..core.logging_config import get_logger
from ..db.models.subzone import SubzoneConfig
from ..db.repositories import ESPRepository
from ..mqtt.publisher import Publisher
from ..mqtt.topics import TopicBuilder
from ..schemas.subzone import (
    SafeModeResponse,
    SubzoneAssignResponse,
    SubzoneInfo,
    SubzoneListResponse,
    SubzoneRemoveResponse,
)

logger = get_logger(__name__)


class SubzoneService:
    """
    Subzone assignment and management business logic service.

    Handles subzone assignment, removal, safe-mode control, and ACK processing.
    Follows the same patterns as ZoneService for consistency.
    """

    def __init__(
        self,
        esp_repo: ESPRepository,
        session: Optional[AsyncSession] = None,
        publisher: Optional[Publisher] = None,
    ):
        """
        Initialize SubzoneService.

        Args:
            esp_repo: ESP repository for database operations
            session: SQLAlchemy async session (for subzone queries)
            publisher: MQTT publisher (optional, created if not provided)
        """
        self.esp_repo = esp_repo
        self.session = session or esp_repo.session
        self.publisher = publisher or Publisher()
        # Get kaiser_id from constants helper
        self.kaiser_id = constants.get_kaiser_id()

    # =========================================================================
    # Subzone Assignment
    # =========================================================================

    async def assign_subzone(
        self,
        device_id: str,
        subzone_id: str,
        assigned_gpios: List[int],
        subzone_name: Optional[str] = None,
        parent_zone_id: Optional[str] = None,
        safe_mode_active: bool = True,
    ) -> SubzoneAssignResponse:
        """
        Assign GPIO pins to a subzone via MQTT.

        Flow:
        1. Validate ESP exists and has zone assigned
        2. Build and publish MQTT subzone assignment message
        3. Store pending assignment in DB (confirmed on ACK)
        4. Return response (actual confirmation comes via subzone/ack topic)

        Args:
            device_id: ESP device ID (e.g., "ESP_AB12CD")
            subzone_id: Unique subzone identifier
            assigned_gpios: List of GPIO pin numbers
            subzone_name: Human-readable subzone name (optional)
            parent_zone_id: Parent zone ID (optional, defaults to ESP's zone_id)
            safe_mode_active: Whether subzone starts in safe-mode (default: True)

        Returns:
            SubzoneAssignResponse with assignment status

        Raises:
            ValueError: If ESP device not found or has no zone assigned
        """
        # 1. Find ESP device
        device = await self.esp_repo.get_by_device_id(device_id)
        if not device:
            logger.warning(f"Subzone assignment failed: ESP {device_id} not found")
            raise ValueError(f"ESP device '{device_id}' not found")

        # 2. Validate zone is assigned (CRITICAL - Subzone requires Zone)
        if not device.zone_id:
            logger.warning(
                f"Subzone assignment failed: ESP {device_id} has no zone assigned"
            )
            raise ValueError(
                f"ESP device '{device_id}' has no zone assigned. "
                "Assign a zone before creating subzones."
            )

        # 3. Use ESP's zone_id if parent_zone_id not provided
        actual_parent_zone_id = parent_zone_id or device.zone_id

        # 4. Validate parent_zone_id matches ESP's zone_id
        if actual_parent_zone_id != device.zone_id:
            logger.warning(
                f"Subzone assignment: parent_zone_id '{actual_parent_zone_id}' "
                f"doesn't match ESP zone_id '{device.zone_id}'"
            )
            raise ValueError(
                f"parent_zone_id '{actual_parent_zone_id}' must match "
                f"ESP's zone_id '{device.zone_id}'"
            )

        # 5. Build MQTT topic
        topic = TopicBuilder.build_subzone_assign_topic(device_id)

        # 6. Build payload (matches ESP32 expectations from system_types.h)
        payload = {
            "subzone_id": subzone_id,
            "subzone_name": subzone_name or "",
            "parent_zone_id": actual_parent_zone_id,
            "assigned_gpios": assigned_gpios,
            "safe_mode_active": safe_mode_active,
            "sensor_count": 0,  # Will be updated by ESP
            "actuator_count": 0,  # Will be updated by ESP
            "timestamp": int(time.time()),
        }

        # 7. Publish via MQTT (QoS 1 - At least once)
        mqtt_sent = self._publish_subzone_message(topic, payload)

        if mqtt_sent:
            # 8. Create or update pending subzone in DB
            await self._upsert_subzone_config(
                device_id=device_id,
                subzone_id=subzone_id,
                subzone_name=subzone_name,
                parent_zone_id=actual_parent_zone_id,
                assigned_gpios=assigned_gpios,
                safe_mode_active=safe_mode_active,
            )

            logger.info(
                f"Subzone assignment sent to {device_id}: "
                f"subzone_id={subzone_id}, gpios={assigned_gpios}"
            )
        else:
            logger.error(f"Subzone assignment MQTT publish failed for {device_id}")

        return SubzoneAssignResponse(
            success=mqtt_sent,
            message=(
                "Subzone assignment sent to ESP"
                if mqtt_sent
                else "MQTT publish failed"
            ),
            device_id=device_id,
            subzone_id=subzone_id,
            assigned_gpios=assigned_gpios,
            mqtt_topic=topic,
            mqtt_sent=mqtt_sent,
        )

    async def remove_subzone(
        self,
        device_id: str,
        subzone_id: str,
        reason: str = "manual",
    ) -> SubzoneRemoveResponse:
        """
        Remove a subzone from ESP device.

        Args:
            device_id: ESP device ID
            subzone_id: Subzone to remove
            reason: Reason for removal

        Returns:
            SubzoneRemoveResponse with removal status
        """
        # 1. Find ESP device
        device = await self.esp_repo.get_by_device_id(device_id)
        if not device:
            raise ValueError(f"ESP device '{device_id}' not found")

        # 2. Build MQTT topic
        topic = TopicBuilder.build_subzone_remove_topic(device_id)

        # 3. Build payload
        payload = {
            "subzone_id": subzone_id,
            "reason": reason,
            "timestamp": int(time.time()),
        }

        # 4. Publish via MQTT
        mqtt_sent = self._publish_subzone_message(topic, payload)

        if mqtt_sent:
            logger.info(f"Subzone removal sent to {device_id}: subzone_id={subzone_id}")
        else:
            logger.error(f"Subzone removal MQTT publish failed for {device_id}")

        return SubzoneRemoveResponse(
            success=mqtt_sent,
            message="Subzone removal sent to ESP" if mqtt_sent else "MQTT publish failed",
            device_id=device_id,
            subzone_id=subzone_id,
            mqtt_topic=topic,
            mqtt_sent=mqtt_sent,
        )

    # =========================================================================
    # Safe-Mode Control
    # =========================================================================

    async def enable_safe_mode(
        self,
        device_id: str,
        subzone_id: str,
        reason: str = "manual",
    ) -> SafeModeResponse:
        """
        Enable safe-mode for a subzone.

        All GPIO pins in the subzone will be set to INPUT_PULLUP.

        Args:
            device_id: ESP device ID
            subzone_id: Subzone to put in safe-mode
            reason: Reason for safe-mode activation

        Returns:
            SafeModeResponse with result
        """
        device = await self.esp_repo.get_by_device_id(device_id)
        if not device:
            raise ValueError(f"ESP device '{device_id}' not found")

        topic = TopicBuilder.build_subzone_safe_topic(device_id)
        payload = {
            "subzone_id": subzone_id,
            "action": "enable",
            "reason": reason,
            "timestamp": int(time.time()),
        }

        mqtt_sent = self._publish_subzone_message(topic, payload)

        return SafeModeResponse(
            success=mqtt_sent,
            message="Safe-mode enable sent to ESP" if mqtt_sent else "MQTT publish failed",
            device_id=device_id,
            subzone_id=subzone_id,
            safe_mode_active=True,
            mqtt_sent=mqtt_sent,
        )

    async def disable_safe_mode(
        self,
        device_id: str,
        subzone_id: str,
        reason: str = "manual",
    ) -> SafeModeResponse:
        """
        Disable safe-mode for a subzone.

        WARNING: This allows actuators to be controlled. Use with caution.

        Args:
            device_id: ESP device ID
            subzone_id: Subzone to take out of safe-mode
            reason: Reason for safe-mode deactivation

        Returns:
            SafeModeResponse with result
        """
        device = await self.esp_repo.get_by_device_id(device_id)
        if not device:
            raise ValueError(f"ESP device '{device_id}' not found")

        topic = TopicBuilder.build_subzone_safe_topic(device_id)
        payload = {
            "subzone_id": subzone_id,
            "action": "disable",
            "reason": reason,
            "timestamp": int(time.time()),
        }

        mqtt_sent = self._publish_subzone_message(topic, payload)

        return SafeModeResponse(
            success=mqtt_sent,
            message="Safe-mode disable sent to ESP" if mqtt_sent else "MQTT publish failed",
            device_id=device_id,
            subzone_id=subzone_id,
            safe_mode_active=False,
            mqtt_sent=mqtt_sent,
        )

    # =========================================================================
    # Subzone ACK Handling
    # =========================================================================

    async def handle_subzone_ack(
        self,
        device_id: str,
        status: str,
        subzone_id: str,
        timestamp: int = 0,
        error_code: Optional[int] = None,
        message: Optional[str] = None,
    ) -> bool:
        """
        Handle subzone assignment acknowledgment from ESP.

        Called by subzone_ack_handler when ESP confirms subzone assignment.

        Args:
            device_id: ESP device ID
            status: "subzone_assigned", "subzone_removed", or "error"
            subzone_id: Processed subzone ID
            timestamp: ACK timestamp (Unix seconds)
            error_code: Error code (if status == "error")
            message: Error message (if status == "error")

        Returns:
            True if ACK processed successfully
        """
        if status == "subzone_assigned":
            # Update subzone record to confirm assignment
            await self._confirm_subzone_assignment(device_id, subzone_id)
            logger.info(
                f"Subzone assignment confirmed for {device_id}: subzone_id={subzone_id}"
            )
            return True

        elif status == "subzone_removed":
            # Delete subzone record
            await self._delete_subzone_config(device_id, subzone_id)
            logger.info(
                f"Subzone removal confirmed for {device_id}: subzone_id={subzone_id}"
            )
            return True

        elif status == "error":
            logger.error(
                f"Subzone operation failed for {device_id}: "
                f"subzone_id={subzone_id}, error_code={error_code}, message={message}"
            )
            # Keep the record for retry, but mark as failed
            return False

        else:
            logger.warning(f"Unknown subzone ACK status from {device_id}: {status}")
            return False

    # =========================================================================
    # Subzone Queries
    # =========================================================================

    async def get_esp_subzones(self, device_id: str) -> SubzoneListResponse:
        """
        Get all subzones for an ESP device.

        Args:
            device_id: ESP device ID

        Returns:
            SubzoneListResponse with all subzones
        """
        device = await self.esp_repo.get_by_device_id(device_id)
        if not device:
            raise ValueError(f"ESP device '{device_id}' not found")

        # Query subzones from DB
        result = await self.session.execute(
            select(SubzoneConfig).where(SubzoneConfig.esp_id == device_id)
        )
        subzone_configs = result.scalars().all()

        subzones = [
            SubzoneInfo(
                subzone_id=sc.subzone_id,
                subzone_name=sc.subzone_name,
                parent_zone_id=sc.parent_zone_id,
                assigned_gpios=sc.assigned_gpios or [],
                safe_mode_active=sc.safe_mode_active,
                sensor_count=sc.sensor_count,
                actuator_count=sc.actuator_count,
                created_at=sc.created_at.isoformat() if sc.created_at else None,
            )
            for sc in subzone_configs
        ]

        return SubzoneListResponse(
            success=True,
            message=f"Found {len(subzones)} subzones",
            device_id=device_id,
            zone_id=device.zone_id,
            subzones=subzones,
            total_count=len(subzones),
        )

    async def get_subzone(
        self, device_id: str, subzone_id: str
    ) -> Optional[SubzoneInfo]:
        """
        Get a specific subzone.

        Args:
            device_id: ESP device ID
            subzone_id: Subzone ID

        Returns:
            SubzoneInfo or None if not found
        """
        result = await self.session.execute(
            select(SubzoneConfig).where(
                SubzoneConfig.esp_id == device_id,
                SubzoneConfig.subzone_id == subzone_id,
            )
        )
        sc = result.scalar_one_or_none()

        if not sc:
            return None

        return SubzoneInfo(
            subzone_id=sc.subzone_id,
            subzone_name=sc.subzone_name,
            parent_zone_id=sc.parent_zone_id,
            assigned_gpios=sc.assigned_gpios or [],
            safe_mode_active=sc.safe_mode_active,
            sensor_count=sc.sensor_count,
            actuator_count=sc.actuator_count,
            created_at=sc.created_at.isoformat() if sc.created_at else None,
        )

    # =========================================================================
    # Internal Methods
    # =========================================================================

    def _publish_subzone_message(
        self,
        topic: str,
        payload: Dict[str, Any],
    ) -> bool:
        """
        Publish subzone message via MQTT.

        Args:
            topic: MQTT topic
            payload: Message payload

        Returns:
            True if publish successful
        """
        try:
            payload_str = json.dumps(payload)
        except Exception as e:
            logger.error(f"Failed to serialize subzone payload: {e}")
            return False

        # Use QoS 1 (At least once) for subzone operations
        qos = constants.QOS_SENSOR_DATA  # QoS 1

        success = self.publisher.client.publish(topic, payload_str, qos)

        if success:
            logger.debug(f"Subzone message published to {topic}")
        else:
            logger.error(f"Subzone message publish failed to {topic}")

        return success

    async def _upsert_subzone_config(
        self,
        device_id: str,
        subzone_id: str,
        subzone_name: Optional[str],
        parent_zone_id: str,
        assigned_gpios: List[int],
        safe_mode_active: bool,
    ) -> None:
        """
        Create or update subzone configuration in DB.

        Note: Flushes to make changes visible for subsequent queries.
        Caller is responsible for commit() or rollback().
        """
        # Check if subzone exists
        result = await self.session.execute(
            select(SubzoneConfig).where(
                SubzoneConfig.esp_id == device_id,
                SubzoneConfig.subzone_id == subzone_id,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Update existing
            existing.subzone_name = subzone_name
            existing.parent_zone_id = parent_zone_id
            existing.assigned_gpios = assigned_gpios
            existing.safe_mode_active = safe_mode_active
        else:
            # Create new
            new_config = SubzoneConfig(
                esp_id=device_id,
                subzone_id=subzone_id,
                subzone_name=subzone_name,
                parent_zone_id=parent_zone_id,
                assigned_gpios=assigned_gpios,
                safe_mode_active=safe_mode_active,
            )
            self.session.add(new_config)

        # Flush to make changes visible for subsequent queries
        await self.session.flush()

    async def _confirm_subzone_assignment(
        self, device_id: str, subzone_id: str
    ) -> None:
        """
        Confirm subzone assignment (update last_ack_at).

        Note: Flushes to make changes visible for subsequent queries.
        Caller is responsible for commit() or rollback().
        """
        result = await self.session.execute(
            select(SubzoneConfig).where(
                SubzoneConfig.esp_id == device_id,
                SubzoneConfig.subzone_id == subzone_id,
            )
        )
        config = result.scalar_one_or_none()

        if config:
            config.last_ack_at = datetime.now(timezone.utc)
            await self.session.flush()

    async def _delete_subzone_config(self, device_id: str, subzone_id: str) -> None:
        """
        Delete subzone configuration from DB.

        Note: Flushes to make changes visible for subsequent queries.
        Caller is responsible for commit() or rollback().
        """
        result = await self.session.execute(
            select(SubzoneConfig).where(
                SubzoneConfig.esp_id == device_id,
                SubzoneConfig.subzone_id == subzone_id,
            )
        )
        config = result.scalar_one_or_none()

        if config:
            await self.session.delete(config)
            await self.session.flush()

