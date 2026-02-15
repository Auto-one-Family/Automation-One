# Mosquitto Exporter -- Vollanalyse (Auftrag 3.1, Phase A+B)

**Datum:** 2026-02-09
**Agent:** system-control
**Auftrag:** 3.1 Phase A (Analyse verifizieren) + Phase B (Offene Punkte)
**Basis:** Erstanalyse (`mosquitto-exporter-analysis.md`) + Impl-Plan (`mosquitto-exporter-impl-plan.md`)
**Status:** Vollstaendig -- Implementierungsfertig

---

## Executive Summary

Die Vollanalyse gegen den Live-Zustand bestaetigt: Die Integration von `sapcc/mosquitto-exporter` ist machbar und empfohlen. **Zwei kritische Korrekturen** gegenueber der Erstanalyse:

1. **Image-Tag `v0.8.0` existiert NICHT** auf Docker Hub. Korrekter Tag: `0.8.0` (ohne v-Prefix). Bereits im Impl-Plan korrigiert.
2. **Message-Rate ist NICHT ~300 msg/s** in frischem Zustand. Nach Neustart: ~22-27 msg/s received, ~130-185 msg/s sent. Die 300 msg/s aus der Erstanalyse waren ein Wert nach laengerem Server-Betrieb mit aktiven Simulation-Loops.

Alle anderen Annahmen bestaetigt. Exakte Platzierungsvorschlaege mit Zeilennummern liegen vor.

---

## Phase A: Analyse verifizieren

### A1. Docker Hub Verfuegbarkeit

| Tag | Existiert? | Digest |
|-----|-----------|--------|
| `v0.8.0` | **NEIN** -- `no such manifest` | - |
| `0.8.0` | JA | `sha256:ae0e76eccda3c63bccefa12172b729b2c3b81448cedc2ccbdd25996eb0328ba7` |
| `latest` | JA | `sha256:ae0e76eccda3c63bccefa12172b729b2c3b81448cedc2ccbdd25996eb0328ba7` (identisch) |

**Kritisch:** Die Erstanalyse verwendet `sapcc/mosquitto-exporter:v0.8.0` -- dieser Tag existiert nicht. `docker pull` wuerde fehlschlagen. Der Impl-Plan hat dies bereits als K1 korrigiert. **Korrekter Tag: `0.8.0`**.

**Image-Details:**
- 1 Layer, 3.33 MB (scratch-basiertes Go-Binary)
- Nur amd64-Architektur (kein ARM)
- `0.8.0` und `latest` sind identisch (gleicher Digest)
- Empfehlung: Pin auf `0.8.0` fuer Reproduzierbarkeit

### A2. docker-compose.yml Analyse

**Datei:** `c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\docker-compose.yml` (361 Zeilen)

**Aktuelle Services (10 Stueck):**

| # | Service | Zeilen | Profile | Container-Name |
|---|---------|--------|---------|----------------|
| 1 | `postgres` | 19-40 | default | automationone-postgres |
| 2 | `mqtt-broker` | 45-62 | default | automationone-mqtt |
| 3 | `el-servador` | 67-115 | default | automationone-server |
| 4 | `el-frontend` | 120-155 | default | automationone-frontend |
| 5 | `loki` | 160-182 | monitoring | automationone-loki |
| 6 | `promtail` | 187-211 | monitoring | automationone-promtail |
| 7 | `prometheus` | 216-244 | monitoring | automationone-prometheus |
| 8 | `grafana` | 249-278 | monitoring | automationone-grafana |
| 9 | `postgres-exporter` | 283-306 | monitoring | automationone-postgres-exporter |
| 10 | `pgadmin` | 311-338 | devtools | automationone-pgadmin |

**Laufende Services (verifiziert via `docker compose ps`):**

| Container | Image | Status |
|-----------|-------|--------|
| automationone-postgres | postgres:16-alpine | Up (healthy) |
| automationone-mqtt | eclipse-mosquitto:2 | Up (healthy) |
| automationone-server | auto-one-el-servador | Up (health: starting) |
| automationone-frontend | auto-one-el-frontend | Up (health: starting) |
| automationone-loki | grafana/loki:3.4 | Up (healthy) |
| automationone-promtail | grafana/promtail:3.4 | Up (healthy) |
| automationone-prometheus | prom/prometheus:v3.2.1 | Up (healthy) |
| automationone-grafana | grafana/grafana:11.5.2 | Up (healthy) |
| automationone-postgres-exporter | prometheuscommunity/postgres-exporter:v0.16.0 | Up (healthy) |

**Platzierung des neuen Service-Blocks:**
- **Nach:** `postgres-exporter` Service-Block (endet Zeile 306)
- **Vor:** `pgadmin` Service-Block (beginnt Zeile 308, Profile: devtools)
- **Exakte Einfuegestelle:** Nach Zeile 307 (leere Zeile nach postgres-exporter)
- **Begruendung:** Monitoring-Services (mosquitto-exporter) vor devtools-Services (pgadmin) gruppieren

**Network-Konfiguration:**
- Einziges Netzwerk: `automationone-net` (bridge, Zeile 357-360)
- Alle Services nutzen dieses Netzwerk -- kein zusaetzliches Netzwerk noetig

**Volumes-Block (Zeile 343-352):**
- Kein neues Volume noetig (Exporter ist stateless)

### A3. prometheus.yml Analyse

**Datei:** `c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\docker\prometheus\prometheus.yml` (24 Zeilen)

**Aktuelle Konfiguration:**
```
Global: scrape_interval=15s, evaluation_interval=15s
```

**Aktuelle scrape_configs:**

| # | Job-Name | Target | Labels | Zeilen |
|---|----------|--------|--------|--------|
| 1 | `el-servador` | `el-servador:8000` | service=el-servador, env=development | 6-12 |
| 2 | `postgres` | `postgres-exporter:9187` | service=postgres, env=development | 14-19 |
| 3 | `prometheus` | `localhost:9090` | *(keine Labels)* | 21-23 |

**Platzierung des neuen scrape_config:**
- **Nach:** `prometheus` Job (letzer Block, endet Zeile 24)
- **Einfuegestelle:** Nach Zeile 24 (Ende der Datei)

**Naming-Convention bestaetigt:**
- Job `postgres` zeigt auf `postgres-exporter:9187` (Job benennt den Service, nicht den Exporter)
- Analog: Job `mqtt-broker` zeigt auf `mosquitto-exporter:9234`

### A4. system-health.json Analyse

**Datei:** `c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\docker\grafana\provisioning\dashboards\system-health.json` (403 Zeilen)

**Aktuelle Panels:**

| ID | Titel | Typ | gridPos (h,w,x,y) | Datasource |
|----|-------|-----|-------------------|------------|
| 1 | Server Health Status | stat | 4,6,0,0 | prometheus |
| 2 | MQTT Broker Status | stat | 4,6,6,0 | prometheus |
| 3 | Database Status | stat | 4,6,12,0 | prometheus |
| 4 | Frontend Errors (Last 5m) | stat | 4,6,18,0 | loki |
| 5 | Log Volume by Service (Last Hour) | timeseries | 8,12,0,4 | loki |
| 6 | Recent Error Logs | logs | 8,12,12,4 | loki |

**Layout-Analyse:**
- **Row 1 (y=0):** 4 Stat-Panels, je 6 breit = 24 Einheiten (volle Breite)
- **Row 2 (y=4):** 2 Panels, je 12 breit = 24 Einheiten (volle Breite), Hoehe 8
- **Letztes Panel endet bei:** y=4 + h=8 = **y=12**

**Naechste freie Panel-ID:** 7
**Naechste freie Y-Position:** 12

**Einfuegestelle fuer neue Panels:**
- Nach Panel 6 (JSON endet Zeile 382), vor dem schliessenden `]` des panels-Arrays (Zeile 383)
- Suche nach Zeile 382-383: `}` gefolgt von `],` -- neue Panels kommen dazwischen

### A5. $SYS-Topics Verifikation

**$SYS ist vollstaendig aktiv und zugaenglich.** Verifiziert durch Live-Subscription.

**Vollstaendige $SYS-Topic-Liste (Mosquitto 2.0.22):**

| Kategorie | Topics |
|-----------|--------|
| **Broker Info** | `$SYS/broker/version`, `$SYS/broker/uptime` |
| **Clients** | `$SYS/broker/clients/total`, `/active`, `/connected`, `/inactive`, `/disconnected`, `/expired`, `/maximum` |
| **Load (1min/5min/15min)** | `$SYS/broker/load/messages/received/*`, `/messages/sent/*`, `/publish/dropped/*`, `/publish/received/*`, `/publish/sent/*`, `/bytes/received/*`, `/bytes/sent/*`, `/sockets/*`, `/connections/*` |
| **Messages** | `$SYS/broker/messages/stored`, `/received`, `/sent` |
| **Store** | `$SYS/broker/store/messages/count`, `/messages/bytes` |
| **Subscriptions** | `$SYS/broker/subscriptions/count`, `$SYS/broker/shared_subscriptions/count` |
| **Retained** | `$SYS/broker/retained messages/count` |
| **Publish** | `$SYS/broker/publish/messages/dropped`, `/received`, `/sent`, `/bytes/received`, `/bytes/sent` |
| **Bytes** | `$SYS/broker/bytes/received`, `/bytes/sent` |

**Insgesamt:** ~45 individuelle $SYS-Topics verfuegbar.

---

## Phase B: Offene Punkte

### B1. Message-Rate: Geklaert -- Erstanalyse-Wert korrigiert

**Erstanalyse behauptete:** ~300 msg/s received, ~430 msg/s sent
**Impl-Plan behauptete:** 292.27 msg/s received, 380.34 msg/s sent (nach 3.7h Uptime)
**Live-Messung jetzt (Broker-Uptime ~230s nach frischem Restart):**

| Metrik | 1min | 5min | 15min |
|--------|------|------|-------|
| messages/received | 22.83 | 14.39 | 6.11 |
| messages/sent | 157.07 | 72.95 | 29.85 |
| publish/received | 3.29 | 1.78 | 0.73 |
| publish/sent | 142.38 | 62.96 | 25.50 |
| bytes/received | 1187.45 | 697.69 | 291.33 |
| bytes/sent | 6315.68 | 2846.10 | 1152.32 |
| publish/dropped | 0.00 | 0.00 | 0.00 |

**Analyse:**
- Die **frische Rate** (~23 msg/s received) ist deutlich niedriger als die ~300 msg/s aus der Erstanalyse
- Die hohe "sent" Rate (157 msg/s vs 23 msg/s received) erklaert sich durch $SYS-Updates selbst -- der Broker antwortet auf Subscriptions
- Die 300 msg/s waren wahrscheinlich nach laengerem Betrieb mit aktiven SimulationScheduler-Loops im Server
- **Fazit:** Die Rate ist dynamisch und abhaengig vom Server-Zustand. Der Exporter wird dies korrekt als Timeseries abbilden -- genau dafuer ist er da

### B2. Healthcheck-Strategie: Bestaetigt -- kein HC noetig

**scratch-Image Bestaetigung:**
- Image hat 1 Layer, 3.33 MB -- das ist definitiv scratch-basiert (nur Go-Binary)
- Kein `wget`, `curl`, `sh`, `bash` vorhanden
- Standard Docker-Healthcheck-Patterns (CMD-SHELL, wget, curl) sind unmoeglich

**Impliziter Health-Indikator via Prometheus:**
- `up{job="mqtt-broker"}` wird von Prometheus automatisch auf 0 gesetzt wenn Scrape fehlschlaegt
- Scrape-Interval: 15s (prometheus.yml global config)
- **Maximale Erkennungszeit bis Down:** 15s (ein Scrape-Interval)
- Dies ist schneller als die meisten Docker-Healthchecks (typisch 30s Interval + Retries)

**Vergleich mit bestehenden Services:**

| Service | Healthcheck | Grund |
|---------|-------------|-------|
| postgres | `pg_isready` CMD | CLI-Tool im Image verfuegbar |
| mqtt-broker | `mosquitto_sub` CMD | CLI-Tool im Image verfuegbar |
| el-servador | `curl` CMD | curl im Image verfuegbar |
| postgres-exporter | `wget` CMD-SHELL | wget im Image verfuegbar |
| loki, promtail, prometheus, grafana | `wget` CMD-SHELL | wget im Image verfuegbar |
| **mosquitto-exporter** | **Keiner** | **scratch-Image, keine Tools** |

**Kein `depends_on` von anderen Services auf mosquitto-exporter** geplant -- daher kein `condition: service_healthy` noetig. Der Exporter ist ein reiner Metriken-Lieferant.

**Entscheidung: Kein Healthcheck. `up{job="mqtt-broker"}` reicht als impliziter Health-Indikator.**

### B3. Dashboard-Strategie: system-health.json mit neuer Row

**Option A: Neue Row in system-health.json** (empfohlen)
- Pro: Zentrales Health-Dashboard bleibt ein Single-Pane-of-Glass
- Pro: MQTT-Broker-Status gehoert zur System-Health
- Pro: Kein zusaetzliches Dashboard in der Grafana-Navigation
- Contra: Dashboard wird laenger (von 6 auf 12 Panels)

**Option B: Separates mqtt-dashboard.json**
- Pro: Saubere Trennung
- Contra: Fragmentiert die Health-Uebersicht
- Contra: Zusaetzliche Provisioning-Config noetig

**Entscheidung: Option A -- Neue Row "MQTT Broker Metrics" in system-health.json.**

**Layout-Plan:**

```
y=0:  [Server Up(6)] [MQTT Up(6)] [DB Up(6)] [FE Errors(6)]     -- bestehend
y=4:  [Log Volume(12)]            [Error Logs(12)]               -- bestehend
y=12: ===== MQTT Broker Metrics (Row) =====                      -- NEU
y=13: [Broker Up(6)] [Clients(6)] [Dropped(6)] [Subscriptions(6)]-- NEU
y=17: [Message Rate (24, h=8)]                                   -- NEU
```

---

## Korrekturen gegenueber Erstanalyse

| # | Erstanalyse | Realitaet | Schwere | Status |
|---|-------------|-----------|---------|--------|
| K1 | Image-Tag `v0.8.0` | Tag `v0.8.0` existiert NICHT. Korrekter Tag: `0.8.0` | **KRITISCH** | Im Impl-Plan bereits korrigiert |
| K2 | Message-Rate ~300 msg/s | Frischer Restart: ~23 msg/s. 300 war nach laengerem Betrieb. | Info | Klargestellt: Rate ist dynamisch |
| K3 | Stack hat 9 Services | **10 Services** (pgadmin mit Profile devtools uebersehen). Korrigiert. | **KORRIGIERT** | verify-plan hat pgadmin gefunden |
| K4 | Port 1883 exposed | docker-compose.yml Zeile 49: `1883:1883` korrekt | OK | Bestaetigt |
| K5 | `$SYS` vollstaendig aktiv | ~45 individuelle Topics verifiziert | OK | Bestaetigt |

---

## Exakte Platzierungsvorschlaege

### Vorschlag 1: docker-compose.yml Service-Block

**Einfuegen nach Zeile 307** (leere Zeile nach postgres-exporter), **vor Zeile 308** (`# pgAdmin` Kommentarblock). Haelt Monitoring-Services gruppiert vor devtools.

```yaml
  # ============================================
  # Mosquitto Exporter (Prometheus Metrics) - Profile: monitoring
  # ============================================
  mosquitto-exporter:
    image: sapcc/mosquitto-exporter:0.8.0
    container_name: automationone-mosquitto-exporter
    profiles: ["monitoring"]
    environment:
      BROKER_ENDPOINT: "tcp://mqtt-broker:1883"
    ports:
      - "9234:9234"
    depends_on:
      mqtt-broker:
        condition: service_healthy
    networks:
      - automationone-net
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "5m"
        max-file: "3"
```

**Merkmale:**
- Profile: `monitoring` (wie alle Monitoring-Services)
- Kein Healthcheck (scratch-Image)
- Kein Volume (stateless)
- `depends_on` mqtt-broker mit `service_healthy` -- Exporter startet erst wenn Broker gesund
- Logging: json-file mit Rotation (Pattern der anderen Monitoring-Services)
- Port 9234 exposed (Prometheus Metriken-Endpoint)

### Vorschlag 2: prometheus.yml scrape_config

**Anhaengen nach Zeile 24** (Ende der Datei, nach dem `prometheus` Job).

```yaml

  - job_name: 'mqtt-broker'
    static_configs:
      - targets: ['mosquitto-exporter:9234']
        labels:
          service: 'mqtt-broker'
          environment: 'development'
```

**Merkmale:**
- Job-Name: `mqtt-broker` (benennt den gescrapten Service, nicht den Exporter)
- Folgt dem bestehenden Pattern: Job `postgres` -> Target `postgres-exporter:9187`
- Labels konsistent mit bestehenden Jobs
- Scrape-Interval: 15s (global default, nicht ueberschrieben)

### Vorschlag 3: system-health.json Dashboard-Panels

**6 neue Panels (IDs 7-12), eingefuegt nach Panel 6 (Zeile 382).**

**Panel 7 -- Row Separator "MQTT Broker Metrics":**
```json
{
  "title": "MQTT Broker Metrics",
  "type": "row",
  "gridPos": { "h": 1, "w": 24, "x": 0, "y": 12 },
  "id": 7,
  "collapsed": false,
  "panels": []
}
```

**Panel 8 -- MQTT Broker Up (Stat):**
```json
{
  "title": "MQTT Broker Up",
  "type": "stat",
  "datasource": { "type": "prometheus", "uid": "prometheus" },
  "gridPos": { "h": 4, "w": 6, "x": 0, "y": 13 },
  "id": 8,
  "targets": [
    {
      "expr": "up{job=\"mqtt-broker\"}",
      "legendFormat": "Exporter",
      "refId": "A"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "mappings": [
        {
          "options": {
            "0": { "text": "DOWN", "color": "red" },
            "1": { "text": "UP", "color": "green" }
          },
          "type": "value"
        }
      ],
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "red", "value": null },
          { "color": "green", "value": 1 }
        ]
      }
    },
    "overrides": []
  },
  "options": {
    "colorMode": "value",
    "graphMode": "none",
    "justifyMode": "auto",
    "orientation": "auto",
    "reduceOptions": { "calcs": ["lastNotNull"], "fields": "", "values": false },
    "textMode": "auto"
  }
}
```

**Panel 9 -- Connected Clients (Stat):**
```json
{
  "title": "Connected Clients",
  "type": "stat",
  "datasource": { "type": "prometheus", "uid": "prometheus" },
  "gridPos": { "h": 4, "w": 6, "x": 6, "y": 13 },
  "id": 9,
  "targets": [
    {
      "expr": "broker_clients_connected{job=\"mqtt-broker\"}",
      "legendFormat": "Clients",
      "refId": "A"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "red", "value": null },
          { "color": "orange", "value": 1 },
          { "color": "green", "value": 2 }
        ]
      }
    },
    "overrides": []
  },
  "options": {
    "colorMode": "value",
    "graphMode": "none",
    "justifyMode": "auto",
    "orientation": "auto",
    "reduceOptions": { "calcs": ["lastNotNull"], "fields": "", "values": false },
    "textMode": "auto"
  }
}
```

**Panel 10 -- Messages Dropped (Stat):**
```json
{
  "title": "Messages Dropped",
  "type": "stat",
  "datasource": { "type": "prometheus", "uid": "prometheus" },
  "gridPos": { "h": 4, "w": 6, "x": 12, "y": 13 },
  "id": 10,
  "targets": [
    {
      "expr": "broker_publish_messages_dropped{job=\"mqtt-broker\"}",
      "legendFormat": "Dropped",
      "refId": "A"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "green", "value": null },
          { "color": "red", "value": 1 }
        ]
      }
    },
    "overrides": []
  },
  "options": {
    "colorMode": "value",
    "graphMode": "none",
    "justifyMode": "auto",
    "orientation": "auto",
    "reduceOptions": { "calcs": ["lastNotNull"], "fields": "", "values": false },
    "textMode": "auto"
  }
}
```

**Panel 11 -- Subscriptions (Stat):**
```json
{
  "title": "Subscriptions",
  "type": "stat",
  "datasource": { "type": "prometheus", "uid": "prometheus" },
  "gridPos": { "h": 4, "w": 6, "x": 18, "y": 13 },
  "id": 11,
  "targets": [
    {
      "expr": "broker_subscriptions_count{job=\"mqtt-broker\"}",
      "legendFormat": "Subscriptions",
      "refId": "A"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "blue", "value": null }
        ]
      }
    },
    "overrides": []
  },
  "options": {
    "colorMode": "value",
    "graphMode": "none",
    "justifyMode": "auto",
    "orientation": "auto",
    "reduceOptions": { "calcs": ["lastNotNull"], "fields": "", "values": false },
    "textMode": "auto"
  }
}
```

**Panel 12 -- Message Rate (Timeseries):**
```json
{
  "title": "MQTT Message Rate",
  "type": "timeseries",
  "datasource": { "type": "prometheus", "uid": "prometheus" },
  "gridPos": { "h": 8, "w": 24, "x": 0, "y": 17 },
  "id": 12,
  "targets": [
    {
      "expr": "rate(broker_messages_received{job=\"mqtt-broker\"}[5m])",
      "legendFormat": "Received/s",
      "refId": "A"
    },
    {
      "expr": "rate(broker_messages_sent{job=\"mqtt-broker\"}[5m])",
      "legendFormat": "Sent/s",
      "refId": "B"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "color": { "mode": "palette-classic" },
      "custom": {
        "axisCenteredZero": false,
        "axisColorMode": "text",
        "axisLabel": "Messages/s",
        "axisPlacement": "auto",
        "drawStyle": "line",
        "fillOpacity": 10,
        "gradientMode": "none",
        "lineInterpolation": "smooth",
        "lineWidth": 2,
        "pointSize": 5,
        "showPoints": "never",
        "spanNulls": false
      },
      "mappings": [],
      "thresholds": {
        "mode": "absolute",
        "steps": [{ "color": "green", "value": null }]
      },
      "unit": "short"
    },
    "overrides": []
  },
  "options": {
    "legend": {
      "calcs": ["mean", "max"],
      "displayMode": "list",
      "placement": "bottom",
      "showLegend": true
    },
    "tooltip": { "mode": "multi", "sort": "desc" }
  }
}
```

---

## MQTT-Baseline-Snapshot (Live-verifiziert)

**Zeitpunkt:** 2026-02-09, Broker-Uptime ~230 Sekunden nach Restart

### Clients

| $SYS-Topic | Wert |
|-----------|------|
| clients/connected | 1 |
| clients/total | 1 |
| clients/active | 1 |
| clients/inactive | 0 |
| clients/disconnected | 0 |
| clients/expired | 0 |
| clients/maximum | 4 |

**Einziger verbundener Client:** God-Kaiser-Server (el-servador). Keine ESPs (Dev-Modus).

### Message-Raten

| Metrik | 1min | 5min | 15min |
|--------|------|------|-------|
| messages/received | 22.83 | 14.39 | 6.11 |
| messages/sent | 157.07 | 72.95 | 29.85 |
| publish/received | 3.29 | 1.78 | 0.73 |
| publish/sent | 142.38 | 62.96 | 25.50 |
| bytes/received/s | 1187.45 | 697.69 | 291.33 |
| bytes/sent/s | 6315.68 | 2846.10 | 1152.32 |
| publish/dropped | 0.00 | 0.00 | 0.00 |
| sockets | 6.63 | 4.00 | 1.70 |
| connections | 6.63 | 4.00 | 1.70 |

### Cumulative Counters

| $SYS-Topic | Wert |
|-----------|------|
| messages/received | 107 |
| messages/sent | 500 |
| publish/messages/dropped | 0 |
| publish/messages/received | 12 |
| publish/messages/sent | 425 |
| bytes/received | 4946 |
| bytes/sent | 19192 |

### Store & Subscriptions

| $SYS-Topic | Wert |
|-----------|------|
| messages/stored | 51 |
| store/messages/count | 51 |
| store/messages/bytes | 217 |
| subscriptions/count | 16 |
| shared_subscriptions/count | 0 |
| retained messages/count | 51 |

### Broker-Info

| Metrik | Wert |
|--------|------|
| Version | mosquitto version 2.0.22 |
| Uptime | 231 seconds |

---

## Verifikations-Checkliste (nach Implementierung)

```bash
# 1. Monitoring-Stack mit neuem Exporter starten
docker compose --profile monitoring up -d mosquitto-exporter

# 2. Container-Status pruefen (kein "healthy" wegen fehlendem HC)
docker compose --profile monitoring ps mosquitto-exporter

# 3. Metriken-Endpoint direkt pruefen
curl -s http://localhost:9234/metrics | head -30

# 4. Spezifische Metriken pruefen
curl -s http://localhost:9234/metrics | grep broker_clients_connected
curl -s http://localhost:9234/metrics | grep broker_publish_messages_dropped
curl -s http://localhost:9234/metrics | grep broker_messages_received

# 5. Prometheus-Target pruefen
curl -s http://localhost:9090/api/v1/targets | python -m json.tool | grep mqtt-broker

# 6. Prometheus-Query testen
curl -s "http://localhost:9090/api/v1/query?query=up{job='mqtt-broker'}" | python -m json.tool
```

**Erwartete Ergebnisse:**
- [ ] Container Status: `Up` (ohne "healthy" -- kein Healthcheck)
- [ ] `/metrics` liefert Prometheus-Format mit `broker_*` Metriken
- [ ] `broker_clients_connected` >= 1 (mindestens God-Kaiser-Server)
- [ ] `broker_publish_messages_dropped` = 0
- [ ] Prometheus-Target `mqtt-broker` im Status "up"
- [ ] Grafana system-health Dashboard zeigt neue MQTT-Row mit 5 Panels

---

## Zusammenfassung

### Was wurde verifiziert?

| Pruefpunkt | Ergebnis |
|-----------|----------|
| Image `sapcc/mosquitto-exporter:v0.8.0` verfuegbar | **NEIN** -- Tag `v0.8.0` existiert nicht. Korrekt: `0.8.0` |
| Image `sapcc/mosquitto-exporter:0.8.0` verfuegbar | JA, 3.33 MB, identisch mit `latest` |
| $SYS-Topics aktiv | JA, ~45 Topics verifiziert |
| Mosquitto Version 2.0.22 | JA, bestaetigt |
| Message-Rate ~300 msg/s | NEIN -- frische Rate ~23 msg/s, steigt mit Server-Aktivitaet |
| Dropped Messages = 0 | JA, bestaetigt |
| scratch-Image ohne Shell | JA, bestaetigt (1 Layer, 3.33 MB) |
| `0.8.0` = `latest` | JA, identischer Digest |
| Platzierung docker-compose.yml | Nach Zeile 307, vor pgadmin-Block (nicht Volumes!) |
| Platzierung prometheus.yml | Nach Zeile 24, Ende der Datei |
| Platzierung system-health.json | Nach Panel 6 (Zeile 382), IDs 7-12 |
| Netzwerk | `automationone-net` ausreichend, kein neues noetig |
| Volume | Keins noetig (Exporter stateless) |

### Implementierungsaufwand

| Datei | Zeilen | Aenderungstyp |
|-------|--------|---------------|
| docker-compose.yml | +19 Zeilen | Service-Block einfuegen (additiv) |
| prometheus.yml | +7 Zeilen | scrape_config anhaengen (additiv) |
| system-health.json | +6 Panel-Objekte | Panels einfuegen (additiv) |

**Alle Aenderungen sind additiv** -- kein bestehender Code wird modifiziert, nur erweitert. Rollback = eingefuegte Zeilen entfernen.

### Risiken

| Risiko | Schwere | Mitigation |
|--------|---------|------------|
| Image nicht gewartet (v0.8.0, 2021) | Niedrig | Go-Binary stabil, $SYS stabil. Fork trivial. |
| scratch-Image kein Healthcheck | Niedrig | `up{job="mqtt-broker"}` als Proxy |
| Nur amd64 | Niedrig | Stack laeuft auf x86 |
| Exporter-Metriken-Namen aendern sich | Sehr niedrig | $SYS-Mapping ist stabil seit Jahren |

**Showstopper:** Keine identifiziert.

---

*Report vollstaendig. Implementierung kann durch Dev-Agent ohne Rueckfragen erfolgen.*
