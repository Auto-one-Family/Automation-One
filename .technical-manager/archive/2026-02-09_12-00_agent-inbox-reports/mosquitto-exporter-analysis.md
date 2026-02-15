# Mosquitto Exporter -- Erstanalyse

**Datum:** 2026-02-09
**Auftrag:** 3.1 (mosquitto_exporter Erstanalyse)
**Typ:** Analyse (kein Code)
**Agents:** mqtt-debug, system-control, general-purpose (Web-Recherche)
**Status:** Abgeschlossen -- Go/No-Go-Entscheidung moeglich

---

## Executive Summary

Der Mosquitto-Broker (Eclipse Mosquitto 2.0.22) liefert **umfangreiche `$SYS`-Metriken nativ**. Der Prometheus-Exporter `sapcc/mosquitto-exporter` ist der klare Kandidat: Zero-Config, 3.2 MB Image, ~5-10 MB RAM, passt exakt in den bestehenden Monitoring-Stack. **Ein Healthcheck-Workaround ist noetig** (scratch-Image hat kein wget/curl). Integration: ~20 Zeilen docker-compose + ~6 Zeilen Prometheus-Config.

**Empfehlung: Go.** Niedriger Aufwand, hoher Mehrwert (ESP32-Fleet-Gesundheit, Message-Loss-Detection).

---

## 1. Broker IST-Zustand

### 1.1 Mosquitto-Konfiguration

| Setting | Wert | Hinweis |
|---------|------|---------|
| **Version** | mosquitto 2.0.22 | Image: `eclipse-mosquitto:2` |
| **Listener** | 1883 (MQTT), 9001 (WebSocket) | Dual-Protocol |
| **Auth** | `allow_anonymous true` | DEV ONLY |
| **Persistence** | `true` | Volume: `automationone-mosquitto-data` |
| **Max Inflight** | 20 | QoS 1/2 Flow Control |
| **Max Queued** | 1000 | Ausreichend fuer ESP32-Fleet |
| **Max Message Size** | 256 KB | Groesste Payloads: Config ~5KB |
| **Logging** | Alle Levels, file + stdout | Verbose (Dev) |
| **ACL** | Keine | Kein `acl_file` konfiguriert |

**Security-Status:** Development-Config. Production braucht: `allow_anonymous false`, password_file, acl_file, TLS.

### 1.2 Docker-Service

| Aspekt | Wert |
|--------|------|
| Service | `mqtt-broker` |
| Container | `automationone-mqtt` |
| Profile | *(default)* -- Core-Service |
| Ports | `1883:1883`, `9001:9001` |
| Netzwerk | `automationone-net` (bridge) |
| Healthcheck | `mosquitto_sub -t $SYS/# -C 1 -i healthcheck -W 3` |
| Depends On | Keine (Base-Service) |

### 1.3 $SYS-Topics: Verfuegbar und Uneingeschraenkt

`$SYS/#` ist **vollstaendig aktiv** -- bestaetigt durch:
- Mosquitto 2.x Default-Verhalten (automatisch aktiv)
- Healthcheck subscribed bereits auf `$SYS/#`
- Keine ACL blockiert den Zugriff

### 1.4 Live-Metriken (Snapshot)

**Clients:**
| Metrik | Wert |
|--------|------|
| connected | 1 |
| total | 1 |
| maximum (seit Start) | 2 |
| disconnected | 0 |

**Message-Raten (1min Average):**
| Metrik | Wert |
|--------|------|
| messages/received | ~300 msg/s |
| messages/sent | ~430 msg/s |
| publish/dropped | **0** (kein Loss) |
| bytes/received | ~76.6 KB/s |
| bytes/sent | ~78.3 KB/s |

**Store:**
| Metrik | Wert |
|--------|------|
| messages stored | 51 |
| store bytes | 265 |
| subscriptions | 16 |

**Hinweis:** Die hohe Message-Rate (~300 msg/s) bei nur 1 Client deutet auf laufende Mock/Simulation oder Server-interne Publish-Loops hin. Baseline nach Clean-Restart ermitteln.

---

## 2. Exporter-Empfehlung

### 2.1 Kandidaten-Vergleich

| Exporter | Typ | Sprache | Liest $SYS? | Maintenance | Empfehlung |
|----------|-----|---------|-------------|-------------|------------|
| **sapcc/mosquitto-exporter** | Broker-Metriken | Go | **Ja** | Low (v0.8.0, 2021) | **Empfohlen** |
| kpetremann/mqtt-exporter | Payload-Konverter | Python | Nein | Aktiv (v1.10.0, 2026) | Anderer Zweck |
| hikhvar/mqtt2prometheus | Payload-Konverter | Go | Nein | Moderat | Anderer Zweck |
| ypbind/prometheus-mosquitto-exporter | Broker-Metriken | Rust | Ja | Gering | Kein Docker-Image |
| pfinal/... | Broker-Metriken | PHP | Ja | Inaktiv | Nicht empfohlen |

**Ergebnis:** `sapcc/mosquitto-exporter` ist der **einzige ernstzunehmende `$SYS`-Exporter** mit Docker-Image. Die Alternativen (kpetremann, hikhvar) exportieren MQTT-Payloads als Prometheus-Metriken -- ein komplett anderer Anwendungsfall (Sensor-Daten direkt als Prometheus-Metriken, was bei uns der Server bereits ueber Instrumentator macht).

### 2.2 sapcc/mosquitto-exporter im Detail

| Eigenschaft | Wert |
|-------------|------|
| **GitHub** | github.com/sapcc/mosquitto-exporter |
| **Image** | `sapcc/mosquitto-exporter:v0.8.0` (Docker Hub) |
| **Image-Groesse** | 3.2 MB (scratch-basiert, Go-Binary only) |
| **RAM** | ~5-10 MB |
| **CPU** | Vernachlaessigbar |
| **Port** | 9234 (`/metrics` Endpoint) |
| **Config** | 1 Env-Variable: `BROKER_ENDPOINT=tcp://mqtt-broker:1883` |
| **Mosquitto 2.x** | Kompatibel (bestaetigt) |
| **Auth** | Optional: `MQTT_USER`, `MQTT_PASS`, `MQTT_CERT`, `MQTT_KEY` |

**Maintenance-Risiko:** Niedrig. Go-Binaries sind langzeitstabil, `$SYS`-Schnittstelle unveraendert seit Jahren, Code ist ~300 Zeilen. Fork trivial bei Bedarf.

### 2.3 Exportierte Metriken

**Counter (monoton steigend):**
- `broker_bytes_received` / `broker_bytes_sent`
- `broker_messages_received` / `broker_messages_sent`
- `broker_publish_messages_received` / `_sent` / `_dropped`
- `broker_uptime`
- `broker_clients_maximum` / `_total`

**Gauges (aktueller Wert):**
- `broker_clients_connected` / `_disconnected`
- `broker_subscriptions_count`
- `broker_messages_stored` / `_inflight`
- `broker_heap_current_size` / `_maximum_size`
- `broker_retained_messages_count`
- `broker_load_messages_received_1min` (und 5min, 15min)

---

## 3. Integration in Docker-Stack

### 3.1 Aktueller Stack (9 Services)

| # | Service | Profile | Zweck |
|---|---------|---------|-------|
| 1 | postgres | default | Database |
| 2 | mqtt-broker | default | MQTT Broker |
| 3 | el-servador | default | FastAPI Server |
| 4 | el-frontend | default | Vue 3 Dashboard |
| 5 | loki | monitoring | Log-Aggregation |
| 6 | promtail | monitoring | Log-Shipping |
| 7 | prometheus | monitoring | Metriken-Sammlung |
| 8 | grafana | monitoring | Dashboards |
| 9 | postgres-exporter | monitoring | DB-Metriken |

**Nach Integration:** 10 Services (+ mosquitto-exporter im `monitoring` Profile).

### 3.2 Docker-Compose Skizze

```yaml
mosquitto-exporter:
  image: sapcc/mosquitto-exporter:v0.8.0
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

**Wichtig -- Healthcheck-Problem:** Das `scratch`-Image enthaelt **kein wget, curl oder Shell**. Standard-Healthcheck-Pattern (`wget --spider`) funktioniert NICHT. Optionen:
1. **Healthcheck weglassen** -- Prometheus-Scrape dient als impliziter Health-Indikator
2. **Alpine-basiertes Image bauen** -- ermoeglichen Healthcheck, aber erhoehte Maintenance
3. **Exporter mit `--bind-address`** testen ob Port-Probe reicht

**Empfehlung:** Option 1 (kein Healthcheck). Folgt dem KISS-Prinzip. Prometheus scrapt alle 15s -- wenn Metrics fehlen, sieht man das sofort im Dashboard (`up{job="mqtt-broker"} == 0`).

### 3.3 Prometheus-Config Ergaenzung

```yaml
- job_name: 'mqtt-broker'
  static_configs:
    - targets: ['mosquitto-exporter:9234']
      labels:
        service: 'mqtt-broker'
        environment: 'development'
```

**Job-Name:** `mqtt-broker` (nicht `mosquitto` oder `mosquitto-exporter`). Folgt dem Pattern: Job benennt den **gescrapten Service**, nicht den Exporter. Analog: Job `postgres` zeigt auf `postgres-exporter:9187`.

### 3.4 Netzwerk

Kein zusaetzliches Netzwerk noetig. `automationone-net` verbindet bereits alle Services. Exporter braucht:
- `mqtt-broker:1883` (MQTT-Subscription auf `$SYS/#`)
- Erreichbar von `prometheus` (Scrape auf Port 9234)

### 3.5 Kosten der Integration

| Aspekt | Aufwand |
|--------|---------|
| docker-compose.yml | ~15 Zeilen (1 Service-Block) |
| prometheus.yml | ~6 Zeilen (1 scrape_config) |
| Grafana Dashboard | 4-6 neue Panels (oder Grafana Dashboard 17721 importieren) |
| Container-Ressourcen | 3.2 MB Disk, ~5-10 MB RAM, ~0% CPU |
| Konfigurationsaenderungen an Mosquitto | **Keine** |
| Maintenance | Gering (Image pinnen, selten Updates) |

---

## 4. Dashboard-Panel Empfehlung

### 4.1 Tier 1: Kritisch (Haupt-Panels)

| Panel | Metrik | Typ | Zweck |
|-------|--------|-----|-------|
| **ESP32 Fleet Health** | `broker_clients_connected` | Stat | Anzahl verbundener ESPs. Soll vs. Ist sofort sichtbar. |
| **Message Rate** | `rate(broker_messages_received[5m])` | Timeseries | Sensor-Datenfluss. Abfall = Sensor/ESP-Ausfall. |
| **Messages Dropped** | `broker_publish_messages_dropped` | Stat (Alert) | **Muss immer 0 sein.** Jeder Drop = Datenverlust. |
| **MQTT Broker Up** | `up{job="mqtt-broker"}` | Stat | Exporter erreichbar = Broker laeuft. |

### 4.2 Tier 2: Wichtig (Sekundaere Panels)

| Panel | Metrik | Typ | Zweck |
|-------|--------|-----|-------|
| **Subscriptions** | `broker_subscriptions_count` | Stat | Handler-Coverage, Anomalie-Erkennung |
| **Inflight Messages** | `broker_messages_inflight` | Gauge | Backpressure-Indikator (QoS>0) |
| **Stored Messages** | `broker_messages_stored` | Gauge | Retained + Queue. Wachstum = Problem. |
| **Bandwidth** | `rate(broker_bytes_received[5m])` | Timeseries | Netzwerk-Throughput |

### 4.3 Tier 3: Diagnostik

| Panel | Metrik | Typ | Zweck |
|-------|--------|-----|-------|
| **Broker Uptime** | `broker_uptime` | Stat | Unerwartete Restarts erkennen |
| **Heap Usage** | `broker_heap_current_size` | Timeseries | Memory-Leak-Detection |
| **Max Clients** | `broker_clients_maximum` | Stat | Peak seit Broker-Start |

### 4.4 Bestehende Panels: Anpassung

**Panel 2 ("MQTT Broker Status")** zeigt aktuell `god_kaiser_mqtt_connected` -- eine **Server-seitige Gauge**. Mit dem Exporter koennte dieses Panel ersetzt oder ergaenzt werden:
- Alt: "Ist der Server mit dem Broker verbunden?" (Server-Perspektive)
- Neu: "Wie viele Clients sind mit dem Broker verbunden?" (Broker-Perspektive)

---

## 5. Risiken und Showstopper

| Risiko | Schwere | Beschreibung | Mitigation |
|--------|---------|-------------|------------|
| **Image nicht gewartet** | Niedrig | Letzte Release v0.8.0 (2021). Aber: Go-Binary stabil, `$SYS` stabil. | Pin auf v0.8.0, Fork bei Bedarf |
| **scratch-Image kein Healthcheck** | Niedrig | Kein wget/curl im Container. | Healthcheck weglassen, `up{}` als Proxy |
| **Nur amd64** | Niedrig | Kein ARM-Image. Stack laeuft auf x86. | Selbst bauen bei ARM-Bedarf |
| **Docker Hub Image-Tag** | Mittel | `:latest` koennte veraltet sein. | Explizit `:v0.8.0` pinnen |
| **Anonymous Auth** | Keins (Dev) | Exporter nutzt anonymous MQTT. Passt zu Dev-Config. | Production: MQTT-User fuer Exporter |

**Showstopper:** Keine identifiziert.

---

## 6. Zusammenfassung fuer Go/No-Go

### Was bekommen wir?

- **ESP32-Fleet-Gesundheit in Echtzeit** (nicht nur Server-seitig via DB-Query alle 15s)
- **Message-Loss-Detection** (publish_dropped muss 0 sein)
- **Broker-Performance-Baseline** (Message-Rates, Bandwidth, Heap)
- **Alerting-Grundlage** fuer Auftrag 3-2 (Grafana Alerting)

### Was kostet es?

- ~15 Zeilen docker-compose + ~6 Zeilen prometheus.yml
- 3.2 MB Disk + ~5-10 MB RAM
- Kein Eingriff in Mosquitto-Config
- ~30 Minuten Implementierung + Dashboard-Panels

### Empfehlung

**Go.** Der `sapcc/mosquitto-exporter` ist der einzige ernstzunehmende Kandidat fuer Broker-Metriken via `$SYS`. Die Integration ist minimal-invasiv und schliesst den groessten Blind Spot im aktuellen Monitoring-Stack: den MQTT-Broker.

---

*Dieser Report dient als Entscheidungsgrundlage. Implementierung erfolgt nach Go-Entscheidung durch den TM.*
