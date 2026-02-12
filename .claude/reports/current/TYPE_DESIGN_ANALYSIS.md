# Type Design Quality Analysis

**PR Branch:** `feature/frontend-consolidation` vs `master`
**Date:** 2026-02-12
**Scope:** 891 files changed, covering C++ HAL interfaces, TypeScript types, Pydantic schemas, SQLAlchemy models, and shared store types

---

## Executive Summary

The PR introduces a significant consolidation of frontend components and a new Hardware Abstraction Layer (HAL) for GPIO on the ESP32 side. Overall, the type design quality is **solid** with strong points in the Pydantic schema layer and the C++ HAL interface design. The primary concerns are pervasive `any` usage in shared store WebSocket handlers and inconsistent type representations between the Python and TypeScript layers.

**Overall Ratings:**
- Type Safety: 7/10
- Invariant Expression: 7/10
- Interface Design: 8/10
- Cross-Layer Consistency: 6/10
- Encapsulation: 7/10

---

## 1. C++ HAL Interface (IGPIO_HAL, ESP32GPIOHal, MockGPIOHal)

### Files
- `El Trabajante/src/drivers/hal/igpio_hal.h`
- `El Trabajante/src/drivers/hal/esp32_gpio_hal.h`
- `El Trabajante/test/mocks/mock_gpio_hal.h`

### Invariants Identified
- GPIO pin numbers are `uint8_t` (0-255), but ESP32 valid range is 0-39
- `GPIOMode` enum uses explicit `uint8_t` backing values matching Arduino constants
- Pin reservation is exclusive (one owner per pin)
- Hardware-reserved pins cannot be requested
- Safe mode = INPUT_PULLUP for all non-reserved pins
- `initializeAllPinsToSafeMode()` must be called before any pin operations

### Ratings

- **Encapsulation**: 8/10
  The pure virtual interface provides clean abstraction. Production delegates to GPIOManager for state, mock tracks state independently. Private members are properly hidden in MockGPIOHal.

- **Invariant Expression**: 6/10
  The `GPIOMode` enum is well-designed with explicit values and scoped enum class. However, GPIO pin range (0-39) is NOT enforced at the type level -- any `uint8_t` (0-255) is accepted. The 40-pin limit is only expressed through documentation and loop bounds in MockGPIOHal.

- **Invariant Usefulness**: 8/10
  The safety-first invariants (safe mode, pin reservation, emergency shutdown) are genuinely protective against real hardware damage scenarios. The `enableSafeModeForAllPins()` emergency function is critical.

- **Invariant Enforcement**: 5/10
  The interface declares methods but cannot enforce calling order. Nothing prevents using `digitalWrite()` before `requestPin()`. The production `ESP32GPIOHal::requestPin()` is a NO-OP that always returns true, meaning the HAL itself does NOT enforce the pin reservation invariant.

### Findings

**[Critical] ESP32GPIOHal::requestPin() is a no-op that always returns true**

File: `El Trabajante/src/drivers/hal/esp32_gpio_hal.h:39-42`
```cpp
bool requestPin(uint8_t gpio, const String& owner, const String& component_name) override {
    (void)gpio; (void)owner; (void)component_name;
    return true;  // Always succeeds
}
```

The comment says "GPIOManager handles all pin tracking internally" but the interface contract states `requestPin()` returns false if "already in use or invalid." Any code that relies on the HAL interface's return value for pin safety will get silently wrong results in production. This creates an asymmetry where tests (MockGPIOHal) enforce the invariant but production (ESP32GPIOHal) does not.

**[Important] No GPIO range validation at type level**

The `uint8_t gpio` parameter accepts 0-255, but ESP32 only has pins 0-39 (ESP32-C3 up to 21). Neither the interface nor the production implementation validates the pin range. The mock hardcodes 40 as the limit in loops, but this is a magic number.

**[Suggestion] Consider a `GpioPin` value type**

A thin wrapper around `uint8_t` that validates range at construction time would make illegal pin numbers unrepresentable:
```cpp
class GpioPin {
    uint8_t value_;
public:
    explicit GpioPin(uint8_t pin) : value_(pin) {
        assert(pin <= MAX_GPIO_PIN);  // or compile-time for known pins
    }
    uint8_t value() const { return value_; }
};
```

---

## 2. GPIOMode Enum

### File
- `El Trabajante/src/drivers/hal/igpio_hal.h:27-32`

### Ratings

- **Encapsulation**: 9/10
  Scoped `enum class` with explicit `uint8_t` backing type prevents implicit conversions.

- **Invariant Expression**: 7/10
  Values deliberately mirror Arduino constants. The renaming from INPUT/OUTPUT to avoid macro conflicts is documented. However, the specific hex values (0x01, 0x02, 0x05, 0x09) encode a non-contiguous sequence that could surprise readers.

- **Invariant Usefulness**: 8/10
  Prevents accidentally passing raw Arduino constants where a GPIOMode is expected.

- **Invariant Enforcement**: 8/10
  The `switch` in `ESP32GPIOHal::pinMode()` has a `default: return false` clause, properly handling unexpected values.

### Findings

**[Suggestion] Add `GPIO_INPUT_PULLDOWN` to ESP32GPIOHal::pinMode()**

The enum declares `GPIO_INPUT_PULLDOWN = 0x09` and the production switch correctly handles it with `INPUT_PULLDOWN`, which is good. No issue here.

---

## 3. TypeScript Frontend Types (types/index.ts)

### Files
- `El Frontend/src/types/index.ts` (995 lines)
- `El Frontend/src/types/logic.ts`
- `El Frontend/src/types/websocket-events.ts`
- `El Frontend/src/types/form-schema.ts`

### Invariants Identified
- `MockSystemState` is a string literal union (12 states) encoding the ESP32 boot sequence
- `QualityLevel` is a string literal union (7 levels) shared across all sensor readings
- `MessageType` is a comprehensive string union (25+ event types) for WebSocket messages
- `MockESP.status` constrains to 5 values via string literal union
- `SensorOperatingMode` constrains to 4 values
- `OfflineReason` and `StatusSource` use narrow literal unions

### Ratings

- **Encapsulation**: 5/10
  All types are plain interfaces with no behavior -- pure DTOs. Every field is publicly accessible. There is no way to construct invalid instances because TypeScript interfaces have no constructors.

- **Invariant Expression**: 7/10
  Good use of string literal unions (`MockSystemState`, `QualityLevel`, `MessageType`) makes invalid states more visible. Discriminated unions on WebSocket events are well-structured. However, many fields use `string` where narrower literal types could be used (e.g., `config_status?: 'pending' | 'applied' | 'failed' | null` in `MockSensor` vs. `config_status?: string | null` in `SensorConfigResponse`).

- **Invariant Usefulness**: 7/10
  The string literal unions prevent genuine bugs by catching typos at compile time. The discriminated union pattern on WebSocket events with type guards is a strong pattern.

- **Invariant Enforcement**: 4/10
  TypeScript interfaces provide compile-time checks only. There is no runtime validation on data coming from the server via WebSocket or REST. Any malformed server message will silently bypass all type constraints.

### Findings

**[Critical] Duplicate type name `DeviceDiscoveredEvent` in two files**

File: `El Frontend/src/types/index.ts:96-105` defines `DeviceDiscoveredEvent` with fields `device_id`, `discovered_at`, etc.
File: `El Frontend/src/types/websocket-events.ts:117-131` defines a DIFFERENT `DeviceDiscoveredEvent` extending `WebSocketEventBase`.

Both are exported. The `index.ts` barrel re-exports from `websocket-events.ts`, which will shadow the locally-defined `DeviceDiscoveredEvent` from `index.ts`. Similarly for `DeviceApprovedEvent` and `DeviceRejectedEvent`. Code importing from `@/types` will get the WebSocket variant without realizing there is a simpler variant available.

**[Critical] `SensorConfigResponse.config_status` is `string | null` in TypeScript but constrained in Python**

File: `El Frontend/src/types/index.ts:626-628`
```typescript
config_status?: string | null  // Accepts ANY string
config_error?: string | null
config_error_detail?: string | null
```

The Python Pydantic schema at `El Servador/god_kaiser_server/src/schemas/sensor.py:331-342` has the same fields without pattern validation, but the SQLAlchemy model documents valid values as "pending, applied, failed". TypeScript should use `'pending' | 'applied' | 'failed' | null` to match.

**[Important] `SensorConfigResponse.processing_mode` is `string` in TypeScript vs pattern-validated in Python**

File: `El Frontend/src/types/index.ts:618`: `processing_mode: string`
File: `El Servador/god_kaiser_server/src/schemas/sensor.py:115-118`: `pattern=r"^(pi_enhanced|local|raw)$"`

TypeScript should use `'pi_enhanced' | 'local' | 'raw'`.

**[Important] `MockSensor` is a mega-interface with 20+ optional fields**

The `MockSensor` interface at `El Frontend/src/types/index.ts:234-267` has grown to include Phase 2E health fields, Phase 2F schedule config, Phase 6 multi-value fields, and config verification status. Many of these fields are optional, creating a large "bag of optionals" where it is unclear which combinations are valid.

**[Suggestion] Consider splitting `MockSensor` into composed types**

```typescript
interface SensorBase {
  gpio: number
  sensor_type: string
  name: string | null
  // ... core fields
}

interface SensorHealth {
  operating_mode?: SensorOperatingMode
  is_stale?: boolean
  stale_reason?: 'timeout_exceeded' | 'no_data' | 'sensor_error'
  // ... health fields
}

interface MultiValueSensor {
  device_type?: string | null
  multi_values?: Record<string, MultiValueEntry> | null
  is_multi_value?: boolean
}

type MockSensor = SensorBase & SensorHealth & MultiValueSensor & SensorConfig
```

---

## 4. WebSocket Event Types (websocket-events.ts)

### File
- `El Frontend/src/types/websocket-events.ts` (771 lines)

### Ratings

- **Encapsulation**: 6/10
  Events are pure data structures, which is appropriate for DTOs. The base interface enforces common structure.

- **Invariant Expression**: 9/10
  Excellent use of discriminated unions via the `event` field. Each event type narrows the `severity`, `source_type`, and `data` fields to their valid values. The `WebSocketEvent` union and `WebSocketEventType` extracted type are well-designed.

- **Invariant Usefulness**: 8/10
  Type guards (`isSensorDataEvent()`, etc.) enable safe runtime narrowing. The `UnifiedEvent` normalizer provides a single interface for the System Monitor.

- **Invariant Enforcement**: 7/10
  Type guards provide runtime discrimination. However, the `data` field on `WebSocketEventBase` is `Record<string, unknown>` which is the escape hatch. Each specific event re-types the `data` field, but the base type allows anything.

### Findings

**[Important] `WebSocketEventBase.data` is `Record<string, unknown>` -- a type-unsafe escape hatch**

File: `El Frontend/src/types/websocket-events.ts:32`
```typescript
data: Record<string, unknown>
```

All specialized events override this with properly typed `data` objects. But any code working with `WebSocketEventBase` directly bypasses type safety. Consider making the base generic: `data: T` and having each event instantiate it.

**[Suggestion] `event` field is typed as `string` on base, narrowed to literal on each subtype**

The base has `event: string` but each subtype narrows it (e.g., `event: 'sensor_data'`). This means discriminated union narrowing works on the union type `WebSocketEvent` but NOT if you have a `WebSocketEventBase`. Consider making the base generic on the event string.

---

## 5. Form Schema Types (form-schema.ts)

### File
- `El Frontend/src/types/form-schema.ts`
- `El Frontend/src/config/sensor-schemas.ts`

### Ratings

- **Encapsulation**: 7/10
  The schema is declarative and read-only by nature.

- **Invariant Expression**: 8/10
  `FieldType` is a clean 6-value string literal union. The `dependsOn` conditional visibility is well-typed with operator constraints. `FormSchema -> FormGroupSchema -> FormFieldSchema` hierarchy is clear.

- **Invariant Usefulness**: 8/10
  These types drive DynamicForm rendering and prevent invalid form configurations at compile time.

- **Invariant Enforcement**: 6/10
  There is no runtime validation that the schema is consistent (e.g., that `dependsOn.field` actually references an existing field key, or that `min < max` for number fields). The schemas in `sensor-schemas.ts` are trusted static constants.

### Findings

**[Suggestion] `dependsOn.value` is typed as `unknown`**

File: `El Frontend/src/types/form-schema.ts:44`
```typescript
value: unknown
```

This could be `string | number | boolean` to match the actual field value types and prevent passing objects or arrays.

---

## 6. Rule Template Types (rule-templates.ts)

### File
- `El Frontend/src/config/rule-templates.ts`

### Ratings

- **Encapsulation**: 7/10
  The `RuleTemplate` interface cleanly separates display concerns (icon, category) from rule data.

- **Invariant Expression**: 8/10
  `Omit<LogicRule, 'id' | 'created_at' | 'updated_at' | 'last_triggered'>` elegantly expresses that templates are rules without system-generated fields. The `category` field is a 4-value literal union.

- **Invariant Usefulness**: 7/10
  Templates serve as factory patterns for rule creation. The type ensures templates cannot accidentally include server-assigned fields.

- **Invariant Enforcement**: 5/10
  Template data contains empty strings for `esp_id` and `0` for `gpio` as placeholder values. These are technically valid but semantically meaningless. There is no type-level distinction between "user must fill this" and "this has a real value."

### Findings

**[Suggestion] Consider a `Placeholder<T>` branded type**

Empty `esp_id: ''` and `gpio: 0` are placeholders that users must fill. A branded type would make this explicit:
```typescript
type Unfilled = ''
rule: { esp_id: string | Unfilled, ... }
```
This is low priority since templates are static config.

---

## 7. Logic Types (logic.ts)

### File
- `El Frontend/src/types/logic.ts`

### Ratings

- **Encapsulation**: 7/10
  Clean separation of conditions, actions, and connections.

- **Invariant Expression**: 9/10
  Excellent discriminated union design. `LogicCondition = SensorCondition | TimeCondition | CompoundCondition` with `type` discriminant. `LogicAction = ActuatorAction | NotificationAction | DelayAction` follows the same pattern. `CompoundCondition` supports recursive nesting.

- **Invariant Usefulness**: 9/10
  The type structure directly encodes the business rule engine's semantics. Cross-ESP connections are explicitly flagged via `isCrossEsp: boolean`.

- **Invariant Enforcement**: 7/10
  The recursive `extractSensorConditions()` function correctly handles the compound condition tree. Type narrowing via discriminant is used properly throughout.

### Findings

**[Suggestion] `SensorCondition.operator` 'between' requires min/max but these are optional**

File: `El Frontend/src/types/logic.ts:39-42`
```typescript
operator: '>' | '>=' | '<' | '<=' | '==' | '!=' | 'between'
value: number
min?: number  // For 'between' operator
max?: number  // For 'between' operator
```

When `operator === 'between'`, `min` and `max` are required but the type marks them optional. This could be a discriminated union:
```typescript
type SensorCondition = SimpleSensorCondition | BetweenSensorCondition
```

---

## 8. Shared Store Types (sensor.store.ts, actuator.store.ts, zone.store.ts)

### Files
- `El Frontend/src/shared/stores/sensor.store.ts`
- `El Frontend/src/shared/stores/actuator.store.ts`
- `El Frontend/src/shared/stores/zone.store.ts`

### Ratings

- **Encapsulation**: 7/10
  Stores expose only handler functions via return statement. Internal helpers are properly hidden.

- **Invariant Expression**: 4/10
  Handler parameters are heavily typed as `any` or `{ data: Record<string, unknown> }`. The actual WebSocket event structure is not leveraged.

- **Invariant Usefulness**: 5/10
  Stores handle data defensively with null checks, but without type safety, the checks must be exhaustive and manual.

- **Invariant Enforcement**: 3/10
  All WebSocket message handlers accept `message: any`, then cast fields with `as string`, `as number`, etc. This is the weakest type safety in the entire codebase.

### Findings

**[Critical] 11 instances of `any` in shared store handlers**

Files and locations:
- `sensor.store.ts:66` -- `handleSensorData(message: any, ...)`
- `sensor.store.ts:108` -- `handleKnownMultiValueSensor(sensors, data: any, ...)`
- `sensor.store.ts:164` -- `handleDynamicMultiValueSensor(existingSensor, data: any)`
- `sensor.store.ts:198` -- `handleSingleValueSensorData(sensors, data: any)`
- `sensor.store.ts:223` -- `handleSensorHealth(message: any, ...)`
- `actuator.store.ts:91` -- `handleActuatorStatus(message: any, ...)`
- `actuator.store.ts:104` -- `(device.actuators as any[]).find(...)`
- `zone.store.ts:57` -- `handleZoneAssignment(message: any, ...)`
- `zone.store.ts:124` -- `handleSubzoneAssignment(message: any, ...)`
- `config.store.ts:35` -- (similar pattern)

Every `any` is a point where TypeScript type checking is disabled. The well-defined `WebSocketEvent` discriminated union from `websocket-events.ts` is never used in store handlers.

**[Important] Unsafe type assertions without validation**

File: `El Frontend/src/shared/stores/actuator.store.ts:40-43`
```typescript
const espId = data.esp_id as string || data.device_id as string
const gpio = data.gpio as number | undefined
const alertType = data.alert_type as string
```

These `as` casts will not fail at runtime -- they will silently produce wrong types if the server sends unexpected data. This defeats the purpose of TypeScript.

**[Important] Recommendation: Create typed WebSocket message interfaces for store handlers**

```typescript
interface WebSocketMessage<T = Record<string, unknown>> {
  data: T
  type?: string
  timestamp?: string
}

interface SensorDataPayload {
  esp_id: string
  gpio: number
  sensor_type: string
  value: number
  unit: string
  quality: QualityLevel
  timestamp: number
}

function handleSensorData(
  message: WebSocketMessage<SensorDataPayload>,
  devices: ESPDevice[],
  getDeviceId: (d: ESPDevice) => string,
): void { ... }
```

---

## 9. DragState Store Types

### File
- `El Frontend/src/shared/stores/dragState.store.ts`

### Ratings

- **Encapsulation**: 9/10
  Strong separation of concerns. Safety timeout mechanism prevents stuck states. Statistics tracking enables debugging. Global event listeners have proper cleanup.

- **Invariant Expression**: 8/10
  Three distinct payload types (`SensorTypeDragPayload`, `SensorDragPayload`, `ActuatorTypeDragPayload`) with discriminant `action`/`type` fields. The `DRAG_TIMEOUT_MS` constant is properly named.

- **Invariant Usefulness**: 9/10
  The safety timeout invariant (30s max drag) prevents real UI bugs. The mutual exclusion (only one drag at a time) is enforced by `endDrag()` calls at the start of each new drag.

- **Invariant Enforcement**: 8/10
  Every `startXxxDrag()` method calls `endDrag()` first if a drag is active. The safety timeout provides a last-resort cleanup. Escape key handling provides user-controllable abort.

### Findings

No critical issues. This is one of the best-designed stores in the codebase.

---

## 10. GPIO Store Types

### File
- `El Frontend/src/shared/stores/gpio.store.ts`

### Ratings

- **Encapsulation**: 8/10
  Clean separation of GPIO status (from REST API) and OneWire scan state. Map-based state keyed by `espId` prevents cross-device contamination.

- **Invariant Expression**: 7/10
  `OneWireScanState` captures the full lifecycle of a scan operation. `GpioPinStatus` combines multiple data sources into a unified view.

- **Invariant Usefulness**: 8/10
  `isGpioAvailableForEsp()` defaults to `false` for unknown devices (safe default). The merge logic in `updateGpioStatusFromHeartbeat()` prioritizes DB data over ESP-reported data.

- **Invariant Enforcement**: 7/10
  Concurrent fetch prevention with `gpioStatusLoading` map. Default OneWire state initialization via `getOneWireScanState()`.

### Findings

**[Suggestion] `getSystemPinName()` uses a plain `Record<number, string>` -- could be a const enum or readonly map**

File: `El Frontend/src/shared/stores/gpio.store.ts:80-95`

The pin name mapping is a runtime object where a `const` assertion would prevent accidental mutation.

---

## 11. Pydantic Schemas (sensor.py, actuator.py, esp.py)

### Files
- `El Servador/god_kaiser_server/src/schemas/sensor.py`
- `El Servador/god_kaiser_server/src/schemas/actuator.py`
- `El Servador/god_kaiser_server/src/schemas/esp.py`

### Ratings

- **Encapsulation**: 8/10
  Clean base/create/update/response pattern. Base shares common fields, create adds request-specific fields, response adds server-generated fields.

- **Invariant Expression**: 9/10
  Extensive use of Pydantic `Field()` with `ge`, `le`, `min_length`, `max_length`, `pattern` constraints. GPIO ranges (0-39), interval ranges (1000-300000ms), and string patterns (ESP_XXXXXXXX) are encoded at the type level.

- **Invariant Usefulness**: 9/10
  The constraints directly prevent invalid hardware configurations (wrong GPIO range, impossible intervals). The `normalize_actuator_type()` function + `@field_validator` ensures ESP32 actuator types are automatically mapped to server types.

- **Invariant Enforcement**: 9/10
  Pydantic enforces all constraints at deserialization time. Invalid data raises `ValidationError` before it reaches business logic. The `model_validator` on `ActuatorCommand` ensures ON=1.0 and OFF=0.0 are always consistent.

### Findings

**[Important] `SensorConfigBase.validate_sensor_type()` accepts unknown types silently**

File: `El Servador/god_kaiser_server/src/schemas/sensor.py:77-85`
```python
@field_validator("sensor_type")
@classmethod
def validate_sensor_type(cls, v: str) -> str:
    v = v.lower().strip()
    if v not in SENSOR_TYPES:
        pass  # Allow custom types but warn -- NO WARNING IS ACTUALLY EMITTED
    return v
```

The comment says "warn" but there is no logging or warning. Unknown sensor types pass through silently. Either add a `logger.warning()` or remove the misleading comment.

**[Important] `SensorReading.validate_quality()` silently defaults to 'good' for unknown values**

File: `El Servador/god_kaiser_server/src/schemas/sensor.py:408-415`
```python
@field_validator("quality")
@classmethod
def validate_quality(cls, v: str) -> str:
    v = v.lower()
    if v not in QUALITY_LEVELS:
        v = "good"  # Default to good if unknown
    return v
```

Silently coercing an unknown quality to "good" could mask data integrity issues. An unknown quality should default to "error" or at least log a warning.

**[Suggestion] `GpioStatusItem.normalize_gpio_mode()` imports logging inside the method**

File: `El Servador/god_kaiser_server/src/schemas/esp.py:361-362`
```python
import logging
logger = logging.getLogger(__name__)
```

Module-level imports are standard Python practice. The inline import works but is unusual and incurs a small cost per call.

---

## 12. SQLAlchemy Models (esp.py, sensor.py)

### Files
- `El Servador/god_kaiser_server/src/db/models/esp.py`
- `El Servador/god_kaiser_server/src/db/models/sensor.py`

### Ratings

- **Encapsulation**: 7/10
  Models expose all columns directly (standard for SQLAlchemy). Properties like `is_online`, `max_sensors` provide derived state.

- **Invariant Expression**: 7/10
  `UniqueConstraint("esp_id", "gpio", "sensor_type", "onewire_address", "i2c_address")` in SensorConfig correctly encodes the multi-value sensor uniqueness invariant. Proper cascading deletes prevent orphaned records.

- **Invariant Usefulness**: 8/10
  The time-series indices on `SensorData` are well-designed for the query patterns. The `data_source` column enables test/mock data isolation.

- **Invariant Enforcement**: 6/10
  Database constraints (unique, not null, foreign key) enforce invariants at the persistence level. However, `status` is a plain `String(20)` with no check constraint -- any string up to 20 chars is valid at the DB level.

### Findings

**[Important] `ESPDevice.status` is an unconstrained String(20)**

File: `El Servador/god_kaiser_server/src/db/models/esp.py:137-143`
```python
status: Mapped[str] = mapped_column(
    String(20),
    default="offline",
    nullable=False,
    index=True,
    doc="Device status: online, offline, error, unknown, pending_approval, approved, rejected",
)
```

The doc string lists 7 valid values, but nothing enforces this at the DB level. A PostgreSQL `CHECK` constraint or SQLAlchemy `Enum` type would prevent invalid status values:
```python
from sqlalchemy import Enum
status: Mapped[str] = mapped_column(
    Enum('online', 'offline', 'error', 'unknown', 'pending_approval', 'approved', 'rejected', name='esp_status'),
    default="offline",
)
```

**[Important] `SensorConfig.gpio` is nullable but used as identifier**

File: `El Servador/god_kaiser_server/src/db/models/sensor.py:59-63`
```python
gpio: Mapped[Optional[int]] = mapped_column(
    Integer,
    nullable=True,
    doc="GPIO pin number (nullable for I2C/OneWire bus devices)",
)
```

GPIO is part of the unique constraint (`esp_id, gpio, sensor_type, onewire_address, i2c_address`) and is used as the primary identifier in WebSocket events. Making it nullable creates edge cases where `NULL` GPIO could be valid but would break the TypeScript frontend which expects `number`. The doc comment says "nullable for I2C/OneWire bus devices" but these still have physical pin numbers (21/22 for I2C).

---

## 13. Cross-Layer Consistency (Python <-> TypeScript)

### Findings

**[Critical] Quality level enum mismatch**

- Python (`schemas/sensor.py:49`): `QUALITY_LEVELS = ["excellent", "good", "fair", "poor", "bad", "stale", "error"]` -- 7 values
- TypeScript (`types/index.ts:205`): `type QualityLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'bad' | 'stale' | 'error'` -- 7 values (MATCH)
- SQLAlchemy model (`db/models/sensor.py:317`): `quality: Mapped[Optional[str]]` -- unconstrained string

Quality is consistent between Pydantic and TypeScript, but the validator silently coerces unknown values to "good" (see Finding 11), meaning the frontend could never see the actual invalid value.

**[Critical] ESP status values differ between layers**

- Python Pydantic (`schemas/esp.py:198-200`): `"online", "offline", "error", "unknown"` (4 values in doc, pattern constraint)
- SQLAlchemy model: `"online", "offline", "error", "unknown", "pending_approval", "approved", "rejected"` (7 values in doc)
- TypeScript `MockESP.status`: `'online' | 'offline' | 'pending_approval' | 'approved' | 'rejected'` (5 values)

The TypeScript type is MISSING `'error'` and `'unknown'` but has `'pending_approval'`, `'approved'`, and `'rejected'` which are in the model but not in the Pydantic filter schema. The Pydantic `ESPListFilter.status` pattern only allows 4 values, but the model stores 7.

**[Important] `SensorConfigResponse.id` type mismatch**

- Python Pydantic: `id: uuid.UUID` (UUID object)
- TypeScript: `id: string` (plain string)

The frontend receives the UUID as a string via JSON serialization, so `string` is technically correct at runtime. But it obscures the invariant that IDs are UUIDs. Consider a branded type: `type UUID = string & { readonly __uuid: unique symbol }`.

**[Important] `SensorConfigCreate.esp_id` type mismatch**

- Python Pydantic: `esp_id: str` with pattern `^(ESP_[A-F0-9]{6,8}|MOCK_[A-Z0-9]+)$`
- TypeScript: `esp_id: string` (no pattern constraint)

The frontend can send any string as `esp_id`. While the server will reject invalid values, the error only occurs after the API call. A runtime validator or branded type on the frontend would catch this earlier.

**[Important] Sensor type lists not shared**

- Python: `SENSOR_TYPES = ["ph", "temperature", "humidity", "ec", "moisture", "pressure", "co2", "light", "flow", "analog", "digital"]` (11 types)
- C++ `sensor_types.h`: No explicit type list (free-form string)
- TypeScript: No explicit type list (uses string, sensor types are defined in `sensor-schemas.ts` as object keys: DS18B20, SHT31, pH, soil_moisture)

The sensor type names differ: Python uses lowercase (`"ph"`, `"temperature"`), TypeScript uses mixed case (`"DS18B20"`, `"SHT31"`, `"pH"`). The sensor_type field flows from ESP32 through server to frontend, so case must be consistent. Python's validator lowercases input (`v.lower().strip()`), but TypeScript schemas use the original case.

---

## Summary of Findings by Severity

### Critical (5)

1. **ESP32GPIOHal::requestPin() is a no-op** -- production HAL does not enforce pin reservation
2. **Duplicate `DeviceDiscoveredEvent` type** in `index.ts` and `websocket-events.ts`
3. **`config_status` is `string | null`** in TypeScript where Python constrains to 3 values
4. **ESP status values differ** between Pydantic (4), SQLAlchemy model (7), and TypeScript (5)
5. **11 instances of `any` in shared store handlers** defeating TypeScript type safety

### Important (8)

1. No GPIO range validation at C++ type level
2. `WebSocketEventBase.data` is `Record<string, unknown>` escape hatch
3. `MockSensor` is a 20+ field mega-interface
4. Unsafe `as` type assertions in store handlers
5. `SensorConfigBase.validate_sensor_type()` silently accepts unknown types
6. `SensorReading.validate_quality()` silently coerces unknown to "good"
7. `ESPDevice.status` is unconstrained String(20) at DB level
8. Sensor type naming inconsistency between layers (lowercase vs mixed case)

### Suggestions (6)

1. Create `GpioPin` value type in C++ for range validation
2. Split `MockSensor` into composed types
3. Type `dependsOn.value` as `string | number | boolean` instead of `unknown`
4. Consider branded UUID type in TypeScript
5. Use `const` assertions for static pin name maps
6. Move inline `import logging` to module level in `GpioStatusItem`

---

## Recommended Priority Actions

1. **Replace `any` in store handlers** with proper WebSocket message types (Critical, high impact, moderate effort)
2. **Resolve duplicate event type names** by removing the simpler variants from `index.ts` or renaming them (Critical, low effort)
3. **Narrow `config_status` and `processing_mode`** to literal union types in TypeScript (Critical, low effort)
4. **Align ESP status values** across all three layers with a single source of truth (Critical, moderate effort)
5. **Add DB check constraint for `ESPDevice.status`** via Alembic migration (Important, low effort)
