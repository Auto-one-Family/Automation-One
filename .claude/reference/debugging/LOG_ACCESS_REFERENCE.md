# Log-Zugriff -- Agent-Referenz

> **Version:** 3.0 | **Stand:** 2026-02-23
> **Zweck:** Zentrale Referenz fuer Log-Dateien, Prioritaeten, Correlation-IDs und Erstellung
> **Verknuepfung:** [LOG_LOCATIONS.md](LOG_LOCATIONS.md) fuer Pfade und Capture-Methoden

---

## 1. Agent -> Log-Hierarchie (Prioritaet beim Lesen)

| Agent | Primaer | Erweitert (wenn vorhanden) | Fallback |
|-------|--------|---------------------------|----------|
| server-debug | `logs/current/god_kaiser.log` | `logs/current/server_loki_errors.log`, `logs/current/server_api_filtered.log` | `logs/server/god_kaiser.log` |
| mqtt-debug | `logs/current/mqtt_traffic.log` | `logs/current/mqtt_capture_*.log` (via mqtt_capture.sh) | `docker compose logs mqtt-broker` / Loki |
| frontend-debug | `logs/current/frontend_container.log` | Server-Log `[FRONTEND]` Eintraege (via `/api/v1/logs/frontend`) | Loki `compose_service=el-frontend` / `docker compose logs el-frontend` |
| esp32-debug | `logs/current/esp32_serial.log` | `docker compose logs esp32-serial-logger` | Loki `compose_service=esp32-serial-logger` -> `logs/wokwi/serial/*.log` -> "Bitte starte Serial-Capture manuell" |
| test-log-analyst | `logs/backend/`, `logs/frontend/`, `logs/wokwi/reports/`, `logs/server/` | CI: `gh run view --log` | - |

**esp32-debug Fallback-Kette (Prioritaet):**
1. `logs/current/esp32_serial.log` (manuelles Capture)
2. `docker compose logs esp32-serial-logger` (Hardware-Profil)
3. Loki: `{compose_service="esp32-serial-logger"}`
4. `logs/wokwi/serial/*.log` (Wokwi-Tests)
5. Fallback: "Bitte starte Serial-Capture manuell"

**Regel:** Debug-Agents haben Terminal fuer vollen Stack-Zugriff. PowerShell: `;` statt `&&`.

---

## 2. Wer erstellt welche Dateien

| Quelle | Erstellt von | Zeitpunkt | Debug-Agent |
|--------|--------------|-----------|-------------|
| `logs/current/mqtt_traffic.log` | session.sh | Session-Start | mqtt-debug |
| `logs/current/mqtt_capture_*.log` | `scripts/debug/mqtt_capture.sh` | Manuell | mqtt-debug |
| `logs/current/god_kaiser.log` | session.sh (Symlink) | Session-Start | server-debug |
| `logs/current/esp32_serial.log` | User (Wokwi/Monitor) | Waehrend Test | esp32-debug |
| `logs/current/frontend_container.log` | session.sh + system-control | Start + Ende | frontend-debug |
| `logs/current/server_loki_errors.log` | session.sh | Session-Start (Monitoring) | server-debug |
| `logs/current/STATUS.md` | session.sh | Session-Start | Alle |

---

## 3. MQTT Payload Capture

Mosquitto loggt designbedingt KEINE Message-Payloads. Fuer Payload-Analyse:

```bash
# Starte MQTT Debug Capture
./scripts/debug/mqtt_capture.sh                                    # Alle kaiser/# Topics
./scripts/debug/mqtt_capture.sh "kaiser/god/esp/+/sensor/+/data"   # Nur Sensor-Daten
./scripts/debug/mqtt_capture.sh "kaiser/#" logs/current/mqtt.log   # Custom Output
```

Output-Format: `[2026-02-23T12:00:00Z] topic payload`

---

## 4. Correlation-ID Pattern

### Wie Correlation-IDs funktionieren

1. **ESP32** sendet `"seq"` in MQTT-Payloads (monoton steigend pro ESP)
2. **Server** generiert Correlation-ID: `{esp_id}:{topic_suffix}:{seq}:{timestamp_ms}`
3. **Alle Server-Log-Eintraege** enthalten die Correlation-ID im `request_id` Feld

### Cross-Layer Debugging mit Correlation-IDs

```bash
# Schritt 1: Finde ESP-ID und Seq in MQTT-Capture
grep "ESP_12AB34CD" logs/current/mqtt_capture_*.log

# Schritt 2: Suche Correlation-ID im Server-Log
grep "ESP_12AB34CD:data:42" logs/server/god_kaiser.log

# Schritt 3: Loki-Query (wenn Monitoring laeuft)
# {compose_service="el-servador"} |= "ESP_12AB34CD:data:42"
```

### Beispiel

```
ESP32 sendet:   {"esp_id":"ESP_12AB34CD","seq":42,"gpio":34,"raw":2048,...}
Server loggt:   2026-02-23 12:00:00 - sensor_handler - INFO - [ESP_12AB34CD:data:42:1708704000000] - Processing sensor data
```

---

## 5. Frontend Error Reporting

Frontend-Errors werden automatisch an den Server gemeldet:
- **Vue Error Handler** -> POST `/api/v1/logs/frontend`
- **Unhandled Rejection** -> POST `/api/v1/logs/frontend`
- **window.onerror** -> POST `/api/v1/logs/frontend`

Im Server-Log suchen:
```bash
grep "\[FRONTEND\]" logs/server/god_kaiser.log
```

Rate-Limited: Max 10 Requests/Minute pro IP.

---

## 6. ESP32 Log-Format (TAG-basiert)

ESP32 Firmware verwendet TAG-basierte Logs (ESP-IDF Konvention):

```
[     12345] [INFO    ] [SENSOR  ] pH sensor initialized on GPIO 34
[     12346] [ERROR   ] [MQTT    ] Connection failed
[     12347] [WARNING ] [SAFETY  ] Emergency stop triggered
```

**Format:** `[millis] [LEVEL   ] [TAG     ] message`

**TAGs:** BOOT, SENSOR, ACTUATOR, MQTT, WIFI, GPIO, NVS, CONFIG, SAFETY, I2C, ONEWIRE, PWM, HEALTH, CBREAKER, ERRTRAK, HTTP, PROV, TIME, TOPIC, PUMP, VALVE, PWMACT

**MQTT Log-Level aendern:**
```bash
mosquitto_pub -h localhost \
  -t "kaiser/god/esp/ESP_12AB34CD/system/command" \
  -m '{"command":"set_log_level","params":{"level":"DEBUG"}}'
```

---

## 7. Loki-Queries fuer Agents

### server-debug
```
{compose_service="el-servador"} |= "ERROR"
{compose_service="el-servador"} | json | level="ERROR"
{compose_service="el-servador"} |= "ESP_12AB34CD"
{compose_service="el-servador"} |= "[FRONTEND]"
```

### mqtt-debug
```
{compose_service="mqtt-broker"} |= "disconnect"
{compose_service="mqtt-broker"} |= "error"
```

### frontend-debug
```
{compose_service="el-frontend"} | json | level="error"
{compose_service="el-frontend"} | json | component="ESPCard"
```

### esp32-debug
```
{compose_service="esp32-serial-logger"} |= "ERROR"
{compose_service="esp32-serial-logger", device="esp32-xiao-01"}
{compose_service="esp32-serial-logger"} |= "[SENSOR"
```

---

## 8. Loki / Debug API Verfuegbarkeit

| Quelle | Wann verfuegbar | Nutzung |
|--------|----------------|---------|
| Loki (`localhost:3100`) | Nur bei `docker compose --profile monitoring up` | session.sh fuehrt Loki-Queries aus |
| Debug API (`/api/v1/debug/logs`) | Immer wenn Server laeuft | `level=ERROR` exportieren |
| Frontend Log Endpoint | Immer wenn Server laeuft | Automatisch (Vue Error Handler) |

---

## 9. Verweis

- **Pfad-Details:** [LOG_LOCATIONS.md](LOG_LOCATIONS.md)
- **Flow-Kontext:** [flow_reference.md](../testing/flow_reference.md) F1.2-F1.4
- **Session-Script:** `scripts/debug/start_session.sh`
- **MQTT Capture:** `scripts/debug/mqtt_capture.sh`
- **REST Endpoints:** [REST_ENDPOINTS.md](../api/REST_ENDPOINTS.md)
