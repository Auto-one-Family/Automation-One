"""
Authentication & Authorization Endpoints

Phase: 5 (Week 9-10) - API Layer
Priority: 🔴 CRITICAL (for production deployment)
Status: PLANNED - Not yet implemented

Purpose:
    JWT-based authentication for REST API and MQTT broker configuration.

Current Implementation:
    - core/security.py provides JWT utilities (IMPLEMENTED)
    - api/dependencies.py has verify_api_key() for basic auth (IMPLEMENTED)
    - Full JWT auth flow is NOT yet implemented

Planned Endpoints:
    POST /login                        User login → JWT token
    POST /register                     User registration
    POST /refresh                      Refresh access token
    POST /logout                       Token blacklist
    POST /mqtt/configure               MQTT auth configuration
    GET  /mqtt/status                  MQTT auth status

Security Requirements:
    - JWT tokens with expiration
    - Password hashing (bcrypt)
    - Rate limiting on login attempts
    - Token blacklist for logout

Dependencies:
    - core/security.py (IMPLEMENTED)
    - db/models/user.py (IMPLEMENTED)
    - db/repositories/user_repo.py (IMPLEMENTED)

References:
    - .claude/PI_SERVER_REFACTORING.md (Lines 115-123)
"""

from fastapi import APIRouter

router = APIRouter(prefix="/auth", tags=["auth"])


# NOTE: When implementing, ensure:
# 1. Password hashing with bcrypt (see core/security.py)
# 2. JWT token generation with expiration
# 3. Rate limiting on /login (max 5 attempts/minute)
# 4. Token blacklist for /logout (Redis or DB)
#
# Example:
# @router.post("/login")
# async def login(
#     credentials: LoginRequest,
#     db: Session = Depends(get_db)
# ) -> TokenResponse:
#     raise NotImplementedError("Phase 5: Authentication - To be implemented")
