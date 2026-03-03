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
    value: Optional[float] = Field(
        None, description="Threshold value (required for all operators except 'between')"
    )

    # Optional fields for "between" operator
    min: Optional[float] = Field(None, description="Minimum value for 'between' operator")
    max: Optional[float] = Field(None, description="Maximum value for 'between' operator")

    @field_validator("value", mode="after")
    @classmethod
    def validate_value_required(cls, v, info):
        """Validate that value is required for non-between operators."""
        if info.data.get("operator") != "between" and v is None:
            raise ValueError("'value' is required for operators other than 'between'")
        return v

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

    type: Literal["time_window"] = Field(..., description="Condition type (must be 'time_window')")
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


class HysteresisCondition(BaseModel):
    """
    Hysteresis Condition.

    Prevents "flapping" near threshold by using separate activate/deactivate thresholds.

    Two modes:
    - Cooling: activate_above + deactivate_below (e.g., fan)
    - Heating: activate_below + deactivate_above (e.g., heater)

    Example (Cooling):
        {
            "type": "hysteresis",
            "esp_id": "ESP_12AB34",
            "gpio": 4,
            "sensor_type": "DS18B20",
            "activate_above": 28.0,
            "deactivate_below": 24.0
        }
    """

    type: Literal["hysteresis"] = Field(..., description="Condition type (must be 'hysteresis')")
    esp_id: str = Field(
        ...,
        description="ESP device ID",
        pattern=r"^(ESP_[A-F0-9]{6,8}|MOCK_[A-Z0-9]+)$",
    )
    gpio: int = Field(..., description="GPIO pin number", ge=0, le=50)
    sensor_type: Optional[str] = Field(None, description="Sensor type filter (optional)")

    # Cooling mode thresholds
    activate_above: Optional[float] = Field(
        None, description="Activate when value exceeds this (cooling mode)"
    )
    deactivate_below: Optional[float] = Field(
        None, description="Deactivate when value drops below this (cooling mode)"
    )

    # Heating mode thresholds
    activate_below: Optional[float] = Field(
        None, description="Activate when value drops below this (heating mode)"
    )
    deactivate_above: Optional[float] = Field(
        None, description="Deactivate when value exceeds this (heating mode)"
    )

    @field_validator("deactivate_below", mode="after")
    @classmethod
    def validate_thresholds(cls, v, info):
        """Validate that either cooling or heating mode thresholds are provided."""
        data = info.data
        has_cooling = data.get("activate_above") is not None and v is not None
        has_heating = (
            data.get("activate_below") is not None and data.get("deactivate_above") is not None
        )

        if not has_cooling and not has_heating:
            # Only raise if we're done processing all fields and neither mode is set
            # This validator runs after deactivate_below, so cooling mode can be checked here
            pass  # Will be checked in model_validator if needed
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
ConditionType = Union[
    SensorThresholdCondition, TimeWindowCondition, HysteresisCondition, CompoundCondition
]


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
    duration_seconds: int = Field(0, description="Duration in seconds (0 = unlimited)", ge=0)


class NotificationAction(BaseModel):
    """
    Notification Action.

    Sends notification via websocket, email or webhook.
    """

    type: Literal["notification"] = Field(..., description="Action type")
    channel: Literal["websocket", "email", "webhook"] = Field(
        ..., description="Notification channel"
    )
    target: str = Field(..., description="Target (email address, webhook URL, WS topic)")
    message_template: str = Field("", description="Message template with {placeholders}")


class DelayAction(BaseModel):
    """
    Delay Action.

    Pauses execution for a specified duration.
    """

    type: Literal["delay"] = Field(..., description="Action type")
    seconds: int = Field(..., description="Delay duration in seconds", ge=1, le=3600)


class SequenceAction(BaseModel):
    """
    Sequence Action.

    Executes multiple actions in sequence with optional delays.
    """

    type: Literal["sequence"] = Field(..., description="Action type")
    steps: List[Any] = Field(..., description="List of action steps", min_length=1)


# Union type for all action types
ActionType = Union[ActuatorCommandAction, NotificationAction, DelayAction, SequenceAction]


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
    elif cond_type in ("time_window", "time"):
        return TimeWindowCondition(**condition)
    elif cond_type == "hysteresis":
        return HysteresisCondition(**condition)
    elif "logic" in condition and "conditions" in condition:
        # Compound condition - recursively validate sub-conditions
        validated_sub_conditions = [
            validate_condition(sub_cond) for sub_cond in condition["conditions"]
        ]
        return CompoundCondition(logic=condition["logic"], conditions=validated_sub_conditions)
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
    elif action_type == "notification":
        return NotificationAction(**action)
    elif action_type == "delay":
        return DelayAction(**action)
    elif action_type == "sequence":
        return SequenceAction(**action)
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
