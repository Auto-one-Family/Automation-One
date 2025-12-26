"""
Debug API Router - Mock ESP32 Management & Database Explorer

Provides REST endpoints for creating, configuring, and controlling
mock ESP32 devices for testing and debugging without real hardware.

Also includes Database Explorer endpoints for inspecting database tables.

All endpoints require admin authentication.
"""

import json
import math
import os
import re
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, inspect, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import get_settings
from ...core.logging_config import get_logger
from ...db.base import Base
from ...db.session import get_session
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
from ...schemas.debug_db import (
    ALLOWED_TABLES,
    MASKED_FIELDS,
    TIME_SERIES_TABLES,
    DEFAULT_TIME_SERIES_LIMIT_HOURS,
    ColumnSchema,
    ColumnType,
    RecordResponse,
    SortOrder,
    TableDataResponse,
    TableListResponse,
    TableSchema,
)
from ...services.mock_esp_manager import MockESPManager
from ...services.audit_retention_service import AuditRetentionService
from ...db.repositories import ESPRepository
from ..deps import AdminUser, DBSession

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
    db: DBSession,
    manager: MockESPManager = Depends(get_mock_esp_manager)
) -> MockESPResponse:
    """
    Create a new mock ESP32 instance.

    The mock ESP will simulate real ESP32 behavior including:
    - MQTT message publishing
    - State machine transitions
    - Sensor readings
    - Actuator control

    Also registers the mock ESP in the database so Zone/Subzone APIs work.
    """
    try:
        result = await manager.create_mock_esp(config)

        # Also register in the database for Zone/Subzone API compatibility
        esp_repo = ESPRepository(db)
        existing = await esp_repo.get_by_device_id(config.esp_id)

        if not existing:
            # Generate unique MAC address from ESP ID (e.g., ESP_MOCK_00B7EF -> MO:CK:00:00:B7:EF)
            esp_suffix = config.esp_id.replace("ESP_MOCK_", "").upper()
            # Pad to 6 chars if needed
            esp_suffix = esp_suffix.zfill(6)[-6:]
            mock_mac = f"MO:CK:{esp_suffix[0:2]}:{esp_suffix[2:4]}:{esp_suffix[4:6]}:00"

            # Auto-generate zone_id from zone_name if needed
            zone_id = config.zone_id
            zone_name = config.zone_name
            if zone_name and not zone_id:
                # Generate technical zone_id from user-friendly zone_name
                zone_id = zone_name.lower()
                zone_id = zone_id.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
                zone_id = re.sub(r'[^a-z0-9]+', '_', zone_id).strip('_')

            # Create descriptive name for database
            # Use zone_name if provided for better identification
            short_id = config.esp_id.replace("ESP_MOCK_", "")
            if zone_name:
                db_name = f"Mock ESP ({zone_name}) [{short_id}]"
            else:
                db_name = f"Mock ESP {short_id}"

            await esp_repo.create(
                device_id=config.esp_id,
                name=db_name,
                hardware_type="MOCK_ESP32",
                zone_id=zone_id,
                zone_name=zone_name,  # Store user-friendly name
                master_zone_id=config.master_zone_id,
                kaiser_id="god",
                status="online",
                ip_address="127.0.0.1",
                mac_address=mock_mac,
                firmware_version="MOCK_1.0.0",
                capabilities={"max_sensors": 20, "max_actuators": 12, "mock": True},
                device_metadata={"created_by": current_user.username, "mock": True},
            )
            await db.commit()
            logger.info(f"Mock ESP {config.esp_id} registered in database with name: {db_name}")

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
    db: DBSession,
    manager: MockESPManager = Depends(get_mock_esp_manager)
):
    """Delete a mock ESP32 instance and remove from database."""
    deleted = await manager.delete_mock_esp(esp_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mock ESP {esp_id} not found"
        )

    # Also delete from database if it exists there
    esp_repo = ESPRepository(db)
    db_esp = await esp_repo.get_by_device_id(esp_id)
    if db_esp:
        await esp_repo.delete(db_esp.id)
        await db.commit()
        logger.info(f"Mock ESP {esp_id} also removed from database")

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


# =============================================================================
# Database Explorer
# =============================================================================

def _get_sqlalchemy_type_to_column_type(sqlalchemy_type: str) -> ColumnType:
    """Map SQLAlchemy type string to ColumnType enum."""
    type_lower = sqlalchemy_type.lower()
    
    if "uuid" in type_lower:
        return ColumnType.UUID
    elif "int" in type_lower:
        return ColumnType.INTEGER
    elif "float" in type_lower or "numeric" in type_lower or "decimal" in type_lower or "real" in type_lower:
        return ColumnType.FLOAT
    elif "bool" in type_lower:
        return ColumnType.BOOLEAN
    elif "datetime" in type_lower or "timestamp" in type_lower:
        return ColumnType.DATETIME
    elif "json" in type_lower:
        return ColumnType.JSON
    else:
        return ColumnType.STRING


def _mask_sensitive_fields(table_name: str, record: Dict[str, Any]) -> Dict[str, Any]:
    """Mask sensitive fields in a record."""
    masked = record.copy()
    if table_name in MASKED_FIELDS:
        for field in MASKED_FIELDS[table_name]:
            if field in masked:
                masked[field] = "***MASKED***"
    return masked


def _serialize_value(value: Any) -> Any:
    """Serialize a value for JSON response."""
    if value is None:
        return None
    elif isinstance(value, datetime):
        return value.isoformat()
    elif hasattr(value, '__str__') and not isinstance(value, (str, int, float, bool, list, dict)):
        # UUID and other objects
        return str(value)
    elif isinstance(value, dict):
        return {k: _serialize_value(v) for k, v in value.items()}
    elif isinstance(value, list):
        return [_serialize_value(v) for v in value]
    return value


def _parse_filters(filters_json: Optional[str], columns: List[str]) -> Dict[str, Any]:
    """Parse filter JSON string into a dict, validating column names."""
    if not filters_json:
        return {}
    
    try:
        filters = json.loads(filters_json)
        if not isinstance(filters, dict):
            raise ValueError("Filters must be a JSON object")
        
        # Validate that filter keys reference valid columns
        valid_filters = {}
        for key, value in filters.items():
            # Extract base column name (remove __gte, __lte, __in suffixes)
            base_column = key.split("__")[0]
            if base_column in columns:
                valid_filters[key] = value
            else:
                logger.warning(f"Ignoring filter for unknown column: {base_column}")
        
        return valid_filters
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid filter JSON: {e}")


async def _get_db_session():
    """Get async database session."""
    async for session in get_session():
        yield session


@router.get(
    "/db/tables",
    response_model=TableListResponse,
    summary="List Database Tables",
    description="Get list of all accessible database tables with metadata."
)
async def list_database_tables(
    current_user: AdminUser,
    db: AsyncSession = Depends(_get_db_session)
) -> TableListResponse:
    """
    List all database tables accessible via the explorer.
    
    Returns table names, column schemas, and row counts.
    Only tables in the whitelist are returned.
    """
    tables = []
    
    # Get SQLAlchemy inspector
    def get_table_info(connection):
        inspector = inspect(connection)
        return inspector.get_table_names()
    
    # Run synchronously in the async context
    async with db.begin():
        connection = await db.connection()
        all_tables = await connection.run_sync(
            lambda conn: inspect(conn).get_table_names()
        )
        
        for table_name in all_tables:
            if table_name not in ALLOWED_TABLES:
                continue
            
            # Get column info
            columns_info = await connection.run_sync(
                lambda conn, tn=table_name: inspect(conn).get_columns(tn)
            )
            
            # Get primary key info
            pk_info = await connection.run_sync(
                lambda conn, tn=table_name: inspect(conn).get_pk_constraint(tn)
            )
            
            # Get foreign key info
            fk_info = await connection.run_sync(
                lambda conn, tn=table_name: inspect(conn).get_foreign_keys(tn)
            )
            
            # Build foreign key lookup
            fk_lookup = {}
            for fk in fk_info:
                for local_col in fk.get("constrained_columns", []):
                    ref_table = fk.get("referred_table", "")
                    ref_cols = fk.get("referred_columns", [])
                    if ref_cols:
                        fk_lookup[local_col] = f"{ref_table}.{ref_cols[0]}"
            
            # Get primary key column(s)
            pk_columns = pk_info.get("constrained_columns", []) if pk_info else []
            primary_key = pk_columns[0] if pk_columns else "id"
            
            # Build column schemas
            columns = []
            for col in columns_info:
                col_name = col["name"]
                col_type = str(col["type"])
                
                columns.append(ColumnSchema(
                    name=col_name,
                    type=_get_sqlalchemy_type_to_column_type(col_type),
                    nullable=col.get("nullable", True),
                    primary_key=col_name in pk_columns,
                    foreign_key=fk_lookup.get(col_name)
                ))
            
            # Get row count
            result = await db.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
            row_count = result.scalar() or 0
            
            tables.append(TableSchema(
                table_name=table_name,
                columns=columns,
                row_count=row_count,
                primary_key=primary_key
            ))
    
    # Sort tables alphabetically
    tables.sort(key=lambda t: t.table_name)
    
    logger.info(f"Admin {current_user.username} listed {len(tables)} database tables")
    return TableListResponse(success=True, tables=tables)


@router.get(
    "/db/{table_name}/schema",
    response_model=TableSchema,
    summary="Get Table Schema",
    description="Get detailed schema information for a specific table."
)
async def get_table_schema(
    table_name: str,
    current_user: AdminUser,
    db: AsyncSession = Depends(_get_db_session)
) -> TableSchema:
    """Get detailed schema of a database table."""
    if table_name not in ALLOWED_TABLES:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Table '{table_name}' not found or not accessible"
        )
    
    async with db.begin():
        connection = await db.connection()
        
        # Check if table exists
        all_tables = await connection.run_sync(
            lambda conn: inspect(conn).get_table_names()
        )
        
        if table_name not in all_tables:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Table '{table_name}' not found in database"
            )
        
        # Get column info
        columns_info = await connection.run_sync(
            lambda conn: inspect(conn).get_columns(table_name)
        )
        
        # Get primary key info
        pk_info = await connection.run_sync(
            lambda conn: inspect(conn).get_pk_constraint(table_name)
        )
        
        # Get foreign key info
        fk_info = await connection.run_sync(
            lambda conn: inspect(conn).get_foreign_keys(table_name)
        )
        
        # Build foreign key lookup
        fk_lookup = {}
        for fk in fk_info:
            for local_col in fk.get("constrained_columns", []):
                ref_table = fk.get("referred_table", "")
                ref_cols = fk.get("referred_columns", [])
                if ref_cols:
                    fk_lookup[local_col] = f"{ref_table}.{ref_cols[0]}"
        
        pk_columns = pk_info.get("constrained_columns", []) if pk_info else []
        primary_key = pk_columns[0] if pk_columns else "id"
        
        columns = []
        for col in columns_info:
            col_name = col["name"]
            col_type = str(col["type"])
            
            columns.append(ColumnSchema(
                name=col_name,
                type=_get_sqlalchemy_type_to_column_type(col_type),
                nullable=col.get("nullable", True),
                primary_key=col_name in pk_columns,
                foreign_key=fk_lookup.get(col_name)
            ))
        
        # Get row count
        result = await db.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
        row_count = result.scalar() or 0
    
    return TableSchema(
        table_name=table_name,
        columns=columns,
        row_count=row_count,
        primary_key=primary_key
    )


@router.get(
    "/db/{table_name}",
    response_model=TableDataResponse,
    summary="Query Table Data",
    description="Query data from a database table with pagination, sorting, and filtering."
)
async def query_table(
    table_name: str,
    current_user: AdminUser,
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(default=50, ge=1, le=500, description="Records per page"),
    sort_by: Optional[str] = Query(default=None, description="Column to sort by"),
    sort_order: SortOrder = Query(default=SortOrder.DESC, description="Sort order"),
    filters: Optional[str] = Query(default=None, description="JSON-encoded filters"),
    db: AsyncSession = Depends(_get_db_session)
) -> TableDataResponse:
    """
    Query data from a database table.
    
    Supports:
    - Pagination (page, page_size)
    - Sorting (sort_by, sort_order)
    - Filtering (filters as JSON string)
    
    Filter syntax (Django-style):
    - {"column": "value"} - exact match
    - {"column__gte": 100} - greater than or equal
    - {"column__lte": 200} - less than or equal
    - {"column__in": ["a", "b"]} - in list
    
    Time-series tables (sensor_data, actuator_history, logic_execution_history)
    default to last 24 hours unless overridden with timestamp filters.
    """
    if table_name not in ALLOWED_TABLES:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Table '{table_name}' not found or not accessible"
        )
    
    async with db.begin():
        connection = await db.connection()
        
        # Get column names for validation
        columns_info = await connection.run_sync(
            lambda conn: inspect(conn).get_columns(table_name)
        )
        column_names = [col["name"] for col in columns_info]
        
        # Parse and validate filters
        try:
            parsed_filters = _parse_filters(filters, column_names)
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )
        
        # Build base query
        base_query = f"SELECT * FROM {table_name}"
        count_query = f"SELECT COUNT(*) FROM {table_name}"
        
        # Build WHERE clause
        where_clauses = []
        params = {}
        param_index = 0
        
        # For time-series tables, add default time filter if not provided
        if table_name in TIME_SERIES_TABLES:
            timestamp_col = "timestamp"
            has_timestamp_filter = any(
                key.startswith("timestamp") for key in parsed_filters.keys()
            )
            
            if not has_timestamp_filter:
                # Default to last 24 hours
                cutoff = datetime.now(timezone.utc) - timedelta(hours=DEFAULT_TIME_SERIES_LIMIT_HOURS)
                param_name = f"p{param_index}"
                where_clauses.append(f"{timestamp_col} >= :{param_name}")
                params[param_name] = cutoff.isoformat()
                param_index += 1
        
        # Process filters
        for key, value in parsed_filters.items():
            parts = key.split("__")
            col_name = parts[0]
            operator = parts[1] if len(parts) > 1 else "eq"
            
            if col_name not in column_names:
                continue
            
            param_name = f"p{param_index}"
            
            if operator == "eq" or operator == col_name:
                where_clauses.append(f"{col_name} = :{param_name}")
                params[param_name] = value
            elif operator == "gte":
                where_clauses.append(f"{col_name} >= :{param_name}")
                params[param_name] = value
            elif operator == "lte":
                where_clauses.append(f"{col_name} <= :{param_name}")
                params[param_name] = value
            elif operator == "gt":
                where_clauses.append(f"{col_name} > :{param_name}")
                params[param_name] = value
            elif operator == "lt":
                where_clauses.append(f"{col_name} < :{param_name}")
                params[param_name] = value
            elif operator == "in":
                if isinstance(value, list):
                    placeholders = []
                    for i, v in enumerate(value):
                        p_name = f"p{param_index}_{i}"
                        placeholders.append(f":{p_name}")
                        params[p_name] = v
                    where_clauses.append(f"{col_name} IN ({', '.join(placeholders)})")
            elif operator == "contains":
                where_clauses.append(f"{col_name} LIKE :{param_name}")
                params[param_name] = f"%{value}%"
            
            param_index += 1
        
        # Add WHERE clause to queries
        if where_clauses:
            where_sql = " AND ".join(where_clauses)
            base_query += f" WHERE {where_sql}"
            count_query += f" WHERE {where_sql}"
        
        # Get total count
        result = await db.execute(text(count_query), params)
        total_count = result.scalar() or 0
        
        # Add sorting
        if sort_by and sort_by in column_names:
            order_dir = "ASC" if sort_order == SortOrder.ASC else "DESC"
            base_query += f" ORDER BY {sort_by} {order_dir}"
        elif "created_at" in column_names:
            # Default sort by created_at desc
            base_query += " ORDER BY created_at DESC"
        elif "timestamp" in column_names:
            # For time-series tables
            base_query += " ORDER BY timestamp DESC"
        elif "id" in column_names:
            base_query += " ORDER BY id DESC"
        
        # Add pagination
        offset = (page - 1) * page_size
        base_query += f" LIMIT {page_size} OFFSET {offset}"
        
        # Execute query
        result = await db.execute(text(base_query), params)
        rows = result.mappings().all()
        
        # Serialize and mask data
        data = []
        for row in rows:
            record = {k: _serialize_value(v) for k, v in dict(row).items()}
            record = _mask_sensitive_fields(table_name, record)
            data.append(record)
    
    # Calculate total pages
    total_pages = math.ceil(total_count / page_size) if total_count > 0 else 0
    
    logger.info(
        f"Admin {current_user.username} queried table {table_name}: "
        f"page={page}, page_size={page_size}, total={total_count}"
    )
    
    return TableDataResponse(
        success=True,
        table_name=table_name,
        data=data,
        total_count=total_count,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get(
    "/db/{table_name}/{record_id}",
    response_model=RecordResponse,
    summary="Get Single Record",
    description="Get a single record from a database table by its primary key."
)
async def get_record(
    table_name: str,
    record_id: str,
    current_user: AdminUser,
    db: AsyncSession = Depends(_get_db_session)
) -> RecordResponse:
    """Get a single record by its primary key."""
    if table_name not in ALLOWED_TABLES:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Table '{table_name}' not found or not accessible"
        )
    
    async with db.begin():
        connection = await db.connection()
        
        # Get primary key info
        pk_info = await connection.run_sync(
            lambda conn: inspect(conn).get_pk_constraint(table_name)
        )
        
        pk_columns = pk_info.get("constrained_columns", []) if pk_info else []
        if not pk_columns:
            pk_columns = ["id"]
        
        primary_key = pk_columns[0]
        
        # Build and execute query
        query = f"SELECT * FROM {table_name} WHERE {primary_key} = :record_id"
        result = await db.execute(text(query), {"record_id": record_id})
        row = result.mappings().first()
        
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Record with {primary_key}={record_id} not found in {table_name}"
            )
        
        # Serialize and mask
        record = {k: _serialize_value(v) for k, v in dict(row).items()}
        record = _mask_sensitive_fields(table_name, record)
    
    return RecordResponse(
        success=True,
        table_name=table_name,
        record=record
    )


# =============================================================================
# Log Viewer
# =============================================================================

class LogLevel(str, Enum):
    """Log level filter options."""
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


class LogEntry(BaseModel):
    """A single log entry."""
    timestamp: str
    level: str
    logger: str
    message: str
    module: Optional[str] = None
    function: Optional[str] = None
    line: Optional[int] = None
    exception: Optional[str] = None
    extra: Optional[Dict[str, Any]] = None


class LogsResponse(BaseModel):
    """Response for log queries."""
    success: bool = True
    logs: List[LogEntry]
    total_count: int
    page: int
    page_size: int
    has_more: bool


class LogFilesResponse(BaseModel):
    """Response for available log files."""
    success: bool = True
    files: List[Dict[str, Any]]
    log_directory: str


def _parse_log_line(line: str) -> Optional[LogEntry]:
    """Parse a single log line (JSON format)."""
    try:
        data = json.loads(line.strip())
        return LogEntry(
            timestamp=data.get("timestamp", ""),
            level=data.get("level", "INFO"),
            logger=data.get("logger", "unknown"),
            message=data.get("message", ""),
            module=data.get("module"),
            function=data.get("function"),
            line=data.get("line"),
            exception=data.get("exception"),
            extra={k: v for k, v in data.items() if k not in {
                "timestamp", "level", "logger", "message", "module", "function", "line", "exception"
            }} or None
        )
    except json.JSONDecodeError:
        # Try parsing as text format
        # Format: "2025-01-01 12:00:00 - logger - LEVEL - message"
        pattern = r'^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) - (.+?) - (\w+) - (.*)$'
        match = re.match(pattern, line.strip())
        if match:
            return LogEntry(
                timestamp=match.group(1),
                logger=match.group(2),
                level=match.group(3),
                message=match.group(4)
            )
        return None
    except Exception:
        return None


def _filter_log_entry(
    entry: LogEntry,
    level: Optional[LogLevel],
    module: Optional[str],
    search: Optional[str],
    start_time: Optional[datetime],
    end_time: Optional[datetime]
) -> bool:
    """Check if a log entry matches the filters."""
    # Level filter
    if level:
        level_order = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        if level.value in level_order and entry.level in level_order:
            if level_order.index(entry.level) < level_order.index(level.value):
                return False
    
    # Module filter
    if module and module.lower() not in entry.logger.lower():
        return False
    
    # Search filter
    if search:
        search_lower = search.lower()
        if (search_lower not in entry.message.lower() and 
            search_lower not in entry.logger.lower()):
            return False
    
    # Time filters
    if entry.timestamp and (start_time or end_time):
        try:
            # Parse timestamp (handle both formats)
            ts_str = entry.timestamp.replace("T", " ").split(".")[0]
            entry_time = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
            
            if start_time and entry_time < start_time.replace(tzinfo=None):
                return False
            if end_time and entry_time > end_time.replace(tzinfo=None):
                return False
        except ValueError:
            pass  # Can't parse timestamp, include entry anyway
    
    return True


@router.get(
    "/logs/files",
    response_model=LogFilesResponse,
    summary="List Log Files",
    description="Get list of available log files."
)
async def list_log_files(
    current_user: AdminUser
) -> LogFilesResponse:
    """List all available log files."""
    settings = get_settings()
    log_path = Path(settings.logging.file_path)
    log_dir = log_path.parent
    
    files = []
    
    if log_dir.exists():
        for f in sorted(log_dir.glob("*.log*"), key=lambda x: x.stat().st_mtime, reverse=True):
            stat = f.stat()
            files.append({
                "name": f.name,
                "path": str(f),
                "size_bytes": stat.st_size,
                "size_human": f"{stat.st_size / 1024:.1f} KB" if stat.st_size < 1024 * 1024 else f"{stat.st_size / (1024 * 1024):.1f} MB",
                "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "is_current": f.name == log_path.name
            })
    
    return LogFilesResponse(
        success=True,
        files=files,
        log_directory=str(log_dir)
    )


@router.get(
    "/logs",
    response_model=LogsResponse,
    summary="Query Logs",
    description="Query server logs with filtering and pagination."
)
async def query_logs(
    current_user: AdminUser,
    level: Optional[LogLevel] = Query(default=None, description="Minimum log level"),
    module: Optional[str] = Query(default=None, description="Filter by logger/module name"),
    search: Optional[str] = Query(default=None, description="Search in message text"),
    start_time: Optional[datetime] = Query(default=None, description="Start time filter"),
    end_time: Optional[datetime] = Query(default=None, description="End time filter"),
    file: Optional[str] = Query(default=None, description="Specific log file to read"),
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=100, ge=1, le=1000, description="Entries per page")
) -> LogsResponse:
    """
    Query server logs with filtering.
    
    Reads logs in reverse order (newest first) for better performance.
    Supports filtering by log level, module name, search text, and time range.
    """
    settings = get_settings()
    
    # Determine which file to read
    if file:
        log_path = Path(settings.logging.file_path).parent / file
        if not log_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Log file '{file}' not found"
            )
    else:
        log_path = Path(settings.logging.file_path)
    
    if not log_path.exists():
        return LogsResponse(
            success=True,
            logs=[],
            total_count=0,
            page=page,
            page_size=page_size,
            has_more=False
        )
    
    # Read and parse logs (reverse order for newest first)
    all_entries: List[LogEntry] = []
    
    try:
        with open(log_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        
        # Process in reverse (newest first)
        for line in reversed(lines):
            if not line.strip():
                continue
            
            entry = _parse_log_line(line)
            if entry and _filter_log_entry(entry, level, module, search, start_time, end_time):
                all_entries.append(entry)
            
            # Limit scanning for performance (max 10000 entries)
            if len(all_entries) >= 10000:
                break
    except Exception as e:
        logger.error(f"Error reading log file: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error reading log file: {str(e)}"
        )
    
    # Pagination
    total_count = len(all_entries)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    page_entries = all_entries[start_idx:end_idx]
    
    logger.info(
        f"Admin {current_user.username} queried logs: "
        f"file={log_path.name}, level={level}, page={page}, total={total_count}"
    )
    
    return LogsResponse(
        success=True,
        logs=page_entries,
        total_count=total_count,
        page=page,
        page_size=page_size,
        has_more=end_idx < total_count
    )


# =============================================================================
# System Configuration
# =============================================================================

class ConfigEntry(BaseModel):
    """A single configuration entry."""
    id: str
    config_key: str
    config_value: Any
    config_type: str
    description: Optional[str] = None
    is_secret: bool = False
    created_at: str
    updated_at: str


class ConfigListResponse(BaseModel):
    """Response for config list."""
    success: bool = True
    configs: List[ConfigEntry]
    total: int


class ConfigUpdateRequest(BaseModel):
    """Request to update a config value."""
    config_value: Any = Field(..., description="New configuration value (JSON)")


@router.get(
    "/config",
    response_model=ConfigListResponse,
    summary="List System Configuration",
    description="Get all system configuration entries."
)
async def list_config(
    current_user: AdminUser,
    config_type: Optional[str] = Query(default=None, description="Filter by config type"),
    db: AsyncSession = Depends(_get_db_session)
) -> ConfigListResponse:
    """List all system configuration."""
    query = "SELECT * FROM system_config"
    params = {}
    
    if config_type:
        query += " WHERE config_type = :config_type"
        params["config_type"] = config_type
    
    query += " ORDER BY config_type, config_key"
    
    result = await db.execute(text(query), params)
    rows = result.mappings().all()
    
    configs = []
    for row in rows:
        row_dict = dict(row)
        # Mask secret values
        if row_dict.get("is_secret"):
            row_dict["config_value"] = "***MASKED***"
        
        configs.append(ConfigEntry(
            id=str(row_dict["id"]),
            config_key=row_dict["config_key"],
            config_value=row_dict["config_value"],
            config_type=row_dict["config_type"],
            description=row_dict.get("description"),
            is_secret=row_dict.get("is_secret", False),
            created_at=row_dict["created_at"].isoformat() if row_dict.get("created_at") else "",
            updated_at=row_dict["updated_at"].isoformat() if row_dict.get("updated_at") else ""
        ))
    
    return ConfigListResponse(
        success=True,
        configs=configs,
        total=len(configs)
    )


@router.patch(
    "/config/{config_key}",
    response_model=ConfigEntry,
    summary="Update Configuration",
    description="Update a system configuration value."
)
async def update_config(
    config_key: str,
    update_data: ConfigUpdateRequest,
    current_user: AdminUser,
    db: AsyncSession = Depends(_get_db_session)
) -> ConfigEntry:
    """Update a system configuration entry."""
    # Check if config exists
    result = await db.execute(
        text("SELECT * FROM system_config WHERE config_key = :key"),
        {"key": config_key}
    )
    row = result.mappings().first()
    
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Configuration '{config_key}' not found"
        )
    
    # Update the config
    new_value = json.dumps(update_data.config_value) if not isinstance(update_data.config_value, str) else update_data.config_value
    
    await db.execute(
        text("""
            UPDATE system_config 
            SET config_value = :value, updated_at = :updated_at 
            WHERE config_key = :key
        """),
        {
            "value": update_data.config_value,
            "updated_at": datetime.now(timezone.utc),
            "key": config_key
        }
    )
    await db.commit()
    
    # Fetch updated row
    result = await db.execute(
        text("SELECT * FROM system_config WHERE config_key = :key"),
        {"key": config_key}
    )
    updated_row = result.mappings().first()
    row_dict = dict(updated_row)
    
    logger.info(f"Admin {current_user.username} updated config: {config_key}")
    
    return ConfigEntry(
        id=str(row_dict["id"]),
        config_key=row_dict["config_key"],
        config_value=row_dict["config_value"] if not row_dict.get("is_secret") else "***MASKED***",
        config_type=row_dict["config_type"],
        description=row_dict.get("description"),
        is_secret=row_dict.get("is_secret", False),
        created_at=row_dict["created_at"].isoformat() if row_dict.get("created_at") else "",
        updated_at=row_dict["updated_at"].isoformat() if row_dict.get("updated_at") else ""
    )


# =============================================================================
# Load Testing
# =============================================================================

class BulkCreateRequest(BaseModel):
    """Request to bulk-create mock ESPs."""
    count: int = Field(..., ge=1, le=100, description="Number of mock ESPs to create")
    prefix: str = Field(default="LOAD_TEST", description="ESP ID prefix")
    with_sensors: int = Field(default=2, ge=0, le=10, description="Sensors per ESP")
    with_actuators: int = Field(default=1, ge=0, le=10, description="Actuators per ESP")


class BulkCreateResponse(BaseModel):
    """Response for bulk create."""
    success: bool = True
    created_count: int
    esp_ids: List[str]
    message: str


class SimulationRequest(BaseModel):
    """Request to start sensor simulation."""
    esp_ids: Optional[List[str]] = Field(default=None, description="ESPs to simulate (all if empty)")
    interval_ms: int = Field(default=1000, ge=100, le=60000, description="Simulation interval in ms")
    duration_seconds: int = Field(default=60, ge=10, le=3600, description="Simulation duration")


class SimulationResponse(BaseModel):
    """Response for simulation control."""
    success: bool = True
    message: str
    active_simulations: int = 0


class MetricsResponse(BaseModel):
    """Response for performance metrics."""
    success: bool = True
    mock_esp_count: int
    total_sensors: int
    total_actuators: int
    messages_published: int
    uptime_seconds: float


@router.post(
    "/load-test/bulk-create",
    response_model=BulkCreateResponse,
    summary="Bulk Create Mock ESPs",
    description="Create multiple mock ESPs for load testing."
)
async def bulk_create_mock_esps(
    request: BulkCreateRequest,
    current_user: AdminUser,
    manager: MockESPManager = Depends(get_mock_esp_manager)
) -> BulkCreateResponse:
    """Create multiple mock ESPs at once for load testing."""
    created_ids = []
    
    for i in range(request.count):
        esp_id = f"{request.prefix}_{i+1:04d}"
        
        try:
            from ...schemas.debug import MockESPCreate, MockSensorConfig, MockActuatorConfig
            
            # Create sensors
            sensors = []
            for s in range(request.with_sensors):
                sensors.append(MockSensorConfig(
                    gpio=2 + s,
                    sensor_type="DHT22" if s % 2 == 0 else "DS18B20",
                    name=f"Sensor_{s+1}",
                    unit="°C" if s % 2 == 0 else "%"
                ))
            
            # Create actuators
            actuators = []
            for a in range(request.with_actuators):
                actuators.append(MockActuatorConfig(
                    gpio=12 + a,
                    actuator_type="relay" if a % 2 == 0 else "pwm",
                    name=f"Actuator_{a+1}"
                ))
            
            config = MockESPCreate(
                esp_id=esp_id,
                sensors=sensors,
                actuators=actuators
            )
            
            await manager.create_mock_esp(config)
            created_ids.append(esp_id)
            
        except ValueError:
            # ESP already exists, skip
            continue
        except Exception as e:
            logger.error(f"Error creating mock ESP {esp_id}: {e}")
            continue
    
    logger.info(f"Admin {current_user.username} bulk-created {len(created_ids)} mock ESPs")
    
    return BulkCreateResponse(
        success=True,
        created_count=len(created_ids),
        esp_ids=created_ids,
        message=f"Created {len(created_ids)} mock ESPs with prefix '{request.prefix}'"
    )


@router.post(
    "/load-test/simulate",
    response_model=SimulationResponse,
    summary="Start Sensor Simulation",
    description="Start automatic sensor value simulation for load testing."
)
async def start_simulation(
    request: SimulationRequest,
    current_user: AdminUser,
    manager: MockESPManager = Depends(get_mock_esp_manager)
) -> SimulationResponse:
    """Start sensor simulation on mock ESPs."""
    # Get ESPs to simulate
    if request.esp_ids:
        esp_ids = request.esp_ids
    else:
        esps = await manager.list_mock_esps()
        esp_ids = [esp.esp_id for esp in esps]
    
    # Start auto-heartbeat on each ESP (simulating activity)
    interval_seconds = request.interval_ms / 1000
    
    active_count = 0
    for esp_id in esp_ids:
        success = await manager.set_auto_heartbeat(
            esp_id, 
            enabled=True, 
            interval_seconds=int(interval_seconds)
        )
        if success:
            active_count += 1
    
    logger.info(
        f"Admin {current_user.username} started simulation on {active_count} ESPs "
        f"(interval={request.interval_ms}ms, duration={request.duration_seconds}s)"
    )
    
    return SimulationResponse(
        success=True,
        message=f"Started simulation on {active_count} mock ESPs",
        active_simulations=active_count
    )


@router.post(
    "/load-test/stop",
    response_model=SimulationResponse,
    summary="Stop Simulation",
    description="Stop all sensor simulations."
)
async def stop_simulation(
    current_user: AdminUser,
    manager: MockESPManager = Depends(get_mock_esp_manager)
) -> SimulationResponse:
    """Stop all active simulations."""
    esps = await manager.list_mock_esps()
    stopped_count = 0
    
    for esp in esps:
        success = await manager.set_auto_heartbeat(esp.esp_id, enabled=False)
        if success:
            stopped_count += 1
    
    logger.info(f"Admin {current_user.username} stopped simulation on {stopped_count} ESPs")
    
    return SimulationResponse(
        success=True,
        message=f"Stopped simulation on {stopped_count} mock ESPs",
        active_simulations=0
    )


@router.get(
    "/load-test/metrics",
    response_model=MetricsResponse,
    summary="Get Load Test Metrics",
    description="Get performance metrics for load testing."
)
async def get_load_test_metrics(
    current_user: AdminUser,
    manager: MockESPManager = Depends(get_mock_esp_manager)
) -> MetricsResponse:
    """Get load test performance metrics."""
    esps = await manager.list_mock_esps()
    
    total_sensors = sum(len(esp.sensors) for esp in esps)
    total_actuators = sum(len(esp.actuators) for esp in esps)
    
    # Count total messages (sum from all ESPs)
    total_messages = 0
    for esp in esps:
        messages = await manager.get_published_messages(esp.esp_id, limit=10000)
        total_messages += len(messages)
    
    # Calculate uptime (time since first ESP was created)
    uptime_seconds = 0.0
    if esps:
        oldest = min(esp.created_at for esp in esps)
        uptime_seconds = (datetime.now(timezone.utc) - oldest).total_seconds()
    
    return MetricsResponse(
        success=True,
        mock_esp_count=len(esps),
        total_sensors=total_sensors,
        total_actuators=total_actuators,
        messages_published=total_messages,
        uptime_seconds=uptime_seconds
    )


# =============================================================================
# Cleanup Operations
# =============================================================================

class CleanupResponse(BaseModel):
    """Response for cleanup operations."""
    success: bool = True
    deleted_count: int
    deleted_ids: List[str]
    message: str


@router.delete(
    "/cleanup/orphaned-mocks",
    response_model=CleanupResponse,
    summary="Cleanup Orphaned Mock ESPs",
    description="Delete mock ESP entries from database that are not in the in-memory manager."
)
async def cleanup_orphaned_mocks(
    current_user: AdminUser,
    db: DBSession,
    manager: MockESPManager = Depends(get_mock_esp_manager)
) -> CleanupResponse:
    """
    Clean up orphaned mock ESP entries from the database.

    This removes database entries for mock ESPs that:
    - Have device_id matching 'ESP_MOCK_%'
    - Are not currently active in the in-memory MockESPManager
    - Or have NULL values for required fields (ip_address, mac_address, etc.)
    """
    deleted_ids = []

    # Get all mock ESPs from database
    result = await db.execute(
        text("SELECT id, device_id, ip_address, mac_address, firmware_version FROM esp_devices WHERE device_id LIKE 'ESP_MOCK_%'")
    )
    mock_esps = result.fetchall()

    # Get active mock ESPs from manager
    active_mocks = await manager.list_mock_esps()
    active_ids = {mock.esp_id for mock in active_mocks}

    for esp in mock_esps:
        esp_id = esp[1]  # device_id
        ip_address = esp[2]
        mac_address = esp[3]
        firmware_version = esp[4]

        # Delete if:
        # 1. Not in active mocks, OR
        # 2. Has NULL required fields (orphaned from before fix)
        should_delete = (
            esp_id not in active_ids or
            ip_address is None or
            mac_address is None or
            firmware_version is None
        )

        if should_delete:
            await db.execute(
                text("DELETE FROM esp_devices WHERE id = :id"),
                {"id": str(esp[0])}
            )
            deleted_ids.append(esp_id)

    if deleted_ids:
        await db.commit()
        logger.info(f"Admin {current_user.username} cleaned up {len(deleted_ids)} orphaned mock ESPs: {deleted_ids}")

    return CleanupResponse(
        success=True,
        deleted_count=len(deleted_ids),
        deleted_ids=deleted_ids,
        message=f"Cleaned up {len(deleted_ids)} orphaned mock ESP entries from database"
    )


class TestDataCleanupResponse(BaseModel):
    """Response for test data cleanup operations."""
    success: bool = True
    dry_run: bool
    sensor_data: Dict[str, Any]
    actuator_data: Dict[str, Any]
    total_deleted: int
    message: str


@router.delete(
    "/test-data/cleanup",
    response_model=TestDataCleanupResponse,
    summary="Cleanup Test Data",
    description="Delete test/mock/simulation data from sensor_data and actuator_history tables."
)
async def cleanup_test_data(
    current_user: AdminUser,
    db: DBSession,
    dry_run: bool = Query(default=True, description="Preview deletions without actually deleting"),
    include_mock: bool = Query(default=True, description="Include MOCK data in cleanup"),
    include_simulation: bool = Query(default=True, description="Include SIMULATION data in cleanup")
) -> TestDataCleanupResponse:
    """
    Clean up test data from the database.

    This deletes sensor_data and actuator_history entries based on their data_source:
    - TEST: Always included, retention = 24 hours
    - MOCK: Optional (include_mock), retention = 7 days
    - SIMULATION: Optional (include_simulation), retention = 30 days
    - PRODUCTION: Never deleted

    Use dry_run=true (default) to preview what would be deleted without actually deleting.
    """
    retention_service = AuditRetentionService(db)

    try:
        result = await retention_service.run_full_test_cleanup(
            dry_run=dry_run,
            include_mock=include_mock,
            include_simulation=include_simulation
        )

        # Service returns "total_deleted" in sub-dicts, not "deleted_count"
        total_deleted = result.get("total_deleted", 0)

        action = "Would delete" if dry_run else "Deleted"
        logger.info(
            f"Admin {current_user.username} ran test data cleanup "
            f"(dry_run={dry_run}, mock={include_mock}, sim={include_simulation}): "
            f"{total_deleted} records affected"
        )

        # Map service result keys to API response format
        sensor_result = result.get("sensor_data", {})
        actuator_result = result.get("actuator_history", {})

        return TestDataCleanupResponse(
            success=True,
            dry_run=dry_run,
            sensor_data={
                "deleted_count": sensor_result.get("total_deleted", 0),
                "deleted_by_source": sensor_result.get("deleted", {}),
                "duration_ms": sensor_result.get("duration_ms", 0),
                "errors": sensor_result.get("errors", []),
            },
            actuator_data={
                "deleted_count": actuator_result.get("total_deleted", 0),
                "deleted_by_source": actuator_result.get("deleted", {}),
                "duration_ms": actuator_result.get("duration_ms", 0),
                "errors": actuator_result.get("errors", []),
            },
            total_deleted=total_deleted,
            message=f"{action} {total_deleted} test data records"
        )

    except Exception as e:
        logger.error(f"Error during test data cleanup: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to cleanup test data: {str(e)}"
        )


# =============================================================================
# Library Management Endpoints
# =============================================================================

class LibraryReloadResponse(BaseModel):
    """Response for library reload operations."""
    success: bool = True
    processors_before: int
    processors_after: int
    available_types: List[str]
    message: str


@router.post(
    "/libraries/reload",
    response_model=LibraryReloadResponse,
    summary="Reload Sensor Libraries",
    description="Hot-reload sensor processing libraries without server restart."
)
async def reload_sensor_libraries(
    current_user: AdminUser,
) -> LibraryReloadResponse:
    """
    Reload all sensor processing libraries.

    This is useful when:
    - New sensor libraries are added to sensor_libraries/active/
    - Existing libraries are modified
    - Libraries need to be refreshed without server restart

    Returns the count of processors before and after reload.
    """
    from ...sensors.library_loader import LibraryLoader

    loader = LibraryLoader.get_instance()

    # Count before reload
    processors_before = len(loader.processors)

    # Reload libraries
    loader.reload_libraries()

    # Count after reload
    processors_after = len(loader.processors)
    available_types = loader.get_available_sensors()

    logger.info(
        f"Admin {current_user.username} reloaded sensor libraries: "
        f"{processors_before} → {processors_after} processors"
    )

    return LibraryReloadResponse(
        success=True,
        processors_before=processors_before,
        processors_after=processors_after,
        available_types=available_types,
        message=f"Reloaded sensor libraries: {processors_after} processors available"
    )


class LibraryInfoResponse(BaseModel):
    """Response for library info."""
    available_types: List[str]
    count: int
    library_path: str


@router.get(
    "/libraries/info",
    response_model=LibraryInfoResponse,
    summary="Get Library Info",
    description="Get information about loaded sensor processing libraries."
)
async def get_library_info(
    current_user: AdminUser,
) -> LibraryInfoResponse:
    """
    Get information about loaded sensor processing libraries.

    Returns list of available sensor types and library path.
    """
    from ...sensors.library_loader import LibraryLoader

    loader = LibraryLoader.get_instance()
    available_types = loader.get_available_sensors()

    return LibraryInfoResponse(
        available_types=available_types,
        count=len(available_types),
        library_path=str(loader.library_path)
    )


# =============================================================================
# Mock ESP Sync Status Endpoints
# =============================================================================

class MockESPSyncStatusResponse(BaseModel):
    """Response for Mock ESP sync status."""
    in_memory_count: int
    in_database_count: int
    synced_count: int
    orphaned_count: int
    orphaned_ids: List[str]
    memory_only_ids: List[str]
    is_synced: bool
    message: str


@router.get(
    "/mock-esp/sync-status",
    response_model=MockESPSyncStatusResponse,
    summary="Get Mock ESP Sync Status",
    description="Check synchronization between in-memory Mock ESPs and database entries."
)
async def get_mock_esp_sync_status(
    current_user: AdminUser,
    db: DBSession,
) -> MockESPSyncStatusResponse:
    """
    Get synchronization status between in-memory Mock ESPs and database.

    This helps identify:
    - Orphaned database entries (Mock ESPs from previous server runs)
    - Memory-only Mock ESPs (unlikely, indicates a bug)

    Returns sync status with details about discrepancies.
    """
    from ...db.repositories import ESPRepository

    manager = await MockESPManager.get_instance()
    esp_repo = ESPRepository(db)

    # Get all Mock ESPs from database
    db_mock_esps = await esp_repo.get_by_hardware_type("MOCK_ESP32")
    db_mock_ids = [esp.device_id for esp in db_mock_esps]

    # Get sync status
    sync_status = manager.get_sync_status(db_mock_ids)

    if sync_status["is_synced"]:
        message = "All Mock ESPs are synchronized between memory and database."
    else:
        parts = []
        if sync_status["orphaned_count"] > 0:
            parts.append(f"{sync_status['orphaned_count']} orphaned DB entries")
        if len(sync_status["memory_only_ids"]) > 0:
            parts.append(f"{len(sync_status['memory_only_ids'])} memory-only entries")
        message = f"Sync issues detected: {', '.join(parts)}"

    return MockESPSyncStatusResponse(
        **sync_status,
        message=message
    )


class DataSourceDetectionRequest(BaseModel):
    """Request for data source detection test."""
    esp_id: str
    hardware_type: Optional[str] = None
    capabilities_mock: Optional[bool] = None
    payload_test_mode: Optional[bool] = None
    payload_source: Optional[str] = None


class DataSourceDetectionResponse(BaseModel):
    """Response for data source detection test."""
    esp_id: str
    detected_source: str
    detection_reason: str
    checks_performed: List[Dict[str, Any]]


@router.post(
    "/data-source/detect",
    response_model=DataSourceDetectionResponse,
    summary="Test Data Source Detection",
    description="Test data source detection logic with custom parameters."
)
async def test_data_source_detection(
    request: DataSourceDetectionRequest,
    current_user: AdminUser,
) -> DataSourceDetectionResponse:
    """
    Test the data source detection logic.

    This endpoint simulates the detection logic with custom parameters
    to help debug data source classification issues.

    Returns the detected source and which check triggered the detection.
    """
    from ...db.models.enums import DataSource

    esp_id = request.esp_id
    checks = []
    detected_source = None
    detection_reason = None

    # Build mock payload
    payload = {"esp_id": esp_id}
    if request.payload_test_mode:
        payload["_test_mode"] = True
    if request.payload_source:
        payload["_source"] = request.payload_source

    # Check 1: _test_mode
    checks.append({
        "priority": 1,
        "check": "payload._test_mode",
        "value": payload.get("_test_mode"),
        "matched": bool(payload.get("_test_mode")),
    })
    if payload.get("_test_mode") and detected_source is None:
        detected_source = DataSource.TEST.value
        detection_reason = "payload._test_mode=True"

    # Check 2: _source
    checks.append({
        "priority": 2,
        "check": "payload._source",
        "value": payload.get("_source"),
        "matched": "_source" in payload and detected_source is None,
    })
    if "_source" in payload and detected_source is None:
        try:
            detected_source = DataSource(payload["_source"].lower()).value
            detection_reason = f"payload._source='{payload['_source']}'"
        except ValueError:
            pass

    # Check 3: hardware_type
    checks.append({
        "priority": 3,
        "check": "hardware_type='MOCK_ESP32'",
        "value": request.hardware_type,
        "matched": request.hardware_type == "MOCK_ESP32" and detected_source is None,
    })
    if request.hardware_type == "MOCK_ESP32" and detected_source is None:
        detected_source = DataSource.MOCK.value
        detection_reason = "hardware_type='MOCK_ESP32'"

    # Check 4: capabilities.mock
    checks.append({
        "priority": 4,
        "check": "capabilities.mock=True",
        "value": request.capabilities_mock,
        "matched": request.capabilities_mock is True and detected_source is None,
    })
    if request.capabilities_mock is True and detected_source is None:
        detected_source = DataSource.MOCK.value
        detection_reason = "capabilities.mock=True"

    # Check 5-7: ESP ID prefix
    prefixes = [
        (5, "MOCK_", DataSource.MOCK.value),
        (6, "TEST_", DataSource.TEST.value),
        (7, "SIM_", DataSource.SIMULATION.value),
    ]
    for priority, prefix, source in prefixes:
        matched = esp_id.startswith(prefix) and detected_source is None
        checks.append({
            "priority": priority,
            "check": f"esp_id.startswith('{prefix}')",
            "value": esp_id,
            "matched": matched,
        })
        if matched:
            detected_source = source
            detection_reason = f"esp_id prefix '{prefix}'"

    # Default
    if detected_source is None:
        detected_source = DataSource.PRODUCTION.value
        detection_reason = "default (no matching criteria)"

    checks.append({
        "priority": 8,
        "check": "default",
        "value": None,
        "matched": detection_reason == "default (no matching criteria)",
    })

    return DataSourceDetectionResponse(
        esp_id=esp_id,
        detected_source=detected_source,
        detection_reason=detection_reason,
        checks_performed=checks
    )
