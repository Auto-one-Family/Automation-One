from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.mqtt.handlers.intent_outcome_handler import IntentOutcomeHandler


@pytest.mark.asyncio
async def test_stale_intent_outcome_is_acknowledged_without_audit():
    handler = IntentOutcomeHandler()
    payload = {
        "intent_id": "intent-1",
        "correlation_id": "corr-1",
        "flow": "command",
        "outcome": "applied",
        "ts": 1735818000,
        "generation": 1,
        "seq": 9,
    }

    session = SimpleNamespace(commit=AsyncMock())
    contract_repo = MagicMock()
    contract_repo.upsert_intent = AsyncMock()
    contract_repo.upsert_outcome = AsyncMock(
        return_value=(SimpleNamespace(outcome="applied", correlation_id="corr-1"), True)
    )
    audit_repo = MagicMock()
    audit_repo.log_device_event = AsyncMock()

    @asynccontextmanager
    async def fake_resilient_session():
        yield session

    with (
        patch(
            "src.mqtt.handlers.intent_outcome_handler.TopicBuilder.parse_intent_outcome_topic",
            return_value={"esp_id": "ESP_01"},
        ),
        patch(
            "src.mqtt.handlers.intent_outcome_handler.resilient_session",
            fake_resilient_session,
        ),
        patch(
            "src.mqtt.handlers.intent_outcome_handler.CommandContractRepository",
            return_value=contract_repo,
        ),
        patch(
            "src.mqtt.handlers.intent_outcome_handler.AuditLogRepository",
            return_value=audit_repo,
        ),
    ):
        result = await handler.handle_intent_outcome(
            "kaiser/god/esp/ESP_01/system/intent_outcome",
            payload,
        )

    assert result is True
    contract_repo.upsert_intent.assert_awaited_once()
    contract_repo.upsert_outcome.assert_awaited_once()
    audit_repo.log_device_event.assert_not_called()
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_intent_outcome_returns_false_when_persistence_fails():
    handler = IntentOutcomeHandler()
    payload = {
        "intent_id": "intent-2",
        "correlation_id": "corr-2",
        "flow": "command",
        "outcome": "failed",
        "ts": 1735818000,
    }

    session = SimpleNamespace(commit=AsyncMock())
    contract_repo = MagicMock()
    contract_repo.upsert_intent = AsyncMock(side_effect=RuntimeError("db unavailable"))

    @asynccontextmanager
    async def fake_resilient_session():
        yield session

    with (
        patch(
            "src.mqtt.handlers.intent_outcome_handler.TopicBuilder.parse_intent_outcome_topic",
            return_value={"esp_id": "ESP_02"},
        ),
        patch(
            "src.mqtt.handlers.intent_outcome_handler.resilient_session",
            fake_resilient_session,
        ),
        patch(
            "src.mqtt.handlers.intent_outcome_handler.CommandContractRepository",
            return_value=contract_repo,
        ),
    ):
        result = await handler.handle_intent_outcome(
            "kaiser/god/esp/ESP_02/system/intent_outcome",
            payload,
        )

    assert result is False


@pytest.mark.asyncio
async def test_legacy_alias_is_canonicalized_before_persistence():
    handler = IntentOutcomeHandler()
    payload = {
        "intent_id": "intent-legacy",
        "correlation_id": "corr-legacy",
        "flow": "cfg",
        "outcome": "processing",
        "ts": 1735818000,
    }

    session = SimpleNamespace(commit=AsyncMock())
    captured_payloads: list[dict] = []

    contract_repo = MagicMock()
    contract_repo.upsert_intent = AsyncMock(
        side_effect=lambda p, esp_id: captured_payloads.append(dict(p))
    )
    contract_repo.upsert_outcome = AsyncMock(
        return_value=(
            SimpleNamespace(
                outcome="accepted",
                correlation_id="corr-legacy",
                flow="config",
                code="COMMAND_ACCEPTED",
                reason="ok",
                retryable=False,
                generation=1,
                seq=1,
                epoch=1,
                ttl_ms=0,
                ts=1735818000,
                contract_version=2,
                semantic_mode="target",
                legacy_status="processing",
                target_status="accepted",
                is_final=False,
                intent_id="intent-legacy",
                esp_id="ESP_10",
                first_seen_at=None,
                terminal_at=None,
            ),
            False,
        )
    )
    audit_repo = MagicMock()
    audit_repo.log_device_event = AsyncMock()

    @asynccontextmanager
    async def fake_resilient_session():
        yield session

    with (
        patch(
            "src.mqtt.handlers.intent_outcome_handler.TopicBuilder.parse_intent_outcome_topic",
            return_value={"esp_id": "ESP_10"},
        ),
        patch(
            "src.mqtt.handlers.intent_outcome_handler.resilient_session",
            fake_resilient_session,
        ),
        patch(
            "src.mqtt.handlers.intent_outcome_handler.CommandContractRepository",
            return_value=contract_repo,
        ),
        patch(
            "src.mqtt.handlers.intent_outcome_handler.AuditLogRepository",
            return_value=audit_repo,
        ),
        patch(
            "src.mqtt.handlers.intent_outcome_handler.WebSocketManager",
            create=True,
        ),
    ):
        result = await handler.handle_intent_outcome(
            "kaiser/god/esp/ESP_10/system/intent_outcome",
            payload,
        )

    assert result is True
    assert captured_payloads
    assert captured_payloads[0]["flow"] == "config"
    assert captured_payloads[0]["outcome"] == "accepted"


@pytest.mark.asyncio
async def test_unknown_outcome_is_not_dropped_and_mapped_to_contract_violation():
    handler = IntentOutcomeHandler()
    payload = {
        "intent_id": "intent-unknown",
        "flow": "command",
        "outcome": "totally_new_state",
        "ts": 1735818000,
    }

    session = SimpleNamespace(commit=AsyncMock())
    captured_payloads: list[dict] = []

    contract_repo = MagicMock()
    contract_repo.upsert_intent = AsyncMock(
        side_effect=lambda p, esp_id: captured_payloads.append(dict(p))
    )
    contract_repo.upsert_outcome = AsyncMock(
        return_value=(
            SimpleNamespace(
                outcome="failed",
                correlation_id="missing-corr:intent-unknown",
                flow="command",
                code="CONTRACT_UNKNOWN_CODE",
                reason="contract violation",
                retryable=False,
                generation=1,
                seq=1,
                epoch=1,
                ttl_ms=0,
                ts=1735818000,
                contract_version=2,
                semantic_mode="target",
                legacy_status="failed",
                target_status="failed",
                is_final=True,
                intent_id="intent-unknown",
                esp_id="ESP_11",
                first_seen_at=None,
                terminal_at=None,
            ),
            False,
        )
    )
    audit_repo = MagicMock()
    audit_repo.log_device_event = AsyncMock()

    @asynccontextmanager
    async def fake_resilient_session():
        yield session

    with (
        patch(
            "src.mqtt.handlers.intent_outcome_handler.TopicBuilder.parse_intent_outcome_topic",
            return_value={"esp_id": "ESP_11"},
        ),
        patch(
            "src.mqtt.handlers.intent_outcome_handler.resilient_session",
            fake_resilient_session,
        ),
        patch(
            "src.mqtt.handlers.intent_outcome_handler.CommandContractRepository",
            return_value=contract_repo,
        ),
        patch(
            "src.mqtt.handlers.intent_outcome_handler.AuditLogRepository",
            return_value=audit_repo,
        ),
        patch(
            "src.mqtt.handlers.intent_outcome_handler.WebSocketManager",
            create=True,
        ),
    ):
        result = await handler.handle_intent_outcome(
            "kaiser/god/esp/ESP_11/system/intent_outcome",
            payload,
        )

    assert result is True
    assert captured_payloads
    assert captured_payloads[0]["code"] == "CONTRACT_UNKNOWN_CODE"
    assert captured_payloads[0]["outcome"] == "failed"
