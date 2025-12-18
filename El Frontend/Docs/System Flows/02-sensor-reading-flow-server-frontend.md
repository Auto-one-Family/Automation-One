# Sensor Reading Flow - Server & Frontend Perspektive

## Overview

Wie Server und Frontend auf ESP32-Sensor-Daten reagieren. Gespiegelte Dokumentation zu `El Trabajante/docs/system-flows/02-sensor-reading-flow.md`.

**Korrespondiert mit:** `El Trabajante/docs/system-flows/02-sensor-reading-flow.md`

---

## Voraussetzungen

- [ ] Server läuft (`localhost:8000`)
- [ ] Frontend läuft (`localhost:5173`)
- [ ] MQTT Broker erreichbar (Mosquitto auf Port 1883)
- [ ] **ESP32 ist registriert und online** (Heartbeat aktiv)
- [ ] Mindestens ein Sensor konfiguriert

---

## Teil 1: ESP32 Sensor-Messzyklus (Zusammenfassung)

### Trigger

- Automatisch alle 30 Sekunden (Default `measurement_interval_`)
- `sensorManager.performAllMeasurements()` in main loop (`sensor_manager.cpp:553-592`)

### Was ESP32 sendet

- **Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data`
- **QoS:** 1 (At least once)
- **Code-Location:** `sensor_manager.cpp:685-703` (publishSensorReading), `topic_builder.cpp:53-58` (Topic-Generierung)

**Payload-Struktur:**

```json
{
    "esp_id": "ESP_12AB34CD",
    "zone_id": "zone_main",
    "subzone_id": "tank_1",
    "gpio": 4,
    "sensor_type": "ph",
    "raw": 2048,
    "value": 7.2,
    "unit": "pH",
    "quality": "good",
    "ts": 1735818000,
    "raw_mode": true
}
```

**Kritische Felder:**

| Feld | Typ | Beschreibung | Code-Location |
|------|-----|--------------|---------------|
| `raw` | Number | Rohwert (ADC/I2C/OneWire) | `sensor_manager.cpp:736-737` |
| `value` | Number | Verarbeiteter Wert (von Pi-Enhanced) | `sensor_manager.cpp:739-740` |
| `ts` | Number | Unix-Timestamp (Sekunden) | `sensor_manager.cpp:748-749` |
| `raw_mode` | Boolean | **IMMER `true`** - ESP32 sendet Raw-Daten | `sensor_manager.cpp:751` |

> **KRITISCH:** `raw_mode: true` wird IMMER gesetzt. Der Server erwartet dieses Feld als Required Field.

---

## Teil 2: Server-Reaktion auf Sensor-Daten

### Server-Verarbeitungs-Flow

```
┌─────────────────────────────────────────────────────────────┐
│     Sensor-Daten empfangen auf MQTT Topic                   │
│   kaiser/god/esp/{esp_id}/sensor/{gpio}/data                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │ 1. Topic parsen → esp_id, gpio│
              │    TopicBuilder.parse_sensor  │
              │    _data_topic()              │
              │    (sensor_handler.py:74)     │
              └───────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │ 2. Payload validieren         │
              │    _validate_payload()        │
              │    (sensor_handler.py:257-310)│
              └───────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │ 3. ESP in DB suchen           │
              │    esp_repo.get_by_device_id()│
              │    (sensor_handler.py:101-104)│
              └───────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │ 4. Sensor-Config laden        │
              │    sensor_repo.get_by_esp     │
              │    _and_gpio()                │
              │    (sensor_handler.py:107-114)│
              └───────────────────────────────┘
                              │
         ┌────────────────────┴────────────────────┐
         │ sensor_config.pi_enhanced               │
         │ AND raw_mode == true?                   │
         │ (sensor_handler.py:130)                 │
         ▼                                          ▼
┌─────────────────────┐                  ┌─────────────────────┐
│ 5a. Pi-Enhanced     │                  │ 5b. Skip Processing │
│ Processing          │                  │     (raw speichern) │
│ _trigger_pi_enhanced│                  │                     │
│ _processing()       │                  │                     │
│ (sensor_handler.py  │                  │                     │
│  :135-168)          │                  │                     │
└─────────────────────┘                  └─────────────────────┘
         │                                          │
         └────────────────────┬────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │ 6. DB speichern               │
              │    sensor_repo.save_data()    │
              │    (sensor_handler.py:184-197)│
              └───────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │ 7. WebSocket Broadcast        │
              │    ws_manager.broadcast()     │
              │    Event: "sensor_data"       │
              │    (sensor_handler.py:207-221)│
              └───────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │ 8. Logic Engine Trigger       │
              │    asyncio.create_task(       │
              │      trigger_logic_evaluation │
              │    )                          │
              │    (sensor_handler.py:223-246)│
              │    **NON-BLOCKING!**          │
              └───────────────────────────────┘
                              │
         ┌────────────────────┴────────────────────┐
         │ Pi-Enhanced Processing erfolgt?         │
         ▼                                          ▼
┌─────────────────────┐                           (Ende)
│ 9. MQTT Response    │
│ publish_pi_enhanced │
│ _response()         │
│ (sensor_handler.py  │
│  :149-156)          │
└─────────────────────┘
```

### handle_sensor_data() im Detail

**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`

**Haupt-Funktion:** `handle_sensor_data()` (Zeile 46-255)

| Step | Aktion | Code-Location | Details |
|------|--------|---------------|---------|
| 1 | Topic parsen | `sensor_handler.py:74-80` | `TopicBuilder.parse_sensor_data_topic()` → `esp_id`, `gpio` |
| 2 | Payload validieren | `sensor_handler.py:87-93` | `_validate_payload()` prüft Required Fields |
| 3 | ESP Lookup | `sensor_handler.py:100-104` | `esp_repo.get_by_device_id()` → Muss registriert sein |
| 4 | Sensor Config laden | `sensor_handler.py:106-114` | `sensor_repo.get_by_esp_and_gpio()` → Optional (Warning wenn fehlt) |
| 5 | Processing Mode | `sensor_handler.py:126-174` | Pi-Enhanced oder Raw Mode |
| 6 | DB speichern | `sensor_handler.py:175-205` | `sensor_repo.save_data()` |
| 7 | WebSocket Broadcast | `sensor_handler.py:207-221` | Event-Type: `"sensor_data"` |
| 8 | Logic Engine | `sensor_handler.py:223-246` | `asyncio.create_task()` (non-blocking) |

### Payload-Validierung

**Code-Location:** `sensor_handler.py:257-310`

**Required Fields:**

| Feld | Alternative | Typ | Beschreibung |
|------|-------------|-----|--------------|
| `ts` | `timestamp` | Integer | Unix-Timestamp |
| `esp_id` | - | String | ESP Device ID |
| `gpio` | - | Integer | GPIO Pin |
| `sensor_type` | - | String | Sensor-Typ |
| `raw` | `raw_value` | Numeric | Rohwert |
| `raw_mode` | - | Boolean | **REQUIRED!** Muss `true` sein |

> **Hinweis:** Der Server akzeptiert beide Varianten (`raw`/`raw_value`, `ts`/`timestamp`) für Kompatibilität.

### Pi-Enhanced Processing

**Wann aktiv:** `sensor_config.pi_enhanced == True` UND `raw_mode == true` im Payload

**Code-Location:** `sensor_handler.py:312-396` (`_trigger_pi_enhanced_processing()`)

**Ablauf:**

1. **Library Loader:** `loader = get_library_loader()` (`sensor_handler.py:345-346`)
2. **Sensor Type Normalisierung:** `normalize_sensor_type(sensor_type)` (`sensor_handler.py:348-357`)
3. **Prozessor laden:** `processor = loader.get_processor(sensor_type)` (`sensor_handler.py:352`)
4. **Processing:** `result = processor.process(raw_value, calibration, params)` (`sensor_handler.py:372-376`)
5. **Response an ESP:** `publish_pi_enhanced_response()` (`sensor_handler.py:149-156`)

**Response Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/processed`

**Verfügbare Sensor-Libraries:**

| Library | Datei | Sensor-Typ |
|---------|-------|------------|
| pH-Sensor | `ph_sensor.py` | `ph`, `ph_sensor` |
| Temperatur | `temperature.py` | `temperature`, `ds18b20`, `sht31_temp` |
| Luftfeuchtigkeit | `humidity.py` | `humidity`, `sht31_humidity` |
| EC-Sensor | `ec_sensor.py` | `ec`, `ec_sensor` |
| Bodenfeuchtigkeit | `moisture.py` | `moisture` |
| Druck | `pressure.py` | `pressure`, `bmp280_pressure` |
| CO2 | `co2.py` | `co2` |
| Durchfluss | `flow.py` | `flow` |
| Licht | `light.py` | `light` |

**Code-Location:** `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/`

### Datenbank-Speicherung

**Code-Location:** `sensor_handler.py:175-205`

**Repository:** `SensorRepository.save_data()`

**Gespeicherte Felder:**

| Feld | Typ | Quelle | Beschreibung |
|------|-----|--------|--------------|
| `esp_id` | Integer | DB Lookup | ESP Device ID (Foreign Key) |
| `gpio` | Integer | Payload | GPIO Pin |
| `sensor_type` | String | Payload | Sensor-Typ |
| `raw_value` | Float | Payload | Rohwert |
| `processed_value` | Float | Pi-Enhanced | Verarbeiteter Wert (NULL wenn kein Processing) |
| `unit` | String | Pi-Enhanced | Einheit |
| `processing_mode` | String | Handler | `"raw"`, `"pi_enhanced"`, oder `"local"` |
| `quality` | String | Pi-Enhanced | Qualitätsstufe |
| `timestamp` | DateTime | Payload | ESP32-Timestamp (konvertiert) |
| `metadata` | JSON | Handler | `{"raw_mode": true}` |

### Logic Engine Trigger

**Code-Location:** `sensor_handler.py:223-246`

**Verhalten:**

```python
# Non-blocking trigger via asyncio.create_task()
asyncio.create_task(trigger_logic_evaluation())
```

Nach DB-Speicherung wird automatisch geprüft:

1. Gibt es Automation Rules für diesen Sensor?
2. Sind Conditions erfüllt (z.B. `value > threshold`)?
3. Falls ja: Actions ausführen (z.B. Actuator-Command)

**Logic Engine:** `logic_engine.py:118-171` (`evaluate_sensor_data()`)

**Übergabene Daten:**

```python
await logic_engine.evaluate_sensor_data(
    esp_id=esp_id_str,       # ESP Device ID
    gpio=gpio,               # GPIO Pin
    sensor_type=sensor_type, # Sensor-Typ
    value=processed_value or raw_value  # Wert für Conditions
)
```

**Mehr Details:** Siehe `03-actuator-command-flow-server-frontend.md`

---

## Teil 3: Frontend-Sicht (User-Flow)

### Wo der User Sensor-Daten sieht

#### 1. Dashboard (`/dashboard`)

**Datei:** `El Frontend/src/views/DashboardView.vue`

- Übersicht aller ESPs mit Sensor-Count
- **Keine Echtzeit-Sensor-Werte direkt** - nur aggregierte Stats
- Zeigt: `stats.sensors` (Gesamtzahl aller Sensoren)

**Datenquelle:** `mockEspStore.fetchAll()` (REST API Polling)

#### 2. Sensors View (`/sensors`)

**Datei:** `El Frontend/src/views/SensorsView.vue`

**Features:**

- Liste aller konfigurierten Sensoren über alle ESPs
- Aktuelle Werte: `raw_value`, `unit`, `quality`
- Filter nach: ESP ID, Sensor Type, Quality

**Datenquelle:** `mockEspStore.fetchAll()` (REST API Polling, **nicht WebSocket-Push!**)

**Update-Mechanismus:** Manuelles Refresh oder Page-Reload

**Angezeigte Felder:**

| Feld | Quelle | Beschreibung |
|------|--------|--------------|
| `sensor.name` | Config | Sensor-Name oder `GPIO {gpio}` |
| `sensor.esp_id` | Config | ESP Device ID |
| `sensor.sensor_type` | Config | Sensor-Typ |
| `sensor.raw_value` | Letzte Messung | Aktueller Wert |
| `sensor.unit` | Config | Einheit |
| `sensor.quality` | Letzte Messung | Qualitätsstufe |

#### 3. MQTT Log (`/mqtt-log`)

**Datei:** `El Frontend/src/views/MqttLogView.vue`

- **Echtzeit-Stream** aller WebSocket-Events
- Filter auf `sensor_data` Events möglich
- Zeigt vollständigen Payload (expandierbar)

**Datenquelle:** WebSocket (Echtzeit!)

### WebSocket-Events die das Frontend empfängt

**Endpoint:** `ws://{host}:8000/api/v1/ws/realtime/{client_id}?token={jwt_token}`

**Code-Location:** `MqttLogView.vue:56-123`

**Event Type:** `sensor_data`

**Payload-Struktur (vom Server):**

```json
{
    "type": "sensor_data",
    "esp_id": "ESP_12AB34CD",
    "gpio": 4,
    "sensor_type": "ph",
    "value": 7.2,
    "unit": "pH",
    "quality": "good",
    "timestamp": 1735818000
}
```

**Code-Location (Server-seitig):** `sensor_handler.py:207-221`

```python
await ws_manager.broadcast("sensor_data", {
    "esp_id": esp_id_str,
    "gpio": gpio,
    "sensor_type": sensor_type,
    "value": processed_value or raw_value,
    "unit": unit,
    "quality": quality,
    "timestamp": esp32_timestamp_raw
})
```

### WebSocket-Verbindung herstellen

**Code-Location:** `MqttLogView.vue:56-76`

```typescript
const clientId = `frontend_${Date.now()}`
const apiHost = import.meta.env.VITE_API_HOST || 'localhost:8000'
const wsUrl = `ws://${apiHost}/api/v1/ws/realtime/${clientId}?token=${token}`

ws.value = new WebSocket(wsUrl)

ws.value.onopen = () => {
  // Subscribe to all message types
  ws.value?.send(JSON.stringify({
    action: 'subscribe',
    filters: { types: ['sensor_data', 'actuator_status', 'logic_execution', 'esp_health', 'system_event'] }
  }))
}
```

### User-Interaktionen

| Aktion | Route | Datenquelle | Beschreibung |
|--------|-------|-------------|--------------|
| Sensoren anzeigen | `/sensors` | REST API (`mockEspStore.fetchAll()`) | Liste aller Sensoren |
| Echtzeit-Events | `/mqtt-log` | WebSocket | Stream aller Events inkl. `sensor_data` |
| Sensor-Wert setzen (Mock) | `/mock-esp/{id}` | REST API | Testwert setzen via Debug API |
| Dashboard Stats | `/dashboard` | REST API | Aggregierte Sensor-Counts |

---

## Teil 4: Kompletter Sensor-Reading-Flow Timeline

```
Zeit    ESP32                    Server                      Frontend
────────────────────────────────────────────────────────────────────────
t=0     performAllMeasurements() -                           -
        │
t=0.01s Timer Check: Interval    -                           -
        elapsed? (30s default)
        (sensor_manager.cpp:558-561)
        │
t=0.02s Read Sensor GPIO 4       -                           -
        performMeasurement()
        (sensor_manager.cpp:280-432)
        raw_value = 2048
        │
t=0.03s Pi-Enhanced Processing   -                           -
        (optional, via HTTP)
        pi_processor_->sendRawData()
        │
t=0.04s Build MQTT Payload       -                           -
        buildMQTTPayload()
        (sensor_manager.cpp:705-755)
        {"raw": 2048, "raw_mode": true, ...}
        │
t=0.05s MQTT Publish ────────────────────────────────────────────────────►
        QoS 1, publishSensorReading()
        (sensor_manager.cpp:685-703)
        Topic: kaiser/god/esp/ESP_.../sensor/4/data
        │                        │
        │                        ▼
        │                   sensor_handler.handle_sensor_data()
        │                   (sensor_handler.py:46)
        │                        │
        │                        ▼
        │                   1. Topic parsen
        │                   TopicBuilder.parse_sensor_data_topic()
        │                   (sensor_handler.py:74-80)
        │                        │
        │                        ▼
        │                   2. Payload validieren
        │                   _validate_payload()
        │                   (sensor_handler.py:87-93)
        │                   Required: ts, esp_id, gpio, sensor_type, raw, raw_mode
        │                        │
        │                        ▼
        │                   3. ESP Lookup ✓
        │                   esp_repo.get_by_device_id()
        │                   (sensor_handler.py:100-104)
        │                        │
        │                        ▼
        │                   4. Sensor Config laden
        │                   sensor_repo.get_by_esp_and_gpio()
        │                   (sensor_handler.py:106-114)
        │                        │
        │                        ▼
        │                   5. Processing Mode Check
        │                   if sensor_config.pi_enhanced and raw_mode:
        │                   (sensor_handler.py:130)
        │                        │
        │                        ▼
        │                   6. Pi-Enhanced Processing (wenn aktiv):
        │                   _trigger_pi_enhanced_processing()
        │                   (sensor_handler.py:135-168)
        │                   - library_loader.get_processor("ph")
        │                   - processor.process(2048, calibration)
        │                   - Result: 7.2 pH, quality: "good"
        │                        │
        │                        ▼
        │                   7. DB speichern
        │                   sensor_repo.save_data()
        │                   (sensor_handler.py:184-197)
        │                   INSERT INTO sensor_data
        │                        │
        │                        ▼
        │                   8. WebSocket Broadcast ─────────────────────────►
        │                   ws_manager.broadcast("sensor_data", {...})
        │                   (sensor_handler.py:207-221)    │
        │                        │                         ▼
        │                        │                    MqttLogView:
        │                        │                    onmessage()
        │                        │                    (MqttLogView.vue:78-100)
        │                        │                    Neuer Eintrag in Log
        │                        │
        │                        ▼
        │                   9. Logic Engine Trigger
        │                   asyncio.create_task(trigger_logic_evaluation())
        │                   (sensor_handler.py:223-246)
        │                   **NON-BLOCKING!**
        │                        │
        │                        ▼
        │                   10. Logic Engine Evaluation
        │                   logic_engine.evaluate_sensor_data()
        │                   (logic_engine.py:118-171)
        │                   - Rules prüfen
        │                   - Actuator-Commands (falls triggered)
        │                        │
        │                        ▼
        │   ◄────────────────────────────────────────────────────────────
        │   Pi-Enhanced Response (wenn processing erfolgt)
        │   publisher.publish_pi_enhanced_response()
        │   (sensor_handler.py:149-156)
        │   Topic: .../sensor/4/processed
        │   {"processed": 7.2, "unit": "pH"}
        │
t=30s   Nächster Messzyklus...
        performAllMeasurements()
```

---

## Teil 5: Troubleshooting

### Sensor-Daten kommen nicht am Server an

| Symptom | Ursache | Lösung |
|---------|---------|--------|
| Keine MQTT Messages im Server-Log | ESP nicht connected | `mqttClient.isConnected()` prüfen |
| "ESP device not found" Error | ESP nicht registriert | `POST /api/v1/esp/devices` vor Sensor-Betrieb |
| "Missing required field: raw_mode" | ESP-Firmware veraltet | ESP-Firmware aktualisieren (raw_mode wird seit v4.x gesetzt) |
| Payload validation failed | Falsches Payload-Format | Payload gegen Schema prüfen |
| Sensor-Daten gespeichert, aber nicht broadcast | WebSocket-Fehler | Server-Logs auf WebSocket-Errors prüfen |

### Frontend zeigt keine aktuellen Sensor-Werte

| Symptom | Ursache | Lösung |
|---------|---------|--------|
| SensorsView zeigt alte Werte | Kein Auto-Refresh | Page manuell refreshen (F5) |
| MqttLogView zeigt keine Events | WebSocket disconnected | Token abgelaufen → Neu einloggen |
| "Waiting for messages..." | Keine Events | `/mqtt-log` Filter prüfen, ESP sendet? |
| Sensor fehlt in Liste | Nicht konfiguriert | Sensor über Mock-ESP oder API hinzufügen |

### Pi-Enhanced Processing funktioniert nicht

| Symptom | Ursache | Lösung |
|---------|---------|--------|
| "No processor found for sensor type" | Library fehlt | Prüfe `/active/` Verzeichnis |
| processed_value ist NULL | pi_enhanced nicht aktiv | Sensor-Config: `pi_enhanced = true` setzen |
| Processing-Fehler im Log | Calibration fehlt | Sensor-Config mit calibration_data aktualisieren |

### Server-Logs prüfen

```bash
# Server mit Debug-Level starten
cd "El Servador/god_kaiser_server"
poetry run uvicorn god_kaiser_server.src.main:app --reload --log-level debug

# Nach Sensor-Handler suchen
# Erfolg: "Sensor data saved: id=..., esp_id=ESP_..., gpio=4, processing_mode=pi_enhanced"
# Fehler: "Invalid sensor data payload: Missing required field: raw_mode"
# Fehler: "ESP device not found: ESP_..."
```

### Frontend WebSocket-Debug

```javascript
// Browser Console (F12)
// 1. Network Tab → WS → Verbindung prüfen
// 2. /mqtt-log View öffnen und auf Events warten
// 3. Console: Errors prüfen für WebSocket-Probleme
```

---

## Teil 6: Code-Locations Referenz

| Komponente | Pfad | Relevante Funktionen/Zeilen |
|------------|------|----------------------------|
| **ESP32 Sensor Manager** | `El Trabajante/src/services/sensor/sensor_manager.cpp` | `performAllMeasurements()` (553-592), `performMeasurement()` (280-432), `publishSensorReading()` (685-703), `buildMQTTPayload()` (705-755) |
| **ESP32 Topic Builder** | `El Trabajante/src/utils/topic_builder.cpp` | `buildSensorDataTopic()` (53-58) |
| **Server Sensor Handler** | `El Servador/.../mqtt/handlers/sensor_handler.py` | `handle_sensor_data()` (46-255), `_validate_payload()` (257-310), `_trigger_pi_enhanced_processing()` (312-396) |
| **Library Loader** | `El Servador/.../sensors/library_loader.py` | `get_processor()` (76-106), `_discover_libraries()` (134-175) |
| **Sensor Libraries** | `El Servador/.../sensors/sensor_libraries/active/` | `ph_sensor.py`, `temperature.py`, etc. |
| **Logic Engine** | `El Servador/.../services/logic_engine.py` | `evaluate_sensor_data()` (118-171) |
| **WebSocket Manager** | `El Servador/.../websocket/manager.py` | `broadcast()` |
| **Frontend Sensors View** | `El Frontend/src/views/SensorsView.vue` | `filteredSensors` (45-61), `allSensors` (34-42) |
| **Frontend MQTT Log** | `El Frontend/src/views/MqttLogView.vue` | `connect()` (56-123), `onmessage` (78-100) |
| **Frontend Dashboard** | `El Frontend/src/views/DashboardView.vue` | `stats` (42-58) |

---

## Verifizierungscheckliste

### ESP32-Doku Verifiziert

- [x] Measurement Interval (30s default) - `sensor_manager.h:149`
- [x] MQTT Topic Format: `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data` - `topic_builder.cpp:53-58`
- [x] Payload-Struktur mit `raw_mode: true` - `sensor_manager.cpp:751`
- [x] QoS Level 1 - `sensor_manager.cpp:698`
- [x] Unix-Timestamp in Sekunden - `sensor_manager.cpp:717,748-749`

### Server-Doku Verifiziert

- [x] `handle_sensor_data()` beginnt auf Zeile 46
- [x] Required Fields: ts, esp_id, gpio, sensor_type, raw, raw_mode (Zeile 257-310)
- [x] ESP Lookup geprüft (Zeile 100-104)
- [x] Pi-Enhanced Trigger-Bedingung: `sensor_config.pi_enhanced and raw_mode` (Zeile 130)
- [x] DB-Speicherung: `sensor_repo.save_data()` (Zeile 184-197)
- [x] WebSocket Broadcast Event-Type: `"sensor_data"` (Zeile 211)
- [x] Logic Engine async via `asyncio.create_task()` (Zeile 244)

### Frontend-Doku Verifiziert

- [x] Sensor-Anzeige-Route: `/sensors` (SensorsView.vue)
- [x] Datenquelle SensorsView: REST API (`mockEspStore.fetchAll()`) - nicht WebSocket
- [x] WebSocket Event-Handler: `MqttLogView.vue:78-100`
- [x] WebSocket Event-Types: `['sensor_data', 'actuator_status', 'logic_execution', 'esp_health', 'system_event']`

---

**Letzte Verifizierung:** 2025-12-17
**Verifiziert gegen Code-Version:** Git master branch (Commit-Stand: 2025-12-17)

---

## Changelog

| Datum | Version | Änderungen |
|-------|---------|------------|
| 2025-12-17 | 1.1 | Zeilennummern korrigiert: `sensor_handler.py:73-80` → `74-80`, `_discover_libraries()` 134-174 → 134-175 |
| 2025-12-17 | 1.0 | Initiale Erstellung, vollständig verifiziert gegen aktuellen Code |
