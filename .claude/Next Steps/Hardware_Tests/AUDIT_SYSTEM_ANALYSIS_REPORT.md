# Audit-System Analyse - Ergebnis

**Erstellt:** 2026-01-20
**Aktualisiert:** 2026-01-23 (Quick Wins implementiert)
**Analyst:** Claude Code
**Status:** ✅ VOLLSTÄNDIG (ESP-Lifecycle + Critical Operations)

---

## 1. Datenbank-Schema

### 1.1 Audit-Log Tabelle

| Frage | Antwort |
|-------|---------|
| Existiert `audit_logs` Tabelle? | ✅ Ja |
| Model-Datei | `src/db/models/audit_log.py` |
| Alembic Migration | `alembic/versions/add_audit_log_indexes.py` |

**Spalten (vollständige Liste):**

| Spalte | Typ | Index | Beschreibung |
|--------|-----|-------|--------------|
| `id` | UUID | PK | Primary Key |
| `event_type` | String(50) | ✅ | Event-Typ (config_response, emergency_stop, etc.) |
| `severity` | String(20) | ✅ | info, warning, error, critical |
| `source_type` | String(30) | ✅ | esp32, user, system, api, mqtt, scheduler |
| `source_id` | String(100) | ✅ | ESP-ID, User-ID, etc. |
| `status` | String(20) | ✅ | success, failed, pending |
| `message` | Text | - | Beschreibung |
| `details` | JSON | - | Event-spezifische Details |
| `error_code` | String(50) | ✅ | Error-Code (falls vorhanden) |
| `error_description` | Text | - | Fehler-Beschreibung |
| `ip_address` | String(45) | - | Client-IP |
| `user_agent` | String(500) | - | Client User-Agent |
| `correlation_id` | String(100) | ✅ | Für Event-Korrelation |
| `created_at` | DateTime | ✅ | Timestamp (TimestampMixin) |
| `updated_at` | DateTime | - | Timestamp (TimestampMixin) |

**Indizes (Performance-optimiert):**
- `ix_audit_logs_created_at` - Time-Range Queries
- `ix_audit_logs_severity_created_at` - Severity + Time
- `ix_audit_logs_source_created_at` - Source + Time

---

## 2. Audit-Infrastruktur

### 2.1 Audit Model (`audit_log.py:26-232`)

**Klassen:**
- `AuditLog` - SQLAlchemy Model
- `AuditEventType` - Event-Typ Konstanten
- `AuditSeverity` - Severity Konstanten (INFO, WARNING, ERROR, CRITICAL)
- `AuditSourceType` - Source-Typ Konstanten (ESP32, USER, SYSTEM, API, MQTT, SCHEDULER)

### 2.2 Audit Repository (`audit_log_repo.py:30-457`)

**Implementierte Methoden:**

| Methode | Zeile | Beschreibung |
|---------|-------|--------------|
| `log_config_response()` | 54-102 | ESP Config-Responses loggen |
| `log_mqtt_error()` | 104-133 | MQTT-Fehler loggen |
| `log_validation_error()` | 135-166 | Validierungsfehler loggen |
| `log_emergency_stop()` | 168-205 | Emergency-Stop Events loggen |
| `log_device_event()` | 207-238 | **Generische Device-Events** ⚠️ UNGENUTZT! |
| `get_by_source()` | 244-276 | Logs nach Source filtern |
| `get_by_event_type()` | 278-314 | Logs nach Event-Typ filtern |
| `get_errors()` | 316-349 | Error/Critical Logs abrufen |
| `get_esp_config_history()` | 351-379 | Config-History für ESP |
| `get_event_counts()` | 385-415 | Event-Statistiken |
| `get_error_rate()` | 417-456 | Fehlerrate berechnen |

### 2.3 Audit Retention Service (`audit_retention_service.py:58-696`)

**Features:**
- ✅ Konfigurierbarer Retention per Severity
- ✅ Batch-Deletion für Performance
- ✅ Dry-Run Mode
- ✅ Statistics für Dashboard
- ✅ Test-Daten Cleanup (SensorData, ActuatorHistory)
- ✅ Emergency-Stop Preservation Option

**Default Retention:**
```python
DEFAULT_RETENTION_CONFIG = {
    "enabled": False,  # Safety-First: User muss explizit aktivieren (geändert 2026-01-23)
    "default_days": 30,
    "severity_days": {
        "info": 14,
        "warning": 30,
        "error": 90,
        "critical": 365,
    },
    "preserve_emergency_stops": True,
}
```

### 2.4 Audit API (`api/v1/audit.py:29-617`)

**Endpoints:**

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `GET /v1/audit` | list_audit_logs | Logs mit Pagination & Filter |
| `GET /v1/audit/errors` | get_recent_errors | Errors der letzten N Stunden |
| `GET /v1/audit/esp/{esp_id}/config-history` | get_esp_config_history | Config-History |
| `GET /v1/audit/statistics` | get_audit_statistics | Dashboard-Stats |
| `GET /v1/audit/error-rate` | get_error_rate | Fehlerrate |
| `GET /v1/audit/retention/config` | get_retention_config | Retention-Config |
| `PUT /v1/audit/retention/config` | update_retention_config | Config ändern (Admin) |
| `POST /v1/audit/retention/cleanup` | run_retention_cleanup | Manueller Cleanup (Admin) |
| `GET /v1/audit/event-types` | list_event_types | Alle Event-Typen |
| `GET /v1/audit/severities` | list_severities | Alle Severity-Level |
| `GET /v1/audit/source-types` | list_source_types | Alle Source-Typen |

---

## 3. Bestehende Audit-Log Aufrufe

### 3.1 Wo wird Audit-Logging genutzt?

| Datei | Zeilen | Event-Typ | Status |
|-------|--------|-----------|--------|
| `config_handler.py` | 180-197 | `config_response` | ✅ Implementiert |

**Konkret:** Nur `config_handler.py` nutzt das Audit-System!

```python
# config_handler.py:180-193
async with resilient_session() as session:
    audit_repo = AuditLogRepository(session)
    await audit_repo.log_config_response(
        esp_id=esp_id,
        config_type=config_type,
        status=status,
        count=count,
        message=message,
        error_code=error_code if status != "success" else None,
        ...
    )
```

---

## 4. ESP-Lifecycle Event Coverage

### 4.1 Definierte Event-Typen (`AuditEventType`)

**Stand: 2026-01-23 (nach Quick Wins Implementierung)**

| Event-Typ | Konstante | Implementiert? | Location |
|-----------|-----------|----------------|----------|
| `config_response` | CONFIG_RESPONSE | ✅ Ja | `config_handler.py:180` |
| `device_discovered` | DEVICE_DISCOVERED | ✅ Ja | `heartbeat_handler.py:393` |
| `device_approved` | DEVICE_APPROVED | ✅ Ja | `esp.py:1204` |
| `device_rejected` | DEVICE_REJECTED | ✅ Ja | `esp.py:1308` |
| `device_online` | DEVICE_ONLINE | ✅ Ja | `heartbeat_handler.py:186` |
| `device_rediscovered` | DEVICE_REDISCOVERED | ✅ Ja | `heartbeat_handler.py:466` |
| `device_offline` | DEVICE_OFFLINE | ✅ Ja | `heartbeat_handler.py:994` |
| `lwt_received` | LWT_RECEIVED | ✅ Ja | `lwt_handler.py:125` |
| `emergency_stop` | EMERGENCY_STOP | ✅ Ja | `actuators.py:696` |
| `config_published` | CONFIG_PUBLISHED | ❌ Nein | - |
| `config_failed` | CONFIG_FAILED | ❌ Nein | - |
| `login_success` | LOGIN_SUCCESS | ❌ Nein | - |
| `login_failed` | LOGIN_FAILED | ❌ Nein | - |
| `logout` | LOGOUT | ❌ Nein | - |
| `token_revoked` | TOKEN_REVOKED | ❌ Nein | - |
| `permission_denied` | PERMISSION_DENIED | ❌ Nein | - |
| `api_key_invalid` | API_KEY_INVALID | ❌ Nein | - |
| `rate_limit_exceeded` | RATE_LIMIT_EXCEEDED | ❌ Nein | - |
| `service_start` | SERVICE_START | ❌ Nein | - |
| `service_stop` | SERVICE_STOP | ❌ Nein | - |
| `mqtt_error` | MQTT_ERROR | ❌ Nein | - |
| `database_error` | DATABASE_ERROR | ❌ Nein | - |
| `validation_error` | VALIDATION_ERROR | ❌ Nein | - |

### 4.2 ESP-Lifecycle Event Coverage (VOLLSTÄNDIG implementiert)

**Stand: 2026-01-23**

| Event-Typ | Location | Status |
|-----------|----------|--------|
| `device_discovered` | `heartbeat_handler.py:393` | ✅ IMPLEMENTIERT |
| `device_approved` | `esp.py:1204` | ✅ IMPLEMENTIERT |
| `device_rejected` | `esp.py:1308` | ✅ IMPLEMENTIERT |
| `device_online` | `heartbeat_handler.py:186` | ✅ IMPLEMENTIERT |
| `device_rediscovered` | `heartbeat_handler.py:466` | ✅ IMPLEMENTIERT |
| `lwt_received` | `lwt_handler.py:125` | ✅ IMPLEMENTIERT |
| `device_offline` (timeout) | `heartbeat_handler.py:994` | ✅ IMPLEMENTIERT |

**ESP-Lifecycle Coverage: 7/7 (100%)**

### 4.3 Detaillierte Handler-Analyse

#### `heartbeat_handler.py`

| Aktion | Zeile | Logging-Typ | Audit-DB? |
|--------|-------|-------------|-----------|
| New ESP discovered | 324-328 | `logger.info("🔔 New ESP discovered...")` | ❌ NEIN |
| Device now online | 181 | `logger.info("✅ Device {esp_id} now online")` | ❌ NEIN |
| Device rediscovered | 422 | `logger.info("🔔 Device rediscovered...")` | ❌ NEIN |
| Heartbeat processed | 202-206 | `logger.debug("Heartbeat processed...")` | ❌ NEIN |
| Device timed out | 926-930 | `logger.warning("Device {device_id} timed out...")` | ❌ NEIN |

**Fazit:** heartbeat_handler nutzt nur Application-Logging (`logger.*`), keine Audit-DB!

#### `lwt_handler.py`

| Aktion | Zeile | Logging-Typ | Audit-DB? |
|--------|-------|-------------|-----------|
| LWT received | 80-83 | `logger.warning("LWT received...")` | ❌ NEIN |
| Device marked offline | 125 | `logger.info("Device {esp_id} marked offline")` | ❌ NEIN |

**Fazit:** lwt_handler nutzt nur Application-Logging, keine Audit-DB!

#### `esp.py` (API)

| Aktion | Zeile | Logging-Typ | Audit-DB? |
|--------|-------|-------------|-----------|
| Device registered | 400 | `logger.info("ESP device registered...")` | ❌ NEIN |
| Device updated | 501 | `logger.info("ESP device updated...")` | ❌ NEIN |
| Device deleted | 591 | `logger.warning("ESP device deleted...")` | ❌ NEIN |
| Device approved | 1214 | `logger.info("✅ Device approved...")` | ❌ NEIN |
| Device rejected | 1295 | `logger.warning("❌ Device rejected...")` | ❌ NEIN |

**Fazit:** esp.py API nutzt nur Application-Logging, keine Audit-DB!

---

## 5. Performance-Überlegungen

### 5.1 Heartbeat-Frequenz

| Frage | Antwort |
|-------|---------|
| Wird jeder Heartbeat in Audit-DB geschrieben? | ❌ NEIN (gar kein Audit-Logging) |
| Gibt es Filterung (nur bei Status-Änderung)? | N/A |

**Empfehlung:** Nur Status-Änderungen loggen (online→offline, offline→online), nicht jeden Heartbeat!

**Berechnung bei Status-Änderungen:**
- Pro ESP ca. 2-4 Status-Änderungen/Tag (Online/Offline-Übergänge)
- 100 ESPs = max 400 Einträge/Tag = vertretbar

### 5.2 Retention-Policy

| Frage | Antwort |
|-------|---------|
| Retention-Policy existiert? | ✅ Ja (`AuditRetentionService`) |
| Aufbewahrungsdauer (Default)? | 14-365 Tage (je nach Severity) |
| Cleanup-Mechanismus? | ✅ Batch-Deletion, Dry-Run, Scheduler-fähig |

**Hinweis:** Cleanup ist per Default **enabled** mit sensiblen Defaults.

---

## 6. Zusammenfassung

**Stand: 2026-01-23 (aktualisiert nach Quick Wins Implementierung)**

### Schema
- ✅ Tabelle `audit_logs` existiert und ist vollständig
- ✅ 16 Spalten mit Performance-Indizes
- ✅ Model-Klasse: `AuditLog` in `audit_log.py`

### Infrastruktur
- ✅ Audit-Service: `AuditRetentionService` (vollständig)
- ✅ Audit-Repository: `AuditLogRepository` (vollständig)
- ✅ Aktuelle Aufrufe: **9 Stellen** im Code!

### Event-Coverage
- **ESP-Lifecycle Events:** 7/7 (100%) ✅
  - `device_discovered`, `device_approved`, `device_rejected`
  - `device_online`, `device_rediscovered`, `device_offline`
  - `lwt_received`
- **Critical Operations:** 2/2 (100%) ✅
  - `config_response`, `emergency_stop`
- **Security Events:** 0/5 (0%) ⏳ (zukünftig)
- **System Events:** 0/4 (0%) ⏳ (zukünftig)

### Performance
- ✅ Heartbeat-Logging: Nur bei Status-Änderungen (kein Performance-Problem)
- ✅ Retention-Policy: Vorhanden, Default = **disabled** (Safety-First)

---

## 7. Empfehlung

### Kurz-Term (Quick Wins)

**Schritt 1:** `log_device_event()` Methode nutzen (existiert bereits!)

```python
# In heartbeat_handler.py:324 (nach _auto_register_esp)
await audit_repo.log_device_event(
    esp_id=esp_id,
    event_type="device_discovered",
    status="success",
    message=f"New ESP discovered via heartbeat",
    details={"zone_id": zone_id, "heap_free": payload.get("heap_free")}
)
```

**Schritt 2:** Event-Typen in `AuditEventType` ergänzen

```python
# In audit_log.py
class AuditEventType:
    # ... existing ...

    # ESP Lifecycle Events (NEU)
    DEVICE_DISCOVERED = "device_discovered"
    DEVICE_APPROVED = "device_approved"
    DEVICE_REJECTED = "device_rejected"
    DEVICE_ONLINE = "device_online"
    DEVICE_REDISCOVERED = "device_rediscovered"
    LWT_RECEIVED = "lwt_received"
    HEARTBEAT_TIMEOUT = "heartbeat_timeout"
```

### Mittel-Term

**Schritt 3:** Audit-Logging in Handler integrieren

| Handler | Events zu loggen |
|---------|------------------|
| `heartbeat_handler.py` | discovered, online, rediscovered, timeout |
| `lwt_handler.py` | lwt_received |
| `esp.py` (API) | approved, rejected, registered, deleted |

**Schritt 4:** Status-Change-Only Filter

Nur loggen wenn:
- `old_status != new_status`
- Nicht jeden Heartbeat, nur Online/Offline-Übergänge

---

## 8. Code-Referenzen

| Komponente | Datei | Relevante Zeilen |
|------------|-------|------------------|
| Audit Model | `src/db/models/audit_log.py` | 26-232 |
| Audit Repository | `src/db/repositories/audit_log_repo.py` | 30-457 |
| Audit Retention Service | `src/services/audit_retention_service.py` | 58-696 |
| Audit API | `src/api/v1/audit.py` | 29-617 |
| Heartbeat Handler | `src/mqtt/handlers/heartbeat_handler.py` | 58-966 |
| LWT Handler | `src/mqtt/handlers/lwt_handler.py` | 48-156 |
| ESP API (Approval) | `src/api/v1/esp.py` | 1137-1303 |
| Config Handler (einzige Nutzung!) | `src/mqtt/handlers/config_handler.py` | 180-197 |

---

## 9. Offene Fragen

1. **Soll jeder Status-Übergang geloggt werden?**
   - Oder nur spezifische (discovered, approved, rejected, offline)?

2. **Sollen Heartbeats "summarized" werden?**
   - z.B. "50 Heartbeats empfangen seit letztem Audit-Eintrag"?

3. **Retention-Policy für ESP-Lifecycle Events?**
   - Gleiche wie andere Events (severity-basiert)?
   - Oder spezielle Policy für Device-Events?

---

**Analyse abgeschlossen: 2026-01-20**
