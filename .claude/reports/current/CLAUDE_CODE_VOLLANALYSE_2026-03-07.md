# Claude Code Vollanalyse — AutomationOne

> **Erstellt:** 2026-03-07
> **Repo:** auto-one
> **Typ:** Bestandsaufnahme + Optimierungsplan
> **Methode:** Vollständige Analyse aller .claude/ Konfigurationsdateien

---

## Block A: CLAUDE.md Inventar

### Dateien gefunden

| Datei | Zeilen | Ort |
|-------|--------|-----|
| `.claude/CLAUDE.md` | **265** | Projekt-Root (versioniert) |
| `~/.claude/CLAUDE.md` | ~30 | Global (privat, nicht versioniert) |

Es gibt **keine** weiteren CLAUDE.md in Unterverzeichnissen (`El Frontend/`, `El Servador/`, `El Trabajante/`).

### Sektionen in `.claude/CLAUDE.md` (265 Zeilen)

| Sektion | Zeilen (ca.) | Inhalt |
|---------|--------------|--------|
| Projekt-Überblick | 5 | IoT-Framework, 3-Schichten |
| Agent-Orchestrierung | 20 | Sequenziell/Parallel-Regeln |
| Skills (Trigger-Tabelle) | 15 | 13 Skills mit Keywords |
| Dev-Agenten (Trigger-Tabelle) | 8 | 4 Dev-Agents |
| System-Operator & Session-Einstieg | 15 | system-control, db-inspector |
| Debug-Agenten (Trigger-Tabelle) | 8 | 4 Debug-Agents |
| Meta-Analyse | 4 | meta-analyst |
| Figma MCP Integration Rules | 45 | Design Token Mapping, Component/Asset Rules, Tailwind Config |
| Loki-Debug | 20 | CLI-Befehle, Queries |
| Referenzen-Tabelle | 12 | Pfade zu Referenz-Dateien |
| Regeln | 3 | 3 Kern-Regeln |
| TM-Workflow | 80 | Test-Flow, Dev-Flow, Agent-Aktivierungsreihenfolge |
| Workflow | 3 | SKILL → DEV-AGENT → ... |

### Bewertung gegen Best Practices

| Kriterium | Best Practice | IST | Bewertung |
|-----------|--------------|-----|-----------|
| **Länge** | Unter 200 Zeilen | **265 Zeilen** | ÜBERSCHRITTEN um 65 Zeilen |
| **Compact Instructions** | Bullet-Points die nach /compact erhalten bleiben | **Fehlend** | Keine Compact-Sektion vorhanden |
| **Sub-Agent Routing Rules** | Explizite Regeln wann parallel/sequentiell/background | **Teilweise** — "zusammen" Trigger existiert, aber keine granularen Routing-Kriterien (Datei-Grenzen, State-Sharing, Background-Research) | Grundregeln vorhanden, aber nicht differenziert genug |
| **Verifikationskriterien** | Klare Kriterien wie Agent seine Arbeit prüfen soll | **Minimal** — nur "Build verifizieren → pio run / pytest" | Fehlt für die meisten Tasks |
| **Path-scoped vs. zentral** | Bereichsspezifisches in .claude/rules/ mit paths: | **Gut** — 4 path-scoped Rules existieren (api, docker, firmware, frontend) | Aber Figma-Sektion (45 Zeilen) gehört in eine Frontend-Rule |
| **Rolle der Datei** | Router/Index — Details in Skills/Agents | **Korrekt** — "Diese Datei ist NUR Router" | Figma + TM-Workflow widersprechen Router-Prinzip |

### Konkrete Probleme

1. **Figma MCP Integration (45 Zeilen):** Gehört in `.claude/rules/frontend-rules.md` mit `paths: ["El Frontend/**"]` — wird nur bei Frontend-Arbeit benötigt, belastet aber JEDEN Kontext
2. **TM-Workflow (80 Zeilen):** Detaillierter Workflow-Beschrieb der selten gebraucht wird. Sollte in separate Datei ausgelagert werden (z.B. `.claude/reference/TM_WORKFLOW.md`) und nur im Router referenziert
3. **Keine Compact-Sektion:** Nach /compact gehen alle Details verloren — kritischste Infos (Architektur, Agent-Routing, Naming) fehlen dann
4. **Loki-Debug (20 Zeilen):** Gehört in `.claude/rules/` oder Referenz-Datei

### Empfehlung: Root CLAUDE.md auf ~150 Zeilen reduzieren

```
Entfernen/Auslagern:
- Figma MCP Integration → .claude/rules/frontend-rules.md (+45 Zeilen dort)
- TM-Workflow Details → .claude/reference/TM_WORKFLOW.md (neu, 80 Zeilen)
- Loki-Debug → .claude/rules/docker-rules.md oder eigene Rule

Hinzufügen:
- Compact Instructions Sektion (10-15 Zeilen kritischste Infos)
- Differenzierte Routing-Regeln (parallel/sequentiell/background Kriterien)
- Verifikationskriterien pro Bereich (5-10 Zeilen)
```

**Score: 3/5** — Gute Struktur als Router, aber zu lang und fehlende Compact/Verifikations-Sektionen.

---

## Block B: Agents Inventar

### Übersicht: 13 Agents

| Agent | Zeilen | Model | Tools | Hooks | Skills | Examples |
|-------|--------|-------|-------|-------|--------|----------|
| agent-manager | 302 | sonnet | R,W,E,Grep,Glob | Nein | Nein | Nein |
| db-inspector | 235 | sonnet | R,W,Bash,Grep,Glob | Nein | Nein | Nein |
| esp32-debug | 374 | sonnet | R,W,Grep,Glob,Bash | Nein | Nein | **Ja (3)** |
| esp32-dev | 415 | sonnet | R,Grep,Glob,Bash,W,E | Nein | Nein | Nein |
| frontend-debug | 361 | sonnet | R,W,Grep,Glob,Bash | Nein | Nein | **Ja (3)** |
| frontend-dev | 480 | sonnet | R,W,E,Bash,Grep,Glob | Nein | Nein | Nein |
| meta-analyst | 255 | sonnet | R,W,Grep,Glob | Nein | Nein | **Ja (3)** |
| mqtt-debug | 376 | sonnet | R,W,Grep,Glob,Bash | Nein | Nein | **Ja (3)** |
| mqtt-dev | 450 | sonnet | R,Grep,Glob,Bash,W,E | Nein | Nein | Nein |
| server-debug | 305 | sonnet | R,W,Grep,Glob,Bash | Nein | Nein | **Ja (3)** |
| server-dev | 430 | sonnet | R,Grep,Glob,Bash,W,E | Nein | Nein | Nein |
| system-control | 289 | **opus** | R,W,Bash,Grep,Glob | Nein | Nein | Nein |
| test-log-analyst | 185 | sonnet | R,W,Grep,Glob,Bash | Nein | Nein | Nein |

**Gesamtgrösse:** ~4.457 Zeilen über 13 Agents

### Frontmatter-Felder genutzt

| Feld | Genutzt | Anzahl |
|------|---------|--------|
| `name` | Ja | 13/13 |
| `description` | Ja | 13/13 |
| `model` | Ja | 13/13 (12x sonnet, 1x opus) |
| `color` | Ja | 13/13 |
| `tools` | Ja | 13/13 |
| `hooks` | **Nein** | 0/13 |
| `skills` (preloaded) | **Nein** | 0/13 |

### Bewertung gegen Best Practices

| Kriterium | Best Practice | IST | Bewertung |
|-----------|--------------|-----|-----------|
| **Grösse** | Fokussiert, unter ~500 Zeilen. >1000 = zu gross | **OK** — grösster Agent 480 Zeilen (frontend-dev) | Alle in akzeptablem Bereich |
| **Description-Qualität** | Präzise Trigger-Keywords + "MUST BE USED when / NOT FOR" | **Gut** — 8/13 haben MUST BE USED/NOT FOR Pattern | Debug- und Dev-Agents gut, system-control + test-log-analyst gut |
| **Model-Wahl** | Opus für Orchestrierung, Sonnet für fokussierte Tasks, Haiku für Read-Only | **Teilweise** — system-control=opus (korrekt), Rest=sonnet | meta-analyst und agent-manager könnten Haiku nutzen (Read-Only Analyse) |
| **Tools-Einschränkung** | Analyse-Agents: nur Read,Grep,Glob (Read-Only Sandbox) | **Schlecht** — meta-analyst hat Write obwohl er "Widersprüche NICHT auflöst" und nur dokumentiert. Alle Debug-Agents haben Write+Bash obwohl sie nur analysieren sollen | Potentielles Sicherheitsproblem |
| **Preloaded Skills** | Agents können Skills vorladen via `skills` Feld | **Nicht genutzt** (0/13) | Verschenktes Potential — Dev-Agents sollten ihre Development-Skills vorladen |
| **Hooks pro Agent** | PostToolUse nach Edit → Auto-Format | **Nicht genutzt** (0/13) | Verschenktes Potential |

### Konkrete Probleme

1. **Analyse-Agents haben Write-Zugriff:** meta-analyst, alle debug-Agents haben `Write` und `Bash` Tools obwohl sie nur Reports schreiben und Logs lesen sollen. Write für den Report-Output ist akzeptabel, aber Bash ist zu permissiv für reine Analyse.

2. **Kein Skill-Preloading:** Die Dev-Agents (esp32-dev, server-dev, frontend-dev, mqtt-dev) referenzieren ihre Skills im Text, laden sie aber nicht via Frontmatter vor. Das Skill wird erst bei Bedarf geladen → Kontext-Overhead.

3. **Alle gleiche Model-Größe:** 12/13 Agents nutzen Sonnet. Für reine Analyse-Agents (meta-analyst, agent-manager, db-inspector) würde Haiku reichen und wäre schneller/günstiger.

4. **Keine Agent-Hooks:** Kein einziger Agent nutzt Hooks — z.B. PostToolUse nach Edit für Auto-Formatting oder Stop-Hook für Report-Vollständigkeits-Check.

### Empfehlungen

| Agent | Änderung | Impact |
|-------|----------|--------|
| meta-analyst | Tools: `Read, Grep, Glob, Write` (Bash entfernen) | Sicherheit |
| agent-manager | Model: `haiku` (reine Analyse) | Performance + Kosten |
| meta-analyst | Model: `haiku` (reine Analyse) | Performance + Kosten |
| esp32-dev | `skills: [esp32-development]` | Sofortiger Skill-Kontext |
| server-dev | `skills: [server-development]` | Sofortiger Skill-Kontext |
| frontend-dev | `skills: [frontend-development]` | Sofortiger Skill-Kontext |
| mqtt-dev | `skills: [mqtt-development]` | Sofortiger Skill-Kontext |
| Alle Dev-Agents | `hooks: PostToolUse(Edit) → prettier/ruff` | Code-Qualität |

**Score: 3/5** — Konsistente Struktur, gute Descriptions, aber fehlende Tool-Einschränkung, kein Skill-Preloading, keine Hooks.

---

## Block C: Skills Inventar

### Übersicht: 22 Skills

| Skill | Zeilen | user-invocable | context | allowed-tools | model | Supporting Files |
|-------|--------|----------------|---------|---------------|-------|-----------------|
| agent-manager | 267 | — | inline | R,W,E,Grep,Glob | — | — |
| collect-reports | 215 | **true** | — | R,Glob,W,Bash | — | — |
| collect-system-status | 194 | — | — | R,Glob,Grep,Bash | — | — |
| DO | 181 | — | — | — | — | — |
| esp32-debug | 395 | — | inline | R,Grep,Glob,Bash | — | — |
| esp32-development | ~400 | — | — | — | — | **MODULE_REGISTRY.md** |
| frontend-debug | 477 | — | inline | R,Grep,Glob,Bash | — | — |
| frontend-development | ~350 | — | — | — | — | — |
| git-commit | 253 | **true** | — | R,Grep,Glob,Bash | — | — |
| git-health | 315 | **true** | — | R,Grep,Glob,Bash | — | — |
| hardware-test | 270 | **true** | — | R,W,Bash,Grep,Glob,Task | — | — |
| ki-audit | 217 | **true** | inline | R,Grep,Glob,Edit | — | — |
| meta-analyst | 448 | false | — | R,Grep,Glob | — | — |
| mqtt-debug | 384 | — | inline | R,Grep,Glob,Bash | — | — |
| mqtt-development | **755** | — | — | R,Grep,Glob,Bash,W,E | — | — |
| server-debug | 395 | — | — | R,Grep,Glob,Bash | — | — |
| server-development | ~400 | — | — | — | — | **MODULE_REGISTRY.md, databases.md** |
| system-control | **570** | — | — | R,W,Bash,Grep,Glob | — | — |
| test-log-analyst | 144 | **true** | — | R,Grep,Glob,Bash | — | — |
| updatedocs | 251 | **true** | — | R,Grep,Glob,E,W,Bash | — | — |
| verify-plan | **530** | **true** | — | R,Grep,Glob,Bash,E | — | — |
| db-inspector | ~200 | — | — | — | — | — |

**Gesamtgrösse:** ~7.611 Zeilen über 22 Skills

### Frontmatter-Nutzung

| Feld | Genutzt | Anzahl | Best Practice |
|------|---------|--------|---------------|
| `name` | Ja | 20/22 | OK |
| `description` | Ja | 20/22 | OK |
| `allowed-tools` | Ja | 16/22 | Gut — aber 6 fehlen |
| `user-invocable` | Teilweise | 8 true, 1 false, 13 missing | Viele Skills sollten explizit false setzen |
| `context` | Selten | 5x `inline`, 0x `fork` | **`fork` wird nie genutzt!** |
| `model` | **Nie** | 0/22 | Komplett ungenutzt |
| `disable-model-invocation` | **Nie** | 0/22 | Komplett ungenutzt |
| `agent` | **Nie** | 0/22 | Komplett ungenutzt |
| `hooks` | **Nie** | 0/22 | Komplett ungenutzt |
| `argument-hint` | **Nie** | 0/22 | Komplett ungenutzt |
| Dynamic Context `!command` | Selten | ~3/22 | Komplett ungenutzt |
| String Substitutions | Selten | ~5/22 | Kaum genutzt |

### Bewertung gegen Best Practices

| Kriterium | Best Practice | IST | Bewertung |
|-----------|--------------|-----|-----------|
| **`context: fork`** | Eigenständige Tasks (Analyse, Build) als fork | **0/22 nutzen fork** | Alle Skills laufen im Haupt-Kontext — verschmutzen ihn |
| **`allowed-tools`** | Analyse-Skills nur Read/Grep/Glob | **16/22 haben es** — aber zu permissiv | Zu viele haben Write/Bash |
| **`disable-model-invocation`** | Skills mit Seiteneffekten (git-commit, hardware-test) | **0/22** | git-commit und hardware-test sollten disable haben |
| **`model`** | Leichte Skills mit Haiku, komplexe mit Sonnet | **0/22** | Alle nutzen Session-Default |
| **Dynamic Context** | `!git log --oneline -5` etc. | **~3/22** | Massiv ungenutztes Potential |
| **String Substitutions** | $ARGUMENTS für parametrisierte Skills | **~5/22** | Kaum parametrisiert |
| **Supporting Files** | Templates, Examples in Skill-Dir | **3/22** (MODULE_REGISTRY.md x2, databases.md) | Skills sind monolithisch |
| **Länge** | Unter 500 Zeilen | **3 über 500** (mqtt-dev 755, system-control 570, verify-plan 530) | mqtt-development ist zu gross |

### Konkrete Probleme

1. **`context: fork` nie genutzt:** Das ist das grösste verschenkte Potential. Skills wie `collect-reports`, `git-commit`, `git-health`, `ki-audit`, `meta-analyst`, `verify-plan` sind eigenständige Tasks die den Haupt-Kontext nicht brauchen. Mit `context: fork` würden sie als Sub-Agent laufen und den Kontext schützen.

2. **`model` nie genutzt:** Analyse-Skills (ki-audit, git-health, meta-analyst, verify-plan) könnten mit Haiku laufen — schneller und günstiger.

3. **`disable-model-invocation` nie genutzt:** `git-commit` und `hardware-test` haben Seiteneffekte (Git-Staging, Hardware-Interaktion) — Claude sollte sie nicht selbst triggern.

4. **mqtt-development (755 Zeilen):** Über 500-Zeilen-Limit. Sollte Detail-Wissen in Supporting Files auslagern (z.B. `mqtt-development/TOPIC_REFERENCE.md`).

5. **DO Skill hat kein Frontmatter:** Einziger Skill ohne YAML-Frontmatter — wird möglicherweise nicht korrekt als Skill erkannt.

6. **Inkonsistente Frontmatter-Formate:** `collect-system-status` nutzt `skill_name`/`version`/`created` statt Standard `name`/`description`.

### Empfehlungen

| Skill | Änderung | Impact |
|-------|----------|--------|
| collect-reports | `context: fork` | Kontext-Schutz |
| git-commit | `context: fork`, `disable-model-invocation: true` | Sicherheit + Kontext |
| git-health | `context: fork`, `model: haiku` | Performance + Kontext |
| ki-audit | `context: fork`, `model: haiku` | Performance + Kontext |
| meta-analyst | `context: fork`, `model: haiku` | Performance + Kontext |
| verify-plan | `context: fork` | Kontext-Schutz |
| hardware-test | `disable-model-invocation: true` | Sicherheit |
| mqtt-development | Aufspalten: SKILL.md (300Z) + TOPIC_REFERENCE.md (450Z) | Fokus |
| DO | YAML-Frontmatter hinzufügen | Korrekte Erkennung |
| collect-system-status | Frontmatter auf Standard-Felder umstellen | Konsistenz |
| Alle Development-Skills | `argument-hint: "Beschreibe was implementiert werden soll"` | UX |

**Score: 2/5** — Frontmatter minimal genutzt. `context: fork`, `model`, `disable-model-invocation` komplett ungenutzt. Grösstes Optimierungspotential aller Blöcke.

---

## Block D: Rules Inventar

### Übersicht: 5 Rules

| Rule | Zeilen | Path-Scoping | Scope |
|------|--------|-------------|-------|
| `rules.md` | 206 | `paths: ["**"]` | Global — lädt immer |
| `api-rules.md` | 394 | `paths: ["El Servador/**"]` | Server-Code |
| `docker-rules.md` | 101 | `paths: ["docker-compose*", "Makefile", "scripts/docker/*", "Dockerfile*", "docker/**"]` | Docker/Infra |
| `firmware-rules.md` | 241 | `paths: ["El Trabajante/**"]` | ESP32 Firmware |
| `frontend-rules.md` | 516 | `paths: ["El Frontend/**"]` | Vue Frontend |

**Gesamtgrösse:** 1.458 Zeilen

### Bewertung gegen Best Practices

| Kriterium | Best Practice | IST | Bewertung |
|-----------|--------------|-----|-----------|
| **Path-Scoping** | Alle bereichsspezifischen Rules mit paths: | **Gut** — 4/5 Rules korrekt path-scoped | Nur rules.md lädt global (absichtlich) |
| **Keine Duplikation** | Rules ergänzen CLAUDE.md, duplizieren nicht | **Problem** — rules.md dupliziert CLAUDE.md-Inhalte | Architektur-Prinzipien, Namenskonventionen, Verbotene Aktionen stehen doppelt |
| **Granularität** | Eine Rule pro Themenbereich | **Gut** — klare Trennung nach Bereichen | Könnte feiner sein (z.B. testing/conventions.md) |
| **Aktualität** | Keine veralteten Konventionen | **OK** — Inhalte scheinen aktuell | Nicht verifizierbar ohne tiefe Code-Analyse |

### Konkrete Probleme

1. **rules.md = CLAUDE.md Duplikat:** `rules.md` (206 Zeilen) ist eine fast identische Kopie der Entwicklungsregeln, die auch in CLAUDE.md stehen. Beide werden über `context.alwaysInclude` IMMER geladen. Das bedeutet:
   - ~200 Zeilen doppelter Kontext in JEDER Session
   - Divergenz-Risiko wenn nur eine Datei aktualisiert wird
   - Unnötige Kontext-Belastung

2. **`context.alwaysInclude` in settings.json:** Die Einstellung `"alwaysInclude": [".claude/claude.md", ".claude/rules/rules.md"]` erzwingt das Laden beider Dateien — obwohl rules.md schon `paths: ["**"]` hat und damit automatisch geladen wird. Doppelt gemoppelt.

3. **Fehlende Test-Rule:** Es gibt keine `testing.md` Rule für Test-Konventionen (z.B. pytest-Patterns, Vitest-Setup, Playwright-Flows).

4. **Figma-Regeln fehlen als Rule:** Die 45-Zeilen Figma-Sektion in CLAUDE.md gehört als eigene Rule oder in frontend-rules.md.

### Empfehlungen

| Änderung | Datei | Impact |
|----------|-------|--------|
| rules.md auf 30 Zeilen kürzen | rules.md | ~170 Zeilen Kontext-Ersparnis |
| `alwaysInclude` auf nur `".claude/claude.md"` reduzieren | settings.json | Redundanz eliminieren |
| Figma-Regeln aus CLAUDE.md → frontend-rules.md | CLAUDE.md + frontend-rules.md | ~45 Zeilen aus globalem Kontext |
| testing-rules.md erstellen | .claude/rules/testing-rules.md | Test-Konventionen path-scoped |

**Score: 3/5** — Gutes Path-Scoping, aber massive Duplikation mit CLAUDE.md und unnötige alwaysInclude-Konfiguration.

---

## Block E: Hooks Inventar

### IST-Zustand: Keine Hooks konfiguriert

- `.claude/settings.json`: **Kein `hooks`-Feld**
- `.claude/settings.local.json`: **Kein `hooks`-Feld**
- `~/.claude/settings.json`: **Kein `hooks`-Feld**
- Agent-Frontmatter: **0/13 Agents haben Hooks**
- Skill-Frontmatter: **0/22 Skills haben Hooks**

**Hooks werden komplett nicht genutzt.** Das ist das grösste einzelne Optimierungspotential.

### 6 Konkrete Hook-Empfehlungen

#### 1. PostToolUse `Edit|Write` → Auto-Format (COMMAND)
```json
{
  "event": "PostToolUse",
  "matcher": "Edit|Write",
  "type": "command",
  "command": {
    "glob_match": {
      "*.py": "cd \"El Servador/god_kaiser_server\" && .venv/Scripts/ruff.exe format $FILE",
      "*.ts|*.vue": "cd \"El Frontend\" && npx prettier --write $FILE"
    }
  }
}
```
**Impact:** Automatische Code-Formatierung nach jeder Dateiänderung. Eliminiert Format-Diskussionen.

#### 2. PreToolUse `Bash` → Gefährliche Befehle blockieren (COMMAND)
```json
{
  "event": "PreToolUse",
  "matcher": "Bash",
  "type": "command",
  "command": "echo '$INPUT' | grep -qE '(rm -rf|git push --force|DROP TABLE|git reset --hard)' && echo '{\"ok\": false, \"reason\": \"Blocked: destructive command\"}' || echo '{\"ok\": true}'"
}
```
**Impact:** Verhindert versehentlich destruktive Befehle.

#### 3. Stop → Task-Vollständigkeit prüfen (PROMPT)
```json
{
  "event": "Stop",
  "type": "prompt",
  "prompt": "Prüfe ob alle vom User angeforderten Änderungen vollständig umgesetzt wurden. Falls nicht, antworte mit {\"ok\": false, \"reason\": \"Was noch fehlt\"}."
}
```
**Impact:** Verhindert vorzeitiges Aufhören — das häufigste Problem bei komplexen Tasks.

#### 4. SessionStart → Kontext nach Compact wiederherstellen (COMMAND)
```json
{
  "event": "SessionStart",
  "matcher": "compact",
  "type": "command",
  "command": "echo '## Session Context Restored\n- Branch: '$(git branch --show-current)'\n- Last commit: '$(git log --oneline -1)'\n- Modified files: '$(git diff --name-only | head -10)"
}
```
**Impact:** Nach /compact bleiben kritische Kontext-Infos erhalten.

#### 5. PostToolUse `Edit|Write` auf `*.py` → Type-Check (COMMAND)
```json
{
  "event": "PostToolUse",
  "matcher": "Edit|Write",
  "type": "command",
  "command": {
    "glob_match": {
      "El Servador/**/*.py": "cd \"El Servador/god_kaiser_server\" && .venv/Scripts/ruff.exe check $FILE --select E,F --quiet"
    }
  }
}
```
**Impact:** Sofortiges Feedback bei Syntax/Import-Fehlern nach Python-Änderungen.

#### 6. PreCompact → Zustand sichern (COMMAND)
```json
{
  "event": "PreCompact",
  "type": "command",
  "command": "echo '{\"branch\": \"'$(git branch --show-current)'\", \"modified\": '$(git diff --name-only | wc -l)', \"todos\": \"see TodoWrite\"}'"
}
```
**Impact:** Kritische Session-Informationen überleben die Komprimierung.

**Score: 1/5** — Komplett ungenutzt. Grösstes Einzelpotential für Produktivitätssteigerung.

---

## Block F: Settings Inventar

### `.claude/settings.json` (Projekt, versioniert) — 122 Zeilen

| Bereich | Konfiguration | Bewertung |
|---------|---------------|-----------|
| **permissions.allow** | `Bash, Read, Write, Edit, Task, Glob, Grep` | **Zu breit** — Bash ist komplett erlaubt ohne Pattern-Einschränkung |
| **permissions.deny** | **Nicht konfiguriert** | Keine gefährlichen Befehle blockiert |
| **model** | `sonnet` | OK als Default |
| **enabledPlugins** | playwright, frontend-design, ralph-loop, context7, agent-sdk-dev, auto-ops | OK |
| **context.alwaysInclude** | `.claude/claude.md`, `.claude/rules/rules.md` | **Redundant** — rules.md hat `paths: ["**"]` |
| **context.maxTokens** | 200000 | OK |
| **skills.directory** | `.claude/skills` | OK (Standard) |
| **skills.autoLoad** | true | OK |
| **taskManagement.enabled** | true | OK |
| **testing** | ESP32/Server/Wokwi Befehle | Gut dokumentiert |
| **build** | 3 Environments (seeed, esp32_dev, wokwi) | OK |
| **run** | Server + Frontend Start-Befehle | OK |
| **git** | autoCommit: false, conventionalCommits: true | Korrekt |
| **paths** | Alle Projekt-Pfade | Gut für Agent-Navigation |
| **autoops** | Server-URL, Credentials, Plugin-Pfade | **Credentials im Klartext!** |
| **workflows** | preCommit, afterESP32Change, afterServerChange | Gut definiert |

### `.claude/settings.local.json` (Lokal, nicht versioniert) — 50 Zeilen

| Bereich | Konfiguration |
|---------|---------------|
| **permissions.allow** | MCP Docker Tools, Playwright Tools, Skills (ralph-loop, updatedocs, system-control, verify-plan, git-commit, frontend-development), WebFetch (figma, pypi, github), GitHub MCP Tools |

### `~/.claude/settings.json` (Global) — Relevante Felder

| Bereich | Konfiguration |
|---------|---------------|
| **permissions.allow** | Docker, Zotero, GitHub MCP, WebFetch (github) |
| **enabledPlugins** | 24 Plugins (20 enabled, 4 disabled) |
| **effortLevel** | high |

### `.mcp.json` — Nicht vorhanden

Keine `.mcp.json` im Projekt-Root gefunden. MCP-Server werden über Plugins konfiguriert (playwright, context7, github).

### Bewertung gegen Best Practices

| Einstellung | Best Practice | IST | Bewertung |
|-------------|--------------|-----|-----------|
| **permissions.allow** | Pattern-basiert: `Bash(npm test)`, `Bash(git *)` | **Blanko `Bash`** — alles erlaubt | Sicherheitsrisiko |
| **permissions.deny** | Gefährliche Ops blockieren | **Nicht konfiguriert** | Sollte `rm -rf`, `git push --force` etc. blockieren |
| **env** | `CLAUDE_CODE_SUBAGENT_MODEL` für günstigere Sub-Agents | **Nicht konfiguriert** | Verschenktes Kostenpotential |
| **Credentials** | Niemals im Klartext in versionierten Dateien | **`Admin123#` im Klartext** in settings.json | Sicherheitsproblem (versioniert!) |
| **alwaysInclude** | Nur was wirklich immer nötig ist | **Redundant** — rules.md wird doppelt geladen | Kontext-Verschwendung |

### Konkrete Probleme

1. **Credentials im Klartext:** `"password": "Admin123#"` in `settings.json` — das ist versioniert und somit im Git-Repo sichtbar. Sollte in `.env` oder `.claude/settings.local.json` stehen.

2. **Blanko Bash-Permission:** `"Bash"` ohne Pattern erlaubt JEDEN Shell-Befehl ohne Nachfrage. Best Practice: `"Bash(cd *)", "Bash(git status)", "Bash(npm *)", "Bash(pytest *)"` etc.

3. **Kein `CLAUDE_CODE_SUBAGENT_MODEL`:** Alle Sub-Agents nutzen das gleiche Modell wie die Haupt-Session. Mit `CLAUDE_CODE_SUBAGENT_MODEL=haiku` könnten reine Analyse-Sub-Agents günstiger laufen.

4. **Keine env-Variablen konfiguriert:** Weder in settings.json noch als Umgebungsvariable.

5. **Nicht-standard Felder:** `testing`, `build`, `run`, `paths`, `autoops`, `workflows`, `git`, `taskManagement`, `skills`, `context` — diese Felder sind NICHT offizielle Claude Code Settings-Felder. Sie werden von Claude Code **ignoriert**. Sie dienen nur als Referenz-Daten die über alwaysInclude in den Kontext geladen werden. Das ist ein funktionierender Workaround, aber keine offizielle Nutzung.

### Empfehlungen

| Änderung | Impact |
|----------|--------|
| Credentials in `.env` oder `settings.local.json` verschieben | Sicherheit |
| `permissions.allow` Bash auf Patterns einschränken | Sicherheit |
| `permissions.deny` für destruktive Befehle hinzufügen | Sicherheit |
| `alwaysInclude` auf nur `.claude/claude.md` reduzieren | Kontext-Effizienz |
| `CLAUDE_CODE_SUBAGENT_MODEL` Environment-Variable setzen | Kosten |

**Score: 2/5** — Credentials-Problem, zu breite Permissions, keine env-Variablen, Kontext-Redundanz.

---

## Block G: Parallelisierungs-Analyse

### IST-Zustand der Parallelisierung

| Aspekt | Status | Details |
|--------|--------|---------|
| **Routing-Regeln in CLAUDE.md** | **Minimal** | Nur "zusammen" als Trigger, keine differenzierten Kriterien |
| **`isolation: "worktree"`** | **Nicht genutzt** | Kein Agent nutzt Worktree-Isolation |
| **`run_in_background: true`** | **Nicht genutzt** | Kein Agent läuft im Hintergrund |
| **Agent-Orchestrierung** | **Strikt sequentiell** | CLAUDE.md erzwingt: "NACHEINANDER ist Default" |
| **Parallele Sub-Agent-Starts** | **Nur bei "zusammen"** | User muss explizit triggern |

### Analyse des früheren Problems

Das beschriebene Problem — "Orchestrator konnte Sub-Agent-Ergebnisse nicht einsammeln" — hat mehrere potentielle Ursachen:

| Ursache | Status im IST | Lösung vorhanden? |
|---------|---------------|-------------------|
| Vage Invocations ohne Scope/Dateien | **Teilweise gelöst** — Agent-Descriptions sind präzise | Ja, aber Routing-Regeln fehlen |
| Over-Parallelizing (zu viele gleichzeitig) | **Vermieden** — strikt sequentiell als Default | Ja, aber zu konservativ |
| Kontext-Fenster des Orchestrators voll | **Nicht adressiert** — kein `context: fork` | Nein |
| Kein `resume` für Sub-Agent-Kontext | **Nicht genutzt** | Nein |
| Research-Agents blockieren foreground | **Nicht adressiert** — kein `run_in_background` | Nein |

### Bewertung

Die aktuelle Konfiguration ist **zu konservativ**. Das System vermeidet das frühere Problem durch strikte Sequentialisierung, aber verschenkt dadurch das Parallelisierungspotential.

**Konkretes Beispiel:** Im Test-Flow werden 4 Debug-Agents nacheinander gestartet (esp32-debug → server-debug → mqtt-debug → frontend-debug). Diese analysieren **unabhängige** Log-Quellen und könnten parallel laufen. Aktuell dauert das 4x so lange wie nötig.

### Empfohlene Routing-Regeln für CLAUDE.md

```markdown
## Sub-Agent Routing Rules

### Parallel dispatch (ALLE Bedingungen müssen erfüllt sein):
- 3+ unabhängige Tasks ODER unabhängige Domänen (ESP32/Server/Frontend)
- Kein geteilter State zwischen Tasks
- Klare Datei-Grenzen ohne Überlappung
- Beispiele: Debug-Agents im Test-Flow, unabhängige Code-Reviews

### Sequential dispatch (EINE Bedingung reicht):
- Tasks haben Abhängigkeiten (Output von A ist Input für B)
- Geteilte Dateien oder State (z.B. mqtt-dev ändert ESP32 + Server)
- Unklarer Scope
- Beispiele: system-control vor Debug-Agents, Dev-Agent → Test

### Background dispatch:
- Research-Tasks (meta-analyst, ki-audit)
- Codebase-Exploration (agent-manager Check)
- Ergebnisse sind nicht sofort blockierend
```

### Empfehlungen

| Änderung | Impact |
|----------|--------|
| Routing-Regeln in CLAUDE.md mit 3 Kategorien (parallel/sequential/background) | Klarheit für Orchestrator |
| Debug-Agents im Test-Flow als parallelisierbar markieren | 4x schneller |
| `context: fork` für alle Analyse-Skills | Kontext-Schutz |
| meta-analyst mit `run_in_background: true` | Nicht-blockierend |
| `isolation: "worktree"` für Dev-Agents die gleichzeitig verschiedene Bereiche ändern | Sichere Parallelisierung |

**Score: 2/5** — Zu konservative Default-Konfiguration, kein Background/Worktree/Fork, fehlende differenzierte Routing-Regeln.

---

## Block H: Gesamtbewertung und Optimierungsplan

### Scoring-Tabelle

| Block | Bereich | Score | Grösstes Problem | Quick Win |
|-------|---------|-------|------------------|-----------|
| **A** | CLAUDE.md | **3/5** | 265 Zeilen statt <200; Figma+TM-Workflow aufblähen | Figma-Sektion (45Z) → frontend-rules.md verschieben |
| **B** | Agents | **3/5** | Kein Skill-Preloading, keine Hooks, Analyse-Agents zu permissiv | `skills:` Feld in Dev-Agents hinzufügen |
| **C** | Skills | **2/5** | `context: fork` nie genutzt, `model`/`disable-model-invocation` komplett fehlend | `context: fork` für 6 eigenständige Skills |
| **D** | Rules | **3/5** | rules.md dupliziert CLAUDE.md (~200Z doppelt), alwaysInclude redundant | `alwaysInclude` auf nur CLAUDE.md reduzieren |
| **E** | Hooks | **1/5** | Komplett ungenutzt — 0 Hooks konfiguriert | PostToolUse Auto-Format Hook hinzufügen |
| **F** | Settings | **2/5** | Credentials im Klartext, blanko Bash-Permission, keine env-Vars | Credentials in .env verschieben |
| **G** | Parallelisierung | **2/5** | Zu konservativ sequentiell, keine Routing-Differenzierung | Routing-Regeln mit 3 Kategorien in CLAUDE.md |

**Gesamt-Score: 2.4 / 5** — Solide Grundstruktur, aber viele moderne Features ungenutzt.

---

### Top-5 Quick Wins (sofort umsetzbar, hoher Impact)

#### 1. `context: fork` für eigenständige Skills (Impact: HOCH)
**Dateien:** `.claude/skills/{collect-reports,git-commit,git-health,ki-audit,verify-plan,meta-analyst}/SKILL.md`
**Änderung:** Frontmatter-Feld `context: fork` hinzufügen
**Warum:** Schützt den Haupt-Kontext vor Verschmutzung. Jeder dieser Skills führt eine abgeschlossene Analyse durch und braucht den Haupt-Kontext nicht. Aktuell frisst jeder Skill-Aufruf Kontext-Budget.

#### 2. PostToolUse Auto-Format Hook (Impact: HOCH)
**Datei:** `.claude/settings.json` → `hooks` Sektion hinzufügen
**Änderung:** Nach jeder Edit/Write-Operation auf .py → ruff format, auf .ts/.vue → prettier
**Warum:** Eliminiert Format-Diskrepanzen sofort. Derzeit muss Format manuell geprüft werden.

#### 3. Credentials aus settings.json entfernen (Impact: KRITISCH)
**Datei:** `.claude/settings.json` Zeile 102-103
**Änderung:** `defaultCredentials` Block entfernen oder in `.claude/settings.local.json` verschieben
**Warum:** Klartext-Passwort in versionierter Datei = Sicherheitsproblem. Bereits im Git-History.

#### 4. rules.md auf 30 Zeilen kürzen + alwaysInclude bereinigen (Impact: MITTEL)
**Dateien:** `.claude/rules/rules.md` + `.claude/settings.json`
**Änderung:** rules.md auf Kern-Regeln reduzieren (die nicht in CLAUDE.md stehen), `alwaysInclude` auf nur `.claude/claude.md`
**Warum:** ~200 Zeilen doppelter Kontext in jeder Session eliminieren.

#### 5. Skill-Preloading in Dev-Agents (Impact: MITTEL)
**Dateien:** `.claude/agents/{esp32-dev,server-dev,frontend-dev,mqtt-dev}.md`
**Änderung:** `skills: [esp32-development]` (bzw. entsprechend) im Frontmatter
**Warum:** Dev-Agent hat sofort seinen Development-Skill-Kontext statt ihn erst zur Laufzeit laden zu müssen.

---

### Top-5 Strategische Verbesserungen (mittelfristig)

#### 1. Differenzierte Parallelisierungs-Regeln (Aufwand: 2h)
**Was:** Routing-Regeln mit 3 Kategorien (parallel/sequential/background) in CLAUDE.md. Debug-Agents als parallelisierbar markieren. `run_in_background: true` für Research-Tasks.
**Warum:** Test-Flow dauert 4x so lange wie nötig weil Debug-Agents sequentiell laufen.
**Risiko:** Gering — bei unabhängigen Log-Quellen gibt es keine Konflikte.

#### 2. Compact Instructions + Verifikationskriterien in CLAUDE.md (Aufwand: 1h)
**Was:** 15-Zeilen Compact-Sektion mit kritischsten Infos die nach /compact erhalten bleiben. Pro-Bereich Verifikationskriterien (ESP32: `pio run` 0 errors, Server: `pytest` grün, Frontend: `npm run build` erfolgreich).
**Warum:** Nach /compact gehen derzeit alle Projekt-Details verloren. Verifikationskriterien sind laut Best Practices die "einzelne wirksamste Massnahme" für Agent-Qualität.

#### 3. Hook-Suite implementieren (Aufwand: 3h)
**Was:** Die 6 empfohlenen Hooks aus Block E: Auto-Format, Dangerous-Command-Block, Task-Vollständigkeit, SessionStart-Kontext, Python-Lint, PreCompact-Sicherung.
**Warum:** Hooks automatisieren repetitive Qualitäts-Checks und verhindern häufige Fehler.
**Reihenfolge:** (1) Auto-Format, (2) Dangerous-Block, (3) Task-Vollständigkeit, (4) SessionStart, (5) Lint, (6) PreCompact

#### 4. CLAUDE.md Schlankheitskur (Aufwand: 2h)
**Was:** Figma-Regeln → frontend-rules.md, TM-Workflow → `.claude/reference/TM_WORKFLOW.md`, Loki-Debug → docker-rules.md. Root CLAUDE.md auf ~150 Zeilen.
**Warum:** Jede irrelevante Zeile in CLAUDE.md mindert die Aufmerksamkeit auf kritische Regeln. Figma-Kontext wird bei 90% der Sessions nicht gebraucht.

#### 5. Model-Differenzierung pro Agent/Skill (Aufwand: 1h)
**Was:** `model: haiku` für Analyse-Agents (meta-analyst, agent-manager), `model: sonnet` bleibt für Dev-Agents, `model: opus` bleibt für system-control.
**Warum:** Analyse-Tasks brauchen keine Code-Generierung — Haiku ist 10x günstiger und 3x schneller. Reduziert Kosten bei gleicher Qualität für Analyse-Aufgaben.

---

### Implementierungsreihenfolge

```
Phase 1 (sofort, 1-2h):
├── Quick Win 3: Credentials entfernen (KRITISCH)
├── Quick Win 1: context: fork für 6 Skills
├── Quick Win 4: rules.md kürzen + alwaysInclude bereinigen
└── Quick Win 5: skills: in Dev-Agents

Phase 2 (diese Woche, 3-4h):
├── Strategisch 1: Parallelisierungs-Regeln in CLAUDE.md
├── Strategisch 2: Compact Instructions + Verifikation
├── Strategisch 4: CLAUDE.md Schlankheitskur
└── Quick Win 2: Auto-Format Hook

Phase 3 (nächste Woche, 3h):
├── Strategisch 3: Hook-Suite komplett
├── Strategisch 5: Model-Differenzierung
└── Testing-Rule erstellen
```

---

### Nicht-offensichtliche Erkenntnisse

1. **settings.json Felder werden ignoriert:** Die Felder `testing`, `build`, `run`, `paths`, `autoops`, `workflows`, `git`, `taskManagement`, `skills`, `context` in settings.json sind keine offiziellen Claude Code Einstellungen. Sie werden nur gelesen weil CLAUDE.md auf settings.json verweist und Agents darauf zugreifen. Das funktioniert, ist aber fragil. Besser wäre es, diese Informationen in eine dedizierte Referenz-Datei auszulagern (z.B. `.claude/reference/PROJECT_CONFIG.md`).

2. **22 Skills + 13 Agents = hohe Kontext-Last:** Bei `skills.autoLoad: true` werden ALLE Skill-Descriptions in den Kontext geladen. Bei 22 Skills sind das ~2.000-3.000 Tokens nur für Descriptions. `context: fork` auf eigenständige Skills würde den initialen Kontext entlasten.

3. **Commands (Legacy) vs. Skills:** Die 3 autoops-Commands in `.claude/commands/autoops/` nutzen das Legacy-Format. Sie funktionieren noch, aber Skills sind das empfohlene Format. Migration wäre sinnvoll, hat aber niedrige Priorität.

4. **Agent-Symmetrie:** Jeder Debug-Agent hat einen korrespondierenden Dev-Agent (esp32-debug ↔ esp32-dev etc.) plus einen Skill. Diese Dreifach-Struktur (Agent + Skill + Rule) ist konsistent und gut designed — aber die Skill↔Agent-Verbindung wird nicht via Frontmatter hergestellt.

---

*Bericht erstellt: 2026-03-07 | Methode: Vollständige Dateianalyse aller .claude/ Konfigurationsdateien*
