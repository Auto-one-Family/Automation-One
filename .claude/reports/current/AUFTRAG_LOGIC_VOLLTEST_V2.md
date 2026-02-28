# Volltest-Auftrag: Logic Engine + Datenübertragung + Diagramme

**Datum:** 2026-02-28
**Ersteller:** verify-plan Skill
**Bezug:** LOGIC_ENGINE_TEST_REPORT.md, CHAOS_LOGIC_ENGINE_BUGFIX_REPORT.md (17 Bugs gefixt)
**Voraussetzung:** Wokwi läuft, Docker-Stack online, Mock-ESP verfügbar
**Ziel:** Vollständige Verifikation aller Fixes + Aufspüren und Fixen verbleibender Bugs

---

## KONTEXT

Es wurden in zwei Sessions insgesamt 17 Bugs in der Logic Engine, den Validierungsmodellen, der Logic-API und dem Frontend gefixt. Dieser Auftrag verifiziert **alle** Fixes und testet systematisch die gesamte Kette:

```
ESP/Wokwi → MQTT → sensor_handler → DB → Logic Engine → Actions → WebSocket → Frontend
                                      ↓
                              Sensor-Data API → Frontend Charts/Diagramme
```

**Geänderte Dateien (zu prüfen):**
- `El Servador/.../services/logic_engine.py` (Bugs 1,3,4,6: Timer-Rules, Type-Casts, Overnight, WS-Crash)
- `El Servador/.../services/logic_service.py` (IntegrityError, Test-Endpoint)
- `El Servador/.../services/logic/conditions/time_evaluator.py` (Bug 2: Minuten ignoriert)
- `El Servador/.../services/logic/conditions/sensor_evaluator.py` (Bug 8: GPIO Typ-Mismatch)
- `El Servador/.../db/models/logic_validation.py` (Bug 5: Action-Types, Hysteresis, Between)
- `El Servador/.../api/v1/logic.py` (Bug 7: Sortierung)
- `El Servador/.../api/v1/sensors.py` (Sensor-Data-Endpoint Fixes)
- `El Servador/.../schemas/auth.py` (Pydantic Config)
- `El Servador/.../mqtt/handlers/heartbeat_handler.py`
- `El Frontend/src/types/logic.ts` (Response-Types: data statt items)
- `El Frontend/src/api/logic.ts` (PUT statt PATCH, Toggle Body, Test Params)
- `El Frontend/src/shared/stores/logic.store.ts` (Store Fixes)
- `El Frontend/src/views/LogicView.vue` (Templates, Imports)
- `El Frontend/src/views/SensorHistoryView.vue`
- `El Frontend/src/views/SystemMonitorView.vue`
- `El Frontend/src/composables/useESPStatus.ts`
- `El Frontend/src/components/system-monitor/UnifiedEventList.vue`
- `El Trabajante/src/services/actuator/actuator_manager.cpp`
- `El Trabajante/src/services/sensor/sensor_manager.cpp`

---

## PHASE 1: Stack-Verifizierung & Baseline (5 Min)

### 1.1 Docker-Stack prüfen
```bash
cd c:/Users/PCUser/Documents/PlatformIO/Projects/Auto-one
docker compose ps
curl -s http://localhost:8000/api/v1/health/live | python -m json.tool
curl -s http://localhost:5173 -o /dev/null -w "%{http_code}"
```
**Erwartung:** Alle 4 Core-Services healthy. Server `mqtt_connected: true`.

### 1.2 Auth-Token holen
```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
```

### 1.3 ESP-Geräte auflisten
```bash
curl -s http://localhost:8000/api/v1/esp/ -H "Authorization: Bearer $TOKEN" | python -m json.tool
```
**Prüfe:** Mindestens 1 ESP online (Wokwi oder Mock). Notiere `esp_id` und `device_id`.

### 1.4 Sensor-Daten Baseline
```bash
curl -s "http://localhost:8000/api/v1/sensors/data?limit=5" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
```
**Prüfe:** `readings` ist ein Array. `processed_value` und `raw_value` vorhanden. `sensor_type` in jedem Reading.

---

## PHASE 2: Logic Engine API — Alle Regeltypen (15 Min)

Erstelle nacheinander JEDE Regelart und prüfe die Antwort. Nutze die ESP-IDs aus Phase 1.

### 2.1 Sensor-Threshold (Basis)
```bash
curl -s -X POST http://localhost:8000/api/v1/logic/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "VT2-Sensor-Threshold",
    "description": "Volltest: SHT31 > 25 → Notification",
    "conditions": [{"type": "sensor_threshold", "esp_id": "<ESP_ID>", "gpio": 0, "sensor_type": "SHT31", "operator": ">", "value": 25.0}],
    "actions": [{"type": "notification", "channel": "websocket", "target": "dashboard", "message_template": "Temperatur {value} überschritten"}],
    "priority": 1,
    "cooldown_seconds": 60
  }' | python -m json.tool
```
**Prüfe:** HTTP 201. `id` ist UUID. `name` = "VT2-Sensor-Threshold". **Bug B5 Fix:** Notification-Action wird akzeptiert (war vorher ValueError).

### 2.2 Time-Window (HH:MM Granularität)
```bash
# Aktuelle Uhrzeit ermitteln und Fenster drum herum legen!
curl -s -X POST http://localhost:8000/api/v1/logic/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "VT2-Time-Window",
    "description": "Volltest: Zeitfenster mit Minutengenauigkeit",
    "conditions": [{"type": "time_window", "start_hour": 0, "end_hour": 23}],
    "actions": [{"type": "notification", "channel": "websocket", "target": "dashboard", "message_template": "Zeitfenster aktiv"}],
    "priority": 10
  }' | python -m json.tool
```
**Prüfe:** HTTP 201. **Bug 2 Fix:** Minuten werden korrekt verarbeitet.

### 2.3 Overnight Time-Window (22:00–06:00)
```bash
curl -s -X POST http://localhost:8000/api/v1/logic/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "VT2-Overnight",
    "description": "Volltest: Nacht-Zeitfenster 22-06",
    "conditions": [{"type": "time_window", "start_hour": 22, "end_hour": 6}],
    "actions": [{"type": "notification", "channel": "websocket", "target": "dashboard", "message_template": "Nachtmodus"}],
    "priority": 20
  }' | python -m json.tool
```
**Prüfe:** HTTP 201. **Bug 4 Fix:** Overnight-Wrapping funktioniert.

### 2.4 Hysteresis
```bash
curl -s -X POST http://localhost:8000/api/v1/logic/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "VT2-Hysteresis",
    "description": "Volltest: Hysterese Cooling-Modus",
    "conditions": [{"type": "hysteresis", "esp_id": "<ESP_ID>", "gpio": 0, "sensor_type": "SHT31", "activate_above": 28.0, "deactivate_below": 24.0}],
    "actions": [{"type": "notification", "channel": "websocket", "target": "dashboard", "message_template": "Hysterese-Trigger"}],
    "priority": 5
  }' | python -m json.tool
```
**Prüfe:** HTTP 201. **Ehemals Bug B1:** Hysteresis-Typ wird akzeptiert.

### 2.5 Between-Operator
```bash
curl -s -X POST http://localhost:8000/api/v1/logic/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "VT2-Between",
    "description": "Volltest: Between-Operator ohne value",
    "conditions": [{"type": "sensor_threshold", "esp_id": "<ESP_ID>", "gpio": 0, "sensor_type": "SHT31", "operator": "between", "min": 18.0, "max": 28.0}],
    "actions": [{"type": "notification", "channel": "websocket", "target": "dashboard", "message_template": "Wert im Bereich"}],
    "priority": 15
  }' | python -m json.tool
```
**Prüfe:** HTTP 201. `value` ist Optional bei `between`. **Ehemals Bug B2.**

### 2.6 Compound AND
```bash
curl -s -X POST http://localhost:8000/api/v1/logic/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "VT2-Compound-AND",
    "description": "Volltest: Sensor + Zeitfenster AND",
    "conditions": [
      {"type": "sensor_threshold", "esp_id": "<ESP_ID>", "gpio": 0, "sensor_type": "SHT31", "operator": ">", "value": 20.0},
      {"type": "time_window", "start_hour": 0, "end_hour": 23}
    ],
    "logic_operator": "AND",
    "actions": [{"type": "notification", "channel": "websocket", "target": "dashboard", "message_template": "Compound AND triggered"}],
    "priority": 3
  }' | python -m json.tool
```
**Prüfe:** HTTP 201. Beide Conditions gespeichert.

### 2.7 Delay-Action
```bash
curl -s -X POST http://localhost:8000/api/v1/logic/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "VT2-Delay",
    "description": "Volltest: Delay-Action",
    "conditions": [{"type": "sensor_threshold", "esp_id": "<ESP_ID>", "gpio": 0, "sensor_type": "SHT31", "operator": ">", "value": 30.0}],
    "actions": [{"type": "delay", "seconds": 5}],
    "priority": 50
  }' | python -m json.tool
```
**Prüfe:** HTTP 201. **Bug B5 Fix:** Delay-Action wird akzeptiert.

### 2.8 Sequence-Action
```bash
curl -s -X POST http://localhost:8000/api/v1/logic/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "VT2-Sequence",
    "description": "Volltest: 2-Step Sequence",
    "conditions": [{"type": "sensor_threshold", "esp_id": "<ESP_ID>", "gpio": 0, "sensor_type": "SHT31", "operator": ">", "value": 35.0}],
    "actions": [{"type": "sequence", "steps": [
      {"action": {"type": "notification", "channel": "websocket", "target": "dashboard", "message_template": "Schritt 1"}},
      {"action": {"type": "delay", "seconds": 2}}
    ]}],
    "priority": 60
  }' | python -m json.tool
```
**Prüfe:** HTTP 201. **Bug B5 Fix:** Sequence-Action wird akzeptiert.

---

## PHASE 3: CRUD + Validierung (10 Min)

### 3.1 Rules auflisten
```bash
curl -s "http://localhost:8000/api/v1/logic/rules?page=1&page_size=50" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
```
**Prüfe:**
- Response hat `data` Array (NICHT `items`)
- `pagination` Objekt mit `total_items`, `total_pages`
- Rules sortiert nach Priority aufsteigend (niedrig = wichtig = zuerst). **Bug 7 Fix.**
- Alle 8 erstellten Rules vorhanden

### 3.2 Einzelne Rule lesen
```bash
curl -s "http://localhost:8000/api/v1/logic/rules/<RULE_ID>" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
```
**Prüfe:** `execution_count`, `last_execution_success`, `created_at`, `updated_at` vorhanden.

### 3.3 Rule Update (PUT)
```bash
curl -s -X PUT "http://localhost:8000/api/v1/logic/rules/<RULE_ID>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"priority": 99, "description": "Updated by Volltest"}' | python -m json.tool
```
**Prüfe:** HTTP 200. `priority` = 99. `description` aktualisiert.

### 3.4 Toggle Enable/Disable
```bash
# Disable
curl -s -X POST "http://localhost:8000/api/v1/logic/rules/<RULE_ID>/toggle" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false, "reason": "Volltest disable"}' | python -m json.tool
# Enable
curl -s -X POST "http://localhost:8000/api/v1/logic/rules/<RULE_ID>/toggle" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}' | python -m json.tool
```
**Prüfe:** HTTP 200 beide Male. `enabled` wechselt korrekt. **Frontend Bug F2 Fix.**

### 3.5 Test-Endpoint
```bash
curl -s -X POST "http://localhost:8000/api/v1/logic/rules/<SENSOR_THRESHOLD_RULE_ID>/test" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mock_sensor_values": {"<ESP_ID>:0": 30.0},
    "dry_run": true
  }' | python -m json.tool
```
**Prüfe:** `would_trigger: true`. `condition_results` nicht leer. `action_results` nicht leer bei trigger=true. **Bug B4/F3 Fix.**

Wiederhole mit einem Wert UNTER dem Threshold:
```bash
curl -s -X POST "http://localhost:8000/api/v1/logic/rules/<SENSOR_THRESHOLD_RULE_ID>/test" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mock_sensor_values": {"<ESP_ID>:0": 20.0},
    "dry_run": true
  }' | python -m json.tool
```
**Prüfe:** `would_trigger: false`. `action_results` leer.

### 3.6 Negativ-Tests
```bash
# Ohne Name → 422
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/api/v1/logic/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"conditions": [{"type": "sensor_threshold", "esp_id": "ESP_123456", "gpio": 0, "operator": ">", "value": 1}], "actions": [{"type": "notification", "channel": "websocket", "target": "x", "message_template": "y"}]}'

# Doppelter Name → 400 (NICHT 500!)
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/api/v1/logic/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "VT2-Sensor-Threshold", "conditions": [{"type": "sensor_threshold", "esp_id": "ESP_123456", "gpio": 0, "operator": ">", "value": 1}], "actions": [{"type": "notification", "channel": "websocket", "target": "x", "message_template": "y"}]}'

# Invalid logic_operator → 422
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/api/v1/logic/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "VT2-Invalid", "logic_operator": "XOR", "conditions": [{"type": "sensor_threshold", "esp_id": "ESP_123456", "gpio": 0, "operator": ">", "value": 1}], "actions": [{"type": "notification", "channel": "websocket", "target": "x", "message_template": "y"}]}'
```
**Prüfe:** 422, 400, 422 (in dieser Reihenfolge). **Bug B3 Fix:** Doppelter Name gibt 400, nicht 500.

### 3.7 Delete
```bash
# Lösche eine Testregel
curl -s -o /dev/null -w "%{http_code}" -X DELETE "http://localhost:8000/api/v1/logic/rules/<RULE_ID>" \
  -H "Authorization: Bearer $TOKEN"
# Wiederholtes Delete → 404
curl -s -o /dev/null -w "%{http_code}" -X DELETE "http://localhost:8000/api/v1/logic/rules/<RULE_ID>" \
  -H "Authorization: Bearer $TOKEN"
```
**Prüfe:** 200, dann 404.

---

## PHASE 4: MQTT → Logic Engine Integration (15 Min)

### 4.1 Sensor-Threshold Live-Test

Wokwi oder Mock sendet Sensor-Daten. Die Sensor-Threshold-Rule aus Phase 2.1 soll triggern.

1. **Prüfe Server-Logs** auf Logic Engine Evaluation:
```bash
docker logs automationone-server --tail 50 2>&1 | grep -i "logic\|rule\|trigger\|evaluat"
```

2. **Sende Sensor-Daten via MQTT** (falls Mock nicht automatisch sendet):
```bash
mosquitto_pub -h localhost -t "kaiser/god/esp/<DEVICE_ID>/sensor/0/data" \
  -m '{"ts":'$(date +%s)',"esp_id":"<DEVICE_ID>","gpio":0,"sensor_type":"SHT31","raw":260,"value":26.0,"unit":"°C","quality":"good","raw_mode":true}'
```

3. **Prüfe:**
   - Server-Log: `Rule VT2-Sensor-Threshold triggered`
   - Server-Log: `WebSocket notification sent` (KEIN Crash! **Bug 6 Fix**)
   - Server-Log: GPIO-Vergleich matched (**Bug 8 Fix:** int vs str)

### 4.2 Sensor-Daten in DB prüfen
```bash
curl -s "http://localhost:8000/api/v1/sensors/data?esp_id=<DEVICE_ID>&limit=10" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
```
**Prüfe:**
- `readings` Array mit Einträgen
- Jeder Eintrag hat: `timestamp`, `raw_value`, `processed_value`, `unit`, `quality`, `sensor_type`
- `raw_value` und `processed_value` sind numerisch (nicht null für raw_mode)
- `count` stimmt mit Array-Länge überein

### 4.3 Execution History prüfen
```bash
curl -s "http://localhost:8000/api/v1/logic/execution_history?limit=10" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
```
**Prüfe:**
- Response hat `entries` Array (NICHT `items`)
- Mindestens 1 Entry mit `success: true`
- `execution_time_ms` vorhanden und plausibel (< 5000)
- `trigger_data` enthält `esp_id`, `gpio`, `sensor_type`, `value`

### 4.4 Cooldown-Verifizierung

Sende innerhalb von 60s erneut Sensor-Daten über dem Threshold.

**Prüfe Server-Logs:**
```bash
docker logs automationone-server --tail 20 2>&1 | grep -i "cooldown"
```
**Erwartung:** `Rule VT2-Sensor-Threshold in cooldown` Meldung. Kein zweites `triggered`.

### 4.5 Timer-Rule Evaluation

**Prüfe:** Die Time-Window-Rule (VT2-Time-Window) aus Phase 2.2 soll vom LogicScheduler gefunden werden.
```bash
docker logs automationone-server --tail 100 2>&1 | grep -i "timer\|scheduler\|time_window"
```
**Prüfe:** `Timer-triggered rules` nicht "0 timer rules" wenn Zeitfenster aktiv ist. **Bug 1 Fix (KRITISCH).**

---

## PHASE 5: Frontend — Logic View (15 Min)

### 5.1 Playwright: LogicView öffnen

Öffne `http://localhost:5173` im Browser (Playwright). Login mit admin/admin.
Navigiere zu `/logic` (oder klicke auf "Logic" / "Regeln" in der Navigation).

**Prüfe:**
- [ ] Regeln werden geladen (nicht "0 Regeln"). **Bug F1 Fix.**
- [ ] Regel-Liste zeigt alle erstellten Rules mit Name, Priority, Status
- [ ] Priority-Sortierung: niedrigste Zahl (= wichtigste) zuerst. **Bug 7 Fix.**
- [ ] Toggle-Button funktioniert (Enable/Disable wechselt). **Bug F2 Fix.**
- [ ] Kein JavaScript-Error in Browser-Console

### 5.2 Regel erstellen über UI

Klicke "Neue Regel" / Plus-Button. Erstelle eine einfache Sensor-Threshold-Regel über das UI.

**Prüfe:**
- [ ] Node-Palette ist sichtbar (Sensor, Time, Actuator, Notification Knoten)
- [ ] Drag & Drop funktioniert
- [ ] Speichern sendet korrektes JSON an API
- [ ] Erstellte Regel erscheint in der Liste

### 5.3 Templates im Empty State

Lösche alle Regeln oder nutze einen neuen Account. Öffne Logic View.

**Prüfe:**
- [ ] Template-Cards werden angezeigt wenn keine Regeln vorhanden. **Bug F4 Fix.**
- [ ] Klick auf Template erstellt Regel-Vorlage

### 5.4 Test-Button

Wähle eine Sensor-Threshold-Regel und klicke "Test".

**Prüfe:**
- [ ] Test-Dialog öffnet sich
- [ ] `would_trigger` wird korrekt angezeigt (true/false). **Bug F3 Fix.**
- [ ] `condition_results` werden aufgelistet
- [ ] `action_results` werden bei trigger=true aufgelistet

### 5.5 Execution History Panel

Klappe das Execution History Panel auf (am unteren Rand).

**Prüfe:**
- [ ] History-Einträge werden geladen
- [ ] Jeder Eintrag zeigt: Rule-Name, Erfolg, Zeitstempel, Dauer
- [ ] Leerer State wird sauber angezeigt wenn keine History

---

## PHASE 6: Sensor-Daten Diagramme (15 Min)

### 6.1 SensorHistoryView

Navigiere zu `/sensor-history`.

**Prüfe:**
- [ ] ESP-Geräte-Dropdown zeigt verfügbare Geräte
- [ ] Nach Auswahl eines ESP: Daten werden geladen
- [ ] Chart wird korrekt gerendert (keine leere Fläche)
- [ ] Zeitraum-Selector funktioniert (1h, 6h, 24h, 7d)
- [ ] Bei SHT31 (Multi-Value): Beide Sensor-Typen (temp + humidity) als separate Linien
- [ ] Y-Achse zeigt Einheiten (°C, %)
- [ ] Dual-Axis bei unterschiedlichen Einheiten
- [ ] CSV-Export generiert korrekte Datei
- [ ] Tooltip zeigt Werte beim Hover

### 6.2 MultiSensorChart (Dashboard)

Navigiere zum Dashboard (Hauptseite). Suche nach Chart-Widgets.

**Prüfe:**
- [ ] Historische Daten werden geladen
- [ ] Live-Updates via WebSocket kommen an (Werte ändern sich bei neuen Sensor-Daten)
- [ ] Processed Value wird bevorzugt (nicht Raw-Value)
- [ ] Kein Flackern oder Doppel-Rendering

### 6.3 System Monitor

Navigiere zu `/system-monitor`.

**Prüfe:**
- [ ] Events werden live angezeigt
- [ ] Sensor-Events erscheinen
- [ ] Logic-Execution Events erscheinen (wenn Regeln triggern)
- [ ] Filter nach ESP funktioniert
- [ ] Filter nach Event-Level funktioniert
- [ ] Event-Details öffnen sich bei Klick

---

## PHASE 7: Edge-Cases & Regressionstests (10 Min)

### 7.1 GPIO Typ-Mismatch
Sende Sensor-Daten wo GPIO als String im Payload kommt:
```bash
mosquitto_pub -h localhost -t "kaiser/god/esp/<DEVICE_ID>/sensor/0/data" \
  -m '{"ts":'$(date +%s)',"esp_id":"<DEVICE_ID>","gpio":"0","sensor_type":"SHT31","raw":280,"value":28.0,"unit":"°C","quality":"good","raw_mode":true}'
```
**Prüfe:** Server crasht NICHT. Rule matched trotzdem. **Bug 8 Fix.**

### 7.2 Threshold als String aus DB
Erstelle eine Rule, prüfe ob sie triggert wenn der DB JSON-Wert eventuell als String gespeichert wird.
**Prüfe Server-Logs:** Kein `TypeError: '>' not supported`. **Bug 3 Fix.**

### 7.3 Compound Condition mit Sensor-Daten
Die Compound-AND-Rule (VT2-Compound-AND) muss triggern wenn:
- Sensor-Wert > 20 UND aktuell in Zeitfenster 0-23 Uhr
**Prüfe:** Beide Sub-Conditions werden evaluiert. `conditions_met=True`.

### 7.4 Cooldown + Timezone
Warte bis Cooldown abläuft. Sende erneut Sensor-Daten.
**Prüfe:** Rule triggert wieder. Kein Timezone-Crash bei `last_triggered`. **Bug B6 Fix.**

### 7.5 Daten-Konsistenz API → Frontend
Vergleiche die API-Response von `GET /logic/rules` mit dem was die Frontend-UI anzeigt.
**Prüfe:**
- Gleiche Anzahl Rules
- Gleiche Namen
- Gleiche Priority-Reihenfolge
- `data` Array wird korrekt gemapped (nicht `items`)

### 7.6 Execution-Log nach Error
Provoziere einen Error (z.B. Actuator-Aktion auf nicht-existierenden ESP).
**Prüfe:**
- Execution History enthält `success: false` Entry
- `error_message` ist nicht leer
- Server hat sich korrekt vom Error erholt (rollback + neuer log_execution). **Bug B7 Fix.**

---

## PHASE 8: Aufräumen (5 Min)

### 8.1 Alle VT2-Regeln löschen
```bash
# Liste alle VT2-Rules und lösche sie
curl -s "http://localhost:8000/api/v1/logic/rules?page_size=50" \
  -H "Authorization: Bearer $TOKEN" | python -c "
import sys, json
data = json.load(sys.stdin)
for rule in data.get('data', []):
    if rule['name'].startswith('VT2-'):
        print(f'DELETE: {rule[\"id\"]} ({rule[\"name\"]})')
"
```

### 8.2 Ergebnis-Report schreiben
Schreibe den Test-Report nach: `.claude/reports/current/LOGIC_VOLLTEST_V2_REPORT.md`

Format:
```markdown
# Logic Volltest V2 Report

| Phase | Status | Details |
|-------|--------|---------|
| Phase 1: Stack | ✅/❌ | ... |
| Phase 2: Regeltypen | ✅/❌ | ... |
| Phase 3: CRUD | ✅/❌ | ... |
| Phase 4: Integration | ✅/❌ | ... |
| Phase 5: Frontend Logic | ✅/❌ | ... |
| Phase 6: Diagramme | ✅/❌ | ... |
| Phase 7: Edge-Cases | ✅/❌ | ... |

## Bugs gefunden
[Liste aller neuen Bugs mit Datei, Zeile, Root Cause]

## Bugs gefixt
[Liste aller Bugs die in dieser Session gefixt wurden]

## Verifikation vorheriger Fixes
[Bestätigung dass alle 17 vorherigen Fixes halten]
```

---

## REGELN FÜR DEN AGENTEN

1. **JEDE Phase komplett durcharbeiten** — keine Phase überspringen
2. **Bei Bug gefunden: SOFORT fixen** — nicht sammeln und am Ende fixen
3. **Nach jedem Fix: Re-Test** — sicherstellen dass der Fix funktioniert
4. **Server-Logs IMMER prüfen** — `docker logs automationone-server --tail N`
5. **Frontend-Console IMMER prüfen** — Playwright Browser Console Messages
6. **`<ESP_ID>` und `<DEVICE_ID>` ersetzen** — mit echten IDs aus Phase 1.3
7. **Wokwi ist aktiv** — Sensor-Daten kommen automatisch. Nutze das!
8. **Report am Ende schreiben** — `.claude/reports/current/LOGIC_VOLLTEST_V2_REPORT.md`
9. **Kein "Soll ich fortfahren?"** — Ohne Pause durcharbeiten bis alles komplett

## BEKANNTE POTENZIELLE PROBLEME (aus Code-Analyse)

Folgende Stellen sollten besonders beachtet werden:

| Problem | Datei | Priorität |
|---------|-------|-----------|
| `get_rules_with_timer()` in LogicService nutzt `.conditions` Property statt `.trigger_conditions` | `logic_service.py:432-451` | HOCH — gleicher Bug wie #1, aber in LogicService statt LogicEngine |
| Legacy `_check_single_condition` hat keine Minuten-Granularität | `logic_engine.py:534-552` | MITTEL — Legacy-Pfad nutzt nur `start_hour`/`end_hour` (Integer), nicht HH:MM |
| `_execute_action_legacy` kennt nur `actuator_command`/`actuator` | `logic_engine.py:680-753` | MITTEL — Notification/Delay/Sequence fallen auf "Unknown action type" |
| Cooldown vergleicht aware vs naive datetime | `logic_engine.py:286` | PRÜFEN — `datetime.now(timezone.utc)` - `last_execution.timestamp` (naive?) |
| `HistoricalChart.vue` nutzt `raw_value` statt `processed_value` | Frontend Charts | NIEDRIG — User sieht ADC-Rohwerte statt kalibrierte Werte |
| Frontend `SensorReading` Typ hat kein `sensor_type` Feld | `types/index.ts` | MITTEL — Multi-Value-Sensor-Gruppierung in Charts könnte fehlen |
