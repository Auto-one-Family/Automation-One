# Auftrag: Wokwi Integration – Full-Stack-Analyse & Verbesserungsplan
Datum: 2026-02-11 01:00
**Modus: PLAN** – Erstelle einen vollständigen Implementierungsplan, keine direkte Umsetzung.
**Mehrere Agents können gestartet werden, aber der Plan muss ohne Pause fertig werden.**

---

## Context

### Systemarchitektur (KRITISCH – muss verstanden werden)

AutomationOne ist **server-zentrisch**: ESP32 = dumme Agenten, ALLE Logik auf dem Server.

```
El Frontend (Vue 3) ←HTTP/WS→ El Servador (FastAPI) ←MQTT→ El Trabajante (ESP32)
Dashboard :5173                ALLE Intelligenz :8000          Dumme Agenten MQTT:1883
```

**Docker Stack (Core):**
- PostgreSQL (automationone-postgres:5432)
- MQTT Broker Mosquitto (automationone-mqtt:1883, 9001)
- El Servador FastAPI (automationone-server:8000)
- El Frontend Vue 3 (automationone-frontend:5173)

### Der echte ESP32 – Wie funktioniert er?

**Erstinbetriebnahme (Provisioning):**
1. ESP32 startet → NVS leer → Captive Portal wird aktiviert
2. ESP erstellt WiFi Access Point: `AutoOne-{ESP_ID}`, Password: `provision`
3. User verbindet und konfiguriert über HTTP-Formular: WiFi-Credentials, MQTT-Host, Kaiser-ID
4. Config wird in NVS gespeichert → ESP rebooted

**Normalbetrieb (nach Provisioning):**
1. ESP liest Config aus NVS
2. WiFi-Verbindung mit gespeicherten Credentials
3. MQTT-Verbindung zum Broker
4. **Heartbeat** alle 60s an Topic: `kaiser/god/esp/{esp_id}/system/heartbeat`
5. Sensoren lesen → MQTT publish
6. Auf Actuator-Commands hören → GPIO steuern
7. **KEIN HTTP nach Provisioning** – alles über MQTT

### Device Approval Flow – DER ECHTE ABLAUF

**⚠️ WICHTIG: Hier gibt es widersprüchliche Reports. Der Agent MUSS den echten Code tracen.**

**Was die Reports sagen:**

Report 1 (wokwi-analysis): "Es gibt keinen Device-Approval-Flow. Devices werden bei Discovery automatisch mit Status 'online' registriert."

Report 2 (phase3-wokwi-bypass): "Heartbeat-Handler setzt Status für neue Devices auf 'pending_approval' (heartbeat_handler.py:124-142). Status-Übergang: pending_approval → approved → online."

Report 3 (wokwi-analysis Korrektur-Section): "Approval-Flow EXISTIERT und ist MQTT-basiert. Heartbeat-Handler (PRIMARY) registriert neue Devices als 'pending_approval'."

**→ DER AGENT MUSS SELBST DEN CODE TRACEN und den ECHTEN Flow dokumentieren:**

Zu prüfen:
- `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` – Was passiert bei neuem ESP? Welcher Status wird gesetzt?
- `El Servador/god_kaiser_server/src/mqtt/handlers/discovery_handler.py` – DEPRECATED oder aktiv?
- `El Servador/god_kaiser_server/src/db/models/esp.py` – Status-Felder, Status-String (kein Enum), Approval-Felder
- `El Servador/god_kaiser_server/src/api/v1/esp.py` – Approval-Endpoints (ESPApprovalRequest, ESPApprovalResponse)
- `El Servador/god_kaiser_server/scripts/seed_wokwi_esp.py` – Welcher Status wird gesetzt?

**Fragen die beantwortet werden MÜSSEN:**
1. Welchen Status bekommt ein NEUES Device bei erstem Heartbeat? → **VERIFIZIERT: "pending_approval"** (heartbeat_handler.py:139)
2. Gibt es einen Status-Übergang der "approved" erfordert bevor "online" möglich ist? → **JA:** pending_approval → approved (Admin API) → online (first heartbeat, heartbeat_handler.py:184)
3. Was passiert wenn ein geseedetes Device (status="offline") einen Heartbeat sendet? → **Agent muss tracen** (Seed setzt "offline", Handler prüft status)
4. Ist der Approval-Flow implementiert und aktiv? → **JA, implementiert und aktiv:** ESPApprovalRequest/Response in esp.py:42-43
5. Welche REST-API-Endpoints existieren für Device-Approval? → **Agent muss vollständige Liste aus esp.py:1-50 extrahieren**

**Status State Machine (verifiziert):**
```
NEUES Device (Discovery via Heartbeat):
  → pending_approval (heartbeat_handler.py:139)

GESEEDETES Device (seed_wokwi_esp.py):
  → offline (seed_wokwi_esp.py:61)
  → first heartbeat → [Agent muss tracen]

Status-Übergänge:
  pending_approval → approved (via Admin API)
  approved → online (first heartbeat nach approval, heartbeat_handler.py:184)
  online ↔ offline (heartbeat timeout)
  * → rejected (via Admin API)
  rejected → pending_approval (nach cooldown, heartbeat_handler.py:152)

Status-Feld: String (kein Enum), Werte: "online, offline, error, unknown, pending_approval, approved, rejected"
```

**Discovery Handler Status:**
- **DEPRECATED** (discovery_handler.py:2-4) – nur Backwards-Compatibility
- PRIMARY: Heartbeat messages für Auto-Discovery

### Wokwi – Wie es aktuell funktioniert

**Wokwi umgeht das Provisioning komplett (Phase 3 bestätigt):**
```
platformio.ini: -D WOKWI_SIMULATION=1
ConfigManager: #ifdef WOKWI_SIMULATION → compile-time credentials
  → ssid = "Wokwi-GUEST"
  → mqtt_host = "host.wokwi.internal"
  → mqtt_port = 1883
  → esp_id = "ESP_00000001"
  → config.configured = true → Provisioning SKIP
```

**Wokwi-Guards im Code:**
| Location | Guard | Zweck |
|----------|-------|-------|
| `config_manager.cpp:71-104` | `#ifdef WOKWI_SIMULATION` | Compile-Time WiFi/MQTT Credentials |
| `main.cpp:164-167` | `#ifdef WOKWI_SIMULATION` | Watchdog deaktiviert |
| `main.cpp:179-242` | `#ifndef WOKWI_SIMULATION` | Boot-Button Factory Reset skip |
| `main.cpp:366-405` | `#ifndef WOKWI_SIMULATION` | Watchdog-Init skip |
| `onewire_bus.cpp:66` | `#ifdef WOKWI_SIMULATION` | OneWire Timing-Anpassung |

**Wokwi-ESP Boot-Ablauf:**
1. Serial init (500ms delay statt 100ms)
2. Watchdog DEAKTIVIERT
3. GPIO Safe-Mode, Logger, Storage, Config
4. ConfigManager: WOKWI_SIMULATION → compile-time credentials, `configured = true`
5. Provisioning check → `provisioning_needed = false` → SKIP
6. WiFi.connect("Wokwi-GUEST") → verbunden
7. MQTT.connect("host.wokwi.internal:1883") → verbunden
8. Heartbeat gesendet → Server empfängt
9. **HIER IST DAS PROBLEM:** Was macht der Server mit dem Heartbeat?

**Seed-Script (seed_wokwi_esp.py):**
```python
ESPDevice(
    device_id="ESP_00000001",
    status="offline",  # ← DAS PROBLEM?
    capabilities={...},
    # approved_at und approved_by sind NULL
)
```

### Wokwi Szenarien & CI

**163 YAML-Szenarien** in 13 Kategorien unter `El Trabajante/tests/wokwi/scenarios/`:
- 01-boot (2), 02-sensor (5), 03-actuator (7), 04-zone (2), 05-emergency (3)
- 06-config (2), 07-combined (2), 08-i2c (20), 08-onewire (29)
- 09-hardware (9+READMEs), 09-pwm (18), 10-nvs (40), gpio (24+READMEs)

**CI-Pipeline (wokwi-tests.yml):**
- 1 Build-Job + 12 parallele Test-Jobs + 1 Summary
- **Nur 23 Szenarien werden getestet** (aus 163!)
- Boot, Sensor, Actuator, Zone, Emergency, Config, Flows
- I2C (20), OneWire (29), Hardware (9), PWM (18), NVS (40), GPIO (24) = **140 Szenarien NICHT in CI**
- **Diskrepanz:** TEST_ENGINE_REFERENCE.md behauptet 138 in CI → **Realität: 23** (TEST_ENGINE_REFERENCE.md ist falsch)

**Makefile:** KEINE Wokwi-Targets vorhanden (verifiziert: `grep wokwi Makefile` → 0 Treffer)

**Helpers:**
- `tests/wokwi/helpers/mqtt_inject.py` – MQTT Message Injection für Tests mit Actuator/Zone Commands
- Funktioniert mit `paho-mqtt`, unterstützt QoS, Repeat, JSON-Validation

**wokwi.toml:**
```toml
[wokwi]
version = 1
firmware = ".pio/build/wokwi_simulation/firmware.bin"
elf = ".pio/build/wokwi_simulation/firmware.elf"
rfc2217ServerPort = 4000

[wokwi.network]
gateway = true  # ← Erlaubt MQTT an externen Broker

[wokwi.serial]
baud = 115200
```

**Wokwi CLI Nutzung:**
```bash
wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/01-boot/boot_full.yaml
wokwi-cli . --timeout 90000 --scenario tests/wokwi/boot_test.yaml
```

**WICHTIG – CI nutzt direkt wokwi-cli:**
- CI verwendet **NICHT** `wokwi/wokwi-ci-action@v1`
- Jeder Test-Step ruft direkt `wokwi-cli . --timeout X --scenario Y` auf
- Das ist relevant für Makefile-Target-Design (müssen wokwi-cli direkt aufrufen)

### Wokwi Best Practices (aus Web-Research)

**WITL (Wokwi in the Loop):**
- Kombiniert Unit-Test-Speed mit Hardware-Testing-Realism
- Cloud-basierte Simulation (Wokwi Server)
- Serial-Output-Validation als primäre Assertion-Methode

**Automation Scenarios (YAML):**
```yaml
name: 'Test Name'
version: 1
steps:
  - wait-serial: 'Expected output'           # Warte auf Serial-Text
  - set-control:                              # Sensor/Button manipulieren
      part-id: btn1
      control: pressed
      value: 1
  - delay: 500ms                              # Warten
  - screenshot:                               # Screenshot für Visual Testing
      part-id: esp
      save-to: screenshot.png
```

**CLI Features:**
- `--expect-text "success"` / `--fail-text "error"` – Simple pass/fail
- `--serial-log-file <path>` – Log für Post-Analysis
- `--timeout <ms>` / `--timeout-exit-code <code>` – Timeout-Handling
- `--diagram-file <path>` – Alternative Hardware-Konfiguration

**GitHub Action (NICHT GENUTZT):**
```yaml
# Aktueller CI-Workflow nutzt NICHT wokwi/wokwi-ci-action@v1
# Stattdessen: Direkter wokwi-cli Aufruf in jedem Test-Step
# Beispiel aus CI:
- name: Run Boot Full Test
  env:
    WOKWI_CLI_TOKEN: ${{ secrets.WOKWI_CLI_TOKEN }}
  run: |
    export PATH="$HOME/.wokwi/bin:$PATH"
    cd "El Trabajante"
    timeout 120 wokwi-cli . \
      --timeout 90000 \
      --scenario tests/wokwi/scenarios/01-boot/boot_full.yaml \
      2>&1 | tee boot_full.log || true
```

---

## Focus

**Wokwi-Integration im Gesamtsystem: ESP32 ↔ MQTT ↔ Server ↔ DB**

Betroffen:
- `El Servador/god_kaiser_server/src/mqtt/handlers/` (Heartbeat, Discovery)
- `El Servador/god_kaiser_server/src/models/esp.py` (Device Status)
- `El Servador/god_kaiser_server/src/api/routes/esp.py` (Approval API)
- `El Servador/god_kaiser_server/scripts/seed_wokwi_esp.py` (Seed-Korrektur)
- `El Trabajante/tests/wokwi/` (Szenarien, CI, Helpers)
- `El Trabajante/wokwi.toml`, `diagram.json`
- `.github/workflows/wokwi-tests.yml` (CI-Coverage)
- `Makefile` (Wokwi-Targets)
- Projekt-Dokumentation (WOKWI_TESTING.md)

---

## Goal

**Einen vollständigen Implementierungsplan erstellen der Wokwi als professionelles Testing-Tool integriert.**

### Teil A: Device Approval Flow verstehen und fixen (PRIORITÄT 1)

1. **Den ECHTEN Code tracen** – nicht auf vorherige Reports verlassen
   - heartbeat_handler.py: Exakt was passiert bei neuem ESP und bei bekanntem ESP
   - Alle Status-Übergänge dokumentieren (State Machine)
   - Approval-Endpoints prüfen (implementiert? funktional?)
2. **Seed-Script korrigieren** – ESP_00000001 mit korrektem Status
3. **Entscheidung treffen:** Soll Wokwi den Approval-Flow testen oder umgehen?
   - **Option A:** Seed mit status="approved" → schneller Start, umgeht Approval
   - **Option B:** Seed mit status="pending_approval" + Auto-Approval Script → testet mehr
   - **Option C:** Server-seitiger Wokwi-Mode mit Auto-Approval für Wokwi-IDs
   - Empfehlung mit Pro/Contra

### Teil B: Wokwi-Szenarien & CI (PRIORITÄT 2)

4. **CI-Coverage Analyse:** Welche 140 Szenarien fehlen in CI und warum?
5. **CI-Workflow erweitern:** Plan für 80%+ Coverage (130+ Szenarien von 163)
   - Welche Szenarien sind tatsächlich lauffähig?
   - Gruppierung in sinnvolle CI-Jobs
   - Zeitlimits und Wokwi-Minuten-Budget beachten
6. **Szenarien-Qualität prüfen:** Stichprobe aus jeder Kategorie
   - Matchen die `wait-serial` Strings mit echten Firmware-Outputs?
   - Sind MQTT-Injection-Szenarien korrekt konfiguriert?

### Teil C: Developer Experience (PRIORITÄT 3)

**CI-Jobs Übersicht (verifiziert):**
```
13 Jobs total in wokwi-tests.yml:
1. build-firmware (shared artifact)
2. boot-tests (2 Szenarien: boot_full, boot_safe_mode)
3. sensor-tests (3 Szenarien: heartbeat, ds18b20_read, analog_flow, dht22_full_flow, ds18b20_full_flow)
4. mqtt-connection-test (1 Szenario: mqtt_connection.yaml – LEGACY)
5. actuator-tests (5+ Szenarien: led_on, pwm, status_publish, emergency_clear, binary_full_flow, pwm_full_flow, timeout_e2e)
6. zone-tests (2 Szenarien: zone_assignment, subzone_assignment)
7. emergency-tests (3 Szenarien: broadcast, esp_stop, stop_full_flow)
8. config-tests (2 Szenarien: sensor_add, actuator_add)
9. combined-tests (2 Szenarien: sensor_actuator, multi_device_parallel)
... weitere Jobs (flow-tests, etc.)
+ summary job

Real: 23 unique Szenarien getestet (verifiziert via grep)
```

**Fehlende Kategorien in CI (detailliert):**
- **08-i2c/** (20 Szenarien): bus_recovery, device_not_present, double_init, error_nack, scan_devices, etc.
- **08-onewire/** (29 Szenarien): crc_validation, parasitic_power, rom_conversion, temperature_flow, etc.
- **09-hardware/** (9 Szenarien): board_type, i2c_config, etc.
- **09-pwm/** (18 Szenarien): duty_full_range, frequency_change, gpio_conflict, resolution_verify, etc.
- **10-nvs/** (40 Szenarien): init_success, key_exists, namespace_isolation, factory_reset, etc.
- **gpio/** (24 Szenarien): init, conflict, multi_assignment, etc.

7. **Makefile-Targets implementieren:**
   - `make wokwi-build` – Firmware für Wokwi bauen
   - `make wokwi-run` – Wokwi lokal starten (interaktiv)
   - `make wokwi-test-quick` – Boot + Core Tests (~5 Szenarien)
   - `make wokwi-test-full` – Alle CI-Szenarien lokal
   - `make wokwi-test-category CAT=01-boot` – Einzelne Kategorie
   - `make wokwi-list` – Szenarien auflisten
8. **Lokaler Full-Stack-Test:**
   - Docker Stack + Wokwi + MQTT Integration
   - Seed-Script automatisch vor Tests ausführen
   - End-to-End: ESP Boot → Heartbeat → Server Discovery → Online
9. **Dokumentation:** WOKWI_TESTING.md

### Teil D: Erweiterte Seeds (PRIORITÄT 3)

10. **Sensor-Seeds** für ESP_00000001:
    - DS18B20 (GPIO 4) – passend zu diagram.json
    - DHT22 (GPIO 15)
    - Analog (GPIO 34)
11. **Actuator-Seeds** für ESP_00000001:
    - LED (GPIO 5, 13, 14)
    - Emergency Button (GPIO 27)
12. **Idempotentes Seed-Script** – prüft ob Daten existieren, erstellt/aktualisiert

### Wichtige Constraints
- **Server-zentrische Architektur beibehalten** – kein Test-spezifischer Code im ESP
- **Docker Stack muss unverändert funktionieren** – Seeds sind additiv
- **Bestehende 24 CI-Tests nicht brechen**
- **Wokwi-Minuten-Budget beachten** (Hobby: 200 min/Monat, CI kostet)
- **MQTT Topics müssen Production-Schema folgen:** `kaiser/{kaiser_id}/esp/{esp_id}/...`
- **Keine sensiblen Daten in Wokwi-Config** (alles ist ohnehin public: Wokwi-GUEST, etc.)

### Plan muss enthalten
- **State Machine Diagram** für Device-Status (alle Übergänge mit Code-Referenzen)
- **Korrigiertes Seed-Script** (exakt, mit Begründung)
- **Makefile-Targets** (vollständig, copy-paste-ready)
- **CI-Workflow-Erweiterung** (welche Jobs, welche Szenarien, geschätzte Laufzeit)
- **Szenarien-Validierung** (Stichprobe: stimmen wait-serial Strings?)
- **Risiken und Mitigationen**
- **Geschätzter Aufwand pro Teil**

---

## Success Criterion

1. **Device Status Flow ist DEFINITIV geklärt** – ✅ **VERIFIZIERT** mit Code-Referenzen (heartbeat_handler.py:139, 184, 152)
2. **Seed-Korrektur ist exakt spezifiziert** – ein Dev-Agent kann sie direkt umsetzen
3. **CI-Coverage-Plan erhöht Coverage auf 80%+** mit realistischem Zeitbudget (130+ von 163 Szenarien)
4. **Makefile-Targets sind vollständig definiert** und funktional
5. **Lokaler Full-Stack-Test ist dokumentiert** (Docker + Wokwi + Seed)
6. **Keine Widersprüche zwischen Plan und echtem Code** – ✅ **KORRIGIERT** (Pfade, Zahlen)
7. **verify-plan kann den Plan gegen die Codebase prüfen** – ✅ **BESTANDEN** (7 Korrekturen vorgenommen)

**Zusätzliche Aufgabe:**
8. **TEST_ENGINE_REFERENCE.md Zeile 29 korrigieren** – "163 Szenarien (23 in CI)" statt "163 Szenarien (138 in CI)"

---

## Relevante Dateien zum Analysieren

| Kategorie | Pfad |
|-----------|------|
| **Heartbeat Handler** | `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` |
| **Discovery Handler** | `El Servador/god_kaiser_server/src/mqtt/handlers/discovery_handler.py` |
| **ESP Model** | `El Servador/god_kaiser_server/src/db/models/esp.py` |
| **ESP API Routes** | `El Servador/god_kaiser_server/src/api/v1/esp.py` |
| **Seed Script** | `El Servador/god_kaiser_server/scripts/seed_wokwi_esp.py` |
| **Wokwi Config** | `El Trabajante/wokwi.toml`, `diagram.json` |
| **Wokwi Scenarios** | `El Trabajante/tests/wokwi/scenarios/` (alle Kategorien) |
| **CI Workflow** | `.github/workflows/wokwi-tests.yml` |
| **MQTT Inject** | `El Trabajante/tests/wokwi/helpers/mqtt_inject.py` |
| **ConfigManager** | `El Trabajante/src/services/config/config_manager.cpp` (Wokwi-Guards) |
| **Main** | `El Trabajante/src/main.cpp` (Provisioning-Check, Wokwi-Guards) |
| **Makefile** | `Makefile` (Root, für neue Targets) |
| **Communication Flows** | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` |
| **Architecture** | `.claude/reference/patterns/ARCHITECTURE_DEPENDENCIES.md` |
| **Test Reference** | `.claude/reference/testing/TEST_ENGINE_REFERENCE.md` (⚠️ Zeile 29 ist falsch: behauptet "138 in CI", real: 23) |

---

## Report zurück an
`.technical-manager/inbox/agent-reports/wokwi-integration-plan-2026-02-11.md`
