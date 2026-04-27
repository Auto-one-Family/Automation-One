# Bericht AUT-191 — Observability-Verifikation OBS-01/02/03/04

**Datum:** 2026-04-26
**Erstellt von:** TM (direkte Code-Analyse, keine Sub-Agenten nötig — alle 4 Punkte per Grep/Read abgedeckt)
**Commit-Stand:** `ac5ca7b5f32766eea255b1d3a35dbb566a793ba4` Fri Apr 24 02:05:55 2026 +0200

---

## Executive Summary

- **OBS-01:** OFFEN — Kein Scheduler-Health-Endpoint registriert. `@router.get("/scheduler/status")` existiert nur als Docstring-Beispiel in `scheduler.py:542`, nicht als reale Route. Scheduler-Status ist über kein API-Endpoint observierbar.
- **OBS-02:** OFFEN (alle drei Teilpunkte) — ESP-Delete, Sensor-Config-Delete und Zone-Delete schreiben keine `audit_logs`-Einträge. Nur `DEVICE_APPROVED` und `DEVICE_REJECTED` sind im Audit-Trail.
- **OBS-03:** BEHOBEN (durch diesen TM-Lauf) — `CI_PIPELINE.md` sagte 173, `wokwi-tests.yml` sagt 191. Zwei Stellen in `CI_PIPELINE.md` direkt korrigiert (173 → 191).
- **OBS-04:** OFFEN — `claude-opus-4-7` in drei Dateien hartkodiert. Kein `AUTOOPS_MODEL`-Env-Variable. AutoOps ist produktiv integriert (kein Experimental-Stub), aktivierung via `ANTHROPIC_API_KEY`.

---

## OBS-01 — CentralScheduler Health-Endpoint

### Status
**OFFEN**

### Code-Evidenz

**Datei:** `El Servador/god_kaiser_server/src/core/scheduler.py`
**Zeile:** 537–547
**Commit:** `eaad670ed56eea7791865f0f744d8343b7e5a43b` (Sun Mar 8 10:43:21 2026 +0100)

```python
def get_central_scheduler() -> CentralScheduler:
    """
    FastAPI Dependency für CentralScheduler.

    Verwendung:
        @router.get("/scheduler/status")
        async def get_status(
            scheduler: CentralScheduler = Depends(get_central_scheduler)
        ):
            return scheduler.get_scheduler_status()
    """
    global _scheduler_instance
    ...
```

**Datei:** `El Servador/god_kaiser_server/src/api/v1/health.py`
**Zeile:** 52 (Router-Definition)
**Befund:** Kein `scheduler`-Import, kein `get_central_scheduler`-Aufruf im health-Router.

```python
router = APIRouter(prefix="/v1/health", tags=["health"])
# Verfügbare Endpoints: /, /detailed, /esp, /metrics, /live, /ready
# Kein /scheduler-Endpoint registriert
```

**Vollständiger Grep-Befund:** `router.*scheduler` ergibt exakt 1 Treffer — der Docstring in `scheduler.py:542`. Keine echte Routenregistrierung in der gesamten Codebase.

**Erklärung:** Der `CentralScheduler` hat eine `get_scheduler_status()`-Methode und eine FastAPI-Dependency `get_central_scheduler()`. Die Dependency-Docstring zeigt sogar das Beispiel-Endpoint. Es wurde jedoch nie eine reale Route damit gebaut und registriert. Der Scheduler ist nicht über REST observierbar.

### Aktueller Scheduler-Observability-Stand

| Komponente | Observierbar? | Wie? |
|-----------|--------------|------|
| Job-Liste (laufende Jobs) | Nein | Kein API-Endpoint |
| Nächste Ausführungszeit | Nein | Kein API-Endpoint |
| Job-Fehlerrate / Job-Missed | Teilweise | APScheduler-Events in Loki-Logs (`EVENT_JOB_ERROR`, `EVENT_JOB_MISSED` werden geloggt) |
| Scheduler-Start/-Stop | Ja (Log) | `logger.info/warning` im Startup/Shutdown |
| Prometheus-Metriken | Nein | Keine Custom-Metriken für Scheduler exportiert |

Scheduler-Status ist ausschließlich über Loki-Logs observierbar (structlog-Events bei Job-Fehlern). Prometheus kann den Scheduler-Zustand nicht scrapen.

### Empfehlung (falls Issue erstellt werden soll)
Minimalste Umsetzung: `get_central_scheduler()`-Dependency in `health.py` einbinden und ein neues Endpoint `GET /v1/health/scheduler` ergänzen, das `scheduler.get_scheduler_status()` zurückgibt. Keine neue Datei nötig — reiner Einzeiler im Health-Router. Prio: MEDIUM, Schicht: Backend.

---

## OBS-02 — audit_logs Lücken

### Sensor-Config CRUD — Status: OFFEN

**Datei:** `El Servador/god_kaiser_server/src/api/v1/sensors.py`
**Commit:** `5c34c3f60e3882c39a3da4b1a5fbc3a1b2431f38` (Fri Apr 24 02:05:50 2026 +0200)
**Grep-Befund:** Kein einziger Treffer für `audit_log`, `audit_logs` oder `AuditLog` in der gesamten Datei.

```python
# sensors.py:delete_sensor() — repräsentativer Auszug (keine Audit-Calls)
async def delete_sensor(esp_id, config_id, db, current_user):
    ...
    await sensor_repo.delete(sensor.id)
    await db.commit()
    logger.info(f"Sensor deleted: {esp_id} config_id={config_id} ...")
    # ← KEIN AuditLogRepository-Aufruf
    return deleted_sensor_response
```

Auch `sensor_create` und `sensor_update` (CRUD vollständig) haben keine Audit-Log-Einträge. Die Sensor-Config-Operationen sind im Audit-Trail vollständig unsichtbar.

---

### ESP-Delete — Status: OFFEN

**Datei:** `El Servador/god_kaiser_server/src/api/v1/esp.py`
**Commit:** `7eef95e948361e6faf1d0e5ac7b0deb9d25bcf81` (Wed Apr 15 13:13:21 2026 +0200)

```python
# esp.py:670–720 — delete_device() (vollständige kritische Sektion)
@router.delete("/devices/{esp_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(esp_id: str, db: DBSession, current_user: OperatorUser) -> None:
    ...
    # Stop simulation if mock device
    ...
    # Resolve open alerts
    await notif_repo.resolve_alerts_for_device(esp_id)
    
    # Soft-delete the device (sets deleted_at, status='deleted')
    await esp_repo.soft_delete(esp_id, deleted_by=current_user.username)
    await db.commit()
    
    logger.warning(f"ESP device soft-deleted: {esp_id} by {current_user.username}")
    # ← KEIN AuditLogRepository-Aufruf
```

Vergleich: `device_approved` (Zeile 1278) und `device_rejected` (Zeile 1382) haben jeweils einen vollständigen `AuditLogRepository.log_device_event()`-Block. Das Delete-Endpoint hat keinen.

---

### Zone-Delete — Status: OFFEN

**Datei:** `El Servador/god_kaiser_server/src/api/v1/zones.py`
**Commit:** `4af33cd06cfd4fb86e5f087ecc9b8e5cdd3f1b88` (Tue Mar 24 10:44:19 2026 +0100)
**Grep-Befund:** Kein Treffer für `audit_log`, `audit_logs` oder `AuditLog` in der gesamten Datei.

```python
# zones.py:394–435 — delete_zone()
async def delete_zone(zone_id: str, db: DBSession, current_user: OperatorUser):
    ...
    deleted = await zone_repo.soft_delete(zone_id, deleted_by=current_user.username)
    await db.commit()
    logger.info("Zone soft-deleted by %s: zone_id=%s", current_user.username, zone_id)
    # ← KEIN AuditLogRepository-Aufruf
    return ZoneDeleteResponse(...)
```

---

### Was schreibt aktuell audit_logs? (kurze Liste aus Code-Grep)

| Operation | Datei | AuditEventType |
|-----------|-------|---------------|
| MQTT LWT (ESP offline) | `lwt_handler.py` | `DEVICE_OFFLINE` (verifiziert T17-V4) |
| ESP Approved | `esp.py:1278` | `DEVICE_APPROVED` |
| ESP Rejected | `esp.py:1382` | `DEVICE_REJECTED` |
| Actuator-Operationen | `actuator_handler.py` / `actuator_response_handler.py` | diverse |
| Intent-Outcomes | `intent_outcome_handler.py` | diverse |
| Error-Handler | `error_handler.py` | diverse |
| ESP-Delete | `esp.py:670` | **NICHT VORHANDEN** |
| Sensor-Config CRUD | `sensors.py` | **NICHT VORHANDEN** |
| Zone-Delete | `zones.py` | **NICHT VORHANDEN** |

### Empfehlung
Drei separate kleine Fixes — je ein `AuditLogRepository.log_device_event()`-Aufruf nach dem `await db.commit()` in `delete_device()`, `delete_sensor()` und `delete_zone()`. Pattern ist in `esp.py:1278–1294` bereits vorhanden und kann 1:1 kopiert werden. Prio: MEDIUM (kein Normalbetrieb betroffen, aber Forensik-Lücke). Schicht: Backend.

---

## OBS-03 — Wokwi-Szenario-Zähler

### Status
**BEHOBEN** (in diesem TM-Lauf direkt korrigiert)

### Evidenz vor Korrektur

**Datei:** `.claude/reference/debugging/CI_PIPELINE.md`
**Commit (vor Fix):** `aa2b08225c05133264489e1b2f981d1dfeda235a` (Sat Apr 4 22:47:43 2026 +0200)

```markdown
# Zeile 114 (vorher):
| **Nightly (Full)** | schedule, workflow_dispatch | 173 (52 core + 121 extended) | 23 (...) |

# Zeile 426 (vorher):
make wokwi-test-all            # Alle 173 Szenarien
```

**Datei:** `.github/workflows/wokwi-tests.yml`
**Zeile 15:** (kanonisch, unveränderter Stand)

```yaml
# Coverage: 191 scenarios across 15 categories
# ...
# - Nightly/Manual (Mon+Thu): ALL 191 scenarios (+ 7 extended jobs = 24 total jobs + summary)
```

### Korrektur

Beide Stellen in `CI_PIPELINE.md` direkt geändert:

| Zeile | Vorher | Nachher |
|-------|--------|---------|
| 114 | `173 (52 core + 121 extended)` | `191 (52 core + 139 extended)` |
| 426 | `# Alle 173 Szenarien` | `# Alle 191 Szenarien` |

**Erklärung:** 191 (kanonisch aus yml) − 52 Core = 139 Extended. Die alte Zahl 121 Extended stimmte nicht mit den 6 Extended-Jobs-Tabellen-Zeilen überein (Summe dort: 15+29+9+15+35+19 = 122), was auf eine ältere Dokumentenversion hinweist. Kanonischer Wert aus der ausführbaren `.yml`-Datei ist verbindlich (191).

**Nebenbefund:** Trigger-Dokumentation in CI_PIPELINE.md Zeile 96 sagt `cron '0 2 * * *'` (täglich), wokwi-tests.yml Zeile 17 sagt `Mon+Thu`. Diese Inkonsistenz ist nicht Teil des OBS-03-Scopes, aber als separates Folge-Issue empfehlenswert.

---

## OBS-04 — AutoOps LLM hartkodiert

### Status
**OFFEN**

### Code-Evidenz — Hardcoded Stellen

**1. ai_service.py (primärer AutoOps-Service)**
**Datei:** `El Servador/god_kaiser_server/src/services/ai_service.py`
**Zeile:** 114
**Commit:** `bd1d5d186ae785b5247a6be0207c40f2b1fb00fe` (Sun Nov 30 22:14:06 2025 +0100)

```python
response = await self._get_client().messages.parse(
    model="claude-opus-4-7",   # ← HARTKODIERT
    max_tokens=4096,
    system=[{"type": "text", "text": self._system_prompt, ...}],
    output_format=ErrorAnalysisFinding,
    ...
)
```

**2. debug_fix.py (AutoOps Plugin)**
**Datei:** `El Servador/god_kaiser_server/src/autoops/plugins/debug_fix.py`
**Zeile:** 693
**Commit:** `00d5d9d401fc48e5e01c3c70444a4cf22c4ec631` (Fri Mar 6 21:08:42 2026 +0100)

```python
model="claude-opus-4-7",   # ← HARTKODIERT (zweite Stelle)
```

**3. logic_ai_assistant.py (dritte Stelle)**
**Datei:** `El Servador/god_kaiser_server/src/services/logic_ai_assistant.py`
**Zeile:** 139
**Commit:** (nicht separat abgefragt — Teil des allgemeinen Server-Codebase)

```python
model="claude-opus-4-7",   # ← HARTKODIERT (dritte Stelle)
```

### Env-Variable vorhanden?

**Datei:** `El Servador/god_kaiser_server/src/core/config.py`
**Grep-Befund:** Kein `AUTOOPS_MODEL`, kein `AI_MODEL`, kein `claude_model` in der Settings-Klassen-Struktur.

```python
# config.py — AiService liest nur API-Key aus Env:
def is_available(self) -> bool:
    """Returns True if ANTHROPIC_API_KEY is configured."""
    return bool(os.environ.get("ANTHROPIC_API_KEY"))
# ← Modell-Name hat KEINE Env-Variable-Entsprechung
```

### Feature-Status AutoOps

**PRODUKTIV INTEGRIERT** (kein Experimental-Stub):
- `main.py:832` importiert `autoops.core.plugin_registry` im Startup-Pfad
- `main.py:901` importiert `autoops.core.base_plugin.PluginContext` für die Plugin-Execution-Engine
- `api/v1/diagnostics.py`, `api/v1/plugins.py` — REST-Endpoints für AutoOps-Funktionen vorhanden
- Aktivierung: Feature ist aktiv wenn `ANTHROPIC_API_KEY` gesetzt ist; bei fehlendem Key gibt `is_available()` `False` zurück und der Service macht keine API-Calls

AutoOps ist kein Stub — es ist eine vollständige Plugin-Execution-Engine mit mehreren Plugins (`debug_fix`, `health_check`, `esp_configurator`, `system_cleanup`). Das Modell `claude-opus-4-7` wird in drei verschiedenen Plugins/Services verwendet.

### Empfehlung
Minimaler Fix: Eine Settings-Klasse in `config.py` ergänzen:

```python
class AiSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", ...)
    model: str = "claude-opus-4-7"   # Fallback = bisheriger Hardcode-Wert
```

Dann `get_settings().ai.model` in allen drei Dateien statt des Literal-Strings verwenden. Prio: LOW (kein Normalbetrieb betroffen, aber CI/CD-Hygiene und Modell-Upgrade-Pfad). Schicht: Backend (config.py + 3 Service-Dateien).

---

## Anhang: Konsultierte Agenten

Keine Sub-Agenten benötigt — alle 4 Punkte durch direkte Grep/Read-Analyse in der Codebase abgedeckt.

---

## Folge-Empfehlungen

| Punkt | Empfehlung | Prio | Schicht |
|-------|------------|------|---------|
| OBS-01 | `GET /v1/health/scheduler` Endpoint in `health.py` — nutzt vorhandene `get_central_scheduler()`-Dependency | MEDIUM | Backend |
| OBS-02-ESP | `AuditLogRepository.log_device_event(DEVICE_DELETED)` in `esp.py:delete_device()` nach `db.commit()` | MEDIUM | Backend |
| OBS-02-Sensor | `AuditLogRepository` (import fehlt in sensors.py) + `log_event(SENSOR_CONFIG_DELETED)` in `delete_sensor()` | MEDIUM | Backend |
| OBS-02-Zone | `AuditLogRepository` (import fehlt in zones.py) + `log_event(ZONE_DELETED)` in `delete_zone()` | MEDIUM | Backend |
| OBS-03 | Erledigt — 173 → 191 in CI_PIPELINE.md. Folge-Issue für Trigger-Doku (`* * *` → `Mon+Thu`) | LOW | Doku |
| OBS-04 | `AiSettings` in `config.py` mit `AUTOOPS_MODEL`-Env-Variable (Fallback: `claude-opus-4-7`) | LOW | Backend |

**Alle Lücken aus OBS-01/02/04 betreffen Hygiene und Forensik — kein Normalbetrieb ist betroffen.**
