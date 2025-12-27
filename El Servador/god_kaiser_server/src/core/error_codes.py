"""
Unified Error Code System (Server + ESP32)

Provides a synchronized error code system that works across both
the God-Kaiser server and ESP32 firmware. Designed for industrial
systems with comprehensive error tracking and human-readable descriptions.

Error Code Ranges:
ESP32 Firmware (1000-4999):
- HARDWARE: 1000-1999 (GPIO, I2C, Sensors, Actuators)
- SERVICE: 2000-2999 (NVS, Config, Storage)
- COMMUNICATION: 3000-3999 (WiFi, MQTT, HTTP)
- APPLICATION: 4000-4999 (State, Operations, Commands)

Server (5000-5999):
- CONFIG_ERROR: 5000-5099
- MQTT_ERROR: 5100-5199
- VALIDATION_ERROR: 5200-5299
- DATABASE_ERROR: 5300-5399
- SERVICE_ERROR: 5400-5499
- AUDIT_ERROR: 5500-5599

Phase: Runtime Config Flow Implementation
Priority: MEDIUM
Status: IMPLEMENTED
"""

from enum import IntEnum
from typing import Dict, List, Optional, Tuple


# =============================================================================
# ESP32 Error Codes (Mirror of error_codes.h)
# =============================================================================

class ESP32HardwareError(IntEnum):
    """ESP32 Hardware error codes (1000-1999)."""
    
    GPIO_RESERVED = 1001
    GPIO_CONFLICT = 1002
    GPIO_INIT_FAILED = 1003
    GPIO_INVALID_MODE = 1004
    GPIO_READ_FAILED = 1005
    GPIO_WRITE_FAILED = 1006
    
    I2C_INIT_FAILED = 1010
    I2C_DEVICE_NOT_FOUND = 1011
    I2C_READ_FAILED = 1012
    I2C_WRITE_FAILED = 1013
    I2C_BUS_ERROR = 1014
    
    ONEWIRE_INIT_FAILED = 1020
    ONEWIRE_NO_DEVICES = 1021
    ONEWIRE_READ_FAILED = 1022
    
    PWM_INIT_FAILED = 1030
    PWM_CHANNEL_FULL = 1031
    PWM_SET_FAILED = 1032
    
    SENSOR_READ_FAILED = 1040
    SENSOR_INIT_FAILED = 1041
    SENSOR_NOT_FOUND = 1042
    SENSOR_TIMEOUT = 1043
    
    ACTUATOR_SET_FAILED = 1050
    ACTUATOR_INIT_FAILED = 1051
    ACTUATOR_NOT_FOUND = 1052
    ACTUATOR_CONFLICT = 1053


class ESP32ServiceError(IntEnum):
    """ESP32 Service error codes (2000-2999)."""
    
    NVS_INIT_FAILED = 2001
    NVS_READ_FAILED = 2002
    NVS_WRITE_FAILED = 2003
    NVS_NAMESPACE_FAILED = 2004
    NVS_CLEAR_FAILED = 2005
    
    CONFIG_INVALID = 2010
    CONFIG_MISSING = 2011
    CONFIG_LOAD_FAILED = 2012
    CONFIG_SAVE_FAILED = 2013
    CONFIG_VALIDATION = 2014
    
    LOGGER_INIT_FAILED = 2020
    LOGGER_BUFFER_FULL = 2021
    
    STORAGE_INIT_FAILED = 2030
    STORAGE_READ_FAILED = 2031
    STORAGE_WRITE_FAILED = 2032


class ESP32CommunicationError(IntEnum):
    """ESP32 Communication error codes (3000-3999)."""
    
    WIFI_INIT_FAILED = 3001
    WIFI_CONNECT_TIMEOUT = 3002
    WIFI_CONNECT_FAILED = 3003
    WIFI_DISCONNECT = 3004
    WIFI_NO_SSID = 3005
    
    MQTT_INIT_FAILED = 3010
    MQTT_CONNECT_FAILED = 3011
    MQTT_PUBLISH_FAILED = 3012
    MQTT_SUBSCRIBE_FAILED = 3013
    MQTT_DISCONNECT = 3014
    MQTT_BUFFER_FULL = 3015
    MQTT_PAYLOAD_INVALID = 3016
    
    HTTP_INIT_FAILED = 3020
    HTTP_REQUEST_FAILED = 3021
    HTTP_RESPONSE_INVALID = 3022
    HTTP_TIMEOUT = 3023
    
    NETWORK_UNREACHABLE = 3030
    DNS_FAILED = 3031
    CONNECTION_LOST = 3032


class ESP32ApplicationError(IntEnum):
    """ESP32 Application error codes (4000-4999)."""
    
    STATE_INVALID = 4001
    STATE_TRANSITION = 4002
    STATE_MACHINE_STUCK = 4003
    
    OPERATION_TIMEOUT = 4010
    OPERATION_FAILED = 4011
    OPERATION_CANCELLED = 4012
    
    COMMAND_INVALID = 4020
    COMMAND_PARSE_FAILED = 4021
    COMMAND_EXEC_FAILED = 4022
    
    PAYLOAD_INVALID = 4030
    PAYLOAD_TOO_LARGE = 4031
    PAYLOAD_PARSE_FAILED = 4032
    
    MEMORY_FULL = 4040
    MEMORY_ALLOCATION = 4041
    MEMORY_LEAK = 4042
    
    SYSTEM_INIT_FAILED = 4050
    SYSTEM_RESTART = 4051
    SYSTEM_SAFE_MODE = 4052
    
    TASK_FAILED = 4060
    TASK_TIMEOUT = 4061
    TASK_QUEUE_FULL = 4062


# ESP32 ConfigErrorCode (string-based, mirrors enum in error_codes.h)
class ESP32ConfigErrorCode:
    """ESP32 configuration response error codes (string-based)."""
    
    NONE = "NONE"
    JSON_PARSE_ERROR = "JSON_PARSE_ERROR"
    VALIDATION_FAILED = "VALIDATION_FAILED"
    GPIO_CONFLICT = "GPIO_CONFLICT"
    NVS_WRITE_FAILED = "NVS_WRITE_FAILED"
    TYPE_MISMATCH = "TYPE_MISMATCH"
    MISSING_FIELD = "MISSING_FIELD"
    OUT_OF_RANGE = "OUT_OF_RANGE"
    UNKNOWN_ERROR = "UNKNOWN_ERROR"


# =============================================================================
# Server Error Codes (5000-5999)
# =============================================================================

class ConfigErrorCode(IntEnum):
    """Server configuration error codes (5000-5099)."""
    
    NONE = 0
    ESP_DEVICE_NOT_FOUND = 5001
    CONFIG_BUILD_FAILED = 5002
    CONFIG_PAYLOAD_INVALID = 5003
    CONFIG_PUBLISH_FAILED = 5004
    FIELD_MAPPING_FAILED = 5005
    CONFIG_TIMEOUT = 5006
    ESP_OFFLINE = 5007


class MQTTErrorCode(IntEnum):
    """Server MQTT error codes (5100-5199)."""
    
    NONE = 0
    PUBLISH_FAILED = 5101
    TOPIC_BUILD_FAILED = 5102
    PAYLOAD_SERIALIZATION_FAILED = 5103
    CONNECTION_LOST = 5104
    RETRY_EXHAUSTED = 5105
    BROKER_UNAVAILABLE = 5106
    AUTHENTICATION_FAILED = 5107


class ValidationErrorCode(IntEnum):
    """Server validation error codes (5200-5299)."""
    
    NONE = 0
    INVALID_ESP_ID = 5201
    INVALID_GPIO = 5202
    INVALID_SENSOR_TYPE = 5203
    INVALID_ACTUATOR_TYPE = 5204
    MISSING_REQUIRED_FIELD = 5205
    FIELD_TYPE_MISMATCH = 5206
    VALUE_OUT_OF_RANGE = 5207
    DUPLICATE_ENTRY = 5208


class DatabaseErrorCode(IntEnum):
    """Server database error codes (5300-5399)."""
    
    NONE = 0
    QUERY_FAILED = 5301
    COMMIT_FAILED = 5302
    ROLLBACK_FAILED = 5303
    CONNECTION_FAILED = 5304
    INTEGRITY_ERROR = 5305
    MIGRATION_FAILED = 5306


class ServiceErrorCode(IntEnum):
    """Server service error codes (5400-5499)."""
    
    NONE = 0
    SERVICE_INITIALIZATION_FAILED = 5401
    DEPENDENCY_MISSING = 5402
    OPERATION_TIMEOUT = 5403
    RATE_LIMIT_EXCEEDED = 5404
    PERMISSION_DENIED = 5405


class AuditErrorCode(IntEnum):
    """Server audit error codes (5500-5599)."""

    NONE = 0
    AUDIT_LOG_FAILED = 5501
    RETENTION_CLEANUP_FAILED = 5502
    STATISTICS_FAILED = 5503


class SequenceErrorCode(IntEnum):
    """Server sequence error codes (5600-5699)."""

    # Validation Errors (5600-5609)
    SEQ_INVALID_DEFINITION = 5600
    SEQ_EMPTY_STEPS = 5601
    SEQ_INVALID_STEP = 5602
    SEQ_INVALID_ACTION_TYPE = 5603
    SEQ_STEP_MISSING_ACTION = 5604
    SEQ_INVALID_DELAY = 5605
    SEQ_TOO_MANY_STEPS = 5606
    SEQ_DURATION_EXCEEDED = 5607

    # Runtime Errors (5610-5629)
    SEQ_ALREADY_RUNNING = 5610
    SEQ_NOT_FOUND = 5611
    SEQ_CANCELLED = 5612
    SEQ_TIMEOUT = 5613
    SEQ_STEP_FAILED = 5614
    SEQ_STEP_TIMEOUT = 5615
    SEQ_MAX_DURATION_EXCEEDED = 5616
    SEQ_EXECUTOR_NOT_FOUND = 5617
    SEQ_CIRCULAR_REFERENCE = 5618

    # System Errors (5630-5639)
    SEQ_TASK_CREATION_FAILED = 5630
    SEQ_INTERNAL_ERROR = 5631
    SEQ_CLEANUP_FAILED = 5632
    SEQ_STATE_CORRUPTION = 5633

    # Conflict Errors (5640-5649)
    SEQ_ACTUATOR_LOCKED = 5640
    SEQ_RATE_LIMITED = 5641
    SEQ_SAFETY_BLOCKED = 5642


# =============================================================================
# Error Code Descriptions (All Systems)
# =============================================================================

# ESP32 error descriptions (synchronized with error_codes.h)
ESP32_ERROR_DESCRIPTIONS: Dict[int, str] = {
    # Hardware (1000-1999)
    1001: "GPIO pin is reserved by system",
    1002: "GPIO pin already in use by another component",
    1003: "Failed to initialize GPIO pin",
    1004: "Invalid GPIO pin mode specified",
    1005: "Failed to read GPIO pin value",
    1006: "Failed to write GPIO pin value",
    
    1010: "Failed to initialize I2C bus",
    1011: "I2C device not found on bus",
    1012: "Failed to read from I2C device",
    1013: "Failed to write to I2C device",
    1014: "I2C bus error (SDA/SCL stuck or timeout)",
    
    1020: "Failed to initialize OneWire bus",
    1021: "No OneWire devices found on bus",
    1022: "Failed to read from OneWire device",
    
    1030: "Failed to initialize PWM controller",
    1031: "All PWM channels already in use",
    1032: "Failed to set PWM duty cycle",
    
    1040: "Failed to read sensor data",
    1041: "Failed to initialize sensor",
    1042: "Sensor not configured or not found",
    1043: "Sensor read timeout (device not responding)",
    
    1050: "Failed to set actuator state",
    1051: "Failed to initialize actuator",
    1052: "Actuator not configured or not found",
    1053: "Actuator GPIO conflict with sensor",
    
    # Service (2000-2999)
    2001: "Failed to initialize NVS (Non-Volatile Storage)",
    2002: "Failed to read from NVS",
    2003: "Failed to write to NVS (storage full or corrupted)",
    2004: "Failed to open NVS namespace",
    2005: "Failed to clear NVS namespace",
    
    2010: "Configuration data is invalid",
    2011: "Required configuration is missing",
    2012: "Failed to load configuration from NVS",
    2013: "Failed to save configuration to NVS",
    2014: "Configuration validation failed",
    
    2020: "Failed to initialize logger system",
    2021: "Logger buffer is full (messages dropped)",
    
    2030: "Failed to initialize storage manager",
    2031: "Failed to read from storage",
    2032: "Failed to write to storage",
    
    # Communication (3000-3999)
    3001: "Failed to initialize WiFi module",
    3002: "WiFi connection timeout",
    3003: "WiFi connection failed (wrong password or SSID not found)",
    3004: "WiFi disconnected unexpectedly",
    3005: "WiFi SSID not configured",
    
    3010: "Failed to initialize MQTT client",
    3011: "MQTT broker connection failed",
    3012: "Failed to publish MQTT message",
    3013: "Failed to subscribe to MQTT topic",
    3014: "MQTT disconnected from broker",
    3015: "MQTT offline buffer is full (messages dropped)",
    3016: "MQTT payload is invalid or malformed",
    
    3020: "Failed to initialize HTTP client",
    3021: "HTTP request failed (server unreachable)",
    3022: "HTTP response is invalid or malformed",
    3023: "HTTP request timeout",
    
    3030: "Network is unreachable",
    3031: "DNS lookup failed (hostname not resolved)",
    3032: "Network connection lost",
    
    # Application (4000-4999)
    4001: "Invalid system state",
    4002: "Invalid state transition",
    4003: "State machine is stuck (no valid transitions)",
    
    4010: "Operation timeout",
    4011: "Operation failed",
    4012: "Operation cancelled by user or system",
    
    4020: "Command is invalid or unknown",
    4021: "Failed to parse command",
    4022: "Command execution failed",
    
    4030: "Payload is invalid or malformed",
    4031: "Payload size exceeds maximum allowed",
    4032: "Failed to parse payload (JSON syntax error)",
    
    4040: "Memory is full (heap exhausted)",
    4041: "Failed to allocate memory",
    4042: "Memory leak detected",
    
    4050: "System initialization failed",
    4051: "System restart requested",
    4052: "System entered safe mode (errors detected)",
    
    4060: "FreeRTOS task failed",
    4061: "FreeRTOS task timeout",
    4062: "FreeRTOS task queue is full",
}

# ESP32 ConfigErrorCode descriptions
ESP32_CONFIG_ERROR_DESCRIPTIONS: Dict[str, str] = {
    "NONE": "No error",
    "JSON_PARSE_ERROR": "Failed to parse JSON configuration",
    "VALIDATION_FAILED": "Configuration validation failed",
    "GPIO_CONFLICT": "GPIO pin conflict detected",
    "NVS_WRITE_FAILED": "Failed to save configuration to NVS",
    "TYPE_MISMATCH": "Field type mismatch in configuration",
    "MISSING_FIELD": "Required field missing in configuration",
    "OUT_OF_RANGE": "Value out of allowed range",
    "UNKNOWN_ERROR": "Unknown configuration error",
}

# Server error descriptions
SERVER_ERROR_DESCRIPTIONS: Dict[int, str] = {
    # Config errors (5000-5099)
    5001: "ESP device not found in database",
    5002: "Failed to build configuration payload",
    5003: "Configuration payload is invalid",
    5004: "Failed to publish configuration via MQTT",
    5005: "Failed to map fields between server and ESP32 format",
    5006: "Configuration response timeout",
    5007: "ESP device is offline",
    
    # MQTT errors (5100-5199)
    5101: "MQTT publish operation failed",
    5102: "Failed to build MQTT topic",
    5103: "Failed to serialize MQTT payload",
    5104: "MQTT connection lost",
    5105: "MQTT retry attempts exhausted",
    5106: "MQTT broker is unavailable",
    5107: "MQTT authentication failed",
    
    # Validation errors (5200-5299)
    5201: "Invalid ESP device ID format",
    5202: "Invalid GPIO pin number",
    5203: "Invalid sensor type",
    5204: "Invalid actuator type",
    5205: "Missing required field in request",
    5206: "Field type mismatch",
    5207: "Value out of allowed range",
    5208: "Duplicate entry (already exists)",
    
    # Database errors (5300-5399)
    5301: "Database query failed",
    5302: "Database commit failed",
    5303: "Database rollback failed",
    5304: "Database connection failed",
    5305: "Database integrity constraint violated",
    5306: "Database migration failed",
    
    # Service errors (5400-5499)
    5401: "Service initialization failed",
    5402: "Required dependency missing",
    5403: "Service operation timed out",
    5404: "Rate limit exceeded",
    5405: "Permission denied",
    
    # Audit errors (5500-5599)
    5501: "Failed to write audit log",
    5502: "Retention cleanup failed",
    5503: "Failed to compute audit statistics",

    # Sequence errors (5600-5699)
    5600: "Invalid sequence definition",
    5601: "Sequence must have at least one step",
    5602: "Invalid step configuration",
    5603: "Unknown action type in step",
    5604: "Step requires either 'action' or 'delay_seconds'",
    5605: "Invalid delay value (must be 0-3600 seconds)",
    5606: "Too many steps (max 50)",
    5607: "Sequence duration exceeds maximum allowed",
    5610: "Sequence with this ID is already running",
    5611: "Sequence not found",
    5612: "Sequence was cancelled",
    5613: "Sequence timed out",
    5614: "Step execution failed",
    5615: "Step timed out",
    5616: "Maximum sequence duration exceeded",
    5617: "No executor found for action type",
    5618: "Circular sequence reference detected",
    5630: "Failed to create sequence task",
    5631: "Internal sequence error",
    5632: "Failed to cleanup completed sequence",
    5633: "Sequence state corruption detected",
    5640: "Actuator locked by another sequence/rule",
    5641: "Rate limit exceeded",
    5642: "Action blocked by safety system",
}


def get_error_code_description(code: int) -> str:
    """
    Get human-readable description for any error code (ESP32 or Server).
    
    Supports all error code ranges:
    - ESP32 Hardware (1000-1999)
    - ESP32 Service (2000-2999)
    - ESP32 Communication (3000-3999)
    - ESP32 Application (4000-4999)
    - Server Config (5000-5099)
    - Server MQTT (5100-5199)
    - Server Validation (5200-5299)
    - Server Database (5300-5399)
    - Server Service (5400-5499)
    - Server Audit (5500-5599)
    
    Args:
        code: Error code integer
        
    Returns:
        Human-readable error description
    """
    # ESP32 errors (1000-4999)
    if 1000 <= code < 5000:
        return ESP32_ERROR_DESCRIPTIONS.get(code, f"Unknown ESP32 error: {code}")
    
    # Server errors (5000-5999)
    if 5000 <= code < 6000:
        return SERVER_ERROR_DESCRIPTIONS.get(code, f"Unknown server error: {code}")
    
    return f"Unknown error code: {code}"


def get_esp32_config_error_description(code: str) -> str:
    """
    Get description for ESP32 ConfigErrorCode (string-based).
    
    Args:
        code: ConfigErrorCode string (e.g., "GPIO_CONFLICT")
        
    Returns:
        Human-readable description
    """
    return ESP32_CONFIG_ERROR_DESCRIPTIONS.get(code, f"Unknown config error: {code}")


def get_error_code_range(code: int) -> str:
    """
    Get the error code category/range name.
    
    Args:
        code: Error code integer
        
    Returns:
        Category name (e.g., "HARDWARE", "SERVER_CONFIG")
    """
    if 1000 <= code < 2000:
        return "HARDWARE"
    elif 2000 <= code < 3000:
        return "SERVICE"
    elif 3000 <= code < 4000:
        return "COMMUNICATION"
    elif 4000 <= code < 5000:
        return "APPLICATION"
    elif 5000 <= code < 5100:
        return "SERVER_CONFIG"
    elif 5100 <= code < 5200:
        return "SERVER_MQTT"
    elif 5200 <= code < 5300:
        return "SERVER_VALIDATION"
    elif 5300 <= code < 5400:
        return "SERVER_DATABASE"
    elif 5400 <= code < 5500:
        return "SERVER_SERVICE"
    elif 5500 <= code < 5600:
        return "SERVER_AUDIT"
    elif 5600 <= code < 5700:
        return "SERVER_SEQUENCE"
    return "UNKNOWN"


def get_error_code_source(code: int) -> str:
    """
    Get the source system for an error code.
    
    Args:
        code: Error code integer
        
    Returns:
        Source system ("esp32" or "server")
    """
    if 1000 <= code < 5000:
        return "esp32"
    elif 5000 <= code < 6000:
        return "server"
    return "unknown"


def get_all_error_codes() -> List[Dict]:
    """
    Get all error codes with descriptions for API/frontend use.
    
    Returns:
        List of dicts with code, description, range, source
    """
    all_codes = []
    
    # ESP32 errors
    for code, desc in ESP32_ERROR_DESCRIPTIONS.items():
        all_codes.append({
            "code": code,
            "description": desc,
            "range": get_error_code_range(code),
            "source": "esp32",
        })
    
    # Server errors
    for code, desc in SERVER_ERROR_DESCRIPTIONS.items():
        all_codes.append({
            "code": code,
            "description": desc,
            "range": get_error_code_range(code),
            "source": "server",
        })
    
    return sorted(all_codes, key=lambda x: x["code"])


def get_esp32_config_error_codes() -> List[Dict]:
    """
    Get all ESP32 config error codes (string-based).
    
    Returns:
        List of dicts with code and description
    """
    return [
        {"code": code, "description": desc}
        for code, desc in ESP32_CONFIG_ERROR_DESCRIPTIONS.items()
    ]

