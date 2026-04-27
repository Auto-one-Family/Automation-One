# AUT-194 — DailyAnalysisJob Design-Doc

**Stand:** 2026-04-26  
**Linear:** [AUT-194](https://linear.app/autoone/issue/AUT-194)  
**Status:** Etappe 3 — Design-Doc auf Basis AUT-192 + AUT-193 fertig; Implementierung wartet auf Freigabe.  
**Basis:** `docs/analysen/mail-server-iststand-2026-04-26.md` + `docs/analysen/error-system-handshakes-correlation-stack-inventur-2026-04-26.md`

> **Hinweis an TM:** Dieses Design-Doc ist die Grundlage für Etappe 4 (Implementierung). Alle Akzeptanzkriterien aus AUT-194 sind hier verankert. Starte die Implementierung erst nach expliziter Freigabe durch den automation-experten.

---

## Überblick

`DailyAnalysisJob` wird als **6. CentralScheduler-Service** implementiert. Er läuft 2x/Tag (06:00 und 18:00 lokale Zeit), sammelt einen vollständigen Stack-Snapshot, analysiert ihn via Claude API (`ai_service.analyze_daily_snapshot()`), schreibt einen TASK-PACKAGES-kompatiblen Markdown-Bericht und versendet diesen per Mail — sobald Mail-Server stabil ist (AUT-192 Go-Signal).

---

## Erkenntnisse aus den Analyse-Berichten

### Aus AUT-192 (Mail-Server)

- **Mail-Stack ist vollständig implementiert** (`email_service.py`, `email_retry_service.py`, `email_log`-Tabelle, `NotificationActionExecutor`)
- **3 kritische Blocker** vor Mail-Aktivierung: `.env.example` fehlt, `resend`/`jinja2` nicht in `pyproject.toml`, `EMAIL_FROM` Default nicht produktionstauglich
- **Feature-Flag:** `EMAIL_DAILY_REPORT_ENABLED` (Default: off) muss neu in `NotificationSettings` ergänzt werden
- **Empfehlung:** Resend als Primärprovider mit `notifications@phyta.org` — nach Critical-Fixes + 48h-Stabilitätstest aktivieren
- **Retry-Pfad bereits vorhanden:** `email_log.status='failed'` + `EmailRetryService` (5min-Delay, max 3 Versuche)

### Aus AUT-193 (Error-System)

- **9 False-Error-Patterns** definiert — müssen explizit in System-Prompt von `ai_service.analyze_daily_snapshot()` kodiert sein
- **`SystemAnalysisRequest`-Schema** vollständig spezifiziert (Sektion 6 von AUT-193)
- **3 Blind-Spots mit High-Risiko** die der DailyAnalysisJob nicht als Fehler klassifizieren darf: CentralScheduler ohne Health-Endpoint (OBS-01/BS-02), Server ohne LWT (BS-06), Frontend-Errors nicht in Loki (BS-04) — **bekannte Architektur-Gaps, keine Bugs**
- **C6-Regel:** `correlation_id` und `request_id` nicht blind joinen — alle DB-Queries müssen `source_type` filtern
- **AI-Task verliert correlation_id** bei `asyncio.create_task()` — DailyAnalysisJob muss correlation_id manuell durchreichen

---

## Implementierungsplan

### Schritt 1: `SystemAnalysisRequest`-Schema anlegen (server-dev)

**Datei:** `El Servador/god_kaiser_server/src/services/ai_service.py`

Neue Pydantic-Modelle hinzufügen (vollständiges Schema aus AUT-193 Sektion 6):
- `ErrorSourceSummary`, `HeartbeatHealthSummary`, `ConfigPushSummary`, `NotificationSummary`, `SchedulerHealthSummary`, `FalseErrorPatternFlags`, `SystemAnalysisRequest`

Neue Methode `analyze_daily_snapshot(request: SystemAnalysisRequest) -> list[ErrorAnalysisFinding]`:
- Gleicher gecachter System-Prompt-Block wie `analyze_error()` (Prompt-Caching MUSS wiederverwendet werden)
- Erweiterter System-Prompt mit 9 False-Error-Patterns aus AUT-193 Sektion 4
- Multi-Error-Input → sortierte `List[ErrorAnalysisFinding]` nach Severity

**System-Prompt-Ergänzungen (Pflicht, alle 9 Patterns):**
```
BEKANNTE HARMLOSE PATTERNS (nicht als echte Findings klassifizieren):
1. Heartbeat-ACK-Delay: Latenz <60s = normal (SAFETY-P5 sendet ACK vor DB-Writes)
2. Reconnect-Storm: Multiple Heartbeats 0-120s nach ESP-Reconnect = normal
3. Config-Push-Chattering: Multiple Config-Pushes <45s von gleichem ESP = normal
4. F-V4-01 Post-Restart Race: Zone/Subzone-ACKs innerhalb 30s nach Server-Restart = normal
5. LWT-Flood bei Netz-Outage: Circuit-Breaker-Drops bei >3 simultanen LWTs = Schutzverhalten
6. actuator_states "idle"-Werte = kosmetisches Legacy, kein Fehler
7. Validation-Fehler ohne normalen ACK = by Design (_send_heartbeat_error_ack liefert Error-ACK)
8. Discovery-Rate-Limit ohne ACK = by Design, ESP retried beim nächsten Heartbeat
9. Notification-Dedup-Treffer = aktiver ISA-18.2-Schutz, kein Missing-Alert
```

---

### Schritt 2: Snapshot-Sammlungs-Service anlegen (server-dev)

**Datei:** `El Servador/god_kaiser_server/src/services/daily_snapshot_service.py` (neu)

Aufgabe: Aggregiert alle Datenquellen zu einem `SystemAnalysisRequest`-Objekt.

```python
class DailySnapshotService:
    async def collect(self, period_hours: int = 24) -> SystemAnalysisRequest:
        # Parallel queries via asyncio.gather():
        # 1. audit_logs: firmware errors, LWT events, config responses
        # 2. esp_heartbeat_logs: heartbeat health aggregations
        # 3. email_log: email failure counts (5851/5852)
        # 4. plugin_executions: AutoOps job stats
        # 5. Prometheus /metrics: ack_success_rate, reconnect_events, dedup counts
        # 6. ESP device status: total/online/offline from ESP repository
        # 7. False-error pattern detection via time-window queries
        ...
```

**Wichtig:** Alle Queries müssen `source_type` filtern (C6-Regel). Keine Query ohne `WHERE source_type IN ('mqtt', 'api')`.

**CentralScheduler OBS-01 Workaround:** Bis BS-02 behoben, `scheduler_health` aus `_job_stats` intern befüllen — `DailySnapshotService` bekommt direkte Referenz auf `CentralScheduler`.

---

### Schritt 3: Anti-Storm-Mechanismen implementieren (server-dev)

**Idempotenz-Key:** `(run_date, run_slot)` in `plugin_executions`-Tabelle

```python
# Idempotenz-Guard
existing = await plugin_repo.get_by_key(run_date=today, run_slot=slot)
if existing and existing.status == "completed":
    logger.info("DailyAnalysisJob already completed for %s/%s — skipping", today, slot)
    return
```

**Error-Code-Dedup:** Gleicher `error_code + esp_id` innerhalb 1h → nur 1 Finding

**Storm-Detection:** >6 Errors/h von gleichem Cluster → 1 zusammengefasstes Storm-Finding (ISA-18.2)

**Self-Exclusion:** `plugin_executions`-Einträge des `DailyAnalysisJob` selbst aus eigenem Report filtern

---

### Schritt 4: reporter.py — TASK-PACKAGES-Format (server-dev)

**Datei:** `El Servador/god_kaiser_server/src/autoops/core/reporter.py`

Neue Methode `generate_daily_report(findings, snapshot_request, session_id)`:

Output-Pfad: `autoops/reports/daily_report_{YYYY-MM-DD}_{slot}.md`

Das Format muss direkt als auto-debugger-Steuerdatei nutzbar sein:

```markdown
# DAILY-ANALYSIS-REPORT {date} {slot}

## TASK-PACKAGES

### PKG-01 — {finding.linear_title}
**Priorität:** {finding.severity}  
**Schicht:** {affected_components}  
**Deliverable:** {finding.linear_description}  
**Verify-Gate:** DA-{slot}-{i:02d}

## SPECIALIST-PROMPTS

### server-dev — PKG-01
{finding.linear_description}
Code-Referenzen: {finding.code_references}
Empfohlene Aktionen: {finding.recommended_actions}
```

---

### Schritt 5: DailyAnalysisJob als 6. CentralScheduler-Service (server-dev)

**Datei:** `El Servador/god_kaiser_server/src/services/central_scheduler.py`

```python
class DailyAnalysisJob:
    SLOTS = {"morning": "06:00", "evening": "18:00"}  # lokale Zeit

    async def run(self, slot: str, db_session: AsyncSession) -> None:
        # 1. Idempotenz-Guard (plugin_executions)
        # 2. Snapshot sammeln (DailySnapshotService.collect())
        # 3. Analyse via ai_service.analyze_daily_snapshot()
        # 4. Report schreiben (reporter.generate_daily_report())
        # 5. Mail-Versand wenn EMAIL_DAILY_REPORT_ENABLED=true
        # 6. plugin_executions updaten (status, last_run_at, last_status)
```

**APScheduler-Trigger:**
```python
scheduler.add_job(
    daily_job.run,
    "cron", hour=6, minute=0,
    id="daily_analysis_morning",
    kwargs={"slot": "morning"},
    max_instances=1,  # Verhindert Doppellauf
    replace_existing=True,
)
```

---

### Schritt 6: Mail-Versand-Pfad (server-dev)

**Feature-Flag:** `EMAIL_DAILY_REPORT_ENABLED` in `NotificationSettings` (Default: `False`)

```python
if settings.notifications.email_daily_report_enabled:
    success = await email_service.send_email(
        to="robin@phyta.org",
        subject=f"AutomationOne Daily Report — {today} {slot}",
        text_body=report_content,
        template_name="daily_report",
    )
    if not success:
        # Bereits in email_log als 'failed' gespeichert → EmailRetryService übernimmt
        logger.warning("Daily report mail failed — EmailRetryService will retry")
```

**Kein silent drop:** `email_log.status='failed'` + `retry_count` bei Fehler (AUT-192-Anforderung bereits erfüllt durch `EmailRetryService`).

---

### Schritt 7: CentralScheduler Health-Endpoint — Pre-Requisite Sub-Issue

**Blockiert:** DailyAnalysisJob-Monitoring  
**Aufwand:** 0.5d (AUT-193 BS-02)

```python
@router.get("/v1/scheduler/health")
async def get_scheduler_health(current_user: ActiveUser):
    return scheduler.get_scheduler_status()
```

Kann parallel zur DailyAnalysisJob-Implementierung entwickelt werden. Wenn noch nicht vorhanden: als Sub-Issue AUT-194.1 ausgliedern.

---

## Akzeptanzkriterien (aus AUT-194, verifizierbar)

| # | Kriterium | Verifikation |
|---|-----------|-------------|
| AC1 | `DailyAnalysisJob` läuft 2x/Tag, im Log nachweisbar | Loki: `"DailyAnalysisJob completed for {date}/{slot}"` 2x/Tag |
| AC2 | Idempotenz verhindert Doppellauf | `plugin_executions` hat max 2 Einträge pro Tag mit `status='completed'` |
| AC3 | `autoops/reports/daily_report_*.md` maschinell parsbar im TASK-PACKAGES-Format | Datei-Inspektion: enthält `## TASK-PACKAGES` und `## SPECIALIST-PROMPTS` Sections |
| AC4 | False-Error-Patterns im System-Prompt dokumentiert | Code-Inspektion: `ai_service.py` enthält alle 9 Patterns als `BEKANNTE HARMLOSE PATTERNS` |
| AC5 | Storm-Detection: 10-Errors/h-Cluster → 1 Storm-Finding | Unit-Test mit synthetisch erzeugtem Cluster |
| AC6 | Self-Exclusion: DailyAnalysisJob-Einträge tauchen nicht im eigenen Report auf | Unit-Test: `plugin_executions` mit `job_name='daily_analysis'` wird herausgefiltert |
| AC7 | Mail-Versand-Pfad existiert, hinter Feature-Flag schaltbar | Code-Inspektion: `EMAIL_DAILY_REPORT_ENABLED` in `NotificationSettings` |
| AC8 | CentralScheduler-Health-Endpoint zeigt `daily_analysis_job` als running/last_run_at/last_status | `GET /v1/scheduler/health` → Response enthält `daily_analysis_job` |

---

## Abhängigkeiten und Reihenfolge

```
AUT-192 Critical-Fixes (pyproject.toml, .env.example, EMAIL_FROM)
    └─► EMAIL_DAILY_REPORT_ENABLED = true
            └─► Mail-Versand in DailyAnalysisJob aktiv

AUT-193 Schema (SystemAnalysisRequest)
    └─► ai_service.analyze_daily_snapshot() implementierbar
            └─► DailyAnalysisJob kann Analyse durchführen

OBS-01 / AUT-194.1 Health-Endpoint (CentralScheduler)
    └─► DailyAnalysisJob in Health-Response sichtbar (AC8)
```

**Implementierungs-Reihenfolge:**
1. Schritt 1 (Schema + analyze_daily_snapshot) — unabhängig, sofort startbar
2. Schritt 2 (DailySnapshotService) — unabhängig, parallel zu 1 möglich
3. Schritt 3 (Anti-Storm) — parallel zu 1+2 möglich
4. Schritt 4 (Reporter) — parallel zu 1+2+3 möglich
5. Schritt 5 (DailyAnalysisJob + CentralScheduler) — braucht 1+2+3+4 fertig
6. Schritt 6 (Mail) — parallel zu 5, unabhängig
7. Schritt 7 (Health-Endpoint) — parallel zu allen, eigenes Sub-Issue

---

## Verify-Gates

| Gate | Beschreibung |
|------|-------------|
| DA-SCHEMA-01 | `SystemAnalysisRequest` Pydantic-Validation grün für Test-Snapshot |
| DA-SCHEMA-02 | `analyze_daily_snapshot()` gibt `list[ErrorAnalysisFinding]` zurück bei gültigem Input |
| DA-STORM-01 | 10 gleiche error_code/esp_id-Einträge in 1h → 1 Storm-Finding |
| DA-IDEM-01 | Zweiter Job-Run mit gleichem `(run_date, slot)` → `"already completed — skipping"` in Log |
| DA-SELF-01 | `plugin_executions` mit `job_name='daily_analysis'` → nicht im Report-Output |
| DA-MAIL-01 | `EMAIL_DAILY_REPORT_ENABLED=false` → kein Mail-Versand, kein Email-Log-Eintrag |
| DA-MAIL-02 | `EMAIL_DAILY_REPORT_ENABLED=true`, Resend-Fehler → `email_log.status='failed'`, Retry durch EmailRetryService |
| DA-FORMAT-01 | `daily_report_*.md` enthält `## TASK-PACKAGES` und `## SPECIALIST-PROMPTS` Sections |

---

## Relevante Code-Referenzpunkte

```
El Servador/god_kaiser_server/src/services/ai_service.py       — analyze_error(), Prompt-Caching
El Servador/god_kaiser_server/src/autoops/core/reporter.py     — generate_session_report()
El Servador/god_kaiser_server/src/autoops/core/api_client.py   — GodKaiserClient (994 Zeilen)
El Servador/god_kaiser_server/src/services/central_scheduler.py — 5 bestehende Background-Services
El Servador/god_kaiser_server/src/core/server_error_mapping.py  — 80+ Error-Codes
El Servador/god_kaiser_server/src/services/email_service.py    — EmailService, Feature-Flag
El Servador/god_kaiser_server/src/db/models/plugin.py          — plugin_executions ORM
```
