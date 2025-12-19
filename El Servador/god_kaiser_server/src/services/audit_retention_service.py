"""
Audit Log Retention Service

Manages automatic cleanup of old audit logs based on configurable policies.
Designed for industrial-grade systems with flexible retention rules.

Features:
- Configurable retention periods per severity level
- Batch deletion for performance (small and large systems)
- Statistics and reporting
- Frontend-controllable via SystemConfig

Configuration Keys (stored in SystemConfig):
- audit_retention.enabled: bool - Enable/disable auto-cleanup
- audit_retention.default_days: int - Default retention period in days
- audit_retention.severity_days: dict - Per-severity retention {critical: 365, error: 90, ...}
- audit_retention.max_records: int - Maximum records to keep (0 = unlimited)
- audit_retention.batch_size: int - Records to delete per batch operation
- audit_retention.last_cleanup: datetime - Last cleanup timestamp

Phase: Runtime Config Flow Implementation
Priority: MEDIUM
Status: IMPLEMENTED
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from sqlalchemy import and_, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.logging_config import get_logger
from ..db.models.audit_log import AuditLog, AuditSeverity
from ..db.repositories.system_config_repo import SystemConfigRepository

logger = get_logger(__name__)


# Default retention configuration
DEFAULT_RETENTION_CONFIG = {
    "enabled": True,
    "default_days": 30,
    "severity_days": {
        AuditSeverity.INFO: 14,
        AuditSeverity.WARNING: 30,
        AuditSeverity.ERROR: 90,
        AuditSeverity.CRITICAL: 365,
    },
    "max_records": 0,  # 0 = unlimited, useful for small systems
    "batch_size": 1000,  # Records per deletion batch
    "preserve_emergency_stops": True,  # Never delete emergency stop events
}


class AuditRetentionService:
    """
    Service for managing audit log retention.
    
    Provides:
    - Configurable retention policies
    - Batch cleanup operations
    - Statistics and reporting
    - Integration with SystemConfig for frontend control
    
    Usage:
        service = AuditRetentionService(db)
        
        # Get current config
        config = await service.get_config()
        
        # Update config from frontend
        await service.set_config(default_days=60, severity_days={...})
        
        # Run cleanup
        result = await service.cleanup()
        
        # Get statistics
        stats = await service.get_statistics()
    """
    
    CONFIG_KEY_PREFIX = "audit_retention"
    
    def __init__(self, session: AsyncSession):
        """
        Initialize AuditRetentionService.
        
        Args:
            session: Async database session
        """
        self.session = session
        self.config_repo = SystemConfigRepository(session)
    
    # =========================================================================
    # Configuration Management
    # =========================================================================
    
    async def get_config(self) -> Dict[str, Any]:
        """
        Get current retention configuration.
        
        Returns config from SystemConfig, falling back to defaults
        for any missing values.
        
        Returns:
            Dict with retention configuration
        """
        config = dict(DEFAULT_RETENTION_CONFIG)
        
        # Load from SystemConfig
        stored_config = await self.config_repo.get_by_key(f"{self.CONFIG_KEY_PREFIX}.config")
        
        if stored_config and isinstance(stored_config.config_value, dict):
            # Merge stored config with defaults
            stored = stored_config.config_value
            config["enabled"] = stored.get("enabled", config["enabled"])
            config["default_days"] = stored.get("default_days", config["default_days"])
            config["max_records"] = stored.get("max_records", config["max_records"])
            config["batch_size"] = stored.get("batch_size", config["batch_size"])
            config["preserve_emergency_stops"] = stored.get(
                "preserve_emergency_stops", config["preserve_emergency_stops"]
            )
            
            # Merge severity days
            if "severity_days" in stored:
                config["severity_days"].update(stored["severity_days"])
        
        # Load last cleanup timestamp
        last_cleanup = await self.config_repo.get_by_key(f"{self.CONFIG_KEY_PREFIX}.last_cleanup")
        if last_cleanup:
            config["last_cleanup"] = last_cleanup.config_value
        else:
            config["last_cleanup"] = None
        
        return config
    
    async def set_config(
        self,
        enabled: Optional[bool] = None,
        default_days: Optional[int] = None,
        severity_days: Optional[Dict[str, int]] = None,
        max_records: Optional[int] = None,
        batch_size: Optional[int] = None,
        preserve_emergency_stops: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """
        Update retention configuration.
        
        Only provided values are updated; others remain unchanged.
        Validates input before saving.
        
        Args:
            enabled: Enable/disable auto-cleanup
            default_days: Default retention period (days)
            severity_days: Per-severity retention periods
            max_records: Maximum records to keep (0 = unlimited)
            batch_size: Records per deletion batch
            preserve_emergency_stops: Never delete emergency stop events
            
        Returns:
            Updated configuration dict
            
        Raises:
            ValueError: If validation fails
        """
        # Load current config
        current = await self.get_config()
        
        # Apply updates with validation
        if enabled is not None:
            current["enabled"] = bool(enabled)
        
        if default_days is not None:
            if default_days < 1:
                raise ValueError("default_days must be at least 1")
            if default_days > 3650:  # ~10 years max
                raise ValueError("default_days cannot exceed 3650 (10 years)")
            current["default_days"] = default_days
        
        if severity_days is not None:
            for sev, days in severity_days.items():
                if days < 1:
                    raise ValueError(f"Retention for {sev} must be at least 1 day")
                if days > 3650:
                    raise ValueError(f"Retention for {sev} cannot exceed 3650 days")
            current["severity_days"].update(severity_days)
        
        if max_records is not None:
            if max_records < 0:
                raise ValueError("max_records cannot be negative")
            current["max_records"] = max_records
        
        if batch_size is not None:
            if batch_size < 100:
                raise ValueError("batch_size must be at least 100")
            if batch_size > 10000:
                raise ValueError("batch_size cannot exceed 10000")
            current["batch_size"] = batch_size
        
        if preserve_emergency_stops is not None:
            current["preserve_emergency_stops"] = bool(preserve_emergency_stops)
        
        # Save to SystemConfig
        await self.config_repo.set_config(
            config_key=f"{self.CONFIG_KEY_PREFIX}.config",
            config_value={
                "enabled": current["enabled"],
                "default_days": current["default_days"],
                "severity_days": current["severity_days"],
                "max_records": current["max_records"],
                "batch_size": current["batch_size"],
                "preserve_emergency_stops": current["preserve_emergency_stops"],
            },
            config_type="audit",
            description="Audit log retention policy configuration",
            is_secret=False,
        )
        
        logger.info(f"Audit retention config updated: {current}")
        return current
    
    # =========================================================================
    # Cleanup Operations
    # =========================================================================
    
    async def cleanup(
        self,
        dry_run: bool = False,
    ) -> Dict[str, Any]:
        """
        Run cleanup based on retention policy.
        
        Deletes old audit logs according to configured retention periods.
        Uses batch deletion for performance on large datasets.
        
        Args:
            dry_run: If True, calculate but don't delete
            
        Returns:
            Dict with cleanup results:
            - deleted_count: Total records deleted
            - deleted_by_severity: Count per severity level
            - duration_ms: Operation duration
            - dry_run: Whether this was a dry run
            - errors: Any errors encountered
        """
        start_time = datetime.now(timezone.utc)
        config = await self.get_config()
        
        if not config["enabled"] and not dry_run:
            return {
                "deleted_count": 0,
                "deleted_by_severity": {},
                "duration_ms": 0,
                "dry_run": dry_run,
                "skipped": True,
                "reason": "Retention cleanup is disabled",
            }
        
        results = {
            "deleted_count": 0,
            "deleted_by_severity": {},
            "duration_ms": 0,
            "dry_run": dry_run,
            "errors": [],
        }
        
        now = datetime.now(timezone.utc)
        batch_size = config["batch_size"]
        
        # Process each severity level
        for severity, retention_days in config["severity_days"].items():
            cutoff_date = now - timedelta(days=retention_days)
            
            try:
                # Build delete conditions
                conditions = [
                    AuditLog.severity == severity,
                    AuditLog.created_at < cutoff_date,
                ]
                
                # Preserve emergency stops if configured
                if config["preserve_emergency_stops"]:
                    conditions.append(AuditLog.event_type != "emergency_stop")
                
                if dry_run:
                    # Count what would be deleted
                    count_stmt = select(func.count(AuditLog.id)).where(and_(*conditions))
                    result = await self.session.execute(count_stmt)
                    count = result.scalar_one()
                else:
                    # Delete in batches
                    count = 0
                    while True:
                        # Find IDs to delete
                        id_stmt = (
                            select(AuditLog.id)
                            .where(and_(*conditions))
                            .limit(batch_size)
                        )
                        id_result = await self.session.execute(id_stmt)
                        ids_to_delete = [row[0] for row in id_result.all()]
                        
                        if not ids_to_delete:
                            break
                        
                        # Delete batch
                        delete_stmt = delete(AuditLog).where(AuditLog.id.in_(ids_to_delete))
                        await self.session.execute(delete_stmt)
                        await self.session.flush()
                        
                        count += len(ids_to_delete)
                        
                        # Safety: limit total deletions per run
                        if count >= batch_size * 10:
                            logger.warning(
                                f"Cleanup limit reached for {severity}: {count} records"
                            )
                            break
                
                if count > 0:
                    results["deleted_by_severity"][severity] = count
                    results["deleted_count"] += count
                    
            except Exception as e:
                error_msg = f"Error cleaning up {severity} logs: {str(e)}"
                results["errors"].append(error_msg)
                logger.error(error_msg)
        
        # Apply max_records limit if configured
        if config["max_records"] > 0 and not dry_run:
            try:
                total_count = await self._get_total_count()
                
                if total_count > config["max_records"]:
                    excess = total_count - config["max_records"]
                    
                    # Delete oldest records (preserving emergency stops if configured)
                    conditions = []
                    if config["preserve_emergency_stops"]:
                        conditions.append(AuditLog.event_type != "emergency_stop")
                    
                    # Get oldest IDs to delete
                    oldest_stmt = (
                        select(AuditLog.id)
                        .where(and_(*conditions) if conditions else True)
                        .order_by(AuditLog.created_at.asc())
                        .limit(min(excess, batch_size))
                    )
                    oldest_result = await self.session.execute(oldest_stmt)
                    ids_to_delete = [row[0] for row in oldest_result.all()]
                    
                    if ids_to_delete:
                        delete_stmt = delete(AuditLog).where(AuditLog.id.in_(ids_to_delete))
                        await self.session.execute(delete_stmt)
                        await self.session.flush()
                        
                        results["deleted_count"] += len(ids_to_delete)
                        results["deleted_by_max_records"] = len(ids_to_delete)
                        
            except Exception as e:
                error_msg = f"Error applying max_records limit: {str(e)}"
                results["errors"].append(error_msg)
                logger.error(error_msg)
        
        # Update last cleanup timestamp
        if not dry_run and results["deleted_count"] > 0:
            await self.config_repo.set_config(
                config_key=f"{self.CONFIG_KEY_PREFIX}.last_cleanup",
                config_value=now.isoformat(),
                config_type="audit",
                description="Last audit log cleanup timestamp",
                is_secret=False,
            )
        
        end_time = datetime.now(timezone.utc)
        results["duration_ms"] = int((end_time - start_time).total_seconds() * 1000)
        
        if not dry_run:
            logger.info(
                f"Audit cleanup completed: {results['deleted_count']} records deleted "
                f"in {results['duration_ms']}ms"
            )
        
        return results
    
    # =========================================================================
    # Statistics
    # =========================================================================
    
    async def get_statistics(self) -> Dict[str, Any]:
        """
        Get audit log statistics for dashboard display.
        
        Returns:
            Dict with statistics:
            - total_count: Total audit log entries
            - count_by_severity: Count per severity level
            - count_by_event_type: Count per event type
            - oldest_entry: Timestamp of oldest entry
            - newest_entry: Timestamp of newest entry
            - storage_estimate_mb: Estimated storage usage
            - retention_config: Current retention configuration
        """
        stats: Dict[str, Any] = {}
        
        # Total count
        stats["total_count"] = await self._get_total_count()
        
        # Count by severity
        severity_stmt = select(
            AuditLog.severity,
            func.count(AuditLog.id).label("count"),
        ).group_by(AuditLog.severity)
        severity_result = await self.session.execute(severity_stmt)
        stats["count_by_severity"] = {
            row.severity: row.count for row in severity_result.all()
        }
        
        # Count by event type (top 10)
        event_type_stmt = (
            select(
                AuditLog.event_type,
                func.count(AuditLog.id).label("count"),
            )
            .group_by(AuditLog.event_type)
            .order_by(func.count(AuditLog.id).desc())
            .limit(10)
        )
        event_type_result = await self.session.execute(event_type_stmt)
        stats["count_by_event_type"] = {
            row.event_type: row.count for row in event_type_result.all()
        }
        
        # Oldest and newest entries
        if stats["total_count"] > 0:
            oldest_stmt = select(func.min(AuditLog.created_at))
            oldest_result = await self.session.execute(oldest_stmt)
            oldest = oldest_result.scalar_one_or_none()
            stats["oldest_entry"] = oldest.isoformat() if oldest else None
            
            newest_stmt = select(func.max(AuditLog.created_at))
            newest_result = await self.session.execute(newest_stmt)
            newest = newest_result.scalar_one_or_none()
            stats["newest_entry"] = newest.isoformat() if newest else None
        else:
            stats["oldest_entry"] = None
            stats["newest_entry"] = None
        
        # Storage estimate (rough calculation: ~500 bytes per record)
        stats["storage_estimate_mb"] = round(stats["total_count"] * 500 / (1024 * 1024), 2)
        
        # Current retention config
        stats["retention_config"] = await self.get_config()
        
        # Calculate what would be deleted
        dry_run_result = await self.cleanup(dry_run=True)
        stats["pending_cleanup_count"] = dry_run_result["deleted_count"]
        stats["pending_cleanup_by_severity"] = dry_run_result.get("deleted_by_severity", {})
        
        return stats
    
    async def _get_total_count(self) -> int:
        """Get total audit log count."""
        stmt = select(func.count(AuditLog.id))
        result = await self.session.execute(stmt)
        return result.scalar_one()


