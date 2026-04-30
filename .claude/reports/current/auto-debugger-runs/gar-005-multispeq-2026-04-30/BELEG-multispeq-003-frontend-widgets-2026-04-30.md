# BELEG — MultispeQ-003: Frontend Upload-Formular + Snapshot-Widgets

**run_id:** gar-005-multispeq-2026-04-30
**finding_id:** multispeq-003
**datum:** 2026-04-30
**kategorie:** tracing-gap (keine Frontend-Unterstuetzung fuer Snapshot-Daten)
**layer:** Frontend
**linear:** AUT-213

## Befund

Das Frontend kennt keine Snapshot-Daten-Semantik. Alle 10 Widget-Typen setzen kontinuierliche Sensor-Streams voraus (WebSocket, Echtzeit). Ein Upload-Formular existiert nicht. Snapshot-Kennzeichnung (sensor_kind='snapshot') ist nicht implementiert.

## Kanonische Stelle

- Upload-Formular: neues UploadView oder Modal in HardwareView (148 bestehende Komponenten)
- Snapshot-Kennzeichnung: sensor-card Widget + historical Widget (beide in components/monitor/ oder components/dashboard/)
- WidgetConfigPanel: bestehende Komponente in HardwareView

## Beleg: bestehende Widget-Architektur

Memory: "10 Widget-Typen (line-chart, gauge, sensor-card, actuator-card, historical, multi-sensor, esp-health, alarm-list, actuator-runtime, statistics)."
Memory: "sensorId-Format: Alle 6 Widgets nutzen 3-teilige IDs espId:gpio:sensorType."
Fuer virtuelle MultispeQ-Sensoren: espId = "multispeq-{serial}", gpio = "200", sensorType = "phi2" etc.
