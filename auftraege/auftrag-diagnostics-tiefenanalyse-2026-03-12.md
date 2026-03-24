# Auftrag: Diagnostics — Vollständige Tiefenanalyse

**Ziel-Repo:** auto-one (El Servador + El Frontend + El Trabajante)  
**Erstellt:** 2026-03-12  
**Erstellt von:** Automation-Experte (Life-Repo)  
**Typ:** Reine Analyse (kein Code ändern — nur Inventar + Bericht)  
**Priorität:** HOCH  
**Aufwand:** ~6–10h (je nach Tiefe)  
**Voraussetzung:** Keine — kann sofort ausgeführt werden  

---

## Kontext

Robin möchte die Diagnostics systematisch durchgehen. **Vor jeder Anpassung** muss exakt dokumentiert sein:

- **Alle Endpunkte** (REST, MQTT, WebSocket)
- **Alle Logiken** pro Check und pro Trigger
- **Wann, wie, was, wo** wird ausgelöst
- **Berührungspunkte** zu Firmware, Server, DB, Grafana, Frontend

Dieser Auftrag liefert die vollständige Bestandsaufnahme. Der Bericht muss so detailliert sein, dass ein nachfolgender Agent (oder Robin) ohne Code-Zugriff weiß, was wo existiert und was fehlt.

**Regel:** NUR LESEN und DOKUMENTIEREN. Es wird NICHTS implementiert.

---

## Bezugsdokumente (Life-Repo / auto-one)

| Dokument | Inhalt | Pfad in auto-one |
|----------|--------|------------------|
| `ROADMAP-SYSTEM-AUFRÄUMUNG-KONSOLIDIERUNG-2026-03-12.md` | Phase A: Diagnostics zuerst, 10 Checks | Life-Repo (extern) |
| `auftrag-step8-phase4d-diagnostics-hub.md` | Phase 4D Implementierungs-Spezifikation | Life-Repo (extern) |
| `roadmap-verification-hardware-test.md` | V2 Diagnostics Ist-Zustand (verifiziert) | `.claude/reports/current/roadmap-verification-hardware-test.md` |
| `LOGIC_ENGINE_VOLLANALYSE_UND_MONITOR_INTEGRATION_BERICHT.md` | Logic Engine Integration (run_diagnostic, diagnostics_status) | `.claude/reports/current/LOGIC_ENGINE_VOLLANALYSE_UND_MONITOR_INTEGRATION_BERICHT.md` |

---

## Block A: Backend (El Servador) — Endpoints, Service, Checks

### A.1 REST-API Endpoints — Vollständiges Inventar

**Datei:** `El Servador/god_kaiser_server/src/api/v1/diagnostics.py`

**Schritte:**

1. **Router-Definition lesen:** Prefix, Tags, alle Route-Dekoratoren
2. **Pro Endpoint dokumentieren:**

| Endpoint | Methode | Auth? | Request-Body | Response-Schema | Ruft auf |
|---------|---------|-------|--------------|-----------------|----------|
| /v1/diagnostics/run | POST | ? | — | ? | ? |
| /v1/diagnostics/run/{check_name} | POST | ? | — | ? | ? |
| /v1/diagnostics/history | GET | ? | — | ? | ? |
| /v1/diagnostics/history/{report_id} | GET | ? | — | ? | ? |
| /v1/diagnostics/export/{report_id} | POST | ? | — | ? | ? |
| /v1/diagnostics/checks | GET | ? | — | ? | ? |

3. **Router-Registrierung:** `El Servador/god_kaiser_server/src/api/v1/__init__.py` (Zeile 34, 74) — nicht in main.py. API-Base: `/api/v1/` (REST_ENDPOINTS.md)
4. **Query-Parameter:** z.B. `GET /history?limit=20` — alle Parameter dokumentieren

**Report-Format:**

```markdown
## A.1 REST-API Diagnostics

**Datei:** [exakter Pfad]
**Router-Prefix:** /v1/diagnostics

| Endpoint | Methode | Auth | Body | Response |
|----------|---------|------|------|----------|
| /run | POST | JWT | — | DiagnosticReport |
| … | … | … | … | … |

**Registrierung:** api/v1/__init__.py Zeile 34, 74 (nicht main.py)
**Lücken:** Fehlende Endpoints laut Spezifikation: …
```

---

### A.2 DiagnosticsService — Konstruktor, Dependencies, Check-Registry

**Datei:** `El Servador/god_kaiser_server/src/services/diagnostics_service.py`

**Schritte:**

1. **Konstruktor:** Welche Parameter werden übergeben? (session, mqtt_manager, plugin_service) — KEIN esp_service, notification_service, logic_engine
2. **Dependency-Injection:** `diagnostics.py` Zeile 96–104: `_build_diagnostics_service(db)` — erstellt PluginService + DiagnosticsService pro Request
3. **plugin_service:** Wird von API übergeben (PluginService mit PluginRegistry) — Lücke ggf. behoben; mqtt_manager=None (API übergibt ihn nicht; _check_mqtt nutzt MQTTClient.get_instance())
4. **Check-Registry:** `self.checks` — vollständige Liste: Name → Methode
5. **Pro Check-Methode:** Welche externen Services/DB-Quellen werden genutzt?

**Report-Format:**

```markdown
## A.2 DiagnosticsService

**Datei:** [exakter Pfad]
**Instanziierung:** [Datei:Zeile, Funktion]

### Konstruktor-Parameter
| Param | Typ | Übergeben? | Quelle |
|-------|-----|------------|--------|
| session | AsyncSession | ja | db (DBSession) |
| mqtt_manager | — | nein | API übergibt nicht (Default None) |
| plugin_service | PluginService | ja | _build_diagnostics_service() |

### Check-Registry (10 Checks)
| Name | Methode | Nutzt |
|------|---------|-------|
| server | _check_server | psutil, uptime |
| database | _check_database | db.execute, information_schema |
| mqtt | _check_mqtt | MQTTClient.get_instance().is_connected (nicht mqtt_manager) |
| … | … | … |

### Lücken
- mqtt_manager=None (API übergibt nicht) → _check_mqtt nutzt MQTTClient.get_instance() direkt, kein Problem
- … 
```

---

### A.3 Die 10 Checks — Detail-Implementierung

**Für jeden Check:** `_check_server`, `_check_database`, `_check_mqtt`, `_check_esp_devices`, `_check_sensors`, `_check_actuators`, `_check_monitoring`, `_check_logic_engine`, `_check_alerts`, `_check_plugins`

**Pro Check dokumentieren:**

1. **Datenquellen:** Welche DB-Tabellen, Services, APIs werden abgefragt?
2. **Schwellwerte:** Ab wann WARNING? Ab wann CRITICAL? (z.B. memory.percent > 90 → CRITICAL)
3. **recommendations:** Werden Empfehlungen generiert? Welche Bedingungen?
4. **metrics:** Welche Metriken werden im CheckResult zurückgegeben?
5. **Fehlerbehandlung:** Was passiert wenn ein Check eine Exception wirft? (Try/except → CheckResult status=ERROR?)

**Report-Format (pro Check):**

```markdown
## A.3.X _check_[name]

**Datenquellen:** DB-Tabellen X, Y; Service Z; URL W
**Schwellwerte:** 
- WARNING: memory > 75%, cpu > 80%, …
- CRITICAL: memory > 90%, mqtt disconnected, …
**metrics:** cpu_percent, memory_percent, uptime, …
**recommendations:** Bedingungen und Texte
**Fehlerbehandlung:** Exception → CheckResult status=ERROR, message=…
```

---

### A.4 Report-Persistenz, DB-Model, Migration

**Dateien:**
- `El Servador/god_kaiser_server/src/db/models/diagnostic.py` (Model: DiagnosticReport, Tabelle: diagnostic_reports)
- `El Servador/god_kaiser_server/alembic/versions/add_diagnostic_reports.py`, `make_diagnostic_checks_nullable.py`

**Schritte:**

1. **DB-Model:** Alle Spalten: id, overall_status, started_at, finished_at, duration_seconds, checks (JSONB), summary, triggered_by, triggered_by_user, exported_at, export_path
2. **Migration:** Existiert? Tracking-Status (committed/untracked)?
3. **Persistenz-Logik:** Wo wird `_persist_report()` aufgerufen? Welche Felder werden gesetzt?

**Report-Format:**

```markdown
## A.4 Report-Persistenz

**Model:** [Datei]
**Tabelle:** diagnostic_reports
**Spalten:** [vollständige Liste]
**Migration:** [Dateiname], Status: committed/untracked
**Persistenz:** run_full_diagnostic() ruft _persist_report() nach Zeile X
```

---

### A.5 DiagnosticsReportGenerator — Markdown-Export

**Datei:** `El Servador/god_kaiser_server/src/services/diagnostics_report_generator.py`

**Schritte:**

1. **generate_markdown(report):** Vollständige Ausgabe-Struktur dokumentieren
2. **Status-Emojis:** Welche Emojis für healthy/warning/critical/error?
3. **API-Endpoint:** POST /export/{id} — ruft Generator auf? Rückgabe: Markdown-String oder File-Download?

**Report-Format:**

```markdown
## A.5 Report-Generator

**Datei:** [Pfad]
**Methode:** generate_markdown(report) → str
**Struktur:** Überschrift, Status, Tabelle, Detail-Ergebnisse, Nächste Schritte
**Emojis:** healthy=✅, warning=⚠️, critical=❌, error=💥
**API:** POST /export/{id} → [Response-Typ]
```

---

## Block B: Frontend — Trigger, Store, UI

### B.1 diagnostics.store.ts — State, Actions, Computed

**Datei:** `El Frontend/src/shared/stores/diagnostics.store.ts`

**Schritte:**

1. **State:** currentReport, history, isRunning, runningCheck, …
2. **Actions:** runDiagnostic(), runCheck(name), loadHistory(), exportReport(id)
3. **runDiagnostic():** POST /api/v1/diagnostics/run (via api.post('/diagnostics/run')) — Response-Handling?
4. **Computed:** lastReportStatus, lastReportTime, …

**Report-Format:**

```markdown
## B.1 diagnostics.store.ts

**Datei:** [Pfad]
**State:** currentReport, history, isRunning, runningCheck, …
**Actions:** runDiagnostic(), runCheck(), loadHistory(), exportReport()
**runDiagnostic():** [API-Call, Error-Handling, Toast?]
**Computed:** …
```

---

### B.2 API-Client diagnostics.ts

**Datei:** `El Frontend/src/api/diagnostics.ts` (baseURL: /api/v1)

**Schritte:**

1. **Alle Funktionen:** runDiagnostic(), runCheck(name), getHistory(), getReport(id), exportReport(id), listChecks()
2. **Pro Funktion:** HTTP-Methode, URL, Request/Response-Typ

**Report-Format:**

```markdown
## B.2 diagnostics API-Client

| Funktion | HTTP | URL | Response |
|----------|------|-----|----------|
| runDiagnostic | POST | /diagnostics/run (→ /api/v1/diagnostics/run) | DiagnosticReport |
| … | … | … | … |
```

---

### B.3 DiagnoseTab.vue — UI, Buttons, Check-Cards

**Datei:** `El Frontend/src/components/system-monitor/DiagnoseTab.vue`

**Schritte:**

1. **Buttons:** "Volle Diagnose starten" — ruft diagnosticsStore.runDiagnostic() auf?
2. **Check-Cards:** Werden alle 10 Checks angezeigt? Expandierbar?
3. **Einzel-Check-Start:** Kann man einen einzelnen Check starten? Wie?
4. **Lade-Status:** isRunning, runningCheck — wie wird angezeigt?

**Report-Format:**

```markdown
## B.3 DiagnoseTab.vue

**Buttons:** [Liste mit Handler]
**Check-Cards:** 10 Cards, Expand für Details
**Einzel-Check:** [ja/nein], [wie]
**Lade-Status:** …
```

---

### B.4 ReportsTab.vue — History, Export

**Datei:** `El Frontend/src/components/system-monitor/ReportsTab.vue`

**Schritte:**

1. **History-Tabelle:** Spalten, Sortierung, Pagination?
2. **Export-Button:** Ruft exportReport(id) auf? Markdown-Download?
3. **Detail-Ansicht:** Einzelner Report anklickbar?

**Report-Format:**

```markdown
## B.4 ReportsTab.vue

**History:** Tabelle mit [Spalten], Sortierung nach started_at DESC
**Export:** Button [Label] → exportReport(id) → [Download-Modal?]
**Detail:** [ja/nein]
```

---

### B.5 QuickActionBall / useQuickActions — Trigger "Diagnose starten"

**Dateien:**
- `El Frontend/src/composables/useQuickActions.ts`
- `El Frontend/src/components/quick-action/QuickActionBall.vue`

**Schritte:**

1. **global-diagnose:** Action-ID, Label, Icon, Handler — ruft diagnosticsStore.runDiagnostic() auf?
2. **ctx-full-diagnostic:** Context-spezifisch (SystemMonitor)? Identischer Handler?
3. **Redundanz:** Sind global-diagnose und ctx-full-diagnostic identisch? (Roadmap: UI-Duplikat)
4. **sys-run-diagnostic:** Tab-spezifisch für Diagnostics-Tab? Existiert?

**Report-Format:**

```markdown
## B.5 QuickActionBall — Diagnose-Trigger

| Action-ID | Context | Label | Handler | Gleich wie |
|-----------|---------|-------|---------|------------|
| global-diagnose | global | Diagnose starten | diagnosticsStore.runDiagnostic() | — |
| ctx-full-diagnostic | /system-monitor | Volle Diagnose | diagnosticsStore.runDiagnostic() | global-diagnose |
| sys-run-diagnostic | diagnostics-Tab | ? | ? | ? |

**Redundanz:** global-diagnose und ctx-full-diagnostic identisch? (Empfehlung: einen entfernen)
**Sichtbarkeit:** Wo erscheint welche Action? (global = überall, ctx = nur SystemMonitor)
```

---

### B.6 MonitorTabs.vue — Tab-Registrierung

**Datei:** `El Frontend/src/components/system-monitor/MonitorTabs.vue`

**Schritte:**

1. **Tabs:** Liste aller Tabs (Ereignisse, Logs, DB, MQTT, Health, Diagnostics, Reports, Hierarchie)
2. **Diagnostics-Tab:** Route/Key? Komponente?
3. **Reports-Tab:** Route/Key? Komponente?

**Report-Format:**

```markdown
## B.6 MonitorTabs

**Tabs:** [8 Tabs]: events, logs, database, mqtt, health, diagnostics, reports, hierarchy
**Diagnostics:** Key=diagnostics, Component=DiagnoseTab.vue
**Reports:** Key=reports, Component=ReportsTab.vue
```

---

## Block C: Logic Engine — Condition & Action

### C.1 DiagnosticsConditionEvaluator — diagnostics_status

**Datei:** `El Servador/god_kaiser_server/src/services/logic/conditions/diagnostics_evaluator.py`

**Schritte:**

1. **Condition-Typ:** `diagnostics_status` — wie wird in Rule-Definition referenziert?
2. **Parameter:** Welche Parameter hat die Condition? (z.B. status=critical, check_name=server)
3. **Evaluate-Logik:** Prüft ob letzter Report status X hat? Oder laufende Diagnose?
4. **Registrierung:** In Default-Liste der Condition-Evaluatoren? (Frontend: RuleNodePalette hat diagnostics_status — Backend-Registrierung prüfen)

**Report-Format:**

```markdown
## C.1 DiagnosticsConditionEvaluator

**Datei:** [Pfad]
**Condition-Typ:** diagnostics_status
**Parameter:** status?, check_name?, …
**Logik:** [Prüft was genau]
**Registrierung:** main.py Zeile X, in Default-Liste? ja/nein
```

---

### C.2 DiagnosticsActionExecutor — run_diagnostic

**Datei:** `El Servador/god_kaiser_server/src/services/logic/actions/diagnostics_executor.py`

**Schritte:**

1. **Action-Typ:** `run_diagnostic` — wie wird in Rule-Definition referenziert?
2. **Parameter:** check_name? (optional für Einzel-Check) — woher kommen Parameter?
3. **Execute-Logik:** Ruft diagnostics_service.run_full_diagnostic() oder run_single_check() auf?
4. **triggered_by:** Wird 'logic_rule' übergeben?
5. **Registrierung:** In Default-Liste der Action-Executors? (Frontend: RuleNodePalette hat run_diagnostic — Backend-Registrierung prüfen)

**Report-Format:**

```markdown
## C.2 DiagnosticsActionExecutor

**Datei:** [Pfad]
**Action-Typ:** run_diagnostic
**Parameter:** check_name? (optional)
**Logik:** run_full_diagnostic(triggered_by='logic_rule') oder run_single_check(check_name)
**Registrierung:** main.py Zeile X, in Default-Liste? ja/nein
```

---

### C.3 Logic Rule Builder — Frontend

**Dateien:** `El Frontend/src/types/logic.ts`, `RuleNodePalette.vue`, `RuleFlowEditor.vue`

**Schritte:**

1. **Condition-Typ:** Ist `diagnostics_status` im UI verfügbar? (Dropdown, Node-Typ)
2. **Action-Typ:** Ist `run_diagnostic` im UI verfügbar?
3. **Default-Liste:** Welche Condition/Action-Typen sind standardmäßig sichtbar? diagnostics_status, run_diagnostic dabei?

**Report-Format:**

```markdown
## C.3 Logic Rule Builder

**diagnostics_status:** Im UI verfügbar? ja/nein
**run_diagnostic:** Im UI verfügbar? ja/nein
**Default-Liste:** [Liste der sichtbaren Typen]
**Hinweis:** diagnostics_status und run_diagnostic SIND in RuleNodePalette.vue (Zeile 122, 192) — im UI verfügbar
```

---

## Block D: MQTT & Firmware — ESP-Diagnostics

### D.1 MQTT-Topic: system/diagnostics

**Firmware:** ESP sendet `kaiser/god/esp/{esp_id}/system/diagnostics`

**Schritte:**

1. **Payload:** Was sendet die Firmware? (Heap, RSSI, Uptime, …)
2. **Datei:** `El Trabajante/src/error_handling/health_monitor.cpp` (HealthMonitor::publishSnapshot, Zeile 284)
3. **Intervall:** 60 Sekunden (publish_interval_ms_ = 60000, health_monitor.h Zeile 42)

**Server:**

4. **MQTT-Handler:** `El Servador/god_kaiser_server/src/mqtt/handlers/diagnostics_handler.py` (DiagnosticsHandler.handle_diagnostics)
5. **Verarbeitung:** Wird es in DB gespeichert? Tabelle? Oder nur für Health-Check?
6. **Diagnostics-Check:** Nutzt _check_esp_devices die MQTT-Diagnostics-Daten? Oder nur /v1/health/esp?

**Report-Format:**

```markdown
## D.1 MQTT system/diagnostics

**Topic:** kaiser/god/esp/{esp_id}/system/diagnostics
**Firmware:** [Datei:Zeile], Payload: { heap_free, rssi, uptime, … }
**Intervall:** [alle X Sekunden]
**Server-Handler:** [Datei:Zeile]
**Verarbeitung:** [DB-Speicherung? Tabelle?]
**Diagnostics-Check:** _check_esp_devices nutzt [health/esp | MQTT-Daten | beides]
```

---

### D.2 Heartbeat vs. Diagnostics

**Schritte:**

1. **Heartbeat:** Topic `system/heartbeat` — was wird gesendet? Unterschied zu diagnostics?
2. **esp_devices Check:** Nutzt _check_esp_devices esp_service.get_fleet_health()? Was liefert das?
3. **last_seen:** Wird aus Heartbeat oder Diagnostics aktualisiert?

**Report-Format:**

```markdown
## D.2 Heartbeat vs. Diagnostics

**Heartbeat-Topic:** system/heartbeat
**Diagnostics-Topic:** system/diagnostics
**Unterschied:** [Payload-Vergleich]
**get_fleet_health():** Nutzt [heartbeat, diagnostics, beide]
**last_seen:** Quelle: [heartbeat | diagnostics]
```

---

## Block E: Grafana & Monitoring — Berührungspunkte

### E.1 Diagnostics ↔ Grafana-Alerts

**Schritte:**

1. **Alerts-Check:** _check_alerts nutzt notification_service.get_isa_metrics() — woher kommen die Daten?
2. **Grafana-Alerts:** 47 Alerts — werden sie in Diagnostics-Check ausgewertet? Oder nur Notification-System?
3. **Geplant:** Roadmap A.5 "Diagnostics-Report mit Grafana-Alert-Status verknüpfen" — existiert bereits?

**Report-Format:**

```markdown
## E.1 Grafana-Berührungspunkte

**check_alerts:** Datenquelle: notification_service.get_isa_metrics()
**Grafana-Alerts:** 47 Alerts — [werden ausgewertet | nicht]
**Verknüpfung:** [existiert | geplant | fehlt]
```

---

### E.2 Monitoring-Check — Grafana, Prometheus, Loki

**Schritte:**

1. **_check_monitoring:** Welche URLs werden geprüft? (GRAFANA_URL, PROMETHEUS_URL, LOKI_URL)
2. **Health-Endpoints:** /api/health (Grafana), /ready (Prometheus, Loki) — korrekt?
3. **Alloy:** Wird Alloy als Teil von Monitoring geprüft? (Roadmap: Alloy ersetzt Promtail)

**Report-Format:**

```markdown
## E.2 Monitoring-Check

**URLs:** grafana=…/api/health, prometheus=…/ready, loki=…/ready
**Alloy:** [geprüft | nicht geprüft]
**Lücken:** …
```

---

## Block F: Trigger-Matrix — Wann, wie, was, wo

### F.1 Vollständige Trigger-Übersicht

**Erstelle eine Tabelle:**

| Trigger | Wo | Wie | Wann | Ruft auf |
|---------|-----|-----|------|----------|
| Button "Volle Diagnose" (DiagnoseTab) | DiagnoseTab.vue | Klick | User | diagnosticsStore.runDiagnostic() |
| QuickAction global-diagnose | QuickActionBall | FAB-Klick | User | diagnosticsStore.runDiagnostic() |
| QuickAction ctx-full-diagnostic | SystemMonitor | FAB-Klick | User | diagnosticsStore.runDiagnostic() |
| Logic Rule Action run_diagnostic | Logic Engine | Rule feuert | Bedingung erfüllt | DiagnosticsActionExecutor |
| Scheduled (Cron) | — | — | — | **Existiert NICHT** (laut Roadmap) |
| API POST /run | REST | HTTP | Extern | DiagnosticsService.run_full_diagnostic() |

**Report-Format:**

```markdown
## F.1 Trigger-Matrix

| # | Trigger | Ort | Auslöser | Ziel |
|---|---------|-----|----------|------|
| 1 | … | … | … | … | … |

**Fehlende Trigger:** Scheduled Daily Diagnostic (Roadmap A.4)
```

---

### F.2 Abhängigkeiten pro Check

**Für jeden der 10 Checks:** Welche externen Systeme müssen erreichbar sein?

| Check | DB | MQTT | ESP-Service | Notification | Plugin | HTTP (Grafana etc.) |
|-------|-----|------|-------------|--------------|--------|---------------------|
| server | — | — | — | — | — | — |
| database | ✓ | — | — | — | — | — |
| mqtt | ✓ | ✓ | — | — | — | — |
| … | … | … | … | … | … | … |

**Report-Format:**

```markdown
## F.2 Check-Abhängigkeiten

[Matrix wie oben]
```

---

## Block G: Bekannte Lücken — Verifikation

**Aus Roadmap und Verifikation-Dokumenten:**

| Lücke | Beschreibung | Verifizieren |
|-------|--------------|--------------|
| plugin_service=None | DiagnosticsService erhält plugin_service=None bei Init | A.2 prüfen — API übergibt jetzt PluginService (diagnostics.py _build_diagnostics_service) |
| global-diagnose vs. ctx-full-diagnostic | Zwei Buttons, gleiche Aktion | B.5 prüfen |
| Kein Scheduler | Tägliche Diagnose nicht implementiert | main.py, scheduler prüfen |
| Diagnostics nicht in Default-Liste | Logic Engine: Condition/Action nicht standardmäßig | C.1, C.2 prüfen |
| Report-Retention | Kein Auto-Cleanup alter Reports | A.4 prüfen |

**Report-Format:**

```markdown
## G. Bekannte Lücken — Verifikation

| Lücke | Bestätigt? | Details |
|-------|------------|---------|
| plugin_service=None | ja/nein | [Code-Stelle] |
| UI-Duplikat | ja/nein | [Code-Stelle] |
| … | … | … |
```

---

## Ausgabe

**Der Agent erstellt einen Bericht:**

`auftraege/auftrag-diagnostics-tiefenanalyse-2026-03-12/DIAGNOSTICS-TIEFENANALYSE-BERICHT-2026-03-12.md` (Konsistenz mit ANALYSEBEREICH.md im selben Ordner)

**Struktur:** Die Blöcke A–G als Abschnitte. Pro Abschnitt: Report-Format ausfüllen. Am Ende: Zusammenfassung mit priorisierten Empfehlungen für Phase A (Diagnostics durchgehen).

**Umfang:** So detailliert, dass Robin und nachfolgende Agenten ohne Code-Zugriff alle Endpunkte, Logiken und Trigger verstehen.

---

## Hinweise für den Agenten

- **Pfade:** Alle Pfade in diesem Auftrag wurden gegen die Codebase verifiziert (verify-plan). Bei Abweichungen im Bericht die tatsächlichen Pfade dokumentieren.
- **Vermutungen:** Wenn etwas unklar ist, als "VERMUTUNG" kennzeichnen und Code-Stelle angeben.
- **Lücken:** Alles was nicht existiert oder fehlt, explizit als "FEHLT" oder "LÜCKE" markieren.
- **Nicht implementieren:** Dieser Auftrag ist ausschließlich Analyse. Kein Code ändern.

---

*Erstellt von Automation-Experte (Life-Repo) für Agenten im auto-one Repo.*
