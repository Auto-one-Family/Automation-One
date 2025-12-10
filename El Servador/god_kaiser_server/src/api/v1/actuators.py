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
from ...db.repositories import ActuatorRepository, ESPRepository
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
from ...services.safety_service import SafetyService
from ..deps import ActiveUser, DBSession, OperatorUser, get_actuator_service, get_mqtt_publisher

logger = get_logger(__name__)

router = APIRouter(prefix="/v1/actuators", tags=["actuators"])


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
    esp_repo = ESPRepository(db)
    
    # Get all actuators
    all_actuators = await actuator_repo.get_all()
    
    # Apply filters
    filtered = all_actuators
    
    if esp_id:
        esp_device = await esp_repo.get_by_device_id(esp_id)
        if esp_device:
            filtered = [a for a in filtered if a.esp_id == esp_device.id]
        else:
            filtered = []
    
    if actuator_type:
        filtered = [a for a in filtered if a.actuator_type == actuator_type]
    
    if enabled is not None:
        filtered = [a for a in filtered if a.enabled == enabled]
    
    # Pagination
    total_items = len(filtered)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated = filtered[start_idx:end_idx]
    
    # Build responses with ESP device IDs
    responses = []
    for actuator in paginated:
        esp_device = await esp_repo.get_by_id(actuator.esp_id)
        esp_device_id = esp_device.device_id if esp_device else None
        
        # Get current state
        state = await actuator_repo.get_state(actuator.esp_id, actuator.gpio)
        
        responses.append(ActuatorConfigResponse(
            id=actuator.id,
            esp_id=actuator.esp_id,
            esp_device_id=esp_device_id,
            gpio=actuator.gpio,
            actuator_type=actuator.actuator_type,
            name=actuator.name,
            enabled=actuator.enabled,
            max_runtime_seconds=actuator.max_runtime_seconds,
            cooldown_seconds=actuator.cooldown_seconds,
            pwm_frequency=actuator.pwm_frequency,
            servo_min_pulse=actuator.servo_min_pulse,
            servo_max_pulse=actuator.servo_max_pulse,
            metadata=actuator.metadata,
            current_value=state.value if state else None,
            is_active=state.is_active if state else False,
            last_command_at=state.last_command_at if state else None,
            created_at=actuator.created_at,
            updated_at=actuator.updated_at,
        ))
    
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
    
    return ActuatorConfigResponse(
        id=actuator.id,
        esp_id=actuator.esp_id,
        esp_device_id=esp_id,
        gpio=actuator.gpio,
        actuator_type=actuator.actuator_type,
        name=actuator.name,
        enabled=actuator.enabled,
        max_runtime_seconds=actuator.max_runtime_seconds,
        cooldown_seconds=actuator.cooldown_seconds,
        pwm_frequency=actuator.pwm_frequency,
        servo_min_pulse=actuator.servo_min_pulse,
        servo_max_pulse=actuator.servo_max_pulse,
        metadata=actuator.metadata,
        current_value=state.value if state else None,
        is_active=state.is_active if state else False,
        last_command_at=state.last_command_at if state else None,
        created_at=actuator.created_at,
        updated_at=actuator.updated_at,
    )


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
    
    esp_device = await esp_repo.get_by_device_id(esp_id)
    if not esp_device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ESP device '{esp_id}' not found",
        )
    
    # Check if actuator exists
    existing = await actuator_repo.get_by_esp_and_gpio(esp_device.id, gpio)
    
    if existing:
        # Update existing
        update_data = request.model_dump(exclude={"esp_id"}, exclude_unset=True)
        for field, value in update_data.items():
            setattr(existing, field, value)
        actuator = existing
        logger.info(f"Actuator updated: {esp_id} GPIO {gpio} by {current_user.username}")
    else:
        # Create new
        actuator = ActuatorConfig(
            esp_id=esp_device.id,
            gpio=gpio,
            actuator_type=request.actuator_type,
            name=request.name,
            enabled=request.enabled,
            max_runtime_seconds=request.max_runtime_seconds,
            cooldown_seconds=request.cooldown_seconds,
            pwm_frequency=request.pwm_frequency,
            servo_min_pulse=request.servo_min_pulse,
            servo_max_pulse=request.servo_max_pulse,
            metadata=request.metadata or {},
        )
        await actuator_repo.create(actuator)
        logger.info(f"Actuator created: {esp_id} GPIO {gpio} by {current_user.username}")
    
    await db.commit()
    
    return ActuatorConfigResponse(
        id=actuator.id,
        esp_id=actuator.esp_id,
        esp_device_id=esp_id,
        gpio=actuator.gpio,
        actuator_type=actuator.actuator_type,
        name=actuator.name,
        enabled=actuator.enabled,
        max_runtime_seconds=actuator.max_runtime_seconds,
        cooldown_seconds=actuator.cooldown_seconds,
        pwm_frequency=actuator.pwm_frequency,
        servo_min_pulse=actuator.servo_min_pulse,
        servo_max_pulse=actuator.servo_max_pulse,
        metadata=actuator.metadata,
        current_value=None,
        is_active=False,
        last_command_at=None,
        created_at=actuator.created_at,
        updated_at=actuator.updated_at,
    )


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
    
    # Initialize services
    safety_service = SafetyService(actuator_repo, esp_repo)
    publisher = Publisher()
    actuator_service = ActuatorService(actuator_repo, safety_service, publisher)
    
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
        config = ActuatorConfigResponse(
            id=actuator.id,
            esp_id=actuator.esp_id,
            esp_device_id=esp_id,
            gpio=actuator.gpio,
            actuator_type=actuator.actuator_type,
            name=actuator.name,
            enabled=actuator.enabled,
            max_runtime_seconds=actuator.max_runtime_seconds,
            cooldown_seconds=actuator.cooldown_seconds,
            pwm_frequency=actuator.pwm_frequency,
            servo_min_pulse=actuator.servo_min_pulse,
            servo_max_pulse=actuator.servo_max_pulse,
            metadata=actuator.metadata,
            current_value=state.value if state else None,
            is_active=state.is_active if state else False,
            last_command_at=state.last_command_at if state else None,
            created_at=actuator.created_at,
            updated_at=actuator.updated_at,
        )
    
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
) -> EmergencyStopResponse:
    """
    Emergency stop all actuators.
    
    CRITICAL: This stops all actuators immediately.
    
    Args:
        request: Emergency stop request
        db: Database session
        current_user: Operator or admin user
        
    Returns:
        Emergency stop response
    """
    esp_repo = ESPRepository(db)
    actuator_repo = ActuatorRepository(db)
    publisher = Publisher()
    
    devices_stopped = 0
    actuators_stopped = 0
    
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
        
        # Get actuators for this device
        actuators = await actuator_repo.get_by_esp(device.id)
        
        for actuator in actuators:
            # Skip if specific GPIO requested and doesn't match
            if request.gpio is not None and actuator.gpio != request.gpio:
                continue
            
            # Send OFF command
            success = publisher.publish_actuator_command(
                esp_id=device.device_id,
                gpio=actuator.gpio,
                command="OFF",
                value=0.0,
                duration=0,
                retry=True,
            )
            
            if success:
                device_actuators_stopped += 1
                
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
        
        if device_actuators_stopped > 0:
            devices_stopped += 1
            actuators_stopped += device_actuators_stopped
    
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
) -> ActuatorConfigResponse:
    """
    Delete actuator configuration.
    
    Args:
        esp_id: ESP device ID
        gpio: GPIO pin number
        db: Database session
        current_user: Operator or admin user
        
    Returns:
        Deleted actuator config
    """
    esp_repo = ESPRepository(db)
    actuator_repo = ActuatorRepository(db)
    publisher = Publisher()
    
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
    
    return ActuatorConfigResponse(
        id=actuator.id,
        esp_id=actuator.esp_id,
        esp_device_id=esp_id,
        gpio=actuator.gpio,
        actuator_type=actuator.actuator_type,
        name=actuator.name,
        enabled=actuator.enabled,
        max_runtime_seconds=actuator.max_runtime_seconds,
        cooldown_seconds=actuator.cooldown_seconds,
        pwm_frequency=actuator.pwm_frequency,
        servo_min_pulse=actuator.servo_min_pulse,
        servo_max_pulse=actuator.servo_max_pulse,
        metadata=actuator.metadata,
        current_value=None,
        is_active=False,
        last_command_at=None,
        created_at=actuator.created_at,
        updated_at=actuator.updated_at,
    )


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
