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

        # Capture main event loop for async handler execution
        # CRITICAL: SQLAlchemy AsyncEngine is bound to this loop
        # All async handlers MUST run in this loop to avoid "Queue bound to different event loop"
        try:
            self._main_loop = asyncio.get_running_loop()
            logger.info("Captured main event loop for async handler execution")
        except RuntimeError:
            # No running loop - will be set later or handlers will create their own
            self._main_loop = None
            logger.warning("No running event loop during Subscriber init - async handlers may fail")

        # Thread pool for handler dispatch (not execution of async handlers)
        # Used to prevent blocking MQTT network loop
        self.executor = ThreadPoolExecutor(
            max_workers=max_workers,
            thread_name_prefix="mqtt_handler_"
        )

        # Performance metrics
        self.messages_processed = 0
        self.messages_failed = 0

        # Set global message callback
        self.client.set_on_message_callback(self._route_message)

    def set_main_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """
        Set the main event loop for async handler execution.

        Call this if Subscriber was created before async context was available.

        Args:
            loop: The main asyncio event loop
        """
        self._main_loop = loop
        logger.info("Main event loop set for async handler execution")

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
    
    def _get_valid_main_loop(self) -> asyncio.AbstractEventLoop:
        """
        Get a valid main event loop for async handler execution.

        This method validates the cached loop and attempts recovery if it's invalid.
        Prevents "Queue bound to different event loop" errors.

        Returns:
            Valid event loop or None

        Raises:
            RuntimeError: If no valid event loop is available
        """
        # Check if cached loop is still valid
        if self._main_loop is not None and not self._main_loop.is_closed():
            return self._main_loop

        # Cached loop is invalid - log warning and attempt to use the set_main_loop() value
        logger.warning(
            "[Bug O Fix] Cached main event loop is invalid or closed. "
            "This may indicate an event loop lifecycle issue."
        )

        # Cannot automatically recover - the loop must be set explicitly
        raise RuntimeError(
            "Main event loop is not available or has been closed. "
            "Call set_main_loop() to set a valid event loop."
        )

    def _execute_handler(self, handler: Callable, topic: str, payload: dict) -> None:
        """
        Execute handler in thread pool.

        Handles both sync and async handlers transparently.

        CRITICAL FIX (2025-12-30):
        Async handlers are scheduled in the MAIN event loop using run_coroutine_threadsafe().
        This ensures SQLAlchemy AsyncEngine (bound to main loop) works correctly.
        Previously, creating a new event loop per thread caused "Queue bound to different event loop".

        BUG O FIX (2026-01-05):
        Added robust loop validation to prevent "Queue bound to different event loop" errors
        in Python 3.12+ which is stricter about event loop binding.

        Args:
            handler: Handler function (sync or async)
            topic: MQTT topic
            payload: Parsed payload dict
        """
        try:
            # Check if handler is async (coroutine function)
            if asyncio.iscoroutinefunction(handler):
                # CRITICAL: Run async handler in MAIN event loop
                # SQLAlchemy AsyncEngine's connection pool is bound to main loop
                try:
                    main_loop = self._get_valid_main_loop()
                except RuntimeError as e:
                    logger.error(
                        f"[Bug O] {e} - Handler for {topic} will not be executed."
                    )
                    self.messages_failed += 1
                    return

                # Schedule coroutine in main event loop (thread-safe)
                future = asyncio.run_coroutine_threadsafe(
                    handler(topic, payload),
                    main_loop
                )

                try:
                    # Wait for completion with timeout (30 seconds)
                    result = future.result(timeout=30.0)
                    if result is False:
                        logger.warning(
                            f"Handler returned False for topic {topic} - processing may have failed"
                        )
                except TimeoutError:
                    logger.error(f"Handler timed out for topic {topic} (30s)")
                    self.messages_failed += 1
                except Exception as e:
                    # Check specifically for event loop errors
                    error_str = str(e).lower()
                    if "event loop" in error_str or "queue" in error_str:
                        logger.error(
                            f"[Bug O] Event loop error in handler for {topic}: {e}. "
                            "This may indicate the main loop reference has become invalid."
                        )
                    else:
                        logger.error(f"Async handler failed for topic {topic}: {e}")
                    self.messages_failed += 1
            else:
                # Sync handler - call directly in thread pool
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
            timeout: Max wait time in seconds (ignored in Python 3.14+)
        """
        logger.info("Shutting down MQTT subscriber...")
        # Python 3.9-3.13 supports timeout parameter, Python 3.14+ removed it
        # Use cancel_futures instead for faster shutdown
        try:
            self.executor.shutdown(wait=wait, cancel_futures=True)
        except TypeError:
            # Fallback for older Python versions without cancel_futures
            self.executor.shutdown(wait=wait)
        logger.info(f"Subscriber stats: {self.get_stats()}")
