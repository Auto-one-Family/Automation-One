# AutomationOne – Agenten-Optimierung Masterplan

**Version:** 2.0 | **Stand:** 2026-02-09
**Erstellt von:** Technical Manager (Claude Desktop) + Robin
**Zweck:** Gesamtplan für die systematische Optimierung aller Agenten, Skills und Referenzen

---

## 1. Vision und Konsens

### 1.1 Was wir erreichen

Jeder Agent im AutomationOne-System arbeitet nach einem einheitlichen Prinzip: Er versteht seinen Auftrag aus dem Kontext, handelt eigenständig mit vollem Zugang zu den Tools die er braucht, erweitert seine Analyse reaktiv wenn seine Findings das nahelegen, und liefert ein nachvollziehbares Ergebnis. Kein Agent wartet auf einen anderen. Kein Agent braucht ein starres Auftragsformat. Jeder Agent funktioniert in jeder Situation.

### 1.2 Die 7 Prinzipien (gelten für jeden Agenten)

| # | Prinzip | Bedeutung |
|---|---------|-----------|
| **P1** | **Kontexterkennung** | Der Agent erkennt aus dem was er bekommt – Auftrag, Dokument, Log, Frage, Problemschilderung – in welchem Modus er arbeiten muss. Er fragt nicht "was soll ich tun", er versteht es. |
| **P2** | **Eigenständigkeit** | Kein Agent setzt ein SESSION_BRIEFING, einen CONSOLIDATED_REPORT oder ein bestimmtes Format voraus. Zusätzlicher Kontext wird genutzt wenn vorhanden, aber nie vorausgesetzt. |
| **P3** | **Erweitern statt delegieren** | Wenn ein Agent auf etwas stößt das in einen anderen Bereich zeigt, untersucht er es selbst – soweit seine Tools es zulassen. Reaktiv und logisch begründet, nicht pauschal. |
| **P4** | **Erst verstehen, dann handeln** | Jeder Agent mit schreibenden Fähigkeiten analysiert zuerst vollständig, erklärt was er tun würde und warum, und handelt erst nach Bestätigung. Keine destruktiven Operationen ohne Freigabe. |
| **P5** | **Fokussiert aber vollständig** | Jeder Agent deckt seinen Bereich komplett ab, aber priorisiert: Wichtigstes zuerst, dann tiefer, dann breiter. Die Reihenfolge ist pro Agent spezifisch. |
| **P6** | **Nachvollziehbare Ergebnisse** | Jeder Agent erstellt einen eigenständigen Bericht in `.claude/reports/current/`. Mindeststandard: Was geprüft, was gefunden, welche Schritte, Zeitstempel bei Operationen, Empfehlung. |
| **P7** | **Querreferenzen für Verständnis** | Jeder Agent kennt die anderen und weiß wer wofür zuständig ist. Er nutzt dieses Wissen für Einordnung und Strategie-Empfehlungen – nicht um Arbeit abzuschieben. |

### 1.3 Wie wir ändern – die Methodik

Jede Optimierung folgt demselben Ablauf:

1. **Essenz verstehen** – Was ist die Kernaufgabe des Agenten? In welchem Teil des Stacks arbeitet er? Welche Situationen muss er abdecken?
2. **Ist-Zustand vollständig analysieren** – Agent-Datei, Skill, Referenzen, Querreferenzen. Alles lesen, nichts annehmen.
3. **Gegen das universelle Muster abgleichen** – Erfüllt der Agent alle 7 Prinzipien? Wo weicht er ab? Was fehlt?
4. **IST vs. SOLL gegenüberstellen** – Tabellarisch, pro Aspekt: Was ist da, was muss sich ändern, woher kommt der Inhalt.
5. **In vorhandener Struktur optimieren** – Nichts Neues erfinden. Bestehende Dateien erweitern und anpassen. vs_claude_best_practice.md als Qualitätsstandard einhalten.
6. **Verifizieren** – Keine toten Referenzen, keine Widersprüche, keine veralteten Verweise. Grep-basiert prüfen.

**Grundregel:** Wir erstellen keine neuen Strukturen, wir optimieren bestehende. Jeder Agent wird einzeln durchgegangen – kein pauschaler Umbau. Die Änderungen sind gezielt, nachvollziehbar und in der vorhandenen Dateistruktur verankert.

---

## 2. Architektur-Überblick

### 2.1 System-Stack

```
El Frontend (Vue 3/TypeScript)
    ↕ HTTP/REST + WebSocket
El Servador (FastAPI/Python)
    ↕ MQTT
El Trabajante (ESP32/C++)
    
PostgreSQL ← Alembic Migrations
MQTT-Broker (Mosquitto)
Docker-Stack (9 Container)
Monitoring: Grafana, Prometheus, Loki, Promtail
CI/CD: GitHub Actions
Tests: pytest, Vitest, Playwright, Wokwi
```

### 2.2 Agenten-Struktur

```
.claude/
├── agents/          → Agent-Definitionen (Rolle, Modi, Referenzen)
├── skills/          → Detailwissen pro Agent (Befehle, Patterns, Checklisten)
├── reference/       → Geteilte Referenzdokumente (API, Errors, Patterns, Infra)
├── reports/current/ → Aktuelle Agent-Reports
└── archive/         → Archivierte Dateien
```

### 2.3 Kommunikationsstruktur

```
Technical Manager (Claude Desktop)
    ↕ Robin kopiert Nachrichten
VS Code Claude Agents
    ↕ Lesen/Schreiben im Repo
AutomationOne System (Docker, Logs, DB, MQTT, Hardware)
```

Der TM formuliert Aufträge und Strategien. Robin vermittelt. VS Code Agents führen aus und berichten. Kein Agent hat direkten Kontakt zum TM – alles läuft über Robin.

---

## 3. Agenten-Katalog (aktueller SOLL-Stand)

### 3.1 System-Ebene

#### system-control ✅ Optimiert
| Aspekt | Detail |
|--------|--------|
| **Datei** | `.claude/agents/system-control.md` |
| **Skill** | `.claude/skills/system-control/SKILL.md` |
| **Kernbereich** | Gesamtes System – Docker, Netzwerk, Services, Logs, Befehle, Briefings |
| **Modi** | Full-Stack-Analyse, Hardware-Test, Trockentest, CI-Analyse, System-Operationen, Briefing, Dokument-Ergänzung |
| **Tools** | Read, Write, Bash, Grep, Glob |
| **Model** | opus |
| **Report** | SESSION_BRIEFING.md oder SYSTEM_CONTROL_REPORT.md |
| **Referenzen** | 11 Stück: SYSTEM_OPS, LOG_LOCATIONS, MQTT_TOPICS, COMM_FLOWS, ERROR_CODES, REST, WEBSOCKET, DOCKER_REF, CI_PIPELINE, flow_reference, TEST_WORKFLOW |
| **Besonderheit** | Kennt alle Agenten (Agent-Kompendium), empfiehlt Strategien, hinterlässt Zeitstempel bei Operationen. Erstellt kontextabhängige Briefings (kein starres Template). |

#### agent-manager ✅ Optimiert
| Aspekt | Detail |
|--------|--------|
| **Datei** | `.claude/agents/agent-manager/agent-manager.md` |
| **Skill** | `.claude/skills/agent-manager/SKILL.md` |
| **Kernbereich** | Agent-Definitionen prüfen und anpassen unter `.claude/` |
| **Modi** | 1: Dokument-Ergänzung / 2: Agent anpassen |
| **Tools** | Read, Write, Grep, Glob (kein Bash) |
| **Report** | AGENT_MANAGEMENT_REPORT.md |
| **Referenzen** | agent_profiles.md, flow_reference.md, vs_claude_best_practice.md, COMMUNICATION_FLOWS.md |
| **Besonderheit** | Kennt alle 7 Prinzipien, hat Agenten-Katalog und Muster-Vorlage, 8-Phasen-Workflow. Einziger Agent der andere Agenten strukturell ändert. |

### 3.2 Debug-Ebene

Alle Debug-Agenten folgen dem gleichen Muster: Kernbereich → Modus A (allgemein) / B (spezifisch) → Eigenanalyse bei Findings → eigenständiger Report.

#### esp32-debug ✅ Optimiert
| Aspekt | Detail |
|--------|--------|
| **Datei** | `.claude/agents/esp32-debug.md` |
| **Skill** | `.claude/skills/esp32-debug/SKILL.md` |
| **Kernbereich** | ESP32 Serial-Log – Boot, Error-Codes 1000-4999, GPIO, Watchdog, WiFi, MQTT-Connectivity |
| **Tools** | Read, Grep, Glob, Bash |
| **Erweitert bei Findings** | MQTT-Traffic (mosquitto_sub), Server-Health (curl), Docker-Status, DB-Device-Check (psql), Server-Log greppen |
| **Report** | ESP32_DEBUG_REPORT.md |

#### server-debug ✅ Optimiert
| Aspekt | Detail |
|--------|--------|
| **Datei** | `.claude/agents/server/server-debug-agent.md` |
| **Skill** | `.claude/skills/server-debug/SKILL.md` |
| **Kernbereich** | god_kaiser.log – JSON-Parsing, Error-Codes 5000-5699, Handler, Startup-Sequenz, Circuit Breaker |
| **Tools** | Read, Grep, Glob, Bash |
| **Erweitert bei Findings** | DB-Verbindung (psql), Docker-Status, Health-Endpoints (curl), MQTT-Broker-Logs, ESP-Serial greppen |
| **Report** | SERVER_DEBUG_REPORT.md |

#### mqtt-debug ✅ Optimiert
| Aspekt | Detail |
|--------|--------|
| **Datei** | `.claude/agents/mqtt/mqtt-debug-agent.md` |
| **Skill** | `.claude/skills/mqtt-debug/SKILL.md` |
| **Kernbereich** | MQTT-Traffic – Topics, Payloads, Request-Response-Sequenzen, QoS, Timing, LWT |
| **Tools** | Read, Grep, Glob, Bash |
| **Erweitert bei Findings** | Live-MQTT (mosquitto_sub mit Timeout), Broker-Status/Logs, Server-Handler greppen, ESP-Serial greppen, DB-Device-Check |
| **Report** | MQTT_DEBUG_REPORT.md |

#### frontend-debug ✅ Optimiert
| Aspekt | Detail |
|--------|--------|
| **Datei** | `.claude/agents/frontend/frontend-debug-agent.md` |
| **Skill** | `.claude/skills/frontend-debug/SKILL.md` |
| **Kernbereich** | Build (Vite/TypeScript), Runtime (Console), WebSocket, Pinia, API-Client, Pattern-Violations |
| **Tools** | Read, Grep, Glob, Bash |
| **Erweitert bei Findings** | API-Health (curl), Server-Log greppen, Docker-Status, WebSocket-Server-Status |
| **Report** | FRONTEND_DEBUG_REPORT.md |

#### db-inspector ✅ Optimiert
| Aspekt | Detail |
|--------|--------|
| **Datei** | `.claude/agents/db-inspector.md` |
| **Skill** | `.claude/skills/db-inspector/SKILL.md` |
| **Kernbereich** | PostgreSQL – Schema, Migrations, Queries, Device-Reg, Sensor-Data, Orphaned Records, Cleanup |
| **Tools** | Read, Bash, Grep, Glob |
| **Erweitert bei Findings** | Container-Status, Alembic-Check, Server-Log für DB-Errors greppen, Health-Endpoint |
| **Report** | DB_INSPECTOR_REPORT.md |
| **Besonderheit** | Kann DB bereinigen – NUR nach vollständiger Analyse + Bestätigung. Docker PostgreSQL primär, SQLite Fallback. |
| **Erledigt** | Skill Section 1: Delegations-Tabelle durch Eigenanalyse-Pattern ersetzt (2026-02-09) |

#### meta-analyst ✅ Optimiert
| Aspekt | Detail |
|--------|--------|
| **Datei** | `.claude/agents/meta-analyst.md` |
| **Skill** | `.claude/skills/meta-analyst/SKILL.md` |
| **Kernbereich** | Cross-Report-Analyse – Timeline, Widersprüche, Problemketten, Korrelation |
| **Tools** | Read, Grep, Glob (kein Bash – absichtlich, seine Stärke ist Analyse) |
| **Report** | META_ANALYSIS.md |
| **Besonderheit** | CONSOLIDATED_REPORT optional. Nutzt ERROR_CODES.md und COMMUNICATION_FLOWS.md für Korrelation. Arbeitet auch mit Einzel-Reports. |

### 3.3 Entwickler-Ebene (AP3 – ausstehend)

| Agent | Datei | Kernbereich | Status |
|-------|-------|-------------|--------|
| esp32-dev | `.claude/agents/esp32/esp32-dev-agent.md` | ESP32 C++/PlatformIO Implementierung | ⏳ Noch nicht optimiert |
| server-dev | `.claude/agents/server/server_dev_agent.md` | Python/FastAPI Implementierung | ⏳ Noch nicht optimiert |
| mqtt-dev | `.claude/agents/mqtt/mqtt_dev_agent.md` | MQTT-Implementierung (Server + ESP32) | ⏳ Noch nicht optimiert |
| frontend-dev | `.claude/agents/frontend/frontend_dev_agent.md` | Vue 3/TypeScript/Pinia Implementierung | ⏳ Noch nicht optimiert |

**Geplant:** Werden nach dem gleichen Muster optimiert. Nutzen Debug-Reports als Input. Pattern-konforme Implementierung in ihrem Bereich.

### 3.4 Docs & Git-Ebene (AP4 – ausstehend)

| Agent/Skill | Zweck | Status |
|-------------|-------|--------|
| collect-reports | Reports zusammenführen in CONSOLIDATED_REPORT.md | ⏳ |
| updatedocs | Docs nach Code-Änderungen aktualisieren | ⏳ |
| git-commit | Git-Changes analysieren, Commit-Plan | ⏳ |
| git-health | Git-/Repo-Analyse | ⏳ |
| verify-plan | TM-Pläne gegen Codebase prüfen | ⏳ |
| test-log-analyst | Test-Output-Analyse (pytest, Vitest, Playwright, Wokwi, CI) | ⏳ Teilweise optimiert |

---

## 4. Arbeitspakete – Status

### AP1: System-Agenten ✅ Abgeschlossen

| Schritt | Was | Status |
|---------|-----|--------|
| Analyse | SYSTEM_AGENTS_STRUCTURE_REPORT + COMMANDS_REPORT | ✅ |
| Konsolidierungsplan | SYSTEM_CONTROL_CONSOLIDATION_PLAN.md | ✅ |
| Umsetzung | system-control umgebaut, system-manager archiviert | ✅ |
| Verifikation | Alle Verweise umgebogen, Referenzen geprüft | ✅ |
| Nacharbeit | start_session.sh Verweise (5x SYSTEM_MANAGER → system-control) | ✅ |

**Ergebnis:** system-control ist jetzt universeller System-Spezialist mit 7 Modi. system-manager archiviert unter `.claude/archive/system_manager_archived_20260208/`.

### AP2: Debug-Agenten ✅ Weitgehend abgeschlossen

| Schritt | Was | Status |
|---------|-----|--------|
| Optimierungsplan | DEBUG_AGENTS_OPTIMIZATION_PLAN.md (Phase 1-3) | ✅ |
| Verifikation & Ergänzungen | /verify-plan Phase 4 | ✅ |
| Fullstack-Analysen | 4 parallele Entwickler für esp32/server/mqtt/frontend | 🔧 Läuft |
| Umsetzung esp32-debug | Agent + Skill | ✅ |
| Umsetzung server-debug | Agent + Skill | ✅ |
| Umsetzung mqtt-debug | Agent + Skill | ✅ |
| Umsetzung frontend-debug | Agent + Skill | ✅ |
| Umsetzung db-inspector | Agent + Skill | ✅ |
| Umsetzung meta-analyst | Agent + Skill | ✅ |
| Status-Überblick | Verifiziert: ~95% konsistent | ✅ |

**Ergebnis:** Alle 6 Debug-Agenten arbeiten nach universellem Muster. Nacharbeiten (db-inspector Skill, start_session.sh) abgeschlossen (2026-02-09).

### AP2.5: Agent-Manager ✅ Abgeschlossen

| Schritt | Was | Status |
|---------|-----|--------|
| Analyse + Umsetzung | Agent-Datei, Skill, agent_profiles.md | ✅ |
| 7 Prinzipien | Dokumentiert in Agent + Skill | ✅ |
| Agenten-Katalog | 13 Agenten mit Modi, Tools, Reports, Trigger | ✅ |
| Muster-Vorlage | Agent-Datei + Skill-Datei Templates | ✅ |
| Informationsfluss | ASCII-Diagramm + Abhängigkeits-Tabelle | ✅ |

### AP3: Dev-Agenten ⏳ Ausstehend

| Schritt | Was | Status |
|---------|-----|--------|
| Analyse | Ist-Zustand aller 4 Dev-Agenten | ⏳ |
| Plan | IST vs. SOLL, Umsetzungsplan | ⏳ |
| Umsetzung | Agent + Skill pro Dev-Agent | ⏳ |

**Geplant:** Gleiche Methodik wie bei Debug-Agenten. Fokus auf Pattern-Konsistenz, Querreferenzen zu Debug-Agenten, einheitliche Struktur.

### AP4: Docs & Git ⏳ Ausstehend

| Schritt | Was | Status |
|---------|-----|--------|
| Analyse | Ist-Zustand aller Docs/Git-Skills | ⏳ |
| Plan | IST vs. SOLL | ⏳ |
| Umsetzung | Pro Skill/Agent | ⏳ |

---

## 5. Referenzdokumente – Überblick

### 5.1 Alle Referenzen (verifiziert, keine toten Links)

| Kategorie | Referenz | Pfad | Zeilen | Genutzt von |
|-----------|----------|------|--------|-------------|
| API | MQTT_TOPICS | `.claude/reference/api/MQTT_TOPICS.md` | 828 | system-control, esp32-debug, mqtt-debug, server-debug, mqtt-dev, esp32-dev |
| API | REST_ENDPOINTS | `.claude/reference/api/REST_ENDPOINTS.md` | 802 | system-control, frontend-debug, frontend-dev, server-dev |
| API | WEBSOCKET_EVENTS | `.claude/reference/api/WEBSOCKET_EVENTS.md` | 800 | system-control, frontend-debug, frontend-dev |
| Debugging | LOG_LOCATIONS | `.claude/reference/debugging/LOG_LOCATIONS.md` | 648 | system-control, alle Debug-Agenten |
| Debugging | CI_PIPELINE | `.claude/reference/debugging/CI_PIPELINE.md` | – | system-control, test-log-analyst |
| Debugging | LOG_ACCESS_REFERENCE | `.claude/reference/debugging/LOG_ACCESS_REFERENCE.md` | – | frontend-debug |
| Debugging | ACCESS_LIMITATIONS | `.claude/reference/debugging/ACCESS_LIMITATIONS.md` | – | – |
| Errors | ERROR_CODES | `.claude/reference/errors/ERROR_CODES.md` | 743 | system-control, alle Debug-Agenten, Dev-Agenten |
| Infrastructure | DOCKER_REFERENCE | `.claude/reference/infrastructure/DOCKER_REFERENCE.md` | – | system-control |
| Infrastructure | DOCKER_AKTUELL | `.claude/reference/infrastructure/DOCKER_AKTUELL.md` | – | – |
| Patterns | COMMUNICATION_FLOWS | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | 718 | system-control, mqtt-debug, esp32-debug, meta-analyst, server-dev, mqtt-dev |
| Patterns | ARCHITECTURE_DEPENDENCIES | `.claude/reference/patterns/ARCHITECTURE_DEPENDENCIES.md` | – | meta-analyst, server-dev |
| Patterns | vs_claude_best_practice | `.claude/reference/patterns/vs_claude_best_practice.md` | – | agent-manager (Qualitätsstandard) |
| Testing | SYSTEM_OPERATIONS_REFERENCE | `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | 1083 | system-control, db-inspector |
| Testing | flow_reference | `.claude/reference/testing/flow_reference.md` | – | system-control, agent-manager, test-log-analyst |
| Testing | agent_profiles | `.claude/reference/testing/agent_profiles.md` | – | agent-manager |
| Testing | TEST_ENGINE_REFERENCE | `.claude/reference/testing/TEST_ENGINE_REFERENCE.md` | – | test-log-analyst |
| Testing | TEST_WORKFLOW | `.claude/reference/testing/TEST_WORKFLOW.md` | – | system-control, test-log-analyst |
| Security | PRODUCTION_CHECKLIST | `.claude/reference/security/PRODUCTION_CHECKLIST.md` | – | mqtt-dev |

### 5.2 Referenz-Analyse (nächster Schritt)

Die Referenzdokumente selbst wurden noch nicht gegen den neuen Agenten-Stand geprüft. Offene Fragen:
- Sind die Inhalte der Referenzen aktuell nach den Agenten-Änderungen?
- Stimmen Querreferenzen innerhalb der Referenzdokumente?
- Gibt es Referenzen die nie genutzt werden (ACCESS_LIMITATIONS, DOCKER_AKTUELL)?
- Sind die Referenzen vollständig genug für die erweiterten Fähigkeiten der Debug-Agenten?
- Brauchen Referenzen Ergänzungen für die neuen Modi (z.B. Docker-Compose-Alternativen für Windows in SYSTEM_OPERATIONS_REFERENCE)?

---

## 6. Offene Punkte (Stand 2026-02-09)

### Aktiv in Bearbeitung

| # | Was | Wo | Status |
|---|-----|----|--------|
| 1 | start_session.sh: 5x SYSTEM_MANAGER → system-control | `scripts/debug/start_session.sh` | ✅ Erledigt (2026-02-09) |
| 2 | db-inspector Skill: Delegations-Tabelle → Eigenanalyse | `.claude/skills/db-inspector/SKILL.md` | ✅ Erledigt (2026-02-09) |
| 3 | 4x Fullstack-Analysen (esp32/server/mqtt/frontend) | `.claude/reports/current/*_FULLSTACK_ANALYSIS.md` | 🔧 Parallel |

### Nächste Schritte

| # | Was | Abhängig von |
|---|-----|-------------|
| 4 | **Referenzdokumente analysieren** – Aktualität, Vollständigkeit, Querreferenzen | Punkt 1-2 ✅ abgeschlossen |
| 5 | **AP3: Dev-Agenten optimieren** – esp32-dev, server-dev, mqtt-dev, frontend-dev | Punkt 3 (Fullstack-Analysen als Input) |
| 6 | **AP4: Docs & Git optimieren** – collect-reports, updatedocs, git-*, verify-plan, test-log-analyst | AP3 abgeschlossen |
| 7 | **Historische Reports archivieren** – 6 Reports in current/ die noch system-manager referenzieren | Optional, niedrige Priorität |

---

## 7. Qualitätsstandard

Jede Änderung wird geprüft gegen:
- **vs_claude_best_practice.md** – Frontmatter, Tools, Model, Skill-Budget, Referenzierung
- **7 Prinzipien** – Kontexterkennung, Eigenständigkeit, Erweitern statt delegieren, erst verstehen dann handeln, fokussiert aber vollständig, nachvollziehbare Ergebnisse, Querreferenzen
- **Keine toten Referenzen** – Grep-basierte Verifikation nach jeder Änderung
- **Konsistenz** – agent_profiles.md muss immer den tatsächlichen Stand der Agent-Dateien widerspiegeln

---

*Ende des Masterplans*