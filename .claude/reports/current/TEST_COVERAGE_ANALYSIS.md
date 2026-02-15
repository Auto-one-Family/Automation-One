# Test Coverage Analysis: PR feature/frontend-consolidation

**Date:** 2026-02-12
**Branch:** `feature/frontend-consolidation` vs `master`
**Scope:** 891 files changed, ~240k lines added, ~42k lines removed

---

## 1. Summary

This PR is a massive consolidation bringing together frontend components, a design system,
shared stores, backend MQTT handlers, HAL abstraction, and agent structure flattening.
The test investment is **substantial** (106+ test files across 4 test frameworks), and the
overall test quality is **good to strong** for the code paths that are covered. However,
there are several **critical gaps** in newly added production code that lacks test coverage.

**Overall Rating: 7/10** -- Strong testing for what exists, but notable gaps in new features.

---

## 2. Critical Gaps (Rating 8-10)

### GAP-1: `_mark_config_applied()` completely untested [Criticality: 9/10]

**File:** `El Servador/god_kaiser_server/src/mqtt/handlers/config_handler.py` (lines 273-330)

This new method marks pending sensor/actuator configs as "applied" after a successful ESP
config response. It runs within `handle_config_ack()` for `status="success"` and
`status="partial_success"`. The test file `tests/integration/test_config_handler.py` tests
`_process_config_failures()` but patches it away for success paths -- meaning the actual
DB update logic of `_mark_config_applied()` is never exercised.

**Why this matters:** If this method silently fails (e.g., wrong attribute name, SQL error),
sensor/actuator configurations will remain in "pending" status forever after successful
ESP deployment. This creates phantom "pending" state in the UI and prevents config
re-deployment workflows.

**Recommended tests:**
- Test that `_mark_config_applied()` updates `config_status` from "pending" to "applied"
- Test that it clears `config_error` and `config_error_detail`
- Test that it does NOT overwrite items already marked as "failed"
- Test that it handles empty sensor/actuator lists gracefully
- Test the commit is called only when `updated_count > 0`

---

### GAP-2: LWT retained message clearing in HeartbeatHandler untested [Criticality: 8/10]

**File:** `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` (lines 215-228)

New Step 5b clears stale retained LWT messages from the broker when an ESP reconnects.
This publishes an empty payload with `retain=True` to the LWT topic. The heartbeat handler
tests cover zone mismatch detection but **do not cover** this LWT clearing behavior.

**Why this matters:** If this fails silently (caught exception), new MQTT subscribers will
receive stale "offline" LWT messages for devices that are actually online. This causes
ghost offline indicators in the dashboard.

**Recommended tests:**
- Test that `MQTTClient.publish()` is called with the correct LWT topic and empty payload
- Test that `retain=True` is set on the publish call
- Test that failure to clear LWT is logged as warning but does not fail the heartbeat

---

### GAP-3: Shared stores `sensor.store.ts` and `actuator.store.ts` completely untested [Criticality: 8/10]

**Files:**
- `El Frontend/src/shared/stores/sensor.store.ts` (282 lines)
- `El Frontend/src/shared/stores/actuator.store.ts` (264 lines)

These stores contain complex business logic:
- **sensor.store.ts:** Hybrid multi-value sensor grouping (3 handlers: known multi-value,
  dynamic multi-value, single-value), quality aggregation via `getWorstQuality()`
- **actuator.store.ts:** Emergency stop handling (system-wide `espId="ALL"`), actuator
  status mapping (`state="on"/"off"/"pwm"` to boolean), sequence lifecycle toasts

No test files exist for either store. The `esp.test.ts` tests the parent store but
delegates to these shared stores, so the delegation glue may be tested but the actual
handler logic is not.

**Why this matters:**
- Multi-value sensor grouping bugs could show wrong values for SHT31 (temp+humidity) sensors
- Emergency stop with `espId="ALL"` not working would be a safety issue
- Actuator state mapping `"pwm" -> true` is a non-obvious business rule that must be tested

**Recommended tests for sensor.store.ts:**
- `getWorstQuality()` with all quality levels
- `handleSensorData()` with known multi-value type (SHT31)
- `handleSensorData()` with dynamic multi-value detection (two types on same GPIO)
- `handleSensorData()` with single-value sensor
- `handleSensorHealth()` marking sensor as stale

**Recommended tests for actuator.store.ts:**
- `handleActuatorAlert()` with `espId="ALL"` emergency stop
- `handleActuatorAlert()` with specific device + GPIO
- `handleActuatorStatus()` state mapping ("on"/"off"/"pwm")
- `handleActuatorResponse()` success vs failure toasts

---

### GAP-4: Zone cascade-delete of subzones in ZoneService untested [Criticality: 8/10]

**File:** `El Servador/god_kaiser_server/src/services/zone_service.py` (lines 237-244)

New logic cascade-deletes all subzones when a device's zone is removed, matching ESP32
NVS behavior. Uses `SubzoneRepository.delete_all_by_zone()`. No test covers this path.

**Why this matters:** If cascade-delete silently fails, orphaned subzone records accumulate
in the database. When the device is re-assigned to a zone, stale subzones from the previous
assignment may conflict or cause incorrect zone behavior.

**Recommended tests:**
- Test that `delete_all_by_zone()` is called with the old `zone_id`
- Test that it is NOT called when `old_zone_id` is None (device was never assigned)
- Test the deleted count is logged correctly

---

## 3. Important Improvements (Rating 5-7)

### IMP-1: `useConfigResponse` composable untested [Criticality: 7/10]

**File:** `El Frontend/src/composables/useConfigResponse.ts` (100 lines)

Handles WebSocket config_response events, routes to success/error handlers. No test exists.
The composable has a non-trivial message parsing pipeline with type assertions.

**Recommended tests:**
- Test message routing to onSuccess/onError handlers
- Test parsing of config_response with missing fields (graceful degradation)
- Test cleanup on unmount (unsubscribe called)

---

### IMP-2: `useKeyboardShortcuts` composable untested [Criticality: 6/10]

**File:** `El Frontend/src/composables/useKeyboardShortcuts.ts` (127 lines)

Singleton keyboard shortcut registry with scope awareness and input-focus suppression.
Contains non-trivial logic: modifier matching, scope activation/deactivation, input
element detection, first-match-wins priority.

**Recommended tests:**
- Test shortcut registration and unregistration
- Test scope activation/deactivation
- Test input-focused suppression for single-key shortcuts
- Test Ctrl/Meta combos fire regardless of focus
- Test first-match-wins behavior

---

### IMP-3: `useZoneDragDrop` composable untested [Criticality: 7/10]

**File:** `El Frontend/src/composables/useZoneDragDrop.ts`

Handles optimistic zone drag-drop with API calls, error rollback, and undo history.
Contains critical state management (optimistic updates, rollback on error).

**Recommended tests:**
- Test optimistic update applies immediately
- Test rollback on API failure
- Test undo/redo history
- Test zone grouping computation

---

### IMP-4: `parse_system_diagnostics_topic()` and `build_lwt_topic()` untested in TopicBuilder [Criticality: 6/10]

**File:** `El Servador/god_kaiser_server/tests/unit/test_topic_validation.py`

`build_system_diagnostics_topic()` IS tested (line 71), but the corresponding
`parse_system_diagnostics_topic()` parse method is NOT. Similarly, the new `build_lwt_topic()`
builder method has no test.

**Recommended tests:**
- Test `parse_system_diagnostics_topic()` with valid topic
- Test `parse_system_diagnostics_topic()` returns None for invalid topics
- Test `build_lwt_topic()` produces correct topic string

---

### IMP-5: `flag_modified()` usage in ZoneService not integration-tested [Criticality: 6/10]

**File:** `El Servador/god_kaiser_server/src/services/zone_service.py`

Three locations now use `flag_modified(device, "device_metadata")` to notify SQLAlchemy
of in-place JSON dict mutations. Without this, changes to `device_metadata` may not be
persisted. While this is an ORM-level concern, the absence of an integration test that
verifies the metadata actually persists through a commit is a risk.

---

### IMP-6: `RuleFlowEditor.vue`, `RuleConfigPanel.vue`, `RuleNodePalette.vue` untested [Criticality: 5/10]

**Files:**
- `El Frontend/src/components/rules/RuleFlowEditor.vue` (1143 lines)
- `El Frontend/src/components/rules/RuleConfigPanel.vue` (893 lines)
- `El Frontend/src/components/rules/RuleNodePalette.vue` (474 lines)

These are large, complex components for the visual rule editor. `RuleCard.test.ts` and
`RuleTemplateCard.test.ts` exist, but the core editor components have no tests.
Given the complexity (Vue Flow integration, drag-drop, rule-to-graph conversion), these
are candidates for component-level tests.

---

### IMP-7: `get_kaiser_id()` and `get_topic_with_kaiser_id()` untested [Criticality: 5/10]

**File:** `El Servador/god_kaiser_server/src/core/constants.py` (lines 77-98)

New utility functions used by multiple handlers (heartbeat, zone service, topic builder).
No unit test covers these. The `get_kaiser_id()` function has a try/except fallback
that should be tested.

---

## 4. Test Quality Issues

### TQ-1: Zone mismatch detection tests duplicate logic instead of testing the handler [Medium]

**File:** `El Servador/god_kaiser_server/tests/integration/test_heartbeat_handler.py` (lines 505-641)

The `TestZoneMismatchDetection` class extracts the detection logic into local variables
and asserts on those -- effectively re-implementing the production code in the test.
These tests validate the *algorithm* but do NOT test the actual `_update_esp_metadata()`
method execution path. A refactoring of the detection logic in the handler would not
be caught by these tests.

**Recommendation:** Test through `handle_heartbeat()` with mocked DB and verify that
the zone re-assignment MQTT publish is actually called (or not called) based on the scenario.

---

### TQ-2: Config handler tests use excessive mock nesting [Low-Medium]

**File:** `El Servador/god_kaiser_server/tests/integration/test_config_handler.py`

Tests use 3-4 levels of nested `with patch(...)` blocks, making them brittle and hard
to read. A helper function (similar to `create_mock_session_and_repo` in diagnostics
tests) would improve maintainability and reduce the risk of incorrect mock setup.

---

### TQ-3: Some E2E tests have weak assertions [Medium]

**File:** `El Frontend/tests/e2e/scenarios/emergency.spec.ts`

The emergency stop E2E test catches exceptions and logs them rather than failing. The
assertion at line 60 (`expect(page.url()).not.toContain('/error')`) only verifies the
page didn't crash, not that emergency UI elements appeared. The test documents this
limitation but it reduces confidence.

---

## 5. Positive Observations

### Well-tested areas:

1. **DiagnosticsHandler** (`test_diagnostics_handler.py`) -- 9 tests covering happy path,
   validation failures, unknown device, invalid topic, metadata update verification,
   and singleton pattern. Mock strategy is clean and well-documented.

2. **HAL Abstraction Layer** -- `mock_gpio_hal.h` (347 lines) is an excellent test double
   with configurable failure modes, state inspection, and hardware-reserved pin simulation.
   `test_gpio_manager_mock.cpp` has 10 tests covering initialization, pin reservation,
   release, availability, mode configuration, digital ops, emergency safe-mode, and info.

3. **Frontend unit tests** -- Store tests (`auth.test.ts`, `database.test.ts`,
   `dragState.test.ts`, `esp.test.ts`, `logic.test.ts`) are comprehensive with MSW
   mock server integration. Utility tests (`formatters`, `sensorDefaults`, `gpioConfig`,
   `labels`, etc.) provide thorough coverage for pure functions.

4. **useWebSocket composable** (`useWebSocket.test.ts`, 942 lines) -- Very thorough
   testing of connection lifecycle, subscription management, message routing, status
   monitoring, cleanup, and error handling.

5. **Backend validation tests** -- ConfigHandler payload validation, HeartbeatHandler
   payload validation, and TopicBuilder build/parse methods are well-covered with
   positive and negative cases.

6. **ESP32 TopicBuilder tests** (22 Unity tests) -- Covers sensor data, batch, actuator,
   heartbeat, LWT, config response, zone, subzone, and system diagnostics topics.

7. **Playwright E2E infrastructure** -- Global setup/teardown, API/MQTT/WebSocket
   helpers, and 5 E2E scenarios provide a solid integration testing foundation.

---

## 6. Prioritized Action Items

| Priority | Item | Criticality | Effort |
|----------|------|-------------|--------|
| 1 | Test `_mark_config_applied()` | 9/10 | Medium |
| 2 | Test `sensor.store.ts` handlers | 8/10 | Medium |
| 3 | Test `actuator.store.ts` handlers | 8/10 | Medium |
| 4 | Test LWT clear in heartbeat handler | 8/10 | Low |
| 5 | Test zone cascade-delete in ZoneService | 8/10 | Low |
| 6 | Test `useZoneDragDrop` composable | 7/10 | Medium |
| 7 | Test `useConfigResponse` composable | 7/10 | Low |
| 8 | Test `parse_system_diagnostics_topic()` | 6/10 | Low |
| 9 | Fix zone mismatch tests to go through handler | 6/10 | Medium |
| 10 | Test `useKeyboardShortcuts` composable | 6/10 | Low |
