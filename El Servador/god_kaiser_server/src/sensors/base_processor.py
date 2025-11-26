"""
Base Sensor Processor - Abstract Base Class for Pi-Enhanced Sensor Libraries

Defines the interface for all sensor processing libraries.
Each sensor type (pH, temperature, etc.) implements this ABC.

Usage:
    class PHSensorProcessor(BaseSensorProcessor):
        def process(self, raw_value, calibration, params):
            # Convert ADC value to pH
            ...
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass
class ProcessingResult:
    """
    Result of sensor data processing.

    Attributes:
        value: Processed sensor value (e.g., 7.2 for pH, 23.5 for temperature)
        unit: Measurement unit (e.g., "pH", "°C", "ppm")
        quality: Data quality indicator ("good", "fair", "poor", "error")
        metadata: Optional additional information (calibration used, warnings, etc.)
    """

    value: float
    unit: str
    quality: str
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class ValidationResult:
    """
    Result of sensor data validation.

    Attributes:
        valid: Whether the raw value is within acceptable range
        error: Error message if validation failed
        warnings: Optional warnings (e.g., "value near threshold")
    """

    valid: bool
    error: Optional[str] = None
    warnings: Optional[list[str]] = None


class BaseSensorProcessor(ABC):
    """
    Abstract Base Class for all sensor processors.

    Subclasses must implement:
    - process(): Convert raw value to physical measurement
    - validate(): Check if raw value is within acceptable range
    - get_sensor_type(): Return sensor type identifier

    Optionally override:
    - calibrate(): Perform calibration (if sensor supports it)
    - get_default_params(): Return default processing parameters
    """

    @abstractmethod
    def process(
        self,
        raw_value: float,
        calibration: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> ProcessingResult:
        """
        Process raw sensor value into physical measurement.

        Args:
            raw_value: Raw ADC/digital value from ESP32
            calibration: Calibration data (sensor-specific format)
            params: Processing parameters (sensor-specific)

        Returns:
            ProcessingResult with processed value, unit, quality

        Example:
            # pH sensor (ADC → pH)
            result = processor.process(
                raw_value=2150,
                calibration={"offset": 0.5, "slope": 3.5},
                params={"temperature_compensation": 25.0}
            )
            # result.value = 7.2, result.unit = "pH", result.quality = "good"
        """
        pass

    @abstractmethod
    def validate(self, raw_value: float) -> ValidationResult:
        """
        Validate raw sensor value.

        Checks if value is within acceptable range for the sensor.

        Args:
            raw_value: Raw ADC/digital value from ESP32

        Returns:
            ValidationResult indicating validity and any errors/warnings

        Example:
            # pH sensor (ADC range: 0-4095 for ESP32)
            result = processor.validate(2150)
            # result.valid = True

            result = processor.validate(-100)
            # result.valid = False, result.error = "Value out of range"
        """
        pass

    @abstractmethod
    def get_sensor_type(self) -> str:
        """
        Get sensor type identifier.

        Returns:
            Sensor type string (e.g., "ph", "temperature", "humidity")

        This is used by LibraryLoader to match sensor configs to processors.
        """
        pass

    def calibrate(
        self,
        calibration_points: list[Dict[str, float]],
        method: str = "linear",
    ) -> Dict[str, Any]:
        """
        Perform sensor calibration (optional).

        Override this method if sensor supports calibration.

        Args:
            calibration_points: List of calibration points
                [{"raw": 2150, "reference": 7.0}, {"raw": 1800, "reference": 4.0}, ...]
            method: Calibration method ("linear", "polynomial", etc.)

        Returns:
            Calibration data dict to store in SensorConfig.calibration_data

        Example:
            # Two-point pH calibration
            calibration = processor.calibrate(
                calibration_points=[
                    {"raw": 2150, "reference": 7.0},  # pH 7 buffer
                    {"raw": 1800, "reference": 4.0},  # pH 4 buffer
                ],
                method="linear"
            )
            # Returns: {"offset": 0.5, "slope": 3.5}
        """
        raise NotImplementedError(
            f"{self.__class__.__name__} does not support calibration"
        )

    def get_default_params(self) -> Dict[str, Any]:
        """
        Get default processing parameters.

        Override this method to provide default params for process().

        Returns:
            Default parameters dict

        Example:
            # Temperature sensor
            return {"temperature_unit": "celsius", "decimal_places": 1}
        """
        return {}

    def get_value_range(self) -> Dict[str, float]:
        """
        Get expected value range for the sensor.

        Override this method to provide expected physical value range.

        Returns:
            {"min": float, "max": float}

        Example:
            # pH sensor: pH 0-14
            return {"min": 0.0, "max": 14.0}

            # Temperature sensor: -40°C to 125°C
            return {"min": -40.0, "max": 125.0}
        """
        return {"min": float("-inf"), "max": float("inf")}

    def get_raw_value_range(self) -> Dict[str, float]:
        """
        Get expected raw value range (ADC/digital).

        Override this method to provide expected raw value range.

        Returns:
            {"min": float, "max": float}

        Example:
            # ESP32 12-bit ADC: 0-4095
            return {"min": 0.0, "max": 4095.0}

            # ESP32 10-bit ADC: 0-1023
            return {"min": 0.0, "max": 1023.0}
        """
        return {"min": float("-inf"), "max": float("inf")}
