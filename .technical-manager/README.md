# Technical Manager Workspace

Exclusive workspace for Claude Desktop acting as Technical Manager (TM).

**TM observes and coordinates. VS Code Claude implements and debugs.**
**Robin (User) is always the interface between both.**

---

## TM Session Start

The TM boots via Claude Desktop Project Custom Instructions (see Section 0 in `TECHNICAL_MANAGER.md`).
The boot sequence reads 5 files automatically and confirms context loading to Robin.

---

## Directory Structure

```
.technical-manager/
|-- TECHNICAL_MANAGER.md          <-- Router (TM reads this FIRST)
|-- README.md                     <-- This file (Robin's guide)
|
|-- skills/                       <-- TM's 3 skills (exact paths!)
|   |-- infrastructure-status/
|   |   +-- SKILL.md              <-- Skill 1: Docker + Monitoring + Git
|   |-- ci-quality-gates/
|   |   +-- SKILL.md              <-- Skill 2: CI/CD + API + Wokwi
|   +-- strategic-planning/
|       +-- SKILL.md              <-- Skill 3: IST/SOLL + Roadmaps
|
|-- reports/
|   |-- current/                  <-- Active TM reports
|   |-- infrastructure/           <-- Skill 1 output
|   |-- ci-quality/               <-- Skill 2 output
|   +-- strategic/                <-- Skill 3 output
|
|-- commands/
|   |-- pending/                  <-- TM writes commands here for VS Code agents
|   +-- completed/                <-- Archive of completed commands
|
|-- inbox/
|   |-- agent-reports/            <-- /collect-reports delivers here (via Robin)
|   +-- system-logs/              <-- meta-analyst delivers here (via Robin)
|
|-- archive/                      <-- Old reports and commands
|
+-- config/
    +-- mcp-access-rules.md       <-- TM's path restrictions & tool permissions
```

---

## Quick Start (for TM)

1. Read `TECHNICAL_MANAGER.md` Section 0 (boot sequence)
2. Read all 5 files listed there
3. Run **Infrastructure Status** skill first (always)
4. Run **CI/CD & Quality Gates** after services are confirmed up
5. Run **Strategic Planning** when Robin has an idea or plan

---

## What TM Does

- System-wide health monitoring (Docker, Git, Services, Monitoring)
- GitHub integration (CI/CD status, Issues, PRs, Security)
- API probing (REST, MQTT, WebSocket endpoint validation)
- Strategic planning (IST/SOLL analysis, roadmaps, research)
- Orchestrates VS Code agent sequences for debugging and development
- Formulates agent commands (Context + Focus + Goal + Success Criterion)

## What TM Does NOT Do

- Write or modify application code (Dev-Agents do that)
- Debug logs directly (Debug-Agents do that)
- Run browser tests directly (delegates to `@frontend-dev`)
- Change Docker configs (Robin does that via Makefile)
- Access source code (`El */src/`)
- Specify file paths or function names in commands (agents find these themselves)

---

## VS Code Agent System

| Category | Agents | Count |
|----------|--------|-------|
| System | system-control, agent-manager | 2 |
| Debug | esp32-debug, server-debug, mqtt-debug, frontend-debug, db-inspector, meta-analyst | 6 |
| Dev | esp32-dev, server-dev, mqtt-dev, frontend-dev | 4 |
| Ops Skills | /collect-reports, /updatedocs, /git-commit, /git-health, /verify-plan, /do, /test, /ki-audit | 8 |
| **Total Agents** | | **13** |

See `TECHNICAL_MANAGER.md` Section 2 for complete agent reference with roles, modes, and triggers.

---

**Created:** 2026-02-07 | **Updated:** 2026-02-10 | **Skills:** 3 | **Access rules:** `config/mcp-access-rules.md`
