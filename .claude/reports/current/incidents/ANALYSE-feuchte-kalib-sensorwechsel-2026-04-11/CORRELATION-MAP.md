# CORRELATION-MAP — Feuchte / GPIO / Kalibrierung

**Reihenfolge (Skill):** correlation_id / request_id → HTTP → esp_id + Zeitfenster → MQTT → Dedup zuletzt.

## A. Sensor löschen (REST → DB → MQTT → WS)

| Schritt | Mechanismus | Evidence / Pfad |
|---------|-------------|-----------------|
| REST | `DELETE /api/v1/sensors/{esp_id}/{config_id}` | `src/api/v1/sensors.py` |
| Persistenz | `sensor_repo.delete`, Subzone nur wenn GPIO leer | gleiche Datei |
| MQTT | `esp_service.send_config(esp_id, combined_config)` nach Delete | gleiche Datei ~1240 |
| WS | `sensor_config_deleted` mit `config_id`, `esp_id`, `gpio`, `sensor_type` | gleiche Datei ~1255 |

**Korrelation im Betrieb:** UI-Aktion Zeitstempel T → Server-Log „Sensor deleted“ / „Config published“ → optional MQTT `config`/`config_response` (Topics siehe `.claude/reference/api/MQTT_TOPICS.md`).

## B. Feuchte-Datenstrom ohne `sensor_configs`

| Schritt | Mechanismus |
|---------|-------------|
| MQTT `…/sensor/{gpio}/data` | `sensor_handler` Lookup `get_by_esp_gpio_and_type` |
| Kein Treffer | WARNING + Speichern **ohne** Pi-Enhanced-Kalibrierpfad |
| DB | `sensor_data` kann wachsen **ohne** passende Config — historisch beabsichtigt bei Delete |

## C. Kalibrier-Wizard

| Schritt | Mechanismus |
|---------|-------------|
| Session | `/api/v1/calibration/sessions/*` (Integrationstests vorhanden) |
| Mess-Antwort | `sensor/{gpio}/response` → `CalibrationResponseHandler` |
| WS | Kalibrier-Events (u. a. `calibration_measurement_failed` bei fehlendem `raw`) |

## D. Querverweis Geräte

- **ESP_6B27C8:** Config-Feuchte GPIO **33**; stabile `processed_value` Stichprobe.
- **ESP_EA5484:** keine `moisture` in `sensor_configs`; Sessions/Telemetry weiter GPIO **32** (und Daten **33**) — **Korrelations-Bruch** zwischen „Session/Apply“ und „aktueller Config-Snapshot“.
