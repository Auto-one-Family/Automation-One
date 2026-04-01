# R1-BE Analyse-Bericht: Logic Engine Backend IST-Zustand

**Datum:** 2026-04-01
**Scope:** El Servador — Logic Engine Backend
**Typ:** Reine Analyse — kein Code geändert
**Basis:** Auftrag `auftrag-R1-BE-logic-backend-analyse.md`

---

## Block 1: Datenmodell — cross_esp_logic

### Dateien & Zeilen

| Datei | Zeilen | Rolle |
|-------|--------|-------|
| `src/db/models/logic.py` | 424 | SQLAlchemy Models + @validates Hooks |
| `src/db/models/logic_validation.py` | 427 | Pydantic-Validierungsmodelle für JSON-Felder |
| `src/db/repositories/logic_repo.py` | 300 | Repository-Layer |

### CrossESPLogic Model — Alle Spalten

| Spalte | Typ | Nullable | Default | Constraint |
|--------|-----|----------|---------|------------|
| `id` | UUID (PostgreSQL) | nein | `uuid.uuid4` | PK |
| `rule_name` | String(100) | nein | — | UNIQUE, INDEX |
| `description` | Text | ja | — | — |
| `enabled` | Boolean | nein | `True` | INDEX |
| `trigger_conditions` | JSON | nein | — | @validates → Pydantic |
| `logic_operator` | String(3) | nein | `"AND"` | — |
| `actions` | JSON | nein | — | @validates → Pydantic |
| `priority` | Integer | nein | `100` | — |
| `cooldown_seconds` | Integer | ja | — | — |
| `max_executions_per_hour` | Integer | ja | — | — |
| `last_triggered` | DateTime(tz) | ja | — | — |
| `rule_metadata` | JSON | nein | `{}` | — |

**Index:** `idx_rule_enabled_priority` auf `(enabled, priority)` — für schnellen Enabled-Rule-Lookup.

**Alias-Properties:** `name` ↔ `rule_name`, `conditions` ↔ `trigger_conditions` (mit List-Wrapping für Single-Dict Format).

### trigger_conditions — JSON-Strukturen

**Sensor-Condition:**
```json
{
    "type": "sensor_threshold",
    "esp_id": "ESP_12AB34CD",
    "gpio": 34,
    "sensor_type": "temperature",
    "operator": ">",
    "value": 25.0,
    "subzone_id": null
}
```
Alias: `"type": "sensor"` akzeptiert. `sensor_type` optional. `subzone_id` optional (Phase 2.4).
`"between"`-Operator verwendet `min`/`max` statt `value`.

**Hysterese-Condition:**
```json
{
    "type": "hysteresis",
    "esp_id": "ESP_12AB34CD",
    "gpio": 4,
    "sensor_type": "DS18B20",
    "activate_above": 28.0,
    "deactivate_below": 24.0
}
```
Heating-Modus: `"activate_below": 18.0, "deactivate_above": 22.0` stattdessen.

**Compound-Condition:**
```json
{
    "logic": "AND",
    "conditions": [
        {"type": "sensor_threshold", ...},
        {"type": "time_window", ...}
    ]
}
```

**Zeitfenster-Condition:**
```json
{
    "type": "time_window",
    "start_hour": 8,
    "end_hour": 18,
    "days_of_week": [0, 1, 2, 3, 4]
}
```
Alias `"type": "time"` akzeptiert. `days_of_week` optional (null = alle Tage).

**Diagnostics-Condition:** `{"type": "diagnostics", ...}` — evaluiert von `DiagnosticsConditionEvaluator` (nicht in `logic_validation.py` registriert → wird bei DB-Speicherung abgelehnt, aber direkt in der Engine unterstützt).

### actions — JSON-Strukturen

**Actuator-Action:**
```json
{
    "type": "actuator_command",
    "esp_id": "ESP_AABBCCDD",
    "gpio": 18,
    "command": "PWM",
    "value": 0.75,
    "duration_seconds": 60
}
```
Alias: `"type": "actuator"` akzeptiert. `command`: ON/OFF/PWM/TOGGLE. `duration_seconds=0` = kein Limit. Alternatives Feld: `"duration"` (Backward-Compat).

**Notification-Action:**
```json
{
    "type": "notification",
    "channel": "websocket",
    "target": "user@example.com",
    "message_template": "pH {value} überschritten"
}
```

**Delay-Action:**
```json
{"type": "delay", "seconds": 30}
```

**Sequence-Action:**
```json
{"type": "sequence", "steps": [...]}
```

**Plugin-Action:**
```json
{"type": "plugin", "plugin_id": "health_check", "config": {}}
```
Alias: `"type": "autoops_trigger"`.

### Compound-Operator: Wo gespeichert?

**Dual-Storage — potenzielle Inkonsistenz:**
1. `logic_operator`-Spalte: Speichert den Top-Level-Operator ("AND"/"OR") für den Fall, dass `trigger_conditions` eine Liste ist.
2. Inline `{"logic": "AND", "conditions": [...]}`: Compound-Conditions haben ihren Operator im JSON selbst.

In `_check_conditions()` (logic_engine.py:468) wird `logic_operator` als Parameter übergeben und als Fallback verwendet wenn `conditions` eine Liste ist. Der inline `"logic"`-Key hat Vorrang wenn erkannt.

### Routing-Feld: Existiert NICHT

Keine Zuordnung welche Condition welche Action triggert. Es gilt: **alle Conditions TRUE → alle Actions ausführen.**

### logic_hysteresis_states — EXISTIERT und wird AKTIV GENUTZT

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `id` | Integer (PK, autoincrement) | Primary Key |
| `rule_id` | UUID (FK→cross_esp_logic CASCADE) | Referenz zur Regel |
| `condition_index` | Integer, default 0 | Index der Hysterese-Condition in der Regel |
| `is_active` | Boolean | Aktueller Aktivierungszustand |
| `last_value` | Float, nullable | Letzter verarbeiteter Sensor-Wert |
| `last_activation` | DateTime(tz), nullable | Zeitpunkt letzter Aktivierung |
| `last_deactivation` | DateTime(tz), nullable | Zeitpunkt letzter Deaktivierung |
| `updated_at` | DateTime(tz) | Letztes State-Update |

**UniqueConstraint:** `(rule_id, condition_index)` — ein State pro Rule+Condition.

Nutzung: `HysteresisConditionEvaluator._persist_state()` schreibt bei State-Change (Upsert). `load_states_from_db()` lädt beim Server-Start. `_build_offline_rules()` liest für `current_state_active`.

### Bewertung

**Routing-Feld ohne Migration möglich:** JA — `trigger_conditions` und `actions` sind freies JSON in PostgreSQL. Pydantic-Validierung in `logic_validation.py` verwendet **kein** `extra="forbid"` (Pydantic v2 default: `extra='ignore'`). Neue Felder auf BESTEHENDEN Condition/Action-Typen werden akzeptiert und ignoriert.

**Migration nötig für neuen Condition-Typ:** JA — `validate_condition()` in `logic_validation.py:324` löst `ValueError(f"Unknown condition type: {cond_type}")` für unbekannte Types aus. Ein neuer Typ wie `"routing"` würde bei DB-Speicherung abgelehnt.

**Kompatibilität bestehender JSON-Daten:** Hoch — keine breaking Changes wenn neue optionale Felder hinzugefügt werden. API-Schemas (`LogicRuleCreate`) verwenden `List[Dict[str, Any]]` — kein JSON-Schema-Enforcement auf API-Ebene.

---

## Block 2: Evaluierungs-Pipeline — _evaluate_rule() im Detail

### Datei & Zeilen

`src/services/logic_engine.py` — 1067 Zeilen

### Trigger-Matching: get_rules_by_trigger_sensor() (logic_repo.py:58-126)

1. Lädt ALLE enabled rules (`get_enabled_rules()` → sortiert nach priority ASC)
2. Iteriert in Python über alle Regeln — **kein DB-Filter auf JSON-Inhalt**
3. Normalisiert `trigger_conditions` zu einer flachen `conditions`-Liste
4. Prüft jede Condition: typ in `("sensor_threshold", "sensor", "hysteresis")`
5. Vergleicht `esp_id`, `gpio` (int-coerced), `sensor_type` (case-insensitive)
6. Break bei erstem Match — eine Regel kann nur einmal pro Sensor-Event matchen

**Verhalten bei Multi-Sensor-Regeln (AND: Sensor A UND Sensor B):** Die Regel wird bei JEDEM Sensor-Event evaluiert, wenn einer der Trigger-Sensoren fired. Der andere Sensorwert wird dann per `_load_cross_sensor_values()` aus der DB nachgeladen.

### Condition-Evaluierung: _check_conditions_modular() (logic_engine.py:506)

Aufruf-Kette:
```
_evaluate_rule()
  → _check_conditions(conditions, context, logic_operator)
    → (wenn list) → wrap als {"logic": logic_operator, "conditions": list}
    → _check_conditions_modular(conditions, context)
      → (wenn "logic" key) → CompoundConditionEvaluator.evaluate()
        → pro Sub-Condition: sub_context mit {**context, "condition_index": idx}
        → findet passenden Evaluator per evaluator.supports(cond_type)
        → AND: short-circuit bei erstem False
        → OR: short-circuit bei erstem True
      → (sonst) → einzelner Evaluator per cond_type
```

**context.condition_index bei Top-Level:** In `_evaluate_rule()` (line 344) wird `context["condition_index"] = 0` gesetzt. Für Compound-Conditions überschreibt der CompoundEvaluator korrekt mit `idx`. **Problem:** Bei direkter Single-Condition wird immer index=0 verwendet — korrekt für Single-Condition-Regeln.

### Action-Ausführung: _execute_actions() (logic_engine.py:668)

1. **ConflictManager-Locks ZUERST** für alle actuator-type Actions
   - Wenn ein Lock nicht gewährt wird → ALLE Actions der Regel werden abgebrochen (rollback)
   - Locks werden im `batch_locks` gesammelt und am Ende der Sensor-Batch-Verarbeitung freigegeben
2. Baut `context = {trigger_data, rule_id, rule_name, session}`
3. Iteriert SEQUENTIELL über `rule.actions`
4. Pro Action: sucht ersten passenden Executor via `executor.supports(action_type)`
5. Ruft `executor.execute(action, context)` auf
6. Sendet WebSocket-Broadcast (non-critical, swallowed)
7. Kein Action-Filter: **ALLE Actions werden ausgeführt, unabhängig davon welche Condition TRUE war**

### Hysterese-Deaktivierung: _hysteresis_just_deactivated Bypass

**Code:** logic_engine.py:350-385

```python
# Nach _check_conditions():
if not conditions_met and context.get("_hysteresis_just_deactivated"):
    off_actions = []
    for action in rule.actions:
        if action.get("type") in ("actuator_command", "actuator"):
            off_actions.append({
                **action,
                "command": "OFF",
                "value": 0.0,
                "duration": 0,
            })
    if off_actions:
        await self._execute_actions(off_actions, ...)
    # Log + commit
    return  # ← Kein weiteres Processing
```

**Ablauf:**
- `HysteresisConditionEvaluator.evaluate()` setzt `context["_hysteresis_just_deactivated"] = True` wenn `is_active` von True → False wechselt (logic_engine.py:243/269)
- Engine prüft dieses Flag NACH `_check_conditions()` (da `conditions_met=False` wenn Hysterese deaktiviert)
- **OFF-Kopie**: Erstellt die Engine, NICHT der Executor — für ALLE actuator-type Actions der Regel
- Bypass überspringt: Cooldown-Check, Rate-Limiting — OFF muss sofort senden
- Nur Hysterese setzt dieses Flag (kein anderer Evaluator)

### Context-Objekt (vollständig)

```python
context = {
    # Vom Sensor-Event gesetzt (logic_engine.py:338-344):
    "sensor_data": {
        "esp_id": str,
        "gpio": int,
        "sensor_type": str,
        "value": float,
        "timestamp": int,
        "zone_id": str | None,
        "subzone_id": str | None,
    },
    "sensor_values": {
        "ESP_ID:GPIO": {"value": float, "sensor_type": str},
        "ESP_ID:GPIO:sensor_type": {"value": float, "sensor_type": str},  # multi-value sensors
    },
    "current_time": datetime,
    "rule_id": str,          # UUID als String
    "condition_index": 0,    # Top-Level: immer 0; Compound: überschrieben per Sub-Index

    # Von _execute_actions() gesetzt (logic_engine.py:730-736):
    "trigger_data": dict,
    "session": AsyncSession | None,

    # Von HysteresisConditionEvaluator gesetzt (nur wenn deaktiviert):
    "_hysteresis_just_deactivated": True,
}
```

### Safety-Subsystem — Einbindung in die Pipeline

**ConflictManager** (`logic/safety/conflict_manager.py`, 280 Zeilen):
- `acquire_actuator(esp_id, gpio, rule_id, priority, command, is_safety_critical)` — asyncio.Lock pro esp:gpio
- Wenn anderer Rule dasselbe Actuator hält: blockt niedrigere Priorität
- Eingebunden in `_execute_actions()` VOR der ersten Action-Ausführung
- Batch-Mode: Locks über gesamte Sensor-Batch-Verarbeitung gehalten (verhindert Race zwischen parallel matchenden Regeln)

**RateLimiter** (`logic/safety/rate_limiter.py`, 211 Zeilen):
- `check_rate_limit(rule_id, rule_max_per_hour, esp_ids)` — prüft `max_executions_per_hour` gegen DB-History
- Eingebunden in `_evaluate_rule()` nach Cooldown-Check, VOR `_execute_actions()`

**LoopDetector** (`logic/safety/loop_detector.py`, 236 Zeilen):
- Nicht direkt in der aktuellen `_evaluate_rule()`-Pipeline referenziert — wird vermutlich vom `LogicScheduler` oder bei Rule-Erstellung verwendet (nicht im Auftrag-Scope, getrennte Analyse nötig)

### Bewertung

**Action-Routing Injection-Point:** `_evaluate_rule()` zwischen Zeile 347 (conditions_met) und 421 (execute_actions). Alternativ: `_execute_actions()` erhält ein `routing_map` dict.

**ELSE-Pfad (FALSE → andere Actions):** Nicht vorhanden. Einziger FALSE-Handler ist der Hysterese-Bypass. Ein allgemeiner ELSE-Pfad wäre eine signifikante Erweiterung in `_evaluate_rule()`.

**Compound-Ergebnis-Granularität:** CompoundEvaluator hat intern die `results`-Liste, gibt aber nur `bool` zurück. Änderung für Action-Routing: Return `{"result": bool, "condition_results": list[bool]}` — Breaking Change für alle Evaluator-Aufrufer.

---

## Block 3: HysteresisConditionEvaluator — Dual-Modus Analyse

### Datei & Zeilen

`src/services/logic/conditions/hysteresis_evaluator.py` — 389 Zeilen

### Modus-Erkennung (Zeilen 225-280)

```python
# Mode A: Kühlung — Zeile 225
if activate_above is not None and deactivate_below is not None:
    ...  # Cooling-Logik

# Mode B: Heizung — Zeile 251 (elif!)
elif activate_below is not None and deactivate_above is not None:
    ...  # Heating-Logik

else:
    logger.error("Invalid hysteresis config: need ... OR ...")
    return False
```

**Vorrang-Logik:** `elif` → Mode A (Kühlung) gewinnt. Wenn BEIDE Paare gesetzt → Mode B wird vollständig ignoriert. **Kein explizites Modus-Feld.**

**Konflikt mit UI:** Frontend zeigt ALLE 4 Threshold-Felder und suggeriert simultane Funktionalität → ist ein UI-Bug. Das Backend kann nur EINEN Modus pro Condition.

### State-Machine

| Zustand | Bedingung (Cooling) | Bedingung (Heating) |
|---------|--------------------|--------------------|
| OFF → ON | `value > activate_above AND NOT is_active` | `value < activate_below AND NOT is_active` |
| ON → OFF | `value < deactivate_below AND is_active` | `value > deactivate_above AND is_active` |
| Zwischen Schwellen | Zustand bleibt unverändert | Zustand bleibt unverändert |

**ON→OFF setzt:** `context["_hysteresis_just_deactivated"] = True` (Zeile 243/269)

**DB-Persistenz:** Nur bei State-Change (is_active changed). Upsert auf `logic_hysteresis_states` mit Constraint `(rule_id, condition_index)`.

### _matches_sensor() (Zeilen 319-349)

- `esp_id`: exakter String-Vergleich
- `gpio`: int-coerced (`int(condition.get("gpio", -1)) != int(sensor_data.get("gpio", -2))`)
- `sensor_type`: **case-insensitive** (`cond.lower() != data.lower()`)
- **Nicht geprüft:** `i2c_address`, `onewire_address` — kein Address-Matching
- **Bei Nicht-Match:** gibt `state.is_active` zurück (nicht False!) → State bleibt erhalten wenn falscher Sensor triggert

### Return-Wert

`evaluate()` → `bool` (`state.is_active`). Zusatzinformation nur via `context["_hysteresis_just_deactivated"]`.

### Zwei Pfade für Redesign

Option A — **Zwei separate Conditions:**
```json
{
    "type": "hysteresis_cooling",
    "activate_above": 28.0,
    "deactivate_below": 24.0
}
```
und
```json
{
    "type": "hysteresis_heating",
    "activate_below": 18.0,
    "deactivate_above": 22.0
}
```
→ Je separate State-Verwaltung, separates Action-Routing möglich.

Option B — **Explizites Modus-Feld:**
```json
{
    "type": "hysteresis",
    "mode": "cooling",
    "activate_above": 28.0,
    "deactivate_below": 24.0
}
```
→ Weniger Änderungen, aber kein simultanes Cooling+Heating.

### Bewertung

**Bug oder Feature:** Bug. Das UI zeigt 4 Felder, das Backend wertet nur 2 aus. Benutzer glauben bidirektionale Kontrolle einzurichten.

**Auswirkung auf Offline-Rules:** `_extract_offline_rule()` prüft `is_cooling` und `is_heating` getrennt und schreibt beide Floats ins Payload (mit 0.0 für den nicht-aktiven Modus). Firmware kennt beide Felder. Eine Aufspaltung in 2 Conditions würde erfordern, dass `_extract_offline_rule()` pro Condition eine Offline-Rule erzeugt — max. 2 Regeln statt 1 pro Server-Regel.

---

## Block 4: SensorConditionEvaluator — Einfache Operatoren

### Datei & Zeilen

`src/services/logic/conditions/sensor_evaluator.py` — 200 Zeilen

### Unterstützte Operatoren (_compare, Zeilen 141-200)

| Operator | Logik | Felder |
|----------|-------|--------|
| `>` | `actual > threshold` | `value` |
| `>=` | `actual >= threshold` | `value` |
| `<` | `actual < threshold` | `value` |
| `<=` | `actual <= threshold` | `value` |
| `==` | `actual == threshold` | `value` |
| `!=` | `actual != threshold` | `value` |
| `between` | `min <= actual <= max` | `min`, `max` (auto-swap wenn min>max) |

**Return:** `bool` — True/False. Kein zusätzlicher Context.

### Kein Inverse-Mechanismus

`evaluate()` gibt einfach `True` oder `False`. Es gibt keine "wenn TRUE sende ON, wenn FALSE sende OFF"-Logik im Evaluator. Die Inverse-Logik lebt komplett ausserhalb (Hysterese hat sie eingebaut via State-Machine; einfache Operatoren nicht).

### Cross-Sensor Support (Zeilen 50-96)

- Prüft zuerst ob Trigger-Sensor matched (`_matches_trigger()`)
- Bei Nicht-Match: sucht in `context["sensor_values"]` via typed Key (`ESP_ID:GPIO:sensor_type`) und untyped Key (`ESP_ID:GPIO`)
- Multi-Value-Sensor (SHT31): typed Key hat Vorrang
- Wenn kein Cross-Sensor-Wert vorhanden: gibt False zurück (nicht Error)

### Optional: subzone_id und zone_id Filter (Zeilen 79-94)

Nur für Trigger-Sensor (nicht Cross-Sensor). Wenn `condition.subzone_id` gesetzt und `sensor_data.subzone_id` passt nicht → False.

### Bewertung

**Inverse-Modus im Evaluator:** Möglich, aber unnötig komplex. Besser in der Engine lösen (ELSE-Pfad). Die Evaluatoren sollen nur Boolean liefern.

**Inverse via ELSE-Pfad in Engine:** Sauberer Ansatz — Engine entscheidet basierend auf Condition-Ergebnis welche Action-Gruppe ausgeführt wird. Passt zum bestehenden Pattern.

---

## Block 5: CompoundConditionEvaluator — AND/OR

### Datei & Zeilen

`src/services/logic/conditions/compound_evaluator.py` — 107 Zeilen

### Sub-Condition-Evaluierung (Zeilen 66-107)

- **Sequentiell** (kein asyncio.gather)
- `sub_context = {**context, "condition_index": idx}` — **KORREKT** pro Sub-Condition gesetzt (Zeile 69)
- AND: short-circuit bei erstem False → sofort `return False`
- OR: kein short-circuit (sammelt alle Ergebnisse, dann `any(results)`)

**Hinweis:** Beim AND-Pfad: bei Fehler im Evaluator → `return False` (Zeile 97). Beim OR-Pfad: `results.append(False)` und weiter. Konsistentes Fail-Safe-Verhalten.

### condition_index: KORREKT (nicht mehr 0-hardcoded)

`sub_context = {**context, "condition_index": idx}` (Zeile 69) setzt den Index korrekt pro Sub-Condition. Hysterese-State-Keys werden damit korrekt generiert: `"{rule_id}:0"`, `"{rule_id}:1"`, etc.

### Verschachtelung

JA — technisch möglich. `CompoundEvaluator.supports()` prüft `condition_type == "compound" or "logic" in condition_type.lower()`. Sub-Conditions mit `{"logic": "AND", "conditions": [...]}` werden durch denselben CompoundEvaluator verarbeitet, da er Teil der `evaluators`-Liste ist.

### Return-Wert

Nur `bool` — keine Detailinformationen. Die `results`-Liste ist intern und wird nicht zurückgegeben.

### Bewertung

**Detail-Ergebnis für Action-Routing:** Würde folgende API-Änderung erfordern:
```python
# Statt:
async def evaluate(self, condition, context) -> bool:
# Neu:
async def evaluate(self, condition, context) -> EvaluationResult:
    # EvaluationResult(result: bool, condition_results: list[bool])
```
Breaking Change für alle Aufrufer (`_check_conditions_modular()`, `logic_service.test_rule()`).

**Alternativ:** Context-Objekt um `_condition_results` erweitern (wie `_hysteresis_just_deactivated`). Non-breaking, aber impliziter.

---

## Block 6: ActuatorActionExecutor — Befehlslogik

### Datei & Zeilen

`src/services/logic/actions/actuator_executor.py` — 155 Zeilen

### Befehlsausführung

**Felder aus der Action:**
- `esp_id` (String) — Pflicht
- `gpio` (int) — Pflicht
- `command` (default "ON") — ON/OFF/PWM/TOGGLE
- `value` (default 1.0) — 0.0–1.0 für PWM
- `duration_seconds` (bevorzugt) ODER `duration` (Compat-Fallback) — 0 = kein Limit

Delegiert an `ActuatorService.send_command()` → MQTT-Publish.

### Duration-Handling

```python
duration = action.get("duration_seconds")
if duration is None:
    duration = action.get("duration", 0)
```
`duration=0` → kein Auto-Off. Wert wird unverändert an ESP weitergeleitet.

### Subzone-Filter (Phase 2.4, Zeilen 72-95)

Wenn trigger `subzone_id` hat UND session vorhanden UND esp_id+gpio gesetzt:
- Lädt `SubzoneRepository.get_subzone_by_gpio(esp_id, gpio_int)`
- Wenn Aktor-Subzone ≠ Trigger-Subzone → `return ActionResult(success=True, skipped=True)`
- Dies ist ein SKIP, kein Fehler

### OFF-Kopie bei Hysterese-Deaktivierung

**Erstellt von der Engine** (logic_engine.py:354-360), NICHT vom Executor:
```python
off_actions.append({
    **action,    # Kopie aller Felder
    "command": "OFF",
    "value": 0.0,
    "duration": 0,
})
```
Der Executor sieht nur den fertigen OFF-Befehl und führt ihn normal aus.

### Bidirektionale Action — nicht vorhanden

Kein Mechanismus `"wenn TRUE → ON, wenn FALSE → OFF"` im selben Action-Objekt. Jeder Aufruf sendet genau den `command`-Wert.

### Bewertung

**Bidirektionale Action möglich:** Ja, ohne Breaking Change:
```json
{
    "type": "actuator",
    "esp_id": "...", "gpio": 5,
    "command_on": "ON",
    "command_off": "OFF",
    "bidirectional": true
}
```
Executor müsste `context` lesen um zu wissen ob TRUE oder FALSE → erfordert Engine-Änderung um Boolean in Context zu injizieren. Der Executor selbst wäre einfach erweiterbar.

---

## Block 7: Config-Builder — Offline-Rule-Extraktion

### Datei

`src/services/config_builder.py` — MAX_OFFLINE_RULES = 8

### Qualifikationskriterien für Offline-Rules (_extract_offline_rule, Zeile 379)

1. `trigger_conditions` muss mind. eine `"type": "hysteresis"`-Condition mit `esp_id == target_esp` enthalten
2. Mindestens eine `"type": "actuator_command"/"actuator"`-Action mit `esp_id == target_esp` (lokale Regel)
3. Gültiges Threshold-Paar: `(activate_above + deactivate_below)` ODER `(activate_below + deactivate_above)`

### Filter-Logik

| Filter | Grund | Code |
|--------|-------|------|
| Analog-Sensor-Guard | `ph`, `ec`, `moisture` → ADC-Rohwert, kein physikalischer Vergleich möglich | `CALIBRATION_REQUIRED_SENSOR_TYPES` Zeile 101 |
| Cross-ESP | Sensor auf ESP A, Aktor auf ESP B → kann nicht lokal ausgeführt werden | Zeile 495-499 |
| Ungültiger GPIO | `sensor_gpio < 0` → skip | Zeile 461-467 |
| Compound excluded | Compound-Conditions werden durchsucht (Iteration über conditions_list), erste Hysterese-Condition wird extrahiert | Zeile 425-431 |

**VIRTUAL-Sensor-Filter:** In `build_combined_config()` für den Sensor-Config-Push (Zeile 218-222), NICHT in der Offline-Rule-Extraktion. Virtuell-Sensoren hätten aber kein Hysterese-Condition-Match im Normalfall.

### Offline-Rule JSON-Format (Zeile 547-555)

```json
{
    "actuator_gpio": 18,
    "sensor_gpio": 4,
    "sensor_value_type": "ds18b20",
    "activate_below": 0.0,
    "deactivate_above": 0.0,
    "activate_above": 28.0,
    "deactivate_below": 24.0,
    "current_state_active": false
}
```
`activate_below`/`deactivate_above` = 0.0 wenn Cooling-Modus (Heating-Felder ungenutzt). `current_state_active` kommt aus `logic_hysteresis_states` für den Restart-Safe-Init.

### Compound-Operator berücksichtigt?

Nein — für Compound-Conditions wird nur die ERSTE passende Hysterese-Condition extrahiert. Der AND/OR-Operator wird ignoriert. Eine Server-Regel mit `AND: hysteresis(temp) AND time_window(08-18)` würde als reine Temperatur-Hysterese-Rule auf dem ESP laufen — ohne Zeitfenster-Beschränkung.

### Server-Regel → ESP-Offline-Rules: n:1 Mapping

Eine Server-Regel erzeugt maximal EINE Offline-Rule (erste lokale Hysterese-Condition + erste lokale Aktor-Action). Mehrere Hysterese-Conditions in einer Regel → nur erste wird verwendet.

### ESP32-Firmware Datenstruktur (offline_rule.h)

```cpp
static const uint8_t MAX_OFFLINE_RULES = 8;  // Firmware + Server identisch

struct OfflineRule {
    bool    enabled;
    uint8_t actuator_gpio;
    uint8_t sensor_gpio;
    char    sensor_value_type[24];  // normalisierter Type, z.B. "sht31_temperature"
    float   activate_below;
    float   deactivate_above;
    float   activate_above;
    float   deactivate_below;
    bool    is_active;          // = current_state_active aus Config-Push
    bool    server_override;    // Server hat während Offline-Phase geschaltet → Rule überspringen
};
```

### Bewertung

**Zwei separate Hysterese-Conditions (Cooling + Heating):** Würden je EINE eigene Offline-Rule erzeugen. Das 8-Regeln-Limit bleibt der Kapazitätsdeckel — bei 4 bidirektionalen Regeln wären 8 Slots belegt.

**Einfache Operatoren als Offline-Rules:** Nicht unterstützt. Würde bedeuten: keine bidirektionale Steuerung (nur ON-Seite), plus der Kalibrierungsproblem-Guard würde greifen.

**Kapazitätsgrenzen:** MAX_OFFLINE_RULES = 8 auf Server (truncating mit Warning) UND Firmware. Kein NVS-Speicher-Problem für 8 Structs (ca. 200 Bytes total).

---

## Block 8: REST-API — Regel-CRUD und Rule-Test

### Datei

`src/api/v1/logic.py`, `src/schemas/logic.py` (678 Zeilen), `src/services/logic_service.py` (504 Zeilen)

### Alle Endpoints

| Methode | Pfad | Beschreibung | Auth |
|---------|------|--------------|------|
| GET | `/v1/logic/rules` | Liste aller Regeln (paginiert) | ActiveUser |
| POST | `/v1/logic/rules` | Regel erstellen | OperatorUser |
| GET | `/v1/logic/rules/{rule_id}` | Regeldetails | ActiveUser |
| PUT | `/v1/logic/rules/{rule_id}` | Regel aktualisieren | OperatorUser |
| DELETE | `/v1/logic/rules/{rule_id}` | Regel löschen | OperatorUser |
| POST | `/v1/logic/rules/{rule_id}/toggle` | Aktivieren/Deaktivieren | OperatorUser |
| POST | `/v1/logic/rules/{rule_id}/test` | Test/Simulation | OperatorUser |
| GET | `/v1/logic/execution_history` | Ausführungshistorie | ActiveUser |

Auth-Level: `ActiveUser` = eingeloggte User, `OperatorUser` = Operator + Admin.

### POST /v1/logic/rules — Validierungs-Schichten

```
POST Request Body
    → LogicRuleCreate (schemas/logic.py)
        conditions: List[Dict[str, Any]]  ← kein JSON-Schema-Enforcement
        actions: List[Dict[str, Any]]     ← kein JSON-Schema-Enforcement
    → LogicService.create_rule()
        → LogicValidator.validate()  ← business-logic validation (Duplikat-Check, etc.)
    → CrossESPLogic(**data)
        → @validates("trigger_conditions") → validate_conditions() (logic_validation.py)
            → validate_condition() per element
            → Bekannte Types: sensor_threshold, sensor, time_window, time, hysteresis, compound
            → UNBEKANNTE TYPES: ValueError("Unknown condition type: {cond_type}")
        → @validates("actions") → validate_actions() (logic_validation.py)
            → Bekannte Types: actuator_command, actuator, notification, delay, sequence, plugin, autoops_trigger
            → UNBEKANNTE TYPES: ValueError("Unknown action type: {action_type}")
```

### Kritischer Befund: Validierungsschichten

| Ebene | Validation | Unbekannte Felder | Unbekannte Types |
|-------|-----------|-------------------|-----------------|
| API (schemas/logic.py) | `List[Dict[str, Any]]` | AKZEPTIERT | AKZEPTIERT |
| Service (LogicValidator) | Business-Logic (Namen, Duplikate) | n/a | n/a |
| DB (@validates + Pydantic) | Pydantic-Modelle | **IGNORIERT** (extra='ignore') | **ABGELEHNT** |

**Fazit:**
- Neues Feld auf bekanntem Type (`"routing": "condition_0"` auf `actuator_command`): Wird bei DB-Speicherung ignoriert, aber im JSON gespeichert und bei API-Response zurückgegeben. **Erweiterung ohne Code-Änderung möglich.**
- Neuer Condition-Type (`"routing_node"`): Wird beim `@validates`-Hook abgelehnt. **Erfordert Änderung in `logic_validation.py`.**

### PUT /v1/logic/rules/{id} — Update

- Gleiche Validierungs-Pipeline wie POST
- `LogicRuleUpdate` verwendet Optional-Felder — nur gesendete Felder werden aktualisiert
- Interne Umbenennung: `conditions` → `trigger_conditions`, `name` → `rule_name` (Zeile 225-227 logic_service.py)

### POST /v1/logic/rules/{id}/test — Rule-Test

`LogicService.test_rule()` (logic_service.py:262):
1. Iteriert über `rule.conditions` (list format)
2. Baut Mock-Context mit `mock_sensor_values` aus Request
3. Evaluiert jede Condition einzeln mit passendem Evaluator
4. `dry_run=True`: Action-Details ohne Ausführung
5. `dry_run=False`: Tatsächliche Action-Ausführung (Vorsicht — echter MQTT-Befehl!)
6. Gibt `RuleTestResponse` mit `ConditionResult` pro Condition zurück:
   - `condition_index`, `condition_type`, `result: bool`, `details: str`, `actual_value: float|None`

**Diagnose-Wert:** Test-Endpoint hat bereits die Detail-Ergebnis-Struktur pro Condition — dies wäre die Basis für Action-Routing-Implementierung.

### POST /v1/logic/rules/{id}/toggle

Bei `enabled=False`: Sendet OFF an ALLE `actuator_command`/`actuator`-Actions der Regel (T18-F2 Fix). Kein Feld-Filter — alle Aktoren der Regel werden abgeschalten.

### Bewertung

**JSON-Routing-Feld einbringen OHNE API-Änderung:** Ja — für bestehende Condition/Action-Types. Beispiel: `{"type": "actuator", ..., "triggers_on": ["condition_0"]}` wird von der API durchgereicht, von Pydantic ignoriert, in JSON gespeichert, und kann von der Engine ausgewertet werden. Nur die Engine müsste das Feld lesen.

**Welche Pydantic-Modelle müssen erweitert werden für vollständiges Routing-Feature:**
1. `logic_validation.py`: `ActuatorCommandAction` + `SensorThresholdCondition` um optionale `routing`-Felder erweitern (damit klar dokumentiert)
2. `schemas/logic.py`: `ActuatorAction` + `SensorCondition` entsprechend erweitern
3. `logic_engine.py`: `_evaluate_rule()` und `_execute_actions()` für Routing-Logik

---

## Zusammenfassung

### Architektur-Stärken

1. **Saubere Evaluator-Executor-Trennung**: Jeder Condition-Typ hat seinen Evaluator, jeder Action-Typ seinen Executor. Neue Typen lassen sich ohne Engine-Änderung hinzufügen.

2. **Safety-Subsystem vollständig**: ConflictManager (asyncio.Lock pro esp:gpio), RateLimiter (DB-History), LoopDetector (separate Instanz) — Defense-in-Depth.

3. **Hysterese-Persistenz gelöst**: `logic_hysteresis_states` ist implementiert, aktiv genutzt und wird beim Server-Start geladen. Das ursprüngliche Problem (Zustand-Verlust bei Restart) ist behoben.

4. **Offline-Rules mit State-Transfer**: `current_state_active` im Config-Push sichert Hysterese-Kontinuität auch beim Server-Restart + Config-Push.

5. **Cross-Sensor-Evaluierung**: `_load_cross_sensor_values()` lädt fehlende Sensorwerte aus DB — Regeln mit mehreren Sensoren auf verschiedenen ESPs funktionieren.

6. **JSON-Validierung zweistufig**: API-Schemas sind offen (Dict), DB-Layer validiert via Pydantic — gute Balance zwischen Flexibilität und Sicherheit.

### Architektur-Schwächen / Erweiterungspunkte

| Nr | Problem | Auswirkung | Erweiterungspunkt |
|----|---------|------------|-------------------|
| W1 | **Kein Action-Routing**: Alle Conditions TRUE → alle Actions feuern | Bidirektionale Steuerung unmöglich (ON/OFF als ein Konzept) | `_evaluate_rule()` + `_execute_actions()` |
| W2 | **Flat-Model**: Graph-Topologie des Frontends geht bei Serialisierung verloren | Frontend-Kanten-Informationen sind nicht im Backend | JSON-Erweiterung in `trigger_conditions`/`actions` |
| W3 | **Hysterese Dual-Modus Bug**: UI zeigt 4 Felder, Backend nutzt immer nur 2 | Benutzer konfiguriert falsches Verhalten | Zwei separate Condition-Typen oder Modus-Feld |
| W4 | **CompoundEvaluator gibt nur bool zurück** | Action-Routing basierend auf spezifischer Sub-Condition nicht möglich | Return-Typ zu `EvaluationResult` ändern, oder Context-Injection |
| W5 | **`context["condition_index"] = 0` am Top-Level** | Bei Single-Condition-Regel mit Hysterese: immer index=0 (korrekt), aber bei List-Format ohne Compound: alle Conditions teilen denselben index (Hysterese-State-Key kollidiert) | `_check_conditions()` iterator für List-Format |
| W6 | **Compound-AND-Regel geht in Offline-Rule verloren**: Zeitfenster wird ignoriert | ESP aktiviert Aktor auch außerhalb des Zeitfensters | Offline-Rule-Extraktion müsste Zeitfenster enkodieren oder Compound-Regeln ausschließen |
| W7 | **get_rules_by_trigger_sensor(): Python-Filter über alle Regeln** | Skaliert schlecht bei >100 Regeln — vollständiger Table-Scan + Python-Filterung | DB-seitiger JSON-Filter (PostgreSQL jsonb containment) |
| W8 | **DiagnosticsConditionEvaluator**: In `LogicService` genutzt, aber NICHT in `logic_validation.py` registriert | Diagnostics-Conditions werden bei DB-Speicherung abgelehnt (Unknown type) | `logic_validation.py` um `DiagnosticsCondition`-Modell erweitern |

### Empfehlung für R2/R4

**Minimaler Pfad zu bidirektionaler Steuerung (ohne DB-Migration):**

1. **Neues Feld `"triggers_if"` in Actions** (optional, addierend):
   ```json
   {"type": "actuator", ..., "triggers_if": "true"}   // nur wenn Conditions TRUE
   {"type": "actuator", ..., "triggers_if": "false"}  // nur wenn Conditions FALSE
   ```
   - Kein Schema-Change nötig (Pydantic ignoriert extra Felder)
   - Engine wertet Feld in `_execute_actions()` aus
   - Kompatibel: Regeln ohne `triggers_if` verhalten sich wie bisher

2. **Hysterese-Dual-Modus Fix:**
   - Zwei neue Condition-Typen in `logic_validation.py`: `hysteresis_cooling`, `hysteresis_heating`
   - Bestehende `hysteresis`-Conditions bleiben (backward compat)
   - Offline-Rule-Extraktion: je Condition-Typ eine Regel

3. **CompoundEvaluator-Detail-Ergebnisse:** Über Context-Injection (non-breaking):
   ```python
   context["_condition_results"] = {idx: bool}  # Nach CompoundEvaluator
   ```
   Engine liest `_condition_results` für Routing-Entscheidung.

**Für vollständiges Redesign (R4):**
- `trigger_conditions` als `List` statt gemischtes `Dict|List` standardisieren
- Routing-Metadaten in separater `routing` Spalte oder `rule_metadata` JSON
- Optionaler ELSE-Block als separates `else_actions` JSON-Feld in der Tabelle (nullable)

---

*Bericht erstellt von server-dev (R1-BE Analyse). Kein Code geändert.*
*Basiert auf: logic_engine.py (1067Z), hysteresis_evaluator.py (389Z), sensor_evaluator.py (200Z), compound_evaluator.py (107Z), actuator_executor.py (155Z), config_builder.py (557Z), db/models/logic.py (424Z), db/models/logic_validation.py (427Z), schemas/logic.py (678Z), api/v1/logic.py (626Z), db/repositories/logic_repo.py (300Z), offline_rule.h (29Z)*
