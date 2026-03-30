# Auftrag L1: Live-Verifikation + QoS Fix

**Ziel-Repo:** auto-one (El Trabajante + El Servador + El Frontend)
**Typ:** Verifikation (5 Checks) + 1 Firmware-Fix (N8)
**Prioritaet:** HIGH
**Datum:** 2026-03-29
**Geschaetzter Aufwand:** ~1-2h
**Abhaengigkeit:** L0 Deep Dive Analyse (ERLEDIGT)
**Blockiert:** L2, L3, L5

---

## Auftragsziel

Die Deep Dive Analyse (`LOGIC_ENGINE_DEEPDIVE_ANALYSE_2026-03-29.md`) hat ergeben, dass die 4 bekannten Code-Bugs (F1-F4) bereits im aktuellen Codestand gefixt sind. Dieser Auftrag verifiziert diese Fixes auf dem laufenden Pi-5-System mit echtem Befeuchter und fixt den einzigen neuen Hardware-relevanten Bug (N8: QoS-Mismatch).

**Ergebnis:** Verifikations-Protokoll (PASS/FAIL pro Check) + N8-Fix committed.

---

## System-Kontext

AutomationOne ist ein 3-schichtiges IoT-Framework:

- **El Trabajante (ESP32 Firmware, C++):** Liest Sensoren, steuert Aktoren. Kommuniziert per MQTT. Logic Engine laeuft NICHT auf dem ESP — der ESP ist reiner Executor.
- **El Servador (FastAPI Backend, Python):** PostgreSQL (31 Tabellen), MQTT-Broker (Mosquitto), Logic Engine als Background-Service. Empfaengt Sensor-Daten via MQTT, wertet Regeln aus, sendet Aktor-Befehle zurueck.
- **El Frontend (Vue 3 Dashboard, TypeScript):** Rule-Builder (LogicView), Monitor, Execution History.

### Live-System (Pi 5)

| Parameter | Wert |
|-----------|------|
| ESP-ID | ESP_EA5484 ("Zelt Agent") |
| Sensor | SHT31 (GPIO 0, I2C 0x44) — Temperatur + Luftfeuchte |
| Aktor | Luftbefeuchter an Olimex PWR Switch (GPIO 14, konfiguriert als Pumpe) |
| Zone | "Zelt Wohnzimmer" |
| Subzone | "Pflanze 1" (assigned_gpios=[0,14]) |

### MQTT-Topics (relevant)

| Topic | Zweck |
|-------|-------|
| `kaiser/{k}/esp/{e}/sensor/{gpio}/data` | Sensor-Daten (ESP → Server) |
| `kaiser/{k}/esp/{e}/actuator/{gpio}/command` | Aktor-Befehle (Server → ESP) |
| `kaiser/{k}/esp/{e}/actuator/{gpio}/status` | Aktor-Status (ESP → Server) |
| `kaiser/{k}/esp/{e}/actuator/{gpio}/response` | Aktor-Response (ESP → Server) |

---

## Teil 1: Verifikations-Checks (5 Stueck)

### V1: Duration-Timer (F1 Fix-Verifikation)

**Was wurde gefixt:** `RegisteredActuator.command_duration_end_ms` in `actuator_manager.h:68`. Timer wird in `handleActuatorCommand()` bei ON + `duration_s > 0` aktiviert (`actuator_manager.cpp:650-653`). Auto-OFF in `processActuatorLoops()` (`actuator_manager.cpp:534-546`).

**Test-Schritte:**
1. MQTT-Befehl senden: `{"command":"ON", "value":255, "duration":15}` auf Topic `kaiser/.../actuator/14/command`
2. Serial-Monitor beobachten: ESP muss "duration timer armed: 15s" (oder aehnlich) loggen
3. 15 Sekunden warten
4. Serial-Monitor: Auto-OFF Log erwartet
5. GPIO 14 muss LOW sein (Befeuchter aus)
6. Actuator-Status-Update muss per MQTT an Server gehen

**Erwartetes Ergebnis:** Befeuchter geht nach exakt ~15s aus. Serial-Monitor zeigt Timer-Aktivierung und Auto-OFF.

**PASS-Kriterium:** Aktor schaltet nach `duration` Sekunden (+-2s Toleranz) automatisch ab.

### V2: OFF-Befehl (F2 Fix-Verifikation)

**Was wurde gefixt:** `equalsIgnoreCase("OFF")` statt case-sensitive Vergleich in `actuator_manager.cpp:656`. Server sendet immer Uppercase via `command.upper()` in `publisher.py:91`.

**Test-Schritte:**
1. Aktor einschalten: `{"command":"ON", "value":255}` senden
2. Bestaetigen: GPIO 14 ist HIGH (Befeuchter laeuft)
3. OFF senden: `{"command":"OFF"}` auf gleichen Topic
4. Serial-Monitor: OFF-Handling Log erwartet
5. GPIO 14 muss LOW sein
6. Zusaetzlich testen: `{"command":"off"}` (lowercase) — muss ebenfalls funktionieren

**PASS-Kriterium:** Aktor schaltet bei OFF-Befehl zuverlaessig ab, unabhaengig von Gross/Kleinschreibung.

### V3: Hysterese-Roundtrip Frontend (F3 Fix-Verifikation)

**Was wurde gefixt:** `graphToRuleData()` in `RuleFlowEditor.vue:625-641` erkennt `isHysteresis === true || operator === 'hysteresis'` und erstellt korrekt `type: 'hysteresis'` mit allen 4 Schwellenwert-Feldern.

**Test-Schritte:**
1. Bestehende Hysterese-Regel im Editor oeffnen (oder neue erstellen mit `activate_below=45`, `deactivate_above=55`)
2. Regel speichern (Save-Button)
3. API-Response pruefen: `GET /api/v1/logic/rules/{id}` — `trigger_conditions` muss `type: 'hysteresis'` mit korrekten Schwellenwerten enthalten
4. Regel erneut im Editor oeffnen
5. Schwellenwerte muessen die gespeicherten Werte anzeigen (45, 55)

**PASS-Kriterium:** Schwellenwerte ueberleben Save/Load-Roundtrip ohne Datenverlust. API-Response zeigt `type: 'hysteresis'`.

### V4: Hysterese-Evaluator feuert (F4 Fix-Verifikation)

**Was wurde gefixt:** `HysteresisConditionEvaluator` ist in allen 3 Registrierungsstellen vorhanden:
- `main.py:633` (produktiv)
- `logic_engine.py:75` (Fallback)
- `logic_service.py:72` (Rule-Test)

**Test-Schritte:**
1. Hysterese-Regel aktivieren (enabled=true) mit `activate_below=45`, `deactivate_above=55` fuer SHT31 Humidity
2. SHT31-Wert beobachten — wenn Luftfeuchte < 45%: Regel muss feuern
3. `GET /api/v1/logic/execution_history` pruefen: letzte Ausfuehrung muss `success: true` zeigen
4. Alternativ: `POST /api/v1/logic/rules/{id}/test` — Trockenlauf muss Bedingung korrekt auswerten

**PASS-Kriterium:** Hysterese-Regel feuert bei Schwellwert-Ueberschreitung. Execution History zeigt erfolgreiche Ausfuehrung.

### V5: Live-Daten Check (L0 offener Punkt)

Die Deep Dive Analyse hatte keinen direkten DB-Zugang zum Pi 5. Diese Queries muessen jetzt ausgefuehrt werden:

**Queries:**
```sql
-- 1. Aktuelle Regel
SELECT id, rule_name, enabled, trigger_conditions, actions, cooldown_seconds, max_executions_per_hour
FROM cross_esp_logic WHERE enabled = true;

-- 2. Letzte 20 Ausfuehrungen
SELECT rule_id, success, created_at, trigger_data, error_message
FROM logic_execution_history ORDER BY created_at DESC LIMIT 20;

-- 3. Aktor-Status
SELECT * FROM actuator_states WHERE esp_id = 'ESP_EA5484';

-- 4. Sensor-Datenfluss (letzte 20 Werte)
SELECT created_at, sensor_type, raw_value, processed_value
FROM sensor_data WHERE esp_id = 'ESP_EA5484'
ORDER BY created_at DESC LIMIT 20;
```

**PASS-Kriterium:** Sensor-Daten kommen regelmaessig (alle 10-30s erwartet). Execution History zeigt Regel-Aktivitaet. Aktor-Status stimmt mit physischem Zustand ueberein.

---

## Teil 2: Fix N8 — ESP QoS fuer Aktor-Commands

### Problem

**Datei:** `El Trabajante/src/main.cpp:825` (oder wo MQTT-Subscriptions definiert sind)

Der ESP subscribed Aktor-Command-Topics mit QoS 0 (At Most Once), weil `PubSubClient::subscribe()` ohne QoS-Parameter aufgerufen wird. Der Server publiziert Aktor-Befehle mit QoS 2 (Exactly Once). Bei instabiler WLAN-Verbindung koennen Aktor-Befehle verloren gehen — der Server denkt der Befehl wurde zugestellt, aber der ESP hat ihn nie empfangen.

### IST-Zustand

```cpp
// main.cpp:825 (ungefaehr)
client.subscribe("kaiser/+/esp/" + espId + "/actuator/+/command");
// Ohne QoS-Parameter → Default QoS 0
```

### SOLL-Zustand

```cpp
// QoS 1 (At Least Once) fuer Aktor-Commands
client.subscribe("kaiser/+/esp/" + espId + "/actuator/+/command", 1);
```

**Warum QoS 1 und nicht QoS 2:** PubSubClient (Arduino MQTT Library) unterstuetzt maximal QoS 1 fuer Subscriptions. QoS 2 ist fuer PubSubClient nicht verfuegbar. QoS 1 ist ausreichend: Doppelte Befehle sind idempotent (ON auf bereits ON hat keine Nebenwirkung), verlorene Befehle sind das eigentliche Risiko.

### Implementierung

1. In `main.cpp` (oder `mqtt_client.cpp`) den `subscribe()` Aufruf fuer Aktor-Command-Topics finden
2. QoS-Parameter auf `1` setzen
3. Pruefen ob weitere Subscriptions ebenfalls QoS 0 nutzen und ob Upgrade sinnvoll ist:
   - **Config-Topic** (`…/config`): QoS 1 empfohlen (Konfiguration darf nicht verloren gehen)
   - **System-Commands** (`…/system/command`): QoS 1 empfohlen
   - **Sensor-Daten** (wenn subscribed): QoS 0 akzeptabel (naechster Wert kommt in Sekunden)

### Akzeptanzkriterien N8

- [ ] Aktor-Command-Subscription nutzt QoS >= 1
- [ ] Config-Subscription nutzt QoS >= 1 (wenn vorhanden)
- [ ] ESP-Logs zeigen erfolgreiche QoS-1-Subscription
- [ ] Keine Regression: Befehle kommen weiterhin korrekt an

---

## Ergebnis-Format

**Datei:** Verifikations-Protokoll in `.claude/reports/current/` oder als Kommentar im Commit.

```
# L1 Verifikations-Protokoll — 2026-03-29

| Check | Status | Details |
|-------|--------|---------|
| V1 Duration-Timer | PASS/FAIL | ... |
| V2 OFF-Befehl | PASS/FAIL | ... |
| V3 Hysterese-Roundtrip | PASS/FAIL | ... |
| V4 Hysterese-Evaluator | PASS/FAIL | ... |
| V5 Live-Daten | PASS/FAIL | ... |
| N8 QoS Fix | IMPLEMENTIERT/OFFEN | ... |

## Neue Findings (falls vorhanden)
...
```

---

## Einschraenkungen

- Verifikations-Checks sind **Beobachtungen**, keine Code-Aenderungen (ausser N8)
- Wenn ein Check FAIL zeigt: **Nicht fixen**, sondern im Protokoll dokumentieren → wird in L2 oder als separater Auftrag behandelt
- Live-System (Pi 5) bleibt im laufenden Zustand — keine destruktiven Tests
- NOT-AUS-Test nur nach Absprache mit Robin (Befeuchter muss evtl. laufen bleiben)

---

**Ende Auftrag L1.**
