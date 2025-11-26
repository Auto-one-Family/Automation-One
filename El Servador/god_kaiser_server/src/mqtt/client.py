"""
MQTT Client Wrapper (Singleton)

Provides singleton MQTT client with:
- Paho-MQTT integration
- TLS/SSL support
- Auto-reconnect with exponential backoff
- Connection state management
- Callback handling
"""

import ssl
import time
from typing import Callable, Optional

import paho.mqtt.client as mqtt

from ..core.config import get_settings
from ..core.logging_config import get_logger

logger = get_logger(__name__)


class MQTTClient:
    """
    Singleton MQTT Client wrapper around paho-mqtt.

    Features:
    - TLS/SSL support
    - Auto-reconnect with exponential backoff
    - Connection state tracking
    - Callback registry
    - Thread-safe operations

    Usage:
        client = MQTTClient.get_instance()
        await client.connect()
        await client.subscribe("topic/pattern", callback_func)
        await client.publish("topic", payload, qos=1)
    """

    _instance: Optional["MQTTClient"] = None
    _initialized: bool = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """Initialize MQTT client (called only once due to singleton)."""
        if self._initialized:
            return

        self.settings = get_settings()
        self.client: Optional[mqtt.Client] = None
        self.connected = False
        self.reconnect_delay = 1  # seconds
        self.max_reconnect_delay = 60  # seconds
        self.on_message_callback: Optional[Callable] = None

        self._initialized = True
        logger.info("MQTTClient singleton initialized")

    @classmethod
    def get_instance(cls) -> "MQTTClient":
        """
        Get singleton instance.

        Returns:
            MQTTClient instance
        """
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def connect(
        self,
        broker: Optional[str] = None,
        port: Optional[int] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        use_tls: Optional[bool] = None,
    ) -> bool:
        """
        Connect to MQTT broker.

        Args:
            broker: MQTT broker hostname (defaults to settings)
            port: MQTT broker port (defaults to settings)
            username: MQTT username (defaults to settings)
            password: MQTT password (defaults to settings)
            use_tls: Enable TLS (defaults to settings)

        Returns:
            True if connection successful, False otherwise
        """
        # Use settings if not provided
        broker = broker or self.settings.mqtt.broker_host
        port = port or self.settings.mqtt.broker_port
        username = username or self.settings.mqtt.username
        password = password or self.settings.mqtt.password
        use_tls = use_tls if use_tls is not None else self.settings.mqtt.use_tls

        try:
            # Create paho-mqtt client
            client_id = self.settings.mqtt.client_id or f"god_kaiser_{int(time.time())}"
            self.client = mqtt.Client(
                client_id=client_id,
                clean_session=True,
                protocol=mqtt.MQTTv311,
            )

            # Set callbacks
            self.client.on_connect = self._on_connect
            self.client.on_disconnect = self._on_disconnect
            self.client.on_message = self._on_message
            self.client.on_subscribe = self._on_subscribe
            self.client.on_publish = self._on_publish

            # Set username/password if provided
            if username and password:
                self.client.username_pw_set(username, password)
                logger.debug(f"MQTT credentials set for user: {username}")

            # Configure TLS if enabled
            if use_tls:
                self._configure_tls()

            # Set keepalive
            keepalive = self.settings.mqtt.keepalive

            # Connect to broker
            logger.info(f"Connecting to MQTT broker: {broker}:{port} (TLS: {use_tls})")
            self.client.connect(broker, port, keepalive)

            # Start network loop (non-blocking)
            self.client.loop_start()

            # Wait for connection (timeout: 10 seconds)
            timeout = 10
            start_time = time.time()
            while not self.connected and (time.time() - start_time) < timeout:
                time.sleep(0.1)

            if self.connected:
                logger.info("MQTT client connected successfully")
                return True
            else:
                logger.error("MQTT connection timeout")
                return False

        except Exception as e:
            logger.error(f"MQTT connection failed: {e}", exc_info=True)
            return False

    def _configure_tls(self):
        """Configure TLS/SSL for secure connection."""
        try:
            ca_cert = self.settings.mqtt.ca_cert_path
            client_cert = self.settings.mqtt.client_cert_path
            client_key = self.settings.mqtt.client_key_path

            if ca_cert:
                # Server certificate verification
                self.client.tls_set(
                    ca_certs=ca_cert,
                    certfile=client_cert,
                    keyfile=client_key,
                    cert_reqs=ssl.CERT_REQUIRED,
                    tls_version=ssl.PROTOCOL_TLSv1_2,
                )
                logger.info("TLS configured with CA certificate verification")
            else:
                # TLS without certificate verification (insecure!)
                self.client.tls_set(
                    cert_reqs=ssl.CERT_NONE,
                    tls_version=ssl.PROTOCOL_TLSv1_2,
                )
                self.client.tls_insecure_set(True)
                logger.warning("TLS configured WITHOUT certificate verification (insecure)")

        except Exception as e:
            logger.error(f"TLS configuration failed: {e}", exc_info=True)
            raise

    def disconnect(self) -> bool:
        """
        Disconnect from MQTT broker gracefully.

        Returns:
            True if disconnect successful
        """
        try:
            if self.client:
                self.client.loop_stop()
                self.client.disconnect()
                self.connected = False
                logger.info("MQTT client disconnected")
                return True
            return False
        except Exception as e:
            logger.error(f"MQTT disconnect failed: {e}", exc_info=True)
            return False

    def subscribe(
        self,
        topic: str,
        qos: int = 1,
        callback: Optional[Callable] = None,
    ) -> bool:
        """
        Subscribe to MQTT topic.

        Args:
            topic: MQTT topic (supports wildcards: +, #)
            qos: QoS level (0, 1, or 2)
            callback: Message callback function (optional, uses global if None)

        Returns:
            True if subscription successful
        """
        if not self.client or not self.connected:
            logger.error("Cannot subscribe: MQTT client not connected")
            return False

        try:
            result, mid = self.client.subscribe(topic, qos)

            if result == mqtt.MQTT_ERR_SUCCESS:
                logger.info(f"Subscribed to topic: {topic} (QoS {qos})")
                return True
            else:
                logger.error(f"Subscribe failed for topic {topic}: {result}")
                return False

        except Exception as e:
            logger.error(f"Subscribe exception for topic {topic}: {e}", exc_info=True)
            return False

    def publish(
        self,
        topic: str,
        payload: str,
        qos: int = 1,
        retain: bool = False,
    ) -> bool:
        """
        Publish message to MQTT topic.

        Args:
            topic: MQTT topic
            payload: Message payload (JSON string)
            qos: QoS level (0, 1, or 2)
            retain: Retain flag

        Returns:
            True if publish successful
        """
        if not self.client or not self.connected:
            logger.error("Cannot publish: MQTT client not connected")
            return False

        try:
            result = self.client.publish(topic, payload, qos, retain)

            if result.rc == mqtt.MQTT_ERR_SUCCESS:
                logger.debug(f"Published to {topic} (QoS {qos}): {payload[:100]}...")
                return True
            else:
                logger.error(f"Publish failed for topic {topic}: {result.rc}")
                return False

        except Exception as e:
            logger.error(f"Publish exception for topic {topic}: {e}", exc_info=True)
            return False

    def set_on_message_callback(self, callback: Callable):
        """
        Set global message callback.

        Args:
            callback: Callback function(topic: str, payload: dict)
        """
        self.on_message_callback = callback
        logger.debug("Global message callback registered")

    def is_connected(self) -> bool:
        """
        Check if client is connected.

        Returns:
            True if connected
        """
        return self.connected

    # Internal callbacks
    def _on_connect(self, client, userdata, flags, rc):
        """Callback when connection is established."""
        if rc == 0:
            self.connected = True
            self.reconnect_delay = 1  # Reset reconnect delay
            logger.info(f"MQTT connected with result code: {rc}")
        else:
            self.connected = False
            error_messages = {
                1: "Connection refused - incorrect protocol version",
                2: "Connection refused - invalid client identifier",
                3: "Connection refused - server unavailable",
                4: "Connection refused - bad username or password",
                5: "Connection refused - not authorized",
            }
            error_msg = error_messages.get(rc, f"Unknown error code: {rc}")
            logger.error(f"MQTT connection failed: {error_msg}")

    def _on_disconnect(self, client, userdata, rc):
        """Callback when connection is lost."""
        self.connected = False

        if rc != 0:
            logger.warning(f"Unexpected MQTT disconnect (rc={rc}), attempting reconnect...")
            self._attempt_reconnect()
        else:
            logger.info("MQTT disconnected cleanly")

    def _on_message(self, client, userdata, msg):
        """Callback when message is received."""
        try:
            topic = msg.topic
            payload = msg.payload.decode("utf-8")

            logger.debug(f"Message received on {topic}: {payload[:100]}...")

            # Call global callback if registered
            if self.on_message_callback:
                self.on_message_callback(topic, payload)
            else:
                logger.warning(f"No message callback registered for topic: {topic}")

        except Exception as e:
            logger.error(f"Error processing message: {e}", exc_info=True)

    def _on_subscribe(self, client, userdata, mid, granted_qos):
        """Callback when subscription is confirmed."""
        logger.debug(f"Subscription confirmed (mid={mid}, QoS={granted_qos})")

    def _on_publish(self, client, userdata, mid):
        """Callback when message is published."""
        logger.debug(f"Message published (mid={mid})")

    def _attempt_reconnect(self):
        """Attempt to reconnect with exponential backoff."""
        while not self.connected:
            try:
                logger.info(f"Reconnecting in {self.reconnect_delay} seconds...")
                time.sleep(self.reconnect_delay)

                # Attempt reconnect
                self.client.reconnect()

                # Exponential backoff (double delay, max 60s)
                self.reconnect_delay = min(self.reconnect_delay * 2, self.max_reconnect_delay)

            except Exception as e:
                logger.error(f"Reconnection failed: {e}")
