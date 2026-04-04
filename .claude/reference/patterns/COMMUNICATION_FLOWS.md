---
name: communication-flows
description: Datenfluss Flow Kommunikation Sensor Actuator Emergency ESP32
  Server Frontend MQTT WebSocket Sequenz Architektur
allowed-tools: Read
---

# Kommunikationsmuster & Datenflüsse

> **Version:** 2.8 | **Aktualisiert:** 2026-04-04
> **Quellen:** Code-Traces durch ESP32, Server, Frontend
> **Verifiziert:** ✅ Alle Pfade mit Datei:Zeile dokumentiert

---

## 0. Flow-Übersicht

| Flow | Komponenten | Beschreibung | Latenz |
|------|-------------|--------------|--------|
| A | ESP→Server→Frontend | Sensor-Daten | 50-230ms |
| B | Frontend→Server→ESP | Actuator-Steuerung | 100-290ms |
| C | Server→ALL ESPs | Emergency Stop | <100ms |
| D | Server→ESP→Server | Zone Assignment | 50-150ms |
| E | Server→ESP | Config Update | 100-300ms |
| F | ESP→Server→Frontend | Heartbeat | 20-80ms |
| G | Server→ESP | Logic Engine Rule Execution | 20-100ms |
| H | Server→ALL ESPs | Server LWT (SAFETY-P5) | Sofort/~90s |

---

## 1. Flow A: Sensor-Daten (ESP32 → Server → Frontend)

### Sequenz-Diagramm

```
┌─────────────────┐          ┌───────────────────┐          ┌──────────────────┐
│      ESP32      │          │      Server       │          │     Frontend     │
│  SensorManager  │          │   sensor_handler  │          │     espStore     │
└────────┬────────┘          └─────────┬─────────┘          └────────┬─────────┘
         │                             │                             │
         │ 1. performAllMeasurements() │                             │
         │    [sensor_manager.cpp:985] │                             │
         │                             │                             │
         │ 2. MQTT Publish             │                             │
         │    QoS 1, Topic:            │                             │
         │    kaiser/god/esp/{esp_id}/ │                             │
         │    sensor/{gpio}/data       │                             │
         │─────────────────────────────►                             │
         │    [sensor_manager.cpp:1226]│                             │
         │                             │                             │
         │                             │ 3. handle_sensor_data()     │
         │                             │    [sensor_handler.py:79]   │
         │                             │                             │
         │                             │ 4. Validate & Parse         │
         │                             │    [sensor_handler.py:353]  │
         │                             │                             │
         │                             │ 5. DB: Save Sensor Data     │
         │                             │    [sensor_handler.py:259]  │
         │                             │                             │
         │                             │ 6. Logic Engine (async)     │
         │                             │    [logic_engine.py:135]    │
         │                             │                             │
         │                             │ 7. WebSocket Broadcast      │
         │                             │    "sensor_data" Event      │
         │                             │────────────────────────────►│
         │                             │    [sensor_handler.py:297]  │
         │                             │                             │
         │                             │                             │ 8. handleSensorData()
         │                             │                             │    [esp.ts:1482]
         │                             │                             │
         │                             │                             │ 9. Vue Reactivity
         │                             │                             │    UI Update
```

### Code-Pfad (Verifiziert)

| Schritt | Datei | Methode | Zeile |
|---------|-------|---------|-------|
| 1 | `sensor_manager.cpp` | `performAllMeasurements()` | 985 |
| 2 | `sensor_manager.cpp` | `publishSensorReading()` | 1226 |
| 3 | `sensor_manager.cpp` | `buildMQTTPayload()` | 1246 |
| 4 | `topic_builder.cpp` | `buildSensorDataTopic()` | 53 |
| 5 | `mqtt_client.cpp` | `publish()` | 469 |
| 6 | `sensor_handler.py` | `handle_sensor_data()` | 79 |
| 6b | `zone_subzone_resolver.py` | `resolve_zone_subzone_for_sensor()` — 3-way dispatch: zone_local/multi_zone/mobile (T13-R2) | - |
| 7 | `sensor_handler.py` | `_validate_payload()` | 353 |
| 8 | `sensor_handler.py` | DB Save | 259 |
| 9 | `sensor_handler.py` | WebSocket Broadcast | 297 |
| 10 | `logic_engine.py` | `evaluate_sensor_data()` mit zone_id Filter (T13-R2) | 135 |
| 11 | `websocket/manager.py` | `broadcast()` | 179 |
| 12 | `esp.ts` | `handleSensorData()` | 1482 |

### MQTT Topic & Payload

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data`

**Payload (ESP32→Server):**
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
  "raw_mode": true,
  "subzone_id": "zone_a",
  "onewire_address": "28FF123456789ABC"
}
```

### Sensor-Interface-spezifische Unterscheidung

| Interface | Identifikator | Lookup-Strategie |
|-----------|---------------|------------------|
| Analog/Digital | - | 3-way: esp_id + gpio + sensor_type |
| OneWire (DS18B20) | `onewire_address` (64-bit ROM) | 4-way: + onewire_address |
| I2C (SHT31, BMP280, BME280) | `i2c_address` (7-bit) | 4-way: + i2c_address |

**I2C-Adress-Konfiguration:**
- SHT31: 0x44 (ADDR→GND), 0x45 (ADDR→VCC)
- BMP280/BME280: 0x76 (SDO→GND), 0x77 (SDO→VCC)

### Architektur-Abweichung: BMP280/BME280

**Abweichung vom Server-Centric Prinzip:**

BMP280 und BME280 arbeiten NICHT im Pi-Enhanced RAW-Mode. Die Bosch-Kompensationsformel (~50 Zeilen C-Code mit 12-18 Kalibrierungswerten) wird ESP32-seitig durch die Adafruit_BMP280/BME280 Library ausgeführt.

| Sensor | RAW-Mode | Kompensation | Server-Aufgabe |
|--------|----------|--------------|----------------|
| SHT31 | ✅ Ja | Server | Konvertierung: -45 + 175×raw/65535 |
| BMP280 | ❌ Nein | ESP32 (Adafruit) | Validierung, Unit-Konvertierung |
| BME280 | ❌ Nein | ESP32 (Adafruit) | Validierung, Unit-Konvertierung |

**Begründung:** Bosch-Kalibrierungsdaten (dig_T1-T3, dig_P1-P9, dig_H1-H6) sind im Sensor-EEPROM gespeichert und werden von der Adafruit-Library beim Init ausgelesen. Eine Server-seitige Kompensation würde erfordern, diese Daten via MQTT zu übertragen - unnötige Komplexität.

**WebSocket Event (Server→Frontend):**
```json
{
  "type": "sensor_data",
  "timestamp": 1735818000,
  "correlation_id": "ESP_12AB34CD:data:42:1735818000000",
  "data": {
    "esp_id": "ESP_12AB34CD",
    "gpio": 4,
    "sensor_type": "DS18B20",
    "value": 21.5,
    "unit": "°C",
    "zone_id": "greenhouse",
    "subzone_id": "zone_a",
    "quality": "good"
  }
}
```

### Timing-Analyse

| Phase | Operation | Dauer | Datei:Zeile |
|-------|-----------|-------|-------------|
| 1 | Sensor Read (ADC/I2C/OneWire) | 10-750ms | sensor_manager.cpp:280-430 |
| 2 | Pi-Enhanced Processing (optional) | 10-50ms | pi_enhanced_processor.cpp:86 |
| 3 | MQTT Publish (QoS 1) | 20-100ms | mqtt_client.cpp:498 |
| 4 | Server Handler | 5-20ms | sensor_handler.py:79 |
| 5 | DB Write | 10-50ms | sensor_handler.py:259 |
| 6 | WebSocket Broadcast | 5-10ms | manager.py:179 |
| 7 | Frontend Store Update | <1ms | esp.ts:1482 |
| 8 | Vue Render | ~16ms | - |
| **Total** | | **50-230ms** | |

### Fehlerbehandlung

| Fehler | Erkennung | Reaktion | Datei:Zeile |
|--------|-----------|----------|-------------|
| MQTT Disconnect | Circuit Breaker; SAFETY-P4 `onDisconnect()` (Grace); safe state nur wenn 0 Offline-Rules | Offline Buffer (100 msg, PubSubClient); P4 `activateOfflineMode()` synct `is_active` aus Hardware-State (verhindert Doppel-AN) | mqtt_client.cpp; safety_task.cpp (ESP-IDF Notify) |
| Server Down | LWT ~90s (Broker erkennt Crash) oder sofort (Graceful Shutdown via `server/status="offline"`); Fallback: P1-Timeout 120s | ESP: P4-Delegation wenn Offline-Rules; sofort safe state wenn keine; `server/status="online"` nur Liveness-Hinweis, autoritatives Recovery via `heartbeat/ack` | client.py:will_set; main.cpp:routeIncomingMessage /server/status; main.cpp:checkServerAckTimeout |
| DB Error | Exception | Log, Skip Broadcast | sensor_handler.py:260 |
| Invalid Payload | Validation | Reject, Log Warning | sensor_handler.py:353 |
| WebSocket Fail | Best-effort | Continue, Log | sensor_handler.py:310 |

---

## 2. Flow B: Actuator-Steuerung (Frontend → Server → ESP32)

### Sequenz-Diagramm

```
┌──────────────────┐          ┌───────────────────┐          ┌─────────────────┐
│     Frontend     │          │      Server       │          │      ESP32      │
│   actuatorsApi   │          │   actuators.py    │          │ ActuatorManager │
└────────┬─────────┘          └─────────┬─────────┘          └────────┬────────┘
         │                              │                             │
         │ 1. sendCommand()             │                             │
         │    [actuators.ts:108]        │                             │
         │                              │                             │
         │ 2. POST /actuators/{id}/cmd  │                             │
         │─────────────────────────────►│                             │
         │                              │                             │
         │                              │ 3. Safety Validation        │
         │                              │    [actuators.py:validate]  │
         │                              │                             │
         │                              │ 4. MQTT Publish Command     │
         │                              │    Topic: .../command       │
         │                              │─────────────────────────────►
         │                              │    [publisher.py:publish]   │
         │                              │                             │
         │ 5. HTTP 202 Accepted         │                             │
         │◄─────────────────────────────│                             │
         │                              │                             │
         │                              │                             │ 6. handleActuatorCommand()
         │                              │                             │    [actuator_manager.cpp:537]
         │                              │                             │
         │                              │                             │ 7. Safety Check
         │                              │                             │    [safety_controller.cpp]
         │                              │                             │
         │                              │                             │ 8. GPIO digitalWrite()
         │                              │                             │    [pump_actuator.cpp:407]
         │                              │                             │
         │                              │ 9. MQTT: .../response       │
         │                              │◄─────────────────────────────│
         │                              │    [actuator_manager.cpp:826]│
         │                              │                             │
         │                              │ 10. MQTT: .../status        │
         │                              │◄─────────────────────────────│
         │                              │    [actuator_manager.cpp:778]│
         │                              │                             │
         │ 11. WS: actuator_response    │                             │
         │◄─────────────────────────────│                             │
         │    [actuator_handler.py:228] │                             │
         │                              │                             │
         │ 12. handleActuatorResponse() │                             │
         │    [esp.ts:2005]             │                             │
```

### Code-Pfad (Verifiziert)

| Schritt | Datei | Methode | Zeile |
|---------|-------|---------|-------|
| 1 | `actuators.ts` | `sendCommand()` | 108 |
| 2 | `esp.ts` | `sendActuatorCommand()` | 2287 |
| 3 | Server | REST Handler | actuators.py |
| 4 | `publisher.py` | `publish_actuator_command()` | - |
| 5 | `topic_builder.cpp` | `buildActuatorCommandTopic()` | 87 |
| 6 | `actuator_manager.cpp` | `handleActuatorCommand()` | 537 |
| 7 | `actuator_manager.cpp` | `extractGPIOFromTopic()` | 467 |
| 8 | `actuator_manager.cpp` | `controlActuatorBinary()` | 382 |
| 9 | `pump_actuator.cpp` | `applyState()` | 384 |
| 10 | `actuator_manager.cpp` | `publishActuatorResponse()` | 826 |
| 11 | `actuator_manager.cpp` | `publishActuatorStatus()` | 778 |
| 12 | `actuator_handler.py` | `handle_actuator_status()` | 44 |
| 13 | `esp.ts` | `handleActuatorStatus()` | 1664 |
| 14 | `esp.ts` | `handleActuatorResponse()` | 2005 |

### MQTT Topics

| Topic | Richtung | QoS | Beschreibung |
|-------|----------|-----|--------------|
| `kaiser/god/esp/{esp_id}/actuator/{gpio}/command` | Server→ESP | 2 | Befehl |
| `kaiser/god/esp/{esp_id}/actuator/{gpio}/response` | ESP→Server | 1 | ACK |
| `kaiser/god/esp/{esp_id}/actuator/{gpio}/status` | ESP→Server | 1 | Zustand |
| `kaiser/god/esp/{esp_id}/actuator/{gpio}/alert` | ESP→Server | 1 | Warnung |

### Command Payload (Server→ESP)

```json
{
  "command": "ON",
  "value": 1.0,
  "duration": 0,
  "timestamp": 1735818000,
  "correlation_id": "cmd_abc123"
}
```

### Response Payload (ESP→Server)

```json
{
  "esp_id": "ESP_12AB34CD",
  "zone_id": "greenhouse",
  "ts": 1735818000,
  "gpio": 5,
  "command": "ON",
  "value": 1.0,
  "duration": 0,
  "success": true,
  "message": "Command executed",
  "correlation_id": "cmd_abc123"
}
```

**Terminale Persistenz-Authority (Server):**
- Vor History/Audit/WS greift ein write-once/finality-Guard pro dedup-key (`correlation_id` bevorzugt).
- Stale/Replayed `actuator_response`-Events werden idempotent quittiert und erzeugen keine doppelten Seiteneffekte.

**Frontend Contract-Integrationssignale:**
- Unknown-Events oder Schema-Mismatch in der WS-Consumption werden als `contract_unknown_event`/`contract_mismatch` sichtbar gemacht.
- Diese Integrationssignale enthalten `operator_action` und `raw_context` fuer schnelle Diagnose statt stiller Heuristik-Fallbacks.
- Severity-Fallback und Operator-Aktions-Text stammen zentral aus `src/utils/contractEventMapper.ts` (SSOT), damit Monitor/Details/Toasts dieselbe Semantik nutzen.

### Timing-Analyse

| Phase | Operation | Dauer | Datei:Zeile |
|-------|-----------|-------|-------------|
| 1 | REST Request | 10-30ms | actuators.ts:108 |
| 2 | Safety Validation | 5-15ms | actuators.py |
| 3 | MQTT Publish (QoS 2) | 50-150ms | publisher.py |
| 4 | ESP Processing | 10-30ms | actuator_manager.cpp:537 |
| 5 | GPIO Set | <1ms | pump_actuator.cpp:407 |
| 6 | Response Publish | 20-50ms | actuator_manager.cpp:826 |
| 7 | WebSocket Broadcast | 5-10ms | actuator_handler.py:228 |
| **Total** | | **100-290ms** | |

### Fehlerbehandlung

| Fehler | Erkennung | Reaktion | Datei:Zeile |
|--------|-----------|----------|-------------|
| ESP Emergency Stop | `emergency_stopped` flag | Reject + Alert | actuator_manager.cpp:294 |
| Runtime Protection | `canActivate()` check | Reject + Alert | pump_actuator.cpp:163 |
| GPIO Conflict | GPIOManager check | Reject | gpio_manager.cpp:169 |
| MQTT Timeout | No response | HTTP 504, Retry | actuators.py |
| Invalid Command | Validation | HTTP 400 | actuators.py |

---

## 3. Flow C: Emergency Stop (Server → ALL ESPs)

### Sequenz-Diagramm

```
┌──────────────────┐          ┌───────────────────┐          ┌─────────────────┐
│     Frontend     │          │      Server       │          │    ALL ESP32s   │
└────────┬─────────┘          └─────────┬─────────┘          └────────┬────────┘
         │                              │                             │
         │ 1. POST /emergency_stop      │                             │
         │─────────────────────────────►│                             │
         │    [actuators.ts:123]        │                             │
         │                              │                             │
         │                              │ 2. MQTT Broadcast           │
         │                              │    Topic: kaiser/broadcast/ │
         │                              │           emergency         │
         │                              │    QoS 2                    │
         │                              │─────────────────────────────►│ (ALL)
         │                              │                             │
         │                              │                             │ 3. handleEmergency()
         │                              │                             │    [safety_controller.cpp:37]
         │                              │                             │
         │                              │                             │ 4. stopAllActuators()
         │                              │                             │    <50ms GARANTIERT
         │                              │                             │
         │                              │                             │ 5. Set INPUT_PULLUP
         │                              │                             │    [gpio_manager.cpp:169]
         │                              │                             │
         │                              │ 6. MQTT: .../alert          │
         │                              │◄─────────────────────────────│
         │                              │                             │
         │                              │ 7. MQTT: .../safe_mode      │
         │                              │◄─────────────────────────────│
         │                              │                             │
         │ 8. WS: actuator_alert        │                             │
         │◄─────────────────────────────│                             │
         │                              │                             │
         │ 9. handleActuatorAlert()     │                             │
         │    [esp.ts:1430]             │                             │
```

### Code-Pfad (Verifiziert)

| Schritt | Datei | Methode | Zeile |
|---------|-------|---------|-------|
| 1 | `actuators.ts` | `emergencyStop()` | 123 |
| 2 | Server | Broadcast publish | - |
| 3 | `safety_controller.cpp` | `emergencyStopAll()` | 37 |
| 4 | `actuator_manager.cpp` | `emergencyStopAll()` | - |
| 5 | `gpio_manager.cpp` | `enableSafeModeForAllPins()` | 169 |
| 6 | `safety_controller.cpp` | `clearEmergencyStop()` | 63 |
| 7 | `safety_controller.cpp` | `resumeOperation()` | 97 |
| 8 | `esp.ts` | `handleActuatorAlert()` | 1430 |

### MQTT Topics

| Topic | Richtung | QoS | Beschreibung |
|-------|----------|-----|--------------|
| `kaiser/broadcast/emergency` | Server→ALL | 2 | Stop-Befehl |
| `kaiser/god/esp/{esp_id}/actuator/{gpio}/alert` | ESP→Server | 1 | Alert-Status |
| `kaiser/god/esp/{esp_id}/safe_mode` | ESP→Server | 1 | Safe-Mode bestätigt |

### Emergency Payload

```json
{
  "action": "stop_all",
  "reason": "User emergency stop",
  "timestamp": 1735818000,
  "source": "frontend"
}
```

### Timing-Garantien

| Phase | Max. Dauer | Kritisch |
|-------|------------|----------|
| MQTT Broadcast (QoS 2) | 100ms | ✓ |
| ESP Emergency Handler | 10ms | ✓ |
| GPIO De-Energize | 10µs/Pin | ✓ |
| All Actuators OFF | **<50ms** | ✓✓✓ |
| Alert Publish | 100ms | - |
| **Total bis OFF** | **<100ms** | |

### Recovery Flow

```
1. Emergency Stop empfangen       → 0ms
2. ALLE Aktoren → OFF             → 10-20ms (GPIO-Latenz)
3. Alert published                → 50-100ms (MQTT QoS 1)
4. Wait: exit_safe_mode Command   → Manual
5. Wait: resume_operation Command → Manual
6. Resume mit Delay               → 2000ms pro Aktor (konfigurierbar)
```

---

## 4. Flow D: Zone Assignment (Server → ESP → Server)

### Sequenz-Diagramm (ACK-basiert, T13-Phase2)

```
┌──────────────────┐          ┌───────────────────┐          ┌─────────────────┐
│     Frontend     │          │   Server (Bridge)  │          │      ESP32      │
└────────┬─────────┘          └─────────┬─────────┘          └────────┬────────┘
         │                              │                             │
         │ 1. POST /esp/{id}/zone       │                             │
         │─────────────────────────────►│                             │
         │                              │                             │
         │                              │ 2. DB Update + pending_zone │
         │                              │                             │
         │                              │ 3. MQTT: zone/assign        │
         │                              │    (+correlation_id)        │
         │                              │─────────────────────────────►│
         │                              │                             │
         │                              │  ┌─── Bridge waits ───┐    │ 4. NVS Store
         │                              │  │ asyncio.Future     │    │
         │                              │  │ timeout=10s        │    │
         │                              │  └────────────────────┘    │
         │                              │                             │
         │                              │ 5. MQTT: zone/ack           │
         │                              │◄─────────────────────────────│
         │                              │                             │
         │                              │ 6. resolve_ack() → Future   │
         │                              │                             │
         │                              │ 7. Subzone Transfer (if any)│
         │                              │    MQTT: subzone/assign ────►│
         │                              │    (parent_zone_id="")      │
         │                              │    ◄── subzone/ack ─────────│
         │                              │    (repeat per subzone)     │
         │                              │                             │
         │ 8. WS: zone_assignment       │                             │
         │◄─────────────────────────────│                             │
```

**Wichtig:** Mock-ESPs umgehen die Bridge (fire-and-forget, kein ACK-Waiting).

### MQTT Payloads

**zone/assign (Server→ESP):**
```json
{
  "zone_id": "greenhouse",
  "zone_name": "Gewächshaus",
  "master_zone_id": "main_zone",
  "correlation_id": "uuid-v4"
}
```

**zone/ack (ESP→Server):**
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

**subzone/assign (Server→ESP, during transfer):**
```json
{
  "subzone_id": "irrigation_A",
  "subzone_name": "Irrigation Section A",
  "parent_zone_id": "",
  "assigned_gpios": [2, 4, 15],
  "timestamp": 1735818001,
  "correlation_id": "uuid-v4"
}
```

**Hinweis:** `parent_zone_id` ist leer — Firmware setzt automatisch die aktuelle Zone. GPIO 0 (I2C Placeholder) wird vor dem Senden gefiltert.

---

## 5. Flow E: Config Update (Server → ESP)

### Sequenz-Diagramm

```
┌──────────────────┐          ┌───────────────────┐          ┌─────────────────┐
│     Frontend     │          │      Server       │          │      ESP32      │
└────────┬─────────┘          └─────────┬─────────┘          └────────┬────────┘
         │                              │                             │
         │ 1. PUT /esp/{id}/config      │                             │
         │─────────────────────────────►│                             │
         │                              │                             │
         │                              │ 2. Build Config JSON        │
         │                              │                             │
         │                              │ 3. MQTT: config (QoS 2)     │
         │                              │─────────────────────────────►│
         │                              │                             │
         │                              │                             │ 4. Validate
         │                              │                             │ 5. Apply Sections
         │                              │                             │ 6. NVS Store
         │                              │                             │
         │                              │ 7. MQTT: config_resp (QoS 2)│
         │                              │◄─────────────────────────────│
         │                              │                             │
         │ 8. WS: config_response       │                             │
         │◄─────────────────────────────│                             │
         │                              │                             │
         │ 9. handleConfigResponse()    │                             │
         │    [esp.ts:1699]             │                             │
```

### Config Sections

| Section | Beschreibung | Restart Required |
|---------|--------------|------------------|
| `wifi` | WiFi-Credentials | Ja |
| `server` | MQTT-Broker-Adresse | Ja |
| `device` | ESP-Name, Zone | Nein |
| `sensors` | Sensor-Konfiguration | Nein |
| `actuators` | Actuator-Konfiguration | Nein |

### Finality-Guard für `config_response`

- `config_response` wird serverseitig canonical-first verarbeitet und danach durch eine terminale write-once Authority abgesichert.
- Bei stale Replay werden DB-Status-Updates (`pending -> applied/failed`), Audit-Logs und WebSocket-Broadcasts nicht erneut ausgeführt.

### Frontend Intent-Consumption (Contract-First)

- `config_published` startet im Frontend den Config-Intent (`pending`), Finalisierung erfolgt nur ueber `config_response` oder `config_failed`.
- `config_response` und `config_failed` sind terminale Events fuer den Config-Intent-Lifecycle.
- Server-API-Callsites werten `send_config()` explizit ueber `result.success` aus (kein implizites truthy/falsy Dict-Matching).
- Primärer Korrelationsschluessel ist `data.correlation_id`; `request_id` ist nur zusaetzlicher Trace-Kontext, sofern vorhanden.
- Wenn bei terminalen Config-Events keine brauchbare Korrelation vorliegt, ist das ein Integrationssignal (Contract-Drift) und muss als solches sichtbar bleiben.

### CRUD-triggered Config-Pushes (CP-S1)

Config-Pushes werden automatisch nach folgenden API-Operationen gesendet:

| Trigger | Endpoint |
|---------|----------|
| Sensor Create/Update | `POST /sensors/{esp_id}/{gpio}` |
| Sensor Delete | `DELETE /sensors/{esp_id}/{config_id}` |
| Actuator Create/Update | `POST /actuators/{esp_id}/{gpio}` |
| Actuator Delete | `DELETE /actuators/{esp_id}/{gpio}` |

**CP-S1 Garantie:** Der Config-Push wird immer nach dem primären DB-Commit gesendet, unabhängig von optionalen Nebenoperationen (Subzone-Zuweisung). Falls `assign_subzone()` mit `ValueError` fehlschlägt, wird `subzone_error` als `subzone_warning`-Feld in der Response zurückgegeben — kein 400, kein blockierter Config-Push.

**Fallback:** Der Heartbeat-Handler (120s Cooldown) deckt den Fall ab, wenn der ESP beim Config-Push offline war.

---

## 6. Flow F: Heartbeat (ESP → Server → Frontend)

### Sequenz-Diagramm

```
┌─────────────────┐          ┌───────────────────┐          ┌──────────────────┐
│      ESP32      │          │      Server       │          │     Frontend     │
│   MQTTClient    │          │ heartbeat_handler │          │     espStore     │
└────────┬────────┘          └─────────┬─────────┘          └────────┬─────────┘
         │                             │                             │
         │ 1. publishHeartbeat()       │                             │
         │    [mqtt_client.cpp:621]    │                             │
         │    Interval: 60s            │                             │
         │                             │                             │
         │ 2. MQTT: system/heartbeat   │                             │
         │    QoS 0                    │                             │
         │────────────────────────────►│                             │
         │                             │                             │
         │                             │ 3. handle_heartbeat()       │
         │                             │    [heartbeat_handler.py:61]│
         │                             │                             │
         │                             │ 4. Validate ESP             │
         │                             │    Auto-Discovery?          │
         │                             │                             │
         │                             │ 5. Update last_seen         │
         │                             │    Update metadata          │
         │                             │                             │
         │                             │ 6. WS: esp_health           │
         │                             │────────────────────────────►│
         │                             │    [heartbeat_handler.py:275]
         │                             │                             │
         │                             │                             │ 7. handleEspHealth()
         │                             │                             │    [esp.ts:1327]
         │                             │                             │
         │ 5. MQTT: heartbeat/ack      │                             │
         │◄────────────────────────────│                             │
         │    QoS 1, VOR DB-Arbeit     │                             │
         │    [heartbeat_handler.py]   │                             │
         │                             │                             │
         │                             │ 6. DB-Updates               │
         │                             │    WS: esp_health           │
         │                             │────────────────────────────►│
         │                             │    [heartbeat_handler.py:275]
```

### Code-Pfad (Verifiziert)

| Schritt | Datei | Methode | Zeile |
|---------|-------|---------|-------|
| 1 | `mqtt_client.cpp` | `publishHeartbeat()` | 621 |
| 2 | `topic_builder.cpp` | `buildSystemHeartbeatTopic()` | 127 |
| 3 | `heartbeat_handler.py` | `handle_heartbeat()` | 61 |
| 4 | `heartbeat_handler.py` | `_discover_new_device()` | 396 |
| 5 | `heartbeat_handler.py` | `check_device_timeouts()` | 989 |
| 6 | `websocket/manager.py` | `broadcast()` | 179 |
| 7 | `esp.ts` | `handleEspHealth()` | 1327 |

### Heartbeat Payload (ESP→Server)

```json
{
  "esp_id": "ESP_12AB34CD",
  "zone_id": "greenhouse",
  "master_zone_id": "main_zone",
  "zone_assigned": true,
  "ts": 1735818000,
  "uptime": 3600,
  "heap_free": 245760,
  "wifi_rssi": -65,
  "sensor_count": 3,
  "actuator_count": 2,
  "gpio_status": [
    {
      "gpio": 4,
      "owner": "sensor",
      "component": "DS18B20",
      "mode": 1,
      "safe": false
    }
  ],
  "gpio_reserved_count": 4
}
```

### WebSocket Event (Server→Frontend)

```json
{
  "type": "esp_health",
  "timestamp": 1735818000,
  "correlation_id": "ESP_12AB34CD:heartbeat:99:1735818000000",
  "data": {
    "esp_id": "ESP_12AB34CD",
    "status": "online",
    "heap_free": 245760,
    "wifi_rssi": -65,
    "uptime": 3600,
    "sensor_count": 3,
    "actuator_count": 2,
    "gpio_status": [...]
  }
}
```

### Config-Push on Mismatch Detection

After metadata update, the handler checks `sensor_count` and `actuator_count` from the heartbeat against DB counts (`count_by_esp()`, only `enabled=True` configs). If ESP reports 0 but DB has configs, a config push is triggered.

**Guards:**
- **Offline-Check:** No config push if `esp_device.status == "offline"`
- **Cooldown:** `CONFIG_PUSH_COOLDOWN_SECONDS = 120` via `config_push_sent_at` in `device_metadata` (integer timestamp, same pattern as `zone_resync_sent_at`)
- **Handler:** `heartbeat_handler._has_pending_config()` → `_auto_push_config()` (async task with own DB session)

### Zone Resync on Mismatch

If ESP's `zone_id` doesn't match DB, a zone/assign MQTT message is published.

**Guards:**
- **Offline-Check:** No zone resync if `esp_device.status == "offline"`
- **Cooldown:** 60 seconds via `zone_resync_sent_at` in `device_metadata`

### Device Timeout Detection

**Timeout:** 300 Sekunden (5 Minuten) ohne Heartbeat
**Handler:** `heartbeat_handler.check_device_timeouts()` (Zeile 989)
**Action:** Markiert Device offline, sendet `esp_health` mit `status: "offline"`

---

## 7. Flow G: Logic Engine Rule Execution

### Sequenz-Diagramm

```
┌─────────────────┐          ┌───────────────────┐          ┌─────────────────┐
│  ESP32 Sensor   │          │      Server       │          │  ESP32 Actuator │
└────────┬────────┘          └─────────┬─────────┘          └────────┬────────┘
         │                             │                             │
         │ 1. MQTT: sensor/data        │                             │
         │────────────────────────────►│                             │
         │                             │                             │
         │                             │ 2. sensor_handler receives  │
         │                             │    [sensor_handler.py:79]   │
         │                             │                             │
         │                             │ 3. asyncio.create_task()    │
         │                             │    logic_engine.evaluate... │
         │                             │    [sensor_handler.py:332]  │
         │                             │                             │
         │                             │ 4. evaluate_sensor_data()   │
         │                             │    [logic_engine.py:135]    │
         │                             │                             │
         │                             │ 5. Get matching rules       │
         │                             │    [logic_repo.py]          │
         │                             │                             │
         │                             │ 6. _evaluate_rule()         │
         │                             │    - SensorConditionEvaluator
         │                             │    - TimeConditionEvaluator │
         │                             │    - CompoundConditionEvaluator
         │                             │    - HysteresisConditionEvaluator
         │                             │                             │
         │                             │ 7. Execute actions          │
         │                             │    - ActuatorActionExecutor │
         │                             │    - DelayActionExecutor    │
         │                             │    - NotificationActionExecutor
         │                             │    - SequenceActionExecutor │
         │                             │                             │
         │                             │ 8. MQTT: actuator/command   │
         │                             │────────────────────────────►│
         │                             │                             │
         │                             │                             │ 9. Execute command
         │                             │                             │
         │                             │ 10. MQTT: actuator/response │
         │                             │◄────────────────────────────│
         │                             │                             │
         │                             │ 11. Log Execution           │
```

### Rule-Struktur

```json
{
  "id": "uuid",
  "name": "Auto-Irrigation",
  "enabled": true,
  "conditions": [
    {
      "type": "sensor",
      "esp_id": "ESP_SENSOR_01",
      "gpio": 4,
      "sensor_type": "DS18B20",
      "operator": ">",
      "value": 30.0
    }
  ],
  "actions": [
    {
      "type": "actuator",
      "esp_id": "ESP_ACTUATOR_01",
      "gpio": 5,
      "command": "ON"
    }
  ],
  "logic_operator": "AND",
  "priority": 5,
  "cooldown_seconds": 300
}
```

### Cross-ESP Support

Die Logic Engine unterstützt Rules über **mehrere ESPs**:
- Sensor auf ESP_A triggert Actuator auf ESP_B
- Server koordiniert die Kommunikation
- Safety-Checks erfolgen VOR Command-Publishing

### Logic Engine Komponenten

| Komponente | Datei | Beschreibung |
|------------|-------|--------------|
| SensorConditionEvaluator | conditions/sensor_evaluator.py | Sensor-Schwellwert-Prüfung (`sensor`, `sensor_threshold`), optional `subzone_id` (Phase 2.4), `zone_id` Filter (T13-R2) |
| TimeConditionEvaluator | conditions/time_evaluator.py | Zeit-basierte Bedingungen (`time_window`, `time`) |
| CompoundConditionEvaluator | conditions/compound_evaluator.py | AND/OR Verknüpfungen (`compound`) |
| HysteresisConditionEvaluator | conditions/hysteresis_evaluator.py | Hysterese (`hysteresis`) |
| ActuatorActionExecutor | actions/actuator_executor.py | Actuator-Befehle (`actuator`, `actuator_command`), Phase 2.4: Subzone-Matching vor Execute |
| DelayActionExecutor | actions/delay_executor.py | Verzögerungen (`delay`) |
| NotificationActionExecutor | actions/notification_executor.py | WebSocket Notifications (`notification`) |
| SequenceActionExecutor | actions/sequence_executor.py | Verkettete Aktionen (`sequence`) |
| ConflictManager | safety/conflict_manager.py | GPIO-Konflikt-Prüfung, Zone-aware Key `esp_id:gpio:zone_id` (T13-R2) |
| RateLimiter | safety/rate_limiter.py | Command-Flooding-Schutz |

---

## 8. Flow H: Server LWT — SAFETY-P5 (Server → ALL ESPs)

### Übersicht

Ereignisbasierter Kanal für Server-Offline-Erkennung. Ergänzt P1 (ACK-Timeout 120s) durch schnellere Erkennung.

| Szenario | Mechanismus | Latenz |
|----------|-------------|--------|
| Server-Crash (Broker läuft) | Broker publiziert LWT nach ~90s (1.5× keepalive=60) | ~90s |
| Graceful Shutdown (SIGTERM/Docker-Stop) | Server publiziert explizit `"offline"` vor disconnect | Sofort |
| Server-Start | Server publiziert `"online"` in `_on_connect` | Sofort |
| Server-Hang (kein Crash) | Kein LWT — Fallback: P1 ACK-Timeout 120s | 120s |

### Sequenz-Diagramm (Server-Crash)

```
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  God-Kaiser     │    │   MQTT Broker    │    │     ESP32        │
│  Server         │    │   Mosquitto      │    │  SafetyTask      │
└────────┬────────┘    └────────┬─────────┘    └────────┬─────────┘
         │                      │                        │
         │ 1. connect()         │                        │
         │    will_set(         │                        │
         │     "server/status", │                        │
         │     "offline",       │                        │
         │     retain=True)     │                        │
         │─────────────────────►│                        │
         │                      │                        │
         │ 2. _on_connect:      │                        │
         │    publish("online") │                        │
         │─────────────────────►│                        │
         │                      │─ retained "online" ───►│
         │                      │                        │ (nur Liveness-Hinweis)
         │                      │                        │
         │ 3. CRASH (kill -9)   │                        │
         ╳                      │                        │
         │                      │                        │
         │         4. ~90s keepalive timeout             │
         │                      │                        │
         │                      │ 5. publiziert retained │
         │                      │    LWT: "offline"      │
         │                      │    reason: unexpected_ │
         │                      │────────────────────────►│
         │                      │                        │
         │                      │                        │ 6. /server/status Handler
         │                      │                        │    → Rule-Count-Guard
         │                      │                        │    → P4 oder safe state
```

### ESP32-Reaktion

| Bedingung | Reaktion |
|-----------|----------|
| `status="offline"` + Offline-Rules vorhanden | P4 übernimmt (`offlineModeManager.onDisconnect()`) |
| `status="offline"` + keine Offline-Rules | `actuatorManager.setAllActuatorsToSafeState()` + `onDisconnect()` |
| `status="online"` | Nur Liveness-Hinweis (kein P1-Reset, kein P4-Recovery) |

**Terminale Persistenz-Authority (Server):**
- `system/will` nutzt write-once/finality-Guards, damit wiederholte Broker-Replays denselben Offline-Endzustand nicht mehrfach anwenden.

**Vorrangregel:** Autoritative Registration + Recovery erfolgen ausschließlich über `system/heartbeat/ack`.

### Watchdog-Hierarchie nach SAFETY-P5

```
L1: MQTT Keep-Alive (60s)       → Broker-Liveness               [bestehend]
L2: Server-LWT (retained)       → Server-Crash-Erkennung        [NEU — ~90s]
L3: Heartbeat + ACK (60s/QoS 1) → Server-Responsivität          [gehärtet]
L4: P1 ACK-Timeout (120s)       → Fallback bei Hang             [bestehend, jetzt Fallback]
L5: P4 State Machine (30s)      → koordinierter Offline-Mode    [bestehend]
```

### Code-Referenzen

| Komponente | Datei | Funktion |
|------------|-------|----------|
| LWT setzen | `client.py:connect()` | `self.client.will_set()` vor `self.client.connect()` |
| Online publizieren | `client.py:_on_connect()` | `self.client.publish(server_status, "online")` |
| Offline publizieren | `main.py:lifespan()` | Shutdown-Phase, vor `disconnect()` |
| Topic builden (Server) | `topics.py:build_server_status_topic()` | `constants.MQTT_TOPIC_SERVER_STATUS` |
| Topic builden (ESP32) | `topic_builder.cpp:buildServerStatusTopic()` | `kaiser/%s/server/status` |
| Subscription | `main.cpp:subscribeToAllTopics()` | Topic #12, QoS 1 |
| Handler | `main.cpp:routeIncomingMessage()` | `indexOf("/server/status") >= 0` |

---

## 9. WebSocket Event Types (Server → Frontend)

### Alle Event Types

| Event Type | Handler im Store | Zeile | Beschreibung |
|------------|------------------|-------|--------------|
| `esp_health` | `handleEspHealth()` | 1327 | Device Health & GPIO Status |
| `sensor_data` | `handleSensorData()` | 1482 | Sensor-Messwerte |
| `actuator_status` | `handleActuatorStatus()` | 1664 | Actuator-Zustand |
| `actuator_alert` | `handleActuatorAlert()` | 1430 | Emergency/Timeout |
| `config_response` | `handleConfigResponse()` | 1699 | Config ACK |
| `zone_assignment` | `handleZoneAssignment()` | 1782 | Zone-Zuweisung |
| `device_context_changed` | - | - | Multi-Zone Scope geändert (T13-R2) |
| `sensor_health` | `handleSensorHealth()` | 1917 | Sensor Timeout/Recovery |
| `device_discovered` | `handleDeviceDiscovered()` | 1837 | Neues Gerät |
| `device_approved` | `handleDeviceApproved()` | 1873 | Gerät genehmigt |
| `device_rejected` | `handleDeviceRejected()` | 1895 | Gerät abgelehnt |
| `actuator_response` | `handleActuatorResponse()` | 2005 | Command-Bestätigung |
| `actuator_command` | `handleActuatorCommand()` | 2124 | Command gesendet |
| `actuator_command_failed` | `handleActuatorCommandFailed()` | 2140 | Command fehlgeschlagen |
| `config_published` | `handleConfigPublished()` | 2163 | Config an ESP |
| `config_failed` | `handleConfigFailed()` | 2176 | Config-Fehler |
| `sequence_started` | `handleSequenceStarted()` | 2225 | Automation gestartet |
| `sequence_completed` | `handleSequenceCompleted()` | 2244 | Automation fertig |
| `sequence_error` | `handleSequenceError()` | 2260 | Automation-Fehler |
| `notification` | `handleNotification()` | 2033 | Logic-Rule Benachrichtigung (legacy → Toast) |
| `notification_new` | notification-inbox.store | - | Neuer Alert → Inbox/Badge (Phase 4A) |
| `notification_updated` | notification-inbox.store | - | Alert-Lifecycle (status, acknowledged_at, resolved_at) + read (Phase 4B) |
| `notification_unread_count` | notification-inbox.store | - | Unread-Count Sync (Phase 4A) |
| `error_event` | `handleErrorEvent()` | 2048 | Fehler mit Troubleshooting |
| `system_event` | `handleSystemEvent()` | 2108 | System-Wartung |
| `contract_mismatch` | SystemMonitor Contract Mapper | - | Integrationssignal bei bekanntem Event mit Schema-/Pflichtfeld-Mismatch |
| `contract_unknown_event` | SystemMonitor Contract Mapper | - | Integrationssignal bei unbekanntem WS-Event-Typ |

### WebSocket Subscriptions (Frontend)

```typescript
// esp.ts:111-126
const ws = useWebSocket({
  autoConnect: true,
  autoReconnect: true,
  filters: {
    types: [
      'esp_health', 'sensor_data', 'actuator_status', 'actuator_alert',
      'config_response', 'zone_assignment', 'sensor_health',
      'device_discovered', 'device_approved', 'device_rejected',
      'actuator_response', 'actuator_command', 'actuator_command_failed',
      'config_published', 'config_failed',
      'sequence_started', 'sequence_step', 'sequence_completed', 'sequence_error',
      'logic_execution', 'notification', 'notification_new',
      'notification_updated', 'notification_unread_count',
      'error_event', 'system_event'
    ]
  }
})
```

---

## 10. Circuit Breaker & Resilience Patterns

### ESP32 Circuit Breaker

**MQTT Client:** `mqtt_client.cpp:44-58`
- **Threshold:** 5 failures → OPEN
- **Recovery Timeout:** 30s
- **Half-Open Test:** 10s

**WiFi Manager:** `wifi_manager.cpp:27-36`
- **Threshold:** 10 failures → OPEN
- **Recovery Timeout:** 60s
- **Half-Open Test:** 15s

### Server Resilience

**Database Sessions:** `resilient_session()` Pattern
- Retry mit Circuit Breaker
- Graceful Degradation

**MQTT Publishing:** Best-effort mit Logging

**WebSocket Broadcasting:** Non-blocking, failure doesn't affect main handler

### Exponential Backoff (MQTT Reconnect)

```
Attempt 1: 1s    (2^0 * 1000ms)
Attempt 2: 2s    (2^1 * 1000ms)
Attempt 3: 4s    (2^2 * 1000ms)
Attempt 4: 8s    (2^3 * 1000ms)
Attempt 5: 16s   (2^4 * 1000ms)
Attempt 6+: 60s  (capped)
```

**Code:** `mqtt_client.cpp:815-825` (`calculateBackoffDelay()`)

---

## 11. Architektur-Prinzip: Server-Centric

```
┌─────────────────────────────────────────────────────────────┐
│                    HARDWARE-HIERARCHIE                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Frontend (Vue 3)                                           │
│       │ WebSocket (ws://...:8080/api/v1/ws/realtime)        │
│       │ REST API (http://...:8080/api/v1/...)               │
│       ▼                                                      │
│   God-Kaiser Server (Python/FastAPI)                         │
│       │ MQTT (tcp://...:8883)                               │
│       ▼                                                      │
│   ESP32 Agents (C++/Arduino)                                 │
│       │ GPIO                                                 │
│       ▼                                                      │
│   Hardware (Sensoren, Aktoren)                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Verantwortlichkeiten

| Komponente | Verantwortung |
|------------|---------------|
| **ESP32** | RAW-Daten senden, Commands empfangen, GPIO steuern |
| **Server** | ALLE Intelligenz, Validierung, Business-Logic, Persistenz |
| **Frontend** | Visualisierung, User-Interaktion |

**NIEMALS** Business-Logic auf ESP32 implementieren!

---

## 12. Verwandte Dokumentation

| Dokument | Pfad | Beschreibung |
|----------|------|--------------|
| Boot Sequence | `El Trabajante/docs/system-flows/01-boot-sequence.md` | System-Initialisierung |
| Sensor Reading | `El Trabajante/docs/system-flows/02-sensor-reading-flow.md` | Sensor-Messzyklus |
| Actuator Command | `El Trabajante/docs/system-flows/03-actuator-command-flow.md` | Actuator-Steuerung |
| Error Recovery | `El Trabajante/docs/system-flows/07-error-recovery-flow.md` | Fehler-Recovery |
| MQTT Protocol | `El Trabajante/docs/Mqtt_Protocoll.md` | Vollständige Topic-Spezifikation |

---

**Ende der Communication Flows Dokumentation**
