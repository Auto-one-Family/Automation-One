"""
Zone Assignment API Endpoint

Phase: 7 - Zone Management
Priority: HIGH
Status: IMPLEMENTED

Provides:
- POST /zone/devices/{esp_id}/assign - Assign ESP to zone
- DELETE /zone/devices/{esp_id}/assign - Remove zone assignment
- GET /zone/devices/{esp_id} - Get zone info for ESP
- GET /zone/{zone_id}/devices - Get all ESPs in zone
- GET /zone/unassigned - Get ESPs without zone assignment

Zone assignment flow:
1. Frontend calls POST /zone/devices/{esp_id}/assign
2. Server publishes to MQTT: kaiser/{kaiser_id}/esp/{esp_id}/zone/assign
3. ESP receives, saves to NVS, sends ACK via zone/ack topic
4. Server receives ACK, updates DB, broadcasts WebSocket event

References:
- El Trabajante/docs/system-flows/08-zone-assignment-flow.md
- .claude/README.md (Developer Briefing)
"""

from typing import List

from fastapi import APIRouter, status

from ...core.exceptions import ESPNotFoundError
from ...core.logging_config import get_logger
from ...db.repositories import ESPRepository
from ...schemas.monitor import ZoneMonitorData
from ...schemas.zone import (
    ZoneAssignRequest,
    ZoneAssignResponse,
    ZoneInfo,
    ZoneListEntry,
    ZoneListResponse,
    ZoneRemoveResponse,
)
from ...services.monitor_data_service import MonitorDataService
from ...services.zone_service import ZoneService
from ..deps import DBSession, ActiveUser, OperatorUser

logger = get_logger(__name__)

router = APIRouter(prefix="/v1/zone", tags=["zone"])


# =============================================================================
# Zone Assignment Endpoints
# =============================================================================


@router.post(
    "/devices/{esp_id}/assign",
    response_model=ZoneAssignResponse,
    status_code=status.HTTP_200_OK,
    summary="Assign ESP to Zone",
    description="""
    Assign an ESP device to a zone via MQTT.

    **Flow:**
    1. Validates ESP exists in database
    2. Updates ESP zone fields (pending assignment)
    3. Publishes zone assignment to MQTT topic
    4. Returns response (actual confirmation comes via zone/ack topic)

    **MQTT Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/zone/assign`

    **Note:** ESP confirmation is asynchronous. Frontend should listen
    for WebSocket `zone_assignment` events for confirmation.
    """,
    responses={
        200: {"description": "Zone assignment saved (check mqtt_sent for MQTT status)"},
        404: {"description": "ESP device not found"},
    },
)
async def assign_zone(
    esp_id: str,
    request: ZoneAssignRequest,
    db: DBSession,
    current_user: OperatorUser,
) -> ZoneAssignResponse:
    """
    Assign ESP device to a zone.

    Args:
        esp_id: ESP device ID (e.g., "ESP_12AB34CD")
        request: Zone assignment request with zone_id, master_zone_id, zone_name
        db: Database session
        current_user: Authenticated operator/admin user

    Returns:
        ZoneAssignResponse with assignment status
    """
    esp_repo = ESPRepository(db)
    zone_service = ZoneService(esp_repo)

    try:
        result = await zone_service.assign_zone(
            device_id=esp_id,
            zone_id=request.zone_id,
            master_zone_id=request.master_zone_id,
            zone_name=request.zone_name,
        )

        # Commit the zone assignment to DB
        await db.commit()

        if result.mqtt_sent:
            logger.info(
                f"Zone assignment for {esp_id} by {current_user.username}: "
                f"zone_id={request.zone_id} (MQTT sent)"
            )
        else:
            # Log warning but don't fail - DB was updated, MQTT can be retried
            # This is expected for Mock ESPs or offline devices
            logger.warning(
                f"Zone assignment for {esp_id} by {current_user.username}: "
                f"zone_id={request.zone_id} (MQTT offline - DB updated)"
            )

        return result

    except ValueError:
        raise ESPNotFoundError(esp_id)


@router.delete(
    "/devices/{esp_id}/zone",
    response_model=ZoneRemoveResponse,
    status_code=status.HTTP_200_OK,
    summary="Remove Zone Assignment",
    description="""
    Remove zone assignment from an ESP device.

    Sends empty zone assignment to ESP to clear its zone configuration.

    **Note:** ESP confirmation is asynchronous.
    """,
    responses={
        200: {"description": "Zone removed (check mqtt_sent for MQTT status)"},
        404: {"description": "ESP device not found"},
    },
)
async def remove_zone(
    esp_id: str,
    db: DBSession,
    current_user: OperatorUser,
) -> ZoneRemoveResponse:
    """
    Remove zone assignment from ESP device.

    Args:
        esp_id: ESP device ID
        db: Database session
        current_user: Authenticated operator/admin user

    Returns:
        ZoneRemoveResponse with removal status
    """
    esp_repo = ESPRepository(db)
    zone_service = ZoneService(esp_repo)

    try:
        result = await zone_service.remove_zone(device_id=esp_id)

        # Commit the zone removal to DB
        await db.commit()

        if result.mqtt_sent:
            logger.info(f"Zone removal for {esp_id} by {current_user.username} (MQTT sent)")
        else:
            # Log warning but don't fail - DB was updated, MQTT can be retried
            # This is expected for Mock ESPs or offline devices
            logger.warning(
                f"Zone removal for {esp_id} by {current_user.username} (MQTT offline - DB updated)"
            )

        return result

    except ValueError:
        raise ESPNotFoundError(esp_id)


# =============================================================================
# Zone List Endpoint (includes empty zones from ZoneContext)
# =============================================================================


@router.get(
    "/zones",
    response_model=ZoneListResponse,
    summary="List All Zones",
    description="""
    List all zones including empty ones.

    Merges zones from:
    - Device assignments (ESPs with zone_id set)
    - ZoneContext table (zones with business context but possibly no devices)

    Empty zones (0 devices) are included so the frontend can display them.
    """,
    responses={
        200: {"description": "Zone list with device/sensor/actuator counts"},
    },
)
async def list_zones(
    db: DBSession,
    _user: ActiveUser,
) -> ZoneListResponse:
    """
    List all zones including empty ones from ZoneContext.

    Combines device-derived zones with ZoneContext entries to ensure
    zones without devices are still visible in the frontend.
    """
    from sqlalchemy import select as sa_select
    from sqlalchemy.orm import selectinload

    from ...db.models.esp import ESPDevice
    from ...db.models.zone_context import ZoneContext

    # 1. Get zones from devices (with counts)
    zone_map: dict[str, ZoneListEntry] = {}

    all_devices_stmt = (
        sa_select(ESPDevice)
        .where(ESPDevice.zone_id.isnot(None))
        .options(
            selectinload(ESPDevice.sensors),
            selectinload(ESPDevice.actuators),
        )
    )
    result = await db.execute(all_devices_stmt)
    all_devices = result.scalars().all()

    for device in all_devices:
        zid = device.zone_id
        if not zid:
            continue
        if zid not in zone_map:
            zone_map[zid] = ZoneListEntry(
                zone_id=zid,
                zone_name=device.zone_name or zid,
                device_count=0,
                sensor_count=0,
                actuator_count=0,
            )
        zone_map[zid].device_count += 1
        zone_map[zid].sensor_count += (
            len(device.sensors) if hasattr(device, "sensors") and device.sensors else 0
        )
        zone_map[zid].actuator_count += (
            len(device.actuators) if hasattr(device, "actuators") and device.actuators else 0
        )

    # 2. Merge zones from ZoneContext (adds empty zones)
    ctx_stmt = sa_select(ZoneContext)
    ctx_result = await db.execute(ctx_stmt)
    for ctx in ctx_result.scalars().all():
        if ctx.zone_id not in zone_map:
            zone_map[ctx.zone_id] = ZoneListEntry(
                zone_id=ctx.zone_id,
                zone_name=ctx.zone_name or ctx.zone_id,
                device_count=0,
                sensor_count=0,
                actuator_count=0,
            )
        elif ctx.zone_name and not zone_map[ctx.zone_id].zone_name:
            zone_map[ctx.zone_id].zone_name = ctx.zone_name

    zones = sorted(zone_map.values(), key=lambda z: z.zone_name or z.zone_id)

    return ZoneListResponse(zones=zones, total=len(zones))


# =============================================================================
# Zone Query Endpoints
# =============================================================================


@router.get(
    "/devices/{esp_id}",
    response_model=ZoneInfo,
    summary="Get Zone Info for ESP",
    description="Get current zone assignment information for an ESP device.",
    responses={
        200: {"description": "Zone info retrieved"},
        404: {"description": "ESP device not found"},
    },
)
async def get_zone_info(
    esp_id: str,
    db: DBSession,
) -> ZoneInfo:
    """
    Get zone information for an ESP device.

    Args:
        esp_id: ESP device ID
        db: Database session

    Returns:
        ZoneInfo with current zone assignment
    """
    esp_repo = ESPRepository(db)
    device = await esp_repo.get_by_device_id(esp_id)

    if not device:
        raise ESPNotFoundError(esp_id)

    return ZoneInfo(
        zone_id=device.zone_id,
        master_zone_id=device.master_zone_id,
        zone_name=device.zone_name,
        is_zone_master=device.is_zone_master,
        kaiser_id=device.kaiser_id,
    )


@router.get(
    "/{zone_id}/devices",
    response_model=List[ZoneInfo],
    summary="Get ESPs in Zone",
    description="Get all ESP devices assigned to a specific zone.",
    responses={
        200: {"description": "List of ESPs in zone"},
    },
)
async def get_zone_devices(
    zone_id: str,
    db: DBSession,
) -> List[ZoneInfo]:
    """
    Get all ESP devices in a zone.

    Args:
        zone_id: Zone identifier
        db: Database session

    Returns:
        List of ZoneInfo for ESPs in the zone
    """
    esp_repo = ESPRepository(db)
    devices = await esp_repo.get_by_zone(zone_id)

    return [
        ZoneInfo(
            zone_id=device.zone_id,
            master_zone_id=device.master_zone_id,
            zone_name=device.zone_name,
            is_zone_master=device.is_zone_master,
            kaiser_id=device.kaiser_id,
        )
        for device in devices
    ]


@router.get(
    "/{zone_id}/monitor-data",
    response_model=ZoneMonitorData,
    summary="Get Zone Monitor Data (L2)",
    description="""
    Get sensors and actuators for a zone, grouped by subzone (GPIO-based).

    Used by MonitorView L2 for subzone accordion display.
    Devices without subzone assignment appear in "Keine Subzone".
    """,
    responses={
        200: {"description": "Zone monitor data with subzone groups"},
    },
)
async def get_zone_monitor_data(
    zone_id: str,
    db: DBSession,
    _user: ActiveUser,
) -> ZoneMonitorData:
    """
    Get monitor data for a zone (sensors/actuators grouped by subzone).

    Args:
        zone_id: Zone identifier
        db: Database session
        _user: Authenticated user (required)

    Returns:
        ZoneMonitorData with subzones, sensor_count, actuator_count, alarm_count
    """
    service = MonitorDataService(db)
    return await service.get_zone_monitor_data(zone_id)


@router.get(
    "/unassigned",
    response_model=List[str],
    summary="Get Unassigned ESPs",
    description="Get device IDs of all ESPs without zone assignment.",
    responses={
        200: {"description": "List of unassigned ESP device IDs"},
    },
)
async def get_unassigned_devices(
    db: DBSession,
) -> List[str]:
    """
    Get all ESPs without zone assignment.

    Args:
        db: Database session

    Returns:
        List of device IDs without zone_id
    """
    esp_repo = ESPRepository(db)
    zone_service = ZoneService(esp_repo)
    devices = await zone_service.get_unassigned_esps()

    return [device.device_id for device in devices]
