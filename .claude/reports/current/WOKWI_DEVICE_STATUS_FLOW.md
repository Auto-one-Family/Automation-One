# Wokwi Device Registration & Status Flow

**Report Date:** 2026-02-11
**Scope:** ESP32 Device Registration, Heartbeat Handler, Approval Flow
**Agent:** server-development
**Status:** ✅ COMPLETE

---

## Executive Summary

### Problem
Seed-Script setzte Wokwi-ESP auf `status="offline"`, was zu unerwartetem Verhalten führte:
- Heartbeat-Handler hat **keinen expliziten Case** für `"offline"`-Status
- Device wurde **SOFORT auf `"online"` gesetzt** ohne Approval (Security-Bypass!)

### Root Cause
**Heartbeat-Handler Code-Lücke (Line 206):**
```python
# Falls through to normal processing if status not in (rejected, pending_approval, approved)
await esp_repo.update_status(esp_id_str, "online", last_seen)
```

Jeder Status außer `rejected`, `pending_approval`, `approved` wird **direkt auf `online` gesetzt**!

### Solution
**Seed-Script korrigiert:** `status="approved"` statt `"offline"`
- Wokwi ist kontrollierte Test-Umgebung (kein Security-Risk)
- Pre-approved devices verwenden korrekten Flow: `approved` → `online` (beim ersten Heartbeat)

---

## 1. Device Status State Machine

### Valid States (from `esp.py:142`)
```
"online", "offline", "error", "unknown", "pending_approval", "approved", "rejected"
```

### State Transitions

```
┌──────────────────────────────────────────────────────────────────┐
│  NEW DEVICE (not in DB)                                           │
│  ────────────────────────────────────────────────────────────     │
│  First Heartbeat → pending_approval                               │
│  Code: heartbeat_handler.py:120-142                               │
│                                                                    │
│  Trigger:  Heartbeat, device_id not found in DB                   │
│  Action:   _auto_register_esp() creates device                    │
│  Status:   pending_approval                                       │
│  ACK:      status="pending_approval", config_available=false      │
│  WS Event: device_discovered                                      │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  APPROVAL FLOW (Admin-gesteuert)                                  │
│  ─────────────────────────────────────────────────────────────    │
│  pending_approval → approved → online                             │
│  Code: api/v1/esp.py:1100-1180, heartbeat_handler.py:182-186     │
│                                                                    │
│  Step 1: Admin Approval (REST API)                                │
│    POST /v1/esp/devices/{esp_id}/approve                          │
│    Status: pending_approval → approved                            │
│    Fields: approved_at, approved_by, name, zone_id (optional)     │
│    Audit:  device_approved event                                  │
│                                                                    │
│  Step 2: First Heartbeat after Approval                           │
│    Heartbeat arrives, status="approved"                           │
│    Handler: approved → online (Line 182-186)                      │
│    ACK:     status="online"                                       │
│    Audit:   device_online event                                   │
│    WS:      esp_health (status=online)                            │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  REJECTION FLOW (mit Cooldown)                                    │
│  ───────────────────────────────────────────────────────────────  │
│  pending_approval → rejected → (cooldown) → pending_approval      │
│  Code: api/v1/esp.py:1212-1280, heartbeat_handler.py:149-166     │
│                                                                    │
│  Step 1: Admin Rejection (REST API)                               │
│    POST /v1/esp/devices/{esp_id}/reject                           │
│    Status: pending_approval → rejected                            │
│    Fields: rejection_reason, last_rejection_at                    │
│    Audit:  device_rejected event                                  │
│                                                                    │
│  Step 2: Heartbeats während Cooldown (5 minutes)                  │
│    Heartbeat arrives, status="rejected"                           │
│    Handler: check_rejection_cooldown() = False                    │
│    ACK:     status="rejected" (ESP weiß es ist rejected)          │
│    Action:  return True (silent ignore)                           │
│                                                                    │
│  Step 3: Heartbeat nach Cooldown-Ablauf                           │
│    Handler: check_rejection_cooldown() = True                     │
│    Action:  _rediscover_device()                                  │
│    Status:  rejected → pending_approval                           │
│    Fields:  rejection_reason=None, rediscovered_at                │
│    WS:      device_rediscovered event                             │
│    Audit:   device_rediscovered event                             │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  NORMAL OPERATION (Online ↔ Offline)                              │
│  ────────────────────────────────────────────────────────────     │
│  online ↔ offline (Heartbeat-basiert)                             │
│  Code: heartbeat_handler.py:206-220, 1025-1116                    │
│                                                                    │
│  Online → Offline (Timeout)                                       │
│    Trigger:  check_device_timeouts() (every 60s)                  │
│    Condition: last_seen > 300 seconds ago                         │
│    Status:   online → offline                                     │
│    WS:       esp_health (status=offline, reason=timeout)          │
│    Audit:    device_offline event                                 │
│                                                                    │
│  Offline → Online (Heartbeat)                                     │
│    Trigger:  Heartbeat arrives, status != "pending/approved"      │
│    Action:   update_status("online", last_seen)                   │
│    Status:   offline → online                                     │
│    ACK:      status="online"                                      │
│    WS:       esp_health (status=online)                           │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  PENDING_APPROVAL LOOP (wartend auf Admin)                        │
│  ────────────────────────────────────────────────────────────     │
│  pending_approval → pending_approval (bei jedem Heartbeat)        │
│  Code: heartbeat_handler.py:168-180                               │
│                                                                    │
│  Heartbeat arrives, status="pending_approval"                     │
│  Action:  _update_pending_heartbeat()                             │
│  Fields:  heartbeat_count++, last_seen updated                    │
│  Status:  BLEIBT pending_approval                                 │
│  ACK:     status="pending_approval"                               │
│  DB:      Metadata aktualisiert, aber Status NICHT geändert       │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Heartbeat Handler Flow (Code-Traced)

### Case Analysis (heartbeat_handler.py)

| ESP Status | Handler Behavior | Next Status | ACK Status | Code Line |
|-----------|------------------|-------------|------------|-----------|
| **NOT IN DB** | _auto_register_esp() | pending_approval | pending_approval | 120-142 |
| **rejected** (in cooldown) | Silent ignore | rejected | rejected | 149-166 |
| **rejected** (after cooldown) | _rediscover_device() | pending_approval | pending_approval | 151-155 |
| **pending_approval** | _update_pending_heartbeat() | pending_approval | pending_approval | 168-180 |
| **approved** | Set to online | online | online | 182-186 |
| **offline** | ⚠️ Falls through → online | online | online | 206-220 |
| **online** | Update last_seen | online | online | 206-220 |
| **error/unknown** | ⚠️ Falls through → online | online | online | 206-220 |

### ⚠️ CRITICAL CODE GAP

**Problem:** Handler hat **keinen expliziten Case** für:
- `"offline"`
- `"error"`
- `"unknown"`

**Code-Beweis (Line 206+):**
```python
# Step 5: Update device status and last_seen (for online/approved devices)
await esp_repo.update_status(esp_id_str, "online", last_seen)
```

**Kommentar im Code ist FALSCH:** "for online/approved devices"
**Tatsächliches Verhalten:** Für ALLE Devices die nicht `rejected`, `pending_approval`, `approved` sind!

**Impact:** Jedes Device mit `status="offline"` wird **sofort online** gesetzt ohne Approval-Check.

---

## 3. Seed-Script Korrektur

### Before (FALSCH)
```python
wokwi_esp = ESPDevice(
    device_id=WOKWI_ESP_ID,
    status="offline",  # ❌ Wird sofort zu "online" beim ersten Heartbeat
    # ...
)
```

**Problem:**
1. Seed-Script erstellt Device mit `status="offline"`
2. Wokwi-Firmware startet, sendet Heartbeat
3. Handler: `if not esp_device` → **FALSE** (Device existiert ja!)
4. Handler: `if status == "rejected"` → FALSE
5. Handler: `if status == "pending_approval"` → FALSE
6. Handler: `if status == "approved"` → FALSE
7. Handler: Falls through zu Line 206 → `update_status("online")`
8. **Device ist ONLINE ohne Approval-Flow!**

### After (KORREKT)
```python
wokwi_esp = ESPDevice(
    device_id=WOKWI_ESP_ID,
    status="approved",  # ✅ Korrekt: approved → online beim ersten Heartbeat
    discovered_at=datetime.now(timezone.utc),
    approved_at=datetime.now(timezone.utc),
    approved_by="seed_script",
    # ...
)
```

**Begründung:**
1. **Wokwi ist kontrollierte Umgebung** (kein Security-Risk wie unbekannte Devices)
2. **Pre-seeding = implizite Approval** (Admin hat Device vorkonfiguriert)
3. **Nutzt korrekten Flow:** `approved` → `online` (Line 182-186)
4. **Audit-Trail vollständig:** discovered_at, approved_at, approved_by

### Alternatives Considered (REJECTED)

#### Option 1: status="pending_approval" (❌ REJECTED)
```python
status="pending_approval"  # Wokwi müsste manuell approved werden
```
**Problem:** Jeder Wokwi-Start braucht Admin-Approval → schlechte UX für Tests

#### Option 2: status="offline" + Auto-Approve in Handler (❌ REJECTED)
**Problem:** Handler-Änderung für Wokwi-Special-Case → Code-Smell

#### Option 3: status="approved" (✅ CHOSEN)
**Vorteile:**
- Nutzt existierenden Flow korrekt
- Keine Handler-Änderungen nötig
- Audit-Trail komplett
- UX: Wokwi startet sofort

---

## 4. REST API Approval Flow

### Approve Device
```http
POST /v1/esp/devices/{esp_id}/approve
Authorization: Bearer <operator_token>

{
  "name": "Greenhouse ESP 1",
  "zone_id": "zone_a",
  "zone_name": "Zone A"
}
```

**Code:** `api/v1/esp.py:1100-1180`

**Business Logic:**
1. Check: Device exists? → 404 if not
2. Check: Status in (pending_approval, rejected)? → 400 if not
3. Update: status → "approved"
4. Update: approved_at, approved_by, name, zone_id (optional)
5. Audit: device_approved event
6. WebSocket: device_approved broadcast
7. **KEIN Heartbeat-ACK** (wird beim nächsten Heartbeat gesendet)

### Reject Device
```http
POST /v1/esp/devices/{esp_id}/reject
Authorization: Bearer <operator_token>

{
  "reason": "Unknown MAC address, not authorized"
}
```

**Code:** `api/v1/esp.py:1212-1280`

**Business Logic:**
1. Check: Device exists? → 404 if not
2. Check: Status in (pending_approval, approved, online)? → 400 if not
3. Update: status → "rejected"
4. Update: rejection_reason, last_rejection_at
5. Audit: device_rejected event
6. WebSocket: device_rejected broadcast
7. **Cooldown:** 300s (5 minutes) before rediscovery

---

## 5. Heartbeat ACK (Phase 2: Bidirectional Approval)

**Topic:** `kaiser/god/esp/{esp_id}/system/heartbeat_ack`
**QoS:** 0 (Fire-and-Forget)
**Code:** `heartbeat_handler.py:948-1006`

### Payload Structure
```json
{
  "status": "pending_approval|approved|online|offline|rejected",
  "config_available": false,
  "server_time": 1735818000
}
```

### ESP32 Behavior (Firmware-Seite)
**Registration Gate Pattern:**
- ESP sendet Heartbeat
- ESP wartet auf ACK (mit Timeout)
- Bei `status="pending_approval"` → ESP bleibt in PENDING_APPROVAL State
- Bei `status="online"` oder `status="approved"` → ESP geht zu OPERATIONAL State
- Bei `status="rejected"` → ESP geht zu REJECTED State (Retry nach 5 min)

**WICHTIG:** ACK ist **nicht kritisch** (QoS 0):
- Wenn verloren → nächster Heartbeat triggert neuen ACK
- ESP kann ohne ACK arbeiten (dann halt ohne Status-Info)

---

## 6. Rate Limiting & Cooldown

### Discovery Rate Limiter
**Code:** `esp_service.py:45-122`

| Limit Type | Value | Purpose |
|-----------|-------|---------|
| **Global** | 10 discoveries/minute | DoS Protection |
| **Per-Device** | 1 discovery/5 minutes | Spam Protection |

### Rejection Cooldown
**Code:** `heartbeat_handler.py:451-474`

| Parameter | Value | Logic |
|-----------|-------|-------|
| **Cooldown Period** | 300s (5 min) | `last_rejection_at + 300s < now` |
| **Check Trigger** | Every Heartbeat | `_check_rejection_cooldown()` |
| **Action after Cooldown** | Rediscovery | `status="rejected"` → `"pending_approval"` |

---

## 7. WebSocket Events

| Event | Trigger | Payload Fields | Code Ref |
|-------|---------|----------------|----------|
| **device_discovered** | New device (first heartbeat) | esp_id, zone_id, heap_free, wifi_rssi, sensor_count | 540-567 |
| **device_rediscovered** | Rejected device after cooldown | esp_id, zone_id, rediscovered_at | 569-592 |
| **esp_health** | Every heartbeat (online devices) | esp_id, status, heap_free, wifi_rssi, uptime, gpio_status | 276-297 |
| **device_approved** | Admin approval (REST API) | esp_id, name, zone_id | api/v1/esp.py:1160+ |
| **device_rejected** | Admin rejection (REST API) | esp_id, reason | api/v1/esp.py:1270+ |

---

## 8. Audit Events

| Event Type | Severity | Trigger | Details Fields |
|-----------|----------|---------|----------------|
| **DEVICE_DISCOVERED** | INFO | New device (heartbeat) | zone_id, heap_free, wifi_rssi, sensor_count | 429-447 |
| **DEVICE_REDISCOVERED** | WARNING | Rejected device rediscovery | previous_status, zone_id, heap_free | 503-520 |
| **DEVICE_ONLINE** | INFO | approved → online transition | previous_status, heap_free, wifi_rssi, uptime | 188-204 |
| **DEVICE_OFFLINE** | WARNING | Heartbeat timeout | last_seen, timeout_threshold_seconds, reason | 1065-1080 |
| **DEVICE_APPROVED** | INFO | Admin approval | name, zone_id, approved_by | api/v1/esp.py |
| **DEVICE_REJECTED** | WARNING | Admin rejection | reason | api/v1/esp.py |

---

## 9. Verification & Testing

### Test Cases

#### TC-1: Wokwi Cold Start (Pre-Seeded Device)
```
Given: ESP_00000001 in DB with status="approved"
When:  Wokwi firmware sends first heartbeat
Then:
  - Handler: status="approved" Case (Line 182)
  - Device status → "online"
  - ACK: status="online"
  - WS: esp_health (online)
  - Audit: device_online event
```

#### TC-2: Unknown Device Discovery
```
Given: ESP_12AB34CD NOT in DB
When:  Unknown ESP sends heartbeat
Then:
  - Handler: _auto_register_esp() (Line 322)
  - Device created with status="pending_approval"
  - ACK: status="pending_approval"
  - WS: device_discovered event
  - Audit: device_discovered event
```

#### TC-3: Approval Flow
```
Given: ESP in DB with status="pending_approval"
When:  Admin calls POST /v1/esp/devices/{esp_id}/approve
Then:  Device status → "approved"
When:  Next heartbeat arrives
Then:  Device status → "online" (Line 182)
```

#### TC-4: Rejection with Cooldown
```
Given: ESP in DB with status="pending_approval"
When:  Admin calls POST /v1/esp/devices/{esp_id}/reject
Then:  Device status → "rejected", last_rejection_at = now
When:  Heartbeat arrives (< 5 min)
Then:  ACK: status="rejected", device stays rejected
When:  Heartbeat arrives (> 5 min)
Then:  Device status → "pending_approval" (rediscovery)
```

### Database Queries (Verification)
```sql
-- Check Wokwi ESP status
SELECT device_id, status, discovered_at, approved_at, approved_by
FROM esp_devices WHERE device_id = 'ESP_00000001';

-- Expected Result (after seed_wokwi_esp.py):
-- device_id     | status   | discovered_at       | approved_at         | approved_by
-- ESP_00000001 | approved | 2026-02-11 10:00:00 | 2026-02-11 10:00:00 | seed_script

-- List pending devices
SELECT device_id, discovered_at, last_seen,
       device_metadata->>'heartbeat_count' as heartbeats
FROM esp_devices WHERE status = 'pending_approval';
```

---

## 10. Files Changed

| File | Change | Lines |
|------|--------|-------|
| `scripts/seed_wokwi_esp.py` | status="offline" → status="approved" | 61 |
| `scripts/seed_wokwi_esp.py` | Added: discovered_at, approved_at, approved_by | 62-64 |
| `scripts/seed_wokwi_esp.py` | Import: datetime added | 28 |

---

## 11. Recommendations

### Short-Term (P0 - Critical)
1. ✅ **Seed-Script korrigiert** (status="approved")
2. ⚠️ **Handler Code-Gap dokumentiert** (offline/error/unknown → online)
3. ℹ️ **Tests für Wokwi Cold-Start** (verify approved → online flow)

### Medium-Term (P1 - High)
1. **Handler Refactoring:** Explizite Cases für `offline`, `error`, `unknown`
   ```python
   if status == "offline":
       # Explicit handling: offline → online (without approval)
       # Log warning if last_offline > 24h (suspicious)
   ```
2. **Integration Test:** Full Approval-Flow (discovery → approve → online)
3. **Monitoring:** Alert wenn Device ohne discovered_at/approved_at `online` wird

### Long-Term (P2 - Nice to Have)
1. **Auto-Approval Policy:** Konfigurierbare Whitelist (MAC-Adressen, IP-Ranges)
2. **Approval-Timeout:** Auto-Reject nach X Tagen ohne Approval
3. **Dashboard:** Pending-Devices mit 1-Click-Approve

---

## 12. References

| Document | Section | Relevance |
|----------|---------|-----------|
| `heartbeat_handler.py` | Line 62-320 | Complete handler flow |
| `esp_service.py` | Line 742-951 | Approval business logic |
| `api/v1/esp.py` | Line 1100-1280 | REST API endpoints |
| `esp.py` (Model) | Line 137-143 | Status field definition |
| `MQTT_TOPICS.md` | heartbeat_ack | ACK topic structure |

---

**Status:** ✅ COMPLETE
**Next Steps:**
1. Run seed_wokwi_esp.py to apply changes
2. Test Wokwi cold-start (verify approved → online)
3. Consider Handler refactoring (explicit offline case)
