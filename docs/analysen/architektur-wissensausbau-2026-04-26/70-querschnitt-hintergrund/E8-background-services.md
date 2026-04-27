# E8 — Background-Services und Scheduler

**Etappe:** E8  
**Datum:** 2026-04-26  
**Analysierte Dateien:**
- `El Servador/god_kaiser_server/src/core/scheduler.py`
- `El Servador/god_kaiser_server/src/services/maintenance/service.py`
- `El Servador/god_kaiser_server/src/services/maintenance/jobs/cleanup.py` (nicht direkt gelesen, Aufrufe dokumentiert)
- `El Servador/god_kaiser_server/src/services/notification_router.py`
- `El Servador/god_kaiser_server/src/services/ai_notification_bridge.py`
- `El Servador/god_kaiser_server/src/services/ai_service.py`
- `El Servador/god_kaiser_server/src/services/alert_suppression_scheduler.py`
- `El Servador/god_kaiser_server/src/services/esp_service.py`
- `El Servador/god_kaiser_server/src/autoops/core/agent.py`
- `El Servador/god_kaiser_server/src/autoops/core/reporter.py`
- `El Servador/god_kaiser_server/src/autoops/core/plugin_registry.py`
- `El Servador/god_kaiser_server/src/autoops/core/base_plugin.py`
- `El Servador/god_kaiser_server/src/autoops/plugins/debug_fix.py`
- `El Servador/god_kaiser_server/src/main.py` (Lifespan-Sequenz, Zeilen 98–1135)

---

## 1. Überblick Background-Architektur

Der God-Kaiser Server betreibt drei Ebenen zeitgesteuerter Hintergrundverarbeitung:

```
┌─────────────────────────────────────────────────────────────────┐
│  CentralScheduler (APScheduler AsyncIOScheduler)               │
│  Singleton — verwaltet ALLE zeitgesteuerten Jobs               │
│                                                                 │
│  ├── JobCategory.MAINTENANCE  (cleanup, digest, backup, ...)   │
│  ├── JobCategory.MONITOR      (ESP health, MQTT health, ...)   │
│  ├── JobCategory.MOCK_ESP     (Simulation-Heartbeats)          │
│  ├── JobCategory.SENSOR_SCHEDULE (scheduled sensor readings)   │
│  └── JobCategory.CUSTOM       (plugin-definierte Jobs)         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Asyncio Background Tasks (via asyncio.create_task)            │
│  ├── _inbound_replay_worker — P0.3 Inbox-Drain-Loop (5s)      │
│  └── _enrich_anomaly_explanation — fire-and-forget AI          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  LogicScheduler — eigener asyncio.Task für Timer-Rules         │
│  (kein APScheduler — event-driven via asyncio.sleep-Loop)      │
└─────────────────────────────────────────────────────────────────┘
```

Die Notification-Pipeline ist kein Background-Service im engeren Sinne, sondern ein synchron aufgerufener Service-Graph der im Anfrage-Kontext läuft, aber WebSocket-Broadcasts und optionale Email-Zustellung auslöst.

---

## 2. CentralScheduler und MaintenanceService

### 2.1 Alle Jobs (vollständige Tabelle)

Die Jobs werden in zwei Gruppen registriert: durch `MaintenanceService.start()` und direkt in der `lifespan`-Funktion von `main.py`.

#### Gruppe A: MaintenanceService-Jobs (`src/services/maintenance/service.py`, Zeile 70–191)

| Job-ID (full) | Trigger | Aktivierungsbedingung | Funktion |
|---|---|---|---|
| `maintenance_cleanup_sensor_data` | Täglich 03:00 (Cron) | `SENSOR_DATA_RETENTION_ENABLED=True` | Löscht alte `sensor_data`-Zeilen; Dry-Run-Modus möglich |
| `maintenance_cleanup_command_history` | Täglich 03:30 (Cron) | `COMMAND_HISTORY_RETENTION_ENABLED=True` | Löscht alte Aktor-Command-History |
| `maintenance_cleanup_orphaned_mocks` | Stündlich (Interval 3600s) | `ORPHANED_MOCK_CLEANUP_ENABLED=True` | Sucht Mock-ESPs ohne aktiven Simulation-Eintrag; im `AUTO-DELETE`-Modus löscht er diese |
| `maintenance_cleanup_heartbeat_logs` | Täglich 03:15 (Cron) | `HEARTBEAT_LOG_RETENTION_ENABLED=True` | Löscht alte Heartbeat-Log-Zeilen |
| `monitor_health_check_esps` | Interval (Standard 60s) | Immer aktiv | Ruft `heartbeat_handler.check_device_timeouts()` auf; markiert offline-gegangene ESPs |
| `monitor_health_check_mqtt` | Interval (Standard 30s) | Immer aktiv | Prüft `mqtt_client.is_connected()`; bei Disconnect wird WS-Event `mqtt_disconnected` gebroadcastet |
| `monitor_health_check_sensors` | Interval (Standard 60s) | Immer aktiv | Phase 2E: Prüft Continuous-Mode-Sensoren auf Timeout; broadcastet WS-Events für stale Sensoren |
| `maintenance_aggregate_stats` | Interval (Standard 60 min) | `STATS_AGGREGATION_ENABLED=True` | Aggregiert ESP/Sensor/Aktor-Zählungen in In-Memory-Cache `_stats_cache` |

Alle 4 Cleanup-Jobs sind durch Settings deaktivierbar (nicht nur der Job-Trigger, sondern die gesamte Registrierung). Die 3 Health-Check-Jobs sind immer aktiv.

#### Gruppe B: Lifespan-Jobs (`src/main.py`, direkt in `lifespan`)

| Job-ID (full) | Trigger | Zeile (main.py) | Funktion |
|---|---|---|---|
| `monitor_monitor_prometheus_metrics` | Interval 15s | ~450 | Aktualisiert Prometheus-Gauges (Uptime, ESP-Counts, MQTT-Status) via `update_all_metrics_async` |
| `maintenance_maintenance_digest_emails` | Interval 3600s (60 min) | ~469 | Batcht Warning-Notifications zu Digest-Emails (ISA-18.2 Alarm Fatigue) |
| `maintenance_maintenance_email_retry` | Interval 300s (5 min) | ~488 | Wiederholt fehlgeschlagene Email-Zustellungen; max 3 Versuche |
| `maintenance_suppression_expiry_check` | Interval 300s (5 min) | ~501 | Prüft `suppression_until`-Felder in sensor_configs, actuator_configs, esp_devices; reaktiviert abgelaufene Suppressions |
| `maintenance_maintenance_overdue_check` | Täglich 08:00 (Cron) | ~501 | Prüft `sensor_metadata.maintenance_interval_days`; schickt Info-Notifications bei überfälligen Wartungen |
| `maintenance_database_backup` | Täglich 02:00 (Cron, konfigurierbar) | ~524 | `DatabaseBackupService.create_backup()` + `cleanup_old_backups()`; DISABLED wenn `DB_BACKUP_ENABLED=False` |
| `maintenance_daily_diagnostic` | Täglich 04:00 (Cron, konfigurierbar) | ~880 | Führt `DiagnosticsService.run_full_diagnostic()` aus + archiviert alte Reports |
| `custom_plugin_<plugin_id>` | Pro Plugin: DB-Cron-Ausdruck | ~954 | Scheduled Plugin Execution — `health_check` täglich 05:00, `system_cleanup` sonntags 04:00 (Defaults, überschreibbar) |

> [!ANNAHME] Job-ID-Doppel-Prefix bei Gruppe-B-Jobs
>
> **Basis:** `add_interval_job(job_id="maintenance_digest_emails", ..., category=JobCategory.MAINTENANCE)` erzeugt intern `full_job_id = f"{category.value}_{job_id}"` → `maintenance_maintenance_digest_emails`. Die Skill-Dokumentation zeigt `maintenance_digest_emails` als Kurzform.
> **Zu verifizieren:** Ob tatsächlich Doppel-Prefix in der Job-Liste erscheint oder ob die Caller in main.py bereits den Prefix weglassen.

**Gesamtzahl:** Mindestens 16 regelmäßige Jobs, davon 4 konditionell (Cleanup). Die im Skill-Dokument genannten "8 Jobs" entsprechen nur den MaintenanceService-eigenen Jobs.

### 2.2 Scheduler-Implementierung

**Technologie:** APScheduler `AsyncIOScheduler` (Paket `apscheduler`)

```
src/core/scheduler.py
├── class CentralScheduler          — Wrapper um AsyncIOScheduler
├── class JobCategory(str, Enum)    — MOCK_ESP, MAINTENANCE, MONITOR, CUSTOM, SENSOR_SCHEDULE
├── class JobStats                  — Dataclass für Execution-Statistiken
├── def init_central_scheduler()    — Erstellt + startet Singleton
├── def get_central_scheduler()     — FastAPI Dependency / direkte Nutzung
└── async def shutdown_central_scheduler()
```

**Konfiguration des Schedulers (Zeilen 123–135):**
- `MemoryJobStore` — Jobs werden in-memory gespeichert, nicht in DB persistiert
- `AsyncIOExecutor` — alle Jobs laufen im asyncio Event Loop
- `coalesce=True` — verpasste Trigger werden zusammengefasst (nicht aufgeholt)
- `max_instances=1` — niemals zwei Instanzen desselben Jobs gleichzeitig
- `misfire_grace_time=120` — 120s Toleranz vor dem Verwerfen

**Job-Naming-Schema:** `{category.value}_{job_id}`, z. B. `maintenance_cleanup_sensor_data`.

**Event-Listener (intern):**
- `_on_job_executed` — inkrementiert `executions`, aktualisiert `last_run`
- `_on_job_error` — inkrementiert `errors`, speichert `last_error`-Message
- `_on_job_missed` — loggt Warning

### 2.3 Singleton ohne Health-Endpoint (E5)

> [!INKONSISTENZ] CentralScheduler: Singleton ohne Health-Endpoint
>
> **Beobachtung:** `CentralScheduler` wird als Modul-Singleton via `_scheduler_instance` (Zeile 534, `src/core/scheduler.py`) implementiert. Der Scheduler hat eine vollständige `get_scheduler_status()`-Methode die Laufzeit, Job-Counts und Fehler zurückgibt (Zeilen 483–504). Ein REST-Endpoint der diese Daten exponiert existiert jedoch nicht. Der `/api/v1/health`-Router gibt allgemeine Server-Health zurück, aber keine Scheduler-Metriken.
>
> **Risiken:**
> 1. **Stilles Versagen:** Wenn ein Maintenance-Job dauerhaft fehlschlägt (z. B. DB-Connection-Problem), ist der Fehler nur in `_job_stats[job_id].last_error` sichtbar — kein Alert, kein Dashboard-Widget.
> 2. **Retention-Blindheit:** Wenn `cleanup_sensor_data` wochenlang mit Exception beendet wird, wächst die `sensor_data`-Tabelle unkontrolliert. Der Operator erfährt es erst bei DB-Speicherwarnung.
> 3. **Observability-Gap:** Prometheus-Metriken (Job-Erfolgsraten, last_run) werden nicht exportiert. `monitor_monitor_prometheus_metrics` aktualisiert nur ESP/MQTT-Gauges, nicht Scheduler-interne Metriken.
> 4. **Kein Alerting:** ISA-18.2-konforme Alarmpipeline steht bereit, wird für Scheduler-Fehler aber nicht genutzt.
>
> **Korrekte Stelle:** Skill-Dokument `.claude/skills/server-development/SKILL.md`, Sektion 9 "Scheduler & Jobs" — dort ist `get_scheduler_status()` dokumentiert aber der fehlende Endpoint nicht als Gap markiert.
>
> **Empfehlung:** Einen `GET /api/v1/health/scheduler` Endpoint anlegen der `get_central_scheduler().get_scheduler_status()` + `get_maintenance_service().get_status()` aggregiert; Prometheus-Gauge für Job-Fehlerrate exportieren.
>
> **Erst-Erkennung:** E8, 2026-04-26

---

## 3. Notification-Pipeline

### 3.1 NotificationRouter

**Datei:** `src/services/notification_router.py`

`NotificationRouter` ist der zentrale Eintrittspunkt für alle Notifications. Er wird bei Bedarf instanziiert (kein Singleton) — jede Caller-Komponente erstellt eine neue Instanz mit der aktuellen DB-Session.

```python
class NotificationRouter:
    def __init__(self, session: AsyncSession, email_service=None):
        self.notification_repo = NotificationRepository(session)
        self.preferences_repo = NotificationPreferencesRepository(session)
        self.user_repo = UserRepository(session)
        self.email_log_repo = EmailLogRepository(session)
        self.email_service = email_service or get_email_service()
```

**Routing-Ablauf in `route()`:**

```
NotificationCreate eingehend
    │
    ├── user_id=None? → _broadcast_to_all() (alle aktiven User)
    │
    ├── kein Fingerprint? → Zeitfenster-Dedup (title/source/category)
    │       DEDUP_WINDOWS: mqtt_handler=300s, sensor_threshold=120s,
    │                      device_event=300s, logic_engine=120s, system=300s
    │
    ├── Fingerprint vorhanden? → Atomares INSERT ON CONFLICT DO NOTHING (FIX-F5)
    │       Eliminiert Check-then-Act Race Condition
    │
    ├── Step 1: Persist to DB (immer)
    ├── Step 2: Load UserPreferences
    ├── Step 3: WebSocket broadcast (notification_new) wenn ws_enabled
    ├── Step 4: Email-Routing (severity-basiert, Quiet Hours, Digest)
    └── Step 5: session.commit()
```

### 3.2 Die 4 Trigger-Quellen

Aus Code-Analyse (nicht explizit als Konstante deklariert):

| Trigger-Quelle | `source`-Feld | Auslöser | Dedup-Fenster |
|---|---|---|---|
| **MQTT-Handler** | `"mqtt_handler"` | Error-Handler, Heartbeat-Handler, LWT-Handler bei ESP-Ereignissen | 300s |
| **Logic Engine** | `"logic_engine"` | `NotificationActionExecutor` bei Rule-Auslösung | 120s |
| **AI-Anomaly** | `"ai_anomaly_service"` | `AINotificationBridge.route_anomaly()` nach Z-Score/Isolation-Forest-Ergebnis | 60s (Default) |
| **System/Maintenance** | `"system"` | `alert_suppression_scheduler.check_maintenance_overdue()`, DiagnosticsService | 300s |

> [!ANNAHME] Trigger-Quellen sind implizit
>
> **Basis:** Die `DEDUP_WINDOWS`-Klassen-Variable (`notification_router.py`, Zeile 62–68) listet explizit `mqtt_handler`, `sensor_threshold`, `device_event`, `logic_engine`, `system`. `sensor_threshold` und `device_event` sind weitere Sources die im Code vorkommen.
> **Zu verifizieren:** Vollständige Liste der `source`-Werte durch Grep über alle `NotificationCreate(`-Aufrufe im Codebase.

### 3.3 Fingerprint-Deduplication

Das System implementiert zwei Deduplication-Mechanismen:

**Mechanismus A: Zeitfenster-Dedup (Title-basiert)**  
Für Notifications ohne `fingerprint`-Feld: `check_duplicate()` im `NotificationRepository` prüft ob in den letzten `window_seconds` bereits eine Notification mit identischem `(user_id, source, category, title)` existiert.

**Mechanismus B: Atomares Fingerprint-Dedup (FIX-F5)**  
Für Notifications mit `fingerprint`-Feld: `create_with_fingerprint_dedup()` nutzt einen PostgreSQL-Partial-Unique-Index mit `INSERT ... ON CONFLICT DO NOTHING`. Dies ist ein echtes atomares Upsert ohne Check-then-Act Race Condition.

**ISA-18.2-Alarm-Storm-Schutz:**  
Die source-spezifischen Zeitfenster sind auf den ISA-18.2-Richtwert von < 6 Alarmen/Stunde/Operator ausgerichtet. MQTT-Fehler (häufigste repetitive Quelle) bekommen 5 Minuten Fenster.

**Cascade Suppression (`suppress_dependent_alerts`):**  
Wenn ein ESP offline geht, werden nachfolgende Sensor-Threshold-Alerts per `correlation_prefix` als Kinder der Offline-Notification gruppiert. Dies reduziert visuelle Alarm-Floods im Frontend.

**Broadcast-Dedup:**  
Bei `user_id=None` (System-Broadcasts): Dedup über `correlation_id`-Match statt Zeitfenster.

### 3.4 AI-Notification-Bridge

**Datei:** `src/services/ai_notification_bridge.py`

Die `AINotificationBridge` verbindet das KI-Anomalie-Erkennungssystem mit der Notification-Pipeline. Sie wird instanziiert wenn ein Anomalie-Ergebnis vorliegt (nicht als Singleton).

**Flow:**

```
AnomalyResult (Z-Score oder Isolation Forest)
    │
    ├── 1. Persist zu AIPredictions (DB) — immer, auch bei Suppression
    │       Felder: prediction_type="anomaly_detection", input_data, prediction_result,
    │               confidence_score, model_version="z_score_v1"
    │
    ├── 2. AlertSuppressionService.is_sensor_suppressed() prüfen
    │       → bei Suppression: return prediction_id (keine Notification)
    │
    ├── 3. Optional: AI-Enrichment via AiService (fire-and-forget)
    │       asyncio.create_task(_enrich_anomaly_explanation(anomaly))
    │       Nur wenn ANTHROPIC_API_KEY vorhanden UND anomaly.explanation leer
    │
    └── 4. NotificationRouter.route(notification)
            source="ai_anomaly_service", category="ai_anomaly"
```

**Wann wird AI aufgerufen:**  
`AiService.analyze_error()` wird aufgerufen wenn:
1. `os.environ.get("ANTHROPIC_API_KEY")` gesetzt ist (`ai_service.is_available()`)
2. Das Anomalie-Ergebnis kein `explanation`-Feld hat
3. Der Aufruf erfolgt als `asyncio.create_task` (fire-and-forget, blockiert nicht die Bridge)

**AiService-Implementierung (`src/services/ai_service.py`):**

```python
class AiService:
    async def analyze_error(self, request: ErrorAnalysisRequest) -> ErrorAnalysisFinding:
        response = await self._get_client().messages.parse(
            model="claude-opus-4-7",
            max_tokens=4096,
            output_format=ErrorAnalysisFinding,  # Strukturierter Output
            ...
        )
```

`AiService` ist ein einfaches Modul-Singleton (`ai_service = AiService()` am Ende der Datei). Es nutzt `AsyncAnthropic` (Anthropic SDK >= 0.49.0) mit `messages.parse()` für strukturierten Output. Das System-Prompt enthält vollständige Error-Code-Kontexte (ESP32: 1000-4999, Server: 5000-5999).

---

## 4. AutoOps-System (src/autoops/)

### 4.1 Überblick

AutoOps ist ein autonomes Operationssystem das über die REST-API des Servers arbeitet — es ist kein direktes Datenbank-Zugriffs-System. Es agiert als externer Client der sich gegen `http://localhost:8000` authentifiziert.

```
src/autoops/
├── core/
│   ├── agent.py            — AutoOpsAgent: Haupt-Orchestrator
│   ├── api_client.py       — GodKaiserClient: HTTP-Client gegen REST API
│   ├── base_plugin.py      — AutoOpsPlugin, PluginCapability, PluginResult
│   ├── context.py          — AutoOpsContext, ESPSpec, SystemSnapshot
│   ├── plugin_registry.py  — PluginRegistry (Singleton)
│   ├── profile_validator.py
│   └── reporter.py         — AutoOpsReporter: Markdown-Report-Generator
├── plugins/
│   ├── debug_fix.py        — DebugFixPlugin: Diagnose + Auto-Fix
│   ├── esp_configurator.py — ESP-Konfiguration
│   ├── health_check.py     — System-Health-Validierung
│   └── system_cleanup.py   — Ressourcen-Cleanup
└── runner.py               — CLI-Einstiegspunkt
```

**Integration in den Server:** AutoOps ist kein Hintergrundprozess der selbstständig läuft. Die Plugins werden über `PluginService` (in `src/services/plugin_service.py`) gesteuert und können per REST-Endpoint getriggert oder per APScheduler-Cron ausgeführt werden (Step 6.3 in `main.py`).

### 4.2 Debug-Fix-Plugin

**Datei:** `src/autoops/plugins/debug_fix.py`

Das `DebugFixPlugin` implementiert einen dreiphasigen Zyklus:

**Phase 1: DIAGNOSE**  
Scannt via REST-API: Devices (Status, Memory), Sensors (Kalibrierung, Freshness), Actuatoren (Emergency-Stop), Zones (unassigned devices). Jedes Problem wird als `DiagnosticIssue` klassifiziert:
- `category`: device | sensor | actuator | zone | system
- `severity`: info | warning | error
- `auto_fixable`: bool (nur Mock-Devices für automatischen Fix zugelassen)

**Phase 1.5: LLM-Deep-Analysis (optional)**  
Wenn `ANTHROPIC_API_KEY` gesetzt und Issues vorhanden: Agentic Loop mit `claude-opus-4-7`. Das Modell nutzt 4 Debug-Tools:
- `get_esp_error_history` — liest `audit_logs`
- `get_logic_rules_for_esp` — Logic Rules nach ESP filtern
- `get_offline_mode_state` — ESP Online-Status
- `get_sensor_last_values` — letzte Messwerte

Max 5 Iterationen. Ergebnis: `DebugFinding` mit `root_cause`, `code_references`, `recommended_actions`.

**Phase 2: FIX**  
Automatische Fixes nur für `auto_fixable=True` Issues (beschränkt auf Mock-Devices):
- `trigger_heartbeat` — triggert Mock-Heartbeat
- `reset_state_to_operational` — setzt Mock-State zurück

Manuelle Fixes landen als Warnings im Report.

**Phase 3: Ergebnis**  
`PluginResult` mit actions[], errors[], warnings[], data{} (inklusive optionalem `llm_finding`).

### 4.3 Reporter

**Datei:** `src/autoops/core/reporter.py`

`AutoOpsReporter` generiert Markdown-Reports für jede AutoOps-Session:

```
autoops/reports/autoops_session_{session_id}_{timestamp}.md
```

Report-Inhalt:
- Session-Metadaten (ID, Timestamp, Status)
- Pro Plugin: Aktions-Tabelle, Errors, Warnings, Data-JSON
- Claude Debug-Befund (wenn llm_finding vorhanden): Root Cause, Code-Referenzen, Evidenz
- Komplettes API-Action-Log (jeder HTTP-Call mit Timestamp, Methode, Endpoint, Status)
- Final Summary (Zähler)

**Report-Ablage:** `src/autoops/reports/` (relativ zur `reporter.py`-Datei — entspricht `El Servador/god_kaiser_server/src/autoops/reports/`). Diese Reports sind nicht in der DB persistiert.

> [!INKONSISTENZ] AutoOps-Reports in src/autoops/reports/ statt in .claude/reports/
>
> **Beobachtung:** `AutoOpsReporter.__init__` setzt `self.reports_dir = Path(__file__).parent.parent / "reports"` — das ist `src/autoops/reports/`. Diese Reports landen damit innerhalb des Python-Pakets, nicht in den .claude/reports/-Ordnern die das Projekt-Analyse-System verwendet.
> **Korrekte Stelle:** .claude/reference/patterns/ARCHITECTURE_DEPENDENCIES.md (Report-Ablagekonventionen)
> **Empfehlung:** Reports-Pfad konfigurierbar machen (via Settings oder Constructor-Parameter), Default auf einen Ordner außerhalb von src/.
> **Erst-Erkennung:** E8, 2026-04-26

### 4.4 Plugin Registry

`PluginRegistry` ist ein Python-Klassenattribut-Singleton (nicht Module-Level):

```python
class PluginRegistry:
    _instance: Optional["PluginRegistry"] = None
    _plugins: dict[str, AutoOpsPlugin]

    def __new__(cls) -> "PluginRegistry":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._plugins = {}
        return cls._instance
```

`discover_plugins()` iteriert via `pkgutil.iter_modules` über `autoops/plugins/` und registriert alle `AutoOpsPlugin`-Subklassen. Dies geschieht **mehrfach** während des Lifespan (Step 6.1, 6.2, 6.3 in `main.py`), jeweils mit neuem `PluginRegistry()`-Aufruf — aber da es ein Singleton ist, akkumulieren sich Registrierungen. `reset()` und `reset_singleton()` existieren für Tests.

---

## 5. ESP-Service

**Datei:** `src/services/esp_service.py` (944 Zeilen)

`ESPService` ist kein Singleton und kein Background-Service. Er wird bei Bedarf instanziiert (typischerweise in MQTT-Handlern und REST-Endpoints).

**Kernfunktionen:**

| Methode | Funktion |
|---|---|
| `register_device()` | Erstellt neuen ESP (Status: `pending_approval`) oder aktualisiert bestehenden. `last_seen` wird gesetzt. |
| `unregister_device()` | Soft-Delete via Repository |
| `update_health()` | Setzt `status="online"`, `last_seen=now`, speichert Health-Daten in `device_metadata["health"]` (uptime, heap_free, wifi_rssi, sensor_count, actuator_count) |
| `check_device_status()` | Iteriert alle Devices, vergleicht `last_seen` mit `offline_threshold_seconds` (Default 120s), markiert offline-gegangene ESPs |

**Heartbeat-Management:** Die eigentliche Heartbeat-Verarbeitung liegt im `heartbeat_handler.py` (MQTT-Layer). `ESPService.update_health()` wird vom Handler aufgerufen. Das Timeout-Checking (`check_device_timeouts()`) liegt im `heartbeat_handler` selbst und wird vom `monitor_health_check_esps`-Job (MaintenanceService) ausgelöst.

**Discovery Rate Limiter:** `DiscoveryRateLimiter` (Zeilen 51–130) ist ein Modul-Level-Singleton (`_discovery_rate_limiter`). Limits:
- Global: 10 Discoveries/Minute
- Per-Device: 1 Discovery / 5 Minuten (Cooldown)
Thread-safe via `threading.Lock`.

**Config-Push-Sicherheit:**  
`ESP_COMBINED_CONFIG_MQTT_MAX_BYTES = 4352` — Konstante für MQTT-Payload-Limit. Entspricht `CONFIG_PAYLOAD_MAX_LEN` im ESP32-Firmware (`config_update_queue.h`). Config-Payloads die dieses Limit überschreiten werden abgelehnt.

**Fingerprint-Mechanismus:**  
`_compute_config_fingerprint()` berechnet SHA-256 über kanonisch-sortiertes JSON. Verhindert redundante Config-Pushes wenn der ESP bereits die aktuelle Config hat.

---

## 6. Lifespan-Events (Start/Stop)

### 6.1 Startup-Sequenz (relevante Background-Bereiche)

Die vollständige Startup-Sequenz ist in `main.py` lifespan() implementiert. Die folgenden Steps sind für Background-Services relevant:

| Step | Zeile (ca.) | Aktion | Fehler-Behandlung |
|---|---|---|---|
| 3.4 | 366 | `init_central_scheduler()` — erstellt + startet APScheduler | Blockierend (kein try/except) |
| 3.4.1 | 373 | `init_simulation_scheduler()` — Mock-ESP-Scheduler | Blockierend |
| 3.4.2 | 422 | `init_maintenance_service()` + `start()` — registriert alle Maintenance-Jobs | Blockierend |
| 3.4.3 | 450 | Prometheus-Metrics-Job registrieren (15s) | Blockierend |
| 3.4.4 | 469 | Digest-Service-Job (60 min) | Blockierend |
| 3.4.4b | 488 | Email-Retry-Job (5 min) | Blockierend |
| 3.4.5 | 501 | Alert-Suppression-Tasks | `try/except` → NON-FATAL |
| 3.4.6 | 510 | Database-Backup-Service + Job | Blockierend (Service-Init), Job nur wenn `DB_BACKUP_ENABLED` |
| 6.0 | 796 | Inbound-Replay-Bootstrap (`replay_pending_events(limit=500)`) | Blockierend, dann Background-Task |
| 6.0 (task) | 826 | `asyncio.create_task(_inbound_replay_worker)` — 5s-Loop | asyncio.CancelledError bei Shutdown |
| 6.2 | 848 | Daily-Diagnostic-Job (04:00) | `try/except` → NON-FATAL |
| 6.3 | 898 | Plugin-Schedule-Registrierung aus DB | `try/except` → NON-FATAL |

**Kritische vs. Non-Fatal Steps:**
- Scheduler-Init (3.4) und MaintenanceService (3.4.2) sind blockierend ohne try/except — Fehler hier stoppen den Server-Start.
- Alert-Suppression, Daily-Diagnostic, Plugin-Schedule: NON-FATAL, Fehler werden geloggt und ignoriert.

### 6.2 Shutdown-Sequenz

| Priorität | Step | Aktion |
|---|---|---|
| FIRST | 1 | `_logic_scheduler.stop()` |
| FIRST | 2 | `_logic_engine.stop()` |
| EARLY | 2.1 | `_sequence_executor.shutdown()` |
| EARLY | 2.2 | `_mqtt_command_bridge.shutdown()` |
| EARLY | 2.2b | `_inbound_replay_task.cancel()` + await |
| EARLY | 2.3 | `maintenance_service.stop()` — entfernt Maintenance + Monitor Jobs |
| EARLY | 2.4 | `_simulation_scheduler.stop_all_mocks()` |
| MIDDLE | 2.5 | `shutdown_central_scheduler()` — fährt APScheduler herunter |
| MIDDLE | 2.6 | `cancel_all_background_tasks()` (task_registry) |
| LATE | 3 | `WebSocketManager.shutdown()` |
| LATE | 4 | MQTT-Subscriber thread pool shutdown |
| LAST-1 | 5 | MQTT offline-Status publish + disconnect |
| LAST | 6 | `dispose_engine()` — DB-Verbindungspool schließen |

**Wichtige Reihenfolge:** `MaintenanceService.stop()` (2.3) muss vor `shutdown_central_scheduler()` (2.5) laufen, da `stop()` nur Jobs aus dem laufenden Scheduler entfernt, nicht den Scheduler selbst stoppt.

---

## 7. Error-Handling in Background-Tasks

### 7.1 APScheduler-Jobs (MaintenanceService)

Jeder Maintenance-Job ist in ein `try/except Exception` eingebettet:

```python
async def _cleanup_sensor_data(self) -> None:
    try:
        async for session in self._session_factory():
            cleanup = SensorDataCleanup(session, self._maintenance_settings)
            result = await cleanup.execute()
            self._job_results[job_id] = result
            break
    except Exception as e:
        logger.error(f"[maintenance] ERROR cleanup_sensor_data: {e}", exc_info=True)
        self._job_results[job_id] = {"error": str(e), "status": "error"}
```

**Retry:** Kein automatisches Retry. Gescheiterte Jobs laufen beim nächsten geplanten Trigger erneut (d. h. täglich bei Cron-Jobs).

**Speicherung des Fehlerzustands:** `_job_results[job_id]` im Memory des `MaintenanceService`. Abrufbar über `get_status()`, aber kein Persistence, kein Alert.

**APScheduler-eigenes Error-Handling:** `_on_job_error`-Listener (Zeile 517 in `scheduler.py`) inkrementiert `errors`-Counter und loggt. Kein Re-Queue.

### 7.2 Asyncio Background Tasks

**`_inbound_replay_worker`:**
```python
async def _inbound_replay_worker() -> None:
    try:
        while True:
            summary = await _subscriber_instance.replay_pending_events(limit=200)
            await asyncio.sleep(5)
    except asyncio.CancelledError:
        await runtime_state.set_worker_health("inbound_replay_worker", False)
        raise
```
Fehler innerhalb `replay_pending_events` werden im Subscriber behandelt. Der Task läuft weiter bei Einzelfehlern.

**`_enrich_anomaly_explanation` (fire-and-forget):**
```python
async def _enrich_anomaly_explanation(result: AnomalyResult) -> None:
    try:
        ...
    except Exception:
        logger.debug("AI anomaly enrichment failed", exc_info=True)
```
Alle Exceptions werden auf DEBUG-Level geloggt und geschluckt — non-critical by design.

### 7.3 Lifespan-kritische vs. non-fatale Initialisierung

| Initialisierungsschritt | Fehlerbehandlung |
|---|---|
| CentralScheduler Init | Kein try/except → Exception stoppt Startup |
| MaintenanceService Init + start | Kein try/except → Exception stoppt Startup |
| Alert Suppression Scheduler | try/except → Warning-Log, non-fatal |
| Mock-ESP Recovery | try/except → Warning-Log, non-fatal |
| Sensor Type Auto-Registration | try/except → Warning-Log, non-fatal |
| Sensor Schedule Recovery | try/except → Warning-Log, non-fatal |
| Plugin Sync to DB | try/except → Warning-Log, non-fatal |
| Daily Diagnostic Scheduler | Prüft `diagnostic_schedule_enabled` Flag zuerst |
| Plugin Schedule Registration | try/except → Warning-Log, non-fatal |

---

## 8. Bekannte Inkonsistenzen

### INK-E8-001: Scheduler-Singleton ohne Health-Endpoint

Vollständig dokumentiert in Abschnitt 2.3.

### INK-E8-002: AutoOps-Reports innerhalb von src/

Vollständig dokumentiert in Abschnitt 4.3.

### INK-E8-003: Doppel-Prefix in Job-IDs

> [!INKONSISTENZ] Potenzielles Job-ID-Naming-Problem
>
> **Beobachtung:** `MaintenanceService.start()` ruft `add_cron_job(job_id="cleanup_sensor_data", ..., category=MAINTENANCE)` auf. `add_cron_job` erzeugt intern `full_job_id = f"{category.value}_{job_id}"` = `maintenance_cleanup_sensor_data`. `get_status()` (Zeile 258) filtert dann mit `job_id.startswith("maintenance_")`. Das passt zusammen. Aber: In `main.py` Zeile 450 wird `add_interval_job(job_id="monitor_prometheus_metrics", ..., category=JobCategory.MONITOR)` aufgerufen — ergibt `monitor_monitor_prometheus_metrics`. Diese Inkonsistenz zwischen Konvention (Job-ID ohne Kategorie-Prefix übergeben, Prefix wird automatisch hinzugefügt) und der resultierenden ID mit Doppel-Präfix (wenn Caller bereits Präfix in job_id inkludiert) ist potenziell verwirrend.
>
> **Korrekte Stelle:** `src/core/scheduler.py`, Zeile 229 (`full_job_id = f"{category.value}_{job_id}"`)
> **Empfehlung:** Entweder Konvention dokumentieren (job_id OHNE Kategorie-Präfix übergeben) oder den Caller in main.py anpassen.
> **Erst-Erkennung:** E8, 2026-04-26

### INK-E8-004: AI-Service nutzt hardcodierten Modellnamen

> [!INKONSISTENZ] claude-opus-4-7 hardcodiert in AiService und DebugFixPlugin
>
> **Beobachtung:** `ai_service.py` Zeile 113: `model="claude-opus-4-7"`. `debug_fix.py` Zeile 693: `model="claude-opus-4-7"`. Kein Settings-Eintrag, keine Konfigurierbarkeit. Modell-Updates erfordern Code-Änderungen.
> **Korrekte Stelle:** `.claude/reference/errors/ERROR_CODES.md` (externe Service-Abhängigkeiten)
> **Empfehlung:** Modellnamen in `Settings` auslagern (z. B. `settings.ai.model_name`).
> **Erst-Erkennung:** E8, 2026-04-26

---

## 9. Zusammenfassung

| Komponente | Typ | Singleton | Health-Endpoint |
|---|---|---|---|
| CentralScheduler | APScheduler-Wrapper | Modul-Singleton | Nein (Inkonsistenz E5/INK-E8-001) |
| MaintenanceService | Service | Modul-Singleton | Indirekt via `get_status()`, kein REST-Endpoint |
| NotificationRouter | Service | Nein (Session-gebunden) | n/a |
| AINotificationBridge | Service | Nein | n/a |
| AiService | Modul-Singleton | `ai_service = AiService()` | Nein |
| AutoOpsAgent | Per-Session-Objekt | Nein | n/a |
| PluginRegistry | Klassen-Singleton | `_instance` Klassenattribut | Via /api/v1/plugins |
| ESPService | Per-Session-Objekt | Nein | n/a |
| DiscoveryRateLimiter | Modul-Singleton | `_discovery_rate_limiter` | Nein |

Die Background-Architektur ist funktional vollständig, hat jedoch einen strukturellen Observability-Gap: Der CentralScheduler und die Maintenance-Jobs haben kein externes Health-Monitoring. Fehler in Nacht-Jobs (03:00–04:00) sind nur über Logs erkennbar, nicht über Alerts oder Dashboards.
