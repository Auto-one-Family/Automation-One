"""
MQTT Subscriber

Topic subscription management and message routing to handlers.

Features:
- Async handler support with thread-pool execution
- Pattern-based routing
- Error isolation (handler failures don't crash subscriber)
- Performance monitoring
"""

import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from typing import Callable, Dict, Optional

from ..core import constants
from ..core.logging_config import get_logger
from .client import MQTTClient
from .topics import TopicBuilder

logger = get_logger(__name__)


class Subscriber:
    """
    MQTT Subscriber with handler registry and message routing.

    Manages topic subscriptions and routes incoming messages to
    registered handler functions based on topic patterns.
    """

    def __init__(self, mqtt_client: Optional[MQTTClient] = None, max_workers: int = 10):
        """
        Initialize Subscriber.

        Args:
            mqtt_client: MQTT client instance (uses singleton if None)
            max_workers: Max concurrent handler threads (default: 10)
        """
        self.client = mqtt_client or MQTTClient.get_instance()
        self.handlers: Dict[str, Callable] = {}
        
        # Thread pool for async handler execution
        # Allows concurrent processing of messages without blocking MQTT loop
        self.executor = ThreadPoolExecutor(
            max_workers=max_workers,
            thread_name_prefix="mqtt_handler_"
        )
        
        # Performance metrics
        self.messages_processed = 0
        self.messages_failed = 0

        # Set global message callback
        self.client.set_on_message_callback(self._route_message)

    def register_handler(self, topic_pattern: str, handler: Callable) -> None:
        """
        Register handler for topic pattern.

        Args:
            topic_pattern: MQTT topic pattern (supports wildcards: +, #)
            handler: Handler function(topic: str, payload: dict)

        Example:
            subscriber.register_handler(
                "kaiser/god/esp/+/sensor/+/data",
                sensor_handler.handle_sensor_data
            )
        """
        self.handlers[topic_pattern] = handler
        logger.info(f"Registered handler for pattern: {topic_pattern}")

    def subscribe_all(self) -> bool:
        """
        Subscribe to all registered handler topic patterns.

        Subscribes to all patterns that have handlers registered via register_handler().
        QoS levels are determined by topic type:
        - Sensor data: QoS 1 (at least once)
        - Actuator status: QoS 1 (at least once)
        - Heartbeat: QoS 0 (at most once - fire and forget)
        - Discovery: QoS 1 (at least once)
        - Config Response: QoS 2 (exactly once)

        Returns:
            True if all subscriptions successful
        """
        success = True
        
        # Subscribe to all registered handler patterns
        for pattern in self.handlers.keys():
            # Determine QoS based on topic type
            if "heartbeat" in pattern:
                qos = 0  # Heartbeat: QoS 0
            elif "config_response" in pattern or "config/ack" in pattern:
                qos = 2  # Config: QoS 2 (exactly once)
            else:
                qos = 1  # Default: QoS 1 (at least once)
            
            if not self.client.subscribe(pattern, qos):
                logger.error(f"Failed to subscribe to: {pattern}")
                success = False
            else:
                logger.debug(f"Subscribed to: {pattern} (QoS {qos})")

        return success

    def subscribe(self, topic: str, qos: int = 1) -> bool:
        """
        Subscribe to specific topic.

        Args:
            topic: MQTT topic pattern
            qos: QoS level (0, 1, or 2)

        Returns:
            True if subscription successful
        """
        return self.client.subscribe(topic, qos)

    def _route_message(self, topic: str, payload_str: str) -> None:
        """
        Route incoming message to appropriate handler.
        
        Uses thread pool to execute async handlers without blocking MQTT loop.
        Each message is processed in isolation - handler failures don't affect others.

        Args:
            topic: MQTT topic
            payload_str: Message payload (JSON string)
        """
        try:
            # Parse JSON payload
            try:
                payload = json.loads(payload_str)
            except json.JSONDecodeError as e:
                logger.error(f"Invalid JSON payload on topic {topic}: {e}")
                self.messages_failed += 1
                return

            # Find matching handler
            handler = self._find_handler(topic)
            if handler:
                # Submit handler to thread pool for async execution
                # This prevents blocking MQTT network loop
                self.executor.submit(self._execute_handler, handler, topic, payload)
                self.messages_processed += 1
            else:
                logger.warning(f"No handler registered for topic: {topic}")

        except Exception as e:
            logger.error(
                f"Error routing message from {topic}: {e}",
                exc_info=True
            )
            self.messages_failed += 1
    
    def _execute_handler(self, handler: Callable, topic: str, payload: dict) -> None:
        """
        Execute handler in thread pool.
        
        Handles both sync and async handlers transparently.
        Runs async handlers in new event loop for isolation.

        Args:
            handler: Handler function (sync or async)
            topic: MQTT topic
            payload: Parsed payload dict
        """
        try:
            # Check if handler is async (coroutine function)
            if asyncio.iscoroutinefunction(handler):
                # Create new event loop for this thread
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    # Run async handler to completion
                    result = loop.run_until_complete(handler(topic, payload))
                    if result is False:
                        logger.warning(
                            f"Handler returned False for topic {topic} - processing may have failed"
                        )
                finally:
                    loop.close()
            else:
                # Sync handler - call directly
                result = handler(topic, payload)
                if result is False:
                    logger.warning(
                        f"Handler returned False for topic {topic} - processing may have failed"
                    )
                    
        except Exception as e:
            logger.error(
                f"Handler execution failed for topic {topic}: {e}",
                exc_info=True
            )
            self.messages_failed += 1

    def _find_handler(self, topic: str) -> Optional[Callable]:
        """
        Find handler for topic by matching against registered patterns.

        Args:
            topic: Actual MQTT topic

        Returns:
            Handler function or None
        """
        for pattern, handler in self.handlers.items():
            if TopicBuilder.matches_subscription(topic, pattern):
                return handler
        return None

    def unregister_handler(self, topic_pattern: str) -> bool:
        """
        Unregister handler for topic pattern.

        Args:
            topic_pattern: MQTT topic pattern

        Returns:
            True if handler was removed
        """
        if topic_pattern in self.handlers:
            del self.handlers[topic_pattern]
            logger.info(f"Unregistered handler for pattern: {topic_pattern}")
            return True
        return False

    def get_registered_patterns(self) -> list:
        """
        Get list of registered topic patterns.

        Returns:
            List of topic patterns
        """
        return list(self.handlers.keys())
    
    def get_stats(self) -> dict:
        """
        Get subscriber performance statistics.
        
        Returns:
            {
                "messages_processed": int,
                "messages_failed": int,
                "success_rate": float
            }
        """
        total = self.messages_processed + self.messages_failed
        success_rate = (self.messages_processed / total * 100) if total > 0 else 0.0
        
        return {
            "messages_processed": self.messages_processed,
            "messages_failed": self.messages_failed,
            "success_rate": round(success_rate, 2)
        }
    
    def shutdown(self, wait: bool = True, timeout: float = 30.0):
        """
        Shutdown subscriber and thread pool.
        
        Args:
            wait: Wait for pending tasks to complete
            timeout: Max wait time in seconds
        """
        logger.info("Shutting down MQTT subscriber...")
        self.executor.shutdown(wait=wait, timeout=timeout)
        logger.info(f"Subscriber stats: {self.get_stats()}")
