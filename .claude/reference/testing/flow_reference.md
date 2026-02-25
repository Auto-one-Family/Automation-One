# AutomationOne — Flow-Referenz

> **Version:** 1.4 | **Stand:** 2026-02-25
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
| F4 | Hardware-Test-Flow | `/hardware-test` oder `hw-test --profile` | HW_TEST_FINAL_REPORT.md mit Scorecard |

---

## F1: TEST-FLOW (Analyse & Debugging)

### F1.1 Überblick

**Ziel:** Systematische Analyse des Systemzustands. Alle Probleme identifizieren, dokumentieren, priorisieren.
**Trigger:** Robin führt `session.sh` aus und schreibt "Session gestartet" in VS Code.
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

SCHRITT 2: SYSTEM-CONTROL ERSTELLT BRIEFING
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
├── REGEL: system-control (Briefing) erstellt KEINE Agent-Befehle
├── REGEL: system-control (Briefing) entscheidet NICHT welcher Agent läuft
├── Prinzip: Wissenstransfer, nicht Befehlsvorgabe
└── Nächster Schritt: Robin kopiert SESSION_BRIEFING.md zum TM → SCHRITT 3

SCHRITT 3: TM ANALYSIERT UND FORMULIERT BEFEHLE
├── Wer: Technical Manager (Claude Desktop — NICHT in VS Code)
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
├── Gibt alle Befehle an Robin zurück
└── Nächster Schritt: Robin führt system-control aus → SCHRITT 4

SCHRITT 4: SYSTEM-CONTROL GENERIERT LOGS
├── Wer: system-control (Agent in VS Code)
├── Trigger: Robin kopiert TM-Befehl in VS Code Chat
├── Aktion: Führt konkrete Befehlsketten aus:
│   - Docker-Container inspizieren
│   - ESP32 verbinden (falls Hardware vorhanden)
│   - MQTT-Traffic generieren/beobachten
│   - API-Calls an El Servador auslösen
│   - Datenbank-Queries ausführen
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
├── Wer: esp32-debug, server-debug, mqtt-debug (je einzeln)
├── Trigger: Robin kopiert je einen TM-Befehl in VS Code Chat
├── Input pro Agent:
│   - SYSTEM_CONTROL_REPORT.md (enthält STATUS.md-Infos + Befehlsergebnisse)
│   - Bereichsspezifische Logs und Dateien
│   - KEIN erneutes Laden von STATUS.md nötig (ist in SC-Report)
├── Erzeugt je: .claude/reports/current/{AGENT}_REPORT.md
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
├── Wer: Technical Manager (Claude Desktop)
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

### F1.3 Datenflussddiagramm

```
session.sh ──→ STATUS.md
                  │
                  ▼
      system-control(B) ──→ SESSION_BRIEFING.md ──→ [zum TM]
                                                        │
                                                        ▼
                                                   TM formuliert
                                                   Agent-Befehle
                                                        │
                  ┌─────────────────────────────────────┘
                  ▼
          system-control ──→ SC_REPORT.md (enthält STATUS.md-Infos)
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
   esp32-debug server-debug mqtt-debug
        │         │         │
        ▼         ▼         ▼
   ESP32_RPT   SERVER_RPT  MQTT_RPT
        │         │         │
        └─────────┼─────────┘
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

Der agent-manager prüft für F1:

| Schritt | Agent | Muss haben | Muss lesen | Muss erzeugen |
|---------|-------|------------|------------|---------------|
| 2 | system-control (Briefing) | Zugriff auf STATUS.md, alle Referenz-Docs | logs/current/STATUS.md | SESSION_BRIEFING.md |
| 4 | system-control | Bash-Zugriff, Docker-Befehle | STATUS.md, TM-Auftrag | SC_REPORT.md mit Timestamps |
| 5 | esp32-debug | Read-Only Tools | SC_REPORT.md, ESP32-Logs | ESP32_DEBUG_REPORT.md |
| 5 | server-debug | Read-Only Tools | SC_REPORT.md, Server-Logs | SERVER_DEBUG_REPORT.md |
| 5 | mqtt-debug | Read-Only Tools | SC_REPORT.md, MQTT-Logs | MQTT_DEBUG_REPORT.md |
| 6 | /collect-reports | Read + Write | Alle Reports in current/ | CONSOLIDATED_REPORT.md |
| 8 | meta-analyst | Read-Only Tools | ALLE Reports | META_ANALYSIS.md |

### F1.5 Bekannte Informationskette

```
STATUS.md Informationen fließen so:
STATUS.md → system-control (Briefing) → SESSION_BRIEFING.md → TM
STATUS.md → system-control → SC_REPORT.md → Debug-Agents

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
├── Wer: Technical Manager (Claude Desktop)
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

**Ziel:** Monitoring-Stack (Loki, Alloy, Prometheus, Grafana) einrichten.
**Trigger:** Robin oder TM entscheidet dass Monitoring benötigt wird.
**Ergebnis:** `docker compose --profile monitoring up -d` startet den vollständigen Stack.

### F3.2 Schritte (8 Blöcke)

```
Block 1: Vorbereitung — Verzeichnisse, .env, .gitignore
Block 2: Loki — Log-Speicher (test: curl localhost:3100/ready)
Block 3: Alloy — Log-Sammler (test: Loki-Query nach Server-Logs)
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
| 2 | `curl http://localhost:3100/ready` | "ready" |
| 3 | Loki-Query nach Service-Logs | Log-Einträge vorhanden |
| 5 | `curl http://localhost:8000/metrics` | Prometheus-Format |
| 6 | Prometheus UI → Targets | el-servador = "UP" |
| 8 | Grafana :3000 → Datasources | Loki + Prometheus grün |

---

## F4: HARDWARE-TEST-FLOW (Universelle Hardware-Verifikation)

### F4.1 Ueberblick

**Ziel:** Universeller Hardware-Test fuer jeden Sensor/Aktor. Agent-orchestriert mit minimaler Robin-Interaktion.
**Trigger:** Robin startet `/hardware-test` oder `hw-test --profile {name}`.
**Ergebnis:** HW_TEST_FINAL_REPORT.md mit Scorecard (PASS/FAIL pro Check).

### F4.2 Schritte

```
PHASE 0: PROFIL & PRE-CHECK
├── Wer: Skill hardware-test (Main-Thread)
├── Aktion: Profil laden, validieren, Stack pruefen
├── Robin: Bestaetigt Voraussetzungen (ESP geflasht, Captive Portal fertig)
└── Naechste Phase: → PHASE 1

PHASE 1: SESSION START + BRIEFING
├── Wer: start_session.sh + system-control
├── Aktion: Session starten, STATUS.md + SESSION_BRIEFING.md erstellen
├── Robin: Keine Interaktion
└── Naechste Phase: → PHASE 2

PHASE 2: DEVICE SETUP (AUTOMATISCH)
├── Wer: auto-ops (Rolle 5, via Task)
├── Aktion: Device registrieren, genehmigen, Sensoren/Aktoren anlegen, Config-Push
├── Erzeugt: HW_TEST_PHASE_SETUP.md
├── Robin: Keine Interaktion
└── Naechste Phase: → PHASE 3

PHASE 3: HARDWARE VERBINDEN (ROBIN)
├── Wer: Robin (physisch)
├── Aktion: Sensoren/Aktoren nach Wiring-Guide verkabeln
├── Robin: Bestaetigt "fertig"
└── Naechste Phase: → PHASE 4

PHASE 4: LIVE-VERIFIKATION (AUTOMATISCH)
├── Wer: auto-ops (Rolle 5, via Task)
├── Aktion: Heartbeat, Sensor-Daten, Actuator, DB, Grafana pruefen
├── Optional: Debug-Agents delegieren bei Problemen
├── Erzeugt: HW_TEST_PHASE_VERIFY.md
├── Robin: Keine Interaktion
└── Naechste Phase: → PHASE 5

PHASE 5: STABILITAETSTEST (AUTOMATISCH, 30 MIN)
├── Wer: auto-ops (Rolle 5, via Task)
├── Aktion: 6x Polling (5-Min-Takt), Statistik, Drift-Erkennung
├── Erzeugt: HW_TEST_PHASE_STABILITY.md
├── Robin: Keine Interaktion
└── Naechste Phase: → PHASE 6

PHASE 6: META-ANALYSE + REPORT
├── Wer: auto-ops → Task(meta-analyst)
├── Aktion: Cross-Report-Analyse, Final Report + Scorecard
├── Erzeugt: HW_TEST_META_ANALYSIS.md + HW_TEST_FINAL_REPORT.md
├── Robin: Ergebnis pruefen
└── Ende
```

### F4.3 Datenflussdiagramm

```
Profil (.yaml)
    │
    ▼
Skill (hardware-test) ──→ Pre-Check
    │
    ├──→ start_session.sh ──→ STATUS.md
    │
    ├──→ Task(system-control) ──→ SESSION_BRIEFING.md
    │
    ├──→ Task(auto-ops Phase 2) ──→ HW_TEST_PHASE_SETUP.md
    │         └──→ R/W HW_TEST_STATE.json (phase, status, timestamp)
    │
    ├──→ Robin: Hardware verkabeln
    │
    ├──→ Task(auto-ops Phase 4) ──→ HW_TEST_PHASE_VERIFY.md
    │         ├──→ R/W HW_TEST_STATE.json
    │         ├──→ Task(esp32-debug) ──→ HW_TEST_ESP32_DEBUG.md
    │         ├──→ Task(server-debug) ──→ HW_TEST_SERVER_DEBUG.md
    │         ├──→ Task(mqtt-debug) ──→ HW_TEST_MQTT_DEBUG.md
    │         └──→ Task(frontend-debug) ──→ HW_TEST_FRONTEND_DEBUG.md
    │
    ├──→ Task(auto-ops Phase 5) ──→ HW_TEST_PHASE_STABILITY.md
    │         └──→ R/W HW_TEST_STATE.json
    │
    └──→ Task(meta-analyst) ──→ HW_TEST_META_ANALYSIS.md
                                    │
                                    ▼
                          HW_TEST_FINAL_REPORT.md
```

### F4.3.1 State-Persistence (Crash-Recovery)

**Datei:** `.claude/reports/current/HW_TEST_STATE.json`

auto-ops ist stateless zwischen Task()-Aufrufen. STATE.json speichert den aktuellen Zustand persistent:

```json
{
  "phase": "verify",
  "status": "in_progress",
  "started_at": "2026-02-25T10:00:00Z",
  "last_updated": "2026-02-25T10:15:00Z",
  "profile": "sht31",
  "errors": [],
  "results": {}
}
```

Jeder Task(auto-ops)-Aufruf liest STATE.json bei Start und aktualisiert es nach Abschluss.

### F4.4 Validierungskriterien

| Phase | Agent/Skill | Muss lesen | Muss erzeugen |
|-------|-------------|------------|---------------|
| 0 | hardware-test Skill | Profil YAML | Validiertes Profil |
| 1 | system-control | STATUS.md, Profil | SESSION_BRIEFING.md |
| 2 | auto-ops | Profil, Server API, STATE.json | HW_TEST_PHASE_SETUP.md, STATE.json |
| 3 | Robin | Wiring-Guide | Bestaetigung |
| 4 | auto-ops | Phase 2 Report, MQTT, DB, STATE.json | HW_TEST_PHASE_VERIFY.md, STATE.json |
| 5 | auto-ops | Phase 4 Report, API, MQTT, STATE.json | HW_TEST_PHASE_STABILITY.md, STATE.json |
| 6 | meta-analyst | Alle HW_TEST_*.md | HW_TEST_META_ANALYSIS.md |
| 6 | auto-ops | HW_TEST_META_ANALYSIS.md | HW_TEST_FINAL_REPORT.md |

### F4.5 Known Issues (Trockentest 2026-02-25)

Erkenntnisse aus dem F4-Trockentest (Mock-Server End-to-End ohne Hardware):

| # | Issue | Severity | Phase | Workaround |
|---|-------|----------|-------|------------|
| 1 | ~~`audit_logs.request_id` VARCHAR(36) zu klein~~ | ~~CRITICAL~~ | Phase 2 | **FIXED** (Branch: fix/trockentest-bugs) — VARCHAR(255) + Alembic Migration |
| 2 | ~~`GET /api/v1/sensors/data` 500 Error~~ | ~~MEDIUM~~ | Phase 4 | **FIXED** — timezone-naive datetimes fuer TIMESTAMP WITHOUT TIME ZONE |
| 3 | ~~Out-of-Range-Werte ohne Validierung~~ | ~~LOW~~ | Phase 5 | **FIXED** — Physical range check mit quality="critical" + Prometheus Metrik |
| 4 | ~~Grafana Dashboard Metric-Prefix~~ | ~~LOW~~ | Phase 4 | **NOT REPRODUCIBLE** — Dashboard verwendet korrekt `god_kaiser_*` |

**Verifizierte Korrekte Werte:**
- MQTT Topics: `kaiser/{zone}/esp/{esp_id}/system/heartbeat`, `kaiser/{zone}/esp/{esp_id}/sensor/{gpio}/data`
- Heartbeat Payload: `ts` (int), `uptime` (int), `heap_free` (int), `wifi_rssi` (int)
- Sensor Payload: `ts` (int), `esp_id` (str), `gpio` (int), `sensor_type` (str), `raw` (numeric), `raw_mode` (boolean)
- Prometheus Metriken: Prefix `god_kaiser_*` (NICHT `automationone_*`)
- Auth Token: Nested `tokens.access_token` (NICHT top-level `access_token`)
- Login: admin / Admin123#
- Device-ID Pattern: `^(ESP_[A-F0-9]{6,8}|MOCK_[A-Z0-9]+)$`
- Approve Endpoint: `POST /api/v1/esp/devices/{esp_id}/approve` mit leerem JSON Body `{}`

**Trockentest-Report:** `.claude/reports/current/mock-trockentest-2026-02-25.md`

---

<!-- NEUE FLOWS HIER ANHÄNGEN -->
<!-- Format: ## F{N}: FLOW-NAME -->
<!-- Gleiche Struktur: Überblick, Schritte, Datenfluss, Validierungskriterien -->