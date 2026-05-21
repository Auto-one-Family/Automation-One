"""
Integration Tests: DB Export API (AUT-385)

Tests for GET /api/v1/debug/db/{table_name}/export endpoint.
"""

import json
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession
from sqlalchemy.orm import sessionmaker

from src.core.security import create_access_token, get_password_hash
from src.db.models.audit_log import AuditLog
from src.db.models.user import User
from src.main import app


# =============================================================================
# Fixtures
# =============================================================================


@pytest_asyncio.fixture
async def admin_user(db_session: AsyncSession) -> User:
    """Admin user for export endpoint auth."""
    user = User(
        username="export_admin",
        email="export_admin@test.com",
        password_hash=get_password_hash("AdminP@ss123"),
        role="admin",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
def admin_headers(admin_user: User) -> dict:
    token = create_access_token(
        user_id=admin_user.id, additional_claims={"role": admin_user.role}
    )
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def viewer_user(db_session: AsyncSession) -> User:
    """Non-admin user to test 403 response."""
    user = User(
        username="export_viewer",
        email="export_viewer@test.com",
        password_hash=get_password_hash("ViewerP@ss123"),
        role="viewer",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
def viewer_headers(viewer_user: User) -> dict:
    token = create_access_token(
        user_id=viewer_user.id, additional_claims={"role": viewer_user.role}
    )
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def override_debug_db(test_engine: AsyncEngine):
    """
    Override _get_db_session (debug.py-local dependency) with the test engine.

    The root conftest only overrides get_db (api.deps); debug endpoints use
    _get_db_session instead. This fixture patches the missing override so that
    the export endpoint reads from the same in-memory SQLite DB that the
    test fixtures write to.
    """
    from src.api.v1.debug import _get_db_session

    test_session_maker = sessionmaker(
        bind=test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )

    async def _override():
        async with test_session_maker() as session:
            yield session

    app.dependency_overrides[_get_db_session] = _override
    yield
    app.dependency_overrides.pop(_get_db_session, None)


@pytest_asyncio.fixture
async def sample_audit_logs(db_session: AsyncSession) -> list:
    """
    Three audit log entries with explicit timestamps for date-filter tests.

    log_jan1_am and log_jan1_pm fall on 2026-01-01 (in range).
    log_jan2 falls on 2026-01-02 (outside range when filtering Jan 1).
    """
    log_jan1_am = AuditLog(
        event_type="login_success",
        severity="info",
        source_type="api",
        source_id="u1",
        status="success",
        message="Jan 1 AM",
        details={},
        created_at=datetime(2026, 1, 1, 10, 0, 0),
        updated_at=datetime(2026, 1, 1, 10, 0, 0),
    )
    log_jan1_pm = AuditLog(
        event_type="login_success",
        severity="info",
        source_type="api",
        source_id="u2",
        status="success",
        message="Jan 1 PM",
        details={},
        created_at=datetime(2026, 1, 1, 14, 0, 0),
        updated_at=datetime(2026, 1, 1, 14, 0, 0),
    )
    log_jan2 = AuditLog(
        event_type="logout",
        severity="info",
        source_type="api",
        source_id="u1",
        status="success",
        message="Jan 2",
        details={},
        created_at=datetime(2026, 1, 2, 9, 0, 0),
        updated_at=datetime(2026, 1, 2, 9, 0, 0),
    )
    for log in (log_jan1_am, log_jan1_pm, log_jan2):
        db_session.add(log)
    await db_session.commit()
    return [log_jan1_am, log_jan1_pm, log_jan2]


# =============================================================================
# Test 1 — date_from / date_to filtering
# =============================================================================


class TestExportDateFilter:
    """Export with explicit date range returns only matching rows."""

    @pytest.mark.asyncio
    async def test_date_filter_returns_in_range_records(
        self,
        admin_headers: dict,
        override_debug_db,
        sample_audit_logs,
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/v1/debug/db/audit_logs/export",
                params={
                    "format": "json",
                    "date_from": "2026-01-01T00:00:00",
                    "date_to": "2026-01-01T23:59:59",
                },
                headers=admin_headers,
            )

        assert response.status_code == 200
        assert "application/json" in response.headers["content-type"]
        data = json.loads(response.content)
        assert isinstance(data, list)
        # Only the two Jan-1 entries should be returned
        assert len(data) == 2
        for record in data:
            assert record["event_type"] == "login_success"


# =============================================================================
# Test 2 — columns parameter selects subset of fields
# =============================================================================


class TestExportColumnSelection:
    """columns= query parameter limits response fields to the requested subset."""

    @pytest.mark.asyncio
    async def test_columns_limits_output_fields(
        self,
        admin_headers: dict,
        override_debug_db,
        sample_audit_logs,
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/v1/debug/db/audit_logs/export",
                params={
                    "format": "json",
                    "columns": "id,event_type",
                    "date_from": "2026-01-01T00:00:00",
                    "date_to": "2026-01-02T23:59:59",
                },
                headers=admin_headers,
            )

        assert response.status_code == 200
        data = json.loads(response.content)
        assert len(data) >= 1
        for record in data:
            assert set(record.keys()) == {"id", "event_type"}


# =============================================================================
# Test 3 — table not in ALLOWED_TABLES → 404
# =============================================================================


class TestExportTableNotFound:
    """Tables outside ALLOWED_TABLES are rejected with 404."""

    @pytest.mark.asyncio
    async def test_disallowed_table_returns_404(
        self,
        admin_headers: dict,
        override_debug_db,
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/v1/debug/db/user_passwords/export",
                headers=admin_headers,
            )

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


# =============================================================================
# Test 4 — unknown column in columns= → 422
# =============================================================================


class TestExportUnknownColumn:
    """Unknown column name in columns= returns 422 with helpful message."""

    @pytest.mark.asyncio
    async def test_unknown_column_returns_422(
        self,
        admin_headers: dict,
        override_debug_db,
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/v1/debug/db/audit_logs/export",
                params={
                    "columns": "id,nonexistent_column",
                    "date_from": "2026-01-01T00:00:00",
                    "date_to": "2026-01-02T00:00:00",
                },
                headers=admin_headers,
            )

        assert response.status_code == 422
        detail = str(response.json()["detail"])
        assert "nonexistent_column" in detail


# =============================================================================
# Test 5 — non-admin user → 403
# =============================================================================


class TestExportAuth:
    """Viewer-role user is denied with 403."""

    @pytest.mark.asyncio
    async def test_viewer_role_returns_403(
        self,
        viewer_headers: dict,
        override_debug_db,
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/v1/debug/db/audit_logs/export",
                headers=viewer_headers,
            )

        assert response.status_code == 403
