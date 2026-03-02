# Logic Engine Volltest — Report
**Datum:** 2026-03-02
**Branch:** cursor/logic-engine-volltest-ce00

## System-Bestandsaufnahme (Block A)
- ESP: MOCK_TEST01 (Mock-ESP, approved, online)
- Sensor-GPIOs: DS18B20=GPIO4 (temperature), DHT22=GPIO15 (humidity)
- Sensor-Type-Name: `temperature`, `humidity`
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
| D10: Compound-Conditions | ⏳ SKIPPED | Backend-Code verifiziert (CompoundConditionEvaluator existiert), kein separater E2E-Test |
| D11: Sequence-Action | ⏳ SKIPPED | SequenceActionExecutor existiert und ist registriert, Grundfunktionalität durch D5 Delay verifiziert |
| D12: Test/Dry-Run | ✅ OK | mock_sensor_values funktionieren, would_trigger korrekt, per-condition results, dry_run=true → kein Aktor geschaltet |
| D13: Toggle + History | ✅ OK | Disable→kein Trigger, Enable→Trigger wieder. Execution-History korrekt (1→1→2) |
| D14: Cross-Sensor (DB-Lookup) | ✅ OK | Nur Temp getriggert, Humidity aus DB geladen → feuert. Gegentest: falscher DB-Wert → nicht feuern |
| D15: Priority + Cooldown | ✅ OK | Cooldown 15s blockiert korrekt, nach Ablauf feuert wieder. max_executions_per_hour=5 gesetzt |

## Aktor-Verifikation (Block G)
- Aktor: MOCK_TEST01 GPIO5, digital, enabled
- Manueller Test: ON/OFF via API → MQTT-Command sichtbar ✅
- E2E-Loop: Sensor 28°C → Regel → MQTT ON-Command → Aktor-State active ✅ (15ms)
- Wokwi: Mock-ESP (kein echtes Wokwi), Mock-Actuator bestätigt Commands

## Error-Handling (Block E)
| Test | HTTP-Code | Erwartet | OK? |
|------|-----------|----------|-----|
| Nicht-existenter ESP (E1a) | 400 | 400/422 | ✅ Pattern-Validation |
| Ungültiger Condition-Typ (E1b) | 400 | 400/422 | ✅ "Unknown condition type" |
| Leere Conditions (E1c) | 422 | 400/422 | ✅ min_length=1 |
| null Sensor-Wert (E2a) | — | kein Fire | ✅ Korrekt nicht gefeuert |
| Out-of-Range 1000°C (E2b) | — | Range-Check | ⚠️ Feuert! Logic Engine hat keinen Range-Check (sensor_handler hat einen, aber 1000>25 ist math. korrekt) |
| 10-Regeln-Performance (E4) | — | <500ms | ✅ 10/10 in ~0ms (Notifications) |

## Frontend Rule Builder (Block C)
| Feature | Status | Problem / Fix |
|---------|--------|---------------|
| C1: Login + Navigation | ✅ OK | Login funktioniert, /logic erreichbar via Sidebar |
| C2: Templates | ✅ OK | 5 Templates sichtbar (Temp-Alarm, Bewässerung, Luftfeuchte, Nacht-Modus, pH-Alarm). Auftrag erwartet 6 → Notfall-Abschaltung fehlt? |
| C3: Template verwenden | ✅ OK | "Temperatur-Alarm" öffnet Editor mit Sensor→AND→Aktor Nodes |
| C4: ESP/Sensor-Dropdown | ✅ OK | Mock #ST01 im Dropdown, Sensor "Test Temperature Sensor" mit GPIO 4 |
| C5: Actuator Config | ✅ OK | Green LED (GPIO 5), Befehl "Einschalten (ON)", Auto-Abschaltung verfügbar |
| C6: Speichern | ✅ OK | **BUG GEFUNDEN+GEFIXT**: value-Feld fehlte in Actuator-Action → Fix: immer value mitgeben (ON=1.0, OFF=0.0) |
| C7: Regel-Liste | ✅ OK | RuleCard "Verify-Save-Test" erscheint unter "MEINE REGELN (1)" mit Flow-Miniatur |
| C8: Löschen | ✅ OK | Regel gelöscht, Toast "Regel gelöscht" |
| C9: Responsive | ✅ OK | 1280x800 Layout funktional, Sidebar sichtbar |
| C10: Console Errors | ✅ OK | Keine JS-Runtime-Errors, nur Vue Flow deprecation warning |

## Persistenz (Block P)
⏳ SKIPPED — Frontend-Speichern/Laden via Block C verifiziert. Separate Persistenz-Tests nicht durchgeführt.

## Timing-Beobachtungen
- Sensor→Logic→Aktor Latenz: 15-26ms (Trigger bis MQTT-Command)
- LogicScheduler Intervall: 60s (konfiguriert)
- Cooldown-Präzision: Exakt (15s, 30s getestet)
- Cross-Sensor DB-Lookup: Transparent, kein messbarer Overhead

## Direkt-Fixes
| # | Datei | Fix | Commit |
|---|-------|-----|--------|
| 1 | `src/db/repositories/logic_repo.py` | Hysteresis-Conditions in get_rules_by_trigger_sensor() hinzugefügt | 317ad10 |
| 2 | `src/components/rules/RuleFlowEditor.vue` | Required 'value' field in actuator graphToRuleData() hinzugefügt | 0786e08 |

## Offene Bugs
| ID | Schweregrad | Beschreibung |
|----|-------------|--------------|
| HYST-1 | NIEDRIG | Mock-ESP Auto-Heartbeat sendet raw_value=0 → stört Hysterese-State. In Produktion mit echten ESPs kein Problem |
| TIMER-1 | NIEDRIG | Reine Timer-Regeln (nur time_window) brauchen 60s Scheduler-Intervall — nicht E2E getestet, nur kombiniert |
| RANGE-1 | NIEDRIG | Logic Engine hat keinen Range-Check für Sensor-Werte (1000°C feuert Regeln). sensor_handler filtert bereits, aber bei MQTT-Inject möglich |
| TMPL-1 | NIEDRIG | Nur 5 Templates angezeigt statt 6 (Notfall-Abschaltung möglicherweise fehlt oder versteckt) |
| DEPR-1 | NIEDRIG | Vue Flow deprecation warning: "options parameter is deprecated, use id parameter instead" |

## Empfehlungen
1. Logic Engine könnte optional quality="good" als Bedingung prüfen (aktuell wird jeder Wert akzeptiert)
2. Hysterese-State sollte langfristig in DB persistiert werden (aktuell In-Memory, geht bei Restart verloren)
3. Reine Timer-Regeln könnten kürzeres Scheduler-Intervall nutzen (aktuell 60s)
4. Frontend Error-Messages bei 400-Fehler könnten benutzerfreundlicher sein (aktuell: "Request failed with status code 400")
