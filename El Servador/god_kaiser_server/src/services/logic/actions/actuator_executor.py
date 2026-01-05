"""
Actuator Action Executor

Executes actuator command actions.
"""

from typing import Dict, Optional

from ....core.logging_config import get_logger
from ...actuator_service import ActuatorService
from .base import ActionResult, BaseActionExecutor

logger = get_logger(__name__)


class ActuatorActionExecutor(BaseActionExecutor):
    """
    Executes actuator command actions.
    
    Supports:
    - ON, OFF, PWM, TOGGLE commands
    - Duration-based commands
    - Cross-ESP actuator control
    """

    def __init__(self, actuator_service: ActuatorService):
        """
        Initialize actuator executor.
        
        Args:
            actuator_service: ActuatorService instance for sending commands
        """
        self.actuator_service = actuator_service

    def supports(self, action_type: str) -> bool:
        """Check if this executor supports actuator actions."""
        return action_type in ("actuator_command", "actuator")

    async def execute(self, action: Dict, context: Dict) -> ActionResult:
        """
        Execute actuator command action.
        
        Args:
            action: Action dictionary with:
                - type: "actuator_command" or "actuator"
                - esp_id: ESP device ID
                - gpio: GPIO pin number
                - command: Command type (ON, OFF, PWM, TOGGLE)
                - value: Command value (0.0-1.0 for PWM)
                - duration_seconds: Optional duration in seconds (0 = unlimited)
                - duration: Alternative field name for duration_seconds
            context: Execution context with:
                - rule_id: Optional rule ID
                - rule_name: Optional rule name
                
        Returns:
            ActionResult with execution status
        """
        # Extract parameters
        esp_id = action.get("esp_id")
        gpio = action.get("gpio")
        command = action.get("command", "ON")
        value = action.get("value", 1.0)
        
        # Support both duration_seconds and duration fields
        duration = action.get("duration_seconds")
        if duration is None:
            duration = action.get("duration", 0)
        
        # Validate required fields
        if not esp_id:
            return ActionResult(
                success=False,
                message="Missing esp_id in actuator action",
            )
        
        if gpio is None:
            return ActionResult(
                success=False,
                message="Missing gpio in actuator action",
            )
        
        # Get rule info from context
        rule_id = context.get("rule_id")
        rule_name = context.get("rule_name", "Unknown")
        
        issued_by = f"logic:{rule_id}" if rule_id else "logic:unknown"
        
        try:
            # Send command via ActuatorService
            success = await self.actuator_service.send_command(
                esp_id=esp_id,
                gpio=gpio,
                command=command,
                value=value,
                duration=duration,
                issued_by=issued_by,
            )
            
            if success:
                message = (
                    f"Actuator command executed: {command} on {esp_id}:GPIO{gpio}"
                )
                if duration > 0:
                    message += f" (duration: {duration}s)"
                
                return ActionResult(
                    success=True,
                    message=message,
                    data={
                        "esp_id": esp_id,
                        "gpio": gpio,
                        "command": command,
                        "value": value,
                        "duration": duration,
                    },
                )
            else:
                return ActionResult(
                    success=False,
                    message=f"Actuator command failed: {command} on {esp_id}:GPIO{gpio}",
                )
        
        except Exception as e:
            logger.error(
                f"Error executing actuator action: {e}",
                exc_info=True,
            )
            return ActionResult(
                success=False,
                message=f"Error executing actuator action: {str(e)}",
            )



















