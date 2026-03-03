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

try:
    import psutil
except ImportError:
    psutil = None

try:
    from prometheus_client import Counter, Gauge, Histogram
except ImportError:

    class _NoOpMetric:
        """Stub metric when prometheus_client is not installed (e.g. local test runs)."""

        def __init__(self, *args, **kwargs):
            pass

        def set(self, value):
            pass

        def inc(self, amount=1):
            pass

        def observe(self, amount):
            pass

        def labels(self, **kwargs):
            return self

    Counter = _NoOpMetric
    Gauge = _NoOpMetric
    Histogram = _NoOpMetric

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

# =============================================================================
# Sensor Gauges (Phase 0 — for Grafana alerting)
# =============================================================================

SENSOR_VALUE_GAUGE = Gauge(
    "god_kaiser_sensor_value",
    "Latest sensor reading value",
    ["sensor_type", "esp_id"],
)

SENSOR_LAST_UPDATE_GAUGE = Gauge(
    "god_kaiser_sensor_last_update",
    "Unix timestamp of last sensor data update",
    ["sensor_type", "esp_id"],
)

# =============================================================================
# ESP Per-Device Gauges/Counters (Phase 0 — for Grafana alerting)
# =============================================================================

ESP_LAST_HEARTBEAT_GAUGE = Gauge(
    "god_kaiser_esp_last_heartbeat",
    "Unix timestamp of last heartbeat per ESP device",
    ["esp_id"],
)

ESP_BOOT_COUNT_GAUGE = Gauge(
    "god_kaiser_esp_boot_count",
    "Boot count reported by ESP device (from heartbeat metadata)",
    ["esp_id"],
)

ESP_ERRORS_TOTAL = Counter(
    "god_kaiser_esp_errors_total",
    "Total error reports received from ESP devices",
    ["esp_id"],
)

ESP_SAFE_MODE_GAUGE = Gauge(
    "god_kaiser_esp_safe_mode",
    "Whether ESP device is in safe mode (1=safe_mode, 0=normal)",
    ["esp_id"],
)

# =============================================================================
# Application Counters (Phase 0 — for Grafana alerting)
# =============================================================================

WS_DISCONNECTS_TOTAL = Counter(
    "god_kaiser_ws_disconnects_total",
    "Total WebSocket client disconnections",
)

MQTT_QUEUED_MESSAGES_GAUGE = Gauge(
    "god_kaiser_mqtt_queued_messages",
    "Number of messages currently queued in MQTT offline buffer",
)

HTTP_ERRORS_TOTAL = Counter(
    "god_kaiser_http_errors_total",
    "Total HTTP error responses (4xx/5xx)",
    ["status_class"],  # 4xx, 5xx
)

LOGIC_ERRORS_TOTAL = Counter(
    "god_kaiser_logic_errors_total",
    "Total logic engine evaluation errors",
)

ACTUATOR_TIMEOUTS_TOTAL = Counter(
    "god_kaiser_actuator_timeouts_total",
    "Total actuator command timeouts",
)

SAFETY_TRIGGERS_TOTAL = Counter(
    "god_kaiser_safety_triggers_total",
    "Total safety system trigger events (emergency stops, rate limits, conflict blocks)",
)

SENSOR_IMPLAUSIBLE_TOTAL = Counter(
    "god_kaiser_sensor_implausible_total",
    "Total implausible sensor values received (outside physical datasheet limits)",
    ["sensor_type", "esp_id"],
)

# =============================================================================
# API Error Code Counter (per numeric_code from GodKaiserException)
# =============================================================================

API_ERROR_CODE_COUNTER = Counter(
    "god_kaiser_api_error_code_total",
    "Total API errors by numeric error code and source type",
    ["error_code", "source_type"],  # e.g. error_code="5210", source_type="server"
)

# =============================================================================
# Notification Pipeline Metrics (Phase 4A)
# =============================================================================

NOTIFICATIONS_TOTAL = Counter(
    "god_kaiser_notifications_total",
    "Total notifications created",
    ["severity", "category", "source"],
)

NOTIFICATIONS_SUPPRESSED_TOTAL = Counter(
    "god_kaiser_notifications_suppressed_total",
    "Total suppressed notifications",
    ["reason"],
)

NOTIFICATIONS_DEDUPLICATED_TOTAL = Counter(
    "god_kaiser_notifications_deduplicated_total",
    "Total deduplicated notifications (fingerprint or title)",
)

EMAIL_SENT_TOTAL = Counter(
    "god_kaiser_email_sent_total",
    "Total emails sent",
    ["provider", "status"],
)

EMAIL_LATENCY_SECONDS = Histogram(
    "god_kaiser_email_latency_seconds",
    "Email sending latency in seconds",
    ["provider"],
    buckets=(0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0),
)

DIGEST_PROCESSED_TOTAL = Counter(
    "god_kaiser_digest_processed_total",
    "Total digest batches processed",
)

DIGEST_NOTIFICATIONS_PER_BATCH = Histogram(
    "god_kaiser_digest_notifications_per_batch",
    "Number of notifications per digest batch",
    buckets=(1, 3, 5, 10, 20, 50),
)

WS_NOTIFICATION_BROADCAST_TOTAL = Counter(
    "god_kaiser_ws_notification_broadcast_total",
    "Total WebSocket notification broadcasts",
    ["event_type"],
)

WEBHOOK_RECEIVED_TOTAL = Counter(
    "god_kaiser_webhook_received_total",
    "Total webhooks received",
    ["source", "status"],
)

ALERT_SUPPRESSION_ACTIVE = Gauge(
    "god_kaiser_alert_suppression_active",
    "Currently suppressed entities",
    ["entity_type"],
)

ALERT_SUPPRESSION_EXPIRED_TOTAL = Counter(
    "god_kaiser_alert_suppression_expired_total",
    "Total suppressions auto-expired by scheduler",
)

NOTIFICATIONS_READ_TOTAL = Counter(
    "god_kaiser_notifications_read_total",
    "Total notifications marked as read",
)

EMAIL_ERRORS_TOTAL = Counter(
    "god_kaiser_email_errors_total",
    "Total email errors by type",
    ["provider", "error_type"],
)

# Phase 4B: Alert Lifecycle Metrics (ISA-18.2)
ALERTS_ACKNOWLEDGED_TOTAL = Counter(
    "god_kaiser_alerts_acknowledged_total",
    "Total alerts acknowledged",
    ["severity"],
)

ALERTS_RESOLVED_TOTAL = Counter(
    "god_kaiser_alerts_resolved_total",
    "Total alerts resolved",
    ["severity", "resolution_type"],
)

ALERTS_ACTIVE_GAUGE = Gauge(
    "god_kaiser_alerts_active",
    "Currently active alerts",
    ["severity"],
)

ALERTS_ROOT_CAUSE_SUPPRESSED_TOTAL = Counter(
    "god_kaiser_alerts_root_cause_suppressed_total",
    "Total dependent alerts suppressed by root-cause correlation",
    ["source"],
)

# Track server start time
_server_start_time: float = time.time()
_metrics_initialized: bool = False


def set_server_start_time(start_time: float) -> None:
    """Set server start time (called once during startup)."""
    global _server_start_time
    _server_start_time = start_time


def init_metrics() -> None:
    """Initialize all labeled metrics so they appear in Prometheus at startup.

    Counters and Gauges with labels are invisible in Prometheus until their
    first increment/set. This causes alerts referencing them to evaluate
    to NoData. Initializing with 0 makes them visible immediately.
    """
    global _metrics_initialized
    if _metrics_initialized:
        return
    _metrics_initialized = True

    # MQTT error counters (referenced by ao-high-mqtt-error-rate alert)
    MQTT_ERRORS_TOTAL.labels(direction="received")
    MQTT_ERRORS_TOTAL.labels(direction="published")

    # MQTT message counters
    MQTT_MESSAGES_TOTAL.labels(direction="received")
    MQTT_MESSAGES_TOTAL.labels(direction="published")

    # HTTP error counters
    HTTP_ERRORS_TOTAL.labels(status_class="4xx")
    HTTP_ERRORS_TOTAL.labels(status_class="5xx")

    # Notification pipeline counters (Phase 4A)
    for sev in ("critical", "warning", "info"):
        NOTIFICATIONS_TOTAL.labels(severity=sev, category="system", source="sensor_threshold")
    NOTIFICATIONS_SUPPRESSED_TOTAL.labels(reason="maintenance")
    NOTIFICATIONS_SUPPRESSED_TOTAL.labels(reason="calibration")
    EMAIL_SENT_TOTAL.labels(provider="resend", status="success")
    EMAIL_SENT_TOTAL.labels(provider="resend", status="failure")
    EMAIL_SENT_TOTAL.labels(provider="smtp", status="success")
    EMAIL_SENT_TOTAL.labels(provider="smtp", status="failure")
    WS_NOTIFICATION_BROADCAST_TOTAL.labels(event_type="notification_new")
    WS_NOTIFICATION_BROADCAST_TOTAL.labels(event_type="notification_unread_count")
    WEBHOOK_RECEIVED_TOTAL.labels(source="grafana", status="processed")
    WEBHOOK_RECEIVED_TOTAL.labels(source="grafana", status="skipped")
    WEBHOOK_RECEIVED_TOTAL.labels(source="grafana", status="error")
    ALERT_SUPPRESSION_ACTIVE.labels(entity_type="sensor")
    ALERT_SUPPRESSION_ACTIVE.labels(entity_type="actuator")
    ALERT_SUPPRESSION_ACTIVE.labels(entity_type="device")
    EMAIL_ERRORS_TOTAL.labels(provider="resend", error_type="connection")
    EMAIL_ERRORS_TOTAL.labels(provider="smtp", error_type="connection")

    # Phase 4B: Alert lifecycle metrics
    for sev in ("critical", "warning", "info"):
        ALERTS_ACKNOWLEDGED_TOTAL.labels(severity=sev)
        ALERTS_RESOLVED_TOTAL.labels(severity=sev, resolution_type="manual")
        ALERTS_RESOLVED_TOTAL.labels(severity=sev, resolution_type="auto")
        ALERTS_ACTIVE_GAUGE.labels(severity=sev)
    ALERTS_ROOT_CAUSE_SUPPRESSED_TOTAL.labels(source="grafana")
    ALERTS_ROOT_CAUSE_SUPPRESSED_TOTAL.labels(source="sensor_threshold")

    logger.info("Prometheus metrics initialized (all label combinations visible)")


def update_system_metrics() -> None:
    """Update system-level metrics (CPU, memory, uptime). No DB needed."""
    UPTIME_GAUGE.set(time.time() - _server_start_time)
    if psutil:
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


# =========================================================================
# Phase 0 metric update helpers
# =========================================================================


def update_sensor_value(esp_id: str, sensor_type: str, value: float) -> None:
    """Update sensor reading gauge. Call from sensor MQTT handler."""
    SENSOR_VALUE_GAUGE.labels(sensor_type=sensor_type, esp_id=esp_id).set(value)
    SENSOR_LAST_UPDATE_GAUGE.labels(sensor_type=sensor_type, esp_id=esp_id).set(time.time())


def update_esp_heartbeat_timestamp(esp_id: str) -> None:
    """Record heartbeat timestamp for an ESP. Call from heartbeat MQTT handler."""
    ESP_LAST_HEARTBEAT_GAUGE.labels(esp_id=esp_id).set(time.time())


def update_esp_boot_count(esp_id: str, boot_count: int) -> None:
    """Update boot count from heartbeat metadata."""
    ESP_BOOT_COUNT_GAUGE.labels(esp_id=esp_id).set(boot_count)


def increment_esp_error(esp_id: str) -> None:
    """Increment ESP error counter. Call from error MQTT handler."""
    ESP_ERRORS_TOTAL.labels(esp_id=esp_id).inc()


def update_esp_safe_mode(esp_id: str, in_safe_mode: bool) -> None:
    """Update safe mode gauge for an ESP device."""
    ESP_SAFE_MODE_GAUGE.labels(esp_id=esp_id).set(1 if in_safe_mode else 0)


def increment_ws_disconnect() -> None:
    """Increment WebSocket disconnect counter."""
    WS_DISCONNECTS_TOTAL.inc()


def update_mqtt_queue_size(size: int) -> None:
    """Update MQTT offline buffer queue size."""
    MQTT_QUEUED_MESSAGES_GAUGE.set(size)


def increment_http_error(status_code: int) -> None:
    """Increment HTTP error counter by status class (4xx or 5xx)."""
    if 400 <= status_code < 500:
        HTTP_ERRORS_TOTAL.labels(status_class="4xx").inc()
    elif 500 <= status_code < 600:
        HTTP_ERRORS_TOTAL.labels(status_class="5xx").inc()


def increment_logic_error() -> None:
    """Increment logic engine error counter."""
    LOGIC_ERRORS_TOTAL.inc()


def increment_actuator_timeout() -> None:
    """Increment actuator timeout counter."""
    ACTUATOR_TIMEOUTS_TOTAL.inc()


def increment_sensor_implausible(sensor_type: str, esp_id: str) -> None:
    """Increment implausible sensor value counter."""
    SENSOR_IMPLAUSIBLE_TOTAL.labels(sensor_type=sensor_type, esp_id=esp_id).inc()


def increment_safety_trigger() -> None:
    """Increment safety system trigger counter."""
    SAFETY_TRIGGERS_TOTAL.inc()


def increment_api_error_code(numeric_code: int) -> None:
    """Increment per-code API error counter. Called from exception_handlers."""
    source_type = "esp" if numeric_code < 5000 else "server"
    API_ERROR_CODE_COUNTER.labels(
        error_code=str(numeric_code),
        source_type=source_type,
    ).inc()


# =========================================================================
# Notification Pipeline metric helpers (Phase 4A)
# =========================================================================


def increment_notification_created(severity: str, category: str, source: str) -> None:
    """Increment notification counter. Called from NotificationRouter.route()."""
    NOTIFICATIONS_TOTAL.labels(severity=severity, category=category, source=source).inc()


def increment_notification_suppressed(reason: str) -> None:
    """Increment suppressed counter. Called from NotificationRouter.persist_suppressed()."""
    NOTIFICATIONS_SUPPRESSED_TOTAL.labels(reason=reason or "unknown").inc()


def increment_notification_deduplicated() -> None:
    """Increment dedup counter. Called from NotificationRouter.route() dedup branch."""
    NOTIFICATIONS_DEDUPLICATED_TOTAL.inc()


def increment_email_sent(provider: str, success: bool) -> None:
    """Increment email counter. Called from EmailService.send_email()."""
    EMAIL_SENT_TOTAL.labels(provider=provider, status="success" if success else "failure").inc()


def observe_email_latency(provider: str, duration: float) -> None:
    """Observe email latency. Called from EmailService.send_email()."""
    EMAIL_LATENCY_SECONDS.labels(provider=provider).observe(duration)


def increment_digest_processed() -> None:
    """Increment digest counter. Called from DigestService.process_digests()."""
    DIGEST_PROCESSED_TOTAL.inc()


def observe_digest_batch_size(count: int) -> None:
    """Observe digest batch size. Called from DigestService.process_digests()."""
    DIGEST_NOTIFICATIONS_PER_BATCH.observe(count)


def increment_ws_notification_broadcast(event_type: str) -> None:
    """Increment WS broadcast counter. Called from NotificationRouter._broadcast_websocket()."""
    WS_NOTIFICATION_BROADCAST_TOTAL.labels(event_type=event_type).inc()


def increment_webhook_received(source: str, status: str) -> None:
    """Increment webhook counter. Called from webhooks.py."""
    WEBHOOK_RECEIVED_TOTAL.labels(source=source, status=status).inc()


def update_alert_suppression_active(entity_type: str, count: int) -> None:
    """Set active suppression gauge. Called from scheduler."""
    ALERT_SUPPRESSION_ACTIVE.labels(entity_type=entity_type).set(count)


def increment_alert_suppression_expired() -> None:
    """Increment suppression expired counter. Called from scheduler."""
    ALERT_SUPPRESSION_EXPIRED_TOTAL.inc()


def increment_notification_read(count: int = 1) -> None:
    """Increment read counter. Called from notifications.py mark_read endpoints."""
    NOTIFICATIONS_READ_TOTAL.inc(count)


def increment_email_error(provider: str, error_type: str) -> None:
    """Increment email error counter. Called from EmailService on failures."""
    EMAIL_ERRORS_TOTAL.labels(provider=provider, error_type=error_type).inc()


# =========================================================================
# Alert Lifecycle metric helpers (Phase 4B)
# =========================================================================


def increment_alert_acknowledged(severity: str) -> None:
    """Increment acknowledged counter. Called from notifications.py acknowledge endpoint."""
    ALERTS_ACKNOWLEDGED_TOTAL.labels(severity=severity).inc()


def increment_alert_resolved(severity: str, resolution_type: str = "manual") -> None:
    """Increment resolved counter. Called from notifications.py resolve endpoint."""
    ALERTS_RESOLVED_TOTAL.labels(severity=severity, resolution_type=resolution_type).inc()


def update_alerts_active_gauge(severity: str, count: int) -> None:
    """Set active alerts gauge. Called from metrics update cycle."""
    ALERTS_ACTIVE_GAUGE.labels(severity=severity).set(count)


def increment_root_cause_suppressed(source: str) -> None:
    """Increment root-cause suppressed counter. Called when dependent alerts are suppressed."""
    ALERTS_ROOT_CAUSE_SUPPRESSED_TOTAL.labels(source=source).inc()


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
                esp_id = d.esp_id if hasattr(d, "esp_id") else str(d.id)
                meta = d.device_metadata or {}

                # Per-device Phase 0 metrics (from metadata)
                boot_count = meta.get("boot_count") or meta.get("last_boot_count")
                if boot_count is not None:
                    update_esp_boot_count(esp_id, int(boot_count))

                safe_mode = meta.get("safe_mode", False)
                update_esp_safe_mode(esp_id, bool(safe_mode))

                last_seen = getattr(d, "last_seen", None)
                if last_seen is not None:
                    try:
                        ts = (
                            last_seen.timestamp()
                            if hasattr(last_seen, "timestamp")
                            else float(last_seen)
                        )
                        ESP_LAST_HEARTBEAT_GAUGE.labels(esp_id=esp_id).set(ts)
                    except (TypeError, ValueError):
                        pass

                if d.status != "online":
                    continue
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

            # Phase 4B: Update active alerts gauge from DB
            try:
                from ..db.repositories.notification_repo import NotificationRepository

                notification_repo = NotificationRepository(session)
                alert_counts = await notification_repo.get_active_counts_by_severity()
                for severity, count in alert_counts.items():
                    update_alerts_active_gauge(severity, count)
            except Exception as alert_err:
                logger.debug(f"Alert gauge update skipped: {alert_err}")

            break  # Only need one session

    except Exception as e:
        logger.warning(f"Metrics update failed (non-critical): {e}")
