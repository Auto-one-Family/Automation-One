# Skill: CI/CD & Quality Gates

> **Target:** Claude Desktop (Technical Manager)
> **Tools:** filesystem (read-only), bash (git, curl), web_fetch (GitHub API)
> **Time:** ~90 seconds
> **Output:** `reports/ci-quality/ci-quality-YYYY-MM-DD-HHMM.md`
> **Prerequisite:** Infrastructure Status skill confirmed core services running
>
> GitHub Actions + API Probing + Wokwi CI + Test Status.
> Answers: "Is CI green? Do APIs respond correctly? What's open?"
> Delegates: Browser/UI testing to VS Code `@frontend-dev`

---

## Phase 1: Data Collection

### 1.1 GitHub Actions Workflows

```bash
# Workflow files
ls -la .github/workflows/

# Last CI runs (requires gh CLI, authenticated)
gh run list --limit 5 --json name,status,conclusion,createdAt 2>/dev/null

# Per-workflow status
gh run list --workflow server-tests.yml --limit 1 --json status,conclusion 2>/dev/null
gh run list --workflow esp32-tests.yml --limit 1 --json status,conclusion 2>/dev/null
gh run list --workflow wokwi-tests.yml --limit 1 --json status,conclusion 2>/dev/null
gh run list --workflow frontend-tests.yml --limit 1 --json status,conclusion 2>/dev/null
gh run list --workflow pr-checks.yml --limit 1 --json status,conclusion 2>/dev/null
gh run list --workflow security-scan.yml --limit 1 --json status,conclusion 2>/dev/null
```

#### Known Workflows

| Workflow | File | Tests |
|----------|------|-------|
| Server Tests | `server-tests.yml` | Backend pytest (unit + integration) |
| ESP32 Tests | `esp32-tests.yml` | PlatformIO build + Wokwi simulation |
| Backend E2E | `backend-e2e-tests.yml` | Full-stack backend E2E |
| Frontend Tests | `frontend-tests.yml` | Vitest + Playwright |
| Wokwi Tests | `wokwi-tests.yml` | ESP32 Wokwi scenarios |
| PR Checks | `pr-checks.yml` | PR quality gate |
| Security Scan | `security-scan.yml` | Dependency security |

### 1.2 Wokwi CI Integration

**Facts (verified):**
- 163 active YAML scenarios across 13 categories
- Hobby plan: 200 minutes/month
- Scenarios use `set-control` YAML steps (not external mosquitto_pub)

```bash
# Last Wokwi CI run
gh run list --workflow wokwi-tests.yml --limit 3 --json status,conclusion,createdAt 2>/dev/null
```

### 1.3 Service API Probing

**REST API (El Servador :8000):**

```bash
# Health (no auth needed)
curl -s http://localhost:8000/api/v1/health | jq '.status'

# Auth status (no auth)
curl -s http://localhost:8000/api/v1/auth/status | jq

# Swagger UI reachable?
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/v1/docs

# Response time
curl -s -o /dev/null -w "%{time_total}" http://localhost:8000/api/v1/health

# Detailed health + error codes (needs auth token)
# curl -s http://localhost:8000/api/v1/health/detailed -H "Authorization: Bearer $TOKEN" | jq
```

**Reference:** `.claude/reference/api/REST_ENDPOINTS.md` Section 0 (Quick-Lookup)

**MQTT Broker (:1883 / :9001):**

```bash
# MQTT TCP check (via container)
docker exec automationone-mqtt mosquitto_sub -t '$SYS/broker/clients/connected' -C 1 -W 3 2>/dev/null

# MQTT WebSocket check
curl -s -o /dev/null -w "%{http_code}" http://localhost:9001 2>/dev/null || echo "WS port check failed"
```

**Reference:** `.claude/reference/api/MQTT_TOPICS.md`

**PostgreSQL:**

```bash
docker exec automationone-postgres pg_isready -U god_kaiser 2>/dev/null
docker exec automationone-server alembic current 2>/dev/null
```

### 1.4 Pull Requests & Issues

```bash
# Open PRs
gh pr list --state open --json number,title,author,mergeable,reviewDecision 2>/dev/null

# Open issues by label
gh issue list --state open --label bug --json number,title,createdAt 2>/dev/null
gh issue list --state open --label feature --json number,title,createdAt 2>/dev/null

# All open issues (for staleness check)
gh issue list --state open --json number,title,updatedAt 2>/dev/null
```

### 1.5 Security

```bash
# Dependabot alerts
gh api repos/:owner/:repo/dependabot/alerts --jq '.[].security_advisory.summary' 2>/dev/null

# Secret scanning
gh api repos/:owner/:repo/secret-scanning/alerts --jq '.[].state' 2>/dev/null
```

**Known dev-only warnings (NOT errors):**
- MQTT `allow_anonymous true` (development config)
- JWT secret placeholder in `.env.example`
- pgAdmin default credentials

**Reference:** `.claude/reference/security/PRODUCTION_CHECKLIST.md`

### 1.6 Browser Testing (DELEGATED)

**TM checks only:**
- Does `playwright.config.ts` exist? (yes/no)
- Does `.github/workflows/playwright-tests.yml` exist? (yes/no)
- Last Playwright CI run: status?

**TM does NOT run Playwright directly.**

**Exception - Smoke test (max 1 minute):**
- Open http://localhost:5173 in browser
- Does the page load? Console errors?
- Nothing more.

**When detailed UI tests are needed:**
Ask Robin to invoke `/test` which activates test-log-analyst. It outputs the test commands,
Robin runs them, and the agent analyzes the results.

For Playwright-specific issues requiring frontend code context:
```
@frontend-debug

**Context:** Playwright CI shows failures. Test-log-analyst identified failing test names.
**Focus:** Frontend rendering or interaction issues causing test failures.
**Goal:** Identify root cause of UI test failures.
**Success Criterion:** Specific component or logic error identified.
```

---

## Phase 2: Verification

### CI Plausibility

| Check | Expected | Problem if |
|-------|----------|-----------|
| Last CI run age | < 24h | > 1 week = stale branch |
| All workflows have runs | Each triggered at least once | New workflow never triggered |
| Server tests green | Backend stable | Red = regression |

### API Cross-Checks

| Check A | Check B | Contradiction if |
|---------|---------|-----------------|
| `/health` says "healthy" | `/health/detailed` shows DB disconnect | Health endpoint too simple |
| `/auth/status` reachable | Login fails | Auth service broken |
| Swagger UI (200) | Endpoints return 500 | Server starts but routers missing |
| MQTT broker connected | Server health shows MQTT disconnect | Server MQTT client problem |

### Error Code Validation

Known ranges (from `.claude/reference/errors/ERROR_CODES.md`):
- ESP32: 1000-4999
- Server: 5000-5999

If API returns 500 with error code outside these ranges: unknown error, escalate.

### On Doubt

Ask Robin to run `/verify-plan` for codebase reality checks, or delegate to the appropriate debug agent:
```
@server-debug

**Context:** CI quality check shows /api/v1/health/live returns 404, but health endpoint
should exist according to reference docs.
**Focus:** Server routing and health endpoint registration.
**Goal:** Verify whether health endpoint exists and is correctly registered.
**Success Criterion:** Confirmation of endpoint status with explanation.
```

---

## Phase 3: Analysis

### CI Assessment

| Status | Meaning | Action |
|--------|---------|--------|
| All green | CI healthy | Proceed to next skill |
| 1 workflow red | Regression found | Analyze which step failed |
| Multiple red | Systemic problem | Check infrastructure, return to Skill 1 |
| All pending | CI running | Wait or check later |

### API Health Assessment

| Endpoint | Expected | On failure |
|----------|----------|-----------|
| `/health` | 200 | CRITICAL - server not ready |
| `/auth/status` | 200 | HIGH - auth broken |
| `/docs` | 200 | MEDIUM - docs unreachable |
| MQTT broker | connected | CRITICAL - IoT communication broken |
| PostgreSQL | ready | CRITICAL - data persistence gone |

---

## Phase 4: Output & Integration

### Report Path

`.technical-manager/reports/ci-quality/ci-quality-YYYY-MM-DD-HHMM.md`

### Report Structure

```markdown
# CI/CD & Quality Gates Report

**Generated:** [TIMESTAMP]
**Branch:** [BRANCH]
**CI Health:** [GREEN / YELLOW / RED]
**API Health:** [ALL OK / DEGRADED / DOWN]

## GitHub Actions

| Workflow | Last Run | Conclusion | Date |
|----------|----------|------------|------|
| server-tests | [STATUS] | [success/failure] | [DATE] |
| esp32-tests | ... | ... | ... |
| wokwi-tests | ... | ... | ... |
| frontend-tests | ... | ... | ... |
| pr-checks | ... | ... | ... |
| security-scan | ... | ... | ... |

## Wokwi CI
- Scenarios: 163 active
- Last run: [STATUS]
- Budget: [USED] / 200 min (Hobby)

## API Probing

| Endpoint | Expected | Actual | Response Time | Status |
|----------|----------|--------|---------------|--------|
| /api/v1/health | 200 | [CODE] | [TIME]ms | [OK/FAIL] |
| MQTT TCP (1883) | connected | [STATUS] | - | [OK/FAIL] |
| PostgreSQL | accepting | [STATUS] | - | [OK/FAIL] |

## PRs & Issues

| Type | Count | Details |
|------|-------|---------|
| Open PRs | [N] | [summary] |
| Open bugs | [N] | [summary] |
| Security alerts | [N] | [summary] |

## Browser Tests (Delegated)
- Playwright config: [EXISTS/MISSING]
- Playwright CI: [LAST_STATUS]
- Smoke test: [PASS/SKIP/FAIL]

## Verification Results

| Cross-Check | Result | Note |
|-------------|--------|------|
| ... | PASS/FAIL | ... |

## Issues Detected

| Priority | Issue | Area | Action |
|----------|-------|------|--------|
| ... | ... | ... | ... |

## Integration

**Context:** [What this means for the system]
**Next:** [Which skills/agents should run next]
**VS Code Commands:** [If needed, precise commands for Robin]
```

### Integration Examples

**All green:**
```
Context: CI green, all APIs respond correctly, no security alerts.
Next: System ready for development. Strategic Planning if needed.
```

**CI red, API OK:**
```
Context: Server tests failed (step: pytest unit), but APIs respond correctly.
Likely: new code not yet deployed.
Next:
1. Ask Robin to run /test for detailed failure analysis
2. If regression: check last commit via /git-health

VS Code Command:
@server-debug

**Context:** CI server-tests.yml shows failure. APIs respond correctly locally,
so likely a test-specific issue rather than runtime bug.
**Focus:** Failed test identification and root cause.
**Goal:** Determine if this is a real regression, flaky test, or CI environment issue.
**Success Criterion:** Specific test name and failure reason identified.
```

**API degraded:**
```
Context: /health returns 200, but /health/detailed shows MQTT disconnect.
Server runs but IoT communication broken.
Next:
1. Check MQTT broker status (back to Infrastructure Skill)
2. @mqtt-debug should analyze broker connection

VS Code Command:
@mqtt-debug

**Context:** Server health endpoint shows MQTT disconnect. Broker container is running
according to Docker status. Server is up and responsive on REST API.
**Focus:** MQTT connection between server and broker - why is it disconnected?
**Goal:** Identify root cause of MQTT disconnect.
**Success Criterion:** Connection failure reason found with specific error or configuration issue.
```

---

## Error Handling

| Situation | Action |
|-----------|--------|
| gh CLI not installed/authenticated | Skip GitHub checks, note to check manually via web |
| API not reachable | Mark CRITICAL, refer back to Infrastructure Skill |
| Auth token not available | Only check unauthenticated endpoints (/health, /auth/status, /docs) |
| GitHub API rate limiting | Wait or check later |
| MQTT container not reachable | Mark CRITICAL |

---

## Trigger Phrases

- "CI status" / "Are tests green?"
- "API check" / "Quality gates"
- "What's open?" (PRs/Issues)
- "Security check"
- After Infrastructure Skill (typical sequence)
