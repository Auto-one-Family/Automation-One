#!/usr/bin/env python3
"""
T18-V6 Logic Engine Mock-Verifikation Script.

Führt die Verifikation autonom aus:
1. Login + JWT
2. Mock ESP anlegen (SHT31 + Relay)
3. Zone zuweisen, Simulation starten
4. Regel prüfen/anpassen (TimmsRegen oder neue Test-Regel)
5. Sensor-Wert injizieren (Feuchte 35% → Trigger ON)
6. Execution History prüfen
7. Sensor-Wert injizieren (Feuchte 55% → Trigger OFF oder Max Runtime)
8. Loki/DB-Abfragen (Stichproben)

Verwendung:
  cd "El Servador/god_kaiser_server"
  python ../../auftraege/T18-V6-logic-mock-verifikation-2026-03-11/t18_v6_verification_script.py
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path

# Add server to path
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
SERVER_DIR = PROJECT_ROOT / "El Servador" / "god_kaiser_server"
sys.path.insert(0, str(SERVER_DIR))

# Optional: paho-mqtt for direct MQTT publish
try:
    import paho.mqtt.client as mqtt
    HAS_PAHO = True
except ImportError:
    HAS_PAHO = False

# Config
BASE_URL = os.environ.get("T18_V6_API_URL", "http://localhost:8000")
MQTT_HOST = os.environ.get("MQTT_BROKER_HOST", "localhost")
MQTT_PORT = int(os.environ.get("MQTT_BROKER_PORT", "1883"))
USERNAME = os.environ.get("T18_V6_USER", "admin")
PASSWORD = os.environ.get("T18_V6_PASSWORD", "Admin123#")
MOCK_ESP_ID = "MOCK_T18V6LOGIC"
REPORT_DIR = SCRIPT_DIR
FINDINGS = []

# T18-V7 Hysterese-Konfiguration
MOCK_HYSTERESIS_ESP_ID = "MOCK_T18V7HYST"
TEMP_GPIO = 4
RELAY_GPIO = 16
SENSOR_TYPE = "ds18b20"
ACTIVATE_ABOVE = 28.0
DEACTIVATE_BELOW = 24.0
REPORT_DIR_HYST = PROJECT_ROOT / "auftraege" / "T18-V7-hysteresis-e2e-test-2026-03-11"


def log(msg: str, level: str = "INFO") -> None:
    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] [{level}] {msg}")
    if level == "FINDING":
        FINDINGS.append(msg)


async def get_token() -> str:
    """Login und JWT holen."""
    import aiohttp
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{BASE_URL}/api/v1/auth/login",
            json={"username": USERNAME, "password": PASSWORD},
        ) as resp:
            if resp.status != 200:
                text = await resp.text()
                raise RuntimeError(f"Login failed: {resp.status} {text}")
            data = await resp.json()
            tokens = data.get("tokens", data)
            return tokens.get("access_token", data.get("access_token"))


async def api_request(
    method: str,
    path: str,
    token: str,
    json_body: dict | None = None,
    params: dict | None = None,
) -> dict:
    """REST-API Request mit JWT."""
    import aiohttp
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{BASE_URL}{path}"
    async with aiohttp.ClientSession() as session:
        async with session.request(
            method, url, headers=headers, json=json_body, params=params
        ) as resp:
            text = await resp.text()
            try:
                data = json.loads(text) if text else {}
            except json.JSONDecodeError:
                data = {"_raw": text}
            if resp.status >= 400:
                raise RuntimeError(f"API {method} {path}: {resp.status} {data}")
            return data


def publish_sensor_mqtt(esp_id: str, gpio: int, sensor_type: str, value: float) -> bool:
    """Publiziert Sensor-Daten direkt via MQTT (umgeht Mock-Batch-Limitierungen)."""
    if not HAS_PAHO:
        log("paho-mqtt nicht installiert - nutze REST Batch API", "WARN")
        return False
    topic = f"kaiser/god/esp/{esp_id}/sensor/{gpio}/data"
    payload = {
        "ts": int(time.time() * 1000),
        "esp_id": esp_id,
        "gpio": gpio,
        "sensor_type": sensor_type,
        "raw_value": value,
        "value": value,
        "raw_mode": True,
        "quality": "good",
    }
    client = mqtt.Client()
    client.connect(MQTT_HOST, MQTT_PORT, 60)
    client.publish(topic, json.dumps(payload), qos=1)
    client.disconnect()
    log(f"MQTT published: {topic} value={value}")
    return True


async def create_hysteresis_rule(token: str, esp_id: str) -> str:
    """Erstellt Hysterese-Kühlungs-Regel via POST /api/v1/logic/rules."""
    rule_payload = {
        "name": "E2E: Hysterese-Kühlung T18-V7",
        "description": "Lüfter AN bei >28°C, AUS bei <24°C",
        "enabled": True,
        "conditions": [
            {
                "type": "hysteresis",
                "esp_id": esp_id,
                "gpio": TEMP_GPIO,
                "sensor_type": SENSOR_TYPE,
                "activate_above": ACTIVATE_ABOVE,
                "deactivate_below": DEACTIVATE_BELOW,
            }
        ],
        "logic_operator": "AND",
        "actions": [
            {
                "type": "actuator",
                "esp_id": esp_id,
                "gpio": RELAY_GPIO,
                "command": "ON",
                "value": 1.0,
            }
        ],
        "priority": 10,
        "cooldown_seconds": 5,
        "max_executions_per_hour": 20,
    }
    data = await api_request("POST", "/api/v1/logic/rules", token, rule_payload)
    rid = data.get("id") or data.get("rule_id")
    return str(rid) if rid else ""


async def run_hysteresis_verification(
    token: str, esp_id: str, rule_id: str
) -> dict:
    """Führt die 5-Schritt-Sequenz aus und sammelt Ergebnisse."""
    results = {"steps": [], "passed": True, "findings": []}

    def get_entries(hist: dict) -> list:
        return hist.get("entries", hist.get("items", []))

    # Schritt 1: 25°C — inaktiv
    if HAS_PAHO:
        publish_sensor_mqtt(esp_id, TEMP_GPIO, SENSOR_TYPE, 25.0)
    else:
        await api_request(
            "POST",
            f"/api/v1/debug/mock-esp/{esp_id}/sensors/batch",
            token,
            {"values": {TEMP_GPIO: 25.0}, "publish": True},
        )
    await asyncio.sleep(1.5)
    hist1 = await api_request(
        "GET",
        "/api/v1/logic/execution_history",
        token,
        params={"rule_id": rule_id, "limit": 3},
    )
    count_before = len(get_entries(hist1))
    results["steps"].append(
        {"step": 1, "temp": 25, "expected": "inactive", "count": count_before}
    )

    # Schritt 2: 29°C — Aktivierung
    if HAS_PAHO:
        publish_sensor_mqtt(esp_id, TEMP_GPIO, SENSOR_TYPE, 29.0)
    else:
        await api_request(
            "POST",
            f"/api/v1/debug/mock-esp/{esp_id}/sensors/batch",
            token,
            {"values": {TEMP_GPIO: 29.0}, "publish": True},
        )
    await asyncio.sleep(2)
    hist2 = await api_request(
        "GET",
        "/api/v1/logic/execution_history",
        token,
        params={"rule_id": rule_id, "limit": 5},
    )
    entries2 = get_entries(hist2)
    count_after_29 = len(entries2)
    activated = count_after_29 > count_before
    results["steps"].append(
        {"step": 2, "temp": 29, "expected": "activate", "activated": activated}
    )

    # Schritt 3: 26°C — bleibt aktiv (KEIN neues logic_execution!)
    if HAS_PAHO:
        publish_sensor_mqtt(esp_id, TEMP_GPIO, SENSOR_TYPE, 26.0)
    else:
        await api_request(
            "POST",
            f"/api/v1/debug/mock-esp/{esp_id}/sensors/batch",
            token,
            {"values": {TEMP_GPIO: 26.0}, "publish": True},
        )
    await asyncio.sleep(1.5)
    hist3 = await api_request(
        "GET",
        "/api/v1/logic/execution_history",
        token,
        params={"rule_id": rule_id, "limit": 5},
    )
    entries3 = get_entries(hist3)
    no_flutter = len(entries3) == count_after_29
    results["steps"].append(
        {"step": 3, "temp": 26, "expected": "stay_active", "no_flutter": no_flutter}
    )

    # Schritt 4: 23°C — Deaktivierung
    if HAS_PAHO:
        publish_sensor_mqtt(esp_id, TEMP_GPIO, SENSOR_TYPE, 23.0)
    else:
        await api_request(
            "POST",
            f"/api/v1/debug/mock-esp/{esp_id}/sensors/batch",
            token,
            {"values": {TEMP_GPIO: 23.0}, "publish": True},
        )
    await asyncio.sleep(2)
    hist4 = await api_request(
        "GET",
        "/api/v1/logic/execution_history",
        token,
        params={"rule_id": rule_id, "limit": 10},
    )
    entries4 = get_entries(hist4)
    deactivated = len(entries4) > len(entries3)
    results["steps"].append(
        {"step": 4, "temp": 23, "expected": "deactivate", "deactivated": deactivated}
    )

    # Schritt 5: 25°C — bleibt inaktiv
    if HAS_PAHO:
        publish_sensor_mqtt(esp_id, TEMP_GPIO, SENSOR_TYPE, 25.0)
    else:
        await api_request(
            "POST",
            f"/api/v1/debug/mock-esp/{esp_id}/sensors/batch",
            token,
            {"values": {TEMP_GPIO: 25.0}, "publish": True},
        )
    await asyncio.sleep(1.5)
    hist5 = await api_request(
        "GET",
        "/api/v1/logic/execution_history",
        token,
        params={"rule_id": rule_id, "limit": 10},
    )
    entries5 = get_entries(hist5)
    stayed_off = len(entries5) == len(entries4)
    results["steps"].append(
        {
            "step": 5,
            "temp": 25,
            "expected": "stay_inactive",
            "stayed_off": stayed_off,
        }
    )

    results["passed"] = activated and no_flutter and deactivated and stayed_off
    if not results["passed"]:
        results["findings"].append(
            "Hysterese-Test fehlgeschlagen — siehe steps"
        )
    else:
        results["findings"].append(
            "Hysterese-Test bestanden: Aktivierung, Hysterese-Zone, Deaktivierung korrekt"
        )

    return results


async def run_verification() -> None:
    """Hauptablauf der Verifikation."""
    token = await get_token()
    log("Login erfolgreich")

    # 1. Bestehende Mocks prüfen
    mocks = await api_request("GET", "/api/v1/debug/mock-esp", token)
    mock_list = mocks.get("data", mocks) if isinstance(mocks.get("data"), list) else []
    existing = next((m for m in mock_list if m.get("esp_id") == MOCK_ESP_ID), None)

    if existing:
        log(f"Mock {MOCK_ESP_ID} existiert bereits")
        esp_id = MOCK_ESP_ID
    else:
        # 2. Mock anlegen (mit SHT31 + Relay) - ohne Zone (zone_id=None)
        create_body = {
            "esp_id": MOCK_ESP_ID,
            "auto_heartbeat": True,
            "heartbeat_interval_seconds": 60,
            "sensors": [
                {
                    "gpio": 21,
                    "sensor_type": "SHT31",
                    "name": "Luftfeuchte T18-V6",
                    "raw_value": 55.0,
                    "interface_type": "I2C",
                }
            ],
            "actuators": [{"gpio": 5, "actuator_type": "relay", "name": "Luftbefeuchter"}],
        }
        await api_request("POST", "/api/v1/debug/mock-esp", token, create_body)
        log(f"Mock {MOCK_ESP_ID} erstellt (SHT31 + Relay)")
        esp_id = MOCK_ESP_ID

        # 4. Zone zuweisen falls vorhanden
        try:
            zones = await api_request("GET", "/api/v1/zones", token)
            zone_list = zones.get("zones", zones.get("data", []))
            if isinstance(zone_list, dict):
                zone_list = zone_list.get("zones", [])
            gh = next((z for z in zone_list if z.get("zone_id")), None)
            if gh:
                await api_request(
                    "POST",
                    f"/api/v1/zone/devices/{esp_id}/assign",
                    token,
                    {"zone_id": gh.get("zone_id")},
                )
                log("Zone zugewiesen")
        except Exception as e:
            log(f"Zone-Zuweisung übersprungen: {e}", "WARN")

        # 5. Simulation starten (falls auto_heartbeat nicht sofort greift)
        time.sleep(2)
        await api_request(
            "POST",
            f"/api/v1/debug/mock-esp/{esp_id}/auto-heartbeat?enabled=true&interval_seconds=60",
            token,
        )

    # 6. Regeln abrufen
    rules = await api_request("GET", "/api/v1/logic/rules", token)
    rule_list = rules.get("data", rules.get("rules", []))
    timms = next(
        (r for r in rule_list if "timms" in (r.get("name") or "").lower()),
        rule_list[0] if rule_list else None,
    )
    if not timms:
        log("Keine passende Regel gefunden - manuell anlegen/konfigurieren", "WARN")
        log("FINDING: Regel 'TimmsRegen' oder Test-Regel muss im Frontend existieren")
        return

    rule_id = timms.get("id")
    log(f"Regel: {timms.get('name')} (id={rule_id})")

    # 7. Sensor-Injection: Feuchte 35% (Trigger ON)
    log("=== Phase B: Trigger auslösen (Feuchte 35%) ===")
    if HAS_PAHO:
        publish_sensor_mqtt(esp_id, 21, "sht31_humidity", 35.0)
    else:
        # Batch API (GPIO->value; bei SHT31 evtl. nur temp)
        await api_request(
            "POST",
            f"/api/v1/debug/mock-esp/{esp_id}/sensors/batch",
            token,
            {"values": {21: 35.0}, "publish": True},
        )
    time.sleep(3)

    # 8. Execution History prüfen
    hist = await api_request(
        "GET",
        f"/api/v1/logic/execution_history",
        token,
        params={"rule_id": rule_id, "limit": 5},
    )
    entries = hist.get("entries", hist.get("items", []))
    if entries:
        log(f"Execution History: {len(entries)} Einträge")
        for e in entries[:2]:
            log(f"  - {e.get('timestamp', '')} success={e.get('success')}")
        log("FINDING: Trigger funktioniert - Regel wurde ausgeführt", "FINDING")
    else:
        log("FINDING: Keine Execution-History-Einträge - Trigger evtl. nicht ausgelöst", "FINDING")

    # 9. Sensor-Injection: Feuchte 55% (Trigger OFF)
    log("=== Phase B: Abschalten (Feuchte 55%) ===")
    if HAS_PAHO:
        publish_sensor_mqtt(esp_id, 21, "sht31_humidity", 55.0)
    else:
        await api_request(
            "POST",
            f"/api/v1/debug/mock-esp/{esp_id}/sensors/batch",
            token,
            {"values": {21: 55.0}, "publish": True},
        )
    time.sleep(2)

    # 10. Max Runtime: Im Bericht dokumentieren (manuell prüfbar)
    log("Max Runtime: Im Frontend RuleConfigPanel (Aktor-Node) konfigurierbar")
    log("FINDING: Max Runtime Verhalten manuell prüfen (Aktor nach X Sek. aus)", "FINDING")

    # 11. DB-Stichprobe
    log("=== Phase D: Datenbank-Stichprobe ===")
    try:
        db = await api_request("GET", "/api/v1/debug/db/tables", token)
        log(f"DB-Tabellen: {len(db.get('tables', []))} verfügbar")
    except Exception as e:
        log(f"DB-Abfrage (debug): {e}", "WARN")

    # 12. T18-V7: Hysterese-Phase
    log("=== Phase E: Hysterese-Verifikation (T18-V7) ===")
    hyst_esp_id = MOCK_HYSTERESIS_ESP_ID
    hyst_rule_id = ""
    try:
        mocks = await api_request("GET", "/api/v1/debug/mock-esp", token)
        mock_list = mocks.get("data", mocks) if isinstance(mocks.get("data"), list) else []
        existing_hyst = next(
            (m for m in mock_list if m.get("esp_id") == MOCK_HYSTERESIS_ESP_ID),
            None,
        )

        if not existing_hyst:
            create_body = {
                "esp_id": MOCK_HYSTERESIS_ESP_ID,
                "auto_heartbeat": True,
                "heartbeat_interval_seconds": 60,
                "sensors": [
                    {
                        "gpio": TEMP_GPIO,
                        "sensor_type": "DS18B20",
                        "name": "Temperatur Hysterese-Test",
                        "raw_value": 25.0,
                        "interface_type": "OneWire",
                    }
                ],
                "actuators": [
                    {"gpio": RELAY_GPIO, "actuator_type": "relay", "name": "Lüfter"}
                ],
            }
            await api_request("POST", "/api/v1/debug/mock-esp", token, create_body)
            log(f"Mock {MOCK_HYSTERESIS_ESP_ID} erstellt (DS18B20 + Relay)")
            time.sleep(2)
            await api_request(
                "POST",
                f"/api/v1/debug/mock-esp/{hyst_esp_id}/auto-heartbeat?enabled=true&interval_seconds=60",
                token,
            )
        else:
            log(f"Mock {MOCK_HYSTERESIS_ESP_ID} existiert bereits")

        hyst_rule_id = await create_hysteresis_rule(token, hyst_esp_id)
        if not hyst_rule_id:
            log("Hysterese-Regel konnte nicht erstellt werden", "WARN")
        else:
            log(f"Hysterese-Regel erstellt: id={hyst_rule_id}")
            await asyncio.sleep(1)
            results = await run_hysteresis_verification(
                token, hyst_esp_id, hyst_rule_id
            )

            REPORT_DIR_HYST.mkdir(parents=True, exist_ok=True)
            report_path = REPORT_DIR_HYST / "T18-V7-hysteresis-report.json"
            with open(report_path, "w", encoding="utf-8") as f:
                json.dump(results, f, indent=2, ensure_ascii=False)
            log(f"Bericht gespeichert: {report_path}")

            for step in results["steps"]:
                ok = step.get("activated") or step.get("no_flutter") or step.get(
                    "deactivated"
                ) or step.get("stayed_off")
                if ok is None and "count" in step:
                    ok = True  # Schritt 1: nur Zähler, kein Pass/Fail
                status_sym = "✓" if ok else "✗"
                log(f"  Schritt {step['step']}: {step['temp']}°C → {step['expected']} {status_sym}")
            log(
                f"Hysterese-Test: {'BESTANDEN' if results['passed'] else 'FEHLGESCHLAGEN'}",
                "FINDING",
            )

            if results.get("findings"):
                for f in results["findings"]:
                    FINDINGS.append(f)

            # Cleanup
            try:
                await api_request(
                    "DELETE", f"/api/v1/logic/rules/{hyst_rule_id}", token
                )
                await api_request(
                    "DELETE", f"/api/v1/debug/mock-esp/{hyst_esp_id}", token
                )
                log("Hysterese-Mock und Regel gelöscht (Cleanup)")
            except Exception as e:
                log(f"Cleanup übersprungen: {e}", "WARN")
    except Exception as e:
        log(f"Hysterese-Phase fehlgeschlagen: {e}", "WARN")
        import traceback
        traceback.print_exc()

    log("=== Verifikation abgeschlossen ===")
    for f in FINDINGS:
        print(f"  [FINDING] {f}")


def main() -> None:
    asyncio.run(run_verification())


if __name__ == "__main__":
    main()
