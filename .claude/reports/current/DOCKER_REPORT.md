# AutomationOne Docker Infrastructure Report

> **Date:** 2026-02-07
> **Scope:** Complete Docker infrastructure analysis (read-only, no changes)
> **Host OS:** Windows (Docker Desktop)

---

## 1. Architecture Overview

```
                         WINDOWS HOST (Docker Desktop)
 ┌──────────────────────────────────────────────────────────────────────────┐
 │                                                                          │
 │   ┌─────────────────── automationone-net (bridge) ───────────────────┐   │
 │   │                                                                  │   │
 │   │  ┌──────────────┐   ┌───────────────┐   ┌──────────────────┐    │   │
 │   │  │  PostgreSQL   │   │  Mosquitto    │   │  El Servador     │    │   │
 │   │  │  :5432        │◄──│  :1883 (MQTT) │◄──│  :8000 (HTTP)    │    │   │
 │   │  │  postgres:16  │   │  :9001 (WS)   │   │  Python 3.11     │    │   │
 │   │  │  -alpine      │   │  mosquitto:2  │   │  FastAPI+Uvicorn │    │   │
 │   │  └──────┬────────┘   └───────────────┘   └────────┬─────────┘    │   │
 │   │         │                                         │              │   │
 │   │         │              ┌──────────────────┐       │              │   │
 │   │         │              │  El Frontend     │       │              │   │
 │   │         │              │  :5173 (Vite)    │───────┘              │   │
 │   │         │              │  Node 20 Alpine  │  (HTTP/WS via host) │   │
 │   │         │              └──────────────────┘                     │   │
 │   │         │                                                       │   │
 │   │  ┌──────┴──── Profile: devtools ──────┐                         │   │
 │   │  │  pgAdmin   :5050 (HTTP→:80)        │                         │   │
 │   │  └───────────────────────────────────-┘                         │   │
 │   │                                                                  │   │
 │   │  ┌──────────── Profile: monitoring ───────────────────────────┐  │   │
 │   │  │  Loki       :3100  ◄── Promtail (Docker socket)           │  │   │
 │   │  │  Prometheus  :9090  ──► scrapes el-servador:8000/metrics   │  │   │
 │   │  │  Grafana     :3000  ◄── Prometheus + Loki as datasources  │  │   │
 │   │  └───────────────────────────────────────────────────────────-┘  │   │
 │   └──────────────────────────────────────────────────────────────────┘   │
 │                                                                          │
 │   ESP32 (physical/Wokwi) ───MQTT:1883──► mqtt-broker                    │
 │   Browser ───HTTP:5173──► el-frontend ───HTTP:8000──► el-servador        │
 │   Browser ───WS:8000──► el-servador (WebSocket events)                   │
 └──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Compose File Hierarchy

The project uses a **layered compose override** strategy with 3 files:

| File | Purpose | Activation |
|------|---------|------------|
| `docker-compose.yml` | Base config (all services defined) | Always loaded |
| `docker-compose.ci.yml` | CI override (GitHub Actions) | `-f docker-compose.yml -f docker-compose.ci.yml` |
| `docker-compose.e2e.yml` | E2E override (Playwright) | `-f docker-compose.yml -f docker-compose.e2e.yml` |

### Override Merge Logic

```
BASE (docker-compose.yml)
  │
  ├── CI override: Replaces env vars, removes persistence,
  │   uses tmpfs for PostgreSQL, faster healthchecks,
  │   disables develop/watch, frontend behind profile
  │
  └── E2E override: Same as CI but frontend ALWAYS included
      (profiles: [] removes restriction), even faster
      healthchecks (3s intervals), CORS for Playwright
```

### Environment Variable Files

| File | Purpose | Committed |
|------|---------|-----------|
| `.env` | Local development secrets | No (gitignored) |
| `.env.example` | Template with placeholder values | Yes |
| `.env.ci` | CI-safe values (no real secrets) | Yes |

The `.env` file is auto-loaded by Docker Compose. CI workflows use `.env.ci` values either directly in the override or by copying to `.env`.

---

## 3. Service Catalog

### 3.1 Core Services (always started)

#### PostgreSQL (`postgres`)

| Property | Value |
|----------|-------|
| Image | `postgres:16-alpine` |
| Container Name | `automationone-postgres` |
| Port | `5432:5432` |
| Volume (data) | Named: `automationone-postgres-data` → `/var/lib/postgresql/data` |
| Volume (config) | Bind: `docker/postgres/postgresql.conf` → `/etc/postgresql/postgresql.conf` (read-only) |
| Volume (logs) | Bind: `logs/postgres/` → `/var/log/postgresql/` |
| Healthcheck | `pg_isready -U $POSTGRES_USER -d $POSTGRES_DB` every 10s |
| Resource Limits | CPU: 1.0, Memory: 512M (reserved: 256M) |
| Restart Policy | `unless-stopped` |

**Custom Config Highlights:**
- Logging collector enabled, logs to `/var/log/postgresql/postgresql.log`
- Only `mod` statements logged (INSERT/UPDATE/DELETE/DDL, not SELECT)
- Slow query threshold: 100ms
- Log rotation: daily OR at 50MB

**Role in System:** Primary data store for all device registrations, sensor readings, actuator states, audit logs, logic engine rules, zones, and user accounts.

---

#### Mosquitto MQTT Broker (`mqtt-broker`)

| Property | Value |
|----------|-------|
| Image | `eclipse-mosquitto:2` |
| Container Name | `automationone-mqtt` |
| Port (MQTT) | `1883:1883` |
| Port (WebSocket) | `9001:9001` |
| Volume (data) | Named: `automationone-mosquitto-data` → `/mosquitto/data/` |
| Volume (config) | Bind: `docker/mosquitto/mosquitto.conf` → `/mosquitto/config/mosquitto.conf` (read-only) |
| Volume (logs) | Bind: `logs/mqtt/` → `/mosquitto/log/` |
| Healthcheck | `mosquitto_sub -t $$SYS/# -C 1 -W 3` every 30s |
| Resource Limits | CPU: 0.5, Memory: 128M (reserved: 64M) |

**Config Highlights:**
- Two listeners: MQTT (1883) + WebSocket (9001)
- Anonymous access allowed (development only!)
- Persistence enabled (data survives restarts)
- Verbose logging: errors, warnings, notices, info, subscribe/unsubscribe events
- Max message size: 256KB
- Max queued messages: 1000

**Role in System:** Central message bus. ESP32 devices publish sensor data and receive actuator commands via MQTT. The server subscribes to all device topics and publishes commands. WebSocket listener (9001) enables browser-based MQTT debugging.

---

#### El Servador / God-Kaiser Server (`el-servador`)

| Property | Value |
|----------|-------|
| Image | Custom build from `El Servador/Dockerfile` |
| Container Name | `automationone-server` |
| Port | `8000:8000` |
| Volume (logs) | Bind: `logs/server/` → `/app/logs/` |
| Healthcheck | `curl -f http://localhost:8000/api/v1/health/live` every 30s (start_period: 30s) |
| Resource Limits | CPU: 1.0, Memory: 512M (reserved: 256M) |
| Security | `no-new-privileges:true` |
| Depends On | `postgres` (healthy), `mqtt-broker` (healthy) |

**Dockerfile (Multi-Stage Build):**
```
Stage 1 "builder": python:3.11-slim
  → Install build-essential, libpq-dev, curl
  → Install Poetry 1.7.1
  → poetry install --only main (no dev dependencies)

Stage 2 "runtime": python:3.11-slim
  → Copy site-packages from builder (no Poetry in runtime)
  → Copy src/, alembic/, alembic.ini
  → Non-root user (appuser, UID 1000)
  → PYTHONPATH=/app
  → CMD: uvicorn src.main:app --host 0.0.0.0 --port 8000
```

**Docker Compose Watch (Development):**
- `src/` changes → sync+restart (hot reload without rebuild)
- `pyproject.toml` changes → full rebuild (dependency change)

**Environment Variables (key ones):**
- `DATABASE_URL`: Connects to PostgreSQL via asyncpg (async driver)
- `MQTT_BROKER_HOST`: Uses Docker service name `mqtt-broker` (DNS resolution via bridge network)
- `CORS_ALLOWED_ORIGINS`: Allows `localhost:5173` (frontend) and `localhost:3000` (Grafana)
- `JWT_SECRET_KEY`: From `.env` file
- `DATABASE_AUTO_INIT`: Auto-creates tables on startup

**Role in System:** The brain. ALL business logic, sensor processing, actuator control, automation rules, device management, and user authentication runs here. Exposes REST API + WebSocket for the frontend. Subscribes/publishes MQTT for ESP32 communication.

---

#### El Frontend (`el-frontend`)

| Property | Value |
|----------|-------|
| Image | Custom build from `El Frontend/Dockerfile` |
| Container Name | `automationone-frontend` |
| Port | `5173:5173` |
| Volumes (config) | Bind mounts for `public/`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js` (all read-only) |
| Healthcheck | Node.js fetch to `http://localhost:5173` every 30s |
| Resource Limits | CPU: 0.5, Memory: 256M (reserved: 128M) |
| Security | `no-new-privileges:true` |
| Depends On | `el-servador` (healthy) |

**Dockerfile (Multi-Stage Build, 4 targets):**
```
Stage 1 "deps": node:20-alpine
  → Install dependencies (npm ci / yarn / pnpm, auto-detects lockfile)

Stage 2 "builder": extends deps
  → npm run build → produces dist/

Stage 3 "production": nginx:alpine
  → Copies dist/ to nginx html
  → Uses custom nginx.conf (API proxy, WS proxy, gzip, security headers)
  → Port 80

Stage 4 "development": extends deps (THIS IS USED BY docker-compose.yml)
  → Non-root user (appuser, UID 1001)
  → CMD: npm run dev -- --host 0.0.0.0
  → Port 5173 (Vite dev server with HMR)
```

**Docker Compose Watch (Development):**
- `src/` changes → sync (Vite HMR handles the rest)
- `public/`, `index.html` → sync
- `package.json` → full rebuild

**Note:** In development mode, the frontend connects to the server via **host ports** (`VITE_API_URL=http://localhost:8000`), not via Docker network. This is because the browser runs on the host, not inside the container.

**Production nginx.conf** proxies `/api/` and `/ws` to `el-servador:8000` via Docker network, with security headers and gzip compression.

**Role in System:** User interface. Vue 3 dashboard for monitoring devices, configuring sensors/actuators, viewing logs, and managing automation rules.

---

### 3.2 DevTools Profile Services

Activated with: `docker compose --profile devtools up -d`

#### pgAdmin (`pgadmin`)

| Property | Value |
|----------|-------|
| Image | `dpage/pgadmin4:8.14` |
| Container Name | `automationone-pgadmin` |
| Port | `5050:80` |
| Pre-configured Server | `docker/pgadmin/servers.json` → AutomationOne DB |
| Depends On | `postgres` (healthy) |

**Auto-configured connection:** Points to `postgres:5432`, database `god_kaiser_db`, user `god_kaiser`.

---

### 3.3 Monitoring Profile Services

Activated with: `docker compose --profile monitoring up -d`

These 4 services form a complete observability stack:

#### Loki (Log Aggregation)

| Property | Value |
|----------|-------|
| Image | `grafana/loki:3.4` |
| Container Name | `automationone-loki` |
| Port | `3100:3100` |
| Volume | Named: `automationone-loki-data` → `/loki/` |
| Config | `docker/loki/loki-config.yml` |
| Retention | 7 days (`168h`) |
| Storage | Filesystem-based (TSDB schema v13) |

#### Promtail (Log Shipper)

| Property | Value |
|----------|-------|
| Image | `grafana/promtail:3.4` |
| Container Name | `automationone-promtail` |
| Port | None exposed |
| Docker Socket | Bind: `/var/run/docker.sock` (read-only) |
| Config | `docker/promtail/config.yml` |
| Depends On | `loki` (healthy) |

**Auto-discovery:** Uses Docker socket to find all containers in the `auto-one` compose project. Labels each log line with `container`, `stream`, and `service`.

#### Prometheus (Metrics)

| Property | Value |
|----------|-------|
| Image | `prom/prometheus:v3.2.1` |
| Container Name | `automationone-prometheus` |
| Port | `9090:9090` |
| Volume | Named: `automationone-prometheus-data` → `/prometheus/` |
| Config | `docker/prometheus/prometheus.yml` |
| Retention | 7 days |
| Depends On | `el-servador` (healthy) |

**Scrape Targets:**
- `el-servador:8000/metrics` (every 15s)
- `localhost:9090` (self-monitoring, every 15s)

#### Grafana (Visualization)

| Property | Value |
|----------|-------|
| Image | `grafana/grafana:11.5.2` |
| Container Name | `automationone-grafana` |
| Port | `3000:3000` |
| Volume | Named: `automationone-grafana-data` → `/var/lib/grafana/` |
| Provisioning | `docker/grafana/provisioning/` (datasources + dashboards) |
| Depends On | `prometheus` (healthy), `loki` (healthy) |

**Pre-provisioned:**
- **Datasources:** Prometheus (default) + Loki
- **Dashboard:** "AutomationOne - System Health" with 6 panels:
  1. Server Health Status (up/down)
  2. MQTT Broker Status (up/down)
  3. Database Status (up/down)
  4. Frontend Status (up/down)
  5. Log Volume by Service (time series from Loki)
  6. Recent Error Logs (filtered by error/exception/fail/critical)

---

## 4. Startup Order & Dependency Chain

```
                    ┌──────────┐
                    │ postgres │ (no dependencies)
                    └────┬─────┘
                         │ healthy
                    ┌────┴──────┐
                    │mqtt-broker│ (no dependencies)
                    └────┬──────┘
                         │ healthy
                  ┌──────┴──────────┐
                  │  el-servador    │ (depends: postgres + mqtt-broker)
                  └──────┬──────────┘
                         │ healthy
                  ┌──────┴──────────┐
                  │  el-frontend    │ (depends: el-servador)
                  └─────────────────┘

Profile: devtools         Profile: monitoring
┌──────────┐              ┌──────┐
│ pgadmin  │              │ loki │ (no deps)
│ (→postgres)│            └──┬───┘
└──────────┘                 │ healthy
                          ┌──┴──────┐
                          │promtail │ (→ loki)
                          └─────────┘
                          ┌──────────┐
                          │prometheus│ (→ el-servador)
                          └──┬───────┘
                             │ healthy
                          ┌──┴──────┐
                          │ grafana │ (→ prometheus + loki)
                          └─────────┘
```

**Startup sequence (default `docker compose up -d`):**
1. `postgres` and `mqtt-broker` start in parallel (no dependencies)
2. Once both are healthy, `el-servador` starts
3. Once `el-servador` is healthy, `el-frontend` starts

**Total startup time estimate:** ~60-90s (postgres ~10s, mqtt ~5s, server ~30s with start_period, frontend ~30s with start_period)

---

## 5. Network & Communication

### Single Bridge Network: `automationone-net`

All services are on one flat bridge network. Service discovery is by container/service name.

| From | To | Protocol | Address Used |
|------|----|----------|--------------|
| el-servador | postgres | PostgreSQL (asyncpg) | `postgres:5432` |
| el-servador | mqtt-broker | MQTT | `mqtt-broker:1883` |
| el-frontend (browser) | el-servador | HTTP/WS | `localhost:8000` (via host port) |
| ESP32 (physical) | mqtt-broker | MQTT | `<host-ip>:1883` (via host port) |
| prometheus | el-servador | HTTP | `el-servador:8000/metrics` |
| promtail | loki | HTTP | `loki:3100` |
| grafana | prometheus | HTTP | `prometheus:9090` |
| grafana | loki | HTTP | `loki:3100` |
| pgadmin | postgres | PostgreSQL | `postgres:5432` |

### Port Mapping Summary

| Host Port | Container | Service |
|-----------|-----------|---------|
| 5432 | postgres:5432 | PostgreSQL |
| 1883 | mqtt-broker:1883 | MQTT |
| 9001 | mqtt-broker:9001 | MQTT WebSocket |
| 8000 | el-servador:8000 | REST API + WebSocket |
| 5173 | el-frontend:5173 | Vite Dev Server |
| 5050 | pgadmin:80 | pgAdmin (devtools profile) |
| 3100 | loki:3100 | Loki API (monitoring profile) |
| 9090 | prometheus:9090 | Prometheus UI (monitoring profile) |
| 3000 | grafana:3000 | Grafana UI (monitoring profile) |

---

## 6. Volume Strategy

### Named Volumes (persistent data, survive `docker compose down`)

| Volume Name | Mounted In | Purpose |
|-------------|-----------|---------|
| `automationone-postgres-data` | postgres | Database files |
| `automationone-mosquitto-data` | mqtt-broker | MQTT persistence |
| `automationone-loki-data` | loki | Log index + chunks |
| `automationone-prometheus-data` | prometheus | Metrics TSDB |
| `automationone-grafana-data` | grafana | Dashboards, user config |

**Destruction:** `docker compose down -v` removes all named volumes.

### Bind Mounts (host ↔ container file sync)

| Host Path | Container Path | Mode | Purpose |
|-----------|---------------|------|---------|
| `docker/postgres/postgresql.conf` | `/etc/postgresql/postgresql.conf` | ro | Custom PG config |
| `docker/mosquitto/mosquitto.conf` | `/mosquitto/config/mosquitto.conf` | ro | MQTT broker config |
| `logs/postgres/` | `/var/log/postgresql/` | rw | PG logs readable from host |
| `logs/mqtt/` | `/mosquitto/log/` | rw | MQTT logs readable from host |
| `logs/server/` | `/app/logs/` | rw | Server logs readable from host |
| `docker/pgadmin/servers.json` | `/pgadmin4/servers.json` | ro | Pre-configured DB connection |
| `docker/loki/loki-config.yml` | `/etc/loki/loki-config.yml` | ro | Loki config |
| `docker/promtail/config.yml` | `/etc/promtail/config.yml` | ro | Promtail config |
| `docker/prometheus/prometheus.yml` | `/etc/prometheus/prometheus.yml` | ro | Scrape targets |
| `docker/grafana/provisioning/` | `/etc/grafana/provisioning/` | ro | Datasources + dashboards |
| `El Frontend/public/` | `/app/public/` | ro | Static assets |
| `El Frontend/index.html` | `/app/index.html` | ro | Entry point |
| `El Frontend/vite.config.ts` | `/app/vite.config.ts` | ro | Build config |
| `El Frontend/tsconfig.json` | `/app/tsconfig.json` | ro | TypeScript config |
| `El Frontend/tailwind.config.js` | `/app/tailwind.config.js` | ro | Tailwind config |
| `El Frontend/postcss.config.js` | `/app/postcss.config.js` | ro | PostCSS config |

### Log Mount Strategy

```
Host: logs/
├── postgres/     ← PostgreSQL writes here (postgresql.log)
├── mqtt/         ← Mosquitto writes here (mosquitto.log)
└── server/       ← God-Kaiser Server writes here

Purpose: Debug agents (esp32-debug, server-debug, mqtt-debug) read
these files directly from the host filesystem without entering containers.
```

---

## 7. Profiles

Docker Compose profiles allow optional service groups:

| Profile | Services | Activation |
|---------|----------|------------|
| *(default)* | postgres, mqtt-broker, el-servador, el-frontend | `docker compose up -d` |
| `devtools` | + pgadmin | `docker compose --profile devtools up -d` |
| `monitoring` | + loki, promtail, prometheus, grafana | `docker compose --profile monitoring up -d` |
| `devtools` + `monitoring` | All 9 services | `docker compose --profile devtools --profile monitoring up -d` |

---

## 8. CI/CD Docker Usage

### GitHub Actions Workflows Using Docker

| Workflow | Compose Command | Services Started |
|----------|----------------|-----------------|
| `server-tests.yml` | `-f .yml -f ci.yml up -d --wait postgres mqtt-broker` | postgres + mqtt-broker only |
| `esp32-tests.yml` | `-f .yml -f ci.yml up -d --wait postgres mqtt-broker` | postgres + mqtt-broker only |
| `backend-e2e-tests.yml` | `-f .yml -f ci.yml -f e2e.yml up -d --wait` | postgres + mqtt-broker + el-servador + el-frontend |
| `playwright-tests.yml` | `-f .yml -f e2e.yml up -d --wait` | All 4 core services |

### CI Optimizations (docker-compose.ci.yml)

| Optimization | Effect |
|-------------|--------|
| `tmpfs` for PostgreSQL | RAM-based storage, no disk I/O |
| `volumes: []` | Removes all bind mounts (no host logs needed) |
| Faster healthchecks | 5s interval (vs 10-30s in dev) |
| `restart: "no"` | No auto-restart (fail fast in CI) |
| `develop: !reset null` | Disables file watching |
| Frontend behind profile | Not started unless explicitly needed |
| Hardcoded credentials | No `.env` file dependency |

### E2E Optimizations (docker-compose.e2e.yml)

Same as CI, plus:
- Frontend always included (`profiles: []`)
- Even faster healthchecks (3s interval, 20 retries)
- CORS allows `localhost:5173` + `127.0.0.1:5173`
- Playwright runs on host (not in container) for GPU/browser access

---

## 9. Resource Allocation Summary

| Service | CPU Limit | Memory Limit | Memory Reserved |
|---------|-----------|-------------|-----------------|
| postgres | 1.0 | 512M | 256M |
| mqtt-broker | 0.5 | 128M | 64M |
| el-servador | 1.0 | 512M | 256M |
| el-frontend | 0.5 | 256M | 128M |
| pgadmin | 0.5 | 256M | 128M |
| loki | 1.0 | 512M | 256M |
| promtail | 0.25 | 128M | 64M |
| prometheus | 0.5 | 512M | 256M |
| grafana | 0.5 | 256M | 128M |
| **Total (all)** | **5.75** | **3072M** | **1536M** |
| **Total (core 4)** | **3.0** | **1408M** | **704M** |

---

## 10. Security Measures

| Measure | Applied To | Detail |
|---------|-----------|--------|
| Non-root user | el-servador, el-frontend | `appuser` (UID 1000/1001) |
| `no-new-privileges` | el-servador, el-frontend | Prevents privilege escalation |
| Read-only configs | All config bind mounts | `:ro` flag |
| `.dockerignore` | el-servador, el-frontend | Excludes `.env`, tests, logs, caches |
| JSON file log driver | All services | `max-size: 10m, max-file: 3` (prevents disk fill) |
| nginx security headers | el-frontend (production) | X-Frame-Options, X-Content-Type-Options, X-XSS-Protection |

**Development-only warnings:**
- MQTT: `allow_anonymous true` (must change for production)
- JWT: Placeholder secret in `.env.example`
- pgAdmin: `MASTER_PASSWORD_REQUIRED: False`

---

## 11. Docker Desktop (Human User Perspective)

For the human user on Windows, Docker Desktop provides:
- **Containers tab:** See all 4-9 running containers grouped by compose project `auto-one`
- **Logs:** Click any container to see real-time stdout/stderr
- **Terminal:** Open a shell inside any container
- **Volumes tab:** Inspect named volumes, see size
- **Resource usage:** CPU/Memory per container in real-time
- **Compose Watch:** If started with `docker compose watch`, file changes sync automatically

Common commands from PowerShell/Terminal:
```bash
docker compose up -d                              # Start core 4
docker compose --profile devtools up -d           # + pgAdmin
docker compose --profile monitoring up -d         # + Grafana stack
docker compose logs -f el-servador                # Follow server logs
docker compose down                               # Stop all
docker compose down -v                            # Stop + delete data
docker compose watch                              # Auto-sync file changes
```

---

## 12. File Tree Summary

```
Auto-one/
├── docker-compose.yml              # Base config (10 services)
├── docker-compose.ci.yml           # CI override
├── docker-compose.e2e.yml          # E2E override
├── .env                            # Local secrets (gitignored)
├── .env.example                    # Template
├── .env.ci                         # CI values (committed)
│
├── El Servador/
│   ├── Dockerfile                  # Multi-stage: builder → runtime
│   └── .dockerignore               # Excludes tests, caches, .env, logs
│
├── El Frontend/
│   ├── Dockerfile                  # Multi-stage: deps → builder → production → development
│   ├── .dockerignore               # Excludes node_modules, dist, playwright
│   └── docker/
│       └── nginx/
│           └── nginx.conf          # Production reverse proxy config
│
├── docker/
│   ├── postgres/
│   │   └── postgresql.conf         # Custom PG logging config
│   ├── mosquitto/
│   │   └── mosquitto.conf          # Dev MQTT config (anonymous, persistent)
│   ├── pgadmin/
│   │   └── servers.json            # Pre-configured DB connection
│   ├── loki/
│   │   └── loki-config.yml         # Log aggregation (7d retention)
│   ├── promtail/
│   │   └── config.yml              # Docker log scraper
│   ├── prometheus/
│   │   └── prometheus.yml          # Metrics scrape config
│   └── grafana/
│       └── provisioning/
│           ├── datasources/
│           │   └── datasources.yml # Prometheus + Loki
│           └── dashboards/
│               ├── dashboards.yml  # Dashboard provider config
│               └── system-health.json  # Pre-built health dashboard
│
├── .github/
│   └── mosquitto/
│       └── mosquitto.conf          # CI-specific MQTT config (no persistence)
│
└── logs/                           # Host-mounted log directory
    ├── postgres/                   # ← PostgreSQL logs
    ├── mqtt/                       # ← Mosquitto logs
    └── server/                     # ← God-Kaiser Server logs
```

---

## 13. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Single bridge network | Simple. All services need to talk to each other. No isolation needed in dev. |
| Profiles for optional services | Core 4 start fast. Monitoring/DevTools opt-in to save resources. |
| Host-mounted logs | Debug agents read logs from host filesystem without `docker exec`. |
| Multi-stage Dockerfiles | Smaller images. Build tools not in runtime. |
| Named volumes for data | Survives `docker compose down`. Explicit `down -v` to wipe. |
| Development target for frontend | Vite HMR inside container, production uses nginx. |
| Poetry in builder only | Runtime image has no package manager (smaller, more secure). |
| tmpfs in CI | Speed. No persistence needed for tests. |
| `--wait` in CI | Blocks until all healthchecks pass before running tests. |
| Compose Watch | File sync without full rebuild during development. |
