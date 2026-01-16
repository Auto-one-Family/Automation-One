"""
Audit Log Repository: Event Recording and Querying

Provides methods for:
- Recording audit events (config responses, errors, security events)
- Querying audit history with filters
- Aggregating event statistics

Phase: Runtime Config Flow Implementation
Priority: MEDIUM
Status: IMPLEMENTED
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.audit_log import (
    AuditEventType,
    AuditLog,
    AuditSeverity,
    AuditSourceType,
)
from .base_repo import BaseRepository


class AuditLogRepository(BaseRepository[AuditLog]):
    """
    Repository for Audit Log operations.
    
    Extends BaseRepository with audit-specific methods for recording
    and querying system events.
    
    Note: Audit logs are immutable - update and delete operations
    are intentionally restricted for compliance.
    """
    
    def __init__(self, session: AsyncSession):
        """
        Initialize repository.
        
        Args:
            session: Async database session
        """
        super().__init__(AuditLog, session)
    
    # =========================================================================
    # Event Recording Methods
    # =========================================================================
    
    async def log_config_response(
        self,
        esp_id: str,
        config_type: str,
        status: str,
        count: int = 0,
        message: Optional[str] = None,
        error_code: Optional[str] = None,
        error_description: Optional[str] = None,
        failed_item: Optional[dict] = None,
    ) -> AuditLog:
        """
        Log a configuration response from ESP32.
        
        Args:
            esp_id: ESP device ID
            config_type: Type of config (sensor, actuator, zone, system)
            status: Response status (success, error)
            count: Number of configured items
            message: Human-readable message from ESP32
            error_code: ESP32 error code (on failure)
            error_description: Human-readable error description
            failed_item: Failed config item details (on failure)
            
        Returns:
            Created AuditLog entry
        """
        severity = AuditSeverity.INFO if status == "success" else AuditSeverity.ERROR
        
        details = {
            "config_type": config_type,
            "count": count,
        }
        if message:
            details["message"] = message
        if failed_item:
            details["failed_item"] = failed_item
        
        return await self.create(
            event_type=AuditEventType.CONFIG_RESPONSE,
            severity=severity,
            source_type=AuditSourceType.ESP32,
            source_id=esp_id,
            status=status,
            message=message,
            details=details,
            error_code=error_code,
            error_description=error_description,
        )
    
    async def log_mqtt_error(
        self,
        source_id: str,
        error_code: str,
        error_description: str,
        details: Optional[dict] = None,
    ) -> AuditLog:
        """
        Log an MQTT-related error.
        
        Args:
            source_id: Source identifier (esp_id, topic, etc.)
            error_code: Error code string
            error_description: Human-readable description
            details: Additional error details
            
        Returns:
            Created AuditLog entry
        """
        return await self.create(
            event_type=AuditEventType.MQTT_ERROR,
            severity=AuditSeverity.ERROR,
            source_type=AuditSourceType.MQTT,
            source_id=source_id,
            status="failed",
            message=error_description,
            details=details or {},
            error_code=error_code,
            error_description=error_description,
        )
    
    async def log_validation_error(
        self,
        source_type: str,
        source_id: str,
        error_code: str,
        error_description: str,
        details: Optional[dict] = None,
    ) -> AuditLog:
        """
        Log a validation error.
        
        Args:
            source_type: Type of source (esp32, api, mqtt)
            source_id: Source identifier
            error_code: Error code string
            error_description: Human-readable description
            details: Validation details (field, value, etc.)
            
        Returns:
            Created AuditLog entry
        """
        return await self.create(
            event_type=AuditEventType.VALIDATION_ERROR,
            severity=AuditSeverity.WARNING,
            source_type=source_type,
            source_id=source_id,
            status="failed",
            message=error_description,
            details=details or {},
            error_code=error_code,
            error_description=error_description,
        )
    
    async def log_emergency_stop(
        self,
        user_id: str,
        username: str,
        reason: str,
        devices_stopped: int,
        actuators_stopped: int,
        details: Optional[dict] = None,
    ) -> AuditLog:
        """
        Log an emergency stop event.
        
        Args:
            user_id: User ID who triggered the stop
            username: Username who triggered the stop
            reason: Reason for emergency stop
            devices_stopped: Number of devices stopped
            actuators_stopped: Number of actuators stopped
            details: Additional stop details
            
        Returns:
            Created AuditLog entry
        """
        return await self.create(
            event_type=AuditEventType.EMERGENCY_STOP,
            severity=AuditSeverity.CRITICAL,
            source_type=AuditSourceType.USER,
            source_id=user_id,
            status="success",
            message=f"Emergency stop by {username}: {reason}",
            details={
                "username": username,
                "reason": reason,
                "devices_stopped": devices_stopped,
                "actuators_stopped": actuators_stopped,
                **(details or {}),
            },
        )
    
    async def log_device_event(
        self,
        esp_id: str,
        event_type: str,
        status: str,
        message: Optional[str] = None,
        details: Optional[dict] = None,
        severity: str = AuditSeverity.INFO,
    ) -> AuditLog:
        """
        Log a device-related event.
        
        Args:
            esp_id: ESP device ID
            event_type: Event type (device_registered, device_offline, etc.)
            status: Event status
            message: Human-readable message
            details: Additional event details
            severity: Event severity level
            
        Returns:
            Created AuditLog entry
        """
        return await self.create(
            event_type=event_type,
            severity=severity,
            source_type=AuditSourceType.ESP32,
            source_id=esp_id,
            status=status,
            message=message,
            details=details or {},
        )
    
    # =========================================================================
    # Query Methods
    # =========================================================================
    
    async def get_by_source(
        self,
        source_type: str,
        source_id: str,
        limit: int = 100,
        offset: int = 0,
    ) -> list[AuditLog]:
        """
        Get audit logs by source.
        
        Args:
            source_type: Type of source (esp32, user, system)
            source_id: Source identifier
            limit: Maximum results
            offset: Results offset
            
        Returns:
            List of AuditLog entries
        """
        stmt = (
            select(AuditLog)
            .where(
                and_(
                    AuditLog.source_type == source_type,
                    AuditLog.source_id == source_id,
                )
            )
            .order_by(desc(AuditLog.created_at))
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
    
    async def get_by_event_type(
        self,
        event_type: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[AuditLog]:
        """
        Get audit logs by event type.
        
        Args:
            event_type: Event type to filter by
            start_time: Start of time range
            end_time: End of time range
            limit: Maximum results
            offset: Results offset
            
        Returns:
            List of AuditLog entries
        """
        conditions = [AuditLog.event_type == event_type]
        
        if start_time:
            conditions.append(AuditLog.created_at >= start_time)
        if end_time:
            conditions.append(AuditLog.created_at <= end_time)
        
        stmt = (
            select(AuditLog)
            .where(and_(*conditions))
            .order_by(desc(AuditLog.created_at))
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
    
    async def get_errors(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 100,
    ) -> list[AuditLog]:
        """
        Get error and critical events.
        
        Args:
            start_time: Start of time range
            end_time: End of time range
            limit: Maximum results
            
        Returns:
            List of error AuditLog entries
        """
        conditions = [
            AuditLog.severity.in_([AuditSeverity.ERROR, AuditSeverity.CRITICAL])
        ]
        
        if start_time:
            conditions.append(AuditLog.created_at >= start_time)
        if end_time:
            conditions.append(AuditLog.created_at <= end_time)
        
        stmt = (
            select(AuditLog)
            .where(and_(*conditions))
            .order_by(desc(AuditLog.created_at))
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
    
    async def get_esp_config_history(
        self,
        esp_id: str,
        limit: int = 50,
    ) -> list[AuditLog]:
        """
        Get config response history for an ESP device.
        
        Args:
            esp_id: ESP device ID
            limit: Maximum results
            
        Returns:
            List of config response AuditLog entries
        """
        stmt = (
            select(AuditLog)
            .where(
                and_(
                    AuditLog.source_type == AuditSourceType.ESP32,
                    AuditLog.source_id == esp_id,
                    AuditLog.event_type == AuditEventType.CONFIG_RESPONSE,
                )
            )
            .order_by(desc(AuditLog.created_at))
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
    
    # =========================================================================
    # Statistics Methods
    # =========================================================================
    
    async def get_event_counts(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
    ) -> dict[str, int]:
        """
        Get event counts by type.
        
        Args:
            start_time: Start of time range
            end_time: End of time range
            
        Returns:
            Dict mapping event_type to count
        """
        conditions = []
        if start_time:
            conditions.append(AuditLog.created_at >= start_time)
        if end_time:
            conditions.append(AuditLog.created_at <= end_time)
        
        stmt = select(
            AuditLog.event_type,
            func.count(AuditLog.id).label("count"),
        ).group_by(AuditLog.event_type)
        
        if conditions:
            stmt = stmt.where(and_(*conditions))
        
        result = await self.session.execute(stmt)
        return {row.event_type: row.count for row in result.all()}
    
    async def get_error_rate(
        self,
        hours: int = 24,
    ) -> dict[str, Any]:
        """
        Get error rate statistics for the last N hours.
        
        Args:
            hours: Number of hours to analyze
            
        Returns:
            Dict with error rate statistics
        """
        start_time = datetime.now(timezone.utc) - timedelta(hours=hours)
        
        # Total events
        total_stmt = select(func.count(AuditLog.id)).where(
            AuditLog.created_at >= start_time
        )
        total_result = await self.session.execute(total_stmt)
        total_count = total_result.scalar_one()
        
        # Error events
        error_stmt = select(func.count(AuditLog.id)).where(
            and_(
                AuditLog.created_at >= start_time,
                AuditLog.severity.in_([AuditSeverity.ERROR, AuditSeverity.CRITICAL]),
            )
        )
        error_result = await self.session.execute(error_stmt)
        error_count = error_result.scalar_one()
        
        error_rate = (error_count / total_count * 100) if total_count > 0 else 0.0
        
        return {
            "period_hours": hours,
            "total_events": total_count,
            "error_events": error_count,
            "error_rate_percent": round(error_rate, 2),
        }


















