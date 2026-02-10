# Phase 2.2: postgres_exporter + Dashboard Panel-Fix

**Datum:** 2026-02-09
**Agent:** system-control
**Status:** COMPLETED

---

## Zusammenfassung

postgres_exporter v0.16.0 als Monitoring-Container hinzugefuegt.
Dashboard Panel 3 (Database) von Loki count_over_time auf Prometheus pg_up umgestellt.
Panel 4 (Frontend) ehrlich umbenannt zu "Frontend Log Activity".

## Root Cause (Panel 3 "DOWN")

Panel 3 nutzte `count_over_time({compose_service="postgres"}[1m])` via Loki.
PostgreSQL loggt im Normalbetrieb wenig → kein Count → null → "DOWN" angezeigt.
Das war kein echtes DB-Problem, sondern ein falsches Monitoring-Pattern (Log-Count != Health).

## Geaenderte Dateien

| Datei | Aenderung |
|-------|-----------|
| `docker-compose.yml` | +postgres-exporter Service (Profile: monitoring, Port 9187) |
| `docker/prometheus/prometheus.yml` | +Scrape-Job 'postgres' (postgres-exporter:9187) |
| `docker/grafana/provisioning/dashboards/system-health.json` | Panel 3: loki→prometheus, count_over_time→pg_up |
| `docker/grafana/provisioning/dashboards/system-health.json` | Panel 4: Titel "Frontend Status"→"Frontend Log Activity" |

## Neue Service-Architektur

| Service | Container | Port | Profil |
|---------|-----------|------|--------|
| postgres-exporter | automationone-postgres-exporter | 9187 | monitoring |

Prometheus Scrape-Jobs: 3 (el-servador, postgres, prometheus) – vorher 2.

## Verifikation

```
# postgres-exporter antwortet
curl -s http://localhost:9187/metrics | grep "pg_up"
Ergebnis: pg_up 1

# Prometheus 3 Targets alle UP
curl -s http://localhost:9090/api/v1/targets | grep -E '"job"|"health"'
Ergebnis: el-servador=up, postgres=up, prometheus=up

# Dashboard Panel 3 zeigt jetzt "UP" (via pg_up statt Loki count)
# Panel 4 zeigt "Frontend Log Activity" (ehrlich statt irreführend)
```

## Panel-Aenderungen im Detail

| Panel | Vorher | Nachher |
|-------|--------|---------|
| Panel 3 (Database) | Datasource: loki, Query: count_over_time, Bug: zeigt DOWN | Datasource: prometheus, Query: pg_up, korrekt: UP/DOWN |
| Panel 4 (Frontend) | Titel: "Frontend Status" (irrefuehrend) | Titel: "Frontend Log Activity" (ehrlich) |
