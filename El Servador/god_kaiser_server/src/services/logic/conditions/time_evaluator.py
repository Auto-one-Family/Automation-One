"""
Time Condition Evaluator

Evaluates time window conditions.
"""

from datetime import datetime
from typing import Dict

from ....core.logging_config import get_logger
from .base import BaseConditionEvaluator

logger = get_logger(__name__)


class TimeConditionEvaluator(BaseConditionEvaluator):
    """
    Evaluates time window conditions.

    Supports:
    - Time windows (start_hour to end_hour)
    - Days of week filtering
    """

    def supports(self, condition_type: str) -> bool:
        """Check if this evaluator supports time conditions."""
        return condition_type in ("time_window", "time")

    async def evaluate(self, condition: Dict, context: Dict) -> bool:
        """
        Evaluate time window condition.

        Args:
            condition: Condition dictionary with:
                - type: "time_window" or "time"
                - start_hour: Start hour (0-23) or start_time (HH:MM format)
                - end_hour: End hour (0-23) or end_time (HH:MM format)
                - days_of_week: Optional list of days (0=Monday, 6=Sunday)
            context: Evaluation context with:
                - current_time: Optional datetime object (defaults to now)

        Returns:
            True if current time is within the time window, False otherwise
        """
        # Get current time from context or use now
        current_time = context.get("current_time")
        if current_time is None:
            current_time = datetime.now()
        elif isinstance(current_time, str):
            # Try to parse if string
            try:
                current_time = datetime.fromisoformat(current_time.replace("Z", "+00:00"))
            except ValueError:
                logger.warning(f"Could not parse current_time: {current_time}")
                current_time = datetime.now()

        # Check day of week if specified
        days_of_week = condition.get("days_of_week")
        if days_of_week is not None:
            if not isinstance(days_of_week, list):
                logger.warning("days_of_week must be a list")
                return False

            # Python weekday(): 0=Monday, 6=Sunday
            current_weekday = current_time.weekday()
            if current_weekday not in days_of_week:
                return False

        # Get time window
        # Support both hour-based (0-23) and time-based (HH:MM) formats
        start_hour = condition.get("start_hour")
        end_hour = condition.get("end_hour")
        start_minute = 0
        end_minute = 0
        start_time_str = condition.get("start_time")
        end_time_str = condition.get("end_time")

        # Convert HH:MM format to hour + minute
        if start_time_str:
            try:
                parts = start_time_str.split(":")
                start_hour = int(parts[0])
                start_minute = int(parts[1]) if len(parts) > 1 else 0
            except (ValueError, IndexError):
                logger.warning(f"Invalid start_time format: {start_time_str}")
                return False

        if end_time_str:
            try:
                parts = end_time_str.split(":")
                end_hour = int(parts[0])
                end_minute = int(parts[1]) if len(parts) > 1 else 0
            except (ValueError, IndexError):
                logger.warning(f"Invalid end_time format: {end_time_str}")
                return False

        # Default to full day if not specified
        if start_hour is None:
            start_hour = 0
        if end_hour is None:
            end_hour = 24

        # Validate hour ranges
        if not (0 <= start_hour <= 23):
            logger.warning(f"Invalid start_hour: {start_hour}. Must be 0-23")
            return False
        if not (0 <= end_hour <= 24):
            logger.warning(f"Invalid end_hour: {end_hour}. Must be 0-24")
            return False

        # Compare using total minutes for proper HH:MM granularity
        current_minutes = current_time.hour * 60 + current_time.minute
        start_minutes = start_hour * 60 + start_minute
        end_minutes = end_hour * 60 + end_minute

        # Handle wrapping (e.g., 22:00 to 06:00)
        if start_minutes <= end_minutes:
            # Normal case (e.g., 8:00 to 18:00)
            return start_minutes <= current_minutes < end_minutes
        else:
            # Wrapping case (e.g., 22:30 to 06:15)
            return current_minutes >= start_minutes or current_minutes < end_minutes
