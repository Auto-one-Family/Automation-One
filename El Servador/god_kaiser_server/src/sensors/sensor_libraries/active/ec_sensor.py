"""
EC (Electrical Conductivity) Sensor Library

Processes raw ADC values from analog EC sensors into calibrated electrical conductivity
measurements with temperature compensation and unit conversion.

EC Sensor Specifications:
- Measurement Range: 0-20000 µS/cm (0-20 mS/cm)
- ADC Range: 0-4095 (ESP32 12-bit ADC) or 0-32767 (ADS1115 16-bit)
- Voltage Range: 0-3.3V (ESP32) or 0-5V (ADS1115)
- Resolution: ~4.88 µS/cm per ADC step (12-bit ESP32)
- Temperature Dependency: ~2% per °C deviation from 25°C

Calibration:
- Two-point calibration using KCl buffer solutions
- Low point: 1413 µS/cm (0.01 M KCl at 25°C)
- High point: 12880 µS/cm (0.1 M KCl at 25°C)
- Linear conversion: EC = slope * voltage + offset

Temperature Compensation:
- Reference temperature: 25°C
- Formula: EC_25C = EC_raw / (1 + 0.02 * (T - 25))
- Coefficient: 2% per °C

Important Notes:
- ⚠️ ESP32 ADC1 PINS ONLY (GPIO32-39) - ADC2 conflicts with WiFi!
- ESP32 ADC accuracy: ±10% (consider using external ADS1115 for precision)
- Temperature compensation is critical for accuracy
- Calibration must be performed at known temperature (ideally 25°C)
"""

from typing import Any, Dict, Optional

from ...base_processor import (
    BaseSensorProcessor,
    ProcessingResult,
    ValidationResult,
)


class ECSensorProcessor(BaseSensorProcessor):
    """
    Electrical Conductivity (EC) Sensor Processor.

    Converts raw ADC values to calibrated EC measurements using
    two-point linear calibration with temperature compensation.

    Features:
    - Two-point calibration (1413 µS/cm and 12880 µS/cm buffers)
    - Temperature compensation (~2% per °C)
    - Unit conversion (µS/cm, mS/cm, ppm)
    - Quality assessment based on value range and calibration status
    - Support for 12-bit (ESP32) and 16-bit (ADS1115) ADC

    ESP32 Setup:
    - Sensor: DFRobot Gravity EC Sensor (or compatible)
    - Connection: AOUT → GPIO32-39 (ADC1 pins only!)
    - Power: VCC → 3.3V or 5V, GND → GND
    - Hardware: 0.1µF capacitor between AOUT and GND (noise reduction)
    - Optional: ADS1115 16-bit ADC for better accuracy

    Important:
    - ⚠️ Use ADC1 pins ONLY (GPIO32-39) - ADC2 conflicts with WiFi!
    - Temperature compensation is CRITICAL for accurate readings
    - Calibrate at 25°C or apply temperature compensation
    - Different water types affect readings (freshwater vs seawater)
    """

    # ESP32 ADC configuration
    ADC_MAX_12BIT = 4095  # ESP32 12-bit ADC
    ADC_MAX_16BIT = 32767  # ADS1115 16-bit ADC
    ADC_VOLTAGE_RANGE_3V3 = 3.3  # ESP32
    ADC_VOLTAGE_RANGE_5V = 5.0  # ADS1115 (optional)

    # EC range
    EC_MIN = 0.0  # µS/cm
    EC_MAX = 20000.0  # µS/cm (20 mS/cm)
    EC_TYPICAL_MIN = 100.0  # µS/cm (typical minimum for water)
    EC_TYPICAL_MAX = 15000.0  # µS/cm (typical maximum for hydroponic/aquaculture)

    # Temperature compensation constants
    REFERENCE_TEMP = 25.0  # °C (calibration reference temperature)
    TEMP_COEFFICIENT = 0.02  # 2% per °C

    def get_sensor_type(self) -> str:
        """Return sensor type identifier."""
        return "ec"

    def process(
        self,
        raw_value: float,
        calibration: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> ProcessingResult:
        """
        Process raw ADC value into EC measurement.

        Args:
            raw_value: Raw ADC value (0-4095 for 12-bit or 0-32767 for 16-bit)
            calibration: Optional calibration data
                - "slope": float - Linear slope (EC per volt)
                - "offset": float - Linear offset (EC at 0V)
                - "adc_type": str - "12bit" or "16bit" (default: "12bit")
            params: Optional processing parameters
                - "unit": str - Output unit: "us_cm" (default), "ms_cm", "ppm"
                - "temperature_compensation": float - Temperature in °C for compensation
                - "decimal_places": int - Decimal places for rounding (default: 1)

        Returns:
            ProcessingResult with EC value, unit, quality assessment

        Example:
            # Basic usage without calibration
            result = processor.process(raw_value=1800)

            # With calibration
            calibration = {"slope": 5000, "offset": -2000}
            result = processor.process(raw_value=1800, calibration=calibration)

            # With temperature compensation (at 30°C)
            result = processor.process(
                raw_value=1800,
                calibration=calibration,
                params={"temperature_compensation": 30.0}
            )
            # EC compensated: EC_25C = EC_raw / (1 + 0.02 * (30 - 25))

            # With unit conversion (mS/cm)
            result = processor.process(
                raw_value=1800,
                calibration=calibration,
                params={"unit": "ms_cm"}
            )
        """
        # Step 1: Validate raw value
        validation = self.validate(raw_value)
        if not validation.valid:
            return ProcessingResult(
                value=0.0,
                unit="µS/cm",
                quality="error",
                metadata={"error": validation.error},
            )

        # Step 2: Determine ADC type and convert to voltage
        adc_type = "12bit"  # Default
        if calibration and "adc_type" in calibration:
            adc_type = calibration["adc_type"]

        voltage = self._adc_to_voltage(raw_value, adc_type)

        # Step 3: Apply calibration if available
        if calibration and "slope" in calibration and "offset" in calibration:
            slope = calibration["slope"]
            offset = calibration["offset"]
            ec_value = self._voltage_to_ec_calibrated(voltage, slope, offset)
            calibrated = True
        else:
            # No calibration - use default conversion
            ec_value = self._voltage_to_ec_default(voltage)
            calibrated = False

        # Step 4: Temperature compensation (optional)
        if params and "temperature_compensation" in params:
            temp = params["temperature_compensation"]
            ec_value = self._apply_temperature_compensation(ec_value, temp)

        # Step 5: Clamp to valid range
        ec_value = max(self.EC_MIN, min(self.EC_MAX, ec_value))

        # Step 6: Unit conversion (if requested)
        unit_type = "us_cm"  # Default
        if params and "unit" in params:
            unit_type = params["unit"].lower()

        ec_value, unit_str = self._convert_unit(ec_value, unit_type)

        # Step 7: Round to decimal places
        decimal_places = 1  # Default
        if params and "decimal_places" in params:
            decimal_places = params["decimal_places"]
        ec_value = round(ec_value, decimal_places)

        # Step 8: Assess quality
        quality = self._assess_quality(ec_value, calibrated, unit_type)

        # Step 9: Return result
        return ProcessingResult(
            value=ec_value,
            unit=unit_str,
            quality=quality,
            metadata={
                "voltage": voltage,
                "calibrated": calibrated,
                "raw_value": raw_value,
                "warnings": validation.warnings,
                "adc_type": adc_type,
            },
        )

    def validate(self, raw_value: float) -> ValidationResult:
        """
        Validate raw ADC value.

        Checks if value is within ADC range (0-4095 for 12-bit or 0-32767 for 16-bit).

        Args:
            raw_value: Raw ADC value

        Returns:
            ValidationResult with validation status
        """
        # Support both 12-bit and 16-bit ADC
        max_value = self.ADC_MAX_16BIT if raw_value > self.ADC_MAX_12BIT else self.ADC_MAX_12BIT

        if raw_value < 0 or raw_value > max_value:
            return ValidationResult(
                valid=False,
                error=f"ADC value {raw_value} out of range (0-{max_value})",
            )

        # Warning if value is near extremes
        warnings = []
        if raw_value < 100:
            warnings.append(
                "Very low ADC value (<100) - sensor may be disconnected or in pure water"
            )
        elif raw_value > (max_value - 100):
            warnings.append(
                f"Very high ADC value (>{max_value - 100}) - check sensor connection"
            )

        return ValidationResult(valid=True, warnings=warnings if warnings else None)

    def calibrate(
        self,
        calibration_points: list[Dict[str, float]],
        method: str = "linear",
    ) -> Dict[str, Any]:
        """
        Perform two-point EC calibration.

        Calibration procedure:
        1. Prepare buffer solutions (1413 µS/cm and 12880 µS/cm KCl)
        2. Ensure temperature is 25°C (or use temp compensation later)
        3. Measure ADC values in each buffer
        4. Calculate slope and offset: EC = slope * voltage + offset

        Args:
            calibration_points: [
                {"raw": 1500, "reference": 1413},   # Low: 1413 µS/cm (0.01 M KCl)
                {"raw": 3000, "reference": 12880},  # High: 12880 µS/cm (0.1 M KCl)
            ]
            method: "linear" (only linear supported for EC)

        Returns:
            Calibration data dict:
            {
                "slope": float,       # EC per volt
                "offset": float,      # EC at 0V
                "method": "linear",
                "points": int,
                "adc_type": "12bit" or "16bit"
            }

        Raises:
            ValueError: If less than 2 points or method not supported
        """
        if len(calibration_points) < 2:
            raise ValueError("EC calibration requires at least 2 points")

        if method != "linear":
            raise ValueError(f"Calibration method '{method}' not supported for EC")

        # Extract points
        point1 = calibration_points[0]
        point2 = calibration_points[1]

        raw1 = point1["raw"]
        ec1 = point1["reference"]

        raw2 = point2["raw"]
        ec2 = point2["reference"]

        # Determine ADC type based on raw values
        adc_type = "16bit" if (raw1 > self.ADC_MAX_12BIT or raw2 > self.ADC_MAX_12BIT) else "12bit"

        # Convert ADC to voltage
        voltage1 = self._adc_to_voltage(raw1, adc_type)
        voltage2 = self._adc_to_voltage(raw2, adc_type)

        # Calculate slope and offset
        # EC = slope * voltage + offset
        slope = (ec2 - ec1) / (voltage2 - voltage1)
        offset = ec1 - (slope * voltage1)

        return {
            "slope": slope,
            "offset": offset,
            "method": "linear",
            "points": len(calibration_points),
            "adc_type": adc_type,
        }

    def get_default_params(self) -> Dict[str, Any]:
        """Get default processing parameters."""
        return {
            "unit": "us_cm",  # µS/cm default
            "temperature_compensation": None,  # No temp compensation by default
            "decimal_places": 1,
        }

    def get_value_range(self) -> Dict[str, float]:
        """Get expected EC value range (0-20000 µS/cm)."""
        return {"min": self.EC_MIN, "max": self.EC_MAX}

    def get_raw_value_range(self) -> Dict[str, float]:
        """Get expected ADC range (0-4095 for 12-bit)."""
        return {"min": 0.0, "max": self.ADC_MAX_12BIT}

    # Private helper methods

    def _adc_to_voltage(self, adc_value: float, adc_type: str = "12bit") -> float:
        """
        Convert ADC value to voltage.

        Args:
            adc_value: Raw ADC value
            adc_type: "12bit" (ESP32, 0-3.3V) or "16bit" (ADS1115, 0-5V)

        Returns:
            Voltage in volts
        """
        if adc_type == "16bit":
            return (adc_value / self.ADC_MAX_16BIT) * self.ADC_VOLTAGE_RANGE_5V
        else:
            return (adc_value / self.ADC_MAX_12BIT) * self.ADC_VOLTAGE_RANGE_3V3

    def _voltage_to_ec_calibrated(
        self, voltage: float, slope: float, offset: float
    ) -> float:
        """
        Convert voltage to EC using calibration.

        Args:
            voltage: Voltage in volts
            slope: Calibration slope (EC per volt)
            offset: Calibration offset (EC at 0V)

        Returns:
            EC value in µS/cm
        """
        ec = slope * voltage + offset

        # Clamp to valid range
        ec = max(self.EC_MIN, min(self.EC_MAX, ec))

        return ec

    def _voltage_to_ec_default(self, voltage: float) -> float:
        """
        Convert voltage to EC using default conversion (no calibration).

        Default assumption: Linear mapping based on typical sensor behavior
        - 0V → 0 µS/cm
        - 3.3V → ~20000 µS/cm (ESP32)

        Args:
            voltage: Voltage in volts

        Returns:
            EC value in µS/cm
        """
        # Default linear mapping: ~6060 µS/cm per volt (for 3.3V → 20000 µS/cm)
        DEFAULT_SLOPE = 6060.0
        DEFAULT_OFFSET = 0.0

        ec = DEFAULT_SLOPE * voltage + DEFAULT_OFFSET

        # Clamp to valid range
        ec = max(self.EC_MIN, min(self.EC_MAX, ec))

        return ec

    def _apply_temperature_compensation(self, ec: float, temperature: float) -> float:
        """
        Apply temperature compensation to EC reading.

        EC sensors are temperature-sensitive (~2% per °C from reference temp).
        This compensates for temperature effects to get EC at 25°C.

        Formula: EC_25C = EC_raw / (1 + 0.02 * (T - 25))

        Args:
            ec: EC value at measured temperature (µS/cm)
            temperature: Temperature in °C

        Returns:
            Temperature-compensated EC value (EC at 25°C) in µS/cm
        """
        temp_difference = temperature - self.REFERENCE_TEMP
        temp_factor = 1 + self.TEMP_COEFFICIENT * temp_difference

        # Avoid division by zero (shouldn't happen in practice)
        if temp_factor == 0:
            return ec

        ec_compensated = ec / temp_factor

        # Clamp to valid range
        ec_compensated = max(self.EC_MIN, min(self.EC_MAX, ec_compensated))

        return ec_compensated

    def _convert_unit(self, ec_us_cm: float, unit_type: str) -> tuple[float, str]:
        """
        Convert EC from µS/cm to other units.

        Args:
            ec_us_cm: EC value in µS/cm
            unit_type: "us_cm" (µS/cm), "ms_cm" (mS/cm), "ppm" (TDS)

        Returns:
            Tuple of (converted_value, unit_string)
        """
        if unit_type == "ms_cm":
            # mS/cm = µS/cm / 1000
            return (ec_us_cm / 1000.0, "mS/cm")
        elif unit_type == "ppm":
            # TDS (ppm) ≈ EC (µS/cm) * 0.5 (approximation)
            return (ec_us_cm * 0.5, "ppm")
        else:
            # Default: µS/cm
            return (ec_us_cm, "µS/cm")

    def _assess_quality(self, ec_value: float, calibrated: bool, unit_type: str) -> str:
        """
        Assess data quality.

        Quality tiers:
        - "good": Typical range (100-15000 µS/cm), calibrated
        - "fair": Valid range but uncalibrated OR extreme values
        - "poor": Near sensor limits, uncalibrated

        Args:
            ec_value: EC value (in current unit)
            calibrated: Whether calibration was applied
            unit_type: Current unit type (for range conversion)

        Returns:
            Quality string: "good", "fair", "poor", "error"
        """
        # Convert to µS/cm for quality assessment
        if unit_type == "ms_cm":
            ec_us_cm = ec_value * 1000.0
        elif unit_type == "ppm":
            ec_us_cm = ec_value / 0.5
        else:
            ec_us_cm = ec_value

        # Error: Outside physical range (shouldn't happen due to clamping)
        if ec_us_cm < self.EC_MIN or ec_us_cm > self.EC_MAX:
            return "error"

        # Good: Within typical range and calibrated
        if calibrated and self.EC_TYPICAL_MIN <= ec_us_cm <= self.EC_TYPICAL_MAX:
            return "good"

        # Fair: Calibrated but at extremes, or not calibrated but reasonable
        if calibrated or (self.EC_TYPICAL_MIN <= ec_us_cm <= self.EC_TYPICAL_MAX):
            return "fair"

        # Poor: Not calibrated and at extremes
        return "poor"
