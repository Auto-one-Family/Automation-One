# Grafana - Vollstaendige Analyse (Auftrag 4)

**Datum:** 2026-02-09
**Agent:** system-control (Monitoring-Fokus)
**Auftrag:** TM Auftrag 4 aus monitoring-stack-analysis.md
**Status:** COMPLETE
**Live-Verifizierung:** 2026-02-09 04:40 UTC - Grafana healthy, Datasources connected, Dashboard geladen

---

## 0. Live-Verifikation

| Check | Ergebnis |
|-------|----------|
| Container Status | `automationone-grafana` UP (healthy) seit 24+ Minuten |
| `/api/health` | `{"database": "ok", "version": "11.5.2"}` |
| Admin-Login | `admin:admin` funktioniert (Default-Passwort!) |
| Datasource Prometheus | Connected, Proxy-Modus, Queries funktional |
| Datasource Loki | Connected, Proxy-Modus, Labels abrufbar |
| Dashboard geladen | 1 Dashboard: "AutomationOne - System Health" |
| Alert Rules | KEINE (`404 Not found` auf alert-rules API) |
| Org | "Main Org." (Standard) |

---

## 1. Docker-Integration

| Eigenschaft | IST-Wert | TM-Erwartung | Status |
|-------------|----------|--------------|--------|
| Container | `automationone-grafana` | `automationone-grafana` | OK |
| Image | `grafana/grafana:11.5.2` | `grafana/grafana:11.5.2` | OK |
| Port-Mapping | `3000:3000` | `3000:3000` | OK |
| Healthcheck | `wget --no-verbose --tries=1 --spider http://localhost:3000/api/health` | `wget --spider http://localhost:3000/api/health` | OK |
| HC-Interval | 15s | nicht spezifiziert | OK |
| HC-Timeout | 5s | nicht spezifiziert | OK |
| HC-Retries | 5 | nicht spezifiziert | OK |
| Volume | `automationone-grafana-data:/var/lib/grafana` | `automationone-grafana-data:/var/lib/grafana` | OK |
| Network | `automationone-net` | `automationone-net` | OK |
| Profile | `monitoring` | `monitoring` | OK |
| Restart-Policy | `unless-stopped` | nicht spezifiziert | OK |
| Logging | json-file, max-size 5m, max-file 3 | nicht spezifiziert | OK |
| Resource-Limits | **KEINE definiert** | ggf. vorhanden | FEHLT |
| start_period | **NICHT definiert** | nicht erwaehnt | FEHLT |

### Environment-Variables

| Variable | Wert | Bewertung |
|----------|------|-----------|
| `GF_SECURITY_ADMIN_PASSWORD` | `${GRAFANA_ADMIN_PASSWORD:-admin}` | WARNUNG: Default `admin` wenn nicht in `.env` gesetzt |
| `GF_USERS_ALLOW_SIGN_UP` | `false` | OK - keine Selbstregistrierung |
| `GF_SERVER_ROOT_URL` | NICHT gesetzt | OK fuer Dev (Default: `http://localhost:3000`) |
| `GF_INSTALL_PLUGINS` | NICHT gesetzt | Keine Custom-Plugins installiert |
| `GF_AUTH_ANONYMOUS_ENABLED` | NICHT gesetzt (Default: false) | OK |

### Depends-On

```yaml
depends_on:
  loki:
    condition: service_healthy
  prometheus:
    condition: service_healthy
```

Grafana startet erst wenn Loki UND Prometheus healthy sind. Korrekte Startup-Order.

---

## 2. Konfiguration - Provisioning

### 2.1 Provisioning-Verzeichnisstruktur

```
docker/grafana/provisioning/
  datasources/
    datasources.yml          # 2 Datasources: Prometheus + Loki
  dashboards/
    dashboards.yml           # Dashboard-Provider-Config
    system-health.json       # 1 Dashboard: "AutomationOne - System Health"
```

### 2.2 Datasources (`datasources.yml`)

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    uid: prometheus
    isDefault: true
    editable: false

  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    uid: loki
    editable: false
```

| Datasource | Type | URL | Access | Default | Editable | Status |
|------------|------|-----|--------|---------|----------|--------|
| Prometheus | prometheus | `http://prometheus:9090` | proxy | JA | Nein | CONNECTED |
| Loki | loki | `http://loki:3100` | proxy | Nein | Nein | CONNECTED |

**Bewertung:**
- Beide Datasources via Proxy-Modus (empfohlen - Queries gehen ueber Grafana-Backend)
- UIDs fest definiert (`prometheus`, `loki`) - konsistent mit Dashboard-Referenzen
- `editable: false` - Read-Only, korrekt fuer provisionierte Datasources
- Keine zusaetzlichen Konfigurationen (timeout, httpMethod, etc.)

### 2.3 Dashboard Provider (`dashboards.yml`)

```yaml
apiVersion: 1
providers:
  - name: 'AutomationOne'
    orgId: 1
    folder: 'AutomationOne'
    type: file
    disableDeletion: false
    editable: true
    options:
      path: /etc/grafana/provisioning/dashboards
      foldersFromFilesStructure: false
```

| Eigenschaft | Wert | Bewertung |
|-------------|------|-----------|
| Name | AutomationOne | OK |
| Folder | AutomationOne | OK - eigener Folder |
| Type | file | OK (Standard) |
| disableDeletion | false | WARNUNG: Dashboard kann versehentlich geloescht werden |
| editable | true | OK fuer Dev (manuelle Aenderungen moeglich) |
| foldersFromFilesStructure | false | OK (alle in einem Folder) |

---

## 3. Datasource-Integration (Live verifiziert)

### 3.1 Prometheus Datasource

| Test | Ergebnis | Status |
|------|----------|--------|
| Verbindung | Connected | OK |
| Query: `up` | 2 Ergebnisse (el-servador, prometheus) | OK |
| Query: `god_kaiser_uptime_seconds` | Wert zurueckgegeben | OK |
| Proxy-Routing | Grafana -> prometheus:9090 | OK |

### 3.2 Loki Datasource

| Test | Ergebnis | Status |
|------|----------|--------|
| Verbindung | Connected | OK |
| Label-Abfrage | 6 Labels: compose_project, compose_service, container, service, service_name, stream | OK |
| `service` Values | 8 Services (el-frontend, el-servador, grafana, loki, mqtt-broker, postgres, prometheus, promtail) | OK |
| Proxy-Routing | Grafana -> loki:3100 | OK |

### 3.3 Fehlende Datasources

| Datasource | Status | Begruendung |
|------------|--------|-------------|
| InfluxDB | NICHT konfiguriert | Laut TM-Roadmap "noch nicht implementiert". Keine Vorbereitung vorhanden |
| Alertmanager | NICHT konfiguriert | Kein Alertmanager-Container deployed |

---

## 4. Dashboards

### 4.1 Dashboard-Inventar

| # | Dashboard | UID | Folder | Tags | Version |
|---|-----------|-----|--------|------|---------|
| 1 | AutomationOne - System Health | `automationone-system-health` | AutomationOne | automationone, system, health | 1 |

**Gesamt: 1 Dashboard** (provisioniert via JSON-Datei)

### 4.2 Dashboard-Panel-Analyse: "AutomationOne - System Health"

| Panel# | Titel | Typ | Datasource | Query | Funktional? |
|--------|-------|-----|------------|-------|-------------|
| 1 | Server Health Status | stat | Prometheus | `up{job="el-servador"}` | OK |
| 2 | MQTT Broker Status | stat | Prometheus | `up{job="mqtt-broker"}` | **BROKEN** |
| 3 | Database Status | stat | Prometheus | `up{job="postgres"}` | **BROKEN** |
| 4 | Frontend Status | stat | Prometheus | `up{job="el-frontend"}` | **BROKEN** |
| 5 | Log Volume by Service (Last Hour) | timeseries | Loki | `sum(count_over_time({compose_project="auto-one"} [5m])) by (compose_service)` | OK |
| 6 | Recent Error Logs | logs | Loki | `{compose_project="auto-one"} \|~ "(?i)(error\|exception\|fail\|critical)"` | OK |

### 4.3 KRITISCH: 3 Broken Panels

**Panels 2, 3, 4** referenzieren Prometheus-Jobs die NICHT existieren:

| Panel | Query | Problem | Anzeige |
|-------|-------|---------|---------|
| MQTT Broker Status | `up{job="mqtt-broker"}` | Kein Scrape-Target `mqtt-broker` in prometheus.yml | "No data" |
| Database Status | `up{job="postgres"}` | Kein Scrape-Target `postgres` in prometheus.yml | "No data" |
| Frontend Status | `up{job="el-frontend"}` | Kein Scrape-Target `el-frontend` in prometheus.yml | "No data" |

**Root Cause:** Dashboard wurde erstellt BEVOR die Prometheus-Config finalisiert wurde, oder es wurde von einem Template mit mehr Scrape-Targets kopiert.

**Behebungsoptionen:**

| Option | Aufwand | Beschreibung |
|--------|---------|--------------|
| A: Dashboard korrigieren | NIEDRIG | Panels auf vorhandene Metriken umstellen oder entfernen |
| B: Exporters hinzufuegen | HOCH | postgres_exporter, mosquitto_exporter, frontend-metrics |
| C: Hybrid | MITTEL | Panel 2 → `god_kaiser_mqtt_connected`, Panel 3+4 → Loki Health-Log-Queries |

**Empfehlung: Option C (Hybrid)**
- Panel 2: `god_kaiser_mqtt_connected` (bereits verfuegbar!)
- Panel 3: Loki-Query `count_over_time({compose_service="postgres"} [1m]) > 0` (Logs = alive)
- Panel 4: Loki-Query `count_over_time({compose_service="el-frontend"} [1m]) > 0`

### 4.4 Dashboard-Features-Bewertung

| Feature | Status | Bewertung |
|---------|--------|-----------|
| Template-Variables | KEINE | FEHLT - kein `$service`, `$environment`, `$timerange` |
| Annotations | Leer | FEHLT - keine Event-Marker |
| Links | Leer | FEHLT - keine Cross-Links zu anderen Dashboards |
| Time-Range | `now-1h to now` | OK als Default |
| Timezone | `browser` | OK |
| Auto-Refresh | NICHT konfiguriert | FEHLT |

### 4.5 Fehlende Dashboards

| Dashboard | Prioritaet | Begruendung |
|-----------|------------|-------------|
| **API Performance** | HOCH | Request-Rates, Response-Times, Status-Codes (benoetigt HTTP-Instrumentierung) |
| **ESP Fleet Overview** | HOCH | Device-Status, Online/Offline-Trend, Heartbeat-Raten |
| **MQTT Traffic** | MITTEL | Message-Rates, Topic-Distribution (benoetigt MQTT-Metriken) |
| **Database Performance** | MITTEL | Query-Latenz, Connection-Pool (benoetigt postgres_exporter) |
| **Error Tracking** | MITTEL | Error-Rates nach Service, Error-Typen, Trend |
| **Container Resources** | NIEDRIG | CPU/Memory pro Container (benoetigt cAdvisor) |

---

## 5. Alerting

### 5.1 IST-Zustand

| Aspekt | Status |
|--------|--------|
| Grafana Alert Rules | **KEINE** (API gibt `404 Not found` zurueck) |
| Prometheus Alert Rules | **KEINE** (leere Groups in `/api/v1/rules`) |
| Alertmanager | **NICHT deployed** (kein Container) |
| Notification Channels | **KEINE konfiguriert** |
| Contact Points | **KEINE** (Standard: Grafana built-in alerting) |

### 5.2 SOLL: Empfohlene Alert-Rules

| Alert | Typ | Expression | Schwere | Begruendung |
|-------|-----|-----------|---------|-------------|
| ServerDown | Prometheus | `up{job="el-servador"} == 0 for 1m` | CRITICAL | Kern-Service offline |
| MQTTDisconnected | Prometheus | `god_kaiser_mqtt_connected == 0 for 2m` | WARNING | Daten-Pipeline unterbrochen |
| HighCPU | Prometheus | `god_kaiser_cpu_percent > 90 for 5m` | WARNING | Performance-Degradation |
| HighMemory | Prometheus | `god_kaiser_memory_percent > 90` | WARNING | OOM-Risiko |
| ESPFleetDegraded | Prometheus | `god_kaiser_esp_online / god_kaiser_esp_total < 0.5 for 5m` | WARNING | Mehr als 50% Fleet offline |
| HighErrorRate | Loki | `sum(count_over_time({...} \|~ "error" [5m])) > 50` | WARNING | Error-Spike |
| NoLogs | Loki | `absent(count_over_time({compose_service="el-servador"} [5m]))` | CRITICAL | Server produziert keine Logs |

### 5.3 Notification-Channels Empfehlung

| Channel | Aufwand | Sinnvoll fuer |
|---------|---------|---------------|
| **Grafana Built-in (OnCall)** | NIEDRIG | Dev-Environment, Browser-Notifications |
| **Webhook** | NIEDRIG | Integration mit eigenen Services |
| **Email** | MITTEL | Teambenachrichtigung (benoetigt SMTP-Config) |
| **Slack** | MITTEL | Team-Chat-Integration |

**Empfehlung:** Grafana Built-in Alerting als erster Schritt (kein externer Alertmanager noetig).

---

## 6. Frontend-Integration

### 6.1 IST-Zustand

**KEINE Grafana-Integration im Frontend vorhanden.**

- Grep nach `grafana`, `iframe`, `embed` im Frontend-Code: NUR Drag-Drop-Zonen (ZoneAssignmentPanel.vue, AnalysisDropZone.vue, ZoneGroup.vue) - KEINE Grafana-Referenzen.
- Kein Grafana-API-Client implementiert
- Kein Iframe-Embedding vorbereitet
- Kein Grafana-Proxy-Endpoint im Server

### 6.2 Integrations-Optionen Evaluation

| Option | Aufwand | Vorteile | Nachteile |
|--------|---------|----------|-----------|
| **A: Iframe-Embedding** | NIEDRIG | Schnell, native Grafana-Panels | CORS-Probleme, Auth-Handling, kein responsive Design |
| **B: Grafana API + Vue Charts** | HOCH | Volle Kontrolle, native UX | Eigene Chart-Komponenten noetig, API-Komplexitaet |
| **C: Embedded Panels (Grafana 11)** | MITTEL | Native Panels, responsiv | Grafana Anonymous Access noetig, Sicherheits-Implikation |
| **D: Prometheus API direkt** | MITTEL | Kein Grafana-Umweg, volle Kontrolle | PromQL im Frontend, eigene Visualisierung |

### 6.3 Empfehlung

**Option C (Embedded Panels)** fuer Monitoring-Views:

1. `GF_AUTH_ANONYMOUS_ENABLED=true` und `GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer` setzen
2. `GF_SECURITY_ALLOW_EMBEDDING=true` setzen
3. Panel-URLs in Vue-Component als Iframes einbetten:
   ```
   http://localhost:3000/d-solo/automationone-system-health/automationone-system-health?orgId=1&panelId=1
   ```
4. Fuer eigene Daten-Visualisierung: **Option D** (Prometheus API direkt) ueber den Server als Proxy

**Prioritaet:** NIEDRIG - Frontend hat bereits eigenes Dashboard mit ESP-Status, Sensor-Daten etc. Grafana-Integration ist ein Nice-to-have.

---

## 7. Installed Plugins

### Built-in Plugins (aktiv)

| Plugin | Typ | Version | Beschreibung |
|--------|-----|---------|--------------|
| Grafana Logs Drilldown | app | 1.0.10 | Loki-Log-Exploration ohne LogQL |
| Grafana Profiles Drilldown | app | 1.16.0 | Pyroscope-Integration (nicht genutzt) |

### Custom Plugins

**KEINE installiert.** `GF_INSTALL_PLUGINS` ist nicht gesetzt.

### Empfohlene Plugins

| Plugin | Aufwand | Begruendung |
|--------|---------|-------------|
| `grafana-image-renderer` | NIEDRIG | PNG/PDF-Export von Dashboards (fuer Reports) |
| `grafana-piechart-panel` | NIEDRIG | Pie-Charts fuer ESP-Status-Verteilung |
| Weitere | - | Aktuell nicht noetig |

---

## 8. Security

| Aspekt | IST | Bewertung |
|--------|-----|-----------|
| Admin-Passwort | `admin` (Default wenn `GRAFANA_ADMIN_PASSWORD` nicht in `.env`) | WARNUNG |
| Self-Registration | Disabled (`GF_USERS_ALLOW_SIGN_UP=false`) | OK |
| Anonymous Access | Disabled (Default) | OK |
| Allow Embedding | Disabled (Default) | OK (muss fuer Frontend-Integration aktiviert werden) |
| Auth-Proxy | NICHT konfiguriert | OK fuer Dev |
| OAuth/LDAP | NICHT konfiguriert | OK fuer Dev |
| TLS | NICHT konfiguriert (HTTP) | OK (internes Docker-Netzwerk) |
| API Key | Keine erstellt | OK fuer Dev |
| CORS | Default-Config | OK |

**Empfehlung:** `GRAFANA_ADMIN_PASSWORD` in `.env` setzen (nicht Default `admin` lassen).

---

## 9. Dokumentation-Status

| Dokument | Grafana erwaehnt? | Status |
|----------|-------------------|--------|
| DOCKER_REFERENCE.md Section 5.4 | JA - Port, Default User, Datasources, Provisioning | OK (korrekt) |
| Dediziertes Grafana-Referenzdokument | NEIN | FEHLT |
| Dashboard-Dokumentation | NEIN | FEHLT |
| Grafana-API-Referenz | NEIN | FEHLT |
| LogQL-Query-Beispiele | NEIN | FEHLT |
| PromQL-Query-Beispiele | NEIN | FEHLT |

---

## 10. SOLL-Analyse: Gap-Zusammenfassung

### Prioritaet KRITISCH

| # | Gap | Auswirkung | Empfehlung |
|---|-----|-----------|------------|
| K1 | **3/4 Prometheus-Panels broken** | Dashboard zeigt "No data" fuer MQTT, DB, Frontend | Panels auf vorhandene Metriken umstellen (Hybrid-Option) |
| K2 | **Default Admin-Passwort** | Sicherheitsrisiko (triviales Login) | `GRAFANA_ADMIN_PASSWORD` in `.env` erzwingen |

### Prioritaet HOCH

| # | Gap | Auswirkung | Empfehlung |
|---|-----|-----------|------------|
| H1 | **Keine Alert-Rules** | Kein automatisches Warnsystem | Grafana Built-in Alerting konfigurieren |
| H2 | **Keine Template-Variables** | Kein dynamisches Filtering im Dashboard | `$service`, `$timerange` Variables hinzufuegen |
| H3 | **Nur 1 Dashboard** | Minimale Monitoring-Abdeckung | ESP Fleet + API Performance Dashboards erstellen |
| H4 | **disableDeletion: false** | Dashboard kann versehentlich geloescht werden | `disableDeletion: true` setzen |

### Prioritaet MITTEL

| # | Gap | Auswirkung | Empfehlung |
|---|-----|-----------|------------|
| M1 | Kein Auto-Refresh | Dashboard aktualisiert sich nicht automatisch | `refresh: "10s"` in Dashboard-JSON |
| M2 | Keine Annotations | Keine Event-Marker (Deployments, Incidents) | Annotation-Queries hinzufuegen |
| M3 | Kein Dashboard-Versioning-Workflow | Manuelle JSON-Pflege | Git-basiertes Dashboard-Management |
| M4 | Keine Resource-Limits | Unkontrolliertes Memory-Wachstum | `deploy.resources.limits` setzen |
| M5 | Keine Notification-Channels | Alerts wuerden ins Leere gehen | Mindestens Webhook konfigurieren |

### Prioritaet NIEDRIG

| # | Gap | Auswirkung | Empfehlung |
|---|-----|-----------|------------|
| N1 | Keine Custom-Plugins | Standard-Panels ausreichend fuer Dev | `grafana-image-renderer` fuer Report-Export |
| N2 | Keine Frontend-Integration | Separate UIs (Vue Dashboard + Grafana) | Spaeter via Embedded Panels |
| N3 | Keine dedizierte Doku | Fehlende Wissensbasis | Referenz-Dokument erstellen |
| N4 | InfluxDB-Datasource nicht vorbereitet | Kein Zukunfts-Setup | Wenn InfluxDB geplant: Datasource als disabled voranlegen |

---

## 11. Cross-Component Findings (Grafana als Integrations-Hub)

### 11.1 Grafana ↔ Prometheus

| Aspekt | Status | Problem |
|--------|--------|---------|
| Datasource-Verbindung | OK | - |
| Dashboard-Queries | TEILWEISE | 3/4 Stat-Panels broken (fehlende Jobs) |
| Custom-Metriken | VERFUEGBAR | 5 `god_kaiser_*` Metriken + 2 psutil |
| HTTP-Metriken | FEHLEN | Keine Request/Response-Metriken in Prometheus |

### 11.2 Grafana ↔ Loki

| Aspekt | Status | Problem |
|--------|--------|---------|
| Datasource-Verbindung | OK | - |
| Dashboard-Queries | OK | Log-Volume und Error-Logs funktionieren |
| Label-Konsistenz | WARNUNG | `service` (Promtail) vs `service_name` (Docker-Auto) |
| Alle Container geloggt | JA | 8/8 Services in Loki |

### 11.3 Grafana ↔ Frontend

| Aspekt | Status | Problem |
|--------|--------|---------|
| Integration | KEINE | Kein Grafana-Code im Frontend |
| Gemeinsame Daten | VORHANDEN | Beide nutzen `/api/v1/health/*` Endpoints |
| Redundanz | GERING | Frontend zeigt Live-Daten, Grafana zeigt Trends |

---

## 12. Empfehlungen fuer TM

### Sofort umsetzbar (Quick Wins)

1. **Dashboard Panels 2-4 korrigieren:**
   - Panel 2 (MQTT): `god_kaiser_mqtt_connected` (bereits in Prometheus!)
   - Panel 3 (DB): `count_over_time({compose_service="postgres"} [1m]) > 0` (Loki-Heartbeat)
   - Panel 4 (Frontend): `count_over_time({compose_service="el-frontend"} [1m]) > 0`

2. **Auto-Refresh aktivieren:**
   Dashboard-JSON: `"refresh": "10s"` hinzufuegen

3. **Admin-Passwort sichern:**
   `.env`: `GRAFANA_ADMIN_PASSWORD=<sicheres-passwort>`

4. **disableDeletion aktivieren:**
   `dashboards.yml`: `disableDeletion: true`

### Mittelfristig (Sprint-Items)

5. **Template-Variables hinzufuegen:**
   `$service` Variable mit Prometheus-Label-Query

6. **ESP Fleet Dashboard erstellen:**
   - Panels: Online/Offline-Trend, Heap-Memory, WiFi-RSSI, Heartbeat-Rate
   - Queries: `god_kaiser_esp_online`, `god_kaiser_esp_offline`, `god_kaiser_esp_total`

7. **Grafana Built-in Alerting konfigurieren:**
   - ServerDown Alert auf `up{job="el-servador"} == 0`
   - MQTTDown Alert auf `god_kaiser_mqtt_connected == 0`
   - Contact Point: Webhook (einfachster Weg)

### Langfristig (Roadmap)

8. **API Performance Dashboard** (nach HTTP-Instrumentierung)
9. **Frontend Embedded Panels** (nach Alerting-Setup)
10. **Dashboard-as-Code Workflow** (JSON in Git, Auto-Provisioning)

---

## 13. TM-Dokument-Korrekturen

| # | TM-Annahme | Tatsaechlicher Befund | Korrektur |
|---|------------|----------------------|-----------|
| 1 | `GF_INSTALL_PLUGINS` (falls vorhanden) | NICHT gesetzt | Keine Custom-Plugins |
| 2 | `GF_SERVER_ROOT_URL` | NICHT gesetzt | Default `http://localhost:3000` |
| 3 | Provisioning: Notifiers (fuer Alerting) | NICHT vorhanden | Kein Alerting konfiguriert |
| 4 | Dashboard-Organisation in Folders | 1 Folder: "AutomationOne" | Nur 1 Folder mit 1 Dashboard |
| 5 | InfluxDB vorbereitet? | NEIN, keine Datasource | Nicht einmal als disabled vorhanden |
| 6 | "60+ Frontend-Queries nutzen service_name" | Frontend hat KEINE Grafana/Loki-Integration | TM verwechselt vermutlich Frontend-Console-Logs mit Loki-Queries |

---

## 14. Quellennachweise

| Datei | Relevante Zeilen |
|-------|------------------|
| `docker-compose.yml` | 248-277 (Grafana Service) |
| `docker/grafana/provisioning/datasources/datasources.yml` | Komplett (18 Zeilen) |
| `docker/grafana/provisioning/dashboards/dashboards.yml` | Komplett (13 Zeilen) |
| `docker/grafana/provisioning/dashboards/system-health.json` | Komplett (412 Zeilen, 6 Panels) |
| `.claude/reference/infrastructure/DOCKER_REFERENCE.md` | Section 5.4 |
| `.env.example` | GRAFANA_ADMIN_PASSWORD Variable |

---

*Bericht erstellt von system-control Agent am 2026-02-09.*
*Daten-Grundlage: Live-System-Abfragen gegen laufende Container.*
*Keine Code-Aenderungen vorgenommen.*
