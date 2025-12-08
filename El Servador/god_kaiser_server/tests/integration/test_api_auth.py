"""
Integration Tests: Authentication API

Phase: 5 (Week 9-10) - API Layer
Tests: Auth endpoints (login, register, refresh, logout)
"""

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.security import create_access_token, verify_password, get_password_hash
from src.db.models.user import User
from src.main import app


@pytest.fixture
async def test_user(db_session: AsyncSession):
    """Create a test user for authentication tests."""
    user = User(
        username="testuser",
        email="test@example.com",
        password_hash=get_password_hash("TestP@ss123"),
        full_name="Test User",
        role="operator",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def admin_user(db_session: AsyncSession):
    """Create an admin user for admin-only tests."""
    user = User(
        username="admin",
        email="admin@example.com",
        password_hash=get_password_hash("AdminP@ss123"),
        full_name="Admin User",
        role="admin",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
def auth_headers(test_user: User):
    """Get authorization headers with test user token."""
    token = create_access_token(user_id=test_user.id, additional_claims={"role": test_user.role})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_headers(admin_user: User):
    """Get authorization headers with admin token."""
    token = create_access_token(user_id=admin_user.id, additional_claims={"role": admin_user.role})
    return {"Authorization": f"Bearer {token}"}


class TestLogin:
    """Test login endpoint."""
    
    @pytest.mark.asyncio
    async def test_login_success(self, test_user: User):
        """Test successful login."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/login",
                json={
                    "username": "testuser",
                    "password": "TestP@ss123",
                    "remember_me": False,
                },
            )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "tokens" in data
        assert "access_token" in data["tokens"]
        assert "refresh_token" in data["tokens"]
        assert data["tokens"]["token_type"] == "bearer"
        assert "user" in data
        assert data["user"]["username"] == "testuser"
    
    @pytest.mark.asyncio
    async def test_login_invalid_password(self, test_user: User):
        """Test login with wrong password."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/login",
                json={
                    "username": "testuser",
                    "password": "WrongPassword",
                },
            )
        
        assert response.status_code == 401
        data = response.json()
        assert "Invalid" in data["detail"]
    
    @pytest.mark.asyncio
    async def test_login_invalid_username(self):
        """Test login with non-existent user."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/login",
                json={
                    "username": "nonexistent",
                    "password": "SomePassword123",
                },
            )
        
        assert response.status_code == 401


class TestRegister:
    """Test registration endpoint."""
    
    @pytest.mark.asyncio
    async def test_register_success(self, admin_headers: dict):
        """Test successful user registration by admin."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/register",
                json={
                    "username": "newuser",
                    "email": "newuser@example.com",
                    "password": "NewP@ss123",
                    "full_name": "New User",
                    "role": "operator",
                },
                headers=admin_headers,
            )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["user"]["username"] == "newuser"
        assert data["user"]["role"] == "operator"
    
    @pytest.mark.asyncio
    async def test_register_non_admin_forbidden(self, auth_headers: dict):
        """Test that non-admin cannot register users."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/register",
                json={
                    "username": "anotheruser",
                    "email": "another@example.com",
                    "password": "AnotherP@ss123",
                    "role": "viewer",
                },
                headers=auth_headers,
            )
        
        assert response.status_code == 403
    
    @pytest.mark.asyncio
    async def test_register_duplicate_username(self, admin_headers: dict, test_user: User):
        """Test registration with existing username."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/register",
                json={
                    "username": "testuser",  # Already exists
                    "email": "different@example.com",
                    "password": "DiffP@ss123",
                    "role": "viewer",
                },
                headers=admin_headers,
            )
        
        assert response.status_code == 400
        assert "already exists" in response.json()["detail"]


class TestTokenRefresh:
    """Test token refresh endpoint."""
    
    @pytest.mark.asyncio
    async def test_refresh_success(self, test_user: User):
        """Test successful token refresh."""
        from ...src.core.security import create_refresh_token
        
        refresh_token = create_refresh_token(user_id=test_user.id)
        
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/refresh",
                json={"refresh_token": refresh_token},
            )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "tokens" in data
        assert "access_token" in data["tokens"]
    
    @pytest.mark.asyncio
    async def test_refresh_invalid_token(self):
        """Test refresh with invalid token."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/refresh",
                json={"refresh_token": "invalid_token"},
            )
        
        assert response.status_code == 401


class TestCurrentUser:
    """Test current user endpoint."""
    
    @pytest.mark.asyncio
    async def test_get_current_user(self, auth_headers: dict, test_user: User):
        """Test getting current user info."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(
                "/api/v1/auth/me",
                headers=auth_headers,
            )
        
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "testuser"
        assert data["email"] == "test@example.com"
        assert data["role"] == "operator"
    
    @pytest.mark.asyncio
    async def test_get_current_user_unauthenticated(self):
        """Test getting current user without token."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/auth/me")
        
        assert response.status_code == 401
