"""
Zone/Subzone Resolver for Sensor Data (Phase 0.1)

Resolves zone_id and subzone_id for a sensor at measurement time.
Used by sensor_handler and (later) Logic Engine for Subzone-Matching.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from ..db.repositories.esp_repo import ESPRepository
    from ..db.repositories.subzone_repo import SubzoneRepository


async def resolve_zone_subzone_for_sensor(
    esp_id_str: str,
    gpio: int,
    esp_repo: "ESPRepository",
    subzone_repo: "SubzoneRepository",
) -> tuple[Optional[str], Optional[str]]:
    """
    Resolve zone_id and subzone_id for a sensor at measurement time.

    Args:
        esp_id_str: device_id of the ESP (e.g. "ESP_12AB34CD"), NOT UUID
        gpio: GPIO pin number
        esp_repo: ESPRepository instance (with session)
        subzone_repo: SubzoneRepository instance (with session)

    Returns:
        (zone_id, subzone_id) — both can be None
    """
    zone_id: Optional[str] = None
    subzone_id: Optional[str] = None

    # zone_id: from esp_devices
    esp_device = await esp_repo.get_by_device_id(esp_id_str)
    if esp_device:
        zone_id = esp_device.zone_id

    # subzone_id: from subzone_configs.assigned_gpios
    try:
        subzone_config = await subzone_repo.get_subzone_by_gpio(esp_id_str, gpio)
        if subzone_config:
            subzone_id = subzone_config.subzone_id
    except Exception:
        subzone_id = None  # Fallback: no subzone on error

    return (zone_id, subzone_id)
