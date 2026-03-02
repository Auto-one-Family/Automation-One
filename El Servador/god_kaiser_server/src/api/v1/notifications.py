"""
Notification REST API Endpoints

Phase 4A.1: Notification-Stack Backend
Priority: HIGH
Status: IMPLEMENTED

Endpoints:
- GET  /v1/notifications                  - List with filters
- GET  /v1/notifications/unread-count     - Badge counter
- GET  /v1/notifications/{id}            - Single notification
- PATCH /v1/notifications/{id}/read      - Mark as read
- PATCH /v1/notifications/read-all       - Mark all as read
- POST /v1/notifications/send            - Admin send notification
- GET  /v1/notifications/preferences     - Get user preferences
- PUT  /v1/notifications/preferences     - Update user preferences
- POST /v1/notifications/test-email      - Test email delivery
"""

import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status

from ...core.logging_config import get_logger
from ...db.repositories.notification_repo import (
    NotificationPreferencesRepository,
    NotificationRepository,
)
from ...schemas.common import BaseResponse, PaginationMeta
from ...schemas.notification import (
    NotificationCreate,
    NotificationListResponse,
    NotificationPreferencesResponse,
    NotificationPreferencesUpdate,
    NotificationResponse,
    NotificationSendRequest,
    NotificationUnreadCountResponse,
    TestEmailRequest,
    TestEmailResponse,
)
from ...services.email_service import get_email_service
from ...services.notification_router import NotificationRouter
from ..deps import ActiveUser, AdminUser, DBSession

logger = get_logger(__name__)

router = APIRouter(prefix="/v1/notifications", tags=["notifications"])


# =============================================================================
# GET /v1/notifications — List with filters
# =============================================================================


@router.get(
    "",
    response_model=NotificationListResponse,
    summary="List notifications",
    description="Get paginated notifications for the current user with optional filters.",
)
async def list_notifications(
    db: DBSession,
    user: ActiveUser,
    severity: Optional[str] = Query(None, description="Filter by severity"),
    category: Optional[str] = Query(None, description="Filter by category"),
    source: Optional[str] = Query(None, description="Filter by source"),
    is_read: Optional[bool] = Query(None, description="Filter by read status"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
):
    repo = NotificationRepository(db)
    skip = (page - 1) * page_size

    notifications, total = await repo.get_for_user(
        user_id=user.id,
        severity=severity,
        category=category,
        source=source,
        is_read=is_read,
        skip=skip,
        limit=page_size,
    )

    return NotificationListResponse(
        success=True,
        data=[NotificationResponse.model_validate(n) for n in notifications],
        pagination=PaginationMeta.from_pagination(
            page=page, page_size=page_size, total_items=total
        ),
    )


# =============================================================================
# GET /v1/notifications/unread-count — Badge counter
# =============================================================================


@router.get(
    "/unread-count",
    response_model=NotificationUnreadCountResponse,
    summary="Get unread count",
    description="Get the number of unread notifications for the badge counter.",
)
async def get_unread_count(
    db: DBSession,
    user: ActiveUser,
):
    repo = NotificationRepository(db)
    count = await repo.get_unread_count(user.id)
    highest = await repo.get_highest_unread_severity(user.id)

    return NotificationUnreadCountResponse(
        success=True,
        unread_count=count,
        highest_severity=highest,
    )


# =============================================================================
# GET /v1/notifications/preferences — Get user preferences
# MUST be declared BEFORE /{notification_id} wildcard to avoid route shadowing
# =============================================================================


@router.get(
    "/preferences",
    response_model=NotificationPreferencesResponse,
    summary="Get preferences",
    description="Get notification preferences for the current user.",
)
async def get_preferences(
    db: DBSession,
    user: ActiveUser,
):
    repo = NotificationPreferencesRepository(db)
    prefs = await repo.get_or_create(user.id)
    await db.commit()
    return NotificationPreferencesResponse.model_validate(prefs)


# =============================================================================
# GET /v1/notifications/{id} — Single notification
# =============================================================================


@router.get(
    "/{notification_id}",
    response_model=NotificationResponse,
    summary="Get notification",
    description="Get a single notification by ID.",
)
async def get_notification(
    notification_id: uuid.UUID,
    db: DBSession,
    user: ActiveUser,
):
    repo = NotificationRepository(db)
    notification = await repo.get_by_id(notification_id)

    if not notification or notification.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )

    return NotificationResponse.model_validate(notification)


# =============================================================================
# PATCH /v1/notifications/{id}/read — Mark as read
# =============================================================================


@router.patch(
    "/{notification_id}/read",
    response_model=NotificationResponse,
    summary="Mark as read",
    description="Mark a single notification as read.",
)
async def mark_notification_read(
    notification_id: uuid.UUID,
    db: DBSession,
    user: ActiveUser,
):
    repo = NotificationRepository(db)
    notification = await repo.mark_as_read(notification_id, user.id)

    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )

    await db.commit()

    # Broadcast notification_updated + updated unread count
    router_service = NotificationRouter(db)
    await router_service.broadcast_notification_updated(notification)
    await router_service.broadcast_unread_count(user.id)

    return NotificationResponse.model_validate(notification)


# =============================================================================
# PATCH /v1/notifications/read-all — Mark all as read
# =============================================================================


@router.patch(
    "/read-all",
    response_model=BaseResponse,
    summary="Mark all as read",
    description="Mark all unread notifications as read for the current user.",
)
async def mark_all_read(
    db: DBSession,
    user: ActiveUser,
):
    repo = NotificationRepository(db)
    count = await repo.mark_all_as_read(user.id)
    await db.commit()

    # Broadcast updated unread count (notification_updated not sent per-item for bulk)
    router_service = NotificationRouter(db)
    await router_service.broadcast_unread_count(user.id)

    return BaseResponse(
        success=True,
        message=f"Marked {count} notifications as read",
    )


# =============================================================================
# POST /v1/notifications/send — Admin send notification
# =============================================================================


@router.post(
    "/send",
    response_model=NotificationResponse,
    summary="Send notification (Admin)",
    description="Manually send a notification to all users. Admin only.",
)
async def send_notification(
    request: NotificationSendRequest,
    db: DBSession,
    user: AdminUser,
):
    notification_create = NotificationCreate(
        user_id=None,  # Broadcast to all
        channel=request.channel,
        severity=request.severity,
        category=request.category,
        title=request.title,
        body=request.body,
        metadata=request.metadata,
        source=request.source,
    )

    router_service = NotificationRouter(db)
    result = await router_service.route(notification_create)

    if not result:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Notification was deduplicated or no users found",
        )

    return NotificationResponse.model_validate(result)


# =============================================================================
# PUT /v1/notifications/preferences — Update user preferences
# =============================================================================


@router.put(
    "/preferences",
    response_model=NotificationPreferencesResponse,
    summary="Update preferences",
    description="Update notification preferences for the current user.",
)
async def update_preferences(
    request: NotificationPreferencesUpdate,
    db: DBSession,
    user: ActiveUser,
):
    repo = NotificationPreferencesRepository(db)

    update_data = request.model_dump(exclude_none=True)
    prefs = await repo.update(user.id, **update_data)
    await db.commit()

    return NotificationPreferencesResponse.model_validate(prefs)


# =============================================================================
# POST /v1/notifications/test-email — Test email delivery
# =============================================================================


@router.post(
    "/test-email",
    response_model=TestEmailResponse,
    summary="Test email",
    description="Send a test email to verify email configuration.",
)
async def test_email(
    request: TestEmailRequest,
    db: DBSession,
    user: ActiveUser,
):
    email_service = get_email_service()

    if not email_service.is_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email service not available. Check EMAIL_ENABLED and provider configuration.",
        )

    # Determine recipient
    recipient = request.email
    if not recipient:
        # Try user preferences, then user account email
        prefs_repo = NotificationPreferencesRepository(db)
        prefs = await prefs_repo.get_for_user(user.id)
        if prefs and prefs.email_address:
            recipient = prefs.email_address
        else:
            recipient = user.email

    if not recipient:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No email address found. Provide one in the request or set it in preferences.",
        )

    provider = email_service.provider_name
    success = await email_service.send_test_email(recipient)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Email delivery failed via {provider}. Check server logs for details.",
        )

    return TestEmailResponse(
        success=True,
        message=f"Test email sent successfully via {provider}",
        provider=provider,
        recipient=recipient,
    )
