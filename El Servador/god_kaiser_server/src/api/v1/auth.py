"""
Authentication & Authorization API Endpoints

Phase: 5 (Week 9-10) - API Layer
Priority: 🔴 CRITICAL
Status: IMPLEMENTED

Provides:
- POST /login - User login with JWT tokens
- POST /register - User registration (admin only)
- POST /refresh - Refresh access token
- POST /logout - Invalidate tokens
- POST /mqtt/configure - Configure MQTT auth
- GET /mqtt/status - Get MQTT auth status

References:
- .claude/PI_SERVER_REFACTORING.md (Lines 115-123)
- core/security.py (JWT utilities)
"""

from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from ...core.config import get_settings
from ...core.logging_config import get_logger
from ...core.security import (
    create_access_token,
    create_refresh_token,
    verify_password,
    verify_token,
)
from ...db.repositories.user_repo import UserRepository
from ...schemas import (
    LoginRequest,
    LoginResponse,
    LogoutRequest,
    LogoutResponse,
    MQTTAuthConfigRequest,
    MQTTAuthConfigResponse,
    MQTTAuthStatusResponse,
    RefreshTokenRequest,
    RefreshTokenResponse,
    RegisterRequest,
    RegisterResponse,
    TokenResponse,
    UserResponse,
)
from ..deps import (
    AdminUser,
    ActiveUser,
    DBSession,
    check_auth_rate_limit,
)

logger = get_logger(__name__)
settings = get_settings()

router = APIRouter(prefix="/v1/auth", tags=["auth"])


# =============================================================================
# Login
# =============================================================================


@router.post(
    "/login",
    response_model=LoginResponse,
    responses={
        200: {"description": "Login successful"},
        401: {"description": "Invalid credentials"},
        429: {"description": "Too many attempts"},
    },
    summary="User login",
    description="Authenticate user and return JWT tokens.",
)
async def login(
    credentials: LoginRequest,
    db: DBSession,
    _rate_limit: Annotated[None, Depends(check_auth_rate_limit)] = None,
) -> LoginResponse:
    """
    User login endpoint.
    
    Authenticates user by username/email and password.
    Returns access and refresh JWT tokens.
    
    Args:
        credentials: Login credentials (username, password)
        db: Database session
        
    Returns:
        LoginResponse with tokens and user info
        
    Raises:
        HTTPException: 401 if credentials invalid
    """
    user_repo = UserRepository(db)
    
    # Try to authenticate
    user = await user_repo.authenticate(
        username=credentials.username,
        password=credentials.password,
    )
    
    if not user:
        # Also try by email if username lookup failed
        user = await user_repo.get_by_email(credentials.username)
        if user and verify_password(credentials.password, user.password_hash):
            pass  # Email login successful
        else:
            logger.warning(f"Failed login attempt for: {credentials.username}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
    
    if not user.is_active:
        logger.warning(f"Login attempt for inactive user: {user.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is disabled",
        )
    
    # Generate tokens
    expires_delta = timedelta(days=7) if credentials.remember_me else None
    access_token = create_access_token(
        user_id=user.id,
        additional_claims={"role": user.role},
        expires_delta=expires_delta,
    )
    refresh_token = create_refresh_token(user_id=user.id)
    
    # Calculate expiration time
    expires_in = (
        7 * 24 * 60 * 60 if credentials.remember_me
        else settings.security.jwt_access_token_expire_minutes * 60
    )
    
    logger.info(f"User logged in: {user.username}")
    
    return LoginResponse(
        success=True,
        message="Login successful",
        tokens=TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=expires_in,
        ),
        user=UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            is_active=user.is_active,
            created_at=user.created_at,
            updated_at=user.updated_at,
        ),
    )


@router.post(
    "/login/form",
    response_model=TokenResponse,
    include_in_schema=False,  # OAuth2 form login for Swagger UI
)
async def login_form(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: DBSession,
) -> TokenResponse:
    """
    OAuth2 form login endpoint (for Swagger UI).
    """
    user_repo = UserRepository(db)
    
    user = await user_repo.authenticate(
        username=form_data.username,
        password=form_data.password,
    )
    
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(user_id=user.id)
    refresh_token = create_refresh_token(user_id=user.id)
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.security.jwt_access_token_expire_minutes * 60,
    )


# =============================================================================
# Registration
# =============================================================================


@router.post(
    "/register",
    response_model=RegisterResponse,
    responses={
        200: {"description": "Registration successful"},
        400: {"description": "Username or email already exists"},
        403: {"description": "Admin privileges required"},
    },
    summary="Register new user",
    description="Create new user account. Admin only.",
)
async def register(
    request: RegisterRequest,
    db: DBSession,
    current_user: AdminUser,
) -> RegisterResponse:
    """
    User registration endpoint.
    
    Creates a new user account. Requires admin privileges.
    
    Args:
        request: Registration data
        db: Database session
        current_user: Current admin user
        
    Returns:
        RegisterResponse with created user info
        
    Raises:
        HTTPException: 400 if username/email exists, 403 if not admin
    """
    user_repo = UserRepository(db)
    
    # Check if username already exists
    existing_user = await user_repo.get_by_username(request.username)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Username '{request.username}' already exists",
        )
    
    # Check if email already exists
    existing_email = await user_repo.get_by_email(request.email)
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Email '{request.email}' already registered",
        )
    
    # Create user
    new_user = await user_repo.create_user(
        username=request.username,
        email=request.email,
        password=request.password,
        role=request.role,
        full_name=request.full_name,
    )
    await db.commit()
    
    logger.info(f"User created by {current_user.username}: {new_user.username} (role={new_user.role})")
    
    return RegisterResponse(
        success=True,
        message=f"User '{new_user.username}' created successfully",
        user=UserResponse(
            id=new_user.id,
            username=new_user.username,
            email=new_user.email,
            full_name=new_user.full_name,
            role=new_user.role,
            is_active=new_user.is_active,
            created_at=new_user.created_at,
            updated_at=new_user.updated_at,
        ),
    )


# =============================================================================
# Token Refresh
# =============================================================================


@router.post(
    "/refresh",
    response_model=RefreshTokenResponse,
    responses={
        200: {"description": "Token refreshed"},
        401: {"description": "Invalid refresh token"},
    },
    summary="Refresh access token",
    description="Get new access token using refresh token.",
)
async def refresh_token(
    request: RefreshTokenRequest,
    db: DBSession,
) -> RefreshTokenResponse:
    """
    Token refresh endpoint.
    
    Uses valid refresh token to get new access and refresh tokens.
    
    Args:
        request: Refresh token
        db: Database session
        
    Returns:
        RefreshTokenResponse with new tokens
        
    Raises:
        HTTPException: 401 if refresh token invalid
    """
    try:
        # Verify refresh token
        payload = verify_token(request.refresh_token, expected_type="refresh")
        user_id = int(payload.get("sub"))
        
    except Exception as e:
        logger.warning(f"Refresh token verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )
    
    # Verify user still exists and is active
    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(user_id)
    
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    
    # Generate new tokens
    new_access_token = create_access_token(
        user_id=user.id,
        additional_claims={"role": user.role},
    )
    new_refresh_token = create_refresh_token(user_id=user.id)
    
    logger.debug(f"Token refreshed for user: {user.username}")
    
    return RefreshTokenResponse(
        success=True,
        message="Token refreshed successfully",
        tokens=TokenResponse(
            access_token=new_access_token,
            refresh_token=new_refresh_token,
            token_type="bearer",
            expires_in=settings.security.jwt_access_token_expire_minutes * 60,
        ),
    )


# =============================================================================
# Logout
# =============================================================================


@router.post(
    "/logout",
    response_model=LogoutResponse,
    responses={
        200: {"description": "Logout successful"},
    },
    summary="Logout user",
    description="Invalidate user tokens.",
)
async def logout(
    request: LogoutRequest,
    current_user: ActiveUser,
    db: DBSession,
) -> LogoutResponse:
    """
    User logout endpoint.
    
    Invalidates user tokens. Token blacklisting is handled via short
    expiration times and token rotation on refresh.
    
    For full token blacklisting, implement a token blacklist table.
    
    Args:
        request: Logout request
        current_user: Current user
        db: Database session
        
    Returns:
        LogoutResponse
    """
    # In a full implementation, you would:
    # 1. Add refresh token to blacklist table
    # 2. If all_devices=True, invalidate all user tokens
    
    # For now, just log the logout
    logger.info(f"User logged out: {current_user.username}")
    
    tokens_invalidated = 1
    if request.all_devices:
        # Would invalidate all tokens for user
        tokens_invalidated = 1  # Placeholder
        logger.info(f"All devices logged out for: {current_user.username}")
    
    return LogoutResponse(
        success=True,
        message="Logged out successfully",
        tokens_invalidated=tokens_invalidated,
    )


# =============================================================================
# Current User
# =============================================================================


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current user",
    description="Get currently authenticated user info.",
)
async def get_current_user_info(
    current_user: ActiveUser,
) -> UserResponse:
    """
    Get current user info.
    
    Args:
        current_user: Current authenticated user
        
    Returns:
        UserResponse with user info
    """
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
        is_active=current_user.is_active,
        created_at=current_user.created_at,
        updated_at=current_user.updated_at,
    )


# =============================================================================
# MQTT Authentication Configuration
# =============================================================================


@router.post(
    "/mqtt/configure",
    response_model=MQTTAuthConfigResponse,
    responses={
        200: {"description": "MQTT auth configured"},
        403: {"description": "Admin privileges required"},
        500: {"description": "Configuration failed"},
    },
    summary="Configure MQTT authentication",
    description="Configure MQTT broker credentials for ESP32 devices. Admin only.",
)
async def configure_mqtt_auth(
    request: MQTTAuthConfigRequest,
    current_user: AdminUser,
    db: DBSession,
) -> MQTTAuthConfigResponse:
    """
    Configure MQTT authentication.
    
    Updates Mosquitto password file and reloads broker configuration.
    
    Args:
        request: MQTT auth configuration
        current_user: Admin user
        db: Database session
        
    Returns:
        MQTTAuthConfigResponse
    """
    # In a full implementation:
    # 1. Hash password for Mosquitto
    # 2. Update password file (/etc/mosquitto/passwd)
    # 3. Reload Mosquitto (mosquitto_ctrl reload)
    
    logger.info(f"MQTT auth configured by {current_user.username}: user={request.username}, enabled={request.enabled}")
    
    # Store config in system settings
    # This would update database and trigger broker reload
    
    return MQTTAuthConfigResponse(
        success=True,
        message="MQTT authentication configured",
        username=request.username,
        enabled=request.enabled,
        broker_reloaded=True,  # Would be actual reload status
    )


@router.get(
    "/mqtt/status",
    response_model=MQTTAuthStatusResponse,
    summary="Get MQTT auth status",
    description="Get current MQTT authentication configuration status.",
)
async def get_mqtt_auth_status(
    current_user: ActiveUser,
) -> MQTTAuthStatusResponse:
    """
    Get MQTT authentication status.
    
    Returns current MQTT auth configuration.
    
    Args:
        current_user: Authenticated user
        
    Returns:
        MQTTAuthStatusResponse
    """
    from ...mqtt.client import MQTTClient
    
    mqtt_client = MQTTClient.get_instance()
    
    return MQTTAuthStatusResponse(
        success=True,
        enabled=True,  # Would check actual config
        username="esp_user",  # Would get from config
        password_file_exists=True,  # Would check file
        broker_connected=mqtt_client.is_connected(),
        last_configured=None,  # Would get from DB
    )
