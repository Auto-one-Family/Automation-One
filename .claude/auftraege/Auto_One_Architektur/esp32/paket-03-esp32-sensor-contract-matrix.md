# Paket 03: ESP32 Sensor Contract-Matrix (P1.3)

## 1) Ziel

Contract-Sicht fuer Sensorpfade: Topic, QoS, Payloadfelder, Einheiten, Guards und Zuordnung zur Server-Ingestion.

## 2) Contract-Matrix (Sensorbezogen)

| Contract-ID | Richtung | Topic | QoS (Firmware IST) | Pflichtfelder (Firmware-Payload) | Optionalfelder | Guards/Regeln | Server-Ingestion Bezug |
|---|---|---|---|---|---|---|---|
| FW-CON-SEN-001 | ESP -> Server | `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data` | 1 | `esp_id`, `seq`, `zone_id`, `subzone_id`, `gpio`, `sensor_type`, `raw`, `value`, `unit`, `quality`, `ts`, `time_valid`, `raw_mode` | `onewire_address`, `i2c_address` | Topic nur via `TopicBuilder`; `raw_mode` soll true sein; I2C-Adresse nur bei I2C-Capability | `kaiser/+/esp/+/sensor/+/data` -> `sensor_handler.py:77` (laut MQTT_TOPICS Referenz) |
| FW-CON-SEN-002 | Server -> ESP | `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/command` | Subscribed mit 1 | Payload minimal: `command` (`measure`) | `request_id` | Routing Core0->`g_sensor_cmd_queue`->Core1; topic format muss `.../sensor/{gpio}/command` sein | Trigger fuer on-demand measurement |
| FW-CON-SEN-003 | ESP -> Server | `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/response` | 1 | Bei request_id: `request_id`, `gpio`, `command`, `success`, `ts`, `seq` | keine | Nur bei `request_id` im Command; bei Queue-Drop keine Antwort | Asynchrone Command-Korrelation |
| FW-CON-SEN-004 | Server -> ESP | `kaiser/{kaiser_id}/esp/{esp_id}/config` (sensor section) | Subscription 1 (Publish serverseitig meist 2) | Sensorobjekt: `gpio`, `sensor_type`, `sensor_name` | `active`, `raw_mode`, `onewire_address`, `i2c_address`, `operating_mode`, `measurement_interval_seconds`, `subzone_id` | Payloadgroesse <=4095; Queue-Apply auf Core1; parse-fail im Queue-Worker aktuell ohne garantierten negativen ACK | Sensorregistrierung / Reconfig |
| FW-CON-SEN-005 | ESP -> Server | `kaiser/{kaiser_id}/esp/{esp_id}/config_response` | i. d. R. 2 fuer Config-Antworten | status/error je Builder | failure-details, correlation | Parse-fail Luecke in `processConfigUpdateQueue` kann Antwort verhindern | Server Config-Sync-Feedback |
| FW-CON-SEN-006 | Server -> ESP | `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat/ack` | Subscribed default 0 (Aufruf ohne qos-arg) | ACK payload mit `status` (approved/pending/etc.) | `config_available`, `server_time`, `error` | ACK resetet P1-Timer + beendet ggf. OFFLINE_ACTIVE | Gate fuer Registration + Safety-Recovery |
| FW-CON-SEN-007 | Server -> ESP | `kaiser/{kaiser_id}/server/status` | 1 | `status` (`online`/`offline`) | `reason` | Bei `offline` startet Offline-Flow; bei `online` Timer-Reset + ACK-Ersatz-Recovery | LWT-basiertes fruehes Server-Liveness-Signal |

## 3) Feld- und Einheitensemantik je Sensorklasse

| Sensorklasse | `sensor_type` im Publish | `raw` Semantik | `value`/`unit` lokal | `quality` lokal | Address-Identifikator |
|---|---|---|---|---|---|
| Analog (`ph`, `ec`, `moisture`) | normalisiert via Registry (`ph`, `ec`, `moisture`) | ADC raw (0..4095) | derzeit raw-nahe Preview (`unit=raw`) | default `good` | keiner |
| OneWire (`ds18b20`) | `ds18b20` | signed raw temp (1/16 deg C) als int-cast in JSON | Preview in deg C | `good`, `suspect`, `error` je Guard | `onewire_address` |
| I2C SHT31 | `sht31_temp` / `sht31_humidity` | 16-bit raw aus Protokoll | temp `%`/deg C Preview | default `good` | `i2c_address` |
| I2C BMP280/BME280 | pressure/temp/(humidity) Typen | register raw (2-3 bytes je value type) | lokale Preview-Konversion | default `good` | `i2c_address` |
| Digital (derzeit nicht aktiv) | kein aktiver Registry-Typ | n/a | n/a | n/a | n/a |

## 4) Contract-Guards und Invarianten

1. Sensordatenpublish erfolgt nur bei MQTT connected; Value-Cache update davor bleibt garantiert.
2. `raw_mode` wird im Reading standardmaessig auf true gesetzt; server-zentrische Verarbeitung bleibt SSoT.
3. I2C Multi-Value dedup verhindert doppelte Reads fuer gleiche physische Adresse pro Zyklus.
4. OneWire ROM muss 16 hex chars sein; duplicate ROM registration wird abgewiesen.
5. Sensor-Owner-Daten (`sensors_[]`) werden durch Queue-Disziplin auf Core 1 angewendet.

## 5) Contract-Risiken / Drift

1. **QoS Drift heartbeat ACK:** Referenzdoku beschreibt teils QoS 1, Firmware subscribed aktuell ohne qos-Arg (default 0).
2. **Config parse-fail ACK-Luecke:** Bei Queue-Parserfehler fehlt ein garantiertes negatives `config_response`.
3. **Silent Drop Contracts:** Sensor command queue und publish queue koennen Drops erzeugen, ohne dedizierten nack-contract.

## 6) Fortschreibung Seedlist (P1.1 -> P1.3)

- FW-CON-001 (Sensor -> MQTT Publish) ist konkretisiert auf reale Firmware-Payload (`raw`, `value`, `time_valid`, Adressfelder).
- FW-CON-003 (Config Push -> Apply) ist konkretisiert mit Core0->Core1 Queuegrenzen und Parse-Luecke.
- Heartbeat/Server-Status Interlock ist fuer Sensor-Safety-Recovery als harter Einflussfaktor belegt.
