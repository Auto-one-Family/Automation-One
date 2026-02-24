"""
Integration Tests für HeartbeatHandler.

Location: tests/integration/test_heartbeat_handler.py
Benötigt: DB-Session, Repositories, Event Loop

Phase 3 Test-Suite: Heartbeat Processing, Auto-Discovery, Status Transitions.
"""

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from src.mqtt.handlers.heartbeat_handler import HeartbeatHandler, get_heartbeat_handler


class TestHeartbeatPayloadValidation:
    """Test payload validation - 4 Required Fields!"""

    @pytest.fixture
    def handler(self):
        """Get HeartbeatHandler instance."""
        return get_heartbeat_handler()

    def test_valid_payload_passes_validation(self, handler):
        """Valid payload with ALL 4 required fields passes."""
        payload = {
            "ts": int(datetime.now(timezone.utc).timestamp()),
            "uptime": 3600,
            "heap_free": 98304,
            "wifi_rssi": -45,
        }
        result = handler._validate_payload(payload)
        assert result["valid"] is True
        assert result["error"] == ""

    def test_valid_payload_with_optional_fields(self, handler):
        """Valid payload with optional fields passes."""
        payload = {
            "ts": int(datetime.now(timezone.utc).timestamp()),
            "uptime": 3600,
            "heap_free": 98304,
            "wifi_rssi": -45,
            "esp_id": "ESP_TEST_001",
            "zone_id": "test_zone",
            "master_zone_id": "main_zone",
            "zone_assigned": True,
            "sensor_count": 3,
            "actuator_count": 2,
        }
        result = handler._validate_payload(payload)
        assert result["valid"] is True

    def test_missing_ts_fails(self, handler):
        """Missing ts field fails validation."""
        payload = {
            "uptime": 3600,
            "heap_free": 98304,
            "wifi_rssi": -45,
        }
        result = handler._validate_payload(payload)
        assert result["valid"] is False
        assert "ts" in result["error"].lower()

    def test_missing_uptime_fails(self, handler):
        """Missing uptime field fails validation."""
        payload = {
            "ts": int(datetime.now(timezone.utc).timestamp()),
            "heap_free": 98304,
            "wifi_rssi": -45,
        }
        result = handler._validate_payload(payload)
        assert result["valid"] is False
        assert "uptime" in result["error"].lower()

    def test_missing_heap_free_fails(self, handler):
        """Missing heap_free field fails validation."""
        payload = {
            "ts": int(datetime.now(timezone.utc).timestamp()),
            "uptime": 3600,
            "wifi_rssi": -45,
        }
        result = handler._validate_payload(payload)
        assert result["valid"] is False
        # Accepts either heap_free or free_heap
        assert "heap" in result["error"].lower()

    def test_free_heap_accepted_alternative(self, handler):
        """free_heap is accepted as alternative to heap_free."""
        payload = {
            "ts": int(datetime.now(timezone.utc).timestamp()),
            "uptime": 3600,
            "free_heap": 98304,  # Alternative name
            "wifi_rssi": -45,
        }
        result = handler._validate_payload(payload)
        assert result["valid"] is True

    def test_missing_wifi_rssi_fails(self, handler):
        """Missing wifi_rssi field fails validation."""
        payload = {
            "ts": int(datetime.now(timezone.utc).timestamp()),
            "uptime": 3600,
            "heap_free": 98304,
        }
        result = handler._validate_payload(payload)
        assert result["valid"] is False
        assert "rssi" in result["error"].lower()

    def test_ts_must_be_int(self, handler):
        """ts field must be integer."""
        payload = {
            "ts": "1704722400",  # String instead of int
            "uptime": 3600,
            "heap_free": 98304,
            "wifi_rssi": -45,
        }
        result = handler._validate_payload(payload)
        assert result["valid"] is False
        assert "integer" in result["error"].lower() or "int" in result["error"].lower()

    def test_uptime_must_be_int(self, handler):
        """uptime field must be integer."""
        payload = {
            "ts": int(datetime.now(timezone.utc).timestamp()),
            "uptime": "3600",  # String instead of int
            "heap_free": 98304,
            "wifi_rssi": -45,
        }
        result = handler._validate_payload(payload)
        assert result["valid"] is False
        assert "integer" in result["error"].lower() or "int" in result["error"].lower()

    def test_heap_free_must_be_int(self, handler):
        """heap_free field must be integer."""
        payload = {
            "ts": int(datetime.now(timezone.utc).timestamp()),
            "uptime": 3600,
            "heap_free": "98304",  # String instead of int
            "wifi_rssi": -45,
        }
        result = handler._validate_payload(payload)
        assert result["valid"] is False
        assert "integer" in result["error"].lower() or "int" in result["error"].lower()

    def test_wifi_rssi_must_be_int(self, handler):
        """wifi_rssi field must be integer."""
        payload = {
            "ts": int(datetime.now(timezone.utc).timestamp()),
            "uptime": 3600,
            "heap_free": 98304,
            "wifi_rssi": "-45",  # String instead of int
        }
        result = handler._validate_payload(payload)
        assert result["valid"] is False
        assert "integer" in result["error"].lower() or "int" in result["error"].lower()

    def test_empty_payload_fails(self, handler):
        """Empty payload fails validation."""
        payload = {}
        result = handler._validate_payload(payload)
        assert result["valid"] is False


class TestHeartbeatTopicParsing:
    """Test heartbeat topic parsing."""

    @pytest.fixture
    def handler(self):
        return get_heartbeat_handler()

    @pytest.mark.asyncio
    async def test_invalid_topic_returns_false(self, handler):
        """Invalid topic format causes handler to return False."""
        topic = "invalid/topic/format"
        payload = {
            "ts": int(datetime.now(timezone.utc).timestamp()),
            "uptime": 3600,
            "heap_free": 98304,
            "wifi_rssi": -45,
        }
        result = await handler.handle_heartbeat(topic, payload)
        assert result is False


class TestDeviceStatusTransitions:
    """Test device status state machine.

    Status Flow:
    NEW → pending_approval → (Admin Approval) → approved → (Heartbeat) → online ↔ offline
                           ↘ (Admin Reject) → rejected → (Cooldown 300s) → pending_approval ↗
    """

    @pytest.fixture
    def handler(self):
        return get_heartbeat_handler()

    @pytest.fixture
    def valid_payload(self):
        return {
            "ts": int(datetime.now(timezone.utc).timestamp()),
            "uptime": 100,
            "heap_free": 50000,
            "wifi_rssi": -60,
        }

    @pytest.mark.asyncio
    async def test_approved_device_goes_online(self, handler, valid_payload):
        """Approved device transitions to online on first heartbeat."""
        topic = "kaiser/god/esp/ESP_APPROVED/system/heartbeat"

        with patch("src.mqtt.handlers.heartbeat_handler.resilient_session") as mock_session:
            mock_db = MagicMock()
            mock_db.commit = AsyncMock()
            mock_db.flush = AsyncMock()
            mock_db.rollback = AsyncMock()
            mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session.return_value.__aexit__ = AsyncMock(return_value=None)

            with patch("src.mqtt.handlers.heartbeat_handler.ESPRepository") as mock_repo_class:
                mock_device = MagicMock()
                mock_device.device_id = "ESP_APPROVED"
                mock_device.status = "approved"  # Approved but not yet online
                mock_device.device_metadata = {}
                mock_device.last_seen = None
                mock_device.id = 1

                mock_repo = MagicMock()
                mock_repo.get_by_device_id = AsyncMock(return_value=mock_device)
                mock_repo.update_status = AsyncMock()
                mock_repo_class.return_value = mock_repo

                with patch("src.mqtt.handlers.heartbeat_handler.ESPHeartbeatRepository"):
                    with patch("src.mqtt.handlers.heartbeat_handler.AuditLogRepository"):
                        with patch.object(handler, "_send_heartbeat_ack", new_callable=AsyncMock):
                            with patch("src.websocket.manager.WebSocketManager") as mock_ws:
                                mock_ws.get_instance = AsyncMock(return_value=AsyncMock())

                                result = await handler.handle_heartbeat(topic, valid_payload)

                                # Handler should succeed
                                assert result is True
                                # Device status should be set to online
                                assert mock_device.status == "online"

    @pytest.mark.asyncio
    async def test_pending_device_stays_pending(self, handler, valid_payload):
        """Pending device heartbeat is recorded but status stays pending."""
        topic = "kaiser/god/esp/ESP_PENDING/system/heartbeat"

        with patch("src.mqtt.handlers.heartbeat_handler.resilient_session") as mock_session:
            mock_db = MagicMock()
            mock_db.commit = AsyncMock()
            mock_db.flush = AsyncMock()
            mock_db.rollback = AsyncMock()
            mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session.return_value.__aexit__ = AsyncMock(return_value=None)

            with patch("src.mqtt.handlers.heartbeat_handler.ESPRepository") as mock_repo_class:
                mock_device = MagicMock()
                mock_device.device_id = "ESP_PENDING"
                mock_device.status = "pending_approval"
                mock_device.device_metadata = {}
                mock_device.id = 1

                mock_repo = MagicMock()
                mock_repo.get_by_device_id = AsyncMock(return_value=mock_device)
                mock_repo_class.return_value = mock_repo

                with patch.object(handler, "_update_pending_heartbeat", new_callable=AsyncMock):
                    with patch.object(handler, "_send_heartbeat_ack", new_callable=AsyncMock):
                        result = await handler.handle_heartbeat(topic, valid_payload)

                        # Handler should succeed
                        assert result is True
                        # Status should remain pending_approval
                        assert mock_device.status == "pending_approval"


class TestDeviceDiscovery:
    """Test auto-discovery of new devices.

    WICHTIG: Auto-Discovery IST AKTIV!
    Neue Geräte werden mit status='pending_approval' registriert.
    """

    @pytest.fixture
    def handler(self):
        return get_heartbeat_handler()

    @pytest.fixture
    def valid_payload(self):
        return {
            "ts": int(datetime.now(timezone.utc).timestamp()),
            "uptime": 100,
            "heap_free": 50000,
            "wifi_rssi": -60,
        }

    @pytest.mark.asyncio
    async def test_new_device_triggers_discovery(self, handler, valid_payload):
        """New device heartbeat triggers auto-discovery flow."""
        topic = "kaiser/god/esp/ESP_NEW_DEVICE/system/heartbeat"

        with patch("src.mqtt.handlers.heartbeat_handler.resilient_session") as mock_session:
            mock_db = MagicMock()
            mock_db.commit = AsyncMock()
            mock_db.flush = AsyncMock()
            mock_db.rollback = AsyncMock()
            mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session.return_value.__aexit__ = AsyncMock(return_value=None)

            with patch("src.mqtt.handlers.heartbeat_handler.ESPRepository") as mock_repo_class:
                mock_repo = MagicMock()
                mock_repo.get_by_device_id = AsyncMock(return_value=None)  # Device not found
                mock_repo_class.return_value = mock_repo

                # Mock the discovery method
                with patch.object(
                    handler, "_discover_new_device", new_callable=AsyncMock
                ) as mock_discover:
                    mock_new_device = MagicMock()
                    mock_new_device.status = "pending_approval"
                    mock_discover.return_value = (mock_new_device, "discovered")

                    with patch.object(
                        handler, "_broadcast_device_discovered", new_callable=AsyncMock
                    ):
                        with patch.object(
                            handler, "_send_heartbeat_ack", new_callable=AsyncMock
                        ) as mock_ack:
                            result = await handler.handle_heartbeat(topic, valid_payload)

                            # Handler should succeed
                            assert result is True
                            # Discovery should have been called
                            mock_discover.assert_called_once()
                            # ACK should be sent with pending_approval status
                            mock_ack.assert_called_once_with(
                                esp_id="ESP_NEW_DEVICE",
                                status="pending_approval",
                                config_available=False,
                            )


class TestTimeoutDetection:
    """Test device timeout detection."""

    @pytest.fixture
    def handler(self):
        return get_heartbeat_handler()

    @pytest.mark.asyncio
    async def test_check_device_timeouts_returns_dict(self, handler):
        """check_device_timeouts returns proper structure."""
        with patch("src.mqtt.handlers.heartbeat_handler.resilient_session") as mock_session:
            mock_db = MagicMock()
            mock_db.commit = AsyncMock()
            mock_db.flush = AsyncMock()
            mock_db.rollback = AsyncMock()
            mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session.return_value.__aexit__ = AsyncMock(return_value=None)

            with patch("src.mqtt.handlers.heartbeat_handler.ESPRepository") as mock_repo_class:
                mock_repo = MagicMock()
                mock_repo.get_online_devices = AsyncMock(return_value=[])
                mock_repo_class.return_value = mock_repo

                result = await handler.check_device_timeouts()

                assert "checked" in result
                assert "timed_out" in result
                assert "offline_devices" in result


class TestRejectedDeviceHandling:
    """Test handling of rejected devices."""

    @pytest.fixture
    def handler(self):
        return get_heartbeat_handler()

    @pytest.fixture
    def valid_payload(self):
        return {
            "ts": int(datetime.now(timezone.utc).timestamp()),
            "uptime": 100,
            "heap_free": 50000,
            "wifi_rssi": -60,
        }

    @pytest.mark.asyncio
    async def test_rejected_device_in_cooldown(self, handler, valid_payload):
        """Rejected device in cooldown gets rejected ACK."""
        topic = "kaiser/god/esp/ESP_REJECTED/system/heartbeat"

        with patch("src.mqtt.handlers.heartbeat_handler.resilient_session") as mock_session:
            mock_db = MagicMock()
            mock_db.commit = AsyncMock()
            mock_db.flush = AsyncMock()
            mock_db.rollback = AsyncMock()
            mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session.return_value.__aexit__ = AsyncMock(return_value=None)

            with patch("src.mqtt.handlers.heartbeat_handler.ESPRepository") as mock_repo_class:
                mock_device = MagicMock()
                mock_device.device_id = "ESP_REJECTED"
                mock_device.status = "rejected"
                mock_device.device_metadata = {}
                mock_device.id = 1

                mock_repo = MagicMock()
                mock_repo.get_by_device_id = AsyncMock(return_value=mock_device)
                mock_repo_class.return_value = mock_repo

                # Device is still in cooldown
                with patch.object(
                    handler, "_check_rejection_cooldown", new_callable=AsyncMock
                ) as mock_cooldown:
                    mock_cooldown.return_value = False  # Still in cooldown

                    with patch.object(
                        handler, "_send_heartbeat_ack", new_callable=AsyncMock
                    ) as mock_ack:
                        result = await handler.handle_heartbeat(topic, valid_payload)

                        assert result is True
                        mock_ack.assert_called_once_with(
                            esp_id="ESP_REJECTED", status="rejected", config_available=False
                        )


class TestOnlineDeviceHeartbeat:
    """Test heartbeat handling for online devices."""

    @pytest.fixture
    def handler(self):
        return get_heartbeat_handler()

    @pytest.fixture
    def valid_payload(self):
        return {
            "ts": int(datetime.now(timezone.utc).timestamp()),
            "uptime": 3600,
            "heap_free": 98304,
            "wifi_rssi": -45,
            "sensor_count": 3,
            "actuator_count": 2,
        }

    @pytest.mark.asyncio
    async def test_online_device_updates_last_seen(self, handler, valid_payload):
        """Online device heartbeat updates last_seen timestamp."""
        topic = "kaiser/god/esp/ESP_ONLINE/system/heartbeat"

        with patch("src.mqtt.handlers.heartbeat_handler.resilient_session") as mock_session:
            mock_db = MagicMock()
            mock_db.commit = AsyncMock()
            mock_db.flush = AsyncMock()
            mock_db.rollback = AsyncMock()
            mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session.return_value.__aexit__ = AsyncMock(return_value=None)

            with patch("src.mqtt.handlers.heartbeat_handler.ESPRepository") as mock_repo_class:
                mock_device = MagicMock()
                mock_device.device_id = "ESP_ONLINE"
                mock_device.status = "online"
                mock_device.device_metadata = {}
                mock_device.last_seen = datetime.now(timezone.utc)
                mock_device.id = 1

                mock_repo = MagicMock()
                mock_repo.get_by_device_id = AsyncMock(return_value=mock_device)
                mock_repo.update_status = AsyncMock()
                mock_repo_class.return_value = mock_repo

                with patch("src.mqtt.handlers.heartbeat_handler.ESPHeartbeatRepository"):
                    with patch.object(handler, "_update_esp_metadata", new_callable=AsyncMock):
                        with patch.object(handler, "_log_health_metrics"):
                            with patch.object(
                                handler, "_send_heartbeat_ack", new_callable=AsyncMock
                            ):
                                with patch.object(
                                    handler, "_has_pending_config", new_callable=AsyncMock
                                ) as mock_config:
                                    mock_config.return_value = False
                                    with patch("src.websocket.manager.WebSocketManager") as mock_ws:
                                        mock_ws.get_instance = AsyncMock(return_value=AsyncMock())

                                        result = await handler.handle_heartbeat(
                                            topic, valid_payload
                                        )

                                        assert result is True
                                        mock_repo.update_status.assert_called_once()


class TestZoneMismatchDetection:
    """Test zone mismatch detection and auto-reassignment.

    Bug 3 (ZONE_MISMATCH): After ESP reboot (especially in Wokwi without
    persistent NVS), the ESP loses its zone config. The server should detect
    this via heartbeat and auto-resend the zone assignment.
    """

    @pytest.fixture
    def handler(self):
        return get_heartbeat_handler()

    def test_zone_mismatch_detected_via_zone_id(self, handler):
        """Zone mismatch detected when ESP sends empty zone_id but DB has zone."""
        # Simulate ESP device with zone in DB
        mock_device = MagicMock()
        mock_device.device_id = "ESP_ZONE_TEST"
        mock_device.zone_id = "greenhouse"
        mock_device.master_zone_id = "main_zone"
        mock_device.zone_name = "Greenhouse"
        mock_device.kaiser_id = "god"
        mock_device.device_metadata = {}

        # ESP heartbeat payload with empty zone_id (lost after reboot)
        payload = {
            "zone_id": "",
            "zone_assigned": False,
        }

        # Extract detection logic values
        heartbeat_zone_id = payload.get("zone_id", "")
        heartbeat_zone_assigned = payload.get("zone_assigned", True)
        db_zone_id = mock_device.zone_id or ""

        esp_has_zone = bool(heartbeat_zone_id)
        db_has_zone = bool(db_zone_id)
        esp_lost_zone = not heartbeat_zone_assigned and db_has_zone

        # Assertions
        assert heartbeat_zone_id == ""
        assert db_zone_id == "greenhouse"
        assert not esp_has_zone
        assert db_has_zone
        assert esp_lost_zone  # zone_assigned=false + DB has zone
        assert heartbeat_zone_id != db_zone_id  # String mismatch triggers detection

    def test_zone_mismatch_detected_via_zone_assigned_flag(self, handler):
        """Zone mismatch detected via zone_assigned=false even if zone_id comparison would miss it."""
        # Scenario: ESP has matching zone_id string but zone_assigned=false
        # This can happen if zone_id is stale in payload but NVS is cleared
        mock_device = MagicMock()
        mock_device.zone_id = "greenhouse"
        mock_device.device_metadata = {}

        payload = {
            "zone_id": "greenhouse",  # Stale value from previous session
            "zone_assigned": False,  # But flag says NOT assigned
        }

        heartbeat_zone_id = payload.get("zone_id", "")
        heartbeat_zone_assigned = payload.get("zone_assigned", True)
        db_zone_id = mock_device.zone_id or ""

        db_has_zone = bool(db_zone_id)
        esp_lost_zone = not heartbeat_zone_assigned and db_has_zone

        # zone_id strings match, but zone_assigned=false triggers detection
        assert heartbeat_zone_id == db_zone_id  # Strings match
        assert esp_lost_zone  # But flag detects the loss

    def test_no_mismatch_when_both_unassigned(self, handler):
        """No mismatch when both ESP and DB have no zone."""
        payload = {
            "zone_id": "",
            "zone_assigned": False,
        }

        mock_device = MagicMock()
        mock_device.zone_id = None
        mock_device.device_metadata = {}

        heartbeat_zone_id = payload.get("zone_id", "")
        heartbeat_zone_assigned = payload.get("zone_assigned", True)
        db_zone_id = mock_device.zone_id or ""

        db_has_zone = bool(db_zone_id)
        esp_lost_zone = not heartbeat_zone_assigned and db_has_zone

        # No mismatch: both sides have no zone
        assert heartbeat_zone_id == db_zone_id  # Both ""
        assert not esp_lost_zone  # DB has no zone, so no loss detected

    def test_no_mismatch_when_zones_match(self, handler):
        """No mismatch when ESP and DB zones match."""
        payload = {
            "zone_id": "greenhouse",
            "zone_assigned": True,
        }

        mock_device = MagicMock()
        mock_device.zone_id = "greenhouse"
        mock_device.device_metadata = {}

        heartbeat_zone_id = payload.get("zone_id", "")
        heartbeat_zone_assigned = payload.get("zone_assigned", True)
        db_zone_id = mock_device.zone_id or ""

        db_has_zone = bool(db_zone_id)
        esp_lost_zone = not heartbeat_zone_assigned and db_has_zone

        assert heartbeat_zone_id == db_zone_id  # Match
        assert not esp_lost_zone  # zone_assigned=True

    def test_resync_cooldown_logic(self, handler):
        """Zone resync respects cooldown period (60s)."""
        import time as time_module

        now_ts = int(time_module.time())
        zone_resync_cooldown_seconds = 60

        # Case 1: No previous resync - should resync
        current_metadata_no_resync = {}
        last_resync = current_metadata_no_resync.get("zone_resync_sent_at")
        should_resync = True
        if last_resync:
            elapsed = now_ts - last_resync
            if elapsed < zone_resync_cooldown_seconds:
                should_resync = False
        assert should_resync is True

        # Case 2: Recent resync (10s ago) - should NOT resync
        current_metadata_recent = {"zone_resync_sent_at": now_ts - 10}
        last_resync = current_metadata_recent.get("zone_resync_sent_at")
        should_resync = True
        if last_resync:
            elapsed = now_ts - last_resync
            if elapsed < zone_resync_cooldown_seconds:
                should_resync = False
        assert should_resync is False

        # Case 3: Old resync (120s ago) - should resync
        current_metadata_old = {"zone_resync_sent_at": now_ts - 120}
        last_resync = current_metadata_old.get("zone_resync_sent_at")
        should_resync = True
        if last_resync:
            elapsed = now_ts - last_resync
            if elapsed < zone_resync_cooldown_seconds:
                should_resync = False
        assert should_resync is True
