"""
Custom Exception Hierarchie für God-Kaiser Server
"""

from typing import Any, Dict, Optional


class GodKaiserException(Exception):
    """
    Base exception for all God-Kaiser Server errors.
    
    Paket X: Code Consolidation & Industrial Quality
    Alle Exceptions erben von dieser Basis-Klasse.
    """

    status_code: int = 500
    error_code: str = "INTERNAL_ERROR"

    def __init__(
        self,
        message: str,
        error_code: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Initialize exception.

        Args:
            message: Error message
            error_code: Optional error code for categorization
            details: Optional additional details dict
        """
        self.message = message
        self.error_code = error_code or self.error_code
        self.details = details or {}
        super().__init__(self.message)

    def to_dict(self) -> Dict[str, Any]:
        """Convert exception to dictionary for API responses"""
        return {
            "error": self.__class__.__name__,
            "message": self.message,
            "error_code": self.error_code,
            "details": self.details,
        }


# Database Exceptions
class DatabaseException(GodKaiserException):
    """Base exception for database errors"""

    pass


class RecordNotFoundException(DatabaseException):
    """Raised when a database record is not found"""

    def __init__(self, model: str, identifier: Any) -> None:
        super().__init__(
            message=f"{model} with identifier {identifier} not found",
            error_code="RECORD_NOT_FOUND",
            details={"model": model, "identifier": str(identifier)},
        )


class DuplicateRecordException(DatabaseException):
    """Raised when attempting to create a duplicate record"""

    def __init__(self, model: str, field: str, value: Any) -> None:
        super().__init__(
            message=f"{model} with {field}={value} already exists",
            error_code="DUPLICATE_RECORD",
            details={"model": model, "field": field, "value": str(value)},
        )


class DatabaseConnectionException(DatabaseException):
    """Raised when database connection fails"""

    def __init__(self, details: Optional[str] = None) -> None:
        super().__init__(
            message="Database connection failed",
            error_code="DB_CONNECTION_FAILED",
            details={"details": details} if details else {},
        )


# MQTT Exceptions
class MQTTException(GodKaiserException):
    """Base exception for MQTT errors"""

    pass


class MQTTConnectionException(MQTTException):
    """Raised when MQTT connection fails"""

    def __init__(self, broker_host: str, broker_port: int, details: Optional[str] = None) -> None:
        super().__init__(
            message=f"Failed to connect to MQTT broker at {broker_host}:{broker_port}",
            error_code="MQTT_CONNECTION_FAILED",
            details={"broker_host": broker_host, "broker_port": broker_port, "details": details},
        )


class MQTTPublishException(MQTTException):
    """Raised when MQTT publish fails"""

    def __init__(self, topic: str, details: Optional[str] = None) -> None:
        super().__init__(
            message=f"Failed to publish to topic: {topic}",
            error_code="MQTT_PUBLISH_FAILED",
            details={"topic": topic, "details": details},
        )


class MQTTSubscribeException(MQTTException):
    """Raised when MQTT subscribe fails"""

    def __init__(self, topic: str, details: Optional[str] = None) -> None:
        super().__init__(
            message=f"Failed to subscribe to topic: {topic}",
            error_code="MQTT_SUBSCRIBE_FAILED",
            details={"topic": topic, "details": details},
        )


# Authentication & Authorization Exceptions
class AuthenticationException(GodKaiserException):
    """Base exception for authentication errors"""

    pass


class InvalidCredentialsException(AuthenticationException):
    """Raised when credentials are invalid"""

    def __init__(self) -> None:
        super().__init__(
            message="Invalid username or password",
            error_code="INVALID_CREDENTIALS",
        )


class TokenExpiredException(AuthenticationException):
    """Raised when JWT token is expired"""

    def __init__(self) -> None:
        super().__init__(
            message="Access token has expired",
            error_code="TOKEN_EXPIRED",
        )


class InvalidTokenException(AuthenticationException):
    """Raised when JWT token is invalid"""

    def __init__(self, details: Optional[str] = None) -> None:
        super().__init__(
            message="Invalid or malformed token",
            error_code="INVALID_TOKEN",
            details={"details": details} if details else {},
        )


class InsufficientPermissionsException(GodKaiserException):
    """Raised when user lacks required permissions"""

    def __init__(self, required_permission: str) -> None:
        super().__init__(
            message=f"Insufficient permissions. Required: {required_permission}",
            error_code="INSUFFICIENT_PERMISSIONS",
            details={"required_permission": required_permission},
        )


# Generic Resource Exceptions (must be defined early for inheritance)
class NotFoundError(GodKaiserException):
    """Raised when a resource is not found"""

    status_code = 404
    error_code = "NOT_FOUND"

    def __init__(self, resource_type: str, identifier: Any) -> None:
        super().__init__(
            message=f"{resource_type} with identifier {identifier} not found",
            error_code="NOT_FOUND",
            details={"resource_type": resource_type, "identifier": str(identifier)},
        )


# ESP32 Device Exceptions
class ESP32Exception(GodKaiserException):
    """Base exception for ESP32 device errors"""

    pass


class ESP32NotFoundException(ESP32Exception, NotFoundError):
    """Raised when ESP32 device is not found"""

    status_code = 404
    error_code = "ESP_NOT_FOUND"

    def __init__(self, esp_id: str) -> None:
        super().__init__(
            message=f"ESP32 device {esp_id} not found",
            error_code="ESP_NOT_FOUND",
            details={"esp_id": esp_id},
        )
        NotFoundError.__init__(self, "ESP32", esp_id)


class ESPNotFoundError(NotFoundError):
    """Alias for ESP32NotFoundException - Paket X compatibility"""

    error_code = "ESP_NOT_FOUND"

    def __init__(self, esp_id: str) -> None:
        super().__init__("ESP32", esp_id)
        self.details["esp_id"] = esp_id


class ESP32OfflineException(ESP32Exception):
    """Raised when ESP32 device is offline"""

    def __init__(self, esp_id: str) -> None:
        super().__init__(
            message=f"ESP32 device {esp_id} is offline",
            error_code="ESP32_OFFLINE",
            details={"esp_id": esp_id},
        )


class ESP32CommandFailedException(ESP32Exception):
    """Raised when ESP32 command fails"""

    def __init__(self, esp_id: str, command: str, details: Optional[str] = None) -> None:
        super().__init__(
            message=f"Command '{command}' failed for ESP32 {esp_id}",
            error_code="ESP32_COMMAND_FAILED",
            details={"esp_id": esp_id, "command": command, "details": details},
        )


# Sensor & Actuator Exceptions
class SensorException(GodKaiserException):
    """Base exception for sensor errors"""

    pass


class SensorNotFoundException(SensorException, NotFoundError):
    """Raised when sensor is not found"""

    status_code = 404
    error_code = "SENSOR_NOT_FOUND"

    def __init__(self, esp_id: str, gpio: int) -> None:
        super().__init__(
            message=f"Sensor not found: ESP {esp_id}, GPIO {gpio}",
            error_code="SENSOR_NOT_FOUND",
            details={"esp_id": esp_id, "gpio": gpio},
        )
        NotFoundError.__init__(self, "Sensor", f"{esp_id}:{gpio}")


class SensorNotFoundError(NotFoundError):
    """Alias for SensorNotFoundException - Paket X compatibility"""

    error_code = "SENSOR_NOT_FOUND"

    def __init__(self, esp_id: str, gpio: int) -> None:
        super().__init__("Sensor", f"{esp_id}:{gpio}")
        self.details["esp_id"] = esp_id
        self.details["gpio"] = gpio


class SensorProcessingException(SensorException):
    """Raised when sensor processing fails"""

    def __init__(self, esp_id: str, gpio: int, details: Optional[str] = None) -> None:
        super().__init__(
            message=f"Sensor processing failed: ESP {esp_id}, GPIO {gpio}",
            error_code="SENSOR_PROCESSING_FAILED",
            details={"esp_id": esp_id, "gpio": gpio, "details": details},
        )


class ActuatorException(GodKaiserException):
    """Base exception for actuator errors"""

    pass


class ActuatorNotFoundException(ActuatorException, NotFoundError):
    """Raised when actuator is not found"""

    status_code = 404
    error_code = "ACTUATOR_NOT_FOUND"

    def __init__(self, esp_id: str, gpio: int) -> None:
        super().__init__(
            message=f"Actuator not found: ESP {esp_id}, GPIO {gpio}",
            error_code="ACTUATOR_NOT_FOUND",
            details={"esp_id": esp_id, "gpio": gpio},
        )
        NotFoundError.__init__(self, "Actuator", f"{esp_id}:{gpio}")


class ActuatorNotFoundError(NotFoundError):
    """Alias for ActuatorNotFoundException - Paket X compatibility"""

    error_code = "ACTUATOR_NOT_FOUND"

    def __init__(self, esp_id: str, gpio: int) -> None:
        super().__init__("Actuator", f"{esp_id}:{gpio}")
        self.details["esp_id"] = esp_id
        self.details["gpio"] = gpio


class ActuatorCommandFailedException(ActuatorException):
    """Raised when actuator command fails"""

    def __init__(self, esp_id: str, gpio: int, command: str, details: Optional[str] = None) -> None:
        super().__init__(
            message=f"Actuator command '{command}' failed: ESP {esp_id}, GPIO {gpio}",
            error_code="ACTUATOR_COMMAND_FAILED",
            details={"esp_id": esp_id, "gpio": gpio, "command": command, "details": details},
        )


class SafetyConstraintViolationException(ActuatorException):
    """Raised when safety constraint is violated"""

    def __init__(self, esp_id: str, gpio: int, constraint: str) -> None:
        super().__init__(
            message=f"Safety constraint violated: {constraint}",
            error_code="SAFETY_CONSTRAINT_VIOLATION",
            details={"esp_id": esp_id, "gpio": gpio, "constraint": constraint},
        )


# Validation Exceptions
class ValidationException(GodKaiserException):
    """Raised when input validation fails"""

    status_code = 400
    error_code = "VALIDATION_ERROR"

    def __init__(self, field: str, message: str) -> None:
        super().__init__(
            message=f"Validation failed for field '{field}': {message}",
            error_code="VALIDATION_ERROR",
            details={"field": field, "validation_message": message},
        )


class DuplicateError(GodKaiserException):
    """Raised when attempting to create a duplicate resource"""

    status_code = 409
    error_code = "DUPLICATE"

    def __init__(self, resource_type: str, field: str, value: Any) -> None:
        super().__init__(
            message=f"{resource_type} with {field}={value} already exists",
            error_code="DUPLICATE",
            details={"resource_type": resource_type, "field": field, "value": str(value)},
        )


class AuthenticationError(GodKaiserException):
    """Raised when authentication fails"""

    status_code = 401
    error_code = "AUTHENTICATION_FAILED"

    def __init__(self, message: str = "Authentication failed") -> None:
        super().__init__(
            message=message,
            error_code="AUTHENTICATION_FAILED",
        )


class AuthorizationError(GodKaiserException):
    """Raised when authorization fails"""

    status_code = 403
    error_code = "FORBIDDEN"

    def __init__(self, message: str = "Forbidden") -> None:
        super().__init__(
            message=message,
            error_code="FORBIDDEN",
        )


class ServiceUnavailableError(GodKaiserException):
    """Raised when a service is unavailable"""

    status_code = 503
    error_code = "SERVICE_UNAVAILABLE"

    def __init__(self, service_name: str, details: Optional[str] = None) -> None:
        super().__init__(
            message=f"Service {service_name} is unavailable",
            error_code="SERVICE_UNAVAILABLE",
            details={"service_name": service_name, "details": details} if details else {"service_name": service_name},
        )


# Configuration Exceptions
class ConfigurationException(GodKaiserException):
    """Raised when configuration is invalid"""

    def __init__(self, config_key: str, message: str) -> None:
        super().__init__(
            message=f"Invalid configuration for '{config_key}': {message}",
            error_code="CONFIGURATION_ERROR",
            details={"config_key": config_key, "config_message": message},
        )


# External Service Exceptions
class ExternalServiceException(GodKaiserException):
    """Base exception for external service errors"""

    pass


class GodLayerException(ExternalServiceException):
    """Raised when God Layer (AI) service fails"""

    def __init__(self, details: Optional[str] = None) -> None:
        super().__init__(
            message="God Layer service unavailable or failed",
            error_code="GOD_LAYER_FAILED",
            details={"details": details} if details else {},
        )


class KaiserCommunicationException(ExternalServiceException):
    """Raised when Kaiser-to-Kaiser communication fails"""

    def __init__(self, kaiser_id: str, details: Optional[str] = None) -> None:
        super().__init__(
            message=f"Communication with Kaiser {kaiser_id} failed",
            error_code="KAISER_COMMUNICATION_FAILED",
            details={"kaiser_id": kaiser_id, "details": details},
        )


# Simulation Exceptions (Paket X)
class SimulationException(GodKaiserException):
    """Base exception for simulation errors"""

    status_code = 500
    error_code = "SIMULATION_ERROR"


class SimulationNotRunningError(SimulationException, ValidationException):
    """Raised when simulation is not running"""

    status_code = 400
    error_code = "SIMULATION_NOT_RUNNING"

    def __init__(self, esp_id: str) -> None:
        super().__init__(
            field="simulation_state",
            message=f"Simulation for ESP {esp_id} is not running",
        )
        self.details["esp_id"] = esp_id


class EmergencyStopActiveError(SimulationException, ValidationException):
    """Raised when emergency stop is active"""

    status_code = 400
    error_code = "EMERGENCY_STOP_ACTIVE"

    def __init__(self, esp_id: str) -> None:
        super().__init__(
            field="emergency_stop",
            message=f"Emergency stop is active for ESP {esp_id}",
        )
        self.details["esp_id"] = esp_id


# Duplicate ESP Error (Paket X compatibility)
class DuplicateESPError(DuplicateError):
    """Raised when attempting to create a duplicate ESP"""

    error_code = "DUPLICATE_ESP"

    def __init__(self, esp_id: str) -> None:
        super().__init__("ESP32", "device_id", esp_id)
        self.details["esp_id"] = esp_id
