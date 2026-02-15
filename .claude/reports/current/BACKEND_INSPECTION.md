# Backend Inspection Report

**Datum:** 2026-02-15T12:43 UTC
**Systemstatus:** critical (debug-status.ps1: server live=false von Host, Loki/Prometheus/Grafana error)
**ESP-Geraete im Einsatz:** ESP_472204 (geflasht), MOCK_E1BD1447 (Simulation aktiv)

---

## Systemstatus-Zusammenfassung

| Service | Status | Bemerkung |
|---------|--------|-----------|
| docker | ok | 12 Container running |
| server | error | /health/live unreachable vom Host (Container antwortet intern) |
| postgres | ok | 16 connections, 38 MB |
| mqtt | ok | Port 1883 open |
| frontend | ok | Port open |
| loki | error | not ready |
| prometheus | error | not ready |
| grafana | error | not ready |

**Server-Logs:** Container laeuft, health/live 200 von localhost. SimulationScheduler aktiv (MOCK_E1BD1447).

---

## Fehler / Bugs / Warnungen

| # | Level | Quelle | Beschreibung | Kontext | Timestamp |
|---|-------|--------|--------------|---------|-----------|
| 1 | WARNING | SimulationScheduler | [MOCK_E1BD1447] Sensor 21_sht31_temp not in config | Mock-Sensor nicht in DB-Config | 11:41-11:43 |
| 2 | WARNING | SimulationScheduler | [MOCK_E1BD1447] Sensor 5_pH not in config | Mock-Sensor nicht in DB-Config | 11:41-11:43 |
| 3 | WARNING | SimulationScheduler | [MOCK_E1BD1447] Sensor 4_DS18B20 not in config | Mock-Sensor nicht in DB-Config | 11:41-11:43 |
| 4 | INFO | MaintenanceService | health_check_esps: 0 checked, 0 online | Keine echten ESPs in approved-Liste | 11:42:36 |
| 5 | INFO | sensor_health | No enabled sensors found | DB nach Cleanup leer (sensor_configs=0) | 11:42:36 |

---

## Cross-Layer-Befunde

| # | Zeitpunkt | Layer A | Layer B | Korrelation | Root Cause |
|---|-----------|---------|---------|-------------|------------|
| 1 | 11:42 | DB esp_devices | Server SimulationScheduler | MOCK_E1BD1447 pending_approval, Heartbeat laeuft | Mock-ESP aktiv, echte ESPs (ESP_472204) noch nicht verbunden |
| 2 | 11:43 | MQTT Broker | DB | MQTT zeigt ESP_00000001 (LWT, zone_ack), DB zeigt nur MOCK | Alte/gecachte MQTT-Nachrichten oder anderer Client |
| 3 | 11:42 | DB sensor_configs=0 | SimulationScheduler | "Sensor not in config" | Nach DB-Cleanup keine Sensor-Configs – erwartet |

---

## ESP-Device-Status

| device_id | status | last_seen | age_seconds |
|-----------|--------|-----------|-------------|
| MOCK_E1BD1447 | pending_approval | 2026-02-15 11:42:37 | ~27 |

**ESP_472204:** Nicht in DB. Nach Flash neu – muss sich per Heartbeat Auto-Discovery registrieren. MQTT-Verbindung vom ESP zum Broker muss bestehen (gleicher Host/Port wie Server).

---

## Sensor-Data-Freshness

| esp_id | count | latest |
|--------|-------|--------|
| (leer) | 0 | - |

Nach DB-Cleanup keine sensor_data. Erwartet bis ESP_472204 verbunden und Sensoren konfiguriert.

---

## Heartbeat-Freshness

| device_id | count | latest |
|-----------+-------+--------|
| (0 rows) | 0 | - |

esp_heartbeat_logs: 0 Eintraege in letzten 10 Min. MOCK Heartbeats gehen ueber SimulationScheduler (nicht esp_heartbeat_logs? Schema-Check: Tabelle nutzt device_id als String).

---

## MQTT-Broker

- Nur healthcheck-Connections (localhost). Keine ESP-Clients sichtbar in letzten 20 Log-Zeilen.
- mosquitto_sub kaiser/#: ESP_00000001 (will, zone_ack, config_response) – vermutlich alte/cached Messages.

---

## Empfehlungen

1. **ESP_472204 verbinden:** WiFi/MQTT-Broker-Host des ESP muessen mit Docker-Netz (mqtt-broker:1883 / Host-IP:1883) erreichbar sein.
2. **Pending Devices approven:** MOCK_E1BD1447 oder echte ESPs im Dashboard approven, damit health_check_esps sie prueft.
3. **Sensor-Configs anlegen:** Nach ESP-Approval Sensoren (SHT31 auf GPIO 21) ueber API/Frontend konfigurieren.
4. **Loki/Prometheus:** Optional Monitoring-Stack starten fuer tiefere Log-Analyse.

---

*Report gemäß backend-inspector Agent. Fallback: docker compose logs (Loki not ready).*
