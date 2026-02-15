"""
Prometheus Custom Metrics for God-Kaiser Server

Module-level Gauge/Counter definitions registered in the default prometheus_client registry.
The prometheus-fastapi-instrumentator exposes these automatically alongside HTTP metrics
at /api/v1/health/metrics.

Update strategy:
- Gauges are updated via update_custom_metrics() called from a periodic scheduler job.
- ESP counts require a DB session, so updates are async.
- Counters (MQTT) are incremented directly in hot paths via increment functions.
"""

import time

import psutil
from prometheus_client import Counter, Gauge, Histogram

from .logging_config import get_logger

logger = get_logger(__name__)

# =============================================================================
# Server Gauges
# =============================================================================

UPTIME_GAUGE = Gauge(
    "god_kaiser_uptime_seconds",
    "Server uptime in seconds",
)

CPU_GAUGE = Gauge(
    "god_kaiser_cpu_percent",
    "Server CPU usage percentage",
)

MEMORY_GAUGE = Gauge(
    "god_kaiser_memory_percent",
    "Server memory usage percentage",
)

# =============================================================================
# MQTT Gauges + Counters
# =============================================================================

MQTT_CONNECTED_GAUGE = Gauge(
    "god_kaiser_mqtt_connected",
    "MQTT broker connection status (1=connected, 0=disconnected)",
)

MQTT_MESSAGES_TOTAL = Counter(
    "god_kaiser_mqtt_messages_total",
    "Total MQTT messages processed by El Servador",
    ["direction"],  # received, published
)

MQTT_ERRORS_TOTAL = Counter(
    "god_kaiser_mqtt_errors_total",
    "Total MQTT message processing errors",
    ["direction"],  # received, published
)

# =============================================================================
# WebSocket Gauges
# =============================================================================

WEBSOCKET_CONNECTIONS_GAUGE = Gauge(
    "god_kaiser_websocket_connections",
    "Active WebSocket connections to frontend clients",
)

# =============================================================================
# Database Histogram
# =============================================================================

DB_QUERY_DURATION = Histogram(
    "god_kaiser_db_query_duration_seconds",
    "Database query duration in seconds (app-side measurement)",
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
)

# =============================================================================
# ESP Gauges
# =============================================================================

ESP_TOTAL_GAUGE = Gauge(
    "god_kaiser_esp_total",
    "Total registered ESP devices",
)

ESP_ONLINE_GAUGE = Gauge(
    "god_kaiser_esp_online",
    "Online ESP devices",
)

ESP_OFFLINE_GAUGE = Gauge(
    "god_kaiser_esp_offline",
    "Offline ESP devices",
)

# =============================================================================
# ESP Heartbeat Aggregated Gauges (no per-device labels to avoid cardinality)
# =============================================================================

ESP_AVG_HEAP_FREE_GAUGE = Gauge(
    "god_kaiser_esp_avg_heap_free_bytes",
    "Average free heap across online ESP devices",
)

ESP_MIN_HEAP_FREE_GAUGE = Gauge(
    "god_kaiser_esp_min_heap_free_bytes",
    "Minimum free heap across online ESP devices",
)

ESP_AVG_WIFI_RSSI_GAUGE = Gauge(
    "god_kaiser_esp_avg_wifi_rssi_dbm",
    "Average WiFi RSSI across online ESP devices",
)

ESP_AVG_UPTIME_GAUGE = Gauge(
    "god_kaiser_esp_avg_uptime_seconds",
    "Average uptime across online ESP devices",
)

# Track server start time
_server_start_time: float = time.time()


def set_server_start_time(start_time: float) -> None:
    """Set server start time (called once during startup)."""
    global _server_start_time
    _server_start_time = start_time


def update_system_metrics() -> None:
    """Update system-level metrics (CPU, memory, uptime). No DB needed."""
    UPTIME_GAUGE.set(time.time() - _server_start_time)
    CPU_GAUGE.set(psutil.cpu_percent(interval=None))
    MEMORY_GAUGE.set(psutil.virtual_memory().percent)


def update_mqtt_metrics(connected: bool) -> None:
    """Update MQTT connection gauge."""
    MQTT_CONNECTED_GAUGE.set(1 if connected else 0)


def increment_mqtt_received() -> None:
    """Increment MQTT received message counter. Called from _on_message."""
    MQTT_MESSAGES_TOTAL.labels(direction="received").inc()


def increment_mqtt_published() -> None:
    """Increment MQTT published message counter. Called from publish()."""
    MQTT_MESSAGES_TOTAL.labels(direction="published").inc()


def increment_mqtt_receive_error() -> None:
    """Increment MQTT receive error counter."""
    MQTT_ERRORS_TOTAL.labels(direction="received").inc()


def increment_mqtt_publish_error() -> None:
    """Increment MQTT publish error counter."""
    MQTT_ERRORS_TOTAL.labels(direction="published").inc()


def update_websocket_metrics(active_connections: int) -> None:
    """Update WebSocket active connections gauge."""
    WEBSOCKET_CONNECTIONS_GAUGE.set(active_connections)


def update_esp_metrics(total: int, online: int, offline: int) -> None:
    """Update ESP device count gauges."""
    ESP_TOTAL_GAUGE.set(total)
    ESP_ONLINE_GAUGE.set(online)
    ESP_OFFLINE_GAUGE.set(offline)


def update_esp_heartbeat_metrics(
    avg_heap_free: float,
    min_heap_free: float,
    avg_wifi_rssi: float,
    avg_uptime: float,
) -> None:
    """Update aggregated ESP heartbeat gauges."""
    ESP_AVG_HEAP_FREE_GAUGE.set(avg_heap_free)
    ESP_MIN_HEAP_FREE_GAUGE.set(min_heap_free)
    ESP_AVG_WIFI_RSSI_GAUGE.set(avg_wifi_rssi)
    ESP_AVG_UPTIME_GAUGE.set(avg_uptime)


async def update_all_metrics_async(get_session_func: callable) -> None:
    """
    Full metrics update cycle (called by scheduler every 15s).

    Updates system metrics, MQTT status, WebSocket connections,
    and ESP counts + heartbeat aggregates from DB.
    """
    try:
        # System metrics (no DB needed)
        update_system_metrics()

        # MQTT status
        from ..mqtt.client import MQTTClient
        mqtt_client = MQTTClient.get_instance()
        update_mqtt_metrics(mqtt_client.is_connected())

        # WebSocket connections
        try:
            from ..websocket.manager import WebSocketManager
            ws_manager = await WebSocketManager.get_instance()
            if ws_manager:
                update_websocket_metrics(ws_manager.connection_count)
        except ImportError:
            pass  # WebSocket module not yet importable during early startup
        except Exception as e:
            logger.debug(f"WebSocket metrics update skipped: {e}")

        # ESP counts + heartbeat aggregates (needs DB)
        from ..db.repositories import ESPRepository
        async for session in get_session_func():
            esp_repo = ESPRepository(session)
            devices = await esp_repo.get_all()
            total = len(devices)
            online = sum(1 for d in devices if d.status == "online")
            offline = sum(1 for d in devices if d.status == "offline")
            update_esp_metrics(total, online, offline)

            # Aggregate heartbeat metrics from online device metadata
            heap_values: list[float] = []
            rssi_values: list[float] = []
            uptime_values: list[float] = []

            for d in devices:
                if d.status != "online":
                    continue
                meta = d.device_metadata or {}
                heap = meta.get("last_heap_free")
                rssi = meta.get("last_wifi_rssi")
                uptime = meta.get("last_uptime")
                if heap is not None:
                    heap_values.append(float(heap))
                if rssi is not None:
                    rssi_values.append(float(rssi))
                if uptime is not None:
                    uptime_values.append(float(uptime))

            if heap_values:
                update_esp_heartbeat_metrics(
                    avg_heap_free=sum(heap_values) / len(heap_values),
                    min_heap_free=min(heap_values),
                    avg_wifi_rssi=sum(rssi_values) / len(rssi_values) if rssi_values else 0.0,
                    avg_uptime=sum(uptime_values) / len(uptime_values) if uptime_values else 0.0,
                )
            else:
                # No online devices with data - set to 0
                update_esp_heartbeat_metrics(0.0, 0.0, 0.0, 0.0)

            break  # Only need one session

    except Exception as e:
        logger.warning(f"Metrics update failed (non-critical): {e}")
