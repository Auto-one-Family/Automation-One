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

from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ...core.logging_config import get_logger
from ...db.models.sensor import SensorConfig, SensorData
from ...db.models.enums import DataSource
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
from ...services.config_builder import ConfigPayloadBuilder
from ...services.esp_service import ESPService
from ..deps import ActiveUser, DBSession, OperatorUser, get_config_builder, get_esp_service, get_mqtt_publisher

logger = get_logger(__name__)

router = APIRouter(prefix="/v1/sensors", tags=["sensors"])


# =============================================================================
# Helper Functions: Model <-> Schema Conversion
# =============================================================================


def _model_to_response(sensor: SensorConfig, esp_device_id: Optional[str] = None) -> SensorConfigResponse:
    """
    Convert SensorConfig model to SensorConfigResponse schema.
    
    Handles field name mapping between model and schema:
    - sensor_name (model) -> name (schema)
    - sample_interval_ms (model) -> interval_ms (schema)
    - pi_enhanced (model) -> processing_mode (schema)
    - calibration_data (model) -> calibration (schema)
    - thresholds dict (model) -> threshold_min/max/warning_min/max (schema)
    - sensor_metadata (model) -> metadata (schema)
    """
    # Extract thresholds from dict
    thresholds = sensor.thresholds or {}
    threshold_min = thresholds.get("min")
    threshold_max = thresholds.get("max")
    warning_min = thresholds.get("warning_min")
    warning_max = thresholds.get("warning_max")
    
    # Convert pi_enhanced boolean to processing_mode string
    processing_mode = "pi_enhanced" if sensor.pi_enhanced else "raw"
    
    return SensorConfigResponse(
        id=sensor.id,
        esp_id=sensor.esp_id,
        esp_device_id=esp_device_id,
        gpio=sensor.gpio,
        sensor_type=sensor.sensor_type,
        name=sensor.sensor_name,  # Model: sensor_name -> Schema: name
        enabled=sensor.enabled,
        interval_ms=sensor.sample_interval_ms,  # Model: sample_interval_ms -> Schema: interval_ms
        processing_mode=processing_mode,  # Model: pi_enhanced -> Schema: processing_mode
        calibration=sensor.calibration_data,  # Model: calibration_data -> Schema: calibration
        threshold_min=threshold_min,
        threshold_max=threshold_max,
        warning_min=warning_min,
        warning_max=warning_max,
        metadata=sensor.sensor_metadata,  # Model: sensor_metadata -> Schema: metadata
        latest_value=None,  # Will be set by caller if available
        latest_quality=None,
        latest_timestamp=None,
        created_at=sensor.created_at,
        updated_at=sensor.updated_at,
    )


def _schema_to_model_fields(request: SensorConfigCreate) -> dict:
    """
    Convert SensorConfigCreate schema fields to SensorConfig model fields.
    
    Returns dict with model field names for direct model creation.
    """
    # Convert processing_mode string to pi_enhanced boolean
    pi_enhanced = request.processing_mode == "pi_enhanced"
    
    # Build thresholds dict from individual fields
    thresholds = {}
    if request.threshold_min is not None:
        thresholds["min"] = request.threshold_min
    if request.threshold_max is not None:
        thresholds["max"] = request.threshold_max
    if request.warning_min is not None:
        thresholds["warning_min"] = request.warning_min
    if request.warning_max is not None:
        thresholds["warning_max"] = request.warning_max
    
    return {
        "sensor_type": request.sensor_type,
        "sensor_name": request.name or "",  # Schema: name -> Model: sensor_name
        "enabled": request.enabled,
        "sample_interval_ms": request.interval_ms,  # Schema: interval_ms -> Model: sample_interval_ms
        "pi_enhanced": pi_enhanced,  # Schema: processing_mode -> Model: pi_enhanced
        "calibration_data": request.calibration,  # Schema: calibration -> Model: calibration_data
        "thresholds": thresholds if thresholds else None,
        "sensor_metadata": request.metadata or {},  # Schema: metadata -> Model: sensor_metadata
    }


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
    offset = (page - 1) * page_size
    rows, total_items = await sensor_repo.query_paginated(
        esp_device_id=esp_id,
        sensor_type=sensor_type,
        enabled=enabled,
        offset=offset,
        limit=page_size,
    )

    responses = []
    for sensor, esp_device_id in rows:
        latest = await sensor_repo.get_latest_reading(sensor.esp_id, sensor.gpio)

        response = _model_to_response(sensor, esp_device_id)
        response.latest_value = latest.processed_value if latest else None
        response.latest_quality = latest.quality if latest else None
        response.latest_timestamp = latest.timestamp if latest else None

        responses.append(response)
    
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
    
    # Convert model to response schema
    response = _model_to_response(sensor, esp_id)
    response.latest_value = latest.processed_value if latest else None
    response.latest_quality = latest.quality if latest else None
    response.latest_timestamp = latest.timestamp if latest else None
    
    return response


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
    
    # Convert schema fields to model fields
    model_fields = _schema_to_model_fields(request)
    
    if existing:
        # Update existing sensor
        existing.sensor_type = model_fields["sensor_type"]
        if request.name is not None:
            existing.sensor_name = model_fields["sensor_name"]
        existing.enabled = model_fields["enabled"]
        existing.sample_interval_ms = model_fields["sample_interval_ms"]
        existing.pi_enhanced = model_fields["pi_enhanced"]
        if request.calibration is not None:
            existing.calibration_data = model_fields["calibration_data"]
        if model_fields["thresholds"]:
            existing.thresholds = model_fields["thresholds"]
        if request.metadata is not None:
            existing.sensor_metadata = model_fields["sensor_metadata"]
        sensor = existing
        logger.info(f"Sensor updated: {esp_id} GPIO {gpio} by {current_user.username}")
    else:
        # Create new sensor
        sensor = SensorConfig(
            esp_id=esp_device.id,
            gpio=gpio,
            **model_fields,
        )
        await sensor_repo.create(sensor)
        logger.info(f"Sensor created: {esp_id} GPIO {gpio} by {current_user.username}")
    
    await db.commit()
    await db.refresh(sensor)
    
    # Publish config to ESP32 via MQTT (using dependency-injected services)
    try:
        config_builder: ConfigPayloadBuilder = get_config_builder(db)
        combined_config = await config_builder.build_combined_config(esp_id, db)
        
        esp_service: ESPService = get_esp_service(db)
        config_sent = await esp_service.send_config(esp_id, combined_config)
        
        if config_sent:
            logger.info(f"Config published to ESP {esp_id} after sensor create/update")
        else:
            logger.warning(f"Config publish failed for ESP {esp_id} (DB save was successful)")
    except Exception as e:
        # Log error but don't fail the request (DB save was successful)
        logger.error(f"Failed to publish config to ESP {esp_id}: {e}", exc_info=True)
    
    # Convert model to response schema
    return _model_to_response(sensor, esp_id)


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
    
    # Publish updated config to ESP32 via MQTT (sensor removed from payload)
    try:
        config_builder: ConfigPayloadBuilder = get_config_builder(db)
        combined_config = await config_builder.build_combined_config(esp_id, db)
        
        esp_service: ESPService = get_esp_service(db)
        config_sent = await esp_service.send_config(esp_id, combined_config)
        
        if config_sent:
            logger.info(f"Config published to ESP {esp_id} after sensor delete")
        else:
            logger.warning(f"Config publish failed for ESP {esp_id} (DB delete was successful)")
    except Exception as e:
        # Log error but don't fail the request (DB delete was successful)
        logger.error(f"Failed to publish config to ESP {esp_id}: {e}", exc_info=True)
    
    # Convert model to response schema
    return _model_to_response(sensor, esp_id)


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
        start_time = datetime.now(timezone.utc) - timedelta(hours=24)
    if not end_time:
        end_time = datetime.now(timezone.utc)
    
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
# Query Sensor Data by Source
# =============================================================================


@router.get(
    "/data/by-source/{source}",
    response_model=SensorDataResponse,
    summary="Query sensor data by source",
    description="Query sensor data filtered by data source (production, mock, test, simulation).",
)
async def get_sensor_data_by_source(
    source: str,
    db: DBSession,
    current_user: ActiveUser,
    esp_id: Annotated[Optional[str], Query(description="Filter by ESP device ID")] = None,
    limit: Annotated[int, Query(ge=1, le=1000, description="Max results")] = 100,
) -> SensorDataResponse:
    """
    Query sensor data filtered by data source.

    Args:
        source: Data source (production, mock, test, simulation)
        db: Database session
        current_user: Authenticated user
        esp_id: Optional ESP filter
        limit: Max results

    Returns:
        Sensor data readings from specified source
    """
    # Validate source
    try:
        data_source = DataSource(source.lower())
    except ValueError:
        valid_sources = [e.value for e in DataSource]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid source '{source}'. Valid sources: {valid_sources}",
        )

    esp_repo = ESPRepository(db)
    sensor_repo = SensorRepository(db)

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

    # Query data by source
    readings = await sensor_repo.get_by_source(
        source=data_source,
        limit=limit,
        esp_id=esp_db_id,
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
        gpio=None,
        sensor_type=None,
        readings=reading_responses,
        count=len(reading_responses),
        aggregation=None,
        time_range=None,
    )


@router.get(
    "/data/stats/by-source",
    summary="Get sensor data count by source",
    description="Get count of sensor data entries grouped by data source.",
)
async def get_sensor_data_stats_by_source(
    db: DBSession,
    current_user: ActiveUser,
) -> dict:
    """
    Get sensor data count by data source.

    Returns count of sensor data entries for each source type.
    """
    sensor_repo = SensorRepository(db)
    counts = await sensor_repo.count_by_source()

    return {
        "success": True,
        "counts": counts,
        "total": sum(counts.values()),
    }


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
        start_time = datetime.now(timezone.utc) - timedelta(hours=24)
    if not end_time:
        end_time = datetime.now(timezone.utc)
    
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
