"""Unit tests for MQTTCommandBridge — ACK-gesteuerte MQTT-Kommunikation."""

import asyncio
import json
from unittest.mock import MagicMock

import pytest

from src.services.mqtt_command_bridge import (
    MQTTACKTimeoutError,
    MQTTCommandBridge,
)


@pytest.fixture
def mock_client():
    """Create a mock MQTTClient."""
    client = MagicMock()
    client.publish.return_value = True
    return client


@pytest.fixture
def bridge(mock_client):
    """Create a MQTTCommandBridge with mock client."""
    return MQTTCommandBridge(mock_client)


# =============================================================================
# Test 1: Success — ACK innerhalb Timeout
# =============================================================================


@pytest.mark.asyncio
async def test_send_and_wait_ack_success(bridge, mock_client):
    """ACK kommt innerhalb Timeout -> Future wird aufgeloest, Return ist ack_data."""

    async def simulate_ack():
        await asyncio.sleep(0.05)
        bridge.resolve_ack(
            ack_data={"status": "zone_assigned", "zone_id": "zone_b"},
            esp_id="ESP_TEST01",
            command_type="zone",
        )

    asyncio.create_task(simulate_ack())
    result = await bridge.send_and_wait_ack(
        topic="kaiser/god/esp/ESP_TEST01/zone/assign",
        payload={"zone_id": "zone_b"},
        esp_id="ESP_TEST01",
        command_type="zone",
        timeout=2.0,
    )

    assert result["status"] == "zone_assigned"
    assert result["zone_id"] == "zone_b"
    assert mock_client.publish.called
    # correlation_id was injected into payload
    published_payload = json.loads(mock_client.publish.call_args[0][1])
    assert "correlation_id" in published_payload


# =============================================================================
# Test 2: Timeout — Kein ACK
# =============================================================================


@pytest.mark.asyncio
async def test_send_and_wait_ack_timeout(bridge):
    """Kein ACK innerhalb Timeout -> MQTTACKTimeoutError."""
    with pytest.raises(MQTTACKTimeoutError):
        await bridge.send_and_wait_ack(
            topic="kaiser/god/esp/ESP_TEST01/zone/assign",
            payload={"zone_id": "zone_b"},
            esp_id="ESP_TEST01",
            timeout=0.1,
        )


# =============================================================================
# Test 3: Publish-Failure
# =============================================================================


@pytest.mark.asyncio
async def test_send_and_wait_ack_publish_failure(mock_client):
    """MQTT Publish schlaegt fehl -> sofort MQTTACKTimeoutError (kein Warten)."""
    mock_client.publish.return_value = False
    bridge = MQTTCommandBridge(mock_client)

    with pytest.raises(MQTTACKTimeoutError, match="publish failed"):
        await bridge.send_and_wait_ack(
            topic="kaiser/god/esp/ESP_TEST01/zone/assign",
            payload={"zone_id": "zone_b"},
            esp_id="ESP_TEST01",
        )


# =============================================================================
# Test 4: Fallback-Matching ohne correlation_id
# =============================================================================


@pytest.mark.asyncio
async def test_resolve_ack_fallback_without_correlation_id(bridge):
    """ACK ohne correlation_id -> Fallback auf (esp_id, command_type) FIFO."""

    async def simulate_ack():
        await asyncio.sleep(0.05)
        # ACK WITHOUT correlation_id (like current firmware)
        bridge.resolve_ack(
            ack_data={"status": "zone_assigned", "zone_id": "zone_b"},
            esp_id="ESP_TEST01",
            command_type="zone",
        )

    asyncio.create_task(simulate_ack())
    result = await bridge.send_and_wait_ack(
        topic="kaiser/god/esp/ESP_TEST01/zone/assign",
        payload={"zone_id": "zone_b"},
        esp_id="ESP_TEST01",
        timeout=2.0,
    )
    assert result["status"] == "zone_assigned"


# =============================================================================
# Test 5: Concurrent — Zwei Commands fuer verschiedene ESPs
# =============================================================================


@pytest.mark.asyncio
async def test_concurrent_different_esps(bridge):
    """Zwei parallele Commands fuer verschiedene ESPs -> beide korrekt aufgeloest."""

    async def simulate_acks():
        await asyncio.sleep(0.05)
        bridge.resolve_ack(
            ack_data={"status": "zone_assigned", "zone_id": "zone_a"},
            esp_id="ESP_01",
            command_type="zone",
        )
        bridge.resolve_ack(
            ack_data={"status": "zone_assigned", "zone_id": "zone_b"},
            esp_id="ESP_02",
            command_type="zone",
        )

    asyncio.create_task(simulate_acks())

    result1, result2 = await asyncio.gather(
        bridge.send_and_wait_ack(
            topic="kaiser/god/esp/ESP_01/zone/assign",
            payload={"zone_id": "zone_a"},
            esp_id="ESP_01",
            timeout=2.0,
        ),
        bridge.send_and_wait_ack(
            topic="kaiser/god/esp/ESP_02/zone/assign",
            payload={"zone_id": "zone_b"},
            esp_id="ESP_02",
            timeout=2.0,
        ),
    )

    assert result1["zone_id"] == "zone_a"
    assert result2["zone_id"] == "zone_b"


# =============================================================================
# Test 6: Error-ACK
# =============================================================================


@pytest.mark.asyncio
async def test_resolve_ack_with_error_status(bridge):
    """ACK mit status=error -> Future wird trotzdem aufgeloest (nicht Timeout)."""

    async def simulate_error_ack():
        await asyncio.sleep(0.05)
        bridge.resolve_ack(
            ack_data={"status": "error", "message": "NVS write failed"},
            esp_id="ESP_TEST01",
            command_type="zone",
        )

    asyncio.create_task(simulate_error_ack())
    result = await bridge.send_and_wait_ack(
        topic="kaiser/god/esp/ESP_TEST01/zone/assign",
        payload={"zone_id": "zone_b"},
        esp_id="ESP_TEST01",
        timeout=2.0,
    )

    assert result["status"] == "error"
    assert result["message"] == "NVS write failed"


# =============================================================================
# Test 7: Cleanup nach Timeout
# =============================================================================


@pytest.mark.asyncio
async def test_cleanup_after_timeout(bridge):
    """Nach Timeout: correlation_id aus _pending und _esp_pending entfernt."""
    with pytest.raises(MQTTACKTimeoutError):
        await bridge.send_and_wait_ack(
            topic="kaiser/god/esp/ESP_TEST01/zone/assign",
            payload={"zone_id": "zone_b"},
            esp_id="ESP_TEST01",
            timeout=0.1,
        )

    # No memory leak
    assert len(bridge._pending) == 0
    assert ("ESP_TEST01", "zone") not in bridge._esp_pending


# =============================================================================
# Test 8: Shutdown cancelt Futures
# =============================================================================


@pytest.mark.asyncio
async def test_shutdown_cancels_pending(bridge):
    """shutdown() cancelt alle pending Futures."""
    # Start a command but don't resolve it
    task = asyncio.create_task(
        bridge.send_and_wait_ack(
            topic="kaiser/god/esp/ESP_TEST01/zone/assign",
            payload={"zone_id": "zone_b"},
            esp_id="ESP_TEST01",
            timeout=60.0,  # Long timeout
        )
    )
    await asyncio.sleep(0.05)  # Let the task start

    # Shutdown should cancel the pending future
    await bridge.shutdown()

    assert len(bridge._pending) == 0
    assert len(bridge._esp_pending) == 0

    # The task should raise CancelledError
    with pytest.raises((asyncio.CancelledError, MQTTACKTimeoutError)):
        await task


# =============================================================================
# Test 9: has_pending()
# =============================================================================


@pytest.mark.asyncio
async def test_has_pending(bridge):
    """has_pending() gibt True zurueck waehrend Command laeuft, False danach."""
    assert bridge.has_pending("ESP_TEST01") is False

    # Start a command
    task = asyncio.create_task(
        bridge.send_and_wait_ack(
            topic="kaiser/god/esp/ESP_TEST01/zone/assign",
            payload={"zone_id": "zone_b"},
            esp_id="ESP_TEST01",
            timeout=5.0,
        )
    )
    await asyncio.sleep(0.05)

    assert bridge.has_pending("ESP_TEST01") is True
    assert bridge.has_pending("ESP_TEST01", "subzone") is False

    # Resolve the ACK
    bridge.resolve_ack(
        ack_data={"status": "zone_assigned", "zone_id": "zone_b"},
        esp_id="ESP_TEST01",
        command_type="zone",
    )
    await task

    assert bridge.has_pending("ESP_TEST01") is False


# =============================================================================
# Test 10: resolve_ack() with exact correlation_id match
# =============================================================================


@pytest.mark.asyncio
async def test_resolve_ack_exact_correlation_id(bridge):
    """resolve_ack() resolves Future when correlation_id matches exactly."""

    async def simulate_ack_with_cid():
        await asyncio.sleep(0.05)
        # Get the correlation_id that was injected by send_and_wait_ack
        pending_cids = list(bridge._pending.keys())
        assert len(pending_cids) == 1
        cid = pending_cids[0]
        bridge.resolve_ack(
            ack_data={
                "status": "zone_assigned",
                "zone_id": "zone_c",
                "correlation_id": cid,
            },
            esp_id="ESP_TEST01",
            command_type="zone",
        )

    asyncio.create_task(simulate_ack_with_cid())
    result = await bridge.send_and_wait_ack(
        topic="kaiser/god/esp/ESP_TEST01/zone/assign",
        payload={"zone_id": "zone_c"},
        esp_id="ESP_TEST01",
        timeout=2.0,
    )

    assert result["status"] == "zone_assigned"
    assert result["zone_id"] == "zone_c"
    assert result["correlation_id"] is not None


# =============================================================================
# Test 11: _is_mock_esp — only MOCK_ prefix matches
# =============================================================================


def test_is_mock_esp_prefix_only():
    """_is_mock_esp() only matches MOCK_ or ESP_MOCK_ prefixes, not substrings."""
    from src.services.zone_service import _is_mock_esp

    # Must be True — mock devices
    assert _is_mock_esp("MOCK_001") is True
    assert _is_mock_esp("ESP_MOCK_001") is True
    assert _is_mock_esp("MOCK_ESP_TEST") is True

    # Must be False — real / Wokwi devices
    assert _is_mock_esp("ESP_472204") is False
    assert _is_mock_esp("ESP_00000001") is False
    assert _is_mock_esp("ESP_AB12CD34") is False
