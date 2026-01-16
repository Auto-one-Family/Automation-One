#ifndef MODELS_SENSOR_TYPES_H
#define MODELS_SENSOR_TYPES_H

#include <Arduino.h>

// ✅ Sensor Types (String-basiert für Server-Centric)
// Migration aus: main.cpp:131-146 (SensorType Enum)
// ABER: Als String statt Enum (Flexibilität für Server-definierte Typen)
// Beispiele: "ph_sensor", "temperature_ds18b20", "ec_sensor", etc.

// ============================================
// SENSOR CONFIGURATION - Server-Centric
// ============================================
// Migration aus: main.cpp:415-430 (SensorConfig Struct)
struct SensorConfig {
  uint8_t gpio = 255;                    // GPIO-Pin
  String sensor_type = "";               // String statt Enum (z.B. "ph_sensor", "ds18b20")
  String sensor_name = "";               // User-definierter Name
  String subzone_id = "";                // Subzone-Zuordnung
  bool active = false;                   // Sensor aktiv?

  // Phase 2C: Operating Mode Support
  // Modes: "continuous" (auto-measure), "on_demand" (command only),
  //        "paused" (no measure), "scheduled" (server-triggered)
  String operating_mode = "continuous";      // Betriebsmodus
  uint32_t measurement_interval_ms = 30000;  // Pro-Sensor Messintervall (ms)

  // Pi-Enhanced Mode (DEFAULT - 90% der Anwendungen):
  bool raw_mode = true;                  // IMMER true (Rohdaten-Modus)
  uint32_t last_raw_value = 0;           // Letzter Rohdaten-Wert (ADC 0-4095)
  unsigned long last_reading = 0;        // Timestamp der letzten Messung
  
  // ============================================
  // ONEWIRE SUPPORT (DS18B20, DS18S20, DS1822)
  // ============================================
  // ROM-Code for unique device identification on shared OneWire bus
  // Format: 16 Hex chars (e.g. "28FF641E8D3C0C79")
  // Empty for non-OneWire sensors (pH, EC, ADC-based, etc.)
  String onewire_address = "";
  
  // ❌ NICHT NÖTIG in Server-Centric Architektur:
  // - float last_value (Server verarbeitet)
  // - void* library_handle (keine lokalen Libraries)
  // - bool library_loaded (keine lokalen Libraries)
  // - String library_name (Server-side)
  // - String library_version (Server-side)
};

// ============================================
// SENSOR READING RESULT (für MQTT-Payload)
// ============================================
struct SensorReading {
  uint8_t gpio;
  String sensor_type;
  String subzone_id;                     // Subzone-Zuordnung (aus SensorConfig)
  uint32_t raw_value;                    // ADC-Wert / RAW 12-bit für OneWire
  float processed_value;                 // Vom Server zurückgegeben
  String unit;                           // Vom Server zurückgegeben
  String quality;                        // Vom Server zurückgegeben
  unsigned long timestamp;
  bool valid;
  String error_message;
  
  // ============================================
  // RAW MODE FLAG (Server-Centric Architecture)
  // ============================================
  // Indicates whether raw_value is RAW data (true) or already converted (false)
  // - true: Server must apply conversion formula (e.g. raw * 0.0625 for DS18B20)
  // - false: Value already converted to final unit (legacy support)
  // Default: true (Pi-Enhanced Mode - 90% of use cases)
  bool raw_mode = true;
  
  // ============================================
  // ONEWIRE SUPPORT (for MQTT payload identification)
  // ============================================
  // Copied from SensorConfig - Server uses this to identify
  // which DS18B20 on a shared bus sent this reading
  // Format: 16 Hex chars (e.g. "28FF641E8D3C0C79")
  String onewire_address = "";
};

#endif

