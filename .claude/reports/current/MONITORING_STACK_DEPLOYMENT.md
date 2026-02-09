# Monitoring Stack Deployment

**Datum:** 2026-02-09
**Branch:** `feature/docs-cleanup`

---

## Status

| Komponente | Status | Port | Details |
|------------|--------|------|---------|
| Loki | healthy | 3100 | Logs empfangen: ja (8 Container) |
| Promtail | healthy | 9080 (intern) | Docker Discovery: 8 Targets |
| Prometheus | healthy | 9090 | Targets: el-servador (up), self (up) |
| Grafana | healthy | 3000 | 2 Datasources, 1 Dashboard |

---

## Aenderungen durchgefuehrt

### docker-compose.yml
- 4 Monitoring-Service-Definitionen erstellt (loki, promtail, prometheus, grafana)
- 3 Named Volumes ergaenzt (automationone-loki-data, automationone-prometheus-data, automationone-grafana-data)
- Alle 4 Services mit `profiles: ["monitoring"]`
- Alle mit Healthchecks, restart-policy, logging, automationone-net

### docker/prometheus/prometheus.yml
- `metrics_path` korrigiert: `/metrics` -> `/api/v1/health/metrics`
- Verifiziert: Prometheus scrapt erfolgreich `http://el-servador:8000/api/v1/health/metrics`

### docker/promtail/config.yml
- Relabel-Configs korrigiert: `__meta_docker_compose_service` -> `__meta_docker_container_label_com_docker_compose_service`
- Relabel-Configs korrigiert: `__meta_docker_compose_project` -> `__meta_docker_container_label_com_docker_compose_project`
- Neue Labels ergaenzt: `compose_service`, `compose_project` (fuer Dashboard-Kompatibilitaet)

### docker/postgres/postgresql.conf
- `listen_addresses = '*'` ergaenzt (war `localhost` default durch custom config override, blockierte Cross-Container-Verbindungen)

### docker-compose.yml (Promtail Healthcheck)
- `wget` durch `bash /dev/tcp` ersetzt (wget nicht im grafana/promtail:3.4 Image)

### Makefile
- 4 Monitoring-Targets ergaenzt: `monitor-up`, `monitor-down`, `monitor-logs`, `monitor-status`
- `.PHONY` erweitert
- Help-Block mit Monitoring-Sektion ergaenzt

### .env.example
- Keine Aenderungen noetig (GRAFANA_ADMIN_PASSWORD und PGADMIN-Variablen waren bereits vorhanden)

---

## Integration

| Pipeline | Status | Test |
|----------|--------|------|
| Container -> Promtail -> Loki | OK | 8 Targets discovered, alle Labels korrekt |
| Server /metrics -> Prometheus | OK | Target health: up, scrapeUrl korrekt |
| Loki -> Grafana Datasource | OK | uid: loki, proxy via http://loki:3100 |
| Prometheus -> Grafana Datasource | OK | uid: prometheus, proxy via http://prometheus:9090 |
| Dashboard geladen | OK | "AutomationOne - System Health" im Folder "AutomationOne" |

---

## Loki-Labels (Referenz fuer Debug-Agenten)

Verfuegbare Labels: `compose_project`, `compose_service`, `container`, `service`, `service_name`, `stream`, `detected_level`

| Service | Label `service=` | Label `container=` | Beispiel-Query |
|---------|------------------|--------------------|----------------|
| Frontend | `el-frontend` | `automationone-frontend` | `{service="el-frontend"}` |
| Server | `el-servador` | `automationone-server` | `{service="el-servador"}` |
| MQTT Broker | `mqtt-broker` | `automationone-mqtt` | `{service="mqtt-broker"}` |
| PostgreSQL | `postgres` | `automationone-postgres` | `{service="postgres"}` |
| Loki | `loki` | `automationone-loki` | `{service="loki"}` |
| Promtail | `promtail` | `automationone-promtail` | `{service="promtail"}` |
| Prometheus | `prometheus` | `automationone-prometheus` | `{service="prometheus"}` |
| Grafana | `grafana` | `automationone-grafana` | `{service="grafana"}` |

**Hinweis:** `service` = Docker Compose Service-Name (bevorzugt fuer Queries).
`service_name` wird automatisch von Loki 3.x aus dem Container-Namen abgeleitet.
`compose_project` = `auto-one` (abgeleitet vom Verzeichnisnamen `Auto-one`).

---

## Zugriff

| Tool | URL | Credentials |
|------|-----|-------------|
| Grafana | http://localhost:3000 | admin / (GRAFANA_ADMIN_PASSWORD aus .env) |
| Prometheus | http://localhost:9090 | - |
| Loki API | http://localhost:3100 | - |
| Dashboard | http://localhost:3000/d/automationone-system-health | admin / (aus .env) |

---

## Image-Tags (final verwendet)

| Service | Image | Pull erfolgreich |
|---------|-------|-----------------|
| Loki | grafana/loki:3.4 | ja |
| Promtail | grafana/promtail:3.4 | ja |
| Prometheus | prom/prometheus:v3.2.1 | ja |
| Grafana | grafana/grafana:11.5.2 | ja |

---

## Agent-Korrekturen

Keine Korrekturen noetig. Die bestehenden Agent-Queries verwenden `{service="el-frontend"}` bzw. `{service="el-servador"}` und beide Labels funktionieren korrekt.

Betroffene Dateien (verifiziert, keine Aenderung noetig):
- `.claude/agents/frontend/frontend-debug-agent.md` - Loki-Queries korrekt
- `.claude/skills/frontend-debug/SKILL.md` - Label-Dokumentation korrekt

---

## Startbefehle

```bash
# Monitoring starten (startet Core mit, falls nicht laufend)
make monitor-up
# oder: docker compose --profile monitoring up -d

# Monitoring stoppen (Core bleibt laufen)
make monitor-down
# oder: docker compose --profile monitoring down

# Monitoring-Logs folgen
make monitor-logs

# Monitoring-Status
make monitor-status
```

---

## Zusaetzliche Fixes

### PostgreSQL listen_addresses (KRITISCH)
Die custom `postgresql.conf` ueberschrieb den Docker-Default `listen_addresses = '*'` mit dem PostgreSQL-Default `localhost`. Dies verhinderte jegliche Cross-Container-Verbindungen zum Datenbankserver. Fix: `listen_addresses = '*'` explizit in `docker/postgres/postgresql.conf` gesetzt.

### Promtail Healthcheck
Das `grafana/promtail:3.4` Image enthaelt kein `wget`. Healthcheck von `wget --spider` auf `bash /dev/tcp` umgestellt.

---

## Offene Punkte

1. **Server Build broken**: `poetry install` schlaegt fehl wegen `asyncpg ^0.29.0` Lock-File Inkompatibilitaet. Bestehendes Image (26h alt) funktioniert, aber Rebuild nicht moeglich ohne Lock-File Fix.
2. **Orphan Container**: `automationone-pgadmin` (devtools profile) laeuft als Orphan. Optional: `docker compose --profile monitoring --profile devtools up -d` oder mit `--remove-orphans` aufraeumen.
3. **MQTT Port 1883**: In docker-compose.yml wird Port 1883 NICHT auf den Host gemappt (nur 9001 WebSocket). Fuer lokale ESP32-Verbindungen muss ggf. `"1883:1883"` ergaenzt werden.
