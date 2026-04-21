# SPECIALIST-PROMPTS — Live-Hartetest Dresden 2026-04-21

> **Stand:** Nach verify-plan-Gate  
> **Branch:** auto-debugger/work  
> **Reihenfolge:** PKG-06 → PKG-01 → PKG-03 (parallel möglich: PKG-03 server-dev + PKG-04)

---

## Rolle: server-dev — PKG-06 (ZUERST)

**Auftrag:** Lint-Only-Commits für unstaged Änderungen auf `auto-debugger/work` durchführen.

**Scope:**
- `El Servador/god_kaiser_server/src/api/v1/logic.py` — ungenutzte Variable entfernt
- `El Servador/god_kaiser_server/src/services/logic/conditions/sensor_diff_evaluator.py` — ungenutzter Import entfernt

**Vorgehen:**
1. Beide Dateien lesen und Änderungen bestätigen (nur Lint-Fixes, kein funktionaler Code)
2. `cd "El Servador/god_kaiser_server" && ruff check src/` — muss sauber sein
3. Commit: `style(server): remove unused variables (ruff lint fix)` auf Branch `auto-debugger/work`
4. Kein Push, kein Commit auf master

**Akzeptanz:**
- [ ] `ruff check src/` — keine Errors
- [ ] `git status` — clean working tree für diese 2 Dateien
- [ ] Nur auf `auto-debugger/work`

---

## Rolle: esp32-dev — PKG-01 (nach PKG-06)

**Auftrag:** QoS-Fix für Safety-Topics in ESP32-Firmware.

**Kontext:** ESP_EA5484 subscribed 5 Safety-Topics (actuator, config, emergency, system/command, sensor/command) mit QoS 1, obwohl SOLL laut `reference/api/MQTT_TOPICS.md` QoS 2 (Exactly-Once) ist. Broker downgradet auf min(pub, sub) = QoS 1. Bei Verbindungsproblemen: Actuator-Commands könnten doppelt geliefert werden.

**Betroffene Datei (verify-plan bestätigt):**
- `El Trabajante/src/main.cpp` — Zeilen 620–636

**Exakte Änderungen:**
```cpp
// VORHER (alle 5 Zeilen):
mqttClient.queueSubscribe(TopicBuilder::buildConfigTopic(), 1, true);
mqttClient.queueSubscribe(TopicBuilder::buildSystemCommandTopic(), 1, true);
mqttClient.queueSubscribe(TopicBuilder::buildBroadcastEmergencyTopic(), 1, true);
mqttClient.queueSubscribe(actuator_wildcard, 1, true);
mqttClient.queueSubscribe(sensor_wildcard, 1, false);

// NACHHER:
mqttClient.queueSubscribe(TopicBuilder::buildConfigTopic(), 2, true);
mqttClient.queueSubscribe(TopicBuilder::buildSystemCommandTopic(), 2, true);
mqttClient.queueSubscribe(TopicBuilder::buildBroadcastEmergencyTopic(), 2, true);
mqttClient.queueSubscribe(actuator_wildcard, 2, true);
mqttClient.queueSubscribe(sensor_wildcard, 2, false);
```

**Vor der Änderung prüfen:**
- Lese `El Trabajante/src/main.cpp:617-640` zur Bestätigung
- Prüfe `El Trabajante/src/services/communication/mqtt_client.cpp` — queueSubscribe-Signatur (uint8_t qos) — QoS-2-Support im ESP-IDF-MQTT-Client bestätigen

**Nach der Änderung:**
- `cd "El Trabajante" && pio run -e seeed` — muss Exit-Code 0 sein
- Commit: `fix(esp32): use QoS 2 for safety-critical MQTT subscriptions` auf Branch `auto-debugger/work`

**Akzeptanz:**
- [ ] `pio run -e seeed` Exit-Code 0
- [ ] Nur 5 Stellen geändert (keine anderen Änderungen)
- [ ] Nur auf `auto-debugger/work`
- [ ] Post-Flash (manuell durch Robin): Broker-Log zeigt Subscribe-QoS=2

---

## Rolle: esp32-dev + server-dev — PKG-03 (parallel möglich)

### esp32-dev Teil: Caller-Analyse intent_outcome flow

**Auftrag:** Alle Caller von `publishIntentOutcome()` auf leere/null `flow`-Argumente analysieren.

**Kontext:** Server rejiziert intent_outcome bei seq=489 (07:41:03Z) mit "missing required field 'flow'". `buildOutcomePayload()` setzt flow IMMER (`doc["flow"] = flow != nullptr ? flow : "unknown"`). Hypothese: Entweder Caller übergibt `""` → Fallback `"unknown"`, oder `"unknown"` wird server-seitig rejected.

**Vorgehen:**
1. `El Trabajante/src/tasks/intent_contract.cpp` — alle Aufrufstellen von `publishIntentOutcome()` identifizieren
2. Prüfen ob irgendein Caller `nullptr`, `""` oder `"unknown"` als flow-Argument übergibt
3. Falls ja: Fix den betreffenden Caller

**Akzeptanz:**
- [ ] Alle Caller analysiert und dokumentiert
- [ ] `pio run -e seeed` Exit-Code 0 (falls Fix nötig)
- [ ] Nur auf `auto-debugger/work`

### server-dev Teil: intent_outcome_handler Validation

**Auftrag:** Server-seitige Validation des `flow`-Felds prüfen.

**Kontext:** Server rejiziert intent_outcome mit "missing required field 'flow'" bei seq=489. `flow` ist in der Payload aber möglicherweise als `"unknown"` — prüfen ob das ein valider Wert ist.

**Betroffene Datei:**
- `El Servador/god_kaiser_server/src/mqtt/handlers/intent_outcome_handler.py`
- `El Servador/god_kaiser_server/src/services/intent_outcome_contract.py`

**Vorgehen:**
1. Lies `intent_outcome_handler.py` — welche flow-Werte sind valide?
2. Ist `"unknown"` explizit rejected?
3. Falls ja: Entscheidung — (a) `"unknown"` als valide flow zulassen, oder (b) Firmware-Caller fixen

**Akzeptanz:**
- [ ] `cd "El Servador/god_kaiser_server" && pytest --tb=short -q` Exit-Code 0
- [ ] Entscheidung dokumentiert (erlaubt vs. Firmware-Fix)
- [ ] Nur auf `auto-debugger/work`

---

## Rolle: mqtt-dev — PKG-04 (nach User-Bestätigung durch Robin)

**Auftrag:** Retained-Message-Anomalien bei ESP_00000001 analysieren und bereinigen.

**Kontext:** 4 Topics sind retained obwohl sie nicht retained sein sollten:
- `kaiser/god/esp/ESP_00000001/zone/ack`
- `kaiser/god/esp/ESP_00000001/subzone/ack`
- `kaiser/god/esp/ESP_00000001/onewire/scan_result`
- `kaiser/god/esp/ESP_00000001/system/command/response`

**Vorgehen:**
1. Quellanalyse: Wer published diese Topics mit retain=true? (Server-Code oder Firmware?)
2. `onewire/scan_result` und `system/command/response` — in `reference/api/MQTT_TOPICS.md` prüfen ob dokumentiert
3. Cleanup (NUR nach Robin-Bestätigung): `mosquitto_pub -r -n -t <topic>` für alle 4 Topics
4. Falls undokumentierte Topics: in MQTT_TOPICS.md nachtragen oder als deprecated markieren

**Akzeptanz:**
- [ ] Ursache des retain=true dokumentiert
- [ ] Cleanup durchgeführt (nach Robin-OK)
- [ ] MQTT_TOPICS.md aktualisiert für undokumentierte Topics
- [ ] Nur auf `auto-debugger/work`

---

## Manuelle Tests durch Robin (keine Dev-Agents)

### HT-B1 — Aktor-Latenz messen
```bash
# Im Frontend: Actuator-Toggle klicken, Zeitstempel notieren
# Parallel: docker compose logs god_kaiser --tail=50 --follow
# Messen: Zeit zwischen Frontend-Click und "actuator_response" im Server-Log
```

### HT-C1 — LWT-Disconnect-Test
```bash
docker compose stop mqtt-broker
# Warten und beobachten: god_kaiser-Log, Frontend-UI
# Erwartung: "lwt_handler: ESP_EA5484 offline" innerhalb <5s nach Broker-Stop
docker compose start mqtt-broker
# Erwartung: ESP reconnect, handover_epoch, state_adoption
```

### HT-D1 — Logic-Engine Dry-Run
```
# Im Frontend/API: Bodenfeuchte-Schwellwert temporär auf aktuellen Wert setzen
# → Regel TestTimmsRegen oder neue Testregel feuert → Pumpe-Command
# Beobachten: Latenz von Regel-Trigger bis MQTT-Command
```
