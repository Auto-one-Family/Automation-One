# Auftrag L2: Hysterese-Haertung

**Ziel-Repo:** auto-one (El Servador + El Frontend)
**Typ:** Backend-Fixes (4) + Frontend-Fixes (2) + Tests (3)
**Prioritaet:** HIGH
**Datum:** 2026-03-29
**Geschaetzter Aufwand:** ~5-7h
**Abhaengigkeit:** L1 (Verifikation bestaetigt Basis)
**Blockiert:** L4, L5

---

## Auftragsziel

Die Deep Dive Analyse hat ergeben, dass die grundlegende Hysterese-Funktionalitaet existiert und korrekt arbeitet (F3+F4 gefixt, Deaktivierungs-Bypass fuer automatisches OFF implementiert). Dieser Auftrag haertet die Hysterese-Pipeline gegen 5 neue Findings ab und schreibt die fehlenden Tests.

**Ergebnis:** 6 Code-Fixes committed + 3 Test-Dateien, alle Tests gruen.

---

## System-Kontext

### Hysterese in AutomationOne — So funktioniert es aktuell

Die Logic Engine ist ein Background-Service im FastAPI-Backend (`El Servador`). Sie empfaengt Sensor-Daten per MQTT, wertet Regeln aus, und sendet Aktor-Befehle per MQTT zurueck an den ESP.

**Evaluierungs-Datenfluss:**
```
MQTT sensor/data → SensorHandler.handle_sensor_data()
  → asyncio.create_task(logic_engine.evaluate_sensor_data())
    → Alle aktivierten Regeln laden (cross_esp_logic Tabelle)
    → Pro Regel: _evaluate_rule()
      → _check_conditions_modular()
        → Delegiert an registrierte ConditionEvaluatoren
        → HysteresisConditionEvaluator.evaluate()
          → _matches_sensor() pruefen
          → State laden (in-memory dict)
          → Schwellenwert-Vergleich (Heating oder Cooling Modus)
          → State aktualisieren
          → Bei Deaktivierung: context["_hysteresis_just_deactivated"] = True
      → Wenn conditions_met=False UND _hysteresis_just_deactivated:
        → OFF-Kopien aller Actuator-Actions erstellen
        → OHNE Cooldown-Check ausfuehren
      → Wenn conditions_met=True:
        → Cooldown + RateLimit pruefen
        → Actions ausfuehren (ActuatorActionExecutor → MQTT → ESP)
      → Ergebnis in logic_execution_history loggen
```

### HysteresisConditionEvaluator — Aktueller Code

**Datei:** `El Servador/god_kaiser_server/src/services/logic/conditions/hysteresis_evaluator.py` (302 Zeilen)

**State-Speicher:** In-Memory Dictionary `self._states: Dict[str, HysteresisState]`

**State-Key:** `"{rule_id}:{condition_index}"` (z.B. `"550e8400-...:0"`)

**HysteresisState Dataclass:**
```python
@dataclass
class HysteresisState:
    is_active: bool = False           # Ist der Aktor aktuell AN?
    last_activation: Optional[datetime] = None
    last_deactivation: Optional[datetime] = None
    last_value: Optional[float] = None
```

**Zwei Betriebsmodi:**

| Modus | Anwendung | Aktivierung | Deaktivierung |
|-------|-----------|-------------|---------------|
| **Heating** | Befeuchtung, Heizung | `value < activate_below` | `value > deactivate_above` |
| **Cooling** | Kuehlung, Lueftung | `value > activate_above` | `value < deactivate_below` |

**Modus-Erkennung:** Automatisch basierend auf welche Felder gesetzt sind:
- `activate_below` + `deactivate_above` vorhanden → Heating-Modus
- `activate_above` + `deactivate_below` vorhanden → Cooling-Modus
- Beide Paare vorhanden → Cooling hat Vorrang (Code prueft `activate_above` zuerst, Zeile 145, vor `activate_below`, Zeile 171)

**Sensor-Matching:** `_matches_sensor()` prueft `esp_id`, `gpio`, `sensor_type`. Bei nicht-matchendem Sensor: Gibt aktuellen `is_active`-Wert zurueck (State bleibt erhalten, keine Aenderung).

### Registrierungsstellen fuer Evaluatoren

Die Logic Engine hat **3 Stellen** wo Condition-Evaluatoren registriert werden:

| Stelle | Datei | Zeilen | Verwendung |
|--------|-------|--------|------------|
| `main.py` | `main.py:629-656` | Produktiv — wird beim Server-Start aufgerufen |
| `logic_engine.py` | `logic_engine.py:73-84` | Fallback — wenn `__init__` ohne explizite Evaluatoren aufgerufen wird |
| `logic_service.py` | `logic_service.py:68-78` | Rule-Test — fuer `POST /logic/rules/{id}/test` (Trockenlauf) |

**Aktuell registriert:**
- Sensor, Time, Hysteresis, Compound in allen 3 Stellen ✅
- Diagnostics nur in `main.py` ✅ — fehlt in `logic_service.py` ❌ (Finding N4) UND in `logic_engine.py:73-84` (Fallback-Pfad, niedrig-prioritaer da `main.py` produktiv steuert)

### Relevante DB-Tabellen

| Tabelle | Felder (relevant) | Verwendung |
|---------|--------------------|------------|
| `cross_esp_logic` | rule_name, trigger_conditions (JSON), actions (JSON), enabled, cooldown_seconds | Regel-Definitionen |
| `logic_execution_history` | rule_id, trigger_data, actions_executed, success, timestamp | Ausfuehrungs-Protokoll |
| `actuator_states` | esp_id, gpio, state (on/off/…), current_value, updated_at | Aktueller Aktor-Zustand |

---

## Fix 1: Hysterese-State persistieren (N2) — HAUPTARBEIT

### Problem

Der Hysterese-State lebt nur im Arbeitsspeicher (`self._states`). Nach Server-Neustart:
1. Alle `HysteresisState` werden auf `is_active=False` zurueckgesetzt
2. Aktoren die in einem Hysterese-ON-Zustand waren erhalten kein OFF
3. Erst wenn der naechste Sensor-Wert den Deaktivierungs-Schwellenwert kreuzt, wird OFF gesendet
4. Bis dahin laeuft der Aktor unkontrolliert — im schlimmsten Fall bis RuntimeProtection greift (Default: 1h)

**Konkretes Szenario:**
```
09:00 Feuchte 40% → Befeuchter AN (is_active=True)
09:05 Server-Restart (z.B. Docker-Update, Crash)
09:06 Feuchte 50% → is_active=False (Restart-Default)
       50% < 45%? NEIN → nicht aktivieren
       50% > 55%? NEIN → nicht deaktivieren
       → Befeuchter laeuft weiter bis Runtime Protection (1h!)
```

### IST-Zustand

```python
# hysteresis_evaluator.py (vereinfacht)
class HysteresisConditionEvaluator:
    def __init__(self):
        self._states: Dict[str, HysteresisState] = {}  # NUR in-memory

    def _get_state(self, key: str) -> HysteresisState:
        if key not in self._states:
            self._states[key] = HysteresisState()  # Default: is_active=False
        return self._states[key]
```

### SOLL-Zustand

**Neue DB-Tabelle:** `logic_hysteresis_states`

```python
# Neues SQLAlchemy Model
class LogicHysteresisState(Base):
    __tablename__ = "logic_hysteresis_states"

    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_id = Column(UUID, ForeignKey("cross_esp_logic.id", ondelete="CASCADE"), nullable=False)
    condition_index = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=False)
    last_value = Column(Float, nullable=True)
    last_activation = Column(DateTime(timezone=True), nullable=True)
    last_deactivation = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("rule_id", "condition_index", name="uq_hysteresis_state_rule_cond"),
    )
```

**Wichtige Design-Regeln:**
- `DateTime(timezone=True)` ist Pflicht in AutomationOne — ALLE DateTime-Felder muessen timezone-aware sein
- `CASCADE` Delete: Wenn eine Regel geloescht wird, wird der Hysterese-State mitgeloescht
- `UniqueConstraint` auf `(rule_id, condition_index)` — pro Regel+Condition-Position genau ein State

**Anpassungen am HysteresisConditionEvaluator:**

```python
class HysteresisConditionEvaluator:
    def __init__(self, session_factory=None):
        self._states: Dict[str, HysteresisState] = {}  # Weiterhin in-memory Cache
        self._session_factory = session_factory          # Fuer DB-Zugriff

    async def load_states_from_db(self):
        """Beim Startup: Alle States aus DB laden."""
        if not self._session_factory:
            return
        async with self._session_factory() as session:
            result = await session.execute(select(LogicHysteresisState))
            for row in result.scalars():
                key = f"{row.rule_id}:{row.condition_index}"
                self._states[key] = HysteresisState(
                    is_active=row.is_active,
                    last_activation=row.last_activation,
                    last_deactivation=row.last_deactivation,
                    last_value=row.last_value,
                )

    async def _persist_state(self, key: str, state: HysteresisState):
        """Nach jeder State-Aenderung: In DB schreiben."""
        if not self._session_factory:
            return
        rule_id, condition_index = key.split(":", 1)
        async with self._session_factory() as session:
            await session.execute(
                insert(LogicHysteresisState)
                .values(
                    rule_id=rule_id,
                    condition_index=int(condition_index),
                    is_active=state.is_active,
                    last_value=state.last_value,
                    last_activation=state.last_activation,
                    last_deactivation=state.last_deactivation,
                )
                .on_conflict_do_update(
                    index_elements=["rule_id", "condition_index"],
                    set_={
                        "is_active": state.is_active,
                        "last_value": state.last_value,
                        "last_activation": state.last_activation,
                        "last_deactivation": state.last_deactivation,
                        "updated_at": func.now(),
                    },
                )
            )
            await session.commit()
```

**Startup-Integration:**
```python
# In main.py lifespan (nach Evaluator-Erstellung, vor logic_engine.start()):
hysteresis_evaluator = HysteresisConditionEvaluator(session_factory=get_session)
await hysteresis_evaluator.load_states_from_db()
```

**Alembic-Migration:**
- Neue Migration erstellen: `alembic revision --autogenerate -m "add logic_hysteresis_states table"`
- Sicherstellen dass die Migration `logic_hysteresis_states` Tabelle erstellt
- Downgrade muss Tabelle droppen

### Implementierungs-Schritte

1. Model erstellen in `El Servador/god_kaiser_server/src/db/models/logic.py` (dort leben bereits `CrossESPLogic` + `LogicExecutionHistory` — konsistenter als neues File)
2. Alembic-Migration erstellen und ausfuehren
3. `hysteresis_evaluator.py` anpassen:
   - `__init__` erweitern um `session_factory`
   - `load_states_from_db()` hinzufuegen
   - `_persist_state()` hinzufuegen
   - In `evaluate()`: nach jeder State-Aenderung `_persist_state()` aufrufen (nur bei Aenderung, nicht bei jedem Call)
4. `main.py` anpassen: `session_factory` an HysteresisEvaluator uebergeben, `load_states_from_db()` im Startup aufrufen
5. Optional: `logic_service.py` — fuer Rule-Tests keine DB-Persistenz noetig (Tests sind stateless)

### Akzeptanzkriterien Fix 1

- [ ] Neue Tabelle `logic_hysteresis_states` existiert (Migration laeuft sauber)
- [ ] Beim Server-Start werden bestehende States aus DB geladen
- [ ] Bei State-Aenderung (Aktivierung/Deaktivierung) wird State in DB geschrieben
- [ ] Nach Server-Restart: Hysterese-State korrekt wiederhergestellt
- [ ] CASCADE Delete: Regel loeschen → State-Zeile wird mitgeloescht
- [ ] Performance: DB-Write nur bei State-AENDERUNG, nicht bei jedem Evaluierungsaufruf

---

## Fix 2: condition_index dynamisch setzen (N1)

### Problem

**Datei:** `logic_engine.py:339`

```python
context = {
    ...
    "condition_index": 0,  # IMMER 0, unabhaengig von Position in Compound-Regel
}
```

Fuer Compound-Regeln mit mehreren Conditions (z.B. AND: Humidity-Hysterese + Time-Window) wird der Hysterese-State-Key immer `"{rule_id}:0"` — egal ob die Hysterese-Condition an Position 0, 1 oder 2 steht. Bei zwei Hysterese-Conditions in derselben Compound-Regel wuerden beide denselben State-Key teilen.

**Vergleich:** `logic_service.py:359` macht es korrekt: `condition_index=idx` wird pro Sub-Condition gesetzt.

### IST-Zustand

```python
# logic_engine.py:339 (vereinfacht)
context = {
    "sensor_data": sensor_data,
    "sensor_values": sensor_values,
    "current_time": datetime.now(),
    "rule_id": str(rule.id),
    "condition_index": 0,  # ← PROBLEM: Immer 0
}
```

### SOLL-Zustand

Der `condition_index` muss im `CompoundConditionEvaluator` pro Sub-Condition dynamisch gesetzt werden.

**Wichtig:** `_check_conditions_modular()` (Zeile 502) erhaelt ein einzelnes `conditions`-Dict, nicht eine Liste — sie findet den passenden Evaluator und delegiert. Die Iteration ueber Sub-Conditions passiert im `CompoundConditionEvaluator` (Zeile 86), der `context` unveraendert an Sub-Evaluatoren weiterreicht. Deshalb ist NUR der CompoundEvaluator die richtige Stelle fuer den Fix.

**Hinweis zum Entry-Point:** `_check_conditions()` (Zeile 464) ist der eigentliche Entry-Point, der intern an `_check_conditions_modular()` delegiert.

**Fix im CompoundConditionEvaluator:**

```python
# compound_evaluator.py (vereinfacht)
class CompoundConditionEvaluator:
    def evaluate(self, condition, context):
        sub_conditions = condition.get("conditions", [])
        for idx, sub_cond in enumerate(sub_conditions):
            # Condition-Index pro Sub-Condition setzen
            sub_context = {**context, "condition_index": idx}
            result = self._evaluate_sub(sub_cond, sub_context)
            ...
```

Der CompoundEvaluator hat die Verantwortung fuer seine Sub-Conditions — er muss den Index setzen, bevor er delegiert.

### Akzeptanzkriterien Fix 2

- [ ] Compound-Regeln mit Hysterese an Position > 0 erzeugen korrekte State-Keys
- [ ] Zwei Hysterese-Conditions in einer Compound-Regel haben unterschiedliche State-Keys
- [ ] Bestehende Single-Condition-Regeln (condition_index=0) funktionieren weiterhin

---

## Fix 3: GPIO int()-Coercion in HysteresisEvaluator (N5)

### Problem

**Datei:** `hysteresis_evaluator.py:250`

Der `SensorConditionEvaluator` (`sensor_evaluator.py:103`) nutzt `int()` Coercion fuer GPIO-Vergleiche:
```python
int(cond_gpio) == int(data_gpio)
```

Der `HysteresisConditionEvaluator` macht einen direkten Vergleich:
```python
cond_gpio != data_gpio  # Kein int()-Cast
```

Wenn GPIO als Float aus JSON kommt (z.B. `5.0` statt `5`), matcht der SensorEvaluator korrekt, aber der HysteresisEvaluator nicht.

### Fix

```python
# hysteresis_evaluator.py:250 (in _matches_sensor)
# IST:
if condition.get("gpio") != sensor_data.get("gpio"):
    return False

# SOLL:
if int(condition.get("gpio", 0)) != int(sensor_data.get("gpio", 0)):
    return False
```

### Akzeptanzkriterien Fix 3

- [ ] GPIO als int, float und string matcht korrekt (z.B. `5`, `5.0`, `"5"`)
- [ ] GPIO 0 (I2C-Konvention fuer SHT31) matcht korrekt

---

## Fix 4: DiagnosticsConditionEvaluator in LogicService (N4)

### Problem

**Datei:** `logic_service.py:68-78`

`DiagnosticsConditionEvaluator` ist in `main.py:629-656` registriert (produktiv), aber fehlt in `logic_service.py:68-78` (Rule-Test-Pfad). Wenn ein User `POST /api/v1/logic/rules/{id}/test` auf eine Regel mit `diagnostics_status`-Condition aufruft, wird die Condition als `False` gewertet (stille Fehler).

### Fix

```python
# logic_service.py:68-78
# Diagnostics-Evaluator analog zu main.py hinzufuegen:
diagnostics_eval = DiagnosticsConditionEvaluator(session_factory=get_session)
# In die Evaluator-Liste + als Sub-Evaluator fuer CompoundEvaluator aufnehmen
```

### Akzeptanzkriterien Fix 4

- [ ] `POST /logic/rules/{id}/test` wertet `diagnostics_status`-Conditions aus (nicht silent False)
- [ ] Bestehende Regel-Tests (sensor, time, hysteresis) funktionieren weiterhin

---

## Fix 5: extractSensorConditions() um hysteresis erweitern (N6)

### Problem

**Datei:** `El Frontend/src/types/logic.ts:304-315`

```typescript
function extractSensorConditions(conditions: LogicCondition[]): SensorCondition[] {
  for (const cond of conditions) {
    if (cond.type === 'sensor' || cond.type === 'sensor_threshold') {
      result.push(cond as SensorCondition)
    } else if (cond.type === 'compound') {
      result.push(...extractSensorConditions((cond as CompoundCondition).conditions))
    }
    // 'hysteresis' wird NICHT behandelt → LinkedRulesSection zeigt diese Regeln nicht
  }
}
```

**Auswirkung:** `LinkedRulesSection.vue` (HardwareView L2) zeigt Hysterese-Regeln nicht bei den verknuepften Sensoren/Aktoren an. Der User sieht nicht, welche Hysterese-Regeln einen bestimmten Sensor verwenden.

### Fix

```typescript
function extractSensorConditions(conditions: LogicCondition[]): SensorCondition[] {
  for (const cond of conditions) {
    if (cond.type === 'sensor' || cond.type === 'sensor_threshold') {
      result.push(cond as SensorCondition)
    } else if (cond.type === 'hysteresis') {
      // Hysterese-Conditions enthalten dieselben Sensor-Felder (esp_id, gpio, sensor_type)
      result.push(cond as unknown as SensorCondition)
    } else if (cond.type === 'compound') {
      result.push(...extractSensorConditions((cond as CompoundCondition).conditions))
    }
  }
}
```

**Hinweis:** Die `HysteresisCondition` hat die Felder `esp_id`, `gpio`, `sensor_type` — dieselben wie `SensorCondition`. Der Cast ist daher semantisch korrekt. Falls TypeScript sich beschwert: Ein explizites Mapping der relevanten Felder ist sauberer als `unknown`-Cast. Alternative:

```typescript
} else if (cond.type === 'hysteresis') {
  const hCond = cond as HysteresisCondition
  result.push({
    type: 'sensor',
    esp_id: hCond.esp_id,
    gpio: hCond.gpio,
    sensor_type: hCond.sensor_type,
  } as SensorCondition)
}
```

### Akzeptanzkriterien Fix 5

- [ ] LinkedRulesSection zeigt Hysterese-Regeln bei den verknuepften Sensoren
- [ ] TypeScript kompiliert ohne Fehler (`vue-tsc --noEmit` + Build)

---

## Fix 6: Number('') → null statt 0 (N7)

### Problem

**Datei:** `El Frontend/src/components/rules/RuleConfigPanel.vue`

Input-Handler fuer Hysterese-Felder: Wenn der User ein Schwellenwert-Feld leert, wird `Number('')` = `0` gespeichert, nicht `null`. Dadurch wird `activateBelow != null` true obwohl das Feld leer sein sollte.

**Resultat:** Corrupted Condition mit beiden Schwellenwert-Paaren (Cooling 0/0 + Heating-Werte). Der Evaluator erkennt beide Paare als gesetzt und waehlt Cooling (Vorrang-Regel, `activate_above` wird zuerst geprueft), wobei die Cooling-Werte (0/0) unsinnig sind.

### Fix

Die Hysterese-Felder werden ueber inline `@input`-Handler in `RuleConfigPanel.vue` verarbeitet (Zeilen 412, 423, 437, 448). Dort passiert der fehlerhafte `Number()`-Cast.

**IST (4 Handler, Zeilen 412/423/437/448):**
```html
@input="updateField('activateBelow', Number(($event.target as HTMLInputElement).value))"
```

**SOLL — Option A (inline, minimal-invasiv):**
```html
@input="updateField('activateBelow', ($event.target as HTMLInputElement).value === ''
  ? null : Number(($event.target as HTMLInputElement).value))"
```

**SOLL — Option B (sauberer, Helper-Funktion):**
```typescript
// Im <script setup>:
function parseNumericOrNull(value: string): number | null {
  return value === '' ? null : Number(value)
}
```
```html
@input="updateField('activateBelow', parseNumericOrNull(($event.target as HTMLInputElement).value))"
```

Option B ist bevorzugt — weniger Duplikation, klarer Intent.

Dieses Pattern auf alle 4 `@input`-Handler anwenden:
- `activateBelow` (Zeile 412)
- `deactivateAbove` (Zeile 423)
- `activateAbove` (Zeile 437)
- `deactivateBelow` (Zeile 448)

### Akzeptanzkriterien Fix 6

- [ ] Leere Hysterese-Felder erzeugen `null` (nicht `0`)
- [ ] Nur gesetzte Schwellenwert-Paare werden in der Condition gespeichert
- [ ] Eine Befeuchtungs-Regel (Heating) hat NUR `activate_below` + `deactivate_above`, NICHT zusaetzlich `activate_above=0` + `deactivate_below=0`

---

## Tests

### TEST-1: HysteresisEvaluator Unit-Tests

**Neue Datei:** `El Servador/god_kaiser_server/tests/unit/test_hysteresis_evaluator.py`

**Test-Szenarien:**

```python
# 1. Heating-Modus (Befeuchtung)
# activate_below=45, deactivate_above=55
# Feuchte 40% → is_active=True (Befeuchter AN)
# Feuchte 50% → is_active bleibt True (im Deadband)
# Feuchte 56% → is_active=False (Befeuchter AUS)
# Feuchte 50% → is_active bleibt False (im Deadband)
# Feuchte 44% → is_active=True (wieder AN)

# 2. Cooling-Modus (Kuehlung)
# activate_above=28, deactivate_below=24
# Temp 30° → is_active=True (Luefter AN)
# Temp 26° → is_active bleibt True (im Deadband)
# Temp 23° → is_active=False (Luefter AUS)

# 3. Sensor-Matching
# Korrekte esp_id + gpio + sensor_type → evaluiert
# Falsche esp_id → ignoriert (State unveraendert)
# Falscher sensor_type → ignoriert

# 4. GPIO int()-Coercion (Fix N5)
# gpio als int(5), float(5.0), string("5") → alle muessen matchen

# 5. _hysteresis_just_deactivated Flag
# Bei Deaktivierung: context["_hysteresis_just_deactivated"] = True
# Bei Aktivierung: Flag NICHT gesetzt
# Bei kein Match: Flag NICHT gesetzt

# 6. State-Key Isolation
# Regel A und Regel B mit unterschiedlichen State-Keys
# Regel A aktiviert → Regel B State bleibt unberuehrt
```

### TEST-2: State-Persistenz nach Restart

**Neue Datei:** `El Servador/god_kaiser_server/tests/integration/test_hysteresis_persistence.py`

```python
# 1. Evaluator erstellen mit session_factory
# 2. Hysterese-Regel evaluieren → State wird ON
# 3. State in DB pruefen: is_active=True
# 4. NEUEN Evaluator erstellen (simuliert Restart)
# 5. load_states_from_db() aufrufen
# 6. State pruefen: is_active=True (aus DB geladen)
# 7. Evaluation mit Wert im Deadband → State bleibt ON (kein falsches OFF)

# 8. Regel loeschen → CASCADE → State-Zeile weg
```

### TEST-3: Compound-Regel mit Hysterese

**In bestehende Test-Datei integrieren** (z.B. `El Servador/god_kaiser_server/tests/integration/test_logic_engine_resilience.py`)

```python
# 1. Compound-Regel erstellen: AND(Hysterese(idx=0), TimeWindow(idx=1))
# 2. Beide Conditions evaluieren
# 3. State-Key pruefen: "rule_id:0" (nicht "rule_id:0" fuer beide)
# 4. Zweite Compound-Regel: AND(TimeWindow(idx=0), Hysterese(idx=1))
# 5. State-Key pruefen: "rule_id:1"
# 6. Keine Key-Kollision zwischen den Regeln
```

### Akzeptanzkriterien Tests

- [ ] Alle Tests laufen gruen mit `pytest El Servador/god_kaiser_server/tests/unit/test_hysteresis_evaluator.py`
- [ ] Persistenz-Tests laufen gruen mit `pytest El Servador/god_kaiser_server/tests/integration/test_hysteresis_persistence.py`
- [ ] Compound-Test laeuft gruen
- [ ] Bestehende Logic-Engine-Tests sind NICHT gebrochen (Regression-Check: `pytest El Servador/god_kaiser_server/tests/integration/test_logic_engine*.py`)

---

## Reihenfolge der Implementierung

Die Fixes haben logische Abhaengigkeiten — diese Reihenfolge minimiert Konflikte:

| Schritt | Fix | Begruendung |
|---------|-----|-------------|
| 1 | Fix 3 (GPIO int()-Coercion) | Kleinster Fix, keine Abhaengigkeiten, sofort testbar |
| 2 | Fix 4 (DiagnosticsEval in LogicService) | Kleinster Fix, keine Abhaengigkeiten |
| 3 | Fix 2 (condition_index dynamisch) | Muss VOR Fix 1, weil State-Keys davon abhaengen |
| 4 | Fix 1 (State-Persistenz) | Hauptarbeit, baut auf korrektem condition_index auf |
| 5 | Fix 5 (extractSensorConditions) | Frontend, unabhaengig von Backend |
| 6 | Fix 6 (Number('') → null) | Frontend, unabhaengig von Backend |
| 7 | TEST-1, TEST-2, TEST-3 | Nach allen Fixes |

**Backend-Fixes (1-4) und Frontend-Fixes (5-6) koennen parallel bearbeitet werden.**

---

## Einschraenkungen

- **Keine UX-Aenderungen:** Hysterese-Node-Palette, RuleConfigPanel-Layout etc. sind Thema von L4
- **Keine neuen Features:** Nur bestehende Funktionalitaet haerten
- **Keine Performance-Optimierung:** DB-Write bei jeder State-Aenderung ist akzeptabel (max 1x pro Sensor-Update, typisch alle 10-30s)
- **Migration muss reversibel sein:** Alembic Downgrade muss sauber funktionieren
- **Bestehende Tests duerfen nicht brechen:** Regression-Check ist Pflicht

---

**Ende Auftrag L2.**
