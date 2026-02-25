# F4 Implementation Status

**Datum:** 2026-02-24
**Auftrag:** F4 Hardware-Test-Orchestrierung — Referenz-Cleanup + Implementierungs-Abschluss

## Block-Status

| Block | Beschreibung | Status | Detail |
|-------|-------------|--------|--------|
| 1 | Hardware-Profile | ERLEDIGT (vor diesem Auftrag) | 3 Profile (sht31_basic, ds18b20_basic, sht31_ds18b20_relay) + README. YAML validiert. README Sensor-Typ-Liste korrigiert (K1: Server-only Typen als nicht HW-test-geeignet markiert) |
| 2 | auto-ops Rolle 5 + Playbook 7 | ERLEDIGT (Agent-Verifikation) | Rolle 5 in auto-ops.md:119. Playbook 7 ab Zeile 395 mit Python-Framework UND curl-Fallback (K3 erfuellt) |
| 3 | system-control HW-Test-Briefing | ERLEDIGT (Agent-Verifikation) | HW-Test-Briefing Modus in system-control.md. Erkennung via `session_type: hw-test:{profil}` in STATUS.md |
| 4 | Skill /hardware-test | ERLEDIGT (vor diesem Auftrag) | .claude/skills/hardware-test/SKILL.md mit 6 Phasen, Wiring-Guide mit interface-spezifischen Hinweisen (K7 erfuellt) |
| 5 | start_session.sh hw-test | ERLEDIGT (vor diesem Auftrag) | hw-test Case ab Zeile 106, Profil-Handling ab Zeile 117 |
| 6 | AutoOps Python | ERLEDIGT (vor diesem Auftrag) | approve_device() in api_client.py:889. profile_validator.py mit K1 (Firmware-registrierte Typen) und K2 (GPIO-Blacklist aus gpio_validation_service.py) |
| 7 | Router + Flow-Referenz | ERLEDIGT (vor diesem Auftrag) | /hardware-test in CLAUDE.md:38. F4 in flow_reference.md FLOW-INDEX (Zeile 17) + F4-Sektion ab Zeile 312 |
| 8 | Verifikation | OFFEN | Trockentest mit Robin (Mock-ESP, device_mode=mock, 5 Min statt 30 Min) |

## mosquitto_sub Cleanup

| Datei | Befehle korrigiert | Kategorie-Verteilung |
|-------|-------------------|---------------------|
| SYSTEM_OPERATIONS_REFERENCE.md | 18 (15 Edits, 3x replace_all) | 7x Debug -C10-W30, 3x Heartbeat -C1-W60, 4x Sensor -C3-W90, 3x Error/Alert -C3-W90, 1x Config -C1-W30 |
| LOG_LOCATIONS.md | 14 | 9x Debug -C10-W30, 2x Sensor/Actuator -C3-W90, 2x Heartbeat/Emergency -C1-W60, 1x Actuator -C3-W90 |
| agent_profiles.md | 3 | 1x Debug -C10-W30, 1x Heartbeat -C1-W60, 1x Sensor -C3-W90 |
| TEST_WORKFLOW.md | 3 | 2x Debug -C10-W30, 1x Diagnostics -C1-W30 |
| DOCKER_REFERENCE.md | 1 | 1x Debug -C10-W30 |
| WOKWI_TESTING.md (Bonus) | 1 | 1x Debug -C10-W30 |
| **Gesamt** | **40** | |

### Nicht-Befehle (unveraendert gelassen)

- Tabellenzellen die mosquitto_sub als Tool-Name erwaehnen (5 Stellen)
- Kommentare die Dateipfade zeigen (1 Stelle: SYSTEM_OPS:68)
- Troubleshooting-Tabelle (1 Stelle: LOG_LOCATIONS:812)
- ACCESS_LIMITATIONS.md, ERROR_CODES.md (ausserhalb Scope, nur Referenzen)

### Kategorie-Defaults angewandt

| Kategorie | -C | -W | Verwendung |
|-----------|----|----|-----------|
| Heartbeat-Check | 1 | 60 | +/system/heartbeat, /broadcast/emergency |
| Sensor-Daten | 3 | 90 | +/sensor/+/data, +/actuator/+/status, +/actuator/+/alert, +/system/error |
| Config-Response | 1 | 30 | +/config*, +/system/diagnostics |
| Debug/Monitoring | 10 | 30 | kaiser/#, +/ESP_XXX/#, broadcast/# |
| $SYS Broker-Stats | 5 | 10 | (bereits korrekt in auto-ops Playbook 5) |

## K-Korrekturen Status

| K | Beschreibung | Status | Detail |
|---|-------------|--------|--------|
| K1 | Sensor-Typ-Validierung | KORREKT | profile_validator.py:28 nutzt `FIRMWARE_REGISTERED_SENSOR_TYPES = {"ds18b20", "sht31", "bmp280", "bme280", "ph", "ec", "moisture"}`. Exakt die Typen aus sensor_registry.cpp SENSOR_TYPE_MAP. README aktualisiert. |
| K2 | GPIO-Blacklist | KORREKT | profile_validator.py:13 WROOM `{0,1,2,3,6,7,8,9,10,11,12}` = gpio_validation_service.py:78 `SYSTEM_RESERVED_PINS_WROOM`. C3 identisch. |
| K3 | Flexibles Aufruf-Pattern | KORREKT | Playbook 7 (auto-ops.md:395-478) dokumentiert Python-Framework (Zeile 397-403) UND curl (Zeile 429-471). Faustregel: Setup=Python, Verify=curl. |
| K6 | approve_device() | KORREKT | Endpoint existiert: `POST /v1/esp/devices/{esp_id}/approve` (esp.py:1110). Methode in api_client.py:889. Kein Workaround noetig. |
| K7 | Wiring-Guide Hinweise | KORREKT | SKILL.md Phase 3 enthaelt: I2C Pull-Up onboard + ADDR-Pin (Zeile 123-126), OneWire 4.7k PFLICHT (Zeile 129), Analog ADC1-only (Zeile 138-139), Relay 5V (Zeile 144) |

## approve_device() Status

- **Endpoint existiert:** JA (`POST /api/v1/esp/devices/{esp_id}/approve` in esp.py:1110)
- **Methode implementiert:** JA (api_client.py:889-904, akzeptiert device_id + optionale zone_name)
- **Workaround:** Nicht noetig — Endpoint ist produktionsreif mit Audit-Logging und WebSocket-Broadcast

## F1-F3 Kompatibilitaet

- **F1 (Test-Flow):** Unveraendert. flow_reference.md Zeilen 21-159 intakt.
- **F2 (Dev-Flow):** Unveraendert. flow_reference.md Zeilen 161-252 intakt.
- **F3 (Docker-Monitoring):** Unveraendert. flow_reference.md Zeilen 254-310 intakt.
- **start_session.sh:** Bestehende Modi (boot, config, sensor, actuator, e2e) unveraendert. hw-test als neuer Case hinzugefuegt.
- **CLAUDE.md:** Alle bestehenden Skill-Routings unveraendert. /hardware-test als neuer Eintrag in Skill-Tabelle.

## Naechster Schritt

Block 8: Trockentest mit Robin
- Mock-ESP erstellen (device_mode=mock)
- Stabilitaetstest 5 Min statt 30 Min
- Alle 6 Phasen durchlaufen
- HW_TEST_FINAL_REPORT.md als Ergebnis
