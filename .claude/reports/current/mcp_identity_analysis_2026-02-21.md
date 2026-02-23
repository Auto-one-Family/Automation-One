# MCP Identity Analysis

**Datum:** 2026-02-21
**Analyst:** Claude Code Agent (VS Code)
**Auftrag:** Warum identifiziert sich Claude Desktop falsch? MCP-Konfigurationszustand dokumentieren.

---

## 1. Gefundene Configs

### 1.1 Claude Code CLI (`~/.claude.json`)

| Feld | Wert |
|------|------|
| **MCP-Server** | 3: `MCP_DOCKER` (gateway), `semantic-scholar` (SSE :8081), `zotero` (SSE :8082) |
| **OAuth Account** | Robin, Org `robin.herbig@web.de's Organization`, Subscription `max` |
| **Projekte** | 3 registriert: Auto-one, life, Home (~) |
| **Plugins** | 22 enabled, 1 disabled (`serena@claude-plugins-official: false`) |

**MCP_DOCKER Konfiguration (identisch in beiden Clients):**
```json
{
  "command": "docker",
  "args": ["mcp", "gateway", "run"],
  "env": {
    "LOCALAPPDATA": "C:\\Users\\PCUser\\AppData\\Local",
    "ProgramData": "C:\\ProgramData",
    "ProgramFiles": "C:\\Program Files"
  }
}
```

### 1.2 Claude Desktop (`%AppData%/Claude/claude_desktop_config.json`)

| Feld | Wert |
|------|------|
| **MCP-Server** | 1: `MCP_DOCKER` (gateway) - NUR der Docker Gateway |
| **Preferences** | `coworkScheduledTasksEnabled: false`, `sidebarMode: chat` |
| **Plugins** | Keine (kein Plugin-System in Claude Desktop) |
| **Projekt-Context** | Keiner. Kein CLAUDE.md-Loading, kein Workspace-Root |

**Kritischer Unterschied:** Claude Desktop hat KEINEN nativen Filesystem-Zugriff. Alles geht durch den Docker MCP Gateway.

### 1.3 Docker MCP Gateway (`docker mcp config read`)

**6 aktive MCP-Server im Gateway:**

| Server | OAuth | Config | Zugriffs-Scope |
|--------|-------|--------|----------------|
| `filesystem` | - | paths: Auto-one | NUR `/C/Users/PCUser/Documents/PlatformIO/Projects/Auto-one` |
| `git` | - | paths: Auto-one | NUR Auto-one Repo |
| `database-server` | - | `postgresql+asyncpg://postgres:postgres@host.docker.internal:5432/automationone` | 1 DB |
| `docker` | - | - | Docker CLI |
| `playwright` | - | - | Browser-Steuerung |
| `sequentialthinking` | - | - | Reasoning-Tool |

**Angeschlossene Clients (laut `docker mcp client ls`):**
- `claude-code`: disconnected (nutzt gateway nur bei explizitem MCP_DOCKER-Aufruf)
- `cursor`: no mcp configured
- `kiro`: no mcp configured
- `vscode`: disconnected

### 1.4 Projekt-Level (`.mcp.json`)

**5 MCP-Server definiert (NUR fuer Claude Code relevant):**
- `sequential-thinking` (npx, lokal)
- `playwright` (npx, lokal)
- `serena` (uvx, lokal)
- `semantic-scholar` (SSE :8081)
- `zotero` (SSE :8082)

**Wichtig:** Diese Server werden nur von Claude Code geladen, NICHT von Claude Desktop.

### 1.5 Technical Manager Workspace (`.technical-manager/`)

- Existiert, vollstaendig strukturiert (skills/, commands/, inbox/, config/)
- Header: `Instance: Claude Desktop (External, NOT in Docker)`
- Bekanntes Boot-Problem: TM laedt KEINE Dateien automatisch (kein CLAUDE.md-Mechanismus)
- 3 Skills definiert: infrastructure-status, ci-quality-gates, strategic-planning

---

## 2. Duplikate / Konflikte

### 2.1 MCP_DOCKER Gateway - Identische Konfiguration in BEIDEN Clients

```
Claude Code (.claude.json) ---+
                               +--> docker mcp gateway run (selber Gateway-Prozess)
Claude Desktop (config.json) -+
```

**Problem:** Beide Clients verbinden sich zum selben Docker MCP Gateway mit identischer Config. Der Gateway unterscheidet nicht, welcher Client verbunden ist. Es gibt kein Client-spezifisches Scoping.

### 2.2 Doppelte MCP-Server (Gateway vs. Projekt)

| Server | Im Docker Gateway | In .mcp.json (Claude Code) | Duplikat? |
|--------|-------------------|---------------------------|-----------|
| `filesystem` | Ja (Container) | Nein (nativ) | Nein - Claude Code nutzt eigenes Read/Write |
| `git` | Ja (Container) | Nein (nativ) | Nein - Claude Code nutzt eigenes Bash git |
| `playwright` | Ja (Container) | Ja (npx lokal) | **JA - Doppelt** |
| `sequentialthinking` | Ja (Container) | Ja (npx lokal) | **JA - Doppelt** |
| `database-server` | Ja (Container) | Nein | Nein |
| `docker` | Ja (Container) | Nein | Nein |
| `serena` | Nein | Ja (uvx lokal) | Nein |
| `semantic-scholar` | Nein | Ja (SSE) | Nein, aber SSE auch in .claude.json |
| `zotero` | Nein | Ja (SSE) | Nein, aber SSE auch in .claude.json |

**2 echte Duplikate:** `playwright` und `sequentialthinking` existieren sowohl im Docker Gateway als auch als lokale npx-Server in `.mcp.json`.

### 2.3 semantic-scholar & zotero - Dreifach-Referenz

Diese SSE-Server sind definiert in:
1. `.claude.json` (global, Claude Code)
2. `.mcp.json` (projekt-level, Claude Code)
3. NICHT im Docker Gateway (Claude Desktop hat keinen Zugriff darauf)

---

## 3. OAuth-Status

### 3.1 Haupt-OAuth (Claude AI)

| Feld | Status |
|------|--------|
| **accessToken** | Vorhanden (sk-ant-oat01-...) |
| **refreshToken** | Vorhanden (sk-ant-ort01-...) |
| **expiresAt** | 1771699909695 (aktiv) |
| **Scopes** | `user:inference`, `user:mcp_servers`, `user:profile`, `user:sessions:claude_code` |
| **Subscription** | `max` |
| **Rate Limit** | `default_claude_max_20x` |

### 3.2 Plugin-OAuth (alle LEER)

| Plugin | accessToken | expiresAt | Status |
|--------|-------------|-----------|--------|
| `atlassian` | `""` | 0 | Nicht authentifiziert |
| `figma` | `""` | 0 | Nicht authentifiziert |
| `supabase` | `""` | 0 | Nicht authentifiziert |
| `asana` | `""` | 0 | Nicht authentifiziert |
| `sentry` | `""` | 0 | Nicht authentifiziert |

**Alle 5 Plugin-OAuth-Tokens sind leer.** Diese Plugins sind enabled aber nicht verbunden. `clientId` und teilweise `clientSecret` sind gesetzt, aber nie ein Token abgeholt.

### 3.3 Extra Usage

`cachedExtraUsageDisabledReason: "out_of_credits"` - Extra Usage ist aufgebraucht.

---

## 4. Vermutliche Ursache des Identity-Problems

### Kernbefund: Claude Desktop sieht die Welt ausschliesslich durch Docker-Container

```
Claude Desktop
  |
  +-- MCP_DOCKER Gateway
        |
        +-- filesystem (Docker Container)
        |     Sieht NUR: /C/Users/PCUser/Documents/PlatformIO/Projects/Auto-one
        |     Pfadformat: Linux (/C/Users/...) statt Windows (C:\Users\...)
        |
        +-- git (Docker Container)
        |     Sieht NUR: Auto-one Repo
        |
        +-- database-server (Docker Container)
        |     Verbindet via host.docker.internal
        |
        +-- docker (Docker Container)
        +-- playwright (Docker Container)
        +-- sequentialthinking (Docker Container)
```

### Die 4 Signale die zur Fehlidentifikation fuehren:

**Signal 1: Linux-Pfade statt Windows-Pfade**
Der `filesystem` MCP-Server laeuft in einem Linux-Container und gibt Pfade im Format `/C/Users/PCUser/...` zurueck statt `C:\Users\PCUser\...`. Wenn Claude Desktop den Dateisystem-Kontext liest, sieht es Linux-Pfade und schliesst darauf, in einer Linux-Umgebung zu laufen.

**Signal 2: Extrem eingeschraenkter Dateisystem-Zugriff**
`list_allowed_directories` gibt genau 1 Verzeichnis zurueck. Claude Desktop kann NICHTS ausserhalb von Auto-one sehen - kein Home-Verzeichnis, keine System-Dateien, keine andere Projekte. Das fuehlt sich an wie ein Sandbox-Container, nicht wie ein Desktop-Programm.

**Signal 3: Kein Projekt-Context / Kein CLAUDE.md Loading**
Claude Code bekommt automatisch CLAUDE.md, Workspace-Root, Git-Status und Environment-Informationen injiziert. Claude Desktop bekommt NICHTS davon. Es hat keine System-Prompt-Informationen darueber, wo es laeuft oder was seine Rolle ist.

**Signal 4: Keine nativen Tools**
Claude Code hat native Tools (Read, Write, Edit, Bash, Glob, Grep). Claude Desktop hat NUR die MCP-Tools aus dem Docker Gateway. Es kann nicht `ls` ausfuehren, nicht `git status` nativ aufrufen, nicht direkt Dateien lesen. Alles geht ueber Container-APIs.

### Zusammenspiel der Signale

```
Signal 1 (Linux-Pfade)          --> "Ich laufe in Linux"
Signal 2 (1 Verzeichnis)        --> "Ich bin isoliert/sandboxed"
Signal 3 (Kein Context)         --> "Ich habe keine lokale Identitaet"
Signal 4 (Keine nativen Tools)  --> "Ich habe keinen direkten Systemzugriff"

Summe: "Ich muss eine Web-Instanz sein (claude.ai)"
```

Claude Desktop hat keine internen Metadaten die sagen "Du bist Claude Desktop". Ohne expliziten System-Prompt der die Identitaet klaert, zieht Claude aus den verfuegbaren Signalen den falschen Schluss.

### Warum passiert das NICHT bei Claude Code?

Claude Code injiziert aktiv seine Identitaet:
```
"You are Claude Code, Anthropic's official CLI for Claude"
"Platform: win32"
"Shell: bash"
"Primary working directory: c:\Users\PCUser\..."
```

Diese expliziten System-Prompt-Informationen ueberschreiben jede Schlussfolgerung aus Tool-Outputs. Claude Desktop hat diesen Mechanismus nicht.

---

## 5. Empfehlungen (ohne Eingriff)

### 5.1 Identity-Problem loesen

1. **Claude Desktop Project Custom Instructions nutzen** - In den Claude Desktop Settings kann man "Custom Instructions" setzen. Ein einfacher Satz wie:
   ```
   Du bist Claude Desktop, eine native Desktop-App auf Robin's Windows 11 PC.
   Du hast Zugriff auf MCP-Tools die in Docker-Containern laufen.
   Die Linux-Pfade (/C/...) sind Container-interne Pfade, die Windows-Pfade
   (C:\...) repraesentieren.
   ```
   Wuerde das Problem sofort loesen.

2. **Project Instructions in Claude Desktop** - Claude Desktop unterstuetzt "Project Knowledge" (Dateien die in den Context geladen werden). Die `TECHNICAL_MANAGER.md` koennte dort hinterlegt werden, damit der TM seine Identitaet kennt.

### 5.2 Duplikate bereinigen

3. **Playwright/SequentialThinking Duplikate** - Entweder aus dem Docker Gateway ODER aus `.mcp.json` entfernen. Empfehlung: Im Gateway belassen (dann auch fuer Claude Desktop verfuegbar), aus `.mcp.json` entfernen (Claude Code hat sie ueber den Gateway).

4. **semantic-scholar/zotero fuer Claude Desktop** - Aktuell hat Claude Desktop keinen Zugang zu diesen SSE-Servern. Falls gewuenscht: Entweder als Docker-Container in den Gateway aufnehmen, oder direkt in `claude_desktop_config.json` als SSE-Server eintragen.

### 5.3 OAuth-Tokens

5. **5 leere Plugin-OAuth-Tokens** - Atlassian, Figma, Supabase, Asana, Sentry sind enabled aber nie authentifiziert. Entweder authentifizieren oder die Plugins deaktivieren um unnoetige Auth-Prompts zu vermeiden.

### 5.4 Gateway-Scope erweitern (optional)

6. **filesystem Zugriff erweitern** - Falls Claude Desktop/TM auch `.technical-manager/` oder andere Verzeichnisse sehen soll die ausserhalb von Auto-one liegen, muesste der Gateway-Config ein weiterer Pfad hinzugefuegt werden.

---

## 6. Zusammenfassung

| Aspekt | Status |
|--------|--------|
| **Kernproblem** | Claude Desktop erhaelt keine Identitaets-Metadaten und schliesst aus Container-Signalen (Linux-Pfade, Sandbox) falsch auf "claude.ai Web" |
| **Loesung** | Custom Instructions oder Project Knowledge in Claude Desktop |
| **Duplikate** | 2 (playwright, sequentialthinking) zwischen Gateway und .mcp.json |
| **OAuth leer** | 5 Plugins (atlassian, figma, supabase, asana, sentry) |
| **Gateway-Mount** | Korrekt, aber nur Auto-one Verzeichnis |
| **Risiko** | Keines. Funktional arbeitet alles, nur die Selbstidentifikation ist falsch |

---

*Report erstellt ohne Eingriff in bestehende Konfigurationen.*
