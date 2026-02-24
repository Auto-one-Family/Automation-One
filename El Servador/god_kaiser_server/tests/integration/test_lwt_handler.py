"""
Integration Tests für LWTHandler.

Location: tests/integration/test_lwt_handler.py
Benötigt: DB-Session, Repositories

Phase 3 Test-Suite: Instant Offline Detection, Idempotency, Unknown Device Handling.
"""

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from src.mqtt.handlers.lwt_handler import LWTHandler, get_lwt_handler


class TestLWTInstantOffline:
    """Test instant offline detection via LWT."""

    @pytest.fixture
    def handler(self):
        return LWTHandler()

    @pytest.fixture
    def valid_lwt_payload(self):
        """Gültiges LWT Payload."""
        return {
            "status": "offline",
            "reason": "unexpected_disconnect",
            "timestamp": int(datetime.now(timezone.utc).timestamp()),
        }

    @pytest.mark.asyncio
    async def test_lwt_marks_device_offline(self, handler, valid_lwt_payload):
        """LWT message marks device offline immediately."""
        topic = "kaiser/god/esp/ESP_ONLINE/system/will"

        with patch("src.mqtt.handlers.lwt_handler.resilient_session") as mock_session:
            mock_db = MagicMock()
            mock_db.commit = AsyncMock()  # session.commit() is awaited
            mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session.return_value.__aexit__ = AsyncMock(return_value=None)

            with patch("src.mqtt.handlers.lwt_handler.ESPRepository") as mock_repo_class:
                mock_device = MagicMock()
                mock_device.device_id = "ESP_ONLINE"
                mock_device.status = "online"  # Currently online
                mock_device.device_metadata = {}
                mock_device.last_seen = datetime.now(timezone.utc)

                mock_repo = MagicMock()
                mock_repo.get_by_device_id = AsyncMock(return_value=mock_device)
                mock_repo.update_status = AsyncMock()
                mock_repo_class.return_value = mock_repo

                with patch("src.mqtt.handlers.lwt_handler.AuditLogRepository") as mock_audit:
                    mock_audit.return_value.log_device_event = AsyncMock()

                    with patch("src.websocket.manager.WebSocketManager") as mock_ws:
                        mock_ws.get_instance = AsyncMock(return_value=AsyncMock())

                        result = await handler.handle_lwt(topic, valid_lwt_payload)

                        assert result is True
                        mock_repo.update_status.assert_called_once_with("ESP_ONLINE", "offline")

    @pytest.mark.asyncio
    async def test_lwt_updates_device_metadata(self, handler, valid_lwt_payload):
        """LWT message updates device_metadata with disconnect info."""
        topic = "kaiser/god/esp/ESP_ONLINE/system/will"

        with patch("src.mqtt.handlers.lwt_handler.resilient_session") as mock_session:
            mock_db = MagicMock()
            mock_db.commit = AsyncMock()  # session.commit() is awaited
            mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session.return_value.__aexit__ = AsyncMock(return_value=None)

            with patch("src.mqtt.handlers.lwt_handler.ESPRepository") as mock_repo_class:
                mock_device = MagicMock()
                mock_device.device_id = "ESP_ONLINE"
                mock_device.status = "online"
                mock_device.device_metadata = {}
                mock_device.last_seen = datetime.now(timezone.utc)

                mock_repo = MagicMock()
                mock_repo.get_by_device_id = AsyncMock(return_value=mock_device)
                mock_repo.update_status = AsyncMock()
                mock_repo_class.return_value = mock_repo

                with patch("src.mqtt.handlers.lwt_handler.AuditLogRepository") as mock_audit:
                    mock_audit.return_value.log_device_event = AsyncMock()

                    with patch("src.websocket.manager.WebSocketManager") as mock_ws:
                        mock_ws.get_instance = AsyncMock(return_value=AsyncMock())

                        result = await handler.handle_lwt(topic, valid_lwt_payload)

                        assert result is True
                        # Device metadata should be updated
                        assert "last_disconnect" in mock_device.device_metadata
                        assert mock_device.device_metadata["last_disconnect"]["source"] == "lwt"
                        assert (
                            mock_device.device_metadata["last_disconnect"]["reason"]
                            == "unexpected_disconnect"
                        )

    @pytest.mark.asyncio
    async def test_lwt_broadcasts_websocket_event(self, handler, valid_lwt_payload):
        """LWT message triggers WebSocket broadcast."""
        topic = "kaiser/god/esp/ESP_ONLINE/system/will"

        with patch("src.mqtt.handlers.lwt_handler.resilient_session") as mock_session:
            mock_db = MagicMock()
            mock_db.commit = AsyncMock()  # session.commit() is awaited
            mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session.return_value.__aexit__ = AsyncMock(return_value=None)

            with patch("src.mqtt.handlers.lwt_handler.ESPRepository") as mock_repo_class:
                mock_device = MagicMock()
                mock_device.device_id = "ESP_ONLINE"
                mock_device.status = "online"
                mock_device.device_metadata = {}
                mock_device.last_seen = datetime.now(timezone.utc)

                mock_repo = MagicMock()
                mock_repo.get_by_device_id = AsyncMock(return_value=mock_device)
                mock_repo.update_status = AsyncMock()
                mock_repo_class.return_value = mock_repo

                with patch("src.mqtt.handlers.lwt_handler.AuditLogRepository") as mock_audit:
                    mock_audit.return_value.log_device_event = AsyncMock()

                    with patch("src.websocket.manager.WebSocketManager") as mock_ws_class:
                        mock_ws = AsyncMock()
                        mock_ws_class.get_instance = AsyncMock(return_value=mock_ws)

                        result = await handler.handle_lwt(topic, valid_lwt_payload)

                        assert result is True
                        # WebSocket broadcast should be called
                        mock_ws.broadcast.assert_called_once()
                        call_args = mock_ws.broadcast.call_args
                        assert call_args.args[0] == "esp_health"
                        assert call_args.args[1]["status"] == "offline"
                        assert call_args.args[1]["source"] == "lwt"


class TestLWTIdempotency:
    """Test LWT idempotency handling."""

    @pytest.fixture
    def handler(self):
        return LWTHandler()

    @pytest.fixture
    def valid_lwt_payload(self):
        return {
            "status": "offline",
            "reason": "unexpected_disconnect",
        }

    @pytest.mark.asyncio
    async def test_lwt_ignored_if_already_offline(self, handler, valid_lwt_payload):
        """LWT is ignored if device is already offline (idempotency)."""
        topic = "kaiser/god/esp/ESP_OFFLINE/system/will"

        with patch("src.mqtt.handlers.lwt_handler.resilient_session") as mock_session:
            mock_db = MagicMock()
            mock_db.commit = AsyncMock()  # session.commit() is awaited
            mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session.return_value.__aexit__ = AsyncMock(return_value=None)

            with patch("src.mqtt.handlers.lwt_handler.ESPRepository") as mock_repo_class:
                mock_device = MagicMock()
                mock_device.device_id = "ESP_OFFLINE"
                mock_device.status = "offline"  # Already offline
                mock_device.device_metadata = {}

                mock_repo = MagicMock()
                mock_repo.get_by_device_id = AsyncMock(return_value=mock_device)
                mock_repo.update_status = AsyncMock()
                mock_repo_class.return_value = mock_repo

                result = await handler.handle_lwt(topic, valid_lwt_payload)

                assert result is True
                # Should NOT update status (already offline)
                mock_repo.update_status.assert_not_called()

    @pytest.mark.asyncio
    async def test_lwt_ignored_if_pending_approval(self, handler, valid_lwt_payload):
        """LWT is processed normally for pending_approval devices."""
        topic = "kaiser/god/esp/ESP_PENDING/system/will"

        with patch("src.mqtt.handlers.lwt_handler.resilient_session") as mock_session:
            mock_db = MagicMock()
            mock_db.commit = AsyncMock()  # session.commit() is awaited
            mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session.return_value.__aexit__ = AsyncMock(return_value=None)

            with patch("src.mqtt.handlers.lwt_handler.ESPRepository") as mock_repo_class:
                mock_device = MagicMock()
                mock_device.device_id = "ESP_PENDING"
                mock_device.status = "pending_approval"
                mock_device.device_metadata = {}

                mock_repo = MagicMock()
                mock_repo.get_by_device_id = AsyncMock(return_value=mock_device)
                mock_repo.update_status = AsyncMock()
                mock_repo_class.return_value = mock_repo

                result = await handler.handle_lwt(topic, valid_lwt_payload)

                assert result is True
                # Should NOT update status (not online)
                mock_repo.update_status.assert_not_called()


class TestLWTUnknownDevice:
    """Test LWT for unknown devices."""

    @pytest.fixture
    def handler(self):
        return LWTHandler()

    @pytest.fixture
    def valid_lwt_payload(self):
        return {
            "status": "offline",
            "reason": "unexpected_disconnect",
        }

    @pytest.mark.asyncio
    async def test_lwt_for_unknown_device_ignored(self, handler, valid_lwt_payload):
        """LWT for unknown device is silently ignored."""
        topic = "kaiser/god/esp/ESP_UNKNOWN/system/will"

        with patch("src.mqtt.handlers.lwt_handler.resilient_session") as mock_session:
            mock_db = MagicMock()
            mock_db.commit = AsyncMock()  # session.commit() is awaited
            mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session.return_value.__aexit__ = AsyncMock(return_value=None)

            with patch("src.mqtt.handlers.lwt_handler.ESPRepository") as mock_repo_class:
                mock_repo = MagicMock()
                mock_repo.get_by_device_id = AsyncMock(return_value=None)  # Device not found
                mock_repo_class.return_value = mock_repo

                result = await handler.handle_lwt(topic, valid_lwt_payload)

                # Handler should acknowledge but not fail
                assert result is True


class TestLWTTopicParsing:
    """Test LWT topic parsing."""

    @pytest.fixture
    def handler(self):
        return LWTHandler()

    @pytest.fixture
    def valid_lwt_payload(self):
        return {
            "status": "offline",
            "reason": "unexpected_disconnect",
        }

    @pytest.mark.asyncio
    async def test_invalid_topic_returns_false(self, handler, valid_lwt_payload):
        """Invalid topic format causes handler to return False."""
        topic = "invalid/topic/format"

        result = await handler.handle_lwt(topic, valid_lwt_payload)
        assert result is False

    @pytest.mark.asyncio
    async def test_empty_topic_returns_false(self, handler, valid_lwt_payload):
        """Empty topic returns False."""
        topic = ""

        result = await handler.handle_lwt(topic, valid_lwt_payload)
        assert result is False


class TestLWTPayloadHandling:
    """Test LWT payload handling edge cases."""

    @pytest.fixture
    def handler(self):
        return LWTHandler()

    @pytest.mark.asyncio
    async def test_lwt_without_status_field(self, handler):
        """LWT without status field is still processed (assumes offline)."""
        topic = "kaiser/god/esp/ESP_ONLINE/system/will"
        payload = {
            "reason": "unexpected_disconnect",
            # Missing "status" field
        }

        with patch("src.mqtt.handlers.lwt_handler.resilient_session") as mock_session:
            mock_db = MagicMock()
            mock_db.commit = AsyncMock()  # session.commit() is awaited
            mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session.return_value.__aexit__ = AsyncMock(return_value=None)

            with patch("src.mqtt.handlers.lwt_handler.ESPRepository") as mock_repo_class:
                mock_device = MagicMock()
                mock_device.device_id = "ESP_ONLINE"
                mock_device.status = "online"
                mock_device.device_metadata = {}
                mock_device.last_seen = datetime.now(timezone.utc)

                mock_repo = MagicMock()
                mock_repo.get_by_device_id = AsyncMock(return_value=mock_device)
                mock_repo.update_status = AsyncMock()
                mock_repo_class.return_value = mock_repo

                with patch("src.mqtt.handlers.lwt_handler.AuditLogRepository") as mock_audit:
                    mock_audit.return_value.log_device_event = AsyncMock()

                    with patch("src.websocket.manager.WebSocketManager") as mock_ws:
                        mock_ws.get_instance = AsyncMock(return_value=AsyncMock())

                        result = await handler.handle_lwt(topic, payload)

                        # Handler should still work
                        assert result is True

    @pytest.mark.asyncio
    async def test_lwt_with_custom_reason(self, handler):
        """LWT with custom reason is preserved in metadata."""
        topic = "kaiser/god/esp/ESP_ONLINE/system/will"
        payload = {
            "status": "offline",
            "reason": "power_loss",
            "timestamp": int(datetime.now(timezone.utc).timestamp()),
        }

        with patch("src.mqtt.handlers.lwt_handler.resilient_session") as mock_session:
            mock_db = MagicMock()
            mock_db.commit = AsyncMock()  # session.commit() is awaited
            mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session.return_value.__aexit__ = AsyncMock(return_value=None)

            with patch("src.mqtt.handlers.lwt_handler.ESPRepository") as mock_repo_class:
                mock_device = MagicMock()
                mock_device.device_id = "ESP_ONLINE"
                mock_device.status = "online"
                mock_device.device_metadata = {}
                mock_device.last_seen = datetime.now(timezone.utc)

                mock_repo = MagicMock()
                mock_repo.get_by_device_id = AsyncMock(return_value=mock_device)
                mock_repo.update_status = AsyncMock()
                mock_repo_class.return_value = mock_repo

                with patch("src.mqtt.handlers.lwt_handler.AuditLogRepository") as mock_audit:
                    mock_audit.return_value.log_device_event = AsyncMock()

                    with patch("src.websocket.manager.WebSocketManager") as mock_ws:
                        mock_ws.get_instance = AsyncMock(return_value=AsyncMock())

                        result = await handler.handle_lwt(topic, payload)

                        assert result is True
                        # Custom reason should be preserved
                        assert (
                            mock_device.device_metadata["last_disconnect"]["reason"] == "power_loss"
                        )


class TestLWTGlobalHandler:
    """Test global handler instance."""

    def test_get_lwt_handler_returns_singleton(self):
        """get_lwt_handler returns singleton instance."""
        handler1 = get_lwt_handler()
        handler2 = get_lwt_handler()
        assert handler1 is handler2

    def test_handler_is_lwt_handler_instance(self):
        """Handler is an LWTHandler instance."""
        handler = get_lwt_handler()
        assert isinstance(handler, LWTHandler)
