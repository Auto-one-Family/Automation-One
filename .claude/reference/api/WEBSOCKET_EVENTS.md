---
name: websocket-reference
description: WebSocket Events Real-time Updates esp_health sensor_data
  actuator_status device_discovered Frontend Server Live Subscription
allowed-tools: Read
---

# WebSocket Event Referenz

> **Version:** 2.0 | **Aktualisiert:** 2026-02-01
> **Endpoint:** `ws://localhost:8000/api/v1/ws/realtime/{client_id}?token={jwt_token}`
> **Quellen:** Vollständige Codebase-Analyse aller `broadcast` Aufrufe
> **Event-Anzahl:** 26 verschiedene Event-Typen

---

## 0. Quick-Lookup (Alle Events)

### ESP/Device Events

| Event | Richtung | Trigger | Beschreibung |
|-------|----------|---------|--------------|
| `esp_health` | Server→Frontend | Heartbeat | ESP Online-Status, Health-Daten |
| `device_discovered` | Server→Frontend | Neues ESP | Unbekanntes ESP entdeckt |
| `device_rediscovered` | Server→Frontend | ESP wieder online | Bekanntes ESP kommt zurück |
| `device_approved` | Server→Frontend | Admin-Aktion | Pending ESP genehmigt |
| `device_rejected` | Server→Frontend | Admin-Aktion | Pending ESP abgelehnt |

### Sensor Events

| Event | Richtung | Trigger | Beschreibung |
|-------|----------|---------|--------------|
| `sensor_data` | Server→Frontend | Sensor-Messung | Neuer Sensor-Wert |
| `sensor_health` | Server→Frontend | Health-Check | Sensor Timeout/Recovery |

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
| `config_response` | Server→Frontend | ESP-ACK | ESP bestätigt Config |
| `config_published` | Server→Frontend | Config gesendet | Config erfolgreich gepublished |
| `config_failed` | Server→Frontend | Config fehlgeschlagen | Publish-Fehler |

### Zone Events

| Event | Richtung | Trigger | Beschreibung |
|-------|----------|---------|--------------|
| `zone_assignment` | Server→Frontend | Zone ACK | ESP bestätigt Zone-Zuweisung |

### Logic/Automation Events

| Event | Richtung | Trigger | Beschreibung |
|-------|----------|---------|--------------|
| `logic_execution` | Server→Frontend | Rule ausgeführt | Automation Rule triggered |
| `notification` | Server→Frontend | Rule-Notification | Benachrichtigung von Rule |

### Sequence Events

| Event | Richtung | Trigger | Beschreibung |
|-------|----------|---------|--------------|
| `sequence_started` | Server→Frontend | Sequence Start | Sequence-Ausführung beginnt |
| `sequence_step` | Server→Frontend | Step Progress | Einzelner Schritt abgeschlossen |
| `sequence_completed` | Server→Frontend | Sequence Ende | Sequence erfolgreich beendet |
| `sequence_error` | Server→Frontend | Sequence Fehler | Sequence mit Fehler |
| `sequence_cancelled` | Server→Frontend | Sequence Abbruch | Sequence abgebrochen |

### System Events

| Event | Richtung | Trigger | Beschreibung |
|-------|----------|---------|--------------|
| `system_event` | Server→Frontend | Maintenance | Cleanup, Health-Check, etc. |
| `error_event` | Server→Frontend | ESP Error | Hardware/Config Fehler |
| `events_restored` | Server→Frontend | Backup Restore | Audit-Events wiederhergestellt |

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
  "data": {
    ...
  }
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `type` | string | Event-Typ-Identifier |
| `timestamp` | number | Unix Timestamp (Sekunden) |
| `data` | object | Event-spezifische Payload |

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
    "gpio_status": [
      {
        "gpio": 4,
        "owner": "sensor",
        "component": "DS18B20",
        "mode": 1,
        "safe": false
      }
    ]
  }
}
```

---

### 3.2 device_discovered

Neues unbekanntes ESP-Gerät entdeckt (Pending Device).

**Trigger:** Heartbeat von unbekanntem ESP

**Code-Locations:**
- [heartbeat_handler.py:553](El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py#L553)
- [debug.py:319](El Servador/god_kaiser_server/src/api/v1/debug.py#L319)

**Payload:**
```json
{
  "type": "device_discovered",
  "timestamp": 1706787600,
  "data": {
    "esp_id": "ESP_NEW_DEVICE",
    "discovered_at": "2026-02-01T10:23:45Z",
    "wifi_rssi": -55,
    "firmware_version": "4.0.0",
    "pending": true
  }
}
```

---

### 3.3 device_rediscovered

Bekanntes ESP-Gerät kommt nach Offline-Phase zurück.

**Trigger:** Heartbeat von bekanntem, aber offline ESP

**Code-Location:** [heartbeat_handler.py:582](El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py#L582)

**Payload:**
```json
{
  "type": "device_rediscovered",
  "timestamp": 1706787600,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "device_id": "ESP_12AB34CD",
    "zone_id": "greenhouse",
    "zone_name": "Gewächshaus",
    "previous_status": "offline",
    "heap_free": 98304,
    "wifi_rssi": -45
  }
}
```

---

### 3.4 device_approved

ESP-Gerät wurde durch Admin genehmigt.

**Trigger:** `POST /esp/pending/{esp_id}/approve`

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

**Trigger:** `POST /esp/pending/{esp_id}/reject`

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
    "subzone_id": "zone_a"
  }
}
```

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

## 5. Actuator Events

### 5.1 actuator_status

Actuator Status Update (nach State-Änderung).

**Trigger:** MQTT Topic `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status`

**Code-Location:** [actuator_handler.py:228](El Servador/god_kaiser_server/src/mqtt/handlers/actuator_handler.py#L228)

**Payload:**
```json
{
  "type": "actuator_status",
  "timestamp": 1706787600,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "gpio": 5,
    "actuator_type": "pump",
    "state": true,
    "pwm_value": 0,
    "runtime_ms": 3600000,
    "emergency": "normal",
    "timestamp": "2026-02-01T10:23:45Z"
  }
}
```

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
    "actuator_type": "pump",
    "command": "ON",
    "success": true,
    "error_code": null,
    "message": null
  }
}
```

---

### 5.5 actuator_alert

Actuator Alert (Emergency-Stop, Timeout, Fehler).

**Trigger:** MQTT Topic `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/alert`

**Code-Locations:**
- [actuator_alert_handler.py:189](El Servador/god_kaiser_server/src/mqtt/handlers/actuator_alert_handler.py#L189)
- [actuators.py:753](El Servador/god_kaiser_server/src/api/v1/actuators.py#L753)

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
    "config_id": "cfg_12345",
    "config_applied": true,
    "applied_sections": ["sensors", "actuators"],
    "skipped_sections": [],
    "restart_required": false,
    "error": null,
    "error_code": null,
    "severity": "info"
  }
}
```

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
    "zone_id": "greenhouse",
    "zone_name": "Gewächshaus",
    "master_zone_id": "main_zone",
    "success": true,
    "timestamp": "2026-02-01T10:23:45Z"
  }
}
```

---

## 8. Logic/Automation Events

### 8.1 logic_execution

Automation Rule wurde ausgeführt.

**Trigger:** `LogicEngine.evaluate_sensor_data()` führt Rule aus

**Code-Locations:**
- [logic_engine.py:599](El Servador/god_kaiser_server/src/services/logic_engine.py#L599)
- [logic_engine.py:675](El Servador/god_kaiser_server/src/services/logic_engine.py#L675)

**Payload:**
```json
{
  "type": "logic_execution",
  "timestamp": 1706787600,
  "data": {
    "rule_id": "1",
    "rule_name": "Auto-Irrigation",
    "triggered_by": "sensor_threshold",
    "actions_executed": 1,
    "success": true,
    "duration_ms": 150
  }
}
```

---

### 8.2 notification

Notification von Automation Rule.

**Trigger:** `NotificationAction` in Rule ausgeführt

**Code-Location:** [notification_executor.py:134](El Servador/god_kaiser_server/src/services/logic/actions/notification_executor.py#L134)

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

## 10. System Events

### 10.1 system_event

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

### 10.2 error_event

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

---

### 10.3 events_restored

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

## 11. Frontend Integration

### 11.1 WebSocket Service (Singleton)

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

### 11.2 Type-spezifischer Listener

```typescript
// Listener registrieren
const unsubscribe = websocketService.on('sensor_data', (message) => {
  console.log('Sensor:', message.data)
})

// Listener entfernen
unsubscribe()
```

### 11.3 Filtered Subscription

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

### 11.4 Composable: useWebSocket

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

---

## 12. Filter-Typen

```typescript
interface WebSocketFilters {
  types?: MessageType[]      // 'sensor_data', 'esp_health', ...
  esp_ids?: string[]         // Filter by ESP ID
  sensor_types?: string[]    // Filter by sensor type
  topicPattern?: string      // Regex pattern
}
```

---

## 13. Code-Locations

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

### MQTT Handler (Broadcast Trigger)

| Handler | Events |
|---------|--------|
| `sensor_handler.py` | `sensor_data` |
| `actuator_handler.py` | `actuator_status` |
| `actuator_response_handler.py` | `actuator_response` |
| `actuator_alert_handler.py` | `actuator_alert` |
| `heartbeat_handler.py` | `esp_health`, `device_discovered`, `device_rediscovered` |
| `config_handler.py` | `config_response` |
| `zone_ack_handler.py` | `zone_assignment` |
| `error_handler.py` | `error_event` |
| `lwt_handler.py` | `esp_health` (offline) |

---

## 14. Rate Limiting

- **Server-seitig:** 10 Nachrichten pro Sekunde pro Client
- **Client-seitig:** Warning bei >10 msg/sec

---

## 15. Troubleshooting

| Problem | Ursache | Lösung |
|---------|---------|--------|
| WebSocket disconnected | Token expired | Seite neu laden oder Token refresh |
| Events kommen nicht an | Falsche Filter | Filter prüfen |
| Duplicate Events | Mehrfache Subscriptions | cleanup() aufrufen |
| Connection refused | Server nicht gestartet | Server-Logs prüfen |
| "Invalid token" | JWT abgelaufen | Re-Login erforderlich |
| Rate limit exceeded | Zu viele Messages | Filter eingrenzen |
