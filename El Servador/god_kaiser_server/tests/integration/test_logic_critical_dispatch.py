"""
Integration Tests: AUT-127 — Rule-Dispatch / Degraded / Alarm-Kette

Contract-Matrix AUT-127 (Dispatch/Alarm/Degraded):

| Pfad                 | Trigger                                | Aktion                    | WS-Event          | DB-Update              |
|----------------------|----------------------------------------|---------------------------|-------------------|------------------------|
| Dispatch-OK          | is_online=True, config_pending=False   | actuator_service.send_cmd | -                 | -                      |
| Degraded-Enter       | is_critical=True, is_online=False      | _enter_degraded_state     | rule_degraded     | degraded_since set     |
| Degraded-Skip        | is_critical=False, is_online=False     | skip (no degraded)        | -                 | -                      |
| Degraded-Recovery    | is_online=True (nach degraded)         | _exit_degraded_state      | rule_recovered    | degraded_since=None    |
| Conflict-Arbitration | priority override                      | ConflictManager.acquire   | conflict.arbitr.  | -                      |

Scope: Nur _execute_actions + _enter_/_exit_degraded_state + ConflictManager.acquire.
       Kein AUT-110-Code (Alarm-Emission als eigenes Ereignis ist separates offenes Issue).
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.services.logic_engine import LogicEngine
from src.services.actuator_service import ActuatorSendCommandResult

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_TARGET_ESP_ID = "ESP_CRITICAL_TARGET"
_TARGET_GPIO = 5
_RULE_NAME_CRITICAL = "CriticalPumpRule"
_RULE_NAME_NON_CRITICAL = "NonCriticalFanRule"

_MOCK_SEND_OK = ActuatorSendCommandResult(
    success=True,
    correlation_id="00000000-0000-4000-8000-000000000001",
    command_sent=True,
    safety_warnings=[],
)

# ---------------------------------------------------------------------------
# Shared Helpers
# ---------------------------------------------------------------------------


def _make_engine() -> LogicEngine:
    """Build a LogicEngine with all dependencies mocked."""
    logic_repo = AsyncMock()
    actuator_service = AsyncMock()
    actuator_service.send_command = AsyncMock(return_value=_MOCK_SEND_OK)
    ws_manager = AsyncMock()
    ws_manager.broadcast = AsyncMock()
    return LogicEngine(
        logic_repo=logic_repo,
        actuator_service=actuator_service,
        websocket_manager=ws_manager,
    )


def _make_session(*, is_online: bool, config_pending: bool = False) -> MagicMock:
    """Build a mock AsyncSession that returns an ESP with the given online state.

    The session is reused for both the pre-check (ESPRepository) and for
    _enter_degraded_state / _exit_degraded_state (CrossESPLogic lookup).
    We keep the session stateless here; degraded-state tests inject their own
    rule mock via side_effect on session.execute.
    """
    session = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()

    esp = MagicMock()
    esp.is_online = is_online
    esp.config_pending = config_pending

    exec_result = MagicMock()
    exec_result.scalar_one_or_none.return_value = esp
    session.execute = AsyncMock(return_value=exec_result)
    return session


def _make_session_with_rule(
    *,
    is_online: bool,
    config_pending: bool = False,
    is_critical: bool = True,
    degraded_since: datetime | None = None,
) -> MagicMock:
    """Session whose execute() returns the ESP on first call, rule on subsequent calls.

    This covers _execute_actions (reads ESP) followed by _enter_degraded_state
    or _exit_degraded_state (reads CrossESPLogic).
    """
    session = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()

    esp = MagicMock()
    esp.is_online = is_online
    esp.config_pending = config_pending

    rule_mock = MagicMock()
    rule_mock.is_critical = is_critical
    rule_mock.degraded_since = degraded_since
    rule_mock.degraded_reason = None
    rule_mock.escalation_policy = None

    esp_result = MagicMock()
    esp_result.scalar_one_or_none.return_value = esp

    rule_result = MagicMock()
    rule_result.scalar_one_or_none.return_value = rule_mock

    # First call: ESP lookup; subsequent calls: rule lookup
    session.execute = AsyncMock(side_effect=[esp_result, rule_result])
    return session, rule_mock


def _trigger_data() -> dict:
    return {
        "esp_id": "ESP_SENSOR_SRC",
        "gpio": 34,
        "sensor_type": "ph",
        "value": 4.5,
        "timestamp": int(datetime.now(timezone.utc).timestamp()),
    }


def _actuator_action(esp_id: str = _TARGET_ESP_ID, gpio: int = _TARGET_GPIO) -> dict:
    return {
        "type": "actuator_command",
        "esp_id": esp_id,
        "gpio": gpio,
        "command": "ON",
        "value": 1.0,
    }


# ---------------------------------------------------------------------------
# Test Cases
# ---------------------------------------------------------------------------


class TestCriticalDispatchDegradedEnter:
    """Dispatch-path: critical rule + offline ESP -> degraded state entered."""

    @pytest.mark.asyncio
    async def test_critical_rule_offline_esp_enters_degraded(self):
        """is_critical=True, ESP offline -> rule_degraded broadcast + degraded_since set."""
        engine = _make_engine()
        rule_id = uuid.uuid4()

        session, rule_mock = _make_session_with_rule(
            is_online=False,
            is_critical=True,
            degraded_since=None,
        )

        with patch(
            "src.services.logic_engine.get_state_adoption_service"
        ) as mock_adoption_factory:
            adoption_svc = AsyncMock()
            adoption_svc.is_adoption_completed = AsyncMock(return_value=True)
            mock_adoption_factory.return_value = adoption_svc

            await engine._execute_actions(
                actions=[_actuator_action()],
                trigger_data=_trigger_data(),
                rule_id=rule_id,
                rule_name=_RULE_NAME_CRITICAL,
                session=session,
            )

        # degraded_since must be set on the rule object
        assert rule_mock.degraded_since is not None

        # rule_degraded must have been broadcast exactly once
        broadcast_calls = engine.websocket_manager.broadcast.call_args_list
        rule_degraded_calls = [c for c in broadcast_calls if c.args[0] == "rule_degraded"]
        assert len(rule_degraded_calls) == 1, (
            f"Expected exactly 1 rule_degraded broadcast, got {len(rule_degraded_calls)}"
        )
        payload = rule_degraded_calls[0].args[1]
        assert payload["rule_id"] == str(rule_id)
        assert _TARGET_ESP_ID in payload["degraded_reason"]

    @pytest.mark.asyncio
    async def test_non_critical_rule_offline_esp_no_degraded(self):
        """is_critical=False, ESP offline -> no rule_degraded broadcast."""
        engine = _make_engine()
        rule_id = uuid.uuid4()

        # For non-critical: _enter_degraded_state returns early (no rule fetch needed),
        # but the session still needs to handle the ESP lookup call.
        session, rule_mock = _make_session_with_rule(
            is_online=False,
            is_critical=False,
            degraded_since=None,
        )

        with patch(
            "src.services.logic_engine.get_state_adoption_service"
        ) as mock_adoption_factory:
            adoption_svc = AsyncMock()
            adoption_svc.is_adoption_completed = AsyncMock(return_value=True)
            mock_adoption_factory.return_value = adoption_svc

            await engine._execute_actions(
                actions=[_actuator_action()],
                trigger_data=_trigger_data(),
                rule_id=rule_id,
                rule_name=_RULE_NAME_NON_CRITICAL,
                session=session,
            )

        broadcast_calls = engine.websocket_manager.broadcast.call_args_list
        rule_degraded_calls = [c for c in broadcast_calls if c.args[0] == "rule_degraded"]
        assert len(rule_degraded_calls) == 0, (
            "Non-critical rule must not trigger rule_degraded broadcast"
        )


class TestCriticalDispatchDegradedRecovery:
    """Dispatch-path: critical rule already degraded, ESP comes back online -> recovery."""

    @pytest.mark.asyncio
    async def test_critical_rule_recovery_on_online_esp(self):
        """rule already degraded, ESP now online -> rule_recovered broadcast, degraded_since=None."""
        engine = _make_engine()
        rule_id = uuid.uuid4()

        degraded_at = datetime(2026, 1, 10, 8, 0, 0, tzinfo=timezone.utc)

        # Build session: ESP online + not config_pending
        # _execute_actions will also call _exit_degraded_state after seeing ESP is online
        session = MagicMock()
        session.flush = AsyncMock()
        session.commit = AsyncMock()
        session.rollback = AsyncMock()

        esp = MagicMock()
        esp.is_online = True
        esp.config_pending = False

        rule_mock = MagicMock()
        rule_mock.degraded_since = degraded_at
        rule_mock.degraded_reason = f"target_esp_offline:{_TARGET_ESP_ID}"

        esp_result = MagicMock()
        esp_result.scalar_one_or_none.return_value = esp

        rule_result = MagicMock()
        rule_result.scalar_one_or_none.return_value = rule_mock

        # Executor result for the action (ESP is online, action will execute)
        action_exec_result = MagicMock()
        action_exec_result.success = True
        action_exec_result.message = "ok"
        action_exec_result.data = {"noop": False}

        # execute is called multiple times: ESP check, then rule fetch for _exit_degraded_state
        session.execute = AsyncMock(side_effect=[esp_result, rule_result])

        with patch(
            "src.services.logic_engine.get_state_adoption_service"
        ) as mock_adoption_factory:
            adoption_svc = AsyncMock()
            adoption_svc.is_adoption_completed = AsyncMock(return_value=True)
            mock_adoption_factory.return_value = adoption_svc

            await engine._execute_actions(
                actions=[_actuator_action()],
                trigger_data=_trigger_data(),
                rule_id=rule_id,
                rule_name=_RULE_NAME_CRITICAL,
                session=session,
            )

        # degraded_since cleared
        assert rule_mock.degraded_since is None

        # rule_recovered broadcast emitted exactly once
        broadcast_calls = engine.websocket_manager.broadcast.call_args_list
        recovered_calls = [c for c in broadcast_calls if c.args[0] == "rule_recovered"]
        assert len(recovered_calls) == 1, (
            f"Expected exactly 1 rule_recovered broadcast, got {len(recovered_calls)}"
        )
        payload = recovered_calls[0].args[1]
        assert payload["rule_id"] == str(rule_id)
        assert payload["was_degraded_reason"] == f"target_esp_offline:{_TARGET_ESP_ID}"


class TestConflictArbitrationBroadcast:
    """Conflict-arbitration path: priority override -> conflict.arbitration WS event."""

    @pytest.mark.asyncio
    async def test_conflict_arbitration_broadcasts_structured_event(self):
        """ConflictManager blocks lower-priority rule -> conflict.arbitration WS-Event."""
        engine = _make_engine()
        rule_id = uuid.uuid4()

        # ConflictManager: first call is has_active_lock_for_rule (returns False),
        # second is acquire_actuator (returns conflict).
        resolution_mock = MagicMock()
        resolution_mock.value = "first_wins"

        conflict_info = MagicMock()
        conflict_info.actuator_key = f"{_TARGET_ESP_ID}:{_TARGET_GPIO}"
        conflict_info.winner_rule_id = "rule-winner-001"
        conflict_info.competing_rules = ["rule-winner-001", str(rule_id)]
        conflict_info.resolution = resolution_mock
        conflict_info.message = "Conflict: first_wins"
        conflict_info.trace_id = "trace-aut-127"

        engine.conflict_manager.has_active_lock_for_rule = MagicMock(return_value=False)
        engine.conflict_manager.acquire_actuator = AsyncMock(
            return_value=(False, conflict_info)
        )
        engine.conflict_manager.release_actuator = AsyncMock()

        # _emit_conflict_alert requires a session; keep it minimal
        session = AsyncMock()
        session.execute = AsyncMock(return_value=MagicMock())

        with patch("src.services.logic_engine.NotificationRouter") as mock_router_cls:
            mock_router = AsyncMock()
            mock_router.route = AsyncMock()
            mock_router_cls.return_value = mock_router

            result = await engine._execute_actions(
                actions=[_actuator_action()],
                trigger_data=_trigger_data(),
                rule_id=rule_id,
                rule_name=_RULE_NAME_CRITICAL,
                session=session,
            )

        assert result["blocked_by_conflict"] is True
        assert result["conflict_info"] is not None
        assert result["conflict_info"]["arbitration_mode"] == "first_wins"

        # logic_execution (WS) broadcast for the conflict must have been called
        broadcast_calls = engine.websocket_manager.broadcast.call_args_list
        conflict_broadcast_calls = [
            c for c in broadcast_calls if c.args[0] == "logic_execution"
        ]
        assert len(conflict_broadcast_calls) == 1
        exec_payload = conflict_broadcast_calls[0].args[1]
        assert exec_payload["success"] is False
        assert exec_payload["error_code"] == "conflict_priority_lost"
        # Structured conflict metadata present
        assert "conflict" in exec_payload
        assert exec_payload["conflict"]["arbitration_mode"] == "first_wins"
