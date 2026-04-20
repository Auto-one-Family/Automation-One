"""AUT-69 unit tests for heartbeat handler counter split."""

import time
from datetime import datetime, timezone

from src.mqtt.handlers.heartbeat_handler import HeartbeatHandler
from src.schemas.esp import SessionAnnouncePayload


def test_reject_within_startup_window_increments_startup_counter() -> None:
    handler = HeartbeatHandler()
    esp_id = "ESP_AUT69_STARTUP"
    handler._last_session_connected_ts_by_esp[esp_id] = time.monotonic()
    payload = {
        "handover_contract_reject_count": 1,
        "handover_contract_last_reject": "MISSING_ACTIVE_SESSION_EPOCH",
    }
    metadata: dict = {}

    handler._track_contract_reject_metrics(esp_id, payload, metadata)

    assert metadata["handover_contract_reject_startup"] == 1
    assert metadata["handover_contract_reject_runtime"] == 0
    assert metadata["handover_contract_reject"] == 1


def test_reject_after_startup_window_increments_runtime_counter() -> None:
    handler = HeartbeatHandler()
    esp_id = "ESP_AUT69_RUNTIME"
    handler._last_session_connected_ts_by_esp[esp_id] = time.monotonic() - 1.5
    payload = {
        "handover_contract_reject_count": 2,
        "handover_contract_last_reject": "MISSING_ACTIVE_SESSION_EPOCH",
    }
    metadata = {
        "handover_contract_reject_count_last": 1,
        "handover_contract_reject_startup": 1,
        "handover_contract_reject_runtime": 0,
    }

    handler._track_contract_reject_metrics(esp_id, payload, metadata)

    assert metadata["handover_contract_reject_startup"] == 1
    assert metadata["handover_contract_reject_runtime"] == 1
    assert metadata["handover_contract_reject"] == 2


def test_payload_without_new_fields_keeps_backward_compatibility() -> None:
    handler = HeartbeatHandler()
    metadata = {"stable_key": "stable_value"}
    payload = {"ts": int(datetime.now(timezone.utc).timestamp())}

    handler._track_contract_reject_metrics("ESP_AUT69_COMPAT", payload, metadata)

    assert metadata == {"stable_key": "stable_value"}


def test_alias_mapping_accepts_both_handover_and_session_epoch() -> None:
    from_handover = SessionAnnouncePayload.from_payload(
        {"handover_epoch": 5, "reason": "reconnect", "ts_ms": 1000}
    )
    from_session = SessionAnnouncePayload.from_payload(
        {"session_epoch": 6, "reason": "boot", "ts_ms": 2000}
    )

    assert from_handover.handover_epoch == 5
    assert from_session.handover_epoch == 6
