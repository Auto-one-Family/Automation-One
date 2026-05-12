"""COM3 serial log capture for ESP32 verification."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Optional

HEARTBEAT_PATTERNS = ("heartbeat", "config_push", "CONFIG_PUSH", "config push", "HEARTBEAT")


def capture_serial(
    port: str,
    baud: int,
    duration_s: int,
    output_path: Path,
    *,
    encoding: str = "utf-8",
    errors: str = "replace",
) -> list[str]:
    """Read serial output for `duration_s` seconds, write to `output_path`.

    Returns a list of all captured lines.
    Raises ImportError if pyserial is not installed.
    Raises SerialException if port cannot be opened — caller should handle gracefully.
    """
    try:
        import serial  # type: ignore[import]
    except ImportError as exc:
        raise ImportError("pyserial is required: pip install pyserial") from exc

    lines: list[str] = []
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    deadline = time.monotonic() + duration_s

    with serial.Serial(port, baud, timeout=1) as ser, output_path.open("wb") as fh:
        while time.monotonic() < deadline:
            raw = ser.readline()
            if raw:
                line = raw.decode(encoding, errors=errors).rstrip("\r\n")
                fh.write((line + "\n").encode("utf-8", errors="replace"))
                fh.flush()
                lines.append(line)

    return lines


def find_heartbeat_ack(lines: list[str]) -> Optional[str]:
    """Return the first line containing a heartbeat/config-push pattern, or None."""
    for line in lines:
        if any(p in line for p in HEARTBEAT_PATTERNS):
            return line
    return None
