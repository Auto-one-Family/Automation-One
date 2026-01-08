"""
Temperature Sensor Library - Pi-Enhanced Processing

Processes raw temperature values from multiple sensor types into standardized measurements.

Supported Sensors:
- DS18B20 (OneWire Digital Temperature Sensor)
- SHT31 (I2C Temperature & Humidity Sensor)

Each processor converts raw values to calibrated temperature measurements with
unit conversion support (Celsius, Fahrenheit, Kelvin).
"""

from typing import Any, Dict, Optional

from ...base_processor import (
    BaseSensorProcessor,
    ProcessingResult,
    ValidationResult,
)


class DS18B20Processor(BaseSensorProcessor):
    """
    DS18B20 OneWire Temperature Sensor Processor.

    The DS18B20 is a digital temperature sensor that uses 1-Wire communication.
    ESP32-side processing (DallasTemperature library) already converts raw sensor
    data to Celsius, so this processor focuses on:
    - Validation of temperature range
    - Optional calibration offset
    - Unit conversion (°C, °F, K)
    - Quality assessment

    Sensor Specifications:
    - Temperature Range: -55°C to +125°C
    - Resolution: 0.0625°C (12-bit mode)
    - Communication: 1-Wire (OneWire protocol)
    - Accuracy: ±0.5°C (-10°C to +85°C)
    - Hardware: Requires 4.7kΩ pull-up resistor

    ESP32 Setup:
    - Library: DallasTemperature + OneWire
    - GPIO: Any (e.g., GPIO17)
    - Multiple sensors on same bus: Supported (unique 64-bit ROM address)
    """

    # =========================================================================
    # OPERATING MODE RECOMMENDATIONS (Phase 2A)
    # =========================================================================
    # Temperature sensors are typically used for continuous monitoring.
    RECOMMENDED_MODE = "continuous"
    RECOMMENDED_TIMEOUT_SECONDS = 180  # 3 minutes timeout
    RECOMMENDED_INTERVAL_SECONDS = 30  # Read every 30 seconds
    SUPPORTS_ON_DEMAND = False

    # DS18B20 Specifications
    TEMP_MIN = -55.0  # °C (datasheet minimum)
    TEMP_MAX = 125.0  # °C (datasheet maximum)
    TEMP_TYPICAL_MIN = -10.0  # °C (typical operating range)
    TEMP_TYPICAL_MAX = 85.0  # °C (typical operating range)
    RESOLUTION = 0.0625  # °C (12-bit mode)

    def get_sensor_type(self) -> str:
        """Return sensor type identifier."""
        return "ds18b20"

    def process(
        self,
        raw_value: float,
        calibration: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> ProcessingResult:
        """
        Process DS18B20 temperature reading.

        Args:
            raw_value: Temperature in °C (already processed by ESP32 DallasTemperature library)
            calibration: Optional calibration data
                - "offset": float - Temperature offset correction (°C)
            params: Optional processing parameters
                - "unit": str - Output unit ("celsius", "fahrenheit", "kelvin")
                - "decimal_places": int - Decimal places for rounding (default: 2)

        Returns:
            ProcessingResult with temperature value, unit, quality assessment

        Example:
            # Basic usage
            result = processor.process(raw_value=23.5)
            # result.value = 23.5, result.unit = "°C", result.quality = "good"

            # With calibration offset
            result = processor.process(
                raw_value=23.5,
                calibration={"offset": 0.5}
            )
            # result.value = 24.0

            # Fahrenheit conversion
            result = processor.process(
                raw_value=0.0,
                params={"unit": "fahrenheit"}
            )
            # result.value = 32.0, result.unit = "°F"
        """
        # Step 1: Validate raw value
        validation = self.validate(raw_value)
        if not validation.valid:
            return ProcessingResult(
                value=0.0,
                unit="°C",
                quality="error",
                metadata={"error": validation.error},
            )

        # Step 2: Apply calibration offset (if provided)
        temp_celsius = raw_value
        calibrated = False
        if calibration and "offset" in calibration:
            temp_celsius += calibration["offset"]
            calibrated = True

        # Step 3: Unit conversion
        unit_type = "celsius"
        if params and "unit" in params:
            unit_type = params["unit"].lower()

        if unit_type == "fahrenheit":
            value = temp_celsius * 9 / 5 + 32
            unit_str = "°F"
        elif unit_type == "kelvin":
            value = temp_celsius + 273.15
            unit_str = "K"
        else:
            value = temp_celsius
            unit_str = "°C"

        # Step 4: Round to decimal places
        decimal_places = 2  # Default
        if params and "decimal_places" in params:
            decimal_places = params["decimal_places"]
        value = round(value, decimal_places)

        # Step 5: Quality assessment
        quality = self._assess_quality(temp_celsius, calibrated)

        # Step 6: Return result
        return ProcessingResult(
            value=value,
            unit=unit_str,
            quality=quality,
            metadata={
                "raw_celsius": raw_value,
                "calibrated": calibrated,
                "warnings": validation.warnings,
            },
        )

    def validate(self, raw_value: float) -> ValidationResult:
        """
        Validate DS18B20 temperature reading.

        Checks if temperature is within sensor's physical range (-55°C to +125°C).
        Provides warnings if temperature is outside typical operating range.

        Args:
            raw_value: Temperature in °C

        Returns:
            ValidationResult with validity status and optional warnings
        """
        # Check absolute limits (sensor physically cannot measure outside this)
        if raw_value < self.TEMP_MIN or raw_value > self.TEMP_MAX:
            return ValidationResult(
                valid=False,
                error=f"Temperature {raw_value}°C out of sensor range "
                f"({self.TEMP_MIN}°C to {self.TEMP_MAX}°C)",
            )

        # Warnings for extreme values (sensor works but accuracy may be reduced)
        warnings = []
        if raw_value < self.TEMP_TYPICAL_MIN:
            warnings.append(
                f"Temperature {raw_value}°C below typical range "
                f"(accuracy may be reduced below {self.TEMP_TYPICAL_MIN}°C)"
            )
        elif raw_value > self.TEMP_TYPICAL_MAX:
            warnings.append(
                f"Temperature {raw_value}°C above typical range "
                f"(accuracy may be reduced above {self.TEMP_TYPICAL_MAX}°C)"
            )

        return ValidationResult(valid=True, warnings=warnings if warnings else None)

    def calibrate(
        self,
        calibration_points: list[Dict[str, float]],
        method: str = "offset",
    ) -> Dict[str, Any]:
        """
        Perform DS18B20 temperature calibration.

        DS18B20 is factory-calibrated and typically very accurate. However,
        a simple offset calibration can be performed if needed.

        Args:
            calibration_points: List of calibration points
                [{"raw": 23.5, "reference": 24.0}]  # Measured vs. reference
            method: Calibration method ("offset" - only supported method)

        Returns:
            Calibration data dict: {"offset": float}

        Raises:
            ValueError: If method is not "offset" or insufficient points

        Example:
            # Single-point offset calibration
            calibration = processor.calibrate(
                calibration_points=[{"raw": 23.5, "reference": 24.0}],
                method="offset"
            )
            # Returns: {"offset": 0.5}
        """
        if len(calibration_points) < 1:
            raise ValueError("DS18B20 calibration requires at least 1 point")

        if method != "offset":
            raise ValueError(
                f"Calibration method '{method}' not supported for DS18B20. "
                "Only 'offset' method is supported."
            )

        # Calculate average offset from all calibration points
        total_offset = 0.0
        for point in calibration_points:
            raw = point["raw"]
            reference = point["reference"]
            offset = reference - raw
            total_offset += offset

        average_offset = total_offset / len(calibration_points)

        return {
            "offset": average_offset,
            "method": "offset",
            "points": len(calibration_points),
        }

    def get_default_params(self) -> Dict[str, Any]:
        """Get default processing parameters for DS18B20."""
        return {
            "unit": "celsius",
            "decimal_places": 2,
        }

    def get_value_range(self) -> Dict[str, float]:
        """Get expected temperature value range (Celsius)."""
        return {"min": self.TEMP_MIN, "max": self.TEMP_MAX}

    def get_raw_value_range(self) -> Dict[str, float]:
        """
        Get expected raw value range.

        For DS18B20, raw value is already in Celsius (processed by ESP32),
        so range is same as value range.
        """
        return {"min": self.TEMP_MIN, "max": self.TEMP_MAX}

    def _assess_quality(self, temp_celsius: float, calibrated: bool) -> str:
        """
        Assess temperature data quality.

        Quality levels:
        - "good": Within typical operating range, optionally calibrated
        - "fair": Outside typical range but within absolute limits
        - "poor": Extreme values (near sensor limits)
        - "error": Outside sensor physical range (should not happen if validated)

        Args:
            temp_celsius: Temperature in Celsius
            calibrated: Whether calibration was applied

        Returns:
            Quality string: "good", "fair", "poor", or "error"
        """
        # Error: Outside physical range (should be caught by validate)
        if temp_celsius < self.TEMP_MIN or temp_celsius > self.TEMP_MAX:
            return "error"

        # Good: Within typical operating range
        if self.TEMP_TYPICAL_MIN <= temp_celsius <= self.TEMP_TYPICAL_MAX:
            return "good"

        # Fair: Outside typical range but within absolute limits
        if self.TEMP_MIN <= temp_celsius <= self.TEMP_MAX:
            return "fair"

        # Poor: Extreme values (should not reach here)
        return "poor"


class SHT31TemperatureProcessor(BaseSensorProcessor):
    """
    SHT31 I2C Temperature Sensor Processor.

    The SHT31 is a digital temperature and humidity sensor using I2C communication.
    ESP32-side processing (Adafruit_SHT31 library) already converts raw sensor
    data to Celsius, so this processor focuses on:
    - Validation of temperature range
    - Optional calibration offset
    - Unit conversion (°C, °F)
    - Quality assessment

    Sensor Specifications:
    - Temperature Range: -40°C to +125°C
    - Resolution: 0.01°C (typical)
    - Communication: I2C (Address: 0x44 or 0x45)
    - Accuracy: ±0.2°C (0°C to +65°C)
    - Humidity Sensor: Same chip (see SHT31HumidityProcessor)

    ESP32 Setup:
    - Library: Adafruit_SHT31
    - I2C: GPIO21 (SDA), GPIO22 (SCL)
    - Address: 0x44 (default) or 0x45 (if ADR pin connected to VIN)
    - Multiple sensors: Use different I2C addresses
    """

    # =========================================================================
    # OPERATING MODE RECOMMENDATIONS (Phase 2A)
    # =========================================================================
    # Temperature sensors are typically used for continuous monitoring.
    RECOMMENDED_MODE = "continuous"
    RECOMMENDED_TIMEOUT_SECONDS = 180  # 3 minutes timeout
    RECOMMENDED_INTERVAL_SECONDS = 30  # Read every 30 seconds
    SUPPORTS_ON_DEMAND = False

    # SHT31 Specifications
    TEMP_MIN = -40.0  # °C (datasheet minimum)
    TEMP_MAX = 125.0  # °C (datasheet maximum)
    TEMP_TYPICAL_MIN = 0.0  # °C (typical accuracy range)
    TEMP_TYPICAL_MAX = 65.0  # °C (typical accuracy range)
    RESOLUTION = 0.01  # °C (typical)

    def get_sensor_type(self) -> str:
        """Return sensor type identifier."""
        return "sht31_temp"

    def process(
        self,
        raw_value: float,
        calibration: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> ProcessingResult:
        """
        Process SHT31 temperature reading.

        Args:
            raw_value: Temperature in °C (from Adafruit_SHT31 library)
            calibration: Optional calibration data
                - "offset": float - Temperature offset correction (°C)
            params: Optional processing parameters
                - "unit": str - Output unit ("celsius" or "fahrenheit")
                - "decimal_places": int - Decimal places for rounding (default: 1)

        Returns:
            ProcessingResult with temperature value, unit, quality assessment

        Example:
            # Basic usage
            result = processor.process(raw_value=23.5)
            # result.value = 23.5, result.unit = "°C", result.quality = "good"

            # With calibration offset
            result = processor.process(
                raw_value=23.5,
                calibration={"offset": -0.3}
            )
            # result.value = 23.2

            # Fahrenheit conversion
            result = processor.process(
                raw_value=20.0,
                params={"unit": "fahrenheit"}
            )
            # result.value = 68.0, result.unit = "°F"
        """
        # Step 1: Validate raw value
        validation = self.validate(raw_value)
        if not validation.valid:
            return ProcessingResult(
                value=0.0,
                unit="°C",
                quality="error",
                metadata={"error": validation.error},
            )

        # Step 2: Apply calibration offset (if provided)
        temp_celsius = raw_value
        calibrated = False
        if calibration and "offset" in calibration:
            temp_celsius += calibration["offset"]
            calibrated = True

        # Step 3: Unit conversion
        unit_type = "celsius"
        if params and "unit" in params:
            unit_type = params["unit"].lower()

        if unit_type == "fahrenheit":
            value = temp_celsius * 9 / 5 + 32
            unit_str = "°F"
        else:
            value = temp_celsius
            unit_str = "°C"

        # Step 4: Round to decimal places
        decimal_places = 1  # Default (SHT31 has 0.01°C resolution)
        if params and "decimal_places" in params:
            decimal_places = params["decimal_places"]
        value = round(value, decimal_places)

        # Step 5: Quality assessment
        quality = self._assess_quality(temp_celsius, calibrated)

        # Step 6: Return result
        return ProcessingResult(
            value=value,
            unit=unit_str,
            quality=quality,
            metadata={
                "raw_celsius": raw_value,
                "calibrated": calibrated,
                "warnings": validation.warnings,
            },
        )

    def validate(self, raw_value: float) -> ValidationResult:
        """
        Validate SHT31 temperature reading.

        Checks if temperature is within sensor's physical range (-40°C to +125°C).
        Provides warnings if temperature is outside typical accuracy range.

        Args:
            raw_value: Temperature in °C

        Returns:
            ValidationResult with validity status and optional warnings
        """
        # Check absolute limits
        if raw_value < self.TEMP_MIN or raw_value > self.TEMP_MAX:
            return ValidationResult(
                valid=False,
                error=f"Temperature {raw_value}°C out of sensor range "
                f"({self.TEMP_MIN}°C to {self.TEMP_MAX}°C)",
            )

        # Warnings for values outside typical accuracy range
        warnings = []
        if raw_value < self.TEMP_TYPICAL_MIN or raw_value > self.TEMP_TYPICAL_MAX:
            warnings.append(
                f"Temperature {raw_value}°C outside typical accuracy range "
                f"({self.TEMP_TYPICAL_MIN}°C to {self.TEMP_TYPICAL_MAX}°C). "
                "Accuracy may be reduced to ±0.5°C."
            )

        return ValidationResult(valid=True, warnings=warnings if warnings else None)

    def calibrate(
        self,
        calibration_points: list[Dict[str, float]],
        method: str = "offset",
    ) -> Dict[str, Any]:
        """
        Perform SHT31 temperature calibration.

        SHT31 is factory-calibrated with high accuracy. Optional offset
        calibration can be performed for fine-tuning.

        Args:
            calibration_points: List of calibration points
                [{"raw": 23.5, "reference": 24.0}]
            method: Calibration method ("offset" - only supported method)

        Returns:
            Calibration data dict: {"offset": float}

        Raises:
            ValueError: If method is not "offset" or insufficient points
        """
        if len(calibration_points) < 1:
            raise ValueError("SHT31 calibration requires at least 1 point")

        if method != "offset":
            raise ValueError(
                f"Calibration method '{method}' not supported for SHT31. "
                "Only 'offset' method is supported."
            )

        # Calculate average offset
        total_offset = 0.0
        for point in calibration_points:
            raw = point["raw"]
            reference = point["reference"]
            offset = reference - raw
            total_offset += offset

        average_offset = total_offset / len(calibration_points)

        return {
            "offset": average_offset,
            "method": "offset",
            "points": len(calibration_points),
        }

    def get_default_params(self) -> Dict[str, Any]:
        """Get default processing parameters for SHT31."""
        return {
            "unit": "celsius",
            "decimal_places": 1,
        }

    def get_value_range(self) -> Dict[str, float]:
        """Get expected temperature value range (Celsius)."""
        return {"min": self.TEMP_MIN, "max": self.TEMP_MAX}

    def get_raw_value_range(self) -> Dict[str, float]:
        """Get expected raw value range (same as value range)."""
        return {"min": self.TEMP_MIN, "max": self.TEMP_MAX}

    def _assess_quality(self, temp_celsius: float, calibrated: bool) -> str:
        """
        Assess temperature data quality.

        Quality levels:
        - "good": Within typical accuracy range (0-65°C)
        - "fair": Outside typical range but within absolute limits
        - "error": Outside sensor physical range

        Args:
            temp_celsius: Temperature in Celsius
            calibrated: Whether calibration was applied

        Returns:
            Quality string: "good", "fair", or "error"
        """
        # Error: Outside physical range
        if temp_celsius < self.TEMP_MIN or temp_celsius > self.TEMP_MAX:
            return "error"

        # Good: Within typical accuracy range
        if self.TEMP_TYPICAL_MIN <= temp_celsius <= self.TEMP_TYPICAL_MAX:
            return "good"

        # Fair: Outside typical range but within absolute limits
        return "fair"
