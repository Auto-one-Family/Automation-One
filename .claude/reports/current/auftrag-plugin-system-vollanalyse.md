# Auftrag: Plugin-System Vollanalyse & Optimierung

> **Erstellt:** 2026-03-03
> **Erstellt von:** Automation-Experte (Life-Repo)
> **Typ:** Analyse + gezielte Optimierung (Code-Aenderungen im auto-one Repo)
> **Ziel-Repo:** `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one`
> **Kontext:** Phase 4C Plugin-System ist integriert (STEP 7). Backend, Frontend, Logic Engine Integration existieren. Jetzt: Jede Funktion einzeln durchleuchten, Luecken schliessen, Frontend vervollstaendigen
> **Geschaetzter Aufwand:** ~12-18h (8 Analyse-Bloecke + gezielte Fixes)
> **Prioritaet:** HOCH — Plugin-System muss sauber funktionieren bevor Phase 4D startet

---

## Ausgangslage (IST-Zustand nach Automation-Experte Analyse)

### Backend — IMPLEMENTIERT

| Datei | Pfad | Status |
|-------|------|--------|
| `base_plugin.py` | `src/autoops/core/base_plugin.py` | FERTIG — AutoOpsPlugin, PluginCapability (8), PluginAction, PluginResult, PluginQuestion, `plugin_metadata` Dekorator, `PluginContext` Dataclass |
| `plugin_registry.py` | `src/autoops/core/plugin_registry.py` | FERTIG — Singleton, `discover_plugins()`, `get()`, `get_all()`, `get_by_capability()` |
| `context.py` | `src/autoops/core/context.py` | FERTIG — `AutoOpsContext`, `DeviceMode` (das CLI-Context-Objekt, NICHT PluginContext) |
| `agent.py` | `src/autoops/core/agent.py` | FERTIG — `AutoOpsAgent` Coordinator |
| `api_client.py` | `src/autoops/core/api_client.py` | FERTIG — `GodKaiserClient` (HTTP-Client fuer Plugin-Ausfuehrung) |
| `health_check.py` | `src/autoops/plugins/health_check.py` | FERTIG — `@plugin_metadata(category="monitoring")`, VALIDATE+MONITOR |
| `esp_configurator.py` | `src/autoops/plugins/esp_configurator.py` | FERTIG — `@plugin_metadata(category="automation")`, CONFIGURE+VALIDATE |
| `debug_fix.py` | `src/autoops/plugins/debug_fix.py` | FERTIG — `@plugin_metadata(category="diagnostics")`, DIAGNOSE+FIX+DOCUMENT |
| `system_cleanup.py` | `src/autoops/plugins/system_cleanup.py` | FERTIG — `@plugin_metadata(category="maintenance")`, CLEANUP |
| `plugin_service.py` | `src/services/plugin_service.py` | FERTIG — sync_registry_to_db, get_all, get_detail, execute, update_config, toggle, get_history, update_schedule, get_scheduled |
| `plugins.py` (API) | `src/api/v1/plugins.py` | FERTIG — 8 Endpoints: list, detail, execute, config, history, enable, disable, schedule |
| `plugin.py` (DB) | `src/db/models/plugin.py` | FERTIG — PluginConfig + PluginExecution Tabellen |
| Migration | `alembic/versions/add_plugin_tables.py` | FERTIG — plugin_configs + plugin_executions |
| `plugin_executor.py` | `src/services/logic/actions/plugin_executor.py` | FERTIG — PluginActionExecutor (supports 'plugin' + 'autoops_trigger') |
| `main.py` Startup | `src/main.py` Zeile 620-633 | FERTIG — sync_registry_to_db bei Server-Start | [Korrektur: Zeile 589-600 → 620-633]
| `main.py` Logic Engine | `src/main.py` Zeile 553-578 | FERTIG — PluginActionExecutor in LogicEngine registriert | [Korrektur: Zeile 521-529 → 553-578. PluginActionExecutor NICHT letzter, Diagnostics kommt danach]
| `reporter.py` | `src/autoops/core/reporter.py` | FERTIG — AutoOpsReporter (im Plan NICHT aufgefuehrt, aber vorhanden) |
| `profile_validator.py` | `src/autoops/core/profile_validator.py` | FERTIG — Hardware-Profil-Validator (im Plan NICHT aufgefuehrt, aber vorhanden) |

### Frontend — IMPLEMENTIERT

| Datei | Pfad | Status |
|-------|------|--------|
| `plugins.ts` | `src/api/plugins.ts` | FERTIG — 7 API-Funktionen (list, getDetail, execute, updateConfig, getHistory, enable, disable) |
| `plugins.store.ts` | `src/shared/stores/plugins.store.ts` | FERTIG — Pinia Setup Store mit State, Getters (pluginsByCategory, pluginOptions), Actions |
| `PluginsView.vue` | `src/views/PluginsView.vue` | FERTIG — Grid-Layout, Filter-Chips, Detail-SlideOver, ConfigDialog, History |
| `PluginCard.vue` | `src/components/plugins/PluginCard.vue` | FERTIG — Status-Dot, Kategorie, Capabilities, Last Execution, Execute/Toggle Buttons |
| `PluginConfigDialog.vue` | `src/components/plugins/PluginConfigDialog.vue` | FERTIG — Dynamisch aus config_schema (boolean, number, string) |
| `PluginExecutionHistory.vue` | `src/components/plugins/PluginExecutionHistory.vue` | FERTIG — Status-Badge, Trigger-Icon, Duration, Error-Message |
| Router | `src/router/index.ts` Zeile 200-203 | FERTIG — `/plugins`, requiresAdmin |
| RuleFlowEditor | `src/components/rules/RuleFlowEditor.vue` | FERTIG — Plugin-Node-Typ (Palette, Serialisierung, Rendering, Farbe #f59e0b) |
| RuleNodePalette | `src/components/rules/RuleNodePalette.vue` | FERTIG — "Plugin ausfuehren" als Action-Node mit Puzzle-Icon |

### BEKANNTE LUECKEN

| # | Luecke | Schwere | Beschreibung |
|---|--------|---------|-------------|
| L1 | **0 Tests** | KRITISCH | Keine einzige Test-Datei fuer das Plugin-System (Backend + Frontend) |
| L2 | **Select-Typ fehlt im ConfigDialog** | MITTEL | `PluginConfigDialog.vue` rendert `boolean`, `number`, `string` — aber NICHT `select` (Dropdown). ESPConfigurator hat `device_mode: {type: "select", options: ["mock","real","hybrid"]}` |
| L3 | **Label aus config_schema nicht genutzt** | MITTEL | Schema hat `label`-Feld, ConfigDialog zeigt stattdessen `description`. Wenn kein `description`, wird `key` gezeigt — `label` wird ignoriert |
| L4 | **PluginContext-Enrichment fehlt** | MITTEL | Block 4C.4.1 (ESP-Devices, aktive Alerts, User-Preferences in Context laden) ist NICHT implementiert — PluginContext wird nur mit trigger_source + user_id befuellt |
| L5 | **Schedule-Service fehlt** | NIEDRIG | API-Endpoint `/v1/plugins/{id}/schedule` existiert (DB-Update), aber kein `PluginScheduler` der die Cron-Jobs tatsaechlich registriert |
| L6 | **Sidebar-Navigation unklar** | ~~PRUEFEN~~ BESTÄTIGT | `/plugins` ist in Sidebar.vue Zeile 152-158 verlinkt mit Puzzle-Icon. [Korrektur: Kein offener Pruefpunkt mehr] |
| L7 | **SystemMonitorView-Integration** | ~~PRUEFEN~~ BESTÄTIGT FEHLEND | SystemMonitorView.vue existiert, referenziert aber KEINE Plugins. Separate PluginsView + Sidebar-Link vorhanden. [Korrektur: Kein Plugin-Tab in SystemMonitorView] |
| L8 | **Prometheus-Metriken** | ~~PRUEFEN~~ BESTÄTIGT FEHLEND | `src/core/metrics.py` enthält KEINE Plugin-Metriken. Kein Counter, kein Histogram. [Korrektur: Definitiv fehlend] |
| L9 | **Error-Code-System** | ~~PRUEFEN~~ TEILWEISE | AutoOps hat 5800-5849 (AUTOOPS_JOB_FAILED=5800, AUTOOPS_SCHEDULE_INVALID=5801). 5900-5999 ist RESERVED aber NICHT belegt. [Korrektur: Es gibt AutoOps-Codes, aber nur 2 generische – keine plugin-spezifischen wie execute_failed, config_invalid etc.] |
| L10 | **WS-Events** | ~~PRUEFEN~~ BESTÄTIGT FEHLEND | `plugin_service.py` hat KEINEN WebSocket-Broadcast. Keine Events fuer Start/Ende/Fehler. [Korrektur: Definitiv fehlend] |
| L11 | **RuleConfigPanel Plugin-Config** | ~~PRUEFEN~~ BESTÄTIGT FEHLEND | `RuleConfigPanel.vue` enthält KEIN einziges Wort "plugin". Kein Plugin-Dropdown, keine Config-Felder. [Korrektur: Definitiv fehlend – Plugin-Node kann erstellt aber NICHT konfiguriert werden] |
| L12 | **Status-Werte Diskrepanz** | ~~NIEDRIG~~ MITTEL | Backend sendet `running/success/error` (Zeile 184, 224, 231 in plugin_service.py). Frontend erwartet `success/failure/running/timeout` (plugins.ts:39). `error`→`failure` Mapping FEHLT, `cancelled` wird NICHT vom Backend gesendet, `timeout` wird NICHT vom Backend gesendet. [Korrektur: 2 Diskrepanzen: error≠failure, timeout existiert nur im Frontend] |

---

## Analyse-Bloecke (A-H)

### Block A: Backend-Kern — AutoOps Plugin Lifecycle (~1h)

**Ziel:** Jeden Plugin-Lifecycle-Schritt einzeln verifizieren: Instanziierung → Metadata → Registry → Preconditions → Plan → Execute → Rollback → Report

**Pruefpunkte:**

1. **A1 — Plugin-Discovery:** `PluginRegistry.discover_plugins()` — Welche Plugins werden gefunden? Werden alle 4 korrekt geladen? Gibt es `__init__.py` Imports in `autoops/plugins/`?
   - Datei: `src/autoops/core/plugin_registry.py`
   - Datei: `src/autoops/plugins/__init__.py`

2. **A2 — Metadata-Dekorator:** Fuer jedes der 4 Plugins pruefen:
   - `_display_name` korrekt gesetzt?
   - `_category` korrekt? (monitoring, automation, diagnostics, maintenance)
   - `_config_schema` vollstaendig? Alle Felder haben `type`, `default`, `label`?
   - `_description` stimmt mit `description` Property ueberein? (Duplikat-Risiko!)
   - Dateien: `health_check.py`, `esp_configurator.py`, `debug_fix.py`, `system_cleanup.py`

3. **A3 — Execute-Signatur:** Die execute()-Methode erwartet `(self, context: AutoOpsContext, client: GodKaiserClient)`. PluginService baut AutoOpsContext + Client. Pruefen:
   - Wird `autoops_context.extra` von den Plugins gelesen? Oder ignoriert?
   - Ist `autoops_context.server_url = "http://localhost:8000"` hardcoded? Konfigurierbar?
   - Authentifizierung: `client.authenticate()` — was passiert wenn der Server nicht laeuft?

4. **A4 — Rollback:** Werden die Rollback-Methoden der Plugins tatsaechlich aufgerufen bei Fehler? Pruefen in `plugin_service.py` Zeile 234-238: `plugin.rollback(autoops_context, client, [])` — leere Actions-Liste! Korrekt?

5. **A5 — PluginResult-Serialisierung:** `_serialize_plugin_result()` in `plugin_service.py` — Werden alle Felder korrekt serialisiert? Besonders `PluginAction.severity` (Enum → String), `data` (beliebige Dicts), `questions` (fehlt in Serialisierung?)

**Report:** Erstelle Tabelle pro Plugin: Name, Capabilities, config_schema-Felder, execute-Dauer (wenn moeglich Docker-Test), Rollback-Implementierung (ja/nein/leer)

---

### Block B: REST-API Volltest (~1.5h)

**Ziel:** Jeden der 8 Endpoints einzeln testen — Request/Response-Format, Error-Handling, Auth-Anforderungen, Pydantic-Validierung

**Pruefpunkte:**

1. **B1 — GET /v1/plugins** — Gibt die Liste korrekte PluginDTO-Objekte zurueck? Felder: plugin_id, display_name, description, category, is_enabled, config, config_schema, capabilities, last_execution (mit Execution-Details wenn vorhanden)

2. **B2 — GET /v1/plugins/{id}** — Plugin-Detail mit `recent_executions` (letzten 5). Felder `version` und `requires_auth` kommen direkt vom Plugin-Objekt. Pruefen: Was passiert bei unbekanntem plugin_id? (sollte 404 sein)

3. **B3 — POST /v1/plugins/{id}/execute** — Plugin ausfuehren:
   - Benoetigt ActiveUser Auth (kein Admin)
   - Body optional: `{ config_overrides: {} }`
   - Execution-Record wird in DB erstellt
   - Response enthaelt id, status, started_at, finished_at, result, error_message, duration_seconds
   - Pruefen: Was passiert bei deaktiviertem Plugin? (sollte 409 sein)
   - Pruefen: Was passiert wenn Plugin-Ausfuehrung >30s dauert? (Timeout?)
   - Pruefen: Wird `result.data` korrekt serialisiert oder fehlen Felder?

4. **B4 — PUT /v1/plugins/{id}/config** — Config-Update:
   - Benoetigt AdminUser Auth
   - Body: `{ config: { ... } }`
   - Pruefen: Wird die Config validiert gegen config_schema? Oder blindes Speichern?
   - Pruefen: Wird `updated_at` korrekt gesetzt?

5. **B5 — GET /v1/plugins/{id}/history** — Execution-History:
   - Limit-Parameter (1-200, Default 50)
   - Sortierung: neueste zuerst (started_at DESC)
   - Pruefen: Werden alle Felder korrekt serialisiert? (besonders `result` JSONB)

6. **B6 — POST /v1/plugins/{id}/enable + /disable** — Toggle:
   - Benoetigt AdminUser Auth
   - Response: `{ plugin_id, is_enabled }`
   - Pruefen: Verhindert disable tatsaechlich die Ausfuehrung? (execute_plugin Pruefung)

7. **B7 — PUT /v1/plugins/{id}/schedule** — Schedule-Update:
   - Benoetigt AdminUser Auth
   - Body: `{ schedule: "*/5 * * * *" }` oder `{ schedule: null }`
   - Pruefen: Wird die Schedule validiert? (gueltige Cron-Expression?)
   - Pruefen: Hat Schedule tatsaechlich Auswirkung? (kein PluginScheduler!)

8. **B8 — Router-Registration:** Ist der plugins-Router in `src/api/v1/__init__.py` korrekt eingebunden? Prefix `/v1/plugins`?

**Report:** Erstelle Endpoint-Tabelle: Method+Path, Auth, Request-Body, Response-Felder, Error-Cases, Probleme

---

### Block C: DB-Schema & Alembic Migration (~0.5h)

**Ziel:** DB-Schema verifizieren — Tabellen, Spalten, Constraints, Indizes, Migration up/down

**Pruefpunkte:**

1. **C1 — plugin_configs Tabelle:** Alle Spalten vorhanden? (plugin_id PK, display_name NOT NULL, description, category, is_enabled DEFAULT TRUE, config JSONB, config_schema JSONB, capabilities TEXT[], schedule, created_by FK, updated_at)

2. **C2 — plugin_executions Tabelle:** Alle Spalten vorhanden? (id UUID PK, plugin_id FK CASCADE, started_at, finished_at, status, triggered_by, triggered_by_user FK, triggered_by_rule UUID, result JSONB, error_message, duration_seconds)

3. **C3 — Indizes:** `ix_plugin_executions_plugin_id`, `ix_plugin_executions_started_at` — Existieren sie?

4. **C4 — Alembic-Kette:** Ist die Migration korrekt in der Revision-Chain? Vorgaenger korrekt referenziert?

5. **C5 — Models/__init__.py:** Sind `PluginConfig` und `PluginExecution` in `src/db/models/__init__.py` importiert?

**Report:** Schema-Verifikationstabelle mit IST vs. SOLL

---

### Block D: Logic Engine Integration (~1.5h)

**Ziel:** Plugin-als-Action in der Logic Engine durchgehend testen — von Rule-Erstellung bis Plugin-Ausfuehrung

**Pruefpunkte:**

1. **D1 — PluginActionExecutor Registration:** In `main.py` Zeile 553-578 — wird der Executor in `action_executors` Liste registriert. [Korrektur: NICHT letzter — DiagnosticsActionExecutor (Phase 4D) kommt NACH PluginActionExecutor. Reihenfolge: actuator, delay, notification, sequence, **plugin**, diagnostics]

2. **D2 — supports():** `PluginActionExecutor.supports('plugin')` → True. `supports('autoops_trigger')` → True. Alle anderen → False. Testen!

3. **D3 — Action-Schema-Validierung:** In `src/db/models/logic_validation.py` Zeile 279-309 — `PluginTriggerAction` existiert als Pydantic-Model. `type: Literal["plugin", "autoops_trigger"]`, `plugin_id: str` (Pflicht, min=1, max=128), `config: dict` (optional). Dispatch in Zeile 395-396. [Korrektur: Pfad ist `logic_validation.py`, NICHT `schemas/logic.py`]

4. **D4 — End-to-End Rule-Test:**
   - Rule erstellen mit Action `{ type: "plugin", plugin_id: "health_check", config: {} }`
   - Rule speichern (POST /v1/rules)
   - Rule ausfuehren (manueller Trigger oder Sensor-Event)
   - Plugin-Execution in `plugin_executions` Tabelle pruefen
   - `triggered_by` = "logic_rule", `triggered_by_rule` = Rule-UUID

5. **D5 — Fehlerfall-Tests:**
   - Nicht-existierendes Plugin → ActionResult.success = False
   - Deaktiviertes Plugin → Fehler mit Meldung
   - Plugin wirft Exception → Rollback versucht, Error-Message gespeichert

6. **D6 — Frontend: RuleFlowEditor Plugin-Node:**
   - Plugin-Node wird korrekt im Canvas gerendert (Puzzle-Icon, Orange #f59e0b)
   - Node-Daten: `pluginId` und `config`
   - Serialisierung nach Server: `{ type: "plugin", plugin_id: "...", config: {} }`
   - Deserialisierung vom Server zurueck in Node: ruleToGraph() fuer Plugin-Actions

7. **D7 — Frontend: RuleConfigPanel Plugin-Config:**
   - Wenn Plugin-Node selektiert: Wird ein Dropdown mit allen verfuegbaren Plugins angezeigt?
   - Plugin-spezifische Config-Felder? (Aus config_schema des gewaehlten Plugins)
   - Datei: `src/components/rules/RuleConfigPanel.vue` — Plugin-Bereich suchen

**Report:** End-to-End Flow-Diagramm (Text) + Probleme pro Schritt

---

### Block E: Frontend-Komponenten Qualitaet (~2h)

**Ziel:** Jede Frontend-Komponente einzeln auf Vollstaendigkeit, UX, Edge Cases, Design-Konsistenz pruefen

**Pruefpunkte:**

1. **E1 — PluginsView.vue (487 Zeilen):**
   - Filter-Chips (Alle/Aktiv/Deaktiviert) → Funktionieren die Computed korrekt?
   - Detail-SlideOver → Oeffnet sich bei Plugin-Klick?
   - Config-Dialog → Oeffnet sich aus dem SlideOver heraus?
   - Refresh-Button → Laedt Plugins neu?
   - Loading-State → Wird Spinner angezeigt?
   - Empty-State → "Keine Plugins gefunden" bei leerer Liste?
   - **FEHLT:** Kategorie-Filter (Monitoring/Diagnose/Wartung/Automation) — nur Enabled/Disabled Filter vorhanden

2. **E2 — PluginCard.vue (303 Zeilen):**
   - Status-Dot (gruen/grau) → Korrekte Farben?
   - Kategorie-Label → Deutsche Uebersetzung (CATEGORY_LABELS)?
   - Capabilities als Chips → Werden sie angezeigt?
   - Last Execution → Status-Icon + relative Zeit?
   - Execute-Button → Disabled bei deaktiviertem Plugin? Spinner bei Ausfuehrung?
   - Toggle-Button → Wechselt zwischen Power/PowerOff Icon?
   - **PRUEFEN:** Werden Schedule-Infos angezeigt? (Schedule existiert in PluginDTO aber wird nicht gerendert)

3. **E3 — PluginConfigDialog.vue (270 Zeilen):**
   - Boolean → Checkbox ✅
   - Number/Integer → Number-Input ✅
   - String → Text-Input ✅
   - **FEHLT:** Select-Typ → Dropdown! (ESPConfigurator config_schema hat `type: "select"` mit `options`)
   - **FEHLT:** `label`-Feld aus Schema wird ignoriert — zeigt `description` oder `key`
   - **PRUEFEN:** Werden Default-Werte korrekt geladen wenn Config leer ist?
   - **PRUEFEN:** Validierung? Min/Max bei Numbers? Required-Felder?

4. **E4 — PluginExecutionHistory.vue (255 Zeilen):**
   - Status-Config: success/failure/running/timeout → Icons + Labels + Farben
   - **PRUEFEN:** Backend sendet `error` als Status, Frontend erwartet `failure` → Mapping-Diskrepanz!
   - Trigger-Icons: manual (User), logic_rule (Workflow), schedule (Clock), system (Cpu)
   - Duration-Format: <1s → ms, >=1s → Sekunden mit Dezimale
   - Error-Message → Rote Box mit Fehlertext
   - **FEHLT:** Expandierbares Result-Detail (summary, actions, warnings) — nur error_message wird gezeigt

5. **E5 — Sidebar-Navigation:** [Korrektur: BESTÄTIGT — `/plugins` ist in Sidebar.vue Zeile 152-158 verlinkt. Puzzle-Icon vorhanden. Position: nach Maintenance-Eintrag]
   - ~~Ist `/plugins` im Sidebar-Menu verlinkt?~~ JA
   - ~~Gibt es ein Puzzle-Icon im Sidebar?~~ JA
   - ~~Position: Wo zwischen den anderen Menu-Eintraegen?~~ Nach "Wartung"

6. **E6 — Design-Konsistenz:**
   - Nutzen alle Plugin-Komponenten die CSS-Tokens aus `tokens.css`?
   - Glassmorphism-Pattern konsistent?
   - BEM-Namenskonvention korrekt? (plugins-view__, plugin-card__, plugin-detail__, etc.)
   - Responsive-Verhalten: Grid bei verschiedenen Bildschirmbreiten?

**Report:** Komponenten-Matrix mit Status (FERTIG/LUECKE/FIX_NOETIG) + Screenshots-Beschreibungen

---

### Block F: PluginContext Enrichment & Schedule (~1h)

**Ziel:** Block 4C.4 pruefen — Context-Anreicherung und Schedule-Support

**Pruefpunkte:**

1. **F1 — PluginContext bei manueller Ausfuehrung:**
   - `plugin_service.py:execute_plugin()` baut `AutoOpsContext` + `GodKaiserClient`
   - `autoops_context.extra` enthaelt trigger_source, trigger_rule_id, trigger_value, config_overrides, user_id
   - **FEHLT:** ESP-Devices werden NICHT in den Context geladen (kein `await esp_service.get_all_devices()`)
   - **FEHLT:** Aktive Alerts werden NICHT geladen (kein `await notification_service.get_alerts_by_status()`)
   - **FEHLT:** User-Preferences werden NICHT geladen

2. **F2 — PluginContext bei Logic-Rule-Trigger:**
   - `plugin_executor.py` baut `PluginContext` mit trigger_source='logic_rule'
   - trigger_rule_id und trigger_value werden durchgereicht
   - config_overrides aus Action-Config
   - **PRUEFEN:** Wird rule_id als UUID oder String uebergeben?

3. **F3 — Schedule-Support:**
   - Endpoint `PUT /v1/plugins/{id}/schedule` existiert und speichert Cron-Expression in DB
   - **FEHLT:** Kein `PluginScheduler` Service der tatsaechlich APScheduler-Jobs registriert
   - **FEHLT:** Kein Schedule-Sync bei Server-Start
   - **ENTSCHEIDUNG:** Ist Schedule-Support fuer Phase 4C noetig oder kann es nach Phase 4D verschoben werden?

4. **F4 — PluginContext Dataclass:**
   - Felder: user_id, user_preferences, system_config, trigger_source, trigger_rule_id, trigger_value, config_overrides, esp_devices, active_alerts
   - **PRUEFEN:** Werden die Felder esp_devices und active_alerts irgendwo befuellt? Oder immer leere Listen?

**Report:** Context-Fluss-Diagramm (Text) — Was wird befuellt, was bleibt leer

---

### Block G: Metriken, Error-Codes, WebSocket-Events (~1h)

**Ziel:** Observability-Integration pruefen — Prometheus, Error-Code-System, WebSocket-Echtzeit-Updates

**Pruefpunkte:**

1. **G1 — Prometheus-Metriken:** [Korrektur: VORAB-ERGEBNIS — `src/core/metrics.py` enthält KEINE Plugin-Metriken. `plugin_service.py` instrumentiert NICHT mit Prometheus. Analyse kann direkt als FEHLEND markiert werden]
   - ~~Existieren Plugin-Ausfuehrungs-Metriken?~~ NEIN
   - ~~Duration-Histogram?~~ NEIN
   - ~~Error-Rate pro Plugin?~~ NEIN

2. **G2 — Error-Codes:** [Korrektur: VORAB-ERGEBNIS — AutoOps-Range 5800-5849 existiert mit nur 2 Codes: AUTOOPS_JOB_FAILED=5800, AUTOOPS_SCHEDULE_INVALID=5801. Range 5900-5999 ist RESERVED aber leer. Keine plugin-spezifischen Codes (execute_failed, config_invalid, rollback_failed etc.)]
   - ~~Sind Plugin-spezifische Error-Codes registriert?~~ Nur 2 generische AutoOps-Codes
   - ~~Gibt es 5900er Codes?~~ NEIN — 5900-5999 ist RESERVED
   - Suchen in: `src/core/error_codes.py` Zeile 376-381

3. **G3 — WebSocket-Events:** [Korrektur: VORAB-ERGEBNIS — `plugin_service.py` hat KEINEN WebSocket-Broadcast. Keine Events existieren. Die genannten Event-Namen sind Vorschlaege, NICHT vorhanden]
   - ~~Werden Plugin-Ausfuehrungen als WS-Events gestreamt?~~ NEIN

4. **G4 — Grafana-Alerts:**
   - Existieren Grafana-Alert-Rules fuer Plugin-Fehler?
   - z.B. "Plugin-Ausfuehrung fehlgeschlagen > 3x in 5min"
   - Suchen in: Grafana provisioning YAML-Dateien

5. **G5 — Audit-Log:** [Korrektur: VORAB-ERGEBNIS — `plugin_service.py` importiert KEINEN AuditLog/AuditService. Keine Audit-Integration vorhanden]
   - ~~Werden Plugin-Ausfuehrungen im AuditLog erfasst?~~ NEIN

**Report:** Observability-Matrix: Feature × Status (vorhanden/fehlt/stub)

---

### Block H: Test-Suite Erstellung (~3-4h)

**Ziel:** Mindestens 20 Tests schreiben die das gesamte Plugin-System absichern

**Test-Plan:**

| Testdatei | Anz. | Was wird getestet |
|-----------|------|-------------------|
| `tests/unit/test_plugin_metadata.py` | 4 | @plugin_metadata Dekorator, Alle 4 Plugins haben Metadata, config_schema Format, PluginCapability Enum |
| `tests/unit/test_plugin_context.py` | 3 | PluginContext Instanziierung, Default-Werte, Felder-Typen |
| `tests/unit/test_plugin_service.py` | 6 | sync_registry, execute (success/error/disabled), update_config, toggle, get_history |
| `tests/unit/test_plugin_executor.py` | 4 | supports(), execute (success/not_found/disabled), context propagation |
| `tests/integration/test_plugin_api.py` | 6 | GET list, GET detail, POST execute, PUT config, GET history, POST enable/disable |

[Korrektur: Pfade sind relativ zu `El Servador/god_kaiser_server/`. Vollstaendig: `El Servador/god_kaiser_server/tests/unit/test_plugin_*.py` und `El Servador/god_kaiser_server/tests/integration/test_plugin_api.py`. Bestehende Test-Namenskonvention: `test_<feature>.py` (snake_case, kein Ordner pro Feature). Aktuell 0 Plugin-Tests vorhanden — verifiziert per Glob.]

**Namenskonvention:** Tests folgen dem bestehenden Pattern im auto-one Repo (pytest, async, fixtures)

**Report:** Test-Report mit Passed/Failed/Skipped + Coverage-Hinweise

---

## Reihenfolge

```
Block A (Backend-Kern)       — Versteht die Plugins, findet Code-Probleme
    ↓
Block C (DB-Schema)          — Versteht die Persistenz
    ↓
Block B (REST-API)           — Versteht die Schnittstelle
    ↓
Block D (Logic Engine)       — Versteht die Vernetzung
    ↓
Block E (Frontend)           — Versteht die Darstellung
    ↓
Block F (Context+Schedule)   — Versteht die Enrichment-Luecken
    ↓
Block G (Metriken+Events)    — Versteht die Observability-Luecken
    ↓
Block H (Tests)              — Sichert alles ab
```

**Block A → C → B koennen parallel laufen** (unabhaengig)
**Block D braucht A+B+C** (Verstaendnis aller Schichten)
**Block E kann parallel zu D laufen** (Frontend unabhaengig vom Backend-Test)
**Block F+G brauchen D** (Kontext)
**Block H braucht alles** (Tests basieren auf Analyse-Ergebnissen)

---

## Gezielte Fixes (nach Analyse)

Basierend auf den bekannten Luecken L1-L12 werden folgende Fixes noetig sein:

### Fix-Prioritaet 1 (MUSS)
- [ ] **L1:** Test-Suite erstellen (Block H)
- [ ] **L2:** Select-Typ in PluginConfigDialog.vue (Dropdown rendern wenn `type: "select"` + `options`)
- [ ] **L3:** `label`-Feld aus config_schema nutzen (statt `description` oder `key`)
- [ ] **L12:** Status-Werte harmonisieren: Backend `error` → Frontend `failure` Mapping

### Fix-Prioritaet 2 (SOLL)
- [ ] **L4:** PluginContext Enrichment (ESP-Devices + aktive Alerts laden)
- [x] **L6:** ~~Sidebar-Navigation pruefen/ergaenzen~~ [Korrektur: Bereits vorhanden in Sidebar.vue:152-158 — KEIN FIX NÖTIG]
- [ ] **L11:** RuleConfigPanel Plugin-Config-Felder [Korrektur: Bestätigt fehlend — RuleConfigPanel.vue hat 0 Plugin-Referenzen. Prioritaet HOCHSTUFEN auf MUSS, da Plugin-Nodes sonst nicht konfigurierbar]
- [ ] **L13 (NEU):** AuditLog-Integration in PluginService (execute, config-update, toggle)

### Fix-Prioritaet 3 (KANN)
- [ ] **L5:** PluginScheduler Service (Service-Methode `get_scheduled_plugins()` existiert in plugin_service.py:283, aber kein Scheduler-Job der sie aufruft)
- [ ] **L7:** SystemMonitorView-Verlinkung (bestätigt fehlend — kein Plugin-Tab)
- [ ] **L8:** Prometheus-Metriken (bestätigt fehlend — 0 Metriken)
- [ ] **L9:** Error-Codes erweitern (nur 2 generische Codes in 5800-5849)
- [ ] **L10:** WebSocket-Events (bestätigt fehlend — 0 Events)

---

## Abschluss-Verifikation

- [ ] Alle 4 Plugins: Manuell ausfuehrbar via UI (Execute-Button → Status → History)
- [ ] Plugin-Config: Dynamisch konfigurierbar (boolean, number, string, **select**)
- [ ] Plugin-Toggle: Aktivieren/Deaktivieren funktioniert, deaktiviertes Plugin nicht ausfuehrbar
- [ ] Logic Engine: Rule mit Plugin-Action → Plugin wird ausgefuehrt → Execution in History
- [ ] Execution-History: Alle Ausfuehrungen sichtbar mit Status, Trigger, Duration, Error
- [ ] CLI-Runner: `runner.py` funktioniert weiterhin ohne Regression
- [ ] Bestehende Tests: Alle ~341+ Tests laufen fehlerfrei
- [ ] Neue Tests: ~20+ Tests fuer Plugin-System laufen fehlerfrei
- [ ] Build: `vue-tsc --noEmit` und `vite build` fehlerfrei
