# Logic Engine Bug-Fix Report + Volltest

**Datum:** 2026-02-28
**Bezug:** auftrag-chaos-engineering-mock-volltest.md
**Branch:** master (Fixes direkt)
**Fokus:** Logic Engine Bugs + Block A/B/C Volltest

---

## Zusammenfassung

8 Bugs in der Logic Engine identifiziert und gefixt. Danach Server rebuilt und Volltest (Block A, B, C) erfolgreich durchgeführt.

---

## Gefixte Bugs

### BUG 1 (KRITISCH): `evaluate_timer_triggered_rules` — conditions vs trigger_conditions

**Datei:** `services/logic_engine.py:210`
**Problem:** `rule.conditions` (Property, gibt immer `list` zurück) wurde für die Timer-Filterung genutzt. Aber `.get("type")` auf einer Liste gibt immer `None` → Timer-Rules wurden **nie** gefunden.
**Fix:** Konsistent `rule.trigger_conditions` (raw JSON, kann `dict` sein) für die Typ-Prüfung nutzen.
**Impact:** Alle zeit-basierten Rules (time_window) waren komplett tot.

### BUG 2 (HOCH): TimeConditionEvaluator — Minuten werden ignoriert

**Datei:** `services/logic/conditions/time_evaluator.py:79-80`
**Problem:** Bei HH:MM Format (z.B. "14:37") wurde nur `parts[0]` (Stunde) extrahiert. `parts[1]` (Minute) wurde verworfen. Ein Zeitfenster "14:30-15:30" wurde als "14:00-15:00" behandelt.
**Fix:** Minuten extrahieren und in Gesamtminuten rechnen (`hour * 60 + minute`) für alle Vergleiche.
**Impact:** Alle Zeitfenster hatten nur Stunden-Granularität.

### BUG 3 (HOCH): Legacy `_check_single_condition` — TypeError bei Vergleich

**Datei:** `services/logic_engine.py:468-486`
**Problem:** `actual > threshold` ohne `float()` Konversion. Wenn DB JSON Werte als String speichert → `TypeError: '>' not supported between instances of 'str' and 'float'`.
**Fix:** `float()` Konversion mit try/catch, plus `None`-Check für `actual`.
**Impact:** Legacy-Pfad crashte bei String-Werten aus DB.

### BUG 4 (MITTEL): Legacy `_check_single_condition` — kein Overnight-Wrapping

**Datei:** `services/logic_engine.py:504-505`
**Problem:** `start_hour <= current_hour < end_hour` funktioniert nicht für 22:00-06:00 (start > end).
**Fix:** Gleiche Wrapping-Logik wie im modularen TimeConditionEvaluator.
**Impact:** Nacht-Zeitfenster funktionierten nicht im Legacy-Pfad.

### BUG 5 (HOCH): `validate_action` rejectiert notification/delay/sequence

**Datei:** `db/models/logic_validation.py:241-247`
**Problem:** `validate_action()` akzeptierte NUR `actuator_command`/`actuator`. Alle anderen Action-Types warfen `ValueError` → Rule-Erstellung mit Notification, Delay oder Sequence Actions scheiterte.
**Fix:** Pydantic-Modelle für `NotificationAction`, `DelayAction`, `SequenceAction` erstellt. `validate_action()` und `ActionType` Union erweitert.
**Impact:** Rules mit Notification/Delay/Sequence Actions konnten nicht erstellt werden.

### BUG 6 (MITTEL): WebSocket broadcast unterbricht Rule-Execution

**Datei:** `services/logic_engine.py:588` + Legacy-Methode
**Problem:** `await self.websocket_manager.broadcast()` ohne try/catch. Bei WS-Fehler wird die Exception geworfen und unterbricht die Action-Schleife.
**Fix:** Try/catch um beide WS-Broadcast-Stellen (modular + legacy). Warning loggen statt crashen.
**Impact:** WS-Probleme konnten Actuator-Commands verhindern.

### BUG 7 (MITTEL): `list_rules` sortiert falsch

**Datei:** `api/v1/logic.py:93`
**Problem:** `rules.sort(key=lambda r: r.priority, reverse=True)` — niedrige Prioritätszahl = höhere Wichtigkeit, aber `reverse=True` zeigt Priority 1 (wichtigste) **zuletzt**.
**Fix:** `reverse=True` entfernt → natürliche aufsteigende Sortierung.
**Impact:** UI zeigte unwichtigste Rules zuerst.

### BUG 8 (MITTEL): GPIO Typ-Mismatch im SensorConditionEvaluator

**Datei:** `services/logic/conditions/sensor_evaluator.py:54` + `logic_engine.py:459`
**Problem:** `condition.get("gpio") != sensor_data.get("gpio")` — GPIO kann als `int` in Condition und `str` in Sensor-Data ankommen → false negative trotz gleicher GPIO-Nummer.
**Fix:** `int()` Konversion in beiden Evaluatoren (modular + legacy). Plus: `threshold` None-Check hinzugefügt.
**Impact:** Sensor-Conditions konnten bei Typ-Inkonsistenzen nicht matchen.

---

## Geänderte Dateien

| Datei | Fixes |
|-------|-------|
| `services/logic_engine.py` | #1, #3, #4, #6 |
| `services/logic/conditions/time_evaluator.py` | #2 |
| `services/logic/conditions/sensor_evaluator.py` | #8 |
| `db/models/logic_validation.py` | #5 |
| `api/v1/logic.py` | #7 |

---

## Volltest-Ergebnisse

### Block A: Mock-Server-Infrastruktur

| Check | Status | Details |
|-------|--------|---------|
| Stack healthy | ✅ | `status: healthy, mqtt: true` |
| Login/Token | ✅ | Admin-Token erfolgreich |
| Mock registrieren | ✅ | Heartbeat → pending_approval |
| Mock approven | ✅ | HTTP 200, status: approved |
| Sensor-Daten senden | ✅ | sht31_temp + sht31_humidity |
| Baseline DB | ✅ | Alle Daten korrekt in DB |

### Block B: Server/API Komplett-Test

| Endpoint-Kategorie | Status | Details |
|---------------------|--------|---------|
| Endpoint-Inventar | ✅ | 148 Endpoints |
| Health | ✅ | healthy |
| Auth (Login) | ✅ | Token korrekt |
| Auth (Falsches PW) | ✅ | HTTP 401 |
| Auth (Kein Token) | ✅ | HTTP 401 |
| ESP Devices | ✅ | 5 Devices, Detail 200, 404 korrekt |
| Sensor-Data API | ✅ | HTTP 200 (kein 500 mehr!) |
| **Logic Rules CRUD** | ✅ | Create 201, Detail 200, Delete 200 |
| **Logic Rule Test** | ✅ | would_trigger: True bei 30>28, False bei 25>28 |
| **Logic Toggle** | ✅ | HTTP 200 |
| **Logic History** | ✅ | HTTP 200 |
| **Notification Action** | ✅ | Create 201 (FIX 5 bestätigt!) |
| **Compound Conditions** | ✅ | Create 201 |
| Error: Invalid JSON | ✅ | HTTP 422 |
| Error: Missing fields | ✅ | HTTP 422 |
| Error: Rule not found | ✅ | HTTP 404 |
| Zone Endpoints | ✅ | HTTP 200 |

### Block C: MQTT-Pipeline End-to-End

| Handler | Status | Details |
|---------|--------|---------|
| MQTT Broker | ✅ | 3 Clients connected |
| Heartbeat → DB | ✅ | last_seen aktualisiert |
| Sensor-Data (5 Typen) | ✅ | sht31_temp, sht31_humidity, ds18b20, ph, ec |
| LWT → offline | ✅ | Status: offline |
| Heartbeat → online | ✅ | Status: online |
| MQTT → DB Wert | ✅ | 23.0 korrekt gespeichert |
| Discovery Handler | ✅ | Neues Device: pending_approval |

---

## Offene Punkte (nicht in Scope)

| Issue | Priorität | Grund |
|-------|-----------|-------|
| RateLimiter ist In-Memory only | NIEDRIG | Single-Server-Setup, kein Redis nötig |
| LogicRepo `get_rules_by_trigger_sensor` Linear Scan | NIEDRIG | Aktuell < 100 Rules |
| Hysteresis Evaluator nicht implementiert | NIEDRIG | Placeholder-Datei existiert |
| `validate_safety()` Placeholder | NIEDRIG | Benötigt Actuator-Metadata-Schema |

---

## Fazit

**8 Bugs gefixt**, davon 1 kritisch (Timer-Rules komplett tot), 3 hoch (Type-Crashes, Action-Rejection), 4 mittel. Server rebuilt und **alle 25+ Tests in Block A-C bestanden**. Die Logic Engine ist jetzt produktionsbereit für den Hardware-Test.
