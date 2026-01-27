"""
Pydantic Models for Logic Rule Validation

Provides type-safe validation for:
- Trigger Conditions (sensor_threshold, time_window)
- Actions (actuator_command)

Prevents runtime errors from malformed JSON in production.
"""

from typing import Any, List, Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator


# =============================================================================
# CONDITION MODELS
# =============================================================================


class SensorThresholdCondition(BaseModel):
    """
    Sensor Threshold Condition.

    Triggers when sensor value meets threshold criteria.

    Example:
        {
            "type": "sensor_threshold",  # or "sensor" for shorthand
            "esp_id": "ESP_12AB34",
            "gpio": 34,
            "sensor_type": "temperature",
            "operator": ">",
            "value": 25.0
        }
    """

    type: Literal["sensor_threshold", "sensor"] = Field(
        ..., description="Condition type ('sensor_threshold' or 'sensor')"
    )
    esp_id: str = Field(
        ...,
        description="ESP device ID",
        pattern=r"^(ESP_[A-F0-9]{6,8}|MOCK_[A-Z0-9]+)$",
    )
    gpio: int = Field(..., description="GPIO pin number", ge=0, le=50)
    sensor_type: Optional[str] = Field(
        None, description="Sensor type (e.g., 'temperature'). Optional for 'sensor' shorthand."
    )
    operator: Literal[">", ">=", "<", "<=", "==", "!=", "between"] = Field(
        ..., description="Comparison operator"
    )
    value: float = Field(..., description="Threshold value")

    # Optional fields for "between" operator
    min: Optional[float] = Field(None, description="Minimum value for 'between' operator")
    max: Optional[float] = Field(None, description="Maximum value for 'between' operator")

    @field_validator("min", "max")
    @classmethod
    def validate_between_operator(cls, v, info):
        """Validate min/max for 'between' operator."""
        if info.data.get("operator") == "between":
            if v is None:
                raise ValueError("'between' operator requires 'min' and 'max' values")
        return v


class TimeWindowCondition(BaseModel):
    """
    Time Window Condition.

    Triggers only during specific time windows (hours, days of week).

    Example:
        {
            "type": "time_window",
            "start_hour": 8,
            "end_hour": 18,
            "days_of_week": [0, 1, 2, 3, 4]  # Monday-Friday
        }
    """

    type: Literal["time_window"] = Field(
        ..., description="Condition type (must be 'time_window')"
    )
    start_hour: int = Field(..., description="Start hour (0-23)", ge=0, le=23)
    end_hour: int = Field(..., description="End hour (0-24)", ge=0, le=24)
    days_of_week: Optional[List[int]] = Field(
        None,
        description="Days of week (0=Monday, 6=Sunday). If None, applies to all days.",
    )

    @field_validator("days_of_week")
    @classmethod
    def validate_days_of_week(cls, v):
        """Validate days_of_week are in range 0-6."""
        if v is not None:
            for day in v:
                if day < 0 or day > 6:
                    raise ValueError(f"Invalid day of week: {day}. Must be 0-6 (Monday-Sunday)")
        return v


class CompoundCondition(BaseModel):
    """
    Compound Condition (AND/OR logic).

    Combines multiple conditions with AND/OR logic.

    Example:
        {
            "logic": "AND",
            "conditions": [
                {"type": "sensor_threshold", ...},
                {"type": "time_window", ...}
            ]
        }
    """

    logic: Literal["AND", "OR"] = Field(..., description="Logic operator (AND/OR)")
    conditions: List[Any] = Field(..., description="List of conditions", min_length=1)


# Union type for all condition types
ConditionType = Union[SensorThresholdCondition, TimeWindowCondition, CompoundCondition]


# =============================================================================
# ACTION MODELS
# =============================================================================


class ActuatorCommandAction(BaseModel):
    """
    Actuator Command Action.

    Executes actuator command when rule triggers.

    Example:
        {
            "type": "actuator_command",  # or "actuator" for shorthand
            "esp_id": "ESP_12AB34",
            "gpio": 18,
            "command": "PWM",
            "value": 0.75,
            "duration_seconds": 60
        }
    """

    type: Literal["actuator_command", "actuator"] = Field(
        ..., description="Action type ('actuator_command' or 'actuator')"
    )
    esp_id: str = Field(
        ...,
        description="ESP device ID",
        pattern=r"^(ESP_[A-F0-9]{6,8}|MOCK_[A-Z0-9]+)$",
    )
    gpio: int = Field(..., description="GPIO pin number", ge=0, le=50)
    command: Optional[Literal["ON", "OFF", "PWM", "TOGGLE"]] = Field(
        None, description="Actuator command. Optional for 'actuator' shorthand."
    )
    actuator_type: Optional[str] = Field(
        None, description="Actuator type (e.g., 'pump'). Used with 'actuator' shorthand."
    )
    value: float = Field(..., description="Command value (0.0-1.0)", ge=0.0, le=1.0)
    duration_seconds: int = Field(
        0, description="Duration in seconds (0 = unlimited)", ge=0
    )


# Union type for all action types
ActionType = ActuatorCommandAction  # Extend with more action types later


# =============================================================================
# VALIDATION FUNCTIONS
# =============================================================================


def validate_condition(condition: dict) -> ConditionType:
    """
    Validate a single condition.

    Args:
        condition: Condition dictionary

    Returns:
        Validated Pydantic model

    Raises:
        ValidationError: If condition is invalid
    """
    cond_type = condition.get("type")

    # Accept both "sensor_threshold" and "sensor" as valid condition types
    if cond_type in ("sensor_threshold", "sensor"):
        return SensorThresholdCondition(**condition)
    elif cond_type == "time_window":
        return TimeWindowCondition(**condition)
    elif "logic" in condition and "conditions" in condition:
        # Compound condition - recursively validate sub-conditions
        validated_sub_conditions = [
            validate_condition(sub_cond) for sub_cond in condition["conditions"]
        ]
        return CompoundCondition(
            logic=condition["logic"],
            conditions=validated_sub_conditions
        )
    else:
        raise ValueError(f"Unknown condition type: {cond_type}")


def validate_conditions(conditions: Union[dict, list]) -> Union[ConditionType, List[ConditionType]]:
    """
    Validate trigger_conditions (single dict or list).

    Args:
        conditions: Conditions (dict or list of dicts)

    Returns:
        Validated Pydantic model(s)

    Raises:
        ValidationError: If conditions are invalid
    """
    if isinstance(conditions, dict):
        return validate_condition(conditions)
    elif isinstance(conditions, list):
        return [validate_condition(cond) for cond in conditions]
    else:
        raise ValueError(f"Invalid conditions format: {type(conditions)}")


def validate_action(action: dict) -> ActionType:
    """
    Validate a single action.

    Args:
        action: Action dictionary

    Returns:
        Validated Pydantic model

    Raises:
        ValidationError: If action is invalid
    """
    action_type = action.get("type")

    # Accept both "actuator_command" and "actuator" as valid action types
    if action_type in ("actuator_command", "actuator"):
        return ActuatorCommandAction(**action)
    else:
        raise ValueError(f"Unknown action type: {action_type}")


def validate_actions(actions: list) -> List[ActionType]:
    """
    Validate list of actions.

    Args:
        actions: List of action dictionaries

    Returns:
        List of validated Pydantic models

    Raises:
        ValidationError: If any action is invalid
    """
    if not isinstance(actions, list):
        raise ValueError(f"Actions must be a list, got: {type(actions)}")

    if len(actions) == 0:
        raise ValueError("Actions list cannot be empty")

    return [validate_action(action) for action in actions]
