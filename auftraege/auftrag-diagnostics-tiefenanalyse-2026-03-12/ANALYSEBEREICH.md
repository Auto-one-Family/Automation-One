# Exakter Analysebereich — Diagnostics Tiefenanalyse

**Quelle:** `auftrag-diagnostics-tiefenanalyse-2026-03-12.md`  
**Erstellt:** 2026-03-12  
**Typ:** Reine Analyse (kein Code ändern)  
**Ausgabe:** `auftraege/auftrag-diagnostics-tiefenanalyse-2026-03-12/DIAGNOSTICS-TIEFENANALYSE-BERICHT-2026-03-12.md`

---

## Übersicht — 7 Blöcke, 22 Analysepunkte

| Block | Abschnitte | Dateien (ca.) |
|-------|------------|---------------|
| A Backend | A.1–A.5 | 6 |
| B Frontend | B.1–B.6 | 8 |
| C Logic Engine | C.1–C.3 | 4 |
| D MQTT & Firmware | D.1–D.2 | 3 |
| E Grafana & Monitoring | E.1–E.2 | 1 |
| F Trigger-Matrix | F.1–F.2 | — |
| G Bekannte Lücken | 1 | — |

---

## Rahmenbedingungen

| Aspekt | Wert |
|--------|------|
| **Ziel-Repo** | auto-one (El Servador + El Frontend + El Trabajante) |
| **Regel** | NUR LESEN und DOKUMENTIEREN — NICHTS implementieren |
| **Priorität** | HOCH |
| **Aufwand** | ~6–10h |

---

## Block A: Backend (El Servador)

### A.1 REST-API Endpoints

| Analysepunkt | Datei(en) | Zu dokumentieren |
|--------------|-----------|------------------|
| Router-Definition | `El Servador/god_kaiser_server/src/api/v1/diagnostics.py` | Prefix, Tags, alle Route-Dekoratoren |
| Router-Registrierung | `El Servador/god_kaiser_server/src/api/v1/__init__.py`, `main.py` | Wo wird diagnostics_router eingehängt? |
| Endpoints | diagnostics.py | Pro Endpoint: Methode, Auth, Request-Body, Response-Schema, Ruft auf |

**Endpoints zu prüfen:**

| Endpoint | Methode | Auth? | Request-Body | Response-Schema | Ruft auf |
|----------|---------|-------|--------------|----------------|----------|
| /v1/diagnostics/run | POST | ? | — | ? | ? |
| /v1/diagnostics/run/{check_name} | POST | ? | — | ? | ? |
| /v1/diagnostics/history | GET | ? | — | ? | ? |
| /v1/diagnostics/history/{report_id} | GET | ? | — | ? | ? |
| /v1/diagnostics/export/{report_id} | POST | ? | — | ? | ? |
| /v1/diagnostics/checks | GET | ? | — | ? | ? |

**Query-Parameter:** z.B. `GET /history?limit=20` — alle Parameter dokumentieren.

---

### A.2 DiagnosticsService

| Analysepunkt | Datei | Zu dokumentieren |
|--------------|-------|------------------|
| Konstruktor | `El Servador/god_kaiser_server/src/services/diagnostics_service.py` | Alle Parameter: db, esp_service, mqtt_manager, notification_service, plugin_service, logic_engine |
| Instanziierung | `main.py`, `_build_diagnostics_service()` o.ä. | Wo wird DiagnosticsService erstellt? |
| plugin_service | — | Wird korrekt übergeben oder ist es `None`? (Bekannte Lücke) |
| Check-Registry | diagnostics_service.py | `self.checks` — vollständige Liste: Name → Methode |
| Pro Check | — | Welche externen Services/DB-Quellen werden genutzt? |

**10 Checks:** server, database, mqtt, esp_devices, sensors, actuators, monitoring, logic_engine, alerts, plugins

---

### A.3 Die 10 Checks — Detail-Implementierung

| Check | Methode | Zu dokumentieren |
|-------|---------|------------------|
| server | `_check_server` | Datenquellen, Schwellwerte, recommendations, metrics, Fehlerbehandlung |
| database | `_check_database` | Datenquellen, Schwellwerte, recommendations, metrics, Fehlerbehandlung |
| mqtt | `_check_mqtt` | Datenquellen, Schwellwerte, recommendations, metrics, Fehlerbehandlung |
| esp_devices | `_check_esp_devices` | Datenquellen, Schwellwerte, recommendations, metrics, Fehlerbehandlung |
| sensors | `_check_sensors` | Datenquellen, Schwellwerte, recommendations, metrics, Fehlerbehandlung |
| actuators | `_check_actuators` | Datenquellen, Schwellwerte, recommendations, metrics, Fehlerbehandlung |
| monitoring | `_check_monitoring` | Datenquellen, Schwellwerte, recommendations, metrics, Fehlerbehandlung |
| logic_engine | `_check_logic_engine` | Datenquellen, Schwellwerte, recommendations, metrics, Fehlerbehandlung |
| alerts | `_check_alerts` | Datenquellen, Schwellwerte, recommendations, metrics, Fehlerbehandlung |
| plugins | `_check_plugins` | Datenquellen, Schwellwerte, recommendations, metrics, Fehlerbehandlung |

**Pro Check:** Datenquellen, Schwellwerte (WARNING/CRITICAL), recommendations, metrics, Fehlerbehandlung (Exception → CheckResult status=ERROR?)

---

### A.4 Report-Persistenz, DB-Model, Migration

| Analysepunkt | Datei(en) | Zu dokumentieren |
|--------------|-----------|------------------|
| DB-Model | `El Servador/god_kaiser_server/src/db/models/diagnostic.py` (Tabelle: `diagnostic_reports`) | Alle Spalten |
| Migration | `El Servador/god_kaiser_server/alembic/versions/*diagnostic*` | Existiert? Status: committed/untracked? |
| Persistenz-Logik | diagnostics_service.py | Wo wird `_persist_report()` aufgerufen? Welche Felder werden gesetzt? |

**Spalten zu prüfen:** id, overall_status, started_at, finished_at, duration_seconds, checks (JSONB), summary, triggered_by, triggered_by_user, exported_at, export_path

---

### A.5 DiagnosticsReportGenerator — Markdown-Export

| Analysepunkt | Datei | Zu dokumentieren |
|--------------|------|------------------|
| generate_markdown | `El Servador/god_kaiser_server/src/services/diagnostics_report_generator.py` | Vollständige Ausgabe-Struktur |
| Status-Emojis | — | Welche Emojis für healthy/warning/critical/error? |
| API-Endpoint | POST /export/{id} | Ruft Generator auf? Rückgabe: Markdown-String oder File-Download? |

---

## Block B: Frontend (El Frontend)

### B.1 diagnostics.store.ts

| Analysepunkt | Datei | Zu dokumentieren |
|--------------|------|------------------|
| State | `El Frontend/src/shared/stores/diagnostics.store.ts` (oder `src/stores/`) | currentReport, history, isRunning, runningCheck, … |
| Actions | — | runDiagnostic(), runCheck(name), loadHistory(), exportReport(id) |
| runDiagnostic() | — | Welche API wird aufgerufen? POST /v1/diagnostics/run? Response-Handling? |
| Computed | — | lastReportStatus, lastReportTime, … |

---

### B.2 API-Client diagnostics.ts

| Analysepunkt | Datei | Zu dokumentieren |
|--------------|------|------------------|
| Alle Funktionen | `El Frontend/src/api/diagnostics.ts` | runDiagnostic(), runCheck(name), getHistory(), getReport(id), exportReport(id), listChecks() |
| Pro Funktion | — | HTTP-Methode, URL, Request/Response-Typ |

---

### B.3 DiagnoseTab.vue

| Analysepunkt | Datei | Zu dokumentieren |
|--------------|------|------------------|
| Buttons | `El Frontend/src/components/system-monitor/DiagnoseTab.vue` | "Volle Diagnose starten" — ruft diagnosticsStore.runDiagnostic() auf? |
| Check-Cards | — | Werden alle 10 Checks angezeigt? Expandierbar? |
| Einzel-Check-Start | — | Kann man einen einzelnen Check starten? Wie? |
| Lade-Status | — | isRunning, runningCheck — wie wird angezeigt? |

---

### B.4 ReportsTab.vue

| Analysepunkt | Datei | Zu dokumentieren |
|--------------|------|------------------|
| History-Tabelle | `El Frontend/src/components/system-monitor/ReportsTab.vue` | Spalten, Sortierung, Pagination? |
| Export-Button | — | Ruft exportReport(id) auf? Markdown-Download? |
| Detail-Ansicht | — | Einzelner Report anklickbar? |

---

### B.5 QuickActionBall / useQuickActions — Trigger "Diagnose starten"

| Analysepunkt | Datei(en) | Zu dokumentieren |
|--------------|-----------|------------------|
| global-diagnose | `El Frontend/src/composables/useQuickActions.ts`, `QuickActionBall.vue` | Action-ID, Label, Icon, Handler — ruft diagnosticsStore.runDiagnostic() auf? |
| ctx-full-diagnostic | — | Context-spezifisch (SystemMonitor)? Identischer Handler? |
| sys-run-diagnostic | — | Tab-spezifisch für Diagnostics-Tab? Existiert? |
| Redundanz | — | Sind global-diagnose und ctx-full-diagnostic identisch? (Roadmap: UI-Duplikat) |

---

### B.6 MonitorTabs.vue — Tab-Registrierung

| Analysepunkt | Datei | Zu dokumentieren |
|--------------|------|------------------|
| Tabs | `El Frontend/src/components/system-monitor/MonitorTabs.vue` | Liste aller Tabs (Ereignisse, Logs, DB, MQTT, Health, Diagnostics, Reports) |
| Diagnostics-Tab | — | Route/Key? Komponente? |
| Reports-Tab | — | Route/Key? Komponente? |

---

## Block C: Logic Engine — Condition & Action

### C.1 DiagnosticsConditionEvaluator — diagnostics_status

| Analysepunkt | Datei | Zu dokumentieren |
|--------------|------|------------------|
| Condition-Typ | `El Servador/god_kaiser_server/src/services/logic/conditions/diagnostics_evaluator.py` | `diagnostics_status` — wie wird in Rule-Definition referenziert? |
| Parameter | — | Welche Parameter? (z.B. status=critical, check_name=server) |
| Evaluate-Logik | — | Prüft ob letzter Report status X hat? Oder laufende Diagnose? |
| Registrierung | main.py, Default-Liste | In Default-Liste der Condition-Evaluatoren? (Bekannt: NICHT in Default-Liste) |

---

### C.2 DiagnosticsActionExecutor — run_diagnostic

| Analysepunkt | Datei | Zu dokumentieren |
|--------------|------|------------------|
| Action-Typ | `El Servador/god_kaiser_server/src/services/logic/actions/diagnostics_executor.py` | `run_diagnostic` — wie wird in Rule-Definition referenziert? |
| Parameter | — | check_name? (optional für Einzel-Check) — woher kommen Parameter? |
| Execute-Logik | — | Ruft diagnostics_service.run_full_diagnostic() oder run_single_check() auf? |
| triggered_by | — | Wird 'logic_rule' übergeben? |
| Registrierung | main.py, Default-Liste | In Default-Liste der Action-Executors? (Bekannt: NICHT in Default-Liste) |

---

### C.3 Logic Rule Builder — Frontend

| Analysepunkt | Datei(en) | Zu dokumentieren |
|--------------|-----------|------------------|
| Condition-Typ | `El Frontend/src/types/logic.ts`, Rule-Builder-Komponenten | Ist `diagnostics_status` im UI verfügbar? (Dropdown, Node-Typ) |
| Action-Typ | — | Ist `run_diagnostic` im UI verfügbar? |
| Default-Liste | — | Welche Condition/Action-Typen sind standardmäßig sichtbar? diagnostics_status, run_diagnostic dabei? |
| Lücke | — | Wenn nicht in Default-Liste — kann User trotzdem Rules erstellen? |

---

## Block D: MQTT & Firmware — ESP-Diagnostics

### D.1 MQTT-Topic: system/diagnostics

| Analysepunkt | Ort | Zu dokumentieren |
|--------------|-----|------------------|
| Topic | — | `kaiser/god/esp/{esp_id}/system/diagnostics` |
| Firmware | `El Trabajante` | Wo wird system/diagnostics publiziert? Payload: Heap, RSSI, Uptime, … |
| Intervall | — | Wie oft? (z.B. mit Heartbeat) |
| Server-Handler | `El Servador/god_kaiser_server/src/mqtt/handlers/diagnostics_handler.py` | Handler empfängt `kaiser/+/esp/+/system/diagnostics` (main.py Registrierung) |
| Verarbeitung | — | Wird es in DB gespeichert? Tabelle? Oder nur für Health-Check? |
| Diagnostics-Check | — | Nutzt _check_esp_devices die MQTT-Diagnostics-Daten? Oder nur /v1/health/esp? |

---

### D.2 Heartbeat vs. Diagnostics

| Analysepunkt | Zu dokumentieren |
|--------------|------------------|
| Heartbeat-Topic | `system/heartbeat` — was wird gesendet? |
| Diagnostics-Topic | `system/diagnostics` — Unterschied zu Heartbeat? |
| get_fleet_health() | Nutzt _check_esp_devices esp_service.get_fleet_health()? Was liefert das? |
| last_seen | Wird aus Heartbeat oder Diagnostics aktualisiert? |

---

## Block E: Grafana & Monitoring — Berührungspunkte

### E.1 Diagnostics ↔ Grafana-Alerts

| Analysepunkt | Zu dokumentieren |
|--------------|------------------|
| Alerts-Check | _check_alerts nutzt notification_service.get_isa_metrics() — woher kommen die Daten? |
| Grafana-Alerts | 47 Alerts — werden sie in Diagnostics-Check ausgewertet? Oder nur Notification-System? |
| Geplant | Roadmap A.5 "Diagnostics-Report mit Grafana-Alert-Status verknüpfen" — existiert bereits? |

---

### E.2 Monitoring-Check — Grafana, Prometheus, Loki

| Analysepunkt | Zu dokumentieren |
|--------------|------------------|
| _check_monitoring | Welche URLs werden geprüft? (GRAFANA_URL, PROMETHEUS_URL, LOKI_URL) |
| Health-Endpoints | /api/health (Grafana), /ready (Prometheus, Loki) — korrekt? |
| Alloy | Wird Alloy als Teil von Monitoring geprüft? (Roadmap: Alloy ersetzt Promtail) |

---

## Block F: Trigger-Matrix — Wann, wie, was, wo

### F.1 Vollständige Trigger-Übersicht

| # | Trigger | Ort | Auslöser | Ziel |
|---|--------|-----|----------|------|
| 1 | Button "Volle Diagnose" (DiagnoseTab) | DiagnoseTab.vue | Klick | diagnosticsStore.runDiagnostic() |
| 2 | QuickAction global-diagnose | QuickActionBall | FAB-Klick | diagnosticsStore.runDiagnostic() |
| 3 | QuickAction ctx-full-diagnostic | SystemMonitor | FAB-Klick | diagnosticsStore.runDiagnostic() |
| 4 | Logic Rule Action run_diagnostic | Logic Engine | Rule feuert | DiagnosticsActionExecutor |
| 5 | Scheduled (Cron) | — | — | **Existiert NICHT** (laut Roadmap) |
| 6 | API POST /run | REST | HTTP | DiagnosticsService.run_full_diagnostic() |

**Fehlende Trigger:** Scheduled Daily Diagnostic (Roadmap A.4) — verifizieren.

---

### F.2 Abhängigkeiten pro Check

| Check | DB | MQTT | ESP-Service | Notification | Plugin | HTTP (Grafana etc.) |
|-------|-----|------|-------------|--------------|--------|---------------------|
| server | ? | ? | ? | ? | ? | ? |
| database | ? | ? | ? | ? | ? | ? |
| mqtt | ? | ? | ? | ? | ? | ? |
| esp_devices | ? | ? | ? | ? | ? | ? |
| sensors | ? | ? | ? | ? | ? | ? |
| actuators | ? | ? | ? | ? | ? | ? |
| monitoring | ? | ? | ? | ? | ? | ? |
| logic_engine | ? | ? | ? | ? | ? | ? |
| alerts | ? | ? | ? | ? | ? | ? |
| plugins | ? | ? | ? | ? | ? | ? |

---

## Block G: Bekannte Lücken — Verifikation

| Lücke | Beschreibung | Verifizieren in |
|-------|--------------|-----------------|
| plugin_service=None | DiagnosticsService erhält plugin_service=None bei Init | A.2 |
| global-diagnose vs. ctx-full-diagnostic | Zwei Buttons, gleiche Aktion | B.5 |
| Kein Scheduler | Tägliche Diagnose nicht implementiert | main.py, scheduler |
| Diagnostics nicht in Default-Liste | Logic Engine: Condition/Action nicht standardmäßig | C.1, C.2 |
| Report-Retention | Kein Auto-Cleanup alter Reports | A.4 |

---

## Datei-Pfade (Suchmuster)

| Bereich | Pfad | Hinweis |
|---------|------|---------|
| Backend API | `El Servador/god_kaiser_server/src/api/v1/diagnostics.py` | Oder `god_kaiser_server/src/api/v1/diagnostics.py` |
| Backend Service | `El Servador/god_kaiser_server/src/services/diagnostics_service.py` | |
| Report Generator | `El Servador/god_kaiser_server/src/services/diagnostics_report_generator.py` | |
| DB Model | `El Servador/god_kaiser_server/src/db/models/diagnostic.py` | Oder `diagnostic_reports` |
| Migration | `El Servador/god_kaiser_server/alembic/versions/*diagnostic*` | |
| Logic Condition | `El Servador/god_kaiser_server/src/services/logic/conditions/diagnostics_evaluator.py` | |
| Logic Action | `El Servador/god_kaiser_server/src/services/logic/actions/diagnostics_executor.py` | |
| MQTT Handler | `El Servador/god_kaiser_server/src/mqtt/handlers/diagnostics_handler.py` | system/diagnostics |
| Frontend Store | `El Frontend/src/shared/stores/diagnostics.store.ts` | |
| Frontend API | `El Frontend/src/api/diagnostics.ts` | |
| DiagnoseTab | `El Frontend/src/components/system-monitor/DiagnoseTab.vue` | |
| ReportsTab | `El Frontend/src/components/system-monitor/ReportsTab.vue` | |
| QuickActions | `El Frontend/src/composables/useQuickActions.ts` | |
| QuickActionBall | `El Frontend/src/components/quick-action/QuickActionBall.vue` | |
| MonitorTabs | `El Frontend/src/components/system-monitor/MonitorTabs.vue` | |
| Logic Types | `El Frontend/src/types/logic.ts` | |
| Firmware | `El Trabajante/` | system/diagnostics publizieren |

---

## Hinweise für den Agenten

- **Pfade:** Wenn die Struktur im auto-one Repo abweicht, im Bericht die tatsächlichen Pfade dokumentieren.
- **Vermutungen:** Wenn etwas unklar ist, als "VERMUTUNG" kennzeichnen und Code-Stelle angeben.
- **Lücken:** Alles was nicht existiert oder fehlt, explizit als "FEHLT" oder "LÜCKE" markieren.
- **Nicht implementieren:** Dieser Auftrag ist ausschließlich Analyse. Kein Code ändern.

---

## Bezugsdokumente (Life-Repo)

| Dokument | Inhalt |
|----------|--------|
| `ROADMAP-SYSTEM-AUFRÄUMUNG-KONSOLIDIERUNG-2026-03-12.md` | Phase A: Diagnostics zuerst, 10 Checks, bekannte Lücken |
| `auftrag-step8-phase4d-diagnostics-hub.md` | Phase 4D Implementierungs-Spezifikation |
| `roadmap-verification-hardware-test.md` | V2 Diagnostics Ist-Zustand (verifiziert) |
| `LOGIC_ENGINE_VOLLANALYSE_UND_MONITOR_INTEGRATION_BERICHT.md` | Logic Engine Integration (run_diagnostic, diagnostics_status) |
