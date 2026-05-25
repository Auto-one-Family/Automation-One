from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(slots=True)
class MqttObservation:
    topic: str
    qos: int
    payload_excerpt: str
    observed_at_utc: str


def build_observation(topic: str, qos: int, payload_excerpt: str) -> MqttObservation:
    return MqttObservation(
        topic=topic,
        qos=qos,
        payload_excerpt=payload_excerpt,
        observed_at_utc=datetime.now(timezone.utc).isoformat(),
    )
