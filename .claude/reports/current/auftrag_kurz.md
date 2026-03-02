## Auftrag: Error-Code-System — Vollstaendiger Ausbau zur Cross-Layer-Konsistenz

**Ziel-Repo:** auto-one
**Kontext:** Cross-Layer Error-Code-Audit (2026-03-01) hat Gesamtbewertung 7.5/10 ergeben. MQTT-Pipeline funktioniert exzellent, aber REST-API-Layer und Exception-System sind nicht integriert. 11 aktive Firmware-Codes ohne Enrichment. Ziel: Error-Trace-Logik auf 100% bringen, damit KI-Integration (Ebene 1-4) optimal aufsetzen kann.
**Bezug:** KI-Error-Analyse Roadmap (ki-error-analyse-iot.md), Backend-Verifikation (STATUS.md), Observability-Modernisierung
**Prioritaet:** Hoch
**Datum:** 2026-03-01

---

### Ist-Zustand

**Was funktioniert (Staerken — beibehalten):**
- ESP32 ↔ Server Error-Code-Sync: 100% (error_codes.h ↔ error_codes.py)
- MQTT Error-Pipeline: Vollstaendig (ErrorTracker → MQTT → Server → DB → WebSocket → Frontend)
- Rate-Limiting: 1/Code/60s auf ESP32 (verhindert Broker-Flooding)
- Recursion Guard: Verhindert Endlosschleife bei MQTT-Publish-Fehlern
- Error Enrichment: 97/108 Codes mit deutschen Troubleshooting-Hinweisen
- Server-Zentrische Interpretation: Frontend zeigt nur an, interpretiert nicht lokal
- AuditLog-Persistierung: Fehler in audit_logs mit Request-ID Tracing
- Prometheus-Metriken: increment_esp_error() fuer Grafana
- Correlation-IDs: X-Request-ID End-to-End (Frontend → Server → DB)
- GodKaiserException Handler: Strukturierte JSON-Responses fuer REST-API

**Was fehlt (Luecken — zu schliessen):**

| # | Luecke | Schweregrad | Kurzbeschreibung |
|---|--------|-------------|------------------|
| B1 | ~~REST-API umgeht Error-Code-System~~ | ~~Strukturell~~ | ✅ BEHOBEN: 11 API-Dateien migriert, 82 HTTPExceptions bewusst in 4 Utility-Dateien |
| B2 | ~~Paralleles Exception-System~~ | ~~Architektur~~ | ✅ BEHOBEN: numeric_code Attribut + AuditLog-Integration |
| B3 | ~~11 Codes ohne Enrichment~~ | ~~Funktional~~ | ✅ BEHOBEN: 108/108 Codes mit Enrichment |
| B4 | translateErrorCode() ungenutzt | Toter Code | Frontend-API-Modul nie importiert |
| B5 | ~63 tote Error-Codes | Wartbarkeit | ~45 ESP32 + ~18 Server — definiert aber nicht verwendet |
| B6 | ~~Neue Features ohne Codes~~ | ~~Konsistenz~~ | ✅ BEHOBEN: Logic 5700-5749, Dashboard 5750-5779, Subzones 5780-5799, AutoOps 5800-5849, Sequences 5850-5899 |

**Position im Plan:** Backend-Verifikation + Observability-Modernisierung (kurzfristig). Vorbereitung fuer KI-Error-Analyse Ebene 1 (regelbasiert) und Ebene 2 (Isolation Forest).

---

### Was getan werden muss

Das Error-Code-System muss von einem "funktioniert fuer MQTT" zu einem "funktioniert ueberall" ausgebaut werden. Am Ende soll jeder Fehler — egal ob aus ESP32 via MQTT, aus der REST-API, oder aus internen Services — denselben strukturierten Weg gehen: numerischer Code → Enrichment → AuditLog → Frontend-Anzeige. Das ist die Grundlage dafuer, dass die KI-Error-Analyse (Ebene 1-4) spaeter auf einem konsistenten Datenstrom aufbauen kann.

**Erwartetes Ergebnis aus Nutzersicht:**
- Jeder Fehler im System traegt einen numerischen Error-Code (1000-5699+)
- Frontend zeigt bei REST-API-Fehlern dieselbe strukturierte Fehlermeldung wie bei MQTT-Fehlern
- Troubleshooting-Hinweise fuer alle aktiv genutzten Codes verfuegbar
- AuditLog enthaelt einheitliche Error-Code-Eintraege — keine Luecken je nach Fehlerquelle
- Error-Metriken in Prometheus fuer ALLE Fehlertypen (nicht nur ESP32-Errors)

**Abhaengigkeiten:**
- Keine harten Blocker — alle Aenderungen sind inkrementell
- Bestehende Tests duerfen nicht brechen (790 Backend + 1339 Frontend)

---

### Technische Details

**Betroffene Schichten:**
- [x] Backend (El Servador) — Hauptarbeit
- [ ] Firmware (El Trabajante) — Keine Aenderungen noetig
- [x] Frontend (El Frontend) — Kleine Anpassungen
- [ ] Monitoring (Grafana/Prometheus/Loki) — Optional (Prio 3)

**Betroffene Module/Komponenten:**

| Modul | Aenderungstyp |
|-------|--------------|
| `src/core/error_codes.py` | Erweitern: Neue Ranges (5700+) fuer Logic/Dashboard/AutoOps |
| `src/core/exceptions.py` | Erweitern: `numeric_code` Attribut auf GodKaiserException |
| `src/core/exception_handlers.py` | Erweitern: numeric_code in JSON-Response + AuditLog |
| `src/core/esp32_error_mapping.py` | Erweitern: 11 fehlende Enrichment-Eintraege |
| `src/api/v1/*.py` (14 Dateien) | Migrieren: HTTPException → GodKaiserException (schrittweise) |
| `Frontend: src/api/errors.ts` | Entscheidung: Behalten oder entfernen |
| `Frontend: ErrorDetailsModal.vue` | Optional: REST-Error-Codes anzeigen |

**Vorhandene Infrastruktur die genutzt werden kann:**
- `GodKaiserException` mit `automation_one_exception_handler` — bereits registriert, strukturierte Responses
- `AuditLog` Model mit `error_code` Feld (als String) — bereits nutzbar
- `esp32_error_mapping.py` Pattern — kann fuer Server-Codes repliziert werden
- Prometheus `increment_esp_error()` — kann zu generischem `increment_error()` erweitert werden
- Frontend `ErrorDetailsModal.vue` — kann REST-Errors anzeigen wenn strukturiert

---

### Block 1: Exception-Bridge (GodKaiserException ↔ Numerische Codes) — ✅ ERLEDIGT
**Aufwand:** ~2-3 Stunden | **Prio:** KRITISCH — Basis fuer alles Weitere | **Status:** IMPLEMENTIERT (2026-03-01)

**Konzept:** GodKaiserException bekommt ein optionales `numeric_code: int` Attribut. Der `exception_handler` schreibt diesen Code in die JSON-Response UND in den AuditLog. Keine Breaking Changes — bestehende Exceptions ohne numeric_code funktionieren weiterhin mit ihrem String-Code.

**1.1 GodKaiserException erweitern (exceptions.py)**

```python
class GodKaiserException(Exception):
    def __init__(
        self,
        message: str,
        error_code: str = "INTERNAL_ERROR",
        numeric_code: int | None = None,  # NEU
        status_code: int = 500,
        details: dict | None = None,
    ):
        self.message = message
        self.error_code = error_code
        self.numeric_code = numeric_code  # NEU
        self.status_code = status_code
        self.details = details or {}
        super().__init__(message)
```

**1.2 Bestehende Exceptions verknuepfen (exceptions.py)**

Die 7 Exceptions die bereits numerische Pendants haben:

| Exception | String-Code | Numerischer Code |
|-----------|------------|------------------|
| `DatabaseConnectionException` | "DB_CONNECTION_FAILED" | 5304 |
| `MQTTConnectionException` | "MQTT_CONNECTION_FAILED" | 5104 |
| `MQTTPublishException` | "MQTT_PUBLISH_FAILED" | 5101 |
| `ESP32NotFoundException` | "ESP_NOT_FOUND" | 5001 |
| `ESP32OfflineException` | "ESP32_OFFLINE" | 5007 |
| `DuplicateError` | "DUPLICATE" | 5208 |
| `ConfigurationException` | "CONFIGURATION_ERROR" | 5002 |

```python
class ESP32NotFoundException(NotFoundError):
    def __init__(self, esp_id: str, details: dict | None = None):
        super().__init__(
            message=f"ESP32 device '{esp_id}' not found",
            error_code="ESP_NOT_FOUND",
            numeric_code=5001,  # NEU — verknuepft mit ServerErrorCode.ESP_DEVICE_NOT_FOUND
            details=details,
        )
```

**1.3 Exception Handler erweitern (exception_handlers.py)**

```python
async def automation_one_exception_handler(request, exc: GodKaiserException):
    response_body = {
        "success": False,
        "error": {
            "code": exc.error_code,           # String (Rueckwaertskompatibel)
            "numeric_code": exc.numeric_code,  # NEU (int oder null)
            "message": exc.message,
            "details": exc.details,
            "request_id": getattr(request.state, "request_id", None),
        }
    }

    # NEU: AuditLog-Eintrag wenn numeric_code vorhanden
    if exc.numeric_code:
        try:
            audit_repo.log_api_error(
                error_code=str(exc.numeric_code),
                severity=_map_status_to_severity(exc.status_code),
                message=exc.message,
                source_type="api",
                source_id=request.url.path,
                details={
                    "string_code": exc.error_code,
                    "status_code": exc.status_code,
                    "request_id": response_body["error"]["request_id"],
                    "method": request.method,
                    "path": request.url.path,
                },
            )
        except Exception:
            pass  # AuditLog-Fehler darf API-Response nicht blockieren

    return JSONResponse(status_code=exc.status_code, content=response_body)
```

**1.4 Severity-Mapping (HTTP Status → AuditLog Severity)**

```python
def _map_status_to_severity(status_code: int) -> str:
    if status_code >= 500:
        return "critical"
    if status_code == 429:
        return "warning"
    if status_code >= 400:
        return "error"
    return "info"
```

**Akzeptanzkriterien Block 1:**
- [x] GodKaiserException hat `numeric_code` Attribut (Optional[int]) — exceptions.py:25
- [x] 7 bestehende Exceptions tragen ihre numerischen Codes — verifiziert
- [x] Exception Handler schreibt `numeric_code` in JSON-Response — exception_handlers.py:69
- [x] Exception Handler loggt Fehler mit numeric_code in AuditLog — ✅ IMPLEMENTIERT (2026-03-02): `_log_to_audit()` fire-and-forget mit standalone DB-Session, `AuditEventType.API_ERROR`, `AuditLogRepository.log_api_error()`
- [x] Bestehende Exceptions ohne numeric_code funktionieren unveraendert
- [ ] Alle 810+ Backend-Tests bestehen — **NICHT VERIFIZIERT**

---

### Block 2: Fehlende Enrichment-Eintraege (esp32_error_mapping.py) — ✅ ERLEDIGT
**Aufwand:** ~1-2 Stunden | **Prio:** HOCH — aktive Codes ohne Troubleshooting | **Status:** IMPLEMENTIERT (2026-03-01)

**2.1 I2C Extended Codes (7 Eintraege)**

| Code | Name | Category | Severity | Troubleshooting |
|------|------|----------|----------|-----------------|
| 1007 | I2C_TIMEOUT | HARDWARE | ERROR | I2C-Bus blockiert: 1) Kabelpruefung (SDA/SCL), 2) Pull-Up-Widerstaende (4.7kOhm), 3) Nur ein Master, 4) Bus-Reset |
| 1009 | I2C_CRC_FAILED | HARDWARE | WARNING | CRC-Fehler: 1) Kabellaenge <50cm, 2) Abschirmung, 3) Stoerquellen entfernen, 4) Versorgungsspannung pruefen |
| 1015 | I2C_BUS_STUCK | HARDWARE | CRITICAL | Bus blockiert: 1) SDA/SCL pruefen, 2) ESP32 neustarten, 3) Sensor-Power-Cycle, 4) Clock-Stretching-Problem |
| 1016 | I2C_BUS_RECOVERY_STARTED | HARDWARE | WARNING | Automatische Recovery gestartet — keine Aktion noetig, System versucht Selbstheilung |
| 1017 | I2C_BUS_RECOVERY_FAILED | HARDWARE | CRITICAL | Recovery fehlgeschlagen: 1) ESP32 neustarten, 2) Sensor abklemmen + neu anschliessen, 3) I2C-Adresse pruefen |
| 1018 | I2C_BUS_RECOVERED | HARDWARE | WARNING | Bus erfolgreich wiederhergestellt — informativ, keine Aktion noetig |
| 1019 | I2C_PROTOCOL_UNSUPPORTED | HARDWARE | ERROR | Protokoll nicht unterstuetzt: 1) Sensor-Datenblatt pruefen, 2) I2C-Standard-Modus verwenden, 3) Alternative Library |

**2.2 DS18B20 Codes (4 Eintraege)**

| Code | Name | Category | Severity | Troubleshooting |
|------|------|----------|----------|-----------------|
| 1060 | DS18B20_SENSOR_FAULT | HARDWARE | ERROR | Sensor-Fehler: 1) 4.7kOhm Pull-Up an DQ, 2) Versorgung 3.3V pruefen, 3) Kabel-Kontakt, 4) Sensor tauschen |
| 1061 | DS18B20_POWER_ON_RESET | HARDWARE | WARNING | Power-On-Reset erkannt: 1) Versorgungsspannung stabil?, 2) Parasitaer-Modus vs. 3-Wire, 3) Entkopplungskondensator |
| 1062 | DS18B20_OUT_OF_RANGE | HARDWARE | WARNING | Messwert ausserhalb -55..+125°C: 1) Sensor-Umgebung pruefen, 2) Kalibrierung, 3) Kurzschluss an DQ-Leitung |
| 1063 | DS18B20_DISCONNECTED_RUNTIME | HARDWARE | ERROR | Sensor im Betrieb getrennt: 1) Stecker/Kabel pruefen, 2) OneWire-Bus Laenge <5m, 3) Pull-Up vorhanden |

**Implementierung:** Fuer jeden Code einen Eintrag im `ESP32_ERROR_MAPPING` Dict in `esp32_error_mapping.py` analog zum bestehenden Pattern mit:
- `category`, `severity`, `message_de`, `message_user_de`, `troubleshooting_de` (Liste), `docs_link`, `recoverable`, `user_action_required`

**Akzeptanzkriterien Block 2:**
- [x] Alle 11 Codes in esp32_error_mapping.py eingetragen — verifiziert (1007,1009,1015-1019,1060-1063)
- [x] `get_error_info()` gibt fuer alle 11 Codes ein gueltiges Dict zurueck
- [x] Coverage: 108/108 definierte ESP32-Codes gemappt (100%)
- [x] Troubleshooting-Texte sind praxistauglich (Hardware-Test-Erfahrung einbeziehen)
- [ ] Docs-Links zeigen auf existierende Doku-Seiten — **NICHT VERIFIZIERT**

---

### Block 3: Server Error-Code-Ranges fuer neue Features (error_codes.py) — ✅ ERLEDIGT
**Aufwand:** ~1 Stunde | **Prio:** MITTEL — Konsistenz fuer wachsende Codebase | **Status:** IMPLEMENTIERT (2026-03-01)

**3.1 Neue Error-Code-Ranges definieren**

Aktuell belegt: 5000-5699 (Server-Codes). Freier Bereich: 5700-5999.

| Range | Feature | Beispiel-Codes |
|-------|---------|---------------|
| 5700-5749 | Logic Engine | 5700 RULE_NOT_FOUND, 5701 RULE_VALIDATION_FAILED, 5702 RULE_EXECUTION_FAILED, 5703 RULE_LOOP_DETECTED, 5704 RULE_CONDITION_INVALID, 5705 RULE_ACTION_FAILED |
| 5750-5779 | Dashboard | 5750 DASHBOARD_NOT_FOUND, 5751 DASHBOARD_LAYOUT_INVALID, 5752 WIDGET_TYPE_UNKNOWN, 5753 WIDGET_CONFIG_INVALID |
| 5780-5799 | Subzones | 5780 SUBZONE_NOT_FOUND, 5781 SUBZONE_PARENT_INVALID, 5782 SUBZONE_GPIO_CONFLICT |
| 5800-5849 | AutoOps | 5800 AUTOOPS_JOB_FAILED, 5801 AUTOOPS_SCHEDULE_INVALID |
| 5850-5899 | Sequences | 5850 SEQUENCE_NOT_FOUND, 5851 SEQUENCE_STEP_FAILED, 5852 SEQUENCE_TIMEOUT |
| 5900-5999 | Reserviert | Zukuenftige Features |

**3.2 Enum-Klassen erweitern (error_codes.py)**

Neue Enum-Klassen analog zu `ServerErrorCode`:

```python
class LogicErrorCode(IntEnum):
    RULE_NOT_FOUND = 5700
    RULE_VALIDATION_FAILED = 5701
    RULE_EXECUTION_FAILED = 5702
    RULE_LOOP_DETECTED = 5703
    RULE_CONDITION_INVALID = 5704
    RULE_ACTION_FAILED = 5705

class DashboardErrorCode(IntEnum):
    DASHBOARD_NOT_FOUND = 5750
    DASHBOARD_LAYOUT_INVALID = 5751
    WIDGET_TYPE_UNKNOWN = 5752
    WIDGET_CONFIG_INVALID = 5753

class SubzoneErrorCode(IntEnum):
    SUBZONE_NOT_FOUND = 5780
    SUBZONE_PARENT_INVALID = 5781
    SUBZONE_GPIO_CONFLICT = 5782
```

**3.3 Descriptions erweitern (SERVER_ERROR_DESCRIPTIONS)**

Zu jedem neuen Code eine englische Beschreibung.

**Akzeptanzkriterien Block 3:**
- [x] Neue Enum-Klassen in error_codes.py definiert — LogicErrorCode, DashboardErrorCode, SubzoneErrorCode, AutoOpsErrorCode
- [x] Descriptions fuer alle neuen Codes vorhanden — SERVER_ERROR_DESCRIPTIONS erweitert
- [x] Keine Ueberlappungen mit bestehenden Ranges — verifiziert
- [x] Kommentierte Range-Uebersicht am Anfang der Datei — Docstring aktualisiert

---

### Block 4: REST-API schrittweise migrieren (14 API-Dateien) — ✅ ERLEDIGT
**Aufwand:** ~3-4 Stunden | **Prio:** MITTEL — inkrementell, nicht auf einmal | **Status:** 11 Dateien migriert (0 HTTPExceptions), 4 Dateien bewusst HTTPException (debug=59, audit=14, sensor_type_defaults=5, errors=4 = 82 bewusst)

**Strategie:** NICHT alle 185 HTTPExceptions auf einmal umstellen. Stattdessen:

1. **Neue Exceptions erstellen** wo noetig (z.B. `RuleNotFoundException`, `DashboardNotFoundException`)
2. **Pro API-Datei migrieren** — eine Datei pro PR/Commit
3. **HTTPException als Fallback behalten** fuer reine HTTP-Semantik (z.B. 401 Unauthorized bleibt HTTPException)

**4.1 Migrationsmuster**

Vorher:
```python
raise HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail=f"Rule '{rule_id}' not found",
)
```

Nachher:
```python
raise RuleNotFoundException(rule_id=rule_id)
```

Wobei:
```python
class RuleNotFoundException(NotFoundError):
    def __init__(self, rule_id: str):
        super().__init__(
            message=f"Logic rule '{rule_id}' not found",
            error_code="RULE_NOT_FOUND",
            numeric_code=5700,
        )
```

**4.2 Migrationsreihenfolge (nach Impact)**

| Reihenfolge | API-Datei | HTTPExceptions | Neue Exceptions noetig |
|-------------|-----------|----------------|----------------------|
| 1 | `api/v1/esp.py` | ~~14~~ 0 | ✅ ERLEDIGT — ESPNotFoundError, DuplicateESPError, ValidationException |
| 2 | `api/v1/sensors.py` | ~~29~~ ~~7~~ 0 | ✅ ERLEDIGT — DeviceNotApprovedError, GpioConflictError, GatewayTimeoutError, SensorProcessingException, ConfigurationException |
| 3 | `api/v1/actuators.py` | ~~15~~ ~~2~~ 0 | ✅ ERLEDIGT — DeviceNotApprovedError, GpioConflictError |
| 4 | `api/v1/logic.py` | ~~7~~ 0 | ✅ ERLEDIGT — RuleNotFoundException, RuleValidationException |
| 5 | `api/v1/auth.py` | ~~13~~ 0 | ✅ ERLEDIGT — InvalidCredentialsException, TokenExpiredException, AuthenticationError, AuthorizationError, DuplicateError, ConfigurationException, ServiceUnavailableError |
| 6 | `api/v1/subzone.py` | ~~7~~ 0 | ✅ ERLEDIGT (bereits migriert) — ESPNotFoundError, SubzoneNotFoundException, ValidationException |
| 7 | `api/v1/sequences.py` | ~~8~~ 0 | ✅ ERLEDIGT — SequenceNotFoundException, ServiceUnavailableError, ValidationException |
| 8 | `api/v1/users.py` | ~~9~~ 0 | ✅ ERLEDIGT — UserNotFoundException, DuplicateError, ValidationException, AuthenticationError |
| 9 | `api/v1/audit.py` | 14 | Bleiben HTTPException (reine Query-Fehler) |
| 10 | `api/v1/zone.py` | ~~3~~ 0 | ✅ ERLEDIGT — ESPNotFoundError |
| 11 | `api/v1/dashboards.py` | ~~3~~ 0 | ✅ ERLEDIGT — DashboardNotFoundException(5750) |
| 12 | `api/v1/sensor_type_defaults.py` | 5 | Bleiben HTTPException |
| 13 | `api/v1/errors.py` | 4 | Bleiben HTTPException |
| 14 | `api/v1/debug.py` | 59 | Bleiben HTTPException (Debug-Endpoints) |

**Was NICHT migriert wird (bewusst):**
- `debug.py` — 58 HTTPExceptions sind Debug-Tools, die bleiben generisch
- `audit.py` — Query-Fehler, kein fachlicher Error-Code noetig
- `sensor_type_defaults.py` — 4 einfache Validierungen
- `errors.py` — Meta-Endpoint fuer Error-Codes selbst
- Reine 401/403 Unauthorized/Forbidden — bleiben HTTP-Semantik

**Effektiver Scope:** Alle fachlichen API-Dateien migriert (11 von 14). 82 HTTPExceptions verbleiben bewusst in 4 Utility-Dateien (debug=59, audit=14, sensor_type_defaults=5, errors=4).

**Akzeptanzkriterien Block 4:**
- [x] Mindestens die ersten 4 API-Dateien (esp, sensors, actuators, logic) migriert — esp.py ✅, logic.py ✅, sensors.py ✅ (0 verbleibend), actuators.py ✅ (0 verbleibend)
- [x] Neue Exception-Klassen tragen numeric_code — RuleNotFoundException=5700, RuleValidationException=5701, SubzoneNotFoundException=5780
- [x] JSON-Response enthaelt sowohl string_code als auch numeric_code — exception_handlers.py:66-69
- [x] Bestehende API-Clients brechen nicht (string_code bleibt erhalten)
- [ ] Tests fuer migrierte Endpoints angepasst — **NICHT VERIFIZIERT**
- [x] sensors.py und actuators.py vollstaendig migriert — 3 neue Exceptions: DeviceNotApprovedError(5403), GpioConflictError(5209), GatewayTimeoutError(5504)
- [x] auth.py migriert (13→0) — InvalidCredentialsException, TokenExpiredException, AuthenticationError, AuthorizationError, DuplicateError, ConfigurationException, ServiceUnavailableError
- [x] subzone.py bereits migriert (0 HTTPExceptions) — ESPNotFoundError, SubzoneNotFoundException(5780), ValidationException
- [x] sequences.py migriert (8→0) — SequenceNotFoundException(5611), ServiceUnavailableError, ValidationException
- [x] users.py migriert (9→0) — UserNotFoundException, DuplicateError(5208), ValidationException, AuthenticationError
- [x] zone.py migriert (3→0) — ESPNotFoundError(5001)
- [x] dashboards.py migriert (3→0) — DashboardNotFoundException(5750)

---

### Block 5: Frontend Error-Handling vereinheitlichen — ❌ NICHT GESTARTET
**Aufwand:** ~1-2 Stunden | **Prio:** NIEDRIG — Folgearbeit nach Block 1-4 | **Status:** OFFEN

**5.1 REST-Error-Response parsen**

Neues Utility in `src/api/` oder `src/utils/`:

```typescript
interface StructuredApiError {
  code: string;           // String-Code (z.B. "ESP_NOT_FOUND")
  numericCode: number | null;  // Numerischer Code (z.B. 5001)
  message: string;
  details: Record<string, unknown>;
  requestId: string | null;
}

function parseApiError(error: AxiosError): StructuredApiError {
  const data = error.response?.data?.error;
  return {
    code: data?.code ?? 'UNKNOWN',
    numericCode: data?.numeric_code ?? null,
    message: data?.message ?? error.message,
    details: data?.details ?? {},
    requestId: data?.request_id ?? null,
  };
}
```

**5.2 ErrorDetailsModal fuer REST-Errors**

`ErrorDetailsModal.vue` kann REST-Errors anzeigen wenn `numericCode` vorhanden — dasselbe Modal wie fuer WebSocket-Errors. Troubleshooting-Hinweise kommen dann ueber den bestehenden REST-Endpoint `/v1/errors/codes/{code}`.

**5.3 Entscheidung translateErrorCode()**

`src/api/errors.ts` mit `translateErrorCode()` — BEHALTEN fuer spaetere History-View. Nicht als toten Code entfernen, sondern mit `// TODO: Used by planned History-View feature` markieren.
**IST-Stand:** `translateErrorCode()` wird aktuell NIRGENDS importiert (nur Selbstreferenz in errors.ts). Toter Code.

**Akzeptanzkriterien Block 5:**
- [ ] `parseApiError()` Utility existiert und wird in API-Interceptor genutzt
- [ ] ErrorDetailsModal zeigt REST-Errors mit numeric_code an
- [ ] translateErrorCode() mit TODO-Kommentar versehen
- [ ] 1339 Frontend-Tests bestehen

---

### Block 6: Prometheus-Metriken erweitern (Optional) — ❌ NICHT GESTARTET
**Aufwand:** ~30 Minuten | **Prio:** NIEDRIG — Nice-to-Have fuer Grafana | **Status:** OFFEN

**6.1 Generisches Error-Counting**

```python
# Neben increment_esp_error():
def increment_api_error(endpoint: str, error_code: int, method: str):
    """Zaehlt API-Fehler nach Endpoint und Error-Code."""
    api_error_counter.labels(
        endpoint=endpoint,
        error_code=str(error_code),
        method=method,
    ).inc()
```

**6.2 Grafana Dashboard**

Neues Panel "API Errors by Code" im bestehenden Server-Health-Dashboard:
- Top-10 Error-Codes (Rate/5m)
- Error-Rate nach Endpoint
- Trend ueber 24h

**Akzeptanzkriterien Block 6:**
- [ ] `increment_api_error()` Funktion existiert
- [ ] Exception Handler ruft increment_api_error() auf
- [ ] Grafana-Dashboard zeigt API-Error-Metriken

---

### Block 7: Dead-Code-Dokumentation + Cleanup — ❌ NICHT GESTARTET
**Aufwand:** ~1 Stunde | **Prio:** NIEDRIG — Wartbarkeit | **Status:** OFFEN

**7.1 Dead-Code-Register erstellen**

Neue Datei `.claude/reference/errors/DEAD_CODES.md` mit:
- Alle ~45 toten ESP32-Codes + Grund warum sie nicht verwendet werden
- Alle ~18 toten Server-Codes + Grund
- Markierung: "Reserviert fuer zukuenftige Features" vs. "Kann entfernt werden"

**7.2 Entscheidung pro Code-Gruppe:**

| Gruppe | Empfehlung | Grund |
|--------|-----------|-------|
| GPIO (1003/1005/1006) | Behalten (reserviert) | Koennte bei erweiterten GPIO-Treibern gebraucht werden |
| NVS (2001-2005) | Behalten (reserviert) | NVS-Fehlerbehandlung koennte spaeter erweitert werden |
| Storage (2030-2032) | Entfernen | Kein Storage-Manager geplant |
| Subzone ESP32 (2500-2504) | Entfernen auf ESP32 | Subzone-Validierung laeuft nur auf Server |
| Logger (2020-2021) | Entfernen | Logger kann eigene Fehler nicht loggen — by design |
| Network (3030-3031) | Behalten (reserviert) | Koennte bei erweiterten Netzwerk-Features gebraucht werden |

**Akzeptanzkriterien Block 7:**
- [ ] DEAD_CODES.md erstellt mit allen toten Codes + Status
- [ ] Codes die "Entfernen" markiert sind: Aus error_codes.h und error_codes.py entfernt
- [ ] Kommentar "RESERVED" fuer beibehaltene tote Codes

---

### Gesamtreihenfolge und Abhaengigkeiten

```
Block 2 (Enrichment)          Block 7 (Dead-Code)
   │ (unabhaengig)                │ (unabhaengig)
   ▼                              ▼
   SOFORT                         NIEDRIG

Block 1 (Exception-Bridge)
   │
   ▼
Block 3 (Neue Ranges)
   │
   ▼
Block 4 (API-Migration)     Block 6 (Prometheus)
   │                            │ (unabhaengig)
   ▼                            ▼
Block 5 (Frontend)           NIEDRIG
```

**Empfohlene Session-Aufteilung (aktualisiert):**

| Session | Bloecke | Status |
|---------|---------|--------|
| ~~Session 1~~ | ~~Block 1 + Block 2~~ | ✅ ERLEDIGT |
| ~~Session 2~~ | ~~Block 3 + Block 4 (Dateien 1-4)~~ | ✅ ERLEDIGT (Block 3 komplett, Block 4 teilweise) |
| ~~Session 3~~ | ~~Block 4 Rest + Block 1.3 AuditLog Fix~~ | ✅ ERLEDIGT (2026-03-02): auth, sequences, users, zone, dashboards migriert. AuditLog-Integration implementiert |
| **Session 4 (NAECHSTE)** | Block 5 (Frontend) + Block 6 (Prometheus) + Block 7 (Dead-Code) | **OFFEN** |

**Verbleibend:** ~3-4 Stunden (1 Session)

---

### Akzeptanzkriterien (Gesamt) — Stand 2026-03-01

- [x] Jeder fachliche Fehler im System traegt einen numerischen Error-Code — ✅ MQTT + REST-API migriert (82 HTTPExceptions verbleiben in 4 Dateien — bewusst: debug, audit, sensor_type_defaults, errors)
- [x] GodKaiserException ↔ Numerische Codes verknuepft (Bridge) — ✅ Block 1
- [x] 108/108 ESP32-Codes mit Enrichment in esp32_error_mapping.py (100%) — ✅ Block 2
- [x] REST-API-Fehler erscheinen im AuditLog mit numerischem Code — ✅ IMPLEMENTIERT (2026-03-02): `_log_to_audit()` in exception_handlers.py
- [ ] Frontend zeigt strukturierte Fehlermeldungen fuer REST-Errors — **OFFEN: Block 5**
- [x] Neue Error-Code-Ranges fuer Logic/Dashboard/Subzones definiert — ✅ Block 3
- [ ] Keine Test-Regressionen (810+ Backend + 1339 Frontend) — **NICHT VERIFIZIERT**
- [ ] Dead-Code dokumentiert und bereinigt — **OFFEN: Block 7**
- [x] Error-Code-System bereit fuer KI-Error-Analyse Integration (Ebene 1) — ✅ Backend komplett (Block 1-4), Frontend-Anzeige (Block 5) und Monitoring (Block 6) ausstehend

---

### Referenzen

**Life-Repo:**
- `arbeitsbereiche/automation-one/STATUS.md` — Aktueller Stand (95% alle Schichten)
- `arbeitsbereiche/automation-one/architektur-uebersicht.md` — 3-Schichten-Architektur
- `arbeitsbereiche/automation-one/roadmap.md` — KI-Inferenz in mittelfristiger Roadmap
- `wissen/iot-automation/ki-error-analyse-iot.md` — 4-Ebenen KI-Error-Analyse-Strategie
- `wissen/iot-automation/grafana-prometheus-iot-monitoring.md` — Monitoring Best Practices

**Ziel-Repo (auto-one):**
- `god_kaiser_server/src/core/error_codes.py` — Enum-Definitionen
- `god_kaiser_server/src/core/exceptions.py` — GodKaiserException-Hierarchie
- `god_kaiser_server/src/core/exception_handlers.py` — HTTP Exception Handler
- `god_kaiser_server/src/core/esp32_error_mapping.py` — Error Enrichment (97 Codes)
- `god_kaiser_server/src/mqtt/handlers/error_handler.py` — MQTT Error Handler
- `god_kaiser_server/src/db/models/audit_log.py` — AuditLog Model
- `god_kaiser_server/src/api/v1/*.py` — 14 API-Dateien
- `El Frontend/src/api/errors.ts` — translateErrorCode()
- `El Frontend/src/components/error/ErrorDetailsModal.vue` — Error-Detail-Modal
- `El Trabajante/src/models/error_codes.h` — ESP32 Error-Code-Definitionen
- `.claude/reference/errors/ERROR_CODES.md` — Agent-Referenz v1.1

---

### Offene Punkte

- **AuditLog error_code Typ:** ✅ ENTSCHIEDEN: String beibehalten. `log_api_error()` schreibt `str(numeric_code)` wenn vorhanden, sonst `error_code` String. Kompatibel mit bestehenden String-Codes.
- **Error-Response Versionierung:** Soll `numeric_code` in einem separaten API-Response-Schema (v2) leben oder direkt in v1 ergaenzt werden? Empfehlung: Direkt in v1 als optionales Feld — kein Breaking Change.
- **Debug-Endpoints (debug.py, 58 HTTPExceptions):** Sollen diese jemals Error-Codes bekommen? Empfehlung: Nein — Debug-Tools sind per Definition unkritisch und temporaer.
- **Tote ESP32-Codes (2500-2504 Subzone):** Aus Firmware entfernen oder als Server-only-Codes behalten? Empfehlung: Aus error_codes.h entfernen, in error_codes.py behalten (Server braucht sie).
- **Frontend Error-Boundary:** Soll ein globaler Vue Error-Boundary REST-API-Fehler abfangen und ueber ErrorDetailsModal anzeigen? Oder bleibt das per-Komponente? Empfehlung: Globaler Interceptor in Axios-Instance mit opt-out pro Endpoint.
