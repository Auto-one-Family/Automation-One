# Test-Engine Reference - AutomationOne

> **Version:** 1.5 | **Aktualisiert:** 2026-02-23
> **Zweck:** Vollständige Referenz der Test-Infrastruktur
> **Themengebiet:** Testing, CI/CD, Agents

---

## 0. Test-Pyramide Übersicht

```
                    ┌─────────────────┐
                    │   E2E Tests     │  ← Browser (Playwright)
                    │  (6 Dateien)    │     Server E2E (pytest)
                    └────────┬────────┘
                             │
               ┌─────────────┴─────────────┐
               │   Integration Tests       │  ← pytest + Docker
               │   (44 Dateien)            │     MQTT, DB, API
               └─────────────┬─────────────┘
                             │
    ┌────────────────────────┴────────────────────────┐
    │              Unit Tests                         │
    │  Backend: 38 | Frontend: 43 | ESP32 Native: 22  │
    └────────────────────────┬────────────────────────┘
                             │
    ┌────────────────────────┴────────────────────────┐
    │           Firmware Simulation                    │
    │  Wokwi: 173 Szenarien (52 PR Core + 121 Nightly) │
    └─────────────────────────────────────────────────┘
```

---

## 1. Backend Tests (pytest)

### 1.1 Struktur

```
El Servador/god_kaiser_server/tests/
├── unit/           # 38 Dateien, 759+ Tests
├── integration/    # 44 Dateien, ~600+ Tests
├── esp32/          # 19 Dateien, ~370+ Tests (Mock)
├── e2e/            # 9 Dateien, ~60+ Tests (--e2e flag required)
└── conftest.py     # 4 conftest files (root + unit/db + esp32 + e2e)
```

### 1.2 Test-Kategorien

| Kategorie | Pfad | Dependencies | CI-Status |
|-----------|------|--------------|-----------|
| **Unit** | `tests/unit/` | Keine | ✅ server-tests.yml |
| **Integration** | `tests/integration/` | PostgreSQL, MQTT | ✅ server-tests.yml |
| **ESP32 Mock** | `tests/esp32/` | MQTT | ✅ esp32-tests.yml |
| **E2E** | `tests/e2e/` | Alle Services | ✅ backend-e2e-tests.yml |

### 1.3 Befehle

```bash
# Unit Tests
cd "El Servador/god_kaiser_server"
.venv/Scripts/pytest.exe tests/unit/ -v
# Alternative (wenn poetry→Python Mapping funktioniert): poetry run pytest tests/unit/ -v

# Integration Tests (benötigt Docker)
docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d --wait postgres mqtt-broker
.venv/Scripts/pytest.exe tests/integration/ -v

# ESP32 Mock Tests
.venv/Scripts/pytest.exe tests/esp32/ -v

# E2E Tests (benötigt laufenden Server)
docker compose up -d
.venv/Scripts/pytest.exe tests/e2e/ --e2e -v

# Alle Tests mit Coverage
.venv/Scripts/pytest.exe --cov=src --cov-report=xml

# Collection Check (0 errors = healthy)
.venv/Scripts/pytest.exe --collect-only
```

### 1.4 Fixtures (conftest.py)

**Auto-Use Fixtures (für ALLE Tests aktiv):**

| Fixture | Scope | Beschreibung |
|---------|-------|--------------|
| `override_get_db` | function | Ersetzt Production-DB durch In-Memory SQLite |
| `override_mqtt_publisher` | function | Mockt MQTT Publisher (kein Broker nötig) |
| `override_actuator_service` | function | Mockt ActuatorService mit Test-DB |

**Datenbank & Repository Fixtures:**

| Fixture | Scope | Beschreibung |
|---------|-------|--------------|
| `test_engine` | function | Async SQLAlchemy Engine (In-Memory SQLite, StaticPool) |
| `db_session` | function | Async SQLAlchemy Session (Rollback nach Test) |
| `esp_repo` | function | ESPRepository Instanz |
| `sensor_repo` | function | SensorRepository Instanz |
| `actuator_repo` | function | ActuatorRepository Instanz |
| `user_repo` | function | UserRepository Instanz |
| `subzone_repo` | function | SubzoneRepository Instanz |

**Test-Daten Fixtures:**

| Fixture | Scope | Beschreibung |
|---------|-------|--------------|
| `sample_esp_device` | function | ESP32 WROOM Test Device (ESP_TEST_001) |
| `sample_esp_c3` | function | ESP32-C3 XIAO Test Device |
| `sample_user` | function | Test User (testuser@example.com) |
| `sample_esp_with_zone` | function | ESP mit Zone-Zuweisung |
| `sample_esp_no_zone` | function | ESP ohne Zone |
| `gpio_service` | function | GpioValidationService (nicht gemockt) |

---

## 2. Frontend Tests (Vitest + Playwright)

### 2.1 Struktur

```
El Frontend/
├── tests/
│   ├── unit/           # 43 Dateien (Vitest)
│   │   ├── stores/     # Pinia Store Tests
│   │   └── components/ # Vue Component Tests
│   └── e2e/            # 6 Szenarien + 15 CSS Specs (Playwright)
│       ├── scenarios/  # 6 Scenario Specs
│       └── css/        # 15 CSS/Visual Specs
├── vitest.config.ts
└── playwright.config.ts
```

### 2.2 Test-Kategorien

| Kategorie | Tool | Dependencies | CI-Status |
|-----------|------|--------------|-----------|
| **Unit** | Vitest | Keine (MSW Mocks) | ✅ frontend-tests.yml |
| **E2E** | Playwright | Alle Services | ✅ playwright-tests.yml |

### 2.3 Befehle

```bash
cd "El Frontend"

# Unit Tests
npm run test:unit

# Unit Tests mit Watch
npm run test:watch

# Coverage Report
npm run test:coverage

# E2E Tests (benötigt Stack)
make e2e-up              # Stack starten
npx playwright test      # Tests ausführen
npx playwright test --ui # UI Mode
npx playwright show-report

# Code Generator
npx playwright codegen http://localhost:5173
```

### 2.4 MSW (Mock Service Worker)

Frontend Unit Tests nutzen MSW für API-Mocking:

```typescript
// Beispiel Handler
rest.get('/api/v1/devices', (req, res, ctx) => {
  return res(ctx.json([mockDevice]))
})
```

---

## 3. Firmware Tests (Wokwi)

### 3.1 Struktur

```
El Trabajante/tests/wokwi/scenarios/
├── 01-boot/        # 2 Szenarien
├── 02-sensor/      # 5 Szenarien
├── 03-actuator/    # 7 Szenarien
├── 04-zone/        # 2 Szenarien
├── 05-emergency/   # 3 Szenarien
├── 06-config/      # 2 Szenarien
├── 07-combined/    # 2 Szenarien
├── 08-i2c/         # 20 Szenarien (Nightly CI)
├── 08-onewire/     # 29 Szenarien (Nightly CI)
├── 09-hardware/    # 9 Szenarien (Nightly CI)
├── 09-pwm/         # 18 Szenarien (5 PR Core + 13 Nightly)
├── 10-nvs/         # 40 Szenarien (5 PR Core + 35 Nightly)
├── 11-error-injection/ # 10 Szenarien (PR Core, MQTT background pattern)
└── gpio/           # 24 Szenarien (5 PR Core + 19 Nightly)
                    ────────────────
                    173 Szenarien total (ALL in CI: 52 PR Core + 121 Nightly)
```

### 3.2 CI-Coverage

| Kategorie | Total | PR Core | Nightly | Coverage |
|-----------|-------|---------|---------|----------|
| 01-boot | 2 | 2 | - | 100% |
| 02-sensor | 5 | 5 | - | 100% |
| 03-actuator | 7 | 7 | - | 100% |
| 04-zone | 2 | 2 | - | 100% |
| 05-emergency | 3 | 3 | - | 100% |
| 06-config | 2 | 2 | - | 100% |
| 07-combined | 2 | 2 | - | 100% |
| 08-i2c | 20 | 5 | 15 | 100% |
| 08-onewire | 29 | - | 29 | 100% |
| 09-hardware | 9 | - | 9 | 100% |
| 09-pwm | 18 | 5 | 13 | 100% |
| 10-nvs | 40 | 5 | 35 | 100% |
| 11-error-injection | 10 | 10 | - | 100% |
| gpio | 24 | 5 | 19 | 100% |
| **Gesamt** | **173** | **52** | **121** | **100%** |

> **Strategie:** 52 Core-Szenarien laufen bei jedem PR. 121 erweiterte Szenarien laufen Nightly (2 AM UTC) + workflow_dispatch.

### 3.3 Befehle

```bash
cd "El Trabajante"

# Firmware bauen
pio run -e wokwi_simulation

# Einzelnes Szenario
wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/01-boot/boot_full.yaml

# Quick Test (Boot + Heartbeat)
make wokwi-test-quick

# Alle 173 Szenarien (Python Runner: scripts/run-wokwi-tests.py --verbose)
make wokwi-test-full

# Python Test Runner (mit JSON + JUnit XML Report)
python scripts/run-wokwi-tests.py --category 01-boot --verbose
python scripts/run-wokwi-tests.py --category 02-sensor --verbose

# Retry-Optionen
python scripts/run-wokwi-tests.py --retries 3    # Custom Retry-Anzahl (default: 2)
python scripts/run-wokwi-tests.py --no-retry     # Ohne Retry (für Debugging)

# Output-Dateien
# logs/wokwi/reports/test_report_{timestamp}.json - JSON Report mit Retry-Info
# logs/wokwi/reports/junit_{timestamp}.xml - JUnit XML für GitHub Actions

# Szenarien auflisten
python scripts/run-wokwi-tests.py --list
```

### 3.4 Szenario-Format (YAML)

```yaml
name: boot_full
version: 1
author: AutomationOne
steps:
  - wait-serial: "ESP32 AutomationOne"
  - wait-serial: "Boot sequence complete"
  - delay: 5000
  - assert-serial-count:
      text: "MQTT connected"
      count: 1
```

---

## 3.5 ESP32 Native Unit Tests (PlatformIO)

### 3.5.1 Struktur

```
El Trabajante/
├── test/
│   ├── test_infra/                      # Infrastruktur-Tests
│   │   └── test_topic_builder.cpp       # 12 Tests: MQTT Topic-Generierung
│   ├── test_managers/                   # Manager-Tests
│   │   └── test_gpio_manager_mock.cpp   # 10 Tests: GPIOManager + MockGPIOHal
│   ├── mocks/                           # Test-Mocks
│   │   ├── Arduino.h                    # Arduino API Mock (String, Serial, GPIO)
│   │   └── mock_gpio_hal.h             # MockGPIOHal (IGPIOHal Implementierung)
│   └── helpers/                         # Test-Helpers
│       └── gpio_manager_test_helper.h   # GPIOManager HAL-Injection
├── scripts/
│   └── set_native_toolchain.py          # MinGW PATH-Setup (PlatformIO pre-script)
└── platformio.ini                       # [env:native] Konfiguration
```

### 3.5.2 Befehle

```bash
cd "El Trabajante"

# Alle native Tests (22 Tests)
pio test -e native

# Verbose
pio test -e native -vvv

# Nur TopicBuilder
pio test -e native -f test_infra

# Nur GPIOManager
pio test -e native -f test_managers
```

### 3.5.3 Architektur

| Komponente | Beschreibung |
|------------|-------------|
| **Platform** | `native` (x86_64, MinGW-w64 auf Windows) |
| **Framework** | Unity Test (C) |
| **HAL Pattern** | IGPIOHal → MockGPIOHal (Test) / ESP32GPIOHal (Production) |
| **Toolchain-Fix** | `scripts/set_native_toolchain.py` setzt MinGW-Pfad automatisch |
| **Static Linking** | `-static` Flag verhindert DLL-Abhängigkeiten |

### 3.5.4 Voraussetzungen

- MinGW-w64 installiert (gcc/g++ >= 13)
- PlatformIO CLI (`pio`)
- Kein ESP32-Hardware nötig (läuft auf Host-PC)

---

## 4. CI/CD Pipeline

### 4.1 Workflow-Übersicht

| Workflow | Datei | Trigger | Jobs |
|----------|-------|---------|------|
| **Server Tests** | `server-tests.yml` | `El Servador/**` | lint, unit, integration, summary |
| **ESP32 Tests** | `esp32-tests.yml` | `tests/esp32/**` | esp32-tests, summary |
| **Frontend Tests** | `frontend-tests.yml` | `El Frontend/**` | type-check, unit, build, summary |
| **Wokwi Tests** | `wokwi-tests.yml` | `El Trabajante/**` | build + 16 PR core + 6 nightly + summary |
| **Backend E2E** | `backend-e2e-tests.yml` | `El Servador/**` | e2e (Docker stack), summary |
| **Playwright** | `playwright-tests.yml` | `El Frontend/**` | e2e (Docker stack), summary |
| **Security Scan** | `security-scan.yml` | Dockerfile/deps + weekly | trivy server, frontend, config |
| **PR Checks** | `pr-checks.yml` | Pull Requests | label, validation |

### 4.2 Docker in CI

```bash
# CI verwendet docker-compose.ci.yml (tmpfs für Speed)
# KEIN --wait Flag! Health-Polling erfolgt in separatem Step mit Diagnostik.
docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d postgres mqtt-broker
```

| Service | CI-Konfiguration |
|---------|------------------|
| PostgreSQL | tmpfs (RAM-basiert), 5s Health-Interval |
| Mosquitto | Config aus `.github/mosquitto/mosquitto.conf` |

### 4.3 Artifacts

| Workflow | Artifact | Inhalt | Retention |
|----------|----------|--------|-----------|
| Server Tests | `unit-test-results` | JUnit XML + Coverage XML | 7 Tage |
| Server Tests | `integration-test-results` | JUnit XML + Coverage XML | 7 Tage |
| ESP32 Tests | `esp32-test-results` | JUnit XML | 7 Tage |
| Frontend Tests | `frontend-test-results` | JUnit XML + Coverage | 7 Tage |
| Backend E2E | `backend-e2e-results` | JUnit XML + Server/DB/MQTT Logs | 7 Tage |
| Playwright | `playwright-report` | JUnit XML + HTML Report + Traces | 7 Tage |
| Wokwi Tests | `wokwi-firmware` | Build Output | 1 Tag |
| Wokwi Tests | `*-test-logs` | Serial Logs per Kategorie | 7 Tage |

### 4.4 Test-Reporting Pipeline

Alle CI-Workflows nutzen dasselbe Reporting-Pattern:

```
pytest/vitest/playwright → JUnit XML → upload-artifact → test-summary Job
                                                              ↓
                                         EnricoMi/publish-unit-test-result-action@v2
                                                              ↓
                                         PR-Kommentar + GitHub Checks Tab
```

| Workflow | JUnit-Generierung | Report-Format |
|----------|-------------------|---------------|
| Server Unit | `--junitxml=junit-unit.xml` | JUnit XML + Coverage XML |
| Server Integration | `--junitxml=junit-integration.xml` | JUnit XML + Coverage XML |
| ESP32 Mock | `--junitxml=junit-esp32.xml` | JUnit XML |
| Backend E2E | `--junitxml=../../logs/server/e2e-results.xml` | JUnit XML + tee Log |
| Frontend Vitest | `--reporter=junit --outputFile.junit=junit-results.xml` | JUnit XML |
| Playwright | `--reporter=list,junit` + `PLAYWRIGHT_JUNIT_OUTPUT_NAME` | JUnit XML + HTML |
| Wokwi | `scripts/run-wokwi-tests.py` → `junit_{timestamp}.xml` | JUnit XML + JSON + Serial Logs |

### 4.5 GitHub CLI Quick Reference

```bash
# Fehlgeschlagene Runs
gh run list --status=failure --limit=5

# Logs abrufen
gh run view <run-id> --log-failed

# Artifacts herunterladen
gh run download <run-id> --name=unit-test-results

# Workflow manuell starten
gh workflow run server-tests.yml
```

---

## 5. Makefile Targets

### 5.1 Test-Targets

| Target | Beschreibung | Services benötigt |
|--------|--------------|-------------------|
| `make test` | Test-Umgebung starten | - |
| `make test-fe` | Frontend alle Tests | - |
| `make test-fe-unit` | Frontend Unit Tests | - |
| `make test-fe-watch` | Frontend Watch Mode | - |
| `make test-fe-coverage` | Frontend Coverage | - |
| `make test-be-capture` | Backend Unit/Integration/ESP32 mit Output in `logs/backend/` | postgres, mqtt-broker |
| `make test-be-e2e-running` | Backend E2E gegen existierenden Stack, Output in `logs/server/` | postgres, mqtt-broker, el-servador |
| `make test-full` | Backend + Frontend | Docker Stack |

### 5.2 Wokwi-Targets

| Target | Beschreibung |
|--------|--------------|
| `make wokwi-build` | Firmware bauen |
| `make wokwi-test-boot` | Boot-Sequenz testen |
| `make wokwi-test-quick` | Boot + Heartbeat |
| `make wokwi-test-full` | Alle CI-Szenarien (ruft `python scripts/run-wokwi-tests.py --verbose` auf, Dependencies: wokwi-build, wokwi-ensure-mqtt, Reports in `logs/wokwi/`) |
| `make wokwi-test-runner` | Python Runner (JSON, ohne --verbose) |
| `make wokwi-list` | Szenarien auflisten |

### 5.3 E2E-Targets

| Target | Beschreibung |
|--------|--------------|
| `make e2e-up` | E2E Stack starten (`--wait`) |
| `make e2e-down` | E2E Stack stoppen |
| `make e2e-test` | Playwright Tests (`cd "El Frontend" && npx playwright test`) |
| `make e2e-test-ui` | Playwright UI Mode |

### 5.4 Monitoring-Targets

| Target | Beschreibung |
|--------|--------------|
| `make monitor-up` | Monitoring-Stack starten (`--profile monitoring`) |
| `make monitor-down` | Monitoring-Stack stoppen |
| `make monitor-logs` | Monitoring Logs folgen |
| `make monitor-status` | Monitoring Container-Status |

---

## 6. Agent-Integration

### 6.1 Test-Ausführung

| Agent | Kann Tests starten | Tool |
|-------|-------------------|------|
| `system-control` | ✅ Alle | Bash |
| `server-dev` | ✅ Backend | pytest |
| `frontend-dev` | ✅ Frontend | vitest, playwright |
| `esp32-dev` | ✅ Firmware | pio, wokwi-cli |

### 6.2 Ergebnis-Analyse

| Agent | Analysiert | Log-Quelle |
|-------|------------|------------|
| `server-debug` | Backend Logs | `logs/server/` |
| `frontend-debug` | Frontend Logs | stdout, `logs/frontend/` |
| `esp32-debug` | Serial Logs | `logs/wokwi/` |
| `meta-analyst` | Alle Reports | `.claude/reports/current/` |

### 6.3 Typischer Workflow

```
1. system-control  → Tests ausführen → Logs generieren
2. *-debug Agents  → Logs analysieren → Reports schreiben
3. meta-analyst    → Reports vergleichen → Korrelationen finden
```

---

## 7. Environment Variables

### 7.1 CI Environment

```bash
# Server Tests
DATABASE_URL=postgresql+asyncpg://god_kaiser:ci_password@localhost:5432/god_kaiser_db
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883
TESTING=true

# Wokwi
WOKWI_CLI_TOKEN=<from-github-secrets>
```

### 7.2 Lokale Entwicklung

```bash
# .env.example enthält alle Variablen
cp .env.example .env
# Wokwi Token
export WOKWI_CLI_TOKEN=your_token_here
```

---

## 8. Bekannte Einschränkungen

### 8.1 CI-Integration Status

| Test-Suite | CI-Status | Workflow |
|------------|-----------|----------|
| Backend E2E | ✅ Integriert | `backend-e2e-tests.yml` (Docker stack) |
| Frontend E2E | ✅ Integriert | `playwright-tests.yml` (Docker stack) |
| Wokwi (alle 173) | ✅ Integriert | `wokwi-tests.yml` (52 PR Core + 121 Nightly) |

### 8.2 Hook-System und Test-Ausführung

Das auto-ops Plugin enthält einen PostToolUse:Bash Hook der bei **jedem** Bash-Befehl mit non-zero Exit-Code eine Warnung auslöst:

**Datei:** `.claude/local-marketplace/auto-ops/hooks/hooks.json`

```
PostToolUse:Bash → Exit-Code != 0 → "OPS-ALERT: Command failed..."
```

**Problem:** pytest gibt Exit-Code 1 bei Test-Failures zurück (erwartetes Verhalten). Der Hook interpretiert dies als Fehler und unterbricht die Arbeit.

**Auswirkung:** KI-Agenten stoppen nach Test-Ausführung anstatt Ergebnisse zu analysieren.

**Workaround:**
- Tests mit `|| true` am Ende ausführen: `.venv/Scripts/pytest.exe tests/unit/ -v || true`
- Oder: Hook temporär deaktivieren während Test-Sessions

**Alle aktiven Hooks:**

| Hook | Typ | Datei | Effekt |
|------|-----|-------|--------|
| PreToolUse:Bash | auto-ops | `hooks/hooks.json` | Blockt destruktive Befehle (DELETE FROM, docker down, etc.) |
| PostToolUse:Bash | auto-ops | `hooks/hooks.json` | Warnt bei non-zero Exit-Code |
| PreToolUse:Edit/Write | security-guidance | Plugin-Cache | Prüft auf Security-Issues |
| SessionStart | superpowers | Plugin-Cache | Session-Init |

### 8.3 Geplante Erweiterungen

| Erweiterung | Status | Auftrag |
|-------------|--------|---------|
| Backend WebSocket E2E | ⏳ Geplant | Auftrag 1 |
| esp.ts Store Tests | ⏳ Geplant | Auftrag 2 |
| useWebSocket Tests | ⏳ Geplant | Auftrag 3 |
| Playwright Browser E2E | ⏳ Geplant | Auftrag 4 |
| Wokwi CI-Expansion | ✅ Erledigt | ALL 173 in CI (PR Core + Nightly) |

---

## 9. Quick Reference

### 9.1 Häufigste Befehle

```bash
# Backend Unit Tests (schnell, keine Deps)
cd "El Servador/god_kaiser_server" && .venv/Scripts/pytest.exe tests/unit/ -v

# Frontend Unit Tests (schnell, keine Deps)
cd "El Frontend" && npm run test:unit

# ESP32 Native Unit Tests (22 Tests, keine Hardware)
cd "El Trabajante"
~/.platformio/penv/Scripts/pio.exe test -e native -vvv

# Wokwi Quick Test
make wokwi-test-quick

# Vollstaendiger Stack-Test (Git Bash, Befehle einzeln)
make up
cd "El Servador/god_kaiser_server"
.venv/Scripts/pytest.exe -v
```

### 9.2 CI Debugging

```bash
# Fehlgeschlagene Runs finden
gh run list --status=failure --limit=3

# Logs analysieren
gh run view <run-id> --log-failed

# Lokal reproduzieren
make up
cd "El Servador/god_kaiser_server"
.venv/Scripts/pytest.exe tests/integration/ -x -v
```

---

## 10. Verwandte Dokumente

| Dokument | Pfad | Inhalt |
|----------|------|--------|
| TEST_WORKFLOW.md | `.claude/reference/testing/` | Detaillierter Workflow |
| SYSTEM_OPERATIONS_REFERENCE.md | `.claude/reference/testing/` | Alle Befehle |
| CI_PIPELINE.md | `.claude/reference/debugging/` | GitHub Actions Details |
| TEST_ENGINE_AUDIT.md | `.claude/reports/current/` | Aktuelle Analyse |

---

**Letzte Aktualisierung:** 2026-02-23
**Version:** 1.5
**Changelog:**
- 1.5: Fixtures (1.4) komplett überarbeitet (tatsächliche conftest.py Fixtures), Test-Reporting Pipeline (4.4) hinzugefügt, Artifact-Tabelle erweitert, Playwright test-summary ergänzt, `--wait` aus Docker CI entfernt, Hook-System dokumentiert (8.2), Version-Bump
- 1.4: Zahlen-Korrektur (Unit 36→38, Frontend 4→43, E2E 6→9), CI-Coverage ALL 173 Wokwi in CI (52 PR Core + 121 Nightly), Backend E2E + Playwright + Security Scan Workflows ergänzt, Artifact Retention vereinheitlicht (7 Tage), poetry run → .venv/Scripts/pytest.exe
- 1.3: ESP32 Native Unit Tests Sektion (3.5): 22 Tests (TopicBuilder + GPIOManager), Toolchain-Fix, HAL-Architektur
- 1.2: E2E ghost targets removed (e2e-report, e2e-debug, e2e-codegen), CI targets replaced with monitoring targets, ci-up references updated
- 1.1: Python Wokwi-Runner Retry-Optionen (--retries, --no-retry), JUnit XML Output
