# Multi-Value Sensor Pattern - Analyse-Report

**Datum:** 2026-01-09
**Analyst:** Claude (Senior IoT Full-Stack Engineer)
**Analysierte Dateien:** 18 Dateien, ~8.500 Zeilen
**Status:** 🔴 KRITISCHES PROBLEM GEFUNDEN

---

## 1. Executive Summary

Das Multi-Value Sensor Pattern ist in ESP32 und Frontend **korrekt implementiert**, aber der **Server DB Unique Constraint blockiert die Persistierung** von Multi-Value Sensoren. Der Constraint `(esp_id, gpio)` erlaubt nur EINEN Sensor pro GPIO, obwohl Multi-Value Sensoren wie SHT31 ZWEI separate Einträge benötigen (`sht31_temp` + `sht31_humidity`).

**Kritischer Fix erforderlich:** Der Unique Constraint in `sensor.py` muss auf `(esp_id, gpio, sensor_type)` geändert werden.

---

## 2. ESP32 Analyse (El Trabajante)

### 2.1 Multi-Value Sensor Implementation
**Dateien:**
- [sensor_registry.cpp](El%20Trabajante/src/models/sensor_registry.cpp) (Zeilen 127-140)
- [sensor_manager.cpp](El%20Trabajante/src/services/sensor/sensor_manager.cpp) (Zeilen 437-547)

**Funktionsweise:**
```cpp
// sensor_registry.cpp:127-140
// Multi-Value Device Definitionen
{"sht31", {"sht31_temp", "sht31_humidity"}},  // 2 Werte
{"bmp280", {"bmp280_pressure", "bmp280_temp"}},  // 2 Werte
```

**MQTT-Verhalten:**
Der ESP32 sendet **SEPARATE MQTT Messages** pro Wert auf dem **GLEICHEN GPIO**:

```
Message 1: kaiser/god/esp/ESP_001/sensor/21/data
{
  "esp_id": "ESP_001",
  "gpio": 21,
  "sensor_type": "sht31_temp",  // ← Lowercase!
  "value": 23.5,
  "unit": "°C",
  "quality": "good",
  "ts": 1736380800,
  "raw_mode": true
}

Message 2 (100ms später): kaiser/god/esp/ESP_001/sensor/21/data
{
  "esp_id": "ESP_001",
  "gpio": 21,
  "sensor_type": "sht31_humidity",  // ← Anderer Type, gleicher GPIO!
  "value": 65.2,
  "unit": "%",
  "quality": "good",
  "ts": 1736380800,
  "raw_mode": true
}
```

### 2.2 Verifizierte sensor_type Strings
| Sensor | Wert 1 | Wert 2 | Wert 3 | Case |
|--------|--------|--------|--------|------|
| SHT31 | `sht31_temp` | `sht31_humidity` | - | lowercase |
| BMP280 | `bmp280_pressure` | `bmp280_temp` | - | lowercase |
| BME280 | `bme280_temp` | `bme280_humidity` | `bme280_pressure` | lowercase |

### 2.3 ESP32 Status: ✅ KORREKT
Der ESP32-Code ist vollständig und korrekt implementiert.

---

## 3. Server Analyse (El Servador)

### 3.1 KRITISCHES PROBLEM: DB Unique Constraint

**Datei:** [sensor.py](El%20Servador/god_kaiser_server/src/db/models/sensor.py) (Zeilen 190-193)

```python
# AKTUELL - FALSCH für Multi-Value!
__table_args__ = (
    UniqueConstraint("esp_id", "gpio", name="unique_esp_gpio_sensor"),
    Index("idx_sensor_type_enabled", "sensor_type", "enabled"),
)
```

**Problem:** Der Constraint `(esp_id, gpio)` erlaubt nur EINEN Sensor pro GPIO.

Wenn der ESP32 sendet:
1. `sht31_temp` auf GPIO 21 → SensorConfig erstellt ✅
2. `sht31_humidity` auf GPIO 21 → **IntegrityError: Unique Constraint Violation** ❌

### 3.2 MQTT Handler Pipeline

**Datei:** [sensor_handler.py](El%20Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py)

```python
# Zeile 149-151 - Problem: get_by_esp_and_gpio() gibt nur EINEN Sensor zurück
sensor_config = await sensor_repo.get_by_esp_and_gpio(esp_device.id, gpio)
```

Der Handler kann nur EINEN Sensor pro GPIO finden/updaten.

### 3.3 Mock-ESP Handler

**Datei:** [debug.py](El%20Servador/god_kaiser_server/src/api/v1/debug.py) (Zeilen 816-832)

```python
# Bei Sensor-Erstellung wird sensor_repo.create() aufgerufen
# Das schlägt fehl für zweiten sensor_type auf gleichem GPIO!
await sensor_repo.create(
    esp_id=device.id,
    gpio=config.gpio,
    sensor_type=config.sensor_type,  # z.B. "sht31_humidity"
    ...
)
# → IntegrityError wenn "sht31_temp" auf GPIO 21 bereits existiert!
```

### 3.4 Sensor Repository

**Datei:** [sensor_repo.py](El%20Servador/god_kaiser_server/src/db/repositories/sensor_repo.py) (Zeilen 41-58)

```python
async def get_by_esp_and_gpio(self, esp_id: UUID, gpio: int) -> SensorConfig | None:
    # Gibt NUR EINEN Sensor pro (esp_id, gpio) zurück
    # Für Multi-Value müsste get_all_by_esp_and_gpio() existieren
```

### 3.5 Server Status: 🔴 KRITISCH
Der Server blockiert Multi-Value Sensoren durch den falschen Unique Constraint.

---

## 4. Frontend Analyse (El Frontend)

### 4.1 MULTI_VALUE_DEVICES Registry

**Datei:** [sensorDefaults.ts](El%20Frontend/src/utils/sensorDefaults.ts) (Zeilen 473-499)

```typescript
export const MULTI_VALUE_DEVICES: Record<string, MultiValueDeviceConfig> = {
  sht31: {
    deviceType: 'sht31',
    label: 'SHT31 (Temp + Humidity)',
    sensorTypes: ['sht31_temp', 'sht31_humidity'],  // ✅ Stimmt mit ESP32 überein!
    values: [
      { key: 'temp', sensorType: 'sht31_temp', label: 'Temperatur', unit: '°C', order: 1 },
      { key: 'humidity', sensorType: 'sht31_humidity', label: 'Luftfeuchtigkeit', unit: '% RH', order: 2 }
    ],
    icon: 'Thermometer',
    interface: 'i2c'
  },
  bmp280: {
    deviceType: 'bmp280',
    sensorTypes: ['bmp280_pressure', 'bmp280_temp'],  // ✅ Stimmt mit ESP32 überein!
    ...
  }
}
```

### 4.2 Store Handler Logic

**Datei:** [esp.ts](El%20Frontend/src/stores/esp.ts) (Zeilen 1106-1265)

```typescript
// HYBRID LOGIC für Multi-Value Handling:

function handleSensorData(message: any): void {
  // 1. Check Registry (Known Multi-Value)
  const knownDeviceType = getDeviceTypeFromSensorType(sensorType)
  if (knownDeviceType) {
    handleKnownMultiValueSensor(sensors, data, knownDeviceType)  // ✅
    return
  }

  // 2. Dynamic Detection (Multiple types on same GPIO)
  const existingSensor = sensors.find(s => s.gpio === gpio)
  if (existingSensor && existingSensor.sensor_type !== sensorType) {
    handleDynamicMultiValueSensor(existingSensor, data)  // ✅
    return
  }

  // 3. Single-Value
  handleSingleValueSensorData(sensors, data)  // ✅
}
```

### 4.3 SensorSatellite.vue Multi-Value Support

**Datei:** [SensorSatellite.vue](El%20Frontend/src/components/esp/SensorSatellite.vue)

Vollständig implementiert mit:
- Props: `deviceType`, `multiValues`, `isMultiValue`
- `valueCount` computed (1, 2, oder 3)
- `formattedValues` für sortierte Anzeige
- CSS Grid Layouts für verschiedene Value-Counts
- Quality Aggregation (worst across all values)

### 4.4 ESPOrbitalLayout.vue Integration

**Datei:** [ESPOrbitalLayout.vue](El%20Frontend/src/components/esp/ESPOrbitalLayout.vue) (Zeilen 1279-1291)

```vue
<SensorSatellite
  v-for="sensor in sensors"
  :key="`sensor-${sensor.gpio}`"
  :device-type="sensor.device_type"
  :multi-values="sensor.multi_values"
  :is-multi-value="sensor.is_multi_value"
  ...
/>
```

### 4.5 Frontend Status: ✅ KORREKT
Das Frontend ist vollständig Multi-Value-fähig. Es wartet nur auf korrekte Daten vom Server.

---

## 5. Gefundene Issues

| # | Beschreibung | Layer | Schwere | Fix erforderlich |
|---|--------------|-------|---------|------------------|
| 1 | **DB Unique Constraint `(esp_id, gpio)` blockiert Multi-Value** | Server | 🔴 KRITISCH | ✅ JA |
| 2 | `get_by_esp_and_gpio()` gibt nur einen Sensor zurück | Server | 🟡 MITTEL | ✅ JA |
| 3 | Mock-ESP Sensor-Erstellung schlägt für 2. Type fehl | Server | 🟡 MITTEL | ✅ JA (durch Fix 1) |
| 4 | GPIO-Validierung blockiert möglicherweise Multi-Value | Server | 🟡 MITTEL | 🔍 PRÜFEN |

---

## 6. Erforderliche Fixes

### Fix 1: Unique Constraint ändern (KRITISCH)

**Datei:** `El Servador/god_kaiser_server/src/db/models/sensor.py`

**Vorher (Zeile 190-193):**
```python
__table_args__ = (
    UniqueConstraint("esp_id", "gpio", name="unique_esp_gpio_sensor"),
    Index("idx_sensor_type_enabled", "sensor_type", "enabled"),
)
```

**Nachher:**
```python
__table_args__ = (
    # MULTI-VALUE SUPPORT: Erlaubt mehrere sensor_types pro GPIO
    UniqueConstraint("esp_id", "gpio", "sensor_type", name="unique_esp_gpio_sensor_type"),
    Index("idx_sensor_type_enabled", "sensor_type", "enabled"),
)
```

### Fix 2: Alembic Migration erstellen

**Neue Datei:** `El Servador/god_kaiser_server/alembic/versions/fix_sensor_unique_constraint_multivalue.py`

```python
"""Fix sensor unique constraint for multi-value support

Revision ID: fix_multivalue_constraint
Revises: [previous_revision]
Create Date: 2026-01-09
"""
from alembic import op

revision = 'fix_multivalue_constraint'
down_revision = '[previous_revision]'  # Replace with actual
branch_labels = None
depends_on = None

def upgrade():
    # Drop old constraint
    op.drop_constraint('unique_esp_gpio_sensor', 'sensor_configs', type_='unique')

    # Create new constraint with sensor_type
    op.create_unique_constraint(
        'unique_esp_gpio_sensor_type',
        'sensor_configs',
        ['esp_id', 'gpio', 'sensor_type']
    )

def downgrade():
    # WARNING: Downgrade may fail if multi-value sensors exist!
    op.drop_constraint('unique_esp_gpio_sensor_type', 'sensor_configs', type_='unique')
    op.create_unique_constraint(
        'unique_esp_gpio_sensor',
        'sensor_configs',
        ['esp_id', 'gpio']
    )
```

### Fix 3: Sensor Repository erweitern

**Datei:** `El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py`

**Neue Methode hinzufügen:**
```python
async def get_all_by_esp_and_gpio(
    self,
    esp_id: UUID,
    gpio: int
) -> list[SensorConfig]:
    """
    Get ALL sensors on a specific GPIO (Multi-Value Support).

    Returns list of SensorConfig entries for multi-value sensors.
    """
    query = select(SensorConfig).where(
        SensorConfig.esp_id == esp_id,
        SensorConfig.gpio == gpio
    )
    result = await self.session.execute(query)
    return list(result.scalars().all())
```

### Fix 4: GPIO-Validierung anpassen (Optional)

**Datei:** `El Servador/god_kaiser_server/src/services/gpio_validation_service.py`

Die GPIO-Validierung muss Multi-Value Sensoren erlauben:
```python
async def validate_gpio_available(
    self,
    esp_id: UUID,
    gpio: int,
    sensor_type: str,  # NEU: sensor_type Parameter
    exclude_sensor_id: Optional[UUID] = None
) -> GpioValidationResult:

    existing_sensors = await self.sensor_repo.get_all_by_esp_and_gpio(esp_id, gpio)

    for sensor in existing_sensors:
        if exclude_sensor_id and sensor.id == exclude_sensor_id:
            continue

        # Erlaube Multi-Value (gleicher Device-Type)
        if is_same_device_type(sensor.sensor_type, sensor_type):
            continue  # Multi-Value erlaubt

        # Blockiere anderen Sensor-Type
        return GpioValidationResult(
            available=False,
            conflict_type=GpioConflictType.SENSOR,
            existing_sensor=sensor
        )

    return GpioValidationResult(available=True)
```

---

## 7. Test-Plan

### 7.1 E2E Test: Real ESP Multi-Value (nach Fix)

```bash
# 1. MQTT Publish sht31_temp
mosquitto_pub -h localhost -t "kaiser/god/esp/TEST_001/sensor/21/data" -m '{
  "esp_id": "TEST_001",
  "gpio": 21,
  "sensor_type": "sht31_temp",
  "value": 23.5,
  "unit": "°C",
  "quality": "good",
  "ts": 1736380800,
  "raw_mode": true
}'

# 2. MQTT Publish sht31_humidity (100ms später)
mosquitto_pub -h localhost -t "kaiser/god/esp/TEST_001/sensor/21/data" -m '{
  "esp_id": "TEST_001",
  "gpio": 21,
  "sensor_type": "sht31_humidity",
  "value": 65.2,
  "unit": "%",
  "quality": "good",
  "ts": 1736380800,
  "raw_mode": true
}'
```

**Erwartung nach Fix:**
- [ ] Beide SensorConfig Einträge in DB (sht31_temp + sht31_humidity)
- [ ] Beide WebSocket Events gesendet
- [ ] Frontend zeigt 1 Sensor mit 2 Werten (23.5°C + 65.2%)

### 7.2 E2E Test: Mock ESP Multi-Value (nach Fix)

```bash
# 1. Create Mock ESP
POST /v1/debug/mock-esp
{ "esp_id": "MOCK_001", "name": "Test Mock" }

# 2. Add sht31_temp
POST /v1/debug/mock-esp/MOCK_001/sensors
{ "gpio": 21, "sensor_type": "sht31_temp", "raw_value": 23.5 }

# 3. Add sht31_humidity (FAILS CURRENTLY!)
POST /v1/debug/mock-esp/MOCK_001/sensors
{ "gpio": 21, "sensor_type": "sht31_humidity", "raw_value": 65.2 }
```

**Aktuelles Verhalten:** Schritt 3 schlägt mit 409 Conflict fehl
**Erwartetes Verhalten nach Fix:** Schritt 3 erfolgreich, beide Sensoren in DB

---

## 8. Payload-Vergleich Real vs. Mock

| Feld | Real ESP (MQTT) | Mock ESP (REST) | Match |
|------|-----------------|-----------------|-------|
| esp_id | "ESP_001" | "MOCK_001" | ✅ (Format) |
| gpio | 21 | 21 | ✅ |
| sensor_type | "sht31_temp" | "sht31_temp" | ✅ |
| value | 23.5 | 23.5 | ✅ |
| unit | "°C" | "°C" | ✅ |
| quality | "good" | "good" | ✅ |
| ts | 1736380800 | (generated) | ✅ |
| raw_mode | true | true | ✅ |

**Payload-Struktur ist identisch.** Das Problem liegt nur im DB Constraint.

---

## 9. Fazit

| Status | Beschreibung |
|--------|--------------|
| 🔴 | System hat **1 KRITISCHES Problem** (DB Unique Constraint) |
| ✅ | ESP32 Multi-Value Implementation korrekt |
| ✅ | Frontend Multi-Value Implementation korrekt |
| 🔴 | Server blockiert Multi-Value durch falschen Constraint |

### Nächste Schritte (Priorität):
1. **[KRITISCH]** Fix 1: Unique Constraint in `sensor.py` ändern
2. **[KRITISCH]** Fix 2: Alembic Migration ausführen
3. **[EMPFOHLEN]** Fix 3: `get_all_by_esp_and_gpio()` hinzufügen
4. **[OPTIONAL]** Fix 4: GPIO-Validierung für Multi-Value anpassen
5. **[TEST]** E2E Tests für Multi-Value durchführen

---

## 10. Referenz-Dateien

### ESP32 (El Trabajante)
| Datei | Beschreibung |
|-------|--------------|
| `src/models/sensor_registry.cpp` | Multi-Value Device Definitionen |
| `src/services/sensor/sensor_manager.cpp` | MQTT Publish Logic |

### Server (El Servador)
| Datei | Beschreibung |
|-------|--------------|
| `src/db/models/sensor.py` | **🔴 Unique Constraint Problem** |
| `src/db/repositories/sensor_repo.py` | Repository Methods |
| `src/mqtt/handlers/sensor_handler.py` | MQTT Handler |
| `src/api/v1/debug.py` | Mock ESP API |

### Frontend (El Frontend)
| Datei | Beschreibung |
|-------|--------------|
| `src/utils/sensorDefaults.ts` | MULTI_VALUE_DEVICES Registry |
| `src/stores/esp.ts` | WebSocket Handler |
| `src/components/esp/SensorSatellite.vue` | Multi-Value UI |

---

**Report erstellt:** 2026-01-09
**Nächste Review:** Nach Implementation der Fixes
