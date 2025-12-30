"""
Global Exception Handlers für FastAPI

Paket X: Code Consolidation & Industrial Quality
Standardisiertes Error-Handling für alle API-Endpoints.
"""

from fastapi import Request
from fastapi.responses import JSONResponse

from .exceptions import GodKaiserException
from .logging_config import get_logger

logger = get_logger(__name__)


async def automation_one_exception_handler(
    request: Request,
    exc: GodKaiserException,
) -> JSONResponse:
    """
    Global exception handler für GodKaiserException.

    Konvertiert Exceptions in standardisiertes API Response Format:
    {
        "success": false,
        "error": {
            "code": "ERROR_CODE",
            "message": "Error message",
            "details": {...}
        }
    }
    """
    logger.warning(
        f"API error: {exc.error_code} - {exc.message}",
        extra={
            "error_code": exc.error_code,
            "path": request.url.path,
            "method": request.method,
            "details": exc.details,
        },
    )

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {
                "code": exc.error_code,
                "message": exc.message,
                "details": exc.details,
            },
        },
    )


async def general_exception_handler(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    """
    Fallback exception handler für unerwartete Exceptions.

    Sollte nie aufgerufen werden in Production, aber als Safety-Net vorhanden.
    """
    logger.error(
        f"Unhandled exception: {type(exc).__name__} - {str(exc)}",
        exc_info=True,
        extra={
            "path": request.url.path,
            "method": request.method,
        },
    )

    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred",
                "details": {},
            },
        },
    )



