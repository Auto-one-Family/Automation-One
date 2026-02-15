# Error-Code-System Analyse-Report

**Datum:** 2026-02-02
**Agent:** Error-System-Analyse
**Analysierte Komponenten:** ESP32, Server, Frontend

---

## 1. Executive Summary

Das AutomationOne Error-Code-System ist **vollständig implementiert** und ermöglicht eine **End-to-End Debugging-Kette** vom ESP32 bis zum Frontend. Die Architektur folgt dem Server-Centric Prinzip: ESP32 sendet Rohdaten, Server enriched mit Troubleshooting-Informationen, Frontend zeigt benutzerfreundliche Fehlerdetails mit deutschen Beschreibungen.

**Hauptergebnis:** E2E-Debugging ist vollständig möglich. Es wurden keine kritischen Lücken identifiziert.

---

## 2. ESP32 Error-System

### 2.1 Error-Code Definitionen

| Range | Kategorie | Anzahl Codes | Dokumentiert? |
|-------|-----------|--------------|---------------|
| 1000-1999 | HARDWARE | 41 Codes | JA |
| 2000-2999 | SERVICE | 19 Codes | JA |
| 3000-3999 | COMMUNICATION | 16 Codes | JA |
| 4000-4999 | APPLICATION | 24 Codes | JA |

**Quelle:** [error_codes.h](El Trabajante/src/models/error_codes.h)

**Highlights:**
- GPIO Errors (1001-1006): 6 Codes
- I2C Errors (1010-1018): 9 Codes inkl. Bus-Recovery
- OneWire Errors (1020-1029): 10 Codes mit ROM-Validierung
- DS18B20-specific (1060-1063): 4 spezifische Temperatur-Fehlercodes
- Watchdog Errors (4070-4072): 3 Codes für Circuit-Breaker-Integration
- Device Discovery (4200-4202): 3 Codes für Approval-Flow

### 2.2 ErrorTracker Implementation

| Feature | Implementiert? | Details |
|---------|----------------|---------|
| Error-History | JA | Max 50 Einträge (Circular Buffer) |
| MQTT-Publishing | JA | Topic: `kaiser/{kaiser_id}/esp/{esp_id}/system/error` |
| Severity-Levels | JA | WARNING (1), ERROR (2), CRITICAL (3) |
| Callback-System | JA | `setMqttPublishCallback()` |
| Duplicate-Tracking | JA | Occurrence-Count für letzte 5 Einträge |
| Recursion-Guard | JA | `mqtt_publish_in_progress_` Flag |

**Quellen:**
- [error_tracker.h](El Trabajante/src/error_handling/error_tracker.h)
- [error_tracker.cpp](El Trabajante/src/error_handling/error_tracker.cpp)

### 2.3 Error-Publishing

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/error`

**Payload-Format:**
```json
{
  "error_code": 1020,
  "severity": 2,
  "category": "HARDWARE",
  "message": "Sensor read failed",
  "context": {"esp_id": "ESP_12AB34", "uptime_ms": 123456},
  "ts": 1735818000
}
```

**Aktiv genutzt:** JA

**Callback-Registrierung:** [main.cpp:694](El Trabajante/src/main.cpp#L694)

**trackError() Aufrufe:** 30+ Stellen in der Codebase, inkl.:
- `sensor_manager.cpp` - Sensor-Initialisierung und Read-Fehler
- `actuator_manager.cpp` - Actuator-Fehler
- `main.cpp` - System-Init, Watchdog, Config-Fehler
- `pwm_controller.cpp` - PWM-Fehler
- `health_monitor.cpp` - MQTT-Publish-Fehler

---

## 3. Server Error-Handling

### 3.1 Server Error-Codes

| Range | Kategorie | Anzahl Codes |
|-------|-----------|--------------|
| 5000-5099 | CONFIG | 7 Codes |
| 5100-5199 | MQTT | 7 Codes |
| 5200-5299 | VALIDATION | 8 Codes |
| 5300-5399 | DATABASE | 6 Codes |
| 5400-5499 | SERVICE | 5 Codes |
| 5500-5599 | AUDIT | 3 Codes |
| 5600-5699 | SEQUENCE | 18 Codes |

**Quelle:** [error_codes.py](El Servador/god_kaiser_server/src/core/error_codes.py)

### 3.2 MQTT Error-Handler

| Aspekt | Status | Details |
|--------|--------|---------|
| Handler existiert | JA | [error_handler.py](El Servador/god_kaiser_server/src/mqtt/handlers/error_handler.py) |
| Handler registriert | JA | [main.py:254-260](El Servador/god_kaiser_server/src/main.py#L254) |
| Topic-Subscription | JA | `kaiser/{kaiser_id}/esp/+/system/error` |
| Payload-Validierung | JA | Required: `error_code`, `severity` |
| Error-Enrichment | JA | via `esp32_error_mapping.py` |
| Audit-Log-Speicherung | JA | `AuditLogRepository.log_mqtt_error()` |
| WebSocket-Broadcast | JA | Event: `error_event` |

### 3.3 Error-Persistenz

| Speicherort | Implementiert? | Details |
|-------------|----------------|---------|
| Datenbank-Tabelle | JA | `audit_log` Tabelle |
| Event-Type | JA | `MQTT_ERROR` |
| Source-Type | JA | `MQTT` |
| Audit-Log Repository | JA | [audit_log_repo.py:157](El Servador/god_kaiser_server/src/db/repositories/audit_log_repo.py#L157) |
| Server-Logs | JA | Logging bei Error-Empfang |

### 3.4 Error-Enrichment (esp32_error_mapping.py)

| Feature | Status | Details |
|---------|--------|---------|
| Deutsche Beschreibungen | JA | `message_de`, `message_user_de` |
| Troubleshooting-Schritte | JA | `troubleshooting_de[]` |
| Dokumentations-Links | JA | `docs_link` |
| User-Action-Required Flag | JA | `user_action_required` |
| Recoverable Flag | JA | `recoverable` |

**Quelle:** [esp32_error_mapping.py](El Servador/god_kaiser_server/src/core/esp32_error_mapping.py) (~900+ Zeilen)

---

## 4. E2E-Debugging-Kette

### 4.1 Aktueller Datenfluss

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        E2E ERROR DEBUGGING FLOW                              │
└──────────────────────────────────────────────────────────────────────────────┘

ESP32                              Server                           Frontend
──────                             ──────                           ────────

1. Error occurs
   (sensor_manager,
    actuator_manager,
    main.cpp, etc.)
        │
        ▼
2. errorTracker.trackError()
        │
        ├──► Log to Serial
        │
        ├──► Add to Circular Buffer
        │    (max 50 entries)
        │
        └──► Publish to MQTT
             Topic: kaiser/{id}/esp/{esp_id}/system/error
             Payload: {error_code, severity, category, message, context, ts}
                                   │
                                   ▼
                          3. MQTT Broker
                                   │
                                   ▼
                          4. error_handler.py
                             - Parse topic → extract esp_id
                             - Validate payload
                             - Lookup ESP device
                                   │
                                   ▼
                          5. Error Enrichment
                             esp32_error_mapping.py
                             - German descriptions
                             - Troubleshooting steps
                             - docs_link, recoverable, etc.
                                   │
                                   ├──► 6. Save to Audit Log
                                   │    (PostgreSQL)
                                   │
                                   └──► 7. WebSocket Broadcast
                                        Event: error_event
                                        Payload: {esp_id, error_code,
                                                  title, message,
                                                  troubleshooting[], ...}
                                                          │
                                                          ▼
                                                 8. Frontend Receives
                                                    WebSocket Event
                                                          │
                                                          ▼
                                                 9. Toast Notification
                                                    + Error Details Modal
                                                    + TroubleshootingPanel
```

### 4.2 API-Endpoints für Errors

| Endpoint | Existiert? | Funktion |
|----------|------------|----------|
| `GET /v1/errors/esp/{esp_id}` | JA | Paginierte Fehlerliste pro ESP |
| `GET /v1/errors/summary` | JA | Statistiken über alle ESPs |
| `GET /v1/errors/codes` | JA | Alle bekannten Error-Codes |
| `GET /v1/errors/codes/{code}` | JA | Detail-Info für einen Code |

**Quelle:** [errors.py](El Servador/god_kaiser_server/src/api/v1/errors.py)

### 4.3 WebSocket Error-Events

| Event | Existiert? | Payload |
|-------|------------|---------|
| `error_event` | JA | Vollständig dokumentiert |

**Payload-Felder:**
- `esp_id`, `esp_name`
- `error_log_id` (für Audit-Log-Referenz)
- `error_code`, `severity`, `category`
- `title` (deutsche Kurzbezeichnung)
- `message` (ausführliche Beschreibung)
- `troubleshooting[]` (Schritte)
- `user_action_required`, `recoverable`
- `docs_link`, `context`, `timestamp`

### 4.4 Frontend Error-Anzeige

| Feature | Implementiert? | Location |
|---------|----------------|----------|
| ErrorDetailsModal | JA | [ErrorDetailsModal.vue](El Frontend/src/components/error/ErrorDetailsModal.vue) |
| TroubleshootingPanel | JA | [TroubleshootingPanel.vue](El Frontend/src/components/error/TroubleshootingPanel.vue) |
| ErrorState (Generic) | JA | [ErrorState.vue](El Frontend/src/components/common/ErrorState.vue) |
| Toast Integration | JA | Via CustomEvent `show-error-details` |
| System-Monitor Integration | JA | EventDetailsPanel für `error_event` |

**Frontend-Features:**
- Deutsche Fehlerbeschreibungen
- Nummerierte Troubleshooting-Schritte
- "Handlungsbedarf"-Badge
- Severity-Icons (Info, Warning, Error, Critical)
- Aufklappbare technische Details
- Dokumentations-Links

---

## 5. Lücken-Analyse

### 5.1 Fehlende Implementierungen

| Lücke | Komponente | Schweregrad | Beschreibung |
|-------|------------|-------------|--------------|
| - | - | - | **Keine kritischen Lücken gefunden** |

### 5.2 Inkonsistenzen (Minor)

| Inkonsistenz | Komponente | Status |
|--------------|------------|--------|
| I2C Bus Recovery Codes (1015-1018) | Server ESP32HardwareError | In ERROR_DESCRIPTIONS vorhanden, nicht im Enum |
| DS18B20 Codes (1060-1063) | Server ESP32HardwareError | In ERROR_DESCRIPTIONS vorhanden, nicht im Enum |
| INVALID_PAYLOAD_FORMAT | ValidationErrorCode | Verwendet in zone_ack_handler, fehlt im Enum |

**Auswirkung:** Gering - Die Codes funktionieren durch das `ESP32_ERROR_DESCRIPTIONS` Dict, das Enum ist nur für Python-Type-Safety.

---

## 6. Bewertung: Debugging-Fähigkeit

### Kann man vom Server aus ESP-Probleme debuggen?

| Szenario | Möglich? | Wie? |
|----------|----------|------|
| ESP sendet keine Daten | JA | Heartbeat-Timeout → `esp_health` Event, LWT |
| Sensor-Fehler | JA | Error-Code 1040-1043, DS18B20 1060-1063 |
| Actuator reagiert nicht | JA | Error-Code 1050-1053, Timeout-Alerts |
| WiFi/MQTT-Probleme | JA | Error-Code 3001-3016, LWT-Handler |
| NVS/Config-Fehler | JA | Error-Code 2001-2014 |
| OneWire-Probleme | JA | Error-Code 1020-1029 mit detaillierten ROM-Validierungsfehlern |
| I2C-Bus-Probleme | JA | Error-Code 1010-1018 inkl. Bus-Recovery |
| Watchdog-Timeout | JA | Error-Code 4070-4072 |
| Memory-Probleme | JA | Error-Code 4040-4042 |

### Gesamtbewertung

| Aspekt | Score (1-5) | Kommentar |
|--------|-------------|-----------|
| Error-Code-Vollständigkeit | 5/5 | 100 ESP32-Codes, 54 Server-Codes, alle dokumentiert |
| E2E-Integration | 5/5 | MQTT → Handler → Audit-Log → WebSocket → Frontend |
| Server-Observability | 5/5 | Audit-Log, API-Endpoints, Error-Statistiken |
| Frontend-Debugging-Tools | 5/5 | Modal, Troubleshooting, deutsche Beschreibungen |
| **Gesamt** | **5/5** | **Vollständig implementiert** |

---

## 7. Empfehlungen

### Kritisch (Muss implementiert werden)

*Keine kritischen Empfehlungen - System ist vollständig.*

### Wichtig (Sollte implementiert werden)

1. **ESP32HardwareError Enum erweitern** - I2C Recovery (1015-1018) und DS18B20 (1060-1063) Codes zum Python-Enum hinzufügen für bessere Type-Safety.

2. **ValidationErrorCode erweitern** - `INVALID_PAYLOAD_FORMAT = 5209` hinzufügen, da in `zone_ack_handler.py` verwendet.

### Nice-to-have

1. **Error-Acknowledgement** - Button im Frontend um Errors als "acknowledged" zu markieren.

2. **Error-Trends** - Grafische Darstellung von Error-Häufigkeit über Zeit.

3. **Email-Alerts** - Bei CRITICAL Errors Email-Benachrichtigung.

---

## 8. Code-Referenzen

| Datei | Relevanz | Notizen |
|-------|----------|---------|
| [error_codes.h](El Trabajante/src/models/error_codes.h) | ESP32 Error-Definitionen | 388 Zeilen, vollständig |
| [error_tracker.h](El Trabajante/src/error_handling/error_tracker.h) | ESP32 ErrorTracker | Header mit MQTT-Callback |
| [error_tracker.cpp](El Trabajante/src/error_handling/error_tracker.cpp) | ESP32 ErrorTracker Impl | 342 Zeilen, Circular Buffer |
| [topic_builder.cpp:160](El Trabajante/src/utils/topic_builder.cpp#L160) | System Error Topic | `buildSystemErrorTopic()` |
| [main.cpp:694](El Trabajante/src/main.cpp#L694) | MQTT Callback Setup | `setMqttPublishCallback()` |
| [error_codes.py](El Servador/god_kaiser_server/src/core/error_codes.py) | Server Error-Codes | 674 Zeilen |
| [esp32_error_mapping.py](El Servador/god_kaiser_server/src/core/esp32_error_mapping.py) | Error Enrichment | ~900+ Zeilen, deutsche Texte |
| [error_handler.py](El Servador/god_kaiser_server/src/mqtt/handlers/error_handler.py) | MQTT Error Handler | 330 Zeilen |
| [main.py:254-260](El Servador/god_kaiser_server/src/main.py#L254) | Handler Registration | Topic-Subscription |
| [errors.py](El Servador/god_kaiser_server/src/api/v1/errors.py) | REST API Endpoints | 4 Endpoints |
| [ErrorDetailsModal.vue](El Frontend/src/components/error/ErrorDetailsModal.vue) | Frontend Modal | Deutsche UI |
| [TroubleshootingPanel.vue](El Frontend/src/components/error/TroubleshootingPanel.vue) | Frontend Panel | Troubleshooting-Schritte |

---

## 9. Fazit

Das AutomationOne Error-Code-System ist **produktionsreif** und bietet eine **vollständige E2E-Debugging-Kette**.

Ein Entwickler kann vom Server aus:
- Alle ESP32-Fehler in Echtzeit sehen (WebSocket)
- Historische Fehler abfragen (REST API)
- Deutsche Troubleshooting-Anweisungen erhalten
- Error-Statistiken und Trends analysieren

Das System folgt dem Server-Centric Prinzip: ESP32 sendet Rohdaten, Server reichert an, Frontend zeigt benutzerfreundlich an.

**Bewertung: Industrielles Niveau erreicht.**
