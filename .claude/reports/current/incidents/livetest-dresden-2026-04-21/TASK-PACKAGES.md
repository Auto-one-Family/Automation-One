# TASK-PACKAGES — Live-Hartetest Dresden 2026-04-21

> **Stand:** Lauf-2 (vor verify-plan-Gate)  
> **verify-plan-Gate:** AUSSTEHEND  
> **Branch:** auto-debugger/work  

---

## Übersicht

| PKG | Titel | Schicht | Prio | Rolle |
|-----|-------|---------|------|-------|
| PKG-01 | QoS-Fix Actuator/Safety-Topics | ESP32-Firmware | HOCH | esp32-dev |
| PKG-02 | LWT-Handler Server-Side aktivieren | Server | HOCH | server-dev |
| PKG-03 | intent_outcome flow-Feld fix | ESP32-Firmware | MITTEL | esp32-dev |
| PKG-04 | Retained-Message-Cleanup ESP_00000001 | MQTT/Ops | NIEDRIG | mqtt-dev |
| PKG-05 | Heartbeat-Intervall klären (30s vs 60s) | ESP32-Firmware | INFO | esp32-dev |
| PKG-06 | Git-Lint-Commits (unstaged) | Server | INFO | server-dev |

---

## PKG-01: QoS-Fix Actuator/Safety-Topics

**Symptom:** ESP_EA5484 subscribed `actuator/+/command`, `config`, `broadcast/emergency`, `system/command`, `sensor/+/command` mit QoS 1 — obwohl Server mit QoS 2 (Exactly-Once) published. Broker liefert auf min(pub, sub) = QoS 1.

**Hypothese:** In `main.cpp` werden alle Subscribe-Calls mit hardcoded `1` als QoS-Argument aufgerufen.

**Evidenz:** Broker-Log 2026-04-20T18:05:55Z:
```
ESP_EA5484 1 kaiser/god/esp/ESP_EA5484/actuator/+/command
ESP_EA5484 1 kaiser/god/esp/ESP_EA5484/config
ESP_EA5484 1 kaiser/god/esp/ESP_EA5484/broadcast/emergency
```
(Die "1" = Subscribe-QoS. SOLL = 2 laut `reference/api/MQTT_TOPICS.md`)

**Betroffene Dateien (verify-plan bestätigt):**
- `El Trabajante/src/main.cpp` — **exakte Zeilen 620–636** (alle Safety-Subscribe-Calls)
  - L620: `queueSubscribe(TopicBuilder::buildConfigTopic(), 1, true)` → `2`
  - L621: `queueSubscribe(TopicBuilder::buildSystemCommandTopic(), 1, true)` → `2`
  - L622: `queueSubscribe(TopicBuilder::buildBroadcastEmergencyTopic(), 1, true)` → `2`
  - L626: `queueSubscribe(actuator_wildcard, 1, true)` → `2`
  - L636: `queueSubscribe(sensor_wildcard, 1, false)` → `2`

**Hinweis (verify-plan):** Fix ist in `main.cpp`, NICHT in `mqtt_client.cpp`. QoS-2-Queue-Druck nach Flash beobachten (PUBREC/PUBREL/PUBCOMP erhöhen RAM-Last).

**Fix:** 5× `1` → `2` in den Subscribe-Calls oben.

**Akzeptanzkriterien:**
- [ ] `cd "El Trabajante" && pio run -e seeed` Exit-Code 0
- [ ] Nach ESP-Neuverbindung: Broker-Log zeigt Subscribe-QoS=2 für alle Safety-Topics (erfordert Hardware-Flash)
- [ ] Kein Commit auf master — nur auto-debugger/work

**Abhängigkeiten:** PKG-06 zuerst committen (sauberer Build-Stand)

---

## PKG-02: LWT-Handler Validierung via HT-C1 (kein Code-Fix)

**~~Symptom (revidiert durch verify-plan)~~:** LWT-Handler IST vollständig implementiert und registriert.

**verify-plan Befund (KORREKTUR):**
- `El Servador/god_kaiser_server/src/main.py:297`:
  ```python
  _subscriber_instance.register_handler("kaiser/+/esp/+/system/will", lwt_handler.handle_lwt)
  ```
- `lwt_handler.py` (397 Zeilen): Instant-Offline-Detection, Actuator-Reset, WS-Broadcast, Flapping-Schutz
- Die 60s-Latenz in Lauf-1 war ein **Poller-False-Positive** auf einem echten Non-Disconnect-Event
- Kein echter LWT wurde ausgelöst (ESP hat sich nie unerwartet getrennt)
- **Kein Code-Fix erforderlich.**

**Aktion (Hartetest HT-C1 durch Robin):**
1. `docker compose stop mqtt-broker` — Broker 30s offline
2. Beobachten: Wann erscheint `lwt_handler:` im god_kaiser-Log?
3. Prüfen: Actuator-State-Reset innerhalb <5s nach LWT-Eingang?
4. `docker compose start mqtt-broker` — Reconnect-Verhalten dokumentieren

**Erwartetes Ergebnis (GRUEN):**
- Broker-Stop → LWT sofort ausgelöst → Server markiert ESP offline < 2s → WS-Event `esp_health` mit `source=lwt`
- Reconnect → Handover-Epoch → state_adoption → ESP online

**Dokumentiert in:** `FEHLER-REGISTER.md` Phase P1/P2

**Abhängigkeiten:** Keine Code-Abhängigkeit; manueller Test durch Robin  
**Sicherheitshinweis:** HT-C1 vor Heizungs-Live-Test (P3) pflicht.

---

## PKG-03: intent_outcome flow-Feld — Caller-Analyse (verify-plan Korrektur)

**Symptom:** ESP_EA5484 sendet `intent_outcome`-Payload ohne Pflichtfeld `flow`. Server rejiziert permanent (no retry) bei seq=489, 07:41:03Z.

**verify-plan Befund (SCOPE-KORREKTUR):**
- `intent_contract.cpp:333`: `doc["flow"] = flow != nullptr ? flow : "unknown"` — Feld IMMER gesetzt
- `buildOutcomePayload()` kann kein leeres flow-Feld produzieren
- **Wahrscheinliche Ursache:** (a) Caller von `publishIntentOutcome()` übergibt `""` oder `nullptr` → Fallback `"unknown"` im JSON, (b) Server-Validation lehnt `"unknown"` als ungültigen Flow-Wert ab

**Betroffene Dateien (verify-plan bestätigt):**
- `El Trabajante/src/tasks/intent_contract.cpp` — `publishIntentOutcome()` Caller-Liste prüfen
- `El Servador/god_kaiser_server/src/mqtt/handlers/intent_outcome_handler.py` — Validation prüfen: ist `"unknown"` valide?

**Fix (nach Analyse):**
- Alle Caller von `publishIntentOutcome()` auf leere/null `flow`-Argumente prüfen
- Server: prüfen ob `"unknown"` als flow-Wert explicitly rejected wird — ggf. Validation anpassen

**Akzeptanzkriterien:**
- [ ] `cd "El Trabajante" && pio run -e seeed` Exit-Code 0
- [ ] `cd "El Servador/god_kaiser_server" && pytest --tb=short -q` Exit-Code 0
- [ ] Kein `intent_outcome rejected` mehr im Server-Log bei normalem Betrieb
- [ ] Kein Commit auf master — nur auto-debugger/work

**Abhängigkeiten:** Keine (unabhängig von PKG-01)

---

## PKG-04: Retained-Message-Cleanup ESP_00000001

**Symptom:** 4 Topics von ESP_00000001 sind retained mit veralteten Payloads, obwohl sie laut Spezifikation nicht retained sein sollten.

**Hypothese:** Entweder ESP_00000001-Firmware oder Server publiziert diese Topics mit `retain=true`. Möglicherweise Debug-/Entwicklungsartefakt.

**Evidenz:** MOSQUITTO-LOG-LAUF1.log:
```
kaiser/god/esp/ESP_00000001/zone/ack (retained — SOLL: retain=false)
kaiser/god/esp/ESP_00000001/subzone/ack (retained — SOLL: retain=false)
kaiser/god/esp/ESP_00000001/onewire/scan_result (nicht in MQTT_TOPICS.md)
kaiser/god/esp/ESP_00000001/system/command/response (nicht in MQTT_TOPICS.md)
```

**Fix:**
- Ursache identifizieren (Server oder Firmware publiziert mit retain=true?)
- Retained-Cleanup: `mosquitto_pub -r -n -t <topic>` für alle 4 Topics (mit User-Bestätigung)
- Undokumentierte Topics (`onewire/scan_result`, `system/command/response`) in MQTT_TOPICS.md dokumentieren oder entfernen

**Akzeptanzkriterien:**
- [ ] Keine unerwarteten retained Messages für ESP_00000001 nach Cleanup
- [ ] Ursache des retain=true dokumentiert
- [ ] Kein Commit auf master — nur auto-debugger/work

**Abhängigkeiten:** User-Bestätigung für Cleanup erforderlich

---

## PKG-05: Heartbeat-Intervall-Klärung (30s vs. 60s)

**Symptom:** AUT-108 Issue nennt SOLL-Heartbeat=30s. Firmware-Konstante `HEARTBEAT_INTERVAL_MS=60000` (60s). Gemessenes Intervall: exakt 60s.

**Hypothese:** Issue-Beschreibung ist veraltet oder Heartbeat und Sensor-Publish-Intervall wurden verwechselt.

**Evidenz:** ESP32-SERIAL-LAUF1.log: Heartbeat-ACK-Intervall gemessen 60s.

**Aktion:** Klärungsfrage an Robin (kein Code-Fix ohne Bestätigung):
- Ist SOLL=30s korrekt → Firmware-Anpassung (`HEARTBEAT_INTERVAL_MS=30000`)?
- Oder ist Issue-Beschreibung ein Typo (SOLL=60s)?

**Akzeptanzkriterien:** Schriftliche Klärung im Issue-Kommentar.

---

## PKG-06: Git-Lint-Commits (unstaged logic.py + sensor_diff_evaluator.py)

**Symptom:** 2 unstaged Lint-Only-Änderungen auf auto-debugger/work.

**Fix:** Commit mit `style(server): remove unused variables (ruff lint)` auf auto-debugger/work.

**Akzeptanzkriterien:**
- [ ] `ruff check .` — keine Errors
- [ ] `git status` — clean working tree
- [ ] Kein Commit auf master

**Abhängigkeiten:** Keine (kann sofort committed werden)

---

## Ausstehende Hartetest-Schritte (kein Code-Fix, manuelle Durchführung)

| Schritt | Fokus | Aktion |
|---------|-------|--------|
| HT-B1 | B — Aktor-Latenz | Actuator-Command manuell auslösen, E2E-Zeit messen |
| HT-C1 | C — LWT | mosquitto 30s stoppen → Server-Reaktion beobachten |
| HT-D1 | D — Logic-Engine | Bodenfeuchte-Regel Dry-Run konfigurieren und triggern |
| HT-F1 | Frontend | HAR-Aufnahme 10min L2 OrbitalView |

---

## verify-plan-Gate Status

**STATUS: ABGESCHLOSSEN (2026-04-21)**

| PKG | Ergebnis | Delta |
|-----|---------|-------|
| PKG-01 | GRUEN (Korrektur) | Fix-Datei: main.cpp:620–636, nicht mqtt_client.cpp |
| PKG-02 | VERWORFEN | LWT-Handler vollständig implementiert (main.py:297); kein Code-Fix |
| PKG-03 | GRUEN (Scope-Korrektur) | Caller-Analyse statt buildOutcomePayload-Fix |
| PKG-04 | GRUEN | Bestätigt — User-Bestätigung für Cleanup nötig |
| PKG-05 | GRUEN | Bestätigt — Robin-Klärung nötig |
| PKG-06 | GRUEN | Bestätigt — Vor PKG-01 committen |

Vollständiger Gate-Report: `VERIFY-PLAN-REPORT.md`
