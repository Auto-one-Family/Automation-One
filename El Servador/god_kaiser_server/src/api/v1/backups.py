"""
Database Backup REST API Endpoints (Phase A V5.1)

Provides admin-only endpoints for PostgreSQL backup management:
- POST   /v1/backups/database/create        - Trigger immediate backup
- GET    /v1/backups/database/list           - List all backups
- GET    /v1/backups/database/{id}/download  - Download backup file
- DELETE /v1/backups/database/{id}           - Delete single backup
- POST   /v1/backups/database/{id}/restore   - Restore from backup (confirm required)
"""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional

from ...core.logging_config import get_logger
from ...services.database_backup_service import get_database_backup_service
from ..deps import AdminUser

logger = get_logger(__name__)

router = APIRouter(prefix="/v1/backups", tags=["backups"])


# --- Response Models ---


class BackupInfoResponse(BaseModel):
    backup_id: str
    filename: str
    created_at: str
    size_bytes: int
    size_human: str
    pg_version: Optional[str] = None
    database: Optional[str] = None
    duration_seconds: Optional[float] = None


class BackupListResponse(BaseModel):
    status: str = "success"
    count: int
    backups: List[BackupInfoResponse]


class BackupCreateResponse(BaseModel):
    status: str = "success"
    message: str
    backup: BackupInfoResponse


class BackupDeleteResponse(BaseModel):
    status: str = "success"
    message: str
    backup_id: str


class BackupRestoreResponse(BaseModel):
    status: str = "success"
    message: str
    backup_id: str
    filename: str
    duration_seconds: float


class BackupCleanupResponse(BaseModel):
    status: str = "success"
    deleted_by_age: int
    deleted_by_count: int
    total_deleted: int
    remaining: int


# --- Endpoints ---


@router.post(
    "/database/create",
    response_model=BackupCreateResponse,
    summary="Create database backup",
    description="Trigger an immediate full PostgreSQL backup. Admin only.",
)
async def create_backup(user: AdminUser):
    """Create an immediate database backup via pg_dump."""
    try:
        service = get_database_backup_service()
        info = await service.create_backup()

        logger.info(f"Manual backup triggered by admin {user.username}: {info.filename}")

        return BackupCreateResponse(
            message=f"Backup created: {info.filename} ({info.to_dict()['size_human']})",
            backup=BackupInfoResponse(**info.to_dict()),
        )
    except RuntimeError as e:
        logger.error(f"Backup creation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/database/list",
    response_model=BackupListResponse,
    summary="List database backups",
    description="List all available database backups with metadata. Admin only.",
)
async def list_backups(user: AdminUser):
    """List all database backups sorted by creation date (newest first)."""
    service = get_database_backup_service()
    backups = await service.list_backups()

    return BackupListResponse(
        count=len(backups),
        backups=[BackupInfoResponse(**b.to_dict()) for b in backups],
    )


@router.get(
    "/database/{backup_id}/download",
    summary="Download backup file",
    description="Download a specific backup as .sql.gz file. Admin only.",
)
async def download_backup(backup_id: str, user: AdminUser):
    """Download a backup file."""
    service = get_database_backup_service()
    backup = await service.get_backup(backup_id)

    if not backup:
        raise HTTPException(status_code=404, detail=f"Backup {backup_id} not found")

    return FileResponse(
        path=str(backup.filepath),
        filename=backup.filename,
        media_type="application/gzip",
    )


@router.delete(
    "/database/{backup_id}",
    response_model=BackupDeleteResponse,
    summary="Delete backup",
    description="Delete a specific database backup. Admin only.",
)
async def delete_backup(backup_id: str, user: AdminUser):
    """Delete a specific backup file."""
    service = get_database_backup_service()
    deleted = await service.delete_backup(backup_id)

    if not deleted:
        raise HTTPException(status_code=404, detail=f"Backup {backup_id} not found")

    logger.info(f"Backup {backup_id} deleted by admin {user.username}")

    return BackupDeleteResponse(
        message=f"Backup {backup_id} deleted",
        backup_id=backup_id,
    )


@router.post(
    "/database/{backup_id}/restore",
    response_model=BackupRestoreResponse,
    summary="Restore from backup",
    description=(
        "Restore database from a backup. "
        "WARNING: This replaces ALL current data! "
        "Requires confirm=true query parameter. Admin only."
    ),
)
async def restore_backup(
    backup_id: str,
    user: AdminUser,
    confirm: bool = Query(
        default=False,
        description="Must be true to confirm restore. Safety gate.",
    ),
):
    """Restore database from backup. Requires explicit confirmation."""
    if not confirm:
        raise HTTPException(
            status_code=400,
            detail=(
                "Restore requires confirm=true. "
                "WARNING: This will replace ALL current data in the database!"
            ),
        )

    try:
        service = get_database_backup_service()
        result = await service.restore_backup(backup_id)

        logger.warning(f"Database restored from backup {backup_id} by admin {user.username}")

        return BackupRestoreResponse(
            message=f"Database restored from backup {backup_id}",
            backup_id=result["backup_id"],
            filename=result["filename"],
            duration_seconds=result["duration_seconds"],
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        logger.error(f"Database restore failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/database/cleanup",
    response_model=BackupCleanupResponse,
    summary="Cleanup old backups",
    description="Remove backups older than max_age_days and excess beyond max_count. Admin only.",
)
async def cleanup_backups(user: AdminUser):
    """Manually trigger backup cleanup."""
    service = get_database_backup_service()
    result = await service.cleanup_old_backups()

    if result["total_deleted"] > 0:
        logger.info(
            f"Backup cleanup triggered by admin {user.username}: "
            f"{result['total_deleted']} deleted"
        )

    return BackupCleanupResponse(**result)
