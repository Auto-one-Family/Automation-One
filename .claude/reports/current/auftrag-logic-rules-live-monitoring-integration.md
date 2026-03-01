# Auftrag: Logic Rules — Live-Monitoring & Observability-Integration

> **Erstellt:** 2026-03-01
> **Erstellt von:** Automation-Experte (Life-Repo)
> **Ziel-Repo:** auto-one
> **Kontext:** Logic Rules werden im Regeleditor (LogicView) gebaut. Aber der User hat aktuell KEINEN Ort wo er live sehen kann: Welche Rule laeuft gerade? Was hat sie bewirkt? Welcher Sensor hat sie getriggert? Wie ist der aktuelle Zustand aller aktiven Automatisierungen? Dieser Auftrag integriert Logic Rules in das Monitoring-Erlebnis und verbindet sie mit dem Observability-Stack.
> **Prioritaet:** HOCH — Logik ist das Herzstueck der Automatisierung, aber unsichtbar im Betrieb
> **Status:** OFFEN — Anforderungen beschrieben, tiefe Analyse erforderlich
> **Typ:** Analyse + Architektur + Implementierung (Cross-Layer: Backend + Frontend + Monitoring)
> **Voraussetzung:** `auftrag-monitor-komponentenlayout-erstanalyse.md` muss die Monitor-Architektur definiert haben
> **Voraussetzung:** `auftrag-logic-rules-editor-polishing.md` muss den Editor funktionsfaehig gemacht haben

---

## Warum ist dieser Auftrag komplex?

Dieses Thema beruehrt ALLE Schichten des Systems:

```
┌──────────────────────────────────────────────────────────────────┐
│ FRONTEND — Was zeigt man dem User?                              │
│ • Live-Status aller aktiven Rules im Monitor-Tab                │
│ • Execution-Timeline (welche Rule hat wann was gemacht?)        │
│ • Rule-Zustand pro Zone (welche Rules betreffen diese Zone?)    │
│ • Automatisch ordentliche Darstellung ohne manuelle Config      │
│ • User-konfigurierbar ueber den Dashboard-Editor               │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────┴───────────────────────────────────────┐
│ BACKEND — Welche Daten liefert der Server?                      │
│ • Logic Engine Execution Events (schon vorhanden via WS)        │
│ • Execution-History-API (teilweise vorhanden)                   │
│ • Rule-Status-Aggregation (aktiv, pausiert, fehlerhaft)         │
│ • Rule-Zone-Mapping (welche Rules betreffen welche Zonen?)      │
│ • Trigger-Kontext (welcher Sensorwert hat die Rule getriggert?) │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────┴───────────────────────────────────────┐
│ MONITORING-STACK — Wie beobachtet man die Automatisierung?      │
│ • Grafana Dashboards fuer Rule-Execution-Metriken               │
│ • Prometheus-Metriken: rules_executed_total, execution_errors   │
│ • Loki-Logs: Rule-Execution-Traces mit Correlation-IDs          │
│ • Alerts: Rule-Failure-Rate, Stuck-Rule, Loop-Detection         │
└──────────────────────────────────────────────────────────────────┘
```

> **[verify-plan] IST-Zustand Cross-Layer (2026-03-01):**
>
> **FRONTEND — Was BEREITS existiert:**
> - `logic.store.ts` (`El Frontend/src/shared/stores/logic.store.ts`): Pinia Store mit rules[], activeExecutions (Map<ruleId, timestamp>), recentExecutions (letzte 20 Events). WebSocket-Subscription auf `logic_execution`. 2-Sekunden visuelles Feedback. Connections-computed fuer ESP-Visualisierung.
> - `LogicView.vue` (`El Frontend/src/views/LogicView.vue`, ~1400 Zeilen): Node-RED-artiger Editor mit VueFlow Canvas, Node-Palette, RuleConfigPanel, Execution History Panel (bottom drawer). KEIN Monitoring-View — nur Editor.
> - `types/logic.ts`: LogicRule, LogicCondition (4 Typen: sensor, time, hysteresis, compound), LogicAction (3 Typen: actuator, notification, delay), LogicConnection (fuer Visualisierung).
> - `api/logic.ts`: Vollstaendiger REST-Client: getRules, getRule, createRule, updateRule, deleteRule, toggleRule, testRule, getExecutionHistory.
> - **Dashboard-Widget-System hat 9 Widget-Typen — KEINER davon fuer Logic Rules.** WidgetType union: `'line-chart' | 'gauge' | 'sensor-card' | 'historical' | 'actuator-card' | 'actuator-runtime' | 'esp-health' | 'alarm-list' | 'multi-sensor'`
> - **DashboardLayout Interface hat KEIN zoneId/scope** — alle Dashboards sind global. Erweiterung noetig fuer Zone-spezifische Rule-Anzeige.
>
> **BACKEND — Was BEREITS existiert:**
> - Logic Engine (`El Servador/.../services/logic_engine.py`): Vollstaendige Execution-Pipeline. evaluate_sensor_data() → get_rules_by_trigger_sensor() → _evaluate_rule() → _execute_actions().
> - **4 Condition Evaluators:** SensorConditionEvaluator (>, <, >=, <=, ==, !=, between), TimeConditionEvaluator (HH:MM, days_of_week, overnight), HysteresisConditionEvaluator (cooling/heating mit State-Tracking), CompoundConditionEvaluator (AND/OR nesting).
> - **4 Action Executors:** ActuatorActionExecutor, NotificationActionExecutor (WebSocket/Email/Webhook), DelayActionExecutor, SequenceActionExecutor (MAX_CONCURRENT=20, MAX_STEPS=50, mit SequenceProgress Tracking).
> - **Safety-System:** LoopDetector (DFS, MAX_CHAIN_DEPTH=10), RateLimiter (3-stufig: Global 100/s, Per-ESP 20/s, Per-Rule hourly via DB), ConflictManager (Priority-basiert, Safety-Override, Lock-TTL 60s).
> - **REST-API:** `/v1/logic/rules` (CRUD), `/v1/logic/rules/{id}/toggle`, `/v1/logic/rules/{id}/test` (Dry-Run), `/v1/logic/execution_history` (paginated, time-range filter).
> - **WebSocket Events:** `logic_execution` (pro Action: rule_id, rule_name, trigger{esp_id,gpio,sensor_type,value}, action, success, message, timestamp). Auch: `notification`, `sequence_started/step/completed/error/cancelled`.
> - **DB-Modelle:** CrossESPLogic (UUID PK, rule_name UNIQUE, trigger_conditions JSON, actions JSON, priority, cooldown_seconds, max_executions_per_hour, last_triggered, rule_metadata JSON). LogicExecutionHistory (FK→CrossESPLogic CASCADE, trigger_data JSON, actions_executed JSON, success, error_message, execution_time_ms, timestamp INDEX DESC).
> - **FEHLT:** Kein `rule_status` oder `rule_state_change` WS-Event. Kein periodischer Status-Broadcast. Kein Rule-Zone-Mapping (Rules referenzieren ESP+GPIO, nicht Zonen).
>
> **MONITORING-STACK — Was BEREITS existiert:**
> - **Prometheus-Metriken (metrics.py):** `god_kaiser_logic_errors_total` (Counter), `god_kaiser_safety_triggers_total` (Counter), `god_kaiser_actuator_timeouts_total` (Counter). Metrics-Endpoint: `/api/v1/health/metrics`.
> - **FEHLENDE Prometheus-Metriken:** Kein `logic_rules_total` Gauge, kein `logic_rule_executions_total` Counter (mit rule_id Label), kein `logic_rule_execution_duration_seconds` Histogram, kein `logic_rule_condition_evaluations_total`.
> - **Grafana Dashboards:** `debug-console.json`, `system-health.json` — KEIN Logic-Engine-Dashboard.
> - **Grafana Alert:** `ao-logic-engine-errors` existiert (triggers bei increase von logic_errors_total in 5min).
> - **Loki-Logs:** Logic Engine loggt via standard Python logger (`get_logger(__name__)`). KEINE strukturierten Labels fuer rule_id/rule_name. LogQL muesste auf Freitext matchen. Correlation-IDs nur im WS-Kontext, nicht in File-Logs.

---

## Robins Anforderungen

### 1. Logic Rules im Monitor-Tab (Ebene 1)

**Wo im Monitor erscheinen Logic Rules?**

Auf der ersten Ebene des Monitor-Tabs (neben Zonen-Cards und Cross-Zone-Dashboards) muessen die aktiven Automatisierungen sichtbar sein:

```
┌──────────────────────────────────────────────────────────────────────┐
│  [Monitor]                                                           │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ─── Zonen ──────────────────────────────────────────────────────── │
│  [Gewaechshaus]  [Aussen]  [Keller]                                 │
│                                                                      │
│  ─── Aktive Automatisierungen ───────────────────────────────────── │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ ✅ Temperaturueberwachung    Letzte: vor 2 Min  │  24h: 12x    ││
│  │    SHT31 > 28°C → Luefter EIN                    │  Zone: Gew. ││
│  ├─────────────────────────────────────────────────────────────────┤│
│  │ ✅ Bewaesserungsautomatik    Letzte: vor 15 Min │  24h: 4x     ││
│  │    Bodenfeuchte < 30% → Pumpe 60s                │  Zone: Gew. ││
│  ├─────────────────────────────────────────────────────────────────┤│
│  │ ⏸ Beleuchtungssteuerung     Pausiert             │  24h: 0x    ││
│  │    08:00-18:00 → Licht EIN                       │  Zone: Gew. ││
│  ├─────────────────────────────────────────────────────────────────┤│
│  │ ❌ pH-Alarm                  Fehler: API-Timeout │  24h: 1x    ││
│  │    pH < 5.5 → Email senden                       │  Zone: Gew. ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ─── Cross-Zone Dashboards ──────────────────────────────────────── │
│  [...]                                                               │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Anforderungen:**
- Alle aktiven Rules auf einen Blick (nicht nur die der aktuellen Zone)
- Status pro Rule: Aktiv (gruen), Pausiert (grau), Fehlerhaft (rot)
- Letzte Ausfuehrung + 24h-Counter
- Betroffene Zone als Tag/Badge
- Klick auf Rule → Oeffnet den Regeleditor mit dieser Rule geladen
- Auto-ordnet sich: Fehlerhaft zuerst, dann aktiv, dann pausiert

> **[verify-plan] IST-Zustand fuer Anforderung 1:**
>
> **Verfuegbare Daten im Frontend (logic.store.ts):**
> - `rules[]` (LogicRule): id, name, description, enabled, conditions[], actions[], priority, cooldown_seconds, max_executions_per_hour, last_triggered, execution_count, last_execution_success.
> - `activeExecutions` (Map<ruleId, timestamp>): Temporaer gesetzt fuer 2s nach WS-Event. Kann fuer "gerade aktiv" Feedback genutzt werden.
> - `recentExecutions[]` (letzte 20 LogicExecutionEvents): rule_id, rule_name, trigger{esp_id, gpio, sensor_type, value}, action, success, timestamp.
> - `enabledRules` (computed): Nur enabled=true Rules.
>
> **Was FEHLT fuer die Anforderung:**
> - **Rule-Status "fehlerhaft":** `last_execution_success` existiert im LogicRule, aber es gibt keinen dedizierten "error" Status. Man muesste ableiten: `enabled && last_execution_success === false` → "fehlerhaft". KEIN `error_message` Feld im Frontend-Typ (nur in ExecutionHistory).
> - **24h-Counter:** Nicht im Frontend vorhanden. Muesste per REST geholt werden: `logicApi.getExecutionHistory({ rule_id, start_time: 24h_ago })`. Oder: Neuer API-Endpoint fuer aggregierte Counts pro Rule.
> - **Betroffene Zone als Tag:** Rules haben KEIN zone_id. Zone-Mapping muss im Frontend berechnet werden: ESP+GPIO aus Conditions matchen gegen espStore.devices[].zone_id. Die Funktion `extractSensorConditions()` aus types/logic.ts extrahiert bereits alle ESP+GPIO Paare.
> - **Klick → Regeleditor:** Route existiert: `/logic` (LogicView). Aber LogicView hat keinen URL-Parameter fuer Rule-ID. Erweiterung noetig: `/logic?rule=<id>` oder `/logic/:ruleId`.

### 2. Logic Rules in der Zonenansicht (Ebene 2)

**In der Zonenansicht (Ebene 2) sollen die zonen-relevanten Rules erscheinen:**

- NUR Rules die diese Zone betreffen (mindestens ein Sensor/Aktor in dieser Zone)
- ESP-Crossing innerhalb der Zone: Rule die Sensoren von ESP_A liest und Aktoren auf ESP_B schaltet — beide in gleicher Zone
- Kompakte Darstellung: Status-Dot + Name + letzte Ausfuehrung
- Optional: Timeline-Widget das zeigt wann welche Rule in den letzten 24h gefeuert hat

> **[verify-plan] IST-Zustand fuer Anforderung 2:**
>
> **Rule-Zone-Mapping (muss berechnet werden):**
> Rules kennen Zonen NICHT direkt. Algorithmus im Frontend:
> 1. Fuer jede Rule → `extractSensorConditions(rule.conditions)` → liefert `{ esp_id, gpio }[]`
> 2. Fuer jede Rule → `rule.actions.filter(a => a.type === 'actuator')` → liefert `{ esp_id, gpio }[]`
> 3. Pro ESP: `espStore.devices.find(d => d.esp_id === esp_id)?.zone_id`
> 4. Rule "betrifft Zone X" wenn MINDESTENS ein Condition-Sensor ODER ein Action-Actuator in Zone X liegt.
>
> **Vorhandene Helper:** `getConnectionsForEsp(espId)`, `extractConnections(rule)` in logic.store.ts. Aber KEIN `getRulesForZone(zoneId)` — muss neu implementiert werden.
>
> **ESP-Crossing:** Bereits modelliert in `LogicConnection.isCrossEsp` (computed: sourceEspId !== targetEspId). Zone-internes Crossing erkennbar wenn beide ESPs gleiche zone_id haben.
>
> **Timeline-Widget:** Daten per `logicApi.getExecutionHistory({ rule_id, start_time, end_time })` abrufbar. Liefert ExecutionHistoryItem[] mit timestamp, success, execution_time_ms. Max 100 Eintraege pro Request.

### 3. Live-Anzeige im Monitoring — "Wo steht was genau?"

**Robins Kern-Anforderung:** Der User will LIVE sehen wo was genau steht. Nicht nur "Rule hat gefeuert", sondern:

- Welcher Sensorwert hat die Rule getriggert? ("Temperatur 29.3°C, Schwellwert 28°C → Luefter EIN")
- Wie lange ist der Aktor schon aktiv? ("Luefter laeuft seit 4:23 Min")
- Wann wird die naechste Zeitfenster-Rule aktiv? ("Beleuchtung startet in 1h 15min")
- Welche Conditions sind AKTUELL erfuellt? (bei AND: 2/3 Conditions gruen, 1 noch nicht)

**Das erfordert Echtzeit-Daten die ueber die aktuelle API hinausgehen:**
- Aktueller Sensorwert im Kontext der Rule-Condition
- Aktor-Laufzeit seit letzter Schaltung
- Countdown fuer Zeitfenster-Rules
- Condition-Evaluierungs-Zwischenergebnisse

> **[verify-plan] IST-Zustand fuer Anforderung 3 — Kritische Gap-Analyse:**
>
> | Live-Anforderung | Backend-Unterstuetzung | Gap |
> |------------------|----------------------|-----|
> | Welcher Sensorwert hat getriggert? | `logic_execution` WS-Event hat `trigger.value` + `trigger.sensor_type` | ✅ VORHANDEN — aber nur zum Trigger-Zeitpunkt, nicht als laufender Live-Wert |
> | Aktueller Sensorwert im Kontext | `sensor_data` WS-Events liefern Live-Werte; Frontend hat `sensorStore` | ✅ VORHANDEN — Verknuepfung Rule↔Sensor muss im Frontend gebaut werden |
> | Wie lange laeuft der Aktor? | `actuator_status` WS-Event hat `runtime_ms`; kein direkter Bezug zur Rule | ⚠️ TEILWEISE — runtime_ms existiert, aber keine Rule↔Aktor-Laufzeit-Verknuepfung |
> | Countdown Zeitfenster-Rule | TimeConditionEvaluator hat `start_time`/`end_time` im Rule-JSON | ⚠️ FRONTEND-ONLY — Berechnung moeglich aus Rule.conditions[type=time].start_hour, keine Backend-API |
> | Condition-Zwischenergebnisse | HysteresisEvaluator hat In-Memory-State (`HysteresisState.is_active`); SensorEval hat keinen State | ❌ FEHLT — Backend hat `_check_conditions()` OHNE Broadcast der Teilergebnisse. Neuer Endpoint oder WS-Event noetig |
> | Rule gerade aktiv (visuell) | `activeExecutions` Map in logic.store (2s TTL nach WS-Event) | ✅ VORHANDEN — reicht fuer "gerade gefeuert" Feedback |
>
> **Architektur-Entscheidung noetig:**
> - **Option A (empfohlen):** Neuer REST-Endpoint `GET /v1/logic/rules/{id}/live-status` der Condition-Evaluierungs-Zwischenergebnisse, Hysteresis-State und Aktor-Laufzeit liefert. Polling alle 5-10s.
> - **Option B:** Neues WS-Event `rule_live_status` das periodisch (alle 5s) oder bei State-Change den aktuellen Zustand aller aktiven Rules broadcastet. Hoehere Server-Last, aber Echtzeit.
> - **Option C (minimal):** Kein neuer Endpoint. Frontend berechnet alles aus bestehenden Daten (sensor_data + actuator_status + rule.conditions). Ungenau fuer Hysteresis-State (Server-State nicht im Frontend).
>
> **HysteresisConditionEvaluator State-Problem:**
> Der Hysteresis-State (`is_active`, `last_activation`, `last_deactivation`, `last_value`) lebt NUR im Server-Memory. Es gibt KEINEN REST-Endpoint um diesen State abzufragen. Fuer Live-Anzeige "2/3 Conditions gruen" muss entweder:
> - Ein neuer Endpoint her: `GET /v1/logic/rules/{id}/condition-states`
> - Oder: `testRule()` mit aktuellen Werten aufgerufen werden (existiert bereits, liefert `condition_results[]` mit `result: boolean` pro Condition)

### 4. Integration in den Dashboard-Editor

**Der User muss Logic-Rules-Widgets im Dashboard-Editor erstellen koennen:**

- Widget-Typ: "Automatisierungs-Status" — zeigt alle aktiven Rules einer Zone
- Widget-Typ: "Rule-Timeline" — zeigt Execution-History als Zeitachse
- Widget-Typ: "Rule-Detail" — zeigt eine spezifische Rule mit Live-Zustand
- Diese Widgets koennen in Zone-Dashboards und Cross-Zone-Dashboards eingebettet werden

> **[verify-plan] IST-Zustand fuer Anforderung 4:**
>
> **Dashboard-Widget-System (CustomDashboardView.vue, 897 Zeilen):**
> - GridStack 12-Spalten, cellHeight 80px, margin 8px.
> - 9 Widget-Typen definiert mit Default-Groessen in `widgetTypes` Array.
> - Widget-Registration: Jeder Typ hat `{ type, label, icon, category, defaultSize: {w,h} }`.
> - Widget-Config: WidgetConfigPanel.vue (SlideOver) mit dynamischen Feldern je nach Widget-Typ.
> - Widget-Rendering: Switch-Case in Template (`v-if="widget.type === 'line-chart'"` etc.).
>
> **Neue Logic-Widget-Typen registrieren — Aufwand:**
> 1. `WidgetType` union in `dashboard.store.ts` erweitern: `| 'rule-status' | 'rule-timeline' | 'rule-detail'`
> 2. Widget-Definitionen zum `widgetTypes` Array in CustomDashboardView hinzufuegen (type, label, icon, category, defaultSize)
> 3. Neue Widget-Komponenten erstellen: `RuleStatusWidget.vue`, `RuleTimelineWidget.vue`, `RuleDetailWidget.vue` in `El Frontend/src/components/dashboard-widgets/`
> 4. WidgetConfigPanel.vue erweitern: ruleId-Auswahl fuer Rule-Detail, zoneFilter fuer Rule-Status
> 5. Rendering-Switch in CustomDashboardView erweitern
>
> **Kategorie-Vorschlag:** Neue Widget-Kategorie "Automatisierung" (neben Sensoren, Aktoren, System)
>
> **Abhaengigkeit:** DashboardLayout braucht `scope: 'zone' | 'cross-zone'` und `zoneId?: string` fuer Zone-spezifische Rule-Widgets (siehe auftrag-monitor-komponentenlayout-erstanalyse.md).

### 5. Monitoring-Stack-Integration

**Die Logic Engine muss in den Observability-Stack integriert werden:**

- **Prometheus-Metriken:**
  - `logic_rules_total{status="active|paused|error"}` — Gauge
  - `logic_rule_executions_total{rule_id, result="success|error"}` — Counter
  - `logic_rule_execution_duration_seconds{rule_id}` — Histogram
  - `logic_rule_condition_evaluations_total{rule_id, condition_type}` — Counter

- **Loki-Logs:**
  - Structured Logging fuer jede Rule-Execution mit Correlation-ID
  - Trigger-Kontext (Sensorwert, Schwellwert, Ergebnis)
  - Action-Ergebnis (Aktor geschaltet, Email gesendet, Fehler)

- **Grafana-Dashboards:**
  - "Logic Engine Overview": Executions/h, Error-Rate, Top-10 Rules
  - "Rule Detail": Execution-Timeline, Trigger-Verteilung, Duration-Histogram

- **Grafana-Alerts:**
  - Rule-Failure-Rate > 50% in 15 Min
  - Stuck-Rule (sollte regelmaessig feuern, tut es nicht)
  - Loop-Detection (LoopDetector hat Zirkularitaet erkannt)

> **[verify-plan] IST-Zustand Monitoring-Stack (2026-03-01):**
>
> **Prometheus-Metriken — VORHANDEN (metrics.py, Pfad: `El Servador/.../core/metrics.py`):**
>
> | Metrik | Typ | Labels | Status |
> |--------|-----|--------|--------|
> | `god_kaiser_logic_errors_total` | Counter | keine | ✅ existiert |
> | `god_kaiser_safety_triggers_total` | Counter | keine | ✅ existiert |
> | `god_kaiser_actuator_timeouts_total` | Counter | keine | ✅ existiert |
>
> **Prometheus-Metriken — FEHLEN (Plan-Anforderungen vs. IST):**
>
> | Plan-Metrik | Typ | Status | Aufwand |
> |-------------|-----|--------|---------|
> | `logic_rules_total{status}` | Gauge | ❌ NEU | Mittel — DB-Query in update_all_metrics_async() |
> | `logic_rule_executions_total{rule_id,result}` | Counter | ❌ NEU | Gering — inc() in _evaluate_rule() |
> | `logic_rule_execution_duration_seconds{rule_id}` | Histogram | ❌ NEU | Gering — observe() in _evaluate_rule(), execution_time_ms existiert bereits |
> | `logic_rule_condition_evaluations_total{rule_id,condition_type}` | Counter | ❌ NEU | Mittel — inc() in jedem ConditionEvaluator |
>
> **Achtung Label-Kardinalitaet:** `rule_id` als Label erzeugt eine Zeitreihe PRO Rule. Bei 50+ Rules akzeptabel, bei 500+ problematisch fuer Prometheus. Alternative: `rule_name` Label (menschenlesbar, aber aenderbar).
>
> **Grafana-Dashboards — IST:**
> - `docker/grafana/provisioning/dashboards/debug-console.json` — Allgemeines Debug-Dashboard
> - `docker/grafana/provisioning/dashboards/system-health.json` — System-Health Overview
> - **KEIN** "Logic Engine Overview" Dashboard
> - **KEIN** "Rule Detail" Dashboard
> - Dashboard-Provisioning via `dashboards.yml`
>
> **Grafana-Alerts — IST:**
> - `ao-logic-engine-errors` — triggers bei `increase(god_kaiser_logic_errors_total[5m]) > 0`
> - **KEINE** Rule-Failure-Rate, Stuck-Rule oder Loop-Detection Alerts
> - Alert-Provisioning via `docker/grafana/provisioning/alerting/alert-rules.yml` + `loki-alert-rules.yml`
>
> **Loki-Logs — IST:**
> - Logic Engine loggt via `get_logger(__name__)` (Python standard logging)
> - Logs landen in `logs/server/` → Alloy → Loki (via docker Bind-Mount + Alloy Pipeline)
> - **KEINE** strukturierten Labels fuer `rule_id` oder `rule_name` in Loki
> - LogQL Query muesste auf Freitext matchen: `{container="automationone-server"} |~ "Rule .* executed"`
> - **Empfehlung:** Structured Logging mit Extra-Feldern (`rule_id`, `rule_name`, `action_type`, `success`) einfuehren, damit Loki-Labels fuer gezielte Queries verfuegbar sind

---

## Was dieser Auftrag liefern muss

### Phase 1: Tiefgehende Analyse

1. **Backend-Analyse der Logic Engine:**
   - Wie funktioniert die Execution-Pipeline genau? (logic_engine.py)
   - Welche Events werden aktuell ueber WebSocket gesendet?
   - Welche Daten fehlen fuer die Live-Anzeige?
   - Wie ist das Rule-Zone-Mapping implementiert? (welche Rules betreffen welche Zone?)
   - Wie funktioniert der LoopDetector, RateLimiter, ConflictManager?

> **[verify-plan] Backend-Analyse — Antworten aus dem echten System:**
>
> **Execution-Pipeline (logic_engine.py, ~740 Zeilen):**
> ```
> 1. Sensor Data arrives (MQTT → sensor_handler.py)
>    ↓
> 2. LogicEngine.evaluate_sensor_data(esp_id, gpio, value, sensor_type)
>    ↓
> 3. LogicRepository.get_rules_by_trigger_sensor(esp_id, gpio, sensor_type)
>    → Returns matching enabled rules, sorted by priority ASC
>    ↓
> 4. For each matching rule:
>    ├─ Cooldown-Check: rule.cooldown_seconds vs. rule.last_triggered
>    ├─ RateLimiter.check_rate_limit(): Global → Per-ESP → Per-Rule hourly
>    ├─ _check_conditions(): Delegate to matching ConditionEvaluator
>    │  (SensorEval, TimeEval, HysteresisEval, CompoundEval)
>    ├─ IF conditions_met:
>    │  ├─ ConflictManager.acquire_actuator() per Action
>    │  ├─ Execute Actions (ActuatorExec, NotifExec, DelayExec, SequenceExec)
>    │  ├─ WebSocket broadcast("logic_execution", {...}) per Action
>    │  └─ ConflictManager.release_actuator() (finally block)
>    └─ LogicRepository.log_execution() → LogicExecutionHistory
> 5. Timer-Loop: evaluate_timer_triggered_rules() fuer zeit-basierte Rules
> ```
>
> **WebSocket Events — IST-Zustand (7 Events):**
> | Event | Trigger | Payload-Kern |
> |-------|---------|-------------|
> | `logic_execution` | Pro ausgeloster Action | rule_id, rule_name, trigger{esp_id,gpio,sensor_type,value}, action{type,esp_id,gpio,command}, success, message, timestamp |
> | `notification` | NotificationAction (channel=websocket) | title, message, priority, rule_id, rule_name |
> | `sequence_started` | SequenceExecutor.execute() Start | sequence_id, rule_id, rule_name, total_steps, description |
> | `sequence_step` | Jeder Sequence-Schritt | sequence_id, step, step_name, total_steps, progress_percent, status |
> | `sequence_completed` | Sequence erfolgreich | sequence_id, status, success, duration_seconds, steps_completed, steps_failed |
> | `sequence_error` | Sequence Fehler | sequence_id, error_code, message |
> | `sequence_cancelled` | Sequence abgebrochen | sequence_id, reason |
>
> **Fehlende Daten fuer Live-Anzeige:**
> - Kein `rule_status_change` Event (enable/disable State-Aenderung)
> - Kein periodischer `rules_status_summary` Broadcast
> - Kein Condition-Evaluierungs-Zwischenergebnis im WS-Event
> - Kein Hysteresis-State-Abruf per API (nur Server-Memory)
> - Kein Aktor-Laufzeit-im-Kontext-der-Rule (actuator_status hat runtime_ms, aber ohne Rule-Bezug)
>
> **Rule-Zone-Mapping:**
> EXISTIERT NICHT im Backend. Rules sind ESP+GPIO-basiert. Zonen sind Frontend-Abstraktion. Mapping-Algorithmus muss im Frontend implementiert werden (siehe Annotation bei Anforderung 2).
>
> **Safety-System — IST-Zustand:**
> | Komponente | Pfad | Kern-Logik |
> |-----------|------|-----------|
> | LoopDetector | `.../logic/safety/loop_detector.py` | Graph-DFS, MAX_CHAIN_DEPTH=10, prueft vor Rule Create/Update |
> | RateLimiter | `.../logic/safety/rate_limiter.py` | 3-stufig: TokenBucket Global(100/s) → Per-ESP(20/s) → Per-Rule(DB hourly) |
> | ConflictManager | `.../logic/safety/conflict_manager.py` | Priority-Lock mit TTL=60s. Resolution: HIGHER_PRIORITY_WINS, FIRST_WINS, SAFETY_WINS(-1000 priority) |

2. **Log-System-Analyse:**
   - Wie loggt die Logic Engine aktuell? (Format, Felder, Correlation-IDs?)
   - Sind die Logs in Loki querybar? (Labels, Structured Metadata?)
   - Welche LogQL-Queries waeren noetig fuer Rule-Execution-Analyse?
   - Prometheus-Metriken: Welche existieren bereits, welche fehlen?

> **[verify-plan] Log-System-Analyse — IST-Zustand:**
>
> **Logging-Format:** Python `get_logger(__name__)` via `core/logging_config.py`. JSON-Format im Docker-Container. Log-Levels: DEBUG (evaluation details), INFO (rule triggered, execution completed), WARNING (rate limits, conflicts, skipped), ERROR (exceptions, validation failures).
>
> **Correlation-IDs:** Nur im WebSocket-Kontext (`correlation_id` Parameter in broadcast()). Nicht in File-Logs. MQTT-Pipeline hat Correlation-IDs (`ESP_ID:topic:seq:ts_ms`), aber Logic Engine nutzt diese NICHT in ihren Logs.
>
> **Loki-Queryability:**
> - Logs erreichbar via Label `{container="automationone-server"}`
> - KEINE Rule-spezifischen Labels (rule_id, rule_name fehlen als Loki-Labels)
> - Aktuelle Queries muessen Freitext matchen: `|~ "Rule .* executed"`, `|~ "logic_engine"`
> - **Empfehlung fuer Structured Logging:** `logger.info("Rule executed", extra={"rule_id": str(rule_id), "rule_name": rule_name, "success": True, "execution_time_ms": elapsed})` — damit Alloy diese als Loki-Labels extrahieren kann.
>
> **LogQL-Queries (vorgeschlagen):**
> ```logql
> # Alle Rule-Executions der letzten Stunde
> {container="automationone-server"} |~ "Rule .* executed action"
>
> # Fehlerhafte Executions
> {container="automationone-server"} |~ "failed to execute action"
>
> # Rate-Limit-Events
> {container="automationone-server"} |~ "Rate limit"
>
> # Conflict-Events
> {container="automationone-server"} |~ "ConflictManager"
> ```
>
> **Prometheus — Vollstaendiges IST (siehe oben bei Monitoring-Stack):**
> 3 Logic-relevante Metriken existieren (Counter-only). 4 werden im Plan gefordert aber fehlen.

3. **Frontend-Analyse:**
   - Welche WebSocket-Events verarbeitet der logic.store.ts aktuell?
   - Welche Daten fehlen fuer die Live-Anzeige im Monitor?
   - Wie koennen Logic-Rules-Widgets im Dashboard-Editor registriert werden?
   - Wie integriert sich die Rule-Anzeige in die Monitor-Architektur aus der Erstanalyse?

> **[verify-plan] Frontend-Analyse — IST-Zustand:**
>
> **logic.store.ts WS-Events (aktuell verarbeitet):**
> - NUR `logic_execution` — via `websocketService.subscribe({ types: ['logic_execution'] }, handleLogicExecutionEvent)`
> - Handler: Fuegt zu `recentExecutions` hinzu (max 20), setzt `activeExecutions.set(ruleId, Date.now())` mit 2s Timeout, aktualisiert `rule.last_triggered`
> - **NICHT verarbeitet:** `notification`, `sequence_*` Events — diese werden NICHT im Logic Store gehandelt (muessten ergaenzt werden)
>
> **Fehlende Daten im Frontend fuer Live-Anzeige:**
> | Daten | Quelle | Status |
> |-------|--------|--------|
> | Rule-Liste mit Status | `logicApi.getRules()` (REST) | ✅ vorhanden |
> | Rule enabled/disabled | `rule.enabled` (Boolean) | ✅ vorhanden |
> | Letzte Ausfuehrung | `rule.last_triggered` (ISO datetime) | ✅ vorhanden |
> | Execution Count gesamt | `rule.execution_count` (number) | ✅ vorhanden |
> | Last success/fail | `rule.last_execution_success` (boolean\|null) | ✅ vorhanden |
> | 24h-Execution-Count | — | ❌ FEHLT (neuer Endpoint oder Client-Aggregation noetig) |
> | Aktueller Trigger-Wert | sensor_data WS + sensorStore | ⚠️ Verknuepfung muss gebaut werden |
> | Condition-States (x/y gruen) | — | ❌ FEHLT (testRule() koennte missbraucht werden, besser: neuer Endpoint) |
> | Aktor-Laufzeit im Rule-Kontext | actuator_status.runtime_ms | ⚠️ Ohne Rule-Bezug, Mapping noetig |
> | Hysteresis-State | — | ❌ NUR im Server-Memory |
> | Sequence-Progress | sequence_* WS-Events | ⚠️ Events existieren, aber logic.store verarbeitet sie NICHT |
>
> **Widget-Registration in Dashboard-Editor — Mechanismus:**
> `widgetTypes` Array in CustomDashboardView.vue definiert alle Typen. Erweiterung durch:
> ```typescript
> // In widgetTypes Array hinzufuegen:
> { type: 'rule-status', label: 'Regel-Status', icon: Workflow, category: 'Automatisierung', defaultSize: { w: 6, h: 4 } },
> { type: 'rule-timeline', label: 'Regel-Timeline', icon: History, category: 'Automatisierung', defaultSize: { w: 12, h: 3 } },
> { type: 'rule-detail', label: 'Regel-Detail', icon: Zap, category: 'Automatisierung', defaultSize: { w: 4, h: 4 } },
> ```
>
> **Monitor-Integration (aus Erstanalyse):**
> MonitorView Level 1 hat aktuell Zone-Tiles + (geplant) Cross-Zone-Dashboard-Links. Logic Rules muessten als dritter Bereich auf Level 1 erscheinen (nach Zonen, vor Cross-Zone-Dashboards). MonitorView Level 2 zeigt Zone-Detail — hier muessten Zone-gefilterte Rules als Sektion erscheinen.

4. **Anzeigemoeglichkeiten bewerten:**
   - Welche Live-Daten kann das Backend BEREITS liefern?
   - Welche muessen NEU implementiert werden?
   - Was ist performant ueber WebSocket machbar vs. was braucht REST-Polling?
   - Wie sieht die optimale Update-Frequenz aus? (Rule-Status jede Sekunde? Alle 5s?)

> **[verify-plan] Anzeigemoeglichkeiten — Bewertung:**
>
> **BEREITS lieferbar (ohne Backend-Aenderung):**
> - Rule-Liste mit enabled/disabled Status (REST: GET /v1/logic/rules)
> - Execution-History (REST: GET /v1/logic/execution_history mit rule_id + time-range Filter)
> - Live-Execution-Events (WS: logic_execution mit Trigger-Daten + Action + Success)
> - Live-Sensor-Werte (WS: sensor_data — Frontend kann Rule-Conditions gegen aktuelle Werte pruefen)
> - Live-Actuator-Status (WS: actuator_status mit runtime_ms)
> - Rule-Test/Dry-Run (REST: POST /v1/logic/rules/{id}/test — liefert condition_results[])
>
> **NEU zu implementieren (Backend):**
> | Feature | Aufwand | Empfohlener Ansatz |
> |---------|---------|-------------------|
> | 24h-Execution-Count pro Rule | Gering | Neuer REST-Endpoint `GET /v1/logic/rules/stats` mit aggregiertem Count pro Rule |
> | Condition-Live-States | Mittel | Neuer REST-Endpoint `GET /v1/logic/rules/{id}/condition-states` oder testRule() mit current=True |
> | Hysteresis-State-Abruf | Gering | Neuer REST-Endpoint auf HysteresisConditionEvaluator.get_state_for_rule() |
> | Rule-Status-Change WS-Event | Gering | Broadcast in toggle_rule() API-Handler |
> | Prometheus Rule-Metriken | Mittel | 4 neue Metriken in metrics.py (siehe oben) |
> | Structured Logging | Mittel | `extra={}` in logger-Aufrufe der Logic Engine |
>
> **WebSocket vs. REST-Polling:**
> | Datentyp | Empfehlung | Begruendung |
> |----------|-----------|-------------|
> | Rule-Execution-Events | WebSocket ✅ | Bereits implementiert, Event-driven |
> | Rule-Status (enabled/disabled) | WebSocket ✅ | Selten, nur bei Toggle — neues WS-Event |
> | Condition-States | REST-Polling 🔄 5-10s | Zu komplex fuer permanent-WS, aendert sich nicht bei jedem Sensor-Tick |
> | 24h-Counts | REST-Polling 🔄 30-60s | Aggregat, aendert sich langsam |
> | Sequence-Progress | WebSocket ✅ | Bereits implementiert (sequence_* Events) |
>
> **Update-Frequenz-Empfehlung:**
> - Rule-Status-Uebersicht (Monitor L1): Alle 30s REST-Refresh + instant WS fuer execution events
> - Rule-Detail (expanded): Alle 5-10s Condition-State-Polling + Live-WS fuer executions
> - Timeline-Widget: Alle 60s History-Refresh (24h-Fenster)

### Phase 2: Architektur-Entwurf

Basierend auf der Analyse:
- WebSocket-Event-Design fuer Rule-Live-Status
- Backend-API-Erweiterungen fuer Rule-Zone-Mapping und Execution-Detail
- Frontend-Komponenten-Design (Monitor-Integration + Dashboard-Widgets)
- Monitoring-Stack-Erweiterung (Prometheus, Loki, Grafana)

### Phase 3: Implementierung (in Bloecken)

Block-Aufteilung basierend auf der Analyse — wird nach Phase 1+2 definiert.

---

## Abgrenzung

**IN diesem Auftrag:**
- Logic Rules Sichtbarkeit im Monitor-Tab (Ebene 1 + Ebene 2)
- Live-Zustandsanzeige (Trigger-Kontext, Aktor-Laufzeit, Condition-Status)
- Dashboard-Editor-Widgets fuer Logic Rules
- Monitoring-Stack-Integration (Prometheus, Loki, Grafana)
- Backend-API-Erweiterungen fuer Rule-Live-Status

**NICHT in diesem Auftrag:**
- Logic Rules ERSTELLEN oder BEARBEITEN (→ Regeleditor, bleibt wie er ist)
- Logic Rules Editor Polishing (→ `auftrag-logic-rules-editor-polishing.md`)
- Neue Condition-Typen oder Action-Typen (→ Feature-Erweiterung)
- Monitor-Architektur-Grundlagen (→ `auftrag-monitor-komponentenlayout-erstanalyse.md`)
- Dashboard-Editor-internes Polishing (→ `auftrag-dashboard-editor-polishing.md`)
- KI-basierte Anomalie-Erkennung (→ separater Auftrag, Isolation Forest)

---

## Beziehung zu anderen Auftraegen

| Auftrag | Beziehung |
|---------|-----------|
| `auftrag-monitor-komponentenlayout-erstanalyse.md` | VORAUSSETZUNG — Monitor-Architektur muss stehen |
| `auftrag-logic-rules-editor-polishing.md` | VORAUSSETZUNG — Editor muss funktionieren |
| `auftrag-dashboard-editor-polishing.md` | PARALLEL — Widget-System muss fuer neue Widget-Typen bereit sein |
| `auftrag-unified-monitoring-ux.md` | TANGIERT — Alert-System + SystemHealthStore muessen harmonieren |
| ~~`auftrag-loki-debug-flow.md`~~ | ~~TANGIERT~~ — **EXISTIERT NICHT** im Repo |
| ~~`auftrag-logging-verknuepfung-verifikation.md`~~ | ~~TANGIERT~~ — **EXISTIERT NICHT** im Repo |

> **[verify-plan] Pfad-Korrekturen:**
> - `frontend-konsolidierung/auftrag-unified-monitoring-ux.md` → korrekt: `.claude/reports/current/auftrag-unified-monitoring-ux.md` (kein Unterordner)
> - `auftrag-loki-debug-flow.md` → **NICHT VORHANDEN** im Repo. Loki-Debug-Informationen finden sich in `docs/debugging/logql-queries.md` und `docs/debugging/debug-workflow.md`
> - `auftrag-logging-verknuepfung-verifikation.md` → **NICHT VORHANDEN** im Repo. Cross-Layer-Korrelation wird in `.claude/reference/patterns/COMMUNICATION_FLOWS.md` dokumentiert

---

## Wissensgrundlage

> **[verify-plan] Hinweis:** Alle `wissen/` und `architektur-uebersicht.md` Pfade referenzieren das **Life-Repo des TM** (Claude Desktop), NICHT das Auto-One Repo. Diese Dateien sind fuer den ausfuehrenden Agent NICHT zugaenglich.

| Thema | Datei (Life-Repo, extern) | Relevanz |
|-------|---------------------------|----------|
| Logic Engine Architektur | `architektur-uebersicht.md` | Cross-ESP Logic Engine, Safety-System |
| Alert UX | `wissen/iot-automation/unified-alert-center-ux-best-practices.md` | Alert-Lifecycle, Event-Anzeige |
| Dashboard UX | `wissen/iot-automation/iot-dashboard-design-best-practices-2026.md` | Progressive Disclosure, 5-Sekunden-Regel |
| Monitoring Fallstricke | `wissen/iot-automation/iot-monitoring-verifikation-fallstricke-2026.md` | 25 Fallstricke |
| Cognitive Load | `wissen/iot-automation/dashboard-cognitive-load-overview-detail-pattern.md` | Shneiderman-Mantra |
| Logging-Architektur | 6 Recherche-Zusammenfassungen in `wissen/iot-automation/` | ESP32 TAG, Correlation-IDs, Loki Pipeline |
| Realtime UX | `wissen/iot-automation/realtime-dashboard-ux-enduser-forschung.md` | SA-Modell, 7-Sekunden-Regel |

> **[verify-plan] Verfuegbare Referenzen im Auto-One Repo (fuer ausfuehrende Agents):**
>
> | Thema | Pfad (Auto-One) | Relevanz |
> |-------|-----------------|----------|
> | MQTT Topics | `.claude/reference/api/MQTT_TOPICS.md` | Sensor/Actuator Topic-Schema |
> | REST Endpoints | `.claude/reference/api/REST_ENDPOINTS.md` | Logic API: /v1/logic/rules, execution_history |
> | WebSocket Events | `.claude/reference/api/WEBSOCKET_EVENTS.md` | 28 Event-Typen inkl. logic_execution, sequence_* |
> | Architecture | `.claude/reference/patterns/ARCHITECTURE_DEPENDENCIES.md` | Server-zentrische Architektur, Layer-Dependencies |
> | Log Locations | `.claude/reference/debugging/LOG_LOCATIONS.md` | Server-Logs: logs/server/, Loki Pipeline |
> | Docker | `.claude/reference/infrastructure/DOCKER_REFERENCE.md` | Monitoring-Stack: Grafana, Prometheus, Loki, Alloy |
> | Error Codes | `.claude/reference/errors/ERROR_CODES.md` | Logic Engine: 5400-5499 BUSINESS_LOGIC |

---

## Hinweis: Alles ist schon gut vorbereitet

Die Logic Engine funktioniert serverseitig vollstaendig. WebSocket-Events fuer Executions existieren. Der logic.store.ts hat bereits Execution-Tracking. Die Chart-Komponenten sind fertig. Der Dashboard-Editor hat ein Widget-System.

Dieser Auftrag verbindet die vorhandenen Teile zu einem sichtbaren, nutzbaren Monitoring-Erlebnis fuer die Automatisierungslogik.

> **[verify-plan] Realitaets-Check "Alles ist gut vorbereitet":**
>
> | Aussage | Korrekt? | Einschraenkung |
> |---------|----------|----------------|
> | "Logic Engine funktioniert serverseitig vollstaendig" | ✅ Ja | Execution-Pipeline, Safety-System, 4 Condition- + 4 Action-Evaluators, DB-Persistence — alles vorhanden |
> | "WebSocket-Events fuer Executions existieren" | ✅ Ja | `logic_execution` (pro Action) + 5 `sequence_*` Events + `notification` |
> | "logic.store.ts hat bereits Execution-Tracking" | ⚠️ Teilweise | Nur `logic_execution` wird verarbeitet. `sequence_*` und `notification` NICHT. recentExecutions capped bei 20. Kein 24h-Counter |
> | "Chart-Komponenten sind fertig" | ⚠️ Nicht fuer Rules | 6 Chart-Komponenten existieren (LiveLineChart, GaugeChart etc.), aber KEINE davon zeigt Rule-Execution-Daten. Timeline-Chart fuer Rules muss NEU gebaut werden |
> | "Dashboard-Editor hat ein Widget-System" | ✅ Ja, aber... | 9 Widget-Typen — KEINER fuer Logic Rules. Erweiterbar, aber 3 neue Widget-Komponenten + WidgetType-Union + WidgetConfigPanel-Erweiterung noetig |
>
> **Zusammenfassung:** Die Grundlagen sind solide, aber die Verbindung Frontend↔Backend fuer Rule-Monitoring existiert NICHT. Hauptaufwand liegt in:
> 1. **Backend:** 1-2 neue REST-Endpoints (rule-stats, condition-states) + 4 Prometheus-Metriken + Structured Logging
> 2. **Frontend:** Rule-Zone-Mapping-Logik + 3 neue Dashboard-Widgets + Monitor-Integration (L1 + L2) + logic.store Erweiterung (sequence_* Events, 24h-Counter)
> 3. **Monitoring:** 2 neue Grafana-Dashboards + 3 neue Alert-Rules + LogQL-Queries

---

## /verify-plan Ergebnis

**Plan:** Logic Rules Live-Monitoring & Observability-Integration — Cross-Layer (Backend+Frontend+Monitoring)
**Geprueft:** 12 Pfade, 0 Agents, 4 Docker-Services, 8 REST-Endpoints, 7 WS-Events, 9 Widget-Typen, 6 Prometheus-Metriken

### Bestaetigte Punkte

- Logic Engine Backend vollstaendig vorhanden (Execution Pipeline, Safety System, DB Models, REST API)
- WebSocket `logic_execution` Event existiert und wird im Frontend verarbeitet
- logic.store.ts hat grundlegendes Execution-Tracking (activeExecutions, recentExecutions)
- Dashboard-Editor Widget-System ist erweiterbar fuer neue Widget-Typen
- Prometheus-Endpoint existiert unter `/api/v1/health/metrics`
- Grafana Alert `ao-logic-engine-errors` existiert
- REST-API fuer Rules CRUD + Toggle + Test + ExecutionHistory vollstaendig
- LogicExecutionHistory DB-Tabelle mit Zeitreihen-Indizes optimiert

### Korrekturen noetig

**Pfade: 2 referenzierte Auftraege existieren nicht**
- Plan sagt: `auftrag-loki-debug-flow.md`, `auftrag-logging-verknuepfung-verifikation.md`
- System sagt: Beide Dateien existieren NICHT im Repo
- Empfehlung: Referenzen entfernen oder durch vorhandene Docs ersetzen (`docs/debugging/logql-queries.md`, `.claude/reference/patterns/COMMUNICATION_FLOWS.md`)

**Pfade: Unterordner-Referenz falsch**
- Plan sagt: `frontend-konsolidierung/auftrag-unified-monitoring-ux.md`
- System sagt: `.claude/reports/current/auftrag-unified-monitoring-ux.md` (kein Unterordner)

**Frontend: Rule-Zone-Mapping fehlt komplett**
- Plan nimmt an: Rules kennen ihre Zone
- System sagt: Rules referenzieren NUR ESP+GPIO. Zone-Mapping ist reine Frontend-Berechnung (ESP+GPIO → espStore.devices[].zone_id)
- Empfehlung: `getRulesForZone(zoneId)` Funktion in logic.store.ts implementieren

**Frontend: LogicView hat keinen URL-Parameter**
- Plan sagt: "Klick auf Rule → Oeffnet den Regeleditor mit dieser Rule geladen"
- System sagt: Route `/logic` hat KEINEN `:ruleId` Parameter. Rule wird per logicStore State gesetzt, nicht per URL
- Empfehlung: Route erweitern: `/logic/:ruleId?` oder Query-Parameter `?rule=<id>`

**Prometheus: Metriken-Namen stimmen nicht**
- Plan sagt: `logic_rules_total`, `logic_rule_executions_total`, `logic_rule_execution_duration_seconds`
- System sagt: Prefix ist `god_kaiser_*` (z.B. `god_kaiser_logic_errors_total`). Metriken im Plan existieren NICHT
- Empfehlung: Korrekte Namen verwenden: `god_kaiser_logic_rules_total`, `god_kaiser_logic_rule_executions_total`, etc.

### Fehlende Vorbedingungen

- [ ] `auftrag-monitor-komponentenlayout-erstanalyse.md` muss die Monitor-Architektur (L1/L2/L3 mit Zonen) definiert haben — IST-Daten fuer MonitorView bereits im Dokument annotiert
- [ ] `auftrag-logic-rules-editor-polishing.md` muss den Editor funktionsfaehig gemacht haben
- [ ] DashboardLayout Interface muss um `scope`, `zoneId`, `autoGenerated` erweitert werden (Voraussetzung aus Monitor-Erstanalyse)

### Ergaenzungen

- **Hysteresis-State ist Server-only:** Der HysteresisConditionEvaluator speichert State (`is_active`, `last_activation`, `last_value`) NUR im Server-Memory. Fuer "Condition 2/3 gruen" Anzeige muss ein neuer API-Endpoint oder der vorhandene `testRule()` Endpoint genutzt werden
- **Sequence-Events werden im Frontend ignoriert:** logic.store subscribt NUR `logic_execution`. Die 5 `sequence_*` WS-Events werden NICHT verarbeitet. Fuer Sequence-Progress-Anzeige muss der Store erweitert werden
- **24h-Counter fehlt als API:** Kein dedizierter Endpoint fuer aggregierte Execution-Counts. Entweder neuer Endpoint oder Client-seitige Aggregation ueber `getExecutionHistory()` (max 100 records pro Request)
- **Structured Logging fehlt:** Logic Engine loggt ohne rule_id/rule_name Labels. LogQL-Queries auf Loki muessen Freitext matchen. Structured Logging mit `extra={}` Feldern empfohlen

### Zusammenfassung fuer TM

Der Plan ist in seiner Vision korrekt und ambitioniert. Die Backend-Grundlagen sind staerker als der Plan annimmt (4 Condition-Evaluators, 4 Action-Executors, vollstaendiges Safety-System). Die Hauptluecken liegen in der **Verbindung Frontend↔Backend fuer Monitoring** (Rule-Zone-Mapping, Condition-States API, 24h-Counter) und im **Monitoring-Stack** (4 fehlende Prometheus-Metriken, 2 fehlende Grafana-Dashboards, fehlendes Structured Logging). Zwei referenzierte Auftraege existieren nicht und sollten entfernt werden. Der Plan ist nach Korrektur der annotierten Punkte ausfuehrbar.
