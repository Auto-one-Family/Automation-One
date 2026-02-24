# CI Fix Report — PR #14 (Session 2)

**Date:** 2026-02-24
**Branch:** fix/ci-pipelines
**Session:** auto-ops CI analysis & fix (round 2)

---

## Status Before This Session

| Check | Status |
|-------|--------|
| Backend E2E Tests | FAIL |
| E2E Tests (Playwright) | FAIL |
| Unit Tests (server-tests) | FAIL |
| Integration Tests (server-tests) | FAIL (15min timeout) |
| Build Check | PASS |
| ESP32 Unit Tests | PASS |
| Lint & Format Check | PASS |
| TypeScript Check | PASS |

---

## Root Cause Analysis

### 1. Unit Test Failures (2 tests)

**`test_c3_no_input_only_restriction_on_gpio_12`**
- `SYSTEM_RESERVED_PINS` in `gpio_validation_service.py` was a single board-agnostic set containing GPIO 12 (MTDI Strapping). Applied to all boards including ESP32-C3 where GPIO 12 is a normal bidirectional pin.

**`test_validate_gpio_wroom_valid`**
- `GPIO_RESERVED_ESP32_WROOM` in `constants.py` contained `{0,1,2,3,6,7,8,9,10,11,12}`. The `validate_gpio()` function in `validators.py` used this set, incorrectly rejecting GPIO 0 on WROOM (strapping pins are only sampled at boot, usable at runtime).

### 2. Integration Tests Timeout (15 minutes)

- Cause 1: Mosquitto healthcheck used `|| exit 0` — always reported healthy even if broker was not listening. Tests started before Mosquitto was ready. Some tests hung waiting for MQTT messages.
- Cause 2: No `--timeout` option in pytest, no `pytest-timeout` package installed.

### 3. Backend E2E + Playwright Server Crash (exit code 1) — Round 1

- `El Servador/Dockerfile` builder stage runs `poetry install` without `--no-root`.
- Poetry tried to install the project package itself, requiring `README.md` (declared via `readme = "README.md"` in `pyproject.toml`).
- The Dockerfile copies only `pyproject.toml` and `poetry.lock`, not `README.md`.
- Error: `The current project could not be installed: [Errno 2] No such file or directory: '/app/README.md'`

### 4. Backend E2E + Playwright Server Crash (exit code 1) — Round 2

- After the `--no-root` fix, the server container still crashed with a new error.
- `PermissionError: [Errno 13] Permission denied: '/app/logs/god_kaiser.log'`
- Root cause: `docker-compose.yml` (base) mounts `./logs/server:/app/logs` into `el-servador`. This host directory is created by the CI runner as root-owned. The container runs as `appuser` (UID 1000) and cannot write to the root-owned mount.
- The Dockerfile correctly creates `/app/logs` with `chown -R appuser:appuser /app`, but the Docker volume mount overwrites the directory ownership at container start.
- `docker-compose.ci.yml` and `docker-compose.e2e.yml` did not override the volumes section → the problematic mount was inherited from the base compose file.

---

## Changes Made

### `El Servador/god_kaiser_server/src/services/gpio_validation_service.py`

- Replaced single `SYSTEM_RESERVED_PINS` with two board-specific sets:
  - `SYSTEM_RESERVED_PINS_WROOM` = `{0,1,2,3,6,7,8,9,10,11,12}` (Boot-Strapping + UART + Flash + MTDI)
  - `SYSTEM_RESERVED_PINS_C3` = `{18,19}` (USB D+/D- only)
- `SYSTEM_RESERVED_PINS` kept as legacy alias pointing to WROOM set (backward compat for tests that check the constant directly).
- Added board-specific pin name dicts: `SYSTEM_PIN_NAMES_WROOM`, `SYSTEM_PIN_NAMES_C3`.
- Added `_get_system_reserved_pins(board_model)` method to `GpioValidationService`.
- Updated `validate_gpio_available()` to use board-specific reserved set via `_get_system_reserved_pins`.

### `El Servador/god_kaiser_server/src/core/constants.py`

- Changed `GPIO_RESERVED_ESP32_WROOM` from `{0,1,2,3,6,7,8,9,10,11,12}` to `{6,7,8,9,10,11}` (Flash SPI pins only).
- Fixes `validate_gpio()` in `validators.py`: GPIO 0 is no longer rejected (strapping pins are runtime-usable on WROOM).

### `El Servador/Dockerfile`

- Added `--no-root` flag to `poetry install` in builder stage.
- Prevents Poetry from trying to install the project package (which requires README.md not present in build context).

### `El Servador/god_kaiser_server/pyproject.toml`

- Added `pytest-timeout = "^2.3.1"` to dev dependencies.
- Enables `--timeout` CLI flag in pytest.

### `.github/workflows/server-tests.yml`

- Fixed Mosquitto healthcheck: removed `|| exit 0`, now uses `mosquitto_pub -h localhost -p 1883 -t healthcheck -m ok`.
- Increased health-retries from 5 to 10, interval reduced to 5s.
- Added `Install mosquitto clients` step (apt-get).
- Added `Wait for Mosquitto ready` polling step (30s loop) before pytest.
- Added `--timeout=60` to integration tests pytest command.

### `.github/workflows/esp32-tests.yml`

- Same Mosquitto healthcheck fix as server-tests.yml.

### `docker-compose.ci.yml`

- Added `volumes: !reset []` to `el-servador` service.
- Removes the inherited `./logs/server:/app/logs` mount from base docker-compose.yml.
- Removes the inherited `./El Servador/.../src:/app/src` live-reload mount (not needed in CI; code is baked into image).
- The container now uses its own `/app/logs` directory created and owned by `appuser` during Docker build.

### `docker-compose.e2e.yml`

- Same `volumes: !reset []` fix as docker-compose.ci.yml.

---

## Local Verification

```
Unit Tests: 775 passed, 3 skipped — all passing
Previously failing tests now pass:
  - test_c3_no_input_only_restriction_on_gpio_12: PASS
  - test_validate_gpio_wroom_valid: PASS
Previously passing tests still pass:
  - test_gpio_12_in_system_reserved_set: PASS (SYSTEM_RESERVED_PINS alias still has GPIO 12)
  - test_gpio_0_flash_boot_rejected: PASS (WROOM-specific reserved pins include GPIO 0)
```

---

## Actual CI Outcome (Verified 2026-02-24 ~15:20)

| Check | Status | Notes |
|-------|--------|-------|
| Unit Tests (server-tests) | PASS | GPIO board-awareness fix |
| Integration Tests (server-tests) | PASS | Mosquitto healthcheck + pytest-timeout |
| Backend E2E Tests | PASS | `--no-root` + `volumes: !reset []` |
| Playwright E2E Tests | PARTIAL FAIL | Infrastructure fixed; 11 pre-existing test failures remain |
| ESP32 Tests | PASS | Mosquitto healthcheck fix |
| Frontend Tests | PASS | No changes needed |
| Security Scan | FAIL | Pre-existing, out of scope |

---

## Open Points

### Playwright E2E — 11 Remaining Test Failures (Pre-existing)

The Playwright pipeline now starts the E2E stack successfully. However, 11 tests fail with logic-level errors that pre-existed the CI infrastructure failures (they were hidden behind the server crash):

**Failing tests:**
- `css/forms.spec.ts` — `labels have font-weight 500` (CSS assertion mismatch)
- `scenarios/auth.spec.ts` (2) — Login redirect fails: stays on `/login` instead of navigating to dashboard
- `scenarios/auth.spec.ts` (1) — auth persistence across reload
- `scenarios/device-discovery.spec.ts` (2) — WebSocket events not received in time
- `scenarios/emergency.spec.ts` (1) — multiple emergency events
- `scenarios/esp-registration-flow.spec.ts` (1) — UI flow
- `scenarios/sensor-live.spec.ts` (4) — MQTT sensor data not arriving at UI

**Root cause candidates:**
1. Auth: GlobalSetup creates admin via `/api/v1/auth/setup`. The test itself tries to login with `admin/Admin123#`. If the setup-endpoint sets a different password or the login form has a timing issue, the test fails.
2. Sensor/Discovery/Emergency: Tests depend on real-time MQTT→WS propagation within timeout windows. CI latency may cause timeouts.
3. CSS forms: `font-weight` CSS token mismatch (`.login-form__label` has wrong weight).

**Scope note:** These are functional test failures, NOT CI infrastructure failures. They were invisible before because the server always crashed before tests ran. Fix requires investigation of the Vue auth flow and MQTT→WebSocket propagation timing in CI.

### Other Open Points
- **Lint warnings**: Unused imports in `esp.py`, `errors.py`, `auth.py` show as annotations. These use `continue-on-error: true` and do not fail the pipeline. Not fixed to keep scope minimal.
- **Integration Tests — MQTT hang**: Root cause is likely a missing cleanup in a test fixture. The 60s per-test timeout prevents the 15-minute job timeout. Long-term fix: add proper teardown.
- **Security Scan**: Pre-existing CVE findings, out of scope for this session.
