# Umfassende Teststrategie - AutomationOne ESP32 Firmware

**Erstellt:** 2026-01-27
**Analyst:** Claude (Test-Architekt)
**Status:** Vollständig

---

## Dokument 1: Test-Coverage-Analyse

### 1.1 Aktuelle Test-Inventur

| Kategorie | Dateien | Tests | Methode |
|-----------|---------|-------|---------|
| **Wokwi-Szenarien** | 16 YAML | 16 Szenarien | Firmware-in-Simulation |
| **Server ESP32 Mock** | 10 Dateien | 233 Tests | MockESP32Client |
| **Integration Tests** | 24 Dateien | 196 Tests | Server-seitig (pytest) |
| **Gesamt** | 50 Dateien | **445 Tests** | |

**Wokwi CI-Status:** Nur 6/16 Szenarien in CI aktiv. 10 Szenarien erfordern MQTT-Injection (mqtt_inject.py existiert, aber nicht in CI integriert).

### 1.2 Test-Coverage-Matrix

| Flow/Komponente | Server Mock | Wokwi Sim | CI-aktiv | Hardware | Priorität |
|-----------------|:-----------:|:---------:|:--------:|:--------:|:---------:|
| **Boot-Sequenz (5 Phasen)** | ✅ 27 Tests | ✅ 2 Szenarien | ✅ | — | ✅ Gut |
| **WiFi Connect** | ✅ Infra-Tests | ⚠️ Nur Wokwi-GUEST | ✅ | ❌ Fehlt | 🔴 Lücke |
| **WiFi Reconnect + CB** | ✅ 50 Tests (PF) | ❌ Nicht simulierbar | ❌ | ❌ Fehlt | 🔴 Lücke |
| **MQTT Connect** | ✅ 25 Tests | ✅ 1 Szenario | ✅ | — | ✅ Gut |
| **MQTT Reconnect + CB** | ✅ 50 Tests (PF) | ❌ | ❌ | ❌ | 🟡 Mock ausreichend |
| **MQTT Port-Fallback 8883→1883** | ❌ | ❌ | ❌ | ❌ | 🟡 Mittel |
| **MQTT Offline Buffer** | ✅ 15 Tests | ❌ | ❌ | ❌ | ✅ Gut (Mock) |
| **Heartbeat** | ✅ 8+24 Tests | ✅ 1 Szenario | ✅ | — | ✅ Gut |
| **Sensor Read (DS18B20)** | ✅ 24 Tests | ✅ 1 Szenario | ✅ | — | ✅ Gut |
| **Sensor Batch Publish** | ✅ 47 Tests | ❌ | ❌ | ❌ | ✅ Gut (Mock) |
| **Pi-Enhanced HTTP** | ✅ 33 Tests | ❌ | ❌ | ❌ | ✅ Gut (Mock) |
| **Actuator ON/OFF** | ✅ 29 Tests | ⚠️ Szenario vorhanden | ❌ CI | ❌ | 🔴 CI-Lücke |
| **Actuator PWM** | ✅ 29 Tests | ⚠️ Szenario vorhanden | ❌ CI | ❌ | 🔴 CI-Lücke |
| **Actuator Timeout-Protection** | ❌ | ❌ | ❌ | ❌ | 🔴 Lücke |
| **Emergency Stop (Broadcast)** | ✅ 14 Tests | ⚠️ Szenario vorhanden | ❌ CI | ❌ | 🔴 CI-Lücke |
| **Emergency Stop (ESP-spezifisch)** | ✅ 14 Tests | ⚠️ Szenario vorhanden | ❌ CI | ❌ | 🟡 Mock OK |
| **Config Update (Sensor/Actuator)** | ✅ Infra-Tests | ⚠️ 2 Szenarien vorhanden | ❌ CI | ❌ | 🔴 CI-Lücke |
| **Zone Assignment** | ✅ 16 Tests | ⚠️ Szenario vorhanden | ❌ CI | ❌ | 🟡 Mock OK |
| **Subzone Management** | ✅ 16 Tests | ⚠️ Szenario vorhanden | ❌ CI | ❌ | 🟡 Mock OK |
| **GPIO Safe-Mode Init** | ✅ Indirekt | ✅ 1 Szenario | ✅ | — | ✅ Gut |
| **GPIO Pin-Reservation** | ✅ 11 Tests | ❌ | ❌ | ❌ | ✅ Gut (Mock) |
| **GPIO Emergency Safe-Mode** | ❌ | ❌ | ❌ | ❌ | 🔴 Lücke |
| **Boot-Loop Detection** | ❌ | ❌ | ❌ | ❌ | 🔴 Lücke |
| **Provisioning (AP-Mode)** | ❌ | ❌ Wokwi-Limit | ❌ | ❌ | 🟡 Hardware-only |
| **Watchdog Feed** | ❌ | ❌ Deaktiviert | ❌ | ❌ | 🟡 Hardware-only |
| **Cross-ESP Orchestrierung** | ✅ 14 Tests | ❌ | ❌ | ❌ | ✅ Gut (Mock) |
| **Performance (Throughput)** | ✅ 16 Tests | ❌ | ❌ | ❌ | ✅ Gut (Mock) |
| **Last-Will Message** | ❌ | ❌ | ❌ | ❌ | 🟡 Mittel |
| **REST API Endpoints** | ❌ 0/13 Dateien | — | ❌ | — | 🔴 Lücke |
| **WebSocket Events** | ❌ 0/2 Dateien | — | ❌ | — | 🔴 Lücke |

### 1.3 Zusammenfassung der Lücken

**Kritische Lücken (kein Test vorhanden):**

| # | Lücke | Risiko | Warum kritisch |
|---|-------|--------|----------------|
| 1 | Actuator Timeout-Protection (`processActuatorLoops`) | Pumpe läuft endlos | Safety-Feature ohne Test |
| 2 | GPIO Emergency Safe-Mode (`enableSafeModeForAllPins`) | Outputs nicht de-energisiert | Safety-Feature ohne Test |
| 3 | Boot-Loop Detection (5 Boots in 60s) | Endloser Crash-Loop | Recovery-Mechanismus ohne Test |
| 4 | REST API Endpoints (13 Placeholder-Dateien) | API-Regression | 0/153 Endpoints getestet |
| 5 | WebSocket Broadcasting | Frontend-Updates kaputt | 0 Tests |
| 6 | MQTT Port-Fallback (8883→1883) | TLS-Fallback scheitert | Nie getestet |

**CI-Lücken (Szenario existiert, nicht in Pipeline):**

| # | Szenario | Blockierender Grund |
|---|----------|---------------------|
| 1 | Actuator LED ON/PWM (2 Szenarien) | MQTT-Injection nicht automatisiert |
| 2 | Emergency Stop (2 Szenarien) | MQTT-Injection nicht automatisiert |
| 3 | Config Update (2 Szenarien) | MQTT-Injection nicht automatisiert |
| 4 | Zone/Subzone (2 Szenarien) | MQTT-Injection nicht automatisiert |

**Kernproblem:** 10 Wokwi-Szenarien brauchen MQTT-Injection. `mqtt_inject.py` existiert bereits, ist aber nicht in den CI-Workflow integriert. **Einzige Blockade ist die CI-Integration.**

---

## Dokument 2: Teststrategie

### 2.1 Test-Pyramide

```
                    ┌─────────────┐
                    │    E2E      │  Wokwi + Server + Frontend
                    │  (3 Tests)  │  Langsam, komplex, wenige
                    └──────┬──────┘
                           │
                 ┌─────────┴─────────┐
                 │   Integration     │  Wokwi + MQTT-Injection
                 │  (16 Szenarien)   │  Mittlere Anzahl
                 └─────────┬─────────┘
                           │
          ┌────────────────┴────────────────┐
          │       Component / Unit          │  MockESP32Client + pytest
          │  (429 Tests, Ziel: 600+)        │  Viele, schnell, CI-First
          └─────────────────────────────────┘
```

### 2.2 Strategie-Prinzipien

1. **Mock-First**: MockESP32Client für alle Logik-Tests. Wokwi nur für echte Firmware-Verifikation.
2. **CI-Gating**: Jeder PR muss alle CI-Tests bestehen. Kein Merge ohne grüne Pipeline.
3. **MQTT-Injection automatisieren**: mqtt_inject.py in Wokwi-CI integrieren → sofort 10 weitere Szenarien aktiv.
4. **Safety-Tests priorisieren**: Emergency Stop, Timeout-Protection, Safe-Mode zuerst.
5. **Hardware-Tests dokumentieren**: Was Wokwi nicht kann, als manuelles Testprotokoll.

### 2.3 Test-Ebenen pro Flow

#### Ebene 1: Unit/Component Tests (Server MockESP32Client)

**Geeignet für:** Alle Logik-Tests, Circuit Breaker, State Machines, Payload-Validierung, Safety-Checks.

**Vorteile:** Schnell (<30s), deterministisch, kein Hardware/Broker nötig.

**Nicht geeignet für:** Echte Firmware-Verhalten, Timing, GPIO-Hardware.

| Neue Tests | Datei | Geschätzte Tests |
|------------|-------|-----------------|
| Actuator Timeout-Protection | `test_actuator_timeout.py` | 12 |
| GPIO Emergency Safe-Mode | `test_gpio_emergency.py` | 8 |
| Boot-Loop Detection | `test_boot_loop.py` | 6 |
| MQTT Port-Fallback | `test_mqtt_fallback.py` | 5 |
| Last-Will Message | `test_mqtt_last_will.py` | 4 |
| **REST API** (13 Dateien) | `test_api_*.py` | ~120 |
| **WebSocket** (2 Dateien) | `test_websocket_*.py` | ~20 |
| **Summe neue Tests** | | **~175** |

#### Ebene 2: Wokwi Integration Tests

**Geeignet für:** Boot-Sequenz, Sensor-Reads, Actuator-Commands, MQTT-Kommunikation, Emergency Stop.

**Nicht geeignet für:** WiFi-Disconnect (Wokwi: immer verbunden), NVS-Persistenz, Watchdog, Provisioning.

| Status | Szenarien | CI-Aktion |
|--------|-----------|-----------|
| ✅ Aktiv in CI | 6 (Boot×2, Sensor×2, MQTT×1, Legacy×1) | Beibehalten |
| 🔧 CI-Integration nötig | 10 (Actuator×4, Zone×2, Emergency×2, Config×2) | mqtt_inject.py integrieren |
| 📝 Neu zu erstellen | 4 (siehe unten) | Nach MQTT-Integration |

**Neue Wokwi-Szenarien:**

| Szenario | Beschreibung | Methode |
|----------|-------------|---------|
| `sensor_multi_read.yaml` | 2 Sensoren (DS18B20 + DHT22) parallel lesen | Erweitertes diagram.json |
| `actuator_timeout.yaml` | Actuator ON → Timeout → Auto-Stop | MQTT-Injection + Wait |
| `config_full_cycle.yaml` | Config senden → ACK empfangen → Sensor aktiv | MQTT-Injection |
| `reconnect_mqtt.yaml` | MQTT-Disconnect → Reconnect → Buffer-Flush | Broker-Restart in CI |

#### Ebene 3: Hardware-Tests (manuelles Protokoll)

**Nur für Features die Wokwi nicht simulieren kann:**

| Test | Warum Hardware nötig | Protokoll |
|------|---------------------|-----------|
| WiFi Reconnect nach Disconnect | Wokwi: WiFi immer verbunden | Router aus/an, Serial Monitor beobachten |
| Watchdog-Timeout | Wokwi: `#ifdef WOKWI_SIMULATION` deaktiviert | `delay(70000)` in loop, ESP muss neustarten |
| Provisioning AP-Mode | Wokwi: kein AP-Mode | Mit Handy zu AP verbinden, Config senden |
| NVS-Persistenz | Wokwi: kein Flash-Persistenz | Config speichern, Neustart, Config prüfen |
| Boot-Button Factory-Reset | Wokwi: GPIO 0 floated LOW | Physischen Button drücken |
| TLS/SSL MQTT (Port 8883) | Wokwi: kein TLS | Zertifikat-basierte Verbindung |

### 2.4 CI/CD Integration

**Aktueller Workflow:** `wokwi-tests.yml`

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Build FW    │────►│  Boot Tests  │────►│ Sensor Tests │
│  (pio run)   │     │  (2 Szenarien)│     │ (2 Szenarien)│
└──────────────┘     └──────────────┘     └──────────────┘
                                                │
                     ┌──────────────┐           │
                     │ MQTT Legacy  │◄──────────┘
                     │ (1 Szenario) │
                     └──────────────┘
```

**Ziel-Workflow (nach MQTT-Injection-Integration):**

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Build FW    │────►│  Boot Tests  │────►│ Sensor Tests │────►│Actuator Tests│
│  (pio run)   │     │  (2)         │     │ (2+1 neu)    │     │ (4)          │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                                                                      │
┌──────────────┐     ┌──────────────┐     ┌──────────────┐           │
│ Config Tests │◄────│Emergency Tests│◄────│  Zone Tests  │◄──────────┘
│ (2)          │     │ (2)          │     │ (2)          │
└──────────────┘     └──────────────┘     └──────────────┘
```

**CI-Änderungen benötigt:**
1. MQTT-Injection-Step in wokwi-tests.yml: `python mqtt_inject.py` nach Wokwi-Start
2. Timing: Wokwi starten → 10s warten (Boot) → MQTT injizieren → Serial prüfen
3. Parallel-Jobs für unabhängige Test-Kategorien

---

## Dokument 3: Test-Szenarien-Katalog

### 3.1 Pending-Flow Tests

**Status:** ✅ 50 Tests existieren in `test_pending_flow_blocking.py`. Sehr gut abgedeckt.

**Fehlende Ergänzungen:**

| Test-ID | Beschreibung | Methode | Erwartetes Ergebnis |
|---------|--------------|---------|---------------------|
| PF-051 | Dual-CB: MQTT OPEN + WiFi OPEN gleichzeitig | Mock | Kein Reconnect-Versuch, Main-Loop < 10ms |
| PF-052 | Offline-Buffer bei CB HALF_OPEN | Mock | Buffer wird geflusht wenn HALF_OPEN Reconnect erfolgreich |
| PF-053 | safePublish während CB CLOSED→OPEN Transition | Mock | Max 1 Retry, kein 2. Versuch nach CB-Öffnung |
| PF-054 | HTTP CB OPEN → Sensor weiterhin MQTT-published | Mock | raw_mode Daten weiterhin published, nur Pi-Enhanced gestoppt |

### 3.2 Sensor-Flow Tests

| Test-ID | Beschreibung | Methode | Erwartetes Ergebnis |
|---------|--------------|---------|---------------------|
| SF-001 | DS18B20 Read + MQTT Publish | Wokwi (CI) | ✅ Existiert: `sensor_ds18b20_read.yaml` |
| SF-002 | Heartbeat mit GPIO-Status | Wokwi (CI) | ✅ Existiert: `sensor_heartbeat.yaml` |
| SF-003 | Multi-Sensor parallel (DS18B20 + DHT22) | Wokwi (neu) | Beide Sensoren publishen innerhalb 5s |
| SF-004 | Sensor-Daten Payload-Validierung | Mock | ✅ Existiert: 47 Tests in `test_production_accuracy.py` |
| SF-005 | Sensor bei CB OPEN (kein MQTT) | Mock | Sensor liest weiter, Daten in Buffer |
| SF-006 | Pi-Enhanced Fallback bei HTTP-Timeout | Mock | ✅ Existiert: 33 Tests in `test_library_e2e_integration.py` |
| SF-007 | Sensor mit quality=poor Meldung | Mock (neu) | `quality` Feld korrekt in Payload |
| SF-008 | SHT31 Multi-Value (temp+humidity) | Mock | ✅ Existiert: 7 Tests in `test_multi_value_sensor.py` |

### 3.3 Actuator-Flow Tests

| Test-ID | Beschreibung | Methode | Erwartetes Ergebnis |
|---------|--------------|---------|---------------------|
| AF-001 | LED ON Command via MQTT | Wokwi | Serial: `"Actuator"`, GPIO 5 HIGH |
| AF-002 | PWM Set Value 0.5 | Wokwi | Serial: `"PWM"`, LED-Helligkeit 50% |
| AF-003 | Emergency Stop (Broadcast) | Wokwi | Serial: `"BROADCAST EMERGENCY-STOP"` |
| AF-004 | Emergency Stop (ESP-spezifisch) | Wokwi | Serial: `"AUTHORIZED EMERGENCY-STOP"` |
| AF-005 | **Timeout-Protection** (NEU) | Mock | Actuator auto-off nach max_runtime_ms |
| AF-006 | PWM Value Clamping (1.5 → 1.0) | Mock | constrain(value, 0.0, 1.0) angewendet |
| AF-007 | Binary Actuator rejects 0.5 | Mock | returns false, ERROR_COMMAND_INVALID |
| AF-008 | TOGGLE Command | Mock | Zustand invertiert |
| AF-009 | Command bei Emergency-Stopped | Mock | returns false, Warnung geloggt |
| AF-010 | Runtime-Reconfiguration (Typ-Wechsel) | Mock | Emergency-Stop vor Typ-Wechsel |
| AF-011 | **Actuator Response Publishing** (NEU) | Mock | Response mit correlation_id auf MQTT |
| AF-012 | **Actuator Alert bei Timeout** (NEU) | Mock | Alert mit "runtime_protection" auf MQTT |

### 3.4 GPIO/SafeMode Tests

| Test-ID | Beschreibung | Methode | Erwartetes Ergebnis |
|---------|--------------|---------|---------------------|
| GM-001 | Safe-Mode Init (alle Pins INPUT_PULLUP) | Wokwi (CI) | ✅ Existiert: `boot_safe_mode.yaml` |
| GM-002 | Pin-Reservation Konflikt | Mock | ✅ Existiert: 11 Tests in `test_gpio_status.py` |
| GM-003 | **Emergency Safe-Mode** (NEU) | Mock | Alle Outputs LOW → INPUT_PULLUP, Owners gelöscht |
| GM-004 | **De-energize vor Mode-Change** (NEU) | Mock | digitalWrite(LOW) vor pinMode(INPUT_PULLUP) |
| GM-005 | Input-Only Pin Protection (GPIO 34) | Mock | OUTPUT auf GPIO 34 rejected |
| GM-006 | Subzone Pin-Assignment | Mock | ✅ Existiert: 16 Tests |
| GM-007 | Subzone Multi-Assignment Conflict | Mock | ✅ Existiert: 16 Tests |
| GM-008 | **Release + Reallocate Pin** (NEU) | Mock | Pin freigeben, neu zuweisen funktioniert |
| GM-009 | I2C-Pins Auto-Reserved | Mock | SDA/SCL nach Init nicht verfügbar |

### 3.5 Server-Kommunikation Tests

| Test-ID | Beschreibung | Methode | Erwartetes Ergebnis |
|---------|--------------|---------|---------------------|
| SC-001 | Heartbeat Publish | Wokwi (CI) | ✅ Existiert |
| SC-002 | Config Command empfangen | Wokwi | Serial: `"config"` |
| SC-003 | Zone Assignment ACK | Wokwi | Serial: `"ZONE ASSIGNMENT RECEIVED"` |
| SC-004 | **MQTT Reconnect + Buffer Flush** (NEU) | Wokwi/Mock | Buffer-Nachrichten in Reihenfolge published |
| SC-005 | **Last-Will Message Format** (NEU) | Mock | Topic endet mit `/will`, Payload hat status+reason+timestamp |
| SC-006 | **Port-Fallback 8883→1883** (NEU) | Mock | Erster Versuch 8883 fehlschlägt, 1883 erfolgreich |
| SC-007 | Config Response (SUCCESS) | Mock | ConfigResponseBuilder published ACK |
| SC-008 | Config Response (PARTIAL_SUCCESS) | Mock | Fehler-Details in Response |
| SC-009 | **Exponential Backoff Sequenz** (NEU) | Mock | 1s→2s→4s→8s→16s→32s→60s cap |

### 3.6 Boot & System Tests

| Test-ID | Beschreibung | Methode | Erwartetes Ergebnis |
|---------|--------------|---------|---------------------|
| BS-001 | Full 5-Phase Boot | Wokwi (CI) | ✅ Existiert |
| BS-002 | Safe-Mode zuerst | Wokwi (CI) | ✅ Existiert |
| BS-003 | **Boot-Loop Detection** (NEU) | Mock | 6 Boots in 60s → STATE_SAFE_MODE |
| BS-004 | **Boot-Counter Reset nach 60s** (NEU) | Mock | Boot nach 61s → Counter reset |
| BS-005 | **millis() Overflow Handling** (NEU) | Mock | Overflow → time_since_last_boot = 60001 |
| BS-006 | Provisioning Watchdog (300s) | Hardware | esp_task_wdt_init(300, false) |
| BS-007 | Production Watchdog (60s) | Hardware | esp_task_wdt_init(60, true) |
| BS-008 | **Provisioning Failure → LED Blink** (NEU) | Mock | 3× Blink-Pattern, Endlosschleife |

### 3.7 REST API Tests (Server)

| Test-ID | Datei | Endpoints | Geschätzte Tests |
|---------|-------|-----------|-----------------|
| API-001 | `test_api_esp.py` | 15 ESP-Endpoints | 20 |
| API-002 | `test_api_sensors.py` | 11 Sensor-Endpoints | 15 |
| API-003 | `test_api_actuators.py` | 8 Actuator-Endpoints | 12 |
| API-004 | `test_api_logic.py` | 8 Logic-Endpoints | 10 |
| API-005 | `test_api_health.py` | 6 Health-Endpoints | 8 |
| API-006 | `test_api_auth.py` | 10 Auth-Endpoints | 15 |
| API-007 | `test_api_subzones.py` | 6 Subzone-Endpoints | 10 |
| API-008-013 | Weitere 6 Dateien | Zone, Users, etc. | 30 |
| **Summe** | 13 Dateien | 153 Endpoints | **~120** |

---

## Dokument 4: Implementierungsplan

### Phase 1: Quick Wins — MQTT-Injection CI-Integration

**Aufwand:** Klein
**Impact:** 10 weitere Wokwi-Szenarien in CI aktiv (von 6 auf 16)

**Aufgaben:**
1. `wokwi-tests.yml` erweitern:
   - Wokwi im Hintergrund starten
   - 15s Boot-Wait
   - `python mqtt_inject.py` mit passendem Topic/Payload
   - `wait-serial` für erwarteten Output
2. Neue CI-Jobs: `actuator-tests`, `emergency-tests`, `zone-tests`, `config-tests`
3. Erweitertes `diagram.json` mit DHT22 + Red LED für mehr Szenarien

**Ergebnis:** CI-Coverage von ~35% auf ~85% der Wokwi-Szenarien.

### Phase 2: Kritische Safety-Tests (Mock)

**Aufwand:** Mittel
**Impact:** Safety-Features endlich getestet

**Neue Test-Dateien:**

| Datei | Tests | Beschreibung |
|-------|-------|-------------|
| `test_actuator_timeout.py` | 12 | Timeout-Protection, Auto-Stop, Alert-Publishing |
| `test_gpio_emergency.py` | 8 | Emergency Safe-Mode, De-energize-Sequenz |
| `test_boot_loop.py` | 6 | Boot-Loop Detection, Counter-Reset, Overflow |
| `test_mqtt_fallback.py` | 5 | Port 8883→1883 Fallback |
| `test_mqtt_last_will.py` | 4 | Last-Will Topic/Payload Format |
| **Summe** | **35** | |

### Phase 3: REST API Tests

**Aufwand:** Groß
**Impact:** Server-API vollständig getestet

**Umsetzung:** Die 13 Placeholder-Dateien in `tests/integration/` füllen. Pro Endpoint: Happy Path + Error Cases + Edge Cases.

**Prioritätsreihenfolge:**
1. `test_api_esp.py` — Kern-CRUD für ESP-Devices
2. `test_api_actuators.py` — Safety-kritisch (Emergency Stop API)
3. `test_api_sensors.py` — Daten-Integrität
4. `test_api_auth.py` — Security
5. Rest nach Bedarf

**Geschätzt: ~120 neue Tests.**

### Phase 4: Neue Wokwi-Szenarien

**Aufwand:** Mittel

| Szenario | diagram.json Änderung | Beschreibung |
|----------|-----------------------|-------------|
| `sensor_multi_read.yaml` | + DHT22 auf GPIO 15 | 2 Sensoren parallel |
| `actuator_timeout.yaml` | Bestehendes Setup | ON → 30s → Auto-Stop prüfen |
| `config_full_cycle.yaml` | Bestehendes Setup | Config → Sensor aktiv → Daten |
| `reconnect_mqtt.yaml` | Bestehendes Setup | Broker-Restart → Auto-Reconnect |

### Phase 5: Hardware-Tests (Ongoing)

**Manuelles Testprotokoll erstellen für:**
- WiFi-Disconnect Recovery (Router aus/an)
- Watchdog-Timeout (60s Production Mode)
- Provisioning AP-Mode (Handy-Test)
- NVS-Persistenz (Reboot-Test)
- TLS/SSL MQTT (Zertifikat)

**Format:** Checkliste mit Schritten, erwarteten Ergebnissen, Pass/Fail-Kriterien.

---

## Anhang: Test-Metriken Ziel

| Metrik | Aktuell | Nach Phase 1 | Nach Phase 2 | Nach Phase 3 | Ziel |
|--------|---------|-------------|-------------|-------------|------|
| **Gesamt-Tests** | 445 | 445 | 480 | 600 | 600+ |
| **Wokwi CI-Szenarien** | 6/16 | 16/16 | 16/20 | 20/20 | 20 |
| **Safety-Tests** | 64 | 64 | 99 | 99 | 100+ |
| **API-Tests** | 0 | 0 | 0 | 120 | 120+ |
| **CI-Laufzeit** | ~3 Min | ~8 Min | ~8 Min | ~12 Min | <15 Min |

---

## Anhang: Wokwi-Limitierungen Zusammenfassung

| Feature | Wokwi-Support | Workaround |
|---------|:------------:|------------|
| GPIO Digital | ✅ | — |
| GPIO PWM (LEDC) | ✅ | — |
| DS18B20 OneWire | ✅ (22.5°C fix) | Logik-Tests über Mock |
| DHT22 | ✅ (konfigurierbar) | — |
| I2C Sensoren | ✅ | — |
| WiFi-Disconnect | ❌ | Mock-Tests |
| NVS-Persistenz | ❌ | Mock-Tests |
| Watchdog | ❌ (deaktiviert) | Hardware-Test |
| AP-Mode | ❌ | Hardware-Test |
| TLS/SSL | ❌ | Hardware-Test |
| Bluetooth | ❌ | — |
| Boot-Button (GPIO 0) | ⚠️ (floated LOW) | Hardware-Test |
