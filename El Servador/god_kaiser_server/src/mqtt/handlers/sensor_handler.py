"""
MQTT Handler: Sensor Data Messages

Processes incoming sensor data from ESP32 devices:
- Parses sensor data topics
- Validates payloads (with structured error codes)
- Triggers Pi-Enhanced processing if enabled
- Saves data to database

Resilience Patterns:
- Uses resilient_session() with circuit breaker protection
- Timeout handling for overall operation
- Best-effort WebSocket broadcast

Error Codes:
- Uses ValidationErrorCode for payload validation errors
- Uses ConfigErrorCode for ESP device lookup errors
- Uses ServiceErrorCode for processing failures
"""

import asyncio
from datetime import datetime, timezone
from typing import Optional

from ...core.config import get_settings
from ...core.error_codes import (
    ConfigErrorCode,
    ServiceErrorCode,
    ValidationErrorCode,
    get_error_code_description,
)
from ...core.logging_config import get_logger
from ...core.metrics import increment_sensor_implausible, update_sensor_value
from ...utils.sensor_formatters import format_sensor_message
from ...utils.zone_subzone_resolver import resolve_zone_subzone_for_sensor
from ...core.resilience import (
    ServiceUnavailableError,
)
from sqlalchemy.orm.attributes import flag_modified

from ...db.models.enums import DataSource
from ...db.repositories import (
    ESPRepository,
    SensorRepository,
    SubzoneRepository,
)
from ...services.device_scope_service import DeviceScopeService
from ...db.session import resilient_session
from ..publisher import Publisher
from ..topics import TopicBuilder

logger = get_logger(__name__)


class SensorDataHandler:
    """
    Handles incoming sensor data messages from ESP32 devices.

    Flow:
    1. Parse topic → extract esp_id, gpio
    2. Validate payload structure
    3. Lookup ESP device and sensor config (with resilience)
    4. Check Pi-Enhanced mode
    5. Physical range validation (post-processing)
    6. Save data to database (with resilience)
    7. Trigger Pi-Enhanced processing if needed

    Resilience:
    - Uses resilient_session() for database operations (circuit breaker)
    - Timeout protection for overall handler operation
    - Best-effort WebSocket broadcast (no retry)
    """

    # Physical sensor limits from datasheets.
    # Values outside these ranges are DEFINITELY sensor errors.
    # Organized by sensor_type as used in MQTT payloads.
    SENSOR_PHYSICAL_LIMITS: dict[str, dict[str, float]] = {
        # Temperature sensors
        "sht31": {"min": -40.0, "max": 125.0},
        "sht31_temp": {"min": -40.0, "max": 125.0},
        "sht31_humidity": {"min": 0.0, "max": 100.0},
        "ds18b20": {"min": -55.0, "max": 125.0},
        "bmp280_temp": {"min": -40.0, "max": 85.0},
        "bmp280_pressure": {"min": 300.0, "max": 1100.0},
        "bme280_temp": {"min": -40.0, "max": 85.0},
        "bme280_pressure": {"min": 300.0, "max": 1100.0},
        "bme280_humidity": {"min": 0.0, "max": 100.0},
        # Analytical sensors
        "ph": {"min": 0.0, "max": 14.0},
        "ec": {"min": 0.0, "max": 20000.0},
        # Environmental sensors
        "moisture": {"min": 0.0, "max": 100.0},
        "soil_moisture": {"min": 0.0, "max": 100.0},
        "co2": {"min": 0.0, "max": 10000.0},
        "light": {"min": 0.0, "max": 200000.0},
        "flow": {"min": 0.0, "max": 1000.0},
    }

    # Throttle interval for last_seen updates (seconds).
    # Heartbeat timeout is 300s, so 60s ensures last_seen stays current.
    LAST_SEEN_THROTTLE_SECONDS = 60

    def __init__(self, publisher: Optional[Publisher] = None):
        """
        Initialize sensor data handler.

        Args:
            publisher: Publisher instance for Pi-Enhanced responses
        """
        self.publisher = publisher or Publisher()

        # Load resilience settings
        settings = get_settings()
        self._handler_timeout = settings.resilience.timeout_sensor_processing

        # In-memory cache for last_seen throttling per ESP
        self._last_seen_cache: dict[str, datetime] = {}

    async def handle_sensor_data(self, topic: str, payload: dict) -> bool:
        """
        Handle sensor data message.

        Expected topic: kaiser/god/esp/{esp_id}/sensor/{gpio}/data

        Expected payload:
        {
            "ts": 1735818000,            // or "timestamp" - both accepted
            "esp_id": "ESP_12AB34CD",
            "gpio": 34,
            "sensor_type": "ph",
            "raw": 2150,                 // or "raw_value" - both accepted
            "value": 0.0,
            "unit": "",
            "quality": "stale",
            "raw_mode": true             // optional, defaults to True
        }

        Args:
            topic: MQTT topic string
            payload: Parsed JSON payload dict

        Returns:
            True if message processed successfully, False otherwise
        """
        try:
            # Step 1: Parse topic
            parsed_topic = TopicBuilder.parse_sensor_data_topic(topic)
            if not parsed_topic:
                logger.error(
                    f"[{ValidationErrorCode.MISSING_REQUIRED_FIELD}] "
                    f"Failed to parse sensor data topic: {topic}"
                )
                return False

            esp_id_str = parsed_topic["esp_id"]
            gpio = parsed_topic["gpio"]

            logger.debug(
                f"Processing sensor data: esp_id={esp_id_str}, gpio={gpio}, "
                f"sensor_type={payload.get('sensor_type')}"
            )

            # Step 2: Validate payload
            validation_result = self._validate_payload(payload)
            if not validation_result["valid"]:
                error_code = validation_result.get(
                    "error_code", ValidationErrorCode.MISSING_REQUIRED_FIELD
                )
                logger.error(
                    f"[{error_code}] Invalid sensor data payload from {esp_id_str}: "
                    f"{validation_result['error']}"
                )
                return False

            # Step 3: Get database session and repositories (with resilience)
            try:
                async with resilient_session() as session:
                    esp_repo = ESPRepository(session)
                    sensor_repo = SensorRepository(session)
                    subzone_repo = SubzoneRepository(session)

                    # Step 4: Lookup ESP device
                    esp_device = await esp_repo.get_by_device_id(esp_id_str)
                    if not esp_device:
                        logger.error(
                            f"[{ConfigErrorCode.ESP_DEVICE_NOT_FOUND}] "
                            f"ESP device not found: {esp_id_str} - "
                            f"{get_error_code_description(ConfigErrorCode.ESP_DEVICE_NOT_FOUND)}"
                        )
                        return False

                    # Step 5: Extract sensor_type FIRST (needed for multi-value lookup)
                    # Normalize to lowercase — ESP32 sends lowercase, but DB may have mixed case
                    sensor_type = payload.get("sensor_type", "unknown").lower()

                    # Step 5.5: Extract interface-specific addresses for 4-way lookup
                    # DS18B20 sensors send ROM code to distinguish multiple sensors on same GPIO
                    onewire_address = payload.get("onewire_address")
                    # I2C sensors send address to distinguish multiple sensors at different addresses
                    i2c_address = payload.get("i2c_address")

                    # Step 6: Lookup sensor config (Multi-Value Support + OneWire/I2C Support)
                    sensor_config = None

                    if i2c_address is not None and i2c_address != 0:
                        # I2C Sensor: 4-way lookup (esp_id, gpio, sensor_type, i2c_address)
                        # Multiple I2C sensors can exist at different addresses on same bus
                        logger.debug(f"I2C sensor detected: gpio={gpio}, addr=0x{i2c_address:02X}")
                        sensor_config = await sensor_repo.get_by_esp_gpio_type_and_i2c(
                            esp_device.id, gpio, sensor_type, i2c_address
                        )
                        if not sensor_config:
                            logger.warning(
                                f"I2C sensor config not found: esp_id={esp_id_str}, "
                                f"gpio={gpio}, type={sensor_type}, addr=0x{i2c_address:02X}. "
                                f"Saving data without config."
                            )
                    elif onewire_address:
                        # OneWire Sensor: 4-way lookup (esp_id, gpio, sensor_type, onewire_address)
                        # Multiple DS18B20 sensors can share same GPIO (bus pin)
                        logger.debug(f"OneWire sensor detected: gpio={gpio}, rom={onewire_address}")
                        sensor_config = await sensor_repo.get_by_esp_gpio_type_and_onewire(
                            esp_device.id, gpio, sensor_type, onewire_address
                        )
                        if not sensor_config:
                            logger.warning(
                                f"OneWire sensor config not found: esp_id={esp_id_str}, "
                                f"gpio={gpio}, type={sensor_type}, rom={onewire_address}. "
                                f"Saving data without config."
                            )
                    else:
                        # Standard Sensor: 3-way lookup (esp_id, gpio, sensor_type)
                        # e.g., Analog sensors (pH, EC) or single I2C without address in payload
                        sensor_config = await sensor_repo.get_by_esp_gpio_and_type(
                            esp_device.id, gpio, sensor_type
                        )
                        if not sensor_config:
                            logger.warning(
                                f"Sensor config not found: esp_id={esp_id_str}, gpio={gpio}, "
                                f"type={sensor_type}. Saving data without config."
                            )

                    # Step 7: Extract remaining data from payload
                    # Accept both "raw" and "raw_value" for compatibility
                    raw_value = float(payload.get("raw", payload.get("raw_value")))
                    # raw_mode defaults to True (ESP32 always works in raw mode)
                    raw_mode = payload.get("raw_mode", True)
                    value = payload.get("value", 0.0)
                    quality = payload.get("quality", "unknown")

                    # Unit resolution: registry > payload (avoids Latin-1/UTF-8 encoding issues)
                    from ...sensors.sensor_type_registry import (
                        get_unit_for_sensor_type,
                        sanitize_unit_encoding,
                    )

                    registry_unit = get_unit_for_sensor_type(sensor_type)
                    payload_unit = payload.get("unit", "")
                    unit = registry_unit or sanitize_unit_encoding(payload_unit)

                    # Step 8: Determine processing mode
                    processing_mode = "raw"
                    processed_value = None

                    if sensor_config and sensor_config.pi_enhanced and raw_mode:
                        # Pi-Enhanced processing needed
                        processing_mode = "pi_enhanced"

                        # Trigger Pi-Enhanced processing (pass raw_mode!)
                        pi_result = await self._trigger_pi_enhanced_processing(
                            esp_id_str,
                            gpio,
                            sensor_type,
                            raw_value,
                            sensor_config,
                            raw_mode=raw_mode,  # Pass raw_mode to processor
                        )

                        if pi_result:
                            processed_value = pi_result["processed_value"]
                            unit = pi_result["unit"]
                            quality = pi_result["quality"]

                            # Publish processed data back to ESP
                            self.publisher.publish_pi_enhanced_response(
                                esp_id_str,
                                gpio,
                                processed_value,
                                unit,
                                quality,
                                retry=False,
                            )

                            logger.debug(
                                f"Pi-Enhanced processing complete: raw={raw_value}, "
                                f"processed={processed_value} {unit}"
                            )
                        else:
                            # Processing failed, mark quality
                            quality = "error"
                            logger.error(
                                f"[{ServiceErrorCode.OPERATION_TIMEOUT}] "
                                f"Pi-Enhanced processing failed: esp_id={esp_id_str}, "
                                f"gpio={gpio}, sensor_type={sensor_type} - "
                                f"{get_error_code_description(ServiceErrorCode.OPERATION_TIMEOUT)}"
                            )

                    elif not raw_mode:
                        # ESP already processed locally
                        processing_mode = "local"
                        processed_value = value

                    # Fallback: if no processing branch produced a value,
                    # use raw_value so processed_value is never NULL in DB
                    if processed_value is None:
                        processed_value = raw_value

                    # Step 8b: Physical range validation (post-processing)
                    # Check processed value against sensor physical limits.
                    # Values outside datasheet range get quality="critical" but are
                    # still saved (never discarded) for diagnostic purposes.
                    #
                    # IMPORTANT: Only validate server-processed values (pi_enhanced).
                    # RAW values and ESP self-reported values (local mode) may use
                    # different scales (e.g., ADC 0-4095 vs processed 0-100% for
                    # moisture). Checking raw ADC values against processed limits
                    # would produce false "implausible" warnings.
                    display_val = processed_value if processed_value is not None else value
                    skip_range_check = processing_mode != "pi_enhanced" or processed_value is None
                    if (
                        display_val is not None
                        and quality not in ("error",)
                        and not skip_range_check
                    ):
                        range_result = self._check_physical_range(sensor_type, float(display_val))
                        if range_result == "implausible":
                            logger.warning(
                                f"Implausible sensor value: esp_id={esp_id_str}, "
                                f"gpio={gpio}, sensor_type={sensor_type}, "
                                f"value={display_val}, "
                                f"limits={self.SENSOR_PHYSICAL_LIMITS.get(sensor_type)}"
                            )
                            quality = "critical"
                            increment_sensor_implausible(sensor_type, esp_id_str)

                    # Step 8c: Detect data source (mock/test/production)
                    data_source = self._detect_data_source(esp_device, payload)

                    # Step 8d: Resolve zone_id/subzone_id at measurement time (Phase 0.1)
                    # T13-R1: Pass sensor_config_id and sensor_type for I2C GPIO-0 resolution
                    # T13-R2: DeviceScopeService has 30s in-memory cache (avoids DB query per message)
                    scope_service = DeviceScopeService(session)
                    zone_id, subzone_id = await resolve_zone_subzone_for_sensor(
                        esp_id_str,
                        gpio,
                        esp_repo,
                        subzone_repo,
                        sensor_config_id=str(sensor_config.id) if sensor_config else None,
                        sensor_type=sensor_type,
                        sensor_config=sensor_config,
                        scope_service=scope_service,
                    )

                    # Step 9: Save data to database
                    # Convert ESP32 timestamp to UTC datetime
                    # BUG-05 fix: ts<=0 (Wokwi without NTP) → use server timestamp
                    esp32_timestamp_raw = payload.get("ts", payload.get("timestamp"))
                    if esp32_timestamp_raw is None or esp32_timestamp_raw <= 0:
                        esp32_timestamp = datetime.now(timezone.utc)
                    else:
                        esp32_timestamp = datetime.fromtimestamp(
                            (
                                esp32_timestamp_raw / 1000
                                if esp32_timestamp_raw > 1e10
                                else esp32_timestamp_raw
                            ),
                            tz=timezone.utc,
                        )

                    sensor_data = await sensor_repo.save_data(
                        esp_id=esp_device.id,
                        gpio=gpio,
                        sensor_type=sensor_type,
                        raw_value=raw_value,
                        processed_value=processed_value,
                        unit=unit,
                        processing_mode=processing_mode,
                        quality=quality,
                        timestamp=esp32_timestamp,
                        metadata={
                            "raw_mode": raw_mode,
                        },
                        data_source=data_source,
                        zone_id=zone_id,
                        subzone_id=subzone_id,
                        device_name=esp_device.name,
                    )

                    # MQTT QoS 1 dedup: save_data returns None for duplicate messages
                    if sensor_data is None:
                        return True

                    # Step 9a: Secondary health indicator — update last_seen (throttled)
                    await self._update_last_seen_throttled(esp_id_str, esp_repo)

                    # Step 9b: Update sensor config on successful data save
                    if sensor_config:
                        # Activate config on first successful data receipt
                        if sensor_config.config_status == "pending":
                            sensor_config.config_status = "active"
                            logger.info(
                                f"Sensor config activated: esp_id={esp_id_str}, "
                                f"gpio={gpio}, sensor_type={sensor_type}, "
                                f"config_status: pending → active"
                            )

                        # Update latest reading in sensor_metadata
                        latest_value = processed_value if processed_value is not None else raw_value
                        updated_metadata = dict(sensor_config.sensor_metadata or {})
                        updated_metadata["latest_value"] = latest_value
                        updated_metadata["latest_timestamp"] = esp32_timestamp.isoformat()
                        updated_metadata["latest_quality"] = quality
                        sensor_config.sensor_metadata = updated_metadata
                        flag_modified(sensor_config, "sensor_metadata")

                    # Commit transaction
                    await session.commit()

                    logger.info(
                        f"Sensor data saved: id={sensor_data.id}, esp_id={esp_id_str}, "
                        f"gpio={gpio}, processing_mode={processing_mode}"
                    )

                    # Update Prometheus metrics for Grafana alerting
                    display_value = processed_value if processed_value is not None else raw_value
                    update_sensor_value(esp_id_str, sensor_type, display_value)

                    # ═══════════════════════════════════════════════════════
                    # THRESHOLD → NOTIFICATION PIPELINE (Phase 4A.7)
                    # Alerts are ALWAYS evaluated. Notifications are
                    # suppressed if sensor/device is in suppression mode.
                    # ═══════════════════════════════════════════════════════
                    if sensor_config:
                        try:
                            await self._evaluate_thresholds_and_notify(
                                session=session,
                                sensor_config=sensor_config,
                                esp_id_str=esp_id_str,
                                gpio=gpio,
                                sensor_type=sensor_type,
                                value=display_value,
                            )
                        except Exception as e:
                            # Threshold evaluation MUST NOT block data processing
                            logger.warning(
                                f"Threshold evaluation failed for {esp_id_str} GPIO {gpio}: {e}"
                            )

                    # WebSocket Broadcast (best-effort, outside transaction)
                    try:
                        from ...websocket.manager import WebSocketManager

                        ws_manager = await WebSocketManager.get_instance()

                        # Einheitliche Message generieren (Server-Centric)
                        display_value = (
                            processed_value if processed_value is not None else raw_value
                        )
                        message = format_sensor_message(
                            sensor_type=sensor_type,
                            gpio=gpio,
                            value=display_value,
                            unit=unit,
                        )

                        await ws_manager.broadcast(
                            "sensor_data",
                            {
                                "esp_id": esp_id_str,
                                "message": message,  # Menschenverstandliche Message
                                "severity": "info",
                                "device_id": esp_id_str,
                                "gpio": gpio,
                                "sensor_type": sensor_type,
                                "value": display_value,
                                "unit": unit,
                                "quality": quality,
                                "timestamp": esp32_timestamp_raw,
                                "zone_id": zone_id,
                                "subzone_id": subzone_id,
                            },
                        )
                    except Exception as e:
                        logger.warning(f"Failed to broadcast sensor data via WebSocket: {e}")

                    # Logic Engine Trigger (non-blocking!)
                    try:
                        from ...services.logic_engine import get_logic_engine

                        async def trigger_logic_evaluation():
                            try:
                                logic_engine = get_logic_engine()
                                if logic_engine:
                                    await logic_engine.evaluate_sensor_data(
                                        esp_id=esp_id_str,
                                        gpio=gpio,
                                        sensor_type=sensor_type,
                                        value=processed_value or raw_value,
                                        zone_id=zone_id,
                                        subzone_id=subzone_id,
                                    )
                                else:
                                    logger.debug(
                                        "Logic Engine not yet initialized, skipping evaluation"
                                    )
                            except Exception as e:
                                logger.error(f"Error in logic evaluation: {e}", exc_info=True)

                        # Create non-blocking task with done callback for visibility
                        task = asyncio.create_task(trigger_logic_evaluation())

                        def _on_logic_task_done(t: asyncio.Task) -> None:
                            if t.cancelled():
                                logger.warning(
                                    f"Logic evaluation task cancelled for {esp_id_str} GPIO {gpio}"
                                )
                            elif t.exception():
                                logger.error(
                                    f"Logic evaluation task failed for {esp_id_str} GPIO {gpio}: "
                                    f"{t.exception()}",
                                    exc_info=t.exception(),
                                )

                        task.add_done_callback(_on_logic_task_done)
                    except Exception as e:
                        logger.warning(f"Failed to trigger logic evaluation: {e}")

                    return True

            except ServiceUnavailableError as e:
                # Database circuit breaker is OPEN
                logger.warning(
                    f"[resilience] Sensor data handling blocked: {e.service_name} unavailable. "
                    f"Data from {esp_id_str} GPIO {gpio} will be dropped."
                )
                return False

        except Exception as e:
            logger.error(
                f"Error handling sensor data: {e}",
                exc_info=True,
            )
            return False

    async def _evaluate_thresholds_and_notify(
        self,
        session,
        sensor_config,
        esp_id_str: str,
        gpio: int,
        sensor_type: str,
        value: float,
    ) -> None:
        """
        Evaluate sensor value against thresholds and route notification.

        Pipeline:
        1. Get effective thresholds (custom from alert_config > global from sensor_config)
        2. Check value against thresholds → determine severity
        3. Check suppression status (sensor-level + device-level)
        4. Route notification via NotificationRouter (unless suppressed)
        5. Alert is always logged (even when suppressed)
        """
        from ...services.alert_suppression_service import AlertSuppressionService
        from ...services.notification_router import NotificationRouter
        from ...schemas.notification import NotificationCreate

        suppression_svc = AlertSuppressionService(session)

        # Step 1: Get effective thresholds
        thresholds = suppression_svc.get_effective_thresholds(sensor_config)

        # Step 1b: Enrich with zone-aware thresholds (Phase 5)
        try:
            from ...services.zone_aware_thresholds import ZoneAwareThresholdService
            from ...db.models.esp import ESPDevice

            esp_device = await session.get(ESPDevice, sensor_config.esp_id)
            zone_id = esp_device.zone_id if esp_device else None
            if zone_id:
                zone_thresh_svc = ZoneAwareThresholdService(session)
                phase_thresholds = await zone_thresh_svc.get_thresholds(zone_id, sensor_type)
                if phase_thresholds:
                    if not thresholds:
                        thresholds = phase_thresholds
                    else:
                        for k, v in phase_thresholds.items():
                            if k not in thresholds:
                                thresholds[k] = v
        except Exception as e:
            logger.debug(f"Zone-aware threshold enrichment skipped: {e}")

        if not thresholds:
            return  # No thresholds configured — nothing to evaluate

        # Step 2: Check value against thresholds
        severity = suppression_svc.check_thresholds(value, thresholds)
        if not severity:
            return  # Value within bounds — no alert

        # Apply severity override if configured
        override = suppression_svc.get_severity_override(sensor_config)
        if override:
            severity = override

        # Step 3: Check suppression
        is_suppressed, suppression_reason = await suppression_svc.is_sensor_suppressed(
            sensor_config
        )

        # Step 4: Build notification payload
        sensor_name = sensor_config.sensor_name or f"{sensor_type} GPIO {gpio}"
        unit = (
            sensor_config.sensor_metadata.get("latest_unit", "")
            if sensor_config.sensor_metadata
            else ""
        )

        alert_metadata = {
            "esp_id": esp_id_str,
            "gpio": gpio,
            "sensor_type": sensor_type,
            "sensor_config_id": str(sensor_config.id),
            "value": value,
            "severity": severity,
            "thresholds": thresholds,
        }

        # Phase 4B: Correlation ID for grouping related threshold alerts
        threshold_correlation_id = f"threshold_{esp_id_str}_{sensor_type}"

        if is_suppressed:
            # ISA-18.2 Audit-Trail: ALWAYS persist alert to DB, even when suppressed.
            # Uses NotificationRouter.persist_suppressed() for pattern-conformity
            # (Service → Repository, no direct repo access from handler).
            try:
                alert_metadata["suppressed"] = True
                alert_metadata["suppression_reason"] = suppression_reason
                suppressed_notification = NotificationCreate(
                    severity=severity,
                    category="data_quality",
                    title=f"[Suppressed] Schwellenwert-Alarm: {sensor_name}",
                    body=(
                        f"Sensor '{sensor_name}' ({sensor_type}) auf {esp_id_str} GPIO {gpio} "
                        f"hat Wert {value}{unit} — {severity}-Schwellenwert überschritten. "
                        f"(Suppressed: {suppression_reason})"
                    ),
                    source="sensor_threshold",
                    metadata=alert_metadata,
                    correlation_id=threshold_correlation_id,
                )
                router = NotificationRouter(session)
                await router.persist_suppressed(suppressed_notification)
                await session.commit()
                logger.debug(
                    f"Suppressed alert persisted (audit-trail): {esp_id_str} GPIO {gpio}, "
                    f"severity={severity}, reason={suppression_reason}"
                )
            except Exception as e:
                logger.warning(f"Failed to persist suppressed alert: {e}")
            return  # Suppressed — persisted but not routed (no WS, no email)

        # Step 5: Route notification (unsuppressed → full pipeline)
        notification = NotificationCreate(
            severity=severity,
            category="data_quality",
            title=f"Schwellenwert-Alarm: {sensor_name}",
            body=(
                f"Sensor '{sensor_name}' ({sensor_type}) auf {esp_id_str} GPIO {gpio} "
                f"hat Wert {value}{unit} — {severity}-Schwellenwert überschritten."
            ),
            source="sensor_threshold",
            metadata=alert_metadata,
            correlation_id=threshold_correlation_id,
        )

        try:
            router = NotificationRouter(session)
            await router.route(notification)
            logger.info(
                f"Threshold alert routed: {esp_id_str} GPIO {gpio}, "
                f"severity={severity}, value={value}"
            )
        except Exception as e:
            logger.error(f"Failed to route threshold notification: {e}")

    async def _update_last_seen_throttled(self, esp_id: str, esp_repo: ESPRepository) -> None:
        """
        Update ESP last_seen as secondary health indicator (throttled).

        Only updates DB at most once per LAST_SEEN_THROTTLE_SECONDS per ESP.
        Does NOT change device status — that remains the heartbeat_handler's job.
        Ensures check_device_timeouts() won't mark an ESP as offline while
        sensor data is still flowing.
        """
        now = datetime.now(timezone.utc)
        last_update = self._last_seen_cache.get(esp_id)
        if last_update and (now - last_update).total_seconds() < self.LAST_SEEN_THROTTLE_SECONDS:
            return  # Throttled — skip

        self._last_seen_cache[esp_id] = now
        try:
            await esp_repo.update_last_seen(esp_id, now)
        except Exception as e:
            logger.debug(f"Failed to update last_seen for {esp_id}: {e}")

    @classmethod
    def _check_physical_range(cls, sensor_type: str, value: float) -> str | None:
        """
        Check if a sensor value is within physical datasheet limits.

        Args:
            sensor_type: Sensor type identifier (e.g. "sht31", "ds18b20")
            value: Processed or raw sensor value in physical units

        Returns:
            "implausible" if value is outside physical limits, None otherwise
        """
        limits = cls.SENSOR_PHYSICAL_LIMITS.get(sensor_type)
        if limits is not None and (value < limits["min"] or value > limits["max"]):
            return "implausible"
        return None

    def _validate_payload(self, payload: dict) -> dict:
        """
        Validate sensor data payload structure.

        Required fields: ts OR timestamp, esp_id, gpio, sensor_type, raw OR raw_value
        Optional fields: raw_mode (defaults to True)

        Args:
            payload: Payload dict to validate

        Returns:
            {"valid": bool, "error": str, "error_code": int}
        """
        # Check required fields (with alternatives for compatibility)
        # Accept both "ts" and "timestamp"
        if "ts" not in payload and "timestamp" not in payload:
            return {
                "valid": False,
                "error": "Missing required field: ts or timestamp",
                "error_code": ValidationErrorCode.MISSING_REQUIRED_FIELD,
            }

        if "esp_id" not in payload:
            return {
                "valid": False,
                "error": "Missing required field: esp_id",
                "error_code": ValidationErrorCode.INVALID_ESP_ID,
            }

        if "gpio" not in payload:
            return {
                "valid": False,
                "error": "Missing required field: gpio",
                "error_code": ValidationErrorCode.INVALID_GPIO,
            }

        if "sensor_type" not in payload:
            return {
                "valid": False,
                "error": "Missing required field: sensor_type",
                "error_code": ValidationErrorCode.INVALID_SENSOR_TYPE,
            }

        # Accept both "raw" and "raw_value"
        if "raw" not in payload and "raw_value" not in payload:
            return {
                "valid": False,
                "error": "Missing required field: raw or raw_value",
                "error_code": ValidationErrorCode.MISSING_REQUIRED_FIELD,
            }

        # raw_mode is optional (defaults to True if not provided)
        if "raw_mode" not in payload:
            payload["raw_mode"] = True

        # Type validation
        ts_value = payload.get("ts", payload.get("timestamp"))
        if not isinstance(ts_value, (int, float)):
            return {
                "valid": False,
                "error": "Field 'ts/timestamp' must be numeric (Unix timestamp)",
                "error_code": ValidationErrorCode.FIELD_TYPE_MISMATCH,
            }

        # BUG-05 fix: ts<=0 is valid (Wokwi without NTP) — server will use its own timestamp
        # Log warning but do NOT reject the payload
        if ts_value <= 0:
            logger.warning(
                "Payload ts<=0 (value=%s) from esp_id=%s — will use server timestamp",
                ts_value,
                payload.get("esp_id", "unknown"),
            )

        if not isinstance(payload["gpio"], int):
            return {
                "valid": False,
                "error": "Field 'gpio' must be integer",
                "error_code": ValidationErrorCode.FIELD_TYPE_MISMATCH,
            }

        # raw_mode validation (must be boolean if provided)
        if not isinstance(payload["raw_mode"], bool):
            return {
                "valid": False,
                "error": "Field 'raw_mode' must be boolean",
                "error_code": ValidationErrorCode.FIELD_TYPE_MISMATCH,
            }

        # Validate raw value (should be numeric)
        raw_value = payload.get("raw", payload.get("raw_value"))
        try:
            float(raw_value)
        except (ValueError, TypeError):
            return {
                "valid": False,
                "error": "Field 'raw/raw_value' must be numeric",
                "error_code": ValidationErrorCode.FIELD_TYPE_MISMATCH,
            }

        # Validate quality field (optional, but must be valid if present)
        quality = payload.get("quality")
        if quality is not None:
            valid_qualities = ["good", "fair", "poor", "suspect", "error", "unknown"]
            if quality not in valid_qualities:
                return {
                    "valid": False,
                    "error": f"Invalid quality value: '{quality}'. Must be one of {valid_qualities}",
                    "error_code": ValidationErrorCode.FIELD_TYPE_MISMATCH,
                }

            # If ESP reports quality as "error", log a warning
            if quality == "error":
                logger.warning(
                    f"ESP reported quality='error' for sensor data: "
                    f"esp_id={payload.get('esp_id')}, gpio={payload.get('gpio')}, "
                    f"sensor_type={payload.get('sensor_type')}"
                )

        # Validate error_code field (optional, ESP reports sensor-specific errors)
        error_code = payload.get("error_code")
        if error_code is not None:
            if not isinstance(error_code, int):
                return {
                    "valid": False,
                    "error": "Field 'error_code' must be integer",
                    "error_code": ValidationErrorCode.FIELD_TYPE_MISMATCH,
                }

            # Log any non-zero error codes from ESP
            if error_code != 0:
                logger.warning(
                    f"ESP reported error_code={error_code} for sensor: "
                    f"esp_id={payload.get('esp_id')}, gpio={payload.get('gpio')}"
                )

        # Validate i2c_address field (optional, for I2C sensor identification)
        i2c_address = payload.get("i2c_address")
        if i2c_address is not None:
            if not isinstance(i2c_address, int):
                return {
                    "valid": False,
                    "error": "Field 'i2c_address' must be integer",
                    "error_code": ValidationErrorCode.FIELD_TYPE_MISMATCH,
                }
            # I2C 7-bit address range: 0x00-0x7F (0-127)
            if i2c_address < 0 or i2c_address > 127:
                return {
                    "valid": False,
                    "error": f"Field 'i2c_address' must be 0-127, got {i2c_address}",
                    "error_code": ValidationErrorCode.FIELD_TYPE_MISMATCH,
                }

        return {"valid": True, "error": "", "error_code": ValidationErrorCode.NONE}

    def _detect_data_source(self, esp_device, payload: dict) -> str:
        """
        Detect the data source based on device and payload.

        Detection priority:
        1. Explicit _test_mode flag in payload → TEST
        2. Explicit _source field in payload → use value
        3. Device hardware_type == "MOCK_ESP32" → MOCK
        4. Device capabilities.mock == True → MOCK
        5. ESP ID starts with "MOCK_" → MOCK
        6. ESP ID starts with "TEST_" → TEST
        7. ESP ID starts with "SIM_" → SIMULATION
        8. Default → PRODUCTION

        Args:
            esp_device: ESPDevice instance
            payload: MQTT payload dict

        Returns:
            Data source string value
        """
        esp_id = payload.get("esp_id", getattr(esp_device, "device_id", "unknown"))
        detection_reason = None

        # Priority 1: Explicit test mode flag
        if payload.get("_test_mode"):
            detection_reason = "payload._test_mode=True"
            result = DataSource.TEST.value
            logger.debug(f"DataSource detection [{esp_id}]: {result} (reason: {detection_reason})")
            return result

        # Priority 2: Explicit source field
        if "_source" in payload:
            source_value = payload["_source"].lower()
            try:
                result = DataSource(source_value).value
                detection_reason = f"payload._source='{source_value}'"
                logger.debug(
                    f"DataSource detection [{esp_id}]: {result} (reason: {detection_reason})"
                )
                return result
            except ValueError:
                logger.warning(f"Unknown data source: {source_value}, defaulting to production")
                return DataSource.PRODUCTION.value

        # Priority 3: Device hardware_type
        if hasattr(esp_device, "hardware_type") and esp_device.hardware_type == "MOCK_ESP32":
            detection_reason = "esp_device.hardware_type='MOCK_ESP32'"
            result = DataSource.MOCK.value
            logger.debug(f"DataSource detection [{esp_id}]: {result} (reason: {detection_reason})")
            return result

        # Priority 4: Device capabilities flag
        if hasattr(esp_device, "capabilities") and esp_device.capabilities:
            if esp_device.capabilities.get("mock"):
                detection_reason = "esp_device.capabilities.mock=True"
                result = DataSource.MOCK.value
                logger.debug(
                    f"DataSource detection [{esp_id}]: {result} (reason: {detection_reason})"
                )
                return result

        # Priority 5-7: ESP ID prefix detection
        if esp_id.startswith("MOCK_"):
            detection_reason = f"esp_id prefix 'MOCK_'"
            result = DataSource.MOCK.value
            logger.debug(f"DataSource detection [{esp_id}]: {result} (reason: {detection_reason})")
            return result
        if esp_id.startswith("TEST_"):
            detection_reason = f"esp_id prefix 'TEST_'"
            result = DataSource.TEST.value
            logger.debug(f"DataSource detection [{esp_id}]: {result} (reason: {detection_reason})")
            return result
        if esp_id.startswith("SIM_"):
            detection_reason = f"esp_id prefix 'SIM_'"
            result = DataSource.SIMULATION.value
            logger.debug(f"DataSource detection [{esp_id}]: {result} (reason: {detection_reason})")
            return result

        # Default
        detection_reason = "default (no matching criteria)"
        result = DataSource.PRODUCTION.value
        logger.debug(f"DataSource detection [{esp_id}]: {result} (reason: {detection_reason})")
        return result

    async def _trigger_pi_enhanced_processing(
        self,
        esp_id: str,
        gpio: int,
        sensor_type: str,
        raw_value: float,
        sensor_config,
        raw_mode: bool = True,
    ) -> Optional[dict]:
        """
        Trigger Pi-Enhanced sensor processing.

        Uses library_loader to dynamically load sensor library
        and process raw value.

        Args:
            esp_id: ESP device ID string
            gpio: GPIO pin number
            sensor_type: Sensor type (ph, temperature, etc.)
            raw_value: Raw sensor value
            sensor_config: SensorConfig instance with processing params
            raw_mode: Whether ESP sent RAW value (True) or pre-converted (False)
                     For DS18B20: raw_mode=True means 12-bit integer (400 = 25°C)

        Returns:
            {
                "processed_value": float,
                "unit": str,
                "quality": str
            }
            or None if processing failed
        """
        try:
            from ...sensors.library_loader import get_library_loader
            from ...sensors.sensor_type_registry import normalize_sensor_type

            # Get library loader instance
            loader = get_library_loader()

            # Normalize sensor type (ESP32 → Server Processor)
            normalized_type = normalize_sensor_type(sensor_type)

            # DEBUG: Enhanced logging for sensor processing flow
            logger.info(
                f"[Pi-Enhanced] Processing: esp_id={esp_id}, gpio={gpio}, "
                f"sensor_type='{sensor_type}' → normalized='{normalized_type}'"
            )

            # Get processor for sensor type (normalization happens in get_processor too)
            processor = loader.get_processor(sensor_type)

            # DEBUG: Log processor selection result
            if processor:
                logger.info(
                    f"[Pi-Enhanced] Processor found: {type(processor).__name__} "
                    f"for '{normalized_type}'"
                )
            else:
                logger.error(
                    f"[Pi-Enhanced] No processor found for sensor type: '{sensor_type}'. "
                    f"Normalized: '{normalized_type}'. "
                    f"Available processors: {loader.get_available_sensors()}"
                )
                return None

            # Process raw value using sensor library
            # Extract processing params from metadata if available
            processing_params = {}
            if sensor_config and sensor_config.sensor_metadata:
                processing_params = sensor_config.sensor_metadata.get("processing_params") or {}

            # Always pass raw_mode to processor (Pi-Enhanced mode indicator)
            # For DS18B20: raw_mode=True means ESP sent 12-bit integer (400 = 25°C)
            processing_params["raw_mode"] = raw_mode

            result = processor.process(
                raw_value=raw_value,
                calibration=sensor_config.calibration_data if sensor_config else None,
                params=processing_params,
            )

            # DEBUG: Enhanced result logging
            logger.info(
                f"[Pi-Enhanced] SUCCESS: esp_id={esp_id}, gpio={gpio}, "
                f"sensor_type='{sensor_type}' → raw={raw_value} → "
                f"processed={result.value} {result.unit}, quality={result.quality}"
            )

            return {
                "processed_value": result.value,
                "unit": result.unit,
                "quality": result.quality,
            }

        except Exception as e:
            logger.error(
                f"Pi-Enhanced processing failed: sensor_type={sensor_type}, " f"error={e}",
                exc_info=True,
            )
            return None


# Global handler instance
_handler_instance: Optional[SensorDataHandler] = None


def get_sensor_handler() -> SensorDataHandler:
    """
    Get singleton sensor data handler instance.

    Returns:
        SensorDataHandler instance
    """
    global _handler_instance
    if _handler_instance is None:
        _handler_instance = SensorDataHandler()
    return _handler_instance


async def handle_sensor_data(topic: str, payload: dict) -> bool:
    """
    Handle sensor data message (convenience function).

    Args:
        topic: MQTT topic string
        payload: Parsed JSON payload dict

    Returns:
        True if message processed successfully
    """
    handler = get_sensor_handler()
    return await handler.handle_sensor_data(topic, payload)
