# Docker-Vollaudit - AutomationOne

**Datum:** 2026-02-06
**Agent:** DevOps-Analyst (Plan Mode)
**Version:** 1.5

---

## 1. Bestandsaufnahme

### 1.1 Compose-Dateien

| Datei | Services | Zweck | Profiles |
|-------|----------|-------|----------|
| `docker-compose.yml` | 8 | Basis-Stack | monitoring |
| `docker-compose.dev.yml` | 2 Override | Hot-Reload (Volume-Mounts) | - |
| `docker-compose.test.yml` | 4 Override | SQLite-Isolation, Dummy-Postgres | frontend |
| `docker-compose.ci.yml` | 4 Override | tmpfs, schnelle Healthchecks | frontend |
| `docker-compose.e2e.yml` | 4 Override | Full-Stack Playwright | - |

#### Basis-Services (docker-compose.yml)

| Service | Container-Name | Image | Ports | Healthcheck | Restart | Volumes | Resource Limits |
|---------|---------------|-------|-------|-------------|---------|---------|-----------------|
| postgres | automationone-postgres | postgres:16-alpine | 5432:5432 | pg_isready | unless-stopped | Named + Bind | **KEINE** |
| mqtt-broker | automationone-mqtt | eclipse-mosquitto:2 | 1883:1883, 9001:9001 | mosquitto_sub | unless-stopped | Config + Data + Logs | **KEINE** |
| el-servador | automationone-server | Custom Build | 8000:8000 | curl /health/live | unless-stopped | Log Bind-Mount | **KEINE** |
| el-frontend | automationone-frontend | Custom Build | 5173:5173 | node fetch | unless-stopped | Config Mounts | **KEINE** |
| loki | automationone-loki | grafana/loki:3.4 | 3100:3100 | wget /ready | unless-stopped | Config + Data | **KEINE** |
| promtail | automationone-promtail | grafana/promtail:3.4 | - | TCP:9080 | unless-stopped | Docker Socket | **KEINE** |
| prometheus | automationone-prometheus | prom/prometheus:v3.2.1 | 9090:9090 | wget /-/healthy | unless-stopped | Config + Data | **KEINE** |
| grafana | automationone-grafana | grafana/grafana:11.5.2 | 3000:3000 | wget /api/health | unless-stopped | Provisioning | **KEINE** |

#### 1.1.2 Dev Overrides (Detail)

**Datei:** `docker-compose.dev.yml`

| Service | Override-Key | Alter Wert (Basis) | Neuer Wert | Zweck |
|---------|-------------|-------------------|------------|-------|
| el-servador | environment.LOG_LEVEL | INFO | DEBUG | Verbose Logging |
| el-servador | environment.SERVER_RELOAD | "true" | "true" | (bereits gesetzt) |
| el-servador | environment.ENVIRONMENT | development | development | (bereits gesetzt) |
| el-servador | volumes | nur logs | +src, +alembic, +tests | Hot-Reload Source-Code |
| el-servador | command | uvicorn (aus Dockerfile) | uvicorn --reload --reload-dir /app/src | Auto-Reload aktiviert |
| el-frontend | environment.NODE_ENV | - | development | Dev-Modus |
| el-frontend | volumes | Config-Mounts | +src, +public, +index.html, +vite.config.ts | HMR Source-Code |

**Volume-Mounts für Hot-Reload:**
```yaml
# Server
- ./El Servador/god_kaiser_server/src:/app/src         # Source-Code
- ./El Servador/god_kaiser_server/alembic:/app/alembic # Migrations
- ./El Servador/god_kaiser_server/tests:/app/tests     # Tests

# Frontend
- ./El Frontend/src:/app/src                           # Vue Source
- ./El Frontend/public:/app/public                     # Static Assets
- ./El Frontend/index.html:/app/index.html             # Entry HTML
- ./El Frontend/vite.config.ts:/app/vite.config.ts     # Vite Config
```

**Bewertung:** Korrekt implementiert. Hot-Reload funktioniert via Volume-Mounts + --reload Flag.

#### 1.1.3 Test Overrides (Detail)

**Datei:** `docker-compose.test.yml`

| Service | Override-Key | Alter Wert (Basis) | Neuer Wert | Zweck |
|---------|-------------|-------------------|------------|-------|
| postgres | image | postgres:16-alpine | busybox:latest | Dummy-Container |
| postgres | command | postgres -c config_file=... | sh -c "echo 'Dummy' && sleep infinity" | Kein echtes Postgres |
| postgres | healthcheck | pg_isready | exit 0 (instant healthy) | Schneller Startup |
| el-servador | DATABASE_URL | postgresql+asyncpg://... | **sqlite+aiosqlite:///./test_db.sqlite** | In-Memory Tests |
| el-servador | ENVIRONMENT | development | test | Test-Modus |
| el-servador | LOG_LEVEL | INFO | WARNING | Weniger Noise |
| el-frontend | profiles | - | frontend | **Opt-in** (nicht per Default) |
| mqtt-broker | restart | unless-stopped | "no" | Kein Auto-Restart |

**SQLite-Isolation erklaert:**
- PostgreSQL wird durch busybox-Dummy ersetzt (erfuellt `depends_on`)
- Server nutzt `sqlite+aiosqlite:///./test_db.sqlite` (lokale SQLite-Datei)
- Tests laufen isoliert, schnell, ohne echte DB-Verbindung
- Frontend ist opt-in via `--profile frontend`

**Bewertung:** Elegante Loesung. Dummy-Postgres erfuellt Dependency-Chain ohne echte Ressourcen.

#### 1.1.4 CI Overrides (Detail)

**Datei:** `docker-compose.ci.yml`

| Service | Override-Key | Zweck |
|---------|-------------|-------|
| postgres | tmpfs: /var/lib/postgresql/data | RAM-basierte DB (schnell, kein Disk I/O) |
| postgres | volumes: [] | Entfernt Named Volume (kein Persist) |
| postgres | healthcheck.interval | 5s (statt 10s) | Schnellerer Startup |
| mqtt-broker | volumes | CI-Config aus .github/mosquitto/ |
| mqtt-broker | healthcheck.interval | 5s (statt 30s) | Schnellerer Startup |
| el-servador | DATABASE_URL | CI-Credentials (ci_password) |
| el-servador | DATABASE_AUTO_INIT | "true" | Auto-Init Tabellen |
| el-servador | develop: !reset null | Entfernt Watch-Modus |
| el-frontend | profiles: frontend | Opt-in |

**Unterschied zu test.yml:**
- CI nutzt **echtes PostgreSQL** (tmpfs-backed) fuer Integration-Tests
- test.yml nutzt SQLite fuer Unit-Tests
- CI ist produktionsidentisch (gleicher DB-Typ)

#### 1.1.5 E2E Compose (Detail)

**Datei:** `docker-compose.e2e.yml`

| Service | Override-Key | Zweck |
|---------|-------------|-------|
| postgres | tmpfs | RAM-basierte DB (wie CI) |
| postgres | healthcheck.interval | 3s | Noch schneller als CI |
| mqtt-broker | volumes | CI-Config aus .github/mosquitto/ |
| el-servador | CORS_ALLOWED_ORIGINS | `["http://localhost:5173","http://127.0.0.1:5173"]` | Playwright-Browser erlauben |
| el-servador | JWT_SECRET_KEY | e2e_test_secret_key_not_for_production | Konsistente Test-Tokens |
| el-servador | healthcheck.interval | 3s, retries: 20 | Schneller, toleranter |
| el-frontend | **profiles: []** | **IMMER gestartet** (Override von Basis) |
| el-frontend | VITE_API_URL | http://localhost:8000 | Browser-erreichbar |

**Wie startet Frontend?**
- Dev-Server (Vite) - `npm run dev --host` aus Dockerfile CMD
- Kein Nginx Build (Dev-Modus fuer HMR)

**Wie erreicht Playwright den Stack?**
- Frontend: http://localhost:5173 (Port-Mapping)
- Server: http://localhost:8000 (Port-Mapping)
- Playwright laeuft auf Host, Services in Docker

**Bewertung:** Vollstaendig implementiert. CORS korrekt fuer E2E konfiguriert.

### 1.2 Dockerfiles

#### El Servador (Backend)

| Aspekt | Wert | Bewertung |
|--------|------|-----------|
| Multi-Stage Build | **JA** (builder + runtime) | Excellent |
| Base Image | python:3.11-slim | Gut (nicht Alpine wegen psycopg2) |
| Non-root User | **JA** (appuser:1000) | Excellent |
| HEALTHCHECK | JA (curl /health/live) | Gut |
| EXPOSE | 8000 | Korrekt |
| CMD vs ENTRYPOINT | CMD (uvicorn) | Gut (flexibel) |
| Layer-Effizienz | Gut (Dependencies vor Code) | Gut |
| .dockerignore | Vollstaendig | Gut |
| Geschaetzte Image-Groesse | ~400MB (slim + poetry deps) | Akzeptabel |

**Staerken:**
- Multi-Stage trennt Build-Tools (build-essential, libpq-dev) von Runtime
- Non-root User implementiert
- HEALTHCHECK im Dockerfile

**Verbesserungspotential:**
- Poetry bleibt im Builder, nicht im Runtime-Image - korrekt
- libpq5 im Runtime fuer psycopg2 - notwendig

#### El Frontend (Dashboard)

| Aspekt | Wert | Bewertung |
|--------|------|-----------|
| Multi-Stage Build | **JA** (deps → builder → production/development) | ✅ Excellent |
| Base Image | node:20-alpine (dev), nginx:alpine (prod) | Gut |
| Non-root User | **JA** (appuser:1001) | Gut |
| HEALTHCHECK | JA (wget localhost:5173 dev, :80 prod) | Gut |
| EXPOSE | 5173 (dev), 80 (prod) | Korrekt |
| CMD | npm run dev --host (dev) | Korrekt |
| .dockerignore | Gut (node_modules, dist, playwright) | Gut |
| Geschaetzte Image-Groesse | ~50MB (prod) / ~800MB (dev) | ✅ Optimiert |

**Staerken (nach v1.4):**
- Multi-Stage Build mit 4 Stages: deps, builder, production, development
- Production-Image nutzt Nginx + statische Build-Artifacts (~50MB)
- Development-Image mit Vite Dev-Server fuer HMR
- Nginx-Config mit Vue Router History Mode, API-Proxy, WebSocket-Proxy
- Security Headers in Nginx konfiguriert

### 1.3 .dockerignore Analyse

#### El Servador/.dockerignore

| Pattern | Status | Kommentar |
|---------|--------|-----------|
| `__pycache__/` | Enthalten | Korrekt |
| `.venv/` | Enthalten | Korrekt |
| `.git/` | Enthalten | Korrekt |
| `tests/` | Enthalten | Gut (nicht im Prod-Image) |
| `.env` | Enthalten | **Kritisch - korrekt!** |
| `logs/` | Enthalten | Korrekt |
| `*.db`, `*.sqlite` | Enthalten | Korrekt |
| `.pytest_cache/` | Enthalten | Korrekt |

**Bewertung:** Vollstaendig und sicher.

#### El Frontend/.dockerignore

| Pattern | Status | Kommentar |
|---------|--------|-----------|
| `node_modules/` | Enthalten | Korrekt |
| `dist/` | Enthalten | Korrekt (wird neu gebaut) |
| `.git/` | Enthalten | Korrekt |
| `.env` | Enthalten | **Kritisch - korrekt!** |
| `*.md` (except README) | Enthalten | OK |
| `coverage/` | Enthalten | Korrekt |

**Bewertung:** Gut. Fehlt: `.playwright/`, `test-results/`, `playwright-report/`.

### 1.4 Netzwerk-Analyse

| Kommunikation | Von | Nach | Port | Intern/Extern |
|---------------|-----|------|------|---------------|
| DB-Connection | el-servador | postgres | 5432 | Intern |
| MQTT-Publish | el-servador | mqtt-broker | 1883 | Intern |
| WebSocket | el-servador | mqtt-broker | 9001 | Intern |
| API-Calls | el-frontend | el-servador | 8000 | Via localhost |
| Prometheus Scrape | prometheus | el-servador | 8000 | Intern |
| Log-Push | promtail | loki | 3100 | Intern |
| Grafana Queries | grafana | prometheus/loki | 9090/3100 | Intern |

**Bewertung:** Alle Services koennen sich via Service-Namen erreichen. Port-Exposition korrekt.

### 1.5 Service-Konfigurationen

#### 1.5.1 MQTT (mosquitto.conf)

**Datei:** `docker/mosquitto/mosquitto.conf`

| Parameter | Wert | Bewertung |
|-----------|------|-----------|
| listener 1883 | mqtt | Standard MQTT-Port |
| listener 9001 | websockets | WebSocket fuer Browser |
| **allow_anonymous** | **true** | **SECURITY: Nur Dev!** |
| password_file | - (auskommentiert) | Auth deaktiviert |
| acl_file | - (auskommentiert) | Keine Topic-Berechtigungen |
| persistence | true | Messages werden gespeichert |
| persistence_location | /mosquitto/data/ | Korrekt (Volume-Mount) |
| log_dest | file + stdout | Dual-Logging |
| log_type | error, warning, notice, information, subscribe, unsubscribe | Vollstaendig |
| log_timestamp | true (ISO-Format) | Gut fuer Debugging |
| max_connections | -1 | Unbegrenzt |
| max_inflight_messages | 20 | Standard |
| max_queued_messages | 1000 | Standard |
| message_size_limit | 262144 (256KB) | Ausreichend |

**Security-Bewertung:**
- **KRITISCH:** `allow_anonymous true` → Jeder kann auf jeden Topic publishen
- **OK fuer Development**, NICHT fuer Production
- Kommentierte Production-Config vorhanden (password_file, acl_file)

**Finding (Prio Mittel):** Production-Deployment braucht:
```
allow_anonymous false
password_file /mosquitto/config/passwd
acl_file /mosquitto/config/acl
```

#### 1.5.2 PostgreSQL (postgresql.conf)

**Datei:** `docker/postgres/postgresql.conf`

| Parameter | Wert | Empfohlen (Dev) | Empfohlen (Prod) | Bewertung |
|-----------|------|-----------------|-------------------|-----------|
| listen_addresses | '*' | '*' | '*' | OK |
| logging_collector | on | on | on | Korrekt |
| log_directory | '/var/log/postgresql' | - | - | **Match mit Bind-Mount** |
| log_filename | 'postgresql.log' | - | - | OK |
| log_statement | 'mod' | mod | mod | Gut (INSERT/UPDATE/DELETE) |
| log_min_duration_statement | 100 | 100ms | 50-100ms | Gut (Slow-Query) |
| log_connections | on | on | on | OK |
| log_disconnections | on | on | on | OK |
| log_lock_waits | on | off | on | Gut |
| log_rotation_age | 1d | 1d | 1d | OK |
| log_rotation_size | 50MB | 50MB | 100MB | OK |

**Log-Pfad-Konsistenz:**
- Config: `log_directory = '/var/log/postgresql'`
- Compose: `./logs/postgres:/var/log/postgresql`
- **MATCH** - Logs landen auf Host in `logs/postgres/`

**Fehlende Parameter (nicht kritisch fuer Dev):**
- shared_buffers (Default: 128MB)
- work_mem (Default: 4MB)
- effective_cache_size (Default: 4GB)
- ssl (Default: off)

**Bewertung:** Gut fuer Development. Production braucht Tuning.

#### 1.5.3 Grafana Provisioning

**Verzeichnis:** `docker/grafana/provisioning/`

**Datasources (`datasources/datasources.yml`):**

| Datasource | Typ | URL | Default | Editable |
|------------|-----|-----|---------|----------|
| Prometheus | prometheus | http://prometheus:9090 | **JA** | Nein |
| Loki | loki | http://loki:3100 | Nein | Nein |

**Dashboards (`dashboards/dashboards.yml`):**
```yaml
providers:
  - name: 'AutomationOne'
    folder: 'AutomationOne'
    type: file
    path: /var/lib/grafana/dashboards  # In Container, NICHT auf Host!
```

**Kritische Findings:**
1. **KEINE Dashboard-JSON-Dateien provisioniert**
   - Provider-Config existiert, zeigt auf `/var/lib/grafana/dashboards`
   - Aber KEINE JSON-Dateien in `docker/grafana/provisioning/dashboards/`
   - Nur `.gitkeep` Placeholder

2. **Dashboards gehen bei `docker compose down -v` verloren**
   - Volume `automationone-grafana-data` wird geloescht
   - Keine Dashboards als Code

**Empfehlung (Prio Mittel):**
- Dashboards als JSON in `docker/grafana/provisioning/dashboards/*.json` exportieren
- Provider-Path auf gemountetes Verzeichnis aendern:
  ```yaml
  path: /etc/grafana/provisioning/dashboards
  ```

### 1.6 Startup-Chain & Dependency-Graph

**depends_on Analyse (docker-compose.yml):**

| Service | depends_on | Condition | Korrekt? |
|---------|-----------|-----------|----------|
| postgres | - | - | Erster Service |
| mqtt-broker | - | - | Erster Service |
| el-servador | postgres | **service_healthy** | JA |
| el-servador | mqtt-broker | **service_healthy** | JA |
| el-frontend | el-servador | **KEINE!** | **FINDING** |
| promtail | loki | **service_healthy** | JA |
| prometheus | el-servador | **service_healthy** | JA |
| grafana | prometheus | **service_healthy** | JA |
| grafana | loki | **service_healthy** | JA |

**FINDING:** `el-frontend` hat `depends_on: el-servador` aber **KEINE** `condition: service_healthy`
- Default ist `service_started` → Frontend startet BEVOR Server healthy ist
- Kann zu initialen API-Fehlern fuehren

**ASCII Startup-Diagramm:**
```
                    ┌─────────────────────┐
                    │      STARTUP        │
                    └─────────┬───────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
    ┌──────────┐      ┌──────────────┐     ┌──────────┐
    │ postgres │      │ mqtt-broker  │     │   loki   │
    │ (health) │      │   (health)   │     │ (health) │
    └────┬─────┘      └──────┬───────┘     └────┬─────┘
         │                   │                  │
         │                   │                  ▼
         │                   │           ┌──────────┐
         └───────┬───────────┘           │ promtail │
                 │                       └──────────┘
                 ▼
         ┌──────────────┐
         │ el-servador  │
         │   (health)   │
         └──────┬───────┘
                │
       ┌────────┼────────┐
       │        │        │
       ▼        ▼        ▼
┌──────────┐          ┌────────────┐
│ frontend │          │ prometheus │
│(NO cond!)│          │  (health)  │
└──────────┘          └─────┬──────┘
                              │
                        ┌─────┴─────┐
                        │           │
                        ▼           ▼
                  ┌──────────┐ ┌──────┐
                  │ grafana  │ │(loki)│
                  │ (health) │ │      │
                  └──────────┘ └──────┘
```

**Empfehlung:**
```yaml
el-frontend:
  depends_on:
    el-servador:
      condition: service_healthy  # HINZUFUEGEN
```

### 1.7 Frontend-Backend Verbindungs-Matrix

| Environment | Frontend URL | Backend URL | Verbindungs-Methode | WebSocket URL |
|-------------|-------------|-------------|---------------------|---------------|
| Docker (Compose) | http://localhost:5173 | http://el-servador:8000 | **Vite Proxy** | ws://el-servador:8000 |
| Docker (Browser) | http://localhost:5173 | http://localhost:8000 | **Env VITE_API_URL** | ws://localhost:8000 |
| Host Dev | http://localhost:5173 | http://localhost:8000 | Direct | ws://localhost:8000 |
| E2E (Playwright) | http://localhost:5173 | http://localhost:8000 | Direct (CORS) | ws://localhost:8000 |

**Vite Proxy (vite.config.ts):**
```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://el-servador:8000',  // Docker Service-Name
      changeOrigin: true,
    },
    '/ws': {
      target: 'ws://el-servador:8000',
      ws: true,
    },
  },
}
```

**Environment Variables:**
- `VITE_API_URL=http://localhost:8000` (fuer direkten Browser-Zugriff)
- `VITE_WS_URL=ws://localhost:8000`

**CORS-Konfiguration (Server main.py:636):**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,  # Von .env
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)
```

**CORS Origins (aus .env.example):**
```
CORS_ALLOWED_ORIGINS=["http://localhost:5173","http://localhost:3000"]
```

**E2E Override (docker-compose.e2e.yml):**
```
CORS_ALLOWED_ORIGINS: '["http://localhost:5173","http://127.0.0.1:5173"]'
```

**Bewertung:** Hybrid-Ansatz funktioniert:
1. Vite-Proxy fuer `/api/*` und `/ws` (Container-zu-Container)
2. Direkte URLs via VITE_API_URL fuer Browser-Requests
3. CORS korrekt fuer alle Szenarien

### 1.8 Compose Schema & Kompatibilitaet

| Datei | `version:` Key | Schema | Bewertung |
|-------|---------------|--------|-----------|
| docker-compose.yml | **NEIN** | Modern (V2+) | Korrekt |
| docker-compose.dev.yml | **NEIN** | Modern (V2+) | Korrekt |
| docker-compose.test.yml | **NEIN** | Modern (V2+) | Korrekt |
| docker-compose.ci.yml | **NEIN** | Modern (V2+) | Korrekt |
| docker-compose.e2e.yml | **NEIN** | Modern (V2+) | Korrekt |

**Docker Compose Befehl-Konsistenz:**

| Kontext | Befehl | Version |
|---------|--------|---------|
| Makefile | `docker compose` | V2 (Plugin) |
| CI Workflows | `docker compose` | V2 (Plugin) |
| Dokumentation | `docker compose` / `docker-compose` | Gemischt |

**Deprecated Features Check:**
- `links:` → **NICHT verwendet** (gut)
- `version: "2"` → **NICHT vorhanden** (gut)
- `container_name` in Swarm → **Nicht Swarm-deployed** (OK fuer Dev)
- `!reset null` YAML-Syntax → **Verwendet** (modernes Feature fuer Override-Reset)

**Bewertung:** Konsistent auf Docker Compose V2 (Plugin). Keine deprecated Features.

---

## 2. Docker-Nutzung nach Bereich

### 2.1 In Docker (Vollstaendig)

| Komponente | Services | Compose-Datei |
|------------|----------|---------------|
| Core-Stack | postgres, mqtt, server, frontend | docker-compose.yml |
| Monitoring | Loki, Promtail, Prometheus, Grafana | docker-compose.yml (Profile: monitoring) |

### 2.2 Nicht in Docker (Auf Host)

| Was | Wo laeuft es | Grund | Docker sinnvoll? |
|-----|--------------|-------|------------------|
| pytest Unit-Tests | CI-Runner / Host | Kein externer Dependency | Optional |
| pytest Integration-Tests | CI-Runner + Docker Services | DB/MQTT aus Docker | Teilweise |
| Vitest Frontend-Tests | CI-Runner / Host | jsdom, kein Browser | Nein |
| Playwright E2E | CI-Runner / Host | Browser-Zugriff noetig | Nein (GPU) |
| Wokwi CLI | CI-Runner / Host | Cloud-API | Nein |
| PlatformIO Build | Host | USB-Flash Zugriff | Optional |
| Linting (Ruff, Black, ESLint) | CI-Runner / Host | Schneller auf Host | Nein |
| Alembic Migrations | In Container (el-servador) | Bereits dockerisiert | JA |

### 2.3 Teilweise (Gemischter Modus)

| Was | Docker-Teil | Host-Teil | CI-Workflow |
|-----|-------------|-----------|-------------|
| Integration-Tests | postgres, mqtt-broker | pytest auf Runner | server-tests.yml |
| Backend E2E | postgres, mqtt-broker, el-servador | pytest auf Runner | **backend-e2e-tests.yml** |
| Frontend E2E | Full Stack (Server, Frontend, DB, MQTT) | Playwright auf Runner | playwright-tests.yml |
| Wokwi-Tests | mqtt-broker | Wokwi CLI, PlatformIO | wokwi-tests.yml |

### 2.4 Alembic Migration

**Dockerfile (El Servador):**
```dockerfile
# Alembic-Dateien werden ins Image kopiert
COPY god_kaiser_server/alembic ./alembic
COPY god_kaiser_server/alembic.ini ./alembic.ini
```

**Alembic-Ausfuehrung:**

| Methode | Befehl | Kontext |
|---------|--------|---------|
| Makefile | `docker exec -it automationone-server python -m alembic upgrade head` | Manuell |
| db-status | `docker exec -it automationone-server python -m alembic current` | Status |
| db-rollback | `docker exec -it automationone-server python -m alembic downgrade -1` | Rollback |

**Startup-Verhalten:**
- **NICHT automatisch** beim Container-Start
- Server nutzt `DATABASE_AUTO_INIT=true` fuer `init_db()` (SQLAlchemy create_all)
- Alembic muss **manuell** via `make db-migrate` ausgefuehrt werden

**Finding (Prio Niedrig):**
- Alembic laeuft nicht automatisch beim Startup
- Kann zu Inkonsistenzen fuehren wenn Schema geaendert wurde
- Option: Entrypoint-Script mit `alembic upgrade head`

**Empfehlung:**
```dockerfile
# Optional: Entrypoint-Script
COPY entrypoint.sh /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uvicorn", "src.main:app", ...]
```

```bash
# entrypoint.sh
#!/bin/bash
set -e
echo "Running Alembic migrations..."
python -m alembic upgrade head
echo "Starting server..."
exec "$@"
```

---

## 3. Sicherheits-Audit

### 3.1 Container-Sicherheit

| Service | Non-root User | Read-only FS | No-new-privileges | Capabilities | Docker Socket | Mitigation |
|---------|---------------|--------------|-------------------|--------------|---------------|------------|
| postgres | postgres (intern) | Nein | **NEIN** | Default | Nein | - |
| mqtt-broker | mosquitto (intern) | Nein | **NEIN** | Default | Nein | - |
| el-servador | **appuser:1000** | Nein | **NEIN** | Default | Nein | - |
| el-frontend | **appuser:1001** | Nein | **NEIN** | Default | Nein | - |
| loki | loki (intern) | Nein | **NEIN** | Default | Nein | - |
| promtail | root | Nein | **NEIN** | Default | **JA (:ro)** | Read-only, gefiltert |
| prometheus | nobody | Nein | **NEIN** | Default | Nein | - |
| grafana | grafana | Nein | **NEIN** | Default | Nein | - |

**Promtail Docker Socket - Risiko-Mitigation:**

1. **Read-only Mount:** `/var/run/docker.sock:/var/run/docker.sock:ro`
   - Promtail kann Container-Logs lesen, aber NICHT Container starten/stoppen

2. **Filter auf Project:** Promtail-Config (`docker/promtail/config.yml`):
   ```yaml
   filters:
     - name: label
       values: ["com.docker.compose.project=auto-one"]
   ```
   - Nur AutomationOne-Container werden gescraped

3. **Alternative (nicht implementiert):** Docker Logging Driver → Loki direkt
   - Wuerde Socket-Mount vermeiden
   - Mehr Konfigurationsaufwand

**Bewertung:** Akzeptables Risiko fuer Development. Production sollte Logging Driver nutzen.

### 3.2 Secrets-Management

| Secret | Speicherort | Hardcoded? | Sicher? |
|--------|-------------|------------|---------|
| POSTGRES_PASSWORD | .env | Nein | JA |
| JWT_SECRET_KEY | .env | Nein | JA |
| GRAFANA_ADMIN_PASSWORD | .env | Nein | JA |
| WOKWI_CLI_TOKEN | .env | Nein | JA |

**Bewertung:** Alle Secrets korrekt in `.env` ausgelagert. `.env` ist in `.gitignore`.

**CI-Secrets (.env.ci):**
- Enthalt CI-spezifische Werte (nicht produktionsrelevant)
- `ci_password`, `ci_test_secret_key_not_for_production`
- Sicher zu committen (keine echten Secrets)

### 3.3 Image-Sicherheit

| Image | Offizielle Quelle | Version gepinnt | Alpine-Variante |
|-------|-------------------|-----------------|-----------------|
| postgres:16-alpine | JA | JA (16) | JA |
| eclipse-mosquitto:2 | JA | JA (2) | N/A |
| python:3.11-slim | JA | JA (3.11) | slim statt alpine |
| node:20-alpine | JA | JA (20) | JA |
| grafana/loki:3.4 | JA | JA | N/A |
| grafana/promtail:3.4 | JA | JA | N/A |
| prom/prometheus:v3.2.1 | JA | JA | N/A |
| grafana/grafana:11.5.2 | JA | JA | N/A |

**Hinweis:**
- Kein Image-Scanning (Trivy, Snyk) konfiguriert

### 3.4 Netzwerk-Sicherheit

| Port | Service | Von aussen erreichbar | Sollte erreichbar sein |
|------|---------|----------------------|------------------------|
| 5432 | PostgreSQL | JA | **NEIN (Production)** |
| 1883 | MQTT | JA | Abhaengig vom Use-Case |
| 9001 | MQTT WS | JA | Abhaengig vom Use-Case |
| 8000 | Server | JA | JA |
| 5173 | Frontend | JA | JA |
| 3000 | Grafana | JA (Profile) | Intern (Production) |
| 9090 | Prometheus | JA (Profile) | **NEIN (Production)** |
| 3100 | Loki | JA (Profile) | **NEIN (Production)** |

**Empfehlung (Production):**
- PostgreSQL: Nur intern exponieren (Port-Mapping entfernen)
- Monitoring-Ports: Hinter Reverse-Proxy mit Auth

### 3.5 Build-Sicherheit

| Aspekt | Status | Bewertung |
|--------|--------|-----------|
| .dockerignore vollstaendig | JA | Gut |
| Secrets nicht in Layer | JA | Gut (via .env zur Runtime) |
| Lock-Files verwendet | JA (poetry.lock, package-lock.json) | Gut |
| Dependencies verifiziert | Teilweise (npm ci, poetry install) | OK |

### 3.6 Environment-Variablen Konsistenz

**.env.example Analyse:**

| Variable | In .env.example | In docker-compose.yml | Match |
|----------|----------------|----------------------|-------|
| POSTGRES_USER | `god_kaiser` | `${POSTGRES_USER}` | JA |
| POSTGRES_PASSWORD | `CHANGE_ME_USE_STRONG_PASSWORD` | `${POSTGRES_PASSWORD}` | JA |
| POSTGRES_DB | `god_kaiser_db` | `${POSTGRES_DB}` | JA |
| DATABASE_URL | `postgresql+asyncpg://...` | Konstruiert | JA |
| JWT_SECRET_KEY | `CHANGE_ME_GENERATE_SECURE_KEY` | `${JWT_SECRET_KEY}` | JA |
| MQTT_BROKER_HOST | `mqtt-broker` | Hardcoded `mqtt-broker` | JA |
| MQTT_BROKER_PORT | `1883` | Hardcoded `1883` | JA |
| CORS_ALLOWED_ORIGINS | `["http://localhost:5173",...]` | `${CORS_ALLOWED_ORIGINS}` indirekt | JA |
| VITE_API_URL | `http://localhost:8000` | `VITE_API_URL` | JA |
| GRAFANA_ADMIN_PASSWORD | `changeme` | `${GRAFANA_ADMIN_PASSWORD}` | JA |
| WOKWI_CLI_TOKEN | (leer) | - | N/A |

**.env.ci Analyse:**

| Variable | Wert | Safe to Commit |
|----------|------|----------------|
| POSTGRES_PASSWORD | `ci_password` | JA (nicht Production) |
| JWT_SECRET_KEY | `ci_test_secret_key_not_for_production` | JA (self-documenting) |
| ENVIRONMENT | `test` | JA |
| TESTING | `true` | JA |

**Bewertung:** Vollstaendig und konsistent. Gute Dokumentation in .env.example.

---

## 4. Performance & Optimierung

### 4.1 Image-Groessen

| Image | Geschaetzte Groesse | Optimierungspotential |
|-------|---------------------|----------------------|
| el-servador | ~400MB | Gering (Multi-Stage bereits) |
| el-frontend (production) | ~50MB | ✅ Multi-Stage implementiert |
| el-frontend (development) | ~800MB | Erwartet (node_modules fuer HMR) |
| postgres:16-alpine | ~230MB | Alpine - optimal |
| eclipse-mosquitto:2 | ~12MB | Minimal |

### 4.2 Build-Caching

| Aspekt | Status | Bewertung |
|--------|--------|-----------|
| BuildKit | ✅ Aktiviert in CI | DOCKER_BUILDKIT=1 gesetzt |
| Layer-Reihenfolge | Gut (deps vor code) | OK |
| CI Build-Cache | ✅ GitHub Actions Cache | actions/cache@v4 fuer Docker layers |

**Implementiert in CI-Workflows (v1.4):**
- `backend-e2e-tests.yml`: BuildKit + Cache
- `playwright-tests.yml`: BuildKit + Cache
- Cache-Key basiert auf Dockerfile + Lockfiles

### 4.3 Startup-Performance

| Service | Healthcheck Interval | Start-Period | Bewertung |
|---------|---------------------|--------------|-----------|
| postgres | 10s | 0s | OK |
| mqtt-broker | 30s | 0s | Lange Intervalle |
| el-servador | 30s | 30s | OK |
| el-frontend | 30s | 30s | OK |
| loki | 15s | 20s | Gut |
| prometheus | 15s | 15s | Gut |
| grafana | 15s | 30s | Gut |

**CI-Overrides (optimiert):**
- Interval: 3-5s (statt 15-30s)
- Start-Period: 3-10s (statt 15-30s)

### 4.4 Resource Limits (EMPFOHLEN)

| Service | CPU Limit | Memory Limit | Memory Reservation | Begruendung |
|---------|-----------|--------------|-------------------|-------------|
| postgres | 1.0 | 512M | 256M | DB braucht RAM fuer Caching |
| mqtt-broker | 0.5 | 128M | 64M | Lightweight Message-Broker |
| el-servador | 1.0 | 512M | 256M | FastAPI + Background Tasks |
| el-frontend | 0.5 | 256M | 128M | Vite Dev / Nginx Prod |
| loki | 1.0 | 512M | 256M | Log-Ingestion |
| prometheus | 0.5 | 512M | 256M | Metric Storage |
| grafana | 0.5 | 256M | 128M | Dashboard Rendering |
| promtail | 0.25 | 128M | 64M | Log-Collection |

**Implementierung:**
```yaml
services:
  el-servador:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          memory: 256M
```

---

## 5. Professionelle Standards

### 5.1 Production-Readiness Scorecard

| Kriterium | Status | Score | Empfehlung |
|-----------|--------|-------|------------|
| Images gepinnt | **8/8** | **100%** | ✅ Alle Images gepinnt |
| Non-root User | 2/8 Custom | 25% | Bereits in Custom Dockerfiles |
| Resource Limits | **8/8** | **100%** | ✅ Alle Services mit Limits |
| Healthchecks | **8/8** | **100%** | ✅ Alle Services mit Healthcheck |
| Restart-Policy | 8/8 | 100% | Alle: unless-stopped |
| Secrets Management | 8/8 | 100% | .env korrekt |
| Log-Rotation | **8/8** | **100%** | ✅ Alle Services mit Log-Rotation |
| Network Isolation | 1/1 | 100% | Alle in automationone-net |
| Backup-Automatisierung | 0.5/1 | 50% | Script existiert, nicht automatisiert |
| Monitoring | 1/1 | 100% | Loki + Prometheus + Grafana |
| Security Scanning | **1/1** | **100%** | ✅ Trivy Workflow implementiert |
| Dev Container | 0/1 | 0% | **FEHLT** |
| Dependency Conditions | **8/8** | **100%** | ✅ el-frontend mit service_healthy |
| Dashboard Provisioning | **1/1** | **100%** | ✅ Datasources + System-Health Dashboard |
| Security-Opts | **2/2** | **100%** | ✅ no-new-privileges fuer Custom Services |

**Gesamt-Score: 81%** - Weitere Verbesserung nach Kurzfristig-Fixes (+2%).

### 5.2 Identifizierte Luecken

1. ~~**Resource Limits fehlen komplett**~~ ✅ BEHOBEN (v1.2)
2. ~~**Kein Image-Scanning**~~ ✅ BEHOBEN (v1.4 - Trivy Workflow)
3. **Keine Dev Container** - DX-Verbesserungspotential
4. ~~**Log-Rotation nur partiell**~~ ✅ BEHOBEN (v1.2 - 8/8 Services)
5. ~~**Keine Security-Opts**~~ ✅ BEHOBEN (v1.2 - Custom Services)
6. ~~**el-frontend ohne service_healthy**~~ ✅ BEHOBEN (v1.2)
7. ~~**Grafana Dashboards nicht provisioniert**~~ ✅ BEHOBEN (v1.4 - System-Health Dashboard)
8. **MQTT allow_anonymous** - Risiko: Unauthorized Access (Dev OK)
9. **Alembic nicht automatisch** - Risiko: Schema-Inkonsistenz

### 5.3 Dev Container Empfehlung

**Empfehlung:** JA - Dev Container erstellen

**Vorteile:**
- Reproduzierbare Dev-Umgebung
- Neue Entwickler in Minuten ready
- VS Code + Claude Code Integration
- Konsistente Tool-Versionen

**Aufwand:** Mittel (1 Tag)

**Vorgeschlagener Inhalt:**
```
.devcontainer/
  devcontainer.json
  docker-compose.devcontainer.yml
  Dockerfile.dev
```

**Features:**
- Python 3.11 + Node 20 + PlatformIO
- VS Code Extensions (Python, Vue, ESP32)
- Alle CLI-Tools vorinstalliert
- Forwarded Ports fuer Debugging

### 5.4 Docker Compose Watch

| Status | Bewertung |
|--------|-----------|
| Konfiguriert | JA (develop: watch: in docker-compose.yml) |
| Aktivierung | `make watch` oder `docker compose watch` |
| Server | sync+restart bei src/ Aenderungen |
| Frontend | sync bei src/ Aenderungen (Vite HMR) |

**Bewertung:** Gut implementiert. Nutzt modernen Watch-Modus statt nur Volume-Mounts.

### 5.5 CI Docker-Kompatibilitaet

| Workflow | Runner | Docker vorinstalliert | Compose-Methode | Services via Compose | Services via GHA |
|----------|--------|----------------------|-----------------|---------------------|------------------|
| server-tests.yml | ubuntu-latest | JA | `docker compose` (V2) | postgres, mqtt-broker | - |
| **backend-e2e-tests.yml** | ubuntu-latest | JA | `docker compose` (V2) | postgres, mqtt-broker, el-servador | - |
| frontend-tests.yml | ubuntu-latest | JA | - | - | - |
| pr-checks.yml | ubuntu-latest | JA | - | - | - |
| playwright-tests.yml | ubuntu-latest | JA | `docker compose` (V2) | Full Stack (e2e.yml) | - |
| wokwi-tests.yml | ubuntu-latest | JA | `docker run` | mosquitto (inline) | - |
| esp32-tests.yml | ubuntu-latest | JA | - | - | - |

**Docker-Nutzung in CI:**

| Aspekt | Status | Bewertung |
|--------|--------|-----------|
| Docker vorinstalliert | JA (GitHub-hosted) | Keine Installation noetig |
| Docker Compose V2 | JA (Plugin) | Konsistent mit Makefile |
| `--wait` Flag | JA | Wartet auf Healthchecks |
| Cleanup | `down -v` in `if: always()` | Korrekt |
| Custom Images | Werden in CI gebaut | Kein Registry-Push |
| Build-Cache | **NICHT konfiguriert** | Empfehlung: GHA Cache |

**Wokwi-Spezialfall:**
- Nutzt `docker run` inline statt Compose
- Dynamischer Container-Name (`mosquitto-${{ github.job }}`)
- Vermeidet Konflikte bei parallelen Jobs

**Empfehlung:** Build-Cache fuer CI aktivieren (siehe Section 4.2)

### 5.6 Backup-Strategie

| Aspekt | Status | Empfehlung |
|--------|--------|------------|
| PostgreSQL Backup | Script existiert | Cron/Scheduler hinzufuegen |
| PostgreSQL Restore | Script existiert | Gut |
| Grafana Dashboards | Nicht gesichert | Provisioning via YAML |
| Prometheus Data | 7 Tage Retention | OK fuer Dev |
| Loki Retention | 7 Tage | OK fuer Dev |

---

## 6. Migrations-Empfehlungen

### 6.1 SOLL in Docker (Priorisiert)

| Was | Aktuell | Empfehlung | Aufwand | Prioritaet |
|-----|---------|------------|---------|------------|
| pytest Integration | Host + Docker Services | Vollstaendig in Docker | Klein | Niedrig |
| pytest E2E | Host + Docker Services | Bereits so | - | - |
| Alembic Migrations | Im Container | Bereits so | - | - |

**Begruendung:** Integration-Tests profitieren kaum von vollstaendiger Containerisierung, da die Services bereits dockerisiert sind.

### 6.2 SOLL NICHT in Docker

| Was | Begruendung |
|-----|-------------|
| Vitest (Frontend Unit) | Laeuft in jsdom, kein externer Dependency |
| Playwright | Browser braucht GPU-Zugriff, Host ist besser |
| Wokwi CLI | Cloud-API, Docker bringt nichts |
| PlatformIO Flash | USB-Zugriff zum ESP32 |
| Linting | Schneller auf Host, keine Dependencies |
| IDE / VS Code | Braucht GUI, Extensions, lokale Config |
| Git Operations | SSH Keys, GPG, lokale Config |

### 6.3 Dev Container Plan

**Phase 1 (Basis):**
- devcontainer.json mit Python + Node
- Alle CLI-Tools (poetry, npm, platformio, wokwi-cli)
- VS Code Extensions

**Phase 2 (Integration):**
- Docker-in-Docker fuer Compose
- Port-Forwarding

**Aufwand:** Mittel (1-2 Tage)

---

## 7. Priorisierter Aktionsplan

### Sofort (Security)

| # | Aktion | Aufwand | Befehl |
|---|--------|---------|--------|
| 1 | Security-opts hinzufuegen | Klein | Siehe Section 3.1 |
| 2 | Resource Limits hinzufuegen | Mittel | Siehe Section 4.4 |
| 3 | el-frontend service_healthy | Klein | `condition: service_healthy` |

### Kurzfristig (Optimierung)

| # | Aktion | Aufwand | Befehl |
|---|--------|---------|--------|
| 4 | Log-Rotation fuer alle Services | Klein | logging.options hinzufuegen |
| 5 | Frontend Multi-Stage Build | Mittel | Dockerfile umbauen |
| 6 | BuildKit in CI aktivieren | Klein | Workflow anpassen |
| 7 | Grafana Dashboards provisionieren | Mittel | JSON-Export + Mount |

### Mittelfristig (Migration)

| # | Aktion | Aufwand | Befehl |
|---|--------|---------|--------|
| 8 | Dev Container erstellen | Mittel | .devcontainer/ |
| 9 | CI Build-Cache | Klein | GitHub Actions Cache |
| 10 | Image-Scanning (Trivy) | Klein | CI Workflow hinzufuegen |
| 11 | Alembic Auto-Migration | Klein | Entrypoint-Script |

### Langfristig (Professionalisierung)

| # | Aktion | Aufwand | Befehl |
|---|--------|---------|--------|
| 12 | Backup-Automatisierung | Mittel | Cron-Container |
| 13 | Production Compose-File | Gross | Eigenes docker-compose.prod.yml |
| 14 | Docker Secrets (Swarm) | Gross | Swarm-Migration |
| 15 | MQTT Authentication | Mittel | password_file + acl_file |

---

## 8. Entwicklerbefehle (Ready-to-Copy)

### 8.1 Sofort: Security-opts fuer Server

```yaml
# In docker-compose.yml nach el-servador service:
    security_opt:
      - no-new-privileges:true
```

### 8.2 Sofort: Resource Limits (Beispiel Server)

```yaml
# In docker-compose.yml nach el-servador service:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          memory: 256M
```

### 8.3 Sofort: el-frontend service_healthy

```yaml
# In docker-compose.yml el-frontend depends_on:
    depends_on:
      el-servador:
        condition: service_healthy  # HINZUFUEGEN
```

### 8.4 Kurzfristig: Log-Rotation fuer postgres

```yaml
# In docker-compose.yml nach postgres service:
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

### 8.5 Mittelfristig: Trivy Scanning in CI

```yaml
# In .github/workflows/pr-checks.yml hinzufuegen:
  trivy-scan:
    name: Security Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build Server Image
        run: docker build -t el-servador:scan ./El\ Servador
      - name: Run Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'el-servador:scan'
          exit-code: '1'
          severity: 'CRITICAL,HIGH'
```

---

## 9. CLAUDE.md Update

Folgende Zeile muss in `.claude/CLAUDE.md` ergaenzt werden:

**In Section "Referenzen":**
```
| `reference/infrastructure/` | DOCKER_REFERENCE |
```

**Neuer Ordner zu erstellen:**
`.claude/reference/infrastructure/`

---

## Versionsverlauf

| Version | Datum | Aenderung |
|---------|-------|----------|
| 1.0 | 2026-02-06 | Initiale Erstellung |
| 1.1 | 2026-02-06 | Nachaudit: 12 fehlende Punkte ergaenzt |
| 1.2 | 2026-02-06 | Sofort-Fixes implementiert: security_opt, resource limits, log-rotation, frontend depends_on service_healthy, Frontend .dockerignore Playwright-Patterns |
| 1.3 | 2026-02-06 | Backend E2E Tests CI-Integration: backend-e2e-tests.yml hinzugefuegt, Section 2.3 und 5.5 aktualisiert |
| 1.4 | 2026-02-06 | Kurzfristig-Fixes: Frontend Multi-Stage Build (800MB→50MB), BuildKit CI Cache, Trivy Security Scanning, Grafana Dashboard Provisioning |
| 1.5 | 2026-02-09 | Phantom-Service-Korrektur: pgAdmin als nicht-existenten Service entfernt (9→8 Services), Scores korrigiert (Healthchecks 8/8=100%, promtail HC korrigiert), devtools-Profile entfernt, Aktionsplan bereinigt |

**Neue Sections in v1.1:**
- 1.1.2 Dev Overrides (Detail)
- 1.1.3 Test Overrides (Detail)
- 1.1.4 CI Overrides (Detail)
- 1.1.5 E2E Compose (Detail)
- 1.5 Service-Konfigurationen (MQTT, PostgreSQL, Grafana)
- 1.6 Startup-Chain & Dependency-Graph
- 1.7 Frontend-Backend Verbindungs-Matrix
- 1.8 Compose Schema & Kompatibilitaet
- 2.4 Alembic Migration
- 3.6 Environment-Variablen Konsistenz
- 5.5 CI Docker-Kompatibilitaet
- Versionsverlauf

**Score-Aenderung:** 64% → 65% (mehr Detail, gleiche Findings)

**v1.5 Korrektur:**
- pgAdmin war als Phantom-Service dokumentiert (existiert nicht in docker-compose.yml)
- Service-Count 9 → 8 korrigiert
- promtail Healthcheck war faelschlich als fehlend markiert (TCP:9080 existiert)
- Alle Scores neu berechnet (8/8 Basis)

---

*Erstellt: 2026-02-06 | Aktualisiert: 2026-02-09 | Agent: DevOps-Analyst | AutomationOne Docker-Vollaudit v1.5*
