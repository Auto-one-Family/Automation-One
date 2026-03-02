"""
Sensor Condition Evaluator

Evaluates sensor threshold conditions.
Supports cross-sensor evaluation by looking up latest values
from context["sensor_values"] for non-trigger sensors.
"""

from typing import Dict

from ....core.logging_config import get_logger
from .base import BaseConditionEvaluator

logger = get_logger(__name__)


class SensorConditionEvaluator(BaseConditionEvaluator):
    """
    Evaluates sensor threshold conditions.

    Supports:
    - Comparison operators: >, <, >=, <=, ==, !=, between
    - Cross-ESP sensor references (via context["sensor_values"])
    """

    def supports(self, condition_type: str) -> bool:
        """Check if this evaluator supports sensor conditions."""
        return condition_type in ("sensor_threshold", "sensor")

    async def evaluate(self, condition: Dict, context: Dict) -> bool:
        """
        Evaluate sensor threshold condition.

        Args:
            condition: Condition dictionary with:
                - type: "sensor_threshold" or "sensor"
                - esp_id: ESP device ID
                - gpio: GPIO pin number
                - operator: Comparison operator (>, <, >=, <=, ==, !=, between)
                - value: Threshold value (or min/max for "between")
                - sensor_type: Optional sensor type filter
            context: Evaluation context with:
                - sensor_data: Current trigger sensor value dict
                - sensor_values: Dict of pre-loaded sensor values for cross-sensor evaluation
                  Key format: "ESP_ID:GPIO", value: {"value": float, "sensor_type": str}

        Returns:
            True if condition is met, False otherwise
        """
        # Get trigger sensor data from context
        sensor_data = context.get("sensor_data", {})

        # Check if this condition matches the trigger sensor
        trigger_matches = self._matches_trigger(condition, sensor_data)

        if trigger_matches:
            # Use trigger data directly
            actual_value = sensor_data.get("value")
        else:
            # Cross-sensor: look up from pre-loaded sensor_values
            actual_value = self._get_cross_sensor_value(condition, context)
            if actual_value is None:
                logger.debug(
                    f"No cross-sensor data for "
                    f"{condition.get('esp_id')}:{condition.get('gpio')} "
                    f"({condition.get('sensor_type')})"
                )
                return False

        # Optional sensor type filter for trigger data only
        # (cross-sensor values are already type-matched by key)
        if trigger_matches and condition.get("sensor_type"):
            cond_type = (condition.get("sensor_type") or "").lower()
            data_type = (sensor_data.get("sensor_type") or "").lower()
            if cond_type != data_type:
                return False

        return self._compare(condition, actual_value)

    def _matches_trigger(self, condition: Dict, sensor_data: Dict) -> bool:
        """Check if condition references the same sensor as the trigger."""
        if condition.get("esp_id") != sensor_data.get("esp_id"):
            return False
        try:
            if int(condition.get("gpio", -1)) != int(sensor_data.get("gpio", -2)):
                return False
        except (ValueError, TypeError):
            return False
        return True

    def _get_cross_sensor_value(self, condition: Dict, context: Dict) -> float | None:
        """Look up latest sensor value from pre-loaded cross-sensor data.

        Multi-value sensor support: For sensors like SHT31 that provide multiple
        values on the same GPIO, sensor_type is included in the lookup key.
        """
        sensor_values = context.get("sensor_values", {})
        cond_sensor_type = condition.get("sensor_type")

        # Try sensor_type-specific key first (multi-value sensors like SHT31)
        if cond_sensor_type:
            typed_key = f"{condition.get('esp_id')}:{condition.get('gpio')}:{cond_sensor_type}"
            cross_data = sensor_values.get(typed_key)
            if cross_data is not None:
                return cross_data.get("value")

        # Fallback: untyped key (single-value sensors)
        sensor_key = f"{condition.get('esp_id')}:{condition.get('gpio')}"
        cross_data = sensor_values.get(sensor_key)
        if cross_data is not None:
            # Verify sensor_type matches if condition specifies one
            if cond_sensor_type:
                data_type = (cross_data.get("sensor_type") or "").lower()
                if data_type and data_type != cond_sensor_type.lower():
                    logger.debug(
                        f"Cross-sensor type mismatch: condition wants {cond_sensor_type}, "
                        f"got {data_type} for {sensor_key}"
                    )
                    return None
            return cross_data.get("value")
        return None

    def _compare(self, condition: Dict, actual_value) -> bool:
        """Compare actual value against threshold using the condition's operator."""
        operator = condition.get("operator")
        threshold = condition.get("value")

        if actual_value is None:
            logger.warning(
                f"Sensor data missing value for "
                f"{condition.get('esp_id')}:{condition.get('gpio')}"
            )
            return False

        if threshold is None and operator != "between":
            logger.warning(
                f"Condition missing threshold value for "
                f"{condition.get('esp_id')}:{condition.get('gpio')}"
            )
            return False

        try:
            actual = float(actual_value)
            if threshold is not None:
                threshold = float(threshold)
        except (ValueError, TypeError) as e:
            logger.error(f"Invalid numeric values for sensor condition: {e}")
            return False

        if operator == ">":
            return actual > threshold
        elif operator == ">=":
            return actual >= threshold
        elif operator == "<":
            return actual < threshold
        elif operator == "<=":
            return actual <= threshold
        elif operator == "==":
            return actual == threshold
        elif operator == "!=":
            return actual != threshold
        elif operator == "between":
            min_val = condition.get("min")
            max_val = condition.get("max")
            if min_val is None or max_val is None:
                logger.warning("'between' operator requires 'min' and 'max' fields")
                return False
            try:
                min_val = float(min_val)
                max_val = float(max_val)
                if min_val > max_val:
                    logger.warning(
                        f"'between' operator: min ({min_val}) > max ({max_val}), swapping"
                    )
                    min_val, max_val = max_val, min_val
                return min_val <= actual <= max_val
            except (ValueError, TypeError) as e:
                logger.error(f"Invalid numeric values for 'between' operator: {e}")
                return False
        else:
            logger.warning(f"Unknown operator: {operator}")
            return False
