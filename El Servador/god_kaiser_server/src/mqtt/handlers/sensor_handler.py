"""
MQTT Handler: Sensor Data Messages

Processes incoming sensor data from ESP32 devices:
- Parses sensor data topics
- Validates payloads
- Triggers Pi-Enhanced processing if enabled
- Saves data to database
"""

import json
from datetime import datetime, timezone
from typing import Optional

from ...core.logging_config import get_logger
from ...db.repositories import ESPRepository, SensorRepository
from ...db.session import get_session
from ..publisher import Publisher
from ..topics import TopicBuilder

logger = get_logger(__name__)


class SensorDataHandler:
    """
    Handles incoming sensor data messages from ESP32 devices.

    Flow:
    1. Parse topic → extract esp_id, gpio
    2. Validate payload structure
    3. Lookup ESP device and sensor config
    4. Check Pi-Enhanced mode
    5. Save data to database
    6. Trigger Pi-Enhanced processing if needed
    """

    def __init__(self, publisher: Optional[Publisher] = None):
        """
        Initialize sensor data handler.

        Args:
            publisher: Publisher instance for Pi-Enhanced responses
        """
        self.publisher = publisher or Publisher()

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
                logger.error(f"Failed to parse sensor data topic: {topic}")
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
                logger.error(
                    f"Invalid sensor data payload: {validation_result['error']}"
                )
                return False

            # Step 3: Get database session and repositories
            async for session in get_session():
                esp_repo = ESPRepository(session)
                sensor_repo = SensorRepository(session)

                # Step 4: Lookup ESP device
                esp_device = await esp_repo.get_by_device_id(esp_id_str)
                if not esp_device:
                    logger.error(f"ESP device not found: {esp_id_str}")
                    return False

                # Step 5: Lookup sensor config
                sensor_config = await sensor_repo.get_by_esp_and_gpio(
                    esp_device.id, gpio
                )
                if not sensor_config:
                    logger.warning(
                        f"Sensor config not found: esp_id={esp_id_str}, gpio={gpio}. "
                        "Saving data without config."
                    )

                # Step 6: Extract data from payload
                # Accept both "raw" and "raw_value" for compatibility
                raw_value = float(payload.get("raw", payload.get("raw_value")))
                sensor_type = payload.get("sensor_type", "unknown")
                # raw_mode defaults to True (ESP32 always works in raw mode)
                raw_mode = payload.get("raw_mode", True)
                value = payload.get("value", 0.0)
                unit = payload.get("unit", "")
                quality = payload.get("quality", "unknown")

                # Step 7: Determine processing mode
                processing_mode = "raw"
                processed_value = None

                if sensor_config and sensor_config.pi_enhanced and raw_mode:
                    # Pi-Enhanced processing needed
                    processing_mode = "pi_enhanced"

                    # Trigger Pi-Enhanced processing
                    pi_result = await self._trigger_pi_enhanced_processing(
                        esp_id_str,
                        gpio,
                        sensor_type,
                        raw_value,
                        sensor_config,
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
                            f"Pi-Enhanced processing failed: esp_id={esp_id_str}, "
                            f"gpio={gpio}, sensor_type={sensor_type}"
                        )

                elif not raw_mode:
                    # ESP already processed locally
                    processing_mode = "local"
                    processed_value = value

                # Step 8: Save data to database
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
                )

                # Commit transaction
                await session.commit()

                logger.info(
                    f"Sensor data saved: id={sensor_data.id}, esp_id={esp_id_str}, "
                    f"gpio={gpio}, processing_mode={processing_mode}"
                )

                # WebSocket Broadcast
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
                    import asyncio
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
            {"valid": bool, "error": str}
        """
        # Check required fields (with alternatives for compatibility)
        # Accept both "ts" and "timestamp"
        if "ts" not in payload and "timestamp" not in payload:
            return {"valid": False, "error": "Missing required field: ts or timestamp"}

        if "esp_id" not in payload:
            return {"valid": False, "error": "Missing required field: esp_id"}

        if "gpio" not in payload:
            return {"valid": False, "error": "Missing required field: gpio"}

        if "sensor_type" not in payload:
            return {"valid": False, "error": "Missing required field: sensor_type"}

        # Accept both "raw" and "raw_value"
        if "raw" not in payload and "raw_value" not in payload:
            return {"valid": False, "error": "Missing required field: raw or raw_value"}

        # raw_mode is required
        if "raw_mode" not in payload:
            return {"valid": False, "error": "Missing required field: raw_mode"}

        # Type validation
        ts_value = payload.get("ts", payload.get("timestamp"))
        if not isinstance(ts_value, int):
            return {"valid": False, "error": "Field 'ts/timestamp' must be integer (Unix timestamp)"}

        if not isinstance(payload["gpio"], int):
            return {"valid": False, "error": "Field 'gpio' must be integer"}

        # raw_mode validation (must be boolean)
        if not isinstance(payload["raw_mode"], bool):
            return {"valid": False, "error": "Field 'raw_mode' must be boolean"}

        # Validate raw value (should be numeric)
        raw_value = payload.get("raw", payload.get("raw_value"))
        try:
            float(raw_value)
        except (ValueError, TypeError):
            return {"valid": False, "error": "Field 'raw/raw_value' must be numeric"}

        return {"valid": True, "error": ""}

    async def _trigger_pi_enhanced_processing(
        self,
        esp_id: str,
        gpio: int,
        sensor_type: str,
        raw_value: float,
        sensor_config,
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
            
            # Get processor for sensor type (normalization happens in get_processor too)
            processor = loader.get_processor(sensor_type)
            
            if normalized_type != sensor_type.lower():
                logger.debug(
                    f"Normalized sensor type: '{sensor_type}' → '{normalized_type}'"
                )

            if not processor:
                logger.error(
                    f"No processor found for sensor type: {sensor_type}. "
                    f"Available processors: {loader.get_available_sensors()}"
                )
                return None

            # Process raw value using sensor library
            # Extract processing params from metadata if available
            processing_params = None
            if sensor_config and sensor_config.sensor_metadata:
                processing_params = sensor_config.sensor_metadata.get("processing_params")
            
            result = processor.process(
                raw_value=raw_value,
                calibration=sensor_config.calibration_data if sensor_config else None,
                params=processing_params,
            )

            logger.debug(
                f"Pi-Enhanced processing successful: {sensor_type}, "
                f"raw={raw_value}, processed={result.value} {result.unit}, "
                f"quality={result.quality}"
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
