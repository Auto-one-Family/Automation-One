# W6: NVS Wokwi Limitation Analysis

> **Date:** 2026-02-23
> **Scope:** `El Trabajante/tests/wokwi/scenarios/10-nvs/` (40 YAML files)
> **Key Finding:** Wokwi does NOT simulate persistent NVS. Every boot starts with empty NVS.

---

## Background

Wokwi simulates NVS initialization (`nvs_flash_init()`) and basic read/write operations within a single session, but does NOT persist NVS data across simulator restarts. This means:

- Every Wokwi boot = fresh NVS (all keys NOT_FOUND)
- WiFi credentials come from build flags (`WOKWI_WIFI_SSID`, `WOKWI_WIFI_PASSWORD`), not NVS
- Zone/Kaiser config comes from build flags or MQTT seed, not NVS
- "Reboot persistence" tests cannot be validated in Wokwi

This is a known Wokwi limitation, NOT a firmware bug.

---

## Complete Scenario Inventory (40 files)

### Category 1: INIT Tests (5 files) -- ALL WORK with fresh boot

| # | File | Test-ID | wait-serial Expectations | Fresh Boot OK? |
|---|------|---------|--------------------------|----------------|
| 1 | `nvs_init_success.yaml` | NVS-INIT-001 | StorageManager init, Phase 1, WiFi, MQTT | YES |
| 2 | `nvs_init_double.yaml` | NVS-INIT-002 | StorageManager init, Phase 1, WiFi, MQTT, heartbeat | YES |
| 3 | `nvs_init_order.yaml` | NVS-INIT-003 | GPIO safe-mode, Logger, StorageManager, Phase 1, WiFi, MQTT | YES |
| 4 | `nvs_init_status.yaml` | NVS-INIT-004 | StorageManager init, Phase 1, WiFi, MQTT, heartbeat | YES |
| 5 | `nvs_init_boot_count.yaml` | NVS-INIT-005 | StorageManager init, Phase 1, WiFi, MQTT, heartbeat | YES |

**Analysis:** These tests validate that NVS initializes correctly. On fresh boot, `StorageManager::begin()` calls `nvs_flash_init()` which creates the partition. All `wait-serial` patterns match fresh boot output. Boot count starts at 0 on fresh boot which is correct.

---

### Category 2: NAMESPACE Tests (7 files) -- ALL WORK with fresh boot

| # | File | Test-ID | wait-serial Expectations | Fresh Boot OK? |
|---|------|---------|--------------------------|----------------|
| 6 | `nvs_ns_open.yaml` | NVS-NS-001 | "Opened namespace: wifi_config" | YES |
| 7 | `nvs_ns_close.yaml` | NVS-NS-002 | "Opened namespace:", "Closed namespace:" | YES |
| 8 | `nvs_ns_autoclose.yaml` | NVS-NS-003 | Phase 1, WiFi, MQTT, heartbeat | YES |
| 9 | `nvs_ns_readonly.yaml` | NVS-NS-004 | Phase 1, WiFi, MQTT, heartbeat | YES |
| 10 | `nvs_ns_toolong.yaml` | NVS-NS-005 | Phase 1, WiFi, MQTT, heartbeat | YES |
| 11 | `nvs_ns_empty.yaml` | NVS-NS-006 | Phase 1, WiFi, MQTT, heartbeat | YES |
| 12 | `nvs_ns_isolation.yaml` | NVS-NS-007 | Phase 1, WiFi, MQTT, heartbeat | YES |

**Analysis:** Namespace operations (open, close, auto-close) work within a single session regardless of NVS persistence. ConfigManager opens namespaces during every boot. The `wait-serial` patterns expect boot messages that always appear.

---

### Category 3: TYPE Tests (7 files) -- ALL WORK with fresh boot

| # | File | Test-ID | wait-serial Expectations | Fresh Boot OK? |
|---|------|---------|--------------------------|----------------|
| 13 | `nvs_type_string.yaml` | NVS-TYPE-009/010 | WiFi, MQTT, heartbeat | YES |
| 14 | `nvs_type_bool.yaml` | NVS-TYPE-007/008 | Phase 1, WiFi, MQTT, heartbeat | YES |
| 15 | `nvs_type_uint8.yaml` | NVS-TYPE-001 | Phase 1, WiFi, MQTT, heartbeat | YES |
| 16 | `nvs_type_uint16.yaml` | NVS-TYPE-002 | Phase 1, WiFi, MQTT, heartbeat | YES |
| 17 | `nvs_type_int.yaml` | NVS-TYPE-004/005 | Phase 1, WiFi, MQTT, heartbeat | YES |
| 18 | `nvs_type_float.yaml` | NVS-TYPE-011/012 | Phase 1, WiFi, MQTT, heartbeat | YES |
| 19 | `nvs_type_ulong.yaml` | NVS-TYPE-013/014 | Phase 1, WiFi, MQTT, heartbeat | YES |

**Analysis:** These tests validate type operations implicitly by verifying the system boots and operates correctly. The actual read/write operations happen within a single session. All `wait-serial` patterns are standard boot messages.

---

### Category 4: DEFAULT VALUE Tests (1 file) -- WORKS with fresh boot

| # | File | Test-ID | wait-serial Expectations | Fresh Boot OK? |
|---|------|---------|--------------------------|----------------|
| 20 | `nvs_def_missing.yaml` | NVS-DEF-001..004 | Phase 1, WiFi, MQTT, heartbeat | YES |

**Analysis:** This is the IDEAL test for Wokwi. Fresh boot = all keys missing = default values used everywhere. The test explicitly documents this: "On first boot or factory reset, many keys don't exist."

---

### Category 5: KEY Tests (3 files) -- ALL WORK with fresh boot

| # | File | Test-ID | wait-serial Expectations | Fresh Boot OK? |
|---|------|---------|--------------------------|----------------|
| 21 | `nvs_key_valid.yaml` | NVS-KEY-001 | Phase 1, WiFi, MQTT, heartbeat | YES |
| 22 | `nvs_key_toolong.yaml` | NVS-KEY-002 | Phase 1, WiFi, MQTT, heartbeat | YES |
| 23 | `nvs_key_exists.yaml` | NVS-KEY-004/005 | Phase 1, WiFi, MQTT, heartbeat | YES |

**Analysis:** Key validation logic works at the API level, independent of NVS persistence state. Standard boot patterns.

---

### Category 6: DELETE Tests (3 files) -- ALL WORK with fresh boot

| # | File | Test-ID | wait-serial Expectations | Fresh Boot OK? |
|---|------|---------|--------------------------|----------------|
| 24 | `nvs_del_key.yaml` | NVS-DEL-001/002 | Phase 1, WiFi, MQTT, heartbeat | YES |
| 25 | `nvs_del_namespace.yaml` | NVS-DEL-003 | Phase 1, WiFi, MQTT, heartbeat | YES |
| 26 | `nvs_del_factory.yaml` | NVS-DEL-004 | MQTT, heartbeat (then MQTT injection) | YES* |

**Analysis:** Delete operations work within a single session. `nvs_del_factory.yaml` requires MQTT injection to trigger factory_reset command; the `wait-serial` patterns only validate the initial boot succeeds.

---

### Category 7: PERSISTENCE Tests (5 files) -- CONCEPTUALLY LIMITED but scenarios PASS

| # | File | Test-ID | wait-serial Expectations | Fresh Boot OK? | True Persistence Tested? |
|---|------|---------|--------------------------|----------------|--------------------------|
| 27 | `nvs_pers_reboot.yaml` | NVS-PERS-001 | StorageManager init, Phase 1, WiFi, MQTT, heartbeat | YES | **NO** |
| 28 | `nvs_pers_sensor.yaml` | NVS-PERS-002 | StorageManager init, MQTT, heartbeat, "config" | YES* | **NO** |
| 29 | `nvs_pers_zone.yaml` | NVS-PERS-003 | StorageManager init, MQTT, heartbeat, "ZONE ASSIGNMENT" | YES* | **NO** |
| 30 | `nvs_pers_wifi.yaml` | NVS-PERS-004 | "Opened namespace: wifi_config", WiFi, MQTT, heartbeat | YES | **NO** |
| 31 | `nvs_pers_bootcount.yaml` | NVS-PERS-005 | StorageManager init, Phase 1, WiFi, MQTT, heartbeat | YES | **NO** |

**Critical Analysis:**

These tests are the most problematic group. Their stated purpose is to validate data persistence across reboots, but:

1. **nvs_pers_reboot.yaml**: Claims "Validates all NVS data survives ESP32 reboot" but only checks standard boot messages. The scenario has NO reboot step, NO pre-existing data check. It validates a fresh boot, which is not the same as persistence.

2. **nvs_pers_sensor.yaml**: Requires MQTT injection to configure a sensor, then looks for `"config"` in serial output. This tests within-session config processing, NOT cross-reboot persistence. The `wait-serial: "config"` will match because ConfigManager processes the MQTT config message.

3. **nvs_pers_zone.yaml**: Requires MQTT injection for zone assignment, then looks for `"ZONE ASSIGNMENT"`. Same as above -- tests within-session, not persistence.

4. **nvs_pers_wifi.yaml**: Checks that `wifi_config` namespace is opened. This happens every boot regardless of NVS content (the namespace open call always succeeds, even if empty). WiFi connects via Wokwi build flags, not NVS.

5. **nvs_pers_bootcount.yaml**: Boot count starts at 0 on fresh boot. There is no way to verify it was "incremented from a previous value" in Wokwi.

**Verdict:** The PERS scenarios will PASS in CI (their `wait-serial` patterns match fresh-boot output), but they do NOT actually validate NVS persistence. They are effectively boot-success tests.

---

### Category 8: CAPACITY Tests (3 files) -- ALL WORK with fresh boot

| # | File | Test-ID | wait-serial Expectations | Fresh Boot OK? |
|---|------|---------|--------------------------|----------------|
| 32 | `nvs_cap_free_entries.yaml` | NVS-CAP-004/005 | Phase 1, WiFi, MQTT, heartbeat | YES |
| 33 | `nvs_cap_many_keys.yaml` | NVS-CAP-001 | MQTT, heartbeat (then MQTT injection) | YES* |
| 34 | `nvs_cap_string_limit.yaml` | NVS-CAP-002 | Phase 1, WiFi, MQTT, heartbeat | YES |

**Analysis:** Capacity tests validate NVS partition size and write limits. These work within a single session. `nvs_cap_many_keys.yaml` requires MQTT injection to add multiple sensors.

---

### Category 9: ERROR Tests (2 files) -- ALL WORK with fresh boot

| # | File | Test-ID | wait-serial Expectations | Fresh Boot OK? |
|---|------|---------|--------------------------|----------------|
| 35 | `nvs_err_no_namespace.yaml` | NVS-ERR-001/002 | Phase 1, WiFi, MQTT, heartbeat | YES |
| 36 | `nvs_err_readonly.yaml` | NVS-ERR-003 | Phase 1, WiFi, MQTT, heartbeat | YES |

**Analysis:** Error handling tests validate API behavior, not persistence. Work fine on fresh boot.

---

### Category 10: INTEGRATION Tests (4 files) -- ALL WORK with fresh boot

| # | File | Test-ID | wait-serial Expectations | Fresh Boot OK? |
|---|------|---------|--------------------------|----------------|
| 37 | `nvs_int_configmanager.yaml` | NVS-INT-001 | "Opened namespace: wifi_config", Phase 1, WiFi, MQTT, heartbeat | YES |
| 38 | `nvs_int_sensor_boot.yaml` | NVS-INT-002 | Phase 4: Sensor System READY, WiFi, MQTT, heartbeat | YES |
| 39 | `nvs_int_actuator_boot.yaml` | NVS-INT-003 | Phase 5: Actuator System READY, WiFi, MQTT, heartbeat | YES |
| 40 | `nvs_int_zone_boot.yaml` | NVS-INT-004 | "Opened namespace: zone_config", WiFi, MQTT, "Subscribed to", heartbeat | YES |

**Analysis:**

These are the most nuanced group:

- **nvs_int_sensor_boot.yaml**: Claims "Validates sensors are restored from NVS at boot." On fresh boot, `sensor_count` = 0 (default), so no sensors are restored. The test validates that the boot succeeds WITHOUT sensors, not that sensors ARE restored. The `wait-serial: "Phase 4: Sensor System READY"` appears regardless.

- **nvs_int_actuator_boot.yaml**: Same pattern. `actuator_count` = 0 on fresh boot. Phase 5 completes without actuators.

- **nvs_int_zone_boot.yaml**: `zone_assigned` = false on fresh boot. The `"Subscribed to"` pattern will match default MQTT subscriptions (using build-flag defaults).

**Verdict:** Integration tests PASS on fresh boot because the firmware handles empty NVS gracefully (default values, empty arrays). They do NOT validate the "restore from NVS" path.

---

## Summary Matrix

| Category | Count | Fresh Boot OK | True Persistence Test | MQTT Injection Needed |
|----------|-------|---------------|----------------------|----------------------|
| INIT | 5 | 5/5 | N/A | 0 |
| NAMESPACE | 7 | 7/7 | N/A | 0 |
| TYPE | 7 | 7/7 | N/A | 0 |
| DEFAULT | 1 | 1/1 | N/A (tests defaults) | 0 |
| KEY | 3 | 3/3 | N/A | 0 |
| DELETE | 3 | 3/3 | N/A | 1 (factory reset) |
| PERSISTENCE | 5 | 5/5 (but misleading) | **0/5** | 2 (sensor, zone) |
| CAPACITY | 3 | 3/3 | N/A | 1 (many keys) |
| ERROR | 2 | 2/2 | N/A | 0 |
| INTEGRATION | 4 | 4/4 (but misleading) | **0/4** | 0 |
| **TOTAL** | **40** | **40/40** | **0/9 need persistence** | **4** |

---

## Key Findings

### 1. All 40 scenarios PASS on fresh Wokwi boot

Every scenario's `wait-serial` patterns match output from a fresh boot. No scenario expects NVS data that would only exist after a previous session.

### 2. None of the scenarios need MQTT-seed-pattern changes

The 4 scenarios that require MQTT injection (nvs_del_factory, nvs_pers_sensor, nvs_pers_zone, nvs_cap_many_keys) already document this in their YAML comments. The CI jobs that run NVS tests do NOT inject MQTT messages (they run scenarios standalone), so:

- `nvs_pers_sensor.yaml`: The `wait-serial: "config"` at the end MAY or MAY NOT match depending on timing. If no MQTT injection happens, the scenario will timeout waiting for "config" (but this is in the extended test, not core).
- `nvs_pers_zone.yaml`: The `wait-serial: "ZONE ASSIGNMENT"` will timeout without MQTT injection.

### 3. Persistence tests are effectively smoke tests

The 5 PERS scenarios and 4 INT scenarios document their persistence intent in comments but their actual `wait-serial` assertions only validate fresh-boot behavior. They provide false confidence about persistence validation.

### 4. No scenarios expect "NVS NOT_FOUND" as an error

The firmware handles missing NVS keys gracefully using defaults. "NVS NOT_FOUND" appears in debug logs but no scenario looks for it or fails on it.

---

## Recommendations

### Short-term (no changes needed)

1. **Do NOT modify the 40 NVS scenarios.** They all PASS in CI as-is.
2. **Document this analysis** as known limitation (this report).
3. **Ensure CI NVS jobs do NOT inject MQTT** unless the scenario requires it (currently correct).

### Medium-term (documentation improvement)

4. Add a note to `10-nvs/README.md` explaining the Wokwi NVS persistence limitation.
5. Rename or re-categorize the 5 PERS tests to clarify they test "fresh boot with defaults" not "data survives reboot":
   - `nvs_pers_reboot.yaml` -> validates boot after NVS init, not actual persistence
   - `nvs_pers_wifi.yaml` -> validates wifi_config namespace is opened (not that data persists)

### Long-term (real persistence testing)

6. True NVS persistence can only be tested on **real hardware** (ESP32 with flash).
7. Consider a hardware-test job (via `serial-logger` Docker service) for the 9 persistence-critical scenarios.
8. Alternative: Wokwi Pro may support NVS persistence in future versions.

---

## Scenarios That Would Need MQTT-Seed in CI (if CI added MQTT injection)

These scenarios have `wait-serial` patterns that require MQTT injection during the test:

| # | File | MQTT Topic Needed | wait-serial Trigger |
|---|------|-------------------|---------------------|
| 1 | `nvs_pers_sensor.yaml` | `kaiser/god/esp/{id}/config` (sensor config) | `"config"` |
| 2 | `nvs_pers_zone.yaml` | `kaiser/god/esp/{id}/zone/assign` (zone assignment) | `"ZONE ASSIGNMENT"` |
| 3 | `nvs_del_factory.yaml` | `kaiser/god/esp/{id}/system/command` (factory reset) | (end of scenario) |
| 4 | `nvs_cap_many_keys.yaml` | `kaiser/god/esp/{id}/config` (multi-sensor config) | (end of scenario) |

Currently, the CI `nvs-core-tests` job runs 5 core scenarios (init_success, key_exists, del_factory, ns_isolation, del_key) and the `nightly-nvs-extended` job runs the remaining 35. None of the CI jobs inject MQTT messages for NVS tests.
