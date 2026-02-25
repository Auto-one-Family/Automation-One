# Phase 3: E2E-Verifikation — ESP_472204

**Datum:** 2026-02-25 14:05 UTC
**Branch:** fix/trockentest-bugs
**Kontext:** ESP32 frisch geflasht (Phase 2), DB bereinigt (Phase 1), Code-Fixes verifiziert (Phase 0)

---

## Zusammenfassung

| Schritt | Pruefung | Ergebnis |
|---------|----------|----------|
| 3.1 | ESP in DB | BESTANDEN |
| 3.2 | Alle Devices | BESTANDEN |
| 3.3 | MQTT Heartbeat | BESTANDEN (mit Hinweis) |
| 3.4 | sensor_configs | FEHLGESCHLAGEN - 0 Eintraege |
| 3.5 | MQTT Sensor-Daten | FEHLGESCHLAGEN - Keine Daten |
| 3.6 | Sensor-Daten in DB | FEHLGESCHLAGEN - 0 Rows |
| 3.7 | Heartbeat-Logs | BESTANDEN |
| 3.8 | Server-Logs Fehler | TEILWEISE - 2 Warnings |
| 3.9 | Config-Response | FEHLGESCHLAGEN - Error-Loop |

**Gesamtbewertung:** 3/9 BESTANDEN, 1 TEILWEISE, 5 FEHLGESCHLAGEN
**Root Cause:** Keine Sensoren konfiguriert. ESP hat sensor_count=0. SHT31 muss ueber Frontend/API hinzugefuegt werden.

---

## Detailergebnisse

### 3.1 ESP in DB — BESTANDEN

```
 device_id  | status | hardware_type |  ip_address   | firmware_version |       last_seen        | zone_name
 ESP_472204 | online | ESP32_WROOM   | 192.168.0.148 |                  | 2026-02-25 14:01:02+00 | Echt
```

- **Status:** `online` — korrekt
- **IP:** `192.168.0.148` — im lokalen Netzwerk erreichbar
- **Zone:** `Echt` — korrekt zugewiesen
- **firmware_version:** leer — ESP sendet keine Version im Heartbeat (kein Bug, optionales Feld)
- **last_seen:** aktuell (< 2 Minuten alt)

### 3.2 Alle Devices — BESTANDEN

```
   device_id   | status | hardware_type |  ip_address   | zone_name
 ESP_472204    | online | ESP32_WROOM   | 192.168.0.148 | Echt
 MOCK_0954B2B1 | online | MOCK_ESP32    | 127.0.0.1     |
```

- **2 Devices** wie erwartet (Real + Mock)
- Kein neuer unkontrollierter Mock-Device (Bug 4 nicht aufgetreten)
- MOCK_0954B2B1 hat keine Zone zugewiesen (erwartetes Verhalten)

### 3.3 MQTT Heartbeat — BESTANDEN (mit Hinweis)

Erster Versuch (45s Timeout): Timeout. Zweiter Versuch (65s Timeout): Empfangen.

```json
{
  "esp_id": "ESP_472204",
  "seq": 18,
  "zone_id": "echt",
  "master_zone_id": "",
  "zone_assigned": true,
  "ts": 1772028302,
  "uptime": 1026,
  "heap_free": 201312,
  "wifi_rssi": -48,
  "sensor_count": 0,
  "actuator_count": 0,
  "wifi_ip": "192.168.0.148",
  "gpio_status": [
    {"gpio": 4, "owner": "bus/onewire/4", "component": "OneWireBus", "mode": 2, "safe": false},
    {"gpio": 21, "owner": "system", "component": "I2C_SDA", "mode": 2, "safe": false},
    {"gpio": 22, "owner": "system", "component": "I2C_SCL", "mode": 2, "safe": false}
  ],
  "gpio_reserved_count": 3,
  "config_status": {
    "wifi_configured": true,
    "zone_assigned": true,
    "system_configured": true,
    "subzone_count": 0,
    "boot_count": 1,
    "state": 0
  }
}
```

**Hinweis:** Heartbeat-Intervall ist ~60s. Der erste 45s-Timeout war zu knapp.

**Bewertung:**
- `sensor_count: 0` — KEINE Sensoren konfiguriert auf dem ESP
- `actuator_count: 0` — Keine Aktoren
- `heap_free: 201312` (~197 KB) — gesund
- `wifi_rssi: -48` — gute Signalstaerke
- `zone_assigned: true` — korrekt
- GPIO 4 (OneWire), 21 (I2C_SDA), 22 (I2C_SCL) reserviert — Hardware-Busse bereit

### 3.4 sensor_configs — FEHLGESCHLAGEN

```
(0 rows)
```

**Keine Sensor-Konfigurationen vorhanden.** Der ESP hat keine Sensoren registriert.
Der SHT31 muss ueber das Frontend oder die REST API konfiguriert werden.

### 3.5 MQTT Sensor-Daten — FEHLGESCHLAGEN

65s Timeout auf `kaiser/god/esp/ESP_472204/sensor/+/data` — keine Messages.

**Ursache:** Ohne sensor_config sendet der ESP keine Sensor-Daten. Erwartetes Verhalten.

### 3.6 Sensor-Daten in DB — FEHLGESCHLAGEN

```
(0 rows)
```

**Keine Sensor-Daten in der Datenbank.** Konsistent mit Schritt 3.4/3.5.

### 3.7 Heartbeat-Logs — BESTANDEN

```
 device_id  | heartbeats | last_hb                      | max_heap | min_rssi | max_uptime | sensor_count
 ESP_472204 |         16 | 2026-02-25 14:03:00.07604+00 |   202488 |      -51 |        906 |            0
```

**Letzte 5 Heartbeats (Detail):**

| Timestamp | heap_free | wifi_rssi | uptime | sensor_count | health_status | data_source |
|-----------|-----------|-----------|--------|--------------|---------------|-------------|
| 14:03:00 | 201312 | -48 | 906 | 0 | healthy | production |
| 14:02:02 | 201312 | -48 | 846 | 0 | healthy | production |
| 14:01:01 | 201312 | -48 | 786 | 0 | healthy | production |
| 14:00:01 | 199708 | -49 | 726 | 0 | healthy | production |
| 13:59:00 | 201512 | -50 | 666 | 0 | healthy | production |

**Bewertung:**
- 16 Heartbeats seit Boot (~16 Minuten Laufzeit, Intervall ~60s) — stabil
- Heap stabil bei ~200 KB — kein Memory-Leak
- RSSI stabil bei -48 bis -51 — gute WiFi-Verbindung
- `data_source: production` — echte Hardware, kein Mock
- `sensor_count: 0` durchgehend — bestaetigt fehlende Sensor-Config

### 3.8 Server-Logs — TEILWEISE (2 Warnings)

**Warning 1: GPIO Validation Fehler (wiederholt bei jedem Heartbeat)**
```
GPIO status item 0 validation failed for ESP_472204:
1 validation error for GpioStatusItem
  String should match pattern '^(sensor|actuator|system)$'
  [input_value='bus/onewire/4', input_type=str]
```

**Root Cause:** Der ESP sendet `owner: "bus/onewire/4"` fuer GPIO 4, aber das Pydantic-Schema `GpioStatusItem` akzeptiert nur `sensor`, `actuator`, oder `system`.

**Impact:** Warning-Level, nicht ERROR. Heartbeat wird trotzdem verarbeitet. Aber die GPIO-Status-Information fuer OneWire-Pins geht verloren.

**Fix noetig:** Das `GpioStatusItem.owner` Pattern muss erweitert werden um `bus/*` Eintraege zu akzeptieren: `^(sensor|actuator|system|bus/.+)$`

**Warning 2: GPIO Count Mismatch**
```
GPIO count mismatch for ESP_472204: reported=3, actual=2
```

**Root Cause:** ESP meldet 3 reservierte GPIOs (4, 21, 22), aber der Server kennt nur 2 (vermutlich nur I2C SDA/SCL als "system", OneWire wird wegen Validierungsfehler nicht gezaehlt).

### 3.9 Config-Response — FEHLGESCHLAGEN (Error-Loop bestaetigt)

```json
{
  "status": "error",
  "type": "actuator",
  "count": 0,
  "message": "Actuator config array is empty",
  "error_code": "MISSING_FIELD"
}
```

**Der alte Bug besteht weiterhin.** Bei jedem Heartbeat-Zyklus fragt der ESP die Config ab und erhaelt diesen Error. Das ist ein Error-Loop:

1. ESP sendet Heartbeat
2. Server antwortet mit Heartbeat-ACK (`config_available: false`)
3. ESP fragt trotzdem Config ab (oder Server pusht leere Config)
4. ESP meldet "Actuator config array is empty"

**Impact:** Nicht kritisch (kein Crash), aber verschmutzt Logs und erzeugt unnoetige MQTT-Messages.

---

## Zusaetzliche Beobachtungen

### Zone-ACK empfangen
```
kaiser/god/esp/ESP_472204/zone/ack {"esp_id":"ESP_472204","status":"zone_assigned","zone_id":"echt","master_zone_id":"","ts":1771626300}
```
Zone-Zuweisung funktioniert korrekt.

### Mock-Device MOCK_0954B2B1
- Sendet regelmaessig Heartbeats (alle ~60s, `state: OPERATIONAL`)
- Last-Will-Message auf `system/will` Topic vorhanden
- Kein Interferenz mit Real-Device

---

## Offene Probleme (Prioritaet sortiert)

### P1: Keine Sensoren konfiguriert
- **Status:** sensor_count=0, sensor_configs=0 rows
- **Aktion:** Robin muss SHT31-Sensor ueber Frontend hinzufuegen (oder via REST API)
- **Erwartete Config:** sensor_type=sht31, gpio=null (I2C), i2c_address=0x44, interface_type=i2c

### P2: GpioStatusItem Validation Pattern zu restriktiv
- **Datei:** `El Servador/god_kaiser_server/src/schemas/` (Pydantic Model)
- **Aktuell:** `^(sensor|actuator|system)$`
- **Noetig:** `^(sensor|actuator|system|bus/.+)$`
- **Impact:** GPIO-Status-Info fuer OneWire-Pins geht verloren

### P3: Config-Response Error-Loop
- **Message:** "Actuator config array is empty" bei jedem Zyklus
- **Ursache:** ESP fragt Config ab auch wenn keine Aktoren konfiguriert
- **Impact:** Log-Verschmutzung, unnoetige MQTT-Messages

### P4: firmware_version leer
- **Impact:** Niedrig, kosmetisch
- **Ursache:** ESP sendet kein firmware_version Feld im Heartbeat

---

## Naechste Schritte

1. **SHT31-Sensor hinzufuegen** (Robin via Frontend oder Agent via API)
2. Nach Sensor-Hinzufuegung: Schritt 3.4-3.6 wiederholen
3. P2 (GPIO Pattern) und P3 (Config-Response Loop) als Code-Fixes priorisieren
