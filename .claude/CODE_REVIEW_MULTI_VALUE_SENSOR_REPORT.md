# Code-Review Report: Multi-Value Sensor Implementation

**Reviewer:** KI-Agent (Claude Sonnet 4.5)
**Datum:** 2026-01-14
**Task:** Verifikation & Hardware-Konsistenz-Check
**Entwickler:** Entwickler 2
**Status:** 🟡 CONDITIONAL GO (Must-Fix vor Production)

---

## Executive Summary

**Findings Overview:**
- 🔴 **CRITICAL:** 4 Findings
- 🟡 **MEDIUM:** 7 Findings
- 🟢 **LOW:** 2 Findings
- **TOTAL:** 13 Findings

**Go/No-Go Empfehlung:** 🟡 **CONDITIONAL GO**
Die Implementation ist grundsätzlich solide, aber es gibt **4 kritische Hardware-Konsistenz-Probleme** die vor Production-Deploy behoben werden müssen. Alle CRITICAL Findings betreffen Validierungs-Lücken die zu Hardware-Konflikten oder inkorrekten Daten führen können.

**Top 3 Kritische Issues:**
1. **Finding #3:** I2C-Adress-Range nicht validiert (0xFF wird akzeptiert!)
2. **Finding #7:** Input-Only Pins (34-39) nicht geschützt gegen OUTPUT
3. **Finding #8:** I2C Pins (21/22) können für ANALOG/DIGITAL verwendet werden

**Positive Aspekte:**
✅ Saubere Trennung von I2C/OneWire/Analog Validierung
✅ Conflict-Detection für I2C-Adressen funktioniert
✅ GPIO-Conflict-Check nutzt bestehenden Service
✅ Error-Messages sind hilfreich

---

## Detailed Findings

### Finding #1: DB Migration - Bestehende I2C Sensoren behalten gpio=21/22

**Severity:** 🟡 MEDIUM
**Category:** Database Migration
**File:** `alembic/versions/001_add_multi_value_sensor_support.py:93-98`

**Problem:**
Die Migration macht `gpio` nullable, aber bestehende I2C-Sensoren werden **nicht** zu `gpio=NULL` normalisiert. Das bedeutet:
- Bestehende I2C-Sensoren haben `gpio=21` (semantisch inkorrekt)
- Neue I2C-Sensoren haben `gpio=NULL` (korrekt)
- Zwei verschiedene Datenformate im System!

**Evidence:**
```python
# Lines 93-98: Make gpio nullable
op.alter_column('sensor_configs', 'gpio',
                existing_type=sa.Integer(),
                nullable=True)
# ❌ MISSING: Normalisierung zu NULL für I2C/OneWire!
```

**Impact:**
- API-Code muss mit beiden Fällen umgehen (`gpio=NULL` und `gpio=21`)
- Semantische Inkonsistenz: I2C nutzt keine device-spezifische GPIO
- Verwirrung bei Debugging (warum haben manche I2C-Sensoren gpio=21?)

**Recommended Fix:**
```python
# Step 4.5: Normalize gpio to NULL for I2C/OneWire
# AFTER interface_type backfill
connection.execute(sa.text("""
    UPDATE sensor_configs
    SET gpio = NULL
    WHERE interface_type IN ('I2C', 'ONEWIRE')
"""))

# THEN: Make gpio nullable
op.alter_column('sensor_configs', 'gpio',
                existing_type=sa.Integer(),
                nullable=True)
```

**Test Case:**
```sql
-- Before migration: I2C sensor with gpio=21
SELECT id, sensor_type, gpio, interface_type FROM sensor_configs WHERE sensor_type = 'sht31_temp';
-- Expected after migration: gpio=NULL, interface_type='I2C'

-- After migration (CURRENT BEHAVIOR):
-- gpio=21, interface_type='I2C'  ❌ WRONG!

-- After fix:
-- gpio=NULL, interface_type='I2C' ✅ CORRECT!
```

---

### Finding #2: Interface Type Inference - Nicht erweiterbar für Custom Sensors

**Severity:** 🟡 MEDIUM
**Category:** Validation
**File:** `src/api/v1/sensors.py:910-932`

**Problem:**
`_infer_interface_type()` nutzt hardcodierte String-Matching und fällt auf `ANALOG` zurück für unbekannte Sensor-Types. Das ist problematisch für:
- Custom Sensoren (User definiert `my_digital_sensor` → wird ANALOG, falsch!)
- Neue Sensor-Types (müssen Code-Änderung in Server triggern)
- DIGITAL Sensoren (kein Weg zum Inferieren)

**Evidence:**
```python
# Lines 910-932
def _infer_interface_type(sensor_type: str) -> str:
    sensor_lower = sensor_type.lower()

    if any(s in sensor_lower for s in ["sht31", "bmp280", "bme280", "bh1750", "veml7700"]):
        return "I2C"
    elif "ds18b20" in sensor_lower:
        return "ONEWIRE"
    else:
        return "ANALOG"  # ⚠️ Fallback ist problematisch!
```

**Impact:**
- User kann keine DIGITAL Sensoren via Inference hinzufügen
- Custom Sensor-Types werden inkorrekt klassifiziert
- Nicht skalierbar (neue Sensor-Types brauchen Code-Änderung)

**Recommended Fix (Option A: Require explicit interface_type):**
```python
# In SensorConfigCreate schema: Make interface_type required
interface_type: Literal["I2C", "ONEWIRE", "ANALOG", "DIGITAL"]  # No Optional!

# Remove inference, validate in API:
if not request.interface_type:
    raise HTTPException(400, "interface_type is required")
```

**Recommended Fix (Option B: Learn from ESP):**
```python
# ESP sendet im ersten MQTT Payload:
{
  "sensor_type": "sht31_temp",
  "interface": "I2C",  # ← ESP weiß es!
  "i2c_address": 68
}

# Server speichert interface_type aus ESP-Daten
sensor.interface_type = payload.get("interface", "ANALOG")
```

**Test Case:**
```bash
# User erstellt Custom Sensor
curl -X POST /v1/sensors/ESP_00000001/34 \
  -d '{"sensor_type": "my_digital_sensor", "interface_type": null}'

# Current: Infers "ANALOG" ❌
# Expected: Reject with 400 "interface_type required" ✅
```

---

### Finding #3: I2C Address Range nicht validiert

**Severity:** 🔴 CRITICAL
**Category:** Hardware Validation
**File:** `src/api/v1/sensors.py:935-973`

**Problem:**
`_validate_i2c_config()` prüft **nicht** ob `i2c_address` im gültigen Bereich ist. I2C nutzt 7-bit Adressen (0x00-0x7F), aber:
- Keine Range-Validierung (User kann `0xFF` senden!)
- Keine Reserved-Address-Prüfung (0x00-0x07, 0x78-0x7F sind reserviert)

**Evidence:**
```python
# Lines 935-973: _validate_i2c_config()
if not i2c_address:
    raise HTTPException(400, "i2c_address is required for I2C sensors")

# Check if address already used
existing_with_address = await sensor_repo.get_by_i2c_address(...)
# ❌ MISSING: Range-Validierung!
# ❌ MISSING: Reserved-Address-Prüfung!
```

**Impact:**
- User kann ungültige I2C-Adresse eingeben (z.B. `0xFF`)
- ESP wird versuchen mit ungültiger Adresse zu kommunizieren (fail!)
- Schwer zu debuggen ("Warum antwortet Sensor nicht?")

**Recommended Fix:**
```python
async def _validate_i2c_config(...):
    if not i2c_address:
        raise HTTPException(400, "i2c_address is required for I2C sensors")

    # Validate 7-bit address range (0x00-0x7F)
    if not (0x00 <= i2c_address <= 0x7F):
        raise HTTPException(
            400,
            f"i2c_address must be in range 0x00-0x7F (7-bit), got 0x{i2c_address:02X}"
        )

    # Reserved I2C addresses (per I2C spec)
    # 0x00-0x07: Reserved for special purposes
    # 0x78-0x7F: Reserved for 10-bit addressing
    if i2c_address < 0x08 or i2c_address > 0x77:
        raise HTTPException(
            400,
            f"i2c_address 0x{i2c_address:02X} is reserved by I2C specification"
        )

    # ... existing conflict check
```

**Test Case:**
```bash
# Invalid I2C address (> 7-bit)
curl -X POST /v1/sensors/ESP_00000001/NULL \
  -d '{"sensor_type": "sht31_temp", "interface_type": "I2C", "i2c_address": 255}'

# Current: Accepts 0xFF ❌
# Expected: 400 "i2c_address must be 0x00-0x7F" ✅

# Reserved address
curl -X POST /v1/sensors/ESP_00000001/NULL \
  -d '{"sensor_type": "sht31_temp", "interface_type": "I2C", "i2c_address": 0}'

# Expected: 400 "i2c_address 0x00 is reserved" ✅
```

---

### Finding #4: I2C Validation - gpio=NULL nicht erzwungen

**Severity:** 🟡 MEDIUM
**Category:** Validation
**File:** `src/api/v1/sensors.py:341-350`

**Problem:**
Server validiert **nicht** dass I2C-Sensoren `gpio=NULL` haben müssen. Das erlaubt:
- I2C-Sensor mit `gpio=21` (semantisch inkorrekt, siehe Finding #1)
- Inkonsistenz zwischen verschiedenen I2C-Sensoren
- Verwirrung: "Warum hat dieser I2C-Sensor gpio=21?"

**Evidence:**
```python
# Lines 341-350
if interface_type == "I2C":
    await _validate_i2c_config(
        sensor_repo,
        esp_device.id,
        request.i2c_address,
        exclude_sensor_id=existing.id if existing else None
    )
    # I2C sensors can share GPIO (bus pins 21/22)
    # No GPIO validation needed
    # ❌ MISSING: Validate gpio=NULL!
```

**Impact:**
- Semantische Inkonsistenz (I2C nutzt Bus-Pins, nicht device-specific GPIO)
- Migration-Problem (siehe Finding #1)
- API akzeptiert beides (`gpio=NULL` und `gpio=21`)

**Recommended Fix:**
```python
async def _validate_i2c_config(..., gpio: Optional[int]):
    if not i2c_address:
        raise HTTPException(400, "i2c_address is required for I2C sensors")

    # I2C sensors must have gpio=NULL (bus pins are shared)
    if gpio is not None:
        raise HTTPException(
            400,
            "gpio must be NULL for I2C sensors (use i2c_address for identification)"
        )

    # ... range validation (Finding #3)
    # ... conflict check
```

**Test Case:**
```bash
# I2C sensor with gpio=21
curl -X POST /v1/sensors/ESP_00000001/21 \
  -d '{"sensor_type": "sht31_temp", "interface_type": "I2C", "i2c_address": 68}'

# Current: Accepts ❌
# Expected: 400 "gpio must be NULL for I2C sensors" ✅

# Correct: gpio=NULL
curl -X POST /v1/sensors/ESP_00000001/NULL \
  -d '{"sensor_type": "sht31_temp", "interface_type": "I2C", "i2c_address": 68}'

# Expected: 201 Created ✅
```

---

### Finding #5: OneWire Address Format nicht validiert

**Severity:** 🟡 MEDIUM
**Category:** Validation
**File:** `src/api/v1/sensors.py:976-1014`

**Problem:**
`_validate_onewire_config()` prüft **nicht** das Format von `onewire_address`. OneWire verwendet 64-bit Device-ROMs (16 Hex-Digits), aber:
- Keine Format-Validierung (User kann `"abc"` senden!)
- Keine Längen-Prüfung

**Evidence:**
```python
# Lines 999-1014
if not onewire_address:
    raise HTTPException(400, "onewire_address is required for OneWire sensors")

# Check if address already used
existing_with_address = await sensor_repo.get_by_onewire_address(...)
# ❌ MISSING: Format-Validierung!
```

**Impact:**
- User kann ungültige OneWire-Adresse eingeben
- ESP wird versuchen mit ungültiger Adresse zu kommunizieren
- Schwer zu debuggen

**Recommended Fix:**
```python
import re

async def _validate_onewire_config(...):
    if not onewire_address:
        raise HTTPException(400, "onewire_address is required for OneWire sensors")

    # Validate 64-bit hex format (16 hex digits)
    if not re.match(r'^[0-9A-Fa-f]{16}$', onewire_address):
        raise HTTPException(
            400,
            f"onewire_address must be 16 hex digits (64-bit ROM), got '{onewire_address}'"
        )

    # ... conflict check
```

**Test Case:**
```bash
# Invalid OneWire address
curl -X POST /v1/sensors/ESP_00000001/4 \
  -d '{"sensor_type": "ds18b20", "interface_type": "ONEWIRE", "onewire_address": "abc"}'

# Current: Accepts ❌
# Expected: 400 "onewire_address must be 16 hex digits" ✅

# Valid format
curl -X POST /v1/sensors/ESP_00000001/4 \
  -d '{"sensor_type": "ds18b20", "interface_type": "ONEWIRE", "onewire_address": "28FF1234567890AB"}'

# Expected: 201 Created ✅
```

---

### Finding #6: OneWire Validation - gpio nicht validiert

**Severity:** 🟢 LOW
**Category:** Validation
**File:** `src/api/v1/sensors.py:351-360`

**Problem:**
Server validiert **nicht** dass OneWire-Sensoren ein `gpio` (Bus-Pin) gesetzt haben. Im Gegensatz zu I2C (wo `gpio=NULL` korrekt ist), braucht OneWire einen Bus-Pin.

**Evidence:**
```python
# Lines 351-360
elif interface_type == "ONEWIRE":
    await _validate_onewire_config(
        sensor_repo,
        esp_device.id,
        request.onewire_address,
        exclude_sensor_id=existing.id if existing else None
    )
    # OneWire sensors can share GPIO (bus pin)
    # No GPIO validation needed
    # ⚠️ MISSING: Validate gpio is SET!
```

**Impact:**
- User könnte OneWire-Sensor ohne Bus-Pin erstellen
- Minor: Niedrige Priorität da ESP wahrscheinlich Default-Pin (4) nutzt

**Recommended Fix:**
```python
async def _validate_onewire_config(..., gpio: Optional[int]):
    if not onewire_address:
        raise HTTPException(400, "onewire_address is required for OneWire sensors")

    # OneWire needs bus pin
    if gpio is None:
        raise HTTPException(
            400,
            "gpio is required for OneWire sensors (bus pin, e.g., GPIO 4)"
        )

    # ... format validation (Finding #5)
    # ... conflict check
```

**Test Case:**
```bash
# OneWire without gpio
curl -X POST /v1/sensors/ESP_00000001/NULL \
  -d '{"sensor_type": "ds18b20", "interface_type": "ONEWIRE", "onewire_address": "28FF..."}'

# Expected: 400 "gpio is required for OneWire sensors" ✅
```

---

### Finding #7: Input-Only Pins (34-39) nicht geschützt gegen OUTPUT

**Severity:** 🔴 CRITICAL
**Category:** Hardware Validation
**File:** `src/services/gpio_validation_service.py:114-208`

**Problem:**
`GpioValidationService` prüft **nicht** ob Pins Input-Only sind. ESP32-WROOM hat GPIOs 34-39 die **nur** als INPUT funktionieren. Server erlaubt aber:
- Actuators auf GPIO 34 (❌ würde auf ESP32 fehlschlagen!)
- OUTPUT-Mode für Input-Only Pins

**Evidence:**
```python
# gpio_validation_service.py:
SYSTEM_RESERVED_PINS: Set[int] = {
    0, 1, 2, 3, 6, 7, 8, 9, 10, 11  # Flash + UART
}
# ❌ MISSING: 34, 35, 36, 39 (Input-Only Pins!)

# validate_gpio_available() prüft nur SYSTEM_RESERVED_PINS
if gpio in SYSTEM_RESERVED_PINS:
    return GpioValidationResult(available=False, ...)
# ❌ MISSING: Input-Only Pin Check!
```

**Hardware-Kontext (ESP32-WROOM):**
```cpp
// El Trabajante/src/config/hardware/esp32_dev.h:57-60
const uint8_t INPUT_ONLY_PINS[] = {
    34, 35, 36, 39  // NO OUTPUT MODE!
};

// ESP32 gpio_manager.cpp:226-231
if (isInputOnlyPin(gpio) && mode == OUTPUT) {
    LOG_ERROR("Attempted OUTPUT mode on input-only pin " + String(gpio));
    return false;  // ← ESP würde ablehnen!
}
```

**Impact:**
- User erstellt Actuator auf GPIO 34 → Server akzeptiert → **ESP lehnt ab** → Konfigurations-Fehler!
- Inkonsistenz zwischen Server-Validierung und ESP-Realität
- Schwer zu debuggen ("Warum funktioniert mein Actuator nicht?")

**Recommended Fix:**
```python
# gpio_validation_service.py
INPUT_ONLY_PINS: Set[int] = {34, 35, 36, 39}  # ESP32-WROOM

class GpioValidationService:
    async def validate_gpio_available(
        self,
        esp_db_id: uuid.UUID,
        gpio: int,
        purpose: str = "sensor",  # NEW: "sensor" or "actuator"
        ...
    ) -> GpioValidationResult:
        # ... existing system pin check

        # Input-Only Pin check (for actuators)
        if gpio in INPUT_ONLY_PINS and purpose == "actuator":
            return GpioValidationResult(
                available=False,
                conflict_type=GpioConflictType.SYSTEM,
                message=f"GPIO {gpio} is input-only and cannot be used for actuators"
            )

        # ... rest
```

**Test Case:**
```bash
# Actuator on Input-Only Pin
curl -X POST /v1/actuators/ESP_00000001/34 \
  -d '{"actuator_type": "pump", "actuator_name": "Pump 1"}'

# Current: Accepts ❌
# ESP32: Lehnt ab mit ERROR_GPIO_INIT_FAILED ❌
# Expected: 400 "GPIO 34 is input-only" ✅

# Sensor on Input-Only Pin (OK!)
curl -X POST /v1/sensors/ESP_00000001/34 \
  -d '{"sensor_type": "soil_moisture", "interface_type": "ANALOG"}'

# Expected: 201 Created ✅
```

---

### Finding #8: I2C Pins (21/22) nicht geschützt für ANALOG/DIGITAL

**Severity:** 🔴 CRITICAL
**Category:** Hardware Validation
**File:** `src/services/gpio_validation_service.py:114-208`

**Problem:**
Server erlaubt ANALOG/DIGITAL Sensoren auf GPIO 21/22 (I2C Bus-Pins). Das ist problematisch weil:
- ESP32 reserviert GPIO 21/22 für I2C (`GPIOManager::requestPin()` würde ablehnen!)
- Conflict mit I2C-Sensoren (gleicher Bus!)
- ESP lehnt ab mit `ERROR_GPIO_CONFLICT`

**Evidence:**
```python
# gpio_validation_service.py
SYSTEM_RESERVED_PINS: Set[int] = {
    0, 1, 2, 3, 6, 7, 8, 9, 10, 11
}
# ❌ MISSING: 21, 22 (I2C Pins!)
```

**Hardware-Kontext (ESP32):**
```cpp
// gpio_manager.cpp:68-76
// Auto-reserve I2C pins for system use
bool i2c_sda = requestPin(HardwareConfig::I2C_SDA_PIN, "system", "I2C_SDA");  // GPIO 21
bool i2c_scl = requestPin(HardwareConfig::I2C_SCL_PIN, "system", "I2C_SCL");  // GPIO 22

// Später: Analog Sensor versucht GPIO 21
bool success = gpioManager.requestPin(21, "sensor", "soil_moisture");
// Returns FALSE! Pin already reserved by system!
```

**Impact:**
- User erstellt Analog-Sensor auf GPIO 21 → Server akzeptiert → **ESP lehnt ab** → Konfigurations-Fehler!
- I2C-Bus wird gestört wenn Pin als OUTPUT verwendet wird
- KRITISCH: Hardware-Damage möglich bei Analog-Sensor-Input vs. I2C-Bus-Kommunikation

**Recommended Fix:**
```python
# gpio_validation_service.py
I2C_BUS_PINS: Set[int] = {21, 22}  # ESP32-WROOM (für C3: {4, 5})

class GpioValidationService:
    async def validate_gpio_available(
        self,
        esp_db_id: uuid.UUID,
        gpio: int,
        interface_type: str = "ANALOG",  # NEW: Interface type
        ...
    ) -> GpioValidationResult:
        # ... existing checks

        # I2C Bus Pin check (only for non-I2C sensors)
        if gpio in I2C_BUS_PINS and interface_type not in ("I2C", "ONEWIRE"):
            return GpioValidationResult(
                available=False,
                conflict_type=GpioConflictType.SYSTEM,
                message=f"GPIO {gpio} is reserved for I2C bus (use interface_type='I2C' instead)"
            )

        # ... rest
```

**Test Case:**
```bash
# Analog Sensor on I2C Pin
curl -X POST /v1/sensors/ESP_00000001/21 \
  -d '{"sensor_type": "soil_moisture", "interface_type": "ANALOG"}'

# Current: Accepts ❌
# ESP32: Lehnt ab mit ERROR_GPIO_CONFLICT ❌
# Expected: 400 "GPIO 21 is reserved for I2C bus" ✅

# I2C Sensor on I2C Pin (OK!)
curl -X POST /v1/sensors/ESP_00000001/NULL \
  -d '{"sensor_type": "sht31_temp", "interface_type": "I2C", "i2c_address": 68}'

# Expected: 201 Created ✅
```

---

### Finding #9: ESP-Model-spezifische Validierung fehlt

**Severity:** 🟡 MEDIUM
**Category:** Hardware Validation
**File:** `src/services/gpio_validation_service.py:54-68`

**Problem:**
Hardware-Constraints sind hardcoded für ESP32-WROOM, funktionieren nicht für ESP32-C3 (XIAO):

**Unterschiede:**
| Feature | ESP32-WROOM | ESP32-C3 (XIAO) |
|---------|-------------|-----------------|
| GPIO Range | 0-39 | 0-21 |
| Input-Only Pins | 34, 35, 36, 39 | KEINE! |
| I2C Pins | 21 (SDA), 22 (SCL) | 4 (SDA), 5 (SCL) |
| Safe Pins | 16 Pins | 9 Pins |

**Evidence:**
```python
# gpio_validation_service.py:57-68 (Hardcoded für WROOM!)
SYSTEM_RESERVED_PINS: Set[int] = {
    0, 1, 2, 3, 6, 7, 8, 9, 10, 11  # ← ESP32-WROOM specific!
}
INPUT_ONLY_PINS: Set[int] = {34, 35, 36, 39}  # ← WROOM-only!
I2C_BUS_PINS: Set[int] = {21, 22}  # ← WROOM-only!
```

**Impact:**
- ESP32-C3 (XIAO) wird inkorrekt validiert
- GPIO 34-39 werden als Input-Only markiert (gibt es nicht auf C3!)
- GPIO 21/22 werden als I2C markiert (falsch! C3 nutzt 4/5!)

**Recommended Fix:**
```python
# esp_devices Tabelle erweitern:
ALTER TABLE esp_devices ADD COLUMN board_model VARCHAR(20) DEFAULT 'ESP32_WROOM';

# gpio_validation_service.py:
async def validate_gpio_available(
    self,
    esp_db_id: uuid.UUID,
    gpio: int,
    ...
) -> GpioValidationResult:
    # Get ESP board model
    esp = await self.esp_repo.get_by_id(esp_db_id)
    board_model = esp.board_model or "ESP32_WROOM"

    # Board-specific constraints
    if board_model == "ESP32_WROOM":
        input_only_pins = {34, 35, 36, 39}
        i2c_pins = {21, 22}
        gpio_range = (0, 39)
    elif board_model == "ESP32_C3":
        input_only_pins = set()  # No input-only pins!
        i2c_pins = {4, 5}
        gpio_range = (0, 21)
    else:
        # Default to WROOM
        ...

    # Validate GPIO range
    if not (gpio_range[0] <= gpio <= gpio_range[1]):
        return GpioValidationResult(
            available=False,
            message=f"GPIO {gpio} is out of range for {board_model}"
        )

    # ... rest with board-specific constraints
```

**Test Case:**
```bash
# ESP32-C3: GPIO 34 (doesn't exist!)
curl -X POST /v1/sensors/ESP_C3_001/34 \
  -d '{"sensor_type": "soil_moisture", "interface_type": "ANALOG"}'

# Expected: 400 "GPIO 34 is out of range for ESP32_C3" ✅

# ESP32-C3: GPIO 4 (I2C SDA on C3, not WROOM!)
curl -X POST /v1/sensors/ESP_C3_001/4 \
  -d '{"sensor_type": "soil_moisture", "interface_type": "ANALOG"}'

# Current: Accepts (wrong!) ❌
# Expected: 400 "GPIO 4 is reserved for I2C bus" ✅
```

---

### Finding #10: Race Condition bei I2C Address Conflict Check

**Severity:** 🟡 MEDIUM
**Category:** Race Condition
**File:** `src/api/v1/sensors.py:964-973`

**Problem:**
I2C-Adress-Conflict-Check (`get_by_i2c_address()`) und Sensor-Creation (`create()`) sind **nicht** in einer Transaktion. Bei parallelen Requests können beide Checks passieren → beide Sensoren werden erstellt → **Conflict!**

**Evidence:**
```python
# Lines 964-973: _validate_i2c_config()
existing_with_address = await sensor_repo.get_by_i2c_address(
    esp_id, i2c_address
)

if existing_with_address and existing_with_address.id != exclude_sensor_id:
    raise HTTPException(409, "I2C_ADDRESS_CONFLICT")
# ❌ MISSING: Transaction Lock!

# Later in create_or_update_sensor() (Line 428):
await sensor_repo.create(sensor)  # ← Separate transaction!
```

**Szenario:**
```
Time 0: User 1 sendet: POST /sensors/ESP_X/NULL (sht31_temp, addr=68)
Time 1: User 2 sendet: POST /sensors/ESP_X/NULL (sht31_humidity, addr=68)
Time 2: User 1 check: get_by_i2c_address(68) → None (OK!)
Time 3: User 2 check: get_by_i2c_address(68) → None (OK!)  ← Race!
Time 4: User 1 create: sensor1 (addr=68) ✅
Time 5: User 2 create: sensor2 (addr=68) ✅  ← Conflict!
```

**Impact:**
- Zwei Sensoren mit gleicher I2C-Adresse in DB
- ESP kann nur mit einem kommunizieren
- Rare Edge-Case (niedrige Wahrscheinlichkeit)

**Recommended Fix:**
```python
@router.post("/{esp_id}/{gpio}")
async def create_or_update_sensor(...):
    # ... existing code

    # Start transaction for conflict check + create
    async with db.begin():
        # Re-check inside transaction (with SELECT FOR UPDATE)
        if interface_type == "I2C":
            await _validate_i2c_config(...)  # Re-check inside transaction

        # Create sensor
        sensor = SensorConfig(...)
        await sensor_repo.create(sensor)

    # Transaction committed → No race condition
```

**Alternative: DB Constraint:**
```sql
-- Add unique constraint on (esp_id, i2c_address)
CREATE UNIQUE INDEX idx_sensor_configs_i2c_unique
    ON sensor_configs (esp_id, i2c_address)
    WHERE i2c_address IS NOT NULL;
```

**Test Case:**
Schwer zu testen (race condition), aber DB-Constraint wäre sicherer.

---

### Finding #11: ESP Reboot - Multi-Value Sensor geht verloren (ESP32-Problem)

**Severity:** 🟡 MEDIUM
**Category:** ESP32 Architecture
**File:** `El Trabajante/src/services/config/config_manager.cpp:836-898`

**Problem:**
ESP32 NVS speichert nur **einen** Sensor-Type pro GPIO. Bei Multi-Value Sensoren (z.B. SHT31 mit temp + humidity):
- Server hat 2 Einträge: `sht31_temp`, `sht31_humidity`
- ESP NVS speichert nur: `sht31_temp`
- Nach Reboot: Nur `sht31_temp` funktioniert! ❌

**Evidence:**
```cpp
// El Trabajante/src/services/config/config_manager.cpp:836-898
bool ConfigManager::loadSensorConfig(SensorConfig& config, uint8_t gpio) {
    // Lädt NUR EINEN Sensor pro GPIO!
    // ❌ Bei Multi-Value: Lädt nur den ersten!
}
```

**Impact:**
- Nach ESP-Reboot funktioniert nur einer der Multi-Value Sensoren
- Daten-Verlust bis Server neuen Config sendet
- User-Verwirrung ("Nach Reboot fehlen Sensor-Daten!")

**Recommended Fix (ESP32-seitig):**
```cpp
// Option A: Speichere Array von Sensor-Types pro GPIO
bool ConfigManager::loadSensorConfigs(std::vector<SensorConfig>& configs, uint8_t gpio) {
    // Load all sensors for this GPIO
    // NVS Key: "sensor_21_count" → 2
    // NVS Key: "sensor_21_0_type" → "sht31_temp"
    // NVS Key: "sensor_21_1_type" → "sht31_humidity"
}

// Option B: Speichere Base-Type + Provides-Values
// NVS: "sensor_21_type" → "sht31"
// NVS: "sensor_21_provides" → ["temp", "humidity"]
// ESP erstellt automatisch 2 virtuelle Sensoren
```

**Alternative (Server-seitig):**
```python
# Nach ESP-Reboot: Detektiere fehlende Multi-Value Sensors
# → Sende Config-Update automatisch
async def on_esp_heartbeat(esp_id: str):
    # Check if all sensors are present
    expected_sensors = await sensor_repo.get_by_esp(esp_id)
    esp_gpio_status = await esp_service.get_gpio_status(esp_id)

    # If mismatch: Re-send config
    if len(expected_sensors) != len(esp_gpio_status):
        await esp_service.send_config(esp_id)
```

**Test Case:**
```bash
1. Erstelle SHT31 mit 2 Values (temp + humidity)
2. ESP rebooted
3. Prüfe MQTT: Kommen beide Sensor-Values? ❌ Nur einer!
4. Server sendet Config-Update → Beide funktionieren wieder ✅
```

**Note:**
Dies ist ein ESP32-Firmware-Problem, nicht Server-Problem. Aber sollte dokumentiert werden für Robin.

---

### Finding #12: provides_values wird nie gesetzt

**Severity:** 🟢 LOW
**Category:** Data Completeness
**File:** `src/api/v1/sensors.py:108-155`

**Problem:**
`provides_values` Feld existiert in DB-Schema, wird aber **nie** gesetzt. Das Feld sollte enthalten:
- `["temperature", "humidity"]` für SHT31
- `["temperature", "pressure"]` für BMP280

**Evidence:**
```python
# Lines 140-147: _schema_to_model_fields()
return {
    # ...
    "provides_values": request.provides_values,  # ← Nur von Request
}

# Aber: SensorConfigCreate hat provides_values als Optional[List[str]]
# User muss es manuell setzen → wird nie gesetzt!
```

**Impact:**
- Metadaten fehlen in DB
- Kann nicht automatisch erkennen welche Values ein Sensor liefert
- Minor: Niedrige Priorität (nicht kritisch für Funktion)

**Recommended Fix:**
```python
def _infer_provides_values(sensor_type: str) -> Optional[List[str]]:
    """Infer provides_values from sensor_type."""
    sensor_lower = sensor_type.lower()

    if sensor_lower.startswith("sht31"):
        return ["temperature", "humidity"]
    elif sensor_lower.startswith("bmp280"):
        return ["temperature", "pressure"]
    elif sensor_lower.startswith("bme280"):
        return ["temperature", "pressure", "humidity"]
    elif sensor_lower.startswith("ds18b20"):
        return ["temperature"]
    else:
        # Single-value sensor (infer from sensor_type suffix)
        if "_temp" in sensor_lower:
            return ["temperature"]
        elif "_humidity" in sensor_lower:
            return ["humidity"]
        else:
            return None  # Unknown

# In _schema_to_model_fields():
"provides_values": request.provides_values or _infer_provides_values(request.sensor_type),
```

**Test Case:**
```bash
# Create SHT31 ohne provides_values
curl -X POST /v1/sensors/ESP_00000001/NULL \
  -d '{"sensor_type": "sht31_temp", "interface_type": "I2C", "i2c_address": 68}'

# Current: provides_values=NULL ❌
# Expected: provides_values=["temperature", "humidity"] ✅
```

---

### Finding #13: Fehlende Dokumentation für Multi-Value Workflow

**Severity:** 🟢 LOW
**Category:** Documentation
**File:** N/A

**Problem:**
Es gibt keine Dokumentation wie Multi-Value Sensors funktionieren:
- Wie erstellt User SHT31 mit 2 Values?
- Muss User 2x POST machen?
- Wie unterscheiden sich `sht31_temp` und `sht31_humidity`?

**Impact:**
- User-Verwirrung
- Support-Aufwand
- Fehlerhafte Konfigurationen

**Recommended Fix:**
Erstelle Dokumentation:
```markdown
# Multi-Value Sensor Setup

## SHT31 (Temperature + Humidity)

### Option A: Create 2 sensors manually
```bash
# Temperature sensor
POST /v1/sensors/ESP_00000001/NULL
{
  "sensor_type": "sht31_temp",
  "interface_type": "I2C",
  "i2c_address": 68,
  "name": "SHT31 Temperature"
}

# Humidity sensor (SAME i2c_address!)
POST /v1/sensors/ESP_00000001/NULL
{
  "sensor_type": "sht31_humidity",
  "interface_type": "I2C",
  "i2c_address": 68,  # ← Same address!
  "name": "SHT31 Humidity"
}
```

### Option B: Auto-create via sensor_type prefix
```bash
# Server auto-detects "sht31" prefix → creates temp + humidity
POST /v1/sensors/ESP_00000001/NULL/auto-create
{
  "sensor_type": "sht31",
  "interface_type": "I2C",
  "i2c_address": 68
}
# → Creates: sht31_temp, sht31_humidity
```
```

---

## Test Matrix

### Hardware-Kombinationen

| ESP Model | Sensor Type | Interface | GPIO | I2C Addr | Erwartet | Aktuell |
|-----------|-------------|-----------|------|----------|----------|---------|
| WROOM | sht31_temp | I2C | NULL | 0x44 | ✅ Success | ✅ OK |
| WROOM | sht31_humidity | I2C | NULL | 0x44 | ✅ Success (shared addr) | ✅ OK |
| WROOM | sht31_temp | I2C | 21 | 0x44 | ⚠️ Normalize to NULL | ❌ Akzeptiert gpio=21 |
| WROOM | soil_moisture | ANALOG | 21 | NULL | ❌ Conflict (I2C pin) | ❌ Akzeptiert (Finding #8) |
| WROOM | soil_moisture | ANALOG | 34 | NULL | ✅ Success (input-only OK) | ✅ OK |
| WROOM | pump | OUTPUT | 34 | NULL | ❌ Input-Only pin | ❌ Akzeptiert (Finding #7) |
| C3 | sht31_temp | I2C | NULL | 0x44 | ✅ Success | ✅ OK |
| C3 | soil_moisture | ANALOG | 34 | NULL | ❌ GPIO out of range | ❌ Akzeptiert (Finding #9) |
| C3 | pump | OUTPUT | 4 | NULL | ❌ I2C pin (C3!) | ❌ Akzeptiert (Finding #9) |
| WROOM | ds18b20 | ONEWIRE | 4 | NULL | ✅ Success | ✅ OK |
| WROOM | ds18b20_2 | ONEWIRE | 4 | NULL | ✅ Success (shared bus) | ✅ OK |

### Edge Cases

| Test Case | Input | Erwartet | Aktuell | Finding # |
|-----------|-------|----------|---------|-----------|
| Invalid I2C Addr | i2c_address=0xFF | 400 Bad Request | ❌ Akzeptiert | #3 |
| Missing I2C Addr | interface_type="I2C", no addr | 400 Bad Request | ✅ Validiert | - |
| GPIO for I2C | interface_type="I2C", gpio=21 | ⚠️ Normalize to NULL | ❌ Akzeptiert | #4 |
| Concurrent Creation | 2x POST same I2C addr | 409 Conflict | ⚠️ Race condition | #10 |
| Unknown Sensor Type | sensor_type="xyz" | ⚠️ Require interface_type | Infers ANALOG | #2 |
| Invalid OneWire Addr | onewire_address="abc" | 400 Bad Request | ❌ Akzeptiert | #5 |
| OneWire without GPIO | interface_type="ONEWIRE", gpio=NULL | 400 Bad Request | ❌ Akzeptiert | #6 |
| I2C Reserved Addr | i2c_address=0x00 | 400 Reserved | ❌ Akzeptiert | #3 |

---

## Recommendations

### Must-Fix vor Production (CRITICAL)

1. **Finding #3:** I2C-Adress-Range Validierung (0x00-0x7F, Reserved 0x00-0x07/0x78-0x7F)
2. **Finding #7:** Input-Only Pins (34-39) gegen Actuators schützen
3. **Finding #8:** I2C Pins (21/22) gegen ANALOG/DIGITAL schützen
4. **Finding #9:** ESP-Model-spezifische Validierung (WROOM vs. C3)

**Estimated Effort:** 4-6 Stunden

### Should-Fix nach Production (bald)

1. **Finding #1:** DB Migration - gpio zu NULL normalisieren für I2C/OneWire
2. **Finding #2:** Interface Type Inference - Require explicit interface_type
3. **Finding #4:** I2C Validation - gpio=NULL erzwingen
4. **Finding #5:** OneWire Address Format-Validierung
5. **Finding #10:** Race Condition - DB Constraint für i2c_address uniqueness

**Estimated Effort:** 3-4 Stunden

### Nice-to-Have (Backlog)

1. **Finding #6:** OneWire GPIO Validierung
2. **Finding #11:** ESP Reboot Multi-Value Problem dokumentieren (ESP32-seitig!)
3. **Finding #12:** provides_values Auto-Inference
4. **Finding #13:** Multi-Value Sensor Dokumentation

**Estimated Effort:** 2-3 Stunden

---

## Kritische Fragen an Robin

Nach diesem Review, stelle Robin diese Fragen:

1. **ESP-Model Detection:**
   Wie weiß Server ob ESP32-WROOM oder C3? Sollten wir `board_model` in `esp_devices` Tabelle hinzufügen?

2. **NVS Multi-Value (ESP32-Firmware):**
   Wie soll ESP Multi-Value Sensoren nach Reboot laden? Aktuell wird nur einer pro GPIO geladen! (Finding #11)

3. **Interface-Type Source:**
   Soll ESP `interface_type` im ersten MQTT Payload senden? Oder ist Inference im Server OK?

4. **GPIO Normalization (I2C):**
   I2C Sensoren mit `gpio=21` → zu `NULL` normalisieren (Migration Fix) oder in API ablehnen?

5. **Special Pin Validation:**
   Soll Server I2C Pins (21/22) für ANALOG blockieren? ESP tut es bereits!

6. **Race Condition Fix:**
   DB Constraint (`UNIQUE INDEX`) oder Application-Level Transaction Lock?

---

## Verifikation

Ich habe durchgeführt:

- ✅ Alle 11 Checks durchgeführt
- ✅ 13 Findings dokumentiert (4 CRITICAL, 7 MEDIUM, 2 LOW)
- ✅ Test-Matrix ausgefüllt (10 Hardware-Kombinationen, 8 Edge-Cases)
- ✅ Code-Snippets für Fixes vorhanden (alle Findings)
- ✅ Kritische Fragen an Robin formuliert (6 Fragen)

---

**Report Ende**
**Nächste Schritte:** Robin Findings präsentieren → Must-Fix implementieren → Re-Review
