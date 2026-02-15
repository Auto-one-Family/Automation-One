# Test-Engine Vollanalyse - Audit Report

> **Version:** 1.0 | **Datum:** 2026-02-06
> **Auftrag:** 6 - Test-Engine Vollanalyse
> **Status:** Analyse abgeschlossen

---

## 1. Test-Suite Inventar (IST-Zustand)

### 1.1 Gesamtübersicht

| Bereich | Tool | Dateien | Tests (ca.) | CI-Status | CI-Workflow |
|---------|------|---------|-------------|-----------|-------------|
| **Backend Unit** | pytest | 25 | ~200+ | ✅ Aktiv | server-tests.yml → unit-tests |
| **Backend Integration** | pytest | 40 | ~300+ | ✅ Aktiv | server-tests.yml → integration-tests |
| **Backend ESP32 Mock** | pytest | 30 | ~150+ | ✅ (in integration) | server-tests.yml |
| **Backend E2E** | pytest + aiomqtt | 2 | ~45 | ❌ Manuell | Nicht in CI |
| **Frontend Unit** | Vitest | 4 | ~160+ | ✅ Aktiv | frontend-tests.yml → unit-tests |
| **Frontend E2E** | Playwright | 5 | TBD | ❌ Manuell | Nicht in CI |
| **Firmware Wokwi** | Wokwi CLI | 163 | 163 | ⚠️ 32 von 163 | wokwi-tests.yml |

**Gesamtzahl Test-Dateien:** 105 (Backend) + 9 (Frontend) + 163 (Wokwi) = **277 Dateien**

---

## 2. Test → CI Pipeline Mapping

### 2.1 Vollständiges Mapping

| Test-Suite | Lokaler Befehl | CI-Workflow | CI-Job | Trigger-Pfad | Status |
|------------|---------------|-------------|--------|--------------|--------|
| Backend Unit | `poetry run pytest tests/unit/ -v` | server-tests.yml | unit-tests | `El Servador/**` | ✅ Korrekt |
| Backend Integration | `poetry run pytest tests/integration/ -v` | server-tests.yml | integration-tests | `El Servador/**` | ✅ Korrekt |
| Backend E2E | `make test-be-e2e` | backend-e2e-tests.yml | backend-e2e | `El Servador/**` | ✅ Korrekt |
| Backend ESP32 | `poetry run pytest tests/esp32/` | esp32-tests.yml | esp32-tests | `tests/esp32/**` | ⚠️ Pfad-Trigger |
| Frontend Unit | `npm run test:unit` | frontend-tests.yml | unit-tests | `El Frontend/**` | ✅ Korrekt |
| Frontend Build | `npm run build` | frontend-tests.yml | build | `El Frontend/**` | ✅ Korrekt |
| Frontend E2E | `npx playwright test` | ❌ NICHT in CI | - | - | ❌ Lücke |
| Wokwi | `make wokwi-test-full` | wokwi-tests.yml | 13 Jobs | `El Trabajante/**` | ✅ Korrekt |

### 2.2 Workflow-Details

| Workflow | Jobs | Parallelisierung | Timeout/Job |
|----------|------|------------------|-------------|
| `server-tests.yml` | lint → unit-tests → integration-tests → test-summary | Sequential (dependencies) | 15min |
| `esp32-tests.yml` | esp32-tests → test-summary | Sequential | 15min |
| `frontend-tests.yml` | type-check → unit-tests, build → test-summary | Partial parallel | 10-15min |
| `wokwi-tests.yml` | build-firmware → 12 test jobs → test-summary | Parallel test jobs | 10-20min |
| `pr-checks.yml` | label-pr, pr-validation | Parallel | 15min |

---

## 3. Docker-Service Abhängigkeiten

| Test-Suite | PostgreSQL | MQTT | Server | Frontend | Docker-Compose |
|------------|------------|------|--------|----------|----------------|
| Backend Unit | ❌ SQLite Mem | ❌ Mock | ❌ | ❌ | Nicht nötig |
| Backend Integration | ✅ | ✅ | ❌ | ❌ | docker-compose.ci.yml |
| Backend E2E | ✅ | ✅ | ✅ (laufend) | ❌ | docker-compose.yml |
| Frontend Unit | ❌ | ❌ (MSW) | ❌ (MSW) | ❌ | Nicht nötig |
| Frontend E2E | ✅ | ✅ | ✅ | ✅ | docker-compose.e2e.yml |
| Wokwi | ❌ | ✅ | ❌ | ❌ | docker run mosquitto |

### 3.1 Compose-File Mapping

| Compose-Datei | Verwendung | Services |
|---------------|------------|----------|
| `docker-compose.yml` | Basis/Produktion | postgres, mqtt-broker, el-servador |
| `docker-compose.dev.yml` | Development | + hot-reload |
| `docker-compose.ci.yml` | CI (tmpfs) | postgres (RAM), mqtt-broker |
| `docker-compose.e2e.yml` | E2E Tests | + el-frontend |
| `docker-compose.test.yml` | Test-Umgebung | Alle Services |

---

## 4. Agent → Test Zugriff

| Agent | Kann Tests starten? | Kann Ergebnisse lesen? | Relevante Suites |
|-------|---------------------|------------------------|------------------|
| `system-control` | ✅ (Bash) | ✅ (Logs) | Alle |
| `server-debug` | ❌ | ✅ (Logs, Reports) | Backend * |
| `mqtt-debug` | ❌ | ✅ (MQTT Logs) | - |
| `esp32-debug` | ❌ | ✅ (Serial Logs) | Wokwi |
| `frontend-debug` | ❌ | ✅ (Build Logs) | Frontend * |
| `meta-analyst` | ❌ | ✅ (Alle Reports) | Alle |
| `server-dev` | ✅ (pytest) | ✅ | Backend * |
| `frontend-dev` | ✅ (vitest, playwright) | ✅ | Frontend * |
| `esp32-dev` | ✅ (pio) | ✅ | Wokwi |

---

## 5. Geplante Tests (Aus Auftrags-Reports)

| Auftrag | Bereich | Status | Report | Geschätzte Tests |
|---------|---------|--------|--------|------------------|
| Auftrag 1 | Backend WebSocket E2E | ⏳ Geplant | ✅ WEBSOCKET_E2E_ANALYSE.md | ~45 |
| Auftrag 2 | esp.ts Store Tests | ⏳ Geplant | ✅ ESP_STORE_TEST_ANALYSE.md | ~55 |
| Auftrag 3 | useWebSocket Composable | ⏳ Geplant | ❌ Nicht erstellt | TBD |
| Auftrag 4 | Playwright Browser E2E | ⏳ Geplant | ❌ Nicht erstellt | TBD |
| Auftrag 5 | Wokwi CI-Expansion | ⏳ Geplant | ❌ Nicht erstellt | +131 Szenarien |

---

## 6. Gefundene Inkonsistenzen

### 6.1 Dokumentations-Inkonsistenzen

| Dokument | Zeile | Behauptung | Realität | Priorität |
|----------|-------|------------|----------|-----------|
| TEST_WORKFLOW.md | L32 | 101 Test-Dateien | 105 Dateien | P2 |
| Makefile | L50 | "24 CI scenarios" | 32 Szenarien | P3 |
| wokwi-tests.yml | L15 | "15 scenarios total" | 32 Szenarien | P3 |
| SYSTEM_OPERATIONS_REFERENCE | L1407-1419 | 32 aktive CI | ✅ Korrekt | - |

### 6.2 Fehlende CI-Integration

| Test-Suite | Lokale Ausführung | CI-Status | Lösung |
|------------|-------------------|-----------|--------|
| Backend E2E | ✅ `make test-be-e2e` | ✅ `backend-e2e-tests.yml` | ✅ BEHOBEN |
| Frontend Playwright | ✅ `make e2e-test` | ❌ Nicht integriert | CI-Workflow erstellen |

### 6.3 Fehlende Makefile-Targets

| Target | Erwartete Funktion | Aktueller Status |
|--------|-------------------|------------------|
| `make test-be` | Backend Unit + Integration | ❌ Existiert nicht |
| `make test-be-unit` | Nur Backend Unit | ❌ Existiert nicht |
| `make test-be-integration` | Nur Backend Integration | ❌ Existiert nicht |
| `make test-be-e2e` | Backend E2E | ✅ BEHOBEN |
| `make test-be-e2e-ws` | Nur WebSocket E2E | ✅ BEHOBEN |
| `make test-be-e2e-running` | E2E gegen laufenden Stack | ✅ BEHOBEN |

---

## 7. Priorisierte Fix-Liste

### P1 - Kritisch (CI-Lücken)

| # | Problem | Fix | Aufwand | Status |
|---|---------|-----|---------|--------|
| 1 | Backend E2E nicht in CI | `backend-e2e-tests.yml` erstellen | ~2h | ✅ BEHOBEN |
| 2 | Playwright E2E nicht in CI | `playwright-tests.yml` erstellen | ~2h | ❌ Offen |

### P2 - Wichtig (Dokumentation)

| # | Problem | Fix | Aufwand |
|---|---------|-----|---------|
| 3 | TEST_WORKFLOW.md Datei-Anzahlen | Zahlen aktualisieren | 15min |
| 4 | CI_PIPELINE.md Wokwi-Section | Jobs vollständig dokumentieren | 30min |

### P3 - Nice-to-have

| # | Problem | Fix | Aufwand |
|---|---------|-----|---------|
| 5 | Makefile "24 CI" Kommentar | Kommentar korrigieren | 5min |
| 6 | wokwi-tests.yml "15 scenarios" | Kommentar korrigieren | 5min |
| 7 | Fehlende test-be-* Targets | Targets hinzufügen | 20min |

---

## 8. Wokwi Szenario-Analyse

### 8.1 Verteilung

| Kategorie | Gesamt | In CI | Coverage |
|-----------|--------|-------|----------|
| 01-boot | 8 | 2 | 25% |
| 02-sensor | 25 | 6 | 24% |
| 03-actuator | 35 | 8 | 23% |
| 04-zone | 12 | 2 | 17% |
| 05-emergency | 18 | 3 | 17% |
| 06-config | 22 | 2 | 9% |
| 07-combined | 15 | 3 | 20% |
| 08-stress | 10 | 0 | 0% |
| 09-regression | 18 | 6 | 33% |
| **Gesamt** | **163** | **32** | **20%** |

### 8.2 CI-Expansion-Empfehlung

Priorisiert nach Risiko und Test-Wert:
1. **08-stress/** - 0% Coverage, wichtig für Stabilität
2. **06-config/** - 9% Coverage, Config-Änderungen brechen oft
3. **04-zone/** und **05-emergency/** - Safety-kritisch

---

## 9. Log-Integration

### 9.1 Test-Output → Log-Pfade

| Test-Suite | Log-Pfad | Format |
|------------|----------|--------|
| Backend pytest | `logs/server/pytest-*.log` | Text |
| Frontend Vitest | stdout / `logs/frontend/` | Text |
| Wokwi | `logs/wokwi/*.log` | Text |
| CI Artifacts | GitHub Actions | ZIP |

### 9.2 Report-Pfade

| Report-Typ | Pfad | Erstellt von |
|------------|------|--------------|
| Session-Reports | `.claude/reports/current/` | Debug-Agents |
| Test-Analysen | `.claude/reports/current/*_ANALYSE.md` | Plan Mode |
| CI-Artifacts | GitHub Actions Download | CI |

---

## 10. Verifizierungsstatus

| Prüfpunkt | Status | Notizen |
|-----------|--------|---------|
| Alle Test-Suites inventarisiert | ✅ | 7 Kategorien |
| CI-Workflow-Mapping vollständig | ✅ | 5 Workflows |
| Docker-Abhängigkeiten dokumentiert | ✅ | 5 Compose-Files |
| Agent-Zugriff dokumentiert | ✅ | 9 Agents |
| Inkonsistenzen identifiziert | ✅ | 7 gefunden |
| Fix-Liste priorisiert | ✅ | P1-P3 |

---

## 11. CLAUDE.md Update (Empfehlung)

Die folgende Änderung wird für `.claude/CLAUDE.md` empfohlen:

### Aktuelle Zeile (unter `## Referenzen`):

```markdown
| `reference/testing/` | TEST_WORKFLOW, SYSTEM_OPERATIONS_REFERENCE |
```

### Empfohlene Änderung:

```markdown
| `reference/testing/` | TEST_WORKFLOW, SYSTEM_OPERATIONS_REFERENCE, TEST_ENGINE_REFERENCE |
```

**Hinweis:** Diese Änderung wurde NICHT automatisch durchgeführt (gemäß Auftrag: "dokumentieren, nicht editieren").

---

**Erstellt:** 2026-02-06
**Status:** Audit abgeschlossen, Reference erstellt
