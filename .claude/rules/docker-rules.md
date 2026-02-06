---
paths:
  - "docker-compose*"
  - "Makefile"
  - "scripts/docker/*"
  - "Dockerfile*"
  - "docker/**"
---

# Docker Rules

> **Scope:** `docker-compose*`, `Makefile`, `scripts/docker/*`, `Dockerfile*`

---

## Verification Requirements

- All changes to Docker files MUST be verified with `make status` and `make health`
- Test Compose overrides (dev, test) to ensure they don't break the base configuration

---

## Security

- **No hardcoded secrets** in `docker-compose.yml`
  - Use `.env` file or Docker Secrets
  - Reference: `.claude/reference/security/PRODUCTION_CHECKLIST.md`

---

## Service Requirements

Every new service MUST have:

| Requirement | Example |
|-------------|---------|
| Healthcheck | `healthcheck: test: ["CMD", "curl", "-f", "http://localhost:8000/health"]` |
| Restart Policy | `restart: unless-stopped` |
| Defined Network | `networks: - automationone-network` |

---

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Named Volumes | `automationone-{service}-{purpose}` | `automationone-postgres-data` |
| Bind-Mount Logs | `./logs/{service}/` | `./logs/server/`, `./logs/mqtt/` |
| Containers | `automationone-{service}` | `automationone-server` |
| Networks | `automationone-{purpose}` | `automationone-network` |

---

## Log Bind-Mounts

All service logs use bind-mounts for easy access:

| Service | Host Path | Container Path |
|---------|-----------|----------------|
| Server | `./logs/server/` | `/app/logs` |
| MQTT | `./logs/mqtt/` | `/mosquitto/log` |
| PostgreSQL | `./logs/postgres/` | `/var/log/postgresql` |

**Config Files:**
- PostgreSQL: `docker/postgres/postgresql.conf` (mounted read-only)

---

## Port Mapping

- Prefer **Host-Port = Container-Port** where possible
- Document exceptions with reason

| Service | Host | Container | Note |
|---------|------|-----------|------|
| Server | 8000 | 8000 | FastAPI |
| PostgreSQL | 5432 | 5432 | Database |
| MQTT | 1883 | 1883 | Mosquitto |
| Frontend | 3000 | 3000 | Vite Dev |

---

## Database Considerations

- Backup scripts MUST be tested before changes to DB schema
- Alembic migrations should be runnable inside container

---

## Workflow

```
1. Edit Docker files
2. Run: make build (or docker-compose build)
3. Run: make up (or docker-compose up -d)
4. Verify: make status
5. Verify: make health
6. Test affected functionality
```
