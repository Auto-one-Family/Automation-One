# MQTT Debug Report: Communication Analysis

**Session:** 2026-02-05
**Agent:** mqtt-debug
**Status:** Analyse abgeschlossen

---

## 1. MQTT-Topic-Übersicht

### Topic-Hierarchie

```
kaiser/god/esp/{esp_id}/
├── system/
│   ├── heartbeat          # ESP → Server (QoS 0)
│   ├── heartbeat/ack      # Server → ESP (QoS 0)
│   ├── will               # Broker → Server (LWT, QoS 1)
│   └── command            # Server → ESP
├── sensor/{gpio}/
│   ├── data               # ESP → Server (QoS 1)
│   └── command            # Server → ESP
├── actuator/{gpio}/
│   ├── command            # Server → ESP (QoS 2)
│   ├── response           # ESP → Server (QoS 1)
│   └── status             # ESP → Server (QoS 1)
├── config                 # Server → ESP (QoS 2)
├── config_response        # ESP → Server (QoS 2)
└── zone/
    ├── assign             # Server → ESP
    └── ack                # ESP → Server
```

### Publish/Subscribe Zuordnung

| Component | Publishes | Subscribes |
|-----------|-----------|------------|
| **ESP32** | heartbeat, sensor/data, actuator/*, config_response | heartbeat/ack, config, zone/assign |
| **Server** | heartbeat/ack, config, zone/assign, actuator/command | heartbeat, sensor/data, config_response |

---

## 2. Heartbeat-Analyse: Warum sensor_count=0?

### ESP32-Seite

**Datei:** `El Trabajante/src/services/communication/mqtt_client.cpp:685`
```cpp
payload += "\"sensor_count\":" + String(sensorManager.getActiveSensorCount()) + ",";
```

**Datei:** `El Trabajante/src/services/sensor/sensor_manager.cpp:537-551`
```cpp
uint8_t SensorManager::getActiveSensorCount() const {
    if (!initialized_) {
        LOG_DEBUG("getActiveSensorCount: NOT initialized, returning 0");
        return 0;  // ← URSACHE: SensorManager nicht initialisiert
    }
    // ...
}
```

### Root-Cause-Analyse

| # | Mögliche Ursache | Status |
|---|------------------|--------|
| 1 | SensorManager nicht initialisiert | `initialized_ == false` → return 0 |
| 2 | Keine Sensor-Config empfangen | `sensor_count_` bleibt 0 |
| 3 | Sensoren nicht als "active" markiert | `sensors_[i].active == false` |
| 4 | **Timing-Problem** | Heartbeat BEVOR Config empfangen |

**Befund:** sensor_count=0 beim Boot ist **erwartetes Verhalten** - der initiale Heartbeat wird gesendet bevor Config vom Server empfangen wurde.

---

## 3. Config-Flow-Analyse

### Server → MQTT → ESP32

```
1. ESP32 sendet Heartbeat (sensor_count=0)
   └─ Topic: kaiser/god/esp/{esp_id}/system/heartbeat

2. Server empfängt → Device wird registriert

3. Server sendet Heartbeat-ACK
   └─ Topic: kaiser/god/esp/{esp_id}/system/heartbeat/ack
   └─ Payload: {"status":"online", "config_available":false}

4. Admin konfiguriert Sensor via Frontend (MANUELL!)
   └─ esp_service.send_config() aufgerufen

5. Server sendet Config via MQTT
   └─ Topic: kaiser/god/esp/{esp_id}/config
   └─ QoS: 2 (Exactly Once)

6. ESP32 empfängt Config → sensor_count_ erhöht

7. Nächster Heartbeat → sensor_count > 0
```

### Wichtig: Config-Push ist NICHT automatisch!

**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py:972-987`
```python
async def _has_pending_config(self, esp_device: ESPDevice) -> bool:
    # TODO: Implement when config-push tracking is added
    # For now, always return False (ESP32 polls config)
    return False
```

---

## 4. HTTP vs MQTT für Sensor-Data

| Aspekt | MQTT (sensor/data) | HTTP (/sensors/process) |
|--------|-------------------|------------------------|
| **Zweck** | RAW-Daten zum Server | Kalibrierte Werte zurück zum ESP32 |
| **Richtung** | ESP32 → Server (unidirektional) | ESP32 ↔ Server (bidirektional) |
| **Response** | Keine | Processed Value, Unit, Quality |
| **Use-Case** | Dashboard, Storage | Local Display auf ESP32 |

**Befund:** HTTP für Sensor-Processing ist **korrekte Architektur** - MQTT hat keine native Response-Möglichkeit.

---

## 5. Message-Flow-Diagramm

```
┌─────────┐                    ┌─────────┐                    ┌─────────┐
│  ESP32  │                    │  MQTT   │                    │ Server  │
│         │                    │ Broker  │                    │         │
└────┬────┘                    └────┬────┘                    └────┬────┘
     │                              │                              │
     │ ══════════════ BOOT ════════════════════════════════════════│
     │                              │                              │
     │  1. Heartbeat (sensor_count=0)                              │
     │ ─────────────────────────────>─────────────────────────────>│
     │                              │                              │
     │<─────────────────────────────<───── 2. Heartbeat-ACK ──────│
     │                              │                              │
     │ ══════════════ CONFIG (Admin-triggered) ════════════════════│
     │                              │                              │
     │<─────────────────────────────<───── 3. Config ─────────────│
     │                              │                              │
     │  4. Config-Response          │                              │
     │ ─────────────────────────────>─────────────────────────────>│
     │                              │                              │
     │ ══════════════ OPERATIONAL ═════════════════════════════════│
     │                              │                              │
     │  5. Heartbeat (sensor_count=1)                              │
     │ ─────────────────────────────>─────────────────────────────>│
     │                              │                              │
     │  6. Sensor/data (MQTT)       │                              │
     │ ─────────────────────────────>─────────────────────────────>│
     │                              │                              │
     │ ══════════════ SENSOR PROCESSING (HTTP) ════════════════════│
     │                              │                              │
     │  7. HTTP POST /sensors/process  (bypasses MQTT)             │
     │ ────────────────────────────────────────────────────────────>│
     │<────────────────────────────────────────────────────────────│
     │     HTTP Response (processed_value, unit, quality)          │
     │                              │                              │
```

---

## 6. Befunde

### Befund 1: sensor_count=0 bei Boot ist erwartetes Verhalten
**Status:** ✅ Kein Bug - Design

Der erste Heartbeat wird gesendet BEVOR Config empfangen wurde:
1. ESP32 sendet initialen Heartbeat zur Registrierung
2. Server registriert Device als "pending_approval"
3. Admin genehmigt Device
4. Admin konfiguriert Sensoren (Config-Push)
5. Ab dann: sensor_count > 0

### Befund 2: Config wird NICHT automatisch gepusht
**Status:** ⚠️ Architektur-Entscheidung

`_has_pending_config()` gibt immer `false` zurück. Config muss explizit durch Admin-Aktion ausgelöst werden.

### Befund 3: HTTP für Processing ist korrekt
**Status:** ✅ Architektur-Entscheidung

MQTT hat keine native Response-Möglichkeit. HTTP ist für Request-Response Pattern geeignet.

---

## 7. Empfehlungen

### Debugging sensor_count=0

1. **ESP32 Serial-Log prüfen:**
   - Wurde Config empfangen? (`Config Response` im Log)
   - Ist SensorManager initialisiert? (`getActiveSensorCount` Log)

2. **Server-Log prüfen:**
   - Wurde Config gepusht? (`send_config` im Log)
   - Wurde Config-Response empfangen?

3. **Frontend prüfen:**
   - Existiert Sensor-Config für das Device in der Datenbank?

### Nächste Schritte

| Agent | Aufgabe |
|-------|---------|
| `esp32-debug` | Serial-Log analysieren um Config-Empfang zu verifizieren |
| `server-debug` | god_kaiser.log prüfen ob Config gepusht wurde |
| `db-inspector` | Prüfen ob Sensor-Config in DB existiert |

---

*Report erstellt von mqtt-debug Agent*
