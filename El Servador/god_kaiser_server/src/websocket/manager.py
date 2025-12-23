"""
WebSocket Manager (Singleton)
Real-time Data Streaming für Frontend
"""

import asyncio
from collections import deque
from datetime import datetime, timedelta
from typing import Dict, Optional, Set

from fastapi import WebSocket
from starlette.websockets import WebSocketState

from ..core.logging_config import get_logger
from ..utils.time_helpers import unix_timestamp_s

logger = get_logger(__name__)


class WebSocketManager:
    """
    WebSocket Manager (Singleton).
    
    Manages WebSocket connections, broadcasts real-time updates.
    Thread-safe for MQTT callback invocations.
    """

    _instance: Optional["WebSocketManager"] = None
    _lock = asyncio.Lock()

    def __init__(self):
        """Initialize WebSocket Manager (private - use get_instance())."""
        self._connections: Dict[str, WebSocket] = {}
        self._subscriptions: Dict[str, Dict] = {}  # {client_id: {filters}}
        self._rate_limiter: Dict[str, deque] = {}  # Rate limiting per client
        self._lock = asyncio.Lock()  # Thread-safe for concurrent access
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._rate_limit_window = timedelta(seconds=1)  # 1 second window
        self._rate_limit_max = 10  # Max 10 messages per second

    @classmethod
    async def get_instance(cls) -> "WebSocketManager":
        """
        Get singleton instance.
        
        Returns:
            WebSocketManager instance
        """
        if cls._instance is None:
            async with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    async def initialize(self) -> None:
        """
        Initialize WebSocket Manager.
        
        Sets event loop reference for thread-safe broadcasts.
        """
        self._loop = asyncio.get_event_loop()
        logger.info("WebSocket Manager initialized")

    @property
    def connection_count(self) -> int:
        """
        Get number of active WebSocket connections.
        
        Returns:
            Number of active connections
        """
        return len(self._connections)

    async def connect(self, websocket: WebSocket, client_id: str) -> None:
        """
        Accept WebSocket connection.
        
        Args:
            websocket: WebSocket connection
            client_id: Unique client identifier
        """
        async with self._lock:
            await websocket.accept()
            self._connections[client_id] = websocket
            self._subscriptions[client_id] = {}
            self._rate_limiter[client_id] = deque()
            logger.info(f"WebSocket client connected: {client_id}")

    async def disconnect(self, client_id: str) -> None:
        """
        Close WebSocket connection.

        Handles race conditions where WebSocket may already be closed
        (e.g., client disconnected while server was processing).

        Args:
            client_id: Client identifier
        """
        async with self._lock:
            if client_id not in self._connections:
                # Already disconnected (race condition handled)
                return

            websocket = self._connections.pop(client_id)
            self._subscriptions.pop(client_id, None)
            self._rate_limiter.pop(client_id, None)

            # Try to close WebSocket gracefully
            try:
                # Check if WebSocket is still open before closing
                # WebSocketState: CONNECTING=0, CONNECTED=1, DISCONNECTED=2
                if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.close()
            except RuntimeError as e:
                # WebSocket already closed by client - expected in race conditions
                if "after sending 'websocket.close'" in str(e) or "already completed" in str(e):
                    logger.debug(f"WebSocket {client_id} already closed by client")
                else:
                    logger.warning(f"RuntimeError closing WebSocket for {client_id}: {e}")
            except Exception as e:
                # Log other unexpected errors but continue cleanup
                logger.warning(f"Error closing WebSocket for {client_id}: {e}")

            logger.info(f"WebSocket client disconnected: {client_id}")

    async def subscribe(self, client_id: str, filters: dict) -> None:
        """
        Subscribe client to specific message types/filters.
        
        Args:
            client_id: Client identifier
            filters: Filter dictionary with keys:
                - types: List of message types to subscribe to (optional)
                - esp_ids: List of ESP IDs to filter (optional)
                - sensor_types: List of sensor types to filter (optional)
        """
        async with self._lock:
            if client_id not in self._connections:
                logger.warning(f"Cannot subscribe: client {client_id} not connected")
                return
            
            self._subscriptions[client_id] = filters
            logger.debug(f"Client {client_id} subscribed with filters: {filters}")

    async def unsubscribe(self, client_id: str, filters: Optional[dict] = None) -> None:
        """
        Unsubscribe client from filters.
        
        Args:
            client_id: Client identifier
            filters: Optional filters to remove. If None, clears all subscriptions.
        """
        async with self._lock:
            if client_id not in self._connections:
                return
            
            if filters is None:
                self._subscriptions[client_id] = {}
            else:
                # Remove specific filters (merge logic)
                current = self._subscriptions.get(client_id, {})
                for key in filters:
                    if key in current:
                        if isinstance(current[key], list) and isinstance(filters[key], list):
                            # Remove items from list
                            current[key] = [x for x in current[key] if x not in filters[key]]
                        else:
                            # Remove key entirely
                            current.pop(key, None)
                self._subscriptions[client_id] = current
            
            logger.debug(f"Client {client_id} unsubscribed")

    async def broadcast(
        self, message_type: str, data: dict, filters: Optional[dict] = None
    ) -> None:
        """
        Broadcast message to all subscribed clients.
        
        Args:
            message_type: Message type (sensor_data, actuator_status, etc.)
            data: Message payload
            filters: Optional broadcast-level filters (for filtering before sending)
        """
        async with self._lock:
            timestamp = unix_timestamp_s()
            message = {
                "type": message_type,
                "timestamp": timestamp,
                "data": data,
            }
            
            # Filter clients based on subscriptions
            clients_to_send = []
            for client_id, client_filters in self._subscriptions.items():
                if client_id not in self._connections:
                    continue
                
                # Check if client is subscribed to this message type
                subscribed_types = client_filters.get("types", [])
                if subscribed_types and message_type not in subscribed_types:
                    continue
                
                # Check ESP ID filter
                if "esp_id" in data:
                    subscribed_esp_ids = client_filters.get("esp_ids", [])
                    if subscribed_esp_ids and data["esp_id"] not in subscribed_esp_ids:
                        continue
                
                # Check sensor type filter
                if "sensor_type" in data:
                    subscribed_sensor_types = client_filters.get("sensor_types", [])
                    if subscribed_sensor_types and data["sensor_type"] not in subscribed_sensor_types:
                        continue
                
                clients_to_send.append(client_id)
            
            # Send to all matching clients
            disconnected_clients = []
            for client_id in clients_to_send:
                # Check rate limit
                if not self._check_rate_limit(client_id):
                    logger.debug(f"Rate limit exceeded for client {client_id}, skipping message")
                    continue
                
                websocket = self._connections[client_id]
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    logger.warning(f"Error sending message to {client_id}: {e}")
                    disconnected_clients.append(client_id)
            
            # Clean up disconnected clients
            for client_id in disconnected_clients:
                await self.disconnect(client_id)

    def broadcast_threadsafe(
        self, message_type: str, data: dict, filters: Optional[dict] = None
    ) -> None:
        """
        Thread-safe broadcast for MQTT callback invocations.
        
        Can be called from non-asyncio threads (e.g., MQTT callbacks).
        
        Args:
            message_type: Message type
            data: Message payload
            filters: Optional filters
        """
        if self._loop and self._loop.is_running():
            asyncio.run_coroutine_threadsafe(
                self.broadcast(message_type, data, filters),
                self._loop
            )
        else:
            logger.warning("Cannot broadcast: event loop not available")

    def _check_rate_limit(self, client_id: str) -> bool:
        """
        Check if client exceeds rate limit (10 msg/sec).
        
        Uses sliding window algorithm with deque.
        
        Args:
            client_id: Client identifier
            
        Returns:
            True if within rate limit, False if exceeded
        """
        if client_id not in self._rate_limiter:
            self._rate_limiter[client_id] = deque()
        
        now = datetime.now()
        window_start = now - self._rate_limit_window
        
        # Remove old timestamps outside window
        rate_queue = self._rate_limiter[client_id]
        while rate_queue and rate_queue[0] < window_start:
            rate_queue.popleft()
        
        # Check if limit exceeded
        if len(rate_queue) >= self._rate_limit_max:
            return False
        
        # Add current timestamp
        rate_queue.append(now)
        return True

    async def shutdown(self) -> None:
        """
        Shutdown WebSocket Manager.
        
        Closes all connections and cleans up resources.
        """
        async with self._lock:
            logger.info("Shutting down WebSocket Manager...")
            
            # Close all connections
            client_ids = list(self._connections.keys())
            for client_id in client_ids:
                await self.disconnect(client_id)
            
            self._connections.clear()
            self._subscriptions.clear()
            self._rate_limiter.clear()
            self._loop = None
            
            logger.info("WebSocket Manager shutdown complete")
