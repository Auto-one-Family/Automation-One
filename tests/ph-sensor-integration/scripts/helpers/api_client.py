"""REST API client for AutomationOne pH sensor tests."""

from __future__ import annotations

import os
from typing import Any, Optional

import requests


class ApiClient:
    """Minimal REST client for AutomationOne server.

    Config via env vars:
        AO_BASE_URL   e.g. http://localhost:8000
        AO_USERNAME   operator email
        AO_PASSWORD   operator password
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        token: Optional[str] = None,
    ) -> None:
        self.base_url = (base_url or os.environ["AO_BASE_URL"]).rstrip("/")
        self._token = token
        self._session = requests.Session()

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------

    def login(
        self,
        username: Optional[str] = None,
        password: Optional[str] = None,
    ) -> str:
        """Authenticate and cache the access token. Returns the token."""
        username = username or os.environ["AO_USERNAME"]
        password = password or os.environ["AO_PASSWORD"]

        resp = self._session.post(
            f"{self.base_url}/api/v1/auth/login",
            json={"username": username, "password": password},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        tokens = data.get("tokens") or data
        self._token = tokens["access_token"]
        return self._token

    def _auth_headers(self) -> dict[str, str]:
        if not self._token:
            self.login()
        return {"Authorization": f"Bearer {self._token}"}

    # ------------------------------------------------------------------
    # Sensor config endpoints
    # ------------------------------------------------------------------

    def get_sensors(self, esp_id: str) -> list[dict[str, Any]]:
        """GET /api/v1/sensors/?esp_id={esp_id} — returns list of sensor configs."""
        resp = self._session.get(
            f"{self.base_url}/api/v1/sensors/",
            params={"esp_id": esp_id},
            headers=self._auth_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        # Response may be {"data": [...]} or a plain list
        if isinstance(data, list):
            return data
        return data.get("data", data.get("sensors", []))

    def get_sensor_config(self, esp_id: str, gpio: int) -> Optional[dict[str, Any]]:
        """Find a specific sensor config by ESP ID and GPIO pin."""
        sensors = self.get_sensors(esp_id)
        for s in sensors:
            if s.get("gpio") == gpio:
                return s
        return None

    def upsert_sensor_config(
        self, esp_id: str, gpio: int, payload: dict[str, Any]
    ) -> dict[str, Any]:
        """POST /api/v1/sensors/{esp_id}/{gpio} — create or update sensor config."""
        body = {**payload, "esp_id": esp_id, "gpio": gpio}
        resp = self._session.post(
            f"{self.base_url}/api/v1/sensors/{esp_id}/{gpio}",
            json=body,
            headers=self._auth_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, dict) and "data" in data:
            return data["data"]
        return data

    def trigger_measure(self, esp_id: str, gpio: int) -> dict[str, Any]:
        """POST /api/v1/sensors/{esp_id}/{gpio}/measure — fire-and-forget."""
        resp = self._session.post(
            f"{self.base_url}/api/v1/sensors/{esp_id}/{gpio}/measure",
            headers=self._auth_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    # ------------------------------------------------------------------
    # Calibration session endpoints  (S-P3 / AUT-289)
    # Path: /api/v1/calibration/sessions/...
    # ------------------------------------------------------------------

    def start_calibration_session(
        self,
        esp_id: str,
        gpio: int,
        sensor_type: str,
        method: str = "linear_2point",
        expected_points: int = 2,
        calibration_temperature: float = 25.0,
        correlation_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """POST /api/v1/calibration/sessions — start a new calibration session."""
        body: dict[str, Any] = {
            "esp_id": esp_id,
            "gpio": gpio,
            "sensor_type": sensor_type,
            "method": method,
            "expected_points": expected_points,
            "calibration_temperature": calibration_temperature,
        }
        if correlation_id is not None:
            body["correlation_id"] = correlation_id
        resp = self._session.post(
            f"{self.base_url}/api/v1/calibration/sessions",
            json=body,
            headers=self._auth_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    def get_calibration_session(self, session_id: str) -> dict[str, Any]:
        """GET /api/v1/calibration/sessions/{session_id}."""
        resp = self._session.get(
            f"{self.base_url}/api/v1/calibration/sessions/{session_id}",
            headers=self._auth_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    def add_calibration_point(
        self,
        session_id: str,
        raw_value: float,
        reference_value: float,
        point_role: str,
        quality: str = "good",
        overwrite: bool = False,
    ) -> dict[str, Any]:
        """POST /api/v1/calibration/sessions/{session_id}/points."""
        resp = self._session.post(
            f"{self.base_url}/api/v1/calibration/sessions/{session_id}/points",
            json={
                "raw_value": raw_value,
                "reference_value": reference_value,
                "point_role": point_role,
                "quality": quality,
                "overwrite": overwrite,
            },
            headers=self._auth_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    def finalize_calibration_session(self, session_id: str) -> dict[str, Any]:
        """POST /api/v1/calibration/sessions/{session_id}/finalize."""
        resp = self._session.post(
            f"{self.base_url}/api/v1/calibration/sessions/{session_id}/finalize",
            headers=self._auth_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    def apply_calibration_session(self, session_id: str) -> dict[str, Any]:
        """POST /api/v1/calibration/sessions/{session_id}/apply."""
        resp = self._session.post(
            f"{self.base_url}/api/v1/calibration/sessions/{session_id}/apply",
            headers=self._auth_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    def reject_calibration_session(
        self, session_id: str, reason: str = "Script cleanup"
    ) -> dict[str, Any]:
        """POST /api/v1/calibration/sessions/{session_id}/reject."""
        resp = self._session.post(
            f"{self.base_url}/api/v1/calibration/sessions/{session_id}/reject",
            json={"reason": reason},
            headers=self._auth_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    def get_calibration_history(
        self, esp_id: str, gpio: int, limit: int = 20
    ) -> list[dict[str, Any]]:
        """GET /api/v1/calibration/sessions/sensor/{esp_id}/{gpio}."""
        resp = self._session.get(
            f"{self.base_url}/api/v1/calibration/sessions/sensor/{esp_id}/{gpio}",
            params={"limit": limit},
            headers=self._auth_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, list):
            return data
        return data.get("data", data.get("sessions", []))

    # ------------------------------------------------------------------
    # Sensor data endpoints (S3+)
    # ------------------------------------------------------------------

    def get_token(self) -> str:
        """Return the cached access token (login first if needed)."""
        if not self._token:
            self.login()
        return self._token  # type: ignore[return-value]

    def get_sensor_data(
        self,
        esp_id: str,
        gpio: int,
        sensor_type: Optional[str] = None,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        """GET /api/v1/sensors/data — query recent sensor_data rows for a GPIO."""
        params: dict[str, Any] = {"esp_id": esp_id, "gpio": gpio, "limit": limit}
        if sensor_type:
            params["sensor_type"] = sensor_type
        resp = self._session.get(
            f"{self.base_url}/api/v1/sensors/data",
            params=params,
            headers=self._auth_headers(),
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, list):
            return data
        return data.get("data", data.get("readings", []))

    def trigger_temp_measure(self, esp_id: str, gpio: int) -> dict[str, Any]:
        """POST /api/v1/sensors/{esp_id}/{gpio}/measure for temp sensor."""
        return self.trigger_measure(esp_id, gpio)

    def ws_url(self, client_id: str) -> str:
        """Build authenticated WebSocket URL for realtime endpoint."""
        token = self.get_token()
        base = (
            self.base_url
            .replace("http://", "ws://")
            .replace("https://", "wss://")
            .replace("localhost", "127.0.0.1")  # Windows: localhost resolves to IPv6
        )
        return f"{base}/api/v1/ws/realtime/{client_id}?token={token}"
