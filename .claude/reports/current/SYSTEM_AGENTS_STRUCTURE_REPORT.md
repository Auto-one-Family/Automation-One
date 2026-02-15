# SYSTEM_AGENTS_STRUCTURE_REPORT

**Erstellt:** 2026-02-08
**Auftrag:** Vollständige Struktur-Analyse der Agenten system-control und system-manager
**Methode:** Ist-Zustand dokumentieren, keine Verbesserungsvorschläge

---

# Teil 1: system-control

## A) Agent-Datei

### Vollständiger Pfad

`.claude/agents/system-control.md`

### Frontmatter

| Feld | Wert |
|------|------|
| **name** | system-control |
| **description** | System-Steuerung für AutomationOne Server und MQTT. MUST BE USED when: starting/stopping server, observing MQTT traffic, registering/configuring ESP devices, managing sensors/actuators, running debug sessions, making API calls, hardware operations. NOT FOR: Log-Analyse (debug-agents), DB-Queries (db-inspector), Code-Änderungen. Proactively control system when debugging or operating. |
| **tools** | Read, Bash, Grep, Glob |
| **model** | sonnet |

### Rolleanschnitt – wörtliche Aufgabe/Rolle

Zeile 16–17:

> Du bist der **Operations-Spezialist** für das AutomationOne Framework. Deine Aufgabe ist es, das System zu steuern, zu überwachen und Debug-Operationen durchzuführen.

### Abschnitte/Sektionen der Agent-Datei

1. **# System Control Agent** (Titel)
2. **1. Referenz-Dokumentation**
3. **2. Deine Fähigkeiten**
   - 2.1 Server-Steuerung
   - 2.2 REST-API Operationen
   - 2.3 MQTT-Operationen
   - 2.4 ESP32-Hardware
4. **3. Arbeitsweise**
   - Bei Steuerungs-Anfragen
   - Bei Debug-Sessions
5. **3.1 Quick Commands (Copy-Paste Ready)**
   - Server, MQTT, ESP32, API
6. **4. Sicherheitsregeln**
7. **5. Antwort-Format**
8. **6. Fokus & Delegation**
   - Meine Domäne
   - NICHT meine Domäne (delegieren an)
   - Regeln

### Skills referenziert

In der Agent-Datei **keine explizite Referenz** auf einen Skill. Die Verknüpfung erfolgt über die Agent-Skill-Liste in `.claude/` (agent_profiles.md weist system-control den Skill `system-control` zu).

### Referenzdokumente referenziert

| Referenz | Pfad (wie im Agent) | Kontext |
|----------|---------------------|---------|
| SYSTEM_OPERATIONS_REFERENCE | `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | Hauptreferenz, Arbeitsweise, Vollständige Referenz |
| LOG_LOCATIONS | `reference/debugging/LOG_LOCATIONS.md` | Log-Pfade (relativer Pfad) |
| MQTT_TOPICS | `reference/api/MQTT_TOPICS.md` | MQTT Topics (relativer Pfad) |

### Andere Agenten erwähnt

| Agent | Kontext |
|-------|---------|
| esp32-debug | Delegation: ESP antwortet nicht auf MQTT → Serial-Log analysieren |
| server-debug | Delegation: Server-Handler wirft Fehler → Server-Log analysieren |
| mqtt-debug | Delegation: MQTT-Traffic anomal → Traffic-Pattern analysieren |
| db-inspector | Delegation: Datenbank-Inkonsistenz → DB-Queries ausführen |
| **Entwickler** | Nicht Agent: Code-Änderungen nötig |

---

## B) Zugehörige Skills

### Skill system-control

**Vollständiger Pfad:** `.claude/skills/system-control/SKILL.md`

**Dateistruktur im Skill-Ordner:**

```
.claude/skills/system-control/
└── SKILL.md
```

Nur eine Datei im Ordner.

### Skill-Inhalt – Abschnitte

1. **Frontmatter** (name: system-control, description, allowed-tools)
2. **# System-Control - Skill Dokumentation**
3. **0. Quick Reference - Was mache ich?**
4. **1. Rolle & Abgrenzung**
5. **2. Make-Targets Vollreferenz**
   - Stack-Lifecycle
   - Monitoring
   - Shell-Zugriff
   - Datenbank
6. **3. Service-Architektur (4 Container)**
7. **4. Health-Check-Referenz**
8. **5. Session-Scripts (v4.0)**
9. **6. Compose-Varianten**
10. **7. Operative Checklisten**
11. **8. Log-Locations für Weiterleitung**
12. **9. Sicherheitsregeln**
13. **10. Antwort-Format**
14. **11. Workflow**

### Skill-Inhalt – Kurzfassung

Skill beschreibt den system-control-Agent als operativen Arm des Frameworks. Fokus: Docker-Stack, Health-Checks, MQTT-Observation, Session-Management. Enthält Make-Targets, Service-Architektur, Health-Checks, Session-Scripts (start_session.sh, stop_session.sh), Compose-Varianten, Checklisten und Delegationsregeln zu Debug-Agents und db-inspector.

### Referenzen im Skill

| Referenz | Pfad | Stelle |
|----------|------|--------|
| SYSTEM_OPERATIONS_REFERENCE | `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | Fußzeile (Zeile 407) |

### Weitere Skills/Agenten referenziert im Skill

- **esp32-debug, server-debug, mqtt-debug, frontend-debug** – Delegation bei Log-Problemen
- **db-inspector** – Delegation bei DB-Problemen
- **meta-analyst** – Delegation bei Reports
- **esp32-dev, server-dev, frontend-dev** – Delegation bei Code-Änderungen

---

## C) Referenzdokumente

### Vom Agent referenziert

| Pfad | Kurzbeschreibung | Umfang |
|------|------------------|--------|
| `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | Befehlsreferenz für Debug-Operations (Login, Docker, REST, MQTT, ESP32, Workflows) | 1083 Zeilen |
| `reference/debugging/LOG_LOCATIONS.md` | Log-Quellen, Speicherorte, Capture-Methoden, Docker-Log-Infrastruktur | 648 Zeilen |
| `reference/api/MQTT_TOPICS.md` | MQTT-Topic-Schema, Payloads | 828 Zeilen |

### Vom Skill referenziert

| Pfad | Kurzbeschreibung | Umfang |
|------|------------------|--------|
| `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | Siehe oben | 1083 Zeilen |

### Prüfung Verlinkung

| Referenz | Agent | Skill | Knoten |
|----------|-------|-------|--------|
| SYSTEM_OPERATIONS_REFERENCE | ✅ explizit | ✅ explizit | Beide |
| LOG_LOCATIONS | ✅ explizit (als `reference/debugging/LOG_LOCATIONS.md`) | ❌ nicht | Nur Agent |
| MQTT_TOPICS | ✅ explizit (als `reference/api/MQTT_TOPICS.md`) | ❌ nicht | Nur Agent |

**Hinweis:** Die Pfade `reference/...` im Agent sind relativ; vollständig: `.claude/reference/...`. Alle referenzierten Dateien existieren.

---

## D) Strukturmuster (system-control)

- **Referenzierung:** Tabellen mit „Wann lesen?“ / „Section“ / „Inhalt“; Hauptreferenz als Tabelle mit Section-Mapping; zusätzliche Referenzen in eigener Tabelle.
- **„Lies zuerst“-Pattern:** Section 0 für Credentials explizit als „IMMER zuerst“ markiert.
- **Inline-Links:** Pfade als Backtick-Code.
- **Delegation:** Tabelle „Situation | Delegieren an | Grund“.
- **Lücken:** Keine fehlenden oder toten Referenzen.

---

# Teil 2: system-manager

## A) Agent-Datei

### Vollständiger Pfad

`.claude/agents/System Manager/system-manager.md`

### Frontmatter

| Feld | Wert |
|------|------|
| **name** | system-manager |
| **description** | Session-Orchestrator und System-Erklärer für AutomationOne. MUST BE USED when: Session-Start, "session gestartet", Projektstatus, System-Übersicht, Hardware-Test vorbereiten, "was ist der Stand". NOT FOR: Code-Implementierung, Log-Analyse, System-Befehle, Agent-Ausführung. OUTPUT: .claude/reports/current/SESSION_BRIEFING.md. ROLLE: Erklärt dem Technical Manager das GESAMTE System - erstellt KEINE Agent-Aufträge. |
| **tools** | Read, Grep, Glob, Bash |
| **model** | opus |

### Rolleanschnitt – wörtliche Aufgabe/Rolle

Zeile 20–24:

> Du bist der **System-Erklärer** für AutomationOne. Wenn eine Session startet, erstellst du ein umfassendes **SESSION_BRIEFING.md**, das dem Technical Manager ALLES erklärt was er wissen muss.

### Abschnitte/Sektionen der Agent-Datei

1. **# SYSTEM_MANAGER**
2. **Kern-Prinzip**
   - Deine Rolle (Tabelle MACHST vs. NICHT machst)
3. **Aktivierung**
   - Trigger-Phrasen
   - Modus-Verhalten
   - Erwarteter User-Input
4. **Workflow**
   - Phase 0: STATUS.md lesen
   - Phase 1: System-Status erfassen
   - Phase 2: Referenz-Dokumentation sammeln
   - Phase 3: Agent-Kompendium erstellen
   - Phase 4: SESSION_BRIEFING schreiben
5. **SESSION_BRIEFING Template** (vollständiges Markdown-Template)
6. **Agent-Kompendium Format**
7. **Kritische Regeln**
8. **Qualitäts-Checks vor Abgabe**

### Skills referenziert

| Skill | Pfad | Kontext |
|------|------|---------|
| collect-reports | `.claude/skills/collect-reports/SKILL.md` | Im Agent-Kompendium (Section 4.4 „Skills (User-aufrufbar)“) |

Keine explizite Referenz auf den eigenen Skill (System Manager). Verknüpfung über Agent-Skill-Liste.

### Referenzdokumente referenziert

| Referenz | Pfad (wie im Agent) | Kontext |
|----------|---------------------|---------|
| SYSTEM_OPERATIONS | `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | Phase 2 |
| COMMUNICATION_FLOWS | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | Phase 2 |
| ERROR_CODES | `.claude/reference/errors/ERROR_CODES.md` | Phase 2 |
| MQTT_TOPICS | `.claude/reference/api/MQTT_TOPICS.md` | Phase 2 |
| REST_ENDPOINTS | `.claude/reference/api/REST_ENDPOINTS.md` | Phase 2 |
| WEBSOCKET_EVENTS | `.claude/reference/api/WEBSOCKET_EVENTS.md` | Phase 2 |

Zusätzlich: „Alle Referenzen unter: `.claude/reference/`“ (Section 5).

### Andere Agenten erwähnt

Im SESSION_BRIEFING-Template und Agent-Kompendium werden alle relevanten Agenten dokumentiert:

- **system-control** – als ERSTER Agent nach Briefing, System-Operationen
- **db-inspector** – 4.1
- **esp32-debug** – 4.2
- **server-debug** – 4.2
- **mqtt-debug** – 4.2
- **meta-analyst** – 4.2
- **esp32-dev** – 4.3
- **server-dev** – 4.3
- **mqtt-dev** – 4.3
- **frontend-dev** – 4.3

Kontext: Beschreibung im Briefing als Kompendium für den Technical Manager; keine Delegation, sondern Aufklärung.

---

## B) Zugehörige Skills

### Skill System Manager

**Vollständiger Pfad:** `.claude/skills/System Manager/SKILL.md`

**Dateistruktur im Skill-Ordner:**

```
.claude/skills/System Manager/
├── SKILL.md
└── session-planning.md
```

Zwei Dateien.

### Skill-Inhalt – SKILL.md

**Abschnitte:**

1. **Frontmatter** (name: System-Manager, description, disable-model-invocation, allowed-tools, user-invocable, context)
2. **# System Manager - Session-Orchestrator**
3. **1. Kern-Prinzip**
4. **2. Workflow-Übersicht**
5. **3. Modus-Verhalten**
6. **4. Session-Start Erkennung**
7. **5. Analyse-Workflow**
8. **6. SESSION_BRIEFING Struktur**
9. **7. system-control - Spezielle Rolle**
10. **8. Agent-Hierarchie**
11. **9. Kritische Regeln**
12. **10. Quick-Start**
13. **Dateien in diesem Skill-Ordner**

**Kurzfassung:** Skill beschreibt den System-Manager als System-Erklärer. Erstellt SESSION_BRIEFING.md für den Technical Manager. Workflow: Session-Start → Status erfassen → Referenzen laden → Agent-Kompendium → Briefing schreiben. system-control wird als ERSTER Agent nach Briefing hervorgehoben.

**Referenzen im Skill:**

| Referenz | Pfad |
|----------|------|
| SYSTEM_OPERATIONS | `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` |
| COMMUNICATION_FLOWS | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` |
| ERROR_CODES | `.claude/reference/errors/ERROR_CODES.md` |
| MQTT_TOPICS | `.claude/reference/api/MQTT_TOPICS.md` |

**Agent-Referenz:** `.claude/agents/System Manager/system-manager.md`

**Weitere Skills/Agenten:** system-control (spezielle Rolle)

### Skill-Inhalt – session-planning.md

**Abschnitte:**

1. **Frontmatter** (name: session-planning)
2. **# Session-Planning Skill**
3. **Zweck**
4. **User-Input Template**
5. **Analyse-Workflow**
6. **Plan-Output Template**
7. **Agent-Empfehlungen für Technical Manager**
8. **Dateien in diesem Skill-Ordner**

**Kurzfassung:** Skill für Hardware-Test-Session-Planung. Erstellt Testpläne für ESP32↔Server. Enthält User-Input-Template, Analyse-Workflow, Plan-Output-Template und Agent-Empfehlungen (esp32-debug, server-debug, mqtt-debug, db-inspector, system-control).

**Referenzen in session-planning.md:**

| Referenz | Pfad |
|----------|------|
| COMMUNICATION_FLOWS | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` |
| MQTT_TOPICS | `.claude/reference/api/MQTT_TOPICS.md` |
| ERROR_CODES | `.claude/reference/errors/ERROR_CODES.md` |
| LOG_LOCATIONS | `.claude/reference/debugging/LOG_LOCATIONS.md` |
| SYSTEM_OPERATIONS | `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` |
| ESP32 Skill | `.claude/skills/esp32-development/SKILL.md` |
| Server Skill | `.claude/skills/server-development/SKILL.md` |

**Abweichung:** session-planning.md beschreibt eigene Ordnerstruktur:

```
.claude/skills/session-planning/
├── SKILL.md
├── templates/SESSION_PLAN_TEMPLATE.md
└── examples/EXAMPLE_SESSION_PLAN.md
```

Diese Struktur existiert nicht. Die Datei liegt unter `.claude/skills/System Manager/session-planning.md`; `templates/` und `examples/` fehlen im System-Manager-Ordner.

---

## C) Referenzdokumente

### Vom Agent referenziert

| Pfad | Kurzbeschreibung | Umfang |
|------|------------------|--------|
| `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | Befehlsreferenz für Debug-Operations | 1083 Zeilen |
| `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | 7 Datenflüsse (Sensor, Actuator, Emergency, etc.) | 718 Zeilen |
| `.claude/reference/errors/ERROR_CODES.md` | Fehlercodes ESP32/Server | 743 Zeilen |
| `.claude/reference/api/MQTT_TOPICS.md` | MQTT-Topic-Schema | 828 Zeilen |
| `.claude/reference/api/REST_ENDPOINTS.md` | REST-API-Endpoints | 802 Zeilen |
| `.claude/reference/api/WEBSOCKET_EVENTS.md` | WebSocket-Events | 800 Zeilen |

### Vom Skill (SKILL.md) referenziert

| Pfad | Kurzbeschreibung | Umfang |
|------|------------------|--------|
| `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | Befehlsreferenz | 1083 Zeilen |
| `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | Datenflüsse | 718 Zeilen |
| `.claude/reference/errors/ERROR_CODES.md` | Fehlercodes | 743 Zeilen |
| `.claude/reference/api/MQTT_TOPICS.md` | MQTT-Topics | 828 Zeilen |

### Vom Skill (session-planning.md) referenziert

| Pfad | Kurzbeschreibung | Umfang |
|------|------------------|--------|
| `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | Siehe oben | 718 Zeilen |
| `.claude/reference/api/MQTT_TOPICS.md` | Siehe oben | 828 Zeilen |
| `.claude/reference/errors/ERROR_CODES.md` | Siehe oben | 743 Zeilen |
| `.claude/reference/debugging/LOG_LOCATIONS.md` | Log-Pfade, Capture-Methoden | 648 Zeilen |
| `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | Siehe oben | 1083 Zeilen |
| `.claude/skills/esp32-development/SKILL.md` | ESP32-Skill | – |
| `.claude/skills/server-development/SKILL.md` | Server-Skill | – |

### Prüfung Verlinkung

| Referenz | Agent | SKILL.md | session-planning.md |
|----------|-------|----------|---------------------|
| SYSTEM_OPERATIONS_REFERENCE | ✅ | ✅ | ✅ |
| COMMUNICATION_FLOWS | ✅ | ✅ | ✅ |
| ERROR_CODES | ✅ | ✅ | ✅ |
| MQTT_TOPICS | ✅ | ✅ | ✅ |
| REST_ENDPOINTS | ✅ | ❌ | ❌ |
| WEBSOCKET_EVENTS | ✅ | ❌ | ❌ |
| LOG_LOCATIONS | ❌ | ❌ | ✅ |
| esp32-development SKILL | ❌ | ❌ | ✅ |
| server-development SKILL | ❌ | ❌ | ✅ |

**Lücken:**

- REST_ENDPOINTS, WEBSOCKET_EVENTS: nur im Agent, nicht in den Skills.
- LOG_LOCATIONS: nur in session-planning.md, nicht im Agent.
- Skills unter System Manager referenzieren nur 4 der 6 vom Agent genannten Referenzen.

---

## D) Strukturmuster (system-manager)

- **Referenzierung:** Tabellen mit „Referenz | Pfad | Inhalt“; Phase 2 als strukturierte Leseanweisung.
- **„Lies zuerst“-Pattern:** Phase 0 – STATUS.md als erster Schritt.
- **Inline-Links:** Pfade als Backtick-Code.
- **Workflow:** Phasen 0–4; Template mit festen Sektionen.
- **Unterschied zu system-control:** Kein Section-Mapping wie „Wann lesen? Section Inhalt“; stattdessen thematische Referenz-Tabelle.
- **Lücken:** session-planning.md beschreibt Ordnerstruktur, die nicht existiert (`templates/`, `examples/`). REST_ENDPOINTS und WEBSOCKET_EVENTS fehlen in den Skills.

---

# Vergleich der Strukturmuster

| Aspekt | system-control | system-manager |
|--------|----------------|----------------|
| Agent-Pfad | `.claude/agents/system-control.md` (flach) | `.claude/agents/System Manager/system-manager.md` (Unterordner) |
| Skill-Anzahl | 1 Datei | 2 Dateien (SKILL.md, session-planning.md) |
| Eigen-Skill-Referenz im Agent | Keine | Keine |
| Referenz-Format | Section-Mapping + Tabelle | Thematische Tabelle |
| Delegation | Explizite Tabelle | Im Briefing: Agent-Kompendium |
| Hauptreferenz | SYSTEM_OPERATIONS_REFERENCE | SYSTEM_OPERATIONS_REFERENCE + 5 weitere |
| Referenzanzahl im Agent | 3 | 6 |
| Referenzanzahl im Skill | 1 | 4 (SKILL.md) + 7 (session-planning.md) |

---

**Ende des Berichts**
