"""
Zone Entity CRUD API Endpoints

Phase: 0.3 - Zone as DB Entity
Status: IMPLEMENTED

Provides:
- POST   /zones              - Create a new zone
- GET    /zones              - List all zones
- GET    /zones/{zone_id}    - Get zone by zone_id
- PUT    /zones/{zone_id}    - Update zone
- DELETE /zones/{zone_id}    - Delete zone

These endpoints manage zones as independent DB entities.
The existing zone.py router handles zone <-> ESP assignment via MQTT.
"""

from fastapi import APIRouter, HTTPException, status

from ...core.logging_config import get_logger
from ...db.repositories import ESPRepository
from ...db.repositories.zone_repo import ZoneRepository
from ...schemas.zone_entity import (
    ZoneCreate,
    ZoneDeleteResponse,
    ZoneListResponse,
    ZoneResponse,
    ZoneUpdate,
)
from ..deps import DBSession, OperatorUser

logger = get_logger(__name__)

router = APIRouter(prefix="/v1/zones", tags=["zones"])


@router.post(
    "",
    response_model=ZoneResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Zone",
    description="Create a new zone as an independent entity.",
    responses={
        201: {"description": "Zone created successfully"},
        409: {"description": "Zone with this zone_id already exists"},
    },
)
async def create_zone(
    request: ZoneCreate,
    db: DBSession,
    current_user: OperatorUser,
) -> ZoneResponse:
    zone_repo = ZoneRepository(db)

    if await zone_repo.exists_by_zone_id(request.zone_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Zone with zone_id '{request.zone_id}' already exists",
        )

    zone = await zone_repo.create(
        zone_id=request.zone_id,
        name=request.name,
        description=request.description,
    )
    await db.commit()
    await db.refresh(zone)

    logger.info(
        "Zone created by %s: zone_id=%s, name=%s",
        current_user.username, zone.zone_id, zone.name,
    )
    return ZoneResponse.model_validate(zone)


@router.get(
    "",
    response_model=ZoneListResponse,
    summary="List Zones",
    description="List all zones. Includes zones without any assigned devices.",
    responses={200: {"description": "List of all zones"}},
)
async def list_zones(
    db: DBSession,
    current_user: OperatorUser,
) -> ZoneListResponse:
    zone_repo = ZoneRepository(db)
    zones = await zone_repo.list_all()

    return ZoneListResponse(
        zones=[ZoneResponse.model_validate(z) for z in zones],
        total=len(zones),
    )


@router.get(
    "/{zone_id}",
    response_model=ZoneResponse,
    summary="Get Zone",
    description="Get a single zone by its zone_id.",
    responses={
        200: {"description": "Zone found"},
        404: {"description": "Zone not found"},
    },
)
async def get_zone(
    zone_id: str,
    db: DBSession,
    current_user: OperatorUser,
) -> ZoneResponse:
    zone_repo = ZoneRepository(db)
    zone = await zone_repo.get_by_zone_id(zone_id)

    if not zone:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Zone '{zone_id}' not found",
        )

    return ZoneResponse.model_validate(zone)


@router.put(
    "/{zone_id}",
    response_model=ZoneResponse,
    summary="Update Zone",
    description="Update zone name and/or description.",
    responses={
        200: {"description": "Zone updated"},
        404: {"description": "Zone not found"},
    },
)
async def update_zone(
    zone_id: str,
    request: ZoneUpdate,
    db: DBSession,
    current_user: OperatorUser,
) -> ZoneResponse:
    zone_repo = ZoneRepository(db)
    zone = await zone_repo.get_by_zone_id(zone_id)

    if not zone:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Zone '{zone_id}' not found",
        )

    updated = await zone_repo.update(
        id=zone.id,
        name=request.name,
        description=request.description,
    )
    await db.commit()
    await db.refresh(updated)

    logger.info(
        "Zone updated by %s: zone_id=%s",
        current_user.username, zone_id,
    )
    return ZoneResponse.model_validate(updated)


@router.delete(
    "/{zone_id}",
    response_model=ZoneDeleteResponse,
    summary="Delete Zone",
    description=(
        "Delete a zone. If devices are still assigned, a warning is included "
        "in the response but the zone is deleted anyway."
    ),
    responses={
        200: {"description": "Zone deleted (with optional device warning)"},
        404: {"description": "Zone not found"},
    },
)
async def delete_zone(
    zone_id: str,
    db: DBSession,
    current_user: OperatorUser,
) -> ZoneDeleteResponse:
    zone_repo = ZoneRepository(db)
    esp_repo = ESPRepository(db)

    zone = await zone_repo.get_by_zone_id(zone_id)
    if not zone:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Zone '{zone_id}' not found",
        )

    # Check for assigned devices (warning, not blocking)
    devices = await esp_repo.get_by_zone(zone_id)
    device_count = len(devices)
    had_devices = device_count > 0

    if had_devices:
        logger.warning(
            "Zone %s deleted by %s with %d device(s) still assigned",
            zone_id, current_user.username, device_count,
        )

    await zone_repo.delete(zone.id)
    await db.commit()

    logger.info("Zone deleted by %s: zone_id=%s", current_user.username, zone_id)

    message = "Zone deleted"
    if had_devices:
        message = f"Zone deleted (warning: {device_count} device(s) were still assigned)"

    return ZoneDeleteResponse(
        success=True,
        message=message,
        zone_id=zone_id,
        had_devices=had_devices,
        device_count=device_count,
    )
