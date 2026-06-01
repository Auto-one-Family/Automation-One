"""AUT-586 dev-local verify: correlation_id + push_status on sensor POST."""

from __future__ import annotations

import json
import subprocess
import sys
import uuid

import httpx

BASE = "http://localhost:8000/api/v1"
AUTH = {"username": "admin", "password": "Admin123#"}


def login(client: httpx.Client) -> str:
    r = client.post(f"{BASE}/auth/login", json=AUTH)
    r.raise_for_status()
    body = r.json()
    if "tokens" in body:
        return body["tokens"]["access_token"]
    return body["data"]["access_token"]


def pick_esp(client: httpx.Client, headers: dict) -> tuple[str, int]:
    r = client.get(f"{BASE}/esp/devices", headers=headers)
    r.raise_for_status()
    devices = r.json().get("data", [])
    for d in devices:
        if d.get("status") in ("online", "offline") and d.get("device_id"):
            esp_id = d["device_id"]
            break
    else:
        raise RuntimeError("No ESP device found for verify")
    # pick unused GPIO for analog sensor
    for gpio in (35, 36, 37, 38, 39, 32, 33):
        check = client.get(f"{BASE}/sensors/{esp_id}/{gpio}", headers=headers)
        if check.status_code == 404:
            return esp_id, gpio
    raise RuntimeError("No free GPIO found")


def post_sensor(client: httpx.Client, headers: dict, esp_id: str, gpio: int) -> dict:
    payload = {
        "esp_id": esp_id,
        "gpio": gpio,
        "sensor_type": "temperature",
        "name": f"AUT586 verify {uuid.uuid4().hex[:8]}",
        "enabled": True,
        "interval_ms": 30000,
        "processing_mode": "raw",
    }
    r = client.post(f"{BASE}/sensors/{esp_id}/{gpio}", headers=headers, json=payload)
    r.raise_for_status()
    data = r.json()
    if isinstance(data, dict) and "data" in data and isinstance(data["data"], dict):
        data = data["data"]
    return {
        "status_code": r.status_code,
        "correlation_id": data.get("correlation_id"),
        "push_status": data.get("push_status"),
        "gpio": gpio,
        "esp_id": esp_id,
    }


def validate_result(label: str, result: dict) -> None:
    cid = result.get("correlation_id")
    if not cid:
        raise AssertionError(f"{label}: correlation_id is null/missing: {result}")
    uuid.UUID(str(cid))
    push_status = result.get("push_status")
    if push_status not in {"queued", "published", "db_only"}:
        raise AssertionError(f"{label}: invalid push_status: {result}")
    print(f"{label}: OK {json.dumps(result, ensure_ascii=False)}")


def main() -> int:
    with httpx.Client(timeout=30.0) as client:
        token = login(client)
        headers = {"Authorization": f"Bearer {token}"}
        esp_id, gpio = pick_esp(client, headers)

        happy = post_sensor(client, headers, esp_id, gpio)
        validate_result("happy_path", happy)
        if happy["push_status"] not in {"queued", "published"}:
            print(
                "WARN happy_path push_status expected queued/published, got",
                happy["push_status"],
            )

        subprocess.run(["docker", "stop", "automationone-mqtt"], check=True)
        try:
            mqtt_down_gpio = gpio + 1 if gpio < 39 else gpio - 1
            # ensure gpio free
            for candidate in (mqtt_down_gpio, gpio + 2, 39, 38):
                check = client.get(f"{BASE}/sensors/{esp_id}/{candidate}", headers=headers)
                if check.status_code == 404:
                    mqtt_down_gpio = candidate
                    break
            mqtt_down = post_sensor(client, headers, esp_id, mqtt_down_gpio)
            validate_result("mqtt_down", mqtt_down)
            if mqtt_down["push_status"] not in {"db_only", "queued"}:
                raise AssertionError(
                    f"mqtt_down: expected push_status db_only or queued, got {mqtt_down}"
                )
        finally:
            subprocess.run(["docker", "start", "automationone-mqtt"], check=False)

        # Inject config_response for happy-path correlation_id
        inject_payload = json.dumps(
            {
                "status": "success",
                "type": "sensor",
                "message": "AUT-586 verify inject",
                "correlation_id": happy["correlation_id"],
                "count": 1,
                "failed_count": 0,
            }
        )
        inject_cmd = [
            sys.executable,
            r"El Trabajante\tests\wokwi\helpers\mqtt_inject.py",
            "--host",
            "localhost",
            "--topic",
            f"kaiser/god/esp/{esp_id}/config/response",
            "--payload",
            inject_payload,
            "--validate-json",
        ]
        subprocess.run(inject_cmd, check=True, cwd=r"c:\Users\robin\Documents\PlatformIO\Projects\Auto-one")
        print("config_response_inject: OK correlation_id=", happy["correlation_id"])

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
