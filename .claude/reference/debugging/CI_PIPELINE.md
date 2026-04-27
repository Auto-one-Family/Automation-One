# CI/CD Pipeline - AutomationOne

> **Version:** 1.5 | **Aktualisiert:** 2026-04-04
> **Zweck:** Vollständige Dokumentation der GitHub Actions Workflows
> **Themengebiet:** CI/CD, Artifacts, GitHub CLI

---

## 1. Workflow-Übersicht

| Workflow | Datei | Trigger | Jobs | Timeout |
|----------|-------|---------|------|---------|
| **Server Tests** | `server-tests.yml` | Push/PR zu `El Servador/**` | lint, unit-tests, integration-tests, test-summary | 15min/Job |
| **ESP32 Tests** | `esp32-tests.yml` | Push/PR zu `tests/esp32/**`, `src/mqtt/**`, `src/services/**` | esp32-tests, test-summary | 15min |
| **Frontend Tests** | `frontend-tests.yml` | Push/PR zu `El Frontend/**` | type-check, unit-tests, build, test-summary | 10-15min/Job |
| **Wokwi ESP32 Tests** | `wokwi-tests.yml` | Push/PR + Nightly 02:00 UTC + Manual | 23 Jobs (1 build + 15 core + 6 nightly-extended + 1 summary) | 10-75min/Job |
| **Backend E2E** | `backend-e2e-tests.yml` | Push/PR zu `El Servador/**` | backend-e2e (Docker stack), test-summary | 20min |
| **Playwright** | `playwright-tests.yml` | Push/PR zu `El Frontend/**`, `El Servador/**` | e2e-tests (Docker stack), test-summary | 30min |
| **Security Scan** | `security-scan.yml` | Dockerfile/deps + Weekly Mo 06:00 UTC | scan-server, scan-frontend, scan-config | 15min/Job |
| **PR Checks** | `pr-checks.yml` | Pull Requests | label-pr, pr-validation | 15min |

**Concurrency:** Alle Workflows nutzen `cancel-in-progress: true` - bei mehreren Pushes wird der alte Run abgebrochen.

---

## 2. Workflow-Details

### 2.1 Server Tests (`server-tests.yml`)

**Trigger:**
- `push` zu Branches: `main`, `master`, `develop`
- `pull_request` zu Branches: `main`, `master`, `develop`
- `workflow_dispatch` (manuell)
- **Path-Filter:** Nur bei Änderungen in `El Servador/**`

**Umgebung:**
```yaml
env:
  PYTHON_VERSION: '3.11'
  POETRY_VERSION: '1.7.1'
```

**Jobs:**

| Job | Abhängigkeit | Services | Beschreibung |
|-----|--------------|----------|--------------|
| `lint` | - | - | Ruff Linter + Black Format Check |
| `unit-tests` | lint | - | Unit Tests mit Coverage |
| `integration-tests` | lint | Mosquitto MQTT | Integration Tests mit MQTT |
| `test-summary` | unit-tests, integration-tests | - | Zusammenfassung + PR-Kommentar |

**Integration Test Environment:**
```yaml
env:
  MQTT_BROKER_HOST: localhost
  MQTT_BROKER_PORT: 1883
  DATABASE_URL: sqlite+aiosqlite:///./test.db
```

**Artifacts:**
| Artifact | Inhalt | Retention |
|----------|--------|-----------|
| `unit-test-results` | `junit-unit.xml`, `coverage-unit.xml` | 7 Tage |
| `integration-test-results` | `junit-integration.xml`, `coverage-integration.xml` | 7 Tage |

---

### 2.2 ESP32 Tests (`esp32-tests.yml`)

**Trigger:**
- `push` zu Branches: `main`, `master`, `develop`
- `pull_request` zu Branches: `main`, `master`, `develop`
- `workflow_dispatch` (manuell)
- **Path-Filter:**
  - `El Servador/god_kaiser_server/tests/esp32/**`
  - `El Servador/god_kaiser_server/src/mqtt/**`
  - `El Servador/god_kaiser_server/src/services/**`

**Services:**
- Mosquitto MQTT Broker (Docker Image: `eclipse-mosquitto:2`)

**Artifacts:**
| Artifact | Inhalt | Retention |
|----------|--------|-----------|
| `esp32-test-results` | `junit-esp32.xml` | 7 Tage |

**Wichtig:** Tests stoppen beim ersten Fehler (`-x` Flag) für schnelleres Feedback.

---

### 2.3 Wokwi ESP32 Tests (`wokwi-tests.yml`)

**Trigger:**
- `push` zu `El Trabajante/**`
- `pull_request` zu `El Trabajante/**`
- `schedule: cron '0 2 * * *'` (Nightly 02:00 UTC)
- `workflow_dispatch` (manuell)

**Concurrency:**
```yaml
concurrency:
  group: wokwi-tests-${{ github.ref }}
  cancel-in-progress: true
```

**Voraussetzungen:**
- GitHub Secret `WOKWI_CLI_TOKEN` muss konfiguriert sein
- Token erstellen: https://wokwi.com/dashboard/ci

**CI-Strategie:**
| Modus | Trigger | Szenarien | Jobs |
|-------|---------|-----------|------|
| **Core (PR/Push)** | push, pull_request | 52 | 16 (1 build + 15 test) |
| **Nightly (Full)** | schedule, workflow_dispatch | 191 (52 core + 139 extended) | 23 (16 core + 6 nightly + 1 summary) |

**Core Jobs (bei jedem PR/Push, 52 Szenarien):**

| Job | Timeout | Tests | Mosquitto | Beschreibung |
|-----|---------|-------|-----------|--------------|
| `build-firmware` | 10min | - | - | Firmware bauen mit PlatformIO |
| `boot-tests` | 15min | boot_full, boot_safe_mode | Ja | Boot-Sequenz prüfen |
| `sensor-tests` | 15min | sensor_heartbeat, sensor_ds18b20_read | Ja | Sensor-Funktionen |
| `mqtt-connection-test` | 15min | mqtt_connection | Ja | Legacy MQTT Test |
| `actuator-tests` | 15min | led_on, pwm, status_publish, emergency_clear | Ja | Actuator-Steuerung |
| `zone-tests` | 15min | zone_assignment, subzone_assignment | Ja | Zone-System |
| `emergency-tests` | 15min | emergency_broadcast, emergency_esp_stop | Ja | Emergency-Stop |
| `config-tests` | 15min | config_sensor_add, config_actuator_add | Ja | Dynamische Config |
| `sensor-flow-tests` | 15min | ds18b20_full_flow, dht22_full_flow, analog_flow | Ja | E2E Sensor |
| `actuator-flow-tests` | 20min | binary_full_flow, pwm_full_flow, timeout_e2e | Ja | E2E Actuator |
| `combined-flow-tests` | 20min | combined_sensor_actuator, emergency_stop_full_flow, multi_device_parallel | Ja | E2E Combined |
| `gpio-core-tests` | 15min | 5 GPIO scenarios | Ja | GPIO-Manager |
| `i2c-core-tests` | 15min | 5 I2C scenarios (diagram_i2c.json) | Ja | I2C-Bus |
| `nvs-core-tests` | 15min | 5 NVS scenarios | Ja | NVS-Storage |
| `pwm-core-tests` | 15min | 3 PWM scenarios (2 mit MQTT-Injection) | Ja | PWM-Control |
| `error-injection-tests` | 20min | 10 error scenarios (background pattern + mosquitto_pub) | Ja | Error-Injection |

**Nightly Extended Jobs (nur bei schedule/workflow_dispatch, 121 Szenarien):**

| Job | Timeout | Szenarien | Beschreibung |
|-----|---------|-----------|--------------|
| `nightly-i2c-extended` | 45min | 15 (diagram_i2c.json) | Erweiterte I2C-Tests |
| `nightly-onewire-extended` | 60min | 29 | OneWire-Bus-Tests |
| `nightly-hardware-extended` | 25min | 9 | Hardware-Peripherie-Tests |
| `nightly-pwm-extended` | 40min | 15 | Erweiterte PWM-Tests |
| `nightly-nvs-extended` | 75min | 35 | Erweiterte NVS-Tests |
| `nightly-gpio-extended` | 50min | 19 | Erweiterte GPIO-Tests |

**Summary Job:**

| Job | Beschreibung |
|-----|--------------|
| `test-summary` | Ergebnis-Zusammenfassung aller Core + Nightly Jobs |

**Artifacts:**
| Artifact | Inhalt | Retention |
|----------|--------|-----------|
| `wokwi-firmware` | `.pio/build/wokwi_simulation/` | 1 Tag |
| `boot-test-logs` | `*.log` | 7 Tage |
| `sensor-test-logs` | `*.log` | 7 Tage |
| `mqtt-test-logs` | `*.log` | 7 Tage |
| `actuator-test-logs` | `actuator_*.log` | 7 Tage |
| `zone-test-logs` | `*_assignment.log` | 7 Tage |
| `emergency-test-logs` | `emergency_*.log` | 7 Tage |
| `config-test-logs` | `config_*.log` | 7 Tage |
| `sensor-flow-test-logs` | `sensor_*_flow.log` | 7 Tage |
| `actuator-flow-test-logs` | `actuator_*_flow.log` | 7 Tage |
| `combined-flow-test-logs` | `combined_*.log`, `emergency_stop_full_flow.log`, `multi_device_parallel.log` | 7 Tage |
| `error-injection-test-logs` | `error_*.log` | 7 Tage |

---

### 2.4 PR Checks (`pr-checks.yml`)

**Trigger:**
- `pull_request` (opened, synchronize, reopened)

**Jobs:**

| Job | Beschreibung |
|-----|--------------|
| `label-pr` | Automatisches Labeling basierend auf geänderten Dateien |
| `pr-validation` | Prüft auf große Dateien (>5MB), sensitive Dateien und Contract-Governance-Gates |

**Sensitive File Patterns:**
```
.env, .env.*, *.env, credentials.json, secrets.json,
private.key, *.pem, *.key, id_rsa, id_ed25519,
*.p12, *.pfx, service-account.json, firebase-adminsdk*.json
```

**Contract Governance Gate (neu):**
- Ausführung: `python .github/scripts/contract_governance_gate.py --base-ref "origin/${{ github.base_ref }}"`
- Blockiert PRs bei:
  - neuen `CONTRACT_*` Codes ohne Eintrag in `.claude/reference/errors/ERROR_CODES.md`
  - fehlenden Pflichtattributen in `## 13b. Contract-Code Governance Matrix`
  - Contract-Source-Änderungen ohne Contract-Testanpassung
  - Fallback/Heilungs-Änderungen ohne explizites Contract-Signal

---

### 2.5 Backend E2E Tests (`backend-e2e-tests.yml`)

**Trigger:**
- `push` zu Branches: `main`, `master`, `develop`
- `pull_request` zu Branches: `main`, `master`, `develop`
- `workflow_dispatch` (manuell)
- **Path-Filter:** `El Servador/**`, `docker-compose.yml`, `docker-compose.ci.yml`, `docker-compose.e2e.yml`

**Umgebung:**
```yaml
env:
  PYTHON_VERSION: '3.11'
  POETRY_VERSION: '1.7.1'
  COMPOSE_PROJECT_NAME: automationone-e2e
```

**Docker Stack:** `docker-compose.yml` + `ci.yml` (tmpfs PostgreSQL) + `e2e.yml` (CORS, E2E JWT)

> **Hinweis:** `docker compose up` wird **ohne** `--wait` ausgeführt. Health-Polling erfolgt in einem separaten Step mit Diagnostik-Output bei Failure.

**Jobs:**

| Job | Abhängigkeit | Services | Timeout | Beschreibung |
|-----|--------------|----------|---------|--------------|
| `backend-e2e` | - | PostgreSQL, Mosquitto, Server (Docker) | 20min | E2E Tests gegen Docker Stack |
| `test-summary` | backend-e2e | - | 5min | Zusammenfassung + PR-Kommentar |

**Health-Check-Reihenfolge:** PostgreSQL (20 Versuche, 1s) → MQTT (20 Versuche, 1s) → Server (40 Versuche, 2s)

**Artifacts:**
| Artifact | Inhalt | Retention |
|----------|--------|-----------|
| `backend-e2e-results` | `e2e-test.log`, `e2e-results.xml`, `e2e-server.log` (on failure), `e2e-postgres.log`, `e2e-mqtt.log` | 7 Tage |

---

### 2.6 Playwright E2E Tests (`playwright-tests.yml`)

**Trigger:**
- `push` zu Branches: `main`, `master`, `develop`
- `pull_request` zu Branches: `main`, `master`, `develop`
- `workflow_dispatch` (manuell)
- **Path-Filter:** `El Frontend/**`, `El Servador/**`, `docker-compose.e2e.yml`

**Umgebung:**
```yaml
env:
  NODE_VERSION: '20'
```

**Docker Stack:** `docker-compose.yml` + `e2e.yml` (vollständiger Stack inkl. Frontend)

> **Hinweis:** `docker compose up` wird **ohne** `--wait` ausgeführt. Health-Polling erfolgt in einem separaten Step.

**Jobs:**

| Job | Abhängigkeit | Services | Timeout | Beschreibung |
|-----|--------------|----------|---------|--------------|
| `e2e-tests` | - | PostgreSQL, Mosquitto, Server, Frontend (Docker) | 30min | Playwright Tests mit Chromium |
| `test-summary` | e2e-tests | - | 5min | Zusammenfassung + PR-Kommentar |

**Health-Check-Reihenfolge:** Server (40 Versuche, 2s) → Frontend (30 Versuche, 2s) → MQTT (einmaliger Test)

**Artifacts:**
| Artifact | Inhalt | Retention |
|----------|--------|-----------|
| `playwright-report` | `playwright-report/`, `test-results/`, `playwright-results.xml` | 7 Tage |
| `playwright-traces` | `test-results/**/*.zip` (nur bei Failure) | 7 Tage |

---

## 3. Artifact-System

### 3.1 Retention Policies

| Kategorie | Retention | Beispiel |
|-----------|-----------|----------|
| **Test Results (XML)** | 7 Tage | `junit-*.xml`, `coverage-*.xml` |
| **Wokwi Firmware** | 1 Tag | `.pio/build/wokwi_simulation/` |
| **Wokwi Logs** | 7 Tage | `*.log` |

### 3.2 Artifact Download via gh CLI

```bash
# Alle Artifacts eines Runs herunterladen
gh run download <run-id>

# Spezifisches Artifact
gh run download <run-id> --name=unit-test-results

# In bestimmtes Verzeichnis
gh run download <run-id> --dir=./artifacts
```

### 3.3 Artifact-Pfade im Workflow

| Workflow | Working Directory | Artifact Source |
|----------|------------------|-----------------|
| Server Tests | `El Servador/god_kaiser_server` | `junit-*.xml`, `coverage-*.xml` |
| ESP32 Tests | `El Servador/god_kaiser_server` | `junit-esp32.xml` |
| Frontend Tests | `El Frontend` | `junit-results.xml` |
| Backend E2E | `El Servador/god_kaiser_server` | `logs/server/e2e-results.xml`, `*.log` |
| Playwright E2E | `El Frontend` | `playwright-results.xml`, `playwright-report/`, `test-results/` |
| Wokwi Tests | `El Trabajante` | `*.log` |

---

## 4. GitHub CLI Befehle

### 4.1 Workflow-Status prüfen

```bash
# Alle Workflows auflisten
gh workflow list

# Runs eines spezifischen Workflows
gh run list --workflow=server-tests.yml --limit=10

# Nur fehlgeschlagene Runs
gh run list --status=failure --limit=5

# Runs für bestimmten Branch
gh run list --branch=feature/my-branch
```

### 4.2 Run-Details anzeigen

```bash
# Run-Übersicht
gh run view <run-id>

# Verbose (mit Job-Steps)
gh run view <run-id> --verbose

# Im Browser öffnen
gh run view <run-id> --web
```

### 4.3 Logs abrufen

```bash
# Vollständige Logs
gh run view <run-id> --log

# Nur fehlgeschlagene Steps
gh run view <run-id> --log-failed

# Logs eines spezifischen Jobs
gh run view <run-id> --job=<job-id> --log
```

### 4.4 Workflow manuell triggern

```bash
# Workflow starten
gh workflow run server-tests.yml

# Mit Branch
gh workflow run server-tests.yml --ref=feature/my-branch
```

### 4.5 Artifacts herunterladen

```bash
# Alle Artifacts
gh run download <run-id>

# Bestimmtes Artifact
gh run download <run-id> --name=unit-test-results

# Pattern-basiert
gh run download <run-id> --pattern=*-test-results
```

---

## 5. Troubleshooting: "CI ist rot"

### 5.1 Standard-Workflow

```bash
# 1. Fehlgeschlagenen Run finden
gh run list --status=failure --limit=5

# 2. Run-ID notieren und Logs holen
gh run view <run-id> --log-failed

# 3. Bei Bedarf vollständige Logs
gh run view <run-id> --log > ci_logs.txt

# 4. Artifacts herunterladen für lokale Analyse
gh run download <run-id>
```

### 5.2 Häufige Fehler

| Fehler | Ursache | Lösung |
|--------|---------|--------|
| `WOKWI_CLI_TOKEN` fehlt | GitHub Secret nicht konfiguriert | Repository Settings → Secrets → Actions → `WOKWI_CLI_TOKEN` |
| Poetry Cache Miss | Lock-File geändert | Normal, Cache wird neu aufgebaut |
| Mosquitto Health Check | Docker Container startet langsam | Normalerweise selbst-heilend |
| Test Timeout | Test dauert zu lange | Timeout im Workflow erhöhen oder Test optimieren |
| `docker compose up --wait` schlägt sofort fehl | Container-Exit ohne Log-Output | `--wait` entfernen, separaten Health-Poll-Step nutzen |
| Lokale Tests abgebrochen (OPS-ALERT) | auto-ops PostToolUse:Bash Hook prüft Exit-Codes | pytest exit-code 1 = Testfehler ist normal; Hook-Alert ignorieren oder Hook deaktivieren |
| `poetry lock --no-update` unbekannt | Poetry 2.x hat die Option entfernt | `poetry lock` (volles Resolve) verwenden |
| Security Scan schlägt wegen neuer CVEs | Trivy findet neue CVEs in Dependencies | Neue CVEs in `.trivyignore` eintragen mit Begründung (z.B. `# CVE-2026-27903 minimatch`); nur bei bekannter Nicht-Ausnutzbarkeit |

### 5.3 Lokale Reproduktion

```bash
# Server Tests lokal
cd "El Servador/god_kaiser_server"
.venv/Scripts/pytest.exe tests/unit/ -v --no-cov
.venv/Scripts/pytest.exe tests/integration/ -v --no-cov
.venv/Scripts/pytest.exe tests/esp32/ -v --no-cov

# Wokwi Test lokal (benötigt Token + Mosquitto auf localhost:1883)
export WOKWI_CLI_TOKEN=your_token
cd "El Trabajante"
pio run -e wokwi_simulation
wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/01-boot/boot_full.yaml

# Oder via Makefile
make wokwi-test-quick          # 3 Boot-Tests
make wokwi-test-full           # 22 Core-Szenarien
make wokwi-test-all            # Alle 191 Szenarien
make wokwi-test-error-injection # 10 Error-Injection
```

---

## 6. CI vs. Lokal

| Komponente | CI | Lokal |
|------------|-----|-------|
| **Python** | 3.11 | Poetry-Env (3.11+) |
| **Database** | SQLite In-Memory | SQLite/PostgreSQL |
| **MQTT Broker** | Mosquitto Docker | Optional lokal |
| **OS** | Ubuntu Latest | Windows/Linux/Mac |
| **Wokwi Token** | GitHub Secret | Environment Variable |

---

## 7. Secrets & Permissions

### 7.1 Verwendete Secrets

| Secret | Workflow | Zweck |
|--------|----------|-------|
| `WOKWI_CLI_TOKEN` | wokwi-tests.yml | Wokwi CLI Authentifizierung |
| `GITHUB_TOKEN` | Alle | Standard GitHub Token (automatisch) |

### 7.2 Workflow Permissions

| Workflow | Permissions |
|----------|-------------|
| Server Tests (test-summary) | `contents: read`, `checks: write`, `pull-requests: write` |
| Frontend Tests (test-summary) | `contents: read`, `checks: write`, `pull-requests: write` |
| Backend E2E (test-summary) | `contents: read`, `checks: write`, `pull-requests: write` |
| Playwright (test-summary) | `contents: read`, `checks: write`, `pull-requests: write` |
| PR Checks (label-pr) | `contents: read`, `pull-requests: write` |

---

## 8. Quick Reference

```bash
# ============================================
# STATUS PRÜFEN
# ============================================
gh workflow list                                    # Alle Workflows
gh run list --limit=5                               # Letzte 5 Runs
gh run list --status=failure --limit=3              # Fehlgeschlagene Runs

# ============================================
# LOGS ABRUFEN
# ============================================
gh run view <run-id> --log                          # Vollständige Logs
gh run view <run-id> --log-failed                   # Nur Fehler
gh run view <run-id> --verbose                      # Mit Job-Steps

# ============================================
# ARTIFACTS
# ============================================
gh run download <run-id>                            # Alle Artifacts
gh run download <run-id> --name=unit-test-results   # Spezifisch

# ============================================
# MANUELL TRIGGERN
# ============================================
gh workflow run server-tests.yml
gh workflow run wokwi-tests.yml
```

---

**Letzte Aktualisierung:** 2026-03-05
**Version:** 1.4
