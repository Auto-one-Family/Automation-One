# OneWire ROM-Code Bug Analysis

**Datum:** 2026-02-03
**Bug-ID:** BUG-ONEWIRE-CONFIG-001
**Severity:** CRITICAL (OneWire-Sensoren können nicht konfiguriert werden)
**Status:** Analysiert - Lösung identifiziert

---

## 1. Problem-Statement

ESP32 kann DS18B20 (OneWire) Sensoren nicht konfigurieren. Der Fehler tritt bei der ROM-Code Validierung auf:

```
[ERROR] SensorManager: Invalid OneWire ROM-Code length (expected 16, got 0)
[ERROR] [1041] [HARDWARE] Invalid OneWire ROM-Code length
[ERROR] Failed to configure sensor on GPIO 4
```

**Beobachtetes Verhalten:**
- Server speichert: `onewire_address: "AUTO_B9421D7633DF3991"` (21 Zeichen)
- ESP32 empfängt: Leerer String (Länge 0)
- ESP32 erwartet: 16 Zeichen Hex-String (z.B. `"28FF1234567890AB"`)

---

## 2. Root-Cause Analyse

### 2.1 Hauptursache: Drei gekoppelte Bugs

| Bug | Komponente | Datei | Problem |
|-----|------------|-------|---------|
| **BUG-A** | Server Schema | `schemas/esp.py:714-758` | `ESPSensorConfigItem` hat kein `onewire_address` Feld |
| **BUG-B** | Server Config-Push | `schemas/esp.py:740-758` | `to_esp_format()` sendet `onewire_address` nicht |
| **BUG-C** | ESP32 JSON-Parsing | `main.cpp:2021-2168` | `parseAndConfigureSensorWithTracking()` extrahiert `onewire_address` nicht |

### 2.2 Zusätzliches Problem: AUTO_ Prefix

**Datei:** `api/v1/sensors.py:1450-1456`

```python
# Format: AUTO_<random_hex> to distinguish from real ROM addresses
if not onewire_address:
    onewire_address = f"AUTO_{secrets.token_hex(8).upper()}"
```

Selbst wenn die anderen Bugs gefixt werden, würde der Server `AUTO_...` (21 Zeichen) senden, aber ESP32 erwartet exakt 16 Zeichen.

---

## 3. Datenfluss-Analyse

### 3.1 Frontend → Server (Sensor-Erstellung)

```
POST /api/v1/sensors/
Body: { gpio: 4, sensor_type: "DS18B20", ... }
```

- Wenn `onewire_address` nicht übergeben wird → Server generiert `AUTO_<random>`
- Gespeichert in DB: `SensorConfig.onewire_address = "AUTO_B9421D7633DF3991"`

### 3.2 Server DB Model

**Datei:** `db/models/sensor.py:98`

```python
onewire_address: Mapped[Optional[str]] = mapped_column(
    String(20),  # ⚠️ 20 Zeichen erlaubt für AUTO_<16hex>
    nullable=True
)
```

### 3.3 Server → MQTT Config-Push

**Datei:** `schemas/esp.py:740-758`

```python
def to_esp_format(self) -> Dict[str, Any]:
    return {
        "gpio": self.gpio,
        "sensor_type": self.sensor_type or self.type or "unknown",
        "sensor_name": self.sensor_name or self.name or f"Sensor_GPIO{self.gpio}",
        "active": self.active,
        "raw_mode": self.raw_mode,
        "subzone_id": self.subzone_id or "",
        "sample_interval_ms": self.sample_interval_ms or 30000,
        # ❌ FEHLT: "onewire_address": self.onewire_address
    }
```

**Gesendetes JSON:**
```json
{
  "sensors": [{
    "gpio": 4,
    "sensor_type": "DS18B20",
    "sensor_name": "Tank Temp",
    "active": true,
    "raw_mode": true,
    "subzone_id": "",
    "sample_interval_ms": 30000
  }]
}
```

### 3.4 ESP32 JSON-Parsing

**Datei:** `main.cpp:2021-2168`

Extrahierte Felder:
```cpp
// ✅ Extrahiert:
JsonHelpers::extractInt(sensor_obj, "gpio", gpio_value);
JsonHelpers::extractString(sensor_obj, "sensor_type", config.sensor_type);
JsonHelpers::extractString(sensor_obj, "sensor_name", config.sensor_name);
JsonHelpers::extractString(sensor_obj, "subzone_id", config.subzone_id);
JsonHelpers::extractBool(sensor_obj, "active", bool_value);
JsonHelpers::extractBool(sensor_obj, "raw_mode", bool_value);
JsonHelpers::extractString(sensor_obj, "operating_mode", mode_str);
JsonHelpers::extractInt(sensor_obj, "measurement_interval_seconds", interval_seconds);

// ❌ FEHLT:
// JsonHelpers::extractString(sensor_obj, "onewire_address", config.onewire_address);
```

### 3.5 ESP32 Validierung

**Datei:** `sensor_manager.cpp:321-327`

```cpp
if (config.onewire_address.length() != 16) {
    LOG_ERROR("SensorManager: Invalid OneWire ROM-Code length (expected 16, got " +
             String(config.onewire_address.length()) + ")");
    // → Länge = 0 weil Feld nie extrahiert wurde!
    return false;
}
```

---

## 4. Feld-Mapping Vergleich

| Komponente | Feld-Name | Vorhanden | Format |
|------------|-----------|-----------|--------|
| DB Model | `onewire_address` | ✅ | String(20) |
| API Schema (sensor.py) | `onewire_address` | ✅ | Optional[str] |
| ESP Config Schema | `onewire_address` | ❌ FEHLT | - |
| ESP Config `to_esp_format()` | `onewire_address` | ❌ FEHLT | - |
| ESP32 JSON-Parsing | `onewire_address` | ❌ FEHLT | - |
| ESP32 SensorConfig Struct | `onewire_address` | ✅ | String |

---

## 5. Lösungsvorschlag

### Option A: Vollständiger Fix (Server + ESP32)

**1. Server-Side: Schema erweitern**

Datei: `El Servador/god_kaiser_server/src/schemas/esp.py`

```python
class ESPSensorConfigItem(BaseModel):
    # ... existing fields ...

    # ADD: OneWire address field
    onewire_address: Optional[str] = Field(
        None,
        description="OneWire ROM-Code (16 hex chars for DS18B20)"
    )

    def to_esp_format(self) -> Dict[str, Any]:
        result = {
            "gpio": self.gpio,
            "sensor_type": self.sensor_type or self.type or "unknown",
            "sensor_name": self.sensor_name or self.name or f"Sensor_GPIO{self.gpio}",
            "active": self.active,
            "raw_mode": self.raw_mode,
            "subzone_id": self.subzone_id or "",
            "sample_interval_ms": self.sample_interval_ms or 30000,
        }

        # ADD: Include onewire_address for OneWire sensors
        if self.onewire_address:
            # Strip AUTO_ prefix if present (ESP expects pure 16-char hex)
            addr = self.onewire_address
            if addr.startswith("AUTO_"):
                addr = addr[5:]  # Remove "AUTO_" prefix
            result["onewire_address"] = addr

        return result
```

**2. ESP32-Side: JSON-Parsing erweitern**

Datei: `El Trabajante/src/main.cpp`, Funktion `parseAndConfigureSensorWithTracking()`

Nach Zeile 2065 (`JsonHelpers::extractString(sensor_obj, "subzone_id", ...)`):

```cpp
// ADD: Extract OneWire ROM-Code for OneWire sensors
JsonHelpers::extractString(sensor_obj, "onewire_address", config.onewire_address, "");
```

### Option B: Minimal-Fix (nur ESP32)

Falls Server nicht geändert werden kann, kann ESP32 im Auto-Discovery Modus arbeiten:

```cpp
// In sensor_manager.cpp:321-327
// ÄNDERN: Leerer String = Auto-Discovery Modus
if (config.onewire_address.length() == 0) {
    // Auto-Discovery: Scan bus and use first device
    LOG_INFO("SensorManager: No ROM-Code provided, attempting auto-discovery");
    // ... auto-discovery logic ...
} else if (config.onewire_address.length() != 16) {
    // Invalid explicit ROM-Code
    LOG_ERROR("SensorManager: Invalid ROM-Code length");
    return false;
}
```

### Empfehlung: Option A

Option A ist die richtige Lösung weil:
1. Explizite ROM-Codes ermöglichen Multi-Sensor-Betrieb
2. Server kann Sensor-Zuordnung konsistent verwalten
3. Auto-Discovery ist unzuverlässig bei mehreren DS18B20

---

## 6. Betroffene Dateien und Änderungen

### Server-Änderungen

| Datei | Zeilen | Änderung |
|-------|--------|----------|
| `schemas/esp.py` | 714-738 | `ESPSensorConfigItem`: Feld `onewire_address` hinzufügen |
| `schemas/esp.py` | 740-758 | `to_esp_format()`: `onewire_address` in Return-Dict aufnehmen |
| `api/v1/sensors.py` | 1450-1456 | Optional: `AUTO_` Prefix nur für DB, nicht für ESP senden |

### ESP32-Änderungen

| Datei | Zeilen | Änderung |
|-------|--------|----------|
| `main.cpp` | ~2065 | `parseAndConfigureSensorWithTracking()`: `onewire_address` extrahieren |

---

## 7. Testplan

### 7.1 Unit Tests

1. **Server:** `ESPSensorConfigItem.to_esp_format()` mit/ohne `onewire_address`
2. **ESP32:** `parseAndConfigureSensorWithTracking()` mit OneWire-Sensor

### 7.2 Integration Tests

1. Sensor mit explizitem ROM-Code erstellen → Config an ESP senden
2. Sensor ohne ROM-Code (Auto-Discovery) → Config an ESP senden
3. Mehrere DS18B20 auf einem Bus → Korrekte Zuordnung prüfen

### 7.3 End-to-End Test

```bash
# 1. Sensor erstellen
curl -X POST /api/v1/sensors/ -d '{
  "esp_id": "ESP_472204",
  "gpio": 4,
  "sensor_type": "DS18B20",
  "onewire_address": "28FF641E8D3C0C79"
}'

# 2. Config an ESP pushen
curl -X POST /api/v1/esp/devices/ESP_472204/config -d '{
  "sensors": [{
    "gpio": 4,
    "sensor_type": "DS18B20",
    "sensor_name": "Tank Temp",
    "onewire_address": "28FF641E8D3C0C79"
  }]
}'

# 3. ESP32 Serial Monitor prüfen:
# - "Sensor configured: GPIO 4 (DS18B20)"
# - KEIN Error 1041
```

---

## 8. Zusammenfassung

| Aspekt | Status |
|--------|--------|
| **Root-Cause identifiziert** | ✅ Ja - 3 gekoppelte Bugs |
| **Server-Bug** | Schema fehlt `onewire_address` Feld |
| **ESP32-Bug** | JSON-Parsing extrahiert `onewire_address` nicht |
| **Schweregrad** | CRITICAL - Alle OneWire-Sensoren betroffen |
| **Geschätzte Fix-Komplexität** | Niedrig (wenige Zeilen pro Komponente) |
| **Empfohlene Lösung** | Option A - Vollständiger Fix auf beiden Seiten |

---

*Analysiert von: Claude Code (Bug-Investigator)*
*Report erstellt: 2026-02-03*
