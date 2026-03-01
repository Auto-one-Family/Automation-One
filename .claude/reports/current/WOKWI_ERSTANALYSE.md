# Wokwi IST-Zustand Erstanalyse

> **Version:** 2.0
> **Datum:** 2026-03-01
> **Agents:** system-control + esp32-debug + esp32-development
> **Scope:** Vollständige Analyse aller Wokwi-Komponenten im AutomationOne-System
> **Status:** Erstanalyse (ersetzt v1.0 vom 2026-02-23)

---

## 1. Architektur-Übersicht

### Wokwi im AutomationOne-Stack

```
Wokwi-CLI / VS Code Extension
  └── ESP32 Virtual Firmware (.pio/build/wokwi_simulation/firmware.bin)
        ├── WiFi: "Wokwi-GUEST" (offenes WLAN, Wokwi-intern)
        └── MQTT: host.wokwi.internal:1883
              └── Gateway → localhost:1883
                    └── Docker: automationone-mqtt (eclipse-mosquitto:2)
                          └── El Servador (FastAPI) ← PostgreSQL
```

### Dateien-Inventar

| Komponente | Pfad | Funktion |
|------------|------|----------|
| **Haupt-Diagramm** | `El Trabajante/diagram.json` | Virtuelle Hardware (ESP32 + 7 Bauteile) |
| **Wokwi-Config** | `El Trabajante/wokwi.toml` | CLI-Konfiguration, Gateway, RFC2217 |
| **Build-Environment** | `El Trabajante/platformio.ini` → `[env:wokwi_simulation]` | Firmware-Build mit Wokwi-Flags |
| **Multi-Device** | `platformio.ini` → `[env:wokwi_esp01/02/03]` | 3 parallele ESP-IDs |
| **Test-Scenarios** | `El Trabajante/tests/wokwi/scenarios/` | 178 YAML-Test-Szenarien |
| **Legacy-Tests** | `El Trabajante/tests/wokwi/boot_test.yaml`, `mqtt_connection.yaml` | 2 Legacy-Szenarien |
| **Extended-Diagramme** | `tests/wokwi/diagrams/diagram_extended.json`, `diagram_i2c.json` | Alternative Hardware-Konfigurationen |
| **Test-Runner** | `scripts/run-wokwi-tests.py` | Python Test-Orchestrator |
| **CI-Pipeline** | `.github/workflows/wokwi-tests.yml` | GitHub Actions Workflow |
| **Serial-Logger** | `El Trabajante/scripts/wokwi_serial_logger.py` | RFC2217-basierter Log-Stream |
| **MQTT-Injection** | `tests/wokwi/helpers/mqtt_inject.py` | paho-mqtt Test-Helper |
| **Preflight-Check** | `tests/wokwi/helpers/preflight_check.sh` | Connectivity-Validierung |
| **MQTT-Wait** | `tests/wokwi/helpers/wait_for_mqtt.sh` | Boot-Completion-Detection |
| **DB-Seed** | `El Servador/god_kaiser_server/scripts/seed_wokwi_esp.py` | ESP_00000001/02/03 erstellen |
| **Dev-Starter** | `scripts/start-wokwi-dev.ps1` | PowerShell Full-Stack-Startup |
| **Quick-Starter** | `scripts/run-wokwi.bat` | Batch-Datei Wokwi-CLI-Start |
| **Firewall-Script** | `scripts/add-firewall-rule.ps1` | Windows-Firewall Port 1883 |
| **Referenz-Docs** | `.claude/reference/testing/WOKWI_TESTING.md`, `WOKWI_ERROR_MAPPING.md` | Agent-Referenzdokumentation |

---

## 2. Hardware-Konfiguration (diagram.json)

### Aktives Haupt-Diagramm (`El Trabajante/diagram.json`)

| Bauteil-ID | Typ | GPIO | Vorwiderstand | Wert |
|------------|-----|------|---------------|------|
| `esp` | ESP32-DevKit-v1 | - | - | - |
| `temp1` | DS18B20 | D4 (GPIO 4) | 4.7kΩ Pull-Up (r1) | 22.5°C (konstant) |
| `dht22` | DHT22 | D15 (GPIO 15) | keiner | 23.5°C / 65% |
| `pot_analog` | Potentiometer | GPIO 34 (ADC) | keiner | 50% |
| `led1` | LED grün | D5 (GPIO 5) | 220Ω (r2) | - |
| `led_red` | LED rot | D13 (GPIO 13) | 220Ω | - |
| `led_blue` | LED blau | D14 (GPIO 14) | 220Ω | - |
| `btn_emergency` | Taster rot | D27 (GPIO 27) | an GND | Label: EMERGENCY |

**GPIO-Belegung gesamt:** 4, 5, 13, 14, 15, 27, 34

### Alternative Diagramme (nicht aktiv im CI)

| Diagramm | Bauteile | Zusätzliche GPIOs | Zweck |
|----------|----------|-------------------|-------|
| `diagram_extended.json` | ESP32 + DS18B20 + LED grün + LED rot + DHT22 + Boot-Button | D0, D4, D5, D15, D18 | Erweiterte Tests |
| `diagram_i2c.json` | ESP32 + SHT30 + BME280 + DS18B20 + LED | D4, D5, D21, D22 | I2C-Bus Tests |

**Wichtig:** Nur `diagram.json` im Root wird vom CI verwendet. Die alternativen Diagramme müssen manuell gewechselt werden.

---

## 3. Firmware Wokwi-Integration

### WOKWI_SIMULATION Preprocessor-Branches (17 Stellen in 4 Dateien)

| Datei | Branches | Betroffene Features |
|-------|----------|---------------------|
| `main.cpp` | 6 | Serial-Delay, Watchdog, Factory-Reset, Provisioning-WDT, WDT-Feed |
| `config_manager.cpp` | 8 | WiFi-Config, ESP-ID, Sensor/Actuator NVS Save/Load |
| `provision_manager.cpp` | 2 | MQTT-Host-Fallback, MQTT-Port-Fallback |
| `onewire_bus.cpp` | 1 | Nur Log-Ausgabe (kein Verhaltensunterschied) |

### Boot-Sequenz in Wokwi (5 Phasen)

```
Phase 0: Hardware Init
  └── Serial-Delay: 500ms statt 100ms (Wokwi UART langsamer)
  └── Watchdog: DEAKTIVIERT (WDT_DISABLED)
  └── Factory-Reset: ÜBERSPRUNGEN (GPIO 0 Float-Problem)

Phase 1: Core Infrastructure
  └── GPIO Safe-Mode: IDENTISCH zu Hardware
  └── Logger: IDENTISCH
  └── ConfigManager: WOKWI-Branch → Compile-Time Credentials
       └── WiFi: "Wokwi-GUEST" (kein Passwort)
       └── MQTT: host.wokwi.internal:1883 (anonym)
       └── config.configured = true → Provisioning ÜBERSPRUNGEN

Phase 2: Communication Layer
  └── WiFi: Wokwi-GUEST verbindet automatisch
  └── MQTT: host.wokwi.internal → Gateway → localhost:1883
  └── Heartbeat: Initialer Heartbeat nach MQTT-Connect
  └── 10 Topics subscribed (inkl. Wildcards)

Phase 3: Hardware Abstraction
  └── I2C Bus Manager: IDENTISCH
  └── OneWire: IDENTISCH (nur extra Log in Wokwi)

Phase 4-5: Sensor + Actuator System
  └── IDENTISCH (keine Wokwi-Branches)
```

### Deaktivierte Features in Wokwi

| Feature | Methode | Konsequenz |
|---------|---------|------------|
| **Watchdog** | `WDT_DISABLED` + `#ifndef` vor `esp_task_wdt_reset()` | Kein WDT-Timeout, kein Panic, Error 4070 nicht testbar |
| **Factory-Reset-Button** | `#ifndef WOKWI_SIMULATION` | GPIO-0-Hold nicht testbar |
| **Provisioning (AP-Mode)** | `config.configured = true` | Captive Portal, WiFi-AP nie aktiv |
| **NVS Sensor/Actuator** | `return true` / `return false` ohne NVS | Config nur in RAM, geht bei Reboot verloren |
| **TLS/MQTT-Auth** | Port 1883, anonym | Kein TLS, kein Username/Password |

### NVS-Verhalten: Was persistent vs. transient ist

| NVS-Namespace | In Wokwi geschrieben? | Begründung |
|---------------|----------------------|------------|
| `wifi_config` | NEIN | Wokwi-Branch returnt vor NVS-Zugriff |
| `sensor_config` | NEIN | Wokwi-Branch: RAM-only |
| `actuator_config` | NEIN | Wokwi-Branch: RAM-only |
| `system_config` | JA | **Kein** Wokwi-Branch in saveSystemConfig() |
| `zone_config` | JA | **Kein** Wokwi-Branch |

**Inkonsistenz:** system_config und zone_config werden in Wokwi in NVS geschrieben, sensor/actuator nicht. Funktional unkritisch (Wokwi-NVS ist transient per Session), aber Design-Inkonsistenz.

---

## 4. Build-Konfiguration

### Environment-Vererbung

```
esp32_dev (Basis-Board)
  └── wokwi_simulation (extends esp32_dev + Wokwi-Flags)
        ├── wokwi_esp01 (ESP_00000001)
        ├── wokwi_esp02 (ESP_00000002)
        └── wokwi_esp03 (ESP_00000003)
```

### Wokwi-spezifische Build-Flags

```ini
-D WOKWI_SIMULATION=1                           # Aktiviert alle #ifdef Branches
-D WOKWI_WIFI_SSID=\"Wokwi-GUEST\"              # Offenes WLAN
-D WOKWI_WIFI_PASSWORD=\"\"                      # Kein Passwort
-D WOKWI_MQTT_HOST=\"host.wokwi.internal\"       # Gateway zum Host
-D WOKWI_MQTT_PORT=1883                          # Plaintext MQTT
-D WOKWI_ESP_ID=\"ESP_00000001\"                 # Feste ESP-ID
-DCONFIG_ARDUHAL_LOG_COLORS=0                    # Kein ANSI in Serial
```

### Erbt von esp32_dev

```
CORE_DEBUG_LEVEL=3, MAX_SENSORS=20, MAX_ACTUATORS=12
MQTT_MAX_PACKET_SIZE=2048, MQTT_KEEPALIVE=60
Libraries: PubSubClient, ArduinoJson, OneWire, DallasTemperature, Adafruit BME280, Unity
```

---

## 5. Test-Framework

### Szenario-Übersicht (178 total)

| Kategorie | Ordner | Anzahl | CI-Status | PR/Push | Nightly |
|-----------|--------|--------|-----------|---------|---------|
| Boot | 01-boot | 2 | Aktiv | 2 | 2 |
| Sensor | 02-sensor | 5 | Aktiv | 2+3 | 5 |
| Actuator | 03-actuator | 7 | Aktiv | 4+3 | 7 |
| Zone | 04-zone | 2 | Aktiv | 2 | 2 |
| Emergency | 05-emergency | 3 | Aktiv | 2+1 | 3 |
| Config | 06-config | 2 | Aktiv | 2 | 2 |
| Combined | 07-combined | 2 | Aktiv | 2 | 2 |
| I2C | 08-i2c | 20 | **INAKTIV** | 0 | 0 |
| OneWire | 08-onewire | 29 | Aktiv | 0 | 29 |
| Hardware | 09-hardware | 9 | Aktiv | 0 | 9 |
| PWM | 09-pwm | 18 | Aktiv | 3 | 18 |
| NVS | 10-nvs | 40 | Aktiv (35) | 5 | 35 |
| Error-Injection | 11-error-injection | 10 | Aktiv | 10 | 10 |
| Correlation | 12-correlation | 5 | Aktiv | 0 | 5 |
| GPIO | gpio | 24 | Aktiv | 0 | 24 |
| **Legacy** | Root | 2 | Aktiv | 1 | 2 |
| **Total** | | **178** | **153 aktiv** | **~52** | **~155** |

### Deaktivierte/Übersprungene Tests

| Szenario | Grund |
|----------|-------|
| 08-i2c (20 Szenarien) | Erfordert BME280 Custom-Chip (Stufe 4) |
| 10-nvs: nvs_pers_bootcount/reboot/sensor/wifi/zone (5) | NVS-Persistenz erfordert ESP-Reboot (nicht in Wokwi) |

### Szenario-Step-Typen

| Step | Verwendung | Beschreibung |
|------|------------|--------------|
| `wait-serial: "Pattern"` | Alle Szenarien | Wartet auf String im Serial-Output |
| `delay: N` | Error-Injection, Combined | Zeitverzögerung in Millisekunden |
| `set-control` | PWM, Emergency | Simuliert Hardware-Interaktion |

### CI-Pipeline Struktur

```
Trigger: Push/PR → El Trabajante/**, Nightly 2 AM UTC, Manual

Job 1: build-firmware
  └── pio run -e wokwi_simulation → Artifact upload

Jobs 2-17: Test-Kategorien (parallel)
  └── Download Firmware Artifact
  └── Start Mosquitto Container (anonym, Port 1883)
  └── Install wokwi-cli
  └── Run scenarios via wokwi-cli --scenario

Nightly: +6 Extended Jobs (OneWire, Hardware, PWM, NVS, GPIO, Correlation)

Secret: WOKWI_CLI_TOKEN (GitHub Secret)
Plan: Pro ($25/seat/month), 2000 CI-Min/Monat
```

---

## 6. Konnektivität und Infrastruktur

### MQTT-Pfad (Wokwi → Server)

```
Wokwi ESP32 (virtuell)
  → WiFi: Wokwi-GUEST (internes Wokwi-Netz)
  → DNS: host.wokwi.internal → Host-Rechner
  → TCP: Port 1883 (Plaintext, anonym)
  → Docker: automationone-mqtt (eclipse-mosquitto:2)
  → El Servador (FastAPI, heartbeat_handler.py)
  → PostgreSQL (esp_devices Tabelle)
```

### Voraussetzungen (Windows)

| Anforderung | Prüfung | Fix |
|-------------|---------|-----|
| Kein lokaler Mosquitto-Service | `tasklist \| grep mosquitto` | `net stop mosquitto` |
| Docker-Port 1883 published | `docker ps \| grep 0.0.0.0:1883` | `docker compose up -d mqtt-broker` |
| Windows-Firewall Port 1883 | `Get-NetFirewallRule "Mosquitto MQTT"` | `scripts/add-firewall-rule.ps1` |
| WOKWI_CLI_TOKEN gesetzt | `$env:WOKWI_CLI_TOKEN` | Token von wokwi.com/dashboard/ci |
| Firmware gebaut | `.pio/build/wokwi_simulation/firmware.bin` | `pio run -e wokwi_simulation` |
| DB geseeded | ESP_00000001 in esp_devices | `python scripts/seed_wokwi_esp.py` |

### Device-Registration-Flow

```
1. Wokwi-ESP bootet → MQTT Connect
2. ESP sendet initialen Heartbeat (publishHeartbeat(true))
3. Server heartbeat_handler.py:139 → Device auf "online"
4. Server sendet Heartbeat-ACK
5. ESP mqttClient.confirmRegistration() → Registration Gate öffnet
6. Fallback: 10s Timeout → Gate öffnet automatisch
7. Erst danach: Sensor/Actuator-Daten werden publiziert
```

### Subscribed Topics (nach Connect)

```
kaiser/god/esp/ESP_00000001/system/command
kaiser/god/esp/ESP_00000001/config
kaiser/broadcast/emergency
kaiser/god/esp/ESP_00000001/actuator/+/command        (Wildcard)
kaiser/god/esp/ESP_00000001/actuator/emergency
kaiser/god/esp/ESP_00000001/zone/assign
kaiser/god/esp/ESP_00000001/zone/subzone/assign
kaiser/god/esp/ESP_00000001/zone/subzone/remove
kaiser/god/esp/ESP_00000001/sensor/+/command           (Wildcard)
kaiser/god/system/heartbeat/ack
```

---

## 7. DB-Seed (Wokwi ESP Devices)

### seed_wokwi_esp.py

**Pfad:** `El Servador/god_kaiser_server/scripts/seed_wokwi_esp.py`
**Ausführung:** Lokal, NICHT im Docker-Container

```powershell
cd "El Servador/god_kaiser_server"
.venv/Scripts/python.exe scripts/seed_wokwi_esp.py
```

**Erstellt 3 Devices:**

| Device-ID | Name | Status | Hardware-Type | Capabilities |
|-----------|------|--------|---------------|--------------|
| ESP_00000001 | Wokwi Simulation ESP #1 | approved | ESP32_WROOM | max_sensors=20, max_actuators=12, wokwi=true |
| ESP_00000002 | Wokwi Simulation ESP #2 | approved | ESP32_WROOM | identisch |
| ESP_00000003 | Wokwi Simulation ESP #3 | approved | ESP32_WROOM | identisch |

**Wichtig:** Status `approved` (pre-approved, kein pending_approval-Schritt nötig).

---

## 8. Serial-Log-Zugriff

### Methoden

| Methode | Tool | Beschreibung |
|---------|------|-------------|
| CLI Direct | `wokwi-cli . --timeout 90000` | Serial direkt in stdout |
| CLI Log-File | `wokwi-cli . --serial-log-file output.log` | Parallel in Datei |
| RFC2217 | `wokwi_serial_logger.py` | Stream über RFC2217 Port 4000 |
| Scenario | `--scenario tests/wokwi/boot_test.yaml` | Automatisierter Test |

### wokwi_serial_logger.py Features

- Verbindet über `rfc2217://localhost:4000`
- Schreibt nach `logs/wokwi_serial.log` (Timestamped)
- Parsed `[DEBUG]` JSON-Lines → `.cursor/debug.log` (NDJSON)
- Erfordert: Wokwi in VS Code gestartet + RFC2217 in wokwi.toml

---

## 9. Bekannte Limitierungen

### Sensor-Limitierungen

| Sensor | Limitierung | Auswirkung |
|--------|-------------|------------|
| DS18B20 | Konstant 22.5°C | Temperatur-basierte Logic nicht testbar |
| DHT22 | Konstant 23.5°C / 65% | Keine dynamischen Umgebungswerte |
| Potentiometer | Fester Wert 50% | ADC-Range nicht durchfahrbar |
| LEDs | Brightness nicht messbar | PWM nur über internen State verifizierbar |

### Nicht-testbare Features

| Feature | Grund | Alternative |
|---------|-------|-------------|
| Watchdog-Timeout (Error 4070) | WDT_DISABLED in Wokwi | Server-seitige Simulation |
| Factory-Reset (GPIO 0) | Kein Button / Float-Problem | MQTT system/command |
| Provisioning (AP-Mode) | config.configured=true | Separater Unit-Test |
| NVS-Persistenz über Reboot | Wokwi-NVS transient pro Session | 5 NVS-Tests geskippt |
| TLS-Verbindung (Port 8883) | Wokwi nutzt Plaintext 1883 | Server-Integration-Tests |
| WiFi-Disconnect/Roaming | Wokwi-GUEST stabil | Server-Mock-Tests |
| I2C-Sensor-Tests | Kein BME280 Custom-Chip | 20 Tests inaktiv (Stufe 4) |

### Wokwi-Simulator Einschränkungen

| Einschränkung | Impact |
|---------------|--------|
| 90s Max-Timeout Default | Lange Tests müssen gesplittet werden |
| Kein MQTT-Broker-Monitoring | Messages nur via Serial-Log verifizierbar |
| Kein Button-Press in Scenarios | Nur via `set-control` Step (limitiert) |
| DS18B20 konstanter Wert | Kein temperaturschwellenbasiertes Testing |
| Kein ESP-Reboot zwischen Steps | NVS-Persistenz nicht prüfbar |

---

## 10. Findings und Inkonsistenzen

### Kritische Findings

| # | Finding | Schwere | Detail |
|---|---------|---------|--------|
| F1 | **boot_test.yaml erwartet "Watchdog configured" - wird in Wokwi nie ausgegeben** | MEDIUM | Legacy-Szenario stimmt nicht mit aktuellem Code überein. Watchdog wird in Wokwi auf WDT_DISABLED gesetzt, kein "Watchdog configured" Serial-Output. `scenarios/01-boot/boot_full.yaml` enthält diesen Check ebenfalls. |
| F2 | **error_watchdog_trigger.yaml ist irreführend benannt** | LOW | Testet NICHT echten Watchdog-Trigger (WDT deaktiviert), sondern Emergency-Stop-Stabilität unter Last. Name im WOKWI_ERROR_MAPPING.md suggeriert falsches Verhalten. |
| F3 | **error_nvs_corrupt.yaml testet keinen NVS-Defekt** | LOW | Testet MQTT Factory-Reset-Command, nicht Error-Code 2001 (NVS_INIT_FAILED). Mapping irreführend. |
| F4 | **sensor_ds18b20_full_flow.yaml wartet auf LOG_DEBUG-String** | MEDIUM | `wait-serial: "Published"` matcht nur bei LOG_DEBUG. Bei Default LOG_INFO → 90s Timeout. |
| F5 | **saveSystemConfig() hat keinen Wokwi-Branch** | LOW | Sensor/Actuator-Config umgeht NVS in Wokwi, System-Config nicht. Design-Inkonsistenz, funktional unkritisch. |
| F6 | **08-i2c (20 Szenarien) komplett inaktiv** | INFO | Warten auf BME280 Custom-Chip (Stufe 4). Infrastruktur vorhanden, diagram_i2c.json existiert. |
| F7 | **Registration Gate als versteckter Timing-Pfad** | MEDIUM | Ohne laufenden Server/geseeded Device: 10s Timeout bevor Sensor/Actuator-Daten publiziert werden. Einige ältere Szenarien prüfen `REGISTRATION CONFIRMED` nicht. |

### Design-Inkonsistenzen

| Inkonsistenz | Betroffene Dateien | Risiko |
|-------------|-------------------|--------|
| NVS-Bypass nur für Sensor/Actuator, nicht System/Zone | config_manager.cpp | Gering (Wokwi-NVS transient) |
| onewire_bus.cpp Wokwi-Branch ändert nichts am Verhalten | onewire_bus.cpp:69 | Keins (nur Log) |
| MQTT-Container-Name hardcodiert in run-wokwi-tests.py | scripts/run-wokwi-tests.py | Gering |
| Kein Diagram-Wechsel-Mechanismus für I2C-Tests | tests/wokwi/diagrams/ | Blockiert I2C-Tests |
| run-wokwi.bat enthält alten Pfad (`PCUser` statt `robin`) | scripts/run-wokwi.bat | Script nicht nutzbar |

---

## 11. Coverage-Einschätzung

### Testabdeckung nach System-Flow

| Flow | Abdeckung | Limitierung |
|------|-----------|-------------|
| Boot-Sequenz | 85% | Provisioning nicht testbar |
| Sensor-Reading | 50% | DS18B20 konstant, DHT22 konstant |
| Actuator-Command | 70% | LED-Brightness nicht messbar |
| Runtime-Config | 60% | Via MQTT-Injection |
| MQTT-Routing | 65% | Nur Serial-Verifizierung |
| Error-Recovery | 30% | WiFi-Drop nicht simulierbar |
| Zone-Assignment | 70% | Via MQTT-Injection |
| Emergency-Stop | 80% | Full-Flow inkl. Clear testbar |
| I2C-Bus | 0% | Komplett blockiert (Custom-Chip) |
| PWM-Steuerung | 65% | Interner State testbar, Output nicht |
| NVS-Storage | 70% | 5 Persistence-Tests geskippt |
| GPIO-Management | 75% | 24 passive Szenarien |

**Gesamtabdeckung: ~55-60%** (realistisch, basierend auf Wokwi-Limitierungen)

---

## 12. Referenz-Dokumentation

| Dokument | Pfad | Aktualität |
|----------|------|------------|
| Wokwi Testing Guide | `.claude/reference/testing/WOKWI_TESTING.md` | v2.1, 2026-02-23 |
| Error-Injection Mapping | `.claude/reference/testing/WOKWI_ERROR_MAPPING.md` | v2.0, 2026-02-22 |
| Test-README | `El Trabajante/tests/wokwi/README.md` | 2026-01-05 (veraltet) |
| Self-Hosted Evaluation | `docs/wokwi-self-hosted-evaluation.md` | 2026-02-23 |
| TM Wokwi-Analyse (archiviert) | `.technical-manager/archive/.../wokwi-analysis-2026-02-10.md` | Archiviert |

---

## 13. Zusammenfassung

### Stärken

- **Saubere Code-Trennung:** 17 Preprocessor-Branches in 4 Dateien, alle kommentiert und begründet
- **Validation auch in Wokwi:** Security-Checks werden nicht umgangen
- **Umfangreiches Test-Framework:** 178 Szenarien in 15 Kategorien
- **CI-Integration:** Automatisierte PR/Push (52 Szenarien) + Nightly (155 Szenarien)
- **Multi-Device-Support:** 3 parallele ESP-Environments vorbereitet (ESP_00000001-03)
- **Credentials-Sicherheit:** Nur offene Netze/anonymes MQTT, kein Secret-Leak
- **Retry-Logik:** Test-Runner kompensiert Wokwi-Flakiness (3 Versuche)
- **Tooling:** Serial-Logger, MQTT-Injection, Preflight-Check, Firewall-Script

### Schwächen

- **20 I2C-Tests blockiert** durch fehlenden Custom-Chip (Stufe 4)
- **Konstante Sensorwerte** limitieren dynamische Tests (DS18B20 22.5°C, DHT22 23.5°C)
- **Legacy-Szenarien** (boot_test.yaml, boot_full.yaml) erwarten "Watchdog configured" das in Wokwi nicht ausgegeben wird
- **Kein automatischer Diagram-Wechsel** für alternative Hardware-Konfigurationen
- **Registration Gate Timing** als versteckter Fehler-Pfad in älteren Szenarien
- **run-wokwi.bat** enthält veralteten Pfad (PCUser statt robin)
- **Irreführende Szenario-Namen** in WOKWI_ERROR_MAPPING.md (Watchdog, NVS)

### Empfehlung für nächste Schritte

1. **F1 (MEDIUM):** boot_test.yaml + boot_full.yaml → "Watchdog configured" Check prüfen/korrigieren
2. **F4 (MEDIUM):** sensor_ds18b20_full_flow.yaml → LOG_DEBUG-Abhängigkeit auflösen
3. **F7 (MEDIUM):** Registration Gate Check in älteren Szenarien nachrüsten
4. **F6 (INFO):** I2C-Diagram-Wechsel-Mechanismus für CI planen
5. **run-wokwi.bat:** Pfad aktualisieren oder Script entfernen
6. **WOKWI_ERROR_MAPPING.md:** Irreführende Namen (F2, F3) korrigieren

---

*Erstanalyse v2.0 abgeschlossen. Für Detail-Analyse einzelner Bereiche: esp32-debug (Log/Error-Analyse), esp32-dev (Code-Patterns), system-control (Infrastruktur/CI).*
