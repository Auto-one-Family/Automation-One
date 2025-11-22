#include "pi_sensor_client.h"

// Debug-Makro für konsistente Ausgaben
// ✅ OPTIMIERT: Debug-Kontrolle für Flash-Einsparung (Phase 2)
#ifdef DEBUG_MODE
    #define PI_CLIENT_DEBUG(x) Serial.println(String("[PiClient] ") + x)
    #define PI_CLIENT_DEBUGF(format, ...) Serial.printf("[PiClient] " format "\n", ##__VA_ARGS__)
#else
    #define PI_CLIENT_DEBUG(x)
    #define PI_CLIENT_DEBUGF(format, ...)
#endif

// Constructor Implementation
PiSensorClient::PiSensorClient(const String& pi_url, const String& esp_identifier) {
    pi_server_url = pi_url;
    esp_id = esp_identifier;
    pi_available = false;
    pi_registered = false;  // 🆕 NEU: Initialize registration status
    consecutive_errors = 0;
    last_error_time = 0;
    
    // Cache initialisieren - alle Einträge als ungültig markieren
    for (int i = 0; i < 8; i++) {
        cache[i].gpio = 255;           // Ungültiger GPIO
        cache[i].sensor_type = "";
        cache[i].last_value = 0.0;
        cache[i].timestamp = 0;
        cache[i].valid = false;
    }
    
    PI_CLIENT_DEBUGF("Initialized for Pi server: %s, ESP ID: %s", 
                     pi_url.c_str(), esp_identifier.c_str());
}

// Init Method
bool PiSensorClient::init() {
    PI_CLIENT_DEBUG("Initializing Pi sensor client...");
    
    // WiFi-Status prüfen
    if (WiFi.status() != WL_CONNECTED) {
        PI_CLIENT_DEBUG("ERROR: WiFi not connected");
        return false;
    }
    
    // Pi-Verfügbarkeit testen
    bool available = checkPiAvailability();
    
    if (available) {
        PI_CLIENT_DEBUG("Pi client initialization successful");
    } else {
        PI_CLIENT_DEBUG("Pi client initialization failed - will use fallback mode");
    }
    
    return available;  // true wenn Pi verfügbar, false für Fallback-Mode
}

// Check Pi Availability
bool PiSensorClient::checkPiAvailability() {
    // WiFi-Prerequisite
    if (WiFi.status() != WL_CONNECTED) {
        pi_available = false;
        PI_CLIENT_DEBUG("WiFi not connected for Pi availability check");
        return false;
    }
    
    // HTTP-Client konfigurieren
    http_client.begin(pi_server_url + "/health");
    http_client.setTimeout(3000);  // 3 Sekunden Timeout
    http_client.addHeader("User-Agent", "ESP32-PiClient/1.0");
    
    PI_CLIENT_DEBUGF("Checking Pi availability at: %s/health", pi_server_url.c_str());
    
    // GET-Request ausführen
    int http_code = http_client.GET();
    
    if (http_code == HTTP_CODE_OK) {
        String payload = http_client.getString();
        PI_CLIENT_DEBUGF("Pi health response: %s", payload.c_str());
        
        // JSON-Response parsen
        StaticJsonDocument<200> doc;
        DeserializationError error = deserializeJson(doc, payload);
        
        if (error == DeserializationError::Ok) {
            String status = doc["status"];
            if (status == "healthy") {
                pi_available = true;
                consecutive_errors = 0;
                PI_CLIENT_DEBUG("Pi server is healthy and available");
                http_client.end();
                return true;
            } else {
                PI_CLIENT_DEBUGF("Pi server unhealthy status: %s", status.c_str());
            }
        } else {
            PI_CLIENT_DEBUGF("JSON parse error in health response: %s", error.c_str());
        }
    } else {
        PI_CLIENT_DEBUGF("Pi health check failed - HTTP code: %d", http_code);
        
        // Spezifische HTTP-Fehler loggen
        if (http_code == HTTPC_ERROR_CONNECTION_REFUSED) {
            PI_CLIENT_DEBUG("Connection refused - Pi server not running?");
        } else if (http_code == HTTPC_ERROR_CONNECTION_LOST) {
            PI_CLIENT_DEBUG("Connection lost - network issue?");
        } else if (http_code == -1) {
            PI_CLIENT_DEBUG("Connection timeout - Pi server too slow?");
        }
    }
    
    // Fehlerbehandlung
    pi_available = false;
    consecutive_errors++;
    last_error_time = millis();
    
    PI_CLIENT_DEBUGF("Pi server unavailable (error count: %d)", consecutive_errors);
    
    http_client.end();
    return false;
}

// Process Sensor Data
bool PiSensorClient::processSensorData(uint8_t gpio, const String& sensor_type, 
                                      uint32_t raw_data, float& processed_value, 
                                      String& quality, String& unit) {
    
    // Pi-Verfügbarkeit prüfen
    if (!pi_available) {
        PI_CLIENT_DEBUG("Pi not available for sensor processing");
        return false;
    }
    
    // Cache-Check für Performance
    int cache_index = gpio % 8;
    CacheEntry& cache_entry = cache[cache_index];
    
    if (cache_entry.valid && 
        cache_entry.gpio == gpio && 
        cache_entry.sensor_type == sensor_type &&
        (millis() - cache_entry.timestamp) < CACHE_TIMEOUT) {
        
        // Cache-Hit
        processed_value = cache_entry.last_value;
        quality = "cached";
        unit = "cached";
        
        PI_CLIENT_DEBUGF("Cache hit for GPIO %d: %.2f", gpio, processed_value);
        return true;
    }
    
    // HTTP-Request vorbereiten
    http_client.begin(pi_server_url + "/api/process_sensor");
    http_client.addHeader("Content-Type", "application/json");
    http_client.addHeader("User-Agent", "ESP32-PiClient/1.0");
    http_client.setTimeout(5000);  // 5 Sekunden für Processing
    
    // JSON-Payload erstellen
    StaticJsonDocument<300> request_doc;
    request_doc["esp_id"] = esp_id;
    request_doc["gpio"] = gpio;
    request_doc["sensor_type"] = sensor_type;
    request_doc["raw_data"] = raw_data;
    request_doc["timestamp"] = millis();
    
    String request_payload;
    ArduinoJson::serializeJson(request_doc, request_payload);
    
    PI_CLIENT_DEBUGF("Sending sensor data to Pi - GPIO %d, type: %s, raw: %u", 
                     gpio, sensor_type.c_str(), raw_data);
    
    // POST-Request ausführen
    int http_code = http_client.POST(request_payload);
    
    if (http_code == HTTP_CODE_OK) {
        String response_payload = http_client.getString();
        
        // Response parsen
        StaticJsonDocument<400> response_doc;
        DeserializationError error = deserializeJson(response_doc, response_payload);
        
        if (error == DeserializationError::Ok) {
            bool success = response_doc["success"];
            
            if (success) {
                // Erfolgreiche Verarbeitung
                processed_value = response_doc["processed_value"];
                quality = response_doc["quality"].as<String>();
                unit = response_doc["unit"].as<String>();
                
                // Cache aktualisieren
                cache_entry.gpio = gpio;
                cache_entry.sensor_type = sensor_type;
                cache_entry.last_value = processed_value;
                cache_entry.timestamp = millis();
                cache_entry.valid = true;
                
                // Error-Counter zurücksetzen
                consecutive_errors = 0;
                
                PI_CLIENT_DEBUGF("Pi processed GPIO %d: %.2f %s (quality: %s)", 
                                gpio, processed_value, unit.c_str(), quality.c_str());
                
                http_client.end();
                return true;
            } else {
                String error_msg = response_doc["error"];
                PI_CLIENT_DEBUGF("Pi processing failed: %s", error_msg.c_str());
            }
        } else {
            PI_CLIENT_DEBUGF("JSON parse error in processing response: %s", error.c_str());
        }
    } else {
        PI_CLIENT_DEBUGF("Pi processing request failed - HTTP code: %d", http_code);
    }
    
    // Fehlerbehandlung
    consecutive_errors++;
    if (consecutive_errors >= MAX_CONSECUTIVE_ERRORS) {
        pi_available = false;
        PI_CLIENT_DEBUGF("Too many consecutive errors (%d), marking Pi as unavailable", 
                        consecutive_errors);
    }
    
    http_client.end();
    return false;
}

// Install Library to Pi
bool PiSensorClient::installLibraryToPi(const String& library_name, 
                                       const String& library_code, 
                                       const String& version) {
    
    if (!pi_available) {
        PI_CLIENT_DEBUG("Pi not available for library installation");
        return false;
    }
    
    PI_CLIENT_DEBUGF("Installing library %s v%s to Pi", library_name.c_str(), version.c_str());
    
    // HTTP-Request konfigurieren
    http_client.begin(pi_server_url + "/api/install_library");
    http_client.addHeader("Content-Type", "application/json");
    http_client.addHeader("User-Agent", "ESP32-PiClient/1.0");
    http_client.setTimeout(10000);  // 10 Sekunden für Installation
    
    // JSON-Payload (kann groß werden bei Library-Code)
    DynamicJsonDocument request_doc(2048);
    request_doc["esp_id"] = esp_id;
    request_doc["library_name"] = library_name;
    request_doc["version"] = version;
    request_doc["library_code"] = library_code;
    request_doc["timestamp"] = millis();
    
    String request_payload;
    ArduinoJson::serializeJson(request_doc, request_payload);
    
    // POST-Request ausführen
    int http_code = http_client.POST(request_payload);
    bool success = false;
    
    if (http_code == HTTP_CODE_OK) {
        String response = http_client.getString();
        
        StaticJsonDocument<200> response_doc;
        if (deserializeJson(response_doc, response) == DeserializationError::Ok) {
            success = response_doc["success"];
            String message = response_doc["message"];
            
            PI_CLIENT_DEBUGF("Library installation %s: %s", 
                            success ? "successful" : "failed", 
                            message.c_str());
        }
    } else {
        PI_CLIENT_DEBUGF("Library installation request failed - HTTP code: %d", http_code);
    }
    
    http_client.end();
    return success;
}

// Get Pi Library Status
String PiSensorClient::getPiLibraryStatus() {
    if (!pi_available) {
        return "Pi unavailable";
    }
    
    http_client.begin(pi_server_url + "/api/library_status");
    http_client.addHeader("User-Agent", "ESP32-PiClient/1.0");
    http_client.setTimeout(3000);
    
    int http_code = http_client.GET();
    String status = "Unknown";
    
    if (http_code == HTTP_CODE_OK) {
        status = http_client.getString();
        PI_CLIENT_DEBUGF("Pi library status retrieved: %s", status.c_str());
    } else {
        PI_CLIENT_DEBUGF("Pi library status request failed - HTTP code: %d", http_code);
        status = "Request failed";
    }
    
    http_client.end();
    return status;
}

// Set Server URL
void PiSensorClient::setServerURL(const String& url) {
    pi_server_url = url;
    
    // Cache invalidieren bei URL-Änderung
    for (int i = 0; i < 8; i++) {
        cache[i].valid = false;
    }
    
    // Verfügbarkeit neu prüfen
    consecutive_errors = 0;  // Reset error counter
    
    PI_CLIENT_DEBUGF("Server URL updated to: %s", url.c_str());
    
    // Neue Verfügbarkeitsprüfung
    checkPiAvailability();
}

// Private helper methods
void PiSensorClient::handleError() {
    consecutive_errors++;
    last_error_time = millis();
    
    if (consecutive_errors >= MAX_CONSECUTIVE_ERRORS) {
        pi_available = false;
        PI_CLIENT_DEBUG("Too many consecutive errors, marking Pi as unavailable");
    }
}

String PiSensorClient::buildEndpoint(const String& path) {
    return pi_server_url + path;
}

bool PiSensorClient::parseJsonResponse(const String& response, JsonDocument& doc) {
    DeserializationError error = deserializeJson(doc, response);
    if (error) {
        PI_CLIENT_DEBUGF("JSON parse error: %s", error.c_str());
        return false;
    }
    return true;
}

void PiSensorClient::updateCache(uint8_t gpio, const String& sensor_type, float value) {
    int index = gpio % 8;
    cache[index].gpio = gpio;
    cache[index].sensor_type = sensor_type;
    cache[index].last_value = value;
    cache[index].timestamp = millis();
    cache[index].valid = true;
}

bool PiSensorClient::getFromCache(uint8_t gpio, const String& sensor_type, float& value) {
    int index = gpio % 8;
    if (cache[index].valid && 
        cache[index].gpio == gpio && 
        cache[index].sensor_type == sensor_type &&
        (millis() - cache[index].timestamp) < CACHE_TIMEOUT) {
        value = cache[index].last_value;
        return true;
    }
    return false;
}

// =============================================================================
// PI-ENHANCED ACTUATOR PROCESSING
// =============================================================================

bool PiSensorClient::processActuatorData(uint8_t gpio, const String& actuator_type,
                                        const ActuatorStatus& status,
                                        ProcessedActuatorCommand& result) {
    
    if (!pi_available) {
        PI_CLIENT_DEBUG("Pi not available for actuator processing");
        return false;
    }
    
    PI_CLIENT_DEBUGF("Processing actuator data - GPIO %d, type: %s, value: %.2f", 
                     gpio, actuator_type.c_str(), status.requested_value);
    
    // HTTP-Request konfigurieren
    http_client.begin(pi_server_url + "/api/actuator/process");
    http_client.addHeader("Content-Type", "application/json");
    http_client.addHeader("User-Agent", "ESP32-PiClient/1.0");
    http_client.setTimeout(5000);
    
    // JSON-Payload erstellen (an Pi-Server API angepasst)
    StaticJsonDocument<500> request_doc;
    request_doc["esp_id"] = esp_id;
    request_doc["gpio"] = gpio;
    request_doc["actuator_type"] = actuator_type;
    request_doc["requested_value"] = status.requested_value;
    request_doc["current_value"] = status.current_value;
    request_doc["temperature"] = status.temperature;
    request_doc["runtime_minutes"] = status.runtime_minutes;
    request_doc["load_factor"] = status.load_factor;
    request_doc["timestamp"] = millis();
    
    String request_payload;
    ArduinoJson::serializeJson(request_doc, request_payload);
    
    // POST-Request ausführen
    int http_code = http_client.POST(request_payload);
    
    if (http_code == HTTP_CODE_OK) {
        String response = http_client.getString();
        
        StaticJsonDocument<400> response_doc;
        DeserializationError error = deserializeJson(response_doc, response);
        
        if (error == DeserializationError::Ok) {
            bool success = response_doc["success"];
            
            if (success) {
                // Erfolgreiche Pi-Verarbeitung
                result.optimized_value = response_doc["optimized_value"];
                result.duration = response_doc["duration"];
                result.reason = response_doc["reason"].as<String>();
                result.quality = response_doc["quality"].as<String>();
                result.success = true;
                
                // Error-Counter zurücksetzen
                consecutive_errors = 0;
                
                PI_CLIENT_DEBUGF("Pi processed actuator GPIO %d: %.2f → %.2f (%ds, reason: %s)", 
                                gpio, status.requested_value, result.optimized_value, 
                                result.duration, result.reason.c_str());
                
                http_client.end();
                return true;
            } else {
                String error_msg = response_doc["error"];
                PI_CLIENT_DEBUGF("Pi actuator processing failed: %s", error_msg.c_str());
            }
        } else {
            PI_CLIENT_DEBUGF("JSON parse error in actuator response: %s", error.c_str());
        }
    } else {
        PI_CLIENT_DEBUGF("Pi actuator request failed - HTTP code: %d", http_code);
    }
    
    // Fehlerbehandlung
    consecutive_errors++;
    if (consecutive_errors >= MAX_CONSECUTIVE_ERRORS) {
        pi_available = false;
        PI_CLIENT_DEBUGF("Too many consecutive actuator errors (%d), marking Pi as unavailable", 
                        consecutive_errors);
    }
    
    http_client.end();
    return false;
}

// 🆕 NEU: Pi Registration Function
bool PiSensorClient::registerWithPi(const String& esp_name, const String& friendly_name, const String& zone) {
    if (!pi_available) {
        PI_CLIENT_DEBUG("Cannot register - Pi server not available");
        return false;
    }
    
    PI_CLIENT_DEBUGF("Registering ESP32-C3 with Pi server: %s", esp_name.c_str());
    
    // HTTP-Request konfigurieren
    http_client.begin(pi_server_url + "/api/register_device");
    http_client.addHeader("Content-Type", "application/json");
    http_client.addHeader("User-Agent", "ESP32-PiClient/1.0");
    http_client.setTimeout(5000);
    
    // JSON-Payload erstellen
    StaticJsonDocument<400> request_doc;
    request_doc["esp_id"] = esp_id;
    request_doc["esp_name"] = esp_name;
    request_doc["friendly_name"] = friendly_name;
    request_doc["zone"] = zone;
    request_doc["device_type"] = "ESP32-C3";
    request_doc["capabilities"] = "sensors,actuators,mqtt";
    request_doc["timestamp"] = millis();
    
    String request_payload;
    ArduinoJson::serializeJson(request_doc, request_payload);
    
    PI_CLIENT_DEBUGF("Registration payload: %s", request_payload.c_str());
    
    // POST-Request ausführen
    int http_code = http_client.POST(request_payload);
    
    if (http_code == HTTP_CODE_OK) {
        String response = http_client.getString();
        
        StaticJsonDocument<300> response_doc;
        DeserializationError error = deserializeJson(response_doc, response);
        
        if (error == DeserializationError::Ok) {
            bool success = response_doc["success"];
            
            if (success) {
                // Erfolgreiche Registration
                pi_registered = true;
                consecutive_errors = 0;
                
                String message = response_doc["message"];
                PI_CLIENT_DEBUGF("Registration successful: %s", message.c_str());
                
                http_client.end();
                return true;
            } else {
                String error_msg = response_doc["error"];
                PI_CLIENT_DEBUGF("Registration failed: %s", error_msg.c_str());
            }
        } else {
            PI_CLIENT_DEBUGF("JSON parse error in registration response: %s", error.c_str());
        }
    } else {
        PI_CLIENT_DEBUGF("Registration request failed - HTTP code: %d", http_code);
    }
    
    // Fehlerbehandlung
    consecutive_errors++;
    if (consecutive_errors >= MAX_CONSECUTIVE_ERRORS) {
        pi_available = false;
        PI_CLIENT_DEBUGF("Too many consecutive registration errors (%d), marking Pi as unavailable", 
                        consecutive_errors);
    }
    
    http_client.end();
    return false;
} 