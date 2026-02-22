# CI/CD & Test-Infrastruktur — Vollstaendiger Audit

> Datum: 2026-02-22
> Agent: agent-manager (Modus 2)
> Branch: feature/frontend-consolidation

## Executive Summary

- **Gesamtbewertung: 3/10**
- **Kritische Findings: 11**
- **Blocker: 4**
- **Empfehlung:** CI/CD-Infrastruktur ist nur zu ~25% funktional. Nur 2 von 8 Pipelines laufen stabil gruen (esp32-tests, wokwi-tests). 4 Pipelines haben NULL Runs. PR-Checks sind dauerhaft rot. Server-Tests dauerhaft rot. Vor Phase 2 muessen mindestens die Blocker behoben werden.

---

## Phase A: GitHub-Analyse

### A.1 Pipeline-Status

| Pipeline | Letzter Run | Ergebnis | Trend (letzte 5) | Trigger |
|----------|-------------|----------|-------------------|---------|
| server-tests | 2026-02-07 | FAIL | 5/5 FAIL | pull_request |
| frontend-tests | **NIE** | N/A | 0 Runs gesamt | — |
| esp32-tests | 2026-02-07 | PASS | 5/5 PASS | pull_request |
| wokwi-tests | 2026-02-15 | PASS | 5/5 PASS | push/pull_request |
| backend-e2e-tests | **NIE** | N/A | 0 Runs gesamt | — |
| playwright-tests | **NIE** | N/A | 0 Runs gesamt | — |
| pr-checks | 2026-02-15 | FAIL | 5/5 FAIL | pull_request |
| security-scan | **NIE** | N/A | 0 Runs gesamt | — |

**Zusammenfassung:** 2/8 Pipelines funktionieren (25%). 4/8 haben nie gelaufen. 2/8 sind dauerhaft rot.

### A.1.1 Fehleranalyse: server-tests (DAUERHAFT ROT)

```
Run-ID: 21780110368 (2026-02-07)
Fehler: Integration Tests Job scheitert
Ursache: Aus dem --log-failed Output nicht direkt erkennbar (nur Cleanup-Logs sichtbar).
Vermutung: Gleiche psutil/Import-Fehler wie lokal, oder Integration-Tests schlagen mit
fehlenden DB-Fixtures fehl.
```

Alle 5 letzten Runs: FAIL auf `feature/docs-cleanup` Branch (PR-triggered).

### A.1.2 Fehleranalyse: pr-checks (DAUERHAFT ROT)

```
Run-ID: 22040212512 (2026-02-15)
EXAKTE Fehlerursache:
  ##[error]Potentially sensitive file detected: ./.env.ci
  ##[error]Process completed with exit code 1.
```

Die `.env.ci` Datei ist im Repository committed und wird vom Sensitive-File-Check als Geheimnis erkannt. `.gitignore` enthaelt `.env` und `.env.local` aber NICHT `.env.ci`.

### A.2 Branch-Struktur

**Default-Branch:** `master` (NICHT `main`)

**Existierende Branches (9):**

| Branch | Status |
|--------|--------|
| master | Default, geschuetzt |
| feature/frontend-consolidation | Aktiv (aktueller Arbeitsbranch) |
| feature/docs-cleanup | PR #4 gemergt, kann geloescht werden |
| feature/dashboard-consolidation | Verwaist? Kein aktiver PR |
| cursor/projekt-design-konsolidierung-161e | PR #7 gemergt, kann geloescht werden |
| cursor/playwright-css-testkonzept-7562 | PR #7 gemergt, kann geloescht werden |
| claude/optimize-esp32-mocks-y5CML | Verwaist |
| claude/review-agent-structure-ymhUi | Verwaist |
| claude/test-engine-analysis-fixes-7r3x3 | Verwaist |

**Verwaiste Branches:** 5-6 Branches koennen aufgeraeumt werden.

**Branch-Protection auf `master`:**

| Regel | Status |
|-------|--------|
| Required PR reviews | JA (1 Review) |
| Dismiss stale reviews | JA |
| Require code owner reviews | NEIN |
| Enforce for admins | NEIN |
| Required status checks | **NICHT KONFIGURIERT** |
| Required linear history | NEIN |
| Allow force push | NEIN |

**KRITISCH:** Keine required status checks! PRs koennen gemergt werden OBWOHL alle Checks rot sind. Das erklaert warum PR-Checks dauerhaft rot sind und trotzdem gemergt wird.

### A.3 Secrets und Variablen

| Typ | Name | Erstellt | Status |
|-----|------|----------|--------|
| Secret | WOKWI_CLI_TOKEN | 2026-01-05 | OK |
| Variables | — | — | Keine konfiguriert |
| Environments | — | — | Keine konfiguriert |

**Findings:**
- WOKWI_CLI_TOKEN vorhanden (Pflicht fuer wokwi-tests.yml) ✓
- Keine weiteren Secrets noetig fuer aktuelle Pipelines ✓
- Keine Environments konfiguriert (irrelevant da kein Deployment)

### A.4 Actions-Konfiguration

- Concurrency mit `cancel-in-progress: true` in allen Workflows ✓
- `actions/checkout@v4`, `actions/setup-python@v5`, `actions/setup-node@v4` — alle aktuell ✓
- GITHUB_TOKEN Permissions auf Contents:read, Metadata:read, Packages:read (Default)

### A.5 Offene PRs und Merge-Historie

**Offene PRs:** 0

**Letzte 6 gemergte PRs:**

| # | Titel | Branch | Gemergt |
|---|-------|--------|---------|
| 7 | Playwright CSS testkonzept | cursor/playwright-css-testkonzept-7562 | 2026-02-15 |
| 5 | Frontend consolidation | feature/frontend-consolidation | 2026-02-12 |
| 4 | Bugbot analysis of HAL | feature/docs-cleanup | 2026-01-29 |
| 3 | docs: enhance BUGBOT.md | feature/docs-cleanup | 2026-01-29 |
| 2 | Wokwi E2E flow tests | feature/wokwi-e2e-flow-tests | 2026-01-28 |
| 1 | Claude interface layout | claude branch | 2025-11-23 |

PRs sind das normale Merge-Verfahren. Kein direktes Pushen auf master (geschuetzt).

---

## Phase B: Pipeline-Verifikation

### B.1 server-tests.yml

| Check | Status | Details |
|-------|--------|---------|
| Trigger korrekt | ✓ | Push/PR auf main/master/develop, Pfad El Servador/** |
| Python-Version | ✓ | 3.11 (stimmt mit pyproject.toml) |
| Poetry-Version | ⚠ | 1.7.1 — funktional, aber veraltet (aktuell: ~1.8.x) |
| Ruff-Config | ✓ | `poetry run ruff check` mit continue-on-error |
| Black-Config | ✓ | `poetry run black --check` mit continue-on-error |
| pytest Unit | ✓ | `tests/unit/` mit Coverage |
| pytest Integration | ✓ | `tests/integration/` mit Mosquitto Service-Container |
| Timeout | ✓ | 15min pro Job |
| Caching | ✓ | Poetry .venv + ~/.cache/pypoetry gecacht |
| Service-Container | ✓ | Mosquitto fuer Integration Tests |
| Test Summary | ✓ | EnricoMi/publish-unit-test-result-action@v2 |

**Problem:** Lint-Jobs haben `continue-on-error: true` — Lint-Fehler blockieren NICHT den Build. Unit-Tests und Integration-Tests laufen PARALLEL (beide `needs: lint`), nicht sequenziell.

**CI-Ergebnis:** DAUERHAFT ROT. Vermutlich psutil-Import-Fehler auch im CI (psutil IST in pyproject.toml, aber Collection-Errors trotzdem moeglich bei inkompatiblen Imports).

### B.2 frontend-tests.yml

| Check | Status | Details |
|-------|--------|---------|
| Trigger korrekt | ✓ | Push/PR auf main/master/develop, Pfad El Frontend/** |
| Node-Version | ✓ | 20 |
| Scripts existieren | ✓ | `npm run type-check` = vue-tsc, `npm run test:unit` = vitest |
| TypeScript Check | ✓ | Eigener Job |
| Unit Tests | ✓ | vitest mit JUnit-Output |
| Build Check | ✓ | npm run build + Bundle-Size-Report |
| Caching | ✓ | npm cache via actions/setup-node |

**Problem:** Pipeline hat **NULL Runs**. Die Trigger erfordern Push/PR auf main/master/develop UND Pfad-Aenderung in El Frontend/**. Wahrscheinlich:
1. Direkte Pushes auf master kommen nicht vor (Branch Protection)
2. PRs die El Frontend aendern wurden nicht auf master gemergt WAEHREND diese Workflow-Datei existierte
3. Oder: Workflow wurde erst NACH den PRs zum master Branch hinzugefuegt

### B.3 esp32-tests.yml

| Check | Status | Details |
|-------|--------|---------|
| Trigger korrekt | ✓ | Push/PR auf main/master/develop, Pfade: tests/esp32/**, mqtt/**, services/** |
| MQTT Service | ✓ | Mosquitto als Service-Container |
| pytest Pfad | ✓ | `tests/esp32/` |
| Mocking | ✓ | Tests laufen gegen Server-seitigen ESP32-Mock-Code |
| -x Flag | ✓ | Stop on first failure |

**CI-Ergebnis:** STABIL GRUEN (5/5 PASS). Letzte Ausfuehrung: 2026-02-07.

### B.4 wokwi-tests.yml (DETAILANALYSE)

**Struktur:** 17 Jobs (1 Build + 15 Test-Jobs + 1 Summary)

| Check | Status | Details |
|-------|--------|---------|
| Build Job | ✓ | Baut `wokwi_simulation` Environment |
| Artifact Upload | ✓ | `wokwi-firmware` Artifact mit retention-days: 1 |
| WOKWI_CLI_TOKEN | ✓ | Korrekt als Secret referenziert |
| Nightly Cron | **FAIL** | `0 3 * * *` konfiguriert, aber NULL Schedule-Runs in letzten 10 Runs |
| Timeout pro Szenario | ✓ | 90-180s je nach Komplexitaet |

**Szenario-Inventar (KRITISCH):**

| Kategorie | Auf Disk | In Pipeline | Luecke |
|-----------|----------|-------------|--------|
| 01-boot | 2 | 2 | 0 |
| 02-sensor | 5 | 5 | 0 |
| 03-actuator | 7 | 7 | 0 |
| 04-zone | 2 | 2 | 0 |
| 05-emergency | 3 | 3 | 0 |
| 06-config | 2 | 2 | 0 |
| 07-combined | 2 | 2 | 0 |
| 08-i2c | 20 | 5 | **15** |
| 08-onewire | 29 | 0 | **29** |
| 09-hardware | 9 | 0 | **9** |
| 09-pwm | 18 | 3 | **15** |
| 10-nvs | 40 | 5 | **35** |
| 11-error-injection | 10 | 10 | 0 |
| gpio | 24 | 5 | **19** |
| Legacy (mqtt_connection) | 1 | 1 | 0 |
| **GESAMT** | **173** | **52** | **121** |

**Pipeline Header sagt 52 Szenarien** — das stimmt mit den tatsaechlich referenzierten ueberein. ✓
**Test Summary sagt "34 Total"** — das ist VERALTET (Zeile 1677). Vor Phase 1 hinzugefuegt, nicht aktualisiert nach Addition der Core-Tests und Error-Injection. Sollte 52 sein.

**Nightly Cron laeuft NICHT:**
- Letzte 10 Runs: nur `push` und `pull_request` Events, kein `schedule`
- Ursache: Schedule-Trigger funktioniert nur auf dem Default-Branch (`master`). Wenn die aktuellste Version der Workflow-Datei nur auf Feature-Branches existiert, wird der Cron nicht ausgefuehrt.

**Alle 52 referenzierten Szenario-Dateien existieren auf Disk.** ✓

### B.5 backend-e2e-tests.yml

| Check | Status | Details |
|-------|--------|---------|
| Trigger korrekt | ✓ | Push/PR auf main/master/develop, Pfade: El Servador/**, docker-compose*.yml |
| Docker Compose | ✓ | 3-Layer: base + ci.yml + e2e.yml |
| Health-Check | ✓ | Wartet auf /api/v1/health/live (max 30 * 2s = 60s) |
| --e2e Flag | ✓ | `poetry run pytest tests/e2e/ --e2e` |
| Cleanup | ✓ | `docker compose down -v --remove-orphans` |
| docker-compose.ci.yml existiert | ✓ | Vorhanden auf Disk |
| docker-compose.e2e.yml existiert | ✓ | Vorhanden auf Disk |

**CI-Ergebnis:** NULL Runs. Gleiche Trigger-Problematik wie frontend-tests. Zusaetzlich: Diese Pipeline braucht Docker-Compose-Builds und ist daher langsam (~5-10min). Wurde wahrscheinlich nie auf master getriggert.

### B.6 playwright-tests.yml

| Check | Status | Details |
|-------|--------|---------|
| Trigger | ✓ | Push/PR auf main/master/develop, Pfade: El Frontend/**, El Servador/** |
| Stack | ✓ | docker compose mit e2e.yml |
| Browser-Install | ✓ | `npx playwright install chromium --with-deps` |
| Stack-Verify | ✓ | Prueft Server + Frontend + MQTT Health |

**CI-Ergebnis:** NULL Runs. JEMALS erfolgreich ausgefuehrt: **NEIN**. Gleiche Trigger-Problematik.

### B.7 pr-checks.yml

| Check | Status | Details |
|-------|--------|---------|
| Trigger | ✓ | pull_request: opened, synchronize, reopened |
| Label PR | ✓ | actions/labeler@v5 mit .github/labeler.yml |
| File Size Check | ✓ | >5MB Warning (findet: mosquitto-installer.exe) |
| Sensitive File Check | **FAIL** | Findet .env.ci und scheitert |

**Fehlerursache:** `.env.ci` ist committed (nicht in .gitignore) und wird vom Pattern `.env.*` als sensitiv erkannt → `exit 1` → Pipeline FAIL.

**Nebeneffekt:** Das `label-pr` Job hat separate Permissions (`pull-requests: write`) und laeuft unabhaengig. Nur `pr-validation` ist rot.

### B.8 security-scan.yml

| Check | Status | Details |
|-------|--------|---------|
| Trigger | ✓ | Push auf master/main (Dockerfiles/Dependencies), Schedule Mo 06:00 UTC |
| Trivy Server | ✓ | `aquasecurity/trivy-action@0.28.0` mit CRITICAL,HIGH |
| Trivy Frontend | ✓ | Scannt development Target |
| Trivy Config | ✓ | Config-Scan mit exit-code: 0 (warn only) |

**CI-Ergebnis:** NULL Runs.
- Push-Trigger: Nur auf master/main fuer Dockerfiles/package.json/poetry.lock — passiert selten direkt
- Schedule: Mo 06:00 UTC — muesste laufen wenn Workflow auf master existiert
- Vermutung: Workflow wurde nach letztem master-Push hinzugefuegt, Schedule greift erst wenn Workflow auf Default-Branch liegt

---

## Phase C: Lokale Test-Ergebnisse

### C.1 Backend Unit-Tests

```
Ausfuehrung: python -m pytest tests/unit/ -v --tb=short
(mit Ignore der 3 broken Module)

Ergebnis: 709 passed, 5 failed, 3 skipped, 3 collection errors
Dauer: 42.18s

COLLECTION ERRORS (3):
- tests/unit/test_diagnostics_handler.py → ModuleNotFoundError: psutil
- tests/unit/test_pwm_validation.py → ModuleNotFoundError: psutil
- tests/unit/test_sequence_executor.py → ModuleNotFoundError: psutil
  (psutil IS in pyproject.toml, aber nicht in lokaler Python-Installation)

FAILURES (5):
- test_sensor_type_registry::TestI2CAddressRangeValidation::test_i2c_negative_address_rejected
- test_sensor_type_registry::TestI2CAddressRangeValidation::test_i2c_out_of_7bit_range_rejected
- test_sensor_type_registry::TestI2CAddressRangeValidation::test_i2c_reserved_low_address_rejected
- test_sensor_type_registry::TestI2CAddressRangeValidation::test_i2c_reserved_high_address_rejected
- test_sensor_type_registry::TestI2CAddressRangeValidation::test_i2c_valid_address_accepted
  (Alle 5 in gleicher Klasse - I2C Adress-Validierung)

SKIPPED (3):
- test_sensor_repo_i2c: Unique constraint (DB-Integration)
- test_mqtt_auth_service x2: Unix permissions (Windows)

WARNINGS (11):
- 5x PydanticDeprecatedSince20 (class-based config)
- 1x RuntimeWarning (coroutine not awaited)
- 2x DeprecationWarning (datetime.utcnow())
- 3x weitere
```

### C.2 Frontend Unit-Tests

```
Ausfuehrung: npm run test (= vitest run)

Ergebnis: 1378 passed, 0 failed
Test Files: 43 passed (43)
Dauer: 51.35s

ALLE GRUEN. Keine Failures, keine Errors.
Vue-Warnings (nicht-kritisch): onUnmounted outside setup() in useZoomNavigation Tests.
```

### C.3 ESP32 Native Tests

```
Ausfuehrung: pio test -e native

Ergebnis: 22 passed, 0 failed
Dauer: 24.30s

Suites:
- test_infra (topic_builder): 12 PASSED
- test_managers (gpio_manager_mock): 10 PASSED

ALLE GRUEN.
```

### C.4 Wokwi Build-Check

```
Ausfuehrung: pio run -e wokwi_simulation

Ergebnis: SUCCESS
Dauer: 40.12s

RAM:   22.4% (73,292 / 327,680 bytes)
Flash: 90.4% (1,184,865 / 1,310,720 bytes)

WARNUNG: Flash bei 90.4% — wird bei weiteren Features eng!
Keine Build-Warnungen.
```

### C.5 Ruff + Black

```
Ruff:  NICHT INSTALLIERT (No module named 'ruff')
Black: NICHT INSTALLIERT (No module named 'black')

Beide sind in pyproject.toml als dev-Dependency definiert aber nicht in der
lokalen Python-Umgebung installiert. Poetry-venv wird lokal nicht verwendet.
```

### C.6 TypeScript Type-Check

```
Ausfuehrung: npx vue-tsc --noEmit

Ergebnis: 1 Error (9 Zeilen Output)

Fehler in: src/views/SensorHistoryView.vue (Zeile 274)
  TS2322: Tooltip callback type incompatible
  Type 'number | null' is not assignable to type 'number'
  (Chart.js TooltipItem.parsed.x kann null sein)
```

---

## Phase D: Lueckenanalyse & Massnahmenplan

### D.1 Pipeline-Status-Matrix

| Pipeline | Letzter Run | Ergebnis | Trigger funktioniert | Tests aktuell |
|----------|-------------|----------|---------------------|---------------|
| server-tests | 2026-02-07 | FAIL | JA (nur auf altem Branch) | NEIN (Import-Fehler) |
| frontend-tests | NIE | N/A | NEIN (nie getriggert) | UNBEKANNT |
| esp32-tests | 2026-02-07 | PASS | JA (nur auf altem Branch) | JA |
| wokwi-tests | 2026-02-15 | PASS | JA (push/PR) | JA |
| backend-e2e-tests | NIE | N/A | NEIN (nie getriggert) | UNBEKANNT |
| playwright-tests | NIE | N/A | NEIN (nie getriggert) | UNBEKANNT |
| pr-checks | 2026-02-15 | FAIL | JA | NEIN (.env.ci Blocker) |
| security-scan | NIE | N/A | NEIN (nie getriggert) | UNBEKANNT |

### D.2 Test-Coverage-Matrix

| Schicht | Unit Tests | Integration | E2E | Wokwi/SIL | CI-integriert |
|---------|-----------|-------------|-----|-----------|---------------|
| Backend | 709/717 pass (3 collect-err, 5 fail) | Nicht lokal getestet | Nicht lokal getestet | — | JA (aber ROT) |
| Frontend | 1378/1378 pass | — | Playwright vorhanden, nie getestet | — | NEIN (nie gelaufen) |
| Firmware | 22/22 pass (native) | — | — | 52/173 in Pipeline | JA (GRUEN) |

### D.3 Identifizierte Luecken

#### LUECKE 1: .env.ci blockiert alle PRs (BLOCKER)

- **Problem:** `.env.ci` ist committed, PR-Checks erkennen es als sensitive Datei → exit 1
- **Schwere:** BLOCKER — jeder PR scheitert bei pr-checks
- **Fix:** `.env.ci` zu `.gitignore` hinzufuegen ODER Pattern im pr-checks.yml anpassen (`.env.ci` ausschliessen da es CI-Config ist, keine echten Secrets)
- **Aufwand:** 5 Minuten

#### LUECKE 2: Backend Unit-Tests haben Import-Fehler (BLOCKER)

- **Problem:** 3 Test-Module koennen nicht importiert werden wegen `psutil` ModuleNotFoundError, obwohl psutil in pyproject.toml steht
- **Schwere:** BLOCKER — Tests koennen nicht vollstaendig laufen
- **Fix:** Lokal: `pip install psutil` oder Poetry-venv nutzen. CI: Pruefen ob `poetry install` psutil korrekt installiert (vermutlich ja, da CI auch scheitert)
- **Aufwand:** 15 Minuten (Diagnose) + Fix

#### LUECKE 3: Keine Required Status Checks auf master (BLOCKER)

- **Problem:** Branch Protection hat KEINE required status checks. PRs koennen trotz roter Checks gemergt werden.
- **Schwere:** BLOCKER — Qualitaetskontrolle nicht erzwungen
- **Fix:** `gh api repos/Auto-one-Family/Automation-One/branches/master/protection` updaten mit required status checks (mindestens: wokwi-tests, esp32-tests)
- **Aufwand:** 10 Minuten

#### LUECKE 4: 4 Pipelines haben NULL Runs (BLOCKER)

- **Problem:** frontend-tests, backend-e2e-tests, playwright-tests, security-scan wurden NIE ausgefuehrt
- **Schwere:** BLOCKER — Pipelines existieren nur auf Papier
- **Ursache:** Branch-Filter `branches: [main, master, develop]` + Path-Filter + kein direkter Push auf master = Trigger-Bedingungen nie erfuellt. Workflow-Dateien moeglicherweise erst nach den relevanten PRs zum master gemergt.
- **Fix:** Manuell via `workflow_dispatch` triggern zum Testen. Dann Trigger-Strategie ueberdenken (siehe D.5).
- **Aufwand:** 30 Minuten (Trigger + Debug)

#### LUECKE 5: Wokwi Nightly Cron laeuft nicht (WICHTIG)

- **Problem:** `schedule: cron: '0 3 * * *'` ist konfiguriert aber es gibt NULL Schedule-Runs
- **Schwere:** WICHTIG — Naechtliche Regression-Tests fehlen
- **Ursache:** Schedule-Trigger funktioniert NUR wenn Workflow auf dem Default-Branch (master) liegt. Wenn wokwi-tests.yml seit dem letzten master-Merge aktualisiert wurde, greift der alte Cron oder gar keiner.
- **Fix:** Sicherstellen dass der aktuelle wokwi-tests.yml auf master liegt (naechster PR-Merge)
- **Aufwand:** Via naechsten PR automatisch geloest

#### LUECKE 6: 121 Wokwi-Szenarien nicht in Pipeline (WICHTIG)

- **Problem:** 173 Szenarien auf Disk, nur 52 in der Pipeline. Besonders: 08-onewire (29), 10-nvs (35), gpio (19), 08-i2c (15), 09-pwm (15), 09-hardware (9) fehlen groesstenteils.
- **Schwere:** WICHTIG — 70% der Szenarien werden nie im CI getestet
- **Fix:** Neue Jobs zum wokwi-tests.yml hinzufuegen (z.B. `onewire-core-tests`, `hardware-validation-tests`, erweiterte nvs/i2c/gpio/pwm Jobs)
- **Aufwand:** 2-4 Stunden (aber nicht Blocker fuer Phase 2)

#### LUECKE 7: Wokwi Test Summary Zaehler veraltet (WICHTIG)

- **Problem:** Zeile 1677: `"| **Total** | **34** | **100%** |"` — muesste 52 sein nach Phase 1 Additions
- **Schwere:** WICHTIG — Falsche Dokumentation
- **Fix:** Zeile 1677 in wokwi-tests.yml updaten
- **Aufwand:** 2 Minuten

#### LUECKE 8: 5 Backend-Tests scheitern (I2C Adress-Validierung) (WICHTIG)

- **Problem:** TestI2CAddressRangeValidation — alle 5 Tests FAIL
- **Schwere:** WICHTIG — Implementierung matcht nicht die Test-Erwartungen
- **Fix:** Entweder Tests oder Implementierung in SensorTypeRegistry anpassen
- **Aufwand:** 30-60 Minuten

#### LUECKE 9: TypeScript-Fehler in SensorHistoryView.vue (NICE-TO-HAVE)

- **Problem:** Chart.js TooltipItem.parsed.x kann null sein, Callback erwartet number
- **Schwere:** NICE-TO-HAVE — Build funktioniert trotzdem, nur vue-tsc --noEmit scheitert
- **Fix:** Tooltip-Callback Typen anpassen (null-Check hinzufuegen)
- **Aufwand:** 5 Minuten

#### LUECKE 10: Flash-Nutzung bei 90.4% (NICE-TO-HAVE)

- **Problem:** Firmware nutzt 90.4% des Flash-Speichers
- **Schwere:** NICE-TO-HAVE — Funktioniert, aber wenig Headroom fuer neue Features
- **Fix:** Code-Optimierung, Logging reduzieren, oder ESP32 mit mehr Flash verwenden
- **Aufwand:** Laufend

#### LUECKE 11: mosquitto-installer.exe im Repository (NICE-TO-HAVE)

- **Problem:** >5MB Binary im Repository. PR-Checks warnen davor.
- **Schwere:** NICE-TO-HAVE — Macht Repo groesser
- **Fix:** Datei entfernen, stattdessen Installationsanleitung verlinken
- **Aufwand:** 5 Minuten

### D.4 Priorisierter Massnahmenplan

```
BLOCKER (muss VOR Phase 2 gefixt werden):
1. .env.ci Handling fixen → .gitignore oder PR-Checks Pattern anpassen
2. Backend psutil Import-Error loesen → Poetry-venv oder pip install
3. Required Status Checks auf master aktivieren → mindestens esp32-tests + wokwi-tests
4. Mindestens 1x jeden Workflow manuell triggern (workflow_dispatch) um zu verifizieren dass er funktioniert

WICHTIG (sollte vor erstem Testlauf gefixt werden):
5. Wokwi Test Summary Zaehler auf 52 aktualisieren
6. 5 fehlschlagende I2C-Adress-Validierungs-Tests fixen
7. Sicherstellen dass wokwi-tests.yml auf master liegt fuer Nightly Cron
8. Wokwi Pipeline um fehlende Szenarien erweitern (schrittweise: erst onewire, dann nvs, i2c, pwm)

NICE-TO-HAVE (iterativ nachziehen):
9.  TypeScript-Fehler in SensorHistoryView.vue fixen
10. mosquitto-installer.exe aus dem Repo entfernen
11. Flash-Nutzung monitoren / optimieren
12. Verwaiste Branches aufraeumen (5-6 Branches loeschen)
13. Ruff + Black lokal installieren / Dev-Setup-Docs erstellen
14. PydanticDeprecatedSince20 Warnings beheben (class-based config → ConfigDict)
```

### D.5 Empfehlung: Sinnvolle CI/CD-Konfiguration

#### Bei JEDEM Push/PR (schnell, <5min):

| Pipeline | Aenderung |
|----------|-----------|
| pr-checks | .env.ci-Fix, dann wie gehabt |
| esp32-tests | Wie gehabt (stabil, ~1.5min) |
| server-tests (Lint Only) | Nur Ruff+Black, KEIN pytest (fuer Speed) |
| frontend-tests (Type-Check Only) | Nur vue-tsc, KEIN vitest (fuer Speed) |

#### Bei JEDEM PR (mittel, 5-15min):

| Pipeline | Aenderung |
|----------|-----------|
| server-tests (Full) | Unit + Integration Tests |
| frontend-tests (Full) | TypeScript + Vitest + Build |
| wokwi-tests (Subset) | Nur Boot + Sensor + MQTT + Error-Injection (Kernszenarien) |

#### Nightly (langsam, vollstaendig):

| Pipeline | Aenderung |
|----------|-----------|
| wokwi-tests (Full Suite) | Alle 52+ Szenarien (spaeter 173) |
| backend-e2e-tests | Docker-Stack + E2E |
| security-scan | Trivy Container + Config Scan |

#### Manual Dispatch (Stack-abhaengig):

| Pipeline | Grund |
|----------|-------|
| playwright-tests | Braucht laufenden Frontend+Backend Stack, zu langsam fuer automatisch |

#### Fehlende Pipeline:

- **Phase-0 Metriken-Validierung:** Neue Pipeline die Error-Code-Konsistenz prueft (ESP32 error_codes.h ↔ Server error_codes.py ↔ Frontend errorCodeTranslator.ts). Einfacher Python/Node-Script der die Codes abgleicht. Sollte bei JEDEM PR laufen.

#### Branch-Protection-Rules:

```
Required Status Checks auf master:
- esp32-tests / ESP32 Mock Tests
- pr-checks / Validate PR (nach .env.ci-Fix)
- wokwi-tests / build-firmware (minimal: Firmware kompiliert)

Optional aber empfohlen:
- server-tests / Unit Tests (nach psutil-Fix)
- frontend-tests / TypeScript Check (nach vue-tsc-Fix)
```

---

## Anhang: Rohdaten

### Wokwi Szenario-Inventar (173 Dateien, 14 Verzeichnisse)

| Verzeichnis | Anzahl | In Pipeline |
|-------------|--------|-------------|
| 01-boot | 2 | 2/2 (100%) |
| 02-sensor | 5 | 5/5 (100%) |
| 03-actuator | 7 | 7/7 (100%) |
| 04-zone | 2 | 2/2 (100%) |
| 05-emergency | 3 | 3/3 (100%) |
| 06-config | 2 | 2/2 (100%) |
| 07-combined | 2 | 2/2 (100%) |
| 08-i2c | 20 | 5/20 (25%) |
| 08-onewire | 29 | 0/29 (0%) |
| 09-hardware | 9 | 0/9 (0%) |
| 09-pwm | 18 | 3/18 (17%) |
| 10-nvs | 40 | 5/40 (13%) |
| 11-error-injection | 10 | 10/10 (100%) |
| gpio | 24 | 5/24 (21%) |
| Legacy (root) | 1 | 1/1 (100%) |

### Branch-Protection (master) — Vollstaendige Konfiguration

```json
{
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "require_last_push_approval": false,
    "required_approving_review_count": 1
  },
  "required_signatures": { "enabled": false },
  "enforce_admins": { "enabled": false },
  "required_linear_history": { "enabled": false },
  "allow_force_pushes": { "enabled": false },
  "allow_deletions": { "enabled": false },
  "required_conversation_resolution": { "enabled": false }
}
```

### GitHub Secrets

```
WOKWI_CLI_TOKEN  Erstellt: 2026-01-05
(keine weiteren Secrets)
```
