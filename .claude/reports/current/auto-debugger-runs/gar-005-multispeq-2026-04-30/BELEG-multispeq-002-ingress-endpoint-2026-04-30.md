# BELEG — MultispeQ-002: Server Ingress-Endpoint

**run_id:** gar-005-multispeq-2026-04-30
**finding_id:** multispeq-002
**datum:** 2026-04-30
**kategorie:** tracing-gap (kein Upload-Pfad fuer externe Messgeraete)
**layer:** Server
**linear:** AUT-212

## Befund

Es existiert kein REST-Endpoint fuer den Import von Snapshot-Messungen externer Geraete. Der einzige Sensor-Ingest-Pfad ist MQTT (sensor_handler.py, paho-mqtt). PhotosynQ-JSON/CSV-Dateien haben keinen Einlass ins System.

## Kanonische Stelle

src/api/v1/ — neuer Router multispeq.py analog zu sensors.py. Kein neuer Pfad — bestehende Router-Struktur erweitern.

## Beleg: bestehende ON CONFLICT DO NOTHING Pattern

Memory C8 Hub: "sensor_data UNIQUE: uq_sensor_data_esp_gpio_type_timestamp. Insert via ON CONFLICT DO NOTHING."
Der Ingress-Endpoint nutzt exakt dieses Pattern fuer Dedup.
