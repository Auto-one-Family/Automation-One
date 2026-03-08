# Phase 0 — Vollständige 3-Schichten-Analyse (Monitor L1 + L2 + Editor)

> **Datum:** 2026-03-07
> **Typ:** Reine Code-Analyse — kein Code geschrieben
> **Scope:** Sensor-Datenpfad, Monitor L1/L2, Dashboard Editor — alle 3 Schichten
> **Analysiert von:** 5 parallele Code-Explorer-Agenten + Cross-Layer-Synthese

---

## 1. Executive Summary

Der Sensor-Datenpfad von ESP32 über Backend bis Frontend ist **grundsätzlich funktional** und architektonisch sauber implementiert. Die Firmware sendet bereits gesplittete Multi-Value-Typen (`sht31_temp`, `sht31_humidity`) als separate MQTT-Nachrichten — der Backend-Handler verarbeitet diese ohne eigenen Split-Mechanismus. WebSocket-Broadcasts, Logic-Engine-Trigger und DB-Persistenz funktionieren in der korrekten Reihenfolge (DB → WS → Logic).

**Top-5 Befunde:**

1. **Mock-ESP Multi-Value-Bug (HOCH):** Die Mock-ESP-Erstellung (`debug.py:244`) benutzt `str(sensor.gpio)` als Dictionary-Key für die `simulation_config`. Bei Multi-Value-I2C-Sensoren (SHT31: 2 Typen auf GPIO 21) überschreibt der zweite Eintrag den ersten → nur 1 Sensor-Job statt 2. Zusätzlich: Kein Multi-Value-Split bei Mock-Erstellung → inkonsistenter Pfad zu echten ESPs.

2. **ActuatorCard Toggle im Monitor-Mode (HOCH):** `ActuatorCard.vue` hat keinen Mode-Guard auf dem Toggle-Button. Im Monitor L2 (konzeptionell read-only) können Aktoren sofort geschaltet werden — ohne Bestätigungsdialog.

3. **L1 fehlende Loading/Error-States (MITTEL):** MonitorView L1 zeigt bei API-Laden und API-Fehler denselben Empty State ("Keine Zonen mit Geräten vorhanden") — unterscheidet nicht zwischen "lädt" und "wirklich leer".

4. **Race Condition Zone-Wechsel L2 (MITTEL):** Kein `AbortController` bei `fetchZoneMonitorData()`. Schneller Zone-Wechsel kann dazu führen, dass Daten der alten Zone die neue überschreiben.

5. **Dashboard Sync-Fehler unsichtbar (NIEDRIG):** `syncLayoutToServer()` ist fire-and-forget bei Fehlern. `lastSyncError` wird nur bei `fetchLayouts()` gesetzt, nie bei Sync-Fehlern. Kein UI zeigt Sync-Probleme an.

---

## 2. Datenfluss-Diagramm

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        SENSOR-DATENPFAD (End-to-End)                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ESP32 Firmware (El Trabajante)                                                │
│  ─────────────────────────────                                                  │
│  sensor_manager.cpp:1043 → performAllMeasurements()                            │
│    │ Check: active, operating_mode, CB-State, Intervall (Default 30s)          │
│    ▼                                                                            │
│  I2C: i2c_bus.cpp:767 → executeCommandBasedProtocol()                          │
│    SHT31: Cmd 0x2400 → 20ms wait → 6 Bytes → CRC-8 Sensirion                 │
│    → extractRawValue() pro value_type (i2c_sensor_protocol.cpp:202)            │
│    → EIN I2C-Read, ZWEI SensorReadings (sht31_temp + sht31_humidity)           │
│    │                                                                            │
│  OneWire: onewire_bus.cpp:228 → readRawTemperature()                           │
│    DS18B20: select(ROM) → 0x44 → 750ms → 0xBE → 9 Bytes CRC                  │
│    │                                                                            │
│  sensor_manager.cpp:1411 → buildMQTTPayload()                                  │
│    Topic: kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data                   │
│    Payload: {esp_id, gpio, sensor_type:"sht31_temp", raw:23456,                │
│              value:22.34, unit:"°C", quality:"good", ts, i2c_address:68, ...}  │
│    QoS: 1                                                                       │
│    │                                                                            │
│    ▼ (MQTT, QoS 1)                                                             │
│                                                                                 │
│  Backend (El Servador)                                                          │
│  ────────────────────                                                           │
│  sensor_handler.py:105 → handle() [Subscribe: +/sensor/+/data]                 │
│    │ Validate: ts, esp_id, gpio, sensor_type, raw, raw_mode (PFLICHT!)         │
│    │ KEIN MULTI_VALUE_SPLIT — erwartet bereits gesplittete Types               │
│    ▼                                                                            │
│  zone_subzone_resolver.py:17 → resolve_zone_subzone_for_sensor()               │
│    zone_id ← esp_device.zone_id                                                │
│    subzone_id ← subzone_configs.assigned_gpios (GPIO-Pin-Nummer, NICHT I2C-Adr)│
│    ▼                                                                            │
│  sensor_repo.py:213 → save_data() [Einzel-Insert, kein Batch]                 │
│    Felder: esp_id, gpio, sensor_type, raw_value, processed_value, unit,        │
│            quality, zone_id, subzone_id, timestamp, data_source                │
│    ▼                                                                            │
│  sensor_handler.py:408 → WebSocket Broadcast (NACH DB-Insert + Commit)         │
│    Event: "sensor_data"                                                         │
│    Payload: {esp_id, device_id, gpio, sensor_type, value, unit, quality,       │
│              timestamp, zone_id, subzone_id, message, severity:"info"}          │
│    ▼                                                                            │
│  logic_engine.py:138 → evaluate_sensor_data() [asyncio.create_task, NACH WS]  │
│    Eigene DB-Session, Fire-and-forget                                           │
│                                                                                 │
│    ▼ (WebSocket)                                                               │
│                                                                                 │
│  Frontend (El Frontend)                                                         │
│  ─────────────────────                                                          │
│  esp.ts:1134 → handleSensorData() → delegiert an sensorStore                  │
│    │                                                                            │
│  sensor.store.ts:102 → Phase-6-Hybrid (3 Pfade)                               │
│    Pfad 1 (Registry): Multi-Value bekannt → multi_values Map update            │
│    Pfad 2 (Dynamic): GPIO hat Sensor mit anderem Typ → hochstufen             │
│    Pfad 3 (Single): sensor.raw_value = data.value (direkte Mutation)           │
│    │                                                                            │
│  useZoneGrouping.ts → ZoneGroup[] → SubzoneGroup[] → SensorWithContext[]       │
│    Subzone-Zuordnung: optional via useSubzoneResolver (GPIO-basiert)           │
│    │                                                                            │
│  MonitorView.vue → zoneKPIs (L1) / SensorCard (L2)                            │
│    Unit: aus SENSOR_TYPE_CONFIG (Frontend), NICHT aus Backend                  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. ESP32 Firmware-Befunde (Block 1)

### 3.1 Sensor-Registrierung

Sensoren werden **nicht beim Boot** automatisch registriert. Registrierung erfolgt ausschließlich über MQTT-Config-Push vom Server auf Topic `kaiser/{kaiser_id}/esp/{esp_id}/config`. Config wird in NVS persistiert (`configManager.saveSensorConfig()`), aber es gibt **keinen expliziten Code-Pfad in `setup()`**, der beim Boot NVS-Configs in den `SensorManager` zurücklädt.

**SensorConfig-Felder** (sensor_types.h:27-76):
`gpio` (uint8_t), `sensor_type` (String, z.B. "sht31_temp"), `sensor_name`, `subzone_id`, `active` (bool), `operating_mode` ("continuous"/"on_demand"/"paused"/"scheduled"), `measurement_interval_ms` (Default 30000), `raw_mode` (immer true), `onewire_address` (16 Hex-Chars ROM-Code), `i2c_address` (7-bit), `cb_state` (Circuit Breaker), `consecutive_failures`, `last_raw_value` (Cache), `last_reading` (Timestamp).

### 3.2 I2C-Handling

- `Wire.begin(SDA, SCL)` wird **einmalig** aufgerufen (i2c_bus.cpp:41-140)
- I2C Address Conflict Check bei `configureSensor()` (sensor_manager.cpp:314-332)
- **SHT31:** Command 0x2400 (High Repeatability, No Clock Stretch), 20ms Wartezeit, 6 Bytes Response, CRC-8 Sensirion (Poly 0x31, Init 0xFF) — i2c_sensor_protocol.cpp:21-56
- **BMP280/BME280:** Register-basiert ab 0xF7, KEIN CRC. **Init-Sequenz (ctrl_meas 0xF4) ist NICHT implementiert** — Sensor muss bereits im Normal-Mode sein
- **Measurement-Cache:** EIN I2C-Read für alle Werte. `measured_i2c_addrs[]`-Array verhindert Doppel-Read bei separaten SensorConfig-Einträgen (sensor_manager.cpp:1062-1155)

### 3.3 OneWire-Handling

- Direkte `OneWire`-Library (kein DallasTemperature)
- ROM-Code als 16-Hex-String in `SensorConfig.onewire_address`
- CRC-8 Validierung des ROM-Codes und des Scratchpads
- 750ms Konversionszeit (12-bit), parasitic power
- Mehrere DS18B20 am selben Pin: Unterstützt via ROM-Code-Adressierung. Firmware enforced Single-Bus-Architektur (nur ein OneWire-GPIO)

### 3.4 MQTT-Publish-Format

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data` (topic_builder.cpp:86-91)

**Payload:**
```json
{
  "esp_id": "esp32abc", "seq": 42,
  "zone_id": "zone_1", "subzone_id": "bed_north",
  "gpio": 21, "sensor_type": "sht31_temp",
  "raw": 23456, "value": 22.34, "unit": "°C",
  "quality": "good", "ts": 1741234567,
  "raw_mode": true, "i2c_address": 68
}
```

**Multi-Value:** Firmware sendet **ZWEI separate MQTT-Nachrichten** pro SHT31-Ablesung (sensor_manager.cpp:1022-1027). Gleiches Topic (gleicher GPIO), unterschiedlicher `sensor_type`.

**Publish-Intervall:** 30s Default, pro Sensor konfigurierbar. QoS 1.

**Bug:** `quality`-Feld wird doppelt in den JSON-String geschrieben (sensor_manager.cpp:1454-1456 und 1479-1483).

### 3.5 Aktor-Steuerung

- **Subscribe:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/+/command`
- **Payload:** `{"command": "ON"|"OFF"|"PWM"|"TOGGLE", "value": 0.0-1.0, "duration": 60, "correlation_id": "..."}`
- **PWM:** 0.0-1.0 normalisiert, intern auf 0-255 konvertiert
- **Emergency-Stop:** Per-Aktuator (`/actuator/emergency`) oder Broadcast (`/broadcast/emergency`). Token-validiert (NVS)
- **Runtime-Protection:** max_runtime_ms = 3600000 (1h), Auto-Emergency bei Überschreitung
- **Status-Report:** `kaiser/{id}/esp/{id}/actuator/{gpio}/status` nach jedem Kommando

### 3.6 Heartbeat

- **Topic:** `kaiser/{id}/esp/{id}/system/heartbeat`, QoS 0
- **Intervall:** 60s
- **Payload:** esp_id, seq, zone_id, ts, uptime, heap_free, wifi_rssi, sensor_count, actuator_count, wifi_ip, gpio_status[], config_status
- **Reconnect:** Exponentieller Backoff 1s→60s, Circuit Breaker (5 Failures → 30s Pause)
- **Registration-Gate:** Nach Reconnect nur Heartbeat erlaubt bis Server-ACK

### 3.7 Config-Empfang

- **Topic:** `kaiser/{id}/esp/{id}/config`
- Sensoren UND Aktoren werden aus derselben Config-Nachricht geparst
- Sofortige NVS-Persistenz bei Erfolg
- Bestehende Sensoren: Komplette Überschreibung + CB-Reset

---

## 4. Backend-Befunde (Block 2)

### 4.1 sensor_handler.py — MQTT → DB Pipeline

**Subscribe-Pattern:** `+/sensor/+/data` (main.py:203-206)

**Validierung (Zeilen 663-757):**
Pflichtfelder: `ts`/`timestamp`, `esp_id`, `gpio`, `sensor_type`, `raw`/`raw_value`, `raw_mode`

**BEFUND:** `raw_mode` ist im Docstring als "optional mit Default True" dokumentiert (Zeile 122), aber der Validator (Zeile 714-719) erzwingt es als Pflichtfeld. Ein ESP der `raw_mode` nicht sendet, wird abgelehnt. Die Firmware sendet es immer (`raw_mode: true`), daher tritt das Problem aktuell nicht auf.

**KEIN MULTI_VALUE_SPLIT im Handler.** Der Handler verarbeitet `sensor_type` wie er ankommt. Die Firmware wird erwartet, bereits gesplittete Types zu senden ("sht31_temp", "sht31_humidity").

**MULTI_VALUE_SENSORS Registry** (sensor_type_registry.py:81-118):
```
"sht31": values=[("sht31_temp", "°C"), ("sht31_humidity", "%RH")]
"bmp280": values=[("bmp280_pressure", "hPa"), ("bmp280_temp", "°C")]
```
Diese Registry wird NUR im API-Endpoint `POST /sensors/{esp_id}/{gpio}` genutzt (sensors.py:528-669), um bei der SensorConfig-Erstellung den Split durchzuführen. Nicht im MQTT-Handler.

**zone_subzone_resolver (Zeilen 17-51):** Verwendet GPIO-Pin-Nummer (nicht I2C-Adresse) für Subzone-Lookup in `assigned_gpios`. Bei I2C-Sensoren wird SDA-Pin (z.B. GPIO 21) übergeben.

**sensor_repo.save_data() (Zeilen 213-273):** Einzel-Insert (kein Batch). Felder: esp_id, gpio, sensor_type, raw_value, processed_value, unit, quality, timestamp, zone_id, subzone_id, data_source, sensor_metadata. `session.flush()` + `session.refresh()`, Commit in aufrufender Methode.

**WebSocket-Broadcast (Zeilen 408-443):** NACH DB-Insert + Commit. Event: `"sensor_data"`. Best-effort, kein Retry.

**Logic Engine (Zeilen 446-485):** NACH WS-Broadcast. `asyncio.create_task()` — Fire-and-forget, eigene DB-Session.

### 4.2 Mock-ESP-Generator

**API:** `POST /v1/debug/mock-esp` (admin-only, debug.py:210-372)

**KRITISCHER BUG — simulation_config Keys (debug.py:242-254):**
```python
"sensors": {
    str(sensor.gpio): {           # ← BUG: key = GPIO-Nummer
        "sensor_type": sensor.sensor_type,
        "raw_value": sensor.raw_value,
        ...
    }
    for sensor in config.sensors
}
```
Bei Multi-Value-Sensoren auf gleichem GPIO (z.B. sht31_temp + sht31_humidity auf GPIO 21): Der Dict-Comprehension-Key `str(21)` ist identisch → **zweiter Eintrag überschreibt den ersten**. Es entsteht nur 1 Sensor-Job statt 2.

Die Scheduler-Code (_start_sensor_jobs_from_db, scheduler.py:342-348) unterstützt bereits das neue Key-Format `"{gpio}_{sensor_type}"`, aber der Erstellungscode benutzt noch das alte Format `str(sensor.gpio)`.

**SensorConfig-Erstellung (debug.py:294-312):** Erstellt separate DB-Einträge pro Sensor, OHNE Multi-Value-Split (`is_multi_value_sensor()` wird NICHT aufgerufen).

**Daten-Generierung:** Mock-Daten gehen durch denselben MQTT→Handler-Pfad wie echte ESPs. `data_source` wird auf `"mock"` gesetzt.

**Wertegenerierung (scheduler.py:821-900):** Drei Pattern: CONSTANT, RANDOM (base ± variation), DRIFT (langsame Änderung mit Richtungsumkehr). 2 Dezimalstellen, geclampt auf [min, max].

### 4.3 Zone/Subzone-API

**Zonen sind KEINE eigenen DB-Entitäten.** Sie existieren nur als `zone_id`-String in `esp_devices.zone_id`. Es gibt keinen `DELETE /zones/{id}`-Endpoint. Wenn alle Devices aus einer Zone entfernt werden, "verschwindet" die Zone implizit.

**Zone-Endpoints:** `POST /zone/devices/{esp_id}/assign`, `DELETE /zone/devices/{esp_id}/zone`, `GET /zone/devices/{esp_id}`, `GET /zone/{zone_id}/devices`, `GET /zone/unassigned`, `GET /zone/{zone_id}/monitor-data`.

**SubzoneConfig-Model (subzone.py):**
- `id` (UUID PK), `esp_id` (FK, CASCADE DELETE), `subzone_id` (String, indexed), `subzone_name`, `parent_zone_id` (indexed), `assigned_gpios` (JSON Array of ints), `safe_mode_active` (default True), `sensor_count`, `actuator_count`, `custom_data` (JSONB), `last_ack_at`
- Unique: `(esp_id, subzone_id)`
- **assigned_gpios:** JSON-Array mit GPIO-Pin-Nummern (nicht I2C-Adressen)
- **Kein Auto-Löschen** bei leeren assigned_gpios

### 4.4 monitor_data_service.py

Pfad für `GET /zone/{zone_id}/monitor-data`:
1. ESPs in Zone laden (WHERE zone_id = ?)
2. GPIO-zu-Subzone-Map aus subzone_configs WHERE parent_zone_id = zone_id
3. SensorConfigs laden (JOIN ESPDevice, WHERE enabled=True)
4. ActuatorConfigs laden (JOIN ESPDevice, WHERE enabled=True)
5. Latest Readings via Batch-Query (key: esp_id UUID, gpio, sensor_type)
6. Gruppierung nach Subzone, Merge zu SubzoneGroups

**Leere Subzonen:** Werden NICHT im Response zurückgegeben (Zeilen 205-206: `if not sensors and not actuators: continue`).

### 4.5 Dashboard-API

**Endpoints:** GET (list, paginiert), POST (create, 201), GET/{id}, PUT/{id}, DELETE/{id}

**DashboardLayout Model (dashboard.py):**
- `id` (UUID PK), `name`, `description`, `widgets` (JSON), `scope` ("zone"/"cross-zone"/"sensor-detail"), `zone_id`, `owner_id` (FK User, CASCADE DELETE), `is_shared`, `auto_generated` (bool), `target` (JSON, nullable), `sensor_id`
- User-Isolation: List = `WHERE owner_id = user_id OR is_shared = True`
- target-Update: `None` = target löschen, fehlendes Feld = nicht ändern

### 4.6 Sensor-Daten-API

**GET /sensors/data Parameter:** esp_id, gpio, sensor_type, start_time (Default: -24h), end_time, quality, zone_id, subzone_id, limit (1-1000, Default 100)

**resolution-Parameter: EXISTIERT NICHT.** Keine serverseitige Aggregation. Immer Rohdaten.

**zone_id Filterung:** Historisch gespeichert (Phase 0.1). Filter auf `SensorData.zone_id` — historisch korrekt, nicht aktuelle Device-Zone.

---

## 5. Frontend Store-Befunde (Block 3)

### 5.1 espStore

**fetchAll() (esp.ts:280):** Delegiert an `espApi.listDevices()` (esp.ts:335-441):
1. `Promise.all([debugApi.listMockEsps(), api.get('/esp/devices')])`
2. Mock-ESPs normalisiert (MockESP → ESPDevice)
3. DB-Devices gefiltert: Wenn device_id bereits im Mock-Set → herausgefiltert (Mock hat reichere Daten)
4. DB-Devices angereichert: `enrichDbDevicesWithSensors()` → GET /sensors/?page_size=100
5. Rückgabe: `[...mocks, ...filteredDbDevices]`
6. Im Store: Zweite Deduplizierung via `Set<string>` über `getDeviceId()`

**ESPDevice Interface** (esp.ts:60-100): device_id (Primary), esp_id (Alias), zone_id, zone_name, master_zone_id, status ("pending_approval"|"approved"|"online"|"offline"|...), sensors (MockSensor[]), actuators (MockActuator[]), heap_free, wifi_rssi, uptime, last_heartbeat, connected, offlineInfo, ...

**MockSensor** (types/index.ts:250-283): gpio, sensor_type, name, subzone_id, raw_value, processed_value, unit, quality, raw_mode, last_read, operating_mode, is_stale, stale_reason, device_type, multi_values, is_multi_value, config_status, config_error

**MockActuator** (types/index.ts:285-297): gpio, actuator_type, name, state (bool), pwm_value (number), emergency_stopped, last_command, config_status, config_error

**WS sensor_data Handler** (sensor.store.ts:102-138): Phase-6-Hybrid, 3 Pfade:
- Pfad 1 (Registry): Multi-Value bekannt → `multi_values[type]` Map update, primary type → raw_value
- Pfad 2 (Dynamic): Anderer Typ auf gleichem GPIO → Auto-Hochstufung zu Multi-Value
- Pfad 3 (Single): `sensor.raw_value = data.value` — direkte Mutation
- Aktualisiert: raw_value, quality, unit, last_read. NICHT: subzone_id (kommt aus fetchAll)

### 5.2 useZoneGrouping

**Input:** `espStore.devices` → **Output:** `ZoneGroup[]` mit `SubzoneGroup[]`

**Subzone-Zuordnung — 2 Quellen mit Priorität:**
1. **Mit subzoneResolver** (GPIO-basiert, Monitor L2): `resolver.get("${espId}-${gpio}")` → subzoneId
2. **Ohne Resolver** (ESP-Level, Fallback): `esp.subzone_id` für alle Sensoren eines ESPs

**SensorWithContext:** gpio, sensor_type, name, raw_value, unit, quality, esp_id, esp_state, zone_id, zone_name, subzone_id, subzone_name, last_read

**SUBZONE_NONE = '__none__'** → Sensoren ohne Subzone → "Keine Subzone" am Ende

### 5.3 logicStore

**getRulesForZone(zoneId) (logic.store.ts:301-319):**
1. Für jede Rule: `extractEspIdsFromRule()` → Set von ESP-IDs (aus sensor/actuator Conditions+Actions)
2. Für jede ESP-ID: Device suchen → `device.zone_id === zoneId`?
3. Sortierung: priority (asc), dann name (alpha)

**activeExecutions:** Map<ruleId, timestamp>. Befüllt NUR durch WS-Event `logic_execution`. TTL: 2 Sekunden via `setTimeout(() => delete, 2000)`.

### 5.4 dashboardStore

**DashboardLayout:** id, serverId, name, description, widgets[], scope, zoneId, autoGenerated, target (DashboardTarget)

**DashboardTarget:** `{ view: 'monitor'|'hardware', placement: 'page'|'inline'|'side-panel'|'bottom-panel', anchor?, panelPosition?, panelWidth?, order? }`

**Monitor-relevante Computeds:**
- `crossZoneDashboards`: scope=cross-zone, target.view=monitor
- `inlineMonitorPanelsCrossZone`: target.view=monitor, placement=inline, scope≠zone
- `inlineMonitorPanelsForZone(zoneId)`: target.view=monitor, placement=inline, scope=zone, zoneId match
- `sideMonitorPanels`: target.view=monitor, placement=side-panel
- `bottomMonitorPanels`: target.view=monitor, placement=bottom-panel
- `zoneDashboards(zoneId)`: scope=zone, zoneId match

**generateZoneDashboard() (Zeilen 532-695):** Mapping nach Sensor-Kategorie:
- temperature/light → line-chart (w:12, h:3)
- air/water/soil → gauge (w:6, h:2, 2 pro Zeile)
- other → sensor-card (w:6, h:2)
- Aktoren → actuator-card (w:4, h:2, 3 pro Zeile)

**syncLayoutToServer() (Zeilen 382-433):** 2000ms Debounce per Layout. Create oder Update je nach serverId. **Fehler: `logger.warn()` — fire-and-forget**, kein lastSyncError gesetzt.

**Persistenz:** localStorage sofort + Server-Sync async (dual). Server hat Priorität bei Merge.

---

## 6. Frontend View-Befunde (Block 4+5)

### 6.1 MonitorView L1 — Zone-Übersicht

**zoneKPIs (Zeilen 865-939):** Pro Zone berechnet aus `groupDevicesByZone(espStore.devices)`. Filtert `ZONE_UNASSIGNED` heraus. Berechnet: sensorCount, activeSensors (quality ≠ error/stale), alarmCount (quality = error/bad), onlineDevices (via getESPStatus), aggregation (via aggregateZoneSensors).

**Status-Ampel getZoneHealthStatus() (Zeilen 831-857):**
- `alarm`: alle Devices offline ODER keine Sensoren aktiv
- `warning`: offline Devices ODER fehlerhafte Sensoren ODER inaktive Sensoren ODER Not-Aus aktiv
- `ok`: sonst

**isZoneStale() (Zeilen 942-949):** Schwellwert 60s. Prüft neuesten sensor.last_read oder device.last_heartbeat.

**Klick:** `<div @click="goToZone(...)">` → `router.push({name: 'monitor-zone', params: {zoneId}})`. **Kein `<button>`, kein `tabindex`** — Keyboard-Accessibility fehlt.

**Loading State:** FEHLT. `espStore.fetchAll()` wird bei devices.length === 0 aufgerufen (Zeile 738). Kein Skeleton. Empty State unterscheidet nicht "lädt" vs. "leer": "Keine Zonen mit Geräten vorhanden" (Zeile 1433). Kein Link zu `/hardware`.

**Error State:** FEHLT. `espStore.error` wird nicht ausgelesen.

**ActiveAutomationsSection:** Top-5 aus `logicStore.enabledRules`. Sortierung: Fehler zuerst, dann priority, dann name. Empty State: "Zum Regeln-Tab"-Button → route `logic`.

### 6.2 MonitorView L2 — Zonen-Detail

**fetchZoneMonitorData(zoneId) (Zeilen 1104-1129):** Guard: `espStore.devices.some(d => d.zone_id === zoneId)`. Call: `zonesApi.getZoneMonitorData(zoneId)`. Fallback: `useZoneGrouping` bei API-Fehler.

**AbortController:** FEHLT. Kein Cancel bei schnellem Zone-Wechsel.

**Loading/Error States:** VORHANDEN — `<BaseSkeleton>` und `<ErrorState>` mit Retry-Button (Zeilen 1566-1572).

**Subzone-Accordions:** Inline implementiert (nicht AccordionSection-Komponente). Persistenz via `localStorage('ao-monitor-subzone-collapse-${zoneId}')`. Default: alle expanded. Kommentar "else only first expanded" → else-Zweig FEHLT im Code.

**SensorCard im monitor-mode:** Name, Wert (1 Dezimale), Unit, Quality-Dot+Label, ESP-ID, Subzone-Badge, Stale-Badge (>120s). Sparkline-Slot: **befüllt** via `<LiveLineChart>` aus `useSparklineCache` — aber initial leer (Cache füllt sich erst nach erstem WS-Event). Klick → toggleExpanded → Inline 1h-Chart. "Zeitreihe anzeigen" → L3 SlideOver.

**ActuatorCard im monitor-mode (Zeilen 89-95):** Toggle-Button **IMMER sichtbar** — kein mode-Guard. `handleToggle()` sendet sofort `sendActuatorCommand()` ohne ConfirmDialog. PWM-Wert wird NICHT angezeigt. servedSubzoneLabel: subzone_name oder "—".

**ZoneRulesSection:** Schwellwert >10 → nur erste 5 + "Weitere N Regeln"-Link. Empty State mit Link.

**Zone-Dashboards:** Auto-Generierung bei erstem Zonenbesuch. Re-Generierung wenn Widget-Count ≠ Sensor+Actuator-Count. Auto-Badge + "Anpassen"-Button.

**Subzone-Eingabefeld (Zeilen 1748-1770):** Conditional `v-if="creatingSubzoneForZone === selectedZoneId"` — nur nach Button-Klick sichtbar. Funktional korrekt.

**Aggregationszeile getSubzoneKPIs (Zeilen 1329-1352):** Gruppiert nach `baseType = sensor_type.replace(/[_\d]+/g, '')`. Zeigt avg wenn count>1. `raw_value=0` wird MITGEZÄHLT, `raw_value=null` wird übersprungen. Max 3 Werte.

### 6.3 CustomDashboardView — Editor

**GridStack-Config:** column 12, cellHeight 80px, margin 8px, float true, animate true

**Edit/View-Mode:** `isEditing = ref(false)`. Toggle schaltet move/resize/removable. Gear-Button via CSS nur im Edit-Mode sichtbar.

**Target-Konfigurator (4 Optionen):**

| Label | view | placement |
|-------|------|-----------|
| Monitor — Inline | monitor | inline |
| Monitor — Seitenpanel | monitor | side-panel |
| Monitor — Unteres Panel | monitor | bottom-panel |
| Übersicht — Seitenpanel | hardware | **inline** ← Label-Bug |

**Kein Zone-Targeting-Dropdown.** Zone-Targeting nur via `generateZoneDashboard()`.

**Target-Konflikt:** Warnung "Belegt von: [Name] — wird übernommen". Kein ConfirmDialog, sofortige Übernahme.

**keep-alive:** View ist gewrappt. `onActivated`: re-init Grid falls null, Breadcrumb restore. `onDeactivated`: nur Breadcrumb löschen. **isEditing bleibt erhalten** bei Tab-Wechsel.

**lastSyncError:** NICHT im UI angezeigt. Kein Template-Reference.

### 6.4 Widget-Komponenten (9 Typen)

| Widget | Zeilen | Datenquelle | Live-Update | Zone-Filter | Toggle |
|--------|--------|-------------|-------------|-------------|--------|
| line-chart | 181 | espStore computed + watch last_read | 60-Punkte-Puffer | Nein | — |
| gauge | 116 | espStore computed | Reaktiv | Nein | — |
| sensor-card | 173 | espStore computed | Reaktiv | Nein | — |
| actuator-card | 190 | espStore computed | Reaktiv | Nein | **JA** |
| historical | 165 | API-basiert (HistoricalChart) | Watch auf timeRange | Nein | — |
| multi-sensor | 294 | API + Live (MultiSensorChart) | enable-live-updates | Nein | — |
| esp-health | 259 | espStore computed | Reaktiv | **Ja** | — |
| alarm-list | 323 | alertCenterStore | Reaktiv | **Ja** | — |
| actuator-runtime | 199 | espStore computed | Reaktiv | **Ja** | — |

**ActuatorCardWidget:** Toggle-Button mit `sendActuatorCommand()` — funktional im Editor-Kontext.

**Widget-Mount:** Via `h()` + `render()` (nicht createApp). `appContext` von `getCurrentInstance()` in setup(). Props werden einmalig übergeben.

### 6.5 DashboardViewer vs InlineDashboardPanel

| Aspekt | DashboardViewer | InlineDashboardPanel |
|--------|----------------|---------------------|
| Engine | GridStack (staticGrid) | CSS-Grid |
| Interaktion | Read-only | Read-only |
| Widget-Header | Sichtbar (ohne Gear) | Nicht sichtbar |
| Row-Height | 80px | 80px (inline) / 120px (side) |
| Auto-Generated | Banner + "Übernehmen"/"Anpassen" | — |

### 6.6 WidgetConfigPanel

Config-Felder pro Typ: Titel (alle), Sensor-Dropdown (line/gauge/sensor/historical), Aktor-Dropdown (actuator), Zone-Filter (alarm/esp-health/actuator-runtime), Zeitraum-Chips 1h/6h/24h/7d (historical), Y-Min/Max (line/historical), Farbe (alle), Schwellenwerte (line/historical mit Checkbox).

Auto-Threshold-Befüllung aus SENSOR_TYPE_CONFIG bei Sensor-Wechsel.

---

## 7. Cross-Layer Pfad-Verifikation (Block 6)

### 7.1 Pfad: SHT31 Temperaturwert

| Schicht | Datei:Zeile | Aktion | Ergebnis |
|---------|-------------|--------|----------|
| ESP32 | sensor_manager.cpp:973 | `performMultiValueMeasurement()` | 1 I2C-Read, 6 Bytes |
| ESP32 | i2c_sensor_protocol.cpp:202 | `extractRawValue("temperature")` | raw = 23456 |
| ESP32 | sensor_manager.cpp:56 | `applyLocalConversion("sht31_temp", raw)` | value = -45 + 175 × (23456/65535) = 17.5°C |
| ESP32 | sensor_manager.cpp:1411 | `buildMQTTPayload()` | `{sensor_type:"sht31_temp", raw:23456, value:17.5, i2c_address:68}` |
| ESP32 | topic_builder.cpp:86 | Topic | `kaiser/god/esp/{id}/sensor/21/data` |
| Backend | sensor_handler.py:179 | Empfang, Validation | sensor_type = "sht31_temp" (kein Split) |
| Backend | zone_subzone_resolver.py:45 | `get_subzone_by_gpio(esp_id, 21)` | GPIO 21 (SDA-Pin), nicht I2C-Adresse |
| Backend | sensor_repo.py:213 | `save_data()` | zone_id + subzone_id zum Messzeitpunkt gespeichert |
| Backend | sensor_handler.py:408 | WS Broadcast | `{sensor_type:"sht31_temp", value:17.5, gpio:21}` |
| Frontend | sensor.store.ts:102 | Phase-6 Pfad 1 (Registry) | `multi_values["sht31_temp"] = {value:17.5}` |
| Frontend | MonitorView.vue:1698 | SensorCard | Wert: 17.5, Unit: °C (aus SENSOR_TYPE_CONFIG) |

**Ergebnis:** Pfad funktioniert korrekt end-to-end. Unit kommt aus Frontend SENSOR_TYPE_CONFIG, nicht aus Backend.

### 7.2 Pfad: Mock-ESP SHT31 (BUG-Trace)

| Schritt | Was passiert | Problem? |
|---------|-------------|----------|
| Mock-Erstellung (debug.py:242-254) | Dict-Key = `str(sensor.gpio)` | **JA** — bei 2 Sensoren auf GPIO 21 überschreibt der zweite den ersten |
| SensorConfig-Erstellung (debug.py:294-312) | Pro Sensor 1 DB-Eintrag, KEIN Split | Wenn "sht31" → 1 Eintrag. Wenn "sht31_temp"+"sht31_humidity" → 2 Einträge |
| Scheduler-Job (scheduler.py:340-361) | Liest simulation_config, startet Jobs | Nur 1 Job (wegen Key-Überschreibung), sendet letzten sensor_type |
| sensor_handler | Empfängt MQTT mit 1 sensor_type | Sucht SensorConfig — findet Eintrag |
| Frontend espStore.fetchAll() | GET /debug/mock-esp | Gibt sensors[] aus simulation_config zurück — 1 Eintrag |

**Root Cause:** Zweifach:
1. `simulation_config.sensors` Key = `str(gpio)` statt `f"{gpio}_{sensor_type}"` — Multi-Value-Verlust
2. Mock-Erstellung ruft NICHT `is_multi_value_sensor()` auf → kein automatischer Split

**Ergebnis:** Mock-SHT31 zeigt 1 Card statt 2 (oder gar 0 wenn der überschriebene Typ nicht zum SensorConfig passt). Das "4 statt 2"-Szenario tritt auf, wenn zusätzlich über die API separate Sensor-Configs erstellt werden (Post-hoc Split) → dann 1 unsplit + 2 split = 3 Configs, aber nur 1 aktiver Sensor-Job.

### 7.3 Pfad: Aktor-Toggle (Editor → ESP32)

| Schicht | Datei:Zeile | Aktion |
|---------|-------------|--------|
| Frontend | ActuatorCardWidget.vue:56-60 | `toggle()` → `espStore.sendActuatorCommand(espId, gpio, 'ON'/'OFF')` |
| Frontend | esp.ts (sendActuatorCommand) | `POST /actuators/command` oder `POST /actuators/{esp_id}/{gpio}/command` |
| Backend | actuators.py (command endpoint) | `safety_service.validate_actuator_command()` → MQTT publish |
| Backend | MQTT publish | Topic: `kaiser/{id}/esp/{id}/actuator/{gpio}/command`, Payload: `{"command":"ON"}` |
| ESP32 | main.cpp:851 | MQTT-Callback → `actuator_manager.handleCommand()` |
| ESP32 | actuator_manager.cpp:544 | Parse command, `digitalWrite(gpio, HIGH)` oder `analogWrite()` für PWM |
| ESP32 | actuator_manager.cpp (post-command) | `publishActuatorStatus(gpio)` → Topic: `.../actuator/{gpio}/status` |
| Backend | ActuatorStatusHandler | Empfang, DB-Update, WS Broadcast `"actuator_status"` |
| Frontend | actuatorStore.handleActuatorStatus() | `actuator.state = newState` (Mutation) |

**Ergebnis:** Pfad funktioniert korrekt. Safety-Check im Backend vorhanden.

### 7.4 Pfad: Zone-Wechsel eines Sensors

| Schritt | Was passiert |
|---------|-------------|
| Frontend (HardwareView) | `PUT /esp/devices/{id}` mit `zone_id: "zone_b"` |
| Backend | `esp_device.zone_id = "zone_b"` — nur Device-Level, nicht Sensor-Level |
| Backend | Historische `sensor_data`-Einträge bleiben mit `zone_id = "zone_a"` UNVERÄNDERT |
| Frontend nach Wechsel | Zone A's Charts: Historische Daten bleiben (zone_id Filter auf sensor_data) |
| Frontend nach Wechsel | Zone B's Charts: Nur neue Daten ab Wechselzeitpunkt |

**Ergebnis:** Historische Daten bleiben korrekt zugeordnet. zone_id wird zum Messzeitpunkt in sensor_data gespeichert (Phase 0.1).

### 7.5 Pfad: Zone ohne Devices

| Schritt | Was passiert |
|---------|-------------|
| Backend | Zone existiert NUR als zone_id-String in esp_devices — keine eigene Tabelle |
| Backend | Wenn alle Devices entfernt → kein esp_device mit zone_id → Zone "existiert" nicht mehr |
| Backend | `GET /zone/{zone_id}/devices` → leere Liste |
| Backend | `GET /zone/{zone_id}/monitor-data` → leerer Response (keine ESPs gefunden) |
| Frontend L1 | `zoneKPIs` basiert auf `groupDevicesByZone(espStore.devices)` |
| Frontend L1 | Zone ohne Devices → keine Gruppe → **Zone wird NICHT angezeigt** |

**Ergebnis:** Leere Zonen verschwinden aus L1. Das ist ein **Design-Problem** — Zonen als logische Bereiche sollten unabhängig von Devices existieren.

---

## 8. Bug-Verifikation (Block 7)

### V1: SHT31 Mock zeigt falsche Anzahl Cards

**Status:** BESTÄTIGT (Root Cause identifiziert)
**Root Cause:** `debug.py:244` — `simulation_config.sensors` Dict-Key = `str(sensor.gpio)`. Bei 2 Multi-Value-Sensoren auf gleichem GPIO überschreibt der zweite Eintrag den ersten. Zusätzlich: Kein `is_multi_value_sensor()`-Split bei Mock-Erstellung.
**Betroffene Dateien:** debug.py:244, scheduler.py:340-361
**Fix-Richtung:** Key-Format auf `f"{sensor.gpio}_{sensor.sensor_type}"` ändern. Optional: `is_multi_value_sensor()` bei Mock-Erstellung aufrufen um automatischen Split zu ermöglichen.

### V2: ActuatorCard Toggle im monitor-mode

**Status:** BESTÄTIGT
**Root Cause:** `ActuatorCard.vue:89-95` — Toggle-Button hat keinen `v-if="mode === 'config'"` Guard. Ist in allen Modi sichtbar und funktional. `MonitorView.vue:1315-1322` — `toggleActuator()` sendet sofort `sendActuatorCommand()` ohne ConfirmDialog.
**Betroffene Dateien:** ActuatorCard.vue:89-95, MonitorView.vue:1810-1816
**Fix-Richtung:** `v-if="mode !== 'monitor'"` auf den Toggle-Button. Oder ConfirmDialog für monitor-mode.

### V3: Zonen verschwinden ohne Devices

**Status:** BESTÄTIGT
**Root Cause:** Zonen sind keine eigenen DB-Entitäten (keine `zones`-Tabelle). Sie existieren nur als `zone_id`-String in `esp_devices`. `MonitorView.vue:868` filtert `ZONE_UNASSIGNED` — aber Zonen ohne Devices tauchen erst gar nicht in `groupDevicesByZone()` auf.
**Betroffene Dateien:** Backend: Architektur (keine Zone-Tabelle). Frontend: MonitorView.vue:865-939 (zoneKPIs).
**Fix-Richtung:** Zone-Tabelle im Backend einführen mit CRUD-Endpoints. Oder Frontend-Workaround: Zone-IDs separat speichern.

### V4: Subzone-Eingabefeld im Monitor L2

**Status:** WIDERLEGT
**Evidenz:** `MonitorView.vue:1748-1770` — Das Eingabefeld ist conditional: `v-if="creatingSubzoneForZone === selectedZoneId"`. Es erscheint nur nach explizitem Button-Klick und ist funktional korrekt. Kein dauerhaft sichtbares non-funktionales Element.

### V5: Aggregationszeile zählt 0-Werte/Duplikate

**Status:** TEILWEISE BESTÄTIGT
**Root Cause:** `MonitorView.vue:1329-1352` — `getSubzoneKPIs()` filtert `raw_value !== null && raw_value !== undefined`, aber `raw_value = 0` wird MITGEZÄHLT und fließt in den Durchschnitt ein. Zusätzlich: `sensor_type.replace(/[_\d]+/g, '')` entfernt Ziffern und Unterstriche — verschiedene Sensoren mit ähnlichen Typ-Namen nach Entfernung können in die gleiche Gruppe fallen (z.B. "sensor1" und "sensor2" → beide "sensor").
**Betroffene Dateien:** MonitorView.vue:1329-1352
**Fix-Richtung:** 0-Werte nur filtern wenn `quality === 'unknown'` (DB-Initialisierung). Typ-Normalisierung überarbeiten.

### V6: Sparkline-Cache existiert aber Slot ist leer

**Status:** TEILWEISE BESTÄTIGT
**Root Cause:** `useSparklineCache` sammelt Datenpunkte reaktiv aus espStore-Änderungen (watch). Beim ersten Laden ist der Cache leer — Sparkline erscheint erst nach dem ersten WebSocket-Event. Initial kein Sparkline sichtbar, obwohl `useSparklineCache` instanziiert ist.
**Betroffene Dateien:** MonitorView.vue:1698-1706, useSparklineCache.ts
**Fix-Richtung:** Beim Laden des Monitors historische Daten aus API laden um initiale Sparkline zu füllen.

### V7: Keine Loading/Error States auf L1

**Status:** BESTÄTIGT
**Root Cause:** `MonitorView.vue:738` — `espStore.fetchAll()` wird aufgerufen wenn devices leer. Kein `<BaseSkeleton>` für L1. `MonitorView.vue:1433-1436` — Empty State unterscheidet nicht zwischen "lädt" und "wirklich keine Daten". `espStore.error` wird auf L1 nicht ausgelesen.
**Betroffene Dateien:** MonitorView.vue:738-746, 1433-1436
**Fix-Richtung:** `espStore.loading` und `espStore.error` auswerten. BaseSkeleton bei loading, ErrorState bei error, Empty State nur bei wirklich leeren Daten.

### V8: Kein AbortController bei Zone-Wechsel L2

**Status:** BESTÄTIGT
**Root Cause:** `MonitorView.vue:1104-1129` — `fetchZoneMonitorData()` startet API-Call ohne AbortController. `watch(selectedZoneId)` auf Zeile 1131 feuert bei Zone-Wechsel, aber der vorherige Call wird nicht abgebrochen. Race Condition: Alter Response kann neueren überschreiben.
**Betroffene Dateien:** MonitorView.vue:1104-1131
**Fix-Richtung:** `AbortController` pro Fetch, abort bei neuem Watch-Trigger. Oder Request-ID-Vergleich.

### V9: lastSyncError nicht im UI angezeigt

**Status:** BESTÄTIGT
**Root Cause:** `dashboard.store.ts:382-433` — `syncLayoutToServer()` fängt Fehler mit `logger.warn()` ab — fire-and-forget. `lastSyncError` wird nur in `fetchLayouts()` (Zeile 370) gesetzt, nicht bei Sync-Fehlern. Keine Template-Referenz in CustomDashboardView.vue.
**Betroffene Dateien:** dashboard.store.ts:382-433, CustomDashboardView.vue
**Fix-Richtung:** lastSyncError in syncLayoutToServer setzen. Toast oder Banner in CustomDashboardView zeigen.

### V10: isEditing-State geht bei keep-alive verloren

**Status:** WIDERLEGT
**Evidenz:** `CustomDashboardView.vue` — `onDeactivated()` (Zeilen 320-323) löscht nur den Breadcrumb, setzt `isEditing` NICHT zurück. Der State bleibt beim Tab-Wechsel erhalten — man kehrt in denselben Modus zurück.

### V11: Fehlende Timestamps auf manchen SensorCards

**Status:** TEILWEISE BESTÄTIGT
**Root Cause:** `SensorCard.vue` zeigt `last_read` als relativen Timestamp im Footer. Wenn `last_read` null/undefined ist, zeigt die Stale-Badge "Kein Messwert" — korrekt für den Stale-Indikator. Aber wenn `raw_value` vorhanden aber `last_read` fehlt, wird nur der Wert ohne Timestamp angezeigt. Der Sensor erscheint "frisch" obwohl kein Timestamp vorhanden ist.
**Betroffene Dateien:** SensorCard.vue (Footer/Stale-Logik)
**Fix-Richtung:** Bei `raw_value > 0 && !last_read` → Indikator "Zeitpunkt unbekannt" anzeigen.

### V12: Zone-Target-Dropdown fehlt im Editor

**Status:** BESTÄTIGT
**Root Cause:** `CustomDashboardView.vue` — Target-Konfigurator hat 4 Optionen (monitor-inline, monitor-side, monitor-bottom, hardware-inline). Keines davon erlaubt Zone-Targeting. Zone-Targeting (`scope: 'zone', zoneId: '...'`) wird nur durch `generateZoneDashboard()` im Store gesetzt — nicht interaktiv im Editor.
**Betroffene Dateien:** CustomDashboardView.vue:625-675
**Fix-Richtung:** Zone-Dropdown zum Target-Konfigurator hinzufügen. Wenn Zone gewählt → `scope='zone'`, `zoneId` setzen.

---

## 9. SOLL-IST-Matrix

| # | Aspekt | SOLL | IST | Schwere | Schicht |
|---|--------|------|-----|---------|---------|
| 1 | Mock Multi-Value-Sensoren | 2 Sensor-Jobs pro SHT31 | 1 Job (Key-Überschreibung) | HOCH | Backend |
| 2 | Monitor L2 Aktor-Toggle | Read-only (kein Toggle) | Toggle aktiv, sendet Befehle | HOCH | Frontend |
| 3 | Zonen ohne Devices | Zone bleibt sichtbar | Zone verschwindet | HOCH | Backend+Frontend |
| 4 | L1 Loading State | Skeleton während Laden | Empty State "Keine Zonen" | MITTEL | Frontend |
| 5 | L1 Error State | Error-Banner bei API-Fehler | Nichts angezeigt | MITTEL | Frontend |
| 6 | L2 AbortController | Cancel bei Zone-Wechsel | Race Condition möglich | MITTEL | Frontend |
| 7 | Aggregation 0-Werte | 0-Werte bei quality=unknown filtern | 0 wird mitgezählt | MITTEL | Frontend |
| 8 | Sparkline initial | Historische Daten laden | Leer bis erstes WS-Event | MITTEL | Frontend |
| 9 | Dashboard Sync-Error | User informieren | Fire-and-forget | NIEDRIG | Frontend |
| 10 | Zone-Target im Editor | Dropdown für Zone-Auswahl | Nur via Auto-Generierung | NIEDRIG | Frontend |
| 11 | L1 Keyboard Accessibility | `<button>` mit focus | `<div @click>` ohne tabindex | NIEDRIG | Frontend |
| 12 | Sensor-Daten resolution | Serverseitige Aggregation | Nur Rohdaten, kein resolution-Param | NIEDRIG | Backend |
| 13 | BMP280 Init-Sequenz | ctrl_meas Register schreiben | Nicht implementiert | NIEDRIG | ESP32 |
| 14 | quality JSON doppelt | 1x quality im Payload | 2x quality (sensor_manager.cpp) | NIEDRIG | ESP32 |
| 15 | Target Label-Bug | "Übersicht — Seitenpanel" → side-panel | Sendet placement='inline' | NIEDRIG | Frontend |
| 16 | raw_mode Pflichtfeld | Optional mit Default True | Validator erzwingt Pflicht | NIEDRIG | Backend |

---

## 10. Priorisierte Fix-Liste

### HOCH (Blockiert Kernfunktionalität)

| # | Bug | Dateien | Geschätzter Aufwand |
|---|-----|---------|---------------------|
| 1 | Mock Multi-Value Key-Format | debug.py:244 | Klein — Key auf `f"{gpio}_{sensor_type}"` ändern |
| 2 | ActuatorCard Toggle mode-Guard | ActuatorCard.vue:89-95 | Klein — `v-if="mode !== 'monitor'"` |
| 3 | Zone-Tabelle einführen | Backend: neues Model + Migration + API | Groß — Architektur-Änderung, betrifft Zone-Assignment, Monitor, Frontend |

### MITTEL (User Experience)

| # | Bug | Dateien | Geschätzter Aufwand |
|---|-----|---------|---------------------|
| 4 | L1 Loading/Error States | MonitorView.vue:738, 1433 | Klein — espStore.loading/error auswerten |
| 5 | L2 AbortController | MonitorView.vue:1104-1131 | Klein — AbortController + Request-ID |
| 6 | Aggregation 0-Werte Filter | MonitorView.vue:1329-1352 | Klein — quality-Check hinzufügen |
| 7 | Sparkline initiale Daten | MonitorView.vue, useSparklineCache.ts | Mittel — API-Call für letzte 30 Datenpunkte |

### NIEDRIG (Polish)

| # | Bug | Dateien | Geschätzter Aufwand |
|---|-----|---------|---------------------|
| 8 | Dashboard lastSyncError UI | dashboard.store.ts, CustomDashboardView.vue | Klein |
| 9 | Zone-Target Dropdown | CustomDashboardView.vue:625-675 | Mittel |
| 10 | L1 Keyboard Accessibility | MonitorView.vue:1440-1444 | Klein — `<button>` + tabindex |
| 11 | Target Label-Bug | CustomDashboardView.vue:666-675 | Klein — placement korrigieren |
| 12 | raw_mode Default | sensor_handler.py:714-719 | Klein — Default True wenn fehlend |
| 13 | quality JSON doppelt | sensor_manager.cpp:1454-1483 | Klein — zweite Zeile entfernen |
| 14 | BMP280 Init | i2c_sensor_protocol.cpp | Mittel — Init-Sequenz hinzufügen |
| 15 | SensorCard Timestamp-Hint | SensorCard.vue | Klein — "Zeitpunkt unbekannt" |

---

## 11. Offene Fragen

1. **NVS-Restore beim Boot:** `setup()` in main.cpp hat keinen expliziten Aufruf der NVS-Sensor-Configs in den SensorManager zurücklädt. Wird erwartet, dass der Server nach jedem Boot die Config neu pusht? Oder gibt es einen undokumentierten Restore-Pfad?

2. **Mock-ESP Default-Sensoren:** Welche sensor_types werden typischerweise bei der Frontend-Mock-Erstellung übergeben? Sind sie bereits gesplittet (sht31_temp) oder unsplittet (sht31)? Das bestimmt die genaue Manifestation des V1-Bugs.

3. **assigned_gpios bei I2C Multi-Value:** Wenn SHT31 auf GPIO 21 (SDA) liegt und zwei SensorConfigs existieren (sht31_temp, sht31_humidity), wird GPIO 21 einmal oder zweimal in assigned_gpios gespeichert? Duplikate in assigned_gpios?

4. **Doppelte Online-Definition L1:** `zoneKPIs` berechnet `onlineDevices` via `getESPStatus()`, aber `aggregateZoneSensors()` prüft `d.status === 'online' || d.connected === true`. Zwei verschiedene Definitionen von "online" in L1. Können sie divergieren?

5. **Sensor-Daten Resolution:** Ohne serverseitige Aggregation: Wie performt die historische Chart-Darstellung bei Wochen/Monaten an Daten? Wird das Frontend mit Rohdaten überflutet? Limit von 1000 reicht eventuell nicht.

6. **SubzoneConfig.sensor_count / actuator_count:** Diese Felder existieren im Model, aber werden sie aktuell aktualisiert? Oder sind sie stale?

---

*Phase 0 Analyse abgeschlossen. Dieser Bericht bildet die Basis für gezielte Fix-Aufträge.*
