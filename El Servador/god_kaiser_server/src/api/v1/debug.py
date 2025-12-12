"""
Debug API Router - Mock ESP32 Management

Provides REST endpoints for creating, configuring, and controlling
mock ESP32 devices for testing and debugging without real hardware.

All endpoints require admin authentication.
"""

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status

from ...core.logging_config import get_logger
from ...schemas.debug import (
    BatchSensorValueRequest,
    CommandResponse,
    HeartbeatResponse,
    MockActuatorConfig,
    MockESPCreate,
    MockESPListResponse,
    MockESPMessagesResponse,
    MockESPResponse,
    MockESPUpdate,
    MockSensorConfig,
    SetActuatorStateRequest,
    SetSensorValueRequest,
    StateTransitionRequest,
    GPIOPathParams,
)
from ...services.mock_esp_manager import MockESPManager
from ..deps import AdminUser

logger = get_logger(__name__)

router = APIRouter(prefix="/v1/debug", tags=["Debug"])

# Dependency to get MockESPManager
async def get_mock_esp_manager() -> MockESPManager:
    """Get MockESPManager singleton instance."""
    return await MockESPManager.get_instance()


# =============================================================================
# Mock ESP CRUD
# =============================================================================
@router.post(
    "/mock-esp",
    response_model=MockESPResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Mock ESP32",
    description="Create a new mock ESP32 device for testing. Requires admin role."
)
async def create_mock_esp(
    config: MockESPCreate,
    current_user: AdminUser,
    manager: MockESPManager = Depends(get_mock_esp_manager)
) -> MockESPResponse:
    """
    Create a new mock ESP32 instance.

    The mock ESP will simulate real ESP32 behavior including:
    - MQTT message publishing
    - State machine transitions
    - Sensor readings
    - Actuator control
    """
    try:
        result = await manager.create_mock_esp(config)
        logger.info(f"Admin {current_user.username} created mock ESP: {config.esp_id}")
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Failed to create mock ESP: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create mock ESP: {str(e)}"
        )


@router.get(
    "/mock-esp",
    response_model=MockESPListResponse,
    summary="List Mock ESPs",
    description="Get all active mock ESP32 devices."
)
async def list_mock_esps(
    current_user: AdminUser,
    manager: MockESPManager = Depends(get_mock_esp_manager)
) -> MockESPListResponse:
    """List all active mock ESP32 instances."""
    esps = await manager.list_mock_esps()
    return MockESPListResponse(
        success=True,
        data=esps,
        total=len(esps)
    )


@router.get(
    "/mock-esp/{esp_id}",
    response_model=MockESPResponse,
    summary="Get Mock ESP",
    description="Get details of a specific mock ESP32 device."
)
async def get_mock_esp(
    esp_id: str,
    current_user: AdminUser,
    manager: MockESPManager = Depends(get_mock_esp_manager)
) -> MockESPResponse:
    """Get mock ESP32 details by ID."""
    result = await manager.get_mock_esp(esp_id)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mock ESP {esp_id} not found"
        )
    return result


@router.delete(
    "/mock-esp/{esp_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Mock ESP",
    description="Delete a mock ESP32 device."
)
async def delete_mock_esp(
    esp_id: str,
    current_user: AdminUser,
    manager: MockESPManager = Depends(get_mock_esp_manager)
):
    """Delete a mock ESP32 instance."""
    deleted = await manager.delete_mock_esp(esp_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mock ESP {esp_id} not found"
        )
    logger.info(f"Admin {current_user.username} deleted mock ESP: {esp_id}")


# =============================================================================
# Heartbeat & State
# =============================================================================
@router.post(
    "/mock-esp/{esp_id}/heartbeat",
    response_model=HeartbeatResponse,
    summary="Trigger Heartbeat",
    description="Manually trigger a heartbeat from a mock ESP32."
)
async def trigger_heartbeat(
    esp_id: str,
    current_user: AdminUser,
    manager: MockESPManager = Depends(get_mock_esp_manager)
) -> HeartbeatResponse:
    """Trigger a heartbeat message from the mock ESP."""
    result = await manager.trigger_heartbeat(esp_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mock ESP {esp_id} not found"
        )

    return HeartbeatResponse(
        success=True,
        esp_id=esp_id,
        timestamp=datetime.now(timezone.utc),
        message_published=True,
        payload=result
    )


@router.post(
    "/mock-esp/{esp_id}/state",
    response_model=CommandResponse,
    summary="Set System State",
    description="Transition mock ESP32 to a specific system state."
)
async def set_state(
    esp_id: str,
    request: StateTransitionRequest,
    current_user: AdminUser,
    manager: MockESPManager = Depends(get_mock_esp_manager)
) -> CommandResponse:
    """Set the system state of a mock ESP."""
    result = await manager.set_state(esp_id, request.state, request.reason)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mock ESP {esp_id} not found"
        )

    return CommandResponse(
        success=True,
        esp_id=esp_id,
        command="set_state",
        result=result
    )


@router.post(
    "/mock-esp/{esp_id}/auto-heartbeat",
    response_model=CommandResponse,
    summary="Configure Auto-Heartbeat",
    description="Enable or disable automatic heartbeat for a mock ESP32."
)
async def configure_auto_heartbeat(
    esp_id: str,
    enabled: bool = True,
    interval_seconds: int = 60,
    current_user: AdminUser = None,
    manager: MockESPManager = Depends(get_mock_esp_manager)
) -> CommandResponse:
    """Configure auto-heartbeat for a mock ESP."""
    success = await manager.set_auto_heartbeat(esp_id, enabled, interval_seconds)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mock ESP {esp_id} not found"
        )

    return CommandResponse(
        success=True,
        esp_id=esp_id,
        command="auto_heartbeat",
        result={"enabled": enabled, "interval_seconds": interval_seconds}
    )


# =============================================================================
# Sensor Operations
# =============================================================================
@router.post(
    "/mock-esp/{esp_id}/sensors",
    response_model=CommandResponse,
    summary="Add Sensor",
    description="Add a new sensor to a mock ESP32."
)
async def add_sensor(
    esp_id: str,
    config: MockSensorConfig,
    current_user: AdminUser,
    manager: MockESPManager = Depends(get_mock_esp_manager)
) -> CommandResponse:
    """Add a sensor to a mock ESP."""
    result = await manager.add_sensor(esp_id, config)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mock ESP {esp_id} not found"
        )

    return CommandResponse(
        success=True,
        esp_id=esp_id,
        command="add_sensor",
        result=result.model_dump()
    )


@router.delete(
    "/mock-esp/{esp_id}/sensors/{gpio}",
    response_model=CommandResponse,
    status_code=status.HTTP_200_OK,
    summary="Remove Sensor",
    description="Remove a sensor from a mock ESP32 and return the pin to safe mode."
)
async def remove_sensor(
    esp_id: str,
    gpio: int,
    current_user: AdminUser,
    manager: MockESPManager = Depends(get_mock_esp_manager)
) -> CommandResponse:
    """Remove a sensor and free the pin (DELETE endpoint)."""
    success = await manager.remove_sensor(esp_id, gpio)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mock ESP {esp_id} or sensor GPIO {gpio} not found"
        )

    return CommandResponse(
        success=True,
        esp_id=esp_id,
        command="remove_sensor",
        result={"gpio": gpio}
    )


@router.post(
    "/mock-esp/{esp_id}/sensors/{gpio}",
    response_model=CommandResponse,
    summary="Set Sensor Value",
    description="Set the raw value of a sensor on a mock ESP32."
)
async def set_sensor_value(
    esp_id: str,
    gpio: int,
    request: SetSensorValueRequest,
    current_user: AdminUser,
    manager: MockESPManager = Depends(get_mock_esp_manager)
) -> CommandResponse:
    """Set a sensor's raw value and optionally publish MQTT message."""
    result = await manager.set_sensor_value(
        esp_id=esp_id,
        gpio=gpio,
        raw_value=request.raw_value,
        quality=request.quality.value if request.quality else None,
        publish=request.publish
    )

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mock ESP {esp_id} or sensor GPIO {gpio} not found"
        )

    return CommandResponse(
        success=True,
        esp_id=esp_id,
        command="set_sensor_value",
        result=result
    )


@router.post(
    "/mock-esp/{esp_id}/sensors/batch",
    response_model=CommandResponse,
    summary="Set Batch Sensor Values",
    description="Set multiple sensor values at once."
)
async def set_batch_sensor_values(
    esp_id: str,
    request: BatchSensorValueRequest,
    current_user: AdminUser,
    manager: MockESPManager = Depends(get_mock_esp_manager)
) -> CommandResponse:
    """Set multiple sensor values and optionally publish batch message."""
    result = await manager.set_batch_sensor_values(
        esp_id=esp_id,
        values=request.values,
        publish=request.publish
    )

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mock ESP {esp_id} not found"
        )

    return CommandResponse(
        success=True,
        esp_id=esp_id,
        command="set_batch_sensor_values",
        result=result
    )


# =============================================================================
# Actuator Operations
# =============================================================================
@router.post(
    "/mock-esp/{esp_id}/actuators",
    response_model=CommandResponse,
    summary="Add Actuator",
    description="Add a new actuator to a mock ESP32."
)
async def add_actuator(
    esp_id: str,
    config: MockActuatorConfig,
    current_user: AdminUser,
    manager: MockESPManager = Depends(get_mock_esp_manager)
) -> CommandResponse:
    """Add an actuator to a mock ESP."""
    result = await manager.add_actuator(esp_id, config)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mock ESP {esp_id} not found"
        )

    return CommandResponse(
        success=True,
        esp_id=esp_id,
        command="add_actuator",
        result=result.model_dump()
    )


@router.post(
    "/mock-esp/{esp_id}/actuators/{gpio}",
    response_model=CommandResponse,
    summary="Set Actuator State",
    description="Set the state of an actuator on a mock ESP32."
)
async def set_actuator_state(
    esp_id: str,
    gpio: int,
    request: SetActuatorStateRequest,
    current_user: AdminUser,
    manager: MockESPManager = Depends(get_mock_esp_manager)
) -> CommandResponse:
    """Set an actuator's state and optionally publish MQTT status."""
    result = await manager.set_actuator_state(
        esp_id=esp_id,
        gpio=gpio,
        state=request.state,
        pwm_value=request.pwm_value,
        publish=request.publish
    )

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mock ESP {esp_id} or actuator GPIO {gpio} not found"
        )

    return CommandResponse(
        success=True,
        esp_id=esp_id,
        command="set_actuator_state",
        result=result
    )


# =============================================================================
# Emergency Stop
# =============================================================================
@router.post(
    "/mock-esp/{esp_id}/emergency-stop",
    response_model=CommandResponse,
    summary="Emergency Stop",
    description="Trigger emergency stop on a mock ESP32, stopping all actuators."
)
async def emergency_stop(
    esp_id: str,
    reason: str = "manual",
    current_user: AdminUser = None,
    manager: MockESPManager = Depends(get_mock_esp_manager)
) -> CommandResponse:
    """Trigger emergency stop on a mock ESP."""
    result = await manager.emergency_stop(esp_id, reason)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mock ESP {esp_id} not found"
        )

    logger.warning(f"Emergency stop triggered on mock ESP {esp_id} by {current_user.username if current_user else 'unknown'}: {reason}")

    return CommandResponse(
        success=True,
        esp_id=esp_id,
        command="emergency_stop",
        result=result
    )


@router.post(
    "/mock-esp/{esp_id}/clear-emergency",
    response_model=CommandResponse,
    summary="Clear Emergency",
    description="Clear emergency stop state on a mock ESP32."
)
async def clear_emergency(
    esp_id: str,
    current_user: AdminUser,
    manager: MockESPManager = Depends(get_mock_esp_manager)
) -> CommandResponse:
    """Clear emergency stop on a mock ESP."""
    result = await manager.clear_emergency(esp_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mock ESP {esp_id} not found"
        )

    return CommandResponse(
        success=True,
        esp_id=esp_id,
        command="clear_emergency",
        result=result
    )


# =============================================================================
# Message History
# =============================================================================
@router.get(
    "/mock-esp/{esp_id}/messages",
    response_model=MockESPMessagesResponse,
    summary="Get Published Messages",
    description="Get MQTT messages published by a mock ESP32."
)
async def get_messages(
    esp_id: str,
    limit: int = 100,
    current_user: AdminUser = None,
    manager: MockESPManager = Depends(get_mock_esp_manager)
) -> MockESPMessagesResponse:
    """Get recently published MQTT messages from a mock ESP."""
    messages = await manager.get_published_messages(esp_id, limit)

    # Check if ESP exists (empty list could mean no messages OR not found)
    esp = await manager.get_mock_esp(esp_id)
    if esp is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mock ESP {esp_id} not found"
        )

    return MockESPMessagesResponse(
        success=True,
        esp_id=esp_id,
        messages=messages,
        total=len(messages)
    )


@router.delete(
    "/mock-esp/{esp_id}/messages",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Clear Messages",
    description="Clear message history for a mock ESP32."
)
async def clear_messages(
    esp_id: str,
    current_user: AdminUser,
    manager: MockESPManager = Depends(get_mock_esp_manager)
):
    """Clear message history for a mock ESP."""
    cleared = await manager.clear_messages(esp_id)
    if not cleared:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mock ESP {esp_id} not found"
        )
