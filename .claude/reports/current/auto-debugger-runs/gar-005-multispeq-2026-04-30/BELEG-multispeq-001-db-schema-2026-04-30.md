# BELEG — MultispeQ-001: DB-Schema-Erweiterung sensor_configs + esp_devices

**run_id:** gar-005-multispeq-2026-04-30
**finding_id:** multispeq-001
**datum:** 2026-04-30
**kategorie:** tracing-gap (neue Datenquelle ohne Tracing-Pfad im System)
**layer:** Server/DB

---

## Befund

Das bestehende AutomationOne-Datenbankschema kennt nur kontinuierliche Hardware-Sensoren (interface_type IN ('analog', 'digital', 'i2c', 'onewire', 'VIRTUAL')). Fuer snapshot-basierte manuelle Messgeraete (MultispeQ 2.0) fehlen zwei Erweiterungen:

1. `sensor_configs`-Tabelle hat kein `sensor_kind`-Feld — System kann nicht unterscheiden zwischen kontinuierlichem Sensor (SHT31, 60s) und Snapshot-Sensor (MultispeQ, 1x/Woche)
2. `esp_devices.status`-Enum kennt nur 'online', 'offline', 'pending', 'approved', 'rejected' — kein 'virtual'-Status fuer Geraete ohne Heartbeat/MQTT

## Auswirkung

- Heartbeat-Mismatch-Logik (esp_count == 0 AND db_count > 0) wuerde False-Positive-Alerts fuer virtuelle Geraete ausloesen
- Frontend kann nicht unterscheiden ob "Live-Wert" oder "Letzte Messung vom {datum}" angezeigt werden soll
- P4-Guard wuerde MultispeQ-Sensortypen (phi2, ppfd, etc.) faelschlich als kalibrierungspflichtig flaggen

## Beleg-Quellen (AutomationOne-Architektur)

- Memory C8 Hub: "sensor_configs UNIQUE: (esp_id, gpio, sensor_type, onewire_address, i2c_address)"
- Memory C8 Hub: "actuator_states: Gueltige States sind on/off/pwm/unknown/error/emergency_stop" — analog braucht esp_devices einen 'virtual'-State
- Memory: "SAFETY-P4: CALIBRATION_REQUIRED_SENSOR_TYPES={'ph','ec','moisture','soil_moisture'}"
- Recherche F1 gar-005: MultispeQ ist Snapshot-Messgeraet — kein MQTT, kein ESP32, kein Heartbeat
- Datenmodell gar-005 §2: sensor_kind-Spalte-Empfehlung mit SQL-Migration

## Kanonische Stelle

`sensor_configs`-Tabelle (DB-Migration via Alembic) — bestehende Stelle erweitern, nicht neue Tabelle anlegen.
