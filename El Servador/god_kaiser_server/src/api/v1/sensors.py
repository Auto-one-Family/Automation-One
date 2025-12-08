"""
Sensor Management API Endpoints

Phase: 5 (Week 9-10) - API Layer
Priority: 🔴 CRITICAL
Status: IMPLEMENTED

Provides:
- GET / - List sensor configs
- GET /{esp_id}/{gpio} - Get sensor config
- POST /{esp_id}/{gpio} - Create/update config
- DELETE /{esp_id}/{gpio} - Remove config
- GET /data - Query sensor data

Note: /process and /calibrate are in sensor_processing.py

References:
- .claude/PI_SERVER_REFACTORING.md (Lines 135-145)
- El Trabajante/docs/Mqtt_Protocoll.md (Sensor topics)
"""

from datetime import datetime, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ...core.logging_config import get_logger
from ...db.models.sensor import SensorConfig, SensorData
from ...db.repositories import ESPRepository, SensorRepository
from ...schemas import (
    SensorConfigCreate,
    SensorConfigListResponse,
    SensorConfigResponse,
    SensorConfigUpdate,
    SensorDataQuery,
    SensorDataResponse,
    SensorReading,
    SensorStats,
    SensorStatsResponse,
)
from ...schemas.common import PaginationMeta
from ..deps import ActiveUser, DBSession, OperatorUser

logger = get_logger(__name__)

router = APIRouter(prefix="/v1/sensors", tags=["sensors"])


# =============================================================================
# List Sensors
# =============================================================================


@router.get(
    "/",
    response_model=SensorConfigListResponse,
    summary="List sensor configurations",
    description="Get all sensor configurations with optional filters.",
)
async def list_sensors(
    db: DBSession,
    current_user: ActiveUser,
    esp_id: Annotated[Optional[str], Query(description="Filter by ESP device ID")] = None,
    sensor_type: Annotated[Optional[str], Query(description="Filter by sensor type")] = None,
    enabled: Annotated[Optional[bool], Query(description="Filter by enabled status")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> SensorConfigListResponse:
    """
    List sensor configurations.
    
    Args:
        db: Database session
        current_user: Authenticated user
        esp_id: Optional ESP filter
        sensor_type: Optional type filter
        enabled: Optional enabled filter
        page: Page number
        page_size: Items per page
        
    Returns:
        Paginated list of sensor configs
    """
    sensor_repo = SensorRepository(db)
    esp_repo = ESPRepository(db)
    
    # Get all sensors
    all_sensors = await sensor_repo.get_all()
    
    # Apply filters
    filtered = all_sensors
    
    if esp_id:
        esp_device = await esp_repo.get_by_device_id(esp_id)
        if esp_device:
            filtered = [s for s in filtered if s.esp_id == esp_device.id]
        else:
            filtered = []
    
    if sensor_type:
        filtered = [s for s in filtered if s.sensor_type == sensor_type.lower()]
    
    if enabled is not None:
        filtered = [s for s in filtered if s.enabled == enabled]
    
    # Pagination
    total_items = len(filtered)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated = filtered[start_idx:end_idx]
    
    # Build responses
    responses = []
    for sensor in paginated:
        esp_device = await esp_repo.get_by_id(sensor.esp_id)
        esp_device_id = esp_device.device_id if esp_device else None
        
        # Get latest reading
        latest = await sensor_repo.get_latest_reading(sensor.esp_id, sensor.gpio)
        
        responses.append(SensorConfigResponse(
            id=sensor.id,
            esp_id=sensor.esp_id,
            esp_device_id=esp_device_id,
            gpio=sensor.gpio,
            sensor_type=sensor.sensor_type,
            name=sensor.name,
            enabled=sensor.enabled,
            interval_ms=sensor.interval_ms,
            processing_mode=sensor.processing_mode,
            calibration=sensor.calibration,
            threshold_min=sensor.threshold_min,
            threshold_max=sensor.threshold_max,
            warning_min=sensor.warning_min,
            warning_max=sensor.warning_max,
            metadata=sensor.metadata,
            latest_value=latest.processed_value if latest else None,
            latest_quality=latest.quality if latest else None,
            latest_timestamp=latest.timestamp if latest else None,
            created_at=sensor.created_at,
            updated_at=sensor.updated_at,
        ))
    
    return SensorConfigListResponse(
        success=True,
        data=responses,
        pagination=PaginationMeta.from_pagination(page, page_size, total_items),
    )


# =============================================================================
# Get Sensor
# =============================================================================


@router.get(
    "/{esp_id}/{gpio}",
    response_model=SensorConfigResponse,
    responses={
        200: {"description": "Sensor found"},
        404: {"description": "Sensor not found"},
    },
    summary="Get sensor configuration",
    description="Get configuration for a specific sensor.",
)
async def get_sensor(
    esp_id: str,
    gpio: int,
    db: DBSession,
    current_user: ActiveUser,
) -> SensorConfigResponse:
    """
    Get sensor configuration.
    
    Args:
        esp_id: ESP device ID
        gpio: GPIO pin number
        db: Database session
        current_user: Authenticated user
        
    Returns:
        Sensor configuration
    """
    esp_repo = ESPRepository(db)
    sensor_repo = SensorRepository(db)
    
    esp_device = await esp_repo.get_by_device_id(esp_id)
    if not esp_device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ESP device '{esp_id}' not found",
        )
    
    sensor = await sensor_repo.get_by_esp_and_gpio(esp_device.id, gpio)
    if not sensor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sensor on GPIO {gpio} not found for ESP '{esp_id}'",
        )
    
    latest = await sensor_repo.get_latest_reading(esp_device.id, gpio)
    
    return SensorConfigResponse(
        id=sensor.id,
        esp_id=sensor.esp_id,
        esp_device_id=esp_id,
        gpio=sensor.gpio,
        sensor_type=sensor.sensor_type,
        name=sensor.name,
        enabled=sensor.enabled,
        interval_ms=sensor.interval_ms,
        processing_mode=sensor.processing_mode,
        calibration=sensor.calibration,
        threshold_min=sensor.threshold_min,
        threshold_max=sensor.threshold_max,
        warning_min=sensor.warning_min,
        warning_max=sensor.warning_max,
        metadata=sensor.metadata,
        latest_value=latest.processed_value if latest else None,
        latest_quality=latest.quality if latest else None,
        latest_timestamp=latest.timestamp if latest else None,
        created_at=sensor.created_at,
        updated_at=sensor.updated_at,
    )


# =============================================================================
# Create/Update Sensor
# =============================================================================


@router.post(
    "/{esp_id}/{gpio}",
    response_model=SensorConfigResponse,
    responses={
        200: {"description": "Sensor created/updated"},
        404: {"description": "ESP device not found"},
    },
    summary="Create or update sensor",
    description="Create new sensor config or update existing.",
)
async def create_or_update_sensor(
    esp_id: str,
    gpio: int,
    request: SensorConfigCreate,
    db: DBSession,
    current_user: OperatorUser,
) -> SensorConfigResponse:
    """
    Create or update sensor configuration.
    
    Args:
        esp_id: ESP device ID
        gpio: GPIO pin number
        request: Sensor configuration
        db: Database session
        current_user: Operator or admin user
        
    Returns:
        Created/updated sensor config
    """
    esp_repo = ESPRepository(db)
    sensor_repo = SensorRepository(db)
    
    esp_device = await esp_repo.get_by_device_id(esp_id)
    if not esp_device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ESP device '{esp_id}' not found",
        )
    
    # Check if sensor exists
    existing = await sensor_repo.get_by_esp_and_gpio(esp_device.id, gpio)
    
    if existing:
        # Update existing
        update_data = request.model_dump(exclude={"esp_id"}, exclude_unset=True)
        for field, value in update_data.items():
            setattr(existing, field, value)
        sensor = existing
        logger.info(f"Sensor updated: {esp_id} GPIO {gpio} by {current_user.username}")
    else:
        # Create new
        sensor = SensorConfig(
            esp_id=esp_device.id,
            gpio=gpio,
            sensor_type=request.sensor_type,
            name=request.name,
            enabled=request.enabled,
            interval_ms=request.interval_ms,
            processing_mode=request.processing_mode,
            calibration=request.calibration or {},
            threshold_min=request.threshold_min,
            threshold_max=request.threshold_max,
            warning_min=request.warning_min,
            warning_max=request.warning_max,
            metadata=request.metadata or {},
        )
        await sensor_repo.create(sensor)
        logger.info(f"Sensor created: {esp_id} GPIO {gpio} by {current_user.username}")
    
    await db.commit()
    
    return SensorConfigResponse(
        id=sensor.id,
        esp_id=sensor.esp_id,
        esp_device_id=esp_id,
        gpio=sensor.gpio,
        sensor_type=sensor.sensor_type,
        name=sensor.name,
        enabled=sensor.enabled,
        interval_ms=sensor.interval_ms,
        processing_mode=sensor.processing_mode,
        calibration=sensor.calibration,
        threshold_min=sensor.threshold_min,
        threshold_max=sensor.threshold_max,
        warning_min=sensor.warning_min,
        warning_max=sensor.warning_max,
        metadata=sensor.metadata,
        latest_value=None,
        latest_quality=None,
        latest_timestamp=None,
        created_at=sensor.created_at,
        updated_at=sensor.updated_at,
    )


# =============================================================================
# Delete Sensor
# =============================================================================


@router.delete(
    "/{esp_id}/{gpio}",
    response_model=SensorConfigResponse,
    responses={
        200: {"description": "Sensor deleted"},
        404: {"description": "Sensor not found"},
    },
    summary="Delete sensor configuration",
    description="Remove sensor configuration.",
)
async def delete_sensor(
    esp_id: str,
    gpio: int,
    db: DBSession,
    current_user: OperatorUser,
) -> SensorConfigResponse:
    """
    Delete sensor configuration.
    
    Args:
        esp_id: ESP device ID
        gpio: GPIO pin number
        db: Database session
        current_user: Operator or admin user
        
    Returns:
        Deleted sensor config
    """
    esp_repo = ESPRepository(db)
    sensor_repo = SensorRepository(db)
    
    esp_device = await esp_repo.get_by_device_id(esp_id)
    if not esp_device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ESP device '{esp_id}' not found",
        )
    
    sensor = await sensor_repo.get_by_esp_and_gpio(esp_device.id, gpio)
    if not sensor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sensor on GPIO {gpio} not found for ESP '{esp_id}'",
        )
    
    # Delete sensor
    await sensor_repo.delete(sensor.id)
    await db.commit()
    
    logger.info(f"Sensor deleted: {esp_id} GPIO {gpio} by {current_user.username}")
    
    return SensorConfigResponse(
        id=sensor.id,
        esp_id=sensor.esp_id,
        esp_device_id=esp_id,
        gpio=sensor.gpio,
        sensor_type=sensor.sensor_type,
        name=sensor.name,
        enabled=sensor.enabled,
        interval_ms=sensor.interval_ms,
        processing_mode=sensor.processing_mode,
        calibration=sensor.calibration,
        threshold_min=sensor.threshold_min,
        threshold_max=sensor.threshold_max,
        warning_min=sensor.warning_min,
        warning_max=sensor.warning_max,
        metadata=sensor.metadata,
        latest_value=None,
        latest_quality=None,
        latest_timestamp=None,
        created_at=sensor.created_at,
        updated_at=sensor.updated_at,
    )


# =============================================================================
# Query Sensor Data
# =============================================================================


@router.get(
    "/data",
    response_model=SensorDataResponse,
    summary="Query sensor data",
    description="Query historical sensor data with filters.",
)
async def query_sensor_data(
    db: DBSession,
    current_user: ActiveUser,
    esp_id: Annotated[Optional[str], Query(description="Filter by ESP device ID")] = None,
    gpio: Annotated[Optional[int], Query(ge=0, le=39, description="Filter by GPIO")] = None,
    sensor_type: Annotated[Optional[str], Query(description="Filter by sensor type")] = None,
    start_time: Annotated[Optional[datetime], Query(description="Start of time range")] = None,
    end_time: Annotated[Optional[datetime], Query(description="End of time range")] = None,
    quality: Annotated[Optional[str], Query(description="Filter by quality")] = None,
    limit: Annotated[int, Query(ge=1, le=1000, description="Max results")] = 100,
) -> SensorDataResponse:
    """
    Query sensor data.
    
    Args:
        db: Database session
        current_user: Authenticated user
        esp_id: Optional ESP filter
        gpio: Optional GPIO filter
        sensor_type: Optional type filter
        start_time: Start of time range
        end_time: End of time range
        quality: Filter by quality
        limit: Max results
        
    Returns:
        Sensor data readings
    """
    esp_repo = ESPRepository(db)
    sensor_repo = SensorRepository(db)
    
    # Default time range to last 24 hours
    if not start_time:
        start_time = datetime.utcnow() - timedelta(hours=24)
    if not end_time:
        end_time = datetime.utcnow()
    
    # Get ESP device ID if specified
    esp_db_id = None
    if esp_id:
        esp_device = await esp_repo.get_by_device_id(esp_id)
        if not esp_device:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"ESP device '{esp_id}' not found",
            )
        esp_db_id = esp_device.id
    
    # Query data
    readings = await sensor_repo.query_data(
        esp_id=esp_db_id,
        gpio=gpio,
        sensor_type=sensor_type,
        start_time=start_time,
        end_time=end_time,
        quality=quality,
        limit=limit,
    )
    
    # Convert to response format
    reading_responses = [
        SensorReading(
            timestamp=r.timestamp,
            raw_value=r.raw_value,
            processed_value=r.processed_value,
            unit=r.unit,
            quality=r.quality,
        )
        for r in readings
    ]
    
    return SensorDataResponse(
        success=True,
        esp_id=esp_id,
        gpio=gpio,
        sensor_type=sensor_type,
        readings=reading_responses,
        count=len(reading_responses),
        aggregation=None,
        time_range={"start": start_time, "end": end_time},
    )


# =============================================================================
# Sensor Statistics
# =============================================================================


@router.get(
    "/{esp_id}/{gpio}/stats",
    response_model=SensorStatsResponse,
    summary="Get sensor statistics",
    description="Get statistical summary for sensor data.",
)
async def get_sensor_stats(
    esp_id: str,
    gpio: int,
    db: DBSession,
    current_user: ActiveUser,
    start_time: Annotated[Optional[datetime], Query(description="Start of time range")] = None,
    end_time: Annotated[Optional[datetime], Query(description="End of time range")] = None,
) -> SensorStatsResponse:
    """
    Get sensor statistics.
    
    Args:
        esp_id: ESP device ID
        gpio: GPIO pin number
        db: Database session
        current_user: Authenticated user
        start_time: Start of time range
        end_time: End of time range
        
    Returns:
        Statistical summary
    """
    esp_repo = ESPRepository(db)
    sensor_repo = SensorRepository(db)
    
    esp_device = await esp_repo.get_by_device_id(esp_id)
    if not esp_device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ESP device '{esp_id}' not found",
        )
    
    sensor = await sensor_repo.get_by_esp_and_gpio(esp_device.id, gpio)
    if not sensor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sensor on GPIO {gpio} not found for ESP '{esp_id}'",
        )
    
    # Default time range
    if not start_time:
        start_time = datetime.utcnow() - timedelta(hours=24)
    if not end_time:
        end_time = datetime.utcnow()
    
    # Get statistics
    stats = await sensor_repo.get_stats(
        esp_id=esp_device.id,
        gpio=gpio,
        start_time=start_time,
        end_time=end_time,
    )
    
    return SensorStatsResponse(
        success=True,
        esp_id=esp_id,
        gpio=gpio,
        sensor_type=sensor.sensor_type,
        stats=SensorStats(
            min_value=stats.get("min_value"),
            max_value=stats.get("max_value"),
            avg_value=stats.get("avg_value"),
            std_dev=stats.get("std_dev"),
            reading_count=stats.get("reading_count", 0),
            quality_distribution=stats.get("quality_distribution", {}),
        ),
        time_range={"start": start_time, "end": end_time},
    )
