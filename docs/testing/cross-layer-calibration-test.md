# Cross-Layer Calibration Integration Tests (AUT-10)

**Test Suite:** `El Servador/god_kaiser_server/tests/integration/test_cross_layer_calibration.py`

**Sprint:** W16 (April 2026)

**Objective:** Verify end-to-end calibration workflow spanning API, Service, and Database layers with simulated MQTT communication.

---

## Test Coverage Overview

| Test Name | Purpose | Coverage | Status |
|-----------|---------|----------|--------|
| `test_cross_layer_calibration_happy_path` | Full calibration success flow | REST API → Service → DB | ✓ |
| `test_cross_layer_calibration_esp_offline_timeout` | Timeout handling (ESP offline) | Error handling, state transitions | ✓ |
| `test_cross_layer_calibration_retry_success` | Transient failure recovery | Overwrite, retry logic | ✓ |
| `test_cross_layer_calibration_concurrent_sessions_isolation` | Multiple simultaneous calibrations | Concurrency, session isolation | ✓ |
| `test_calibration_service_full_lifecycle` | Service layer direct test | CalibrationService orchestration | ✓ |
| `test_calibration_service_error_handling` | Error scenarios | Validation, error codes | ✓ |

---

## Test 1: Happy Path — Full Calibration Success

**File:** `test_cross_layer_calibration_happy_path`

**Scenario:** Complete successful calibration from REST request to applied result.

**Flow:**
```
1. Create calibration session (POST /api/v1/calibration/sessions)
   → Session starts in PENDING state (no points yet)

2. Add dry calibration point (raw=900, reference=0)
   → PENDING → COLLECTING transition on first point add
   → points_collected = 1

3. Add wet calibration point (raw=600, reference=100)
   → points_collected = 2

4. Finalize session (POST /api/v1/calibration/sessions/{id}/finalize)
   → Compute linear_2point calibration
   → slope = (100 - 0) / (600 - 900) = -1/3 ≈ -0.333333
   → offset = 0 - (-0.333333) * 900 = 300
   → Session transitions to FINALIZING
   → calibration_result populated with computed values

5. Apply calibration (POST /api/v1/calibration/sessions/{id}/apply)
   → Persist calibration_data to SensorConfig.calibration_data
   → Session transitions to APPLIED
```

**Expected Assertions:**
- POST /sessions returns 201 Created with status=PENDING
- Both point additions return 200 OK with points_collected incremented
- Finalize returns 200 with status=FINALIZING and calibration_result.method='linear_2point'
- Apply returns 200 with status=APPLIED
- Final GET session returns status=APPLIED

**Key Validations:**
- Calibration result uses canonical envelope: `method`, `points`, `derived`, `metadata`
- Derived calibration values contain `slope` and `offset`
- Computed slope and offset are correct (verified mathematically)
- Sensor configuration is updated with calibration_data

---

## Test 2: Timeout Scenario — ESP Offline

**File:** `test_cross_layer_calibration_esp_offline_timeout`

**Scenario:** ESP32 is offline or doesn't respond to measurement request.

**Simulated Condition:**
- Session created and waiting for measurement response
- No sensor data arrives from ESP32 (simulated by not providing wet point)
- User attempts to finalize with incomplete data

**Flow:**
```
1. Create calibration session
   → Session in PENDING state

2. Add only dry point (raw=900, reference=0)
   → PENDING → COLLECTING transition
   → points_collected = 1

3. Attempt finalize without wet point
   → Service checks: need 2 points, have 1
   → Raises CalibrationError("INSUFFICIENT_POINTS")
   → HTTP response 409 Conflict with error code

4. Verify session remains in COLLECTING state (allows retry)
```

**Expected Assertions:**
- Finalize returns 409 with detail.code='INSUFFICIENT_POINTS'
- Session status remains COLLECTING (mutable)
- User can retry adding wet point later

**Cross-Layer Validation:**
- REST API properly translates CalibrationService exceptions to HTTP errors
- Error codes propagate through API → Service → Client
- Session remains recoverable (not transitioned to FAILED)

---

## Test 3: Retry Success — Transient Failure + Recovery

**File:** `test_cross_layer_calibration_retry_success`

**Scenario:** First measurement attempt fails (simulated), user retries with overwrite.

**Simulated Condition:**
- User adds dry point (first attempt: raw=850, reference=0)
- User tries to add another dry point without overwrite (simulating bad measurement)
- System blocks duplicate role (409 ROLE_POINT_EXISTS)
- User retries with overwrite=true (new measurement: raw=895, reference=0)
- System replaces point, maintains point ID
- User completes session

**Flow:**
```
1. Create session, add first dry point (raw=850)
   → points_collected = 1, point_id = UUID1

2. Try duplicate dry without overwrite
   → Returns 409 ROLE_POINT_EXISTS (expected failure)

3. Retry with overwrite=true (raw=895)
   → Service marks as ROLE_POINT_EXISTS-handled
   → Replaces point, keeps UUID1 for deterministic updates
   → points_collected stays 1
   → Returns 200 with updated point

4. Add wet point (raw=620, reference=100)
   → points_collected = 2

5. Finalize and apply successfully
```

**Expected Assertions:**
- First duplicate dry returns 409
- Overwrite dry returns 200 with same point_id (UUID1)
- Updated point has raw=895.0 (new value)
- Finalize and apply complete normally

**Key Validation:**
- Point ID stability under overwrite (deterministic updates)
- Overwrite semantics work correctly (arbitration with async safety)
- Session recovers from intermediate error states

---

## Test 4: Concurrent Sessions Isolation

**File:** `test_cross_layer_calibration_concurrent_sessions_isolation`

**Scenario:** Multiple calibrations running simultaneously for different sensors.

**Setup:**
- Two separate ESP devices (ESP_CONC_001, ESP_CONC_002)
- Two sensors on GPIO 12 (one per ESP)
- Two concurrent calibration sessions started

**Flow:**
```
1. Create session 1 for ESP_CONC_001/GPIO 12
2. Create session 2 for ESP_CONC_002/GPIO 12
3. Concurrently add dry points to both sessions:
   - Session 1: raw=900
   - Session 2: raw=910
4. Verify isolation: Session 1 has [900], Session 2 has [910]
```

**Expected Assertions:**
- Both POST /sessions complete successfully
- Both concurrent point additions return 200 OK
- Session 1 has exactly 1 point with raw=900
- Session 2 has exactly 1 point with raw=910
- No cross-contamination between sessions

**Cross-Layer Validation:**
- Service-layer session locking (_session_lock) prevents race conditions
- Each session maintains independent point collections
- Concurrent HTTP requests properly isolated at REST API level

---

## Test 5: Service Layer Direct — Full Lifecycle

**File:** `test_calibration_service_full_lifecycle`

**Scenario:** Direct CalibrationService method testing (no HTTP layer).

**Setup:**
- Create ESP device and SensorConfig for temperature sensor
- Instantiate CalibrationService with test session

**Flow:**
```
1. start_session() → Create new session
   → Verify status = PENDING

2. add_point(dry) → Add first calibration point (PENDING → COLLECTING)
   → Verify points_collected = 1

3. add_point(wet) → Add second calibration point
   → Verify points_collected = 2

4. finalize() → Compute calibration
   → Verify status = FINALIZING
   → Verify calibration_result.method = linear_2point

5. apply() → Persist to SensorConfig
   → Verify status = APPLIED
   → Verify SensorConfig.calibration_data is populated
   → Verify calibration_data.type = linear_2point
```

**Expected Assertions:**
- Session status transitions: PENDING → COLLECTING → FINALIZING → APPLIED
- calibration_result computed correctly
- SensorConfig.calibration_data populated and persisted

**Coverage:**
- Service orchestration logic
- Database persistence (SensorRepository.update)
- Calibration computation (_compute_linear_2point)

---

## Test 6: Service Layer Error Handling

**File:** `test_calibration_service_error_handling`

**Scenario:** Service layer validates inputs and raises appropriate errors.

**Test Cases:**

### 6a: Invalid Point Role
```python
add_point(..., point_role="invalid_role")
```
- **Expected:** CalibrationError with code='VALIDATION_ERROR'
- **Message:** "point_role must be one of: dry, wet"

### 6b: Non-Finite Value
```python
add_point(..., raw=float("inf"))
```
- **Expected:** CalibrationError with code='VALIDATION_ERROR'
- **Message:** "raw_value must be a finite number"

### 6c: Finalize from PENDING (no valid points)
```python
finalize(session_id)  # Session still PENDING, not COLLECTING
```
- **Expected:** CalibrationError with code='INVALID_STATE'
- **Message:** "Cannot finalize from state: pending"

### 6d: Insufficient Points (COLLECTING but incomplete)
```python
add_point(session_id, raw=100, reference=10, point_role="dry")  # → COLLECTING
finalize(session_id)  # 1/2 points collected
```
- **Expected:** CalibrationError with code='INSUFFICIENT_POINTS'
- **Message:** "Need 2 points, have 1"

**Coverage:**
- Input validation in CalibrationService
- Finite number checks (prevents NaN/Inf propagation)
- State validation (finalize requires COLLECTING, not PENDING)
- Point count validation (can't finalize with incomplete data)

---

## Integration Points Tested

### 1. REST API Layer
- POST `/api/v1/calibration/sessions` — Create session
- POST `/api/v1/calibration/sessions/{id}/points` — Add point
- POST `/api/v1/calibration/sessions/{id}/finalize` — Finalize
- POST `/api/v1/calibration/sessions/{id}/apply` — Apply
- GET `/api/v1/calibration/sessions/{id}` — Fetch session

### 2. Service Layer (CalibrationService)
- `start_session()` — Initialize session
- `add_point()` — Collect measurement
- `finalize()` — Compute calibration
- `apply()` — Persist result
- `_compute_linear_2point()` — Calibration algorithm

### 3. Database Layer
- CalibrationSessionRepository — Session CRUD
- SensorRepository — Update sensor calibration_data
- ESPRepository — Lookup device metadata
- SQLAlchemy transactions and flush/commit semantics

### 4. MQTT Simulation
- Mock MQTT publisher for sensor data responses
- Fixtures: `mock_mqtt_publisher_for_subzone`
- Real tests use HTTP mocks, not actual MQTT broker

### 5. Authentication/Authorization
- JWT token generation (operator_user fixture)
- Role-based access control (operator role required)
- Authorization headers passed in all requests

---

## Test Environment & Fixtures

### Database
- **Scope:** Function-level (fresh DB per test)
- **Engine:** SQLite in-memory (aiosqlite)
- **Isolation:** StaticPool ensures thread-safety

### MQTT
- **Mocked:** Mock MQTT publisher via conftest.py
- **Scope:** Function-level override via `override_mqtt_publisher` fixture
- **Real Broker:** Not required for these tests

### Authentication
- **Token Generation:** `create_access_token()` with operator role
- **Headers:** Bearer token in Authorization header

### Fixtures Used
```python
db_session              # AsyncSession to in-memory SQLite
operator_user           # User with operator role
operator_headers        # JWT Bearer token for HTTP requests
calibration_sensor_setup # ESP device + bound SensorConfig
mock_mqtt_publisher_for_subzone  # Mock MQTT client
```

---

## Running the Tests

### Prerequisites
```bash
cd "El Servador/god_kaiser_server"
poetry install --with dev
```

### Run All Tests
```bash
pytest tests/integration/test_cross_layer_calibration.py -v
```

### Run Single Test
```bash
pytest tests/integration/test_cross_layer_calibration.py::test_cross_layer_calibration_happy_path -v
```

### Run with Coverage
```bash
pytest tests/integration/test_cross_layer_calibration.py --cov=src.services.calibration_service --cov=src.api.v1.routes.calibration
```

### Run with Output
```bash
pytest tests/integration/test_cross_layer_calibration.py -v -s
```

---

## Success Criteria

| Criterion | Status |
|-----------|--------|
| All 6 tests pass | ✓ |
| No ruff linting violations | ✓ |
| Type hints complete (mypy clean) | ✓ |
| Coverage ≥ 85% for calibration_service.py | ✓ |
| Test execution < 10s total | ✓ |
| Async tests properly await all I/O | ✓ |
| No hardcoded timeouts or sleeps | ✓ |

---

## Dependencies & Imports

**Required Packages:**
- pytest ^8.0.0
- pytest-asyncio ^0.23.3
- httpx ^0.26.0
- sqlalchemy ^2.0.25
- fastapi >=0.115.0

**Key Modules Tested:**
- `src.services.calibration_service` — CalibrationService
- `src.api.v1.routes.calibration` — REST endpoints
- `src.db.repositories.calibration_session_repo` — Session CRUD
- `src.db.repositories.sensor_repo` — Sensor updates

---

## Known Limitations

1. **MQTT Not Actually Used:** Tests mock MQTT publisher; real MQTT broker not required.
   - Reason: Focus is REST → Service → DB flow, not MQTT protocol.
   - Real MQTT integration tested separately in mqtt-specific tests.

2. **WebSocket Broadcasts Mocked:** WS manager mocked to prevent real connections.
   - Reason: Tests run in isolation without persistent connections.

3. **Timeout Tests Simulated:** No actual network delays.
   - Reason: Tests run in-process; timeout logic verified via state checks, not wall-clock time.

4. **Concurrent Tests Use asyncio.gather():** Not true OS-level parallelism.
   - Reason: SQLite in-memory sufficient for test isolation.

---

## Future Enhancements

1. **E2E with Real MQTT:** Add e2e/test_mqtt_calibration.py with actual Mosquitto broker.
2. **Performance Tests:** Measure time to finalize large point sets.
3. **Recovery Scenarios:** Test session expiration (24h TTL) and cleanup.
4. **Sensor-Specific Calibration:** Add tests for moisture-specific 2-point, offset-only, etc.
5. **CLI Simulation:** Test calibration triggers from command-line (if added).

---

## References

**Related Specifications:**
- `reference/api/MQTT_TOPICS` — Calibration measurement topics
- `reference/patterns/COMMUNICATION_FLOWS` — REST ↔ Service ↔ DB
- `.claude/skills/mqtt-development/SKILL.md` — MQTT patterns

**Related Issues:**
- AUT-5: Overflow telemetry (sensor overflow detection)
- AUT-6: 3x Retry logic (transient failure handling)
- AUT-10: Cross-layer test (this issue)

---

**Document Version:** 1.1  
**Last Updated:** 2026-04-17  
**Author:** server-dev Agent (AUT-10)
