#ifndef MODELS_ACTUATOR_TYPES_H
#define MODELS_ACTUATOR_TYPES_H

#include <Arduino.h>

// ✅ Actuator Types (String-basiert)
// Migration aus: actuator_system.h (String-basierte Typen bereits verwendet)
// Beispiele: "pump", "valve", "pwm", "relay"

// ✅ Actuator Configuration - VEREINFACHT für Server-Centric
struct ActuatorConfig {
  uint8_t gpio = 255;                    // GPIO-Pin
  String actuator_type = "";             // ✅ String: "pump", "valve", "pwm", "relay"
  String actuator_name = "";             // User-definierter Name
  String subzone_id = "";                // Subzone-Zuordnung
  bool active = false;                   // Actuator aktiv?
  
  // ✅ GPIO-State (ESP macht nur GPIO-Control):
  bool current_state = false;            // ON/OFF (für Digital)
  uint8_t current_pwm = 0;               // PWM-Wert (0-255, für Analog)
  unsigned long last_command = 0;        // Timestamp des letzten Commands
  
  // ❌ NICHT NÖTIG in Server-Centric Architektur:
  // - void* library_handle (keine lokalen Libraries)
  // - float last_value (GPIO-State reicht)
};

// Actuator Command (MQTT-Payload)
struct ActuatorCommand {
  uint8_t gpio;
  String command_type;                   // "set_digital", "set_pwm", "emergency_stop"
  bool digital_state;                    // Für "set_digital"
  uint8_t pwm_value;                     // Für "set_pwm"
  unsigned long timestamp;
};

// Actuator Status (MQTT-Payload)
struct ActuatorStatus {
  uint8_t gpio;
  String actuator_type;
  bool current_state;
  uint8_t current_pwm;
  unsigned long runtime_ms;              // Gesamtlaufzeit (für Pumps)
  bool error_state;
  String error_message;
};

#endif

