# Server Dev Report: Wokwi Device Registration Status Fix

**Report Date:** 2026-02-11
**Modus:** B (Implementierung)
**Agent:** server-development
**Status:** ✅ COMPLETE

---

## Auftrag
Analysiere den Device Registration Flow im Server und korrigiere das Seed-Script.

**Context aus Reports:**
1. ESP32 sendet Heartbeat mit Registration Gate (blockiert Publishes bis ACK)
2. Seed-Script setzt Status "offline" für ESP_00000001
3. Plan behauptet: Heartbeat-Handler setzt neue Devices auf "pending_approval"
4. Approval-Flow existiert: pending_approval → approved (API) → online (Heartbeat)

---

## Codebase-Analyse

### Analysierte Dateien
1. `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` (1149 Zeilen)
2. `El Servador/god_kaiser_server/src/services/esp_service.py` (951 Zeilen)
3. `El Servador/god_keizer_server/src/db/models/esp.py` (240 Zeilen)
4. `El Servador/god_kaiser_server/src/api/v1/esp.py` (1400+ Zeilen, partial)
5. `El Servador/god_kaiser_server/scripts/seed_wokwi_esp.py` (134 Zeilen)

### Pattern-Extraktion

#### P1: Heartbeat Handler Status-basierte Verarbeitung
**Gefunden:** `heartbeat_handler.py:118-320`

```python
# Case 1: NEW Device (not in DB)
if not esp_device:
    esp_device = await self._auto_register_esp(...)  # status="pending_approval"
    await self._send_heartbeat_ack(status="pending_approval")
    return True

# Case 2: REJECTED (with cooldown)
if status == "rejected":
    if cooldown_expired:
        status → "pending_approval" (rediscovery)
    else:
        send ACK with status="rejected"
    return True

# Case 3: PENDING_APPROVAL (waiting for admin)
if status == "pending_approval":
    update heartbeat_count, last_seen
    send ACK with status="pending_approval"
    return True

# Case 4: APPROVED (first heartbeat after approval)
if status == "approved":
    status → "online"
    # Falls through to normal processing

# Case 5: ALL OTHERS (offline, error, unknown, online)
# ⚠️ CRITICAL GAP: No explicit case!
# Falls through to Line 206:
await esp_repo.update_status(esp_id_str, "online", last_seen)
```

**KRITISCHES PATTERN:** Handler hat **KEINEN expliziten Case** für `status="offline"`!
→ Jedes Device mit status="offline" wird **sofort zu "online"** ohne Approval.

#### P2: ESPDevice Model Status-Feld
**Gefunden:** `db/models/esp.py:137-143`

```python
status: Mapped[str] = mapped_column(
    String(20),
    default="offline",
    nullable=False,
    index=True,
    doc="Device status: online, offline, error, unknown, pending_approval, approved, rejected",
)
```

**Valid States:** 7 Werte, aber nur 4 haben explizite Handler-Cases!

#### P3: Approval Flow (REST API)
**Gefunden:** `api/v1/esp.py:1100-1180` (approve), `1212-1280` (reject)

```python
# Approve
device.status = "approved"
device.approved_at = now()
device.approved_by = username
# Next heartbeat: approved → online (Line 182)

# Reject
device.status = "rejected"
device.rejection_reason = reason
device.last_rejection_at = now()
# Cooldown: 300 seconds
```

---

## Qualitaetspruefung: 8-Dimensionen-Checkliste

| # | Dimension | Prüfung | Status |
|---|-----------|---------|--------|
| 1 | **Struktur & Einbindung** | Seed-Script in `scripts/`, korrekte Imports | ✅ OK |
| 2 | **Namenskonvention** | snake_case, PascalCase für Model | ✅ OK |
| 3 | **Rueckwaertskompatibilitaet** | Keine API-Änderungen, nur Seed-Script | ✅ OK |
| 4 | **Wiederverwendbarkeit** | Nutzt existierende ESPDevice Model-Felder | ✅ OK |
| 5 | **Speicher & Ressourcen** | Keine Änderungen an Runtime-Code | ✅ OK |
| 6 | **Fehlertoleranz** | Seed-Script hat try/except, Rollback | ✅ OK |
| 7 | **Seiteneffekte** | ⚠️ Handler-Gap dokumentiert, aber NICHT gefixt | ⚠️ WARNING |
| 8 | **Industrielles Niveau** | Seed-Script jetzt Production-ready | ✅ OK |

### Dimension 7 Details: Handler-Gap
**Problem:** Heartbeat-Handler hat keinen expliziten Case für `offline`, `error`, `unknown`.

**Impact:** Jedes Device mit diesen Status wird **sofort online** ohne Approval-Check.

**Mitigation (aktuell):**
- Dokumentiert in `WOKWI_DEVICE_STATUS_FLOW.md`
- Seed-Script jetzt `status="approved"` (korrekt)
- Production-Code unverändert (kein Risiko für Live-System)

**Empfehlung:** Handler-Refactoring in separatem Task (Medium-Term P1).

---

## Cross-Layer Impact

| Layer | Betroffen | Geprüft | Details |
|-------|-----------|---------|---------|
| **MQTT Handler** | ✅ JA | ✅ | Heartbeat-Handler analysiert, keine Änderungen |
| **REST API** | ❌ NEIN | ✅ | Approval-Endpoints unverändert |
| **DB Model** | ✅ JA | ✅ | discovered_at, approved_at, approved_by Felder genutzt |
| **Frontend** | ❌ NEIN | ✅ | Keine Type-Änderungen |
| **ESP32** | ❌ NEIN | ✅ | Keine MQTT-Payload-Änderungen |

---

## Ergebnis: Seed-Script Korrektur

### Datei: `scripts/seed_wokwi_esp.py`

#### Änderung 1: Import erweitert (Line 28)
```python
# Before
from datetime import timezone

# After
from datetime import datetime, timezone
```

#### Änderung 2: Status + Audit-Felder (Line 56-65)
```python
# Before
wokwi_esp = ESPDevice(
    device_id=WOKWI_ESP_ID,
    status="offline",  # ❌ FALSCH
    # keine discovered_at, approved_at, approved_by
)

# After
wokwi_esp = ESPDevice(
    device_id=WOKWI_ESP_ID,
    status="approved",  # ✅ KORREKT
    discovered_at=datetime.now(timezone.utc),
    approved_at=datetime.now(timezone.utc),
    approved_by="seed_script",
)
```

### Begründung: Warum `status="approved"`?

#### Option 1: `status="offline"` (REJECTED)
**Problem:** Handler-Gap führt zu sofortigem `"online"` ohne Approval.
```
offline (seed) → Heartbeat → online (handler Line 206)
```

#### Option 2: `status="pending_approval"` (REJECTED)
**Problem:** Jeder Wokwi-Start braucht manuellen Admin-Approval → schlechte Test-UX.
```
pending_approval → Admin Approval → approved → Heartbeat → online
```

#### Option 3: `status="approved"` (CHOSEN ✅)
**Vorteile:**
1. Nutzt **korrekten Flow:** `approved → online` (Handler Line 182-186)
2. **Pre-seeding = implizite Approval** (Wokwi ist kontrollierte Umgebung)
3. **Vollständiger Audit-Trail:** discovered_at, approved_at, approved_by
4. **Gute UX:** Wokwi startet sofort ohne manuellen Approval

**Flow:**
```
approved (seed) → Heartbeat → online (handler Line 182)
```

---

## Verifikation

### Test Case: Wokwi Cold Start
```bash
# Step 1: Clean DB (falls nötig)
poetry run python -c "from src.db.repositories import ESPRepository; import asyncio; asyncio.run(ESPRepository.delete('ESP_00000001'))"

# Step 2: Run Seed
poetry run python scripts/seed_wokwi_esp.py

# Step 3: Check DB
psql -U automationone -d automationone_db -c "SELECT device_id, status, discovered_at, approved_at, approved_by FROM esp_devices WHERE device_id='ESP_00000001';"

# Expected Output:
#  device_id    | status   | discovered_at       | approved_at         | approved_by
# --------------+----------+---------------------+---------------------+-------------
#  ESP_00000001 | approved | 2026-02-11 10:00:00 | 2026-02-11 10:00:00 | seed_script

# Step 4: Start Wokwi (USER MANUAL)
# cd "El Trabajante"
# pio run -e wokwi_simulation
# wokwi-cli . --timeout 0

# Step 5: Verify Server Logs
# Expected: "✅ Device ESP_00000001 now online after approval"

# Step 6: Verify DB after Heartbeat
psql -U automationone -d automationone_db -c "SELECT device_id, status, last_seen FROM esp_devices WHERE device_id='ESP_00000001';"

# Expected Output:
#  device_id    | status | last_seen
# --------------+--------+---------------------
#  ESP_00000001 | online | 2026-02-11 10:01:00
```

---

## Dokumentation

### Erstellt
1. **`WOKWI_DEVICE_STATUS_FLOW.md`** (12 Sections, 400+ Zeilen)
   - Complete State Machine
   - Heartbeat Handler Code-Traced Flow
   - Approval/Rejection Flows
   - Audit Events, WebSocket Events
   - Rate Limiting, Cooldown Logic
   - Verification Test Cases

2. **`SERVER_DEV_REPORT_WOKWI_STATUS_FIX.md`** (dieses Dokument)
   - Codebase-Analyse
   - Pattern-Extraktion
   - Qualitätsprüfung
   - Cross-Layer Impact
   - Implementierung Details

---

## Empfehlung

### Immediate Actions (P0)
- ✅ Seed-Script korrigiert
- ✅ Flow dokumentiert
- ⏭️ **USER:** Seed-Script ausführen: `poetry run python scripts/seed_wokwi_esp.py`

### Medium-Term (P1 - Nächster Sprint)
**Handler Refactoring:** Explizite Cases für `offline`, `error`, `unknown`

**Code-Vorschlag:**
```python
# heartbeat_handler.py Line 147 (AFTER approved case, BEFORE normal processing)

if status in ("offline", "error", "unknown"):
    # Explicit handling: These states can transition to online without approval
    # This is for devices that were previously approved/online

    # Security Check: Warn if device has no approval history
    if not esp_device.approved_at:
        logger.warning(
            f"Device {esp_id_str} transitioning {status} → online WITHOUT approval history! "
            f"This may indicate a data migration or seed-script device."
        )

    # Log transition for audit
    logger.info(f"Device {esp_id_str}: {status} → online (heartbeat recovery)")

    # Falls through to normal processing (update_status, etc.)
```

**Benefit:** Macht Code explizit, Log-Warnung für suspekte Transitions.

### Low Priority (P2)
- Auto-Approval Policy (MAC-Whitelist)
- Approval-Timeout (Auto-Reject nach X Tagen)
- Dashboard: 1-Click-Approve

---

## Cross-Agent Communication

### Technical Manager
**Hinweis:** Handler-Gap dokumentiert, aber nicht gefixt (kein Risiko für Live-System).
**Action Item:** Handler-Refactoring in nächsten Sprint einplanen (Medium P1).

### esp32-dev
**Info:** Keine Änderungen nötig. Registration Gate Pattern funktioniert korrekt mit ACK.

### frontend-dev
**Info:** Keine Type-Änderungen. Approval-Flow bleibt gleich.

---

**Status:** ✅ COMPLETE
**Files Changed:** 1 (seed_wokwi_esp.py)
**Reports Created:** 2 (WOKWI_DEVICE_STATUS_FLOW.md, SERVER_DEV_REPORT_WOKWI_STATUS_FIX.md)
**Next Agent:** NONE (Ready for USER execution)
