## Auftrag: Error-Code-System — Aktualisierte Implementierung (STEP 4)

**Ziel-Repo:** auto-one
**Kontext:** STEP 2 Bestandsaufnahme hat 6 kritische Abweichungen vom urspruenglichen Auftrag (`auftrag-error-code-system-ausbau.md`) entdeckt. Dieser Auftrag ersetzt und korrigiert Block 1-7 des alten Auftrags basierend auf dem tatsaechlichen IST-Zustand. Der alte Auftrag dient nur noch als historische Referenz.
**Bezug:** Fahrplan nach Phase 4A — STEP 4 (vor Phase 4B: Unified Alert Center). Laeuft parallel zu STEP 3 (4 Prerequisites) ohne gegenseitige Blockierung.
**Prioritaet:** Hoch
**Datum:** 2026-03-02

---

### Hintergrund: 6 Abweichungen die den Auftrag aendern

Der urspruengliche Auftrag (`auftrag-error-code-system-ausbau.md`) basierte auf Schaetzungen ohne Code-Analyse. Die STEP 2 Bestandsaufnahme hat den tatsaechlichen Zustand ermittelt. Diese 6 Abweichungen aendern Scope und Reihenfolge fundamental:

| # | Annahme im alten Auftrag | Realitaet (STEP 2) | Konsequenz fuer Implementierung |
|---|--------------------------|--------------------|---------------------------------|
| 1 | ~108 ESP32 Codes | 111 Production (1000-4999) + 12 Test (6000-6099) = 123 | Enrichment-Ziel: 111/111, nicht 108/108 |
| 2 | 97/108 Enrichment (90%) | 111/111 = 100% Coverage | Block 3 (Enrichment) betrifft NUR Server-Codes, nicht ESP32 |
| 3 | GodKaiserException hat KEIN numeric_code | HAT numeric_code als keyword-only Parameter | Block 1 (Exception-Bridge) ist deutlich einfacher |
| 4 | REST-Errors NICHT in AuditLog | WERDEN bereits geschrieben (via exception_handler wenn numeric_code gesetzt) | Block 5 ist teilweise vorhanden — nur Luecken schliessen |
| 5 | 0 GodKaiserException in 14 API-Dateien | 0 GodKaiserException in 22 API-Dateien, ABER: ~126 GodKaiserException raises in 10+ API-Dateien bereits vorhanden | Nur 5 Dateien ohne jede Exception-Behandlung zu migrieren |
| 6 | 0 Prometheus Error-Counter | 2 Counter vorhanden: ESP_ERRORS_TOTAL (esp_id) + HTTP_ERRORS_TOTAL (status_class 4xx/5xx) | Block 6 reduziert sich auf per-Error-Code Counter |

**Kritische Implikation aus Abweichung 3:** Der alte Block 1 hat fast seine gesamte Arbeit bereits erledigt. Das ist der groesste Zeitgewinn: ~2h statt ~2-3h fuer die Exception-Bridge.

**Kritische Implikation aus Abweichung 5:** Die Zahl "~126 GodKaiserException raises in 10+ API-Dateien" bedeutet: Der Grossteil der API-Dateien nutzt BEREITS GodKaiserException fuer fachliche Fehler. Der Migrationsaufwand ist nicht "14 Dateien von Null" sondern "5 Dateien nachholen + numeric_code bei bestehenden 22 Klassen ergaenzen".

---

### Ist-Zustand (Stand STEP 2 Bericht)

**Was bereits funktioniert:**
- ESP32 Enrichment: 111/111 Codes (100%) in `esp32_error_mapping.py` — KEINE Luecke
- GodKaiserException: HAT BEREITS `numeric_code` als keyword-only Parameter
- Exception Handler: Schreibt BEREITS `numeric_code` in JSON-Response + AuditLog (wenn numeric_code gesetzt)
- AuditLog: `error_code` Feld String(50) vorhanden, REST-Errors werden befuellt WENN Exception numeric_code traegt
- Prometheus: ESP_ERRORS_TOTAL (esp_id Label) + HTTP_ERRORS_TOTAL (status_class 4xx/5xx) vorhanden
- GodKaiserException in API: ~126 Raises in 10+ Dateien (esp.py, sensors.py, actuators.py, auth.py, logic.py, etc.)
- 16 Exception-Klassen MIT numeric_code (ESP32NotFoundException, DatabaseConnection, MQTT, etc.)
- Belegte Server-Ranges: 5001-5801 in 11 IntEnum-Klassen (Config, MQTT, Validation, Database, Service, Audit, Sequence, Logic, Dashboard, Subzone, AutoOps)

**Was fehlt (tatsaechliche Luecken):**
- ~22 Exception-Klassen OHNE numeric_code (Auth-Bereich, Sensor-Bereich, etc.)
- Server-Error-Enrichment FEHLT komplett — Server hat nur String-Descriptions, kein Rich-Format (message_user_de, troubleshooting_de, docs_link)
- 5 API-Dateien ohne jede Exception-Behandlung: debug.py (58 HTTPException), audit.py (13), notifications.py (6), sensor_type_defaults.py (4), errors.py (2)
- Phase 4A Notification-Services: 0 Error-Codes in notification_router.py / email_service.py / digest_service.py / alert_suppression_service.py / webhooks.py
- Vorgeschlagene Notification-Range 5850-5899 noch nicht definiert
- `translateErrorCode()` in `El Frontend/src/api/errors.ts` ist toter Code (0 Imports)
- Per-Error-Code Counter fuer GodKaiserException in Prometheus fehlt
- Freie Ranges 5700-5849 (Logic, Dashboard, Subzones) noch nicht vollstaendig genutzt

**Position im Plan:** STEP 4 im Fahrplan nach Phase 4A. Voraussetzung fuer Phase 4B (Unified Alert Center) — 4B zeigt Fehler aus allen Quellen und benoetigt vollstaendige Error-Code-Abdeckung.

---

### Was getan werden muss

Das Error-Code-System soll von "funktioniert fuer MQTT und die meisten API-Pfade" zu "funktioniert lueckenlos ueberall" ausgebaut werden. Nach Abschluss traegt jeder Fehler — egal aus welcher Schicht — einen numerischen Code, der in AuditLog, Prometheus und Frontend einheitlich verarbeitet wird. Das ist die direkte Voraussetzung fuer Phase 4B (Alert Center) und langfristig fuer KI-Error-Analyse Ebene 1-2.

**Erwartetes Ergebnis:**
- Alle ~22 Exception-Klassen ohne numeric_code sind nachgezogen
- Server-Codes haben dasselbe Rich-Enrichment-Format wie ESP32-Codes
- Phase 4A Notification-Bereich hat eigene Error-Code-Range (5850-5899)
- `translateErrorCode()` wird aktiv genutzt statt toter Code zu sein
- Prometheus zaehlt Fehler per numerischem Error-Code (nicht nur HTTP-Status-Klasse)
- Keine Test-Regressionen (aktueller Stand: 790 Backend-Tests, 1339 Frontend-Tests)

**Abhaengigkeiten:**
- Keine harten Blocker — alle Aenderungen sind inkrementell addierend
- Parallele STEP 3 Auftraege (Logging, Loki, Logic-Engine-Test, Mock-Trockentest) laufen unabhaengig
- Phase 4A Tests (0 vorhanden) muessen SEPARAT angegangen werden — nicht Scope dieses Auftrags

---

### Technische Details

**Betroffene Schichten:**
- [x] Backend (El Servador) — Hauptarbeit
- [ ] Firmware (El Trabajante) — Keine Aenderungen noetig (ESP32 Enrichment 100% komplett)
- [x] Frontend (El Frontend) — Kleine Aktivierung (translateErrorCode)
- [ ] Monitoring (Grafana/Prometheus/Loki) — Optional in Block 5

**Betroffene Module:**

| Modul | Aenderungstyp | Block |
|-------|--------------|-------|
| `god_kaiser_server/src/core/error_codes.py` | Erweitern: Notification-Range 5850-5899 + evtl. Luecken | B1 |
| `god_kaiser_server/src/core/exceptions.py` | Ergaenzen: numeric_code bei ~22 Klassen ohne Code | B2 |
| `god_kaiser_server/src/api/v1/notifications.py` | Migrieren: 6 HTTPException → GodKaiserException | B6 |
| `god_kaiser_server/src/core/esp32_error_mapping.py` | Neues Muster: Server-Enrichment-Dict analog ESP32 | B3 |
| `El Frontend/src/api/errors.ts` | Aktivieren: translateErrorCode() importieren | B4 |
| `god_kaiser_server/src/core/metrics.py` | Erweitern: per-Code Counter fuer GodKaiserException | B5 |

**Vorhandene Infrastruktur die GENUTZT werden soll:**
- `GodKaiserException` mit bestehendem `numeric_code` Keyword-Parameter — NICHT neu erstellen
- `automation_one_exception_handler` — bereits registriert in main.py, schreibt numeric_code in Response + AuditLog
- `esp32_error_mapping.py` Pattern (8 Felder pro Eintrag) — als Vorlage fuer Server-Enrichment
- `ErrorDetailsModal.vue` + `TroubleshootingPanel.vue` — koennen REST-Errors anzeigen wenn numeric_code vorhanden
- Bestehende 16 Exception-Klassen MIT numeric_code als Vorlagen fuer die ~22 ohne Code

---

### Block 1: Error-Code-Ranges vervollstaendigen (error_codes.py)
**Aufwand:** ~45 Minuten | **Prio:** HOCH — Voraussetzung fuer Block 2 + Block 6

**Hintergrund:** STEP 2 hat gezeigt dass Ranges 5700-5849 noch nicht vollstaendig mit Codes belegt sind und die Notification-Range 5850-5899 noch nicht definiert ist. Die bestehenden 11 Enum-Klassen decken Config/MQTT/Validation/Database/Service/Audit/Sequence/Logic/Dashboard/Subzone/AutoOps ab — aber die Codes innerhalb dieser Klassen fuer Logic/Dashboard/Subzone sind evtl. lueckenhaft.

**1.1 Bestand pruefen und Luecken schliessen**

Zuerst pruefen welche Codes in den Klassen LogicErrorCode / DashboardErrorCode / SubzoneErrorCode / AutoOpsErrorCode bereits definiert sind. Dann ergaenzen was fehlt:

| Range | Klasse | Mindest-Codes |
|-------|--------|---------------|
| 5700-5749 | LogicErrorCode | RULE_NOT_FOUND (5700), RULE_VALIDATION_FAILED (5701), RULE_EXECUTION_FAILED (5702), RULE_LOOP_DETECTED (5703) |
| 5750-5779 | DashboardErrorCode | DASHBOARD_NOT_FOUND (5750), DASHBOARD_LAYOUT_INVALID (5751), WIDGET_TYPE_UNKNOWN (5752) |
| 5780-5799 | SubzoneErrorCode | SUBZONE_NOT_FOUND (5780), SUBZONE_PARENT_INVALID (5781) |
| 5800-5849 | AutoOpsErrorCode | AUTOOPS_JOB_FAILED (5800), AUTOOPS_SCHEDULE_INVALID (5801) |

**WICHTIG:** Vor dem Erstellen pruefen ob diese Klassen bereits existieren. STEP 2 Bericht sagt 11 Enum-Klassen existieren — Logic, Dashboard, Subzone, AutoOps sind dabei. Nur FEHLENDE Codes ergaenzen, nicht duplicieren.

**1.2 Notification-Range NEU definieren**

Die Phase 4A Services (notification_router, email_service, digest_service, alert_suppression, webhooks) haben aktuell 0 Error-Codes. Neue Enum-Klasse:

```python
class NotificationErrorCode(IntEnum):
    """Phase 4A Notification-System Error-Codes. Range: 5850-5899."""
    NOTIFICATION_NOT_FOUND = 5850
    NOTIFICATION_SEND_FAILED = 5851
    EMAIL_PROVIDER_UNAVAILABLE = 5852
    EMAIL_TEMPLATE_MISSING = 5853
    DIGEST_SCHEDULE_INVALID = 5854
    SUPPRESSION_CONFIG_INVALID = 5855
    SUPPRESSION_WINDOW_CONFLICT = 5856
    WEBHOOK_INVALID_PAYLOAD = 5857
    WEBHOOK_SIGNATURE_INVALID = 5858
    ALERT_PREFERENCE_NOT_FOUND = 5859
```

**1.3 SERVER_ERROR_DESCRIPTIONS ergaenzen**

Fuer alle neuen Codes je eine englische Beschreibung in `SERVER_ERROR_DESCRIPTIONS` (oder aequivalentes Dict falls anders benannt):

```python
NotificationErrorCode.NOTIFICATION_NOT_FOUND: "Notification with given ID not found",
NotificationErrorCode.NOTIFICATION_SEND_FAILED: "Failed to send notification via configured provider",
# ... etc.
```

**1.4 Range-Kommentar am Datei-Anfang aktualisieren**

Am Anfang von `error_codes.py` eine Kommentierte Range-Uebersicht aktualisieren/ergaenzen:

```python
# Error Code Ranges (Server-side):
# 5001-5099: General Server/ESP management
# 5100-5199: MQTT
# 5200-5299: Validation
# 5300-5399: Database
# 5400-5499: Service layer
# 5500-5599: Audit/Sequence
# 5600-5699: [pruefen was aktuell hier steht]
# 5700-5749: Logic Engine rules
# 5750-5779: Dashboard / Widgets
# 5780-5799: Subzones
# 5800-5849: AutoOps
# 5850-5899: Notifications (Phase 4A)
# 5900-5999: Reserved
```

**Akzeptanzkriterien Block 1:**
- [ ] Alle 10 NotificationErrorCode-Werte in error_codes.py definiert, Range 5850-5899
- [ ] SERVER_ERROR_DESCRIPTIONS hat Eintraege fuer alle neuen Notification-Codes
- [ ] Keine Ueberlappungen mit bestehenden Ranges (manuell pruefen)
- [ ] Range-Uebersicht-Kommentar am Dateianfang vollstaendig und korrekt
- [ ] 790 Backend-Tests bestehen (kein Enum-Import bricht)

---

### Block 2: numeric_code bei ~22 Exception-Klassen ergaenzen (exceptions.py)
**Aufwand:** ~1.5 Stunden | **Prio:** HOCH — schaltet AuditLog-Integration fuer alle Klassen frei

**Hintergrund:** GodKaiserException hat BEREITS `numeric_code` als keyword-only Parameter. 16 Exception-Klassen uebergeben diesen bereits korrekt. ~22 Klassen tun es nicht — sie rufen `super().__init__()` ohne `numeric_code`. Fuer diese Klassen wird der AuditLog-Eintrag NICHT geschrieben (exception_handler prueft `if exc.numeric_code`).

**2.1 Bestandsaufnahme (zuerst lesen, dann ergaenzen)**

Vor jeder Aenderung: exceptions.py vollstaendig lesen. Erstelle intern eine Liste aller Klassen die `numeric_code` noch nicht setzen. Erwartete Problemzonen:
- Auth-Bereich (InvalidTokenException, ExpiredTokenException, InsufficientPermissionsException, etc.)
- Sensor-Bereich (SensorNotFoundException, SensorConfigException, etc.)
- Weitere Service-Exceptions ohne direkte numerische Entsprechung

**2.2 Mapping Exception → Numerischer Code**

Fuer jede Exception-Klasse ohne numeric_code: Den passenden Code aus den bestehenden Enum-Klassen ermitteln. Wenn KEIN passender Code existiert: Entweder neuen Code in Block 1 ergaenzen oder Exception ohne Code lassen (mit Kommentar "// No specific error code — uses generic HTTP status").

Vorgehensweise je Klasse:

```python
# Vorher (ohne numeric_code):
class SensorNotFoundException(NotFoundError):
    def __init__(self, sensor_id: str):
        super().__init__(
            message=f"Sensor '{sensor_id}' not found",
            error_code="SENSOR_NOT_FOUND",
        )

# Nachher (mit numeric_code):
class SensorNotFoundException(NotFoundError):
    def __init__(self, sensor_id: str):
        super().__init__(
            message=f"Sensor '{sensor_id}' not found",
            error_code="SENSOR_NOT_FOUND",
            numeric_code=ServerErrorCode.SENSOR_NOT_FOUND,  # z.B. 5201 — konkreten Wert pruefen
        )
```

**2.3 Neue Exception-Klassen fuer Phase 4A**

Fuer die Notification-Phase 4A brauchen wir neue Exception-Klassen analog zu den bestehenden:

```python
class NotificationNotFoundException(NotFoundError):
    def __init__(self, notification_id: str):
        super().__init__(
            message=f"Notification '{notification_id}' not found",
            error_code="NOTIFICATION_NOT_FOUND",
            numeric_code=NotificationErrorCode.NOTIFICATION_NOT_FOUND,  # 5850
        )

class EmailSendException(ServiceException):
    def __init__(self, provider: str, reason: str):
        super().__init__(
            message=f"Email send failed via {provider}: {reason}",
            error_code="NOTIFICATION_SEND_FAILED",
            numeric_code=NotificationErrorCode.NOTIFICATION_SEND_FAILED,  # 5851
        )

class WebhookValidationException(ValidationError):
    def __init__(self, reason: str):
        super().__init__(
            message=f"Webhook payload invalid: {reason}",
            error_code="WEBHOOK_INVALID_PAYLOAD",
            numeric_code=NotificationErrorCode.WEBHOOK_INVALID_PAYLOAD,  # 5857
        )

class AlertPreferenceNotFoundException(NotFoundError):
    def __init__(self, esp_id: str):
        super().__init__(
            message=f"Alert preference for ESP '{esp_id}' not found",
            error_code="ALERT_PREFERENCE_NOT_FOUND",
            numeric_code=NotificationErrorCode.ALERT_PREFERENCE_NOT_FOUND,  # 5859
        )
```

**Welche Basisklassen fuer Phase 4A korrekt sind:** In exceptions.py lesen welche Basisklassen vorhanden sind (`NotFoundError`, `ValidationError`, `ServiceException`, etc.) und passend zuordnen.

**Akzeptanzkriterien Block 2:**
- [ ] Alle ~22 Exception-Klassen ohne numeric_code sind ergaenzt (oder bewusst ohne Code mit Kommentar)
- [ ] Jede neue Klasse nutzt einen konkreten IntEnum-Wert, kein hardcodierter int-Literal
- [ ] Mindestens 4 neue Phase 4A Exception-Klassen erstellt (NotificationNotFound, EmailSend, WebhookValidation, AlertPreferenceNotFound)
- [ ] 790 Backend-Tests bestehen

---

### Block 3: Server-Enrichment-Dict erstellen (neues Muster, kein ESP32-Change)
**Aufwand:** ~2 Stunden | **Prio:** MITTEL — Grundlage fuer Frontend-Troubleshooting bei Server-Fehlern

**Hintergrund:** ESP32 hat `esp32_error_mapping.py` mit 111 Rich-Enrichment-Eintraegen (8 Felder: category, severity, message_de, message_user_de, troubleshooting_de Liste, docs_link, recoverable, user_action_required). Server-Codes haben nur String-Descriptions. Block 3 erstellt ein analoges Dict fuer alle 76 aktiven Server-Codes.

**WICHTIG: ESP32-Enrichment (esp32_error_mapping.py) NICHT ANFASSEN — ist bereits 111/111 komplett.**

**3.1 Neue Datei erstellen: server_error_mapping.py**

Pfad: `god_kaiser_server/src/core/server_error_mapping.py`

Struktur analog zu `esp32_error_mapping.py`:

```python
"""
Server-side Error Code Enrichment — analogous to esp32_error_mapping.py

Maps ServerErrorCode (and related IntEnums) to rich metadata:
- category: Functional area
- severity: critical/error/warning/info
- message_de: Technical German message for logs
- message_user_de: User-friendly German message for UI
- troubleshooting_de: List of troubleshooting steps
- docs_link: Link to documentation (if available)
- recoverable: Whether the system can self-recover
- user_action_required: Whether user intervention is needed
"""

from .error_codes import (
    ServerErrorCode,
    LogicErrorCode,
    DashboardErrorCode,
    SubzoneErrorCode,
    AutoOpsErrorCode,
    NotificationErrorCode,
)

SERVER_ERROR_MAPPING: dict[int, dict] = {
    # General / ESP Management (5001-5099)
    5001: {
        "category": "DEVICE",
        "severity": "error",
        "message_de": "ESP32-Geraet nicht gefunden",
        "message_user_de": "Das Geraet wurde nicht gefunden. Bitte ID pruefen.",
        "troubleshooting_de": [
            "ESP-ID in der Datenbank pruefen (HardwareView)",
            "Geraet wurde moeglicherweise geloescht oder nie registriert",
            "Bei Neuzugang: Geraet zunaechst mit dem System verbinden",
        ],
        "docs_link": None,
        "recoverable": False,
        "user_action_required": True,
    },
    # ... weitere Codes
}

def get_server_error_info(code: int) -> dict | None:
    """Returns enrichment data for a server error code, or None if not found."""
    return SERVER_ERROR_MAPPING.get(code)
```

**3.2 Umfang:** Alle 76 aktiven Server-Codes PLUS alle neuen Notification-Codes aus Block 1. Priorisierung falls Zeit eng:
1. Phase 4A Notification-Codes (neu, brauchen sofort Enrichment)
2. Haeufig ausgeloeste Codes (404/404-artige: ESP_NOT_FOUND, SENSOR_NOT_FOUND, etc.)
3. Kritische Codes (DB-Fehler, MQTT-Fehler)
4. Restliche Codes

**3.3 Integration in errors.py API-Endpoint**

Der bestehende Endpoint `GET /v1/errors/codes/{code}` soll auch Server-Codes ausliefern. In `errors.py`:

```python
# Vorher (nur ESP32-Enrichment):
from ..core.esp32_error_mapping import get_error_info
info = get_error_info(code)

# Nachher (ESP32 + Server):
from ..core.esp32_error_mapping import get_error_info as get_esp32_error_info
from ..core.server_error_mapping import get_server_error_info

info = get_esp32_error_info(code) or get_server_error_info(code)
```

**Akzeptanzkriterien Block 3:**
- [ ] `server_error_mapping.py` existiert in `src/core/`
- [ ] Mindestens alle Phase 4A Notification-Codes (10 Stueck) haben Enrichment-Eintraege
- [ ] Mindestens 20 weitere Server-Codes haben Enrichment-Eintraege (haeufige Fehler zuerst)
- [ ] `get_server_error_info(5850)` gibt ein Dict zurueck (kein None)
- [ ] `GET /v1/errors/codes/5850` gibt Enrichment-Daten zurueck (nicht 404)
- [ ] `esp32_error_mapping.py` wurde NICHT veraendert

---

### Block 4: translateErrorCode() aktivieren (El Frontend)
**Aufwand:** ~30 Minuten | **Prio:** MITTEL — schaltet Frontend-Troubleshooting frei

**Hintergrund:** `El Frontend/src/api/errors.ts` hat `translateErrorCode()` definiert aber 0 Imports. `ErrorDetailsModal.vue` und `TroubleshootingPanel.vue` existieren bereits. Der API-Endpoint `/v1/errors/codes/{code}` liefert nach Block 3 auch Server-Code-Enrichment. Dieser Block verbindet die vorhandenen Teile.

**4.1 Axios-Interceptor ergaenzen (src/api/index.ts oder entsprechende Datei)**

Den bestehenden Response-Error-Interceptor um numeric_code-Extraktion erweitern:

```typescript
// In der bestehenden Axios-Instance Response-Interceptor:
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    // BESTEHENDE Logik beibehalten (Token-Refresh, etc.)
    // NEU: structured error info extrahieren
    const errorData = error.response?.data?.error;
    if (errorData?.numeric_code) {
      // Auf request.meta oder similar setzen fuer Komponenten die es brauchen
      (error as any).numericCode = errorData.numeric_code;
      (error as any).errorCode = errorData.code;
    }
    return Promise.reject(error);
  }
);
```

**4.2 translateErrorCode() importieren wo benoetigt**

Minimum: In `ErrorDetailsModal.vue` importieren und nutzen wenn `numericCode` prop gesetzt ist. Das Modal soll dann automatisch den `/v1/errors/codes/{code}` Endpoint aufrufen und Troubleshooting-Hinweise anzeigen.

**4.3 TODO-Kommentar bei translateErrorCode() entfernen oder aktualisieren**

Falls ein "TODO: Used by planned History-View" Kommentar existiert: auf "Used by ErrorDetailsModal.vue — see also History-View (planned)" aktualisieren.

**Akzeptanzkriterien Block 4:**
- [ ] `translateErrorCode()` wird in mindestens einer Komponente importiert und aufgerufen
- [ ] `ErrorDetailsModal.vue` zeigt Troubleshooting-Hinweise wenn numeric_code in Error-Response vorhanden
- [ ] 1339 Frontend-Tests bestehen
- [ ] `vue-tsc` (TypeScript-Check) laeuft fehlerfrei durch

---

### Block 5: Prometheus per-Code Counter (metrics.py)
**Aufwand:** ~30 Minuten | **Prio:** NIEDRIG — Nice-to-Have fuer Grafana

**Hintergrund:** ESP_ERRORS_TOTAL (esp_id Label) und HTTP_ERRORS_TOTAL (status_class 4xx/5xx) existieren bereits. Fuer die KI-Error-Analyse Ebene 1 (regelbasiert) waere ein Counter per numerischem Error-Code wertvoll: Welche konkreten Fehler passieren wie oft?

**5.1 Neuen Counter hinzufuegen**

In `god_kaiser_server/src/core/metrics.py`:

```python
# Neben den bestehenden Countern:
API_ERROR_CODE_COUNTER = Counter(
    "automation_one_api_error_code_total",
    "Total API errors by numeric error code",
    ["error_code", "source_type"],  # source_type: "api" | "service"
)

def increment_api_error_code(error_code: int, source_type: str = "api") -> None:
    """Increment counter for a specific numeric API error code."""
    API_ERROR_CODE_COUNTER.labels(
        error_code=str(error_code),
        source_type=source_type,
    ).inc()
```

**5.2 In exception_handler aufrufen**

In `exception_handlers.py` den bestehenden Handler ergaenzen:

```python
# Im automation_one_exception_handler, wo numeric_code bereits verarbeitet wird:
if exc.numeric_code:
    # Bestehende AuditLog-Schreibung...
    # NEU:
    try:
        increment_api_error_code(exc.numeric_code, source_type="api")
    except Exception:
        pass  # Metrik-Fehler darf Handler nicht blockieren
```

**Akzeptanzkriterien Block 5:**
- [ ] `API_ERROR_CODE_COUNTER` in metrics.py definiert
- [ ] `increment_api_error_code()` Funktion exportiert
- [ ] Exception Handler ruft `increment_api_error_code()` auf wenn `numeric_code` gesetzt
- [ ] Prometheus `/metrics` Endpoint zeigt `automation_one_api_error_code_total` nach erstem Fehler

---

### Block 6: Phase 4A API-Migration (notifications.py + webhooks.py)
**Aufwand:** ~1.5 Stunden | **Prio:** MITTEL — Konsistenz mit restlichem API-Layer

**Hintergrund:** Phase 4A hat `notifications.py` (6 HTTPException) und `webhooks.py` (0 Exceptions). Diese sind die einzigen kritischen Kandidaten fuer Migration — der Rest (debug.py 58, audit.py 13, sensor_type_defaults.py 4, errors.py 2) wird bewusst NICHT migriert (siehe unten).

**6.1 notifications.py (6 HTTPException → GodKaiserException)**

```python
# Beispiel-Migration in notifications.py:

# Vorher:
raise HTTPException(
    status_code=404,
    detail="Notification not found",
)

# Nachher (mit Exception aus Block 2):
raise NotificationNotFoundException(notification_id=notification_id)
```

Die 6 HTTPException-Raises in notifications.py identifizieren und passende Exception-Klassen aus Block 2 zuweisen.

**6.2 webhooks.py (Fehler-Handling ergaenzen)**

webhooks.py hat aktuell 0 Exceptions. Typische Fehlerszenarien ergaenzen:
- Ungueltige Grafana-Webhook-Payload → `WebhookValidationException`
- Ungueltige Webhook-Signatur (falls Signatur-Validierung existiert) → `WebhookValidationException`

**6.3 Was NICHT migriert wird (bewusste Entscheidung)**

| Datei | Begruendung |
|-------|------------|
| `debug.py` (58 HTTPException) | Debug-Endpoints sind per Definition temporaer und unkritisch |
| `audit.py` (13 HTTPException) | Reine Query-Fehler, kein fachlicher Error-Code-Bedarf |
| `sensor_type_defaults.py` (4 HTTPException) | Einfache Konfigurationsabfragen |
| `errors.py` (2 HTTPException) | Meta-Endpoint fuer Error-Codes selbst |

**6.4 Bestehende GodKaiserException-Raises auf numeric_code pruefen**

Die ~126 bestehenden GodKaiserException-Raises in den 10+ API-Dateien (esp.py, sensors.py, actuators.py, auth.py, logic.py, etc.) nutzen bereits Exception-Klassen. Nach Block 2 haben alle diese Klassen numeric_code. Keine zusaetzliche Aenderung in den API-Dateien noetig — die Exception-Klassen erledigen das automatisch.

**Akzeptanzkriterien Block 6:**
- [ ] Alle 6 HTTPException in notifications.py durch GodKaiserException-Subklassen ersetzt
- [ ] webhooks.py hat mindestens WebhookValidationException fuer ungueltige Payloads
- [ ] JSON-Response bei Notification-Fehlern enthaelt `numeric_code` (5850-5859 Range)
- [ ] Keine Regressionen in bestehenden Notification-Tests (falls vorhanden)
- [ ] 790 Backend-Tests bestehen

---

### Gesamtreihenfolge und Abhaengigkeiten

```
Block 1 (Error-Code-Ranges)
    |
    +---> Block 2 (numeric_code ergaenzen)  <-- Abhaengig von Block 1 fuer neue Notification-Codes
    |         |
    |         +---> Block 6 (Phase 4A API-Migration)  <-- Abhaengig von Block 2
    |
    +---> Block 3 (Server-Enrichment)  <-- Abhaengig von Block 1 fuer neue Notification-Ranges
    |         |
    |         +---> Block 4 (Frontend translateErrorCode)  <-- Abhaengig von Block 3 fuer Server-Enrichment
    |
    +---> Block 5 (Prometheus Counter)  <-- Abhaengig von Block 1+2 (numerische Codes muessen existieren)
```

**Unabhaengige Bloecke (koennen parallel laufen):**
- Block 3 und Block 2 koennen parallel gestartet werden (nach Block 1)
- Block 5 kann parallel zu Block 3 laufen

**Empfohlene Session-Aufteilung:**

| Session | Bloecke | Geschaetzter Aufwand |
|---------|---------|---------------------|
| Session 1 | Block 1 + Block 2 | ~2.25 Stunden |
| Session 2 | Block 3 + Block 5 | ~2.5 Stunden |
| Session 3 | Block 4 + Block 6 | ~2 Stunden |

**Gesamt:** ~6.75 Stunden (statt urspruenglicher ~13h — Halbierung durch tatsaechlich vorhandene Infrastruktur)

---

### Was NICHT in diesem Auftrag ist (Scope-Grenzen)

| Thema | Warum ausgeschlossen | Wo stattdessen |
|-------|---------------------|----------------|
| Phase 4A Tests schreiben | Eigener Auftrag noetig (~4-6h), kein Error-Code-Thema | Separater STEP 3 Auftrag: `auftrag-step3-prerequisites-bestandsaufnahme.md` |
| ESP32 Enrichment | 111/111 bereits komplett — NICHTS TUN | Kein Handlungsbedarf |
| Dead-Code-Bereinigung (tote Codes entfernen) | Konservative Entscheidung: BEHALTEN bis Phase 5 | Optional: `DEAD_CODES.md` als Dokumentation ohne Code-Aenderung |
| debug.py / audit.py HTTPException-Migration | Bewusst ausgeschlossen (zie Block 6) | Nie noetig |
| Grafana Dashboard fuer per-Code Metrics | Nach Block 5 ergaenzen wenn Daten fliessen | Paralleler Auftrag nach Block 5 |
| KI-Error-Analyse Ebene 1-4 | Dieser Auftrag ist Voraussetzung, nicht die KI selbst | Phase 5 Roadmap |

---

### Akzeptanzkriterien (Gesamt)

**Pflicht (Auftrag gilt als erledigt wenn alle erfuellt):**
- [ ] `NotificationErrorCode` Enum (10 Codes, 5850-5899) in `error_codes.py` definiert
- [ ] Alle ~22 Exception-Klassen ohne numeric_code haben jetzt numeric_code
- [ ] `server_error_mapping.py` existiert mit mindestens 30 Enrichment-Eintraegen
- [ ] `GET /v1/errors/codes/5850` gibt Enrichment-Daten zurueck (nicht 404)
- [ ] `translateErrorCode()` wird in mindestens einer Frontend-Komponente aktiv genutzt
- [ ] `ErrorDetailsModal.vue` zeigt Troubleshooting-Hinweise bei numeric_code
- [ ] notifications.py nutzt GodKaiserException statt HTTPException
- [ ] `API_ERROR_CODE_COUNTER` in Prometheus registriert und wird beim Handler aufgerufen
- [ ] 790 Backend-Tests bestehen (keine Regression)
- [ ] 1339 Frontend-Tests bestehen (keine Regression)
- [ ] `vue-tsc` laeuft fehlerfrei

**Optional (erhoehen Qualitaet, keine Pflicht):**
- [ ] Server-Enrichment fuer alle 76 aktiven Server-Codes vollstaendig (nicht nur 30+)
- [ ] Grafana Panel "API Errors by Code" (Top-10 Rate/5m)
- [ ] `DEAD_CODES.md` Dokumentation erstellt

---

### Verifikationsschritte nach Implementierung

Nach Abschluss aller Bloecke folgende E2E-Pruefung durchfuehren:

```bash
# 1. Backend-Tests
cd god_kaiser_server
pytest tests/ -v --tb=short 2>&1 | tail -20
# Erwartung: ~790 passed, 0 failed

# 2. Notification-Error-Code pruefen
curl -s http://localhost:8000/api/v1/errors/codes/5850 | python3 -m json.tool
# Erwartung: JSON mit category, severity, message_user_de, troubleshooting_de

# 3. Exception Response pruefen (Notification nicht gefunden)
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/v1/notifications/nonexistent-id
# Erwartung: 404 mit {"success": false, "error": {"code": "NOTIFICATION_NOT_FOUND", "numeric_code": 5850, ...}}

# 4. Prometheus Counter pruefen (nach einem 404-Fehler)
curl -s http://localhost:8000/metrics | grep automation_one_api_error_code
# Erwartung: automation_one_api_error_code_total{error_code="5850",source_type="api"} 1.0

# 5. Frontend TypeScript pruefen
cd El\ Frontend
npx vue-tsc --noEmit
# Erwartung: 0 errors
```

---

### Referenzen

**Life-Repo:**
- `arbeitsbereiche/automation-one/STATUS.md` — Aktueller Systemstand
- `arbeitsbereiche/automation-one/fahrplan-nach-phase4a.md` — Fahrplan STEP 0-8
- `arbeitsbereiche/automation-one/auftrag-error-code-system-ausbau.md` — HISTORISCH (alter Auftrag, nur zur Referenz)
- `arbeitsbereiche/automation-one/auftrag-step2-error-code-system-bestandsaufnahme.md` — Analyse-Auftrag (STEP 2)
- `wissen/iot-automation/ki-error-analyse-iot.md` — 4-Ebenen KI-Error-Analyse-Strategie (Ziel)
- `arbeitsbereiche/automation-one/hardware-tests/auftrag-phase4a-notification-stack.md` — Phase 4A Details (Block 4A.1-4A.8)

**Ziel-Repo (auto-one):**

| Datei | Inhalt | Block |
|-------|--------|-------|
| `god_kaiser_server/src/core/error_codes.py` | IntEnum-Definitionen (11 Klassen) | B1 |
| `god_kaiser_server/src/core/exceptions.py` | GodKaiserException-Hierarchie (38+ Klassen) | B2 |
| `god_kaiser_server/src/core/exception_handlers.py` | HTTP Exception Handler (registriert in main.py) | B2, B5 |
| `god_kaiser_server/src/core/esp32_error_mapping.py` | ESP32 Enrichment 111/111 (NICHT ANFASSEN) | Referenz |
| `god_kaiser_server/src/core/server_error_mapping.py` | NEU ERSTELLEN (Server-Enrichment) | B3 |
| `god_kaiser_server/src/core/metrics.py` | Prometheus-Metriken | B5 |
| `god_kaiser_server/src/api/v1/notifications.py` | 6 HTTPException zu migrieren | B6 |
| `god_kaiser_server/src/api/v1/webhooks.py` | Fehler-Handling ergaenzen | B6 |
| `god_kaiser_server/src/api/v1/errors.py` | GET /errors/codes/{code} erweitern | B3 |
| `El Frontend/src/api/errors.ts` | translateErrorCode() aktivieren | B4 |
| `El Frontend/src/components/error/ErrorDetailsModal.vue` | Troubleshooting anzeigen | B4 |
| `god_kaiser_server/tests/` | Keine neuen Tests in diesem Auftrag | AUSSER SCOPE |
| `.claude/reference/errors/ERROR_CODES.md` | Agent-Referenz nach Abschluss aktualisieren | Post-Impl |

---

### Offene Punkte

- **Genaue Zahl der 22 Klassen ohne numeric_code:** STEP 2 nennt "~22" — der Agent muss `exceptions.py` vollstaendig lesen und exakt zaehlen. Koennte mehr oder weniger sein.
- **Bestehende Ranges in Logic/Dashboard/Subzone/AutoOps:** Der Agent muss pruefen welche Codes bereits in diesen Enum-Klassen existieren, bevor er in Block 1 ergaenzt. Doppelungen vermeiden.
- **NotificationErrorCode-Namensgebung:** Die Codes oben sind Vorschlaege. Falls in notifications.py andere Fehlerszenarien vorkommen als erwartet, anpassen.
- **server_error_mapping.py Vollstaendigkeit:** Block 3 schreibt 30+ Eintraege als Minimum. Vollstaendigkeit (alle 76 Codes) ist ideal aber nicht Pflicht fuer diesen Auftrag — wird in Phase 5 nachgezogen wenn mehr Praxis-Erfahrung vorliegt welche Codes tatsaechlich haeufig ausgeloest werden.
- **AuditLog numeric_code als eigene Spalte:** Aktuell String(50) `error_code` in der DB, numerischer Code landet in `details` JSON. Langfristig waere eine eigene `numeric_code INTEGER` Spalte besser fuer Prometheus-Queries. Das ist eine eigene Migration — NICHT in diesem Auftrag.
