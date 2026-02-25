# Log-System - AutomationOne

> **Version:** 4.6 | **Aktualisiert:** 2026-02-25
> **Änderungen 4.6:** PostgreSQL logging_collector=off (kein Bind-Mount mehr), Level-Extraktion + Slow-Query Metadata in Alloy, ESP32 Regex-Fallback
> **Zweck:** Vollständige Dokumentation aller Log-Quellen, Speicherorte und Capture-Methoden
> **Änderungen 3.0:** Docker-basierte Log-Infrastruktur, neue Log-Verzeichnisse, PostgreSQL-Logging, .env-Auslagerung

---

## Inhaltsverzeichnis

| Section | Inhalt | Wann lesen? |
|---------|--------|-------------|
| [0. Quick Reference](#0-quick-reference) | Alle Commands auf einen Blick | **IMMER ZUERST** |
| [1. Übersicht](#1-übersicht) | Alle Log-Quellen im Überblick | Bei Orientierung |
| [2. Server Logs](#2-server-logs) | God-Kaiser Server Logging | Bei Server-Debugging |
| [3. pytest Output](#3-pytest-output) | Test-Logs und Coverage | Bei Test-Failures |
| [4. Wokwi Serial](#4-wokwi-serial) | Wokwi CLI Output Capture | Bei Wokwi-Tests |
| [5. ESP32 Serial](#5-esp32-serial-echte-hardware) | Echter ESP32 am USB | Bei Hardware-Debugging |
| [6. MQTT Traffic](#6-mqtt-traffic) | MQTT Message Capture | Bei Kommunikations-Debugging |
| [7. GitHub Actions](#7-github-actions-logs) | CI/CD Logs | Bei CI-Failures |
| [8. Multi-Log Capture](#8-synchronisierte-multi-log-capture) | Mehrere Quellen gleichzeitig | Bei komplexem Debugging |
| [9. Windows-Hinweise](#9-windows-spezifische-hinweise) | PowerShell, Git Bash, WSL | Bei Windows-Problemen |

---

## Docker Log Infrastructure (NEU in v3.0)

### Log-Verzeichnisse (Bind-Mounts)

| Verzeichnis | Container | Beschreibung |
|-------------|-----------|--------------|
| `logs/server/` | el-servador | FastAPI Server JSON-Logs |
| `logs/mqtt/` | mqtt-broker | Deaktiviert (Mosquitto stdout-only seit v3.1); Broker-Logs via Loki `compose_service=mqtt-broker` |
| (kein Bind-Mount) | postgres | PostgreSQL Logs via stderr → Docker → Alloy → Loki `compose_service=postgres` (level, query_duration_ms) |
| `logs/esp32/` | - | ESP32 Serial Logs (manuell via PlatformIO) |
| `logs/wokwi/` | - | Wokwi Serial/MQTT/Report Logs (via make wokwi-test-*) |
| `logs/current/` | - | Session-Logs (via start_session.sh) |
| (kein Bind-Mount) | el-frontend | Vue/Vite stdout → Loki `compose_service=el-frontend` (JSON, level/component); `docker compose logs el-frontend` |
| Docker Container | esp32-serial-logger | ESP32 Serial via TCP-Bridge (stdout only, Profile: hardware) |

### Docker-Compose Konfiguration

```yaml
# Server-Logs
el-servador:
  volumes:
    - ./logs/server:/app/logs
  logging:
    driver: json-file
    options:
      max-size: "10m"
      max-file: "3"

# MQTT-Logs (in docker-compose auskommentiert: Mosquitto stdout-only)
# mqtt-broker: kein Bind-Mount; Logs via Alloy → Loki (compose_service=mqtt-broker)

# PostgreSQL-Logs (kein Bind-Mount; logging_collector=off → stderr → Docker → Alloy → Loki)
postgres:
  volumes:
    - ./docker/postgres/postgresql.conf:/etc/postgresql/postgresql.conf:ro
  command: postgres -c config_file=/etc/postgresql/postgresql.conf

# Frontend-Logs (Docker json-file Driver)
el-frontend:
  logging:
    driver: json-file
    options:
      max-size: "5m"
      max-file: "3"
```

### PostgreSQL Logging-Konfiguration

**Config:** `docker/postgres/postgresql.conf`

| Setting | Wert | Beschreibung |
|---------|------|--------------|
| `log_statement` | `mod` | Nur INSERT/UPDATE/DELETE/DDL loggen |
| `log_min_duration_statement` | `100` | SELECTs > 100ms loggen (Slow Query) |
| `log_connections` | `on` | Verbindungen loggen |
| `log_disconnections` | `on` | Trennungen loggen |
| `log_lock_waits` | `on` | Lock-Waits loggen |
| `logging_collector` | `off` | Logs via stderr → Docker → Alloy → Loki (kein File-Logging) |
| `log_destination` | `stderr` | Docker json-file Driver übernimmt Persistenz und Rotation |

### Frontend Structured Logger

**Datei:** `El Frontend/src/utils/logger.ts`

```typescript
// createLogger(namespace) outputs JSON to stdout for Alloy/Loki:
// {"level":"info","component":"ESPCard","message":"...","timestamp":"2026-02-23T..."}
// In DEV mode: also logs human-readable to browser console
// Level filtering via VITE_LOG_LEVEL env var (default: debug)
```

**Datei:** `El Frontend/src/main.ts`

```typescript
// Vue Error Handler - structured JSON for Docker logs
app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue Error]', {
    error: err.message,
    stack: err.stack,
    component: instance?.$options?.name,
    info,
    timestamp: new Date().toISOString()
  })
}
```

### .env-Auslagerung

Alle Secrets wurden aus `docker-compose.yml` in `.env` ausgelagert:

| Variable | Beschreibung |
|----------|--------------|
| `POSTGRES_USER` | PostgreSQL Benutzername |
| `POSTGRES_PASSWORD` | PostgreSQL Passwort |
| `POSTGRES_DB` | Datenbankname |
| `JWT_SECRET_KEY` | JWT Signing Key |

---

## 0. Quick Reference

### Häufigste Commands

```bash
# ============================================
# SYSTEM HEALTH (Erster Schritt bei jedem Debug)
# ============================================
powershell -ExecutionPolicy Bypass -File scripts/debug/debug-status.ps1   # JSON Health-Report

# ============================================
# SERVER LOGS
# ============================================
tail -f "El Servador/god_kaiser_server/logs/god_kaiser.log"           # Live
grep -i error "El Servador/god_kaiser_server/logs/god_kaiser.log"     # Errors suchen

# ============================================
# TESTS (poetry run oder .venv direkt)
# ============================================
cd "El Servador/god_kaiser_server" && poetry run pytest tests/ -v --no-cov    # Alle Tests
cd "El Servador/god_kaiser_server" && poetry run pytest tests/ -v --lf        # Nur fehlgeschlagene
# Falls poetry auf falsches Python resolved → .venv direkt:
cd "El Servador/god_kaiser_server" && .venv/Scripts/pytest.exe tests/ -v --no-cov

# ============================================
# WOKWI
# ============================================
cd "El Trabajante" && wokwi-cli . --timeout 90000 --serial-log-file wokwi.log   # Native Option (EMPFOHLEN)
cd "El Trabajante" && wokwi-cli . --timeout 90000 2>&1 | tee wokwi.log          # Pipe Alternative        # Mit Capture

# ============================================
# ESP32 SERIAL (NUR PowerShell - Git Bash kann COM-Port nicht oeffnen, && geht nicht in PS 5.x)
# ============================================
# PowerShell (voller Pfad, Befehle einzeln statt &&):
# cd "C:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Trabajante"
# C:\Users\PCUser\.platformio\penv\Scripts\pio.exe device monitor -e esp32_dev
# C:\Users\PCUser\.platformio\penv\Scripts\pio.exe device monitor -e esp32_dev 2>&1 | Tee-Object serial.log
# Git Bash (NUR Build, kein Monitor): cd "El Trabajante" && ~/.platformio/penv/Scripts/pio.exe run -e esp32_dev

# ============================================
# MQTT
# ============================================
mosquitto_sub -h localhost -t "kaiser/#" -v -C 10 -W 30                        # Live
mosquitto_sub -h localhost -t "kaiser/#" -v -C 10 -W 30 | tee mqtt.log         # Mit Capture

# ============================================
# CI/CD
# ============================================
gh run list --status=failure --limit=5                                         # Fehlgeschlagene Runs
gh run view <run-id> --log-failed                                              # Fehler-Logs
gh run download <run-id>                                                       # Artifacts
```

### Log-Pfade Übersicht

| Quelle | Pfad / Ausgabe | Format | Native File-Option |
|--------|----------------|--------|-------------------|
| Server | `El Servador/god_kaiser_server/logs/god_kaiser.log` | JSON | ✅ Automatisch |
| pytest | stdout + `junit-*.xml` | Text/XML | ✅ `--junitxml` |
| Coverage | `htmlcov/index.html` | HTML | ✅ `--cov-report` |
| Wokwi | `--serial-log-file <path>` | Text | ✅ Native CLI Option |
| ESP32 | `> serial.log 2>&1` (Umleitung) | Text | ⚠️ log2file unzuverlässig |
| MQTT | `> mqtt.log` (Umleitung) | Text | ❌ Capture nötig |
| Wokwi Logs | `logs/wokwi/{serial,mqtt,reports}/` | Text/JSON | ✅ Automatisch (Makefile) |
| Wokwi Error-Injection | `logs/wokwi/error-injection/error_*.log` | Text | ✅ CI (background pattern + mosquitto_pub) |
| Playwright E2E | `logs/frontend/playwright/playwright-report/`, `logs/frontend/playwright/test-results/` | HTML/JSON | ✅ Config `playwright.config.ts` |
| CI | `gh run view --log` | Text | ✅ `--log` Flag |

---

## 1. Übersicht

### 1.1 Alle Log-Quellen

| Quelle | Pfad / Ausgabe | Live | Historisch | Native File-Option |
|--------|----------------|------|------------|-------------------|
| **Server** | `logs/god_kaiser.log` | ✅ | ✅ (Rotation) | ✅ Automatisch |
| **Server Console** | stdout | ✅ | ❌ | ❌ Umleitung nötig |
| **pytest** | stdout + XML | ✅ | ✅ (Artifacts) | ✅ `--junitxml` |
| **Coverage** | `htmlcov/` | ❌ | ✅ | ✅ `--cov-report` |
| **Wokwi** | `--serial-log-file` | ✅ | ✅ | ✅ **Native CLI Option** |
| **ESP32 Serial** | `> file 2>&1` | ✅ | ❌ | ⚠️ log2file unzuverlässig |
| **MQTT Traffic** | `> mqtt.log` | ✅ | ❌ | ❌ Umleitung nötig |
| **Frontend (Container)** | Loki `compose_service=el-frontend` / `docker compose logs el-frontend` | ✅ | ✅ (Loki 7d) | ❌ (stdout only) |
| **Playwright E2E** | `logs/frontend/playwright/` (Report + test-results) | ❌ | ✅ | ✅ `playwright.config.ts` |
| **GitHub Actions** | CI Logs | ❌ | ✅ | ✅ `--log` Flag |

### 1.2 Zugriffsmethoden für KI

| Quelle | KI-Zugriff | Methode |
|--------|------------|---------|
| Server Logs | ✅ Direkt | Read Tool, `tail`, `grep` |
| pytest | ✅ Direkt | Bash Tool |
| Wokwi | ⚠️ Bedingt | Token nötig, dann Bash |
| ESP32 Serial | ❌ | User muss Output teilen |
| MQTT | ⚠️ Bedingt | `mosquitto_sub` muss installiert sein |
| Frontend (Container) | ✅ Direkt (wenn Monitoring) | Loki API `compose_service=el-frontend`; sonst `docker compose logs el-frontend` |
| GitHub Actions | ✅ Direkt | `gh` CLI |

---

## 2. Server Logs

### 2.1 Konfiguration

**Config-Datei:** `El Servador/god_kaiser_server/src/core/config.py` (LoggingSettings)

| Setting | Default | Environment Variable |
|---------|---------|---------------------|
| `level` | `INFO` | `LOG_LEVEL` |
| `format` | `json` | `LOG_FORMAT` |
| `file_path` | `logs/god_kaiser.log` | `LOG_FILE_PATH` |
| `file_max_bytes` | 10MB | `LOG_FILE_MAX_BYTES` |
| `file_backup_count` | 10 | `LOG_FILE_BACKUP_COUNT` |

### 2.2 Log-Pfad und Rotation

**Lokaler Pfad (Poetry):**
```
El Servador/god_kaiser_server/logs/
├── god_kaiser.log        # Aktuelle Log-Datei
├── god_kaiser.log.1      # Ältester Backup
├── god_kaiser.log.2
├── ...
└── god_kaiser.log.10     # Neuester Backup (max 10)
```

**Docker Bind-Mount:**
```
logs/server/              # Host-Verzeichnis (Docker Bind-Mount)
├── god_kaiser.log        # Aktuelle Log-Datei
├── god_kaiser.log.1
├── ...
└── god_kaiser.log.10
```

### 2.3 JSON Log-Format

```json
{
  "timestamp": "2026-02-01 10:23:45",
  "level": "INFO",
  "logger": "src.mqtt.handlers.sensor_handler",
  "message": "Sensor data received from ESP_12AB34CD",
  "module": "sensor_handler",
  "function": "handle_sensor_data",
  "line": 123,
  "request_id": "abc123",
  "exception": "..." 
}
```

### 2.4 Zugriffs-Commands

```bash
LOG="El Servador/god_kaiser_server/logs/god_kaiser.log"

# Live-Verfolgung
tail -f "$LOG"
tail -50f "$LOG"                                    # Letzte 50 + Live

# Filtern
tail -f "$LOG" | grep -i "error\|critical"          # Nur Fehler
tail -f "$LOG" | grep "ESP_12AB34CD"                # Bestimmtes ESP
tail -f "$LOG" | grep "mqtt.handlers"               # MQTT Handler

# Historische Suche
grep -i "error" "$LOG"                              # Aktuelle Datei
grep -i "error" "$LOG"*                             # Alle Backups
grep "2026-02-01 10:" "$LOG"                        # Zeitbasiert
```

### 2.5 Log-Level ändern

```bash
# Option 1: Environment Variable
export LOG_LEVEL=DEBUG
poetry run uvicorn god_kaiser_server.src.main:app --reload

# Option 2: .env Datei
echo "LOG_LEVEL=DEBUG" >> .env
```

---

## 3. pytest Output

### 3.1 Konfiguration

**Datei:** `El Servador/god_kaiser_server/pyproject.toml`

```toml
[tool.pytest.ini_options]
addopts = "-ra -q --strict-markers --cov=src --cov-report=term-missing --cov-report=html"
testpaths = ["tests"]
asyncio_mode = "auto"
```

### 3.2 Output-Formate

| Format | Pfad | Zweck |
|--------|------|-------|
| stdout | Terminal | Echtzeit |
| JUnit XML | `junit-*.xml` | CI Integration |
| Coverage HTML | `htmlcov/index.html` | Detaillierte Analyse |
| Coverage XML | `coverage-*.xml` | CI Integration |

### 3.3 Test-Commands

```bash
cd "El Servador/god_kaiser_server"

# Standard
poetry run pytest tests/ -v                         # Mit Coverage
poetry run pytest tests/ -v --no-cov                # Ohne Coverage (schneller)

# Kategorien
poetry run pytest tests/unit/ -v                    # Unit Tests
poetry run pytest tests/integration/ -v             # Integration Tests
poetry run pytest tests/esp32/ -v                   # ESP32 Mock Tests

# Debugging
poetry run pytest tests/ -v --lf                    # Nur fehlgeschlagene
poetry run pytest tests/ -xvs                       # Stop bei Fehler + Print
poetry run pytest tests/unit/test_xyz.py -xvs --tb=long  # Einzelner Test

# CI-Format
poetry run pytest tests/unit/ -v --junitxml=junit-unit.xml

# Falls poetry auf Python 3.14 statt .venv (3.13) resolved → .venv direkt:
.venv/Scripts/pytest.exe tests/ -v --no-cov
.venv/Scripts/pytest.exe tests/unit/ -xvs --tb=long
```

### 3.4 Coverage Report öffnen

```bash
# Generieren
poetry run pytest tests/ --cov=src --cov-report=html

# Öffnen
start htmlcov/index.html      # Windows
open htmlcov/index.html       # Mac
xdg-open htmlcov/index.html   # Linux
```

---

## 4. Wokwi Serial

### 4.1 Konfiguration

**Datei:** `El Trabajante/wokwi.toml`

```toml
[wokwi]
version = 1
firmware = ".pio/build/wokwi_simulation/firmware.bin"
elf = ".pio/build/wokwi_simulation/firmware.elf"
rfc2217ServerPort = 4000

[wokwi.serial]
baud = 115200
```

### 4.2 Output-Charakteristik

- **Baud Rate:** 115200
- **RFC2217:** Port 4000 für externen Zugriff
- **Native File-Option:** `--serial-log-file <path>` ✅

### 4.3 Wokwi CLI Optionen

```
--serial-log-file <path>    Speichert Serial Output in Datei (EMPFOHLEN)
--expect-text <string>      Erwartet Text in Output (Exit 0 bei Erfolg)
--fail-text <string>        Fehlschlag bei Text in Output
--timeout <number>          Timeout in Millisekunden (default: 30000)
--scenario <path>           YAML Scenario-Datei ausführen
--quiet, -q                 Keine Status-Meldungen
--interactive               stdin → Serial Port
```

### 4.4 Capture-Methoden

```bash
cd "El Trabajante"

# Firmware bauen (falls nötig)
pio run -e wokwi_simulation

# EMPFOHLEN: Native --serial-log-file Option
wokwi-cli . --timeout 90000 --serial-log-file wokwi.log
wokwi-cli . --timeout 90000 --scenario tests/wokwi/boot_test.yaml --serial-log-file wokwi.log

# Alternative: Pipe zu tee
wokwi-cli . --timeout 90000 2>&1 | tee wokwi.log

# Getrennte Streams
wokwi-cli . --timeout 90000 > serial.log 2> cli_messages.log

# Mit Timestamps (ts aus moreutils)
wokwi-cli . --timeout 90000 2>&1 | ts '[%Y-%m-%d %H:%M:%S]' | tee wokwi_ts.log

# Hintergrund
wokwi-cli . --timeout 90000 --serial-log-file wokwi_bg.log &
WOKWI_PID=$!
# ... später ...
kill $WOKWI_PID
```

### 4.5 RFC2217 Serial Zugriff

```bash
# Telnet
telnet localhost 4000

# Python
python -c "
import serial
s = serial.serial_for_url('rfc2217://localhost:4000', baudrate=115200)
while True:
    if s.in_waiting:
        print(s.readline().decode('utf-8', errors='replace'), end='')
"
```

### 4.6 Mit MQTT Injection

```bash
cd "El Trabajante"

# Wokwi im Hintergrund
wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/03-actuator/actuator_led_on.yaml 2>&1 | tee test.log &
WOKWI_PID=$!

# Warten bis ESP32 bereit
sleep 25

# MQTT Command injizieren
mosquitto_pub -h localhost \
  -t "kaiser/god/esp/ESP_00000001/actuator/5/command" \
  -m '{"command":"ON","value":1.0}'

wait $WOKWI_PID
```

---

## 5. ESP32 Serial (Echte Hardware)

### 5.1 Konfiguration

**Datei:** `El Trabajante/platformio.ini`

```ini
monitor_speed = 115200
```

### 5.2 Port identifizieren

```bash
# PlatformIO (Git Bash: vollstaendiger Pfad noetig, kein COM-Port-Zugriff)
cd "El Trabajante"
~/.platformio/penv/Scripts/pio.exe device list

# Windows PowerShell (NICHT aus Git Bash aufrufen - $_ Escaping-Probleme)
Get-WmiObject Win32_SerialPort | Select-Object Caption, DeviceID
```

### 5.3 Serial Monitor

```bash
cd "El Trabajante"

# Standard
pio device monitor

# Mit Optionen
pio device monitor --baud 115200
pio device monitor --port COM3
pio device monitor -e esp32_dev
```

### 5.4 Capture zu Datei

**ANTWORT auf Robins Frage: JA, Serial Output kann gespeichert werden!**

**Methoden nach Zuverlässigkeit:**

| Methode | Command | Zuverlässigkeit |
|---------|---------|-----------------|
| **Direkte Umleitung** | `> serial.log 2>&1` | ✅ Zuverlässig |
| **Pipe zu tee** | `\| tee serial.log` | ✅ Zuverlässig |
| log2file Filter | `--filter=log2file` | ⚠️ Bekannte Probleme |

```bash
cd "El Trabajante"

# EMPFOHLEN: Direkte Umleitung (Windows CMD)
pio device monitor --baud 115200 > serial_output.log 2>&1

# EMPFOHLEN: Mit tee (Git Bash)
pio device monitor | tee serial_$(date +%Y%m%d_%H%M%S).log

# Mit Timestamps (Git Bash + moreutils)
pio device monitor | ts '[%Y-%m-%d %H:%M:%S]' | tee serial.log

# Mit time Filter
pio device monitor --filter=time | tee serial.log

# Hintergrund
pio device monitor > serial.log 2>&1 &
```

**PowerShell:**
```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe" device monitor 2>&1 | Tee-Object -FilePath "serial.txt"
```

### 5.5 log2file Filter (Einschränkungen)

Der `log2file` Filter ist in `platformio.ini` konfiguriert, hat aber **bekannte Zuverlässigkeitsprobleme**:

- **Output-Pfad:** `El Trabajante/platformio-device-monitor-YYYYMMDDHHMMSS.log`
- **Problem:** Erstellt manchmal keine Datei
- **Empfehlung:** Direkte Umleitung (`>`) statt log2file verwenden

```bash
# Falls log2file funktioniert - Dateien finden:
dir platformio-device-monitor-*.log      # Windows
ls platformio-device-monitor-*.log       # Git Bash
```

### 5.6 Verfügbare Filter

```bash
pio device monitor --filter=time                    # Zeitstempel
pio device monitor --filter=colorize                # Farben
pio device monitor --filter=log2file                # Auto-Logging (⚠️ unzuverlässig)
pio device monitor --filter=esp32_exception_decoder # Exception Decode
```

### 5.7 Kontinuierliches Logging

```bash
# Rotation alle Stunde
while true; do
    LOGFILE="serial_$(date +%Y%m%d_%H%M%S).log"
    timeout 3600 pio device monitor > "$LOGFILE" 2>&1
done
```

### 5.8 ESP32 Logger-System (Firmware)

Die Firmware verwendet ein eigenes Logger-System (`El Trabajante/src/utils/logger.h`):

```cpp
// Log Levels
enum LogLevel {
  LOG_DEBUG = 0,
  LOG_INFO = 1,
  LOG_WARNING = 2,
  LOG_ERROR = 3,
  LOG_CRITICAL = 4
};

// Convenience Macros
LOG_DEBUG("message")
LOG_INFO("message")
LOG_WARNING("message")
LOG_ERROR("message")
LOG_CRITICAL("message")
```

**Features:**
- Singleton Logger mit Circular Buffer (50 Einträge)
- Serial Output + In-Memory Buffer
- Konfigurierbar via `setLogLevel()`, `setSerialEnabled()`
- Timestamp pro Eintrag (millis())

---

## 6. MQTT Traffic

### 6.1 Voraussetzungen

- Mosquitto Clients installiert
- MQTT Broker läuft (localhost:1883)

```bash
# Installation
choco install mosquitto        # Windows
sudo apt install mosquitto-clients  # Linux
brew install mosquitto         # Mac
```

### 6.2 Capture-Commands

```bash
# Alle Topics
mosquitto_sub -h localhost -t "kaiser/#" -v -C 10 -W 30 | tee mqtt.log

# Mit Timestamps
mosquitto_sub -h localhost -t "kaiser/#" -v -C 10 -W 30 | ts '[%Y-%m-%d %H:%M:%S]' | tee mqtt_ts.log

# Hintergrund
mosquitto_sub -h localhost -t "kaiser/#" -v -C 10 -W 30 > mqtt.log 2>&1 &
```

### 6.3 Topic-Filter

```bash
# Sensor-Daten
mosquitto_sub -h localhost -t "kaiser/god/esp/+/sensor/+/data" -v -C 3 -W 90

# Actuator
mosquitto_sub -h localhost -t "kaiser/god/esp/+/actuator/+/command" -v -C 3 -W 90
mosquitto_sub -h localhost -t "kaiser/god/esp/+/actuator/+/status" -v -C 3 -W 90

# Heartbeats
mosquitto_sub -h localhost -t "kaiser/god/esp/+/system/heartbeat" -v -C 1 -W 60

# Spezifisches ESP
mosquitto_sub -h localhost -t "kaiser/god/esp/ESP_12AB34CD/#" -v -C 10 -W 30

# Emergency
mosquitto_sub -h localhost -t "kaiser/broadcast/emergency" -v -C 1 -W 60
```

### 6.4 Test-Messages senden

```bash
# Sensor-Daten
mosquitto_pub -h localhost \
  -t "kaiser/god/esp/TEST_ESP/sensor/34/data" \
  -m '{"ts":1735818000,"gpio":34,"raw":2048,"sensor_type":"ph","raw_mode":true}'

# Actuator-Command
mosquitto_pub -h localhost \
  -t "kaiser/god/esp/TEST_ESP/actuator/5/command" \
  -m '{"command":"ON","value":1.0}'

# Heartbeat
mosquitto_pub -h localhost \
  -t "kaiser/god/esp/TEST_ESP/system/heartbeat" \
  -m '{"ts":1735818000,"uptime":3600,"heap_free":98304,"wifi_rssi":-45}'
```

---

## 7. GitHub Actions Logs

### 7.1 Zugriff via gh CLI

```bash
# Runs auflisten
gh run list --limit=10
gh run list --status=failure --limit=5

# Logs abrufen
gh run view <run-id> --log                          # Vollständig
gh run view <run-id> --log-failed                   # Nur Fehler
gh run view <run-id> --log > ci_full.txt            # Zu Datei

# Artifacts
gh run download <run-id>
gh run download <run-id> --name=unit-test-results
```

### 7.2 Workflow-spezifische Logs

```bash
# Server Tests
gh run list --workflow=server-tests.yml --limit=5

# ESP32 Tests
gh run list --workflow=esp32-tests.yml --limit=5

# Wokwi Tests
gh run list --workflow=wokwi-tests.yml --limit=5
```

---

## 8. Synchronisierte Multi-Log Capture

### 8.1 Drei-Terminal-Setup

Für vollständiges Debugging drei Terminals parallel:

**Terminal 1: Server**
```bash
tail -f "El Servador/god_kaiser_server/logs/god_kaiser.log"
```

**Terminal 2: MQTT**
```bash
mosquitto_sub -h localhost -t "kaiser/#" -v -C 10 -W 30 | tee mqtt.log
```

**Terminal 3: Serial**
```bash
# Wokwi
wokwi-cli . --timeout 90000 2>&1 | tee serial.log

# Oder echter ESP32
pio device monitor | tee serial.log
```

### 8.2 Automatisiertes Capture-Script

```bash
#!/bin/bash
# multi_capture.sh

LOGDIR="logs_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$LOGDIR"

# MQTT
mosquitto_sub -h localhost -t "kaiser/#" -v -C 10 -W 30 > "$LOGDIR/mqtt.log" 2>&1 &
MQTT_PID=$!

# Server
tail -f "El Servador/god_kaiser_server/logs/god_kaiser.log" > "$LOGDIR/server.log" 2>&1 &
SERVER_PID=$!

echo "Logs in $LOGDIR - Enter zum Beenden"
read

kill $MQTT_PID $SERVER_PID 2>/dev/null
```

### 8.3 Timestamp-Korrelation

Alle Logs mit gleichem Format für Korrelation:

```
[2026-02-01 10:23:45] ...
```

**Korrelations-Keys:**
- **ESP-ID:** `ESP_12AB34CD` in allen Quellen
- **GPIO:** Hardware-Zuordnung
- **Timestamp:** Zeitliche Korrelation
- **Request-ID:** Server-Request-Tracing

---

## 9. Windows-spezifische Hinweise

### 9.1 Git Bash vs PowerShell

| Feature | Git Bash | PowerShell |
|---------|----------|------------|
| `tee` | ✅ Nativ | `Tee-Object` |
| `tail -f` | ✅ Nativ | `Get-Content -Wait` |
| `ts` | ❌ WSL | ❌ Manuell |
| Pipe `\|` | ✅ | ✅ |
| Hintergrund `&` | ✅ | Jobs |

### 9.2 PowerShell Äquivalente

```powershell
# tail -f
Get-Content "El Servador/god_kaiser_server/logs/god_kaiser.log" -Wait

# tee
command | Tee-Object -FilePath "output.log"

# Mit Timestamps
& pio device monitor 2>&1 | ForEach-Object {
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $_"
} | Tee-Object -FilePath "serial.txt"
```

### 9.3 WSL für volle Unix-Kompatibilität

```bash
wsl
mosquitto_sub -h localhost -t "kaiser/#" -v -C 10 -W 30 | ts '[%Y-%m-%d %H:%M:%S]' | tee mqtt.log
```

---

## 10. Troubleshooting

| Problem | Ursache | Lösung |
|---------|---------|--------|
| Server Log leer | Server nicht gestartet | Server starten |
| `tail: cannot open` | Pfad falsch | Pfad prüfen |
| `mosquitto_sub: not found` | Nicht installiert | `choco install mosquitto` |
| Wokwi "token not set" | Env Variable fehlt | `export WOKWI_CLI_TOKEN=xxx` |
| Serial "port not found" | ESP32 nicht verbunden | USB prüfen |
| `gh: command not found` | GitHub CLI fehlt | Installieren |

---

## 11. Architektur-Diagramm

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Log-Infrastruktur                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐             │
│  │   ESP32      │     │    Wokwi     │     │   Server     │             │
│  │  (Hardware)  │     │ (Simulation) │     │  (Python)    │             │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘             │
│         │                    │                    │                      │
│         ▼                    ▼                    ▼                      │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐             │
│  │Serial.print()│     │Serial.print()│     │ logging.info │             │
│  │ LOG_* Macros │     │ LOG_* Macros │     │ get_logger() │             │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘             │
│         │                    │                    │                      │
│         ▼                    ▼                    ▼                      │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐             │
│  │pio device    │     │wokwi-cli     │     │RotatingFile  │             │
│  │  monitor     │     │              │     │  Handler     │             │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘             │
│         │                    │                    │                      │
│         ▼                    ▼                    ▼                      │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐             │
│  │ > redirect   │     │--serial-log- │     │god_kaiser.log│             │
│  │ oder tee     │     │   file       │     │   (JSON)     │             │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘             │
│         │                    │                    │                      │
│         ▼                    ▼                    ▼                      │
│   serial_output.log    wokwi_serial.log     logs/god_kaiser.log         │
│                                                                          │
│  ════════════════════════════════════════════════════════════════════   │
│  KI KANN LESEN:  ✅ Alle Output-Dateien nach Prozess-Beendigung         │
│  KI KANN NICHT:  ❌ Live-Output während Prozess läuft (blockierend)     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Monitoring-Stack (Loki / Grafana / Prometheus)

### 12.0 Erreichbarkeit aller Ebenen – KI-Optimalität

| Ebene | Erreichbar | Live | In Loki (wenn `make monitor-up`) | KI-optimal (Labels/Struktur) | Hinweis |
|-------|-------------|------|-----------------------------------|-------------------------------|---------|
| **Server** (el-servador) | Ja | Ja (tail / docker logs / Loki) | Ja, `compose_service=el-servador` + level, logger | Ja (Regex-Parser, level/logger) | Zusätzlich Datei: `logs/server/god_kaiser.log` |
| **Frontend** (el-frontend) | Ja | Ja (docker logs / Loki) | Ja, `compose_service=el-frontend` + level, component | Ja (JSON-Parser) | Nur stdout, kein Bind-Mount |
| **MQTT-Broker** | Ja | Ja (docker logs / Loki) | Ja, `compose_service=mqtt-broker` | Teilweise (kein level-Extract) | Broker-Events; **MQTT-Payload** (kaiser/#) nicht in Loki, nur live z. B. `mosquitto_sub` / session.sh |
| **PostgreSQL** | Ja | Ja (docker logs / Loki) | Ja, `compose_service=postgres` + level, query_duration_ms | Ja (Level-Extraktion, Slow-Query Metadata) | `logging_collector=off` → stderr → Docker → Alloy → Loki |
| **ESP32 Serial** | Bedingt | Ja, wenn Pfad aktiv | Ja, wenn Profile `hardware` + Host-Bridge (ser2net/socat); `compose_service=esp32-serial-logger` + level, device_id, component | Ja (JSON-Parser) | Ohne Hardware-Bridge nur manuell: `logs/current/esp32_serial.log` |

**Zusammenfassung:** Alle Container-Logs sind erreichbar und bei laufendem Monitoring in Loki durchsuchbar (LogQL, Zeitfenster, Labels). Live-Zugriff immer über `docker compose logs -f <service>`. KI-optimal: Server, Frontend und (wenn aktiv) ESP32 haben strukturierte Labels; MQTT-Payload-Stream (Nachrichteninhalt) ist nicht in Loki. Einstieg Gesamtzustand: `debug-status.ps1`.

### 12.1 Voraussetzung

Monitoring-Stack muss gestartet sein: `make monitor-up`

### 12.2 Loki-Queries (Zentrales Log-System)

```bash
# Alle Server-Logs (letzte Stunde) – Label compose_service (ROADMAP §1.1)
curl -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_service="el-servador"}' \
  --data-urlencode 'limit=100'

# Nur Errors
curl -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_service="el-servador"} |= "ERROR"' \
  --data-urlencode 'limit=50'

# MQTT-Broker Logs
curl -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_service="mqtt-broker"}' \
  --data-urlencode 'limit=50'

# Frontend-Logs (Vue/Vite stdout, Alloy Stage 3: JSON level/component)
curl -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_service="el-frontend"}' \
  --data-urlencode 'limit=50'

# PostgreSQL-Logs (stderr → Docker → Alloy; level + query_duration_ms als Metadata)
curl -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_service="postgres"}' \
  --data-urlencode 'limit=30'

# ESP32 Serial (nur wenn Profile hardware + Host-Bridge aktiv)
curl -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_service="esp32-serial-logger"}' \
  --data-urlencode 'limit=50'

# Verfuegbare Labels
curl -s http://localhost:3100/loki/api/v1/labels

# Services auflisten (compose_service = Alloy-Target-Label)
curl -s "http://localhost:3100/loki/api/v1/label/compose_service/values"
```

### 12.3 Loki-Labels

| Label | Beschreibung | Beispiel-Werte |
|-------|-------------|----------------|
| `compose_service` | Docker Compose Service-Name (Primär für Queries, ROADMAP §1.1) | `el-servador`, `mqtt-broker`, `el-frontend`, `postgres`, `esp32-serial-logger` |
| `container` | Container-Name | `automationone-server`, `automationone-mqtt`, `automationone-esp32-serial` |
| `service` | Wie compose_service (Alloy setzt beide) | `el-servador` |
| `compose_project` | Compose-Projekt | `auto-one` |
| `stream` | Log-Stream | `stdout`, `stderr` |

### 12.4 Grafana

**URL:** http://localhost:3000 (admin / GRAFANA_ADMIN_PASSWORD aus .env)
**Dashboard:** AutomationOne - System Health (`/d/automationone-system-health`)
**Datasources:** Prometheus (default), Loki

### 12.5 Prometheus-Metriken

```bash
# Server-Metriken (Prometheus-Format)
curl -s http://localhost:8000/api/v1/health/metrics

# Prometheus Targets
curl -s http://localhost:9090/api/v1/targets
```

**Scrape-Config:** `docker/prometheus/prometheus.yml`
**Scrape-Path:** `/api/v1/health/metrics` (nicht `/metrics`)
**Interval:** 15s

---

**Letzte Aktualisierung:** 2026-02-25
**Version:** 4.5
**Changelog:**
- 4.6: Multi-Layer Logging Fix: PostgreSQL `logging_collector=off` (kein Bind-Mount `logs/postgres/` mehr, Logs via stderr → Docker → Alloy → Loki). Alloy-Pipeline: PG Level-Extraktion (LOG→INFO, FATAL/PANIC→CRITICAL), `query_duration_ms` Structured Metadata, ESP32 Regex-Fallback für Plain-Text-Logs. Pure ASGI RequestIdMiddleware (ContextVar-Fix). MQTT CID Thread-Propagation
- 4.5: Alert-Quality Fix: Container Restart Loop nutzt `changes(container_start_time_seconds)` (cAdvisor hat kein `container_restart_count`). Container Disk Usage ersetzt durch Database Size High (`pg_database_size_bytes`). cAdvisor auf Docker Desktop hat kein `name`-Label — nur `id`-Pfade. 38/38 Alerts laden fehlerfrei
- 4.4: Alerting erweitert auf 38 Rules (32 Prometheus + 6 Loki). Neue: Frontend Down (Loki), Container Restart Loop, Database Size High, Loki Ingestion Failure
- 4.3: debug-status.ps1 in Quick Reference (System Health erster Schritt). WebClient-Fallback, Grafana-Auth dokumentiert in scripts/debug/README.md
- 4.2: Alloy native River-Config (docker/alloy/config.alloy). Structured Metadata (logger, request_id, component, device, error_code). 6 Loki-Alerts + Debug-Console Dashboard. 4 Makefile-Targets (loki-errors, loki-trace, loki-esp, loki-health)
- 4.1: Promtail → Grafana Alloy Migration (EOL 2026-03-02). Alle Promtail-Referenzen aktualisiert
- 4.0: Frontend Logger jetzt JSON-strukturiert (Stage 3 funktioniert), Stage 5 Mosquitto healthcheck drop, `logs/esp32/` Verzeichnis erstellt, Server apscheduler noise reduziert
- 3.9: Error-Injection Wokwi-Logs (`11-error-injection/`), Verweis auf `WOKWI_ERROR_MAPPING.md`
- 3.7: §12.0 Erreichbarkeit aller Ebenen (Tabelle KI-Optimalität); Loki-Beispiele für postgres + esp32-serial-logger
- 3.6: Frontend-Container-Logs als Log-Quelle ergänzt (stdout → Loki, kein Bind-Mount; Tabelle Log-Verzeichnisse, 1.1, 1.2, 12.2)
- 3.5: Playwright E2E-Log-Pfade in Quick-Reference und Übersicht ergänzt (logs/frontend/playwright/)
- 3.4: Loki-Queries auf compose_service umgestellt (ROADMAP §1.1); MQTT Bind-Mount als deaktiviert dokumentiert (stdout-only); Label-Tabelle compose_service als primär
- 3.3: Loki-Labels: esp32-serial-logger Service und automationone-esp32-serial Container in Beispiel-Werte ergaenzt
- 3.2: Wokwi Log-Pfade (logs/wokwi/) in Quick-Reference und Docker-Log-Tabelle ergaenzt
- 3.1: Monitoring-Stack Section (Loki-Queries, Labels, Grafana, Prometheus)
- 3.0: Docker-basierte Log-Infrastruktur
  - Neue Log-Verzeichnisse: `logs/server/`, `logs/mqtt/`, `logs/postgres/`, `logs/esp32/`
  - PostgreSQL-Logging aktiviert via `docker/postgres/postgresql.conf`
  - Mosquitto-Logs: Named Volume → Bind-Mount `./logs/mqtt`
  - Server backup_count: 100 → 10
  - Frontend: Docker json-file Driver + Vue Global Error Handler
  - `.env`-Auslagerung aller Secrets aus `docker-compose.yml`
  - `restart: unless-stopped` für alle Core-Services
  - `session.sh`: Docker-Flow statt Poetry, MQTT-Capture mit Timestamps
- 2.2: ESP32 Logger-System (Firmware) und Architektur-Diagramm hinzugefügt
- 2.1: Wokwi `--serial-log-file` Option dokumentiert, log2file Zuverlässigkeitsprobleme klargestellt
- 2.0: Konsolidiert aus LOG_LOCATIONS, LOG_INFRASTRUCTURE, SERIAL_CAPTURE
