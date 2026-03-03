# Auftrag: PHASE B — Scheduler-Verdrahtung (V2.1 + V3.1 + V2.2)

> **Erstellt:** 2026-03-03
> **Erstellt von:** Automation-Experte (Life-Repo), basierend auf Roadmap + Phase A Analyse
> **Ziel-Repo:** `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one`
> **Vorgaenger:** Phase A (alle 4 Reports BESTANDEN)
> **Aufwand:** ~4h gesamt
> **Agent:** server-dev
> **Prioritaet:** HOCH — Scheduler-Luecken schliessen VOR Hardware-Test 2
> **Reihenfolge:** V2.1 → V3.1 → V2.2 (sequenziell, baut aufeinander auf)

---

## Uebersicht Phase B

| Block | Was | Aufwand | Abhaengigkeit |
|-------|-----|---------|---------------|
| V2.1 | Daily Diagnostic Scheduler + plugin_service Fix | ~1h | Nichts |
| V3.1 | Plugin Schedule-Verdrahtung (DB → APScheduler) | ~2h | V2.1 (gleicher Mechanismus) |
| V2.2 | Report-Retention (90-Tage Cleanup) | ~1h | V2.1 (laeuft nach Diagnostic) |

---

## V2.1 — Daily Diagnostic Scheduler + plugin_service Fix

### Was fehlt

DiagnosticsService existiert vollstaendig (10 Checks, API, Frontend), aber laeuft NUR on-demand. Es gibt KEINEN Scheduler-Job der taeglich automatisch eine Diagnose ausfuehrt. Zusaetzlich wird `plugin_service=None` uebergeben — der Plugins-Check gibt deshalb immer WARNING.

### Implementierung

#### Schritt 1: Config erweitern (~5min)

**Datei:** `god_kaiser_server/src/core/config.py`

> [verify-plan] ALLE Pfade im Plan mit `src/` Prefix sind relativ zu `El Servador/god_kaiser_server/`.
> Vollständig: `El Servador/god_kaiser_server/src/core/config.py`

Neue Felder in die **`MaintenanceSettings`-Klasse** einfuegen (NICHT Top-Level! Config nutzt verschachtelte Pydantic-Klassen):

```python
# In class MaintenanceSettings(BaseSettings):
diagnostic_schedule_enabled: bool = Field(
    default=True,
    alias="DIAGNOSTIC_SCHEDULE_ENABLED",
    description="Enable daily automatic diagnostic run",
)
diagnostic_schedule_hour: int = Field(
    default=4,
    alias="DIAGNOSTIC_SCHEDULE_HOUR",
    ge=0,
    le=23,
    description="Hour (UTC) for daily diagnostic (04:00 — after Cleanup 03:00/03:30)",
)
```

> [verify-plan] Zugriff dann via `settings.maintenance.diagnostic_schedule_hour` (NICHT `settings.DIAGNOSTIC_SCHEDULE_HOUR`)

#### Schritt 2: plugin_service Fix (~10min)

**Datei:** `god_kaiser_server/src/api/v1/diagnostics.py`

> [verify-plan] KORREKTUR: `DiagnosticsService` wird NICHT in `main.py` instanziiert!
> Es gibt KEINEN globalen `diagnostics_service` in der Startup-Sequenz.
> Die Instanziierung erfolgt per Request-Scope in `diagnostics.py:95-97`:
> ```python
> def _build_diagnostics_service(db: DBSession) -> DiagnosticsService:
>     return DiagnosticsService(session=db)  # ← plugin_service fehlt hier!
> ```

**Problem:** `_build_diagnostics_service()` in `diagnostics.py:95-97` uebergibt kein `plugin_service`. Der Plugins-Check gibt deshalb immer WARNING.

**Fix:** `_build_diagnostics_service()` muss PluginService injiziert bekommen. Da PluginService einen `PluginRegistry` braucht, gibt es zwei Optionen:

**Option A (einfach):** PluginRegistry + PluginService inline bauen:
```python
def _build_diagnostics_service(db: DBSession) -> DiagnosticsService:
    """Build DiagnosticsService for request scope."""
    from ...autoops.core.plugin_registry import PluginRegistry
    from ...services.plugin_service import PluginService

    registry = PluginRegistry()
    registry.discover_plugins()
    plugin_service = PluginService(db, registry)
    return DiagnosticsService(session=db, plugin_service=plugin_service)
```

**Option B (sauberer):** PluginService als FastAPI Dependency analog zur Session injizieren.

> [verify-plan] Constructor-Signatur bestaetigt: `DiagnosticsService.__init__(self, session, mqtt_manager=None, plugin_service=None)` — Parameter existiert, wird nur nicht uebergeben.

#### Schritt 3: Scheduler-Job registrieren (~15min)

**Datei:** `god_kaiser_server/src/main.py`

**Insertion-Point:** Nach Step 6.1 (Plugin-Sync, Zeile ~603), weil PluginService/PluginRegistry dort verfuegbar sind.

> [verify-plan] KORREKTUR: `database_backup` Job (V5.1) existiert NICHT im Code! Es gibt keinen Step 3.4.X fuer Backup.
> Bestehende Steps: 3.4.1 (SimulationScheduler), 3.4.2 (MaintenanceService), 3.4.3 (Prometheus), 3.4.4 (Digest), 3.4.5 (Alert Suppression).
> Neuer Step sollte nach 6.1 platziert werden (Plugin-Sync), da wir dort PluginRegistry + PluginService haben.

> [verify-plan] KORREKTUR Session-Pattern: `get_session()` ist ein **AsyncGenerator** (yield-based), NICHT ein async context manager!
> Richtig: `async for session in get_session(): ... break`
> Falsch: `async with get_async_session() as session:` (existiert nicht!)
> Vorbild: Zeilen 384-392, 400-415, 427-443 in main.py nutzen alle `async for session in get_session(): ... break`

> [verify-plan] KORREKTUR `add_cron_job` Signatur:
> - `category` muss `JobCategory.MAINTENANCE` sein (Enum), NICHT String `"maintenance"`
> - Job-ID wird automatisch mit `{category.value}_` prefixed → `"maintenance_daily_diagnostic"`
> - `report.overall_status` ist ein `CheckStatus` Enum, Zugriff via `.value` fuer String

> [verify-plan] `run_full_diagnostic(triggered_by="scheduled")` ist KORREKT — Signatur bestaetigt: `run_full_diagnostic(self, triggered_by: str = "manual", user_id: Optional[int] = None)`
> ABER: `report.checks_passed` und `report.checks_total` existieren NICHT auf `DiagnosticReportData`. Verwende stattdessen `report.overall_status.value` und `report.summary`.

```python
# ── Step 6.2: Daily Diagnostic Scheduler ──
if settings.maintenance.diagnostic_schedule_enabled:
    from .services.diagnostics_service import DiagnosticsService

    async def _scheduled_daily_diagnostic():
        """Run full system diagnostic daily."""
        try:
            async for session in get_session():
                # PluginService fuer vollstaendigen Plugins-Check
                plugin_registry = PluginRegistry()
                plugin_registry.discover_plugins()
                ps = PluginService(session, plugin_registry)
                diag_service = DiagnosticsService(session=session, plugin_service=ps)
                report = await diag_service.run_full_diagnostic(triggered_by="scheduled")
                logger.info(
                    f"Daily diagnostic completed: {report.overall_status.value} — "
                    f"{report.summary}"
                )
                break
        except Exception as e:
            logger.error(f"Scheduled daily diagnostic FAILED: {e}")

    from .core.scheduler import JobCategory

    _central_scheduler.add_cron_job(
        job_id="daily_diagnostic",
        func=_scheduled_daily_diagnostic,
        cron_expression={"hour": settings.maintenance.diagnostic_schedule_hour, "minute": 0},
        category=JobCategory.MAINTENANCE,
    )
    logger.info(f"Daily diagnostic scheduled at {settings.maintenance.diagnostic_schedule_hour:02d}:00")
```

#### Schritt 4: Scheduler-Reihenfolge verifizieren (~5min)

> [verify-plan] KORREKTUR: `database_backup` (V5.1) existiert NICHT im Code! 02:00 ist frei.

**Tatsaechliche Reihenfolge nach Phase B (basierend auf echtem Code):**
```
(frei)  — 02:00 Slot (V5.1 database_backup geplant aber noch NICHT implementiert)
03:00   — cleanup_sensor_data (MaintenanceService, nur wenn ENABLED)
03:30   — cleanup_command_history (MaintenanceService, nur wenn ENABLED)
04:00   — daily_diagnostic (V2.1, NEU)
hourly  — cleanup_orphaned_mocks (MaintenanceService, nur wenn ENABLED)
60s     — health_check_esps (MaintenanceService, MONITOR)
30s     — mqtt_health_check (MaintenanceService, MONITOR)
60s     — sensor_health_check (MaintenanceService, MONITOR)
15s     — monitor_prometheus_metrics (direkt in main.py registriert)
3600s   — maintenance_digest_emails (direkt in main.py registriert)
5min    — alert_suppression_check (alert_suppression_scheduler)
daily   — alert_suppression_reset (alert_suppression_scheduler)
```

Pruefen dass keine Kollision entsteht. APScheduler fuehrt verschiedene Jobs parallel aus — das ist OK solange sie sich nicht gegenseitig blockieren (verschiedene DB-Tabellen).

> [verify-plan] HINWEIS: Cleanup-Jobs (sensor_data, command_history) sind per Default DISABLED! Sie laufen NUR wenn in .env explizit aktiviert (`SENSOR_DATA_RETENTION_ENABLED=true`). Der 03:00/03:30 Slot ist faktisch oft frei.

### Verifikation V2.1

| # | Test | Erwartung |
|---|------|-----------|
| 1 | Container-Log nach 04:00 | `Daily diagnostic completed: HEALTHY` |
| 2 | `GET /api/v1/diagnostics/history` | Report mit `triggered_by: "scheduled"` sichtbar. [verify-plan] API-Route bestaetigt: `/v1/diagnostics/history` existiert (diagnostics.py:10) |
| 3 | Plugins-Check im Report | Status != WARNING (plugin_service korrekt uebergeben) |
| 4 | Manueller Test | `POST /api/v1/diagnostics/run` weiterhin funktional |

---

## V3.1 — Plugin Schedule-Verdrahtung (DB → APScheduler)

### Was fehlt

**Kernluecke:** `PluginConfig.schedule` Feld in der DB existiert. `PUT /v1/plugins/{id}/schedule` API existiert. ABER: Kein Code liest die Schedule-Werte aus der DB und registriert sie als APScheduler-Jobs! Plugins mit Schedules laufen NICHT automatisch.

### Implementierung

#### Schritt 1: Schedule-Format analysieren (~10min)

> [verify-plan] Alle drei Dateien VERIFIZIERT. Ergebnisse:

**`god_kaiser_server/src/db/models/plugin.py`:**
- [x] `PluginConfig.schedule` — **`String(100), nullable=True`** ← Cron-Expression als String, z.B. `"0 3 * * *"`
- [x] API-Format: `UpdatePluginScheduleRequest.schedule: Optional[str]` (plugins.py:49) — Cron-String oder `None`

**`god_kaiser_server/src/services/plugin_service.py`:**
- [x] `get_scheduled_plugins()` — gibt `list[PluginConfig]` zurueck, filtert `schedule IS NOT NULL AND is_enabled = True`
- [x] `update_schedule(plugin_id, schedule: str | None)` — speichert direkt in DB, KEINE Scheduler-Reaktivitaet
- [ ] Schedule-Validierung — **FEHLT!** Keine Cron-String-Validierung. Muss noch gebaut werden.

**`god_kaiser_server/src/core/scheduler.py`:**
- [x] `add_cron_job(cron_expression: Dict[str, Any])` — akzeptiert NUR **Dicts**, KEINE Cron-Strings! → **Parser noetig**
- [x] `remove_job(job_id, category=None)` — **Existiert!** Gibt `False` zurueck wenn Job nicht existiert (kein Error)
- [ ] `parse_cron_expression()` — **Existiert NICHT**, muss gebaut werden

> [verify-plan] KRITISCH: `add_cron_job` fuegt automatisch `{category.value}_` als Prefix hinzu!
> Wenn `job_id="plugin_health_check"` mit `category=JobCategory.MAINTENANCE`:
> → Tatsaechliche Job-ID wird `"maintenance_plugin_health_check"`.
> `remove_job()` mit `category=None` erwartet die volle ID inkl. Prefix.
> `remove_job("plugin_health_check", category=JobCategory.MAINTENANCE)` → sucht `"maintenance_plugin_health_check"`.

> [verify-plan] `JobCategory` hat KEINEN Wert `"plugin"`! Verfuegbar: MOCK_ESP, MAINTENANCE, MONITOR, CUSTOM, SENSOR_SCHEDULE.
> Plugin-Jobs sollten `JobCategory.MAINTENANCE` oder `JobCategory.CUSTOM` nutzen.

#### Schritt 2: Cron-Parser implementieren (falls noetig, ~20min)

Falls `add_cron_job()` nur Dicts akzeptiert, aber Schedule als 5-Feld Cron-String gespeichert wird:

```python
def parse_cron_string(cron: str) -> dict:
    """Parse 5-field cron string to APScheduler dict.

    Args:
        cron: "minute hour day month day_of_week" (e.g., "0 3 * * *")

    Returns:
        Dict with minute, hour, day, month, day_of_week keys.
    """
    parts = cron.strip().split()
    if len(parts) != 5:
        raise ValueError(f"Invalid cron expression: {cron} (expected 5 fields)")

    keys = ["minute", "hour", "day", "month", "day_of_week"]
    result = {}
    for key, value in zip(keys, parts):
        if value != "*":
            result[key] = value  # APScheduler akzeptiert Strings wie "0", "3", "*/5"
    return result
```

**Wo platzieren:** In `god_kaiser_server/src/core/scheduler.py` als Helper-Funktion (neben `CentralScheduler`).

> [verify-plan] Empfehlung: Auch Validierung einbauen — `croniter` Package oder eigene Validierung. Aktuell gibt es KEINE Cron-Validierung beim Setzen via API.

#### Schritt 3: Schedule-Registrierung beim Startup (~30min)

**Datei:** `god_kaiser_server/src/main.py`

**Insertion-Point:** Nach Step 6.1 (Plugin-Sync, Zeile ~603) und nach V2.1 Step 6.2.

> [verify-plan] KRITISCHE KORREKTUREN:
> 1. `get_async_session()` existiert NICHT → richtig: `async for session in get_session(): ... break`
> 2. `PluginService(session)` hat FALSCHE Signatur → richtig: `PluginService(session, registry)` (braucht PluginRegistry!)
> 3. `execute_plugin(plugin_id, triggered_by, user_id)` FALSCHE Signatur → richtig: `execute_plugin(plugin_id, user_id, context: PluginContext)`
> 4. `category="plugin"` existiert NICHT → richtig: `category=JobCategory.CUSTOM` (oder neue Kategorie hinzufuegen)
> 5. Job-ID wird automatisch mit `{category.value}_` prefixed!

```python
# ── Step 6.3: Plugin Schedule Registration ──
from .core.scheduler import JobCategory
from .core.scheduler import parse_cron_string  # NEU aus V3.1 Schritt 2

scheduled_plugins = await plugin_service.get_scheduled_plugins()
for plugin_config in scheduled_plugins:
    try:
        cron_dict = parse_cron_string(plugin_config.schedule)
        job_id = f"plugin_{plugin_config.plugin_id}"

        async def _execute_scheduled_plugin(pid=plugin_config.plugin_id):
            """Execute a scheduled plugin."""
            try:
                async for session in get_session():
                    registry = PluginRegistry()
                    registry.discover_plugins()
                    ps = PluginService(session, registry)
                    context = PluginContext(
                        trigger_source="schedule",  # [verify-plan] "schedule" nicht "scheduled" (base_plugin.py:355)
                        # Restliche Felder haben sinnvolle Defaults via dataclass
                    )
                    await ps.execute_plugin(
                        plugin_id=pid,
                        user_id=None,  # System-Ausfuehrung
                        context=context,
                    )
                    break
            except Exception as e:
                logger.error(f"Scheduled plugin {pid} FAILED: {e}")

        _central_scheduler.add_cron_job(
            job_id=job_id,
            func=_execute_scheduled_plugin,
            cron_expression=cron_dict,
            category=JobCategory.CUSTOM,  # oder neue PLUGIN Kategorie
        )
        logger.info(f"Plugin '{plugin_config.plugin_id}' scheduled: {plugin_config.schedule}")

    except Exception as e:
        logger.warning(f"Failed to schedule plugin '{plugin_config.plugin_id}': {e}")

logger.info(f"Registered {len(scheduled_plugins)} plugin schedule(s)")
```

**KRITISCH — Closure-Bug vermeiden:**
Die Zeile `pid=plugin_config.plugin_id` im Lambda/def ist ESSENTIELL. Ohne Default-Argument wuerde die Closure immer den letzten `plugin_config` referenzieren (klassischer Python-Closure-Bug in Loops).

> [verify-plan] `execute_plugin()` Signatur VERIFIZIERT:
> ```python
> async def execute_plugin(self, plugin_id: str, user_id: int | None, context: PluginContext)
> ```
> - `PluginContext` braucht: `trigger_source`, `trigger_rule_id`, `trigger_value`, `config_overrides`
> - Import: `from .autoops.core.base_plugin import PluginContext`
> - `user_id=None` ist OK fuer Scheduled-Runs

#### Schritt 4: Schedule-Update Reaktivitaet (~30min)

**Datei:** `god_kaiser_server/src/services/plugin_service.py`

**Problem:** Wenn ein User den Schedule via `PUT /v1/plugins/{id}/schedule` aendert, muss der alte Scheduler-Job entfernt und ein neuer registriert werden. Sonst wirkt die Aenderung erst nach Server-Neustart.

> [verify-plan] KORREKTUREN:
> 1. `_get_or_create_config()` existiert NICHT — richtig: `await self.db.get(PluginConfig, plugin_id)`
> 2. `remove_job(job_id)` existiert und gibt `False` zurueck bei nicht-existentem Job (KEIN Error, KEIN try/except noetig)
> 3. `remove_job` braucht die VOLLE Job-ID inkl. Prefix: `f"custom_plugin_{plugin_id}"` (weil `category=JobCategory.CUSTOM`)
> 4. Oder: `remove_job(f"plugin_{plugin_id}", category=JobCategory.CUSTOM)` — dann baut `remove_job` den Prefix selbst

**Aenderung in `update_schedule()` (plugin_service.py):**

```python
async def update_schedule(self, plugin_id: str, schedule: str | None) -> PluginConfig:
    """Update plugin schedule and re-register scheduler job."""
    db_config = await self.db.get(PluginConfig, plugin_id)
    if not db_config:
        raise PluginNotFoundError(plugin_id)

    old_schedule = db_config.schedule
    db_config.schedule = schedule
    await self.db.commit()

    # Scheduler-Job aktualisieren
    from ..core.scheduler import get_central_scheduler, JobCategory, parse_cron_string

    scheduler = get_central_scheduler()
    job_id = f"plugin_{plugin_id}"

    # Alten Job entfernen (gibt False zurueck wenn nicht vorhanden — kein Error)
    scheduler.remove_job(job_id, category=JobCategory.CUSTOM)

    # Neuen Job registrieren (wenn Schedule gesetzt)
    if schedule:
        cron_dict = parse_cron_string(schedule)

        async def _execute(pid=plugin_id):
            from ..db.session import get_session
            from ..autoops.core.plugin_registry import PluginRegistry
            from ..autoops.core.base_plugin import PluginContext

            async for session in get_session():
                registry = PluginRegistry()
                registry.discover_plugins()
                ps = PluginService(session, registry)
                context = PluginContext(
                    trigger_source="scheduled",
                    trigger_rule_id=None,
                    trigger_value=None,
                    config_overrides={},
                )
                await ps.execute_plugin(plugin_id=pid, user_id=None, context=context)
                break

        scheduler.add_cron_job(
            job_id=job_id,
            func=_execute,
            cron_expression=cron_dict,
            category=JobCategory.CUSTOM,
        )

    logger.info(f"Plugin '{plugin_id}' schedule updated: {old_schedule} → {schedule}")
    return db_config
```

> [verify-plan] `remove_job()` VERIFIZIERT:
> - Existiert in scheduler.py:318-345
> - Gibt `False` zurueck wenn Job nicht gefunden (KEIN JobLookupError)
> - Akzeptiert `category` Parameter: baut dann `f"{category.value}_{job_id}"` intern

#### Schritt 5: Default-Schedules setzen (~15min)

**Datei:** `god_kaiser_server/src/main.py` (nach Plugin-Sync Step 6.1)

> [verify-plan] KORREKTUR: `get_plugin_config()` existiert NICHT in PluginService!
> Richtig: `await self.db.get(PluginConfig, plugin_id)` — oder direkte DB-Query in main.py.
> Alternativ: `update_schedule()` nutzen, die intern `self.db.get()` macht.

Beim ersten Start sollen Standard-Schedules gesetzt werden:

```python
# Nach Plugin-Sync: Default-Schedules fuer Plugins ohne Schedule
DEFAULT_PLUGIN_SCHEDULES = {
    "health_check": "0 5 * * *",       # Taeglich um 05:00 (nach Cleanup + Diagnostic)
    "system_cleanup": "0 4 * * 0",     # Woechentlich Sonntag 04:00
}

for pid, default_schedule in DEFAULT_PLUGIN_SCHEDULES.items():
    config = await session.get(PluginConfig, pid)  # Direkter DB-Zugriff, session aus Step 6.1
    if config and config.schedule is None:
        try:
            await plugin_service.update_schedule(pid, default_schedule)
            logger.info(f"Set default schedule for '{pid}': {default_schedule}")
        except PluginNotFoundError:
            logger.debug(f"Plugin '{pid}' not in DB, skipping default schedule")
```

> [verify-plan] Kollision: 03:00 waere problematisch — Empfehlung 05:00 ist korrekt und uebernommen.

### Verifikation V3.1

| # | Test | Erwartung |
|---|------|-----------|
| 1 | Server-Start mit Schedule in DB | Log: `Plugin 'health_check' scheduled: 0 5 * * *` |
| 2 | Plugin laeuft zur geplanten Zeit | `PluginExecution` Eintrag mit `trigger_source: "scheduled"` |
| 3 | Schedule via API aendern | `PUT /api/v1/plugins/health_check/schedule` → neuer Cron sofort aktiv. [verify-plan] Route bestaetigt (plugins.py:220) |
| 4 | Schedule entfernen | `PUT` mit `null` → Job deregistriert, Plugin laeuft nicht mehr |
| 5 | Server-Neustart | Schedules werden aus DB geladen und neu registriert |
| 6 | Default-Schedules | Erster Start: health_check + system_cleanup haben Schedules |

---

## V2.2 — Report-Retention (90-Tage Cleanup)

### Was fehlt

Diagnostic Reports werden unbegrenzt in der DB gesammelt. Bei taeglichen Diagnosen (V2.1) waechst die Tabelle schnell. Reports aelter als 90 Tage sollen archiviert werden (JSONB-Checks entfernen, Summary behalten).

### Implementierung

#### Schritt 1: cleanup_old_reports Methode (~30min)

**Datei:** `god_kaiser_server/src/services/diagnostics_service.py`

> [verify-plan] KRITISCHES PROBLEM: `checks` Column ist `nullable=False`!
> Das DiagnosticReport Model (diagnostic.py:37) definiert:
> ```python
> checks: Mapped[list] = mapped_column(JSON, nullable=False)
> ```
> → `checks=None` wuerde einen DB-Constraint-Error ausloesen!
>
> **Loesung: Alembic Migration VORHER noetig!**
> Entweder:
> A) Migration: `ALTER COLUMN checks SET nullable=True` (empfohlen)
> B) Statt `None` ein leeres Array `[]` setzen (kein Schema-Change, aber weniger klar)
>
> Empfehlung: Option A — Migration erstellen, DANN cleanup implementieren.

> [verify-plan] Weitere Ergebnisse:
> - [x] Feld heisst `checks` (NICHT `check_results` oder `results`) — bestaetigt in diagnostic.py:37
> - [x] `update()` Import: `from sqlalchemy import update` — muss hinzugefuegt werden (aktuell nicht importiert in diagnostics_service.py, aber `text` und `func` sind bereits da)
> - [x] `DiagnosticReport` Model: Import bestaetigt als `DiagnosticReportModel` in diagnostics_service.py:20

**Vorab-Migration (Alembic):**
```bash
alembic revision --autogenerate -m "make_diagnostic_checks_nullable"
```
Inhalt:
```python
def upgrade():
    op.alter_column('diagnostic_reports', 'checks', nullable=True)

def downgrade():
    op.alter_column('diagnostic_reports', 'checks', nullable=False)
```

**Neue Methode in DiagnosticsService:**

```python
async def cleanup_old_reports(self, max_age_days: int = 90) -> int:
    """Archive diagnostic reports older than max_age_days.

    Archives by setting `checks` JSON to null while keeping
    summary fields (overall_status, started_at, triggered_by).
    This preserves the history timeline without consuming storage.

    Requires: checks column must be nullable (Alembic migration).

    Args:
        max_age_days: Reports older than this are archived. Default 90.

    Returns:
        Number of archived reports.
    """
    from sqlalchemy import update

    cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)

    stmt = (
        update(DiagnosticReportModel)
        .where(DiagnosticReportModel.started_at < cutoff)
        .where(DiagnosticReportModel.checks.isnot(None))
        .values(checks=None)
    )
    result = await self.session.execute(stmt)
    await self.session.commit()

    archived = result.rowcount
    if archived > 0:
        logger.info(f"Archived {archived} diagnostic reports older than {max_age_days} days")
    return archived
```

> [verify-plan] HINWEIS: Filter auf `started_at` statt `created_at` — DiagnosticReport hat KEIN `created_at` Feld! Verfuegbare Timestamp-Felder: `started_at`, `finished_at`.

#### Schritt 2: Retention in Scheduler einhaengen (~10min)

**Datei:** `god_kaiser_server/src/main.py`

**Aenderung:** In der `_scheduled_daily_diagnostic()` Funktion (aus V2.1 Schritt 3) nach dem Diagnostic-Run den Cleanup ausfuehren:

> [verify-plan] Session-Pattern korrigiert: `async for session in get_session(): ... break` (nicht `async with`)

```python
async def _scheduled_daily_diagnostic():
    """Run full system diagnostic daily + cleanup old reports."""
    try:
        async for session in get_session():
            plugin_registry = PluginRegistry()
            plugin_registry.discover_plugins()
            ps = PluginService(session, plugin_registry)
            diag_service = DiagnosticsService(session=session, plugin_service=ps)

            # 1. Diagnose ausfuehren
            report = await diag_service.run_full_diagnostic(triggered_by="scheduled")
            logger.info(f"Daily diagnostic: {report.overall_status.value} — {report.summary}")

            # 2. Alte Reports archivieren
            archived = await diag_service.cleanup_old_reports(
                max_age_days=settings.maintenance.diagnostic_report_retention_days
            )
            if archived > 0:
                logger.info(f"Archived {archived} old diagnostic reports")

            break
    except Exception as e:
        logger.error(f"Scheduled daily diagnostic FAILED: {e}")
```

#### Schritt 3: Config-Option (~5min)

**Datei:** `god_kaiser_server/src/core/config.py`

> [verify-plan] In `MaintenanceSettings`-Klasse einfuegen (NICHT Top-Level):

```python
# In class MaintenanceSettings(BaseSettings):
diagnostic_report_retention_days: int = Field(
    default=90,
    alias="DIAGNOSTIC_REPORT_RETENTION_DAYS",
    ge=7,
    le=3650,
    description="Days to keep full diagnostic reports before archiving (only summary kept)",
)
```

Zugriff: `settings.maintenance.diagnostic_report_retention_days` (bereits in Schritt 2 verwendet)

### Verifikation V2.2

| # | Test | Erwartung |
|---|------|-----------|
| 1 | Manueller Test: `cleanup_old_reports(max_age_days=0)` | Alle Reports archiviert (checks=null) |
| 2 | Archivierte Reports in History | `GET /api/v1/diagnostics/history` zeigt Summary aber keine Details |
| 3 | Frontend ReportsTab | Archivierte Reports sichtbar mit "archiviert" Hinweis |
| 4 | Idempotenz | Zweiter Cleanup-Run archiviert 0 (bereits archiviert) |

---

## Git-Voraussetzung (vor Phase B!)

> [verify-plan] Migrationen VERIFIZIERT — alle 3 Dateien existieren im alembic/versions/ Ordner:

**3 untracked Migrationen muessen committed werden:**
```
god_kaiser_server/alembic/versions/add_diagnostic_reports.py   (Phase 4D) ✅ existiert
god_kaiser_server/alembic/versions/add_plugin_tables.py        (Phase 4C) ✅ existiert
god_kaiser_server/alembic/versions/rename_notification_metadata_to_extra_data.py (Fix) ✅ existiert
```

Ohne diese Migrationen funktionieren weder DiagnosticsService (V2.1) noch PluginService (V3.1) korrekt, da die DB-Tabellen fehlen.

> [verify-plan] ZUSÄTZLICHE Migration fuer V2.2 noetig!
> `checks` Column in `diagnostic_reports` ist `nullable=False` — V2.2 braucht eine **4. Migration**:
> ```
> god_kaiser_server/alembic/versions/make_diagnostic_checks_nullable.py  (V2.2, NEU)
> ```
> → Erst NACH den 3 bestehenden Migrationen erstellen und ausfuehren.

**Befehl:** `alembic upgrade head` nach dem Commit.

---

## Scheduler-Uebersicht nach Phase A+B

> [verify-plan] KORRIGIERTE Uebersicht basierend auf echtem Code:

```
CRON-JOBS (Tageszeit-basiert):
  (frei)   — 02:00   database_backup         (V5.1 geplant, NOCH NICHT implementiert!)
  03:00    — cleanup_sensor_data              (MaintenanceService, nur wenn ENABLED)
  03:30    — cleanup_command_history           (MaintenanceService, nur wenn ENABLED)
  04:00    — daily_diagnostic + retention      (V2.1 + V2.2, Phase B, NEU)
  04:00 So — plugin: system_cleanup           (V3.1, Phase B, Default-Schedule, NEU)
  05:00    — plugin: health_check             (V3.1, Phase B, Default-Schedule, NEU)

INTERVAL-JOBS (wiederkehrend):
  15s      — monitor_prometheus_metrics        (main.py, JobCategory.MONITOR)
  30s      — monitor_mqtt_health_check         (MaintenanceService, MONITOR)
  60s      — monitor_health_check_esps         (MaintenanceService, MONITOR)
  60s      — monitor_sensor_health_check       (MaintenanceService, MONITOR)
  5min     — maintenance_suppression_check     (alert_suppression_scheduler)
  1h       — maintenance_cleanup_orphaned_mocks (MaintenanceService, wenn ENABLED)
  1h       — maintenance_digest_emails         (main.py, Phase 4A.1)
  daily    — maintenance_suppression_overdue   (alert_suppression_scheduler, 08:00)
```

> [verify-plan] Job-IDs haben IMMER den `{category}_` Prefix! Z.B. `maintenance_daily_diagnostic`, `custom_plugin_health_check`.

---

## Abhaengigkeiten

> [verify-plan] ERGAENZT: V2.2 braucht zusaetzliche Alembic-Migration (checks nullable)

| Block | Braucht vorher | Blockiert |
|-------|---------------|-----------|
| V2.1 | Git-Migrationen committed (3 bestehende) | V2.2, V3.1 (gleicher Mechanismus) |
| V3.1 | V2.1 (Pattern uebernehmen), Git-Migrationen | V3.2 (Phase D, Schedule-UI) |
| V2.2 | V2.1 (laeuft im selben Job) + **Alembic Migration: checks nullable** | Nichts |

**Empfohlene Reihenfolge:** V2.1 → V3.1 → V2.2

> [verify-plan] ZUSAETZLICHE Abhaengigkeit fuer ALLE Blocks:
> - `parse_cron_string()` muss in `scheduler.py` existieren BEVOR V3.1 implementiert wird
> - V3.1 Schritt 4 (Schedule-Update Reaktivitaet) aendert bestehende `update_schedule()` in `plugin_service.py` — Side-Effects auf existierende API pruefen
