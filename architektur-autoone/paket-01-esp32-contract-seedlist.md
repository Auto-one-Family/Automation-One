# P1.1 — ESP32 Contract-Seedlist (El Trabajante Firmware)

**Paket:** 01  
**Analyse-Datum:** 2026-04-04  
**Ergänzung zu:** paket-01-esp32-modul-inventar.md

---

## Übersicht

Diese Contract-Seedlist dokumentiert die vier Kern-Contract-Ketten der ESP32-Firmware.
Sie ist der Startpunkt für die detaillierte Contract-Analyse in P1.6 (MQTT/Netzwerk).

| Contract-ID | Name | Richtung | Priorität |
|-------------|------|----------|----------|
| FW-CON-001 | Sensor → MQTT Publish | ESP32 → Server | CRITICAL |
| FW-CON-002 | Server Command → ESP32 Command-ACK | Server → ESP32 | CRITICAL |
| FW-CON-003 | Config-Push → Firmware Config-Verarbeitung | Server → ESP32 | CRITICAL |
| FW-CON-004 | Heartbeat + Server-ACK (Status-Rückkanal) | Bidirektional | CRITICAL |

---

## FW-CON-001: Sensor → MQTT Publish

**Beschreibung:** Der ESP32 sendet Sensor-Messwerte (RAW) an den Server. Der Server ist Single Source of Truth für Kalibrierung und Verarbeitung.

**Topic-Pattern:**
```
kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data
```

**Payload-Schema (ESP32 → Server):**
```json
{
  "esp_id": "ESP_12AB34CD",
  "gpio": 4,
  "sensor_type": "temperature_ds18b20",
  "raw_value": 1760,
  "processed_value": 22.0,
  "unit": "°C",
  "quality": "good",
  "raw_mode": true,
  "timestamp": 1735818000,
  "onewire_address": "28FF641E8D3C0C79",
  "i2c_address": 0,
  "subzone_id": "irrigation_A",
  "seq": 42
}
```

**Pflichtfelder:** `esp_id`, `gpio`, `sensor_type`, `raw_value`, `raw_mode`, `timestamp`  
**Bedingt-Pflicht:** `onewire_address` (wenn DS18B20), `i2c_address` (wenn I2C-Sensor)  
**Optional:** `processed_value`, `unit`, `quality`, `subzone_id`

**QoS:** 1 (at least once)  
**Retain:** false  
**Frequenz:** Standard 30s (konfigurierbar per Sensor via `measurement_interval_ms`)

**Sendende Module:** FW-MOD-014 (sensor_manager.publishSensorReading), FW-MOD-034 (topic_builder), FW-MOD-029 (mqtt_client)  
**Empfangendes System:** El Servador (Sensor-Processor-Handler)

**Contract-Verletzungen:**
| Szenario | Auswirkung |
|----------|------------|
| `raw_mode = false` gesendet | Server verarbeitet Wert als bereits kalibriert → falscher Datenpunkt |
| `onewire_address` fehlt bei DS18B20 | Server kann Sensor auf geteiltem Bus nicht identifizieren |
| `timestamp = 0` | Server nutzt Server-Time als Fallback, Cross-ESP-Korrelation verloren |
| QoS-0 bei Verbindungsproblem | Messung silently dropped |
| gpio als falscher Sensor-Key (NB6-Bug) | Falsche Sensor-Zuordnung bei 2+ gleichen Typen auf demselben GPIO |

**Folgepaket:** P1.3 (Sensorhandling End-to-End), P1.6 (MQTT-Netzwerk)

---

## FW-CON-002: Server Command → ESP32 Actuator Command-ACK

**Beschreibung:** Der Server sendet Aktor-Befehle. Der ESP32 führt sie aus und bestätigt das Ergebnis. Emergency-Stop nutzt einen separaten Broadcast-Topic.

### 2a — Normaler Aktor-Befehl

**Topic-Pattern (Server → ESP32):**
```
kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command
```

**Payload-Schema (Server → ESP32):**
```json
{
  "command": "ON",
  "value": 1.0,
  "duration_s": 300,
  "correlation_id": "srv-cmd-uuid-1234",
  "intent_id": "intent-uuid-5678",
  "generation": 3,
  "epoch_at_accept": 7,
  "ttl_ms": 5000
}
```

**Pflichtfelder:** `command` (ON/OFF/PWM/TOGGLE/STOP), `correlation_id`  
**Optional:** `value` (0.0–1.0 für PWM, binary für pump/valve), `duration_s` (Auto-Off), `intent_id`, `generation`, `epoch_at_accept`, `ttl_ms`

**QoS:** 1

**Response-Topic (ESP32 → Server):**
```
kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/response
```

**Response-Payload:**
```json
{
  "esp_id": "ESP_12AB34CD",
  "gpio": 5,
  "command": "ON",
  "value": 1.0,
  "success": true,
  "message": "Pump activated",
  "duration_s": 300,
  "correlation_id": "srv-cmd-uuid-1234",
  "emergency_state": "normal",
  "timestamp": 1735818000,
  "seq": 43
}
```

### 2b — Emergency-Stop (Broadcast)

**Topic-Pattern:**
```
kaiser/{kaiser_id}/esp/broadcast/emergency
```

**Payload-Schema:**
```json
{
  "command": "stop_all",
  "action": "stop_all",
  "auth_token": "...",
  "reason": "Manual override",
  "issued_by": "admin",
  "timestamp": "2026-04-04T12:00:00Z"
}
```

**Pflichtfelder:** `command` oder `action` (ODER: "stop_all" | "emergency_stop")  
**Contract-Validator:** FW-MOD-042 (emergency_broadcast_contract)

**Contract-Verletzungen:**
| Szenario | Auswirkung |
|----------|------------|
| `correlation_id` fehlt | Intent-Outcome-Tracking unmöglich, Command wird je nach Zustand abgelehnt |
| `command` unbekannt (nicht ON/OFF/PWM/TOGGLE/STOP) | ActuatorManager lehnt ab, error geloggt |
| `value` außerhalb 0.0–1.0 für PWM | Klemmt auf Grenzwert oder Fehler |
| Emergency-Stop ohne gültiges `command`-Feld | CONTRACT_MISMATCH → Emergency-Stop wird NICHT ausgeführt (Safety-Risiko!) |
| Befehl in STATE_CONFIG_PENDING_AFTER_RESET | CommandAdmission lehnt ab (außer Recovery-Intent) |
| Safety-Epoch mismatch | Intent-Invalidation → Command wird dropped |

**Sendende Module:** Server (MQTT-Broker)  
**Empfangende Module:** FW-MOD-010 (actuator_cmd_queue), FW-MOD-005 (safety_task), FW-MOD-023 (actuator_manager), FW-MOD-042 (emergency_contract)

**Folgepaket:** P1.5 (Safety-Operationen), P1.6 (MQTT)

---

## FW-CON-003: Config-Push → Firmware Config-Verarbeitung

**Beschreibung:** Der Server sendet einen vollständigen Konfigurationsstand (Sensoren + Aktoren + Offline-Rules) in einer einzigen JSON-Nachricht. Der ESP32 verarbeitet alle drei Sektionen atomar auf Core 1.

**Topic-Pattern (Server → ESP32):**
```
kaiser/{kaiser_id}/esp/{esp_id}/config
```

**Payload-Schema (Server → ESP32):**
```json
{
  "correlation_id": "cfg-uuid-1234",
  "intent_id": "intent-cfg-5678",
  "generation": 5,
  "sensors": [
    {
      "gpio": 4,
      "sensor_type": "temperature_ds18b20",
      "sensor_name": "Tank-Temperatur",
      "onewire_address": "28FF641E8D3C0C79",
      "operating_mode": "continuous",
      "measurement_interval_ms": 30000,
      "subzone_id": "tank_zone"
    }
  ],
  "actuators": [
    {
      "gpio": 5,
      "actuator_type": "pump",
      "actuator_name": "Haupt-Pumpe",
      "active": true,
      "critical": true,
      "default_state": false,
      "inverted_logic": false
    }
  ],
  "offline_rules": [
    {
      "enabled": true,
      "actuator_gpio": 5,
      "sensor_gpio": 4,
      "sensor_value_type": "temperature_ds18b20",
      "activate_below": 15.0,
      "deactivate_above": 22.0,
      "time_filter_enabled": false
    }
  ]
}
```

**Pflichtfelder:** `correlation_id` (Pflicht — bei Fehlen: CONTRACT_MISSING_CORRELATION, sofortige Ablehnung)  
**Sections:** `sensors`, `actuators`, `offline_rules` — alle optional aber typischerweise alle vorhanden (Full-State-Push)  
**Max-Payload-Größe:** 4096 Bytes (CONFIG_PAYLOAD_MAX_LEN — CP-F4 enforcement)

**Response-Topic (ESP32 → Server):**
```
kaiser/{kaiser_id}/esp/{esp_id}/config/response
```

**Response-Payload:**
```json
{
  "esp_id": "ESP_12AB34CD",
  "status": "success",
  "correlation_id": "cfg-uuid-1234",
  "config_type": "FULL",
  "sensor_count": 1,
  "actuator_count": 1,
  "offline_rule_count": 1,
  "timestamp": 1735818000
}
```

**Intent-Outcome-Topic (ESP32 → Server, immer):**
```
kaiser/{kaiser_id}/esp/{esp_id}/intent/outcome
```

**QoS:** 1  
**Verarbeitungsweg:** Core 0 (MQTT-Handler) → ConfigUpdateQueue (FW-MOD-009) → Core 1 (Safety-Task processConfigUpdateQueue)

**Contract-Verletzungen:**
| Szenario | Auswirkung |
|----------|------------|
| `correlation_id` fehlt | Sofortige Ablehnung, Intent-Outcome mit REJECTED gesendet |
| Payload > 4096 Bytes | CP-F4: Sofortige Ablehnung, CONFIG_PAYLOAD_TOO_LARGE error |
| Config-Push ohne Registrierungsbestätigung | CommandAdmission: REJECTED (registration_confirmed = false) |
| Config-Push in STATE_SAFE_MODE | REJECTED (runtime_degraded = true) |
| JSON-Parse-Fehler | Alle drei Handler überspringen betroffene Sektion |
| Sensor-GPIO-Konflikt mit bestehendem Aktor | GPIOManager.requestPin() schlägt fehl, Sensor nicht konfiguriert |
| NVS-Schreibfehler | StorageManager gibt false zurück, Konfiguration unvollständig — kein Rollback! |

**Sendende Module:** Server (El Servador Config-Handler)  
**Empfangende Module:** FW-MOD-009 (config_update_queue), FW-MOD-005 (safety_task), FW-MOD-014 (sensor_manager.configureSensor), FW-MOD-023 (actuator_manager.handleActuatorConfig), FW-MOD-041 (offline_mode_manager.parseOfflineRules), FW-MOD-035 (config_manager), FW-MOD-036 (storage_manager)

**Folgepaket:** P1.3 (Sensor-Config-Verarbeitung), P1.6 (MQTT)

---

## FW-CON-004: Heartbeat + Server-ACK (Status-Rückkanal)

**Beschreibung:** Der ESP32 sendet alle 60s einen Heartbeat mit vollständigem Status-Snapshot. Der Server antwortet mit einem ACK. Ausbleiben des ACKs (120s) löst den primären Safety-Mechanismus (setAllActuatorsToSafeState) aus.

### 4a — Heartbeat (ESP32 → Server)

**Topic-Pattern:**
```
kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat
```

**Payload-Schema:**
```json
{
  "esp_id": "ESP_12AB34CD",
  "kaiser_id": "god",
  "firmware_version": "4.0.0",
  "state": "OPERATIONAL",
  "uptime_seconds": 3600,
  "heap_free": 145000,
  "wifi_rssi": -55,
  "mqtt_connected": true,
  "sensor_count": 3,
  "actuator_count": 2,
  "gpio_pins": [
    {"gpio": 4, "owner": "sensor", "component": "DS18B20"},
    {"gpio": 5, "owner": "actuator", "component": "Pump1"}
  ],
  "config_status": {
    "wifi_configured": true,
    "zone_assigned": true,
    "sensor_count": 3,
    "actuator_count": 2,
    "subzone_count": 1,
    "nvs_errors": 0,
    "boot_count": 12
  },
  "offline_mode": "ONLINE",
  "registration_confirmed": true,
  "seq": 100,
  "ts": 1735818000
}
```

**QoS:** 0 (Heartbeat ist periodisch; Verlust einzelner Packets akzeptabel)  
**Interval:** 60s (normal), 5s (während Registration-Gate geschlossen)  
**Erstes Heartbeat:** Nach jedem MQTT-Connect (auch Reconnect), via on_connect_callback_

### 4b — Heartbeat-ACK (Server → ESP32)

**Topic-Pattern:**
```
kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat/ack
```

**Payload-Schema:**
```json
{
  "esp_id": "ESP_12AB34CD",
  "status": "registered",
  "handover_epoch": 7,
  "timestamp": 1735818000
}
```

**Pflichtfelder:** `handover_epoch` (muss > 0 sein für OfflineModeManager.onServerAckReceived-Contract)  
**QoS:** 0

**Safety-Implikationen:**
- `g_last_server_ack_ms` wird nach jedem validen ACK auf millis() gesetzt
- Safety-Task prüft alle 5s: wenn elapsed > SERVER_ACK_TIMEOUT_MS (120000ms) → triggerBroadcastEmergencyStop() → setAllActuatorsToSafeState()
- OfflineModeManager.onServerAckReceived() wird bei jedem ACK aufgerufen (Handover-Epoch-Validierung)
- Bei `handover_epoch = 0` oder Contract-Mismatch: onServerAckContractMismatch() → kein ONLINE-State-Übergang

### 4c — Server-LWT (Server → ESP32, Safety-P5)

**Topic-Pattern:**
```
kaiser/{kaiser_id}/server/status
```

**Payload:** `{"status": "offline"}` (LWT-Message des Servers)  
**QoS:** 1  
**Safety-Implikation:** Empfang → sofortige offline_mode_manager.onDisconnect() → Startet 30s Grace-Timer

**Contract-Verletzungen:**
| Szenario | Auswirkung |
|----------|------------|
| ACK bleibt > 120s aus | setAllActuatorsToSafeState(): alle Aktoren auf default_state |
| `handover_epoch = 0` in ACK | onServerAckContractMismatch → OfflineModeManager bleibt in ADOPTING |
| Heartbeat-Publish dropped (QoS-0) | Server erhält keinen Status-Update; möglicherweise kein ACK → ACK-Timeout |
| Heartbeat nach Reconnect verpasst | Registration-Gate bleibt zu; Config-Push und Commands abgelehnt |
| Server-LWT nie empfangen | OfflineModeManager erfährt Server-Ausfall erst nach ACK-Timeout (120s statt 30s) |
| mqtt_client.publishHeartbeat() aufgerufen bevor MQTT connected | Wird silently dropped (QoS-0, isConnected=false) |

**Sendende Module:** FW-MOD-029 (mqtt_client.publishHeartbeat), FW-MOD-034 (topic_builder), FW-MOD-035 (config_manager.getDiagnosticsJSON), FW-MOD-047 (gpio_manager.getReservedPinsList)  
**Empfangende Module (ACK):** FW-MOD-001 (main.cpp), FW-MOD-029 (mqtt_client.confirmRegistration), FW-MOD-041 (offline_mode_manager.onServerAckReceived)

**Folgepaket:** P1.5 (Safety-Operationen), P1.6 (MQTT-Netzwerk)

---

## Zusatz-Contracts (identifiziert, aber nicht Pflicht-Seed)

| Contract-ID | Topic-Pattern | Richtung | Beschreibung | Folgepaket |
|-------------|---------------|----------|--------------|-----------|
| FW-CON-005 | `…/zone/assign` | Server → ESP32 | Zone-Zuweisung (kaiser_id, zone_id, master_zone_id) | P1.2 |
| FW-CON-006 | `…/zone/ack` | ESP32 → Server | Zone-ACK | P1.2 |
| FW-CON-007 | `…/subzone/assign` | Server → ESP32 | Subzone-Zuweisung mit GPIO-Mapping | P1.2 |
| FW-CON-008 | `…/subzone/remove` | Server → ESP32 | Subzone-Entfernung | P1.2 |
| FW-CON-009 | `…/subzone/ack` | ESP32 → Server | Subzone-ACK | P1.2 |
| FW-CON-010 | `…/subzone/safe` | Server → ESP32 | Subzone in Safe-Mode versetzen | P1.5 |
| FW-CON-011 | `…/system/command` | Server → ESP32 | System-Befehle (factory_reset, reboot, safe_mode etc.) | P1.2 |
| FW-CON-012 | `…/system/diagnostics` | ESP32 → Server | Periodische Health-Snapshots (HealthMonitor) | P1.7 |
| FW-CON-013 | `…/system/error` | ESP32 → Server | Error-Events (ErrorTracker, QoS-0) | P1.7 |
| FW-CON-014 | `…/intent/outcome` | ESP32 → Server | Unified Intent-Outcome-Stream (alle Commands) | P1.6 |
| FW-CON-015 | `…/sensor/{gpio}/command` | Server → ESP32 | On-Demand Sensor-Messung (triggerManualMeasurement) | P1.3 |
| FW-CON-016 | `…/sensor/{gpio}/response` | ESP32 → Server | Sensor-Command-Response | P1.3 |

---

## Bekannte Contract-Risiken (Top-5 für P1.5/P1.6)

| Risiko-ID | Beschreibung | Schwere | Folgepaket |
|-----------|--------------|---------|-----------|
| CR-001 | Emergency-Broadcast-Contract: Wenn `command`-Feld fehlt oder ungültig ist, wird Emergency-Stop NICHT ausgeführt — stilles Versagen bei falsch formatierten Payloads | CRITICAL | P1.5 |
| CR-002 | ACK-Timeout (120s) mit 5-Sekunden-Prüfintervall: Worst-case 125s bis setAllActuatorsToSafeState() — zu lang für kritische Aktoren | HIGH | P1.5 |
| CR-003 | Config-Push ohne Rollback: Bei NVS-Schreibfehler in der Mitte eines Sensor+Actuator+OfflineRules-Push bleibt die Konfiguration in einem Halbzustand. Kein Rollback-Mechanismus | HIGH | P1.4 |
| CR-004 | Sensor-Batch-Topic (`sensor/batch`) ist in TopicBuilder als ORPHANED markiert — kein Server-Handler vorhanden, aber das Topic ist im Code vorhanden | MEDIUM | P1.6 |
| CR-005 | `handover_epoch = 0` im ACK: OfflineModeManager.validateServerAckContract() weist ACK ab → ESP bleibt in ADOPTING-State → Offline-Rules bleiben aktiv obwohl Server erreichbar ist | HIGH | P1.5 |
