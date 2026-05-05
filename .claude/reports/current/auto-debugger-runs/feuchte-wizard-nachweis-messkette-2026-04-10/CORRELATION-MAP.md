# CORRELATION-MAP — Wizard Live-Messung (Messkette)

**Zweck:** Pro Klick dieselbe `request_id` (bzw. äquivalente Korrelations-ID) über Schichten verfolgen.  
**Clustering-Reihenfolge (Konzept):** HTTP `request_id` → MQTT-Payload-IDs → `esp_id` + Zeitfenster → WS-Payload.

## Legende

| Spalte | Bedeutung |
|--------|-----------|
| Schritt | 1…n in der Kette |
| Quelle | Wo lesen |
| ID-Felder | Welche Keys |
| Repo-Verifikation | Fundstelle / Logger |

## Kette (Soll-Felder)

| Schritt | Quelle | ID-Felder | Repo-Verifikation |
|---------|--------|-----------|-------------------|
| 1 | REST `POST …/sensors/{esp_id}/{gpio}/measure` | Response-Body `request_id` | `sensor_service.trigger_measurement` → `publish_sensor_command`; Log: `Measurement triggered for {esp}/GPIO {gpio} (sensor_type: …, request_id: {uuid})` — `El Servador/god_kaiser_server/src/services/sensor_service.py` (ca. Zeilen 600–603) |
| 2 | MQTT command | Payload `request_id`, `intent_id`, `correlation_id` (Publisher) | `El Servador/god_kaiser_server/src/mqtt/publisher.py` — `publish_sensor_command` |
| 3 | MQTT `…/sensor/{gpio}/response` | `raw`/`raw_value`, `intent_id`, `correlation_id`, `request_id` | Handler: `calibration_response_handler.handle_sensor_response`; Topic-Pattern `kaiser/+/esp/{esp_id}/sensor/{gpio}/response` |
| 4 | WebSocket `calibration_measurement_received` oder `calibration_measurement_failed` | `data.request_id`, `data.intent_id`, `data.correlation_id`, Top-Level `message.correlation_id` | `CalibrationResponseHandler._broadcast_calibration_event`; Frontend: `useCalibrationWizard.ts` — `measurementCorrelationCandidates` |
| 5 | Optional DB | Tabelle **`sensor_data`** (Model `SensorData`) — letzte Zeilen pro `esp_id`/`gpio` | `El Servador/god_kaiser_server/src/db/models/sensor.py` (Modellname im Code: SensorData; Tabellenname üblicherweise `sensor_data`) |

## Operator-Checkliste (manuell)

Pro Klick eine Zeile ausfüllen:

| # | Klick-Zeit (lokal) | HTTP `request_id` | MQTT command `request_id` (Snippet) | MQTT response `request_id` + `raw` | WS Event + IDs | Befund |
|---|-------------------|-------------------|-------------------------------------|------------------------------------|----------------|--------|
| 1 | | | | | | |
| 2 | | | | | | |

## Abgrenzung Alerts

- **Persistierte ISA-/DB-Notifications** und **transiente WS-`error_event`** sind andere Ketten — hier nur Kalibrier-Mess-Events `calibration_measurement_*`.
