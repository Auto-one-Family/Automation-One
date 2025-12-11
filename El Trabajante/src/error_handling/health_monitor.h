#ifndef ERROR_HANDLING_HEALTH_MONITOR_H
#define ERROR_HANDLING_HEALTH_MONITOR_H

#include <Arduino.h>
#include "../models/system_types.h"

// ============================================
// HEALTH SNAPSHOT STRUCTURE
// ============================================
struct HealthSnapshot {
    unsigned long timestamp;
    uint32_t heap_free;
    uint32_t heap_min_free;
    uint8_t heap_fragmentation_percent;
    unsigned long uptime_seconds;
    size_t error_count;
    bool wifi_connected;
    int8_t wifi_rssi;
    bool mqtt_connected;
    uint8_t sensor_count;
    uint8_t actuator_count;
    SystemState system_state;
};

// ============================================
// HEALTH MONITOR CLASS
// ============================================
class HealthMonitor {
public:
    // Singleton Instance
    static HealthMonitor& getInstance();
    
    // Initialization
    bool begin();
    
    // Health Snapshot Generation
    HealthSnapshot getCurrentSnapshot() const;
    String getSnapshotJSON() const;
    
    // Publishing (automatic via loop())
    void publishSnapshot();
    void publishSnapshotIfChanged();
    
    // Loop (call in main loop)
    void loop();
    
    // Configuration
    void setPublishInterval(unsigned long interval_ms);
    void setChangeDetectionEnabled(bool enabled);
    
    // Status Getters
    uint32_t getHeapFree() const;
    uint32_t getHeapMinFree() const;
    uint8_t getHeapFragmentation() const;
    unsigned long getUptimeSeconds() const;
    
private:
    HealthMonitor();
    ~HealthMonitor() = default;
    
    // Prevent copy
    HealthMonitor(const HealthMonitor&) = delete;
    HealthMonitor& operator=(const HealthMonitor&) = delete;
    
    // Change Detection
    HealthSnapshot last_published_snapshot_;
    bool change_detection_enabled_;
    
    // Publishing Configuration
    unsigned long publish_interval_ms_;
    unsigned long last_publish_time_;
    
    // Initialization flag
    bool initialized_;
    
    // Thresholds for Change Detection
    static const uint32_t HEAP_CHANGE_THRESHOLD_PERCENT = 20;
    static const int8_t RSSI_CHANGE_THRESHOLD_DBM = 10;
    
    // Helper methods
    bool hasSignificantChanges(const HealthSnapshot& current, const HealthSnapshot& last) const;
    String buildDiagnosticsTopic() const;
};

// Global Instance
extern HealthMonitor& healthMonitor;

#endif // ERROR_HANDLING_HEALTH_MONITOR_H









