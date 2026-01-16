"""
Configuration Field Mapping System

Defines field mappings between Server DB models and ESP32 payload format.
Designed for industrial systems with full configurability.

Features:
- Default mappings for sensors and actuators
- Dynamic mapping override via SystemConfig
- Validation of mappings
- Support for nested field extraction (metadata.subzone_id)
- Type conversion support

Configuration Key (SystemConfig):
- config_mapping.sensor: Custom sensor field mappings
- config_mapping.actuator: Custom actuator field mappings

Phase: Runtime Config Flow Implementation
Priority: MEDIUM
Status: IMPLEMENTED
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Union

from ..core.logging_config import get_logger

logger = get_logger(__name__)


class FieldType(str, Enum):
    """Supported field types for mapping."""
    
    STRING = "string"
    INTEGER = "int"
    FLOAT = "float"
    BOOLEAN = "bool"
    JSON = "json"


@dataclass
class FieldMapping:
    """
    Single field mapping definition.
    
    Attributes:
        source: Source field path (supports dots for nested: "metadata.subzone_id")
        target: Target field name in ESP32 payload
        field_type: Expected field type
        default: Default value if source is None
        required: Whether field must have a value
        transform: Optional transformation function name
    """
    
    source: str
    target: str
    field_type: FieldType = FieldType.STRING
    default: Any = None
    required: bool = False
    transform: Optional[str] = None


# =============================================================================
# Default Field Mappings
# =============================================================================


# Sensor field mappings (Server → ESP32)
DEFAULT_SENSOR_MAPPINGS: List[Dict[str, Any]] = [
    {
        "source": "gpio",
        "target": "gpio",
        "field_type": "int",
        "required": True,
    },
    {
        "source": "sensor_type",
        "target": "sensor_type",
        "field_type": "string",
        "required": True,
    },
    {
        "source": "sensor_name",
        "target": "sensor_name",
        "field_type": "string",
        "default": "",
    },
    {
        "source": "sensor_metadata.subzone_id",
        "target": "subzone_id",
        "field_type": "string",
        "default": "",
    },
    {
        "source": "enabled",
        "target": "active",
        "field_type": "bool",
        "default": True,
    },
    {
        "source": "sample_interval_ms",
        "target": "sample_interval_ms",
        "field_type": "int",
        "default": 1000,
    },
    # ESP32 expects raw_mode field (always true for server-processed sensors)
    {
        "source": "_constant",
        "target": "raw_mode",
        "field_type": "bool",
        "default": True,
    },
    # Phase 2C: Operating Mode for ESP32 measurement behavior
    # Modes: continuous (auto-measure), on_demand (command only), paused (no measure), scheduled (server-triggered)
    {
        "source": "operating_mode",
        "target": "operating_mode",
        "field_type": "string",
        "required": False,
        "default": "continuous",
    },
    # Phase 2C: Per-sensor measurement interval in seconds (converted from ms)
    {
        "source": "sample_interval_ms",
        "target": "measurement_interval_seconds",
        "field_type": "int",
        "required": False,
        "default": 30,
        "transform": "ms_to_seconds",
    },
]


# Actuator field mappings (Server → ESP32)
DEFAULT_ACTUATOR_MAPPINGS: List[Dict[str, Any]] = [
    {
        "source": "gpio",
        "target": "gpio",
        "field_type": "int",
        "required": True,
    },
    {
        "source": "actuator_type",
        "target": "actuator_type",
        "field_type": "string",
        "required": True,
    },
    {
        "source": "actuator_name",
        "target": "actuator_name",
        "field_type": "string",
        "default": "",
    },
    {
        "source": "actuator_metadata.subzone_id",
        "target": "subzone_id",
        "field_type": "string",
        "default": "",
    },
    {
        "source": "enabled",
        "target": "active",
        "field_type": "bool",
        "default": True,
    },
    {
        "source": "actuator_metadata.aux_gpio",
        "target": "aux_gpio",
        "field_type": "int",
        "default": 255,  # 255 = unused
    },
    {
        "source": "actuator_metadata.critical",
        "target": "critical",
        "field_type": "bool",
        "default": False,
    },
    {
        "source": "actuator_metadata.inverted_logic",
        "target": "inverted_logic",
        "field_type": "bool",
        "default": False,
    },
    {
        "source": "actuator_metadata.default_state",
        "target": "default_state",
        "field_type": "bool",
        "default": False,
    },
    {
        "source": "actuator_metadata.default_pwm",
        "target": "default_pwm",
        "field_type": "int",
        "default": 0,
    },
]


# =============================================================================
# Mapping Engine
# =============================================================================


class ConfigMappingEngine:
    """
    Engine for applying field mappings to model objects.
    
    Supports:
    - Nested field extraction (metadata.field)
    - Type conversion
    - Default values
    - Custom transformations
    - Runtime configuration override
    
    Usage:
        engine = ConfigMappingEngine()
        
        # Use default mappings
        payload = engine.apply_sensor_mapping(sensor_model)
        
        # Or with custom mappings
        custom_mappings = [{"source": "name", "target": "custom_name"}]
        payload = engine.apply_mapping(model, custom_mappings)
    """
    
    # Available transform functions
    TRANSFORMS: Dict[str, Callable[[Any], Any]] = {
        "uppercase": lambda x: str(x).upper() if x else "",
        "lowercase": lambda x: str(x).lower() if x else "",
        "to_int": lambda x: int(x) if x is not None else 0,
        "to_float": lambda x: float(x) if x is not None else 0.0,
        "to_bool": lambda x: bool(x) if x is not None else False,
        "invert_bool": lambda x: not bool(x) if x is not None else True,
        # Phase 2C: Convert milliseconds to seconds for ESP32 measurement interval
        "ms_to_seconds": lambda x: (int(x) // 1000) if x else 30,
    }
    
    def __init__(
        self,
        sensor_mappings: Optional[List[Dict[str, Any]]] = None,
        actuator_mappings: Optional[List[Dict[str, Any]]] = None,
    ):
        """
        Initialize ConfigMappingEngine.
        
        Args:
            sensor_mappings: Custom sensor mappings (uses defaults if None)
            actuator_mappings: Custom actuator mappings (uses defaults if None)
        """
        self.sensor_mappings = sensor_mappings or DEFAULT_SENSOR_MAPPINGS
        self.actuator_mappings = actuator_mappings or DEFAULT_ACTUATOR_MAPPINGS
    
    def apply_sensor_mapping(self, model: Any) -> Dict[str, Any]:
        """
        Apply sensor field mappings to a model.
        
        Args:
            model: SensorConfig model instance
            
        Returns:
            ESP32-compatible payload dict
        """
        return self.apply_mapping(model, self.sensor_mappings)
    
    def apply_actuator_mapping(self, model: Any) -> Dict[str, Any]:
        """
        Apply actuator field mappings to a model.
        
        Args:
            model: ActuatorConfig model instance
            
        Returns:
            ESP32-compatible payload dict
        """
        return self.apply_mapping(model, self.actuator_mappings)
    
    def apply_mapping(
        self,
        model: Any,
        mappings: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Apply field mappings to a model object.
        
        Args:
            model: Model instance with attributes
            mappings: List of field mapping definitions
            
        Returns:
            Transformed payload dict
        """
        payload: Dict[str, Any] = {}
        
        for mapping_def in mappings:
            source = mapping_def.get("source", "")
            target = mapping_def.get("target", "")
            field_type = mapping_def.get("field_type", "string")
            default = mapping_def.get("default")
            required = mapping_def.get("required", False)
            transform = mapping_def.get("transform")
            
            if not target:
                continue
            
            # Handle constant values (source="_constant")
            if source == "_constant":
                payload[target] = self._convert_type(default, field_type)
                continue
            
            # Extract value from model
            value = self._extract_value(model, source)
            
            # Apply default if value is None
            if value is None:
                if required:
                    logger.warning(f"Required field {source} is missing")
                value = default
            
            # Apply transformation if specified
            if transform and transform in self.TRANSFORMS:
                value = self.TRANSFORMS[transform](value)
            
            # Convert to target type
            value = self._convert_type(value, field_type)
            
            payload[target] = value
        
        return payload
    
    def _extract_value(self, model: Any, path: str) -> Any:
        """
        Extract value from model using dot-notation path.
        
        Supports:
        - Simple: "field_name"
        - Nested: "metadata.subzone_id"
        - Dict access: "sensor_metadata.custom_field"
        
        Args:
            model: Model instance
            path: Dot-separated field path
            
        Returns:
            Extracted value or None
        """
        parts = path.split(".")
        value = model
        
        for part in parts:
            if value is None:
                return None
            
            # Try attribute access first
            if hasattr(value, part):
                value = getattr(value, part)
            # Then try dict access
            elif isinstance(value, dict):
                value = value.get(part)
            else:
                return None
        
        return value
    
    def _convert_type(self, value: Any, field_type: str) -> Any:
        """
        Convert value to specified type.
        
        Args:
            value: Value to convert
            field_type: Target type (string, int, float, bool, json)
            
        Returns:
            Converted value
        """
        if value is None:
            # Return type-appropriate None value
            type_defaults = {
                "string": "",
                "int": 0,
                "float": 0.0,
                "bool": False,
                "json": {},
            }
            return type_defaults.get(field_type, None)
        
        try:
            if field_type == "string":
                return str(value)
            elif field_type == "int":
                return int(value) if value is not None else 0
            elif field_type == "float":
                return float(value) if value is not None else 0.0
            elif field_type == "bool":
                if isinstance(value, str):
                    return value.lower() in ("true", "1", "yes", "on")
                return bool(value)
            elif field_type == "json":
                return value if isinstance(value, (dict, list)) else {}
            else:
                return value
        except (ValueError, TypeError) as e:
            logger.warning(f"Type conversion failed for {value} to {field_type}: {e}")
            return value
    
    def validate_mappings(self, mappings: List[Dict[str, Any]]) -> List[str]:
        """
        Validate mapping definitions.
        
        Args:
            mappings: List of mapping definitions
            
        Returns:
            List of validation error messages (empty if valid)
        """
        errors = []
        targets_seen = set()
        
        for i, mapping in enumerate(mappings):
            # Check required fields
            if not mapping.get("source"):
                errors.append(f"Mapping {i}: missing 'source' field")
            if not mapping.get("target"):
                errors.append(f"Mapping {i}: missing 'target' field")
            
            # Check for duplicate targets
            target = mapping.get("target", "")
            if target in targets_seen:
                errors.append(f"Mapping {i}: duplicate target '{target}'")
            targets_seen.add(target)
            
            # Validate field_type
            field_type = mapping.get("field_type", "string")
            valid_types = ["string", "int", "float", "bool", "json"]
            if field_type not in valid_types:
                errors.append(
                    f"Mapping {i}: invalid field_type '{field_type}', "
                    f"must be one of {valid_types}"
                )
            
            # Validate transform
            transform = mapping.get("transform")
            if transform and transform not in self.TRANSFORMS:
                errors.append(
                    f"Mapping {i}: unknown transform '{transform}', "
                    f"must be one of {list(self.TRANSFORMS.keys())}"
                )
        
        return errors
    
    def get_mapping_schema(self) -> Dict[str, Any]:
        """
        Get JSON schema for mapping validation.
        
        Returns:
            JSON schema dict for frontend validation
        """
        return {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["source", "target"],
                "properties": {
                    "source": {
                        "type": "string",
                        "description": "Source field path (dot notation for nested)",
                    },
                    "target": {
                        "type": "string",
                        "description": "Target field name in ESP32 payload",
                    },
                    "field_type": {
                        "type": "string",
                        "enum": ["string", "int", "float", "bool", "json"],
                        "default": "string",
                    },
                    "default": {
                        "description": "Default value if source is None",
                    },
                    "required": {
                        "type": "boolean",
                        "default": False,
                    },
                    "transform": {
                        "type": "string",
                        "enum": list(self.TRANSFORMS.keys()),
                    },
                },
            },
        }


# =============================================================================
# Global Instance
# =============================================================================

# Default engine instance (can be replaced with configured version)
_default_engine: Optional[ConfigMappingEngine] = None


def get_mapping_engine() -> ConfigMappingEngine:
    """Get or create the default mapping engine."""
    global _default_engine
    if _default_engine is None:
        _default_engine = ConfigMappingEngine()
    return _default_engine


def set_mapping_engine(engine: ConfigMappingEngine) -> None:
    """Set a custom mapping engine (for testing or runtime config)."""
    global _default_engine
    _default_engine = engine


















