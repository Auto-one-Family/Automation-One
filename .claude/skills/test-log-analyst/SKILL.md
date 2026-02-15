---
name: test-log-analyst
description: |
  Test-Log-Analyse für AutomationOne.
  Analysiert pytest, Vitest, Playwright, Wokwi Test-Outputs – lokal und CI.
  Parst JUnit XML, HTML-Reports, Coverage, CI-Logs (gh run view).
  MUST BE USED when: Test-Failures analysieren, CI rot, "warum schlägt Test X fehl",
  Playwright/Vitest/pytest/Wokwi Logs prüfen, CI vs lokal vergleichen.
  NOT FOR: Runtime-Logs (god_kaiser, esp32_serial, mqtt_traffic) → server-debug, esp32-debug, mqtt-debug.
  User-Workflow: Robin führt Tests manuell aus. Agent gibt bei /test gruppierte Befehle (mit vollem Projektpfad) aus.
  Robin signalisiert Fertigstellung; Agent analysiert Logs und aktualisiert .claude/reports/Testrunner/test.md fortlaufend.
allowed-tools: Read, Grep, Glob, Bash
---

# Test-Log-Analyst — Skill Dokumentation

> **Fokus:** Test-Framework-Output (pytest, Vitest, Playwright, Wokwi) – lokal und CI
> **Output:** `.claude/reports/Testrunner/test.md` – fortlaufend aktualisiert

---

## 0. Quick Reference

| Ich analysiere... | Primäre Quelle | Format |
|-------------------|----------------|--------|
| **pytest** | logs/backend/pytest.log, pytest-results.xml | Text, JUnit XML |
| **Vitest** | logs/frontend/vitest/, El Frontend/junit-results.xml | JUnit XML, Coverage |
| **Playwright** | logs/frontend/playwright/test-results/, playwright-report/ | HTML, traces (.zip) |
| **Wokwi** | logs/wokwi/reports/junit_*.xml, test_report_*.json | JSON, JUnit XML |
| **CI** | `gh run view <run-id> --log` / `--log-failed` | Text, Artifacts |

### Was ist NICHT mein Bereich?

| Symptom | Weiterleiten an |
|---------|----------------|
| Runtime god_kaiser.log | server-debug |
| ESP32 Serial-Logs während Test | esp32-debug |
| MQTT-Traffic auf Broker-Level | mqtt-debug |
| Frontend Build/Runtime (nicht Test) | frontend-debug |

---

## 1. Log-Locations (Test-Outputs)

### Lokal

| Framework | Pfad | Erzeugt durch |
|----------|------|---------------|
| pytest | `logs/backend/pytest.log`, `logs/backend/pytest-results.xml` | `make test-be-capture` |
| pytest E2E | `logs/server/e2e-running.log`, `logs/server/e2e-running-results.xml` | `make test-be-e2e-running` |
| Vitest | `logs/frontend/vitest/coverage/`, `El Frontend/junit-results.xml` | `make test-fe-unit` |
| Playwright | `logs/frontend/playwright/test-results/`, `playwright-report/` | `make e2e-test` |
| Wokwi | `logs/wokwi/reports/junit_*.xml`, `test_report_*.json`, `serial/`, `mqtt/` | `make wokwi-test-full` |

### CI (GitHub Actions)

| Workflow | Artifact-Name | Inhalt |
|----------|---------------|--------|
| server-tests | unit-test-results, integration-test-results | junit-*.xml, coverage-*.xml |
| esp32-tests | esp32-test-results | junit-esp32.xml |
| frontend-tests | frontend-test-results | junit-results.xml, coverage/ |
| playwright-tests | playwright-report, playwright-traces | test-results/, playwright-report/ |
| wokwi-tests | boot-test-logs, sensor-test-logs, etc. | *.log, junit_*.xml |

---

## 2. User-Workflow (/test)

1. **Befehlsausgabe:** Gruppierte Befehle mit vollem Projektpfad
2. **Erster Befehl:** `cd "c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one"`
3. **PowerShell-kompatibel:** Copy-Paste-fähig (make via Git Bash/WSL oder mingw32-make)
4. **Robin signalisiert:** "fertig" oder "Fehler bei X" oder "abgebrochen"
5. **Log-Analyse:** Alle relevanten Logs lesen, Report aktualisieren

---

## 3. CI-Zugriff (Bash erforderlich)

```bash
# Fehlgeschlagene Runs
gh run list --status=failure --limit=5

# Vollständige Logs
gh run view <run-id> --log

# Nur fehlgeschlagene Steps
gh run view <run-id> --log-failed

# Artifacts herunterladen
gh run download <run-id>
gh run download <run-id> --name=unit-test-results
gh run download <run-id> --dir=./artifacts
```

---

## 4. JUnit XML Parsing

Typische Struktur:

```xml
<testsuite tests="10" failures="2" errors="0">
  <testcase name="test_something" classname="test_module">
    <failure message="AssertionError">...</failure>
  </testcase>
</testsuite>
```

**Grep-Patterns:**
- `grep -E "<failure|<error" junit*.xml` – Fehlgeschlagene Tests
- `grep testsuite junit*.xml` – Zusammenfassung (tests, failures, errors)

---

## 5. Report-Struktur

Output: `.claude/reports/Testrunner/test.md`

**Sektionen:**
1. Zusammenfassung (pro Bereich: Status, Fehleranzahl, Empfehlung)
2. Backend (pytest)
3. Frontend (Vitest)
4. Playwright E2E
5. Wokwi
6. Nächste Schritte

**Update-Modus:** Fortlaufend – bei mehreren Analyse-Phasen Report erweitern, nicht überschreiben.

---

## 6. Referenzen

| Wann | Datei | Zweck |
|------|-------|-------|
| Log-Pfade | `.claude/reference/debugging/LOG_LOCATIONS.md` | Detaillierte Pfade |
| CI | `.claude/reference/debugging/CI_PIPELINE.md` | Artifacts, gh CLI |
| Makefile | `.claude/reference/testing/TEST_ENGINE_REFERENCE.md` | Targets, Befehle |
| Workflow | `.claude/reference/testing/TEST_WORKFLOW.md` | pytest/Vitest/Playwright |

---

**Version:** 1.0
**Erstellt:** 2026-02-07
