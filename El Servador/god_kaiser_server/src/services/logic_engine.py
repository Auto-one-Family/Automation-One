"""
Cross-ESP Automation Engine (Background Task)

Evaluates logic rules in background, triggers actuator actions based on sensor conditions.
"""

import asyncio
import time
import uuid
from datetime import datetime, timedelta
from typing import Optional

from ..core.logging_config import get_logger
from ..db.repositories import LogicRepository
from ..db.session import get_session
from ..websocket.manager import WebSocketManager
from .actuator_service import ActuatorService

logger = get_logger(__name__)


class LogicEngine:
    """
    Cross-ESP Automation Engine (Background Task).
    
    Evaluates logic rules when sensor data arrives,
    triggers actuator actions based on conditions.
    """

    def __init__(
        self,
        logic_repo: LogicRepository,
        actuator_service: ActuatorService,
        websocket_manager: WebSocketManager,
    ):
        """
        Initialize Logic Engine.
        
        Args:
            logic_repo: LogicRepository instance
            actuator_service: ActuatorService instance
            websocket_manager: WebSocketManager instance
        """
        self.logic_repo = logic_repo
        self.actuator_service = actuator_service
        self.websocket_manager = websocket_manager
        self._running = False
        self._task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        """
        Start background evaluation task.
        
        Should be called on application startup.
        """
        if self._running:
            logger.warning("Logic Engine is already running")
            return
        
        self._running = True
        self._task = asyncio.create_task(self._evaluation_loop())
        logger.info("Logic Engine started")

    async def stop(self) -> None:
        """
        Stop background task.
        
        Should be called on application shutdown.
        """
        if not self._running:
            return
        
        self._running = False
        
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        
        logger.info("Logic Engine stopped")

    async def evaluate_sensor_data(
        self, esp_id: str, gpio: int, sensor_type: str, value: float
    ) -> None:
        """
        Evaluate rules triggered by sensor data.
        
        Called by sensor_handler after sensor data is saved.
        This method is non-blocking and should be called via asyncio.create_task().
        
        Args:
            esp_id: ESP device ID
            gpio: GPIO pin number
            sensor_type: Sensor type (e.g., "temperature", "humidity")
            value: Sensor value
        """
        try:
            # Get database session for this evaluation
            async for session in get_session():
                logic_repo = LogicRepository(session)
                
                # Find matching rules
                matching_rules = await logic_repo.get_rules_by_trigger_sensor(
                    esp_id=esp_id,
                    gpio=gpio,
                    sensor_type=sensor_type,
                )
                
                if not matching_rules:
                    logger.debug(
                        f"No matching rules for sensor: esp_id={esp_id}, "
                        f"gpio={gpio}, sensor_type={sensor_type}"
                    )
                    return
                
                # Prepare trigger data
                trigger_data = {
                    "esp_id": esp_id,
                    "gpio": gpio,
                    "sensor_type": sensor_type,
                    "value": value,
                    "timestamp": int(time.time()),
                }
                
                # Evaluate each matching rule
                for rule in matching_rules:
                    await self._evaluate_rule(rule, trigger_data, logic_repo)
                
                break  # Exit after first session
        
        except Exception as e:
            logger.error(
                f"Error evaluating sensor data: {e}",
                exc_info=True,
            )

    async def _evaluate_rule(
        self, rule, trigger_data: dict, logic_repo: LogicRepository
    ) -> None:
        """
        Evaluate a single rule.
        
        Args:
            rule: CrossESPLogic instance
            trigger_data: Sensor data that triggered the rule
            logic_repo: LogicRepository instance
        """
        start_time = time.time()
        
        try:
            # Check cooldown
            if rule.cooldown_seconds:
                last_execution = await logic_repo.get_last_execution(rule.id)
                if last_execution:
                    time_since_last = datetime.utcnow() - last_execution
                    if time_since_last.total_seconds() < rule.cooldown_seconds:
                        logger.debug(
                            f"Rule {rule.rule_name} in cooldown: "
                            f"{time_since_last.total_seconds():.1f}s < {rule.cooldown_seconds}s"
                        )
                        return
            
            # Evaluate conditions
            conditions_met = await self._check_conditions(
                rule.trigger_conditions, trigger_data
            )
            
            if not conditions_met:
                logger.debug(
                    f"Rule {rule.rule_name} conditions not met for trigger: {trigger_data}"
                )
                return
            
            # Execute actions
            logger.info(
                f"Rule {rule.rule_name} triggered: executing {len(rule.actions)} actions"
            )
            
            await self._execute_actions(
                rule.actions, trigger_data, rule.id, rule.rule_name
            )
            
            # Log successful execution
            execution_time_ms = int((time.time() - start_time) * 1000)
            await logic_repo.log_execution(
                rule_id=rule.id,
                trigger_data=trigger_data,
                actions=rule.actions,
                success=True,
                execution_time_ms=execution_time_ms,
            )
            await logic_repo.session.commit()
            
        except Exception as e:
            logger.error(
                f"Error evaluating rule {rule.rule_name}: {e}",
                exc_info=True,
            )
            
            # Log failed execution
            execution_time_ms = int((time.time() - start_time) * 1000)
            await logic_repo.log_execution(
                rule_id=rule.id,
                trigger_data=trigger_data,
                actions=rule.actions,
                success=False,
                execution_time_ms=execution_time_ms,
                error_message=str(e),
            )
            await logic_repo.session.commit()

    async def _check_conditions(
        self, conditions: dict, sensor_data: dict
    ) -> bool:
        """
        Check if conditions are met.
        
        Supports:
        - Single condition: {'type': 'sensor_threshold', ...}
        - Compound conditions: {'logic': 'AND', 'conditions': [...]}
        
        Args:
            conditions: Condition dictionary
            sensor_data: Sensor data to check against
            
        Returns:
            True if conditions are met, False otherwise
        """
        # Handle compound conditions (AND/OR logic)
        if "logic" in conditions and "conditions" in conditions:
            logic = conditions.get("logic", "AND").upper()
            sub_conditions = conditions.get("conditions", [])
            
            if logic == "AND":
                # All conditions must be met
                for condition in sub_conditions:
                    if not await self._check_single_condition(condition, sensor_data):
                        return False
                return True
            elif logic == "OR":
                # At least one condition must be met
                for condition in sub_conditions:
                    if await self._check_single_condition(condition, sensor_data):
                        return True
                return False
            else:
                logger.warning(f"Unknown logic operator: {logic}")
                return False
        
        # Handle single condition
        return await self._check_single_condition(conditions, sensor_data)

    async def _check_single_condition(
        self, condition: dict, sensor_data: dict
    ) -> bool:
        """
        Check a single condition.
        
        Args:
            condition: Single condition dictionary
            sensor_data: Sensor data to check against
            
        Returns:
            True if condition is met, False otherwise
        """
        cond_type = condition.get("type")
        
        if cond_type == "sensor_threshold":
            # Match on ESP + GPIO + Sensor Type
            if (
                condition.get("esp_id") != sensor_data.get("esp_id")
                or condition.get("gpio") != sensor_data.get("gpio")
                or condition.get("sensor_type") != sensor_data.get("sensor_type")
            ):
                return False
            
            operator = condition.get("operator")
            threshold = condition.get("value")
            actual = sensor_data.get("value")
            
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
                return min_val <= actual <= max_val
            else:
                logger.warning(f"Unknown operator: {operator}")
                return False
        
        elif cond_type == "time_window":
            # Time window condition
            now = datetime.now()
            start_hour = condition.get("start_hour", 0)
            end_hour = condition.get("end_hour", 24)
            days = condition.get("days_of_week")  # Optional: [0,1,2,3,4] = Mon-Fri
            
            # Check day of week if specified
            if days is not None:
                if now.weekday() not in days:
                    return False
            
            # Check time window
            current_hour = now.hour
            return start_hour <= current_hour < end_hour
        
        else:
            logger.warning(f"Unknown condition type: {cond_type}")
            return False

    async def _execute_actions(
        self,
        actions: list,
        trigger_data: dict,
        rule_id: uuid.UUID,
        rule_name: str,
    ) -> None:
        """
        Execute actions for a triggered rule.
        
        Args:
            actions: List of action dictionaries
            trigger_data: Sensor data that triggered the rule
            rule_id: UUID of the rule
            rule_name: Name of the rule
        """
        for action in actions:
            action_type = action.get("type")
            
            if action_type == "actuator_command":
                # Execute actuator command
                esp_id = action.get("esp_id")
                gpio = action.get("gpio")
                command = action.get("command", "ON")
                value = action.get("value", 1.0)
                duration = action.get("duration_seconds", 0)
                
                success = await self.actuator_service.send_command(
                    esp_id=esp_id,
                    gpio=gpio,
                    command=command,
                    value=value,
                    duration=duration,
                    issued_by=f"logic:{rule_id}",
                )
                
                # WebSocket broadcast
                await self.websocket_manager.broadcast("logic_execution", {
                    "rule_id": str(rule_id),
                    "rule_name": rule_name,
                    "trigger": trigger_data,
                    "action": {
                        "esp_id": esp_id,
                        "gpio": gpio,
                        "command": command,
                        "value": value,
                        "duration": duration,
                    },
                    "success": success,
                    "timestamp": trigger_data.get("timestamp"),
                })
                
                if success:
                    logger.info(
                        f"Rule {rule_name} executed action: {command} on "
                        f"ESP {esp_id} GPIO {gpio}"
                    )
                else:
                    logger.error(
                        f"Rule {rule_name} failed to execute action: {command} on "
                        f"ESP {esp_id} GPIO {gpio}"
                    )
            
            else:
                logger.warning(f"Unknown action type: {action_type}")

    async def _evaluation_loop(self) -> None:
        """
        Background evaluation loop.
        
        Currently runs periodically to check for any pending evaluations.
        In the future, this could be enhanced to handle queued evaluations.
        """
        logger.info("Logic Engine evaluation loop started")
        
        while self._running:
            try:
                # Sleep for a short interval
                await asyncio.sleep(1.0)
                
                # Future: Could process queued evaluations here
                # For now, evaluation is triggered directly by sensor_handler
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in evaluation loop: {e}", exc_info=True)
                await asyncio.sleep(5.0)  # Wait before retrying
        
        logger.info("Logic Engine evaluation loop stopped")


# Global Logic Engine instance (set by main.py on startup)
_logic_engine_instance: Optional[LogicEngine] = None


def get_logic_engine() -> Optional[LogicEngine]:
    """
    Get global Logic Engine instance.
    
    Returns:
        LogicEngine instance if initialized, None otherwise
    """
    return _logic_engine_instance


def set_logic_engine(instance: LogicEngine) -> None:
    """
    Set global Logic Engine instance.
    
    Should be called by main.py on startup.
    
    Args:
        instance: LogicEngine instance
    """
    global _logic_engine_instance
    _logic_engine_instance = instance
