# Wokwi Session 2 - Bug Analysis & Fix Report

> **Date:** 2026-02-11
> **Session:** 08:02 - 08:12 UTC
> **Device:** ESP_00000001 (Wokwi Simulator)
> **Agents:** esp32-debug (analysis), esp32-dev (Bug 1+2), server-dev (Bug 3+4+5)

---

## Executive Summary

5 Bugs gefunden, **4 gefixt, 1 war bereits gefixt**. Alle Fixes verifiziert (Build + Tests).

| Bug | Severity | Status | Agent |
|-----|----------|--------|-------|
| BUG 1: set_log_level params | Medium | **FIXED** | esp32-dev |
| BUG 2: OneWire GPIO conflict | High | **FIXED** | esp32-dev |
| BUG 3: ZONE_MISMATCH auto-resolve | Low | **FIXED** | server-dev |
| BUG 4: SQLAlchemy JSON mutation | **Critical** | **FIXED** | server-dev |
| BUG 5: Retained LWT cleanup | Medium | **ALREADY FIXED** | - |

---

## BUG 1: `set_log_level` ignores `params` object

### Root Cause
`main.cpp:1230-1242` - Der params-Fallback war bereits in der Working Copy implementiert (pruefen zuerst `doc["level"]`, dann `doc["params"]["level"]`). Das verbleibende Problem: Wenn kein `level` Feld gefunden wird, blieb `level` ein leerer String. Die Validation gab zwar korrekt `false` zurueck, aber ohne expliziten Laengen-Check war das fragil.

### Fix
`main.cpp:~1242` - `level.length() > 0` als Vorbedingung eingefuegt:
```cpp
bool valid = (level.length() > 0 &&
             (level == "DEBUG" || level == "INFO" || level == "WARNING" ||
              level == "ERROR" || level == "CRITICAL"));
```

### Verification
- Build wokwi_esp01: SUCCESS
- Native Tests: 22/22 passed

---

## BUG 2: Sensor config GPIO conflict with OneWire bus

### Root Cause
`main.cpp:~2467` - In `parseAndConfigureSensorWithTracking()` gab es **zwei** Fehlerpfade mit inkonsistenter Logik:
- **Pfad 1** (validateSensorConfig failure, Zeile 2467): Prueft nur `pin_owner.length() > 0` - meldet Bus-Owners wie `"bus/onewire/4"` faelschlicherweise als GPIO_CONFLICT
- **Pfad 2** (configureSensor failure, Zeile 2497): Prueft `!pin_owner.startsWith("bus/")` - korrekt, unterscheidet Bus-Sharing

Die eigentliche Bus-Sharing-Logik in `GPIOManager::requestPin()` (Zeilen 171-183) und `SensorManager::configureSensor()` (CASE A/B/C, Zeilen 364-386) war bereits korrekt. Bug war rein im Error-Reporting-Layer.

### Fix
`main.cpp:~2467` - Pfad 1 mit derselben Bus-Check-Bedingung:
```cpp
if (pin_owner.length() > 0 && !pin_owner.startsWith("bus/")) {
    SET_FAILURE_AND_RETURN(config.gpio, ERROR_GPIO_CONFLICT, "GPIO_CONFLICT", detail);
}
```

### Verification
- Build wokwi_esp01: SUCCESS (RAM 22.4%, Flash 90.3%)
- Native Tests: 22/22 passed, keine Regressionen

---

## BUG 3: ZONE_MISMATCH not auto-resolved

### Root Cause
`heartbeat_handler.py:636-668` - Server erkennt Mismatch (DB hat Zone, ESP nicht), loggt WARNING, aber unternimmt keine Aktion.

### Fix
Im `_update_esp_metadata()` Mismatch-Block:
- Automatisches `zone/assign` MQTT-Publish mit Zonen-Daten aus DB
- Rate-Limiting via `zone_resync_sent_at` in device_metadata (Cooldown: 300s)
- Nutzt existierende Patterns: `TopicBuilder.build_zone_assign_topic()`, `MQTTClient.get_instance().publish()`
- Non-fatal: try/except um den Publish-Aufruf

### Verification
- 766 Unit-Tests passed, 3 skipped, 0 failed

---

## BUG 4: SQLAlchemy JSON mutation tracking (CRITICAL)

### Root Cause
`device_metadata` ist eine JSON-Spalte. SQLAlchemy erkennt in-place dict-Mutationen nicht. `esp_repo.py` nutzt korrekt `flag_modified()` (7 Instanzen), aber `zone_service.py` und `zone_ack_handler.py` NICHT.

### Fix
**5 neue `flag_modified()` Aufrufe in 2 Dateien:**

1. **`zone_service.py`** (3 Stellen)
   - `assign_zone()`: nach SET `pending_zone_assignment`
   - `remove_zone()`: nach DELETE `pending_zone_assignment`
   - `handle_zone_ack()`: nach DELETE `pending_zone_assignment`

2. **`zone_ack_handler.py`** (2 Stellen)
   - `zone_assigned` Branch: nach DELETE `pending_zone_assignment`
   - `zone_removed` Branch: nach DELETE `pending_zone_assignment`

Import hinzugefuegt: `from sqlalchemy.orm.attributes import flag_modified`

### Verification
- 766 Unit-Tests passed, 3 skipped, 0 failed

---

## BUG 5: Retained LWT not cleared on reconnect

### Status: ALREADY FIXED
`heartbeat_handler.py:212-226` enthaelt bereits "Step 5b: Clear stale retained LWT message". Dieser Bug war in einer frueheren Session bereits gefixt.

---

## Files Modified

| File | Bug | Change |
|------|-----|--------|
| `El Trabajante/src/main.cpp` | 1, 2 | Empty-level validation, bus-owner GPIO conflict check |
| `El Servador/.../heartbeat_handler.py` | 3 | Auto zone/assign on mismatch with rate-limiting |
| `El Servador/.../zone_service.py` | 4 | 3x `flag_modified(device, "device_metadata")` |
| `El Servador/.../zone_ack_handler.py` | 4 | 2x `flag_modified(device, "device_metadata")` |

---

## Test Results

| Suite | Result |
|-------|--------|
| ESP32 Build (wokwi_esp01) | SUCCESS |
| ESP32 Native Unity Tests | 22/22 passed |
| Backend Unit Tests (pytest) | 766 passed, 3 skipped |
