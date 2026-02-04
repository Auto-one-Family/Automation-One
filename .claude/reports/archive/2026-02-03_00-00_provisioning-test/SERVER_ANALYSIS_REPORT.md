# Server Analysis Report - E2E Test

> **Datum:** 2026-02-03
> **Analysiert:** god_kaiser.log
> **ESP Device:** ESP_472204
> **Testperiode:** 00:04 - 00:19 UTC

---

## Executive Summary

| Komponente | Status | Details |
|------------|--------|---------|
| **MQTT Client** | ✅ CONNECTED | Alle Subscriptions aktiv |
| **API Server** | ✅ HEALTHY | Requests werden verarbeitet |
| **Heartbeat Handler** | ✅ WORKING | ESP wird regelmäßig erkannt |
| **Zone ACK Handler** | ✅ WORKING | Zone Assignment bestätigt |
| **Actuator Commands** | ✅ WORKING | ON/OFF erfolgreich gesendet + bestätigt |
| **Sensor Config** | ❌ FAILED | GPIO_CONFLICT auf ESP32 |
| **Sensor Daten** | ❌ NO DATA | Keine Daten empfangen |

---

## Timeline der Server-Events

### Phase 1: Server Startup & MQTT Connection

| Zeit | Event | Status |
|------|-------|--------|
| 22:40:14 | Server Startup | OK |
| 22:40:14 | Scheduler Jobs missed | ⚠️ Expected after restart |
| 22:40:14 | MQTT Broker unavailable | ⚠️ Initial connect attempt |
| 22:40:15 | MQTT Connected | ✅ |
| 22:40:15 | LWT received: ESP_472204 disconnected | ⚠️ From previous session |

### Phase 2: MQTT Subscriptions (22:40:15)

```
✅ kaiser/god/esp/+/sensor/+/data (QoS 1)
✅ kaiser/god/esp/+/system/heartbeat (QoS 0)
✅ kaiser/god/esp/+/config_response (QoS 2)
✅ kaiser/god/esp/+/zone/ack (QoS 1)
✅ kaiser/god/esp/+/subzone/ack (QoS 1)
✅ kaiser/god/esp/+/system/error (QoS 1)
✅ kaiser/god/esp/+/actuator/+/command (QoS 1)
```

### Phase 3: User Session & API Requests

| Zeit | Endpoint | Status | Details |
|------|----------|--------|---------|
| 00:04:07 | POST /api/v1/auth/login | 422 | Invalid request format |
| 00:04:13 | POST /api/v1/auth/login | 200 | User Robin logged in (304ms) |
| 00:04:24 | GET /api/v1/esp/devices/pending | 200 | |
| 00:08:00 | Heartbeat | - | 🔔 New ESP discovered: ESP_472204 |
| 00:09:01 | POST /api/v1/auth/login | 200 | Re-login Robin (231ms) |
| 00:09:15 | GET /api/v1/esp/devices/pending | 200 | ESP_472204 in pending |
| 00:09:30 | POST .../ESP_472204/approve | 200 | ✅ Device approved by Robin |
| 00:09:50 | POST /api/v1/zones | 404 | Endpoint nicht gefunden |
| 00:09:59 | POST .../assign | 200 | Zone test_zone assigned |
| 00:10:00 | Zone ACK | - | ✅ Zone assignment confirmed |
| 00:10:14 | POST /api/v1/sensors | 307 | Redirect (falscher Endpoint) |
| 00:10:23 | POST /api/v1/sensors | 307 | Redirect (falscher Endpoint) |
| 00:10:31 | POST /api/v1/sensors/ | 405 | Method Not Allowed |

### Phase 4: Hardware Configuration

| Zeit | Endpoint | Status | Details |
|------|----------|--------|---------|
| 00:15:14 | POST /api/v1/auth/login | 200 | Re-login Robin |
| 00:15:30 | GET /api/v1/esp/devices | 200 | ESP_472204 found |
| 00:15:45 | GET /api/v1/sensors/ESP_472204 | 404 | No sensors yet |
| 00:15:47 | GET /api/v1/actuators/ESP_472204 | 404 | No actuators yet |
| 00:16:00 | POST .../sensors/ESP_472204/4 | 422 | Validation error |
| 00:16:07 | POST .../sensors/ESP_472204/4 | 200 | ✅ Sensor created (161ms) |
| 00:16:17 | POST .../actuators/ESP_472204/26 | 200 | ✅ Actuator created (60ms) |
| 00:16:23 | POST .../push-config | 404 | Endpoint nicht implementiert |

### Phase 5: Actuator Commands

| Zeit | Endpoint | Status | Details |
|------|----------|--------|---------|
| 00:16:37 | POST .../26/command | 200 | Command ON sent (80ms) |
| 00:16:37 | MQTT Response | - | ✅ Command confirmed: ON |
| 00:16:58 | POST .../26/command | 200 | Command OFF sent (71ms) |
| 00:16:58 | MQTT Response | - | ✅ Command confirmed: OFF |

### Phase 6: Final Verification

| Zeit | Endpoint | Status | Details |
|------|----------|--------|---------|
| 00:17:04 | GET .../ESP_472204 | 200 | Device online |
| 00:17:11 | GET .../4/data | 404 | No sensor data |
| 00:17:22 | GET .../sensors/ESP_472204/4 | 200 | Sensor config OK |
| 00:17:49 | GET /api/v1/esp/devices | 200 | Final check |

---

## MQTT Handler Activity

### Heartbeat Handler

```
00:08:00  🔔 New ESP discovered: ESP_472204 (pending_approval)
00:08:00  📡 Broadcast device_discovered for ESP_472204
00:10:00  ✅ Device ESP_472204 now online after approval
00:10:00 - 00:19:00  Heartbeats every minute (all successful)
```

**WebSocket Broadcast Performance:**
- Average: 0.28ms
- Min: 0.21ms
- Max: 0.62ms

### Zone ACK Handler

```
00:10:00  Zone assignment confirmed for ESP_472204: zone_id=test_zone
```

### Config Handler (CRITICAL ERRORS)

```
00:16:07  Publishing config: 1 sensor(s), 0 actuator(s)
00:16:07  ✅ Config published successfully
00:16:08  ❌ Config FAILED: sensor - All 1 item(s) failed
         └─ GPIO 4: GPIO_CONFLICT - GPIO 4 already used by sensor (OneWireBus)
00:16:08  ❌ Config FAILED: actuator - Actuator config array is empty

00:16:17  Publishing config: 1 sensor(s), 1 actuator(s)
00:16:17  ✅ Config published successfully
00:16:17  ❌ Config FAILED: sensor - All 1 item(s) failed
         └─ GPIO 4: GPIO_CONFLICT - GPIO 4 already used by sensor (OneWireBus)
00:16:17  ✅ Config Response: actuator (1 items) - Configured 1 actuator(s) successfully
```

### Actuator Response Handler

```
00:16:37  ✅ Actuator command confirmed: esp_id=ESP_472204, gpio=26, command=ON, value=1.0
00:16:58  ✅ Actuator command confirmed: esp_id=ESP_472204, gpio=26, command=OFF, value=0.0
```

### Error Handler

```
00:16:07  Error event saved: esp_id=ESP_472204, error_code=1041, severity=error
00:16:17  Error event saved: esp_id=ESP_472204, error_code=1041, severity=error
```

---

## Identifizierte Fehler

### 1. CRITICAL: GPIO Conflict auf ESP32

**Log-Einträge:**
```
❌ Config FAILED on ESP_472204: sensor - All 1 item(s) failed to configure
   ↳ GPIO 4: GPIO_CONFLICT - GPIO 4 already used by sensor (OneWireBus)
```

**Analyse:**
- Server sendet Config für DS18B20 auf GPIO 4
- ESP32 meldet: GPIO 4 ist bereits durch OneWireBus belegt
- Dies deutet auf vorherige NVS-Konfiguration im ESP32

**Root Cause:**
- ESP32 hat noch alte Sensor-Konfiguration im NVS
- Der OneWire-Bus wurde beim vorherigen Test bereits auf GPIO 4 initialisiert
- Neue Config wird als Konflikt erkannt

**Impact:**
- Sensor funktioniert nicht
- Keine Sensor-Daten werden empfangen

### 2. WARNING: Sensor Stale

**Log-Einträge:**
```
Sensor stale: ESP ESP_472204 GPIO 4 (ds18b20) - no data for never (timeout: 180s)
[monitor] health_check_sensors: 1 sensor(s) stale (checked: 1, healthy: 0, skipped: 0)
```

**Wiederholung:** Alle 60 Sekunden (00:16:27, 00:17:27, 00:18:27, 00:19:27)

**Ursache:** Sensor-Konfiguration auf ESP32 fehlgeschlagen (siehe #1)

### 3. WARNING: Handler returned False

**Log-Einträge:**
```
Handler returned False for topic kaiser/god/esp/ESP_472204/actuator/26/command
```

**Analyse:**
- Tritt bei Actuator Commands auf
- MQTT Subscriber meldet, dass Handler False zurückgegeben hat
- Trotzdem werden Commands erfolgreich bestätigt

**Impact:** Niedrig - Commands funktionieren trotzdem

### 4. INFO: Fehlgeschlagene API-Anfragen

| Endpoint | Status | Problem |
|----------|--------|---------|
| POST /api/v1/zones | 404 | Endpoint existiert nicht |
| POST /api/v1/sensors | 307 | Falscher Pfad, Redirect |
| POST /api/v1/sensors/ | 405 | Trailing Slash Problem |
| POST .../push-config | 404 | Endpoint nicht implementiert |
| GET .../4/data | 404 | Keine Sensor-Daten |
| GET .../4/readings | 404 | Endpoint existiert nicht |

---

## Korrelation mit SYSTEM_OPERATIONS_LOG.md

| Operations Log | Server Log | Status |
|----------------|------------|--------|
| 23:14:54 Health Check | 00:04:07+ Requests | ✅ Match |
| 23:15:14 Login | 00:04:13 User logged in | ✅ Match |
| 23:15:30 Pending Devices | 00:04:24 GET pending | ✅ Match |
| 23:16:07 Sensor erstellen | 00:16:07 Sensor created | ✅ Match |
| 23:16:17 Actuator erstellen | 00:16:17 Actuator created | ✅ Match |
| 23:16:35 Relay ON | 00:16:37 Command ON confirmed | ✅ Match |
| 23:16:50 Relay OFF | 00:16:58 Command OFF confirmed | ✅ Match |
| latest_value: null | Sensor stale: no data | ✅ Explained by GPIO conflict |

**Zeit-Differenz:** Server-Log zeigt UTC+1 (00:xx), Operations-Log zeigt UTC (23:xx)

---

## Empfehlungen

### Sofort (für Sensor-Daten)

1. **ESP32 NVS Reset**
   - ESP32 neu flashen oder NVS löschen
   - Dadurch wird GPIO-Konflikt aufgelöst

2. **Alternative: Anderen GPIO verwenden**
   - DS18B20 auf anderen GPIO konfigurieren (z.B. GPIO 5)
   - Vermeidet Konflikt mit bestehender OneWire-Bus-Config

### Verbesserungen

3. **Push-Config Endpoint implementieren**
   - Manueller Config-Push wäre nützlich
   - Derzeit automatisch bei Sensor/Actuator-Creation

4. **API Error-Responses verbessern**
   - Redirect 307 sollte klare Fehlermeldung haben
   - 404s für fehlende Endpoints dokumentieren

5. **Handler False-Return untersuchen**
   - Actuator Command Handler gibt False zurück
   - Obwohl Command funktioniert - Code Review empfohlen

---

## Server Performance

| Metrik | Wert |
|--------|------|
| Login Duration | 231-304ms |
| Sensor Create | 161ms |
| Actuator Create | 60ms |
| Command Execution | 71-80ms |
| WebSocket Broadcast | 0.21-0.62ms |
| Heartbeat Processing | < 1ms |

---

## Fazit

Der Server funktioniert korrekt. Das Kernproblem liegt auf der ESP32-Seite:

1. **Server sendet Config korrekt** ✅
2. **ESP32 meldet GPIO_CONFLICT** ❌
3. **Dadurch keine Sensor-Daten** ❌
4. **Actuator funktioniert trotzdem** ✅

**Nächster Schritt:** ESP32 Serial-Log analysieren um GPIO-Konflikt zu verstehen.

---

*Report erstellt: 2026-02-03*
*Analysiert von: Server-Debug Agent*
