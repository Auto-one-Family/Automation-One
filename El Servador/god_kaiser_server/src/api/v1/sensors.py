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
- POST /esp/{esp_id}/onewire/scan - Scan OneWire bus for devices (DS18B20)
- GET /esp/{esp_id}/onewire - List configured OneWire sensors

Note: /process and /calibrate are in sensor_processing.py

References:
- .claude/PI_SERVER_REFACTORING.md (Lines 135-145)
- El Trabajante/docs/Mqtt_Protocoll.md (Sensor topics)
- ds18b20_onewire_integration Plan (Phase 5)
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ...core.logging_config import get_logger
from ...db.models.sensor import SensorConfig, SensorData
from ...db.models.enums import DataSource
from ...db.repositories import ActuatorRepository, ESPRepository, SensorRepository
from ...schemas import (
    OneWireDevice,
    OneWireScanResponse,
    SensorConfigCreate,
    SensorConfigListResponse,
    SensorConfigResponse,
    SensorConfigUpdate,
    SensorDataQuery,
    SensorDataResponse,
    SensorReading,
    SensorStats,
    SensorStatsResponse,
    TriggerMeasurementResponse,
)
from ...schemas.common import PaginationMeta
from ...services.config_builder import ConfigPayloadBuilder
from ...services.esp_service import ESPService
from ..deps import ActiveUser, DBSession, OperatorUser, get_config_builder, get_esp_service, get_mqtt_publisher, get_sensor_service, get_sensor_scheduler_service
from ...services.sensor_scheduler_service import SensorSchedulerService
from ...services.sensor_service import SensorService
from ...services.gpio_validation_service import GpioValidationService

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
    - interface_type, i2c_address, onewire_address, provides_values (multi-value support)
    """
    # Extract thresholds from dict
    thresholds = sensor.thresholds or {}
    threshold_min = thresholds.get("min")
    threshold_max = thresholds.get("max")
    warning_min = thresholds.get("warning_min")
    warning_max = thresholds.get("warning_max")
    
    # Convert pi_enhanced boolean to processing_mode string
    processing_mode = "pi_enhanced" if sensor.pi_enhanced else "raw"

    # Get interface_type from model or infer from sensor_type (fallback for legacy data)
    interface_type = sensor.interface_type if sensor.interface_type else _infer_interface_type(sensor.sensor_type)
    
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
        # =========================================================================
        # MULTI-VALUE SENSOR SUPPORT
        # =========================================================================
        interface_type=interface_type,
        i2c_address=sensor.i2c_address,
        onewire_address=sensor.onewire_address,
        provides_values=sensor.provides_values,
        # =========================================================================
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

    # Infer interface_type if not provided
    interface_type = request.interface_type or _infer_interface_type(request.sensor_type)

    return {
        "sensor_type": request.sensor_type,
        "sensor_name": request.name or "",  # Schema: name -> Model: sensor_name
        "enabled": request.enabled,
        "sample_interval_ms": request.interval_ms,  # Schema: interval_ms -> Model: sample_interval_ms
        "pi_enhanced": pi_enhanced,  # Schema: processing_mode -> Model: pi_enhanced
        "calibration_data": request.calibration,  # Schema: calibration -> Model: calibration_data
        "thresholds": thresholds if thresholds else None,
        "sensor_metadata": request.metadata or {},  # Schema: metadata -> Model: sensor_metadata
        # =========================================================================
        # MULTI-VALUE SENSOR SUPPORT (I2C/OneWire)
        # =========================================================================
        "interface_type": interface_type,
        "i2c_address": request.i2c_address,
        "onewire_address": request.onewire_address,
        "provides_values": request.provides_values,
        # =========================================================================
        # OPERATING MODE FIELDS (Phase 2F)
        # =========================================================================
        "operating_mode": request.operating_mode,
        "timeout_seconds": request.timeout_seconds,
        "timeout_warning_enabled": request.timeout_warning_enabled,
        "schedule_config": request.schedule_config,
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
    actuator_repo = ActuatorRepository(db)

    esp_device = await esp_repo.get_by_device_id(esp_id)
    if not esp_device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ESP device '{esp_id}' not found",
        )

    # =========================================================================
    # MULTI-VALUE SENSOR SUPPORT
    # =========================================================================
    # Check if sensor already exists (include sensor_type!)
    existing = await sensor_repo.get_by_esp_gpio_and_type(
        esp_device.id,
        gpio,
        request.sensor_type  # ← CRITICAL: Include sensor_type!
    )

    # Infer interface_type if not provided
    interface_type = request.interface_type or _infer_interface_type(request.sensor_type)

    # Track validated addresses (may be auto-generated for OneWire)
    validated_onewire_address: Optional[str] = None

    # Interface-based validation
    if interface_type == "I2C":
        # I2C: Check i2c_address conflict, NOT GPIO conflict
        await _validate_i2c_config(
            sensor_repo,
            esp_device.id,
            request.i2c_address,
            exclude_sensor_id=existing.id if existing else None
        )
        # I2C sensors can share GPIO (bus pins 21/22)
        # No GPIO validation needed
    elif interface_type == "ONEWIRE":
        # OneWire: Validate address (or generate placeholder if not provided)
        validated_onewire_address = await _validate_onewire_config(
            sensor_repo,
            esp_device.id,
            request.onewire_address,
            exclude_sensor_id=existing.id if existing else None
        )
        # OneWire sensors can share GPIO (bus pin)
        # No GPIO validation needed
    else:  # ANALOG or DIGITAL
        # Analog/Digital: Check GPIO conflict (exclusive)
        gpio_validator = GpioValidationService(
            session=db,
            sensor_repo=sensor_repo,
            actuator_repo=actuator_repo,
            esp_repo=esp_repo
        )

        validation_result = await gpio_validator.validate_gpio_available(
            esp_db_id=esp_device.id,
            gpio=gpio,
            exclude_sensor_id=existing.id if existing else None,
            purpose="sensor",
            interface_type=interface_type
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

    # Convert schema fields to model fields
    model_fields = _schema_to_model_fields(request)

    # Override onewire_address if it was auto-generated during validation
    if interface_type == "ONEWIRE" and validated_onewire_address:
        model_fields["onewire_address"] = validated_onewire_address
    
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
        # =========================================================================
        # OPERATING MODE FIELDS (Phase 2F)
        # Note: Always update - None is valid (means "use type default")
        # =========================================================================
        existing.operating_mode = model_fields["operating_mode"]
        existing.timeout_seconds = model_fields["timeout_seconds"]
        existing.timeout_warning_enabled = model_fields["timeout_warning_enabled"]
        existing.schedule_config = model_fields["schedule_config"]
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

    # =========================================================================
    # SCHEDULE JOB UPDATE (Phase 2H)
    # Update APScheduler job based on operating_mode and schedule_config
    # =========================================================================
    try:
        scheduler_service: SensorSchedulerService = get_sensor_scheduler_service(db)

        if sensor.operating_mode == "scheduled" and sensor.schedule_config:
            # Create or update scheduled job
            job_success = await scheduler_service.create_or_update_job(
                esp_id=esp_id,
                gpio=gpio,
                schedule_config=sensor.schedule_config,
            )
            if job_success:
                logger.info(f"Scheduled job created/updated for {esp_id}/GPIO {gpio}")
            else:
                logger.warning(f"Failed to create scheduled job for {esp_id}/GPIO {gpio}")
        else:
            # Remove job if mode is not scheduled (or schedule_config is None)
            await scheduler_service.remove_job(esp_id, gpio)
    except Exception as e:
        # Non-fatal: DB save was successful, job can be recovered on server restart
        logger.warning(f"Schedule job update failed for {esp_id}/GPIO {gpio}: {e}")

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

    # =========================================================================
    # SCHEDULE JOB REMOVAL (Phase 2H)
    # Remove APScheduler job when sensor is deleted
    # =========================================================================
    try:
        scheduler_service: SensorSchedulerService = get_sensor_scheduler_service(db)
        await scheduler_service.remove_job(esp_id, gpio)
    except Exception as e:
        # Non-fatal: Job may not exist, or scheduler may not be initialized
        logger.debug(f"Schedule job removal for deleted sensor: {e}")

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


# =============================================================================
# On-Demand Measurement (Phase 2D)
# =============================================================================


@router.post(
    "/{esp_id}/{gpio}/measure",
    response_model=TriggerMeasurementResponse,
    summary="Trigger manual measurement",
    description="Triggers a manual measurement for an on-demand sensor.",
    responses={
        200: {"description": "Measurement command sent successfully"},
        404: {"description": "ESP or sensor not found"},
        503: {"description": "ESP offline or MQTT failure"},
    },
)
async def trigger_measurement(
    esp_id: str,
    gpio: int,
    db: DBSession,
    current_user: OperatorUser,
    sensor_service: Annotated[SensorService, Depends(get_sensor_service)],
) -> TriggerMeasurementResponse:
    """
    Trigger a manual measurement for a sensor.

    Used primarily for sensors with operating_mode='on_demand'.
    Can also be used to force a measurement on any sensor.

    Requires Operator role or higher.

    Args:
        esp_id: ESP device ID
        gpio: Sensor GPIO pin

    Returns:
        TriggerMeasurementResponse with request tracking info
    """
    try:
        result = await sensor_service.trigger_measurement(
            esp_id=esp_id,
            gpio=gpio,
        )
        return TriggerMeasurementResponse(**result)

    except ValueError as e:
        # ESP or sensor not found, or sensor disabled
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    except RuntimeError as e:
        # ESP offline or MQTT failure
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))


# =============================================================================
# OneWire Scan (DS18B20 Support)
# =============================================================================


@router.post(
    "/esp/{esp_id}/onewire/scan",
    response_model=OneWireScanResponse,
    summary="Scan OneWire bus for devices",
    description="""
    Triggers OneWire bus scan on ESP32 device.
    
    **Flow:**
    1. Server sends MQTT command to ESP
    2. ESP scans OneWire bus (finds all connected DS18B20, etc.)
    3. ESP publishes scan results
    4. Server returns found devices
    
    **Timeout:** 10 seconds
    
    **Use-Case:** Discovery of DS18B20 temperature sensors before configuration.
    """,
    responses={
        200: {"description": "Scan completed successfully"},
        404: {"description": "ESP device not found"},
        503: {"description": "ESP device offline"},
        504: {"description": "ESP did not respond to scan command (timeout)"},
    },
)
async def scan_onewire_bus(
    esp_id: str,
    db: DBSession,
    current_user: OperatorUser,
    pin: Annotated[int, Query(ge=0, le=48, description="GPIO pin for OneWire bus")] = 4,
) -> OneWireScanResponse:
    """
    Scan OneWire bus for connected devices.
    
    Sends MQTT command to ESP32 and waits for scan result.
    Returns list of discovered devices with ROM codes and types.
    
    **Pattern:** MQTT Command-Response with async timeout
    **Referenz:** ESP32 main.cpp:692-790 (onewire/scan command)
    
    Args:
        esp_id: ESP device ID (e.g., "ESP_12AB34CD")
        pin: GPIO pin for OneWire bus (default: 4)
    
    Returns:
        OneWireScanResponse with list of found devices
    """
    import asyncio
    import time
    
    from ...mqtt.publisher import Publisher
    from ...mqtt.client import MQTTClient
    from ...schemas.sensor import OneWireDevice, OneWireScanResponse
    
    start_time = time.time()
    
    logger.info(f"OneWire scan requested: esp_id={esp_id}, pin={pin}")
    
    # Step 1: Lookup ESP device
    esp_repo = ESPRepository(db)
    esp_device = await esp_repo.get_by_device_id(esp_id)
    
    if not esp_device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ESP device not found: {esp_id}"
        )
    
    # =========================================================================
    # MOCK-ESP DETECTION: Return fake devices without MQTT
    # =========================================================================
    # Mock-ESPs (device_id starts with "MOCK_") have no real hardware,
    # so we return fake DS18B20 devices for testing the Frontend workflow.
    # =========================================================================
    if esp_id.startswith("MOCK_"):
        scan_duration_ms = int((time.time() - start_time) * 1000)
        
        # =====================================================================
        # OneWire Multi-Device Support: Query existing sensors for enrichment
        # =====================================================================
        sensor_repo = SensorRepository(db)
        existing_sensors = await sensor_repo.get_all_by_esp_and_gpio(esp_device.id, pin)
        
        # Filter to only OneWire sensors (ds18b20) and build ROM -> name mapping
        existing_rom_map: dict[str, str] = {}
        for sensor in existing_sensors:
            if sensor.interface_type == "ONEWIRE" and sensor.onewire_address:
                existing_rom_map[sensor.onewire_address] = sensor.sensor_name or "Unbenannt"
        
        # Generate fake OneWire devices for testing
        fake_rom_codes = [
            "28FF641E8D3C0C79",
            "28FF123456789ABC",
            "28FF987654321DEF",  # Third device for testing multi-add
        ]
        
        fake_devices = []
        new_count = 0
        for rom_code in fake_rom_codes:
            already_configured = rom_code in existing_rom_map
            if not already_configured:
                new_count += 1
            
            fake_devices.append(
                OneWireDevice(
                    rom_code=rom_code,
                    device_type="ds18b20",
                    pin=pin,
                    already_configured=already_configured,
                    sensor_name=existing_rom_map.get(rom_code)
                )
            )
        
        logger.info(
            f"Mock OneWire scan: {esp_id}, GPIO {pin} - "
            f"returning {len(fake_devices)} fake devices ({new_count} new)"
        )
        
        return OneWireScanResponse(
            success=True,
            message=f"Mock scan: Found {len(fake_devices)} DS18B20 devices ({new_count} new)",
            devices=fake_devices,
            found_count=len(fake_devices),
            new_count=new_count,
            pin=pin,
            esp_id=esp_id,
            scan_duration_ms=scan_duration_ms
        )
    # =========================================================================
    
    if esp_device.status != "online":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"ESP device is {esp_device.status}, must be online for OneWire scan"
        )
    
    # Step 2: Prepare MQTT command
    publisher = Publisher()
    
    # Command topic: kaiser/god/esp/{esp_id}/system/command
    # Payload: {"command": "onewire/scan", "pin": 4}
    command_payload = {
        "command": "onewire/scan",
        "pin": pin
    }
    
    # Response topic: kaiser/god/esp/{esp_id}/onewire/scan_result
    response_topic = f"kaiser/god/esp/{esp_id}/onewire/scan_result"
    
    # Step 3: Setup response listener with asyncio.Future
    # IMPORTANT: Capture event loop in async context BEFORE callback registration
    # asyncio.get_event_loop() is deprecated; use get_running_loop() in async context
    loop = asyncio.get_running_loop()
    response_future: asyncio.Future = loop.create_future()
    
    def on_scan_result(client, userdata, message):
        """Callback for scan result message (runs in paho-mqtt thread)."""
        import json
        try:
            payload = json.loads(message.payload.decode('utf-8'))
            if not response_future.done():
                # Thread-safe: Use captured loop reference
                loop.call_soon_threadsafe(
                    response_future.set_result, payload
                )
        except Exception as e:
            logger.error(f"Failed to parse OneWire scan result: {e}")
            if not response_future.done():
                loop.call_soon_threadsafe(
                    response_future.set_exception, e
                )
    
    # Get MQTT client and register callback
    mqtt_client = MQTTClient.get_instance()
    
    # Check if MQTT client is connected
    if not mqtt_client.is_connected() or mqtt_client.client is None:
        logger.error(f"OneWire scan failed: MQTT client not connected")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="MQTT broker not connected. Cannot send scan command to ESP."
        )
    
    # Subscribe to response topic
    mqtt_client.client.subscribe(response_topic, qos=1)
    mqtt_client.client.message_callback_add(response_topic, on_scan_result)
    
    try:
        # Step 4: Publish command
        success = publisher.publish_system_command(
            esp_id=esp_id,
            command="onewire/scan",
            params={"pin": pin},
            retry=True
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Failed to send OneWire scan command to ESP. Check MQTT connection."
            )
        
        logger.debug(f"OneWire scan command sent to {esp_id}, waiting for response...")
        
        # Step 5: Wait for response with timeout (10 seconds)
        try:
            result = await asyncio.wait_for(response_future, timeout=10.0)
        except asyncio.TimeoutError:
            logger.error(f"OneWire scan timeout: ESP {esp_id} did not respond within 10 seconds")
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail=f"ESP {esp_id} did not respond to OneWire scan command within 10 seconds. "
                       f"Ensure ESP is online and OneWire bus is configured on GPIO {pin}."
            )
        
        # Step 6: Parse response and build device list with enrichment
        # =====================================================================
        # OneWire Multi-Device Support: Query existing sensors for enrichment
        # =====================================================================
        sensor_repo = SensorRepository(db)
        existing_sensors = await sensor_repo.get_all_by_esp_and_gpio(esp_device.id, pin)
        
        # Filter to only OneWire sensors and build ROM -> name mapping
        existing_rom_map: dict[str, str] = {}
        for sensor in existing_sensors:
            if sensor.interface_type == "ONEWIRE" and sensor.onewire_address:
                existing_rom_map[sensor.onewire_address] = sensor.sensor_name or "Unbenannt"
        
        logger.debug(
            f"OneWire enrichment: Found {len(existing_rom_map)} already configured "
            f"sensors on ESP {esp_id}, GPIO {pin}"
        )
        
        # Parse and enrich scan results
        devices = []
        new_count = 0
        for device_data in result.get("devices", []):
            try:
                rom_code = device_data.get("rom_code", "")
                already_configured = rom_code in existing_rom_map
                
                if not already_configured:
                    new_count += 1
                
                device = OneWireDevice(
                    rom_code=rom_code,
                    device_type=device_data.get("device_type", "unknown"),
                    pin=device_data.get("pin", pin),
                    already_configured=already_configured,
                    sensor_name=existing_rom_map.get(rom_code)
                )
                devices.append(device)
            except Exception as e:
                logger.warning(f"Failed to parse OneWire device: {e}")
        
        found_count = len(devices)
        scan_duration_ms = int((time.time() - start_time) * 1000)
        
        logger.info(
            f"OneWire scan complete: {found_count} device(s) found on ESP {esp_id}, "
            f"GPIO {pin} ({new_count} new) in {scan_duration_ms}ms"
        )
        
        return OneWireScanResponse(
            success=True,
            message=f"Found {found_count} OneWire device(s) on GPIO {pin} ({new_count} new)",
            devices=devices,
            found_count=found_count,
            new_count=new_count,
            pin=pin,
            esp_id=esp_id,
            scan_duration_ms=scan_duration_ms
        )
        
    finally:
        # Step 7: Cleanup - unregister callback and unsubscribe
        try:
            if mqtt_client.client:
                mqtt_client.client.message_callback_remove(response_topic)
                mqtt_client.client.unsubscribe(response_topic)
        except Exception as e:
            logger.warning(f"Failed to cleanup MQTT subscription: {e}")


@router.get(
    "/esp/{esp_id}/onewire",
    response_model=SensorConfigListResponse,
    summary="List OneWire sensors on ESP",
    description="Get all configured OneWire sensors for an ESP device.",
)
async def list_onewire_sensors(
    esp_id: str,
    db: DBSession,
    current_user: ActiveUser,
    pin: Annotated[Optional[int], Query(ge=0, le=48, description="Filter by GPIO pin")] = None,
) -> SensorConfigListResponse:
    """
    List all OneWire sensors configured on an ESP device.
    
    Optionally filter by GPIO pin to see all sensors on a specific OneWire bus.
    
    Args:
        esp_id: ESP device ID
        pin: Optional GPIO pin filter
    
    Returns:
        List of configured OneWire sensors
    """
    esp_repo = ESPRepository(db)
    sensor_repo = SensorRepository(db)
    
    esp_device = await esp_repo.get_by_device_id(esp_id)
    if not esp_device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ESP device '{esp_id}' not found",
        )
    
    # Get all OneWire sensors for this ESP
    onewire_sensors = await sensor_repo.get_all_by_interface(esp_device.id, "ONEWIRE")
    
    # Filter by pin if specified
    if pin is not None:
        onewire_sensors = [s for s in onewire_sensors if s.gpio == pin]
    
    # Convert to response format
    responses = []
    for sensor in onewire_sensors:
        latest = await sensor_repo.get_latest_reading(sensor.esp_id, sensor.gpio)
        response = _model_to_response(sensor, esp_id)
        response.latest_value = latest.processed_value if latest else None
        response.latest_quality = latest.quality if latest else None
        response.latest_timestamp = latest.timestamp if latest else None
        responses.append(response)
    
    return SensorConfigListResponse(
        success=True,
        data=responses,
        pagination=PaginationMeta.from_pagination(1, len(responses), len(responses)),
    )


# =============================================================================
# Helper Functions for Multi-Value Sensor Support
# =============================================================================


def _infer_interface_type(sensor_type: str) -> str:
    """
    Infer interface_type from sensor_type naming convention.

    Rules:
    - sht31*, bmp280*, bme280*, bh1750*, veml7700* → I2C
    - ds18b20* → ONEWIRE
    - Everything else → ANALOG (default)

    Args:
        sensor_type: Sensor type string (e.g., 'sht31_temp')

    Returns:
        Interface type: 'I2C', 'ONEWIRE', 'ANALOG', or 'DIGITAL'
    """
    sensor_lower = sensor_type.lower()

    if any(s in sensor_lower for s in ["sht31", "bmp280", "bme280", "bh1750", "veml7700"]):
        return "I2C"
    elif "ds18b20" in sensor_lower:
        return "ONEWIRE"
    else:
        return "ANALOG"


async def _validate_i2c_config(
    sensor_repo: SensorRepository,
    esp_id: uuid.UUID,
    i2c_address: Optional[int],
    exclude_sensor_id: Optional[uuid.UUID] = None
):
    """
    Validate I2C configuration.

    Rules:
    - i2c_address is required for I2C sensors
    - i2c_address must be in valid 7-bit range (0x00-0x7F)
    - Reserved addresses are rejected (0x00-0x07, 0x78-0x7F)
    - Valid range: 0x08-0x77 (112 usable addresses)
    - i2c_address must be unique per ESP (can't have 2 devices on same address)
    - GPIO 21/22 are shared (bus pins), no conflict

    Args:
        sensor_repo: Sensor repository instance
        esp_id: ESP device UUID
        i2c_address: I2C address (0-127)
        exclude_sensor_id: Sensor ID to exclude from conflict check (for updates)

    Raises:
        HTTPException: If validation fails
    """
    logger = get_logger(__name__)
    
    # Check 1: Address is required
    if not i2c_address:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="i2c_address is required for I2C sensors"
        )

    # Check 1.5: Negative addresses (Ergänzung 1)
    if i2c_address < 0:
        rejection_reason = f"i2c_address must be positive, got {i2c_address}"
        logger.info(
            f"Rejected I2C config: ESP {esp_id}, address 0x{i2c_address:02X} "
            f"(reason: {rejection_reason})"
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=rejection_reason
        )

    # Check 2: Validate 7-bit range (0x00-0x7F)
    if i2c_address > 0x7F:
        rejection_reason = (
            f"I2C address 0x{i2c_address:02X} ({i2c_address}) exceeds 7-bit range. "
            f"Valid range: 0x08-0x77 (8-119 decimal)"
        )
        logger.info(
            f"Rejected I2C config: ESP {esp_id}, address 0x{i2c_address:02X} "
            f"(reason: {rejection_reason})"
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=rejection_reason
        )

    # Check 3: Reserved address ranges
    # 0x00-0x07: General call, START byte, reserved
    if 0x00 <= i2c_address <= 0x07:
        rejection_reason = (
            f"I2C address 0x{i2c_address:02X} is reserved (general call/START byte range). "
            f"Valid range: 0x08-0x77 (8-119 decimal)"
        )
        logger.info(
            f"Rejected I2C config: ESP {esp_id}, address 0x{i2c_address:02X} "
            f"(reason: {rejection_reason})"
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=rejection_reason
        )

    # 0x78-0x7F: 10-bit addressing reserved
    if 0x78 <= i2c_address <= 0x7F:
        rejection_reason = (
            f"I2C address 0x{i2c_address:02X} is reserved (10-bit addressing range). "
            f"Valid range: 0x08-0x77 (8-119 decimal)"
        )
        logger.info(
            f"Rejected I2C config: ESP {esp_id}, address 0x{i2c_address:02X} "
            f"(reason: {rejection_reason})"
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=rejection_reason
        )

    # Check 4: Address already used (conflict check)
    existing_with_address = await sensor_repo.get_by_i2c_address(
        esp_id, i2c_address
    )

    if existing_with_address and existing_with_address.id != exclude_sensor_id:
        rejection_reason = f"Address 0x{i2c_address:02X} already in use"
        logger.info(
            f"Rejected I2C config: ESP {esp_id}, address 0x{i2c_address:02X} "
            f"(reason: {rejection_reason})"
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"I2C_ADDRESS_CONFLICT: {rejection_reason}"
        )


async def _validate_onewire_config(
    sensor_repo: SensorRepository,
    esp_id: uuid.UUID,
    onewire_address: Optional[str],
    exclude_sensor_id: Optional[uuid.UUID] = None
) -> Optional[str]:
    """
    Validate OneWire configuration.

    Rules:
    - onewire_address is OPTIONAL for OneWire sensors (Auto-Discovery use case)
    - If not provided, a placeholder address is generated
    - If provided, it must be unique per ESP
    - GPIO (bus pin) is shared, no conflict

    Rationale:
    - User typically doesn't know OneWire ROM addresses when adding sensors
    - ESP32 can auto-discover devices on the bus
    - For single-device buses, the address doesn't matter
    - The actual address can be updated later via ESP heartbeat/discovery

    Args:
        sensor_repo: Sensor repository instance
        esp_id: ESP device UUID
        onewire_address: OneWire device address (optional)
        exclude_sensor_id: Sensor ID to exclude from conflict check (for updates)

    Returns:
        The validated or generated onewire_address

    Raises:
        HTTPException: If address conflict detected
    """
    # If no address provided, generate a placeholder
    # Format: AUTO_<random_hex> to distinguish from real ROM addresses
    if not onewire_address:
        import secrets
        onewire_address = f"AUTO_{secrets.token_hex(8).upper()}"
        logger.info(f"Generated placeholder OneWire address: {onewire_address}")
        return onewire_address

    # Check if address already used (only if a real address was provided)
    existing_with_address = await sensor_repo.get_by_onewire_address(
        esp_id, onewire_address
    )

    if existing_with_address and existing_with_address.id != exclude_sensor_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"ONEWIRE_ADDRESS_CONFLICT: Address {onewire_address} already in use"
        )

    return onewire_address
