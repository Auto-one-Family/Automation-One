#ifndef ACTUATOR_TYPES_H
#define ACTUATOR_TYPES_H

#include <Arduino.h>

// =============================================================================
// ACTUATOR DATA STRUCTURES - Shared between actuator_system.h and pi_sensor_client.h
// =============================================================================

struct ActuatorStatus {
    uint8_t gpio;
    String actuator_type;       // "pump", "valve", "pwm", "heater"
    float current_value;        // Aktueller Hardware-Zustand (0.0-1.0)
    float requested_value;      // Gewünschter Wert (0.0-1.0)
    float temperature;          // Umgebungstemperatur für Kontext
    int runtime_minutes;        // Wie lange läuft bereits
    float load_factor;          // Aktuelle Last/Verbrauch
    unsigned long timestamp;    // Zeitstempel
};

struct ProcessedActuatorCommand {
    float optimized_value;      // Pi-optimierter Wert (0.0-1.0)
    int duration;              // Empfohlene Laufzeit (Sekunden)
    String reason;             // Begründung der Pi-Optimierung
    String quality;            // "pi_optimized", "fallback", "direct"
    bool success;              // Verarbeitung erfolgreich
};

#endif // ACTUATOR_TYPES_H 