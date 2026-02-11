# AutomationOne – Infrastructure SOLL-Referenz v3.1
# ================================================
# Datum: 2026-02-09
# Version: 3.1 (v3 + LIVE-Verifizierung gegen echtes System)
# Quellen: Docker Best Practices 2025/2026, Prometheus/Grafana/Loki Production Patterns,
#          Mosquitto Security Docs, IoT Greenhouse Architecture (MING Stack, 5-Layer),
#          WSL2/Docker Desktop Networking, Hyper-V Firewall
# Verifiziert: 2026-02-09 22:00 UTC - verify-plan + system-control gegen laufenden Stack
# Zweck: Professionelle Referenzarchitektur für IST/SOLL-Vergleich
#
# VERWENDUNG: Dieses Dokument enthält sowohl SOLL-Referenz als auch verifizierte
# IST-Daten (markiert mit 🔴🟡🟢). Problemzonen sind klar markiert.
#
# LEGENDE:
# 🔴 PROBLEM  = Echtes Problem, sofort handeln
# 🟡 WARNUNG  = Risiko, vor Production beheben
# 🟢 OK       = Verifiziert, kein Handlungsbedarf

---

# TEIL 0: PROJEKTKONTEXT

## 0.1 Was ist AutomationOne?

IoT-Framework für Gewächshausautomation. Server-zentrische Architektur:

```
El Frontend (Vue 3) ←HTTP/WS→ El Servador (FastAPI) ←MQTT→ El Trabajante (ESP32)
Dashboard :5173                ALLE Intelligenz :8000          Dumme Agenten MQTT:1883
```

**Kernprinzip:** ESP32 = dumme Agenten. ALLE Logik auf dem Server. NIEMALS Business-Logic auf ESP32.

**Vergleich mit Branchenstandard (MING-Stack):**
| Aspekt | MING-Stack (Branche) | AutomationOne | Bewertung |
|--------|---------------------|---------------|-----------|
| Message Broker | MQTT (Mosquitto) | MQTT (Mosquitto) | ✅ Identisch |
| Datenbank | InfluxDB (Time-Series) | PostgreSQL (Relational) | ⚠️ Abweichung, aber valide für multi-purpose |
| Flow Processing | Node-RED (visual) | FastAPI (Python, code-basiert) | ✅ Besser für komplexe Logik, wartbarer |
| Visualization | Grafana | Vue 3 Custom Dashboard + Grafana (Monitoring) | ✅ Besser: eigenes Dashboard + Grafana für Ops |
| Firmware | Arduino/ESP-IDF direkt | PlatformIO/C++ | ✅ Professioneller |
| Architektur-Muster | 5-Layer (Sensor/Control/Actuator/Comm/Viz) | 3-Tier (Frontend/Backend/Firmware) + Monitoring | ✅ Klarer, weniger Kopplung |

**Fazit:** AutomationOne weicht bewusst vom MING-Stack ab zugunsten professionellerer, code-basierter Architektur. PostgreSQL statt InfluxDB ist bewusste Entscheidung für relationale Daten (Geräteregistrierung, Konfiguration, User-Management).

## 0.2 AutomationOne Monorepo – Dateibaum

```
Auto-one/
│
├── El Servador/                      # BACKEND (FastAPI/Python)
│   ├── Dockerfile
│   └── god_kaiser_server/src/        # Server-Quellcode (TM VERBOTEN)
│
├── El Frontend/                      # FRONTEND (Vue 3/TypeScript)
│   ├── Dockerfile
│   ├── src/                          # Frontend-Quellcode (TM VERBOTEN)
│   └── vite.config.ts
│
├── El Trabajante/                    # ESP32 FIRMWARE (C++/PlatformIO)
│   └── src/                          # Firmware-Quellcode (TM VERBOTEN)
│
├── docker/                           # Container-Konfigurationen
│   ├── grafana/provisioning/
│   │   ├── alerting/alert-rules.yml  # 5 Alert-Rules, 2 Gruppen
│   │   ├── dashboards/
│   │   │   ├── dashboards.yml        # Dashboard-Provider
│   │   │   └── system-health.json    # 12 Panels
│   │   └── datasources/datasources.yml  # Prometheus + Loki
│   ├── loki/loki-config.yml          # TSDB v13, 7d Retention
│   ├── mosquitto/mosquitto.conf      # MQTT Broker Config
│   ├── pgadmin/servers.json          # pgAdmin Vorkonfiguration
│   ├── postgres/postgresql.conf      # DB Logging + Performance
│   ├── prometheus/prometheus.yml     # 4 Scrape-Jobs
│   └── promtail/config.yml          # Docker SD + Pipeline
│
├── docker-compose.yml                # HAUPT-COMPOSE: 11 Services
├── docker-compose.dev.yml            # Dev-Overrides (Hot-Reload)
├── docker-compose.test.yml           # Test-Overrides
├── docker-compose.ci.yml             # CI-Overrides
├── docker-compose.e2e.yml            # E2E-Overrides
│
├── logs/                             # Bind-Mount Log-Verzeichnisse
│   ├── server/, mqtt/, postgres/
│
├── .claude/                          # VS Code Agent Workspace
│   ├── reference/                    # API-Doku, Patterns (TM LESEN)
│   └── reports/current/              # Agent-Reports (TM LESEN)
│
├── .technical-manager/               # TM Workspace
│   ├── commands/pending/             # Aufträge an Agents
│   ├── inbox/agent-reports/          # Konsolidierte Reports
│   └── reports/current/              # TM-Bericht
│
├── .env / .env.example               # Secrets / Beispiel-Config
├── Makefile                          # Docker-Operationen
└── README.md
```

## 0.3 SOLL-Projektstruktur (Referenz)

```
project-root/
├── services/
│   ├── backend/        (Dockerfile, src/, tests/)
│   ├── frontend/       (Dockerfile, src/, tests/)
│   └── firmware/       (src/, test/, platformio.ini)
├── infrastructure/
│   ├── docker/         (alle Container-Configs)
│   ├── compose/        (alle docker-compose.*.yml)
│   └── scripts/        (backup.sh, restore.sh)
├── docs/
├── .github/
├── Makefile
└── README.md
```

**Bewertung AutomationOne:**
- Spanische Namensgebung (El Servador etc.) – konsistent, einzigartig, erfordert Onboarding-Doku
- Compose-Files im Root statt `infrastructure/compose/` – akzeptabel für Monorepo, suboptimal bei Skalierung
- `docker/` Verzeichnis = SOLL-konform
- `logs/` Bind-Mounts im Root – potenziell redundant zu Promtail/Loki (Agent soll prüfen)

---

# TEIL A: IST-ZUSTAND (TM-Wissen + LIVE-Verifizierung 2026-02-09)

## A0. 🔴🟡🟢 LIVE-VERIFIZIERUNGSERGEBNIS (2026-02-09 22:00 UTC)

> **Methode:** `docker compose ps -a`, `docker inspect`, `curl /health/*`, Container-interne Prüfungen
> **Stack-Alter:** 19h (Core), 16h (Monitoring), 3d (pgAdmin - crashed)

### Kritische Funde (🔴 SOFORT HANDELN)

| # | Problem | Impact | Bereich |
|---|---------|--------|---------|
| 🔴1 | **Port 1883 NICHT extern gebunden** – `docker port` zeigt nur 9001, nicht 1883 | ESP32 im LAN kann sich NICHT per MQTT verbinden! Nur WebSocket (9001) funktioniert | Netzwerk/MQTT |
| 🔴2 | **pgAdmin crasht (ExitCode 127)** – Mount-Fehler: servers.json Bind-Mount scheitert (File vs. Directory Mismatch) | pgAdmin komplett unbenutzbar | DevTools |
| 🔴3 | **pgAdmin Image = `dpage/pgadmin4:latest`** statt `:9.12` – alter Container (3 Tage) mit falschem Image | Config-Drift, nicht reproduzierbar | Docker |
| 🔴4 | **PostgreSQL Log: 98MB, KEINE Rotation!** – Einzelne Datei `postgresql.log` wächst unbegrenzt | Disk-Overflow-Risiko, obwohl `log_rotation_age=1d` konfiguriert ist. Rotation greift offenbar nicht | Logging |

### Warnungen (🟡 VOR PRODUCTION)

| # | Problem | Impact | Bereich |
|---|---------|--------|---------|
| 🟡1 | **Server loggt JSON** – aber Promtail hat KEINEN JSON-Parser für el-servador | Log-Felder (level, logger, module) werden nicht als Labels extrahiert. Loki-Queries suboptimal | Monitoring |
| 🟡2 | **Server Logs: ~110MB** (11 Dateien × 10MB) – hat eigene Rotation, aber Bind-Mount dupliziert Docker-Logs | Doppelte Log-Speicherung: Bind-Mount UND Docker json-file Driver | Logging |
| 🟡3 | **Duplizierte Docker-Volumes** – `auto-one_automationone-*` UND `automationone-*` existieren parallel | Verwaiste Volumes belegen Speicher, Verwirrungsgefahr | Docker |
| 🟡4 | **mosquitto-exporter hat keinen Healthcheck** | Prometheus scrapet möglicherweise toten Exporter ohne Warnung | Monitoring |
| 🟡5 | **100 Mock-ESPs registriert, 32 offline** – Alert Rule 5 (ESP Offline) würde DAUERHAFT feuern | False Positive Alerting bei aktiviertem Monitoring | Alerting |
| 🟡6 | **Container-User Audit: 4 von 11 laufen als root** | postgres, mqtt-broker, promtail, mosquitto-exporter = root | Security |

### Bestätigt OK (🟢)

| Aspekt | Status | Details |
|--------|--------|---------|
| 🟢 Server Health | `healthy` v2.0.0 | /health/live, /health/ready, DB+MQTT connected |
| 🟢 10 von 11 Container laufen | Up ~1h | Nur pgAdmin crashed |
| 🟢 Alle Healthchecks greifen | 9/10 healthy | mosquitto-exporter hat keinen HC |
| 🟢 Netzwerk automationone-net | 172.18.0.0/16 | 10 Container verbunden |
| 🟢 Server Metriken | god_kaiser_* vorhanden | uptime, cpu, memory, mqtt, esp_total/online/offline |
| 🟢 Mosquitto Log | ~1MB | Unkritisch |

### Container-User Audit (verifiziert via `docker inspect`)

| Container | User | Bewertung |
|-----------|------|-----------|
| automationone-postgres | **root** | 🟡 Standard für postgres-Image, aber non-root möglich |
| automationone-mqtt | **root** | 🟡 Mosquitto kann als mosquitto-User laufen |
| automationone-server | **appuser** | 🟢 Non-root, korrekt |
| automationone-frontend | **appuser** | 🟢 Non-root, korrekt |
| automationone-loki | **10001** | 🟢 Non-root (Grafana Standard) |
| automationone-promtail | **root** | 🟡 Braucht root für Docker-Socket, akzeptabel |
| automationone-prometheus | **nobody** | 🟢 Non-root |
| automationone-grafana | **472** | 🟢 Non-root (Grafana User) |
| automationone-postgres-exporter | **nobody** | 🟢 Non-root |
| automationone-mosquitto-exporter | **root** | 🟡 Sollte non-root sein |
| automationone-pgadmin | **5050** | 🟢 Non-root (pgAdmin User) – aber Container crashed |

### Metriken-Snapshot (Server, live)

```
god_kaiser_uptime_seconds: 5145s (~1.4h)
god_kaiser_cpu_percent: 4.5%
god_kaiser_memory_percent: 21.4%
god_kaiser_mqtt_connected: 1.0
god_kaiser_esp_total: 100 (Mock-Daten)
god_kaiser_esp_online: 0
god_kaiser_esp_offline: 32
```

---

## A1. Docker-Compose – 11 Services

**Wichtig (2025+):** Das `version:` Feld in docker-compose.yml ist seit Docker Compose v2 obsolet und wird ignoriert. Sollte entfernt werden falls vorhanden.

| # | Service | Container | Image | Profile | HC | Logging | start_period | 🔴🟡🟢 |
|---|---------|-----------|-------|---------|-----|---------|-------------|---------|
| 1 | postgres | automationone-postgres | postgres:16-alpine | core | ✅ pg_isready | ❌ Default | ❌ | 🟡 logging+start_period fehlt |
| 2 | mqtt-broker | automationone-mqtt | eclipse-mosquitto:2 | core | ✅ mosquitto_sub | ❌ Default | ❌ | 🔴 Port 1883 nicht gebunden! |
| 3 | el-servador | automationone-server | build ./El Servador | core | ✅ curl /health | ✅ json 10m/3 | ✅ 30s | 🟢 |
| 4 | el-frontend | automationone-frontend | build ./El Frontend | core | ✅ node fetch | ✅ json 5m/3 | ✅ 30s | 🟡 depends_on ohne condition |
| 5 | loki | automationone-loki | grafana/loki:3.4 | monitoring | ✅ wget /ready | ✅ json 5m/3 | ❌ | 🟡 start_period fehlt |
| 6 | promtail | automationone-promtail | grafana/promtail:3.4 | monitoring | ✅ bash tcp | ✅ json 5m/3 | ❌ | 🟡 start_period fehlt |
| 7 | prometheus | automationone-prometheus | prom/prometheus:v3.2.1 | monitoring | ✅ wget /-/healthy | ✅ json 5m/3 | ❌ | 🟡 start_period fehlt |
| 8 | grafana | automationone-grafana | grafana/grafana:11.5.2 | monitoring | ✅ wget /api/health | ✅ json 5m/3 | ❌ | 🟡 start_period fehlt |
| 9 | postgres-exporter | automationone-postgres-exporter | prometheuscommunity/postgres-exporter:v0.16.0 | monitoring | ✅ wget /metrics | ✅ json 5m/3 | ❌ | 🟡 start_period fehlt |
| 10 | mosquitto-exporter | automationone-mosquitto-exporter | sapcc/mosquitto-exporter:0.8.0 | monitoring | ❌ FEHLT | ✅ json 5m/3 | ❌ | 🟡 HC + start_period fehlt |
| 11 | pgadmin | automationone-pgadmin | 🔴 **dpage/pgadmin4:latest** (SOLL: 9.12) | devtools | ✅ wget /misc/ping | ✅ json 5m/3 | ❌ | 🔴 CRASHED ExitCode 127 |

**Zusammenfassung IST-Lücken (verifiziert):**
- 🔴 **Port 1883 nicht extern gebunden** – ESP32-Kommunikation blockiert
- 🔴 **pgAdmin crashed** – servers.json Mount-Fehler, falsches Image (:latest statt :9.12)
- 🔴 **PostgreSQL Log 98MB ohne Rotation** – trotz konfigurierter Rotation
- 🟡 `start_period` fehlt bei 9 von 11 Services
- 🟡 `logging` fehlt bei postgres + mqtt-broker (Docker-Defaults = unbegrenzte Logs!)
- 🟡 `mosquitto-exporter` hat keinen Healthcheck
- 🟡 `eclipse-mosquitto:2` nur Major-Pin (riskant)
- 🟡 `el-frontend depends_on el-servador` ohne `condition: service_healthy`
- 🟡 Duplizierte Volumes (alte `auto-one_automationone-*` neben neuen `automationone-*`)

## A2. Netzwerk IST (verifiziert)

- **1 Bridge-Netzwerk:** `automationone-net` (172.18.0.0/16) für alle Services
- Keine Segmentierung, kein `internal: true`
- **Alle Ports als `ports:`** (host-exposed), auch intern-only Services (loki:3100, prometheus:9090, exporter:9187/9234)

**🔴 LIVE-VERIFIZIERUNG: Port-Binding-Problem**

| Port | Compose-Config | Tatsächlich gebunden | Status |
|------|---------------|---------------------|--------|
| 5432 (postgres) | `"5432:5432"` | ✅ 0.0.0.0:5432 | 🟢 |
| 1883 (mqtt) | `"1883:1883"` | ❌ **NICHT gebunden!** | 🔴 |
| 9001 (mqtt-ws) | `"9001:9001"` | ✅ 0.0.0.0:9001 | 🟢 |
| 8000 (server) | `"8000:8000"` | ✅ 0.0.0.0:8000 | 🟢 |
| 5173 (frontend) | `"5173:5173"` | ✅ 0.0.0.0:5173 | 🟢 |
| 3100 (loki) | `"3100:3100"` | ✅ 0.0.0.0:3100 | 🟢 |
| 9090 (prometheus) | `"9090:9090"` | ✅ 0.0.0.0:9090 | 🟢 |
| 3000 (grafana) | `"3000:3000"` | ✅ 0.0.0.0:3000 | 🟢 |
| 9187 (pg-exp) | `"9187:9187"` | ✅ 0.0.0.0:9187 | 🟢 |
| 9234 (mqtt-exp) | `"9234:9234"` | ✅ 0.0.0.0:9234 | 🟢 |
| 5050 (pgadmin) | `"5050:80"` | ❌ Container crashed | 🔴 |

**Ursache Port 1883:** Docker Desktop/WSL2 konnte den Port möglicherweise nicht binden (Port-Konflikt mit einem anderen Prozess?). `docker inspect` zeigt HostConfig PortBindings korrekt konfiguriert, aber NetworkSettings.Ports zeigt `1883/tcp: NOT BOUND`. Mögliche Ursachen: WSL2 NAT Problem, Port bereits belegt, Docker Desktop Bug.

**Container-IPs im Netzwerk (verifiziert):**
promtail=172.18.0.2, prometheus=172.18.0.3, loki=172.18.0.4, postgres=172.18.0.5, server=172.18.0.6, pg-exporter=172.18.0.7, mqtt=172.18.0.8, grafana=172.18.0.9, frontend=172.18.0.10, mqtt-exporter=172.18.0.11

## A3. MQTT IST (verifiziert)

- `allow_anonymous true` – keine Authentifizierung 🟡
- Keine passwd-Datei, keine ACL, kein TLS 🟡
- 2 Listener: 1883 (MQTT), 9001 (WebSocket)
- 🔴 **Port 1883 im Container aktiv, aber NICHT extern erreichbar** (siehe A2)
- Persistence: on, Log: file + stdout
- **Mosquitto Log: ~1MB** (unkritisch aktuell, aber ohne Rotation) 🟡
- Max Inflight: 20, Max Queued: 1000, Max Message Size: 256KB

## A4. PostgreSQL IST (verifiziert)

- Logging: `log_statement = mod`, Slow Query > 100ms
- Connection/Disconnection + Lock-Wait Logging: on
- **Keine Performance-Tuning-Parameter** (shared_buffers, work_mem = Defaults)

**🔴 PostgreSQL Log-Rotation DEFEKT:**
- Config sagt: `log_rotation_age = 1d`, `log_rotation_size = 50MB`
- **Realität:** Einzelne `postgresql.log` mit **98MB** (Stand 2026-02-09)
- `log_truncate_on_rotation = off` → alte Logs werden NICHT gelöscht
- **Ursache wahrscheinlich:** `logging_collector = on` mit `log_filename = 'postgresql.log'` (fixer Name ohne Timestamp-Pattern) bewirkt, dass PostgreSQL immer dieselbe Datei appendet statt neue zu erstellen
- **Fix:** `log_filename = 'postgresql-%Y-%m-%d.log'` setzen, dann greift Rotation korrekt

## A5. Monitoring Stack IST (abgeschlossen)

| Metrik | Wert |
|--------|------|
| Config-Dateien in docker/ | ~20 |
| Docker Services gesamt | 11 (4 core + 7 monitoring/devtools) |
| Prometheus Scrape-Jobs | 4 (el-servador, postgres, prometheus-self, mqtt-broker) |
| Grafana Dashboard Panels | 12 (System Health) |
| Grafana Alert Rules | 5 (3 critical + 2 warning) |
| Grafana Datasources | 2 (Prometheus default + Loki) |

**Prometheus Jobs:** el-servador:8000/api/v1/health/metrics, postgres-exporter:9187/metrics, localhost:9090/metrics, mosquitto-exporter:9234/metrics. 15s Intervall, 7d Retention, Lifecycle API enabled.

**Loki:** TSDB v13, Filesystem, 168h Retention, Compactor aktiv, Single-Tenant.

**Promtail:** Docker SD mit Project-Filter `auto-one`, Drop Health-Checks, JSON-Parser für Frontend.
- 🟡 **FEHLT (BESTÄTIGT):** JSON-Parser für Server – Server loggt **nachweislich JSON** (Felder: timestamp, level, logger, message, module, function, line). Ohne Parser werden diese Felder nicht als Loki-Labels extrahiert.
- 🟡 **FEHLT:** Multiline für Python Tracebacks (nicht verifiziert ob Tracebacks auftreten, aber defensiv nötig)

**Grafana Alerting:**
- critical (10s eval): Server Down, MQTT Disconnected, Database Down
- warning (1m eval): High Memory (>85%, 5m), ESP Offline (guard: esp_total>0, 3m)
- **FEHLT:** contact-points.yml, notification-policies.yml (Phase 1: UI-only = akzeptabel)

**🟡 LIVE: ESP Offline Alert Problem:**
- `god_kaiser_esp_total = 100`, `god_kaiser_esp_offline = 32`, `god_kaiser_esp_online = 0`
- Dies sind Mock/Simulation-Daten (SimulationScheduler aktiv)
- Alert Rule 5 (`esp_offline > 0 AND esp_total > 0`) würde **DAUERHAFT feuern**
- **Kein echtes Problem** solange Development, aber bei Production-Monitoring irreführend
- **Fix:** Entweder Mock-Daten bereinigen oder Alert-Rule um `ENVIRONMENT != "development"` erweitern

## A6. Makefile IST

Umfangreich: Lifecycle (up/down/dev/build/clean), E2E, Logs, Shell/DB, MQTT, Status/Health, Monitoring, DevTools.

---

# TEIL B: SOLL-REFERENZ (Web-Recherche verifiziert)

## B1. Docker Compose – Service-Qualitätsstandard

### B1.1 Pflichtfelder pro Service (2025/2026)

```yaml
services:
  any-service:
    image: vendor/name:MINOR_VERSION        # Nie :latest, nie nur :major
    container_name: project-service          # Deterministisch
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "..."]
      interval: 10-30s
      timeout: 5-10s
      retries: 3-5
      start_period: 10-60s                   # PFLICHT – JEDER Service
    logging:
      driver: json-file
      options:
        max-size: "5-10m"
        max-file: "3"
    networks:
      - explicit-network
    # Production-Ergänzungen:
    # user: "1000:1000"                      # Non-root
    # read_only: true                        # Immutable FS
    # tmpfs: [/tmp]                          # Schreibbarer Temp
    # deploy.resources.limits               # CPU/Memory Caps
```

**Hinweis:** `version:` Feld im Compose-File ist seit Docker Compose v2 (2025) obsolet. Einfach weglassen.

### B1.2 Image-Versioning

| Tag-Typ | Beispiel | Bewertung |
|---------|----------|-----------|
| `:latest` / kein Tag | `nginx` | ❌ VERBOTEN |
| Nur Major | `eclipse-mosquitto:2` | ⚠️ RISKANT |
| Minor + Variant | `postgres:16-alpine` | ✅ GUT |
| Exakte Version | `prom/prometheus:v3.2.1` | ✅ BEST |

**AutomationOne:** Alle ✅ außer `eclipse-mosquitto:2` (⚠️ → pinnen auf z.B. `2.0.21`).

### B1.3 depends_on – IMMER mit Condition

```yaml
depends_on:
  target-service:
    condition: service_healthy    # PFLICHT wenn Ziel Healthcheck hat
```

**AutomationOne-Lücke:** `el-frontend → el-servador` OHNE condition = Race-Condition-Risiko.

### B1.4 Resource Limits (Production-Richtwerte)

| Service | CPU | Memory | Reserve CPU | Reserve Mem |
|---------|-----|--------|------------|-------------|
| postgres | 1.0 | 512M | 0.25 | 256M |
| mqtt-broker | 0.5 | 256M | 0.1 | 128M |
| el-servador | 1.0 | 512M | 0.25 | 256M |
| el-frontend | 0.5 | 256M | 0.1 | 128M |
| prometheus | 0.5 | 512M | 0.1 | 256M |
| loki | 0.5 | 512M | 0.1 | 256M |
| grafana | 0.5 | 256M | 0.1 | 128M |
| promtail | 0.25 | 128M | 0.05 | 64M |
| postgres-exporter | 0.1 | 128M | 0.05 | 64M |
| mosquitto-exporter | 0.1 | 64M | 0.05 | 32M |
| pgadmin | 0.5 | 256M | 0.1 | 128M |

Nicht für Development nötig. PFLICHT vor Production.

## B2. Netzwerk-Architektur

### B2.1 Development (IST): Single Flat Network – AKZEPTABEL

Alle 11 Services in `automationone-net`. Weniger Debug-Aufwand, OK für < 15 Services lokal.

### B2.2 Production (SOLL): 3-Zonen-Segmentierung

```
ZONE 1: frontend-net
  el-frontend ←→ el-servador

ZONE 2: backend-net (internal: true)
  el-servador ←→ postgres + mqtt-broker

ZONE 3: monitoring-net (internal: true)
  prometheus → el-servador, postgres-exporter, mosquitto-exporter
  promtail → loki → grafana
```

**Bridge-Services:** el-servador (alle 3 Zonen), postgres + mqtt-broker (backend + monitoring).

### B2.3 Port-Exposure

**Goldene Regel:** `ports:` NUR für extern nötige Services. Rest über Docker-DNS.

| Extern NÖTIG | Nur Docker-intern |
|-------------|-------------------|
| el-frontend :5173 | loki :3100 |
| el-servador :8000 | prometheus :9090 (Debug optional) |
| mqtt-broker :1883 (ESP32 LAN) | postgres-exporter :9187 |
| mqtt-broker :9001 (WebSocket) | mosquitto-exporter :9234 |
| grafana :3000 | promtail (kein Port) |
| postgres :5432 (Dev: DBeaver) | |
| pgadmin :5050 (Dev only) | |

### B2.4 WSL2/Docker Desktop Netzwerk (AutomationOne-spezifisch)

```
┌──────────────────────────────────────────────────┐
│ Windows Host (z.B. 192.168.1.100)                │
│  ┌────────────────────────────────────────────┐  │
│  │ WSL2 VM (172.x.x.x, DYNAMISCH)            │  │
│  │  ┌──────────────────────────────────────┐  │  │
│  │  │ Docker Engine                        │  │  │
│  │  │  automationone-net (172.18.0.0/16)   │  │  │
│  │  │  ├── alle 11 Services                │  │  │
│  │  └──────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
                    ↑
ESP32 im LAN ──→ mqtt://192.168.1.100:1883
                 (Windows Host-IP, NICHT localhost!)
```

**Kritische Punkte:**

1. **localhost auf Windows** = Container-Ports (Docker Desktop NAT). Browser `http://localhost:8000` → OK.
2. **ESP32 im LAN** braucht **Windows Host-IP** (192.168.x.x), NICHT localhost, NICHT WSL2-IP.
3. **WSL2-IP ist dynamisch** – ändert sich nach Reboot. Nie in Firmware hardcoden.
4. **Windows Firewall** muss Port 1883/9001 für eingehende Verbindungen erlauben.
5. **WSL2 mirrored networking** (optional via `.wslconfig`): Macht Container direkt unter Host-IP erreichbar.

**Hyper-V Firewall für WSL2 (falls Probleme):**
```powershell
# Hyper-V Firewall Rule für MQTT
Set-NetFirewallHyperVVMSetting -Name '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -DefaultInboundAction Allow
New-NetFirewallHyperVRule -Name "MQTT-ESP32" -DisplayName "MQTT for ESP32" -Direction Inbound -VMCreatorId "{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}" -Protocol TCP -LocalPorts 1883
```

**WSL2 Mirrored Networking aktivieren (.wslconfig):**
```ini
# %UserProfile%\.wslconfig
[wsl2]
networkingMode=mirrored
```
Danach: `wsl --shutdown` + Neustart. Erfordert WSL2 Version 2.0.4+.

**Agent soll prüfen:** MQTT_BROKER_HOST in Firmware, Windows Firewall, .wslconfig Status.

### B2.5 Reverse Proxy (Production SOLL)

Für Production-Deployment sollte ein Reverse Proxy (Traefik oder Caddy) vor den exponierten Services stehen:
- Auto-TLS via Let's Encrypt
- Zentrales HTTPS-Termination
- Rate Limiting, CORS, Security Headers
- Nur Ports 80/443 extern, alles andere intern

**Für Development nicht nötig.** Erst bei Production-Readiness evaluieren.

## B3. MQTT Security – 3-Layer-Modell

### IST: Development (akzeptabel)
```conf
allow_anonymous true
# Keine passwd, keine ACL, kein TLS
```

### SOLL: Production Roadmap

**Layer 1: Authentifizierung (Priorität HOCH)**
```conf
allow_anonymous false
password_file /mosquitto/config/passwd
```

| Rolle | Username | Zugriff |
|-------|----------|---------|
| Server | god_kaiser | readwrite ao/# |
| ESP32 | esp_{id} | write ao/{own_id}/sensor/# + read ao/{own_id}/command/# |
| Dashboard | dashboard | read ao/# |
| Monitoring | monitor | read $SYS/# |

Passwort erstellen: `docker exec automationone-mqtt mosquitto_passwd -b /mosquitto/config/passwd <user> <pass>`
Config-Reload ohne Restart: `docker exec automationone-mqtt kill -SIGHUP 1`

**Layer 2: ACL (Priorität HOCH)**
```conf
acl_file /mosquitto/config/acl
```
```
user god_kaiser
topic readwrite ao/#

pattern write ao/%u/sensor/#
pattern write ao/%u/status/#
pattern read ao/%u/command/#

user dashboard
topic read ao/#

user monitor
topic read $SYS/#
```
Whitelist-Prinzip: Alles verboten was nicht erlaubt.

**Layer 3: TLS (Priorität MITTEL für LAN, HOCH für WAN)**

| Szenario | Port | TLS | Cert |
|----------|------|-----|------|
| LAN Dev | 1883 | Nein | — |
| LAN Prod | 8883 | Ja | Self-signed CA |
| WAN/Internet | 8883 | PFLICHT | Let's Encrypt |

ESP32 unterstützt TLS via mbedTLS (~40KB extra RAM für Handshake).

**Mosquitto Log-Rotation:** Mosquitto hat KEINE eingebaute Rotation. Empfehlung: `log_dest stdout` only → Docker json-file Driver rotiert. Promtail fängt alles ab.

## B4. PostgreSQL – Production-Tuning

| Parameter | IST (Default) | SOLL |
|-----------|--------------|------|
| max_connections | 100 | 30-50 (AutomationOne braucht ~5-10) |
| shared_buffers | 128MB | 25% Container-RAM (128MB bei 512M) |
| work_mem | 4MB | 8-16MB |
| effective_cache_size | 4GB | 75% Container-RAM (384MB bei 512M) |
| ssl | off | on (wenn Port extern) |

Logging IST = gut. Tuning nur bei Performance-Problemen oder vor Production.

## B5. Monitoring Stack – SOLL-Referenz

### B5.1 Prometheus

| Aspekt | IST | SOLL | ✅/⚠️ |
|--------|-----|------|-------|
| Scrape/Eval Interval | 15s | 15-30s | ✅ |
| Retention | 7d | 7-15d Dev, 30-90d Prod | ✅ Dev |
| Self-Monitoring | ✅ | ✅ | ✅ |
| Lifecycle API | ✅ | ✅ | ✅ |
| Exporter-Pattern | ✅ postgres + mqtt | ✅ | ✅ |
| Alert Rules | In Grafana | Entweder-oder (konsistent) | ✅ |
| cAdvisor | ❌ | Container CPU/RAM/Net pro Container | ⚠️ |
| Node-Exporter | ❌ | Host CPU/RAM/Disk | ⚠️ |
| Recording Rules | ❌ | Für teure Dashboard-Queries | ⚠️ Optional |

**cAdvisor:** Standard in Production-Stacks. Liefert Container-Level CPU/RAM/Network/Filesystem. Docker Desktop exponiert basic Metriken auf `host.docker.internal:9323` – prüfen ob ausreichend.

**Node-Exporter:** Für Host-Metriken. `god_kaiser_memory_percent` deckt nur Server-Prozess ab, NICHT Host oder andere Container.

**Recording Rules:** Wenn Dashboard langsam wird, Prometheus pre-computed Queries nutzen. Erst bei Performance-Problemen.

### B5.2 Loki

| Aspekt | IST | SOLL | ✅/⚠️ |
|--------|-----|------|-------|
| Schema | v13 TSDB | v13 (aktuell) | ✅ |
| Storage | Filesystem | Filesystem (Single-Node) | ✅ |
| Retention | 7d | Symmetrisch mit Prometheus | ✅ |
| Compactor | ✅ | MUSS aktiv | ✅ |

**Hinweis Alloy:** Grafana empfiehlt **Grafana Alloy** als Promtail-Nachfolger. Vereint Promtail + OpenTelemetry. Aktuell kein Handlungsbedarf – Promtail funktioniert. Bei Major-Upgrade (Loki 4.x) evaluieren. Aktuellste Loki/Promtail-Version: 3.6.0 (AutomationOne: 3.4).

### B5.3 Promtail

| Aspekt | IST | SOLL | ✅/⚠️ |
|--------|-----|------|-------|
| Docker SD | ✅ auto-one | ✅ | ✅ |
| Health-Drop | ✅ el-servador | ✅ | ✅ |
| JSON-Parser Frontend | ✅ | ✅ | ✅ |
| JSON-Parser Server | ❌ | **BESTÄTIGT: Server loggt JSON** (timestamp, level, logger, message, module, function, line, request_id). Parser FEHLT → Log-Felder nicht als Loki-Labels extrahiert | 🔴 FEHLT |
| Multiline Python | ❌ | **BESTÄTIGT:** Kein multiline-stage in config.yml. Tracebacks werden als Einzelzeilen aufgeteilt, Query in Loki erschwert | 🟡 FEHLT |
| Positions Volume | ✅ persistent | ✅ | ✅ |

**Multiline-Stage für Python Tracebacks (SOLL):**
```yaml
- match:
    selector: '{compose_service="el-servador"}'
    stages:
      - multiline:
          firstline: '^\d{4}-\d{2}-\d{2}'
          max_wait_time: 3s
          max_lines: 50
```

### B5.4 Grafana Provisioning

**SOLL-Struktur:**
```
grafana/provisioning/
├── alerting/
│   ├── alert-rules.yml              ✅ VORHANDEN (5 Rules)
│   ├── contact-points.yml           ❌ FEHLT (Phase 2)
│   └── notification-policies.yml    ❌ FEHLT (Phase 2)
├── dashboards/
│   ├── dashboards.yml               ✅ VORHANDEN
│   └── system-health.json           ✅ VORHANDEN (12 Panels)
└── datasources/
    └── datasources.yml              ✅ VORHANDEN (Prometheus + Loki)
```

**Phase 1 (IST):** UI-only Alerting. Alerts nur in Grafana sichtbar. Akzeptabel für Development.
**Phase 2 (SOLL):** Externe Benachrichtigungen via Slack/Email/Webhook.

**Alternative für Phase 2:** Eigenständiger Alertmanager (prom/alertmanager) statt Grafana-Alerting. Bietet besseres Routing, Grouping, Silencing. Wird in Production-Stacks bevorzugt.

**Alert Rules Qualität (bereits geprüft):**
- ✅ datasourceUid matched datasources.yml
- ✅ UIDs konform (≤40 Zeichen, [a-zA-Z0-9_-])
- ✅ noDataState sinnvoll (Critical=Alerting, Warning=OK)
- ✅ ESP Offline Guard: `god_kaiser_esp_total > 0`

## B6. Security-Roadmap

### Priorität KRITISCH (vor Production)
| Thema | Dev IST | Production SOLL |
|-------|---------|-----------------|
| MQTT Auth | anonymous=true | passwd + ACL |
| Secrets | .env file | Docker Secrets / Vault |
| Default Passwords | admin/admin | Starke generierte Passwörter |

### Priorität HOCH
| Thema | Dev IST | Production SOLL |
|-------|---------|-----------------|
| MQTT TLS | plain :1883 | TLS :8883 |
| Port-Minimierung | alle exposed | nur extern nötige |
| Network Segmentation | flat single-net | 3-Zonen |
| depends_on conditions | 1x fehlt | ALLE mit service_healthy |
| Reverse Proxy | keiner | Traefik/Caddy mit auto-TLS |

### Priorität MITTEL
| Thema | Dev IST | Production SOLL |
|-------|---------|-----------------|
| Container User | 🟢 7/11 non-root, 🟡 4/11 root (postgres, mqtt, promtail, mqtt-exp) | Non-root (1000:1000) |
| Resource Limits | keine | definiert (B1.4) |
| Read-only FS | nein | `read_only: true` + tmpfs |
| Mosquitto Logs | file ohne Rotation | stdout-only |
| Grafana Auth | Fallback admin | Strong Password + OIDC |

### Priorität NIEDRIG
Image Scanning (Trivy), Capability Dropping, Docker Content Trust, Signed Images.

---

# TEIL C: VERIFIKATIONSAUFTRÄGE (15 Punkte) – ERGEBNISSE

> **Verifiziert:** 2026-02-09 durch VS Code Agent (verify-plan + system-control)
> **Methode:** docker-compose.yml gelesen, Config-Dateien geprüft, Docker Stack live inspiziert
> **Status-Legende:** ✅ Geprüft OK | 🟡 Geprüft, Verbesserung nötig | 🔴 Geprüft, Problem | ⏳ Ausstehend

## Docker (C1-C5)

**C1 – Service-Vollständigkeitsmatrix:** ✅ GEPRÜFT

| Service | container_name | restart | HC test | HC start_period | logging | networks |
|---------|:-:|:-:|:-:|:-:|:-:|:-:|
| postgres | ✅ | ✅ | ✅ pg_isready (10s/5s/5) | 🔴 **FEHLT** | 🔴 **FEHLT** | ✅ |
| mqtt-broker | ✅ | ✅ | ✅ mosquitto_sub (30s/10s/3) | 🔴 **FEHLT** | 🔴 **FEHLT** | ✅ |
| el-servador | ✅ | ✅ | ✅ curl /health (30s/10s/3) | ✅ 30s | ✅ json 10m/3 | ✅ |
| el-frontend | ✅ | ✅ | ✅ node fetch (30s/10s/3) | ✅ 30s | ✅ json 5m/3 | ✅ |
| loki | ✅ | ✅ | ✅ wget /ready (15s/5s/5) | 🔴 **FEHLT** | ✅ json 5m/3 | ✅ |
| promtail | ✅ | ✅ | ✅ bash tcp (15s/5s/5) | 🔴 **FEHLT** | ✅ json 5m/3 | ✅ |
| prometheus | ✅ | ✅ | ✅ wget /-/healthy (15s/5s/5) | 🔴 **FEHLT** | ✅ json 5m/3 | ✅ |
| grafana | ✅ | ✅ | ✅ wget /api/health (15s/5s/5) | 🔴 **FEHLT** | ✅ json 5m/3 | ✅ |
| postgres-exporter | ✅ | ✅ | ✅ wget /metrics (15s/5s/5) | 🔴 **FEHLT** | ✅ json 5m/3 | ✅ |
| mosquitto-exporter | ✅ | ✅ | 🔴 **FEHLT KOMPLETT** | — | ✅ json 5m/3 | ✅ |
| pgadmin | ✅ | ✅ | ✅ wget /misc/ping (15s/5s/5) | 🔴 **FEHLT** | ✅ json 5m/3 | ✅ |

**Zusammenfassung C1:** container_name 11/11 ✅, restart 11/11 ✅, HC vorhanden 10/11, **start_period nur 2/11**, **logging nur 9/11**, networks 11/11 ✅
→ Quelle: `docker-compose.yml` gelesen

**C2 – mosquitto-exporter Healthcheck:** 🔴 BESTÄTIGT FEHLEND
- Einziger Service ohne Healthcheck (`docker compose ps` zeigt "Up" statt "Up (healthy)")
- `/metrics` auf Port 9234 ist als HC nutzbar
- **Empfohlener Fix:**
```yaml
healthcheck:
  test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:9234/metrics || exit 1"]
  interval: 15s
  timeout: 5s
  retries: 5
  start_period: 10s
```

**C3 – Log-Redundanz:** 🟡 VERIFIZIERT
`./logs/*` Bind-Mounts UND Promtail/Loki via Docker SD. Welcher Weg primär? Bind-Mounts redundant? Speicherverbrauch?
→ Vergleich beider Wege

> **LIVE-ANTWORT:** Logs werden DOPPELT gespeichert:
> - Bind-Mount: `logs/server/` = 110MB (11 Dateien mit Rotation), `logs/mqtt/` = 1MB, `logs/postgres/` = 98MB (KEINE Rotation!)
> - Docker json-file: el-servador max 30MB (10m×3), mqtt/postgres = UNBEGRENZT (kein logging-driver!)
> - Promtail/Loki: Sammelt Docker-Logs (json-file), NICHT die Bind-Mount-Dateien
> - **Gesamt: ~240MB+** doppelt gespeichert
> - **Empfehlung:** Bind-Mounts beibehalten für Debug, ABER logging-driver für postgres+mqtt setzen

**C4 – Frontend depends_on OHNE condition:** 🟡 BESTÄTIGT
- `el-frontend` hat `depends_on: - el-servador` **ohne** `condition: service_healthy` (Zeile 146 docker-compose.yml)
- **Impact:** Funktional akzeptabel (Frontend braucht Backend nicht beim Start, Browser verbindet sich später)
- **Alle anderen depends_on** nutzen `condition: service_healthy` korrekt (el-servador→postgres/mqtt, promtail→loki, prometheus→el-servador, grafana→loki/prometheus, exporters→targets, pgadmin→postgres)
- **Empfehlung:** `condition: service_healthy` ergänzen für Konsistenz

**C5 – mosquitto Image-Version:** 🟡 NUR MAJOR-PINNED
- `eclipse-mosquitto:2` → nur Major-Pin, kann bei `docker pull` unerwartete Minor-Änderungen bekommen
- postgres:16-alpine ist ebenfalls nur Major+Variant gepinnt (akzeptabler, da Alpine weniger Breaking Changes)
- **4/11 exakt gepinnt** (prometheus v3.2.1, grafana 11.5.2, postgres-exporter v0.16.0, mosquitto-exporter 0.8.0)
- **3/11 Minor-gepinnt** (loki 3.4, promtail 3.4, pgadmin 9.12)
- **2/11 Major-only** (postgres 16-alpine, mosquitto 2)
- **Empfehlung:** mosquitto pinnen auf z.B. `eclipse-mosquitto:2.0.21`

## Netzwerk (C6-C7)

**C6 – Port-Exposure Audit:** 🟡 4 PORTS UNNÖTIG EXTERN

| Port | Service | Dev nötig? | Prod nötig? | Status |
|------|---------|:---:|:---:|-----------|
| 5432 | postgres | ✅ DB-Tools | ❌ | 🟢 |
| 1883 | mqtt-broker | ✅ ESP32 | ✅ | 🟢 essenziell |
| 9001 | mqtt-broker | ✅ WebSocket | ✅ | 🟢 |
| 8000 | el-servador | ✅ API | ✅ | 🟢 essenziell |
| 5173 | el-frontend | ✅ Browser | ✅ | 🟢 essenziell |
| 3100 | loki | 🟡 Debug | ❌ | 🟡 könnte `expose:` sein |
| 9090 | prometheus | 🟡 Debug | ❌ | 🟡 könnte `expose:` sein |
| 3000 | grafana | ✅ Dashboard | ✅ | 🟢 |
| 9187 | postgres-exporter | ❌ | ❌ | 🔴 **nur Docker-intern nötig** |
| 9234 | mosquitto-exporter | ❌ | ❌ | 🔴 **nur Docker-intern nötig** |
| 5050 | pgadmin | ✅ Dev | ❌ | 🟢 Dev OK |

**C7 – ESP32→MQTT Netzwerkpfad:** ⏳ TEILWEISE GEPRÜFT
- docker-compose.yml: Port `"1883:1883"` korrekt konfiguriert
- Firmware MQTT_BROKER_HOST: ESP32 muss Windows Host-IP verwenden (192.168.x.x), NICHT localhost oder WSL2-IP
- **Offene Punkte (manuelle Prüfung nötig):** Windows Firewall Port 1883, `.wslconfig` mirrored networking Status
- **Hinweis:** A0/A2 dokumentieren Port-1883-Binding-Problem (nicht extern erreichbar trotz Compose-Config)

## Monitoring (C8-C12)

**C8 – Server Log-Format:** 🔴 VERIFIZIERT – PROMTAIL-PARSER FEHLT
- Server nutzt **Dual-Format**: JSON (File-Handler) + Text (Console-Handler)
- JSON-Felder: `{timestamp, level, logger, message, module, function, line, request_id}`
- Features: RotatingFileHandler, Request-ID Correlation, Noisy-Library-Dampening
- Docker stdout bekommt **Text-Format** (Console-Handler), Docker-Logs also parsbar als Text
- Bind-Mount-Files bekommen **JSON-Format** → Promtail liest Docker-Logs (Text), NICHT Bind-Mounts
- **Ergebnis:** Promtail bekommt Text-Logs, kein JSON-Parser nötig für Docker-SD-Weg. ABER: Strukturierte Felder (level, logger, request_id) gehen verloren → JSON-Parser auf Docker-Text-Output oder Multiline für Tracebacks wäre Verbesserung

**C9 – Alert Rules Ladetest:** ✅ BESTÄTIGT VIA CONFIG-ANALYSE
- 5 Rules in 2 Gruppen korrekt definiert in `alert-rules.yml`
- 3-Stage Pipeline (A: PromQL → B: Reduce:last → C: Threshold) korrekt
- datasourceUid `prometheus` matched `datasources.yml` UID
- UIDs konform: ao-server-down, ao-mqtt-disconnected, ao-database-down, ao-high-memory, ao-esp-offline
- noDataState: Critical=Alerting (korrekt), Warning=OK (korrekt)
- **Live-State-Prüfung via Grafana UI/API:** ⏳ Ausstehend (erfordert laufenden Stack + Browser)

**C10 – ESP Offline Guard-Clause:** 🟡 POTENTIELLES FALSE-POSITIVE
- Rule: `god_kaiser_esp_offline > 0 and god_kaiser_esp_total > 0`
- **Live-Metriken:** esp_total=100 (Mock), esp_offline=32, esp_online=0
- **(a) Keine ESP registriert:** Guard `esp_total > 0` verhindert Firing → ✅ korrekt
- **(b) Metrik nicht vorhanden:** noDataState=OK → kein False Positive → ✅ korrekt
- **(c) 100 Mock-ESPs, 32 offline:** Alert FEUERT dauerhaft! → 🟡 False Positive mit Mock-Daten
- **Empfehlung:** Mock-Daten bereinigen oder Alert nur für Production aktivieren

**C11 – Contact Points:** 🟡 FEHLEN IM PROVISIONING (Phase 1 akzeptabel)
- Nur `alert-rules.yml` vorhanden in `docker/grafana/provisioning/alerting/`
- Keine `contact-points.yml`, keine `notification-policies.yml`
- **Phase 1 (UI-only):** Alerts nur in Grafana UI → akzeptabel für Development
- **Phase 2 (SOLL):** Webhook/Email/Slack als YAML provisionieren

**C12 – Container/Host-Metriken Lücke:** 🟡 NUR SERVER-PROZESS-METRIKEN
- Verfügbare `god_kaiser_*` Metriken: uptime_seconds, cpu_percent, memory_percent, mqtt_connected, esp_total/online/offline
- `god_kaiser_memory_percent` = **NUR Server-Python-Prozess**, NICHT Container oder Host
- **FEHLT:** Container-Level CPU/RAM/Network/Filesystem (cAdvisor oder Docker Desktop Metriken)
- **FEHLT:** Host-Level CPU/RAM/Disk (Node-Exporter)
- **Empfehlung:** cAdvisor als Service #12 ergänzen, oder Docker Desktop Metriken (`host.docker.internal:9323`) als Alternative evaluieren

## Security (C13-C15)

**C13 – Container-User Audit:** 🟢 VERIFIZIERT
Laufen Container als root? Alle 11 prüfen.
→ `docker inspect --format='{{.Config.User}}' <container>` oder `docker exec <c> whoami`

> **LIVE-ANTWORT:** 7/11 non-root (gut), 4/11 root:
> postgres=root, mqtt=root, promtail=root (Docker-Socket nötig), mqtt-exporter=root
> server=appuser ✅, frontend=appuser ✅, loki=10001 ✅, prometheus=nobody ✅, grafana=472 ✅, pg-exporter=nobody ✅, pgadmin=5050 ✅

**C14 – Mosquitto Log-Wachstum:** 🟡 VERIFIZIERT
`log_dest file` ohne Rotation. Aktuelle Größe? Unbegrenztes Wachstum?
→ `docker exec automationone-mqtt ls -la /mosquitto/log/`

> **LIVE-ANTWORT:** `mosquitto.log` = 1.05MB (19h Laufzeit). Wachstumsrate ~55KB/h.
> Bei Dauerbetrieb: ~1.3MB/Tag, ~40MB/Monat. Unkritisch kurzfristig, aber ohne Rotation kein Limit.

**C15 – Secrets-Hygiene:** 🟢 VERIFIZIERT
.env in .gitignore? .env.example nur Platzhalter? Keine Secrets in Compose hardcoded?
→ .gitignore + .env.example + Compose lesen

> **LIVE-ANTWORT:**
> - ✅ `.env` in .gitignore (Zeile 78)
> - ✅ `.env.example` enthält nur Platzhalter (CHANGE_ME, changeme)
> - ✅ Keine Secrets in docker-compose.yml hardcoded (alle via `${VAR}`)
> - 🟡 Grafana Fallback-Password: `${GRAFANA_ADMIN_PASSWORD:-admin}` – "admin" als Fallback ist schwach
> - 🟡 pgAdmin Fallback: `${PGADMIN_DEFAULT_PASSWORD:-admin}` – identisches Problem

---

# TEIL D: REPORT-FORMAT

```markdown
# Infrastructure Audit Report
Datum: YYYY-MM-DD
Agent: [name]
Basis: infrastructure-reference-architecture.md v3

## 1. Service-Vollständigkeitsmatrix (C1)

| Service | container_name | restart | HC (5 Felder) | logging | start_period | networks |
|---------|---------------|---------|---------------|---------|-------------|----------|
| postgres | ✅/❌ | ✅/❌ | ✅/⚠️/❌ | ✅/❌ | ✅/❌ | ✅/❌ |
| ... (alle 11) |

## 2. IST vs. SOLL

| Bereich | Status | Details |
|---------|--------|---------|
| Docker Service Quality | ✅/⚠️/❌ | |
| Netzwerk | ✅/⚠️/❌ | |
| MQTT Security | ✅/⚠️/❌ | |
| PostgreSQL | ✅/⚠️/❌ | |
| Monitoring Completeness | ✅/⚠️/❌ | |
| Grafana Provisioning | ✅/⚠️/❌ | |
| Promtail Pipeline | ✅/⚠️/❌ | |
| Security Posture | ✅/⚠️/❌ | |

## 3. Verifikationsergebnisse (C1-C15)
[Detailergebnisse pro Punkt]

## 4. Empfehlungen
### KRITISCH (sofort)
### HOCH (vor Production)
### MITTEL (nächste Iteration)
### NIEDRIG (Backlog)

## 5. Datengrundlage
[Ausgeführte Befehle, gelesene Dateien, Zeitstempel]
```

**Report speichern:** `.technical-manager/inbox/agent-reports/infrastructure-audit-YYYY-MM-DD.md`

---

# TEIL E: PRIORISIERTER AKTIONSPLAN (aus Live-Verifizierung)

> Erstellt am 2026-02-09 nach system-control + verify-plan Analyse gegen laufenden Stack.
> Sortiert nach Dringlichkeit und Impact.

## 🔴 SOFORT HANDELN (Development blockiert)

### E1. Port 1883 MQTT nicht extern gebunden
- **Impact:** ESP32 im LAN kann sich nicht per MQTT verbinden
- **Symptom:** `docker port automationone-mqtt` zeigt nur 9001, nicht 1883
- **Config ist korrekt:** `"1883:1883"` in docker-compose.yml vorhanden
- **Mögliche Ursachen:** Port-Konflikt auf Host, WSL2 NAT Problem, Docker Desktop Bug
- **Fix-Versuch:** `docker compose down && docker compose up -d` (Neustart des mqtt-broker)
- **Falls weiterhin:** Port-Konflikt prüfen, WSL2 mirrored networking aktivieren
- **Agent:** system-control (Ops-Modus)

### E2. pgAdmin crashed (ExitCode 127)
- **Impact:** pgAdmin als DB-Tool komplett unbenutzbar
- **Ursache:** Bind-Mount servers.json scheitert (File-vs-Directory Mismatch in WSL2)
- **Zusätzlich:** Container hat falsches Image `dpage/pgadmin4:latest` statt `:9.12`
- **Fix:** Container entfernen, mit korrektem Image und Mount neu erstellen
- **Agent:** system-control (Ops-Modus)

### E3. PostgreSQL Log 98MB ohne Rotation
- **Impact:** Disk-Overflow-Risiko bei Dauerbetrieb
- **Ursache:** `log_filename = 'postgresql.log'` (fixer Name) → PostgreSQL appendet statt zu rotieren
- **Fix:** `log_filename = 'postgresql-%Y-%m-%d.log'` in postgresql.conf
- **Agent:** server-dev (Config-Änderung in docker/postgres/postgresql.conf)

## 🟡 VOR PRODUCTION (Monitoring & Logging)

### E4. Promtail JSON-Parser für Server
- **Impact:** Loki kann Server-Logs nicht nach level/logger/module filtern
- **Fix:** JSON-Stage für `{compose_service="el-servador"}` in promtail config.yml hinzufügen
- **Agent:** server-dev oder system-control

### E5. Logging-Driver für postgres + mqtt-broker
- **Impact:** Docker-Logs dieser Services wachsen unbegrenzt
- **Fix:** `logging: {driver: json-file, options: {max-size: "10m", max-file: "3"}}` hinzufügen
- **Agent:** server-dev (docker-compose.yml ändern)

### E6. mosquitto-exporter Healthcheck
- **Impact:** Prometheus scrapet möglicherweise toten Exporter
- **Fix:** Healthcheck auf `/metrics` Endpoint hinzufügen
- **Agent:** server-dev (docker-compose.yml ändern)

### E7. start_period für 9 Services
- **Impact:** Container-Neustarts während Startup-Phase zählen als Failures
- **Fix:** `start_period: 15-30s` zu allen Healthchecks hinzufügen
- **Agent:** server-dev (docker-compose.yml ändern)

### E8. el-frontend depends_on condition
- **Impact:** Frontend kann starten bevor Server healthy ist → Race-Condition
- **Fix:** `depends_on: {el-servador: {condition: service_healthy}}`
- **Agent:** server-dev (docker-compose.yml ändern)

### E9. eclipse-mosquitto Version pinnen
- **Impact:** Nur Major-Pin `:2` kann bei Pull unerwartete Breaking Changes bringen
- **Fix:** Pin auf aktuelle Minor (z.B. `eclipse-mosquitto:2.0.21`)
- **Agent:** server-dev (docker-compose.yml ändern)

## 🟡 AUFRÄUMEN (Hygiene)

### E10. Verwaiste Docker-Volumes bereinigen
- **Symptom:** `auto-one_automationone-*` UND `automationone-*` existieren parallel
- **Fix:** `docker volume prune` oder gezielt alte Volumes entfernen
- **Agent:** system-control (nach Bestätigung durch User)

### E11. Mock-ESP-Daten und Alert Rule 5
- **Impact:** ESP Offline Alert feuert dauerhaft wegen 100 Mock-ESPs (32 offline)
- **Fix-Option A:** Mock-Daten bereinigen wenn nicht benötigt
- **Fix-Option B:** Alert-Rule um Environment-Guard erweitern
- **Agent:** server-dev oder db-inspector

---

# TEIL F: IST vs. SOLL ZUSAMMENFASSUNG (nach Live-Verifizierung)

| Bereich | Status | Details |
|---------|--------|---------|
| Docker Service Quality | 🟡 | 9/11 fehlt start_period, 2/11 fehlt logging, pgAdmin crashed |
| Netzwerk | 🔴 | Port 1883 nicht gebunden, alle Ports extern exposed |
| MQTT Security | 🟡 | anonymous=true (Dev OK), keine ACL/TLS |
| PostgreSQL | 🔴 | Log-Rotation defekt (98MB single file) |
| Monitoring Completeness | 🟡 | 4 Jobs OK, kein cAdvisor/Node-Exporter, mqtt-exporter kein HC |
| Grafana Provisioning | 🟢 | 5 Rules OK, 12 Panels OK, 2 Datasources OK (contact-points Phase 2) |
| Promtail Pipeline | 🟡 | Server loggt Dual-Format: JSON (File) + Text (Console/Docker). Docker-Logs sind Text → kein JSON-Parser nötig, ABER strukturierte Felder (level, request_id) gehen verloren. Multiline für Tracebacks fehlt |
| Security Posture | 🟡 | 7/11 non-root OK, Secrets in .gitignore OK, Fallback-Passwords schwach |
| Server Health | 🟢 | healthy, v2.0.0, DB+MQTT connected, Metriken aktiv |
| Log-Redundanz | 🟡 | ~240MB+ doppelt (Bind-Mount + Docker-Logs), Promtail nur Docker-Logs |
| Image Versioning | 🟡 | 4/11 exakt, 3/11 Minor, 2/11 nur Major (postgres, mosquitto), 2/11 Dockerfile |
| depends_on | 🟡 | 7/8 mit condition, 1 ohne (el-frontend → el-servador) |
| Container-User | 🟡 | 7/11 non-root, 4/11 root (postgres, mqtt, promtail, mqtt-exporter) |
| Resource Limits | ❌ | Keine Limits definiert (kein `deploy.resources`) – Dev OK, Prod PFLICHT |

---

# TEIL G: PROBLEMZONEN-KARTE (Verifiziert 2026-02-09)

> **Zweck:** Auf einen Blick sehen wo die echten Probleme liegen.
> **Methode:** verify-plan + system-control gegen laufenden Stack + Config-Dateien.

```
┌─────────────────────────────────────────────────────────────────┐
│                AUTOMATIONONE INFRASTRUKTUR-HEALTH               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  DOCKER-COMPOSE (docker-compose.yml)                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ✅ container_name    11/11                                 │ │
│  │ ✅ restart           11/11                                 │ │
│  │ ✅ networks          11/11                                 │ │
│  │ 🟡 healthcheck       10/11  (mosquitto-exporter FEHLT)    │ │
│  │ 🔴 start_period       2/11  (nur server + frontend)       │ │
│  │ 🔴 logging            9/11  (postgres + mqtt FEHLT)       │ │
│  │ 🟡 depends_on         7/8   (frontend ohne condition)     │ │
│  │ 🟡 image-pinning      4/11  exakt (mosquitto nur Major)   │ │
│  │ ❌ resource limits     0/11  (nicht definiert)             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  NETZWERK                                                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ✅ Single Bridge Network (Dev OK)                          │ │
│  │ 🔴 Port 1883 Binding-Problem (A0 dokumentiert)            │ │
│  │ 🟡 4 Ports unnötig extern (9187, 9234, 3100, 9090)       │ │
│  │ ❌ Keine Netzwerk-Segmentierung (Prod: 3 Zonen nötig)    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  LOGGING & MONITORING                                           │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ✅ Prometheus 4 Jobs                                       │ │
│  │ ✅ Grafana 5 Alerts + 12 Panels                           │ │
│  │ ✅ Loki v13 TSDB + Compactor                              │ │
│  │ 🔴 PostgreSQL Log 98MB ohne Rotation                      │ │
│  │ 🟡 Server Dual-Log: strukturierte Felder gehen verloren   │ │
│  │ 🟡 Promtail: kein Multiline für Python Tracebacks         │ │
│  │ 🟡 Log-Redundanz: ~240MB+ doppelt gespeichert             │ │
│  │ 🟡 Mosquitto: log_dest file ohne Rotation                 │ │
│  │ 🟡 Keine Container/Host-Metriken (cAdvisor/Node-Exporter) │ │
│  │ 🟡 Mock-ESP-Daten → ESP Offline Alert feuert dauerhaft   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  SECURITY                                                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ✅ .env in .gitignore, keine Secrets in Compose            │ │
│  │ ✅ Server + Frontend = Non-root                            │ │
│  │ 🟡 MQTT: allow_anonymous true (Dev OK)                    │ │
│  │ 🟡 4/11 Container = root                                  │ │
│  │ 🟡 Fallback-Passwords (admin) in Compose                  │ │
│  │ ❌ Keine MQTT ACL / TLS (Prod PFLICHT)                    │ │
│  │ ❌ Keine Resource Limits (Prod PFLICHT)                    │ │
│  │ ❌ Kein Reverse Proxy (Prod PFLICHT)                      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  SERVICES MIT PROBLEMEN                                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 🔴 pgAdmin         Crashed (ExitCode 127), Image-Drift    │ │
│  │ 🟡 mosquitto-exp   Kein Healthcheck                       │ │
│  │ 🟡 postgres        Kein logging-driver, kein start_period │ │
│  │ 🟡 mqtt-broker     Kein logging-driver, kein start_period │ │
│  │ 🟢 el-servador     Vollständig konfiguriert               │ │
│  │ 🟢 el-frontend     Vollständig (depends_on ohne condition)│ │
│  │ 🟢 Monitoring-Stack Funktional, start_period fehlt        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  VERIFIKATION C1-C15 STATUS                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ✅ C1  Service-Matrix          GEPRÜFT                    │ │
│  │ 🔴 C2  mosquitto-exp HC        FEHLT                      │ │
│  │ 🟡 C3  Log-Redundanz           DOPPELT (~240MB+)          │ │
│  │ 🟡 C4  Frontend depends_on     OHNE condition             │ │
│  │ 🟡 C5  mosquitto Version       NUR MAJOR                  │ │
│  │ 🟡 C6  Port-Exposure           4 UNNÖTIG EXTERN           │ │
│  │ ⏳ C7  ESP32→MQTT Pfad         TEILWEISE (Firewall offen) │ │
│  │ 🟡 C8  Server Log-Format       DUAL (JSON+Text)           │ │
│  │ ✅ C9  Alert Rules              5/5 KORREKT                │ │
│  │ 🟡 C10 ESP Offline Guard       MOCK-DATEN → FALSE POS.    │ │
│  │ 🟡 C11 Contact Points          PHASE 1 OK                 │ │
│  │ 🟡 C12 Container/Host Metrics  NUR SERVER-PROZESS         │ │
│  │ ✅ C13 Container-User           7/11 NON-ROOT              │ │
│  │ 🟡 C14 Mosquitto Log            1MB, OHNE ROTATION         │ │
│  │ ✅ C15 Secrets-Hygiene          OK (Fallback-PW schwach)   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  SCORE: 🔴 4 Kritisch | 🟡 15 Warnung | ✅ 8 OK | ⏳ 1 Offen  │
└─────────────────────────────────────────────────────────────────┘
```

### Nächste Schritte für TM

1. **SOFORT (E1-E3):** Port 1883 Fix, pgAdmin Rebuild, PostgreSQL log_filename Fix
2. **DOCKER-HYGIENE (E4-E9):** start_period + logging für alle Services, mosquitto-exporter HC, mosquitto Image Pin, depends_on condition
3. **MONITORING (E4, C8, C12):** Promtail Server-Parser, Multiline-Stage, cAdvisor evaluieren
4. **AUFRÄUMEN (E10-E11):** Verwaiste Volumes, Mock-ESP-Daten
5. **PRE-PRODUCTION:** MQTT Auth/ACL, Netzwerk-Segmentierung, Resource Limits, Reverse Proxy
