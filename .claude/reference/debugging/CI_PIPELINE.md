# CI/CD Pipeline - AutomationOne

> **Version:** 1.0 | **Aktualisiert:** 2026-02-01
> **Zweck:** Vollständige Dokumentation der GitHub Actions Workflows
> **Themengebiet:** CI/CD, Artifacts, GitHub CLI

---

## 1. Workflow-Übersicht

| Workflow | Datei | Trigger | Jobs | Timeout |
|----------|-------|---------|------|---------|
| **Server Tests** | `server-tests.yml` | Push/PR zu `El Servador/**` | lint, unit-tests, integration-tests, test-summary | 15min/Job |
| **ESP32 Tests** | `esp32-tests.yml` | Push/PR zu `tests/esp32/**`, `src/mqtt/**`, `src/services/**` | esp32-tests | 15min |
| **Wokwi ESP32 Tests** | `wokwi-tests.yml` | Push/PR zu `El Trabajante/**` | 12 Jobs (build-firmware, boot-tests, sensor-tests, etc.) | 10-20min/Job |
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
| `unit-test-results` | `junit-unit.xml`, `coverage-unit.xml` | Default (90 Tage) |
| `integration-test-results` | `junit-integration.xml`, `coverage-integration.xml` | Default (90 Tage) |

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
| `esp32-test-results` | `junit-esp32.xml` | Default (90 Tage) |

**Wichtig:** Tests stoppen beim ersten Fehler (`-x` Flag) für schnelleres Feedback.

---

### 2.3 Wokwi ESP32 Tests (`wokwi-tests.yml`)

**Trigger:**
- `push` zu `El Trabajante/**`
- `pull_request` zu `El Trabajante/**`
- `workflow_dispatch` (manuell)

**Voraussetzungen:**
- GitHub Secret `WOKWI_CLI_TOKEN` muss konfiguriert sein
- Token erstellen: https://wokwi.com/dashboard/ci

**Jobs (12 parallel):**

| Job | Timeout | Tests | Beschreibung |
|-----|---------|-------|--------------|
| `build-firmware` | 10min | - | Firmware bauen mit PlatformIO |
| `boot-tests` | 15min | boot_full, boot_safe_mode | Boot-Sequenz prüfen |
| `sensor-tests` | 15min | sensor_heartbeat, sensor_ds18b20_read | Sensor-Funktionen |
| `mqtt-connection-test` | 15min | mqtt_connection | Legacy MQTT Test |
| `actuator-tests` | 15min | led_on, pwm, status_publish, emergency_clear | Actuator-Steuerung |
| `zone-tests` | 15min | zone_assignment, subzone_assignment | Zone-System |
| `emergency-tests` | 15min | emergency_broadcast, emergency_esp_stop | Emergency-Stop |
| `config-tests` | 15min | config_sensor_add, config_actuator_add | Dynamische Config |
| `sensor-flow-tests` | 15min | ds18b20_full_flow, dht22_full_flow, analog_flow | E2E Sensor |
| `actuator-flow-tests` | 20min | binary_full_flow, pwm_full_flow, timeout_e2e | E2E Actuator |
| `combined-flow-tests` | 20min | combined_sensor_actuator, emergency_stop_full_flow, multi_device_parallel | E2E Combined |
| `test-summary` | - | - | Ergebnis-Zusammenfassung |

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

---

### 2.4 PR Checks (`pr-checks.yml`)

**Trigger:**
- `pull_request` (opened, synchronize, reopened)

**Jobs:**

| Job | Beschreibung |
|-----|--------------|
| `label-pr` | Automatisches Labeling basierend auf geänderten Dateien |
| `pr-validation` | Prüft auf große Dateien (>5MB) und sensitive Dateien (.env, Secrets) |

**Sensitive File Patterns:**
```
.env, .env.*, *.env, credentials.json, secrets.json,
private.key, *.pem, *.key, id_rsa, id_ed25519,
*.p12, *.pfx, service-account.json, firebase-adminsdk*.json
```

---

## 3. Artifact-System

### 3.1 Retention Policies

| Kategorie | Retention | Beispiel |
|-----------|-----------|----------|
| **Test Results (XML)** | 90 Tage | `junit-*.xml`, `coverage-*.xml` |
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

### 5.3 Lokale Reproduktion

```bash
# Server Tests lokal
cd "El Servador/god_kaiser_server"
poetry run pytest tests/unit/ -v --no-cov
poetry run pytest tests/integration/ -v --no-cov
poetry run pytest tests/esp32/ -v --no-cov

# Wokwi Test lokal (benötigt Token)
export WOKWI_CLI_TOKEN=your_token
cd "El Trabajante"
pio run -e wokwi_simulation
wokwi-cli . --timeout 90000 --scenario tests/wokwi/boot_test.yaml
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

**Letzte Aktualisierung:** 2026-02-01
**Version:** 1.0
