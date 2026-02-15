# Skill: Strategic Planning

> **Target:** Claude Desktop (Technical Manager)
> **Tools:** filesystem (read-only), bash (docker, git), web_search, web_fetch
> **Time:** 5-30 minutes (varies by scope)
> **Output:** `reports/strategic/plan-[topic]-YYYY-MM-DD.md`
>
> IST/SOLL analysis, gap identification, roadmap creation.
> Answers: "What needs to happen to get from here to there?"
> Output is a PLAN, never implementation.

---

## Phase 1: Data Collection

### 1.1 Capture Robin's Idea

Questions to clarify:
- What is the goal? (Feature, architecture change, optimization, new tool?)
- Which scope? (Single layer or cross-stack?)
- Which priority? (Immediately, next week, backlog?)
- Extension of existing or something entirely new?
- Constraints? (Budget, hardware, dependencies?)

#### Scope Classification

| Scope | Example | Affected Layers |
|-------|---------|----------------|
| Micro | New sensor type | ESP32 + Server |
| Feature | Extend zone management | Server + Frontend |
| Cross-Stack | New communication protocol | ESP32 + Server + Frontend |
| Infrastructure | Extend monitoring | Docker + Config |
| Architecture | Monolith to microservices | Everything |

### 1.2 Research (OPTIONAL)

**When to research:**
- Evaluating new technology (e.g., InfluxDB for timeseries instead of PostgreSQL)
- Best practices for a pattern (e.g., CQRS, Event Sourcing)
- Pricing/limits of a service (e.g., Wokwi budget, cloud hosting)
- Comparing alternatives (e.g., Redis vs. Memcached)

**When NOT to research:**
- Standard feature (CRUD endpoint, new Vue component)
- Extending existing pattern (new sensor type following existing schema)
- Robin already made a clear technology decision

**Research output format:**
```
Technology: [NAME]
Purpose: [WHY]
Pro: [1-3 advantages]
Contra: [1-3 disadvantages]
Fits AutomationOne: [YES/NO/PARTIALLY]
Sources: [LINKS]
```

### 1.3 Capture IST State

**With own tools:**

```bash
# Docker stack
docker ps -a --format "table {{.Names}}\t{{.Status}}"
docker compose config --services

# Git
git branch --show-current
git log --oneline -5

# Available Makefile targets
grep -E '^[a-zA-Z_-]+:' Makefile

# CI workflows
ls .github/workflows/

# Docker Compose services
grep -E '^\s+[a-z_-]+:$' docker-compose.yml
```

**Reference documents to read:**

| Need | Source |
|------|--------|
| Current API structure | `.claude/reference/api/REST_ENDPOINTS.md` |
| MQTT topic schema | `.claude/reference/api/MQTT_TOPICS.md` |
| WebSocket events | `.claude/reference/api/WEBSOCKET_EVENTS.md` |
| Error code ranges | `.claude/reference/errors/ERROR_CODES.md` |
| Data flow patterns | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` |
| System dependencies | `.claude/reference/patterns/ARCHITECTURE_DEPENDENCIES.md` |
| Docker infrastructure | `.claude/reference/infrastructure/DOCKER_REFERENCE.md` |
| Security requirements | `.claude/reference/security/PRODUCTION_CHECKLIST.md` |

**For code-level details (max 3 commands per plan):**

Ask Robin to invoke `/verify-plan` for quick codebase checks, or delegate a specific question:
```
@[agent]

**Context:** Strategic planning needs a specific detail from the codebase.
**Focus:** [Exact area of interest].
**Goal:** Answer: [Exact question, 1 sentence].
**Success Criterion:** Concise factual answer (max 5 lines).
```

Example:
```
@server-dev

**Context:** Planning database migration strategy. Need to understand current state.
**Focus:** Alembic migration history.
**Goal:** How many Alembic migrations exist? What are the last 3 revisions?
**Success Criterion:** Table with revision ID, date, and description.
```

---

## Phase 2: Verification

### SOLL State Definition

```markdown
## Target State: [Feature Name]

### End Result
[Concrete description of what should exist when done]

### New Components
| Component | Layer | Type | Purpose |
|-----------|-------|------|---------|
| [Name] | [ESP32/Server/Frontend/Docker] | [Service/Handler/Component/Container] | [Purpose] |

### Modified Existing Components
| Component | Layer | Change |
|-----------|-------|--------|
| [Name] | [Layer] | [What changes] |

### New Dependencies
| Dependency | Version | Reason |
|-----------|---------|--------|
| [Package] | [Version] | [Why needed] |
```

### IST vs. SOLL Cross-Check

| Area | IST | SOLL | Gap | Effort |
|------|-----|------|-----|--------|
| Docker services | 9 containers | [X] containers | [Diff] | [Effort] |
| CI workflows | 7 workflows | [X] workflows | [Diff] | [Effort] |
| API endpoints | ~170 endpoints | [X] endpoints | [New] | [Effort] |
| MQTT topics | [Current] | [New count] | [New topics] | [Effort] |

### Gap Plausibility

For each identified gap verify:
- Is the IST state correct? (Fresh data, not from stale docs)
- Is the SOLL state realistic? (Fits existing architecture principle?)
- Were cross-layer effects considered? (ESP32 <-> Server <-> Frontend)

### Dependency Graph

```
Gap A (New DB table)
  +-- Gap B (New API endpoint) depends on A
      +-- Gap C (New frontend view) depends on B
```

---

## Phase 3: Analysis

### Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Breaking change in API | [H/M/L] | [H/M/L] | [Strategy] |
| Performance degradation | [H/M/L] | [H/M/L] | [Strategy] |
| ESP32 memory overflow | [H/M/L] | [H/M/L] | [Strategy] |
| Migration rollback needed | [H/M/L] | [H/M/L] | [Strategy] |

### Prioritization

**Implementation order rules:**
1. Backend before frontend
2. Database before API
3. API before UI
4. Checkpoints after each phase (back to test flow)
5. One agent per task (no parallel development)
6. Robin decides (plan is a proposal)

---

## Phase 4: Output & Integration

### Report Path

`.technical-manager/reports/strategic/plan-[topic]-YYYY-MM-DD.md`

### Report Structure

```markdown
# Strategic Plan: [Topic]

**Generated:** [TIMESTAMP]
**Initiator:** Robin
**Scope:** [Micro / Feature / Cross-Stack / Infrastructure / Architecture]
**Priority:** [Immediately / Next Week / Backlog]

## 1. Goal

[Robin's vision in 2-3 sentences]

## 2. Research (if conducted)

[Compact summary]

## 3. IST State

[Current system components affected]

## 4. SOLL State

[Concrete target picture]

## 5. Gap Analysis

| Area | IST | SOLL | Gap | Effort |
|------|-----|------|-----|--------|
| ... | ... | ... | ... | ... |

### Dependencies
[Which gaps depend on each other]

### Risks
[Identified risks with mitigation]

## 6. Roadmap

### Phase 1: [Name] (~X hours)
**Goal:** [What is achieved at end of this phase]
**Agents:** [Which VS Code agents needed]

| Step | Agent | Task | Success Criterion |
|------|-------|------|-------------------|
| 1.1 | @server-dev | [Task] | [Verifiable] |
| 1.2 | @esp32-dev | [Task] | [Verifiable] |

**Checkpoint:** [How to verify Phase 1]

### Phase 2: [Name] (~X hours)
[...]

## 7. Next Steps

1. Robin approves the plan (or modifies it)
2. VS Code Agent commands are formulated
3. First phase starts

## Integration

**Context:** [What this plan means for the project]
**Next:** [First steps after approval]
**VS Code Commands:** [Prepared commands for Phase 1]

---
*Plan is a proposal. Robin decides on implementation.*
```

### Integration Examples

**Small feature:**
```
Context: New sensor type DS18B20-waterproof. Fits existing pattern. No cross-stack impact.
Next:
1. Ask Robin to run /verify-plan to confirm pattern exists
2. Delegate to @esp32-dev and @server-dev

VS Code Commands:
@esp32-dev

**Context:** Adding new sensor type DS18B20-waterproof. This is a variant of the
existing DS18B20 pattern - same OneWire protocol, same data format.
**Focus:** ESP32 sensor registration and measurement logic for the new variant.
**Goal:** Add DS18B20_WATERPROOF as recognized sensor type following existing pattern.
**Success Criterion:** New sensor type builds successfully and appears in heartbeat.
```

**Large architecture change:**
```
Context: InfluxDB for timeseries data instead of PostgreSQL. Massive cross-stack impact. 3 phases needed.
Next:
1. Ask Robin to run /verify-plan with the plan details
2. Proof-of-concept phase first (server + Docker only)
3. Migration strategy before implementation
4. No big-bang deployment

VS Code Commands:
@server-dev

**Context:** Evaluating InfluxDB for timeseries data alongside PostgreSQL.
Need to understand current sensor data storage patterns and API impact.
**Focus:** Database layer - sensor data tables, query patterns, API endpoints that read sensor data.
**Goal:** Evaluate feasibility of InfluxDB coexistence with PostgreSQL.
**Success Criterion:** Clear assessment of which tables could migrate, API impact, and effort estimate.
```

---

## Rules

1. Research is OPTIONAL - only for genuine knowledge gaps
2. IST state comes primarily from own tools and existing reference docs
3. Code details only via VS Code Agent command (max 3 per plan)
4. Output is a PLAN, never implementation
5. Robin decides at the end whether and how to implement
6. Respect architecture principle: server-centric, ESP32 = dumb agents
7. Extend patterns, don't reinvent

---

## Trigger Phrases

- "I have an idea..." / "I want to add/change/build X"
- "How can we implement Y?"
- "IST/SOLL analysis for Z"
- "Strategic plan" / "Evaluate technology"
- Before major architecture changes
