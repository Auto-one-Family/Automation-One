"""
Cross-ESP Automation Engine (Background Task)

Evaluates logic rules in background, triggers actuator actions based on sensor conditions.
"""

import asyncio
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from ..core.logging_config import get_logger
from ..db.repositories import LogicRepository
from ..db.session import get_session
from ..websocket.manager import WebSocketManager
from .actuator_service import ActuatorService
from .logic.actions import (
    ActuatorActionExecutor,
    BaseActionExecutor,
    DelayActionExecutor,
    NotificationActionExecutor,
)
from .logic.conditions import (
    BaseConditionEvaluator,
    CompoundConditionEvaluator,
    SensorConditionEvaluator,
    TimeConditionEvaluator,
)

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
        condition_evaluators: Optional[List[BaseConditionEvaluator]] = None,
        action_executors: Optional[List[BaseActionExecutor]] = None,
    ):
        """
        Initialize Logic Engine.
        
        Args:
            logic_repo: LogicRepository instance
            actuator_service: ActuatorService instance
            websocket_manager: WebSocketManager instance
            condition_evaluators: Optional list of condition evaluators (creates defaults if None)
            action_executors: Optional list of action executors (creates defaults if None)
        """
        self.logic_repo = logic_repo
        self.actuator_service = actuator_service
        self.websocket_manager = websocket_manager
        self._running = False
        self._task: Optional[asyncio.Task] = None
        
        # Setup condition evaluators
        if condition_evaluators is None:
            sensor_eval = SensorConditionEvaluator()
            time_eval = TimeConditionEvaluator()
            compound_eval = CompoundConditionEvaluator([sensor_eval, time_eval])
            self.condition_evaluators = [sensor_eval, time_eval, compound_eval]
        else:
            self.condition_evaluators = condition_evaluators
        
        # Setup action executors
        if action_executors is None:
            actuator_exec = ActuatorActionExecutor(actuator_service)
            delay_exec = DelayActionExecutor()
            notification_exec = NotificationActionExecutor(websocket_manager)
            self.action_executors = [actuator_exec, delay_exec, notification_exec]
        else:
            self.action_executors = action_executors

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
    
    async def evaluate_timer_triggered_rules(self) -> None:
        """
        Evaluate rules triggered by timer (time_window conditions).
        
        Should be called periodically by LogicScheduler.
        """
        try:
            # Get database session
            async for session in get_session():
                logic_repo = LogicRepository(session)
                
                # Get all enabled rules
                all_rules = await logic_repo.get_enabled_rules()
                
                # Filter rules with time_window conditions
                timer_rules = []
                for rule in all_rules:
                    conditions = rule.conditions
                    has_time_condition = False
                    
                    # Check if rule has time_window condition
                    if isinstance(conditions, dict):
                        if conditions.get("type") in ("time_window", "time"):
                            has_time_condition = True
                        elif conditions.get("logic"):
                            # Compound condition - check sub-conditions
                            sub_conditions = conditions.get("conditions", [])
                            for sub_cond in sub_conditions:
                                if sub_cond.get("type") in ("time_window", "time"):
                                    has_time_condition = True
                                    break
                    elif isinstance(conditions, list):
                        for cond in conditions:
                            if cond.get("type") in ("time_window", "time"):
                                has_time_condition = True
                                break
                    
                    if has_time_condition:
                        timer_rules.append(rule)
                
                if not timer_rules:
                    logger.debug("No timer-triggered rules to evaluate")
                    return
                
                # Prepare context for time-based evaluation
                context = {
                    "current_time": datetime.now(),
                }
                
                # Evaluate each timer rule
                for rule in timer_rules:
                    # Check if time conditions are met
                    conditions = rule.trigger_conditions
                    
                    # Use modular evaluators to check time conditions
                    conditions_met = await self._check_conditions(conditions, context)
                    
                    if conditions_met:
                        # Prepare trigger data for timer-based execution
                        trigger_data = {
                            "type": "timer",
                            "timestamp": int(time.time()),
                            "rule_id": str(rule.id),
                        }
                        
                        await self._evaluate_rule(rule, trigger_data, logic_repo)
                
                break  # Exit after first session
        
        except Exception as e:
            logger.error(
                f"Error evaluating timer-triggered rules: {e}",
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
                    time_since_last = datetime.now(timezone.utc) - last_execution
                    if time_since_last.total_seconds() < rule.cooldown_seconds:
                        logger.debug(
                            f"Rule {rule.rule_name} in cooldown: "
                            f"{time_since_last.total_seconds():.1f}s < {rule.cooldown_seconds}s"
                        )
                        return
            
            # Evaluate conditions
            # For sensor-triggered rules, prepare context with sensor_data
            context = {
                "sensor_data": trigger_data,
                "current_time": datetime.now(),
            }
            conditions_met = await self._check_conditions(
                rule.trigger_conditions, context
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
            
            # Update last_triggered timestamp
            rule.last_triggered = datetime.now(timezone.utc)
            
            # Log successful execution
            execution_time_ms = int((time.time() - start_time) * 1000)
            await logic_repo.log_execution(
                rule_id=rule.id,
                trigger_data=trigger_data,
                actions=rule.actions,
                success=True,
                execution_ms=execution_time_ms,
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
                execution_ms=execution_time_ms,
                error_message=str(e),
            )
            await logic_repo.session.commit()

    async def _check_conditions(
        self, conditions: dict, sensor_data: dict
    ) -> bool:
        """
        Check if conditions are met using modular evaluators.
        
        Supports:
        - Single condition: {'type': 'sensor_threshold', ...}
        - Compound conditions: {'logic': 'AND', 'conditions': [...]}
        
        Args:
            conditions: Condition dictionary
            sensor_data: Sensor data to check against (or context dict)
            
        Returns:
            True if conditions are met, False otherwise
        """
        # Use modular evaluators if available
        if self.condition_evaluators:
            return await self._check_conditions_modular(conditions, sensor_data)
        
        # Fallback to legacy implementation
        return await self._check_conditions_legacy(conditions, sensor_data)
    
    async def _check_conditions_modular(
        self, conditions: dict, context: dict
    ) -> bool:
        """Check conditions using modular evaluators."""
        # Handle compound conditions (AND/OR logic)
        if "logic" in conditions and "conditions" in conditions:
            logic = conditions.get("logic", "AND").upper()
            
            # Find compound evaluator
            compound_eval = None
            for evaluator in self.condition_evaluators:
                if isinstance(evaluator, CompoundConditionEvaluator):
                    compound_eval = evaluator
                    break
            
            if compound_eval:
                return await compound_eval.evaluate(conditions, context)
            else:
                # Fallback to manual evaluation
                return await self._check_conditions_legacy(conditions, context)
        
        # Handle single condition - find appropriate evaluator
        cond_type = conditions.get("type", "unknown")
        
        for evaluator in self.condition_evaluators:
            if evaluator.supports(cond_type):
                return await evaluator.evaluate(conditions, context)
        
        # No evaluator found - use legacy
        logger.warning(f"No evaluator found for condition type: {cond_type}, using legacy")
        return await self._check_conditions_legacy(conditions, context)
    
    async def _check_conditions_legacy(
        self, conditions: dict, sensor_data: dict
    ) -> bool:
        """
        Legacy condition checking (backward compatibility).
        
        Original implementation maintained for compatibility.
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
        
        # Accept both "sensor_threshold" and "sensor" as valid condition types
        if cond_type in ("sensor_threshold", "sensor"):
            # Match on ESP + GPIO + optionally Sensor Type
            if condition.get("esp_id") != sensor_data.get("esp_id"):
                return False
            if condition.get("gpio") != sensor_data.get("gpio"):
                return False
            # sensor_type is optional for "sensor" shorthand
            if condition.get("sensor_type") and condition.get("sensor_type") != sensor_data.get("sensor_type"):
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
        Execute actions for a triggered rule using modular executors.
        
        Args:
            actions: List of action dictionaries
            trigger_data: Sensor data that triggered the rule
            rule_id: UUID of the rule
            rule_name: Name of the rule
        """
        # Create execution context
        context = {
            "trigger_data": trigger_data,
            "rule_id": rule_id,
            "rule_name": rule_name,
        }
        
        for action in actions:
            action_type = action.get("type")
            
            # Use modular executors if available
            executor_found = False
            if self.action_executors:
                for executor in self.action_executors:
                    if executor.supports(action_type):
                        executor_found = True
                        try:
                            result = await executor.execute(action, context)
                            
                            # WebSocket broadcast
                            await self.websocket_manager.broadcast("logic_execution", {
                                "rule_id": str(rule_id),
                                "rule_name": rule_name,
                                "trigger": trigger_data,
                                "action": action,
                                "success": result.success,
                                "message": result.message,
                                "timestamp": trigger_data.get("timestamp"),
                            })
                            
                            if result.success:
                                logger.info(
                                    f"Rule {rule_name} executed action: {action_type} - {result.message}"
                                )
                            else:
                                logger.error(
                                    f"Rule {rule_name} failed to execute action: {action_type} - {result.message}"
                                )
                        
                        except Exception as e:
                            logger.error(
                                f"Error executing action {action_type} for rule {rule_name}: {e}",
                                exc_info=True,
                            )
                        
                        break
            
            # Fallback to legacy implementation for backward compatibility
            if not executor_found:
                await self._execute_action_legacy(
                    action, trigger_data, rule_id, rule_name
                )
    
    async def _execute_action_legacy(
        self,
        action: dict,
        trigger_data: dict,
        rule_id: uuid.UUID,
        rule_name: str,
    ) -> None:
        """
        Legacy action execution (backward compatibility).
        
        Original implementation maintained for compatibility.
        """
        action_type = action.get("type")
        
        # Support both "actuator_command" and "actuator" for backward compatibility
        if action_type in ("actuator_command", "actuator"):
            # Execute actuator command
            esp_id = action.get("esp_id")
            gpio = action.get("gpio")
            command = action.get("command", "ON")
            value = action.get("value", 1.0)
            # Support both "duration_seconds" and "duration" for backward compatibility
            # Use explicit None check to allow duration_seconds=0 as valid value
            duration = action.get("duration_seconds") if "duration_seconds" in action else action.get("duration", 0)
            
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
