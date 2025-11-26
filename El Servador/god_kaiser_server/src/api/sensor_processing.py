"""
API Router: Real-Time Sensor Processing

HTTP endpoint for ESP32 raw sensor data processing.

Features:
- Sub-10ms response time for local networks
- API key authentication
- Rate limiting (100 req/min per key)
- Input validation (Pydantic)
- Comprehensive error handling
- Performance monitoring

Endpoint:
    POST /api/v1/sensors/process

Flow:
    ESP32 → HTTP POST → Sensor Library → Process → HTTP Response → ESP32
"""

import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse

from ..core.logging_config import get_logger
from ..sensors.library_loader import get_library_loader
from .dependencies import check_rate_limit, verify_api_key
from .schemas import ErrorResponse, SensorProcessRequest, SensorProcessResponse

logger = get_logger(__name__)

# Create router
router = APIRouter(
    prefix="/api/v1/sensors",
    tags=["sensors", "processing"],
)


@router.post(
    "/process",
    response_model=SensorProcessResponse,
    responses={
        200: {"description": "Processing successful"},
        400: {"model": ErrorResponse, "description": "Invalid request"},
        401: {"model": ErrorResponse, "description": "Authentication failed"},
        404: {"model": ErrorResponse, "description": "Sensor processor not found"},
        429: {"model": ErrorResponse, "description": "Rate limit exceeded"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
    summary="Process raw sensor data",
    description="""
    Process raw sensor data from ESP32 devices.
    
    **Real-time optimized**: <10ms response time on local network.
    
    **Authentication**: Requires X-API-Key header.
    
    **Rate limiting**: 100 requests per minute per API key.
    
    **Supported sensors**: ph, temperature, humidity, ec, moisture, pressure, co2, light, flow
    """,
)
async def process_sensor_data(
    request: SensorProcessRequest,
    api_key: Annotated[str, Depends(verify_api_key)],
    _rate_limit: Annotated[None, Depends(check_rate_limit)] = None,
) -> SensorProcessResponse:
    """
    Process raw sensor data in real-time.
    
    Args:
        request: Sensor processing request (validated)
        api_key: Verified API key from header
        _rate_limit: Rate limit check (dependency)
    
    Returns:
        Processed sensor data with value, unit, quality
        
    Raises:
        HTTPException: 400/404/500 on various errors
    """
    start_time = time.perf_counter()
    
    try:
        # Log incoming request
        logger.info(
            f"Sensor processing request: esp_id={request.esp_id}, "
            f"gpio={request.gpio}, type={request.sensor_type}, raw={request.raw_value}"
        )
        
        # Step 1: Get library loader
        loader = get_library_loader()
        
        # Step 2: Get processor for sensor type
        processor = loader.get_processor(request.sensor_type)
        
        if not processor:
            logger.error(
                f"No processor found for sensor type: {request.sensor_type}. "
                f"Available: {loader.get_available_sensors()}"
            )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No processor found for sensor type '{request.sensor_type}'. "
                       f"Available types: {', '.join(loader.get_available_sensors())}",
            )
        
        # Step 3: Process raw value
        try:
            result = processor.process(
                raw_value=request.raw_value,
                calibration=request.calibration,
                params=request.params,
            )
        except Exception as e:
            logger.error(
                f"Sensor processing failed: sensor_type={request.sensor_type}, "
                f"raw_value={request.raw_value}, error={e}",
                exc_info=True,
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Processing failed: {str(e)}",
            )
        
        # Step 4: Calculate processing time
        processing_time_ms = (time.perf_counter() - start_time) * 1000
        
        # Step 5: Build response
        response = SensorProcessResponse(
            success=True,
            processed_value=result.value,
            unit=result.unit,
            quality=result.quality,
            processing_time_ms=round(processing_time_ms, 2),
            metadata=result.metadata,
        )
        
        # Log success
        logger.info(
            f"Sensor processing complete: esp_id={request.esp_id}, "
            f"gpio={request.gpio}, processed={result.value} {result.unit}, "
            f"quality={result.quality}, time={processing_time_ms:.2f}ms"
        )
        
        return response
    
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    
    except Exception as e:
        # Catch-all for unexpected errors
        logger.error(
            f"Unexpected error in sensor processing: {e}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during processing",
        )


@router.get(
    "/types",
    summary="List available sensor types",
    description="Get list of sensor types supported by the server.",
)
async def list_sensor_types(
    api_key: Annotated[str, Depends(verify_api_key)],
) -> dict:
    """
    List available sensor processor types.
    
    Args:
        api_key: Verified API key
        
    Returns:
        List of available sensor types
    """
    loader = get_library_loader()
    available_sensors = loader.get_available_sensors()
    
    return {
        "sensor_types": available_sensors,
        "count": len(available_sensors),
    }


@router.get(
    "/health",
    summary="Sensor processing health check",
    description="Check if sensor processing subsystem is healthy.",
)
async def health_check() -> dict:
    """
    Health check for sensor processing subsystem.
    
    Returns:
        Health status and loaded processors
    """
    try:
        loader = get_library_loader()
        available_sensors = loader.get_available_sensors()
        
        return {
            "status": "healthy",
            "processors_loaded": len(available_sensors),
            "available_sensors": available_sensors,
        }
    except Exception as e:
        logger.error(f"Sensor processing health check failed: {e}", exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "unhealthy",
                "error": str(e),
            },
        )

