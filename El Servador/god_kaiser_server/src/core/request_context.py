"""
Request-Context for request_id tracking.

Uses contextvars to pass request_id through all layers
without explicit parameter passing.
"""
from contextvars import ContextVar
from typing import Optional
import uuid

_request_id_ctx: ContextVar[Optional[str]] = ContextVar('request_id', default=None)


def get_request_id() -> Optional[str]:
    """Return the current request_id (or None)."""
    return _request_id_ctx.get()


def set_request_id(request_id: str) -> None:
    """Set the request_id for the current context."""
    _request_id_ctx.set(request_id)


def generate_request_id() -> str:
    """Generate a new request_id."""
    return str(uuid.uuid4())


def clear_request_id() -> None:
    """Clear the request_id from context."""
    _request_id_ctx.set(None)
