"""ACK-gesteuerte MQTT-Command-Bridge fuer kritische Operationen.

Ergaenzt den bestehenden Publisher um ACK-Waiting fuer Zone/Subzone-Operationen.
Fire-and-forget bleibt ueber den Publisher fuer unkritische Nachrichten bestehen.

Thread-Safety: Alle Methoden muessen auf dem FastAPI Event Loop aufgerufen werden.
resolve_ack() wird von MQTT-Handlern aufgerufen die via run_coroutine_threadsafe()
bereits auf dem FastAPI Loop dispatched wurden — daher kein Thread-Problem.
"""

import asyncio
import json
import logging
import time
from collections import deque
from typing import Any
from uuid import uuid4

from ..mqtt.client import MQTTClient
from ..core.constants import QOS_SENSOR_DATA

logger = logging.getLogger("god_kaiser.mqtt_command_bridge")


class MQTTACKTimeoutError(Exception):
    """No ACK received within the timeout period."""

    pass


class MQTTCommandBridge:
    """ACK-gesteuerte MQTT-Command-Bridge.

    Verwendet asyncio.Future fuer ACK-Waiting. Laeuft auf dem FastAPI Event Loop.
    ACK-Handler (zone_ack_handler, subzone_ack_handler) rufen resolve_ack() auf.
    """

    DEFAULT_TIMEOUT: float = 15.0

    def __init__(self, mqtt_client: MQTTClient):
        self._mqtt_client = mqtt_client
        self._pending: dict[str, asyncio.Future] = {}
        # Fallback-Index: (esp_id, command_type) -> deque[correlation_id] (FIFO)
        self._esp_pending: dict[tuple[str, str], deque[str]] = {}
        broker_host = "N/A"
        broker_port = "N/A"
        if self._mqtt_client:
            try:
                broker_host = self._mqtt_client.settings.mqtt.broker_host
                broker_port = self._mqtt_client.settings.mqtt.broker_port
            except Exception:
                pass
        logger.info(
            "MQTTCommandBridge initialized (client_connected=%s, broker=%s:%s)",
            self._is_connected(),
            broker_host,
            broker_port,
        )

    async def send_and_wait_ack(
        self,
        topic: str,
        payload: dict[str, Any],
        esp_id: str,
        command_type: str = "zone",
        timeout: float = DEFAULT_TIMEOUT,
    ) -> dict[str, Any]:
        """Publish MQTT and wait for ACK from ESP.

        Args:
            topic: MQTT topic (e.g. kaiser/god/esp/ESP_AB12CD/zone/assign)
            payload: Message payload as dict. correlation_id is added automatically.
            esp_id: ESP device_id string (e.g. "ESP_AB12CD34") for fallback matching.
            command_type: "zone" or "subzone" — determines fallback queue.
            timeout: Max seconds to wait for ACK. Default 15s.

        Returns:
            ACK payload as dict (e.g. {"status": "zone_assigned", "zone_id": "zone_b", ...})

        Raises:
            MQTTACKTimeoutError: No ACK within timeout or MQTT publish failed.
        """
        correlation_id = str(uuid4())
        payload["correlation_id"] = correlation_id

        loop = asyncio.get_running_loop()
        future = loop.create_future()
        self._pending[correlation_id] = future

        key = (esp_id, command_type)
        self._esp_pending.setdefault(key, deque()).append(correlation_id)

        logger.debug(
            "Sending %s command to %s (correlation_id=%s, topic=%s)",
            command_type,
            esp_id,
            correlation_id,
            topic,
        )

        # MQTTClient.publish() is synchronous — blocks only briefly (paho buffers internally)
        payload_str = json.dumps(payload)
        success = self._mqtt_client.publish(topic, payload_str, qos=QOS_SENSOR_DATA)

        if success:
            logger.info(
                "%s command SENT to %s (topic=%s, correlation_id=%s, client_connected=%s)",
                command_type,
                esp_id,
                topic,
                correlation_id,
                self._is_connected(),
            )

        if not success:
            client_state = self._get_client_state()
            logger.warning(
                "MQTT publish failed for %s — %s",
                topic,
                client_state,
            )
            self._cleanup(correlation_id, key)
            raise MQTTACKTimeoutError(f"MQTT publish failed for {topic} ({client_state})")

        send_time = time.monotonic()
        try:
            result = await asyncio.wait_for(future, timeout=timeout)
            duration_ms = int((time.monotonic() - send_time) * 1000)
            logger.info(
                "ACK received for %s %s (correlation_id=%s, status=%s, duration_ms=%d)",
                esp_id,
                command_type,
                correlation_id,
                result.get("status"),
                duration_ms,
            )
            return result
        except asyncio.TimeoutError:
            duration_ms = int((time.monotonic() - send_time) * 1000)
            logger.warning(
                "ACK timeout for %s %s (correlation_id=%s, timeout=%ss, elapsed_ms=%d)",
                esp_id,
                command_type,
                correlation_id,
                timeout,
                duration_ms,
            )
            raise MQTTACKTimeoutError(
                f"No ACK for {esp_id} {command_type} "
                f"(correlation_id={correlation_id}) within {timeout}s"
            )
        finally:
            self._cleanup(correlation_id, key)

    def resolve_ack(
        self,
        ack_data: dict[str, Any],
        esp_id: str,
        command_type: str = "zone",
    ) -> bool:
        """Resolve a pending Future with ACK data. Called by ACK-Handlers.

        Matching strategy (in order):
        1. Exact match via correlation_id in ack_data payload
        2. Fallback: oldest pending Future for (esp_id, command_type) — FIFO

        Args:
            ack_data: ACK payload from ESP (dict with status, zone_id/subzone_id, etc.)
            esp_id: ESP device_id string (parsed from topic)
            command_type: "zone" or "subzone"

        Returns:
            True if a Future was resolved, False if no match.
        """
        # Strategy 1: Exact correlation_id match
        cid = ack_data.get("correlation_id")
        if cid and cid in self._pending:
            future = self._pending[cid]
            if not future.done():
                future.set_result(ack_data)
                logger.debug("ACK resolved via correlation_id=%s", cid)
                return True

        # Strategy 2: Fallback via (esp_id, command_type) — oldest pending Future
        key = (esp_id, command_type)
        pending_queue = self._esp_pending.get(key)
        if pending_queue:
            while pending_queue:
                oldest_cid = pending_queue[0]
                future = self._pending.get(oldest_cid)
                if future and not future.done():
                    future.set_result(ack_data)
                    pending_queue.popleft()
                    logger.debug(
                        "ACK resolved via fallback for %s/%s (correlation_id=%s)",
                        esp_id,
                        command_type,
                        oldest_cid,
                    )
                    return True
                pending_queue.popleft()  # Stale entry, skip

        logger.debug("No pending Future for ACK from %s/%s", esp_id, command_type)
        return False

    def has_pending(self, esp_id: str, command_type: str = "zone") -> bool:
        """Check if there are pending (non-resolved) operations for an ESP.

        Useful for Heartbeat-Handler: during pending operations no
        Zone-Mismatch-Warning should be fired.
        """
        key = (esp_id, command_type)
        queue = self._esp_pending.get(key)
        if not queue:
            return False
        return any(cid in self._pending and not self._pending[cid].done() for cid in queue)

    async def shutdown(self) -> None:
        """Cancel all pending Futures. Called during server shutdown."""
        count = 0
        for cid, future in self._pending.items():
            if not future.done():
                future.cancel()
                count += 1
        self._pending.clear()
        self._esp_pending.clear()
        logger.info("MQTTCommandBridge shutdown complete (%d pending cancelled)", count)

    def _is_connected(self) -> bool:
        """Check if the underlying MQTT client is connected."""
        if self._mqtt_client is None:
            return False
        return self._mqtt_client.is_connected()

    def _get_client_state(self) -> str:
        """Return diagnostic string about MQTT client connection state."""
        if self._mqtt_client is None:
            return "client=None (not injected)"
        return f"client_connected={self._mqtt_client.is_connected()}"

    def _cleanup(self, correlation_id: str, key: tuple[str, str]) -> None:
        """Remove a correlation_id from all tracking structures."""
        self._pending.pop(correlation_id, None)
        queue = self._esp_pending.get(key)
        if queue:
            try:
                queue.remove(correlation_id)
            except ValueError:
                pass
            if not queue:
                del self._esp_pending[key]
