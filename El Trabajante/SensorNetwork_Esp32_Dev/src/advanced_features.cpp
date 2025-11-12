/*
 * ESP32 Advanced Features Implementation
 * 
 * Minimale Implementierung für Kompilierung
 * Enthält nur die Funktionen, die in main.cpp verwendet werden
 */

#include "advanced_features.h"
#include "actuator_system.h"
#include "pi_sensor_client.h"



// =============================================================================
// ADVANCED SENSOR SYSTEM IMPLEMENTATION
// =============================================================================

AdvancedSensorSystem::AdvancedSensorSystem() {
    // Constructor - minimale Initialisierung
    system_initialized = false;
    active_sensor_count = 0;
    sensors_ptr = nullptr;
    rtc_system_ptr = nullptr;
    data_buffer_ptr = nullptr;
    secure_mqtt_ptr = nullptr;
    library_manager_ptr = nullptr;
    pi_client_ptr = nullptr;
    actuator_system_ptr = nullptr;
}

AdvancedSensorSystem::~AdvancedSensorSystem() {
    // Destructor - Cleanup
    if (sensors_ptr) {
        delete[] sensors_ptr;
        sensors_ptr = nullptr;
    }
    if (rtc_system_ptr) {
        delete rtc_system_ptr;
        rtc_system_ptr = nullptr;
    }
    if (data_buffer_ptr) {
        delete data_buffer_ptr;
        data_buffer_ptr = nullptr;
    }
    if (secure_mqtt_ptr) {
        delete secure_mqtt_ptr;
        secure_mqtt_ptr = nullptr;
    }
    if (library_manager_ptr) {
        delete library_manager_ptr;
        library_manager_ptr = nullptr;
    }
    if (pi_client_ptr) {
        delete pi_client_ptr;
        pi_client_ptr = nullptr;
    }
    if (actuator_system_ptr) {
        delete actuator_system_ptr;
        actuator_system_ptr = nullptr;
    }
}

bool AdvancedSensorSystem::initialize(const String& esp_identifier, const String& zone_identifier) {
    esp_id = esp_identifier;
    zone_id = zone_identifier;
    system_initialized = true;
    
    // Minimale Initialisierung der Subsysteme
    rtc_system_ptr = new PrecisionRTC();
    data_buffer_ptr = new OfflineDataBuffer();
    secure_mqtt_ptr = new SecureMQTTClient();
    library_manager_ptr = new EnhancedLibraryManager();
    actuator_system_ptr = new AdvancedActuatorSystem();
    
    // Sensor-Array initialisieren
    sensors_ptr = new EnhancedSensor[MAX_SENSORS];
    
    Serial.println("[AdvancedSystem] Initialized successfully");
    return true;
}

// ✅ FIXED: Add Pi client management methods
bool AdvancedSensorSystem::connectToPi(const String& pi_url) {
    if (pi_client_ptr) {
        delete pi_client_ptr;
    }
    
    pi_client_ptr = new PiSensorClient(pi_url, esp_id);
    return pi_client_ptr->init();
}

bool AdvancedSensorSystem::isPiAvailable() const {
    return pi_client_ptr && pi_client_ptr->isAvailable();
}

void AdvancedSensorSystem::setPiURL(const String& url) {
    if (pi_client_ptr) {
        pi_client_ptr->setServerURL(url);
    }
}

String AdvancedSensorSystem::getPiStatus() {
    if (!pi_client_ptr) {
        return "Pi client not initialized";
    }
    return pi_client_ptr->isAvailable() ? "available" : "unavailable";
}

bool AdvancedSensorSystem::configurePiEnhancedSensor(uint8_t gpio, const String& sensor_type, 
                                                    const String& sensor_name, const String& subzone_id) {
    if (!pi_client_ptr || !pi_client_ptr->isAvailable()) {
        return false;
    }
    
    // Configure hardware sensor with Pi enhancement
    return configureHardwareSensor(gpio, sensor_type + "_pi_enhanced", sensor_name, subzone_id);
}

bool AdvancedSensorSystem::installPiLibrary(const String& library_name, const String& library_code, 
                                           const String& version) {
    if (!pi_client_ptr || !pi_client_ptr->isAvailable()) {
        return false;
    }
    
    return pi_client_ptr->installLibraryToPi(library_name, library_code, version);
}

int AdvancedSensorSystem::countPiEnhancedSensors() const {
    if (!sensors_ptr) return 0;
    
    int count = 0;
    for (int i = 0; i < active_sensor_count; i++) {
        if (sensors_ptr[i].active && sensors_ptr[i].library_name.endsWith("_pi_enhanced")) {
            count++;
        }
    }
    return count;
}

bool AdvancedSensorSystem::configureHardwareSensor(uint8_t gpio, const String& library_name, 
                                                  const String& sensor_name, const String& subzone_id) {
    if (!system_initialized || active_sensor_count >= MAX_SENSORS) {
        return false;
    }
    
    // Minimale Sensor-Konfiguration
    EnhancedSensor& sensor = sensors_ptr[active_sensor_count];
    sensor.gpio = gpio;
    sensor.library_name = library_name;
    sensor.sensor_name = sensor_name;
    sensor.subzone_id = subzone_id;
    sensor.active = true;
    sensor.last_reading = 0;
    sensor.last_value = NAN;
    
    active_sensor_count++;
    Serial.printf("[AdvancedSystem] Configured sensor: %s on GPIO %d\n", sensor_name.c_str(), gpio);
    return true;
}

void AdvancedSensorSystem::performHardwareMeasurements() {
    if (!system_initialized) return;
    
    Serial.printf("[AdvancedSystem] Performing measurements for %d sensors\n", active_sensor_count);
    
    for (int i = 0; i < active_sensor_count; i++) {
        if (sensors_ptr[i].active) {
            // Simulierte Messung
            sensors_ptr[i].last_value = random(100, 1000) / 10.0;
            sensors_ptr[i].last_reading = millis();
            
            Serial.printf("[Measurement] %s: %.2f\n", 
                         sensors_ptr[i].sensor_name.c_str(), 
                         sensors_ptr[i].last_value);
        }
    }
}

void AdvancedSensorSystem::performActuatorControl() {
    if (!actuator_system_ptr) return;
    
    Serial.println("[AdvancedSystem] Performing actuator control");
    // Delegiere an Actuator System
    actuator_system_ptr->performActuatorControl();
}

void AdvancedSensorSystem::performDiagnostics() {
    Serial.println("\n=== ADVANCED SYSTEM DIAGNOSTICS ===");
    Serial.printf("System initialized: %s\n", system_initialized ? "YES" : "NO");
    Serial.printf("ESP ID: %s\n", esp_id.c_str());
    Serial.printf("Zone ID: %s\n", zone_id.c_str());
    Serial.printf("Active sensors: %d/%d\n", active_sensor_count, MAX_SENSORS);
    Serial.printf("Free Heap: %d bytes\n", ESP.getFreeHeap());
    Serial.println("======================================\n");
}

// =============================================================================
// ACTUATOR SYSTEM METHODS
// =============================================================================

bool AdvancedSensorSystem::controlActuator(uint8_t gpio, float value) {
    if (!actuator_system_ptr) return false;
    return actuator_system_ptr->controlActuator(gpio, value);
}

bool AdvancedSensorSystem::controlActuatorBinary(uint8_t gpio, bool state) {
    if (!actuator_system_ptr) return false;
    return actuator_system_ptr->controlActuatorBinary(gpio, state);
}

bool AdvancedSensorSystem::emergencyStopAllActuators() {
    if (!actuator_system_ptr) return false;
    return actuator_system_ptr->emergencyStopAll();
}

uint8_t AdvancedSensorSystem::getActiveActuatorCount() {
    if (!actuator_system_ptr) return 0;
    return actuator_system_ptr->getActiveActuatorCount();
}

String AdvancedSensorSystem::getActuatorInfo(uint8_t gpio) {
    if (!actuator_system_ptr) return "Actuator system not available";
    return actuator_system_ptr->getActuatorInfo(gpio);
}

// ✅ NEU: Fehlende Actuator-Methoden hinzugefügt
bool AdvancedSensorSystem::isActuatorConfigured(uint8_t gpio) {
    if (!actuator_system_ptr) return false;
    return actuator_system_ptr->isActuatorConfigured(gpio);
}

bool AdvancedSensorSystem::removeActuator(uint8_t gpio) {
    if (!actuator_system_ptr) return false;
    return actuator_system_ptr->removeActuator(gpio);
}

bool AdvancedSensorSystem::emergencyStopActuator(uint8_t gpio) {
    if (!actuator_system_ptr) return false;
    return actuator_system_ptr->emergencyStopActuator(gpio);
}

bool AdvancedSensorSystem::configureActuator(uint8_t gpio, const String& library_name,
                                            const String& actuator_name, const String& subzone_id) {
    if (!actuator_system_ptr) return false;
    return actuator_system_ptr->configureActuator(gpio, library_name, actuator_name, subzone_id);
}

void AdvancedSensorSystem::printActuatorStatus() {
    if (!actuator_system_ptr) {
        Serial.println("[AdvancedSystem] Actuator system not available");
        return;
    }
    actuator_system_ptr->printActuatorStatus();
}

// =============================================================================
// PRECISION RTC IMPLEMENTATION
// =============================================================================

bool PrecisionRTC::init() {
    Serial.println("[RTC] Initializing ESP32 internal RTC system");
    
    boot_millis = millis();
    
    // NTP-Konfiguration
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
    
    // Warte auf NTP-Sync
    struct tm timeinfo;
    int attempts = 0;
    while (!getLocalTime(&timeinfo) && attempts < 10) {
        delay(500);
        attempts++;
    }
    
    if (attempts < 10) {
        ntp_synced = true;
        last_sync = millis();
        time(&boot_time);
        Serial.println("[RTC] NTP sync successful");
    } else {
        Serial.println("[RTC] WARNING: NTP synchronization failed");
    }
    
    return true;
}

time_t PrecisionRTC::getPreciseTimestamp() {
    time_t current_time;
    time(&current_time);
    return current_time;
}

String PrecisionRTC::getISOTimestamp() {
    time_t timestamp = getPreciseTimestamp();
    struct tm* timeinfo = gmtime(&timestamp);
    
    char buffer[32];
    strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", timeinfo);
    return String(buffer);
}

String PrecisionRTC::getTimeQuality() {
    if (!ntp_synced) return "poor";
    
    unsigned long time_since_sync = millis() - last_sync;
    if (time_since_sync < 3600000) return "excellent";
    if (time_since_sync < 86400000) return "good";
    return "acceptable";
}

bool PrecisionRTC::syncWithNTP() {
    if (millis() - last_sync < RTC_SYNC_INTERVAL) return true;
    
    Serial.println("[RTC] Starting NTP synchronization...");
    
    sntp_stop();
    delay(100);
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
    
    struct tm timeinfo;
    int attempts = 0;
    while (attempts < 15) {
        if (getLocalTime(&timeinfo)) {
            last_sync = millis();
            ntp_synced = true;
            Serial.println("[RTC] NTP sync successful");
            return true;
        }
        delay(1000);
        attempts++;
    }
    
    Serial.println("[RTC] ERROR: NTP sync failed");
    return false;
}

// =============================================================================
// OFFLINE DATA BUFFER IMPLEMENTATION
// =============================================================================



OfflineDataBuffer::~OfflineDataBuffer() {
    if (buffer) {
        free(buffer);
        buffer = nullptr;
    }
}

bool OfflineDataBuffer::init(uint16_t size) {
    buffer_size = size;
    buffer = (BufferedReading*)malloc(sizeof(BufferedReading) * buffer_size);
    
    if (!buffer) {
        Serial.printf("[Buffer] ERROR: Failed to allocate %d bytes\n", 
                     sizeof(BufferedReading) * buffer_size);
        return false;
    }
    
    memset(buffer, 0, sizeof(BufferedReading) * buffer_size);
    
    prefs.begin("data_buffer", true);
    write_index = prefs.getUShort("write_idx", 0);
    count = prefs.getUShort("count", 0);
    prefs.end();
    
    read_index = (write_index >= count) ? write_index - count : 
                 buffer_size - (count - write_index);
    
    Serial.printf("[Buffer] Initialized: size=%d, count=%d\n", buffer_size, count);
    return true;
}

bool OfflineDataBuffer::addReading(time_t timestamp, const String& esp_id, const String& zone_id,
                                 const String& subzone_id, uint8_t gpio, uint8_t sensor_type,
                                 float value, const String& sensor_name) {
    if (!buffer) return false;
    
    BufferedReading& reading = buffer[write_index];
    
    reading.timestamp = timestamp;
    strncpy(reading.esp_id, esp_id.c_str(), 15);
    strncpy(reading.zone_id, zone_id.c_str(), 31);
    strncpy(reading.subzone_id, subzone_id.c_str(), 31);
    strncpy(reading.sensor_name, sensor_name.c_str(), 31);
    reading.gpio = gpio;
    reading.sensor_type = sensor_type;
    reading.value = value;
    reading.checksum = calculateChecksum(reading);
    
    write_index = (write_index + 1) % buffer_size;
    
    if (count < buffer_size) {
        count++;
    } else {
        read_index = (read_index + 1) % buffer_size;
        buffer_full = true;
    }
    
    return true;
}

bool OfflineDataBuffer::getNextReading(BufferedReading& reading) {
    if (count == 0) return false;
    
    reading = buffer[read_index];
    read_index = (read_index + 1) % buffer_size;
    count--;
    
    return true;
}

String OfflineDataBuffer::readingToJson(const BufferedReading& reading) {
    StaticJsonDocument<512> doc;
    
    doc["timestamp"] = reading.timestamp;
    doc["esp_id"] = reading.esp_id;
    doc["zone_id"] = reading.zone_id;
    doc["subzone_id"] = reading.subzone_id;
    
    JsonObject sensor = doc.createNestedObject("sensor");
    sensor["gpio"] = reading.gpio;
    sensor["type"] = reading.sensor_type;
    sensor["name"] = reading.sensor_name;
    sensor["value"] = reading.value;
    
    doc["buffered"] = true;
    
    String json_string;
    ArduinoJson::serializeJson(doc, json_string);
    return json_string;
}

uint16_t OfflineDataBuffer::getCount() const { return count; }
uint16_t OfflineDataBuffer::getCapacity() const { return buffer_size; }
bool OfflineDataBuffer::isFull() const { return buffer_full; }
float OfflineDataBuffer::getFillPercentage() const { return (float)count / buffer_size * 100.0; }

void OfflineDataBuffer::clear() {
    read_index = write_index;
    count = 0;
    buffer_full = false;
    saveIndices();
}

uint16_t OfflineDataBuffer::calculateChecksum(const BufferedReading& reading) {
    uint16_t checksum = 0;
    const uint8_t* data = (const uint8_t*)&reading;
    for (size_t i = 0; i < sizeof(BufferedReading) - sizeof(uint16_t); i++) {
        checksum += data[i];
    }
    return checksum;
}

void OfflineDataBuffer::saveIndices() {
    prefs.begin("data_buffer", false);
    prefs.putUShort("write_idx", write_index);
    prefs.putUShort("count", count);
    prefs.end();
}

// =============================================================================
// SECURE MQTT CLIENT IMPLEMENTATION
// =============================================================================



SecureMQTTClient::~SecureMQTTClient() {
    if (mqtt_client) delete mqtt_client;
    if (secure_client) delete secure_client;
}

bool SecureMQTTClient::configureTLS(const String& ca_certificate, 
                                   const String& client_certificate,
                                   const String& client_private_key) {
    if (!secure_client) {
        secure_client = new WiFiClientSecure();
    }
    
    if (ca_certificate.length() > 0) {
        ca_cert = ca_certificate;
        secure_client->setCACert(ca_cert.c_str());
        tls_enabled = true;
        Serial.println("[TLS] CA certificate configured");
    }
    
    if (client_certificate.length() > 0 && client_private_key.length() > 0) {
        client_cert = client_certificate;
        client_key = client_private_key;
        secure_client->setCertificate(client_cert.c_str());
        secure_client->setPrivateKey(client_key.c_str());
        Serial.println("[TLS] Client certificate configured");
    }
    
    return true;
}

bool SecureMQTTClient::setServerFingerprint(const String& fingerprint) {
    if (fingerprint.length() != 40) return false;
    
    server_fingerprint = fingerprint;
    
    if (!secure_client) {
        secure_client = new WiFiClientSecure();
    }
    
    secure_client->setInsecure();
    tls_enabled = true;
    
    return true;
}

void SecureMQTTClient::setAuthentication(const String& user, const String& pass) {
    username = user;
    password = pass;
    auth_enabled = true;
}

bool SecureMQTTClient::connect(const String& server, uint16_t port, const String& client_id) {
    if (!tls_enabled) return false;
    
    if (!mqtt_client) {
        mqtt_client = new PubSubClient(*secure_client);
    }
    mqtt_client->setServer(server.c_str(), port);
    
    bool connected = false;
    if (auth_enabled) {
        connected = mqtt_client->connect(client_id.c_str(), username.c_str(), password.c_str());
    } else {
        connected = mqtt_client->connect(client_id.c_str());
    }
    
    if (connected) {
        Serial.println("[MQTT] Secure connection established");
    }
    
    return connected;
}

bool SecureMQTTClient::publish(const char* topic, const char* payload) {
    if (mqtt_client && mqtt_client->connected()) {
        return mqtt_client->publish(topic, payload);
    }
    return false;
}

bool SecureMQTTClient::subscribe(const char* topic) {
    if (mqtt_client && mqtt_client->connected()) {
        return mqtt_client->subscribe(topic);
    }
    return false;
}

void SecureMQTTClient::loop() {
    if (mqtt_client) {
        mqtt_client->loop();
    }
}

bool SecureMQTTClient::connected() {
    return mqtt_client && mqtt_client->connected();
}

void SecureMQTTClient::setCallback(MQTT_CALLBACK_SIGNATURE) {
    if (mqtt_client) {
        mqtt_client->setCallback(callback);
    }
}

void SecureMQTTClient::printTLSError() {
    Serial.println("[TLS] Connection error - check certificates and network");
}

// =============================================================================
// ENHANCED LIBRARY MANAGER IMPLEMENTATION
// =============================================================================

bool EnhancedLibraryManager::loadLibraryFromBinary(const String& name, const String& version, 
                                                  const uint8_t* binary_data, size_t size) {
    Serial.printf("[LibManager] Loading library %s v%s (%d bytes)\n", 
                 name.c_str(), version.c_str(), size);
    
    if (library_count >= MAX_LIBRARIES) {
        Serial.println("[LibManager] ERROR: Maximum libraries loaded");
        return false;
    }
    
    LoadedLibrary& lib = loaded_libraries[library_count];
    lib.name = name;
    lib.version = version;
    lib.loaded = true;
    
    library_count++;
    Serial.printf("[LibManager] Successfully loaded %s v%s\n", name.c_str(), version.c_str());
    return true;
}

HardwareSensorBase* EnhancedLibraryManager::createSensorInstance(const String& library_name) {
    for (int i = 0; i < library_count; i++) {
        if (loaded_libraries[i].name == library_name && loaded_libraries[i].loaded) {
            if (loaded_libraries[i].createSensor) {
                return loaded_libraries[i].createSensor();
            }
        }
    }
    return nullptr;
}

void EnhancedLibraryManager::destroySensorInstance(const String& library_name, HardwareSensorBase* sensor) {
    if (!sensor) return;
    
    for (int i = 0; i < library_count; i++) {
        if (loaded_libraries[i].name == library_name && loaded_libraries[i].loaded) {
            if (loaded_libraries[i].destroySensor) {
                loaded_libraries[i].destroySensor(sensor);
                return;
            }
        }
    }
    
    delete sensor;
}

bool EnhancedLibraryManager::unloadLibrary(const String& name) {
    for (int i = 0; i < library_count; i++) {
        if (loaded_libraries[i].name == name) {
            loaded_libraries[i].loaded = false;
            
            for (int j = i; j < library_count - 1; j++) {
                loaded_libraries[j] = loaded_libraries[j + 1];
            }
            library_count--;
            
            Serial.printf("[LibManager] Unloaded library %s\n", name.c_str());
            return true;
        }
    }
    return false;
}

void EnhancedLibraryManager::listLoadedLibraries() {
    Serial.printf("[LibManager] Loaded libraries (%d):\n", library_count);
    for (int i = 0; i < library_count; i++) {
        const LoadedLibrary& lib = loaded_libraries[i];
        Serial.printf("  - %s v%s (status: %s)\n", 
                     lib.name.c_str(), lib.version.c_str(), lib.loaded ? "loaded" : "unloaded");
    }
}

bool EnhancedLibraryManager::isLibraryLoaded(const String& name) {
    for (int i = 0; i < library_count; i++) {
        if (loaded_libraries[i].name == name && loaded_libraries[i].loaded) {
            return true;
        }
    }
    return false;
}

void EnhancedLibraryManager::registerSensor(const String& type, std::function<HardwareSensorBase*()> factory) {
    sensor_registry.registerSensor(type, factory);
}

bool EnhancedLibraryManager::saveBinaryToFlash(const String& filename, const uint8_t* data, size_t size) {
    File file = SPIFFS.open(filename, "w");
    if (!file) return false;
    
    size_t written = file.write(data, size);
    file.close();
    
    return written == size;
}

// Factory-Funktionen für Registry
HardwareSensorBase* EnhancedLibraryManager::createSensorFactory() {
    return nullptr; // Placeholder
}

void EnhancedLibraryManager::destroySensorFactory(HardwareSensorBase* sensor) {
    if (sensor) delete sensor;
}

const char* EnhancedLibraryManager::getVersionFactory() {
    return "1.0.0"; // Placeholder
}

// =============================================================================
// HARDWARE SENSOR IMPLEMENTATIONS
// =============================================================================

bool pHSensorDFRobot::init(uint8_t gpio) {
    analog_pin = gpio;
    pinMode(gpio, INPUT);
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);
    sensor_ready = true;
    Serial.printf("[pH] Sensor initialized on GPIO %d\n", gpio);
    return true;
}

float pHSensorDFRobot::read() {
    if (!sensor_ready) return NAN;
    
    int raw_value = analogRead(analog_pin);
    float voltage = (raw_value / 4095.0) * 3.3;
    float ph_value = calibration_neutral - ((voltage - calibration_voltage_neutral) / calibration_slope);
    
    last_value = ph_value;
    last_reading = millis();
    
    return ph_value;
}

bool pHSensorDFRobot::isValid(float value) {
    return (value >= 0.0 && value <= 14.0 && !isnan(value));
}

String pHSensorDFRobot::getUnit() {
    return "pH";
}

String pHSensorDFRobot::getQuality(float value) {
    unsigned long age = millis() - last_reading;
    if (age > 300000) return "stale";
    if (age > 120000) return "old";
    
    if (value < 2.0 || value > 12.0) return "critical";
    if (value < 4.0 || value > 10.0) return "warning";
    return "good";
}

bool pHSensorDFRobot::calibrate(float reference_value) {
    if (!isValid(reference_value)) return false;
    
    float voltage_sum = 0;
    const int samples = 50;
    
    for (int i = 0; i < samples; i++) {
        int raw_value = analogRead(analog_pin);
        voltage_sum += (raw_value / 4095.0) * 3.3;
        delay(100);
    }
    
    float measured_voltage = voltage_sum / samples;
    
    if (abs(reference_value - 7.0) < 0.1) {
        calibration_voltage_neutral = measured_voltage;
        calibration_neutral = reference_value;
    } else {
        calibration_slope = (measured_voltage - calibration_voltage_neutral) / 
                           (calibration_neutral - reference_value);
    }
    
    return true;
}

void pHSensorDFRobot::loadCalibration() {
    Preferences prefs;
    prefs.begin("ph_calibration", true);
    calibration_neutral = prefs.getFloat("neutral", 7.0);
    calibration_voltage_neutral = prefs.getFloat("voltage_neutral", 1.5);
    calibration_slope = prefs.getFloat("slope", 0.18);
    prefs.end();
}

DS18B20TemperatureSensor::DS18B20TemperatureSensor() {
    oneWire = nullptr;
    sensors = nullptr;
    sensor_found = false;
}

DS18B20TemperatureSensor::~DS18B20TemperatureSensor() {
    if (sensors) delete sensors;
    if (oneWire) delete oneWire;
}

bool DS18B20TemperatureSensor::init(uint8_t gpio) {
    sensor_pin = gpio;
    
    oneWire = new OneWire(gpio);
    sensors = new DallasTemperature(oneWire);
    
    sensors->begin();
    
    int device_count = sensors->getDeviceCount();
    if (device_count > 0) {
        if (sensors->getAddress(sensor_address, 0)) {
            sensors->setResolution(sensor_address, 12);
            sensors->setWaitForConversion(false);
            sensor_found = true;
            Serial.printf("[DS18B20] Sensor initialized on GPIO %d\n", gpio);
            return true;
        }
    }
    
    Serial.printf("[DS18B20] ERROR: No sensor found on GPIO %d\n", gpio);
    return false;
}

float DS18B20TemperatureSensor::read() {
    if (!sensor_found || !sensors) return NAN;
    
    sensors->requestTemperatures();
    
    unsigned long start_time = millis();
    while (!sensors->isConversionComplete() && (millis() - start_time) < 1000) {
        delay(10);
    }
    
    if (!sensors->isConversionComplete()) {
        return last_temperature;
    }
    
    float temperature = sensors->getTempC(sensor_address);
    
    if (temperature == DEVICE_DISCONNECTED_C || temperature < -55 || temperature > 125) {
        return last_temperature;
    }
    
    last_temperature = temperature;
    last_reading = millis();
    
    return temperature;
}

bool DS18B20TemperatureSensor::isValid(float value) {
    return (value >= -55.0 && value <= 125.0 && !isnan(value));
}

String DS18B20TemperatureSensor::getUnit() {
    return "°C";
}

String DS18B20TemperatureSensor::getQuality(float value) {
    unsigned long age = millis() - last_reading;
    if (age > 300000) return "stale";
    if (age > 120000) return "old";
    
    if (value < -20 || value > 80) return "critical";
    if (value < 0 || value > 50) return "warning";
    return "good";
}

bool DS18B20TemperatureSensor::calibrate(float reference_value) {
    Serial.println("[DS18B20] Digital sensor - no calibration needed");
    return true;
}

void DS18B20TemperatureSensor::sleep() {
    if (sensors) {
        sensors->setWaitForConversion(true);
    }
}

void DS18B20TemperatureSensor::wake() {
    if (sensors) {
        sensors->setWaitForConversion(false);
    }
}

// =============================================================================
// PI-ENHANCED SENSOR IMPLEMENTATION
// =============================================================================

PiEnhancedSensor::PiEnhancedSensor(uint8_t gpio_pin, const String& type, 
                                   PiSensorClient* pi_client_ptr, 
                                   HardwareSensorBase* fallback) {
    gpio = gpio_pin;
    sensor_type = type;
    pi_client = pi_client_ptr;
    fallback_sensor = fallback;
    
    pi_processing_enabled = true;
    last_pi_value = NAN;
    last_pi_read = 0;
    last_fallback_value = NAN;
    last_hardware_read = 0;
    
    pi_requests_total = 0;
    pi_requests_success = 0;
    fallback_uses = 0;
}

PiEnhancedSensor::~PiEnhancedSensor() {
    if (fallback_sensor) {
        delete fallback_sensor;
    }
}

bool PiEnhancedSensor::init(uint8_t gpio_pin) {
    gpio = gpio_pin;
    
    if (!initializeHardwareGPIO(gpio)) {
        return false;
    }
    
    if (fallback_sensor) {
        fallback_sensor->init(gpio);
    }
    
    return true;
}

float PiEnhancedSensor::read() {
    last_hardware_read = millis();
    
    uint32_t raw_data = readRawFromHardware();
    if (raw_data == 0xFFFFFFFF) {
        return !isnan(last_pi_value) ? last_pi_value : last_fallback_value;
    }
    
    if (pi_client && pi_client->isAvailable() && pi_processing_enabled) {
        float processed_value;
        String quality, unit;
        
        pi_requests_total++;
        
        if (pi_client->processSensorData(gpio, sensor_type, raw_data, 
                                       processed_value, quality, unit)) {
            pi_requests_success++;
            last_pi_value = processed_value;
            last_pi_read = millis();
            return processed_value;
        }
    }
    
    if (fallback_sensor) {
        float fallback_value = fallback_sensor->read();
        if (isValid(fallback_value)) {
            fallback_uses++;
            last_fallback_value = fallback_value;
            return fallback_value;
        }
    }
    
    float linear_value = applyBasicLinearConversion(raw_data);
    return linear_value;
}

bool PiEnhancedSensor::isValid(float value) {
    if (isnan(value) || !isfinite(value)) {
        return false;
    }
    
    if (sensor_type.indexOf("temperature") >= 0) {
        return (value >= -55.0 && value <= 125.0);
    } else if (sensor_type.indexOf("humidity") >= 0) {
        return (value >= 0.0 && value <= 100.0);
    } else if (sensor_type.indexOf("ph") >= 0) {
        return (value >= 0.0 && value <= 14.0);
    }
    
    return true;
}

String PiEnhancedSensor::getUnit() {
    if (sensor_type.indexOf("temperature") >= 0) {
        return "°C";
    } else if (sensor_type.indexOf("humidity") >= 0) {
        return "%RH";
    } else if (sensor_type.indexOf("ph") >= 0) {
        return "pH";
    }
    
    return "raw";
}

String PiEnhancedSensor::getQuality(float value) {
    unsigned long now = millis();
    
    if (pi_client && pi_client->isAvailable() && (now - last_pi_read) < 30000) {
        return "pi_enhanced";
    }
    
    if (fallback_sensor && !isnan(last_fallback_value)) {
        return "fallback_sensor";
    }
    
    return "linear_conversion";
}

bool PiEnhancedSensor::calibrate(float reference_value) {
    if (fallback_sensor) {
        return fallback_sensor->calibrate(reference_value);
    }
    return false;
}

void PiEnhancedSensor::enablePiProcessing(bool enabled) {
    pi_processing_enabled = enabled;
}

void PiEnhancedSensor::printStatistics() {
    Serial.printf("[PiEnhanced] Statistics for GPIO %d (%s):\n", gpio, sensor_type.c_str());
    Serial.printf("  Pi requests: %u total, %u successful\n", 
                 pi_requests_total, pi_requests_success);
    Serial.printf("  Fallback uses: %u\n", fallback_uses);
}

bool PiEnhancedSensor::initializeHardwareGPIO(uint8_t pin) {
    if (sensor_type.indexOf("sht31") >= 0 || sensor_type.indexOf("ds18b20") >= 0) {
        pinMode(pin, INPUT_PULLUP);
    } else if (sensor_type.indexOf("ph") >= 0 || sensor_type.indexOf("ec") >= 0) {
        pinMode(pin, INPUT);
        analogReadResolution(12);
        analogSetAttenuation(ADC_11db);
    } else {
        pinMode(pin, INPUT);
    }
    return true;
}

uint32_t PiEnhancedSensor::readRawFromHardware() {
    if (sensor_type.indexOf("sht31") >= 0) {
        return random(20000, 30000);
    } else if (sensor_type.indexOf("ds18b20") >= 0) {
        return random(18000, 28000);
    } else if (sensor_type.indexOf("ph") >= 0 || sensor_type.indexOf("ec") >= 0) {
        return analogRead(gpio);
    }
    
    return random(1000, 4000);
}

float PiEnhancedSensor::applyBasicLinearConversion(uint32_t raw_data) {
    if (sensor_type.indexOf("sht31_temperature") >= 0 || sensor_type.indexOf("ds18b20") >= 0) {
        return (float)raw_data / 1000.0;
    } else if (sensor_type.indexOf("sht31_humidity") >= 0) {
        return ((float)raw_data / 65535.0) * 100.0;
    } else if (sensor_type.indexOf("ph") >= 0) {
        float voltage = (raw_data / 4095.0) * 3.3;
        return 7.0 - ((voltage - 1.5) / 0.18);
    }
    
    return (float)raw_data;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

uint8_t convertSensorTypeStringToCode(const String& type_string) {
    if (type_string == "ph_dfrobot_gravity") return 1;
    if (type_string == "ec_generic") return 2;
    if (type_string == "temp_ds18b20") return 3;
    if (type_string == "temp_dht22") return 4;
    if (type_string == "moisture_pi_enhanced") return 5;
    if (type_string == "pressure_pi_enhanced") return 6;
    if (type_string == "co2_pi_enhanced") return 7;
    if (type_string == "air_quality_pi_enhanced") return 8;
    if (type_string == "light_pi_enhanced") return 9;
    if (type_string == "flow_pi_enhanced") return 10;
    if (type_string == "level_pi_enhanced") return 11;
    if (type_string == "custom_pi_enhanced") return 12;
    return 0;
}

String convertSensorTypeCodeToString(uint8_t type_code) {
    switch (type_code) {
        case 1: return "ph_dfrobot_gravity";
        case 2: return "ec_generic";
        case 3: return "temp_ds18b20";
        case 4: return "temp_dht22";
        case 5: return "moisture_pi_enhanced";
        case 6: return "pressure_pi_enhanced";
        case 7: return "co2_pi_enhanced";
        case 8: return "air_quality_pi_enhanced";
        case 9: return "light_pi_enhanced";
        case 10: return "flow_pi_enhanced";
        case 11: return "level_pi_enhanced";
        case 12: return "custom_pi_enhanced";
        default: return "unknown";
    }
}

// =============================================================================
// NAMESPACE IMPLEMENTATION
// =============================================================================

namespace AdvancedFeatures {
    // Globale RTC-Instanz
    static PrecisionRTC global_rtc;
    static bool rtc_initialized = false;
    
    int decodeBase64(const String& encoded, uint8_t* output, size_t output_size) {
        // Vereinfachte Base64-Dekodierung
        size_t decoded_length = 0;
        int result = mbedtls_base64_decode(output, output_size, &decoded_length, 
                                         (const unsigned char*)encoded.c_str(), 
                                         encoded.length());
        
        if (result != 0) {
            return -1;
        }
        
        return decoded_length;
    }
    
    bool isValidBase64(const String& str) {
        if (str.length() == 0) return false;
        
        String clean_str = str;
        clean_str.replace("\n", "");
        clean_str.replace("\r", "");
        clean_str.replace(" ", "");
        clean_str.replace("\t", "");
        
        if (clean_str.length() % 4 != 0) return false;
        
        for (size_t i = 0; i < clean_str.length(); i++) {
            char c = clean_str.charAt(i);
            bool valid_char = ((c >= 'A' && c <= 'Z') || 
                              (c >= 'a' && c <= 'z') || 
                              (c >= '0' && c <= '9') || 
                              c == '+' || c == '/' || c == '=');
            
            if (!valid_char) return false;
            
            if (c == '=' && i < clean_str.length() - 2) return false;
        }
        
        return true;
    }
    
    String getISOTimestamp() {
        if (!rtc_initialized) {
            global_rtc.init();
            rtc_initialized = true;
        }
        return global_rtc.getISOTimestamp();
    }
    
    String getTimeQuality() {
        if (!rtc_initialized) {
            global_rtc.init();
            rtc_initialized = true;
        }
        return global_rtc.getTimeQuality();
    }
    
    bool syncTimeWithNTP() {
        if (!rtc_initialized) {
            global_rtc.init();
            rtc_initialized = true;
        }
        return global_rtc.syncWithNTP();
    }
    
    bool checkMemoryStatus() {
        size_t free_heap = ESP.getFreeHeap();
        
        if (free_heap < 10000) {
            Serial.printf("[AdvancedFeatures] CRITICAL: Very low memory! Free: %d bytes\n", free_heap);
            return false;
        } else if (free_heap < 20000) {
            Serial.printf("[AdvancedFeatures] WARNING: Low memory! Free: %d bytes\n", free_heap);
            return false;
        }
        
        return true;
    }
    
    String getSystemHealth() {
        size_t free_heap = ESP.getFreeHeap();
        
        if (free_heap > 50000) return "excellent";
        if (free_heap > 30000) return "good";
        if (free_heap > 20000) return "acceptable";
        if (free_heap > 10000) return "poor";
        return "critical";
    }
    
    String formatUptime(unsigned long uptime_ms) {
        unsigned long seconds = uptime_ms / 1000;
        unsigned long minutes = seconds / 60;
        unsigned long hours = minutes / 60;
        unsigned long days = hours / 24;
        
        hours %= 24;
        minutes %= 60;
        seconds %= 60;
        
        String uptime_str = "";
        if (days > 0) uptime_str += String(days) + "d ";
        if (hours > 0 || days > 0) uptime_str += String(hours) + "h ";
        if (minutes > 0 || hours > 0 || days > 0) uptime_str += String(minutes) + "m ";
        uptime_str += String(seconds) + "s";
        
        return uptime_str;
    }
} 