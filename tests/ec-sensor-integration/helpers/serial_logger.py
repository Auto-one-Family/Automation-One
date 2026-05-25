from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(slots=True)
class SerialGateNote:
    esp_id: str
    serial_device: str
    confirmed_by: str
    confirmed_at_utc: str


def build_serial_gate_note(esp_id: str, serial_device: str, confirmed_by: str) -> SerialGateNote:
    return SerialGateNote(
        esp_id=esp_id,
        serial_device=serial_device,
        confirmed_by=confirmed_by,
        confirmed_at_utc=datetime.now(timezone.utc).isoformat(),
    )
