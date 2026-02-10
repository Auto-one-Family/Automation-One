# Docker-Infrastruktur Referenz - AutomationOne

**Version:** 1.5
**Datum:** 2026-02-10
**Zweck:** Vollstaendige Referenz fuer Docker-Stack Architektur und Befehle

---

## 0. Stack-Nutzung (Quick-Start)

**Typischer Ablauf:**
1. `docker compose up -d` (oder `make up`) – Core-Stack starten
2. `docker compose ps` – Status pruefen
3. `docker compose logs -f el-servador` (oder `make logs-server`) – Server-Logs
4. `docker compose down` – Stack stoppen

**Windows:** `make` ist oft nicht auf PATH. Nutze direkt `docker compose` (siehe Section 2.1 Spalte Befehl).

**Container-Namen:** Service `el-servador` = Container `automationone-server`; Service `postgres` = Container `automationone-postgres`; Service `mqtt-broker` = Container `automationone-mqtt`.

---

## 1. Architektur

### 1.1 Service-Uebersicht

| Service | Container-Name | Image | Ports | Profile | Healthcheck |
|---------|---------------|-------|-------|---------|-------------|
| postgres | automationone-postgres | postgres:16-alpine | 5432 | - | pg_isready |
| mqtt-broker | automationone-mqtt | eclipse-mosquitto:2 | 1883, 9001 | - | mosquitto_sub |
| el-servador | automationone-server | Custom Build | 8000 | - | curl /api/v1/health/live |
| el-frontend | automationone-frontend | Custom Build | 5173 | - | node fetch |
| loki | automationone-loki | grafana/loki:3.4 | 3100 | monitoring | wget /ready |
| promtail | automationone-promtail | grafana/promtail:3.4 | 9080 (intern) | monitoring | bash /dev/tcp/localhost/9080 |
| prometheus | automationone-prometheus | prom/prometheus:v3.2.1 | 9090 | monitoring | wget /-/healthy |
| grafana | automationone-grafana | grafana/grafana:11.5.2 | 3000 | monitoring | wget /api/health |
| postgres-exporter | automationone-postgres-exporter | prometheuscommunity/postgres-exporter:v0.16.0 | 9187 | monitoring | wget /metrics |
| mosquitto-exporter | automationone-mosquitto-exporter | sapcc/mosquitto-exporter:0.8.0 | 9234 | monitoring | wget /metrics |
| pgadmin | automationone-pgadmin | dpage/pgadmin4:9.12 | 5050 | devtools | wget /misc/ping |

### 1.2 Compose-Dateien

| Datei | Zweck | Verwendung |
|-------|-------|------------|
| docker-compose.yml | Basis-Stack (4 Core + 6 Monitoring + 1 DevTools) | `docker compose up -d` |
| docker-compose.dev.yml | Dev Overrides (Volume-Mounts, Reload) | `-f ... -f docker-compose.dev.yml` |
| docker-compose.test.yml | Test Overrides (SQLite, Dummy-Postgres) | `-f ... -f docker-compose.test.yml` |
| docker-compose.ci.yml | CI Overrides (tmpfs, schnelle Healthchecks) | In GitHub Actions |
| docker-compose.e2e.yml | E2E Overrides (Full-Stack fuer Playwright) | `make e2e-up` |

### 1.3 Netzwerk

| Netzwerk | Driver | Zweck |
|----------|--------|-------|
| automationone-net | bridge | Alle Services verbunden |

**Service-Discovery:** Alle Services erreichen sich via Container-Name (z.B. `postgres:5432`).

### 1.4 Volumes

| Volume | Service | Zweck | Persistenz |
|--------|---------|-------|------------|
| automationone-postgres-data | postgres | DB-Daten | Persistent |
| automationone-mosquitto-data | mqtt-broker | MQTT-Persistenz | Persistent |
| automationone-loki-data | loki | Log-Storage | Persistent |
| automationone-prometheus-data | prometheus | Metriken | Persistent |
| automationone-grafana-data | grafana | Dashboards | Persistent |
| automationone-pgadmin-data | pgadmin | Einstellungen, Queries | Persistent |

**Bind-Mounts (Logs):**

| Host-Pfad | Service | Container-Pfad |
|-----------|---------|----------------|
| `./logs/server/` | el-servador | `/app/logs` |
| `./logs/mqtt/` | mqtt-broker | `/mosquitto/log` |
| `./logs/postgres/` | postgres | `/var/log/postgresql` |

---

## 2. Befehle Quick-Reference

### 2.1 Makefile-Targets (Stack Lifecycle)

| Target | Befehl | Beschreibung |
|--------|--------|--------------|
| `make up` | `docker compose up -d` | Start Core-Stack |
| `make down` | `docker compose down` | Stop Core-Stack |
| `make dev` | `-f docker-compose.dev.yml up -d` | Start mit Hot-Reload |
| `make dev-down` | `-f docker-compose.dev.yml down` | Stop Dev-Stack |
| `make test` | `-f docker-compose.test.yml up -d` | Start Test-Stack |
| `make test-down` | `-f docker-compose.test.yml down -v` | Stop Test + Volumes |
| `make build` | `docker compose build` | Images neu bauen |
| `make clean` | `down -v --remove-orphans` | Alles entfernen (DESTRUCTIVE) |

### 2.2 E2E-Targets

| Target | Befehl | Beschreibung |
|--------|--------|--------------|
| `make e2e-up` | `-f docker-compose.e2e.yml up -d --wait` | Full-Stack starten |
| `make e2e-down` | `-f docker-compose.e2e.yml down` | Full-Stack stoppen |
| `make e2e-test` | `npx playwright test` | Playwright ausfuehren |
| `make e2e-test-ui` | `npx playwright test --ui` | Playwright UI-Modus |

### 2.3 Logs & Monitoring Targets

| Target | Befehl | Beschreibung |
|--------|--------|--------------|
| `make logs` | `logs -f --tail=100` | Alle Logs folgen |
| `make logs-server` | `logs -f --tail=100 el-servador` | Server-Logs |
| `make logs-mqtt` | `logs -f --tail=100 mqtt-broker` | MQTT-Logs |
| `make logs-frontend` | `logs -f --tail=100 el-frontend` | Frontend-Logs |
| `make logs-db` | `logs -f --tail=100 postgres` | PostgreSQL-Logs |
| `make mqtt-sub` | `mosquitto_sub -t "kaiser/#" -v` | MQTT Kaiser-Topics |
| `make status` | `docker compose ps` | Container-Status |
| `make health` | `docker exec ... curl /api/v1/health/live` | Server Health-Check |

### 2.4 Monitoring Stack Targets

| Target | Befehl | Beschreibung |
|--------|--------|--------------|
| `make monitor-up` | `--profile monitoring up -d` | Start Monitoring (Loki, Promtail, Prometheus, Grafana, postgres-exporter, mosquitto-exporter) |
| `make monitor-down` | `--profile monitoring down` | Stop Monitoring |
| `make monitor-logs` | `--profile monitoring logs -f --tail=100` | Monitoring-Logs folgen |
| `make monitor-status` | `--profile monitoring ps` | Monitoring-Status |

### 2.5 DevTools Stack Targets

| Target | Befehl | Beschreibung |
|--------|--------|--------------|
| `make devtools-up` | `--profile devtools up -d` | Start DevTools (pgAdmin) |
| `make devtools-down` | `--profile devtools down` | Stop DevTools |
| `make devtools-logs` | `--profile devtools logs -f --tail=100` | DevTools-Logs folgen |
| `make devtools-status` | `--profile devtools ps` | DevTools-Status |

### 2.6 CI (nur docker compose, kein make)

CI wird in GitHub Actions via docker compose direkt gestartet:

```bash
docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d --wait
docker compose -f docker-compose.yml -f docker-compose.ci.yml down -v
```

### 2.7 Datenbank-Targets

| Target | Befehl | Beschreibung |
|--------|--------|--------------|
| `make shell-server` | `exec -it el-servador bash` | Server-Shell |
| `make shell-db` | `exec -it postgres psql` | PostgreSQL-Shell |
| `make db-migrate` | `alembic upgrade head` | Migrationen ausfuehren |
| `make db-rollback` | `alembic downgrade -1` | Letzte Migration rueckgaengig |
| `make db-status` | `alembic current/history` | Migrations-Status |
| `make db-backup` | `scripts/docker/backup.sh` | Backup erstellen |
| `make db-restore` | `scripts/docker/restore.sh FILE` | Backup wiederherstellen |

### 2.8 Direkte Docker-Befehle

```bash
# Container neu starten
docker compose restart el-servador

# Container-Logs
docker logs automationone-server --tail 100

# In Container Shell
docker exec -it automationone-server /bin/bash
docker exec -it automationone-postgres psql -U god_kaiser -d god_kaiser_db

# MQTT subscriben (via Container)
docker exec -it automationone-mqtt mosquitto_sub -t "kaiser/#" -v

# Image neu bauen ohne Cache
docker compose build --no-cache el-servador
```

### 2.9 Debugging-Befehle

```bash
# Container-Status pruefen
docker compose ps

# Container-Ressourcen
docker stats --no-stream

# Container-Logs (letzte 100 Zeilen)
docker compose logs --tail=100 el-servador

# Container-Inspect
docker inspect automationone-server

# Netzwerk pruefen
docker network inspect automationone-net

# Volume-Groesse
docker system df -v
```

---

## 3. Environments

### 3.1 Development (docker-compose.dev.yml)

**Aenderungen zum Basis-Stack:**
- `LOG_LEVEL: DEBUG`
- `SERVER_RELOAD: "true"`
- Volume-Mounts fuer `src/`, `tests/`, `alembic/`
- Uvicorn mit `--reload`
- Frontend: `NODE_ENV: development`

**Aktivierung:**
```bash
make dev
# oder
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

### 3.2 Testing (docker-compose.test.yml)

**Aenderungen zum Basis-Stack:**
- postgres: Dummy-Container (busybox sleep)
- el-servador: `DATABASE_URL: sqlite+aiosqlite:///./test_db.sqlite`
- `ENVIRONMENT: test`, `LOG_LEVEL: WARNING`
- Frontend: Profile `frontend` (nicht automatisch gestartet)
- `restart: "no"` fuer alle

**Aktivierung:**
```bash
make test
```

### 3.3 CI (docker-compose.ci.yml)

**Aenderungen zum Basis-Stack:**
- postgres: **tmpfs** (RAM-basiert, schnell)
- Healthcheck-Intervalle: 3-5s
- Keine Persistence-Volumes
- `TESTING: "true"`
- `JWT_SECRET_KEY: ci_test_secret_key_not_for_production`

**Verwendung:** Automatisch in GitHub Actions

### 3.4 E2E (docker-compose.e2e.yml)

**Aenderungen zum Basis-Stack:**
- postgres: **tmpfs** (wie CI)
- Frontend: `profiles: []` (immer gestartet)
- Schnelle Healthchecks (3s interval)
- `CORS_ALLOWED_ORIGINS` fuer localhost:5173

**Aktivierung:**
```bash
make e2e-up
```

---

## 4. Sicherheit

### 4.1 Secrets-Management

**Speicherort:** `.env` (Projektroot)

| Variable | Beschreibung | Beispiel |
|----------|--------------|----------|
| POSTGRES_USER | DB-Benutzer | god_kaiser |
| POSTGRES_PASSWORD | DB-Passwort | CHANGE_ME |
| POSTGRES_DB | DB-Name | god_kaiser_db |
| JWT_SECRET_KEY | JWT Signing Key | secrets.token_urlsafe(32) |
| GRAFANA_ADMIN_PASSWORD | Grafana Login | changeme |
| PGADMIN_DEFAULT_EMAIL | pgAdmin Login-Email | admin@automationone.local |
| PGADMIN_DEFAULT_PASSWORD | pgAdmin Login-Passwort | changeme |
| WOKWI_CLI_TOKEN | Wokwi API Token | wok_... |

**Wichtig:** `.env` ist in `.gitignore` - niemals committen!

### 4.2 Container-Hardening

**Empfohlene Einstellungen (noch nicht implementiert):**

```yaml
services:
  el-servador:
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    read_only: true
    tmpfs:
      - /tmp
```

---

## 5. Monitoring-Stack

### 5.1 Loki (Log-Aggregation)

| Eigenschaft | Wert |
|-------------|------|
| Port | 3100 |
| Config | docker/loki/loki-config.yml |
| Retention | 7 Tage (168h) |
| Storage | /loki (Named Volume) |

**Queries:** Siehe `.claude/reference/debugging/LOG_LOCATIONS.md` Section 12

### 5.2 Promtail (Log-Collection)

| Eigenschaft | Wert |
|-------------|------|
| Config | docker/promtail/config.yml |
| Target | Docker Container Logs |
| Label | com.docker.compose.project=auto-one |

**Docker Socket Mount:** `/var/run/docker.sock` (read-only)

### 5.3 Prometheus (Metriken)

| Eigenschaft | Wert |
|-------------|------|
| Port | 9090 |
| Config | docker/prometheus/prometheus.yml |
| Scrape-Interval | 15s |
| Retention | 7 Tage |
| Targets | el-servador:8000/api/v1/health/metrics, postgres-exporter:9187/metrics |

### 5.4 Grafana (Dashboards)

| Eigenschaft | Wert |
|-------------|------|
| Port | 3000 |
| Default User | admin |
| Default Password | ${GRAFANA_ADMIN_PASSWORD} |
| Datasources | Prometheus (default), Loki |
| Provisioning | docker/grafana/provisioning/ |

**Zugang:** http://localhost:3000

### 5.5 pgAdmin (DevTools)

| Eigenschaft | Wert |
|-------------|------|
| Port | 5050 |
| Profile | devtools |
| Default Email | ${PGADMIN_DEFAULT_EMAIL} |
| Default Password | ${PGADMIN_DEFAULT_PASSWORD} |
| Pre-Provisioning | docker/pgadmin/servers.json |
| Persistent Data | /var/lib/pgadmin (Named Volume) |

**Zugang:** http://localhost:5050
**Start:** `make devtools-up`

---

## 6. Backup & Recovery

### 6.1 PostgreSQL

**Backup erstellen:**
```bash
make db-backup
# Erstellt: backups/automationone_YYYYMMDD_HHMMSS.sql.gz
```

**Backup wiederherstellen:**
```bash
make db-restore FILE=backups/automationone_20260206_120000.sql.gz
# oder
make db-restore FILE=latest
```

**Retention:** Letzte 7 Backups werden behalten.

### 6.2 Monitoring-Daten

| Service | Volume | Retention |
|---------|--------|-----------|
| Prometheus | automationone-prometheus-data | 7 Tage (--storage.tsdb.retention.time=7d) |
| Loki | automationone-loki-data | 7 Tage (limits_config.retention_period: 168h) |
| Grafana | automationone-grafana-data | Dashboards via Provisioning |

**Manuelle Volume-Sicherung:**
```bash
docker run --rm -v automationone-postgres-data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-volume.tar.gz /data
```

---

## 7. Troubleshooting

### 7.1 Docker Desktop Probleme

| Problem | Diagnose | Loesung |
|---------|----------|---------|
| API Error 500 | Docker Desktop crashed | Docker Desktop neu starten |
| WSL2 Memory | Container fressen RAM | `.wslconfig` Memory-Limit |
| Disk Full | Volume-Wachstum | `docker system prune -a` |

### 7.2 Container startet nicht

```bash
# Logs pruefen
docker logs automationone-server

# Healthcheck debuggen
docker inspect automationone-server | jq '.[0].State.Health'

# Container-Status
docker compose ps

# Ressourcen pruefen
docker stats --no-stream
```

### 7.3 Netzwerk-Probleme

```bash
# DNS-Aufloesung testen (im Container)
docker exec automationone-server ping postgres

# Port-Konflikte pruefen
netstat -an | findstr 8000   # Windows
lsof -i :8000                # Linux/Mac

# Netzwerk inspizieren
docker network inspect automationone-net
```

### 7.4 Volume-Probleme

```bash
# Volume-Liste
docker volume ls

# Volume inspizieren
docker volume inspect automationone-postgres-data

# Volume loeschen (VORSICHT!)
docker volume rm automationone-postgres-data
```

---

## 8. Versionsverlauf

| Version | Datum | Aenderung |
|---------|-------|-----------|
| 1.0 | 2026-02-06 | Initiale Erstellung |
| 1.1 | 2026-02-08 | Section 0 Stack-Nutzung, make logs-db in 2.1, Windows-Hinweis |
| 1.2 | 2026-02-09 | Ghost-Targets entfernt (pgadmin, devtools, ci-*, watch), Monitoring-Targets ergaenzt, Promtail-Healthcheck korrigiert, Prometheus metrics_path korrigiert |
| 1.3 | 2026-02-09 | postgres-exporter Service hinzugefuegt (9 Services total: 4 Core + 5 Monitoring), Prometheus 3 Scrape-Jobs, Instrumentator + psutil Metriken dokumentiert |
| 1.4 | 2026-02-09 | pgAdmin DevTools hinzugefuegt (10 Services: 4 Core + 5 Monitoring + 1 DevTools), Profile devtools, Makefile devtools-Targets, Section 2.5 DevTools |
| 1.5 | 2026-02-10 | mosquitto-exporter hinzugefuegt (11 Services: 4 Core + 6 Monitoring + 1 DevTools), Service-Tabelle korrigiert |

---

*Referenz-Dokument fuer AutomationOne Docker-Infrastruktur*
*Vollstaendige Bestandsaufnahme siehe: `.claude/reports/current/DOCKER_VOLLAUDIT.md`*
