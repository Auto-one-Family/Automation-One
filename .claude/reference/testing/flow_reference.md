# AutomationOne — Flow-Referenz

> **Version:** 1.1 | **Stand:** 2026-02-07
> **Zweck:** Definiert ALLE Arbeitsabläufe im AutomationOne Agent-System
> **Genutzt von:** agent-manager (primär), system-control, Technical Manager
> **Erweiterung:** Neue Flows werden als neue FLOW-Sektion am Ende angehängt

---

## FLOW-INDEX

| ID | Flow-Name | Trigger | Endzustand |
|----|-----------|---------|------------|
| F1 | Test-Flow | Robin startet Session | META_ANALYSIS.md beim TM |
| F2 | Dev-Flow | TM entscheidet nach Test-Flow | Implementierung verifiziert |
| F3 | Docker-Monitoring Setup | Robin: "Monitoring aufsetzen" | Monitoring-Stack läuft |
| F4 | Test-Log-Analyse | Robin: /test, "CI rot", "Test-Failures" | test.md im Testrunner-Report |

---

## F1: TEST-FLOW (Analyse & Debugging)

### F1.1 Überblick

**Ziel:** Systematische Analyse des Systemzustands. Alle Probleme identifizieren, dokumentieren, priorisieren.
**Trigger:** Robin führt `scripts/debug/start_session.sh` aus und schreibt "Session gestartet" in VS Code.
**Ergebnis:** META_ANALYSIS.md mit vollständiger Problemliste beim Technical Manager.

### F1.2 Schritte

```
SCHRITT 1: SESSION STARTEN
├── Wer: Robin (manuell)
├── Aktion: scripts/debug/start_session.sh ausführen (Git Bash)
├── Erzeugt: logs/current/STATUS.md
│   Inhalt: Git-Status, Docker-Container-Status, Ports, Hardware-Info,
│           Container-Ressourcen, Netzwerk-Connectivity, Volume-Status
├── Danach: Robin schreibt in VS Code Claude: "Session gestartet" + Hardware-Info
└── Nächster Schritt: → SCHRITT 2

SCHRITT 2: SYSTEM-CONTROL (BRIEFING-MODUS) ERSTELLT BRIEFING
├── Wer: system-control (Agent in VS Code, Briefing-Modus)
├── Trigger: "Session gestartet" im Chat
├── Liest: logs/current/STATUS.md + alle Referenz-Dokumentation
├── Erzeugt: .claude/reports/current/SESSION_BRIEFING.md
│   Inhalt:
│   ├── Projekt-Grundlagen (Architektur, Konventionen)
│   ├── Vollständiger System-Status (aus STATUS.md)
│   ├── Session-Kontext (Hardware-Info vom User)
│   ├── Agent-Kompendium (ALLE Agents mit Capabilities)
│   ├── Referenz-Verzeichnis (alle verfügbaren Dokumente)
│   └── Workflow-Struktur (wie Agents zusammenarbeiten)
├── REGEL: system-control erstellt KEINE Agent-Befehle
├── REGEL: system-control entscheidet NICHT welcher Agent läuft
├── Prinzip: Wissenstransfer, nicht Befehlsvorgabe
└── Nächster Schritt: Robin kopiert SESSION_BRIEFING.md zum TM → SCHRITT 3

SCHRITT 3: TM ANALYSIERT UND FORMULIERT BEFEHLE
├── Wer: Technical Manager (claude.ai — NICHT in VS Code)
├── Erhält: SESSION_BRIEFING.md von Robin
├── Aktion: Analysiert Status, formuliert Agent-Befehle
│   a) ZUERST: system-control Befehl (der "Starter")
│   b) DANACH: Debug-Agent-Befehle (einzeln, je einer pro Agent)
├── Jeder Befehl enthält:
│   1. KONTEXT: Wer der Agent ist, was passiert ist
│   2. AUFTRAG: Was genau zu tun ist
│   3. DATEIEN: Welche Dateien lesen/ändern (vollständige Pfade)
│   4. OUTPUT: Wohin das Ergebnis geschrieben wird
│   5. REGELN: Was NICHT getan werden darf
├── Befehlstemplate (Beispiel für Debug-Agent):
│   Du bist [Agent-Name]. Kontext: Session läuft, SESSION_BRIEFING beim TM.
│   Auftrag: Analysiere [Bereich]-Logs. Output: .claude/reports/current/[AGENT]_[MODUS]_REPORT.md
│   Regeln: Read-Only, keine Code-Änderungen.
├── Gibt alle Befehle an Robin zurück
└── Nächster Schritt: Robin führt system-control aus → SCHRITT 4

SCHRITT 4: SYSTEM-CONTROL GENERIERT LOGS
├── Wer: system-control (Agent in VS Code)
├── Trigger: Robin kopiert TM-Befehl in VS Code Chat
├── Aktion: Führt konkrete Befehlsketten aus (KEINE Log-Prüfung, KEINE Diagnose):
│   - Docker-Container inspizieren
│   - ESP32 verbinden (falls Hardware vorhanden)
│   - MQTT-Traffic generieren/beobachten
│   - API-Calls an El Servador auslösen
│   - Datenbank-Queries ausführen
├── Am Ende (optional): frontend_container.log Refresh: docker compose logs --tail=500 el-frontend
│   - Loki-Exports (*_loki_*.log) erstellt start_session.sh bei Session-Start (bei --profile monitoring)
├── Erzeugt: .claude/reports/current/SYSTEM_CONTROL_REPORT.md
│   Inhalt:
│   ├── Ausgeführte Befehle mit Timestamps
│   ├── Ergebnisse jedes Befehls (Erfolg/Fehler + Output)
│   ├── Relevante Infos aus STATUS.md (eingebettet)
│   ├── Beobachtete Anomalien
│   └── Empfohlene Bereiche für Debug-Agents
├── REGEL: system-control MUSS VOR Debug-Agents laufen
├── GRUND: Debug-Agents analysieren die Logs die system-control erzeugt
└── Nächster Schritt: Robin führt Debug-Agents einzeln aus → SCHRITT 5

SCHRITT 5: DEBUG-AGENTS ANALYSIEREN (EINZELN)
├── Wer: esp32-debug, server-debug, mqtt-debug, frontend-debug (je einzeln)
├── Trigger: Robin kopiert je einen TM-Befehl in VS Code Chat
├── Input pro Agent:
│   - SYSTEM_CONTROL_REPORT.md (enthält STATUS.md-Infos + Befehlsergebnisse)
│   - Bereichsspezifische Logs und Dateien
│   - KEIN erneutes Laden von STATUS.md nötig (ist in SC-Report)
├── Erzeugt je: .claude/reports/current/{AGENT}_[MODUS]_REPORT.md
│   Inhalt:
│   ├── Analysierte Quellen (was wurde gelesen)
│   ├── Befunde nach Severity (CRITICAL / WARNING / INFO)
│   ├── Korrelationen mit anderen Bereichen
│   └── Offene Fragen (was konnte nicht geklärt werden)
├── REGEL: Debug-Agents sind READ-ONLY — sie ändern NICHTS
├── REGEL: Jeder Agent läuft in EIGENER Session (kein Shared Context)
└── Nächster Schritt: Robin ruft /collect-reports auf → SCHRITT 6

SCHRITT 6: REPORTS KONSOLIDIEREN
├── Wer: /collect-reports Skill (in VS Code)
├── Trigger: Robin tippt /collect-reports
├── Aktion: Sammelt alle Reports aus .claude/reports/current/
├── Erzeugt: .claude/reports/current/CONSOLIDATED_REPORT.md
│   Inhalt: Alle Einzel-Reports zusammengefasst
└── Nächster Schritt: Robin kopiert CONSOLIDATED_REPORT.md zum TM → SCHRITT 7

SCHRITT 7: TM BEAUFTRAGT META-ANALYSE
├── Wer: Technical Manager (claude.ai)
├── Erhält: CONSOLIDATED_REPORT.md von Robin
├── Formuliert: meta-analyst Befehl
└── Nächster Schritt: Robin führt meta-analyst aus → SCHRITT 8

SCHRITT 8: META-ANALYST (LETZTE ANALYSE-INSTANZ)
├── Wer: meta-analyst (Agent in VS Code)
├── Trigger: Robin kopiert TM-Befehl in VS Code Chat
├── Liest: ALLE Reports in .claude/reports/current/
├── Erzeugt: .claude/reports/current/META_ANALYSIS.md
│   Inhalt:
│   ├── Zeitliche Korrelation zwischen Reports
│   ├── Widersprüche zwischen Agent-Befunden
│   ├── Kausalketten (A verursacht B verursacht C)
│   ├── Lücken (was wurde NICHT untersucht)
│   └── Priorisierte Problemliste
├── REGEL: meta-analyst sucht KEINE Lösungen
├── REGEL: meta-analyst ist die LETZTE Analyse-Instanz
└── Nächster Schritt: Robin kopiert META_ANALYSIS.md zum TM
    TM entscheidet: Weitere Analyse oder → F2 Dev-Flow
```

### F1.3 Datenflussdiagramm

```
start_session.sh ──→ STATUS.md
                        │
                        ▼
          system-control (Briefing) ──→ SESSION_BRIEFING.md ──→ [zum TM]
                                                        │
                                                        ▼
                                                   TM formuliert
                                                   Agent-Befehle
                                                        │
                  ┌─────────────────────────────────────┘
                  ▼
          system-control ──→ SC_REPORT.md (enthält STATUS.md-Infos)
                  │
        ┌─────────┼─────────┬─────────┐
        ▼         ▼         ▼         ▼
   esp32-debug server-debug mqtt-debug frontend-debug
        │         │         │         │
        ▼         ▼         ▼         ▼
   ESP32_RPT   SERVER_RPT  MQTT_RPT  FRONTEND_RPT
        │         │         │         │
        └─────────┼─────────┼─────────┘
                  ▼
          /collect-reports ──→ CONSOLIDATED_REPORT.md ──→ [zum TM]
                                                             │
                                                             ▼
                                                      TM formuliert
                                                      meta-analyst Befehl
                                                             │
                  ┌──────────────────────────────────────────┘
                  ▼
          meta-analyst ──→ META_ANALYSIS.md ──→ [zum TM]
                                                    │
                                                    ▼
                                              TM entscheidet:
                                              Weitere Analyse?
                                              oder → F2 Dev-Flow
```

### F1.4 Validierungskriterien

Der agent-manager prüft für F1. Gültige Modi für Debug-Reports: `BOOT`, `CONFIG`, `SENSOR`, `ACTUATOR`, `DEBUG`, `E2E`.

| Schritt | Agent | Muss haben | Muss lesen | Muss erzeugen |
|---------|-------|------------|------------|---------------|
| 2 | system-control (Briefing-Modus) | Zugriff auf STATUS.md, alle Referenz-Docs | logs/current/STATUS.md | SESSION_BRIEFING.md |
| 4 | system-control | Bash-Zugriff, Docker-Befehle | STATUS.md, TM-Auftrag | SC_REPORT.md mit Timestamps |
| 5 | esp32-debug | Read-Only Tools | SC_REPORT.md, ESP32-Logs | ESP32_[MODUS]_REPORT.md |
| 5 | server-debug | Read-Only Tools | SC_REPORT.md, Server-Logs | SERVER_[MODUS]_REPORT.md |
| 5 | mqtt-debug | Read-Only Tools | SC_REPORT.md, MQTT-Logs | MQTT_[MODUS]_REPORT.md |
| 5 | frontend-debug | Read-Only Tools | SC_REPORT.md, Frontend-Logs | FRONTEND_[MODUS]_REPORT.md |
| 6 | /collect-reports | Read + Write | Alle Reports in current/ | CONSOLIDATED_REPORT.md |
| 8 | meta-analyst | Read-Only Tools | ALLE Reports | META_ANALYSIS.md |

### F1.5 Bekannte Informationskette

```
STATUS.md Informationen fließen so:
STATUS.md → system-control (Briefing-Modus) → SESSION_BRIEFING.md → TM
STATUS.md → system-control (Ops-Modus) → SC_REPORT.md → Debug-Agents

Debug-Agents müssen STATUS.md NICHT separat laden weil:
system-control bezieht STATUS.md-Infos in seinen Report ein.
Der SC_REPORT enthält bereits: Container-Status, Ports, Netzwerk, etc.
```

---

## F2: DEV-FLOW (Implementierung)

### F2.1 Überblick

**Ziel:** Identifizierte Probleme durch gezielte Dev-Agent-Aufträge beheben.
**Trigger:** TM entscheidet nach Test-Flow dass Probleme präzise genug für Implementierung sind.
**Ergebnis:** Code-Änderungen implementiert, zurück zum Test-Flow zur Verifikation.

### F2.2 Schritte

```
SCHRITT 1: TM IDENTIFIZIERT PROBLEME
├── Wer: Technical Manager (claude.ai)
├── Input: META_ANALYSIS.md aus Test-Flow
├── Aktion: Probleme priorisieren, Dev-Agent-Befehle formulieren
├── REGEL: Je ein Befehl pro Dev-Agent
├── REGEL: Jeder Befehl ist eigenständig (kein Kontext-Erbe)
└── Nächster Schritt: Robin führt Dev-Agents einzeln aus → SCHRITT 2

SCHRITT 2: DEV-AGENTS IMPLEMENTIEREN (EINZELN)
├── Wer: esp32-dev, server-dev, mqtt-dev, frontend-dev (je nach Bedarf)
├── Trigger: Robin kopiert TM-Befehl in VS Code Chat
├── Aktion: Implementiert die angeforderten Änderungen
├── Erzeugt: Code-Änderungen + optionaler Dev-Report
├── REGEL: Nur der zuständige Dev-Agent ändert seinen Bereich
│   esp32-dev → El Trabajante/ (C++/PlatformIO)
│   server-dev → El Servador/ (Python/FastAPI)
│   mqtt-dev → MQTT-Layer (Broker-Config, Topic-Handling)
│   frontend-dev → El Frontend/ (Vue 3/TypeScript/Pinia)
└── Nächster Schritt: → SCHRITT 3

SCHRITT 3: ZURÜCK ZUM TEST-FLOW
├── IMMER nach jeder Implementierung
├── Verifikation dass die Änderungen funktionieren
├── Neue Probleme durch Änderungen erkennen
└── → F1 Test-Flow von vorne
```

### F2.3 Wechselkriterien

**Test→Dev Wechsel wenn:**
- Alle Probleme durch Test-Flow + meta-analyst identifiziert
- Problemliste präzise genug für gezielte Dev-Aufträge
- Keine weiteren Analyse-Runden nötig
- TM entscheidet den Wechsel (NICHT die Agents)

**Dev→Test Wechsel:** IMMER nach jeder Implementierung.

### F2.4 Validierungskriterien

| Agent | Bereich | Schreibzugriff auf | Darf NICHT ändern |
|-------|---------|-------------------|-------------------|
| esp32-dev | El Trabajante/ | C++, platformio.ini | Server, Frontend, Docker |
| server-dev | El Servador/ | Python, requirements.txt | Firmware, Frontend, Docker |
| mqtt-dev | MQTT-Layer | Mosquitto-Config, Topic-Handler | Firmware, Frontend |
| frontend-dev | El Frontend/ | Vue, TypeScript, CSS | Server, Firmware, Docker |

---

## F3: DOCKER-MONITORING SETUP (Infrastruktur)

### F3.1 Überblick

**Ziel:** Monitoring-Stack (Loki, Promtail, Prometheus, Grafana) einrichten.
**Trigger:** Robin oder TM entscheidet dass Monitoring benötigt wird.
**Ergebnis:** `docker compose --profile monitoring up -d` startet den vollständigen Stack.

### F3.2 Schritte (8 Blöcke)

```
Block 1: Vorbereitung — Verzeichnisse, .env, .gitignore
Block 2: Loki — Log-Speicher (test: curl localhost:3100/ready)
Block 3: Promtail — Log-Sammler (test: Loki-Query nach Server-Logs)
Block 4: Agent-Docs — Loki-Queries in bestehende Agents ergänzen
Block 5: FastAPI /metrics — Instrumentierung (test: curl localhost:8000/metrics)
Block 6: Prometheus — Metriken-Speicher (test: Targets UP in localhost:9090)
Block 7: Agent-Docs — Prometheus-Queries in bestehende Agents ergänzen
Block 8: Grafana — Dashboards + Datasource-Provisioning
```

### F3.3 Abhängigkeiten

```
Block 1 → Block 2 → Block 3 → Block 4
                                  ↓
              Block 5 → Block 6 → Block 7
                                     ↓
                                  Block 8
```

### F3.4 Validierungskriterien

| Block | Test-Command | Erwartung |
|-------|-------------|-----------|
| 2 | `curl http://localhost:3100/ready` (Windows: `curl.exe`) | "ready" |
| 3 | Loki-Query nach Service-Logs | Log-Einträge vorhanden |
| 5 | `curl http://localhost:8000/metrics` | Prometheus-Format |
| 6 | Prometheus UI → Targets | el-servador = "UP" |
| 8 | Grafana :3000 → Datasources | Loki + Prometheus grün |

---

## F4: TEST-LOG-ANALYSE (Eigenständig)

### F4.1 Überblick

**Ziel:** Test-Framework-Output (pytest, Vitest, Playwright, Wokwi) analysieren – lokal und CI.
**Trigger:** Robin: /test, "CI rot", "Test-Failures", "warum schlägt Test X fehl".
**Ergebnis:** `.claude/reports/Testrunner/test.md` mit strukturierter Analyse.

**Abgrenzung:** test-log-analyst ist NICHT Teil des F1 Test-Flows. Er analysiert Test-Outputs, nicht Runtime-Logs.

### F4.2 Schritte

```
SCHRITT 1: ROBIN RUFT AGENT AUF
├── Trigger: /test oder "CI rot" oder "Test-Failures" etc.
├── Agent: test-log-analyst
└── Nächster Schritt: → SCHRITT 2

SCHRITT 2: BEFEHLSLISTE AUSGEBEN
├── Wer: test-log-analyst
├── Aktion: Gruppierte Befehle ausgeben (mit vollem Projektpfad)
│   - Erster Befehl: cd "c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one"
│   - Backend: make test-be-capture
│   - Frontend: make test-fe-unit
│   - Wokwi: make wokwi-test-full
│   - E2E: make e2e-up → make e2e-test → make e2e-down
├── REGEL: PowerShell-kompatibel, Copy-Paste-fähig
└── Nächster Schritt: Robin führt Befehle aus → SCHRITT 3

SCHRITT 3: ROBIN SIGNALISIERT
├── Robin: "fertig" oder "Fehler bei X" oder "abgebrochen"
└── Nächster Schritt: → SCHRITT 4

SCHRITT 4: LOG-ANALYSE UND REPORT-UPDATE
├── Wer: test-log-analyst
├── Liest: logs/backend/, logs/frontend/, logs/wokwi/reports/, logs/server/ (Test-Outputs)
├── Optional: gh run view <run-id> --log (bei CI)
├── Erzeugt/aktualisiert: .claude/reports/Testrunner/test.md
│   Inhalt: Sektionen pro Bereich (pytest, Vitest, Playwright, Wokwi), Status, Fehler, Empfehlungen
├── REGEL: Report fortlaufend aktualisieren (nicht einmalig)
└── Ende
```

### F4.3 Validierungskriterien

| Schritt | Agent | Muss haben | Muss erzeugen |
|---------|-------|------------|---------------|
| 2 | test-log-analyst | Bash für gh CLI | Befehlsliste |
| 4 | test-log-analyst | Read, Grep, Glob, Bash | test.md |

---

<!-- NEUE FLOWS HIER ANHÄNGEN -->
<!-- Format: ## F{N}: FLOW-NAME -->
<!-- Gleiche Struktur: Überblick, Schritte, Datenfluss, Validierungskriterien -->
