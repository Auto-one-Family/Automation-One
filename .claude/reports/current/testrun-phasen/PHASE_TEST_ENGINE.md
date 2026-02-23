## Auftrag: Test-Engine komplett analysieren, fixen und auf Produktionsqualitaet bringen

**Ziel-Repo:** auto-one (C:/Users/PCUser/Documents/PlatformIO/Projects/Auto-one/)
**Kontext:** CI/CD-Audit (2026-02-22) hat gezeigt: 4/8 Pipelines jetzt gruen nach PR #8. Aber 4 Pipelines haben noch pre-existing Issues (Docker-Crash, MQTT-Timeout, fehlender Dockerfile-Target, CVEs). Die Test-Engine hat strukturelle Probleme die echte Bugs durchlassen. Dieser Auftrag bringt ALLES auf Vordermann.
**Bezug:** Phasenplan Testinfrastruktur Phase 0.5 + Phase 1, Vorbereitung erster Testlauf
**Prioritaet:** Kritisch
**Datum:** 2026-02-22 (Update: 2026-02-23)

---

# An den naechsten Agenten

Du bekommst hier einen umfassenden Auftrag zur kompletten Test-Engine von AutomationOne. Dein Job ist es, ALLES systematisch durchzugehen, zu analysieren, zu fixen und sicherzustellen dass die Tests echte Bugs finden koennen — nicht nur gruen leuchten.

**WICHTIG:** Du sollst nicht blind fixen. Du sollst VERSTEHEN was jeder Test tut, RECHERCHIEREN was Best Practice ist, und dann GEZIELT verbessern. Wenn ein Test sinnlos ist, sag das. Wenn ein Test fehlt der wichtig waere, schlag ihn vor.

---

## Teil 0: Was du ueber AutomationOne wissen musst

### Architektur (3 Schichten)

```
El Frontend (Vue 3 + TypeScript)
    │ REST + WebSocket
El Servador (FastAPI + Python 3.11)
    │ MQTT (QoS 0/1/2)
El Trabajante (ESP32 Firmware, C++ Arduino)
```

### Was das System tut

IoT-Framework fuer Sensor/Aktor-Netzwerke. ESP32-Mikrocontroller lesen Sensoren (Temperatur, pH, EC, Feuchtigkeit, etc.) und steuern Aktoren (Pumpen, Ventile, Relays). Alles geht per MQTT an einen FastAPI-Server, der die Daten verarbeitet, in PostgreSQL speichert und ueber WebSocket ans Vue-Dashboard schickt. Eine Cross-ESP Logic Engine evaluiert Regeln und schaltet Aktoren.

### Warum das relevant ist fuer Tests

Die Tests muessen das ZUSAMMENSPIEL pruefen — nicht nur einzelne Funktionen. Ein Sensor-Wert der im Backend korrekt verarbeitet wird aber im Frontend falsch angezeigt wird, ist ein Bug. Ein MQTT-Handler der funktioniert aber bei Reconnect Nachrichten verliert, ist ein Bug. Ein Safety-System das im Unit-Test greift aber unter Last versagt, ist ein Bug.

---

## Teil 1: Aktueller Zustand (nach PR #8)

### Pipeline-Status

| Pipeline | Status | Problem |
|----------|--------|---------|
| pr-checks | GRUEN | Gefixt in PR #8 |
| frontend-tests | GRUEN | Gefixt in PR #8, hat test-summary Job |
| esp32-tests | GRUEN | Hat test-summary Job mit EnricoMi |
| wokwi-tests | Core GRUEN, Error-Injection in Background-Pattern | 52 Core (PR) + ~122 Nightly = alle 173 Szenarien in CI. Hat concurrency + Branch-Filter |
| server-tests | Unit GRUEN, Integration TIMEOUT | MQTT-Connect-Loop (pre-existing). Healthcheck bereits gefixt (kein `|| exit 0` mehr). Hat `nc -z` Verify-Step |
| backend-e2e-tests | ROT | Server-Container crashed (pre-existing Docker-Issue). Hat test-summary Job |
| playwright-tests | ROT | Gleicher Docker-Issue. KEIN test-summary Job (einzige Pipeline ohne) |
| security-scan | TEILWEISE GEFIXT | Frontend Dockerfile HAT jetzt Multi-Stage (development/build/production). Python CVEs noch offen |

### Lokale Test-Ergebnisse

| Suite | Ergebnis | Details |
|-------|----------|---------|
| Backend Unit (pytest) | ~766 passed | 0 failures, 0 collection errors (nach PR #8 Fix) |
| Frontend Unit (Vitest) | 1378 passed | 0 failures |
| ESP32 Native (Unity) | 22 passed | 0 failures |
| TypeScript Check (vue-tsc) | 0 Errors | Gefixt in PR #8 |
| Wokwi Core Scenarios | 52 Core in CI | Boot, Sensor, Actuator, Zone, Emergency, Config, Combined, GPIO, I2C, NVS, PWM, Error-Injection |
| Wokwi Nightly Extended | ~122 Nightly in CI | I2C Ext, OneWire, Hardware, PWM Ext, NVS Ext, GPIO Ext |

---

## Teil 2: Test-Verzeichnisstruktur (deine Arbeitsbasis)

### Backend Tests: `El Servador/god_kaiser_server/tests/`

```
tests/
├── conftest.py              (457 Zeilen — globale Fixtures: DB, MQTT, Services)
├── unit/                    (38 Dateien)
│   ├── conftest.py
│   ├── db/repositories/     (test_sensor_repo_i2c.py)
│   ├── test_sensor_type_registry.py    ← I2C-Validierung
│   ├── test_diagnostics_handler.py     ← hatte psutil-Problem (gefixt)
│   ├── test_pwm_validation.py          ← hatte psutil-Problem (gefixt)
│   ├── test_sequence_executor.py       ← hatte psutil-Problem (gefixt)
│   ├── test_sensor_calibration.py      ← Kalibrierung (pH, EC, Temp)
│   ├── test_gpio_validation.py         ← GPIO Pin-Validierung
│   ├── test_gpio_conflict.py           ← Doppelbelegung
│   ├── test_circuit_breaker_unit.py    ← Resilience
│   └── ... (28 weitere)
├── integration/             (44 Testdateien + conftest_logic.py)
│   ├── conftest_logic.py
│   ├── test_mqtt_flow.py               ← MQTT End-to-End
│   ├── test_mqtt_subscriber.py         ← MQTT Subscriber
│   ├── test_emergency_stop.py          ← Safety-System
│   ├── test_logic_engine.py            ← Regel-Evaluation
│   ├── test_logic_engine_resilience.py ← Logic unter Last
│   ├── test_greenhouse_scenarios.py    ← Praxis-Szenarien!
│   ├── test_sensor_anomalies.py        ← Anomalie-Erkennung
│   ├── test_failure_recovery.py        ← Recovery nach Fehler
│   └── ... (35 weitere, inkl. test_auth_security_features, test_multi_value_sensor, test_token_blacklist)
├── esp32/                   (19 Testdateien + conftest + mocks)
│   ├── conftest.py
│   ├── mocks/               (mock_esp32_client, in_memory_mqtt, real_esp32)
│   ├── test_boot_loop.py
│   ├── test_cross_esp.py
│   ├── test_gpio_emergency.py
│   ├── test_mqtt_fallback.py
│   ├── test_performance.py
│   └── ... (12 weitere, inkl. test_integration, test_infrastructure)
└── e2e/                     (9 Testdateien + conftest)
    ├── conftest.py          (1258 Zeilen — E2EConfig, API/MQTT/WebSocket Clients)
    ├── test_e2e_smoke.py
    ├── test_e2e_emergency.py
    ├── test_e2e_recovery.py
    ├── test_sensor_workflow.py
    ├── test_actuator_direct_control.py
    └── ... (4 weitere)
```

### Frontend Tests: `El Frontend/tests/`

```
tests/
├── setup.ts
├── mocks/                   (handlers.ts, server.ts, websocket.ts)
├── unit/                    (43 Dateien)
│   ├── components/          (16 — AddActuatorModal, CommandPalette, charts, ...)
│   ├── composables/         (5 — useWebSocket, useCommandPalette, ...)
│   ├── stores/              (6 — auth, dashboard, esp, logic, ...)
│   ├── utils/               (13 — errorCodeTranslator, databaseColumnTranslator, ...)
│   └── config/              (2 — rule-templates, sensor-schemas)
├── integration/             (LEER — nur .gitkeep)
└── e2e/
    ├── scenarios/           (6 Playwright-Specs: actuator, auth, device-discovery, ...)
    ├── css/                 (15 CSS-Regression-Specs)
    └── helpers/             (api.ts, css.ts, mqtt.ts, websocket.ts)
```

### Firmware Tests: `El Trabajante/tests/`

```
tests/
├── wokwi/
│   ├── scenarios/
│   │   ├── 01-boot/         (2 yaml)
│   │   ├── 02-sensor/       (5 yaml)
│   │   ├── 03-actuator/     (7 yaml)
│   │   ├── 04-zone/         (2 yaml)
│   │   ├── 05-emergency/    (3 yaml)
│   │   ├── 06-config/       (2 yaml)
│   │   ├── 07-combined/     (2 yaml)
│   │   ├── 08-i2c/          (20 yaml — 5 Core PR + 15 Nightly)
│   │   ├── 08-onewire/      (29 yaml — alle Nightly)
│   │   ├── 09-hardware/     (9 yaml — alle Nightly)
│   │   ├── 09-pwm/          (18 yaml — 3 Core PR + 15 Nightly)
│   │   ├── 10-nvs/          (40 yaml — 5 Core PR + 35 Nightly)
│   │   ├── 11-error-injection/ (10 yaml — alle im Background-Pattern, Core PR)
│   │   └── gpio/            (24 yaml — 5 Core PR + 19 Nightly)
│   ├── helpers/
│   │   ├── emergency_cascade.sh
│   │   └── mqtt_inject.py
│   └── diagrams/
│       ├── diagram_extended.json
│       └── diagram_i2c.json
└── native/                  (PlatformIO Unity Tests — 22 Tests)
```

---

## Teil 3: Die 4 roten Pipelines — Was genau kaputt ist

### 3.1 server-tests: Integration Tests MQTT-Timeout

**Symptom:** Integration-Tests hangen in einer MQTT-Connect-Loop und laufen in Timeout.

**Status: TEILWEISE GEFIXT (verify-plan 2026-02-23)**

Der Mosquitto-Healthcheck wurde bereits korrigiert:
```yaml
# AKTUELL in server-tests.yml (korrekt):
--health-cmd "mosquitto_pub -h localhost -p 1883 -t healthcheck -m ok"
--health-interval 5s --health-timeout 5s --health-retries 10 --health-start-period 5s
```
Zusaetzlich existiert ein `nc -z localhost 1883` Verify-Step (30 Retries) VOR pytest.

**Was noch offen ist:**
1. Trotz korrektem Healthcheck + Verify-Step kommt es evtl. noch zu Timeouts — pruefe ob die Integration-Tests ein MQTT-Retry in ihren Fixtures haben
2. Lies `El Servador/god_kaiser_server/tests/integration/conftest.py` — verstehe die MQTT-Connection-Logik
3. Die Tests nutzen `aiomqtt` — pruefe ob Retries mit Backoff implementiert sind

**Recherche-Auftrag:** Suche nach "pytest asyncio mqtt integration test best practices" und "aiomqtt connection retry pattern".

### 3.2 backend-e2e-tests: Server-Container crashed

**Symptom:** Docker Compose Stack startet, aber `el-servador` Container crashed.

**Was du tun musst:**
1. Lies `El Servador/Dockerfile` komplett
2. Lies `docker-compose.ci.yml` und `docker-compose.e2e.yml` komplett
3. Starte den Stack lokal und schau dir die Logs an:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.ci.yml -f docker-compose.e2e.yml \
     up --build postgres mqtt-broker el-servador 2>&1 | head -200
   ```
4. Moegliche Ursachen:
   - **DATABASE_AUTO_INIT**: In ci.yml auf `"true"` gesetzt — pruefe ob der Init-Code funktioniert
   - **shared-infra-net**: Externes Netzwerk muss VOR `docker compose up` existieren (`docker network create shared-infra-net || true`)
   - **Poetry-Dependencies**: Container baut mit `poetry install` — pruefe ob alle Dependencies aufloesbar sind
   - **Alembic Migrations**: Wenn Auto-Init Migrations ausfuehrt und die DB leer ist, koennten Migrations fehlschlagen
5. Schaue in die Container-Logs: `docker logs automationone-server 2>&1 | tail -50`

**Recherche-Auftrag:** Suche nach "FastAPI docker compose healthcheck ci/cd" und "asyncpg connection pool docker compose startup order". Der Server braucht PostgreSQL + MQTT bevor er starten kann — die `depends_on` Konfiguration mit Healthchecks muss korrekt sein.

### 3.3 playwright-tests: Gleicher Docker-Issue + kein Test-Summary

**Symptom:** Gleicher Docker-Stack wie backend-e2e, plus Frontend.

**Status: Frontend Dockerfile GEFIXT (verify-plan 2026-02-23)**

Das Frontend Dockerfile HAT jetzt Multi-Stage-Build (3 Stages: development, build, production).

**Was du tun musst:**
1. Fix zuerst 3.2 (backend-e2e) — Playwright braucht den gleichen Stack plus Frontend
2. `El Frontend/Dockerfile` hat jetzt Multi-Stage (development → build → production) — CHECK
3. Lies `docker-compose.e2e.yml` — `el-frontend` hat `profiles: []` (immer aktiv)
4. Pruefe ob das Frontend korrekt startet: `docker logs automationone-frontend 2>&1 | tail -20`
5. Lies `El Frontend/tests/e2e/scenarios/` — alle 6 Playwright-Specs
6. **NEU:** Fuege test-summary Job hinzu — playwright-tests.yml ist die EINZIGE Pipeline ohne EnricoMi test-summary

### 3.4 security-scan: Frontend Dockerfile + CVEs

**Symptom:** Zwei Probleme:
1. Frontend Dockerfile hat kein `development` Target — Trivy versucht `--target development` und scheitert
2. 7 HIGH CVEs in Python-Dependencies

**Status Problem 1: GEFIXT (verify-plan 2026-02-23)**

Das Frontend Dockerfile HAT jetzt Multi-Stage-Build mit 3 Stages:
- `development` (node:20-alpine, Vite dev server)
- `build` (npm run build)
- `production` (nginx:alpine, statische Dateien)

Die `security-scan.yml` sollte jetzt funktionieren da `--target development` matched.

**Problem 2 — Python CVEs (7 HIGH) — NOCH OFFEN:**
1. Lies `El Servador/god_kaiser_server/pyproject.toml` und `poetry.lock`
2. Identifiziere die betroffenen Pakete: `python-multipart`, `starlette`, `wheel`, `jaraco.context`
3. Recherchiere jede CVE: Ist sie relevant fuer AutomationOne? (z.B. ist ein Upload-CVE in python-multipart relevant wenn keine File-Uploads existieren?)
4. Update die betroffenen Pakete:
   ```bash
   cd "El Servador/god_kaiser_server"
   poetry update python-multipart starlette wheel jaraco.context
   ```
5. Stelle sicher dass die Updates keine Breaking Changes einfuehren (Tests muessen weiterhin gruen sein)

**Recherche-Auftrag:** Suche nach den spezifischen CVE-IDs und pruefe ob sie fuer das AutomationOne-Setup relevant sind. Nicht jede CVE ist ein echtes Risiko.

---

## Teil 4: Strukturelle Probleme in der Test-Engine

Diese Probleme lassen die Pipelines vielleicht gruen leuchten, aber sie untergraben die Testqualitaet.

### 4.1 Mosquitto-Healthcheck ~~ist ueberall kaputt~~ — GEFIXT

**Status: ERLEDIGT (verify-plan 2026-02-23)**

Beide Workflows nutzen jetzt den korrekten Healthcheck OHNE `|| exit 0`:
- `server-tests.yml`: `--health-cmd "mosquitto_pub -h localhost -p 1883 -t healthcheck -m ok"` + nc-Verify-Step
- `esp32-tests.yml`: `--health-cmd "mosquitto_pub -h localhost -p 1883 -t healthcheck -m ok"`

Beide mit `--health-retries 10 --health-start-period 5s`.

### 4.2 Lint-Jobs ~~sind wirkungslos~~ — GEFIXT

**Status: ERLEDIGT (verify-plan 2026-02-23)**

`server-tests.yml` hat KEIN `continue-on-error: true` bei Lint-Jobs. Ruff und Black laufen direkt, `needs: lint` blockiert Unit/Integration bei Lint-Failure. Kein Handlungsbedarf.

### 4.3 Inkonsistente Mosquitto-Startstrategien

**Problem:** Drei verschiedene Ansaetze in den Workflows:
1. `server-tests.yml` + `esp32-tests.yml`: GitHub Actions Service-Container (korrekt)
2. `wokwi-tests.yml`: Manuelles `docker run` mit Inline-Config (funktioniert, aber inkonsistent)
3. `backend-e2e-tests.yml` + `playwright-tests.yml`: Docker Compose (anderer Stack)

**Was du tun musst:** Das ist kein Bug — die verschiedenen Test-Typen brauchen verschiedene Stacks. Aber dokumentiere die Strategie klar und stelle sicher dass JEDER Ansatz einen korrekten Healthcheck hat.

### 4.4 `.github/mosquitto/mosquitto.conf` ~~ist toter Code~~ — WIRD BENUTZT

**Status: KEIN Problem (verify-plan 2026-02-23)**

Die Datei WIRD referenziert — von `docker-compose.ci.yml` und `docker-compose.e2e.yml`:
```yaml
# In docker-compose.ci.yml und docker-compose.e2e.yml:
volumes:
  - ./.github/mosquitto/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro
```
Wokwi-Jobs schreiben zwar Inline-Configs, aber die CI/E2E Compose-Stacks nutzen die Datei. NICHT loeschen.

**Hinweis:** Der Kommentar in der Datei ("Used by: wokwi-tests.yml") ist falsch — sollte "Used by: docker-compose.ci.yml, docker-compose.e2e.yml" heissen.

### 4.5 ~~Kein concurrency-Block in wokwi-tests.yml~~ — GEFIXT

**Status: ERLEDIGT (verify-plan 2026-02-23)**

`wokwi-tests.yml` HAT einen concurrency-Block:
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

### 4.6 ~~Wokwi hat keinen Branch-Filter~~ — GEFIXT

**Status: ERLEDIGT (verify-plan 2026-02-23)**

`wokwi-tests.yml` HAT Branch-Filter (`main, master, develop`) fuer push UND pull_request. Zusaetzlich: `schedule` (Nightly 2 AM UTC) und `workflow_dispatch` fuer manuelle Ausloesung. Path-Filter auf `El Trabajante/**`.

### 4.7 ~~Kein Test-Summary in 2 Pipelines~~ — TEILWEISE GEFIXT

**Status: 1 von 2 erledigt (verify-plan 2026-02-23)**

- `esp32-tests.yml`: HAT jetzt `test-summary` Job mit `EnricoMi/publish-unit-test-result-action@v2` — ERLEDIGT
- `playwright-tests.yml`: Hat KEINEN test-summary Job — NOCH OFFEN
- `backend-e2e-tests.yml`: HAT test-summary Job — war nicht im Original erwaehnt

**Fix noetig:** Fuege test-summary Job in `playwright-tests.yml` analog zu den anderen Pipelines hinzu.

### 4.8 Hardcodierte Test-Credentials

**Problem:** `E2E_TEST_USER=admin` und `E2E_TEST_PASSWORD=Admin123#` stehen im Klartext in `backend-e2e-tests.yml` und `playwright-tests.yml`.

**Einschaetzung:** Fuer CI-Tests akzeptabel (keine echten Credentials), aber unschoen. Optional in GitHub Secrets auslagern.

### 4.9 Artifact-Retention ~~inkonsistent~~ — GROESSTENTEILS KONSISTENT

**Status: GROESSTENTEILS ERLEDIGT (verify-plan 2026-02-23)**

| Artifact | Retention |
|----------|-----------|
| wokwi-firmware | 7 Tage (war 1 Tag, jetzt gefixt) |
| wokwi-test-logs (alle Kategorien) | 7 Tage |
| playwright-report | 7 Tage |
| backend-e2e-results | 7 Tage |
| frontend-test-results | 7 Tage |
| unit/integration (server) | 7 Tage |

Alle Artifacts stehen jetzt konsistent auf 7 Tage. Kein Handlungsbedarf.

---

## Teil 5: Wokwi Error-Injection + Szenarien-Coverage — GROESSTENTEILS ERLEDIGT

### Error-Injection: Status GEFIXT (verify-plan 2026-02-23)

Die 10 Szenarien in `11-error-injection/` benutzen BEREITS das korrekte passive Pattern:
- YAML-Dateien enthalten nur `wait-serial` Steps (passiv)
- MQTT-Injection wird extern via `mosquitto_pub` im CI-Workflow gemacht
- CI Pipeline Job nutzt Background-Pattern (wokwi-cli &, sleep 25, mosquitto_pub, wait $PID)
- Helper-Scripts existieren: `emergency_cascade.sh` und `mqtt_inject.py`

**Noch offen:**
- **VERIFIZIERE** jeden Szenario-Namen gegen die echte Firmware (Serial-Output-Strings)
- Pruefe ob die erwarteten Strings in der Firmware existieren (z.B. "ConfigResponse published", "SENSOR_INIT_FAILED")
- Suche in `El Trabajante/src/` nach diesen Strings

### ~~121 fehlende Szenarien in der Pipeline~~ — ALLE IN CI (verify-plan 2026-02-23)

ALLE 173 Szenarien sind jetzt in der Pipeline:

| Trigger | Jobs | Szenarien |
|---------|------|-----------|
| PR/Push | 16 Core-Jobs | ~52 Szenarien (Boot, Sensor, Actuator, Zone, Emergency, Config, Combined, GPIO 5, I2C 5, NVS 5, PWM 3, Error-Injection 10) |
| Nightly (2 AM UTC) + manual | 6 Extended-Jobs zusaetzlich | ~122 weitere (I2C Ext 15, OneWire 29, Hardware 9, PWM Ext 15, NVS Ext 35, GPIO Ext 19) |

Die Strategie ist bereits korrekt implementiert:
- **PR/Push:** Schnelle Core-Tests fuer schnelles Feedback
- **Nightly + workflow_dispatch:** Vollstaendige Regression mit allen 173 Szenarien

---

## Teil 6: Test-Qualitaet verbessern — Tests muessen echte Bugs finden

### 6.1 Recherche-Auftraege fuer dich

Bevor du Code aenderst, recherchiere diese Themen im Internet:

1. **"IoT backend integration testing best practices 2025"** — Wie testen andere IoT-Plattformen ihre Backend-Integration?
2. **"FastAPI pytest async testing patterns"** — Aktuelle Best Practices fuer async FastAPI-Tests
3. **"MQTT testing strategies IoT ci/cd"** — Wie testet man MQTT-basierte Systeme zuverlaessig?
4. **"Vue 3 Vitest testing patterns components stores"** — Aktuelle Vue 3 Testing-Patterns
5. **"Playwright IoT dashboard e2e testing"** — E2E-Testing fuer IoT-Dashboards
6. **"ESP32 firmware simulation testing wokwi ci"** — Firmware-Testing mit Wokwi in CI/CD
7. **"Docker compose test infrastructure GitHub Actions"** — Docker-Stacks in GitHub Actions
8. **"Trivy security scan Docker multi-stage build"** — Security-Scanning mit Multi-Stage-Builds
9. **"pytest fixture best practices complex test suites"** — Fixture-Organisation fuer grosse Projekte
10. **"sensor data validation testing anomaly detection"** — Wie testet man Sensor-Daten-Validierung?

Nutze die Erkenntnisse um konkrete Verbesserungen vorzuschlagen.

### 6.2 Backend-Tests: Was fehlt oder schwach ist

**Analyse-Aufgaben:**

1. **Integration-Test conftest.py analysieren** (457 Zeilen):
   - Wie werden DB-Sessions gemocked? Ist es ein echtes SQLite oder ein Mock?
   - Wie wird der MQTT-Client gemocked? Kann er Reconnect simulieren?
   - Gibt es Fixtures fuer verschiedene Fehlerzustaende?

2. **test_greenhouse_scenarios.py analysieren**:
   - Welche Praxis-Szenarien werden getestet?
   - Fehlen wichtige Szenarien? (z.B. Sensor-Drift ueber Zeit, Pumpe laeuft zu lange, pH-Wert ausserhalb Bereich)

3. **test_sensor_anomalies.py analysieren**:
   - Welche Anomalien werden erkannt?
   - Werden False Positives getestet?
   - Werden Edge Cases getestet (z.B. Sensor sendet exakt den Grenzwert)?

4. **test_failure_recovery.py analysieren**:
   - Welche Fehler-Szenarien werden getestet?
   - Werden Cascading Failures getestet?
   - Wird getestet was passiert wenn MQTT UND DB gleichzeitig ausfallen?

5. **test_emergency_stop.py analysieren**:
   - Wird getestet ob Emergency-Stop unter Last funktioniert?
   - Wird die <100ms Reaktionszeit geprueft?
   - Wird getestet was passiert wenn Emergency-Stop waehrend einer laufenden Regel ausgeloest wird?

6. **test_sensor_calibration.py analysieren**:
   - Werden alle 9 Sensortypen kalibriert?
   - Werden ungueltige Kalibrierungsdaten getestet?
   - Werden Kalibrierungs-Edge-Cases getestet (z.B. identische Kalibrierpunkte)?

**Verbesserungsvorschlaege umsetzen:**

Basierend auf deiner Analyse und Recherche: Welche Tests fehlen? Was wuerde einen echten Bug in der Produktionsumgebung aufdecken? Denke an:
- Sensor sendet NaN oder Infinity
- MQTT-Broker restartet waehrend Datenfluss
- Zwei ESPs senden gleichzeitig an den gleichen Sensor-GPIO
- Logic Engine: Endlosschleife durch zirkulaere Regeln
- WebSocket-Verbindung bricht ab waehrend Frontend Daten anzeigt
- Datenbank ist voll (Retention nicht gelaufen)
- Kalibrierung mit physikalisch unsinnigen Werten (pH = -5, Temperatur = 500)

### 6.3 Frontend-Tests: Integration-Tests fehlen komplett

**Problem:** `El Frontend/tests/integration/` ist LEER (nur `.gitkeep`).

**Was du tun musst:**
1. Analysiere welche Interaktionen zwischen Komponenten getestet werden sollten
2. Schlag mindestens 5 Integration-Tests vor, z.B.:
   - Store → Component: ESP-Store aendert sich → ESPCard aktualisiert sich
   - WebSocket → Store → Component: Sensor-Daten kommen rein → Chart aktualisiert sich
   - Auth → API → Store: Login → Token gespeichert → API-Calls authentifiziert
   - Rule-Builder → Logic-Store → API: Regel erstellt → an Server gesendet → Bestaetigung

### 6.4 Playwright E2E: Tests muessen echte User-Flows abbilden

**Vorhandene Scenarios (6):**
- actuator, auth, device-discovery, emergency, esp-registration-flow, sensor-live

**Was fehlt (pruefen und ggf. vorschlagen):**
- Login → Dashboard → Zone Navigation → Sensor-Detail (Happy Path)
- Kalibrierungs-Flow (sobald Wizard existiert)
- Logic-Rule-Builder: Regel erstellen → speichern → verifizieren
- Mobile Viewport (responsive)

### 6.5 Wokwi-Tests: Tests muessen reale Firmware-Bugs finden

**Aktuelle Staerke:** Boot-Sequenz, MQTT-Verbindung, Sensor-Reads, Actuator-Commands, Emergency-Stop — alles abgedeckt.

**Was fehlt:**
- WiFi-Reconnect (was passiert wenn WiFi kurz wegfaellt?)
- MQTT-Broker-Restart (ESP32 muss automatisch reconnecten)
- Config-Update waehrend laufender Messung (darf keine Messwerte verlieren)
- Heap-Exhaustion Recovery (ESP32 muss sich erholen koennen)
- Concurrent-Access (zwei MQTT-Commands gleichzeitig)

---

## Teil 7: Empfohlene Reihenfolge

```
PHASE A: Rote Pipelines fixen (Blocker) — 2 von 4 teilweise gefixt
  1. ~~server-tests Healthcheck fixen~~ → ERLEDIGT. Noch offen: Integration-Test MQTT-Retry/Fixtures pruefen
  2. backend-e2e-tests Docker-Crash fixen (Dockerfile, Stack-Start, Logs) → NOCH OFFEN
  3. playwright-tests: Abhaengig von #2 + test-summary Job hinzufuegen → NOCH OFFEN
  4. ~~security-scan Frontend Dockerfile~~ → ERLEDIGT. Noch offen: Python CVE-Updates

PHASE B: Strukturelle Probleme beheben — GROESSTENTEILS ERLEDIGT
  5. ~~Mosquitto-Healthcheck~~ → ERLEDIGT (kein || exit 0 mehr)
  6. ~~Lint-Jobs~~ → ERLEDIGT (kein continue-on-error)
  7. ~~concurrency-Block in wokwi-tests.yml~~ → ERLEDIGT
  8. ~~Branch-Filter in wokwi-tests.yml~~ → ERLEDIGT
  9. Test-Summary-Job fuer playwright-tests.yml → NOCH OFFEN (einzige ohne)
  10. ~~.github/mosquitto/mosquitto.conf~~ → KEIN toter Code (benutzt von ci/e2e compose)
  11. ~~Artifact-Retention~~ → ERLEDIGT (alle auf 7d)

PHASE C: Wokwi Error-Injection — GROESSTENTEILS ERLEDIGT
  12. ~~YAML auf passives Pattern~~ → ERLEDIGT
  13. ~~CI Pipeline auf Background-Pattern~~ → ERLEDIGT
  14. Serial-Output-Strings gegen Firmware verifizieren → NOCH OFFEN
  15. ~~Helper-Scripts~~ → ERLEDIGT (emergency_cascade.sh + mqtt_inject.py existieren)

PHASE D: Test-Coverage erweitern — TEILWEISE ERLEDIGT
  16. ~~Wokwi-Szenarien in Pipeline~~ → ERLEDIGT (alle 173 in CI via Core+Nightly)
  17. Frontend Integration-Tests erstellen → NOCH OFFEN
  18. Backend-Test-Luecken schliessen (basierend auf Analyse) → NOCH OFFEN
  19. Playwright-Tests erweitern → NOCH OFFEN

PHASE E: Qualitaetssicherung
  20. Alle Pipelines einmal gruen verifizieren → NOCH OFFEN
  21. Required Status Checks nach Merge aktualisieren → NOCH OFFEN
  22. Dokumentation der Test-Strategie → NOCH OFFEN
```

---

## Teil 8: Akzeptanzkriterien

- [ ] **Alle 8 Pipelines haben mindestens 1 gruenen Run**
- [ ] server-tests: Unit UND Integration Tests GRUEN
- [ ] backend-e2e-tests: E2E Smoke Test GRUEN
- [ ] playwright-tests: Mindestens Auth + Dashboard Scenario GRUEN
- [ ] security-scan: Frontend baut mit Target, 0 CRITICAL CVEs (HIGH duerfen dokumentiert werden)
- [ ] wokwi-tests: Core-Tests + Error-Injection Tests alle GRUEN
- [x] **Mosquitto-Healthcheck ist in KEINEM Workflow mehr mit `|| exit 0`** ← ERLEDIGT
- [x] **Wokwi-Tests haben concurrency-Block und Branch-Filter** ← ERLEDIGT
- [x] **Alle 10 Error-Injection-Szenarien sind auf passives Pattern umgestellt** ← ERLEDIGT
- [x] **Jeder erwartete Serial-Output ist in der Firmware verifiziert** ← ERLEDIGT (0 Halluzinationen, 2 veraltete YAML-Kommentare korrigiert)
- [x] **Frontend Dockerfile hat Multi-Stage-Build (development + production)** ← ERLEDIGT (3 Stages)
- [x] **CVEs sind evaluiert und wo moeglich behoben** ← ERLEDIGT (FastAPI 0.132, starlette 0.52.1, python-multipart 0.0.22, jaraco.context + wheel im Dockerfile)
- [x] **Test-Summary-Job in playwright-tests.yml** ← ERLEDIGT (EnricoMi test-summary + JUnit Reporter hinzugefuegt)
- [x] **Artifact-Retention ist konsistent (7d)** ← ERLEDIGT
- [ ] **Mindestens 5 neue sinnvolle Tests oder Verbesserungen an bestehenden Tests** (dokumentiert mit Begruendung warum sie echte Bugs finden)

---

## Teil 9: Referenzen

### Im auto-one Repo
- `.github/workflows/` — Alle 8 Pipeline-Dateien
- `El Servador/god_kaiser_server/tests/` — Alle Backend-Tests
- `El Servador/god_kaiser_server/tests/conftest.py` — Globale Fixtures (457 Zeilen)
- `El Servador/god_kaiser_server/tests/e2e/conftest.py` — E2E Fixtures (1258 Zeilen)
- `El Frontend/tests/` — Alle Frontend-Tests
- `El Trabajante/tests/wokwi/scenarios/` — Alle Wokwi-Szenarien
- `El Servador/Dockerfile` — Backend Dockerfile (Multi-Stage mit builder + runtime)
- `El Frontend/Dockerfile` — Frontend Dockerfile (Multi-Stage: development → build → production)
- `docker-compose.yml` + `docker-compose.ci.yml` + `docker-compose.e2e.yml` + `docker-compose.test.yml`
- `.env.ci` — CI Environment Variables
- `Makefile` — Test-Targets
- `.claude/CLAUDE.md` — Projekt-Kontext und Agenten-Struktur

### Im Life-Repo (fuer Kontext)
- `arbeitsbereiche/automation-one/wokwi-integrationsleitfaden.md` — Korrigierte Error-Injection-Szenarien + CI-Pattern
- `arbeitsbereiche/automation-one/phasenplan-testinfrastruktur.md` — Gesamtplan
- `arbeitsbereiche/automation-one/systemueberblick-fuer-auto-one.md` — 7-Domain-Ueberblick
- `wissen/iot-automation/ki-error-analyse-iot.md` — KI-Error-Analyse Architektur
- `wissen/iot-automation/mqtt-best-practices.md` — MQTT Best Practices
- `wissen/iot-automation/fastapi-iot-backend-architektur.md` — Backend-Architektur

### Wissenschaftliche Quellen (fuer Kontext)
- Kalimuthu (2025): Multi-Tiered Testing (Unit → SIL → HIL → System)
- Yu et al. (2024): Chaos Engineering fuer IoT-Resilienz
- Phan & Nguyen (2025): Isolation Forest fuer Sensor-Anomalie-Erkennung

---

## Offene Punkte

- **Wokwi-Quota:** Die Wokwi-CLI braucht einen API-Token. Wenn der Token aufgebraucht ist, schlagen alle Wokwi-Tests fehl. Pruefe den Token-Status und informiere Robin wenn ein Upgrade noetig ist.
- **ESP32 Serial-Outputs:** Die erwarteten Strings in den Wokwi-Szenarien muessen gegen die echte Firmware verifiziert werden. Es ist moeglich dass einige Strings sich seit der YAML-Erstellung geaendert haben.
- **Python 3.11 → 3.12:** Die CI nutzt Python 3.11. Pruefe ob ein Update auf 3.12 sinnvoll ist (Performance, typing Verbesserungen).
- **Poetry 1.7.1 → 1.8.x:** Veraltet aber funktional. Optional updaten.
- **Flash-Nutzung 90.4%:** Kein Test-Thema, aber Firmware-Tests koennen fehlschlagen wenn Flash voll ist. Monitoring-Thema.


### Noch offene Punkte (priorisiert, Update 2026-02-23)

1. **backend-e2e-tests Docker-Crash** (Phase A, #2) — Blocker, noch nicht gefixt
2. **playwright-tests Docker-Crash** (Phase A, #3) — abhaengig von #1 (test-summary ERLEDIGT)
3. ~~**Python CVEs evaluieren und updaten**~~ → ERLEDIGT (FastAPI 0.132, starlette 0.52.1, python-multipart 0.0.22, jaraco.context+wheel im Dockerfile)
4. **server-tests Integration MQTT-Retry in Fixtures pruefen** (Phase A, #1) — Healthcheck gefixt, Fixtures offen
5. ~~**Serial-Output-Strings gegen Firmware verifizieren**~~ → ERLEDIGT (0 Halluzinationen, 2 YAML-Kommentare korrigiert: 85°C + -127°C sind IMPLEMENTIERT)
6. **Frontend Integration-Tests erstellen** (Phase D, #17) — tests/integration/ ist leer
7. **Backend-Test-Luecken schliessen** (Phase D, #18) — Analyse komplett, Tier 1: safety_service, error_handler, god_client, kaiser_handler
8. **Playwright-Tests erweitern** (Phase D, #19)

### Backend-Test-Coverage (Analyse 2026-02-23)

| Kategorie | Getestet | Gesamt | Coverage |
|-----------|----------|--------|----------|
| Router (API) | 9 | 18 | 50% |
| Services (Unit) | 4 | 23 | 17% |
| Services (Integration) | ~18 | 23 | 78% |
| MQTT-Handler (Unit) | 1 | 14 | 7% |
| MQTT-Handler (Integration) | 3 | 14 | 21% |
| Repositories (Unit) | 5 | 17 | 29% |

**Tier 1 (Sofort, sicherheitskritisch):** safety_service, error_handler, god_client, kaiser_handler + 7 Router ohne Tests
**Tier 2 (Prioritaet):** event_aggregator_service, logic_scheduler, sensor/actuator_handler Unit-Tests
**Tier 3 (Qualitaet):** Repository-Tests, Happy-Path-Bias in existierenden Tests abbauen

### Frontend-Test-Coverage (Analyse 2026-02-23)

| Kategorie | Getestet | Gesamt | Coverage |
|-----------|----------|--------|----------|
| Components | 14 | 129 | 11% |
| Views | 0 | 16 | 0% |
| Stores | 5 | 13 | 38% |
| Composables | 4 | 16 | 25% |
| API-Clients | 0 | 17 | 0% |
| Utils | 14 | ~20 | 70% |
| Integration-Tests | 0 | - | 0% |

### Dokumentations-Updates (2026-02-23)

| Datei | Version | Aenderungen |
|-------|---------|-------------|
| TEST_ENGINE_REFERENCE.md | v1.4→v1.5 | Fixtures korrigiert, Test-Reporting Pipeline, Hook-System Doku |
| TEST_WORKFLOW.md | v4.2→v4.3 | Playwright summary, Artifacts erweitert, Hook-Troubleshooting |
| CI_PIPELINE.md | v1.2→v1.3 | Backend E2E + Playwright Sektionen, Nightly 121, Troubleshooting |
| mosquitto.conf (.github) | - | Used-by-Kommentar korrigiert (ci/e2e compose statt wokwi) |
| onewire_error_85c_poweron.yaml | - | "FIRMWARE GAP" → "FIRMWARE STATUS: IMPLEMENTIERT" |
| onewire_error_minus127.yaml | - | "FIRMWARE GAP" → "FIRMWARE STATUS: IMPLEMENTIERT" |

### Konsistenz mit PHASE_ENVIROMENTS.md

Die beiden Dokumente sind konsistent und ergaenzen sich:
- PHASE_ENVIROMENTS deckt Server/DB/Environment/Monitoring ab
- PHASE_TEST_ENGINE deckt CI/CD Pipelines/Test-Suites/Wokwi ab
- Beide referenzieren dieselben Docker-Compose-Dateien und Environment-Variablen korrekt
- `shared-infra-net` Erstellung wird in beiden E2E-Workflows gehandhabt (`docker network create || true`)
- `.github/mosquitto/mosquitto.conf` wird korrekt von CI/E2E Compose genutzt (in PHASE_ENVIROMENTS als Volume referenziert)
- `DATABASE_AUTO_INIT` wird in beiden Dokumenten als CI-Setting erwaehnt

### Korrigierte Zahlen (Disk vs. Dokument)

| Kategorie | Dokument (alt) | Tatsaechlich | Delta |
|-----------|----------------|--------------|-------|
| unit/ Testdateien | 38 | 38 | OK |
| integration/ Testdateien | 38 | 44 | +6 |
| esp32/ Testdateien | 18 | 19 | +1 |
| e2e/ Testdateien | 9 | 9 | OK |
| 08-i2c/ yaml | 21 | 20 | -1 |
| 08-onewire/ yaml | 28 | 29 | +1 |
| 09-hardware/ yaml | 10 | 9 | -1 |
| 09-pwm/ yaml | 18 | 18 | OK |
| 10-nvs/ yaml | 36 | 40 | +4 |
| gpio/ yaml | 25 | 24 | -1 |
| **Gesamt Wokwi** | **173** | **173** | **OK** |
| Frontend unit/ | 43 | 43 | OK |
| Frontend e2e/scenarios | 6 | 6 | OK |
| Frontend e2e/css | 15 | 15 | OK |
