# Roadmap: Verifikation & Vervollstaendigung fuer Hardware-Test 2

> **Erstellt:** 2026-03-03 | **Verifiziert:** 2026-03-03 (verify-plan)
> **Kontext:** Phase 4A-4D Code existiert (teils untracked). Vor dem Hardware-Test 2 muessen alle Systeme verifiziert und vervollstaendigt werden.
> **Ziel:** Lueckenlose Pruefung + gezielte Nacharbeit, damit der Hardware-Test 2 reibungslos laeuft und das System danach autonom weiterlaufen kann.
> **Ziel-Repo:** `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one`

---

## Uebersicht: 8 Verifikationsbloecke

```
V1  Email-System vervollstaendigen           (~6-8h)   [IST: 60% fertig]
V2  Diagnostics & Report-Lifecycle           (~3-4h)   [IST: 85% fertig]
V3  AutoOps Autonomie & Scheduling           (~3-5h)   [IST: 75% fertig]
V4  Alert-Management verfeinern              (~4-6h)   [IST: 70% fertig]
V5  Daten-Lifecycle (Backup, Retention)      (~6-8h)   [IST: 40% fertig]
V6  UI/UX Integration                        (~4-6h)   [IST: 50% fertig]
V7  System-Haertung (Fokus Systembugs)       (~2-3h)   [IST: 80% fertig]
V8  Hardware-Test Pre-Flight                 (~4-6h)   [IST: Skill fertig, Ausfuehrung offen]
                                        ─────────────
                                  TOTAL: ~32-46h (korrigiert von 45-60h)
```

**Reduktion:** ~13h weniger als urspruenglich geschaetzt, weil V2, V3, V7 deutlich weiter sind als angenommen.

---

## V1: Email-System vervollstaendigen (~6-8h)

### Ist-Zustand (verifiziert)

**EXISTIERT bereits:**
| Komponente | Pfad | Status |
|------------|------|--------|
| `EmailService` (Resend + SMTP Dual-Provider) | `src/services/email_service.py` | Vollstaendig |
| `NotificationRouter._route_email()` ISA-18.2 | `src/services/notification_router.py` | Vollstaendig |
| `DigestService` (Warning-Batching, 60min) | `src/services/digest_service.py` | Vollstaendig |
| Jinja2-Templates (3x) | `templates/email/` | `test.html`, `alert_critical.html`, `alert_digest.html` |
| Prometheus-Metriken | `src/core/metrics.py` | `god_kaiser_email_sent_total`, `_latency_seconds`, `_errors_total` |
| Test-Email API | `POST /v1/notifications/test-email` | Vollstaendig |
| Frontend Email-Einstellungen | `NotificationPreferences.vue` | Toggle, Adresse, Severity-Filter, Test-Button |
| Config (ENV) | `src/core/config.py` | `EMAIL_ENABLED`, `RESEND_API_KEY`, `SMTP_*` |
| Dependencies | `pyproject.toml` | `resend>=2.0.0`, `jinja2^3.1.0` |

**EXISTIERT NICHT:**
| Komponente | Beschreibung |
|------------|-------------|
| `email_log` DB-Tabelle | Kein Tracking gesendeter Emails (Erfolg/Fehler/Provider) |
| `email_inbox` DB-Tabelle | Kein Email-Empfang |
| `/v1/emails/` Router | Kein dedizierter Email-API-Router (nur `/v1/notifications/test-email`) |
| `CommunicationView.vue` | Kein Frontend-View fuer Emails |
| Email-Store (Pinia) | Kein dedizierter Email-Store |
| Email-API-Client (Frontend) | Email-Funktionen nur in `notifications.ts` |
| Resend Delivery-Webhooks | Kein Tracking ob Email zugestellt wurde |
| IMAP-Empfang | Kein eingehender Email-Kanal |

### Was zu tun ist (priorisiert)

#### V1.1 — Email-Status-Tracking (PRIORITY: Hoch — braucht HW-Test)

**Analyse-Punkte:**
- [ ] `EmailService.send_email()` analysieren: Wo genau Logging einbauen? (Zeile ~80-120 in email_service.py)
- [ ] `notification.py` Model erweitern oder separates `email_log` Model? → Empfehlung: separates Model (SoC)
- [ ] Welche Felder: `id, notification_id (FK), to, subject, template, provider, status, sent_at, error_message, retry_count`

**Implementieren (server-dev):**
- [ ] `EmailLog` DB-Model in `src/db/models/email_log.py`
- [ ] Alembic Migration `add_email_log`
- [ ] `EmailService.send_email()` erweitern: Nach jedem Versuch → Log-Eintrag
- [ ] API: `GET /v1/notifications/email-log` (Pagination, Filter: status, date-range)

**Implementieren (frontend-dev):**
- [ ] `notifications.ts` API-Client erweitern: `getEmailLog()`
- [ ] In `NotificationDrawer.vue` oder `QuickAlertPanel.vue`: Email-Status-Icon pro Notification (wenn email_log verknuepft)

#### V1.2 — Email-Retry bei Fehlschlag (PRIORITY: Mittel)

**Analyse-Punkte:**
- [ ] Aktuell: `EmailService.send_email()` gibt `bool` zurueck, kein Retry
- [ ] `CentralScheduler` (APScheduler) existiert bereits → Retry-Job einplanen
- [ ] Max-Retries: 3, Delay: 5min exponential

**Implementieren (server-dev):**
- [ ] Bei `send_email() → False`: Scheduler-Job `retry_failed_email` registrieren
- [ ] EmailLog-Status: `pending → sent | failed → retrying → sent | permanently_failed`

#### V1.3 — CommunicationView (PRIORITY: Niedrig — Nice-to-have fuer HW-Test)

> **Entscheidung noetig:** Soll ein dedizierter CommunicationView gebaut werden, oder reicht die Integration in bestehende Views (NotificationDrawer + Email-Status in Notifications)?

**Wenn ja, implementieren (frontend-dev):**
- [ ] `CommunicationView.vue` mit Tabs: Email-Log, Plugin-Reports, Einstellungen
- [ ] Route `/communication` im Router
- [ ] Sidebar-Eintrag (Administration-Sektion, nach "Plugins")
- [ ] Email-Status-Store (Pinia)
- [ ] Cross-Links: Alert → Email-Log-Eintrag

#### V1.4 — IMAP-Empfang (PRIORITY: Sehr niedrig — NACH HW-Test)

> **Empfehlung:** Fuer HW-Test 2 NICHT noetig. Spaetere Phase.

### Verifikation V1
- [ ] Email senden → EmailLog-Eintrag mit Status success + Provider
- [ ] Email-Fehler → EmailLog-Eintrag mit Status failed + error_message
- [ ] Fehlgeschlagene Email → Retry nach 5 Min (max 3x)
- [ ] Digest-Email → kommt zum konfigurierten Zeitpunkt (bereits implementiert, verifizieren)
- [ ] Test-Email → Ergebnis sofort sichtbar (bereits implementiert, verifizieren)

---

## V2: Diagnostics & Report-Lifecycle (~3-4h)

### Ist-Zustand (verifiziert)

> **KORREKTUR:** Der urspruengliche Plan sagte "Kein Diagnostics-Backend, keine Reports, keine Historie" — das ist FALSCH. Phase 4D ist weitgehend implementiert.

**EXISTIERT bereits:**
| Komponente | Pfad | Status |
|------------|------|--------|
| `DiagnosticsService` (10 Checks) | `src/services/diagnostics_service.py` | Vollstaendig |
| 10 System-Checks | server, database, mqtt, esp_devices, sensors, actuators, monitoring, logic_engine, alerts, plugins | Alle registriert |
| `DiagnosticReport` DB-Model | `src/db/models/diagnostic.py` | UUID PK, JSONB checks, overall_status |
| Alembic Migration | `alembic/versions/add_diagnostic_reports.py` | Vorhanden (UNTRACKED!) |
| REST-API (6 Endpoints) | `src/api/v1/diagnostics.py` | `POST /run`, `POST /run/{check}`, `GET /history`, `GET /history/{id}`, `POST /export/{id}`, `GET /checks` |
| Router-Registrierung | `src/api/v1/__init__.py` | `diagnostics_router` registriert |
| `DiagnosticsReportGenerator` | `src/services/diagnostics_report_generator.py` | Markdown-Export mit Status-Emojis |
| Logic Engine Integration | `src/services/logic/actions/diagnostics_executor.py` | Action-Typ `run_diagnostic` |
| Logic Engine Condition | `src/services/logic/conditions/diagnostics_evaluator.py` | Condition `diagnostics_status` |
| `main.py` Registrierung | Schritt 6 | Executor + Evaluator + MQTT-Handler registriert |
| Frontend API-Client | `El Frontend/src/api/diagnostics.ts` | 6 Funktionen |
| Pinia Store | `El Frontend/src/shared/stores/diagnostics.store.ts` | State, Computed, Actions |
| `DiagnoseTab.vue` | `El Frontend/src/components/system-monitor/DiagnoseTab.vue` | 10 Check-Cards, Detail-Expand |
| `ReportsTab.vue` | `El Frontend/src/components/system-monitor/ReportsTab.vue` | History-Tabelle, Markdown-Download |
| `MonitorTabs.vue` | 7 Tabs registriert | inkl. `diagnostics` + `reports` |
| Unit-Tests (2 Dateien) | `tests/unit/test_diagnostics_service.py`, `test_diagnostics_report.py` | Vorhanden |

**EXISTIERT NICHT:**
| Komponente | Beschreibung |
|------------|-------------|
| Scheduled Daily Diagnostic | Kein APScheduler-Job registriert — Diagnosen nur on-demand |
| ReportEnricher | Kein automatischer Debug-Kontext nach Diagnose |
| Report-Retention | Kein Auto-Cleanup alter Reports (90 Tage) |
| Report-Diff / Trend | Kein Vergleich aktuell vs. vorherig |
| Plugin-Service Integration | `_build_diagnostics_service()` uebergibt `plugin_service=None` — Plugins-Check gibt WARNING |

**GIT-STATUS: 3 untracked Migrationen muessen committed werden:**
- `add_diagnostic_reports.py`
- `add_plugin_tables.py`
- `rename_notification_metadata_to_extra_data.py`

### Was zu tun ist (priorisiert)

#### V2.1 — Scheduled Daily Diagnostic (PRIORITY: Hoch)

**Analyse-Punkte:**
- [ ] `CentralScheduler` existiert in `src/core/scheduler.py` mit `add_cron_job()`
- [ ] `main.py` Schritt 3.4 ist der Insertion-Point fuer Scheduler-Jobs
- [ ] Kollision mit Maintenance-Jobs vermeiden (03:00 sensor_data, 03:30 command_history)

**Implementieren (server-dev):**
- [ ] In `main.py` nach Schritt 3.4.5: `scheduler.add_cron_job("daily_diagnostic", diagnostics_service.run_full_diagnostic, hour=4, minute=0, kwargs={"triggered_by": "scheduled"})`
- [ ] Config-Option: `DIAGNOSTIC_SCHEDULE_HOUR` (Default: 4, nach Maintenance-Cleanup)
- [ ] DiagnosticsService: `plugin_service` Parameter korrekt uebergeben (Fix `None`)

#### V2.2 — Report-Retention (PRIORITY: Mittel)

**Implementieren (server-dev):**
- [ ] In `DiagnosticsService`: `cleanup_old_reports(max_age_days=90)` Methode
- [ ] Archivierungs-Logik: Bei Reports aelter 90 Tage → `checks` JSON auf `null` setzen, Summary behalten
- [ ] Scheduler-Job: Nach daily diagnostic → cleanup aufrufen

#### V2.3 — Report-Diff (PRIORITY: Niedrig — Nice-to-have)

**Implementieren (server-dev):**
- [ ] `compare_reports(current_id, previous_id)` → Delta-Objekt
- [ ] API: `GET /v1/diagnostics/diff/{report_id}` (vergleicht mit vorherigem)
- [ ] Frontend: Delta-Anzeige in ReportsTab (gruen/rot Pfeile pro Check)

#### V2.4 — ReportEnricher (PRIORITY: Niedrig — NACH HW-Test)

> **Empfehlung:** Fuer HW-Test 2 NICHT noetig. Diagnostics liefern bereits nuetzliche Daten. Enrichment ist Optimierung.

### Verifikation V2
- [x] Diagnose laeuft on-demand und Report wird in DB gespeichert (BEREITS FUNKTIONAL)
- [x] Report enthaelt 10 Checks mit Status/Metrics/Recommendations (BEREITS FUNKTIONAL)
- [x] Report ist als Markdown exportierbar (BEREITS FUNKTIONAL)
- [x] Frontend DiagnoseTab zeigt 10 Check-Cards (BEREITS FUNKTIONAL)
- [x] Frontend ReportsTab zeigt History + Download (BEREITS FUNKTIONAL)
- [ ] Diagnose laeuft taeglich automatisch (FEHLT — V2.1)
- [ ] Report-Retention: Alte Reports werden archiviert (FEHLT — V2.2)
- [ ] Plugin-Check funktioniert korrekt (FIX: plugin_service uebergeben)

---

## V3: AutoOps Autonomie & Scheduling (~3-5h)

### Ist-Zustand (verifiziert)

> **KORREKTUR:** Der urspruengliche Plan sagte "REST-API in Arbeit" — das ist FALSCH. Phase 4C ist vollstaendig implementiert.

**EXISTIERT bereits:**
| Komponente | Pfad | Status |
|------------|------|--------|
| 4 Plugins vollstaendig | `src/autoops/plugins/` | HealthCheck, ESPConfigurator, DebugFix, SystemCleanup |
| `PluginRegistry` (Auto-Discovery) | `src/autoops/core/plugin_registry.py` | Singleton, `discover_plugins()` |
| `PluginService` | `src/services/plugin_service.py` | Execute, Config, History, Toggle, Schedule-CRUD |
| REST-API (8 Endpoints) | `src/api/v1/plugins.py` | list, detail, execute, config, history, enable, disable, schedule |
| DB-Modelle | `src/db/models/plugin.py` | `PluginConfig` (inkl. `schedule` Column!), `PluginExecution` |
| Alembic Migration | `alembic/versions/add_plugin_tables.py` | Vorhanden (UNTRACKED!) |
| Logic Engine Integration | `src/services/logic/actions/plugin_executor.py` | Action-Typ: Plugin per Rule triggern |
| `main.py` Plugin-Sync | Schritt 6.1 | `PluginRegistry.discover_plugins()` → DB-Sync |
| Frontend PluginsView | `El Frontend/src/views/PluginsView.vue` | Grid, SlideOver, Execute, Config |
| Frontend Store | `El Frontend/src/shared/stores/plugins.store.ts` | Vollstaendig |
| Frontend API-Client | `El Frontend/src/api/plugins.ts` | 7 Funktionen |
| Frontend Components | `El Frontend/src/components/plugins/` | `PluginCard.vue`, `PluginConfigDialog.vue`, `PluginExecutionHistory.vue` |
| `PluginContext` (Web/API) | `src/autoops/core/base_plugin.py` | user_id, trigger_source, esp_devices, active_alerts |
| `AutoOpsContext` (CLI/Agent) | `src/autoops/core/context.py` | server_url, auth_token, device_mode, dry_run |

**EXISTIERT NICHT / LUECKEN:**
| Komponente | Beschreibung |
|------------|-------------|
| **Schedule-Verdrahtung** | `PluginConfig.schedule` Feld + `PUT /schedule` API existieren, aber KEIN Code in `main.py` liest Schedules und registriert APScheduler-Jobs! |
| Schedule-UI im Frontend | Kein Cron-Editor in PluginsView/PluginConfigDialog |
| Plugin→Diagnostics Bridge | Plugins koennen keine Diagnosen triggern |
| Plugin→Notification Bridge | Plugin-Ergebnisse werden nicht als Notifications geroutet |
| Async Job-Status | Plugin-Execution ist synchron (HTTP Response), kein WebSocket-Push |

### Was zu tun ist (priorisiert)

#### V3.1 — Schedule-Verdrahtung (PRIORITY: Hoch — Kernluecke!)

**Analyse-Punkte:**
- [ ] `PluginService.get_scheduled_plugins()` existiert — gibt enabled Plugins mit non-null `schedule` zurueck
- [ ] `CentralScheduler.add_cron_job()` existiert — akzeptiert cron-Expression
- [ ] Insertion-Point: `main.py` nach Schritt 6.1 (Plugin-Sync)
- [ ] Parse-Format: `schedule` ist String (z.B. `"0 3 * * *"`) — muss in `CronTrigger` umgewandelt werden

**Implementieren (server-dev):**
- [ ] In `main.py` nach Plugin-Sync: `for plugin in plugin_service.get_scheduled_plugins(): scheduler.add_cron_job(...)`
- [ ] `PluginService.execute_plugin()` als Job-Target (inkl. DB-Session, Auth)
- [ ] Bei Schedule-Update via API: Alten Job entfernen, neuen registrieren
- [ ] Default-Schedules beim ersten Start setzen (HealthCheck: `0 3 * * *`, SystemCleanup: `0 4 * * 0`)

#### V3.2 — Schedule-UI im Frontend (PRIORITY: Mittel)

**Implementieren (frontend-dev):**
- [ ] In `PluginConfigDialog.vue`: Cron-Expression-Input oder Preset-Dropdown (taeglich/woechentlich/monatlich/aus)
- [ ] Naechster Run anzeigen (berechnet aus Cron-Expression)
- [ ] `plugins.ts` API: `updateSchedule(pluginId, schedule)` Funktion nutzen

#### V3.3 — Plugin→Notification Bridge (PRIORITY: Mittel)

**Analyse-Punkte:**
- [ ] `PluginService.execute_plugin()` speichert Result in `PluginExecution` — aber sendet keine Notification
- [ ] `NotificationRouter.route()` kann von jedem Service aufgerufen werden
- [ ] Severity-Mapping: PluginResult.status → Notification-Severity (success→info, error→warning/critical)

**Implementieren (server-dev):**
- [ ] Nach `execute_plugin()`: `NotificationRouter.route()` mit Plugin-Ergebnis
- [ ] Nur bei Fehlern oder wenn Plugin explizit `notify=True` setzt

#### V3.4 — Plugin→Diagnostics Bridge (PRIORITY: Niedrig)

> **Empfehlung:** HealthCheck-Plugin sollte `DiagnosticsService.run_full_diagnostic()` aufrufen statt eigene Checks. Aber das ist Refactoring, nicht HW-Test-kritisch.

### Verifikation V3
- [x] Alle 4 Plugins registriert und via API ausfuehrbar (BEREITS FUNKTIONAL)
- [x] Plugin-Config via Frontend aenderbar (BEREITS FUNKTIONAL)
- [x] Plugin-History sichtbar (BEREITS FUNKTIONAL)
- [x] Plugins per Logic-Rule triggerbar (BEREITS FUNKTIONAL)
- [ ] Schedule-Verdrahtung: Plugins laufen per Cron (FEHLT — V3.1)
- [ ] Schedule-UI: Cron im Frontend konfigurierbar (FEHLT — V3.2)
- [ ] Plugin-Ergebnis als Notification (FEHLT — V3.3)

---

## V4: Alert-Management verfeinern (~4-6h)

### Ist-Zustand (verifiziert)

**EXISTIERT bereits:**
| Komponente | Pfad | Status |
|------------|------|--------|
| ISA-18.2 Lifecycle (Active→Ack→Resolved) | `notification.py` | `AlertStatus` mit `VALID_TRANSITIONS` |
| `PATCH /notifications/{id}/acknowledge` | `notifications.py` | State-Machine-validiert |
| `PATCH /notifications/{id}/resolve` | `notifications.py` | State-Machine-validiert |
| `GET /alerts/active` (paginated) | `notifications.py` | Vollstaendig |
| `GET /alerts/stats` (ISA-18.2 KPIs) | `notifications.py` | MTTA, MTTR, active/ack counts |
| Alert-Suppression Service | `alert_suppression_service.py` | `suppression_until` (ISO datetime), auto re-enable |
| Alert-Suppression Scheduler | `alert_suppression_scheduler.py` | Prueft Expiry alle 5 Min |
| Custom Thresholds | `sensor.alert_config` JSON | Per-Sensor warning/critical Override |
| Severity Override | `sensor.alert_config` JSON | `severity_override: critical|warning|info` |
| Fingerprint Dedup | `notification_router.py` | Primary: fingerprint, Fallback: 60s title-dedup |
| Root-Cause Grouping | `notification_router.py` | `suppress_dependent_alerts()`, `correlation_id` |
| QuickAlertPanel | `QuickAlertPanel.vue` | Top-5, Ack/Resolve/Mute, Status-Filter |
| AlertStatusBar | `AlertStatusBar.vue` | Compact ISA-18.2 KPIs, 30s Polling |
| AlertCenterStore | `alert-center.store.ts` | Stats, ActiveAlerts, 30s Polling |
| Prometheus-Metriken | `metrics.py` | ack_total, resolved_total, active gauge, root_cause_suppressed |

**TEILWEISE / FEHLEND:**
| Komponente | Status |
|------------|--------|
| Timed Snooze (1h/4h/24h/1w) | Backend: `suppression_until` existiert im Schema. Frontend: `QuickAlertPanel` setzt `alerts_enabled=false` (PERMANENT), nicht `suppression_until` mit Datum! |
| "Nie wieder" Pattern | Backend: `alerts_enabled: false` ist de facto permanent, aber kein explizites "nie wieder" UI-Pattern mit Bestaetigung |
| "Doch wieder" / Suppress-Liste | Keine zentrale Uebersicht stummgeschalteter Alerts |
| Severity-Override Ablauf | Kein `override_expires_at` — Overrides sind permanent |
| Kategorie-Filter | QuickAlertPanel: Nur Status+Severity-Filter, kein `system` vs. `sensor_threshold` |

### Was zu tun ist (priorisiert)

#### V4.1 — Timed Snooze statt Permanent-Mute (PRIORITY: Hoch)

**Analyse-Punkte:**
- [ ] `QuickAlertPanel.vue` Zeile mit `updateAlertConfig()` analysieren: Aktuell setzt es `alerts_enabled: false` ohne `suppression_until`
- [ ] Backend `alert_suppression_service.py`: `suppression_until` wird bereits korrekt ausgewertet und auto-re-enabled
- [ ] Aenderung ist primaer FRONTEND: Statt `alerts_enabled=false` → `suppression_until` mit Preset-Datum setzen

**Implementieren (frontend-dev):**
- [ ] In `QuickAlertPanel.vue`: Mute-Button → Dropdown mit Presets (1h, 4h, 24h, 1 Woche, Permanent)
- [ ] Preset berechnet `suppression_until` als ISO-Datetime: `new Date(Date.now() + 3600000).toISOString()`
- [ ] "Permanent" setzt `alerts_enabled: false` (wie bisher)
- [ ] Snooze-Timer-Anzeige: Verbleibende Zeit bis `suppression_until`

#### V4.2 — Stummgeschaltete-Alerts-Uebersicht (PRIORITY: Mittel)

**Analyse-Punkte:**
- [ ] Wo anzeigen? Optionen: (A) SettingsView neuer Tab, (B) SystemMonitorView neuer Tab, (C) NotificationDrawer Footer
- [ ] API: `GET /v1/sensors?alerts_enabled=false` oder neuer Endpoint `GET /v1/notifications/suppressed`

**Implementieren (server-dev + frontend-dev):**
- [ ] API: `GET /v1/notifications/suppressed-sources` — Liste aller Sensoren/Devices mit aktiver Suppression
- [ ] Frontend: Suppress-Liste in SettingsView oder als SlideOver vom NotificationDrawer
- [ ] Pro Eintrag: Sensor-Name, Grund, Ablaufdatum, "Reaktivieren" Button

#### V4.3 — Kategorie-Filter (PRIORITY: Mittel)

**Analyse-Punkte:**
- [ ] `Notification.category` existiert bereits als String-Feld in DB
- [ ] Aktuelle Kategorien im Code: `sensor_threshold`, `device_event`, `system`, `actuator_alert`
- [ ] QuickAlertPanel hat bereits Status-Chips — Kategorie-Chips analog dazu

**Implementieren (frontend-dev):**
- [ ] In `QuickAlertPanel.vue`: Zweite Chip-Reihe: "Alle" | "System" | "Sensoren" | "Geraete"
- [ ] In `NotificationDrawer.vue`: Gleicher Kategorie-Filter
- [ ] Visuell: System-Alerts mit `ServerCrash`-Icon (lucide: `ServerCrash`), Sensor-Alerts mit `Thermometer`

#### V4.4 — Severity-Override Ablauf (PRIORITY: Niedrig)

> **Empfehlung:** Fuer HW-Test 2 NICHT noetig. Severity-Overrides sind selten und manuell. Spaetere Optimierung.

### Verifikation V4
- [x] ISA-18.2 Lifecycle: Active → Ack → Resolved (BEREITS FUNKTIONAL)
- [x] Alert-Suppression mit Auto-Re-Enable (BEREITS FUNKTIONAL)
- [x] Custom Thresholds + Severity Override (BEREITS FUNKTIONAL)
- [x] QuickAlertPanel mit Top-5 Alerts (BEREITS FUNKTIONAL)
- [x] ISA-18.2 KPIs (MTTA, MTTR) (BEREITS FUNKTIONAL)
- [ ] Timed Snooze statt Permanent-Mute (FEHLT — V4.1)
- [ ] Stummgeschaltete-Alerts-Uebersicht (FEHLT — V4.2)
- [ ] Kategorie-Filter System vs. Sensoren (FEHLT — V4.3)

---

## V5: Daten-Lifecycle (Backup, Retention, Storage) (~6-8h)

### Ist-Zustand (verifiziert)

**EXISTIERT bereits:**
| Komponente | Pfad | Status |
|------------|------|--------|
| Audit-Log JSON-Backup | `src/services/audit_backup_service.py` | Vollstaendig: create, restore, list, delete, cleanup |
| Audit-Retention Service | `src/services/audit_retention_service.py` | Per-Severity: info=30d, warning=90d, error=365d, critical=nie |
| `preserve_emergency_stops` | `audit_retention_service.py` | Flag existiert, Default: `True` |
| Log-Rotation | `src/core/logging_config.py` | `RotatingFileHandler`: 10MB max, 10 Backup-Files |
| MaintenanceService | `src/services/maintenance/service.py` | Sensor-Data, Command-History, Orphaned-Mocks Cleanup |
| MaintenanceSettings (ENV) | `src/core/config.py` L314-582 | 15+ ENV-Variablen fuer Retention/Cleanup |
| Cleanup-Schedule | `main.py` Schritt 3.4.2 | sensor_data 03:00, command_history 03:30, orphans hourly |
| Audit-API (CRUD+Backup) | `src/api/v1/audit.py` | list, stats, cleanup-dry-run, cleanup, backup-create, backup-list, backup-delete |
| MaintenanceView (Frontend) | `El Frontend/src/views/MaintenanceView.vue` | Service-Status, Cleanup-Panels, Job-Liste |
| Log-Pfad konfigurierbar | `LOG_FILE_PATH` ENV | Default: `logs/god_kaiser.log` |

**EXISTIERT NICHT:**
| Komponente | Beschreibung |
|------------|-------------|
| **PostgreSQL pg_dump Backup** | Komplett fehlend — in PRODUCTION_READINESS.md als TODO gelistet |
| **DatabaseBackupService** | Kein Service fuer DB-Backups |
| **Backup-API fuer DB** | Kein `/v1/backups/database/*` |
| Konfigurierbarer Backup-Pfad | Audit-Backup Pfad hardcoded: `backups/audit_logs/` |
| Frontend Backup-Management | Audit-API existiert, aber kein dediziertes Vue-Component dafuer |
| Storage-Config (zentral) | Kein `StorageConfig` Model oder Settings-Page |
| Disk-Space Prometheus Gauge | Health-Endpoint prueft disk, aber keine Prometheus-Metrik dafuer |
| Retention-Uebersicht (Frontend) | Keine zentrale Seite die alle Retention-Policies zeigt |

**HINWEIS:** Alle Retention/Cleanup-Services sind per Default DEAKTIVIERT (`enabled: False`) als Safety-First-Design. Nur `heartbeat_log_retention` ist per Default aktiv.

### Was zu tun ist (priorisiert)

#### V5.1 — PostgreSQL-Backup (PRIORITY: Hoch — Datensicherheit)

**Analyse-Punkte:**
- [ ] pg_dump Zugriff: Server laeuft in Docker-Container `automationone-server`, PostgreSQL in `automationone-postgres`
- [ ] Optionen: (A) `docker exec automationone-postgres pg_dump` vom Host, (B) Backup-Service im Server-Container mit `asyncpg` Copy-to-File, (C) Docker Volume-Backup
- [ ] Empfehlung: Option A ist simpelste — Shell-Command via `asyncio.subprocess`
- [ ] Backup-Pfad: `backups/database/` (analog zu `backups/audit_logs/`)
- [ ] Retention: GVS-Schema (7 daily + 4 weekly + 3 monthly) oder einfach: 7 Tage + max 20 Backups

**Implementieren (server-dev):**
- [ ] `DatabaseBackupService` in `src/services/database_backup_service.py`
- [ ] `create_backup()`: `pg_dump` via subprocess, Output als `.sql.gz`
- [ ] `list_backups()`, `delete_backup()`, `cleanup_old_backups()`
- [ ] API: `POST /v1/backups/database/create`, `GET /v1/backups/database/list`
- [ ] Scheduler-Job: Taeglich 02:00 (VOR Cleanup um 03:00)
- [ ] Restore: `POST /v1/backups/database/restore/{id}` (mit Confirm-Flag)

#### V5.2 — Backup-Pfad konfigurierbar (PRIORITY: Mittel)

**Implementieren (server-dev):**
- [ ] ENV: `BACKUP_BASE_PATH` (Default: `./backups/`)
- [ ] `audit_backup_service.py`: Pfad aus Config statt hardcoded
- [ ] `database_backup_service.py`: Gleiche Config nutzen

#### V5.3 — Frontend Backup-UI (PRIORITY: Mittel)

**Analyse-Punkte:**
- [ ] Wo einbauen? Optionen: (A) MaintenanceView erweitern (Tab: "Backups"), (B) SystemMonitorView neuer Tab
- [ ] Empfehlung: MaintenanceView erweitern — dort ist bereits Cleanup-Logik

**Implementieren (frontend-dev):**
- [ ] In MaintenanceView: Neuer Tab/Section "Backups"
- [ ] DB-Backups: Liste mit Datum, Groesse, Typ, Download-Button
- [ ] Audit-Backups: Liste (API existiert bereits!)
- [ ] "Jetzt Backup erstellen" Button
- [ ] Disk-Space-Anzeige (von Health-Endpoint: `disk_percent`, `disk_free_gb`)

#### V5.4 — Retention-Uebersicht + Disk-Gauge (PRIORITY: Niedrig)

**Implementieren:**
- [ ] Prometheus Gauge: `god_kaiser_disk_percent` (in `update_all_metrics_async()` neben CPU/Memory)
- [ ] Frontend: Retention-Summary in MaintenanceView Sidebar/Footer

#### V5.5 — Verifizierung Safety-Garantien (PRIORITY: Hoch — nur Pruefung)

**Pruefen (kein Code noetig, nur Verifizierung):**
- [ ] `preserve_emergency_stops=True` → Emergency-Stop Events ueberleben Cleanup
- [ ] `severity_days.critical=0` → CRITICAL Events werden nie geloescht
- [ ] Cleanup-Order: 02:00 Backup → 03:00 sensor_data → 03:30 command_history (korrekt sequenziert)
- [ ] Dry-Run Default: Alle Cleanups default `dry_run=True` — muss explizit deaktiviert werden

### Verifikation V5
- [x] Audit-Log JSON-Backup funktioniert (BEREITS FUNKTIONAL)
- [x] Audit-Retention per Severity (BEREITS FUNKTIONAL, aber disabled by default)
- [x] Log-Rotation (BEREITS FUNKTIONAL)
- [x] CRITICAL Events werden nie geloescht (BEREITS IMPLEMENTIERT)
- [x] Emergency-Stops geschuetzt (BEREITS IMPLEMENTIERT)
- [ ] PostgreSQL pg_dump Backup (FEHLT — V5.1)
- [ ] Backup-Pfad konfigurierbar (FEHLT — V5.2)
- [ ] Frontend Backup-UI (FEHLT — V5.3)

---

## V6: UI/UX Integration (~4-6h)

### Ist-Zustand (verifiziert)

> **KORREKTUREN:** QAB hat 4 Sub-Panels (nicht 5), Actions sind DYNAMISCH (nicht hardcodiert), SystemMonitorView hat BEREITS 7 Tabs (nicht 5).

**EXISTIERT bereits:**
| Komponente | Pfad | Status |
|------------|------|--------|
| QAB: 7 Dateien | `El Frontend/src/components/quick-action/` | FAB, Menu, Item, Alert, Nav, Widget, Dashboard Panels |
| `useQuickActions.ts` Composable | `El Frontend/src/composables/useQuickActions.ts` | DYNAMISCH per Route, nicht hardcodiert |
| QuickActionStore | `El Frontend/src/shared/stores/quick-action.store.ts` | Context + Global Actions |
| SystemMonitorView: 7 Tabs | events, logs, database, mqtt, health, diagnostics, reports | Alle funktional |
| PluginsView | `El Frontend/src/views/PluginsView.vue` | Grid, SlideOver, Execute, Config |
| MaintenanceView | `El Frontend/src/views/MaintenanceView.vue` | Cleanup-Panels, Job-Liste |
| CalibrationView | `El Frontend/src/views/CalibrationView.vue` | Vorhanden |
| SlideOver Primitive | `El Frontend/src/shared/design/primitives/SlideOver.vue` | 3 Sizes, ESC-Close, Scroll-Lock |
| 13 Design-Primitives | `El Frontend/src/shared/design/primitives/` | Badge, Button, Card, Input, Modal, Select, Skeleton, Spinner, Toggle, ... |
| Glass/Token Styles | `El Frontend/src/styles/` | tokens.css, glass.css, animations.css |

**Sidebar (IST):**
| Sektion | Links |
|---------|-------|
| Navigation | Dashboard (`/hardware`), Regeln (`/logic`), Komponenten (`/sensors`) |
| Administration (Admin) | System (`/system-monitor`), Benutzer (`/users`), Wartung (`/system-monitor?tab=health`), Kalibrierung (`/calibration`), Plugins (`/plugins`) |
| Footer | Einstellungen (`/settings`), User-Info |

**QAB Global Actions (IST):**
| Action | Funktion |
|--------|----------|
| `global-alerts` | Alert-Panel oeffnen (mit Badge) |
| `global-navigation` | Navigation-Panel |
| `global-emergency` | Emergency Stop (CustomEvent) |
| `global-search` | Quick-Search / Command Palette (Ctrl+K) |

**QAB Context Actions (IST, per Route):**
| Route | Actions |
|-------|---------|
| `/hardware` | Live-Monitor, Widget hinzufuegen |
| `/monitor` | Dashboards |
| `/editor` | Widget hinzufuegen |
| `/logic` | Ausfuehrungslog |
| `/system-monitor` | Log-Suche, Health-Check |
| `/sensors` | Live-Monitor |

**EXISTIERT NICHT:**
| Komponente | Beschreibung |
|------------|-------------|
| CommunicationView | Kein View, keine Route |
| QAB: "Diagnose starten" Action | Nicht in useQuickActions registriert |
| QAB: "Backup erstellen" Action | Nicht registriert |
| QAB: Plugin-eigene Actions | Kein Extension-Pattern fuer Plugins |
| Sidebar: "Kommunikation" Eintrag | Nicht vorhanden |

### Was zu tun ist (priorisiert)

#### V6.1 — QAB-Actions erweitern (PRIORITY: Hoch — schneller Gewinn)

**Analyse-Punkte:**
- [ ] `useQuickActions.ts` analysieren: Wie werden Actions registriert? (watch auf route.path)
- [ ] Neue Actions in `setGlobalActions()` oder in Route-spezifischem `setContextActions()`
- [ ] Diagnose-Store existiert bereits: `useDiagnosticsStore()` mit `runDiagnostic()`

**Implementieren (frontend-dev):**
- [ ] In `useQuickActions.ts` Global Actions erweitern:
  - "Diagnose starten" → `diagnosticsStore.runDiagnostic()` + Feedback-Toast
  - "Letzter Report" → `router.push('/system-monitor?tab=reports')`
- [ ] In `/system-monitor` Context Actions erweitern:
  - "Volle Diagnose" → `diagnosticsStore.runDiagnostic()`
- [ ] In `/plugins` Context Actions:
  - "HealthCheck ausfuehren" → `pluginsStore.executePlugin('health_check')`

#### V6.2 — CommunicationView Entscheidung (PRIORITY: Entscheidung noetig)

> **Frage an TM:** Wird ein dedizierter CommunicationView benoetigt, oder reichen die bestehenden Views?
>
> **Argument DAGEGEN:** Plugin-Reports → PluginsView (existiert). Diagnose-Reports → SystemMonitorView ReportsTab (existiert). Email-Log → kann in NotificationDrawer integriert werden. Email-Settings → NotificationPreferences.vue (existiert).
>
> **Argument DAFUER:** Zentraler Ort fuer alle "Output"-Kanaele des Systems (Emails, Reports, Notifications). Aber: Dupliziert Information die bereits in spezifischen Views liegt.
>
> **Empfehlung:** KEIN CommunicationView fuer HW-Test 2. Stattdessen: Email-Log in NotificationDrawer integrieren. CommunicationView als spaetere UX-Optimierung.

#### V6.3 — Design-Konsistenz pruefen (PRIORITY: Mittel — vor HW-Test)

**Pruefen (frontend-dev):**
- [ ] Alle neuen Tabs (diagnostics, reports in SystemMonitorView) nutzen Design-Tokens
- [ ] PluginsView nutzt Glassmorphism-Pattern konsistent
- [ ] DiagnoseTab: Loading/Empty/Error States vorhanden
- [ ] ReportsTab: Loading/Empty/Error States vorhanden
- [ ] Alle neuen Components: `onUnmounted()` Cleanup fuer Subscriptions/Intervals

### Verifikation V6
- [x] QAB: 4 Sub-Panels funktional (BEREITS FUNKTIONAL)
- [x] QAB: Dynamische Actions per Route (BEREITS FUNKTIONAL)
- [x] SystemMonitorView: 7 Tabs funktional (BEREITS FUNKTIONAL)
- [x] PluginsView: Grid + Execute + Config (BEREITS FUNKTIONAL)
- [ ] QAB: "Diagnose starten" Action (FEHLT — V6.1)
- [ ] QAB: "Letzter Report" Action (FEHLT — V6.1)
- [ ] Design-Konsistenz neuer Components (PRUEFEN — V6.3)

---

## V7: System-Haertung (Fokus Systembugs) (~2-3h)

### Ist-Zustand (verifiziert)

> **KORREKTUR:** Der urspruengliche Plan behandelte V7 als ob wenig existiert. Tatsaechlich ist die Resilience-Infrastruktur UMFANGREICH implementiert.

**EXISTIERT bereits:**
| Komponente | Pfad | Status |
|------------|------|--------|
| Circuit Breaker (3x) | `src/core/resilience/circuit_breaker.py` | MQTT (5 failures/30s), DB (3/10s), External API (5/60s) |
| Circuit Breaker Registry | `src/core/resilience/registry.py` | Singleton, konfigurierbar via ENV |
| DB Circuit Breaker Integration | `src/db/session.py` | `resilient_session()` Context Manager |
| Retry Decorator (async+sync) | `src/core/resilience/retry.py` | 3 attempts, exponential backoff, jitter |
| Timeout Module | `src/core/resilience/timeout.py` | MQTT=5s, DB-simple=5s, DB-complex=30s, API=10s, WS=2s |
| MQTT Auto-Reconnect | `src/mqtt/client.py` | paho backoff 1s-60s, auto re-subscribe |
| MQTT Offline-Buffer | `src/mqtt/offline_buffer.py` | Queue max 1000, flush batch 50 |
| DB Connection Pool | `src/db/session.py` | pool_size=10, max_overflow=20, pre_ping=True |
| DB Startup Retry | `src/db/session.py` `init_db()` | 5 attempts, exponential doubling from 2s |
| Frontend WS Reconnect | `El Frontend/src/services/websocket.ts` | 10 attempts, 1s-30s exponential, token refresh |
| Frontend Tab-Switch Recovery | `websocket.ts` | Visibility API: reconnect on tab-switch |
| Prometheus Metriken (50+) | `src/core/metrics.py` | System, MQTT, WS, DB, ESP, Sensor, Notification, Alert |
| Health Endpoints (5) | `src/api/v1/health.py` | `/`, `/detailed`, `/esp`, `/live`, `/ready` |
| Disk-Check im Health | `health.py` | Warning >90%, Failed >=95% (psutil) |
| Maintenance Jobs (7) | `main.py` Schritt 3.4.2 | sensor_data, command_history, orphans, health_esp, health_mqtt, health_sensors, aggregate_stats |
| Plugin-Crash-Isolation | `plugin_service.py` | try/except mit rollback, Error in PluginExecution |

**LUECKEN:**
| Komponente | Status |
|------------|--------|
| Disk-Space Prometheus Gauge | Nur im Health-Endpoint, nicht als Prometheus-Metrik |
| Connection-Pool Prometheus Gauge | Pool-Nutzung nicht als Metrik exponiert |
| Memory-Leak Trend-Alert | Kein automatischer Alert bei steigendem Memory ueber 24h |
| Stale WS Connection Cleanup | Nicht explizit implementiert (WebSocketManager hat disconnect, aber kein aktives Pruning) |

### Was zu tun ist (priorisiert)

#### V7.1 — Systembugs vs. Sensor-Kalibrierung trennen (PRIORITY: Hoch — Konzept-Pruefung)

**Pruefen (kein Code noetig, nur Analyse):**
- [ ] `Notification.category` Werte im Code: Welche Kategorien werden tatsaechlich gesetzt?
- [ ] Sensor-Handler `sensor_handler.py`: Welche Alert-Source wird bei Threshold-Ueberschreitung gesetzt?
- [ ] DiagnosticsService: Prueft `sensors`-Check nur "liefert Daten?" oder auch Wertplausibilitaet?
- [ ] Anomalie-Detection Code: Existiert irgendwo Isolation-Forest-Code? (Sollte NICHT aktiv sein)

#### V7.2 — Absturz-Sicherheit verifizieren (PRIORITY: Hoch — nur Pruefung/Test)

**Pruefen (manuell + Code-Review):**
- [ ] Server-Neustart: `main.py` Lifespan re-registriert alle 7 Scheduler-Jobs, 13 MQTT-Handler ← Code-Review
- [ ] Plugin-Crash: `PluginService.execute_plugin()` hat try/except mit rollback ← verifiziert
- [ ] DiagnosticsService: Einzelner Check-Fehler → `try/except` pro Check? ← Code pruefen
- [ ] MQTT-Disconnect Simulation: `mosquitto_sub` stoppen → Server reconnects? ← manueller Test
- [ ] WebSocket-Disconnect: Browser-Tab schliessen/oeffnen → reconnect mit Token-Refresh? ← manueller Test

#### V7.3 — Fehlende Prometheus-Metriken (PRIORITY: Niedrig)

**Implementieren (server-dev):**
- [ ] `god_kaiser_disk_percent` Gauge in `update_all_metrics_async()` (neben CPU/Memory)
- [ ] Optional: `god_kaiser_db_pool_size` / `god_kaiser_db_pool_checkedout` Gauges

### Verifikation V7
- [x] Circuit Breaker fuer MQTT, DB, External API (BEREITS FUNKTIONAL)
- [x] MQTT Auto-Reconnect mit Backoff (BEREITS FUNKTIONAL)
- [x] DB Startup-Retry + Connection Pool (BEREITS FUNKTIONAL)
- [x] Frontend WS-Reconnect mit Token-Refresh (BEREITS FUNKTIONAL)
- [x] Retry-Decorator mit Exponential Backoff (BEREITS FUNKTIONAL)
- [x] Plugin-Crash-Isolation (BEREITS FUNKTIONAL)
- [x] Disk-Check im Health-Endpoint (BEREITS FUNKTIONAL)
- [ ] Alert-Kategorie-Trennung verifizieren (PRUEFEN — V7.1)
- [ ] Absturz-Szenarien manuell testen (PRUEFEN — V7.2)
- [ ] Disk-Space Prometheus Gauge (OPTIONAL — V7.3)

---

## V8: Hardware-Test Pre-Flight (~4-6h)

### Ist-Zustand (verifiziert)

**EXISTIERT bereits:**
| Komponente | Pfad | Status |
|------------|------|--------|
| Hardware-Test Skill (F4) | `.claude/skills/hardware-test/SKILL.md` | 6-Phasen-Flow, vollstaendig |
| Hardware-Profile (3) | `.claude/hardware-profiles/` | `ds18b20_basic.yaml`, `sht31_basic.yaml`, `sht31_ds18b20_relay.yaml` |
| F4 Flow-Definition | `.claude/reference/testing/flow_reference.md` | F4 mit State-Persistence |
| Trockentest-Erkenntnisse | `flow_reference.md` F4.5 | 4 Issues (alle FIXED) |

### Was VOR dem Hardware-Test zu pruefen ist

#### V8.1 — System-Bereitschaft

**Docker Core (MUSS laufen):**
- [ ] `automationone-postgres` (Port 5432) — `pg_isready`
- [ ] `automationone-mqtt` (Port 1883, 9001) — `mosquitto_sub -C 1 -W 5`
- [ ] `automationone-server` (Port 8000) — `curl -sf http://localhost:8000/api/v1/health/live`
- [ ] `automationone-frontend` (Port 5173) — `curl -sf http://localhost:5173`

**Docker Monitoring (OPTIONAL, Profile `monitoring`):**
- [ ] `automationone-grafana` (Port 3000), `automationone-prometheus` (Port 9090), `automationone-loki` (Port 3100)
- [ ] Starten mit: `make monitor-up` (= `docker compose --profile monitoring up -d`)
- [ ] Stoppen mit: `make monitor-down`

> **KORREKTUR:** Plan listete Monitoring-Container als MUSS — sie sind OPTIONAL (Profile). Fuer HW-Test: `make dev` (Core) + `make monitor-up` (Monitoring).

- [ ] Backend: `GET /api/v1/health/live` → `{"status": "ok"}` (NICHT `/v1/health/` wie im Original-Plan)
- [ ] Frontend: Build fehlerfrei (`npm run build` in El Frontend)
- [ ] DB: 3 untracked Migrationen committen und anwenden (diagnostic_reports, plugin_tables, rename_metadata)
- [ ] MQTT: God-Kaiser Server verbunden (Health-Endpoint prueft `mqtt_connected`)

#### V8.2 — Sensor-Hardware

- [ ] Profil waehlen: `sht31_basic.yaml` oder `ds18b20_basic.yaml`
- [ ] ESP32 geflasht mit aktueller Firmware: `pio run -e seeed_xiao_esp32c3 -t upload`
- [ ] Captive Portal: WiFi-Credentials + Server-URL eingegeben
- [ ] Heartbeat kommt an: `mosquitto_sub -h localhost -t "kaiser/+/esp/+/system/heartbeat" -v -C 1 -W 60`
- [ ] Sensordaten fliessen: `mosquitto_sub -h localhost -t "kaiser/+/esp/+/sensor/+/data" -v -C 3 -W 60`

#### V8.3 — Monitoring-Volltest (nur wenn Monitoring-Stack laeuft)

- [ ] Grafana Dashboard: Sensor-Daten sichtbar (`god_kaiser_sensor_value` Gauge)
- [ ] Prometheus: ESP-Gauges aktualisieren (`god_kaiser_esp_online`, `god_kaiser_esp_last_heartbeat`)
- [ ] Loki: Server-Logs fliessen (Alloy → Loki)
- [ ] Alerts: Sensor-Threshold → Notification im Frontend (QuickAlertPanel/NotificationDrawer)

#### V8.4 — AutoOps-Volltest

- [ ] HealthCheck via REST: `POST /api/v1/plugins/health_check/execute` → Result mit ESP-Status
- [ ] DebugFix via REST: `POST /api/v1/plugins/debug_fix/execute` → Scan-Ergebnis
- [ ] Diagnose via REST: `POST /api/v1/diagnostics/run` → Report mit 10 Checks
- [ ] Frontend: DiagnoseTab zeigt Ergebnis, ReportsTab zeigt History

#### V8.5 — Stabilitaetstest (30 Min, per F4 Flow)

- [ ] `/hardware-test` Skill starten mit gewaehltem Profil
- [ ] Phase 0-6 durchlaufen (Skill orchestriert automatisch)
- [ ] Final Report: `HW_TEST_FINAL_REPORT.md` mit Scorecard
- [ ] Erwartung: Overall HEALTHY, keine Luecken > 30s, kein Alert-Flooding

### Pre-Flight Checkliste (vor HW-Test Start)

| # | Check | Befehl | Erwartung |
|---|-------|--------|-----------|
| 1 | Docker Core | `make status` | 4 Container healthy |
| 2 | Health | `make health` | `{"status": "ok"}` |
| 3 | MQTT | `make mqtt-sub` (kurz) | Messages fliessen |
| 4 | DB Migrationen | `alembic upgrade head` | Keine pending |
| 5 | Frontend Build | `npm run build` (El Frontend) | Exit 0 |
| 6 | Git sauber | `git status` | Keine unerwarteten Changes |
| 7 | Firmware aktuell | `pio run -e seeed_xiao_esp32c3` | Build OK |
| 8 | HW-Profil gewaehlt | YAML in `.claude/hardware-profiles/` | Profil existiert |

---

## Reihenfolge (korrigiert)

```
PHASE A — Grundsicherung (parallel moeglich):
├── V5.1 (PostgreSQL-Backup) ← Datensicherheit
├── V5.5 (Safety-Garantien verifizieren) ← nur Pruefung
└── V7.1-V7.2 (System-Haertung verifizieren) ← meist nur Pruefung
    ↓
PHASE B — Scheduler-Verdrahtung (sequenziell):
├── V2.1 (Daily Diagnostic Scheduler) ← kurz, 1h
├── V3.1 (Plugin Schedule-Verdrahtung) ← kurz, 2h
└── V2.2 (Report-Retention) ← kurz, 1h
    ↓
PHASE C — Frontend-Verfeinerung (parallel moeglich):
├── V4.1 (Timed Snooze statt Permanent-Mute) ← Frontend-Aenderung
├── V6.1 (QAB-Actions erweitern) ← schneller Gewinn
└── V1.1 (Email-Status-Tracking) ← Backend + Frontend
    ↓
PHASE D — Nice-to-have (parallel, nach Bedarf):
├── V4.2 (Stummgeschaltete-Alerts-Uebersicht)
├── V4.3 (Kategorie-Filter)
├── V3.2 (Schedule-UI)
├── V5.3 (Frontend Backup-UI)
└── V6.3 (Design-Konsistenz pruefen)
    ↓
V8 (Hardware-Test Pre-Flight) ← LETZTER SCHRITT
```

**Empfohlene Reihenfolge:** Phase A → Phase B → Phase C → V8
**Phase D:** Nach Bedarf, NICHT blockierend fuer HW-Test.

---

## Abhaengigkeiten (korrigiert)

| Block | Braucht vorher | Blockiert | Aufwand |
|-------|---------------|-----------|---------|
| V1.1 Email-Tracking | Nichts (EmailService existiert) | V6 CommunicationView (optional) | ~3-4h |
| V2.1 Diagnostic Schedule | Nichts (Scheduler + Service existieren) | V3.1 (sollte vorher laufen) | ~1h |
| V2.2 Report-Retention | V2.1 | Nichts | ~1h |
| V3.1 Plugin Schedule | Nichts (API + DB-Feld existieren) | V8 (AutoOps-Test) | ~2h |
| V3.2 Schedule-UI | V3.1 | Nichts | ~2h |
| V4.1 Timed Snooze | Nichts (Backend existiert) | Nichts | ~2h |
| V4.2 Suppress-Liste | V4.1 | Nichts | ~2h |
| V5.1 DB-Backup | Nichts | V8 (Datensicherheit) | ~4h |
| V5.3 Backup-UI | V5.1 | Nichts | ~3h |
| V6.1 QAB-Actions | Nichts (Store+Composable existieren) | Nichts | ~1h |
| V7.1-V7.2 Pruefung | Nichts | V8 (Stabilitaet) | ~2h |
| V8 Pre-Flight | V2.1, V3.1, V5.1, V7.1 | Hardware-Test 2 | ~4-6h |

---

## Git-Voraussetzungen

> **KRITISCH:** Vor Beginn jeglicher Arbeit muessen 3 untracked Migrationen committed werden:

| Datei | Phase | Status |
|-------|-------|--------|
| `alembic/versions/add_diagnostic_reports.py` | Phase 4D | Untracked |
| `alembic/versions/add_plugin_tables.py` | Phase 4C | Untracked |
| `alembic/versions/rename_notification_metadata_to_extra_data.py` | Fix | Untracked |

Plus zahlreiche weitere untracked und modifizierte Dateien aus Phase 4B-4D (siehe `git status` oben). Ein sauberer Commit/Branch-Stand ist Voraussetzung fuer die Roadmap-Ausfuehrung.

---

## Zusammenfassung fuer TM

| Block | Original-Schaetzung | Korrigiert | Grund |
|-------|-------------------|------------|-------|
| V1 Email | 8-10h | **6-8h** | Email-Service existiert vollstaendig, nur Tracking + UI fehlen |
| V2 Diagnostics | 6-8h | **3-4h** | 85% fertig! Nur Scheduler + Retention fehlen |
| V3 AutoOps | 6-8h | **3-5h** | REST-API + Frontend fertig! Nur Schedule-Verdrahtung fehlt |
| V4 Alerts | 4-6h | **4-6h** | Korrekt geschaetzt |
| V5 Backup | 8-10h | **6-8h** | Audit-Backup existiert, nur DB-Backup fehlt |
| V6 UI/UX | 6-8h | **4-6h** | QAB dynamisch, 7 Tabs existieren, kein CommunicationView noetig |
| V7 Haertung | 3-4h | **2-3h** | Resilience-Infrastruktur umfangreich, meist nur Verifizierung |
| V8 Pre-Flight | 4-6h | **4-6h** | Korrekt geschaetzt |
| **TOTAL** | **45-60h** | **~32-46h** | **~30% weniger durch existierenden Code** |
