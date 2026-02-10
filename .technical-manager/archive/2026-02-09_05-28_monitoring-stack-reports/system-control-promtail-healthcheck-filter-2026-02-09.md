# Promtail Healthcheck-Log-Filterung

**Datum:** 2026-02-09
**Agent:** system-control
**Auftrag:** TM-Auftrag 4
**Status:** IMPLEMENTIERT - Verifikation ausstehend (Stack nicht gestartet)

---

## Analyse-Findings

- **Aktuelle Pipeline:** Nur `docker: {}` Stage (Zeile 36-37)
- **compose_service Label:** Bereits in relabel_configs konfiguriert (Zeile 32-33)
- **Grafana-Dashboards:** Nutzen bereits `compose_service` in LogQL-Queries (konsistent)
- **Healthcheck-Quellen:**
  - Prometheus scrapt `/api/v1/health/metrics` alle 15s (~240 Requests/h)
  - Docker Healthcheck ruft `/api/v1/health/live` alle 30s (~120 Requests/h)
  - Gesamt: ~360 Healthcheck-Requests/h
- **Weitere Endpoints:** `/api/v1/health/ready` existiert (selten aufgerufen)
- **Filter-Option gewaehlt:** Drop in Promtail (Option A) - TM-Empfehlung bestaetigt

## Implementierung

**Datei:** `docker/promtail/config.yml`

**Diff:**
```yaml
    pipeline_stages:
      - docker: {}
+     - match:
+         selector: '{compose_service="el-servador"}'
+         stages:
+           - drop:
+               source: ""
+               expression: ".*GET /api/v1/health/.* HTTP/.*"
```

**Stage-Reihenfolge:** `docker` -> `match` -> `drop` (korrekt)

**Regex-Pattern:** `.*GET /api/v1/health/.* HTTP/.*`
- Matcht: `GET /api/v1/health/metrics HTTP/1.1 200 OK`
- Matcht: `GET /api/v1/health/live HTTP/1.1 200 OK`
- Matcht: `GET /api/v1/health/ready HTTP/1.1 200 OK`
- Matcht NICHT: `POST /api/v1/devices HTTP/1.1 201`
- Matcht NICHT: `Server health check completed successfully`

**Service-Filter:** `compose_service="el-servador"` - nur Server-Logs betroffen

## Verifikation (nach Stack-Start)

| Schritt | Befehl | Erwartung |
|---------|--------|-----------|
| YAML-Syntax | `docker compose --profile monitoring config` | Kein Fehler |
| Container-Start | `docker compose --profile monitoring restart promtail` | Startet ohne Error |
| Container-Logs | `docker logs automationone-promtail --tail 50` | Keine Pipeline-Errors |
| Healthcheck-Count (5 Min) | Loki-Query: `{compose_service="el-servador"} \|~ "/api/v1/health/"` | 0 neue Eintraege |
| Normale Logs | Loki-Query: `{compose_service="el-servador"} \|~ "POST\|PUT\|DELETE"` | Weiterhin vorhanden |

**Status:** Config-Aenderung committed. Verifikation erfordert laufenden Monitoring-Stack.

## Metriken (geschaetzt)

- Eingesparte Logs: ~360/h (Prometheus 240 + Docker Healthcheck 120)
- Pro Tag: ~8.640 Logs weniger
- Loki-Storage: Reduziert (7-Tage-Retention)
- Query-Performance: Besseres Signal-Rausch-Verhaeltnis
