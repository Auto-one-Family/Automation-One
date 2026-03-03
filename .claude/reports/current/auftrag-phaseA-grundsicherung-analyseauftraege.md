# Auftrag: PHASE A — Grundsicherung — 4 Analyseauftraege

> **Erstellt:** 2026-03-03
> **Erstellt von:** Automation-Experte (Life-Repo)
> **Abgeschlossen:** 2026-03-03
> **Status:** **ABGESCHLOSSEN** — Alle 4 Bloecke BESTANDEN. V5.1 implementiert. V5.5/V7.1/V7.2 verifiziert.
> **Ziel-Repo:** `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one`
> **Kontext:** Roadmap `roadmap-verification-hardware-test.md`, Phase A = Grundsicherung VOR Hardware-Test 2
> **Warum zuerst:** Datensicherheit (Backup) und Stabilitaets-Verifikation sind **Voraussetzung** fuer einen aussagekraeftigen Hardware-Test. Ohne V5.1 koennen Daten bei einem Crash verloren gehen. Ohne V5.5/V7.1/V7.2 wissen wir nicht ob das System stabil genug fuer den Test ist.
> **Parallelisierbar:** Alle 4 Bloecke sind voneinander unabhaengig und koennen parallel bearbeitet werden.

---

## Uebersicht Phase A

| Block | Was | Typ | Status | Report |
|-------|-----|-----|--------|--------|
| V5.1 | PostgreSQL-Backup — `DatabaseBackupService` | Code schreiben | **IMPLEMENTIERT** ✓ | `PHASE_A_V5.1_ANALYSE.md` |
| V5.5 | Safety-Garantien verifizieren | Nur Pruefung | **BESTANDEN** ✓ | `PHASE_A_V5.5_SAFETY_REPORT.md` |
| V7.1 | Alert-Kategorie-Trennung verifizieren | Nur Pruefung | **BESTANDEN** ✓ | `PHASE_A_V7.1_KATEGORIE_REPORT.md` |
| V7.2 | Absturz-Sicherheit verifizieren | Code-Review + manuelle Tests | **BESTANDEN** ✓ (D3/D4 manuell ausstehend) | `PHASE_A_V7.2_ABSTURZ_REPORT.md` |

**Ergebnis: SICHER FUER HARDWARE-TEST. Phase B kann gestartet werden.**

---

## V5.1 — PostgreSQL-Backup: DatabaseBackupService mit pg_dump

### Vision und Systemeinbettung

AutomationOne speichert **alle** kritischen Daten in PostgreSQL (19 Tabellen): Sensor-Messwerte, ESP-Konfigurationen, Logic Rules, Notifications, Diagnostic Reports, Plugin-Configs, Audit-Logs. Ein Datenverlust waere katastrophal — besonders waehrend eines Hardware-Tests, bei dem aktiv Daten generiert werden.

**Wo es hingehoert im System:**

```
Bestehende Backup-Infrastruktur:
├── audit_backup_service.py     ← JSON-Export einzelner Audit-Tabelle (EXISTIERT)
├── audit_retention_service.py  ← Severity-basierte Retention (EXISTIERT)
├── maintenance/service.py      ← Cleanup-Jobs (EXISTIERT)
│
NEU:
├── database_backup_service.py  ← PostgreSQL pg_dump Vollbackup (ZU ERSTELLEN)
│
Scheduler-Reihenfolge (main.py Schritt 3.4):
├── 02:00 — database_backup (NEU) ← VOR Cleanup!
├── 03:00 — sensor_data_cleanup (EXISTIERT)
├── 03:30 — command_history_cleanup (EXISTIERT)
├── hourly — orphaned_mocks_cleanup (EXISTIERT)
└── 04:00 — daily_diagnostic (V2.1, PHASE B)
```

**Warum 02:00:** Das Backup muss VOR dem Cleanup um 03:00 laufen. Wenn der Cleanup Daten loescht und danach ein Problem auftritt, hat man ohne Backup keine Moeglichkeit zur Wiederherstellung. Die Reihenfolge Backup→Cleanup ist eine Safety-Garantie.

### Analyseauftrag (exakte Schritte fuer auto-one Agent)

#### A1: Docker-Topologie analysieren

**Ziel:** Verstehen wie pg_dump technisch ausgefuehrt werden muss, gegeben die Docker-Container-Struktur.

**Pruefen:**
- [ ] `docker-compose.yml` / `docker-compose.dev.yml` lesen: Wie heisst der PostgreSQL-Container? (Bestätigt: `automationone-postgres`, Service: `postgres`)
- [ ] Netzwerk-Topologie: Server-Container (`automationone-server`) kann Postgres-Container erreichen. MQTT-Host in Settings: `mqtt-broker` (Docker-DNS), Postgres via `DATABASE_URL` in `.env`. Docker-Network: default bridge
- [ ] PostgreSQL Version im Container: `docker exec automationone-postgres pg_dump --version` — Welche Version? Welche Dump-Formate verfuegbar?
- [ ] PostgreSQL Credentials: Stehen in `.env` (`POSTGRES_USER=god_kaiser`, `POSTGRES_PASSWORD`, `POSTGRES_DB=god_kaiser_db`). Server nutzt `DATABASE_URL=postgresql+asyncpg://...` — pg_dump braucht Standard-Connection-String
- [ ] Volume-Mounting: Hat der Server-Container ein Volume gemountet auf das er Backup-Dateien schreiben kann? Oder muss ein neues Volume definiert werden?

**3 technische Optionen bewerten:**

| Option | Beschreibung | Pro | Contra |
|--------|-------------|-----|--------|
| A | `asyncio.subprocess` → `docker exec postgres pg_dump` vom Server-Container | Einfach, direkter Zugriff | Braucht Docker Socket oder docker CLI im Server-Container |
| B | `asyncio.subprocess` → `pg_dump` direkt im Server-Container (pg_dump installieren) | Kein Docker-Socket noetig | pg_dump muss im Server-Image installiert sein |
| C | PostgreSQL `COPY TO` via `asyncpg` | Rein Python, kein Subprocess | Kein vollstaendiges Backup (nur Daten, kein Schema) |

**Empfehlung:** Option B — `pg_dump` im Server-Container installieren. **WICHTIG:** Dockerfile ist `El Servador/Dockerfile` (multi-stage build, python:3.11-slim-bookworm). `postgresql-client` muss in der Runtime-Stage (Stage 2) installiert werden, da die Builder-Stage nicht ins Final-Image kommt. `libpq5` ist bereits installiert, aber `pg_dump` Binary fehlt. Hinzufuegen: `apt-get install -y --no-install-recommends postgresql-client` in Runtime-Stage. Der Server-Container kann PostgreSQL ueber Docker-DNS erreichen (`postgres:5432`, Service-Name, NICHT Container-Name).

**Report:** `.claude/reports/current/PHASE_A_V5.1_ANALYSE.md` mit gewaehlter Option und Begruendung.

#### A2: Bestehende Backup-Patterns analysieren

**Ziel:** Den `DatabaseBackupService` konsistent mit bestehenden Services bauen.

**Pruefen:**
- [ ] `src/services/audit_backup_service.py` komplett lesen: Service-Struktur **bestätigt:** `create_backup(events, metadata)`, `list_backups(include_expired)`, `delete_backup(backup_id)`, `cleanup_expired_backups()`, `restore_backup(backup_id)`, `get_backup(backup_id)`. Constructor: `__init__(self, session: AsyncSession, backup_dir=None, retention_days=None)` — nimmt Session, NICHT Settings/Config! Backups werden als JSON-Dateien in `backups/audit_logs/` gespeichert (relativ zum god_kaiser_server/ Root). **WICHTIG fuer DatabaseBackupService:** Anderes Pattern noetig — pg_dump braucht keine DB-Session sondern subprocess + Connection-String
- [ ] `src/core/config.py`: **Es existieren KEINE `BACKUP_*` ENV-Variablen!** Nur `LOG_FILE_BACKUP_COUNT` (fuer Log-Rotation). Alle DB-Backup-ENVs muessen komplett NEU erstellt werden. Pattern: Neue Settings-Subclass analog zu `MaintenanceSettings` oder direkt in bestehende Settings-Klasse
- [ ] `src/core/scheduler.py`: `add_cron_job(job_id, func, cron_expression: Dict, args, kwargs, category=MAINTENANCE)` — Cron-Expression ist ein Dict `{"hour": 3, "minute": 0}`. Job-ID wird automatisch mit Kategorie-Prefix versehen: `maintenance_cleanup_sensor_data`. Jobs werden beim Neustart durch `MaintenanceService.start()` re-registriert (MemoryJobStore, nicht persistent)
- [ ] **WICHTIG:** Scheduler-Jobs werden NICHT direkt in `src/main.py` registriert, sondern in `src/services/maintenance/service.py:start()`. `main.py` Schritt 3.4.2 ruft `init_maintenance_service()` auf, das `.start()` triggert. Der neue Backup-Job muss entweder in `MaintenanceService.start()` oder als separater Step in `main.py` (analog zu Step 3.4.4 Digest Service) eingefuegt werden

**Ergebnis:** Architektur-Entscheidung fuer `DatabaseBackupService`:
```python
# Erwartete Klasse (Pseudocode, angepasst an echte Patterns)
class DatabaseBackupService:
    def __init__(self, settings: Settings):
        # Kein session noetig — pg_dump ist subprocess-basiert
        self.backup_dir = Path("backups/database")  # Relativ wie audit_backup_service
        self.db_host = "postgres"  # Docker-DNS Service-Name
        self.db_port = 5432
        self.db_name = settings.database.db_name  # POSTGRES_DB
        self.db_user = settings.database.user  # POSTGRES_USER
        # Passwort via PGPASSWORD env var an subprocess uebergeben (sicher)

    async def create_backup(self) -> BackupInfo:
        """pg_dump → .sql.gz, return metadata"""

    async def list_backups(self) -> list[BackupInfo]:
        """Alle Backups mit Datum, Groesse"""

    async def delete_backup(self, backup_id: str) -> bool:
        """Einzelnes Backup loeschen"""

    async def cleanup_old_backups(self, max_age_days: int = 7, max_count: int = 20):
        """GVS: 7 daily behalten, max 20 insgesamt"""

    async def restore_backup(self, backup_id: str, confirm: bool = False) -> bool:
        """psql < backup.sql.gz (NUR mit confirm=True)"""
```

#### A3: Implementierung — Dateien und Aenderungen

**Neue Dateien:**

| Datei | Beschreibung |
|-------|-------------|
| `src/services/database_backup_service.py` | Service-Klasse (s.o.) |
| `src/api/v1/backups.py` | REST-Router: 5 Endpoints |
| `tests/unit/test_database_backup_service.py` | Unit-Tests |

**Zu aendernde Dateien:**

| Datei | Aenderung |
|-------|-----------|
| `src/core/config.py` | 3 neue ENV-Variablen: `DB_BACKUP_ENABLED` (Default: True), `DB_BACKUP_HOUR` (Default: 2), `DB_BACKUP_MAX_AGE_DAYS` (Default: 7) |
| `src/api/v1/__init__.py` | `backups_router` registrieren |
| `src/main.py` nach Step 3.4.2 (ca. Zeile 325) | Neuen Step 3.4.X einfuegen: `DatabaseBackupService` initialisieren und Cron-Job registrieren via `_central_scheduler.add_cron_job()` — analog zu Step 3.4.4 (Digest Service) |
| `El Servador/Dockerfile` (Runtime-Stage, Zeile ~45) | `postgresql-client` zu `apt-get install` hinzufuegen fuer `pg_dump` Binary |

**REST-API Endpoints:**

| Method | Route | Beschreibung | Auth |
|--------|-------|-------------|------|
| `POST` | `/v1/backups/database/create` | Sofort-Backup ausloesen | Admin |
| `GET` | `/v1/backups/database/list` | Alle Backups auflisten | Admin |
| `GET` | `/v1/backups/database/{id}/download` | Backup-Datei herunterladen | Admin |
| `DELETE` | `/v1/backups/database/{id}` | Einzelnes Backup loeschen | Admin |
| `POST` | `/v1/backups/database/{id}/restore` | Restore mit `confirm=True` Pflicht | Admin |

**Prometheus-Metriken (in `src/core/metrics.py`):**

| Metrik | Typ | Beschreibung |
|--------|-----|-------------|
| `god_kaiser_backup_created_total` | Counter | Erfolgreiche Backups |
| `god_kaiser_backup_failed_total` | Counter | Fehlgeschlagene Backups |
| `god_kaiser_backup_size_bytes` | Gauge | Groesse des letzten Backups |
| `god_kaiser_backup_last_success_timestamp` | Gauge | Unix-Timestamp des letzten erfolgreichen Backups |

**Grafana-Alert (in bestehender Alert-Datei):**

```yaml
- alert: DatabaseBackupMissing
  expr: time() - god_kaiser_backup_last_success_timestamp > 90000  # >25h
  for: 1h
  labels:
    severity: warning
  annotations:
    summary: "Kein DB-Backup seit >25h"
```

#### A4: Verifikation

| # | Test | Erwartung |
|---|------|-----------|
| 1 | `POST /v1/backups/database/create` | `.sql.gz` Datei in `backups/database/`, Response mit `id`, `size`, `created_at` |
| 2 | `GET /v1/backups/database/list` | Liste aller Backups mit Metadaten |
| 3 | Scheduler-Job um 02:00 | Backup-Datei entsteht automatisch, Log-Eintrag `Database backup created successfully` |
| 4 | Cleanup nach 7 Tagen | Aeltere Backups werden geloescht, max 20 bleiben |
| 5 | Backup VOR Cleanup | Timestamp 02:00 < Cleanup-Timestamp 03:00 (in Scheduler-Registrierung pruefen) |
| 6 | Prometheus-Metrik | `god_kaiser_backup_last_success_timestamp` aktualisiert sich nach Backup |
| 7 | Restore (optional) | `POST /v1/backups/database/{id}/restore?confirm=true` → DB wiederhergestellt |

---

## V5.5 — Safety-Garantien verifizieren

### Vision und Systemeinbettung

AutomationOne hat ein **Safety-First-Design**: Emergency-Stop Events, CRITICAL-Alerts und Audit-Logs duerfen unter **keinen Umstaenden** durch automatische Cleanup-Jobs geloescht werden. Diese Garantie muss vor dem Hardware-Test verifiziert werden, weil waehrend des Tests Emergency-Stops und Critical-Alerts auftreten koennten — und diese Daten fuer die Post-Test-Analyse essentiell sind.

**Wo es im System sitzt:**

```
Safety-Kette:
├── audit_retention_service.py
│   ├── severity_days: {info: 30, warning: 90, error: 365, critical: 0}
│   │                                                         ↑ 0 = NIE loeschen
│   ├── preserve_emergency_stops: True  ← Flag existiert
│   └── cleanup() → filtert CRITICAL + Emergency-Stops heraus
│
├── maintenance/service.py
│   ├── sensor_data_cleanup()   → 03:00
│   └── command_history_cleanup() → 03:30
│
└── main.py Schritt 3.4.2 — Scheduler-Registrierung
    ├── Reihenfolge: Backup (02:00) → Cleanup (03:00, 03:30)
    └── Alle Cleanups: default dry_run=True
```

### Analyseauftrag (exakte Schritte fuer auto-one Agent)

#### B1: Emergency-Stop Persistenz pruefen — **BESTANDEN** ✓ (2026-03-03)

**Pruefen in `src/services/audit_retention_service.py`:**
- [x] Methode heisst `cleanup()` (Zeile 232). Parameter: `dry_run=False, create_backup=True, user_id=None, include_preview_events=False, preview_limit=20, force=False`
- [x] `preserve_emergency_stops` ist in `DEFAULT_RETENTION_CONFIG` (Zeile 55) als `True` definiert. Wird in `cleanup()` Zeile 332-333 verwendet: `conditions.append(AuditLog.event_type != "emergency_stop")` — Emergency-Stops werden aus der DELETE-Query AUSGESCHLOSSEN
- [x] Emergency-Stops werden via `event_type == "emergency_stop"` identifiziert (NICHT `category`). Exakte Zeile: 333
- [x] **Edge Case:** `preserve_emergency_stops=False` → Emergency-Stops werden dann geloescht. **KEINE Warnung im Log.** Akzeptabel (bewusste Entscheidung), Empfehlung: Warning-Log hinzufuegen.
- [x] **Edge Case:** Zugehoerige Audit-Logs (z.B. Actuator-Commands bei Emergency-Stop) sind NICHT geschuetzt — nur `event_type == "emergency_stop"` selbst. Risiko: GERING.

**Ergebnis:** Emergency-Stops ueberleben JEDEN Cleanup-Durchlauf, unabhaengig von Alter. Max-Records Pruning (Zeile 431) schuetzt Emergency-Stops ebenfalls.

#### B2: CRITICAL-Events Schutz pruefen — **BESTANDEN** ✓ (2026-03-03)

**Pruefen in `src/services/audit_retention_service.py`:**
- [x] Severity-Days-Konfiguration (Zeile 47-52): `severity_days = {AuditSeverity.INFO: 30, AuditSeverity.WARNING: 90, AuditSeverity.ERROR: 365, AuditSeverity.CRITICAL: 0}` — Benutzt Enum `AuditSeverity`, nicht Strings.
- [x] `0` = "nie loeschen" ist **bestätigt**: In `cleanup()` Zeile 319 steht `if severity_retention == 0: continue` — bei 0 wird die gesamte Severity UEBERSPRUNGEN, keine DELETE-Query erzeugt.
- [x] CRITICAL-Events werden NIE von der Retention-Logik beruehrt (kein WHERE noetig, da die Schleife `continue` macht).
- [x] **Cross-Check:** Maintenance-Jobs (`SensorDataCleanup`, `CommandHistoryCleanup`, `OrphanedMocksCleanup`) operieren auf `SensorData`/`ActuatorHistory`/ESP-Mock-Tabellen — KEINE beruehrt `AuditLog`. CRITICAL-Events sind sicher.
- [x] **Notification-Tabelle:** CRITICAL-Notifications haben KEIN eigenes Retention-System. Sie werden NIE automatisch geloescht. Kein Risiko.
- [x] **HINWEIS:** `max_records` Pruning (Zeile 430ff) schuetzt CRITICAL Events NICHT explizit — es loescht nach `created_at ASC` ohne Severity-Pruefung. Default `max_records=0` (unlimited) = kein Risiko.

**Ergebnis:** CRITICAL-Events werden weder durch `audit_retention_service` noch durch `maintenance/service` geloescht.

#### B3: Backup-vor-Cleanup Reihenfolge pruefen — **BESTANDEN** ✓ (2026-03-03, mit Hinweis)

**Pruefen in `src/services/maintenance/service.py:start()` (Zeile 70):**
- [x] Cleanup-Jobs werden dort registriert (NICHT direkt in main.py). main.py Schritt 3.4.2 ruft `init_maintenance_service()` + `.start()` auf.
- [x] **IST-Reihenfolge (KEIN Backup-Job vorhanden, V5.1 noch nicht implementiert):**
  ```
  IST:
  03:00 — cleanup_sensor_data     (wenn SENSOR_DATA_RETENTION_ENABLED)
  03:30 — cleanup_command_history  (wenn COMMAND_HISTORY_RETENTION_ENABLED)
  hourly — cleanup_orphaned_mocks (wenn ORPHANED_MOCK_CLEANUP_ENABLED)
  ```
- [x] **Keine Reihenfolge-Garantie:** APScheduler fuehrt verschiedene Jobs parallel aus (jeder Job hat `max_instances=1`, aber verschiedene Jobs koennen gleichzeitig laufen).
- [x] **Risiko-Analyse:** Wenn V5.1-Backup laenger als 60min dauert, startet Cleanup parallel. Empfehlung bei V5.1: Sequenzielle Kette (Backup-Completion triggert Cleanup).
- [x] **Audit-Retention:** Wird NICHT als Scheduler-Job registriert — Default `enabled: False`, nur manuell aufrufbar.

**Ergebnis:** Kein akutes Risiko (Backup-Job existiert noch nicht). Bei V5.1-Implementierung muss Reihenfolge beachtet werden.

#### B4: Dry-Run Default pruefen — **BESTANDEN** ✓ (2026-03-03)

**Pruefen:**
- [x] Maintenance hat separate `*_ENABLED` und `*_DRY_RUN` (Default: `True`) Flags pro Job in `MaintenanceSettings` (config.py:325ff). Audit-Retention hat eigenen `enabled` Flag (Default: `False`, Zeile 45 audit_retention_service.py).
- [x] **Bestätigt:** Disabled Jobs werden gar nicht im Scheduler registriert (maintenance/service.py:80). Die meisten `*_ENABLED` Defaults sind `False`. **Ausnahmen:** `HEARTBEAT_LOG_RETENTION_ENABLED=True` (wegen Volume-Wachstum) und `ORPHANED_MOCK_CLEANUP_ENABLED=True` — beide haben `*_DRY_RUN=True` als Schutz.
- [x] **Kein** globaler Production-Mode-Switch. Jeder Cleanup muss einzeln via ENV aktiviert werden.
- [x] **Dreistufige Sicherheit:** 1) `*_ENABLED=False` → Job nicht registriert. 2) `*_DRY_RUN=True` → nur zaehlen. 3) `audit_retention: force=False` → expliziter Aufruf noetig.
- [x] **Startup-Logging:** `_log_cleanup_status()` (maintenance/service.py:176-205) zeigt beim Start den exakten Status aller Cleanup-Jobs.

**Ergebnis:** Alle destruktiven Operationen sind per Default deaktiviert. Dreistufige Sicherheit bestaetigt.

#### B5: Verifikations-Report

**Report-Format:** `.claude/reports/current/PHASE_A_V5.5_SAFETY_REPORT.md`

```markdown
# V5.5 Safety-Garantien — Verifikationsbericht

## Emergency-Stop Persistenz
- [ ] BESTANDEN / NICHT BESTANDEN
- Exakte Code-Referenz: [Datei:Zeile]
- Edge Cases geprueft: [Liste]

## CRITICAL-Events Schutz
- [ ] BESTANDEN / NICHT BESTANDEN
- Exakte Code-Referenz: [Datei:Zeile]
- Cross-Service-Check: [Ergebnis]

## Backup-vor-Cleanup Reihenfolge
- [ ] BESTANDEN / NICHT BESTANDEN
- Scheduler-Jobs: [Liste mit Zeiten]
- Parallelitaets-Risiko: [Bewertung]

## Dry-Run Default
- [ ] BESTANDEN / NICHT BESTANDEN
- ENV-Variablen: [Liste]
- Default-Werte: [Liste]

## Gesamt-Bewertung
- SICHER FUER HARDWARE-TEST: JA/NEIN
- Offene Punkte: [Liste]
```

---

## V7.1 — Alert-Kategorie-Trennung verifizieren

### Vision und Systemeinbettung

**[KORREKTUR verify-plan] WICHTIG:** Das Notification-Model hat ZWEI getrennte Felder:
- `source` (String(50)): Herkunft — `sensor_threshold`, `device_event`, `logic_engine`, `mqtt_handler`, `grafana`, `autoops`, `manual`, `system`
- `category` (String(50)): Thematische Kategorie — `connectivity`, `data_quality`, `infrastructure`, `lifecycle`, `maintenance`, `security`, `system`

Der Plan verwechselte `source` mit `category`. Die Trennung Sensor vs. System erfolgt ueber `source`, die Kategorisierung ueber `category`.

AutomationOne generiert Notifications mit zwei Klassifizierungs-Dimensionen:

1. **source=sensor_threshold** → category=`data_quality`: Threshold-Ueberschreitungen (Temperatur zu hoch, pH kritisch)
2. **source=device_event** → category=`connectivity`: ESP-Disconnect, LWT-Events
3. **source=system** → category=`infrastructure`/`system`: Server-Probleme, Plugin-Crashes
4. **source=logic_engine** → category variiert: Regel-basierte Aktionen

**Bestätigte Zuweisungen im Code:**
- `sensor_handler.py` Zeile 565/590: `category="data_quality"`, `source` via NotificationCreate
- `error_handler.py`: category aus Payload (`"HARDWARE"` hardcoded oder `payload.get("category")`)
- `lwt_handler.py`: **KEINE direkte Kategorie-Zuweisung gefunden** — muss geprueft werden
- `notification_router.py`: Uebergibt `category` aus NotificationCreate 1:1 (7 Stellen)

Es gibt `NotificationCategory` (Zeile 392 notification.py) und `NotificationSource` (Zeile 378) als **Konstanten-Klassen** (NICHT DB-Enums). Default: `category="system"`.

**Wo es im System sitzt:**

```
Alert-Erzeugung (SOURCE + CATEGORY):
├── src/mqtt/handlers/sensor_handler.py
│   └── Sensor-Daten → Threshold → source=?, category="data_quality"
│
├── src/mqtt/handlers/error_handler.py
│   └── ESP-Fehler → category aus Payload (default "HARDWARE") — INKONSISTENT
│
├── src/mqtt/handlers/lwt_handler.py
│   └── ESP-Disconnect → KEINE category gesetzt (faellt auf Default "system")
│
├── src/services/notification_router.py
│   └── route() → category aus NotificationCreate 1:1 durchgereicht
│
├── src/services/diagnostics_service.py
│   └── Check-Fehler → category = zu pruefen
│
├── src/autoops/plugins/health_check.py
│   └── Plugin-Ergebnis → category = zu pruefen
│
Alert-Anzeige:
├── El Frontend/src/components/quick-action/QuickAlertPanel.vue
│   └── Zeigt Top-5 — gefiltert nach Status+Severity, NICHT nach source/category
│
├── El Frontend/src/components/notifications/NotificationDrawer.vue
│   └── Status-Tabs — kein source/category-Filter
│
└── AlertStatusBar.vue → ISA-18.2 KPIs — keine source/category-Differenzierung
```

### Analyseauftrag (exakte Schritte fuer auto-one Agent)

#### C1: Notification.category Inventar erstellen

**Bestätigt in `src/db/models/notification.py`:**
- [x] `category`: `String(50), nullable=False, default="system"` (Zeile 119-124)
- [x] `NotificationCategory` existiert als **Konstanten-Klasse** (Zeile 392-401), KEIN DB-Enum: `CONNECTIVITY, DATA_QUALITY, INFRASTRUCTURE, LIFECYCLE, MAINTENANCE, SECURITY, SYSTEM`
- [x] Zusaetzlich existiert `NotificationSource` (Zeile 378-388): `LOGIC_ENGINE, MQTT_HANDLER, GRAFANA, SENSOR_THRESHOLD, DEVICE_EVENT, AUTOOPS, MANUAL, SYSTEM`
- [x] Default: `"system"` — wird gesetzt wenn kein expliziter Wert angegeben wird

**Codebase-Suche (2026-03-03 durchgefuehrt):**
- [x] `category=` in allen NotificationCreate-Aufrufen gesucht → 10 Dateien mit NotificationCreate-Referenzen
- [x] `source=` in allen NotificationCreate-Aufrufen gesucht → source/category Mapping erstellt
- [x] `NotificationCategory` Konstanten-Klasse wird NICHT direkt referenziert — alle Stellen verwenden Ad-hoc-Strings (aber konsistent lowercase, ausser error_handler WS-Payload)

**Vollstaendige Tabelle (source UND category) — 2026-03-03:**

| Wo (Datei:Zeile) | Trigger | source | category | Korrekt? |
|---|---|---|---|---|
| sensor_handler.py:572/596 | Threshold Alert | `"sensor_threshold"` | `"data_quality"` | **JA** |
| actuator_alert_handler.py:227-241 | emergency_stop | `"mqtt_handler"` | `"system"` (via ALERT_CATEGORY) | **JA** |
| actuator_alert_handler.py:227-241 | runtime_protection | `"mqtt_handler"` | `"maintenance"` | **JA** |
| actuator_alert_handler.py:227-241 | safety_violation | `"mqtt_handler"` | `"security"` | **JA** |
| actuator_alert_handler.py:227-241 | hardware_error | `"mqtt_handler"` | `"infrastructure"` | **JA** |
| notification_executor.py:152-161 | Logic Rule | `"logic_engine"` | `"system"` (hardcoded) | **HINWEIS** — immer system |
| webhooks.py:253-264 | Grafana Webhook | `"grafana"` | dynamisch aus Payload | **JA** |
| alert_suppression_scheduler.py:199-212 | Wartung faellig | `"system"` | `"maintenance"` | **JA** |
| notifications.py:428-437 | Manuell (Admin-API) | dynamisch aus Request | dynamisch aus Request | **JA** |
| error_handler.py | ESP-Fehler | — | — | **KEIN NotificationCreate!** Nur AuditLog + WS-Broadcast |
| lwt_handler.py | ESP-Disconnect | — | — | **KEIN NotificationCreate!** Nur AuditLog + DB-Update + WS-Broadcast |
| diagnostics_service.py | Check failed | — | — | **KEIN NotificationCreate!** Nur DiagnosticReport |

#### C2: Sensor-Alert-Pipeline pruefen

**Bestätigt in `src/mqtt/handlers/sensor_handler.py`:**
- [x] Threshold-Pruefung ist in einer separaten Methode (ca. Zeile 500+). Nutzt `alert_config` (custom) oder `sensor_config` (global) Thresholds
- [x] **KORREKTUR:** `category="data_quality"` wird gesetzt (Zeile 565/590), NICHT `sensor_threshold`. `sensor_threshold` ist ein **source**-Wert (NotificationSource.SENSOR_THRESHOLD)
- [x] `source="sensor_threshold"` korrekt gesetzt (Zeile 572/596) neben `category="data_quality"`. Konsistent in beiden Aufrufen (suppressed + unsuppressed).
- [x] `source="sensor_threshold"` und `category="data_quality"` korrekt gesetzt.
- [x] Notification fliesst durch `NotificationRouter.route()` (Zeile 603)

**Pruefen in `src/services/notification_router.py` — Ergebnisse (2026-03-03):**
- [x] `route()` Methode (Zeile 69ff): `category` wird 1:1 aus dem eingehenden NotificationCreate uebernommen (Zeile 116). KEINE Ueberschreibung.
- [x] Fingerprint-Dedup: `check_duplicate()` (Zeile 97-102) prueft `source`, `category`, `title`, `user_id` + 60s Window. Category fliesst in Dedup ein → Sensor-Alerts werden NICHT mit System-Alerts dedupliziert.
- [x] `parent_notification_id` wird durchgereicht (Zeile 121). Cascade-Suppression funktioniert unabhaengig von category. KORREKT.

#### C3: System-Alert-Pipeline pruefen — Ergebnisse (2026-03-03)

**Pruefen (mit Vorab-Befunden):**
- [x] `src/mqtt/handlers/lwt_handler.py`: Erzeugt **KEIN NotificationCreate**. Nur AuditLog (`log_device_event()`, Zeile 126-141) + ESP-Status-Update + WS-Broadcast (`esp_health`). Kein Bug — Architektur-Entscheidung. ESP-Disconnects erscheinen NICHT im Notification-Inbox.
- [x] `src/mqtt/handlers/error_handler.py`: Erzeugt **KEIN NotificationCreate**. Speichert nur in AuditLog (`log_mqtt_error()`, Zeile 154-175) + WS-Broadcast (`error_event`). `"HARDWARE"` Grossschreibung (Zeile 77/160/208) betrifft NUR das `details`-Dict im AuditLog und den WS-Payload — NICHT die Notification-Tabelle. **Kein Notification-Bug.** WS-Payload enthaelt Rohdaten vom ESP.
- [x] `src/services/diagnostics_service.py`: Erzeugt **KEINE Notifications**. Speichert nur `DiagnosticReport` in DB.
- [x] `src/core/resilience/circuit_breaker.py`: **KEINE Notifications**. Nur Logging.
- [x] Health-Endpoints: **KEINE Notifications**. Nur HTTP-Status-Responses.

#### C4: Frontend-Nutzung der Kategorie pruefen — Ergebnisse (2026-03-03)

**Pruefen in El Frontend:**
- [x] `notification-inbox.store.ts:255/259`: `category` und `source` werden aus WebSocket-Daten extrahiert und im Store gespeichert. `api/notifications.ts:41/45`: `NotificationDTO` hat `category: NotificationCategory` und `source: NotificationSource` als typisierte Felder.
- [x] `api/notifications.ts:18-25`: `NotificationCategory` Type definiert: `connectivity | data_quality | infrastructure | lifecycle | maintenance | security | system`. `NotificationSource` Type (Zeile 26-34): `logic_engine | mqtt_handler | grafana | sensor_threshold | device_event | autoops | manual | system`.
- [x] `NotificationListFilters` und `AlertActiveListFilters` haben `category?` und `source?` als Filter-Parameter — **API unterstuetzt Filterung**.
- [x] `QuickAlertPanel.vue`: **KEIN Kategorie-Filter** (filtert nach Status+Severity). Identifizierte Luecke → Phase C V4.3.
- [x] `NotificationDrawer.vue`: Status-Tabs, **kein expliziter Kategorie-Filter**.
- [x] **Kein visueller Unterschied** nach category (keine unterschiedlichen Icons/Farben pro Kategorie).

#### C5: Isolation Forest / Anomalie-Detection Status — **BESTANDEN** ✓ (2026-03-03)

**Pruefen:**
- [x] `rg 'isolation.forest|IsolationForest|anomaly_detect|sklearn' src/` — **KEINE aktive Anomalie-Detection gefunden.** `ai.py:25/51` definiert nur das DB-Model `AIPrediction` mit `prediction_type: anomaly_detection` — das ist eine Datenstruktur fuer zukuenftige Nutzung, kein aktiver Service.
- [x] **Kein aktiver ML-Code.** Keine `sklearn`, `IsolationForest` oder aktive ML-Imports im `src/`-Verzeichnis.
- [x] **Korrekt:** Isolation Forest ist fuer spaeteren Phase geplant und ist NICHT aktiv.

**Ergebnis:** Keine unerwartete KI-Anomalie-Erkennung laeuft. Keine falschen Alerts moeglich.

#### C6: Verifikations-Report — **ERSTELLT** ✓ (2026-03-03)

**Report:** `.claude/reports/current/PHASE_A_V7.1_KATEGORIE_REPORT.md` — **FERTIG**

**Zusammenfassung:**
- **SAUBER GETRENNT: JA** — Wo Notifications erzeugt werden, sind source und category korrekt und konsistent gesetzt.
- **BLOCKIERT HW-TEST: NEIN** — Das System funktioniert korrekt.
- **SOFORT-FIX erforderlich: NEIN**
- **Empfehlungen (nicht-blockierend):** error_handler/lwt_handler erzeugen keine Notifications (Feature-Requests, keine Bugs). notification_executor hardcoded `category="system"`. Frontend-Kategorie-Filter fehlt (Phase C V4.3).

---

## V7.2 — Absturz-Sicherheit verifizieren

### Vision und Systemeinbettung

Ein Hardware-Test laeuft potentiell Stunden. Waehrend dieser Zeit **darf das System nicht stillschweigend ausfallen**. Jede Komponente muss:
1. **Abstuerze erkennen** (Health-Checks, Watchdogs, Circuit Breaker)
2. **Automatisch recovern** (Reconnect, Retry, Re-Register)
3. **Den Operator informieren** (Alerts, Logs, Prometheus-Metriken)

AutomationOne hat bereits eine umfangreiche Resilience-Infrastruktur. Diese Pruefung stellt sicher, dass sie **tatsaechlich funktioniert** — nicht nur existiert.

**Wo es im System sitzt:**

```
Resilience-Stack:
├── Server-Neustart Recovery
│   ├── main.py lifespan() → Re-registriert ALLES
│   ├── 8-10+ Scheduler-Jobs (Cleanup, Metrics, Digest, Suppression, SensorSchedule)
│   ├── 12 MQTT-Handler + 3 Mock-Handler-Registrierungen
│   ├── Plugin-Discovery + DB-Sync
│   └── Circuit Breaker Reset
│
├── MQTT-Resilience
│   ├── src/mqtt/client.py → Auto-Reconnect (paho, 1s-60s backoff)
│   ├── src/mqtt/offline_buffer.py → Queue max 1000, flush batch 50
│   └── Circuit Breaker: 5 failures / 30s → OPEN → 30s → HALF_OPEN
│
├── DB-Resilience
│   ├── src/db/session.py → pool_size=10, max_overflow=20, pre_ping=True
│   ├── src/db/session.py init_db() → 5 attempts, 2s exponential
│   └── Circuit Breaker: 3 failures / 10s → OPEN → 10s → HALF_OPEN
│
├── Frontend WS-Resilience
│   ├── websocket.ts → 10 attempts, 1s-30s exponential, token refresh
│   └── Visibility API → reconnect on tab-switch
│
└── Plugin-Isolation
    └── plugin_service.py → try/except mit DB rollback
```

### Analyseauftrag (exakte Schritte fuer auto-one Agent)

#### D1: Server-Neustart Recovery (Code-Review) — **BESTANDEN** ✓ (2026-03-03)

**Pruefen in `src/main.py`:**
- [x] `lifespan()` Funktion (Zeile 87-625) komplett gelesen. Vollstaendige Startup-Sequenz bestaetigt:
  - Step 0: Security Validation (JWT, MQTT TLS) — Zeile 101-129
  - Step 0.5: Resilience Patterns (Circuit Breakers) — Zeile 131-154
  - Step 1: Database Init (`init_db()`) — Zeile 156-168, 5 Attempts, 2s exponential
  - Step 2: MQTT Connect — Zeile 170-181, startet auch bei Failure (Auto-Reconnect)
  - Step 3: MQTT Handler Registration — Zeile 183-260, 12 Handler + 3 Mock-Handler
  - Step 3.4-3.7: Scheduler, Simulation, Maintenance, Metrics, Digest, Suppression, Mock-Recovery, SensorType-Registration, SensorSchedule-Recovery
  - Step 4-6.1: Subscribe, WebSocket, Services, PluginSync
- [x] **Scheduler-Jobs:** Mindestens 8-10 Jobs bestaetigt (3 Maintenance Cleanup, 3 Monitor Health, 1 Metrics 15s, 1 Digest 60min, 2 Suppression 5min+daily)
- [x] **MQTT-Handler:** 12 Handler + 3 Mock-Handler = 15 Registrierungen total. BESTAETIGT.
- [x] **Circuit Breaker Reset:** JA — `_on_connect()` (client.py:527-529) ruft `self._circuit_breaker.reset()` auf
- [x] **Plugin-Sync:** JA — `sync_registry_to_db()` in Step 6.1 (Zeile 597)
- [x] **WebSocket-Connections:** Shutdown bestätigt — `_websocket_manager.shutdown()` aufgerufen
- [x] **Graceful Shutdown:** Definiert in Zeile 631-717, ordentliche Reihenfolge: LogicScheduler → LogicEngine → SequenceExecutor → MaintenanceService → SimulationScheduler → CentralScheduler → WebSocket → MQTT Subscriber (30s Timeout) → MQTT Client → DB Engine. **SIGTERM:** FastAPI/Uvicorn handled nativ via lifespan Context-Manager.

**Kritische Fragen:**
- [x] **pg_dump-Absturz (V5.1):** V5.1 noch nicht implementiert → kein akutes Risiko. Empfehlung bei Implementierung: Atomic Write (temp file → rename).
- [x] **Cleanup-Absturz:** SQLAlchemy Transaktionen werden bei Connection-Loss automatisch zurueckgerollt (asyncpg). Kein expliziter Rollback noetig.

#### D2: Plugin-Crash Isolation (Code-Review) — **BESTANDEN** ✓ (2026-03-03, mit Empfehlungen)

**Pruefen in `src/services/plugin_service.py`:**
- [x] `execute_plugin()` Methode (Zeile 163-244): try/except-Block (Zeile 190-238) faengt `Exception`. **NICHT** `BaseException`, `SystemExit`, `KeyboardInterrupt` — diese wuerden den Server stoppen, was korrekt ist.
- [x] **DB-Rollback:** KEIN explizites `rollback()`. Im `finally`-Block (Zeile 242) wird `await self.db.commit()` aufgerufen — committed den `execution`-Record mit `status="error"`, aber potentiell auch fehlerhafte Plugin-DB-Aenderungen. **Empfehlung:** `await self.db.rollback()` VOR dem Error-Handling, dann neuen commit fuer den execution-record.
- [x] **Error-Status:** JA — Zeile 231: `execution.status = "error"`, Zeile 232: `execution.error_message = str(e)`.
- [x] **Notification bei Crash:** NEIN — Keine Notification. Wird in V3.3 Phase B adressiert.
- [x] **Timeout:** NEIN — Kein `asyncio.wait_for()`. Plugin laeuft unbegrenzt. **Empfehlung:** `asyncio.wait_for(plugin.execute(...), timeout=300)` (5 Minuten).
- [x] **SystemExit/KeyboardInterrupt/MemoryError:** SystemExit + KeyboardInterrupt werden NICHT gefangen → Server-Absturz moeglich (akzeptabel). MemoryError ist Exception-Subtyp und wird gefangen. Risiko: GERING.

#### D3: MQTT-Disconnect Simulation (manueller Test) — **CODE-REVIEW BESTANDEN, MANUELLER TEST AUSSTEHEND**

**Test-Szenario (VOM USER DURCHZUFUEHREN):**
```
1. System laeuft normal, Sensordaten fliessen
2. MQTT-Broker stoppen: docker stop automationone-mqtt
3. 30 Sekunden warten
4. MQTT-Broker starten: docker start automationone-mqtt
5. Pruefen:
   - [ ] Server-Logs: Circuit Breaker OPEN → HALF_OPEN → CLOSED Uebergaenge sichtbar?
   - [ ] Offline-Buffer: Wurden Nachrichten gepuffert? (offline_buffer_size Metrik)
   - [ ] Re-Subscribe: Alle 13 MQTT-Handler wieder aktiv? (Sensordaten fliessen wieder?)
   - [ ] Frontend: WS-Verbindung bleibt? Oder reconnect noetig?
   - [ ] Prometheus: god_kaiser_mqtt_reconnects_total Counter gestiegen?
```

**Code-Review (2026-03-03 durchgefuehrt) — BESTANDEN:**
- [x] `src/mqtt/client.py`: `_on_disconnect()` (Zeile 576-636) — Setzt `self.connected = False`. Rate-Limited Logging (max 1x/min). Auto-Reconnect via paho-mqtt (`reconnect_delay_set(min_delay=1, max_delay=60)`, Zeile 270). Kein CB-Trigger bei Disconnect (korrekt — CB trackt nur publish-Fehler).
- [x] `src/mqtt/client.py`: `_on_connect()` (Zeile 515-562) — Setzt `self.connected = True`. CB Reset (Zeile 528). **Re-Subscribe:** `self._subscriber.subscribe_all()` (Zeile 535). **Offline Buffer Flush:** `self._flush_offline_buffer()` asynchron (Zeile 541-551).
- [x] `src/mqtt/offline_buffer.py`: `flush()` (Zeile 194-268) — Batch-weise, max 3 Attempts pro Message, failed Messages re-queued. `flush_all()` (Zeile 270-294) mit 0.1s Delay zwischen Batches. Thread-Safety via `asyncio.Lock()`. Bounded Deque (maxlen), oldest-first Drop-Policy.
- [x] **Recovery-Mechanismus:** Robust mit exponential Backoff (1s-60s). Re-Subscribe vollstaendig. Offline-Buffer funktional.

#### D4: WebSocket-Reconnect (manueller Test) — **CODE-REVIEW BESTANDEN, MANUELLER TEST AUSSTEHEND**

**Test-Szenario (VOM USER DURCHZUFUEHREN):**
```
1. Frontend im Browser offen, Live-Daten fliessen
2. Browser-Tab schliessen und nach 10s wieder oeffnen
3. Pruefen:
   - [ ] WebSocket reconnected automatisch?
   - [ ] JWT-Token wird refreshed? (Frontend: refreshToken() vor reconnect)
   - [ ] Live-Daten fliessen wieder? (Keine Seiten-Aktualisierung noetig)
   - [ ] Keine doppelten Event-Handler? (Memory-Leak-Check)

4. Server neustarten (docker restart automationone-server)
5. Pruefen:
   - [ ] Frontend erkennt Disconnect?
   - [ ] Reconnect-Versuch (max 10, exponential 1s-30s)?
   - [ ] Nach Server-Up: Automatische Wiederverbindung?
   - [ ] Pinia Stores werden re-synced? (oder zeigen stale Daten?)
```

**Code-Review (2026-03-03 durchgefuehrt) — BESTANDEN:**
- [x] `El Frontend/src/services/websocket.ts`: `onClose()` (Zeile 201-213) — Reconnect nur bei non-normal Closure (`event.code !== 1000`). Bei Max-Attempts-Exhaustion (10): Status → `error`. Exponential Backoff: 1s → 2s → 4s → 8s → 16s → 30s (max) mit Jitter (Zeile 270-276).
- [x] **Token-Refresh:** JA — `refreshTokenIfNeeded()` (Zeile 136-151) wird VOR jedem Reconnect aufgerufen. Prueft JWT-Expiry mit 60s Buffer.
- [x] **Tab-Switch Recovery:** JA — `visibilitychange` Event-Handler (Zeile 297-337). Bei Tab-Switch prueft er Connection und reconnected bei Bedarf.
- [x] **Cleanup:** JA — `cleanupVisibilityHandling()` (Zeile 344-349) entfernt den Event-Listener via `removeEventListener`. `disconnect()` (Zeile 237-256) raeumt Timer und Listener auf. **Kein Memory-Leak.**
- [x] **Store Re-Sync:** TEILWEISE — `onConnectCallbacks` Set (Zeile 71) notifiziert Stores nach erfolgreichem Connect. Ob alle Stores re-fetchen haengt von ihrer Implementierung ab.

#### D5: DiagnosticsService Einzelcheck-Fehler (Code-Review) — **BESTANDEN** ✓ (2026-03-03)

**Pruefen in `src/services/diagnostics_service.py`:**
- [x] `run_full_diagnostic()` (Zeile 104-143): JA — Jeder Check laeuft in eigenem try/except (Zeile 113-121). Bei Exception → `CheckResult(status=CheckStatus.ERROR, message=f"Check fehlgeschlagen: {str(e)}")`.
- [x] **Partielle Ergebnisse:** JA — Fehlgeschlagene Checks werden als `CheckStatus.ERROR` in die Ergebnisliste aufgenommen. Andere Checks laufen weiter (`for name, check_fn in self.checks.items()`).
- [x] **Overall-Status:** `max()` ueber alle Check-Status (Zeile 126-128) — der schlechteste Check bestimmt den Overall-Status.
- [x] **Timeout pro Check:** NEIN — Kein `asyncio.wait_for()` pro Check. **ABER:** Die meisten Checks nutzen eigene Timeouts (z.B. httpx 3s). Nur DB-Checks ohne expliziten Timeout koennten laenger dauern. **Empfehlung:** Per-Check-Timeout (z.B. 10s).
- [x] **Edge Case DB nicht erreichbar:** Report-Persistierung hat try/except mit Fallback (Zeile 641-645): `try: await self.session.commit()` mit `except: await self.session.rollback()`. Report wird im Memory erzeugt und als Response zurueckgegeben, aber NICHT persistent gespeichert wenn DB down ist. Log-Eintrag vorhanden.

#### D6: Verifikations-Report — **ERSTELLT** ✓ (2026-03-03)

**Report:** `.claude/reports/current/PHASE_A_V7.2_ABSTURZ_REPORT.md` — **FERTIG**

**Zusammenfassung:**
- **ABSTURZ-SICHER FUER HW-TEST: JA**
- **SOFORT-FIX erforderlich: NEIN**
- **Kritische Luecken: KEINE**
- **Empfehlungen (nicht-blockierend):**
  1. Plugin-Execute Timeout 300s (MITTEL) — plugin_service.py:222
  2. Plugin-Execute expliziter DB-Rollback (NIEDRIG) — plugin_service.py:230
  3. Diagnostic-Check per-Check-Timeout 10s (NIEDRIG) — diagnostics_service.py:114
  4. Plugin-Crash-Notification (GEPLANT) — V3.3 Phase B
- **Manuelle Tests D3/D4:** VOM USER DURCHZUFUEHREN (MQTT-Disconnect + WebSocket-Reconnect). Code-Review bestaetigt alle Mechanismen als korrekt implementiert.

---

## Zusammenfassung: Abschluss-Status

### Ergebnis-Dateien (alle erstellt und verifiziert)

| Block | Report-Datei | Status |
|-------|-------------|--------|
| V5.1 | `PHASE_A_V5.1_ANALYSE.md` | **IMPLEMENTIERT** ✓ |
| V5.5 | `PHASE_A_V5.5_SAFETY_REPORT.md` | **BESTANDEN** ✓ |
| V7.1 | `PHASE_A_V7.1_KATEGORIE_REPORT.md` | **BESTANDEN** ✓ |
| V7.2 | `PHASE_A_V7.2_ABSTURZ_REPORT.md` | **BESTANDEN** ✓ |

### V5.1 Implementierte Dateien (verifiziert am 2026-03-03)

| Datei | Status | Verifizierung |
|-------|--------|---------------|
| `src/services/database_backup_service.py` | ✓ NEU | 559 Zeilen, Service + DI + Metrics |
| `src/api/v1/backups.py` | ✓ NEU | 226 Zeilen, 6 Endpoints, AdminUser Guard |
| `tests/unit/test_database_backup_service.py` | ✓ NEU | 369 Zeilen, 29 Tests BESTANDEN |
| `src/core/config.py` | ✓ GEAENDERT | `DatabaseBackupSettings` (10 ENVs) + `backup` in Settings |
| `src/core/metrics.py` | ✓ GEAENDERT | 4 Prometheus-Metriken (Counter+Gauge) |
| `src/api/v1/__init__.py` | ✓ GEAENDERT | `backups_router` Import + include_router |
| `src/main.py` | ✓ GEAENDERT | Step 3.4.6: Init + Cron-Job 02:00 |
| `El Servador/Dockerfile` | ✓ GEAENDERT | `postgresql-client` in Runtime-Stage |

### Pattern-Konformitaet (verifiziert am 2026-03-03)

| Aspekt | Ergebnis |
|--------|----------|
| Router-Prefix | `/v1/backups` — konsistent mit anderen Routern |
| AdminUser Dependency | `from ..deps import AdminUser` — korrekt |
| Settings-Subklasse | `DatabaseBackupSettings(BaseSettings)` — wie `MaintenanceSettings` |
| DI Pattern | `init_database_backup_service()` / `get_database_backup_service()` — wie andere Services |
| Scheduler-Integration | `_central_scheduler.add_cron_job()` mit `JobCategory.MAINTENANCE` — korrekt |
| Metrics-Naming | `god_kaiser_backup_*` — konsistent mit `god_kaiser_*` Schema |
| Logging | `get_logger(__name__)` — korrekt |
| Dockerfile | `postgresql-client` in Runtime-Stage (nicht Builder) — korrekt |

### Korrekturen waehrend Review (2026-03-03)

1. **V5.5 Report:** `HEARTBEAT_LOG_RETENTION_ENABLED` Default korrigiert: `True` (nicht `False`). Dry-Run=True schuetzt trotzdem.
2. **Auftrag B4:** Klarstellung dass `HEARTBEAT_LOG_RETENTION_ENABLED=True` und `ORPHANED_MOCK_CLEANUP_ENABLED=True` Ausnahmen von der Default-False-Regel sind.

### Abbruch-Kriterien (Ergebnis)

| Kriterium | Ergebnis |
|-----------|----------|
| V5.5: CRITICAL-Events geloescht? | **NEIN** — severity_days=0 schuetzt sie. BESTANDEN |
| V7.1: Keine Kategorie-Trennung? | **NEIN** — source + category korrekt getrennt. BESTANDEN |
| V7.2: MQTT reconnected nicht? | **DOCH** — Auto-Reconnect mit 1s-60s Backoff. BESTANDEN |
| V7.2: Server-Neustart verliert Jobs? | **NEIN** — lifespan() re-registriert alle Jobs. BESTANDEN |
| V5.1: pg_dump nicht im Container? | **DOCH** — postgresql-client in Dockerfile Runtime-Stage. IMPLEMENTIERT |

### Ausstehend (nicht-blockierend)

1. **Docker Build:** `docker compose up -d --build el-servador` noch nicht durchgefuehrt
2. **Manueller POST Test:** `/v1/backups/database/create` mit laufendem System
3. **Grafana-Alert:** `DatabaseBackupMissing` Alertrule noch nicht in Grafana erstellt
4. **Manuelle Tests D3/D4:** MQTT-Disconnect + WebSocket-Reconnect (V7.2)

---

## Naechster Schritt nach Phase A

Alle 4 Reports zeigen BESTANDEN → **PHASE B kann gestartet werden:**
- V2.1 Daily Diagnostic Scheduler (~1h)
- V3.1 Plugin Schedule-Verdrahtung (~2h)
- V2.2 Report-Retention (~1h)

Auftraege fuer Phase B: `auftrag-phaseB-scheduler-verdrahtung.md` (noch zu erstellen).
