# Prometheus-Analyse – Vollständiger IST/SOLL-Bericht

**Datum:** 2026-02-09
**Agent:** system-control (Monitoring-Fokus)
**Auftrag:** TM Monitoring-Stack Auftrag 1
**Status:** ABGESCHLOSSEN
**Live-Verifizierung:** 2026-02-09 04:35 UTC - Alle 8 Container healthy, beide Scrape-Targets UP

### Live-Verifikation (2026-02-09)

| Check | Ergebnis |
|-------|----------|
| `docker compose ps` | 8/8 Container healthy (inkl. monitoring profile) |
| `/api/v1/health/ready` | `{"ready": true, "checks": {"database": true, "mqtt": true, "disk_space": true}}` |
| Prometheus `/api/v1/targets` | 2 Targets: el-servador (UP, 17ms), prometheus (UP, 9ms) |
| PromQL `up` | 2 Results, beide Wert `1` |
| PromQL `god_kaiser_uptime_seconds` | Wert: `1632` (Server laeuft ~27 Minuten) |
| PromQL `god_kaiser_esp_total` | Wert: `100` (davon 15 online, 17 offline, 68 unbekannt) |
| Prometheus `/api/v1/rules` | Leere Groups (KEINE Alerting/Recording Rules) |
| Metrics-Endpoint | 7 Custom-Metriken (5 immer + 2 psutil-abhaengig) |

---

## 1. Docker-Integration – IST-Zustand

| Eigenschaft | Wert | Quelle |
|---|---|---|
| Container-Name | `automationone-prometheus` | docker-compose.yml:217 |
| Image | `prom/prometheus:v3.2.1` | docker-compose.yml:216 |
| Port-Mapping | `9090:9090` | docker-compose.yml:219-220 |
| Healthcheck | `wget --spider http://localhost:9090/-/healthy` | docker-compose.yml:232 |
| HC-Interval | 15s | docker-compose.yml:233 |
| HC-Timeout | 5s | docker-compose.yml:234 |
| HC-Retries | 5 | docker-compose.yml:235 |
| Volume | `automationone-prometheus-data:/prometheus` (Named) | docker-compose.yml:222-223 |
| Network | `automationone-net` (bridge) | docker-compose.yml:237 |
| Profile | `monitoring` (nicht im Default-Start) | docker-compose.yml:218 |
| Restart-Policy | `unless-stopped` | docker-compose.yml:238 |
| Depends-On | `el-servador` (service_healthy) | docker-compose.yml:228-230 |
| Logging | json-file, max-size 5m, max-file 3 | docker-compose.yml:239-243 |
| Resource-Limits | **KEINE definiert** | - |
| Extra-Flags | `--web.enable-lifecycle` (API-Reload möglich) | docker-compose.yml:227 |

### Bewertung Docker-Integration

- ✅ Healthcheck korrekt konfiguriert
- ✅ Named Volume für Persistenz
- ✅ Profile-Separation (monitoring)
- ✅ Depends-on mit service_healthy
- ✅ Lifecycle-API aktiviert (Hot-Reload)
- ❌ **Keine Resource-Limits** (deploy.resources.limits) – könnte bei Lastspitzen Probleme machen
- ❌ **Kein start_period** im Healthcheck (Prometheus braucht ggf. Startzeit)

---

## 2. Konfiguration – IST-Zustand

**Config-Datei:** `docker/prometheus/prometheus.yml`

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'el-servador'
    metrics_path: '/api/v1/health/metrics'
    static_configs:
      - targets: ['el-servador:8000']
        labels:
          service: 'el-servador'
          environment: 'development'

  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
```

### Analyse

| Aspekt | Status | Detail |
|---|---|---|
| Scrape-Interval | ✅ 15s | Standard, angemessen für Dev |
| Evaluation-Interval | ✅ 15s | Gleich wie Scrape |
| Job `el-servador` | ✅ Definiert | Target: `el-servador:8000`, Path: `/api/v1/health/metrics` |
| Job `prometheus` | ✅ Self-Monitoring | `localhost:9090/metrics` (Default-Path) |
| Labels | ⚠️ Manuell | `service=el-servador`, `environment=development` |
| Retention | ✅ 7 Tage | Via CLI-Flag `--storage.tsdb.retention.time=7d` |
| Alerting-Rules | ❌ **KEINE** | Kein `rule_files:` Block |
| Recording-Rules | ❌ **KEINE** | Kein `rule_files:` Block |
| Remote-Write/Read | ❌ Nicht konfiguriert | - |
| Alertmanager | ❌ Nicht konfiguriert | Kein `alerting:` Block |

### Fehlende Scrape-Targets

| Potentielles Target | Status | Benötigt |
|---|---|---|
| PostgreSQL (via postgres_exporter) | ❌ Nicht vorhanden | Extra Container |
| MQTT-Broker (via mosquitto_exporter) | ❌ Nicht vorhanden | Extra Container |
| Node-Exporter (Host-Metriken) | ❌ Nicht vorhanden | Extra Container |
| cAdvisor (Container-Metriken) | ❌ Nicht vorhanden | Extra Container |
| Frontend (el-frontend) | ❌ Kein Metrics-Endpoint | Müsste implementiert werden |

---

## 3. El Servador Integration – IST-Zustand

### Metrics-Endpoint

| Eigenschaft | Wert |
|---|---|
| Pfad | `/api/v1/health/metrics` |
| Datei | `El Servador/god_kaiser_server/src/api/v1/health.py:351-423` |
| Auth | **KEINE** (korrekt für Prometheus-Scraping) |
| Response | `text/plain; version=0.0.4` (Prometheus-Format) |
| Library | `prometheus-client>=0.19.0` (in setup.py) |
| Implementierung | **Manuell** – String-Generierung, NICHT prometheus_client Registry |

### Exportierte Metriken

| Metrik | Typ | Beschreibung | Immer verfügbar |
|---|---|---|---|
| `god_kaiser_uptime_seconds` | gauge | Server-Uptime in Sekunden | ✅ Ja |
| `god_kaiser_mqtt_connected` | gauge | MQTT-Verbindungsstatus (0/1) | ✅ Ja |
| `god_kaiser_esp_total` | gauge | Registrierte ESP-Geräte gesamt | ✅ Ja |
| `god_kaiser_esp_online` | gauge | Online ESP-Geräte | ✅ Ja |
| `god_kaiser_esp_offline` | gauge | Offline ESP-Geräte | ✅ Ja |
| `god_kaiser_cpu_percent` | gauge | CPU-Auslastung % | ⚠️ Nur wenn psutil verfügbar |
| `god_kaiser_memory_percent` | gauge | RAM-Auslastung % | ⚠️ Nur wenn psutil verfügbar |

### KRITISCHE Lücken in der Metrik-Abdeckung

| Fehlende Metrik-Kategorie | Bedeutung | Priorität |
|---|---|---|
| **HTTP Request Metrics** | Keine Request-Counts, Response-Times, Status-Codes | KRITISCH |
| **MQTT Message Metrics** | Keine Message-Counts, Publish/Subscribe-Raten | HOCH |
| **Database Metrics** | Keine Query-Counts, Latenz, Connection-Pool | HOCH |
| **WebSocket Metrics** | Keine Connection-Counts, Message-Raten | MITTEL |
| **Error Rate Metrics** | Keine Error-Counts nach Typ | HOCH |
| **Circuit Breaker Metrics** | Kein CB-State, Trip-Count | MITTEL |

### Implementierungs-Problem

Die aktuelle Implementierung **generiert Metriken-Text manuell** (String-Concat), anstatt die `prometheus_client` Registry zu nutzen. Das bedeutet:
- Keine Histogramme möglich (Request-Latenz)
- Keine Counters (monoton steigende Werte)
- Keine Labels pro Metrik (z.B. per-Endpoint Latenz)
- Jeder Scrape führt eine **DB-Query** aus (`esp_repo.get_all()`) – Performance-Risiko

**Empfehlung:** `prometheus-fastapi-instrumentator` einsetzen für automatische HTTP-Metriken, oder zumindest `prometheus_client` Registry korrekt nutzen.

---

## 4. Grafana Dashboard – IST-Zustand

**Dashboard:** `docker/grafana/provisioning/dashboards/system-health.json`
**Titel:** "AutomationOne - System Health"
**UID:** `automationone-system-health`

### Panels

| # | Panel | Datasource | Query | Status |
|---|---|---|---|---|
| 1 | Server Health Status | Prometheus | `up{job="el-servador"}` | ✅ FUNKTIONAL |
| 2 | MQTT Broker Status | Prometheus | `up{job="mqtt-broker"}` | ❌ **BROKEN – Job existiert nicht** |
| 3 | Database Status | Prometheus | `up{job="postgres"}` | ❌ **BROKEN – Job existiert nicht** |
| 4 | Frontend Status | Prometheus | `up{job="el-frontend"}` | ❌ **BROKEN – Job existiert nicht** |
| 5 | Log Volume by Service | Loki | `count_over_time({compose_project=...})` | ✅ FUNKTIONAL (Loki) |
| 6 | Recent Error Logs | Loki | `{compose_project=...} \|~ "error\|exception..."` | ✅ FUNKTIONAL (Loki) |

### KRITISCH: Dashboard-Prometheus Inkonsistenz

**3 von 4 Prometheus-Panels zeigen "No Data"**, weil die referenzierten Jobs (`mqtt-broker`, `postgres`, `el-frontend`) in `prometheus.yml` nicht als Scrape-Targets definiert sind.

**Optionen zur Behebung:**
1. **Exporters hinzufügen** (postgres_exporter, mosquitto_exporter) → dann funktionieren die `up{}` Queries
2. **Dashboard anpassen** → Panels entfernen oder auf Custom-Metriken umstellen
3. **Hybrid:** Custom-Metriken für MQTT/DB-Status nutzen (schon als `god_kaiser_mqtt_connected` vorhanden)

---

## 5. Dokumentation – IST-Zustand

| Dokument | Prometheus-relevant | Status |
|---|---|---|
| DOCKER_REFERENCE.md Section 5.3 | Port, Config, Retention, Targets | ⚠️ Targets-Pfad verkuerzt als `el-servador:8000/metrics` statt `/api/v1/health/metrics` |
| REST_ENDPOINTS.md | `/health/metrics` gelistet | ❌ Sagt "JWT Auth" – tatsächlich KEIN Auth |
| Dediziertes Prometheus-Referenzdokument | - | ❌ Existiert nicht |
| PromQL-Beispielqueries | - | ❌ Nicht dokumentiert |
| Metrik-Namensliste | - | ❌ Nicht dokumentiert |

---

## 6. Verify-Plan: Korrekturen zum TM-Auftragsdokument

| # | TM-Annahme | Tatsächlicher Befund | Korrektur |
|---|---|---|---|
| 1 | Library: `prometheus-fastapi-instrumentator` | `prometheus-client>=0.19.0` mit **manueller String-Generierung** | TM-Dok berichtigen |
| 2 | Metrics-Pfad unklar | `/api/v1/health/metrics` (verifiziert in prometheus.yml UND health.py) | Eindeutig |
| 3 | Config-Eigenschaft "PROMETHEUS_PORT" in core/config.py | Definiert als `prometheus_port: int = 9090` – wird aber nirgends aktiv genutzt | Nur Config-Platzhalter |
| 4 | Prometheus UI unter localhost:9090 | Korrekt, aber nur wenn monitoring-Profile aktiv | Profil-Hinweis nötig |

---

## 7. SOLL-Analyse: Gap-Zusammenfassung

### Priorität KRITISCH

| # | Gap | Auswirkung | Empfehlung |
|---|---|---|---|
| K1 | **3/4 Dashboard-Panels broken** | Grafana zeigt "No Data" für MQTT, DB, Frontend | Exporters hinzufügen ODER Dashboard korrigieren |
| K2 | **Keine HTTP-Metriken** | Kein Monitoring von API-Performance, Error-Rates | `prometheus-fastapi-instrumentator` einsetzen |

### Priorität HOCH

| # | Gap | Auswirkung | Empfehlung |
|---|---|---|---|
| H1 | Manuelle Metrik-Generierung | Keine Histogramme, Counters, Labels | Refactor auf `prometheus_client` Registry |
| H2 | Keine MQTT-Message-Metriken | Message-Durchsatz unsichtbar | Custom Counter in MQTT-Client |
| H3 | Keine DB-Metriken | Query-Latenz/Pool unsichtbar | postgres_exporter oder Custom Metriken |
| H4 | Keine Alerting-Rules | Kein automatisches Warnsystem | `rule_files:` in prometheus.yml |
| H5 | DB-Query bei jedem Scrape | Performance-Risiko (alle 15s full table scan) | Caching oder prometheus_client Gauges |

### Priorität MITTEL

| # | Gap | Auswirkung | Empfehlung |
|---|---|---|---|
| M1 | Keine Recording-Rules | Häufige Aggregationen nicht vorberechnet | Bei Bedarf ergänzen |
| M2 | Kein Alertmanager | Alerts gehen ins Leere | Alertmanager-Container hinzufügen |
| M3 | Label `environment=development` hardcoded | Kein Multi-Environment Support | Via ENV-Variable injizieren |
| M4 | Keine Resource-Limits | Unkontrolliertes Wachstum möglich | `deploy.resources.limits` setzen |
| M5 | Kein start_period im Healthcheck | False-Positive Health-Failures beim Start | `start_period: 15s` hinzufügen |
| M6 | Label-Inkonsistenz Prometheus vs Loki | Prometheus nutzt `service`, Loki/Promtail nutzt `service_name` - erschwert Cross-Correlation | Labels vereinheitlichen oder Mapping dokumentieren |

### Priorität NIEDRIG

| # | Gap | Auswirkung | Empfehlung |
|---|---|---|---|
| N1 | DOCKER_REFERENCE.md Section 5.3 | Metrics-Pfad als `el-servador:8000/metrics` statt korrektem `/api/v1/health/metrics` | Korrigieren |
| N2 | Doku-Fehler in REST_ENDPOINTS.md | Falscher Auth-Status für /metrics | Korrigieren |
| N3 | Kein dediziertes Prometheus-Referenzdokument | Fehlende Wissensbasis | Erstellen |
| N4 | Keine Security (Basic Auth/TLS für Prometheus UI) | UI offen erreichbar | Für Dev OK, für Prod relevant |

---

## 8. Empfehlungen für TM

### Sofort umsetzbar (Quick Wins)

1. **Dashboard korrigieren:** Panels 2-4 auf vorhandene Custom-Metriken umstellen (`god_kaiser_mqtt_connected` statt `up{job="mqtt-broker"}`)
2. **Doku korrigieren:** DOCKER_REFERENCE.md Pfad, REST_ENDPOINTS.md Auth-Status
3. **Healthcheck start_period:** `start_period: 15s` für Prometheus hinzufügen

### Mittelfristig (Sprint-Items)

4. **prometheus-fastapi-instrumentator:** Auto-Instrumentierung für HTTP-Metriken
5. **Custom-Metriken refactoren:** `prometheus_client` Registry statt manuelle Strings
6. **Alerting-Rules:** Basis-Set definieren (Server Down, Error-Rate, MQTT Disconnect)

### Langfristig (Roadmap)

7. **Zusätzliche Exporters:** postgres_exporter, mosquitto_exporter
8. **Alertmanager:** Notification-Channel (Webhook/Email)
9. **cAdvisor:** Container-Level-Metriken

---

## 9. Quellennachweise

| Datei | Relevante Zeilen |
|---|---|
| `docker-compose.yml` | 215-243 (Prometheus Service) |
| `docker/prometheus/prometheus.yml` | Komplett (17 Zeilen) |
| `El Servador/god_kaiser_server/src/api/v1/health.py` | 351-423 (Metrics Endpoint) |
| `El Servador/god_kaiser_server/setup.py` | 27 (`prometheus-client>=0.19.0`) |
| `El Servador/god_kaiser_server/src/core/config.py` | 147 (`prometheus_port` Setting) |
| `docker/grafana/provisioning/dashboards/system-health.json` | Panels 1-4 (Prometheus Queries) |
| `docker/grafana/provisioning/datasources/datasources.yml` | 3-10 (Prometheus Datasource) |
| `.claude/reference/infrastructure/DOCKER_REFERENCE.md` | Section 5.3 |
| `.claude/reference/api/REST_ENDPOINTS.md` | 246 |

---

*Bericht erstellt von system-control Agent. Keine Code-Änderungen vorgenommen.*
