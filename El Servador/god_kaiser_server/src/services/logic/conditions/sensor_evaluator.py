"""
Sensor Condition Evaluator

Evaluates sensor threshold conditions.
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
    - Cross-ESP sensor references
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
                - sensor_data: Current sensor value dict with esp_id, gpio, value, sensor_type
                
        Returns:
            True if condition is met, False otherwise
        """
        # Get sensor data from context
        sensor_data = context.get("sensor_data", {})
        
        # Match ESP ID
        if condition.get("esp_id") != sensor_data.get("esp_id"):
            return False
        
        # Match GPIO
        if condition.get("gpio") != sensor_data.get("gpio"):
            return False
        
        # Optional sensor type filter
        if condition.get("sensor_type"):
            if condition.get("sensor_type") != sensor_data.get("sensor_type"):
                return False
        
        # Get values
        operator = condition.get("operator")
        threshold = condition.get("value")
        actual = sensor_data.get("value")
        
        if actual is None:
            logger.warning(
                f"Sensor data missing value for {sensor_data.get('esp_id')}:{sensor_data.get('gpio')}"
            )
            return False
        
        try:
            actual = float(actual)
            threshold = float(threshold)
        except (ValueError, TypeError) as e:
            logger.error(f"Invalid numeric values for sensor condition: {e}")
            return False
        
        # Evaluate based on operator
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
                return min_val <= actual <= max_val
            except (ValueError, TypeError) as e:
                logger.error(f"Invalid numeric values for 'between' operator: {e}")
                return False
        else:
            logger.warning(f"Unknown operator: {operator}")
            return False
















