"""
Logic Rules & Automation API Endpoints

Phase: 5 (Week 9-10) - API Layer
Priority: 🟡 HIGH
Status: IMPLEMENTED

Provides:
- GET /rules - List all rules
- POST /rules - Create rule
- GET /rules/{rule_id} - Get rule details
- PUT /rules/{rule_id} - Update rule
- DELETE /rules/{rule_id} - Delete rule
- POST /rules/{rule_id}/toggle - Enable/disable
- POST /rules/{rule_id}/test - Simulate execution
- GET /execution_history - Query history

References:
    - .claude/PI_SERVER_REFACTORING.md (Lines 164-172)
- services/logic_engine.py (Rule execution)
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, HTTPException, Query, status

from ...core.logging_config import get_logger
from ...db.models.logic import CrossESPLogic, LogicExecutionHistory
from ...db.repositories import LogicRepository
from ...schemas import (
    ActionResult,
    ConditionResult,
    ExecutionHistoryEntry,
    ExecutionHistoryPaginatedResponse,
    ExecutionHistoryResponse,
    LogicRuleCreate,
    LogicRuleListResponse,
    LogicRuleResponse,
    LogicRuleUpdate,
    RuleTestRequest,
    RuleTestResponse,
    RuleToggleRequest,
    RuleToggleResponse,
)
from ...schemas.common import PaginationMeta
from ..deps import ActiveUser, DBSession, OperatorUser

logger = get_logger(__name__)

router = APIRouter(prefix="/v1/logic", tags=["logic"])


# =============================================================================
# List Rules
# =============================================================================


@router.get(
    "/rules",
    response_model=LogicRuleListResponse,
    summary="List logic rules",
    description="Get all automation rules.",
)
async def list_rules(
    db: DBSession,
    current_user: ActiveUser,
    enabled: Annotated[Optional[bool], Query(description="Filter by enabled status")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> LogicRuleListResponse:
    """
    List all logic rules.
    
    Args:
        db: Database session
        current_user: Authenticated user
        enabled: Optional enabled filter
        page: Page number
        page_size: Items per page
        
    Returns:
        Paginated list of rules
    """
    logic_repo = LogicRepository(db)
    
    # Get all rules
    rules = await logic_repo.get_all()
    
    # Apply filter
    if enabled is not None:
        rules = [r for r in rules if r.enabled == enabled]
    
    # Sort by priority (highest first)
    rules.sort(key=lambda r: r.priority, reverse=True)
    
    # Pagination
    total_items = len(rules)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated = rules[start_idx:end_idx]
    
    # Build responses
    responses = []
    for rule in paginated:
        # Get execution count
        exec_count = await logic_repo.get_execution_count(rule.id)
        last_exec = await logic_repo.get_last_execution(rule.id)
        
        responses.append(LogicRuleResponse(
            id=rule.id,
            name=rule.name,
            description=rule.description,
            conditions=rule.conditions,
            actions=rule.actions,
            logic_operator=rule.logic_operator,
            enabled=rule.enabled,
            priority=rule.priority,
            cooldown_seconds=rule.cooldown_seconds,
            max_executions_per_hour=rule.max_executions_per_hour,
            last_triggered=rule.last_triggered,
            execution_count=exec_count,
            last_execution_success=last_exec.success if last_exec else None,
            created_at=rule.created_at,
            updated_at=rule.updated_at,
        ))
    
    return LogicRuleListResponse(
        success=True,
        data=responses,
        pagination=PaginationMeta.from_pagination(page, page_size, total_items),
    )


# =============================================================================
# Get Rule
# =============================================================================


@router.get(
    "/rules/{rule_id}",
    response_model=LogicRuleResponse,
    responses={
        200: {"description": "Rule found"},
        404: {"description": "Rule not found"},
    },
    summary="Get logic rule",
    description="Get details of a specific rule.",
)
async def get_rule(
    rule_id: uuid.UUID,
    db: DBSession,
    current_user: ActiveUser,
) -> LogicRuleResponse:
    """
    Get logic rule by ID.
    
    Args:
        rule_id: Rule ID
        db: Database session
        current_user: Authenticated user
        
    Returns:
        Rule details
    """
    logic_repo = LogicRepository(db)
    
    rule = await logic_repo.get_by_id(rule_id)
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Logic rule {rule_id} not found",
        )
    
    exec_count = await logic_repo.get_execution_count(rule.id)
    last_exec = await logic_repo.get_last_execution(rule.id)
    
    return LogicRuleResponse(
        id=rule.id,
        name=rule.name,
        description=rule.description,
        conditions=rule.conditions,
        actions=rule.actions,
        logic_operator=rule.logic_operator,
        enabled=rule.enabled,
        priority=rule.priority,
        cooldown_seconds=rule.cooldown_seconds,
        max_executions_per_hour=rule.max_executions_per_hour,
        last_triggered=rule.last_triggered,
        execution_count=exec_count,
        last_execution_success=last_exec.success if last_exec else None,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


# =============================================================================
# Create Rule
# =============================================================================


@router.post(
    "/rules",
    response_model=LogicRuleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create logic rule",
    description="Create a new automation rule.",
)
async def create_rule(
    request: LogicRuleCreate,
    db: DBSession,
    current_user: OperatorUser,
) -> LogicRuleResponse:
    """
    Create a new logic rule.
    
    Args:
        request: Rule data
        db: Database session
        current_user: Operator or admin user
        
    Returns:
        Created rule
    """
    logic_repo = LogicRepository(db)
    
    # Create rule (using CrossESPLogic model field names)
    rule = CrossESPLogic(
        rule_name=request.name,
        description=request.description,
        trigger_conditions=request.conditions,
        actions=request.actions,
        logic_operator=request.logic_operator,
        enabled=request.enabled,
        priority=request.priority,
        cooldown_seconds=request.cooldown_seconds,
        max_executions_per_hour=request.max_executions_per_hour,
    )
    
    created = await logic_repo.create(rule)
    await db.commit()
    
    logger.info(f"Logic rule created: '{created.name}' (ID: {created.id}) by {current_user.username}")
    
    return LogicRuleResponse(
        id=created.id,
        name=created.name,
        description=created.description,
        conditions=created.conditions,
        actions=created.actions,
        logic_operator=created.logic_operator,
        enabled=created.enabled,
        priority=created.priority,
        cooldown_seconds=created.cooldown_seconds,
        max_executions_per_hour=created.max_executions_per_hour,
        last_triggered=None,
        execution_count=0,
        last_execution_success=None,
        created_at=created.created_at,
        updated_at=created.updated_at,
    )


# =============================================================================
# Update Rule
# =============================================================================


@router.put(
    "/rules/{rule_id}",
    response_model=LogicRuleResponse,
    responses={
        200: {"description": "Rule updated"},
        404: {"description": "Rule not found"},
    },
    summary="Update logic rule",
    description="Update an existing rule.",
)
async def update_rule(
    rule_id: uuid.UUID,
    request: LogicRuleUpdate,
    db: DBSession,
    current_user: OperatorUser,
) -> LogicRuleResponse:
    """
    Update logic rule.
    
    Args:
        rule_id: Rule ID
        request: Update data
        db: Database session
        current_user: Operator or admin user
        
    Returns:
        Updated rule
    """
    logic_repo = LogicRepository(db)
    
    rule = await logic_repo.get_by_id(rule_id)
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Logic rule {rule_id} not found",
        )
    
    # Update fields
    update_data = request.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(rule, field, value)
    
    await db.flush()
    await db.commit()
    
    exec_count = await logic_repo.get_execution_count(rule.id)
    last_exec = await logic_repo.get_last_execution(rule.id)
    
    logger.info(f"Logic rule updated: '{rule.name}' (ID: {rule.id}) by {current_user.username}")
    
    return LogicRuleResponse(
        id=rule.id,
        name=rule.name,
        description=rule.description,
        conditions=rule.conditions,
        actions=rule.actions,
        logic_operator=rule.logic_operator,
        enabled=rule.enabled,
        priority=rule.priority,
        cooldown_seconds=rule.cooldown_seconds,
        max_executions_per_hour=rule.max_executions_per_hour,
        last_triggered=rule.last_triggered,
        execution_count=exec_count,
        last_execution_success=last_exec.success if last_exec else None,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


# =============================================================================
# Delete Rule
# =============================================================================


@router.delete(
    "/rules/{rule_id}",
    response_model=LogicRuleResponse,
    responses={
        200: {"description": "Rule deleted"},
        404: {"description": "Rule not found"},
    },
    summary="Delete logic rule",
    description="Delete an automation rule.",
)
async def delete_rule(
    rule_id: uuid.UUID,
    db: DBSession,
    current_user: OperatorUser,
) -> LogicRuleResponse:
    """
    Delete logic rule.
    
    Args:
        rule_id: Rule ID
        db: Database session
        current_user: Operator or admin user
        
    Returns:
        Deleted rule
    """
    logic_repo = LogicRepository(db)
    
    rule = await logic_repo.get_by_id(rule_id)
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Logic rule {rule_id} not found",
        )
    
    # Delete rule
    await logic_repo.delete(rule_id)
    await db.commit()
    
    logger.info(f"Logic rule deleted: '{rule.name}' (ID: {rule.id}) by {current_user.username}")
    
    return LogicRuleResponse(
        id=rule.id,
        name=rule.name,
        description=rule.description,
        conditions=rule.conditions,
        actions=rule.actions,
        logic_operator=rule.logic_operator,
        enabled=rule.enabled,
        priority=rule.priority,
        cooldown_seconds=rule.cooldown_seconds,
        max_executions_per_hour=rule.max_executions_per_hour,
        last_triggered=rule.last_triggered,
        execution_count=0,
        last_execution_success=None,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


# =============================================================================
# Toggle Rule
# =============================================================================


@router.post(
    "/rules/{rule_id}/toggle",
    response_model=RuleToggleResponse,
    responses={
        200: {"description": "Rule toggled"},
        404: {"description": "Rule not found"},
    },
    summary="Toggle rule enabled/disabled",
    description="Enable or disable a rule.",
)
async def toggle_rule(
    rule_id: uuid.UUID,
    request: RuleToggleRequest,
    db: DBSession,
    current_user: OperatorUser,
) -> RuleToggleResponse:
    """
    Toggle rule enabled state.
    
    Args:
        rule_id: Rule ID
        request: Toggle request
        db: Database session
        current_user: Operator or admin user
        
    Returns:
        Toggle response
    """
    logic_repo = LogicRepository(db)
    
    rule = await logic_repo.get_by_id(rule_id)
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Logic rule {rule_id} not found",
        )
    
    previous_state = rule.enabled
    rule.enabled = request.enabled
    
    await db.flush()
    await db.commit()
    
    action = "enabled" if request.enabled else "disabled"
    logger.info(
        f"Logic rule {action}: '{rule.name}' (ID: {rule.id}) by {current_user.username}"
        + (f" - Reason: {request.reason}" if request.reason else "")
    )
    
    return RuleToggleResponse(
        success=True,
        message=f"Rule '{rule.name}' {action}",
        rule_id=rule.id,
        rule_name=rule.name,
        enabled=rule.enabled,
        previous_state=previous_state,
    )


# =============================================================================
# Test Rule
# =============================================================================


@router.post(
    "/rules/{rule_id}/test",
    response_model=RuleTestResponse,
    responses={
        200: {"description": "Test completed"},
        404: {"description": "Rule not found"},
    },
    summary="Test/simulate rule",
    description="Simulate rule execution with mock data.",
)
async def test_rule(
    rule_id: uuid.UUID,
    request: RuleTestRequest,
    db: DBSession,
    current_user: OperatorUser,
) -> RuleTestResponse:
    """
    Test/simulate rule execution.
    
    Args:
        rule_id: Rule ID
        request: Test parameters
        db: Database session
        current_user: Operator or admin user
        
    Returns:
        Test results
    """
    logic_repo = LogicRepository(db)
    
    rule = await logic_repo.get_by_id(rule_id)
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Logic rule {rule_id} not found",
        )
    
    # Evaluate conditions with mock data
    condition_results = []
    all_conditions_met = True
    
    for idx, condition in enumerate(rule.conditions):
        cond_type = condition.get("type", "unknown")
        result = False
        details = ""
        actual_value = None
        
        if cond_type == "sensor":
            esp_id = condition.get("esp_id", "")
            gpio = condition.get("gpio", 0)
            operator = condition.get("operator", "==")
            threshold = condition.get("value", 0)
            
            # Get mock value or actual value
            mock_key = f"{esp_id}:{gpio}"
            if request.mock_sensor_values and mock_key in request.mock_sensor_values:
                actual_value = request.mock_sensor_values[mock_key]
            else:
                actual_value = 0  # Would get from DB
            
            # Evaluate
            if operator == ">":
                result = actual_value > threshold
            elif operator == "<":
                result = actual_value < threshold
            elif operator == ">=":
                result = actual_value >= threshold
            elif operator == "<=":
                result = actual_value <= threshold
            elif operator == "==":
                result = actual_value == threshold
            elif operator == "!=":
                result = actual_value != threshold
            
            details = f"{esp_id}:{gpio} ({actual_value}) {operator} {threshold}"
            
        elif cond_type == "time":
            start_time = condition.get("start_time", "00:00")
            end_time = condition.get("end_time", "23:59")
            
            # Use mock time or current time
            if request.mock_time:
                current_time = request.mock_time
            else:
                current_time = datetime.now().strftime("%H:%M")
            
            result = start_time <= current_time <= end_time
            details = f"Time {current_time} in [{start_time}, {end_time}]"
        
        if not result:
            all_conditions_met = False
        
        condition_results.append(ConditionResult(
            condition_index=idx,
            condition_type=cond_type,
            result=result,
            details=details,
            actual_value=actual_value,
        ))
    
    # Check logic operator
    if rule.logic_operator == "OR":
        would_trigger = any(c.result for c in condition_results)
    else:  # AND
        would_trigger = all_conditions_met
    
    # Evaluate actions (dry run)
    action_results = []
    if would_trigger:
        for idx, action in enumerate(rule.actions):
            action_type = action.get("type", "unknown")
            details = ""
            
            if action_type == "actuator":
                esp_id = action.get("esp_id", "")
                gpio = action.get("gpio", 0)
                command = action.get("command", "OFF")
                details = f"{esp_id}:{gpio} {command}"
            elif action_type == "notification":
                channel = action.get("channel", "")
                details = f"Notify via {channel}"
            elif action_type == "delay":
                seconds = action.get("seconds", 0)
                details = f"Wait {seconds}s"
            
            action_results.append(ActionResult(
                action_index=idx,
                action_type=action_type,
                would_execute=True,
                details=details,
                dry_run=request.dry_run,
            ))
    
    logger.info(
        f"Logic rule tested: '{rule.name}' (ID: {rule.id}) by {current_user.username} - "
        f"Would trigger: {would_trigger}, Dry run: {request.dry_run}"
    )
    
    return RuleTestResponse(
        success=True,
        rule_id=rule.id,
        rule_name=rule.name,
        would_trigger=would_trigger,
        condition_results=condition_results,
        action_results=action_results,
        dry_run=request.dry_run,
    )


# =============================================================================
# Execution History
# =============================================================================


@router.get(
    "/execution_history",
    response_model=ExecutionHistoryResponse,
    summary="Get execution history",
    description="Query rule execution history.",
)
async def get_execution_history(
    db: DBSession,
    current_user: ActiveUser,
    rule_id: Annotated[Optional[uuid.UUID], Query(description="Filter by rule ID")] = None,
    success: Annotated[Optional[bool], Query(description="Filter by success")] = None,
    start_time: Annotated[Optional[datetime], Query(description="Start of time range")] = None,
    end_time: Annotated[Optional[datetime], Query(description="End of time range")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> ExecutionHistoryResponse:
    """
    Get rule execution history.
    
    Args:
        db: Database session
        current_user: Authenticated user
        rule_id: Optional rule filter
        success: Optional success filter
        start_time: Start of time range
        end_time: End of time range
        limit: Max results
        
    Returns:
        Execution history
    """
    logic_repo = LogicRepository(db)
    
    # Default time range
    if not start_time:
        start_time = datetime.now(timezone.utc) - timedelta(days=7)
    if not end_time:
        end_time = datetime.now(timezone.utc)
    
    # Get history
    history = await logic_repo.get_execution_history(
        rule_id=rule_id,
        success=success,
        start_time=start_time,
        end_time=end_time,
        limit=limit,
    )
    
    # Convert to response
    entries = []
    success_count = 0
    for entry in history:
        rule = await logic_repo.get_by_id(entry.logic_rule_id)
        rule_name = rule.rule_name if rule else "Unknown"
        
        # Extract trigger reason from trigger_data
        trigger_reason = "Unknown trigger"
        if entry.trigger_data:
            trigger_reason = str(entry.trigger_data.get("reason", entry.trigger_data))
        
        entries.append(ExecutionHistoryEntry(
            id=entry.id,
            rule_id=entry.logic_rule_id,
            rule_name=rule_name,
            triggered_at=entry.timestamp,
            trigger_reason=trigger_reason,
            actions_executed=entry.actions_executed or [],
            success=entry.success,
            error_message=entry.error_message,
            execution_time_ms=entry.execution_time_ms,
        ))
        
        if entry.success:
            success_count += 1
    
    success_rate = success_count / len(entries) if entries else None
    
    return ExecutionHistoryResponse(
        success=True,
        entries=entries,
        total_count=len(entries),
        success_rate=success_rate,
    )
