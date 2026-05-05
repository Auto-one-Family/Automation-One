# CORRELATION-MAP — INC-NVS-CONFIG-CONSISTENCY-2026-04-11

Clustering-Reihenfolge (Konzept 6.2): **Notification-Felder** → **HTTP request_id** → **esp_id + Zeitfenster** → **MQTT CID** → **Titel zuletzt**.

## A) Felder-Matrix (Querschnitt)

| Quelle | Primärkorrelat | Sekundär | Artefakt / Handler |
|--------|----------------|----------|---------------------|
| MQTT Config-Push | `correlation_id` im Payload (Server generiert) | `esp_id` (Topic) | `esp_service.send_config` → Topic `…/config` |
| MQTT `config_response` | `correlation_id` (ESP/Server je nach Builder) | `esp_id` | `config_handler.py` → WS `config_response` |
| WS `config_response` | `correlation_id` (Envelope oder `data`) | `esp_id` in `data` | `WebSocketManager.broadcast` → `send_json` |
| WS `sensor_config_deleted` | — | `esp_id` (string), `config_id` (string) | `sensors.py` `delete_sensor` |
| REST DELETE | `X-Request-ID` / ContextVar | Pfad `esp_id` + UUID `config_id` | `sensors.delete_sensor` |
| Telemetrie-Ingest | Topic-Pfad `esp_id` + Payload `gpio`/`sensor_type` | — | `sensor_handler.py` |

## B) MQTT-Pfade (Config-Kette, aus Code + Doku)

| Richtung | Topic-Muster | Handler / Publisher | QoS (siehe `MQTT_TOPICS.md`) |
|----------|--------------|---------------------|------------------------------|
| Server → ESP | `kaiser/{kaiser_id}/esp/{esp_id}/config` | `publish_config` | Doku: typisch 2 für Config-Befehle |
| ESP → Server | `kaiser/{kaiser_id}/esp/{esp_id}/config_response` | `config_handler` | 1 |
| ESP → Server | `…/sensor/...` (Sensordaten) | `sensor_handler` | 1 |

*Hinweis:* Exakte QoS- und Topic-Varianten mit `Read` auf `.claude/reference/api/MQTT_TOPICS.md` im Implementierungs-Run abgleichen — keine Abweichung ohne Doku-Gate.

## C) WS-Events (Config-relevant)

| Event | Auslöser (Server) | Frontend-Konsument |
|-------|-------------------|---------------------|
| `config_response` | MQTT `config_response` → Ack-Pipeline | `esp.ts` → `config.store.ts` `handleConfigResponse` |
| `config_published` | Nach erfolgreichem MQTT-Publish | `config.store.ts` `handleConfigPublished` |
| `config_failed` | Publish-Fehler | `config.store.ts` `handleConfigFailed` |
| `sensor_config_deleted` | Nach Sensor-DELETE + optional Config-Push | `esp.ts` `handleSensorConfigDeleted` |

## D) Hypothese ↔ Evidence (keine Vermischung ISA vs. transient)

| Hypothese (STEUER) | Evidence im Repo | Risiko wenn falsch |
|--------------------|------------------|-------------------|
| H1 Heartbeat-ACK spammt NVS (`setDeviceApproved`) | `main.cpp` ruft bei jedem `approved|online`-ACK `setDeviceApproved`; `setDeviceApproved` schreibt NVS unter Mutex | Mutex-Kontention mit `/config`-Pfad |
| H2 DELETE UUID JSON | `SensorConfigResponse.esp_id: uuid.UUID`; Response nach Delete | Middleware/Logging/Client edge case |
| H3 RAM vs. NVS divergiert | Config-Pfad kann `ERROR_NVS_WRITE_FAILED` melden, Messwerte laufen in RAM weiter | Operator sieht rot + „gesendet“ |

## Eingebrachte Erkenntnisse

- **2026-04-11:** `sensor_config_deleted`-Payload nutzt explizit `str(config_id)` und String-`esp_id` — WS-Pfad ist **nicht** der naheliegende UUID-`json.dumps`-Fehler; Verdacht liegt auf **HTTP-Response** oder **Nebenpfad** (Logging).
