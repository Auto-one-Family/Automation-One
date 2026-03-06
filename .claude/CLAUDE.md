# AutomationOne - KI-Agent Router

> **Projekt:** IoT-Framework für Gewächshausautomation
> **Prinzip:** Server-Zentrisch. ESP32 = dumme Agenten. ALLE Logik auf Server.
```
El Frontend (Vue 3) ←HTTP/WS→ El Servador (FastAPI) ←MQTT→ El Trabajante (ESP32)
```

---

## Agent-Orchestrierung (UNVERÄNDERLICH)

| Modus | Verhalten | Trigger |
|-------|-----------|---------|
| **Sequenziell** (Default) | Agents/Skills NACHEINANDER. Erst wenn Agent 1 komplett fertig → Agent 2 startet | Standard. Immer, außer User sagt "zusammen" |
| **Parallel** | Agents/Skills GLEICHZEITIG starten (System-Default parallel) | User sagt explizit "zusammen" |

**Regeln:**
1. **NACHEINANDER ist Default.** Bei mehreren Agents/Skills in einer Nachricht: Task-Aufrufe EINZELN absenden, WARTEN bis komplett fertig, dann nächsten starten. KEINE parallelen Task-Aufrufe im selben Message-Block
2. **OHNE PAUSE durcharbeiten.** NIEMALS "Soll ich fortfahren?", "Möchtest du dass ich weitermache?" oder ähnliche Unterbrechungen. Jeder Agent arbeitet seinen kompletten Task ab bis er fertig ist
3. **"zusammen" = parallel.** NUR wenn User explizit "zusammen" schreibt: Mehrere Task-Aufrufe im selben Message-Block starten. Output-Pfade VOR Start festlegen. Selbständig analysieren ob alle Agents fertig sind. Ohne Pause durcharbeiten bis alle komplett
4. **Plan Mode:** Parallel erlaubt, ohne Pause arbeiten

---

## Skills (Entwicklung)

| Trigger | Skill |
|---------|-------|
| ESP32, C++, Sensor, Aktor, GPIO, PlatformIO, Wokwi | `esp32-development` |
| Python, FastAPI, MQTT-Handler, Database, API | `server-development` |
| Vue 3, TypeScript, Pinia, WebSocket, Dashboard | `frontend-development` |
| MQTT Topic, Publisher, Subscriber, Payload-Schema, QoS | `mqtt-development` |
| Reports sammeln, konsolidieren, archivieren, beliebiger Ordner, TM-Übergabe | `collect-reports` |
| /do, Plan ausführen, Implementierung starten | `do` |
| /updatedocs, Docs aktualisieren, Doku-Update nach Änderungen | `updatedocs` |
| /test, Test-Failures, CI rot, pytest/Vitest/Playwright | `test-log-analyst` |
| /hardware-test, hw-test, Sensor testen, Hardware pruefen, Hardware-Test | `hardware-test` |
| Agent-Flow prüfen, IST-SOLL, Agent-Korrektur | `agent-manager` |
| Git-Commit vorbereiten, Changes analysieren | `git-commit` |
| /verify-plan, TM-Plan Reality-Check | `verify-plan` |
| KI-Audit, Bereich auf KI-Fehler prüfen, Qualitätsaudit | `ki-audit` |

## Dev-Agenten (Pattern-konforme Implementierung)

| Agent | Trigger-Keywords |
|-------|------------------|
| `esp32-dev` | Sensor hinzufuegen, Driver erstellen, NVS Key, GPIO, implementieren ESP32 |
| `server-dev` | Handler erstellen, Repository erweitern, Service, Schema, implementieren Server |
| `mqtt-dev` | Topic hinzufuegen, Publisher, Subscriber, Payload Schema, MQTT implementieren |
| `frontend-dev` | Komponente, Composable, Store, View, WebSocket, Vue, implementieren Frontend |

## System-Operator & Session-Einstieg (konsolidiert)

| Agent | Trigger-Keywords | Rolle |
|-------|------------------|-------|
| `system-control` | Session-Start, Briefing, Projektstatus, "session gestartet", "was ist der Stand", Start, Stop, Build, Flash, Commands | EINZIGER Einstieg: Briefing ODER Operationen. Erstellt SESSION_BRIEFING.md oder führt Operationen aus |
| `db-inspector` | Schema, Query, Migration, Alembic | Datenbank-Inspektion & Cleanup |

**system-control Pfad:** `.claude/agents/system-control.md`
**Briefing-Output:** `.claude/reports/current/SESSION_BRIEFING.md`

**Workflow:**
1. "session gestartet" → system-control (Briefing-Modus) erstellt SESSION_BRIEFING.md
2. Danach: system-control (Ops-Modus) führt Operationen aus, generiert Logs
3. Debug-Agents analysieren Logs

## Debug-Agenten (Log-Analyse)

| Agent | Trigger-Keywords |
|-------|------------------|
| `esp32-debug` | Serial, Boot, NVS, GPIO-Fehler, Watchdog, Crash |
| `server-debug` | FastAPI, Handler, Error 5xxx, god_kaiser.log |
| `mqtt-debug` | Topic, Payload, QoS, Publish, Subscribe, Broker |
| `frontend-debug` | Build-Error, TypeScript, Vite, WebSocket, Pinia, Vue-Component |

## Meta-Analyse (Cross-Report)

| Agent | Trigger-Keywords |
|-------|------------------|
| `meta-analyst` | Cross-Report-Vergleich, Widersprüche, Problemketten (LETZTE Analyse-Instanz) |

## Figma MCP Integration Rules

### Required Flow (bei jeder Figma-Implementierung)

1. `get_design_context` fuer den Figma-Node ausfuehren
2. Falls Response zu gross: `get_metadata` fuer Node-Map, dann gezielt `get_design_context`
3. `get_screenshot` fuer visuelle Referenz
4. Erst DANACH Assets herunterladen und implementieren
5. Figma-Output (React + Tailwind) in Auto-One Konventionen uebersetzen
6. Visuell gegen Figma validieren vor Abschluss

### Design Token Mapping (Figma → Auto-One)

```
IMPORTANT: Figma-Output kommt als React + Tailwind. Uebersetzen nach:
- Framework:    React → Vue 3 (Script Setup + Composition API)
- Styling:      Tailwind-Klassen beibehalten, CSS Variables ergaenzen
- Farben:       NIEMALS hex hardcoden → var(--color-*) aus styles/tokens.css
- Spacing:      4px Grid: var(--space-1) bis var(--space-12)
- Radius:       var(--radius-sm|md|lg|full) - nur 4 Stufen
- Elevation:    var(--elevation-flat|raised|floating) - nur 3 Stufen
- Typography:   var(--text-xs|sm|base|lg|xl|2xl|display), Font: Outfit
- Glass:        .glass-panel, .glass-overlay, .iridescent-border aus glass.css
- Transitions:  var(--transition-fast|base|slow)
- Z-Index:      var(--z-*) Skala aus tokens.css
```

### Component Rules

```
- IMPORTANT: Zuerst shared/design/ pruefen → BaseBadge, BaseButton, BaseCard,
  BaseInput, BaseModal, BaseSelect, BaseSkeleton, BaseSpinner, BaseToggle
- Layout: AppShell, Sidebar, TopBar aus shared/design/layout/
- Patterns: ConfirmDialog, ContextMenu, EmptyState, ErrorState, ToastContainer
- Neue Komponenten in src/components/{bereich}/ ablegen
- IMMER <script setup lang="ts"> + defineProps<Props>() + defineEmits
- Icons: lucide-vue-next (KEIN neues Icon-Paket installieren)
- Imports: @/ Alias (KEINE relativen ../.. Pfade)
- Tailwind-Klassen: dark-* Palette aus tailwind.config.js
- Dark Theme ONLY - keine Light-Mode Styles
- Cleanup in onUnmounted() fuer Subscriptions/Listeners
```

### Asset Rules

```
- IMPORTANT: Figma MCP localhost-URLs direkt verwenden (KEINE Platzhalter)
- IMPORTANT: KEINE neuen Icon-Pakete installieren - nur lucide-vue-next
- Assets nach El Frontend/public/assets/ speichern
- SVGs als Vue-Komponenten wenn interaktiv, sonst als Datei
```

### Tailwind Config Referenz

```
Farben:     dark-50..950, iridescent-1..4, accent, success, warning, danger, info, mock, real, esp-*
Fonts:      font-sans (Outfit), font-mono (JetBrains Mono)
Font-Sizes: text-xs..text-display (11px..32px, base=14px)
Shadows:    shadow-glass, shadow-card-hover, shadow-iridescent, shadow-raised, shadow-floating
Animations: animate-shimmer, animate-fade-in, animate-slide-up, animate-scale-in, animate-breathe
Radius:     rounded-sm(6), rounded-md(10), rounded-lg(16)
Screens:    3xl(1600px), 4xl(1920px)
```

---

## Loki-Debug (Agent-Nutzung)

Agents koennen Loki-Logs per CLI oder API abfragen:

| Befehl | Was | Wann |
|--------|-----|------|
| `make loki-errors` | Fehler der letzten 5 Minuten | Erster Schritt bei jedem Debug |
| `make loki-trace CID=<id>` | Correlation-ID verfolgen | Datenfluss-Analyse ESP→Server→Frontend |
| `make loki-esp ESP=<id>` | Alle Logs eines ESPs | ESP-spezifisches Debugging |
| `make loki-health` | Loki-Status pruefen | Stack-Check, aktive Streams |

**Voraussetzung:** `make monitor-up` (Loki auf localhost:3100). Ohne Monitoring-Stack: Loki nicht erreichbar.

**Windows:** Makefile nutzt automatisch `scripts/loki-query.ps1` (PowerShell). Direkt: `powershell -ExecutionPolicy Bypass -File scripts/loki-query.ps1 errors 5`
**Linux/Mac:** `scripts/loki-query.sh` (Bash)

**Queries-Referenz:** `docs/debugging/logql-queries.md` (10 Queries fuer die haeufigsten Debug-Situationen)
**Debug-Workflow:** `docs/debugging/debug-workflow.md` (10 Szenarien mit Root-Cause-Matrix)
**Grafana Dashboard:** "Debug Console" (Error-Rate, Log-Streams, Correlation-Trace)

---

## Referenzen

| Pfad | Inhalt |
|------|--------|
| `reference/api/` | MQTT_TOPICS, REST_ENDPOINTS, WEBSOCKET_EVENTS |
| `reference/errors/` | ERROR_CODES (ESP32: 1000-4999, Server: 5000-5999) |
| `reference/patterns/` | COMMUNICATION_FLOWS, ARCHITECTURE_DEPENDENCIES, vs_claude_best_practice |
| `reference/debugging/` | LOG_LOCATIONS, CI_PIPELINE, ACCESS_LIMITATIONS |
| `reference/testing/` | agent_profiles, flow_reference, TEST_WORKFLOW, SYSTEM_OPERATIONS_REFERENCE |
| `reference/security/` | PRODUCTION_CHECKLIST |
| `docs/debugging/` | logql-queries, debug-workflow |
| `El Frontend/src/styles/` | tokens.css (Design Tokens), glass.css, animations.css |
| `El Frontend/src/shared/design/` | Primitives (10), Layout (3), Patterns (5) |
| `El Frontend/tailwind.config.js` | Tailwind Theme Extension |

## Regeln

1. **Server-Zentrisch** → Logic NIEMALS auf ESP32
2. **Patterns erweitern** → Bestehenden Code analysieren
3. **Build verifizieren** → `pio run` / `pytest` vor Abschluss

## Workflow

```
SKILL → DEV-AGENT → ANALYSE → PLAN → IMPLEMENTIEREN → VERIFIZIEREN
```

---

## TM-Workflow (Technical Manager Integration)

Der Technical Manager (TM) ist eine Claude Desktop-Instanz – hat **KEINEN direkten Projektzugriff**. Der User ist die einzige Schnittstelle (Copy/Paste zwischen VS Code und Claude Desktop).

**TM-Workspace:** `.technical-manager/` (Router: `TECHNICAL_MANAGER.md`, 3 Skills, Config, Archive)
**TM-Skills:** infrastructure-status, ci-quality-gates, strategic-planning
**Kommunikation:** TM schreibt nach `commands/pending/`, VS Code Reports nach `inbox/agent-reports/`

### Test-Flow (Analyse & Debugging)

```
1. User führt `scripts/debug/start_session.sh` aus → `logs/current/STATUS.md` wird generiert
2. User schreibt "Session gestartet" + Hardware-Info → system-control (Briefing-Modus) aktiviert sich
3. system-control liest STATUS.md, erstellt SESSION_BRIEFING.md
4. User kopiert SESSION_BRIEFING.md zum Technical Manager (Claude Desktop, extern)
5. TM analysiert Briefing, formuliert Agent-Befehle (einzeln pro Agent)
6. User führt system-control ZUERST aus → generiert Log-Daten, Operations-Bericht
7. User führt Debug-Agents EINZELN aus (esp32-debug, server-debug, mqtt-debug, frontend-debug) → jeder schreibt eigenen Report
8. User ruft /collect-reports auf → CONSOLIDATED_REPORT.md
9. User kopiert CONSOLIDATED_REPORT.md zum TM
10. TM analysiert, aktiviert meta-analyst für Cross-Report-Vergleich
11. Weitere TM-Analysen oder Wechsel zum Dev-Flow
```

### Dev-Flow (Implementierung)

```
1. TM hat durch Test-Flow alle Probleme identifiziert und priorisiert
2. TM formuliert gezielte Dev-Agent-Befehle (je ein Befehl pro Agent)
3. User führt Dev-Agents EINZELN aus (esp32-dev, server-dev, mqtt-dev, frontend-dev)
4. Nach Implementierung → zurück zum Test-Flow zur Verifikation
```

### Agent-Aktivierungsreihenfolge (Test-Flow)

| Schritt | Agent/Skill | Funktion | Output |
|---------|-------------|----------|--------|
| 1 | `system-control` (Briefing-Modus) | Erstellt Session-Briefing | SESSION_BRIEFING.md → zum TM |
| 2 | `system-control` (Ops-Modus) | Generiert Logs, führt Operationen aus | Operations-Bericht (MUSS VOR Debug-Agents) |
| 3 | Debug-Agents | Logs analysieren (einzeln, parallel möglich) | Individuelle Reports |
| | - `esp32-debug` | ESP32 Serial-Log | ESP32_*_REPORT.md |
| | - `server-debug` | Server JSON-Log | SERVER_*_REPORT.md |
| | - `mqtt-debug` | MQTT-Traffic | MQTT_*_REPORT.md |
| | - `frontend-debug` | Frontend Build/Runtime | FRONTEND_*_REPORT.md |
| 4 | `/collect-reports` | Konsolidiert alle Reports | CONSOLIDATED_REPORT.md → zum TM |
| 5 | `meta-analyst` | Cross-Report-Vergleich, Widersprüche finden | META_ANALYSIS.md |

### Wechsel Test-Flow → Dev-Flow

Der Technical Manager entscheidet den Wechsel wenn:
- Alle Probleme durch Test-Flow + meta-analyst identifiziert und priorisiert sind
- Die Problemliste präzise genug ist um gezielte Dev-Aufträge zu formulieren
- Keine weiteren Analyse-Runden nötig sind

Der Wechsel zurück (Dev-Flow → Test-Flow) erfolgt nach jeder Implementierung zur Verifikation.

### Wichtige Regeln im TM-Workflow

- **Agents werden IMMER einzeln** im VS Code Chat-Fenster gestartet
- **system-control kommt IMMER vor den Debug-Agents** (er generiert die Logs)
- **Der TM codet nicht** – er beschreibt präzise, die Dev-Agents setzen um
- **Jeder Report geht via User zum TM** – keine direkte Agent-Kommunikation

---

*Details in Skills/Dev-Agents. Commands in `system-control`. Diese Datei ist NUR Router.*
