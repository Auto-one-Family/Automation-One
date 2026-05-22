# CORRELATION-MAP — INC-2026-04-09-docker-ist

**Status dieser Stichprobe:** In den gezogenen Log-Tails ist **keine abweichende Fehler-Korrelationskette** erkennbar (kein ERROR/FATAL, keine wiederholten Restarts in der Stichprobe).

## Erwarteter Soll-Datenpfad (Referenz)

Für den sichtbaren **MOCK**-Traffic in einer grünen Stichprobe:

1. **MQTT** — Topics unter `kaiser/god/esp/MOCK_BEAA9D/sensor/.../data` (Publish/Subscribe im Server-Log).
2. **Server** — `sensor_handler` → Verarbeitung, Speicherung (**Sensor data saved**).
3. **DB** — `INSERT sensor_data` / `UPDATE sensor_configs` (Postgres-Log, `data_source=mock`).

**Heartbeat** (`esp_id=ESP_EA5484`) erscheint im Server-Log separat vom MOCK-Sensorstrom; für diese Stichprobe keine Anomalie dokumentiert.

## Clustering-Hinweis (Skill)

Für echte Incidents gilt die Reihenfolge: Notification-IDs → HTTP `request_id` → `esp_id` + Zeitfenster → MQTT → Dedup/Titel zuletzst. Hier: **keine Incident-Kette** aus der Stichprobe ableitbar.
