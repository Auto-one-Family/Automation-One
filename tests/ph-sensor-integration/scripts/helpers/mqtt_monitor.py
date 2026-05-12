"""Optional MQTT topic sniffer for test verification."""

from __future__ import annotations

import threading
import time
from typing import Any


class MqttMonitor:
    """Subscribe to MQTT topics and collect messages for a fixed duration.

    Used in S1 as an optional extra-verification layer.
    No hard failure if MQTT is not reachable.
    """

    def __init__(self, broker_host: str = "localhost", broker_port: int = 1883) -> None:
        self.broker_host = broker_host
        self.broker_port = broker_port
        self._messages: list[dict[str, Any]] = []
        self._client: Any = None
        self._connected = False

    def _on_connect(self, client: Any, userdata: Any, flags: Any, rc: Any) -> None:
        # paho-mqtt 1.x: rc is int (0 = success); paho-mqtt 2.x: rc is ReasonCode object
        self._connected = (rc == 0) if isinstance(rc, int) else rc.is_failure is False

    def _on_message(self, client: Any, userdata: Any, msg: Any) -> None:
        self._messages.append(
            {
                "topic": msg.topic,
                "payload": msg.payload.decode("utf-8", errors="replace"),
                "timestamp": time.time(),
            }
        )

    def subscribe(self, topics: list[str], duration_s: int = 60) -> list[dict[str, Any]]:
        """Listen on `topics` for `duration_s` seconds. Returns collected messages."""
        try:
            import paho.mqtt.client as mqtt  # type: ignore[import]
        except ImportError:
            return []

        self._messages = []
        self._client = mqtt.Client()
        self._client.on_connect = self._on_connect
        self._client.on_message = self._on_message

        try:
            self._client.connect(self.broker_host, self.broker_port, keepalive=60)
        except OSError:
            return []

        for topic in topics:
            self._client.subscribe(topic)

        def _loop() -> None:
            self._client.loop_start()
            time.sleep(duration_s)
            self._client.loop_stop()
            self._client.disconnect()

        thread = threading.Thread(target=_loop, daemon=True)
        thread.start()
        thread.join(timeout=duration_s + 5)
        return list(self._messages)

    def get_messages(self, topic_filter: str) -> list[dict[str, Any]]:
        """Filter collected messages by topic substring."""
        return [m for m in self._messages if topic_filter in m["topic"]]
