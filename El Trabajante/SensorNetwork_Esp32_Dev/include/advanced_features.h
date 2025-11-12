/*
 * ESP32 Advanced Features Header
 * 
 * Vollständige Header-Datei für erweiterte Sensor-Features:
 * - Base64-Dekodierung für OTA-Libraries
 * - Hardware-Sensor-Integration
 * - Data-Buffering für Offline-Betrieb
 * - RTC-Integration für präzise Timestamps
 * - Erweiterte Security (TLS, Auth)
 * - Pi-Enhanced Sensor Processing
 * - Actuator System Integration
 * 
 * Kompatibel mit ESP32-C3 und Arduino Framework
 */

#ifndef ADVANCED_FEATURES_H
#define ADVANCED_FEATURES_H

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <esp_system.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Wire.h>
#include <time.h>
#include <esp_sntp.h>
#include <mbedtls/base64.h>
#include <esp_partition.h>
#include <esp_ota_ops.h>
#include <SPIFFS.h>
#include <functional>
#include <vector>
#include <map>

// Forward Declarations
class PiSensorClient;
class AdvancedActuatorSystem;

// =============================================================================
// CONSTANTS & CONFIGURATION
// =============================================================================

#ifndef MAX_SENSORS
#define MAX_SENSORS 8
#endif

#ifndef MAX_BUFFERED_READINGS
#define MAX_BUFFERED_READINGS 200
#endif

#ifndef MAX_LIBRARIES
#define MAX_LIBRARIES 16
#endif

#define RTC_SYNC_INTERVAL 86400000  // 24 Stunden in ms
#define OFFLINE_BUFFER_SIZE 32768   // 32KB für Offline-Daten
#ifndef MAX_LIBRARY_SIZE
#define MAX_LIBRARY_SIZE 65536      // 64KB pro Library (DevKit default)
#endif
#define TLS_FINGERPRINT_LENGTH 20
#define MQTT_AUTH_TIMEOUT 30000     // 30s für Authentication
#define DEFAULT_PI_URL "http://192.168.1.100:5000"

// =============================================================================
// BASE SENSOR INTERFACE
// =============================================================================

/**
 * Basis-Interface für alle Hardware-Sensoren
 */
class HardwareSensorBase {
public:
    virtual ~HardwareSensorBase() = default;
    
    /**
     * Initialisiert den Sensor auf dem angegebenen GPIO
     * @param gpio GPIO-Pin für den Sensor
     * @return true wenn erfolgreich, false bei Fehler
     */
    virtual bool init(uint8_t gpio) = 0;
    
    /**
     * Liest aktuellen Sensor-Wert
     * @return Sensor-Wert als float, NAN bei Fehler
     */
    virtual float read() = 0;
    
    /**
     * Validiert einen Sensor-Wert
     * @param value Zu validierender Wert
     * @return true wenn Wert gültig ist
     */
    virtual bool isValid(float value) = 0;
    
    /**
     * Liefert die Einheit des Sensors
     * @return Einheit als String (z.B. "°C", "pH", "%")
     */
    virtual String getUnit() = 0;
    
    /**
     * Liefert Qualitätsbewertung des Sensors
     * @param value Aktueller Sensor-Wert
     * @return Qualität als String ("good", "warning", "critical", "stale")
     */
    virtual String getQuality(float value) = 0;
    
    /**
     * Kalibriert den Sensor mit Referenzwert
     * @param reference_value Referenzwert für Kalibrierung
     * @return true wenn Kalibrierung erfolgreich
     */
    virtual bool calibrate(float reference_value) = 0;
    
    /**
     * Versetzt Sensor in Sleep-Modus (optional)
     */
    virtual void sleep() {}
    
    /**
     * Weckt Sensor aus Sleep-Modus (optional)
     */
    virtual void wake() {}
};

// =============================================================================
// SENSOR REGISTRY SYSTEM
// =============================================================================

/**
 * Registry für Sensor-Factory-Funktionen
 */
class SensorRegistry {
private:
    std::map<String, std::function<HardwareSensorBase*()>> factories;
    
public:
    void registerSensor(const String& type, std::function<HardwareSensorBase*()> factory) {
        factories[type] = factory;
    }
    
    bool isRegistered(const String& type) const {
        return factories.find(type) != factories.end();
    }
    
    HardwareSensorBase* createSensor(const String& type) {
        auto it = factories.find(type);
        if (it != factories.end()) {
            return it->second();
        }
        return nullptr;
    }
};

// =============================================================================
// ENHANCED LIBRARY MANAGER
// =============================================================================

/**
 * Struktur für geladene Libraries
 */
struct LoadedLibrary {
    String name;
    String version;
    bool loaded = false;
    
    // Factory-Funktionen
    std::function<HardwareSensorBase*()> createSensor = nullptr;
    std::function<void(HardwareSensorBase*)> destroySensor = nullptr;
    std::function<const char*()> getVersion = nullptr;
};

/**
 * Erweiterter Library-Manager für Binary-Libraries
 */
class EnhancedLibraryManager {
private:
    LoadedLibrary loaded_libraries[MAX_LIBRARIES];
    int library_count = 0;
    SensorRegistry sensor_registry;
    
    // Factory-Funktionen für Registry
    static HardwareSensorBase* createSensorFactory();
    static void destroySensorFactory(HardwareSensorBase* sensor);
    static const char* getVersionFactory();
    
    bool saveBinaryToFlash(const String& filename, const uint8_t* data, size_t size);
    
public:
    EnhancedLibraryManager() = default;
    ~EnhancedLibraryManager() = default;
    
    /**
     * Lädt Library aus Binary-Daten
     */
    bool loadLibraryFromBinary(const String& name, const String& version, 
                              const uint8_t* binary_data, size_t size);
    
    /**
     * Erstellt Sensor-Instanz aus Library
     */
    HardwareSensorBase* createSensorInstance(const String& library_name);
    
    /**
     * Zerstört Sensor-Instanz
     */
    void destroySensorInstance(const String& library_name, HardwareSensorBase* sensor);
    
    /**
     * Entlädt Library
     */
    bool unloadLibrary(const String& name);
    
    /**
     * Listet geladene Libraries
     */
    void listLoadedLibraries();
    
    /**
     * Prüft ob Library geladen ist
     */
    bool isLibraryLoaded(const String& name);
    
    /**
     * Registriert Sensor-Factory
     */
    void registerSensor(const String& type, std::function<HardwareSensorBase*()> factory);
};

// =============================================================================
// PRECISION RTC SYSTEM
// =============================================================================

/**
 * Präzises RTC-System mit NTP-Synchronisation
 */
class PrecisionRTC {
private:
    bool ntp_synced = false;
    unsigned long last_sync = 0;
    int32_t drift_correction = 0;
    time_t boot_time = 0;
    unsigned long boot_millis = 0;
    
    void loadDriftCorrection();
    void saveDriftCorrection();
    
public:
    PrecisionRTC() = default;
    ~PrecisionRTC() = default;
    
    /**
     * Initialisiert RTC-System
     */
    bool init();
    
    /**
     * Liefert präzisen Unix-Timestamp
     */
    time_t getPreciseTimestamp();
    
    /**
     * Formatiert Timestamp als ISO8601-String
     */
    String getISOTimestamp();
    
    /**
     * Liefert lokale Zeit als String
     */
    String getLocalTimeString();
    
    /**
     * Synchronisiert mit NTP
     */
    bool syncWithNTP();
    
    /**
     * Prüft ob Zeit zuverlässig ist
     */
    bool isTimeReliable();
    
    /**
     * Liefert Zeit-Qualität
     */
    String getTimeQuality();
    
    /**
     * Liefert Uptime in Sekunden
     */
    unsigned long getUptimeSeconds();
    
    /**
     * Liefert Boot-Zeit
     */
    time_t getBootTime();
    
    /**
     * Setzt Zeit manuell
     */
    bool setTime(int year, int month, int day, int hour, int minute, int second);
};

// =============================================================================
// OFFLINE DATA BUFFER
// =============================================================================

/**
 * Struktur für gepufferte Messungen
 */
struct BufferedReading {
    time_t timestamp;
    char esp_id[16];
    char zone_id[32];
    char subzone_id[32];
    uint8_t gpio;
    uint8_t sensor_type;
    float value;
    char sensor_name[32];
    uint16_t checksum;
};

/**
 * Offline-Datenpuffer für MQTT-Ausfälle
 */
class OfflineDataBuffer {
private:
    BufferedReading* buffer = nullptr;
    uint16_t buffer_size;
    uint16_t write_index = 0;
    uint16_t read_index = 0;
    uint16_t count = 0;
    bool buffer_full = false;
    Preferences prefs;
    
    uint16_t calculateChecksum(const BufferedReading& reading);
    void saveIndices();
    
public:
    OfflineDataBuffer() = default;
    ~OfflineDataBuffer();
    
    /**
     * Initialisiert Puffer
     */
    bool init(uint16_t size = MAX_BUFFERED_READINGS);
    
    /**
     * Fügt Messung hinzu
     */
    bool addReading(time_t timestamp, const String& esp_id, const String& zone_id,
                   const String& subzone_id, uint8_t gpio, uint8_t sensor_type,
                   float value, const String& sensor_name);
    
    /**
     * Liest nächste Messung
     */
    bool getNextReading(BufferedReading& reading);
    
    /**
     * Konvertiert zu JSON
     */
    String readingToJson(const BufferedReading& reading);
    
    /**
     * Status-Methoden
     */
    uint16_t getCount() const;
    uint16_t getCapacity() const;
    bool isFull() const;
    float getFillPercentage() const;
    
    /**
     * Puffer leeren
     */
    void clear();
};

// =============================================================================
// SECURE MQTT CLIENT
// =============================================================================

/**
 * Sicherer MQTT-Client mit TLS
 */
class SecureMQTTClient {
private:
    WiFiClientSecure* secure_client = nullptr;
    PubSubClient* mqtt_client = nullptr;
    String ca_cert = "";
    String client_cert = "";
    String client_key = "";
    String server_fingerprint = "";
    bool tls_enabled = false;
    bool auth_enabled = false;
    String username = "";
    String password = "";
    
    void printTLSError();
    
public:
    SecureMQTTClient() = default;
    ~SecureMQTTClient();
    
    /**
     * Konfiguriert TLS
     */
    bool configureTLS(const String& ca_certificate, 
                     const String& client_certificate = "",
                     const String& client_private_key = "");
    
    /**
     * Setzt Server-Fingerprint
     */
    bool setServerFingerprint(const String& fingerprint);
    
    /**
     * Konfiguriert Authentifizierung
     */
    void setAuthentication(const String& user, const String& pass);
    
    /**
     * Verbindet mit Broker
     */
    bool connect(const String& server, uint16_t port, const String& client_id);
    
    /**
     * MQTT-Operationen
     */
    bool publish(const char* topic, const char* payload);
    bool subscribe(const char* topic);
    void loop();
    bool connected();
    void setCallback(MQTT_CALLBACK_SIGNATURE);
};

// =============================================================================
// PI-ENHANCED SENSOR
// =============================================================================

/**
 * Hybrid-Sensor für ESP32-Pi Cooperation
 */
class PiEnhancedSensor : public HardwareSensorBase {
private:
    uint8_t gpio;
    String sensor_type;
    PiSensorClient* pi_client;
    bool pi_processing_enabled;
    HardwareSensorBase* fallback_sensor;
    
    float last_pi_value;
    unsigned long last_pi_read;
    float last_fallback_value;
    unsigned long last_hardware_read;
    
    uint32_t pi_requests_total;
    uint32_t pi_requests_success;
    uint32_t fallback_uses;
    
    bool initializeHardwareGPIO(uint8_t pin);
    uint32_t readRawFromHardware();
    float applyBasicLinearConversion(uint32_t raw_data);
    
public:
    PiEnhancedSensor(uint8_t gpio_pin, const String& type, 
                     PiSensorClient* pi_client_ptr, 
                     HardwareSensorBase* fallback = nullptr);
    ~PiEnhancedSensor();
    
    // HardwareSensorBase Interface
    bool init(uint8_t gpio) override;
    float read() override;
    bool isValid(float value) override;
    String getUnit() override;
    String getQuality(float value) override;
    bool calibrate(float reference_value) override;
    
    // Pi-Enhanced spezifische Methoden
    void enablePiProcessing(bool enabled);
    void printStatistics();
};

// =============================================================================
// HARDWARE SENSOR IMPLEMENTATIONS
// =============================================================================

/**
 * pH-Sensor (DFRobot Gravity)
 */
class pHSensorDFRobot : public HardwareSensorBase {
private:
    uint8_t analog_pin;
    float calibration_neutral = 7.0;
    float calibration_voltage_neutral = 1.5;
    float calibration_slope = 0.18;
    unsigned long last_reading = 0;
    float last_value = 7.0;
    bool sensor_ready = false;
    
public:
    pHSensorDFRobot() = default;
    ~pHSensorDFRobot() = default;
    
    bool init(uint8_t gpio) override;
    float read() override;
    bool isValid(float value) override;
    String getUnit() override;
    String getQuality(float value) override;
    bool calibrate(float reference_value) override;
    
    void loadCalibration();
};

/**
 * DS18B20 Temperatursensor
 */
class DS18B20TemperatureSensor : public HardwareSensorBase {
private:
    OneWire* oneWire = nullptr;
    DallasTemperature* sensors = nullptr;
    uint8_t sensor_pin;
    DeviceAddress sensor_address;
    bool sensor_found = false;
    float last_temperature = 20.0;
    unsigned long last_reading = 0;
    
public:
    DS18B20TemperatureSensor();
    ~DS18B20TemperatureSensor();
    
    bool init(uint8_t gpio) override;
    float read() override;
    bool isValid(float value) override;
    String getUnit() override;
    String getQuality(float value) override;
    bool calibrate(float reference_value) override;
    void sleep() override;
    void wake() override;
};

// =============================================================================
// ENHANCED SENSOR STRUCTURE
// =============================================================================

/**
 * Erweiterte Sensor-Struktur
 */
struct EnhancedSensor {
    uint8_t gpio = 0;
    String library_name = "";
    String sensor_name = "";
    String subzone_id = "";
    HardwareSensorBase* instance = nullptr;
    bool active = false;
    unsigned long last_reading = 0;
    float last_value = NAN;
};

// =============================================================================
// MAIN ADVANCED SENSOR SYSTEM
// =============================================================================

/**
 * Hauptklasse für erweiterte Sensor-Features
 */
class AdvancedSensorSystem {
private:
    // System-Identifikation
    String esp_id = "";
    String zone_id = "";
    bool system_initialized = false;
    
    // Subsysteme
    PrecisionRTC* rtc_system_ptr = nullptr;
    OfflineDataBuffer* data_buffer_ptr = nullptr;
    SecureMQTTClient* secure_mqtt_ptr = nullptr;
    EnhancedLibraryManager* library_manager_ptr = nullptr;
    PiSensorClient* pi_client_ptr = nullptr;
    AdvancedActuatorSystem* actuator_system_ptr = nullptr;
    
    // Sensor-Management
    EnhancedSensor* sensors_ptr = nullptr;
    uint8_t active_sensor_count = 0;
    
    // Private Helper-Methoden
    void handleMQTTMessage(char* topic, uint8_t* payload, unsigned int length);
    void sendSensorDataMQTT(const EnhancedSensor& sensor, float value, time_t timestamp, 
                           const String& quality, const String& unit);
    uint8_t getSensorTypeCode(const String& library_name);
    
public:
    AdvancedSensorSystem();
    ~AdvancedSensorSystem();
    
    /**
     * System-Initialisierung
     */
    bool initialize(const String& esp_identifier, const String& zone_identifier);
    
    /**
     * MQTT Security
     */
    bool configureMQTTSecurity(const String& ca_cert, const String& username, const String& password);
    bool connectSecureMQTT(const String& server, uint16_t port);
    
    /**
     * Library-Management
     */
    bool installLibraryFromBase64(const String& name, const String& version, const String& base64_data);
    
    /**
     * Hardware-Sensor-Konfiguration
     */
    bool configureHardwareSensor(uint8_t gpio, const String& library_name, 
                                const String& sensor_name, const String& subzone_id);
    bool removeSensor(uint8_t gpio);
    bool hasSensorOnGPIO(uint8_t gpio);
    String getSensorInfo(uint8_t gpio);
    
    /**
     * Safe-Mode
     */
    void enterSafeMode();
    bool exitSafeMode();
    
    /**
     * Diagnostics
     */
    void performDiagnostics();
    
    /**
     * Konfiguration
     */
    void saveConfiguration();
    bool loadConfiguration();
    
    /**
     * Messungen
     */
    void performHardwareMeasurements();
    void uploadBufferedData();
    
    /**
     * Zeit-Synchronisation
     */
    void syncTime();
    
    /**
     * Status
     */
    void printSystemStatus();
    
    /**
     * Pi-Integration
     */
    bool connectToPi(const String& pi_url);
    bool isPiAvailable() const;
    void setPiURL(const String& url);
    String getPiStatus();
    bool configurePiEnhancedSensor(uint8_t gpio, const String& sensor_type, 
                                  const String& sensor_name, const String& subzone_id);
    bool installPiLibrary(const String& library_name, const String& library_code, 
                         const String& version);
    int countPiEnhancedSensors() const;
    
    /**
     * Actuator-System
     */
    bool configureActuator(uint8_t gpio, const String& library_name,
                          const String& actuator_name, const String& subzone_id);
    bool controlActuator(uint8_t gpio, float value);
    bool controlActuatorBinary(uint8_t gpio, bool state);
    bool removeActuator(uint8_t gpio);
    bool emergencyStopAllActuators();
    bool emergencyStopActuator(uint8_t gpio);
    uint8_t getActiveActuatorCount();
    String getActuatorInfo(uint8_t gpio);
    bool isActuatorConfigured(uint8_t gpio);
    void printActuatorStatus();
    void performActuatorControl();
    
    /**
     * Get actuator system pointer (for initialization)
     */
    AdvancedActuatorSystem* getActuatorSystem() const { return actuator_system_ptr; }
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Konvertiert Sensor-Type-String zu Code
 */
uint8_t convertSensorTypeStringToCode(const String& type_string);

/**
 * Konvertiert Sensor-Code zu String
 */
String convertSensorTypeCodeToString(uint8_t type_code);

// =============================================================================
// NAMESPACE FOR GLOBAL FUNCTIONS
// =============================================================================

namespace AdvancedFeatures {
    /**
     * Base64-Dekodierung
     */
    int decodeBase64(const String& encoded, uint8_t* output, size_t output_size);
    bool isValidBase64(const String& str);
    
    /**
     * Zeit-Funktionen
     */
    String getISOTimestamp();
    String getTimeQuality();
    bool syncTimeWithNTP();
    
    /**
     * System-Health
     */
    bool checkMemoryStatus();
    String getSystemHealth();
    String formatUptime(unsigned long uptime_ms);
}

#endif // ADVANCED_FEATURES_H