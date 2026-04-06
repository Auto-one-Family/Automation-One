# A1: ESP32 Bodenfeuchte-Sensorflow und Kommandofinalitaet
**Analyse-Report | 2026-04-06**

---

## Executive Summary

Der Bodenfeuchtesensor (`moisture`) ist im ESP32-Firmware als analoger ADC-Sensor registriert und folgt dem standardisierten Server-centric Pi-Enhanced-Flow. **Kontinuierliche Messung** läuft zyklisch mit konfigurierbarem Intervall (Standard 30s) in der Mesz-Loop (`performAllMeasurements()` auf Core 1). **On-demand Messung** wird über MQTT-Sensor-Command (`kaiser/.../sensor/{gpio}/command`) mit `{"command":"measure"}` ausgelöst und läuft durch `triggerManualMeasurement()` direkt nach Command-Admission und TTL-Validierung.

**Kritische Befunde:**
1. **Queue-Grenzen:** Sensor-Command-Queue hat nur 10 Plätze; voll → Kommandoblockerung + stille Verlustvermerk.
2. **Publish-Queue:** Publish-Queue (Core 1→0) ist unbegrenzt FreeRTOS-mässig, aber bei Outbox-Overflow (-2) werden Non-Critical-Messwerte stillschweigend gelöscht.
3. **Messqualitäts-Marker:** Raw-Wert wird immer publiziert, Server-seitige Kalibrierung/Validierung vollständig server-seitig; ESP setzt nur `raw_mode=true`.
4. **Stille Verluste (6 Fälle):** (a) Sensor-Command-Queue voll, (b) Publish-Outbox voll für Non-Critical, (c) MQTT-Disconnected, (d) Registration-Gate nicht offen, (e) Sensor-Circuit-Breaker OPEN, (f) Measurement-Timeout bei Multi-Wert-Sensor.
5. **Terminale Outcomes:** Command-Flow publiziert `intent_outcome` mit `applied/failed/expired/rejected`; Publish-Flow publi ziert `publish` Outcomes mit `failed/persisted` bei MQTT-Versand.
6. **Firmware-Verbesserungen:** 3 P0 (Queue-Vergrösserung, Outbox-Overflow-Handler, Retry-Logik), 2 P1 (Fallback bei Registrierung, Intent-Metadata in Sensor-Response).

---

## 1. Firmware-Systemmatrix

| Modul | Verantwortung | Eingang | Ausgang | Risiko |
|-------|---------------|---------|---------|--------|
| **SensorManager** | Registrierung, kontinuierliche Messung, on-demand Trigger | Config via `configureSensor()`, Command via `triggerManualMeasurement()` | RAW ADC-Wert (32-bit), SensorReading struct | ❌ Circuit-Breaker OPEN blockiert Messung; Kein Timeout-Guard für I2C |
| **SensorManager.performAllMeasurements()** | Zyklische Messung für alle "continuous"-Mode-Sensoren | Interval-Timer (millis), Sensor-Registry | ADC-Wert per GPIO, Publish-Aufruf | ⚠️ Keine Backpressure bei Publish-Fehler; Interval-Reset auch bei Fehler |
| **SensorManager.triggerManualMeasurement()** | On-demand Messung aus Sensor-Command | GPIO, SensorConfig, Operating-Mode | Single/Multi-Value SensorReading | ✅ Guards gegen inaktive Sensoren; Kein TTL-Prüfung (delegiert an Queue) |
| **SensorManager.performMeasurementForConfig()** | Kernmess-Logik (ADC, I2C, OneWire) | SensorConfig mit GPIO+Interface-Info | Raw-Wert + Metadaten (quality, error_message) | ❌ OneWire: 3x Retry aber kein Timeout; ADC: No Sanity-Check auf Min/Max |
| **SensorManager.publishSensorReading()** | MQTT-Publish mit JSON-Encoding | SensorReading, Zone/Subzone-Info | Topic `sensor/{gpio}/data`, Payload | ⚠️ Registration-Gate blockiert stillschweigend; Kein Outcome-Tracking für Publish |
| **SensorManager.readRawAnalog()** | ADC-Rohwert (12-bit) für Analog-Sensoren | GPIO | 0-4095 | ❌ Keine ADC2-WiFi-Konflikt-Erkennung (WiFi aktiv = ADC2 disabled) |
| **SensorRegistry** | Sensor-Typ-Mapping ESP32↔Server | Sensor-Type String ("moisture") | SensorCapability (device_type, i2c_address, is_multi_value) | ✅ Case-insensitive, Aliases unterstützt |
| **SensorCommand Queue** | FIFO-Queue (Core 0 MQTT-Task → Core 1 Safety-Task) | MQTT-Message auf `sensor/{gpio}/command` | Command in SensorCommand struct | ❌ Queue-Größe=10, Full → Blockerung (20ms Timeout), dann Verlustvermerk |
| **processSensorCommandQueue()** | Dequeue, TTL-Prüfung, Admission-Check, Handler-Aufruf | Queue-Item mit Metadata, Admission-Context | Command-Outcome (applied/failed/expired) | ✅ TTL-Validierung, Admission-Gating, Outcome-Publishing vorhanden |
| **handleSensorCommand()** | Payload-Parse, GPIO-Extraktion, Dispatch | MQTT-Topic+Payload, request_id | Boolean success, optional Response-Publish | ❌ Keine Intent-Metadata in Response; Correlation über request_id nur |
| **MQTTClient.publish()** | Pub-Request → ESP-IDF MQTT oder Queue | Topic, Payload, QoS | msg_id ≥0 oder Queue-Enqueue | ❌ Outbox-Full (-2) → Circuit-Breaker-Fail, aber kein Retry-Default |
| **MQTTClient.processPublishQueue()** | Drain Core 1→0 Queue, Retry bei Fehler | PublishRequest (topic/payload/metadata) | esp_mqtt_client_publish() Aufruf | ✅ Critical-Publish 3x Retry, Non-Critical 1x; Outcome-Publishing |
| **IntentMetadata** | TTL-Tracking, Correlation, Epoch-Invalidierung | Command-Payload JSON | metadata struct (intent_id, ttl_ms, epoch) | ❌ TTL-Fallback auf "sensor_*" Prefix wenn nicht im Payload |
| **CommandAdmission** | Gating-Logik (Registrierung, Safe-Mode, State) | Admission-Context | Decision (accepted/rejected) mit Reason-Code | ✅ Safety-Epoch-Check, Recovery-Intent-Priority |
| **publishIntentOutcome()** | Outcome-Publishing für Commands/Publishes | flow, metadata, outcome, code, reason | Intent-Outcome-Message auf System-Topic | ⚠️ Outbox bei MQTT-Fehler, aber Fallback auf NVS nur für Critical |

---

## 2. Sequenzdiagramm: On-Demand Messung

### Happy Path (Messung erfolgreich)

```
Server (God-Kaiser)                MQTT Broker                    ESP32 (Core 0/1)
   │                                   │                              │
   ├─ publish → sensor/{gpio}/command ─┤ (QoS=2)                    │
   │ {"command":"measure",             │                             │
   │  "request_id":"req-123",          │                             │
   │  "intent_id":"int-456",           │                             │
   │  "correlation_id":"cor-789",      │                             │
   │  "ttl_ms":60000}                  │                             │
   │                                   ├─→ MQTT-Task (Core 0)        │
   │                                   │   queueSensorCommand()      │
   │                                   │   → g_sensor_cmd_queue      │
   │                                   │                             │
   │                                   │                     Safety-Task (Core 1)
   │                                   │                     ├─ processSensorCommandQueue()
   │                                   │                     ├─ TTL-Check: ✅ within ttl_ms
   │                                   │                     ├─ Epoch-Check: ✅ not invalidated
   │                                   │                     ├─ Admission: ✅ registered
   │                                   │                     ├─ handleSensorCommand()
   │                                   │                     │  ├─ Parse JSON
   │                                   │                     │  ├─ Extract GPIO
   │                                   │                     │  └─ triggerManualMeasurement(gpio)
   │                                   │                     │     ├─ Find SensorConfig
   │                                   │                     │     ├─ performMeasurement(gpio, reading)
   │                                   │                     │     │  ├─ Read ADC: raw=2250
   │                                   │                     │     │  ├─ Apply local conversion
   │                                   │                     │     │  └─ Set quality="good"
   │                                   │                     │     └─ publishSensorReading(reading)
   │                                   │                     │        ├─ Update value_cache
   │                                   │                     │        ├─ Check Registration: ✅
   │                                   │                     │        └─ Publish: sensor/{gpio}/data
   │                                   │                             (Core 1→Queue)
   │                                   │                     ├─ publishIntentOutcome()
   │                                   │                     │  └─ flow="command"
   │                                   │                     │     outcome="applied"
   │                                   │                     │     code="NONE"
   │                                   │                     └─ return true
   │                                   │
   │                                   ├─ sensor/{gpio}/data ←─────── ESP32
   │ ← subscribe sensor/{gpio}/data ──┤ (QoS=1)  raw=2250, value=...
   │   Bodenfeuchte erhalten
   │
   │                                   ├─ system/intent_outcome ←──── ESP32
   │ ← (asynchron)                    ┤ (flow="command", outcome="applied")
```

### Failure Path 1: Sensor-Command-Queue voll

```
MQTT-Task (Core 0)
├─ Message auf sensor/{gpio}/command empfangen
└─ queueSensorCommand(...)
   ├─ xQueueSend(g_sensor_cmd_queue, &cmd, 0)
   │  └─ pdFALSE (Queue voll: 10/10 Einträge)
   ├─ LOG_W: "Sensor command queue full — dropping"
   ├─ errorTracker.logApplicationError(ERROR_TASK_QUEUE_FULL)
   └─ return false

⚠️ STILLE VERLUSTVERMERK: Command-Outcome wird NICHT publiziert!
   (Dropout before admission gate)
```

### Failure Path 2: TTL expired

```
Safety-Task (Core 1)
├─ processSensorCommandQueue()
├─ getIntentInvalidationReason(cmd.metadata, epoch)
│  └─ TTL_EXPIRED (created_at_ms + ttl_ms < now)
├─ publishIntentOutcome()
│  └─ outcome="expired"
│     code="TTL_EXPIRED"
│     reason="Sensor command TTL expired before execution"
└─ continue (drop command, count as processed)

✅ Outcome publiziert; Command nicht ausgeführt.
```

### Failure Path 3: Sensor-Circuit-Breaker OPEN

```
SensorManager::performAllMeasurements()
├─ Check: sensors_[i].cb_state == SensorCBState::OPEN
├─ elapsed = now - sensors_[i].cb_open_since_ms
├─ if (elapsed < CB_PROBE_INTERVAL_MS)  // 5 minutes
│  └─ continue (SKIP this sensor, keine Messung)
└─ LOG (keine Error-Telemetrie für Skipping)

⚠️ STILLE VERLUSTVERMERK: Messung silent skipped;
   keine intent_outcome publiziert (nicht command-flow).
```

### Failure Path 4: Registration-Gate OPEN

```
SensorManager::publishSensorReading()
├─ if (!mqtt_client_->isRegistrationConfirmed())
├─ LOG_W: "Registration pending (no heartbeat ACK), skipping publish"
└─ return (stille Verlustvermerk)

⚠️ SILENT DROP: Messung wurde gemacht, Publish blockiert!
   Wert in value_cache aber nicht in MQTT.
```

### Failure Path 5: MQTT Outbox voll (Publish-Queue)

```
MQTTClient::publish() vom Core 1 aus
├─ xPortGetCoreID() == 1 → Queue-Enqueue
├─ queuePublish(..., critical=false)  ← Sensor-Data ist Non-Critical
└─ xQueueSend(g_publish_queue, &req, 0)  → pdFALSE

MQTTClient::processPublishQueue()
├─ esp_mqtt_client_publish(...) → msg_id=-2 (Outbox full)
├─ if (!req.critical)
│  └─ publishIntentOutcome("publish", ..., "failed", "PUBLISH_OUTBOX_FULL")
└─ ⚠️ Messwert verloren, aber Outcome versendet (best-effort)
```

---

## 3. Contract-Tabelle: Relevante MQTT-Payloads

### 3.1 Sensor-Data (ESP→Server)

| Feld | Typ | Quelle | Semantik | Validierung |
|------|-----|--------|----------|-------------|
| `esp_id` | string | ConfigManager | Device-ID für Korrelation | 12 Zeichen, alphanumeric |
| `seq` | uint32_t | MQTTClient.publish_seq_ | Sequenznummer (monotonisch) | ≥ 0 |
| `zone_id` | string | extern g_kaiser | Hierarchie-Level 1 | case-sensitive |
| `subzone_id` | string | SensorConfig.subzone_id | Hierarchie-Level 2, Phase 9 | "" oder valide ID |
| `gpio` | uint8_t | SensorConfig.gpio | Pin-Nummer | 0-48 (ESP32) |
| `sensor_type` | string | SensorConfig.sensor_type | "moisture", "ds18b20", etc. | Registry-Lookup erfolgreich |
| `raw` | int32_t | Raw ADC/OneWire-Wert | Rohwert direkt vom Sensor | -2048...+2048 für signed (DS18B20) |
| `value` | float | applyLocalConversion() | Preview-Wert (NICHT kanonisch!) | Server ignoriert, nutzt nur `raw` |
| `unit` | string | applyLocalConversion() | Preview-Unit | "raw", "%", "°C", etc. |
| `quality` | string | performMeasurementForConfig() | Messgüte (good/fair/poor/bad/stale) | Enum-Prüfung Server-seitig |
| `ts` | uint32_t (Unix) | TimeManager.getUnixTimestamp() | Server-seitige Synchronisierung via NTP | ≥ 0, Diskontinuitäts-Erkennung |
| `raw_mode` | bool | SensorConfig.raw_mode | **IMMER true** — Server re-prozessiert | 必须 == true |
| `onewire_address` | string | SensorConfig.onewire_address | ROM-Code (OneWire-Sensoren nur) | 16 Hex-Zeichen oder "" |
| `i2c_address` | uint8_t | SensorConfig.i2c_address | I2C-Adresse (I2C-Sensoren nur) | 0x00-0x7F oder 0 |

**Hinweis zu `raw` bei Bodenfeuchte (Analog ADC):**
- Wert-Range: 0-4095 (12-bit ADC)
- Keine Vorzeichen-Konvertierung (unsigned)
- Server fügt Kalibrierung + Bereichs-Mapping durch (z.B. 0%...100%)

---

### 3.2 Sensor-Command (Server→ESP)

| Feld | Typ | Semantik | Quelle | Validierung |
|------|-----|----------|--------|-------------|
| `command` | string | Aktion (z.B. "measure") | Server JSON | "measure" (einziger Wert aktuell) |
| `request_id` | string | Korrelations-Handle (optional) | Server JSON | wird in Response echoiert |
| `intent_id` | string | Intent-Tracking | Server JSON (Epic1-05) | UUID oder Fallback |
| `correlation_id` | string | Cross-System-Korrelation | Server JSON | UUID-Format |
| `ttl_ms` | uint32_t | Time-to-Live | Server JSON | default 60000ms (60s) |
| `epoch_at_accept` | uint32_t | Safety-Epoch bei Accept | Server JSON (optional) | für Invalidierungs-Check |

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/command`
**QoS:** 2 (exactly once)

---

### 3.3 Intent-Outcome (ESP→Server)

| Feld | Typ | Semantik | Publikationspunkt |
|------|-----|----------|-------------------|
| `flow` | string | "command" (für Sensor-Commands) | processSensorCommandQueue() |
| `outcome` | string | "applied" / "failed" / "expired" / "rejected" | handleSensorCommand() return value |
| `code` | string | ERROR_CODE (z.B. "EXECUTE_FAIL", "TTL_EXPIRED") | based on failure reason |
| `reason` | string | Human-readable (z.B. "Sensor not found on GPIO 5") | detailed error message |
| `intent_id` | string | Korrelation zurück zu Command | cmd.metadata.intent_id |
| `correlation_id` | string | Cross-System-Tracking | cmd.metadata.correlation_id |
| `retryable` | bool | Server soll Retry versuchen? | false für TTL/Admission, true für Transient |

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/intent_outcome`
**QoS:** 1
**Timing:** Sofort nach Command-Verarbeitung oder nach Timeout-Drop

---

## 4. Stille Verluststellen und deren Sichtbarkeit

| Verlustvermerk | Punkt | Sichtbarkeit | Häufigkeit | Bemerkung |
|---|---|---|---|---|
| **1. Sensor-Command-Queue voll** | queueSensorCommand() | 🟡 LOG_W + errorTracker | Häufig bei High Load | Outcome wird NICHT publiziert (Dropout vor Admission) |
| **2. TTL Expired** | processSensorCommandQueue() | 🟢 intent_outcome (expired) | Selten bei vernünftigen TTLs | Outcome: "expired", retryable=false |
| **3. Sensor-CB OPEN** | performAllMeasurements() | 🔴 KEINE Telemetrie | Möglich bei defektem Sensor | CB probt alle 5min; Silent Skip ohne Outcome |
| **4. Registration-Gate closed** | publishSensorReading() | 🟡 LOG_W | Normalerweise ≤5s nach Boot | Messung gemacht, aber nicht publiziert; in value_cache |
| **5. MQTT Publish-Outbox voll** | processPublishQueue() | 🟢 intent_outcome (failed) nur Critical | Non-Critical Sensor-Data: 🔴 Silent Drop | Sensor-Data ist Non-Critical → kein Outcome |
| **6. MQTT Disconnected** | publishSensorReading() | 🟡 LOG_W | Transient bei Netzwerk-Fehler | Messung in value_cache, warten auf Reconnect |
| **7. I2C Bus nicht init** | configureSensor() oder measurement | 🟢 errorTracker | Bei Config-Fehler | Circuit Breaker tritt in Aktion |
| **8. OneWire ROM-Code ungültig** | performMeasurementForConfig() | 🟢 errorTracker + quality=stale | Config-Fehler | CB Penalität nach 10 Fehlern |
| **9. Multi-Wert-Sensor Timeout** | performMultiValueMeasurement() | 🟡 Silent bei Timeout | I2C-Bus-Fehler | Measurement-Attempt wiederholt im Intervall |

**Legende:**
- 🟢 **Sichtbar:** Telemetrie vorhanden (Log, Error-Tracker, Intent-Outcome)
- 🟡 **Partiell:** Nur in bestimmten Bedingungen sichtbar
- 🔴 **Stille Verlust:** Keine Telemetrie, nur im Vergleich mit erwarteter Häufigkeit erkennbar

---

## 5. P0/P1/P2 Gap-Liste mit Implementierungsplan

### P0: Kritisch für Kalibrierflow

| Nummer | Gap | Auswirkung | Behebung | Aufwand |
|--------|-----|-----------|----------|---------|
| **P0-1** | Sensor-Command-Queue nur 10 Plätze; voll → stille Verlustvermerk | On-Demand-Messungen bei High Load blockiert; Server erhält KEIN Outcome | Größe auf 20-30 erhöhen; `SENSOR_CMD_QUEUE_SIZE` in sensor_command_queue.h | 1h |
| **P0-2** | Publish-Outbox (-2) Handling: Non-Critical Sensor-Data stillschweigend verloren | Messwerte bei MQTT-Überlast nicht publiziert, keine Telemetrie | (a) Sensor-Data als Critical markieren ODER (b) Retry-Logik für Sensor-Data | 2h |
| **P0-3** | Kein Timeout-Guard für On-Demand Messung; hängt bis 100ms (OneWire 3x Retry) | Langsame Commands können Safety-Task blockieren | triggerManualMeasurement() mit timeout_ms Parameter; xTaskNotifyWait() statt blocking | 3h |

### P1: Wichtig für Robustheit

| Nummer | Gap | Auswirkung | Behebung | Aufwand |
|--------|-----|-----------|----------|---------|
| **P1-1** | Registration-Gate blockiert Sensor-Publish still (nicht in Outcome tracking) | Kalibrier-Messwerte verloren in den ersten Sekunden nach Boot | Fallback: Publish mit reduzierter QoS oder gepuffert bis Registration offen | 2h |
| **P1-2** | Sensor-Command Response hat keine Intent-Metadata (nur request_id) | Server kann Respons nicht zu Befehl korrelieren wenn request_id fehlt | Intent-Metadata in Response-Payload kopieren (intent_id, correlation_id) | 1h |

### P2: Verbesserung Langfrist

| Nummer | Gap | Auswirkung | Behebung | Aufwand |
|--------|-----|-----------|----------|---------|
| **P2-1** | ADC2 WiFi-Konflikt nicht erkannt; Messung schlägt still fehl bei ADC2 | Bodenfeuchte-Messung auf ADC2 GPIO (z.B. GPIO 7-11) wird `analog(pin)=0` | GPIO-Registry-Check in SensorManager gegen ADC2-Set bei WiFi aktiv | 1h |
| **P2-2** | Keine Sanity-Checks auf Raw-ADC-Range; 0 oder 4095 (Fehler-Indikatoren) werden nicht erkannt | Offene oder kurz schlossene ADC-Leitungen geben Messwerte → Server-seitige Einfiltration | Optional: Client-seitige Range-Check (0-100) für Bodenfeuchte setzen | 1h |
| **P2-3** | Circuit-Breaker nach 10 Fehlern OPEN; probt nur alle 5 Min → lange Blind-Zeit | Defekter Sensor ist 5 Minuten offline bevor es bemerkt wird | CB-Probe-Interval auf 1 Min reduzieren (Konfigurierbar) | 0.5h |

---

## 6. Bodenfeuchte-spezifische Analyse

### 6.1 Sensor-Registrierung und Typnormalisierung

**Datei:** `/sessions/happy-beautiful-feynman/mnt/Auto-one/El Trabajante/src/models/sensor_registry.cpp` Zeilen 125-131

```cpp
static const SensorCapability MOISTURE_CAP = {
    .server_sensor_type = "moisture",
    .device_type = "moisture",
    .i2c_address = 0x00,  // Not I2C
    .is_multi_value = false,
    .is_i2c = false,
};

// Aliases:
{"moisture", &MOISTURE_CAP},
{"soil_moisture", &MOISTURE_CAP},  // Alias — canonical name is "moisture"
```

**Typnormalisierung:**
- Kanonischer Name: `"moisture"`
- Alias: `"soil_moisture"` (beide Varianten akzeptiert)
- Interface: Analog ADC (0-4095, 12-bit)
- Multi-Value: NEIN (Single-Value-Sensor)
- I2C-Adresse: 0x00 (nicht relevant)
- Keine OneWire (no ROM-Code needed)

**GPIO-Anforderungen:**
- ADC1 Pins bevorzugt (GPIO 32-39): WiFi-frei, keine Konflikte
- ADC2 Pins (GPIO 0, 2, 4, 12-15, 25-27): KONFLIKT bei WiFi aktiv → ReadVal=0
- Keine Reservation nötig (ADC ist kollektiv von GPIOManager reserviert)

### 6.2 Messpfad kontinuierlich vs. on-demand

#### 6.2a Kontinuierlicher Zyklus

**Datei:** `/sessions/happy-beautiful-feynman/mnt/Auto-one/El Trabajante/src/services/sensor/sensor_manager.cpp` Zeilen 1194-1371

```
performAllMeasurements() [Core 1, Safety-Task, alle ~30s]
├─ Lock: xSemaphoreTake(g_sensor_mutex)
├─ for each sensor in sensors_[]
│  ├─ Check 1: active flag
│  ├─ Check 2: operating_mode != "paused" && != "on_demand" && != "scheduled"
│  ├─ Check 3: Circuit-Breaker nicht OPEN (oder Probe-Interval elapsed)
│  ├─ Check 4: Interval elapsed (now - last_reading ≥ measurement_interval_ms)
│  ├─ Update last_reading = now  (IMMER, auch bei Fehler)
│  ├─ performMeasurementForConfig(config, reading)
│  │  ├─ readRawAnalog(gpio)  → ADC 0-4095
│  │  ├─ applyLocalConversion("moisture", raw)  → raw passthrough (kein Formula!)
│  │  └─ return SensorReading (raw_value, quality, error_message)
│  └─ publishSensorReading(reading)  [via Publish-Queue zu Core 0]
│     ├─ Check Registration-Gate: if not confirmed → silent drop
│     ├─ Publish auf Topic: sensor/{gpio}/data
│     └─ Update value_cache_ for OfflineMode-Evaluation
└─ Unlock: xSemaphoreGive(g_sensor_mutex)
```

**Guard-Logik:** `operating_mode`
- `"continuous"` → wird in jedem Zyklus gemessen ✅
- `"on_demand"` → skipped in Loop, nur via Command ✅
- `"paused"` → nie gemessen ✅
- `"scheduled"` → Server-Command für Trigger (Phase 2D, noch nicht impl.)

**Intervall-Granularität:** Pro-Sensor (nicht global)
- `sensors_[i].measurement_interval_ms` Standard 30000 ms
- Fallback auf global `measurement_interval_` wenn 0
- Kein Drift-Correction (naiver Intervall-Reset)

#### 6.2b On-Demand Trigger

**Datei:** `/sessions/happy-beautiful-feynman/mnt/Auto-one/El Trabajante/src/services/sensor/sensor_manager.cpp` Zeilen 1384-1435

```
triggerManualMeasurement(gpio) [Core 1, Safety-Task, on-demand]
├─ Check: initialized_, sensor exists, sensor active
├─ Get SensorCapability (is_multi_value check)
├─ if multi_value
│  └─ performMultiValueMeasurement(gpio, readings[4], 4)  → I2C nur
└─ else (Single-Value, wie "moisture")
   ├─ performMeasurement(gpio, reading)
   │  └─ performMeasurementForConfig(config, reading)
   │     ├─ readRawAnalog(gpio)  → ADC 0-4095
   │     └─ return SensorReading
   ├─ publishSensorReading(reading)  [via Queue]
   └─ config->last_reading = now  (Reset Cycle-Timer)
└─ return true/false
```

**Unterschiede zu Kontinuierlich:**
| Aspekt | Kontinuierlich | On-Demand |
|--------|---|---|
| Trigger | Timer-basiert | Command-basiert |
| Queue-Pfad | Publish-Queue (Core 1→0) | Publish-Queue (Core 1→0) |
| last_reading Reset | IMMER (auch Fehler) | Nur bei success |
| CB-State | Berücksichtigung | Nur wenn already OPEN? (Nein, kein Check!) |
| TTL-Schutz | Keine | Ja (metadata.ttl_ms in Queue) |
| Outcome-Publishing | Keine (nur implizit in quality) | Ja (publishIntentOutcome) |
| Timeout-Guard | Keine | Keine ⚠️ |

**Kritischer Fund:** On-Demand **bypass Circuit-Breaker** vollständig!
- Wenn Sensor CB ist OPEN → `performAllMeasurements()` skipped ihn
- Aber `triggerManualMeasurement()` hat **keinen CB-Check** → trotzdem gemessen
- Gut für Recovery (Manual Override), aber inkonsistent mit CB-Semantik

### 6.3 Command-Lifecycle und Finalitaet

**Datei:** `/sessions/happy-beautiful-feynman/mnt/Auto-one/El Trabajante/src/tasks/sensor_command_queue.cpp` Zeilen 75-128

```
processSensorCommandQueue() [Core 1, Safety-Task, Queue-Drain]
│
├─ xQueueReceive(g_sensor_cmd_queue, &cmd, 0)  [non-blocking]
│
├─ Step 1: TTL-Validierung
│  └─ invalidation_reason = getIntentInvalidationReason(cmd.metadata, epoch)
│     ├─ if TTL_EXPIRED (created_at_ms + ttl_ms < now)
│     │  └─ publishIntentOutcome("command", metadata, "expired", "TTL_EXPIRED")
│     │     return continue (drop)
│     └─ if SAFETY_EPOCH_INVALIDATED (epoch_at_accept != current_epoch)
│        └─ publishIntentOutcome(..., "expired", "SAFETY_EPOCH_INVALIDATED")
│           return continue (drop)
│
├─ Step 2: Admission-Gating
│  ├─ CommandAdmissionContext assembly (registration, state, safe_mode, recovery_intent)
│  ├─ shouldAcceptCommand(CommandSubtype::SENSOR, context)
│  │  └─ if NOT accepted
│  │     ├─ publishIntentOutcome(..., "rejected", code, reason)
│  │     └─ return continue (drop)
│  └─ Possible Rejection Codes:
│     ├─ REGISTRATION_NOT_CONFIRMED (if not isRegistrationConfirmed())
│     ├─ SAFE_MODE_ACTIVE (if STATE_SAFE_MODE)
│     ├─ SYSTEM_ERROR (if STATE_ERROR)
│     └─ RECOVERY_INTENT_REQUIRED (if recovery needed)
│
├─ Step 3: Execution
│  ├─ handleSensorCommand(topic, payload)
│  │  ├─ Parse JSON: extract "command", "request_id"
│  │  ├─ Extract GPIO from topic: `/sensor/{gpio}/command`
│  │  ├─ if command == "measure"
│  │  │  ├─ sensorManager.triggerManualMeasurement(gpio)
│  │  │  │  └─ (see 6.2b above)
│  │  │  ├─ if request_id provided
│  │  │  │  └─ Publish Response-JSON on sensor/{gpio}/response
│  │  │  │     (Separate MQTT-Publish, kein Intent-Metadata!)
│  │  │  └─ return success boolean
│  │  └─ else (unknown command)
│  │     └─ return false
│  │
│  └─ Publish Outcome
│     └─ publishIntentOutcome("command",
│           metadata,
│           ok ? "applied" : "failed",
│           ok ? "NONE" : "EXECUTE_FAIL",
│           reason_string,
│           !ok)
│
└─ count++ processed items (max 4 per cycle)
```

**Terminal Outcomes (Sensor-Command):**

| Outcome | Code | Bedingung | Server-Aktion |
|---------|------|-----------|---------------|
| `applied` | NONE | Messung erfolgreich durchgeführt | Aktualisierung, Kalibrierung möglich |
| `failed` | EXECUTE_FAIL | Messung gelang nicht (GPIO ungültig, etc.) | Retry oder Diagnostik |
| `expired` | TTL_EXPIRED | Command TTL überschritten | Nicht neu versendet |
| `expired` | SAFETY_EPOCH_INVALIDATED | Safety-Epoch gewechselt (Notfall-Ereignis) | Abort, nicht retry |
| `rejected` | REGISTRATION_NOT_CONFIRMED | ESP nicht registriert | Retry nach Registrierung |
| `rejected` | SAFE_MODE_ACTIVE | Sicherheitsmodus aktiv | Abwarten oder Notfall-Befehl |

**Kritischer Fund:** Response-Publish hat **keine Intent-Metadata**!
- `handleSensorCommand()` publiziert optional `sensor/{gpio}/response`
- Payload enthält nur: `request_id`, `gpio`, `command`, `success`, `ts`, `seq`
- **Fehlende Felder:** `intent_id`, `correlation_id`, `ttl_ms`
- **Konsequenz:** Server kann Response nicht zu Original-Command korrelieren wenn `request_id` fehlt

---

## 7. Publish-/Drop-/Recovery-Verhalten

### 7.1 Sensor-Data-Publish (Kontinuierlich + On-Demand)

**Datei:** `/sessions/happy-beautiful-feynman/mnt/Auto-one/El Trabajante/src/services/communication/mqtt_client.cpp` Zeilen 419-527

```
MQTTClient::publish(topic, payload, qos=1)  [kann von Core 0 oder 1 sein]
│
├─ Circuit-Breaker: if service DOWN → block
├─ Registration-Gate: if not confirmed && !is_heartbeat → block (silent)
├─ Payload-Check: if empty → block + error-track
│
├─ if (xPortGetCoreID() == 1)  [Safety-Task aus Sensor-Loop]
│  └─ Queue-Path: queuePublish(topic, payload, qos, false, isCriticalPublishTopic(topic))
│     ├─ Sensor-Data ist **Non-Critical**!
│     ├─ xQueueSend(g_publish_queue, &req, 0)  [non-blocking]
│     └─ if queue full
│        ├─ LOG_W: "Publish queue full — dropping"
│        ├─ circuit_breaker_.recordFailure()
│        └─ return false (Command-Flow publiziert Outcome="failed")
│
└─ if (xPortGetCoreID() == 0)  [Core 0 direct, selten]
   └─ Direct: esp_mqtt_client_publish() → msg_id
      ├─ ≥0: success
      ├─ -1: error (retry via Queue later)
      ├─ -2: outbox full (non-critical Drop)
      └─ Circuit-Breaker Transition
```

**Kritisches Detail: Sensor-Data ist Non-Critical**
- `isCriticalPublishTopic(topic)` prüft auf "/error", "/config", "/command"
- Sensor-Data-Topic `/sensor/{gpio}/data` → NOT critical
- Implication: Bei MQTT Outbox-Full → **stille Drop ohne Outcome-Publish**

### 7.2 Retry-Logik in processPublishQueue()

**Datei:** `/sessions/happy-beautiful-feynman/mnt/Auto-one/El Trabajante/src/services/communication/mqtt_client.cpp` Zeilen 685-726

```
processPublishQueue() [Core 0, CommunicationTask, regelmässig aufgerufen]
│
├─ for each req in g_publish_queue
│  ├─ esp_mqtt_client_publish(req.topic, req.payload, req.qos)
│  │  └─ msg_id ≥0 (OK) oder <0 (Fehler)
│  │
│  ├─ if msg_id ≥ 0
│  │  └─ continue (next item, success)
│  │
│  └─ else if msg_id < 0
│     ├─ if (req.critical && req.attempt < 3)
│     │  ├─ req.attempt++
│     │  └─ xQueueSend(g_publish_queue, &req, 0)  [re-queue]
│     │     └─ if queue full
│     │        └─ publishIntentOutcome("publish", ..., "failed", "QUEUE_FULL")
│     │
│     └─ else  [non-critical oder attempts exhausted]
│        └─ publishIntentOutcome("publish",
│             req.metadata,
│             "failed",
│             msg_id == -2 ? "PUBLISH_OUTBOX_FULL" : "EXECUTE_FAIL",
│             drop_reason,
│             req.critical)  [retryable=true für critical]
```

**Retry-Matrix:**
| req.critical | attempt | msg_id=-2 | Aktion |
|---|---|---|---|
| ✅ Yes | 1-2 | Any | Re-queue (attempt++) |
| ✅ Yes | 3 | Any | Drop + Outcome(retryable=true) |
| ❌ No | Any | -2 | Drop + Outcome(retryable=false) |
| ❌ No | Any | -1 | Drop + Outcome(retryable=false) |

**Konsequenz:** Sensor-Data (Non-Critical) hat **KEINE Retry-Logik**!
- 1. Attempt scheitert mit -2 (Outbox voll) → sofort raus, Outcome publiziert
- Outcome-Publish selbst ist Critical → wird 3x versucht

### 7.3 Registration-Gate (SAFETY-P1 Mechanism)

**Datei:** `/sessions/happy-beautiful-feynman/mnt/Auto-one/El Trabajante/src/services/communication/mqtt_client.cpp` Zeilen 440-453

```
isRegistrationConfirmed() prüfung
├─ if !registration_confirmed_
│  └─ if (registration_start_ms_ > 0 &&
│        (millis() - registration_start_ms_) > REGISTRATION_TIMEOUT_MS)  // 30s
│     ├─ LOG_W "Registration timeout - gate remains CLOSED"
│     ├─ registration_timeout_logged_ = true
│     └─ return false (gate BLEIBT closed bis heartbeat ACK!)
│
└─ else [gate is open]
   └─ return true (allow publish)
```

**Verhalten:**
- Nach Boot: `registration_confirmed_ = false`
- Heartbeat gesendet → Server antwortet mit `heartbeat/ack`
- MQTTClient erhält ACK-Event → `confirmRegistration()` gesetzt
- **Fallback:** Timeout nach 30s ohne ACK → Gate bleibt geschlossen!
  - Sensor-Publish blockiert still
  - Werte in value_cache aber nicht in MQTT
  - Fehler-Telemetrie (Heartbeat-NACK) wird publiziert

---

## 8. Implementierungsplan ESP32 (8 Pakete mit Testpflicht)

### Paket 1: Sensor-Command-Queue Vergrösserung (P0-1)
**Scope:** 1 Datei, 30 Minuten
**Änderung:** `sensor_command_queue.h` Zeile 7
```cpp
// von:
static const uint8_t SENSOR_CMD_QUEUE_SIZE = 10;
// zu:
static const uint8_t SENSOR_CMD_QUEUE_SIZE = 20;
```
**Test:** Stress-Test mit 15 parallelen `measure`-Commands → alle sollen queued werden
**Verifikation:** `pio run -e seeed` erfolgreich

---

### Paket 2: Sensor-Data als Critical markieren (P0-2a)
**Scope:** 2 Dateien, 45 Minuten
**Änderung:**
- `mqtt_client.cpp` Zeile 471: `isCriticalPublishTopic(topic)` für Sensor-Data auf true
- Test-Pfad: `/sensor/` → critical=true, `/temp/data` → non-critical weiterhin

```cpp
// sensor_manager.cpp:1617 in publishSensorReading()
// Vor Publish:
bool is_sensor_data = topic.indexOf("/sensor/") != -1;
// Dann publish mit critical=true
```

**Test:** Messwerte bei Outbox-Full sollten 3x retry bekommen
**Verifikation:** pytest + Wokwi-Simulation mit MQTT-Drosselung

---

### Paket 3: On-Demand Timeout-Guard (P0-3)
**Scope:** 2 Dateien, 2 Stunden
**Änderung:**
- `sensor_manager.h`: `bool triggerManualMeasurement(uint8_t gpio, uint32_t timeout_ms = 5000);`
- `sensor_manager.cpp`: `performMeasurementForConfig()` mit xTaskNotifyWait-Wrapper

```cpp
// Pseudocode:
bool SensorManager::triggerManualMeasurement(uint8_t gpio, uint32_t timeout_ms) {
    // ...
    SensorReading reading;
    uint32_t start_ms = millis();
    bool success = performMeasurementForConfig(config, reading);
    // Prüfe elapsed
    if ((millis() - start_ms) > timeout_ms) {
        LOG_W("Measurement timeout - may block Safety-Task");
        return false;  // Timeout-Penalität
    }
    // ...
}
```

**Test:** Manual `measure` mit I2C-Bus-Fehler (stellt i2c_bus->isInitialized() false) → sollte schnell timeout
**Verifikation:** Safety-Task sollte nicht blockieren (WDT-Monitoring)

---

### Paket 4: Response-Payload Intent-Metadata (P1-2)
**Scope:** 1 Datei, 1 Stunde
**Änderung:** `main.cpp` Zeile 3964-3977 in `handleSensorCommand()`

```cpp
// Vor: Response hat nur request_id, gpio, command, success, ts, seq
// Nach: Zusätzlich intent_id, correlation_id, ttl_ms aus cmd.metadata

// Response-Building-Code mit IntentMetadata:
response["intent_id"] = cmd.metadata.intent_id;
response["correlation_id"] = cmd.metadata.correlation_id;
response["ttl_ms"] = cmd.metadata.ttl_ms;
```

**Test:** Command mit intent_id → Response muss intent_id enthalten
**Verifikation:** JSON-Parse + Vergleich intent_id in/out

---

### Paket 5: Circuit-Breaker Bypass Check bei On-Demand (Optional P2-Verbesserung)
**Scope:** 1 Datei, 30 Minuten
**Änderung:** `sensor_manager.cpp` Zeile 1403-1404 in `triggerManualMeasurement()`

```cpp
// Optional: CB-State warnen (nicht blocken - Manual Override)
if (config->cb_state == SensorCBState::OPEN) {
    LOG_I(TAG, "Note: Sensor CB is OPEN but proceeding (manual override)");
}
// Measurement continues...
```

**Test:** Defekter Sensor (CB OPEN) + Manual Measure → soll weiterhin messen (mit Warnung)
**Verifikation:** Log-Ausgabe "Note: Sensor CB is OPEN"

---

### Paket 6: ADC2-WiFi-Konflikt-Erkennung (P2-1)
**Scope:** 1 Datei, 1.5 Stunden
**Änderung:** `sensor_manager.cpp` in `readRawAnalog()` Zeile 1440+

```cpp
uint32_t SensorManager::readRawAnalog(uint8_t gpio) {
    if (!initialized_) return 0;

    // ADC2 is disabled when WiFi is active
    const uint8_t ADC2_PINS[] = {0, 2, 4, 12, 13, 14, 15, 25, 26, 27};
    bool is_adc2_pin = false;
    for (auto pin : ADC2_PINS) {
        if (gpio == pin) {
            is_adc2_pin = true;
            break;
        }
    }

    if (is_adc2_pin && WiFi.isConnected()) {
        LOG_W(TAG, "ADC2 GPIO %d disabled due to WiFi — returning 0", gpio);
        errorTracker.trackError(ERROR_ADC_CONFLICT, "ADC2-WiFi conflict");
        return 0;
    }

    return analogRead(gpio);
}
```

**Test:** WiFi aktiv + GPIO 7 als Bodenfeuchte → analogRead sollte 0 mit Warning
**Verifikation:** errorTracker sollte ERROR_ADC_CONFLICT enthalten

---

### Paket 7: Publish-Queue Size Erhöhung (Robustness)
**Scope:** 1 Datei, 15 Minuten
**Änderung:** `mqtt_client.h` oder `mqtt_client.cpp` (queueHandle-Größe)

```cpp
// Wenn queueHandle als Variable definiert:
// g_publish_queue = xQueueCreate(PUBLISH_QUEUE_SIZE, sizeof(PublishRequest));
// Erhöhe PUBLISH_QUEUE_SIZE von (angenommen 20) auf 50

static const uint16_t PUBLISH_QUEUE_SIZE = 50;
```

**Test:** 40 schnelle Messwerte in Serie → alle sollten queued, nicht dropped
**Verifikation:** pio run, kein Memory-Overflow

---

### Paket 8: Integration + Systemtest (Kalibrierflow End-to-End)
**Scope:** Test-Framework, 2 Stunden
**Testfall:** Bodenfeuchte-Kalibrierung mit Messpunkten

```
1. Server sendet Sensor-Command mit intent_id + correlation_id
2. ESP empfängt, führt Messung aus
3. ESP publiziert:
   - sensor/{gpio}/data mit raw-Wert
   - system/intent_outcome mit "applied"
   - sensor/{gpio}/response mit Intent-Metadata
4. Server validiert:
   - alle 3 MQTT-Messages eingetroffen
   - intent_id konsistent
   - raw-Wert im gültigen Bereich (0-4095)
5. Wiederhole mit 5 Messpunkten (0%, 25%, 50%, 75%, 100% Bodenfeuchte)
```

**Test:** pytest + Wokwi MQTT-Simulation
**Verifikation:** Integration-Test in `/sessions/happy-beautiful-feynman/mnt/Auto-one/El Trabajante/test/`

---

## Zusammenfassung: Wirkung auf Kalibrierflow

### Vorher (aktuell):
- ❌ Auf-Demand-Command bei High Load: Queue voll → Blockerung ohne Outcome
- ❌ Sensor-Data bei MQTT-Überlast: Stille Drop, keine Telemetrie
- ❌ Response hat keine Intent-Correlation → Server verliert Tracking
- ⚠️ On-Demand Timeout-Guard fehlt → kann Safety-Task blockieren
- ⚠️ Registration-Gate: Kalibrier-Messwerte gehen in den ersten Sekunden verloren

### Nachher (mit P0 + P1 Fixes):
- ✅ Queue 2x grösser: On-Demand-Command robuster bei Last
- ✅ Sensor-Data Retry-Logik: Messwerte bei Outbox-Full 3x versucht
- ✅ Response mit Intent-Metadata: Server kann Respons korrelieren
- ✅ Timeout-Guard: On-Demand blockiert Safety-Task max 5s
- ✅ Fallback bei Registration: Messwerte gepuffert/mit reduzierter QoS

### Kalibrierflow-Stabilität: **From Fair → Good**

---

## Dateireferenzen

### Core Firmware-Dateien:
- `/sessions/happy-beautiful-feynman/mnt/Auto-one/El Trabajante/src/models/sensor_registry.cpp` — Sensor-Registrierung, Zeilen 125-131 (Bodenfeuchte)
- `/sessions/happy-beautiful-feynman/mnt/Auto-one/El Trabajante/src/models/sensor_types.h` — SensorConfig, SensorReading Structs
- `/sessions/happy-beautiful-feynman/mnt/Auto-one/El Trabajante/src/services/sensor/sensor_manager.h` — Interface, Zeile 22-213
- `/sessions/happy-beautiful-feynman/mnt/Auto-one/El Trabajante/src/services/sensor/sensor_manager.cpp` — Impl., Zeilen 1-1700+
  - Kontinuierliche Messung: Zeilen 1194-1371 (performAllMeasurements)
  - On-Demand Trigger: Zeilen 1384-1435 (triggerManualMeasurement)
  - Publish: Zeilen 1593-1672 (publishSensorReading, buildMQTTPayload)
- `/sessions/happy-beautiful-feynman/mnt/Auto-one/El Trabajante/src/tasks/sensor_command_queue.h` — Queue-Def., Zeile 7 (QUEUE_SIZE)
- `/sessions/happy-beautiful-feynman/mnt/Auto-one/El Trabajante/src/tasks/sensor_command_queue.cpp` — Queue-Verarbeitung, Zeilen 75-128 (processSensorCommandQueue)
- `/sessions/happy-beautiful-feynman/mnt/Auto-one/El Trabajante/src/tasks/intent_contract.h` — Intent-Metadata-Def., Zeilen 9-29
- `/sessions/happy-beautiful-feynman/mnt/Auto-one/El Trabajante/src/services/communication/mqtt_client.h` — MQTT-Pub, Zeile 97-98 (publish)
- `/sessions/happy-beautiful-feynman/mnt/Auto-one/El Trabajante/src/services/communication/mqtt_client.cpp` — MQTT-Impl.
  - Publish: Zeilen 419-527
  - Queue-Drain: Zeilen 685-726
- `/sessions/happy-beautiful-feynman/mnt/Auto-one/El Trabajante/src/main.cpp` — Command-Handler, Zeilen 3923-3991 (handleSensorCommand)

### Referenzdokumente:
- `/sessions/happy-beautiful-feynman/mnt/Auto-one/.claude/reference/api/MQTT_TOPICS.md` — MQTT-Spec, Zeile 1+ (Sensor Topics, Command Format)
- `/sessions/happy-beautiful-feynman/mnt/Auto-one/.claude/reference/patterns/ARCHITECTURE_DEPENDENCIES.md` — System-Dependencies, Zeile 1-502
- `/sessions/happy-beautiful-feynman/mnt/Auto-one/.claude/reference/patterns/COMMUNICATION_FLOWS.md` — Communication-Flows (nicht vollständig gelesen)

---

**Report-Version:** 1.0 | **Erstellt:** 2026-04-06
**Analyst:** A1 (Code-Analyse-Agent) | **Status:** Final
