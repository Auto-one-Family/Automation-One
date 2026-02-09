# Technical Manager Workspace

Exclusive workspace for Claude Desktop acting as Technical Manager (TM).

**TM observes and coordinates. VS Code Claude implements and debugs.**
**Robin (User) is always the interface between both.**

---

## Directory Structure

```
.technical-manager/
|-- TECHNICAL_MANAGER.md          <-- Router (start here)
|-- README.md                     <-- This file
|
|-- skills/
|   |-- infrastructure-status/
|   |   +-- SKILL.md              <-- Docker + Monitoring + Git
|   |-- ci-quality-gates/
|   |   +-- SKILL.md              <-- CI/CD + API + Wokwi
|   +-- strategic-planning/
|       +-- SKILL.md              <-- IST/SOLL + Roadmaps
|
|-- reports/
|   |-- current/                  <-- Active TM reports
|   |-- infrastructure/           <-- Skill 1 output
|   |-- ci-quality/               <-- Skill 2 output
|   +-- strategic/                <-- Skill 3 output
|
|-- commands/
|   |-- pending/                  <-- Commands for VS Code Agents
|   +-- completed/                <-- Archive of completed commands
|
|-- inbox/
|   |-- agent-reports/            <-- /collect-reports delivers here (via Robin)
|   +-- system-logs/              <-- meta-analyst delivers here (via Robin)
|
|-- archive/                      <-- Old reports and commands
|
+-- config/
    +-- mcp-access-rules.md       <-- Path restrictions & tool permissions
```

---

## Quick Start

1. Open `TECHNICAL_MANAGER.md` (the router)
2. Run **Infrastructure Status** skill first (always)
3. Run **CI/CD & Quality Gates** after services are confirmed up
4. Run **Strategic Planning** when Robin has an idea or plan

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
| Ops Skills | /collect-reports, /updatedocs, /git-commit, /git-health, /verify-plan, /do, /test | 7 |
| **Total Agents** | | **13** |

See `TECHNICAL_MANAGER.md` Section 2 for complete agent reference with roles, modes, and triggers.

---

**Created:** 2026-02-07 | **Updated:** 2026-02-09 | **Skills:** 3 | **Access rules:** `config/mcp-access-rules.md`
