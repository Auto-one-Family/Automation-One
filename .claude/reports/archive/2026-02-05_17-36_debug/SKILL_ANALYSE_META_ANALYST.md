# Skill-Analyse: meta-analyst

**Datum:** 2026-02-05 21:00 UTC
**Skill:** `meta-analyst`
**Fragen:** 17-18
**Status:** VOLLSTÄNDIG

---

## 17. Report-Format-Vergleich

### Verzeichnis

`.claude/reports/current/`

**Anzahl:** 22 Reports

### Einheitliches Format

| Section | Inhalt | Vorhanden in |
|---------|--------|--------------|
| **Header** | Agent, Datum, Kontext | ALLE Reports |
| **Executive Summary** | Kurze Problem-Übersicht | ALLE Reports |
| **Log-Analyse** | Raw-Logs mit Kontext | Debug-Reports |
| **Root-Cause** | Problem-Diagnose | Debug-Reports |
| **Code-Analyse** | Source Code mit Pfad:Zeile | Dev-Reports |
| **Recommendations** | Lösungsvorschlag | ALLE Reports |

### Header-Format (Standard)

```markdown
# [Report-Typ]: [Thema]

**Agent:** [agent-name]
**Datum:** [YYYY-MM-DD HH:MM UTC]
**ESP32:** [ESP-ID] (falls relevant)
**Status:** [Status]
```

### Executive Summary Format

```markdown
## Executive Summary

| Aspekt | Status | Detail |
|--------|--------|--------|
| [Aspekt 1] | [OK/WARNUNG/FEHLER] | [Kurzbeschreibung] |
| [Aspekt 2] | [OK/WARNUNG/FEHLER] | [Kurzbeschreibung] |
```

### Severity-Schema (konsistent)

| Level | Symbol | Anwendung | Beispiele |
|-------|--------|-----------|-----------|
| **KRITISCH** | `[K1]`, `[K2]` | System-Crash, Data-Loss | Watchdog-Timeout, DB-Corruption |
| **WARNUNG** | `[W1]`, `[W2]` | Degraded Service | Circuit-Breaker-Open, Retry-Exhausted |
| **INFO** | `[I1]`, `[I2]` | Status, Configuration | Config-Loaded, Connection-Established |

### Report-Typen

| Typ | Prefix | Agent | Inhalt |
|-----|--------|-------|--------|
| Debug | `ESP32_DEBUG_` | esp32-debug | Serial-Log-Analyse |
| Debug | `SERVER_DEBUG_` | server-debug | Server-Log-Analyse |
| Debug | `MQTT_DEBUG_` | mqtt-debug | MQTT-Traffic-Analyse |
| Dev | `ESP32_DEV_` | esp32-dev | Code-Implementierung |
| Dev | `SERVER_DEV_` | server-dev | Code-Implementierung |
| Session | `SESSION_BRIEFING` | system-manager | Session-Status |
| Consolidated | `CONSOLIDATED_REPORT` | collect-reports | Alle Reports zusammen |

### Beispiel-Report-Struktur

```markdown
# ESP32 Debug Report: SHT31 Config Verification

**Agent:** esp32-debug
**Datum:** 2026-02-05 19:16 UTC
**ESP32:** ESP_472204
**Status:** APPROVED (operational)

## 1. Executive Summary

| Aspekt | Status | Detail |
|--------|--------|--------|
| Erster Config | FAILED | Error 1002 GPIO_CONFLICT |
| Zweiter Config | FAILED | Error 1002 GPIO_CONFLICT |
| SHT31-Sensor | NEIN | 0 Sensoren in NVS |

## 2. Serial-Log Analyse

### 2.1 Boot-Sequenz
```
18:49:22.084 > [INFO] Subscribed to: kaiser/.../config
```

## 3. Root-Cause Analyse

[K1] GPIO-Konflikt: GPIO 21 bereits von anderem Service belegt

## 4. Code-Analyse

```cpp
// El Trabajante/src/services/sensor/sensor_manager.cpp:123
if (is_i2c_sensor) {
    // Check 1: I2C bus must be initialized
```

## 5. Recommendations

1. GPIO-Belegung prüfen
2. I2C-Bus initialisieren vor Sensor-Config
```

---

## 18. Cross-Layer Trace

### ESP32 → Server Korrelation

| ESP32 Error | MQTT Topic | Server Processing | Frontend Status |
|-------------|------------|-------------------|-----------------|
| 1002 (GPIO conflict) | `system/error` | error_handler.py | "config_failed" |
| 1007 (I2C timeout) | sensor/data missing | Timeout-Logic | "last_read: null" |
| 3011 (MQTT connect) | LWT | lwt_handler.py | "offline" |
| 4070 (Watchdog) | ERROR heartbeat | heartbeat_handler.py | "critical" |

### Fehler-Propagation

```
ESP32 Error
    ↓
MQTT Publish (system/error oder config_response)
    ↓
Server Handler (error_handler.py, config_handler.py)
    ↓
Database Update (sensor.config_status, device.status)
    ↓
WebSocket Broadcast
    ↓
Frontend State Update
```

### Trace-ID Implementierung

#### HTTP Request-ID

| Aspekt | Detail |
|--------|--------|
| Generiert | RequestIdMiddleware |
| Format | UUID4 |
| Header | `X-Request-ID` |
| Logging | JSON field `request_id` |
| Verfügbar | Alle HTTP-Handlers |

#### MQTT Message Correlation

| Aspekt | Detail |
|--------|--------|
| Explizite Trace-ID | **NICHT VORHANDEN** |
| Implizite Korrelation | `esp_id` + `gpio` + `timestamp` |
| Topic-Parsing | `TopicBuilder::parse_*_topic()` |
| Time-Window | ±5 Sekunden für Matching |

### Cross-Layer Flow-Beispiel

```
1. Frontend User:
   POST /api/v1/sensors/{esp_id}/21
   Header: X-Request-ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

2. Server API Layer:
   RequestIdMiddleware sets request_id in context
   Logger logs with request_id: "Creating sensor on GPIO 21"

3. Service Layer:
   SensorService.create() → SensorRepository.create()
   Logger logs: "Sensor created, publishing config"
   Publishes config via MQTT

4. MQTT Publisher:
   Topic: kaiser/god/esp/ESP_472204/config
   Payload: { "sensors": [{"gpio": 21, "type": "SHT31", ...}] }
   ⚠️ KEINE request_id im Payload

5. ESP32 receives config:
   handleSensorConfig() → SensorManager.configureSensor()
   GPIO 21 conflict detected (bereits belegt)
   Publishes error via: kaiser/god/esp/ESP_472204/config_response
   Payload: { "status": "error", "failures": [{"gpio": 21, "error_code": 1002}] }

6. Server ConfigHandler:
   Receives config_response
   ⚠️ KEINE request_id - muss via esp_id + gpio korrelieren
   Logs: "Config FAILED on ESP_472204: sensor GPIO 21 - GPIO_CONFLICT"
   Updates: SensorRepository → config_status = "FAILED"
   Creates: AuditLogRepository entry

7. WebSocket Broadcast:
   Server broadcasts device state update
   Frontend receives: { "esp_id": "ESP_472204", "sensors": [...] }

8. Frontend State:
   Displays: "Sensor GPIO 21: Configuration Failed (GPIO Conflict)"
```

### Korrelations-Lücke

**Problem:** MQTT Messages haben keine Request-ID aus ursprünglicher API-Request

**Auswirkung:**
- Schwieriges Debugging bei Config-Fehlern
- Kein direkter Link zwischen API-Request und MQTT-Response
- Zeitbasierte Korrelation fehleranfällig

**Workaround:**
- Implizite Korrelation via `esp_id` + `gpio` + `timestamp`
- Audit-Log mit `admin_id` + `timestamp`
- Log-Suche mit Zeitfenster

**Future Enhancement:**
- `trace_id` in Config-Payload aufnehmen
- ESP32 gibt `trace_id` in Response zurück
- End-to-End Tracing möglich

---

## Meta-Analyst Workflow

### Input-Quellen

| Quelle | Dateien | Inhalt |
|--------|---------|--------|
| ESP32 Debug | `ESP32_DEBUG_*.md` | Serial-Log-Analyse |
| Server Debug | `SERVER_DEBUG_*.md` | Server-Log-Analyse |
| MQTT Debug | `MQTT_DEBUG_*.md` | Traffic-Analyse |
| Session Briefing | `SESSION_BRIEFING.md` | System-Status |

### Analyse-Schritte

```
1. Reports sammeln
   └─ Alle .md in .claude/reports/current/

2. Zeitliche Ordnung
   └─ Nach Datum sortieren
   └─ Zeitliche Abfolge verstehen

3. Cross-Layer Matching
   └─ ESP32-Fehler → Server-Logs
   └─ Server-Logs → Frontend-Status
   └─ MQTT-Traffic → Handler-Verarbeitung

4. Widersprüche identifizieren
   └─ Report A sagt X, Report B sagt Y
   └─ Zeitliche Inkonsistenzen
   └─ Fehlende Korrelationen

5. Problemketten dokumentieren
   └─ Ursache → Wirkung → Wirkung
   └─ Root-Cause identifizieren
   └─ Domino-Effekte aufzeigen

6. Meta-Report erstellen
   └─ KEINE Lösungen vorschlagen
   └─ NUR Probleme präzise dokumentieren
   └─ Quellen zitieren
```

### Output-Format

```markdown
# Meta-Analyse Report

**Datum:** [YYYY-MM-DD HH:MM UTC]
**Analysierte Reports:** [Anzahl]
**Zeitraum:** [Start] - [Ende]

## 1. Zeitliche Sequenz

| Zeit | Report | Event |
|------|--------|-------|
| 19:00 | ESP32_DEBUG | Boot gestartet |
| 19:01 | SERVER_DEBUG | Config gesendet |
| 19:02 | ESP32_DEBUG | Config-Fehler 1002 |

## 2. Widersprüche

### Widerspruch 1: [Titel]
- **Report A:** [Aussage]
- **Report B:** [Aussage]
- **Quelle A:** [Datei:Zeile]
- **Quelle B:** [Datei:Zeile]

## 3. Problemketten

### Kette 1: [Titel]
```
[Ursache] (Report: X)
    ↓
[Wirkung 1] (Report: Y)
    ↓
[Wirkung 2] (Report: Z)
```

## 4. Offene Fragen

1. [Frage ohne Antwort in Reports]
2. [Frage ohne Antwort in Reports]
```

---

## Kritische Dateien für meta-analyst

| Datei | Zweck |
|-------|-------|
| `.claude/reports/current/*.md` | Alle Reports |
| `.claude/reference/errors/ERROR_CODES.md` | Error-Code Reference |
| `.claude/reference/api/MQTT_TOPICS.md` | Topic Reference |
| `.claude/agents/meta-analyst/meta-analyst.md` | Agent Definition |

---

## Findings für Skill-Erstellung

### Stärken des Report-Systems

| Aspekt | Detail |
|--------|--------|
| Einheitliches Format | Alle Reports folgen gleichem Schema |
| Severity-Schema | Konsistent: KRITISCH/WARNUNG/INFO |
| Code-Referenzen | Pfad:Zeile für alle Code-Snippets |
| Zeitstempel | UTC für alle Reports |

### Lücken

| Problem | Empfehlung |
|---------|------------|
| Keine explizite Trace-ID in MQTT | `trace_id` in Payload aufnehmen |
| Implizite Korrelation fehleranfällig | Zeitfenster dokumentieren |
| Report-Deduplizierung fehlt | Ähnliche Reports zusammenfassen |
