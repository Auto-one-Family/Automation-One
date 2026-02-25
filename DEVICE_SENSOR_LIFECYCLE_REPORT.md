# Device/Sensor-Lifecycle Analyse-Bericht

> **Erstellt:** 2026-02-24
> **Agent:** Claude Opus 4.6 (Code-Analyse + DB-Queries)
> **Kontext:** Post PR #14 + PR #15 Merge, 8/8 CI gruen, vor Hardware-Testlauf
> **Status:** ANALYSE KOMPLETT — Fix-Empfehlungen formuliert

---

## 1. Datenbank-Ist-Zustand

### ESP-Inventar (6 Geraete)

| device_id | name | status | hardware_type | last_seen | hours_since | mock? | Kategorie |
|-----------|------|--------|---------------|-----------|-------------|-------|-----------|
| MOCK_0954B2B1 | Mock #B2B1 | online | MOCK_ESP32 | 2026-02-24 19:31 | 0.0h | `metadata.mock=true` | Aktiver Mock |
| MOCK_5D5ADA49 | Mock #DA49 | offline | MOCK_ESP32 | 2026-02-23 23:48 | ~20h | `metadata.mock=true` | Staler Mock |
| **ESP_472204** | *(leer)* | **offline** | **ESP32_WROOM** | 2026-02-21 10:48 | **~81h** | **Nein** | **Robin's echter ESP** |
| MOCK_7CE9A94D | Mock #A94D | offline | MOCK_ESP32 | 2026-02-16 09:38 | ~202h | `metadata.mock=true` | Staler Mock |
| MOCK_E1BD1447 | *(leer)* | approved | ESP32_WROOM | 2026-02-16 09:04 | ~202h | **Nein (!)** | Wokwi-Ghost |
| MOCK_25045525 | *(leer)* | approved | ESP32_WROOM | 2026-02-16 09:04 | ~202h | **Nein (!)** | Wokwi-Ghost |

**Auffaelligkeiten:**
- **2 Wokwi-Ghosts** (MOCK_E1BD1447, MOCK_25045525): device_id beginnt mit `MOCK_`, aber `hardware_type=ESP32_WROOM` und `metadata.mock` fehlt. Diese kamen per MQTT-Heartbeat rein (discovery_source=heartbeat) und wurden nie als Mock markiert. Frontend erkennt sie als Mock (Prefix-Check), aber Backend/Grafana nicht.
- **Kein is_mock-Feld** in `esp_devices` Tabelle. Mock-Erkennung laeuft ueber `device_metadata->>'mock'` (JSON) — inkonsistent.
- **Robin's ESP** (ESP_472204) ist seit 81h offline, hat aber eine sensor_config mit `config_status=failed`.

### Sensor-Config-Inventar (1 Eintrag)

| esp_id | sensor_type | gpio | interface_type | i2c_address | enabled | config_status | config_error | config_error_detail |
|--------|-------------|------|----------------|-------------|---------|---------------|--------------|---------------------|
| ESP_472204 | **sht31** | **0** | I2C | 68 (0x44) | true | **failed** | CONFIG_FAILED | Failed to configure sensor on GPIO 0 |

**Auffaelligkeiten:**
- `sensor_type = "sht31"` — Dies ist der **Basis-Geraetetyp**, nicht der spezifische Werttyp. Die ESP32-Firmware-Registry ([sensor_registry.cpp:113-118](El Trabajante/src/models/sensor_registry.cpp#L113-L118)) kennt nur `"sht31_temp"` und `"sht31_humidity"`, NICHT `"sht31"` allein.
- `gpio = 0` — Platzhalter fuer I2C-Sensoren (I2C nutzt Bus auf GPIO 21/22). GPIO 0 ist ein Boot-Strapping-Pin und in der System-Reserved-Liste.
- `config_status = "failed"` — Die Firmware konnte den Sensor nicht konfigurieren, weil `findSensorCapability("sht31")` `nullptr` zurueckgibt.

### Sensor-Daten-Bestand (2 Eintraege)

| sensor_type | entries | earliest | latest | data_source | device_id |
|-------------|---------|----------|--------|-------------|-----------|
| temperature | 1 | 2026-02-23 20:03 | 2026-02-23 20:03 | mock | MOCK_0954B2B1 |
| temperature | 1 | 2026-02-23 13:36 | 2026-02-23 13:36 | mock | MOCK_5D5ADA49 |

- **Nur Mock-Daten** vorhanden. Keine echten Sensor-Daten.
- 0 SHT31-Daten (weder temp noch humidity).

### Heartbeat-Logs

| device_id | data_source | count | first_hb | last_hb |
|-----------|-------------|-------|----------|---------|
| MOCK_0954B2B1 | mock | 957 | 2026-02-23 17:15 | 2026-02-24 19:31 |
| MOCK_5D5ADA49 | mock | 2241 | 2026-02-15 18:52 | 2026-02-23 23:43 |
| ESP_472204 | production | 51 | 2026-02-20 22:25 | 2026-02-20 23:15 |
| MOCK_7CE9A94D | mock | 371 | 2026-02-15 18:52 | 2026-02-16 09:32 |

- **MOCK_E1BD1447 und MOCK_25045525 haben KEINE Heartbeat-Logs** — obwohl sie per `discovery_source=heartbeat` reinkamen. Das deutet darauf hin, dass der initiale Heartbeat verarbeitet wurde, aber kein regulaerer Heartbeat-Log erstellt wurde (oder die Logs geloescht wurden).

---

## 2. Sensor-Akzeptanz-Flow

### Ist-Flow (mit Code-Referenzen)

```
Frontend: AddSensorModal → sensor_type="SHT31", gpio=0, i2c_address=68
    ↓ espStore.addSensor() [esp.ts:663-723]
    ↓ sensorsApi.createOrUpdate(deviceId, 0, realConfig)
    ↓
Backend API: POST /v1/sensors/{esp_id}/0
    ↓ [sensors.py:354-572]
    ↓ Device Status Guard: status in ("approved", "online") → OK [L388]
    ↓ I2C: Kein GPIO-Validation (I2C darf GPIO teilen) [L416-424]
    ↓ sensor_config INSERT: config_status="pending" [L508-524]
    ↓ db.commit() [L527]
    ↓ ConfigPayloadBuilder.build_combined_config() [config_builder.py:156-246]
    ↓   → sensor_type="sht31" 1:1 durchgereicht (KEIN Mapping!) [config_mapping.py:190-194]
    ↓ esp_service.send_config() [esp_service.py:367-495]
    ↓   → MQTT publish: kaiser/god/esp/ESP_472204/config
    ↓   → Payload: {"sensors": [{"gpio": 0, "sensor_type": "sht31", ...}]}
    ↓
ESP32 Firmware: handleSensorConfig() [main.cpp:2302-2527]
    ↓ parse JSON → config.sensor_type = "sht31"
    ↓ findSensorCapability("sht31") → nullptr [sensor_registry.cpp:113-150]
    ↓   Registry kennt: "temperature_sht31", "humidity_sht31", "sht31_temp", "sht31_humidity"
    ↓   NICHT: "sht31" allein!
    ↓ is_i2c_sensor = false (weil capability == nullptr)
    ↓ Standard-GPIO-Reservierung fuer GPIO 0
    ↓ sensorManager.configureSensor() → false [sensor_manager.cpp:161]
    ↓ CONFIG_FAILED: "Failed to configure sensor on GPIO 0"
    ↓
ESP32 → MQTT: config_response [config_response.cpp:42-92]
    ↓ status="error", type="sensor", error_code="CONFIG_FAILED"
    ↓ failures: [{gpio: 0, error: "CONFIG_FAILED", detail: "...GPIO 0"}]
    ↓
Backend: ConfigHandler.handle_config_ack() [config_handler.py:64-267]
    ↓ _process_config_failures() → sensor_config.config_status = "failed" [L324-395]
    ↓ WebSocket broadcast: config_response event
    ↓
Frontend: useConfigResponse composable → UI zeigt Fehler
```

### Identifizierte Luecke: sensor_type Mapping

**Root Cause:** Das Frontend sendet den **Basis-Geraetetyp** `"SHT31"` (oder `"sht31"` nach Lowercase). Die Backend-API schreibt ihn 1:1 in die DB und schickt ihn 1:1 an den ESP. Aber der ESP erwartet den **spezifischen Werttyp** (`"sht31_temp"` oder `"sht31_humidity"`).

Fuer einen Multi-Value-Sensor wie den SHT31 (liefert Temperatur UND Luftfeuchtigkeit) muessten eigentlich **2 sensor_configs** erstellt werden: eine fuer `"sht31_temp"` und eine fuer `"sht31_humidity"`.

**Stellen wo die Luecke existiert:**

1. [AddSensorModal.vue:162](El Frontend/src/components/esp/AddSensorModal.vue#L162) — Sendet `sensor_type="SHT31"` ohne Aufloessung in Werttypen
2. [esp.ts:687](El Frontend/src/stores/esp.ts#L687) — `sensor_type: config.sensor_type` 1:1 durchgereicht
3. [config_mapping.py:190-194](El Servador/god_kaiser_server/src/core/config_mapping.py#L190-L194) — `sensor_type` 1:1 gemappt, keine Transformation
4. [sensor_registry.cpp:113-150](El Trabajante/src/models/sensor_registry.cpp#L113-L150) — Kein Eintrag fuer `"sht31"` allein

**Bemerkung:** Das Frontend hat die Multi-Value-Logik bereits implementiert! [sensorDefaults.ts:520-532](El Frontend/src/utils/sensorDefaults.ts#L520-L532) definiert `MULTI_VALUE_DEVICES.sht31` mit `sensorTypes: ['sht31_temp', 'sht31_humidity']`. Diese Logik wird aber beim `addSensor`-Flow **nicht genutzt**.

### Auswirkung auf Testlauf

- **KRITISCH:** SHT31-Konfiguration per Frontend ist aktuell nicht moeglich. Die Config wird geschrieben, aber der ESP lehnt sie ab.
- Das Frontend zeigt `config_status="failed"` korrekt an (Write-After-Verification funktioniert!).
- Der Fix muss entweder im Frontend (Multi-Value-Aufspaltung) oder Backend (sensor_type Normalisierung) oder Firmware (Registry-Erweiterung) passieren.

---

## 3. Mock-Handling

### Bestehende Infrastruktur (mit Code-Referenzen)

| Feature | Status | Code-Referenz |
|---------|--------|---------------|
| Mock-ESP erstellen | Vorhanden | [debug.py:200](El Servador/god_kaiser_server/src/api/v1/debug.py#L200) `POST /v1/debug/mock-esp` |
| Mock-ESP loeschen | Vorhanden | [debug.py:450](El Servador/god_kaiser_server/src/api/v1/debug.py#L450) `DELETE /v1/debug/mock-esp/{id}` |
| Mock-ESP auflisten | Vorhanden | [debug.py:364](El Servador/god_kaiser_server/src/api/v1/debug.py#L364) `GET /v1/debug/mock-esp` |
| Simulation starten | Vorhanden | [debug.py:496](El Servador/god_kaiser_server/src/api/v1/debug.py#L496) `POST /v1/debug/mock-esp/{id}/start` |
| Simulation stoppen | Vorhanden | [debug.py:559](El Servador/god_kaiser_server/src/api/v1/debug.py#L559) `POST /v1/debug/mock-esp/{id}/stop` |
| Bulk-Create Mocks | Vorhanden | [debug.py:3018](El Servador/god_kaiser_server/src/api/v1/debug.py#L3018) `POST /v1/debug/mock-esp/bulk-create` |
| Mock-Erkennung Backend | Ueber `device_metadata.mock` JSON | [heartbeat_handler.py:881-924](El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py#L881-L924) |
| Mock-Erkennung Frontend | Ueber device_id Prefix | [esp.ts:171-176](El Frontend/src/api/esp.ts#L171-L176) `MOCK_` oder `ESP_MOCK_` |
| Mock/Real Trennung Frontend | Vorhanden | [esp.ts:166-176](El Frontend/src/stores/esp.ts#L166-L176) `mockDevices` / `realDevices` computed |
| Mock-Heartbeat | SimulationScheduler | [scheduler.py](El Servador/god_kaiser_server/src/services/simulation/scheduler.py) |

### Was fehlt

| Aspekt | Ist-Zustand | Soll-Zustand |
|--------|-------------|--------------|
| Mock-Kennzeichnung in DB | `device_metadata->>'mock'` (JSON, optional) | Entweder dediziertes `is_mock` Feld ODER konsistentes `hardware_type=MOCK_ESP32` |
| Wokwi-Ghosts | 2 Geraete mit `MOCK_*` device_id aber `ESP32_WROOM` hardware_type und kein `mock` Flag | Bereinigen oder korrekt als Mock markieren |
| Heartbeat-Gap-Alert Ausnahme | Grafana Alert feuert fuer ALLE ESPs | `device_metadata_mock != "true"` oder Label-Filter in PromQL |
| Stale-Mock-Cleanup | Manuell per DELETE-Endpoint | Automatischer Cleanup-Job (oder TM-Trigger) |
| Mock-Badge im Frontend | Prefix-basiert (funktioniert) | Zusaetzlich Backend-Flag auswerten fuer Wokwi-Ghosts |

### Mock-Lifecycle Soll-Zustand

```
Mock erstellen → status="online", metadata.mock=true, simulation_state="running"
    ↓
Heartbeat-Simulation aktiv → heartbeat_logs mit data_source="mock"
    ↓
Simulation stoppen → status="offline", simulation_state="stopped"
    ↓
Cleanup → DELETE Endpoint oder automatischer Job nach X Tagen
```

**Kritisch:** Mocks sollen KEINE Grafana-Alerts triggern. Aktuell fehlt ein Label-Filter.

---

## 4. Validierungsluecken

### Backend

| Luecke | Stelle | Auswirkung | Schwere |
|--------|--------|------------|---------|
| **sensor_type wird nicht gegen Firmware-Registry validiert** | [sensors.py:474-476](El Servador/god_kaiser_server/src/api/v1/sensors.py#L474-L476) | Ungueltige sensor_types (z.B. "sht31" statt "sht31_temp") werden in DB geschrieben | KRITISCH |
| **Multi-Value-Sensoren werden nicht in Werttypen aufgespalten** | [sensors.py:354-572](El Servador/god_kaiser_server/src/api/v1/sensors.py#L354-L572) | SHT31 erstellt 1 statt 2 sensor_configs | KRITISCH |
| **config_builder GPIO-Konflikt-Check ignoriert I2C Bus-Sharing** | [config_builder.py:204-212](El Servador/god_kaiser_server/src/services/config_builder.py#L204-L212) | Wenn 2 SHT31-Werttypen auf GPIO 0 liegen, wirft build_combined_config einen ConfigConflictError | HOCH |
| ESP-Online-Check beim Config-Senden ist nur "warn" (Default) | [esp_service.py:443-447](El Servador/god_kaiser_server/src/services/esp_service.py#L443-L447) | Config wird an offline-ESP gesendet, MQTT queued sie, aber ESP bekommt sie erst beim Reconnect | NIEDRIG (by design) |

### Frontend

| Luecke | Stelle | Auswirkung | Schwere |
|--------|--------|------------|---------|
| **AddSensorModal sendet Basis-Typ statt Werttypen** | [AddSensorModal.vue:162-168](El Frontend/src/components/esp/AddSensorModal.vue#L162-L168) | "SHT31" wird gesendet statt "sht31_temp" + "sht31_humidity" | KRITISCH |
| **gpio=0 Platzhalter fuer I2C nicht dokumentiert** | [AddSensorModal.vue:166](El Frontend/src/components/esp/AddSensorModal.vue#L166) | Verwirrende Fehlermeldung "Failed to configure on GPIO 0" | MITTEL |
| MULTI_VALUE_DEVICES-Logik vorhanden aber nicht im Add-Flow genutzt | [sensorDefaults.ts:520-532](El Frontend/src/utils/sensorDefaults.ts#L520-L532) | Bestehender Code wird nicht verwendet | MITTEL |

### Firmware

| Luecke | Stelle | Auswirkung | Schwere |
|--------|--------|------------|---------|
| **Kein Fallback fuer Basis-Geraetetypen in Registry** | [sensor_registry.cpp:113-150](El Trabajante/src/models/sensor_registry.cpp#L113-L150) | `"sht31"` wird nicht erkannt, nur `"sht31_temp"` etc. | HOCH |
| I2C-Sensor mit unbekanntem Typ faellt auf Standard-GPIO-Logik zurueck | [sensor_manager.cpp:176-177](El Trabajante/src/services/sensor/sensor_manager.cpp#L176-L177) | Wenn `findSensorCapability` null zurueckgibt, wird `is_i2c_sensor=false` und GPIO-Reservierung versucht | HOCH |

---

## 5. Fix-Empfehlungen

### Quick Wins (vor Testlauf — minimal-invasiv)

#### QW-1: Firmware sensor_registry um Basis-Typen erweitern

```
Fix: "sht31" als Alias fuer "sht31_temp" in SENSOR_TYPE_MAP eintragen
Datei: El Trabajante/src/models/sensor_registry.cpp:113-150
Aenderung: {"sht31", &SHT31_TEMP_CAP} hinzufuegen
Risiko: NIEDRIG (additive Aenderung, keine Breaking Changes)
Aufwand: 5 Minuten
```

> **Hinweis:** Dies ist ein Workaround, nicht die vollstaendige Loesung. Der eigentliche Fix ist QW-2 oder V-1.

#### QW-2: Frontend AddSensorModal — Multi-Value-Aufspaltung

```
Fix: Wenn SHT31 gewaehlt wird, 2 API-Calls ausfuehren: sht31_temp + sht31_humidity
Datei: El Frontend/src/components/esp/AddSensorModal.vue:160-171
       El Frontend/src/stores/esp.ts:663-723
Aenderung: isMultiValueSensorType() Check vor addSensor, ggf. Loop ueber getSensorTypesForDevice()
Risiko: MITTEL (aendert User-Flow, muss getestet werden)
Aufwand: 30-60 Minuten
```

#### QW-3: DB-Cleanup fuer stale Mocks und fehlerhafte sensor_config

```
Fix: SQL-Cleanup der 3 stale Mocks und der fehlerhaften SHT31-Config
Datei: Kein Code-Fix, nur DB-Statements (siehe Abschnitt 6)
Risiko: NIEDRIG (nur alte Daten entfernt, CASCADE loescht abhaengige Eintraege)
Aufwand: 5 Minuten
```

#### QW-4: SHT31 sensor_config mit korrektem sensor_type neu erstellen

```
Fix: Bestehende sensor_config loeschen und mit sensor_type="sht31_temp" neu erstellen
Datei: Kein Code-Fix, API-Call oder DB-Statement
Risiko: NIEDRIG
Aufwand: 5 Minuten
Voraussetzung: QW-1 (Firmware) ODER QW-2 (Frontend) muss erst umgesetzt sein
```

### Vollstaendige Fixes (nach Testlauf)

#### V-1: Backend sensor_type Normalisierung/Validierung

```
Fix: In POST /v1/sensors/{esp_id}/{gpio} einen Validierungsschritt einfuegen
     der prueft ob der sensor_type in einer bekannten Liste ist.
     Fuer Multi-Value-Geraete (sht31, bmp280, bme280) automatisch
     in Werttypen aufspalten und 2+ sensor_configs erstellen.
Datei(en):
  - El Servador/god_kaiser_server/src/api/v1/sensors.py (Endpoint-Logik)
  - El Servador/god_kaiser_server/src/sensors/sensor_type_registry.py (Validierung)
Aufwand: 2-4 Stunden
```

#### V-2: config_builder GPIO-Konflikt-Check fuer I2C Bus-Sharing fixen

```
Fix: In build_combined_config() den GPIO-Konflikt-Check so anpassen,
     dass I2C-Sensoren denselben gpio-Wert (0 als Platzhalter oder 21/22 als Bus-Pins)
     teilen duerfen.
Datei: El Servador/god_kaiser_server/src/services/config_builder.py:202-224
Aufwand: 30 Minuten
```

#### V-3: Grafana Heartbeat-Gap-Alert mit Mock-Filter

```
Fix: PromQL-Query um Label-Filter erweitern:
     god_kaiser_esp_last_heartbeat{data_source!="mock"}
     ODER: device_metadata-basierter Filter wenn Prometheus-Exporter das Label exportiert
Datei: docker/grafana/provisioning/alerting/alert-rules.yml:857
Aufwand: 15 Minuten
```

#### V-4: Wokwi-Ghost-Erkennung und -Bereinigung

```
Fix: Backend-Logik die ESPs mit MOCK_-Prefix aber hardware_type!=MOCK_ESP32
     automatisch als Mock markiert oder warnt.
     Alternativ: Cleanup-Job der diese Inkonsistenz erkennt.
Datei(en):
  - El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py
  - El Servador/god_kaiser_server/src/services/maintenance/jobs/cleanup.py
Aufwand: 1-2 Stunden
```

#### V-5: Frontend config_status Zustandsmaschine verbessern

```
Fix: ESPCard/SensorValueCard soll zwischen "pending", "applied", "failed"
     visuell unterscheiden (Badge/Icon/Farbe).
     "pending" = gelb/orange Spinner, "applied" = gruen Check, "failed" = rot X
     Bereits teilweise vorhanden in useConfigResponse.ts
Datei(en):
  - El Frontend/src/composables/useConfigResponse.ts
  - El Frontend/src/components/esp/SensorValueCard.vue
Aufwand: 1-2 Stunden
```

---

## 6. DB-Cleanup-Plan

### Was loeschen

**Reihenfolge beachten!** CASCADE-Constraints loeschen abhaengige Eintraege automatisch.

```sql
-- 1. Fehlerhafte SHT31 sensor_config loeschen (config_status=failed)
DELETE FROM sensor_configs
WHERE esp_id = '3c4c4130-95a7-44c6-b0e7-9069bd4e9d31'  -- ESP_472204
AND sensor_type = 'sht31'
AND config_status = 'failed';

-- 2. Stale Mock loeschen: MOCK_7CE9A94D (202h offline, 371 heartbeats)
-- CASCADE loescht: heartbeat_logs, sensor_data, sensor_configs, actuator_*
DELETE FROM esp_devices WHERE device_id = 'MOCK_7CE9A94D';

-- 3. Wokwi-Ghost loeschen: MOCK_E1BD1447 (202h, keine heartbeat_logs)
DELETE FROM esp_devices WHERE device_id = 'MOCK_E1BD1447';

-- 4. Wokwi-Ghost loeschen: MOCK_25045525 (202h, keine heartbeat_logs)
DELETE FROM esp_devices WHERE device_id = 'MOCK_25045525';
```

### Was behalten

| device_id | Grund |
|-----------|-------|
| **ESP_472204** | Robin's echter ESP32 — Muss fuer Testlauf bleiben |
| **MOCK_0954B2B1** | Aktiver Mock (online, 957 heartbeats) — Fuer Testing nuetzlich |
| **MOCK_5D5ADA49** | Optional behalten (20h offline) — Entscheidung User |

### Optionaler Cleanup: MOCK_5D5ADA49

```sql
-- Optional: MOCK_5D5ADA49 loeschen wenn nicht mehr benoetigt
-- Hat 2241 heartbeat_logs und 1 mock sensor_data Eintrag
DELETE FROM esp_devices WHERE device_id = 'MOCK_5D5ADA49';
```

### Verifikation nach Cleanup

```sql
-- Pruefen: Nur noch gewuenschte ESPs vorhanden
SELECT device_id, status, hardware_type,
       (device_metadata->>'mock')::text as is_mock
FROM esp_devices
ORDER BY device_id;

-- Pruefen: Keine verwaisten sensor_configs
SELECT sc.id, sc.sensor_type, sc.config_status
FROM sensor_configs sc
LEFT JOIN esp_devices ed ON sc.esp_id = ed.id
WHERE ed.id IS NULL;

-- Pruefen: Keine verwaisten heartbeat_logs
SELECT COUNT(*) FROM esp_heartbeat_logs ehl
LEFT JOIN esp_devices ed ON ehl.esp_id = ed.id
WHERE ed.id IS NULL;
```

---

## Zusammenfassung der Prioritaeten

| # | Fix | Prio | Vor Testlauf? | Aufwand |
|---|-----|------|---------------|---------|
| QW-1 | Firmware Registry: "sht31" Alias | KRITISCH | JA | 5 min |
| QW-3 | DB-Cleanup stale Mocks | HOCH | JA | 5 min |
| QW-4 | SHT31 Config neu erstellen | KRITISCH | JA (nach QW-1) | 5 min |
| QW-2 | Frontend Multi-Value-Aufspaltung | HOCH | OPTIONAL | 30-60 min |
| V-2 | config_builder I2C Bus-Sharing | HOCH | NEIN | 30 min |
| V-3 | Grafana Mock-Filter | MITTEL | NEIN | 15 min |
| V-1 | Backend sensor_type Validierung | HOCH | NEIN | 2-4h |
| V-4 | Wokwi-Ghost-Erkennung | NIEDRIG | NEIN | 1-2h |
| V-5 | Frontend config_status UI | NIEDRIG | NEIN | 1-2h |

**Empfohlener Ablauf vor Testlauf:**
1. QW-1 (Firmware Registry Fix) → `pio run` → Flash
2. QW-3 (DB Cleanup) → SQL ausfuehren
3. QW-4 (SHT31 Config neu erstellen) → Per Frontend oder API
4. ESP einschalten → Heartbeat → Zone zuweisen → SHT31 konfigurieren → Config Response pruefen
