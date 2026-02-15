# Device-Lifecycle-Resilienz Implementation Plan

## Context

The Zone-Kaiser implementation (WP1-WP9) is complete and all E2E scenarios work at the code level. However, the Technical Manager identified a critical gap: **What happens to device data in EVERY state and during EVERY state transition?**

**Problem:**
The system has robust MQTT error handling and correct state machines, but **critical cascade gaps** in the service layer leave orphaned data when devices, zones, or subzones are deleted. This violates the server-centric architecture principle where the database is the single source of truth.

**Why this matters:**
- Zone removal doesn't cascade to subzones → GPIOs appear "occupied" but unusable
- Subzone removal doesn't delete DB records → Frontend shows deleted subzones
- ESP deletion doesn't clean scheduler/mock/logic → Background jobs fail silently
- Sensor/Actuator deletion doesn't cancel scheduler jobs → Jobs write to deleted configs

**Intended outcome:**
A complete resilience system where every deletion properly cascades through all dependent data layers (DB, MQTT, Scheduler, Mock, Logic Engine, WebSocket), ensuring no orphaned records, stale references, or leaked resources.

---

## 1. IST-Analyse

### 1.1 Daten-Inventar (was wird wo gespeichert)

**Server-Centric Architecture:** Database is the central source of truth. ESP32 devices are "dumb agents" that receive commands and send data. ALL business logic runs on the server.

**Data Hierarchy:**
```
ESPDevice (root)
├─ zone_id, master_zone_id, zone_name (nullable fields in ESPDevice table)
├─ SubzoneConfig (1:n via FK esp_id, CASCADE DELETE)
│  └─ assigned_gpios (JSON array)
├─ SensorConfig (1:n via FK esp_id, CASCADE DELETE)
│  └─ SensorData (1:n via FK sensor_config_id, CASCADE DELETE)
├─ ActuatorConfig (1:n via FK esp_id, CASCADE DELETE)
│  └─ ActuatorHistory (1:n via FK actuator_config_id, CASCADE DELETE)
├─ ESPHeartbeatLog (1:n via FK esp_id, CASCADE DELETE)
└─ AuditLog (1:n via FK esp_id, nullable, NO CASCADE)
```

**No FK Relationships (Orphan Risks):**
- `CrossESPLogic.rule_config` (JSON with `sensor_esp_id`, `sensor_gpio`, `actuator_esp_id`, `actuator_gpio`)
- `AIPredictions.target_esp_id` (nullable, zone-level predictions have NULL)
- `TokenBlacklist.token` (no FK to User table)
- `AuditLog.esp_id` (nullable, denormalized for audit trail)

**Runtime State (not in DB):**
- APScheduler jobs for sensor reads
- MockESPManager (in-memory store for Wokwi/tests)
- WebSocket subscriptions

---

### 1.2 Kaskaden-Matrix (was passiert bei welcher Löschung)

| Deletion Action | Automatic Cascades (FK) | Manual Cleanup Needed | Orphaned Data Risk |
|----------------|-------------------------|----------------------|-------------------|
| **Zone removal** (`zone_service.remove_zone`) | NONE (only sets fields to NULL in ESPDevice) | Subzones, Sensors, Actuators remain | SubzoneConfig entries without logical assignment |
| **Subzone removal** (`subzone_service.remove_subzone`) | NONE (only sends MQTT, no DB delete) | SubzoneConfig entry must be manually deleted | SubzoneConfig remains in DB, GPIOs "occupied" |
| **ESP deletion** (via DELETE /devices/{device_id}) | SubzoneConfig, SensorConfig, ActuatorConfig, SensorData, ActuatorHistory, ESPHeartbeatLog | APScheduler jobs, MockESP, CrossESPLogic rules, WebSocket | Scheduler jobs continue, CrossESPLogic broken |
| **Sensor deletion** (`sensor_service.delete_config`) | SensorData (via FK sensor_config_id) | APScheduler job cancel, CrossESPLogic rules | Scheduler job writes to deleted config |
| **Actuator deletion** (`actuator_service.delete_config`) | ActuatorHistory (via FK actuator_config_id) | CrossESPLogic rules | Logic rules reference deleted actuator |

---

### 1.3 Zustandsübergänge (komplett mit Seiteneffekten)

**Device Lifecycle (correctly implemented in Phase 2):**
```
(unknown) → pending_approval
  ↓ Heartbeat handler creates ESPDevice with status="pending_approval"
  ↓ DB: approved_at=NULL, approved_by=NULL
  ↓ Frontend: Pending panel shows device

pending_approval → approved
  ↓ Admin calls POST /devices/{device_id}/approve
  ↓ DB: status="approved", approved_at=now, approved_by=user_id
  ↓ WebSocket: device_approved event

approved → online
  ↓ Next heartbeat after approval
  ↓ DB: status="online"
  ↓ Sensor/Actuator config now allowed (guard check in API)

online → offline
  ↓ Heartbeat timeout (300s on server)
  ↓ DB: status="offline"

approved/online → rejected
  ↓ Admin calls POST /devices/{device_id}/reject
  ↓ DB: status="rejected", rejection_reason, last_rejection_at
  ↓ 5-min cooldown before rediscovery
```

**Zone Assignment (incremental, no state change):**
```
ESP without zone → Zone assigned
  ↓ POST /zone/assign
  ↓ DB: zone_id, master_zone_id, zone_name set
  ↓ MQTT: kaiser/{kaiser_id}/esp/{esp_id}/zone/assign
  ↓ ESP confirms via zone/ack

Zone assigned → Zone removed
  ↓ DELETE /zone (zone_service.remove_zone)
  ↓ DB: zone_id=NULL, master_zone_id=NULL, zone_name=NULL
  ↓ MQTT: zone/assign with empty values
  ↓ ESP confirms via zone/ack
  ↓ PROBLEM: Subzones/Sensors/Actuators NOT cascaded
```

**Subzone Assignment:**
```
Zone assigned → Subzone assigned
  ↓ POST /subzone/assign
  ↓ DB: SubzoneConfig entry created (esp_id FK, subzone_id, assigned_gpios JSON)
  ↓ MQTT: kaiser/{kaiser_id}/esp/{esp_id}/subzone/assign
  ↓ ESP confirms via subzone/ack

Subzone assigned → Subzone removed
  ↓ DELETE /subzone/{subzone_id} (subzone_service.remove_subzone)
  ↓ MQTT: subzone/remove sent
  ↓ ESP confirms
  ↓ PROBLEM: SubzoneConfig DB entry NOT deleted
```

---

### 1.4 Lücken & Risiken

**Critical:**
1. **Zone removal doesn't cascade:** Subzones/Sensors/Actuators remain with zone references
2. **Subzone removal doesn't delete DB:** SubzoneConfig entry remains, GPIOs "occupied"
3. **ESP deletion doesn't clean runtime:** Scheduler jobs, MockESP, CrossESPLogic rules remain
4. **Sensor/Actuator deletion doesn't clean runtime:** Scheduler jobs, CrossESPLogic rules remain

**High:**
5. **MQTT ACK handlers: No retry limits:** Failed zone/subzone assignments retry forever
6. **Config handler: No timeout:** Configs remain "pending" if ESP never responds
7. **Heartbeat: Zone mismatch only logged:** ESP reports different zone than DB → only warning, no correction

**Medium:**
8. **CrossESPLogic validation missing:** No check if referenced sensors/actuators exist
9. **AIPredictions cleanup missing:** Old predictions for deleted ESPs remain
10. **TokenBlacklist cleanup missing:** Tokens remain forever (should have CRON)

---

## 2. Gefundene Probleme

### 2.1 Kritisch (Datenverlust möglich)

**Problem 1: Zone removal doesn't delete Subzones/Sensors/Actuators**
- **File:** `El Servador/god_kaiser_server/src/services/zone_service.py:178-249`
- **IST:** `remove_zone()` only sets `zone_id=NULL`, `master_zone_id=NULL`, `zone_name=NULL` in ESPDevice
- **SOLL:** Additionally DELETE all SubzoneConfig entries for this ESP, MQTT notifications for Sensor/Actuator deletes
- **Risk:** SubzoneConfig entries point to non-existent zone, GPIOs "occupied" but unusable

**Problem 2: Subzone removal doesn't delete DB entry**
- **File:** `El Servador/god_kaiser_server/src/services/subzone_service.py:198-245`
- **IST:** `remove_subzone()` only sends MQTT, no `DELETE` on SubzoneConfig table
- **SOLL:** After MQTT success: `await self.session.delete(subzone_config); await self.session.commit()`
- **Risk:** Frontend shows subzone still exists, GPIOs shown as "occupied"

**Problem 3: ESP deletion doesn't clean Scheduler/Mock/Logic**
- **File:** `El Servador/god_kaiser_server/src/services/esp_service.py:226-245`
- **IST:** FK cascade deletes DB entries, but Scheduler jobs/MockESP/CrossESPLogic remain
- **SOLL:** Before DB delete: APScheduler.remove_job(), MockESPManager.remove(), CrossESPLogic rules validate
- **Risk:** Scheduler jobs try to write data for deleted configs → 500 errors

**Problem 4: Sensor/Actuator deletion doesn't clean Scheduler/Logic**
- **File:** `El Servador/god_kaiser_server/src/services/sensor_service.py:168-193`
- **IST:** `delete_config()` only deletes DB entry (FK cascades SensorData)
- **SOLL:** Before DB delete: `scheduler.cancel_sensor_job(esp_id, gpio)`, CrossESPLogic rules validate
- **Risk:** Scheduler job writes to deleted config → DB error

---

### 2.2 Hoch (Inkonsistenz möglich)

**Problem 5: Zone/Subzone ACK handlers: No retry limits**
- **Files:** `zone_ack_handler.py`, `subzone_ack_handler.py`
- **IST:** ACK handlers log errors, but ESP retries forever on failed assignments
- **SOLL:** Server stores retry count in ESP metadata, after 3 failures → reject assignment
- **Risk:** ESP in infinite retry loop, server logs with spam

**Problem 6: Config handler: No timeout for pending configs**
- **File:** `config_handler.py`
- **IST:** Configs remain "pending" if ESP never responds
- **SOLL:** Scheduled job: After 60s pending → timeout, config_status="failed", config_error="ESP timeout"
- **Risk:** Frontend shows spinner forever, user doesn't know if config succeeded

**Problem 7: Heartbeat: Zone mismatch only logged**
- **File:** `heartbeat_handler.py`
- **IST:** ESP reports zone_id that doesn't match DB → only LOG_WARNING
- **SOLL:** After mismatch detection: Re-send zone assignment via MQTT (auto-correction)
- **Risk:** ESP and server have different zone understanding, commands misrouted

---

### 2.3 Mittel (Verbesserungspotential)

**Problem 8: CrossESPLogic validation missing**
- **File:** `cross_esp_logic_service.py` (assumed)
- **IST:** Logic rules created without checking if sensor/actuator exists
- **SOLL:** On create: FK validation, on sensor/actuator delete: orphaned rules check
- **Risk:** Logic rules break silently, no error notification

**Problem 9: AIPredictions cleanup missing**
- **File:** `db/models/ai_prediction.py` (assumed)
- **IST:** Predictions with deleted target_esp_id remain (NULL is allowed for zone-level)
- **SOLL:** FK with CASCADE or CRON job to cleanup old predictions
- **Risk:** Table grows unbounded, old predictions irrelevant

**Problem 10: TokenBlacklist cleanup missing**
- **File:** `db/models/token_blacklist.py` (assumed)
- **IST:** Tokens remain forever in blacklist
- **SOLL:** CRON job: DELETE tokens older than 30 days (JWT expiry + buffer)
- **Risk:** Table grows unbounded

---

## 3. Empfohlene Fixes

### Fix 1: Zone Removal Cascades Subzones

**IST:** `zone_service.remove_zone()` only sets zone fields to NULL
**SOLL:** Additionally DELETE all SubzoneConfig entries for this ESP

**Affected Files:**
- `El Servador/god_kaiser_server/src/services/zone_service.py:214-224`

**Implementation:**
```python
# After line 220 (device.zone_name = None) insert:

# Delete all subzones for this ESP (zone removal cascades)
from sqlalchemy import select, delete
from ..db.models.subzone import SubzoneConfig

stmt = delete(SubzoneConfig).where(SubzoneConfig.esp_id == device.id)
await self.session.execute(stmt)
await self.session.commit()
logger.info(f"Deleted all subzones for {device_id} (zone removal cascade)")
```

**Effort:** Small (5 LOC)
**Priority:** Critical
**Test:** Zone removal → Verify SubzoneConfig entries deleted

---

### Fix 2: Subzone Removal Deletes DB Entry

**IST:** `subzone_service.remove_subzone()` only sends MQTT
**SOLL:** After MQTT success: DELETE SubzoneConfig from DB

**Affected Files:**
- `El Servador/god_kaiser_server/src/services/subzone_service.py:231-245`

**Implementation:**
```python
# After line 236 (logger.error...) insert:

# 5. Delete SubzoneConfig from DB
if mqtt_sent:
    from sqlalchemy import select, delete, and_
    from ..db.models.subzone import SubzoneConfig

    stmt = delete(SubzoneConfig).where(
        and_(
            SubzoneConfig.esp_id == device.id,
            SubzoneConfig.subzone_id == subzone_id
        )
    )
    await self.session.execute(stmt)
    await self.session.commit()
    logger.info(f"SubzoneConfig deleted for {device_id}:{subzone_id}")
```

**Effort:** Small (7 LOC)
**Priority:** Critical
**Test:** Subzone removal → Verify DB entry deleted, GPIO available again

---

### Fix 3: ESP Deletion Cleans Scheduler/Mock/Logic

**IST:** FK cascade deletes DB, but runtime state remains
**SOLL:** Cleanup before DB delete

**Affected Files:**
- `El Servador/god_kaiser_server/src/services/esp_service.py` (new method `delete_device_with_cleanup`)
- `El Servador/god_kaiser_server/src/api/v1/esp.py` (DELETE endpoint - use new method)

**Implementation:**
```python
# In esp_service.py new method:
async def delete_device_with_cleanup(self, device_id: str) -> bool:
    """Delete device with full cleanup of runtime state."""
    device = await self.esp_repo.get_by_device_id(device_id)
    if not device:
        return False

    # 1. Cancel all APScheduler jobs for this ESP
    from ..scheduler import get_scheduler
    scheduler = get_scheduler()
    for job in scheduler.get_jobs():
        if device_id in job.id:  # Job IDs contain esp_id
            scheduler.remove_job(job.id)
            logger.info(f"Cancelled scheduler job: {job.id}")

    # 2. Remove from MockESPManager if mock
    if device_id.startswith('ESP_MOCK_'):
        from ..mock.manager import get_mock_manager
        mock_manager = get_mock_manager()
        await mock_manager.remove_device(device_id)
        logger.info(f"Removed mock device: {device_id}")

    # 3. Disable CrossESPLogic rules referencing this ESP
    from sqlalchemy import select, or_
    from ..db.models.cross_esp_logic import CrossESPLogic

    stmt = select(CrossESPLogic).where(
        or_(
            CrossESPLogic.rule_config['sensor_esp_id'].astext == device_id,
            CrossESPLogic.rule_config['actuator_esp_id'].astext == device_id
        )
    )
    result = await self.session.execute(stmt)
    broken_rules = result.scalars().all()
    for rule in broken_rules:
        rule.enabled = False
        rule.status = "broken"
        logger.warning(f"Disabled CrossESPLogic rule {rule.id} (ESP {device_id} deleted)")
    await self.session.commit()

    # 4. Delete device (FK cascades)
    await self.esp_repo.delete(device.id)
    logger.info(f"Device deleted: {device_id}")
    return True
```

**Effort:** Medium (40 LOC, integration in API endpoint)
**Priority:** Critical
**Test:** ESP deletion → Verify no scheduler errors, mock removed, logic disabled

---

### Fix 4: Sensor/Actuator Deletion Cleans Scheduler/Logic

**IST:** `sensor_service.delete_config()` only deletes DB
**SOLL:** Cleanup before DB delete

**Affected Files:**
- `El Servador/god_kaiser_server/src/services/sensor_service.py:168-193`
- `El Servador/god_kaiser_server/src/services/actuator_service.py` (analogous)

**Implementation:**
```python
# In sensor_service.py replace line 191 (await self.sensor_repo.delete...) with:

# 1. Cancel APScheduler job for this sensor
from ..scheduler import get_scheduler
scheduler = get_scheduler()
job_id = f"sensor_{esp_id}_{gpio}"
if scheduler.get_job(job_id):
    scheduler.remove_job(job_id)
    logger.info(f"Cancelled sensor job: {job_id}")

# 2. Check CrossESPLogic rules
from sqlalchemy import select, and_
from ..db.models.cross_esp_logic import CrossESPLogic

stmt = select(CrossESPLogic).where(
    and_(
        CrossESPLogic.rule_config['sensor_esp_id'].astext == esp_id,
        CrossESPLogic.rule_config['sensor_gpio'].astext == str(gpio)
    )
)
result = await self.session.execute(stmt)
if result.scalar_one_or_none():
    logger.warning(f"CrossESPLogic rules exist for sensor {esp_id}:{gpio} - consider disabling")

# 3. Delete config
await self.sensor_repo.delete(sensor.id)
```

**Effort:** Small (15 LOC, analogous for actuator)
**Priority:** Critical
**Test:** Sensor deletion → Verify no scheduler job, logic warning logged

---

### Fix 5: Zone/Subzone ACK Handler Retry Limits

**IST:** ACK handlers accept all retries
**SOLL:** After 3 failures → reject assignment

**Affected Files:**
- `El Servador/god_kaiser_server/src/mqtt/handlers/zone_ack_handler.py`
- `El Servador/god_kaiser_server/src/mqtt/handlers/subzone_ack_handler.py`

**Implementation:**
```python
# In zone_ack_handler.py process_message():

if payload.get("status") == "error":
    # Track retry count in device metadata
    retry_key = f"zone_assignment_retries_{payload['zone_id']}"
    retries = device.device_metadata.get(retry_key, 0) + 1
    device.device_metadata[retry_key] = retries

    if retries >= 3:
        logger.error(f"Zone assignment failed after 3 retries for {esp_id}, rejecting")
        device.zone_id = None  # Reject assignment
        del device.device_metadata[retry_key]
        # Send WebSocket notification
    else:
        logger.warning(f"Zone assignment failed (retry {retries}/3)")
```

**Effort:** Small (10 LOC per handler)
**Priority:** High
**Test:** Zone assignment fails 3× → Verify rejection, metadata cleared

---

### Fix 6: Config Handler Timeout Detection

**IST:** Configs remain "pending" forever
**SOLL:** APScheduler job: After 60s → timeout

**Affected Files:**
- `El Servador/god_kaiser_server/src/mqtt/handlers/config_handler.py` (new method)
- `El Servador/god_kaiser_server/src/scheduler.py` (job registration)

**Implementation:**
```python
# In config_handler.py new method:
async def schedule_config_timeout(self, esp_id: str, correlation_id: str):
    """Schedule timeout check for pending config."""
    from ..scheduler import get_scheduler
    scheduler = get_scheduler()

    def timeout_callback():
        asyncio.create_task(self._handle_config_timeout(esp_id, correlation_id))

    scheduler.add_job(
        timeout_callback,
        'date',
        run_date=datetime.now(timezone.utc) + timedelta(seconds=60),
        id=f"config_timeout_{correlation_id}",
    )

async def _handle_config_timeout(self, esp_id: str, correlation_id: str):
    """Mark pending configs as failed if not confirmed."""
    from sqlalchemy import select, and_

    stmt = select(SensorConfig).where(
        and_(
            SensorConfig.esp_id == esp_id,
            SensorConfig.config_status == "pending"
        )
    )
    # ... (set config_status="failed", config_error="Timeout")
```

**Effort:** Medium (30 LOC, scheduler integration)
**Priority:** High
**Test:** Config push without ESP response → After 60s: config_status="failed"

---

### Fix 7: Heartbeat Zone Mismatch Auto-Correction

**IST:** Zone mismatch only logged
**SOLL:** After mismatch → re-send zone assignment

**Affected Files:**
- `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`

**Implementation:**
```python
# In heartbeat_handler.py after zone mismatch detection:

if heartbeat_zone_id != device.zone_id:
    logger.warning(f"Zone mismatch for {esp_id}: ESP reports {heartbeat_zone_id}, DB has {device.zone_id}")

    # Auto-correction: Re-send zone assignment
    from ..services.zone_service import ZoneService
    zone_service = ZoneService(self.esp_repo, self.publisher)
    if device.zone_id:
        await zone_service.assign_zone(
            device_id=esp_id,
            zone_id=device.zone_id,
            master_zone_id=device.master_zone_id,
            zone_name=device.zone_name
        )
        logger.info(f"Re-sent zone assignment to {esp_id} (auto-correction)")
```

**Effort:** Small (10 LOC)
**Priority:** High
**Test:** ESP reports wrong zone → Verify zone assignment re-sent

---

### Fix 8: CrossESPLogic Validation

**IST:** Logic rules without FK validation
**SOLL:** Create validation + delete checks

**Affected Files:**
- `El Servador/god_kaiser_server/src/services/cross_esp_logic_service.py` (assumed)

**Implementation:**
```python
async def create_rule(self, rule_config: dict) -> CrossESPLogic:
    """Create logic rule with sensor/actuator validation."""
    # Validate sensor exists
    sensor = await self.sensor_repo.get_by_esp_and_gpio(
        rule_config['sensor_esp_id'],
        rule_config['sensor_gpio']
    )
    if not sensor:
        raise ValueError(f"Sensor not found: {rule_config['sensor_esp_id']}:{rule_config['sensor_gpio']}")

    # Validate actuator exists
    actuator = await self.actuator_repo.get_by_esp_and_gpio(
        rule_config['actuator_esp_id'],
        rule_config['actuator_gpio']
    )
    if not actuator:
        raise ValueError(f"Actuator not found: {rule_config['actuator_esp_id']}:{rule_config['actuator_gpio']}")

    # Create rule
    ...
```

**Effort:** Small (15 LOC, analogous for delete check in sensor/actuator service)
**Priority:** Medium
**Test:** Create logic rule with non-existent sensor → 400 error

---

## 4. Zusammenfassung für TM

### Issues by Severity

| Severity | Count | Issues |
|----------|-------|--------|
| **Critical** | 4 | Zone/Subzone/ESP/Sensor deletion cascades incomplete |
| **High** | 3 | MQTT retry limits, config timeout, zone mismatch |
| **Medium** | 3 | CrossESPLogic validation, AIPredictions cleanup, TokenBlacklist cleanup |
| **Total** | 10 | |

### Fix Priorities

**Phase 1 (Critical, Immediate):**
1. Fix 1: Zone removal cascades subzones (5 LOC)
2. Fix 2: Subzone removal deletes DB (7 LOC)
3. Fix 3: ESP deletion cleans scheduler/mock/logic (40 LOC)
4. Fix 4: Sensor/Actuator deletion cleans scheduler/logic (15 LOC × 2)

**Phase 2 (High, Near-Term):**
5. Fix 5: Zone/Subzone ACK handler retry limits (10 LOC × 2)
6. Fix 6: Config handler timeout detection (30 LOC)
7. Fix 7: Heartbeat zone mismatch auto-correction (10 LOC)

**Phase 3 (Medium, Backlog):**
8. Fix 8: CrossESPLogic validation (15 LOC)
9. Fix 9: AIPredictions cleanup CRON (20 LOC)
10. Fix 10: TokenBlacklist cleanup CRON (15 LOC)

### Implementation Complexity

| Phase | Total LOC | Files Changed | Est. Effort | Risk |
|-------|-----------|--------------|------------|------|
| Phase 1 | ~82 LOC | 4 files | 2-3h | Medium (DB cascades) |
| Phase 2 | ~60 LOC | 3 files | 1-2h | Low (MQTT/Scheduler) |
| Phase 3 | ~50 LOC | 3 files | 1-2h | Low (Validation/CRON) |

### Risk Mitigation Strategy

**Critical Fixes (Phase 1) Risks:**
- Zone/Subzone deletion cascades: Test with existing sensors/actuators
- ESP deletion: Mock device tests + scheduler job verification
- Rollback plan: FK cascade is idempotent, scheduler cleanup has guards

**High Fixes (Phase 2) Risks:**
- Retry limits: ESP might reject legitimate config → make retry count resettable
- Config timeout: ESP responds late → make correlation ID matching robust
- Zone mismatch: Endless loop if ESP doesn't accept zone → max retries here too

**Medium Fixes (Phase 3) Risks:**
- CrossESPLogic: Existing rules break → migration script to cleanup
- CRON jobs: Performance on large tables → batch delete with LIMIT

---

### Critical Files for Implementation

**Phase 1 (Critical):**
- `El Servador/god_kaiser_server/src/services/zone_service.py` - Zone removal cascade (Fix 1)
- `El Servador/god_kaiser_server/src/services/subzone_service.py` - Subzone DB deletion (Fix 2)
- `El Servador/god_kaiser_server/src/services/esp_service.py` - ESP deletion cleanup orchestration (Fix 3)
- `El Servador/god_kaiser_server/src/services/sensor_service.py` - Sensor deletion cleanup (Fix 4)

**Phase 2 (High):**
- `El Servador/god_kaiser_server/src/mqtt/handlers/zone_ack_handler.py` - Retry limits (Fix 5)
- `El Servador/god_kaiser_server/src/mqtt/handlers/subzone_ack_handler.py` - Retry limits (Fix 5)
- `El Servador/god_kaiser_server/src/mqtt/handlers/config_handler.py` - Timeout detection (Fix 6)
- `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` - Zone mismatch auto-correction (Fix 7)

**Phase 3 (Medium):**
- `El Servador/god_kaiser_server/src/services/cross_esp_logic_service.py` - Validation (Fix 8)
- `El Servador/god_kaiser_server/src/db/models/ai_prediction.py` - CRON cleanup (Fix 9)
- `El Servador/god_kaiser_server/src/db/models/token_blacklist.py` - CRON cleanup (Fix 10)

---

## Verification Plan

**Phase 1 Tests:**
1. Create ESP → Assign zone → Add subzone → Remove zone → Verify subzone deleted
2. Create ESP → Assign subzone → Remove subzone → Verify DB entry deleted, GPIO available
3. Create ESP with sensors/actuators → Delete ESP → Verify no scheduler errors, mock removed
4. Create sensor → Create logic rule → Delete sensor → Verify scheduler cancelled, logic warning

**Phase 2 Tests:**
1. Assign zone to ESP → Simulate 3 assignment failures → Verify zone rejected
2. Create sensor config → Don't send ESP response → Wait 60s → Verify config_status="failed"
3. ESP reports wrong zone in heartbeat → Verify zone assignment re-sent

**Phase 3 Tests:**
1. Create logic rule with non-existent sensor → Verify 400 error
2. Run AIPredictions cleanup CRON → Verify old predictions deleted
3. Run TokenBlacklist cleanup CRON → Verify expired tokens deleted

---

## Success Criteria

- ✅ All 10 fixes implemented and tested
- ✅ No orphaned SubzoneConfig entries after zone removal
- ✅ No orphaned DB entries after subzone removal
- ✅ No scheduler errors after ESP/sensor/actuator deletion
- ✅ MQTT assignments fail gracefully after 3 retries
- ✅ Config timeouts after 60s with clear error message
- ✅ Zone mismatches auto-corrected within one heartbeat cycle
- ✅ Logic rules validated on create, broken rules disabled on delete
- ✅ Old predictions and tokens cleaned up via CRON
