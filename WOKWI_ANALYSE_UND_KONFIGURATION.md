# Wokwi Einstellungen - Detaillierte Analyse und Konfiguration für Cursor/AI-Zugriff

> **Zweck:** Diese Analyse dokumentiert, wie Wokwi so konfiguriert werden kann, dass ich (Auto/AI) von Cursor aus Wokwi starten und alle Logs automatisch analysieren kann.

---

## 📋 Inhaltsverzeichnis

1. [Aktuelle Wokwi-Konfiguration](#aktuelle-wokwi-konfiguration)
2. [Vorhandene Komponenten](#vorhandene-komponenten)
3. [Konfiguration für AI-Zugriff](#konfiguration-für-ai-zugriff)
4. [Workflow: Wokwi von Cursor aus starten](#workflow-wokwi-von-cursor-aus-starten)
5. [Log-Erfassung und -Analyse](#log-erfassung-und--analyse)
6. [Empfohlene Verbesserungen](#empfohlene-verbesserungen)
7. [Schritt-für-Schritt Anleitung](#schritt-für-schritt-anleitung)

---

## 1. Aktuelle Wokwi-Konfiguration

### 1.1 Wokwi TOML Konfiguration (`El Trabajante/wokwi.toml`)

```toml
[wokwi]
version = 1
firmware = ".pio/build/wokwi_simulation/firmware.bin"
elf = ".pio/build/wokwi_simulation/firmware.elf"

# RFC2217 Serial Port für externen Zugriff
rfc2217ServerPort = 4000

[wokwi.network]
gateway = true  # Ermöglicht Verbindung zu host.wokwi.internal (localhost)

[wokwi.serial]
baud = 115200
```

**Wichtige Details:**
- ✅ RFC2217 Server auf Port 4000 aktiviert - ermöglicht externen Serial-Zugriff
- ✅ Network Gateway aktiviert - ESP32 kann zu `host.wokwi.internal` verbinden (wird zu localhost geroutet)
- ✅ Baudrate: 115200 (Standard für ESP32)
- ⚠️ Firmware-Pfad relativ zu `El Trabajante/` Verzeichnis

### 1.2 PlatformIO Environment (`platformio.ini`)

```ini
[env:wokwi_simulation]
extends = env:esp32_dev
build_flags =
    ${env:esp32_dev.build_flags}
    -D WOKWI_SIMULATION=1
    -D WOKWI_WIFI_SSID=\"Wokwi-GUEST\"
    -D WOKWI_WIFI_PASSWORD=\"\"
    -D WOKWI_MQTT_HOST=\"host.wokwi.internal\"
    -D WOKWI_MQTT_PORT=1883
    -D WOKWI_ESP_ID=\"ESP_00000001\"
```

**Konfiguration für Wokwi:**
- ✅ Wokwi-spezifische WiFi-Credentials (Wokwi-GUEST ist offenes Netzwerk)
- ✅ MQTT-Host via Wokwi Gateway (`host.wokwi.internal`)
- ✅ Vorkonfigurierte ESP-ID für reproduzierbare Tests

### 1.3 Hardware Diagram (`diagram.json`)

```json
{
  "version": 1,
  "parts": [
    { "type": "wokwi-esp32-devkit-v1", "id": "esp" },
    { "type": "wokwi-ds18b20", "id": "temp1" },
    { "type": "wokwi-led", "id": "led1", "attrs": { "color": "green" } }
  ],
  "connections": [
    ["esp:TX0", "$serialMonitor:RX"],
    ["esp:RX0", "$serialMonitor:TX"],
    ["esp:D4", "temp1:DQ"],
    ["esp:D5", "led1:A"]
  ]
}
```

**Hardware-Konfiguration:**
- ✅ ESP32 DevKit V1
- ✅ DS18B20 Temperatursensor auf GPIO 4
- ✅ LED auf GPIO 5
- ✅ Serial Monitor über TX0/RX0

---

## 2. Vorhandene Komponenten

### 2.1 Wokwi CLI Token

**Gefunden in `scripts/run-wokwi.bat`:**
```batch
set WOKWI_CLI_TOKEN=wok_F9PGu0KSKMTupAZUUzEf6vFHyenjcYI420b4b725
```

**Status:** ✅ Token vorhanden (Pro-Account mit CI-Zugriff)

### 2.2 Start-Scripts

**1. `scripts/run-wokwi.bat`** (Einfacher Start)
```batch
set WOKWI_CLI_TOKEN=wok_F9PGu0KSKMTupAZUUzEf6vFHyenjcYI420b4b725
cd "El Trabajante"
"C:\Users\PCUser\.wokwi\bin\wokwi-cli.exe" . --timeout 30000
```

**2. `scripts/start-wokwi-dev.ps1`** (Vollständige Entwicklungsumgebung)
- Startet Mosquitto MQTT Broker (Docker)
- Startet God-Kaiser Server
- Startet Wokwi Simulation
- Seedet Wokwi ESP in Datenbank

**3. `El Trabajante/scripts/wokwi_serial_logger.py`** (Serial-Logger)
- Verbindet zu RFC2217 Server (Port 4000)
- Loggt Serial-Output in `logs/wokwi_serial.log`
- Extrahiert [DEBUG] JSON-Logs in `.cursor/debug.log`

### 2.3 Wokwi CLI Installation

**Erwarteter Pfad:** `C:\Users\PCUser\.wokwi\bin\wokwi-cli.exe`

**Installation falls nicht vorhanden:**
```powershell
# Linux/Mac
curl -L https://wokwi.com/ci/install.sh | sh

# Windows (manuell oder via VS Code Extension)
# VS Code Extension: "Wokwi" von Wokwi
# Oder Download von: https://wokwi.com/dashboard/ci
```

---

## 3. Konfiguration für AI-Zugriff

### 3.1 Aktuelle Situation

**Was funktioniert bereits:**
- ✅ Wokwi TOML konfiguriert mit RFC2217 Server
- ✅ Serial Logger Script vorhanden
- ✅ Wokwi CLI Token vorhanden
- ✅ PlatformIO Environment für Wokwi konfiguriert
- ✅ Hardware Diagram definiert

**Was fehlt für AI-Zugriff:**
- ⚠️ Automatisches Firmware-Build vor Wokwi-Start
- ⚠️ Automatischer Start des Serial-Loggers
- ⚠️ Einheitliches Script, das alles orchestriert
- ⚠️ Log-Analyse-Script, das die Logs strukturiert ausgibt

### 3.2 Empfohlene Konfiguration

#### Option A: Einfaches PowerShell-Script (Empfohlen)

**Erstellt:** `scripts/wokwi-start-ai.ps1`

```powershell
# ============================================
# Wokwi Start-Script für AI-Zugriff
# ============================================
# Startet Wokwi Simulation und loggt alle Ausgaben
# für automatische Analyse durch AI

param(
    [int]$Timeout = 60000,  # 60 Sekunden Standard
    [string]$Scenario = "", # Optional: Test-Szenario
    [switch]$BuildFirst = $true  # Firmware vorher bauen
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$TrabajanteDir = "$ProjectRoot\El Trabajante"
$LogDir = "$TrabajanteDir\logs"
$LogFile = "$LogDir\wokwi_serial.log"
$AnalysisFile = "$LogDir\wokwi_analysis.json"

# 1. Token setzen
$env:WOKWI_CLI_TOKEN = "wok_F9PGu0KSKMTupAZUUzEf6vFHyenjcYI420b4b725"

# 2. Firmware bauen (optional)
if ($BuildFirst) {
    Write-Host "[1/4] Building firmware..." -ForegroundColor Yellow
    Push-Location $TrabajanteDir
    try {
        $pioPath = "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe"
        & $pioPath run -e wokwi_simulation
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERROR] Firmware build failed" -ForegroundColor Red
            exit 1
        }
    } finally {
        Pop-Location
    }
    Write-Host "[OK] Firmware built" -ForegroundColor Green
}

# 3. Log-Verzeichnis erstellen
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# 4. Serial Logger im Hintergrund starten
Write-Host "[2/4] Starting serial logger..." -ForegroundColor Yellow
$loggerScript = "$TrabajanteDir\scripts\wokwi_serial_logger.py"
$loggerJob = Start-Job -ScriptBlock {
    param($scriptPath, $logFile)
    Set-Location (Split-Path -Parent $scriptPath)
    python $scriptPath 2>&1 | Out-File -FilePath "$logFile.stdout" -Encoding UTF8
} -ArgumentList $loggerScript, $LogFile

# 5. Warten bis Logger bereit ist
Start-Sleep -Seconds 2

# 6. Wokwi starten
Write-Host "[3/4] Starting Wokwi simulation..." -ForegroundColor Yellow
Push-Location $TrabajanteDir

try {
    $wokwiCli = "C:\Users\PCUser\.wokwi\bin\wokwi-cli.exe"
    
    if ($Scenario) {
        & $wokwiCli . --timeout $Timeout --scenario $Scenario
    } else {
        & $wokwiCli . --timeout $Timeout
    }
    
    $exitCode = $LASTEXITCODE
} finally {
    Pop-Location
    
    # Logger stoppen
    Write-Host "[4/4] Stopping logger..." -ForegroundColor Yellow
    Stop-Job $loggerJob -ErrorAction SilentlyContinue
    Remove-Job $loggerJob -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

# 7. Log-Analyse erstellen
Write-Host "Analyzing logs..." -ForegroundColor Yellow
if (Test-Path $LogFile) {
    # Log-Analyse hier (siehe Abschnitt 5)
}

Write-Host "Done! Logs: $LogFile" -ForegroundColor Green
exit $exitCode
```

#### Option B: Python-basiertes Script (Erweitert)

**Vorteile:**
- Bessere Log-Parsing-Fähigkeiten
- Strukturierte JSON-Ausgabe
- Integration mit vorhandenem `wokwi_serial_logger.py`

---

## 4. Workflow: Wokwi von Cursor aus starten

### 4.1 Minimaler Workflow

```powershell
# 1. In Terminal von Cursor:
cd "El Trabajante"

# 2. Firmware bauen (einmalig oder bei Code-Änderungen):
pio run -e wokwi_simulation

# 3. Wokwi starten (ich kann das tun):
& "scripts\wokwi-start-ai.ps1" -Timeout 60000

# 4. Logs analysieren:
# Ich lese dann automatisch: El Trabajante/logs/wokwi_serial.log
```

### 4.2 Vollständiger Workflow mit MQTT

```powershell
# 1. MQTT Broker starten (Docker):
docker run -d --name mosquitto-wokwi -p 1883:1883 -e "MOSQUITTO_USERNAME=" eclipse-mosquitto:2 mosquitto -c /mosquitto-no-auth.conf

# 2. Wokwi mit vollständigem Setup starten:
& "scripts\start-wokwi-dev.ps1"

# Oder manuell:
# a) Firmware bauen
# b) Serial Logger starten (in separatem Terminal)
# c) Wokwi starten
```

### 4.3 Was ich (AI) tun kann:

1. ✅ **Firmware bauen:** `run_terminal_cmd` mit `pio run -e wokwi_simulation`
2. ✅ **Wokwi starten:** `run_terminal_cmd` mit `wokwi-cli` Befehl
3. ✅ **Logs lesen:** `read_file` für `logs/wokwi_serial.log`
4. ✅ **Logs analysieren:** Strukturierte Analyse mit Python/PowerShell

**Was ich NICHT direkt tun kann:**
- ❌ Interaktive VS Code Extension (Wokwi: Start Simulator)
- ❌ Parallele Prozesse ohne Job-Scheduling (aber PowerShell Jobs funktionieren)

---

## 5. Log-Erfassung und -Analyse

### 5.1 Aktuelles Log-Format

**Datei:** `El Trabajante/logs/wokwi_serial.log`

**Format:**
```
=== Wokwi Serial Log - 2026-01-05T23:57:38.312810 ===
[23:57:38.314] <Serial Output>
[23:57:38.315] rst:0x1 (POWERON_RESET)
[23:57:43.072] ╔════════════════════════════════════════╗
[23:57:43.086] ║  ESP32 Sensor Network v4.0 (Phase 2)  ║
```

**Struktur:**
- Timestamp: `[HH:MM:SS.mmm]`
- Boot-Sequenz: ESP32 Boot-Logs
- Application-Logs: Firmware-Logs mit Timestamps
- Debug-Logs: JSON-Format `[DEBUG] {...}`

### 5.2 Empfohlene Log-Analyse

**Neues Script:** `El Trabajante/scripts/wokwi_analyze_logs.py`

**Funktionen:**
1. Parse Serial-Logs nach Kategorien
2. Extrahiere Boot-Sequenz
3. Extrahiere MQTT-Ereignisse
4. Extrahiere Sensor/Actuator-Ereignisse
5. Extrahiere Fehler/Warnings
6. Erstelle strukturierte JSON-Ausgabe

**Ausgabe-Format:**
```json
{
  "timestamp": "2026-01-05T23:57:38",
  "summary": {
    "boot_success": true,
    "wifi_connected": true,
    "mqtt_connected": true,
    "errors": [],
    "warnings": []
  },
  "boot_sequence": [...],
  "mqtt_events": [...],
  "sensor_readings": [...],
  "actuator_commands": [...],
  "errors": [...],
  "warnings": [...]
}
```

### 5.3 Integration in Cursor

**Ich kann Logs so analysieren:**

```python
# 1. Logs lesen
log_content = read_file("El Trabajante/logs/wokwi_serial.log")

# 2. Analysieren (in Python-Script oder direkt)
# - Regex-Patterns für Boot-Sequenz
# - MQTT-Topic-Parsing
# - Error-Extraktion
# - Timing-Analyse

# 3. Strukturierte Ausgabe in Datei
# write("El Trabajante/logs/wokwi_analysis.json", analysis_json)
```

---

## 6. Empfohlene Verbesserungen

### 6.1 Sofort umsetzbar

1. **✅ Einheitliches Start-Script erstellen**
   - Kombiniert Firmware-Build, Logger-Start, Wokwi-Start
   - Einfacher für mich aufzurufen

2. **✅ Log-Analyse-Script erstellen**
   - Parse Logs in strukturiertes Format
   - JSON-Ausgabe für einfache Analyse

3. **✅ Environment-Variable für Token**
   - Nicht in Batch-Datei hardcoden
   - `.env` Datei oder System-Environment

### 6.2 Mittel-term Verbesserungen

1. **Log-Parsing-Rules definieren**
   - Regex-Patterns für häufige Log-Muster
   - Kategorisierung (Boot, MQTT, Sensor, Actuator, Error)

2. **Integration mit VS Code Tasks**
   - `.vscode/tasks.json` für einfachen Start
   - Keyboard-Shortcuts

3. **Automatische Log-Analyse nach Test**
   - Script analysiert Logs automatisch nach Wokwi-Exit
   - Erstellt Zusammenfassung

### 6.3 Langfristige Verbesserungen

1. **CI/CD Integration**
   - GitHub Actions für automatisierte Tests
   - Log-Artefakte in CI

2. **WebSocket-Log-Streaming**
   - Real-time Log-Streaming (aktuell nur RFC2217)
   - Bessere Integration mit Frontend

3. **Strukturierte Logging im Firmware**
   - JSON-Logs für bessere Parsing
   - Log-Level-Kategorisierung

---

## 7. Schritt-für-Schritt Anleitung

### 7.1 Erste Einrichtung

```powershell
# 1. Wokwi CLI installieren (falls nicht vorhanden)
# Via VS Code Extension oder manuell

# 2. Token in Environment setzen
$env:WOKWI_CLI_TOKEN = "wok_F9PGu0KSKMTupAZUUzEf6vFHyenjcYI420b4b725"

# 3. Firmware testen
cd "El Trabajante"
pio run -e wokwi_simulation

# 4. Test-Start
wokwi-cli . --timeout 30000
```

### 7.2 Für AI-Zugriff: Empfohlene Konfiguration

**Option 1: Manueller Workflow (aktuell möglich)**

1. Ich (AI) starte Firmware-Build:
   ```
   run_terminal_cmd: pio run -e wokwi_simulation
   ```

2. Ich starte Wokwi (mit Timeout):
   ```
   run_terminal_cmd: wokwi-cli . --timeout 60000
   ```

3. Logs werden automatisch in `logs/wokwi_serial.log` geschrieben (wenn RFC2217 aktiv)

4. Ich analysiere Logs:
   ```
   read_file: El Trabajante/logs/wokwi_serial.log
   ```

**Option 2: Mit Script (empfohlen)**

1. Erstelle `scripts/wokwi-start-ai.ps1` (siehe Abschnitt 3.2)

2. Ich rufe auf:
   ```
   run_terminal_cmd: & "scripts\wokwi-start-ai.ps1" -Timeout 60000
   ```

3. Script macht alles:
   - Firmware-Build
   - Serial-Logger-Start
   - Wokwi-Start
   - Log-Analyse

4. Ich lese Analyse:
   ```
   read_file: El Trabajante/logs/wokwi_analysis.json
   ```

### 7.3 Typischer Analyse-Workflow

**Wenn ich Wokwi-Logs analysieren soll:**

1. **Logs lesen:**
   ```python
   logs = read_file("El Trabajante/logs/wokwi_serial.log")
   ```

2. **Patterns suchen:**
   - Boot-Sequenz: `╔════════════════════════════════════════╗`
   - WiFi-Connect: `WiFi connected successfully`
   - MQTT-Connect: `MQTT connected successfully`
   - Errors: `[ERROR]` oder `[E][...]`
   - Warnings: `[WARNING]` oder `[W][...]`

3. **Strukturierte Analyse:**
   - Zeilenweise Parsing
   - Regex-Matching
   - Kategorisierung
   - Timing-Analyse

4. **Ausgabe:**
   - Markdown-Datei mit Zusammenfassung
   - JSON für strukturierte Daten
   - Fehler-Highlights

---

## 8. Zusammenfassung

### ✅ Was bereits funktioniert:

1. **Wokwi-Konfiguration:**
   - ✅ `wokwi.toml` mit RFC2217 Server
   - ✅ `platformio.ini` mit `wokwi_simulation` Environment
   - ✅ `diagram.json` Hardware-Definition

2. **Tools:**
   - ✅ Wokwi CLI Token vorhanden
   - ✅ Serial Logger Script vorhanden
   - ✅ Start-Scripts vorhanden

3. **Logs:**
   - ✅ Logs werden in `logs/wokwi_serial.log` geschrieben
   - ✅ Timestamps vorhanden
   - ✅ Strukturierte Ausgabe

### ⚠️ Was noch fehlt:

1. **Integration:**
   - ⚠️ Einheitliches Script für AI-Zugriff
   - ⚠️ Automatische Log-Analyse
   - ⚠️ Strukturierte JSON-Ausgabe

2. **Dokumentation:**
   - ⚠️ Workflow-Dokumentation für AI
   - ⚠️ Log-Parsing-Rules

### 🎯 Nächste Schritte:

1. **Erstelle `scripts/wokwi-start-ai.ps1`** (kombiniert alles)
2. **Erstelle `El Trabajante/scripts/wokwi_analyze_logs.py`** (Log-Analyse)
3. **Teste Workflow** (von mir ausführbar)
4. **Dokumentiere** (diese Datei aktualisieren)

---

**Erstellt:** 2026-01-06  
**Letzte Aktualisierung:** 2026-01-06  
**Status:** ✅ Analyse abgeschlossen, Empfehlungen bereitgestellt


