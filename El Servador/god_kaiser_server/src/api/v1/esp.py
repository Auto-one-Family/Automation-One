"""
ESP Device Management API Endpoints

Phase: 5 (Week 9-10) - API Layer
Priority: 🔴 CRITICAL
Status: IMPLEMENTED

Provides:
- GET /devices - List all ESPs
- GET /devices/{esp_id} - ESP details
- POST /devices - Register new ESP
- PATCH /devices/{esp_id} - Update ESP
- DELETE /devices/{esp_id} - Delete ESP (for orphaned mocks/decommissioned HW)
- POST /devices/{esp_id}/config - Update config via MQTT
- POST /devices/{esp_id}/restart - Restart command
- POST /devices/{esp_id}/reset - Factory reset
- GET /devices/{esp_id}/health - Health metrics
- POST /devices/{esp_id}/assign_kaiser - Assign to Kaiser
- GET /discovery - Network discovery results

References:
- .claude/PI_SERVER_REFACTORING.md (Lines 125-133)
- El Trabajante/docs/Mqtt_Protocoll.md (System commands)
"""

from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ...core.logging_config import get_logger
from ...db.repositories import ActuatorRepository, ESPRepository, SensorRepository
from ...mqtt.publisher import Publisher
from ...schemas import (
    AssignKaiserRequest,
    AssignKaiserResponse,
    ESPCommandResponse,
    ESPConfigResponse,
    ESPConfigUpdate,
    ESPDeviceCreate,
    ESPDeviceListResponse,
    ESPDeviceResponse,
    ESPDeviceUpdate,
    ESPDiscoveryResponse,
    ESPHealthResponse,
    ESPResetRequest,
    ESPRestartRequest,
    DiscoveredESP,
)
from ...schemas.common import PaginationMeta, PaginationParams
from ..deps import ActiveUser, DBSession, OperatorUser, get_mqtt_publisher

logger = get_logger(__name__)

router = APIRouter(prefix="/v1/esp", tags=["esp"])


# =============================================================================
# Helper Functions
# =============================================================================


def _extract_mock_fields(device) -> tuple[Optional[bool], Optional[int]]:
    """
    Extract Mock ESP specific fields from device_metadata.

    Returns:
        Tuple of (auto_heartbeat, heartbeat_interval_seconds)
        Both are None for non-Mock ESPs.
    """
    if device.hardware_type != "MOCK_ESP32":
        return None, None

    if not device.device_metadata:
        return None, None

    sim_config = device.device_metadata.get("simulation_config", {})
    auto_heartbeat = sim_config.get("auto_heartbeat")
    heartbeat_interval = sim_config.get("heartbeat_interval")

    # Convert to int if present (DB stores as float)
    heartbeat_interval_seconds = (
        int(heartbeat_interval) if heartbeat_interval is not None else None
    )

    return auto_heartbeat, heartbeat_interval_seconds


# =============================================================================
# List Devices
# =============================================================================


@router.get(
    "/devices",
    response_model=ESPDeviceListResponse,
    summary="List ESP devices",
    description="Get all registered ESP devices with optional filters.",
)
async def list_devices(
    db: DBSession,
    current_user: ActiveUser,
    zone_id: Annotated[Optional[str], Query(description="Filter by zone ID")] = None,
    status_filter: Annotated[Optional[str], Query(alias="status", description="Filter by status")] = None,
    hardware_type: Annotated[Optional[str], Query(description="Filter by hardware type")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> ESPDeviceListResponse:
    """
    List all ESP devices.
    
    Args:
        db: Database session
        current_user: Authenticated user
        zone_id: Optional zone filter
        status_filter: Optional status filter
        hardware_type: Optional hardware type filter
        page: Page number
        page_size: Items per page
        
    Returns:
        Paginated list of ESP devices
    """
    esp_repo = ESPRepository(db)
    sensor_repo = SensorRepository(db)
    actuator_repo = ActuatorRepository(db)
    
    # Get all devices (with filters)
    if zone_id:
        devices = await esp_repo.get_by_zone(zone_id)
    elif status_filter:
        devices = await esp_repo.get_by_status(status_filter)
    elif hardware_type:
        devices = await esp_repo.get_by_hardware_type(hardware_type)
    else:
        devices = await esp_repo.get_all()
    
    # Apply pagination
    total_items = len(devices)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_devices = devices[start_idx:end_idx]
    
    # Build response with sensor/actuator counts
    device_responses = []
    for device in paginated_devices:
        sensor_count = await sensor_repo.count_by_esp(device.id)
        actuator_count = await actuator_repo.count_by_esp(device.id)

        # Extract Mock-specific fields
        auto_heartbeat, heartbeat_interval_seconds = _extract_mock_fields(device)

        device_responses.append(ESPDeviceResponse(
            id=device.id,
            device_id=device.device_id,
            name=device.name,
            zone_id=device.zone_id,
            zone_name=device.zone_name,
            is_zone_master=device.is_zone_master,
            ip_address=device.ip_address,
            mac_address=device.mac_address,
            firmware_version=device.firmware_version,
            hardware_type=device.hardware_type,
            capabilities=device.capabilities,
            status=device.status,
            last_seen=device.last_seen,
            metadata=device.device_metadata,
            sensor_count=sensor_count,
            actuator_count=actuator_count,
            auto_heartbeat=auto_heartbeat,
            heartbeat_interval_seconds=heartbeat_interval_seconds,
            created_at=device.created_at,
            updated_at=device.updated_at,
        ))
    
    return ESPDeviceListResponse(
        success=True,
        data=device_responses,
        pagination=PaginationMeta.from_pagination(page, page_size, total_items),
    )


# =============================================================================
# Get Device
# =============================================================================


@router.get(
    "/devices/{esp_id}",
    response_model=ESPDeviceResponse,
    responses={
        200: {"description": "Device found"},
        404: {"description": "Device not found"},
    },
    summary="Get ESP device details",
    description="Get detailed information about a specific ESP device.",
)
async def get_device(
    esp_id: str,
    db: DBSession,
    current_user: ActiveUser,
) -> ESPDeviceResponse:
    """
    Get ESP device by device_id.
    
    Args:
        esp_id: ESP device ID (e.g., ESP_12AB34CD)
        db: Database session
        current_user: Authenticated user
        
    Returns:
        ESP device details
        
    Raises:
        HTTPException: 404 if not found
    """
    esp_repo = ESPRepository(db)
    sensor_repo = SensorRepository(db)
    actuator_repo = ActuatorRepository(db)
    
    device = await esp_repo.get_by_device_id(esp_id)
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ESP device '{esp_id}' not found",
        )
    
    sensor_count = await sensor_repo.count_by_esp(device.id)
    actuator_count = await actuator_repo.count_by_esp(device.id)

    # Extract Mock-specific fields
    auto_heartbeat, heartbeat_interval_seconds = _extract_mock_fields(device)

    return ESPDeviceResponse(
        id=device.id,
        device_id=device.device_id,
        name=device.name,
        zone_id=device.zone_id,
        zone_name=device.zone_name,
        is_zone_master=device.is_zone_master,
        ip_address=device.ip_address,
        mac_address=device.mac_address,
        firmware_version=device.firmware_version,
        hardware_type=device.hardware_type,
        capabilities=device.capabilities,
        status=device.status,
        last_seen=device.last_seen,
        metadata=device.device_metadata,
        sensor_count=sensor_count,
        actuator_count=actuator_count,
        auto_heartbeat=auto_heartbeat,
        heartbeat_interval_seconds=heartbeat_interval_seconds,
        created_at=device.created_at,
        updated_at=device.updated_at,
    )


# =============================================================================
# Register Device
# =============================================================================


@router.post(
    "/devices",
    response_model=ESPDeviceResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"description": "Device registered"},
        400: {"description": "Device already exists"},
    },
    summary="Register new ESP device",
    description="Manually register a new ESP device.",
)
async def register_device(
    request: ESPDeviceCreate,
    db: DBSession,
    current_user: OperatorUser,
) -> ESPDeviceResponse:
    """
    Register a new ESP device.
    
    Args:
        request: Device registration data
        db: Database session
        current_user: Operator or admin user
        
    Returns:
        Registered device details
        
    Raises:
        HTTPException: 400 if device already exists
    """
    esp_repo = ESPRepository(db)
    
    # Check if device already exists
    existing = await esp_repo.get_by_device_id(request.device_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"ESP device '{request.device_id}' already registered",
        )
    
    # Create device
    from ...db.models.esp import ESPDevice
    
    device = ESPDevice(
        device_id=request.device_id,
        name=request.name,
        zone_id=request.zone_id,
        zone_name=request.zone_name,
        is_zone_master=request.is_zone_master,
        ip_address=request.ip_address,
        mac_address=request.mac_address,
        firmware_version=request.firmware_version,
        hardware_type=request.hardware_type,
        capabilities=request.capabilities or {},
        status="unknown",
        device_metadata={},
    )
    
    db.add(device)
    await db.flush()
    await db.refresh(device)
    await db.commit()
    
    logger.info(f"ESP device registered: {device.device_id} by {current_user.username}")

    # Extract Mock-specific fields (will be None for newly registered real ESPs)
    auto_heartbeat, heartbeat_interval_seconds = _extract_mock_fields(device)

    return ESPDeviceResponse(
        id=device.id,
        device_id=device.device_id,
        name=device.name,
        zone_id=device.zone_id,
        zone_name=device.zone_name,
        is_zone_master=device.is_zone_master,
        ip_address=device.ip_address,
        mac_address=device.mac_address,
        firmware_version=device.firmware_version,
        hardware_type=device.hardware_type,
        capabilities=device.capabilities,
        status=device.status,
        last_seen=device.last_seen,
        metadata=device.device_metadata,
        sensor_count=0,
        actuator_count=0,
        auto_heartbeat=auto_heartbeat,
        heartbeat_interval_seconds=heartbeat_interval_seconds,
        created_at=device.created_at,
        updated_at=device.updated_at,
    )


# =============================================================================
# Update Device
# =============================================================================


@router.patch(
    "/devices/{esp_id}",
    response_model=ESPDeviceResponse,
    responses={
        200: {"description": "Device updated"},
        404: {"description": "Device not found"},
    },
    summary="Update ESP device",
    description="Update ESP device information.",
)
async def update_device(
    esp_id: str,
    request: ESPDeviceUpdate,
    db: DBSession,
    current_user: OperatorUser,
) -> ESPDeviceResponse:
    """
    Update ESP device.
    
    Args:
        esp_id: ESP device ID
        request: Update data
        db: Database session
        current_user: Operator or admin user
        
    Returns:
        Updated device details
    """
    esp_repo = ESPRepository(db)
    sensor_repo = SensorRepository(db)
    actuator_repo = ActuatorRepository(db)
    
    device = await esp_repo.get_by_device_id(esp_id)
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ESP device '{esp_id}' not found",
        )
    
    # Update fields
    update_data = request.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(device, field, value)
    
    await db.flush()
    await db.commit()

    # Sensor/Actuator counts (needed for MOCK-FIX and response)
    sensor_count = await sensor_repo.count_by_esp(device.id)
    actuator_count = await actuator_repo.count_by_esp(device.id)

    # Für Mock ESPs: Heartbeat triggern für korrekte Health-Metriken
    # Der SimulationScheduler hat die aktuellen Runtime-Werte und sendet ein
    # vollständiges esp_health Event via MQTT → WebSocket
    if device.hardware_type == "MOCK_ESP32":
        try:
            from ..deps import get_simulation_scheduler
            scheduler = get_simulation_scheduler()
            if scheduler.is_mock_active(esp_id):
                await scheduler.trigger_heartbeat(esp_id)
                logger.debug(f"[MOCK-FIX] Triggered heartbeat for {esp_id} after update")
            else:
                logger.debug(f"[MOCK-FIX] Mock {esp_id} not active, skipping heartbeat")
        except Exception as e:
            # Non-critical: Log but don't fail the update
            logger.warning(f"[MOCK-FIX] ERROR triggering heartbeat for {esp_id}: {e}")

    logger.info(f"ESP device updated: {esp_id} by {current_user.username}")

    # Extract Mock-specific fields
    auto_heartbeat, heartbeat_interval_seconds = _extract_mock_fields(device)

    return ESPDeviceResponse(
        id=device.id,
        device_id=device.device_id,
        name=device.name,
        zone_id=device.zone_id,
        zone_name=device.zone_name,
        is_zone_master=device.is_zone_master,
        ip_address=device.ip_address,
        mac_address=device.mac_address,
        firmware_version=device.firmware_version,
        hardware_type=device.hardware_type,
        capabilities=device.capabilities,
        status=device.status,
        last_seen=device.last_seen,
        metadata=device.device_metadata,
        sensor_count=sensor_count,
        actuator_count=actuator_count,
        auto_heartbeat=auto_heartbeat,
        heartbeat_interval_seconds=heartbeat_interval_seconds,
        created_at=device.created_at,
        updated_at=device.updated_at,
    )


# =============================================================================
# Delete Device
# =============================================================================


@router.delete(
    "/devices/{esp_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        204: {"description": "Device deleted"},
        404: {"description": "Device not found"},
    },
    summary="Delete ESP device",
    description="Remove an ESP device from the database. Use for orphaned mock devices or decommissioned hardware.",
)
async def delete_device(
    esp_id: str,
    db: DBSession,
    current_user: OperatorUser,
) -> None:
    """
    Delete ESP device from database.

    WARNING: This also deletes associated sensors and actuators.
    Use primarily for:
    - Orphaned mock devices
    - Decommissioned hardware
    - Cleaning up test data

    Args:
        esp_id: ESP device ID (e.g., ESP_MOCK_E92BAA)
        db: Database session
        current_user: Operator or admin user

    Raises:
        HTTPException: 404 if not found
    """
    esp_repo = ESPRepository(db)
    sensor_repo = SensorRepository(db)
    actuator_repo = ActuatorRepository(db)

    device = await esp_repo.get_by_device_id(esp_id)
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ESP device '{esp_id}' not found",
        )

    # Delete associated sensors and actuators first
    sensors = await sensor_repo.get_by_esp(device.id)
    for sensor in sensors:
        await sensor_repo.delete(sensor.id)

    actuators = await actuator_repo.get_by_esp(device.id)
    for actuator in actuators:
        await actuator_repo.delete(actuator.id)

    # Delete the device
    await db.delete(device)
    await db.commit()

    logger.warning(f"ESP device deleted: {esp_id} (including {len(sensors)} sensors, {len(actuators)} actuators) by {current_user.username}")


# =============================================================================
# Config Update
# =============================================================================


@router.post(
    "/devices/{esp_id}/config",
    response_model=ESPConfigResponse,
    responses={
        200: {"description": "Config sent"},
        404: {"description": "Device not found"},
    },
    summary="Update ESP configuration",
    description="Send configuration update to ESP via MQTT.",
)
async def update_device_config(
    esp_id: str,
    request: ESPConfigUpdate,
    db: DBSession,
    current_user: OperatorUser,
    publisher: Annotated[Publisher, Depends(get_mqtt_publisher)],
) -> ESPConfigResponse:
    """
    Send configuration update to ESP.
    
    Args:
        esp_id: ESP device ID
        request: Configuration update
        db: Database session
        current_user: Operator or admin user
        publisher: MQTT publisher
        
    Returns:
        Config update response
    """
    esp_repo = ESPRepository(db)
    
    device = await esp_repo.get_by_device_id(esp_id)
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ESP device '{esp_id}' not found",
        )
    
    # Build config payload
    config_data = request.model_dump(exclude_unset=True)
    
    # Publish via MQTT
    from ...mqtt.topics import TopicBuilder
    topic = TopicBuilder.build_config_topic(esp_id)
    
    success = publisher._publish_with_retry(
        topic=topic,
        payload=config_data,
        qos=2,
        retry=True,
    )
    
    logger.info(f"Config sent to {esp_id}: {config_data} by {current_user.username}")
    
    return ESPConfigResponse(
        success=success,
        message="Configuration sent" if success else "Failed to send configuration",
        device_id=esp_id,
        config_sent=success,
        config_acknowledged=False,  # ACK is async
    )


# =============================================================================
# Restart Command
# =============================================================================


@router.post(
    "/devices/{esp_id}/restart",
    response_model=ESPCommandResponse,
    responses={
        200: {"description": "Restart command sent"},
        404: {"description": "Device not found"},
    },
    summary="Restart ESP device",
    description="Send restart command to ESP via MQTT.",
)
async def restart_device(
    esp_id: str,
    request: ESPRestartRequest,
    db: DBSession,
    current_user: OperatorUser,
    publisher: Annotated[Publisher, Depends(get_mqtt_publisher)],
) -> ESPCommandResponse:
    """
    Send restart command to ESP.
    
    Args:
        esp_id: ESP device ID
        request: Restart parameters
        db: Database session
        current_user: Operator or admin user
        publisher: MQTT publisher
        
    Returns:
        Command response
    """
    esp_repo = ESPRepository(db)
    
    device = await esp_repo.get_by_device_id(esp_id)
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ESP device '{esp_id}' not found",
        )
    
    # Publish restart command
    success = publisher.publish_system_command(
        esp_id=esp_id,
        command="REBOOT",
        params={
            "delay_seconds": request.delay_seconds,
            "reason": request.reason or f"Manual restart by {current_user.username}",
        },
    )
    
    logger.info(f"Restart command sent to {esp_id} by {current_user.username}")
    
    return ESPCommandResponse(
        success=success,
        message="Restart command sent" if success else "Failed to send restart command",
        device_id=esp_id,
        command="restart",
        command_sent=success,
    )


# =============================================================================
# Factory Reset
# =============================================================================


@router.post(
    "/devices/{esp_id}/reset",
    response_model=ESPCommandResponse,
    responses={
        200: {"description": "Reset command sent"},
        400: {"description": "Confirmation required"},
        404: {"description": "Device not found"},
    },
    summary="Factory reset ESP device",
    description="Send factory reset command to ESP. Requires confirmation.",
)
async def reset_device(
    esp_id: str,
    request: ESPResetRequest,
    db: DBSession,
    current_user: OperatorUser,
    publisher: Annotated[Publisher, Depends(get_mqtt_publisher)],
) -> ESPCommandResponse:
    """
    Send factory reset command to ESP.
    
    Args:
        esp_id: ESP device ID
        request: Reset parameters (must confirm=True)
        db: Database session
        current_user: Operator or admin user
        publisher: MQTT publisher
        
    Returns:
        Command response
    """
    if not request.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Factory reset requires confirm=true",
        )
    
    esp_repo = ESPRepository(db)
    
    device = await esp_repo.get_by_device_id(esp_id)
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ESP device '{esp_id}' not found",
        )
    
    # Publish factory reset command
    success = publisher.publish_system_command(
        esp_id=esp_id,
        command="FACTORY_RESET",
        params={
            "preserve_wifi": request.preserve_wifi,
            "initiated_by": current_user.username,
        },
    )
    
    logger.warning(f"Factory reset sent to {esp_id} by {current_user.username}")
    
    return ESPCommandResponse(
        success=success,
        message="Factory reset command sent" if success else "Failed to send reset command",
        device_id=esp_id,
        command="factory_reset",
        command_sent=success,
    )


# =============================================================================
# Health Check
# =============================================================================


@router.get(
    "/devices/{esp_id}/health",
    response_model=ESPHealthResponse,
    responses={
        200: {"description": "Health data retrieved"},
        404: {"description": "Device not found"},
    },
    summary="Get ESP health metrics",
    description="Get latest health metrics for an ESP device.",
)
async def get_device_health(
    esp_id: str,
    db: DBSession,
    current_user: ActiveUser,
) -> ESPHealthResponse:
    """
    Get ESP device health metrics.
    
    Args:
        esp_id: ESP device ID
        db: Database session
        current_user: Authenticated user
        
    Returns:
        Health metrics
    """
    esp_repo = ESPRepository(db)
    
    device = await esp_repo.get_by_device_id(esp_id)
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ESP device '{esp_id}' not found",
        )
    
    # Get latest health from device_metadata (populated by heartbeat handler)
    health_data = device.device_metadata.get("health", {}) if device.device_metadata else {}
    
    # Format uptime
    uptime_formatted = None
    if "uptime" in health_data:
        uptime = health_data["uptime"]
        days = uptime // 86400
        hours = (uptime % 86400) // 3600
        minutes = (uptime % 3600) // 60
        uptime_formatted = f"{days}d {hours}h {minutes}m"
    
    from ...schemas import ESPHealthMetrics
    
    metrics = None
    if health_data:
        metrics = ESPHealthMetrics(
            uptime=health_data.get("uptime", 0),
            heap_free=health_data.get("heap_free", 0),
            wifi_rssi=health_data.get("wifi_rssi", -100),
            sensor_count=health_data.get("sensor_count", 0),
            actuator_count=health_data.get("actuator_count", 0),
            timestamp=health_data.get("timestamp", 0),
        )
    
    return ESPHealthResponse(
        success=True,
        device_id=esp_id,
        status=device.status,
        metrics=metrics,
        last_seen=device.last_seen,
        uptime_formatted=uptime_formatted,
    )


# =============================================================================
# Assign Kaiser
# =============================================================================


@router.post(
    "/devices/{esp_id}/assign_kaiser",
    response_model=AssignKaiserResponse,
    responses={
        200: {"description": "Kaiser assigned"},
        404: {"description": "Device not found"},
    },
    summary="Assign ESP to Kaiser node",
    description="Assign an ESP device to a Kaiser relay node.",
)
async def assign_kaiser(
    esp_id: str,
    request: AssignKaiserRequest,
    db: DBSession,
    current_user: OperatorUser,
) -> AssignKaiserResponse:
    """
    Assign ESP to Kaiser node.
    
    Args:
        esp_id: ESP device ID
        request: Kaiser assignment
        db: Database session
        current_user: Operator or admin user
        
    Returns:
        Assignment response
    """
    esp_repo = ESPRepository(db)
    
    device = await esp_repo.get_by_device_id(esp_id)
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ESP device '{esp_id}' not found",
        )
    
    previous_kaiser = device.device_metadata.get("kaiser_id") if device.device_metadata else None
    
    # Update device_metadata with Kaiser assignment
    metadata = device.device_metadata or {}
    metadata["kaiser_id"] = request.kaiser_id
    device.device_metadata = metadata
    
    await db.flush()
    await db.commit()
    
    logger.info(f"ESP {esp_id} assigned to Kaiser {request.kaiser_id} by {current_user.username}")
    
    return AssignKaiserResponse(
        success=True,
        message=f"ESP assigned to Kaiser '{request.kaiser_id}'",
        device_id=esp_id,
        kaiser_id=request.kaiser_id,
        previous_kaiser_id=previous_kaiser,
    )


# =============================================================================
# Discovery
# =============================================================================


@router.get(
    "/discovery",
    response_model=ESPDiscoveryResponse,
    summary="Get discovered ESP devices",
    description="Get list of ESP devices discovered via mDNS/network scan.",
)
async def get_discovery(
    db: DBSession,
    current_user: ActiveUser,
) -> ESPDiscoveryResponse:
    """
    Get discovered ESP devices.
    
    Returns devices found via mDNS or the discovery MQTT topic.
    
    Args:
        db: Database session
        current_user: Authenticated user
        
    Returns:
        Discovery results
    """
    esp_repo = ESPRepository(db)
    
    # Get all registered devices
    registered_devices = await esp_repo.get_all()
    registered_ids = {d.device_id for d in registered_devices}
    
    # In a full implementation, this would query:
    # 1. mDNS discovered devices
    # 2. Discovery MQTT topic (kaiser/god/discovery/esp32_nodes)
    # For now, return empty list (discovery handled by MQTT handler)
    
    discovered: List[DiscoveredESP] = []
    
    return ESPDiscoveryResponse(
        success=True,
        message="Discovery results",
        discovered_count=len(discovered),
        new_count=sum(1 for d in discovered if not d.is_registered),
        devices=discovered,
        scan_duration_ms=0,
    )
