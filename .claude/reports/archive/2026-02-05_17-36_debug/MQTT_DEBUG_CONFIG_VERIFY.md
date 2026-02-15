# MQTT Debug Report: Config Verification ESP_472204

**Agent:** mqtt-debug
**Timestamp:** 2026-02-05T19:19:00+01:00
**Target:** ESP_472204
**Ziel:** Verifizieren ob Config-Messages und Sensor-Daten fließen

---

## 1. Executive Summary

| Aspekt | Status | Details |
|--------|--------|---------|
| Broker-Verbindung | OK | ESP connected, Server connected |
| Config-Push (Server→ESP) | FEHLT | Kein `/config` Topic empfangen |
| Config-Response (ESP→Server) | ERROR | "Actuator config array is empty" |
| Sensor-Daten | FEHLT | sensor_count: 0, keine Daten |
| Heartbeat-Flow | OK | ACK empfangen, aber config_available: false |

**ROOT CAUSE:** Server meldet `config_available: false` obwohl angeblich Sensor-Config angelegt wurde. ESP wartet vergeblich auf Config-Push.

---

## 2. Broker-Logs Analyse (letzte 15 Minuten)

### Beobachtung
```
Nur healthcheck-Clients sichtbar (alle 30s Docker health checks)
KEINE neuen ESP32 oder Server-Verbindungen in diesem Zeitraum
```

### Interpretation
- ESP32 und Server sind bereits LÄNGER verbunden (stabile Verbindung)
- Keine Reconnects oder Connection-Drops im Beobachtungszeitraum
- Broker funktioniert korrekt

---

## 3. Live MQTT-Traffic Erfassung

### Empfangene Messages (chronologisch)

| # | Topic | Payload (gekürzt) | Bewertung |
|---|-------|-------------------|-----------|
| 1 | `.../system/will` | `{"status":"offline","reason":"unexpected_disconnect","timestamp":1770312963}` | RETAINED - alter Disconnect |
| 2 | `.../system/command/response` | `{"command":"onewire/scan","status":"ok","found_count":0,"pin":4}` | OneWire Scan OK |
| 3 | `.../config_response` | `{"status":"error","type":"actuator","message":"Actuator config array is empty"}` | **FEHLER** |
| 4 | `.../onewire/scan_result` | `{"devices":[],"found_count":0}` | Keine 1W-Devices |
| 5 | `.../system/heartbeat` | `{"sensor_count":0,"actuator_count":0,"zone_assigned":false,...}` | **KRITISCH** |
| 6 | `.../system/heartbeat/ack` | `{"status":"online","config_available":false,...}` | **KRITISCH** |

### Detaillierte Heartbeat-Analyse

```json
{
  "esp_id": "ESP_472204",
  "zone_id": "",
  "zone_assigned": false,
  "ts": 1770315562,
  "uptime": 1804,
  "heap_free": 209832,
  "wifi_rssi": -54,
  "sensor_count": 0,          // <-- PROBLEM: Kein Sensor
  "actuator_count": 0,        // <-- Kein Actuator
  "gpio_status": [
    {"gpio":4,"owner":"bus/onewire/4","component":"OneWireBus"},
    {"gpio":21,"owner":"system","component":"I2C_SDA"},
    {"gpio":22,"owner":"system","component":"I2C_SCL"}
  ],
  "config_status": {
    "wifi_configured": true,
    "zone_assigned": false,
    "system_configured": true,
    "subzone_count": 0,
    "state": 8
  }
}
```

### Heartbeat-ACK vom Server

```json
{
  "status": "online",
  "config_available": false,   // <-- Server sagt: KEINE Config verfügbar!
  "server_time": 1770315562
}
```

---

## 4. Erwartete Topics - Prüfung

| Topic | Erwartet | Empfangen | Status |
|-------|----------|-----------|--------|
| `kaiser/god/esp/ESP_472204/config` | Config-Push vom Server | NICHT EMPFANGEN | FEHLT |
| `kaiser/god/esp/ESP_472204/config_response` | Config-ACK vom ESP | Empfangen (ERROR) | FEHLER |
| `kaiser/god/esp/ESP_472204/sensor/0/data` | Sensor-Messwerte | NICHT EMPFANGEN | FEHLT |
| `kaiser/god/esp/ESP_472204/system/heartbeat` | Heartbeat alle 60s | Empfangen | OK |
| `kaiser/god/esp/ESP_472204/system/heartbeat/ack` | Server-ACK | Empfangen | OK* |

*) Heartbeat-ACK OK aber mit `config_available: false`

---

## 5. ESP32 Device-Monitor Log Analyse

### Boot-Sequenz (18:36:01 - 18:36:04)
```
✅ WiFi connected: 192.168.0.148 (RSSI: -52 dBm)
✅ NTP sync: 1770312963
✅ MQTT connected: 192.168.0.194:1883
✅ Subscribed to: kaiser/god/esp/ESP_472204/config
✅ Phase 1-5 Complete
```

### Kritische Logzeilen
```
[      3911] [INFO    ] ConfigManager: Found 0 sensor(s) in NVS
[      3911] [INFO    ] Loaded 0 sensor configs from NVS
[     60082] [WARNING ] Registration timeout - opening gate (fallback)
```

### Interpretation
1. ESP hat 0 Sensoren im NVS
2. ESP wartet 60s auf Config-Push
3. Nach 60s Timeout: "opening gate (fallback)" - ESP gibt auf zu warten
4. ESP sendet weiterhin Heartbeats, bekommt ACKs, aber keine Config

---

## 6. Config-Response Fehler-Analyse

### Empfangene Error-Message
```json
{
  "status": "error",
  "type": "actuator",
  "count": 0,
  "message": "Actuator config array is empty",
  "error_code": "MISSING_FIELD"
}
```

### Interpretation
- Der ESP hat irgendwann einen Config-Push erhalten
- Die Actuator-Config im Push war LEER
- Dies ist eine historische (RETAINED?) Message
- Aktuell kommt KEIN neuer Config-Push

---

## 7. Timing-Gap Analyse

| Zeit | Event | Gap |
|------|-------|-----|
| 18:12:29 | MQTT connected (Boot 3) | - |
| 18:13:26 | Registration timeout (60s) | +57s |
| 18:35:52 | MQTT Reconnect-Versuche (Disconnect!) | +22min |
| 18:36:01 | Neuer Boot (Boot 4) | +9s |
| 18:37:01 | Registration timeout | +60s |
| 18:47:04 | Heartbeat-ACK empfangen | +10min |
| 18:49:17 | Neuer Boot (Boot 5) | +2min |

### Muster erkannt
- ESP bootet mehrfach (Power-Cycle oder Watchdog?)
- Zwischen Boots: keine Config empfangen
- Nach jedem Boot: 60s Timeout, dann "fallback"

---

## 8. Root Cause Summary

### Primäres Problem
**Server meldet `config_available: false` im Heartbeat-ACK**

### Warum?
1. Server hat zwar Sensor-Eintrag in DB (lt. vorherigem Report)
2. Aber der Heartbeat-Handler prüft `config_available` und gibt `false` zurück
3. Mögliche Ursachen:
   - Sensor ist nicht dem ESP zugewiesen
   - Sensor fehlt in der `device_sensors` Tabelle (nur in `sensors`?)
   - Config-Builder findet keine pending Configs

### Sekundäres Problem
- ESP subscribed zu `/config` Topic
- Aber Server published NICHT auf dieses Topic
- Config-Push-Mechanismus wird nicht getriggert

---

## 9. Empfehlungen für TM

### Sofort prüfen (Server-Debug Agent):
1. **Heartbeat-Handler Log:** Warum gibt `check_config_available()` `false` zurück?
2. **device_sensors Tabelle:** Ist der Sensor (gpio:0, i2c:68) dem ESP_472204 zugewiesen?
3. **Config-Push-Trigger:** Wann sollte ein Config-Push ausgelöst werden?

### Hypothese für Server-Debug:
```
Der Sensor wurde in der `sensors` Tabelle angelegt,
aber NICHT in der `device_sensors` Join-Tabelle mit dem ESP verknüpft.
Daher meldet der Server: "Keine Config für dieses Device verfügbar."
```

### Zu prüfender SQL:
```sql
SELECT ds.*, s.*
FROM device_sensors ds
JOIN sensors s ON ds.sensor_id = s.id
WHERE ds.esp_id = 'ESP_472204';
```

---

## 10. MQTT-Protokoll Compliance

| Aspekt | Status | Bemerkung |
|--------|--------|-----------|
| Topic-Schema | OK | `kaiser/god/esp/{esp_id}/...` |
| Heartbeat-Interval | OK | ~60s |
| Will-Message | OK | Korrekt konfiguriert |
| Config-Subscribe | OK | ESP subscribed zu `/config` |
| Config-Publish | FEHLT | Server published nicht |

---

**Report Ende**

*Nächster Schritt: Server-Debug zur Analyse des Config-Push-Mechanismus*
