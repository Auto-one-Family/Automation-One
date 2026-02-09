# MCP Access Rules - Technical Manager

> TM = Observer & Coordinator, NOT implementer.
> Robin is ALWAYS the interface between TM and VS Code Claude.

---

## ALLOWED: Own Workspace (Read/Write)

```
.technical-manager/           Full access
  skills/                     Read skill definitions
  reports/                    Write reports (current/, infrastructure/, ci-quality/, strategic/)
  commands/                   Write commands for VS Code (pending/ -> completed/)
  inbox/                      Read agent responses (agent-reports/, system-logs/)
  archive/                    Archive old reports and commands
  config/                     Read access rules
```

---

## ALLOWED: Read-Only Paths

### Agent Reports (from VS Code agents via Robin)

- `.claude/reports/current/` (SESSION_BRIEFING.md, CONSOLIDATED_REPORT.md, individual agent reports)
- `.claude/reports/Testrunner/` (test-log-analyst output)

### Reference Documentation

| Path | Content |
|------|---------|
| `.claude/reference/api/REST_ENDPOINTS.md` | REST API endpoints |
| `.claude/reference/api/MQTT_TOPICS.md` | MQTT topic structure |
| `.claude/reference/api/WEBSOCKET_EVENTS.md` | WebSocket event types |
| `.claude/reference/errors/ERROR_CODES.md` | Error code ranges (ESP: 1000-4999, Server: 5000-5999) |
| `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | Data flow between components |
| `.claude/reference/patterns/ARCHITECTURE_DEPENDENCIES.md` | System dependencies |
| `.claude/reference/infrastructure/DOCKER_REFERENCE.md` | Docker stack details |
| `.claude/reference/debugging/LOG_LOCATIONS.md` | Where logs are stored |
| `.claude/reference/debugging/CI_PIPELINE.md` | CI pipeline details |
| `.claude/reference/security/PRODUCTION_CHECKLIST.md` | Security standards |

### Configuration Files

| Path | Note |
|------|------|
| `docker-compose.yml` | Base stack (9 services) |
| `docker-compose.ci.yml` | CI overrides |
| `docker-compose.e2e.yml` | E2E overrides |
| `Makefile` | Available targets |
| `.env.example` | Config template (NOT `.env` - no secrets!) |
| `.gitignore` | Ignored paths |
| `.github/workflows/*.yml` | CI workflow definitions |
| `docs/` | Project documentation |
| `El Trabajante/docs/` | Firmware documentation |

---

## FORBIDDEN: No Access

### Source Code (VS Code Territory)

| Path | Reason |
|------|--------|
| `El Servador/god_kaiser_server/src/` | Backend application code |
| `El Frontend/src/` | Frontend application code |
| `El Trabajante/src/` | Firmware source code |
| `El Trabajante/tests/` | Firmware test code |
| `El Servador/god_kaiser_server/tests/` | Backend test code |
| `El Frontend/tests/` | Frontend test code |

### VS Code Agent System

| Path | Reason |
|------|--------|
| `.claude/agents/` | VS Code agent definitions (agents are autonomous) |
| `.claude/skills/` | VS Code skill definitions |
| `.claude/rules/` | VS Code coding rules |
| `.claude/reference/testing/` | VS Code internal testing workflows |

### Secrets & Credentials

| Path | Reason |
|------|--------|
| `.env` | Local secrets (passwords, tokens) |
| `docker/pgadmin/` | pgAdmin credentials |

---

## Allowed Bash Commands

```bash
# Docker (read-only observation)
docker ps, docker stats, docker inspect, docker logs
docker network inspect, docker volume ls, docker system df

# Docker exec (read-only queries only)
docker exec [container] pg_isready          # OK: health check
docker exec [container] mosquitto_sub       # OK: subscribe (observe)
docker exec [container] alembic current     # OK: migration status
# docker exec with write operations          # FORBIDDEN

# Git (metadata only)
git status, git log, git branch, git diff --stat, git diff --name-only
git rev-list, git ls-files

# HTTP (health checks, GET only)
curl (GET only, to localhost endpoints)

# GitHub CLI (read-only)
gh run list, gh run view, gh pr list, gh issue list
gh api (GET only)

# File system (counts and listings only)
ls, wc -l
```

## Forbidden Operations

| Operation | Reason |
|-----------|--------|
| `docker compose up/down/restart` | Robin does this via Makefile |
| `docker exec` with write operations | No write access to containers |
| `git commit/push/merge` | Robin manages git (via /git-commit) |
| Database write operations | No DB modifications |
| MQTT publish | Only observe (subscribe) |
| `cat/head/tail` on source files | No source code access |
| Write to `.claude/` | VS Code territory |

---

## Rationale

**TM = Observer & Coordinator, NOT Implementer**

This separation prevents:
1. **Code pollution** - TM can't accidentally break implementation
2. **Context overload** - TM doesn't see 170+ backend files
3. **Duplicate work** - One coder at a time, agents work autonomously
4. **Security risks** - TM never sees secrets or credentials
5. **Role confusion** - Clear boundary: TM orchestrates, agents execute
