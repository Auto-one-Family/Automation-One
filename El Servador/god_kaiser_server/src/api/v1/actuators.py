"""
Actuator Management API Endpoints

Phase: 5 (Week 9-10) - API Layer
Updated: 2026-01-30 - Fixed ActuatorState attribute access (current_value, last_command_timestamp)
Priority: 🔴 CRITICAL
Status: IMPLEMENTED

Provides:
- GET / - List actuator configs
- POST /{esp_id}/{gpio} - Create/update config
- POST /{esp_id}/{gpio}/command - Send command via MQTT
- GET /{esp_id}/{gpio}/status - Get current state
- POST /emergency_stop - Emergency stop all actuators
- DELETE /{esp_id}/{gpio} - Remove config

Safety:
- ALL commands go through SafetyService validation
- Emergency stop has absolute priority
- Value range: 0.0-1.0 (converted to 0-255 by ESP32)

References:
- .claude/PI_SERVER_REFACTORING.md (Lines 146-154)
- El Trabajante/docs/Mqtt_Protocoll.md (Actuator topics)
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query

from ...schemas.alert_config import ActuatorAlertConfigUpdate, RuntimeStatsUpdate

from ...core.exceptions import (
    ActuatorNotFoundError,
    DeviceNotApprovedError,
    DeviceOfflineError,
    ESPNotFoundError,
    GpioConflictError,
    ValidationException,
)
from ...core.logging_config import get_logger
from ...db.models.actuator import ActuatorConfig, ActuatorState as ActuatorStateModel
from ...db.repositories import (
    ActuatorRepository,
    ESPRepository,
    SensorRepository,
    SubzoneRepository,
)
from ...db.repositories.audit_log_repo import AuditLogRepository
from ...mqtt.publisher import Publisher
from ...mqtt.topics import TopicBuilder
from ...schemas import (
    ActuatorAggregation,
    ActuatorCommand,
    ActuatorCommandResponse,
    ActuatorConfigCreate,
    ActuatorConfigListResponse,
    ActuatorConfigResponse,
    ActuatorHistoryEntry,
    ActuatorHistoryResponse,
    ActuatorState,
    ActuatorStatusResponse,
    ClearEmergencyRequest,
    ClearEmergencyResponse,
    EmergencyStopRequest,
    EmergencyStopResponse,
)
from ...schemas.common import PaginationMeta
from ...services.actuator_service import ActuatorService
from ...services.config_builder import ConfigPayloadBuilder
from ...services.esp_service import ESPService
from ...services.gpio_validation_service import GpioValidationService
from ...services.safety_service import SafetyService
from ...services.subzone_service import SubzoneService
from ...utils.subzone_helpers import normalize_subzone_id
from ..deps import (
    ActiveUser,
    DBSession,
    MQTTPublisher,
    OperatorUser,
    get_actuator_service,
    get_config_builder,
    get_esp_service,
    get_mqtt_publisher,
    get_safety_service,
)

logger = get_logger(__name__)

router = APIRouter(prefix="/v1/actuators", tags=["actuators"])

TECH_METADATA_KEYS = {"pwm_frequency", "servo_min_pulse", "servo_max_pulse"}


def _model_to_schema_response(
    actuator: ActuatorConfig,
    esp_device_id: Optional[str] = None,
    state: Optional[ActuatorStateModel] = None,
    subzone_id: Optional[str] = None,
) -> ActuatorConfigResponse:
    """
    Map DB model fields to public API schema.
    - actuator_name -> name
    - safety_constraints -> max_runtime_seconds, cooldown_seconds
    - actuator_metadata -> metadata + technical PWM/servo fields split out
    """
    safety = actuator.safety_constraints or {}
    max_runtime_seconds = safety.get("max_runtime") or safety.get("max_runtime_seconds")
    cooldown_seconds = safety.get("cooldown_period") or safety.get("cooldown_seconds")

    # Normalize possible millisecond storage to seconds (future proof)
    if isinstance(max_runtime_seconds, (int, float)) and max_runtime_seconds:
        if max_runtime_seconds > 86400 * 10:
            max_runtime_seconds = int(max_runtime_seconds // 1000)

    metadata = actuator.actuator_metadata or {}
    pwm_frequency = metadata.get("pwm_frequency")
    servo_min_pulse = metadata.get("servo_min_pulse")
    servo_max_pulse = metadata.get("servo_max_pulse")

    # Expose only user-facing metadata; keep technical fields separate
    user_metadata = {k: v for k, v in metadata.items() if k not in TECH_METADATA_KEYS}

    return ActuatorConfigResponse(
        id=actuator.id,
        esp_id=actuator.esp_id,
        esp_device_id=esp_device_id,
        gpio=actuator.gpio,
        actuator_type=actuator.actuator_type,
        name=actuator.actuator_name,
        enabled=actuator.enabled,
        max_runtime_seconds=max_runtime_seconds,
        cooldown_seconds=cooldown_seconds,
        pwm_frequency=pwm_frequency,
        servo_min_pulse=servo_min_pulse,
        servo_max_pulse=servo_max_pulse,
        metadata=user_metadata or None,
        # Config status from ESP32 verification (Phase 2: write-after-verification)
        config_status=actuator.config_status,
        config_error=actuator.config_error,
        config_error_detail=actuator.config_error_detail,
        # Multi-Zone Device Scope (T13-R2)
        device_scope=actuator.device_scope,
        assigned_zones=actuator.assigned_zones,
        assigned_subzones=actuator.assigned_subzones,
        current_value=state.current_value if state else None,
        is_active=(state.state in ("on", "pwm")) if state else False,
        last_command_at=state.last_command_timestamp if state else None,
        created_at=actuator.created_at,
        updated_at=actuator.updated_at,
        subzone_id=subzone_id,
    )


def _schema_to_model_fields(
    request: ActuatorConfigCreate,
    existing: Optional[ActuatorConfig] = None,
) -> dict:
    """
    Convert request schema into model field names.
    """
    # Start with existing for partial updates to avoid dropping data
    safety_constraints = (
        dict(existing.safety_constraints) if existing and existing.safety_constraints else {}
    )
    metadata = dict(existing.actuator_metadata) if existing and existing.actuator_metadata else {}

    if request.max_runtime_seconds is not None:
        safety_constraints["max_runtime"] = request.max_runtime_seconds
    if request.cooldown_seconds is not None:
        safety_constraints["cooldown_period"] = request.cooldown_seconds

    if request.metadata is not None:
        metadata.update(request.metadata)
    if request.pwm_frequency is not None:
        metadata["pwm_frequency"] = request.pwm_frequency
    if request.servo_min_pulse is not None:
        metadata["servo_min_pulse"] = request.servo_min_pulse
    if request.servo_max_pulse is not None:
        metadata["servo_max_pulse"] = request.servo_max_pulse

    fields = {}
    if request.actuator_type is not None:
        fields["actuator_type"] = request.actuator_type
    if request.name is not None or existing is None:
        # fallback to empty string to satisfy NOT NULL on create
        fields["actuator_name"] = request.name or ""
    if request.enabled is not None:
        fields["enabled"] = request.enabled
    if safety_constraints:
        fields["safety_constraints"] = safety_constraints
    if metadata:
        fields["actuator_metadata"] = metadata
    # =========================================================================
    # MULTI-ZONE DEVICE SCOPE (T13-R2)
    # =========================================================================
    if request.device_scope is not None:
        fields["device_scope"] = request.device_scope
    if request.assigned_zones is not None:
        fields["assigned_zones"] = request.assigned_zones
    if request.assigned_subzones is not None:
        fields["assigned_subzones"] = request.assigned_subzones

    return fields


# =============================================================================
# List Actuators
# =============================================================================


@router.get(
    "/",
    response_model=ActuatorConfigListResponse,
    summary="List actuator configurations",
    description="Get all actuator configurations with optional filters.",
)
async def list_actuators(
    db: DBSession,
    current_user: ActiveUser,
    esp_id: Annotated[Optional[str], Query(description="Filter by ESP device ID")] = None,
    actuator_type: Annotated[Optional[str], Query(description="Filter by actuator type")] = None,
    enabled: Annotated[Optional[bool], Query(description="Filter by enabled status")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> ActuatorConfigListResponse:
    """
    List actuator configurations.

    Args:
        db: Database session
        current_user: Authenticated user
        esp_id: Optional ESP filter
        actuator_type: Optional type filter
        enabled: Optional enabled filter
        page: Page number
        page_size: Items per page

    Returns:
        Paginated list of actuator configs
    """
    actuator_repo = ActuatorRepository(db)

    offset = (page - 1) * page_size
    rows, total_items = await actuator_repo.query_paginated(
        esp_device_id=esp_id,
        actuator_type=actuator_type,
        enabled=enabled,
        offset=offset,
        limit=page_size,
    )

    responses = [
        _model_to_schema_response(actuator, device_id, state) for actuator, device_id, state in rows
    ]

    return ActuatorConfigListResponse(
        success=True,
        data=responses,
        pagination=PaginationMeta.from_pagination(page, page_size, total_items),
    )


# =============================================================================
# Specific /{id}/... GET routes — MUST be defined BEFORE /{esp_id}/{gpio}
# to prevent FastAPI route collision (two-segment patterns match first).
# =============================================================================


@router.get(
    "/{actuator_id}/alert-config",
    summary="Get actuator alert configuration",
)
async def get_actuator_alert_config(
    actuator_id: uuid.UUID,
    db: DBSession,
    current_user: ActiveUser,
) -> dict:
    """Get per-actuator alert configuration with effective thresholds."""
    actuator_repo = ActuatorRepository(db)
    actuator = await actuator_repo.get_by_id(actuator_id)
    if not actuator:
        raise ActuatorNotFoundError(actuator_id)

    return {
        "success": True,
        "actuator_id": str(actuator.id),
        "alert_config": actuator.alert_config or {},
        "global_thresholds": actuator.thresholds if hasattr(actuator, "thresholds") else None,
    }


@router.get(
    "/{actuator_id}/runtime",
    summary="Get actuator runtime statistics",
)
async def get_actuator_runtime(
    actuator_id: uuid.UUID,
    db: DBSession,
    current_user: ActiveUser,
) -> dict:
    """Get actuator runtime statistics with computed values."""
    actuator_repo = ActuatorRepository(db)
    actuator = await actuator_repo.get_by_id(actuator_id)
    if not actuator:
        raise ActuatorNotFoundError(actuator_id)

    stats = actuator.runtime_stats or {}

    # Compute current uptime if last_restart is set
    computed_uptime = None
    if stats.get("last_restart"):
        try:
            last_restart = datetime.fromisoformat(stats["last_restart"])
            if last_restart.tzinfo is None:
                last_restart = last_restart.replace(tzinfo=timezone.utc)
            delta = datetime.now(timezone.utc) - last_restart
            computed_uptime = round(delta.total_seconds() / 3600, 2)
        except (ValueError, TypeError):
            pass

    # Compute maintenance overdue
    maintenance_overdue = False
    if stats.get("last_maintenance") and stats.get("maintenance_interval_hours"):
        try:
            last_maint = datetime.fromisoformat(stats["last_maintenance"])
            if last_maint.tzinfo is None:
                last_maint = last_maint.replace(tzinfo=timezone.utc)
            hours_since = (datetime.now(timezone.utc) - last_maint).total_seconds() / 3600
            maintenance_overdue = hours_since > stats["maintenance_interval_hours"]
        except (ValueError, TypeError):
            pass

    return {
        "success": True,
        "actuator_id": str(actuator.id),
        "runtime_stats": stats,
        "computed_uptime_hours": computed_uptime,
        "maintenance_overdue": maintenance_overdue,
    }


# =============================================================================
# Get Actuator
# =============================================================================


@router.get(
    "/{esp_id}/{gpio}",
    response_model=ActuatorConfigResponse,
    responses={
        200: {"description": "Actuator found"},
        404: {"description": "Actuator not found"},
    },
    summary="Get actuator configuration",
    description="Get configuration for a specific actuator.",
)
async def get_actuator(
    esp_id: str,
    gpio: int,
    db: DBSession,
    current_user: ActiveUser,
) -> ActuatorConfigResponse:
    """
    Get actuator configuration.

    Args:
        esp_id: ESP device ID
        gpio: GPIO pin number
        db: Database session
        current_user: Authenticated user

    Returns:
        Actuator configuration
    """
    esp_repo = ESPRepository(db)
    actuator_repo = ActuatorRepository(db)

    esp_device = await esp_repo.get_by_device_id(esp_id)
    if not esp_device:
        raise ESPNotFoundError(esp_id)

    actuator = await actuator_repo.get_by_esp_and_gpio(esp_device.id, gpio)
    if not actuator:
        raise ActuatorNotFoundError(esp_id, gpio)

    state = await actuator_repo.get_state(esp_device.id, gpio)

    subzone_repo = SubzoneRepository(db)
    subzone = await subzone_repo.get_subzone_by_gpio(esp_id, gpio)
    subzone_id_val = subzone.subzone_id if subzone else None

    return _model_to_schema_response(actuator, esp_id, state, subzone_id=subzone_id_val)


# =============================================================================
# Create/Update Actuator
# =============================================================================


@router.post(
    "/{esp_id}/{gpio}",
    response_model=ActuatorConfigResponse,
    responses={
        200: {"description": "Actuator created/updated"},
        404: {"description": "ESP device not found"},
    },
    summary="Create or update actuator",
    description="Create new actuator config or update existing.",
)
async def create_or_update_actuator(
    esp_id: str,
    gpio: int,
    request: ActuatorConfigCreate,
    db: DBSession,
    current_user: OperatorUser,
    publisher: MQTTPublisher,
) -> ActuatorConfigResponse:
    """
    Create or update actuator configuration.

    Args:
        esp_id: ESP device ID
        gpio: GPIO pin number
        request: Actuator configuration
        db: Database session
        current_user: Operator or admin user

    Returns:
        Created/updated actuator config
    """
    # Path params are authoritative — override body values for robustness
    request.esp_id = esp_id
    request.gpio = gpio

    esp_repo = ESPRepository(db)
    actuator_repo = ActuatorRepository(db)
    sensor_repo = SensorRepository(db)

    esp_device = await esp_repo.get_by_device_id(esp_id)
    if not esp_device:
        raise ESPNotFoundError(esp_id)

    # =========================================================================
    # DEVICE STATUS GUARD - Only approved/online/offline devices can be configured
    # "offline" = previously approved device that is temporarily disconnected
    # "pending" = newly discovered device awaiting approval → blocked
    # =========================================================================
    if esp_device.status not in ("approved", "online", "offline"):
        raise DeviceNotApprovedError(esp_id, esp_device.status)

    # =========================================================================
    # MULTI-ZONE VALIDATION (T13-R2 H3)
    # Validate assigned_zones exist in zones table when scope is multi_zone/mobile
    # =========================================================================
    act_scope = request.device_scope or "zone_local"
    if act_scope in ("multi_zone", "mobile") and request.assigned_zones:
        from ...services.device_scope_service import DeviceScopeService

        scope_service = DeviceScopeService(db)
        invalid_zones = await scope_service.validate_assigned_zones(request.assigned_zones)
        if invalid_zones:
            raise ValidationException(
                "assigned_zones",
                f"Invalid or inactive zone_ids: {invalid_zones}",
            )

    # Check if actuator exists
    existing = await actuator_repo.get_by_esp_and_gpio(esp_device.id, gpio)

    # =========================================================================
    # GPIO-Validierung (Phase 2)
    # Prüft: System-Pins, DB-Sensoren, DB-Aktoren, ESP-gemeldeten Status
    # =========================================================================
    gpio_validator = GpioValidationService(
        session=db, sensor_repo=sensor_repo, actuator_repo=actuator_repo, esp_repo=esp_repo
    )

    validation_result = await gpio_validator.validate_gpio_available(
        esp_db_id=esp_device.id,
        gpio=gpio,
        exclude_actuator_id=existing.id if existing else None,
        purpose="actuator",
        interface_type="DIGITAL",
    )

    if not validation_result.available:
        logger.warning(
            f"GPIO conflict for ESP {esp_id}, GPIO {gpio}: "
            f"{validation_result.conflict_type} - {validation_result.message}"
        )
        raise GpioConflictError(
            gpio=gpio,
            conflict_type=validation_result.conflict_type.value,
            conflict_component=validation_result.conflict_component,
            conflict_id=(
                str(validation_result.conflict_id) if validation_result.conflict_id else None
            ),
            message=validation_result.message,
        )
    # =========================================================================

    # Capture old values for H2 audit trail before modification
    old_act_scope = existing.device_scope if existing else None
    old_act_zones = list(existing.assigned_zones or []) if existing else None

    if existing:
        # Update existing
        model_fields = _schema_to_model_fields(request, existing=existing)
        for field, value in model_fields.items():
            setattr(existing, field, value)
        # =========================================================================
        # WRITE-AFTER-VERIFICATION: Reset config_status to pending
        # Status will be updated to "applied" or "failed" by config_handler
        # when ESP32 responds via MQTT config_response
        # =========================================================================
        existing.config_status = "pending"
        existing.config_error = None
        existing.config_error_detail = None
        actuator = existing
        logger.info(
            f"Actuator updated: {esp_id} GPIO {gpio} by {current_user.username} (config_status=pending)"
        )
    else:
        # Create new (config_status defaults to "pending" in model)
        model_fields = _schema_to_model_fields(request)
        actuator = ActuatorConfig(
            esp_id=esp_device.id,
            gpio=gpio,
            **model_fields,
        )
        await actuator_repo.create(actuator)
        logger.info(
            f"Actuator created: {esp_id} GPIO {gpio} by {current_user.username} (config_status=pending)"
        )

    # =========================================================================
    # AUDIT TRAIL for scope/zones changes (T13-R2 H2)
    # =========================================================================
    act_scope_changed = False
    act_zones_changed = False
    if existing and old_act_scope is not None:
        if request.device_scope is not None and request.device_scope != old_act_scope:
            from ...db.models.device_zone_change import DeviceZoneChange

            db.add(
                DeviceZoneChange(
                    esp_id=f"actuator:{actuator.id}",
                    old_zone_id=old_act_scope,
                    new_zone_id=request.device_scope,
                    subzone_strategy="scope",
                    change_type="scope_change",
                    changed_by=current_user.username,
                )
            )
            act_scope_changed = True
        if request.assigned_zones is not None and sorted(request.assigned_zones) != sorted(
            old_act_zones or []
        ):
            from ...db.models.device_zone_change import DeviceZoneChange

            db.add(
                DeviceZoneChange(
                    esp_id=f"actuator:{actuator.id}",
                    old_zone_id=",".join(old_act_zones or []),
                    new_zone_id=",".join(request.assigned_zones),
                    subzone_strategy="zones",
                    change_type="zones_update",
                    changed_by=current_user.username,
                )
            )
            act_zones_changed = True

    await db.commit()

    # =========================================================================
    # WS BROADCAST device_scope_changed (T13-R2 H1)
    # =========================================================================
    if act_scope_changed or act_zones_changed:
        try:
            from ...websocket.manager import WebSocketManager

            ws_manager = await WebSocketManager.get_instance()
            await ws_manager.broadcast(
                "device_scope_changed",
                {
                    "config_type": "actuator",
                    "config_id": str(actuator.id),
                    "device_scope": actuator.device_scope,
                    "assigned_zones": actuator.assigned_zones or [],
                },
            )
        except Exception as e:
            logger.warning(f"Failed to broadcast device_scope_changed: {e}")

    # =========================================================================
    # SUBZONE ASSIGNMENT (mirrors sensors API)
    # Assign actuator GPIO to subzone or remove from all subzones.
    # Normalize "__none__", "", null → None (Keine Subzone = remove from all)
    # =========================================================================
    try:
        subzone_service = SubzoneService(esp_repo=esp_repo, session=db, publisher=publisher)
        subzone_id_val = normalize_subzone_id(request.subzone_id)
        if subzone_id_val:
            await subzone_service.assign_subzone(
                device_id=esp_id,
                subzone_id=subzone_id_val,
                assigned_gpios=[gpio],
                subzone_name=None,
                parent_zone_id=esp_device.zone_id,
                safe_mode_active=True,
            )
            await db.commit()
        else:
            await subzone_service.remove_gpio_from_all_subzones(esp_id, gpio)
            await db.commit()
    except ValueError as e:
        logger.warning(f"Subzone assignment skipped for {esp_id}/GPIO {gpio}: {e}")
        await db.rollback()
        raise ValidationException("subzone", str(e))
    except Exception as e:
        logger.warning(f"Subzone assignment failed for {esp_id}/GPIO {gpio}: {e}")
        await db.rollback()
        # Non-fatal: actuator was saved, subzone can be fixed manually

    # Publish config to ESP32 via MQTT (using dependency-injected services)
    try:
        config_builder: ConfigPayloadBuilder = get_config_builder(db)
        combined_config = await config_builder.build_combined_config(esp_id, db)

        esp_service: ESPService = get_esp_service(db)
        config_sent = await esp_service.send_config(esp_id, combined_config)

        if config_sent:
            logger.info(f"Config published to ESP {esp_id} after actuator create/update")
        else:
            logger.warning(f"Config publish failed for ESP {esp_id} (DB save was successful)")
    except Exception as e:
        # Log error but don't fail the request (DB save was successful)
        logger.error(f"Failed to publish config to ESP {esp_id}: {e}", exc_info=True)

    subzone_repo = SubzoneRepository(db)
    subzone = await subzone_repo.get_subzone_by_gpio(esp_id, gpio)
    subzone_id_val = subzone.subzone_id if subzone else None

    return _model_to_schema_response(actuator, esp_id, None, subzone_id=subzone_id_val)


# =============================================================================
# Send Command
# =============================================================================


@router.post(
    "/{esp_id}/{gpio}/command",
    response_model=ActuatorCommandResponse,
    responses={
        200: {"description": "Command sent"},
        400: {"description": "Command rejected by safety check"},
        404: {"description": "Actuator not found"},
        409: {"description": "ESP device is offline"},
    },
    summary="Send actuator command",
    description="Send command to actuator via MQTT. Validated by SafetyService.",
)
async def send_command(
    esp_id: str,
    gpio: int,
    command: ActuatorCommand,
    db: DBSession,
    current_user: OperatorUser,
    actuator_service: Annotated[ActuatorService, Depends(get_actuator_service)],
) -> ActuatorCommandResponse:
    """
    Send actuator command.

    CRITICAL: All commands are validated by SafetyService before execution.

    Args:
        esp_id: ESP device ID
        gpio: GPIO pin number
        command: Actuator command (ON, OFF, PWM, TOGGLE)
        db: Database session
        current_user: Operator or admin user
        actuator_service: ActuatorService instance (dependency injected)

    Returns:
        Command response
    """
    esp_repo = ESPRepository(db)
    actuator_repo = ActuatorRepository(db)

    esp_device = await esp_repo.get_by_device_id(esp_id)
    if not esp_device:
        # BUG-006 Fix: Detailed error message with hint
        logger.warning(f"Actuator command failed: ESP '{esp_id}' not found in database")
        raise ESPNotFoundError(esp_id)

    actuator = await actuator_repo.get_by_esp_and_gpio(esp_device.id, gpio)
    if not actuator:
        # BUG-006 Fix: Detailed error message with hint
        logger.warning(f"Actuator command failed: No actuator on GPIO {gpio} for ESP '{esp_id}'")
        raise ActuatorNotFoundError(esp_id, gpio)

    if not actuator.enabled:
        raise ValidationException(
            "actuator", "Actuator is disabled. Enable via PUT request with enabled=true."
        )

    # V1-22: Early reject for offline ESPs with specific HTTP 409
    if not esp_device.is_online:
        raise DeviceOfflineError(esp_id, esp_device.status)

    # Send command via service (includes safety validation)
    success = await actuator_service.send_command(
        esp_id=esp_id,
        gpio=gpio,
        command=command.command,
        value=command.value,
        duration=command.duration,
        issued_by=f"user:{current_user.username}",
    )

    if not success:
        # Get last error from safety check
        raise ValidationException(
            "command",
            "Command rejected by safety validation or MQTT publish failed",
        )

    logger.info(
        f"Actuator command sent: {esp_id} GPIO {gpio} {command.command} "
        f"value={command.value} by {current_user.username}"
    )

    return ActuatorCommandResponse(
        success=True,
        esp_id=esp_id,
        gpio=gpio,
        command=command.command,
        value=command.value,
        command_sent=True,
        acknowledged=False,  # ACK is async via MQTT
        safety_warnings=[],
    )


# =============================================================================
# Get Status
# =============================================================================


@router.get(
    "/{esp_id}/{gpio}/status",
    response_model=ActuatorStatusResponse,
    responses={
        200: {"description": "Status retrieved"},
        404: {"description": "Actuator not found"},
    },
    summary="Get actuator status",
    description="Get current state of an actuator.",
)
async def get_status(
    esp_id: str,
    gpio: int,
    db: DBSession,
    current_user: ActiveUser,
    include_config: Annotated[bool, Query(description="Include full config")] = False,
) -> ActuatorStatusResponse:
    """
    Get actuator status.

    Args:
        esp_id: ESP device ID
        gpio: GPIO pin number
        db: Database session
        current_user: Authenticated user
        include_config: Include full configuration

    Returns:
        Actuator status
    """
    esp_repo = ESPRepository(db)
    actuator_repo = ActuatorRepository(db)

    esp_device = await esp_repo.get_by_device_id(esp_id)
    if not esp_device:
        raise ESPNotFoundError(esp_id)

    actuator = await actuator_repo.get_by_esp_and_gpio(esp_device.id, gpio)
    if not actuator:
        raise ActuatorNotFoundError(esp_id, gpio)

    state = await actuator_repo.get_state(esp_device.id, gpio)

    # Build state response
    # NOTE: ActuatorState model uses: current_value, state (str), last_command_timestamp
    state_response = ActuatorState(
        gpio=gpio,
        mode=actuator.actuator_type,
        value=state.current_value if state else 0.0,
        is_active=(state.state in ("on", "pwm")) if state else False,
        last_command=state.last_command if state else None,
        last_command_at=state.last_command_timestamp if state else None,
        runtime_seconds=None,  # Would calculate from last_command_timestamp
    )

    # Optionally include config
    config = None
    if include_config:
        config = _model_to_schema_response(actuator, esp_id, state)

    return ActuatorStatusResponse(
        success=True,
        esp_id=esp_id,
        gpio=gpio,
        state=state_response,
        config=config,
    )


# =============================================================================
# Emergency Stop
# =============================================================================


@router.post(
    "/emergency_stop",
    response_model=EmergencyStopResponse,
    responses={
        200: {"description": "Emergency stop executed"},
    },
    summary="Emergency stop",
    description="CRITICAL: Stop all actuators immediately. Bypasses normal safety checks.",
)
async def emergency_stop(
    request: EmergencyStopRequest,
    db: DBSession,
    current_user: OperatorUser,
    publisher: Annotated[Publisher, Depends(get_mqtt_publisher)],
) -> EmergencyStopResponse:
    """
    Emergency stop all actuators.

    CRITICAL: This stops all actuators immediately.

    Args:
        request: Emergency stop request
        db: Database session
        current_user: Operator or admin user
        publisher: MQTT publisher (dependency injected)

    Returns:
        Emergency stop response
    """
    esp_repo = ESPRepository(db)
    actuator_repo = ActuatorRepository(db)

    devices_stopped = 0
    actuators_stopped = 0
    details = []

    # Get target devices
    if request.esp_id:
        esp_device = await esp_repo.get_by_device_id(request.esp_id)
        if not esp_device:
            raise ESPNotFoundError(request.esp_id)
        devices = [esp_device]
    else:
        devices = await esp_repo.get_all()

    # Stop actuators on each device
    for device in devices:
        device_actuators_stopped = 0
        device_result = {"esp_id": device.device_id, "actuators": []}

        # Get actuators for this device
        actuators = await actuator_repo.get_by_esp(device.id)

        for actuator in actuators:
            # Skip if specific GPIO requested and doesn't match
            if request.gpio is not None and actuator.gpio != request.gpio:
                continue

            # Send OFF command
            try:
                success = publisher.publish_actuator_command(
                    esp_id=device.device_id,
                    gpio=actuator.gpio,
                    command="OFF",
                    value=0.0,
                    duration=0,
                    retry=True,
                )
            except Exception as exc:
                logger.error(
                    f"Emergency stop publish failed for {device.device_id} gpio {actuator.gpio}: {exc}",
                    exc_info=True,
                )
                success = False

            if success:
                device_actuators_stopped += 1
                device_result["actuators"].append(
                    {
                        "esp_id": device.device_id,
                        "gpio": actuator.gpio,
                        "success": True,
                        "message": None,
                    }
                )

                # Log command
                await actuator_repo.log_command(
                    esp_id=device.id,
                    gpio=actuator.gpio,
                    actuator_type=actuator.actuator_type,
                    command_type="EMERGENCY_STOP",
                    value=0.0,
                    success=True,
                    issued_by=f"emergency:{current_user.username}",
                    metadata={"reason": request.reason},
                )
            else:
                device_result["actuators"].append(
                    {
                        "esp_id": device.device_id,
                        "gpio": actuator.gpio,
                        "success": False,
                        "message": "MQTT publish failed",
                    }
                )

        if device_actuators_stopped > 0:
            devices_stopped += 1
            actuators_stopped += device_actuators_stopped

        if device_result["actuators"]:
            details.append(device_result)

    await db.commit()

    # ───────────────────────────────────────────────────────────
    # AUDIT LOGGING: Emergency Stop (non-blocking via try-except)
    # ───────────────────────────────────────────────────────────
    try:
        audit_repo = AuditLogRepository(db)
        await audit_repo.log_emergency_stop(
            user_id=str(current_user.id),
            username=current_user.username,
            reason=request.reason,
            devices_stopped=devices_stopped,
            actuators_stopped=actuators_stopped,
            details={
                "esp_id": request.esp_id,
                "gpio": request.gpio,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )
    except Exception as audit_error:
        logger.warning(f"Failed to audit log emergency_stop: {audit_error}")

    # ───────────────────────────────────────────────────────────
    # MQTT BROADCAST: Emergency Stop for late-joining ESPs
    # ───────────────────────────────────────────────────────────
    try:
        broadcast_payload = json.dumps(
            {
                "command": "EMERGENCY_STOP",
                "reason": request.reason,
                "issued_by": current_user.username,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "devices_stopped": devices_stopped,
                "actuators_stopped": actuators_stopped,
            }
        )
        publisher.client.publish(
            topic="kaiser/broadcast/emergency",
            payload=broadcast_payload,
            qos=1,
            retain=False,
        )
        logger.info("MQTT broadcast emergency stop published on kaiser/broadcast/emergency")
    except Exception as mqtt_error:
        logger.warning(f"Failed to publish MQTT emergency broadcast: {mqtt_error}")

    # ───────────────────────────────────────────────────────────
    # WEBSOCKET BROADCAST: Emergency Stop (non-blocking)
    # ───────────────────────────────────────────────────────────
    try:
        from ...websocket.manager import WebSocketManager

        ws_manager = await WebSocketManager.get_instance()
        ws_payload: dict = {
            "esp_id": request.esp_id or "ALL",
            "actuator_type": "all",
            "alert_type": "emergency_stop",
            "reason": request.reason,
            "devices_stopped": devices_stopped,
            "actuators_stopped": actuators_stopped,
            "issued_by": current_user.username,
        }
        if request.gpio is not None:
            ws_payload["gpio"] = request.gpio
        await ws_manager.broadcast("actuator_alert", ws_payload)
    except Exception as ws_error:
        logger.warning(f"Failed to broadcast emergency_stop WebSocket event: {ws_error}")

    logger.critical(
        f"EMERGENCY STOP executed by {current_user.username}: "
        f"{devices_stopped} devices, {actuators_stopped} actuators stopped. "
        f"Reason: {request.reason}"
    )

    return EmergencyStopResponse(
        success=True,
        message="Emergency stop executed",
        devices_stopped=devices_stopped,
        actuators_stopped=actuators_stopped,
        reason=request.reason,
        timestamp=datetime.now(timezone.utc),
        details=details,
    )


@router.post(
    "/clear_emergency",
    response_model=ClearEmergencyResponse,
    responses={
        200: {"description": "Emergency stop cleared"},
    },
    summary="Clear emergency stop",
    description="Release emergency stop state so actuators can be controlled again. Sends clear_emergency via MQTT to each ESP.",
)
async def clear_emergency(
    request: ClearEmergencyRequest,
    db: DBSession,
    current_user: OperatorUser,
    publisher: Annotated[Publisher, Depends(get_mqtt_publisher)],
    safety_service: Annotated["SafetyService", Depends(get_safety_service)],
) -> ClearEmergencyResponse:
    """
    Clear emergency stop for ESP(s).

    Sends clear_emergency command via MQTT to each ESP's actuator/emergency topic.
    Clears server-side emergency flags via SafetyService.
    Persists cleared state in actuator_states so dashboard does not show stale
    Not-Aus after server restart.
    """
    esp_repo = ESPRepository(db)
    actuator_repo = ActuatorRepository(db)
    devices_cleared = 0

    if request.esp_id:
        esp_device = await esp_repo.get_by_device_id(request.esp_id)
        if not esp_device:
            raise ESPNotFoundError(request.esp_id)
        devices = [esp_device]
    else:
        devices = await esp_repo.get_all()

    payload = json.dumps({"command": "clear_emergency", "reason": request.reason})

    for device in devices:
        try:
            topic = TopicBuilder.build_actuator_emergency_topic(device.device_id)
            publisher.client.publish(topic, payload, qos=1)
            devices_cleared += 1
        except Exception as exc:
            logger.warning(f"Clear emergency MQTT publish failed for {device.device_id}: {exc}")

    if request.esp_id:
        await safety_service.clear_emergency_stop(request.esp_id)
    else:
        await safety_service.clear_emergency_stop(None)

    # Persist cleared state in DB so monitor/zone API shows no emergency after restart
    esp_ids = [d.id for d in devices]
    rows_updated = await actuator_repo.clear_emergency_states(esp_ids)
    if rows_updated:
        await db.commit()
        logger.info(f"Cleared {rows_updated} actuator_states from emergency_stop to idle")

    logger.info(
        f"EMERGENCY CLEAR executed by {current_user.username}: "
        f"{devices_cleared} devices. Reason: {request.reason}"
    )

    return ClearEmergencyResponse(
        success=True,
        message="Emergency stop cleared",
        devices_cleared=devices_cleared,
        reason=request.reason,
        timestamp=datetime.now(timezone.utc),
    )


# =============================================================================
# Delete Actuator
# =============================================================================


@router.delete(
    "/{esp_id}/{gpio}",
    response_model=ActuatorConfigResponse,
    responses={
        200: {"description": "Actuator deleted"},
        404: {"description": "Actuator not found"},
    },
    summary="Delete actuator configuration",
    description="Remove actuator configuration. Sends OFF command first.",
)
async def delete_actuator(
    esp_id: str,
    gpio: int,
    db: DBSession,
    current_user: OperatorUser,
    publisher: Annotated[Publisher, Depends(get_mqtt_publisher)],
) -> ActuatorConfigResponse:
    """
    Delete actuator configuration.

    Args:
        esp_id: ESP device ID
        gpio: GPIO pin number
        db: Database session
        current_user: Operator or admin user
        publisher: MQTT publisher (dependency injected)

    Returns:
        Deleted actuator config
    """
    esp_repo = ESPRepository(db)
    actuator_repo = ActuatorRepository(db)

    esp_device = await esp_repo.get_by_device_id(esp_id)
    if not esp_device:
        raise ESPNotFoundError(esp_id)

    actuator = await actuator_repo.get_by_esp_and_gpio(esp_device.id, gpio)
    if not actuator:
        raise ActuatorNotFoundError(esp_id, gpio)

    # Send OFF command before deleting
    publisher.publish_actuator_command(
        esp_id=esp_id,
        gpio=gpio,
        command="OFF",
        value=0.0,
        duration=0,
        retry=True,
    )

    # Delete actuator
    await actuator_repo.delete(actuator.id)
    await db.commit()

    # T13-R1: Sync subzone sensor/actuator counts after actuator delete
    try:
        _subzone_repo = SubzoneRepository(db)
        if await _subzone_repo.sync_subzone_counts(esp_id, esp_device.id):
            await db.commit()
    except Exception:
        logger.debug("Subzone count sync skipped for %s", esp_id)

    logger.info(f"Actuator deleted: {esp_id} GPIO {gpio} by {current_user.username}")

    # Publish updated config to ESP32 via MQTT (actuator removed from payload)
    try:
        config_builder: ConfigPayloadBuilder = get_config_builder(db)
        combined_config = await config_builder.build_combined_config(esp_id, db)

        esp_service: ESPService = get_esp_service(db)
        config_sent = await esp_service.send_config(esp_id, combined_config)

        if config_sent:
            logger.info(f"Config published to ESP {esp_id} after actuator delete")
        else:
            logger.warning(f"Config publish failed for ESP {esp_id} (DB delete was successful)")
    except Exception as e:
        # Log error but don't fail the request (DB delete was successful)
        logger.error(f"Failed to publish config to ESP {esp_id}: {e}", exc_info=True)

    # WebSocket event: Frontend removes actuator from store (analog to sensor_config_deleted)
    try:
        from ...websocket.manager import WebSocketManager

        ws_manager = await WebSocketManager.get_instance()
        await ws_manager.broadcast(
            "actuator_config_deleted",
            {
                "esp_id": esp_id,
                "gpio": gpio,
                "actuator_type": actuator.actuator_type,
            },
        )
    except Exception as e:
        logger.debug(f"WebSocket broadcast for actuator_config_deleted: {e}")

    return _model_to_schema_response(actuator, esp_id, None)


# =============================================================================
# History
# =============================================================================


@router.get(
    "/{esp_id}/{gpio}/history",
    response_model=ActuatorHistoryResponse,
    summary="Get actuator command history",
    description="Get command history for an actuator with optional time filters and aggregation.",
)
async def get_history(
    esp_id: str,
    gpio: int,
    db: DBSession,
    current_user: ActiveUser,
    limit: Annotated[int, Query(ge=1, le=500)] = 20,
    start_time: Annotated[
        Optional[datetime], Query(description="Start of time range (UTC)")
    ] = None,
    end_time: Annotated[
        Optional[datetime], Query(description="End of time range (UTC)")
    ] = None,
    include_aggregation: Annotated[
        bool, Query(description="Include runtime aggregation in response")
    ] = False,
) -> ActuatorHistoryResponse:
    """
    Get actuator command history with optional runtime aggregation.

    When include_aggregation=true, computes total_runtime_seconds, total_cycles,
    duty_cycle_percent and avg_cycle_seconds from the history entries in the
    queried time range.
    """
    esp_repo = ESPRepository(db)
    actuator_repo = ActuatorRepository(db)

    esp_device = await esp_repo.get_by_device_id(esp_id)
    if not esp_device:
        raise ESPNotFoundError(esp_id)

    # Ensure timezone-aware timestamps
    if start_time and start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    if end_time and end_time.tzinfo is None:
        end_time = end_time.replace(tzinfo=timezone.utc)

    # Get history entries with optional time filters
    history = await actuator_repo.get_history(
        esp_device.id,
        gpio,
        limit=limit,
        start_time=start_time,
        end_time=end_time,
    )

    entries = [
        ActuatorHistoryEntry(
            id=entry.id,
            gpio=entry.gpio,
            actuator_type=entry.actuator_type,
            command_type=entry.command_type,
            value=entry.value,
            success=entry.success,
            issued_by=entry.issued_by,
            error_message=entry.error_message,
            metadata=entry.command_metadata,
            timestamp=entry.timestamp,
        )
        for entry in history
    ]

    aggregation = None
    if include_aggregation and entries:
        aggregation = _compute_aggregation(entries, start_time, end_time)

    return ActuatorHistoryResponse(
        success=True,
        esp_id=esp_id,
        gpio=gpio,
        entries=entries,
        total_count=len(entries),
        aggregation=aggregation,
        from_time=start_time,
        to_time=end_time,
    )


def _compute_aggregation(
    entries: list,
    start_time: Optional[datetime],
    end_time: Optional[datetime],
) -> ActuatorAggregation:
    """Compute runtime aggregation from history entries.

    Calculates ON-intervals by pairing ON/SET/PWM commands (value > 0) with
    subsequent OFF/STOP/EMERGENCY_STOP commands. If the last ON has no
    matching OFF, end_time (or now) is used as interval end.

    Matching is case-insensitive to handle REST API values (ON/OFF/PWM),
    MQTT values (on/off), and legacy DB values (set/stop/emergency_stop).
    """
    now = datetime.now(timezone.utc)
    range_end = end_time or now
    range_start = start_time or (
        entries[-1].timestamp if entries else now
    )

    # Sort entries ascending by timestamp for interval pairing
    sorted_entries = sorted(entries, key=lambda e: e.timestamp)

    total_runtime = 0.0
    total_cycles = 0
    on_start: Optional[datetime] = None

    for entry in sorted_entries:
        cmd = entry.command_type.lower() if entry.command_type else ""
        is_on = (
            cmd in ("set", "on", "pwm")
            and entry.value is not None
            and entry.value > 0
        )
        is_off = cmd in ("stop", "off", "emergency_stop") or (
            cmd in ("set", "on", "pwm")
            and (entry.value is None or entry.value == 0.0)
        )

        if is_on:
            if on_start is None:
                on_start = entry.timestamp
                total_cycles += 1
        elif is_off and on_start is not None:
            delta = (entry.timestamp - on_start).total_seconds()
            total_runtime += max(delta, 0.0)
            on_start = None

    # If still ON at end of range, count up to range_end
    if on_start is not None:
        delta = (range_end - on_start).total_seconds()
        total_runtime += max(delta, 0.0)

    # Duty cycle
    total_range = (range_end - range_start).total_seconds()
    duty_cycle = (total_runtime / total_range * 100.0) if total_range > 0 else 0.0

    # Avg cycle
    avg_cycle = total_runtime / total_cycles if total_cycles > 0 else 0.0

    return ActuatorAggregation(
        total_runtime_seconds=round(total_runtime, 1),
        total_cycles=total_cycles,
        duty_cycle_percent=round(min(duty_cycle, 100.0), 1),
        avg_cycle_seconds=round(avg_cycle, 1),
    )


# =========================================================================
# ALERT CONFIGURATION (Phase 4A.7 — Per-Actuator Alert Suppression)
# =========================================================================


@router.patch(
    "/{actuator_id}/alert-config",
    summary="Update actuator alert configuration",
)
async def update_actuator_alert_config(
    actuator_id: uuid.UUID,
    payload: ActuatorAlertConfigUpdate,
    db: DBSession,
    current_user: OperatorUser,
) -> dict:
    """
    Update per-actuator alert configuration (ISA-18.2 Shelved Alarms).

    Merges provided fields into the existing alert_config JSONB.
    Only provided fields are updated — others remain unchanged.
    """
    actuator_repo = ActuatorRepository(db)
    actuator = await actuator_repo.get_by_id(actuator_id)
    if not actuator:
        raise ActuatorNotFoundError(actuator_id)

    # Merge into existing alert_config
    existing = actuator.alert_config or {}
    update_data = payload.model_dump(exclude_unset=True)

    # Handle custom_thresholds merge
    if "custom_thresholds" in update_data and update_data["custom_thresholds"]:
        existing_thresholds = existing.get("custom_thresholds", {})
        existing_thresholds.update(update_data.pop("custom_thresholds"))
        existing["custom_thresholds"] = existing_thresholds

    existing.update(update_data)
    actuator.alert_config = existing

    await db.commit()
    await db.refresh(actuator)

    logger.info(f"Alert config updated for actuator {actuator_id} by user {current_user.id}")

    return {
        "success": True,
        "actuator_id": str(actuator.id),
        "alert_config": actuator.alert_config,
    }


@router.patch(
    "/{actuator_id}/runtime",
    summary="Update actuator runtime statistics",
)
async def update_actuator_runtime(
    actuator_id: uuid.UUID,
    payload: RuntimeStatsUpdate,
    db: DBSession,
    current_user: OperatorUser,
) -> dict:
    """
    Update actuator runtime statistics.

    Merges provided fields. Appends to maintenance_log if provided.
    """
    actuator_repo = ActuatorRepository(db)
    actuator = await actuator_repo.get_by_id(actuator_id)
    if not actuator:
        raise ActuatorNotFoundError(actuator_id)

    existing = dict(actuator.runtime_stats or {})  # Copy to trigger SA change detection
    update_data = payload.model_dump(exclude_unset=True)

    # Append maintenance_log entries instead of replacing
    if "maintenance_log" in update_data and update_data["maintenance_log"]:
        existing_log = existing.get("maintenance_log", [])
        existing_log.extend(update_data.pop("maintenance_log"))
        existing["maintenance_log"] = existing_log

    existing.update(update_data)
    actuator.runtime_stats = existing

    await db.commit()
    await db.refresh(actuator)

    logger.info(f"Runtime stats updated for actuator {actuator_id} by user {current_user.id}")

    return {
        "success": True,
        "actuator_id": str(actuator.id),
        "runtime_stats": actuator.runtime_stats,
    }
