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
from ...core.resilience import (
    ServiceUnavailableError,
    with_timeout_fallback,
    Timeouts,
)
from ...db.models.enums import DataSource
from ...db.repositories import ESPRepository, SensorRepository
from ...db.session import get_session, resilient_session
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
    5. Save data to database (with resilience)
    6. Trigger Pi-Enhanced processing if needed
    
    Resilience:
    - Uses resilient_session() for database operations (circuit breaker)
    - Timeout protection for overall handler operation
    - Best-effort WebSocket broadcast (no retry)
    """

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
                error_code = validation_result.get("error_code", ValidationErrorCode.MISSING_REQUIRED_FIELD)
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
                    sensor_type = payload.get("sensor_type", "unknown")

                    # Step 5.5: Extract onewire_address (for OneWire 4-way lookup)
                    # DS18B20 sensors send ROM code to distinguish multiple sensors on same GPIO
                    onewire_address = payload.get("onewire_address")

                    # Step 6: Lookup sensor config (Multi-Value Support + OneWire Support)
                    sensor_config = None

                    if onewire_address:
                        # OneWire Sensor: 4-way lookup (esp_id, gpio, sensor_type, onewire_address)
                        # Multiple DS18B20 sensors can share same GPIO (bus pin)
                        logger.debug(
                            f"OneWire sensor detected: gpio={gpio}, rom={onewire_address}"
                        )
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
                        # e.g., SHT31 on GPIO 21: sht31_temp + sht31_humidity
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
                    unit = payload.get("unit", "")
                    quality = payload.get("quality", "unknown")

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

                    # Step 8: Detect data source (mock/test/production)
                    data_source = self._detect_data_source(esp_device, payload)

                    # Step 9: Save data to database
                    # Convert ESP32 timestamp (millis since boot) to UTC datetime
                    # Same pattern as heartbeat_handler: auto-detect millis vs seconds
                    esp32_timestamp_raw = payload.get("ts", payload.get("timestamp"))
                    esp32_timestamp = datetime.fromtimestamp(
                        esp32_timestamp_raw / 1000 if esp32_timestamp_raw > 1e10 else esp32_timestamp_raw,
                        tz=timezone.utc
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
                    )

                    # Commit transaction
                    await session.commit()

                    logger.info(
                        f"Sensor data saved: id={sensor_data.id}, esp_id={esp_id_str}, "
                        f"gpio={gpio}, processing_mode={processing_mode}"
                    )

                    # WebSocket Broadcast (best-effort, outside transaction)
                    try:
                        from ...websocket.manager import WebSocketManager
                        ws_manager = await WebSocketManager.get_instance()
                        await ws_manager.broadcast("sensor_data", {
                            "esp_id": esp_id_str,
                            "gpio": gpio,
                            "sensor_type": sensor_type,
                            "value": processed_value or raw_value,
                            "unit": unit,
                            "quality": quality,
                            "timestamp": esp32_timestamp_raw
                        })
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
                                        value=processed_value or raw_value
                                    )
                                else:
                                    logger.debug("Logic Engine not yet initialized, skipping evaluation")
                            except Exception as e:
                                logger.error(f"Error in logic evaluation: {e}", exc_info=True)

                        # Create non-blocking task
                        asyncio.create_task(trigger_logic_evaluation())
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

    def _validate_payload(self, payload: dict) -> dict:
        """
        Validate sensor data payload structure.

        Required fields: ts OR timestamp, esp_id, gpio, sensor_type, raw OR raw_value, raw_mode

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

        # raw_mode is required
        if "raw_mode" not in payload:
            return {
                "valid": False,
                "error": "Missing required field: raw_mode",
                "error_code": ValidationErrorCode.MISSING_REQUIRED_FIELD,
            }

        # Type validation
        ts_value = payload.get("ts", payload.get("timestamp"))
        if not isinstance(ts_value, int):
            return {
                "valid": False,
                "error": "Field 'ts/timestamp' must be integer (Unix timestamp)",
                "error_code": ValidationErrorCode.FIELD_TYPE_MISMATCH,
            }

        if not isinstance(payload["gpio"], int):
            return {
                "valid": False,
                "error": "Field 'gpio' must be integer",
                "error_code": ValidationErrorCode.FIELD_TYPE_MISMATCH,
            }

        # raw_mode validation (must be boolean)
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
                logger.debug(f"DataSource detection [{esp_id}]: {result} (reason: {detection_reason})")
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
                logger.debug(f"DataSource detection [{esp_id}]: {result} (reason: {detection_reason})")
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
                f"Pi-Enhanced processing failed: sensor_type={sensor_type}, "
                f"error={e}",
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
