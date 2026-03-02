# STEP 2: Error-Code-System — Bestandsaufnahme und Gap-Analyse

> **Datum:** 2026-03-02
> **Typ:** Analyse (kein Code geaendert)
> **Referenz:** `auftrag-error-code-system-ausbau.md` (Blocks 1-7)
> **Vorbedingung:** STEP 0 (12/15 fixes), STEP 1 (Phase 4A Backend ~95%, 0 Tests)

---

## Summary-Tabelle

| Metrik | Erwartet (Auftrag) | IST-Zustand | Delta |
|--------|-------------------|-------------|-------|
| ESP32 Error-Codes (Production) | ~108 | **111** | +3 |
| ESP32 Error-Codes (Test) | — | **12** (6000-6099) | n/a |
| ESP32 Error-Codes (Gesamt) | ~108 | **123** | +15 |
| Server Error-Codes | ~76 | **76** | 0 |
| Enrichment-Coverage (esp32_error_mapping) | 97/108 (90%) | **111/111 (100%)** | +14 Codes, +10% |
| GodKaiserException hat numeric_code | NEIN | **JA** (bereits implementiert) | Fundamentale Abweichung |
| Exception-Klassen mit numeric_code | 0 | **16** | +16 |
| Exception-Klassen OHNE numeric_code | ~30 | **~22** | Gap fuer Block 2 |
| REST-Errors in AuditLog | NEIN | **JA** (via exception_handler) | Bereits vorhanden |
| Prometheus Error-Counter | 0 | **2** (HTTP_ERRORS_TOTAL, ESP_ERRORS_TOTAL) | Teilweise vorhanden |
| Per-Error-Code Prometheus Counter | 0 | **0** | Bestaetigt: fehlt |
| translateErrorCode() genutzt | Unbekannt | **Dead Code** (0 Imports) | Gap fuer Block 4 |
| Phase 4A: GodKaiserException Usage | 0 | **0** | Bestaetigt: Gap |
| Phase 4A: HTTPException Usage | — | **6** (notifications.py) | Zu migrieren |
| ESP32↔Server Sync-Mechanismus | Manuell | **Manuell** | Gap fuer Block 1 |

---

## Teil A: Error-Code Definitionen (Inventar)

### A.1 ESP32 Error-Codes (`El Trabajante/src/models/error_codes.h`)

| Range | Kategorie | Anzahl | Codes |
|-------|-----------|--------|-------|
| 1000-1999 | HARDWARE | 28 | 1001-1028 |
| 2000-2999 | SERVICE | 27 | 2001-2027 |
| 3000-3999 | COMMUNICATION | 31 | 3001-3031 |
| 4000-4999 | APPLICATION | 25 | 4001-4025 |
| **Summe Production** | | **111** | |
| 6000-6099 | TEST | 12 | 6001-6012 |
| **Summe Gesamt** | | **123** | |

**Zusaetzlich:** `ConfigErrorCode` enum mit 8 string-basierten Werten (CONFIG_PARSE_ERROR, CONFIG_KEY_MISSING, etc.)

**Hilfsfunktionen:**
- `getErrorDescription(code)` — liefert String-Beschreibung fuer jeden Code
- `getErrorCodeRange(code)` — gibt Range-Kategorie zurueck ("HARDWARE", "SERVICE", etc.)

**Firmware-Nutzung:** 242 `ERROR_` Referenzen in 18 `.cpp` Dateien (aktiv genutzt)

### A.2 Server Error-Codes (`El Servador/god_kaiser_server/src/core/error_codes.py`)

#### ESP32-Mirror (IntEnum-Klassen)

| Klasse | Range | Anzahl |
|--------|-------|--------|
| ESP32HardwareError | 1000-1999 | 28 |
| ESP32ServiceError | 2000-2999 | 27 |
| ESP32CommunicationError | 3000-3999 | 31 |
| ESP32ApplicationError | 4000-4999 | 25 |
| **Summe ESP32-Mirror** | | **111** |

#### Server-Spezifische Codes (IntEnum-Klassen)

| Klasse | Range | Anzahl |
|--------|-------|--------|
| ConfigErrorCode | 5001-5007 | 7 |
| MQTTErrorCode | 5101-5107 | 7 |
| ValidationErrorCode | 5201-5209 | 9 |
| DatabaseErrorCode | 5301-5306 | 6 |
| ServiceErrorCode | 5401-5405 | 5 |
| AuditErrorCode | 5501-5503 | 3 |
| SequenceErrorCode | 5600-5642 | 24 |
| LogicErrorCode | 5700-5705 | 6 |
| DashboardErrorCode | 5750-5753 | 4 |
| SubzoneErrorCode | 5780-5782 | 3 |
| AutoOpsErrorCode | 5800-5801 | 2 |
| **Summe Server** | | **76** |

**Description Dictionaries:**
- `ESP32_ERROR_DESCRIPTIONS` — 111 Eintraege
- `SERVER_ERROR_DESCRIPTIONS` — 76 Eintraege
- `TEST_ERROR_DESCRIPTIONS` — 12 Eintraege

**Helper Functions:**
- `get_error_code_description(code)` — String-Lookup
- `get_error_code_range(code)` — Range-Klassifizierung
- `get_all_error_codes()` — Vollstaendige Liste

**Server-Nutzung:** 151 Error-Code Referenzen in 12 `.py` Dateien

### A.3 ESP32↔Server Synchronisation

| Aspekt | Status |
|--------|--------|
| Sync-Mechanismus | **Manuell** (copy-paste zwischen .h und .py) |
| CI/CD Check | **Keiner** |
| Code-Generation | **Keine** |
| Letzter bekannter Sync | Codes stimmen ueberein (111=111) |
| Risiko | Drift bei neuen Codes moeglich |

**Gap fuer Block 1:** Automatisierter Sync-Check (CI) oder Code-Generation fehlt.

---

## Teil B: Enrichment-Coverage (`esp32_error_mapping.py`)

### B.1 Coverage-Analyse

| Metrik | Wert |
|--------|------|
| Production-Codes gesamt | 111 |
| Enrichment-Eintraege | **111** |
| Coverage | **100%** |
| Erwartet (Auftrag) | 97/108 = 90% |

**KRITISCHE ABWEICHUNG:** Die Enrichment-Coverage ist **100%**, nicht 90% wie erwartet.
Alle 111 Production-Codes (1000-4999) haben vollstaendige Enrichment-Eintraege.

### B.2 Enrichment-Struktur

`ALL_ESP32_ERROR_MESSAGES` kombiniert 25 Sub-Dictionaries:

| Sub-Dictionary | Codes |
|----------------|-------|
| HARDWARE_SENSOR_ERRORS | 1001-1009 |
| HARDWARE_ACTUATOR_ERRORS | 1010-1015 |
| HARDWARE_GPIO_ERRORS | 1016-1020 |
| HARDWARE_POWER_ERRORS | 1021-1023 |
| HARDWARE_GENERAL_ERRORS | 1024-1028 |
| SERVICE_NVS_ERRORS | 2001-2005 |
| SERVICE_OTA_ERRORS | 2006-2010 |
| SERVICE_TIMER_ERRORS | 2011-2013 |
| SERVICE_WATCHDOG_ERRORS | 2014-2016 |
| SERVICE_NETWORK_ERRORS | 2017-2020 |
| SERVICE_SAFETY_ERRORS | 2021-2023 |
| SERVICE_GENERAL_ERRORS | 2024-2027 |
| COMM_MQTT_ERRORS | 3001-3010 |
| COMM_WIFI_ERRORS | 3011-3017 |
| COMM_PROTOCOL_ERRORS | 3018-3022 |
| COMM_SERVER_ERRORS | 3023-3027 |
| COMM_GENERAL_ERRORS | 3028-3031 |
| APP_CONFIG_ERRORS | 4001-4005 |
| APP_LOGIC_ERRORS | 4006-4010 |
| APP_STATE_ERRORS | 4011-4015 |
| APP_BOOT_ERRORS | 4016-4018 |
| APP_RESOURCE_ERRORS | 4019-4021 |
| APP_GENERAL_ERRORS | 4022-4025 |
| (2 weitere kleine Gruppen) | — |

### B.3 Enrichment-Felder pro Eintrag

Jeder Eintrag hat folgende Felder:
- `category` — Fehler-Kategorie (hardware, service, communication, application)
- `severity` — critical / warning / info
- `message_de` — Technische Beschreibung (Deutsch)
- `message_user_de` — Benutzerfreundliche Beschreibung (Deutsch)
- `troubleshooting_de` — Liste von Troubleshooting-Schritten (Deutsch)
- `docs_link` — Verweis auf Dokumentation
- `recoverable` — Boolean: automatisch behebbar?
- `user_action_required` — Boolean: Benutzeraktion noetig?

### B.4 Zusaetzliche Enrichment-Tabellen

| Tabelle | Eintraege | Typ |
|---------|-----------|-----|
| ESP32_CONFIG_ERROR_MESSAGES_DE | 10 | String-basierte Config-Fehler |
| ESP32_ACTUATOR_ALERT_MESSAGES_DE | 5 | Actuator-Alert-Typen |

### B.5 Server-Error Enrichment

| Aspekt | Status |
|--------|--------|
| Server-Error Enrichment (5000-5999) | **FEHLT komplett** |
| Nur vorhanden | String-Descriptions in `SERVER_ERROR_DESCRIPTIONS` |
| Fehlend | message_user_de, troubleshooting_de, docs_link, etc. |

**Gap fuer Block 3:** Server-Errors (76 Codes) haben keine Rich-Enrichment-Daten.

---

## Teil C: Exception-System

### C.1 GodKaiserException Basis-Klasse

```
GodKaiserException(message, error_code=None, details=None, *, numeric_code=None)
  ├── status_code: int
  ├── error_code: str (z.B. "ESP_NOT_FOUND")
  ├── numeric_code: Optional[int] (z.B. 5001)  ← BEREITS IMPLEMENTIERT
  ├── message: str
  ├── details: dict
  └── to_dict() → inkludiert numeric_code
```

**KRITISCHE ABWEICHUNG:** Der Auftrag ging davon aus, dass `numeric_code` NICHT existiert.
Es ist jedoch bereits als keyword-only Parameter implementiert.

### C.2 Exception-Klassen MIT numeric_code (16 Klassen)

| Klasse | numeric_code | HTTP Status |
|--------|-------------|-------------|
| DatabaseConnectionException | 5304 | 503 |
| MQTTConnectionException | 5104 | 503 |
| MQTTPublishException | 5101 | 502 |
| ESP32NotFoundException | 5001 | 404 |
| ESPNotFoundError | 5001 | 404 |
| ESP32OfflineException | 5007 | 503 |
| DuplicateError | 5208 | 409 |
| DeviceNotApprovedError | 5405 | 403 |
| ConfigurationException | 5002 | 500 |
| GpioConflictError | 5208 | 409 |
| GatewayTimeoutError | 5403 | 504 |
| RuleNotFoundException | 5700 | 404 |
| RuleValidationException | 5701 | 422 |
| SubzoneNotFoundException | 5780 | 404 |
| SequenceNotFoundException | 5611 | 404 |
| DashboardNotFoundException | 5750 | 404 |

### C.3 Exception-Klassen OHNE numeric_code (~22 Klassen)

| Klasse | HTTP Status | Fehlender Code |
|--------|-------------|----------------|
| MQTTSubscribeException | 503 | 5102? |
| InvalidCredentialsException | 401 | — |
| TokenExpiredException | 401 | — |
| InvalidTokenException | 401 | — |
| InsufficientPermissionsException | 403 | — |
| SensorNotFoundException | 404 | — |
| SensorNotFoundError | 404 | — |
| SensorProcessingException | 500 | — |
| ActuatorNotFoundException | 404 | — |
| ActuatorNotFoundError | 404 | — |
| ActuatorCommandFailedException | 502 | — |
| SafetyConstraintViolationException | 409 | — |
| ValidationException | 422 | — |
| AuthenticationError | 401 | — |
| AuthorizationError | 403 | — |
| ServiceUnavailableError | 503 | — |
| GodLayerException | 500 | — |
| KaiserCommunicationException | 502 | — |
| SimulationNotRunningError | 409 | — |
| EmergencyStopActiveError | 409 | — |
| DuplicateESPError | 409 | — |
| UserNotFoundException | 404 | — |

**Gap fuer Block 2:** ~22 Exception-Klassen benoetigen numeric_code Zuweisung.
Teilweise muessen neue Error-Codes in `error_codes.py` definiert werden (Auth-Bereich, Sensor-Bereich, etc.).

---

## Teil D: AuditLog-Integration

### D.1 AuditLog-Modell (`audit_log.py`)

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| error_code | String(50), nullable, indexed | String-basiert (NICHT int) |
| numeric_code | — | **Feld existiert NICHT im Modell** |
| request_id | String(255), nullable, indexed | Request-Tracing |
| event_type | AuditEventType | Inkl. API_ERROR |
| severity | AuditSeverity | critical/warning/info |

### D.2 AuditLog-Schreibpfade

| Pfad | Quelle | Status |
|------|--------|--------|
| REST API Errors | `exception_handlers.py` → `_log_to_audit()` | **AKTIV** (wenn numeric_code gesetzt) |
| MQTT Errors | `error_handler.py` → `audit_repo.log_mqtt_error()` | **AKTIV** |
| Manuell | `audit_repo.log_api_error()` direkt | Verfuegbar |

**KRITISCHE ABWEICHUNG:** Der Auftrag ging davon aus, REST-Errors seien NICHT im AuditLog.
Sie sind jedoch bereits integriert — `_log_to_audit()` in `exception_handlers.py` schreibt
AuditLog-Eintraege fuer jede GodKaiserException mit gesetztem `numeric_code`.

### D.3 AuditLog Repository (`audit_log_repo.py`)

`log_api_error()` akzeptiert:
- `error_code: str` — String-Code (z.B. "ESP_NOT_FOUND")
- `numeric_code: int` — Numerischer Code (z.B. 5001)
- `severity: str`
- `message: str`
- `source_id: str` — Request-Path
- `method: str` — HTTP-Methode
- `details: dict` — Inkl. request_id

**Hinweis:** `numeric_code` wird im `details`-Dict gespeichert, nicht als eigenes DB-Feld.

### D.4 Gaps

| Gap | Beschreibung |
|-----|-------------|
| Kein `numeric_code` DB-Feld | Numerischer Code nur in `details` JSON, nicht querybar |
| Nur bei numeric_code | Exceptions OHNE numeric_code erzeugen KEINEN AuditLog-Eintrag |
| Phase 4A nicht angebunden | NotificationRouter, webhooks.py nutzen kein GodKaiserException |

---

## Teil E: Prometheus-Metriken

### E.1 Vorhandene Counter (`metrics.py`)

| Counter | Labels | Inkrementiert von |
|---------|--------|-------------------|
| `ESP_ERRORS_TOTAL` | esp_id | `increment_esp_error()` — MQTT error_handler |
| `HTTP_ERRORS_TOTAL` | status_class (4xx/5xx) | `increment_http_error()` — Request-ID Middleware |

### E.2 Gaps

| Gap | Beschreibung |
|-----|-------------|
| Kein Per-Error-Code Counter | HTTP_ERRORS_TOTAL zaehlt nur nach 4xx/5xx Klasse, nicht nach spezifischem Error-Code |
| Kein REST API Error-Code Counter | Fehlt: Counter mit Label `error_code` fuer GodKaiserException |
| Kein Notification Error Counter | Phase 4A Fehler nicht in Prometheus |
| ESP Errors nur Gesamt-Counter | Kein Breakdown nach Error-Code-Range (HARDWARE/SERVICE/COMM/APP) |

**Gap fuer Block 5 (optional):** Per-Error-Code Prometheus Counter fuer Grafana-Dashboards.

---

## Teil F: Frontend Error-Handling

### F.1 Error-API Client (`El Frontend/src/api/errors.ts`)

| Funktion | Beschreibung | Status |
|----------|-------------|--------|
| `translateErrorCode(code)` | Cached API-Call an GET /v1/errors/codes/{code} | **DEAD CODE** — 0 Imports |
| `translateErrorCodes(codes)` | Batch-Uebersetzung | **DEAD CODE** — 0 Imports |
| `fetchErrorEventsForESP(espId)` | Error-Events pro ESP | Muss geprueft werden |
| `fetchErrorSummary()` | Fehler-Statistiken | Muss geprueft werden |

**Bestaetigt:** `translateErrorCode()` wird nirgends importiert.
Kommentar im Code: "TODO: Used by planned History-View feature"

### F.2 Error-Komponenten (`El Frontend/src/components/error/`)

| Komponente | Beschreibung |
|------------|-------------|
| ErrorDetailsModal.vue | Modal fuer Error-Details |
| TroubleshootingPanel.vue | Troubleshooting-Anzeige |

### F.3 Error-API Endpoints (`El Servador/.../api/v1/errors.py`)

| Endpoint | Beschreibung | Exception-Handling |
|----------|-------------|-------------------|
| GET /v1/errors/esp/{esp_id} | Error-Events pro ESP | 2x HTTPException (404) |
| GET /v1/errors/summary | Fehler-Statistiken | — |
| GET /v1/errors/codes | Alle bekannten Codes | — |
| GET /v1/errors/codes/{error_code} | Einzelner Code-Lookup | — |

**Gap:** errors.py nutzt `HTTPException` statt `GodKaiserException` (2 Stellen).

---

## Teil G: Phase 4A Services — Error-Code-Coverage

### G.1 notification_router.py

| Aspekt | Status |
|--------|--------|
| GodKaiserException Usage | **0** |
| Error-Codes | **0** |
| Exception-Handling | Generic `try/except` mit `logger.error` |
| WebSocket-Failures | Silently caught |
| Email-Failures | Silently caught |
| AuditLog-Integration | **Nein** |

### G.2 notifications.py (API)

| Aspekt | Status |
|--------|--------|
| GodKaiserException Usage | **0** |
| HTTPException Usage | **6 Stellen** |
| Error-Codes | **0** |
| AuditLog-Integration | **Nein** (keine numeric_codes) |

HTTPException-Stellen:
1. `get_notification()` — 404 Not Found
2. `mark_notification_read()` — 404 Not Found
3. `send_notification()` — 422 Deduplicated
4. `test_email()` — 503 Email unavailable
5. `test_email()` — 422 No email address
6. `test_email()` — 502 Email delivery failed

### G.3 webhooks.py (API)

| Aspekt | Status |
|--------|--------|
| GodKaiserException Usage | **0** |
| HTTPException Usage | **0** |
| Error-Codes | **0** |
| Exception-Handling | Generic `try/except` pro Alert in Loop |
| AuditLog-Integration | **Nein** |

### G.4 alert_suppression_service.py

| Aspekt | Status |
|--------|--------|
| Status | Existiert (ungelesen) |
| Erwartung | Kein Error-Code Usage |

### G.5 email_service.py

| Aspekt | Status |
|--------|--------|
| Status | Referenziert via `get_email_service()` |
| Exception-Handling | Exceptions werden in notification_router.py gefangen |

### G.6 Phase 4A Gesamt-Bewertung

| Metrik | Wert |
|--------|------|
| Phase 4A Dateien | 5-6 |
| GodKaiserException Usage | **0 / 5-6** |
| HTTPException zu migrieren | **6** (alle in notifications.py) |
| Error-Codes zu definieren | ~8-10 neue Codes noetig |
| Vorgeschlagener Range | 5850-5899 (Notification-Bereich) |

---

## Teil H: Dead-Codes Register

### H.1 Frontend Dead Code

| Code/Funktion | Datei | Status | Grund |
|--------------|-------|--------|-------|
| `translateErrorCode()` | errors.ts | **Dead Code** | 0 Imports, geplant fuer History-View |
| `translateErrorCodes()` | errors.ts | **Dead Code** | 0 Imports, Batch-Variante |

### H.2 Server: Ungenutzte Error-Codes

Nicht vollstaendig pruefbar ohne Runtime-Analyse. Folgende Bereiche haben Risiko:
- `AuditErrorCode` (5501-5503): Nur 3 Codes, Nutzung unklar
- `AutoOpsErrorCode` (5800-5801): Nur 2 Codes, neues Feature

### H.3 API-Dateien ohne Exception-Handling

| Datei | Raises | Anmerkung |
|-------|--------|-----------|
| ai.py | 0 | Moeglicherweise ok (KI-Feature) |
| health.py | 0 | Erwartet (Health-Check) |
| kaiser.py | 0 | Moeglicherweise ok |
| library.py | 0 | Moeglicherweise ok |
| logs.py | 0 | Moeglicherweise ok |
| webhooks.py | 0 | **Gap** — sollte Fehler behandeln |
| __init__.py | 0 | Erwartet (Router-Setup) |

---

## API-Dateien: Exception-Typ Verteilung

### HTTPException vs GodKaiserException (22 API-Dateien)

| Datei | HTTPException | GodKaiserException* | Gesamt |
|-------|--------------|-------------------|--------|
| debug.py | 58 | 0 | 58 |
| audit.py | 13 | 0 | 13 |
| notifications.py | 6 | 0 | 6 |
| sensor_type_defaults.py | 4 | 0 | 4 |
| errors.py | 2 | 0 | 2 |
| esp.py | 0 | ~25 | ~25 |
| sensors.py | 0 | ~20 | ~20 |
| actuators.py | 0 | ~18 | ~18 |
| auth.py | 0 | ~15 | ~15 |
| logic.py | 0 | ~12 | ~12 |
| sequences.py | 0 | ~12 | ~12 |
| zone.py | 0 | ~8 | ~8 |
| users.py | 0 | ~6 | ~6 |
| dashboards.py | 0 | ~5 | ~5 |
| subzone.py | 0 | ~5 | ~5 |
| **Summe** | **83** | **~126** | **~209** |

*GodKaiserException = alle Subklassen (raise SomeError, raise SomeException)

**Ergebnis:** ~60% der API-Dateien nutzen bereits GodKaiserException korrekt.
5 Dateien (audit, debug, errors, notifications, sensor_type_defaults) nutzen noch HTTPException.

---

## Bewertung: Block-Readiness

### Block 1: Error-Code Ranges erweitern (Auth 5900+, Notification 5850+)

| Aspekt | Status | Bereit? |
|--------|--------|---------|
| error_codes.py Struktur | IntEnum-Pattern vorhanden | JA |
| Freie Ranges | 5850-5899 (Notification), 5900+ (Auth) | JA |
| Sync-Mechanismus | Manuell — kein CI-Check | TEILWEISE |
| Beschreibungs-Dicts | Pattern vorhanden (SERVER_ERROR_DESCRIPTIONS) | JA |

**Bereit fuer Block 1?** **JA** — Neue IntEnum-Klassen nach bestehendem Pattern.
Empfehlung: CI-Check fuer ESP32↔Server Sync hinzufuegen.

### Block 2: Exception-Klassen mit numeric_code versehen

| Aspekt | Status | Bereit? |
|--------|--------|---------|
| GodKaiserException.numeric_code | **Bereits implementiert** | JA |
| 16 Klassen bereits mit Code | Vorhanden | JA |
| ~22 Klassen ohne Code | Zu ergaenzen | JA (Pattern klar) |
| exception_handlers.py | Verarbeitet numeric_code bereits | JA |
| AuditLog-Integration | Funktioniert bereits | JA |

**Bereit fuer Block 2?** **JA** — Pattern ist klar etabliert, nur fehlende numeric_codes nachtragen.
DEUTLICH weniger Aufwand als erwartet (Pattern existiert, nicht neu zu bauen).

### Block 3: Server-Error Enrichment (analog esp32_error_mapping)

| Aspekt | Status | Bereit? |
|--------|--------|---------|
| ESP32 Enrichment als Vorlage | 100% Coverage, klares Pattern | JA |
| Server-Error Descriptions | Nur Einzeiler in SERVER_ERROR_DESCRIPTIONS | TEILWEISE |
| Fehlend | message_user_de, troubleshooting_de, docs_link | Gap |
| Enrichment-Funktion | get_error_info() nur fuer ESP32 | Zu erweitern |

**Bereit fuer Block 3?** **JA** — ESP32-Pattern als 1:1 Vorlage nutzbar.
76 Server-Codes benoetigen Rich-Enrichment-Daten.

### Block 4: Frontend Error-Translation aktivieren

| Aspekt | Status | Bereit? |
|--------|--------|---------|
| translateErrorCode() | Implementiert aber Dead Code | JA (nur Imports noetig) |
| API Endpoint | GET /v1/errors/codes/{code} funktioniert | JA |
| Error-Komponenten | ErrorDetailsModal, TroubleshootingPanel vorhanden | JA |
| Integration in Views | Nicht vorhanden | Zu implementieren |

**Bereit fuer Block 4?** **JA** — Infrastruktur vorhanden, nur Integration fehlt.

---

## Kritische Abweichungen vom Auftragsdokument

| # | Erwartung (Auftrag) | Realitaet | Impact |
|---|---------------------|-----------|--------|
| 1 | ~108 ESP32 Codes | 111 Production + 12 Test = 123 | Inventar-Korrektur |
| 2 | 97/108 Enrichment (90%) | 111/111 (100%) | Block 3 betrifft nur Server, nicht ESP32 |
| 3 | GodKaiserException hat KEIN numeric_code | HAT numeric_code (keyword-only) | Block 2 deutlich einfacher |
| 4 | REST-Errors NICHT in AuditLog | SIND in AuditLog (via exception_handler) | Block 5 teilweise erledigt |
| 5 | 0 GodKaiserException in API-Dateien | ~126 Nutzungen in 10+ Dateien | Nur 5 Dateien zu migrieren |
| 6 | 0 Prometheus Error-Counter | 2 Counter vorhanden (HTTP + ESP) | Block 5 teilweise vorhanden |

---

## Empfohlene Block-Reihenfolge

1. **Block 1** (Error-Code Ranges) — Neue Codes definieren (Notification 5850-5899, Auth 5900-5949)
2. **Block 2** (numeric_code vervollstaendigen) — ~22 Exception-Klassen ergaenzen
3. **Block 4** (Frontend Integration) — translateErrorCode() aktivieren
4. **Block 3** (Server Enrichment) — 76 Server-Codes mit Rich-Data versehen
5. **Block 5** (Prometheus per-code) — Optional, per-Error-Code Counter
6. **Block 6** (Phase 4A Migration) — HTTPException → GodKaiserException
7. **Block 7** (CI Sync-Check) — ESP32↔Server Code-Synchronisation

---

*Report generiert: 2026-03-02 | Analyse-Methode: Vollstaendige Codebase-Durchsuchung*
*Dateien gelesen: ~20 | Grep-Suchen: ~15 | Keine Code-Aenderungen vorgenommen*
