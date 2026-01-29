"""
Structured Logging Setup mit JSON-Format und File-Rotation
"""

import json
import logging
import logging.handlers
import sys
from pathlib import Path
from typing import Any, Dict

from .config import get_settings
from .request_context import get_request_id


class RequestIdFilter(logging.Filter):
    """Filter that adds request_id to every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id() or "-"
        return True


class JSONFormatter(logging.Formatter):
    """Custom JSON formatter for structured logging"""

    def format(self, record: logging.LogRecord) -> str:
        """
        Format log record as JSON.

        Args:
            record: Log record to format

        Returns:
            str: JSON-formatted log message
        """
        log_data: Dict[str, Any] = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        # Add request_id for request correlation
        request_id = getattr(record, "request_id", "-")
        if request_id and request_id != "-":
            log_data["request_id"] = request_id

        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        # Add extra fields from record
        if hasattr(record, "extra"):
            log_data.update(record.extra)

        return json.dumps(log_data, default=str)


class TextFormatter(logging.Formatter):
    """Standard text formatter for human-readable logs"""

    def format(self, record: logging.LogRecord) -> str:
        """
        Format log record as text.

        Args:
            record: Log record to format

        Returns:
            str: Formatted log message
        """
        return super().format(record)


def setup_logging() -> None:
    """
    Setup logging configuration based on settings.

    Creates log directory if it doesn't exist and configures
    file and console handlers with appropriate formatters.
    """
    # Bug Z Fix: Windows Console kann keine Unicode-Zeichen (Emojis, Pfeile) darstellen
    # Ersetze nicht darstellbare Zeichen durch '?' statt einen UnicodeEncodeError zu werfen
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(errors="replace")
            sys.stderr.reconfigure(errors="replace")
        except AttributeError:
            # Python < 3.7 hat kein reconfigure()
            pass

    settings = get_settings()

    # Create logs directory
    log_path = Path(settings.logging.file_path)
    log_path.parent.mkdir(parents=True, exist_ok=True)

    # Get root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, settings.logging.level))

    # Remove existing handlers to avoid duplicates
    root_logger.handlers.clear()

    # Add request_id filter to root logger (applies to all handlers)
    root_logger.addFilter(RequestIdFilter())

    # Create formatters
    if settings.logging.format == "json":
        formatter = JSONFormatter(datefmt="%Y-%m-%d %H:%M:%S")
    else:
        formatter = TextFormatter(
            fmt="%(asctime)s - %(name)s - %(levelname)s - [%(request_id)s] - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

    # File handler with rotation
    file_handler = logging.handlers.RotatingFileHandler(
        filename=settings.logging.file_path,
        maxBytes=settings.logging.file_max_bytes,
        backupCount=settings.logging.file_backup_count,
        encoding="utf-8",
    )
    file_handler.setLevel(getattr(logging, settings.logging.level))
    file_handler.setFormatter(formatter)
    root_logger.addHandler(file_handler)

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(getattr(logging, settings.logging.level))

    # Use text formatter for console (easier to read)
    console_formatter = TextFormatter(
        fmt="%(asctime)s - %(name)s - %(levelname)s - [%(request_id)s] - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    console_handler.setFormatter(console_formatter)
    root_logger.addHandler(console_handler)

    # Reduce noise from external libraries
    logging.getLogger("paho.mqtt").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)

    root_logger.info(
        f"Logging configured: level={settings.logging.level}, "
        f"format={settings.logging.format}, file={settings.logging.file_path}"
    )


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger instance with the specified name.

    Args:
        name: Logger name (typically __name__)

    Returns:
        logging.Logger: Configured logger instance
    """
    return logging.getLogger(name)
