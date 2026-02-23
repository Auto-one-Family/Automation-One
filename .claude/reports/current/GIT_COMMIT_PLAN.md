# Git Commit Plan

**Erstellt:** 2026-02-23T14:30
**Branch:** `feature/frontend-consolidation`
**Upstream:** Up to date with `origin/feature/frontend-consolidation`
**Ungepushte Commits:** 0 (vor diesem Plan)
**Aenderungen gesamt:** 76 modified (3 deleted), 19 untracked, 0 staged

---

## Commit 1: fix(security): upgrade dependencies to resolve CVEs

**Was:** Behebt 5 bekannte CVEs durch Dependency-Upgrades: FastAPI 0.109->0.115 (starlette DoS), python-multipart CVE-2026-24486, python-jose CVE-2024-33664 (JWE-Bomb), jaraco.context CVE-2026-23949, wheel CVE-2026-24049. Dockerfile auf slim-bookworm mit apt-get upgrade.

**Dateien:**
- `El Servador/Dockerfile` - Upgrade base image to slim-bookworm, add apt upgrade + CVE fixes
- `El Servador/god_kaiser_server/pyproject.toml` - Upgrade fastapi, python-multipart, python-jose
- `.trivyignore` - Remove suppressed CVEs (all resolved now)

**Befehle:**
```bash
git add "El Servador/Dockerfile" "El Servador/god_kaiser_server/pyproject.toml" .trivyignore
git commit -m "fix(security): upgrade dependencies to resolve 5 CVEs

Upgrade FastAPI to >=0.115.0 (fixes starlette DoS: CVE-2024-24762,
CVE-2024-47874), python-multipart >=0.0.22 (CVE-2026-24486),
python-jose >=3.3.1 (CVE-2024-33664 JWE-Bomb DoS).

Dockerfile: switch to slim-bookworm, add apt-get upgrade,
fix jaraco.context CVE-2026-23949 and wheel CVE-2026-24049.

Clean .trivyignore of now-resolved suppressions.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Commit 2: fix(ci): improve service health polling and startup resilience

**Was:** CI-Workflows brachen sporadisch ab weil docker compose --wait bei Container-Exit sofort fehlschlug ohne Logs. Jetzt separates Health-Polling mit Diagnostik-Output. Backend-E2E, Playwright, Server-Tests und Wokwi-Tests ueberarbeitet.

**Dateien:**
- `.github/workflows/backend-e2e-tests.yml` - Remove --wait, add granular health polling
- `.github/workflows/playwright-tests.yml` - Rework with proper health polling
- `.github/workflows/security-scan.yml` - Add new scan patterns
- `.github/workflows/server-tests.yml` - Structural improvements
- `.github/workflows/wokwi-tests.yml` - Major rework with improved job structure
- `docker-compose.ci.yml` - Add server healthcheck, volumes reset, postgres command
- `docker-compose.e2e.yml` - Adjust healthcheck timing, volumes reset for CI
- `.github/mosquitto/mosquitto.conf` - Update usage comment

**Befehle:**
```bash
git add .github/workflows/backend-e2e-tests.yml .github/workflows/playwright-tests.yml \
  .github/workflows/security-scan.yml .github/workflows/server-tests.yml \
  .github/workflows/wokwi-tests.yml docker-compose.ci.yml docker-compose.e2e.yml \
  .github/mosquitto/mosquitto.conf
git commit -m "fix(ci): improve service health polling and startup resilience

Replace docker compose --wait with granular health polling per service
(PostgreSQL -> MQTT -> Server) with diagnostic output on failure.
Add server healthcheck to ci.yml, reset host volumes in CI/E2E to
avoid PermissionError on /app/logs. Increase E2E healthcheck retries
and start_period for CI timing reliability.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Commit 3: fix(server): add retry logic for DB init and graceful logging fallback

**Was:** Server-Startup schlug in CI/Docker fehl wenn PostgreSQL pg_isready meldet aber asyncpg noch nicht verbinden kann. init_db hat jetzt Retry mit Exponential Backoff. Logging faellt graceful auf stderr zurueck.

**Dateien:**
- `El Servador/god_kaiser_server/src/core/logging_config.py` - Graceful fallback to stderr
- `El Servador/god_kaiser_server/src/db/session.py` - Retry/backoff for init_db
- `El Servador/god_kaiser_server/tests/e2e/conftest.py` - Retry/backoff for MQTT connect

**Befehle:**
```bash
git add "El Servador/god_kaiser_server/src/core/logging_config.py" \
  "El Servador/god_kaiser_server/src/db/session.py" \
  "El Servador/god_kaiser_server/tests/e2e/conftest.py"
git commit -m "fix(server): add retry logic for DB init and graceful logging fallback

init_db retries up to 5 times with exponential backoff when asyncpg
cannot connect despite pg_isready (CI race condition). Logging falls
back to stderr when log directory is not writable (Docker volumes
reset in CI). E2E MQTT client retries with backoff for resilience.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Commit 4: feat(server): add board-specific GPIO reserved pins for ESP32-C3

**Was:** GPIO-Validierung war nur fuer ESP32-WROOM. Jetzt board-spezifische Reserved-Pins (C3: USB D+/D-). BoardConstraints um system_reserved_pins erweitert.

**Dateien:**
- `El Servador/god_kaiser_server/src/services/gpio_validation_service.py` - Board-specific pins
- `El Servador/god_kaiser_server/tests/unit/test_topic_validation.py` - Fix: pin 0 reserved, use 13

**Befehle:**
```bash
git add "El Servador/god_kaiser_server/src/services/gpio_validation_service.py" \
  "El Servador/god_kaiser_server/tests/unit/test_topic_validation.py"
git commit -m "feat(server): add board-specific GPIO reserved pins for ESP32-C3

Extend BoardConstraints with system_reserved_pins field.
WROOM: boot/flash/JTAG pins (0,1,2,3,5,6-11,12).
C3: USB pins (18,19). Validation uses board-specific set instead
of global constant. Fix test: GPIO 0 is reserved, use GPIO 13.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Commit 5: test(server): add safety and false-positive prevention tests

**Was:** Neue Tests: Notfall-Reaktionszeit (<100ms), idempotente Emergency-Clear, False-Positive-Prevention fuer normale Sensor-Schwankungen.

**Dateien:**
- `El Servador/god_kaiser_server/tests/integration/test_emergency_stop.py` - Reaction time + idempotency
- `El Servador/god_kaiser_server/tests/integration/test_sensor_anomalies.py` - False-positive prevention
- `El Servador/god_kaiser_server/tests/integration/conftest.py` - NEUE DATEI

**Befehle:**
```bash
git add "El Servador/god_kaiser_server/tests/integration/test_emergency_stop.py" \
  "El Servador/god_kaiser_server/tests/integration/test_sensor_anomalies.py" \
  "El Servador/god_kaiser_server/tests/integration/conftest.py"
git commit -m "test(server): add safety and false-positive prevention tests

Add emergency stop reaction time test (<100ms), idempotent clear
test (5x clear must not corrupt state), and false-positive prevention
ensuring normal sensor fluctuations are not flagged as anomalies.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Commit 6: feat(frontend): add dashboard widgets and consolidate views

**Was:** Altes DashboardView geloescht (ersetzt durch CustomDashboardView), useZoomNavigation entfernt, 4 neue Widgets, Maintenance-Types flattened.

**Dateien:**
- `El Frontend/src/views/DashboardView.vue` - GELOESCHT
- `El Frontend/src/composables/useZoomNavigation.ts` - GELOESCHT
- `El Frontend/tests/unit/composables/useZoomNavigation.test.ts` - GELOESCHT
- `El Frontend/src/views/CustomDashboardView.vue` - Updated
- `El Frontend/src/shared/stores/dashboard.store.ts` - Updated
- `El Frontend/src/shared/design/layout/Sidebar.vue` - Added entries
- `El Frontend/src/views/MaintenanceView.vue` - Updated types
- `El Frontend/src/api/debug.ts` - Flatten config interfaces
- `El Frontend/src/components/dashboard-widgets/` - 4 NEUE DATEIEN
- `El Frontend/tsconfig.tsbuildinfo` - Build artifact
- `El Frontend/tsconfig.node.tsbuildinfo` - Build artifact

**Befehle:**
```bash
git add "El Frontend/src/views/DashboardView.vue" \
  "El Frontend/src/composables/useZoomNavigation.ts" \
  "El Frontend/tests/unit/composables/useZoomNavigation.test.ts" \
  "El Frontend/src/views/CustomDashboardView.vue" \
  "El Frontend/src/shared/stores/dashboard.store.ts" \
  "El Frontend/src/shared/design/layout/Sidebar.vue" \
  "El Frontend/src/views/MaintenanceView.vue" \
  "El Frontend/src/api/debug.ts" \
  "El Frontend/src/components/dashboard-widgets/" \
  "El Frontend/tsconfig.tsbuildinfo" \
  "El Frontend/tsconfig.node.tsbuildinfo"
git commit -m "feat(frontend): add dashboard widgets and consolidate views

Remove legacy DashboardView (replaced by CustomDashboardView) and
unused useZoomNavigation composable. Add 4 dashboard widgets:
ActuatorRuntime, AlarmList, ESPHealth, HistoricalChart.
Flatten MaintenanceConfigResponse interface.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Commit 7: fix(firmware): fix LOG_E macro shadowing and wokwi-cli syntax

**Was:** LOG_E Macro shadowed TAG-Variable. Truncation-Log nutzte String-Konkatenation statt snprintf.

**Dateien:**
- `El Trabajante/src/utils/topic_builder.cpp` - Fix LOG_E param, use snprintf
- `El Trabajante/platformio.ini` - Fix wokwi-cli syntax in comments

**Befehle:**
```bash
git add "El Trabajante/src/utils/topic_builder.cpp" "El Trabajante/platformio.ini"
git commit -m "fix(firmware): fix LOG_E macro shadowing and wokwi-cli syntax

Rename LOG_E parameter from TAG to tag to avoid shadowing static
variable. Replace String concat in truncation error with snprintf.
Fix wokwi-cli usage comments (no run subcommand).

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Commit 8: refactor(firmware): replace Wokwi set-control with external MQTT injection

**Was:** 31 Wokwi-Szenarien nutzten nicht-existierendes set-control MQTT Feature. Ersetzt durch externe CI-Helper-Scripts.

**Dateien:**
- 31x `El Trabajante/tests/wokwi/scenarios/**/*.yaml` - Remove set-control
- 3x `El Trabajante/tests/wokwi/helpers/*.sh` - NEUE DATEIEN

**Befehle:**
```bash
git add "El Trabajante/tests/wokwi/scenarios/" "El Trabajante/tests/wokwi/helpers/"
git commit -m "refactor(firmware): replace Wokwi set-control with external MQTT injection

Remove unsupported set-control MQTT injection from 31 scenarios.
Add CI helper scripts: preflight_check, wait_for_mqtt,
emergency_cascade_stress. Net: -923 lines invalid YAML.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Commit 9: chore(build): add wokwi-count target and update .gitignore

**Dateien:**
- `Makefile` - Add wokwi-count target
- `.gitignore` - Add logs/wokwi/

**Befehle:**
```bash
git add Makefile .gitignore
git commit -m "chore(build): add wokwi-count target and update .gitignore

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Commit 10: docs: update CI pipeline, test references, and wokwi evaluation

**Dateien:**
- `.claude/reference/debugging/CI_PIPELINE.md` - v1.3 with all workflows
- `.claude/reference/infrastructure/DOCKER_REFERENCE.md` - Minor updates
- `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` - Minor updates
- `.claude/reference/testing/TEST_ENGINE_REFERENCE.md` - Major update
- `.claude/reference/testing/TEST_WORKFLOW.md` - Major update
- `.claude/skills/frontend-debug/SKILL.md` - Minor fix
- `.claude/skills/server-debug/SKILL.md` - Minor fix
- `docs/wokwi-self-hosted-evaluation.md` - Hobby -> Pro plan

**Befehle:**
```bash
git add .claude/reference/ .claude/skills/frontend-debug/SKILL.md \
  .claude/skills/server-debug/SKILL.md docs/wokwi-self-hosted-evaluation.md
git commit -m "docs: update CI pipeline, test references, and wokwi evaluation

CI_PIPELINE.md v1.3: all 6 workflows, 7-day retention, new
troubleshooting. TEST_ENGINE and TEST_WORKFLOW major updates.
Wokwi evaluation: Hobby -> Pro plan (2000 min/month).

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Commit 11: docs(reports): add analysis reports and testrun phase updates

**Dateien:**
- `.claude/reports/current/` - 6 neue Reports, 39 Screenshots, 4 Phase-Docs, Updates

**Befehle:**
```bash
git add .claude/reports/current/
git commit -m "docs(reports): add analysis reports and testrun phase updates

Add Wokwi, CI, NVS, gateway, firmware-limits, frontend-dev reports.
Update testrun phases. Add 39 frontend screenshots.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Abschluss

```bash
git status
git push origin feature/frontend-consolidation
```

| # | Commit | Dateien | Typ |
|---|--------|---------|-----|
| 1 | fix(security): upgrade dependencies to resolve 5 CVEs | 3 | fix |
| 2 | fix(ci): improve service health polling and startup resilience | 8 | fix |
| 3 | fix(server): add retry logic for DB init and graceful logging fallback | 3 | fix |
| 4 | feat(server): add board-specific GPIO reserved pins for ESP32-C3 | 2 | feat |
| 5 | test(server): add safety and false-positive prevention tests | 3 | test |
| 6 | feat(frontend): add dashboard widgets and consolidate views | 14 | feat |
| 7 | fix(firmware): fix LOG_E macro shadowing and wokwi-cli syntax | 2 | fix |
| 8 | refactor(firmware): replace Wokwi set-control with external MQTT injection | 34 | refactor |
| 9 | chore(build): add wokwi-count target and update .gitignore | 2 | chore |
| 10 | docs: update CI pipeline, test references, and wokwi evaluation | 8 | docs |
| 11 | docs(reports): add analysis reports and testrun phase updates | ~60 | docs |
