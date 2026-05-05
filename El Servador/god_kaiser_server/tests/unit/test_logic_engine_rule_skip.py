"""Unit tests for AUT-110: rule_skip notification threshold (B-NRS-01, B-NRS-02)."""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# =============================================================================
# B-NRS-01: Counter increments on target_offline
# =============================================================================


class TestRuleSkipCounter:
    """B-NRS-01: increment_rule_skip_target_offline called with correct labels."""

    def test_counter_increments_on_target_offline(self):
        """increment_rule_skip_target_offline increments labeled counter."""
        from src.core.metrics import increment_rule_skip_target_offline

        with patch("src.core.metrics.RULE_SKIP_TARGET_OFFLINE_TOTAL") as mock_counter:
            mock_labels = MagicMock()
            mock_counter.labels.return_value = mock_labels

            increment_rule_skip_target_offline("rule-1", "ESP_EA5484", "night")

            mock_counter.labels.assert_called_once_with(
                rule_id="rule-1", esp_id="ESP_EA5484", time_window="night"
            )
            mock_labels.inc.assert_called_once()

    def test_counter_uses_unknown_as_default_time_window(self):
        """Default time_window is 'unknown' when not specified."""
        from src.core.metrics import increment_rule_skip_target_offline

        with patch("src.core.metrics.RULE_SKIP_TARGET_OFFLINE_TOTAL") as mock_counter:
            mock_labels = MagicMock()
            mock_counter.labels.return_value = mock_labels

            increment_rule_skip_target_offline("rule-2", "ESP_001122")

            mock_counter.labels.assert_called_once_with(
                rule_id="rule-2", esp_id="ESP_001122", time_window="unknown"
            )
            mock_labels.inc.assert_called_once()

    def test_counter_metric_exists(self):
        """RULE_SKIP_TARGET_OFFLINE_TOTAL metric object is importable."""
        from src.core.metrics import RULE_SKIP_TARGET_OFFLINE_TOTAL

        assert RULE_SKIP_TARGET_OFFLINE_TOTAL is not None


# =============================================================================
# B-NRS-02: exactly one notification per offline cycle after threshold
# =============================================================================


class TestSingleNotificationPerOfflineCycle:
    """B-NRS-02: exactly one notification per offline cycle after threshold."""

    @pytest.fixture
    def engine(self):
        from src.services.logic_engine import LogicEngine

        repo = AsyncMock()
        actuator = AsyncMock()
        ws = AsyncMock()
        return LogicEngine(
            logic_repo=repo,
            actuator_service=actuator,
            websocket_manager=ws,
        )

    def _make_session_with_rule(self, rule_mock):
        """Build an AsyncMock session that returns rule_mock on execute."""
        session = AsyncMock()
        exec_result = MagicMock()
        exec_result.scalar_one_or_none.return_value = rule_mock
        session.execute = AsyncMock(return_value=exec_result)
        return session

    def _make_critical_rule(self, degraded_since: datetime):
        """Create a MagicMock CrossESPLogic in critical+degraded state."""
        rule = MagicMock()
        rule.id = uuid.uuid4()
        rule.is_critical = True
        rule.degraded_since = degraded_since
        rule.degraded_reason = "target_esp_offline:ESP_TEST"
        rule.escalation_policy = None
        return rule

    @pytest.mark.asyncio
    async def test_no_notification_before_threshold(self, engine):
        """No notification routed when degraded_since < 10 minutes ago."""
        degraded_since = datetime.now(timezone.utc) - timedelta(minutes=5)
        rule = self._make_critical_rule(degraded_since)
        session = self._make_session_with_rule(rule)

        with patch("src.services.logic_engine.NotificationRouter") as mock_router_cls:
            mock_router = AsyncMock()
            mock_router_cls.return_value = mock_router

            await engine._enter_degraded_state(
                rule.id, "NachtRegel", "target_esp_offline:ESP_TEST", session
            )

            mock_router.route.assert_not_called()

    @pytest.mark.asyncio
    async def test_notification_routed_after_threshold(self, engine):
        """Exactly one notification routed when degraded_since >= 10 minutes ago."""
        degraded_since = datetime.now(timezone.utc) - timedelta(minutes=11)
        rule = self._make_critical_rule(degraded_since)
        session = self._make_session_with_rule(rule)

        with patch("src.services.logic_engine.NotificationRouter") as mock_router_cls:
            mock_router = AsyncMock()
            mock_router_cls.return_value = mock_router

            await engine._enter_degraded_state(
                rule.id, "NachtRegel", "target_esp_offline:ESP_TEST", session
            )

            mock_router.route.assert_called_once()
            call_args = mock_router.route.call_args
            notif = call_args[0][0]
            assert notif.severity == "critical"
            assert notif.source == "logic_engine"
            assert notif.category == "connectivity"
            assert "NachtRegel" in notif.title
            assert notif.metadata["rule_name"] == "NachtRegel"

    @pytest.mark.asyncio
    async def test_notification_not_routed_for_non_critical_rule(self, engine):
        """Non-critical rules never trigger a notification."""
        rule = MagicMock()
        rule.id = uuid.uuid4()
        rule.is_critical = False
        rule.degraded_since = None
        session = self._make_session_with_rule(rule)

        with patch("src.services.logic_engine.NotificationRouter") as mock_router_cls:
            mock_router = AsyncMock()
            mock_router_cls.return_value = mock_router

            await engine._enter_degraded_state(
                rule.id, "NonCritical", "target_esp_offline:ESP_TEST", session
            )

            mock_router.route.assert_not_called()

    @pytest.mark.asyncio
    async def test_first_entry_does_not_route_notification(self, engine):
        """On first degraded entry (degraded_since is None), no notification is routed.

        The WS broadcast happens, but notification routing only occurs after
        the threshold is exceeded in subsequent calls.
        """
        rule = MagicMock()
        rule.id = uuid.uuid4()
        rule.is_critical = True
        rule.degraded_since = None
        rule.degraded_reason = None
        rule.escalation_policy = None
        session = self._make_session_with_rule(rule)

        with patch("src.services.logic_engine.NotificationRouter") as mock_router_cls:
            mock_router = AsyncMock()
            mock_router_cls.return_value = mock_router

            await engine._enter_degraded_state(
                rule.id, "NachtRegel", "target_esp_offline:ESP_TEST", session
            )

            # WS broadcast should have fired
            engine.websocket_manager.broadcast.assert_called_once()
            # But notification router should NOT have been called yet
            mock_router.route.assert_not_called()

    @pytest.mark.asyncio
    async def test_notification_failure_does_not_propagate(self, engine):
        """A routing exception in _emit_degraded_notification is caught gracefully."""
        degraded_since = datetime.now(timezone.utc) - timedelta(minutes=15)
        rule = self._make_critical_rule(degraded_since)
        session = self._make_session_with_rule(rule)

        with patch("src.services.logic_engine.NotificationRouter") as mock_router_cls:
            mock_router = AsyncMock()
            mock_router.route.side_effect = Exception("DB connection lost")
            mock_router_cls.return_value = mock_router

            # Must NOT raise — graceful degradation
            await engine._enter_degraded_state(
                rule.id, "NachtRegel", "target_esp_offline:ESP_TEST", session
            )

            mock_router.route.assert_called_once()

    @pytest.mark.asyncio
    async def test_emit_degraded_notification_uses_session(self, engine):
        """_emit_degraded_notification passes session to NotificationRouter."""
        degraded_since = datetime.now(timezone.utc) - timedelta(minutes=12)
        rule = self._make_critical_rule(degraded_since)
        session = MagicMock()

        with patch("src.services.logic_engine.NotificationRouter") as mock_router_cls:
            mock_router = AsyncMock()
            mock_router_cls.return_value = mock_router

            await engine._emit_degraded_notification(rule, "TestRule", "target_esp_offline:X", session)

            mock_router_cls.assert_called_once_with(session)
            mock_router.route.assert_called_once()
