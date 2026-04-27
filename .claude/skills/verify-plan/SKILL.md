---
name: verify-plan
description: |
  Reality-Check für TM-Pläne gegen die echte Codebase.
  Prüft Pfade, Agent-Referenzen, Docker-Services, Config-Werte,
  API-Endpunkte und Abhängigkeiten. Gibt dem Technical Manager
  präzise Korrektur-Hinweise als Chat-Antwort.
  Verwenden bei: TM-Plan prüfen, verify-plan, Reality-Check,
  Plan verifizieren, Befehl gegenprüfen, TM-Befehl checken.
  Bei auto-debugger-Gate: verbindlicher Chat-Block OUTPUT FÜR ORCHESTRATOR.
allowed-tools: Read, Grep, Glob, Bash, Edit
user-invocable: true
argument-hint: "[plan description or file path]"
---

# /verify-plan – TM-Plan Reality-Check

> Modus: EDIT (bei Plan-Datei) oder Chat (bei nur Kontext)
> Output: Chat-Antwort oder präzise Korrektur an der Stelle im Plan
> Rolle: Prüft TM-Pläne gegen den echten Systemzustand

## Kern-Prinzip

Du bist der letzte Qualitäts-Gate zwischen dem Technical Manager (TM) und der Ausführung. Der TM arbeitet ohne direkten Systemzugriff – seine Pläne basieren auf kopierten Reports und Briefings. Deine Aufgabe: Finde jede Diskrepanz zwischen Plan und Realität BEVOR ein Dev-Agent oder Debug-Agent den Plan ausführt.

Du bist KEIN Entscheider. Du verbesserst oder erweiterst den Plan an der exakten Stelle – du schreibst ihn nicht neu. Du gibst dem TM die fehlenden Informationen damit ER den Plan perfektionieren kann. Wenn eine Plan-Datei vorliegt: Korrigiere präzise an der Stelle. Ohne Plan-Datei: Chat-Ausgabe.

## Ablauf

### Phase 1: Plan-Extraktion (30 Sekunden)

Lies den TM-Plan aus dem Chat-Kontext. Extrahiere:

1. **Referenzierte Pfade** – Jeder Dateipfad, Verzeichnispfad, Config-Pfad
2. **Referenzierte Agents** – Jeder Agent-Name der aktiviert werden soll
3. **Referenzierte Skills** – Jeder Skill der aufgerufen werden soll
4. **Referenzierte Services** – Docker-Services, Ports, Endpoints
5. **Referenzierte Config-Werte** – ENV-Variablen, Credentials, Settings
6. **Referenzierte MQTT-Topics** – Topic-Pfade, QoS-Annahmen
7. **Referenzierte API-Endpunkte** – REST-Routen, WebSocket-Events
8. **Angenommene Vorbedingungen** – Was muss laufen/existieren damit der Plan funktioniert?
9. **Erwartete Outputs** – Wohin sollen Ergebnisse geschrieben werden?
10. **Test-Flow-Erkennung** – Geht der Plan explizit um den Test-Flow (F1: Session, Briefing, system-control, Debug-Agents)?

### Phase 2: System-Prüfung (Hauptarbeit)

Prüfe JEDEN extrahierten Punkt gegen das echte System. Nutze diese Prüfketten:

#### 2a: Pfad-Validierung

```
Für jeden referenzierten Pfad:
  1. Glob: Existiert der Pfad?
  2. Falls Verzeichnis: Welche Dateien sind drin?
  3. Falls Datei: Stimmt der erwartete Inhalt? (Read erste 20 Zeilen)
  4. Falls NICHT vorhanden: Gibt es einen ähnlichen Pfad? (Glob mit Wildcard)
```

Häufige TM-Fehler bei Pfaden:
- `logs/god_kaiser.log` → richtig: `logs/server/god_kaiser.log`
- `reports/` ohne `current/` Prefix → richtig: `.claude/reports/current/`
- `El Servador/src/` → richtig: `El Servador/god_kaiser_server/src/`
- Agent-Pfade ohne Unterordner (z.B. `.claude/agents/server-debug.md` statt `.claude/agents/server/server-debug-agent.md`)
- `logs/current/STATUS.md` → existiert nicht permanent, wird vom Session-Script nach `logs/archive/<timestamp>/STATUS.md` erstellt
- Referenz-Datei `LOG_SYSTEM.md` → existiert nicht, richtig: `.claude/reference/debugging/LOG_LOCATIONS.md`

**Projekt-Verzeichnisstruktur (Referenz):**

| Was | Pfad |
|-----|------|
| Agents | `.claude/agents/` (Unterordner: server/, mqtt/, frontend/, esp32/, agent-manager/, testing/) |
| Skills | `.claude/skills/` |
| Reports aktuell | `.claude/reports/current/` |
| Reports Archiv | `.claude/reports/archive/` |
| Referenz-Docs | `.claude/reference/` (api/, errors/, patterns/, testing/, debugging/, infrastructure/) |
| Logs aktuell | `logs/current/` |
| Logs Server | `logs/server/` (MQTT/Postgres: kein Bind-Mount, nur Docker/Loki) |
| Session-Script | `scripts/debug/start_session.sh` |
| Docker Config | `docker-compose.yml`, `docker/` |
| Wokwi Reports | `logs/wokwi/reports/` |

**Referenz-Nutzung:** Bei referenzierten Pfaden/APIs/Topics: Lese die entsprechende Referenz-Datei zur Validierung:
- Pfade/APIs: `.claude/reference/api/` (MQTT_TOPICS, REST_ENDPOINTS, WEBSOCKET_EVENTS)
- Docker: `.claude/reference/infrastructure/DOCKER_REFERENCE.md`
- Tests: `.claude/reference/testing/TEST_WORKFLOW.md`, TEST_ENGINE_REFERENCE.md
- Logs: `.claude/reference/debugging/LOG_LOCATIONS.md`, LOG_ACCESS_REFERENCE.md
- Flows: `.claude/reference/testing/flow_reference.md`
- Muster: `.claude/reference/patterns/ARCHITECTURE_DEPENDENCIES.md`

#### 2b: Agent-Validierung

```
Für jeden referenzierten Agent:
  1. Glob: .claude/agents/**/*.md
  2. Existiert ein Agent mit diesem Namen?
  3. Read: Stimmt die description mit der im Plan angenommenen Rolle überein?
  4. Read: Hat der Agent die nötigen tools für den geplanten Auftrag?
  5. Read: .claude/CLAUDE.md → Ist der Agent dort registriert?
```

Häufige TM-Fehler bei Agents:
- `provisioning-debug` → existiert nicht mehr, jetzt `meta-analyst`
- Agent-Name vs. Dateiname Diskrepanz (z.B. Agent heißt `esp32-dev`, Datei heißt `esp32-dev-agent.md`)
- Tools-Annahme falsch (z.B. Plan erwartet Write, aber Debug-Agents haben nur Read/Grep/Glob)
- Agent-Ordner-Struktur inkonsistent: manche Agents direkt in `.claude/agents/`, manche in Unterordnern

#### 2c: Docker-Validierung

```
  1. Read: docker-compose.yml → Welche Services, Ports, Volumes?
  2. Read: docker-compose.dev.yml → Dev-Overlay prüfen
  3. Read: docker-compose.test.yml → Test-Overlay prüfen (falls referenziert)
  4. Read: docker-compose.ci.yml → CI-Overlay prüfen (falls referenziert)
  5. Read: docker-compose.e2e.yml → E2E-Overlay prüfen (falls referenziert)
  6. Bash: make status (= docker compose ps) → Laufen die Services?
  7. Bash: make health (= curl http://localhost:8000/api/v1/health/live) → Server erreichbar?
  8. Vergleiche Plan-Annahmen mit tatsächlicher Config
```

Häufige TM-Fehler bei Docker:
- Port-Annahmen die nicht mit docker-compose.yml übereinstimmen
- Service-Namen falsch (`mqtt` statt `mqtt-broker`, `server` statt `el-servador`, `frontend` statt `el-frontend`)
- Container-Namen falsch (Container heißen `automationone-*`)
- Health-Endpoint-Pfad falsch (richtig: `/api/v1/health/live`)
- Falsches Compose-Overlay referenziert (es gibt: base, dev, test, ci, e2e)
- Profile nicht bedacht (monitoring-stack = `monitoring`)

**Docker-Erweiterung (DOCKER_REFERENCE.md):**
- **Compose-Overlays:** base, dev, test, ci, e2e
- **Profile:** `monitoring` (loki, alloy, prometheus, grafana)
- **Bind-Mounts:** `logs/server/` (MQTT/Postgres: kein Bind-Mount, nur Docker/Loki)
- **Makefile-Targets:** `make e2e-up`, `make monitor-up`, `make status`, `make health`

#### 2d: Config-Validierung

```
  1. Read: .env (falls vorhanden) → Welche Variablen gesetzt?
  2. Read: .env.example → Welche Variablen erwartet?
  3. Vergleiche Plan-Referenzen mit tatsächlichen Config-Werten
  4. Read: docker-compose.yml environment-Sektion pro Service
```

#### 2e: API-Validierung

```
Für referenzierte MQTT-Topics:
  1. Read: .claude/reference/api/MQTT_TOPICS.md
  2. Stimmt Topic-Pfad, QoS, Payload-Format?

Für referenzierte REST-Endpunkte:
  1. Read: .claude/reference/api/REST_ENDPOINTS.md
  2. Stimmt Route, Method, Auth-Requirement?

Für referenzierte WebSocket-Events:
  1. Read: .claude/reference/api/WEBSOCKET_EVENTS.md
  2. Stimmt Event-Name, Payload?
```

#### 2f: Abhängigkeits-Validierung

```
  1. Read: .claude/reference/patterns/ARCHITECTURE_DEPENDENCIES.md
  2. Berührt der Plan Komponenten die Abhängigkeiten haben?
  3. Werden alle Abhängigkeiten im Plan berücksichtigt?
  4. Reihenfolge: Muss etwas VOR der geplanten Aktion passieren?
```

#### 2g: Skill-Validierung

```
Für jeden referenzierten Skill:
  1. Glob: .claude/skills/*/SKILL.md
  2. Existiert der Skill?
  3. Read: Stimmt user-invocable mit der geplanten Nutzung überein?
  4. Read: Hat der Skill die erwarteten allowed-tools?
  5. Read: .claude/skills/README.md → Ist der Skill dort gelistet?
```

#### 2h: Output-Pfad-Validierung

```
Für jeden erwarteten Output:
  1. Existiert das Zielverzeichnis?
  2. Gibt es bereits eine Datei mit dem Namen? (Überschreibungsgefahr)
  3. Passt der Pfad zum etablierten Pattern?
     Reports → .claude/reports/current/
     Archiv → .claude/reports/archive/
```

**Ausnahme (Orchestrator):** Erwartet der Plan einen **auto-debugger**-Artefaktordner, ist  
`.claude/reports/current/auto-debugger-runs/<run_id>/` bzw. `.claude/reports/current/incidents/<incident_id>/` das **gebundene** Ziel für `VERIFY-PLAN-REPORT.md` — nicht „beliebig unter reports/“, sondern genau dieser Run-Ordner (siehe Regeln, Report-Pfad).

#### 2i: Test-Infrastruktur-Validierung

| Aspekt | Prüfung | Referenz |
|--------|---------|----------|
| Server-Tests | pytest, Unit/Integration/ESP32/E2E, Marker | TEST_WORKFLOW.md |
| CI-Workflows | server-tests, esp32-tests, wokwi-tests, frontend-tests, pr-checks | CI_PIPELINE.md |
| E2E | docker-compose.e2e.yml, `make e2e-up`, Playwright | TEST_ENGINE_REFERENCE.md |
| Dry-Run | Welche Tests haben Dry-Run-Optionen? | TEST_WORKFLOW.md |

#### 2j: Wokwi vs. Echter ESP

| Aspekt | Wokwi | Echter ESP |
|--------|-------|------------|
| Build-Env | `wokwi_simulation` | `seeed_xiao_esp32c3` |
| Log-Pfade | `logs/wokwi/serial/`, `logs/wokwi/reports/` | `logs/current/esp32_serial.log` |
| Befehle | `make wokwi-test-quick`, `pio run -e wokwi_simulation` | `pio run -e seeed_xiao_esp32c3`, `pio device monitor` |
| Limitierungen | NVS geskippt, PWM nur Serial | Volle Hardware |

**Regel:** Plan muss klar unterscheiden: Wokwi-Tests vs. Hardware-Tests.

#### 2z: Quality Gates

| Gate | Prüfung |
|------|---------|
| Codebase-Konsistenz | Nutzt der Plan nur existierende Funktionen, Methoden, Topics, APIs? |
| Struktur & Einbindung | Passt die Änderung zur Projektstruktur (El Trabajante/, El Servador/, El Frontend/, .claude/)? |
| Namenskonvention | kebab-case/snake_case wie in der Codebase? (API: snake_case, Frontend: camelCase) |
| Rückwärtskompatibilität | Brechen Änderungen bestehende Flows/APIs? |
| Ressourcen | Memory/Storage-Implikationen bedacht? (NVS, DB, Log-Rotation) |
| Fehlertoleranz | Error-Handling, Seiteneffekte, Kollisionen (GPIO, Topics)? |

### Phase 3: Ergebnis-Ausgabe

**Zwei Output-Modi:**

| Modus | Bedingung | Aktion |
|-------|-----------|--------|
| **A** | Plan liegt als Datei vor (z.B. `@path/to/plan.md` oder geöffnete Datei) | Edit-Tool nutzen – Korrektur **an der exakten Stelle** im Dokument. Kein Neu-Schreiben; Format: `[Korrektur]` oder inline-Replacement mit kurzer Begründung |
| **B** | Kein Dateipfad zum Plan angegeben | Chat-Nachricht mit Ergebnis-Format (Bestätigt, Korrekturen, Vorbedingungen, Ergänzungen) |

**Regel:** Wenn kein Plan-Dokument referenziert ist, gib das Ergebnis als Chat-Nachricht aus.

**Chat-Format (Modus B oder zusätzlich bei Modus A):**

```
## /verify-plan Ergebnis

**Plan:** [Einzeiler was der Plan vorhat]
**Geprüft:** [Anzahl] Pfade, [Anzahl] Agents, [Anzahl] Services, [Anzahl] Endpoints

### ✅ Bestätigt
[Alles was korrekt ist – kompakt, eine Zeile pro Punkt]

### ⚠️ Korrekturen nötig
[Für jede Diskrepanz:]

**[Kategorie]: [Kurzbeschreibung]**
- Plan sagt: `[was der TM geschrieben hat]`
- System sagt: `[was tatsächlich existiert]`
- Empfehlung: [konkreter Fix für den TM]

### 📋 Fehlende Vorbedingungen
[Was muss existieren/laufen damit der Plan funktioniert]
- [ ] [Vorbedingung 1]
- [ ] [Vorbedingung 2]

### 💡 Ergänzungen
[Dinge die der TM nicht bedacht hat aber relevant sind:]
- [Abhängigkeit die fehlt]
- [Config-Wert der gesetzt werden muss]
- [Agent der zusätzlich gebraucht wird]
- [Reihenfolge die beachtet werden muss]

### Zusammenfassung für TM
[2-3 Sätze: Ist der Plan ausführbar? Was muss der TM ändern?]
```

---

## OUTPUT FÜR ORCHESTRATOR (auto-debugger) — verbindlicher Zusatz-Block

**Zweck:** Maschinenlesbare, stabile Struktur, die **`auto-debugger`** nutzt, um **`TASK-PACKAGES.md`** und danach **`SPECIALIST-PROMPTS.md`** an Verify-Erkenntnisse anzupassen — **ohne** die Prüflogik oben zu ersetzen (Golden Path: Phase 1–2, Modus A/B).

**Wann Pflicht:** Wenn der Verify-Lauf als **Gate** für einen **auto-debugger**-Run gilt und ein **`TASK-PACKAGES.md`** im **gebundenen** Artefaktordner existiert oder explizit im Kontext referenziert ist:

- `.claude/reports/current/auto-debugger-runs/<run_id>/TASK-PACKAGES.md`, oder  
- `.claude/reports/current/incidents/<incident_id>/TASK-PACKAGES.md`

**Dann:** Immer **zusätzlich** zu Modus A/B (Chat und ggf. Plan-Edit) den folgenden Markdown-Abschnitt in die **Chat-Antwort** aufnehmen — Überschrift und Unterüberschriften **wörtlich** beibehalten, Tabellen/Inhalte vollständig füllen (auch wenn leer: „keine“ / „—“).

```markdown
## OUTPUT FÜR ORCHESTRATOR (auto-debugger)

### PKG → Delta
| PKG | Delta (Pfad, Testbefehl/-pfad, Reihenfolge, Risiko, HW-Gate, verworfene Teile) |
|-----|-----------------------------------------------------------------------------------|
| PKG-01 | … |

### PKG → empfohlene Dev-Rolle
| PKG | Rolle (z. B. server-dev, frontend-dev, esp32-dev, mqtt-dev) |
|-----|---------------------------------------------------------------|
| PKG-01 | … |

### PKG → Linear-Identifier (optional, Pflicht wenn `LINEAR-ISSUES.md` im Run-Ordner existiert)
| PKG | Linear (z. B. AUT-201) | Anmerkung (Titel / Relation) |
|-----|------------------------|------------------------------|
| PKG-01 | … | … |

Wenn im **gebundenen** Artefaktordner eine Datei **`LINEAR-ISSUES.md`** existiert: diese Tabelle **mit den dortigen IDs abgleichen** — keine PKG-Zeile ohne passende Linear-ID; bei Abweichung Drift im Chat und in der Delta-Spalte benennen.

### Cross-PKG-Abhängigkeiten
- PKG-XX → PKG-YY: [ein Satz: warum / was zuerst]

### BLOCKER
- [Was Implementierung verzögert; fehlende HW/Evidenz; externe Abhängigkeit]
```

**Mindestinhalt:** (a) pro betroffenem Paket mindestens eine **Delta**-Zeile, (b) **empfohlene Dev-Rolle** pro PKG mit Umsetzungsanteil, (c) **Kanten** zwischen PKGs wo relevant, (d) alle **BLOCKER** explizit, (e) wenn `LINEAR-ISSUES.md` im Run-Ordner liegt: zusätzlich die Unterüberschrift und Tabelle **PKG → Linear-Identifier** vollständig ausfüllen (keine PKG-Referenz ohne abgleichbare Linear-ID). Formulierungen so, dass **`auto-debugger`** den Block **1:1** zum Patchen von `TASK-PACKAGES.md` verwenden kann (konkrete Pfade, konkrete Testkommandos).

**Bei Test-Flow-Plan (F1 in flow_reference.md):** Zusätzliche Sektion hinzufügen:

```
### Agent-Befehle (angepasst für Test-Flow)

**[Agent-Name]:** [Korrigierter Befehl oder Hinweise]
- Plan sagt: [ursprünglich]
- Empfehlung: [konkreter Fix mit vollständigen Pfaden]
```

### Test-Flow-spezifische Agent-Befehlskorrektur

**Wann aktiv:** Plan liegt explizit vom TM vor **und** es geht explizit um den **Test-Flow** (F1 in flow_reference.md).

**Aktion:** Prüfe und korrigiere Agent-Befehle so, dass sie ohne Kontext-Verlust funktionieren.

**Agent-Aktivierungsreihenfolge (verbindlich):**
1. system-control (Briefing-Modus) → SESSION_BRIEFING.md
2. system-control → SC_REPORT (MUSS VOR Debug-Agents)
3. Debug-Agents (einzeln)
4. /collect-reports
5. meta-analyst
6. Dev-Agents nur nach TM-Entscheidung

**Befehlstemplate pro Agent (flow_reference F1.2):**
- KONTEXT: Wer der Agent ist, was passiert ist
- AUFTRAG: Was genau zu tun ist
- DATEIEN: Vollständige Pfade (z.B. `.claude/reports/current/SYSTEM_CONTROL_REPORT.md`)
- OUTPUT: Wohin schreiben (z.B. `.claude/reports/current/SERVER_DEBUG_REPORT.md`)
- REGELN: Read-Only für Debug-Agents

**Kontext-Erhalt:**
- Debug-Agents lesen **SYSTEM_CONTROL_REPORT.md** (enthält STATUS.md-Infos) – nicht STATUS.md separat
- Redundanz vermeiden: Kein doppeltes Laden von STATUS.md
- Jeder Befehl eigenständig: Agent muss ohne vorherige Session funktionieren

**Log-Hierarchie (LOG_ACCESS_REFERENCE.md):**
- server-debug: `logs/current/god_kaiser.log` (primär)
- mqtt-debug: `logs/current/mqtt_traffic.log`
- esp32-debug: `logs/current/esp32_serial.log`
- frontend-debug: `logs/current/frontend_container.log`

## Regeln

1. Du schreibst den Plan nicht neu; du korrigierst präzise an der Stelle (wenn Plan-Datei vorhanden). Ohne Plan-Datei: Chat-Ausgabe.
2. **Eine klare Report-/Datei-Regel:**
   - **Isolierter TM-/verify-plan-Lauf** (kein auto-debugger-Gate): Du **erstellst keine neuen Dateien** außer **Korrekturen in der referenzierten Plan-Datei** (Modus A). Du schreibst **keinen** freien Zusatzreport nach `.claude/reports/` — Ausgabe ist **Chat** (inkl. ggf. **OUTPUT FÜR ORCHESTRATOR** nur wenn obiger Pflichtfall zutrifft; sonst weglassen).
   - **auto-debugger-Gate** mit gebundenem Artefaktordner (`incidents/<id>/` oder `auto-debugger-runs/<run_id>/`): **`VERIFY-PLAN-REPORT.md` genau in diesem Ordner** ist **zulässig und erwünscht** — gebundener Report-Pfad, keine „weichen“ Reports an beliebiger Stelle. Typischerweise schreibt der **ausführende Orchestrator** (`auto-debugger`) diese Datei nach Anwendung dieses Skills; Inhalt und der Chat-Block **OUTPUT FÜR ORCHESTRATOR** müssen zusammenpassen.
3. **Chat-Ausgabe:** Immer die fachliche Verify-Antwort (Modus B bzw. ergänzend zu Modus A). Im **auto-debugger-Gate-Pflichtfall** zusätzlich immer den Abschnitt **OUTPUT FÜR ORCHESTRATOR (auto-debugger)**.
4. Wenn der Plan keine Probleme hat: Sag das klar und kurz.
5. Wenn der Plan Probleme hat: Sei präzise, nicht vage – gib dem TM exakte Pfade, exakte Namen, exakte Fixes
6. Prüfe NUR was im Plan referenziert wird – keine Vollanalyse. Bei Quality Gates: Prüfe auch implizite Referenzen (z.B. wenn „Sensor hinzufügen“ steht, prüfe MQTT-Topics und API).
7. Ignoriere Rechtschreibfehler im Plan – fokussiere auf technische Korrektheit
8. Bei Unsicherheit: Lieber eine Warnung zu viel als eine zu wenig
9. Bash-Befehle NUR für Status-Checks (docker compose ps, make status) – NIEMALS für Änderungen

## Abgrenzung

| Aufgabe | Zuständig |
|---------|-----------|
| Plan erstellen | TM (claude.ai) |
| Plan prüfen | **verify-plan** (dieser Skill) |
| Plan korrigieren | TM (claude.ai) – verify-plan kann bei Plan-Datei präzise Korrekturen einfügen |
| Plan ausführen | Dev-Agents / Debug-Agents |
| TASK-PACKAGES nach Verify anpassen, SPECIALIST-PROMPTS rollenweise | **auto-debugger** (nutzt Chat-Block **OUTPUT FÜR ORCHESTRATOR**) |
| System analysieren | system-control (Briefing- oder Ops-Modus) |
| Reports konsolidieren | /collect-reports |
| Cross-System / Dev-Handoff; Reports meta-analysieren (Legacy) | meta-analyst |

**verify-plan vs. Test-Flow:**
- verify-plan prüft **TM-Pläne**, nicht den Test-Flow selbst
- Der Test-Flow (Session → Briefing → system-control → Debug-Agents → collect-reports → meta-analyst) wird in flow_reference.md definiert; **meta-analyst** kann zusätzlich **auf Anfrage** code-first vor den Reports laufen
- verify-plan stellt sicher, dass ein TM-Plan diesen Flow korrekt referenziert (z.B. system-control vor Debug-Agents)
- verify-plan kann bei Test-Flow-Plänen Agent-Befehle **anpassen**, damit sie kontext-sicher funktionieren

## Quick Reference

| Aspekt | Detail |
|--------|--------|
| Trigger | TM-Plan prüfen, verify-plan, Reality-Check |
| Input | TM-Plan im Chat-Kontext (oder @path/to/plan.md) |
| Output | Chat-Antwort mit Korrekturen (oder Inline-Korrektur in Plan-Datei bei Modus A) |
| Tools | Read, Grep, Glob, Bash, Edit |
| Modus | Edit bei Plan-Datei; Chat bei nur Kontext |
| Schreibt Dateien | Modus A: nur Korrekturen in referenzierter Plan-Datei; auto-debugger-Gate: `VERIFY-PLAN-REPORT.md` im gebundenen Run-Ordner (Orchestrator) |
| Dauer | 1-3 Minuten |

---

## Anhang A: Agent-Inventar (IST-Zustand)

### Debug-Agents (nur Read/Grep/Glob) + meta-analyst (Handoff-Reports)

| Agent-Name | Datei | Tools |
|------------|-------|-------|
| `esp32-debug` | `.claude/agents/esp32-debug.md` | Read, Grep, Glob |
| `server-debug` | `.claude/agents/server/server-debug-agent.md` | Read, Grep, Glob |
| `mqtt-debug` | `.claude/agents/mqtt/mqtt-debug-agent.md` | Read, Grep, Glob |
| `frontend-debug` | `.claude/agents/frontend/frontend-debug-agent.md` | Read, Grep, Glob |
| `meta-analyst` | `.claude/agents/meta-analyst.md` | Read, Write, Grep, Glob |

### Dev-Agents (Read + Write + Edit + Bash + Grep + Glob)

| Agent-Name | Datei | Tools |
|------------|-------|-------|
| `esp32-dev` | `.claude/agents/esp32/esp32-dev-agent.md` | Read, Grep, Glob, Bash, Write, Edit |
| `server-dev` | `.claude/agents/server/server_dev_agent.md` | Read, Grep, Glob, Bash, Write, Edit |
| `mqtt-dev` | `.claude/agents/mqtt/mqtt_dev_agent.md` | Read, Grep, Glob, Bash, Write, Edit |
| `frontend-dev` | `.claude/agents/frontend/frontend_dev_agent.md` | Read, Write, Edit, Bash, Grep, Glob |

### System-Agents

| Agent-Name | Datei | Tools |
|------------|-------|-------|
| `system-control` | `.claude/agents/system-control.md` | Read, Write, Bash, Grep, Glob |
| `db-inspector` | `.claude/agents/db-inspector.md` | Read, Write, Bash, Grep, Glob |
| `agent-manager` | `.claude/agents/agent-manager/agent-manager.md` | Read, Write, Edit, Bash, Grep, Glob |

**Hinweis:** Dateinamen-Konvention ist INKONSISTENT:
- Manche Agents: kebab-case (`server-debug-agent.md`)
- Manche Agents: snake_case (`server_dev_agent.md`)
- Manche direkt in `agents/`, manche in Unterordnern

---

## Anhang B: Docker Services (IST-Zustand)

### Compose-Dateien

| Datei | Zweck | Makefile-Variable |
|-------|-------|-------------------|
| `docker-compose.yml` | Base/Production | `COMPOSE` |
| `docker-compose.dev.yml` | Dev-Overlay (hot-reload, DEBUG) | `COMPOSE_DEV` |
| `docker-compose.test.yml` | Test-Overlay | `COMPOSE_TEST` |
| `docker-compose.ci.yml` | CI/CD (GitHub Actions, tmpfs) | `COMPOSE_CI` |
| `docker-compose.e2e.yml` | End-to-End Tests | `COMPOSE_E2E` |

### Services (Default-Profil)

| Service-Name | Container-Name | Port(s) | Health-Check |
|-------------|----------------|---------|--------------|
| `postgres` | `automationone-postgres` | 5432 | `pg_isready` |
| `mqtt-broker` | `automationone-mqtt` | 1883 (MQTT), 9001 (WS) | `mosquitto_sub` |
| `el-servador` | `automationone-server` | 8000 | `curl /api/v1/health/live` |
| `el-frontend` | `automationone-frontend` | 5173 | `fetch localhost:5173` |

### Services (Profile: monitoring)

| Service-Name | Container-Name | Port(s) |
|-------------|----------------|---------|
| `loki` | `automationone-loki` | 3100 |
| `alloy` | `automationone-alloy` | 12345 |
| `prometheus` | `automationone-prometheus` | 9090 |
| `grafana` | `automationone-grafana` | 3000 |

### Makefile-Befehle (Status-relevant)

| Befehl | Aktion |
|--------|--------|
| `make status` | `docker compose ps` |
| `make health` | `curl http://localhost:8000/api/v1/health/live` |
| `make up` | Start production stack |
| `make dev` | Start with hot-reload |
| `make down` | Stop all containers |
| `make logs` | Follow all logs |
| `make mqtt-sub` | Subscribe kaiser/# MQTT topics |
| `make e2e-up` | E2E Full-Stack starten |
| `make monitor-up` | Monitoring-Stack starten (`--profile monitoring`) |
| `make monitor-down` | Monitoring-Stack stoppen |
| `make monitor-logs` | Monitoring Logs folgen |
| `make monitor-status` | Monitoring Container-Status |

### Bind-Mounts (Logs)

| Host-Pfad | Service | Container-Pfad |
|-----------|---------|----------------|
| `./logs/server/` | el-servador | `/app/logs` |
| (kein Bind-Mount) | mqtt-broker | stdout → Docker → Alloy → Loki |
| (kein Bind-Mount) | postgres | stderr → Docker → Alloy → Loki |

---

## Anhang C: Skill-Inventar (IST-Zustand)

| Skill-Name | Ordner | User-Invocable |
|------------|--------|----------------|
| `esp32-development` | `.claude/skills/esp32-development/` | ja |
| `server-development` | `.claude/skills/server-development/` | ja |
| `frontend-development` | `.claude/skills/frontend-development/` | ja |
| `mqtt-development` | `.claude/skills/mqtt-development/` | ja |
| `collect-reports` | `.claude/skills/collect-reports/` | ja |
| `do` | `.claude/skills/do/` | ja |
| `updatedocs` | `.claude/skills/updatedocs/` | ja |
| `esp32-debug` | `.claude/skills/esp32-debug/` | ja |
| `server-debug` | `.claude/skills/server-debug/` | ja |
| `mqtt-debug` | `.claude/skills/mqtt-debug/` | ja |
| `frontend-debug` | `.claude/skills/frontend-debug/` | ja |
| `db-inspector` | `.claude/skills/db-inspector/` | ja |
| `system-control` | `.claude/skills/system-control/` | ja |
| `meta-analyst` | `.claude/skills/meta-analyst/` | ja |
| `verify-plan` | `.claude/skills/verify-plan/` | ja |
| `git-health` | `.claude/skills/git-health/` | ja |
| `git-commit` | `.claude/skills/git-commit/` | ja |
| `agent-manager` | `.claude/skills/agent-manager/` | ja |
| `system-control` | `.claude/skills/system-control/` | ja |

---

## Anhang D: Referenz-Dateien (IST-Zustand)

| Pfad | Existiert |
|------|-----------|
| `.claude/reference/api/MQTT_TOPICS.md` | ja |
| `.claude/reference/api/REST_ENDPOINTS.md` | ja |
| `.claude/reference/api/WEBSOCKET_EVENTS.md` | ja |
| `.claude/reference/errors/ERROR_CODES.md` | ja |
| `.claude/reference/patterns/ARCHITECTURE_DEPENDENCIES.md` | ja |
| `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | ja |
| `.claude/reference/patterns/vs_claude_best_practice.md` | ja |
| `.claude/reference/debugging/LOG_LOCATIONS.md` | ja |
| `.claude/reference/debugging/CI_PIPELINE.md` | ja |
| `.claude/reference/debugging/ACCESS_LIMITATIONS.md` | ja |
| `.claude/reference/testing/TEST_WORKFLOW.md` | ja |
| `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | ja |
| `.claude/reference/testing/TEST_ENGINE_REFERENCE.md` | ja |
| `.claude/reference/testing/agent_profiles.md` | ja |
| `.claude/reference/testing/flow_reference.md` | ja |
| `.claude/reference/security/PRODUCTION_CHECKLIST.md` | ja |
| `.claude/reference/infrastructure/DOCKER_REFERENCE.md` | ja |
| `.claude/reference/debugging/LOG_ACCESS_REFERENCE.md` | ja |
| `.claude/reference/debugging/LOG_SYSTEM.md` | **NEIN** (nicht vorhanden) |

---

## Anhang E: ENV-Variablen (.env.example)

| Variable | Default | Service |
|----------|---------|---------|
| `POSTGRES_USER` | `god_kaiser` | postgres |
| `POSTGRES_PASSWORD` | (CHANGE_ME) | postgres |
| `POSTGRES_DB` | `god_kaiser_db` | postgres |
| `DATABASE_URL` | `postgresql+asyncpg://...` | el-servador |
| `DATABASE_AUTO_INIT` | `true` | el-servador |
| `JWT_SECRET_KEY` | (CHANGE_ME) | el-servador |
| `SERVER_HOST` | `0.0.0.0` | el-servador |
| `SERVER_PORT` | `8000` | el-servador |
| `ENVIRONMENT` | `development` | el-servador |
| `LOG_LEVEL` | `INFO` | el-servador |
| `CORS_ALLOWED_ORIGINS` | `["http://localhost:5173","http://localhost:3000"]` | el-servador |
| `MQTT_BROKER_HOST` | `mqtt-broker` | el-servador |
| `MQTT_BROKER_PORT` | `1883` | el-servador |
| `MQTT_WEBSOCKET_PORT` | `9001` | el-servador |
| `VITE_API_URL` | `http://localhost:8000` | el-frontend |
| `VITE_WS_URL` | `ws://localhost:8000` | el-frontend |
| `GRAFANA_ADMIN_PASSWORD` | `changeme` | grafana |
| `WOKWI_CLI_TOKEN` | (leer) | Wokwi CLI |

---

## Anhang F: Test-Infrastruktur Quick-Reference

| Aspekt | Detail |
|--------|--------|
| **Server-Tests** | pytest: `El Servador/god_kaiser_server/tests/` – Unit, Integration, ESP32 Mock, E2E |
| **CI-Workflows** | server-tests, esp32-tests, wokwi-tests, frontend-tests, pr-checks (`.github/workflows/`) |
| **E2E** | `docker-compose.e2e.yml`, `make e2e-up`, Playwright |
| **Wokwi** | Build: `pio run -e wokwi_simulation`, Tests: `make wokwi-test-quick` |
| **Echter ESP** | Build: `pio run -e seeed_xiao_esp32c3`, Monitor: `pio device monitor` |
| **Log-Pfade** | Wokwi: `logs/wokwi/reports/`, ESP32: `logs/current/esp32_serial.log` |