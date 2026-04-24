# AutomationOne — Flow-Referenz

> **Version:** 1.4 | **Stand:** 2026-02-25
> **Zweck:** Definiert ALLE Arbeitsabläufe im AutomationOne Agent-System
> **Genutzt von:** agent-manager (primär), system-control, Technical Manager
> **Erweiterung:** Neue Flows werden als neue FLOW-Sektion am Ende angehängt

---

## FLOW-INDEX

| ID | Flow-Name | Trigger | Endzustand |
|----|-----------|---------|------------|
| F1 | Test-Flow | Robin startet Session | `META_ANALYSIS.md` (Legacy) und/oder `META_DEV_HANDOFF.md` / Chat-Handoffs beim TM |
| F2 | Dev-Flow | TM entscheidet nach Test-Flow | Implementierung verifiziert |
| F3 | Docker-Monitoring Setup | Robin: "Monitoring aufsetzen" | Monitoring-Stack läuft |
| F4 | Hardware-Test-Flow | `/hardware-test` oder `hw-test --profile` | HW_TEST_FINAL_REPORT.md mit Scorecard |

---

## F1: TEST-FLOW (Analyse & Debugging)

### F1.1 Überblick

**Ziel:** Systematische Analyse des Systemzustands. Alle Probleme identifizieren, dokumentieren, priorisieren.
**Trigger:** Robin führt `session.sh` aus und schreibt "Session gestartet" in VS Code.
**Ergebnis:** `META_ANALYSIS.md` (Report-Korrelation, Legacy) und/oder **code-first** `META_DEV_HANDOFF.md` mit Developer-Paketen; beim Technical Manager oder direkt an Dev-Agents.

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

SCHRITT 8: META-ANALYST (Cross-System / optional LETZTE Report-Instanz)
├── Wer: meta-analyst (Agent in VS Code)
├── Trigger: TM-Befehl **oder** direkter Robin-Auftrag (Code-first)
├── Default neu: Repo mit Read/Grep/Glob, Patterns aus *-development Skills; **Developer-Handoffs** für esp32-/server-/frontend-/mqtt-dev
├── Legacy: Liest ALLE Reports in .claude/reports/current/ → META_ANALYSIS.md (Timeline, Widersprüche, Kaskaden)
├── Erzeugt: .claude/reports/current/META_DEV_HANDOFF.md (Default persistiert) und/oder META_ANALYSIS.md (Legacy)
├── REGEL: Keine Produktcode-Änderung durch meta-analyst; keine erfundenen Topics/APIs
├── REGEL (Legacy): Widersprüche dokumentieren statt „raten“
└── Nächster Schritt: Robin kopiert Ausgabe zum TM **oder** startet *-dev mit den Paketen
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

## F5: REPRODUZIERBARER AGENTEN-FLOW (Backend→Frontend→UI/UX mit verify-plan Gates)

### F5.1 Überblick

**Ziel:** Verifizierter End-to-End-Ablauf für Änderungen, die Backend (MQTT/Server), Frontend (Verdrahtung) und UI/UX (konsistente Darstellung) betreffen. Mit harten Gates und reproduzierbaren Agenten-Kommandos (Wokwi/Playwright).

**Trigger:** AUT-130 (STACK-QA-01) oder vergleichbare Multi-Layer-Features (z.B. AUT-110, AUT-111, AUT-113, AUT-114, AUT-115 aus INC-2026-04-22).

**Ergebnis:** Vier Tests-grün + verifikation Report + Master-Branch ready (oder Merge-Blocker).

---

### F5.2 Schritte

```
GATE 1: BACKEND CONTRACT VERIFIZIERT
├── Wer: server-dev (oder mqtt-dev bei MQTT-Kontrakt-Änderung)
├── Auftrag: Implementierung + lokale Verifikation
├── Befehle:
│   ├── cd "El Servador/god_kaiser_server"
│   ├── pytest tests/ -v  [lokaler Unit/Integration Test]
│   ├── python -m ruff check src/  [Syntax + Konvention]
├── Output: Alle Tests grün, keine Ruff-Fehler
├── Gate-Kontrolle (Primäragent): server-dev bestätigt Readiness
├── BLOCKER: Falls Test rot → Debugging vor Frontend-Verdrahtung
└── Nächster Schritt: → GATE 2

GATE 2: FRONTEND WIRING ABGESCHLOSSEN + LOKALES BUILD
├── Wer: frontend-dev
├── Auftrag: WebSocket-Events verdrahten, API-Client aktualisieren, Types synchron
├── Befehle:
│   ├── cd "El Frontend"
│   ├── npm run build  [Vite Build]
│   ├── npm run lint  [ESLint + TypeScript]
│   ├── npm run test  [Vitest Unit-Tests]
├── Output: Build erfolgreich, Tests grün, keine ESLint-Fehler
├── Gate-Kontrolle: frontend-dev + server-dev (Review MQTT/WS-Konsumption)
├── BLOCKER: Falls Build fehlerhaft oder Types-Mismatch → Iteration
└── Nächster Schritt: → GATE 3

GATE 3: WOKWI-REPRO (Firmware + MQTT + Backend)
├── Wer: esp32-dev ODER Orchestrator mit preflight
├── Auftrag: Wokwi-Szenarien auswählen, durchlaufen, Baseline-Metriken prüfen
├── Vorbedingung: `make wokwi-check` grün (CLI verfügbar)
├── Befehle (Auswahl nach Feature-Typ):
│   ├── make wokwi-seed  [Datenbank mit 3 Test-ESPs seeden]
│   ├── make wokwi-list  [Alle 192 Szenarien anzeigen; passend filtern]
│   │   Für MQTT/Heartbeat-Feature:
│   │   ├── make wokwi-test-scenario SCENARIO="El Trabajante/tests/wokwi/scenarios/01-boot/boot-success.yaml"
│   │   ├── make wokwi-test-scenario SCENARIO="El Trabajante/tests/wokwi/scenarios/05-heartbeat/heartbeat-basic.yaml"
│   │   ├── make wokwi-test-scenario SCENARIO="El Trabajante/tests/wokwi/scenarios/02-mqtt/mqtt-connect-retry.yaml"
│   │   Für Sensor/Actuator/Rule-Feature:
│   │   ├── make wokwi-test-scenario SCENARIO="El Trabajante/tests/wokwi/scenarios/03-sensors/sensor-read-success.yaml"
│   │   ├── make wokwi-test-scenario SCENARIO="El Trabajante/tests/wokwi/scenarios/04-actuators/actuator-control-success.yaml"
│   │   ├── make wokwi-test-scenario SCENARIO="El Trabajante/tests/wokwi/scenarios/07-rules/rule-fire-simple.yaml"
│   │   Für Offline/Recovery-Feature:
│   │   ├── make wokwi-test-scenario SCENARIO="El Trabajante/tests/wokwi/scenarios/06-offline/offline-recovery-basic.yaml"
│   │   ├── make wokwi-test-scenario SCENARIO="El Trabajante/tests/wokwi/scenarios/02-mqtt/mqtt-reconnect-with-state.yaml"
├── Output: Alle Szenarien green (exit code 0), Backend-Logs konsistent mit Erwartung
├── Gate-Kontrolle: esp32-dev (oder server-debug bei MQTT-Fehler)
├── BLOCKER: Falls Szenario fehlschlägt → seriellen Log analysieren, esp32-debug/mqtt-debug konsultieren
└── Nächster Schritt: → GATE 4

GATE 4: PLAYWRIGHT E2E-TEST (Frontend + UI/UX)
├── Wer: frontend-dev
├── Auftrag: Playwright-Tests starten, Feature-spezifische Tests validieren
├── Befehle:
│   ├── make e2e-up  [E2E-Stack starten mit Docker]
│   ├── make e2e-test-backend-smoke  [Backend E2E Smoke, ~2 min]
│   ├── Danach: Feature-spezifische Playwright-Tests (Subset auswählen):
│   │   Beispiele aus "El Frontend/tests/e2e/scenarios/":
│   │   - heartbeat/runtime-health.spec.ts  [Runtime-Health-Badge] → für AUT-124
│   │   - actuator/concurrent-rules.spec.ts  [Toast-Finalitaet] → für AUT-123
│   │   - dashboard/device-offline.spec.ts  [Offline-Status] → für AUT-110/111
│   │   - chart/historical-gap-detection.spec.ts  [Chart-Gaps] → für AUT-113
│   │   - conflict-manager/arbitration-modal.spec.ts  [Conflict UI] → für AUT-114
│   │   Auflistung per: npx playwright test --list --config=El\ Frontend/playwright.e2e-01.config.ts
│   ├── npx playwright test "El Frontend/tests/e2e/scenarios/<Feature>*" --config="El Frontend/playwright.e2e-01.config.ts"
│   ├── Optional bei UI-Änderungen: npx playwright test --ui [Interaktiv debuggen]
│   ├── make e2e-down  [Stack stoppen]
├── Output: Alle E2E-Tests grün, Screenshots/Videos bei Fehler
├── Gate-Kontrolle: frontend-dev (oder auto-debugger bei Fehler)
├── BLOCKER: Falls Test fehlschlägt → frontend-debug konsultieren, Video analysieren
└── Nächster Schritt: → VERIFIKATION ABGESCHLOSSEN

VERIFICATION SUMMARY
├── Wer: Orchestrator oder Robin
├── Artefakt: `.claude/reports/current/F5_VERIFICATION_REPORT.md`
├── Inhalt:
│   ├── Gate 1–4 Status (PASS/FAIL)
│   ├── Commit-Hashes (Firmware, Server, Frontend)
│   ├── Test-Ausgaben zusammengefasst
│   ├── Alle Befehle und Ausgaben (nachvollziehbar)
│   └── Offene Punkte (falls vorhanden)
├── Wenn alle PASS: Ready für Merge/Deploy
├── Falls BLOCKER: → Issue-Beschreibung aktualisieren, Zyklus wiederholen
```

---

### F5.3 Abhängigkeitsmatrix (Reihenfolge ist verbindlich)

```
GATE 1 (Server) [must complete before]
    ↓
GATE 2 (Frontend Wiring) [must complete before]
    ↓
GATE 3 (Wokwi ESP32 + MQTT + Backend Integration) [must complete before]
    ↓
GATE 4 (Playwright E2E) [completes F5]
```

---

### F5.4 Feature-Type → Szenario-Mapping (Hilfe bei Gate 3)

| Feature-Typ | Beispiel-Issue | Boot | Heartbeat | MQTT-Connect | Sensor | Actuator | Rule | Offline |
|-------------|--------|------|-----------|--------------|--------|----------|------|---------|
| MQTT-Kontrakt | AUT-54, AUT-55 | ✅ | ✅ | ✅ | — | — | — | — |
| Heartbeat-Change | AUT-68, AUT-121 | ✅ | ✅ | ✅ | — | — | — | — |
| Offline-Handling | AUT-110, AUT-111 | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ |
| Sensor-Add | AUT-127 | ✅ | — | — | ✅ | — | ✅ | — |
| Actuator-Control | AUT-127 | ✅ | — | — | — | ✅ | ✅ | — |
| Rule-Logic | AUT-111 | ✅ | — | — | ✅ | ✅ | ✅ | ✅ |
| Frontend-UI | AUT-113, AUT-124 | — | — | — | — | — | — | — |
| Toast/Modal | AUT-123, AUT-114 | ✅ | — | — | ✅ | ✅ | ✅ | — |

**Lesbeispiel:** Feature "Offline-Handling" (AUT-110) wählt Szenarien aus **Boot + Heartbeat + Sensor + Actuator + Rule + Offline** Kategorien.

---

### F5.5 Repro-Befehle (Kopierbar für Agents)

```bash
# === GATE 1: Backend Unit + Integration Tests ===
cd "El Servador/god_kaiser_server"
pytest tests/unit/ tests/integration/ -v --tb=short
python -m ruff check src/ mqtt/

# === GATE 2: Frontend Build + Lint + Unit Test ===
cd "El Frontend"
npm run build
npm run lint
npm run test

# === GATE 3: Wokwi Szenarien (MQTT-Features) ===
cd "${WORKSPACE_ROOT}"
make wokwi-check
make wokwi-seed
# Option A: Quick (Boot + Heartbeat + MQTT)
make wokwi-test-scenario SCENARIO="El Trabajante/tests/wokwi/scenarios/01-boot/boot-success.yaml"
make wokwi-test-scenario SCENARIO="El Trabajante/tests/wokwi/scenarios/05-heartbeat/heartbeat-basic.yaml"
make wokwi-test-scenario SCENARIO="El Trabajante/tests/wokwi/scenarios/02-mqtt/mqtt-connect-retry.yaml"
# Option B: Offline (alle Offline-relevanten)
make wokwi-test-scenario SCENARIO="El Trabajante/tests/wokwi/scenarios/06-offline/offline-recovery-basic.yaml"
# Option C: All 22 CI scenarios (wenn verfügbar, ~10 min)
make wokwi-test-full

# === GATE 4: Playwright E2E ===
cd "${WORKSPACE_ROOT}"
make e2e-up
make e2e-test-backend-smoke
# Feature-spezifisch (Beispiel: Runtime-Health für AUT-124)
npx playwright test "El Frontend/tests/e2e/scenarios/*runtime-health*" \
  --config="El Frontend/playwright.e2e-01.config.ts" \
  --project=chromium
make e2e-down
```

---

### F5.6 Validierungskriterien (Gate-Checklisten)

| Gate | Agent/Rolle | Input-Dateien | Output | Pass-Kriterium |
|------|----------|--------------|--------|----------------|
| 1 | server-dev | `El Servador/god_kaiser_server/src/`, `tests/` | `pytest exit=0`, `ruff exit=0` | Exit-Codes alle 0 |
| 2 | frontend-dev | `El Frontend/src/`, `tests/unit/` | `npm run build exit=0`, `npm run test exit=0` | Vite-Build fehlerfrei, Tests grün |
| 3 | esp32-dev / Orchestrator | `El Trabajante/`, Wokwi-Szenarien | `wokwi-cli run` Ausgabe | Alle Szenarien exit=0, keine CRASH-Logs |
| 4 | frontend-dev | E2E-Stack, `El Frontend/tests/e2e/` | `playwright test` exit=0 | Alle Selected Tests grün, keine Flakiness |

---

### F5.7 Known Limitations & Workarounds

| Limitation | Bereich | Workaround |
|-----------|---------|-----------|
| `wokwi-cli` nicht installiert (Stand 22.04.) | Gate 3 | `make wokwi-check` führt Preflight aus; falls fehlgeschlagen: Installation dokumentieren, Z.B. `npm install -g wokwi-cli@latest` |
| Playwright Headless in CI nur | Gate 4 | Lokal: `npx playwright test --ui` für interaktives Debugging |
| Wokwi-Szenario-Nummern (191 vs 192) | Gate 3 | `make wokwi-list` gibt aktuelle Zählung aus; Makefile-Kommentar aktualisieren nach neuen Szenarien |

---

### F5.8 Integration in AUT-130 und Verwandte Issues

**AUT-130 (STACK-QA-01):** Dieser Flow F5 ist die **technische Ausführungsanleitung** für AUT-130. 

**Zugeordnete Issues, die F5 nutzen:**
- AUT-110 (P0, Alarm bei Nacht-Regel-Skip) → Gate 1–4 mit Offline-Szenarien
- AUT-111 (P0, Critical-Rule Degraded) → Gate 1–4 mit Rule-Fire-Szenarien
- AUT-113 (P1, HistoricalChart Gap-Marker) → Gate 4 mit chart-gap Spec
- AUT-114 (P2, Conflict-Manager UI) → Gate 4 mit conflict-arbitration Spec
- AUT-115 (P2, Cockpit-Kachel) → Gate 4 mit cockpit Spec

---

<!-- NEUE FLOWS HIER ANHÄNGEN -->
<!-- Format: ## F{N}: FLOW-NAME -->
<!-- Gleiche Struktur: Überblick, Schritte, Datenfluss, Validierungskriterien -->