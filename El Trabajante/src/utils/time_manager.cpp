/**
 * @file time_manager.cpp
 * @brief NTP Time Synchronization Manager Implementation
 * 
 * Industrial-grade NTP synchronization for ESP32 IoT applications.
 * 
 * Implementation Notes:
 * - Uses configTime() for initial NTP configuration
 * - getLocalTime() retrieves synchronized time
 * - Fallback to estimated time if sync fails
 * - Thread-safe for FreeRTOS multi-task environments
 * 
 * @version 1.0.0
 * @date 2024-12-08
 */

#include "time_manager.h"
#include "logger.h"
#include <WiFi.h>

// ============================================
// SINGLETON INSTANCE
// ============================================
TimeManager& timeManager = TimeManager::getInstance();

TimeManager& TimeManager::getInstance() {
    static TimeManager instance;
    return instance;
}

// ============================================
// CONSTRUCTOR
// ============================================
TimeManager::TimeManager()
    : initialized_(false)
    , synchronized_(false)
    , last_sync_time_(0)
    , last_sync_millis_(0)
    , last_resync_check_(0)
    , ntp_server_primary_(NTP_SERVER_PRIMARY)
    , ntp_server_secondary_(NTP_SERVER_SECONDARY)
    , ntp_server_tertiary_(NTP_SERVER_TERTIARY) {
}

// ============================================
// LIFECYCLE
// ============================================

bool TimeManager::begin() {
    if (initialized_) {
        LOG_WARNING("TimeManager already initialized");
        return synchronized_;
    }
    
    LOG_INFO("╔════════════════════════════════════════╗");
    LOG_INFO("║  TimeManager: NTP Initialization       ║");
    LOG_INFO("╚════════════════════════════════════════╝");
    
    // Check WiFi connection
    if (WiFi.status() != WL_CONNECTED) {
        LOG_ERROR("TimeManager: WiFi not connected - cannot sync NTP");
        LOG_ERROR("  Call TimeManager::begin() AFTER WiFi is connected");
        initialized_ = true;  // Mark as initialized but not synchronized
        return false;
    }
    
    LOG_INFO("TimeManager: Configuring NTP servers...");
    LOG_INFO("  Primary:   " + String(ntp_server_primary_));
    LOG_INFO("  Secondary: " + String(ntp_server_secondary_));
    LOG_INFO("  Tertiary:  " + String(ntp_server_tertiary_));
    
    // Configure NTP (ESP32 IDF function)
    // Parameters: GMT offset (seconds), Daylight offset (seconds), NTP servers
    configTime(NTP_GMT_OFFSET_SEC, NTP_DAYLIGHT_OFFSET, 
               ntp_server_primary_, 
               ntp_server_secondary_, 
               ntp_server_tertiary_);
    
    initialized_ = true;
    
    // Perform initial synchronization
    if (synchronizeNTP(NTP_SYNC_TIMEOUT_MS)) {
        LOG_INFO("╔════════════════════════════════════════╗");
        LOG_INFO("║  ✅ NTP Sync Successful                ║");
        LOG_INFO("╚════════════════════════════════════════╝");
        LOG_INFO("  Unix Timestamp: " + String((unsigned long)last_sync_time_));
        LOG_INFO("  Formatted:      " + getFormattedTime());
        return true;
    } else {
        LOG_WARNING("╔════════════════════════════════════════╗");
        LOG_WARNING("║  ⚠️  NTP Sync Failed                   ║");
        LOG_WARNING("╚════════════════════════════════════════╝");
        LOG_WARNING("  Will retry in background");
        LOG_WARNING("  Timestamps will use estimated time");
        return false;
    }
}

void TimeManager::loop() {
    if (!initialized_) {
        return;
    }
    
    unsigned long now = millis();
    
    // Check if re-sync is needed
    if (now - last_resync_check_ < NTP_RESYNC_INTERVAL_MS) {
        return;
    }
    
    last_resync_check_ = now;
    
    // Check WiFi before attempting resync
    if (WiFi.status() != WL_CONNECTED) {
        LOG_DEBUG("TimeManager: Skipping resync - WiFi disconnected");
        return;
    }
    
    // Check if we never synchronized successfully
    if (!synchronized_) {
        LOG_INFO("TimeManager: Attempting delayed NTP sync...");
        synchronizeNTP(NTP_SYNC_TIMEOUT_MS / 2);  // Shorter timeout for background sync
        return;
    }
    
    // Periodic re-sync for long-running systems
    LOG_DEBUG("TimeManager: Periodic NTP re-sync...");
    synchronizeNTP(NTP_SYNC_TIMEOUT_MS / 2);
}

// ============================================
// TIMESTAMP ACCESS
// ============================================

time_t TimeManager::getUnixTimestamp() const {
    if (!initialized_) {
        LOG_WARNING("TimeManager: Not initialized, returning 0");
        return 0;
    }
    
    // If synchronized, get fresh time from system
    if (synchronized_) {
        struct tm timeinfo;
        if (getSystemTime(&timeinfo)) {
            time_t current = mktime(&timeinfo);
            if (isValidTimestamp(current)) {
                return current;
            }
        }
    }
    
    // Fallback: estimate from last sync + elapsed millis
    if (last_sync_time_ > 0) {
        unsigned long elapsed_ms = millis() - last_sync_millis_;
        time_t estimated = last_sync_time_ + (elapsed_ms / 1000);
        
        if (isValidTimestamp(estimated)) {
            return estimated;
        }
    }
    
    // Last resort: return 0 to indicate no valid timestamp
    // Server should use server-time as fallback
    LOG_WARNING("TimeManager: No valid timestamp available");
    return 0;
}

uint64_t TimeManager::getUnixTimestampMs() const {
    time_t seconds = getUnixTimestamp();
    
    if (seconds == 0) {
        return 0;
    }
    
    // Add millisecond precision from millis() delta
    unsigned long elapsed_since_sync = millis() - last_sync_millis_;
    unsigned long ms_fraction = elapsed_since_sync % 1000;
    
    return (uint64_t)seconds * 1000 + ms_fraction;
}

String TimeManager::getFormattedTime(const char* format) const {
    struct tm timeinfo;
    
    if (!getSystemTime(&timeinfo)) {
        return "TIME_NOT_AVAILABLE";
    }
    
    char buffer[64];
    strftime(buffer, sizeof(buffer), format, &timeinfo);
    return String(buffer);
}

// ============================================
// STATUS QUERIES
// ============================================

bool TimeManager::isSynchronized() const {
    return synchronized_;
}

bool TimeManager::isSyncFresh() const {
    if (!synchronized_) {
        return false;
    }
    
    unsigned long elapsed = millis() - last_sync_millis_;
    return elapsed < NTP_RESYNC_INTERVAL_MS;
}

unsigned long TimeManager::getTimeSinceSync() const {
    if (!synchronized_) {
        return UINT32_MAX;
    }
    
    return millis() - last_sync_millis_;
}

String TimeManager::getSyncStatus() const {
    if (!initialized_) {
        return "NOT_INITIALIZED";
    }
    
    if (!synchronized_) {
        return "NOT_SYNCHRONIZED";
    }
    
    if (isSyncFresh()) {
        unsigned long age_sec = getTimeSinceSync() / 1000;
        return "SYNCHRONIZED (age: " + String(age_sec) + "s)";
    } else {
        return "SYNC_STALE (needs resync)";
    }
}

// ============================================
// MANUAL CONTROL
// ============================================

bool TimeManager::forceResync() {
    if (!initialized_) {
        LOG_ERROR("TimeManager: Cannot resync - not initialized");
        return false;
    }
    
    if (WiFi.status() != WL_CONNECTED) {
        LOG_ERROR("TimeManager: Cannot resync - WiFi disconnected");
        return false;
    }
    
    LOG_INFO("TimeManager: Forcing NTP re-synchronization...");
    
    // Reconfigure NTP (clears cached time)
    configTime(NTP_GMT_OFFSET_SEC, NTP_DAYLIGHT_OFFSET,
               ntp_server_primary_,
               ntp_server_secondary_,
               ntp_server_tertiary_);
    
    return synchronizeNTP(NTP_SYNC_TIMEOUT_MS);
}

void TimeManager::setNTPServers(const char* primary, 
                                 const char* secondary,
                                 const char* tertiary) {
    ntp_server_primary_ = primary ? primary : NTP_SERVER_PRIMARY;
    ntp_server_secondary_ = secondary ? secondary : NTP_SERVER_SECONDARY;
    ntp_server_tertiary_ = tertiary ? tertiary : NTP_SERVER_TERTIARY;
    
    LOG_INFO("TimeManager: NTP servers updated");
    LOG_INFO("  Primary:   " + String(ntp_server_primary_));
    LOG_INFO("  Secondary: " + String(ntp_server_secondary_));
    LOG_INFO("  Tertiary:  " + String(ntp_server_tertiary_));
    
    // If already initialized, reconfigure
    if (initialized_) {
        configTime(NTP_GMT_OFFSET_SEC, NTP_DAYLIGHT_OFFSET,
                   ntp_server_primary_,
                   ntp_server_secondary_,
                   ntp_server_tertiary_);
    }
}

// ============================================
// INTERNAL METHODS
// ============================================

bool TimeManager::synchronizeNTP(unsigned long timeout_ms) {
    struct tm timeinfo;
    unsigned long start = millis();
    uint8_t retries = 0;
    
    LOG_DEBUG("TimeManager: Waiting for NTP sync (timeout: " + String(timeout_ms) + "ms)");
    
    while (retries < NTP_MAX_RETRIES) {
        // Check timeout
        if (millis() - start > timeout_ms) {
            LOG_WARNING("TimeManager: NTP sync timeout after " + String(timeout_ms) + "ms");
            return false;
        }
        
        // Try to get time
        if (getLocalTime(&timeinfo, NTP_RETRY_DELAY_MS)) {
            // Convert to Unix timestamp
            time_t now = mktime(&timeinfo);
            
            // Validate timestamp
            if (isValidTimestamp(now)) {
                // Success!
                synchronized_ = true;
                last_sync_time_ = now;
                last_sync_millis_ = millis();
                
                LOG_DEBUG("TimeManager: NTP sync successful after " + 
                          String(retries + 1) + " attempt(s)");
                return true;
            } else {
                LOG_WARNING("TimeManager: Invalid timestamp received: " + String((unsigned long)now));
            }
        }
        
        retries++;
        LOG_DEBUG("TimeManager: NTP retry " + String(retries) + "/" + String(NTP_MAX_RETRIES));
        
        // Small delay between retries
        delay(NTP_RETRY_DELAY_MS);
    }
    
    LOG_ERROR("TimeManager: NTP sync failed after " + String(NTP_MAX_RETRIES) + " retries");
    return false;
}

bool TimeManager::isValidTimestamp(time_t timestamp) const {
    // Sanity check: timestamp should be between 2023 and 2049
    return (timestamp >= NTP_MIN_VALID_TIMESTAMP && 
            timestamp <= NTP_MAX_VALID_TIMESTAMP);
}

bool TimeManager::getSystemTime(struct tm* out_time) const {
    if (!out_time) {
        return false;
    }
    
    // getLocalTime is ESP32-specific, returns false if time not set
    return getLocalTime(out_time, 0);  // Non-blocking
}

