# AutomationOne – Infrastructure Reference Architecture
# =====================================================
# Erstellt: 2026-02-09 | TM-Analyse + Web-Recherche
# Zweck: SOLL-Referenz für professionelle IoT-Infrastruktur
# Verwendung: Agent vergleicht IST-Zustand gegen dieses Dokument
#
# WICHTIG: Dies ist KEIN Auftrag. Dies ist ein Referenzdokument.
# Ein Agent soll den IST-Zustand erfassen und gegen diese Referenz prüfen.

---

## 0. PROJEKTSTRUKTUR

### 0.1 IST-Zustand (bekannt, Stand 2026-02-09)

```
Auto-one/
├── .claude/                          # AI-Agent-Konfiguration
│   ├── agents/                       # Agent-Definitionen (VS Code)
│   ├── skills/                       # Agent-Skills
│   ├── rules/                        # Agent-Regeln
│   ├── reference/                    # API-Doku, Error-Codes, Patterns
│   └── reports/current/              # Agent-Reports
│
├── .technical-manager/               # TM-Workspace (dieses Verzeichnis)
│   ├── reports/current/              # TM_REPORT.md
│   ├── commands/pending/             # Agent-Aufträge
│   ├── inbox/agent-reports/          # Konsolidierte Reports
│   └── inbox/system-logs/            # Log-Analysen
│
├── .github/workflows/                # CI/CD Pipeline
│
├── El Servador/                      # Backend (FastAPI/Python)
│   ├── god_kaiser_server/src/        # Server-Quellcode
│   └── Dockerfile                    # Server-Image
│
├── El Frontend/                      # Frontend (Vue 3/TypeScript)
│   ├── src/                          # Frontend-Quellcode
│   └── Dockerfile                    # Frontend-Image
│
├── El Trabajante/                    # ESP32 Firmware (C++/PlatformIO)
│   └── src/                          # Firmware-Quellcode
│
├── docker/                           # Docker-Konfigurationen
│   ├── grafana/
│   │   └── provisioning/
│   │       ├── alerting/
│   │       │   └── alert-rules.yml   # 5 Alert Rules (provisioned)
│   │       ├── dashboards/
│   │       │   ├── dashboards.yml    # Dashboard-Provider
│   │       │   └── system-health.json # 12 Panels
│   │       └── datasources/
│   │           └── datasources.yml   # Prometheus + Loki
│   ├── loki/
│   │   └── loki-config.yml           # Loki-Konfiguration
│   ├── mosquitto/
│   │   └── mosquitto.conf            # MQTT-Broker-Konfiguration
│   ├── pgadmin/
│   │   └── servers.json              # pgAdmin Server-Definition
│   ├── postgres/
│   │   └── postgresql.conf           # PostgreSQL Custom Config
│   ├── prometheus/
│   │   └── prometheus.yml            # 4 Scrape-Jobs
│   └── promtail/
│       └── config.yml                # Log-Shipping-Konfiguration
│
├── logs/                             # Bind-Mount Log-Verzeichnisse
│   ├── server/
│   ├── mqtt/
│   └── postgres/
│
├── docker-compose.yml                # Haupt-Compose (11 Services)
├── docker-compose.dev.yml            # Dev-Overrides
├── docker-compose.test.yml           # Test-Overrides
├── docker-compose.e2e.yml            # E2E-Overrides
├── Makefile                          # Docker-Kommandos
├── .env.example                      # Umgebungsvariablen-Template
└── .env                              # Aktive Secrets (gitignored)
```

### 0.2 SOLL-Referenz: Professionelle IoT-Monorepo-Struktur

```
project-root/
├── docker/                           # ALLE Docker-Konfigurationen
│   ├── {service}/                    # Pro Service ein Ordner
│   │   ├── config/                   # Service-spezifische Configs
│   │   └── Dockerfile                # (falls custom image)
│   └── shared/                       # Shared Configs (z.B. TLS-Certs)
│
├── services/                         # Quellcode pro Service
│   ├── backend/                      # Server/API
│   ├── frontend/                     # Dashboard/UI
│   └── firmware/                     # ESP32/Embedded
│
├── deploy/                           # Deployment-Konfigurationen
│   ├── docker-compose.yml            # Base
│   ├── docker-compose.override.yml   # Dev (auto-geladen)
│   ├── docker-compose.prod.yml       # Production
│   └── docker-compose.test.yml       # Test
│
├── scripts/                          # Operations-Scripts
│   ├── docker/                       # Backup, Restore, etc.
│   └── ci/                           # CI-Hilfsskripte
│
├── docs/                             # Projektdokumentation
├── .github/workflows/                # CI/CD
├── Makefile                          # CLI-Interface
└── .env.example                      # Variablen-Template
```

### 0.3 Bewertung AutomationOne IST vs. SOLL

| Aspekt | IST | SOLL | Bewertung |
|--------|-----|------|-----------|
| Docker-Configs zentralisiert in `docker/` | ✅ Ja | ✅ | **GUT** |
| Pro Service ein Config-Ordner | ✅ Ja (7 Ordner) | ✅ | **GUT** |
| Dockerfiles bei Services | ✅ El Servador, El Frontend | ✅ | **GUT** |
| Compose-Varianten (dev/test/e2e) | ✅ 4 Compose-Files | ✅ | **GUT** |
| Makefile als CLI-Interface | ✅ Umfangreich | ✅ | **GUT** |
| .env.example vorhanden | ✅ Dokumentiert | ✅ | **GUT** |
| Service-Namen (Leerzeichen) | ⚠️ "El Servador", "El Frontend" | Keine Leerzeichen | **AKZEPTABEL** – funktioniert, aber unkonventionell |
| Logs als Bind-Mounts | ⚠️ `./logs/{service}` | Docker json-file oder Loki only | **PRÜFEN** – doppelte Log-Wege möglich |
| Monitoring-Configs als Provisioning | ✅ IaC-konform | ✅ | **GUT** |

**Agent-Auftrag**: Prüfe ob `logs/` Bind-Mounts noch aktiv genutzt werden oder ob Promtail/Loki diese ersetzt hat. Falls redundant → Empfehlung zur Konsolidierung.

---

## 1. DOCKER-ORGANISATION

### 1.1 Compose-Architektur

#### IST-Zustand

```
docker-compose.yml          → 11 Services, 1 Netzwerk, 7 Volumes
├── Core (always on):       postgres, mqtt-broker, el-servador, el-frontend
├── Monitoring (profile):   loki, promtail, prometheus, grafana, postgres-exporter, mosquitto-exporter
└── DevTools (profile):     pgadmin
```

**Profiles-System:**
- `docker compose up -d` → nur Core (4 Services)
- `docker compose --profile monitoring up -d` → Core + Monitoring (10 Services)
- `docker compose --profile devtools up -d` → Core + DevTools (5 Services)

#### SOLL-Referenz: Docker Compose Best Practices

**1.1.1 Single vs. Multiple Compose Files**

Best Practice für IoT-Projekte dieser Größe:

| Ansatz | Wann | AutomationOne |
|--------|------|---------------|
| Single File + Profiles | < 15 Services, ein Team | ✅ Aktueller Ansatz |
| Multiple Files (app + monitoring) | > 15 Services oder separate Teams | Noch nicht nötig |
| Kubernetes | Multi-Node, Auto-Scaling nötig | Overkill für Gewächshaus |

**Bewertung**: Single File + Profiles ist KORREKT für diesen Projektumfang. Bei Wachstum über ~15 Services: Split in `docker-compose.yml` (Core) + `docker-compose.monitoring.yml` (Observability).

**1.1.2 Service-Definitionen – Pflichtfelder**

Jeder Service MUSS haben:

```yaml
services:
  example:
    image: oder build:           # Woher kommt das Image
    container_name:              # Deterministischer Name
    restart: unless-stopped      # Restart-Policy
    healthcheck:                 # Lebendigkeitsprüfung
      test: [...]
      interval: 10-30s
      timeout: 5-10s
      retries: 3-5
      start_period: 10-60s      # Für langsam startende Services
    networks:                    # Explizite Netzwerkzuweisung
      - <network>
    logging:                     # Log-Rotation
      driver: json-file
      options:
        max-size: "5m"
        max-file: "3"
```

**Agent-Auftrag**: Prüfe JEDEN der 11 Services gegen diese Checkliste:
- [ ] `container_name` gesetzt?
- [ ] `restart: unless-stopped`?
- [ ] `healthcheck` mit allen 4 Feldern (test, interval, timeout, retries)?
- [ ] `start_period` bei Services die Zeit zum Starten brauchen?
- [ ] `logging` mit Rotation?
- [ ] Explizite `networks` Zuweisung?

**Bekannte Lücken (aus docker-compose.yml-Analyse)**:
- `mosquitto-exporter`: KEIN Healthcheck definiert
- `postgres`, `mqtt-broker`: KEIN `logging` Block (nutzen Docker-Default)
- `postgres`, `mqtt-broker`: KEIN `start_period`

**1.1.3 Image-Versioning**

| Praxis | Beispiel | Bewertung |
|--------|----------|-----------|
| ❌ `latest` Tag | `grafana/grafana:latest` | VERBOTEN – nicht reproduzierbar |
| ⚠️ Major-Version | `postgres:16` | Riskant – Minor-Breaking-Changes |
| ✅ Minor-Version | `postgres:16-alpine` | GUT für Dev |
| ✅ Exakte Version | `prom/prometheus:v3.2.1` | BEST – reproduzierbar |

**IST-Zustand**:
- `postgres:16-alpine` → GUT
- `eclipse-mosquitto:2` → NUR Major → **PRÜFEN** ob Minor-Pin besser
- `grafana/loki:3.4` → Minor → GUT
- `grafana/promtail:3.4` → Minor → GUT
- `prom/prometheus:v3.2.1` → Exakt → BEST
- `grafana/grafana:11.5.2` → Exakt → BEST
- `prometheuscommunity/postgres-exporter:v0.16.0` → Exakt → BEST
- `sapcc/mosquitto-exporter:0.8.0` → Exakt → BEST
- `dpage/pgadmin4:9.12` → Minor → GUT

**1.1.4 Volumes – Named vs. Bind-Mount**

| Typ | Verwendung | Beispiel |
|-----|------------|---------|
| Named Volume | Persistente Daten (DB, Grafana-State) | `postgres_data:/var/lib/postgresql/data` |
| Bind-Mount :ro | Konfigurationen (unveränderlich) | `./docker/mosquitto/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro` |
| Bind-Mount :rw | Live-Reload Source Code (nur Dev) | `./El Servador/god_kaiser_server/src:/app/src:ro` |
| Bind-Mount für Logs | Log-Dateien | `./logs/server:/app/logs` |

**IST-Zustand – 7 Named Volumes:**
```
automationone-postgres-data       # DB-Daten
automationone-mosquitto-data      # MQTT-Persistence
automationone-loki-data           # Log-Storage
automationone-prometheus-data     # Metriken-Storage
automationone-grafana-data        # Dashboard-State + Alerting-State
automationone-promtail-positions  # Log-Cursor-Positionen
automationone-pgadmin-data        # pgAdmin-Sessions
```

**Bewertung**: Korrekt. Named Volumes für State, Bind-Mounts :ro für Configs.

**1.1.5 depends_on mit Health-Conditions**

```yaml
depends_on:
  postgres:
    condition: service_healthy    # Wartet auf gesunden Postgres
```

Best Practice: IMMER `condition: service_healthy` statt nur `depends_on: [service]`.

**IST-Zustand**: ✅ Konsequent umgesetzt bei allen relevanten Abhängigkeiten.
- el-servador wartet auf postgres (healthy) + mqtt-broker (healthy)
- el-frontend wartet auf el-servador (ohne condition – **PRÜFEN**)
- Monitoring-Services haben korrekte Abhängigkeitsketten

**Agent-Auftrag**: Prüfe ob `el-frontend` → `el-servador` die condition `service_healthy` haben sollte.

**1.1.6 Resource Limits**

Best Practice für Production:
```yaml
deploy:
  resources:
    limits:
      cpus: '0.50'
      memory: 512M
    reservations:
      cpus: '0.25'
      memory: 256M
```

**IST-Zustand**: ❌ Keine Resource-Limits definiert.
**Bewertung**: Für Development akzeptabel. Für Production PFLICHT.
**Empfehlung**: Nicht jetzt implementieren, aber in Production-Compose vorsehen.

---

## 2. NETZWERK-ARCHITEKTUR

### 2.1 IST-Zustand

```yaml
networks:
  automationone-net:
    name: automationone-net
    driver: bridge
```

**Ein einziges Flat-Network** für ALLE 11 Services. Jeder Service kann jeden anderen Service erreichen.

**Port-Exposure (IST):**

| Service | Host-Port | Container-Port | Intern nötig? |
|---------|-----------|----------------|---------------|
| postgres | 5432:5432 | 5432 | Extern für Dev-Tools (DBeaver etc.) |
| mqtt-broker | 1883:1883 | 1883 | Extern für ESP32-Geräte |
| mqtt-broker | 9001:9001 | 9001 | Extern für WebSocket-Clients |
| el-servador | 8000:8000 | 8000 | Extern für Frontend + API-Zugriff |
| el-frontend | 5173:5173 | 5173 | Extern für Browser |
| loki | 3100:3100 | 3100 | ⚠️ NUR intern nötig |
| prometheus | 9090:9090 | 9090 | ⚠️ NUR intern nötig (außer Debug) |
| grafana | 3000:3000 | 3000 | Extern für Dashboard-Zugriff |
| postgres-exporter | 9187:9187 | 9187 | ⚠️ NUR intern nötig |
| mosquitto-exporter | 9234:9234 | 9234 | ⚠️ NUR intern nötig |
| pgadmin | 5050:80 | 80 | Extern für DB-Management |

### 2.2 SOLL-Referenz: Netzwerk-Segmentierung

#### 2.2.1 Production Best Practice: Multi-Network

```
┌─────────────────────────────────────────────────────────┐
│                    frontend-net                          │
│  [el-frontend] ←→ [el-servador]                         │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────┼─────────────────────────────────┐
│                  backend-net                             │
│  [el-servador] ←→ [postgres] ←→ [mqtt-broker]           │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────┼─────────────────────────────────┐
│               monitoring-net                             │
│  [prometheus] ←→ [grafana] ←→ [loki] ←→ [promtail]     │
│  [postgres-exporter] [mosquitto-exporter]                │
└─────────────────────────────────────────────────────────┘
```

**Segmentierungsregeln:**
- `frontend-net`: el-frontend + el-servador (Frontend erreicht nur API)
- `backend-net`: el-servador + postgres + mqtt-broker (Daten-Layer)
- `monitoring-net`: Alle Monitoring-Services + Zugriff auf überwachte Services

**Bridge-Services** (in mehreren Netzen):
- `el-servador`: frontend-net + backend-net + monitoring-net (wird gescraped)
- `postgres`: backend-net + monitoring-net (Exporter braucht Zugang)
- `mqtt-broker`: backend-net + monitoring-net (Exporter braucht Zugang)

#### 2.2.2 Bewertung für AutomationOne

| Ansatz | Sicherheit | Komplexität | Empfehlung |
|--------|-----------|-------------|-----------|
| Single Network (IST) | Niedrig | Niedrig | ✅ OK für Development |
| Multi-Network (SOLL) | Hoch | Mittel | 🎯 Production-Ziel |

**Für Development** ist das aktuelle Flat-Network AKZEPTABEL:
- Schnellere Iteration
- Weniger Debug-Aufwand bei Netzwerkproblemen
- Alle Services müssen ohnehin miteinander kommunizieren

**Für Production** MUSS segmentiert werden:
- ESP32-Geräte haben nur MQTT-Zugriff, nicht DB oder API
- Frontend hat nur API-Zugriff, nicht DB oder MQTT intern
- Monitoring ist isoliert vom Daten-Layer

#### 2.2.3 Port-Exposure – Minimierungsregeln

**SOLL: Nur exponieren was von AUSSERHALB Docker gebraucht wird.**

```yaml
# CORRECT: Nur intern erreichbar (kein ports:, nur expose:)
postgres-exporter:
  expose:
    - "9187"

# CORRECT: Von extern erreichbar (Host:Container)
el-frontend:
  ports:
    - "5173:5173"
```

**Empfehlung für AutomationOne:**

| Service | Jetzt | Production | Grund |
|---------|-------|-----------|-------|
| postgres | `5432:5432` | `expose: 5432` | Nur intern, externe Tools über pgAdmin |
| mqtt-broker | `1883:1883` | `1883:1883` | ESP32-Geräte verbinden von außen |
| mqtt-broker | `9001:9001` | `9001:9001` | WebSocket für Frontend |
| el-servador | `8000:8000` | `8000:8000` | API-Zugriff |
| el-frontend | `5173:5173` | `5173:5173` (oder Reverse Proxy) | Browser |
| loki | `3100:3100` | `expose: 3100` | Nur Promtail + Grafana intern |
| prometheus | `9090:9090` | `expose: 9090` | Nur Grafana intern |
| grafana | `3000:3000` | `3000:3000` | Dashboard extern |
| postgres-exporter | `9187:9187` | `expose: 9187` | Nur Prometheus intern |
| mosquitto-exporter | `9234:9234` | `expose: 9234` | Nur Prometheus intern |
| pgadmin | `5050:80` | `5050:80` | Dev-Tool extern |

**Agent-Auftrag**: Erfasse den IST-Zustand aller `ports:` und `expose:` Definitionen. Markiere welche in Production auf `expose:` umgestellt werden sollten.

#### 2.2.4 WSL2-Netzwerk-Kontext

AutomationOne läuft auf Windows + Docker Desktop + WSL2.

**Relevante Besonderheiten:**
- Docker Desktop nutzt WSL2 mirrored networking (ab Docker Desktop 4.x)
- `localhost` auf Windows = Container-Ports erreichbar
- ESP32-Geräte im LAN brauchen die HOST-IP (nicht localhost)
- MQTT-Broker muss auf der Host-IP lauschen: `0.0.0.0:1883`

**Agent-Auftrag**: Prüfe ob ESP32 → MQTT-Broker Kommunikation über HOST-IP konfiguriert ist (in Firmware und/oder MQTT-Config). Dokumentiere den aktuellen Netzwerkpfad ESP32 → Docker.

---

## 3. MQTT-BROKER (MOSQUITTO)

### 3.1 IST-Zustand

```conf
# Authentifizierung
allow_anonymous true              # ⚠️ DEVELOPMENT ONLY

# Listener
listener 1883                     # MQTT (plain)
listener 9001                     # WebSocket (plain)
protocol websockets

# Persistence
persistence true

# Logging
log_dest file /mosquitto/log/mosquitto.log
log_dest stdout
log_type error warning notice information subscribe unsubscribe
```

### 3.2 SOLL-Referenz: MQTT Security Layers

#### Layer 1: Authentifizierung (MUSS für Production)

```conf
allow_anonymous false
password_file /mosquitto/config/passwd
```

**Benutzer-Konzept für Gewächshaus-IoT:**

| Client | Username | Rechte | Beispiel |
|--------|----------|--------|---------|
| Server (el-servador) | `god_kaiser` | Full read/write auf `ao/#` | Subscribe + Publish auf alle Topics |
| ESP32-Device | `esp_{device_id}` | Write: `ao/{own_id}/#`, Read: `ao/{own_id}/cmd/#` | Nur eigene Topics |
| Frontend (WebSocket) | `dashboard` | Read-only auf `ao/#` | Nur subscriben |
| Monitoring | `monitor` | Read-only auf `$SYS/#` | Broker-Metriken |

#### Layer 2: Access Control Lists (ACL)

```conf
acl_file /mosquitto/config/acl

# ACL-Datei Inhalt:
# Server hat vollen Zugriff
user god_kaiser
topic readwrite ao/#

# ESP32 nur eigene Topics (Pattern mit %u = Username)
pattern readwrite ao/%u/#

# Dashboard read-only
user dashboard
topic read ao/#

# Monitoring
user monitor
topic read $SYS/#
```

#### Layer 3: TLS-Verschlüsselung (Production)

```conf
listener 8883
protocol mqtt
cafile /mosquitto/certs/ca.crt
certfile /mosquitto/certs/server.crt
keyfile /mosquitto/certs/server.key
require_certificate false           # Client-Certs optional
```

#### 3.3 Bewertung

| Aspekt | IST | SOLL Dev | SOLL Prod |
|--------|-----|----------|-----------|
| Anonymous Access | ✅ true | ✅ true | ❌ false + passwd |
| ACL | ❌ Keine | Optional | ✅ Pflicht |
| TLS | ❌ Nein | Nicht nötig | ✅ Pflicht |
| Message Size Limit | ✅ 256KB | ✅ | ✅ |
| Persistence | ✅ On | ✅ | ✅ |
| Log-Rotation | ❌ Nicht konfiguriert | ⚠️ Prüfen | ✅ Pflicht |

**Agent-Auftrag**: Prüfe ob Mosquitto-Log-Rotation konfiguriert ist. Bei `log_dest file` ohne Rotation wachsen Logs unbegrenzt.

---

## 4. POSTGRESQL-KONFIGURATION

### 4.1 IST-Zustand

```conf
listen_addresses = '*'              # Alle Interfaces
logging_collector = on
log_statement = 'mod'               # INSERT/UPDATE/DELETE/DDL
log_min_duration_statement = 100    # Slow Queries > 100ms
log_connections = on
log_disconnections = on
log_rotation_age = 1d
log_rotation_size = 50MB
```

### 4.2 SOLL-Referenz

| Aspekt | IST | Bewertung |
|--------|-----|-----------|
| Logging Collector | ✅ On | GUT |
| Slow Query Detection | ✅ 100ms | GUT – typischer Wert |
| Log Rotation | ✅ 1d / 50MB | GUT |
| Connection Logging | ✅ On | GUT für Debug |
| `listen_addresses = '*'` | ⚠️ | OK in Docker (nur Container-Netz), aber in Prod mit Netzwerk-Segmentierung koppeln |
| SSL/TLS | ❌ Nicht konfiguriert | Nicht nötig in Docker-Netz, Pflicht wenn extern exponiert |
| Connection Limits | ❌ Default | Prüfen für Production |
| Shared Buffers / Work Mem | ❌ Default | Tuning für Production |

**Bewertung**: Für Development gut konfiguriert. Für Production fehlen Performance-Tuning und Connection-Limits.

---

## 5. MONITORING STACK

### 5.1 Architektur-Übersicht

```
                          ┌─────────────┐
                          │   Grafana    │ :3000
                          │  11.5.2     │
                          └──────┬──────┘
                                 │
                    ┌────────────┼────────────┐
                    │                         │
             ┌──────┴──────┐          ┌───────┴──────┐
             │ Prometheus  │          │     Loki     │
             │  v3.2.1     │ :9090    │     3.4      │ :3100
             └──────┬──────┘          └───────┬──────┘
                    │                         │
        ┌───────────┼───────────┐       ┌─────┴──────┐
        │           │           │       │  Promtail  │
   ┌────┴────┐ ┌────┴────┐ ┌───┴────┐  │    3.4     │
   │el-serv. │ │pg-export│ │mq-export│  └────────────┘
   │ :8000   │ │ :9187   │ │ :9234  │  Liest Docker-
   │ /metrics│ │ /metrics│ │ /metrics│  Logs via Socket
   └─────────┘ └─────────┘ └────────┘
```

### 5.2 Prometheus – Scrape-Jobs

**IST: 4 Jobs**

| Job | Target | Metrics-Path | Intervall |
|-----|--------|-------------|-----------|
| `el-servador` | `el-servador:8000` | `/api/v1/health/metrics` | 15s |
| `postgres` | `postgres-exporter:9187` | `/metrics` (default) | 15s |
| `prometheus` | `localhost:9090` | `/metrics` (default) | 15s |
| `mqtt-broker` | `mosquitto-exporter:9234` | `/metrics` (default) | 15s |

**SOLL-Referenz:**

| Aspekt | IST | Best Practice | Bewertung |
|--------|-----|--------------|-----------|
| Custom Metrics-Path | ✅ el-servador | ✅ | GUT – folgt API-Konvention |
| Exporter-Pattern | ✅ Separate Exporter für PG + MQTT | ✅ | GUT – Standard-Ansatz |
| Self-Monitoring | ✅ Prometheus scraped sich selbst | ✅ | GUT |
| Labels | ✅ service + environment | ✅ | GUT |
| Retention | ✅ 7d (`--storage.tsdb.retention.time=7d`) | ✅ für Dev | GUT |
| Lifecycle API | ✅ `--web.enable-lifecycle` | ✅ | GUT – erlaubt Config-Reload |
| Alerting Rules in Prometheus | ❌ Nicht vorhanden | Optional | OK – Grafana übernimmt Alerting |

**Fehlend (optional):**
- `scrape_timeout` nicht explizit gesetzt (Default: 10s) → OK
- Keine `relabel_configs` → Für diesen Umfang nicht nötig
- Kein Node-Exporter → Kein Host-Metriken-Monitoring (bewusste Entscheidung?)

**Agent-Auftrag**: Prüfe ob ein Node-Exporter für Host-Metriken (CPU, RAM, Disk des Docker-Hosts) sinnvoll wäre, oder ob `god_kaiser_memory_percent` vom Server ausreicht.

### 5.3 Loki – Log-Aggregation

**IST-Zustand:**

```yaml
auth_enabled: false                 # Single-Tenant
schema: v13 (TSDB)                  # Aktuell
storage: filesystem                 # Lokal
retention: 168h (7 Tage)            # Automatische Bereinigung
compactor: retention_enabled: true  # Aktiv
```

**SOLL-Referenz:**

| Aspekt | IST | Best Practice | Bewertung |
|--------|-----|--------------|-----------|
| Schema v13 TSDB | ✅ | ✅ Aktuell | GUT |
| Filesystem Storage | ✅ | ✅ für Single-Node | GUT |
| Retention 7d | ✅ | ✅ für Dev | GUT |
| Compactor aktiv | ✅ | ✅ | GUT |
| Auth disabled | ✅ | ✅ für Single-Node | OK |
| Replication Factor 1 | ✅ | ✅ für Single-Node | GUT |

**Bewertung**: Solide Konfiguration für Single-Node Development.

### 5.4 Promtail – Log-Shipping

**IST-Zustand:**

```yaml
# Discovery
docker_sd_configs mit Filter: com.docker.compose.project=auto-one

# Labels
container, stream, service, compose_service, compose_project

# Pipeline
- docker: {}                                    # Docker-Log-Parsing
- Drop Health-Check Logs (el-servador)           # Noise-Reduction
- JSON-Parsing für el-frontend (level, component) # Strukturierte Labels
```

**SOLL-Referenz:**

| Aspekt | IST | Best Practice | Bewertung |
|--------|-----|--------------|-----------|
| Docker SD | ✅ | ✅ | GUT – automatische Discovery |
| Project-Filter | ✅ `auto-one` | ✅ | GUT – nur eigene Container |
| Health-Check Drop | ✅ el-servador | ✅ | GUT – reduziert Noise |
| JSON-Parsing | ✅ el-frontend | ✅ | GUT – strukturierte Labels |
| Positions-Persistence | ✅ Named Volume | ✅ | GUT – kein Log-Verlust bei Restart |

**Fehlend (optional):**
- Kein Rate-Limiting konfiguriert → Bei hohem Log-Volume relevant
- Kein JSON-Parsing für el-servador → Prüfen ob Server strukturiert loggt
- Kein Multiline-Parsing → Relevant für Python-Tracebacks

**Agent-Auftrag**: Prüfe ob el-servador strukturierte (JSON) Logs ausgibt. Falls ja, sollte Promtail analog zum Frontend einen JSON-Parser mit Level-Label haben. Python-Tracebacks (multiline) brauchen ggf. multiline-Stage.

### 5.5 Grafana – Dashboards & Alerting

#### 5.5.1 Provisioning-Struktur

```
docker/grafana/provisioning/
├── alerting/
│   └── alert-rules.yml        # 5 Rules, 2 Gruppen
├── dashboards/
│   ├── dashboards.yml          # Provider-Config
│   └── system-health.json      # 12 Panels
└── datasources/
    └── datasources.yml         # Prometheus (uid: prometheus) + Loki (uid: loki)
```

**Volume:** `:ro` (Read-Only) → IaC-konform, keine UI-Änderungen möglich.

#### 5.5.2 Datasources

| Name | Type | URL | UID | Default |
|------|------|-----|-----|---------|
| Prometheus | prometheus | `http://prometheus:9090` | `prometheus` | ✅ Yes |
| Loki | loki | `http://loki:3100` | `loki` | No |

**Bewertung**: ✅ Korrekt. UIDs sind stabil und werden in Alerts + Dashboards referenziert.

#### 5.5.3 Dashboard: System Health (12 Panels)

| ID | Titel | Typ | Quelle | Abfrage |
|----|-------|-----|--------|---------|
| 1 | Server Health Status | stat | Prometheus | `up{job="el-servador"}` |
| 2 | MQTT Broker Status | stat | Prometheus | `god_kaiser_mqtt_connected` |
| 3 | Database Status | stat | Prometheus | `pg_up` |
| 4 | Frontend Errors (5m) | stat | Loki | `count_over_time({compose_service="el-frontend", level="error"}[5m])` |
| 5 | Log Volume by Service | timeseries | Loki | `count_over_time({compose_project="auto-one"}[5m]) by (compose_service)` |
| 6 | Recent Error Logs | logs | Loki | `{compose_project="auto-one"} \|~ "(?i)(error\|exception\|fail\|critical)"` |
| 7 | MQTT Broker Metrics (Row) | row | — | Collapsed Section Header |
| 8 | MQTT Broker Up | stat | Prometheus | `up{job="mqtt-broker"}` |
| 9 | Connected Clients | stat | Prometheus | `broker_clients_connected{job="mqtt-broker"}` |
| 10 | Messages Dropped | stat | Prometheus | `broker_publish_messages_dropped{job="mqtt-broker"}` |
| 11 | Subscriptions | stat | Prometheus | `broker_subscriptions_count{job="mqtt-broker"}` |
| 12 | MQTT Message Rate | timeseries | Prometheus | `rate(broker_messages_received[5m])` + `rate(broker_messages_sent[5m])` |

**Bewertung**: Gute Abdeckung der kritischen Systembereiche. Kombination aus Prometheus-Metriken und Loki-Logs in einem Dashboard.

**Fehlend (für zukünftige Iteration):**
- Kein PostgreSQL-Detail-Panel (Connections, Query-Latenz)
- Kein ESP32-Device-Status-Panel (Online/Offline pro Device)
- Kein Memory/CPU-Trend-Panel (trotz Alert-Rule dafür)

#### 5.5.4 Alert Rules (5 Rules, 2 Gruppen)

**Gruppe 1: `automationone-critical`** (Evaluation: 10s)

| UID | Titel | Query | Threshold | For | noDataState |
|-----|-------|-------|-----------|-----|-------------|
| `ao-server-down` | Server Down | `up{job="el-servador"}` | B(reduce:last) → C(< 1) | 1m | Alerting |
| `ao-mqtt-disconnected` | MQTT Disconnected | `god_kaiser_mqtt_connected` | B(reduce:last) → C(< 1) | 1m | Alerting |
| `ao-database-down` | Database Down | `pg_up` | B(reduce:last) → C(< 1) | 1m | Alerting |

**Gruppe 2: `automationone-warnings`** (Evaluation: 1m)

| UID | Titel | Query | Threshold | For | noDataState |
|-----|-------|-------|-----------|-----|-------------|
| `ao-high-memory` | High Memory | `god_kaiser_memory_percent` | B(reduce:last) → C(> 85) | 5m | OK |
| `ao-esp-offline` | ESP Offline | `god_kaiser_esp_offline > 0 and god_kaiser_esp_total > 0` | B(reduce:last) → C(> 0) | 3m | OK |

**Pipeline pro Rule:** A (PromQL) → B (Reduce: last) → C (Threshold)

**SOLL-Referenz – Alerting Best Practices:**

| Aspekt | IST | Best Practice | Bewertung |
|--------|-----|--------------|-----------|
| 3-Step Pipeline (A→B→C) | ✅ | ✅ | GUT – Standard Grafana Pattern |
| Critical: noDataState=Alerting | ✅ | ✅ | GUT – "kein Signal = Problem" |
| Warning: noDataState=OK | ✅ | ✅ | GUT – kein False-Positive |
| For-Duration Critical: 1m | ✅ | ✅ | GUT – nicht zu empfindlich |
| For-Duration Warning: 3-5m | ✅ | ✅ | GUT |
| Labels: severity + component | ✅ | ✅ | GUT – Routing-fähig |
| Annotations: summary + description | ✅ | ✅ | GUT |
| Datasource UIDs verifiziert | ✅ `prometheus` | ✅ | GUT – match mit datasources.yml |
| Evaluation Interval 10s | ✅ | ⚠️ | PRÜFEN – 10s ist aggressiv, Standard ist 1m |

**Offene Punkte (aus vorheriger TM-Analyse):**
- Rule 5 Guard: PromQL `and` in Alert-Query → Funktionalität verifizieren
- Kein Contact Point definiert → Phase 1 = UI-only, Default Email Contact Point von Grafana
- Keine Notification Policy → Default Grafana Policy (alle Alerts → Default Contact Point)

**Agent-Auftrag**: Verifiziere:
1. Werden alle 5 Alert Rules von Grafana erfolgreich geladen? (UI Check oder API: `GET /api/v1/provisioning/alert-rules`)
2. Welchen State haben die Rules? (Normal/Firing/Error/NoData)
3. Funktioniert Rule 5 (ESP Offline) korrekt mit dem PromQL `and` Guard wenn `esp_total == 0`?
4. Gibt es einen Default Contact Point in Grafana? (Muss für Alerting existieren)

---

## 6. SECURITY-CHECKLISTE

### 6.1 Development (IST) vs. Production (SOLL)

| Bereich | Development (IST) | Production (SOLL) | Priorität |
|---------|-------------------|-------------------|-----------|
| MQTT Auth | `allow_anonymous true` | passwd + ACL | KRITISCH |
| MQTT Encryption | Plain MQTT/WS | TLS auf 8883 | HOCH |
| DB Passwort | .env (gitignored) | Secrets Manager / Docker Secrets | HOCH |
| JWT Secret | .env (gitignored) | Secrets Manager | HOCH |
| Grafana Password | .env Fallback `admin` | Strong password + OIDC | HOCH |
| Port Exposure | Alle exposed | Nur nötige | MITTEL |
| Network Segmentation | Single flat | Multi-network | MITTEL |
| Container User | Default (root?) | Non-root | MITTEL |
| Read-Only Filesystem | Nein | `read_only: true` + tmpfs | NIEDRIG |
| Image Scanning | Nein | Trivy/Scout in CI | NIEDRIG |

**Agent-Auftrag**: Prüfe ob Container als root oder non-root User laufen (`docker exec {container} whoami` oder `docker inspect --format='{{.Config.User}}'`).

---

## 7. ZUSAMMENFASSUNG: GESAMTBEWERTUNG

### Was AutomationOne RICHTIG macht

1. **IaC-Ansatz**: Alle Konfigurationen als Files, Grafana-Provisioning read-only
2. **Profiles-System**: Saubere Trennung Core / Monitoring / DevTools
3. **Healthchecks**: Konsequent bei fast allen Services
4. **Named Volumes**: Korrekte Trennung State vs. Config
5. **Makefile**: Vollständiges CLI-Interface
6. **Monitoring-Stack**: Prometheus + Loki + Grafana + Promtail vollständig
7. **Alert Rules**: 5 sinnvolle Rules mit korrekter Pipeline
8. **Docker-Logging**: json-file Driver mit Rotation bei den meisten Services
9. **Dependency Chains**: service_healthy Conditions
10. **Image Pinning**: Meist Minor oder Exact Versions

### Was für Production fehlt

1. **MQTT-Authentifizierung** (KRITISCH)
2. **Netzwerk-Segmentierung** (HOCH)
3. **Port-Minimierung** (HOCH)
4. **Resource Limits** (MITTEL)
5. **Non-Root Container** (MITTEL)
6. **TLS für MQTT** (HOCH wenn extern exponiert)
7. **Docker Secrets** statt .env für sensible Daten (HOCH)

### Offene Verifikationen (Agent-Aufträge in diesem Dokument)

| # | Prüfung | Bereich |
|---|---------|---------|
| 1 | `logs/` Bind-Mounts vs. Promtail/Loki Redundanz | Docker |
| 2 | Service-Checkliste (Healthcheck, Logging, etc.) für alle 11 Services | Docker |
| 3 | `el-frontend` → `el-servador` dependency condition | Docker |
| 4 | IST aller ports: vs. expose: | Netzwerk |
| 5 | ESP32 → MQTT Netzwerkpfad über WSL2/Docker | Netzwerk |
| 6 | Mosquitto Log-Rotation | MQTT |
| 7 | Node-Exporter Bedarf | Monitoring |
| 8 | el-servador Log-Format (JSON?) + Promtail-Parsing | Monitoring |
| 9 | Alert Rules geladen + State | Monitoring |
| 10 | Rule 5 ESP Guard Funktionalität | Monitoring |
| 11 | Container User (root/non-root) | Security |
| 12 | mosquitto-exporter Healthcheck fehlt | Docker |

---

## 8. ANWEISUNGEN FÜR DEN PRÜFENDEN AGENT

Dieses Dokument ist die SOLL-Referenz. Der Agent soll:

1. **Den IST-Zustand vollständig erfassen** – jede Datei lesen die hier referenziert wird
2. **Punkt für Punkt vergleichen** – IST vs. SOLL aus diesem Dokument
3. **Abweichungen klar markieren** mit: ✅ MATCH, ⚠️ ABWEICHUNG (akzeptabel), ❌ ABWEICHUNG (handlungsbedarf)
4. **Die 12 offenen Verifikationen** (Abschnitt 7) durchführen und Ergebnisse dokumentieren
5. **KEINE Änderungen vornehmen** – nur Report erstellen

Report-Format:
```
## IST vs. SOLL Vergleich
[Punkt für Punkt mit Bewertung]

## Verifikationsergebnisse
[12 Punkte mit konkreten Ergebnissen]

## Empfehlungen
[Priorisiert nach Kritikalität]
```

Report an: `.technical-manager/inbox/agent-reports/infrastructure-audit-{YYYY-MM-DD}.md`
