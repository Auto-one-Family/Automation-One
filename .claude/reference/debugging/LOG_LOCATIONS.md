# Log-System - AutomationOne

> **Version:** 2.1 | **Aktualisiert:** 2026-02-01
> **Zweck:** Vollständige Dokumentation aller Log-Quellen, Speicherorte und Capture-Methoden
> **Änderungen 2.1:** Wokwi `--serial-log-file` Option dokumentiert, log2file Zuverlässigkeitsprobleme klargestellt

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

## 0. Quick Reference

### Häufigste Commands

```bash
# ============================================
# SERVER LOGS
# ============================================
tail -f "El Servador/god_kaiser_server/logs/god_kaiser.log"           # Live
grep -i error "El Servador/god_kaiser_server/logs/god_kaiser.log"     # Errors suchen

# ============================================
# TESTS
# ============================================
cd "El Servador/god_kaiser_server" && poetry run pytest tests/ -v --no-cov    # Alle Tests
cd "El Servador/god_kaiser_server" && poetry run pytest tests/ -v --lf        # Nur fehlgeschlagene

# ============================================
# WOKWI
# ============================================
cd "El Trabajante" && wokwi-cli . --timeout 90000 --serial-log-file wokwi.log   # Native Option (EMPFOHLEN)
cd "El Trabajante" && wokwi-cli . --timeout 90000 2>&1 | tee wokwi.log          # Pipe Alternative        # Mit Capture

# ============================================
# ESP32 SERIAL
# ============================================
cd "El Trabajante" && pio device monitor                                       # Live
cd "El Trabajante" && pio device monitor > serial.log 2>&1                     # Direkte Umleitung (EMPFOHLEN)
cd "El Trabajante" && pio device monitor | tee serial.log                      # Mit tee (Git Bash)

# ============================================
# MQTT
# ============================================
mosquitto_sub -h localhost -t "kaiser/#" -v                                    # Live
mosquitto_sub -h localhost -t "kaiser/#" -v | tee mqtt.log                     # Mit Capture

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
| **GitHub Actions** | CI Logs | ❌ | ✅ | ✅ `--log` Flag |

### 1.2 Zugriffsmethoden für KI

| Quelle | KI-Zugriff | Methode |
|--------|------------|---------|
| Server Logs | ✅ Direkt | Read Tool, `tail`, `grep` |
| pytest | ✅ Direkt | Bash Tool |
| Wokwi | ⚠️ Bedingt | Token nötig, dann Bash |
| ESP32 Serial | ❌ | User muss Output teilen |
| MQTT | ⚠️ Bedingt | `mosquitto_sub` muss installiert sein |
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
| `file_backup_count` | 100 | `LOG_FILE_BACKUP_COUNT` |

### 2.2 Log-Pfad und Rotation

```
El Servador/god_kaiser_server/logs/
├── god_kaiser.log        # Aktuelle Log-Datei
├── god_kaiser.log.1      # Ältester Backup
├── god_kaiser.log.2
├── ...
└── god_kaiser.log.100    # Neuester Backup
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
# PlatformIO
cd "El Trabajante" && pio device list

# Windows PowerShell
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
mosquitto_sub -h localhost -t "kaiser/#" -v | tee mqtt.log

# Mit Timestamps
mosquitto_sub -h localhost -t "kaiser/#" -v | ts '[%Y-%m-%d %H:%M:%S]' | tee mqtt_ts.log

# Hintergrund
mosquitto_sub -h localhost -t "kaiser/#" -v > mqtt.log 2>&1 &
```

### 6.3 Topic-Filter

```bash
# Sensor-Daten
mosquitto_sub -h localhost -t "kaiser/god/esp/+/sensor/+/data" -v

# Actuator
mosquitto_sub -h localhost -t "kaiser/god/esp/+/actuator/+/command" -v
mosquitto_sub -h localhost -t "kaiser/god/esp/+/actuator/+/status" -v

# Heartbeats
mosquitto_sub -h localhost -t "kaiser/god/esp/+/system/heartbeat" -v

# Spezifisches ESP
mosquitto_sub -h localhost -t "kaiser/god/esp/ESP_12AB34CD/#" -v

# Emergency
mosquitto_sub -h localhost -t "kaiser/broadcast/emergency" -v
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
mosquitto_sub -h localhost -t "kaiser/#" -v | tee mqtt.log
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
mosquitto_sub -h localhost -t "kaiser/#" -v > "$LOGDIR/mqtt.log" 2>&1 &
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
mosquitto_sub -h localhost -t "kaiser/#" -v | ts '[%Y-%m-%d %H:%M:%S]' | tee mqtt.log
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

**Letzte Aktualisierung:** 2026-02-01
**Version:** 2.2
**Changelog:**
- 2.2: ESP32 Logger-System (Firmware) und Architektur-Diagramm hinzugefügt
- 2.1: Wokwi `--serial-log-file` Option dokumentiert, log2file Zuverlässigkeitsprobleme klargestellt
- 2.0: Konsolidiert aus LOG_LOCATIONS, LOG_INFRASTRUCTURE, SERIAL_CAPTURE
