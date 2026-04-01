# Fixauftrag ED-3 — Aktor-Steuerung & Logic-Rules-Integration

**Ziel-Repo:** auto-one (El Servador + El Frontend + El Trabajante)
**Typ:** Code-Fixes (Backend + Frontend + Firmware) + Tests
**Prioritaet:** HIGH
**Datum:** 2026-03-30
**Geschaetzter Aufwand:** ~10-14h gesamt (Bloecke A-D)
**Roadmap:** `roadmap-editor-dashboard-integration-2026-03-30.md` Block C
**Abhaengigkeit:** L1 (QoS Fix, Verifikation) + L2 (Hysterese-Haertung) empfohlen aber nicht blockierend

---

## Kontext & Einordnung

AutomationOne ist ein 3-schichtiges IoT-Framework:

- **El Trabajante (ESP32, C++):** Liest Sensoren, steuert Aktoren. Firmware empfaengt Aktor-Befehle per MQTT und fuehrt sie aus. Logic Engine laeuft NICHT auf dem ESP — der ESP ist reiner Executor.
- **El Servador (FastAPI, Python):** Cross-ESP Logic Engine als Background-Service. Empfaengt Sensor-Daten per MQTT, wertet Regeln (cross_esp_logic-Tabelle) aus, sendet Aktor-Befehle per MQTT zurueck.
- **El Frontend (Vue 3, TypeScript):** Dashboard mit Rule-Builder (LogicView), Monitor (Zonen-Kacheln), Editor (Widget-Dashboard).

Eine Deep-Dive-Analyse (LOGIC_ENGINE_DEEPDIVE_ANALYSE_2026-03-29.md) hat 9 neue Findings (N1-N9) identifiziert. Die Fixes F1-F5 fuer bekannte Bugs sind bereits implementiert. Dieser Auftrag adressiert N1-N9 in 4 logischen Bloecken.

**Abgrenzung zu bestehenden Auftraegen:**
- Auftrag L1 (`auftrag-L1-live-verifikation-qos-fix-2026-03-29.md`) deckt **N8 (QoS Fix)** ab — hier nochmals dokumentiert als Block C, aber L1 hat Vorrang.
- Auftrag L2 (`auftrag-L2-hysterese-haertung-2026-03-29.md`) deckt **N1, N2, N5, N6, N7 und Tests** ab — vollstaendig.
- Dieser Auftrag schreibt ED-3 als eigenstaendigen, vollstaendigen Fix-Block-Katalog der alle N1-N9 ausformuliert. Wenn L1/L2 bereits umgesetzt sind, koennen die betreffenden Bloecke uebersprungen werden.

---

## Block A — Backend Logic Engine Core (~5-7h)

**Betrifft:** N1, N2, N3 (dokumentiert), N4, N5, N9 (dokumentiert)

### A1: condition_index hardcoded auf 0 (N1 — HOCH) `[KORREKTUR: BEREITS IMPLEMENTIERT — compound_evaluator.py:67-69 setzt bereits sub_context = {**context, "condition_index": idx} pro Sub-Condition. Block überspringen.]`

**Datei:** `El Servador/god_kaiser_server/src/services/logic_engine.py` (~Zeile 339)

**IST:** In `_evaluate_rule()` wird der Evaluation-Kontext mit `context["condition_index"] = 0` erstellt — immer, unabhaengig von der Position der Condition in einer Compound-Regel.

```python
# IST — logic_engine.py:339
context = {
    "sensor_data": ...,
    "sensor_values": ...,
    "current_time": ...,
    "rule_id": rule_id,
    "condition_index": 0   # PROBLEM: immer 0, auch bei Compound-Regeln
}
```

Der `HysteresisConditionEvaluator` nutzt `context["condition_index"]` als Teil des State-Keys: `"{rule_id}:{condition_index}"`. Bei einer Compound-Regel mit zwei Hysterese-Conditions (z.B. AND-Verknuepfung von Temperatur-Hysterese + Feuchte-Hysterese) verwenden beide den Key `"<uuid>:0"` — State-Kollision.

Im `CompoundConditionEvaluator` (`conditions/compound_evaluator.py`) werden Sub-Conditions mit Index iteriert, aber der `condition_index` im Context wird nie aktualisiert.

Zum Vergleich: `logic_service.py:359` macht es fuer Test-Evaluierungen korrekt mit `condition_index=idx`.

**SOLL:** Der `condition_index` muss im Context pro Sub-Condition des `CompoundConditionEvaluator` gesetzt werden.

**Fix-Strategie:** Im `CompoundConditionEvaluator._evaluate_compound()` vor jedem Sub-Evaluator-Aufruf den Context aktualisieren:

```python
# SOLL — compound_evaluator.py (ungefaehr)
for idx, sub_condition in enumerate(conditions):
    sub_context = {**context, "condition_index": idx}
    result = evaluator.evaluate(sub_condition, sensor_data, sub_context)
    ...
```

Alternativ: In `_check_conditions_modular()` in `logic_engine.py` den Index direkt beim Delegieren setzen, falls Compound schon der Einzel-Evaluator-Aufruf ist.

**Akzeptanzkriterien:**
- [ ] Compound-Regel mit 2 Hysterese-Conditions (AND) verwendet Keys `rule_id:0` und `rule_id:1`
- [ ] States kollidieren nicht — beide Conditions koennen unabhaengige State-Maschinen haben
- [ ] Unit-Test: Compound-Regel mit Hysterese an Position 1 und Position 2 — beide States unabhaengig

---

### A2: Hysterese-State nicht persistiert (N2 — HOCH)

**Datei (neu):** `El Servador/god_kaiser_server/src/db/models/hysteresis.py` (neue Datei)
**Datei (neu):** `El Servador/god_kaiser_server/alembic/versions/<rev>_add_logic_hysteresis_states.py`
**Datei:** `El Servador/god_kaiser_server/src/services/logic/conditions/hysteresis_evaluator.py`

**IST:** Der `HysteresisConditionEvaluator` speichert alle States in einem In-Memory Dict `self._states: Dict[str, HysteresisState]`. Bei Server-Neustart (systemd restart, Docker restart, Crash) werden alle States zurueck auf `is_active=False` gesetzt.

**Konkretes Problem:** Befeuchter laeuft (is_active=True, Feuchte=50%). Server-Neustart. State = False (Reset). Neue Sensor-Daten kommen: Feuchte=50%. 50% liegt im Deadband zwischen `activate_below=45` und `deactivate_above=55`. Weder Aktivierungs- noch Deaktivierungs-Schwelle wird getriggert. Ergebnis: Befeuchter bleibt physisch AN (ESP-Zustand unveraendert), aber Logic Engine denkt er ist AUS. Befeuchter laeuft weiter bis RuntimeProtection greift (Default: 1 Stunde = 3.600.000ms).

```python
# IST — HysteresisState (In-Memory, fluechtiger State)
@dataclass
class HysteresisState:
    is_active: bool = False
    last_activation: Optional[datetime] = None
    last_deactivation: Optional[datetime] = None
    last_value: Optional[float] = None
```

**SOLL:** State in der Datenbank persistieren.

**DB-Schema (neue Tabelle):**

```sql
CREATE TABLE logic_hysteresis_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL,
    condition_index INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    last_value FLOAT,
    last_activation TIMESTAMPTZ,
    last_deactivation TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (rule_id, condition_index)
);
```

**Alembic-Migration erstellen.** Kein FK auf `cross_esp_logic.id` mit CASCADE — States koennen laenger leben als Regeln (Soft-Delete-Muster des Projekts).

**Implementierung in `hysteresis_evaluator.py`:**

1. **Startup-Load:** `HysteresisConditionEvaluator.__init__()` bekommt optionalen `session_factory` Parameter (analog `DiagnosticsConditionEvaluator`). Beim ersten Evaluate oder beim Startup: alle States aus DB laden in `self._states`.

2. **State speichern:** Nach jeder State-Aenderung (Aktivierung oder Deaktivierung) UPSERT auf `logic_hysteresis_states`:
   - `ON CONFLICT (rule_id, condition_index) DO UPDATE SET is_active=..., last_value=..., updated_at=NOW()`

3. **Startup-Integration in `main.py`:** `HysteresisConditionEvaluator(session_factory=session_factory)` wie `DiagnosticsConditionEvaluator`. States beim Server-Start aus DB laden (async Startup-Hook im lifespan).

**Akzeptanzkriterien:**
- [ ] Neue Tabelle `logic_hysteresis_states` existiert nach Alembic-Migration
- [ ] State wird nach Aktivierung in DB gespeichert (SELECT bestaetigt)
- [ ] Nach Neustart des Evaluators (neue Instanz, gleiche DB): State korrekt geladen
- [ ] Deadband-Szenario nach Restart: Aktor bleibt im letzten bekannten State bis Schwelle getroffen wird

---

### A3: DiagnosticsConditionEvaluator fehlt in logic_service.py (N4 — MITTEL) `[KORREKTUR: BEREITS IMPLEMENTIERT — logic_service.py:74 enthält bereits diagnostics_eval = DiagnosticsConditionEvaluator(session_factory=get_session), ist in compound_eval und self.condition_evaluators. Block überspringen.]`

**Datei:** `El Servador/god_kaiser_server/src/services/logic_service.py` (Zeile 68-78)

**IST:** `logic_service.py` registriert beim Rule-Test-Endpoint (`POST /logic/rules/{id}/test`) folgende Evaluatoren:
- SensorConditionEvaluator
- TimeConditionEvaluator
- HysteresisConditionEvaluator
- CompoundConditionEvaluator (mit den 3 oben als Sub-Evaluatoren)

**Fehlend:** `DiagnosticsConditionEvaluator` ist nicht in der Test-Liste. In `main.py` (produktiv) und `logic_engine.py` (Fallback) ist er vorhanden.

**Folge:** Ein `POST /logic/rules/{id}/test` mit einer Regel die `diagnostics_status`-Conditions hat, evaluiert diese Condition still als `False`. Kein Fehler, kein Log — der Test-User sieht ein falsches Ergebnis.

**SOLL:**

```python
# SOLL — logic_service.py:68-78 (schematisch)
diagnostics_eval = DiagnosticsConditionEvaluator(session_factory=session_factory)
evaluators = [
    sensor_eval,
    time_eval,
    hysteresis_eval,
    diagnostics_eval,   # NEU
]
compound_eval = CompoundConditionEvaluator(sub_evaluators=evaluators)
evaluators.append(compound_eval)
```

`DiagnosticsConditionEvaluator` benoetigt `session_factory` (wie in `main.py`). In `logic_service.py` ist `session_factory` bereits verfuegbar (wird bereits fuer andere DB-Operationen genutzt).

**Akzeptanzkriterien:**
- [ ] `POST /logic/rules/{id}/test` evaluiert `diagnostics_status`-Conditions korrekt
- [ ] Kein Regression: bestehende Condition-Typen (sensor, time, hysteresis) weiterhin funktionsfaehig im Test-Endpoint

---

### A4: GPIO int()-Coercion im HysteresisConditionEvaluator (N5 — MITTEL) `[KORREKTUR: BEREITS IMPLEMENTIERT — hysteresis_evaluator.py:336 hat bereits if int(condition.get("gpio", -1)) != int(sensor_data.get("gpio", -2)). Block überspringen.]`

**Datei:** `El Servador/god_kaiser_server/src/services/logic/conditions/hysteresis_evaluator.py` (Zeile ~250)

**IST:** `_matches_sensor()` vergleicht GPIOs direkt ohne Typ-Coercion:

```python
# IST — hysteresis_evaluator.py
if cond_gpio != data_gpio:
    return False
```

Im `SensorConditionEvaluator._matches_trigger()` wird `int(cond_gpio) == int(data_gpio)` genutzt (int-Coercion). Sensor-Daten koennen GPIO als Float aus dem JSON-Parsing enthalten (z.B. `5.0` statt `5`). Der Sensor-Evaluator handelt das korrekt, der Hysterese-Evaluator nicht.

**SOLL:**

```python
# SOLL — hysteresis_evaluator.py
if int(cond_gpio) != int(data_gpio):
    return False
```

**Hinweis:** Analog auch `esp_id` und `sensor_type` pruefen ob Coercion sinnvoll ist. Bei `esp_id` (String) und `sensor_type` (String) ist direkter Vergleich korrekt. Nur GPIO (numerisch) braucht int-Coercion.

**Akzeptanzkriterien:**
- [ ] Hysterese-Condition mit GPIO=5 matcht Sensor-Daten mit gpio=5.0 (Float aus JSON)
- [ ] Kein Regression: GPIO-Matching weiterhin korrekt fuer Integer-GPIOs

---

### A5: DelayActionExecutor — Dokumentation der Einschraenkung (N9 — NIEDRIG)

**Datei:** `El Servador/god_kaiser_server/src/services/logic/actions/delay_executor.py`

**IST:** `DelayActionExecutor` nutzt `await asyncio.sleep(seconds)` — blockiert die gesamte Aktions-Kette der aktuellen Regel. Andere Regeln (separate asyncio Tasks) sind NICHT betroffen, aber nachfolgende Actions in der gleichen Regel werden erst nach dem Sleep ausgefuehrt.

**Beurteilung:** Kein dringender Bug. Fuer Regeln mit Delay gefolgt von weiteren Actions ist die blockierende Wartezeit das gewuenschte Verhalten (sequenzielle Ausfuehrung). Eine nicht-blockierende Alternative waere `asyncio.create_task()` mit naechsten Actions als Callbacks — aber das aendert die Semantik (Actions koennten parallelisiert werden, was nicht immer gewuenscht ist).

**SOLL:** Keinen Code-Fix. Stattdessen Kommentar in `delay_executor.py`:

```python
# NOTE: asyncio.sleep() blocks this rule's action chain intentionally.
# Other rules (separate tasks) are unaffected.
# For non-blocking delay (fire-and-forget next actions), use SequenceActionExecutor.
```

Ausserdem: Im Frontend-Rule-Builder einen Tooltip fuer Delay-Actions hinzufuegen:
"Wartezeit: Die naechste Aktion dieser Regel wird erst nach Ablauf ausgefuehrt. Andere Regeln sind nicht betroffen."

**Akzeptanzkriterien:**
- [ ] Kommentar in `delay_executor.py` erklaert das Blocking-Verhalten
- [ ] Kein Code-Refactoring (Semantik unveraendert)

---

### A6: Concurrency-Verhalten dokumentieren (N3 — MITTEL)

**IST:** Kein asyncio.Lock auf Engine-Ebene. `ConflictManager` schuetzt Aktoren per `asyncio.Lock per esp:gpio`. Cooldown-Checks haben theoretisch ein ~10ms Race-Window bei Burst-Sensor-Updates.

**Beurteilung:** Praktisch akzeptabel fuer aktuelle Auslastung (ein ESP, Sensor-Intervall 10-30s). ConflictManager verhindert gleichzeitige Aktor-Befehle korrekt. Engine-Level-Lock wuerde Throughput reduzieren und ist bei event-driven Evaluation (nicht Polling) nicht notwendig.

**SOLL:** Kommentar in `logic_engine.py` am Anfang der `_evaluate_rule()` Methode:

```python
# Concurrency: No engine-level lock by design.
# ConflictManager (asyncio.Lock per esp:gpio) prevents concurrent actuator commands.
# Cooldown checks have a ~10ms race window under burst load — acceptable for current scale.
# Add engine-level lock only if rule evaluation rate exceeds ~100/s.
```

**Akzeptanzkriterien:**
- [ ] Kommentar dokumentiert das bewusste Design ohne Engine-Level-Lock
- [ ] Kein Code-Aenderung

---

## Block B — Frontend Rules Integration (~3-4h)

**Betrifft:** N6, N7

### B1: extractSensorConditions() ignoriert Hysterese-Typ (N6 — MITTEL) `[KORREKTUR: BEREITS IMPLEMENTIERT — logic.ts:310-319 enthält bereits den hysteresis-Branch. Außerdem: Funktionssignatur im Plan falsch beschrieben — tatsächlich extractSensorConditions(conditions: LogicCondition[]) nicht (rule: LogicRule). Block überspringen.]`

**Datei:** `El Frontend/src/types/logic.ts` (Zeile 304-315)

**IST:** Die Funktion `extractSensorConditions()` prueft Condition-Typen und gibt nur Sensor-Referenzen zurueck fuer `type === 'sensor'` und `type === 'sensor_threshold'`. Der Typ `'hysteresis'` wird still uebersprungen.

```typescript
// IST — types/logic.ts:304-315 (schematisch)
export function extractSensorConditions(rule: LogicRule): SensorRef[] {
  return rule.trigger_conditions
    .filter(c => c.type === 'sensor' || c.type === 'sensor_threshold')
    .map(c => ({ espId: c.esp_id, gpio: c.gpio, sensorType: c.sensor_type }))
}
```

**Folge:** Die `LinkedRulesSection` (in `ActuatorConfigPanel.vue`, `SensorConfigPanel.vue`, `DeviceDetailPanel.vue`) zeigt Hysterese-Regeln NICHT in der "Verknuepfte Regeln"-Liste, obwohl die Regel auf diesen Sensor referenziert. Der User sieht am Sensor keine Regeln obwohl eine Hysterese-Regel darauf basiert.

**SOLL:** `'hysteresis'` Zweig hinzufuegen:

```typescript
// SOLL — types/logic.ts
export function extractSensorConditions(rule: LogicRule): SensorRef[] {
  return rule.trigger_conditions
    .filter(c =>
      c.type === 'sensor' ||
      c.type === 'sensor_threshold' ||
      c.type === 'hysteresis'      // NEU
    )
    .map(c => ({ espId: c.esp_id, gpio: c.gpio, sensorType: c.sensor_type }))
}
```

Pruefen ob `HysteresisCondition` in `types/logic.ts` die Felder `esp_id`, `gpio`, `sensor_type` hat (analog `SensorCondition`). Falls die Felder anders heissen: Mapping anpassen.

**Akzeptanzkriterien:**
- [ ] `LinkedRulesSection` zeigt Hysterese-Regeln wenn der Sensor als Trigger konfiguriert ist
- [ ] `extractSensorConditions()` gibt fuer Hysterese-Conditions korrekte SensorRef zurueck
- [ ] Kein Regression fuer sensor/sensor_threshold Typen

---

### B2: Number('') Coercion erzeugt 0 statt null (N7 — NIEDRIG)

**Datei:** `El Frontend/src/components/rules/RuleConfigPanel.vue`

**IST:** Input-Handler fuer Hysterese-Felder (`activate_below`, `deactivate_above`, `activate_above`, `deactivate_below`) konvertieren den Input-Wert mit `Number(event.target.value)`. Wenn das Feld geleert wird, ist `event.target.value = ''` und `Number('') = 0`.

Da `0` nicht `null` ist, wird `activateBelow != null` zu `true` ausgewertet. Die Modus-Erkennung im Evaluator (Heating vs. Cooling basierend auf gesetzten Feldern) bekommt falsche Werte: beide Paare (Cooling 0/0 + Heating) sind gesetzt, obwohl der User nur eines will.

**SOLL:** Leere Strings als `null` behandeln:

```typescript
// SOLL — RuleConfigPanel.vue Input-Handler
const parseHysteresisField = (value: string): number | null => {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return isNaN(parsed) ? null : parsed
}
```

Alle 4 Hysterese-Felder nutzen diese Hilfsfunktion statt direktem `Number()`.

**Akzeptanzkriterien:**
- [ ] Leeres Hysterese-Feld sendet `null` an die API (nicht `0`)
- [ ] `GET /logic/rules/{id}` zeigt nach dem Speichern `null` fuer leere Felder (nicht `0`)
- [ ] Modus-Erkennung (Heating vs. Cooling) funktioniert korrekt wenn nur ein Paar gesetzt ist

---

## Block C — Firmware MQTT QoS (~30min)

**Betrifft:** N8

### C1: ESP subscribed Aktor-Commands mit QoS 0 (N8 — NIEDRIG) `[KORREKTUR: BEREITS IMPLEMENTIERT — main.cpp:823-842 nutzt bereits QoS 1 für alle Command-Subscriptions (system_command, config, actuator_command_wildcard, emergency, zone_assign, subzone, sensor_command). Einzige Ausnahme: heartbeat_ack ohne QoS-Parameter (korrekt so). Block überspringen.]`

**Datei:** `El Trabajante/src/main.cpp` (Zeile ~825) oder `El Trabajante/src/services/communication/mqtt_client.cpp` `[KORREKTUR PFAD: Plan hatte falschen Pfad src/communication/ — korrekt ist src/services/communication/mqtt_client.cpp]`

**IST:** `PubSubClient::subscribe()` wird ohne QoS-Parameter aufgerufen — Default ist QoS 0 (At Most Once). Der Server publiziert Aktor-Befehle mit QoS 2 (Exactly Once). Bei instabiler WLAN-Verbindung koennen Befehle verloren gehen ohne dass ESP oder Server das bemerken.

**Datenfluss betroffen:**
- Topic: `kaiser/{k}/esp/{e}/actuator/+/command` — Aktor-Befehle (ON/OFF/PWM/TOGGLE + duration)
- Topic: `kaiser/{k}/esp/{e}/config` — Konfigurationsaenderungen
- Topic: `kaiser/{k}/esp/{e}/system/command` — System-Befehle

**SOLL:**

```cpp
// SOLL — Aktor-Commands: QoS 1 (At Least Once)
client.subscribe(actuatorCommandTopic.c_str(), 1);

// SOLL — Config-Topic: QoS 1
client.subscribe(configTopic.c_str(), 1);

// SOLL — System-Command: QoS 1
client.subscribe(systemCommandTopic.c_str(), 1);
```

**Warum QoS 1 und nicht QoS 2:** Die Arduino-Bibliothek `PubSubClient` unterstuetzt Subscriptions maximal mit QoS 1. QoS 1 ist ausreichend: Aktor-Befehle sind idempotent (ON auf bereits AN hat keine Nebenwirkung). Doppelte Befehle sind ungefaehrlich, verlorene Befehle sind das eigentliche Risiko.

**Sensor-Daten-Topics:** QoS 0 bei Subscriptions bleibt korrekt (naechster Messwert kommt in Sekunden).

**Vorgehen:**
1. Alle `client.subscribe()` Aufrufe im Code finden
2. Nur Topics die Steuerbefehle oder Konfiguration empfangen auf QoS 1 aendern
3. Sensor-bezogene Subscriptions (falls vorhanden) belassen

**Akzeptanzkriterien:**
- [ ] Aktor-Command-Subscription nutzt QoS 1 (ESP-Log bestaetigt)
- [ ] Config-Subscription nutzt QoS 1
- [ ] Kein Regression: Befehle kommen weiterhin korrekt an
- [ ] MQTT-Broker Mosquitto: QoS-Level in den Broker-Logs sichtbar

---

## Block D — Tests (~2-3h)

**Betrifft:** Alle Fixes in Block A und B

### D1: HysteresisConditionEvaluator Unit-Tests (KRITISCH — noch nicht vorhanden) `[KORREKTUR: DATEI EXISTIERT BEREITS]`

**Datei (neu):** ~~`El Servador/tests/unit/logic/test_hysteresis_evaluator.py`~~ `[KORREKTUR PFAD: Datei existiert bereits unter El Servador/god_kaiser_server/tests/unit/test_hysteresis_evaluator.py — kein logic/ Unterordner. Prüfen ob Testfälle vollständig.]`

**Test-Faelle:**

```python
# 1. Heating-Modus: activate_below=45, deactivate_above=55
# 2. Cooling-Modus: activate_above=28, deactivate_below=24
# 3. State-Transitions: OFF→ON→OFF Zyklus fuer Heating
# 4. Deadband: Wert im Bereich 45-55 aendert State nicht
# 5. Sensor-Matching: Falscher ESP/GPIO/Typ → State unveraendert
# 6. Compound-Regel: 2 Hysterese-Conditions → condition_index 0 und 1 → keine Key-Kollision
```

Testdaten fuer Heating-Modus (Befeuchtungs-Szenario):
- State=OFF, Feuchte=40% (< activate_below=45) → Result=True (aktivieren), State→ON
- State=ON, Feuchte=50% (Deadband 45-55) → Result=True (aktiv bleiben), State bleibt ON
- State=ON, Feuchte=60% (> deactivate_above=55) → Result=False + `_hysteresis_just_deactivated=True`, State→OFF

Testdaten fuer Cooling-Modus (Kuehlungs-Szenario):
- State=OFF, Temperatur=30°C (> activate_above=28) → Result=True, State→ON
- State=ON, Temperatur=26°C (Deadband 24-28) → Result=True, State bleibt ON
- State=ON, Temperatur=22°C (< deactivate_below=24) → Result=False + Deaktivierungs-Flag

**Akzeptanzkriterien:**
- [ ] Alle 6 Faelle PASS
- [ ] Beide Modi (Heating + Cooling) abgedeckt
- [ ] Deadband-Verhalten korrekt getestet

---

### D2: Hysterese-State-Persistenz-Test (N2 Fix) `[KORREKTUR: DATEI EXISTIERT BEREITS]`

**Datei (neu):** ~~`El Servador/tests/integration/logic/test_hysteresis_state_persistence.py`~~ `[KORREKTUR PFAD: Datei existiert bereits unter El Servador/god_kaiser_server/tests/integration/test_hysteresis_persistence.py — anderer Name (ohne _state_), kein logic/ Unterordner. Prüfen ob Szenarien vollständig.]`

**Szenario:**
1. Evaluator-Instanz erstellen, Hysterese-Condition aktivieren (State→ON), State in DB persistieren
2. Neue Evaluator-Instanz erstellen (simuliert Server-Restart)
3. Neue Instanz aus DB laden lassen
4. State muss `is_active=True` sein

**Technisch:** Integration-Test mit echter DB (oder Mock via SQLAlchemy) der das Startup-Load-Verhalten testet.

**Akzeptanzkriterien:**
- [ ] State ueberlebt Evaluator-Neuinstanziierung (Restart-Simulation)
- [ ] UPSERT-Mechanismus (Aktivierung + Deaktivierung beide persistiert)

---

### D3: Compound-Regel mit Hysterese an Position > 0 (N1 Fix)

**Datei (neu oder ergaenzen):** `El Servador/god_kaiser_server/tests/unit/test_compound_hysteresis.py` `[KORREKTUR PFAD: Plan hatte falschen Pfad El Servador/tests/unit/logic/ — korrekt ist El Servador/god_kaiser_server/tests/unit/ (kein logic/ Unterordner). Datei existiert noch NICHT, muss neu erstellt werden.]`

**Szenario:**
- Compound-AND-Regel mit 2 Sub-Conditions: [TimeCondition, HysteresisCondition]
- HysteresisCondition ist an Position idx=1
- Erwarteter State-Key: `"{rule_id}:1"` (nicht `":0"`)
- Beide States muessen unabhaengig sein — State der Zeit-Condition beeinflusst nicht den Hysterese-State

**Akzeptanzkriterien:**
- [ ] Hysterese an Position 1 nutzt Key `rule_id:1`
- [ ] Kein Key-Konflikt wenn zwei Hysterese-Conditions in gleicher Regel

---

### D4: extractSensorConditions() mit Hysterese-Typ (N6 Fix)

**Datei:** `El Frontend/tests/unit/stores/logic.test.ts` (existiert bereits — ergänzen) oder neue Datei `El Frontend/tests/unit/utils/extractSensorConditions.test.ts` `[KORREKTUR PFAD: Plan hatte falschen Pfad El Frontend/src/tests/ — korrekt ist El Frontend/tests/unit/ (kein src/). Tests leben nicht in src/.]`

**Test:**

```typescript
it('extractSensorConditions includes hysteresis conditions', () => {
  const rule: LogicRule = {
    trigger_conditions: [
      { type: 'hysteresis', esp_id: 'ESP_1', gpio: 0, sensor_type: 'sht31_humidity', activate_below: 45, deactivate_above: 55 }
    ],
    ...
  }
  const refs = extractSensorConditions(rule)
  expect(refs).toHaveLength(1)
  expect(refs[0]).toMatchObject({ espId: 'ESP_1', gpio: 0, sensorType: 'sht31_humidity' })
})
```

**Akzeptanzkriterien:**
- [ ] Test PASS fuer Hysterese-Condition
- [ ] Regression-Test: sensor + sensor_threshold weiterhin korrekt

---

## Einschraenkungen

- **KEIN Refactoring der gesamten Logic Engine** — nur die beschriebenen Stellen aendern
- **KEINE Aenderung des MQTT-Datenfluss** (Topic-Schema, Payload-Format) — nur QoS-Parameter
- **KEIN neues Widget-System** — Rule-Anzeige-Fixes nur in bestehenden Komponenten
- **KEINE DB-Schema-Aenderungen ausser** der neuen `logic_hysteresis_states` Tabelle (A2)
- **Alembic-Migration** muss `upgrade()` und `downgrade()` haben
- **Bestehende Tests muessen GRUEN bleiben** nach den Fixes

---

## Reihenfolge-Empfehlung

Wenn L1 und L2 bereits umgesetzt sind, sind A1/A2/A4/B1/B2 bereits erledigt — nur A3, A5/A6 (Kommentare) und Block D verbleiben.

**Wenn L1/L2 noch nicht umgesetzt:**

| Schritt | Aufgabe | Aufwand |
|---------|---------|---------|
| 1 | A4: GPIO int()-Coercion — 1 Zeile | 5min |
| 2 | A3: DiagnosticsEvaluator in logic_service.py | 10min |
| 3 | A1: condition_index dynamisch im CompoundEvaluator | 30min |
| 4 | B1: extractSensorConditions() + hysteresis | 15min |
| 5 | B2: Number('') → null | 20min |
| 6 | C1: QoS Fix in main.cpp | 15min |
| 7 | A2: DB-Tabelle + Alembic-Migration + Evaluator-Integration | 2-3h |
| 8 | A5/A6: Kommentare | 10min |
| 9 | D1: HysteresisEvaluator Unit-Tests | 1h |
| 10 | D2: State-Persistenz Integration-Test | 30min |
| 11 | D3: Compound+Hysterese Test | 30min |
| 12 | D4: Frontend extractSensorConditions Test | 20min |

**Gesamt:** ~6-7h reine Implementierung + Tests

---

## Verifikation nach Umsetzung

```
Pruefpunkte:

Backend:
[ ] pytest tests/unit/logic/ — alle Tests GRUEN
[ ] pytest tests/integration/logic/ — alle Tests GRUEN
[ ] POST /logic/rules/{id}/test mit diagnostics_status-Condition — korrekte Evaluation
[ ] SELECT * FROM logic_hysteresis_states — Eintraege vorhanden nach Regel-Feuern

Firmware:
[ ] MQTT-Broker Log zeigt QoS 1 fuer Actuator-Command-Subscriptions
[ ] ESP-Serial-Log: "subscribed to actuator/+/command QoS 1"

Frontend:
[ ] LinkedRulesSection zeigt Hysterese-Regeln am Sensor
[ ] Hysterese-Feld leeren + speichern → API zeigt null (nicht 0)
[ ] vitest run — alle Tests GRUEN
```

---

**Ende Auftrag ED-3.**
