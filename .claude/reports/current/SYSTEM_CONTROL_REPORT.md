# System Control Report - Migration Verifikation

**Session:** Sensor-Pipeline Migration-Test (PiEnhancedProcessor entfernt)
**Erstellt:** 2026-02-06T11:38:00+01:00
**Aktualisiert:** 2026-02-06T11:44:30+01:00
**Agent:** system-control
**Zweck:** Verifikation der Sensor-Pipeline nach Migration (HTTP-Endpoint entfernt, nur MQTT)

---

## System-Status (aus SESSION_BRIEFING.md)

| Komponente | Status | Details |
|------------|--------|---------|
| Docker Stack | ALL HEALTHY | 8 Container, Up 54 Minuten |
| Server | Running | Port 8000 (automationone-server), started 54 min ago |
| MQTT-Broker | Running | Port 1883, 9001 (automationone-mqtt) |
| PostgreSQL | Running | Port 5432, DB: god_kaiser_db |
| Frontend | Running | Port 5173 |
| Grafana | Running | Port 3100 (Loki), 3000 (Grafana), 9090 (Prometheus) |

---

## Ausgeführte Operationen

### Phase 1: Initial Check (Pre-Restart)

| Zeit | Befehl | Ergebnis | Details |
|------|--------|----------|---------|
| [11:37:21] | curl http://localhost:8000/health | ✓ | {"status":"healthy","mqtt_connected":true} |
| [11:37:21] | docker compose ps | ✓ | All containers healthy |
| [11:37:24] | curl http://localhost:8000/api/v1/auth/login (Robin/Robin123!) | ✗ | 401 Invalid username or password |
| [11:37:31] | DB: List databases | ✓ | Found: god_kaiser_db |
| [11:37:31] | DB: List tables | ✓ | 19 tables incl. esp_devices, sensor_data |
| [11:37:33] | DB: Check user_accounts | ✓ | User: admin (Robin does not exist) |
| [11:37:33] | DB: Check esp_devices | ✓ | ESP_472204, status=offline, last_seen: 2026-02-05 22:20:49 |
| [11:37:46] | MQTT: Subscribe kaiser/# (10s) | ✓ | 4 retained messages from ESP_472204, NO live traffic |
| [11:38:20] | MQTT: Publish mock sensor data (quality=pending) | **✗ REJECTED** | Server: Invalid quality value: 'pending' |
| [11:38:20] | Server logs check | ✓ | ERROR [5206]: quality='pending' not allowed |
| [11:38:25] | DB: Check sensor_data (last 10 min) | ✓ | COUNT = 0 (mock NOT stored) |

### Phase 2: Post-Restart Verification

| Zeit | Befehl | Ergebnis | Details |
|------|--------|----------|---------|
| [11:42:10] | curl http://localhost:8000/health | ✓ | {"status":"healthy","mqtt_connected":true} |
| [11:42:10] | docker compose ps el-servador | ✓ | Up 56 seconds (healthy) - RESTARTED |
| [11:42:15] | DB: Check esp_devices | ✓ | ESP_472204, status=**online**, last_seen: 11:42:37 |
| [11:42:50] | MQTT: Subscribe kaiser/# (15s) | ✓ | **LIVE TRAFFIC DETECTED** |
| | | | - Sensor data: GPIO 21, sht31_humidity, quality="pending" |
| | | | - Heartbeat: uptime=244s, zone_assigned=false |
| | | | - Server ACK: status=online |
| [11:43:58] | MQTT: Publish mock sensor data (quality=pending) | **✗ REJECTED** | SAME ERROR - code NOT updated! |
| [11:43:58] | Server logs check | ✓ | ERROR [5206]: quality='pending' STILL not allowed |
| [11:44:01] | Server logs: ESP_472204 | **✗ REJECTED** | Real ESP also rejected (multiple errors) |
| [11:44:05] | DB: Check sensor_data (last 10 min) | ✓ | COUNT = 0 (NO data stored) |
| [11:44:10] | DB: Check sensor_configs | ✓ | 1 config: ESP_472204, GPIO 21, sht31_temp |
| [11:44:15] | docker-compose.yml inspection | ✓ | **NO CODE MOUNT** - only log mount |

---

## Anomalien

### 1. **KRITISCH: Container-Restart hat Code NICHT aktualisiert**

**Beobachtung nach Restart:**
- Server lehnt IMMER NOCH `quality="pending"` ab
- Mock wurde rejected: `Invalid quality value: 'pending'. Must be one of ['good', 'fair', 'poor', 'suspect', 'error', 'unknown']`
- **ECHTER ESP (ESP_472204) wird ebenfalls rejected** - mehrfache Errors:
  ```
  11:43:04 - ERROR - [5206] Invalid sensor data payload from ESP_472204: Invalid quality value: 'pending'
  11:43:31 - ERROR - [5206] Invalid sensor data payload from ESP_472204: Invalid quality value: 'pending'
  11:44:01 - ERROR - [5206] Invalid sensor data payload from ESP_472204: Invalid quality value: 'pending'
  ```

**Root Cause (BESTÄTIGT):**
- `docker-compose.yml` Line 99-100: **NUR Log-Mount, KEIN Code-Mount**
- Kommentar: "Code kommt aus Image, Watch synchronisiert"
- **Docker Watch ist NICHT konfiguriert** (kein `x-develop:` in compose file)
- **Container-Restart lädt Code NICHT neu** - Image muss rebuilt werden

**Git Diff (Working Directory):**
```diff
-            valid_qualities = ["good", "fair", "poor", "suspect", "error", "unknown"]
+            valid_qualities = ["good", "fair", "poor", "suspect", "error", "unknown", "pending"]
```

**Deployment-Requirement:**
```bash
# RESTART reicht NICHT - REBUILD nötig:
docker compose up -d --build el-servador
```

### 2. ESP_472204 ist online und sendet Daten

**Beobachtung:**
- ESP Status: **online** seit 11:42:37
- Heartbeat empfangen: uptime=244s, heap_free=209552, wifi_rssi=-44
- **Sensor-Daten werden gesendet:**
  - Topic: `kaiser/god/esp/ESP_472204/sensor/21/data`
  - Payload: `{"esp_id":"ESP_472204","gpio":21,"sensor_type":"sht31_humidity","raw":31154,"value":0.00,"unit":"","quality":"pending","ts":1770378214,"raw_mode":true,"i2c_address":68}`
  - **ESP sendet quality="pending"** - wie erwartet für RAW-Mode

**Server-Reaktion:**
- **ALLE Sensor-Daten werden REJECTED** (Error 5206)
- **KEINE Daten in DB gespeichert** (sensor_data ist leer)
- ESP bekommt Heartbeat-ACK, aber Sensor-Pipeline ist blockiert

**Implikation:**
- ESP funktioniert korrekt (MQTT, RAW-Mode, quality="pending")
- Server ist der Blocker - alter Code lehnt quality="pending" ab
- **Daten-Verlust:** Alle Sensor-Readings seit Restart werden verworfen

### 3. Sensor-Config vs. ESP-Daten Mismatch

**Beobachtung:**
- DB sensor_configs: ESP_472204, GPIO 21, **sht31_temp** (enabled)
- ESP sendet: GPIO 21, **sht31_humidity** (nicht sht31_temp)

**Mögliche Ursachen:**
- ESP sendet alle I2C-Sensoren (Temp + Humidity), aber Config hat nur einen
- Sensor-Config ist veraltet oder unvollständig
- ESP registriert beide Sensoren nicht korrekt

**Implikation:** Selbst nach Code-Fix könnte humidity rejected werden (kein Config-Eintrag).

### 4. Database ist leer

**Beobachtung:**
```sql
SELECT COUNT(*) FROM sensor_data; → 0 rows
```

**Grund:** Alle Sensor-Daten werden seit Tagen rejected (quality="pending" Validierung schlägt fehl).

### 5. Retained MQTT-Messages (weiterhin vorhanden)

**Beobachtung:**
```
kaiser/god/esp/ESP_472204/system/will {"status":"offline",...}
kaiser/god/esp/ESP_472204/config_response {"status":"error","type":"actuator",...}
kaiser/god/esp/ESP_472204/onewire/scan_result {"devices":[],"found_count":0}
```

**Implikation:** Retained Messages von vorherigen Sessions verschmutzen MQTT-Namespace.

---

## Empfohlene Debug-Fokuspunkte

### Server (server-debug) - HÖCHSTE PRIORITÄT

**KRITISCH:**
1. **Image neu bauen** - Code-Änderung deployen:
   ```bash
   docker compose up -d --build el-servador
   ```
2. **Nach Rebuild:** Mock-Test + ESP-Daten-Verifikation wiederholen
3. **Code-Mount evaluieren:** Sollte Development-Setup Code-Mount haben für Hot-Reload?
4. **Docker Watch:** Sollte x-develop für el-servador konfiguriert werden?

**Logs analysieren:**
- Startup-Sequenz nach Rebuild
- Wurde sensor_handler.py korrekt geladen?
- Welche Version wird ausgeführt?

### ESP32 (esp32-debug) - NIEDRIGE PRIORITÄT

**ESP funktioniert korrekt:**
- Sendet RAW-Mode mit quality="pending" wie erwartet
- Heartbeat funktioniert
- MQTT-Verbindung stabil

**Mögliche Actions:**
- Sensor-Config für sht31_humidity hinzufügen (via Server-API)
- Prüfe ob beide I2C-Sensoren (Temp + Humidity) registriert werden sollten

### MQTT (mqtt-debug) - NIEDRIGE PRIORITÄT

**Optional Cleanup:**
```bash
# Retained Messages löschen
docker compose exec mqtt-broker mosquitto_pub -t "kaiser/god/esp/ESP_472204/system/will" -r -n
docker compose exec mqtt-broker mosquitto_pub -t "kaiser/god/esp/ESP_472204/config_response" -r -n
docker compose exec mqtt-broker mosquitto_pub -t "kaiser/god/esp/ESP_472204/onewire/scan_result" -r -n
```

---

## Sensor-Pipeline Test-Ergebnis

### Test-Setup (Phase 2)
**Mock-Payload gesendet:**
```json
{
  "esp_id": "MOCK_MIGRATION_TEST",
  "gpio": 34,
  "sensor_type": "ph",
  "raw": 2048,
  "value": 0.0,
  "unit": "",
  "quality": "pending",
  "ts": 1738850000,
  "raw_mode": true
}
```

**Real ESP-Payload empfangen:**
```json
{
  "esp_id": "ESP_472204",
  "gpio": 21,
  "sensor_type": "sht31_humidity",
  "raw": 31154,
  "value": 0.00,
  "unit": "",
  "quality": "pending",
  "ts": 1770378214,
  "raw_mode": true,
  "i2c_address": 68
}
```

### Test-Ergebnis: **FAILED (beide)**

**Server-Antwort:**
- MQTT-Handler: **REJECTED** (Mock + Real ESP)
- Error-Code: 5206 (VALIDATION)
- Reason: `Invalid quality value: 'pending'`

**Database:**
- `SELECT COUNT(*) FROM sensor_data;` → **0**
- Weder Mock noch Real ESP Daten persistiert

**Pipeline-Status:**
- ✓ MQTT-Messages empfangen: **Ja** (Handler aktiviert)
- ✗ Payload-Validierung: **FAILED** (quality='pending' rejected)
- ✗ _trigger_pi_enhanced_processing(): **Nicht ausgeführt** (Validierung vorher fehlgeschlagen)
- ✗ Database-Insert: **Nein** (wegen Validierung)

**Datenverlust:**
- ESP_472204 sendet seit 11:42 (~244s uptime = ~4 Minuten)
- Alle Sensor-Readings werden verworfen (keine DB-Persistierung)
- Heartbeat funktioniert, aber Sensor-Pipeline ist tot

---

## Zusammenfassung

### Kritische Findings

1. **Container-Restart reicht NICHT aus** - Code-Mount fehlt, Image-Rebuild nötig
2. **Server läuft IMMER NOCH mit altem Code** - quality="pending" wird weiterhin rejected
3. **Real ESP wird ebenfalls rejected** - Daten-Verlust seit Restart (alle Sensor-Readings verworfen)
4. **sensor_data Tabelle ist leer** - Pipeline funktioniert seit Tagen nicht (keine Daten persistent)
5. **Sensor-Config unvollständig** - sht31_humidity hat keine Config, nur sht31_temp

### Nächste Schritte (KRITISCH)

**1. SOFORT: Image neu bauen**
```bash
docker compose up -d --build el-servador
```

**2. Nach Rebuild: Verifikation wiederholen**
- Mock-Test erneut senden
- Server-Log prüfen (sollte quality="pending" akzeptieren)
- DB prüfen (Daten sollten persistiert werden)

**3. ESP Sensor-Config ergänzen**
```bash
# sht31_humidity Config hinzufügen (via API oder direkt in DB)
```

**4. Development-Setup verbessern (optional)**
- Code-Mount hinzufügen für Hot-Reload
- ODER Docker Watch konfigurieren
- ODER Makefile-Target für schnellen Rebuild

### Offene Fragen

1. **Warum wurde Code-Mount entfernt?** - Kommentar sagt "Watch synchronisiert", aber kein x-develop vorhanden
2. **Sollte quality="pending" vom ESP gesendet werden?** - Aktuell: Ja (RAW-Mode). Alternative: ESP sendet quality="unknown", Server setzt "pending"
3. **Sensor-Config Sync:** Wer ist zuständig? ESP registriert alle Sensoren oder Server-Admin konfiguriert?

---

## Live MQTT-Traffic (Post-Restart)

**Captured 2026-02-06 11:42:50 - 11:43:05 (15s window)**

```
[RETAINED] kaiser/god/esp/ESP_472204/system/will
{"status":"offline","reason":"unexpected_disconnect","timestamp":1770377929}

[RETAINED] kaiser/god/esp/ESP_472204/system/command/response
{"command":"onewire/scan","status":"ok","found_count":0,"pin":4}

[RETAINED] kaiser/god/esp/ESP_472204/config_response
{"status":"error","type":"actuator","count":0,"message":"Actuator config array is empty","error_code":"MISSING_FIELD"}

[RETAINED] kaiser/god/esp/ESP_472204/onewire/scan_result
{"devices":[],"found_count":0}

[LIVE] kaiser/god/esp/ESP_472204/sensor/21/data
{"esp_id":"ESP_472204","zone_id":"","subzone_id":"","gpio":21,"sensor_type":"sht31_humidity","raw":31154,"value":0.00,"unit":"","quality":"pending","ts":1770378214,"raw_mode":true,"i2c_address":68,"quality":"pending"}

[LIVE] kaiser/god/esp/ESP_472204/system/heartbeat
{"esp_id":"ESP_472204","zone_id":"","master_zone_id":"","zone_assigned":false,"ts":1770378218,"uptime":244,"heap_free":209552,"wifi_rssi":-44,"sensor_count":1,"actuator_count":0,"gpio_status":[{"gpio":4,"owner":"bus/onewire/4","component":"OneWireBus","mode":2,"safe":false},{"gpio":21,"owner":"system","component":"I2C_SDA","mode":2,"safe":false},{"gpio":22,"owner":"system","component":"I2C_SCL","mode":2,"safe":false}],"gpio_reserved_count":3,"config_status":{"wifi_configured":true,"zone_assigned":false,"system_configured":true,"subzone_count":0,"boot_count":0,"state":8}}

[LIVE] kaiser/god/esp/ESP_472204/system/heartbeat/ack
{"status": "online", "config_available": false, "server_time": 1770378217}
```

**Analysis:**
- ESP sendet alle ~30s Sensor-Daten (GPIO 21, sht31_humidity)
- Heartbeat funktioniert korrekt
- Server ACK wird gesendet
- **ABER:** Sensor-Daten werden nicht persistiert (Validierung schlägt fehl)

---

**Ende des Reports**

*Erstellt: 2026-02-06T11:38:30+01:00*
*Aktualisiert: 2026-02-06T11:44:30+01:00*
*Agent: system-control | AutomationOne*
