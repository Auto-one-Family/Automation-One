# TM-Auftrag 06: Test Engine – Vollständige Durchsicht & Ablaufprüfung

**Verfasser:** Robin (System-Kontext)  
**Format:** Einzelgespräch mit Technical Manager  
**Ziel:** Test Engine von vorn bis hinten prüfen, jeden Ablauf einzeln fokussiert durchgehen

---

## 0. Referenzdokumente für TM (Robin mitliefern)

**Diese Dateien zuerst lesen – sie liefern die Grundlage für gezielte Analyse.**

| Priorität | Pfad (relativ zu Projektroot) | Inhalt |
|-----------|-------------------------------|--------|
| 1 | `.claude/reference/testing/TEST_ENGINE_REFERENCE.md` | Pyramide, Befehle, Log-Pfade, Makefile-Targets, CI-Workflows |
| 2 | `.claude/skills/test-log-analyst/SKILL.md` | Befehlsausgabe, Log-Quellen, `test.md` Update-Workflow |
| 3 | `.claude/reference/testing/flow_reference.md` | F4: Test-Log-Analyse – test-log-analyst, nicht Teil F1 |
| 4 | `.claude/reference/debugging/LOG_LOCATIONS.md` | Sektion 3 (pytest), 4 (Wokwi), 7 (GitHub Actions) |
| 5 | `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | `make test-be-capture`, `make e2e-up`, `make wokwi-test-full` |

**Log-Pfade:** `logs/backend/`, `logs/frontend/`, `logs/wokwi/reports/`, `logs/server/` (E2E)  
**Report:** `.claude/reports/Testrunner/test.md` – Ergebnis von test-log-analyst.

---

## 1. Referenzdateien für TM-Session hochladen

| # | Datei | Zweck |
|---|-------|-------|
| 1 | `.claude/reference/testing/TEST_ENGINE_REFERENCE.md` | Pyramide, Befehle, CI |
| 2 | `.claude/reference/testing/TEST_WORKFLOW.md` | pytest, Wokwi |
| 3 | `.claude/reference/testing/flow_reference.md` | F4 Test-Log-Analyse |
| 4 | `.claude/skills/test-log-analyst/SKILL.md` | Log-Analyse |
| 5 | `.claude/reports/current/TEST_ENGINE_AUDIT.md` | Audit |
| 6 | `Makefile` | test-*, e2e-*, wokwi-* Targets |
| 7 | `El Frontend/playwright.config.ts` | Playwright |
| 8 | `El Frontend/tests/` | E2E, Unit |
| 9 | `El Servador/god_kaiser_server/tests/` | pytest |

---

## 2. IST-Zustand (Fakten)

### 2.1 Test-Pyramide

```
E2E (Playwright, pytest E2E)
    ↓
Integration (pytest, Docker)
    ↓
Unit (pytest, Vitest)
    ↓
Firmware (Wokwi 163 Szenarien, 138 in CI)
```

### 2.2 Backend (pytest)

| Kategorie | Pfad | CI |
|-----------|------|-----|
| Unit | tests/unit/ | ✅ |
| Integration | tests/integration/ | ✅ |
| ESP32 Mock | tests/esp32/ | ✅ |
| E2E | tests/e2e/ | ❌ Manuell |

### 2.3 Frontend

| Kategorie | Tool | CI |
|-----------|------|-----|
| Unit | Vitest | ✅ |
| E2E | Playwright | ❌ Manuell |

### 2.4 Wokwi

- 163 Szenarien, 138 in CI.
- Tiered CI-Triggering fehlt (Phase 0.2).
- Python-Runner für Extended; Core-Jobs noch for-loops.

### 2.5 Playwright

- 5 Szenarien.
- E2E-Stack: `make e2e-up` → `make e2e-test` → `make e2e-down`.
- Nochmal prüfen: Erweiterung oder realistischere Szenarien.

### 2.6 test-log-analyst – Abarbeitbare Quick-Reference

| Framework | Log-Pfad | Make-Target | CI |
|-----------|----------|-------------|-----|
| pytest | `logs/backend/pytest.log`, `pytest-results.xml` | `make test-be-capture` | server-tests.yml |
| pytest E2E | `logs/server/e2e-running.log`, `e2e-running-results.xml` | `make test-be-e2e-running` | — |
| Vitest | `logs/frontend/vitest/`, `junit-results.xml` | `make test-fe-unit` | frontend-tests.yml |
| Playwright | `logs/frontend/playwright/test-results/`, `playwright-report/` | `make e2e-test` | — |
| Wokwi | `logs/wokwi/reports/junit_*.xml`, `test_report_*.json` | `make wokwi-test-full` | wokwi-tests.yml |

**Workflow:** Robin führt Befehle aus → signalisiert Fertig → test-log-analyst analysiert Logs → aktualisiert `.claude/reports/Testrunner/test.md`.

---

## 3. Offene Fragen (für TM)

1. **Playwright:** Ist die aktuelle Coverage ausreichend? Welche Szenarien fehlen? Sind die Tests realistisch genug?
2. **Backend E2E:** Sollen E2E-Tests in CI integriert werden? Welche Abhängigkeiten blockieren?
3. **test-log-analyst:** Reicht der Workflow (Befehle ausgeben → Robin ausführen → Log-Analyse)? Was fehlt?
4. **Wokwi:** Siehe TM_01 – Tiered Triggering, Core-Jobs, Retry.
5. **Ablauf pro Kontext:** Sollen Backend, Frontend, Wokwi, E2E jeweils einzeln durchgegangen werden? Welche Reihenfolge?
6. **CI-Zusammenfassung:** Wie sollen alle Test-Suites in einer Übersicht erscheinen? (z.B. dorny/test-reporter, Summary-Job)

---

## 4. Bereiche für Detail-Analyse

| Bereich | Dateien | Fokus |
|---------|---------|-------|
| pytest | conftest.py, tests/ | Fixtures, Marker, Coverage |
| Vitest | vitest.config.ts, tests/unit/ | MSW, Coverage |
| Playwright | playwright.config.ts, tests/e2e/ | Szenarien, Assertions |
| Wokwi | scripts/run-wokwi-tests.py, scenarios/ | Kategorien, Retry |
| CI | .github/workflows/*.yml | Trigger, Artifacts |
| Makefile | test-*, e2e-*, wokwi-* | Abhängigkeiten |

### 4.1 Wo suchen / Was suchen

| Schicht | Wo suchen | Was suchen |
|---------|-----------|------------|
| **pytest** | `El Servador/god_kaiser_server/tests/` | `conftest.py`, `pytest-results.xml`, `logs/backend/` |
| **Vitest** | `El Frontend/tests/unit/`, `vitest.config.ts` | MSW Handler, `junit-results.xml` |
| **Playwright** | `El Frontend/tests/e2e/`, `playwright.config.ts` | `sensor-live.spec.ts`, `createMockEspWithSensors`, `make e2e-up` |
| **Wokwi** | `scripts/run-wokwi-tests.py`, `El Trabajante/tests/wokwi/` | ACTIVE_CATEGORIES, `junit_*.xml`, `test_report_*.json` |
| **CI** | `.github/workflows/server-tests.yml`, `wokwi-tests.yml` | `docker-compose.ci.yml`, Artifacts |

### 4.2 Agent-Befehle für gezielte Analyse

| Analyse-Ziel | Agent | TM-Befehl (Kern) |
|--------------|-------|------------------|
| Test-Logs, CI vs lokal | test-log-analyst | Robin: /test – Befehle ausgeben; Robin führt aus; Analysiere `logs/backend/`, `logs/wokwi/` → test.md |
| pytest-Failures | server-dev | `make test-be-capture` – welcher Test, welche Fixture? |
| Playwright-E2E | frontend-dev | `make e2e-up` + `make e2e-test` – Backend reachable? |
| Wokwi | esp32-dev | `make wokwi-test-full` – Kategorien, Retry, JUnit |

---

## 5. Empfohlene Agents & Skills

| Zweck | Agent | Skill |
|-------|-------|-------|
| Test-Log-Analyse | test-log-analyst | test-log-analyst |
| pytest, Backend | server-dev | server-development |
| Vitest, Playwright | frontend-dev | frontend-development |
| Wokwi | esp32-dev | esp32-development |
| Ausführung | system-control | system-control |
| Flow-Konsistenz | agent-manager | agent-manager |

---

## 6. Verknüpfung mit anderen Punkten

- **Punkt 1 (Wokwi):** Wokwi-Tests.
- **Punkt 2 (Docker):** CI-Stack, E2E-Stack.
- **Punkt 5 (Frontend):** Playwright-Tests.

---

## 7. Randinformationen (Full-Stack-Kontext)

| Kontext | Info |
|---------|------|
| **E2E-Voraussetzung** | `make e2e-up` MUSS vor Playwright – sonst „Backend not reachable at http://localhost:8000“ |
| **test-log-analyst** | Liest Test-Outputs (pytest, Vitest, Playwright, Wokwi) – NICHT Runtime-Logs (→ server-debug, esp32-debug) |
| **CI-Artefakte** | `gh run download <run-id>` – JUnit XML, Logs für Offline-Analyse |
