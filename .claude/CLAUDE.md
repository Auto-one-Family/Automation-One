# AutomationOne - KI-Agent Router

> **Projekt:** IoT-Framework fuer Gewaechshausautomation
> **Prinzip:** Server-Zentrisch. ESP32 = dumme Agenten. ALLE Logik auf Server.
```
El Frontend (Vue 3) <-HTTP/WS-> El Servador (FastAPI) <-MQTT-> El Trabajante (ESP32)
```

---

## Compact Instructions
Diese Informationen bleiben nach /compact erhalten:
- AutomationOne = IoT-Framework mit 3 Schichten: El Trabajante (ESP32 C++), El Servador (FastAPI Python), El Frontend (Vue 3 TypeScript)
- 9 Sensortypen (pH, EC, Temp, Humidity, Soil, Pressure, CO2, Light, Flow), 4 Aktortypen (Pump, Valve, PWM, Relay)
- PostgreSQL (32 Tabellen), MQTT (Mosquitto), Grafana+Prometheus Monitoring
- HardwareView: 3-Level-Zoom (L1 Uebersicht -> L2 Orbital/Device -> L3 Modals), Route-basiert
- Sensor-Konfiguration NUR in HardwareView (SensorConfigPanel). Komponenten-Tab (/sensors) = Wissensdatenbank
- Mock vs. Real ESP klar trennen. Zone auf Geraetebene, Subzone pro Sensor
- Build: `pio run` (ESP32), `pytest` (Server), `npm run build` (Frontend)
- 14 Agents (4 Dev, 5 Debug, 4 System, 1 Orchestrierung), 23+ Skills, path-scoped Rules
- Sub-Agent Routing: parallel bei unabhaengigen Domaenen, sequentiell bei Abhaengigkeiten
- Conventional Commits, ruff (Python), prettier (TS/Vue), strict TypeScript

---

## Verifikationskriterien
Nach JEDER Code-Aenderung muss der Agent die passenden Checks ausfuehren:

| Bereich | Befehl | Erfolgskriterium |
|---------|--------|-----------------|
| ESP32 Firmware | `cd "El Trabajante" && pio run -e seeed` | Exit-Code 0, keine Errors |
| Server Backend | `cd "El Servador/god_kaiser_server" && pytest --tb=short -q` | Alle Tests gruen |
| Server Lint | `cd "El Servador/god_kaiser_server" && ruff check .` | Keine Errors (Warnings OK) |
| Frontend Build | `cd "El Frontend" && npm run build` | Exit-Code 0, keine TS-Errors |
| Frontend Lint | `cd "El Frontend" && npx vue-tsc --noEmit` | Keine Type-Errors |
| Docker | `docker compose ps` | Alle Services "healthy" oder "running" |

**Regel:** Kein Commit ohne gruene Verifikation im betroffenen Bereich. Bei Failures: zuerst fixen, dann committen.

---

## Agent-Orchestrierung — Routing Rules

### Parallel dispatch (ALLE Bedingungen muessen erfuellt sein)
- 3+ unabhaengige Tasks ODER unabhaengige Domaenen (ESP32/Server/Frontend/MQTT)
- Kein geteilter State zwischen den Tasks
- Klare Datei-Grenzen ohne Ueberlappung
- **Beispiele:** Debug-Agents im Test-Flow, unabhaengige Code-Reviews, parallele Analysen verschiedener Schichten

### Sequential dispatch (EINE Bedingung reicht)
- Tasks haben Abhaengigkeiten (Output von A ist Input fuer B)
- Geteilte Dateien oder State (z.B. mqtt-dev aendert ESP32 + Server gleichzeitig)
- Unklarer Scope — erst analysieren, dann implementieren
- **Beispiele:** system-control Status -> dann Debug-Agent, Dev-Agent -> dann Test, Analyse -> dann Fix

### Background dispatch (run_in_background: true)
- Research- oder Analyse-Tasks deren Ergebnisse nicht sofort blockierend sind
- Codebase-Exploration und Inventarisierung
- **Beispiele:** meta-analyst Konsistenz-Check, ki-audit, agent-manager Bestandsaufnahme

### Invocations-Qualitaet (PFLICHT bei jedem Sub-Agent-Start)
Jede Sub-Agent-Invocation muss enthalten:
1. **Spezifischer Scope:** Welche Dateien/Module betroffen
2. **Kontext:** Was ist der aktuelle Zustand, was wurde bereits getan
3. **Klare Deliverables:** Was genau soll der Agent liefern (Report, Fix, Test)
4. **Erfolgs-Kriterien:** Woran erkennt man dass die Aufgabe erledigt ist

### Basis-Regeln
- **OHNE PAUSE durcharbeiten.** NIEMALS "Soll ich fortfahren?" fragen
- **"zusammen" = parallel.** NUR wenn User explizit "zusammen" schreibt
- **Plan Mode:** Parallel erlaubt, ohne Pause arbeiten

### Orchestrator: auto-debugger (Incident & Analyse-Artefakte)

**Wann `auto-debugger` statt Einzel-Debug-Agent:**

- Mehrschicht-**Incident** mit Pflichtsequenz: Lagebild, Korrelation, TASK-Packages, Spezialisten-Prompts, Konsolidierung, **`/verify-plan`-Gate** vor Implementierung.
- **Additive Verbesserung** bestehender Markdown-Analyseberichte (`docs/analysen/` o. a.) unter klarem Scope — evidenzbasiert, repo-verifiziert.
- Du brauchst **einen** durchgaengigen Artefakt-Ordner (`.claude/reports/current/incidents/<id>/` bzw. `auto-debugger-runs/<run_id>/`) statt isolierter Einzelreports.

**Wann weiterhin Einzel-Agenten:** reine Log-Triage in einer Schicht → `server-debug`, `frontend-debug`, `mqtt-debug`, `esp32-debug`; DB → `db-inspector`; reine Test-Log-Analyse → `test-log-analyst`; Querschnitt aus Auftrag + Code (Handoff an Dev) → `meta-analyst` (Report-only = Legacy).

**Steuerdatei-Pflicht:** Strukturierter Lauf startet mit einer Datei unter **`.claude/auftraege/auto-debugger/inbox/`** (Vorlage: `STEUER-VORLAGE.md`). Im Chat z. B. `@.claude/auftraege/auto-debugger/inbox/STEUER-….md`. Ohne gueltige Steuerdatei: nur Klaerung, keine vollstaendige Artefaktstruktur.

**Git-Arbeitsbranch:** Orchestrierte und delegierte **Code-Änderungen** nur auf Branch **`auto-debugger/work`** (von `master`); Details und Spezialisten-Pflicht siehe `.claude/agents/auto-debugger.md` (0a) und Skill `auto-debugger`.

**Skill:** `.claude/skills/auto-debugger/SKILL.md` — **Pflichtgate:** Skill **`verify-plan`** vor Implementierung aus abgeleiteten `TASK-PACKAGES.md`.

**Kette (ein Satz):** `TASK-PACKAGES.md` → Inhalt gemäss **`verify-plan`** (inkl. Chat-Block **OUTPUT FÜR ORCHESTRATOR**) → **`VERIFY-PLAN-REPORT.md`** → **Plan-Anpassung** (`TASK-PACKAGES.md` mutieren) durch **`auto-debugger`** → **`SPECIALIST-PROMPTS.md`** rollenweise → Dev-Agenten auf Branch **`auto-debugger/work`**.

**Slash-Command (optional):** `.claude/commands/auto-debugger.md` mit Argument `path` zur Steuerdatei.

---

## Skills (Entwicklung)

| Trigger | Skill |
|---------|-------|
| ESP32, C++, Sensor, Aktor, GPIO, PlatformIO, Wokwi | `esp32-development` |
| Python, FastAPI, MQTT-Handler, Database, API | `server-development` |
| Vue 3, TypeScript, Pinia, WebSocket, Dashboard | `frontend-development` |
| MQTT Topic, Publisher, Subscriber, Payload-Schema, QoS | `mqtt-development` |
| Reports sammeln, konsolidieren, archivieren, TM-Uebergabe | `collect-reports` |
| /do, Plan ausfuehren, Implementierung starten | `do` |
| /updatedocs, Docs aktualisieren | `updatedocs` |
| /test, Test-Failures, CI rot, pytest/Vitest/Playwright | `test-log-analyst` |
| /hardware-test, hw-test, Sensor testen | `hardware-test` |
| Agent-Flow pruefen, IST-SOLL, Agent-Korrektur | `agent-manager` |
| Git-Commit vorbereiten, Changes analysieren | `git-commit` |
| /verify-plan, TM-Plan Reality-Check | `verify-plan` |
| auto-debugger, Incident-Orchestrierung, Artefakt-Verbesserung | `auto-debugger` |
| KI-Audit, Bereich auf KI-Fehler pruefen | `ki-audit` |

## Dev-Agenten (Pattern-konforme Implementierung)

| Agent | Trigger-Keywords |
|-------|------------------|
| `esp32-dev` | Sensor hinzufuegen, Driver erstellen, NVS Key, GPIO, implementieren ESP32 |
| `server-dev` | Handler erstellen, Repository erweitern, Service, Schema, implementieren Server |
| `mqtt-dev` | Topic hinzufuegen, Publisher, Subscriber, Payload Schema, MQTT implementieren |
| `frontend-dev` | Komponente, Composable, Store, View, WebSocket, Vue, implementieren Frontend |

## System-Operator & Session-Einstieg

| Agent | Trigger-Keywords | Rolle |
|-------|------------------|-------|
| `system-control` | Session-Start, Briefing, Projektstatus, Start, Stop, Build, Flash | Briefing ODER Operationen |
| `db-inspector` | Schema, Query, Migration, Alembic | Datenbank-Inspektion & Cleanup |

## Debug-Agenten (Log-Analyse)

| Agent | Trigger-Keywords |
|-------|------------------|
| `esp32-debug` | Serial, Boot, NVS, GPIO-Fehler, Watchdog, Crash |
| `server-debug` | FastAPI, Handler, Error 5xxx, god_kaiser.log |
| `mqtt-debug` | Topic, Payload, QoS, Publish, Subscribe, Broker |
| `frontend-debug` | Build-Error, TypeScript, Vite, WebSocket, Pinia, Vue-Component |
| `meta-analyst` | Cross-System Code-Analyse, Pattern-Konsistenz, Developer-Handoff (Auftraege fuer *-dev); optional Report-Legacy |

## Orchestrierung (Incident & Artefakte)

| Agent | Trigger-Keywords | Rolle |
|-------|------------------|-------|
| `auto-debugger` | Incident-Artefakte, Korrelation, TASK-PACKAGES, verify-plan-Gate, Steuerdatei inbox | Lagebild → Korrelation → erste Pakete/Prompts → Verify + VERIFY-PLAN-REPORT → **TASK-PACKAGES anpassen** → **SPECIALIST-PROMPTS** → Dev-Umsetzung; Steuerdatei siehe oben |

---

## Referenzen

| Pfad | Inhalt |
|------|--------|
| `reference/api/` | MQTT_TOPICS, REST_ENDPOINTS, WEBSOCKET_EVENTS |
| `reference/errors/` | ERROR_CODES (ESP32: 1000-4999, Server: 5000-5999) |
| `reference/patterns/` | COMMUNICATION_FLOWS, ARCHITECTURE_DEPENDENCIES |
| `reference/debugging/` | LOG_LOCATIONS, CI_PIPELINE, ACCESS_LIMITATIONS |
| `reference/testing/` | agent_profiles, flow_reference, TEST_WORKFLOW |
| `reference/security/` | PRODUCTION_CHECKLIST |
| `reference/TM_WORKFLOW.md` | Test-Flow, Dev-Flow, Agent-Aktivierungsreihenfolge |
| `.claude/skills/mqtt-development/SKILL.md` | MQTT Pattern-First (Server + El Trabajante): Topics, QoS, Handler, LWT, Circuit Breaker, MQTTCommandBridge — mit Evidence-Tabelle |

## Regeln

1. **Server-Zentrisch** — Logic NIEMALS auf ESP32
2. **Patterns erweitern** — Bestehenden Code analysieren
3. **Build verifizieren** — Verifikationskriterien-Tabelle oben nutzen

## Workflow

```
SKILL -> DEV-AGENT -> ANALYSE -> PLAN -> IMPLEMENTIEREN -> VERIFIZIEREN
```

## TM-Workflow
> Vollstaendiger Test-/Dev-Flow: `.claude/reference/TM_WORKFLOW.md`
> Kurzform: SKILL -> DEV-AGENT -> Build verifizieren -> Test -> Commit

---

*Details in Skills/Dev-Agents. Commands in `system-control`. Diese Datei ist NUR Router.*
