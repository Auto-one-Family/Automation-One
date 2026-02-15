# Skill-Analyse: system-control

**Datum:** 2026-02-05 21:00 UTC
**Skill:** `system-control`
**Fragen:** 5-7
**Status:** VOLLSTÄNDIG

---

## 5. Make-Targets Detail

**Datei:** `Makefile` (Root)

| Target | Zeile | Befehl(e) | Prerequisites | Parameter |
|--------|-------|-----------|---------------|-----------|
| `up` | 24-25 | `docker compose up -d` | - | - |
| `down` | 27-28 | `docker compose down` | - | - |
| `dev` | 30-31 | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d` | - | - |
| `dev-down` | 33-34 | `docker compose -f ... down` | - | - |
| `test` | 36-37 | `docker compose -f ... -f docker-compose.test.yml up -d` | - | - |
| `test-down` | 39-40 | `docker compose -f ... down -v` | - | - |
| `logs` | 42-43 | `docker compose logs -f --tail=100` | - | - |
| `logs-server` | 45-46 | `docker compose logs -f --tail=100 el-servador` | - | - |
| `logs-mqtt` | 48-49 | `docker compose logs -f --tail=100 mqtt-broker` | - | - |
| `shell-server` | 51-52 | `docker exec -it automationone-server /bin/bash` | - | - |
| `shell-db` | 54-55 | `docker exec -it automationone-postgres psql -U god_kaiser -d god_kaiser_db` | - | - |
| `db-migrate` | 57-58 | `docker exec ... python -m alembic upgrade head` | - | - |
| `db-rollback` | 60-61 | `docker exec ... python -m alembic downgrade -1` | - | - |
| `db-backup` | 63-65 | `./scripts/docker/backup.sh` | - | - |
| `db-restore` | 67-68 | `./scripts/docker/restore.sh $(FILE)` | - | **FILE=path** |
| `mqtt-sub` | 70-71 | `docker exec ... mosquitto_sub -h localhost -t "#" -v` | - | - |
| `status` | 73-74 | `docker compose ps` | - | - |
| `health` | 76-77 | `docker exec ... curl -s http://localhost:8000/api/v1/health/live` | - | - |
| `build` | 79-80 | `docker compose build` | - | - |
| `clean` | 82-83 | `docker compose down -v --remove-orphans` | - | - |

### Zusammenfassung

| Aspekt | Wert |
|--------|------|
| Anzahl Targets | **20** |
| Mit Prerequisites | **0** |
| Mit Parametern | **1** (`db-restore FILE=<path>`) |

### Target-Kategorien

| Kategorie | Targets |
|-----------|---------|
| **Lifecycle** | `up`, `down`, `dev`, `dev-down`, `test`, `test-down`, `build`, `clean` |
| **Logging** | `logs`, `logs-server`, `logs-mqtt` |
| **Shell-Access** | `shell-server`, `shell-db` |
| **Database** | `db-migrate`, `db-rollback`, `db-backup`, `db-restore` |
| **Monitoring** | `status`, `health` |
| **MQTT** | `mqtt-sub` |

---

## 6. Health-Check Flow

### Make Health (Makefile:76-77)
```makefile
health:
    @docker exec automationone-server curl -s http://localhost:8000/api/v1/health/live || echo "Server not responding"
```

### Health-Endpoints

**Datei:** `El Servador/god_kaiser_server/src/api/v1/health.py`

| Endpoint | Zeile | Auth | Response (healthy) | Response (unhealthy) |
|----------|-------|------|--------------------|--------------------|
| `GET /v1/health/` | 62-90 | Nein | `{"status": "healthy", "mqtt_connected": true}` | `{"status": "degraded", ...}` |
| `GET /v1/health/detailed` | 98-207 | **JA** | Status + DB/MQTT/WS Details | Warnings |
| `GET /v1/health/live` | 431-446 | Nein | `{"success": true, "alive": true}` | - (always true) |
| `GET /v1/health/ready` | 449-486 | Nein | `{"ready": true, "checks": {...}}` | HTTP 503 |
| `GET /v1/health/esp` | 215-343 | **JA** | Aggregate Counts + Devices | Errors |
| `GET /v1/health/metrics` | 351-423 | Nein | Prometheus-Format | - |

### Endpoint-Details

#### /v1/health/live (Liveness Probe)
- **Zweck:** Kubernetes Liveness Check
- **Response:** Immer `200 OK` wenn Server läuft
- **Kein DB/MQTT Check** - nur "bin ich am Leben?"

#### /v1/health/ready (Readiness Probe)
- **Zweck:** Kubernetes Readiness Check
- **Prüft:** DB-Connection, MQTT-Connection
- **Response:** `503` wenn nicht ready

#### /v1/health/ (Quick Check)
- **Zweck:** Schneller Status-Check
- **Prüft:** MQTT-Connection
- **Response:** `healthy` oder `degraded`

### Docker Health-Checks

**Datei:** `docker-compose.yml`

| Service | Zeile | Test | Intervall | Timeout | Retries | start_period |
|---------|-------|------|-----------|---------|---------|--------------|
| postgres | 30-34 | `pg_isready -U god_kaiser -d god_kaiser_db` | 10s | 5s | 5 | - |
| mqtt-broker | 52-56 | `mosquitto_sub -t "$SYS/#" -C 1 -i healthcheck -W 3` | 30s | 10s | 3 | - |
| el-servador | 99-104 | `curl -f http://localhost:8000/api/v1/health/live` | 30s | 10s | 3 | 30s |
| el-frontend | 133-138 | `fetch('http://localhost:5173')` | 30s | 10s | 3 | 30s |

### Health-Check Timeline

```
Service Start:
  t=0s     postgres health-check startet
  t=10s    postgres: erster check (pg_isready)
  t=0s     mqtt-broker health-check startet
  t=30s    mqtt-broker: erster check (mosquitto_sub)

Nach Dependencies healthy:
  t=0s     el-servador startet
  t=30s    start_period endet
  t=60s    el-servador: erster health-check

Nach el-servador healthy:
  t=0s     el-frontend startet
  t=30s    start_period endet
  t=60s    el-frontend: erster health-check
```

---

## 7. Service-Abhängigkeiten

### Startup-Order (docker-compose.yml:94-104)

```yaml
el-servador:
  depends_on:
    postgres:
      condition: service_healthy    # KRITISCH
    mqtt-broker:
      condition: service_healthy    # KRITISCH
```

### Abhängigkeitskette

```
Docker Startup:
  postgres (starts first)
    ↓ (waits für pg_isready)
  mqtt-broker (parallel zu postgres)
    ↓ (waits für mosquitto_sub)
  el-servador (nur wenn BEIDE healthy)
    ├─ init_db()
    ├─ MQTTClient.connect()
    └─ Services starten
  el-frontend (nur wenn el-servador läuft)
```

### PostgreSQL Not Ready Scenario

**Datei:** `El Servador/god_kaiser_server/src/main.py:154-165`

```python
# Step 1: Initialize database
if settings.database.auto_init:
    logger.info("Initializing database...")
    await init_db()  # ← Blockiert bis DB ready
    logger.info("Database initialized successfully")
else:
    logger.info("Skipping database init (auto_init=False)")
    get_engine()

# Initialize database circuit breaker after DB is ready
init_db_circuit_breaker()
```

**Ergebnis:** Mit `service_healthy` Condition startet Server NICHT bevor DB ready ist.

### Race-Condition Prevention

| Mechanismus | Beschreibung |
|-------------|--------------|
| `service_healthy` | Docker wartet auf Health-Check |
| `start_period` | Grace-Period vor erstem Check |
| Circuit Breaker | Server-interner Schutz bei Runtime-Ausfällen |

---

## Kritische Dateien für system-control

| Datei | Zweck |
|-------|-------|
| `Makefile` | Alle Make-Targets |
| `docker-compose.yml` | Service-Definitionen, Health-Checks, Dependencies |
| `docker-compose.dev.yml` | Development Overrides |
| `docker-compose.test.yml` | Test Overrides |
| `scripts/docker/backup.sh` | DB Backup Script |
| `scripts/docker/restore.sh` | DB Restore Script |
| `El Servador/god_kaiser_server/src/api/v1/health.py` | Health-Endpoints |
| `El Servador/god_kaiser_server/src/main.py` | Server Startup |

---

## Findings für Skill-Erstellung

### Empfohlene Befehls-Referenz

| Aktion | Befehl | Hinweis |
|--------|--------|---------|
| System starten | `make up` | Production-Mode |
| Development | `make dev` | Mit Hot-Reload |
| Status prüfen | `make status` | Docker Container Status |
| Health prüfen | `make health` | Server Liveness |
| Server-Logs | `make logs-server` | Tail mit 100 Zeilen |
| MQTT beobachten | `make mqtt-sub` | Alle Topics (#) |
| DB-Shell | `make shell-db` | psql Session |
| DB migrieren | `make db-migrate` | Alembic upgrade head |
| Backup erstellen | `make db-backup` | → ./backups/ |
| Alles stoppen | `make clean` | + Volumes löschen |

### Wichtige Hinweise

1. **Keine Target-Dependencies** - Jedes Target ist unabhängig
2. **Nur db-restore hat Parameter** - `FILE=path/to/backup.sql.gz`
3. **service_healthy Condition** - Verhindert Race-Conditions beim Startup
4. **30s start_period** - Server/Frontend haben Grace-Period
