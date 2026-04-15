# MQTT / REST / WS → PostgreSQL (Kernpfad)

> Jede Zeile mit **Evidence** im Repo. Topic-Pattern aus `TopicBuilder` / `topics.py`; DB-Spalten aus Modellen/Repos.

| # | Quelle (Topic / Route / Event) | Schlüssel / Payload-Felder | Tabelle.Spalte(n) | Evidence (Modul) |
|---|-------------------------------|----------------------------|-------------------|-------------------|
| 1 | `kaiser/{kaiser}/esp/{esp_id}/sensor/{gpio}/data` | Topic: `esp_id` (String), `gpio` | `sensor_data.esp_id` (UUID via Lookup), `sensor_data.gpio` | `topics.py` `build_sensor_data_topic` / `parse_sensor_data_topic`; `sensor_handler.py` |
| 2 | idem | Payload: `sensor_type` (bzw. abgeleiteter Typ) | `sensor_data.sensor_type` | `sensor_handler.py` (Verarbeitung vor `save_data`) |
| 3 | idem | Payload: `ts` oder `timestamp` (ms/s) | `sensor_data.timestamp` (UTC TIMESTAMPTZ) | `sensor_handler.py` (Zeitlogik vor `save_data`) |
| 4 | idem | numerische Roh-/Anzeigewerte | `sensor_data.raw_value`, `sensor_data.processed_value`, `sensor_data.unit` | `sensor_repo.save_data` |
| 5 | idem | Qualität / Verarbeitung | `sensor_data.quality`, `sensor_data.processing_mode` | `sensor_handler.py` → `save_data` |
| 6 | idem | Metadaten (raw_mode, i2c/onewire) | `sensor_data.sensor_metadata` (JSON) | `sensor_handler.py` baut `sensor_metadata` dict |
| 7 | idem | Messkontext Zone/Subzone | `sensor_data.zone_id`, `sensor_data.subzone_id` | `sensor_handler.py` `resolve_zone_subzone_for_sensor` → `save_data` |
| 8 | idem | Gerätename Snapshot | `sensor_data.device_name` | `save_data(..., device_name=esp_device.name)` |
| 9 | idem | Dedup / MQTT QoS 1 | UNIQUE `uq_sensor_data_esp_gpio_type_timestamp` + `ON CONFLICT DO NOTHING` | `El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py` (`save_data`, `constraint="uq_sensor_data_esp_gpio_type_timestamp"`); Migration `alembic/versions/add_sensor_data_dedup_constraint.py`; Modell `SensorData.__table_args__` in `src/db/models/sensor.py` |
|10 | `kaiser/{kaiser}/esp/{esp_id}/sensor/batch` | Batch-Array von Messungen | mehrere `sensor_data`-Zeilen (gleiche Spaltenlogik) | `topics.py` `build_sensor_batch_topic`; Batch-Pfad in `sensor_handler.py` |
|11 | `kaiser/{kaiser}/esp/{esp_id}/actuator/{gpio}/status` | Topic `esp_id`, `gpio` | `actuator_states.esp_id`, `actuator_states.gpio`, `actuator_states.state`, … | `topics.py` `build_actuator_status_topic`; `actuator_handler.py` → `actuator_repo.update_state` |
|12 | `kaiser/{kaiser}/esp/{esp_id}/system/heartbeat` | Heartbeat-Payload | `esp_heartbeat_logs` (+ `esp_devices.last_seen` Aktualisierung) | `topics.py` `build_heartbeat_topic`; `src/mqtt/handlers/heartbeat_handler.py` |
|13 | REST `GET …/sensor-data` / Query-Endpoints | Query-Parameter Filter | `sensor_data` SELECTs | `src/api/v1/sensors.py` `query_sensor_data` u. a. |
|14 | WebSocket Event `sensor_data` | Broadcast nutzt **`device_id` String**, nicht UUID | Frontend: `esp_store` Indexierung nach `device_id` | `mqtt/websocket_utils.py` (Kommentar + `get_device_id_for_broadcast`); `websocket/manager.py` |

|16| `kaiser/{kaiser}/esp/{esp_id}/zone/ack` | Payload `zone_id`, `status`, `correlation_id` | `esp_devices.zone_id` (nach erfolgreichem ACK-Pfad), Validierung gegen `zones` | `src/mqtt/handlers/zone_ack_handler.py` (`ESPRepository`, `ZoneRepository`) |
|17| `kaiser/{kaiser}/esp/{esp_id}/subzone/ack` | `subzone_id`, `status` (z. B. subzone_assigned) | `subzone_configs` via `SubzoneService.handle_subzone_ack` | `src/mqtt/handlers/subzone_ack_handler.py` |

**Subzonen-Kontext (kein MQTT-Topic, aber DB-Konsistenz):**

| # | Quelle | Schlüssel | Tabelle | Evidence |
|---|--------|------------|---------|----------|
|15 | Subzone-Zuordnung | `assigned_gpios` JSON-Liste, `esp_id` = **`esp_devices.device_id`** | `subzone_configs.assigned_gpios`, `subzone_configs.esp_id` | `src/db/models/subzone.py` FK auf `esp_devices.device_id` |

**Firmware-Abgleich (Checkliste only, kein C++ in diesem Agenten):**

- NVS / Serienlog: `device_id`, GPIO, `sensor_type` müssen mit `sensor_configs` / `sensor_data` und `subzone_configs` ohne Widerspruch sein → Befund als „Serie vs. DB“-Tabelle im Report formulieren.

**Hinweis (Doku-Drift):** In `ActuatorState`-Klassen-Docstring (`actuator.py`) stehen veraltete Zustandsbegriffe; kanonisch sind Spalten-Doc + `ActuatorRepository` (`on` / `off` / `pwm` / `unknown` / `error` / `emergency_stop`).
