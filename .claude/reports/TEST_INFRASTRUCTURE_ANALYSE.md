 # AutomationOne Test-Infrastruktur Analyse

**Datum:** 2026-01-27
**Analyst:** Claude Code (Test-Architekt Agent)
**Scope:** Vollstandige Test-Engine, MockESP, Wokwi, CI/CD

---

## 1. Server-Tests

### Struktur

| Kategorie | Dateien | Zeilen | Schwerpunkt |
|-----------|---------|--------|-------------|
| **Root Fixtures** | 1 (conftest.py) | 436 | DB-Session, FastAPI Overrides, Sample-Daten |
| **ESP32 Fixtures** | 1 (esp32/conftest.py) | 789 | MockESP32Client Varianten, Broker Fixtures |
| **Mock Classes** | 3 | 2.059 | mock_esp32_client (1.584), real_esp32_client (376), in_memory_mqtt (99) |
| **Unit Tests** | 26 | ~6.765 | Repositories, Processors, Services, Cleanup Jobs |
| **Integration Tests** | 17 | ~8.237 | API Endpoints, MQTT Flow, WebSocket, Logic Engine |
| **ESP32 Mock Tests** | 11 | ~5.919 | Actuator, Sensor, Cross-ESP, Performance, Subzone |
| **E2E Tests** | 1 | 5 | Sensor Workflow (Stub) |
| **GESAMT** | **66** | **~24.206** | |

### Fixtures (conftest.py)

**Autouse-Fixtures (kritisch):**
- `override_get_db` - Alle Tests nutzen In-Memory SQLite (StaticPool fur Windows)
- `override_mqtt_publisher` - Verhindert echte MQTT-Verbindungen, gibt MagicMock zuruck
- `override_actuator_service` - ActuatorService mit gemocktem Publisher

**Daten-Fixtures:**
- `sample_esp_device` (ESP_TEST_001), `sample_esp_with_zone`, `sample_esp_no_zone`, `sample_esp_c3`
- `esp_repo`, `sensor_repo`, `actuator_repo`, `user_repo`, `subzone_repo`
- `gpio_service` - Echter GpioValidationService

**ESP32-Fixtures (esp32/conftest.py):**
- 10+ MockESP32Client-Varianten (basic, with_actuators, with_sensors, greenhouse, etc.)
- Multi-ESP Fixtures (3-4 ESPs fur Cross-ESP Tests)
- Broker-Fixtures (real MQTT, fallback to DIRECT)
- Subzone-Fixtures (MockESP32WithSubzones)

### Test-Patterns

| Pattern | Beschreibung |
|---------|-------------|
| **DB-Isolation** | Jeder Test bekommt eigene In-Memory SQLite |
| **MQTT-Mock** | MagicMock statt echter Broker (autouse) |
| **Command-Response** | `mock.handle_command()` -> Response-Dict prüfen |
| **Message-Verification** | `mock.get_published_messages()` -> Topic/Payload prüfen |
| **Fixture-Cleanup** | `mock.reset()` + `mock.clear_published_messages()` |

---

## 2. MockESP32Client

### Architektur

```
MockESP32Client (1.584 Zeilen)
├── BrokerMode: DIRECT (in-memory) | MQTT (echter Broker)
├── SystemState: 12 States (BOOT -> OPERATIONAL -> SAFE_MODE -> ERROR)
├── Sensors: Dict[int, SensorState] (GPIO -> State)
├── Actuators: Dict[int, ActuatorState] (GPIO -> State)
├── Published Messages: List[Dict] (fur Test-Assertions)
└── Command Handlers: 16 Commands (ping, actuator_set, sensor_read, etc.)
```

### MQTT-Simulation

| Aspekt | Implementierung |
|--------|-----------------|
| **Default-Modus** | DIRECT (in-memory, kein Broker noetig) |
| **Topics** | Production-identisch: `kaiser/{kaiser_id}/esp/{esp_id}/...` |
| **Payloads** | Exakt wie ESP32-Firmware (raw_mode, heap_free, gpio_status) |
| **Multi-Value** | SHT31: primary_value + secondary_values Dict |
| **Safety** | Zone-Check, Safe-Mode, Emergency-Stop, PWM-Clamping |

### Safety-Checks (automatisch)

1. Zone muss konfiguriert sein vor Actuator-Commands
2. Safe-Mode blockiert alle Actuator-Commands
3. Emergency-Stop verhindert Command-Execution
4. PWM-Werte werden auf min/max geclampt

### Verwendung

```python
# 95% der Tests: DIRECT Mode
mock = MockESP32Client(esp_id="test-esp-001", broker_mode=BrokerMode.DIRECT)
response = mock.handle_command("sensor_read", {"gpio": 34})
messages = mock.get_published_messages()

# 5%: Echter Broker
mock = MockESP32Client(esp_id="MOCK_123", broker_mode=BrokerMode.MQTT, mqtt_config={...})
```

---

## 3. SimulationScheduler

### Zweck

Database-zentrische Mock-ESP-Simulation (Paket X). Ersetzt alten MockESPManager.

### Architektur

```
SimulationScheduler (1.724 Zeilen)
├── MockESPRuntime: In-Memory Laufzeit-State pro ESP
├── CentralScheduler: APScheduler fur Heartbeat + Sensor Jobs
├── MockActuatorHandler: MQTT Actuator-Command Verarbeitung
├── DB-Persistenz: PostgreSQL fur Konfiguration
└── Recovery: Automatische Wiederherstellung nach Server-Restart
```

### Features

| Feature | Detail |
|---------|--------|
| **Heartbeat** | Automatisch alle 60s, konfigurierbar |
| **Sensor-Patterns** | CONSTANT, RANDOM, DRIFT (reverses bei min/max) |
| **Multi-Value** | SHT31: separate Jobs fur temp + humidity |
| **Actuator-Commands** | MQTT-basiert, Emergency-Stop Support |
| **DB Recovery** | `recover_mocks()` stellt running-Mocks nach Restart her |
| **Batch-Updates** | `set_batch_sensor_values()` fur mehrere GPIOs |

### Integration mit Tests

- Wird primaer fur **Debug-API** und **Frontend-Integration** verwendet
- Tests nutzen meist MockESP32Client direkt (schneller, kein DB noetig)
- SimulationScheduler testet die **Server-seitige Simulation** (realistischere Szenarien)

---

## 4. Wokwi-Integration

### Konfiguration

- **wokwi.toml**: Firmware aus `.pio/build/wokwi_simulation/`, RFC2217 Port 4000, Gateway enabled
- **diagram.json**: ESP32 DevKit V1, DS18B20 auf GPIO 4, LED auf GPIO 5

### Szenarien (16 YAML-Dateien)

| Kategorie | Dateien | Testet |
|-----------|---------|--------|
| **01-Boot** | boot_full, boot_safe_mode | 5-Phasen Firmware-Init, GPIO Safe-Mode |
| **02-Sensor** | sensor_heartbeat, sensor_ds18b20_read | Heartbeat Publishing, OneWire-Auslesen |
| **03-Actuator** | actuator_led_on, actuator_pwm, actuator_status, actuator_emergency_clear | Command-Handling, PWM, Status, Emergency |
| **04-Zone** | zone_assignment, subzone_assignment | Zone/Subzone MQTT-Verarbeitung |
| **05-Emergency** | emergency_broadcast, emergency_esp_stop | Broadcast + ESP-spezifischer Emergency Stop |
| **06-Config** | config_sensor_add, config_actuator_add | Runtime-Konfiguration via MQTT |

### Einschraenkungen

| Limitation | Impact |
|------------|--------|
| DS18B20 immer 22.5 C | Temp-basierte Logik nicht testbar |
| LED-Helligkeit nicht messbar | PWM nicht verifizierbar |
| 90s Timeout-Limit | Lange Tests unmoeglich |
| Kein MQTT-Monitoring | Nur Serial-Log-Verifikation |
| NVS nicht simuliert | Config-Persistenz schlaegt fehl (Bug U) |
| SHT31 nicht verfuegbar | Multi-Value nur mit Hardware testbar |

### CI-Integration

- `wokwi-tests.yml`: Build -> boot-tests + sensor-tests + mqtt-test (parallel)
- MQTT Injection Helper (`mqtt_inject.py`) vorhanden aber **nicht in CI automatisiert**

---

## 5. CI/CD Workflows

### Uebersicht

| Workflow | Trigger | Jobs | Timeout |
|----------|---------|------|---------|
| **wokwi-tests.yml** | Push/PR El Trabajante/** | build-firmware -> boot/sensor/mqtt-tests -> summary | 10-15 min |
| **esp32-tests.yml** | Push/PR tests/esp32/**, mqtt/**, services/** | esp32-tests (mit Mosquitto) | 15 min |
| **server-tests.yml** | Push/PR El Servador/** | lint -> unit-tests + integration-tests -> summary | 15 min |
| **pr-checks.yml** | Alle PRs | label-pr + pr-validation (Large Files, Sensitive Files) | 15 min |

### Services

- **Mosquitto Broker** in Docker fur esp32-tests + integration-tests
- Anonymous Access, keine Persistenz, Full Logging
- Health Check: `mosquitto_pub -h localhost -t test -m test`

### Artifacts

| Artifact | Retention | Format |
|----------|-----------|--------|
| wokwi-firmware | 1 Tag | .bin/.elf |
| *-test-logs | 7 Tage | .log |
| junit-*.xml | Default | JUnit XML |
| coverage-*.xml | Default | Coverage XML |

### Concurrency

Alle Workflows nutzen `cancel-in-progress: true` - neue Pushes canceln laufende Runs.

---

## 6. ESP32 Firmware-Patterns

### Data Buffering

| Eigenschaft | Wert |
|-------------|------|
| **Buffer-Groesse** | 100 Messages (MAX_OFFLINE_MESSAGES) |
| **Typ** | Circular Buffer (FIFO) |
| **Overflow** | Aelteste Messages werden verworfen |
| **Persistenz** | KEINE (volatile, geht bei Neustart verloren) |
| **Drain** | `processOfflineBuffer()` nach Reconnect |

### Circuit Breaker (MQTT)

| Parameter | Wert |
|-----------|------|
| **Failure Threshold** | 5 Failures -> OPEN |
| **Recovery Timeout** | 30 Sekunden |
| **Half-Open Test** | 10 Sekunden |
| **Reconnect Backoff** | Exponentiell: 1s -> 2s -> 4s -> ... -> 60s max |
| **Max Attempts** | 10 |

### Sensor Hot-Plug

- **Kein** dynamisches Discovery bei Boot
- Sensoren werden aus NVS geladen (`begin()`)
- Runtime-Konfiguration via MQTT Config-Topic
- Multi-Value I2C: Mehrere Sensor-Typen auf gleichem GPIO erlaubt (Bug T)
- Array-basiert mit Compaction bei Removal

### GPIO-Reservierungen

**System-Reserved (nicht nutzbar):**
- GPIO 0, 1, 2, 3 (Boot-Strapping + UART)
- GPIO 6-11 (Flash SPI Bus)

**Input-Only (ESP32-WROOM):**
- GPIO 34, 35, 36, 39 (keine Actuators)

**I2C-Reserved:**
- ESP32-WROOM: GPIO 21 (SDA), 22 (SCL)
- XIAO ESP32-C3: GPIO 4 (SDA), 5 (SCL)

---

## 7. Test-Luecken & Empfehlungen

### Kritische Luecken

| Szenario | Prioritaet | Status | Empfehlung |
|----------|-----------|--------|------------|
| **ESP-ID Format** | HOCH | 40+ Fixtures nutzen ungueltige IDs | Alle auf `ESP_[A-F0-9]{6,8}` migrieren |
| **Offline Buffer Overflow** | HOCH | Nicht getestet | Unit-Test: 150 Messages offline, pruefe 50 verloren |
| **Circuit Breaker Recovery** | HOCH | Nicht explizit getestet | Test: 5 Failures -> OPEN -> 30s -> HALF_OPEN -> Recovery |
| **Config PARTIAL_SUCCESS** | MITTEL | Nicht vollstaendig getestet | Test: 3 Sensors konfigurieren, 1 failt -> PARTIAL_SUCCESS |
| **Sensor Array Compaction** | MITTEL | Nicht getestet | Test: Add 5 sensors, remove #2, verify indices shift |
| **Multi-Value I2C Collision** | MITTEL | Bug T dokumentiert | Test: SHT31 temp + humidity auf GPIO 21, pruefe DB-Eintraege |
| **Watchdog Timeout** | NIEDRIG | Nur im Firmware-Code | Wokwi-Test: Feed blockieren, pruefe Reset |
| **E2E Sensor Workflow** | NIEDRIG | Stub (5 Zeilen) | Kompletten Flow implementieren |

### ESP-ID Format Problem (DETAIL)

**40+ Test-Fixtures nutzen UNGUELTIGE ESP-IDs:**

```
UNGUELTIG (aktuell verwendet):
- test-esp-001, test-esp-002, test-esp-003       (Bindestriche, lowercase)
- ESP_TEST_001, ESP_TEST001                       (T nicht hex)
- ESP_ZONE001, ESP_ZONE_A_SENSORS                 (Z, O nicht hex)
- ESP_UNPROVISIONED, ESP_SHT31001                 (nicht-hex Zeichen)
- ESP_GH001, ESP_SAFE001, ESP_SUBZONE001          (nicht-hex Zeichen)

GUELTIG (sollte verwendet werden):
- ESP_12AB34CD, ESP_AABBCCDD, ESP_D0B19C          (nur hex 0-9, A-F)
```

**Impact:** Tests funktionieren weil MockESP32Client jeden String akzeptiert. Aber:
- API-Tests mit echtem FastAPI-Client wuerden 422 zuruckgeben
- MQTT-Topics enthalten ungueltige IDs
- Keine Konsistenz mit Production-Format

**Empfehlung:** Schrittweise Migration aller Fixtures zu gultigen hex-IDs.

### Bekannte Bugs

| Bug | Status | Test-Impact |
|-----|--------|-------------|
| **Bug T**: SHT31 GPIO-Mapping | OFFEN | GPIO-Validierung zeigt beide Pins als besetzt |
| **Bug U**: NVS in Wokwi | BEKANNT | Config-Persistenz nicht testbar in Simulation |
| **Bug V**: Failed Configs blockieren GPIO | OFFEN | Manuelle DB-Bereinigung noetig |
| **Bug W**: GPIO 4 Konflikt in Wokwi | ERWARTET | DS18B20 vorverkabelt |
| **Bug X**: SHT31 nicht in Wokwi | LIMITATION | Multi-Value nur mit Hardware |

---

## 8. Sofort-Fixes

### 8.1 ESP-ID Migration (Empfohlen)

Schrittweise alle Test-Fixtures von ungultigen IDs zu gultigen hex-IDs migrieren:

```python
# ALT:
mock = MockESP32Client(esp_id="test-esp-001")

# NEU:
mock = MockESP32Client(esp_id="ESP_AA0001")
```

**Betroffene Dateien:**
- `tests/conftest.py` (3 Fixtures)
- `tests/esp32/conftest.py` (20+ Fixtures)
- Diverse Test-Dateien mit inline ESP-IDs

### 8.2 E2E Test Stub ausbauen

`tests/e2e/test_sensor_workflow.py` ist nur 5 Zeilen. Sollte einen vollstaendigen Sensor-Flow testen:
1. ESP registrieren
2. Sensor konfigurieren
3. Sensor-Daten senden
4. Verarbeitung pruefen
5. DB-Eintrag verifizieren

### 8.3 MQTT Injection in CI

`mqtt_inject.py` existiert aber ist nicht in CI-Workflows integriert. Koennte Wokwi-Tests deutlich verbessern (Zone-Assignment, Emergency-Stop testen).

---

## 9. Gesamtbewertung

| Kriterium | Bewertung | Kommentar |
|-----------|-----------|-----------|
| **Test-Abdeckung** | 7/10 | 66 Dateien, ~24k Zeilen. E2E und Buffer-Tests fehlen |
| **Mock-Qualitaet** | 9/10 | Production-accurate MQTT, Safety-Checks, Multi-Value |
| **CI/CD** | 8/10 | 4 Workflows, parallel, Mosquitto in Docker |
| **Wokwi** | 6/10 | 16 Szenarien aber kein MQTT-Monitoring, NVS fehlt |
| **Fixture-Konsistenz** | 4/10 | 40+ ungueltige ESP-IDs, inkonsistente Naming |
| **Dokumentation** | 8/10 | CLAUDE.md, Roadmap, Bug-Tracking vorhanden |
| **Industrielle Robustheit** | 7/10 | Circuit Breaker, Safety, aber Buffer-Tests fehlen |

**Gesamtnote: 7/10** - Solide Test-Infrastruktur mit klaren Verbesserungspotentialen bei ESP-ID-Konsistenz und Edge-Case-Coverage.
