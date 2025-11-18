import json
import logging
from typing import Any, Callable, Dict

import paho.mqtt.client as mqtt


class MQTTTestClient:
    def __init__(self, broker: str = "localhost", port: int = 1883):
        self.broker = broker
        self.port = port
        self.client = mqtt.Client()
        self.logger = logging.getLogger("MQTTTestClient")
        self.subscriptions: Dict[str, Callable[[str, Dict[str, Any]], None]] = {}

        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message

    def connect(self) -> None:
        self.logger.info("Connecting to MQTT broker %s:%s", self.broker, self.port)
        self.client.connect(self.broker, self.port, 60)
        self.client.loop_start()

    def disconnect(self) -> None:
        self.logger.info("Disconnecting from MQTT broker")
        self.client.loop_stop()
        self.client.disconnect()

    def subscribe(self, topic: str) -> Callable[[Callable[[str, Dict[str, Any]], None]], Callable[[str, Dict[str, Any]], None]]:
        def decorator(callback: Callable[[str, Dict[str, Any]], None]):
            self.subscriptions[topic] = callback
            return callback

        return decorator

    def publish(self, topic: str, payload: Any, qos: int = 1) -> None:
        if not isinstance(payload, str):
            payload = json.dumps(payload)
        self.logger.debug("Publishing topic=%s payload=%s", topic, payload)
        self.client.publish(topic, payload, qos=qos)

    # Internal callbacks -----------------------------------------------------
    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self.logger.info("Connected to MQTT broker")
            for topic in self.subscriptions.keys():
                self.client.subscribe(topic, qos=1)
        else:
            self.logger.error("Failed to connect to MQTT broker (rc=%s)", rc)

    def _on_message(self, client, userdata, msg):
        payload_str = msg.payload.decode("utf-8") if msg.payload else "{}"
        try:
            payload = json.loads(payload_str)
        except json.JSONDecodeError:
            self.logger.warning("Invalid JSON payload on %s: %s", msg.topic, payload_str)
            payload = {"raw": payload_str}

        for pattern, callback in self.subscriptions.items():
            if self._topic_matches(msg.topic, pattern):
                try:
                    callback(msg.topic, payload)
                except Exception:  # noqa: BLE001
                    self.logger.exception("Error handling message for topic %s", msg.topic)

    def _topic_matches(self, topic: str, pattern: str) -> bool:
        topic_levels = topic.split("/")
        pattern_levels = pattern.split("/")

        for idx, part in enumerate(pattern_levels):
            if part == "#":
                return True
            if part == "+":
                if idx >= len(topic_levels):
                    return False
                continue
            if idx >= len(topic_levels) or topic_levels[idx] != part:
                return False
        return len(topic_levels) == len(pattern_levels)

