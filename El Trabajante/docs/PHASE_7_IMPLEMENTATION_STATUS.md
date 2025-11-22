# Phase 7: Error Handling & Health Monitoring - Implementierungs-Status

**Version:** 1.0  
**Datum:** 2025-01-28  
**Status:** ⚠️ ~60% IMPLEMENTIERT  
**Zielgruppe:** Entwickler, KI-Agenten (Cursor, Claude)

---

## 📊 Übersicht

Phase 7 implementiert umfassendes Error-Handling, Health-Monitoring und Recovery-Mechanismen für das ESP32-System. Der aktuelle Stand ist **~60% implementiert** mit den Kern-Features (ErrorTracker, CircuitBreaker, Zone Assignment) bereits Production-Ready.

### Implementierungs-Status

| Modul | Status | Zeilen | Priorität | Abhängigkeiten |
|-------|--------|--------|-----------|----------------|
| **ErrorTracker** | ✅ COMPLETE | ~200 | 🔴 CRITICAL | Logger |
| **CircuitBreaker** | ✅ COMPLETE | ~200 | 🔴 CRITICAL | KEINE |
| **Zone Assignment** | ✅ COMPLETE | ~100 | 🟡 HIGH | ConfigManager, MQTTClient |
| **HealthMonitor** | ⚠️ SKELETON | 0 | 🟡 HIGH | ErrorTracker, MQTTClient |
| **MQTTConnectionManager** | ⚠️ SKELETON | 0 | 🟢 OPTIONAL | MQTTClient (bereits integriert) |
| **PiCircuitBreaker** | ⚠️ SKELETON | 0 | 🟢 OPTIONAL | CircuitBreaker (bereits verwendet) |

**Gesamt:** ~400 Zeilen implementiert von ~700 geplanten Zeilen

---

## ✅ Implementierte Module

### 1. ErrorTracker ✅ COMPLETE

**Dateien:**
- `src/error_handling/error_tracker.h` (~102 Zeilen)
- `src/error_handling/error_tracker.cpp` (~200 Zeilen)

**Status:** ✅ Production-Ready, vollständig implementiert und getestet

**Features:**
- ✅ Error-Code-Kategorisierung (Hardware, Service, Communication, Application)
- ✅ Error-Severity-Levels (Warning, Error, Critical)
- ✅ Circular Buffer (50 Einträge, fixed-size)
- ✅ Duplicate-Detection (1s Window)
- ✅ Occurrence Counting
- ✅ Logger-Integration (automatisches Logging)
- ✅ Error-History-Retrieval
- ✅ Category-basierte Filterung

**Integration:**
- ✅ Initialisiert in `main.cpp` (Zeile 242)
- ✅ Wird von allen Modulen verwendet (WiFi, MQTT, Sensors, Actuators)
- ✅ Error-Codes definiert in `src/models/error_codes.h`

**API-Beispiel:**
```cpp
// Error tracking
errorTracker.trackError(ERROR_SENSOR_INIT_FAILED, 
                       ERROR_SEVERITY_CRITICAL,
                       "Sensor initialization failed");

// Error history
String history = errorTracker.getErrorHistory(20);
size_t count = errorTracker.getErrorCount();
```

**Erfolgs-Kriterien:** ✅ ALLE ERFÜLLT
- [x] Error-Tracking funktioniert
- [x] Circular Buffer funktioniert
- [x] Duplicate-Detection funktioniert
- [x] Logger-Integration funktioniert
- [x] Alle Module verwenden ErrorTracker

---

### 2. CircuitBreaker ✅ COMPLETE

**Dateien:**
- `src/error_handling/circuit_breaker.h` (~146 Zeilen)
- `src/error_handling/circuit_breaker.cpp` (~200 Zeilen)

**Status:** ✅ Production-Ready, vollständig implementiert und integriert

**Features:**
- ✅ State-Machine (CLOSED → OPEN → HALF_OPEN)
- ✅ Failure-Threshold-Konfiguration
- ✅ Recovery-Timeout-Konfiguration
- ✅ Half-Open-Test-Mode
- ✅ Service-Name-basiertes Logging

**Integration:**
- ✅ **WiFiManager:** 10 failures → 60s timeout
- ✅ **MQTTClient:** 5 failures → 30s timeout
- ✅ **PiEnhancedProcessor:** 5 failures → 60s timeout

**Konfiguration:**
```cpp
// WiFi Circuit Breaker
CircuitBreaker wifi_breaker("WiFi", 10, 60000, 10000);
// 10 failures → OPEN
// 60s recovery timeout
// 10s half-open test

// MQTT Circuit Breaker
CircuitBreaker mqtt_breaker("MQTT", 5, 30000, 10000);
// 5 failures → OPEN
// 30s recovery timeout
// 10s half-open test
```

**Verwendung:**
```cpp
if (circuit_breaker_.allowRequest()) {
    bool success = performOperation();
    if (success) {
        circuit_breaker_.recordSuccess();
    } else {
        circuit_breaker_.recordFailure();
    }
}
```

**Erfolgs-Kriterien:** ✅ ALLE ERFÜLLT
- [x] State-Machine funktioniert
- [x] WiFi-Manager verwendet Circuit Breaker
- [x] MQTT-Client verwendet Circuit Breaker
- [x] Pi-Enhanced-Processor verwendet Circuit Breaker
- [x] Retry-Spam wird verhindert

---

### 3. Zone Assignment ✅ COMPLETE

**Dateien:**
- `src/services/config/config_manager.h` (Zeile 31-33)
- `src/services/config/config_manager.cpp` (Zeile 256-280)
- `src/main.cpp` (Zeile 415-489)

**Status:** ✅ Production-Ready, vollständig implementiert

**Features:**
- ✅ `ConfigManager::updateZoneAssignment()` - Zone-Zuordnung speichern
- ✅ MQTT-Handler für Zone-Assignment
- ✅ Zone-Topic: `kaiser/{kaiser_id}/esp/{esp_id}/zone/assign`
- ✅ Zone-Acknowledgment: `kaiser/{kaiser_id}/esp/{esp_id}/zone/ack`
- ✅ NVS-Persistenz (zone_id, master_zone_id, zone_name)
- ✅ TopicBuilder-Update bei Zone-Änderung

**MQTT-Integration:**
```cpp
// Zone Assignment Handler (main.cpp Zeile 415-489)
String zone_assign_topic = "kaiser/" + g_kaiser.kaiser_id + 
                           "/esp/" + g_system_config.esp_id + "/zone/assign";

// ConfigManager API
bool success = configManager.updateZoneAssignment(
    zone_id, master_zone_id, zone_name, kaiser_id);
```

**Erfolgs-Kriterien:** ✅ ALLE ERFÜLLT
- [x] Zone-Assignment via MQTT funktioniert
- [x] NVS-Persistenz funktioniert
- [x] TopicBuilder wird aktualisiert
- [x] Acknowledgment wird gesendet

---

## ⚠️ Fehlende Module

### 1. HealthMonitor ⚠️ SKELETON

**Dateien:**
- `src/error_handling/health_monitor.h` - **LEER (nur Platzhalter)**
- `src/error_handling/health_monitor.cpp` - **FEHLT**

**Status:** ⚠️ Nicht implementiert - **HOHE PRIORITÄT**

**Geplante Features:**
- Heap-Usage-Tracking (free, min_free, fragmentation)
- Uptime-Tracking (millis() → seconds)
- Connection-Status-Tracking (WiFi, MQTT)
- Sensor/Actuator-Count-Tracking
- Health-Snapshot alle 60s → MQTT Topic `system/diagnostics`
- Change-Detection (nur bei Änderungen publishen)

**Implementierungs-Anforderungen:**

#### 1.1 Header-Definition (`health_monitor.h`)

```cpp
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
    
    // Change Detection
    HealthSnapshot last_published_snapshot_;
    bool change_detection_enabled_;
    
    // Publishing Configuration
    unsigned long publish_interval_ms_;
    unsigned long last_publish_time_;
    
    // Thresholds for Change Detection
    static const uint32_t HEAP_CHANGE_THRESHOLD_PERCENT = 20;
    static const int8_t RSSI_CHANGE_THRESHOLD_DBM = 10;
};

// Global Instance
extern HealthMonitor& healthMonitor;

#endif
```

#### 1.2 Implementierung (`health_monitor.cpp`)

**Wichtige Implementierungs-Details:**

1. **Heap-Fragmentation-Berechnung:**
```cpp
uint8_t HealthMonitor::getHeapFragmentation() const {
    uint32_t free_heap = ESP.getFreeHeap();
    uint32_t min_free_heap = ESP.getMinFreeHeap();
    
    if (free_heap == 0) return 100;
    
    // Fragmentation = (free - min_free) / free * 100
    uint32_t fragmentation_bytes = free_heap - min_free_heap;
    return (fragmentation_bytes * 100) / free_heap;
}
```

2. **Change-Detection-Logik:**
```cpp
bool HealthMonitor::hasSignificantChanges(const HealthSnapshot& current, 
                                          const HealthSnapshot& last) const {
    // Heap change > 20%
    uint32_t heap_change = abs((int32_t)(current.heap_free - last.heap_free));
    if (heap_change * 100 / last.heap_free > HEAP_CHANGE_THRESHOLD_PERCENT) {
        return true;
    }
    
    // RSSI change > 10 dBm
    if (abs(current.wifi_rssi - last.wifi_rssi) > RSSI_CHANGE_THRESHOLD_DBM) {
        return true;
    }
    
    // Connection status change
    if (current.wifi_connected != last.wifi_connected ||
        current.mqtt_connected != last.mqtt_connected) {
        return true;
    }
    
    // Sensor/Actuator count change
    if (current.sensor_count != last.sensor_count ||
        current.actuator_count != last.actuator_count) {
        return true;
    }
    
    return false;
}
```

3. **JSON-Payload-Generierung:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "heap_free": 150000,
  "heap_min_free": 120000,
  "heap_fragmentation": 15,
  "uptime_seconds": 3600,
  "error_count": 3,
  "wifi_connected": true,
  "wifi_rssi": -65,
  "mqtt_connected": true,
  "sensor_count": 4,
  "actuator_count": 2,
  "system_state": "OPERATIONAL"
}
```

4. **Integration in main.cpp:**
```cpp
// In setup():
healthMonitor.begin();
healthMonitor.setPublishInterval(60000);  // 60 seconds
healthMonitor.setChangeDetectionEnabled(true);

// In loop():
healthMonitor.loop();  // Publishes automatically
```

**Abhängigkeiten:**
- `WiFiManager` - für WiFi-Status
- `MQTTClient` - für MQTT-Status und Publishing
- `SensorManager` - für Sensor-Count
- `ActuatorManager` - für Actuator-Count
- `ErrorTracker` - für Error-Count
- `TopicBuilder` - für Topic-Generierung

**MQTT-Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/diagnostics` (QoS 0)

**Erfolgs-Kriterien:**
- [ ] HealthMonitor initialisiert sich korrekt
- [ ] Health-Snapshot wird alle 60s generiert
- [ ] Change-Detection funktioniert (nur bei Änderungen publishen)
- [ ] JSON-Payload ist korrekt formatiert
- [ ] MQTT-Publishing funktioniert
- [ ] Heap-Fragmentation wird korrekt berechnet

**Geschätzter Aufwand:** ~200 Zeilen Code, 4-6 Stunden

---

### 2. MQTTConnectionManager ⚠️ SKELETON

**Dateien:**
- `src/error_handling/mqtt_connection_manager.h` - **LEER (nur Platzhalter)**
- `src/error_handling/mqtt_connection_manager.cpp` - **FEHLT**

**Status:** ⚠️ Nicht implementiert - **NIEDRIGE PRIORITÄT** (MQTTClient hat bereits Reconnection)

**Hinweis:** MQTTClient hat bereits vollständige Reconnection-Logic mit Exponential Backoff integriert. Ein separater MQTTConnectionManager wäre redundant, es sei denn, es werden zusätzliche Features benötigt (z.B. Connection-Pooling, Multi-Broker-Support).

**Geplante Features (Optional):**
- Dedicated Connection-Management-Layer
- Connection-Health-Monitoring
- Connection-Metrics-Tracking
- Multi-Broker-Failover (optional)

**Empfehlung:** **NICHT IMPLEMENTIEREN** - MQTTClient ist bereits ausreichend. Falls benötigt, können Features direkt in MQTTClient integriert werden.

**Geschätzter Aufwand:** ~150 Zeilen Code, 3-4 Stunden (falls implementiert)

---

### 3. PiCircuitBreaker ⚠️ SKELETON

**Dateien:**
- `src/error_handling/pi_circuit_breaker.h` - **LEER (nur Platzhalter)**
- `src/error_handling/pi_circuit_breaker.cpp` - **FEHLT**

**Status:** ⚠️ Nicht implementiert - **NIEDRIGE PRIORITÄT** (PiEnhancedProcessor verwendet bereits CircuitBreaker)

**Hinweis:** PiEnhancedProcessor verwendet bereits die generische `CircuitBreaker`-Klasse. Ein separater PiCircuitBreaker wäre redundant.

**Geplante Features (Optional):**
- Pi-spezifische Circuit-Breaker-Logik
- Pi-Server-Health-Check
- Pi-Server-Metrics-Tracking

**Empfehlung:** **NICHT IMPLEMENTIEREN** - CircuitBreaker-Klasse ist bereits ausreichend. Falls Pi-spezifische Features benötigt werden, können diese direkt in PiEnhancedProcessor integriert werden.

**Geschätzter Aufwand:** ~100 Zeilen Code, 2-3 Stunden (falls implementiert)

---

## 📋 Implementierungs-Checkliste

### Phase 7 Vervollständigung

#### Hoch-Priorität (Muss implementiert werden)

- [ ] **HealthMonitor implementieren**
  - [ ] Header-Datei erstellen (`health_monitor.h`)
  - [ ] Implementierung erstellen (`health_monitor.cpp`)
  - [ ] Health-Snapshot-Struktur definieren
  - [ ] Heap-Fragmentation-Berechnung implementieren
  - [ ] Change-Detection-Logik implementieren
  - [ ] JSON-Payload-Generierung implementieren
  - [ ] MQTT-Publishing implementieren
  - [ ] Integration in `main.cpp` (setup + loop)
  - [ ] Unit-Tests erstellen
  - [ ] Integration-Tests erstellen

#### Niedrig-Priorität (Optional)

- [ ] **MQTTConnectionManager** - **NICHT EMPFOHLEN** (redundant)
- [ ] **PiCircuitBreaker** - **NICHT EMPFOHLEN** (redundant)

### Integration-Punkte

#### main.cpp Integration

**Setup (nach Phase 2):**
```cpp
// Phase 7: Health Monitor
if (!healthMonitor.begin()) {
    LOG_ERROR("HealthMonitor initialization failed!");
    errorTracker.trackError(ERROR_HEALTH_MONITOR_INIT_FAILED,
                           ERROR_SEVERITY_ERROR,
                           "HealthMonitor begin() failed");
} else {
    LOG_INFO("Health Monitor initialized");
    healthMonitor.setPublishInterval(60000);  // 60 seconds
    healthMonitor.setChangeDetectionEnabled(true);
}
```

**Loop:**
```cpp
// Phase 7: Health Monitoring
healthMonitor.loop();  // Publishes automatically if needed
```

#### TopicBuilder Erweiterung (Optional)

Falls `system/diagnostics` Topic zu TopicBuilder hinzugefügt werden soll:

```cpp
// In topic_builder.h:
static const char* buildSystemDiagnosticsTopic();

// In topic_builder.cpp:
const char* TopicBuilder::buildSystemDiagnosticsTopic() {
    int written = snprintf(topic_buffer_, sizeof(topic_buffer_),
                           "kaiser/%s/esp/%s/system/diagnostics",
                           kaiser_id_, esp_id_);
    return validateTopicBuffer(written);
}
```

**Hinweis:** Aktuell wird das Topic manuell in HealthMonitor gebaut. Optional kann es zu TopicBuilder migriert werden.

---

## 🧪 Tests

### Unit-Tests

**Datei:** `test/test_health_monitor.cpp`

```cpp
#include <unity.h>
#include "error_handling/health_monitor.h"

void test_health_monitor_initialization() {
    HealthMonitor& monitor = HealthMonitor::getInstance();
    TEST_ASSERT_TRUE(monitor.begin());
}

void test_health_snapshot_generation() {
    HealthMonitor& monitor = HealthMonitor::getInstance();
    HealthSnapshot snapshot = monitor.getCurrentSnapshot();
    
    TEST_ASSERT_GREATER_THAN(0, snapshot.heap_free);
    TEST_ASSERT_GREATER_THAN(0, snapshot.uptime_seconds);
    TEST_ASSERT_LESS_OR_EQUAL(100, snapshot.heap_fragmentation_percent);
}

void test_change_detection() {
    HealthMonitor& monitor = HealthMonitor::getInstance();
    monitor.setChangeDetectionEnabled(true);
    
    HealthSnapshot snapshot1 = monitor.getCurrentSnapshot();
    delay(100);
    HealthSnapshot snapshot2 = monitor.getCurrentSnapshot();
    
    // Should detect uptime change
    TEST_ASSERT_NOT_EQUAL(snapshot1.uptime_seconds, snapshot2.uptime_seconds);
}

void setup() {
    UNITY_BEGIN();
    RUN_TEST(test_health_monitor_initialization);
    RUN_TEST(test_health_snapshot_generation);
    RUN_TEST(test_change_detection);
    UNITY_END();
}

void loop() {}
```

### Integration-Tests

**Datei:** `test/test_phase7_integration.cpp`

```cpp
#include <unity.h>
#include "error_handling/health_monitor.h"
#include "services/communication/mqtt_client.h"
#include "services/communication/wifi_manager.h"

void test_health_monitor_mqtt_integration() {
    // Setup WiFi + MQTT
    wifiManager.begin();
    mqttClient.begin();
    
    // Setup Health Monitor
    healthMonitor.begin();
    healthMonitor.setPublishInterval(1000);  // 1 second for testing
    
    // Wait for publish
    delay(2000);
    
    // Verify snapshot was generated
    HealthSnapshot snapshot = healthMonitor.getCurrentSnapshot();
    TEST_ASSERT_GREATER_THAN(0, snapshot.timestamp);
    TEST_ASSERT_TRUE(snapshot.wifi_connected || snapshot.mqtt_connected);
}

void setup() {
    UNITY_BEGIN();
    RUN_TEST(test_health_monitor_mqtt_integration);
    UNITY_END();
}

void loop() {}
```

---

## 📊 Erfolgs-Kriterien Phase 7

### Muss-Kriterien (für Phase 7 Completion)

- [x] ErrorTracker funktioniert ✅
- [x] CircuitBreaker funktioniert ✅
- [x] Zone Assignment funktioniert ✅
- [ ] HealthMonitor funktioniert ⚠️
- [ ] Health-Snapshot wird alle 60s publiziert ⚠️
- [ ] Change-Detection funktioniert ⚠️
- [ ] Alle Module verwenden ErrorTracker ✅

### Optional-Kriterien

- [ ] MQTTConnectionManager implementiert (nicht empfohlen)
- [ ] PiCircuitBreaker implementiert (nicht empfohlen)
- [ ] System-Diagnostics-Topic zu TopicBuilder hinzugefügt (optional)

---

## 🎯 Nächste Schritte

### 1. HealthMonitor implementieren (HOCH-PRIORITÄT)

**Schritte:**
1. Header-Datei erstellen (`src/error_handling/health_monitor.h`)
2. Implementierung erstellen (`src/error_handling/health_monitor.cpp`)
3. Integration in `main.cpp` (setup + loop)
4. Unit-Tests erstellen
5. Integration-Tests erstellen
6. Dokumentation aktualisieren

**Geschätzter Aufwand:** 4-6 Stunden

### 2. Optional: TopicBuilder erweitern

Falls `system/diagnostics` Topic zu TopicBuilder hinzugefügt werden soll:
- `buildSystemDiagnosticsTopic()` Methode hinzufügen
- HealthMonitor aktualisieren, um TopicBuilder zu verwenden

**Geschätzter Aufwand:** 30 Minuten

### 3. Code-Review & Testing

- Code-Review durchführen
- Alle Tests ausführen
- Integration-Tests mit echtem MQTT-Broker
- Dokumentation aktualisieren

**Geschätzter Aufwand:** 2-3 Stunden

---

## 📚 Referenzen

### Verwandte Dokumentation

- `docs/system-flows/07-error-recovery-flow.md` - Error Recovery Flow Dokumentation
- `docs/API_REFERENCE.md` - API-Referenz für alle Module
- `docs/NVS_KEYS.md` - NVS-Keys Dokumentation
- `docs/Mqtt_Protocoll.md` - MQTT-Protokoll-Spezifikation

### Verwandte Code-Dateien

- `src/error_handling/error_tracker.h/cpp` - ErrorTracker Implementierung
- `src/error_handling/circuit_breaker.h/cpp` - CircuitBreaker Implementierung
- `src/services/communication/mqtt_client.h/cpp` - MQTTClient (für Publishing)
- `src/services/communication/wifi_manager.h/cpp` - WiFiManager (für Status)
- `src/services/sensor/sensor_manager.h/cpp` - SensorManager (für Sensor-Count)
- `src/services/actuator/actuator_manager.h/cpp` - ActuatorManager (für Actuator-Count)
- `src/utils/topic_builder.h/cpp` - TopicBuilder (für Topic-Generierung)

---

## 📝 Changelog

### Version 1.0 (2025-01-28)
- Initiale Dokumentation erstellt
- Status-Analyse durchgeführt
- Implementierungs-Anforderungen dokumentiert
- HealthMonitor-Spezifikation erstellt

---

**Dokument aktualisiert:** 2025-01-28  
**Nächste Überprüfung:** Nach HealthMonitor-Implementierung

