# Test-Engine Reference - AutomationOne

> **Version:** 1.0 | **Aktualisiert:** 2026-02-06
> **Zweck:** Vollständige Referenz der Test-Infrastruktur
> **Themengebiet:** Testing, CI/CD, Agents

---

## 0. Test-Pyramide Übersicht

```
                    ┌─────────────────┐
                    │   E2E Tests     │  ← Browser (Playwright)
                    │  (5 Szenarien)  │     Server E2E (pytest)
                    └────────┬────────┘
                             │
               ┌─────────────┴─────────────┐
               │   Integration Tests       │  ← pytest + Docker
               │   (40+ Dateien)           │     MQTT, DB, API
               └─────────────┬─────────────┘
                             │
    ┌────────────────────────┴────────────────────────┐
    │              Unit Tests                         │
    │  Backend: 25 Dateien | Frontend: 4 Dateien      │
    └────────────────────────┬────────────────────────┘
                             │
    ┌────────────────────────┴────────────────────────┐
    │           Firmware Simulation                    │
    │      Wokwi: 163 Szenarien (138 in CI)           │
    └─────────────────────────────────────────────────┘
```

---

## 1. Backend Tests (pytest)

### 1.1 Struktur

```
El Servador/god_kaiser_server/tests/
├── unit/           # 25 Dateien, ~200+ Tests
├── integration/    # 40 Dateien, ~300+ Tests
├── esp32/          # 30 Dateien, ~150+ Tests (Mock)
├── e2e/            # 2 Dateien, ~45 Tests
└── conftest.py     # Fixtures
```

### 1.2 Test-Kategorien

| Kategorie | Pfad | Dependencies | CI-Status |
|-----------|------|--------------|-----------|
| **Unit** | `tests/unit/` | Keine | ✅ server-tests.yml |
| **Integration** | `tests/integration/` | PostgreSQL, MQTT | ✅ server-tests.yml |
| **ESP32 Mock** | `tests/esp32/` | MQTT | ✅ esp32-tests.yml |
| **E2E** | `tests/e2e/` | Alle Services | ❌ Manuell |

### 1.3 Befehle

```bash
# Unit Tests
cd "El Servador/god_kaiser_server"
poetry run pytest tests/unit/ -v

# Integration Tests (benötigt Docker)
docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d --wait postgres mqtt-broker
poetry run pytest tests/integration/ -v

# ESP32 Mock Tests
poetry run pytest tests/esp32/ -v

# E2E Tests (benötigt laufenden Server)
docker compose up -d
poetry run pytest tests/e2e/ --e2e -v

# Alle Tests mit Coverage
poetry run pytest --cov=src --cov-report=xml
```

### 1.4 Fixtures (conftest.py)

| Fixture | Scope | Beschreibung |
|---------|-------|--------------|
| `db_session` | function | Async SQLAlchemy Session |
| `test_client` | function | FastAPI TestClient |
| `mqtt_client` | function | Async MQTT Client |
| `mock_esp_device` | function | Simuliertes ESP32 Device |

---

## 2. Frontend Tests (Vitest + Playwright)

### 2.1 Struktur

```
El Frontend/
├── tests/
│   ├── unit/           # 4 Dateien (Vitest)
│   │   ├── stores/     # Pinia Store Tests
│   │   └── components/ # Vue Component Tests
│   └── e2e/            # 5 Szenarien (Playwright)
├── vitest.config.ts
└── playwright.config.ts
```

### 2.2 Test-Kategorien

| Kategorie | Tool | Dependencies | CI-Status |
|-----------|------|--------------|-----------|
| **Unit** | Vitest | Keine (MSW Mocks) | ✅ frontend-tests.yml |
| **E2E** | Playwright | Alle Services | ❌ Manuell |

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
├── 08-i2c/         # 20 Szenarien (nicht in CI)
├── 08-onewire/     # 29 Szenarien
├── 09-hardware/    # 9 Szenarien
├── 09-pwm/         # 18 Szenarien
├── 10-nvs/         # 40 Szenarien (5 skipped)
└── gpio/           # 24 Szenarien
                    ────────────────
                    163 Szenarien total (138 in CI)
```

### 3.2 CI-Coverage

| Kategorie | Total | In CI | Coverage |
|-----------|-------|-------|----------|
| 01-boot | 2 | 2 | 100% |
| 02-sensor | 5 | 5 | 100% |
| 03-actuator | 7 | 7 | 100% |
| 04-zone | 2 | 2 | 100% |
| 05-emergency | 3 | 3 | 100% |
| 06-config | 2 | 2 | 100% |
| 07-combined | 2 | 2 | 100% |
| 08-i2c | 20 | 0 | 0% |
| 08-onewire | 29 | 29 | 100% |
| 09-hardware | 9 | 9 | 100% |
| 09-pwm | 18 | 18 | 100% |
| 10-nvs | 40 | 35 | 88% |
| gpio | 24 | 24 | 100% |
| **Gesamt** | **163** | **138** | **85%** |

### 3.3 Befehle

```bash
cd "El Trabajante"

# Firmware bauen
pio run -e wokwi_simulation

# Einzelnes Szenario
wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/01-boot/boot_full.yaml

# Quick Test (Boot + Heartbeat)
make wokwi-test-quick

# Alle 138 CI-Szenarien (Python Runner: scripts/run-wokwi-tests.py --verbose)
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

## 4. CI/CD Pipeline

### 4.1 Workflow-Übersicht

| Workflow | Datei | Trigger | Jobs |
|----------|-------|---------|------|
| **Server Tests** | `server-tests.yml` | `El Servador/**` | lint, unit, integration, summary |
| **ESP32 Tests** | `esp32-tests.yml` | `tests/esp32/**` | esp32-tests, summary |
| **Frontend Tests** | `frontend-tests.yml` | `El Frontend/**` | type-check, unit, build, summary |
| **Wokwi Tests** | `wokwi-tests.yml` | `El Trabajante/**` | build + 12 test jobs + summary |
| **PR Checks** | `pr-checks.yml` | Pull Requests | label, validation |

### 4.2 Docker in CI

```bash
# CI verwendet docker-compose.ci.yml (tmpfs für Speed)
docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d --wait postgres mqtt-broker
```

| Service | CI-Konfiguration |
|---------|------------------|
| PostgreSQL | tmpfs (RAM-basiert), 5s Health-Interval |
| Mosquitto | Config aus `.github/mosquitto/mosquitto.conf` |

### 4.3 Artifacts

| Workflow | Artifact | Retention |
|----------|----------|-----------|
| Server Tests | `unit-test-results`, `integration-test-results` | 90 Tage |
| ESP32 Tests | `esp32-test-results` | 90 Tage |
| Frontend Tests | `frontend-test-results` | 90 Tage |
| Wokwi Tests | `wokwi-firmware` (1 Tag), `*-test-logs` + `junit_*.xml` (7 Tage) | Variabel |

### 4.4 GitHub CLI Quick Reference

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

### 8.1 Nicht in CI integriert

| Test-Suite | Grund | Workaround |
|------------|-------|------------|
| Backend E2E | Benötigt laufenden Server | `make e2e-up` lokal |
| Frontend E2E | Nicht integriert | `make e2e-test` lokal |
| Wokwi 08-stress | Lange Laufzeit | Manuell testen |

### 8.2 Geplante Erweiterungen

| Erweiterung | Status | Auftrag |
|-------------|--------|---------|
| Backend WebSocket E2E | ⏳ Geplant | Auftrag 1 |
| esp.ts Store Tests | ⏳ Geplant | Auftrag 2 |
| useWebSocket Tests | ⏳ Geplant | Auftrag 3 |
| Playwright Browser E2E | ⏳ Geplant | Auftrag 4 |
| Wokwi CI-Expansion | ⏳ Geplant | Auftrag 5 |

---

## 9. Quick Reference

### 9.1 Häufigste Befehle

```bash
# Backend Unit Tests (schnell, keine Deps)
cd "El Servador/god_kaiser_server" && poetry run pytest tests/unit/ -v

# Frontend Unit Tests (schnell, keine Deps)
cd "El Frontend" && npm run test:unit

# Wokwi Quick Test
make wokwi-test-quick

# Vollständiger Stack-Test
make up && cd "El Servador/god_kaiser_server" && poetry run pytest -v
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
poetry run pytest tests/integration/ -x -v
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

**Letzte Aktualisierung:** 2026-02-09
**Version:** 1.2
**Changelog:**
- 1.2: E2E ghost targets removed (e2e-report, e2e-debug, e2e-codegen), CI targets replaced with monitoring targets, ci-up references updated
- 1.1: Python Wokwi-Runner Retry-Optionen (--retries, --no-retry), JUnit XML Output
