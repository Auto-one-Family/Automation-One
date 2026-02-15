# Mosquitto Exporter -- Verifikation & Implementierungsplan

**Datum:** 2026-02-09
**Auftrag:** 3.1 (Phase 2: Verify & Plan)
**Basis:** mosquitto-exporter-analysis.md (Erstanalyse)
**Status:** Implementierungsfertig

---

## 1. Verifikation der Erstanalyse

### 1.1 Korrekturen (Erstanalyse-Fehler)

| # | Erstanalyse behauptet | Realitaet | Schwere |
|---|----------------------|-----------|---------|
| **K1** | Image-Tag: `v0.8.0` | Tag heisst `0.8.0` (OHNE `v`-Prefix). `v0.8.0` existiert NICHT auf Docker Hub und wuerde `docker pull` fehlschlagen lassen. | **KRITISCH** |
| **K2** | Message-Rate ~300 msg/s "ungewoehnlich, Baseline nach Clean-Restart ermitteln" | Rate ist **konsistent** (jetzt 292.27 msg/s received, 380.34 msg/s sent). Kein Snapshot-Artefakt. Ursache: God-Kaiser-Server hat interne Publish-Loops (Heartbeat, Simulation, Status-Updates). | Niedrig (korrekte Baseline) |
| **K3** | Stack hat "9 Services" | Stack hat 9 service-Definitionen in docker-compose.yml. Korrekt. | Keins (war richtig) |

### 1.2 Bestaetigte Annahmen

| # | Annahme | Verifikation | Status |
|---|---------|-------------|--------|
| B1 | Mosquitto Version 2.0.22 | `$SYS/broker/version` = "mosquitto version 2.0.22" | OK |
| B2 | $SYS vollstaendig aktiv | Alle abgefragten $SYS-Topics liefern Werte | OK |
| B3 | Image auf Docker Hub | `docker pull sapcc/mosquitto-exporter:latest` erfolgreich, 3.33 MB | OK |
| B4 | Image-Version 0.8.0 | `--help` zeigt "VERSION: 0.8.0 (e268064), go1.17.2" | OK |
| B5 | Port 9234 | `--bind-address` default "0.0.0.0:9234" | OK |
| B6 | Env-Variable BROKER_ENDPOINT | `[$BROKER_ENDPOINT]` bestaetigt | OK |
| B7 | scratch-Image, kein Healthcheck moeglich | Image enthaelt nur Go-Binary, keine Shell | OK |
| B8 | `latest` und `0.8.0` identisch | Gleicher Digest: `sha256:241570341cd...` | OK |
| B9 | Dropped Messages = 0 | `$SYS/broker/publish/messages/dropped` = 0 | OK |
| B10 | Kein Eingriff in Mosquitto-Config noetig | Exporter liest nur $SYS via MQTT-Subscription | OK |

---

## 2. MQTT-Baseline-Snapshot

**Zeitpunkt:** 2026-02-09, Broker-Uptime 13431s (~3.7h)

### 2.1 Clients

| Metrik | $SYS-Topic | Wert |
|--------|-----------|------|
| Connected | `$SYS/broker/clients/connected` | **1** |
| Total | `$SYS/broker/clients/total` | **1** |
| Disconnected | (connected - total) | **0** |

**Einziger Client:** God-Kaiser-Server (el-servador). Keine ESPs verbunden (Dev-Modus ohne Hardware).

### 2.2 Message-Raten (1min Average)

| Metrik | $SYS-Topic | Wert |
|--------|-----------|------|
| Received | `$SYS/broker/load/messages/received/1min` | **292.27 msg/s** |
| Sent | `$SYS/broker/load/messages/sent/1min` | **380.34 msg/s** |
| Dropped | `$SYS/broker/publish/messages/dropped` | **0** |

**Analyse:** ~292 msg/s bei 1 Client ist die normale Server-Baseline. Der Server published intern:
- Heartbeat-Messages (zyklisch)
- SimulationScheduler-Updates (Mock-ESPs)
- Status-Broadcasts
- $SYS-Subscription-Responses erhoehen "sent" zusaetzlich

Dies ist der **Referenzwert fuer "nur Server, keine ESPs"**. Mit echten ESPs steigen beide Werte.

### 2.3 Store & Subscriptions

| Metrik | $SYS-Topic | Wert |
|--------|-----------|------|
| Messages Stored | `$SYS/broker/messages/stored` | **51** |
| Retained Messages | `$SYS/broker/retained messages/count` | **51** |
| Subscriptions | `$SYS/broker/subscriptions/count` | **16** |

### 2.4 Broker-Health

| Metrik | Wert |
|--------|------|
| Version | mosquitto 2.0.22 |
| Uptime | 13431 seconds |
| Dropped Messages | 0 |

---

## 3. Offene Punkte -- Entscheidungen

### 3.1 Message-Rate: Geklaert

Die ~300 msg/s sind die **stabile Server-Baseline**, kein Artefakt. Der Exporter wird diesen Wert korrekt als `broker_load_messages_received_1min` exportieren. Mit ESPs wird der Wert proportional steigen -- ideal fuer Fleet-Health-Monitoring.

### 3.2 Healthcheck: Kein Workaround noetig

**Entscheidung: Kein Healthcheck fuer mosquitto-exporter.**

Begruendung:
- scratch-Image hat keine Shell/wget/curl -- Standard-Pattern unmoeglich
- `up{job="mqtt-broker"}` in Prometheus ist der implizite Health-Indikator (scraped alle 15s)
- `depends_on: mqtt-broker: condition: service_healthy` stellt sicher, dass der Exporter erst nach dem Broker startet
- Das bestehende `postgres-exporter` hat einen Healthcheck weil dessen Image wget enthaelt -- kein Widerspruch

Folgt dem Pattern: Healthcheck nur wenn Image es unterstuetzt.

### 3.3 Dashboard-Strategie: In system-health.json, neue Row

**Entscheidung: MQTT-Panels in system-health.json einfuegen (keine separate Datei).**

Begruendung:
- system-health.json ist das zentrale Health-Dashboard -- MQTT-Broker-Health gehoert dazu
- Eine Row "MQTT Broker Metrics" separiert visuell von den bestehenden Panels
- 4 Tier-1-Panels (3 Stats + 1 Timeseries) sind kompakt genug
- Separates Dashboard wuerde Navigation erfordern und den Ueberblick fragmentieren

### 3.4 Image-Tag: `0.8.0` statt `latest`

**Entscheidung: Pinned auf `0.8.0`.**

Begruendung:
- `latest` und `0.8.0` sind identisch (gleicher Digest)
- Explicit Pinning verhindert ueberraschende Updates
- Folgt dem Pattern der anderen Services (`postgres:16-alpine`, `prom/prometheus:v3.2.1`, etc.)

---

## 4. Implementierungsplan

### 4.1 Uebersicht

| Schritt | Datei | Aenderung |
|---------|-------|-----------|
| 1 | `docker-compose.yml` | Service-Block einfuegen (nach Zeile 306) |
| 2 | `docker/prometheus/prometheus.yml` | scrape_config einfuegen (nach Zeile 23) |
| 3 | `docker/grafana/provisioning/dashboards/system-health.json` | 5 Panels einfuegen (IDs 7-11) |
| 4 | Verifikation | Container starten, Metriken pruefen |

### 4.2 Schritt 1: docker-compose.yml

**Einfuegen nach Zeile 306** (nach dem letzten logging-Block von postgres-exporter, VOR der leeren Zeile und dem Volumes-Kommentar bei Zeile 308).

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

**Kein Healthcheck** (scratch-Image, siehe 3.2).
**Kein Volume** (Exporter ist stateless, liest nur $SYS via MQTT).

**Edit-Anweisung fuer Dev-Agent:**
```
old_string (Zeile 307-308):

# ============================================
# Volumes

new_string:

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

# ============================================
# Volumes
```

### 4.3 Schritt 2: docker/prometheus/prometheus.yml

**Einfuegen nach Zeile 23** (nach dem letzten scrape_config-Block `prometheus`).

```yaml

  - job_name: 'mqtt-broker'
    static_configs:
      - targets: ['mosquitto-exporter:9234']
        labels:
          service: 'mqtt-broker'
          environment: 'development'
```

**Job-Name:** `mqtt-broker` (benennt den gescrapten Service, nicht den Exporter -- analog zu `postgres` Job der auf `postgres-exporter:9187` zeigt).

**Edit-Anweisung fuer Dev-Agent:**
```
old_string (Zeile 21-23):
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

new_string:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'mqtt-broker'
    static_configs:
      - targets: ['mosquitto-exporter:9234']
        labels:
          service: 'mqtt-broker'
          environment: 'development'
```

### 4.4 Schritt 3: docker/grafana/provisioning/dashboards/system-health.json

**Einfuegen nach dem letzten Panel (ID 6, "Recent Error Logs")** -- vor dem schliessenden `]` der panels-Array.

5 neue Panels (IDs 7-11):

**Panel 7 -- Row Separator:**
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
      "legendFormat": "Broker",
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

**Panel 9 -- Connected Clients / ESP Fleet Health (Stat):**
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

**Panel 11 -- Message Rate (Timeseries):**
```json
{
  "title": "MQTT Message Rate",
  "type": "timeseries",
  "datasource": { "type": "prometheus", "uid": "prometheus" },
  "gridPos": { "h": 8, "w": 24, "x": 0, "y": 17 },
  "id": 11,
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

**Edit-Anweisung fuer Dev-Agent:**

Die 5 Panel-Objekte werden als Komma-separierte JSON-Objekte nach dem letzten Panel (ID 6) eingefuegt. Suche nach dem schliessenden `}` von Panel 6 (Zeile 401) und fuege die neuen Panels vor dem `]` bei Zeile 402 ein.

```
old_string:
      }
    }
  ],
  "schemaVersion": 39,

new_string:
      }
    },
    {PANEL_7_JSON},
    {PANEL_8_JSON},
    {PANEL_9_JSON},
    {PANEL_10_JSON},
    {PANEL_11_JSON}
  ],
  "schemaVersion": 39,
```

(Dev-Agent muss die vollstaendigen Panel-JSON-Bloecke von oben einsetzen.)

### 4.5 Schritt 4: Verifikation

Nach der Implementierung folgende Commands ausfuehren:

```bash
# 1. Monitoring-Stack mit neuem Exporter starten
docker compose --profile monitoring up -d mosquitto-exporter

# 2. Pruefen ob Container laeuft
docker compose --profile monitoring ps mosquitto-exporter

# 3. Metriken-Endpoint direkt pruefen
curl -s http://localhost:9234/metrics | head -30

# 4. Spezifische Metriken pruefen
curl -s http://localhost:9234/metrics | grep broker_clients_connected
curl -s http://localhost:9234/metrics | grep broker_publish_messages_dropped
curl -s http://localhost:9234/metrics | grep broker_messages_received

# 5. Prometheus-Target pruefen (Prometheus muss laufen)
curl -s http://localhost:9090/api/v1/targets | python -m json.tool | grep mqtt-broker

# 6. Prometheus-Query testen
curl -s "http://localhost:9090/api/v1/query?query=up{job='mqtt-broker'}" | python -m json.tool
```

**Erwartete Ergebnisse:**
- Container Status: `Up` (ohne Healthcheck, daher kein "healthy")
- `/metrics` liefert Prometheus-Format mit `broker_*` Metriken
- `broker_clients_connected` >= 1 (mindestens God-Kaiser-Server)
- `broker_publish_messages_dropped` = 0
- Prometheus-Target `mqtt-broker` im Status "up"
- Grafana-Dashboard zeigt neue MQTT-Row mit 4 Panels

---

## 5. Implementierungs-Reihenfolge

| # | Aktion | Dateien | Risiko |
|---|--------|---------|--------|
| 1 | Service-Block in docker-compose.yml einfuegen | `docker-compose.yml` | Niedrig (additiv) |
| 2 | scrape_config in prometheus.yml einfuegen | `docker/prometheus/prometheus.yml` | Niedrig (additiv) |
| 3 | Dashboard-Panels in system-health.json einfuegen | `docker/grafana/provisioning/dashboards/system-health.json` | Niedrig (additiv) |
| 4 | Monitoring-Stack neustarten | - | Niedrig |
| 5 | Verifikation durchfuehren | - | Keins |

**Alle Aenderungen sind additiv** -- kein bestehender Code wird modifiziert, nur erweitert. Rollback = Zeilen entfernen.

---

## 6. Zusammenfassung

### Erstanalyse-Korrekturen

- **KRITISCH:** Image-Tag ist `0.8.0`, NICHT `v0.8.0`. Erstanalyse-Fehler haette Build gebrochen.
- **INFO:** Message-Rate ~300 msg/s ist stabile Server-Baseline, kein Artefakt.

### Entscheidungen

- **Image:** `sapcc/mosquitto-exporter:0.8.0` (pinned)
- **Healthcheck:** Keiner (scratch-Image). `up{job="mqtt-broker"}` als Proxy.
- **Dashboard:** In system-health.json, neue Row "MQTT Broker Metrics" mit 4 Tier-1-Panels.
- **Job-Name:** `mqtt-broker` (benennt den Service, nicht den Exporter).

### MQTT-Baseline (Referenzwerte VOR Exporter)

| Metrik | Wert | Bedeutung |
|--------|------|-----------|
| Clients connected | 1 | Nur God-Kaiser-Server |
| Messages received/s | 292.27 | Server-interne Publish-Loops |
| Messages sent/s | 380.34 | Received + $SYS-Responses |
| Messages dropped | 0 | Kein Datenverlust |
| Subscriptions | 16 | Server-Handler-Subscriptions |
| Stored messages | 51 | Retained Messages |
| Broker uptime | 13431s | ~3.7h seit letztem Restart |

### Verifikations-Checkliste

- [ ] `docker compose --profile monitoring ps` zeigt mosquitto-exporter als "Up"
- [ ] `curl http://localhost:9234/metrics` liefert `broker_*` Metriken
- [ ] `broker_clients_connected` >= 1
- [ ] `broker_publish_messages_dropped` = 0
- [ ] Prometheus-Target `mqtt-broker` Status "up"
- [ ] Grafana system-health Dashboard zeigt MQTT-Row

---

*Implementierungsplan vollstaendig. Dev-Agent kann ohne Rueckfragen umsetzen.*
