# AutomationOne - Agent Instructions

## Cursor Cloud specific instructions

### Architecture Overview
AutomationOne is a server-centric IoT framework with three main components. See `README.md` for full documentation.

| Service | Stack | Port |
|---------|-------|------|
| **El Servador** (Backend) | Python 3.11+, FastAPI, SQLAlchemy, Alembic | 8000 |
| **El Frontend** (Dashboard) | Vue 3, TypeScript, Vite, Tailwind CSS | 5173 |
| **PostgreSQL** | Docker: `postgres:16-alpine` | 5432 |
| **Mosquitto MQTT** | Docker: `eclipse-mosquitto:2` | 1883, 9001 |

### Starting Services

1. **Start Docker daemon** (required in Cloud VM):
   ```
   sudo dockerd &>/tmp/dockerd.log &
   sleep 3
   sudo chmod 666 /var/run/docker.sock
   docker network create shared-infra-net 2>/dev/null || true
   ```

2. **Start infrastructure** (PostgreSQL + Mosquitto):
   ```
   cd /workspace && docker compose up -d postgres mqtt-broker
   ```
   Wait for containers to be healthy before starting the backend.

3. **Start backend** (El Servador):
   ```
   cd "/workspace/El Servador/god_kaiser_server"
   export DATABASE_URL="postgresql+asyncpg://god_kaiser:CHANGE_ME_USE_STRONG_PASSWORD@localhost:5432/god_kaiser_db"
   export DATABASE_AUTO_INIT=true
   export MQTT_BROKER_HOST=localhost
   export MQTT_BROKER_PORT=1883
   export JWT_SECRET_KEY=dev-secret-key-for-testing-only
   export ENVIRONMENT=development
   export LOG_LEVEL=INFO
   poetry run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
   ```

4. **Start frontend** (El Frontend):
   ```
   cd "/workspace/El Frontend"
   VITE_API_URL=http://localhost:8000 VITE_WS_URL=ws://localhost:8000 npx vite --host 0.0.0.0 --port 5173
   ```

### Running Tests

- **Backend tests**: `cd "/workspace/El Servador/god_kaiser_server" && poetry run pytest tests/ --timeout=120`
  - 1820+ unit/integration tests; E2E tests need `--e2e` flag and running stack
- **Backend lint**: `cd "/workspace/El Servador/god_kaiser_server" && poetry run ruff check src/`
- **Frontend tests**: `cd "/workspace/El Frontend" && npx vitest run`
  - 1581+ unit tests (47 test files)
- **Frontend type-check**: `cd "/workspace/El Frontend" && npx vue-tsc --noEmit`
- **Frontend build**: `cd "/workspace/El Frontend" && npx vite build`

### Gotchas

- The `docker-compose.yml` references an external network `shared-infra-net` — must create it with `docker network create shared-infra-net` before starting services.
- The Docker daemon in the Cloud VM needs `fuse-overlayfs` storage driver and `iptables-legacy` for nested container support.
- Backend env vars use `DATABASE_URL` with `postgresql+asyncpg://` scheme (async driver), not plain `postgresql://`.
- Default `.env.example` password is `CHANGE_ME_USE_STRONG_PASSWORD` — use this for dev, the Docker PostgreSQL container is created with it.
- First-time setup requires creating an admin user via `POST /api/v1/auth/setup` with `{"username":"admin","password":"Admin123!","email":"admin@automationone.dev"}`.
- Backend Poetry virtualenv is stored in-project at `El Servador/god_kaiser_server/.venv` (configured via `poetry config virtualenvs.in-project true`).
- The `Makefile` provides convenient Docker Compose shortcuts; see `make help` for all targets.
- ESP32 firmware (`El Trabajante/`) is optional for dev — Mock ESPs can be created via the Debug API.

## Claude Code — Orchestrator `auto-debugger` (optional)

For structured **incident** or **markdown artefact improvement** workflows in-repo, use the **`auto-debugger`** agent with a **control file** under [`.claude/auftraege/auto-debugger/inbox/`](.claude/auftraege/auto-debugger/inbox/) (template: [`STEUER-VORLAGE.md`](.claude/auftraege/auto-debugger/STEUER-VORLAGE.md)). Chat example: `@.claude/auftraege/auto-debugger/inbox/STEUER-….md`. **Work branch:** `auto-debugger/work` (branched from `master`) — check out before runs; delegated dev work should commit only there. **Flow:** `TASK-PACKAGES.md` → apply **`verify-plan`** (orchestrator output block in skill) → **`VERIFY-PLAN-REPORT.md`** → **`auto-debugger`** revises **`TASK-PACKAGES.md`** → updates **`SPECIALIST-PROMPTS.md`** per dev role → hand off to dev agents. Router details: [`.claude/CLAUDE.md`](.claude/CLAUDE.md) (Orchestrator section). Skill: [`.claude/skills/auto-debugger/SKILL.md`](.claude/skills/auto-debugger/SKILL.md). Slash command: [`.claude/commands/auto-debugger.md`](.claude/commands/auto-debugger.md).
