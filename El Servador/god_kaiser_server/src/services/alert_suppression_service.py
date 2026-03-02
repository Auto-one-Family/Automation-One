"""
Alert Suppression Service: Per-Sensor/Device Alert Suppression (ISA-18.2)

Phase 4A.7: Per-Sensor Alert Configuration
Priority: HIGH
Status: IMPLEMENTED

Checks whether a sensor or device is currently suppressed.
Alerts are ALWAYS evaluated and persisted — only NOTIFICATIONS are suppressed.
This follows the ISA-18.2 "Shelved Alarms" pattern.

Suppression reasons:
- maintenance: Device is under maintenance
- intentionally_offline: Device is intentionally offline
- calibration: Sensor is being calibrated
- custom: User-provided reason

Auto re-enable: suppression_until field checked by scheduler task.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from ..core.logging_config import get_logger
from ..db.repositories import ESPRepository, SensorRepository

logger = get_logger(__name__)


# Valid suppression reasons
SUPPRESSION_REASONS = [
    "maintenance",
    "intentionally_offline",
    "calibration",
    "custom",
]


class AlertSuppressionService:
    """
    Checks suppression status for sensors, actuators, and devices.

    Suppression hierarchy:
    1. Device-level suppression (propagate_to_children=True) → all children suppressed
    2. Sensor/Actuator-level suppression → only that sensor/actuator suppressed
    """

    def __init__(self, session: AsyncSession):
        self.session = session
        self.esp_repo = ESPRepository(session)
        self.sensor_repo = SensorRepository(session)

    async def is_sensor_suppressed(
        self,
        sensor_config,
    ) -> tuple[bool, Optional[str]]:
        """
        Check if a sensor's notifications are suppressed.

        Returns:
            (is_suppressed, reason) tuple.
            reason is None if not suppressed.
        """
        # Check sensor-level suppression
        alert_cfg = sensor_config.alert_config or {}
        if not alert_cfg.get("alerts_enabled", True):
            # Check if suppression has expired
            suppression_until = alert_cfg.get("suppression_until")
            if suppression_until:
                try:
                    until_dt = datetime.fromisoformat(suppression_until)
                    if until_dt.tzinfo is None:
                        until_dt = until_dt.replace(tzinfo=timezone.utc)
                    if datetime.now(timezone.utc) > until_dt:
                        # Expired — not suppressed (scheduler will clean up)
                        return False, None
                except (ValueError, TypeError):
                    pass

            reason = alert_cfg.get("suppression_reason", "custom")
            return True, f"sensor:{reason}"

        # Check device-level propagation
        esp_device = await self.esp_repo.get_by_id(sensor_config.esp_id)
        if esp_device:
            device_suppressed, device_reason = self._check_device_suppression(
                esp_device
            )
            if device_suppressed:
                return True, f"device:{device_reason}"

        return False, None

    async def is_actuator_suppressed(
        self,
        actuator_config,
    ) -> tuple[bool, Optional[str]]:
        """Check if an actuator's notifications are suppressed."""
        alert_cfg = actuator_config.alert_config or {}
        if not alert_cfg.get("alerts_enabled", True):
            suppression_until = alert_cfg.get("suppression_until")
            if suppression_until:
                try:
                    until_dt = datetime.fromisoformat(suppression_until)
                    if until_dt.tzinfo is None:
                        until_dt = until_dt.replace(tzinfo=timezone.utc)
                    if datetime.now(timezone.utc) > until_dt:
                        return False, None
                except (ValueError, TypeError):
                    pass

            reason = alert_cfg.get("suppression_reason", "custom")
            return True, f"actuator:{reason}"

        esp_device = await self.esp_repo.get_by_id(actuator_config.esp_id)
        if esp_device:
            device_suppressed, device_reason = self._check_device_suppression(
                esp_device
            )
            if device_suppressed:
                return True, f"device:{device_reason}"

        return False, None

    async def is_device_suppressed(
        self,
        esp_device,
    ) -> tuple[bool, Optional[str]]:
        """Check if a device's notifications are suppressed."""
        return self._check_device_suppression(esp_device)

    def _check_device_suppression(
        self, esp_device
    ) -> tuple[bool, Optional[str]]:
        """Check device-level suppression (synchronous, no DB call)."""
        alert_cfg = esp_device.alert_config or {}
        if not alert_cfg.get("alerts_enabled", True):
            propagate = alert_cfg.get("propagate_to_children", True)
            suppression_until = alert_cfg.get("suppression_until")

            if suppression_until:
                try:
                    until_dt = datetime.fromisoformat(suppression_until)
                    if until_dt.tzinfo is None:
                        until_dt = until_dt.replace(tzinfo=timezone.utc)
                    if datetime.now(timezone.utc) > until_dt:
                        return False, None
                except (ValueError, TypeError):
                    pass

            reason = alert_cfg.get("suppression_reason", "custom")
            if propagate:
                return True, reason
            # Device suppressed but not propagating to children
            return True, reason

        return False, None

    def get_effective_thresholds(self, sensor_config) -> Optional[dict]:
        """
        Get effective thresholds for a sensor.

        Priority: sensor alert_config custom_thresholds > sensor_config.thresholds

        Returns:
            Dict with warning_min, warning_max, critical_min, critical_max
            or None if no thresholds configured.
        """
        # Check custom thresholds in alert_config first
        alert_cfg = sensor_config.alert_config or {}
        custom = alert_cfg.get("custom_thresholds")
        if custom and any(v is not None for v in custom.values()):
            return custom

        # Fall back to global thresholds on sensor_config
        thresholds = sensor_config.thresholds
        if thresholds:
            return {
                "warning_min": thresholds.get("warning_min", thresholds.get("min")),
                "warning_max": thresholds.get("warning_max", thresholds.get("max")),
                "critical_min": thresholds.get("critical_min"),
                "critical_max": thresholds.get("critical_max"),
            }

        return None

    def check_thresholds(
        self, value: float, thresholds: dict
    ) -> Optional[str]:
        """
        Check a value against thresholds and return severity.

        Returns:
            'critical', 'warning', or None if within bounds.
        """
        critical_min = thresholds.get("critical_min")
        critical_max = thresholds.get("critical_max")
        warning_min = thresholds.get("warning_min")
        warning_max = thresholds.get("warning_max")

        # Critical check first (highest priority)
        if critical_min is not None and value < critical_min:
            return "critical"
        if critical_max is not None and value > critical_max:
            return "critical"

        # Warning check
        if warning_min is not None and value < warning_min:
            return "warning"
        if warning_max is not None and value > warning_max:
            return "warning"

        return None

    def get_severity_override(self, sensor_config) -> Optional[str]:
        """Get severity override from alert_config, if any."""
        alert_cfg = sensor_config.alert_config or {}
        return alert_cfg.get("severity_override")
