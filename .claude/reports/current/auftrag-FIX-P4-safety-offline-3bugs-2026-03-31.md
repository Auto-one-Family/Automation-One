# Auftrag: FIX — P4 Safety Offline-Mode (3 Bugs)

**Typ:** Bugfix (Firmware + Backend)
**Datum:** 2026-03-31
**Prioritaet:** KRITISCH — Sicherheitskritisch, P4 Offline-Mode ist aktuell wirkungslos
**Reihenfolge:** Bug-1 → Bug-3 → Bug-2 (jeder Bug einzeln committen, Build-Verifikation nach jedem Commit)

---

## Ueberblick

Das AutomationOne-System hat zwei Safety-Mechanismen fuer Server-/Netzwerk-Ausfall:

**SAFETY-P1 (ACK-Timeout):** Server sendet keine Heartbeat-ACKs mehr → nach 120s werden Aktoren abgeschaltet. Greift NUR wenn MQTT noch verbunden ist (`mqttClient.isConnected()` in `checkServerAckTimeout()`). P1 triggert P4 via `offlineModeManager.onDisconnect()`. Szenario: Server-Prozess crashed, Broker laeuft weiter.

**SAFETY-P4 (Offline-Hysterese):** MQTT-Verbindung zum Broker bricht ab ODER P1 triggert → 30s Grace Period (DISCONNECTED) → OFFLINE_ACTIVE → Safety-Task-Loop (`safetyTaskFunction()` Zeile 93-96) pollt `evaluateOfflineRules()` alle 5s.

### Build-Environments — Zwei MQTT-Stacks

| Env-Name | Board | MQTT-Stack | Disconnect-Pfad | Bug-1-Stelle |
|----------|-------|-----------|-----------------|-------------|
| `esp32_dev` | ESP32 DevKit WROOM | **ESP-IDF native** | `safety_task.cpp` via `NOTIFY_MQTT_DISCONNECTED` | Zeile 61-65 |
| `seeed_xiao_esp32c3` | Seeed XIAO C3 | **PubSubClient** (`-DMQTT_USE_PUBSUBCLIENT=1`) | `mqtt_client.cpp:handleDisconnection()` direkt | Zeile 991-994 |
| `wokwi_simulation` | extends esp32_dev | **PubSubClient** (`-DMQTT_USE_PUBSUBCLIENT=1`) | `mqtt_client.cpp:handleDisconnection()` direkt | Zeile 991-994 |

**Heutiger Live-Test lief auf `esp32_dev` (WROOM).** Bug-1 muss auf ALLEN Environments gefixt werden.

### Live-Test-Beweis (2026-03-31, esp32_dev WROOM, ESP_EA5484, SHT31 + Relay GPIO 14)

P4 funktioniert grundsaetzlich! Bei Server-Ausfall (nur Server gestoppt, Broker laeuft):
```
T=2273s  P1 feuert → Aktor AUS → P4 startet 30s Grace
T=2303s  P4 → OFFLINE_ACTIVE, 1 Rule
T=2323s  Rule: Temp 30.54°C → Aktor AN          ← Offline-Rule uebernimmt!
T=2383s  Sensor angefasst → 83°C → Aktor AUS     ← Hysterese funktioniert!
```
**Problem:** 50s "falsches AUS" weil P1 sofort abschaltet bevor P4 uebernimmt.

Bei Broker-Ausfall (MQTT-Disconnect):
```
T+0ms    MQTT_DISCONNECTED
T+11ms   P4 Grace Timer gestartet
T+14ms   SAFETY-M2 schaltet SOFORT Aktor AUS  ← Grace Period ignoriert!
T+13s    MQTT reconnected → P4 nie OFFLINE_ACTIVE erreicht
```

---

## Bug-1: Sofortiges Abschalten bei MQTT-Disconnect

### Zwei Code-Pfade — BEIDE muessen gefixt werden

**Pfad A — ESP-IDF (esp32_dev):**

`mqtt_client.cpp` (Zeile 776, `#ifndef MQTT_USE_PUBSUBCLIENT`):
```cpp
// MQTT_EVENT_DISCONNECTED Handler:
offlineModeManager.onDisconnect();                                          // Zeile 830 — OK
xTaskNotify(g_safety_task_handle, NOTIFY_MQTT_DISCONNECTED, eSetBits);      // Zeile 836
```
`safety_task.cpp` (Zeile 61-65, `#ifndef MQTT_USE_PUBSUBCLIENT`):
```cpp
// Empfaengt NOTIFY_MQTT_DISCONNECTED:
actuatorManager.setAllActuatorsToSafeState();    // Zeile 63 ← BUG
LOG_W(TAG, "[SAFETY-M2] MQTT_DISCONNECTED received — setting safe state"); // Zeile 64
```

**Pfad B — PubSubClient (seeed + wokwi):**

`mqtt_client.cpp`, `handleDisconnection()` (Zeile 984, `#ifdef MQTT_USE_PUBSUBCLIENT`):
```cpp
if (actuatorManager.isInitialized()) {                                      // Zeile 991
    actuatorManager.setAllActuatorsToSafeState();                           // Zeile 993 ← BUG
    LOG_W(TAG, "[SAFETY] MQTT disconnected — all actuators set to safe state"); // Zeile 994
}
offlineModeManager.onDisconnect();                                          // Zeile 998 — OK
```

### Was passieren soll (SOLL) — abhaengig von Offline-Rules

**Wenn KEINE Offline-Rules im NVS (offline_rule_count_ == 0):**
- Aktoren SOFORT auf safe state (default_state = OFF) — das bestehende Verhalten ist hier KORREKT
- Ohne Rules gibt es keinen Grund zu warten, sofortiges Abschalten ist die sicherste Option

**Wenn Offline-Rules vorhanden (offline_rule_count_ > 0):**
1. P4 startet 30s Grace Timer → Aktoren bleiben UNVERAENDERT
2. Nach 30s: P4 → OFFLINE_ACTIVE
3. Safety-Task-Loop pollt `evaluateOfflineRules()` alle 5s (bestehender Code, Zeile 93-96)
4. Rules entscheiden ob Aktor AN oder AUS bleibt

### Fix 1a: `src/tasks/safety_task.cpp` (esp32_dev)

Zeile 61-65, im `#ifndef MQTT_USE_PUBSUBCLIENT` Block.

**Ersetze** den unbedingten `setAllActuatorsToSafeState()` durch eine Pruefung auf Offline-Rules:

SOLL:
```cpp
// NOTIFY_MQTT_DISCONNECTED empfangen:
if (offlineModeManager.getOfflineRuleCount() > 0) {
    LOG_W(TAG, "[SAFETY-M2] MQTT_DISCONNECTED — %d offline rules available, delegating to P4", offlineModeManager.getOfflineRuleCount());
    // P4 Grace Period laeuft, Rules uebernehmen nach 30s
} else {
    actuatorManager.setAllActuatorsToSafeState();
    LOG_W(TAG, "[SAFETY-M2] MQTT_DISCONNECTED — no offline rules, setting actuators to safe state immediately");
}
```

**Hinweis:** `getOfflineRuleCount()` muss ggf. als public Methode auf `OfflineModeManager` exponiert werden (gibt `offline_rule_count_` zurueck). Falls bereits vorhanden, direkt nutzen.

`NOTIFY_EMERGENCY_STOP` Behandlung bleibt KOMPLETT unveraendert.

### Fix 1b: `src/services/communication/mqtt_client.cpp` (seeed + wokwi)

`handleDisconnection()`, Zeile 991-998, im `#ifdef MQTT_USE_PUBSUBCLIENT` Block.

Gleiche Logik: Nur abschalten wenn KEINE Offline-Rules vorhanden:

SOLL:
```cpp
if (actuatorManager.isInitialized()) {
    if (offlineModeManager.getOfflineRuleCount() > 0) {
        LOG_W(TAG, "[SAFETY] MQTT disconnected — %d offline rules available, delegating to P4", offlineModeManager.getOfflineRuleCount());
    } else {
        actuatorManager.setAllActuatorsToSafeState();
        LOG_W(TAG, "[SAFETY] MQTT disconnected — no offline rules, safe state immediately");
    }
}
offlineModeManager.onDisconnect();    // IMMER — startet P4 Grace Timer
```

### Fix 1c: `src/services/safety/offline_mode_manager.cpp` — Defense-in-Depth

`activateOfflineMode()` (Zeile 314-318) braucht keine zwingende Aenderung fuer den 0-Rules-Fall — Fix 1a/1b schaltet bei 0 Rules bereits SOFORT ab. Als Absicherung optional hinzufuegen:

```cpp
if (offline_rule_count_ == 0) {
    // Sollte hier nie mit laufenden Aktoren ankommen (Fix 1a/1b schaltet sofort ab)
    actuatorManager.setAllActuatorsToSafeState();
    LOG_W(TAG, "[SAFETY-P4] OFFLINE_ACTIVE with 0 rules — confirming safe state");
}
// Wenn rules > 0: NICHTS tun — Safety-Task evaluiert in <5s automatisch
```

### Fix 1d (falls noetig): `getOfflineRuleCount()` exponieren

Falls `OfflineModeManager` keine public Methode hat die `offline_rule_count_` zurueckgibt:

`offline_mode_manager.h`:
```cpp
uint8_t getOfflineRuleCount() const { return offline_rule_count_; }
```

### Akzeptanzkriterien Bug-1

**Mit Offline-Rules (offline_rule_count_ > 0):**
- [ ] Bei MQTT-Disconnect: Kein `PumpActuator GPIO X OFF` innerhalb der ersten 30s
- [ ] Grace Period wird respektiert, Aktor bleibt im aktuellen Zustand
- [ ] Nach 30s: OFFLINE_ACTIVE → Safety-Task evaluiert Rules → Aktor reagiert korrekt

**Ohne Offline-Rules (offline_rule_count_ == 0):**
- [ ] Bei MQTT-Disconnect: Aktor wird SOFORT auf safe state gesetzt (kein Grace, kein Warten)
- [ ] Log zeigt "no offline rules, safe state immediately"

**Allgemein:**
- [ ] P4 State-Machine laeuft in beiden Faellen (`onDisconnect()` wird IMMER aufgerufen)
- [ ] Fix 1c Defense-in-Depth: Falls P4 mit 0 Rules OFFLINE_ACTIVE erreicht → bestaetigt safe state (Aktoren sind bereits AUS)
- [ ] Emergency-Stop (`NOTIFY_EMERGENCY_STOP`) funktioniert weiterhin sofort
- [ ] Keine neuen `#ifndef WOKWI_SIMULATION` Guards noetig (bestehende Guards betreffen nur WDT-Calls)

### Build-Verifikation Bug-1

```bash
cd "El Trabajante"
/c/Users/robin/AppData/Local/Programs/Python/Python312/Scripts/pio.exe run -e esp32_dev
/c/Users/robin/AppData/Local/Programs/Python/Python312/Scripts/pio.exe run -e seeed_xiao_esp32c3
```

---

## Bug-3: P1 schaltet Aktoren ab UND triggert P4 → 50s Flapping

### Was passiert (IST)

`main.cpp`, `checkServerAckTimeout()` (Zeile 2323):

```cpp
// Zeile 2327-2328 (Log):
LOG_W(TAG, "[SAFETY-P1] Server ACK timeout (" + String(SERVER_ACK_TIMEOUT_MS / 1000) + "s) — setting actuators to safe state");
// Zeile 2331:
actuatorManager.setAllActuatorsToSafeState();    // ← ENTFERNEN
offlineModeManager.onDisconnect();               // ← BEHALTEN
```

`g_server_timeout_triggered` wird bei Server-ACK-Recovery (Zeile 1217) korrekt zurueckgesetzt — der Fix verursacht dort kein Folgeproblem.

### Warum `onDisconnect()` BEHALTEN werden muss

Bei "Server down, Broker laeuft" gibt es keinen echten MQTT-Disconnect. Ohne `onDisconnect()` wuerde P4 NIE aktiviert. Der Live-Test hat bewiesen: P4 uebernimmt erfolgreich nach P1-Trigger und steuert den Aktor korrekt ueber Offline-Rules.

### Fix

**Datei: `src/main.cpp`**, `checkServerAckTimeout()` (Zeile 2323)

Gleiche Logik wie Bug-1: Abhaengig von Offline-Rules.

IST:
```cpp
LOG_W(TAG, "[SAFETY-P1] Server ACK timeout (" + String(SERVER_ACK_TIMEOUT_MS / 1000) + "s) — setting actuators to safe state");
actuatorManager.setAllActuatorsToSafeState();
offlineModeManager.onDisconnect();
```

SOLL:
```cpp
if (offlineModeManager.getOfflineRuleCount() > 0) {
    LOG_W(TAG, "[SAFETY-P1] Server ACK timeout (" + String(SERVER_ACK_TIMEOUT_MS / 1000) + "s) — delegating to P4 (%d rules)", offlineModeManager.getOfflineRuleCount());
} else {
    actuatorManager.setAllActuatorsToSafeState();
    LOG_W(TAG, "[SAFETY-P1] Server ACK timeout (" + String(SERVER_ACK_TIMEOUT_MS / 1000) + "s) — no offline rules, safe state immediately");
}
offlineModeManager.onDisconnect();   // IMMER — startet P4 State-Machine
```

### Akzeptanzkriterien Bug-3

**Mit Offline-Rules:**
- [ ] Bei Server-Stop: P1-Log mit "delegating to P4", **KEIN** Aktor-OFF durch P1
- [ ] Aktor bleibt 30s unveraendert (Grace Period)
- [ ] Nach 30s: P4 evaluiert Offline-Rules
- [ ] Kein 50s "falsches AUS" Fenster mehr

**Ohne Offline-Rules:**
- [ ] Bei Server-Stop: P1 schaltet sofort ab (wie bisher)
- [ ] Log zeigt "no offline rules, safe state immediately"

### Build-Verifikation Bug-3

```bash
cd "El Trabajante"
/c/Users/robin/AppData/Local/Programs/Python/Python312/Scripts/pio.exe run -e esp32_dev
/c/Users/robin/AppData/Local/Programs/Python/Python312/Scripts/pio.exe run -e seeed_xiao_esp32c3
```

---

## Bug-2: Server pusht 0 Offline-Rules trotz aktiver Logic Rule

### Was passiert (IST)

Config-Push enthielt `offline_rules: []`. ESP Serial:
```
[CONFIG] Received 0 offline rules - cleared
StorageManager: Cleared namespace: offline
```

Problem wurde temporaer durch Hinzufuegen eines DS18B20-Sensors umgangen (danach kam 1 Rule). Debug-Logging soll kuenftig sofort zeigen WARUM 0 Rules rauskommen.

### Fix: Debug-Logging an 4 fehlenden Stellen

**Datei: `god_kaiser_server/src/services/config_builder.py`**, `_extract_offline_rule()` (ab Zeile 356)

**3 Stellen haben BEREITS Logging — NICHT duplizieren:**
- Zeile 414-417 (keine gueltige Schwellwert-Kombination): `logger.debug()` vorhanden
- Zeile 422-426 (gpio < 0): `logger.debug()` vorhanden
- Zeile 470-478 (Calibration-Guard): `logger.warning()` vorhanden

**Optional:** Die zwei `logger.debug()` an Zeile 414 und 422 auf `logger.warning()` hochstufen, damit sie ohne Debug-Log-Level sichtbar sind. Keine Pflicht.

**Logging fehlt an genau 4 Stellen — NUR diese ergaenzen:**

**1. Zeile ~390** — `return None` wenn `conditions_list` malformed:
```python
logger.warning(f"Offline-rule skip: rule '{rule.rule_name}' — malformed conditions_list (type: {type(conditions_list).__name__})")
return None
```

**2. Zeile ~401** — `return None` wenn KEIN Condition `type == "hysteresis"` — **WAHRSCHEINLICHSTE ROOT CAUSE:**
```python
condition_types = [c.get('type', 'MISSING') for c in conditions_list] if isinstance(conditions_list, list) else []
logger.warning(f"Offline-rule skip: rule '{rule.rule_name}' — no hysteresis condition found (types: {condition_types})")
return None
```

**3. Zeile ~440** — `return None` wenn `actions` keine Liste:
```python
logger.warning(f"Offline-rule skip: rule '{rule.rule_name}' — actions is not a list (type: {type(rule.actions).__name__})")
return None
```

**4. Zeile ~461** — `return None` wenn keine passende Actuator-Action:
```python
logger.warning(f"Offline-rule skip: rule '{rule.rule_name}' — no matching actuator action for esp {esp_id}")
return None
```

**Summary-Log in `_build_offline_rules()`** am Ende:
```python
logger.info(f"Built {len(offline_rules)} offline rules for ESP {esp_id} (checked {len(rules)} active rules)")
```

### Diagnose nach Logging-Fix

```sql
SELECT id, rule_name, is_active, conditions::text, actions::text
FROM cross_esp_logic WHERE is_active = true;
```

Server-Logs nach naechstem Config-Push pruefen:
```bash
docker logs el-servador 2>&1 | grep -i "offline-rule skip\|Built.*offline"
```

### Akzeptanzkriterien Bug-2

- [ ] Server-Log zeigt fuer jede uebersprungene Rule den Grund
- [ ] `Built X offline rules for ESP` Log am Ende
- [ ] Kein doppeltes Logging bei den 3 bereits abgedeckten Stellen
- [ ] ESP Serial zeigt: `[CONFIG] Received X offline rules` mit X > 0 (Achtung: TAG ist `SAFETY-P4` aber Message-Prefix ist `[CONFIG]`)
- [ ] ESP Serial zeigt: `[CONFIG] Saved X offline rules to NVS`

### Test-Verifikation Bug-2

```bash
cd "El Servador/god_kaiser_server"
pytest tests/unit/test_config_builder_offline_rules.py --tb=short -q
```

---

## Aenderungstabelle (final, alle Pfade verifiziert)

| Datei | Bug | Zeile | Aenderung |
|-------|-----|-------|-----------|
| `src/tasks/safety_task.cpp` | Bug-1 | 61-65 | `setAllActuatorsToSafeState()` + Log entfernen (esp32_dev, `#ifndef MQTT_USE_PUBSUBCLIENT`) |
| `src/services/communication/mqtt_client.cpp` | Bug-1 | 993-994 | `setAllActuatorsToSafeState()` + LOG_W entfernen (seeed+wokwi, `#ifdef MQTT_USE_PUBSUBCLIENT`) |
| `src/services/safety/offline_mode_manager.cpp` | Bug-1 | ~314 | `activateOfflineMode()`: wenn `offline_rule_count_ == 0` → safe state. Wenn > 0 → nichts (5s-Poll) |
| `src/main.cpp` | Bug-3 | 2327-2331 | `setAllActuatorsToSafeState()` entfernen, `onDisconnect()` behalten, Log-Text aendern |
| `god_kaiser_server/src/services/config_builder.py` | Bug-2 | ~390,401,440,461 | `logger.warning()` an 4 fehlenden `return None`-Pfaden + Summary-Log |

**Reihenfolge + Verifikation:**

| Schritt | Bug | Build/Test |
|---------|-----|-----------|
| 1 | Bug-1 (3 Dateien) | `pio run -e esp32_dev` + `pio run -e seeed_xiao_esp32c3` |
| 2 | Bug-3 (main.cpp) | `pio run -e esp32_dev` + `pio run -e seeed_xiao_esp32c3` |
| 3 | Bug-2 (config_builder.py) | `pytest tests/unit/test_config_builder_offline_rules.py` |

**Was NICHT geaendert wird:**
- Emergency-Stop (`NOTIFY_EMERGENCY_STOP`) — muss sofort greifen
- `offlineModeManager.onDisconnect()` in mqtt_client.cpp (BEHALTEN — startet P4)
- `offlineModeManager.onDisconnect()` in main.cpp (BEHALTEN — P1→P4 Trigger)
- Config-Push-Struktur / MQTT-Topics / DB-Schema / Frontend
- Timeout-Werte (120s P1, 30s P4 Grace)
- `#ifndef WOKWI_SIMULATION` Guards in safety_task.cpp (betreffen nur WDT, nicht Safety-Fixes)

---

## Verifizierungsplan nach allen 3 Fixes

### Test A: Nur Server down (Broker laeuft) — MIT Offline-Rules
1. Aktor ist AN (durch Server-Rule)
2. Server stoppen (Broker laeuft weiter)
3. **Erwartung:**
   - 120s: P1 feuert, **KEIN Aktor-OFF**, nur `delegating to P4`
   - P4 startet 30s Grace
   - Nach 30s: `Offline mode ACTIVE - 1 local rules enabled`
   - <5s spaeter: Rule evaluiert → Aktor bleibt AN
   - **0s Unterbrechung** (kein falsches AUS mehr)
4. Sensor anfassen → Temp steigt → Rule deaktiviert → Aktor AUS
5. Server starten → Recovery

### Test B: Broker down — MIT Offline-Rules
1. Aktor ist AN
2. Broker stoppen
3. **Erwartung:**
   - MQTT-Disconnect → **KEIN sofortiges OFF**
   - 30s Grace → P4 → Rules → Aktor bleibt AN
4. Sensor anfassen → Aktor AUS
5. Broker starten → Recovery

### Test C: Broker down — OHNE Offline-Rules
1. Logic Rule deaktivieren → Config-Push → 0 Rules
2. Aktor ist AN
3. Broker stoppen
4. **Erwartung:** Aktor wird SOFORT auf safe state gesetzt (Fix 1a/1b, kein Grace-Warten)

### Vorher vs Nachher

| Szenario | VORHER | NACHHER |
|----------|--------|---------|
| Server down, MIT Rules | 120s → P1 AUS → 30s → P4 AN (50s falsches AUS) | 120s → P1 delegiert → 30s Grace → P4 evaluiert (0s Unterbrechung) |
| Server down, OHNE Rules | 120s → P1 AUS | 120s → P1 AUS (unveraendert) |
| Broker down, MIT Rules | SOFORT AUS | 30s Grace → P4 → Aktor bleibt AN |
| Broker down, OHNE Rules | SOFORT AUS | SOFORT AUS (unveraendert — Fix 1a/1b) |
