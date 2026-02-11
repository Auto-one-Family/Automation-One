# Skill: Infrastructure Status

> **Target:** Claude Desktop (Technical Manager)
> **Tools:** filesystem (read-only), bash (docker, git), web_fetch (monitoring APIs)
> **Time:** ~60 seconds
> **Output:** `reports/infrastructure/infra-status-YYYY-MM-DD-HHMM.md`
>
> Docker Health + Monitoring Stack + Git Repository in one check.
> Answers: "Is everything running? What do the metrics say? Where is the repo?"

---

## Phase 1: Data Collection

### 1.1 Docker Stack

```bash
# Container status (11 services: 4 core + 6 monitoring + 1 devtools)
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Resource usage
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# Health checks per service
docker inspect automationone-postgres --format='{{.State.Health.Status}}' 2>/dev/null || echo "not running"
docker inspect automationone-mqtt --format='{{.State.Health.Status}}' 2>/dev/null || echo "not running"
docker inspect automationone-server --format='{{.State.Health.Status}}' 2>/dev/null || echo "not running"
docker inspect automationone-frontend --format='{{.State.Health.Status}}' 2>/dev/null || echo "not running"
docker inspect automationone-loki --format='{{.State.Health.Status}}' 2>/dev/null || echo "not running"
docker inspect automationone-prometheus --format='{{.State.Health.Status}}' 2>/dev/null || echo "not running"
docker inspect automationone-grafana --format='{{.State.Health.Status}}' 2>/dev/null || echo "not running"

# Restart counts (stability indicator)
docker inspect automationone-server --format='{{.RestartCount}}' 2>/dev/null
docker inspect automationone-postgres --format='{{.RestartCount}}' 2>/dev/null

# Network + Volumes
docker network inspect automationone-net --format='{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null
docker volume ls --filter name=automationone
```

#### Expected Services

| Service | Container | Port | Healthcheck | Profile |
|---------|-----------|------|-------------|---------|
| PostgreSQL | automationone-postgres | 5432 | pg_isready | core |
| Mosquitto | automationone-mqtt | 1883, 9001 | mosquitto_sub | core |
| El Servador | automationone-server | 8000 | curl /api/v1/health/live | core |
| El Frontend | automationone-frontend | 5173 | node fetch | core |
| pgAdmin | automationone-pgadmin | 5050 | - | devtools |
| Loki | automationone-loki | 3100 | wget /ready | monitoring |
| Promtail | automationone-promtail | - | - | monitoring |
| Prometheus | automationone-prometheus | 9090 | wget /-/healthy | monitoring |
| Grafana | automationone-grafana | 3000 | wget /api/health | monitoring |
| Postgres Exporter | automationone-postgres-exporter | (expose only) | pg_isready probe | monitoring |
| Mosquitto Exporter | automationone-mosquitto-exporter | (expose only) | HTTP probe | monitoring |

**Reference:** `.claude/reference/infrastructure/DOCKER_REFERENCE.md`

### 1.2 Service Endpoints

```bash
# Backend API
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/v1/health/live

# Frontend
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173

# MQTT Broker
docker exec automationone-mqtt mosquitto_sub -t '$SYS/broker/version' -C 1 -W 3 2>/dev/null

# Prometheus
curl -s -o /dev/null -w "%{http_code}" http://localhost:9090/-/healthy

# Grafana
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health

# Loki
curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/ready
```

### 1.3 Monitoring Stack (only if monitoring profile active)

```bash
# Prometheus: Scrape target status
curl -s http://localhost:9090/api/v1/query?query=up | jq '.data.result[] | {job: .metric.job, status: .value[1]}'

# Loki: Error rate (last 5 minutes)
# IMPORTANT: Label is "service_name" (NOT "service"!)
# Values are container names: automationone-server, automationone-mqtt, automationone-postgres
curl -s "http://localhost:3100/loki/api/v1/query?query=count_over_time({service_name=~\".+\"} |~ \"error|exception|fail|critical\" [5m])"

# Grafana: Datasources connected?
curl -s http://localhost:3000/api/datasources | jq '.[].name'
```

**Reference:** `.claude/reference/infrastructure/DOCKER_REFERENCE.md` Section 5

### 1.4 Git Repository

```bash
git branch --show-current
git status --short | wc -l
git diff --cached --stat
git diff --stat
git ls-files --others --exclude-standard | wc -l
git log --oneline -10
git rev-list --left-right --count HEAD...origin/$(git branch --show-current) 2>/dev/null
git branch -a --sort=-committerdate | head -10
```

### 1.5 Host Log Directories

```bash
# Bind-mount log directories
ls -lh logs/server/ 2>/dev/null | tail -5
ls -lh logs/mqtt/ 2>/dev/null | tail -5
ls -lh logs/postgres/ 2>/dev/null | tail -5
```

**Reference:** `.claude/reference/debugging/LOG_LOCATIONS.md`

---

## Phase 2: Verification

### Plausibility Checks

| Check | Expected | Problem if |
|-------|----------|-----------|
| CPU% at idle | < 10% per service | > 50% = infinite loop or bug |
| Memory trend | Stable after startup | Monotonically growing = memory leak |
| Health "starting" | < 2 min after start | > 5 min = healthcheck problem |
| Restart count | 0 | > 0 = instability |

### Cross-Checks

| Check A | Check B | Contradiction if |
|---------|---------|-----------------|
| `docker ps` says "running" | Health endpoint returns 503 | Container up, service down |
| Compose defines 11 services (4 core + 6 monitoring + 1 devtools) | `docker ps` shows < 4 | Core services missing |
| `docker stats` shows 0 Net I/O | Service should receive MQTT | Network problem |
| Git says "ahead 0" | Recent commits are local | Remote not pushed |
| Prometheus `up` = 1 | curl health returns 503 | Scrape OK but service degraded |
| Loki error count = 0 | Server log has errors | Promtail not collecting |

### On Contradiction

Delegate to system-control for quick verification:
```
@system-control

**Context:** Infrastructure check found contradiction: [describe what Check A shows vs Check B].
**Focus:** [Specific service or component].
**Goal:** Verify actual state and resolve the contradiction.
**Success Criterion:** Clear answer on which check is correct.
```

---

## Phase 3: Analysis

### Health Matrix

| Area | Healthy | Degraded | Down |
|------|---------|----------|------|
| Docker Core (4) | All 4 running + healthy | 1-2 unhealthy | < 3 running |
| Docker Monitoring (4) | All running | Partial | - |
| Endpoints | All 200 | 1-2 unreachable | Core API down |
| Git | Clean, on branch | Uncommitted changes | Merge conflicts |
| Monitoring | Metrics + logs flowing | Gaps | Stack offline |

### Priority Classification

| Priority | Symptom | Action |
|----------|---------|--------|
| CRITICAL | Core service down | Report immediately, VS Code command for `@system-control` |
| HIGH | Restart count > 0 | Root-cause via `@server-debug` |
| HIGH | Health "unhealthy" | Check service-specific logs |
| MEDIUM | Monitoring gaps | Check Promtail/Loki config |
| LOW | Git uncommitted changes | Mention informatively |
| LOW | pgAdmin stopped | Expected (devtools profile) |

---

## Phase 4: Output & Integration

### Report Path

`.technical-manager/reports/infrastructure/infra-status-YYYY-MM-DD-HHMM.md`

### Report Structure

```markdown
# Infrastructure Status Report

**Generated:** [TIMESTAMP]
**Branch:** [BRANCH]
**Overall:** [HEALTHY / DEGRADED / DOWN]

## Docker Stack ([X]/9 running)

| Container | Status | Health | Uptime | Restarts |
|-----------|--------|--------|--------|----------|
| ... | ... | ... | ... | ... |

## Resource Usage

| Container | CPU% | Memory | Net I/O |
|-----------|------|--------|---------|
| ... | ... | ... | ... |

## Service Endpoints

| Endpoint | URL | Expected | Actual | Status |
|----------|-----|----------|--------|--------|
| ... | ... | 200 | [CODE] | [OK/FAIL] |

## Monitoring (if active)

- Prometheus targets: [up/down per target]
- Loki error rate (5m): [count]
- Grafana datasources: [connected/disconnected]

## Git Repository

- Branch: [NAME], Uncommitted: [COUNT], Ahead/Behind: [X]/[Y]
- Last 5 commits: [LOG]

## Verification Results

| Cross-Check | Result | Note |
|-------------|--------|------|
| ... | PASS/FAIL | ... |

## Issues Detected

| Priority | Issue | Affected | Action |
|----------|-------|----------|--------|
| ... | ... | ... | ... |

## Integration

**Context:** [What this means for the system]
**Next:** [Which skills/agents should run next]
**VS Code Commands:** [If needed, precise commands for Robin]
```

### Integration Examples

**All OK:**
```
Context: Docker stack healthy, all 4 core services running.
Next: CI/CD & Quality Gates (Skill 2) can start.
```

**Partially degraded:**
```
Context: PostgreSQL healthy, but server restart count: 3.
Next:
1. @server-debug should analyze restart reasons
2. Delay CI/CD Skill until server stable

VS Code Command:
@server-debug

**Context:** Docker stack running, but server container has 3 restarts.
All other core services stable.
**Focus:** Server restart causes - crash loops, dependency failures, or config issues.
**Goal:** Identify root cause of repeated server restarts.
**Success Criterion:** Root cause documented with specific error or event that triggers restart.
```

**Monitoring down:**
```
Context: Loki unreachable, monitoring data incomplete.
Next: Run CI/CD Skill without monitoring data. Skip Loki queries.
```

**Test needed:**
```
Context: Infrastructure looks healthy but need to verify test suite passes.
Next: Ask Robin to run /test for comprehensive test analysis.
```

---

## Error Handling

| Situation | Action |
|-----------|--------|
| Docker Engine not reachable | Report "Docker Engine not accessible", skip all Docker checks |
| Single container down | Mark CRITICAL, continue with remaining checks |
| Monitoring not started | Mark INFO ("Monitoring profile not active"), skip monitoring section |
| Network timeout on endpoints | After 5s timeout mark as FAIL |

---

## Trigger Phrases

- "System status" / "Health check" / "Infrastructure check"
- "Docker status" / "Is everything running?"
- Session start (always run first)
