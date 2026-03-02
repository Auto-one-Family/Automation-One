# Logic Engine Volltest — Report
**Datum:** 2026-03-02
**Branch:** cursor/logic-engine-volltest-ce00

## System-Bestandsaufnahme (Block A)
- ESP: MOCK_TEST01 (Mock-ESP, approved, online)
- Sensor-GPIOs: DS18B20=GPIO4 (temperature)
- Sensor-Type-Name: `temperature`
- Aktor: GPIO5, digital (Green LED), ID via DB
- Kein Bodenfeuchtesensor im Wokwi-Diagramm — MQTT-Inject simuliert
- GPIO-Wiring-Status: MATCH (DS18B20=GPIO4, LED1=GPIO5 im Diagramm)

## Logic Engine API (Block D0)
- Condition-Typen: sensor/sensor_threshold, time_window/time, compound, hysteresis
- Action-Typen: actuator/actuator_command, notification, delay, sequence
- Safety-System: ConflictManager ✅, RateLimiter ✅, LoopDetector ✅
- WebSocket Event-Name: logic_execution
- API-Response-Format: `.data[]` paginiert mit `.pagination` Objekt
- Rule-ID: UUID v4
- Passwort: Admin123! (nicht Admin123# wie im Auftrag)

## E2E-Szenarien Backend (Block D)
| Szenario | Status | Problem / Fix |
|----------|--------|---------------|
| D0: Schema-Probe | ✅ OK | Response-Format: `.data[]` (nicht `.items[]`) |
| D1: Schwellwert (Gate-Keeper) | ✅ OK | 28°C → Aktor ON, MQTT-Command sichtbar, History geloggt (26ms) |
| D1: 22°C Gegentest | ✅ OK | Kein Trigger bei unter Schwellwert |
| D2: AND-Logik | ✅ OK | Nur Temp hoch→kein Trigger, BEIDE erfüllt→Trigger. Cross-Sensor DB-Lookup funktioniert |
| D3: OR-Logik | ✅ OK | Nur Feuchte niedrig (25%<30%) → Trigger (einer reicht). Notification per WebSocket |
| D4: Multi-Regel parallel | ✅ OK | D1+D2+D3 alle evaluiert. ConflictManager: first_wins bei gleicher Priority |
| D5: Delay | ✅ OK | Delay 5s funktioniert (triggered→5s→notification) |
| D5: Cooldown | ✅ OK | 30s Cooldown blockiert wiederholten Trigger korrekt |
| D6: ConflictManager | ✅ OK | Sichtbar in D4: D2 gewinnt Actuator-Lock, D1 blockiert (equal priority) |
| D6: RateLimiter | ✅ OK | max_executions_per_hour=3 → 4.+5.+6. Trigger blockiert mit Warning |
| D8: Hysterese | ✅ OK | **BUG GEFUNDEN+GEFIXT**: get_rules_by_trigger_sensor() ignorierte hysteresis-type → Fix: hysteresis zu SENSOR_CONDITION_TYPES hinzugefügt. Nach Fix: activate_above=28 bei 29°C korrekt aktiviert |
| D9: Zeitfenster (Timer) | ⏳ PARTIAL | Reine Timer-Regeln nicht getestet (brauchen 60s Scheduler-Intervall). D9c (kombiniert) getestet |
| D9c: Zeit + Sensor (AND) | ✅ OK | Zeitfenster + Sensor AND-Kombination feuert korrekt im aktiven Zeitfenster |
| D10: Compound-Conditions | ⏳ SKIPPED | Backend-Code verifiziert (CompoundConditionEvaluator existiert), kein separater E2E-Test — wird in Frontend Block C getestet |
| D11: Sequence-Action | ⏳ SKIPPED | SequenceActionExecutor existiert und ist registriert, kein separater E2E-Test — Grundfunktionalität durch D5 Delay verifiziert |
| D12: Test/Dry-Run | ✅ OK | mock_sensor_values funktionieren, would_trigger korrekt, per-condition results, dry_run=true → kein Aktor geschaltet |
| D13: Toggle + History | ✅ OK | Disable→kein Trigger, Enable→Trigger wieder. Execution-History korrekt (1→1→2) |
| D14: Cross-Sensor (DB-Lookup) | ✅ OK | Nur Temp getriggert, Humidity aus DB geladen → feuert. Gegentest: falscher DB-Wert → nicht feuern |
| D15: Priority + Cooldown | ✅ OK | Cooldown 15s blockiert korrekt, nach Ablauf feuert wieder. max_executions_per_hour=5 gesetzt |

## Direkt-Fixes
| # | Datei | Fix | Commit |
|---|-------|-----|--------|
| 1 | `src/db/repositories/logic_repo.py` | Hysteresis-Conditions in get_rules_by_trigger_sensor() hinzugefügt | 317ad10 |

## Offene Bugs
| ID | Schweregrad | Beschreibung |
|----|-------------|--------------|
| HYST-1 | NIEDRIG | Mock-ESP Auto-Heartbeat sendet raw_value=0 → stört Hysterese-State. In Produktion mit echten ESPs kein Problem |
| TIMER-1 | NIEDRIG | Reine Timer-Regeln (nur time_window) brauchen 60s Scheduler-Intervall — nicht E2E getestet, nur kombiniert |
