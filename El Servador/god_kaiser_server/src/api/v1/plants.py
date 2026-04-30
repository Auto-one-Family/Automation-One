"""
Plant Entity CRUD API Endpoints (AUT-222 — Phyta Plants Schema).

Provides:
- POST   /v1/plants                       - Create a new plant (auto QR code)
- GET    /v1/plants                       - List active plants (filter by kaiser_id, phase)
- GET    /v1/plants/{plant_id}            - Get plant by plant_id
- PATCH  /v1/plants/{plant_id}            - Partial update
- GET    /v1/plants/{plant_id}/qr-code.png - PNG QR-code label
"""

import io
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Response, status

from ...core.logging_config import get_logger
from ...db.models.audit_log import (
    AuditSeverity,
    AuditSourceType,
)
from ...db.repositories.audit_log_repo import AuditLogRepository
from ...db.repositories.plant_repo import PlantRepository
from ...schemas.plant import (
    PlantCreate,
    PlantListResponse,
    PlantResponse,
    PlantUpdate,
)
from ..deps import ActiveUser, DBSession, OperatorUser

logger = get_logger(__name__)

router = APIRouter(prefix="/v1/plants", tags=["plants"])


# Audit event type constants — kept local to avoid bloating the global
# AuditEventType class for a single feature area.
_EVENT_PLANT_CREATED = "plant_created"
_EVENT_PLANT_UPDATED = "plant_updated"


async def _audit_safe(
    db,
    *,
    event_type: str,
    severity: str,
    source_id: str,
    message: str,
    details: dict,
) -> None:
    """Best-effort audit logging — never blocks the request on failure."""
    try:
        audit_repo = AuditLogRepository(db)
        await audit_repo.create(
            event_type=event_type,
            severity=severity,
            source_type=AuditSourceType.API,
            source_id=source_id,
            status="success",
            message=message,
            details=details,
        )
    except Exception as exc:  # pragma: no cover - audit must never fail caller
        logger.warning("Failed to write audit log for %s: %s", event_type, exc)


@router.post(
    "",
    response_model=PlantResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Plant",
    description=(
        "Create a new plant. A QR code (``PL-XXXXXXXX``) is generated server-side "
        "and ``external_plant_id`` is initialised to the same value. Both can be "
        "overridden later via PATCH."
    ),
    responses={
        201: {"description": "Plant created successfully"},
    },
)
async def create_plant(
    request: PlantCreate,
    db: DBSession,
    current_user: OperatorUser,
) -> PlantResponse:
    plant_repo = PlantRepository(db)

    # Generate QR code once and use as default external_plant_id.
    from ...db.models.plant import _generate_qr_code  # local import to keep API surface clean

    qr_code = _generate_qr_code()

    plant = await plant_repo.create(
        genotype_label=request.genotype_label,
        planting_date=request.planting_date,
        phase=request.phase,
        kaiser_id=request.kaiser_id,
        cultivar_or_variety=request.cultivar_or_variety,
        batch_label=request.batch_label,
        subzone_id=request.subzone_id,
        notes=request.notes,
        qr_code=qr_code,
        external_plant_id=qr_code,
    )
    await db.commit()
    await db.refresh(plant)

    await _audit_safe(
        db,
        event_type=_EVENT_PLANT_CREATED,
        severity=AuditSeverity.INFO,
        source_id=str(current_user.id),
        message=f"Plant created by {current_user.username}",
        details={
            "plant_id": str(plant.plant_id),
            "qr_code": plant.qr_code,
            "kaiser_id": plant.kaiser_id,
            "phase": plant.phase,
            "genotype_label": plant.genotype_label,
        },
    )
    await db.commit()

    logger.info(
        "Plant created by %s: plant_id=%s, qr_code=%s",
        current_user.username,
        plant.plant_id,
        plant.qr_code,
    )

    return PlantResponse.model_validate(plant)


@router.get(
    "",
    response_model=PlantListResponse,
    summary="List Plants",
    description="List active (non-soft-deleted) plants. Supports filtering by kaiser_id and phase.",
)
async def list_plants(
    db: DBSession,
    _user: ActiveUser,
    kaiser_id: Optional[str] = Query(
        None, description="Filter by tenant (kaiser_id)"
    ),
    phase: Optional[str] = Query(
        None, description="Filter by lifecycle phase"
    ),
    limit: int = Query(50, ge=1, le=500, description="Maximum number of rows"),
    skip: int = Query(0, ge=0, description="Pagination offset"),
) -> PlantListResponse:
    plant_repo = PlantRepository(db)
    plants = await plant_repo.get_active(
        kaiser_id=kaiser_id,
        phase=phase,
        skip=skip,
        limit=limit,
    )

    return PlantListResponse(
        plants=[PlantResponse.model_validate(p) for p in plants],
        total=len(plants),
    )


@router.get(
    "/{plant_id}",
    response_model=PlantResponse,
    summary="Get Plant",
    responses={
        200: {"description": "Plant found"},
        404: {"description": "Plant not found"},
    },
)
async def get_plant(
    plant_id: uuid.UUID,
    db: DBSession,
    _user: ActiveUser,
) -> PlantResponse:
    plant_repo = PlantRepository(db)
    plant = await plant_repo.get_by_plant_id(plant_id)

    if plant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plant '{plant_id}' not found",
        )

    return PlantResponse.model_validate(plant)


@router.patch(
    "/{plant_id}",
    response_model=PlantResponse,
    summary="Partial Update Plant",
    description="Partially update a plant. Only provided fields are changed.",
    responses={
        200: {"description": "Plant updated"},
        400: {"description": "No fields to update"},
        404: {"description": "Plant not found"},
    },
)
async def patch_plant(
    plant_id: uuid.UUID,
    request: PlantUpdate,
    db: DBSession,
    current_user: OperatorUser,
) -> PlantResponse:
    update_data = request.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    plant_repo = PlantRepository(db)
    plant = await plant_repo.get_by_plant_id(plant_id)
    if plant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plant '{plant_id}' not found",
        )

    # Note: BaseRepository.update keys on ``id`` but Plant's PK is ``plant_id``.
    # We update fields directly on the instance for clarity and correctness.
    for key, value in update_data.items():
        setattr(plant, key, value)

    await db.flush()
    await db.commit()
    await db.refresh(plant)

    await _audit_safe(
        db,
        event_type=_EVENT_PLANT_UPDATED,
        severity=AuditSeverity.INFO,
        source_id=str(current_user.id),
        message=f"Plant patched by {current_user.username}",
        details={
            "plant_id": str(plant.plant_id),
            "fields": sorted(update_data.keys()),
        },
    )
    await db.commit()

    logger.info(
        "Plant patched by %s: plant_id=%s, fields=%s",
        current_user.username,
        plant.plant_id,
        sorted(update_data.keys()),
    )
    return PlantResponse.model_validate(plant)


@router.get(
    "/{plant_id}/qr-code.png",
    summary="Plant QR-Code PNG",
    description=(
        "Render the plant QR code as a PNG label. The encoded payload is the "
        "plant's ``qr_code`` value (e.g. ``PL-A1B2C3D4``)."
    ),
    responses={
        200: {
            "description": "PNG image",
            "content": {"image/png": {}},
        },
        404: {"description": "Plant not found"},
        500: {"description": "QR rendering failed (qrcode library missing)"},
    },
)
async def get_plant_qr_code_png(
    plant_id: uuid.UUID,
    db: DBSession,
    _user: ActiveUser,
) -> Response:
    plant_repo = PlantRepository(db)
    plant = await plant_repo.get_by_plant_id(plant_id)
    if plant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plant '{plant_id}' not found",
        )

    try:
        import qrcode  # type: ignore
    except ImportError as exc:
        logger.error("qrcode library not available: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="QR code rendering is not available (qrcode library not installed)",
        )

    qr = qrcode.QRCode(box_size=6, border=2)
    qr.add_data(plant.qr_code)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    return Response(
        content=buf.getvalue(),
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=86400",
            "Content-Disposition": f'inline; filename="{plant.qr_code}.png"',
        },
    )
