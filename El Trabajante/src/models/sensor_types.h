#ifndef MODELS_SENSOR_TYPES_H
#define MODELS_SENSOR_TYPES_H

#include <Arduino.h>

// ✅ Sensor Types (String-basiert für Server-Centric)
// Migration aus: main.cpp:131-146 (SensorType Enum)
// ABER: Als String statt Enum (Flexibilität für Server-definierte Typen)
// Beispiele: "ph_sensor", "temperature_ds18b20", "ec_sensor", etc.

// ✅ Sensor Configuration - VEREINFACHT für Server-Centric
// Migration aus: main.cpp:415-430 (SensorConfig Struct)
struct SensorConfig {
  uint8_t gpio = 255;                    // GPIO-Pin
  String sensor_type = "";               // ✅ String statt Enum (z.B. "ph_sensor")
  String sensor_name = "";               // User-definierter Name
  String subzone_id = "";                // Subzone-Zuordnung
  bool active = false;                   // Sensor aktiv?

  // ✅ Phase 2C: Operating Mode Support
  // Modes: "continuous" (auto-measure), "on_demand" (command only),
  //        "paused" (no measure), "scheduled" (server-triggered)
  String operating_mode = "continuous";      // Betriebsmodus
  uint32_t measurement_interval_ms = 30000;  // Pro-Sensor Messintervall (ms)

  // ✅ Pi-Enhanced Mode (DEFAULT - 90% der Anwendungen):
  bool raw_mode = true;                  // IMMER true (Rohdaten-Modus)
  uint32_t last_raw_value = 0;           // Letzter Rohdaten-Wert (ADC 0-4095)
  unsigned long last_reading = 0;        // Timestamp der letzten Messung
  
  // ❌ NICHT NÖTIG in Server-Centric Architektur:
  // - float last_value (Server verarbeitet)
  // - void* library_handle (keine lokalen Libraries)
  // - bool library_loaded (keine lokalen Libraries)
  // - String library_name (Server-side)
  // - String library_version (Server-side)
};

// Sensor Reading Result (für MQTT-Payload)
struct SensorReading {
  uint8_t gpio;
  String sensor_type;
  String subzone_id;                     // Subzone-Zuordnung (aus SensorConfig)
  uint32_t raw_value;                    // ADC-Wert
  float processed_value;                 // Vom Server zurückgegeben
  String unit;                           // Vom Server zurückgegeben
  String quality;                        // Vom Server zurückgegeben
  unsigned long timestamp;
  bool valid;
  String error_message;
};

#endif

