# W5: CI Serial-Log-Capture Analysis

> **Date:** 2026-02-23
> **File:** `.github/workflows/wokwi-tests.yml`
> **Purpose:** Identify which CI jobs have serial log capture and artifact upload, which do not

---

## Summary

**22 total jobs** in wokwi-tests.yml (16 core PR + 6 nightly/extended + 1 build + 1 summary).
All test jobs already have `2>&1 | tee <name>.log` or `> <name>.log 2>&1` log capture patterns.
All test jobs already upload artifacts via `actions/upload-artifact@v4`.

The implementation is solid but has inconsistencies in naming and capture patterns.

---

## Job-by-Job Analysis

### Core PR Jobs (always run)

| # | Job ID | Log Capture | Pattern | Artifact Upload | Artifact Name |
|---|--------|-------------|---------|-----------------|---------------|
| 1 | `build-firmware` | N/A (build only) | N/A | Yes | `wokwi-firmware` |
| 2 | `boot-tests` | YES (2 tests) | `2>&1 \| tee <name>.log` | Yes | `boot-test-logs` |
| 3 | `sensor-tests` | YES (2 tests) | `2>&1 \| tee <name>.log` | Yes | `sensor-test-logs` |
| 4 | `mqtt-connection-test` | YES (1 test) | `2>&1 \| tee <name>.log` | Yes | `mqtt-test-logs` |
| 5 | `actuator-tests` | YES (4 tests) | `2>&1 \| tee <name>.log` | Yes | `actuator-test-logs` |
| 6 | `zone-tests` | YES (2 tests) | `2>&1 \| tee <name>.log` | Yes | `zone-test-logs` |
| 7 | `emergency-tests` | YES (2 tests) | `2>&1 \| tee <name>.log` | Yes | `emergency-test-logs` |
| 8 | `config-tests` | YES (2 tests) | `2>&1 \| tee <name>.log` | Yes | `config-test-logs` |
| 9 | `sensor-flow-tests` | YES (3 tests) | `2>&1 \| tee <name>.log` | Yes | `sensor-flow-test-logs` |
| 10 | `actuator-flow-tests` | YES (3 tests) | `2>&1 \| tee <name>.log` | Yes | `actuator-flow-test-logs` |
| 11 | `combined-flow-tests` | YES (3 tests) | `2>&1 \| tee <name>.log` | Yes | `combined-flow-test-logs` |
| 12 | `gpio-core-tests` | YES (5 tests) | `2>&1 \| tee <name>.log` | Yes | `gpio-test-logs` |
| 13 | `i2c-core-tests` | YES (5 tests) | `2>&1 \| tee <name>.log` | Yes | `i2c-test-logs` |
| 14 | `nvs-core-tests` | YES (5 tests) | `2>&1 \| tee <name>.log` | Yes | `nvs-test-logs` |
| 15 | `pwm-core-tests` | YES (3 tests) | `2>&1 \| tee <name>.log` | Yes | `pwm-test-logs` |
| 16 | `error-injection-tests` | YES (10 tests) | `> <name>.log 2>&1` | Yes | `error-injection-test-logs` |

### Nightly Extended Jobs (schedule/workflow_dispatch only)

| # | Job ID | Log Capture | Pattern | Artifact Upload | Artifact Name |
|---|--------|-------------|---------|-----------------|---------------|
| 17 | `nightly-i2c-extended` | YES (loop) | `2>&1 \| tee <name>.log` | Yes | `nightly-i2c-extended-logs` |
| 18 | `nightly-onewire-extended` | YES (loop) | `2>&1 \| tee <name>.log` | Yes | `nightly-onewire-logs` |
| 19 | `nightly-hardware-extended` | YES (loop) | `2>&1 \| tee <name>.log` | Yes | `nightly-hardware-logs` |
| 20 | `nightly-pwm-extended` | YES (loop) | `2>&1 \| tee <name>.log` | Yes | `nightly-pwm-extended-logs` |
| 21 | `nightly-nvs-extended` | YES (loop) | `2>&1 \| tee <name>.log` | Yes | `nightly-nvs-extended-logs` |
| 22 | `nightly-gpio-extended` | YES (loop) | `2>&1 \| tee <name>.log` | Yes | `nightly-gpio-extended-logs` |

### Summary Job

| # | Job ID | Log Capture | Artifact Upload |
|---|--------|-------------|-----------------|
| 23 | `test-summary` | Downloads all `*-test-logs` | N/A (generates `$GITHUB_STEP_SUMMARY`) |

---

## Inconsistencies Found

### 1. Capture Pattern Difference

**Core jobs (1-15)** use the `tee` pattern (stdout visible + file):
```bash
2>&1 | tee <name>.log || true
```

**Error-injection job (16)** uses redirect-only pattern (no stdout during run):
```bash
> <name>.log 2>&1
```
Then outputs with `cat error_<name>.log` after `wait`.

**Impact:** Low. Both approaches capture serial output. The `tee` pattern is preferable for CI debugging (live output visible in runner logs).

**Recommendation:** Standardize error-injection tests to use `2>&1 | tee` like other jobs. No urgency.

### 2. Artifact Path Patterns

Different jobs use different glob patterns for artifact upload:

| Job | Path Pattern |
|-----|-------------|
| `boot-tests` | `El Trabajante/*.log` (captures ALL logs) |
| `sensor-tests` | `El Trabajante/*.log` (captures ALL logs) |
| `mqtt-connection-test` | `El Trabajante/*.log` (captures ALL logs) |
| `actuator-tests` | `El Trabajante/actuator_*.log` (specific) |
| `zone-tests` | `El Trabajante/*_assignment.log` (specific) |
| `emergency-tests` | `El Trabajante/emergency_*.log` (specific) |
| `config-tests` | `El Trabajante/config_*.log` (specific) |
| `error-injection-tests` | `El Trabajante/error_*.log` (specific) |

**Issue:** `boot-tests`, `sensor-tests`, `mqtt-connection-test` use broad `*.log` pattern. This could cause artifact conflicts if multiple jobs upload the same file name, though GitHub Actions handles this via unique artifact names.

**Recommendation:** Standardize all jobs to use specific patterns (e.g., `boot_*.log`, `sensor_*.log`, `mqtt_*.log`) for clarity.

### 3. Nightly Logs May Not Match Artifact Patterns

**nightly-hardware-extended** uploads `El Trabajante/hw_*.log` but the loop creates `${name}.log` where `name` is `$(basename "$scenario" .yaml)`. Scenario filenames in `09-hardware/` may not all start with `hw_`.

**nightly-onewire-extended** uploads `El Trabajante/onewire_*.log`. Same concern: `08-onewire/` filenames must start with `onewire_`.

**Recommendation:** Verify scenario filenames match artifact upload patterns, or change to broader pattern `El Trabajante/*.log`.

### 4. Missing `|| true` on Background Jobs

Some tests that use background `&` + `wait $WOKWI_PID` do NOT have `|| true`:
```bash
wait $WOKWI_PID && echo "PASS" || echo "FAIL (exit $?)"
```
This is actually correct - the `|| echo "FAIL"` handles non-zero exits. No issue.

### 5. No Consolidated Log Summary Artifact

The `test-summary` job downloads all logs and generates a GitHub Step Summary, but does NOT re-upload a consolidated artifact. After `retention-days: 7`, all logs are gone.

**Recommendation:** Add a consolidated artifact upload in `test-summary` with longer retention for traceability.

---

## Action Items (Priority Order)

1. **LOW PRIORITY:** Standardize error-injection capture pattern to `2>&1 | tee` (cosmetic)
2. **LOW PRIORITY:** Standardize artifact path patterns to use specific prefixes (clarity)
3. **MEDIUM PRIORITY:** Verify nightly artifact globs match actual scenario filenames
4. **LOW PRIORITY:** Consider consolidated log artifact in `test-summary` with longer retention
5. **NO ACTION NEEDED:** All jobs already have log capture + artifact upload

---

## Conclusion

The CI pipeline is well-instrumented. Every test job captures serial output to a log file and uploads it as a named artifact. The main improvement opportunities are consistency standardization, not missing functionality. No jobs are missing log capture entirely.
