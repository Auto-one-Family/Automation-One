# Logic Engine — Vollständige IST-Analyse + Monitor-Integration + Darstellungs-Optimierung

> **Erstellt:** 2026-03-06  
> **Typ:** Analyse (kein Code, nur Bericht)  
> **Priorität:** HOCH — Grundlage für Phase 2.4 Subzone-Matching + UX-Optimierung  
> **Quelle:** auto-one Repo (El Frontend + El Servador)

---

## Block 1: Backend — Logic Engine Architektur

### 1.1 Services und Module

| Aspekt | Details |
|--------|---------|
| **Datei** | `El Servador/god_kaiser_server/src/services/logic_engine.py` |
| **Hauptklasse** | `LogicEngine` |
| **Hauptfunktionen** | `evaluate_sensor_data()`, `evaluate_timer_triggered_rules()`, `_evaluate_rule()`, `_execute_actions()`, `_check_conditions()`, `_load_cross_sensor_values()` |
| **Aufruf** | `sensor_handler.py` (Zeilen 447–468): Nach erfolgreichem `sensor_data` INSERT und WebSocket-Broadcast wird `evaluate_sensor_data()` per `asyncio.create_task()` non-blocking aufgerufen |
| **Globale Instanz** | `get_logic_engine()` / `set_logic_engine()` — gesetzt in `main.py` beim Startup |

**trigger_data Payload (Phase 0.1):**

```python
# logic_engine.py Zeilen 181–189
trigger_data = {
    "esp_id": esp_id,
    "gpio": gpio,
    "sensor_type": sensor_type,
    "value": value,
    "timestamp": int(time.time()),
    "zone_id": zone_id,      # Phase 0.1
    "subzone_id": subzone_id, # Phase 0.1
}
```

`sensor_handler.py` übergibt `zone_id` und `subzone_id` aus dem Sensor-Context (Zeilen 437–439).

---

### 1.2 Condition-Evaluatoren

| Evaluator | Datei | Unterstützte Typen | Verwendung in LogicEngine |
|-----------|-------|-------------------|---------------------------|
| **SensorConditionEvaluator** | `logic/conditions/sensor_evaluator.py` | `sensor_threshold`, `sensor` | ✅ Standard |
| **TimeConditionEvaluator** | `logic/conditions/time_evaluator.py` | `time_window`, `time` | ✅ Standard |
| **CompoundConditionEvaluator** | `logic/conditions/compound_evaluator.py` | `logic` + `conditions` | ✅ Standard |
| **HysteresisConditionEvaluator** | `logic/conditions/hysteresis_evaluator.py` | `hysteresis` | ❌ **NICHT in Default-Liste** |
| **DiagnosticsConditionEvaluator** | `logic/conditions/diagnostics_evaluator.py` | `diagnostics_status` | ❌ **NICHT in Default-Liste** |

**LogicEngine Default (Zeilen 72–77):**

```python
sensor_eval = SensorConditionEvaluator()
time_eval = TimeConditionEvaluator()
compound_eval = CompoundConditionEvaluator([sensor_eval, time_eval])
self.condition_evaluators = [sensor_eval, time_eval, compound_eval]
```

**SensorConditionEvaluator — genutzte Felder aus trigger_data/context:**

- `sensor_data.esp_id`, `gpio`, `sensor_type`, `value`
- **Keine zone_id/subzone_id Prüfung** — diese Felder werden aktuell nicht ausgewertet

**JSON-Schema trigger_conditions:**

- Einzelne Bedingung: `{"type": "sensor", "esp_id": "...", "gpio": 34, "operator": ">", "value": 25, "sensor_type": "..."}`
- Compound: `{"logic": "AND"|"OR", "conditions": [...]}`
- Zeit: `{"type": "time_window", "start_hour": 8, "end_hour": 18, "days_of_week": [0..6]}`

---

### 1.3 Action-Executoren

| Executor | Datei | Unterstützte Typen | Verwendung in LogicEngine |
|----------|-------|-------------------|---------------------------|
| **ActuatorActionExecutor** | `logic/actions/actuator_executor.py` | `actuator_command`, `actuator` | ✅ Standard |
| **NotificationActionExecutor** | `logic/actions/notification_executor.py` | `notification` | ✅ Standard |
| **DelayActionExecutor** | `logic/actions/delay_executor.py` | `delay` | ✅ Standard |
| **SequenceActionExecutor** | `logic/actions/sequence_executor.py` | `sequence` | ❌ **NICHT in Default-Liste** |
| **DiagnosticsActionExecutor** | `logic/actions/diagnostics_executor.py` | `run_diagnostic` | ❌ **NICHT in Default-Liste** |
| **PluginExecutor** | `logic/actions/plugin_executor.py` | `plugin`, `autoops_trigger` | ❌ **NICHT in Default-Liste** |

**ActuatorActionExecutor — Daten:**

- `esp_id`, `gpio`, `command`, `value`, `duration` / `duration_seconds`
- **Keine subzone_id** — Aktor-Subzone kommt aktuell nicht aus der Action; müsste über Lookup (actuator_configs / subzone_configs) ergänzt werden

---

### 1.4 Safety-System

| Komponente | Datei | Einbindung |
|-------------|-------|------------|
| **ConflictManager** | `logic/safety/conflict_manager.py` | Vor jeder Actuator-Action: `acquire_actuator()`; nach Batch: `release_actuator()` |
| **RateLimiter** | `logic/safety/rate_limiter.py` | In `_evaluate_rule()` vor Condition-Check: `check_rate_limit(rule_id, rule_max_per_hour, target_esp_ids)` |
| **LoopDetector** | `logic/safety/loop_detector.py` | Wird in `logic/validator.py` bei Rule Create/Update aufgerufen (`check_new_rule`) — nicht in LogicEngine zur Laufzeit |

---

### 1.5 REST-API

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/v1/logic/rules` | GET | List rules (pagination, `enabled` filter) |
| `/api/v1/logic/rules` | POST | Create rule |
| `/api/v1/logic/rules/{rule_id}` | GET | Get rule |
| `/api/v1/logic/rules/{rule_id}` | PUT | Update rule |
| `/api/v1/logic/rules/{rule_id}` | DELETE | Delete rule |
| `/api/v1/logic/rules/{rule_id}/toggle` | POST | Enable/disable |
| `/api/v1/logic/rules/{rule_id}/test` | POST | Simulate execution |
| `/api/v1/logic/execution_history` | GET | Query history (rule_id, success, start_time, end_time, limit) |

**LogicRuleResponse Felder:** `id`, `name`, `description`, `conditions`, `actions`, `logic_operator`, `enabled`, `priority`, `cooldown_seconds`, `max_executions_per_hour`, `last_triggered`, `execution_count`, `last_execution_success`, `created_at`, `updated_at`

---

### 1.6 WebSocket-Events

| Event | Verwendung | Payload |
|-------|-------------|---------|
| **logic_execution** | ✅ Genutzt | `rule_id`, `rule_name`, `trigger`, `action`, `success`, `message`, `timestamp` |
| **sequence_started** | ✅ Existiert (SequenceExecutor) | Sequence-Lifecycle |
| **sequence_step** | ✅ Existiert | Step Progress |
| **sequence_completed** | ✅ Existiert | Sequence Ende |
| **sequence_error** | ✅ Existiert | Sequence Fehler |
| **sequence_cancelled** | ✅ Existiert | Sequence Abbruch |

**Hinweis:** `sequence_*` Events werden vom `SequenceActionExecutor` gesendet; dieser ist **nicht** in der Standard-LogicEngine-Executor-Liste. `logic_execution` wird pro Action einmal gesendet.

---

### 1.7 DB-Modelle

**CrossESPLogic** (`db/models/logic.py`):

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| id | UUID | PK |
| rule_name | String(100) | Unique |
| description | Text | Optional |
| enabled | Boolean | Default True |
| trigger_conditions | JSON | Conditions (dict oder list) |
| logic_operator | String(3) | AND/OR |
| actions | JSON | Actions-Liste |
| priority | Integer | Default 100 |
| cooldown_seconds | Integer | Optional |
| max_executions_per_hour | Integer | Optional |
| last_triggered | DateTime | Optional |
| rule_metadata | JSON | Optional |

**LogicExecutionHistory**:

| Spalte | Typ |
|--------|-----|
| id | UUID |
| logic_rule_id | UUID (FK) |
| trigger_data | JSON |
| actions_executed | JSON |
| success | Boolean |
| error_message | String(500) |
| execution_time_ms | Integer |
| timestamp | DateTime(tz) |
| execution_metadata | JSON |

---

## Block 2: Frontend — Logic-UI Architektur

### 2.1 LogicView.vue

| Aspekt | Details |
|--------|---------|
| **Zeilen** | ~1320 |
| **Struktur** | Landing-Page (Regelliste + Templates) vs. Editor (RuleFlowEditor + RuleNodePalette + RuleConfigPanel) |
| **Route** | `/logic` (name: `logic`), `/logic/:ruleId` (name: `logic-rule`) |
| **Child-Komponenten** | RuleFlowEditor, RuleNodePalette, RuleConfigPanel, RuleTemplateCard, RuleCard |
| **Layout** | Toolbar oben; Content: entweder Empty/Landing (RuleCards + Templates) oder Editor (Palette | Canvas | ConfigPanel) |
| **Execution History** | Collapsible Bottom-Panel, Filter nach Regel + Status |

---

### 2.2 RuleCard.vue

| Aspekt | Details |
|--------|---------|
| **Zeilen** | ~290 |
| **Props** | `rule`, `isSelected`, `isActive?`, `executionCount?` |
| **Darstellung** | Status-Dot (aktiv/deaktiviert/Fehler), Name, Status-Label (Aktiv/Deaktiviert/Fehler), Flow-Badges (Sensor → Operator → Action), Footer (letzte Ausführung, Count) |
| **Interaktion** | Klick → `select` (Editor öffnen); Toggle-Button auf Dot; Delete-Button (hover) |
| **Chips/Badges** | `rule-card__badge--sensor` (sensor_type + operator value), `rule-card__badge--operator` (AND/OR), `rule-card__badge--action` (command oder "Benachrichtigung") |
| **Design** | `var(--color-accent)`, `var(--color-status-success)`, `var(--glass-border)` |

---

### 2.3 RuleFlowEditor.vue

| Aspekt | Details |
|--------|---------|
| **Framework** | Vue Flow (@vue-flow/core) |
| **Node-Typen** | sensor, time, logic, actuator, notification, delay, plugin, diagnostics_status, run_diagnostic |
| **Serialisierung** | `ruleToGraph(rule)` → nodes/edges; `graphToRuleData()` → `{ conditions, actions, logic_operator }` |
| **Palette** | RuleNodePalette (separate Komponente) |

---

### 2.4 RuleConfigPanel.vue

| Aspekt | Details |
|--------|---------|
| **Öffnung** | Bei Node-Selektion (`selectedNode`) |
| **Sektionen** | Pro Node-Typ: sensor (ESP, GPIO, sensorType, operator, value, min/max), time (startHour, endHour, daysOfWeek), logic (operator), actuator (ESP, GPIO, command, value, duration), notification (channel, target, messageTemplate), delay (seconds), plugin (pluginId, config) |

---

### 2.5 logic.store.ts

| State | Beschreibung |
|-------|--------------|
| rules | LogicRule[] |
| isLoading, error | |
| activeExecutions | Map<ruleId, timestamp> — für 2s Glow nach Execution |
| recentExecutions | LogicExecutionEvent[] (letzte 20) |
| executionHistory | ExecutionHistoryItem[] (REST + WebSocket merge) |
| historyLoaded, isLoadingHistory | |

| Computed | Beschreibung |
|----------|--------------|
| connections | extractConnections über alle rules |
| crossEspConnections | connections mit isCrossEsp |
| enabledRules | rules.filter(enabled) |
| ruleCount, enabledCount | |

| WebSocket | `logic_execution` — handleLogicExecutionEvent: activeExecutions setzen, recentExecutions, executionHistory merge, rule.last_triggered/execution_count/last_execution_success aktualisieren |
| API | logicApi: getRules, getRule, createRule, updateRule, deleteRule, toggleRule, getExecutionHistory |

| Funktion | Beschreibung |
|----------|--------------|
| getRulesForZone(zoneId) | **Implementiert 2026-03-06.** Filtert Regeln nach Zone via extractEspIdsFromRule + espStore.devices.zone_id. Sortierung: priority, name. |

---

### 2.6 types/logic.ts

| Interface | Felder |
|-----------|--------|
| LogicRule | id, name, description, enabled, conditions, logic_operator, actions, priority, cooldown_seconds, max_executions_per_hour, last_triggered, execution_count, last_execution_success, created_at, updated_at |
| SensorCondition | type, esp_id, gpio, sensor_type, operator, value, min?, max? |
| TimeCondition | type, start_hour, end_hour, days_of_week? |
| HysteresisCondition | type, esp_id, gpio, sensor_type?, activate_above?, deactivate_below?, … |
| ActuatorAction | type, esp_id, gpio, command, value?, duration? |
| LogicConnection | ruleId, ruleName, ruleDescription, sourceEspId, sourceGpio, sourceSensorType, targetEspId, targetGpio, targetCommand, enabled, priority, isCrossEsp |

**Helper:** `extractConnections(rule)` — erstellt LogicConnection[] aus SensorConditions + ActuatorActions; `extractSensorConditions` (intern) — rekursiv SensorConditions aus conditions; `extractEspIdsFromRule(rule)` — Set aller ESP-IDs aus Conditions (Sensor, Hysteresis) + ActuatorActions (für Zone-Filterung); `generateRuleDescription(condition, action)` — human-readable String.

---

## Block 3: Darstellung der Regeln — Chips, Badges, Cards

### 3.1 Wo werden Regeln als Chips/Badges dargestellt?

| Ort | Komponente | Darstellung |
|-----|------------|-------------|
| **LogicView Landing** | RuleCard | Card mit Flow-Badges (Sensor → Operator → Action), Status-Dot, Footer |
| **SensorConfigPanel** | LinkedRulesSection | Regel-Name, ruleDescription, Badge (Aktiv/Inaktiv), Cross-ESP Badge |
| **ActuatorConfigPanel** | LinkedRulesSection | Gleich |
| **DeviceDetailPanel** | LinkedRulesSection | Gleich |
| **Monitor L1** | — | **Keine** Logic-Rule-Anzeige (nur Platzhalter-Kommentar) |
| **Monitor L2** | ZoneRulesSection | RuleCardCompact — Sektion "Regeln für diese Zone (N)"; Klick → /logic/:ruleId; Bei >10: nur 5 + Link; Fehler-Rand (border-left) bei last_execution_success=false (2026-03-06) |
| **Dashboard-Widgets** | — | **Kein** Widget-Typ für Logic Rules (nur esp-health, alarm-list, multi-sensor, actuator-runtime, …) |

### 3.2 Chip/Badge-Struktur (RuleCard)

- **rule-card__badge--sensor:** sensor_type + optional `operator value`
- **rule-card__badge--operator:** AND/OR
- **rule-card__badge--action:** command (ON/OFF/PWM) oder "Benachrichtigung"
- **Farben:** tokens.css (--color-accent, --color-status-success, --color-text-muted)
- **Überladung:** Aktuell kompakt; nur erste Sensor-Bedingung + erste Aktion sichtbar

### 3.3 Templates

- **Config:** `src/config/rule-templates.ts`
- **Templates:** Temperatur-Alarm, Bewässerungs-Zeitplan, Luftfeuchte-Regelung, Nacht-Modus, pH-Alarm, Notfall-Abschaltung
- **Anzeige:** LogicView Landing, Sektion "Vorlagen & Schnellstart" (collapsible, unter "Meine Regeln")
- **"3 REGELN VORHANDEN"** — nicht als eigene Card; Regelanzahl im Dropdown-Header: "X Regeln (Y aktiv)"

---

## Block 4: Monitor-Tab — Logic Rules Integration (IST)

### 4.1 Level 1 (/monitor)

- **Existiert:** Zone-Tiles, **Aktive Automatisierungen (N)** (ActiveAutomationsSection, 2026-03-06), "Dashboards (N)"-Karte, Inline-Panels
- **Logic Rules:** **ActiveAutomationsSection** — logicStore.enabledRules, Top 5 RuleCardCompact mit Zone-Badge (getZonesForRule), Link "Alle Regeln" → /logic; Empty State bei 0 Regeln

### 4.2 Level 2 (/monitor/:zoneId)

- **Existiert:** Sensoren (Subzone-Accordion), Aktoren, **Regeln für diese Zone** (ZoneRulesSection), Zone-Dashboards, Inline-Panels
- **Logic Rules:** **ZoneRulesSection** (2026-03-06 implementiert) — nutzt logicStore.getRulesForZone(zoneId); RuleCardCompact pro Regel; Klick → /logic/:ruleId; Bei >10 Regeln: erste 5 + Link "Im Regeln-Tab anzeigen"; Fehler-Rand (border-left) bei RuleCardCompact
- **LinkedRulesSection:** Wird in SensorConfigPanel und ActuatorConfigPanel verwendet — diese Panels erscheinen im SlideOver/Detail-Kontext (L3), nicht als eigene L2-Sektion

### 4.3 Level 3 (SlideOver, DashboardViewer)

- **Sensor-Detail / Aktor-Detail:** LinkedRulesSection zeigt verknüpfte Regeln; Klick → `router.push({ name: 'logic-rule', params: { ruleId } })`
- **Dashboard-Widgets:** Kein Widget-Typ für Logic Rules (rule-status, rule-timeline, rule-detail sind geplant, aber nicht implementiert)

### 4.4 Datenfluss

- **logic.store:** ZoneRulesSection nutzt getRulesForZone(zoneId); ActiveAutomationsSection nutzt getZonesForRule(rule) für Zone-Badge.
- **Rule-Zone-Mapping:** `getRulesForZone(zoneId)` und `getZonesForRule(rule)` **implementiert 2026-03-06** — nutzt extractEspIdsFromRule + espStore.devices.zone_id/zone_name. L2 ZoneRulesSection nutzt getRulesForZone; L1 ActiveAutomationsSection nutzt getZonesForRule.

---

## Block 5: UX-Prinzipien und Gamification (SOLL)

### 5.1 Aus iot-dashboard-ux-gamification-laien-2026-03-06.md (Referenz)

- **5-Sekunden-Regel:** "Ist alles OK?" in 5 Sekunden
- **Gamification:** Fortschritts-Indikatoren, visuelle Belohnungen, klare Status-Feedback
- **"Seems Fine" vermeiden:** Kein stiller Fehler — klare Warnung bei Abweichung
- **Kontrollen neben Werten:** Steuerung direkt neben Anzeige
- **Progressive Disclosure:** Overview first, Zoom and filter, Details on demand

### 5.2 Anwendung auf Logic Rules

- **Overview:** Welche Regeln laufen? Welche haben Fehler? — aktuell nur in LogicView Landing sichtbar
- **Kein Scrollen für Primär-Info:** RuleCard zeigt Status, letzte Aktivität, Count — above the fold in LogicView
- **Computerspiel:** RuleCard hat Glow bei `isActive`; Status-Dot, Badges — visuell ansprechend

### 5.3 Lücken

| Lücke | Beschreibung |
|------|--------------|
| **Monitor-Integration** | L2 ZoneRulesSection implementiert (2026-03-06); L1 ActiveAutomationsSection implementiert (2026-03-06) |
| **Zone-Kontext** | "Regeln für diese Zone" auf L2 implementiert (ZoneRulesSection); L1 Zone-Badge via getZonesForRule |
| **getRulesForZone** | Implementiert 2026-03-06 — Zone-Filterung verfügbar |
| **Dashboard-Widget** | Kein Logic-Rules-Widget für Custom Dashboards |
| **Fehler-Sichtbarkeit** | last_execution_success wird in RuleCard angezeigt (Fehler-Icon), aber nicht prominent im Monitor |

---

## Block 6: Phase 2.4 — Subzone-Matching (Implementiert 2026-03-06)

### 6.1 Anforderung

- Condition: "Sensor in Subzone X" UND "Aktor bedient Subzone X"
- trigger_data: Enthält bereits `zone_id`, `subzone_id` (Phase 0.1)
- **Aktor-Subzone:** Kommt aus `subzone_configs.assigned_gpios` — SubzoneRepository.get_subzone_by_gpio(esp_id, gpio)

### 6.2 Condition-Schema

- **SensorCondition:** Optionales `subzone_id` — Prüfung: `trigger_data.subzone_id == condition.subzone_id`. Ohne subzone_id: Rückwärtskompatibel.

### 6.3 Action-Schema

- **ActuatorAction:** Hat esp_id, gpio. Aktor-Subzone wird zur Laufzeit via SubzoneRepository.get_subzone_by_gpio ermittelt. Bei trigger_data.subzone_id: Action wird übersprungen, wenn Aktor andere Subzone bedient.

### 6.4 Implementierte Änderungen (Phase 2.4)

| Bereich | Status |
|---------|--------|
| **SensorConditionEvaluator** | Prüfung: falls condition.subzone_id gesetzt, dann trigger_data.subzone_id == condition.subzone_id |
| **Condition-Schema (API/DB)** | SensorCondition + SensorThresholdCondition um optionales `subzone_id` erweitert |
| **ActuatorActionExecutor** | SubzoneRepository-Lookup vor Execute; Skip bei Subzone-Mismatch |
| **LogicEngine** | session an _execute_actions übergeben für Subzone-Lookup |

---

## Block 7: Priorisierte Empfehlungen

### 7.1 Darstellungs-Optimierung (Chips, RuleCards)

| Empfehlung | Begründung |
|------------|------------|
| **RuleCard beibehalten** | Robin mag die UI; Flow-Badges sind klar |
| **Zone-Badge optional** | Wenn getRulesForZone existiert: Zone-Name als kleiner Badge für Kontext |
| **Fehler prominenter** | Bei last_execution_success=false: leicht hervorgehobener Rand (bereits rule-card--error) — ggf. Tooltip mit Fehlermeldung |
| **Design-System** | tokens.css konsequent nutzen; keine neuen Hardcodes |

### 7.2 Monitor-Integration

| Ebene | Empfehlung |
|-------|------------|
| **L1** | Sektion "Aktive Automatisierungen" — kompakte Liste aktivierter Regeln mit Status-Dot, Name, letzte Ausführung; Platzierung: nach Zone-Tiles, vor Dashboards |
| **L2** | Sektion "Regeln für diese Zone" — nur Regeln, die Sensoren/Aktoren in dieser Zone referenzieren; Accordion oder Karte |
| **L3** | LinkedRulesSection beibehalten; ggf. RuleCard-Mini-Variante statt nur Link |

### 7.3 Ebene und Hierarchie

| Ebene | Inhalt | Vermeidung Überladung |
|-------|--------|------------------------|
| **L1** | Anzahl aktiver Regeln, 1–3 kompakte Chips "Top-Regeln" oder Link "Alle Regeln" | Keine Vollständige Liste |
| **L2** | Vollständige "Regeln für diese Zone" | Nur Zone-relevante |
| **L3** | LinkedRulesSection bei Sensor/Aktor-Detail | On Demand |

### 7.4 Implementierungs-Reihenfolge

1. ~~**getRulesForZone(zoneId)** in logic.store.ts~~ — **ERLEDIGT 2026-03-06**
2. ~~**Monitor L2: "Regeln für diese Zone"**~~ — **ERLEDIGT 2026-03-06** (ZoneRulesSection, RuleCardCompact)
3. ~~**Monitor L1: Kompakte "Aktive Automatisierungen"**~~ — **ERLEDIGT 2026-03-06** (ActiveAutomationsSection, getZonesForRule, Zone-Badge)
4. **Phase 2.4 Subzone-Matching** — Schema-Erweiterungen, Condition/Evaluator
5. **Chip-Optimierung** — optional, nach Monitor-Integration
6. **Dashboard-Widget für Logic Rules** — optional, für Custom Dashboards

---

## Anhang: Code-Referenzen

| Thema | Datei | Zeilen |
|-------|-------|--------|
| evaluate_sensor_data Aufruf | sensor_handler.py | 447–468 |
| trigger_data mit zone_id/subzone_id | logic_engine.py | 181–189 |
| Condition-Evaluatoren Default | logic_engine.py | 72–77 |
| Action-Executoren Default | logic_engine.py | 82–86 |
| logic_execution WebSocket | logic_engine.py | 698–706 |
| RuleCard Badges | RuleCard.vue | 154–169 |
| LinkedRulesSection Nutzung | SensorConfigPanel, ActuatorConfigPanel, DeviceDetailPanel | — |
| ZoneRulesSection | components/monitor/ZoneRulesSection.vue | — |
| ActiveAutomationsSection | components/monitor/ActiveAutomationsSection.vue | — |
| RuleCardCompact | components/logic/RuleCardCompact.vue | — |
| extractConnections | types/logic.ts | 213–245 |
| extractEspIdsFromRule | types/logic.ts | 265–295 |
| getRulesForZone | shared/stores/logic.store.ts | — |
| getZonesForRule | shared/stores/logic.store.ts | — |

---

*Bericht erstellt durch IST-Analyse des auto-one Repos. Keine Spekulationen ohne Kennzeichnung.*
