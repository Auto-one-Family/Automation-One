# TM-Auftrag 01: Wokwi Analyse – Netzwerkaufbau, Docker, CI, ESP Pending Approval

**Verfasser:** Robin (System-Kontext)  
**Format:** Einzelgespräch mit Technical Manager  
**Ziel:** IST-Zustand erfassen, offene Punkte klären, Referenz aktualisieren

---

## 0. Referenzdokumente für TM (Robin mitliefern)

**Diese Dateien zuerst lesen – sie liefern die Grundlage für gezielte Analyse. Ohne sie ist der TM blind.**

| Priorität | Pfad (relativ zu Projektroot) | Inhalt |
|-----------|-------------------------------|--------|
| 1 | `.claude/reference/testing/TEST_ENGINE_REFERENCE.md` | Test-Pyramide, Wokwi-Befehle, Makefile-Targets, CI-Coverage (163 Szenarien, 138 in CI), `logs/wokwi/` |
| 2 | `.claude/reference/debugging/LOG_LOCATIONS.md` | Sektion 4: Wokwi Serial – `--serial-log-file`, RFC2217, MQTT-Injection, `wokwi.toml` |
| 3 | `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | Sektion 5.3: Wokwi-Simulation, Build, `wokwi-cli` |
| 4 | `.claude/reference/testing/flow_reference.md` | F4: Test-Log-Analyse – test-log-analyst liest `logs/wokwi/reports/` |
| 5 | `.claude/reference/api/MQTT_TOPICS.md` | Topic-Struktur – Wokwi simuliert Heartbeat, Sensor, Actuator |
| 6 | `.claude/skills/test-log-analyst/SKILL.md` | Wokwi-Log-Quellen, Befehlsausgabe, JUnit/JSON-Reports |

**Zusätzliche Reports (aktueller Stand):**

| Pfad | Zweck |
|------|-------|
| `.claude/reports/current/Wokwi_Full_Integration.md` | Entwicklerbefehle v3, Phasen 0.1–5.1 |
| `.claude/reports/current/WOKWI_INTEGRATION_AUDIT.md` | Audit-Stand |
| `.claude/reports/Testrunner/test.md` | Letzte Test-Log-Analyse (Wokwi-Sektion) |

---

## 1. Referenzdateien für TM-Session hochladen

| # | Datei | Zweck |
|---|-------|-------|
| 1 | `.claude/reports/current/Wokwi_Full_Integration.md` | Entwicklerbefehle v3, Phasen 0.1–5.1 |
| 2 | `.claude/reports/current/WOKWI_INTEGRATION_AUDIT.md` | Audit-Stand |
| 3 | `.claude/reports/current/verifikation_phase3_wokwi.md` | Verifikationsauftrag Phase 1–3 |
| 4 | `.claude/reference/testing/TEST_ENGINE_REFERENCE.md` | Test-Pyramide, Wokwi-Befehle |
| 5 | `.claude/reference/testing/TEST_WORKFLOW.md` | Wokwi-Limitationen, Szenario-Format |
| 6 | `.claude/skills/esp32-development/SKILL.md` | ESP32-Kontext, Build-Commands |
| 7 | `.github/workflows/wokwi-tests.yml` | Aktueller CI-Workflow |
| 8 | `scripts/run-wokwi-tests.py` | Python-Runner, ACTIVE_CATEGORIES |
| 9 | `docker/mosquitto/mosquitto.conf` | MQTT-Broker für Wokwi |

---

## 2. IST-Zustand (Fakten)

### 2.1 Netzwerkintegration

- **Wokwi CLI** nutzt `wokwi-gateway` für MQTT (externe Cloud).
- **Wokwi-Simulation** bindet sich an MQTT-Broker – lokal oder CI.
- **CI:** `.github/mosquitto/mosquitto.conf` wird für Docker-Mosquitto in CI verwendet.
- **Docker-Netz:** `automationone-net` (bridge); alle Container im gleichen Netz.
- **Port 1883:** MQTT im Docker-Netz nicht am Host exponiert; E2E nutzt `docker exec` für Publish/Subscribe.

### 2.2 CI-Status

- **Workflow:** `wokwi-tests.yml` – Build-Firmware + 12 Test-Jobs + test-summary.
- **Tiered CI-Triggering:** Phase 0.2 – **BLOCKER** – nicht implementiert.
  - Aktuell: Jeder Push ~50–60 min (alle ~135 Szenarien).
  - Hobby-Plan: 200 min/Monat → nur ~3–4 Runs/Monat.
- **Core-Jobs 01–07:** Noch for-loops mit `|| true` – Phase 0.4 ausstehend.
- **Python-Runner:** Extended (08-onewire, 09-hardware, 09-pwm, 10-nvs, gpio) bereits aktiv.
- **Retry + JUnit XML:** Phase 3.3 – Retry-Logik + JUnit XML im Runner fehlt noch.

### 2.3 ESP Pending Approval

- **Problem:** Ursprünglich war „pending approval“ nicht reproduzierbar.
- **Flow:** `device_discovered` → Frontend zeigt pending → Admin approved/rejected → `device_approved`/`device_rejected`.
- **Wokwi:** ESP32 simuliert Heartbeat; Server muss Pending-State korrekt handhaben.
- **Relevanz:** In Wokwi-Szenarien muss geprüft werden, ob der Approval-Flow szenario-tauglich abgebildet ist.

### 2.4 Dokumentation

- **Wokwi_Full_Integration.md:** Existiert; Phasen 0.1–5.1 und Befehle definiert.
- **Erweiterung:** SYSTEM_OPERATIONS_REFERENCE Section 5.3, esp32-debug, meta-analyst, LOG_LOCATIONS – Wokwi-spezifische Inhalte fehlen.

---

## 3. Offene Fragen (für TM)

1. **Netzwerkaufbau:** Welche Wokwi-spezifischen Netzwerk-Konfigurationen (Gateway, MQTT-Broker-URL, Ports) sind für lokale vs. CI-Umgebung relevant? Wie dokumentieren wir dies klar?
2. **Docker-Integration:** Wann läuft der Mosquitto-Broker in CI? Wird er vor jedem Wokwi-Job gestartet oder als Service parallel? Wie ist die Abhängigkeitskette?
3. **CI-Budget:** Mit welcher Priorität soll Phase 0.2 (Tiered Triggering) umgesetzt werden? Sind Push = quick, PR = full, manual = wählbar die gewünschten Trigger?
4. **ESP Pending Approval:** Welche Szenarien decken den Approval-Flow ab? Existieren Szenarien für `device_discovered` → `pending_approval` → `device_approved`? Falls nicht, welche Schritte würden dafür fehlen?
5. **Dokumentations-Aktualisierung:** Welche Referenzen sollen zuerst ergänzt werden (LOG_LOCATIONS, SYSTEM_OPERATIONS, esp32-debug, meta-analyst, run-wokwi-tests.py README)?

---

## 4. Bereiche für Detail-Analyse

| Bereich | Dateien | Fokus |
|-------|---------|-------|
| Netzwerk | `wokwi.toml`, `diagram.json`, `.github/workflows/wokwi-tests.yml` | Gateway, MQTT-URL, Ports |
| Docker | `docker-compose.ci.yml`, `.github/mosquitto/`, CI-Steps | Mosquitto-Start, depends_on |
| CI-Trigger | `wokwi-tests.yml` | `on:`, `paths`, `workflow_dispatch`, scope |
| Szenarien | `tests/wokwi/scenarios/06-config/`, `tests/wokwi/scenarios/` | Config, Approval, Pending |
| Python-Runner | `scripts/run-wokwi-tests.py` | ACTIVE_CATEGORIES, SKIP_SCENARIOS, Retry |

### 4.1 Wo suchen / Was suchen

| Schicht | Wo suchen | Was suchen |
|---------|-----------|------------|
| **Firmware** | `El Trabajante/wokwi.toml`, `platformio.ini` | `rfc2217ServerPort`, `wokwi.serial.baud`, `wokwi_simulation` |
| **CI** | `.github/workflows/wokwi-tests.yml` | Jobs `01-boot` bis `12-gpio`, `mosquitto`, `WOKWI_CLI_TOKEN` |
| **Broker** | `docker/mosquitto/mosquitto.conf`, `.github/mosquitto/` | `listener`, `allow_anonymous`, Port 1883 |
| **Logs** | `logs/wokwi/reports/` | `junit_*.xml`, `test_report_*.json`, Retry-Info |
| **Szenarien** | `El Trabajante/tests/wokwi/scenarios/` | `pending`, `approval`, `heartbeat`, `device_discovered` |

### 4.2 Agent-Befehle für gezielte Analyse

**TM formuliert Befehle → Robin führt Agent in VS Code aus → Report zurück zum TM.**

| Analyse-Ziel | Agent | TM-Befehl (Kern) |
|--------------|-------|------------------|
| Wokwi-Architektur, Szenarien-Struktur | esp32-dev | Analysiere `El Trabajante/tests/wokwi/scenarios/` – welche Kategorien decken Approval/Pending ab? |
| Wokwi-Test-Logs, CI vs lokal | test-log-analyst | Analysiere `logs/wokwi/reports/` – JUnit XML, JSON; vergleiche mit `gh run view --log` bei CI-Failure |
| Flow-Konsistenz (F4 Test-Log) | agent-manager | Prüfe test-log-analyst gegen flow_reference F4 – passt Output zu Anforderungen? |
| System-Status vor Wokwi-Test | system-control | Führe `make wokwi-ensure-mqtt` aus, dann `make wokwi-test-quick` – Report in SYSTEM_CONTROL_REPORT |

---

## 5. Empfohlene Agents & Skills

| Zweck | Agent | Skill |
|-------|-------|-------|
| Wokwi-Architektur, Szenarien, Build | esp32-dev | esp32-development |
| CI-Workflow, GitHub Actions | — | system-control (Befehle) |
| Log-Analyse Wokwi | test-log-analyst | test-log-analyst |
| Flow-Konsistenz | agent-manager | agent-manager |
| System-Status | system-control | system-control |

---

## 6. Verknüpfung mit anderen Punkten

- **Punkt 2 (Docker):** MQTT-Broker-Config, CI-Overrides.
- **Punkt 6 (Test Engine):** Wokwi als Teil der Test-Pyramide.

---

## 7. Randinformationen (Full-Stack-Kontext)

| Kontext | Info |
|---------|------|
| **Datenfluss** | Wokwi ESP32 → MQTT (lokal/CI) → Server (sensor_handler, heartbeat_handler) → DB + WebSocket → Frontend |
| **Pending Approval** | `device_discovered` → Frontend zeigt pending → Admin approved/rejected; API filtert `pending_approval` aus `GET /api/v1/esp/devices` |
| **CI-Budget** | Wokwi Hobby-Plan: 200 min/Monat – jeden Push = ~50–60 min → nur ~3–4 Runs/Monat ohne Tiered Triggering |
| **Log-Pfad Wokwi** | `logs/wokwi/reports/` (JSON, JUnit); Serial: `--serial-log-file` oder `logs/wokwi/serial/` |
