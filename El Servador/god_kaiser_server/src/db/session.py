"""
Database Session Management
Engine Creation, Connection Pool Config

Includes resilience patterns:
- Circuit Breaker for database operations
- Resilient session context manager with retry and timeout
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

from sqlalchemy.exc import OperationalError, InterfaceError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from ..core.config import get_settings
from ..core.logging_config import get_logger
from ..core.resilience import (
    CircuitBreaker,
    CircuitState,
    ResilienceRegistry,
    CircuitBreakerOpenError,
    ServiceUnavailableError,
)

logger = get_logger(__name__)

# Database circuit breaker instance
_db_circuit_breaker: Optional[CircuitBreaker] = None

# Global engine instance
_engine: AsyncEngine | None = None


def get_engine() -> AsyncEngine:
    """
    Get or create the async database engine.

    Returns:
        AsyncEngine: SQLAlchemy async engine with connection pooling

    Note:
        Engine is created as a singleton to prevent multiple connection pools
    """
    global _engine

    if _engine is None:
        settings = get_settings()

        # SQLite does not support pool_size, max_overflow, pool_timeout parameters
        # Check if using SQLite and configure accordingly
        is_sqlite = "sqlite" in settings.database.url.lower()

        if is_sqlite:
            # SQLite configuration (no pooling parameters)
            _engine = create_async_engine(
                settings.database.url,
                pool_pre_ping=False,  # Not supported by SQLite
                echo=settings.database.echo,
            )
            logger.info("Database engine created: SQLite (no connection pooling)")
        else:
            # PostgreSQL/MySQL configuration (with pooling)
            _engine = create_async_engine(
                settings.database.url,
                pool_size=settings.database.pool_size,
                max_overflow=settings.database.max_overflow,
                pool_timeout=settings.database.pool_timeout,
                pool_pre_ping=True,  # Verify connections before using
                echo=settings.database.echo,
            )
            logger.info(
                f"Database engine created: pool_size={settings.database.pool_size}, "
                f"max_overflow={settings.database.max_overflow}"
            )

    return _engine


# =============================================================================
# FIX 5: Lazy Loading for Session Maker
# Session maker is created on first use, not at module import time
# This prevents eager engine creation which can fail in test environments
# =============================================================================
_async_session_maker: sessionmaker | None = None


def get_session_maker() -> sessionmaker:
    """
    Get or create the async session maker (lazy loading).

    Returns:
        sessionmaker: SQLAlchemy async session maker
    """
    global _async_session_maker

    if _async_session_maker is None:
        _async_session_maker = sessionmaker(
            bind=get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )

    return _async_session_maker


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Get an async database session.

    Yields:
        AsyncSession: SQLAlchemy async session

    Usage:
        async with get_session() as session:
            # Use session here
            pass
    """
    session_maker = get_session_maker()  # Lazy loading
    async with session_maker() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """
    Initialize the database by creating all tables.

    This should be called on application startup in development.
    In production, use Alembic migrations instead.
    """
    from .base import Base

    logger.info("Initializing database...")

    engine = get_engine()

    async with engine.begin() as conn:
        # Import all models to ensure they're registered
        from .models import (  # noqa: F401
            actuator,
            ai,
            auth,  # TokenBlacklist model
            esp,
            kaiser,
            library,
            logic,
            sensor,
            system,
            user,
        )

        # Create all tables
        await conn.run_sync(Base.metadata.create_all)

    logger.info("Database initialization complete")


async def dispose_engine() -> None:
    """
    Dispose the database engine and close all connections.

    Should be called on application shutdown.
    """
    global _engine

    if _engine is not None:
        await _engine.dispose()
        _engine = None
        logger.info("Database engine disposed")


# =============================================================================
# RESILIENCE: Database Circuit Breaker
# =============================================================================

def init_db_circuit_breaker() -> CircuitBreaker:
    """
    Initialize and register the database circuit breaker.
    
    Called during application startup to set up resilience patterns.
    
    Returns:
        CircuitBreaker instance for database operations
    """
    global _db_circuit_breaker
    
    if _db_circuit_breaker is not None:
        return _db_circuit_breaker
    
    settings = get_settings()
    
    _db_circuit_breaker = CircuitBreaker(
        name="database",
        failure_threshold=settings.resilience.circuit_breaker_db_failure_threshold,
        recovery_timeout=float(settings.resilience.circuit_breaker_db_recovery_timeout),
        half_open_timeout=float(settings.resilience.circuit_breaker_db_half_open_timeout),
    )
    
    # Register in global registry
    registry = ResilienceRegistry.get_instance()
    registry.register_circuit_breaker("database", _db_circuit_breaker)
    
    logger.info(
        f"[resilience] Database CircuitBreaker registered: "
        f"threshold={settings.resilience.circuit_breaker_db_failure_threshold}, "
        f"recovery={settings.resilience.circuit_breaker_db_recovery_timeout}s"
    )
    
    return _db_circuit_breaker


def get_db_circuit_breaker() -> Optional[CircuitBreaker]:
    """
    Get the database circuit breaker instance.
    
    Returns:
        CircuitBreaker instance or None if not initialized
    """
    global _db_circuit_breaker
    return _db_circuit_breaker


@asynccontextmanager
async def resilient_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Get a resilient database session with circuit breaker protection.
    
    This context manager provides:
    - Circuit breaker check before acquiring session
    - Automatic failure/success recording
    - Proper error handling and circuit state updates
    
    Usage:
        async with resilient_session() as session:
            result = await session.execute(query)
    
    Raises:
        ServiceUnavailableError: If circuit breaker is OPEN
        OperationalError: If database operation fails
    """
    global _db_circuit_breaker
    
    # Initialize circuit breaker if not done yet
    if _db_circuit_breaker is None:
        init_db_circuit_breaker()
    
    # Circuit breaker check
    if _db_circuit_breaker and not _db_circuit_breaker.allow_request():
        logger.warning("[resilience] Database operation blocked by Circuit Breaker")
        raise ServiceUnavailableError(
            service_name="database",
            reason="Circuit breaker is OPEN",
            details={
                "state": _db_circuit_breaker.get_state().value,
                "failure_count": _db_circuit_breaker.failure_count,
            }
        )
    
    session_maker = get_session_maker()
    async with session_maker() as session:
        try:
            yield session
            # Record success on normal exit
            if _db_circuit_breaker:
                _db_circuit_breaker.record_success()
        except (OperationalError, InterfaceError) as e:
            # Database connection errors - record failure
            if _db_circuit_breaker:
                _db_circuit_breaker.record_failure()
            await session.rollback()
            logger.error(f"[resilience] Database operation failed: {e}")
            raise
        except Exception as e:
            # Other errors - rollback but don't record as circuit breaker failure
            # (could be application logic errors, not infrastructure)
            await session.rollback()
            raise
        finally:
            await session.close()


@asynccontextmanager
async def get_session_with_resilience() -> AsyncGenerator[AsyncSession, None]:
    """
    Alias for resilient_session() for backward compatibility.
    
    Prefer using resilient_session() in new code.
    """
    async with resilient_session() as session:
        yield session
