"""
Error Management API Endpoints

Provides REST endpoints for querying ESP32 error events:
- GET /esp/{esp_id} - Get error events for a specific ESP device
- GET /summary - Get error statistics across all devices
- GET /codes - Get all known error codes with descriptions

Pattern: Follows sensors.py endpoint structure
"""

from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.esp32_error_mapping import (
    ALL_ESP32_ERROR_MESSAGES,
    get_all_error_codes,
    get_error_info,
)
from ...core.logging_config import get_logger
from ...db.models.audit_log import AuditEventType, AuditLog, AuditSeverity, AuditSourceType
from ...db.repositories import AuditLogRepository, ESPRepository
from ...schemas.common import PaginationMeta
from ...schemas.error_schemas import (
    ErrorCodeCount,
    ErrorCodeInfoResponse,
    ErrorCodeListResponse,
    ErrorLogListResponse,
    ErrorLogResponse,
    ErrorSummaryResponse,
)
from ..deps import ActiveUser, DBSession

logger = get_logger(__name__)

router = APIRouter(prefix="/v1/errors", tags=["errors"])


# =============================================================================
# Helper Functions
# =============================================================================


def _audit_log_to_error_response(
    log: AuditLog,
    esp_name: Optional[str] = None
) -> ErrorLogResponse:
    """
    Convert AuditLog model to ErrorLogResponse schema.
    
    Args:
        log: AuditLog model instance
        esp_name: Optional ESP device name
        
    Returns:
        ErrorLogResponse schema
    """
    details = log.details or {}
    
    return ErrorLogResponse(
        id=log.id,
        esp_id=log.source_id,
        esp_name=esp_name,
        error_code=details.get("error_code", 0),
        severity=log.severity or "error",
        category=details.get("category"),
        message=log.message or log.error_description or "Unknown error",
        troubleshooting=details.get("troubleshooting", []),
        docs_link=details.get("docs_link"),
        user_action_required=details.get("user_action_required", False),
        recoverable=details.get("recoverable", True),
        context=details.get("context", {}),
        esp_raw_message=details.get("esp_raw_message"),
        timestamp=log.created_at,
    )


# =============================================================================
# ESP Error Events Endpoint
# =============================================================================


@router.get(
    "/esp/{esp_id}",
    response_model=ErrorLogListResponse,
    summary="Get ESP error events",
    description="Get error events for a specific ESP device with pagination and filtering",
)
async def get_esp_errors(
    esp_id: str,
    session: DBSession,
    current_user: ActiveUser,
    severity: Optional[str] = Query(
        None,
        description="Filter by severity (info, warning, error, critical)",
    ),
    category: Optional[str] = Query(
        None,
        description="Filter by category (HARDWARE, CONFIG, etc.)",
    ),
    hours: int = Query(
        24,
        ge=1,
        le=168,
        description="Time range in hours (max 168 = 7 days)",
    ),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
) -> ErrorLogListResponse:
    """
    Get error events for a specific ESP device.
    
    Retrieves MQTT error events from the audit log for the specified ESP.
    Supports filtering by severity, category, and time range.
    
    Args:
        esp_id: ESP device ID (e.g., ESP_12AB34CD)
        severity: Optional severity filter
        category: Optional category filter
        hours: Time range in hours (default 24)
        page: Page number (default 1)
        page_size: Items per page (default 20)
        
    Returns:
        Paginated list of error events
    """
    # Verify ESP exists
    esp_repo = ESPRepository(session)
    esp_device = await esp_repo.get_by_device_id(esp_id)
    if not esp_device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ESP device not found: {esp_id}",
        )
    
    # Build query conditions
    start_time = datetime.now(timezone.utc) - timedelta(hours=hours)
    conditions = [
        AuditLog.source_type == AuditSourceType.MQTT,
        AuditLog.source_id == esp_id,
        AuditLog.event_type == AuditEventType.MQTT_ERROR,
        AuditLog.created_at >= start_time,
    ]
    
    if severity:
        conditions.append(AuditLog.severity == severity.lower())
    
    # Query total count
    count_stmt = select(func.count(AuditLog.id)).where(and_(*conditions))
    count_result = await session.execute(count_stmt)
    total_count = count_result.scalar_one()
    
    # Query unacknowledged count (user_action_required == True)
    # This is stored in the details JSON, so we need a raw SQL check
    # For now, we'll count errors with severity >= warning
    unack_conditions = conditions + [
        AuditLog.severity.in_([AuditSeverity.ERROR, AuditSeverity.CRITICAL])
    ]
    unack_stmt = select(func.count(AuditLog.id)).where(and_(*unack_conditions))
    unack_result = await session.execute(unack_stmt)
    unacknowledged_count = unack_result.scalar_one()
    
    # Query error logs with pagination
    offset = (page - 1) * page_size
    logs_stmt = (
        select(AuditLog)
        .where(and_(*conditions))
        .order_by(desc(AuditLog.created_at))
        .offset(offset)
        .limit(page_size)
    )
    logs_result = await session.execute(logs_stmt)
    logs = list(logs_result.scalars().all())
    
    # Convert to response models
    error_responses = [
        _audit_log_to_error_response(log, esp_device.name)
        for log in logs
    ]
    
    # Build pagination metadata
    total_pages = (total_count + page_size - 1) // page_size if page_size > 0 else 0
    pagination = PaginationMeta(
        page=page,
        page_size=page_size,
        total_items=total_count,
        total_pages=total_pages,
        has_next=page < total_pages,
        has_prev=page > 1,
    )
    
    return ErrorLogListResponse(
        success=True,
        errors=error_responses,
        total_count=total_count,
        unacknowledged_count=unacknowledged_count,
        pagination=pagination,
    )


# =============================================================================
# Error Summary Endpoint
# =============================================================================


@router.get(
    "/summary",
    response_model=ErrorSummaryResponse,
    summary="Get error summary",
    description="Get error statistics across all ESP devices",
)
async def get_error_summary(
    session: DBSession,
    current_user: ActiveUser,
    hours: int = Query(
        24,
        ge=1,
        le=168,
        description="Time range in hours (max 168 = 7 days)",
    ),
) -> ErrorSummaryResponse:
    """
    Get error summary statistics across all ESP devices.
    
    Provides aggregated error counts by severity, category, and ESP device.
    Also includes the most frequent error codes.
    
    Args:
        hours: Time range in hours (default 24)
        
    Returns:
        Error summary with statistics
    """
    start_time = datetime.now(timezone.utc) - timedelta(hours=hours)
    
    # Base conditions for MQTT errors
    base_conditions = [
        AuditLog.source_type == AuditSourceType.MQTT,
        AuditLog.event_type == AuditEventType.MQTT_ERROR,
        AuditLog.created_at >= start_time,
    ]
    
    # Total errors count
    total_stmt = select(func.count(AuditLog.id)).where(and_(*base_conditions))
    total_result = await session.execute(total_stmt)
    total_errors = total_result.scalar_one()
    
    # Errors by severity
    severity_stmt = (
        select(AuditLog.severity, func.count(AuditLog.id).label("count"))
        .where(and_(*base_conditions))
        .group_by(AuditLog.severity)
    )
    severity_result = await session.execute(severity_stmt)
    errors_by_severity = {
        row.severity: row.count
        for row in severity_result.all()
        if row.severity
    }
    
    # Errors by ESP device
    esp_stmt = (
        select(AuditLog.source_id, func.count(AuditLog.id).label("count"))
        .where(and_(*base_conditions))
        .group_by(AuditLog.source_id)
    )
    esp_result = await session.execute(esp_stmt)
    errors_by_esp = {
        row.source_id: row.count
        for row in esp_result.all()
        if row.source_id
    }
    
    # Get all error logs to count by category and error code
    # (These are stored in the JSON details field)
    logs_stmt = select(AuditLog).where(and_(*base_conditions))
    logs_result = await session.execute(logs_stmt)
    logs = list(logs_result.scalars().all())
    
    # Count by category and error code
    errors_by_category: dict[str, int] = {}
    error_code_counts: dict[int, int] = {}
    action_required_count = 0
    
    for log in logs:
        details = log.details or {}
        
        # Count by category
        category = details.get("category")
        if category:
            errors_by_category[category] = errors_by_category.get(category, 0) + 1
        
        # Count by error code
        error_code = details.get("error_code")
        if error_code:
            error_code_counts[error_code] = error_code_counts.get(error_code, 0) + 1
        
        # Count action required
        if details.get("user_action_required"):
            action_required_count += 1
    
    # Build top error codes list
    sorted_codes = sorted(
        error_code_counts.items(),
        key=lambda x: x[1],
        reverse=True
    )[:10]  # Top 10
    
    top_error_codes = []
    all_error_messages = get_all_error_codes()
    for code, count in sorted_codes:
        message = all_error_messages.get(code, f"Unknown error code: {code}")
        top_error_codes.append(ErrorCodeCount(
            error_code=code,
            count=count,
            message=message,
        ))
    
    return ErrorSummaryResponse(
        success=True,
        period_hours=hours,
        total_errors=total_errors,
        errors_by_severity=errors_by_severity,
        errors_by_category=errors_by_category,
        errors_by_esp=errors_by_esp,
        top_error_codes=top_error_codes,
        action_required_count=action_required_count,
    )


# =============================================================================
# Error Codes Reference Endpoint
# =============================================================================


@router.get(
    "/codes",
    response_model=ErrorCodeListResponse,
    summary="Get error code reference",
    description="Get all known error codes with descriptions and troubleshooting",
)
async def get_error_codes(
    current_user: ActiveUser,
    category: Optional[str] = Query(
        None,
        description="Filter by category (HARDWARE, CONFIG, etc.)",
    ),
) -> ErrorCodeListResponse:
    """
    Get all known ESP32 error codes with their descriptions.
    
    Provides a reference list of error codes for documentation and
    frontend error code lookup.
    
    Args:
        category: Optional category filter
        
    Returns:
        List of error codes with descriptions
    """
    error_codes = []
    
    for code, info in ALL_ESP32_ERROR_MESSAGES.items():
        # Apply category filter if specified
        if category and info.get("category") != category.upper():
            continue
        
        error_codes.append(ErrorCodeInfoResponse(
            error_code=code,
            title=info.get("message_de"),
            category=info.get("category", "UNKNOWN"),
            severity=info.get("severity", "ERROR"),
            message=info.get("message_user_de", f"Error code: {code}"),
            troubleshooting=info.get("troubleshooting_de", []),
            docs_link=info.get("docs_link"),
            recoverable=info.get("recoverable", True),
            user_action_required=info.get("user_action_required", False),
        ))
    
    return ErrorCodeListResponse(
        success=True,
        error_codes=error_codes,
        total_count=len(error_codes),
    )


# =============================================================================
# Single Error Code Lookup Endpoint
# =============================================================================


@router.get(
    "/codes/{error_code}",
    response_model=ErrorCodeInfoResponse,
    summary="Get error code details",
    description="Get detailed information about a specific error code",
)
async def get_error_code_info(
    error_code: int,
    current_user: ActiveUser,
) -> ErrorCodeInfoResponse:
    """
    Get detailed information about a specific error code.
    
    Args:
        error_code: Error code to lookup (e.g., 1026)
        
    Returns:
        Error code information with troubleshooting
        
    Raises:
        HTTPException: 404 if error code not found
    """
    error_info = get_error_info(error_code)
    
    if not error_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Error code not found: {error_code}",
        )
    
    return ErrorCodeInfoResponse(
        error_code=error_code,
        title=error_info.get("message_de"),
        category=error_info.get("category", "UNKNOWN"),
        severity=error_info.get("severity", "ERROR"),
        message=error_info.get("message", f"Error code: {error_code}"),
        troubleshooting=error_info.get("troubleshooting", []),
        docs_link=error_info.get("docs_link"),
        recoverable=error_info.get("recoverable", True),
        user_action_required=error_info.get("user_action_required", False),
    )
