# AutomationOne — Debug Workflow

> First stop for every debug session. Follow the Quick-Start, then dive into the
> scenario that matches your symptom.

---

## Quick-Start (60 seconds)

```
1.  powershell.exe -File scripts/debug/debug-status.ps1   # System health JSON (all services)
2.  make loki-errors                         # What just happened? (last 5 min)
3.  Open Grafana Debug Console               # http://localhost:3000/d/debug-console
4.  Check Error Rate (stat panel)            # Green = OK, Yellow = look, Red = act
5.  Read Error Log Stream (panel 4)          # Newest errors at the top
6.  Filter by service if needed              # Use the "Service" dropdown
```

If errors point to a specific service, jump to the matching scenario below.
If no errors but something is still wrong, start with S1 (Data Not Arriving).

**Agent-based alternative:** Use `/ops-diagnose` in Claude Code for automated full-stack diagnosis (runs debug-status.ps1 + Loki queries + health checks, writes report to `.claude/reports/current/OPS_DIAGNOSIS.md`).

---

## Decision Matrix: Which Tool to Use?

| Symptom | First Tool | Why |
|---------|-----------|-----|
| Quick system overview | `debug-status.ps1` | JSON with overall status, services, issues |
| Errors in logs | `make loki-errors` | Loki aggregates all services, fastest overview |
| Service degraded | Grafana Debug Console | Visual error rate + service distribution |
| Specific ESP issue | `make loki-esp ESP=<id>` | Cross-service logs for one device |
| Data flow broken | `make loki-trace CID=<id>` | End-to-end correlation trace |
| Container down | `docker compose ps` | Loki only sees running containers |
| Loki itself broken | `make loki-health` | Checks Loki API + active streams |
| Metrics missing | Grafana system-health | Prometheus, not Loki |
| Build/compile error | Terminal output | Not a runtime issue |
| Full automated diagnosis | `/ops-diagnose` | Claude Code auto-ops agent, writes report |
| Backend cross-layer | `/ops-inspect-backend` | ESP → MQTT → Server → DB trace |
| Frontend cross-layer | `/ops-inspect-frontend` | Browser → Vue → API → Server → DB trace |

### Loki vs. Prometheus vs. Docker Logs

| Category | Loki | Prometheus | Docker Logs |
|----------|------|-----------|-------------|
| **What** | Log text (structured) | Numeric metrics (time series) | Raw container stdout/stderr |
| **When** | Error details, traces, patterns | Trends, thresholds, SLAs | Loki unavailable, quick check |
| **Query** | LogQL via API/Grafana | PromQL via API/Grafana | `docker compose logs <svc>` |
| **Retention** | 7 days | 15 days | Until container restart |
| **Structured** | Labels + Structured Metadata | Labels + values | Plain text |
| **Best for** | "Why did it fail?" | "How often does it fail?" | "Is the container running?" |

---

## Scenario S1: Sensor Data Not Arriving at Frontend

**Symptom:** Dashboard shows stale or missing sensor values. No live updates.

### Debug Path

```
Step 1: Which layer is broken?
  make loki-errors                      → Errors in which service?

Step 2: Check data source (ESP)
  make loki-esp ESP=<device_id>         → Is ESP sending data?
  LogQL: {compose_service="esp32-serial-logger"} |= "<device_id>"

Step 3: Check MQTT transport
  LogQL: {compose_service="mqtt-broker"} |~ "(?i)(disconnect|error)"
  Docker: docker compose logs mqtt-broker --tail=20

Step 4: Check server processing
  LogQL: {compose_service="el-servador"} |= "sensor" | level=~"ERROR|WARNING"

Step 5: Check frontend delivery
  LogQL: {compose_service=~"el-servador|el-frontend"} |~ "(?i)(websocket|ws_)"
```

### Root-Cause Matrix

| Layer | Symptom in Loki | Root Cause | Fix |
|-------|-----------------|------------|-----|
| ESP | No logs from device | ESP offline, boot loop, WiFi lost | Check serial output, restart ESP |
| MQTT | Disconnect events | Broker overloaded, auth failure | Check broker logs, verify credentials |
| Server | Handler ERROR logs | Schema mismatch, DB full, handler crash | Read error message, check DB space |
| Frontend | No WS events | WebSocket disconnected, store not reactive | Check WS connection in browser devtools |

---

## Scenario S2: ESP Goes Offline

**Symptom:** Dashboard shows ESP as offline. Heartbeat missing.

### Debug Path

```
Step 1: Check heartbeat gap
  LogQL: {compose_service="el-servador"} |= "<device_id>" |= "heartbeat"

Step 2: Check MQTT LWT
  LogQL: {compose_service="mqtt-broker"} |= "<device_id>" |~ "(?i)(disconnect|lwt)"

Step 3: Check ESP serial output
  LogQL: {compose_service="esp32-serial-logger"} |= "<device_id>" |~ "(?i)(boot|crash|watchdog)"

Step 4: Check server heartbeat handler
  LogQL: {compose_service="el-servador"} | logger=~".*heartbeat.*" | level="ERROR"
```

### Root-Cause Matrix

| Symptom | Root Cause | Fix |
|---------|------------|-----|
| No heartbeat logs at all | ESP not sending, WiFi lost | Physical access: check power, serial output |
| MQTT disconnect event | Network issue, broker restart | Check broker uptime, network connectivity |
| Watchdog reset in serial | Task blocked, infinite loop | Check ESP firmware, stack traces |
| Server heartbeat handler error | DB write failure, timeout | Check DB connectivity, server logs |

---

## Scenario S3: MQTT Connection Problems

**Symptom:** Devices disconnecting, messages not delivered, auth failures.

### Debug Path

```
Step 1: Overview
  LogQL: {compose_service="mqtt-broker"} |~ "(?i)(error|disconnect|denied|refused)"

Step 2: Check specific device
  LogQL: {compose_service="mqtt-broker"} |= "<device_id>"

Step 3: Check server MQTT client
  LogQL: {compose_service="el-servador"} | logger=~".*mqtt.*" | level=~"ERROR|WARNING"

Step 4: Broker health
  docker compose logs mqtt-broker --tail=50
  docker compose exec mqtt-broker mosquitto_sub -t '$SYS/broker/clients/connected' -C 1
```

### Root-Cause Matrix

| Log Pattern | Root Cause | Fix |
|-------------|------------|-----|
| "Connection refused" | Broker not running | `docker compose up -d mqtt-broker` |
| "not authorised" / "denied" | Wrong credentials | Verify ESP credentials vs `mosquitto_passwd` |
| Multiple rapid disconnects | Network instability, broker OOM | Check broker memory, network stability |
| "Socket error" | Client crash, malformed packet | Check ESP firmware version, MQTT payload size |

---

## Scenario S4: Server Returns HTTP 500

**Symptom:** API calls fail with 500 Internal Server Error.

### Debug Path

```
Step 1: Find the error
  LogQL: {compose_service="el-servador"} | level="ERROR"

Step 2: Get traceback
  LogQL: {compose_service="el-servador"} |= "Traceback" or |= "Exception"
  (Alloy multiline stage aggregates Python tracebacks into single entries)

Step 3: Check handler
  LogQL: {compose_service="el-servador"} | logger=~".*handler.*" | level="ERROR"

Step 4: Check DB connectivity
  LogQL: {compose_service="el-servador"} |~ "(?i)(database|connection refused|deadlock)"
```

### Root-Cause Matrix

| Error Pattern | Root Cause | Fix |
|---------------|------------|-----|
| "ConnectionRefusedError" | DB or MQTT not reachable | Check `docker compose ps`, restart service |
| "IntegrityError" / "UniqueViolation" | Duplicate data, schema constraint | Check data flow, migration state |
| "TimeoutError" | DB slow query, network latency | Check DB load, query optimization |
| "ValidationError" | Invalid payload from ESP | Check MQTT payload format, ESP firmware |
| "KeyError" / "AttributeError" | Code bug, missing field | Read traceback, fix handler code |

---

## Scenario S5: Database Issues

**Symptom:** Data not persisting, API errors, slow queries.

### Debug Path

```
Step 1: Check server DB errors
  LogQL: {compose_service=~"el-servador|postgres"} |~ "(?i)(database|postgres|sql|deadlock|constraint)"

Step 2: Check PostgreSQL logs
  LogQL: {compose_service="postgres"} | level=~"ERROR|FATAL"

Step 3: Check DB connectivity
  docker compose exec postgres pg_isready

Step 4: Check disk space
  docker compose exec postgres df -h /var/lib/postgresql/data
```

### Root-Cause Matrix

| Error Pattern | Root Cause | Fix |
|---------------|------------|-----|
| "connection refused" | Postgres not running | `docker compose up -d postgres` |
| "FATAL: too many connections" | Connection pool exhausted | Restart server, check pool settings |
| "deadlock detected" | Concurrent writes conflict | Check transaction isolation, retry logic |
| "disk full" | Data volume exhausted | Clean old data, expand volume |
| "relation does not exist" | Missing migration | Run `alembic upgrade head` |

---

## Scenario S6: Frontend Build/Runtime Error

**Symptom:** Dashboard won't load, white screen, TypeScript errors.

### Debug Path

```
Step 1: Check frontend container
  docker compose logs el-frontend --tail=30

Step 2: Check frontend logs in Loki
  LogQL: {compose_service="el-frontend"} | level=~"ERROR|WARNING"

Step 3: Check component errors
  LogQL: {compose_service="el-frontend"} | component="<ComponentName>"

Step 4: Check API connectivity
  LogQL: {compose_service="el-frontend"} |~ "(?i)(api|fetch|401|403|500)"
```

### Root-Cause Matrix

| Error Pattern | Root Cause | Fix |
|---------------|------------|-----|
| TS2xxx in build output | TypeScript type error | Fix type definition, check imports |
| "Module not found" | Missing dependency | `npm install` in El Frontend |
| "401 Unauthorized" | Auth token expired/invalid | Check auth flow, token refresh |
| "WebSocket is not connected" | Server WS endpoint down | Check server, network, CORS |
| "Cannot read property of undefined" | Null reference in component | Check data loading, add null guards |

---

## Scenario S7: Alerts Firing

**Symptom:** Grafana alert notification fires. Need to investigate root cause.

### Debug Path

```
Step 1: Identify which alert
  Grafana → Alerting → Alert rules → Find firing rule

Step 2: Check alert query
  Copy the LogQL/PromQL query from the alert rule → run in Grafana Explore

Step 3: Dig deeper based on alert type
  Loki alerts (source: loki):
    - Error Storm         → S4 (Server 500)
    - ESP Disconnect Wave → S2 (ESP Offline) + S3 (MQTT)
    - DB Connection Error → S5 (Database)
    - ESP Boot Loop       → S2 (ESP Offline)
    - Critical Error Burst→ make loki-errors, then check worst service

  Prometheus alerts (source: prometheus):
    - High error rate     → S4
    - High response time  → S5 (DB slow) or S4 (handler slow)
    - ESP heartbeat gap   → S2
    - Container unhealthy → docker compose ps
```

### Root-Cause Matrix

| Alert | Most Likely Root Cause | First Step |
|-------|----------------------|------------|
| Error Storm | Cascading handler failure | `make loki-errors`, find repeating pattern |
| ESP Disconnect Wave | Network/broker issue | Check broker, then network |
| DB Connection Error | Postgres down or overloaded | `docker compose ps postgres` |
| ESP Boot Loop | Bad firmware, power issue | `make loki-esp ESP=<id>` |
| Critical Error Burst | Multiple system failures | Triage: which services are affected |

---

## Scenario S8: WebSocket Disconnections

**Symptom:** Frontend loses live updates, "Disconnected" banner, stale data.

### Debug Path

```
Step 1: Check WebSocket events (both sides)
  LogQL: {compose_service=~"el-servador|el-frontend"} |~ "(?i)(websocket|ws_|disconnect|reconnect)"

Step 2: Check server WS manager
  LogQL: {compose_service="el-servador"} | logger=~".*websocket.*"

Step 3: Check if server is broadcasting
  LogQL: {compose_service="el-servador"} |= "broadcast"

Step 4: Check frontend store
  Browser DevTools → Network → WS tab → check frame flow
```

### Root-Cause Matrix

| Symptom | Root Cause | Fix |
|---------|------------|-----|
| WS connects then immediately drops | Auth failure on WS | Check token validity, server CORS |
| WS connected but no data | Server not broadcasting | Check MQTT→WS bridge in server |
| Periodic disconnects (every N min) | Nginx/proxy timeout | Increase proxy timeout, add ping/pong |
| Frontend shows "Disconnected" | Server crash/restart | Check `docker compose ps el-servador` |

---

## Scenario S9: Slow Response Times

**Symptom:** API calls take too long, dashboard loading slowly.

### Debug Path

```
Step 1: Check for errors first
  make loki-errors                       → Errors often cause slowness

Step 2: Check Prometheus metrics
  Grafana → system-health dashboard → Response time panels

Step 3: Check DB slow queries
  LogQL: {compose_service="el-servador"} |~ "(?i)(slow|timeout|deadlock)"
  LogQL: {compose_service="postgres"} |~ "(?i)(slow|duration)"

Step 4: Check resource usage
  Grafana → system-health → Container CPU/Memory panels
  docker stats --no-stream
```

### Root-Cause Matrix

| Symptom | Root Cause | Fix |
|---------|------------|-----|
| All endpoints slow | DB overloaded | Check DB connections, run VACUUM |
| One endpoint slow | Missing index, N+1 query | Profile query, add index |
| Periodic spikes | Cron job / scheduled task | Check scheduler, stagger tasks |
| Gradual degradation | Memory leak, growing data | Restart container, check cleanup jobs |

---

## Scenario S10: Complete System Down

**Symptom:** Nothing works. Dashboard blank, API unreachable.

### Debug Path

```
Step 1: Are containers running?
  docker compose ps                      → Check all services

Step 2: Is Docker itself healthy?
  docker info                            → Docker daemon status

Step 3: Check system resources
  docker stats --no-stream               → CPU, memory per container

Step 4: Can Loki tell us what happened?
  make loki-health                       → Is Loki reachable?
  make loki-errors                       → Last errors before crash

Step 5: Restart in order
  docker compose up -d postgres          → DB first
  docker compose up -d mqtt-broker       → Then MQTT
  docker compose up -d el-servador       → Then server
  docker compose up -d el-frontend       → Then frontend
  docker compose --profile monitoring up -d  → Then monitoring
```

### Root-Cause Matrix

| Symptom | Root Cause | Fix |
|---------|------------|-----|
| All containers "Exited" | Docker daemon restart, OOM | `docker compose up -d`, check host resources |
| Postgres won't start | Data corruption, disk full | Check postgres logs, disk space |
| Server starts but crashes | Missing env vars, DB not ready | Check docker-compose.yml, wait for postgres |
| Monitoring won't start | Volume permissions | Check volume ownership, recreate volumes |

---

## CLI Debug Commands Reference

| Command | What It Does | When to Use |
|---------|-------------|-------------|
| `powershell.exe -File scripts/debug/debug-status.ps1` | System health JSON (overall, services, issues) | Very first step — before Loki |
| `make loki-errors` | Last 5 min errors from Loki | First Loki query in every debug session |
| `make loki-trace CID=<id>` | Cross-service correlation trace | Following a specific data flow |
| `make loki-esp ESP=<id>` | All logs for one ESP device | ESP-specific debugging |
| `make loki-health` | Loki API status + stream count | Verifying monitoring stack health |
| `make monitor-status` | Monitoring stack container status | Checking if monitoring services run |

## Claude Code Agent Commands (auto-ops Plugin)

| Command | What It Does | When to Use |
|---------|-------------|-------------|
| `/ops-diagnose` | Full-stack health check (Loki-first, all layers) | Automated diagnosis, writes `OPS_DIAGNOSIS.md` |
| `/ops-inspect-backend` | Cross-layer: ESP → MQTT → Server → DB | Backend data flow issue |
| `/ops-inspect-frontend` | Cross-layer: Browser → Vue → API → Server → DB | Frontend display issue (uses Playwright) |
| `/ops-drive` | Navigate UI via Playwright, take screenshots | Generate traffic, document UI state |
| `/ops-cleanup` | DB + Docker cleanup with safety checks | Stale data, disk space issues |
| `/ops` | General auto-ops agent (diagnose/fix/flash/status) | Any operations task |

## Agent-Based Debug Workflow (Claude Code)

For deeper analysis beyond manual Loki queries, the auto-ops plugin provides specialized debug agents:

```
Manual Quick-Start (above)
  └─ Issue identified? → Choose agent path:

Backend issue (data flow):     /ops-inspect-backend
  → Backend Inspector: ESP → MQTT → Server → DB
  → Uses Loki-first, DB queries, cross-layer correlation
  → Output: .claude/reports/current/BACKEND_INSPECTION.md

Frontend issue (UI/display):   /ops-inspect-frontend
  → Frontend Inspector: Browser → Vue → API → Server → DB
  → Uses Playwright MCP for real browser access (no blind spots)
  → Output: .claude/reports/current/FRONTEND_INSPECTION.md

Full system diagnosis:         /ops-diagnose
  → auto-ops agent: debug-status.ps1 + Loki + health endpoints
  → Output: .claude/reports/current/OPS_DIAGNOSIS.md

After all debug agents run:    meta-analyst
  → Cross-report correlation, contradiction detection
  → Output: .claude/reports/current/META_ANALYSIS.md
```

Scenario-to-agent mapping:

| Scenario | Recommended Agent |
|----------|------------------|
| S1 (Data not arriving) | `/ops-inspect-backend` |
| S2 (ESP offline) | `/ops-inspect-backend` |
| S3 (MQTT problems) | `/ops-inspect-backend` |
| S4 (Server 500) | `/ops-inspect-backend` |
| S5 (Database issues) | `/ops-inspect-backend` |
| S6 (Frontend errors) | `/ops-inspect-frontend` |
| S8 (WebSocket) | `/ops-inspect-frontend` + `/ops-inspect-backend` |
| S10 (System down) | `/ops-diagnose` |

---

## Grafana Dashboards

| Dashboard | URL | Purpose |
|-----------|-----|---------|
| Debug Console | `/d/debug-console` | Error rates, log streams, correlation tracing |
| System Health | `/d/system-health` | Metrics: CPU, memory, response times, ESP status |
| Alerting | `/alerting/list` | 33 Prometheus + 6 Loki alert rules (39 total, 34 active in Grafana) |

---

## Frontend Logs: Where They Land

Frontend logging has multiple paths depending on log type and environment:

| Log Type | Where Visible | How to Access |
|----------|--------------|---------------|
| Vue Runtime Errors | Server log (via `/api/v1/logs/frontend`) | Loki: `{compose_service="el-servador"} \|= "[FRONTEND]"` |
| Console.log/warn/error | Browser DevTools only | F12 → Console Tab |
| Unhandled Promise Rejections | Server log (via `/api/v1/logs/frontend`) | Loki: `{compose_service="el-servador"} \|= "[FRONTEND]"` |
| Vite Build Errors | Docker stdout | `docker compose logs el-frontend --tail=30` |
| Network Errors (API) | Browser Network Tab + Axios Error Log | F12 → Network Tab |

**Key architecture decision:** Client-side `createLogger()` outputs JSON to the browser console, NOT to Docker stdout. This is by design:
- In production, Nginx serves static files — no Node.js process to capture console output
- In development, the browser console is the correct place for client-side logs
- Critical errors are forwarded to the server via `POST /api/v1/logs/frontend` (rate-limited, sanitized, unauthenticated)
- Vue Error Handler + Window Error Handlers are configured for automatic forwarding

**For agents:** Frontend errors are searchable in Loki under `[FRONTEND]`. Browser console logs are NOT in Loki — use Playwright MCP (`/ops-inspect-frontend`) for browser-level debugging.

---

## Structured Metadata Fields

The Alloy pipeline extracts these fields as structured metadata (queryable with `| field="value"`):

| Service | Field | Example | Description |
|---------|-------|---------|-------------|
| el-servador | `logger` | `src.mqtt.handlers.sensor_handler` | Python module path |
| el-servador | `request_id` | `a1b2c3d4-...` | Request correlation ID |
| el-frontend | `component` | `SensorCard` | Vue component name |
| esp32-serial-logger | `device` | `esp32-xiao-01` | ESP device identifier |
| esp32-serial-logger | `component` | `mqtt` | Firmware component |
| esp32-serial-logger | `error_code` | `3001` | Error code from taxonomy |
| postgres | `query_duration_ms` | `245.123` | Slow query duration (>100ms) |

**Labels** (indexed, fast stream selection):
- `compose_service`: Docker Compose service name
- `level`: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
- `container`, `stream`, `compose_project`: Docker metadata

**PostgreSQL levels:** Alloy maps PG levels to standard: LOG→INFO, WARNING→WARNING, ERROR→ERROR, FATAL/PANIC→CRITICAL
