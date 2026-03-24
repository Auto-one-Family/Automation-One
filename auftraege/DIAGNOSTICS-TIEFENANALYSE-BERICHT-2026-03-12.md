# Diagnostics — Vollständige Tiefenanalyse

**Erstellt:** 2026-03-12  
**Quelle:** `auftraege/auftrag-diagnostics-tiefenanalyse-2026-03-12/`  
**Typ:** Reine Analyse (kein Code geändert)  
**Ausgabe:** `auftraege/DIAGNOSTICS-TIEFENANALYSE-BERICHT-2026-03-12.md`

---

## Übersicht

| Block | Status | Abschnitte |
|-------|--------|------------|
| A Backend | ✅ | A.1–A.5 |
| B Frontend | ✅ | B.1–B.6 |
| C Logic Engine | ✅ | C.1–C.3 |
| D MQTT & Firmware | ✅ | D.1–D.2 |
| E Grafana & Monitoring | ✅ | E.1–E.2 |
| F Trigger-Matrix | ✅ | F.1–F.2 |
| G Bekannte Lücken | ✅ | Verifikation |

---

## A.1 REST-API Diagnostics

**Datei:** `El Servador/god_kaiser_server/src/api/v1/diagnostics.py`  
**Router-Prefix:** `/v1/diagnostics`  
**Tags:** `diagnostics`

**Registrierung:** `El Servador/god_kaiser_server/src/api/v1/__init__.py` Zeile 34, 74 — `include_router(diagnostics_router)`.  
**API-Base:** `main.py` Zeile 1097–1099: `app.include_router(api_v1_router, prefix="/api")` → Vollpfad: `/api/v1/diagnostics/...`

| Endpoint | Methode | Auth | Body | Response |
|----------|---------|------|------|----------|
| `/run` | POST | JWT (ActiveUser) | — | DiagnosticReportResponse |
| `/run/{check_name}` | POST | JWT | — | CheckResultResponse |
| `/history` | GET | JWT | — | list[ReportHistoryItem] |
| `/history/{report_id}` | GET | JWT | — | DiagnosticReportResponse |
| `/export/{report_id}` | POST | JWT | — | ExportResponse |
| `/checks` | GET | JWT | — | list[AvailableCheck] |

**Query-Parameter:**
- `GET /history?limit=20&offset=0` — `limit` (1–100, default 20), `offset` (≥0)

**Ruft auf:**
- `run_full_diagnostic` → `_build_diagnostics_service(db)` → `service.run_full_diagnostic(triggered_by="manual", user_id=user.id)`
- `run_single_check` → `service.run_single_check(check_name)`
- `get_diagnostic_history` → `service.get_history(limit, offset)`
- `get_diagnostic_report` → `service.get_report_by_id(report_id)`
- `export_report` → `service.get_report_by_id()` + `generate_markdown()` → `ExportResponse(markdown=..., report_id=...)`
- `list_available_checks` → statische Liste `_CHECK_DISPLAY_NAMES`

**Lücken:** Keine fehlenden Endpoints laut Spezifikation.

---

## A.2 DiagnosticsService

**Datei:** `El Servador/god_kaiser_server/src/services/diagnostics_service.py`  
**Instanziierung:** Pro Request in `diagnostics.py` Zeile 96–104 via `_build_diagnostics_service(db)`.

### Konstruktor-Parameter

| Param | Typ | Übergeben? | Quelle |
|-------|-----|------------|--------|
| session | AsyncSession | ja | db (DBSession) |
| mqtt_manager | — | nein (Default None) | API übergibt nicht |
| plugin_service | PluginService | ja | _build_diagnostics_service() erstellt PluginService |

**Hinweis:** `_build_diagnostics_service()` erstellt `PluginRegistry`, `PluginService` und übergibt `DiagnosticsService(session=db, plugin_service=plugin_service)`. `mqtt_manager` wird nicht übergeben (bleibt None).

### Check-Registry (10 Checks)

| Name | Methode | Nutzt |
|------|---------|-------|
| server | _check_server | psutil, uptime (_server_start_time) |
| database | _check_database | db.execute, information_schema, pg_stat_activity |
| mqtt | _check_mqtt | MQTTClient.get_instance().is_connected(), ESPDevice (DB) |
| esp_devices | _check_esp_devices | ESPDevice (DB) |
| sensors | _check_sensors | SensorConfig (DB) |
| actuators | _check_actuators | ActuatorConfig (DB) |
| monitoring | _check_monitoring | httpx → Grafana, Prometheus, Loki |
| logic_engine | _check_logic_engine | CrossESPLogic, LogicExecutionHistory (DB) |
| alerts | _check_alerts | NotificationRepository, Notification (DB) |
| plugins | _check_plugins | plugin_service.get_all_plugins() |

### Lücken

- **mqtt_manager=None:** API übergibt nicht. `_check_mqtt` nutzt `MQTTClient.get_instance()` direkt → kein Problem.
- **plugin_service:** Wird von API korrekt übergeben. **Logic-Rule-Executor:** `DiagnosticsActionExecutor` erstellt `DiagnosticsService(session=session)` OHNE plugin_service → `_check_plugins` liefert WARNING bei Rule-getriggerter Diagnose.

---

## A.3 Die 10 Checks — Detail-Implementierung

### A.3.1 _check_server

**Datenquellen:** psutil (cpu_percent, virtual_memory), `_server_start_time` (core.metrics)  
**Schwellwerte:**
- WARNING: memory > 75%, cpu > 80%
- CRITICAL: memory > 90%  
**metrics:** cpu_percent, memory_percent, uptime_seconds  
**recommendations:** Bedingungen und Texte (siehe Code)  
**Fehlerbehandlung:** ImportError → CheckResult status=WARNING; Exception in run_full_diagnostic → catch → CheckResult status=ERROR

### A.3.2 _check_database

**Datenquellen:** information_schema.tables, pg_database_size, pg_stat_activity, notifications LEFT JOIN user_accounts  
**Schwellwerte:**
- WARNING: orphan_count > 0, active_conns > 20  
**metrics:** tables, size, active_connections, orphans  
**Fehlerbehandlung:** Exception → CheckResult status=ERROR

### A.3.3 _check_mqtt

**Datenquellen:** MQTTClient.get_instance().is_connected(), ESPDevice (last_seen < 5 min)  
**Schwellwerte:**
- CRITICAL: nicht verbunden
- WARNING: stale_devices > 0 (Devices mit last_seen > 5 Min)  
**metrics:** connected, stale_devices  
**Fehlerbehandlung:** Exception → connected=False

### A.3.4 _check_esp_devices

**Datenquellen:** ESPDevice (DB) — status, count  
**Schwellwerte:**
- WARNING: offline > 0
- CRITICAL: error_count > 0  
**metrics:** total, online, offline, error  
**Hinweis:** Nutzt NICHT system/diagnostics, nur ESPDevice (status, last_seen). `last_seen` kommt aus Heartbeat.

### A.3.5 _check_sensors

**Datenquellen:** SensorConfig (DB)  
**Schwellwerte:**
- WARNING: total_sensors > 0 und with_alerts == 0  
**metrics:** total, with_alerts  

### A.3.6 _check_actuators

**Datenquellen:** ActuatorConfig (DB)  
**Schwellwerte:** Keine (immer HEALTHY)  
**metrics:** total  

### A.3.7 _check_monitoring

**Datenquellen:** HTTP GET zu Grafana, Prometheus, Loki  
**URLs:** grafana=…/api/health, prometheus=…/-/ready, loki=…/ready  
**Schwellwerte:**
- WARNING: mindestens ein Service nicht "up"  
**metrics:** grafana, prometheus, loki (up/down/unreachable)  
**Alloy:** Wird NICHT geprüft.

### A.3.8 _check_logic_engine

**Datenquellen:** CrossESPLogic, LogicExecutionHistory (DB)  
**Schwellwerte:**
- WARNING: error_rate > 10% (24h)  
**metrics:** active_rules, executions_24h, errors_24h, error_rate  

### A.3.9 _check_alerts

**Datenquellen:** NotificationRepository.get_alert_stats(), get_active_counts_by_severity(), Notification (DB)  
**Schwellwerte:**
- WARNING: alerts_per_hour > 6 (ISA-18.2), standing_alerts > 5  
**metrics:** alerts_per_hour, standing_alerts, active, severity_counts, mtta_seconds, mttr_seconds  
**Hinweis:** Nutzt interne Notifications-Tabelle, NICHT Grafana-Alerts.

### A.3.10 _check_plugins

**Datenquellen:** plugin_service.get_all_plugins()  
**Schwellwerte:**
- WARNING: plugin_service=None oder registered != total  
**metrics:** total, enabled, registered  
**Fehlerbehandlung:** plugin_service=None → WARNING; Exception → ERROR  

---

## A.4 Report-Persistenz

**Model:** `El Servador/god_kaiser_server/src/db/models/diagnostic.py`  
**Tabelle:** diagnostic_reports  

**Spalten:**

| Spalte | Typ | Nullable |
|--------|-----|----------|
| id | UUID | PK |
| overall_status | String(20) | NOT NULL |
| started_at | DateTime(timezone=True) | NOT NULL |
| finished_at | DateTime(timezone=True) | NOT NULL |
| duration_seconds | Float | nullable |
| checks | JSON | nullable (nach migration) |
| summary | Text | nullable |
| triggered_by | String(50) | NOT NULL, default "manual" |
| triggered_by_user | Integer | FK user_accounts, nullable |
| exported_at | DateTime(timezone=True) | nullable |
| export_path | Text | nullable |

**Migrationen:**
- `add_diagnostic_reports.py` — erstellt Tabelle (checks: NOT NULL)
- `make_diagnostic_checks_nullable.py` — checks nullable (für Report-Retention)

**Persistenz:** `run_full_diagnostic()` ruft nach Zeile 141 `_persist_report(report, user_id)` auf.  
**Report-Retention:** `cleanup_old_reports(max_age_days)` setzt `checks=NULL` für alte Reports (V2.2). Wird vom Daily-Scheduler aufgerufen.

---

## A.5 Report-Generator

**Datei:** `El Servador/god_kaiser_server/src/services/diagnostics_report_generator.py`  
**Methode:** `generate_markdown(report: DiagnosticReportData) → str`

**Struktur:**
1. Überschrift, Overall Status, Generated, Duration, Triggered by, Report ID
2. Check Overview (Tabelle)
3. Summary (Status-Counts)
4. Detailed Results (pro Check)
5. Recommendations
6. Next Steps
7. Footer

**Emojis:** healthy=✅, warning=⚠️, critical=❌, error=🚨 (rotating light)  

**API:** `POST /export/{report_id}` → `ExportResponse(markdown=..., report_id=...)` — JSON mit Markdown-String, kein File-Download. Frontend erstellt Blob und Download.

---

## B.1 diagnostics.store.ts

**Datei:** `El Frontend/src/shared/stores/diagnostics.store.ts`

**State:** currentReport, history, availableChecks, isRunning, runningCheck, isLoadingHistory, error  

**Actions:** runDiagnostic(), runCheck(name), loadHistory(), loadReport(id), exportReport(id), loadAvailableChecks()  

**runDiagnostic():** Ruft `runFullDiagnostic()` (API POST /diagnostics/run), setzt currentReport, setzt error bei Fehler. Kein Toast direkt im Store — DiagnoseTab ruft showSuccess/showError.  

**Computed:** overallStatus, checksByName, statusCounts, hasProblems, lastRunAge  

---

## B.2 diagnostics API-Client

**Datei:** `El Frontend/src/api/diagnostics.ts`  
**Base URL:** `/api/v1` (aus api/index.ts)

| Funktion | HTTP | URL | Response |
|----------|------|-----|----------|
| runFullDiagnostic | POST | /diagnostics/run | DiagnosticReport |
| runSingleCheck | POST | /diagnostics/run/{checkName} | CheckResult |
| getDiagnosticHistory | GET | /diagnostics/history?limit=&offset= | ReportHistoryItem[] |
| getDiagnosticReport | GET | /diagnostics/history/{reportId} | DiagnosticReport |
| exportReportAsMarkdown | POST | /diagnostics/export/{reportId} | ExportResponse |
| listAvailableChecks | GET | /diagnostics/checks | AvailableCheck[] |

---

## B.3 DiagnoseTab.vue

**Datei:** `El Frontend/src/components/system-monitor/DiagnoseTab.vue`

**Buttons:** "Volle Diagnose starten" → `runFullDiagnostic()` → `store.runDiagnostic()`  

**Check-Cards:** 10 Cards (aus store.availableChecks), expandierbar per ChevronUp/Down. Pro Card: Icon, Name, Status, Message, Einzel-Check-Button (RefreshCw), Expand-Button.  

**Einzel-Check:** Ja — RefreshCw-Button pro Card ruft `store.runCheck(check.name)`  

**Lade-Status:** Spinner bei `store.isRunning` (Header), pro Card Spinner bei `store.runningCheck === check.name`  

---

## B.4 ReportsTab.vue

**Datei:** `El Frontend/src/components/system-monitor/ReportsTab.vue`

**History:** Tabelle mit Spalten Datum, Status, Dauer, Ausgelöst durch, Aktionen. Sortierung nach started_at DESC (vom API). Keine Pagination im UI (limit=20).  

**Export:** Button "Als Markdown herunterladen" → `store.exportReport(id)` → Blob-Download als `diagnostic-report-{id}.md`  

**Detail:** Ja — Klick auf Zeile expandiert, lädt `store.loadReport(id)` und zeigt Check-Pills + Summary  

---

## B.5 QuickActionBall — Diagnose-Trigger

**Dateien:** `useQuickActions.ts`, `QuickActionBall.vue` (nutzt Store)

| Action-ID | Context | Label | Handler | Gleich wie |
|-----------|---------|-------|---------|------------|
| global-diagnose | global | Diagnose starten | diagnosticsStore.runDiagnostic() | — |
| ctx-full-diagnostic | system-monitor | Volle Diagnose | diagnosticsStore.runDiagnostic() | global-diagnose |
| sys-run-diagnostic | — | — | **Existiert NICHT** | — |

**Redundanz:** global-diagnose und ctx-full-diagnostic sind identisch (gleicher Handler). global-diagnose erscheint überall, ctx-full-diagnostic nur auf /system-monitor.  

**Sichtbarkeit:** global = überall (QuickActionBall), ctx = nur wenn route.path.startsWith('/system-monitor').

---

## B.6 MonitorTabs

**Datei:** `El Frontend/src/components/system-monitor/MonitorTabs.vue`

**Tabs (9):** events, logs, database, mqtt, health, diagnostics, reports, hierarchy  

**Diagnostics:** Key=diagnostics, Label="Diagnose", Icon=Stethoscope  
**Reports:** Key=reports, Label="Reports", Icon=ClipboardList  

Komponenten-Zuordnung erfolgt über MonitorView/Eltern-Komponente (nicht in MonitorTabs.vue).

---

## C.1 DiagnosticsConditionEvaluator

**Datei:** `El Servador/god_kaiser_server/src/services/logic/conditions/diagnostics_evaluator.py`  
**Condition-Typ:** diagnostics_status  

**Parameter:** check_name, expected_status, operator (==, !=)  

**Logik:** Liest letzten DiagnosticReport aus DB, sucht Check mit check_name, vergleicht status mit expected_status.  

**Registrierung:** main.py Zeile 634–655, in condition_evaluators (Default-Liste). **JA, in Default-Liste.**  

---

## C.2 DiagnosticsActionExecutor

**Datei:** `El Servador/god_kaiser_server/src/services/logic/actions/diagnostics_executor.py`  
**Action-Typ:** run_diagnostic  

**Parameter:** check_name (optional) — omit für Full Diagnostic  

**Logik:** check_name gesetzt → run_single_check(); sonst → run_full_diagnostic(triggered_by="logic_rule").  

**triggered_by:** "logic_rule" wird übergeben.  

**Registrierung:** main.py Zeile 672–687, in action_executors. **JA, in Default-Liste.**  

**Lücke:** DiagnosticsService wird ohne plugin_service erstellt → _check_plugins liefert WARNING.

---

## C.3 Logic Rule Builder

**diagnostics_status:** Im UI verfügbar — RuleNodePalette.vue, RuleFlowEditor.vue (Node-Typ, Template, Farbe).  

**run_diagnostic:** Im UI verfügbar — RuleNodePalette.vue, RuleFlowEditor.vue.  

**Default-Liste:** Beide in RuleNodePalette unter "Bedingungen" bzw. "Aktionen".  

**Lücke:** Keine — User kann Rules mit diagnostics_status und run_diagnostic erstellen.

---

## D.1 MQTT system/diagnostics

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/diagnostics` (z.B. kaiser/god/esp/ESP_12AB34CD/system/diagnostics)  

**Firmware:** `El Trabajante/src/error_handling/health_monitor.cpp` — `publishSnapshot()` → `buildDiagnosticsTopic()` → `getSnapshotJSON()`.  

**Payload:** ts, esp_id, heap_free, heap_min_free, heap_fragmentation, uptime_seconds, error_count, wifi_connected, wifi_rssi, mqtt_connected, sensor_count, actuator_count, system_state, boot_reason, mqtt_cb_state, mqtt_cb_failures, wdt_mode, wdt_timeouts_24h, wdt_timeout_pending  

**Intervall:** 60 Sekunden (publish_interval_ms_=60000). Change-Detection: publish bei Änderung oder bei Intervall.  

**Server-Handler:** `El Servador/god_kaiser_server/src/mqtt/handlers/diagnostics_handler.py` — `handle_diagnostics()`. Registriert: main.py Zeile 287–292 — `kaiser/+/esp/+/system/diagnostics` → `diagnostics_handler.handle_diagnostics`.  

**Verarbeitung:** ESPDevice.device_metadata["diagnostics"] wird aktualisiert; WebSocket-Broadcast `esp_diagnostics`. Keine separate Tabelle.  

**Diagnostics-Check:** _check_esp_devices nutzt **nicht** system/diagnostics. Nutzt ESPDevice (status, last_seen). last_seen kommt aus Heartbeat. device_metadata/diagnostics wird nur für Frontend/ESP-Detail genutzt.

---

## D.2 Heartbeat vs. Diagnostics

**Heartbeat-Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat`  
**Payload:** esp_id, zone_id, master_zone_id, zone_assigned, ts, uptime, heap_free, wifi_rssi, sensor_count, actuator_count  

**Diagnostics-Topic:** system/diagnostics — detaillierter: heap_min_free, heap_fragmentation, uptime_seconds, error_count, wifi_connected, mqtt_connected, system_state, boot_reason, mqtt_cb_state, mqtt_cb_failures, wdt_*, etc.  

**Unterschied:** Heartbeat = Lebenszeichen + Basis-Metriken, Discovery; Diagnostics = detaillierte System-Snapshots.  

**get_fleet_health():** _check_esp_devices nutzt **nicht** get_fleet_health(). Nutzt direkt ESPDevice-Status (DB).  

**last_seen:** Quelle = **Heartbeat** (heartbeat_handler aktualisiert esp_devices.last_seen). Diagnostics aktualisiert nur device_metadata.diagnostics.

---

## E.1 Grafana-Berührungspunkte

**check_alerts:** Datenquelle = NotificationRepository (DB-Tabelle notifications). Kein Grafana-API-Call.  

**Grafana-Alerts (47):** Werden **nicht** im Diagnostics-Check ausgewertet. Nur internes Notification-System (ISA-18.2).  

**Verknüpfung:** **FEHLT** — Roadmap A.5 "Diagnostics-Report mit Grafana-Alert-Status verknüpfen" ist nicht implementiert.

---

## E.2 Monitoring-Check

**URLs:** grafana=…/api/health, prometheus=…/-/ready, loki=…/ready  

**Alloy:** Wird **nicht** geprüft.  

**Lücken:** Alloy (Roadmap: ersetzt Promtail) fehlt in Monitoring-Check.

---

## F.1 Trigger-Matrix

| # | Trigger | Ort | Auslöser | Ziel |
|---|---------|-----|----------|------|
| 1 | Button "Volle Diagnose" | DiagnoseTab.vue | Klick | diagnosticsStore.runDiagnostic() |
| 2 | QuickAction global-diagnose | QuickActionBall | FAB-Klick | diagnosticsStore.runDiagnostic() |
| 3 | QuickAction ctx-full-diagnostic | SystemMonitor | FAB-Klick | diagnosticsStore.runDiagnostic() |
| 4 | Logic Rule Action run_diagnostic | Logic Engine | Rule feuert | DiagnosticsActionExecutor |
| 5 | Scheduled (Cron) | main.py | _central_scheduler | daily_diagnostic (wenn enabled) |
| 6 | API POST /run | REST | HTTP | DiagnosticsService.run_full_diagnostic() |

**Fehlende Trigger:** Keine. Scheduled Daily Diagnostic **existiert** (settings.maintenance.diagnostic_schedule_enabled, default=True, Uhrzeit 04:00 UTC).

---

## F.2 Check-Abhängigkeiten

| Check | DB | MQTT | ESP-Service | Notification | Plugin | HTTP |
|-------|-----|------|-------------|--------------|--------|------|
| server | — | — | — | — | — | — |
| database | ✓ | — | — | — | — | — |
| mqtt | ✓ | ✓ | — | — | — | — |
| esp_devices | ✓ | — | — | — | — | — |
| sensors | ✓ | — | — | — | — | — |
| actuators | ✓ | — | — | — | — | — |
| monitoring | — | — | — | — | — | ✓ |
| logic_engine | ✓ | — | — | — | — | — |
| alerts | ✓ | — | — | — | — | — |
| plugins | ✓ | — | — | — | — | — |

---

## G. Bekannte Lücken — Verifikation

| Lücke | Bestätigt? | Details |
|-------|------------|---------|
| plugin_service=None | **Teilweise** | API: plugin_service wird übergeben. **Logic-Executor:** DiagnosticsActionExecutor erstellt Service ohne plugin_service → _check_plugins = WARNING bei Rule-Trigger. |
| global-diagnose vs. ctx-full-diagnostic | **Ja** | Beide rufen identisch diagnosticsStore.runDiagnostic() auf. Redundanz. |
| Kein Scheduler | **Nein** | Daily Diagnostic Scheduler **existiert** (main.py 746–792). Default: enabled, 04:00 UTC. |
| Diagnostics nicht in Default-Liste | **Nein** | diagnostics_status und run_diagnostic **sind** in Logic Engine Default-Liste und im RuleNodePalette. |
| Report-Retention | **Nein** | cleanup_old_reports() existiert. Wird vom Daily-Scheduler aufgerufen.

---

## Zusammenfassung und Empfehlungen

### Priorität HOCH

1. **DiagnosticsActionExecutor:** plugin_service an DiagnosticsService übergeben, damit _check_plugins bei Rule-getriggerter Diagnose korrekt funktioniert.
2. **Grafana-Verknüpfung:** Roadmap A.5 — Diagnostics-Report mit Grafana-Alert-Status verknüpfen (aktuell fehlt).

### Priorität MITTEL

3. **QuickAction-Redundanz:** global-diagnose und ctx-full-diagnostic konsolidieren (einen entfernen oder kontextabhängig ausblenden).
4. **Alloy:** Monitoring-Check um Alloy erweitern, wenn Alloy Promtail ersetzt.

### Priorität NIEDRIG

5. **sys-run-diagnostic:** Tab-spezifische QuickAction für Diagnostics-Tab optional (aktuell nicht vorhanden, kein Muss).

---

*Bericht erstellt von Agent gemäß Analyseauftrag. Kein Code geändert.*
