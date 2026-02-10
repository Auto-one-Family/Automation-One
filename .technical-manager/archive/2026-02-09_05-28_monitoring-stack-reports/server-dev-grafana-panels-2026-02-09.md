# Grafana Dashboard-Panels Reparatur - Analyse-Report

**Agent:** server-dev
**Datum:** 2026-02-09
**Auftrag:** TM Auftrag 1 - Grafana Dashboard-Panels reparieren
**Ergebnis:** KEINE AENDERUNGEN NOETIG - Dashboard bereits korrekt konfiguriert

---

## Analyse-Findings

### Dashboard-JSON (`docker/grafana/provisioning/dashboards/system-health.json`)

- **6 Panels** (wie erwartet)
- **431 Zeilen** JSON
- **Datasources:** Prometheus (uid: `prometheus`), Loki (uid: `loki`)
- **UID:** `automationone-system-health`

### Panel-Status (IST-Zustand)

| Panel | ID | Query | Datasource | Erwartet (TM) | IST |
|-------|-----|-------|------------|----------------|-----|
| Server Health | 1 | `up{job="el-servador"}` | Prometheus | OK | OK |
| MQTT Broker | 2 | `god_kaiser_mqtt_connected` | Prometheus | `up{job="mqtt-broker"}` | **BEREITS GEFIXT** |
| Database | 3 | `sum(count_over_time({compose_service="postgres"}[1m]))` | Loki | `up{job="postgres"}` | **BEREITS GEFIXT** |
| Frontend | 4 | `sum(count_over_time({compose_service="el-frontend"}[1m]))` | Loki | `up{job="el-frontend"}` | **BEREITS GEFIXT** |
| Log Volume | 5 | Loki aggregation by service | Loki | OK | OK |
| Error Logs | 6 | Loki regex filter | Loki | OK | OK |

**Fazit:** Der TM-Auftrag beschreibt den broken Zustand (`up{job="mqtt-broker"}` etc.), aber die Datei enthaelt bereits die korrekten Queries. Die Panels wurden offenbar schon in einer frueheren Session repariert.

### Prometheus-Config (`docker/prometheus/prometheus.yml`)

- **2 Jobs:** `el-servador` (target: `el-servador:8000`), `prometheus` (target: `localhost:9090`)
- **Keine** Jobs fuer `mqtt-broker`, `postgres`, `el-frontend` (bestaetigt)
- Metrics-Path: `/api/v1/health/metrics`

### Server Metrics Endpoint (`El Servador/god_kaiser_server/src/api/v1/health.py`)

Exportiert folgende Prometheus-Metriken:
- `god_kaiser_uptime_seconds` (gauge)
- `god_kaiser_mqtt_connected` (gauge, 0/1) - **von Panel 2 verwendet**
- `god_kaiser_esp_total` (gauge)
- `god_kaiser_esp_online` (gauge)
- `god_kaiser_esp_offline` (gauge)
- `god_kaiser_cpu_percent` (gauge, falls psutil)
- `god_kaiser_memory_percent` (gauge, falls psutil)

### Datasources (`docker/grafana/provisioning/datasources/datasources.yml`)

- `Prometheus` - uid: `prometheus` - URL: `http://prometheus:9090` - **Matches**
- `Loki` - uid: `loki` - URL: `http://loki:3100` - **Matches**

### Promtail Config (`docker/promtail/config.yml`)

- Docker SD mit Filter: `com.docker.compose.project=auto-one`
- Relabeling: `__meta_docker_container_label_com_docker_compose_service` -> `compose_service`
- Pipeline: Droppt Health-Check-Logs von el-servador
- **Labels korrekt:** `compose_service="postgres"`, `compose_service="el-frontend"` werden gesetzt

### Docker Compose Service-Namen

- `postgres` (Z.19) - matcht Panel 3 Query
- `el-frontend` (Z.120) - matcht Panel 4 Query
- Alle Monitoring-Services hinter `profiles: ["monitoring"]`

## Loesung

**KEINE CODE-AENDERUNGEN NOETIG.**

Das Dashboard ist vollstaendig korrekt konfiguriert:
1. Panel 2 nutzt `god_kaiser_mqtt_connected` (Prometheus-Metrik vom Server)
2. Panel 3 nutzt Loki-Heartbeat fuer postgres
3. Panel 4 nutzt Loki-Heartbeat fuer el-frontend
4. Panels 3+4 haben korrekte Value-Mappings (range 1+ = UP/gruen, null+nan = DOWN/rot)
5. Datasource-UIDs stimmen ueberein
6. Service-Namen stimmen ueberein

## Wahrscheinliche Ursache fuer "No data"

Falls Panels trotzdem "No data" zeigten, war wahrscheinlich der **Monitoring-Stack nicht gestartet**:

```bash
# Monitoring-Stack starten (separates Compose-Profile)
docker compose --profile monitoring up -d

# Verifizieren
docker compose --profile monitoring ps
```

Alle Monitoring-Services (Loki, Promtail, Prometheus, Grafana) sind hinter dem `monitoring` Compose-Profile und starten NICHT mit dem Standard `docker compose up`.

## Implementierung

Keine Aenderungen durchgefuehrt - Dashboard war bereits korrekt.

## Verifikation

- [x] JSON-Syntax: Valid (kein Parsing-Error)
- [x] Datasource-UIDs: Konsistent mit datasources.yml
- [x] Service-Namen: Konsistent mit docker-compose.yml
- [x] Prometheus-Metriken: `god_kaiser_mqtt_connected` in health.py definiert
- [x] Promtail-Labels: `compose_service` korrekt relabelt
- [ ] Live-Test: Monitoring-Stack muesste gestartet werden

## Limitationen (bestehend, wie im TM-Auftrag beschrieben)

- Panel 3 (Database): Loki-Heartbeat zeigt nur "loggt" nicht "healthy"
  - Upgrade-Pfad: `postgres_exporter` fuer native DB-Metriken
- Panel 4 (Frontend): Loki-Heartbeat zeigt nur "loggt" nicht "healthy"
  - Upgrade-Pfad: Frontend-Metrics-Endpoint implementieren

## Naechste Schritte

1. **Monitoring-Stack starten** und alle 6 Panels live verifizieren
2. **Optional:** postgres_exporter fuer echte DB-Health-Metriken (Phase 4)
3. **Optional:** mosquitto_exporter fuer MQTT-Broker-Stats (Phase 4)
4. **Optional:** Frontend-Metrics-Endpoint (Phase 4)
