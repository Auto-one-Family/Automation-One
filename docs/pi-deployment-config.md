# Pi-Deployment-Konfiguration — Grundeinstellungen & Anpassungsbericht

**Stand:** 2026-03-11  
**Ziel:** AutomationOne auf Raspberry Pi (Linux, aarch64, Docker) reproduzierbar deployen.  
**Kontext:** Entwicklung unter Windows, Produktion auf Pi (z.B. Host `growy.local`).

---

## Kurzfassung — Top 10 Anpassungen für Pi-Deployment

| # | Bereich | Anpassung |
|---|---------|-----------|
| 1 | **CORS** | `CORS_ALLOWED_ORIGINS` um Pi-Host erweitern (z.B. `http://growy.local:5173`, `http://growy.local`) |
| 2 | **Frontend API/WS** | `VITE_API_URL` / `VITE_WS_URL` für Build-Zeit auf Pi-Host setzen (z.B. `http://growy.local:8000`) — oder Reverse-Proxy nutzen |
| 3 | **JWT & DB-Passwort** | `JWT_SECRET_KEY` und `POSTGRES_PASSWORD` neu generieren, nicht aus `.env.example` übernehmen |
| 4 | **Docker-Architektur** | Images sind multi-arch (postgres, mosquitto, node, python, nginx) — lokaler Build auf Pi für `el-servador` und `el-frontend` nötig |
| 5 | **host.docker.internal** | ESP32-Serial-Logger nutzt `host.docker.internal` — auf Linux Pi: `network_mode: host` oder Host-IP setzen |
| 6 | **Alloy/Loki** | `com.docker.compose.project=auto-one` in `docker/alloy/config.alloy` — Compose-Projektname muss passen |
| 7 | **shared-infra-net** | `docker network create shared-infra-net` vor dem ersten Start ausführen |
| 8 | **Zeilenenden** | `.gitattributes` erzwingt LF für Shell-Skripte — bei CRLF unter Windows: `git config core.autocrlf input` |
| 9 | **Makefile** | E2E/Wokwi-Ziele nutzen Windows-Pfade (`.venv/Scripts/pytest.exe`) — auf Pi: `python -m pytest` bzw. `poetry run pytest` |
| 10 | **Grafana-URL** | `useGrafana.ts` baut URL aus `window.location.hostname:3000` — funktioniert, wenn Frontend vom Pi aus erreichbar ist |

---

## Block A: Umgebungs- und Plattform-Unterschiede

### A.1 Pfade & Dateisystem

| Ort | Pfad/Verwendung | Pi-relevant? |
|-----|-----------------|---------------|
| **docker-compose.yml** | `./El Servador`, `./El Frontend`, `./logs/server`, `./backups`, `./docker/*` | ✅ Relativ — funktioniert auf Pi |
| **Backup-Skript** | `scripts/docker/backup.sh` → `backups/automationone_*.sql.gz` | ✅ Relativ |
| **Restore-Skript** | `scripts/docker/restore.sh` → `backups/*.sql.gz` | ✅ Relativ |
| **Alloy** | `unix:///var/run/docker.sock` | ✅ Linux-Standard |
| **cAdvisor** | `/var/run/docker.sock`, `/sys`, `/var/lib/docker/` | ✅ Linux-Standard |
| **Backend config** | `LOG_FILE_PATH: logs/god_kaiser.log` | Relativ zu `/app` im Container |
| **MQTT_PASSWD_FILE_PATH** | `/etc/mosquitto/passwd` | Container-intern |

**Keine Windows-spezifischen Pfade** (kein `C:\`, keine Backslashes) in produktivem Code. Dokumentation/Reports enthalten vereinzelt `C:\`-Beispiele — nicht runtime-relevant.

### A.2 Zeilenenden (CRLF vs. LF)

| Dateityp | .gitattributes | Risiko auf Pi |
|----------|---------------|---------------|
| `*.sh` | `text eol=lf` | ✅ LF erzwungen |
| `*.py`, `*.ts`, `*.vue`, `*.yml` | `text eol=lf` | ✅ LF |
| `*.bat`, `*.cmd` | `text eol=crlf` | N/A (Windows-only) |

**Empfehlung:** Vor Clone auf Pi: `git config --global core.autocrlf input` (oder Repo mit LF klonen). Nach Clone: `git checkout -- .` falls CRLF eingeschlichen ist.

### A.3 Umgebungsvariablen — Übersicht

#### .env / .env.example (Repo-Root)

| Variable | Beispiel (Windows) | Pi-Anpassung |
|----------|--------------------|--------------|
| `POSTGRES_USER` | god_kaiser | Gleich |
| `POSTGRES_PASSWORD` | CHANGE_ME_USE_STRONG_PASSWORD | **Neu setzen** |
| `POSTGRES_DB` | god_kaiser_db | Gleich |
| `DATABASE_URL` | postgresql+asyncpg://...@postgres:5432/... | Passwort anpassen |
| `JWT_SECRET_KEY` | CHANGE_ME_GENERATE_SECURE_KEY | **Neu generieren** |
| `CORS_ALLOWED_ORIGINS` | ["http://localhost:5173","http://localhost:3000"] | **+ http://growy.local:5173, http://growy.local** |
| `VITE_API_URL` | http://localhost:8000 | **http://growy.local:8000** (wenn Frontend separat) |
| `VITE_WS_URL` | ws://localhost:8000 | **ws://growy.local:8000** |
| `ENVIRONMENT` | development | **production** |
| `LOG_LEVEL` | INFO | **WARNING** oder **ERROR** |
| `GRAFANA_ADMIN_PASSWORD` | changeme | **Neu setzen** |
| `PGADMIN_DEFAULT_PASSWORD` | changeme | **Neu setzen** |
| `ESP32_SERIAL_HOST` | host.docker.internal | Auf Pi: **Host-IP** oder weglassen (Hardware-Profil) |

#### Backend (FastAPI) — Config-Quelle

- **Datei:** `El Servador/god_kaiser_server/src/core/config.py`
- **Mechanismus:** Pydantic `BaseSettings` mit `env_file=".env"`
- **Reihenfolge:** Umgebungsvariablen überschreiben `.env`
- **Docker:** `environment:` in `docker-compose.yml` überschreibt alles

Wichtige Backend-Variablen (Auswahl):

- `DATABASE_URL`, `DATABASE_AUTO_INIT`
- `MQTT_BROKER_HOST`, `MQTT_BROKER_PORT`, `MQTT_WEBSOCKET_PORT`
- `SERVER_HOST`, `SERVER_PORT`, `SERVER_RELOAD`
- `JWT_SECRET_KEY`, `ENVIRONMENT`, `LOG_LEVEL`
- `CORS_ALLOWED_ORIGINS`

#### Frontend — Build-Zeit vs. Laufzeit

- **VITE_*** werden zur Build-Zeit eingebettet (Vite)
- **Dev-Modus:** Vite-Proxy nutzt `VITE_API_TARGET` / `VITE_WS_TARGET` (Docker-interne Namen)
- **Production:** API/WS über relative URLs (`/api/v1`, `window.location.host`) — funktioniert mit Reverse-Proxy (z.B. Nginx vor Frontend + Backend)
- **Ohne Proxy:** `VITE_API_URL` und `VITE_WS_URL` beim Build setzen, damit Frontend direkt Backend anspricht

### A.4 Ports & Netzwerk

| Service | Port(s) | Zweck |
|---------|---------|-------|
| postgres | 5432 | PostgreSQL |
| mqtt-broker | 1883, 9001 | MQTT, WebSocket |
| el-servador | 8000 | FastAPI REST + WebSocket |
| el-frontend (dev) | 5173 | Vite Dev Server |
| el-frontend (prod) | 80 | Nginx (wenn Production-Stage genutzt) |
| loki | 3100 | Loki API (Profile: monitoring) |
| alloy | 12345 | Alloy UI (Profile: monitoring) |
| prometheus | 9090 | Prometheus (Profile: monitoring) |
| grafana | 3000 | Grafana (Profile: monitoring) |
| cadvisor | 8080 | cAdvisor (Profile: monitoring) |
| mosquitto-exporter | 9234 | MQTT-Metriken (Profile: monitoring) |
| pgadmin | 5050 | pgAdmin (Profile: devtools) |

**CORS / Bind:** Server bindet auf `0.0.0.0:8000` — Zugriff vom LAN auf den Pi möglich. CORS muss alle genutzten Origins enthalten (z.B. `http://growy.local:5173`, `http://growy.local`, `http://<pi-ip>:5173`).

---

## Block B: Docker & Compose

### B.1 Compose-Dateien

| Datei | Rolle | Pi-Einsatz |
|-------|-------|------------|
| `docker-compose.yml` | Basis (Postgres, MQTT, Server, Frontend, Monitoring, DevTools, Hardware) | ✅ Kern-Stack |
| `docker-compose.dev.yml` | Hot-Reload, zusätzliche Volume-Mounts | Optional (Entwicklung auf Pi) |
| `docker-compose.test.yml` | Test-Umgebung (Dummy-Postgres, SQLite) | ❌ Nicht für Produktion |
| `docker-compose.e2e.yml` | E2E-Tests (tmpfs, feste Credentials) | ❌ Nicht für Produktion |
| `docker-compose.ci.yml` | CI (GitHub Actions) | ❌ Nicht für Produktion |

**Minimales Pi-Setup (ohne Monitoring):**

```bash
docker compose up -d postgres mqtt-broker el-servador el-frontend
```

**Mit Monitoring:**

```bash
docker compose --profile monitoring up -d
```

**Ohne** `docker-compose.dev.yml` — keine Host-Mounts für Live-Reload (Produktion).

### B.2 Images & Architektur

| Image | Quelle | Multi-Arch (arm64)? |
|-------|--------|---------------------|
| postgres:16-alpine | Docker Hub | ✅ |
| eclipse-mosquitto:2 | Docker Hub | ✅ |
| python:3.11-slim-bookworm | Docker Hub | ✅ |
| node:20-alpine | Docker Hub | ✅ |
| nginx:alpine | Docker Hub | ✅ |
| grafana/loki:3.4 | Docker Hub | ✅ |
| grafana/alloy:v1.13.1 | Docker Hub | ✅ |
| prom/prometheus:v3.2.1 | Docker Hub | ✅ |
| grafana/grafana:11.5.2 | Docker Hub | ✅ |
| gcr.io/cadvisor/cadvisor:v0.49.1 | GCR | ✅ (multi-arch) |
| dpage/pgadmin4:9.12 | Docker Hub | ✅ |
| el-servador | Lokaler Build | ✅ (python base) |
| el-frontend | Lokaler Build | ✅ (node base) |
| esp32-serial-logger | Lokaler Build | ✅ (python base) |

**Empfehlung:** Auf dem Pi `docker compose build` ausführen — Images werden für arm64 gebaut. Keine hardcodierten amd64-Basen in Dockerfiles.

### B.3 Volumes & Persistenz

| Volume | Inhalt | Pi-Persistenz |
|--------|--------|---------------|
| automationone-postgres-data | PostgreSQL-Daten | ✅ Kritisch |
| automationone-mosquitto-data | MQTT-Persistenz | ✅ Wichtig |
| automationone-loki-data | Loki-Chunks | Optional (Monitoring) |
| automationone-prometheus-data | Prometheus TSDB | Optional |
| automationone-grafana-data | Grafana-Dashboards | Optional |
| automationone-alloy-data | Alloy-State | Optional |
| automationone-pgadmin-data | pgAdmin-Server | Optional (DevTools) |

**Bind-Mounts (Host-Pfade):**

| Host-Pfad | Container | Inhalt |
|-----------|----------|--------|
| `./logs/server` | el-servador:/app/logs | Server-Logs |
| `./backups` | el-servador:/app/backups | DB-Backups |
| `./docker/postgres/postgresql.conf` | postgres | PostgreSQL-Config |
| `./docker/mosquitto/mosquitto.conf` | mqtt-broker | Mosquitto-Config |
| `./docker/loki/loki-config.yml` | loki | Loki-Config |
| `./docker/alloy/config.alloy` | alloy | Alloy-Config |
| `./docker/prometheus/prometheus.yml` | prometheus | Prometheus-Config |
| `./docker/grafana/*` | grafana | Grafana-Config/Provisioning |

**Backup-Pfad:** `./backups` (siehe `scripts/docker/backup.sh`). `make db-backup` schreibt nach `backups/automationone_<timestamp>.sql.gz`.

---

## Block C: Repo-Struktur & Abhängigkeiten

### C.1 Konfigurationsdateien

| Datei | Zweck | Pi-Anpassung |
|-------|-------|--------------|
| `.env` | Umgebungsvariablen (aus .env.example) | **Pflicht:** Passwörter, CORS, Hosts |
| `docker/postgres/postgresql.conf` | PostgreSQL-Tuning | Optional |
| `docker/mosquitto/mosquitto.conf` | MQTT-Listener, Auth | Optional: Auth für Produktion |
| `docker/loki/loki-config.yml` | Loki-Speicher, Retention | Optional |
| `docker/alloy/config.alloy` | Log-Pipeline, Docker-Filter | `com.docker.compose.project=auto-one` prüfen |
| `docker/prometheus/prometheus.yml` | Scrape-Targets | Service-Namen passen (Docker-DNS) |
| `docker/grafana/grafana.ini` | Grafana-Logging | Optional |
| `docker/grafana/provisioning/*` | Dashboards, Datasources | Optional |
| `docker/pgadmin/servers.json` | pgAdmin-Server | Host: postgres (Docker-DNS) |
| `El Frontend/docker/nginx/nginx.conf` | Nginx-Proxy (Production) | `proxy_pass http://el-servador:8000` — Docker-DNS |

**Hinweis:** Das Production-Dockerfile des Frontends nutzt aktuell **nicht** die benutzerdefinierte `nginx.conf` — es wird die Nginx-Default-Config verwendet. Für API/WS-Proxy müsste die Custom-Config ins Image integriert werden.

### C.2 Skripte & Befehle

| Skript/Befehl | Plattform | Pi-Tauglichkeit |
|---------------|-----------|-----------------|
| `scripts/docker/backup.sh` | Bash | ✅ |
| `scripts/docker/restore.sh` | Bash | ✅ |
| `scripts/loki-query.sh` | Bash | ✅ |
| `scripts/loki-query.ps1` | PowerShell | ❌ (Windows) |
| `Makefile` | Make | ✅ (außer E2E/Wokwi mit Windows-Pfaden) |

**Makefile — Pi-Anpassungen:**

- `e2e-test-backend`: nutzt `.venv/Scripts/pytest.exe` → auf Pi: `poetry run pytest` oder `python -m pytest`
- `wokwi-seed`: nutzt `.venv/Scripts/python.exe` → auf Pi: `poetry run python` oder `python`
- `loki-errors`, `loki-trace`, etc.: Makefile wählt `loki-query.sh` auf Linux automatisch

**Empfohlene Befehlsreihenfolge für erstes Starten auf dem Pi:**

1. `git clone <repo>` (oder `git pull`)
2. `cp .env.example .env`
3. `.env` bearbeiten (Passwörter, CORS, ggf. Host)
4. `docker network create shared-infra-net 2>/dev/null || true`
5. `docker compose up -d postgres mqtt-broker`
6. Warten bis Healthchecks grün
7. `docker compose up -d el-servador el-frontend`
8. Admin-User anlegen: `curl -X POST http://localhost:8000/api/v1/auth/setup -H "Content-Type: application/json" -d '{"username":"admin","password":"Admin123!","email":"admin@example.com"}'`

### C.3 Sensible Werte

| Ort | Variable | Empfehlung |
|-----|----------|------------|
| `.env` | `POSTGRES_PASSWORD` | Starkes Passwort, nicht committen |
| `.env` | `JWT_SECRET_KEY` | `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `.env` | `GRAFANA_ADMIN_PASSWORD` | Starkes Passwort |
| `.env` | `PGADMIN_DEFAULT_PASSWORD` | Starkes Passwort |
| `docker-compose.yml` | Fallbacks `admin` | Nur Dev — auf Pi überschreiben |
| `.env.ci` | CI-Credentials | Nicht für Produktion nutzen |

**Nicht committen:** `.env` ist in `.gitignore`. Auf dem Pi eine lokale `.env` aus `.env.example` erstellen und anpassen.

---

## Block D: Ausgabeformat

### D.1 Checkliste „Erstes Starten auf dem Pi“

1. [ ] Pi vorbereiten (Raspberry Pi OS 64-bit, Docker + Docker Compose installiert)
2. [ ] Repo klonen: `git clone <url> && cd Auto-one` (oder Projektordner-Name)
3. [ ] Branch prüfen: `git checkout main` (oder gewünschter Branch)
4. [ ] `.env` anlegen: `cp .env.example .env`
5. [ ] `.env` bearbeiten:
   - [ ] `POSTGRES_PASSWORD` setzen
   - [ ] `JWT_SECRET_KEY` generieren und setzen
   - [ ] `CORS_ALLOWED_ORIGINS` um Pi-Host erweitern (z.B. `http://growy.local:5173`, `http://growy.local`)
   - [ ] `ENVIRONMENT=production`, `LOG_LEVEL=WARNING`, `SERVER_RELOAD=false` (optional)
   - [ ] `COMPOSE_PROFILES=` leer lassen oder `monitoring` nur bei Bedarf
6. [ ] Netzwerk: `docker network create shared-infra-net 2>/dev/null || true`
7. [ ] Stack starten: `docker compose up -d postgres mqtt-broker el-servador el-frontend`
8. [ ] Health prüfen: `curl -s http://localhost:8000/api/v1/health/live`
9. [ ] Admin-User anlegen (falls neu): `POST /api/v1/auth/setup`
10. [ ] Frontend öffnen: `http://<pi-ip>:5173` oder `http://growy.local:5173`

### D.2 Beispiel `.env` für den Pi

```env
# AutomationOne — Pi Deployment (growy.local)
# =============================================

COMPOSE_PROFILES=

# PostgreSQL
POSTGRES_USER=god_kaiser
POSTGRES_PASSWORD=<STARKES_PASSWORT_GENERIEREN>
POSTGRES_DB=god_kaiser_db

# Server
DATABASE_URL=postgresql+asyncpg://god_kaiser:<STARKES_PASSWORT>@postgres:5432/god_kaiser_db
DATABASE_AUTO_INIT=true
JWT_SECRET_KEY=<MIT_secrets.token_urlsafe_32_GENERIEREN>

SERVER_HOST=0.0.0.0
SERVER_PORT=8000
SERVER_RELOAD=false
ENVIRONMENT=production
LOG_LEVEL=WARNING

# CORS — Pi-Host + lokale Zugriffe
CORS_ALLOWED_ORIGINS=["http://localhost:5173","http://localhost:3000","http://growy.local:5173","http://growy.local","http://192.168.1.100:5173","http://192.168.1.100"]

# MQTT (Docker-interne Namen)
MQTT_BROKER_HOST=mqtt-broker
MQTT_BROKER_PORT=1883
MQTT_WEBSOCKET_PORT=9001

# Frontend (Build-Zeit, falls kein Reverse-Proxy)
VITE_API_URL=http://growy.local:8000
VITE_WS_URL=ws://growy.local:8000
VITE_LOG_LEVEL=warn

# Grafana (falls monitoring)
GRAFANA_ADMIN_PASSWORD=<STARKES_PASSWORT>

# pgAdmin (falls devtools)
PGADMIN_DEFAULT_EMAIL=admin@automationone.local
PGADMIN_DEFAULT_PASSWORD=<STARKES_PASSWORT>
```

### D.3 Bekannte Fallstricke

| Thema | Problem | Lösung |
|-------|---------|--------|
| **host.docker.internal** | Auf Linux (ohne Docker Desktop) oft nicht verfügbar | `network_mode: host` oder `extra_hosts: - "host.docker.internal:host-gateway"` (Docker 20.10+) oder Host-IP setzen |
| **Compose-Projektname** | Alloy filtert `com.docker.compose.project=auto-one` | Ordner `auto-one` oder `COMPOSE_PROJECT_NAME=auto-one` setzen |
| **Grafana-URL** | `useGrafana.ts` nutzt `window.location.hostname:3000` | Wenn Frontend auf Port 5173: Grafana auf 3000 muss vom Client erreichbar sein |
| **Frontend Production** | Nginx-Dockerfile nutzt keine Custom-Config | API/WS-Proxy fehlt — entweder Custom-Config ins Image oder Reverse-Proxy vor dem Stack |
| **Zeilenenden** | CRLF in Shell-Skripten | `git config core.autocrlf input` vor Clone; `.gitattributes` erzwingt LF |
| **Firewall** | Ports von außen blockiert | 5173, 8000, 1883, 9001 ggf. freigeben |
| **ESP32 MQTT** | ESPs müssen Broker erreichen | MQTT auf 1883 (und ggf. 9001) vom LAN aus erreichbar machen |
| **postgres-exporter pg_up=0** | Password authentication failed | DB-Passwort wurde bei Volume-Init gesetzt; `.env`-Änderung wirkt nicht nachträglich. Fix: `ALTER USER god_kaiser WITH PASSWORD '<Wert aus .env>';` via `docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "..."`, danach `docker compose restart postgres-exporter` |

### D.4 Optionale Empfehlungen

#### docker-compose.pi.yml (Vorschlag)

```yaml
# docker-compose.pi.yml — Pi-spezifische Overrides
# Usage: docker compose -f docker-compose.yml -f docker-compose.pi.yml up -d

services:
  el-servador:
    environment:
      ENVIRONMENT: production
      SERVER_RELOAD: "false"
      LOG_LEVEL: WARNING
      CORS_ALLOWED_ORIGINS: '["http://localhost:5173","http://localhost:3000","http://growy.local:5173","http://growy.local"]'

  el-frontend:
    # Keine Host-Mounts für Produktion (kein docker-compose.dev.yml)
    profiles: []
```

#### scripts/pi-first-run.sh (Vorschlag)

```bash
#!/bin/bash
set -euo pipefail
echo "=== AutomationOne Pi First Run ==="
[ -f .env ] || { echo "Create .env from .env.example first!"; exit 1; }
docker network create shared-infra-net 2>/dev/null || true
docker compose up -d postgres mqtt-broker
echo "Waiting for Postgres..."
sleep 15
docker compose up -d el-servador el-frontend
echo "Waiting for services..."
sleep 20
echo "Check health: curl -s http://localhost:8000/api/v1/health/live"
echo "Setup admin: curl -X POST http://localhost:8000/api/v1/auth/setup -H 'Content-Type: application/json' -d '{\"username\":\"admin\",\"password\":\"Admin123!\",\"email\":\"admin@example.com\"}'"
```

---

## Anhang: Referenz — Alle Umgebungsvariablen (Backend)

Aus `El Servador/god_kaiser_server/src/core/config.py` und `.env.example`:

- **Database:** DATABASE_URL, DATABASE_AUTO_INIT, DATABASE_POOL_SIZE, DATABASE_MAX_OVERFLOW, DATABASE_ECHO
- **MQTT:** MQTT_BROKER_HOST, MQTT_BROKER_PORT, MQTT_WEBSOCKET_PORT, MQTT_KEEPALIVE, MQTT_QOS_*, MQTT_CLIENT_ID, MQTT_USERNAME, MQTT_PASSWORD, MQTT_USE_TLS, MQTT_*_PATH
- **Server:** SERVER_HOST, SERVER_PORT, SERVER_RELOAD, SERVER_WORKERS, SERVER_LOG_LEVEL, SERVER_INTERNAL_URL
- **Security:** JWT_SECRET_KEY, JWT_ALGORITHM, JWT_ACCESS_TOKEN_EXPIRE_MINUTES, JWT_REFRESH_TOKEN_EXPIRE_DAYS, PASSWORD_*
- **CORS:** CORS_ALLOWED_ORIGINS, CORS_ALLOW_CREDENTIALS, CORS_ALLOW_METHODS, CORS_ALLOW_HEADERS
- **Logging:** LOG_LEVEL, LOG_FORMAT, LOG_FILE_PATH, LOG_FILE_MAX_BYTES, LOG_FILE_BACKUP_COUNT
- **ESP32:** ESP_DISCOVERY_*, ESP_HEARTBEAT_TIMEOUT, ESP_CONNECTION_TIMEOUT
- **Maintenance:** SENSOR_DATA_RETENTION_*, COMMAND_HISTORY_*, AUDIT_LOG_*, HEARTBEAT_LOG_*, DB_BACKUP_*
- **Resilience:** CIRCUIT_BREAKER_*, RETRY_*, TIMEOUT_*, OFFLINE_BUFFER_*
