# Error-Code-System — Cross-Layer Konsistenz-Audit

> **Datum:** 2026-03-01 (Update)
> **Scope:** ESP32 (1000-4999), Server (5000-5699), Frontend, MQTT-Protokoll, DB-Persistierung
> **Referenz:** `.claude/reference/errors/ERROR_CODES.md` (Version 1.1)
> **Methode:** Automatisierte Codebase-Analyse aller 3 Schichten + MQTT-Protokoll + DB-Layer
> **Status:** Offen zur Verifikation durch Robin

---

## Gesamtbewertung: 7.5/10 (vorher 6/10)

**Architektur: Sehr gut** — Zentrales Error-Code-System mit klaren Ranges, synchronen Definitionen zwischen ESP32 und Server, server-zentrischem Design, vollstaendiger MQTT-Error-Pipeline mit Enrichment.

**Implementierung: Verbessert** — Kritischer Bug (INVALID_PAYLOAD_FORMAT) gefixt, MQTT-Protokoll-Doku aktualisiert, Error-Enrichment-System (esp32_error_mapping.py) mit 97 von 108 Codes. Verbleibende Luecken: REST-API umgeht System, 11 Codes ohne Enrichment, Exception-System parallel.

### Was seit letztem Audit gefixt wurde

| # | Fix | Status | Verifiziert |
|---|-----|--------|-------------|
| 1 | `INVALID_PAYLOAD_FORMAT = 5209` im `ValidationErrorCode` Enum | GEFIXT | [ ] |
| 2 | `5209: "Invalid payload format"` in `SERVER_ERROR_DESCRIPTIONS` | GEFIXT | [ ] |
| 3 | MQTT-Protokoll-Doku Sektion 15 (Mqtt_Protocoll.md:1159-1201) | GEFIXT | [ ] |
| 4 | I2C Bus Recovery (1015-1018) in Python-Mirror (error_codes.py) | GEFIXT | [ ] |
| 5 | DS18B20 (1060-1063) in Python-Mirror (error_codes.py) | GEFIXT | [ ] |
| 6 | I2C Protocol-Layer (1007, 1009, 1019) in Python-Mirror | GEFIXT | [ ] |

---

## TEIL A: Komplettes Error-Traceback-System

> Vollstaendige Dokumentation des Error-Flows von ESP32 ueber Server und DB bis Frontend.
> Alle Stellen wo Fehler entstehen, transportiert, gespeichert und angezeigt werden.

### A1. ESP32 Error-Erzeugung (El Trabajante)

#### Quelldateien

| Datei | Zweck |
|-------|-------|
| `src/models/error_codes.h` | #define Codes (1000-4999) + Descriptions + ConfigErrorCode Enum |
| `src/error_handling/error_tracker.h` | ErrorTracker Klasse, ErrorEntry, ErrorCategory, ErrorSeverity |
| `src/error_handling/error_tracker.cpp` | Circular Buffer, MQTT Publishing, Rate Limiting |
| `src/error_handling/circuit_breaker.h/cpp` | Circuit Breaker Pattern (CLOSED/OPEN/HALF_OPEN) |
| `src/error_handling/health_monitor.h/cpp` | Health Snapshot, Diagnostics |

#### ErrorTracker API

```cpp
// Primaere API - wird von allen Managern aufgerufen
void trackError(uint16_t error_code, ErrorSeverity severity, const char* message);
void trackError(uint16_t error_code, const char* message);  // Default: ERROR_SEVERITY_ERROR

// Convenience-Methoden
void logHardwareError(uint16_t code, const char* msg);       // HARDWARE
void logServiceError(uint16_t code, const char* msg);        // SERVICE
void logCommunicationError(uint16_t code, const char* msg);  // COMMUNICATION
void logApplicationError(uint16_t code, const char* msg);    // APPLICATION
```

#### trackError() Ablauf (3 Schritte)

```
1. logErrorToLogger()     → Lokales Serial/Logger-Logging
2. addToBuffer()          → Circular Buffer (max 50 Eintraege, Duplicate Detection letzte 5)
3. publishErrorToMqtt()   → MQTT Publish mit Guards und Rate Limiting
```

#### Rate Limiting (F8 - MQTT Flood Prevention)

| Parameter | Wert |
|-----------|------|
| Throttle-Window | 60 Sekunden |
| Slots | 32 (Modulo-Hash-Tabelle) |
| Max Publishes | 1 pro Error-Code pro 60s |
| Suppressed-Count | Wird beim naechsten Publish geloggt |
| Implementierung | `shouldPublishError()` in error_tracker.cpp:24-43 |

#### Recursion Guard

```cpp
// Verhindert Endlosschleife wenn MQTT-Publish selbst einen Fehler ausloest
if (!mqtt_publishing_enabled_ || mqtt_publish_in_progress_) return;
mqtt_publish_in_progress_ = true;
// ... publish ...
mqtt_publish_in_progress_ = false;
```

#### ErrorSeverity Enum

| Wert | Name | Bedeutung |
|------|------|-----------|
| 1 | WARNING | Recoverable, System laeuft weiter |
| 2 | ERROR | Fehler, aber System funktional |
| 3 | CRITICAL | System instabil, Safe-Mode/Reboot |

**Hinweis:** Severity 0 (INFO) ist im Enum NICHT definiert, aber der Server akzeptiert 0-3.

#### ErrorEntry Struktur (Circular Buffer)

```cpp
struct ErrorEntry {
  unsigned long timestamp;     // millis() when logged
  uint16_t error_code;        // 1000-4999
  ErrorSeverity severity;     // 1-3
  char message[128];          // Fixed buffer, max 127 chars
  uint8_t occurrence_count;   // Duplicate tracking
};
```

#### Dateien die trackError() aufrufen

| Datei | Ungefaehre Aufrufe | Kontext |
|-------|-------------------|---------|
| `sensor_manager.cpp` | ~23 | Sensor-Init, OneWire, DS18B20, I2C |
| `i2c_bus.cpp` | ~28 | I2C Init, Bus Stuck, Recovery, CRC |
| `onewire_bus.cpp` | ~8 | OneWire Bus Init, Device Detection |
| `main.cpp` | ~10 | System Init, Watchdog, Config |
| `actuator_manager.cpp` | ~7 | Actuator Init, GPIO Conflict |
| `pump_actuator.cpp` | ? | Pump-spezifische Fehler |
| `pwm_actuator.cpp` | ? | PWM-spezifische Fehler |
| `valve_actuator.cpp` | ? | Ventil-spezifische Fehler |
| `safety_controller.cpp` | ? | Safety-Checks, Subzone Safe-Mode |
| `provision_manager.cpp` | ~4 | Provisioning, WiFi |
| `config_manager.cpp` | ~4 | Config Validation |
| `pwm_controller.cpp` | ? | PWM Controller |
| `pi_enhanced_processor.cpp` | ? | HTTP Client Init |
| `health_monitor.cpp` | ? | Health Snapshot |

**Status: [ ] Exakte Zeilennummern/Aufruf-Counts muessen verifiziert werden**

---

### A2. MQTT-Transport (ESP32 → Server)

#### Topic

```
kaiser/{kaiser_id}/esp/{esp_id}/system/error
```

| Aspekt | Wert |
|--------|------|
| QoS | 1 |
| Retain | false |
| TopicBuilder | `topic_builder.cpp:195-200` → `buildSystemErrorTopic()` |
| Server Subscription | `main.py:248-250` → `kaiser/+/esp/+/system/error` |
| Server Parser | `topics.py` → `parse_system_error_topic()` |

#### MQTT Payload (ESP32 → Server)

```json
{
  "error_code": 1002,
  "severity": 2,
  "category": "HARDWARE",
  "message": "GPIO 5 already in use",
  "context": {
    "esp_id": "ESP_12AB34CD",
    "uptime_ms": 123456
  },
  "ts": 1735818000
}
```

| Feld | Typ | Quelle ESP32 | Erwartung Server |
|------|-----|-------------|-----------------|
| `error_code` | int | `uint16_t error_code` | `int` - Pflichtfeld |
| `severity` | int (0-3) | `ErrorSeverity` enum (1-3) | `int` 0-3 - Pflichtfeld |
| `category` | String | `getCategoryString()` | String - optional |
| `message` | String | Parameter (escaped) | String - optional |
| `context.esp_id` | String | `mqtt_esp_id_` | Object - optional |
| `context.uptime_ms` | unsigned long | `millis()` | in context Object |
| `ts` | unsigned long | `timeManager.getUnixTimestamp()` | optional (0 = NTP nicht synced) |

**Konsistenz-Status: OK** — Impl ↔ Server stimmt ueberein.
**Doku-Status: OK** — Mqtt_Protocoll.md Sektion 15 ist aktuell (seit Fix).

---

### A3. Server Error-Empfang (El Servador)

#### MQTT Error Handler

**Datei:** `god_kaiser_server/src/mqtt/handlers/error_handler.py`
**Funktion:** `handle_error_event(topic, payload)`
**Registrierung:** `main.py:248-250`

#### Handler-Flow (8 Schritte)

```
1. Parse Topic              → TopicBuilder.parse_system_error_topic(topic) → esp_id
2. Validate Payload         → _validate_error_payload() mit Error-Codes:
                               5205 (MISSING_REQUIRED_FIELD) - error_code/severity fehlt
                               5206 (FIELD_TYPE_MISMATCH) - error_code nicht int
                               5207 (VALUE_OUT_OF_RANGE) - severity ausserhalb 0-3
3. Lookup ESP               → ESPRepository.get_by_device_id()
                               5001 (ESP_DEVICE_NOT_FOUND) falls nicht vorhanden
4. Enrich Error             → get_error_info(error_code_int) aus esp32_error_mapping.py
5. Map Severity             → ESP 0-3 → Server "info/warning/error/critical"
6. Save to AuditLog         → audit_repo.log_mqtt_error()
7. Update Prometheus         → increment_esp_error(esp_id)
8. WebSocket Broadcast      → ws_manager.broadcast("error_event", {...})
```

#### Error Enrichment System

**Datei:** `god_kaiser_server/src/core/esp32_error_mapping.py`
**Funktion:** `get_error_info(error_code: int, language: str = "de") -> Optional[Dict]`

Liefert pro Error-Code:
- `category`: HARDWARE/SERVICE/COMMUNICATION/APPLICATION
- `severity`: ERROR/WARNING/CRITICAL
- `message_de`: Deutsche Benutzer-Nachricht
- `message_user_de`: Vereinfachte User-Message
- `troubleshooting_de`: Liste mit Behebungsschritten
- `docs_link`: Link zur Dokumentation
- `recoverable`: Boolean
- `user_action_required`: Boolean

**Coverage:** 97 von 108 ESP32-Codes gemappt. **11 Codes fehlen** (siehe Befund B3).

**Fallback bei unbekanntem Code:** `get_error_info()` gibt `None` zurueck → Handler nutzt generische Nachricht.

---

### A4. Datenbank-Persistierung

#### AuditLog Model

**Datei:** `god_kaiser_server/src/db/models/audit_log.py`
**Tabelle:** `audit_logs`

| Feld | Typ | Wert bei Error-Events |
|------|-----|----------------------|
| `event_type` | Enum | `AuditEventType.MQTT_ERROR` ("mqtt_error") |
| `severity` | Enum | Gemappt von ESP (0-3 → info/warning/error/critical) |
| `source_type` | Enum | `AuditSourceType.MQTT` ("mqtt") |
| `source_id` | String | ESP ID |
| `status` | String | "failed" |
| `message` | String | Enriched error description |
| `error_code` | **String** | `str(error_code_int)` z.B. "1023" |
| `error_description` | String | Human-readable description |
| `details` | JSON | Vollstaendiges Enrichment-Objekt (siehe unten) |
| `request_id` | UUID | Auto-injected aus RequestIdMiddleware |
| `created_at` | Timestamp | Indexed |

**Details-JSON Inhalt:**
```json
{
  "error_code": 1023,
  "category": "HARDWARE",
  "context": {"gpio": 4, "sensor_type": "ds18b20"},
  "troubleshooting": ["1. Kabelpruefung...", "2. ..."],
  "docs_link": "/docs/hardware/esp32#onewire",
  "user_action_required": true,
  "recoverable": true,
  "esp_raw_message": "Original ESP message",
  "esp_severity": 2,
  "esp_timestamp": 1735818000
}
```

**Indizes:**
- `ix_audit_logs_created_at` — Time-Range-Queries
- `ix_audit_logs_severity_created_at` — Severity-Filtering
- `ix_audit_logs_source_created_at` — ESP-spezifische Abfragen
- Index auf `error_code` Feld

**Status: [ ] Typ-Diskrepanz pruefen: error_code als String in DB, als int im Details-JSON**

---

### A5. WebSocket Broadcast (Server → Frontend)

#### Event-Typ: `error_event`

**Gesendet von:** `error_handler.py:200-222` via `ws_manager.broadcast()`

**Payload an Frontend:**
```json
{
  "esp_id": "ESP_12AB34",
  "esp_name": "Gewaechshaus-Sensor",
  "error_log_id": "uuid-...",
  "error_code": 1023,
  "severity": "error",
  "category": "HARDWARE",
  "title": "OneWire ROM-Code ungueltig",
  "message": "Der ROM-Code des Sensors hat ein ungueltiges Format",
  "troubleshooting": ["1. Kabel pruefen", "2. ..."],
  "user_action_required": true,
  "recoverable": true,
  "docs_link": "/docs/hardware/esp32#onewire",
  "context": {"gpio": 4},
  "timestamp": 1735818000
}
```

**Fehlertoleranz:** WebSocket-Fehler werden geloggt, aber nicht re-thrown (try/except um Broadcast).

---

### A6. Frontend Error-Anzeige (El Frontend)

#### WebSocket-Empfang

| Datei | Funktion |
|-------|----------|
| `src/services/websocket.ts` | `handleMessage()` → `routeMessage()` → Subscriber |
| `src/shared/stores/notification.store.ts` | `handleErrorEvent()` (Zeile 44-104) |

#### Notification Flow

```
1. WebSocket "error_event" empfangen
2. notification.store.handleErrorEvent() extrahiert:
   - esp_id, severity, title, message, error_code, troubleshooting
3. Toast-Notification anzeigen (severity-basiertes Styling)
4. Custom Event 'show-error-details' dispatchen
5. ErrorDetailsModal oeffnet sich bei Klick auf "Details"
```

#### Frontend Error-Dateien

| Datei | Zweck |
|-------|-------|
| `src/api/errors.ts` | `translateErrorCode()` API (Cache + REST-Call) |
| `src/utils/errorCodeTranslator.ts` | `detectCategory()` Range-basiert, UI Helpers |
| `src/components/error/ErrorDetailsModal.vue` | Modal mit Troubleshooting-Steps |
| `src/composables/useToast.ts` | Toast-System (Singleton, Dedup, Max 20) |
| `src/shared/design/patterns/ToastContainer.vue` | Toast-Rendering mit Animations |
| `src/types/websocket-events.ts` | `ErrorEvent` Interface (Zeile 137-161) |

#### Category Detection (Range-basiert, lokal)

```typescript
// src/utils/errorCodeTranslator.ts:43-55
1000-1999: "hardware"
2000-2999: "service"
3000-3999: "communication"
4000-4999: "application"
5000-5999: "server"
```

**Architektur-Note:** Frontend interpretiert Error-Codes NICHT lokal (korrekt server-zentrisch). Alle Enrichment-Daten (Titel, Message, Troubleshooting) kommen via WebSocket vom Server.

---

### A7. REST-API Error-Endpunkte

**Datei:** `god_kaiser_server/src/api/v1/errors.py`

| Endpoint | Method | Funktion |
|----------|--------|----------|
| `/v1/errors/esp/{esp_id}` | GET | Error-Events fuer spezifischen ESP (paginiert) |
| `/v1/errors/summary` | GET | Fehlerstatistiken ueber alle ESPs |
| `/v1/errors/codes` | GET | Alle bekannten Error-Codes mit Beschreibungen |
| `/v1/errors/codes/{error_code}` | GET | Details zu spezifischem Error-Code |

---

### A8. Komplettes Sequenzdiagramm

```
ESP32 Firmware                MQTT Broker              God-Kaiser Server              PostgreSQL           Frontend
      |                           |                           |                           |                   |
      | trackError(1002, ERROR,   |                           |                           |                   |
      |   "GPIO 5 in use")        |                           |                           |                   |
      |                           |                           |                           |                   |
      |-- logErrorToLogger() --|  |                           |                           |                   |
      |-- addToBuffer()  ------|  |                           |                           |                   |
      |-- shouldPublishError() |  |                           |                           |                   |
      |   (Rate Limit OK?)     |  |                           |                           |                   |
      |                        |  |                           |                           |                   |
      |--- MQTT Publish --------->|                           |                           |                   |
      | Topic: kaiser/.../error|  |                           |                           |                   |
      | QoS: 1                 |  |                           |                           |                   |
      |                        |  |--- Deliver to subscriber->|                           |                   |
      |                        |  |                           |                           |                   |
      |                        |  |                           |-- parse_topic() ---------|                   |
      |                        |  |                           |-- _validate_payload() ---|                   |
      |                        |  |                           |-- get_by_device_id() ----|                   |
      |                        |  |                           |-- get_error_info() ------|                   |
      |                        |  |                           |   (Enrichment)           |                   |
      |                        |  |                           |                          |                   |
      |                        |  |                           |-- audit_repo.log() ------>| INSERT audit_logs |
      |                        |  |                           |                          |                   |
      |                        |  |                           |-- prometheus.inc() ------|                   |
      |                        |  |                           |                          |                   |
      |                        |  |                           |-- ws.broadcast() --------|----------------->|
      |                        |  |                           |   "error_event"          |                   |
      |                        |  |                           |                          |     handleErrorEvent()
      |                        |  |                           |                          |     → Toast + Modal
```

---

## TEIL B: Aktuelle Befunde (Offen zur Verifikation)

### B1. REST-API-Schicht umgeht Error-Code-System

**Schweregrad:** Strukturelle Luecke
**Status:** OFFEN
**Umfang:** 185 `raise HTTPException`-Aufrufe in 14 API-Dateien

| API-Datei | HTTPException-Aufrufe |
|-----------|-----------------------|
| `api/v1/debug.py` | 58 |
| `api/v1/sensors.py` | 29 |
| `api/v1/actuators.py` | 15 |
| `api/v1/esp.py` | 14 |
| `api/v1/auth.py` | 13 |
| `api/v1/audit.py` | 13 |
| `api/v1/users.py` | 9 |
| `api/v1/sequences.py` | 8 |
| `api/v1/subzone.py` | 7 |
| `api/v1/logic.py` | 7 |
| `api/v1/sensor_type_defaults.py` | 4 |
| `api/v1/zone.py` | 3 |
| `api/v1/dashboards.py` | 3 |
| `api/v1/errors.py` | 2 |
| **TOTAL** | **185** |

**Impact:** Frontend erhaelt bei REST-Fehlern nur generische HTTP-Status + Text, keine strukturierten Error-Codes (5001-5699).

**Beispiel (sensors.py):**
```python
raise HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail=f"ESP device '{esp_id}' not found",  # Kein error_code 5001
)
```

**Status: [ ] Verifizieren ob das wirklich ein Problem ist oder ob GodKaiserException ausreicht**

---

### B2. Paralleles Exception-System ohne numerische Error-Codes

**Schweregrad:** Architektur-Inkonsistenz
**Status:** OFFEN

Es existieren ZWEI parallele Error-Systeme auf dem Server:

**System 1: Numerische Error-Codes (5000-5699)** — Definiert in `error_codes.py`
- Verwendet in MQTT-Handlern (error_handler, sensor_handler, zone_ack_handler, etc.)
- Integer-basiert, synchron mit ESP32
- Geloggt als `[5205] Failed to parse...`

**System 2: String-basierte GodKaiserException** — Definiert in `exceptions.py`
- Verwendet in REST-API-Schicht
- String error_codes: "NOT_FOUND", "SENSOR_NOT_FOUND", "DUPLICATE_RECORD", etc.
- Hat eigenen `automation_one_exception_handler` (registriert in main.py:751)
- Antwortet mit `{"error": {"code": "NOT_FOUND", "message": "..."}}`

**Exception-Hierarchie (exceptions.py):**

| Exception | String-Code | Numerischer Code? |
|-----------|------------|-------------------|
| `GodKaiserException` | "INTERNAL_ERROR" | NEIN |
| `DatabaseException` | erbt | NEIN |
| `RecordNotFoundException` | "RECORD_NOT_FOUND" | NEIN |
| `DuplicateRecordException` | "DUPLICATE_RECORD" | NEIN |
| `DatabaseConnectionException` | "DB_CONNECTION_FAILED" | NEIN (5304 existiert!) |
| `MQTTException` | erbt | NEIN |
| `MQTTConnectionException` | "MQTT_CONNECTION_FAILED" | NEIN (5104 existiert!) |
| `MQTTPublishException` | "MQTT_PUBLISH_FAILED" | NEIN (5101 existiert!) |
| `AuthenticationException` | erbt | NEIN |
| `InvalidCredentialsException` | "INVALID_CREDENTIALS" | NEIN |
| `TokenExpiredException` | "TOKEN_EXPIRED" | NEIN |
| `NotFoundError` | "NOT_FOUND" | NEIN |
| `ESP32NotFoundException` | "ESP_NOT_FOUND" | NEIN (5001 existiert!) |
| `ESP32OfflineException` | "ESP32_OFFLINE" | NEIN (5007 existiert!) |
| `SensorNotFoundException` | "SENSOR_NOT_FOUND" | NEIN |
| `ActuatorNotFoundException` | "ACTUATOR_NOT_FOUND" | NEIN |
| `ValidationException` | "VALIDATION_ERROR" | NEIN |
| `DuplicateError` | "DUPLICATE" | NEIN (5208 existiert!) |
| `ServiceUnavailableError` | "SERVICE_UNAVAILABLE" | NEIN |
| `ConfigurationException` | "CONFIGURATION_ERROR" | NEIN |

**Mapping-Luecke:** 7 Exceptions haben numerische Pendants die nicht verknuepft sind:
- `DatabaseConnectionException` ("DB_CONNECTION_FAILED") ↔ 5304
- `MQTTConnectionException` ("MQTT_CONNECTION_FAILED") ↔ 5104
- `MQTTPublishException` ("MQTT_PUBLISH_FAILED") ↔ 5101
- `ESP32NotFoundException` ("ESP_NOT_FOUND") ↔ 5001
- `ESP32OfflineException` ("ESP32_OFFLINE") ↔ 5007
- `DuplicateError` ("DUPLICATE") ↔ 5208
- `ConfigurationException` ("CONFIGURATION_ERROR") ↔ 5002

**Status: [ ] Pruefen ob die String-Codes fuer REST ausreichen oder ob numerische Codes integriert werden sollten**

---

### B3. esp32_error_mapping.py — 11 Codes ohne Enrichment

**Schweregrad:** Funktionale Luecke
**Status:** OFFEN

Die folgenden Error-Codes sind in `error_codes.h` und `error_codes.py` definiert, aber NICHT in `esp32_error_mapping.py`. Wenn diese Fehler via MQTT kommen, liefert `get_error_info()` `None` → generische Nachricht ohne Troubleshooting.

#### I2C Extended Codes (7 fehlend)

| Code | Name | In error_codes.h | In error_codes.py | In esp32_error_mapping.py |
|------|------|------------------|--------------------|-----------------------------|
| 1007 | `I2C_TIMEOUT` | JA | JA | **NEIN** |
| 1009 | `I2C_CRC_FAILED` | JA | JA | **NEIN** |
| 1015 | `I2C_BUS_STUCK` | JA | JA | **NEIN** |
| 1016 | `I2C_BUS_RECOVERY_STARTED` | JA | JA | **NEIN** |
| 1017 | `I2C_BUS_RECOVERY_FAILED` | JA | JA | **NEIN** |
| 1018 | `I2C_BUS_RECOVERED` | JA | JA | **NEIN** |
| 1019 | `I2C_PROTOCOL_UNSUPPORTED` | JA | JA | **NEIN** |

#### DS18B20 Codes (4 fehlend)

| Code | Name | In error_codes.h | In error_codes.py | In esp32_error_mapping.py |
|------|------|------------------|--------------------|-----------------------------|
| 1060 | `DS18B20_SENSOR_FAULT` | JA | JA | **NEIN** |
| 1061 | `DS18B20_POWER_ON_RESET` | JA | JA | **NEIN** |
| 1062 | `DS18B20_OUT_OF_RANGE` | JA | JA | **NEIN** |
| 1063 | `DS18B20_DISCONNECTED_RUNTIME` | JA | JA | **NEIN** |

**Impact:** Diese 11 Codes werden im Firmware-Code aktiv genutzt (z.B. `sensor_manager.cpp:687` fuer DS18B20). Bei Auftreten erhaelt der Benutzer keine Troubleshooting-Hinweise im Frontend.

**Status: [ ] Enrichment-Eintraege in esp32_error_mapping.py ergaenzen**

---

### B4. translateErrorCode() im Frontend nirgends importiert

**Schweregrad:** Toter Code
**Status:** OFFEN

**Datei:** `El Frontend/src/api/errors.ts`

Die Funktionen `translateErrorCode()` und `translateErrorCodes()` sind definiert (Zeile 46, 75) mit Cache-Logik und REST-API-Call an `/errors/codes/{code}`, aber:
- **Kein einziger Import** in irgendeiner Vue-Komponente oder anderem TS-File
- **Kein Aufruf** ausserhalb der eigenen Datei

**Grund:** Real-time Error-Events kommen via WebSocket bereits mit allen Enrichment-Daten (Titel, Message, Troubleshooting). Die REST-API waere nur fuer historische Fehler-Lookups noetig, aber kein Feature nutzt das aktuell.

**Status: [ ] Entscheiden: Entfernen als toten Code oder spaeter fuer History-View nutzen?**

---

### B5. Dead Codes (Definiert aber nicht verwendet)

#### ESP32 Dead Codes (~45 Codes)

**HARDWARE (1000-1999) — 5 tote Codes**

| Code | Name | Wahrscheinlicher Grund |
|------|------|----------------------|
| 1003 | `GPIO_INIT_FAILED` | GPIO-Init laeuft implizit ohne Fehlercode |
| 1005 | `GPIO_READ_FAILED` | digitalRead() hat keine Fehlerbehandlung |
| 1006 | `GPIO_WRITE_FAILED` | digitalWrite() hat keine Fehlerbehandlung |
| 1053 | `ACTUATOR_CONFLICT` | Konfliktpruefung nutzt 1002 (GPIO_CONFLICT) |
| 1063 | `DS18B20_DISCONNECTED_RUNTIME` | Runtime-Disconnect wird als 1060 gemeldet |

**Status: [ ] Pruefen ob 1003/1005/1006 in i2c_bus.cpp oder neueren Dateien genutzt werden**

**SERVICE (2000-2999) — 17 tote Codes**

| Code | Name | Wahrscheinlicher Grund |
|------|------|----------------------|
| 2001 | `NVS_INIT_FAILED` | NVS-Init in setup(), kein trackError |
| 2002 | `NVS_READ_FAILED` | NVS-Reads nutzen return-Werte |
| 2004 | `NVS_NAMESPACE_FAILED` | Kein separates Error-Tracking |
| 2005 | `NVS_CLEAR_FAILED` | Kein separates Error-Tracking |
| 2012 | `CONFIG_LOAD_FAILED` | Config-Load nutzt 2010/2011 |
| 2013 | `CONFIG_SAVE_FAILED` | Config-Save nutzt 2003 (NVS_WRITE_FAILED) |
| 2014 | `CONFIG_VALIDATION` | Validierung nutzt String-basierte ConfigErrorCodes |
| 2020 | `LOGGER_INIT_FAILED` | Logger kann eigene Fehler nicht loggen |
| 2021 | `LOGGER_BUFFER_FULL` | Buffer-Full intern behandelt |
| 2030 | `STORAGE_INIT_FAILED` | Kein separater Storage-Manager |
| 2031 | `STORAGE_READ_FAILED` | Kein separater Storage-Manager |
| 2032 | `STORAGE_WRITE_FAILED` | Kein separater Storage-Manager |
| 2500 | `SUBZONE_INVALID_ID` | Subzone-Validierung nur auf Server |
| 2501 | `SUBZONE_GPIO_CONFLICT` | Subzone-Validierung nur auf Server |
| 2502 | `SUBZONE_PARENT_MISMATCH` | Subzone-Validierung nur auf Server |
| 2503 | `SUBZONE_NOT_FOUND` | Subzone-Validierung nur auf Server |
| 2504 | `SUBZONE_GPIO_INVALID` | Subzone-Validierung nur auf Server |

**COMMUNICATION (3000-3999) — 2 tote Codes**

| Code | Name | Wahrscheinlicher Grund |
|------|------|----------------------|
| 3030 | `NETWORK_UNREACHABLE` | WiFi-Events nutzen spezifischere Codes |
| 3031 | `DNS_FAILED` | DNS-Fehler als WiFi-Fehler behandelt |

**APPLICATION (4000-4999) — ~21 tote Codes** (wie im vorherigen Audit dokumentiert)

**Status: [ ] Vollstaendige Verifizierung steht aus — Zeilennummern koennen sich geaendert haben**

#### Server Dead Codes (~18 Codes)

(Unveraendert zum vorherigen Audit — siehe Abschnitt in vorheriger Version)

**Status: [ ] Pruefen ob durch neue Features Codes aktiv geworden sind**

---

### B6. Neuere Features ohne Error-Codes

| Feature | Datei(en) | Error-Handling | Numerische Error-Codes? |
|---------|-----------|----------------|------------------------|
| Logic Engine | `api/v1/logic.py` | 7 HTTPExceptions | NEIN |
| Dashboard CRUD | `api/v1/dashboards.py` | 3 HTTPExceptions | NEIN |
| AutoOps | `src/autoops/` | Eigenes `APIError`-System | NEIN |
| Subzones API | `api/v1/subzone.py` | 7 HTTPExceptions | NEIN |

**Status: [ ] Pruefen ob separate Error-Code-Ranges (z.B. 5700-5799 fuer Logic) sinnvoll waeren**

---

## TEIL C: Verifizierte OK-Befunde

### C1. ESP32 ↔ Server Definition Sync: 100% SYNC

Alle Enum-Werte in `error_codes.py` stimmen exakt mit den `#define`-Werten in `error_codes.h` ueberein. Inklusive der nachtraeglich hinzugefuegten I2C Extended (1007-1019) und DS18B20 (1060-1063).

### C2. MQTT Error Topic: KONSISTENT

| Schicht | Topic-Pattern | Status |
|---------|---------------|--------|
| ESP32 (topic_builder.cpp) | `kaiser/{kaiser_id}/esp/{esp_id}/system/error` | OK |
| Server Subscriber (main.py:248) | `kaiser/+/esp/+/system/error` | OK |
| Server Parser (topics.py) | Regex mit kaiser_id und esp_id Gruppen | OK |

### C3. MQTT Payload: KONSISTENT (Impl ↔ Server)

Alle 6 Payload-Felder (error_code, severity, category, message, context, ts) sind typ-konsistent zwischen ESP32-Sender und Server-Empfaenger.

### C4. MQTT-Protokoll-Dokumentation: AKTUELL

`El Trabajante/docs/Mqtt_Protocoll.md` Sektion 15 (Zeile 1159-1201) ist jetzt korrekt:
- `error_code`: int (numerisch)
- `severity`: int (0-3)
- Modul-Referenz: `error_handling/error_tracker.cpp`
- Throttle: 60 Sekunden
- Payload-Schema stimmt mit Implementierung ueberein

### C5. Frontend — Server-Zentrisch (korrekt)

Frontend interpretiert Error-Codes nicht lokal. Alle Enrichment-Daten kommen via WebSocket-Event `error_event` vom Server. Einzige lokale Logik: `detectCategory()` fuer Range-basierte Farbgebung.

### C6. GodKaiserException Handler: FUNKTIONAL

`automation_one_exception_handler` ist korrekt in `main.py:751` registriert und wandelt alle `GodKaiserException`-Subklassen in strukturierte JSON-Responses um:
```json
{"success": false, "error": {"code": "NOT_FOUND", "message": "...", "details": {...}}}
```

Plus generischer `general_exception_handler` fuer unbehandelte Exceptions.

---

## TEIL D: Staerken des Systems

1. **Zentrale Definition:** Error-Codes in je einer Datei pro Schicht (error_codes.h, error_codes.py)
2. **ESP32 ↔ Server Sync:** 100% synchron zwischen C++ und Python Definitionen
3. **MQTT Error-Pipeline:** Vollstaendig implementiert (ErrorTracker → MQTT → Server → DB → WebSocket → Frontend)
4. **Rate-Limiting:** ESP32 throttled auf 1/Code/60s (verhindert Broker-Flooding)
5. **Recursion Guard:** Verhindert Endlosschleife bei MQTT-Publish-Fehlern
6. **Error Enrichment:** 97 Codes mit deutschen Troubleshooting-Hinweisen
7. **Server-Zentrische Interpretation:** Frontend zeigt nur an, interpretiert nicht lokal
8. **Severity-Modell:** 4-stufig (INFO/WARNING/ERROR/CRITICAL) ueber alle Schichten
9. **Audit-Trail:** Fehler in AuditLog persistiert mit Request-ID Tracing
10. **Prometheus Integration:** Error-Metriken fuer Grafana Dashboard
11. **Helper-Funktionen:** `get_error_code_description()`, `getErrorDescription()` auf beiden Seiten
12. **Exception Handler:** GodKaiserException mit strukturierten JSON-Responses

---

## TEIL E: Zusammenfassung der offenen Luecken

| # | Luecke | Schweregrad | Aufwand | Status |
|---|--------|-------------|---------|--------|
| B1 | 185 HTTPExceptions ohne numerische Error-Codes | Strukturell | 2-3 Tage | [ ] Pruefen |
| B2 | Paralleles Exception-System (String vs. Numerisch) | Architektur | 1 Tag | [ ] Pruefen |
| B3 | 11 Codes ohne Enrichment in esp32_error_mapping.py | Funktional | 2 Stunden | [ ] Ergaenzen |
| B4 | translateErrorCode() im Frontend ungenutzt | Toter Code | 5 Min | [ ] Entscheiden |
| B5 | ~45 tote ESP32-Codes, ~18 tote Server-Codes | Wartbarkeit | 1 Stunde | [ ] Dokumentieren |
| B6 | Neuere Features (Logic, Dashboard, AutoOps) ohne Codes | Konsistenz | 1 Tag | [ ] Pruefen |

### Priorisierung

**Prio 1 (Funktional):** B3 — 11 fehlende Enrichment-Eintraege. Diese Codes werden aktiv genutzt (DS18B20, I2C Bus Recovery). Ohne Enrichment fehlen Troubleshooting-Hinweise im Frontend.

**Prio 2 (Architektur-Entscheidung):** B1/B2 — Soll das REST-API-Layer die numerischen Error-Codes nutzen? Oder reicht das String-basierte GodKaiserException-System? Dies ist eine bewusste Architektur-Entscheidung, kein Bug.

**Prio 3 (Cleanup):** B4/B5 — Toter Code und tote Definitionen. Kein funktionales Risiko, aber Wartbarkeits-Last.

**Prio 4 (Zukunft):** B6 — Neuere Features. Sollen eigene Error-Code-Ranges bekommen wenn sie gross genug werden.

---

## TEIL F: Referenz — Alle Error-Code-Dateien

| Schicht | Datei | Zweck |
|---------|-------|-------|
| ESP32 | `El Trabajante/src/models/error_codes.h` | #define Codes + Descriptions |
| ESP32 | `El Trabajante/src/error_handling/error_tracker.h` | ErrorTracker Klasse |
| ESP32 | `El Trabajante/src/error_handling/error_tracker.cpp` | Tracking + MQTT Publishing |
| ESP32 | `El Trabajante/src/utils/topic_builder.cpp` | buildSystemErrorTopic() |
| Server | `god_kaiser_server/src/core/error_codes.py` | Enum Definitionen + Descriptions |
| Server | `god_kaiser_server/src/core/exceptions.py` | GodKaiserException Hierarchie |
| Server | `god_kaiser_server/src/core/exception_handlers.py` | HTTP Exception Handler |
| Server | `god_kaiser_server/src/core/esp32_error_mapping.py` | Error Enrichment (97 Codes) |
| Server | `god_kaiser_server/src/mqtt/handlers/error_handler.py` | MQTT Error Empfang |
| Server | `god_kaiser_server/src/db/models/audit_log.py` | AuditLog DB Model |
| Server | `god_kaiser_server/src/api/v1/errors.py` | Error REST API |
| Frontend | `El Frontend/src/api/errors.ts` | translateErrorCode() (ungenutzt) |
| Frontend | `El Frontend/src/utils/errorCodeTranslator.ts` | detectCategory(), UI Helpers |
| Frontend | `El Frontend/src/shared/stores/notification.store.ts` | handleErrorEvent() |
| Frontend | `El Frontend/src/components/error/ErrorDetailsModal.vue` | Error-Detail-Anzeige |
| Frontend | `El Frontend/src/types/websocket-events.ts` | ErrorEvent Interface |
| Doku | `El Trabajante/docs/Mqtt_Protocoll.md` | Sektion 15: Error-Reporting |
| Referenz | `.claude/reference/errors/ERROR_CODES.md` | Agent-Referenz v1.1 |
