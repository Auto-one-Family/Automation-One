# Loki-Analyse – Vollständiger IST/SOLL-Bericht

**Datum:** 2026-02-09
**Agent:** system-control (Monitoring-Fokus) + Explore (Frontend-Analyse)
**Auftrag:** TM Monitoring-Stack Auftrag 2 – Komplettanalyse
**Status:** ABGESCHLOSSEN

---

## 1. Docker-Integration – IST-Zustand

| Eigenschaft | Wert | Quelle |
|---|---|---|
| Container-Name | `automationone-loki` | docker-compose.yml:162 |
| Image | `grafana/loki:3.4` | docker-compose.yml:161 |
| Port-Mapping | `3100:3100` | docker-compose.yml:164-165 |
| Healthcheck | `wget --spider http://localhost:3100/ready` | docker-compose.yml:171 |
| HC-Interval | 15s | docker-compose.yml:172 |
| HC-Timeout | 5s | docker-compose.yml:173 |
| HC-Retries | 5 | docker-compose.yml:174 |
| Volume | `automationone-loki-data:/loki` (Named) | docker-compose.yml:167-168 |
| Config-Mount | `./docker/loki/loki-config.yml:/etc/loki/local-config.yaml:ro` | docker-compose.yml:167 |
| Network | `automationone-net` (bridge) | docker-compose.yml:176 |
| Profile | `monitoring` | docker-compose.yml:163 |
| Restart-Policy | `unless-stopped` | docker-compose.yml:177 |
| Depends-On | **KEINE** (unabhängig) | - |
| Logging | json-file, max-size 5m, max-file 3 | docker-compose.yml:178-182 |
| Resource-Limits | **KEINE definiert** in docker-compose.yml | - |
| Command | `-config.file=/etc/loki/local-config.yaml` | docker-compose.yml:169 |

### Bewertung Docker-Integration

- ✅ Healthcheck korrekt (/ready Endpoint)
- ✅ Named Volume für Persistenz
- ✅ Config read-only gemountet
- ✅ Profile-Separation (monitoring)
- ✅ Logging-Limits gesetzt
- ⚠️ **Kein start_period** – könnte beim ersten Start Fehl-Alarme geben
- ❌ **Keine Resource-Limits** (DOCKER_AKTUELL.md empfiehlt 512M limit, 256M reserved – nicht implementiert)
- ⚠️ **Keine Depends-On** – Loki startet unabhängig, was OK ist (Promtail wartet auf Loki)

---

## 2. Konfiguration – IST-Zustand

**Config-Datei:** `docker/loki/loki-config.yml`

```yaml
auth_enabled: false

server:
  http_listen_port: 3100

common:
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

limits_config:
  retention_period: 168h  # 7 Tage

compactor:
  working_directory: /loki/compactor
  retention_enabled: true
  delete_request_store: filesystem
```

### Analyse

| Aspekt | Status | Detail |
|---|---|---|
| Auth | ❌ Deaktiviert | `auth_enabled: false` – kein Multi-Tenancy |
| Port | ✅ 3100 | Standard |
| Storage | ✅ Filesystem | Chunks + Rules unter `/loki/` |
| Schema | ✅ v13 + TSDB | Aktuelles Schema seit 2024-01-01 |
| Index | ✅ 24h Period | Standard-Rotation |
| Retention | ✅ 168h (7 Tage) | Compactor enabled |
| Compactor | ✅ Aktiviert | `retention_enabled: true` |
| Replication | ✅ Factor 1 | Single-Instance (korrekt für Dev) |
| KVStore | ✅ inmemory | Korrekt für Single-Instance |
| Ingestion Limits | ❌ **Nicht konfiguriert** | Keine max_line_size, rate_limits |
| Query Limits | ❌ **Nicht konfiguriert** | Keine max_query_length, max_query_time |
| Ruler | ❌ Nicht konfiguriert | Keine Log-basierten Alert-Rules |

### Fehlende Config-Optionen

| Option | Empfehlung | Priorität |
|---|---|---|
| `limits_config.max_line_size` | `256KB` default – explizit setzen | NIEDRIG |
| `limits_config.ingestion_rate_mb` | Schutz vor Log-Floods | MITTEL |
| `limits_config.ingestion_burst_size_mb` | Burst-Schutz | MITTEL |
| `limits_config.max_query_length` | Query-Timeouts verhindern | NIEDRIG |
| `ruler` config | Log-basierte Alerts ermöglichen | MITTEL |

---

## 3. Label-Strategie – IST-Zustand (KRITISCH)

### Tatsächliche Labels (aus Promtail-Config)

Die Promtail-Config (`docker/promtail/config.yml`) setzt folgende Labels:

| Label | Quelle | Beispielwert |
|---|---|---|
| `container` | `__meta_docker_container_name` (regex `/(.*)`) | `automationone-server` |
| `stream` | `__meta_docker_container_log_stream` | `stdout`, `stderr` |
| `service` | `__meta_docker_container_label_com_docker_compose_service` | `el-servador` |
| `compose_service` | (identisch zu service) | `el-servador` |
| `compose_project` | `__meta_docker_container_label_com_docker_compose_project` | `auto-one` |

### KRITISCHER BEFUND: `service_name` existiert NICHT

| Dokument | Behauptung | Tatsächlich |
|---|---|---|
| TM-Auftragsdokument | "KRITISCH: AutomationOne nutzt `service_name` (NICHT `service`)" | **FALSCH** – Label heißt `service` |
| LOG_ACCESS_REFERENCE.md | "Labels: `service_name` oder `container`" | **INKONSISTENT** – `service_name` gibt es nicht |
| SYSTEM_OPERATIONS_REFERENCE.md | `query={service="el-servador"}` | **KORREKT** – nutzt `service` |
| Grafana Dashboard | `{compose_project="auto-one"}`, `compose_service` | **KORREKT** – nutzt `compose_project/compose_service` |

### Label-Duplikation

`service` und `compose_service` enthalten identische Werte (beide von `com.docker.compose.service`). Das ist eine unnötige Duplikation, verschwendet aber nur minimal Storage.

---

## 4. Integration mit Promtail – IST-Zustand

| Aspekt | Status | Detail |
|---|---|---|
| Push-URL | ✅ `http://loki:3100/loki/api/v1/push` | promtail/config.yml:14 |
| Service-Discovery | ✅ Docker Socket | `/var/run/docker.sock:ro` |
| Filter | ✅ Compose-Project | `com.docker.compose.project=auto-one` |
| Refresh-Interval | ✅ 5s | Neue Container werden schnell entdeckt |
| Pipeline | ⚠️ Minimal | Nur `- docker: {}` (Docker-Log-Format-Parsing) |
| Batching | ❌ Nicht konfiguriert | Default-Werte von Promtail |
| Retry | ❌ Nicht konfiguriert | Default-Werte |

### Welche Container werden erfasst?

Promtail filtert nach `com.docker.compose.project=auto-one`. Das erfasst:

| Container | Erfasst? | Anmerkung |
|---|---|---|
| automationone-server (el-servador) | ✅ Ja | Core |
| automationone-postgres | ✅ Ja | Core |
| automationone-mqtt (mqtt-broker) | ✅ Ja | Core |
| automationone-frontend (el-frontend) | ✅ Ja | Core |
| automationone-loki | ✅ Ja | Monitoring |
| automationone-promtail | ✅ Ja | Monitoring (eigene Logs) |
| automationone-prometheus | ✅ Ja | Monitoring |
| automationone-grafana | ✅ Ja | Monitoring |
| automationone-pgadmin | ✅ Ja (wenn aktiv) | DevTools-Profil |

### Pipeline-Lücken

| Gap | Auswirkung | Priorität |
|---|---|---|
| **Kein JSON-Parsing** | Server-Logs (JSON-Format) werden als Raw-String gespeichert, nicht nach Fields aufgelöst | HOCH |
| **Kein Multiline-Handling** | Python-Stacktraces werden als einzelne Zeilen aufgeteilt | MITTEL |
| **Kein Log-Level-Extraction** | Kein `level` Label aus JSON-Logs | HOCH |
| **Kein Healthcheck-Filtering** | Healthcheck-Logs fluten Loki (alle 15-30s pro Service) | MITTEL |

---

## 5. Funktionalität – IST-Zustand

### API-Endpoints

| Endpoint | Zweck | Status |
|---|---|---|
| `GET /ready` | Healthcheck | ✅ Genutzt (Docker HC) |
| `POST /loki/api/v1/push` | Log-Ingestion | ✅ Genutzt (Promtail) |
| `GET /loki/api/v1/query_range` | Range-Queries | ✅ Dokumentiert in SYSTEM_OPERATIONS_REFERENCE |
| `GET /loki/api/v1/labels` | Label-Übersicht | ✅ Dokumentiert |
| `GET /loki/api/v1/label/{name}/values` | Label-Werte | ✅ Dokumentiert |

### Bekannte Loki-Queries (aus Referenz-Dokumentation)

```bash
# Service-Logs (SYSTEM_OPERATIONS_REFERENCE.md:1470)
curl -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={service="el-servador"}' \
  --data-urlencode 'limit=50'

# Verfügbare Labels
curl -s http://localhost:3100/loki/api/v1/labels

# Verfügbare Services
curl -s "http://localhost:3100/loki/api/v1/label/service/values"
```

### Session-Script Integration

Laut LOG_ACCESS_REFERENCE.md erstellt `start_session.sh` bei aktivem Monitoring-Profil Loki-Exports:

| Export-Datei | Inhalt |
|---|---|
| `logs/current/server_loki_errors.log` | Server-Error-Logs aus Loki |
| `logs/current/mqtt_broker_loki.log` | MQTT-Broker-Logs aus Loki |
| `logs/current/frontend_loki.log` | Frontend-Logs aus Loki |

---

## 6. Frontend-Integration – IST-Zustand (KRITISCHER BEFUND)

### TM-Annahme vs. Realität

| TM-Behauptung | Tatsächlicher Befund |
|---|---|
| "60+ Frontend-Queries nutzen `service_name`" | **0 (NULL) Loki-Queries im Frontend** |
| "Wo sind diese Queries definiert?" | **NIRGENDS** – Frontend hat keine Loki-Integration |
| "In Vue-Components? In Pinia-Stores?" | **NEIN** – Kein LogQL, kein Loki-SDK |

### Tatsächliche Frontend-Logging-Architektur

```
┌────────────────────────────────────────────────┐
│ El Frontend (Vue 3)                            │
├────────────────────────────────────────────────┤
│                                                │
│  1. Console Logging (Browser DevTools only)    │
│     ├─ 68+ console.* Calls in 34 Dateien      │
│     ├─ console.debug: ~18 Calls (API, Stores) │
│     ├─ console.error: ~16 Calls               │
│     ├─ console.log:   ~15 Calls               │
│     ├─ console.warn:  ~9 Calls                │
│     └─ console.info:  ~4 Calls                │
│     → KEIN zentraler Logger                    │
│     → KEIN strukturiertes Format               │
│     → KEIN Push an Loki                        │
│                                                │
│  2. Server-Log Viewer (REST API, kein Loki)    │
│     ├─ logsApi.queryLogs()  → /api/v1/debug/  │
│     ├─ logsApi.listFiles()  → /api/v1/debug/  │
│     ├─ logsApi.cleanup()    → /api/v1/debug/  │
│     └─ logSummaryGenerator + Translator (DE)   │
│     → Liest JSON-Dateien vom Server            │
│     → NICHT Loki-basiert                       │
│                                                │
└────────────────────────────────────────────────┘
         ↕ (REST API)          ↕ (KEIN Loki)
┌────────────────────┐  ┌──────────────────────┐
│ El Servador        │  │ Loki (indirekt)      │
│ /api/v1/debug/logs │  │ Nur via Promtail     │
│ (File-basiert)     │  │ Container stdout/err │
└────────────────────┘  └──────────────────────┘
```

### Konsequenz

Die Behauptung "60+ Frontend-Queries nutzen `service_name`" stammt vermutlich aus einem früheren Planungsdokument (Onboarding/Roadmap) und wurde **nie implementiert**. Das Frontend hat **KEINE direkte Verbindung zu Loki**.

---

## 7. Server Structured Logging – IST-Zustand

| Aspekt | Status | Detail |
|---|---|---|
| Logging-Library | ✅ `logging_config.py` | Custom Python Logger |
| Format | ✅ JSON (strukturiert) | Ausgabe als JSON-Lines |
| Output | ✅ stdout + File | `logs/server/god_kaiser.log` + stdout → Promtail |
| Log-Levels | ✅ Konfigurierbar | Via `LOG_LEVEL` ENV |

Der Server gibt **strukturierte JSON-Logs** aus, die von Promtail via stdout aufgesammelt werden. Allerdings parsed Promtail diese JSON-Logs **NICHT** (kein `json` Pipeline-Stage), sodass die JSON-Felder nicht als Labels extrahiert werden.

---

## 8. Grafana Dashboard Loki-Nutzung

Aus `system-health.json` nutzen 2 von 6 Panels Loki als Datasource:

| Panel | LogQL-Query | Status |
|---|---|---|
| Log Volume by Service | `sum(count_over_time({compose_project="auto-one"} [5m])) by (compose_service)` | ✅ FUNKTIONAL |
| Recent Error Logs | `{compose_project="auto-one"} \|~ "(?i)(error\|exception\|fail\|critical)"` | ✅ FUNKTIONAL |

**Bewertung:** Nutzt `compose_project` und `compose_service` Labels – konsistent mit Promtail-Config.

---

## 9. Dokumentation – IST-Zustand

| Dokument | Loki-relevant | Status |
|---|---|---|
| DOCKER_REFERENCE.md Section 5.1 | Port, Config, Retention, Storage | ✅ Korrekt |
| LOG_ACCESS_REFERENCE.md | Loki-Exports, Label-Namen | ⚠️ Sagt `service_name` – tatsächlich `service` |
| SYSTEM_OPERATIONS_REFERENCE.md | Loki-API Queries | ✅ Korrekt (nutzt `service` Label) |
| Dediziertes Loki-Referenzdokument | - | ❌ Existiert nicht |
| Label-Strategie Dokument | - | ❌ Nicht dokumentiert |
| LogQL-Beispielsammlung | - | ❌ Nur 3 Beispiele in SYSTEM_OPS |

---

## 10. Verify-Plan: Korrekturen zum TM-Auftragsdokument

| # | TM-Annahme | Tatsächlicher Befund | Schwere |
|---|---|---|---|
| 1 | "AutomationOne nutzt `service_name`" | **FALSCH** – Label heißt `service` (Promtail-Config Zeile 31) | KRITISCH |
| 2 | "60+ Frontend-Queries nutzen `service_name`" | **FALSCH** – 0 Loki-Queries im Frontend. Keine Loki-Integration. | KRITISCH |
| 3 | "Wo sind diese Queries definiert?" | **NIRGENDS** – Frontend nutzt REST-API-basiertes Log-Viewing | KORREKTUR |
| 4 | "Frontend-Konsolidierung: 242 console.*-Calls" | **Tatsächlich: ~68 console.* Calls** in 34 Dateien (nicht 242) | KORREKTUR |
| 5 | Label `compose_project` korrekt? | ✅ Ja – wird von Promtail gesetzt und im Dashboard genutzt | BESTÄTIGT |
| 6 | Promtail sendet an `http://loki:3100/loki/api/v1/push` | ✅ Korrekt | BESTÄTIGT |
| 7 | Retention 168h (7 Tage) | ✅ Korrekt + Compactor aktiviert | BESTÄTIGT |

---

## 11. SOLL-Analyse: Gap-Zusammenfassung

### Priorität KRITISCH

| # | Gap | Auswirkung | Empfehlung |
|---|---|---|---|
| K1 | **Label-Inkonsistenz in Doku** | LOG_ACCESS_REFERENCE.md sagt `service_name`, tatsächlich `service` | Doku korrigieren |
| K2 | **Kein JSON-Parsing in Promtail** | Server-JSON-Logs nicht aufgelöst → kein Filtern nach Log-Level, Module, etc. | `json` Pipeline-Stage hinzufügen |

### Priorität HOCH

| # | Gap | Auswirkung | Empfehlung |
|---|---|---|---|
| H1 | **Kein Log-Level Label** | Kann nicht nach ERROR/WARN/INFO filtern (nur Regex) | Pipeline-Stage: level extrahieren |
| H2 | **Kein Healthcheck-Filtering** | Healthcheck-Logs fluten (~4 Checks/Minute × 4 Services) | Pipeline-Stage: Drop Healthcheck-Logs |
| H3 | **Keine Ingestion-Limits** | Ungeschützt vor Log-Floods | `ingestion_rate_mb`, `ingestion_burst_size_mb` |
| H4 | **Label-Duplikation** | `service` und `compose_service` identisch | Eines entfernen |
| H5 | **Kein Multiline-Handling** | Python-Stacktraces fragmentiert | `multiline` Pipeline-Stage |

### Priorität MITTEL

| # | Gap | Auswirkung | Empfehlung |
|---|---|---|---|
| M1 | Kein Frontend-Logger | 68 ad-hoc console.* Calls → keine zentrale Kontrolle | Zentralen Logger implementieren |
| M2 | Keine Log-basierten Alerts (Ruler) | Error-Bursts nicht automatisch erkannt | Loki-Ruler konfigurieren |
| M3 | Keine Query-Limits | Potenziell teure Queries | `max_query_length` setzen |
| M4 | Auth deaktiviert | Loki-API offen erreichbar | Für Dev OK, für Prod relevant |

### Priorität NIEDRIG

| # | Gap | Auswirkung | Empfehlung |
|---|---|---|---|
| N1 | Kein dediziertes Loki-Referenzdokument | Wissenslücke | Erstellen |
| N2 | Nur 3 LogQL-Beispiele dokumentiert | Nutzung erschwert | Beispielsammlung erweitern |
| N3 | Frontend-Loki-Integration fehlt komplett | Kein Client-Side-Error-Tracking in Loki | Evaluieren (pino + Loki-Push?) |
| N4 | Keine Batching-Optimierung in Promtail | Default-Werte (möglicherweise suboptimal) | Bei Bedarf tunen |

---

## 12. Empfehlungen für TM

### Sofort umsetzbar (Quick Wins)

1. **Doku korrigieren:** LOG_ACCESS_REFERENCE.md `service_name` → `service`
2. **TM-Annahmen aktualisieren:** "60+ Frontend-Queries" → "0 Frontend-Loki-Queries"
3. **Console.* Count korrigieren:** 242 → 68 (möglicherweise gezählt inklusive Tests/node_modules)

### Mittelfristig (Sprint-Items)

4. **Promtail Pipeline erweitern:**
   - `json` Stage: Server-JSON-Logs parsen
   - `labels` Stage: `level`, `module` extrahieren
   - `match/drop` Stage: Healthcheck-Logs filtern
   - `multiline` Stage: Stacktraces zusammenführen
5. **Ingestion-Limits setzen:** Schutz vor Log-Floods
6. **Label-Bereinigung:** `compose_service` entfernen (Duplikat von `service`)

### Langfristig (Roadmap)

7. **Frontend-Logger:** Zentraler Logger mit strukturiertem Output
8. **Frontend → Loki Push:** Client-Side-Errors an Loki senden (eval: pino + Loki HTTP Push)
9. **Loki Ruler:** Log-basierte Alerts (Error-Rate > Threshold)
10. **Resource-Limits:** `deploy.resources.limits` wie in DOCKER_AKTUELL.md empfohlen

---

## 13. Cross-Reference: Prometheus-Bericht

Zusammenhänge mit der Prometheus-Analyse (Auftrag 1):

| Thema | Prometheus-Befund | Loki-Befund | Korrelation |
|---|---|---|---|
| Label-Strategie | `service=el-servador` | `service=el-servador`, `compose_service=el-servador` | Prometheus nutzt manuelles Label, Loki via Promtail – **inkonsistente Herkunft** |
| Dashboard | 3/4 Panels broken (fehlende Jobs) | 2/2 Panels funktional | Grafana Loki-Integration besser als Prometheus |
| Doku-Fehler | DOCKER_REF falscher Metrics-Pfad | LOG_ACCESS_REF falscher Label-Name | Systematisches Doku-Problem |
| Monitoring-Profil | Beide nur bei `--profile monitoring` | - | Gleiche Aktivierung |

---

## 14. Quellennachweise

| Datei | Relevante Zeilen/Sections |
|---|---|
| `docker-compose.yml` | 158-182 (Loki Service), 186-210 (Promtail Service) |
| `docker/loki/loki-config.yml` | Komplett (34 Zeilen) |
| `docker/promtail/config.yml` | Komplett (37 Zeilen) – Label-Konfiguration Zeile 24-36 |
| `docker/grafana/provisioning/dashboards/system-health.json` | Panels 5-6 (Loki-Queries) |
| `docker/grafana/provisioning/datasources/datasources.yml` | 12-17 (Loki Datasource) |
| `.claude/reference/debugging/LOG_ACCESS_REFERENCE.md` | 13-15, 31-33, 42-47 |
| `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | 1468-1478 (Loki-Queries) |
| `.claude/reference/infrastructure/DOCKER_REFERENCE.md` | Section 5.1 |
| `.claude/reference/infrastructure/DOCKER_AKTUELL.md` | 367, 387, 425 |
| `El Frontend/src/` | 34 Dateien mit 68+ console.* Calls (kein Loki) |
| `El Frontend/src/api/logs.ts` | REST-basiertes Log-Viewing |
| `El Frontend/src/components/system-monitor/ServerLogsTab.vue` | Log-Viewer UI |

---

*Bericht erstellt von system-control Agent + Explore Agent. Keine Code-Änderungen vorgenommen.*
