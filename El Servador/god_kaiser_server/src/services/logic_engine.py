"""
Cross-ESP Automation Engine (Background Task)

Evaluates logic rules in background, triggers actuator actions based on sensor conditions.
"""

import asyncio
import time
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from ..core.logging_config import get_logger
from ..core.metrics import increment_logic_error, increment_safety_trigger
from ..db.repositories import LogicRepository, ESPRepository, SensorRepository
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
    HysteresisConditionEvaluator,
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
        conflict_manager=None,
        rate_limiter=None,
    ):
        """
        Initialize Logic Engine.

        Args:
            logic_repo: LogicRepository instance
            actuator_service: ActuatorService instance
            websocket_manager: WebSocketManager instance
            condition_evaluators: Optional list of condition evaluators (creates defaults if None)
            action_executors: Optional list of action executors (creates defaults if None)
            conflict_manager: Optional ConflictManager instance (creates default if None)
            rate_limiter: Optional RateLimiter instance (creates default if None)
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
            hysteresis_eval = HysteresisConditionEvaluator()
            compound_eval = CompoundConditionEvaluator([sensor_eval, time_eval, hysteresis_eval])
            self.condition_evaluators = [
                sensor_eval,
                time_eval,
                hysteresis_eval,
                compound_eval,
            ]
        else:
            self.condition_evaluators = condition_evaluators

        # Setup action executors
        if action_executors is None:
            actuator_exec = ActuatorActionExecutor(actuator_service)
            delay_exec = DelayActionExecutor()
            notification_exec = NotificationActionExecutor()
            self.action_executors = [actuator_exec, delay_exec, notification_exec]
        else:
            self.action_executors = action_executors

        # Setup safety components
        if conflict_manager is None:
            from .logic.safety.conflict_manager import ConflictManager

            self.conflict_manager = ConflictManager()
        else:
            self.conflict_manager = conflict_manager

        if rate_limiter is None:
            from .logic.safety.rate_limiter import RateLimiter

            self.rate_limiter = RateLimiter(logic_repo=logic_repo)
        else:
            self.rate_limiter = rate_limiter

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
        self,
        esp_id: str,
        gpio: int,
        sensor_type: str,
        value: float,
        zone_id: Optional[str] = None,
        subzone_id: Optional[str] = None,
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
            zone_id: Zone ID at measurement time (Phase 0.1, for Phase 2.4 Subzone-Matching)
            subzone_id: Subzone ID at measurement time (Phase 0.1, for Phase 2.4 Subzone-Matching)
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

                # Prepare trigger data (Phase 0.1: zone_id/subzone_id for Phase 2.4 Subzone-Matching)
                trigger_data = {
                    "esp_id": esp_id,
                    "gpio": gpio,
                    "sensor_type": sensor_type,
                    "value": value,
                    "timestamp": int(time.time()),
                    "zone_id": zone_id,
                    "subzone_id": subzone_id,
                }

                # Evaluate each matching rule with batch-level lock tracking
                # Locks are held across the entire batch to enable ConflictManager
                # to block lower-priority rules from overriding higher-priority ones
                batch_locks = []
                try:
                    for rule in matching_rules:
                        await self._evaluate_rule(
                            rule, trigger_data, logic_repo, batch_locks=batch_locks
                        )
                finally:
                    # Release all locks at the end of the batch
                    for lock in batch_locks:
                        await self.conflict_manager.release_actuator(
                            esp_id=lock["esp_id"],
                            gpio=lock["gpio"],
                            rule_id=lock["rule_id"],
                        )

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
                    # Use trigger_conditions (raw JSON) for type checking,
                    # NOT .conditions property which always wraps in list
                    raw_conditions = rule.trigger_conditions
                    has_time_condition = False

                    # Check if rule has time_window condition
                    if isinstance(raw_conditions, dict):
                        if raw_conditions.get("type") in ("time_window", "time"):
                            has_time_condition = True
                        elif raw_conditions.get("logic"):
                            # Compound condition - check sub-conditions
                            sub_conditions = raw_conditions.get("conditions", [])
                            for sub_cond in sub_conditions:
                                if sub_cond.get("type") in ("time_window", "time"):
                                    has_time_condition = True
                                    break
                    elif isinstance(raw_conditions, list):
                        for cond in raw_conditions:
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
                    "current_time": datetime.now(timezone.utc),
                }

                # Evaluate each timer rule with batch-level lock tracking
                batch_locks = []
                try:
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

                            await self._evaluate_rule(
                                rule, trigger_data, logic_repo, batch_locks=batch_locks
                            )
                finally:
                    for lock in batch_locks:
                        await self.conflict_manager.release_actuator(
                            esp_id=lock["esp_id"],
                            gpio=lock["gpio"],
                            rule_id=lock["rule_id"],
                        )

                break  # Exit after first session

        except Exception as e:
            logger.error(
                f"Error evaluating timer-triggered rules: {e}",
                exc_info=True,
            )

    async def _evaluate_rule(
        self,
        rule,
        trigger_data: dict,
        logic_repo: LogicRepository,
        batch_locks: list | None = None,
    ) -> None:
        """
        Evaluate a single rule.

        Args:
            rule: CrossESPLogic instance
            trigger_data: Sensor data that triggered the rule
            logic_repo: LogicRepository instance
        """
        # Concurrency: No engine-level lock by design.
        # ConflictManager (asyncio.Lock per esp:gpio) prevents concurrent actuator commands.
        # Cooldown checks have a ~10ms race window under burst load — acceptable for current scale.
        # Add engine-level lock only if rule evaluation rate exceeds ~100/s.
        start_time = time.time()

        try:
            # Evaluate conditions first (needed for hysteresis deactivation path)
            sensor_values = await self._load_cross_sensor_values(
                rule.trigger_conditions, trigger_data, logic_repo.session
            )
            context = {
                "sensor_data": trigger_data,
                "sensor_values": sensor_values,
                "current_time": datetime.now(timezone.utc),
                "rule_id": str(rule.id),
                "condition_index": 0,
            }
            conditions_met = await self._check_conditions(
                rule.trigger_conditions, context, logic_operator=rule.logic_operator
            )

            # Hysteresis deactivation: bypass cooldown (OFF must execute immediately)
            if not conditions_met and context.get("_hysteresis_just_deactivated"):
                off_actions = []
                for action in rule.actions:
                    if action.get("type") in ("actuator_command", "actuator"):
                        off_actions.append(
                            {
                                **action,
                                "command": "OFF",
                                "value": 0.0,
                                "duration": 0,
                            }
                        )
                if off_actions:
                    logger.info(
                        f"Rule {rule.rule_name} hysteresis deactivated: "
                        f"sending OFF to {len(off_actions)} actuator(s)"
                    )
                    await self._execute_actions(
                        off_actions,
                        trigger_data,
                        rule.id,
                        rule.rule_name,
                        rule.priority,
                        session=logic_repo.session,
                        batch_locks=batch_locks,
                    )
                    execution_time_ms = int((time.time() - start_time) * 1000)
                    await logic_repo.log_execution(
                        rule_id=rule.id,
                        trigger_data=trigger_data,
                        actions=off_actions,
                        success=True,
                        execution_ms=execution_time_ms,
                    )
                    await logic_repo.session.commit()
                return

            if not conditions_met:
                logger.debug(
                    f"Rule {rule.rule_name} conditions not met for trigger: {trigger_data}"
                )
                return

            # Check cooldown (only for activation — prevents rapid ON-ON-ON)
            if rule.cooldown_seconds:
                last_execution = await logic_repo.get_last_execution(rule.id)
                if last_execution:
                    time_since_last = datetime.now(timezone.utc) - last_execution.timestamp
                    if time_since_last.total_seconds() <= rule.cooldown_seconds:
                        logger.debug(
                            f"Rule {rule.rule_name} in cooldown: "
                            f"{time_since_last.total_seconds():.1f}s < {rule.cooldown_seconds}s"
                        )
                        return

            # Check rate limiting
            target_esp_ids = self._extract_target_esp_ids(rule.actions)
            rate_result = await self.rate_limiter.check_rate_limit(
                rule_id=str(rule.id),
                rule_max_per_hour=rule.max_executions_per_hour,
                esp_ids=target_esp_ids,
            )

            if not rate_result["allowed"]:
                increment_safety_trigger()
                logger.warning(f"Rule {rule.rule_name} rate limited: {rate_result['reason']}")
                return

            # Execute actions (conditions_met from earlier evaluation)
            logger.info(f"Rule {rule.rule_name} triggered: executing {len(rule.actions)} actions")

            await self._execute_actions(
                rule.actions,
                trigger_data,
                rule.id,
                rule.rule_name,
                rule.priority,
                session=logic_repo.session,
                batch_locks=batch_locks,
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
            increment_logic_error()
            logger.error(
                f"Error evaluating rule {rule.rule_name}: {e}",
                exc_info=True,
            )

            # Log failed execution (rollback first in case session is broken)
            try:
                await logic_repo.session.rollback()
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
            except Exception as log_err:
                logger.error(f"Failed to log execution error: {log_err}")

    async def _check_conditions(
        self, conditions, sensor_data: dict, logic_operator: str = "AND"
    ) -> bool:
        """
        Check if conditions are met using modular evaluators.

        Supports:
        - Single condition: {'type': 'sensor_threshold', ...}
        - Compound conditions: {'logic': 'AND', 'conditions': [...]}
        - List of conditions: [{'type': 'sensor', ...}, ...] (from API)

        Args:
            conditions: Condition dict, compound dict, or list of condition dicts
            sensor_data: Sensor data to check against (or context dict)
            logic_operator: Logic operator for combining multiple conditions ("AND" or "OR")

        Returns:
            True if conditions are met, False otherwise
        """
        # Handle list of conditions (API stores conditions as List[Dict])
        if isinstance(conditions, list):
            if len(conditions) == 0:
                return False
            if len(conditions) == 1:
                # Single condition in list
                conditions = conditions[0]
            else:
                # Multiple conditions — wrap as compound using rule's logic_operator
                operator = logic_operator.upper() if logic_operator else "AND"
                conditions = {"logic": operator, "conditions": conditions}

        # Use modular evaluators if available
        if self.condition_evaluators:
            return await self._check_conditions_modular(conditions, sensor_data)

        # Fallback to legacy implementation
        return await self._check_conditions_legacy(conditions, sensor_data)

    async def _check_conditions_modular(self, conditions: dict, context: dict) -> bool:
        """Check conditions using modular evaluators."""
        # Handle compound conditions (AND/OR logic)
        if "logic" in conditions and "conditions" in conditions:
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

    async def _check_conditions_legacy(self, conditions: dict, sensor_data: dict) -> bool:
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

    async def _check_single_condition(self, condition: dict, sensor_data: dict) -> bool:
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
            # GPIO comparison with type coercion (int vs str safety)
            try:
                if int(condition.get("gpio", -1)) != int(sensor_data.get("gpio", -2)):
                    return False
            except (ValueError, TypeError):
                return False
            # sensor_type is optional for "sensor" shorthand
            if condition.get("sensor_type") and condition.get("sensor_type") != sensor_data.get(
                "sensor_type"
            ):
                return False

            # Phase 2.4: Optional subzone filter (skip when condition.subzone_id not set)
            cond_subzone = condition.get("subzone_id")
            if cond_subzone and sensor_data.get("subzone_id") != cond_subzone:
                return False

            operator = condition.get("operator")
            threshold = condition.get("value")
            actual = sensor_data.get("value")

            if actual is None:
                logger.warning(
                    f"Sensor data missing value for "
                    f"{sensor_data.get('esp_id')}:{sensor_data.get('gpio')}"
                )
                return False

            # Type-safe conversion to float
            try:
                actual = float(actual)
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
                    return float(min_val) <= actual <= float(max_val)
                except (ValueError, TypeError):
                    return False
            else:
                logger.warning(f"Unknown operator: {operator}")
                return False

        elif cond_type in ("time_window", "time"):
            # Time window condition
            now = datetime.now(timezone.utc)
            start_hour = condition.get("start_hour", 0)
            end_hour = condition.get("end_hour", 24)
            days = condition.get("days_of_week")  # Optional: [0,1,2,3,4] = Mon-Fri

            # Check day of week if specified
            if days is not None:
                if now.weekday() not in days:
                    return False

            # Check time window with overnight wrapping support
            current_hour = now.hour
            if start_hour <= end_hour:
                return start_hour <= current_hour < end_hour
            else:
                # Wrapping case (e.g., 22:00 to 06:00)
                return current_hour >= start_hour or current_hour < end_hour

        else:
            logger.warning(f"Unknown condition type: {cond_type}")
            return False

    async def _execute_actions(
        self,
        actions: list,
        trigger_data: dict,
        rule_id: uuid.UUID,
        rule_name: str,
        rule_priority: int = 100,
        session=None,
        batch_locks: list | None = None,
    ) -> None:
        """
        Execute actions for a triggered rule using modular executors.

        Args:
            actions: List of action dictionaries
            trigger_data: Sensor data that triggered the rule
            rule_id: UUID of the rule
            rule_name: Name of the rule
            rule_priority: Rule priority (lower number = higher priority)
            session: Optional async DB session (Phase 2.4: for SubzoneRepository lookup)
            batch_locks: Optional batch-level lock tracking list.
                If provided, acquired locks are added here and NOT released
                in this method (caller is responsible for batch release).
        """
        # Extract actuator actions for conflict management
        actuator_actions = [
            action for action in actions if action.get("type") in ("actuator_command", "actuator")
        ]

        # Acquire locks for all actuator actions
        acquired_locks = []
        for action in actuator_actions:

            can_execute, conflict = await self.conflict_manager.acquire_actuator(
                esp_id=action.get("esp_id"),
                gpio=action.get("gpio"),
                rule_id=str(rule_id),
                priority=rule_priority,
                command=action.get("command", "ON"),
                is_safety_critical=action.get("is_safety_critical", False),
            )

            if not can_execute:
                increment_safety_trigger()
                logger.warning(
                    f"Actuator conflict for rule {rule_name}: {conflict.message if conflict else 'Unknown conflict'}"
                )
                # Rollback already acquired locks
                for lock in acquired_locks:
                    await self.conflict_manager.release_actuator(
                        esp_id=lock["esp_id"], gpio=lock["gpio"], rule_id=lock["rule_id"]
                    )
                return

            acquired_locks.append(
                {
                    "esp_id": action.get("esp_id"),
                    "gpio": action.get("gpio"),
                    "rule_id": str(rule_id),
                }
            )

        # Create execution context (Phase 2.4: session for ActuatorActionExecutor subzone lookup)
        context = {
            "trigger_data": trigger_data,
            "rule_id": rule_id,
            "rule_name": rule_name,
            "session": session,
        }

        try:
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

                                # WebSocket broadcast (non-critical, must not interrupt execution)
                                try:
                                    await self.websocket_manager.broadcast(
                                        "logic_execution",
                                        {
                                            "rule_id": str(rule_id),
                                            "rule_name": rule_name,
                                            "trigger": trigger_data,
                                            "action": action,
                                            "success": result.success,
                                            "message": result.message,
                                            "timestamp": trigger_data.get("timestamp"),
                                        },
                                    )
                                except Exception as ws_err:
                                    logger.warning(
                                        f"WebSocket broadcast failed for rule {rule_name}: {ws_err}"
                                    )

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
                    await self._execute_action_legacy(action, trigger_data, rule_id, rule_name)
        finally:
            if batch_locks is not None:
                # Batch mode: transfer locks to batch for deferred release
                batch_locks.extend(acquired_locks)
            else:
                # Non-batch mode: release locks immediately
                for lock in acquired_locks:
                    await self.conflict_manager.release_actuator(
                        esp_id=lock["esp_id"], gpio=lock["gpio"], rule_id=lock["rule_id"]
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
            duration = (
                action.get("duration_seconds")
                if "duration_seconds" in action
                else action.get("duration", 0)
            )

            success = await self.actuator_service.send_command(
                esp_id=esp_id,
                gpio=gpio,
                command=command,
                value=value,
                duration=duration,
                issued_by=f"logic:{rule_id}",
            )

            # WebSocket broadcast (non-critical, must not interrupt execution)
            try:
                await self.websocket_manager.broadcast(
                    "logic_execution",
                    {
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
                    },
                )
            except Exception as ws_err:
                logger.warning(f"WebSocket broadcast failed for rule {rule_name}: {ws_err}")

            if success:
                logger.info(
                    f"Rule {rule_name} executed action: {command} on " f"ESP {esp_id} GPIO {gpio}"
                )
            else:
                logger.error(
                    f"Rule {rule_name} failed to execute action: {command} on "
                    f"ESP {esp_id} GPIO {gpio}"
                )

        else:
            logger.warning(f"Unknown action type: {action_type}")

    async def _load_cross_sensor_values(
        self, trigger_conditions, trigger_data: dict, session
    ) -> dict:
        """
        Pre-load latest sensor values for cross-sensor conditions.

        When a rule references multiple sensors (e.g., AND: temp > 25 AND moisture < 40),
        only one sensor triggers the evaluation. For other sensors, we need to look up
        the latest value from the database.

        Args:
            trigger_conditions: Rule's trigger_conditions (list or dict)
            trigger_data: Current trigger sensor data (esp_id, gpio, sensor_type, value)
            session: SQLAlchemy async session

        Returns:
            Dict mapping "ESP_ID:GPIO" to {"value": float, "sensor_type": str}
        """
        sensor_values = {}

        # Include trigger data in sensor_values for consistency
        # Use sensor_type-specific key for multi-value sensors (SHT31 temp vs humidity)
        trigger_sensor_type = trigger_data.get("sensor_type")
        trigger_key = (
            f"{trigger_data.get('esp_id')}:{trigger_data.get('gpio')}:{trigger_sensor_type}"
            if trigger_sensor_type
            else f"{trigger_data.get('esp_id')}:{trigger_data.get('gpio')}"
        )
        sensor_values[trigger_key] = {
            "value": trigger_data.get("value"),
            "sensor_type": trigger_sensor_type,
        }
        # Also store untyped key for backward compatibility
        untyped_trigger_key = f"{trigger_data.get('esp_id')}:{trigger_data.get('gpio')}"
        if untyped_trigger_key != trigger_key:
            sensor_values[untyped_trigger_key] = {
                "value": trigger_data.get("value"),
                "sensor_type": trigger_sensor_type,
            }

        # Extract all sensor conditions from trigger_conditions
        conditions_to_check = []
        if isinstance(trigger_conditions, list):
            conditions_to_check = trigger_conditions
        elif isinstance(trigger_conditions, dict):
            if trigger_conditions.get("type") in ("sensor_threshold", "sensor"):
                conditions_to_check = [trigger_conditions]
            elif trigger_conditions.get("logic") in ("AND", "OR"):
                conditions_to_check = trigger_conditions.get("conditions", [])
            elif trigger_conditions.get("type") == "compound":
                conditions_to_check = trigger_conditions.get("conditions", [])

        # Find conditions that reference different sensors than the trigger
        cross_sensor_keys = []
        for cond in conditions_to_check:
            if cond.get("type") not in ("sensor_threshold", "sensor"):
                continue
            cond_esp = cond.get("esp_id")
            cond_gpio = cond.get("gpio")
            if cond_esp is None or cond_gpio is None:
                continue
            # Include sensor_type in key for multi-value sensors (SHT31 temp vs humidity)
            cond_sensor_type = cond.get("sensor_type")
            sensor_key = (
                f"{cond_esp}:{cond_gpio}:{cond_sensor_type}"
                if cond_sensor_type
                else f"{cond_esp}:{cond_gpio}"
            )
            if sensor_key != trigger_key and sensor_key not in sensor_values:
                cross_sensor_keys.append((cond_esp, int(cond_gpio), cond_sensor_type))

        if not cross_sensor_keys:
            return sensor_values

        # Look up latest values from DB
        try:
            esp_repo = ESPRepository(session)
            sensor_repo = SensorRepository(session)

            for esp_id_str, gpio, sensor_type in cross_sensor_keys:
                # Include sensor_type in key for multi-value sensors (SHT31 temp vs humidity)
                sensor_key = (
                    f"{esp_id_str}:{gpio}:{sensor_type}" if sensor_type else f"{esp_id_str}:{gpio}"
                )
                # Look up ESP UUID from device_id
                esp_device = await esp_repo.get_by_device_id(esp_id_str)
                if not esp_device:
                    logger.debug(f"Cross-sensor lookup: ESP {esp_id_str} not found")
                    continue

                # Get latest sensor reading
                reading = await sensor_repo.get_latest_reading(
                    esp_id=esp_device.id, gpio=gpio, sensor_type=sensor_type
                )
                if reading:
                    display_value = (
                        reading.processed_value
                        if reading.processed_value is not None
                        else reading.raw_value
                    )
                    sensor_values[sensor_key] = {
                        "value": display_value,
                        "sensor_type": reading.sensor_type,
                    }
                    logger.debug(
                        f"Cross-sensor loaded: {sensor_key} = {display_value} "
                        f"({reading.sensor_type})"
                    )
                else:
                    logger.debug(f"Cross-sensor lookup: no data for {sensor_key}")

        except Exception as e:
            logger.warning(f"Failed to load cross-sensor values: {e}")

        return sensor_values

    def _extract_target_esp_ids(self, actions: list) -> List[str]:
        """
        Extract ESP IDs from actions for rate limiting.

        Args:
            actions: List of action dictionaries

        Returns:
            List of unique ESP IDs targeted by actions
        """
        esp_ids = set()
        for action in actions:
            if action.get("type") in ("actuator_command", "actuator"):
                esp_id = action.get("esp_id")
                if esp_id:
                    esp_ids.add(esp_id)
            elif action.get("type") == "sequence":
                # Extract ESP IDs from sequence steps
                steps = action.get("steps", [])
                for step in steps:
                    step_action = step.get("action", {})
                    if step_action.get("type") in ("actuator_command", "actuator"):
                        esp_id = step_action.get("esp_id")
                        if esp_id:
                            esp_ids.add(esp_id)
        return list(esp_ids)

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
