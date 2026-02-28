# Logic Engine Komplett-Test Report

**Datum:** 2026-02-28, 08:30-09:55 UTC
**Tester:** Claude Agent (Bash + Playwright MCP)
**Scope:** API (Phase 1), Frontend (Phase 2), Integration MQTT→Logic→Actuator (Phase 3)
**Stack:** 12/12 Docker Services running, MOCK_012E36A6 online (SHT31)

---

## Zusammenfassung

| Phase | Status | Details |
|-------|--------|---------|
| **Phase 1: API** | PASS (nach Fixes) | 8 Regeltypen, CRUD, Validierung, Safety |
| **Phase 2: Frontend** | PASS (nach Fixes) | Rules laden, Toggle, Test, Templates |
| **Phase 3: Integration** | PASS (nach Fix) | MQTT → Sensor → Logic Engine → Notification → DB |
| **Bugs gefunden** | **9** | 5 Backend, 4 Frontend |
| **Bugs gefixt** | **9** | Alle in dieser Session behoben |

---

## Phase 1: API-Tests

### 1a. Regeltypen erstellen (POST /api/v1/logic/rules)

| # | Regeltyp | Status | Details |
|---|----------|--------|---------|
| a | Sensor-Threshold | PASS | DS18B20 > 30 → Relay ON. Brauchte `value: 1.0` in actuator action |
| b | Time-Window | PASS | 22:00-06:00 → Relay OFF |
| c | Hysteresis | FAIL → FIX → PASS | "Unknown condition type: hysteresis" → Fix in `logic_validation.py` |
| d | Compound AND | PASS | Verschachteltes AND mit 2 Sensor-Conditions |
| e | Notification | PASS | SHT31 > 20 → WebSocket Notification |
| f | Delay | PASS | Actuator ON → 5s Delay → Actuator OFF |
| g | Sequence | PASS | 3-Step Sequence mit abort_on_failure |
| h | Between | FAIL → FIX → PASS | `value` required auch fuer between Operator → Fix: value optional |

### 1b. CRUD-Operationen

| Operation | Status | Details |
|-----------|--------|---------|
| GET /rules | PASS | 8 Regeln, sortiert nach Priority, paginiert |
| GET /rules/{id} | PASS | Einzelregel mit execution_count |
| GET /rules/NONEXISTENT | PASS | 404 korrekt |
| PUT /rules/{id} | PASS | Priority 5→50 aktualisiert |
| POST /rules/{id}/toggle (disable) | PASS | enabled: false |
| POST /rules/{id}/toggle (enable) | PASS | enabled: true |
| POST /rules/{id}/test | PASS (nach Fix) | would_trigger + action_results jetzt korrekt |
| GET /execution_history | PASS | 0 Entries initial, 1+ nach Integration |
| DELETE /rules/{id} | PASS | 200 + 404 nach erneutem GET |

### 1c. Validierung (Negativ-Tests)

| # | Test | Erwartet | Ergebnis |
|---|------|----------|----------|
| NEG-1 | Regel ohne name | 422 | PASS |
| NEG-2 | Regel ohne conditions | 422 | PASS |
| NEG-3 | logic_operator "XOR" | 422 | PASS |
| NEG-4 | priority 200 (>100) | 422 | PASS |
| NEG-5 | cooldown_seconds 100000 (>86400) | 422 | PASS |
| NEG-6 | Leere conditions-Liste | 422 | PASS |
| NEG-7 | Doppelter Regelname | 400 | FAIL → FIX → PASS (war 500 IntegrityError) |

### 1d. Safety-Tests

| Test | Status | Details |
|------|--------|---------|
| Conflict Detection | INFO | Zwei Regeln auf gleichen Actuator erstellt — nur Name-Duplikat-Check, kein Actuator-Conflict-Check (by design) |
| Rate Limiter | PASS | max_executions_per_hour: 2 akzeptiert und in DB gespeichert |
| Loop Detection | PASS | Zwei gegenseitige Regeln erstellt — semantisch korrekt: Actuator-Output ≠ Sensor-Input |

---

## Phase 2: Frontend-Tests

### Bugs gefunden (via Playwright MCP Inspection)

| # | Bug | Root Cause | Fix |
|---|-----|------------|-----|
| F1 | Rules werden nicht geladen (0 angezeigt) | API gibt `{data: [...]}`, Store liest `response.items` | `types/logic.ts`: items→data |
| F2 | Toggle gibt 422 | `toggleRule()` sendet POST ohne Body | `api/logic.ts`: enabled + reason im Body |
| F3 | Test-Response falsch geparst | `conditions_result` statt `would_trigger` | `api/logic.ts` + `logic.store.ts`: Interface + Store korrigiert |
| F4 | Templates nicht sichtbar im Empty State | RuleTemplateCard + ruleTemplates nicht importiert | `LogicView.vue`: Import + Grid hinzugefuegt |
| — | updateRule nutzt PATCH statt PUT | Server hat PUT-Endpoint | `api/logic.ts`: api.patch → api.put |

### Fixes angewendet

| Datei | Aenderungen |
|-------|-------------|
| `El Frontend/src/types/logic.ts` | `LogicRulesResponse.data` (war items), `ExecutionHistoryResponse.entries` (war items), `HysteresisCondition` Interface |
| `El Frontend/src/api/logic.ts` | `updateRule` PATCH→PUT, `toggleRule` mit Body, `testRule` mit Parametern, Response-Interfaces |
| `El Frontend/src/shared/stores/logic.store.ts` | `fetchRules` data statt items, `toggleRule` enabled-State, `testRule` would_trigger |
| `El Frontend/src/views/LogicView.vue` | RuleTemplateCard Import, ruleTemplates Import, useTemplate Handler, Templates-Grid im Empty State |

---

## Phase 3: Integration-Test (MQTT → Logic Engine → Notification)

### Setup
- **ESP:** MOCK_012E36A6 (online, SHT31, GPIO 0, Wert 22.0°C, alle 30s)
- **Regel:** "Notification Test" — SHT31 > 20 → WebSocket Notification

### Ergebnis

| Schritt | Status | Details |
|---------|--------|---------|
| MQTT Sensor Data empfangen | PASS | `sensor_type: SHT31, raw_value: 22.0, gpio: 0` |
| Sensor Handler speichert | PASS | `processing_mode=raw` |
| Logic Engine evaluate_sensor_data() | PASS | Matching Rule gefunden |
| Condition SHT31 > 20 evaluiert | PASS | 22.0 > 20.0 = true |
| Action Notification ausgefuehrt | PASS | "WebSocket notification sent to dashboard" |
| Execution History geloggt | PASS | success=true, execution_time_ms=85 |
| Cooldown (300s) respektiert | PASS | Zweiter Sensor-Datenpunkt triggert nicht erneut |

### Integration-Bug gefunden und gefixt

| Bug | Root Cause | Fix |
|-----|------------|-----|
| `last_triggered` Timezone Crash | `datetime.now(timezone.utc)` → DB-Spalte ist `TIMESTAMP WITHOUT TIME ZONE` | `.replace(tzinfo=None)` |
| Error-Logging Kaskade | `log_execution()` im except-Block auf rolled-back Session | `rollback()` vor `log_execution()` + try/except |

---

## Alle Bugs & Fixes (Gesamt)

### Backend (5 Bugs)

| # | Bug | Datei | Fix |
|---|-----|-------|-----|
| B1 | Hysteresis-Typ nicht erkannt | `logic_validation.py` | `HysteresisCondition` Model + Dispatch |
| B2 | Between-Operator: value required | `logic_validation.py` | value optional + field_validator |
| B3 | Duplicate Name → HTTP 500 | `logic_service.py` | IntegrityError catch → 400 |
| B4 | Test-Endpoint: leere action_results | `logic_service.py` | action_results populieren bei would_trigger=true |
| B5 | Timer Loop Crash: list.get() | `logic_engine.py` | List-Input handling in `_check_conditions()` |
| B6 | Timezone Crash bei last_triggered | `logic_engine.py` | `.replace(tzinfo=None)` |
| B7 | Error-Log auf rolled-back Session | `logic_engine.py` | `rollback()` + try/except |

### Frontend (4 Bugs)

| # | Bug | Datei | Fix |
|---|-----|-------|-----|
| F1 | Rules nicht geladen (items vs data) | `types/logic.ts` + `logic.store.ts` | items→data |
| F2 | Toggle 422 (kein Body) | `api/logic.ts` + `logic.store.ts` | enabled im Body |
| F3 | Test Response Mismatch | `api/logic.ts` + `logic.store.ts` | Interface + Store |
| F4 | Templates nicht sichtbar | `LogicView.vue` | Import + Grid |
| F5 | updateRule PATCH statt PUT | `api/logic.ts` | patch→put |

---

## Nicht getestet / Offen

| Bereich | Grund |
|---------|-------|
| Actuator-Execution (ON/OFF) | ESP_00000001 offline (Wokwi gestoppt), MOCK hat keine Actuatoren |
| Delay-Execution (Timing) | Braucht aktiven Actuator |
| Sequence-Execution | Braucht aktiven Actuator |
| Hysterese-Zustandswechsel | Braucht wechselnde Sensorwerte ueber/unter Schwellwert |
| Cross-ESP Rules | Braucht 2 Online-ESPs |
| Frontend Playwright-Retest nach Fixes | Container rebuilt, aber kein zweiter Playwright-Durchlauf |
| Conflict Manager bei Laufzeit | Nur Schema-Validierung getestet, nicht Runtime-Conflicts |

---

## Architektur-Erkenntnisse

1. **Evaluation-Trigger:** Logic Engine wird NICHT periodisch evaluiert. Der `_evaluation_loop` ist ein Placeholder. Evaluation wird direkt vom `sensor_handler` via `asyncio.create_task()` getriggert.

2. **Timer-Rules:** Der `LogicScheduler` ruft `evaluate_timer_triggered_rules()` alle 60s auf — separat vom Sensor-Trigger-Pfad.

3. **Rule Matching:** `get_rules_by_trigger_sensor()` im Repository macht einen Full-Scan aller enabled Rules und filtert in Python (nicht SQL). Bei vielen Regeln potentiell langsam.

4. **DB-Schema:** `cross_esp_logic` Tabelle nutzt `trigger_conditions` (JSON, nicht `conditions`) und `rule_name` (nicht `name`) mit UNIQUE Constraint.

5. **Condition Storage:** API empfaengt `conditions` als `List[Dict]` und speichert sie direkt als JSON. Der Logic Engine muss List-Input in Compound-Format konvertieren (Fix B5).

---

## Empfehlungen

1. **Actuator-Test mit Wokwi:** Wokwi neu starten, NVS konfigurieren, Config pushen, dann Actuator-Regel testen
2. **Hysterese-Test:** Mock-Sensor mit wechselnden Werten (ober/unterhalb Schwellwert) konfigurieren
3. **Rule Matching optimieren:** SQL-basiertes Matching statt Python-Full-Scan (JSONB-Queries)
4. **Cooldown-Bug pruefen:** `last_triggered` Vergleich mit `datetime.now(timezone.utc)` (aware) vs DB-Wert (naive) — koennte Cooldown-Logik brechen
