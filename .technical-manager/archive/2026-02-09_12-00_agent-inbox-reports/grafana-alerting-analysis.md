# Grafana Alerting - Erstanalyse

**Datum:** 2026-02-09
**Auftrag:** 3.2 Grafana Alerting
**Typ:** Analyse (kein Code)
**Agent:** Claude Code (system-control + server-debug + Web-Recherche)

---

## 1. IST-Zustand

### Grafana Setup
- **Version:** 11.5.2 (Unified Alerting ist Default seit 9.x - keine Aktivierung noetig)
- **Container:** `automationone-grafana`, Profile `monitoring`, Port 3000
- **Provisioning-Volume:** `./docker/grafana/provisioning:/etc/grafana/provisioning:ro`
- **Environment:** Nur `GF_SECURITY_ADMIN_PASSWORD` und `GF_USERS_ALLOW_SIGN_UP=false`
- **Kein** `GF_UNIFIED_ALERTING_ENABLED` gesetzt (Default: `true` seit 9.x = aktiv)

### Existierende Provisioning-Struktur
```
docker/grafana/provisioning/
  datasources/
    datasources.yml          # Prometheus (uid: prometheus) + Loki (uid: loki)
  dashboards/
    dashboards.yml           # Provider-Config, Ordner "AutomationOne"
    system-health.json       # 6 Panels (siehe unten)
  alerting/                  # EXISTIERT NICHT - muss erstellt werden
```

### Dashboard-Panels (system-health.json)
| Panel | Typ | Datasource | Query |
|-------|-----|------------|-------|
| Server Health Status | stat | Prometheus | `up{job="el-servador"}` |
| MQTT Broker Status | stat | Prometheus | `god_kaiser_mqtt_connected` |
| Database Status | stat | Prometheus | `pg_up` |
| Frontend Log Activity | stat | Loki | `sum(count_over_time({compose_service="el-frontend"}[1m]))` |
| Log Volume by Service | timeseries | Loki | `sum(count_over_time({compose_project="auto-one"} [5m])) by (compose_service)` |
| Recent Error Logs | logs | Loki | `{compose_project="auto-one"} \|~ "(?i)(error\|exception\|fail\|critical)"` |

### Prometheus-Config
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'el-servador'      # /api/v1/health/metrics
  - job_name: 'postgres'          # postgres-exporter:9187
  - job_name: 'prometheus'        # self-monitoring

# KEINE rule_files konfiguriert
# KEIN Alertmanager konfiguriert
```

### Verfuegbare Custom Metriken (metrics.py)
| Metrik | Typ | Beschreibung | Update-Interval |
|--------|-----|-------------|-----------------|
| `god_kaiser_uptime_seconds` | Gauge | Server-Uptime | 15s (Scheduler) |
| `god_kaiser_cpu_percent` | Gauge | CPU-Auslastung | 15s |
| `god_kaiser_memory_percent` | Gauge | Memory-Auslastung | 15s |
| `god_kaiser_mqtt_connected` | Gauge | MQTT-Status (1/0) | 15s |
| `god_kaiser_esp_total` | Gauge | Registrierte ESP-Geraete | 15s |
| `god_kaiser_esp_online` | Gauge | Online ESP-Geraete | 15s |
| `god_kaiser_esp_offline` | Gauge | Offline ESP-Geraete | 15s |

Zusaetzlich exponiert der `prometheus-fastapi-instrumentator` automatisch:
- `http_requests_total` (Counter)
- `http_request_duration_seconds` (Histogram)
- `http_request_size_bytes` (Summary)
- `http_response_size_bytes` (Summary)

### Server Health-Endpoints
| Endpoint | Auth | Response-Felder | Alert-tauglich |
|----------|------|----------------|----------------|
| `GET /api/v1/health/` | Nein | status, version, uptime_seconds | Ja (via Prometheus up-Metrik) |
| `GET /api/v1/health/live` | Nein | alive: bool | Ja (Liveness) |
| `GET /api/v1/health/ready` | Nein | ready: bool, checks: {database, mqtt, disk_space} | **Ja - beste Basis** |
| `GET /api/v1/health/detailed` | **JWT** | database, mqtt, websocket, system (CPU/mem/disk) | Nein (Auth erforderlich) |
| `GET /api/v1/health/esp` | **JWT** | devices, online/offline counts | Nein (Auth erforderlich) |
| `GET /api/v1/health/metrics` | Nein | Prometheus text format | Ja (wird bereits gescraped) |

**Wichtig:** `/ready` prueft `database`, `mqtt`, `disk_space` einzeln und braucht KEIN JWT. Aber: Dieser Endpoint ist nicht direkt als Prometheus-Metrik verfuegbar - er muesste via Blackbox-Exporter oder die bestehenden Gauges genutzt werden.

---

## 2. Vorgeschlagene Alert-Rules (5 Rules)

### Rule 1: Server Down
| Feld | Wert |
|------|------|
| **Name** | `server-down` |
| **Severity** | critical |
| **Query (PromQL)** | `up{job="el-servador"} == 0` |
| **Threshold** | Boolean (0 = down) |
| **Evaluation Interval** | 15s |
| **For Duration** | 1m |
| **Beschreibung** | God-Kaiser Server ist nicht erreichbar. Prometheus kann `/api/v1/health/metrics` nicht scrapen. |
| **Dashboard-Referenz** | Panel "Server Health Status" nutzt dieselbe Metrik |

### Rule 2: MQTT Disconnected
| Feld | Wert |
|------|------|
| **Name** | `mqtt-disconnected` |
| **Severity** | critical |
| **Query (PromQL)** | `god_kaiser_mqtt_connected == 0` |
| **Threshold** | Boolean (0 = disconnected) |
| **Evaluation Interval** | 15s |
| **For Duration** | 1m |
| **Beschreibung** | MQTT-Broker-Verbindung verloren. Kein ESP32-Datenempfang moeglich. |
| **Dashboard-Referenz** | Panel "MQTT Broker Status" nutzt dieselbe Metrik |

### Rule 3: Database Down
| Feld | Wert |
|------|------|
| **Name** | `database-down` |
| **Severity** | critical |
| **Query (PromQL)** | `pg_up == 0` |
| **Threshold** | Boolean (0 = down) |
| **Evaluation Interval** | 15s |
| **For Duration** | 1m |
| **Beschreibung** | PostgreSQL ist nicht erreichbar (postgres-exporter meldet down). |
| **Dashboard-Referenz** | Panel "Database Status" nutzt dieselbe Metrik |

### Rule 4: High Memory Usage
| Feld | Wert |
|------|------|
| **Name** | `high-memory-usage` |
| **Severity** | warning |
| **Query (PromQL)** | `god_kaiser_memory_percent > 85` |
| **Threshold** | 85% (Server-Code nutzt 90% als "degraded") |
| **Evaluation Interval** | 1m |
| **For Duration** | 5m |
| **Beschreibung** | Server-Memory ueber 85%. Bei 90% meldet Health-Endpoint "degraded". Fruehwarnung. |

### Rule 5: ESP Devices Offline
| Feld | Wert |
|------|------|
| **Name** | `esp-devices-offline` |
| **Severity** | warning |
| **Query (PromQL)** | `god_kaiser_esp_offline > 0 and god_kaiser_esp_total > 0` |
| **Threshold** | Jedes Offline-Geraet bei registrierten Geraeten |
| **Evaluation Interval** | 1m |
| **For Duration** | 3m |
| **Beschreibung** | Mindestens ein registriertes ESP32-Geraet ist offline. |
| **Anmerkung** | `god_kaiser_esp_total > 0` verhindert False-Positives bei leerem System |

### Bewusst NICHT als Alert:
- **CPU-Usage:** Spikes sind normal, Gauges nur alle 15s - zu ungenau fuer Alerting
- **Frontend-Status (Loki):** Log-Abwesenheit != Ausfall. Kein zuverlaessiger Indikator
- **HTTP-Fehlerrate:** Zu wenig Traffic in Dev-Umgebung, wuerde zu viele False-Positives erzeugen

---

## 3. Provisioning-Strategie

### Ansatz: File-Provisioning (YAML)

Grafana 11.5.2 unterstuetzt vollstaendiges Alerting-Provisioning via YAML-Dateien unter `provisioning/alerting/`. Keine API noetig. Kein externer Service noetig.

**Quelle:** [Grafana Docs - File Provisioning](https://grafana.com/docs/grafana/latest/alerting/set-up/provision-alerting-resources/file-provisioning/)

### Dateien die erstellt werden muessen

```
docker/grafana/provisioning/alerting/
  alert-rules.yml         # 5 Alert-Rules
  contact-points.yml      # Webhook Contact-Point
  notification-policy.yml # Routing: alle Alerts -> Webhook
```

### Datei 1: `alert-rules.yml`

```yaml
apiVersion: 1

groups:
  - orgId: 1
    name: automationone-critical
    folder: AutomationOne
    interval: 15s
    rules:
      - uid: ao-server-down
        title: "Server Down"
        condition: A
        data:
          - refId: A
            relativeTimeRange:
              from: 60
              to: 0
            datasourceUid: prometheus
            model:
              expr: "up{job=\"el-servador\"}"
              intervalMs: 15000
              maxDataPoints: 43200
              refId: A
        noDataState: Alerting
        execErrState: Alerting
        for: 1m
        annotations:
          summary: "God-Kaiser Server ist nicht erreichbar"
          description: "Prometheus kann /api/v1/health/metrics nicht scrapen seit >1m"
        labels:
          severity: critical
          component: server

      - uid: ao-mqtt-disconnected
        title: "MQTT Disconnected"
        condition: B
        data:
          - refId: A
            relativeTimeRange:
              from: 60
              to: 0
            datasourceUid: prometheus
            model:
              expr: "god_kaiser_mqtt_connected"
              intervalMs: 15000
              maxDataPoints: 43200
              refId: A
          - refId: B
            datasourceUid: '__expr__'
            model:
              type: threshold
              conditions:
                - evaluator:
                    type: lt
                    params: [1]
                  operator:
                    type: and
                  query:
                    params: [A]
                  reducer:
                    type: last
              refId: B
        noDataState: Alerting
        execErrState: Alerting
        for: 1m
        annotations:
          summary: "MQTT-Broker Verbindung verloren"
          description: "god_kaiser_mqtt_connected == 0 seit >1m"
        labels:
          severity: critical
          component: mqtt

      - uid: ao-database-down
        title: "Database Down"
        condition: B
        data:
          - refId: A
            relativeTimeRange:
              from: 60
              to: 0
            datasourceUid: prometheus
            model:
              expr: "pg_up"
              intervalMs: 15000
              maxDataPoints: 43200
              refId: A
          - refId: B
            datasourceUid: '__expr__'
            model:
              type: threshold
              conditions:
                - evaluator:
                    type: lt
                    params: [1]
                  operator:
                    type: and
                  query:
                    params: [A]
                  reducer:
                    type: last
              refId: B
        noDataState: Alerting
        execErrState: Alerting
        for: 1m
        annotations:
          summary: "PostgreSQL nicht erreichbar"
          description: "postgres-exporter meldet pg_up == 0 seit >1m"
        labels:
          severity: critical
          component: database

  - orgId: 1
    name: automationone-warnings
    folder: AutomationOne
    interval: 1m
    rules:
      - uid: ao-high-memory
        title: "High Memory Usage"
        condition: B
        data:
          - refId: A
            relativeTimeRange:
              from: 300
              to: 0
            datasourceUid: prometheus
            model:
              expr: "god_kaiser_memory_percent"
              intervalMs: 15000
              maxDataPoints: 43200
              refId: A
          - refId: B
            datasourceUid: '__expr__'
            model:
              type: threshold
              conditions:
                - evaluator:
                    type: gt
                    params: [85]
                  operator:
                    type: and
                  query:
                    params: [A]
                  reducer:
                    type: last
              refId: B
        noDataState: OK
        execErrState: Alerting
        for: 5m
        annotations:
          summary: "Server Memory ueber 85%"
          description: "god_kaiser_memory_percent > 85 seit >5m. Bei 90% wird Status 'degraded'."
        labels:
          severity: warning
          component: server

      - uid: ao-esp-offline
        title: "ESP Devices Offline"
        condition: B
        data:
          - refId: A
            relativeTimeRange:
              from: 180
              to: 0
            datasourceUid: prometheus
            model:
              expr: "god_kaiser_esp_offline > 0 and god_kaiser_esp_total > 0"
              intervalMs: 15000
              maxDataPoints: 43200
              refId: A
          - refId: B
            datasourceUid: '__expr__'
            model:
              type: threshold
              conditions:
                - evaluator:
                    type: gt
                    params: [0]
                  operator:
                    type: and
                  query:
                    params: [A]
                  reducer:
                    type: last
              refId: B
        noDataState: OK
        execErrState: Alerting
        for: 3m
        annotations:
          summary: "ESP32-Geraete offline"
          description: "Mindestens ein registriertes ESP32-Geraet ist seit >3m offline"
        labels:
          severity: warning
          component: esp32
```

### Datei 2: `contact-points.yml`

```yaml
apiVersion: 1

contactPoints:
  - orgId: 1
    name: automationone-webhook
    receivers:
      - uid: ao-webhook
        type: webhook
        disableResolveMessage: false
        settings:
          url: "http://el-servador:8000/api/v1/health/alert-webhook"
          httpMethod: POST
          maxAlerts: 10
```

**Notification-Strategie:**
- **Webhook an den Server selbst** = minimaler Aufwand, kein externer Service
- Server kann Alerts in Audit-Log schreiben + via WebSocket ans Frontend pushen
- Webhook-Endpoint (`/api/v1/health/alert-webhook`) muss noch implementiert werden
- **Alternative (noch einfacher):** Grafana kann auch in ein Log-File schreiben oder einfach nur im Grafana-UI Alerts anzeigen (dann reicht die Notification-Policy ohne Contact-Point)

### Datei 3: `notification-policy.yml`

```yaml
apiVersion: 1

policies:
  - orgId: 1
    receiver: automationone-webhook
    group_by:
      - grafana_folder
      - alertname
    group_wait: 30s
    group_interval: 5m
    repeat_interval: 4h
    routes:
      - receiver: automationone-webhook
        matchers:
          - severity = critical
        group_wait: 10s
        group_interval: 1m
        repeat_interval: 1h
      - receiver: automationone-webhook
        matchers:
          - severity = warning
        group_wait: 1m
        group_interval: 5m
        repeat_interval: 4h
```

---

## 4. Notification-Kanal Optionen

| Option | Aufwand | Externer Service | Beschreibung |
|--------|---------|-----------------|-------------|
| **Grafana UI only** | Null | Nein | Alerts erscheinen nur im Grafana Alert-Panel. Kein Code noetig. |
| **Webhook -> Server** | Niedrig | Nein | Server empfaengt Alert-JSON, schreibt Audit-Log, pusht via WebSocket |
| **Webhook -> File** | Niedrig | Nein | Grafana schreibt in ein gemountetes Log-File |
| **Email (SMTP)** | Mittel | SMTP-Server | Braucht SMTP-Config in Grafana |
| **Slack/Discord** | Mittel | Ja | Braucht API-Token + External Access |

**Empfehlung: Zweistufig**
1. **Phase 1 (sofort):** Nur Grafana-UI Alerting. Alert-Rules + Notification-Policy ohne speziellen Contact-Point. Alerts sind in Grafana sichtbar + querybar.
2. **Phase 2 (spaeter):** Webhook-Endpoint im Server implementieren fuer Audit-Log + WebSocket-Push ans Dashboard.

---

## 5. Implementierungsschritte (Minimaler Aufwand)

### Phase 1: File-Provisioning (kein Code)
1. Ordner erstellen: `docker/grafana/provisioning/alerting/`
2. `alert-rules.yml` anlegen (wie oben)
3. `contact-points.yml` kann WEGGELASSEN werden fuer Phase 1
4. `notification-policy.yml` kann WEGGELASSEN werden fuer Phase 1
5. Grafana-Container neu starten
6. **Ergebnis:** 5 Alert-Rules aktiv in Grafana UI, Alerts sind sichtbar unter Grafana > Alerting

### Phase 2: Webhook-Integration (Code noetig)
1. `contact-points.yml` + `notification-policy.yml` anlegen
2. Server-Endpoint `POST /api/v1/health/alert-webhook` implementieren
3. Alert-Payload in `audit_log` Tabelle schreiben
4. WebSocket-Event `alert:fired` / `alert:resolved` ans Frontend pushen
5. Frontend-Notification-Toast bei Alert-Events anzeigen

### Kein Alertmanager noetig
Grafana 11.x hat einen eingebauten Alertmanager. Kein separater Prometheus Alertmanager-Container erforderlich. Keine `rule_files` in `prometheus.yml` noetig - die Evaluation passiert komplett in Grafana.

---

## 6. Offene Fragen / Risiken

| Frage | Relevanz |
|-------|----------|
| Soll Phase 1 (UI-only) oder direkt Phase 2 (Webhook) implementiert werden? | Entscheidung TM |
| Alert bei `god_kaiser_esp_offline > 0` koennte in Dev-Umgebung ohne ESP32 staendig feuern | `god_kaiser_esp_total > 0` Guard sollte das verhindern |
| `noDataState: Alerting` fuer Critical-Rules: Wenn Server down ist, fehlen Metriken = Alert | Gewuenscht - "kein Signal = Problem" |
| Grafana Provisioning-Volume ist `:ro` - Alerts koennen nicht aus der UI editiert werden | Gewuenscht fuer Infrastructure-as-Code, aber UI-Experimente sind blockiert |

---

## 7. Zusammenfassung

| Aspekt | Antwort |
|--------|---------|
| **Alert-Rules** | 5 Rules (3 critical, 2 warning) mit exakten PromQL-Queries auf bestehende Metriken |
| **Provisioning** | File-basiert unter `docker/grafana/provisioning/alerting/` (3 YAML-Dateien) |
| **Notification** | Phase 1: Grafana-UI only. Phase 2: Webhook -> Server -> Audit-Log + WebSocket |
| **Minimaler Aufwand** | 1 Ordner + 1 YAML-Datei + Container-Restart = funktionierendes Alerting |
| **Kein externer Service noetig** | Kein Alertmanager, kein SMTP, kein Slack |

**Quellen:**
- [Grafana File Provisioning Docs](https://grafana.com/docs/grafana/latest/alerting/set-up/provision-alerting-resources/file-provisioning/)
- [Grafana Provisioning Alerting Examples](https://github.com/grafana/provisioning-alerting-examples)
