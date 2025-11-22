# Sensor Reading Flow

## Overview

Periodic sensor measurement, processing, and MQTT publishing cycle. This flow demonstrates El Trabajante's autonomous data acquisition pattern where sensors are read on a fixed interval and published to God-Kaiser for processing and analysis.

## Files Analyzed

- `src/main.cpp` (line 643) - Loop call to performAllMeasurements()
- `src/services/sensor/sensor_manager.cpp` (lines 360-534) - Complete measurement cycle
- `src/services/sensor/sensor_manager.h` (lines 1-168) - Sensor manager interface
- `src/models/sensor_types.h` (lines 1-47) - Sensor data structures
- `src/utils/topic_builder.cpp` (lines 53-58) - Sensor topic generation
- `src/services/communication/mqtt_client.cpp` - MQTT publishing
- `src/drivers/i2c_bus.cpp` - I2C sensor communication
- `src/drivers/onewire_bus.cpp` - OneWire sensor communication

## Prerequisites

- Sensor Manager initialized (boot sequence Phase 4)
- At least one sensor configured
- MQTT client connected
- Main loop running

## Trigger

Automatic periodic measurement triggered by timer in main loop. Default interval: 30 seconds (configurable).

**File:** `src/main.cpp` (line 643)

```cpp
void loop() {
  // ...
  sensorManager.performAllMeasurements();
  // ...
}
```

---

## Flow Steps

### STEP 1: Timer Check

**File:** `src/services/sensor/sensor_manager.cpp` (lines 360-368)

**Code:**

```cpp
void SensorManager::performAllMeasurements() {
    if (!initialized_) {
        return;
    }
    
    unsigned long now = millis();
    if (now - last_measurement_time_ < measurement_interval_) {
        return;  // Not time yet
    }
    
    // Measure all active sensors
    // ...
}
```

**Purpose:** Prevent excessive measurements that could:
- Flood MQTT broker with messages
- Waste CPU cycles
- Drain power on battery-powered ESPs

**Timing Logic:**
- `last_measurement_time_`: Timestamp of last measurement (milliseconds)
- `measurement_interval_`: Default 30000ms (30 seconds)
- `now - last_measurement_time_`: Elapsed time since last measurement

**Behavior:**
- If interval not elapsed → Return immediately (no-op)
- If interval elapsed → Proceed with measurements

**Configuration:** Interval can be changed dynamically (future feature)

---

### STEP 2: Iterate Active Sensors

**File:** `src/services/sensor/sensor_manager.cpp` (lines 370-384)

**Code:**

```cpp
// Measure all active sensors
for (uint8_t i = 0; i < sensor_count_; i++) {
    if (!sensors_[i].active) {
        continue;
    }
    
    SensorReading reading;
    if (performMeasurement(sensors_[i].gpio, reading)) {
        // Publish via MQTT
        publishSensorReading(reading);
    }
}

last_measurement_time_ = now;
```

**Purpose:** Process each configured sensor

**Sensor Registry:**
- `sensors_[]`: Fixed-size array (max 10 sensors)
- `sensor_count_`: Number of configured sensors
- `active` flag: Skip inactive sensors

**Error Handling:**
- Sensor read failure → Log error → Continue with next sensor
- MQTT publish failure → Log error → Continue with next sensor
- **Non-blocking:** One sensor failure doesn't affect others

**Timing:** Serial execution (one sensor at a time)

---

### STEP 3: Perform Measurement

**File:** `src/services/sensor/sensor_manager.cpp` (lines 280-354)

**Code:**

```cpp
bool SensorManager::performMeasurement(uint8_t gpio, SensorReading& reading_out) {
    if (!initialized_) {
        LOG_ERROR("Sensor Manager not initialized");
        return false;
    }
    
    // Find sensor config
    SensorConfig* config = findSensorConfig(gpio);
    if (!config || !config->active) {
        LOG_WARNING("Sensor Manager: Sensor on GPIO " + String(gpio) + " not found or inactive");
        return false;
    }
    
    // Read raw value based on sensor type
    uint32_t raw_value = 0;
    
    if (config->sensor_type == "ph_sensor" || config->sensor_type == "ec_sensor") {
        // Analog sensor
        raw_value = readRawAnalog(gpio);
    } else if (config->sensor_type == "temperature_ds18b20") {
        // OneWire sensor
        int16_t raw_temp = 0;
        uint8_t rom[8] = {0};  // TODO: Store ROM code in SensorConfig
        if (readRawOneWire(gpio, rom, raw_temp)) {
            raw_value = (uint32_t)raw_temp;
        } else {
            reading_out.valid = false;
            reading_out.error_message = "OneWire read failed";
            return false;
        }
    } else if (config->sensor_type == "temperature_sht31" || 
               config->sensor_type.startsWith("i2c_")) {
        // I2C sensor
        uint8_t buffer[6] = {0};
        uint8_t device_addr = 0x44;  // Default SHT31 address
        if (readRawI2C(gpio, device_addr, 0x00, buffer, 6)) {
            raw_value = (uint32_t)(buffer[0] << 8 | buffer[1]);
        } else {
            reading_out.valid = false;
            reading_out.error_message = "I2C read failed";
            return false;
        }
    } else {
        // Unknown sensor type - try analog
        raw_value = readRawAnalog(gpio);
    }
    
    // Send raw data to Pi for processing
    RawSensorData raw_data;
    raw_data.gpio = gpio;
    raw_data.sensor_type = config->sensor_type;
    raw_data.raw_value = raw_value;
    raw_data.timestamp = millis();
    raw_data.metadata = "{}";
    
    ProcessedSensorData processed;
    bool success = pi_processor_->sendRawData(raw_data, processed);
    
    // Fill reading output
    reading_out.gpio = gpio;
    reading_out.sensor_type = config->sensor_type;
    reading_out.raw_value = raw_value;
    reading_out.processed_value = processed.value;
    reading_out.unit = processed.unit;
    reading_out.quality = processed.quality;
    reading_out.timestamp = millis();
    reading_out.valid = processed.valid;
    reading_out.error_message = processed.error_message;
    
    // Update config
    config->last_raw_value = raw_value;
    config->last_reading = millis();
    
    return success;
}
```

**Sensor Type Routing:**

| Sensor Type | Read Method | Interface |
|-------------|-------------|-----------|
| `ph_sensor` | `readRawAnalog()` | ADC (12-bit, 0-4095) |
| `ec_sensor` | `readRawAnalog()` | ADC |
| `temperature_ds18b20` | `readRawOneWire()` | OneWire |
| `temperature_sht31` | `readRawI2C()` | I2C (0x44) |
| `i2c_*` (generic) | `readRawI2C()` | I2C |
| Unknown | `readRawAnalog()` | ADC (fallback) |

**Pi-Enhanced Processing:**

El Trabajante uses a **Server-Centric** architecture where raw sensor data is sent to God-Kaiser (Pi-Enhanced Processor) for calibration and processing:

1. ESP reads **raw value** (ADC, I2C bytes, OneWire temp)
2. ESP sends raw value to Pi-Enhanced Processor
3. Pi applies calibration, filtering, unit conversion
4. Pi returns **processed value** with unit and quality

**Benefits:**
- Calibration updates without reflashing ESP
- Complex algorithms on powerful Pi
- Consistent processing across all ESPs

---

### STEP 3a: Read Raw Analog

**File:** `src/services/sensor/sensor_manager.cpp` (lines 389-399)

**Code:**

```cpp
uint32_t SensorManager::readRawAnalog(uint8_t gpio) {
    if (!initialized_) {
        return 0;
    }
    
    // Configure pin as analog input if needed
    gpio_manager_->configurePinMode(gpio, INPUT);
    
    // Read analog value (ESP32: 0-4095)
    return analogRead(gpio);
}
```

**ESP32 ADC Specifications:**
- **Resolution:** 12-bit (0-4095)
- **Voltage Range:** 0-3.3V (default)
- **Attenuation:** Configurable (0dB, 2.5dB, 6dB, 11dB)
- **ADC1 Channels:** GPIO 32-39 (8 channels)
- **ADC2 Channels:** GPIO 0, 2, 4, 12-15, 25-27 (10 channels)

**Note:** ADC2 cannot be used when WiFi is active (hardware limitation)

**Timing:** ~5-10µs per read

---

### STEP 3b: Read Raw I2C

**File:** `src/services/sensor/sensor_manager.cpp` (lines 413-421)

**Code:**

```cpp
bool SensorManager::readRawI2C(uint8_t gpio, uint8_t device_address, 
                                uint8_t reg, uint8_t* buffer, size_t len) {
    if (!initialized_ || !i2c_bus_) {
        return false;
    }
    
    // Use I2C bus manager
    return i2c_bus_->readRaw(device_address, reg, buffer, len);
}
```

**I2C Communication:**
- **Bus:** Shared I2C bus (SDA/SCL pins)
- **Frequency:** 100kHz (standard mode)
- **Addressing:** 7-bit addresses (0x08-0x77)
- **Timing:** ~1-5ms per transaction

**Common I2C Sensors:**

| Sensor | Address | Registers | Data Format |
|--------|---------|-----------|-------------|
| SHT31 (temp/humidity) | 0x44 | 0x00 | 6 bytes (temp MSB, temp LSB, CRC, hum MSB, hum LSB, CRC) |
| BME280 (temp/pressure) | 0x76 | 0xF7 | 8 bytes (pressure, temp, humidity) |
| Generic I2C | Configurable | Configurable | Raw bytes |

**Error Detection:** I2C bus errors return false

---

### STEP 3c: Read Raw OneWire

**File:** `src/services/sensor/sensor_manager.cpp` (lines 423-430)

**Code:**

```cpp
bool SensorManager::readRawOneWire(uint8_t gpio, const uint8_t rom[8], int16_t& raw_value) {
    if (!initialized_ || !onewire_bus_) {
        return false;
    }
    
    // Use OneWire bus manager
    return onewire_bus_->readRawTemperature(rom, raw_value);
}
```

**OneWire Protocol:**
- **Single wire:** Data + power on one GPIO
- **ROM Code:** 8-byte unique device identifier
- **Resolution:** 9-12 bit configurable (0.5°C to 0.0625°C)
- **Timing:** ~750ms for 12-bit conversion

**DS18B20 Specific:**
- Temperature range: -55°C to +125°C
- Raw value: 16-bit signed integer (0.0625°C per bit)
- Example: 0x0191 = 25.0625°C

**Multiple Sensors:** Each sensor on OneWire bus has unique ROM code

---

### STEP 4: Build MQTT Payload

**File:** `src/services/sensor/sensor_manager.cpp` (lines 489-534)

**Code:**

```cpp
String SensorManager::buildMQTTPayload(const SensorReading& reading) const {
    String payload;
    payload.reserve(384);  // Increased for zone info
    
    // Get ESP ID and Zone info from ConfigManager
    ConfigManager& config = ConfigManager::getInstance();
    String esp_id = config.getESPId();
    
    // Phase 7: Get zone information from global variables
    extern KaiserZone g_kaiser;
    
    // Build JSON payload with zone information
    payload = "{";
    payload += "\"esp_id\":\"";
    payload += esp_id;
    payload += "\",";
    payload += "\"zone_id\":\"";
    payload += g_kaiser.zone_id;
    payload += "\",";
    payload += "\"subzone_id\":\"";
    payload += reading.subzone_id;  // From sensor config
    payload += "\",";
    payload += "\"gpio\":";
    payload += String(reading.gpio);
    payload += ",";
    payload += "\"sensor_type\":\"";
    payload += reading.sensor_type;
    payload += "\",";
    payload += "\"raw_value\":";
    payload += String(reading.raw_value);
    payload += ",";
    payload += "\"processed_value\":";
    payload += String(reading.processed_value);
    payload += ",";
    payload += "\"unit\":\"";
    payload += reading.unit;
    payload += "\",";
    payload += "\"quality\":\"";
    payload += reading.quality;
    payload += "\",";
    payload += "\"timestamp\":";
    payload += String(reading.timestamp);
    payload += "}";
    
    return payload;
}
```

**Payload Structure:**

```json
{
  "esp_id": "ESP_AB12CD",
  "zone_id": "greenhouse_zone_1",
  "subzone_id": "section_A",
  "gpio": 4,
  "sensor_type": "temp_ds18b20",
  "raw_value": 2350,
  "processed_value": 23.5,
  "unit": "°C",
  "quality": "good",
  "timestamp": 1234567890
}
```

**Field Descriptions:**

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `esp_id` | String | ConfigManager | ESP32 unique identifier |
| `zone_id` | String | Global g_kaiser | Hierarchical zone assignment |
| `subzone_id` | String | Sensor config | Sensor-specific subzone |
| `gpio` | Number | Sensor config | GPIO pin number |
| `sensor_type` | String | Sensor config | Sensor type identifier |
| `raw_value` | Number | Sensor read | Raw ADC/I2C/OneWire value |
| `processed_value` | Number | Pi processor | Calibrated value |
| `unit` | String | Pi processor | Unit of measurement |
| `quality` | String | Pi processor | Reading quality (good/fair/poor) |
| `timestamp` | Number | millis() | Milliseconds since boot |

**Memory:** ~256 bytes per payload (temporary, freed after publish)

---

### STEP 5: Publish to MQTT

**File:** `src/services/sensor/sensor_manager.cpp` (lines 469-487)

**Code:**

```cpp
void SensorManager::publishSensorReading(const SensorReading& reading) {
    if (!mqtt_client_ || !mqtt_client_->isConnected()) {
        LOG_WARNING("Sensor Manager: MQTT not connected, skipping publish");
        return;
    }
    
    // Build topic
    const char* topic = TopicBuilder::buildSensorDataTopic(reading.gpio);
    
    // Build payload
    String payload = buildMQTTPayload(reading);
    
    // Publish
    if (!mqtt_client_->publish(topic, payload, 1)) {
        LOG_ERROR("Sensor Manager: Failed to publish sensor data for GPIO " + String(reading.gpio));
        errorTracker.trackError(ERROR_MQTT_PUBLISH_FAILED, ERROR_SEVERITY_ERROR,
                               "Failed to publish sensor data");
    }
}
```

**Topic Generation:**

**File:** `src/utils/topic_builder.cpp` (lines 53-58)

```cpp
const char* TopicBuilder::buildSensorDataTopic(uint8_t gpio) {
  int written = snprintf(topic_buffer_, sizeof(topic_buffer_), 
                         "kaiser/%s/esp/%s/sensor/%d/data",
                         kaiser_id_, esp_id_, gpio);
  return validateTopicBuffer(written);
}
```

**Topic Pattern:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data`

**Example Topics:**
- `kaiser/god/esp/ESP_AB12CD/sensor/4/data`
- `kaiser/kaiser_001/esp/ESP_XY789/sensor/32/data`

**MQTT Parameters:**
- **QoS:** 1 (at least once delivery)
- **Retained:** false (not persistent)
- **Payload Format:** JSON UTF-8

**MQTT Publish Behavior:**
- Success → Returns true
- Failure → Returns false, logs error, continues
- Offline → Skipped with warning

**Offline Buffer:** MQTT client can buffer messages if broker temporarily unavailable (max 100 messages)

---

## Complete Flow Sequence Diagram

```
loop() calls performAllMeasurements()
  │
  ├─► Check timer (30s interval)
  │     └─► Too soon? → Return
  │
  ├─► For each active sensor:
  │     │
  │     ├─► Find sensor config
  │     │
  │     ├─► Read raw value
  │     │     ├─► Analog: readRawAnalog()
  │     │     ├─► I2C: readRawI2C()
  │     │     └─► OneWire: readRawOneWire()
  │     │
  │     ├─► Send to Pi-Enhanced Processor
  │     │     └─► Receive processed value
  │     │
  │     ├─► Build MQTT payload (JSON)
  │     │
  │     ├─► Publish to MQTT
  │     │     └─► Topic: kaiser/.../sensor/{gpio}/data
  │     │
  │     └─► Continue to next sensor
  │
  └─► Update last_measurement_time
```

---

## Timing Analysis

### Per Measurement Cycle

| Operation | Duration | Notes |
|-----------|----------|-------|
| Timer check | <1µs | Simple comparison |
| Sensor iteration | Variable | Depends on count |
| Analog read | 10µs | Fast |
| I2C read | 1-5ms | Bus speed dependent |
| OneWire read | 750ms | DS18B20 conversion |
| Pi processing | 10-50ms | Network latency |
| JSON build | <5ms | String concatenation |
| MQTT publish | 10-20ms | Network latency |

### Total Cycle Time

**Best Case (analog only):** ~50ms per sensor

**Typical Case (mixed sensors):** 100-200ms per sensor

**Worst Case (OneWire):** ~800ms per sensor

**Example:** 5 sensors (2 analog, 2 I2C, 1 OneWire):
- 2 × 50ms = 100ms
- 2 × 100ms = 200ms
- 1 × 800ms = 800ms
- **Total:** ~1100ms (~1.1 seconds)

### Measurement Interval

**Default:** 30 seconds

**Configurable Range:** 1 second to 1 hour

**Considerations:**
- Faster → More data, more MQTT traffic, more power
- Slower → Less responsive, less data resolution
- **Recommendation:** 10-60 seconds for most applications

---

## Error Handling

### Sensor Read Failure

**Causes:**
- Sensor disconnected
- I2C bus error
- OneWire CRC error
- GPIO conflict

**Behavior:**
1. Log error message
2. Set `reading.valid = false`
3. Set `reading.error_message`
4. Return false from performMeasurement()
5. Skip MQTT publishing
6. **Continue with next sensor**

**Error Tracking:**

```cpp
errorTracker.trackError(ERROR_SENSOR_READ_FAILED, 
                       ERROR_SEVERITY_ERROR,
                       "Sensor read failed on GPIO X");
```

---

### MQTT Publish Failure

**Causes:**
- MQTT not connected
- Network timeout
- Broker unavailable
- Message too large

**Behavior:**
1. Log error message
2. Track error via ErrorTracker
3. **Continue with next sensor**
4. Message lost (no retry for this reading)

**Offline Buffer:** If configured, messages buffered for later delivery

---

### Pi Processor Failure

**Causes:**
- God-Kaiser server down
- Network partition
- Processing error

**Behavior:**
1. Publish raw value only
2. Set processed_value = 0
3. Set unit = "raw"
4. Set quality = "unknown"
5. **Continue measurement cycle**

**Degraded Mode:** ESP continues operating with raw data

---

## Memory Usage

### Stack Memory

| Allocation | Size | Scope |
|------------|------|-------|
| SensorReading struct | ~48 bytes | Per sensor |
| JSON payload buffer | ~384 bytes | Temporary |
| I2C buffer | ~32 bytes | Temporary |

**Total per measurement:** ~500 bytes stack

---

### Heap Memory

**Static Allocations:**
- Sensor registry: 10 × SensorConfig = ~800 bytes
- MQTT offline buffer: 100 × MQTTMessage = ~25KB

**Dynamic Allocations:**
- JSON payload: ~256 bytes (temporary, freed immediately)

**Total:** ~26KB baseline + temporary allocations

---

### Memory Leak Prevention

- All temporary String objects freed after publish
- No dynamic allocations in hot path
- Fixed-size buffers prevent fragmentation
- Regular garbage collection by ESP32 runtime

---

## Performance Optimization

### Current Optimizations

1. **Pre-allocated buffers:** No malloc() in measurement loop
2. **String reserve():** Prevents reallocation during JSON build
3. **Early return:** Skip inactive sensors immediately
4. **Non-blocking:** Sensor failures don't block others

### Future Optimizations

1. **Batch publishing:** Collect multiple readings, publish as array
2. **Delta compression:** Only publish changed values
3. **Adaptive interval:** Faster for rapidly changing sensors
4. **Hardware averaging:** Use ESP32 ADC averaging feature

---

## MQTT Traffic Analysis

### Message Rate

**Default (30s interval, 5 sensors):**
- 5 messages / 30s = 0.167 messages/second
- ~10 messages/minute
- ~600 messages/hour
- ~14,400 messages/day

### Bandwidth

**Per Message:**
- Topic: ~60 bytes
- Payload: ~256 bytes
- Total: ~316 bytes

**Per Day (5 sensors, 30s interval):**
- 14,400 messages × 316 bytes = 4.5 MB/day
- ~135 MB/month

**Scalable:** 100 ESPs × 5 sensors = 450 MB/month (manageable)

---

## Integration with God-Kaiser

### Message Flow

```
ESP32 → MQTT Broker → God-Kaiser
```

### God-Kaiser Processing

1. **Receive** sensor data on subscribed topics
2. **Parse** JSON payload
3. **Store** in time-series database (InfluxDB/TimescaleDB)
4. **Process** for automation rules
5. **Display** in web dashboard
6. **Alert** on threshold violations

### Data Retention

- **Real-time:** Last 24 hours in memory
- **Historical:** Downsampled to 1-minute averages
- **Long-term:** Daily aggregates

---

## Debugging

### Enable Debug Logging

```cpp
logger.setLogLevel(LOG_DEBUG);
```

**Output:** Full sensor readings with timing information

### Serial Monitor Output Example

```
[INFO] Sensor Manager: Starting measurement cycle
[DEBUG] Sensor GPIO 4: Reading analog value
[DEBUG]   Raw value: 2048
[DEBUG]   Pi processed: 2.5V
[INFO] Published sensor data: kaiser/god/esp/ESP_AB12CD/sensor/4/data
[DEBUG] Measurement cycle complete (150ms)
```

### MQTT Message Inspection

**Subscribe to all sensor topics:**

```bash
mosquitto_sub -h 192.168.0.198 -p 8883 -t "kaiser/+/esp/+/sensor/+/data" -v
```

**Output:**

```
kaiser/god/esp/ESP_AB12CD/sensor/4/data {"esp_id":"ESP_AB12CD","zone_id":"greenhouse_zone_1",...}
```

---

## Common Issues

### No Sensor Data Published

**Symptoms:** MQTT messages not arriving at broker

**Diagnosis:**
1. Check MQTT connection: `mqttClient.isConnected()`
2. Check sensor count: `sensorManager.getActiveSensorCount()`
3. Enable DEBUG logging
4. Verify measurement interval

**Solutions:**
- Configure sensors via MQTT
- Check WiFi/MQTT connection
- Reduce measurement interval for testing

---

### Incorrect Sensor Values

**Symptoms:** Values don't match expected range

**Diagnosis:**
1. Check raw_value in MQTT payload
2. Verify sensor type matches actual sensor
3. Check GPIO wiring
4. Test sensor with multimeter

**Solutions:**
- Reconfigure sensor with correct type
- Check sensor power supply
- Verify GPIO pin assignment
- Update Pi-Enhanced calibration

---

### Slow Measurement Cycle

**Symptoms:** Loop delays, watchdog resets

**Diagnosis:**
1. Check sensor count
2. Check OneWire sensor count (slow)
3. Enable timing logs

**Solutions:**
- Reduce sensor count
- Increase measurement interval
- Use faster sensors (I2C instead of OneWire)
- Parallelize sensor reads (future feature)

---

## Next Flows

After sensor reading:

→ [Actuator Command Flow](03-actuator-command-flow.md) - For automation based on sensor data  
→ [Runtime Sensor Config Flow](04-runtime-sensor-config-flow.md) - For adding/modifying sensors  
→ [MQTT Message Routing](06-mqtt-message-routing-flow.md) - For understanding message dispatch  

---

## Related Documentation

- [Boot Sequence](01-boot-sequence.md) - Sensor Manager initialization
- `docs/API_REFERENCE.md` - SensorManager API
- `docs/NVS_KEYS.md` - Sensor config persistence
- `src/models/sensor_types.h` - Sensor data structures

---

**End of Sensor Reading Flow Documentation**

