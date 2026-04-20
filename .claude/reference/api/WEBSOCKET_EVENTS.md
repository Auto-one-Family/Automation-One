---
name: websocket-reference
description: WebSocket Events Real-time Updates esp_health sensor_data
  actuator_status device_discovered Frontend Server Live Subscription
allowed-tools: Read
---

# WebSocket Event Referenz

> **Version:** 3.15 | **Aktualisiert:** 2026-04-06
> **Endpoint:** `ws://localhost:8000/api/v1/ws/realtime/{client_id}?token={jwt_token}`
> **Quellen:** Vollständige Codebase-Analyse aller `broadcast` Aufrufe
> **Event-Anzahl:** 42 relevante Event-Typen (39 serverseitige Broadcast-Events + 1 optionaler Plugin-Statuskanal + 2 Frontend-Contract-Integrationssignale)

---

## 0. Quick-Lookup (Alle Events)

### ESP/Device Events

| Event | Richtung | Trigger | Beschreibung |
|-------|----------|---------|--------------|
| `esp_health` | Server→Frontend | Heartbeat | ESP Online-Status, Health-Daten |
| `esp_reconnect_phase` | Server→Frontend | Reconnect-Handover | Adoption-Phasen: adopting, adopted, delta_enforced |
| `device_discovered` | Server→Frontend | Neues ESP | Unbekanntes ESP entdeckt |
| `device_rediscovered` | Server→Frontend | ESP wieder online | Bekanntes ESP kommt zurück |
| `device_approved` | Server→Frontend | Admin-Aktion | Pending ESP genehmigt |
| `device_rejected` | Server→Frontend | Admin-Aktion | Pending ESP abgelehnt |
| `esp_diagnostics` | Server→Frontend | HealthMonitor (60s) | System-Diagnostics (Heap, CB, Watchdog) |

### Sensor Events

| Event | Richtung | Trigger | Beschreibung |
|-------|----------|---------|--------------|
| `sensor_data` | Server→Frontend | Sensor-Messung | Neuer Sensor-Wert |
| `sensor_health` | Server→Frontend | Health-Check | Sensor Timeout/Recovery |
| `sensor_config_deleted` | Server→Frontend | Sensor DELETE | Sensor-Config entfernt (Ghost-Cleanup) |

### Actuator Events

| Event | Richtung | Trigger | Beschreibung |
|-------|----------|---------|--------------|
| `actuator_status` | Server→Frontend | Status-Update | Actuator State-Änderung |
| `actuator_command` | Server→Frontend | Command gesendet | Command erfolgreich gepublished |
| `actuator_command_failed` | Server→Frontend | Command fehlgeschlagen | Safety/MQTT Fehler |
| `actuator_response` | Server→Frontend | ESP-Antwort | ESP bestätigt Command |
| `actuator_alert` | Server→Frontend | Alert | Emergency-Stop, Timeout |

### Config Events

| Event | Richtung | Trigger | Beschreibung |
|-------|----------|---------|--------------|
| `config_response` | Server→Frontend | ESP-ACK | ESP bestätigt Config (terminal nur mit `data.correlation_id`) |
| `config_published` | Server→Frontend | Config gesendet | Config erfolgreich gepublished |
| `config_failed` | Server→Frontend | Config fehlgeschlagen | Publish-Fehler (terminal nur mit `data.correlation_id`) |
| `intent_outcome` | Server→Frontend | IntentOutcomeHandler | Kanonischer Intent/Outcome-Status aus MQTT |
| `intent_outcome_lifecycle` | Server→Frontend | IntentOutcomeLifecycleHandler | CONFIG_PENDING-Lifecycle (`config_pending_lifecycle_v1`) aus MQTT-Subtopic |

### Zone Events

| Event | Richtung | Trigger | Beschreibung |
|-------|----------|---------|--------------|
| `zone_assignment` | Server→Frontend | Zone ACK | ESP bestätigt Zone-Zuweisung |
| `subzone_assignment` | Server→Frontend | Subzone ACK | ESP bestätigt Subzone-Zuweisung/Entfernung |
| `device_context_changed` | Server→Frontend | PUT/DELETE /device-context | Aktiver Zone-Kontext eines Sensors/Aktors geändert (T13-R2) |
| `device_scope_changed` | Server→Frontend | PUT /sensors oder /actuators | device_scope oder assigned_zones geändert (T13-R2) |

### Logic/Automation Events

| Event | Richtung | Trigger | Beschreibung |
|-------|----------|---------|--------------|
| `logic_execution` | Server→Frontend | Rule ausgeführt | Automation Rule triggered |
| `notification` | Server→Frontend | Legacy Rule-Notification | **Deprecated** Legacy-Event (nicht NotificationRouter-basiert, Sunset: 2026-07-03) |

### Notification Events (Phase 4A)

| Event | Richtung | Trigger | Beschreibung |
|-------|----------|---------|--------------|
| `notification_new` | Server→Frontend | NotificationRouter | Neue Notification (DB-persistiert) |
| `notification_updated` | Server→Frontend | NotificationRouter | Notification gelesen/acknowledged/resolved |
| `notification_unread_count` | Server→Frontend | NotificationRouter | Ungelesene-Anzahl + höchste Severity |

### Sequence Events

| Event | Richtung | Trigger | Beschreibung |
|-------|----------|---------|--------------|
| `sequence_started` | Server→Frontend | Sequence Start | Sequence-Ausführung beginnt |
| `sequence_step` | Server→Frontend | Step Progress | Einzelner Schritt abgeschlossen |
| `sequence_completed` | Server→Frontend | Sequence Ende | Sequence erfolgreich beendet |
| `sequence_error` | Server→Frontend | Sequence Fehler | Sequence mit Fehler |
| `sequence_cancelled` | Server→Frontend | Sequence Abbruch | Sequence abgebrochen |

### Plugin Events (Phase 4C / F11)

| Event | Richtung | Trigger | Beschreibung |
|-------|----------|---------|--------------|
| `plugin_execution_started` | Server→Frontend | PluginService | Plugin-Ausführung gestartet |
| `plugin_execution_completed` | Server→Frontend | PluginService | Plugin-Ausführung beendet (success/error) |
| `plugin_execution_status` | Server→Frontend (optional) | PluginService/Worker | Laufstatus mit Fortschritt pro `execution_id` (running/partial/success/failed) |

### System Events

| Event | Richtung | Trigger | Beschreibung |
|-------|----------|---------|--------------|
| `system_event` | Server→Frontend | Maintenance | Cleanup, Health-Check, etc. |
| `error_event` | Server→Frontend | ESP Error | Hardware/Config Fehler |
| `events_restored` | Server→Frontend | Backup Restore | Audit-Events wiederhergestellt |
| `contract_mismatch` | Frontend intern | Contract Mapper | Pflichtfeld-/Schema-Mismatch bei WS-Event (Integrationssignal mit Operator-Aktion) |
| `contract_unknown_event` | Frontend intern | Contract Mapper | Unbekannter Event-Typ ausserhalb Contract (Integrationssignal mit Rohkontext) |

---

## 0.1 El Frontend — ESP-Store-Subscription (Hinweis)

Der Pinia **ESP-Store** (`El Frontend/src/stores/esp.ts`) nutzt `useWebSocket` mit **`filters.types`**. Jeder dort per `ws.on('…')` registrierte Typ **muss** in dieser Filterliste stehen; sonst liefert der Subscription-Pfad keine Events an die Handler (trotz Registrierung).

- **Kanonische Typenliste:** `El Frontend/src/stores/esp-websocket-subscription.ts` (`ESP_STORE_WS_ON_HANDLER_TYPES` / `ESP_STORE_WS_SUBSCRIPTION_TYPES`).
- **Mutation-Contract (Frontend):** dieselbe Datei klassifiziert jeden konsumierten Typ explizit auf `replace`/`patch`/`refresh` (`ESP_STORE_WS_MUTATION_CONTRACT`) fuer nachvollziehbare Realtime-Mutationen.
- **Intent-Outcomes (WS):** `intent_outcome` / `intent_outcome_lifecycle` → `El Frontend/src/shared/stores/intentSignals.store.ts` (Zwischenstand vs. Ergebnis, Firmware-`code` getrennt).
- **`esp_health`:** Zusätzliche Felder aus gespreizter Laufzeit-Telemetrie → `runtime_health_view` auf `ESPDevice` via `El Frontend/src/domain/esp/espHealth.ts`.
- **Zone/Subzone-ACK:** optionales `reason_code` (Brückengrund MQTT/Firmware) in Toasts über `El Frontend/src/domain/zone/ackPresentation.ts` (nicht mit Intent-`code` verwechseln).

---

## 1. WebSocket Connection

### 1.1 Verbindungsaufbau

**URL Format:**
```
ws://localhost:8000/api/v1/ws/realtime/{client_id}?token={jwt_token}
```

**Parameter:**
| Parameter | Beschreibung |
|-----------|--------------|
| `client_id` | Eindeutige Client-ID (UUID-like) |
| `token` | JWT Access Token (URL-encoded) |

**Beispiel:**
```typescript
const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
const url = `ws://localhost:8000/api/v1/ws/realtime/${clientId}?token=${encodeURIComponent(token)}`
const ws = new WebSocket(url)
```

### 1.2 Subscription Message (Client → Server)

```json
{
  "action": "subscribe",
  "filters": {
    "types": ["sensor_data", "esp_health"],
    "esp_ids": ["ESP_12AB34CD"],
    "sensor_types": ["temperature", "humidity"]
  }
}
```

### 1.3 Unsubscribe Message (Client → Server)

```json
{
  "action": "unsubscribe",
  "filters": null
}
```

---

## 2. Message Format (Server → Client)

Alle WebSocket-Nachrichten haben folgendes Format:

```json
{
  "type": "event_name",
  "timestamp": 1706787600,
  "correlation_id": "ESP_12AB34CD:data:42:1708704000000",
  "data": {
    ...
  }
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `type` | string | Event-Typ-Identifier |
| `timestamp` | number | Unix Timestamp (Sekunden) |
| `correlation_id` | string? | Optional. MQTT-Pipeline: `{esp_id}:{topic}:{seq}:{ts_ms}`. REST-Pipeline: UUID. Nur vorhanden wenn aus MQTT-Handler oder REST-Context gesendet |
| `data.request_id` | string? | Optional. Request-Trace innerhalb der Event-Payload (derzeit standardisiert fuer `config_response`), kein primaerer Intent-Schluessel |
| `data` | object | Event-spezifische Payload |

**Projection-Konsistenz (Step 3):**
- Contract-kritische Events (`config_response`, `actuator_response`, `error_event`, `esp_diagnostics`, `esp_health`) werden serverseitig über einen gemeinsamen Serializer-Layer erzeugt (`event_contract_serializers`).
- Dadurch sind Feldnamen/Typen zwischen MQTT-Ingest/WebSocket und REST-Aggregation konsistent.
- `esp_health`-`data` kann zusätzliche Firmware-Telemetrie enthalten (z. B. `persistence_degraded`, `network_degraded`, Outbox-Zähler), die in `event_aggregator_service` unter `metadata.runtime_telemetry` gespiegelt werden.

---

## 3. ESP/Device Events

### 3.1 esp_health

ESP Heartbeat/Status Update. Wird bei jedem Heartbeat vom ESP gesendet.

**Trigger:** MQTT Topic `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat`

**Code-Location:** [heartbeat_handler.py:275](El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py#L275)

**Payload:**
```json
{
  "type": "esp_health",
  "timestamp": 1706787600,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "status": "online",
    "last_seen": "2026-02-01T10:23:45Z",
    "uptime": 3600,
    "heap_free": 98304,
    "wifi_rssi": -45,
    "sensor_count": 3,
    "actuator_count": 2,
    "zone_id": "greenhouse",
    "master_zone_id": "main_zone",
    "contract_violation": false,
    "contract_code": null,
    "contract_reason": null,
    "raw_system_state": null,
    "persistence_degraded": false,
    "network_degraded": false,
    "critical_outcome_drop_count": 0,
    "publish_outbox_drop_count": 0
    // gpio_status: optional, nur aus DB-Cache (Firmware ≥ AUT-68 PKG-17 sendet das Array nicht mehr im Live-Heartbeat)
  }
}
```

**Contract-Kontext:**
- `contract_violation`: `true`, wenn kanonische Vorvalidierung für Heartbeat Vertragsabweichungen erkannt hat
- `contract_code`: Aktuell `CONTRACT_UNKNOWN_CODE` bei Unknown-Werten
- `contract_reason`: Detaillierte Vertragsverletzung für Audit/UI
- `raw_system_state`: Originalwert aus Firmware vor Canonicalisierung
- Offline-Varianten (`status="offline"`, z.B. LWT/Timeout) folgen derselben Payload-Struktur und enthalten zusätzlich `reason`, optional `source`, `timeout_seconds`, `actuator_states_reset`.
- Optional (Firmware ab 2026-04, nicht breaking): u. a. `persistence_degraded`, `persistence_degraded_reason`, `runtime_state_degraded`, `mqtt_circuit_breaker_open`, `wifi_circuit_breaker_open`, `network_degraded`, `critical_outcome_drop_count`, `publish_outbox_drop_count`, `persistence_drift_count`, `metrics_schema_version` — ersetzen das ältere paar `degraded`/`degraded_reason`.

---

### 3.1b esp_diagnostics

ESP System-Diagnostics Snapshot. Wird alle 60s vom HealthMonitor gesendet.

**Trigger:** MQTT Topic `kaiser/{kaiser_id}/esp/{esp_id}/system/diagnostics`

**Code-Location:** [diagnostics_handler.py:151](El Servador/god_kaiser_server/src/mqtt/handlers/diagnostics_handler.py#L151)

**Payload:**
```json
{
  "type": "esp_diagnostics",
  "timestamp": 1706787600,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "heap_free": 150000,
    "heap_min_free": 120000,
    "heap_fragmentation": 15,
    "uptime_seconds": 3600,
    "error_count": 3,
    "wifi_rssi": -65,
    "system_state": "OPERATIONAL",
    "boot_reason": "POWERON",
    "mqtt_cb_state": "CLOSED",
    "wdt_mode": "PRODUCTION",
    "wdt_timeouts_24h": 0,
    "contract_violation": false,
    "contract_code": null,
    "contract_reason": null,
    "raw_system_state": null,
    "timestamp": 1735818000
  }
}
```

**Contract-Kontext:**
- `contract_violation`, `contract_code`, `contract_reason`, `raw_system_state` werden bei kanonischer Ingest-Normalisierung mitgesendet
- Payload wird über den Shared-Serializer erstellt (identisches Feldschema in WS und REST-Projektionen).

---

### 3.1c esp_reconnect_phase

Reconnect-Handover-Phase fuer deterministische State-Uebernahme ohne Flackern.

**Trigger:** Heartbeat-Reconnect-Flow (`ADOPTING -> ADOPTED -> DELTA_ENFORCED`)

**Code-Location:** [heartbeat_handler.py:1357](El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py#L1357)

**Payload:**
```json
{
  "type": "esp_reconnect_phase",
  "timestamp": 1706787600,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "phase": "adopting",
    "offline_seconds": 122.4
  }
}
```

**phase Values:**
- `adopting`: Reconnect erkannt, Device-Istzustand wird gesammelt
- `adopted`: Adoption abgeschlossen, Enforce-Gate geoeffnet
- `delta_enforced`: Delta-Vergleich/Evaluation abgeschlossen

---

### 3.2 device_discovered

Neues unbekanntes ESP-Gerät entdeckt (Pending Device).

**Trigger:** Heartbeat von unbekanntem ESP

**Code-Locations:**
- [heartbeat_handler.py:556](El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py#L556)
- [debug.py:319](El Servador/god_kaiser_server/src/api/v1/debug.py#L319)

**Payload:**
```json
{
  "type": "device_discovered",
  "timestamp": 1706787600,
  "data": {
    "esp_id": "ESP_NEW_DEVICE",
    "device_id": "ESP_NEW_DEVICE",
    "discovered_at": "2026-02-01T10:23:45Z",
    "last_seen": "2026-02-01T10:23:45Z",
    "zone_id": "zone_main",
    "heap_free": 245760,
    "wifi_rssi": -55,
    "sensor_count": 3,
    "actuator_count": 2,
    "hardware_type": "ESP32_WROOM",
    "ip_address": "192.168.1.100"
  }
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `esp_id` | string | ESP device ID |
| `device_id` | string | Gleich wie esp_id (Frontend-Kompatibilität) |
| `discovered_at` | ISO 8601 | Zeitpunkt der Erstentdeckung |
| `last_seen` | ISO 8601 | Letzte Aktivität (initial = discovered_at) |
| `zone_id` | string? | Zone aus Heartbeat |
| `heap_free` | int? | Freier Heap in Bytes |
| `wifi_rssi` | int? | WiFi-Signalstärke in dBm |
| `sensor_count` | int | Anzahl aktiver Sensoren |
| `actuator_count` | int | Anzahl aktiver Aktoren |
| `hardware_type` | string | Hardware-Typ (z.B. ESP32_WROOM) |
| `ip_address` | string? | IP-Adresse aus wifi_ip (falls ESP sie sendet) |

---

### 3.3 device_rediscovered

Bekanntes ESP-Gerät kommt zurück (zwei Fälle):

1. **Rejected → Pending:** Abgelehntes Gerät sendet nach Cooldown wieder Heartbeat → wird erneut pending_approval
2. **Offline → Online:** (falls Frontend bereits approved-Device in Liste hatte) Device kommt wieder online

**Trigger:** Heartbeat von bekanntem, zuvor rejected ESP (nach Cooldown) oder offline ESP

**Code-Location:** [heartbeat_handler.py:614](El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py#L614)

**Payload:**
```json
{
  "type": "device_rediscovered",
  "timestamp": 1706787600,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "device_id": "ESP_12AB34CD",
    "rediscovered_at": "2026-02-01T10:23:45Z",
    "zone_id": "greenhouse",
    "ip_address": "192.168.1.100"
  }
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `esp_id` | string | ESP device ID |
| `device_id` | string | Gleich wie esp_id |
| `rediscovered_at` | ISO 8601 | Zeitpunkt der Wiederentdeckung |
| `zone_id` | string? | Zone aus Heartbeat |
| `ip_address` | string? | IP aus wifi_ip (falls ESP sendet) |

---

### 3.4 device_approved

ESP-Gerät wurde durch Admin genehmigt.

**Trigger:** `POST /esp/devices/{esp_id}/approve`

**Code-Location:** [esp.py:1230](El Servador/god_kaiser_server/src/api/v1/esp.py#L1230)

**Payload:**
```json
{
  "type": "device_approved",
  "timestamp": 1706787600,
  "data": {
    "device_id": "ESP_NEW_DEVICE",
    "approved_by": "admin",
    "zone_id": "greenhouse",
    "zone_name": "Gewächshaus"
  }
}
```

---

### 3.5 device_rejected

ESP-Gerät wurde durch Admin abgelehnt.

**Trigger:** `POST /esp/devices/{esp_id}/reject`

**Code-Location:** [esp.py:1333](El Servador/god_kaiser_server/src/api/v1/esp.py#L1333)

**Payload:**
```json
{
  "type": "device_rejected",
  "timestamp": 1706787600,
  "data": {
    "device_id": "ESP_NEW_DEVICE",
    "rejected_by": "admin",
    "reason": "Unknown device"
  }
}
```

---

## 4. Sensor Events

### 4.1 sensor_data

Neuer Sensor-Wert empfangen.

**Trigger:** MQTT Topic `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data`

**Code-Locations:**
- [sensor_handler.py:297](El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py#L297)
- [websocket_utils.py:49](El Servador/god_kaiser_server/src/mqtt/websocket_utils.py#L49)

**Payload:**
```json
{
  "type": "sensor_data",
  "timestamp": 1706787600,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "gpio": 4,
    "sensor_type": "DS18B20",
    "raw_value": 2150,
    "processed_value": 21.5,
    "unit": "°C",
    "quality": "good",
    "timestamp": "2026-02-01T10:23:45Z",
    "zone_id": "greenhouse",
    "subzone_id": "zone_a",
    "config_id": "550e8400-e29b-41d4-a716-446655440000",
    "i2c_address": 68,
    "onewire_address": "28FF123456780000"
  }
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `zone_id` | string? | Zone zum Messzeitpunkt (Phase 0.1) |
| `subzone_id` | string? | Subzone zum Messzeitpunkt (Phase 0.1) |
| `config_id` | string? | Sensor-Config UUID für address-based GPIO-Matching (R20-P3) |
| `i2c_address` | number? | I2C-Adresse als Dezimalzahl (nur I2C-Sensoren: SHT31, BME280) |
| `onewire_address` | string? | OneWire-ROM-Adresse als Hex-String (nur DS18B20) |

---

### 4.2 sensor_health

Sensor Health/Maintenance Update (Timeout, Recovery).

**Trigger:** Maintenance Job `sensor_health_check`

**Code-Locations:**
- [sensor_health.py:356](El Servador/god_kaiser_server/src/services/maintenance/jobs/sensor_health.py#L356)
- [websocket_utils.py:108](El Servador/god_kaiser_server/src/mqtt/websocket_utils.py#L108)

**Payload:**
```json
{
  "type": "sensor_health",
  "timestamp": 1706787600,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "gpio": 4,
    "sensor_type": "DS18B20",
    "health_status": "timeout",
    "last_reading": "2026-02-01T10:00:00Z",
    "reading_count": 1440,
    "error_count": 5,
    "avg_quality": "good"
  }
}
```

**health_status Values:**
- `healthy`: Sensor funktioniert normal
- `warning`: Erhöhte Fehlerrate
- `critical`: Sensor ausgefallen
- `timeout`: Keine neuen Daten
- `recovered`: Sensor wieder online

---

### 4.3 sensor_config_deleted

Sensor-Konfiguration wurde gelöscht (T08-Fix-D Ghost-Cleanup).

**Trigger:** `DELETE /api/v1/sensors/{esp_id}/{config_id}`

**Code-Location:** [sensors.py:1000](El Servador/god_kaiser_server/src/api/v1/sensors.py#L1000)

**Payload:**
```json
{
  "type": "sensor_config_deleted",
  "timestamp": 1706787600,
  "data": {
    "config_id": "550e8400-e29b-41d4-a716-446655440000",
    "esp_id": "ESP_MOCK_E92BAA",
    "gpio": 4,
    "sensor_type": "ds18b20"
  }
}
```

**Frontend-Handler:** `esp.ts → handleSensorConfigDeleted` — entfernt Ghost-Sensor aus `device.sensors` per `gpio + sensor_type` Match, zeigt Toast. Wird fuer Mock UND Real ESPs ausgeloest (T10-Fix-B: unified DELETE-Pipeline per config_id UUID).

---

## 5. Actuator Events

### 5.1 actuator_status

Actuator Status Update (nach State-Änderung).

**Trigger:** MQTT Topic `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status`
Event-Push-Pattern: ESP32 publiziert NUR bei State-Change (kein periodisches Full-Dump mehr — siehe AUT-68 PKG-17).

**Rate-Limit:** Bypass-aktiv — wird NICHT durch das 10 msg/sec-Limit gedropt (kritischer GPIO-State darf nie verloren gehen, siehe Sektion 15).

**Code-Location:** [actuator_handler.py:228](El Servador/god_kaiser_server/src/mqtt/handlers/actuator_handler.py#L228)

**Payload:**
```json
{
  "type": "actuator_status",
  "timestamp": 1706787600,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "gpio": 5,
    "actuator_type": "digital",
    "hardware_type": "pump",
    "state": true,
    "pwm_value": 0,
    "runtime_ms": 3600000,
    "emergency": "normal",
    "timestamp": "2026-02-01T10:23:45Z"
  }
}
```

**Felder:**
- `actuator_type`: Server-normalisierter Typ (`"digital"`, `"pwm"`, `"servo"`) — konsistent mit `actuator_configs.actuator_type`
- `hardware_type`: Original-ESP32-Typ (`"relay"`, `"pump"`, `"valve"`, `"pwm"`) — aus `actuator_configs.hardware_type`, für Icon-Mapping im Frontend

**emergency Values:**
- `normal`: Normalbetrieb
- `active`: Emergency-Stop aktiv
- `clearing`: Emergency wird gelöscht
- `resuming`: Schrittweise Reaktivierung

---

### 5.2 actuator_command

Actuator Command erfolgreich gesendet.

**Trigger:** `ActuatorService.send_command()` erfolgreich

**Code-Location:** [actuator_service.py:255](El Servador/god_kaiser_server/src/services/actuator_service.py#L255)

**Payload:**
```json
{
  "type": "actuator_command",
  "timestamp": 1706787600,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "gpio": 5,
    "command": "ON",
    "value": 1.0,
    "issued_by": "admin",
    "correlation_id": "cmd_12345"
  }
}
```

---

### 5.3 actuator_command_failed

Actuator Command fehlgeschlagen (Safety-Check oder MQTT-Fehler).

**Trigger:** `ActuatorService.send_command()` fehlgeschlagen

**Code-Locations:**
- [actuator_service.py:127](El Servador/god_kaiser_server/src/services/actuator_service.py#L127)
- [actuator_service.py:210](El Servador/god_kaiser_server/src/services/actuator_service.py#L210)

**Payload:**
```json
{
  "type": "actuator_command_failed",
  "timestamp": 1706787600,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "gpio": 5,
    "command": "ON",
    "value": 1.0,
    "error": "Safety check failed: Emergency stop active",
    "issued_by": "admin",
    "correlation_id": "cmd_12345"
  }
}
```

---

### 5.4 actuator_response

ESP32 bestätigt Command-Ausführung.

**Trigger:** MQTT Topic `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/response`

**Code-Location:** [actuator_response_handler.py:168](El Servador/god_kaiser_server/src/mqtt/handlers/actuator_response_handler.py#L168)

**Payload:**
```json
{
  "type": "actuator_response",
  "timestamp": 1706787600,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "gpio": 5,
    "command": "ON",
    "value": 1.0,
    "success": true,
    "message": "Command executed",
    "timestamp": 1735818000,
    "correlation_id": "cmd_abc123",
    "code": "ACTUATOR_COMMAND_APPLIED",
    "domain": "actuator",
    "severity": "info",
    "terminality": "terminal_success",
    "retry_policy": "forbidden",
    "is_final": true,
    "contract_violation": false,
    "raw_esp_id": "ESP_12AB34CD",
    "raw_gpio": 5,
    "raw_success": true
  }
}
```

**Contract-Hinweise:**
- Ingest ist canonical-first: Topic (`esp_id`, `gpio`) ist autoritativ; Payload-Mismatches werden als `contract_violation` sichtbar.
- Unbekannte/inkonsistente Vertragswerte werden serverseitig auf `code="CONTRACT_UNKNOWN_CODE"` normalisiert (kein stiller Fallback).
- Fehlende `correlation_id` wird robust ersetzt (`missing-corr:act:...`) und als Vertragsproblem markiert.
- WS-Projektion nutzt denselben Shared-Serializer wie die REST-Aggregations-Projektion.

---

### 5.5 actuator_alert

Actuator Alert (Emergency-Stop, Timeout, Fehler).

**Trigger:** MQTT Topic `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/alert`

**Code-Locations:**
- [actuator_alert_handler.py:189](El Servador/god_kaiser_server/src/mqtt/handlers/actuator_alert_handler.py#L189)
- [actuators.py (emergency_stop → actuator_alert)](El Servador/god_kaiser_server/src/api/v1/actuators.py)

**Payload:**
```json
{
  "type": "actuator_alert",
  "timestamp": 1706787600,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "gpio": 5,
    "alert_type": "emergency_stop",
    "message": "Actuator stopped by user request",
    "severity": "critical",
    "timestamp": "2026-02-01T10:23:45Z"
  }
}
```

**API-Not-Aus (`POST /v1/actuators/emergency_stop`):** `data` enthält zusätzlich u.a. `incident_correlation_id`, `devices_stopped`, `actuators_stopped`, `issued_by`, optional `reason`. Dieselbe `incident_correlation_id` steht in der REST-Antwort (`EmergencyStopResponse`). Die zugehörigen MQTT-GPIO-Commands nutzen eine **eigene** pro-Pin-`correlation_id` (Format siehe `MQTT_TOPICS.md` §2.1); sie ist aus `incident_correlation_id` ableitbar, aber nicht identisch mit dem WS-Feld allein. Dieselbe GPIO-Zeichenkette liegt in `actuator_history.command_metadata` (`correlation_id` / `mqtt_correlation_id`); Überblick `El Servador/god_kaiser_server/docs/emergency-stop-mqtt-correlation.md`.

**alert_type Values:**
- `emergency_stop`: Actuator notgestoppt
- `config_invalid`: Ungültige Konfiguration
- `runtime_protection`: Runtime-Schutz aktiviert
- `overrun`: Max-Laufzeit überschritten
- `fault`: Hardware-Fehler
- `verification_failed`: Safety-Verification fehlgeschlagen

---

## 6. Config Events

### 6.1 config_response

Config ACK vom ESP nach Config-Update.

**Trigger:** MQTT Topic `kaiser/{kaiser_id}/esp/{esp_id}/config_response`

**Code-Location:** [config_handler.py:254](El Servador/god_kaiser_server/src/mqtt/handlers/config_handler.py#L254)

**Payload:**
```json
{
  "type": "config_response",
  "timestamp": 1706787600,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "config_type": "sensor",
    "status": "partial_success",
    "count": 2,
    "failed_count": 1,
    "message": "2 configured, 1 failed",
    "timestamp": 1735818000,
    "correlation_id": "cfg_abc123",
    "request_id": "req_42",
    "error_code": "GPIO_CONFLICT",
    "error_description": "Der GPIO-Pin wird bereits von einem anderen Sensor oder Aktor verwendet",
    "failures": [
      {
        "type": "sensor",
        "gpio": 5,
        "error": "GPIO_CONFLICT",
        "detail": "Reserved"
      }
    ],
    "domain": "config.sensor",
    "severity": "warning",
    "terminality": "terminal_failure",
    "retry_policy": "allowed",
    "is_final": true,
    "contract_violation": false,
    "raw_status": "partial_success",
    "raw_type": "sensor",
    "raw_error_code": "GPIO_CONFLICT"
  }
}
```

**Contract-Hinweise:**
- Ingest ist canonical-first: Status/Typ/Error-Codes werden vor Handler-Logik kanonisiert.
- Legacy-Aliase (`failed` -> `error`, `config_type` -> `type`) bleiben kompatibel.
- Unbekannte Vertragswerte werden auf `CONTRACT_UNKNOWN_CODE` normalisiert und mit `raw_*` Feldern auditierbar gemacht.
- Fehlende `correlation_id` wird robust ergänzt (`missing-corr:cfg:...`) und als Vertragsproblem markiert.
- Frontend behandelt terminale Config-Events ohne verwertbare `data.correlation_id` als `contract_mismatch`; betroffene Config-Intents bleiben pending (kein heuristisches Latest-Pending-Fallback).
- WS-Projektion nutzt denselben Shared-Serializer wie die REST-Aggregations-Projektion.
- `request_id` wird bei `config_response` optional in `data` projiziert (Trace-Kontext), Frontend-Zuordnung bleibt primär `data.correlation_id`.

---

### 6.2 config_published

Config erfolgreich an ESP gepublished.

**Trigger:** `ESPService.publish_config()`

**Code-Location:** [esp_service.py:485](El Servador/god_kaiser_server/src/services/esp_service.py#L485)

**Payload:**
```json
{
  "type": "config_published",
  "timestamp": 1706787600,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "config_keys": ["sensors", "actuators"],
    "correlation_id": "cfg_12345"
  }
}
```

**Contract-Hinweise:**
- `data.correlation_id` ist der primaere Intent-Schluessel fuer Frontend-Lifecycle-Mapping.
- `request_id` ist in `data` aktuell optional/nicht standardisiert und darf nicht als Ersatz fuer fehlende `correlation_id` verwendet werden.

---

### 6.3 config_failed

Config Publishing fehlgeschlagen.

**Trigger:** `ESPService.publish_config()` Fehler

**Code-Location:** [esp_service.py:522](El Servador/god_kaiser_server/src/services/esp_service.py#L522)

**Payload:**
```json
{
  "type": "config_failed",
  "timestamp": 1706787600,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "config_keys": ["sensors"],
    "error": "MQTT publish failed",
    "correlation_id": "cfg_12345"
  }
}
```

**Contract-Hinweise:**
- Terminale Zuordnung im Frontend erfolgt primaer ueber `data.correlation_id`.
- Falls `data.correlation_id` fehlt, ist das ein Integrationssignal (Contract-Drift), kein sauber korrelierbarer Normalfall.
- Kein heuristisches Finalisieren: ohne eindeutige Korrelation darf kein fremdes/offenes Config-Intent terminalisiert werden.

---

### 6.4 intent_outcome

Kanonisches Intent/Outcome-Event aus dem MQTT-Ingest.

**Trigger:** MQTT Topic `kaiser/{kaiser_id}/esp/{esp_id}/system/intent_outcome`

**Code-Location:** `intent_outcome_handler.py`

**Payload:**
```json
{
  "type": "intent_outcome",
  "timestamp": 1706787600,
  "correlation_id": "corr_171217_9",
  "data": {
    "esp_id": "ESP_12AB34CD",
    "intent_id": "act_171217_1",
    "correlation_id": "corr_171217_9",
    "flow": "command",
    "outcome": "persisted",
    "contract_version": 2,
    "semantic_mode": "target",
    "legacy_status": "success",
    "target_status": "persisted",
    "is_final": true,
    "code": "COMMAND_APPLIED",
    "reason": "Actuator command executed",
    "retryable": false,
    "generation": 3,
    "seq": 42,
    "epoch": 7,
    "ttl_ms": 10000,
    "ts": 1735818000,
    "first_seen_at": "2026-04-04T08:00:00+00:00",
    "terminal_at": "2026-04-04T08:00:01+00:00",
    "domain": "command",
    "severity": "info",
    "terminality": "terminal_success",
    "retry_policy": "forbidden",
    "contract_violation": false,
    "raw_flow": "command",
    "raw_outcome": "success",
    "reconciliation": {
      "session_id": "recon-0123abcd4567",
      "phase": "progress",
      "position": 4,
      "total": 12,
      "started_at": 1735818000
    }
  }
}
```

**outcome Values:** `accepted`, `rejected`, `applied`, `persisted`, `failed`, `expired`
**Parität API/WS:** `data` entspricht dem kanonischen Serializer aus `/v1/intent-outcomes` plus WS-spezifischen Feldern (`domain`, `severity`, `terminality`, `retry_policy`, `contract_violation`, `raw_*`, `reconciliation`).
**Dedup / stale:** Wiederholtes MQTT-`intent_outcome` mit verworfenem Outcome (Finalitäts-/Seq-Guard) löst **keinen** zweiten WS-Broadcast aus (MQTT wird trotzdem ACK’d); siehe Modul-Docstring `intent_outcome_handler.py`.
**Intent-Metadaten:** optional zusätzlich unter `data.*` verschachtelt (Server merged vor Canonicalisierung).

---

### 6.5 intent_outcome_lifecycle

CONFIG_PENDING-Transitions (nicht kanonisches `intent_outcome`-JSON).

**Trigger:** MQTT Topic `kaiser/{kaiser_id}/esp/{esp_id}/system/intent_outcome/lifecycle`

**Code-Location:** `intent_outcome_lifecycle_handler.py`

**Payload:**
```json
{
  "type": "intent_outcome_lifecycle",
  "timestamp": 1706787600,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "schema": "config_pending_lifecycle_v1",
    "event_type": "exited_config_pending",
    "reason_code": "CONFIG_PENDING_EXIT_READY",
    "boot_sequence_id": "boot-seq-001",
    "ts": 1735818000
  }
}
```

**Hinweis:** Vollständiges MQTT-Payload-Schema siehe `El Trabajante/docs/runtime-readiness-policy.md`; Server persistiert u. a. in `audit_logs` (`event_type=intent_outcome_lifecycle`).

---

## 7. Zone Events

### 7.1 zone_assignment

Zone Assignment ACK vom ESP.

**Trigger:** MQTT Topic `kaiser/{kaiser_id}/esp/{esp_id}/zone/ack`

**Code-Location:** [zone_ack_handler.py:265](El Servador/god_kaiser_server/src/mqtt/handlers/zone_ack_handler.py#L265)

**Payload:**
```json
{
  "type": "zone_assignment",
  "timestamp": 1706787600,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "status": "zone_assigned",
    "zone_id": "greenhouse",
    "master_zone_id": "main_zone",
    "zone_name": "Gewächshaus",
    "kaiser_id": "god",
    "timestamp": 1706787600,
    "message": "",
    "reason_code": "CONFIG_LANE_BUSY"
  }
}
```

**status Values:**
- `zone_assigned`: Zone erfolgreich zugewiesen
- `zone_removed`: Zone entfernt
- `error`: Zuweisung fehlgeschlagen (message enthält Fehlergrund)

**reason_code:** Optional, stabiler String von der Firmware (z. B. `CONFIG_LANE_BUSY`, `JSON_PARSE_ERROR`).

---

### 7.2 subzone_assignment

Subzone Assignment ACK vom ESP.

**Trigger:** MQTT Topic `kaiser/{kaiser_id}/esp/{esp_id}/subzone/ack`

**Code-Location:** [subzone_ack_handler.py:149](El Servador/god_kaiser_server/src/mqtt/handlers/subzone_ack_handler.py#L149)

**Payload:**
```json
{
  "type": "subzone_assignment",
  "timestamp": 1706787600,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "subzone_id": "zone_a",
    "status": "subzone_assigned",
    "timestamp": 1706787600,
    "error_code": null,
    "message": "",
    "reason_code": "CONFIG_LANE_BUSY"
  }
}
```

**status Values:**
- `subzone_assigned`: Subzone erfolgreich zugewiesen
- `subzone_removed`: Subzone entfernt
- `error`: Zuweisung/Entfernung fehlgeschlagen

**error_code:** Optional, nur bei status="error"
**message:** Optional, nur bei status="error"
**reason_code:** Optional, stabiler String (z. B. `CONFIG_LANE_BUSY`, `JSON_PARSE_ERROR`, `SUBZONE_NOT_FOUND`)

---

### 7.3 device_context_changed (T13-R2)

Aktiver Zone-Kontext eines Sensors oder Aktors wurde geändert. Ermöglicht Multi-Zone und Mobile Device Scopes.

**Trigger:** `PUT /v1/device-context/{config_type}/{config_id}` oder `DELETE /v1/device-context/{config_type}/{config_id}`

**Code-Location:** `src/api/v1/device_context.py`

**Payload:**
```json
{
  "type": "device_context_changed",
  "timestamp": 1706787600,
  "data": {
    "config_type": "sensor",
    "config_id": "550e8400-e29b-41d4-a716-446655440000",
    "active_zone_id": "greenhouse_b",
    "active_subzone_id": "shelf_1",
    "context_source": "multi_zone",
    "changed_by": "admin"
  }
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `config_type` | string | `sensor` oder `actuator` |
| `config_id` | UUID string | ID der SensorConfig oder ActuatorConfig |
| `active_zone_id` | string? | Aktive Zone (null wenn gelöscht → zone_local Fallback) |
| `active_subzone_id` | string? | Aktive Subzone (optional) |
| `context_source` | string | `zone_local`, `multi_zone` oder `mobile` |
| `changed_by` | string | Username des auslösenden Users |

**context_source Values:**
- `zone_local`: Default — feste Zone des ESP (kein Eintrag in `device_active_context`)
- `multi_zone`: Sensor/Aktor wird in mehrerer Zonen genutzt — aktive Zone manuell gesetzt
- `mobile`: Gerät wechselt physisch Zonen — aktive Zone dynamisch nachgeführt

---

### 7.4 device_scope_changed (T13-R2)

Device Scope oder Assigned Zones eines Sensors/Aktors wurde beim Update geändert.

**Trigger:** `PUT /api/v1/sensors/{esp_id}/{config_id}` oder `PUT /api/v1/actuators/{esp_id}/{actuator_id}` wenn `device_scope` oder `assigned_zones` sich ändern

**Code-Locations:**
- [sensors.py:959](El Servador/god_kaiser_server/src/api/v1/sensors.py#L959)
- [actuators.py:579](El Servador/god_kaiser_server/src/api/v1/actuators.py#L579)

**Payload:**
```json
{
  "type": "device_scope_changed",
  "timestamp": 1706787600,
  "data": {
    "config_type": "sensor",
    "config_id": "550e8400-e29b-41d4-a716-446655440000",
    "device_scope": "multi_zone",
    "assigned_zones": ["greenhouse_a", "greenhouse_b"]
  }
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `config_type` | string | `sensor` oder `actuator` |
| `config_id` | UUID string | ID der SensorConfig oder ActuatorConfig |
| `device_scope` | string | `zone_local`, `multi_zone` oder `mobile` |
| `assigned_zones` | string[] | Liste der zugewiesenen Zone-IDs (leer bei `zone_local`) |

---

## 8. Logic/Automation Events

### 8.1 logic_execution

Automation Rule wurde ausgeführt. Wird pro Action einmal gesendet.

**Trigger:** `LogicEngine._execute_actions()` nach erfolgreicher Condition-Evaluation

**Code-Location:** [logic_engine.py:636](El Servador/god_kaiser_server/src/services/logic_engine.py#L636)

**Payload:**
```json
{
  "type": "logic_execution",
  "timestamp": 1706787600,
  "data": {
    "rule_id": "uuid-string",
    "rule_name": "Auto-Irrigation",
    "trigger": {
      "esp_id": "ESP_12AB34CD",
      "gpio": 4,
      "sensor_type": "temperature",
      "value": 31.5,
      "timestamp": 1706787600
    },
    "action": {
      "type": "actuator_command",
      "esp_id": "ESP_AABBCCDD",
      "gpio": 5,
      "command": "ON",
      "value": 1.0
    },
    "success": true,
    "message": "Actuator command sent successfully",
    "timestamp": 1706787600
  }
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `rule_id` | string | Rule UUID als String |
| `rule_name` | string | Name der ausgeführten Rule |
| `trigger` | object | Trigger-Daten (Sensor-Werte die die Rule ausgelöst haben) |
| `action` | object | Ausgeführte Action (komplett) |
| `success` | bool | Ob die Action erfolgreich war |
| `message` | string | Ergebnis-Nachricht vom Action-Executor |
| `timestamp` | number | Unix Timestamp des Triggers |

> **Hinweis:** Bei Rules mit mehreren Actions wird pro Action ein separates `logic_execution` Event gesendet.
> Die WebSocket-Broadcast ist non-critical — Fehler beim Senden unterbrechen NICHT die Rule-Execution.

---

### 8.2 notification

Notification von Automation Rule.

**Trigger:** `NotificationAction` in Rule ausgeführt (Legacy-Pfad)

**Code-Location:** [notification_executor.py:134](El Servador/god_kaiser_server/src/services/logic/actions/notification_executor.py#L134)

**Status:** **Deprecated** (Sunset: **2026-07-03**). Aktive produktive Notifications laufen ueber `notification_new`/`notification_updated`/`notification_unread_count` via `NotificationRouter`.

**Payload:**
```json
{
  "type": "notification",
  "timestamp": 1706787600,
  "data": {
    "title": "Temperatur-Warnung",
    "message": "Temperatur über 30°C in Gewächshaus",
    "priority": "high",
    "rule_id": "1",
    "rule_name": "Temp-Alert"
  }
}
```

---

### 8.3 notification_new

Neue DB-persistierte Notification. Wird vom NotificationRouter nach jeder Notification-Erstellung gesendet.

**Trigger:** `NotificationRouter.route()` nach DB-Insert

**Code-Location:** [notification_router.py:218](El Servador/god_kaiser_server/src/services/notification_router.py#L218)

**Payload:**
```json
{
  "type": "notification_new",
  "timestamp": 1706787600,
  "data": {
    "id": "uuid-string",
    "user_id": 1,
    "channel": "websocket",
    "severity": "warning",
    "category": "data_quality",
    "title": "Sensor-Timeout: DS18B20",
    "body": "Sensor auf GPIO 4 hat seit 5 Minuten keine Daten gesendet",
    "metadata": {
      "esp_id": "ESP_12AB34CD",
      "gpio": 4,
      "sensor_type": "DS18B20"
    },
    "source": "sensor_threshold",
    "is_read": false,
    "created_at": "2026-02-01T10:23:45Z"
  }
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | UUID string | Notification Primary Key |
| `severity` | string | `critical`, `warning`, `info` |
| `category` | string | `connectivity`, `data_quality`, `infrastructure`, `lifecycle`, `maintenance`, `security`, `system` |
| `source` | string | `grafana`, `logic_engine`, `mqtt_handler`, `sensor_threshold`, `device_event`, `autoops`, `manual`, `system` |
| `metadata` | object | Context-spezifisch (esp_id, gpio, rule_id, grafana_uid, etc.) |

> **Event-Routing:** `notification_new` → `notification-inbox.store` (persistente Inbox). Legacy `notification` sollte nur noch fuer Rueckwaertskompatibilitaet behandelt werden.

---

### 8.4 notification_updated

Bestehende Notification wurde aktualisiert (gelesen, acknowledged, resolved).

**Trigger:** `NotificationRouter` nach mark-as-read, acknowledge oder resolve

**Code-Location:** [notification_router.py:357](El Servador/god_kaiser_server/src/services/notification_router.py#L357)

**Payload:**
```json
{
  "type": "notification_updated",
  "timestamp": 1706787600,
  "data": {
    "id": "uuid-string",
    "user_id": 1,
    "is_read": true,
    "is_archived": false,
    "read_at": "2026-02-01T10:30:00Z",
    "status": "acknowledged",
    "acknowledged_at": "2026-02-01T10:30:00Z",
    "acknowledged_by": 1,
    "resolved_at": null
  }
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | UUID string | Notification Primary Key |
| `user_id` | int | User ID des Besitzers |
| `is_read` | bool | Gelesen-Status |
| `is_archived` | bool | Archiviert-Status |
| `read_at` | ISO 8601? | Zeitpunkt des Lesens |
| `status` | string | ISA-18.2 Alert-Status: `active`, `acknowledged`, `resolved` (Phase 4B) |
| `acknowledged_at` | ISO 8601? | Zeitpunkt der Quittierung (Phase 4B) |
| `acknowledged_by` | int? | User ID des Quittierenden (Phase 4B) |
| `resolved_at` | ISO 8601? | Zeitpunkt der Auflösung (Phase 4B) |

---

### 8.5 notification_unread_count

Autoritativer Badge-Zähler vom Server. Wird nach jeder Zustandsänderung gesendet.

**Trigger:** `NotificationRouter` nach read/archive/new

**Code-Location:** [notification_router.py:260](El Servador/god_kaiser_server/src/services/notification_router.py#L260)

**Payload:**
```json
{
  "type": "notification_unread_count",
  "timestamp": 1706787600,
  "data": {
    "unread_count": 5,
    "highest_severity": "warning"
  }
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `unread_count` | int | Anzahl ungelesener Notifications |
| `highest_severity` | string? | Höchste Severity unter ungelesenen (`critical` > `warning` > `info`), null wenn 0 ungelesen |

---

## 9. Sequence Events

### 9.1 sequence_started

Sequence-Ausführung beginnt.

**Trigger:** `SequenceExecutor.execute()`

**Code-Location:** [sequence_executor.py:347](El Servador/god_kaiser_server/src/services/logic/actions/sequence_executor.py#L347)

**Payload:**
```json
{
  "type": "sequence_started",
  "timestamp": 1706787600,
  "data": {
    "sequence_id": "seq_12345",
    "rule_id": "1",
    "rule_name": "Irrigation-Sequence",
    "total_steps": 5,
    "description": "Automated irrigation cycle"
  }
}
```

---

### 9.2 sequence_step

Einzelner Sequence-Schritt abgeschlossen.

**Trigger:** Jeder Step in der Sequence

**Code-Locations:**
- [sequence_executor.py:506](El Servador/god_kaiser_server/src/services/logic/actions/sequence_executor.py#L506)
- [sequence_executor.py:582](El Servador/god_kaiser_server/src/services/logic/actions/sequence_executor.py#L582)

**Payload:**
```json
{
  "type": "sequence_step",
  "timestamp": 1706787600,
  "data": {
    "sequence_id": "seq_12345",
    "step": 2,
    "step_name": "Turn on pump",
    "total_steps": 5,
    "progress_percent": 40,
    "status": "completed"
  }
}
```

---

### 9.3 sequence_completed

Sequence erfolgreich beendet.

**Code-Location:** [sequence_executor.py:683](El Servador/god_kaiser_server/src/services/logic/actions/sequence_executor.py#L683)

**Payload:**
```json
{
  "type": "sequence_completed",
  "timestamp": 1706787600,
  "data": {
    "sequence_id": "seq_12345",
    "status": "completed",
    "success": true,
    "duration_seconds": 120,
    "steps_completed": 5,
    "steps_failed": 0
  }
}
```

---

### 9.4 sequence_error

Sequence mit Fehler.

**Code-Locations:**
- [sequence_executor.py:643](El Servador/god_kaiser_server/src/services/logic/actions/sequence_executor.py#L643)
- [sequence_executor.py:670](El Servador/god_kaiser_server/src/services/logic/actions/sequence_executor.py#L670)

**Payload:**
```json
{
  "type": "sequence_error",
  "timestamp": 1706787600,
  "data": {
    "sequence_id": "seq_12345",
    "error_code": "ACTUATOR_TIMEOUT",
    "message": "Pump did not respond within timeout"
  }
}
```

---

### 9.5 sequence_cancelled

Sequence abgebrochen.

**Trigger:** `POST /sequences/{sequence_id}/cancel`

**Code-Location:** [sequence_executor.py:659](El Servador/god_kaiser_server/src/services/logic/actions/sequence_executor.py#L659)

**Payload:**
```json
{
  "type": "sequence_cancelled",
  "timestamp": 1706787600,
  "data": {
    "sequence_id": "seq_12345",
    "reason": "User cancelled"
  }
}
```

---

## 10. Plugin Events (Phase 4C / F11)

### 10.1 plugin_execution_started

Plugin-Ausführung gestartet.

**Trigger:** `PluginService.execute_plugin()` vor Plugin-Ausführung

**Code-Location:** [plugin_service.py:197](El Servador/god_kaiser_server/src/services/plugin_service.py#L197)

**Payload:**
```json
{
  "type": "plugin_execution_started",
  "data": {
    "execution_id": "uuid-string",
    "plugin_id": "health_check",
    "trigger_source": "manual"
  }
}
```

---

### 10.2 plugin_execution_completed

Plugin-Ausführung beendet (success oder error).

**Trigger:** `PluginService.execute_plugin()` nach Abschluss

**Code-Location:** [plugin_service.py:331](El Servador/god_kaiser_server/src/services/plugin_service.py#L331)

**Payload:**
```json
{
  "type": "plugin_execution_completed",
  "data": {
    "execution_id": "uuid-string",
    "plugin_id": "health_check",
    "status": "success",
    "duration_seconds": 2.5,
    "error_message": null
  }
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `execution_id` | string | UUID der Execution |
| `plugin_id` | string | Plugin-ID |
| `status` | string | `success` oder `error` |
| `duration_seconds` | float | Ausführungsdauer |
| `error_message` | string? | Fehlermeldung bei status=error |

---

### 10.3 plugin_execution_status (optional)

Optionaler Live-Statuskanal pro `execution_id`. Falls nicht vorhanden, nutzt das Frontend weiterhin `plugin_execution_started` + `plugin_execution_completed` als kompatiblen Fallback.

**Payload (minimales Contract-Set):**
```json
{
  "type": "plugin_execution_status",
  "data": {
    "execution_id": "uuid-string",
    "plugin_id": "health_check",
    "status": "running",
    "message": "Step 2/5",
    "started_at": "2026-04-06T09:00:00Z",
    "updated_at": "2026-04-06T09:00:05Z",
    "finished_at": null,
    "progress_percent": 40,
    "step": "collect_metrics",
    "error_code": null,
    "error_message": null,
    "correlation_id": "corr_123"
  }
}
```

**Frontend-Lifecycle-Mapping (F11):**
- `initiated`: Execute-Request versendet, noch kein Running-ACK
- `running`: Status `running`/`started`
- `partial`: Status `partial`
- `success`: terminal erfolgreich
- `failed`: terminal fehlgeschlagen (`error`/`failed`/`timeout`/`cancelled`)

**Timeout-Guard (Frontend):**
- Bleibt eine Ausführung nach `initiated` ohne Running-Bestätigung, wird sie lokal mit Diagnosegrund auf `failed` finalisiert.

---

## 11. System Events

### 11.1 system_event

System-Event (Maintenance, Cleanup, etc.).

**Trigger:** Maintenance Jobs

**Code-Location:** [service.py:378](El Servador/god_kaiser_server/src/services/maintenance/service.py#L378)

**Payload:**
```json
{
  "type": "system_event",
  "timestamp": 1706787600,
  "data": {
    "event_type": "cleanup_completed",
    "message": "Sensor data cleanup completed",
    "details": {
      "records_deleted": 1500,
      "retention_days": 30
    }
  }
}
```

---

### 11.2 error_event

ESP Hardware/Config Fehler.

**Trigger:** MQTT Topic `kaiser/{kaiser_id}/esp/{esp_id}/system/error`

**Code-Location:** [error_handler.py:197](El Servador/god_kaiser_server/src/mqtt/handlers/error_handler.py#L197)

**Payload:**
```json
{
  "type": "error_event",
  "timestamp": 1706787600,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "esp_name": "Greenhouse Sensor",
    "error_log_id": "err_12345",
    "error_code": 2001,
    "title": "Sensor-Fehler",
    "category": "hardware",
    "message": "DS18B20 sensor on GPIO 4 not responding",
    "contract_violation": false,
    "contract_code": null,
    "contract_reason": null,
    "raw_severity": 2,
    "raw_category": "HARDWARE",
    "troubleshooting": [
      "Verkabelung prüfen",
      "Pull-up Widerstand vorhanden?",
      "Sensor defekt?"
    ],
    "user_action_required": true,
    "recoverable": true,
    "docs_link": null
  }
}
```

**Contract-Kontext:**
- `contract_violation`: `true`, wenn Severity/Category nur über Contract-Fallback normalisiert wurde
- `contract_code`: Aktuell `CONTRACT_UNKNOWN_CODE` bei Unknown-Werten
- `raw_severity`, `raw_category`: Originalfelder aus dem eingehenden MQTT-Payload
- WS-Projektion nutzt denselben Shared-Serializer wie die REST-Aggregations-Projektion.

---

### 11.3 events_restored

Audit-Events aus Backup wiederhergestellt.

**Trigger:** `POST /audit/backups/{backup_id}/restore`

**Code-Location:** [audit_backup_service.py:313](El Servador/god_kaiser_server/src/services/audit_backup_service.py#L313)

**Payload:**
```json
{
  "type": "events_restored",
  "timestamp": 1706787600,
  "data": {
    "backup_id": "backup_20260201",
    "events_count": 1500,
    "source": "backup"
  }
}
```

---

### 11.4 contract_mismatch (Frontend intern)

Integrationssignal fuer bekannte WS-Event-Typen mit Contract-/Schema-Mismatch.

**Trigger:** Frontend Contract Validator (`validateContractEvent`) erkennt Pflichtfeld- oder Typverletzung.

**Payload:**
```json
{
  "type": "contract_mismatch",
  "timestamp": 1706787600,
  "correlation_id": "corr_123",
  "request_id": "req_123",
  "data": {
    "original_event_type": "actuator_response",
    "contract_issue": "schema_mismatch",
    "mismatch_reason": "actuator_response ohne success-Boolean",
    "operator_action": "Contract-Pruefung erforderlich",
    "raw_context": {
      "event_type": "actuator_response",
      "payload": {
        "esp_id": "ESP_12AB34CD",
        "gpio": 5
      }
    }
  }
}
```

**Hinweis:** `contract_mismatch` ist ein Integrationsproblem (Contract-Drift), kein normaler Betriebsfehler.

---

### 11.5 contract_unknown_event (Frontend intern)

Integrationssignal fuer unbekannte WS-Event-Typen ausserhalb des bekannten Contracts.

**Trigger:** Frontend Contract Validator (`validateContractEvent`) erkennt unbekannten Event-Typ.

**Payload:**
```json
{
  "type": "contract_unknown_event",
  "timestamp": 1706787600,
  "correlation_id": "corr_124",
  "request_id": "req_124",
  "data": {
    "original_event_type": "future_event_x",
    "contract_issue": "unknown_event_type",
    "mismatch_reason": "Unbekannter Event-Typ \"future_event_x\"",
    "operator_action": "Contract-Pruefung erforderlich",
    "raw_context": {
      "event_type": "future_event_x",
      "payload": {}
    }
  }
}
```

**Hinweis:** `contract_unknown_event` wird absichtlich sichtbar gemacht (nicht still verworfen), damit Contract-Drift operativ erkennbar bleibt.

---

## 12. Frontend Integration

### 12.1 WebSocket Service (Singleton)

```typescript
import { websocketService } from '@/services/websocket'

// Connect
await websocketService.connect()

// Disconnect
websocketService.disconnect()

// Status prüfen
websocketService.isConnected()  // boolean
websocketService.getStatus()    // 'disconnected' | 'connecting' | 'connected' | 'error'
```

### 12.2 Type-spezifischer Listener

```typescript
// Listener registrieren
const unsubscribe = websocketService.on('sensor_data', (message) => {
  console.log('Sensor:', message.data)
})

// Listener entfernen
unsubscribe()
```

### 12.3 Filtered Subscription

```typescript
const subscriptionId = websocketService.subscribe(
  {
    types: ['sensor_data', 'esp_health'],
    esp_ids: ['ESP_12AB34CD']
  },
  (message) => {
    console.log('Filtered message:', message)
  }
)

// Unsubscribe
websocketService.unsubscribe(subscriptionId)
```

### 12.4 Composable: useWebSocket

```typescript
import { useWebSocket } from '@/composables'

const {
  isConnected,
  isConnecting,
  connectionError,
  connectionStatus,
  lastMessage,
  connect,
  disconnect,
  subscribe,
  unsubscribe,
  on,
  updateFilters,
  cleanup
} = useWebSocket({
  autoConnect: true,
  autoReconnect: true,
  filters: { types: ['sensor_data'] }
})

// In onUnmounted
onUnmounted(() => {
  cleanup()
})
```

### 12.5 Contract-First Consumption (Frontend)

- REST startet Intent nur (`POST /actuators/{espId}/{gpio}/command`), finalisiert aber nicht. Die **HTTP-200**-Antwort enthaelt **`correlation_id`** (und `command_sent`, `safety_warnings`) — dieselbe `correlation_id` wie in WS **`actuator_command`** / **`actuator_command_failed`**, wenn der Server diese Events fuer diesen Versuch sendet (kein Publish bei No-Op-Delta, ID trotzdem fuer Trace).
- REST startet auch Config-/Sequence-Intents nur; Abschluss bleibt asynchron und korrelationsbasiert.
- Terminale Endlagen werden primaer aus WS-Events abgeleitet:
  - Actuator: `actuator_response`, `actuator_command_failed`
  - Config: `config_response`, `config_failed`
  - Sequence: `sequence_completed`, `sequence_error`, `sequence_cancelled`
- Logic-Rule-Lifecycle im Frontend (`logic.store`) ist zweistufig modelliert:
  - `accepted`/`pending_activation` via REST-ACK (`createRule`/`updateRule`/`toggleRule`)
  - `pending_execution` + `terminal_success`/`terminal_failed`/`terminal_conflict`/`terminal_integration_issue` via `logic_execution` + `sequence_*` inkl. `terminal_reason_code`/`terminal_reason_text`
- Frontend-Schutz-Timeouts duerfen offene Intents lokal als `terminal_timeout` finalisieren, wenn innerhalb der definierten Frist kein terminales WS-Event eingeht.
- Unknown-Events oder Schema-Mismatch werden als `contract_unknown_event` / `contract_mismatch` sichtbar gemacht (Integrationsproblem statt Betriebsfehler).
- `data.correlation_id` ist der primaere Schluessel fuer Intent-Zuordnung; `request_id` ist rein zusaetzlicher Trace-Kontext, sofern vorhanden.
- Integrationssignale enthalten Operator-Hinweis (`data.operator_action`) und Rohkontext (`data.raw_context`) fuer schnelle Diagnose im Monitor/Detailpanel.
- Semantik fuer Severity-Fallback und Operator-Aktion wird zentral aus `src/utils/contractEventMapper.ts` abgeleitet (`inferFallbackSeverity`, `CONTRACT_OPERATOR_ACTION`); keine View-lokalen Sonderregeln.
- `EventDetailsPanel` zeigt fuer terminale Fehler-/Abbruch-Events eine einheitliche Operator-Entscheidung: Problemtyp (`Integrationsproblem`/`Betriebsproblem`), Prioritaet, Ursache und naechster Schritt.

---

## 13. Filter-Typen

```typescript
interface WebSocketFilters {
  types?: MessageType[]      // 'sensor_data', 'esp_health', ...
  esp_ids?: string[]         // Filter by ESP ID
  sensor_types?: string[]    // Filter by sensor type
  topicPattern?: string      // Regex pattern
}
```

---

## 14. Code-Locations

### Frontend

| Datei | Beschreibung |
|-------|--------------|
| `src/services/websocket.ts` | WebSocket Service (Singleton) |
| `src/composables/useWebSocket.ts` | WebSocket Composable |
| `src/stores/esp.ts` | ESP Store mit Event Handlers |
| `src/types/websocket-events.ts` | Event Type Definitions |

### Backend

| Datei | Beschreibung |
|-------|--------------|
| `src/websocket/manager.py` | WebSocket Connection Manager |
| `src/api/v1/websocket/realtime.py` | WebSocket Route |
| `src/services/notification_router.py` | Notification Routing + WS Broadcast |

### MQTT Handler (Broadcast Trigger)

| Handler | Events |
|---------|--------|
| `sensor_handler.py` | `sensor_data` |
| `actuator_handler.py` | `actuator_status` |
| `actuator_response_handler.py` | `actuator_response` |
| `actuator_alert_handler.py` | `actuator_alert` |
| `heartbeat_handler.py` | `esp_health`, `esp_reconnect_phase`, `device_discovered`, `device_rediscovered` |
| `config_handler.py` | `config_response` |
| `intent_outcome_handler.py` | `intent_outcome` |
| `intent_outcome_lifecycle_handler.py` | `intent_outcome_lifecycle` |
| `zone_ack_handler.py` | `zone_assignment` |
| `subzone_ack_handler.py` | `subzone_assignment` |
| `error_handler.py` | `error_event` |
| `lwt_handler.py` | `esp_health` (offline) |

### Service (Broadcast Trigger)

| Service | Events |
|---------|--------|
| `notification_router.py` | `notification_new`, `notification_updated`, `notification_unread_count` |
| `plugin_service.py` | `plugin_execution_started`, `plugin_execution_completed` |
| `device_context.py` (Router) | `device_context_changed` |
| `sensors.py` (Router) | `device_scope_changed` |
| `actuators.py` (Router) | `device_scope_changed` |

---

## 15. Rate Limiting

- **Server-seitig:** 10 Nachrichten pro Sekunde pro Client (Per-Client-Sliding-Window)
- **Client-seitig:** Warning bei >10 msg/sec
- **Implementierung:** `src/websocket/manager.py → _rate_limit_bypass_types`

### Bypass-Liste (kritische Realtime-Events)

Folgende Event-Typen umgehen das Rate-Limit und werden auch unter Burst-Last garantiert ausgeliefert:

| Event | Grund |
|-------|-------|
| `actuator_status` | GPIO-State-Change — Safety-Relevant, nie droppen (AUT-68) |
| `esp_health` | Online/Offline-Signal — UI muss sofort reagieren |
| `device_discovered` | Neu-Provisionierung — einmaliges Event |
| `device_rediscovered` | Reconnect — Delta-Sync-Trigger |
| `notification_new` | Alert/Warning — darf nicht verloren gehen |
| `notification_updated` | Status-Wechsel einer Notification |
| `notification_unread_count` | Badge-Aktualisierung |

> Nicht-Bypass-Events (z. B. `sensor_data` bei 1 Hz × N Sensoren) werden bei Überschreitung gedropt.

---

## 16. Troubleshooting

| Problem | Ursache | Lösung |
|---------|---------|--------|
| WebSocket disconnected | Token expired | Seite neu laden oder Token refresh |
| Events kommen nicht an | Falsche Filter | Filter prüfen |
| Duplicate Events | Mehrfache Subscriptions | cleanup() aufrufen |
| Connection refused | Server nicht gestartet | Server-Logs prüfen |
| "Invalid token" | JWT abgelaufen | Re-Login erforderlich |
| Rate limit exceeded | Zu viele Messages | Filter eingrenzen |
