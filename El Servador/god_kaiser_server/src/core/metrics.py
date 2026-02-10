"""
Prometheus Custom Metrics for God-Kaiser Server

Module-level Gauge definitions registered in the default prometheus_client registry.
The prometheus-fastapi-instrumentator exposes these automatically alongside HTTP metrics
at /api/v1/health/metrics.

Update strategy:
- Gauges are updated via update_custom_metrics() called from a periodic scheduler job.
- ESP counts require a DB session, so updates are async.
"""

import time

import psutil
from prometheus_client import Gauge

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
# MQTT Gauges
# =============================================================================

MQTT_CONNECTED_GAUGE = Gauge(
    "god_kaiser_mqtt_connected",
    "MQTT broker connection status (1=connected, 0=disconnected)",
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


def update_esp_metrics(total: int, online: int, offline: int) -> None:
    """Update ESP device count gauges."""
    ESP_TOTAL_GAUGE.set(total)
    ESP_ONLINE_GAUGE.set(online)
    ESP_OFFLINE_GAUGE.set(offline)


async def update_all_metrics_async(get_session_func: callable) -> None:
    """
    Full metrics update cycle (called by scheduler every 15s).

    Updates system metrics, MQTT status, and ESP counts from DB.
    """
    try:
        # System metrics (no DB needed)
        update_system_metrics()

        # MQTT status
        from ..mqtt.client import MQTTClient
        mqtt_client = MQTTClient.get_instance()
        update_mqtt_metrics(mqtt_client.is_connected())

        # ESP counts (needs DB)
        from ..db.repositories import ESPRepository
        async for session in get_session_func():
            esp_repo = ESPRepository(session)
            devices = await esp_repo.get_all()
            total = len(devices)
            online = sum(1 for d in devices if d.status == "online")
            offline = sum(1 for d in devices if d.status == "offline")
            update_esp_metrics(total, online, offline)
            break  # Only need one session

    except Exception as e:
        logger.warning(f"Metrics update failed (non-critical): {e}")
