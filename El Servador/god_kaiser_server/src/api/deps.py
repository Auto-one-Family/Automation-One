"""
FastAPI Dependency Injection: DB Sessions, Auth, Rate Limiting

Phase: 5 (Week 9-10) - API Layer
Priority: 🔴 CRITICAL
Status: IMPLEMENTED

Provides:
- get_db() - Database session injection
- get_current_user() - JWT authentication
- get_current_active_user() - Active user check
- require_admin() - Admin role guard
- require_operator() - Operator/Admin role guard
- verify_api_key() - API key authentication (ESP32)
- check_rate_limit() - Rate limiting

References:
- .claude/PI_SERVER_REFACTORING.md (Phase 5)
- core/security.py (JWT utilities)
- db/session.py (Database session)
"""

from typing import Annotated, AsyncGenerator, Optional

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer, OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..core.logging_config import get_logger
from ..core.security import verify_token
from ..db.models.user import User
from ..db.repositories.user_repo import UserRepository
from ..db.session import get_session

logger = get_logger(__name__)
settings = get_settings()

# OAuth2 scheme for JWT tokens
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login",
    auto_error=False,
)

# HTTP Bearer scheme (alternative)
http_bearer = HTTPBearer(auto_error=False)


# =============================================================================
# Database Session Dependency
# =============================================================================


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Database session dependency.
    
    Provides an async database session for request handlers.
    Session is automatically closed after request completes.
    
    Usage:
        @router.get("/items")
        async def get_items(db: AsyncSession = Depends(get_db)):
            ...
    """
    async for session in get_session():
        try:
            yield session
        finally:
            pass  # Session cleanup handled by get_session()


# Type alias for dependency injection
DBSession = Annotated[AsyncSession, Depends(get_db)]


# =============================================================================
# JWT Authentication Dependencies
# =============================================================================


async def get_current_user(
    token: Annotated[Optional[str], Depends(oauth2_scheme)],
    db: DBSession,
) -> User:
    """
    Get current authenticated user from JWT token.
    
    Extracts user ID from token, validates, and returns User model.
    
    Args:
        token: JWT token from Authorization header
        db: Database session
        
    Returns:
        User model instance
        
    Raises:
        HTTPException: 401 if token invalid or user not found
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # Development mode bypass
    if settings.development.debug_mode and not token:
        # In debug mode, allow requests without token for testing
        # Return a mock admin user
        logger.warning("Auth bypass in debug mode - returning mock admin user")
        user_repo = UserRepository(db)
        admin_user = await user_repo.get_by_username("admin")
        if admin_user:
            return admin_user
        # No admin user exists, fail
        raise credentials_exception
    
    if not token:
        logger.warning("No authentication token provided")
        raise credentials_exception
    
    try:
        # Verify and decode token
        payload = verify_token(token, expected_type="access")
        user_id_str = payload.get("sub")
        
        if user_id_str is None:
            logger.warning("Token missing 'sub' claim")
            raise credentials_exception
        
        try:
            user_id = int(user_id_str)
        except ValueError:
            logger.warning(f"Invalid user_id in token: {user_id_str}")
            raise credentials_exception
            
    except JWTError as e:
        logger.warning(f"JWT verification failed: {e}")
        raise credentials_exception
    except ValueError as e:
        logger.warning(f"Token validation error: {e}")
        raise credentials_exception
    
    # Get user from database
    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(user_id)
    
    if user is None:
        logger.warning(f"User {user_id} not found in database")
        raise credentials_exception
    
    return user


# Type alias for current user dependency
CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_current_active_user(
    current_user: CurrentUser,
) -> User:
    """
    Get current authenticated and active user.
    
    Ensures user account is active (not disabled).
    
    Args:
        current_user: Current user from get_current_user
        
    Returns:
        User model instance
        
    Raises:
        HTTPException: 403 if user is inactive
    """
    if not current_user.is_active:
        logger.warning(f"Inactive user attempted access: {current_user.username}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )
    return current_user


# Type alias for active user dependency
ActiveUser = Annotated[User, Depends(get_current_active_user)]


# =============================================================================
# Role-Based Access Control
# =============================================================================


async def require_admin(
    current_user: ActiveUser,
) -> User:
    """
    Require admin role.
    
    Ensures current user has admin role.
    
    Args:
        current_user: Current active user
        
    Returns:
        User model instance
        
    Raises:
        HTTPException: 403 if user is not admin
    """
    if current_user.role != "admin":
        logger.warning(
            f"Non-admin user attempted admin action: {current_user.username} (role={current_user.role})"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user


async def require_operator(
    current_user: ActiveUser,
) -> User:
    """
    Require operator or admin role.
    
    Ensures current user has operator or admin role.
    Viewers are denied access.
    
    Args:
        current_user: Current active user
        
    Returns:
        User model instance
        
    Raises:
        HTTPException: 403 if user is viewer
    """
    if current_user.role not in ("admin", "operator"):
        logger.warning(
            f"Viewer attempted operator action: {current_user.username}"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operator or admin privileges required",
        )
    return current_user


# Type aliases for role guards
AdminUser = Annotated[User, Depends(require_admin)]
OperatorUser = Annotated[User, Depends(require_operator)]


# =============================================================================
# API Key Authentication (for ESP32 devices)
# =============================================================================


async def verify_api_key(
    x_api_key: Annotated[Optional[str], Header(alias="X-API-Key")] = None,
) -> str:
    """
    Verify API key from request header.
    
    Used for ESP32 device authentication.
    
    Args:
        x_api_key: API key from X-API-Key header
        
    Returns:
        API key if valid
        
    Raises:
        HTTPException: 401 if invalid or missing
    """
    # Development mode: Allow without API key
    if settings.development.debug_mode:
        logger.debug("API key verification DISABLED (debug mode)")
        return "debug-mode"
    
    if not x_api_key:
        logger.warning("API request without API key")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key. Include X-API-Key header.",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    
    # Check against configured API key
    configured_key = getattr(settings.security, 'api_key', None)
    if configured_key and x_api_key == configured_key:
        return x_api_key
    
    # Accept keys starting with "esp_" (ESP32 device keys)
    if x_api_key.startswith("esp_"):
        return x_api_key
    
    # Accept keys starting with "god_" (God layer keys)
    if x_api_key.startswith("god_"):
        return x_api_key
    
    logger.warning(f"Invalid API key attempted: {x_api_key[:10]}...")
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid API key",
        headers={"WWW-Authenticate": "ApiKey"},
    )


# Type alias for API key dependency
APIKey = Annotated[str, Depends(verify_api_key)]


# =============================================================================
# Rate Limiting
# =============================================================================


# Simple in-memory rate limiter
# For production: Use Redis-based implementation
import time
from collections import defaultdict


class RateLimiter:
    """
    Simple in-memory rate limiter with sliding window.
    
    For production, replace with Redis-based implementation.
    """
    
    def __init__(self, max_requests: int = 100, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: dict[str, list[float]] = defaultdict(list)
    
    def is_allowed(self, key: str) -> bool:
        """Check if request is allowed for key."""
        now = time.time()
        window_start = now - self.window_seconds
        
        # Clean old requests
        self.requests[key] = [
            req_time for req_time in self.requests[key]
            if req_time > window_start
        ]
        
        # Check limit
        if len(self.requests[key]) >= self.max_requests:
            return False
        
        # Record request
        self.requests[key].append(now)
        return True
    
    def get_remaining(self, key: str) -> int:
        """Get remaining requests for key."""
        return max(0, self.max_requests - len(self.requests[key]))
    
    def get_reset_time(self, key: str) -> int:
        """Get seconds until rate limit resets."""
        if not self.requests[key]:
            return 0
        oldest = min(self.requests[key])
        reset_at = oldest + self.window_seconds
        return max(0, int(reset_at - time.time()))


# Global rate limiter instances
_rate_limiter = RateLimiter(max_requests=100, window_seconds=60)
_auth_rate_limiter = RateLimiter(max_requests=10, window_seconds=60)  # Stricter for auth


async def check_rate_limit(
    x_api_key: Annotated[Optional[str], Header(alias="X-API-Key")] = None,
) -> None:
    """
    Check rate limit for API requests.
    
    Uses API key or IP as rate limit key.
    
    Args:
        x_api_key: API key from header (or use IP)
        
    Raises:
        HTTPException: 429 if rate limit exceeded
    """
    # Use API key as rate limit key, or "anonymous" if none
    key = x_api_key[:20] if x_api_key else "anonymous"
    
    if not _rate_limiter.is_allowed(key):
        remaining = _rate_limiter.get_remaining(key)
        reset_time = _rate_limiter.get_reset_time(key)
        
        logger.warning(f"Rate limit exceeded for key: {key}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Max {_rate_limiter.max_requests} requests per {_rate_limiter.window_seconds}s.",
            headers={
                "Retry-After": str(reset_time),
                "X-RateLimit-Limit": str(_rate_limiter.max_requests),
                "X-RateLimit-Remaining": str(remaining),
                "X-RateLimit-Reset": str(reset_time),
            },
        )


async def check_auth_rate_limit(
    x_api_key: Annotated[Optional[str], Header(alias="X-API-Key")] = None,
) -> None:
    """
    Stricter rate limit for authentication endpoints.
    
    Limits to 10 requests per minute to prevent brute force.
    """
    key = x_api_key[:20] if x_api_key else "anonymous"
    
    if not _auth_rate_limiter.is_allowed(key):
        reset_time = _auth_rate_limiter.get_reset_time(key)
        
        logger.warning(f"Auth rate limit exceeded for key: {key}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many authentication attempts. Please wait before trying again.",
            headers={
                "Retry-After": str(reset_time),
            },
        )


# =============================================================================
# Optional Authentication (for public + authenticated endpoints)
# =============================================================================


async def get_optional_user(
    token: Annotated[Optional[str], Depends(oauth2_scheme)],
    db: DBSession,
) -> Optional[User]:
    """
    Get current user if authenticated, otherwise None.
    
    For endpoints that work both authenticated and anonymously,
    but provide additional features when authenticated.
    
    Args:
        token: JWT token (optional)
        db: Database session
        
    Returns:
        User if authenticated, None otherwise
    """
    if not token:
        return None
    
    try:
        return await get_current_user(token, db)
    except HTTPException:
        return None


OptionalUser = Annotated[Optional[User], Depends(get_optional_user)]


# =============================================================================
# Service Dependencies
# =============================================================================


def get_mqtt_publisher():
    """Get MQTT Publisher instance."""
    from ..mqtt.publisher import Publisher
    return Publisher()


def get_safety_service(db: DBSession):
    """Get SafetyService instance."""
    from ..db.repositories import ActuatorRepository, ESPRepository
    from ..services.safety_service import SafetyService
    
    actuator_repo = ActuatorRepository(db)
    esp_repo = ESPRepository(db)
    return SafetyService(actuator_repo, esp_repo)


def get_actuator_service(db: DBSession):
    """Get ActuatorService instance."""
    from ..db.repositories import ActuatorRepository, ESPRepository
    from ..mqtt.publisher import Publisher
    from ..services.actuator_service import ActuatorService
    from ..services.safety_service import SafetyService
    
    actuator_repo = ActuatorRepository(db)
    esp_repo = ESPRepository(db)
    safety_service = SafetyService(actuator_repo, esp_repo)
    publisher = Publisher()
    
    return ActuatorService(actuator_repo, safety_service, publisher)
