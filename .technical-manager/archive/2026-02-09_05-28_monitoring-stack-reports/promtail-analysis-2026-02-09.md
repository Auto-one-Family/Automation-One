# Promtail-Analyse - AutomationOne Monitoring-Stack

**Datum:** 2026-02-09
**Agent:** system-control (Monitoring-Fokus)
**Auftrag:** TM Monitoring-Stack Auftrag 3 (Komplettanalyse)
**Status:** ABGESCHLOSSEN
**Live-Verifizierung:** 2026-02-09 ~04:37 UTC - Container healthy, 8 Docker-Targets entdeckt, alle Labels in Loki verifiziert

---

## 1. Docker-Integration - IST-Zustand

### Container-Konfiguration

| Eigenschaft | Wert | Quelle |
|---|---|---|
| **Container-Name** | `automationone-promtail` | docker-compose.yml:189 |
| **Image** | `grafana/promtail:3.4` (tatsaechlich 3.4.3 laut Logs) | docker-compose.yml:188 |
| **Port-Mapping** | **KEINES** (nur intern 9080 fuer Health/API) | docker-compose.yml |
| **Volume 1** | `./docker/promtail/config.yml:/etc/promtail/config.yml:ro` | Bind-Mount, read-only |
| **Volume 2** | `/var/run/docker.sock:/var/run/docker.sock:ro` | Bind-Mount, read-only |
| **Network** | `automationone-net` (bridge) | docker-compose.yml:204 |
| **Profile** | `monitoring` | docker-compose.yml:190 |
| **Restart-Policy** | `unless-stopped` | docker-compose.yml:205 |
| **Depends-On** | `loki` (service_healthy) | docker-compose.yml:196-198 |
| **Logging** | json-file, max-size 5m, max-file 3 | docker-compose.yml:206-210 |
| **Resource-Limits** | **KEINE definiert** | - |
| **Named Volume** | **KEINES** (kein persistentes Volume) | - |

### Healthcheck

| Parameter | Wert |
|-----------|------|
| Test | `bash -c 'echo > /dev/tcp/localhost/9080'` |
| Interval | 15s |
| Timeout | 5s |
| Retries | 5 |
| Start-Period | Nicht gesetzt |

**Bewertung:**
- Healthcheck prueft TCP-Verbindung auf Port 9080 (Promtail HTTP-Server)
- Funktioniert, aber prueft nicht ob Promtail tatsaechlich Logs verarbeitet
- Bessere Alternative: `wget --spider http://localhost:9080/ready`

### Bewertung Docker-Integration

- Docker-Socket ist read-only (`ro`) - sicherheitstechnisch korrekt
- Config ist read-only (`ro`) - korrekt
- Depends-on loki (service_healthy) - stellt sicher dass Loki bereit ist
- Kein Named Volume fuer Positions-Datei (Problem - siehe Section 5)
- Kein Start-Period im Healthcheck

---

## 2. Konfiguration - IST-Zustand

### Vollstaendige Config (`docker/promtail/config.yml`)

```yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
        filters:
          - name: label
            values: ["com.docker.compose.project=auto-one"]
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        regex: '/(.*)'
        target_label: 'container'
      - source_labels: ['__meta_docker_container_log_stream']
        target_label: 'stream'
      - source_labels: ['__meta_docker_container_label_com_docker_compose_service']
        target_label: 'service'
      - source_labels: ['__meta_docker_container_label_com_docker_compose_service']
        target_label: 'compose_service'
      - source_labels: ['__meta_docker_container_label_com_docker_compose_project']
        target_label: 'compose_project'
    pipeline_stages:
      - docker: {}
```

### Analyse der Konfiguration

| Aspekt | Wert | Bewertung |
|---|---|---|
| **Server-Port** | 9080 (HTTP), 0 (gRPC deaktiviert) | OK |
| **Positions-Datei** | `/tmp/positions.yaml` | PROBLEM - nicht persistent |
| **Loki-URL** | `http://loki:3100/loki/api/v1/push` | OK (internes Netzwerk) |
| **Service-Discovery** | Docker SD via Socket | OK |
| **Refresh-Interval** | 5s | OK (schnelle Container-Erkennung) |
| **Filter** | `com.docker.compose.project=auto-one` | OK (nur eigene Container) |
| **Pipeline** | Nur `docker: {}` | MINIMAL - kein Parsing |
| **Batching** | Nicht konfiguriert (Defaults) | AKZEPTABEL |
| **Retry** | Nicht konfiguriert (Defaults) | AKZEPTABEL |
| **Compression** | Nicht konfiguriert (Default: snappy) | OK |

---

## 3. Label-Konfiguration - IST-Zustand

### Explizit konfigurierte Labels (Relabel-Rules)

| # | Source | Target-Label | Werte-Beispiel |
|---|--------|--------------|----------------|
| 1 | `__meta_docker_container_name` | `container` | `automationone-server` |
| 2 | `__meta_docker_container_log_stream` | `stream` | `stdout`, `stderr` |
| 3 | `__meta_docker_compose_service` | `service` | `el-servador` |
| 4 | `__meta_docker_compose_service` | `compose_service` | `el-servador` |
| 5 | `__meta_docker_compose_project` | `compose_project` | `auto-one` |

### Automatisch hinzugefuegte Labels

| Label | Herkunft | Werte-Beispiel |
|---|---|---|
| `service_name` | Docker SD (automatisch) | `automationone-server`, `el-servador` |
| `detected_level` | Promtail 3.x Auto-Detection | `info`, `error`, `warn`, `unknown` |

### Label-Verifizierung in Loki (Live)

**Alle Labels in Loki vorhanden:**
```
compose_project, compose_service, container, service, service_name, stream, detected_level
```

**`service_name` Label-Werte (Live-Abfrage):**
```
automationone-frontend, automationone-grafana, automationone-loki, automationone-mqtt,
automationone-postgres, automationone-prometheus, automationone-promtail, automationone-server,
el-frontend, el-servador, grafana, loki, mqtt-broker, postgres, prometheus, promtail
```

**KRITISCHER BEFUND:** Das `service_name` Label enthaelt BEIDE Formate:
- Container-Namen: `automationone-server`
- Compose-Service-Namen: `el-servador`

Dies kommt daher, dass Docker SD das Label `service_name` automatisch setzt (nicht aus der Config). Es enthaelt sowohl den Compose-Service-Namen als auch den Container-Namen, was zu **doppelten Eintraegen** fuehrt.

### Label-Redundanz-Analyse

| Label | Einzigartig? | Redundant mit |
|---|---|---|
| `service` | Ja (Compose-Service-Name) | - |
| `compose_service` | Nein | Identisch mit `service` |
| `container` | Ja (Container-Name) | - |
| `service_name` | Nein | Mischung aus `service` + `container` |
| `compose_project` | Ja | - |
| `stream` | Ja (stdout/stderr) | - |
| `detected_level` | Ja (Log-Level) | - |

**Empfehlung:** `compose_service` ist identisch mit `service` und somit redundant. `service_name` ist ein Auto-Label und sollte nicht fuer Queries verwendet werden (ambig).

---

## 4. Erfasste Container - IST-Zustand

### Vollstaendige Container-Abdeckung (Live verifiziert)

| Container | compose_service | stream | detected_level | Log-Lines/h |
|---|---|---|---|---|
| automationone-server | el-servador | stdout+stderr | info, error, warn, unknown | **~43.425** |
| automationone-grafana | grafana | stdout | info, error, warn | ~1.401 |
| automationone-loki | loki | stderr | info, error, warn | ~473 |
| automationone-mqtt | mqtt-broker | stdout+stderr | error, unknown | ~334 |
| automationone-promtail | promtail | stderr | info, warn | ~32 |
| automationone-prometheus | prometheus | stderr | info | ~19 |
| automationone-postgres | postgres | stdout+stderr | unknown | ~10 |
| automationone-frontend | el-frontend | stdout | unknown | ~9 |

**Gesamt:** ~45.803 Log-Zeilen pro Stunde (~1.1 Mio/Tag)

### Analyse Log-Volumen

- **el-servador dominiert:** 95% aller Logs kommen vom Server (35.018 info + 3.208 warn + 2.604+2.467 unknown + 84+56 error + 88 info stderr)
- **detected_level=unknown:** Viele Logs werden nicht als Level erkannt → fehlende strukturierte Log-Formate
- **Healthcheck-Logs inklusive:** Prometheus scrapt alle 15s → erzeugt Info-Logs im Server → unnoetig hohe Log-Menge
- **Frontend fast leer:** Nur 9 Zeilen/h → Vite Dev-Server hat wenig stdout

### Promtail-Container Discovery (Logs)

```
level=info msg="Starting Promtail" version="(version=3.4.3, branch=release-3.4.x)"
level=info msg="added Docker target" containerID=218acbdd...  # x8 Container
```

Alle 8 Container innerhalb von 6 Sekunden nach Start entdeckt.

---

## 5. Performance - IST-Zustand

### Container-Ressourcen (Live)

| Metrik | Wert |
|--------|------|
| CPU | 0.44% |
| Memory | 40.27 MiB / 7.676 GiB (0.51%) |
| Net I/O | 60.4kB rx / 1.51MB tx |
| Block I/O | 606kB read / 467kB write |
| PIDs | 13 |

**Bewertung:** Sehr leichtgewichtig. Kein Performance-Problem.

### Batching (Default-Werte)

| Parameter | Default | Bewertung |
|-----------|---------|-----------|
| `batch_wait` | 1s | OK |
| `batch_size` | 1048576 (1MB) | OK fuer aktuelles Volumen |
| `min_backoff` | 500ms | OK |
| `max_backoff` | 5m | OK |
| `max_retries` | 10 | OK |

Defaults sind ausreichend fuer ~46k Lines/h.

---

## 6. Pipeline-Stages - IST-Zustand

### Aktuelle Pipeline

```yaml
pipeline_stages:
  - docker: {}
```

Die `docker: {}` Stage:
- Parst Docker JSON-Log-Format (timestamp, stream, log)
- Extrahiert den eigentlichen Log-Text aus dem Docker-Wrapper
- Setzt den Timestamp aus dem Docker-Log

### Was die Pipeline NICHT tut

| Feature | Status | Auswirkung |
|---|---|---|
| **JSON-Parsing** | Nicht konfiguriert | Server-Logs (JSON-Format) werden als Plain-Text gespeichert |
| **Multiline-Handling** | Nicht konfiguriert | Stack-Traces werden in einzelne Zeilen gesplittet |
| **Label-Extraction** | Nicht konfiguriert | Keine Labels aus Log-Inhalt (z.B. request_id, user_id) |
| **Timestamp-Parsing** | Nur Docker-Timestamp | Applikations-Timestamps ignoriert |
| **Filtering** | Nicht konfiguriert | Alle Logs werden an Loki gesendet (inkl. Healthchecks) |
| **Metrics-Extraction** | Nicht konfiguriert | Keine Prometheus-Metriken aus Logs |

### Automatisches Level-Detection (Promtail 3.x)

Promtail 3.x erkennt automatisch Log-Levels und setzt das `detected_level` Label:
- `info`: Erkannt in el-servador, grafana, loki, prometheus, promtail Logs
- `error`: Erkannt in el-servador, grafana, loki, mqtt-broker Logs
- `warn`: Erkannt in el-servador, grafana, loki, promtail Logs
- `unknown`: Nicht erkennbare Logs (mqtt-broker, postgres, el-frontend, teils el-servador)

---

## 7. Bekannte Probleme

### P1: Positions-Datei in /tmp (HOCH)

```yaml
positions:
  filename: /tmp/positions.yaml
```

**Problem:** `/tmp/` ist ephemeral im Container. Bei Container-Neustart:
- Positions-Datei geht verloren
- Promtail weiss nicht wo es aufgehoert hat
- Alle Container-Logs werden erneut gelesen und an Loki gesendet
- Fuehrt zu **duplizierten Log-Eintraegen** in Loki

**Loesung:** Named Volume oder Bind-Mount fuer Positions-Datei:
```yaml
volumes:
  - promtail-positions:/tmp    # Option A: Named Volume
  # oder
  - ./data/promtail:/positions  # Option B: Bind-Mount
```
Und in Config: `positions: { filename: /positions/positions.yaml }`

### P2: Keine Healthcheck-Filterung (MITTEL)

Prometheus scrapt el-servador alle 15s → Server loggt jeden Request → ~2.400 Healthcheck-Logs/h unnoetig.

**Loesung:** Pipeline-Stage zum Filtern:
```yaml
pipeline_stages:
  - docker: {}
  - drop:
      source: ""
      expression: ".*GET /api/v1/health/metrics.*"
```

### P3: Kein JSON-Parsing (MITTEL)

El Servador gibt strukturierte Logs aus (JSON oder semi-strukturiert), aber Promtail speichert sie als Plain-Text. Dadurch:
- Keine Label-Extraction aus Log-Feldern
- LogQL-Queries brauchen Regex statt Label-Filter
- Langsamere Queries

**Loesung:**
```yaml
pipeline_stages:
  - docker: {}
  - match:
      selector: '{compose_service="el-servador"}'
      stages:
        - json:
            expressions:
              level: level
              module: module
              request_id: request_id
        - labels:
            level:
            module:
```

### P4: Kein Multiline-Handling (NIEDRIG)

Python Stack-Traces werden in einzelne Zeilen gesplittet:
```
Traceback (most recent call last):
  File "/app/src/api/v1/health.py", line 100
    raise ValueError("...")
ValueError: ...
```

Jede Zeile wird als separater Log-Eintrag gespeichert statt als zusammenhaengender Block.

**Loesung:**
```yaml
pipeline_stages:
  - docker: {}
  - multiline:
      firstline: '^\d{4}-\d{2}-\d{2}|^\[|^{|^level='
      max_wait_time: 3s
```

### P5: Label-Redundanz (NIEDRIG)

`service` und `compose_service` sind identisch. `service_name` ist ambig (Container-Name + Service-Name gemischt). Erhoehter Loki-Index-Aufwand.

---

## 8. Dokumentation - IST-Zustand

| Dokument | Promtail erwaehnt? | Details |
|---|---|---|
| DOCKER_REFERENCE.md Section 5.2 | JA | Config-Pfad, Docker-Socket, Filter-Label |
| Dediziertes Promtail-Referenzdokument | **NEIN** | FEHLT |
| Label-Strategie dokumentiert | **NEIN** | FEHLT |
| Pipeline-Dokumentation | **NEIN** | FEHLT |
| Log-Volumen Analyse | **NEIN** | FEHLT |

---

## 9. SOLL-Analyse: Gap-Zusammenfassung

### Prioritaet HOCH

| # | Gap | Auswirkung | Empfehlung |
|---|---|---|---|
| H1 | **Positions-Datei in /tmp** | Log-Duplikate nach Container-Restart | Named Volume oder Bind-Mount |
| H2 | **Keine Healthcheck-Filterung** | ~2.400 unnoetige Logs/h, 57.600/Tag | Drop-Stage fuer Healthcheck-Requests |

### Prioritaet MITTEL

| # | Gap | Auswirkung | Empfehlung |
|---|---|---|---|
| M1 | **Kein JSON-Parsing** fuer Server-Logs | Langsamere Queries, keine Label-Extraction | JSON-Pipeline fuer el-servador |
| M2 | **Kein Multiline-Handling** | Stack-Traces fragmentiert | Multiline-Stage |
| M3 | **Kein Prometheus-Metrics-Export** aus Logs | Keine Log-basierten Metriken | metrics-Stage (optional) |
| M4 | **Kein File-Based Log Collection** | Bind-Mounted Logs nicht erfasst | Zusaetzliche scrape_configs |

### Prioritaet NIEDRIG

| # | Gap | Auswirkung | Empfehlung |
|---|---|---|---|
| N1 | Label-Redundanz (service = compose_service) | Minimal erhoehter Index-Aufwand | Eines der Labels entfernen |
| N2 | `service_name` ambig | Verwirrende Query-Ergebnisse | Explizite Relabel-Rule oder droppen |
| N3 | Healthcheck-Methode (TCP statt HTTP) | Prueft nicht Promtail-Readiness | `wget /ready` verwenden |
| N4 | Kein start_period im Healthcheck | Moegl. false-negative beim Start | `start_period: 10s` |
| N5 | Keine Resource-Limits | Unkontrolliertes Wachstum theoretisch moeglich | `deploy.resources.limits` |
| N6 | Keine Dedikierte Dokumentation | Keine Wissensbasis | Referenzdokument erstellen |

---

## 10. Best Practices Status

### Implementiert

| Best Practice | Status | Details |
|---|---|---|
| Docker SD statt statischer Config | OK | Automatische Container-Erkennung |
| Compose-Project-Filter | OK | Nur eigene Container (`auto-one`) |
| Docker-Socket read-only | OK | Sicherheitstechnisch korrekt |
| Depends-on Loki (healthy) | OK | Garantiert Loki-Verfuegbarkeit |
| Log-Rotation fuer eigene Logs | OK | json-file, 5m max |
| Automatisches Level-Detection | OK | Promtail 3.x Feature aktiv |
| Leichtgewichtige Ressourcen | OK | 40MB RAM, 0.44% CPU |

### Nicht implementiert

| Best Practice | Prioritaet | Begruendung |
|---|---|---|
| **Persistente Positions-Datei** | HOCH | Verhindert Log-Duplikate |
| **Log-Filterung** (Healthchecks) | HOCH | Reduziert unnoetige Daten |
| **Strukturiertes Log-Parsing** (JSON) | MITTEL | Bessere Query-Performance |
| **Multiline-Log-Handling** | MITTEL | Stack-Trace-Korrelation |
| **File-Based Log Collection** | NIEDRIG | Crash-sichere Log-Erfassung |
| **Tenant-ID** | NIEDRIG | Multi-Tenancy nicht benoetigt |
| **Rate-Limiting** | NIEDRIG | Kein Bedarf bei aktuellem Volumen |

---

## 11. File-Based Logs Evaluation

### Vorhandene Bind-Mounted Log-Verzeichnisse

| Host-Pfad | Container | Container-Pfad | Von Promtail erfasst? |
|---|---|---|---|
| `./logs/server/` | el-servador | `/app/logs` | **NEIN** |
| `./logs/mqtt/` | mqtt-broker | `/mosquitto/log` | **NEIN** |
| `./logs/postgres/` | postgres | `/var/log/postgresql` | **NEIN** |

### Analyse

Diese Log-Dateien werden vom Docker-Logging-Driver NICHT erfasst, da sie direkt in Dateien geschrieben werden (nicht nach stdout/stderr). Promtail sammelt aktuell nur stdout/stderr-Logs.

**Sollten sie gesammelt werden?**

| Pro | Contra |
|---|---|
| Logs bleiben bei Container-Crash erhalten | Doppelte Logs moeglich (stdout + file) |
| Detailliertere Logs (z.B. PostgreSQL Query-Log) | Erhoehte Komplexitaet |
| Audit-Trail unabhaengig von Docker | Zusaetzlicher Bind-Mount in Promtail noetig |

**Empfehlung:** JA, fuer PostgreSQL-Logs (Query-Performance, Slow-Queries). NEIN fuer Server/MQTT (bereits via stdout erfasst). Config:

```yaml
scrape_configs:
  - job_name: postgres-files
    static_configs:
      - targets: [localhost]
        labels:
          job: postgres-files
          __path__: /var/log/postgresql/*.log
    pipeline_stages:
      - multiline:
          firstline: '^\d{4}-\d{2}-\d{2}'
```

Mit Bind-Mount in docker-compose.yml:
```yaml
promtail:
  volumes:
    - ./logs/postgres:/var/log/postgresql:ro
```

---

## 12. Empfehlungen fuer TM

### Sofort umsetzbar (Quick Wins)

1. **Positions-Datei persistieren:** Named Volume fuer `/tmp/positions.yaml`
2. **Healthcheck verbessern:** `wget /ready` statt TCP-Check
3. **start_period hinzufuegen:** `start_period: 10s`

### Mittelfristig (Sprint-Items)

4. **Healthcheck-Logs filtern:** Drop-Stage fuer `/api/v1/health/metrics`
5. **JSON-Parsing fuer Server-Logs:** Label-Extraction (level, module, request_id)
6. **Multiline-Handling:** Stack-Traces zusammenfuehren
7. **Dokumentation:** Label-Strategie und Pipeline dokumentieren

### Langfristig (Roadmap)

8. **PostgreSQL File-Logs:** Slow-Query-Monitoring via Promtail
9. **Metrics-Extraction:** Log-basierte Prometheus-Metriken
10. **Label-Bereinigung:** Redundante Labels entfernen

---

## 13. Quellennachweise

| Datei/Quelle | Relevanz |
|---|---|
| `docker-compose.yml:187-210` | Promtail Service-Definition |
| `docker/promtail/config.yml` | Vollstaendige Promtail-Config (38 Zeilen) |
| `docker/loki/loki-config.yml` | Loki-Config (Retention, Schema) |
| `.claude/reference/infrastructure/DOCKER_REFERENCE.md` Section 5.2 | Promtail-Dokumentation |
| `curl localhost:3100/loki/api/v1/labels` | Live Label-Verifizierung |
| `curl localhost:3100/loki/api/v1/query` | Live Log-Volumen-Analyse |
| `docker logs automationone-promtail` | Container-Startlog (8 Targets) |
| `docker stats automationone-promtail` | Ressourcen-Verbrauch |

---

## 14. TM-Auftrag Erfuellungspruefung

| Erfolgskriterium | Status |
|---|---|
| Promtail ist konfiguriert wie (Config-Details) | ERFUELLT (Section 2) |
| Diese Container werden gescrapt (Liste) | ERFUELLT (Section 4 - alle 8 Container) |
| Diese Labels werden extrahiert (Liste) | ERFUELLT (Section 3 - 7 Labels verifiziert) |
| Pipeline-Stages: Details (Parsing, Transformation) | ERFUELLT (Section 6 - nur docker: {}) |
| Performance-Tuning: Status | ERFUELLT (Section 5 - Defaults ausreichend) |
| Best Practices implementiert (Liste) | ERFUELLT (Section 10) |
| Best Practices fehlen (Liste mit Begruendung) | ERFUELLT (Section 9+10) |
| File-Based Logs: Sollten sie gesammelt werden? | ERFUELLT (Section 11 - JA fuer PostgreSQL) |

---

*Bericht erstellt von system-control Agent. Alle Daten live verifiziert am 2026-02-09. Keine Code-Aenderungen vorgenommen.*
