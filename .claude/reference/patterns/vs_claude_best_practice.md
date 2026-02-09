# Claude Code VS Code - Vollständige Referenz

> **Version:** 2.0 | **Stand:** 2026-02-04
> **Zweck:** Eigenständige Referenz für Claude Code in VS Code
> **Zielgruppe:** AutomationOne Agenten und Technical Manager

---

## 1. VS Code Extension Grundlagen

### 1.1 Voraussetzungen

- VS Code Version 1.98.0 oder höher
- Claude Code Extension aus VS Code Marketplace
- Anthropic Account mit API-Zugang

### 1.2 Installation & Start

```bash
# Extension installieren über VS Code Marketplace
# Suche nach: "Claude Code" von Anthropic

# Nach Installation: Spark-Icon in der Sidebar klicken
# Oder: Terminal öffnen und 'claude' eingeben
```

### 1.3 Verfügbare Features

| Feature | Beschreibung |
|---------|--------------|
| Native Sidebar | Dediziertes Claude Panel via Spark-Icon |
| Plan Mode mit Editing | Pläne vor Akzeptanz reviewen und bearbeiten |
| Auto-Accept Edits | Änderungen automatisch anwenden (konfigurierbar) |
| Extended Thinking | Toggle für erweitertes Denken (Button unten rechts) |
| @-File Mentions | Dateien mit @ referenzieren |
| Drag & Drop | Dateien und Bilder per Drag & Drop hinzufügen |
| MCP Server | Model Context Protocol Server (via CLI konfiguriert) |
| Conversation History | Zugriff auf vergangene Gespräche |
| Multiple Sessions | Mehrere Claude Sessions parallel |
| Keyboard Shortcuts | Meiste CLI-Shortcuts verfügbar |
| Slash Commands | Meiste CLI-Commands verfügbar |

### 1.4 Noch nicht verfügbare Features

| Feature | Workaround |
|---------|------------|
| MCP Config UI | `/mcp` Command im Terminal nutzen |
| Plugin Config UI | `/plugin` Command im Terminal nutzen |
| Subagent Config UI | Direkt über CLI oder Dateien konfigurieren |
| Checkpoints | Git für Versionierung verwenden |
| /rewind Command | Session neu starten oder Git nutzen |
| Tab Completion | Pfade manuell eingeben |
| Model Selection UI | In Settings 'Selected Model' direkt eingeben |

### 1.5 Security Hinweise

**Bei aktiviertem Auto-Edit Mode:**
- IDE Config-Dateien können automatisch modifiziert werden
- Permission-Prompts können umgangen werden
- **Empfehlung:** VS Code Restricted Mode für unbekannte Workspaces
- **Empfehlung:** Manual Approval für Edits bevorzugen

---

## 2. Memory System (CLAUDE.md)

### 2.1 Konzept

CLAUDE.md Dateien sind persistente Markdown-Dateien, die Claude automatisch in den Kontext lädt. Sie dienen als "Gedächtnis" für Projekt-spezifische Informationen, Konventionen und Anweisungen.

**Wichtig:** Anders als bei claude.ai gibt es KEIN automatisches Memory zwischen Sessions. Alles was Claude wissen soll, muss in CLAUDE.md stehen.

### 2.2 Speicherorte (Priorität absteigend)

| Typ | Pfad | Scope | Git-committed |
|-----|------|-------|---------------|
| **Managed** | Systemabhängig (MDM/GPO) | Organisation | Nein |
| **User** | `~/.claude/CLAUDE.md` | Alle Projekte des Users | Nein |
| **Project** | `CLAUDE.md` oder `.claude/CLAUDE.md` | Aktuelles Projekt | Ja |
| **Local** | `CLAUDE.local.md` | Lokal (nicht committen) | Nein |

**Merge-Verhalten:** Höhere Priorität überschreibt niedrigere. Settings werden gemerged.

### 2.3 Import-Syntax

CLAUDE.md kann andere Dateien importieren mit `@pfad/zur/datei`:

```markdown
# Projekt-Anweisungen

Siehe @README.md für Projektübersicht.
Git-Workflow unter @docs/git-instructions.md
API-Referenz: @.claude/reference/api/MQTT_TOPICS.md

## Weitere Anweisungen
- Immer Tests schreiben
- Code-Reviews erforderlich
```

**Regeln für Imports:**
- Relative Pfade relativ zur Datei mit dem Import
- Absolute Pfade erlaubt
- Max 5 Hops bei rekursiven Imports
- Nicht in Code-Blöcken evaluiert
- Erstmaliger Import zeigt Approval-Dialog

### 2.4 CLAUDE.local.md

Für persönliche Präferenzen, die nicht ins Git sollen:

```markdown
# Meine persönlichen Präferenzen

- Ich bevorzuge ausführliche Erklärungen
- Bitte deutsche Kommentare im Code
- Mein Editor: VS Code mit Vim-Mode
```

**Automatisch zu .gitignore hinzugefügt.**

### 2.5 Best Practices für CLAUDE.md

**DO:**
- Spezifisch sein: "2-Space Indentation" statt "Code formatieren"
- Strukturieren mit Markdown-Headings
- Unter 500 Zeilen halten
- Details in separate Dateien auslagern und importieren
- Projekt-spezifische Commands dokumentieren

**DON'T:**
- Keine sensiblen Daten (API-Keys, Secrets)
- Keine sehr langen Code-Beispiele (auslagern)
- Keine sich widersprechenden Anweisungen

### 2.6 Compact Instructions

Füge eine "Compact Instructions" Section hinzu, die bei Context-Komprimierung erhalten bleibt:

```markdown
## Compact Instructions

Diese Anweisungen bleiben auch nach /compact erhalten:
- Server-zentrische Architektur
- ESP32 = dumme Agenten
- Patterns erweitern, nicht neu erfinden
```

---

## 3. Subagents

### 3.1 Konzept

Subagents sind spezialisierte KI-Assistenten mit:
- Eigenem Kontext-Fenster (isoliert vom Hauptgespräch)
- Spezifischem System-Prompt
- Konfigurierbaren Tool-Zugriff
- Optionalem eigenen Modell

**Hauptvorteil:** Context-Isolation - Subagent-Arbeit "verschmutzt" nicht den Hauptkontext.

### 3.2 Speicherorte

| Typ | Pfad | Priorität |
|-----|------|-----------|
| **Project** | `.claude/agents/` | Höchste |
| **User** | `~/.claude/agents/` | Niedriger |
| **CLI** | `--agents` Flag | Zwischen Project und User |

**Bei Namenskonflikten:** Project-Agents überschreiben User-Agents.

### 3.3 Datei-Format

```yaml
---
name: agent-name
description: |
  Wann dieser Agent verwendet werden soll.
  MUST BE USED when: [Trigger-Situationen]
  NOT FOR: [Was dieser Agent NICHT tut]
tools: Read, Grep, Glob, Bash
model: sonnet
permissionMode: default
skills: skill1, skill2
---

# Agent System Prompt

Du bist ein spezialisierter Agent für...

## Deine Aufgaben
1. ...
2. ...

## Regeln
- NIEMALS ...
- IMMER ...
```

### 3.4 Frontmatter-Felder

| Feld | Pflicht | Beschreibung |
|------|---------|--------------|
| `name` | Ja | Eindeutiger Name (lowercase, hyphens) |
| `description` | Ja | Wann der Agent verwendet werden soll |
| `tools` | Nein | Komma-getrennte Tool-Liste. Wenn leer: erbt alle |
| `model` | Nein | `sonnet`, `opus`, `haiku` oder `inherit` |
| `permissionMode` | Nein | `default`, `acceptEdits`, `bypassPermissions`, `plan` |
| `skills` | Nein | Komma-getrennte Skill-Namen zum Auto-Laden |

### 3.5 Verfügbare Tools

```
Read        - Dateien lesen
Write       - Dateien schreiben (neu)
Edit        - Dateien bearbeiten (existierend)
Bash        - Shell-Befehle ausführen
Grep        - Textsuche mit Regex
Glob        - Datei-Pattern-Matching
WebFetch    - URLs abrufen
WebSearch   - Web-Suche
Task        - Subagent starten
Skill       - Skill aufrufen
```

### 3.6 Built-in Subagents

| Subagent | Modell | Tools | Zweck |
|----------|--------|-------|-------|
| **Explore** | Haiku | Read-only (Glob, Grep, Read, Bash read-only) | Codebase durchsuchen |
| **Plan** | Sonnet | Read, Glob, Grep, Bash | Research für Plan Mode |
| **General-Purpose** | Sonnet | Alle | Komplexe Multi-Step Tasks |

### 3.7 CLI-Definition von Agents

```bash
claude --agents '{
  "code-reviewer": {
    "description": "Reviews code for quality",
    "prompt": "You are a senior code reviewer...",
    "tools": ["Read", "Grep", "Glob", "Bash"],
    "model": "sonnet"
  }
}'
```

---

## 4. Agent Skills

### 4.1 Konzept

Skills sind modulare Fähigkeiten bestehend aus:
- `SKILL.md` mit Anweisungen
- Optionale unterstützende Dateien (Scripts, Templates, etc.)

**Model-invoked:** Claude entscheidet automatisch wann ein Skill aktiviert wird.

### 4.2 Speicherorte

| Typ | Pfad | Scope |
|-----|------|-------|
| **Project** | `.claude/skills/` | Aktuelles Projekt |
| **User** | `~/.claude/skills/` | Alle Projekte |
| **Plugin** | `plugin/skills/` | Via Plugin |

### 4.3 SKILL.md Format

```yaml
---
name: skill-name
description: |
  Was der Skill tut UND wann er verwendet werden soll.
  Trigger-Keywords: excel, spreadsheet, .xlsx
allowed-tools: Read, Grep, Glob
disable-model-invocation: false
user-invocable: false
context: inline
---

# Skill Name

## Instructions
Klare Anweisungen...

## Examples
Konkrete Beispiele...
```

### 4.4 Frontmatter-Felder

| Feld | Default | Beschreibung |
|------|---------|--------------|
| `name` | Dateiname | max 64 chars, lowercase, hyphens |
| `description` | - | max 1024 chars, KRITISCH für Discovery |
| `allowed-tools` | Alle | Tool-Einschränkung |
| `disable-model-invocation` | false | Skill nur manuell aufrufbar |
| `user-invocable` | false | User kann Skill direkt aufrufen |
| `context` | inline | `inline` oder `fork` |

### 4.5 Character Budget

Skills haben ein Budget von **15,000 Zeichen** (SLASH_COMMAND_TOOL_CHAR_BUDGET).
- SKILL.md zählt vollständig
- Referenced Files werden nur bei Bedarf geladen (Progressive Disclosure)

---

## 5. Hooks - Event-basierte Automatisierung

### 5.1 Konzept

Hooks sind Shell-Commands die bei bestimmten Events automatisch ausgeführt werden. Sie bieten **deterministische Kontrolle** über Claude's Verhalten.

**Wichtig:** Hooks laufen automatisch im Agent-Loop mit deinen Credentials. Nur vertrauenswürdige Commands verwenden!

### 5.2 Hook Events

| Event | Wann | Use Case |
|-------|------|----------|
| `PreToolUse` | Vor Tool-Ausführung | Validation, Blocking |
| `PermissionRequest` | Bei Permission-Dialog | Auto-Allow/Deny |
| `PostToolUse` | Nach Tool-Ausführung | Formatting, Logging |
| `UserPromptSubmit` | Bei User-Prompt | Pre-Processing, Validation |
| `Notification` | Bei Notifications | Custom Alerts |
| `Stop` | Claude fertig | Completion-Check |
| `SubagentStop` | Subagent fertig | Task-Validation |
| `PreCompact` | Vor Komprimierung | Context-Save |
| `SessionStart` | Session beginnt | Context laden, Dependencies |
| `SessionEnd` | Session endet | Cleanup |

### 5.3 Hook Konfiguration

```json
// ~/.claude/settings.json oder .claude/settings.json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "npx prettier --write \"$(jq -r '.tool_input.file_path')\""
          }
        ]
      }
    ]
  }
}
```

### 5.4 Matcher-Syntax

| Pattern | Beschreibung |
|---------|--------------|
| `*` oder `""` | Alle Tools matchen |
| `Bash` | Exakter Match |
| `Edit\|Write` | Regex OR |
| `Notebook.*` | Regex Prefix |

### 5.5 Hook Types

**Command Hook:**
```json
{
  "type": "command",
  "command": "/path/to/script.sh",
  "timeout": 60
}
```

**Prompt Hook (LLM-basiert):**
```json
{
  "type": "prompt",
  "prompt": "Evaluate if Claude should stop: $ARGUMENTS",
  "timeout": 30
}
```

### 5.6 Hook Input/Output

**Input via stdin (JSON):**
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/current/directory",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/path/to/file.txt",
    "content": "file content"
  }
}
```

**Output via Exit Code:**
- `0`: Success (stdout optional)
- `2`: Blocking Error (stderr wird Claude gezeigt)
- Andere: Non-blocking Error

**JSON Output (optional):**
```json
{
  "decision": "block",
  "reason": "Explanation for blocking",
  "continue": false,
  "stopReason": "Message shown to user"
}
```

### 5.7 Praktische Hook-Beispiele

**Auto-Formatting nach File-Edit:**
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{
          "type": "command",
          "command": "jq -r '.tool_input.file_path' | { read f; [[ $f == *.ts ]] && npx prettier --write \"$f\"; }"
        }]
      }
    ]
  }
}
```

**File Protection Hook:**
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{
          "type": "command",
          "command": "python3 -c \"import json,sys;d=json.load(sys.stdin);p=d.get('tool_input',{}).get('file_path','');sys.exit(2 if any(x in p for x in ['.env','package-lock.json','.git/']) else 0)\""
        }]
      }
    ]
  }
}
```

**SessionStart Environment Setup:**
```bash
#!/bin/bash
# Hook-Script für SessionStart

# Dependencies installieren
npm install 2>/dev/null

# Environment Variables setzen
if [ -n "$CLAUDE_ENV_FILE" ]; then
  echo 'export NODE_ENV=development' >> "$CLAUDE_ENV_FILE"
fi

exit 0
```

### 5.8 Hook-Management

```bash
# Hooks konfigurieren
/hooks

# Hooks verifizieren
# In settings.json prüfen

# Debugging
claude --debug "hooks"
```

---

## 6. Plugins

### 6.1 Konzept

Plugins erweitern Claude Code mit:
- Custom Commands
- Custom Agents
- Skills
- Hooks
- MCP Servers

### 6.2 Plugin-Struktur

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json          # Plugin Metadata
├── commands/                # Custom Slash Commands
│   └── hello.md
├── agents/                  # Custom Agents
│   └── helper.md
├── skills/                  # Agent Skills
│   └── my-skill/
│       └── SKILL.md
└── hooks/                   # Event Handlers
    └── hooks.json
```

### 6.3 plugin.json

```json
{
  "name": "my-plugin",
  "description": "Plugin-Beschreibung",
  "version": "1.0.0",
  "author": {
    "name": "Author Name"
  }
}
```

### 6.4 Plugin-Management

```bash
# Marketplace hinzufügen
/plugin marketplace add org/claude-plugins

# Plugin installieren
/plugin install formatter@org

# Plugin aktivieren/deaktivieren
/plugin enable plugin-name@marketplace
/plugin disable plugin-name@marketplace

# Plugin entfernen
/plugin uninstall plugin-name@marketplace
```

### 6.5 Team Plugin Workflow

In `.claude/settings.json`:
```json
{
  "plugins": {
    "marketplaces": ["./plugins-marketplace"],
    "installed": ["linter@team", "formatter@team"]
  }
}
```

---

## 7. Headless Mode

### 7.1 Konzept

Headless Mode ermöglicht **programmatische Nutzung** von Claude Code ohne interaktive UI.

### 7.2 Basic Usage

```bash
# Einfacher Query
claude -p "Explain this file" --allowedTools "Read"

# Mit JSON Output
claude -p "Generate code" --output-format json

# Mit Tool-Einschränkung
claude -p "Stage commits" --allowedTools "Bash,Read" --permission-mode acceptEdits
```

### 7.3 Output Formate

**Text (default):**
```bash
claude -p "Explain file"
# Output: Plain text response
```

**JSON:**
```bash
claude -p "Query" --output-format json
```
```json
{
  "type": "result",
  "subtype": "success",
  "total_cost_usd": 0.003,
  "is_error": false,
  "duration_ms": 1234,
  "result": "Response text",
  "session_id": "abc123"
}
```

**Streaming JSON:**
```bash
claude -p "Build app" --output-format stream-json
```

### 7.4 Multi-Turn Conversations

```bash
# Continue most recent
claude --continue "Now refactor this"

# Resume specific session
claude --resume abc123 "Update tests"

# Resume in non-interactive mode
claude --resume abc123 "Fix linting" --no-interactive
```

### 7.5 Praktische Beispiele

**SRE Incident Response:**
```bash
#!/bin/bash
investigate_incident() {
    claude -p "Incident: $1 (Severity: $2)" \
      --append-system-prompt "You are an SRE expert." \
      --output-format json \
      --allowedTools "Bash,Read,WebSearch"
}
investigate_incident "API 500 errors" "high"
```

**Automated Security Review:**
```bash
audit_pr() {
    gh pr diff "$1" | claude -p \
      --append-system-prompt "Review this PR for security issues." \
      --output-format json \
      --allowedTools "Read,Grep,WebSearch"
}
audit_pr 123 > security-report.json
```

**Multi-Turn Legal Assistant:**
```bash
session=$(claude -p "Start legal review" --output-format json | jq -r '.session_id')
claude -p --resume "$session" "Review contract.pdf for liability"
claude -p --resume "$session" "Check GDPR compliance"
claude -p --resume "$session" "Generate risk summary"
```

---

## 8. Model Context Protocol (MCP)

### 8.1 Konzept

MCP ermöglicht Verbindung zu externen Tools, Datenbanken und APIs.

### 8.2 MCP Server hinzufügen

**HTTP Server (empfohlen):**
```bash
claude mcp add --transport http notion https://mcp.notion.com/mcp
```

**SSE Server:**
```bash
claude mcp add --transport sse asana https://mcp.asana.com/sse
```

**Stdio Server (lokal):**
```bash
claude mcp add --transport stdio airtable --env AIRTABLE_API_KEY=KEY \
  -- npx -y airtable-mcp-server
```

### 8.3 MCP Scopes

| Scope | Pfad | Beschreibung |
|-------|------|--------------|
| `local` | `~/.claude.json` (per project) | Privat, nur dieses Projekt |
| `project` | `.mcp.json` | Team-shared, git-committed |
| `user` | `~/.claude.json` | Privat, alle Projekte |

### 8.4 MCP-Management

```bash
# Alle Server auflisten
claude mcp list

# Details anzeigen
claude mcp get github

# Server entfernen
claude mcp remove github

# Status prüfen (in Claude Code)
/mcp
```

### 8.5 Praktische MCP-Beispiele

**GitHub für Code Reviews:**
```bash
claude mcp add --transport http github https://api.githubcopilot.com/mcp/
# Dann:
> "Review PR #456 and suggest improvements"
```

**PostgreSQL Database:**
```bash
claude mcp add --transport stdio db -- npx -y @bytebase/dbhub \
  --dsn "postgresql://user:pass@host:5432/db"
# Dann:
> "What's our total revenue this month?"
```

**Sentry Error Monitoring:**
```bash
claude mcp add --transport http sentry https://mcp.sentry.dev/mcp
# Dann:
> "What are the most common errors in the last 24 hours?"
```

### 8.6 MCP Resources & Prompts

**Resources referenzieren:**
```
> Analyze @github:issue://123
> Review @docs:file://api/authentication
```

**Prompts als Commands:**
```
/mcp__github__list_prs
/mcp__jira__create_issue "Bug title" high
```

---

## 9. Output Styles

### 9.1 Konzept

Output Styles modifizieren Claude's System-Prompt für verschiedene Use Cases.

### 9.2 Built-in Styles

| Style | Beschreibung |
|-------|--------------|
| **Default** | Standard Software Engineering |
| **Explanatory** | Liefert "Insights" während der Arbeit |
| **Learning** | Kollaborativ, fügt `TODO(human)` Marker ein |

### 9.3 Style wechseln

```bash
# Via Menu
/output-style

# Direkt wechseln
/output-style explanatory
```

### 9.4 Custom Output Style

```yaml
---
name: My Custom Style
description: A brief description for the UI
keep-coding-instructions: false
---

# Custom Style Instructions

You are an interactive CLI tool that helps users...

## Specific Behaviors
[Define behaviors...]
```

**Speicherorte:**
- `~/.claude/output-styles/` (User)
- `.claude/output-styles/` (Project)

---

## 10. CLI Reference

### 10.1 Commands

| Command | Beschreibung |
|---------|--------------|
| `claude` | Interaktive Session starten |
| `claude "query"` | Session mit Initial-Prompt |
| `claude -p "query"` | Headless Query |
| `cat file \| claude -p` | Piped Input |
| `claude -c` | Letzte Session fortsetzen |
| `claude -r "id"` | Session by ID fortsetzen |
| `claude update` | Update to latest |
| `claude mcp` | MCP Server konfigurieren |

### 10.2 Wichtige Flags

| Flag | Beschreibung |
|------|--------------|
| `--print`, `-p` | Non-interactive Mode |
| `--continue`, `-c` | Letzte Session fortsetzen |
| `--resume`, `-r` | Session by ID |
| `--permission-mode` | default/plan/acceptEdits/bypassPermissions |
| `--output-format` | text/json/stream-json |
| `--model` | sonnet/opus/Model-Name |
| `--allowedTools` | Erlaubte Tools |
| `--disallowedTools` | Verbotene Tools |
| `--append-system-prompt` | Zum System-Prompt hinzufügen |
| `--system-prompt` | System-Prompt ersetzen |
| `--mcp-config` | MCP-Config laden |
| `--agents` | Agents via JSON definieren |
| `--max-turns` | Max Agent-Turns |
| `--verbose` | Verbose Output |
| `--debug` | Debug Mode |

### 10.3 System Prompt Flags

| Flag | Verhalten | Modes |
|------|-----------|-------|
| `--system-prompt` | **Ersetzt** kompletten Prompt | Interactive + Print |
| `--system-prompt-file` | **Ersetzt** mit Datei-Inhalt | Print only |
| `--append-system-prompt` | **Ergänzt** Default-Prompt | Interactive + Print |

---

## 11. Permission Modes

| Mode | Beschreibung | Use Case |
|------|--------------|----------|
| `default` | Fragt bei Änderungen | Normal Development |
| `acceptEdits` | Auto-Accept für Edits | Vertrauenswürdige Änderungen |
| `bypassPermissions` | Keine Checks | Automation (Vorsicht!) |
| `plan` | Read-Only | Analyse & Planung |

### Mode wechseln

```bash
# Beim Start
claude --permission-mode plan

# Während Session
# Shift+Tab rotiert: default → acceptEdits → plan → default
```

---

## 12. Settings

### 12.1 Settings-Hierarchie

| Priorität | Pfad | Beschreibung |
|-----------|------|--------------|
| 1 (höchste) | Enterprise Managed | MDM/GPO |
| 2 | CLI Arguments | Session-spezifisch |
| 3 | `.claude/settings.local.json` | Lokal (gitignore) |
| 4 | `.claude/settings.json` | Projekt (git) |
| 5 (niedrigste) | `~/.claude/settings.json` | User |

### 12.2 Settings-Schema

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": [
      "Bash(npm run lint)",
      "Bash(npm run test *)",
      "Read(~/.zshrc)"
    ],
    "deny": [
      "Bash(curl *)",
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)"
    ]
  },
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1"
  },
  "hooks": {
    "PostToolUse": [...]
  }
}
```

### 12.3 Permissions-Syntax

```
Tool(argument pattern)

# Beispiele:
Bash(npm run *)        # Alle npm run commands
Read(./.env)           # Spezifische Datei
Read(./secrets/**)     # Rekursiv
Skill(deploy *)        # Skill mit Prefix-Match
```

---

## 13. Best Practices

### 13.1 Für effektives Prompting

**Präzise sein:**
```
# Gut
"Fixe den Bug in src/auth/login.ts Zeile 42"

# Vage
"Fixe den Login-Bug"
```

**Kontext geben:**
```
# Gut
"Die checkout-flow ist kaputt für User mit abgelaufenen Karten.
Relevanter Code in src/payments/. Investigieren und fixen?"

# Schlecht
"Der Checkout funktioniert nicht"
```

### 13.2 Für Plan Mode

1. Research trennen von Implementation
2. Plan reviewen vor Ausführung
3. Bei Unsicherheit: Mehr planen
4. Kleine Schritte: Ein Feature nach dem anderen

### 13.3 Für Subagents

1. Fokussierte Description mit Trigger-Worten
2. Tool-Einschränkung auf Notwendiges
3. "MUST BE USED when..." für proaktive Aktivierung
4. Context-Isolation für komplexe Research

### 13.4 Für Hooks

1. Exit-Codes korrekt verwenden (0=OK, 2=Block)
2. Hooks in separaten Scripts testen
3. Timeout konfigurieren für langsame Hooks
4. Logging für Debugging hinzufügen

### 13.5 Für CLAUDE.md

1. Unter 500 Zeilen halten
2. Details auslagern und importieren
3. Regelmäßig reviewen
4. Compact Instructions für Persistenz

---

## 14. AutomationOne-spezifische Konfiguration

### 14.1 Empfohlene Projekt-Struktur

```
AutomationOne/
├── .claude/
│   ├── CLAUDE.md                    # Haupt-Router
│   │
│   ├── agents/                      # Debug-Agenten
│   │   ├── esp32-debug.md
│   │   ├── server-debug.md
│   │   ├── mqtt-debug.md
│   │   ├── meta-analyst.md
│   │   ├── db-inspector.md
│   │   └── system-control.md
│   │
│   ├── skills/                      # Entwickler-Workflows
│   │   ├── esp32-development/
│   │   ├── server-development/
│   │   └── hardware-test-workflow/
│   │
│   ├── reference/                   # Dokumentation
│   │   ├── api/
│   │   ├── errors/
│   │   ├── patterns/
│   │   └── testing/
│   │
│   └── reports/                     # Session-Reports
│       ├── current/
│       └── archive/
│
├── El Trabajante/                   # ESP32 Firmware
├── El Servador/                     # Python Server
└── El Frontend/                     # Vue Dashboard
```

### 14.2 Agent-Hierarchie

```
┌─────────────────────────────────────────────────────────────┐
│                    system-control                            │
│         (Briefing + Operations - einziger Einstieg)          │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  DEBUG AGENTS   │  │   DEV AGENTS    │  │   OPERATORS     │
│  (Read-Only)    │  │ (Implementieren)│  │  (Ausführen)    │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ esp32-debug     │  │ esp32-dev       │  │ system-control  │
│ server-debug    │  │ server-dev      │  │ db-inspector    │
│ mqtt-debug      │  │ mqtt-dev        │  │                 │
│ meta-analyst    │  │                 │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## 15. Troubleshooting

### 15.1 Extension Probleme

| Problem | Lösung |
|---------|--------|
| Extension installiert nicht | VS Code ≥1.98.0 prüfen |
| Claude antwortet nicht | Internet prüfen, neue Session |
| Sidebar erscheint nicht | Extension aktivieren, VS Code neustarten |

### 15.2 Hook Probleme

| Problem | Lösung |
|---------|--------|
| Hook läuft nicht | Exit-Code prüfen, Matcher testen |
| Hook blockiert alles | Exit-Code 2 nur bei echtem Block |
| Hook-Timeout | timeout erhöhen in Config |

### 15.3 MCP Probleme

| Problem | Lösung |
|---------|--------|
| Server nicht erreichbar | URL prüfen, `/mcp` für Status |
| Auth fehlgeschlagen | `/mcp` → Authenticate |
| Tools nicht sichtbar | Server neu verbinden |

### 15.4 Agent Probleme

| Problem | Lösung |
|---------|--------|
| Agent nicht gefunden | Pfad: `.claude/agents/name.md` |
| Agent nicht automatisch | Description spezifischer |
| Falscher Kontext | Neue Session starten |

---

## 16. Quick Reference

### Commands
```
/plan          - Plan Mode
/context       - Context-Nutzung
/clear         - Context leeren
/compact       - Context komprimieren
/memory        - CLAUDE.md bearbeiten
/agents        - Subagents verwalten
/hooks         - Hooks verwalten
/mcp           - MCP Server
/plugin        - Plugins
/output-style  - Output Style
/rename        - Session umbenennen
```

### Shortcuts
```
Shift+Tab (2x) - Plan Mode Toggle
Ctrl+G         - Plan bearbeiten
Ctrl+C         - Abbrechen
Ctrl+O         - Verbose Toggle
Ctrl+T         - Tasks anzeigen
Escape         - Sanft abbrechen
```

### Pfade
```
~/.claude/CLAUDE.md           - User Memory
~/.claude/agents/             - User Agents
~/.claude/skills/             - User Skills
~/.claude/settings.json       - User Settings
.claude/CLAUDE.md             - Project Memory
.claude/agents/               - Project Agents
.claude/skills/               - Project Skills
.claude/settings.json         - Project Settings
.claude/settings.local.json   - Local Settings
.mcp.json                     - Project MCP
CLAUDE.local.md               - Lokale Präferenzen
```

### Agent Frontmatter
```yaml
---
name: agent-name
description: Wann verwenden
tools: Read, Grep, Glob, Bash
model: sonnet
permissionMode: default
skills: skill1, skill2
---
```

### Skill Frontmatter
```yaml
---
name: skill-name
description: Was und wann
disable-model-invocation: false
allowed-tools: Read, Grep
context: inline
---
```

### Hook Config
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "script.sh"
      }]
    }]
  }
}
```

---

**Letzte Aktualisierung:** 2026-02-04
**Version:** 2.0 Complete
**Für:** AutomationOne KI-Agent System