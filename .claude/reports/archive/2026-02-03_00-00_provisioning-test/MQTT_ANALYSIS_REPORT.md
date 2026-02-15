# MQTT Traffic Analysis Report

> **Session:** 2026-02-03_00-00_provisioning-test
> **Analysiert:** 2026-02-03
> **Device:** ESP_472204
> **Kaiser:** god

---

## Executive Summary

| Kategorie | Status | Details |
|-----------|--------|---------|
| **Heartbeat Flow** | **OK** | 60s Intervall, ACKs werden empfangen |
| **Zone Assignment** | **OK** | Zone `test_zone` erfolgreich zugewiesen |
| **Sensor Config** | **FEHLER** | OneWire ROM-Code fehlt, GPIO-Konflikt |
| **Actuator Config** | **OK** | Relay auf GPIO 26 konfiguriert |
| **Actuator Commands** | **OK** | ON/OFF Befehle werden ausgeführt |
| **Timing** | **OK** | <1s Latenz bei Commands |

---

## 1. Message Flow Diagram (Chronologisch)

```
Timeline: Provisioning → Online → Config → Operation
═══════════════════════════════════════════════════════════════════════════

[00:00] ESP32 Boot + Provisioning (AP-Mode)
        ↓
[01:52] Provisioning abgeschlossen, Reboot
        ↓
[~02:00] WiFi + MQTT Connected
        ↓
[T+0s]  ESP → Server: system/will (vorheriger Disconnect)
        │   {"status":"offline","reason":"unexpected_disconnect"}
        ↓
[T+5s]  ESP → Server: system/heartbeat (zone_assigned: false)
        │   {"esp_id":"ESP_472204","uptime":5,"heap_free":210840,"sensor_count":0}
        │
        Server → ESP: system/heartbeat/ack
        │   {"status":"pending_approval","config_available":false}
        ↓
[T+60s] ESP → Server: system/diagnostics
        │   {"system_state":"PENDING_APPROVAL","error_count":0}
        ↓
[T+65s] ESP → Server: system/heartbeat (GPIO 4 now reserved)
        │   {"gpio_status":[{"gpio":4,"owner":"sensor","component":"OneWireBus"}]}
        │
        Server → ESP: system/heartbeat/ack
        │   {"status":"pending_approval"}
        ↓
[T+119s] Server → ESP: zone/assign
        │   {"zone_id":"test_zone","zone_name":"Test Zone","kaiser_id":"god"}
        │
        ESP → Server: zone/ack
        │   {"status":"zone_assigned","zone_id":"test_zone"}
        │
        ESP → Server: system/heartbeat (zone_assigned: true)
        │   {"zone_id":"test_zone","config_status":{"state":6}}
        │
        Server → ESP: system/heartbeat/ack
        │   {"status":"online","config_available":false}
        ↓
[T+180s] ESP → Server: system/diagnostics
        │   {"system_state":"ZONE_CONFIGURED","actuator_count":0}
        ↓
[T+487s] Server → ESP: config (Sensor + Actuator empty)
        │   {"sensors":[{ds18b20,gpio:4}],"actuators":[]}
        │
        ESP → Server: system/error
        │   {"error_code":1041,"message":"Invalid OneWire ROM-Code length"}
        │
        ESP → Server: config_response (Sensor ERROR)
        │   {"status":"error","failures":[{"gpio":4,"error":"GPIO_CONFLICT"}]}
        │
        ESP → Server: config_response (Actuator ERROR)
        │   {"status":"error","message":"Actuator config array is empty"}
        ↓
[T+497s] Server → ESP: config (Sensor + Actuator Relay)
        │   {"sensors":[{ds18b20,gpio:4}],"actuators":[{relay,gpio:26}]}
        │
        ESP → Server: system/error
        │   {"error_code":1041,"message":"Invalid OneWire ROM-Code length"}
        │
        ESP → Server: config_response (Sensor ERROR)
        │   {"status":"error","failures":[{"gpio":4,"error":"GPIO_CONFLICT"}]}
        │
        ESP → Server: actuator/26/status
        │   {"state":false,"pwm":0,"emergency":"normal"}
        │
        ESP → Server: config_response (Actuator SUCCESS)
        │   {"status":"success","count":1}
        ↓
[T+517s] Server → ESP: actuator/26/command (ON)
        │   {"command":"ON","value":1.0}
        │
        ESP → Server: actuator/26/status
        │   {"state":true,"pwm":255}
        │
        ESP → Server: actuator/26/response
        │   {"success":true,"message":"Command executed"}
        ↓
[T+538s] Server → ESP: actuator/26/command (OFF)
        │   {"command":"OFF","value":0.0}
        │
        ESP → Server: actuator/26/status
        │   {"state":false,"pwm":0,"runtime_ms":20893}
        │
        ESP → Server: actuator/26/response
        │   {"success":true,"message":"Command executed"}
        ↓
[T+540+] Regelmäßige Heartbeats (60s) + Actuator Status (30s)
         Alle ACKs: {"status":"online"}
```

---

## 2. Topic/Payload Übersicht

### 2.1 ESP → Server Topics

| Topic Pattern | Count | Status | Payload Validierung |
|---------------|-------|--------|---------------------|
| `system/heartbeat` | 13 | OK | Alle Pflichtfelder vorhanden |
| `system/diagnostics` | 3 | OK | Korrekte System-States |
| `system/error` | 2 | INFO | Error 1041 (OneWire ROM-Code) |
| `zone/ack` | 1 | OK | Zone erfolgreich bestätigt |
| `config_response` | 4 | MIXED | 2x Error (Sensor), 1x Error (Actuator empty), 1x Success |
| `actuator/26/status` | 14 | OK | Regelmäßige Status-Updates |
| `actuator/26/response` | 2 | OK | Command-Bestätigungen |

### 2.2 Server → ESP Topics

| Topic Pattern | Count | Status | Payload Validierung |
|---------------|-------|--------|---------------------|
| `system/heartbeat/ack` | 12 | OK | Status-Transitions korrekt |
| `zone/assign` | 1 | OK | Zone-Details vollständig |
| `config` | 2 | FEHLER | ROM-Code fehlt für DS18B20 |
| `actuator/26/command` | 2 | OK | ON/OFF mit correlation_id |

### 2.3 Payload-Struktur Validierung

#### Heartbeat (ESP → Server) - VALID
```json
{
  "esp_id": "ESP_472204",           // OK: ESP ID
  "zone_id": "test_zone",           // OK: Nach Zone Assignment
  "zone_assigned": true,            // OK: Boolean
  "ts": 1770073680,                 // OK: Unix Timestamp
  "uptime": 125,                    // OK: Sekunden
  "heap_free": 206636,              // OK: Bytes
  "wifi_rssi": -58,                 // OK: dBm
  "sensor_count": 0,                // OK: Integer
  "actuator_count": 1,              // OK: Integer
  "gpio_status": [...],             // OK: Array
  "config_status": {                // OK: Nested Object
    "wifi_configured": true,
    "zone_assigned": true,
    "state": 6                      // ZONE_CONFIGURED
  }
}
```

#### Config (Server → ESP) - FEHLER
```json
{
  "sensors": [{
    "gpio": 4,
    "sensor_type": "ds18b20",
    "sensor_name": "Test Temperatur DS18B20",
    // FEHLER: "rom_code" fehlt! DS18B20 benötigt 16-stelligen ROM-Code
    "sample_interval_ms": 30000,
    "raw_mode": true
  }],
  "actuators": [{
    "gpio": 26,
    "actuator_type": "relay",
    "actuator_name": "Test Relay"
    // OK: Relay-Config vollständig
  }]
}
```

---

## 3. Timing-Analyse

### 3.1 Heartbeat-Intervall

| Heartbeat # | Timestamp | Delta | Status |
|-------------|-----------|-------|--------|
| 1 | T+5s | - | Initial (pending_approval) |
| 2 | T+65s | 60s | OK |
| 3 | T+125s | 60s | OK (nach Zone) |
| 4 | T+185s | 60s | OK |
| 5-13 | +60s each | 60s | OK |

**Ergebnis:** Heartbeat-Intervall = 60s (wie erwartet)

### 3.2 Zone Assignment Latenz

| Event | Zeit | Delta |
|-------|------|-------|
| ESP discovered (pending_approval) | T+5s | - |
| Zone assign gesendet | T+119s | +114s |
| Zone ACK empfangen | T+120s | <1s |

**Ergebnis:** Server hat ~2 Minuten gewartet (manuelle Aktion via Frontend/API)

### 3.3 Command → Response Latenz

| Command | Gesendet | Response | Latenz |
|---------|----------|----------|--------|
| ON | T+517s | T+517s | <1s |
| OFF | T+538s | T+538s | <1s |

**Ergebnis:** Command-Latenz < 1 Sekunde (exzellent)

### 3.4 Config Push → Response

| Event | Zeit | Delta |
|-------|------|-------|
| Config #1 gesendet | T+487s | - |
| Error Response | T+487s | <1s |
| Config #2 gesendet | T+497s | +10s (Retry) |
| Actuator Success | T+497s | <1s |

---

## 4. Identifizierte Probleme

### 4.1 KRITISCH: OneWire Sensor-Konfiguration

**Error-Code:** 1041 (HARDWARE)
**Message:** "Invalid OneWire ROM-Code length"

**Root Cause:**
```
Server sendet DS18B20-Config OHNE rom_code Field:
  {"gpio": 4, "sensor_type": "ds18b20", ...}  // rom_code fehlt!

ESP32 erwartet:
  {"gpio": 4, "sensor_type": "ds18b20", "rom_code": "28FF1234567890AB", ...}
```

**Doppelter Fehler:**
1. ROM-Code fehlt im Config-Payload
2. GPIO 4 war bereits durch OneWireBus reserviert (aus Phase 3 Boot)

**Betroffene Dateien:**
- Server: `config_builder.py` (ROM-Code nicht inkludiert)
- Frontend: Sensor-Creation UI (ROM-Code Input fehlt?)
- ESP32: `sensor_manager.cpp:493` (Validierung schlägt fehl)

### 4.2 WARNUNG: Leeres Actuator-Array

**Situation:** Erste Config-Push hatte leeres Actuator-Array
```json
{"sensors": [...], "actuators": []}
```

**ESP32 Response:**
```json
{"status":"error","type":"actuator","message":"Actuator config array is empty"}
```

**Bewertung:** Nicht kritisch, da zweiter Config-Push erfolgreich war.

### 4.3 INFO: Will-Message vom vorherigen Disconnect

**Message:**
```json
{"status":"offline","reason":"unexpected_disconnect","timestamp":1770061840}
```

**Analyse:** Zeitstempel liegt ~12000s (3.3h) vor dem aktuellen Boot.
Dies ist eine retained Last-Will-Message vom vorherigen Session-Ende.

**Bewertung:** Normal behavior, kein Problem.

---

## 5. Korrelation mit Operations-Log

### ESP32 Serial Log Korrelation

| MQTT Event | ESP32 Serial Log | Match |
|------------|------------------|-------|
| Heartbeat #1 | `[5822] Initial heartbeat sent` | OK |
| Zone assign | `[125203] ZONE ASSIGNMENT RECEIVED` | OK |
| Zone ACK | `[125304] Zone assignment successful` | OK |
| Config #1 | `[493091] Invalid OneWire ROM-Code length` | OK |
| Config #2 | `[502553] Actuator configured on GPIO 26` | OK |
| Command ON | `[522869] PumpActuator GPIO 26 ON` | OK |
| Command OFF | `[543763] PumpActuator GPIO 26 OFF` | OK |

**Ergebnis:** 100% Korrelation zwischen MQTT-Traffic und ESP32-Logs.

---

## 6. Empfehlungen

### Sofort-Aktionen

1. **ROM-Code in Sensor-Config einbinden**
   - Server muss `rom_code` Field für DS18B20 senden
   - Prüfen: Ist ROM-Code in DB gespeichert?
   - Falls nicht: OneWire-Scan vor Sensor-Erstellung erforderlich

2. **GPIO-Konflikt-Prüfung verbessern**
   - Server sollte vor Config-Push prüfen, ob GPIO bereits reserviert
   - Alternative: ESP32 OneWireBus erst bei Sensor-Config initialisieren

### Langfristig

3. **OneWire Discovery Flow implementieren**
   - ESP32 scannt OneWire-Bus
   - Sendet gefundene ROM-Codes an Server
   - Frontend zeigt verfügbare Sensoren zur Auswahl

---

## 7. Metriken-Zusammenfassung

| Metrik | Wert | Bewertung |
|--------|------|-----------|
| Total Messages | 58 | - |
| ESP → Server | 37 | - |
| Server → ESP | 21 | - |
| Success Rate (Heartbeat) | 100% | Excellent |
| Success Rate (Zone) | 100% | Excellent |
| Success Rate (Sensor Config) | 0% | KRITISCH |
| Success Rate (Actuator Config) | 50% | OK (2. Versuch) |
| Success Rate (Commands) | 100% | Excellent |
| Avg Heartbeat Interval | 60.0s | Nominal |
| Avg Command Latency | <1s | Excellent |

---

## Anhang: Topic-Struktur Reference

```
kaiser/god/esp/ESP_472204/
├── system/
│   ├── heartbeat          # ESP → Server (60s)
│   ├── heartbeat/ack      # Server → ESP
│   ├── diagnostics        # ESP → Server (60s)
│   ├── error              # ESP → Server (on error)
│   └── will               # ESP → Server (LWT)
├── zone/
│   ├── assign             # Server → ESP
│   └── ack                # ESP → Server
├── config                 # Server → ESP
├── config_response        # ESP → Server
└── actuator/
    └── 26/
        ├── command        # Server → ESP
        ├── status         # ESP → Server (30s)
        └── response       # ESP → Server
```

---

*Report generiert: 2026-02-03*
*Session: 2026-02-03_00-00_provisioning-test*
*Analysiert von: mqtt-debug Agent*
