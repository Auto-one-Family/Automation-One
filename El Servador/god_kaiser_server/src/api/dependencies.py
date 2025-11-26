"""
API Dependencies - Authentication, Rate Limiting, Database Sessions

Provides FastAPI dependencies for:
- API Key authentication (ESP32 devices)
- Rate limiting (DDoS protection)
- Database session management
- Request validation
"""

import time
from collections import defaultdict
from typing import Optional

from fastapi import Header, HTTPException, status
from fastapi.security import APIKeyHeader

from ..core.config import get_settings
from ..core.logging_config import get_logger

logger = get_logger(__name__)
settings = get_settings()

# API Key header scheme
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


# Rate limiter (simple in-memory implementation)
# For production: Use Redis-based rate limiting
class RateLimiter:
    """
    Simple in-memory rate limiter.
    
    Tracks request counts per API key with sliding window.
    For production, replace with Redis-based implementation.
    """
    
    def __init__(self, max_requests: int = 100, window_seconds: int = 60):
        """
        Initialize rate limiter.
        
        Args:
            max_requests: Max requests per window
            window_seconds: Time window in seconds
        """
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: dict[str, list[float]] = defaultdict(list)
    
    def is_allowed(self, key: str) -> bool:
        """
        Check if request is allowed for key.
        
        Args:
            key: API key or identifier
            
        Returns:
            True if request allowed, False if rate limited
        """
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


# Global rate limiter instance
# Production: 100 requests per minute per API key
rate_limiter = RateLimiter(max_requests=100, window_seconds=60)


async def verify_api_key(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key")
) -> str:
    """
    Verify API key from request header.
    
    For production: Validate against database stored keys.
    For development: Simple static key or disabled.
    
    Args:
        x_api_key: API key from X-API-Key header
        
    Returns:
        API key if valid
        
    Raises:
        HTTPException: 401 if invalid or missing
    """
    # Development mode: Allow without API key
    if settings.development.debug_mode:
        logger.warning("API key verification DISABLED (debug mode)")
        return "debug-mode"
    
    if not x_api_key:
        logger.warning("API request without API key")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key. Include X-API-Key header.",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    
    # Production: Validate against database
    # For now: Simple check against config
    # TODO: Implement database-backed API key validation
    if x_api_key == settings.security.api_key if hasattr(settings.security, 'api_key') else None:
        return x_api_key
    
    # Temporary: Accept any key starting with "esp_"
    if x_api_key.startswith("esp_"):
        return x_api_key
    
    logger.error(f"Invalid API key attempted: {x_api_key[:10]}...")
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid API key",
        headers={"WWW-Authenticate": "ApiKey"},
    )


async def check_rate_limit(
    api_key: str = Header(..., alias="X-API-Key")
) -> None:
    """
    Check rate limit for API key.
    
    Args:
        api_key: API key from header
        
    Raises:
        HTTPException: 429 if rate limit exceeded
    """
    if not rate_limiter.is_allowed(api_key):
        logger.warning(f"Rate limit exceeded for API key: {api_key[:10]}...")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Max {rate_limiter.max_requests} requests per {rate_limiter.window_seconds}s.",
            headers={
                "Retry-After": str(rate_limiter.window_seconds),
                "X-RateLimit-Limit": str(rate_limiter.max_requests),
                "X-RateLimit-Remaining": "0",
            },
        )
    
    # Add rate limit info to response (informational)
    remaining = rate_limiter.get_remaining(api_key)
    logger.debug(f"Rate limit OK: {remaining} requests remaining for {api_key[:10]}...")

