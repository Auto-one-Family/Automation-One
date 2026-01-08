"""
Config Payload Builder Service

Builds ESP32-compatible configuration payloads from database models.

Features:
- Configurable field name mapping via ConfigMappingEngine
- Metadata extraction (subzone_id from sensor_metadata/actuator_metadata)
- Default value handling
- Zone information extraction for logging
- Runtime-configurable mapping overrides via SystemConfig

Converts Server DB models to ESP32 payload format using flexible mappings
that can be customized without code changes.

Phase: Runtime Config Flow Implementation
Priority: CRITICAL
Status: IMPLEMENTED
"""

from typing import Any, Dict, List, Optional
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config_mapping import ConfigMappingEngine, get_mapping_engine
from ..core.logging_config import get_logger
from ..db.models.actuator import ActuatorConfig
from ..db.models.sensor import SensorConfig
from ..db.models.esp import ESPDevice
from ..db.repositories import ESPRepository, SensorRepository, ActuatorRepository

logger = get_logger(__name__)


class ConfigConflictError(Exception):
    """
    Raised when config contains GPIO conflicts.

    This error indicates that multiple sensors/actuators are configured
    for the same GPIO pin, which would cause hardware conflicts on the ESP32.

    Phase: 2 (GPIO Validation)
    """
    pass


class ConfigPayloadBuilder:
    """
    Builds ESP32-compatible configuration payloads.
    
    Converts database models to ESP32 payload format with configurable field mapping
    and zone information extraction.
    
    Field mappings can be customized via:
    1. Constructor parameter (custom_mapping_engine)
    2. SystemConfig entries (config_mapping.sensor, config_mapping.actuator)
    3. Default mappings in config_mapping.py
    
    Usage:
        # Default mappings
        builder = ConfigPayloadBuilder()
        config = await builder.build_combined_config(esp_id, db)
        
        # Custom mappings
        engine = ConfigMappingEngine(sensor_mappings=[...])
        builder = ConfigPayloadBuilder(mapping_engine=engine)
    """
    
    def __init__(
        self,
        sensor_repo: Optional[SensorRepository] = None,
        actuator_repo: Optional[ActuatorRepository] = None,
        esp_repo: Optional[ESPRepository] = None,
        mapping_engine: Optional[ConfigMappingEngine] = None,
    ):
        """
        Initialize ConfigPayloadBuilder.
        
        Args:
            sensor_repo: Sensor repository (optional, created if not provided)
            actuator_repo: Actuator repository (optional, created if not provided)
            esp_repo: ESP repository (optional, created if not provided)
            mapping_engine: Custom field mapping engine (optional, uses global default)
        """
        self.sensor_repo = sensor_repo
        self.actuator_repo = actuator_repo
        self.esp_repo = esp_repo
        self.mapping_engine = mapping_engine or get_mapping_engine()
    
    def build_sensor_payload(self, sensor: SensorConfig) -> Dict[str, Any]:
        """
        Convert SensorConfig model to ESP32 payload format.
        
        Uses configurable field mappings from ConfigMappingEngine.
        Default mappings:
        - sensor_name → sensor_name (direct)
        - sensor_type → sensor_type (direct)
        - gpio → gpio (direct)
        - enabled → active (boolean mapping)
        - sample_interval_ms → sample_interval_ms (direct)
        - sensor_metadata.subzone_id → subzone_id (extracted from metadata)
        - raw_mode → always true (ESP32 expects this field)
        
        Args:
            sensor: SensorConfig model instance
            
        Returns:
            Dictionary with ESP32-compatible sensor payload
        """
        return self.mapping_engine.apply_sensor_mapping(sensor)
    
    def build_actuator_payload(self, actuator: ActuatorConfig) -> Dict[str, Any]:
        """
        Convert ActuatorConfig model to ESP32 payload format.
        
        Uses configurable field mappings from ConfigMappingEngine.
        Default mappings:
        - actuator_name → actuator_name (direct)
        - actuator_type → actuator_type (direct)
        - gpio → gpio (direct)
        - enabled → active (boolean mapping)
        - actuator_metadata.subzone_id → subzone_id (extracted from metadata)
        - actuator_metadata.aux_gpio → aux_gpio (default: 255)
        - actuator_metadata.critical → critical (default: false)
        - actuator_metadata.inverted_logic → inverted_logic (default: false)
        - actuator_metadata.default_state → default_state (default: false)
        - actuator_metadata.default_pwm → default_pwm (default: 0)
        
        Args:
            actuator: ActuatorConfig model instance
            
        Returns:
            Dictionary with ESP32-compatible actuator payload
        """
        return self.mapping_engine.apply_actuator_mapping(actuator)
    
    async def build_combined_config(
        self,
        esp_device_id: str,
        db: AsyncSession,
    ) -> Dict[str, Any]:
        """
        Build combined sensor/actuator configuration payload for ESP32.
        
        Loads all active sensors and actuators for the ESP device and builds
        a combined payload in ESP32-compatible format.
        
        Args:
            esp_device_id: ESP device ID (e.g., "ESP_12AB34CD")
            db: Database session
            
        Returns:
            Dictionary with "sensors" and "actuators" arrays in ESP32 format
            
        Raises:
            ValueError: If ESP device not found
        """
        # Initialize repositories if not provided
        if not self.esp_repo:
            self.esp_repo = ESPRepository(db)
        if not self.sensor_repo:
            self.sensor_repo = SensorRepository(db)
        if not self.actuator_repo:
            self.actuator_repo = ActuatorRepository(db)
        
        # Get ESP device
        esp_device = await self.esp_repo.get_by_device_id(esp_device_id)
        if not esp_device:
            raise ValueError(f"ESP device '{esp_device_id}' not found")
        
        # Load all sensors and actuators for this ESP
        sensors = await self.sensor_repo.get_by_esp(esp_device.id)
        actuators = await self.actuator_repo.get_by_esp(esp_device.id)
        
        # Filter only enabled sensors/actuators (ESP32 only processes active ones)
        active_sensors = [s for s in sensors if s.enabled]
        active_actuators = [a for a in actuators if a.enabled]

        # =====================================================================
        # GPIO-Konflikt-Check (Phase 2)
        # Prüft ob mehrere Sensoren/Aktoren auf dem gleichen GPIO konfiguriert sind
        # =====================================================================
        used_gpios: dict[int, str] = {}

        for sensor in active_sensors:
            if sensor.gpio in used_gpios:
                sensor_name = sensor.sensor_name or sensor.sensor_type
                raise ConfigConflictError(
                    f"GPIO {sensor.gpio} Konflikt: Sensor '{sensor_name}' "
                    f"kollidiert mit {used_gpios[sensor.gpio]}"
                )
            sensor_name = sensor.sensor_name or sensor.sensor_type
            used_gpios[sensor.gpio] = f"sensor:{sensor_name}"

        for actuator in active_actuators:
            if actuator.gpio in used_gpios:
                actuator_name = actuator.actuator_name or actuator.actuator_type
                raise ConfigConflictError(
                    f"GPIO {actuator.gpio} Konflikt: Actuator '{actuator_name}' "
                    f"kollidiert mit {used_gpios[actuator.gpio]}"
                )
            actuator_name = actuator.actuator_name or actuator.actuator_type
            used_gpios[actuator.gpio] = f"actuator:{actuator_name}"

        logger.debug(f"Config GPIO validation passed: {len(used_gpios)} unique GPIOs")
        # =====================================================================

        # Build payload arrays
        sensor_payloads = [self.build_sensor_payload(s) for s in active_sensors]
        actuator_payloads = [self.build_actuator_payload(a) for a in active_actuators]
        
        # Build combined config
        config = {
            "sensors": sensor_payloads,
            "actuators": actuator_payloads,
        }
        
        # Log zone information for better traceability
        zone_info = f"zone={esp_device.zone_id or 'none'}"
        if esp_device.zone_name:
            zone_info += f" ({esp_device.zone_name})"
        
        logger.info(
            f"Built config payload for {esp_device_id}: "
            f"{len(sensor_payloads)} sensors, {len(actuator_payloads)} actuators, {zone_info}"
        )
        
        return config

