#ifndef UTILS_TIME_MANAGER_H
#define UTILS_TIME_MANAGER_H

/**
 * @file time_manager.h
 * @brief NTP Time Synchronization Manager for ESP32
 * 
 * Provides accurate Unix timestamps via NTP synchronization.
 * Critical for:
 * - Sensor data timestamps
 * - Actuator command logging
 * - Event correlation across distributed ESP32 nodes
 * 
 * Features:
 * - Automatic NTP sync after WiFi connection
 * - Multiple NTP server fallbacks
 * - Graceful degradation to millis() if NTP fails
 * - Periodic re-synchronization
 * - Thread-safe timestamp access
 * 
 * @version 1.0.0
 * @date 2024-12-08
 */

#include <Arduino.h>
#include <time.h>

// ============================================
// CONFIGURATION CONSTANTS
// ============================================

// NTP Servers (Industrial-grade, geographically distributed)
#define NTP_SERVER_PRIMARY    "pool.ntp.org"
#define NTP_SERVER_SECONDARY  "time.nist.gov"
#define NTP_SERVER_TERTIARY   "time.google.com"

// Timezone: UTC (Server handles timezone conversion)
#define NTP_GMT_OFFSET_SEC    0
#define NTP_DAYLIGHT_OFFSET   0

// Sync Configuration
#define NTP_SYNC_TIMEOUT_MS       10000   // 10 seconds max wait for initial sync
#define NTP_RESYNC_INTERVAL_MS    3600000 // Re-sync every hour
#define NTP_RETRY_DELAY_MS        1000    // Retry delay on failure
#define NTP_MAX_RETRIES           5       // Max retries per sync attempt

// Validation
#define NTP_MIN_VALID_TIMESTAMP   1700000000  // ~2023-11-14 (sanity check)
#define NTP_MAX_VALID_TIMESTAMP   2500000000  // ~2049-03-22 (sanity check)

// ============================================
// TIME MANAGER CLASS
// ============================================

/**
 * @class TimeManager
 * @brief Singleton NTP Time Manager for accurate timestamps
 * 
 * Usage:
 * 1. Call begin() after WiFi is connected
 * 2. Use getUnixTimestamp() for all MQTT payloads
 * 3. Call loop() periodically for re-synchronization
 */
class TimeManager {
public:
    // ============================================
    // SINGLETON PATTERN
    // ============================================
    
    /**
     * @brief Get singleton instance
     * @return Reference to TimeManager instance
     */
    static TimeManager& getInstance();
    
    // ============================================
    // LIFECYCLE
    // ============================================
    
    /**
     * @brief Initialize NTP time synchronization
     * 
     * Call this AFTER WiFi is connected.
     * Blocks until time is synchronized or timeout.
     * 
     * @return true if time synchronized successfully
     */
    bool begin();
    
    /**
     * @brief Periodic maintenance loop
     * 
     * Call from main loop for automatic re-synchronization.
     * Non-blocking.
     */
    void loop();
    
    // ============================================
    // TIMESTAMP ACCESS
    // ============================================
    
    /**
     * @brief Get current Unix timestamp (seconds since 1970)
     * 
     * Returns:
     * - NTP-synchronized timestamp if available
     * - Estimated timestamp (last sync + elapsed millis) if sync stale
     * - 0 if never synchronized (indicates error condition)
     * 
     * @return Unix timestamp in seconds
     */
    time_t getUnixTimestamp() const;
    
    /**
     * @brief Get current Unix timestamp in milliseconds
     * 
     * Higher precision for timing-critical applications.
     * Milliseconds are estimated from millis() since last sync.
     * 
     * @return Unix timestamp in milliseconds
     */
    uint64_t getUnixTimestampMs() const;
    
    /**
     * @brief Get formatted timestamp string
     * 
     * @param format strftime format string (default: ISO 8601)
     * @return Formatted timestamp string
     */
    String getFormattedTime(const char* format = "%Y-%m-%dT%H:%M:%SZ") const;
    
    // ============================================
    // STATUS QUERIES
    // ============================================
    
    /**
     * @brief Check if time is synchronized
     * @return true if NTP sync was successful
     */
    bool isSynchronized() const;
    
    /**
     * @brief Check if time sync is still valid
     * 
     * Sync is considered stale after NTP_RESYNC_INTERVAL_MS.
     * Time is still usable but re-sync is recommended.
     * 
     * @return true if sync is fresh (< resync interval)
     */
    bool isSyncFresh() const;
    
    /**
     * @brief Get time since last successful sync
     * @return Milliseconds since last sync, or UINT32_MAX if never synced
     */
    unsigned long getTimeSinceSync() const;
    
    /**
     * @brief Get sync status as human-readable string
     * @return Status string for debugging/logging
     */
    String getSyncStatus() const;
    
    // ============================================
    // MANUAL CONTROL
    // ============================================
    
    /**
     * @brief Force immediate re-synchronization
     * 
     * Blocks until sync completes or times out.
     * Use sparingly to avoid NTP server abuse.
     * 
     * @return true if re-sync successful
     */
    bool forceResync();
    
    /**
     * @brief Set custom NTP servers
     * 
     * @param primary Primary NTP server hostname
     * @param secondary Secondary NTP server hostname (optional)
     * @param tertiary Tertiary NTP server hostname (optional)
     */
    void setNTPServers(const char* primary, 
                       const char* secondary = nullptr,
                       const char* tertiary = nullptr);

private:
    // ============================================
    // SINGLETON IMPLEMENTATION
    // ============================================
    TimeManager();
    ~TimeManager() = default;
    TimeManager(const TimeManager&) = delete;
    TimeManager& operator=(const TimeManager&) = delete;
    
    // ============================================
    // INTERNAL STATE
    // ============================================
    bool initialized_;
    bool synchronized_;
    time_t last_sync_time_;           // Unix timestamp at last sync
    unsigned long last_sync_millis_;  // millis() at last sync
    unsigned long last_resync_check_; // millis() at last resync check
    
    // Custom NTP servers (optional)
    const char* ntp_server_primary_;
    const char* ntp_server_secondary_;
    const char* ntp_server_tertiary_;
    
    // ============================================
    // INTERNAL METHODS
    // ============================================
    
    /**
     * @brief Perform NTP synchronization
     * @param timeout_ms Maximum time to wait for sync
     * @return true if sync successful
     */
    bool synchronizeNTP(unsigned long timeout_ms = NTP_SYNC_TIMEOUT_MS);
    
    /**
     * @brief Validate timestamp is within expected range
     * @param timestamp Unix timestamp to validate
     * @return true if timestamp appears valid
     */
    bool isValidTimestamp(time_t timestamp) const;
    
    /**
     * @brief Get current time from system
     * @param out_time Output parameter for time struct
     * @return true if time available
     */
    bool getSystemTime(struct tm* out_time) const;
};

// ============================================
// GLOBAL INSTANCE
// ============================================
extern TimeManager& timeManager;

#endif // UTILS_TIME_MANAGER_H

