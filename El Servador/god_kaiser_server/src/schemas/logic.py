"""
Logic Rules & Automation Pydantic Schemas

Phase: 5 (Week 9-10) - API Layer
Priority: 🟡 HIGH
Status: IMPLEMENTED

Provides:
- Logic rule CRUD models
- Rule testing/simulation models
- Execution history models

Cross-ESP Automation:
- Rules can trigger actions across different ESPs
- Conditions: sensor value comparisons, time constraints
- Actions: actuator commands, notifications

References:
- .claude/PI_SERVER_REFACTORING.md (Lines 164-172)
- db/models/logic.py (LogicRule model)
- services/logic_engine.py (Rule execution)
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .common import BaseResponse, IDMixin, PaginatedResponse, TimestampMixin


# =============================================================================
# Condition Types
# =============================================================================


class SensorCondition(BaseModel):
    """
    Sensor-based trigger condition.
    
    Example: IF ESP_12AB34CD.GPIO34 (pH) > 7.5
    """
    
    type: str = Field(
        "sensor",
        description="Condition type (always 'sensor' for this model)",
    )
    esp_id: str = Field(
        ...,
        pattern=r"^(ESP_[A-F0-9]{6,8}|MOCK_[A-Z0-9]+)$",
        description="ESP device ID",
    )
    gpio: int = Field(
        ...,
        ge=0,
        le=39,
        description="GPIO pin with sensor",
    )
    operator: str = Field(
        ...,
        pattern=r"^(>|<|>=|<=|==|!=)$",
        description="Comparison operator",
    )
    value: float = Field(
        ...,
        description="Threshold value",
    )
    sensor_type: Optional[str] = Field(
        None,
        description="Expected sensor type (for validation)",
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "type": "sensor",
                "esp_id": "ESP_12AB34CD",
                "gpio": 34,
                "operator": ">",
                "value": 7.5,
                "sensor_type": "ph"
            }
        }
    )


class TimeCondition(BaseModel):
    """
    Time-based condition.
    
    Example: Only between 08:00 and 18:00
    """
    
    type: str = Field(
        "time",
        description="Condition type (always 'time' for this model)",
    )
    start_time: str = Field(
        ...,
        pattern=r"^([01]\d|2[0-3]):([0-5]\d)$",
        description="Start time (HH:MM)",
        examples=["08:00", "18:30"],
    )
    end_time: str = Field(
        ...,
        pattern=r"^([01]\d|2[0-3]):([0-5]\d)$",
        description="End time (HH:MM)",
        examples=["18:00", "06:00"],
    )
    days_of_week: Optional[List[int]] = Field(
        None,
        description="Days of week (0=Monday, 6=Sunday), None=all days",
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "type": "time",
                "start_time": "08:00",
                "end_time": "18:00",
                "days_of_week": [0, 1, 2, 3, 4]
            }
        }
    )


class CooldownCondition(BaseModel):
    """
    Cooldown condition to prevent rapid triggering.
    """
    
    type: str = Field(
        "cooldown",
        description="Condition type",
    )
    min_interval_seconds: int = Field(
        ...,
        ge=1,
        le=86400,
        description="Minimum seconds between triggers",
    )


# =============================================================================
# Action Types
# =============================================================================


class ActuatorAction(BaseModel):
    """
    Actuator control action.
    
    Example: THEN ESP_AABBCCDD.GPIO5 (pump) = ON
    """
    
    type: str = Field(
        "actuator",
        description="Action type (always 'actuator' for this model)",
    )
    esp_id: str = Field(
        ...,
        pattern=r"^(ESP_[A-F0-9]{6,8}|MOCK_[A-Z0-9]+)$",
        description="Target ESP device ID",
    )
    gpio: int = Field(
        ...,
        ge=0,
        le=39,
        description="GPIO pin with actuator",
    )
    command: str = Field(
        ...,
        pattern=r"^(ON|OFF|PWM|TOGGLE)$",
        description="Actuator command",
    )
    value: float = Field(
        1.0,
        ge=0.0,
        le=1.0,
        description="Command value (0.0-1.0 for PWM)",
    )
    duration: int = Field(
        0,
        ge=0,
        le=86400,
        description="Duration in seconds (0=until explicitly stopped)",
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "type": "actuator",
                "esp_id": "ESP_AABBCCDD",
                "gpio": 5,
                "command": "ON",
                "value": 1.0,
                "duration": 300
            }
        }
    )


class NotificationAction(BaseModel):
    """
    Notification action (email, webhook, etc.).
    """
    
    type: str = Field(
        "notification",
        description="Action type",
    )
    channel: str = Field(
        ...,
        pattern=r"^(email|webhook|websocket)$",
        description="Notification channel",
    )
    target: str = Field(
        ...,
        description="Target (email address, webhook URL, etc.)",
    )
    message_template: str = Field(
        ...,
        max_length=1000,
        description="Message template (supports {sensor_value}, {esp_id}, etc.)",
    )


class DelayAction(BaseModel):
    """
    Delay action for sequencing.
    """
    
    type: str = Field(
        "delay",
        description="Action type",
    )
    seconds: int = Field(
        ...,
        ge=1,
        le=3600,
        description="Delay in seconds",
    )


# =============================================================================
# Logic Rule
# =============================================================================


class LogicRuleBase(BaseModel):
    """Base logic rule fields."""
    
    name: str = Field(
        ...,
        min_length=3,
        max_length=100,
        description="Rule name",
        examples=["pH Too High - Stop Dosing"],
    )
    description: Optional[str] = Field(
        None,
        max_length=500,
        description="Rule description",
    )


class LogicRuleCreate(LogicRuleBase):
    """
    Logic rule creation request.
    """
    
    conditions: List[Dict[str, Any]] = Field(
        ...,
        min_length=1,
        max_length=10,
        description="Trigger conditions (all must be true)",
    )
    actions: List[Dict[str, Any]] = Field(
        ...,
        min_length=1,
        max_length=10,
        description="Actions to execute when triggered",
    )
    logic_operator: str = Field(
        "AND",
        pattern=r"^(AND|OR)$",
        description="Logic operator for multiple conditions",
    )
    enabled: bool = Field(
        True,
        description="Whether rule is active",
    )
    priority: int = Field(
        50,
        ge=1,
        le=100,
        description="Rule priority (1=lowest, 100=highest)",
    )
    cooldown_seconds: int = Field(
        60,
        ge=0,
        le=86400,
        description="Minimum seconds between executions",
    )
    max_executions_per_hour: Optional[int] = Field(
        None,
        ge=1,
        le=60,
        description="Maximum executions per hour (None=unlimited)",
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "High pH Alert",
                "description": "Stop dosing pump when pH exceeds 7.5",
                "conditions": [
                    {
                        "type": "sensor",
                        "esp_id": "ESP_12AB34CD",
                        "gpio": 34,
                        "operator": ">",
                        "value": 7.5
                    },
                    {
                        "type": "time",
                        "start_time": "06:00",
                        "end_time": "22:00"
                    }
                ],
                "actions": [
                    {
                        "type": "actuator",
                        "esp_id": "ESP_AABBCCDD",
                        "gpio": 5,
                        "command": "OFF",
                        "value": 0.0
                    }
                ],
                "logic_operator": "AND",
                "enabled": True,
                "priority": 80,
                "cooldown_seconds": 300
            }
        }
    )


class LogicRuleUpdate(BaseModel):
    """
    Logic rule update request.
    
    All fields optional - only provided fields are updated.
    """
    
    name: Optional[str] = Field(None, min_length=3, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    conditions: Optional[List[Dict[str, Any]]] = Field(None, min_length=1, max_length=10)
    actions: Optional[List[Dict[str, Any]]] = Field(None, min_length=1, max_length=10)
    logic_operator: Optional[str] = Field(None, pattern=r"^(AND|OR)$")
    enabled: Optional[bool] = Field(None)
    priority: Optional[int] = Field(None, ge=1, le=100)
    cooldown_seconds: Optional[int] = Field(None, ge=0, le=86400)
    max_executions_per_hour: Optional[int] = Field(None, ge=1, le=60)


class LogicRuleResponse(LogicRuleBase, TimestampMixin):
    """
    Logic rule response.
    """
    
    id: Any = Field(..., description="Rule ID (UUID)")
    conditions: List[Dict[str, Any]] = Field(
        ...,
        description="Trigger conditions",
    )
    actions: List[Dict[str, Any]] = Field(
        ...,
        description="Actions to execute",
    )
    logic_operator: str = Field(
        ...,
        description="Logic operator (AND/OR)",
    )
    enabled: bool = Field(
        ...,
        description="Whether rule is active",
    )
    priority: int = Field(
        ...,
        description="Rule priority",
    )
    cooldown_seconds: int = Field(
        ...,
        description="Cooldown between executions",
    )
    max_executions_per_hour: Optional[int] = Field(None)
    # Runtime info
    last_triggered: Optional[datetime] = Field(
        None,
        description="Last trigger timestamp",
    )
    execution_count: int = Field(
        0,
        description="Total execution count",
        ge=0,
    )
    last_execution_success: Optional[bool] = Field(
        None,
        description="Whether last execution succeeded",
    )
    
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "id": 1,
                "name": "High pH Alert",
                "description": "Stop dosing pump when pH exceeds 7.5",
                "conditions": [{"type": "sensor", "esp_id": "ESP_12AB34CD", "gpio": 34, "operator": ">", "value": 7.5}],
                "actions": [{"type": "actuator", "esp_id": "ESP_AABBCCDD", "gpio": 5, "command": "OFF"}],
                "logic_operator": "AND",
                "enabled": True,
                "priority": 80,
                "cooldown_seconds": 300,
                "last_triggered": "2025-01-01T12:00:00Z",
                "execution_count": 15,
                "last_execution_success": True,
                "created_at": "2025-01-01T00:00:00Z",
                "updated_at": "2025-01-01T12:00:00Z"
            }
        }
    )


# =============================================================================
# Rule Toggle
# =============================================================================


class RuleToggleRequest(BaseModel):
    """
    Rule enable/disable request.
    """
    
    enabled: bool = Field(
        ...,
        description="New enabled state",
    )
    reason: Optional[str] = Field(
        None,
        max_length=200,
        description="Reason for toggle (for audit log)",
    )


class RuleToggleResponse(BaseResponse):
    """
    Rule toggle response.
    """
    
    rule_id: Any = Field(..., description="Rule ID (UUID)")
    rule_name: str = Field(..., description="Rule name")
    enabled: bool = Field(..., description="New enabled state")
    previous_state: bool = Field(..., description="Previous enabled state")


# =============================================================================
# Rule Testing
# =============================================================================


class RuleTestRequest(BaseModel):
    """
    Rule test/simulation request.
    
    Simulates rule execution without actually triggering actions.
    """
    
    mock_sensor_values: Optional[Dict[str, float]] = Field(
        None,
        description="Mock sensor values for testing (key: 'ESP_ID:GPIO')",
        examples=[{"ESP_12AB34CD:34": 7.8}],
    )
    mock_time: Optional[str] = Field(
        None,
        pattern=r"^([01]\d|2[0-3]):([0-5]\d)$",
        description="Mock time (HH:MM) for time-based conditions",
    )
    dry_run: bool = Field(
        True,
        description="If False, actually execute actions (use with caution)",
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "mock_sensor_values": {
                    "ESP_12AB34CD:34": 7.8
                },
                "mock_time": "14:30",
                "dry_run": True
            }
        }
    )


class ConditionResult(BaseModel):
    """
    Individual condition evaluation result.
    """
    
    condition_index: int = Field(..., description="Condition index in array")
    condition_type: str = Field(..., description="Condition type")
    result: bool = Field(..., description="Evaluation result")
    details: str = Field(..., description="Human-readable evaluation details")
    actual_value: Optional[float] = Field(None, description="Actual sensor value (if applicable)")


class ActionResult(BaseModel):
    """
    Individual action execution result.
    """
    
    action_index: int = Field(..., description="Action index in array")
    action_type: str = Field(..., description="Action type")
    would_execute: bool = Field(..., description="Whether action would execute")
    details: str = Field(..., description="Action details")
    dry_run: bool = Field(..., description="Whether this was dry run")


class RuleTestResponse(BaseResponse):
    """
    Rule test response.
    """
    
    rule_id: Any = Field(..., description="Rule ID (UUID)")
    rule_name: str = Field(..., description="Rule name")
    would_trigger: bool = Field(..., description="Whether rule would trigger")
    condition_results: List[ConditionResult] = Field(
        default_factory=list,
        description="Individual condition results",
    )
    action_results: List[ActionResult] = Field(
        default_factory=list,
        description="Individual action results (if would_trigger)",
    )
    dry_run: bool = Field(..., description="Whether this was a dry run")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "rule_id": 1,
                "rule_name": "High pH Alert",
                "would_trigger": True,
                "condition_results": [
                    {
                        "condition_index": 0,
                        "condition_type": "sensor",
                        "result": True,
                        "details": "ESP_12AB34CD:34 (7.8) > 7.5",
                        "actual_value": 7.8
                    }
                ],
                "action_results": [
                    {
                        "action_index": 0,
                        "action_type": "actuator",
                        "would_execute": True,
                        "details": "ESP_AABBCCDD:5 OFF",
                        "dry_run": True
                    }
                ],
                "dry_run": True
            }
        }
    )


# =============================================================================
# Execution History
# =============================================================================


class ExecutionHistoryEntry(BaseModel):
    """
    Rule execution history entry.
    """
    
    id: Any = Field(..., description="Entry ID (UUID)")
    rule_id: Any = Field(..., description="Rule ID (UUID)")
    rule_name: str = Field(..., description="Rule name at execution time")
    triggered_at: datetime = Field(..., description="Trigger timestamp")
    trigger_reason: str = Field(..., description="Condition that triggered")
    actions_executed: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Actions that were executed",
    )
    success: bool = Field(..., description="Overall execution success")
    error_message: Optional[str] = Field(None, description="Error if failed")
    execution_time_ms: float = Field(..., description="Execution time (ms)")
    
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "id": 100,
                "rule_id": 1,
                "rule_name": "High pH Alert",
                "triggered_at": "2025-01-01T12:00:00Z",
                "trigger_reason": "ESP_12AB34CD:34 (7.8) > 7.5",
                "actions_executed": [
                    {"type": "actuator", "esp_id": "ESP_AABBCCDD", "gpio": 5, "command": "OFF"}
                ],
                "success": True,
                "error_message": None,
                "execution_time_ms": 45.2
            }
        }
    )


class ExecutionHistoryQuery(BaseModel):
    """
    Execution history query parameters.
    """
    
    rule_id: Optional[Any] = Field(None, description="Filter by rule ID (UUID)")
    success: Optional[bool] = Field(None, description="Filter by success status")
    start_time: Optional[datetime] = Field(None, description="Start of time range")
    end_time: Optional[datetime] = Field(None, description="End of time range")


class ExecutionHistoryResponse(BaseResponse):
    """
    Execution history response.
    """
    
    entries: List[ExecutionHistoryEntry] = Field(
        default_factory=list,
        description="History entries",
    )
    total_count: int = Field(..., description="Total entries matching filter", ge=0)
    success_rate: Optional[float] = Field(
        None,
        description="Success rate (0.0-1.0)",
        ge=0.0,
        le=1.0,
    )


# =============================================================================
# Paginated Responses
# =============================================================================


class LogicRuleListResponse(PaginatedResponse[LogicRuleResponse]):
    """
    Paginated list of logic rules.
    """
    pass


class ExecutionHistoryPaginatedResponse(PaginatedResponse[ExecutionHistoryEntry]):
    """
    Paginated execution history.
    """
    pass
