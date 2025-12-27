"""
Audit Log API: System Event Monitoring and Retention Management

Provides endpoints for:
- Viewing audit logs with filters
- Managing retention policies
- Running manual cleanup
- Dashboard statistics

Phase: Runtime Config Flow Implementation
Priority: MEDIUM
Status: IMPLEMENTED
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from ...core.logging_config import get_logger
from ...db.models.audit_log import AuditEventType, AuditSeverity, AuditSourceType
from ...db.repositories.audit_log_repo import AuditLogRepository
from ...services.audit_retention_service import AuditRetentionService
from ..deps import ActiveUser, AdminUser, DBSession

logger = get_logger(__name__)

router = APIRouter(prefix="/v1/audit", tags=["Audit Logs"])


# =============================================================================
# Request/Response Models
# =============================================================================


class AuditLogResponse(BaseModel):
    """Audit log entry response."""
    
    id: str
    event_type: str
    severity: str
    source_type: str
    source_id: Optional[str]
    status: str
    message: Optional[str]
    details: Dict[str, Any]
    error_code: Optional[str]
    error_description: Optional[str]
    ip_address: Optional[str]
    correlation_id: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    """Paginated audit log list response."""
    
    data: List[AuditLogResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class RetentionConfigResponse(BaseModel):
    """Retention configuration response."""
    
    enabled: bool
    default_days: int
    severity_days: Dict[str, int]
    max_records: int
    batch_size: int
    preserve_emergency_stops: bool
    last_cleanup: Optional[str]


class RetentionConfigUpdate(BaseModel):
    """Retention configuration update request."""
    
    enabled: Optional[bool] = None
    default_days: Optional[int] = Field(None, ge=1, le=3650)
    severity_days: Optional[Dict[str, int]] = None
    max_records: Optional[int] = Field(None, ge=0)
    batch_size: Optional[int] = Field(None, ge=100, le=10000)
    preserve_emergency_stops: Optional[bool] = None


class CleanupResponse(BaseModel):
    """Cleanup operation response."""
    
    deleted_count: int
    deleted_by_severity: Dict[str, int]
    duration_ms: int
    dry_run: bool
    errors: List[str] = []


class AuditStatisticsResponse(BaseModel):
    """Audit statistics response."""
    
    total_count: int
    count_by_severity: Dict[str, int]
    count_by_event_type: Dict[str, int]
    oldest_entry: Optional[str]
    newest_entry: Optional[str]
    storage_estimate_mb: float
    pending_cleanup_count: int
    pending_cleanup_by_severity: Dict[str, int]
    retention_config: RetentionConfigResponse


class EventTypeInfo(BaseModel):
    """Event type information."""
    
    value: str
    description: str
    category: str


class SeverityInfo(BaseModel):
    """Severity level information."""
    
    value: str
    description: str
    color: str


# =============================================================================
# Audit Log Viewing Endpoints
# =============================================================================


@router.get(
    "",
    response_model=AuditLogListResponse,
    summary="List audit logs",
    description="Get paginated list of audit logs with optional filters.",
)
async def list_audit_logs(
    db: DBSession,
    current_user: ActiveUser,
    # Filters
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    severity: Optional[str] = Query(None, description="Filter by severity"),
    source_type: Optional[str] = Query(None, description="Filter by source type"),
    source_id: Optional[str] = Query(None, description="Filter by source ID"),
    status: Optional[str] = Query(None, description="Filter by status"),
    error_code: Optional[str] = Query(None, description="Filter by error code"),
    # Time range
    start_time: Optional[datetime] = Query(None, description="Start of time range"),
    end_time: Optional[datetime] = Query(None, description="End of time range"),
    hours: Optional[int] = Query(None, ge=1, le=720, description="Last N hours"),
    # Pagination
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=500, description="Items per page"),
) -> AuditLogListResponse:
    """
    List audit logs with filters.
    
    Supports filtering by:
    - event_type: Type of event (config_response, emergency_stop, etc.)
    - severity: Event severity (info, warning, error, critical)
    - source_type: Source of event (esp32, user, system, api, mqtt)
    - source_id: Specific source identifier
    - status: Event status (success, failed, pending)
    - error_code: Specific error code
    - Time range: start_time/end_time or last N hours
    """
    from sqlalchemy import and_, desc, select, func
    from ...db.models.audit_log import AuditLog
    
    # Build filter conditions
    conditions = []
    
    if event_type:
        conditions.append(AuditLog.event_type == event_type)
    if severity:
        conditions.append(AuditLog.severity == severity)
    if source_type:
        conditions.append(AuditLog.source_type == source_type)
    if source_id:
        conditions.append(AuditLog.source_id == source_id)
    if status:
        conditions.append(AuditLog.status == status)
    if error_code:
        conditions.append(AuditLog.error_code == error_code)
    
    # Time range
    if hours:
        start_time = datetime.now(timezone.utc) - timedelta(hours=hours)
    if start_time:
        conditions.append(AuditLog.created_at >= start_time)
    if end_time:
        conditions.append(AuditLog.created_at <= end_time)
    
    # Count total
    count_stmt = select(func.count(AuditLog.id))
    if conditions:
        count_stmt = count_stmt.where(and_(*conditions))
    count_result = await db.execute(count_stmt)
    total = count_result.scalar_one()
    
    # Get paginated data
    offset = (page - 1) * page_size
    data_stmt = (
        select(AuditLog)
        .order_by(desc(AuditLog.created_at))
        .offset(offset)
        .limit(page_size)
    )
    if conditions:
        data_stmt = data_stmt.where(and_(*conditions))
    
    data_result = await db.execute(data_stmt)
    logs = list(data_result.scalars().all())
    
    # Convert to response models
    response_data = [
        AuditLogResponse(
            id=str(log.id),
            event_type=log.event_type,
            severity=log.severity,
            source_type=log.source_type,
            source_id=log.source_id,
            status=log.status,
            message=log.message,
            details=log.details or {},
            error_code=log.error_code,
            error_description=log.error_description,
            ip_address=log.ip_address,
            correlation_id=log.correlation_id,
            created_at=log.created_at,
        )
        for log in logs
    ]
    
    total_pages = (total + page_size - 1) // page_size
    
    return AuditLogListResponse(
        data=response_data,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get(
    "/errors",
    response_model=List[AuditLogResponse],
    summary="Get recent errors",
    description="Get recent error and critical events.",
)
async def get_recent_errors(
    db: DBSession,
    current_user: ActiveUser,
    hours: int = Query(24, ge=1, le=168, description="Look back hours"),
    limit: int = Query(100, ge=1, le=500, description="Maximum results"),
) -> List[AuditLogResponse]:
    """Get recent error and critical events for quick troubleshooting."""
    audit_repo = AuditLogRepository(db)
    
    start_time = datetime.now(timezone.utc) - timedelta(hours=hours)
    logs = await audit_repo.get_errors(start_time=start_time, limit=limit)
    
    return [
        AuditLogResponse(
            id=str(log.id),
            event_type=log.event_type,
            severity=log.severity,
            source_type=log.source_type,
            source_id=log.source_id,
            status=log.status,
            message=log.message,
            details=log.details or {},
            error_code=log.error_code,
            error_description=log.error_description,
            ip_address=log.ip_address,
            correlation_id=log.correlation_id,
            created_at=log.created_at,
        )
        for log in logs
    ]


@router.get(
    "/esp/{esp_id}/config-history",
    response_model=List[AuditLogResponse],
    summary="Get ESP config history",
    description="Get configuration response history for an ESP device.",
)
async def get_esp_config_history(
    esp_id: str,
    db: DBSession,
    current_user: ActiveUser,
    limit: int = Query(50, ge=1, le=200, description="Maximum results"),
) -> List[AuditLogResponse]:
    """Get config response history for specific ESP device."""
    audit_repo = AuditLogRepository(db)
    
    logs = await audit_repo.get_esp_config_history(esp_id=esp_id, limit=limit)
    
    return [
        AuditLogResponse(
            id=str(log.id),
            event_type=log.event_type,
            severity=log.severity,
            source_type=log.source_type,
            source_id=log.source_id,
            status=log.status,
            message=log.message,
            details=log.details or {},
            error_code=log.error_code,
            error_description=log.error_description,
            ip_address=log.ip_address,
            correlation_id=log.correlation_id,
            created_at=log.created_at,
        )
        for log in logs
    ]


# =============================================================================
# Statistics Endpoints
# =============================================================================


@router.get(
    "/statistics",
    response_model=AuditStatisticsResponse,
    summary="Get audit statistics",
    description="Get comprehensive audit log statistics for dashboard.",
)
async def get_audit_statistics(
    db: DBSession,
    current_user: ActiveUser,
) -> AuditStatisticsResponse:
    """Get audit log statistics including counts, storage, and pending cleanup."""
    retention_service = AuditRetentionService(db)
    stats = await retention_service.get_statistics()
    
    return AuditStatisticsResponse(
        total_count=stats["total_count"],
        count_by_severity=stats["count_by_severity"],
        count_by_event_type=stats["count_by_event_type"],
        oldest_entry=stats["oldest_entry"],
        newest_entry=stats["newest_entry"],
        storage_estimate_mb=stats["storage_estimate_mb"],
        pending_cleanup_count=stats["pending_cleanup_count"],
        pending_cleanup_by_severity=stats["pending_cleanup_by_severity"],
        retention_config=RetentionConfigResponse(**stats["retention_config"]),
    )


@router.get(
    "/error-rate",
    summary="Get error rate",
    description="Get error rate statistics for the specified period.",
)
async def get_error_rate(
    db: DBSession,
    current_user: ActiveUser,
    hours: int = Query(24, ge=1, le=168, description="Analysis period in hours"),
) -> Dict[str, Any]:
    """Get error rate statistics for monitoring dashboards."""
    audit_repo = AuditLogRepository(db)
    return await audit_repo.get_error_rate(hours=hours)


# =============================================================================
# Retention Management Endpoints (Admin Only)
# =============================================================================


@router.get(
    "/retention/config",
    response_model=RetentionConfigResponse,
    summary="Get retention config",
    description="Get current audit log retention configuration.",
)
async def get_retention_config(
    db: DBSession,
    current_user: ActiveUser,
) -> RetentionConfigResponse:
    """Get current retention policy configuration."""
    retention_service = AuditRetentionService(db)
    config = await retention_service.get_config()
    return RetentionConfigResponse(**config)


@router.put(
    "/retention/config",
    response_model=RetentionConfigResponse,
    summary="Update retention config",
    description="Update audit log retention configuration. Admin only.",
)
async def update_retention_config(
    config: RetentionConfigUpdate,
    db: DBSession,
    current_user: AdminUser,
) -> RetentionConfigResponse:
    """
    Update retention policy configuration.
    
    Only provided fields are updated. Requires admin privileges.
    """
    retention_service = AuditRetentionService(db)
    
    try:
        updated = await retention_service.set_config(
            enabled=config.enabled,
            default_days=config.default_days,
            severity_days=config.severity_days,
            max_records=config.max_records,
            batch_size=config.batch_size,
            preserve_emergency_stops=config.preserve_emergency_stops,
        )
        await db.commit()
        return RetentionConfigResponse(**updated)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post(
    "/retention/cleanup",
    response_model=CleanupResponse,
    summary="Run retention cleanup",
    description="Manually trigger retention cleanup. Admin only.",
)
async def run_retention_cleanup(
    db: DBSession,
    current_user: AdminUser,
    dry_run: bool = Query(False, description="Simulate without deleting"),
) -> CleanupResponse:
    """
    Manually trigger audit log cleanup.
    
    Use dry_run=true to see what would be deleted without actually deleting.
    Requires admin privileges.
    """
    retention_service = AuditRetentionService(db)
    
    try:
        result = await retention_service.cleanup(dry_run=dry_run)
        if not dry_run:
            await db.commit()
        return CleanupResponse(**result)
    except Exception as e:
        logger.error(f"Cleanup failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Cleanup failed: {str(e)}",
        )


# =============================================================================
# Reference Data Endpoints
# =============================================================================


@router.get(
    "/event-types",
    response_model=List[EventTypeInfo],
    summary="List event types",
    description="Get list of all audit event types with descriptions.",
)
async def list_event_types() -> List[EventTypeInfo]:
    """Get all available event types with descriptions for UI dropdowns."""
    event_types = [
        EventTypeInfo(
            value=AuditEventType.CONFIG_RESPONSE,
            description="Configuration response from ESP32",
            category="Config",
        ),
        EventTypeInfo(
            value=AuditEventType.CONFIG_PUBLISHED,
            description="Configuration published to ESP32",
            category="Config",
        ),
        EventTypeInfo(
            value=AuditEventType.CONFIG_FAILED,
            description="Configuration delivery failed",
            category="Config",
        ),
        EventTypeInfo(
            value=AuditEventType.LOGIN_SUCCESS,
            description="Successful user login",
            category="Auth",
        ),
        EventTypeInfo(
            value=AuditEventType.LOGIN_FAILED,
            description="Failed login attempt",
            category="Auth",
        ),
        EventTypeInfo(
            value=AuditEventType.LOGOUT,
            description="User logout",
            category="Auth",
        ),
        EventTypeInfo(
            value=AuditEventType.TOKEN_REVOKED,
            description="Authentication token revoked",
            category="Auth",
        ),
        EventTypeInfo(
            value=AuditEventType.PERMISSION_DENIED,
            description="Access permission denied",
            category="Security",
        ),
        EventTypeInfo(
            value=AuditEventType.API_KEY_INVALID,
            description="Invalid API key used",
            category="Security",
        ),
        EventTypeInfo(
            value=AuditEventType.RATE_LIMIT_EXCEEDED,
            description="Rate limit exceeded",
            category="Security",
        ),
        EventTypeInfo(
            value=AuditEventType.EMERGENCY_STOP,
            description="Emergency stop triggered",
            category="Operations",
        ),
        EventTypeInfo(
            value=AuditEventType.SERVICE_START,
            description="Service started",
            category="Operations",
        ),
        EventTypeInfo(
            value=AuditEventType.SERVICE_STOP,
            description="Service stopped",
            category="Operations",
        ),
        EventTypeInfo(
            value=AuditEventType.DEVICE_REGISTERED,
            description="New device registered",
            category="Operations",
        ),
        EventTypeInfo(
            value=AuditEventType.DEVICE_OFFLINE,
            description="Device went offline",
            category="Operations",
        ),
        EventTypeInfo(
            value=AuditEventType.MQTT_ERROR,
            description="MQTT communication error",
            category="Errors",
        ),
        EventTypeInfo(
            value=AuditEventType.DATABASE_ERROR,
            description="Database operation error",
            category="Errors",
        ),
        EventTypeInfo(
            value=AuditEventType.VALIDATION_ERROR,
            description="Data validation error",
            category="Errors",
        ),
    ]
    return event_types


@router.get(
    "/severities",
    response_model=List[SeverityInfo],
    summary="List severities",
    description="Get list of all severity levels with descriptions.",
)
async def list_severities() -> List[SeverityInfo]:
    """Get all severity levels with descriptions and colors for UI."""
    return [
        SeverityInfo(
            value=AuditSeverity.INFO,
            description="Informational event",
            color="#3b82f6",  # Blue
        ),
        SeverityInfo(
            value=AuditSeverity.WARNING,
            description="Warning condition",
            color="#f59e0b",  # Amber
        ),
        SeverityInfo(
            value=AuditSeverity.ERROR,
            description="Error condition",
            color="#ef4444",  # Red
        ),
        SeverityInfo(
            value=AuditSeverity.CRITICAL,
            description="Critical system event",
            color="#dc2626",  # Dark Red
        ),
    ]


@router.get(
    "/source-types",
    response_model=List[str],
    summary="List source types",
    description="Get list of all source types.",
)
async def list_source_types() -> List[str]:
    """Get all source types for UI dropdowns."""
    return [
        AuditSourceType.ESP32,
        AuditSourceType.USER,
        AuditSourceType.SYSTEM,
        AuditSourceType.API,
        AuditSourceType.MQTT,
        AuditSourceType.SCHEDULER,
    ]









