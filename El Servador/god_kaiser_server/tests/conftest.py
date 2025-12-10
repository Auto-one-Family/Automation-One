"""
⭐ Pytest Configuration
Fixtures: test_db, test_client, mock_mqtt, sample_esp
"""

import asyncio
import sys
from pathlib import Path
from typing import AsyncGenerator

# Add project root to Python path for imports
project_root = Path(__file__).parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from src.db.base import Base
from src.db.models import (
    actuator,
    ai,
    esp,
    kaiser,
    library,
    logic,
    sensor,
    system,
    user,
)  # noqa: F401
from src.db.repositories.actuator_repo import ActuatorRepository
from src.db.repositories.esp_repo import ESPRepository
from src.db.repositories.sensor_repo import SensorRepository
from src.db.repositories.user_repo import UserRepository


# Test database URL (SQLite in-memory for fast tests)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def test_engine() -> AsyncGenerator[AsyncEngine, None]:
    """
    Create a test database engine.

    Uses SQLite in-memory database for fast, isolated tests.
    """
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        future=True,
    )

    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    # Cleanup
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(test_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """
    Create a test database session.

    Tests can use commit() freely - the in-memory database is
    recreated for each test function anyway via test_engine.
    
    Note: Named 'db_session' for consistency across all test files.
    Some tests may also use 'test_session' alias.
    """
    async_session_maker = sessionmaker(
        bind=test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )

    async with async_session_maker() as session:
        yield session
        # Rollback any uncommitted changes
        await session.rollback()


# Alias for backwards compatibility
@pytest_asyncio.fixture(scope="function")
async def test_session(db_session: AsyncSession) -> AsyncGenerator[AsyncSession, None]:
    """Alias for db_session - for backwards compatibility."""
    yield db_session


@pytest_asyncio.fixture
async def esp_repo(db_session: AsyncSession) -> ESPRepository:
    """Create ESPRepository instance."""
    return ESPRepository(db_session)


@pytest_asyncio.fixture
async def sensor_repo(db_session: AsyncSession) -> SensorRepository:
    """Create SensorRepository instance."""
    return SensorRepository(db_session)


@pytest_asyncio.fixture
async def actuator_repo(db_session: AsyncSession) -> ActuatorRepository:
    """Create ActuatorRepository instance."""
    return ActuatorRepository(db_session)


@pytest_asyncio.fixture
async def user_repo(db_session: AsyncSession) -> UserRepository:
    """Create UserRepository instance."""
    return UserRepository(db_session)


@pytest_asyncio.fixture
async def sample_esp_device(db_session: AsyncSession):
    """
    Create a sample ESP device for testing.

    Returns:
        ESPDevice instance
    """
    from src.db.models.esp import ESPDevice

    device = ESPDevice(
        device_id="ESP_TEST_001",
        name="Test ESP32",
        ip_address="192.168.1.100",
        mac_address="AA:BB:CC:DD:EE:FF",
        firmware_version="1.0.0",
        hardware_type="ESP32_WROOM",
        status="online",
        capabilities={"max_sensors": 20, "max_actuators": 12},
    )
    db_session.add(device)
    await db_session.flush()
    await db_session.refresh(device)
    return device


@pytest_asyncio.fixture
async def sample_user(db_session: AsyncSession):
    """
    Create a sample user for testing.

    Returns:
        User instance
    """
    from src.db.models.user import User

    user = User(
        username="testuser",
        email="test@example.com",
        password_hash="hashed_password",
        role="operator",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)
    return user
