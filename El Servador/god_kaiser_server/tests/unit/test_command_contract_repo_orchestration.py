"""Unit tests: command_intents orchestration_state (sent vs inbound intent_outcome)."""

import json
from unittest.mock import MagicMock

import pytest
from sqlalchemy import select

from src.db.models.command_contract import CommandIntent
from src.db.repositories.command_contract_repo import CommandContractRepository
from src.mqtt.publisher import Publisher


def test_publish_actuator_command_payload_includes_intent_id_with_correlation():
    client = MagicMock()
    client.publish.return_value = True
    pub = Publisher(mqtt_client=client)
    pub.publish_actuator_command("ESP_1", 4, "ON", 1.0, correlation_id="cid-99")
    _topic, payload_str, _qos = client.publish.call_args[0]
    payload = json.loads(payload_str)
    assert payload["correlation_id"] == "cid-99"
    assert payload["intent_id"] == "cid-99"


@pytest.mark.asyncio
async def test_record_intent_publish_sent_inserts_sent(db_session):
    repo = CommandContractRepository(db_session)
    row = await repo.record_intent_publish_sent(
        intent_id="corr-uuid-1",
        correlation_id="corr-uuid-1",
        esp_id="ESP_X",
        flow="command",
    )
    assert row.orchestration_state == "sent"
    assert row.intent_id == "corr-uuid-1"
    await db_session.commit()

    result = await db_session.execute(
        select(CommandIntent).where(CommandIntent.intent_id == "corr-uuid-1")
    )
    loaded = result.scalar_one()
    assert loaded.orchestration_state == "sent"


@pytest.mark.asyncio
async def test_upsert_intent_after_sent_moves_to_accepted(db_session):
    repo = CommandContractRepository(db_session)
    await repo.record_intent_publish_sent(
        intent_id="intent-a",
        correlation_id="intent-a",
        esp_id="ESP_X",
        flow="command",
    )
    await repo.upsert_intent(
        {
            "intent_id": "intent-a",
            "correlation_id": "intent-a",
            "flow": "command",
            "outcome": "accepted",
            "ts": 1735818000,
        },
        esp_id="ESP_X",
    )
    await db_session.commit()

    result = await db_session.execute(select(CommandIntent).where(CommandIntent.intent_id == "intent-a"))
    assert result.scalar_one().orchestration_state == "accepted"


@pytest.mark.asyncio
async def test_record_sent_does_not_downgrade_ack_pending(db_session):
    repo = CommandContractRepository(db_session)
    await repo.upsert_intent(
        {
            "intent_id": "intent-b",
            "correlation_id": "c-b",
            "flow": "command",
            "outcome": "applied",
            "ts": 1735818000,
        },
        esp_id="ESP_X",
    )
    assert (await db_session.execute(select(CommandIntent).where(CommandIntent.intent_id == "intent-b"))).scalar_one().orchestration_state == "ack_pending"

    await repo.record_intent_publish_sent(
        intent_id="intent-b",
        correlation_id="c-b",
        esp_id="ESP_X",
        flow="command",
    )
    await db_session.commit()

    result = await db_session.execute(select(CommandIntent).where(CommandIntent.intent_id == "intent-b"))
    assert result.scalar_one().orchestration_state == "ack_pending"
