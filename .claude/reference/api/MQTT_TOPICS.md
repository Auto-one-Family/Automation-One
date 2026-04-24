---
name: mqtt-reference
description: MQTT Topics Payloads publish subscribe Sensor Actuator Heartbeat
  Emergency Zone Config ESP32 Server Kommunikation QoS
allowed-tools: Read
---

# MQTT Topic Referenz

> **Version:** 2.23 | **Aktualisiert:** 2026-04-24
> **Quellen:** `El Trabajante/docs/Mqtt_Protocoll.md`, `CLAUDE_SERVER.md` Section 4
> **Verifiziert gegen:** `topic_builder.cpp`, `main.py`, `constants.py`
> **Änderungen:** **AUT-121 (2026-04-24, Implementierung):** Topic `system/heartbeat_metrics` (ESP→Server, QoS 0) koppelt erweiterte Laufzeit-Counter und Queue-Stats vom schlanken Core-`system/heartbeat` ab. Server: `HeartbeatMetricsHandler` (TTLCache-Ingest, kein DB/WS), Merge flach in den nächsten Core-`handle_heartbeat` → `esp_health`; `parse_heartbeat_topic` endverankert, damit `heartbeat_metrics` nicht als Core matcht; `subscriber.py` mappt QoS inkl. `MQTT_SUBSCRIBE_ESP_HEARTBEAT_METRICS`. Firmware: `ENABLE_METRICS_SPLIT` → `publishHeartbeatMetrics()` in `mqtt_client.cpp` am Ende von `publishHeartbeat()`. Zuvor: **PKG-01 (2026-04-20, INC-2026-04-20-offline-mode-observability-hardening):** Neuer Topic `system/queue_pressure` (ESP→Server, QoS 1) für strukturierte Publish-Queue-Backpressure-Events (ENTER/RECOVERED, Hysterese). Server-TopicBuilder in `src/mqtt/topics.py` ergänzt (`build_queue_pressure_topic`, `parse_queue_pressure_topic`). Firmware-Emitter und Server-Handler folgen in Welle 2 (PKG-01a/01b). Zuvor: **AUT-69 (2026-04-20):** `session/announce` an Server-Consumer angepasst (`handle_session_announce` registriert), Session-Feld-Alias dokumentiert (**kanonisch `handover_epoch`, Fallback `session_epoch`**) und Heartbeat-Metriken um `handover_contract_reject_startup`/`handover_contract_reject_runtime` plus Summenfeld `handover_contract_reject` erweitert. Zuvor: **AUT-54 (2026-04-17):** Bootstrap-Heartbeat nach `heartbeat/ack`-Subscription wird auf ESP32 nur noch deferred im normalen Loop gesendet (nicht mehr direkt im `MQTT_EVENT_SUBSCRIBED`-Callback). Stale `MQTT_EVENT_SUBSCRIBED` bei bereits getrennter Verbindung werden verworfen; `publishHeartbeat(force=true)` sendet nie im disconnected Zustand. Zuvor: **AUT-5 (2026-04-17):** Heartbeat-Payload um `sensor_command_queue_overflow_count` ergänzt (Overflow-Telemetrie der Sensor-Command-Queue). Zuvor: **PKG-05 (2026-04-14):** `system/heartbeat/ack` Reject-Diagnose erweitert (optionale Felder `reason_code`, `revocation_source`, `upstream_deleted`, `delete_intent`, `correlation_id` für Revocation/Upstream-Delete-Auswertung auf ESP-Seite). Intent-Outcome-Codes ergänzt: `UPSTREAM_DELETE_REVOKED`, `HEARTBEAT_REJECTED`. Zuvor: **Epic1-05:** Server `publish_actuator_command`: bei gesetztem `correlation_id` zusätzlich **`intent_id`** (gleicher Wert) im JSON; nach erfolgreichem Publish schreibt `CommandContractRepository.record_intent_publish_sent` `command_intents.orchestration_state=sent` (Support: `El Servador/god_kaiser_server/docs/support/intent_orchestration_state.md`). Zuvor: **MQTTCommandBridge** `resolve_ack` nur per `correlation_id` (Epic1-04). Zone/Subzone-ACK ohne passende UUID → `ACK dropped: no correlation match`. Zuvor: `system/intent_outcome/lifecycle`; Heartbeat-Felder getrennt; Intent-Outcome-Codes u. a. `PENDING_RING_EVICTION`, `CONFIG_LANE_BUSY`, `PUBLISH_OUTBOX_FULL`, `JSON_PARSE_ERROR`; Zone/Subzone-ACK optional `reason_code`; Intent-Metadaten optional unter `data.*` (2026-04-05). Früher: Heartbeat-ACK Contract-Härtung, `CONFIG_PENDING_AFTER_RESET`, Intent-Outcome v2.9, Canonical-First Ingest, Firmware-Strict-Config (2026-04-04).

---

## 0. Quick-Lookup

### Topic-Struktur

```
kaiser/{kaiser_id}/esp/{esp_id}/{kategorie}/{gpio}/{aktion}
```

- **kaiser_id:** `"god"` (God-Kaiser Server) - aktuell einziger Wert
- **esp_id:** ESP32 Device ID (z.B. `ESP_12AB34CD`)

### Alle Topics auf einen Blick

| Topic-Pattern | Richtung | QoS | Beschreibung |
|---------------|----------|-----|--------------|
| `kaiser/god/esp/{esp_id}/sensor/{gpio}/data` | ESP→Server | 1 | Sensor sendet Rohdaten |
| `kaiser/god/esp/{esp_id}/sensor/batch` | ESP→Server | 1 | Batch Sensor-Daten |
| `kaiser/god/esp/{esp_id}/sensor/{gpio}/command` | Server→ESP | 2 | Sensor-Befehl (on-demand) |
| `kaiser/god/esp/{esp_id}/sensor/{gpio}/response` | ESP→Server | 1 | Sensor-Command Response |
| `kaiser/god/esp/{esp_id}/actuator/{gpio}/command` | Server→ESP | 2 | Server steuert Actuator |
| `kaiser/god/esp/{esp_id}/actuator/{gpio}/status` | ESP→Server | 1 | Actuator meldet Status |
| `kaiser/god/esp/{esp_id}/actuator/{gpio}/response` | ESP→Server | 1 | Command Response |
| `kaiser/god/esp/{esp_id}/actuator/{gpio}/alert` | ESP→Server | 1 | Actuator Alert |
| `kaiser/god/esp/{esp_id}/actuator/emergency` | Server→ESP | 1 | ESP-spezifischer Emergency |
| `kaiser/god/esp/{esp_id}/session/announce` | ESP→Server | 1 | Reconnect Session-Announce (AUT-69) |
| `kaiser/god/esp/{esp_id}/system/heartbeat` | ESP→Server | 0 | Heartbeat (Core: Liveness + Registration) |
| `kaiser/god/esp/{esp_id}/system/heartbeat_metrics` | ESP→Server | 0 | Heartbeat Metrics (Extended Telemetry, AUT-121) |
| `kaiser/god/esp/{esp_id}/system/heartbeat/ack` | Server→ESP | 1 | Heartbeat ACK (SAFETY-P5: QoS 1) |
| `kaiser/god/server/status` | Server→ALL | 1 | Server LWT + Online/Offline (SAFETY-P5) |
| `kaiser/god/esp/{esp_id}/system/command` | Server→ESP | 2 | System-Befehle |
| `kaiser/god/esp/{esp_id}/system/response` | ESP→Server | 1 | System-Response |
| `kaiser/god/esp/{esp_id}/system/diagnostics` | ESP→Server | 0 | Diagnostics |
| `kaiser/god/esp/{esp_id}/system/will` | ESP→Server | 1 | LWT (Last Will) |
| `kaiser/god/esp/{esp_id}/system/error` | ESP→Server | 1 | Error Event |
| `kaiser/god/esp/{esp_id}/system/queue_pressure` | ESP→Server | 1 | Publish-Queue Backpressure Event (ENTER/RECOVERED, PKG-01) |
| `kaiser/god/esp/{esp_id}/system/intent_outcome` | ESP→Server | 1 | Intent/Outcome Events (kanonisch `buildOutcomePayload`) |
| `kaiser/god/esp/{esp_id}/system/intent_outcome/lifecycle` | ESP→Server | 1 | CONFIG_PENDING Lifecycle (`config_pending_lifecycle_v1`) |
| `kaiser/god/esp/{esp_id}/status` | ESP→Server | 1 | System-Status |
| `kaiser/god/esp/{esp_id}/safe_mode` | ESP→Server | 1 | Safe-Mode Status |
| `kaiser/god/esp/{esp_id}/config` | Server→ESP | 2 | Config Update |
| `kaiser/god/esp/{esp_id}/config_response` | ESP→Server | 2 | Config ACK |
| `kaiser/god/esp/{esp_id}/zone/assign` | Server→ESP | 1 | Zone Assignment |
| `kaiser/god/esp/{esp_id}/zone/ack` | ESP→Server | 1 | Zone Assignment ACK |
| `kaiser/god/esp/{esp_id}/subzone/assign` | Server→ESP | 1 | Subzone Assignment (Phase 9) |
| `kaiser/god/esp/{esp_id}/subzone/remove` | Server→ESP | 1 | Subzone Removal (Phase 9) |
| `kaiser/god/esp/{esp_id}/subzone/ack` | ESP→Server | 1 | Subzone ACK |
| `kaiser/god/esp/{esp_id}/subzone/status` | ESP→Server | 1 | Subzone Status (Phase 9) |
| `kaiser/god/esp/{esp_id}/subzone/safe` | Server→ESP | 1 | Subzone Safe-Mode (Phase 9) |
| `kaiser/god/esp/{esp_id}/library/*` | bidirektional | 1 | Library Download Protocol |
| `kaiser/god/esp/{esp_id}/mqtt/auth_update` | Server→ESP | 1 | MQTT Auth Transition |
| `kaiser/god/esp/{esp_id}/mqtt/auth_status` | ESP→Server | 1 | MQTT Auth Status |
| `kaiser/broadcast/emergency` | Server→ALL | 2 | Global Emergency Stop |
| `kaiser/broadcast/system_update` | Server→ALL | 1 | System-Updates |

---

## 1. Sensor Topics

### 1.1 sensor/{gpio}/data (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data`

**QoS:** 1 (at least once)
**Retain:** false
**Frequency:** Alle 30s (konfigurierbar: 2s - 5min)

**Payload:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "gpio": 4,
  "sensor_type": "DS18B20",
  "raw": 2150,
  "value": 21.5,
  "unit": "°C",
  "quality": "good",
  "subzone_id": "zone_a",
  "sensor_name": "Boden Temp",
  "library_name": "dallas_temp",
  "library_version": "1.0.0",
  "raw_mode": true,
  "onewire_address": "28FF123456789ABC",
  "meta": {
    "vref": 3300,
    "samples": 10,
    "calibration": {
      "offset": 0.5,
      "multiplier": 1.0
    }
  }
}
```

**Required Fields:**

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `ts` / `timestamp` | int | Unix Timestamp (seconds) |
| `esp_id` | string | ESP32 Device ID |
| `gpio` | int | GPIO Pin Nummer |
| `sensor_type` | string | Sensor-Typ (DS18B20, pH, etc.) |
| `raw` / `raw_value` | float | Raw ADC/Sensor-Wert |
| `raw_mode` | bool | **REQUIRED** - true = Server verarbeitet |

**Optional Fields:** `value`, `unit`, `quality`, `subzone_id`, `sensor_name`, `library_name`, `library_version`, `meta`, `onewire_address`, `i2c_address`

**Interface-spezifische Felder:**

| Feld | Typ | Bedingung | Beschreibung |
|------|-----|-----------|--------------|
| `onewire_address` | string | OneWire-Sensoren | 64-bit ROM-Code (16 Hex-Zeichen, z.B. "28FF641E8D3C0C79") |
| `i2c_address` | int | I2C-Sensoren | 7-bit I2C-Adresse (0-127, z.B. 68 für 0x44) |

**Hinweis:** `onewire_address` und `i2c_address` schließen sich gegenseitig aus — die Firmware sendet immer nur eines der beiden Felder (Guard via `capability->is_i2c`).

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildSensorDataTopic()` (Zeile 53)
- **Server:** `sensor_handler.py:handle_sensor_data()` (Zeile 77)

**Quality-Levels:**
- `excellent`: Wert perfekt, keine Abweichungen
- `good`: Wert gut, minimale Abweichungen
- `fair`: Wert akzeptabel, moderate Abweichungen
- `poor`: Wert grenzwertig, hohe Abweichungen
- `bad`: Wert außerhalb gültiger Range
- `stale`: Wert zu alt (Sensor antwortet nicht)

---

### 1.2 sensor/batch (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/batch`

**QoS:** 1
**Frequency:** Alle 60s (optional)

**Payload:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "sensors": [
    {
      "gpio": 4,
      "sensor_type": "DS18B20",
      "value": 21.5,
      "unit": "°C",
      "quality": "good"
    },
    {
      "gpio": 34,
      "sensor_type": "pH",
      "value": 7.2,
      "unit": "pH",
      "quality": "excellent"
    }
  ]
}
```

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildSensorBatchTopic()` (Zeile 61)
- **Server:** `sensor_handler.py:handle_sensor_batch()` (Zeile 285)

---

### 1.3 sensor/{gpio}/command (Server→ESP)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/command`

**QoS:** 2 (exactly once)
**Verwendung:** On-Demand Measurement (Phase 2C)

**Payload:**
```json
{
  "command": "measure",
  "request_id": "req_12345"
}
```

**Code-Referenzen:**
- **ESP32:** `main.cpp` Zeile 740 (Subscription via Wildcard)
- **Server:** `publisher.py:publish_sensor_command()` (Zeile 104)

---

### 1.4 sensor/{gpio}/response (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/response`

**QoS:** 1

**Payload:**
```json
{
  "request_id": "req_12345",
  "gpio": 4,
  "command": "measure",
  "success": true,
  "ts": 1735818000
}
```

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildSensorResponseTopic()` (Zeile 79)
- **Server:** `main.py` Zeile 254 (Handler Registration)

---

## 2. Actuator Topics

### 2.1 actuator/{gpio}/command (Server→ESP)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command`

**QoS:** 2 (exactly once)

**Payload:**
```json
{
  "command": "ON",
  "value": 1.0,
  "duration": 0,
  "timestamp": 1234567890,
  "correlation_id": "cmd_abc123",
  "intent_id": "cmd_abc123"
}
```

**Fields:**

| Feld | Typ | Required | Beschreibung |
|------|-----|----------|--------------|
| `command` | string | Ja | ON, OFF, PWM, TOGGLE |
| `value` | float | Nein | 0.0 - 1.0 für PWM |
| `duration` | int | Nein | Sekunden (0 = unbegrenzt). Bei > 0: ESP schaltet Aktor nach N Sekunden automatisch aus (Auto-Off, F1 2026-03-11) |
| `timestamp` | int | Ja | Unix Timestamp |
| `correlation_id` | string | Nein | End-to-End Tracking ID für Response-Korrelation. Normaler REST-Befehl: UUID (`ActuatorService`). **Not-Aus** (`POST /v1/actuators/emergency_stop`): pro GPIO deterministisch `{incident_correlation_id}:{esp_id}:{gpio}` (`build_emergency_actuator_correlation_id` in `core/request_context.py`). |
| `intent_id` | string | Nein | Wenn `correlation_id` gesetzt: Server setzt **`intent_id` = `correlation_id`** für Intent-Metadaten auf der ESP (`intent_contract.cpp`) und Zeile in `command_intents` (`orchestration_state=sent` nach Publish). Ohne `correlation_id` entfällt das Feld. |

**History (nur Emergency-Stop, serverseitig):** Dieselbe GPIO-`correlation_id` wird bei erfolgreichem Publish in `actuator_history.command_metadata` neben `incident_correlation_id` unter `correlation_id` und `mqtt_correlation_id` abgelegt. Details: `El Servador/god_kaiser_server/docs/emergency-stop-mqtt-correlation.md`. Die UUID `incident_correlation_id` steht zusätzlich in der REST-Antwort `POST /v1/actuators/emergency_stop` (`EmergencyStopResponse`).

**Orchestrierung:** `command_intents` / `orchestration_state` (sent vs. accepted/ack_pending): `El Servador/god_kaiser_server/docs/support/intent_orchestration_state.md`.

**Commands:**

| Command | Beschreibung | value-Bereich |
|---------|--------------|---------------|
| `ON` | Binary Actuator einschalten | - |
| `OFF` | Binary Actuator ausschalten | - |
| `PWM` | PWM-Wert setzen | 0.0 - 1.0 |
| `TOGGLE` | Zustand umschalten | - |

**duration:** Sekunden (0 = unbegrenzt). Bei > 0: ESP führt Auto-Off nach N Sekunden aus (`actuator_manager.cpp` processActuatorLoops, `command_duration_end_ms`).

**Code-Referenzen:**
- **ESP32:** `main.cpp` Zeile 731 (Subscription via Wildcard)
- **Server:** `publisher.py:publish_actuator_command()` (Zeile 64)

---

### 2.2 actuator/{gpio}/status (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status`

**QoS:** 1
**Frequency:** Bei Zustandsänderung

**Payload:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "zone_id": "greenhouse",
  "subzone_id": "zone_a",
  "gpio": 5,
  "type": "pump",
  "state": true,
  "pwm": 128,
  "runtime_ms": 3600000,
  "emergency": "normal"
}
```

**Required Fields:**

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `ts` | int | Timestamp (millis) |
| `gpio` | int | GPIO Pin |
| `type` / `actuator_type` | string | pump, pwm, valve, relay |
| `state` | bool/string | true/false oder "on"/"off" |
| `pwm` / `value` | int | PWM-Wert (0-255) |
| `runtime_ms` | int | Akkumulierte Laufzeit in ms |
| `emergency` | string | normal, active, clearing, resuming |

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildActuatorStatusTopic()` (Zeile 95)
- **Server:** `actuator_handler.py:handle_actuator_status()` (Zeile 45)

---

### 2.3 actuator/{gpio}/response (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/response`

**QoS:** 1
**Frequency:** Nach jedem Command

**Payload (Success):**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "seq": 42,
  "zone_id": "greenhouse",
  "gpio": 5,
  "command": "ON",
  "value": 1.0,
  "duration": 0,
  "success": true,
  "message": "Command executed",
  "correlation_id": "cmd_abc123"
}
```

**Payload (Failure):**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "seq": 43,
  "zone_id": "greenhouse",
  "gpio": 5,
  "command": "ON",
  "value": 1.0,
  "duration": 0,
  "success": false,
  "message": "Actuator GPIO 5 is emergency stopped",
  "correlation_id": "cmd_abc123"
}
```

**Contract-Härtung (Server-Ingest):**
- Topic ist autoritativ für `esp_id` und `gpio`; Payload-Mismatches bleiben als Vertragsverletzung sichtbar.
- `correlation_id` ist auf Firmware-Seite best effort; fehlende IDs werden serverseitig robust ergänzt (`missing-corr:act:...`).
- Unbekannte Vertragswerte werden auf `CONTRACT_UNKNOWN_CODE` normalisiert (kein stilles Umschreiben im Handler).
- Terminale Persistence-Authority erzwingt write-once/finality pro dedup-key (bevor History/Audit/WS geschrieben wird).
- Stale/Replayed Responses werden als idempotente Duplikate behandelt und ohne Seiteneffekte quittiert.

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildActuatorResponseTopic()` (Zeile 103)
- **Server:** `main.py` Zeile 239 (Handler Registration)

---

### 2.4 actuator/{gpio}/alert (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/alert`

**QoS:** 1

**Payload:**
```json
{
  "ts": 1735818000,
  "gpio": 5,
  "type": "emergency_stop",
  "message": "Actuator stopped"
}
```

**Alert-Types:**
- `emergency_stop`: Actuator wurde notgestoppt
- `config_invalid`: Ungültige Actuator-Konfiguration
- `runtime_protection`: Runtime-Schutz aktiviert (nur Pump)
- `overrun`: Max-Laufzeit überschritten
- `fault`: Hardware-Fehler
- `verification_failed`: Safety-Verification fehlgeschlagen

**Hinweis:** `gpio: 255` = System-weiter Alert

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildActuatorAlertTopic()` (Zeile 111)
- **Server:** `main.py` Zeile 244 (Handler Registration)

---

### 2.5 actuator/emergency (Server→ESP)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/emergency`

**QoS:** 1

**Payload (Feld `command` ist massgeblich):**
```json
{
  "command": "emergency_stop",
  "auth_token": "my_secret_token",
  "reason": "User request"
}
```

**Aufheben (Not-Aus freigeben):**
```json
{
  "command": "clear_emergency",
  "auth_token": "my_secret_token",
  "reason": "manual"
}
```

**command-Werte:**
- `emergency_stop`: Alle Aktoren dieses ESPs stoppen, Emergency-Flag setzen (Default bei fehlendem/ungueltigem command)
- `clear_emergency`: Emergency-Flag aufheben, Aktoren wieder steuerbar

**Authentifizierung (fail-open):**
- `auth_token` wird gegen NVS-Key `emergency_auth` validiert
- Wenn kein Token in NVS konfiguriert: jeder Emergency-Stop wird akzeptiert (Sicherheit > Authentifizierung)
- Token setzbar via `set_emergency_token` System-Command (token_type="esp")

**Optionale Felder:** `reason` (string), `gpio` (nur bei gerätespezifischen Erweiterungen)

**Code-Referenzen:**
- **ESP32:** `main.cpp` (actuator/emergency Subscription, command clear_emergency)
- **Server:** `topics.py:build_actuator_emergency_topic()`, `actuators.py` clear_emergency Endpoint
- **Mock-Simulation:** `actuator_handler.py` handle_emergency/handle_broadcast_emergency werten `command` aus

---

## 3. System Topics

### 3.1 system/heartbeat (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat`

**QoS:** 0 (Latency-optimiert)
**Frequency:** Alle 60s (forced)

**Payload:**
```json
{
  "esp_id": "ESP_12AB34CD",
  "zone_id": "greenhouse",
  "master_zone_id": "greenhouse-master",
  "zone_assigned": true,
  "ts": 1735818000,
  "boot_sequence_id": "ESP_12AB34CD-b42-r1",
  "reset_reason": "POWERON",
  "segment_start_ts": 1735817990,
  "uptime": 3600,
  "heap_free": 245760,
  "wifi_rssi": -65,
  "sensor_count": 3,
  "actuator_count": 2,
  // gpio_status[] + gpio_reserved_count ENTFERNT (AUT-68 PKG-17, 2026-04)
  // GPIO-Runtime-State: Event-Push via kaiser/.../actuator/{gpio}/status (QoS 1)
  // Pin-Assignment: via Config-API
  "persistence_degraded": false,
  "persistence_degraded_reason": "NONE",
  "runtime_state_degraded": false,
  "mqtt_circuit_breaker_open": false,
  "wifi_circuit_breaker_open": false,
  "network_degraded": false,
  "persistence_drift_count": 0,
  "critical_outcome_drop_count": 0,
  "publish_outbox_drop_count": 0,
  "sensor_command_queue_overflow_count": 0
}
```

**Degraded-Telemetrie (2026-04):** `persistence_degraded` / `persistence_degraded_reason` = Offline-Rules-Persistence-Drift; `runtime_state_degraded` = FSM (z. B. CONFIG_PENDING, SAFE_MODE); `network_degraded` = MQTT- oder WiFi-Circuit-Breaker OPEN. **`degraded` / `degraded_reason` werden von aktueller Firmware nicht mehr gesendet** (Legacy-Consumer migrieren). `critical_outcome_drop_count` spiegelt NVS-Outcome-Outbox-Verluste; `publish_outbox_drop_count` zählt ESP-IDF-Outbox-`-2`-Drops nicht-kritischer Publishes; `sensor_command_queue_overflow_count` zählt verworfene Sensor-Commands bei Queue-Overflow.

**Required Fields:** `ts`, `uptime`, `heap_free` / `free_heap`, `wifi_rssi`

**Contract-Härtung (stufenweise):**
- `boot_sequence_id`, `reset_reason`, `segment_start_ts` werden zunächst **optional** transportiert
- Nach `contract_version`-Anhebung kann serverseitig fail-closed validiert werden
- Bestehende Sender/Fixtures bleiben bis dahin kompatibel
- Ingest läuft canonical-first: Legacy-Felder (`free_heap`, `active_sensors`, `active_actuators`) werden vor Handler-Logik normalisiert
- Unbekannte Status-/State-Werte werden als Vertragsverletzung markiert (`CONTRACT_UNKNOWN_CODE`) und mit `raw_system_state` auditierbar weitergegeben

**WICHTIG:** Unbekannte Geräte werden abgelehnt. ESPs müssen via REST-API registriert werden!

**Code-Referenzen:**
- **ESP32:** `mqtt_client.cpp:publishHeartbeat()` (Zeile ~435)
- **Server:** `heartbeat_handler.py:handle_heartbeat()` (Zeile 61)

**AUT-69 Counter-Split (Server-Ingest):**
- `handover_contract_reject_startup` zählt Reject-Deltas im ersten 1s-Fenster nach Session-Connect
- `handover_contract_reject_runtime` zählt Reject-Deltas nach dem Startup-Fenster
- `handover_contract_reject` bleibt als Backward-kompatible Summe (`startup + runtime`)

---

### 3.1a session/announce (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/session/announce`

**QoS:** 1  
**Retain:** false  
**Frequency:** Bei `MQTT_EVENT_CONNECTED` (vor der normalen Publish-Sequenz)

**Payload:**
```json
{
  "handover_epoch": 3,
  "reason": "reconnect",
  "ts_ms": 1735818000000,
  "connect_seq": 7
}
```

**Feld-Mapping (AUT-69 CLARIFY B-SESS-02):**
- Kanonischer Feldname: `handover_epoch`
- Legacy-Fallback im Server: `session_epoch`

**Code-Referenzen:**
- **ESP32:** `mqtt_client.cpp:publishSessionAnnounce()`
- **Server:** `heartbeat_handler.py:handle_session_announce()`

---

### 3.1b system/heartbeat_metrics (ESP→Server) — AUT-121

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat_metrics`

**QoS:** 0 (best-effort, wie Core-Heartbeat)
**Retain:** false
**Frequency:** Wird am Ende jedes `publishHeartbeat()`-Laufs aufgerufen; tatsächlicher Publish nur bei geändertem `MetricsSnapshot` oder spätestens alle 5 Core-Zyklen (`METRICS_MAX_SKIP_COUNT` in `mqtt_client.h`).

**Core vs. Metrics — Abgrenzung:**

| Aspekt | `system/heartbeat` (Core) | `system/heartbeat_metrics` (Metrics) |
|--------|---------------------------|--------------------------------------|
| Zweck | Liveness-Signal, Registration-Gate, P1-Timer | Erweiterte Zähler/Queue-Stats (forensisch) |
| Latenz-Kritisch | Ja (ACK muss < 120s) | Nein |
| Payload-Größe | Schlanke Core-Felder (Ziel: unter `PUBLISH_PAYLOAD_MAX_LEN`) | Kompakt (`payload.reserve(512)`) |
| Handler-Blockierung | Verboten (ACK-first) | Verboten: reiner Ingest (TTLCache); kein paralleles DB/WS im Metrics-Handler |
| Auswirkung bei Verlust | P1-Timeout → Safe-State | Metriken-Lücke, kein Safety-Impact |

Die Trennung verhindert, dass wachsende Telemetrie-Felder das
latenz-kritische Core-Heartbeat-Payload aufblähen oder den
ACK-Pfad verzögern. Serverseitig werden akzeptierte Metrics in den
nächsten Core-Heartbeat gemerged (`heartbeat_handler`) und gehen
mit `esp_health` an das Frontend.

**Payload (Ist, `ENABLE_METRICS_SPLIT` — ESP-IDF-Pfad, nicht `MQTT_USE_PUBSUBCLIENT`):**
```json
{
  "esp_id": "ESP_12AB34CD",
  "ts": 1735818000,
  "metrics_schema_version": 1,
  "offline_enter_count": 0,
  "adopting_enter_count": 0,
  "adoption_noop_count": 0,
  "adoption_delta_count": 0,
  "handover_abort_count": 0,
  "handover_contract_reject_count": 0,
  "handover_contract_last_reject": "NONE",
  "persistence_drift_count": 0,
  "critical_outcome_drop_count": 0,
  "publish_outbox_drop_count": 0,
  "publish_queue_fill": 0,
  "publish_queue_hwm": 0,
  "publish_queue_shed_count": 0,
  "publish_queue_drop_count": 0,
  "sensor_command_queue_overflow_count": 0,
  "safe_publish_retry_count": 0,
  "emergency_rejected_no_token_total": 0
}
```

Die Felder `publish_queue_*` fehlen bei `MQTT_USE_PUBSUBCLIENT=1` (siehe `mqtt_client.cpp`).

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildSystemHeartbeatMetricsTopic()`, `mqtt_client.cpp:publishHeartbeatMetrics()` (nach `publishHeartbeat()`)
- **Server:** `topics.py` (Builder/Parse inkl. `parse_heartbeat_topic`), `heartbeat_metrics_handler.py:handle_heartbeat_metrics`, `heartbeat_handler.py` (Merge vor WS), `main.py` (Handler-Registrierung), `subscriber.py` (QoS-Zuordnung)

---

### 3.2 system/heartbeat/ack (Server→ESP)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat/ack`

**QoS:** 1 (at least once — SAFETY-P5: garantiert P1-Timer-Reset)
**Frequency:** Nach jedem empfangenen Heartbeat — gesendet VOR DB-Arbeit (Fix-3)

**Payload:**
```json
{
  "status": "online",
  "config_available": false,
  "server_time": 1735818000,
  "handover_epoch": 3,
  "ack_type": "heartbeat",
  "contract_version": 2,
  "session_id": "ESP_12AB34CD:handover:3:1735818000"
}
```

**Status-Werte:**
- `pending_approval`: Gerät wartet auf Admin-Genehmigung
- `approved`: Gerät genehmigt, noch nicht online
- `online`: Gerät ist online und aktiv
- `rejected`: Gerät wurde abgelehnt
- `error`: Heartbeat empfangen, aber Verarbeitungsfehler (Server lebt — P1-Timer wird trotzdem zurückgesetzt)

**Optionale Reject-Diagnosefelder (`status="rejected"`):**
- `reason_code` (string): serverseitiger Ablehnungsgrund (z. B. Delete-/Revocation-Code)
- `revocation_source` (string): Upstream-Quelle der Revocation/Deletion
- `upstream_deleted` (bool): explizites Tombstone/Delete-Flag
- `delete_intent` (bool): zeigt Delete-Intent im Upstream-Kontext
- `correlation_id` (string): korreliert ACK-Diagnose mit Intent-/Admission-Logkette

**SAFETY-P5 Hinweise:**
- ACK wird direkt nach ESP-Lookup gesendet — **vor** DB-Writes, Metadata-Update, WebSocket-Broadcast
- Bei Payload-Validierungsfehler: `_send_heartbeat_error_ack()` verhindert P1-False-Positive
- `config_available` ist im frühen ACK immer `false` — Config-Push läuft unabhängig
- `handover_epoch` ist verpflichtend (fail-closed Vertrag) und wird aus dem aktiven ESP-Handover-Kontext abgeleitet
- ESP32 Registration-Gate ist **fail-closed**: kein Gate-Open per Timeout, nur nach gültigem `heartbeat/ack`
- ESP32 Bootstrap-Heartbeat nach ACK-Subscription wird deferred im Loop verarbeitet (nicht im MQTT-Event-Callback), um Callback-Last und Reconnect-Races zu minimieren
- Stale `MQTT_EVENT_SUBSCRIBED`-Bootstrap-Trigger werden bei disconnected Zustand verworfen

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildSystemHeartbeatAckTopic()` (Zeile 136)
- **Server:** `heartbeat_handler.py:_send_heartbeat_ack()`, `_send_heartbeat_error_ack()`

---

### 3.3 system/command (Server→ESP)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/command`

**QoS:** 2 (exactly once)

**Payload:**
```json
{
  "command": "reboot",
  "params": {
    "delay": 5000
  }
}
```

**Commands:**
| Command | Beschreibung |
|---------|--------------|
| `reboot` | System-Neustart |
| `safe_mode` | Safe-Mode aktivieren |
| `exit_safe_mode` | Safe-Mode verlassen (Flags zurücksetzen) |
| `resume_operation` | Schrittweise Reaktivierung |
| `diagnostics` | Diagnostik-Report senden |
| `reset_config` | Konfiguration zurücksetzen |
| `get_config` | Aktuelle Config zurückgeben (Response auf system/command/response) |
| `set_log_level` | Runtime Log-Level ändern. Params: `{"level":"DEBUG\|INFO\|WARNING\|ERROR\|CRITICAL"}`. Persisted to NVS (survives reboot). Response includes `"persisted":true`. |

**Code-Referenzen:**
- **ESP32:** `main.cpp` Zeile 720 (Subscription), Zeile 1121 (get_config), Zeile 1208 (set_log_level)
- **Server:** `publisher.py:publish_system_command()` (Zeile 273)

---

### 3.4 system/response (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/response`

**QoS:** 1

**Payload:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "command": "reboot",
  "success": true,
  "message": "Reboot initiated"
}
```

**Parse-Fehler (Firmware 2026-04):** Bei ungültigem JSON auf `system/command` antwortet das ESP auf `system/command/response` mit `success: false`, `error`/`reason_code`: `JSON_PARSE_ERROR`, `correlation_id` (Fallback `fw_*`).

**Code-Referenzen:**
- **ESP32:** Direkt in `main.cpp` gebaut (keine TopicBuilder-Funktion)
- **Server:** `main.py` Zeile 269 (Handler Registration)

---

### 3.5 system/diagnostics (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/diagnostics`

**QoS:** 0
**Frequency:** Alle 60s + bei signifikanten Änderungen

**Payload:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "boot_sequence_id": "ESP_12AB34CD-b42-r1",
  "reset_reason": "POWERON",
  "segment_start_ts": 1735817990,
  "metrics_schema_version": 1,
  "heap_free": 150000,
  "heap_min_free": 120000,
  "heap_fragmentation": 15,
  "uptime_seconds": 3600,
  "error_count": 3,
  "wifi_connected": true,
  "wifi_rssi": -65,
  "mqtt_connected": true,
  "sensor_count": 4,
  "actuator_count": 2,
  "system_state": "OPERATIONAL",
  "boot_reason": "POWERON",
  "mqtt_cb_state": "CLOSED",
  "mqtt_cb_failures": 0,
  "wdt_mode": "PRODUCTION",
  "wdt_timeouts_24h": 0,
  "wdt_timeout_pending": false
}
```

**Required fields:** `heap_free` (int), `wifi_rssi` (int)
**Optional fields:** All others (graceful degradation via `payload.get()`)

**Contract-Härtung (stufenweise):**
- `metrics_schema_version` fehlt/`1`: Segmentfelder bleiben optional (`boot_sequence_id`, `reset_reason`, `segment_start_ts`)
- `metrics_schema_version >= 2`: Segmentfelder sind Pflicht (fail-closed Validation im Handler)
- Upgradepfad bleibt rückwärtskompatibel für bestehende Producer/Consumer bis zur Vertragsanhebung
- Canonical-first Ingest normalisiert semantische Felder (`system_state`, `mqtt_cb_state`, `wdt_mode`) vor Persistenz/Broadcast
- Unbekannte Enum-Werte bleiben sichtbar als Vertragsverletzung (`CONTRACT_UNKNOWN_CODE`) inkl. `raw_system_state`

| Field | Type | Description |
|-------|------|-------------|
| `boot_reason` | string | ESP-IDF reset reason: UNKNOWN, POWERON, EXT, SW, PANIC, INT_WDT, TASK_WDT, WDT, DEEPSLEEP, BROWNOUT, SDIO |
| `mqtt_cb_state` | string | MQTT Circuit Breaker state: CLOSED, OPEN, HALF_OPEN |
| `mqtt_cb_failures` | int | Current failure count in circuit breaker |
| `wdt_mode` | string | Watchdog mode: DISABLED, PROVISIONING, PRODUCTION, SAFE_MODE |
| `wdt_timeouts_24h` | int | Watchdog timeout events in last 24 hours |
| `wdt_timeout_pending` | bool | Whether a watchdog timeout flag is currently set |
| `boot_sequence_id` | string | Eindeutige Bootsegment-ID pro Startzyklus |
| `reset_reason` | string | Kanonischer Reset-Grund des Segments |
| `segment_start_ts` | int | Segmentstart als Unix-Zeitstempel (0 wenn Zeit noch unsynchronisiert) |
| `metrics_schema_version` | int | Vertragsversion für Telemetrie-Schema |

**Langlauf-KPI Aggregationsregel (24h robust über Reboots):**
- Primärschlüssel pro Segment: `(esp_id, boot_sequence_id)`; Fallback (Legacy): `(esp_id, segment_start_ts, reset_reason)`
- Zeitgewichtete KPIs nur innerhalb eines Segments aggregieren, danach segmentweise rollen (kein blindes `uptime`-Durchmitteln über Rebootkanten)
- Segmentwechsel (`boot_sequence_id`-Wechsel) als harte Trennkante behandeln; Delta-basierte Zähler an Segmentanfang neu initialisieren

**Alarmregeln über Segmentgrenzen:**
- `uptime`-Rücksprung bei neuem `boot_sequence_id` ist **kein** Alarmereignis
- Rate-/Trend-Alarme (z. B. Heap-Drift) müssen Segmentwechsel als Reset-Bedingung berücksichtigen
- Flapping-Schutz: Erst alarmieren, wenn Bedingung innerhalb desselben Segments über das definierte Zeitfenster stabil verletzt ist

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildSystemDiagnosticsTopic()` (Zeile 180)
- **ESP32:** `health_monitor.cpp:publishSnapshot()` (Zeile 264-267, QoS 0)
- **ESP32:** `health_monitor.cpp:getSnapshotJSON()` (Payload-Serialisierung)
- **Server:** `diagnostics_handler.py:handle_diagnostics()` (Handler)
- **Server:** `main.py` (Handler Registration: `kaiser/+/esp/+/system/diagnostics`)
- **Server:** `topics.py:parse_system_diagnostics_topic()` (Topic Parser)

---

### 3.6 system/error (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/error`

**QoS:** 1

**Payload:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "error_code": "GPIO_CONFLICT",
  "severity": 3,
  "message": "GPIO 5 already in use",
  "module": "GPIOManager",
  "function": "initializeGPIO",
  "stack_trace": "...",
  "context": {
    "gpio": 5,
    "requested_mode": "OUTPUT",
    "current_mode": "INPUT"
  }
}
```

**Severity-Levels:**
- Primär numerisch (Firmware): `0=info`, `1=warning`, `2=error`, `3=critical`
- String-Aliase werden canonicalisiert (`"critical"` → `3`, `"error"` → `2`)
- Unbekannte Severity/Category-Werte werden als Vertragsverletzung markiert (`CONTRACT_UNKNOWN_CODE`) statt still verworfen

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildSystemErrorTopic()` (Zeile 160)
- **Server:** `main.py` Zeile 293 (Handler Registration)

---

### 3.6a system/queue_pressure (ESP→Server, PKG-01)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/queue_pressure`

**QoS:** 1 (at least once)
**Retain:** false
**Frequency:** Nur bei Zustandswechsel (Hysterese: ENTER bei Queue-Fill ≥ `SHED_WATERMARK=6`, RECOVERED bei ≤ `PUBLISH_QUEUE_HYSTERESIS_LOW=3`). Keine periodische Emission.

**Zweck:** Strukturiertes Event für Publish-Queue-Backpressure, getrennt vom
generischen `system/error`-Fehlercode 4062. Ermöglicht dem Server/Frontend
eine klare Unterscheidung "Burst-Druck (erwartet)" vs. "Fehler im engeren Sinn".

**Payload (geplant, PKG-01a Welle 2):**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_EA5484",
  "event": "ENTER",
  "queue_fill": 7,
  "queue_capacity": 8,
  "shed_watermark": 6,
  "hysteresis_low": 3,
  "shed_count": 1,
  "drop_count": 0,
  "high_watermark": 9,
  "reason": "PUBLISH_OUTBOX_FULL"
}
```

Event-Werte: `"ENTER"` (Backpressure aktiv), `"RECOVERED"` (Backpressure aufgehoben).

**Status:**
- **TopicBuilder (Server):** `TopicBuilder.build_queue_pressure_topic()` +
  `TopicBuilder.parse_queue_pressure_topic()` — implementiert in PKG-01
  (Commit `7e7ae245`, `El Servador/god_kaiser_server/src/mqtt/topics.py`).
- **Firmware-Emitter:** In Welle 2 (PKG-01a) — Hot-Path nach
  `publish_queue.cpp:130/178` + `mqtt_client.cpp:processPublishQueue`.
- **Server-Handler:** In Welle 2 (PKG-01b) — Prometheus-/Persist-Route offen
  (Blocker `B-QP-PERSIST-01`).

**Code-Referenzen:**
- **Server:** `src/mqtt/topics.py:build_queue_pressure_topic`,
  `parse_queue_pressure_topic`
- **ESP32:** `TopicBuilder::buildQueuePressureTopic()` *(PKG-01a, Welle 2)*

---

### 3.7 status (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/status`

**QoS:** 1
**Frequency:** Bei Zustandsänderung + alle 5min

**Payload:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "system_state": "OPERATIONAL",
  "webserver_active": false,
  "wifi_connected": true,
  "wifi_ssid": "MyNetwork",
  "mqtt_connected": true,
  "zone_configured": true,
  "zone_id": "greenhouse",
  "master_zone_id": "main_zone",
  "sensors_configured": 3,
  "actuators_configured": 2,
  "heap_free": 245760,
  "uptime": 3600
}
```

**Code-Referenzen:**
- **ESP32:** Direkt in `main.cpp` gebaut (keine TopicBuilder-Funktion)
- **Server:** `main.py` Zeile 298 (Handler Registration)

---

### 3.8 safe_mode (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/safe_mode`

**QoS:** 1

**Payload:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "safe_mode_active": true,
  "reason": "Emergency stop triggered"
}
```

**Code-Referenzen:**
- **ESP32:** Direkt in `main.cpp` gebaut (keine TopicBuilder-Funktion)
- **Server:** `main.py` Zeile 303 (Handler Registration)

---

### 3.9 system/will (LWT)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/will`

**QoS:** 1
**Retain:** true
**Wird vom Broker gesendet bei unerwartetem Disconnect**

**Payload:**
```json
{
  "status": "offline",
  "esp_id": "ESP_12AB34CD",
  "reason": "unexpected_disconnect",
  "timestamp": 1735818000
}
```

**Reason-Canonicalisierung:**
- Bekannte Gründe: `unexpected_disconnect`, `network_failure`, `power_loss`, `broker_timeout`, `watchdog_reset`, `crash`
- Legacy-/Aliaswerte werden normalisiert (z. B. `timeout` → `broker_timeout`)
- Unbekannte Gründe bleiben sichtbar als Vertragsverletzung (`CONTRACT_UNKNOWN_CODE`) inkl. `raw_reason`
- Terminale Persistence-Authority schützt den Offline-Endzustand vor Replays (write-once/finality auf Eventebene).

**Code-Referenzen:**
- **ESP32:** `mqtt_client.cpp` in `connect()` / `connectToBroker()` — LWT wird beim Verbindungsaufbau gesetzt (ESP-IDF- und PubSubClient-Pfad)
- **Server:** `lwt_handler.py:handle_lwt()` (Zeile 35)

---

### 3.10 server/status (Server LWT — SAFETY-P5)

**Topic:** `kaiser/{kaiser_id}/server/status`

**QoS:** 1
**Retain:** true
**Richtung:** Server→ALL ESPs (kein ESP-spezifisches Topic)

**Payload (online):**
```json
{
  "status": "online",
  "timestamp": 1735818000
}
```

**Payload (offline):**
```json
{
  "status": "offline",
  "timestamp": 1735818000,
  "reason": "unexpected_disconnect"
}
```

**reason-Werte:**
- `unexpected_disconnect`: Broker publiziert LWT bei unerwartetem Server-Crash
- `graceful_shutdown`: Server publiziert explizit vor `disconnect()` bei SIGTERM/Docker-Stop

**Timing:**
- Server-Crash: Broker erkennt nach ~90s (1.5× keepalive=60) → publiziert LWT → ESP reagiert sofort
- Graceful Shutdown: Sofort (explizit gesendet vor disconnect)
- Server-Start: `"online"` in `_on_connect`-Callback → überschreibt retained `"offline"`

**ESP32-Reaktion (Vorrangregel):**
- `offline` + Offline-Rules vorhanden → P4 übernimmt (kein sofortiger Safe-State)
- `offline` + keine Offline-Rules → `setAllActuatorsToSafeState()` sofort
- `online` → nur Liveness-Hinweis (kein P1-Reset, kein Recovery-Trigger)
- Autoritative Recovery + Registration ausschließlich über `system/heartbeat/ack`

**Code-Referenzen:**
- **Server:** `constants.py:MQTT_TOPIC_SERVER_STATUS`, `topics.py:build_server_status_topic()`
- **Server LWT:** `client.py:connect()` — `will_set()` vor `connect()`, `_on_connect()` — online-Publish
- **Server Shutdown:** `main.py:lifespan()` — offline-Publish vor `disconnect()`
- **ESP32:** `topic_builder.cpp:buildServerStatusTopic()`, `main.cpp:routeIncomingMessage()` Handler

---

### 3.11 system/intent_outcome (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/intent_outcome`

**QoS:** 1  
**Frequency:** Ereignisbasiert bei Admission/Execute/Expiry  
**Semantik:** Einheitlicher Outcome-Vertrag fuer Command/Config/Publish-Fluesse

**Payload:**
```json
{
  "seq": 42,
  "flow": "command",
  "intent_id": "act_171217_1",
  "correlation_id": "corr_171217_9",
  "generation": 3,
  "created_at_ms": 1712170000,
  "ttl_ms": 10000,
  "epoch": 7,
  "outcome": "accepted",
  "contract_version": 2,
  "semantic_mode": "target",
  "legacy_status": "processing",
  "target_status": "accepted",
  "code": "COMMAND_ACCEPTED",
  "reason": "Actuator command accepted",
  "retryable": false,
  "critical": false,
  "retry_limit": 5,
  "retry_count": 0,
  "recovered": false,
  "delivery_mode": "direct",
  "ts": 1735818000
}
```

**Outcome-Werte:** `accepted`, `rejected`, `applied`, `persisted`, `failed`, `expired`  
**Code-Klassen (Auszug):** `COMMAND_ACCEPTED`, `REGISTRATION_PENDING`, `CONFIG_PENDING_BLOCKED`, `DEGRADED_MODE_BLOCKED`, `SAFETY_LOCKED`, `QUEUE_FULL`, `PUBLISH_OUTBOX_FULL`, `PAYLOAD_TOO_LARGE`, `VALIDATION_FAIL`, `EXECUTE_FAIL`, `SAFETY_EPOCH_INVALIDATED`, `TTL_EXPIRED`, `SAFETY_QUEUE_FLUSHED`, `MODE_UNSUPPORTED`, `PENDING_RING_EVICTION`, `CONFIG_LANE_BUSY`, `JSON_PARSE_ERROR`, `UPSTREAM_DELETE_REVOKED`, `HEARTBEAT_REJECTED`
**Server-Kanonisierung (P0.2):** Alias-Mapping serverseitig (`processing→accepted`, `success/ok→persisted`, `error→failed`, `timeout→expired`); unbekannte `flow`/`outcome` werden als Contract-Verletzung mit `code=CONTRACT_UNKNOWN_CODE` verarbeitet.
**Contract-Hinweis:** Fehlt `correlation_id`, setzt der Server `code=CONTRACT_MISSING_CORRELATION` und markiert den Datensatz als nicht-retrybar. Im Firmware-Config-Flow wird fehlende `correlation_id` zusaetzlich strict als Contract-Verletzung behandelt (kein lokaler Fallback im terminalen Pfad).
**Contract-Haertung (WP-09):** Fuer `system/intent_outcome` sind keine Legacy-Topic-Aliase mehr zulässig; alte Alias-Namen sind als deprecated zu behandeln und spaetestens bis **2026-07-03** zu entfernen.

**Zustellungsrobustheit (AUT-56, 2026-04-17):**
- **Kanonisches Outcome** (`publishIntentOutcome`): `safePublish()` QoS 1 mit 2 Retries + exponential Backoff. Bei Publish-Fail: kritische Outcomes werden in NVS-Outbox (48 Slots, Ring-Buffer) persistiert und bei Reconnect automatisch replayed (`processIntentOutcomeOutbox()`). `delivery_mode` = `"direct"` (Erstversuch) oder `"recovered"` (NVS-Replay). `retry_count` / `recovered` zeigen dem Server den Replay-Kontext.
- **Server-Dedup:** `upsert_outcome()` prüft `intent_id` + `generation` + `seq` für Out-of-order-Protection. Monotonic Finality Guard: ein finaler Outcome bleibt final. Idempotente Duplikate werden ACKed ohne Audit/WS-Seiteneffekte (`is_stale`).
- **Incident-Marker:** `[INC-EA5484]` in Firmware-Logs für Publish-Failures und NVS-Replay-Events.

**Code-Referenzen:**
- **ESP32:** `intent_contract.cpp:publishIntentOutcome()`, `processIntentOutcomeOutbox()` (NVS-Replay)
- **ESP32:** `topic_builder.cpp:buildIntentOutcomeTopic()`
- **ESP32:** `main.cpp:routeIncomingMessage()` (Admission-NACK), Queue-Worker in `tasks/*_queue.cpp`

**Intent-Metadaten im Server-Payload:** Primär top-level (`intent_id`, `correlation_id`, `generation`, …). Optional zusätzlich unter `data.*` gespiegelt — Firmware liest top-level zuerst, dann `data` (`intent_contract.cpp`).

---

### 3.12 system/intent_outcome/lifecycle (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/intent_outcome/lifecycle`

**QoS:** 1  
**Semantik:** Nur **CONFIG_PENDING**-Runtime-Transitions (`entered_config_pending`, `exit_blocked_config_pending`, `exited_config_pending`). **Nicht** mit kanonischem `system/intent_outcome` mischen.

**Pflichtfelder (Schema-Tag):** `schema` = `config_pending_lifecycle_v1`, `boot_sequence_id` (Korrelation zum Heartbeat), plus bestehende Transition-Felder (`event_type`, `reason_code`, Counter, Readiness-Snapshot — siehe `El Trabajante/docs/runtime-readiness-policy.md`).

**Zustellungsrobustheit (AUT-56, 2026-04-17):** Lifecycle-Events werden über die AUT-55-Publish-Queue (`queuePublish`, `critical=true`) geroutet. Damit profitieren sie von den gleichen Retry-Mechanismen (3 Versuche + Backoff) wie andere kritische Publishes. Vor AUT-56 gingen Lifecycle-Events über einen Raw-Publish ohne Retry — bei Outbox-Druck (Error 3012) waren sie silent-drop-anfällig. `recordIntentChainStage()` (intent_chain_stage_v1) und `publishConfigPendingTransitionEvent()` (config_pending_lifecycle_v1) sind beide gehärtet.

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildIntentOutcomeLifecycleTopic()`, `main.cpp:publishConfigPendingTransitionEvent()`
- **ESP32:** `intent_contract.cpp:recordIntentChainStage()` (intent_chain_stage_v1)

---

## 4. Config Topics

### 4.1 config (Server→ESP)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/config`

**QoS:** 2

**Payload:**
```json
{
  "config_id": "cfg_12345",
  "wifi": {
    "ssid": "NewNetwork",
    "password": "NewPassword"
  },
  "server": {
    "address": "192.168.0.100",
    "mqtt_port": 1883,
    "http_port": 80
  },
  "device": {
    "name": "ESP_12AB34CD",
    "friendly_name": "Greenhouse Sensor",
    "zone": "greenhouse"
  },
  "sensors": [
    {
      "gpio": 4,
      "type": "DS18B20",
      "name": "Boden Temp",
      "subzone_id": "zone_a",
      "active": true,
      "raw_mode": true,
      "operating_mode": "continuous",
      "measurement_interval_seconds": 30
    }
  ],
  "actuators": [
    {
      "gpio": 5,
      "aux_gpio": 255,
      "type": "pump",
      "name": "Pumpe 1",
      "subzone_id": "zone_a",
      "active": true,
      "critical": false,
      "inverted": false,
      "default_state": false,
      "default_pwm": 0,
      "max_runtime_ms": 120000
    }
  ],
  "offline_rules": [
    {
      "actuator_gpio": 18,
      "sensor_gpio": 4,
      "sensor_value_type": "sht31_temperature",
      "activate_above": 28.0,
      "deactivate_below": 24.0,
      "activate_below": 0.0,
      "deactivate_above": 0.0,
      "current_state_active": false
    },
    {
      "actuator_gpio": 20,
      "sensor_gpio": 4,
      "sensor_value_type": "sht31_temperature",
      "activate_above": 28.0,
      "deactivate_below": 24.0,
      "activate_below": 0.0,
      "deactivate_above": 0.0,
      "current_state_active": false,
      "time_filter": {
        "enabled": true,
        "start_hour": 22,
        "start_minute": 0,
        "end_hour": 6,
        "end_minute": 0
      }
    }
  ],
  "reason_code": "sensor_config_change",
  "generation": 1745453025123,
  "config_fingerprint": "a4e80f0bc905cf5ff2894aa9e1986354f4a0a44df8f06f2f699f0df88ad8e526"
}
```

**AUT-134 Erweiterung (additiv, backward-compatible):**
- `reason_code` (optional, string): Ursache des Config-Sends, z. B. `sensor_config_change`, `actuator_config_change`, `logic_config_change`, `heartbeat_count_mismatch`, `reconnect_count_mismatch`.
- `generation` (optional, int): monotone Version für Scope-Stale-Guards auf ESP-Seite.
- `config_fingerprint` (optional, string): SHA-256 über kanonisierten Payload für Drift-/Forensik-Korrelation.

**offline_rules Felder:**

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `actuator_gpio` | int | GPIO des Aktors auf diesem ESP |
| `sensor_gpio` | int | GPIO des Sensors (0 = I2C-Konvention) |
| `sensor_value_type` | string | Kanonischer Sensortyp (z.B. `sht31_temperature`, `ds18b20`) |
| `activate_above` | float | Cooling-Modus: AN wenn Wert > Schwelle |
| `deactivate_below` | float | Cooling-Modus: AUS wenn Wert < Schwelle |
| `activate_below` | float | Heating-Modus: AN wenn Wert < Schwelle |
| `deactivate_above` | float | Heating-Modus: AUS wenn Wert > Schwelle |
| `current_state_active` | bool | Aktueller Hysterese-State (aus `logic_hysteresis_states`) |
| `time_filter` | object? | Optional — nur bei AND-Compound-Regeln mit Zeitfenster |

**time_filter Konventionen:**
- Stunden/Minuten immer in **UTC** (Server konvertiert lokale Zeitzone vor Push)
- `end_hour: 24` = Mitternacht exklusiv; für Mitternachts-Wraparound `end_hour < start_hour` (z.B. 22:00–06:00)
- Fehlt das Feld → ESP setzt `time_filter_enabled = false`

**Server-seitige Konvertierung (LE-01):**
- Einfache `sensor_threshold`-Regeln (`>`, `<`, `>=`, `<=`) werden server-seitig in Hysterese konvertiert (Auto-Deadband je Sensortyp, z.B. Temperatur ±2°C)
- AND-Compound-Regeln (Hysterese/Threshold + Zeitfenster) werden als eine Offline-Rule mit `time_filter` kodiert
- OR-Compounds, Cross-ESP-Regeln, analoge Sensoren (pH/EC/moisture/soil_moisture) werden nicht konvertiert

**Code-Referenzen:** `config_builder.py:_extract_offline_rule()`, `config_builder.py:_get_default_deadband()`

**Operating Modes (Phase 2C):**
- `continuous`: Regelmäßige Messungen (Standard)
- `on_demand`: Nur auf Anfrage
- `paused`: Pausiert
- `scheduled`: Nach Zeitplan

**Code-Referenzen:**
- **ESP32:** `main.cpp` Zeile 723 (Subscription)
- **Server:** `publisher.py:publish_config()` (Zeile 211)

---

### 4.2 config_response (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/config_response`

**QoS:** 2

**Payload (Success):**
```json
{
  "seq": 17,
  "status": "success",
  "type": "sensor",
  "count": 3,
  "message": "Configured 3 item(s) successfully",
  "correlation_id": "cfg_abc123",
  "request_id": "req_42",
  "reason_code": "heartbeat_count_mismatch",
  "generation": 1745453025123,
  "config_fingerprint": "a4e80f0bc905cf5ff2894aa9e1986354f4a0a44df8f06f2f699f0df88ad8e526"
}
```

**Payload (Partial/Failure):**
```json
{
  "seq": 18,
  "status": "partial_success",
  "type": "sensor",
  "count": 2,
  "failed_count": 1,
  "message": "2 configured, 1 failed",
  "failures": [
    {
      "type": "sensor",
      "gpio": 5,
      "error_code": 1002,
      "error": "GPIO_CONFLICT",
      "detail": "GPIO 5 reserved by actuator (pump_1)"
    }
  ],
  "correlation_id": "cfg_abc123",
  "request_id": "req_42"
}
```

**Legacy-kompatibel:** `status="failed"` und `config_type` werden weiterhin akzeptiert und serverseitig kanonisiert.

**Contract-Härtung (Server-Ingest):**
- Canonical-first: Status/Typ/Error werden vor Persistenz/Audit/Broadcast normalisiert.
- Unbekannte Werte werden auf `CONTRACT_UNKNOWN_CODE` gehoben und mit `raw_*` Kontext auditierbar gehalten.
- Fehlende `correlation_id` wird im Firmware-Config-Pfad strict als Vertragsfehler emittiert (`CONTRACT_MISSING_CORRELATION` / `CONTRACT_CORRELATION_MISSING`); kein lokaler Fallback im terminalen Pfad.
- Serverseitige Korrelationsergaenzung (`missing-corr:cfg:...`) bleibt als Defense-in-Depth fuer nicht-konforme Fremd-Producer aktiv.
- `request_id` kann optional als Trace-Feld mitgesendet werden und wird serverseitig in `config_response`-Projektionen weitergereicht (nicht als Matching-Schluessel verwendet).
- Terminale Persistence-Authority erzwingt write-once/finality vor DB-Statusupdates, Audit-Log und WS-Broadcast.
- Stale/Replayed ACKs werden deterministisch erkannt und idempotent ohne erneute Seiteneffekte verworfen.

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildConfigResponseTopic()` (Zeile 176)
- **Server:** `main.py` Zeile 260 (Handler Registration)

---

## 5. Zone Topics

### 5.1 zone/assign (Server→ESP)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/zone/assign`

**QoS:** 1

**Payload:**
```json
{
  "zone_id": "greenhouse",
  "zone_name": "Gewächshaus",
  "master_zone_id": "main_zone"
}
```

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildZoneAssignTopic()` (Zeile 229) + `main.cpp` Subscription
- **Server:** `topics.py:build_zone_assign_topic()` (Zeile 142)

---

### 5.2 zone/ack (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/zone/ack`

**QoS:** 1

**Payload:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "status": "zone_assigned",
  "zone_id": "greenhouse",
  "master_zone_id": "greenhouse_master",
  "seq": 42,
  "correlation_id": "uuid-v4"
}
```

**correlation_id:** Muss die **vom Server in `zone/assign` gesetzte** UUID exakt echo’en, damit `MQTTCommandBridge.resolve_ack` das richtige wartende Future trifft. **Kein** FIFO-Fallback: fehlt die ID oder ist sie unbekannt → ACK wird für die Bridge **nicht** zugeordnet (WARNING-Log `ACK dropped: no correlation match`), REST läuft in **Timeout**. Handler lesen auch Aliase (`corr_id`, `corrId`, `data.correlation_id`) via `extract_ack_correlation_id`. Firmware setzt die ID typischerweise aus dem Assign-Payload bzw. Fallback-Generator.

**status-Werte:** `zone_assigned`, `zone_removed`, `error`

**reason_code (optional, string):** z. B. `CONFIG_LANE_BUSY` (Config-Lane belegt), `JSON_PARSE_ERROR` (Payload ungültig).

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildZoneAckTopic()` (Zeile 237)
- **Server:** `main.py` Zeile 275 (Handler Registration)

---

### 5.3 subzone/assign (Server→ESP) - Phase 9

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/subzone/assign`

**QoS:** 1

**Payload:**
```json
{
  "subzone_id": "zone_a",
  "subzone_name": "Bewässerung Sektor A",
  "gpio_pins": [4, 5, 15],
  "timestamp": 1735818000
}
```

**Code-Referenzen:**
- **ESP32:** `main.cpp` Zeile 734 (Subscription)
- **Server:** `topics.py:build_subzone_assign_topic()` (Zeile 178)

---

### 5.4 subzone/remove (Server→ESP) - Phase 9

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/subzone/remove`

**QoS:** 1

**Payload:**
```json
{
  "subzone_id": "zone_a",
  "reason": "reconfiguration",
  "timestamp": 1735818000
}
```

**Code-Referenzen:**
- **ESP32:** `main.cpp` Zeile 736 (Subscription)
- **Server:** `topics.py:build_subzone_remove_topic()` (Zeile 185)

---

### 5.5 subzone/ack (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/subzone/ack`

**QoS:** 1

**Payload:**
```json
{
  "timestamp": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "status": "subzone_assigned",
  "subzone_id": "zone_a",
  "seq": 43,
  "correlation_id": "uuid-v4"
}
```

**correlation_id:** Wie bei `zone/ack`: exaktes Echo der serverseitigen UUID aus `subzone/assign` (bzw. `subzone/remove`), **kein** FIFO-Fallback in der Bridge — sonst Timeout statt falscher Zuordnung. Aliase wie oben.

**status-Werte:** `subzone_assigned`, `subzone_removed`, `error`

**reason_code (optional, string):** z. B. `CONFIG_LANE_BUSY`, `JSON_PARSE_ERROR`, `VALIDATION_ERROR`, `SUBZONE_NOT_FOUND` (statt nur numerischem `error_code` bei strukturierten Fehlern).

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildSubzoneAckTopic()` (Zeile 206)
- **Server:** `main.py` Zeile 280 (Handler Registration)

---

### 5.6 subzone/status (ESP→Server) - Phase 9

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/subzone/status`

**QoS:** 1

**Payload:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "subzone_id": "zone_a",
  "active": true,
  "sensors_active": 2,
  "actuators_active": 1,
  "safe_mode": false
}
```

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildSubzoneStatusTopic()` (Zeile 213)
- **Server:** Noch nicht implementiert (Phase 9)

---

### 5.7 subzone/safe (Server→ESP) - Phase 9

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/subzone/safe`

**QoS:** 1

**Payload:**
```json
{
  "subzone_id": "zone_a",
  "safe_mode": true,
  "reason": "Sensor anomaly detected",
  "affected_gpios": [4, 5],
  "timestamp": 1735818000
}
```

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildSubzoneSafeTopic()`, `main.cpp` subscribt und verarbeitet (Handler: action enable/disable, gpioManager.enableSafeModeForSubzone/disableSafeModeForSubzone)
- **Server:** `topics.py:build_subzone_safe_topic()` (Zeile 192)

---

## 6. Broadcast Topics

### 6.1 broadcast/emergency (Server→ALL)

**Topic:** `kaiser/broadcast/emergency`

**QoS:** 2

**Payload (Feld `command`):**
```json
{
  "command": "emergency_stop",
  "auth_token": "my_broadcast_token",
  "reason": "Global emergency triggered"
}
```

**Aufheben (alle ESPs):**
```json
{
  "command": "clear_emergency",
  "auth_token": "my_broadcast_token",
  "reason": "manual"
}
```

**command-Werte:** `emergency_stop` (alle Aktoren stoppen), `clear_emergency` (Not-Aus systemweit aufheben). Konsistent mit Abschnitt 2.5 (actuator/emergency).

**Authentifizierung (fail-open):**
- `auth_token` wird gegen NVS-Key `broadcast_em_tok` validiert
- Wenn kein Token in NVS konfiguriert: jeder Broadcast-Stop wird akzeptiert (Sicherheit > Authentifizierung)
- Token setzbar via `set_emergency_token` System-Command (token_type="broadcast")

---

### 6.2 broadcast/system_update (Server→ALL)

**Topic:** `kaiser/broadcast/system_update`

**QoS:** 1

**Payload:**
```json
{
  "update_type": "config_change",
  "message": "Configuration updated"
}
```

---

## 7. Server Topic Subscriptions

Der Server subscribed zu folgenden Topic-Patterns:

| Pattern | Handler | Datei:Zeile |
|---------|---------|-------------|
| `kaiser/+/esp/+/sensor/+/data` | `handle_sensor_data` | `sensor_handler.py:77` |
| `kaiser/+/esp/+/sensor/batch` | `handle_sensor_batch` | `sensor_handler.py:285` |
| `kaiser/+/esp/+/actuator/+/status` | `handle_actuator_status` | `actuator_handler.py:45` |
| `kaiser/+/esp/+/actuator/+/response` | `handle_actuator_response` | `main.py:239` |
| `kaiser/+/esp/+/actuator/+/alert` | `handle_actuator_alert` | `main.py:244` |
| `kaiser/+/esp/+/session/announce` | `handle_session_announce` | `heartbeat_handler.py` |
| `kaiser/+/esp/+/system/heartbeat` | `handle_heartbeat` | `heartbeat_handler.py:61` |
| `kaiser/+/esp/+/system/heartbeat_metrics` | `handle_heartbeat_metrics` | `heartbeat_metrics_handler.py:56` |
| `kaiser/+/esp/+/config_response` | `handle_config_ack` | `config_handler.py:52` |
| `kaiser/+/esp/+/zone/ack` | `handle_zone_ack` | `main.py:275` |
| `kaiser/+/esp/+/subzone/ack` | `handle_subzone_ack` | `main.py:280` |
| `kaiser/+/esp/+/system/will` | `handle_lwt` | `lwt_handler.py:35` |
| `kaiser/+/esp/+/system/error` | `handle_system_error` | `main.py:293` |
| `kaiser/+/esp/+/system/queue_pressure` | *(PKG-01b, Welle 2: `handle_queue_pressure`)* | *(server-dev, Welle 2)* |
| `kaiser/+/esp/+/system/intent_outcome` | `handle_intent_outcome` | `intent_outcome_handler.py` |
| `kaiser/+/esp/+/system/intent_outcome/lifecycle` | `handle_intent_outcome_lifecycle` | `intent_outcome_lifecycle_handler.py` (Audit + WS `intent_outcome_lifecycle`, Metrik `intent_outcome_lifecycle_total`) |
| `kaiser/+/esp/+/status` | *(nicht registriert)* | *(derzeit kein Handler in `main.py`)* |
| `kaiser/+/esp/+/safe_mode` | *(nicht registriert)* | *(derzeit kein Handler in `main.py`)* |

**Handler-Registrierung:** `main.py:201-307`

**Wildcard-Bedeutung:** `+` (Single-Level) matcht jeden Wert an dieser Position. `kaiser/+/` unterstützt Multi-Kaiser-Setup (aktuell: `kaiser/god/`, zukünftig: `kaiser/kaiser_01/`, etc.).

---

## 7.1 Wildcard-Pattern Referenz

MQTT Wildcards für Topic-Subscriptions:

| Wildcard | Bedeutung | Beispiel |
|----------|-----------|----------|
| `+` | Single-Level (ein Segment) | `esp/+/sensor` matcht `esp/ABC/sensor` |
| `#` | Multi-Level (al