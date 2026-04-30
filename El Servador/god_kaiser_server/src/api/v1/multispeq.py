"""MultispeQ HTTP Ingress Endpoints (AUT-217).

Endpoints:

* ``POST  /v1/sensors/multispeq/import``                 — manual upload of a
  CSV or JSON file produced by the PhotosynQ app. Parses, normalizes and
  delegates the heavy lifting to :class:`IngestService`.
* ``PATCH /v1/sensors/multispeq/{snapshot_id}/assign-plant`` — reassign a
  previously imported snapshot row to a different plant (operator UX for the
  "needs review" pile).

Both endpoints require operator privileges and are audited.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import uuid as uuid_module
from datetime import date, datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select, update

from ...core.logging_config import get_logger
from ...db.models.audit_log import AuditSeverity, AuditSourceType
from ...db.models.sensor import SensorData
from ...db.repositories.audit_log_repo import AuditLogRepository
from ...db.repositories.plant_repo import PlantRepository
from ...schemas.common import DataResponse
from ...services.multispeq_ingest_service import (
    ImportSource,
    IngestService,
)
from ..deps import DBSession, OperatorUser

logger = get_logger(__name__)

router = APIRouter(prefix="/v1/sensors/multispeq", tags=["multispeq"])


# --- Constants --------------------------------------------------------------

# Hard limit for uploaded files (10 MB). Larger payloads are rejected with 413.
MAX_UPLOAD_BYTES: int = 10 * 1024 * 1024

# Audit event types — local to this module to avoid bloating the global enum.
_EVENT_MULTISPEQ_ASSIGN_PLANT = "multispeq_assign_plant"


# --- Request schemas --------------------------------------------------------


class AssignPlantRequest(BaseModel):
    """Body for ``PATCH /multispeq/{snapshot_id}/assign-plant``."""

    plant_id: uuid_module.UUID = Field(
        ...,
        description="UUID of the plant to associate with this snapshot row.",
    )


# --- Helpers ---------------------------------------------------------------


def _make_measurement_id(
    device_serial: str,
    timestamp: datetime,
    protocol_id: Optional[Any],
) -> str:
    """Deterministic fallback measurement_id when the payload omits one."""
    payload = (
        f"{device_serial}|{timestamp.isoformat()}|{protocol_id if protocol_id is not None else ''}"
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _coerce_timestamp(raw: Any) -> Optional[datetime]:
    """Best-effort coercion of various timestamp encodings into UTC datetime.

    Accepts ISO-8601 strings, Unix epoch seconds (int/float/str), and existing
    ``datetime`` objects. Returns ``None`` if coercion fails entirely.
    """
    if raw is None or raw == "":
        return None
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    if isinstance(raw, (int, float)):
        try:
            return datetime.fromtimestamp(float(raw), tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None
    if isinstance(raw, str):
        try:
            # Tolerate trailing 'Z'.
            normalized = raw.replace("Z", "+00:00")
            parsed = datetime.fromisoformat(normalized)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            try:
                return datetime.fromtimestamp(float(raw), tz=timezone.utc)
            except (OverflowError, OSError, ValueError):
                return None
    return None


def _normalize_measurement(
    raw: dict,
    device_serial: str,
) -> Optional[dict]:
    """Convert a raw PhotosynQ row/object into the internal ingest schema.

    The internal schema is::

        {
            "device_serial":   str,
            "timestamp":       datetime (UTC),
            "measurement_id":  str,
            "protocol_id":     Optional[str],
            "custom_fields":   dict,
            "sensor_values":   dict (raw PhotosynQ keys),
        }
    """
    if not isinstance(raw, dict):
        return None

    timestamp = _coerce_timestamp(
        raw.get("timestamp")
        or raw.get("time")
        or raw.get("datum")
        or raw.get("created_at")
    )
    if timestamp is None:
        return None

    protocol_id = raw.get("protocol_id") or raw.get("protocol")

    measurement_id = raw.get("measurement_id") or raw.get("id")
    if not measurement_id:
        measurement_id = _make_measurement_id(device_serial, timestamp, protocol_id)

    # Custom fields can arrive flat (top-level "AutomationOne-Plant-ID") or
    # nested under "custom_fields". Merge both, with the explicit nested dict
    # taking precedence.
    custom_fields: dict[str, Any] = {}
    flat_plant = raw.get("AutomationOne-Plant-ID")
    if flat_plant:
        custom_fields["AutomationOne-Plant-ID"] = flat_plant
    nested = raw.get("custom_fields")
    if isinstance(nested, dict):
        custom_fields.update(nested)

    # Sensor values: prefer an explicit "sensor_values" / "data" sub-dict, fall
    # back to passing the whole row (the parser only looks at known keys).
    sensor_values = (
        raw.get("sensor_values")
        if isinstance(raw.get("sensor_values"), dict)
        else raw.get("data") if isinstance(raw.get("data"), dict) else raw
    )

    return {
        "device_serial": device_serial,
        "timestamp": timestamp,
        "measurement_id": str(measurement_id),
        "protocol_id": protocol_id,
        "custom_fields": custom_fields,
        "sensor_values": sensor_values,
    }


def _parse_csv_payload(content: bytes, device_serial: str) -> list[dict]:
    """Parse a CSV upload into a list of normalized measurement dicts."""
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"CSV file is not UTF-8 encoded: {exc}",
        ) from exc

    reader = csv.DictReader(io.StringIO(text))
    measurements: list[dict] = []
    for row in reader:
        normalized = _normalize_measurement(row, device_serial)
        if normalized is not None:
            measurements.append(normalized)
    return measurements


def _parse_json_payload(content: bytes, device_serial: str) -> list[dict]:
    """Parse a JSON upload into a list of normalized measurement dicts."""
    try:
        decoded = json.loads(content.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON payload: {exc}",
        ) from exc

    if isinstance(decoded, dict):
        raw_items: list[Any] = [decoded]
    elif isinstance(decoded, list):
        raw_items = decoded
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="JSON payload must be an object or a list of objects.",
        )

    measurements: list[dict] = []
    for item in raw_items:
        normalized = _normalize_measurement(item, device_serial)
        if normalized is not None:
            measurements.append(normalized)
    return measurements


async def _audit_safe(
    db: Any,
    *,
    event_type: str,
    severity: str,
    source_id: str,
    message: str,
    details: dict,
    status_str: str = "success",
) -> None:
    """Best-effort audit log — never blocks the caller on failure."""
    try:
        audit_repo = AuditLogRepository(db)
        await audit_repo.create(
            event_type=event_type,
            severity=severity,
            source_type=AuditSourceType.API,
            source_id=source_id,
            status=status_str,
            message=message,
            details=details,
        )
    except Exception as exc:  # pragma: no cover - audit must never fail caller
        logger.warning("Failed to write audit log for %s: %s", event_type, exc)


# --- Endpoints --------------------------------------------------------------


@router.post(
    "/import",
    response_model=DataResponse[dict],
    summary="Import MultispeQ measurements",
    description=(
        "Upload a PhotosynQ-exported CSV or JSON file and ingest it into "
        "``sensor_data`` (one row per recognised value, GPIO base 200). "
        "Returns import counters and any warnings/errors."
    ),
)
async def import_multispeq(
    db: DBSession,
    current_user: OperatorUser,
    file: UploadFile = File(..., description="CSV or JSON measurement export"),
    device_serial: str = Form(..., description="Virtual MultispeQ device_id"),
    zone_id: str = Form(..., description="Target zone_id (snapshot context)"),
    subzone_id: Optional[str] = Form(None, description="Optional subzone_id"),
    calibration_date: date = Form(
        ..., description="Calibration validity date (audit context)"
    ),
    kaiser_id: Optional[str] = Form(
        None, description="Optional tenant filter for plant lookups"
    ),
    dry_run: bool = Form(
        False, description="Validate without inserting if True"
    ),
) -> DataResponse[dict]:
    # 1. Size guard.
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"Upload exceeds maximum size of "
                f"{MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
            ),
        )

    # 2. Format detection. Filename takes precedence; content-type is hint.
    filename = (file.filename or "").lower()
    content_type = (file.content_type or "").lower()
    if filename.endswith(".csv") or content_type in ("text/csv", "application/csv"):
        measurements = _parse_csv_payload(content, device_serial)
    elif filename.endswith(".json") or content_type in (
        "application/json",
        "text/json",
    ):
        measurements = _parse_json_payload(content, device_serial)
    else:
        # Try JSON first (most common for PhotosynQ API exports), fall back to CSV.
        try:
            measurements = _parse_json_payload(content, device_serial)
        except HTTPException:
            measurements = _parse_csv_payload(content, device_serial)

    if not measurements:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid MultispeQ measurements found in upload.",
        )

    # 3. Hand off to the ingest service.
    service = IngestService(db)
    result = await service.ingest(
        measurements=measurements,
        source=ImportSource.manual_upload,
        zone_id=zone_id,
        subzone_id=subzone_id,
        calibration_date=calibration_date,
        kaiser_id=kaiser_id,
        dry_run=dry_run,
        actor_user_id=current_user.id,
    )

    return DataResponse[dict](success=True, data=result.to_dict())


@router.patch(
    "/{snapshot_id}/assign-plant",
    response_model=DataResponse[dict],
    summary="Reassign a MultispeQ snapshot row to a plant",
    description=(
        "Update the ``plant_id`` of a previously imported MultispeQ "
        "``sensor_data`` row. Used by operators to clean up the "
        "``needs_review`` pile."
    ),
)
async def assign_plant_to_snapshot(
    snapshot_id: uuid_module.UUID,
    body: AssignPlantRequest,
    db: DBSession,
    current_user: OperatorUser,
) -> DataResponse[dict]:
    # 1. Verify the snapshot row exists.
    stmt = select(SensorData).where(SensorData.id == snapshot_id)
    snapshot = (await db.execute(stmt)).scalar_one_or_none()
    if snapshot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sensor snapshot '{snapshot_id}' not found.",
        )

    # 2. Verify the target plant exists (active only).
    plant_repo = PlantRepository(db)
    plant = await plant_repo.get_by_plant_id(body.plant_id, include_deleted=False)
    if plant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plant '{body.plant_id}' not found or inactive.",
        )

    previous_plant_id = snapshot.plant_id

    # 3. Apply the update.
    await db.execute(
        update(SensorData)
        .where(SensorData.id == snapshot_id)
        .values(plant_id=body.plant_id)
    )
    await db.commit()

    # 4. Audit log (best-effort).
    await _audit_safe(
        db,
        event_type=_EVENT_MULTISPEQ_ASSIGN_PLANT,
        severity=AuditSeverity.INFO,
        source_id=str(current_user.id),
        message=(
            f"Reassigned snapshot {snapshot_id} to plant {body.plant_id}"
        ),
        details={
            "snapshot_id": str(snapshot_id),
            "new_plant_id": str(body.plant_id),
            "previous_plant_id": (
                str(previous_plant_id) if previous_plant_id else None
            ),
            "sensor_type": snapshot.sensor_type,
        },
    )

    return DataResponse[dict](
        success=True,
        message="Plant assignment updated",
        data={
            "snapshot_id": str(snapshot_id),
            "plant_id": str(body.plant_id),
            "previous_plant_id": (
                str(previous_plant_id) if previous_plant_id else None
            ),
        },
    )
