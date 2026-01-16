"""
Actuator Management API Endpoints

Phase: 5 (Week 9-10) - API Layer
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

from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ...core.logging_config import get_logger
from ...db.models.actuator import ActuatorConfig, ActuatorState as ActuatorStateModel
from ...db.repositories import ActuatorRepository, ESPRepository, SensorRepository
from ...mqtt.publisher import Publisher
from ...schemas import (
    ActuatorCommand,
    ActuatorCommandResponse,
    ActuatorConfigCreate,
    ActuatorConfigListResponse,
    ActuatorConfigResponse,
    ActuatorConfigUpdate,
    ActuatorHistoryResponse,
    ActuatorState,
    ActuatorStatusResponse,
    EmergencyStopRequest,
    EmergencyStopResponse,
)
from ...schemas.common import PaginationMeta
from ...services.actuator_service import ActuatorService
from ...services.config_builder import ConfigPayloadBuilder
from ...services.esp_service import ESPService
from ...services.gpio_validation_service import GpioValidationService
from ..deps import ActiveUser, DBSession, OperatorUser, get_actuator_service, get_config_builder, get_esp_service, get_mqtt_publisher

logger = get_logger(__name__)

router = APIRouter(prefix="/v1/actuators", tags=["actuators"])

TECH_METADATA_KEYS = {"pwm_frequency", "servo_min_pulse", "servo_max_pulse"}


def _model_to_schema_response(
    actuator: ActuatorConfig,
    esp_device_id: Optional[str] = None,
    state: Optional[ActuatorStateModel] = None,
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
        current_value=state.value if state else None,
        is_active=state.is_active if state else False,
        last_command_at=state.last_command_at if state else None,
        created_at=actuator.created_at,
        updated_at=actuator.updated_at,
    )


def _schema_to_model_fields(
    request: ActuatorConfigCreate,
    existing: Optional[ActuatorConfig] = None,
) -> dict:
    """
    Convert request schema into model field names.
    """
    # Start with existing for partial updates to avoid dropping data
    safety_constraints = dict(existing.safety_constraints) if existing and existing.safety_constraints else {}
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
        _model_to_schema_response(actuator, device_id, state)
        for actuator, device_id, state in rows
    ]

    return ActuatorConfigListResponse(
        success=True,
        data=responses,
        pagination=PaginationMeta.from_pagination(page, page_size, total_items),
    )


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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ESP device '{esp_id}' not found",
        )
    
    actuator = await actuator_repo.get_by_esp_and_gpio(esp_device.id, gpio)
    if not actuator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Actuator on GPIO {gpio} not found for ESP '{esp_id}'",
        )
    
    state = await actuator_repo.get_state(esp_device.id, gpio)
    
    return _model_to_schema_response(actuator, esp_id, state)


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
    esp_repo = ESPRepository(db)
    actuator_repo = ActuatorRepository(db)
    sensor_repo = SensorRepository(db)

    esp_device = await esp_repo.get_by_device_id(esp_id)
    if not esp_device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ESP device '{esp_id}' not found",
        )

    # Check if actuator exists
    existing = await actuator_repo.get_by_esp_and_gpio(esp_device.id, gpio)

    # =========================================================================
    # GPIO-Validierung (Phase 2)
    # Prüft: System-Pins, DB-Sensoren, DB-Aktoren, ESP-gemeldeten Status
    # =========================================================================
    gpio_validator = GpioValidationService(
        session=db,
        sensor_repo=sensor_repo,
        actuator_repo=actuator_repo,
        esp_repo=esp_repo
    )

    validation_result = await gpio_validator.validate_gpio_available(
        esp_db_id=esp_device.id,
        gpio=gpio,
        exclude_actuator_id=existing.id if existing else None,
        purpose="actuator",
        interface_type="DIGITAL"
    )

    if not validation_result.available:
        logger.warning(
            f"GPIO conflict for ESP {esp_id}, GPIO {gpio}: "
            f"{validation_result.conflict_type} - {validation_result.message}"
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "GPIO_CONFLICT",
                "gpio": gpio,
                "conflict_type": validation_result.conflict_type.value,
                "conflict_component": validation_result.conflict_component,
                "conflict_id": str(validation_result.conflict_id) if validation_result.conflict_id else None,
                "message": validation_result.message
            }
        )
    # =========================================================================

    if existing:
        # Update existing
        model_fields = _schema_to_model_fields(request, existing=existing)
        for field, value in model_fields.items():
            setattr(existing, field, value)
        actuator = existing
        logger.info(f"Actuator updated: {esp_id} GPIO {gpio} by {current_user.username}")
    else:
        # Create new
        model_fields = _schema_to_model_fields(request)
        actuator = ActuatorConfig(
            esp_id=esp_device.id,
            gpio=gpio,
            **model_fields,
        )
        await actuator_repo.create(actuator)
        logger.info(f"Actuator created: {esp_id} GPIO {gpio} by {current_user.username}")
    
    await db.commit()
    
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
    
    return _model_to_schema_response(actuator, esp_id, None)


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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ESP device '{esp_id}' not found",
        )
    
    actuator = await actuator_repo.get_by_esp_and_gpio(esp_device.id, gpio)
    if not actuator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Actuator on GPIO {gpio} not found for ESP '{esp_id}'",
        )
    
    if not actuator.enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Actuator is disabled",
        )
    
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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Command rejected by safety validation or MQTT publish failed",
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ESP device '{esp_id}' not found",
        )
    
    actuator = await actuator_repo.get_by_esp_and_gpio(esp_device.id, gpio)
    if not actuator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Actuator on GPIO {gpio} not found for ESP '{esp_id}'",
        )
    
    state = await actuator_repo.get_state(esp_device.id, gpio)
    
    # Build state response
    state_response = ActuatorState(
        gpio=gpio,
        mode=actuator.actuator_type,
        value=state.value if state else 0.0,
        is_active=state.is_active if state else False,
        last_command=state.last_command if state else None,
        last_command_at=state.last_command_at if state else None,
        runtime_seconds=None,  # Would calculate from last_command_at
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
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"ESP device '{request.esp_id}' not found",
            )
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ESP device '{esp_id}' not found",
        )
    
    actuator = await actuator_repo.get_by_esp_and_gpio(esp_device.id, gpio)
    if not actuator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Actuator on GPIO {gpio} not found for ESP '{esp_id}'",
        )
    
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
    deleted = await actuator_repo.delete(actuator.id)
    await db.commit()
    
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
    
    return _model_to_schema_response(actuator, esp_id, None)


# =============================================================================
# History
# =============================================================================


@router.get(
    "/{esp_id}/{gpio}/history",
    response_model=ActuatorHistoryResponse,
    summary="Get actuator command history",
    description="Get command history for an actuator.",
)
async def get_history(
    esp_id: str,
    gpio: int,
    db: DBSession,
    current_user: ActiveUser,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> ActuatorHistoryResponse:
    """
    Get actuator command history.
    
    Args:
        esp_id: ESP device ID
        gpio: GPIO pin number
        db: Database session
        current_user: Authenticated user
        limit: Max entries to return
        
    Returns:
        Command history
    """
    esp_repo = ESPRepository(db)
    actuator_repo = ActuatorRepository(db)
    
    esp_device = await esp_repo.get_by_device_id(esp_id)
    if not esp_device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ESP device '{esp_id}' not found",
        )
    
    # Get history entries
    history = await actuator_repo.get_history(esp_device.id, gpio, limit=limit)
    
    from ...schemas import ActuatorHistoryEntry
    
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
            metadata=entry.metadata,
            timestamp=entry.created_at,
        )
        for entry in history
    ]
    
    return ActuatorHistoryResponse(
        success=True,
        esp_id=esp_id,
        gpio=gpio,
        entries=entries,
        total_count=len(entries),
    )
