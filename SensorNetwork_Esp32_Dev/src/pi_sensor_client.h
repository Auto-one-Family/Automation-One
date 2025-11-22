#ifndef PI_SENSOR_CLIENT_H
#define PI_SENSOR_CLIENT_H

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "actuator_types.h"

// Cache-Struktur für Performance-Optimierung
struct CacheEntry {
    uint8_t gpio;
    String sensor_type;
    float last_value;
    unsigned long timestamp;
    bool valid;
};

class PiSensorClient {
private:
    // Server-Konfiguration
    String pi_server_url;
    String esp_id;
    bool pi_available;
    bool pi_registered;  // 🆕 NEU: Registration status
    
    // HTTP-Client
    HTTPClient http_client;
    
    // Cache-System
    CacheEntry cache[8];
    static const unsigned long CACHE_TIMEOUT = 5000;  // 5 Sekunden
    
    // Fehlerbehandlung
    int consecutive_errors;
    static const int MAX_CONSECUTIVE_ERRORS = 3;
    unsigned long last_error_time;
    
    // Timeouts
    static const unsigned long HEALTH_TIMEOUT = 3000;
    static const unsigned long PROCESS_TIMEOUT = 5000;
    static const unsigned long LIBRARY_TIMEOUT = 10000;
    
    // Private Hilfsmethoden
    void handleError();
    String buildEndpoint(const String& path);
    bool parseJsonResponse(const String& response, JsonDocument& doc);
    void updateCache(uint8_t gpio, const String& sensor_type, float value);
    bool getFromCache(uint8_t gpio, const String& sensor_type, float& value);

public:
    // Konstruktor
    PiSensorClient(const String& pi_url, const String& esp_identifier);
    
    // Initialisierung
    bool init();
    
    // Verfügbarkeitsprüfung
    bool checkPiAvailability();
    
    // Hauptfunktion - Sensor-Datenverarbeitung
    bool processSensorData(uint8_t gpio, const String& sensor_type, uint32_t raw_data, 
                          float& processed_value, String& quality, String& unit);
    
    // *** PI-ENHANCED ACTUATOR SUPPORT ***
    bool processActuatorData(uint8_t gpio, const String& actuator_type,
                            const ActuatorStatus& status,
                            ProcessedActuatorCommand& result);
    
    // Library-Management
    bool installLibraryToPi(const String& library_name, const String& library_code, 
                           const String& version);
    
    // Status-Abfragen
    String getPiLibraryStatus();
    bool isAvailable() const { return pi_available; }
    
    // 🆕 NEU: Pi Registration
    bool registerWithPi(const String& esp_name, const String& friendly_name, const String& zone);
    bool isRegistered() const { return pi_registered; }
    
    // Konfiguration
    void setServerURL(const String& url);
};

#endif // PI_SENSOR_CLIENT_H 