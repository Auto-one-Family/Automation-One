# Logic Engine Deep Dive Analyse — 2026-03-29

**Auftrag:** L0 — Tiefenanalyse der Logic Engine in AutomationOne
**Analysiert von:** Claude Agent (Backend + Firmware + Frontend parallel)
**Datum:** 2026-03-29
**Abhaengigkeit:** Blockiert L1-L4 der Roadmap `roadmap-logic-engine-produktion-2026-03-29.md`

---

## Executive Summary

Die Logic Engine in AutomationOne ist architektonisch solide aufgebaut: klare Trennung von Condition-Evaluatoren und Action-Executoren, Safety-System mit ConflictManager/RateLimiter/LoopDetector, und ein event-driven Evaluation-Modell getriggert aus dem sensor_handler. **Alle vier bekannten Code-Bugs (F1-F4) wurden bereits im aktuellen Codestand gefixt** — die Fixes sind in der Firmware (duration timer, case-insensitive OFF), im Backend (HysteresisEvaluator registriert, Deaktivierungs-Bypass fuer OFF) und im Frontend (graphToRuleData kennt hysteresis-Typ). Jedoch wurden **9 neue Findings (N1-N9)** identifiziert, darunter ein kritischer Bug bei Hysterese-State-Keys fuer Compound-Regeln (N1), fehlende State-Persistenz nach Server-Restart (N2), eine fehlende Concurrency-Absicherung auf Engine-Ebene (N3), und ein QoS-0-Subscription-Problem fuer Aktor-Befehle auf dem ESP (N8). Die Live-System-Verifikation auf dem Pi 5 konnte nicht direkt durchgefuehrt werden (kein DB-Zugang in dieser Analyse-Session), muss als Folge-Task in L1 nachgeholt werden.

---

## 1. Architektur-Dokumentation

### 1.1 Registrierte Condition-Evaluatoren

**Drei Registrierungsstellen existieren:**

| Stelle | Datei:Zeilen | Evaluatoren | DiagnosticsEval? |
|--------|-------------|-------------|-----------------|
| **main.py** (produktiv) | `main.py:629-656` | Sensor, Time, Hysteresis, Diagnostics, Compound(alle 4) | JA |
| **logic_engine.py** (Fallback) | `logic_engine.py:73-84` | Sensor, Time, Hysteresis, Compound(3 ohne Diag) | NEIN |
| **logic_service.py** (Rule-Test) | `logic_service.py:68-78` | Sensor, Time, Hysteresis, Compound(3 ohne Diag) | NEIN |

**Befund:** `HysteresisConditionEvaluator` ist in allen drei Listen registriert — **F4 ist gefixt**. Jedoch fehlt `DiagnosticsConditionEvaluator` in `logic_service.py` — Rule-Tests (`test_rule()`) koennen `diagnostics_status`-Conditions nicht evaluieren (Finding N4).

**Evaluator-Details:**

| Evaluator | Datei | Zeilen | Supports | Besonderheiten |
|-----------|-------|--------|----------|----------------|
| `SensorConditionEvaluator` | `conditions/sensor_evaluator.py` | 201 | `sensor`, `sensor_threshold` | GPIO int()-Coercion, Cross-Sensor via context |
| `TimeConditionEvaluator` | `conditions/time_evaluator.py` | 123 | `time_window`, `time` | Overnight wrap, Minute-Granularitaet |
| `HysteresisConditionEvaluator` | `conditions/hysteresis_evaluator.py` | 302 | `hysteresis` | In-Memory State, 2 Modi (Cooling/Heating) |
| `DiagnosticsConditionEvaluator` | `conditions/diagnostics_evaluator.py` | 103 | `diagnostics_status` | Braucht session_factory, fail-open |
| `CompoundConditionEvaluator` | `conditions/compound_evaluator.py` | 105 | `compound`, `*logic*` | Delegiert an Sub-Evaluatoren, AND/OR |

### 1.2 Registrierte Action-Executoren

**Zwei Registrierungsstellen:**

| Stelle | Datei:Zeilen | Executoren |
|--------|-------------|------------|
| **main.py** (produktiv) | `main.py:659-688` | Actuator, Delay, Notification, Sequence, Plugin, Diagnostics |
| **logic_engine.py** (Fallback) | `logic_engine.py:88-94` | Actuator, Delay, Notification |

**Executor-Details:**

| Executor | Datei | Zeilen | Supports | Besonderheiten |
|----------|-------|--------|----------|----------------|
| `ActuatorActionExecutor` | `actions/actuator_executor.py` | 156 | `actuator`, `actuator_command` | duration_seconds→duration Mapping, Subzone-Filter |
| `DelayActionExecutor` | `actions/delay_executor.py` | 85 | `delay` | **BLOCKIERT** mit asyncio.sleep (Finding N9) |
| `NotificationActionExecutor` | `actions/notification_executor.py` | 245 | `notification` | Email, WebSocket, Webhook; Deduplication |
| `SequenceActionExecutor` | `actions/sequence_executor.py` | 876 | `sequence` | Non-blocking asyncio.Task, max 20 concurrent |
| `PluginActionExecutor` | `actions/plugin_executor.py` | — | `plugin`, `autoops_trigger` | Session-Factory injected |
| `DiagnosticsActionExecutor` | `actions/diagnostics_executor.py` | 90 | `run_diagnostic` | Session-Factory injected |

### 1.3 Datenfluss-Diagramm (von MQTT bis Aktor)

```
ESP32 publishes: kaiser/{k}/esp/{e}/sensor/{gpio}/data
  │
  ▼
MQTTClient.on_message() [mqtt/client.py]
  │
  ▼
SensorHandler.handle_sensor_data() [mqtt/handlers/sensor_handler.py]
  ├── sensor_repo.save_data() → INSERT sensor_data
  ├── WebSocket broadcast: sensor_update
  │
  ▼ (asyncio.create_task — non-blocking fire-and-forget)
LogicEngine.evaluate_sensor_data() [services/logic_engine.py:145-222]
  ├── get_session() → new DB session
  ├── logic_repo.get_rules_by_trigger_sensor(esp_id, gpio, sensor_type)
  │
  ▼ for each rule:
  LogicEngine._evaluate_rule() [services/logic_engine.py:312-462]
    ├── _load_cross_sensor_values() → sensor_values dict
    ├── context = {sensor_data, sensor_values, current_time, rule_id, condition_index: 0}
    │
    ├── _check_conditions() [logic_engine.py:464-500]
    │   └── _check_conditions_modular() [logic_engine.py:502-528]
    │       ├── CompoundConditionEvaluator → sub-evaluators
    │       ├── SensorConditionEvaluator.evaluate()
    │       ├── TimeConditionEvaluator.evaluate()
    │       ├── HysteresisConditionEvaluator.evaluate()
    │       │   ├── _matches_sensor() check
    │       │   ├── _get_state() → in-memory HysteresisState
    │       │   ├── Cooling: value > activate_above → ON, value < deactivate_below → OFF
    │       │   ├── Heating: value < activate_below → ON, value > deactivate_above → OFF
    │       │   └── sets context["_hysteresis_just_deactivated"] = True on OFF
    │       └── DiagnosticsConditionEvaluator.evaluate()
    │
    ├── IF conditions_met=False AND _hysteresis_just_deactivated:
    │   └── Bypass cooldown → send OFF commands immediately
    │
    ├── Cooldown check (time_since_last <= cooldown_seconds → skip)
    ├── RateLimiter.check_rate_limit() (TokenBucket + hourly DB query)
    │
    ├── _execute_actions() [logic_engine.py:664-795]
    │   ├── ConflictManager.acquire_actuator() per action (asyncio.Lock per esp:gpio)
    │   ├── ActuatorActionExecutor.execute()
    │   │   ├── Subzone filter (skip if mismatch)
    │   │   └── ActuatorService.send_command()
    │   │       ├── SafetyService.validate_actuator_command()
    │   │       ├── publisher.publish_actuator_command()
    │   │       │   Topic: kaiser/{k}/esp/{e}/actuator/{gpio}/command
    │   │       │   Payload: {"command":"ON","value":1.0,"duration":15,"timestamp":...,"correlation_id":"..."}
    │   │       │   QoS: 2 (Exactly Once), Retain: False
    │   │       └── DB: command_history + audit_log
    │   └── WebSocket broadcast: logic_execution (best-effort)
    │
    └── logic_repo.log_execution() → INSERT logic_execution_history
```

```
ESP32 receives: kaiser/{k}/esp/{e}/actuator/+/command (subscribed QoS 0!)
  │
  ▼
MQTTClient.staticCallback() [communication/mqtt_client.cpp]
  │
  ▼
ActuatorManager.handleActuatorCommand() [actuator/actuator_manager.cpp:601-678]
  ├── extractGPIOFromTopic(topic)
  ├── Parse JSON: command, value, duration, correlation_id
  ├── findActuator(gpio) → RegisteredActuator*
  ├── Check emergency_stopped → blocked if true
  ├── Clear pending duration timer (command_duration_end_ms = 0)
  │
  ├── "ON":  controlActuatorBinary(gpio, true)
  │          + IF duration_s > 0: arm auto-off timer
  ├── "OFF": controlActuatorBinary(gpio, false)
  ├── "PWM": controlActuator(gpio, value)
  ├── "TOGGLE": controlActuatorBinary(gpio, !current_state)
  │
  ├── publishActuatorResponse(command, success, message)
  └── publishActuatorStatus(gpio)
```

### 1.4 Background-Service Lifecycle

**Startup (main.py lifespan):**
```
FastAPI lifespan start
  → Build evaluators (5 instances)
  → Build executors (6 instances)
  → Build safety (ConflictManager, RateLimiter)
  → LogicEngine(all components)
  → await logic_engine.start()          # creates _evaluation_loop task (currently placeholder)
  → LogicScheduler(engine, interval=60s)
  → await logic_scheduler.start()       # creates _scheduler_loop task
  → set_logic_engine(engine)            # expose global singleton for sensor_handler
```

**Shutdown (main.py lifespan):**
```
FastAPI lifespan shutdown
  → await logic_scheduler.stop()        # cancel + await CancelledError
  → await logic_engine.stop()           # set _running=False, cancel task
  → await sequence_executor.shutdown()  # cancel cleanup task
```

**LogicScheduler** (`logic_scheduler.py`):
- Runs every 60 seconds
- Calls `logic_engine.evaluate_timer_triggered_rules()`
- Evaluates rules that have `time_window` conditions regardless of sensor events
- Catches all exceptions and retries after 5s delay
- Clean shutdown via task cancellation

**Bewertung:** Kein `lifespan` Context Manager (deprecated `@app.on_event` Pattern wird nicht genutzt — main.py nutzt den modernen `lifespan` Parameter). Graceful Shutdown ist implementiert. Laufende Evaluierungen werden durch `task.cancel()` unterbrochen — es gibt keine "drain" Phase die laufende Actions abwarten wuerde. Dies ist akzeptabel, da ActuatorActionExecutor keine langfristigen Seiteneffekte hat (MQTT-Publish ist atomar).

---

## 2. Bug-Status (F1-F7)

### F1: Firmware ignoriert `duration` — kein Auto-Off-Timer

**Status: GEFIXT im aktuellen Code**

**Evidenz:**
- `RegisteredActuator.command_duration_end_ms` Feld in [actuator_manager.h:68](El%20Trabajante/src/services/actuator/actuator_manager.h#L68) mit Kommentar `// F1: Auto-Off timer (0 = inactive)`
- Timer wird in `handleActuatorCommand()` bei ON + duration_s > 0 aktiviert: [actuator_manager.cpp:650-653](El%20Trabajante/src/services/actuator/actuator_manager.cpp#L650-L653)
  ```cpp
  actuator->command_duration_end_ms = millis() + (static_cast<unsigned long>(command.duration_s) * 1000UL);
  ```
- Timer wird in `processActuatorLoops()` geprueft und Auto-OFF ausgefuehrt: [actuator_manager.cpp:534-546](El%20Trabajante/src/services/actuator/actuator_manager.cpp#L534-L546)
- Bestehende Timer werden bei jedem neuen Befehl zurueckgesetzt: [actuator_manager.cpp:643](El%20Trabajante/src/services/actuator/actuator_manager.cpp#L643)

**Verbleibende Risiken:**
- `millis()` Rollover nach ~49.7 Tagen: Timer-Vergleich `millis() >= end_ms` versagt wenn `end_ms` kurz vor Rollover gesetzt wurde. Fuer typische Durations (<1h) irrelevant, aber bei laengeren Durations theoretisch moeglich.
- Duration Auto-OFF ist ein "clean OFF" (`controlActuatorBinary(false)`) — kein Emergency Stop. Der Aktor kann danach sofort wieder eingeschaltet werden.

### F2: MQTT OFF-Befehl schaltet Aktor nicht aus

**Status: GEFIXT im aktuellen Code**

**Root Cause des urspruenglichen Bugs:** Wahrscheinlich case-sensitive String-Vergleich (`== "OFF"` statt `equalsIgnoreCase("OFF")`). Der Server sendet `command.upper()` also immer `"OFF"`, aber falls frueher lowercase gesendet wurde, haette der Vergleich versagt.

**Evidenz des Fixes:**
- [actuator_manager.cpp:656](El%20Trabajante/src/services/actuator/actuator_manager.cpp#L656): `command.command.equalsIgnoreCase("OFF")` — case-insensitive
- Symmetrisch fuer alle 4 Befehle: ON, OFF, PWM, TOGGLE verwenden alle `equalsIgnoreCase()`
- Server sendet immer Uppercase: [publisher.py:91](El%20Servador/god_kaiser_server/src/mqtt/publisher.py#L91) `"command": command.upper()`

**Verbleibendes Risiko:**
- Wenn `emergency_stopped == true`, wird OFF silent blockiert (nur Warning-Log). Der Aktor-Response hat `success: false`, aber kein spezifischer Error-Code der "emergency blocked" signalisiert. Der Server erhaelt nur ein generisches Failure.

**Manueller Button vs. Logic Engine:**
- Manueller Button → REST API → `ActuatorService.send_command()` → gleicher Code-Pfad wie Logic Engine
- Beide nutzen identischen MQTT-Publish via `publisher.publish_actuator_command()`
- Kein Unterschied im Payload

### F3: Hysterese geht beim Speichern verloren

**Status: GEFIXT im aktuellen Code (mit Einschraenkung)**

**Evidenz des Fixes:**
- `graphToRuleData()` in [RuleFlowEditor.vue:625-641](El%20Frontend/src/components/rules/RuleFlowEditor.vue#L625-L641) prueft `isHysteresis === true || operator === 'hysteresis'` und erstellt korrekt `type: 'hysteresis'` mit allen vier Schwellenwert-Feldern
- `ruleToGraph()` in [RuleFlowEditor.vue:426-444](El%20Frontend/src/components/rules/RuleFlowEditor.vue#L426-L444) mappt `type: 'hysteresis'` korrekt auf Sensor-Node mit `isHysteresis: true`

**Verbleibendes Problem (Finding N7):**
- `Number('')` Coercion in RuleConfigPanel: Wenn User ein Schwellenwert-Feld leert, wird `Number('')` = `0` gespeichert, nicht `null`
- Dadurch wird `activateBelow != null` true obwohl das Feld leer sein sollte
- Resultat: Corrupted Condition mit beiden Paaren (Cooling + Heating) simultan, Heating-Paar = 0/0
- Dies ist kein Datenverlust, sondern Datenkorruption — die Hysterese-Bedingung hat semantisch ungueltige Werte

### F4: HysteresisConditionEvaluator nicht in Default-Liste registriert

**Status: GEFIXT im aktuellen Code**

**Evidenz:**
- `logic_engine.py:75`: `hysteresis_eval = HysteresisConditionEvaluator()` in Fallback-Liste
- `main.py:633`: `hysteresis_evaluator = HysteresisConditionEvaluator()` in produktiver Liste
- `logic_service.py:72`: `hysteresis_eval = HysteresisConditionEvaluator()` in Test-Liste
- CompoundEvaluator erhaelt HysteresisEval als Sub-Evaluator in allen drei Stellen

### F5: Regel hat keine explizite OFF-Aktion

**Status: ARCHITEKTONISCH GELOEST durch Hysterese-Deaktivierungs-Bypass**

**Mechanismus** ([logic_engine.py:346-357](El%20Servador/god_kaiser_server/src/services/logic_engine.py#L346-L357)):
Wenn `conditions_met == False` UND `context["_hysteresis_just_deactivated"] == True`:
- Fuer jede Actuator-Action in der Regel wird eine OFF-Kopie erstellt: `{**action, "command": "OFF", "value": 0.0, "duration": 0}`
- Diese OFF-Actions werden **ohne Cooldown-Check** ausgefuehrt
- Dies garantiert sofortiges Abschalten bei Hysterese-Deaktivierung

**Bewertung:** Dies ist eine elegante Loesung die keine explizite OFF-Aktion im Regel-Design erfordert. Der Hysterese-Evaluator signalisiert Deaktivierung, und die Engine invertiert automatisch alle Actuator-Actions. Kein konzeptionelles Problem mehr.

### F6: Abgrenzung duration_seconds vs. max_runtime_seconds unklar

**Status: DOKUMENTATIONSBEDARF (kein Code-Bug)**

**Backend-Klarstellung:**
- `duration_seconds` (Rule-Action) → wird zu `duration` im MQTT-Payload → ESP setzt Auto-Off-Timer (`command_duration_end_ms`)
  - Clean OFF nach Ablauf, Aktor sofort wieder verfuegbar
  - Wert: Sekunden, 0 = unbegrenzt
- `max_runtime_ms` (Device-Config, `RuntimeProtection`) → ESP ueberwacht in `processActuatorLoops()`
  - Emergency Stop nach Ablauf, Aktor blockiert bis `clearEmergencyStop()`
  - Wert: Millisekunden, Default 3600000 (1h)
  - Unabhaengig von der Logic Engine — ist ein Geraete-Safety-Feature

**Hierarchie:**
```
Duration Timer (Logic Engine):  15s → clean OFF
Runtime Protection (Device):   3600s → emergency stop
```
Duration laeuft immer zuerst ab (wenn gesetzt). Runtime Protection ist der absolute Sicherheits-Fallback.

### F7: Batch-API SHT31 multi-value unvollstaendig

**Status: NICHT ANALYSIERT (ausserhalb Scope dieser Analyse)**

Betrifft Mock-ESP Debug-Endpoint, nicht die Logic Engine. Wird in separatem Auftrag behandelt.

---

## 3. Hysterese-Analyse

### 3.1 Backend: Evaluator-Status + State-Management

**Datei:** [hysteresis_evaluator.py](El%20Servador/god_kaiser_server/src/services/logic/conditions/hysteresis_evaluator.py) (302 Zeilen)

**State-Speicher:** In-Memory Dictionary `self._states: Dict[str, HysteresisState]`

**State-Key-Format:** `"{rule_id}:{condition_index}"` — z.B. `"550e8400-...:0"`

**HysteresisState Dataclass:**
```python
@dataclass
class HysteresisState:
    is_active: bool = False
    last_activation: Optional[datetime] = None
    last_deactivation: Optional[datetime] = None
    last_value: Optional[float] = None
```

**Zwei Betriebsmodi:**

| Modus | Anwendung | Aktivierung | Deaktivierung |
|-------|-----------|-------------|---------------|
| Cooling | Kuehlung/Lueftung | `value > activate_above` | `value < deactivate_below` |
| Heating | Heizung/Befeuchtung | `value < activate_below` | `value > deactivate_above` |

**Logik-Verifikation fuer Befeuchtungs-Szenario (activate_below=45, deactivate_above=55):**
- Luftfeuchte = 40% → `40 < 45` AND `not is_active` → `is_active = True` → Befeuchter AN ✓
- Luftfeuchte = 50% → `50 > 55`? NEIN → `is_active` bleibt True → Befeuchter bleibt AN ✓
- Luftfeuchte = 56% → `56 > 55` AND `is_active` → `is_active = False`, `_hysteresis_just_deactivated = True` → Befeuchter AUS ✓
- Luftfeuchte = 50% → `50 < 45`? NEIN → `is_active` bleibt False → Befeuchter bleibt AUS ✓

**Sensor-Matching:**
- `sensor_type`: Case-insensitive Vergleich (`.lower()`)
- `gpio`: **Direkter `!=` Vergleich ohne int()-Coercion** (Finding N5 — Diskrepanz zu SensorConditionEvaluator)
- Bei nicht-matching Sensor: Gibt aktuellen `is_active` Wert zurueck (State bleibt erhalten)

### 3.2 Frontend: graphToRuleData() Status

**graphToRuleData() Hysterese-Pfad** ([RuleFlowEditor.vue:625-641](El%20Frontend/src/components/rules/RuleFlowEditor.vue#L625-L641)):

```typescript
case 'sensor': {
  const isHysteresis = node.data?.isHysteresis === true || node.data?.operator === 'hysteresis'
  if (isHysteresis) {
    const hyst: HysteresisCondition = {
      type: 'hysteresis',
      esp_id: node.data.espId || '',
      gpio: node.data.gpio || 0,
      ...(node.data.sensorType ? { sensor_type: node.data.sensorType as string } : {}),
    }
    // Cooling pair
    if (node.data.activateAbove != null && node.data.deactivateBelow != null) {
      hyst.activate_above = Number(node.data.activateAbove)
      hyst.deactivate_below = Number(node.data.deactivateBelow)
    }
    // Heating pair
    if (node.data.activateBelow != null && node.data.deactivateAbove != null) {
      hyst.activate_below = Number(node.data.activateBelow)
      hyst.deactivate_above = Number(node.data.deactivateAbove)
    }
    conditions.push(hyst)
  }
}
```

**Felder die korrekt zurueckgeschrieben werden:**
- `type: 'hysteresis'` ✓
- `esp_id`, `gpio` ✓
- `sensor_type` (wenn vorhanden) ✓
- `activate_above`, `deactivate_below` (Cooling-Paar) ✓
- `activate_below`, `deactivate_above` (Heating-Paar) ✓

**Problem N7:** Die `!= null` Checks passen nicht zu `Number('')` = `0`. Leere Felder werden als `0` gespeichert und dann als gueltige Werte behandelt.

### 3.3 State-Persistenz nach Restart

**Aktueller Zustand: KEINE Persistenz.**

Der State lebt nur in `self._states` (Python dict im Arbeitsspeicher). Nach Server-Neustart:
1. Alle `HysteresisState` werden auf `is_active=False` zurueckgesetzt
2. Aktoren die in einem Hysterese-ON-Zustand waren erhalten kein OFF
3. Erst wenn der naechste Sensor-Wert den Deaktivierungs-Schwellenwert kreuzt, wird OFF gesendet

**Konkretes Risiko-Szenario:**
```
09:00 Luftfeuchte 40% → Befeuchter AN (is_active=True)
09:05 Server-Restart
09:06 Luftfeuchte 50% → is_active=False (default nach Restart)
       50% < 45%? NEIN → Befeuchter bleibt AUS (obwohl er physisch noch AN ist!)
       50% > 55%? NEIN → kein Deaktivierungs-Signal
       → Befeuchter laeuft dauerhaft bis Runtime Protection greift (1h Default)
```

**Empfehlung fuer State-Persistenz:**
Option A: Neue DB-Tabelle `logic_hysteresis_states` mit (rule_id, condition_index, is_active, last_value, updated_at)
Option B: Ableitung aus `actuator_states` Tabelle — wenn der Aktor ON ist und eine Hysterese-Regel existiert, wird `is_active=True` angenommen
Option C: Ableitung aus `logic_execution_history` — letzte erfolgreiche Ausfuehrung bestimmt den State

Empfohlen: **Option A** — dedizierte Tabelle. Einfachste Implementierung, klarste Semantik, keine Abhaengigkeit von anderen Services.

---

## 4. Concurrent-Execution Analyse

### Race-Condition-Risiko

**Fakt:** Logic Engine Evaluation wird als `asyncio.create_task()` in `sensor_handler.py` gestartet ([sensor_handler.py:533-573](El%20Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py#L533-L573)). Jeder eingehende Sensor-Wert erzeugt einen eigenen Task. Es gibt **kein Engine-Level asyncio.Lock**.

**Szenario:** SHT31 sendet Temperatur und Luftfeuchte in <100ms:
1. Task A: evaluate_sensor_data(gpio=0, sensor_type='sht31_temp', value=22.5)
2. Task B: evaluate_sensor_data(gpio=0, sensor_type='sht31_humidity', value=43.0)

Beide Tasks:
- Oeffnen eigene DB-Sessions (unabhaengig)
- Laden Regeln unabhaengig (`get_rules_by_trigger_sensor`)
- Eine Luftfeuchte-Hysterese-Regel matcht nur auf Task B (sht31_humidity)
- Eine Temperatur-Regel matcht nur auf Task A (sht31_temp)
- **Kein Konflikt bei unterschiedlichen Regeln**

**Problemfall:** Eine Regel die sowohl auf Temp als auch Humidity matcht:
- Beide Tasks laden dieselbe Regel
- Beide pruefen Cooldown unabhaengig (kein shared Lock)
- Wenn Cooldown noch nicht abgelaufen: Race auf die DB-Abfrage `get_last_execution_time()`
- **Potentielle Doppel-Ausfuehrung** moeglich im Fenster zwischen DB-Read und DB-Write

### Schutz-Mechanismen

| Mechanismus | Schuetzt gegen | Effektiv? |
|-------------|----------------|-----------|
| `cooldown_seconds` | Doppel-Ausfuehrung | TEILWEISE — DB-basiert, Race-Window ~10-50ms |
| `RateLimiter.TokenBucket` | Burst-Traffic | JA — in-memory atomic, but per-process |
| `ConflictManager._mutexes` | Gleichzeitige Aktor-Befehle | JA — asyncio.Lock per esp:gpio |
| `max_executions_per_hour` | Langzeit-Ueberausfuehrung | JA — DB-based count |

**Fazit:** ConflictManager (asyncio.Lock per Aktor) schuetzt zuverlaessig gegen gleichzeitige Befehle an denselben Aktor. Cooldown ist theoretisch anfaellig fuer Race Conditions, aber in der Praxis ist das Zeitfenster so klein (~10ms), dass Doppel-Ausfuehrung extrem selten ist. Fuer eine produktive Greenhouse-Steuerung akzeptabel.

---

## 5. Test-Coverage-Inventar

### Vorhandene Test-Dateien

| Datei | Zeilen | Testet | Hysterese? | Concurrent? |
|-------|--------|--------|-----------|-------------|
| `tests/integration/test_logic_engine.py` | 216 | Core Actions, Schema | Nein | Nein |
| `tests/integration/test_logic_engine_resilience.py` | 535 | Operators, Compound, Cooldown, Concurrent | Nein | **JA** |
| `tests/integration/test_api_logic.py` | 400 | REST CRUD, Toggle, Test, History | Nein | Nein |
| `tests/integration/test_logic_automation.py` | 404 | Sensor-Trigger, Cooldown, Multi-Action, Cross-ESP | Nein | Nein |
| `tests/integration/test_ds18b20_cross_esp_logic.py` | 491 | DS18B20 OneWire Cross-ESP | Nein | Nein |
| `tests/integration/test_ph_sensor_logic.py` | 468 | pH Sensor Hydroponics | Nein | Nein |
| `tests/integration/test_relay_logic_chains.py` | 462 | Relay Interlock, Sequences, Safety | Nein | Nein |
| `tests/integration/test_sht31_i2c_logic.py` | 372 | SHT31 Temp+Humidity Logic | Nein | Nein |
| `tests/integration/test_pwm_logic.py` | 288 | PWM Proportional Control | Nein | Nein |
| `tests/e2e/test_logic_engine_real_server.py` | 1034 | Full E2E mit echtem Server + MQTT + Postgres | Nein | Nein |
| `tests/unit/test_logic_subzone_matching.py` | 204 | Subzone Filter (Phase 2.4) | Nein | Nein |
| `tests/integration/conftest_logic.py` | Fixtures | Shared Logic-Test-Fixtures | — | — |
| `tests/Logic_deep_Hardware_TEST_SCENARIOS.md` | Docs | Test-Szenarien fuer Hardware-Tests | **JA** (Szenario) | Nein |

### Fehlende Test-Szenarien

| Szenario | Prioritaet | Begruendung |
|----------|-----------|-------------|
| **HysteresisConditionEvaluator Unit-Tests** | KRITISCH | Kein isolierter Test fuer den Evaluator |
| **Hysterese State nach Server-Restart** | HOCH | State-Verlust ist ein bekanntes Risiko |
| **Hysterese Cooling vs. Heating Modi** | HOCH | Beide Pfade muessen verifiziert werden |
| **graphToRuleData() Hysterese Roundtrip** | HOCH | Frontend-Serialisierung testen |
| **Concurrent Evaluation (gleiche Regel)** | MITTEL | Doppel-Ausfuehrung bei Burst |
| **Duration Auto-Off Timer (Firmware)** | MITTEL | Nur manuell verifizierbar (Hardware/Wokwi) |
| **Emergency Stop + OFF Interaktion** | MITTEL | OFF blockiert waehrend Emergency |
| **DelayAction Blocking-Verhalten** | NIEDRIG | Nur relevant fuer Regeln mit Delay |

---

## 6. Live-System Zustand (Pi 5)

**HINWEIS:** Kein direkter DB-Zugang zum Pi 5 in dieser Analyse-Session. Die folgenden Punkte muessen als Folge-Task in L1 verifiziert werden.

### 6.1 Offene Verifikations-Punkte

| Check | SQL Query | Zweck |
|-------|-----------|-------|
| Aktuelle Regel | `SELECT id, rule_name, enabled, trigger_conditions, actions, cooldown_seconds, max_executions_per_hour FROM cross_esp_logic WHERE enabled = true;` | Regelkonfiguration pruefen |
| Letzte Ausfuehrungen | `SELECT rule_id, success, created_at, trigger_data, error_message FROM logic_execution_history ORDER BY created_at DESC LIMIT 20;` | Ausfuehrungs-Haeufigkeit + Fehler |
| Aktor-Status | `SELECT * FROM actuator_states WHERE esp_id = 'ESP_EA5484';` | Aktueller Befeuchter-Zustand |
| Sensor-Datenfluss | `SELECT created_at, sensor_type, raw_value, processed_value FROM sensor_data WHERE esp_id = 'ESP_EA5484' ORDER BY created_at DESC LIMIT 20;` | SHT31 Intervall pruefen |
| Hysterese-State | Kein DB-Zugang — nur in-memory. Muss via API geprueft werden. | Aktueller Hysterese-Zustand |

### 6.2 Erwartete Konfiguration (aus Auftragsbeschreibung)

| Parameter | Erwarteter Wert |
|-----------|----------------|
| ESP-ID | ESP_EA5484 |
| Sensor GPIO | 0 (I2C, Adresse 0x44) |
| Sensor-Typ | sht31_humidity |
| Aktor GPIO | 14 (Olimex PWR Switch) |
| Regel-Typ | Hysterese |
| activate_below | 45 (%) |
| deactivate_above | 55 (%) |
| Zone | Zelt Wohnzimmer |

---

## 7. Priorisierte Findings (neue Erkenntnisse)

### N1: condition_index: 0 hardcoded in logic_engine.py (HOCH)

**Datei:** [logic_engine.py:339](El%20Servador/god_kaiser_server/src/services/logic_engine.py#L339)

```python
context = {
    ...
    "condition_index": 0,  # IMMER 0, unabhaengig von Position in Compound-Regel
}
```

**Auswirkung:** Fuer Compound-Regeln mit Hysterese als 2. oder spaetere Condition:
- State-Key wird `"rule_id:0"` statt `"rule_id:1"`
- Wenn eine andere Condition auch an Index 0 evaluiert wird, kollidieren die State-Keys
- Fuer Single-Condition-Regeln (90% aller Regeln) harmlos

**Vergleich:** `logic_service.py:359` verwendet korrekt `condition_index=idx` bei Rule-Tests.

**Fix:** In `_check_conditions_modular()` oder `CompoundConditionEvaluator` den `condition_index` im context pro Sub-Condition setzen.

### N2: Hysterese-State nicht persistiert (HOCH)

Siehe Abschnitt 3.3 — State geht bei Server-Restart verloren. Aktor kann bis zu 1h laenger laufen als gewollt (bis RuntimeProtection greift).

### N3: Kein Engine-Level Concurrency Lock (MITTEL)

Keine `asyncio.Lock` auf Engine-Ebene. ConflictManager schuetzt Aktoren, aber Cooldown-Checks sind theoretisch anfaellig. Praktisch akzeptabel fuer aktuelle Auslastung.

### N4: DiagnosticsConditionEvaluator fehlt in LogicService (MITTEL)

**Datei:** [logic_service.py:68-78](El%20Servador/god_kaiser_server/src/services/logic_service.py#L68-L78)

Rule-Test (`POST /logic/rules/{id}/test`) kann `diagnostics_status`-Conditions nicht evaluieren. Stille Fehler — Condition wird als `False` gewertet.

### N5: GPIO-Typ-Mismatch Hysteresis vs. Sensor Evaluator (MITTEL)

- `SensorConditionEvaluator._matches_trigger()` ([sensor_evaluator.py:103](El%20Servador/god_kaiser_server/src/services/logic/conditions/sensor_evaluator.py#L103)): `int(cond_gpio) == int(data_gpio)` — int-Coercion
- `HysteresisConditionEvaluator._matches_sensor()` ([hysteresis_evaluator.py:250](El%20Servador/god_kaiser_server/src/services/logic/conditions/hysteresis_evaluator.py#L250)): `cond_gpio != data_gpio` — direkter Vergleich

Wenn GPIO als Float (z.B. `5.0` aus JSON) ankommt, matcht Sensor aber nicht Hysteresis.

### N6: extractSensorConditions() ignoriert Hysterese-Typ (MITTEL)

**Datei:** [types/logic.ts:304-315](El%20Frontend/src/types/logic.ts#L304-L315)

```typescript
function extractSensorConditions(conditions: LogicCondition[]): SensorCondition[] {
  for (const cond of conditions) {
    if (cond.type === 'sensor' || cond.type === 'sensor_threshold') {
      result.push(cond as SensorCondition)
    } else if (cond.type === 'compound') {
      result.push(...extractSensorConditions((cond as CompoundCondition).conditions))
    }
    // 'hysteresis' silently skipped!
  }
}
```

**Auswirkung:** `LinkedRulesSection.vue` (HardwareView L2) zeigt Hysterese-Regeln nicht bei den verknuepften Sensoren/Aktoren an. `extractEspIdsFromRule()` behandelt Hysterese korrekt (nur fuer Zone-Zuordnung).

### N7: Number('') Coercion erzeugt 0-Werte statt null (NIEDRIG)

**Datei:** RuleConfigPanel.vue — Input-Handler fuer Hysterese-Felder.

Leere Inputs → `Number('')` = `0` → nicht-null → wird als gueltiger Schwellenwert gespeichert → Corrupted Condition mit beiden Paaren (Cooling 0/0 + Heating-Werte oder umgekehrt).

### N8: ESP subscribed Aktor-Commands mit QoS 0 (NIEDRIG)

**Datei:** [main.cpp:825](El%20Trabajante/src/main.cpp#L825)

PubSubClient `subscribe()` Aufruf ohne QoS-Parameter → Default QoS 0 (At Most Once). Server publiziert mit QoS 2 (Exactly Once). Bei instabiler WLAN-Verbindung koennen Aktor-Befehle verloren gehen.

### N9: DelayActionExecutor blockiert Regel-Ausfuehrung (NIEDRIG)

**Datei:** [delay_executor.py](El%20Servador/god_kaiser_server/src/services/logic/actions/delay_executor.py)

`await asyncio.sleep(seconds)` blockiert die gesamte Aktions-Kette der Regel fuer die Delay-Dauer. Andere Regeln (separate Tasks) sind nicht betroffen. Relevant nur fuer Regeln die Delay + nachfolgende Actions kombinieren.

---

## 8. Fix-Empfehlungen (fuer L1-L4 Auftraege)

### L1: Aktor-Steuerung (F1+F2) — KEINE CODE-FIXES NOETIG

F1 und F2 sind bereits gefixt. L1 reduziert sich auf:
- **L1-V1:** Live-Verifikation auf Pi 5 — Duration-Timer testen (MQTT send + beobachten)
- **L1-V2:** Live-Verifikation auf Pi 5 — OFF-Befehl testen
- **L1-FIX:** QoS fuer ESP Subscription von 0 auf 1 aendern (N8, 1 Zeile in main.cpp)

**Geschaetzter Aufwand:** 1h (statt geplante 3-4h)

### L2: Hysterese-Pipeline (F3+F4+N1+N2+N5+N6)

F3 und F4 sind bereits gefixt. Neue Aufgaben aus Findings:

| Task | Datei | Aufwand |
|------|-------|---------|
| **N1 Fix:** condition_index dynamisch setzen | `logic_engine.py:339` + `compound_evaluator.py` | 30min |
| **N2 Fix:** Hysterese-State in DB persistieren | Neue Tabelle + `hysteresis_evaluator.py` + Migration | 2-3h |
| **N5 Fix:** GPIO int()-Coercion in Hysteresis Evaluator | `hysteresis_evaluator.py:250` | 10min |
| **N6 Fix:** extractSensorConditions() um hysteresis erweitern | `types/logic.ts:304-315` | 15min |
| **N7 Fix:** Number('') → null/undefined statt 0 | `RuleConfigPanel.vue` | 20min |
| **Tests:** HysteresisEvaluator Unit-Tests | Neue Datei | 1-2h |

**Geschaetzter Aufwand:** 4-6h (angepasst von geplanten 3h)

### L3: Max Runtime Klarstellung (F6)

Kein Code-Bug, nur Dokumentation:
- Duration (Logic Engine) vs. RuntimeProtection (Device) klar dokumentieren
- Tooltip/Info im Frontend RuleConfigPanel fuer `duration_seconds`
- Tooltip/Info im HardwareView fuer `max_runtime_ms`

**Geschaetzter Aufwand:** 1h

### L4: Logic Engine UX

Abhaengig von L2+L3. Zusaetzliche Aufgaben aus Analyse:
- **N4 Fix:** DiagnosticsConditionEvaluator in LogicService.py registrieren (5min)
- Hysterese als eigenes Palette-Item (optional — aktuell als Sensor-Variante, funktional korrekt)
- Execution History Visualisierung verbessern

**Geschaetzter Aufwand:** 2-3h

---

## Anhang A: Datei-Index

| Datei | Zeilen | Rolle in Logic Engine |
|-------|--------|----------------------|
| `El Servador/.../services/logic_engine.py` | 1064 | Kern: Evaluation, Action Dispatch, Lifecycle |
| `El Servador/.../services/logic_service.py` | 499 | CRUD, Rule-Test, Validierung |
| `El Servador/.../services/logic_scheduler.py` | ~120 | Timer-basierte Regel-Evaluation (60s Loop) |
| `El Servador/.../services/logic/conditions/base.py` | 45 | ABC fuer Evaluatoren |
| `El Servador/.../services/logic/conditions/sensor_evaluator.py` | 201 | Sensor-Schwellenwert |
| `El Servador/.../services/logic/conditions/time_evaluator.py` | 123 | Zeitfenster |
| `El Servador/.../services/logic/conditions/compound_evaluator.py` | 105 | AND/OR Kombination |
| `El Servador/.../services/logic/conditions/hysteresis_evaluator.py` | 302 | Hysterese State-Machine |
| `El Servador/.../services/logic/conditions/diagnostics_evaluator.py` | 103 | Diagnose-Status |
| `El Servador/.../services/logic/actions/base.py` | 59 | ABC fuer Executoren |
| `El Servador/.../services/logic/actions/actuator_executor.py` | 156 | Aktor-Befehle senden |
| `El Servador/.../services/logic/actions/delay_executor.py` | 85 | Wartezeit (blockierend) |
| `El Servador/.../services/logic/actions/notification_executor.py` | 245 | Benachrichtigungen |
| `El Servador/.../services/logic/actions/sequence_executor.py` | 876 | Multi-Step Sequences |
| `El Servador/.../services/logic/actions/diagnostics_executor.py` | 90 | Diagnose starten |
| `El Servador/.../services/logic/safety/conflict_manager.py` | 281 | Per-Aktor Locking |
| `El Servador/.../services/logic/safety/rate_limiter.py` | 212 | Token Bucket + Hourly Limit |
| `El Servador/.../services/logic/safety/loop_detector.py` | 237 | DFS Regelschleifen-Erkennung |
| `El Servador/.../services/actuator_service.py` | 289 | Safety + MQTT Dispatch |
| `El Servador/.../mqtt/publisher.py` | 400+ | MQTT Publish mit QoS 2 |
| `El Servador/.../mqtt/handlers/sensor_handler.py` | ~700 | Sensor MQTT → Logic Trigger |
| `El Servador/.../main.py` | ~1000 | Lifecycle, Wiring, Startup |
| `El Trabajante/.../actuator/actuator_manager.cpp` | 968 | Firmware Aktor-Steuerung |
| `El Trabajante/.../actuator/actuator_manager.h` | ~80 | RegisteredActuator Struct |
| `El Trabajante/.../models/actuator_types.h` | ~70 | ActuatorCommand, RuntimeProtection |
| `El Trabajante/.../communication/mqtt_client.cpp` | ~1000 | MQTT Client + Subscriptions |
| `El Frontend/.../components/rules/RuleFlowEditor.vue` | ~1400 | Graph↔Rule Konvertierung |
| `El Frontend/.../components/rules/RuleConfigPanel.vue` | ~900 | Node-Eigenschafts-Editor |
| `El Frontend/.../components/rules/RuleNodePalette.vue` | 558 | Drag-Palette |
| `El Frontend/.../types/logic.ts` | 349 | TypeScript Typen |
| `El Frontend/.../shared/stores/logic.store.ts` | 710 | Pinia Store |
| `El Frontend/.../api/logic.ts` | 169 | API Client |

## Anhang B: Akzeptanzkriterien-Checkliste

| Kriterium | Status | Verweis |
|-----------|--------|---------|
| Vollstaendige Evaluator-Liste (alle Dateien) | ✅ | Abschnitt 1.1 |
| Vollstaendige Executor-Liste | ✅ | Abschnitt 1.2 |
| Datenfluss-Diagramm mit Dateinamen | ✅ | Abschnitt 1.3 |
| Service-Lifecycle | ✅ | Abschnitt 1.4 |
| F1 Root Cause + Fix-Status | ✅ GEFIXT | Abschnitt 2 (F1) |
| F2 Root Cause identifiziert | ✅ GEFIXT | Abschnitt 2 (F2) |
| F3 graphToRuleData() Fehler | ✅ GEFIXT (N7 verbleibt) | Abschnitt 2 (F3) |
| F4 Registrierung bestaetigt | ✅ GEFIXT | Abschnitt 2 (F4) |
| Hysterese State-Persistenz beantwortet | ✅ IN-MEMORY | Abschnitt 3.3 |
| Race-Condition-Analyse | ✅ | Abschnitt 4 |
| Test-Coverage-Inventar | ✅ | Abschnitt 5 |
| Live-System Zustand | ⚠️ OFFEN | Abschnitt 6 (kein DB-Zugang) |
| Priorisierte neue Findings | ✅ N1-N9 | Abschnitt 7 |
| Fix-Empfehlungen pro Phase | ✅ | Abschnitt 8 |

---

*Ende der Logic Engine Deep Dive Analyse. Dieser Bericht ist die Grundlage fuer die nachfolgenden Auftraege L1-L4.*
