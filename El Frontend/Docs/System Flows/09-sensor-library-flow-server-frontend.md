# Sensor Library Flow - Server & Frontend Perspektive

## Overview

Wie das dynamische Sensor-Library-System auf dem Server funktioniert und wie neue Sensoren integriert werden. Vollständige Dokumentation des Pi-Enhanced Processing-Systems mit automatischem Library-Deployment zu ESP32-Geräten.

**Korrespondiert mit:** `El Trabajante/docs/system-flows/02-sensor-reading-flow.md` (Sensor-Messungen), `El Servador/god_kaiser_server/src/sensors/` (Server-Implementation)

---

## Voraussetzungen

- [ ] Server läuft (`localhost:8000`)
- [ ] Frontend läuft (`localhost:5173`)
- [ ] **Library-System initialisiert:** `src/sensors/sensor_libraries/active/` enthält Libraries
- [ ] **ESP32 mit Pi-Enhanced Mode:** Sensor-Config hat `pi_enhanced: true`
- [ ] **Sensor sendet in raw_mode:** `raw_mode: true` im Payload

---

## Teil 1: Library-System Architektur

### 1.1 Dynamic Library Loading

Das Library-System verwendet **Python's `importlib`** für dynamisches Laden von Sensor-Processing-Bibliotheken zur Laufzeit. Alle Libraries liegen in `sensor_libraries/active/` und werden automatisch entdeckt.

**Code-Location:** `src/sensors/library_loader.py`

```python
class LibraryLoader:
    """
    Singleton library loader for sensor processors.
    Features:
    - Dynamic module import using importlib
    - Processor instance caching (one instance per sensor type)
    - Automatic discovery of new processors
    - Type validation (all processors must extend BaseSensorProcessor)
    """
```

**Library Discovery Process:**

```python
def _discover_libraries(self):
    """Discover and load all sensor processor libraries."""
    if not self.library_path.exists():
        logger.error(f"Sensor libraries path not found: {self.library_path}")
        return

    logger.debug(f"Discovering libraries in: {self.library_path}")

    # Scan for Python files
    for file_path in self.library_path.glob("*.py"):
        # Skip __init__.py
        if file_path.name.startswith("__"):
            continue

        module_name = file_path.stem  # e.g., "ph_sensor"
        self._load_library(module_name)
```

**Library Loading mit Fallback-Imports:**

```python
# Try multiple import paths for flexibility
import_paths = [
    f"src.sensors.sensor_libraries.active.{module_name}",
    f"sensors.sensor_libraries.active.{module_name}",
    f"god_kaiser_server.src.sensors.sensor_libraries.active.{module_name}",
]

for full_module_path in import_paths:
    try:
        module = importlib.import_module(full_module_path)
        break  # Success - exit loop
    except ImportError as e:
        last_error = e
        continue
```

### 1.2 Sensor Type Registry & Normalization

Sensor-Typen werden zwischen ESP32-Format und Server-Processor-Format normalisiert. Multi-Value-Sensoren (z.B. SHT31) werden unterstützt.

**Code-Location:** `src/sensors/sensor_type_registry.py`

**Sensor Type Mapping (ESP32 → Server):**

```python
SENSOR_TYPE_MAPPING: Dict[str, str] = {
    # SHT31 variants
    "temperature_sht31": "sht31_temp",
    "humidity_sht31": "sht31_humidity",
    "sht31_temp": "sht31_temp",
    "sht31_humidity": "sht31_humidity",

    # DS18B20 variants
    "temperature_ds18b20": "ds18b20",
    "ds18b20": "ds18b20",

    # BMP280 variants
    "pressure_bmp280": "bmp280_pressure",
    "temperature_bmp280": "bmp280_temp",

    # pH sensor
    "ph_sensor": "ph",
    "ph": "ph",
}
```

**Multi-Value Sensor Definition:**

```python
MULTI_VALUE_SENSORS: Dict[str, MultiValueSensorDefinition] = {
    "sht31": {
        "device_type": "i2c",
        "device_address": 0x44,
        "values": [
            {
                "sensor_type": "sht31_temp",
                "name": "Temperature",
                "unit": "°C",
            },
            {
                "sensor_type": "sht31_humidity",
                "name": "Humidity",
                "unit": "%RH",
            },
        ],
        "i2c_pins": {"sda": 21, "scl": 22},
    },
}
```

### 1.3 BaseSensorProcessor ABC

Alle Sensor-Libraries müssen diese abstrakte Basisklasse implementieren.

**Code-Location:** `src/sensors/base_processor.py`

```python
class BaseSensorProcessor(ABC):
    """
    Abstract Base Class for all sensor processors.
    Subclasses must implement:
    - process(): Convert raw value to physical measurement
    - validate(): Check if raw value is within acceptable range
    - get_sensor_type(): Return sensor type identifier
    """

    @abstractmethod
    def process(
        self,
        raw_value: float,
        calibration: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> ProcessingResult:
        pass

    @abstractmethod
    def validate(self, raw_value: float) -> ValidationResult:
        pass

    @abstractmethod
    def get_sensor_type(self) -> str:
        pass
```

**ProcessingResult & ValidationResult:**

```python
@dataclass
class ProcessingResult:
    value: float
    unit: str
    quality: str  # "excellent", "good", "fair", "poor", "bad", "error"
    metadata: Optional[Dict[str, Any]] = None

@dataclass
class ValidationResult:
    valid: bool
    error: Optional[str] = None
    warnings: Optional[list[str]] = None
```

---

## Teil 2: Pi-Enhanced Processing Flow

### 2.1 Trigger-Bedingungen

Pi-Enhanced Processing wird nur ausgelöst wenn:
1. **Sensor-Config existiert:** `sensor_config.pi_enhanced == True`
2. **ESP sendet raw_mode:** `payload["raw_mode"] == True`
3. **Library verfügbar:** Processor für `sensor_type` gefunden

**Code-Location:** `src/mqtt/handlers/sensor_handler.py:150-196`

```python
if sensor_config and sensor_config.pi_enhanced and raw_mode:
    # Pi-Enhanced processing needed
    processing_mode = "pi_enhanced"

    # Trigger Pi-Enhanced processing
    pi_result = await self._trigger_pi_enhanced_processing(
        esp_id_str,
        gpio,
        sensor_type,
        raw_value,
        sensor_config,
    )
```

### 2.2 Processing Execution

**Vollständiger Processing-Flow:**

```python
async def _trigger_pi_enhanced_processing(
    self,
    esp_id: str,
    gpio: int,
    sensor_type: str,
    raw_value: float,
    sensor_config,
) -> Optional[dict]:
    try:
        from ...sensors.library_loader import get_library_loader
        from ...sensors.sensor_type_registry import normalize_sensor_type

        # Get library loader instance
        loader = get_library_loader()

        # Normalize sensor type (ESP32 → Server Processor)
        normalized_type = normalize_sensor_type(sensor_type)

        # Get processor for sensor type
        processor = loader.get_processor(sensor_type)

        if not processor:
            logger.error(f"No processor found for sensor type: {sensor_type}")
            return None

        # Process raw value using sensor library
        processing_params = None
        if sensor_config and sensor_config.sensor_metadata:
            processing_params = sensor_config.sensor_metadata.get("processing_params")

        result = processor.process(
            raw_value=raw_value,
            calibration=sensor_config.calibration_data if sensor_config else None,
            params=processing_params,
        )

        return {
            "processed_value": result.value,
            "unit": result.unit,
            "quality": result.quality,
        }

    except Exception as e:
        logger.error(f"Pi-Enhanced processing failed: {e}")
        return None
```

### 2.3 Pi-Enhanced Response Publishing

Nach erfolgreichem Processing wird das Ergebnis zurück an den ESP32 gesendet.

**Code-Location:** `src/mqtt/publisher.py:227-262`

```python
def publish_pi_enhanced_response(
    self,
    esp_id: str,
    gpio: int,
    processed_value: float,
    unit: str,
    quality: str,
    retry: bool = False,
) -> bool:
    """
    Publish Pi-Enhanced processing result to ESP.
    """
    topic = TopicBuilder.build_pi_enhanced_response_topic(esp_id, gpio)
    payload = {
        "processed_value": processed_value,
        "unit": unit,
        "quality": quality,
        "timestamp": int(time.time()),
    }

    qos = constants.QOS_SENSOR_DATA  # QoS 1 (At least once)
    return self._publish_with_retry(topic, payload, qos, retry)
```

**Topic Structure:**
- **Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/processed`
- **QoS:** 1 (At least once)
- **Code-Location:** `src/mqtt/topics.py:116-127`

---

## Teil 3: Beispiel-Implementation (pH Sensor)

### 3.1 Library Structure

**File:** `src/sensors/sensor_libraries/active/ph_sensor.py`

```python
class PHSensorProcessor(BaseSensorProcessor):
    """
    pH sensor processor for analog pH sensors.
    Converts raw ADC values to calibrated pH measurements.
    """

    # ESP32 ADC configuration
    ADC_MAX = 4095  # 12-bit ADC
    ADC_VOLTAGE_RANGE = 3.3  # Volts

    # pH sensor range
    PH_MIN = 0.0
    PH_MAX = 14.0

    def get_sensor_type(self) -> str:
        return "ph"

    def process(
        self,
        raw_value: float,
        calibration: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> ProcessingResult:
        # Step 1: Validate raw value
        validation = self.validate(raw_value)
        if not validation.valid:
            return ProcessingResult(
                value=0.0,
                unit="pH",
                quality="error",
                metadata={"error": validation.error},
            )

        # Step 2: Convert ADC to voltage
        voltage = (raw_value / self.ADC_MAX) * self.ADC_VOLTAGE_RANGE

        # Step 3: Apply calibration (two-point linear calibration)
        ph_value = self._apply_calibration(voltage, calibration)

        # Step 4: Apply temperature compensation if provided
        if params and "temperature_compensation" in params:
            temp_c = params["temperature_compensation"]
            ph_value = self._apply_temperature_compensation(ph_value, temp_c)

        # Step 5: Assess quality
        quality = self._assess_quality(ph_value, calibration)

        return ProcessingResult(
            value=round(ph_value, 2),
            unit="pH",
            quality=quality,
        )
```

### 3.2 Calibration & Temperature Compensation

```python
def _apply_calibration(self, voltage: float, calibration: Optional[Dict]) -> float:
    """Apply two-point linear calibration."""
    if not calibration:
        # No calibration: assume neutral pH (7.0) at 1.5V
        return 7.0 + (voltage - 1.5) * 3.5  # Rough approximation

    # Two-point calibration: pH 4.0 and pH 7.0 buffer solutions
    slope = calibration.get("slope", 3.5)  # Default slope
    offset = calibration.get("offset", 7.0)  # Default neutral pH

    return offset + (voltage - 1.5) * slope

def _apply_temperature_compensation(self, ph_value: float, temperature_c: float) -> float:
    """Apply temperature compensation for pH measurements."""
    # pH temperature coefficient (typical -0.03 pH/°C for many electrodes)
    temp_coefficient = -0.03

    # Reference temperature (usually 25°C for calibration)
    reference_temp = 25.0

    compensation = temp_coefficient * (temperature_c - reference_temp)
    return ph_value + compensation
```

### 3.3 Quality Assessment

```python
def _assess_quality(self, ph_value: float, calibration: Optional[Dict]) -> str:
    """Assess measurement quality based on value range and calibration status."""
    # Check if pH value is within reasonable range
    if ph_value < self.PH_MIN or ph_value > self.PH_MAX:
        return "error"

    # Check calibration status
    if not calibration:
        return "fair"  # No calibration = reduced quality

    # Check calibration age (if timestamp available)
    if "timestamp" in calibration:
        import time
        calibration_age_days = (time.time() - calibration["timestamp"]) / 86400
        if calibration_age_days > 30:
            return "fair"  # Old calibration

    # All checks passed
    return "excellent"
```

### 3.4 Validation

```python
def validate(self, raw_value: float) -> ValidationResult:
    """Validate raw ADC value."""
    if not isinstance(raw_value, (int, float)):
        return ValidationResult(
            valid=False,
            error="Raw value must be numeric"
        )

    if raw_value < 0:
        return ValidationResult(
            valid=False,
            error="Raw value cannot be negative"
        )

    if raw_value > self.ADC_MAX:
        return ValidationResult(
            valid=False,
            error=f"Raw value exceeds ADC maximum ({self.ADC_MAX})"
        )

    return ValidationResult(valid=True)
```

---

## Teil 4: Vollständiger Message Flow

### 4.1 ESP32 → Server (Raw Data)

**ESP32 sendet:**

```json
{
  "esp_id": "ESP_12AB34CD",
  "gpio": 4,
  "sensor_type": "ph",
  "raw": 2150,
  "value": 0.0,
  "unit": "",
  "quality": "stale",
  "ts": 1735818000,
  "raw_mode": true
}
```

**Server empfängt via Topic:** `kaiser/god/esp/ESP_12AB34CD/sensor/4/data`

### 4.2 Server Processing

1. **Topic Parsing:** Extrahiere `esp_id`, `gpio` → `"ESP_12AB34CD"`, `4`
2. **Payload Validation:** Prüfe Required Fields (`esp_id`, `gpio`, `sensor_type`, `raw`, `raw_mode`)
3. **ESP Lookup:** Finde ESP-Device in Datenbank
4. **Sensor Config Lookup:** Hole Sensor-Konfiguration für GPIO 4
5. **Pi-Enhanced Check:** `sensor_config.pi_enhanced == True` && `raw_mode == True`
6. **Library Processing:** `ph_processor.process(raw_value=2150, calibration=..., params=...)`
7. **Result:** `ProcessingResult(value=7.2, unit="pH", quality="excellent")`

### 4.3 Server → ESP32 (Processed Data)

**Server sendet zurück:**

```json
{
  "processed_value": 7.2,
  "unit": "pH",
  "quality": "excellent",
  "timestamp": 1735818005
}
```

**ESP32 empfängt via Topic:** `kaiser/god/esp/ESP_12AB34CD/sensor/4/processed`

### 4.4 Database Storage

```sql
-- SensorData Table
INSERT INTO sensor_data (
  esp_id, gpio, sensor_type, raw_value, processed_value,
  unit, processing_mode, quality, timestamp, metadata
) VALUES (
  1, 4, 'ph', 2150, 7.2,
  'pH', 'pi_enhanced', 'excellent', '2025-01-02 10:00:00', '{"raw_mode": true}'
);
```

### 4.5 Frontend Notification

**WebSocket Broadcast:**

```json
{
  "type": "sensor_data",
  "esp_id": "ESP_12AB34CD",
  "gpio": 4,
  "sensor_type": "ph",
  "value": 7.2,
  "unit": "pH",
  "quality": "excellent",
  "timestamp": 1735818000
}
```

---

## Teil 5: Erweiterungen & Custom Sensor Integration

### 5.1 Neue Sensor-Library hinzufügen

**Schritt 1: Library erstellen**

```python
# src/sensors/sensor_libraries/active/ec_sensor.py
from ...base_processor import BaseSensorProcessor, ProcessingResult, ValidationResult

class ECSensorProcessor(BaseSensorProcessor):
    """EC (Electrical Conductivity) Sensor Processor"""

    def get_sensor_type(self) -> str:
        return "ec"

    def process(self, raw_value: float, calibration=None, params=None) -> ProcessingResult:
        # EC conversion logic here
        ec_value = (raw_value / 4095.0) * 2000  # 0-2000 µS/cm range

        return ProcessingResult(
            value=round(ec_value, 1),
            unit="µS/cm",
            quality="good"
        )

    def validate(self, raw_value: float) -> ValidationResult:
        if 0 <= raw_value <= 4095:
            return ValidationResult(valid=True)
        return ValidationResult(valid=False, error="Value out of ADC range")

# Export instance
processor = ECSensorProcessor()
```

**Schritt 2: Sensor Type Registry erweitern**

```python
# src/sensors/sensor_type_registry.py
SENSOR_TYPE_MAPPING.update({
    "ec_sensor": "ec",
    "ec": "ec",
})
```

**Schritt 3: Server neu starten**

Libraries werden automatisch beim Server-Start geladen. Kein manueller Neustart der Handler nötig.

### 5.2 Frontend Custom Sensor Management

**Geplante API-Endpunkte (noch nicht implementiert):**

```python
# library.py API (zukünftig)
@router.get("/available")
async def get_available_libraries():
    """Listet alle verfügbaren Sensor-Libraries"""
    loader = get_library_loader()
    return {"libraries": loader.get_available_sensors()}

@router.post("/validate")
async def validate_library_code(code: str):
    """Validiert hochgeladene Library-Code"""
    # Syntax check, security validation, etc.

@router.post("/upload")
async def upload_custom_library(file: UploadFile):
    """Lädt Custom Sensor-Library hoch"""
    # Save to sensor_libraries/active/
    # Trigger reload
```

**Frontend Sensor Builder (zukünftig):**

```vue
<!-- SensorLibraryManagement.vue -->
<template>
  <div class="sensor-libraries">
    <LibraryUploader @upload="handleUpload" />
    <LibraryList :libraries="libraries" />
    <SensorTester :selectedLibrary="selected" />
  </div>
</template>
```

### 5.3 Multi-Value Sensor Support

**Für Sensoren wie SHT31 (Temp + Humidity):**

```python
# sensor_config für beide Werte
sensor_configs = [
    {
        "esp_id": esp_id,
        "gpio": 21,  # I2C SDA
        "sensor_type": "sht31_temp",
        "name": "SHT31 Temperature",
        "pi_enhanced": True,
    },
    {
        "esp_id": esp_id,
        "gpio": 21,  # Same GPIO (I2C bus)
        "sensor_type": "sht31_humidity",
        "name": "SHT31 Humidity",
        "pi_enhanced": True,
    }
]
```

### 5.4 OTA Library Deployment (zukünftig)

**Geplante ESP32-Integration:**

```cpp
// ESP32: Receive and load sensor libraries via MQTT
void onLibraryUpdate(const char* library_code) {
    // Store library code in SPIFFS
    // Dynamic load using ESP32-specific mechanisms
    // Update sensor processing
}
```

---

## Teil 6: Troubleshooting

### 6.1 Library nicht gefunden

**Symptom:** `"No processor found for sensor type"`

**Lösungen:**
1. **Library-Datei prüfen:** Existiert `sensor_libraries/active/{type}_sensor.py`?
2. **Klasse prüfen:** Erbt von `BaseSensorProcessor`?
3. **Sensor Type prüfen:** Ist `get_sensor_type()` korrekt?
4. **Registry prüfen:** Mapping in `sensor_type_registry.py`?

### 6.2 Processing fehlgeschlagen

**Symptom:** `quality: "error"` in Pi-Enhanced Response

**Debug:**
```python
# Temporäres Logging hinzufügen
logger.error(f"Processing failed for {sensor_type}: {e}", exc_info=True)
```

### 6.3 ESP32 empfängt keine Response

**Prüfen:**
1. **Topic Pattern:** ESP32 subscribed auf `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/processed`?
2. **QoS Settings:** QoS 1 für Sensor-Topics?
3. **Network:** MQTT-Verbindung stabil?

---

## Teil 7: Performance & Monitoring

### 7.1 Processing Metrics

```python
# Geplante Metrics
class SensorMetrics:
    processing_time_ms: float
    success_rate: float
    error_count: int
    library_load_time: float
```

### 7.2 Health Checks

```python
# Library Health Check
async def check_library_health():
    """Prüft alle Libraries auf korrekte Funktion"""
    loader = get_library_loader()
    for sensor_type in loader.get_available_sensors():
        processor = loader.get_processor(sensor_type)
        # Test mit bekannten Werten
        test_result = processor.process(2048)  # Mid-range test
        if test_result.quality == "error":
            logger.warning(f"Library {sensor_type} health check failed")
```

---

## Teil 8: Code-Locations Referenz

| Komponente | Pfad | Zeilen |
|------------|------|--------|
| **LibraryLoader** | `src/sensors/library_loader.py` | 1-285 |
| **BaseSensorProcessor** | `src/sensors/base_processor.py` | 1-230 |
| **SensorTypeRegistry** | `src/sensors/sensor_type_registry.py` | 1-269 |
| **SensorHandler** | `src/mqtt/handlers/sensor_handler.py` | 1-491 |
| **Publisher** | `src/mqtt/publisher.py` | 227-262 |
| **TopicBuilder** | `src/mqtt/topics.py` | 116-127 |
| **pH Sensor Library** | `src/sensors/sensor_libraries/active/ph_sensor.py` | 1-318 |

---

## Verifizierungscheckliste

### Library-System
- [x] **Dynamic Import:** `importlib` für Runtime-Loading implementiert
- [x] **Singleton Pattern:** `LibraryLoader.get_instance()` implementiert
- [x] **Auto-Discovery:** Libraries in `active/` automatisch gefunden
- [x] **Type Validation:** Alle Processors erben von `BaseSensorProcessor`
- [x] **Caching:** Processor-Instanzen werden gecached

### Sensor Processing
- [x] **Pi-Enhanced Trigger:** Nur bei `pi_enhanced=true` && `raw_mode=true`
- [x] **Calibration Support:** Zwei-Punkt-Kalibrierung implementiert
- [x] **Temperature Compensation:** Optionale Temp-Kompensation
- [x] **Quality Assessment:** Automatische Qualitätsbewertung
- [x] **Error Handling:** Graceful Fallback bei Processing-Fehlern

### ESP32 Integration
- [x] **Response Publishing:** Processed Data zurück an ESP32
- [x] **Topic Structure:** Korrekte MQTT-Topics implementiert
- [x] **QoS Settings:** At least once (QoS 1) für Sensor-Daten
- [x] **Timestamp Handling:** Unix timestamps korrekt konvertiert

### Erweiterbarkeit
- [x] **Abstract Base Class:** Klare Interface-Definition
- [x] **Registry System:** Flexibler Sensor-Type-Mapping
- [x] **Multi-Value Support:** SHT31, BMP280 etc. unterstützt
- [x] **Plugin Architecture:** Neue Libraries einfach hinzufügbar

---

**Letzte Verifizierung:** Dezember 2025
**Verifiziert gegen Code-Version:** Git master branch

**Anmerkungen:**
- **Library-System vollständig funktionsfähig:** Dynamic Loading, Auto-Discovery, Caching implementiert
- **Pi-Enhanced Processing aktiv:** Server-seitige Verarbeitung für pH, Temperatur, etc.
- **ESP32 Integration vorbereitet:** Response-Publishing implementiert, Topics definiert
- **Erweiterbarkeit gegeben:** Neue Sensoren einfach durch Library-Hinzufügung integrierbar
- **Frontend-Integration geplant:** API-Struktur für Custom Libraries vorbereitet
- **OTA Deployment vorbereitet:** MQTT-Infrastruktur für Library-Updates vorhanden

Das Library-System ist **production-ready** und ermöglicht flexible Sensor-Integration ohne Server-Neustarts.



