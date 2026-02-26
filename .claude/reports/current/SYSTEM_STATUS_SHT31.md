# System-Status-Report: SHT31 Error-Analyse

> **Datum:** 2026-02-25 20:20 UTC
> **Agent:** system-control (Ops-Modus)
> **Kontext:** ESP_472204 feuert SHT31-bezogene Errors im Sekundentakt
> **Ergebnis:** I2C-Timeout-Error (1007) als Root Cause identifiziert, keine Sensor-Daten empfangen

---

## 1. Docker-Container-Status

| Container | Service | Status | Ports | Bewertung |
|-----------|---------|--------|-------|-----------|
| automationone-server | el-servador | Up ~1h (healthy) | 8000 | OK |
| automationone-mqtt | mqtt-broker | Up ~1h (healthy) | 1883, 9001 | OK |
| automationone-postgres | postgres | Up ~1h (healthy) | 5432 | OK |
| automationone-frontend | el-frontend | Up ~7min (healthy) | 5173 | OK |
| automationone-alloy | alloy | Up ~1h (healthy) | 12345 | OK |
| automationone-grafana | grafana | Up ~1h (healthy) | 3000 | OK |
| automationone-loki | loki | Up ~1h (healthy) | 3100 | OK |
| automationone-prometheus | prometheus | Up ~1h (healthy) | 9090 | OK |
| automationone-cadvisor | cadvisor | Up ~1h (healthy) | 8080 | OK |
| automationone-mqtt-logger | mqtt-logger | Up ~1h | -- | OK |
| automationone-mosquitto-exporter | mosquitto-exporter | Up ~1h | 9234 | OK |
| automationone-postgres-exporter | postgres-exporter | Up ~1h (healthy) | 9187 | OK |
| automationone-pgadmin | pgadmin | **Restarting** | -- | PROBLEM |

**Zusammenfassung:** 12/13 Container healthy. pgadmin im Restart-Loop (nicht kritisch fuer Betrieb).

---

## 2. Server Health-Endpoints

### GET /health
```json
{"status": "healthy", "mqtt_connected": true}
```
**Bewertung:** Server gesund, MQTT-Verbindung steht.

### GET /api/v1/health/ready
```json
{"success": true, "ready": true, "checks": {"database": true, "mqtt": true, "disk_space": true}}
```
**Bewertung:** Alle Subsysteme bereit (DB, MQTT, Disk).

### GET /api/v1/health/detailed
```
HTTP 401: "Could not validate credentials"
```
**Bewertung:** Endpoint erfordert Auth-Token. Nicht kritisch -- /health und /ready bestaetigen Gesundheit.

---

## 3. MQTT-Broker-Status

| Pruefung | Ergebnis | Bewertung |
|----------|----------|-----------|
| Container-Status | Up ~1h (healthy) | OK |
| Ports 1883/9001 | Open | OK |
| Server MQTT-Verbindung | `mqtt_connected: true` | OK |
| Live-Traffic (kaiser/#, 10s) | **Keine Messages** | WARNUNG |
| ESP_472204-Topics (15s) | **Timeout** | PROBLEM |
| ESP_472204-Heartbeat (60s) | **Timeout** | PROBLEM |

**Zusammenfassung:** Broker laeuft, Server ist verbunden. ESP_472204 sendet aktuell KEINE MQTT-Messages mehr (kein Heartbeat, keine Sensor-Daten, keine Error-Reports). Der ESP hat sich moeglicherweise aufgehaengt oder ist vom Netz getrennt.

---

## 4. Server-Logs: SHT31 und ESP-Error-Analyse

### 4.1 Error-Code 1007 (I2C_TIMEOUT) -- HAUPTPROBLEM

**Quelle:** `El Trabajante/src/models/error_codes.h:36`
```c
#define ERROR_I2C_TIMEOUT  1007  // I2C operation timed out
```

**Loki-Abfrage (letzte 2 Stunden):**

| Zeitfenster (UTC) | Error 1007 Count / 5min |
|--------------------|------------------------|
| 20:10 | 214 Errors |
| 20:15 | 259 Errors |
| 20:20 | 13 Errors (ESP wird langsamer/offline) |

**Rate:** Ca. 1 Error pro Sekunde im Hauptfenster. Der ESP hat den Server mit I2C-Timeout-Errors geflutet.

**Beispiel-Log-Eintraege (aus Loki):**
```
2026-02-25 20:15:01 - error_handler - Error event saved: esp_id=ESP_472204, error_code=1007, severity=error
2026-02-25 20:15:00 - error_handler - Error event saved: esp_id=ESP_472204, error_code=1007, severity=error
2026-02-25 20:14:59 - error_handler - Error event saved: esp_id=ESP_472204, error_code=1007, severity=error
[... fortlaufend im Sekundentakt ...]
```

### 4.2 Sensor-Health-Warnings

```
2026-02-25 20:14:57 - sensor_health - WARNING - Sensor stale: ESP ESP_472204 GPIO 0 (sht31_temp) - no data for never (timeout: 30s)
2026-02-25 20:14:57 - sensor_health - WARNING - Sensor stale: ESP ESP_472204 GPIO 0 (sht31_humidity) - no data for never (timeout: 30s)
2026-02-25 20:14:57 - sensor_health - WARNING - health_check_sensors: 2 sensor(s) stale (checked: 2, healthy: 0, skipped: 0)
```

**Bewertung:** Beide SHT31-Sensoren (Temp + Humidity) haben **NIE** Daten geliefert ("no data for never"). Der Sensor wurde konfiguriert, aber die I2C-Kommunikation schlaegt konsistent fehl.

### 4.3 Heartbeat-Warnungen (GPIO Mismatch)

```
2026-02-25 20:14:57 - heartbeat_handler - WARNING - GPIO count mismatch for ESP_472204: reported=3, actual=2
2026-02-25 20:14:57 - heartbeat_handler - WARNING - GPIO status item 0 validation failed for ESP_472204:
  1 validation error for GpioStatusItem: owner - String should match pattern '^(sensor|actuator|system)$'
```

**Bewertung:** ESP meldet 3 GPIO-Eintraege im Heartbeat, Server erwartet nur 2. Zusaetzlich validiert ein GPIO-owner-Feld nicht gegen das Schema (`^(sensor|actuator|system)$`). Dies ist ein **separates Bug** in der Heartbeat-Payload-Struktur.

---

## 5. ESP-Device-Status (API-Abfrage)

### 5.1 Registrierte Devices

| Device ID | Status | Type | Sensors | Actuators | Last Seen |
|-----------|--------|------|---------|-----------|-----------|
| ESP_472204 | online | ESP32_WROOM | 2 | 0 | 20:16:00 UTC |
| MOCK_0954B2B1 | online | -- | 0 | 0 | 20:15:59 UTC |

### 5.2 ESP_472204 Detailanalyse

| Parameter | Wert | Bewertung |
|-----------|------|-----------|
| IP-Adresse | 192.168.0.148 | OK |
| Hardware | ESP32_WROOM | OK |
| Zone | "echt" (Echt) | OK |
| WiFi RSSI | -50 dBm | Gut (stabile Verbindung) |
| Heap Free | 199,796 Bytes | OK (Min: 187,120) |
| Heap Fragmentation | 6% | Niedrig, OK |
| Uptime | 2,641s (~44min) | Boot war vor ~44min |
| Boot Reason | SW (Software Reset) | Normaler Neustart |
| System State | OPERATIONAL | OK |
| MQTT Connected | true | OK |
| Error Count (Diagnostics) | 2 | Diagnostics-Zaehler (Heartbeat) |
| Sensor Count | 2 | sht31_temp + sht31_humidity |
| Actuator Count | 0 | Korrekt |
| WDT Mode | PRODUCTION | OK |
| WDT Timeouts (24h) | 0 | Kein Watchdog-Reset |
| MQTT CB State | CLOSED | Circuit Breaker nicht ausgeloest |

### 5.3 Sensor-Konfiguration

| Sensor Type | GPIO | Interface | I2C Address | Status | Latest Value |
|-------------|------|-----------|-------------|--------|-------------|
| sht31_temp | 0 | I2C | 0x44 (68) | config applied | **null** (NIE Daten) |
| sht31_humidity | 0 | I2C | 0x44 (68) | config applied | **null** (NIE Daten) |

**Bewertung:** Config wurde angewendet (`config_status: "applied"`), aber der SHT31-Sensor liefert keine Daten. I2C-Adresse 0x44 ist der Standard fuer SHT31. GPIO 0 ist der I2C-Placeholder (I2C nutzt GPIO 21/22 fuer SDA/SCL).

### 5.4 GPIO-Status aus Initial-Heartbeat

| GPIO | Owner | Component | Mode | Safe |
|------|-------|-----------|------|------|
| 21 | system | I2C_SDA | 2 | false |
| 22 | system | I2C_SCL | 2 | false |

**Bewertung:** I2C-Bus korrekt auf GPIO 21 (SDA) und GPIO 22 (SCL) initialisiert. Der Bus ist konfiguriert, aber die Kommunikation mit dem SHT31 scheitert.

---

## 6. Diagnose-Zusammenfassung

### Root Cause: I2C_TIMEOUT (Error 1007)

Der ESP32 kann den SHT31-Sensor ueber den I2C-Bus nicht erreichen. Moegliche Ursachen:

| # | Moegliche Ursache | Wahrscheinlichkeit | Pruefung |
|---|--------------------|--------------------|----------|
| 1 | **SHT31 nicht korrekt verdrahtet** (SDA/SCL vertauscht, nicht angeschlossen, lose Kontakte) | HOCH | Verkabelung physisch pruefen |
| 2 | **I2C-Adresse falsch** (SHT31 auf 0x45 statt 0x44, ADDR-Pin auf VDD) | MITTEL | I2C-Scanner auf ESP laufen lassen |
| 3 | **Pull-Up-Widerstaende fehlen** (I2C benoetigt 4.7k Pull-Ups auf SDA/SCL) | MITTEL | Widerstaende pruefen (4.7kOhm nach 3.3V) |
| 4 | **SHT31 defekt** (Sensor-Hardware-Fehler) | NIEDRIG | Anderen SHT31 testen |
| 5 | **I2C-Bus busy/stuck** (SDA oder SCL auf LOW gehalten) | NIEDRIG | Bus-Recovery pruefen, ESP neustarten |
| 6 | **3.3V-Versorgung instabil** | NIEDRIG | Spannung am SHT31 messen |

### Sekundaere Probleme

| # | Problem | Schwere | Aktion |
|---|---------|---------|--------|
| S1 | GPIO count mismatch (ESP meldet 3, Server erwartet 2) | Mittel | Heartbeat-Payload analysieren |
| S2 | GPIO owner validation error im Heartbeat | Mittel | ESP-Firmware-Payload pruefen |
| S3 | Error-Flut (1 Error/Sekunde via MQTT) belastet Server und DB | Mittel | Rate-Limiting fuer Error-Reports in ESP-Firmware |
| S4 | ESP sendet aktuell keine MQTT-Messages mehr (moeglicherweise aufgehaengt) | Hoch | ESP Serial-Monitor/Reset |

---

## 7. Empfohlene naechste Schritte

### Sofort (Hardware-Pruefung)

1. **ESP Serial-Monitor starten** (PowerShell):
   ```powershell
   cd "C:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Trabajante"
   C:\Users\PCUser\.platformio\penv\Scripts\pio.exe device monitor -e esp32_dev
   ```
   - Zeigt I2C-Fehlerdetails direkt auf dem ESP
   - Prueft ob der ESP noch reagiert oder gecrashed ist

2. **SHT31 Verkabelung pruefen**:
   - GPIO 21 (SDA) an SHT31 SDA
   - GPIO 22 (SCL) an SHT31 SCL
   - 3.3V an SHT31 VCC
   - GND an SHT31 GND
   - 4.7k Pull-Ups auf SDA und SCL nach 3.3V (falls nicht auf Breakout-Board)

3. **SHT31 ADDR-Pin pruefen**:
   - ADDR an GND = Adresse 0x44 (konfiguriert)
   - ADDR an VDD = Adresse 0x45

### Danach (Agent-Empfehlung)

| Reihenfolge | Agent | Fokus |
|-------------|-------|-------|
| 1 | **esp32-debug** | Serial-Log analysieren: I2C-Init-Sequenz, Error-Details, Bus-Recovery-Versuche |
| 2 | **server-debug** | god_kaiser.log: Heartbeat-Validation-Bug (GPIO count mismatch, owner validation) |
| 3 | **mqtt-debug** | Error-Flut-Rate analysieren, pruefen ob Rate-Limiting greift |

### Code-Fixes (nach Hardware-Loesung)

- **Error-Rate-Limiting:** ESP sollte nicht 1 Error/Sekunde via MQTT senden. Empfehlung: Max 1 Error pro Error-Code pro 30 Sekunden
- **Heartbeat GPIO-Owner:** ESP sendet einen owner-String der nicht dem Server-Schema entspricht. Firmware-Payload muss geprueft werden

---

## 8. Verifizierung

- [x] Docker-Container-Status geprueft (12/13 healthy, pgadmin restart-loop)
- [x] Server Health-Endpoints abgefragt (healthy, ready, alle Checks OK)
- [x] MQTT-Broker-Status geprueft (Container OK, kein ESP-Traffic aktuell)
- [x] Server-Logs auf SHT31/ESP-Errors analysiert (1007 I2C_TIMEOUT im Sekundentakt)
- [x] ESP-Device-Status ueber API geprueft (online, 2 Sensoren konfiguriert, keine Daten)
- [x] Loki-Logs abgefragt (Error-Rate quantifiziert: ~250 Errors/5min)
- [x] Error-Code 1007 in Firmware-Source verifiziert (ERROR_I2C_TIMEOUT)
- [x] SHT31 Frontend-Handling-Report gelesen (bekannte Luecken dokumentiert)
- [x] Report geschrieben

---

*Report erstellt von system-control Agent, 2026-02-25 20:20 UTC*
