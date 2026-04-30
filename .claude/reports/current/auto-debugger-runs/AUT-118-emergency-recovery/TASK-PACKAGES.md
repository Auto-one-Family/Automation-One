# TASK-PACKAGES — AUT-118 Emergency-Recovery ACK-Flow

**Linear-Issue:** [AUT-118](https://linear.app/autoone/issue/AUT-118) — fail_safe_on_disconnect + Manual-Recovery implementieren  
**Parent:** AUT-66 (EA-13 MQTT-Disconnect Aktor-Latch)  
**Stand:** 2026-04-28, nach meta-analyst Cross-Layer-Analyse  
**Git:** Umsetzung nur auf Branch `auto-debugger/work`; kein Commit auf `master`

---

## Root-Cause-Befund (meta-analyst 2026-04-28)

`emergency_241361669_8354 → failed beim Reconnect`: Der `bumpSafetyEpoch()`-Aufruf in `safety_task.cpp:74` invalidiert alle queued Actuator-Commands beim Emergency-Stop. Intent-Outcomes für gequeuete Emergency-Actions werden dadurch als `SAFETY_QUEUE_FLUSHED` / `failed` gemeldet. Es gibt keinen bidirektionalen ACK-Flow — der Server sendet `emergency_stop` fire-and-forget (QoS 1 = Broker-Delivery, kein Application-ACK). Das ESP publiziert zwar `intent_outcome("applied", "EMERGENCY_STOP_TRIGGERED")`, aber kein dediziertes ACK-Topic das der Server als bestätigtes Execution-Event auswerten kann.

---

## Reihenfolge (sequentiell, wegen Contract-Abhängigkeit)

```
PKG-A (mqtt-dev) → PKG-B (server-dev) ∥ PKG-C (esp32-dev) → PKG-D (Verifikation)
```

---

## PKG-A — MQTT: Topic-Contract für Emergency-ACK und Recovery-Confirm

| Feld | Inhalt |
|------|--------|
| **Owner** | `mqtt-dev` |
| **Priorität** | P0 — blockiert PKG-B und PKG-C |
| **Risiko** | Niedrig (additive Topics, kein Breaking-Change) |

### Scope

**Server** (`El Servador/god_kaiser_server/src/mqtt/`):
- `topics.py` — hinzufügen: `build_emergency_ack_topic(esp_id: str, kaiser_id: str = "god")`, `parse_emergency_ack_topic(topic: str)`, `build_recovery_confirm_topic(esp_id: str, kaiser_id: str = "god")`, `parse_recovery_confirm_topic(topic: str)` — Vorlage: `build_actuator_emergency_topic(esp_id: str, kaiser_id: str = "god")` in `topics.py:990`
- `core/constants.py` — hinzufügen: `MQTT_SUBSCRIBE_ESP_EMERGENCY_ACK = "kaiser/{kaiser_id}/esp/+/actuator/emergency/ack"`, `MQTT_SUBSCRIBE_ESP_RECOVERY_CONFIRM = "kaiser/{kaiser_id}/esp/+/actuator/recovery_confirm"` — Pattern wie `MQTT_SUBSCRIBE_ESP_ZONE_ACK` (Zeile 44); Registrierung via `constants.get_topic_with_kaiser_id(constants.MQTT_SUBSCRIBE_ESP_EMERGENCY_ACK)` in `main.py`

**Firmware** (`El Trabajante/src/utils/`):
- `topic_builder.cpp/.h` — hinzufügen: `buildEmergencyAckTopic(char* buf, size_t len)`, `buildRecoveryConfirmTopic(char* buf, size_t len)` — Pattern: `buildActuatorAlertTopic()` Zeile 111

**Dokumentation**:
- `.claude/reference/api/MQTT_TOPICS.md` — Sections 2.6 und 2.7 mit Payload-Schema und QoS

### Payload-Schemas

**`actuator/emergency/ack`** (ESP→Server, QoS 1):
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "correlation_id": "emg_abc123",
  "command": "emergency_stop",
  "gpio_count": 3,
  "outcome": "executed",
  "seq": 42
}
```

**`actuator/recovery_confirm`** (ESP→Server, QoS 1):
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "correlation_id": "emg_abc123",
  "command": "clear_emergency",
  "state": "cleared",
  "seq": 43
}
```

### Akzeptanzkriterien
- [ ] `build_emergency_ack_topic(esp_id, kaiser_id="god")` → `kaiser/god/esp/{esp_id}/actuator/emergency/ack`
- [ ] `parse_emergency_ack_topic(topic)` extrahiert `esp_id` korrekt
- [ ] ESP `buildEmergencyAckTopic()` liefert identisches Muster
- [ ] `pytest tests/mqtt/` grün — neue Topic-Pattern-Tests enthalten
- [ ] `MQTT_TOPICS.md` enthält Sections 2.6 und 2.7

### Abhängigkeiten
- Blockiert PKG-B und PKG-C vollständig
- Keine Abhängigkeit von anderen Paketen

---

## PKG-B — Server: Emergency-ACK-Handler + Reconnect-Reconciliation

| Feld | Inhalt |
|------|--------|
| **Owner** | `server-dev` |
| **Priorität** | P1 — nach PKG-A |
| **Risiko** | Mittel (neuer DB-Schreib-Pfad + Reconnect-Logik) |

### Scope

**Neue Handler-Dateien**:
- `El Servador/god_kaiser_server/src/mqtt/handlers/emergency_ack_handler.py` — Neuer Handler, erbt von `BaseMQTTHandler` (Pattern: `actuator_alert_handler.py`). Konsumiert `actuator/emergency/ack`, extrahiert `correlation_id`, schreibt ACK-Timestamp in `actuator_history.command_metadata`, WS-Broadcast `actuator_alert` mit `alert_type: "emergency_ack"`
- `El Servador/god_kaiser_server/src/mqtt/handlers/recovery_confirm_handler.py` — Analog für `actuator/recovery_confirm`, setzt `emergency_state` auf `normal` in DB, WS-Broadcast mit `alert_type: "recovery_confirmed"`

**Bestehende Dateien (erweitern)**:
- `El Servador/god_kaiser_server/src/main.py` — Handler-Registrierung nach Zeile ~334, Pattern wie Zeilen 270–272
- `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` — In `_complete_adoption_and_trigger_reconnect_eval()` (ab Zeile 1825): Emergency-State-Reconciliation. Bei erstem Heartbeat nach Reconnect: wenn ESP-Device in DB `emergency_active` und kein `recovery_confirm` im Session-Fenster → `recovery_confirm_pending: True` in Device-Metadata setzen

**Schema**:
- `El Servador/god_kaiser_server/src/schemas/` — `fail_safe_on_disconnect: bool = False` in Actuator-Config-Schema (koordiniert mit AUT-120)

### Akzeptanzkriterien
- [ ] `pytest tests/integration/test_failure_recovery.py` grün
- [ ] `pytest tests/mqtt/test_emergency_ack_handler.py` grün (neue Testdatei)
- [ ] `ruff check .` keine Errors
- [ ] Handler in `main.py` registriert und im Startup-Log sichtbar (`Registered handler: EmergencyAckHandler`)
- [ ] WS-Broadcast `actuator_alert` bei eingehendem ACK

### Abhängigkeiten
- **Blocked by PKG-A** (Topic-Constants müssen vorhanden sein)
- Kann parallel zu PKG-C nach PKG-A laufen
- AUT-120-Schema-Änderung parallel koordinieren

---

## PKG-C — ESP32: ACK-Publish + Recovery-Confirm + fail_safe_on_disconnect

| Feld | Inhalt |
|------|--------|
| **Owner** | `esp32-dev` |
| **Priorität** | P1 — nach PKG-A, parallel zu PKG-B |
| **Risiko** | Mittel (Emergency-Pfad, Safety-Epoch-Race) |

### Scope

**`El Trabajante/src/main.cpp`**:
- Zeile ~992 (nach `EMERGENCY_STOP_TRIGGERED`-Outcome): Publish auf `buildEmergencyAckTopic()` mit `{esp_id, correlation_id, command: "emergency_stop", gpio_count: actuatorManager.count(), outcome: "executed", ts, seq}`. `correlation_id` aus empfangenem Payload extrahieren (Feld `correlation_id`, Fallback `""`).
- Zeile ~998–1022 (nach erfolgreichem `clear_emergency`): Publish auf `buildRecoveryConfirmTopic()` mit `{esp_id, correlation_id, command: "clear_emergency", state: "cleared", ts, seq}`.

**`El Trabajante/src/tasks/intent_contract.cpp:598–612`** (`isRecoveryIntentAllowed()`):
- Emergency-ACK-Publish darf Safety-Epoch-Invalidation **nicht** unterliegen. Lösung: ACK direkt via `mqttClient.publish()` (ohne Queue/safePublish), da ACK reine Observability ist und die Safety-Ausführung bereits passiert hat. Alternativ: `isRecoveryIntentAllowed()` erweitern um `emergency/ack`-Topic.

**`El Trabajante/src/utils/topic_builder.cpp/.h`**:
- Neue Funktionen nach PKG-A-Spezifikation: `buildEmergencyAckTopic()`, `buildRecoveryConfirmTopic()`

**`El Trabajante/src/` (NVS-Key für fail_safe_on_disconnect)**:
- `nvs_keys.h` (oder analog) — NVS-Key `fail_safe_on_disconnect` definieren
- `El Trabajante/src/services/safety/offline_mode_manager.h/.cpp` — `fail_safe_on_disconnect_`-Member einlesen via `storageManager`. In `onDisconnect()` auswerten: wenn `fail_safe_on_disconnect_ == true` → `setAllActuatorsToSafeState()` auch für covered actuators

**`El Trabajante/src/tasks/command_admission.cpp`** (Risiko R5):
- Prüfen ob `resume_operation` in `ALLOWED_SYSTEM_COMMANDS` fehlt → ggf. ergänzen (SSOT dokumentiert es als validen Command)

### Akzeptanzkriterien
- [ ] `pio run -e seeed` Exit-Code 0, keine neuen Errors (oder `pio run -e esp32_dev` falls Ziel EA5484)
- [ ] Nach `emergency_stop`-Command: `actuator/emergency/ack` wird gepublished (MQTT-Monitor-Test)
- [ ] Nach `clear_emergency`-Command: `actuator/recovery_confirm` wird gepublished
- [ ] `isRecoveryIntentAllowed()` oder direkter Publish verhindert Epoch-Invalidation
- [ ] `fail_safe_on_disconnect: true` in Config → nach Disconnect sofort Safe-State auch für covered actuators
- [ ] `fail_safe_on_disconnect: false` in Config → P4-Offline-Regelverhalten unverändert (Regression-Check)

### Abhängigkeiten
- **Blocked by PKG-A** (TopicBuilder-Funktionen)
- Kann parallel zu PKG-B nach PKG-A laufen
- NVS-Key-Name mit `server-dev` (AUT-120) abstimmen

---

## PKG-D — Verifikation + Regression

| Feld | Inhalt |
|------|--------|
| **Owner** | `test-log-analyst` + Build-Check |
| **Priorität** | P2 — nach PKG-B und PKG-C |
| **Risiko** | Niedrig (read-only Analyse) |

### Scope
- Server: `cd "El Servador/god_kaiser_server" && pytest --tb=short -q` — alle Tests grün
- Server Lint: `ruff check .` — keine Errors
- ESP32: `cd "El Trabajante" && pio run -e seeed` (oder `esp32_dev` für EA5484) — Exit 0
- Regressionscheck P4-Offline-Pfad: `fail_safe_on_disconnect: false` → P4 weiterhin aktiv

### Akzeptanzkriterien
- [ ] Server-Tests grün (kein neuer Failure)
- [ ] ESP32-Build grün
- [ ] `SAFETY_QUEUE_FLUSHED`-Outcomes für Emergency-Actions werden im Server als bekannte ACK-Gap identifiziert statt als unbekannter Fehler

---

## Offene Risiken (vor Implementierung abklären)

| ID | Risiko | Schwere | Mitigierung |
|----|--------|---------|-------------|
| R1 | Safety-Epoch-Race: ACK-Publish nach `bumpSafetyEpoch()` verworfen | P0 | Direkter `publish()` ohne Queue für ACK-Topics |
| R2 | Correlation-ID-Drift: Emergency-ACK-Format weicht von Server-Generierung ab | P1 | `build_emergency_actuator_correlation_id()` in `request_context.py:63–66` als Referenz |
| R3 | Broadcast-Emergency hat kein ACK-Tracking (N Geräte, eine correlation_id) | P1 | Scope auf Device-spezifischen Emergency-Stop begrenzen — kein Broadcast-ACK in diesem Ticket |
| R4 | Test-Fixtures für neue ACK-Topics in `test_api_actuators.py` fehlen | P2 | Mock-Update in PKG-B-Scope einschließen |
| R5 | `resume_operation` nicht in `ALLOWED_SYSTEM_COMMANDS` (command_admission.cpp) | P2 | In PKG-C prüfen und ggf. ergänzen |
