"""
Middleware for automatic request_id generation and tracking.

Generates a UUID for each incoming HTTP request, stores it in a
context variable (accessible by loggers and services), and adds
an X-Request-ID header to the response.
"""
import time
import logging

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from typing import Callable

from ..core.request_context import (
    generate_request_id,
    set_request_id,
    clear_request_id,
)

logger = logging.getLogger(__name__)


class RequestIdMiddleware(BaseHTTPMiddleware):
    """
    Middleware that assigns a unique ID to each request.

    - Accepts X-Request-ID from client or generates a new UUID
    - Stores in context variable (for logging and audit)
    - Adds X-Request-ID header to response
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get("X-Request-ID") or generate_request_id()

        set_request_id(request_id)

        start_time = time.monotonic()

        try:
            response = await call_next(request)

            duration_ms = (time.monotonic() - start_time) * 1000
            logger.info(
                "Request completed: %s %s status=%d duration=%.1fms",
                request.method,
                request.url.path,
                response.status_code,
                duration_ms,
            )

            response.headers["X-Request-ID"] = request_id
            return response

        except Exception as e:
            duration_ms = (time.monotonic() - start_time) * 1000
            logger.error(
                "Request failed: %s %s error=%s duration=%.1fms",
                request.method,
                request.url.path,
                str(e),
                duration_ms,
            )
            raise

        finally:
            clear_request_id()
