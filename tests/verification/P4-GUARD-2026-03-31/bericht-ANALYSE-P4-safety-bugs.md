# P4 Safety Offline-Mode — Bug-Analyse

**Stand:** 2026-03-31 (Codebase-Review, keine Hardware-Retests)  
**Quellen:** `auftrag-ANALYSE-P4-safety-offline-bugs-2026-03-31.md`, Firmware `El Trabajante/`, Backend `god_kaiser_server/`

---

## Bug-1: SAFETY-M2 sofortiges Abschalten bei MQTT-Disconnect

### Code-Pfad (IST)

1. **`mqtt_client.cpp`** — `MQTT_EVENT_DISCONNECTED` (ca. Zeilen 810–837):
   - `offlineModeManager.onDisconnect()` (P4: 30s Grace, State `DISCONNECTED`)
   - danach `xTaskNotify(g_safety_task_handle, NOTIFY_MQTT_DISCONNECTED, eSetBits)`
2. **`safety_task.cpp`** — `safetyTaskFunction()` (Zeilen 54–66):
   - `NOTIFY_MQTT_DISCONNECTED` → Log `[SAFETY-M2] MQTT_DISCONNECTED received — setting safe state`
   - `actuatorManager.setAllActuatorsToSafeState()`
3. Kommentar in **`mqtt_client.cpp`** (832–834): „SAFETY-P1 Mechanism B: Notify Safety-Task … to set actuators to safe state“ — bewusst so verdrahtet; kollidiert mit P4-Grace.

**Hinweis:** Der Tag `SAFETY-M2` sitzt in **`safety_task.cpp`**, nicht in `main.cpp`. `main.cpp` enthält die MQTT-Message-Route für Emergency/Broadcast.

### Root Cause

P4 startet den Grace-Timer auf Core 0, aber Core 1 setzt im selben Disconnect-Event alle Aktoren sofort auf Safe-State. Reihenfolge ist fix: zuerst `onDisconnect()`, dann Notify — dennoch ist die Safety-Task-Reaktion für den Anwender „sofort“, weil `setAllActuatorsToSafeState()` ohne Bedingung läuft.

### Zusatz: P1 triggert P4 bei „nur Server down“

**`main.cpp`** `checkServerAckTimeout()` (ca. 2323–2334): Bei ACK-Timeout werden `setAllActuatorsToSafeState()` und **`offlineModeManager.onDisconnect()`** aufgerufen — obwohl MQTT weiter verbunden sein kann. Das erklärt Test-Szenario 1: P4-„Disconnect“-Log gleichzeitig mit P1, ohne echten Broker-Abbruch.

### Fix-Vorschlag (konkret)

- **Minimal (Option B):** In `safety_task.cpp` den Block `NOTIFY_MQTT_DISCONNECTED` → `setAllActuatorsToSafeState()` entfernen oder durch Delegation an P4 ersetzen (z. B. nur wenn `offline_rule_count_ == 0` nach NVS-Stand — erfordert API auf `OfflineModeManager`).
- **Kohärent mit Plan-Option A:** M2 notify nur noch für echte Notfälle (`NOTIFY_EMERGENCY_STOP`); bei MQTT-Disconnect nur P4-State-Machine, die nach 30s bei fehlenden Rules auf Safe-State geht (neuer Pfad in `OfflineModeManager` oder Safety-Task nach Timer).
- **Risiko:** Ohne sofortiges Abschalten bei Broker-Tot müssen Offline-Rules oder ein expliziter „keine Rules“-Failsafe nach Grace greifen — sonst Safety-Regression.

### Risiko-Bewertung

Hoch — direktes Ändern der Disconnect-Safety ohne abgestimmte P4-Fallback-Logik kann unbeabsichtigt länger „ON“ erlauben.

---

## Bug-2: 0 Offline-Rules trotz aktiver Logic Rule

### Logic Rule JSON

Ohne DB-Zugriff hier nicht ausgefüllt. Zur Diagnose: SQL aus dem Auftrag (`cross_esp_logic`).

### Condition-Typ

**`config_builder.py`** `_extract_offline_rule()` verlangt:

- `trigger_conditions` mit Eintrag `type == "hysteresis"` und **`cond.get("esp_id") == esp_id`** (Ziel-ESP, z. B. `ESP_EA5484`).
- gültiges Schwellen-Paar: Heating (`activate_below` + `deactivate_above`) oder Cooling (`activate_above` + `deactivate_below`).
- `gpio` ≥ 0 auf der Condition.
- Aktion `actuator_command` / `actuator` mit gleicher `esp_id` und gültigem `gpio`.

### GUARD (Server) — Abweichung vom Auftragstext

Der Auftrag nennt `sensor_type.split("_")[0]` gegen eine Whitelist. **Im Code:** `sensor_value_type = normalize_sensor_type(hysteresis_cond.get("sensor_type") or "")` und Ausschluss über **`CALIBRATION_REQUIRED_SENSOR_TYPES = {"ph", "ec", "moisture"}`** (`config_builder.py` ca. 99, 469). Kein `split("_")[0]`-Whitelist-Muster für „erlaubte“ Typen — SHT31 wird nicht über dieses Set blockiert, sofern `normalize_sensor_type` z. B. `sht31_temp` / `sht31_humidity` kanonisch lässt.

### Wahrscheinliche Ursachen für 0 Rules

1. **Condition nicht `type: "hysteresis"`** oder **`esp_id` in der Condition ≠ `device_id` des ESP** im Config-Push.
2. **Feldnamen:** `sensor_type` fehlt oder heißt anders in gespeicherter JSON-Struktur.
3. **Aktion:** kein lokaler `actuator_command` / `actuator` mit passender `esp_id`.
4. **`logic_repo.get_enabled_rules()`** liefert die Rule nicht (nicht „enabled“ im Repo-Sinne).

### Fix-Vorschlag

- DB/JSON prüfen: eine Rule mit exakt `hysteresis` + passender `esp_id` + lokaler Aktion erzeugen oder migrieren.
- Optional: Logging erweitern (Debug): „rule X skipped: reason“ — ohne Schema-Änderung nur zusätzliche `logger.debug` in `_extract_offline_rule` bei `return None` (Plan erlaubt keine Schema-Änderung; Logging ist unkritisch).

---

## Bug-3: P1/P4 Koordination

### P1 Code-Pfad

- **`main.cpp`** `checkServerAckTimeout()`: `SERVER_ACK_TIMEOUT_MS`, `g_last_server_ack_ms`, bei Timeout `setAllActuatorsToSafeState()` und **`offlineModeManager.onDisconnect()`** (siehe oben).

### P4 Code-Pfad

- **`offline_mode_manager.cpp`:** `onDisconnect()`, `checkDelayTimer()` → `activateOfflineMode()`, `evaluateOfflineRules()`.

### Interaktion

- Bei reinem Server-Ausfall: MQTT kann verbunden bleiben → **P1** feuert nach 120s; **P4** wird über `checkServerAckTimeout()` künstlich in `onDisconnect()` geschoben — vermischt „kein ACK“ mit „offline hysterese“.
- Bei Broker down: **M2** schaltet sofort zu (Bug-1); P4 erreicht oft nicht `OFFLINE_ACTIVE`.
- Szenario „P1 vor P4“ bei langem Broker down + altem ACK: plausibel, wenn `checkServerAckTimeout` weiterläuft während MQTT disconnected — P1 kann weiter zählen (solange `isConnected()` false? — **Prüfung:** In `checkServerAckTimeout` steht `if (mqttClient.isConnected() && ...)`. Wenn MQTT nicht verbunden, läuft P1-Timeout **nicht**. Der kritische Tabellenfall im Auftrag „Broker down seit >90s“ muss mit aktuellem Code gegengelesen werden: ohne Verbindung kein P1 aus dieser Funktion.)

**Korrektur:** Der Plan sagt „P1 schaltet vor P4“ bei Broker down — wenn `isConnected()` false ist, feuert diese P1-Stelle nicht. P1 kann andere Pfade haben; für den gezeigten Code blockiert `mqttClient.isConnected()` den ACK-Timeout.

### Fix-Vorschlag

- P1 und P4 logisch trennen: `onDisconnect()` nicht aus `checkServerAckTimeout` aufrufen; stattdessen separaten „server lost“-Zustand oder nur P4 steuern, wenn Broker noch verbunden.
- Wenn P4 `OFFLINE_ACTIVE`: P1-ACK-Timeout für Aktoren-Default-State unterdrücken (gemeinsame Policy-Variable).

---

## Bug-4: Emergency Broadcast JSON Parse Error

### Analyse

- **`main.cpp`** (ca. 335–374): Topic `kaiser/broadcast/emergency` — `deserializeJson` auf **gesamten Payload**; bei Fehler: `Failed to parse broadcast emergency JSON`.
- Ursachen: **leere Payload**, **non-JSON** (z. B. LWT/retained „offline“), **reiner String** ohne `{}`.

### Fix-Vorschlag

- Broker: `mosquitto_sub -v -t 'kaiser/broadcast/emergency'` — retained Message löschen/leeren.
- Firmware: Bei leerem Payload oder bekanntem Non-JSON kein ERROR loggen (nur DEBUG), oder gültiges JSON vom Server/LWT erzwingen.

---

## Bug-5: SHT31 I2C Sibling / Active Sensors: 1

### Analyse

- **`sensor_manager.cpp`** `findSensorConfig(gpio, onewire, i2c_address)`: liefert den **ersten** Treffer mit gleichem GPIO und I2C-Adresse.
- **`configureSensor`:** Wenn `existing` gesetzt ist (Zeile 313), wird **Update** gemacht — „Sensor type changed“ — statt zweiten Multi-Value-Eintrag.
- Der Block für Multi-Value-SHT31 (ca. 252–310) läuft nur wenn **`!existing && is_i2c_sensor`**. Wenn der erste Sensor bereits `existing` belegt, wird der zweite Eintrag fälschlich als Update behandelt.

### Fix-Vorschlag

- Vor `if (existing)` (313): wenn I2C-Multi-Value und gleiche Adresse aber anderer `sensor_type`, **nicht** den einfachen Update-Pfad nutzen — stattdessen Multi-Value-Zweig erzwingen oder Lookup um `sensor_type` erweitern.

---

## Bug-6: Boot-Crash `xQueueSemaphoreTake` NULL

### Analyse

- Nur zur Einordnung im Bericht; **kein Code-Pfad in dieser Session verifiziert.**
- Auftrag: Queues/Mutexe vor Phase-4-Nutzung oder NULL-Checks — Abgleich mit `main.cpp` Boot-Sequenz und `config_update_queue` / Sensor-Init.

### Fix-Vorschlag

- Stack-Trace mit `addr2line` zuordnen; prüfen, ob `processConfigUpdateQueue()` oder Sensor-Pfad vor Queue-Erstellung läuft.

---

## Empfohlene Fix-Reihenfolge

1. **Bug-1 (KRITISCH)** — sonst bleibt P4 wirkungslos bei Broker-Disconnect.
2. **Bug-2 (HOCH)** — sonst keine Offline-Rules im NVS.
3. **Bug-3 (MITTEL)** — nach Klarstellung P1/P4 und `isConnected()`-Semantik.
4. **Bug-4/5/6 (NIEDRIG)** — nach den kritischen Fixes.

---

## Referenz: zentrale Dateien

| Thema | Datei |
|--------|--------|
| SAFETY-M2 | `El Trabajante/src/tasks/safety_task.cpp` |
| MQTT Disconnect + Notify | `El Trabajante/src/services/communication/mqtt_client.cpp` |
| P4 State | `El Trabajante/src/services/safety/offline_mode_manager.cpp` |
| P1 ACK | `El Trabajante/src/main.cpp` (`checkServerAckTimeout`) |
| Offline-Rules Build | `El Servador/god_kaiser_server/src/services/config_builder.py` |
| Broadcast Emergency | `El Trabajante/src/main.cpp` (Route nach `buildBroadcastEmergencyTopic`) |
| Sensor Multi-Value | `El Trabajante/src/services/sensor/sensor_manager.cpp` |
