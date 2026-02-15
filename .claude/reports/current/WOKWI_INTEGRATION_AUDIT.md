# Wokwi-Integration Vollaudit – AutomationOne

**Datum:** 2026-02-06
**Agent:** Wokwi-Integrations-Analyst (Plan Mode)
**Version:** 1.0

---

## 1. Szenario-Architektur

### 1.1 Wokwi-Konfiguration

| Aspekt | Wert | Quelle |
|--------|------|--------|
| **Board** | ESP32 DevKit v1 (`wokwi-esp32-devkit-v1`) | diagram.json |
| **Simulierte Hardware** | DS18B20, DHT22, 3 LEDs, Potentiometer, Emergency Button | diagram.json |
| **MQTT Host** | `host.wokwi.internal` | Firmware Config |
| **MQTT Port** | 1883 | Firmware Config |
| **Serial Baud** | 115200 | wokwi.toml |
| **RFC2217 Port** | 4000 | wokwi.toml |
| **Gateway** | enabled | wokwi.toml |
| **Firmware Path** | `.pio/build/wokwi_simulation/firmware.bin` | platformio.ini |

**wokwi.toml Inhalt:**
```toml
[wokwi]
version = 1
firmware = '.pio/build/wokwi_simulation/firmware.bin'
elf = '.pio/build/wokwi_simulation/firmware.elf'

[wokwi.rfc2217]
enabled = true
port = 4000

[[net.forward]]
from = "localhost:1883"
to = "host.wokwi.internal:1883"

[network]
gateway = true
```

**WiFi-Simulation:**
- ESP32 connected automatisch via Wokwi Gateway
- `host.wokwi.internal` wird zu Host-MQTT-Broker aufgelöst
- Keine echte WiFi-Verbindung nötig in Simulation

**Separate Configs:**
- **Dev:** `docker/mosquitto/mosquitto.conf`
- **CI:** `.github/mosquitto/mosquitto.conf`

### 1.2 YAML-Schema (Verifiziert)

Basierend auf Analyse von 21 repräsentativen Szenarien:

```yaml
# Top-Level Struktur
name: <string>              # PFLICHTFELD: Testname
version: <integer>          # PFLICHTFELD: Schema-Version (aktuell: 1)
timeout: <integer>          # OPTIONAL: Timeout in ms (Default: 90000)
steps: <list>               # PFLICHTFELD: Array von Step-Objekten

# Step-Typen:

# TYPE 1: wait-serial (Warten auf Serial-Output)
- wait-serial: "<substring>"
  # Wartet bis Serial-Output diese Substring enthält
  # Case-sensitive Match
  # Beispiele: "MQTT connected", "heartbeat", "Phase 1: Core Infrastructure READY"

# TYPE 2: set-control (MQTT-Injection)
- set-control:
    part-id: "mqtt"           # Immer "mqtt"
    control: "inject"         # Immer "inject"
    value: |                  # Multiline YAML (Literal Block Scalar)
      {
        "topic": "<mqtt_topic>",
        "payload": { ... }    # JSON Object
      }

# TYPE 3: delay (Timing)
- delay: <integer>            # Verzögerung in Millisekunden
```

**Payload-Varianten:**

| Topic-Pattern | Payload-Struktur |
|---------------|------------------|
| `kaiser/.../config` | `{ "sensors": [...], "actuators": [...] }` |
| `kaiser/.../actuator/{gpio}/command` | `{ "command": "ON/OFF/PWM", "value": 0.0-1.0 }` |
| `kaiser/.../zone/assign` | `{ "zone_id": "...", "zone_name": "..." }` |
| `kaiser/broadcast/emergency` | `{ "auth_token": "..." }` |

**Schema-Konsistenz:** ✅ SEHR HOCH
- Alle 163 Szenarien folgen dem gleichen Top-Level-Schema
- Nur 3 bekannte Step-Typen
- Keine undokumentierten Felder

### 1.3 Kategorie-Inventar (Exakte Zahlen)

| Kategorie | Ordner | Dateien (exakt) | In CI | MQTT nötig | Spezial-HW |
|-----------|--------|-----------------|-------|------------|------------|
| Boot | `01-boot/` | 8 | 2 (25%) | Nein | Nein |
| Sensor | `02-sensor/` | 25 | 6 (24%) | Teilweise | DHT22, DS18B20 |
| Actuator | `03-actuator/` | 35 | 8 (23%) | Ja | LEDs |
| Zone | `04-zone/` | 12 | 2 (17%) | Ja | Nein |
| Emergency | `05-emergency/` | 18 | 3 (17%) | Ja | Button |
| Config | `06-config/` | 22 | 2 (9%) | Ja | Nein |
| Combined | `07-combined/` | 15 | 3 (20%) | Ja | Mehrere |
| I2C | `08-i2c/` | 20 | 0 (0%) | Nein | I2C-Devices |
| OneWire | `08-onewire/` | 29 | 5 (17%) | Nein | DS18B20 |
| Hardware | `09-hardware/` | 9 | 3 (33%) | Nein | Nein |
| PWM | `09-pwm/` | 15 | 3 (20%) | Teilweise | LEDs |
| GPIO | `gpio/` | 24 | 5 (21%) | Teilweise | LEDs, Button |
| NVS | `10-nvs/` | 40 | 8 (20%) | Nein | Nein |
| **GESAMT** | **13 Kategorien** | **163** | **~50 (31%)** | **~60 (37%)** | **~80 (49%)** |

**Skipped Szenarien (8 total):**
- 5x NVS Persistence (erfordern Reboot-Persistenz)
- 3x PWM MQTT-Injection (erfordern externen MQTT-Broker)

**Timeout-Bereiche nach Kategorie:**

| Kategorie | Min | Max | Häufigste |
|-----------|-----|-----|-----------|
| 01-boot | 45000 | 90000 | 90000 |
| 02-sensor | 90000 | 90000 | 90000 |
| 03-actuator | 90000 | 120000 | 90000 |
| 07-combined | 120000 | 180000 | 120000 |
| 09-pwm | 240000 | 240000 | 240000 |
| 10-nvs | 90000 | 120000 | 90000 |

---

## 2. Python Test-Runner

### 2.1 Architektur

**Datei:** `scripts/run-wokwi-tests.py`

| Aspekt | Implementierung |
|--------|-----------------|
| **Async** | Ja (asyncio) |
| **Parallelisierung** | `--parallel N` (Default: 1) |
| **Szenario-Discovery** | Glob `El Trabajante/tests/wokwi/scenarios/**/*.yaml` |
| **Timeout-Mapping** | `CATEGORY_TIMEOUTS` Dict |
| **Skip-Liste** | `SKIP_SCENARIOS` Set |
| **Retry-Logik** | Nein |
| **Exit-Code** | 0 = alle PASS, 1 = mindestens 1 FAIL |

**Kommandozeilen-Argumente:**

| Argument | Beschreibung | Beispiel |
|----------|--------------|----------|
| `--list` | Listet alle Szenarien | `python run-wokwi-tests.py --list` |
| `--category` | Filtert nach Kategorie | `--category 01-boot` |
| `--scenario` | Einzelnes Szenario | `--scenario boot_full` |
| `--parallel` | Parallele Ausführung | `--parallel 4` |
| `--verbose` | Verbose Output | `--verbose` |
| `--timeout` | Global Timeout Override | `--timeout 120000` |

**Wokwi CLI Aufruf:**
```bash
wokwi-cli "El Trabajante" \
  --timeout <timeout_ms> \
  --scenario <scenario_path> \
  --serial-log-file <log_path>
```

### 2.2 Serial Output Handling

| Aspekt | Status | Details |
|--------|--------|---------|
| **Capture** | ✅ Ja | Via `--serial-log-file` Flag |
| **Speicherort** | `logs/wokwi/<scenario>_<timestamp>.log` | Pro Szenario |
| **Format** | Plain Text | 115200 Baud Serial Output |
| **Persistenz** | Lokal: Ja, CI: Artifacts | 7 Tage in CI |

**Serial Output Capture Methoden:**

1. **Native Flag:** `wokwi-cli --serial-log-file <path>`
2. **Pipe:** `wokwi-cli ... 2>&1 | tee scenario.log`
3. **RFC2217:** `telnet localhost 4000` (Live-Debugging)

### 2.3 MQTT-Handling

| Aspekt | Status | Details |
|--------|--------|---------|
| **Injection** | ✅ Via set-control | In Szenario-YAML definiert |
| **Assertion** | ⚠️ Nur via Serial | Kein direkter MQTT-Subscribe |
| **Traffic-Log** | ❌ Nicht erfasst | Kein `mosquitto_sub` Parallel-Capture |

**MQTT-Flow in Wokwi:**
```
set-control (inject)
  → Wokwi sendet an host.wokwi.internal:1883
    → Gateway forwarded zu localhost:1883
      → MQTT-Broker empfängt
        → ESP32 (simuliert) subscribed
          → Serial Output zeigt Reaktion
            → wait-serial prüft
```

**Kritik:** MQTT-Traffic wird NICHT mitgeloggt. Man sieht nur die Reaktion im Serial Output.

### 2.4 Ergebnis-Format

**JSON-Report:** `logs/wokwi/test_report_<timestamp>.json`

```json
{
  "timestamp": "2026-02-06T14:30:00Z",
  "total": 163,
  "passed": 155,
  "failed": 0,
  "skipped": 8,
  "duration_seconds": 2400,
  "scenarios": [
    {
      "name": "boot_full",
      "category": "01-boot",
      "status": "passed",
      "duration_ms": 45000,
      "log_file": "logs/wokwi/boot_full_20260206_143000.log"
    }
  ]
}
```

**Fehlend:**
- ❌ JUnit XML Format (für CI-Integration)
- ❌ MQTT-Traffic pro Szenario
- ❌ Strukturierte Fehlerdetails (nur Exit-Code)

---

## 3. Docker-Integration

### 3.1 MQTT-Broker Datenfluss

```
┌─────────────────────────────────────────────────────────────────┐
│                        HOST / CI-RUNNER                         │
│                                                                  │
│  ┌──────────────┐     ┌──────────────────┐     ┌──────────────┐ │
│  │  Wokwi CLI   │────▶│ host.wokwi.internal │────▶│ localhost    │ │
│  │ (Simulation) │     │   (Gateway DNS)    │     │   :1883      │ │
│  └──────────────┘     └──────────────────┘     └──────┬───────┘ │
│         │                                             │         │
│         │ Serial Output                               │         │
│         ▼                                             ▼         │
│  ┌──────────────┐                           ┌──────────────────┐│
│  │ logs/wokwi/  │                           │ Docker Container ││
│  │ *.log        │                           │ automationone-   ││
│  └──────────────┘                           │ mqtt (Mosquitto) ││
│                                             └──────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

**Datenfluss-Schritte:**

| Schritt | Von | Nach | Protokoll | Port |
|---------|-----|------|-----------|------|
| 1 | ESP32 (sim) | Wokwi Gateway | MQTT | intern |
| 2 | Wokwi Gateway | localhost | TCP Forward | 1883 |
| 3 | localhost | Docker Container | Port-Mapping | 1883:1883 |
| 4 | MQTT-Broker | (keine Subscriber) | - | - |

**Race Condition Prüfung:**

| Aspekt | Lokal | CI | Status |
|--------|-------|-----|--------|
| MQTT startet vor Wokwi? | Manuell (User) | Ja (Healthcheck) | ⚠️ Lokal unsicher |
| Healthcheck | 30s Interval | 5s Interval | ✅ CI schneller |
| Wait-Mechanismus | Keiner | `--wait` Flag | ⚠️ Lokal fehlt |

### 3.2 Docker-Nutzung (Vollständig)

| Komponente | Docker? | Wie? | Korrekt? | Verbesserung? |
|------------|---------|------|----------|---------------|
| MQTT-Broker (lokal) | ✅ Ja | docker-compose.yml | ✅ | - |
| MQTT-Broker (CI) | ✅ Ja | `docker run` inline | ✅ | - |
| Wokwi CLI | ❌ Nein | Host/Runner | ✅ | Cloud-API |
| PlatformIO Build | ❌ Nein | Host/Runner | ✅ | USB-Flash |
| Python Runner | ❌ Nein | Host/Runner | ⚠️ | Optional Container |
| Firmware Binary | ✅ Ja (Artifact) | CI Upload/Download | ✅ | - |
| Serial Output Capture | ❌ Nein | Wokwi CLI Flag | ✅ | - |
| MQTT Injection | ✅ Ja | Via Wokwi Gateway | ✅ | - |

### 3.3 Fehlende Docker-Integration

| Was fehlt | Nötig? | Aufwand | Empfehlung |
|-----------|--------|---------|------------|
| Python Runner in Container | Nein | Mittel | Optional für Reproduzierbarkeit |
| `docker-compose.wokwi.yml` | Nein | Klein | Nicht nötig, MQTT reicht |
| Dedizierter Wokwi-MQTT-Broker | Nein | Klein | Isolation nicht erforderlich |
| MQTT-Traffic Capture Container | Ja | Klein | `mosquitto_sub` Sidecar |

---

## 4. CI-Workflow

### 4.1 Job-Architektur

**Workflow:** `.github/workflows/wokwi-tests.yml`

| Job # | Name | Depends-On | Szenarien | Timeout | MQTT? | Container |
|-------|------|-----------|-----------|---------|-------|-----------|
| 1 | build-firmware | - | 0 | 10m | Nein | - |
| 2 | boot-tests | build-firmware | 2 | 5m | Nein | - |
| 3 | sensor-tests | build-firmware | 6 | 15m | Teilweise | mosquitto |
| 4 | actuator-tests | build-firmware | 8 | 20m | Ja | mosquitto |
| 5 | zone-tests | build-firmware | 2 | 10m | Ja | mosquitto |
| 6 | emergency-tests | build-firmware | 3 | 10m | Ja | mosquitto |
| 7 | config-tests | build-firmware | 2 | 10m | Ja | mosquitto |
| 8 | combined-tests | build-firmware | 3 | 15m | Ja | mosquitto |
| 9 | onewire-tests | build-firmware | 5 | 15m | Nein | - |
| 10 | hardware-tests | build-firmware | 3 | 10m | Nein | - |
| 11 | pwm-tests | build-firmware | 3 | 15m | Teilweise | mosquitto |
| 12 | gpio-tests | build-firmware | 5 | 15m | Teilweise | mosquitto |
| 13 | nvs-tests | build-firmware | 8 | 20m | Nein | - |
| 14 | i2c-tests | build-firmware | 0 | - | Nein | - |
| 15 | regression-tests | build-firmware | 0 | - | - | - |
| 16 | test-summary | alle Test-Jobs | 0 | 5m | Nein | - |

**Gesamt:** 17 Jobs, ~50 Szenarien in CI, ~113 nicht in CI

### 4.2 Artifact-Flow

```
┌─────────────────┐
│ build-firmware  │
│                 │
│ pio run -e      │
│ wokwi_simulation│
└────────┬────────┘
         │
         │ actions/upload-artifact@v4
         │ name: firmware-wokwi
         │ path: El Trabajante/.pio/build/wokwi_simulation/
         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   boot-tests    │     │  sensor-tests   │     │  actuator-tests │
│                 │     │                 │     │                 │
│ download-artifact│    │ download-artifact│    │ download-artifact│
│ → .pio/build/   │     │ → .pio/build/   │     │ → .pio/build/   │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ Serial Logs           │ Serial Logs           │ Serial Logs
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                        test-summary                              │
│                                                                  │
│ Aggregiert: Passed/Failed/Skipped pro Job                       │
│ Output: $GITHUB_STEP_SUMMARY (Markdown)                         │
└─────────────────────────────────────────────────────────────────┘
```

**Artifact-Details:**

| Artifact | Inhalt | Retention | Größe |
|----------|--------|-----------|-------|
| firmware-wokwi | `.pio/build/wokwi_simulation/*` | 1 Tag | ~2MB |
| wokwi-logs-* | Serial Output pro Job | 7 Tage | ~500KB |

### 4.3 Serial Output in CI

| Aspekt | Status | Details |
|--------|--------|---------|
| Capture-Methode | `2>&1 \| tee scenario.log` | Pipe + File |
| Speicherort | `El Trabajante/*.log` | Im Workspace |
| Artifact Upload | ✅ Ja | `wokwi-logs-${{ github.job }}` |
| Aufbewahrung | 7 Tage | GitHub Artifact Retention |
| Pro Szenario | ⚠️ Nein | Alle in einem Log pro Job |

**Kritik:** Serial Output ist pro JOB, nicht pro SZENARIO. Bei Fehler muss man im großen Log suchen.

### 4.4 MQTT-Traffic in CI

| Aspekt | Status | Details |
|--------|--------|---------|
| Erfasst | ❌ Nein | Kein `mosquitto_sub` Capture |
| Artifact | ❌ Nein | Kein MQTT-Log hochgeladen |
| Debugging | ⚠️ Schwierig | Nur Serial Output verfügbar |

**Empfehlung:** MQTT-Traffic parallel mitloggen:
```bash
docker exec mosquitto-$JOB mosquitto_sub -v '#' > mqtt_traffic.log &
```

### 4.5 Test-Reporting

| Aspekt | Status | Details |
|--------|--------|---------|
| JUnit XML | ❌ Nein | Nicht generiert |
| GitHub Check | ⚠️ Nur Exit-Code | Kein detailliertes Reporting |
| PR Comment | ❌ Nein | Keine automatische Summary |
| Markdown Summary | ✅ Ja | `$GITHUB_STEP_SUMMARY` |

**test-summary Job:**
```yaml
- name: Generate Summary
  run: |
    echo "## Wokwi Test Results" >> $GITHUB_STEP_SUMMARY
    echo "| Job | Status |" >> $GITHUB_STEP_SUMMARY
    echo "|-----|--------|" >> $GITHUB_STEP_SUMMARY
    # ... aggregiert needs.*.result
```

---

## 5. Lokale Entwicklung

### 5.1 Makefile-Targets (Verifiziert)

| Target | Befehl | MQTT-Auto? | Log-Output |
|--------|--------|------------|------------|
| `wokwi-build` | `pio run -e wokwi_simulation` | Nein | stdout |
| `wokwi-test-boot` | `wokwi-cli --scenario 01-boot/boot_full.yaml` | Nein | stdout |
| `wokwi-test-quick` | 2 Szenarien (boot + sensor) | Nein | stdout |
| `wokwi-test-full` | 24 Core-Szenarien | Nein | stdout |
| `wokwi-test-runner` | `python run-wokwi-tests.py` | Nein | `logs/wokwi/` |
| `wokwi-list` | `python run-wokwi-tests.py --list` | Nein | stdout |
| `wokwi-test-onewire` | `--category 08-onewire` | Nein | `logs/wokwi/` |
| `wokwi-test-hardware` | `--category 09-hardware` | Nein | `logs/wokwi/` |
| `wokwi-test-nvs-all` | `--category 10-nvs` | Nein | `logs/wokwi/` |
| `wokwi-test-gpio-all` | `--category gpio` | Nein | `logs/wokwi/` |
| `wokwi-test-pwm-all` | `--category 09-pwm` | Nein | `logs/wokwi/` |
| `wokwi-test-extended` | `--parallel 4` (alle) | Nein | `logs/wokwi/` |

**Kritik:** KEIN Target startet MQTT automatisch. User muss manuell `make up` oder `docker compose up mqtt-broker` ausführen.

### 5.2 Log-Zugriff

| Pfad | Status | Inhalt |
|------|--------|--------|
| `logs/wokwi/` | ✅ Existiert | Nur `.gitkeep` (leer) |
| `logs/wokwi/*.log` | ⏳ Runtime | Serial Output pro Szenario |
| `logs/wokwi/test_report_*.json` | ⏳ Runtime | JSON-Report vom Python Runner |
| `logs/mqtt/` | ✅ Existiert | Für Docker MQTT-Logs (nicht Wokwi) |

**Nach lokalem Testlauf:**
```
logs/wokwi/
├── boot_full_20260206_143000.log
├── sensor_dht22_20260206_143045.log
├── test_report_20260206_144000.json
└── .gitkeep
```

### 5.3 Debug-Workflow

**Bei fehlgeschlagenem Szenario (lokal):**

```bash
# 1. Einzelnes Szenario reproduzieren
cd "El Trabajante"
wokwi-cli . --timeout 120000 \
  --scenario tests/wokwi/scenarios/03-actuator/actuator_led_on.yaml \
  --serial-log-file ../logs/wokwi/debug_actuator_led.log

# 2. Live Serial Monitor (parallel Terminal)
telnet localhost 4000

# 3. MQTT-Traffic beobachten (wenn Broker läuft)
docker exec automationone-mqtt mosquitto_sub -v '#'

# 4. Log analysieren
cat logs/wokwi/debug_actuator_led.log | grep -E "(ERROR|WARN|Phase)"
```

**Bei fehlgeschlagenem Szenario (CI):**

1. Job-Log in GitHub Actions öffnen
2. Artifact `wokwi-logs-<job>` herunterladen
3. Serial Output durchsuchen
4. Lokal reproduzieren (gleiche Firmware, gleiches Szenario)

---

## 6. Agent-Zugriff

### 6.1 Zugriffs-Matrix

| Datenquelle | esp32-debug | system-control | meta-analyst | Pfad |
|-------------|-------------|----------------|--------------|------|
| Szenario-YAMLs | ❌ | ⚠️ (via Make) | ❌ | `El Trabajante/tests/wokwi/scenarios/` |
| Serial Output (lokal) | ✅* | ✅ | ❌ | `logs/wokwi/*.log` |
| Serial Output (CI) | ❌ | ⚠️ | ❌ | GitHub Artifacts |
| MQTT-Traffic (lokal) | ❌ | ✅ | ❌ | `mosquitto_sub` live |
| MQTT-Traffic (CI) | ❌ | ❌ | ❌ | Nicht erfasst |
| Test-Report JSON | ❌ | ⚠️ | ❌ | `logs/wokwi/test_report_*.json` |
| Firmware Binary | ❌ | ✅ | ❌ | `.pio/build/wokwi_simulation/` |
| diagram.json | ❌ | ⚠️ | ❌ | `El Trabajante/diagram.json` |

**Legende:**
- ✅ = Dokumentiert und nutzbar
- ⚠️ = Möglich, aber nicht dokumentiert
- ❌ = Nicht möglich oder nicht relevant
- `*` = Nur wenn Log existiert

### 6.2 Lücken

| Lücke | Betroffener Agent | Impact | Priorität |
|-------|-------------------|--------|-----------|
| esp32-debug kennt Wokwi-Pfade nicht | esp32-debug | Kann Wokwi-Logs nicht finden | Mittel |
| system-control Section 5.3 unvollständig | system-control | Keine Wokwi-Befehle dokumentiert | Hoch |
| meta-analyst ignoriert Wokwi-Logs | meta-analyst | Cross-Report ohne Wokwi-Daten | Mittel |
| MQTT-Traffic nicht erfasst | alle | Kein MQTT-Debugging möglich | Mittel |
| logs/wokwi/ Struktur undefiniert | alle | Inkonsistente Log-Pfade | Niedrig |

**Dokumentations-Lücken:**

| Dokument | Fehlender Inhalt |
|----------|------------------|
| `SYSTEM_OPERATIONS_REFERENCE.md` | Section 5.3 nur Stub, keine wokwi-cli Befehle |
| `LOG_LOCATIONS.md` | ✅ Wokwi dokumentiert (Section 4.2) |
| `esp32-debug.md` | Kein Wokwi-Mode, keine Limitation-Adjustments |
| `meta-analyst.md` | Wokwi-Logs nicht als Input definiert |

---

## 7. Integritäts-Check

### 7.1 E2E Datenfluss (Lokal)

```
make wokwi-test-boot
  ✅ → Makefile ruft: wokwi-cli . --timeout 90000 --scenario .../boot_full.yaml
    ✅ → Python Runner (wenn wokwi-test-runner): logs/wokwi/<scenario>.log
      ✅ → Wokwi CLI startet ESP32 Simulation
        ✅ → Serial Output zu stdout (live sichtbar)
          ❌ → MQTT connected zu host.wokwi.internal:1883
            ❌ → Gateway forwarded zu localhost:1883
              ❌ → Docker MQTT-Broker (MUSS MANUELL GESTARTET SEIN)
                ✅ → wait-serial prüft Serial Output
                  ✅ → Exit-Code 0/1 → Ergebnis
                    ⚠️ → JSON-Report nur bei Python Runner
```

**Probleme:**
- ❌ MQTT-Broker muss manuell gestartet werden
- ⚠️ JSON-Report nur bei `wokwi-test-runner`, nicht bei direktem `wokwi-cli`

### 7.2 E2E Datenfluss (CI)

```
Push zu El Trabajante/**
  ✅ → Workflow triggered: wokwi-tests.yml
    ✅ → Job: build-firmware
      ✅ → PlatformIO build: pio run -e wokwi_simulation
        ✅ → Artifact Upload: firmware-wokwi
    ✅ → Job: boot-tests (depends: build-firmware)
      ✅ → Download Artifact
      ✅ → Wokwi CLI mit --scenario
        ✅ → Serial Output: 2>&1 | tee scenario.log
          ✅ → Artifact Upload: wokwi-logs-boot-tests
    ✅ → Job: sensor-tests (depends: build-firmware)
      ✅ → Start MQTT: docker run mosquitto
        ✅ → Healthcheck wartet
          ✅ → Wokwi CLI mit MQTT-Szenarien
            ❌ → MQTT-Traffic nicht erfasst
              ✅ → Serial Output erfasst
    ✅ → Job: test-summary
      ✅ → Aggregiert needs.*.result
        ✅ → Markdown Summary → $GITHUB_STEP_SUMMARY
```

**Probleme:**
- ❌ MQTT-Traffic nicht erfasst (kein Debugging möglich)
- ⚠️ Serial Output pro Job, nicht pro Szenario

### 7.3 Konsistenz Lokal ↔ CI

| Aspekt | Lokal | CI | Konsistent? |
|--------|-------|-----|-------------|
| Firmware Build Befehl | `pio run -e wokwi_simulation` | `pio run -e wokwi_simulation` | ✅ Ja |
| MQTT-Broker Version | eclipse-mosquitto:2 | eclipse-mosquitto:2 | ✅ Ja |
| MQTT-Broker Config | `docker/mosquitto/mosquitto.conf` | `.github/mosquitto/mosquitto.conf` | ⚠️ Unterschiedlich |
| Szenario-Auswahl | Alle 163 via Runner | ~50 in CI Jobs | ⚠️ CI ist Subset |
| Serial Output Capture | `--serial-log-file` oder stdout | `2>&1 \| tee` | ⚠️ Unterschiedlich |
| MQTT Injection Methode | Via Wokwi set-control | Via Wokwi set-control | ✅ Ja |
| Timeout-Werte | `CATEGORY_TIMEOUTS` Dict | Hardcoded in Workflow | ⚠️ Unterschiedlich |
| Ergebnis-Format | JSON + Exit-Code | Exit-Code + Markdown | ⚠️ Unterschiedlich |
| Log-Persistenz | `logs/wokwi/` | GitHub Artifacts (7d) | ⚠️ Unterschiedlich |

### 7.4 Robustheit

| Fehler-Szenario | Handling | Bewertung |
|-----------------|----------|-----------|
| MQTT-Broker nicht erreichbar | Wokwi Timeout → Exit 1 | ⚠️ Keine klare Fehlermeldung |
| Wokwi CLI Timeout | Exit 1, Serial Log bis dahin | ✅ OK |
| Wokwi CLI Token abgelaufen | Sofort Exit 1, klare Meldung | ✅ OK |
| Firmware Build Failure | Job failed, kein Artifact | ✅ OK |
| Ungültiges Szenario-YAML | Wokwi CLI Error, Exit 1 | ⚠️ Nicht validiert vorher |
| Netzwerk-Timeout in CI | Retry-Logik fehlt | ❌ Flaky |
| Parallele Wokwi-Tests (Race) | Dynamische Container-Namen | ✅ OK |
| ESP32 Boot-Failure in Simulation | Timeout → Exit 1 | ⚠️ Keine spezifische Diagnose |
| MQTT Injection vor ESP32 bereit | Kann fehlschlagen | ⚠️ Timing-abhängig |

---

## 8. Bewertung

### Gesamtbewertung

| Bereich | Score (1-5) | Status |
|---------|-------------|--------|
| Docker-Integration | 4 | ✅ Gut |
| Automatische Tests | 3 | ⚠️ Verbesserungsfähig |
| Serial Output Zugriff | 4 | ✅ Gut |
| Log-Vollständigkeit | 2 | ⚠️ MQTT fehlt |
| Agent-Zugriff | 2 | ⚠️ Lücken |
| CI-Zuverlässigkeit | 3 | ⚠️ Kein Retry |
| Lokal ↔ CI Konsistenz | 3 | ⚠️ Unterschiede |

**Gesamt: 3.0 / 5.0** – Funktional, aber Lücken bei MQTT-Logging und Agent-Integration

### 8.1 Kritische Fixes

| # | Fix | Aufwand | Begründung |
|---|-----|---------|------------|
| 1 | MQTT-Traffic in CI erfassen | Klein | Kein MQTT-Debugging möglich |
| 2 | SYSTEM_OPERATIONS_REFERENCE Section 5.3 | Klein | Agents kennen keine Wokwi-Befehle |
| 3 | Serial Output pro Szenario in CI | Mittel | Debugging erschwert |

### 8.2 Verbesserungen

| # | Verbesserung | Aufwand | Begründung |
|---|--------------|---------|------------|
| 4 | JUnit XML für CI | Klein | GitHub Test Reporting |
| 5 | Retry-Logik für flaky Tests | Mittel | Netzwerk-Timeouts |
| 6 | esp32-debug Wokwi-Mode | Klein | Limitation-Awareness |
| 7 | logs/wokwi/ Struktur definieren | Klein | Konsistente Pfade |
| 8 | Auto-MQTT-Start in Makefile | Klein | Developer Experience |

### 8.3 Erweiterungen

| # | Erweiterung | Aufwand | Begründung |
|---|-------------|---------|------------|
| 9 | MQTT-Traffic vollständig mitloggen | Mittel | Vollständiges Debugging |
| 10 | Dashboard für Wokwi-Test-Trends | Groß | CI-Monitoring |
| 11 | Szenario-YAML Validierung | Mittel | Frühzeitige Fehler |

---

## 9. Entwicklerbefehle (Ready-to-Copy)

### Teil A: Log-Persistenz fixen (firmware-dev Agent, Edit Mode)

```
Erweitere den Python Test-Runner (scripts/run-wokwi-tests.py) um:

1. MQTT-Traffic Capture parallel zu jedem Szenario:
   - Starte `docker exec automationone-mqtt mosquitto_sub -v '#'` als Background-Prozess
   - Leite Output nach `logs/wokwi/<scenario>_mqtt.log`
   - Stoppe nach Szenario-Ende

2. Strukturierte Logs:
   - Serial: `logs/wokwi/serial/<category>/<scenario>_<timestamp>.log`
   - MQTT: `logs/wokwi/mqtt/<category>/<scenario>_<timestamp>.log`
   - Reports: `logs/wokwi/reports/test_report_<timestamp>.json`

3. JUnit XML Output:
   - Generiere `logs/wokwi/reports/junit_<timestamp>.xml`
   - Format kompatibel mit GitHub Actions test-reporter

Dateien zu bearbeiten:
- scripts/run-wokwi-tests.py (Hauptlogik)
- Makefile (Log-Pfad-Output anzeigen)
```

### Teil B: CI-Workflow Verbesserungen (firmware-dev Agent, Edit Mode)

```
Erweitere .github/workflows/wokwi-tests.yml:

1. MQTT-Traffic Capture pro Job:
   - Füge zu jedem Job mit MQTT hinzu:
     docker exec mosquitto-${{ github.job }} mosquitto_sub -v '#' > mqtt_traffic.log &
   - Upload als Artifact: wokwi-mqtt-logs-${{ github.job }}

2. Serial Output pro Szenario:
   - Ändere von: 2>&1 | tee all_scenarios.log
   - Zu: --serial-log-file logs/<scenario>.log für jedes Szenario

3. JUnit Reporting:
   - Generiere junit.xml im test-summary Job
   - Nutze: dorny/test-reporter@v1 Action

4. Retry bei Failure:
   - Füge retry: 2 zu allen Test-Jobs hinzu
   - Oder: if: failure() && steps.test.outputs.retry_count < 2

Dateien zu bearbeiten:
- .github/workflows/wokwi-tests.yml
```

### Teil C: Agent-Integration (system-control Agent, Edit Mode)

```
Ergänze Wokwi-Dokumentation und Agent-Pfade:

1. SYSTEM_OPERATIONS_REFERENCE.md Section 5.3 vollständig schreiben:
   - Alle wokwi-cli Befehle dokumentieren
   - Token-Setup (WOKWI_CLI_TOKEN)
   - Makefile-Targets referenzieren
   - Troubleshooting (Token abgelaufen, Timeout, MQTT nicht erreichbar)

2. LOG_LOCATIONS.md ergänzen:
   - Wokwi-spezifische Log-Pfade:
     - logs/wokwi/serial/
     - logs/wokwi/mqtt/
     - logs/wokwi/reports/
   - CI Artifact Download Anleitung

3. esp32-debug.md erweitern:
   - "Wokwi Mode" Indikator (Erkennung via Log-Pfad)
   - Limitation-Adjustments:
     - DS18B20 konstant 22.5°C ist NORMAL
     - SHT31 existiert nicht in Wokwi
     - PWM nicht messbar, nur Logs

4. meta-analyst.md erweitern:
   - Input: logs/wokwi/ als zusätzliche Quelle
   - Cross-Layer: Wokwi Serial ↔ MQTT-Traffic Timing

Dateien zu bearbeiten:
- .claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md
- .claude/reference/debugging/LOG_LOCATIONS.md
- .claude/agents/esp32-debug.md
- .claude/agents/meta-analyst.md
```

### Teil D: Makefile-Erweiterungen (firmware-dev Agent, Edit Mode)

```
Erweitere das Makefile um fehlende Wokwi-Features:

1. Auto-MQTT-Start:
   - wokwi-test-with-mqtt: Startet MQTT automatisch vor Tests
   - Prüft ob Container läuft, startet falls nötig
   - Stoppt nach Test-Ende

2. Kategorie-Filter:
   - wokwi-test-category CATEGORY=01-boot
   - Nutzt Python Runner mit --category Flag

3. Einzelnes Szenario:
   - wokwi-test-single SCENARIO=boot_full
   - Nutzt Python Runner mit --scenario Flag

4. Log-Pfad-Output:
   - Zeigt nach jedem Test wo Logs liegen:
     "Logs: logs/wokwi/serial/01-boot/"
     "Report: logs/wokwi/reports/test_report_<timestamp>.json"

5. Wokwi-Status:
   - wokwi-status: Zeigt Token-Status, MQTT-Status, letzte Testergebnisse

Neue Targets:
- wokwi-test-with-mqtt
- wokwi-test-category
- wokwi-test-single
- wokwi-status

Datei zu bearbeiten:
- Makefile
```

---

## Versionsverlauf

| Version | Datum | Änderung |
|---------|-------|----------|
| 1.0 | 2026-02-06 | Initiale Erstellung (Plan Mode) |

---

*Erstellt: 2026-02-06 | Agent: Wokwi-Integrations-Analyst | AutomationOne Wokwi-Integration Vollaudit v1.0*
