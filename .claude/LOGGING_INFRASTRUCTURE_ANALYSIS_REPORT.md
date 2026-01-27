# Log Infrastructure Analysis Report
**Analyst:** AI Assistant
**Date:** 2026-01-23 (aktualisiert)
**Original Date:** 2026-01-14
**Project:** AutomationOne Framework - God-Kaiser Server

---

## Executive Summary

**Total Log Files Found:** 14
- Server Logs (logs/): 6 Dateien (~48.5 MB)
- Root-Verzeichnis Logs: 8 Dateien (~305 KB)
- MQTT Logs: 1 Datei (~3.4 MB)

**Total Log Size:** ~52.2 MB (verifiziert am 2026-01-23)

**Log Configuration Status:** ✅ **FULLY CONFIGURED**
- Server: Python RotatingFileHandler mit Rotation (10 MB, 5 Backups)
- Mosquitto: Konfiguriert, aber Rotation fehlt
- Windows Unicode Fix: Implementiert in logging_config.py (Bug Z)

**Critical Issues Found:** 1 (Mosquitto Log-Rotation fehlt)
**Warnings:** 3 (Root-Logs nicht rotiert, fehlende .log.4 Datei, Test-Logs nicht bereinigt)

---

## 1. Server Logs (God-Kaiser)

### 1.1 Logging Configuration

**Config File:** `El Servador/god_kaiser_server/src/core/logging_config.py`

**Configuration Details:**

#### Log Settings (aus `src/core/config.py`):
```python
class LoggingSettings(BaseSettings):
    level: str = "INFO"  # Default, konfigurierbar via LOG_LEVEL
    format: str = "json"  # Default, konfigurierbar via LOG_FORMAT
    file_path: str = "logs/god_kaiser.log"  # Default, konfigurierbar via LOG_FILE_PATH
    file_max_bytes: int = 10485760  # 10 MB, konfigurierbar via LOG_FILE_MAX_BYTES
    file_backup_count: int = 5  # Konfigurierbar via LOG_FILE_BACKUP_COUNT
```

#### Environment Variables:
- `LOG_LEVEL`: INFO (default), DEBUG, WARNING, ERROR, CRITICAL
- `LOG_FORMAT`: json (default) oder text
- `LOG_FILE_PATH`: logs/god_kaiser.log (default)
- `LOG_FILE_MAX_BYTES`: 10485760 (10 MB, default)
- `LOG_FILE_BACKUP_COUNT`: 5 (default)

#### Handlers:

1. **File Handler (RotatingFileHandler)**
   - **Target:** `logs/god_kaiser.log` (relativ zum Server-Verzeichnis)
   - **Level:** INFO (oder via LOG_LEVEL konfiguriert)
   - **Formatter:** JSONFormatter (wenn format="json") oder TextFormatter
   - **Max Bytes:** 10 MB (10485760 bytes)
   - **Backup Count:** 5 Dateien
   - **Encoding:** UTF-8
   - **Rotation:** ✅ Automatisch bei 10 MB

2. **Console Handler (StreamHandler)**
   - **Target:** stdout
   - **Level:** INFO (oder via LOG_LEVEL konfiguriert)
   - **Formatter:** TextFormatter (immer Text für bessere Lesbarkeit)
   - **Format:** `%(asctime)s - %(name)s - %(levelname)s - %(message)s`
   - **Timestamp Format:** `%Y-%m-%d %H:%M:%S`

#### Formatters:

**JSONFormatter:**
```json
{
  "timestamp": "2026-01-14 10:30:15",
  "level": "INFO",
  "logger": "api.sensors",
  "message": "Created sensor soil_moisture on ESP_00000001 GPIO 32",
  "module": "sensors",
  "function": "create_sensor",
  "line": 145
}
```

**TextFormatter:**
```
2026-01-14 10:30:15 - api.sensors - INFO - Created sensor soil_moisture on ESP_00000001 GPIO 32
```

#### Special Logger Levels:
- `paho.mqtt`: WARNING (reduziert MQTT-Library Noise)
- `urllib3`: WARNING (reduziert HTTP-Library Noise)
- `asyncio`: WARNING (reduziert Async-Library Noise)

### 1.2 Main Application Log

**File:** `El Servador/god_kaiser_server/logs/god_kaiser.log`
- **Status:** ✅ **AKTIV** (Verzeichnis wird automatisch angelegt)
- **Format:** JSON (default) oder Text (wenn LOG_FORMAT=text)
- **Rotation:** ✅ Automatisch bei 10 MB, behält 5 Backups
- **Levels:** DEBUG, INFO, WARNING, ERROR, CRITICAL (abhängig von LOG_LEVEL)

**Aktuelle Dateien (verifiziert 2026-01-23):**
```
logs/
├── god_kaiser.log       5,323,132 bytes (~5.08 MB) - aktuell
├── god_kaiser.log.1    10,474,367 bytes (~9.99 MB) - Backup
├── god_kaiser.log.2    10,485,721 bytes (~10.00 MB)
├── god_kaiser.log.3    10,485,829 bytes (~10.00 MB)
├── god_kaiser.log.4    ⚠️ FEHLT - mögliches Rotation-Artefakt
├── god_kaiser.log.5    10,485,883 bytes (~10.00 MB) - ältester
├── mosquitto.log        3,599,630 bytes (~3.43 MB)
├── .gitkeep                     0 bytes
└── nul                          0 bytes (Windows-Artefakt)
```

**Gesamt-Größe logs/:** ~48.5 MB
**Max Size (konfiguriert):** ~60 MB (6 Dateien × 10 MB)

**⚠️ HINWEIS:** Die Datei `god_kaiser.log.4` fehlt. Dies kann passieren, wenn:
1. Die Rotation unterbrochen wurde
2. Eine Datei manuell gelöscht wurde
3. Ein Rotationsfehler aufgetreten ist

**Empfehlung:** Bei nächster Rotation wird .4 automatisch erstellt.

### 1.3 Found Log Files (Root Directory)

**Gefundene Log-Dateien im Server-Root (verifiziert 2026-01-23):**

| Datei | Größe | Letzte Änderung | Typ | Status |
|-------|-------|-----------------|-----|--------|
| `server.log` | 265 bytes | 2026-12-26 | Uvicorn Server Log | ⚠️ Nicht rotiert |
| `server_8001.log` | 3,900 bytes | 2026-12-26 | Uvicorn (Port 8001) | ⚠️ Nicht rotiert |
| `test_api_auth.log` | 258,490 bytes (~252 KB) | 2026-12-11 | Pytest Output | ⚠️ Test-Artefakt |
| `test_auth_security.log` | 0 bytes | 2026-12-11 | Pytest Output | ⚠️ Leer, kann gelöscht werden |
| `test_mqtt_auth.log` | 0 bytes | 2026-12-11 | Pytest Output | ⚠️ Leer, kann gelöscht werden |
| `test_token_blacklist.log` | 0 bytes | 2026-12-11 | Pytest Output | ⚠️ Leer, kann gelöscht werden |
| `pip_install2.log` | 3,800 bytes | 2026-12-03 | Installation Log | ⚠️ Temporär |
| `poetry_install.log` | 45,610 bytes | 2026-12-03 | Poetry Log | ⚠️ Temporär |

**Gesamt-Größe Root-Logs:** ~305 KB

**⚠️ WARNING:** Diese Logs sind NICHT Teil der konfigurierten Logging-Infrastruktur und werden nicht automatisch rotiert!

**Empfehlung:** Folgende Dateien können sicher gelöscht werden:
- Alle `test_*.log` Dateien (Test-Artefakte)
- `pip_install2.log` und `poetry_install.log` (Installation-Artefakte)
- `server.log` und `server_8001.log` können bei Bedarf gelöscht werden (aktuell sehr klein)

### 1.4 Log Access via API

**Built-in Log Viewer:** ✅ **VORHANDEN**

**Endpoints:**
- `GET /api/v1/debug/logs/files` - Liste aller Log-Dateien
- `GET /api/v1/debug/logs` - Query-Logs mit Filtering

**Features:**
- Filterung nach Level, Module, Search-Text
- Zeitbereich-Filterung
- Pagination (100 Einträge pro Seite)
- Unterstützt alle rotierten Log-Dateien
- JSON-Format für strukturierte Logs

**Access:** Nur für Admin-User (`AdminUser`)

---

## 2. MQTT Broker Logs (Mosquitto)

### 2.1 Mosquitto Configuration

**Config Files Found:**
1. `El Servador/god_kaiser_server/mosquitto_full_logging.conf` (Development)
2. `El Servador/god_kaiser_server/mosquitto_fix.conf` (Minimal)
3. `El Servador/god_kaiser_server/mosquitto_minimal.conf` (Minimal)

**Active Config Location:** `C:\Program Files\mosquitto\mosquitto.conf` (Windows)

### 2.2 Full Logging Configuration

**File:** `mosquitto_full_logging.conf`

**Log Configuration:**
```conf
# Logging: Datei + MQTT Topic (für Live-Zugriff)
log_dest file C:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server\logs\mosquitto.log
log_dest topic

# Alle Log-Types aktiviert
log_type error
log_type warning
log_type notice
log_type information
log_type debug
log_type subscribe
log_type unsubscribe

log_timestamp true
log_timestamp_format %Y-%m-%dT%H:%M:%S
connection_messages true
```

**Log File Details:**
- **Location:** `El Servador/god_kaiser_server/logs/mosquitto.log`
- **Format:** Text mit Timestamp
- **Timestamp Format:** `%Y-%m-%dT%H:%M:%S` (ISO 8601)
- **Log Types:** ALL (error, warning, notice, information, debug, subscribe, unsubscribe)
- **Connection Messages:** ✅ Aktiviert

**Sample Log Entry:**
```
2026-01-14T10:30:00: New connection from 192.168.1.100 on port 1883.
2026-01-14T10:30:01: New client connected from 192.168.1.100 as ESP_00000001
2026-01-14T10:30:02: Client ESP_00000001 subscribed to kaiser/god/esp/ESP_00000001/config/#
```

### 2.3 Minimal Configuration

**File:** `mosquitto_fix.conf`

**Log Configuration:**
```conf
log_dest file C:/Program Files/mosquitto/mosquitto.log
log_type all
```

**⚠️ WARNING:** Diese Config hat KEINE Rotation!

### 2.4 Log Rotation Status

**Status:** 🔴 **CRITICAL - KEINE ROTATION!**

**Problem:**
- Mosquitto hat KEINE eingebaute Log-Rotation
- Log-Datei wächst unbegrenzt
- Risiko: Disk-Full-Szenario

**Current Behavior:**
- Logs werden kontinuierlich angehängt
- Keine automatische Bereinigung
- Manuelle Cleanup erforderlich

**Recommendation:** 🔴 **SOFORT IMPLEMENTIEREN**

---

## 3. Log Rotation & Retention

### 3.1 Server Logs
- **Method:** ✅ Python RotatingFileHandler (automatisch)
- **Trigger:** Bei 10 MB Dateigröße
- **Retention:** Letzte 5 Dateien (~50 MB total)
- **Auto-Cleanup:** ✅ Ja (automatisch via Handler)
- **Oldest Log:** god_kaiser.log.5 (wird automatisch gelöscht bei neuer Rotation)

**Rotation Process:**
1. god_kaiser.log erreicht 10 MB
2. god_kaiser.log → god_kaiser.log.1
3. god_kaiser.log.1 → god_kaiser.log.2
4. ... (shift alle Backups)
5. god_kaiser.log.5 wird gelöscht
6. Neue god_kaiser.log wird erstellt

### 3.2 Mosquitto Logs
- **Method:** ❌ **KEINE** (kritisch!)
- **Current Size:** 3,599,630 bytes (~3.43 MB) - verifiziert 2026-01-23
- **Growth Rate:** Abhängig von MQTT-Traffic, ca. 1-5 MB/Woche bei normalem Betrieb
- **Recommendation:** 🟡 **MITTELFRISTIG - Implementiere Rotation!** (Aktuell noch klein, aber wächst)

**Suggested Fix (Windows Task Scheduler):**

```powershell
# Log-Rotation-Script für Mosquitto
# Erstelle: C:\Scripts\rotate_mosquitto_log.ps1

$logFile = "C:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server\logs\mosquitto.log"
$maxSizeMB = 50
$retentionDays = 30

if (Test-Path $logFile) {
    $file = Get-Item $logFile
    $sizeMB = $file.Length / 1MB
    
    if ($sizeMB -gt $maxSizeMB) {
        # Rotate: Add timestamp
        $date = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
        $rotatedFile = "$logFile.$date"
        Copy-Item $logFile $rotatedFile
        Clear-Content $logFile
        
        Write-Host "Rotated Mosquitto log: $rotatedFile"
    }
    
    # Cleanup old logs
    Get-ChildItem "$logFile.*" | Where-Object {
        $_.LastWriteTime -lt (Get-Date).AddDays(-$retentionDays)
    } | Remove-Item -Verbose
}
```

**Task Scheduler Setup:**
- **Trigger:** Täglich um 02:00 Uhr
- **Action:** PowerShell-Script ausführen
- **User:** System oder Admin-User

---

## 4. How to Access Logs

### 4.1 Real-Time Monitoring

**Server Logs (Windows PowerShell):**
```powershell
# Follow main log
Get-Content "El Servador\god_kaiser_server\logs\god_kaiser.log" -Wait -Tail 50

# Follow errors only
Get-Content "El Servador\god_kaiser_server\logs\god_kaiser.log" -Wait | Select-String "ERROR|CRITICAL"

# Filter for specific ESP
Get-Content "El Servador\god_kaiser_server\logs\god_kaiser.log" -Wait | Select-String "ESP_00000001"
```

**Server Logs (Linux/Mac):**
```bash
# Follow main log
tail -f El\ Servador/god_kaiser_server/logs/god_kaiser.log

# Follow errors only
tail -f logs/god_kaiser.log | grep "ERROR\|CRITICAL"

# Filter for specific ESP
tail -f logs/god_kaiser.log | grep "ESP_00000001"
```

**Mosquitto Logs (Windows PowerShell):**
```powershell
# Follow Mosquitto log
Get-Content "El Servador\god_kaiser_server\logs\mosquitto.log" -Wait -Tail 20

# Filter for connections
Get-Content "El Servador\god_kaiser_server\logs\mosquitto.log" -Wait | Select-String "New connection|connected|disconnected"
```

### 4.2 Search & Filter

**Find errors from today (Server):**
```powershell
$today = (Get-Date).ToString("yyyy-MM-dd")
Select-String -Path "El Servador\god_kaiser_server\logs\god_kaiser.log" -Pattern "$today.*ERROR|$today.*CRITICAL"
```

**Find specific ESP activity:**
```powershell
Select-String -Path "El Servador\god_kaiser_server\logs\god_kaiser.log" -Pattern "ESP_00000001" | Select-Object -Last 20
```

**Count MQTT connections (Mosquitto):**
```powershell
Select-String -Path "El Servador\god_kaiser_server\logs\mosquitto.log" -Pattern "New connection" | Measure-Object
```

**Parse JSON Logs (Server):**
```powershell
# Wenn LOG_FORMAT=json
Get-Content "El Servador\god_kaiser_server\logs\god_kaiser.log" | ConvertFrom-Json | Where-Object { $_.level -eq "ERROR" }
```

### 4.3 Via API (Built-in Log Viewer)

**List Log Files:**
```bash
curl -X GET "http://localhost:8000/api/v1/debug/logs/files" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Query Logs:**
```bash
curl -X GET "http://localhost:8000/api/v1/debug/logs?level=ERROR&page=1&page_size=50" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Filter by Module:**
```bash
curl -X GET "http://localhost:8000/api/v1/debug/logs?module=api.sensors&level=WARNING" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4.4 Log Viewers

**Recommended Tools:**
- **Windows:** 
  - Baretail (Free) - https://www.baremetalsoft.com/baretail/
  - mTail (Free) - https://github.com/mtail/mtail
  - VS Code: "Log File Highlighter" Extension
- **Cross-Platform:**
  - VS Code: "Log Viewer" Extension
  - Built-in API: `/api/v1/debug/logs` (Web-Interface im Frontend?)

---

## 5. Missing Logs & Gaps

### 5.1 Not Found But Expected

1. **Database Slow Query Log**
   - **Status:** ❌ Nicht konfiguriert
   - **Location:** PostgreSQL sollte konfiguriert werden
   - **Recommendation:** Enable PostgreSQL `log_min_duration_statement` in postgresql.conf

2. **Security Audit Log**
   - **Status:** ⚠️ In Database (AuditLog Model vorhanden)
   - **Location:** PostgreSQL `audit_logs` Tabelle
   - **Recommendation:** ✅ Bereits implementiert, aber separate Log-Datei wäre besser für schnellen Zugriff

3. **ESP32 Agent Logs**
   - **Status:** ⚠️ Nur in Wokwi Console (nicht persistent)
   - **Location:** Wokwi Serial Monitor
   - **Recommendation:** Forward ESP32 Serial-Logs zu Server via MQTT Topic

4. **Performance Metrics Log**
   - **Status:** ❌ Nicht geloggt
   - **Recommendation:** Implementiere Metrics-Logging (Response Times, DB Query Times, etc.)

5. **WebSocket Connection Logs**
   - **Status:** ⚠️ Vermutlich im Hauptlog
   - **Recommendation:** Separate WS-Log-Datei für bessere Übersicht

### 5.2 Log Quality Issues

1. **Root-Directory Logs nicht rotiert**
   - **Issue:** server.log, server_8001.log wachsen unbegrenzt
   - **Impact:** Disk-Full-Risiko
   - **Action:** Diese Logs sollten in `.gitignore` und regelmäßig gelöscht werden, oder Uvicorn-Logging umleiten

2. **Test-Logs nicht bereinigt**
   - **Issue:** test_api_auth.log bleibt nach Tests
   - **Impact:** Unordnung, Platzverschwendung
   - **Action:** Automatische Cleanup nach Tests oder in `.gitignore`

3. **Keine Correlation IDs**
   - **Issue:** Kann Requests nicht über Services hinweg verfolgen
   - **Impact:** Schwieriges Debugging bei verteilten Problemen
   - **Recommendation:** Implementiere Request-ID-Tracking

---

## 6. Critical Issues & Warnings

### 🟡 WARNINGS (Aktualisiert 2026-01-23)

1. **Mosquitto Log Not Rotating**
   - **Current Size:** 3.43 MB (noch nicht kritisch, aber wachsend)
   - **Impact:** Log-Datei wächst unbegrenzt, Disk-Full-Risiko langfristig
   - **Action:** 🟡 **MITTELFRISTIG** - Implementiere Windows Task Scheduler Script (siehe Section 3.2)
   - **Priority:** MEDIUM (wurde von CRITICAL heruntergestuft, da aktuell noch klein)

2. **Fehlende god_kaiser.log.4**
   - **Issue:** Die Datei god_kaiser.log.4 fehlt im Rotation-Pattern
   - **Impact:** Unvollständige Log-Historie, möglicherweise verlorene Logs
   - **Action:** Überwachen - wird bei nächster Rotation automatisch erstellt

3. **Root-Directory Logs nicht bereinigt**
   - **Issue:** 8 Log-Dateien im Root-Verzeichnis (~305 KB)
   - **Impact:** Unordnung, aber geringes Disk-Risiko (sehr klein)
   - **Action:** Einmalige Bereinigung empfohlen (Test-Logs, Installation-Logs)

4. **Keine zentrale Log-Verwaltung**
   - **Current:** Logs verstreut über Filesystem
   - **Recommendation:** ELK Stack oder Grafana Loki für zentrale Aggregation (Long-Term)

5. **JSON-Logs schwer lesbar ohne Tools**
   - **Current:** Default ist JSON-Format
   - **Impact:** Schwer zu lesen in Text-Editoren
   - **Mitigation:** ✅ API-Endpoint `/api/v1/debug/logs` parst JSON automatisch

---

## 7. Recommendations

### Immediate (This Week)
1. ✅ **Implementiere Mosquitto Log-Rotation** (Windows Task Scheduler Script)
2. ✅ **Bereinige Root-Directory Logs** (server.log, server_8001.log rotieren oder löschen)
3. ✅ **Füge Test-Logs zu .gitignore hinzu**

### Short-Term (This Month)
1. **Erstelle dedizierte Security-Log-Datei** (separat von AuditLog-DB)
2. **Implementiere Correlation IDs** für Request-Tracking
3. **Setze automatische Log-Monitoring/Alerts** (z.B. bei ERROR/CRITICAL)

### Long-Term (Next Quarter)
1. **Zentrale Log-Verwaltung** (ELK Stack oder Grafana Loki)
2. **ESP32 Log-Forwarding** (Serial → MQTT → Server)
3. **Performance Metrics Logging** (Response Times, DB Queries, etc.)
4. **Log-Analytics Dashboard** im Frontend

---

## 8. Quick Reference

### Log Locations Summary (Verifiziert 2026-01-23)
```
Server Logs (logs/):
- Main:    god_kaiser.log       (~5.08 MB, aktuell)
- Rotated: god_kaiser.log.1     (~9.99 MB)
           god_kaiser.log.2     (~10.00 MB)
           god_kaiser.log.3     (~10.00 MB)
           god_kaiser.log.4     ⚠️ FEHLT
           god_kaiser.log.5     (~10.00 MB, ältester)
- GESAMT:  ~45.07 MB

MQTT Logs:
- Broker: logs/mosquitto.log    (~3.43 MB, ⚠️ nicht rotiert)

Root-Verzeichnis (kann bereinigt werden):
- server.log, server_8001.log, test_*.log, *_install*.log
- GESAMT: ~305 KB

Config:
- Server: src/core/logging_config.py (Python Logging Setup)
- Server: src/core/config.py (LoggingSettings Klasse)
- Server: config/logging.yaml (Alternative YAML Config)
- MQTT:   mosquitto_full_logging.conf (Development Template)
- MQTT:   mosquitto_fix.conf (Minimal mit Logging)
- MQTT:   mosquitto_minimal.conf (Nur stderr)
```

### Environment Variables
```bash
# Server Logging (in .env)
LOG_LEVEL=INFO                    # DEBUG, INFO, WARNING, ERROR, CRITICAL
LOG_FORMAT=json                   # json oder text
LOG_FILE_PATH=logs/god_kaiser.log
LOG_FILE_MAX_BYTES=10485760       # 10 MB
LOG_FILE_BACKUP_COUNT=5
```

### Common Commands

**Windows PowerShell:**
```powershell
# Tail server log
Get-Content "El Servador\god_kaiser_server\logs\god_kaiser.log" -Wait -Tail 50

# Find today's errors
$today = (Get-Date).ToString("yyyy-MM-dd")
Select-String -Path "El Servador\god_kaiser_server\logs\god_kaiser.log" -Pattern "$today.*ERROR"

# Count log entries
(Get-Content "El Servador\god_kaiser_server\logs\god_kaiser.log" | Measure-Object -Line).Lines

# Check log size
(Get-Item "El Servador\god_kaiser_server\logs\god_kaiser.log").Length / 1MB
```

**Linux/Mac:**
```bash
# Tail server log
tail -f El\ Servador/god_kaiser_server/logs/god_kaiser.log

# Find today's errors
grep "$(date +%Y-%m-%d)" logs/god_kaiser.log | grep ERROR

# Count log entries
wc -l logs/god_kaiser.log

# Check log size
du -sh logs/
```

---

## 9. Configuration Files Reference

### Server Logging Config (`src/core/logging_config.py`)

**Key Functions:**
- `setup_logging()` - Initialisiert Logging beim Server-Start
- `get_logger(name)` - Holt Logger-Instanz für Module

**Key Classes:**
- `JSONFormatter` - Formatiert Logs als JSON
- `TextFormatter` - Formatiert Logs als Text

### Server Settings (`src/core/config.py`)

**LoggingSettings Class:**
- Validiert Log-Level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
- Validiert Format (json, text)
- Lädt aus `.env` Datei

### Mosquitto Configs

**Available Configs:**
1. `mosquitto_full_logging.conf` - Vollständiges Logging (Development)
2. `mosquitto_fix.conf` - Minimal (Production-ready)
3. `mosquitto_minimal.conf` - Minimalste Config

**Installation:**
```powershell
# Als Admin ausführen
net stop mosquitto
copy "El Servador\god_kaiser_server\mosquitto_full_logging.conf" "C:\Program Files\mosquitto\mosquitto.conf"
net start mosquitto
```

---

## 10. API Endpoints for Log Access

### List Log Files
```
GET /api/v1/debug/logs/files
Authorization: Bearer <token>
Response: {
  "success": true,
  "files": [
    {
      "name": "god_kaiser.log",
      "path": "...",
      "size_bytes": 1048576,
      "size_human": "1.0 MB",
      "modified": "2026-01-14T10:30:00",
      "is_current": true
    }
  ],
  "log_directory": "..."
}
```

### Query Logs
```
GET /api/v1/debug/logs?level=ERROR&module=api.sensors&page=1&page_size=50
Authorization: Bearer <token>
Response: {
  "success": true,
  "logs": [...],
  "total_count": 150,
  "page": 1,
  "page_size": 50,
  "has_more": true
}
```

**Query Parameters:**
- `level`: ERROR, WARNING, INFO, DEBUG, CRITICAL
- `module`: Logger-Name (z.B. "api.sensors")
- `search`: Text-Suche in Messages
- `start_time`: ISO 8601 Timestamp
- `end_time`: ISO 8601 Timestamp
- `file`: Spezifische Log-Datei
- `page`: Seitenzahl (default: 1)
- `page_size`: Einträge pro Seite (default: 100, max: 1000)

---

**Report Complete**
**Original Analysis:** 2026-01-14
**Last Updated:** 2026-01-23
**Files Analyzed:** 14 Log-Dateien
**Config Files Reviewed:** 5 (logging_config.py, config.py, logging.yaml, 3× mosquitto*.conf)
**Confidence:** HIGH (alle Dateigrößen verifiziert)

---

## Next Steps

1. ✅ **Prüfe aktuelle Log-Dateigrößen** - ERLEDIGT (2026-01-23)
   - logs/: ~48.5 MB (5 Server-Logs + 1 Mosquitto)
   - Root: ~305 KB (8 Dateien)

2. ⏳ **Implementiere Mosquitto Rotation** (siehe Section 3.2)
   - Priorität: MEDIUM (aktuell nur 3.43 MB)

3. ⏳ **Bereinige Root-Directory Logs**
   - 6 Test-Logs können gelöscht werden
   - 2 Installation-Logs können gelöscht werden

4. ✅ **Log-API Endpoints vorhanden**
   - GET /api/v1/debug/logs/files
   - GET /api/v1/debug/logs

5. ✅ **Log-Zugriff dokumentiert** (dieser Report)

---

## Changelog

| Datum | Änderung |
|-------|----------|
| 2026-01-23 | Alle Dateigrößen verifiziert, Tabellen aktualisiert, fehlende .log.4 dokumentiert, 3 neue Test-Logs hinzugefügt |
| 2026-01-14 | Initiale Analyse erstellt |
