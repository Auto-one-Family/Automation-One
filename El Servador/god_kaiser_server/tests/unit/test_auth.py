"""
Unit Tests: API Key Validation (AUT-290)

Tests for:
- ApiKey.hash_key() — SHA256 helper
- ApiKey.is_valid property — revocation check
- verify_api_key() dependency — DB lookup paths
"""

import hashlib
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from src.db.models.api_key import ApiKey


# =============================================================================
# ApiKey Model Tests
# =============================================================================


class TestApiKeyHash:
    """Tests for ApiKey.hash_key() static method."""

    def test_hash_is_sha256_hex(self) -> None:
        """hash_key() must return the SHA256 hex digest of the raw key."""
        raw = "esp_testkey123"
        result = ApiKey.hash_key(raw)
        expected = hashlib.sha256(raw.encode("utf-8")).hexdigest()

        assert result == expected
        assert len(result) == 64

    def test_hash_is_deterministic(self) -> None:
        """Same input always produces the same hash."""
        raw = "god_some_secret_token"
        assert ApiKey.hash_key(raw) == ApiKey.hash_key(raw)

    def test_different_keys_produce_different_hashes(self) -> None:
        """Different raw keys must not collide."""
        hash1 = ApiKey.hash_key("esp_aaaa")
        hash2 = ApiKey.hash_key("esp_bbbb")
        assert hash1 != hash2

    def test_hash_is_lowercase_hex(self) -> None:
        """Hash output must be lowercase hexadecimal characters only."""
        raw = "svc_test_key_xyz"
        result = ApiKey.hash_key(raw)
        assert result == result.lower()
        assert all(c in "0123456789abcdef" for c in result)


class TestApiKeyIsValid:
    """Tests for ApiKey.is_valid property."""

    def test_is_valid_when_not_revoked(self) -> None:
        """Key with revoked_at=None is active.

        We access the property directly on a plain namespace object
        to avoid SQLAlchemy's ORM instrumentation, which requires a
        fully initialised session-bound instance.
        """
        # The property only reads self.revoked_at, so a MagicMock works.
        mock_key = MagicMock(spec=ApiKey)
        mock_key.revoked_at = None
        # Call the property via the unbound descriptor
        assert ApiKey.is_valid.fget(mock_key) is True  # type: ignore[attr-defined]

    def test_is_invalid_when_revoked(self) -> None:
        """Key with a revoked_at timestamp is no longer valid."""
        mock_key = MagicMock(spec=ApiKey)
        mock_key.revoked_at = datetime.now(timezone.utc)
        assert ApiKey.is_valid.fget(mock_key) is False  # type: ignore[attr-defined]


# =============================================================================
# verify_api_key() Dependency Tests
# =============================================================================


def _make_api_key(*, revoked: bool = False) -> MagicMock:
    """
    Create a mock ApiKey with the is_valid property correctly wired.

    Using MagicMock(spec=ApiKey) instead of a real ORM instance avoids the
    SQLAlchemy instrumentation errors that occur when setting mapped columns
    on an uninitialised instance (no session, no identity map).
    """
    mock_key = MagicMock(spec=ApiKey)
    mock_key.id = uuid.uuid4()
    mock_key.key_prefix = "esp_"
    mock_key.owner_type = "esp"
    mock_key.revoked_at = datetime.now(timezone.utc) if revoked else None
    # Wire is_valid so it reads from mock_key.revoked_at
    type(mock_key).is_valid = property(lambda self: self.revoked_at is None)
    return mock_key


@pytest.mark.asyncio
class TestVerifyApiKey:
    """Tests for the verify_api_key FastAPI dependency function."""

    async def _call(self, raw_key: str | None, mock_repo_return: object) -> str:
        """
        Helper: call verify_api_key with a mocked ApiKeyRepository.

        Bypasses the DB session dependency by patching the repository class.
        """
        from src.api.deps import verify_api_key

        mock_repo = MagicMock()
        mock_repo.get_by_hash = AsyncMock(return_value=mock_repo_return)
        mock_repo.touch_last_used = AsyncMock()

        mock_db = MagicMock()

        with patch(
            "src.api.deps.ApiKeyRepository",
            return_value=mock_repo,
        ):
            return await verify_api_key(db=mock_db, x_api_key=raw_key)

    async def test_valid_key_found_in_db(self) -> None:
        """API key present in DB and not revoked → returns the key."""
        api_key_obj = _make_api_key(revoked=False)
        result = await self._call("esp_valid_key", api_key_obj)
        assert result == "esp_valid_key"

    async def test_valid_key_calls_touch_last_used(self) -> None:
        """Successful auth must update last_used_at."""
        api_key_obj = _make_api_key(revoked=False)

        from src.api.deps import verify_api_key

        mock_repo = MagicMock()
        mock_repo.get_by_hash = AsyncMock(return_value=api_key_obj)
        mock_repo.touch_last_used = AsyncMock()

        mock_db = MagicMock()

        with patch("src.api.deps.ApiKeyRepository", return_value=mock_repo):
            await verify_api_key(db=mock_db, x_api_key="esp_valid_key")

        mock_repo.touch_last_used.assert_awaited_once_with(api_key_obj.id)

    async def test_revoked_key_raises_401(self) -> None:
        """Revoked key in DB → 401 Unauthorized."""
        api_key_obj = _make_api_key(revoked=True)

        with pytest.raises(HTTPException) as exc_info:
            await self._call("esp_revoked_key", api_key_obj)

        assert exc_info.value.status_code == 401
        assert "revoked" in exc_info.value.detail.lower()

    async def test_unknown_key_raises_401(self) -> None:
        """Key not found in DB → 401 (no prefix fallback)."""
        with pytest.raises(HTTPException) as exc_info:
            await self._call("esp_unknown_key", None)

        assert exc_info.value.status_code == 401

    async def test_missing_key_raises_401(self) -> None:
        """No X-API-Key header (None) → 401."""
        from src.api.deps import verify_api_key

        mock_db = MagicMock()

        with pytest.raises(HTTPException) as exc_info:
            # Patch not needed — function returns early before DB call
            with patch("src.api.deps.ApiKeyRepository"):
                await verify_api_key(db=mock_db, x_api_key=None)

        assert exc_info.value.status_code == 401
        assert "missing" in exc_info.value.detail.lower()

    async def test_configured_key_accepted_without_db_lookup(self) -> None:
        """Configured master key in settings bypasses DB lookup."""
        from src.api.deps import verify_api_key

        mock_repo = MagicMock()
        mock_repo.get_by_hash = AsyncMock()
        mock_db = MagicMock()

        with (
            patch("src.api.deps.ApiKeyRepository", return_value=mock_repo),
            patch("src.api.deps.settings") as mock_settings,
        ):
            mock_settings.development.debug_mode = False
            mock_settings.environment = "development"
            mock_settings.security.api_key = "master_configured_key"

            result = await verify_api_key(db=mock_db, x_api_key="master_configured_key")

        assert result == "master_configured_key"
        mock_repo.get_by_hash.assert_not_awaited()

    async def test_prefix_only_key_no_longer_accepted(self) -> None:
        """
        A key with valid prefix but NOT in DB must be rejected (AUT-290).

        This verifies the prefix-only fallback has been removed.
        """
        # DB returns None → unknown key → 401
        with pytest.raises(HTTPException) as exc_info:
            await self._call("esp_somerandomprefixonly", None)

        assert exc_info.value.status_code == 401
