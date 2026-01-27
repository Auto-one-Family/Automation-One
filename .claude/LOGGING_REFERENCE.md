# AutomationOne - Vollständige Logging-Referenz für KI-Agenten

> **Zweck:** Diese Datei ermöglicht KI-Agenten den vollständigen Zugriff auf alle System-Logs für Debugging und Analyse.

---

## 1. Schnellübersicht: Alle Log-Quellen

| Quelle | Pfad | Format | Zugriff |
|--------|------|--------|---------|
| **Server (God-Kaiser)** | `logs/god_kaiser.log` | JSON | Read Tool (immer lesbar) |
| **Mosquitto LIVE** | `$SYS/broker/log/#` | Text | `mosquitto_sub -t "$SYS/broker/log/#" -v` |
| **Mosquitto Datei** | `logs/mosquitto.log` | Text | Read Tool (nach Service-Stop) |
| **ESP32 Serial** | `.pio/build/esp32_dev/monitor.log` | Text | Read Tool |
| **GitHub Actions** | Remote | Text | `gh run view <id> --log` |

---

## 2. Server Logs (God-Kaiser) - PRIMÄRE QUELLE

### 2.1 Dateipfad
```
Absolut: c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server\logs\god_kaiser.log
Relativ: El Servador/god_kaiser_server/logs/god_kaiser.log
```

### 2.2 Format (JSON, eine Zeile pro Eintrag)
```json
{
  "timestamp": "2026-01-08 04:56:35",
  "level": "INFO",
  "logger": "src.mqtt.handlers.sensor_handler",
  "message": "Sensor data saved: id=..., esp_id=MOCK_DE6B2E7F, gpio=36",
  "module": "sensor_handler",
  "function": "handle_sensor_data",
  "line": 250
}
```

### 2.3 KI-Agenten Zugriffsmuster

**Letzte N Zeilen lesen:**
```
Read Tool:
  file_path: c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server\logs\god_kaiser.log
  limit: 100
```

**Nach Fehlern suchen:**
```
Grep Tool:
  pattern: "ERROR|CRITICAL|exception|failed"
  path: El Servador/god_kaiser_server/logs/god_kaiser.log
  output_mode: content
  -C: 5
```

**Nach ESP-ID filtern:**
```
Grep Tool:
  pattern: "ESP_12AB34CD|MOCK_DE6B2E7F"
  path: El Servador/god_kaiser_server/logs/god_kaiser.log
  output_mode: content
```

**Nach Modul filtern:**
```
Grep Tool:
  pattern: "sensor_handler|actuator_handler|heartbeat_handler"
  path: El Servador/god_kaiser_server/logs/god_kaiser.log
  output_mode: content
```

### 2.4 Log-Levels

| Level | Bedeutung | Wann suchen? |
|-------|-----------|--------------|
| `DEBUG` | Detaillierte Infos | Performance-Analyse |
| `INFO` | Normale Operationen | Ablauf verstehen |
| `WARNING` | Potenzielle Probleme | Degraded State |
| `ERROR` | Fehler aufgetreten | Bug-Analyse |
| `CRITICAL` | System-Fehler | Crash-Analyse |

### 2.5 Wichtige Logger-Namen

| Logger | Beschreibung |
|--------|--------------|
| `src.mqtt.handlers.sensor_handler` | Sensor-Daten-Empfang |
| `src.mqtt.handlers.actuator_handler` | Actuator-Status |
| `src.mqtt.handlers.heartbeat_handler` | ESP-Heartbeats |
| `src.mqtt.client` | MQTT-Verbindung |
| `src.services.logic_engine` | Automation-Rules |
| `src.services.simulation.scheduler` | Mock-ESP-Simulation |
| `apscheduler.executors.default` | Background-Jobs |
| `uvicorn.error` | HTTP-Server |

### 2.6 Rotation
- **Max Größe:** 10MB
- **Backups:** `god_kaiser.log.1` bis `.5`
- **Älteste löschen:** Automatisch

---

## 3. Mosquitto MQTT Logs

### 3.1 LIVE-Zugriff via MQTT Topic (EMPFOHLEN)

**Mosquitto published Logs auf `$SYS/broker/log/#` - immer lesbar während Service läuft!**

```
Bash Tool:
  command: "/c/Program Files/mosquitto/mosquitto_sub.exe" -h localhost -t "$SYS/broker/log/#" -v -C 20
  timeout: 30000
```

**Output:**
```
$SYS/broker/log/N 2026-01-11T01:34:34: New connection from ::1:55869 on port 1883.
$SYS/broker/log/N 2026-01-11T01:34:34: New client connected from ::1 as ESP_12AB34CD
$SYS/broker/log/M/subscribe 2026-01-11T01:34:35: ESP_12AB34CD 0 kaiser/god/esp/+/actuator/+/command
```

### 3.2 Log-Datei (nach Service-Stop)

```
Absolut: c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server\logs\mosquitto.log
Relativ: El Servador/god_kaiser_server/logs/mosquitto.log
```

**Hinweis:** Datei ist während Service-Lauf gesperrt (Windows File-Lock).

### 3.3 Log-Types (alle aktiviert)

| Type | MQTT Topic | Beschreibung |
|------|------------|--------------|
| `error` | `$SYS/broker/log/E` | Fehler |
| `warning` | `$SYS/broker/log/W` | Warnungen |
| `notice` | `$SYS/broker/log/N` | Connect/Disconnect |
| `information` | `$SYS/broker/log/I` | Allgemeine Infos |
| `debug` | `$SYS/broker/log/D` | MQTT-Pakete (detailliert) |
| `subscribe` | `$SYS/broker/log/M/subscribe` | Subscription-Events |
| `unsubscribe` | `$SYS/broker/log/M/unsubscribe` | Unsubscription-Events |

### 3.4 KI-Agenten Zugriffsmuster

**Live-Logs lesen (während Service läuft):**
```
Bash Tool:
  command: "/c/Program Files/mosquitto/mosquitto_sub.exe" -h localhost -t "$SYS/broker/log/#" -v -C 30
  timeout: 15000
```

**Nur Fehler/Warnungen:**
```
Bash Tool:
  command: "/c/Program Files/mosquitto/mosquitto_sub.exe" -h localhost -t "$SYS/broker/log/E" -t "$SYS/broker/log/W" -v -C 10
  timeout: 10000
```

**Log-Datei nach Service-Stop:**
```
Read Tool:
  file_path: c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server\logs\mosquitto.log
```

### 3.5 Wichtige Patterns

| Pattern | Bedeutung |
|---------|-----------|
| `New client connected` | Client verbunden |
| `Client ... disconnected` | Client getrennt |
| `SUBSCRIBE` | Subscription-Request |
| `Received PUBLISH` | Nachricht empfangen |
| `Sending PUBLISH` | Nachricht gesendet |
| `Socket error` | Verbindungsfehler |

### 3.6 Config-Datei

**Projekt-Config:** `El Servador/god_kaiser_server/mosquitto_full_logging.conf`

**Installation (Admin-CMD):**
```cmd
net stop mosquitto && copy "C:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server\mosquitto_full_logging.conf" "C:\Program Files\mosquitto\mosquitto.conf" && net start mosquitto
```

---

## 4. ESP32 Serial Logs

### 4.1 Dateipfad (wenn log2file aktiv)
```
Absolut: c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Trabajante\.pio\build\esp32_dev\monitor.log
Relativ: El Trabajante/.pio/build/esp32_dev/monitor.log
```

### 4.2 Format
```
[      1234] [INFO    ] System initialized
[      5678] [DEBUG   ] Sensor reading: 25.4C
[      8901] [ERROR   ] MQTT publish failed
[     12345] [WARNING ] WiFi signal weak: -75 dBm
```

### 4.3 Live-Zugriff (nur mit USB-Verbindung)
```
Bash Tool:
  command: cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe device monitor --baud 115200
```

### 4.4 Log-Levels

| Level | Bedeutung |
|-------|-----------|
| `DEBUG` | Detailliert (Sensor-Reads, etc.) |
| `INFO` | Normal (Init, Connect, etc.) |
| `WARNING` | Recoverable (Reconnect, etc.) |
| `ERROR` | Fehler (Init failed, etc.) |
| `CRITICAL` | System-Crash |

---

## 5. MQTT Traffic Live-Analyse

### 5.1 Alle Topics subscriben
```
Bash Tool:
  command: "/c/Program Files/mosquitto/mosquitto_sub.exe" -h localhost -p 1883 -t "kaiser/#" -v
  timeout: 30000
```

### 5.2 Spezifische Topics

**Sensor-Daten:**
```
mosquitto_sub -h localhost -t "kaiser/god/esp/+/sensor/+/data" -v
```

**Actuator-Commands:**
```
mosquitto_sub -h localhost -t "kaiser/god/esp/+/actuator/+/command" -v
```

**Heartbeats:**
```
mosquitto_sub -h localhost -t "kaiser/god/esp/+/system/heartbeat" -v
```

**Diagnostics:**
```
mosquitto_sub -h localhost -t "kaiser/god/esp/+/system/diagnostics" -v
```

### 5.3 Test-Nachricht senden
```
Bash Tool:
  command: "/c/Program Files/mosquitto/mosquitto_pub.exe" -h localhost -t "test/debug" -m '{"test":true}'
```

---

## 6. Debugging-Workflows für KI-Agenten

### 6.1 Workflow: "Warum kommt keine Sensor-Daten an?"

**Schritt 1: Server-Log prüfen**
```
Grep Tool:
  pattern: "sensor.*data|Sensor.*saved"
  path: El Servador/god_kaiser_server/logs/god_kaiser.log
  output_mode: content
  -C: 2
```

**Schritt 2: MQTT-Handler prüfen**
```
Grep Tool:
  pattern: "sensor_handler|ERROR|failed"
  path: El Servador/god_kaiser_server/logs/god_kaiser.log
  output_mode: content
```

**Schritt 3: Mosquitto-Verbindung prüfen**
```
Bash Tool:
  command: netstat -ano | grep 1883
```

### 6.2 Workflow: "ESP verbindet nicht"

**Schritt 1: Heartbeat-Handler prüfen**
```
Grep Tool:
  pattern: "heartbeat|ESP_|MOCK_"
  path: El Servador/god_kaiser_server/logs/god_kaiser.log
  output_mode: content
  -C: 3
```

**Schritt 2: MQTT-Verbindung prüfen**
```
Grep Tool:
  pattern: "MQTT connected|MQTT.*failed|broker"
  path: El Servador/god_kaiser_server/logs/god_kaiser.log
  output_mode: content
```

### 6.3 Workflow: "Actuator reagiert nicht"

**Schritt 1: Command im Log suchen**
```
Grep Tool:
  pattern: "actuator.*command|control_actuator"
  path: El Servador/god_kaiser_server/logs/god_kaiser.log
  output_mode: content
  -C: 5
```

**Schritt 2: Safety-Service prüfen**
```
Grep Tool:
  pattern: "safety|emergency|rejected"
  path: El Servador/god_kaiser_server/logs/god_kaiser.log
  output_mode: content
```

### 6.4 Workflow: "Server startet nicht"

**Schritt 1: Letzte Logs vor Crash**
```
Read Tool:
  file_path: El Servador/god_kaiser_server/logs/god_kaiser.log
  limit: 200
```

**Schritt 2: Kritische Fehler suchen**
```
Grep Tool:
  pattern: "CRITICAL|Traceback|Exception|ImportError"
  path: El Servador/god_kaiser_server/logs/god_kaiser.log
  output_mode: content
  -C: 10
```

---

## 7. Log-Konfiguration ändern

### 7.1 Server Log-Level ändern

**Datei:** `El Servador/god_kaiser_server/.env`
```env
LOG_LEVEL=DEBUG        # DEBUG, INFO, WARNING, ERROR, CRITICAL
LOG_FORMAT=json        # json oder text
```

### 7.2 ESP32 Log-Level ändern

**Datei:** `El Trabajante/platformio.ini`
```ini
build_flags =
    -DCORE_DEBUG_LEVEL=4    # 0=None, 1=Error, 2=Warn, 3=Info, 4=Debug
```

### 7.3 Mosquitto Log-Level ändern

**Datei:** `C:\Program Files\mosquitto\mosquitto.conf`
```conf
# Weniger verbose:
log_type error
log_type warning
log_type notice

# Mehr verbose (alle):
log_type all
```

---

## 8. Häufige Log-Patterns und ihre Bedeutung

### 8.1 Erfolgreiche Operationen

| Pattern | Bedeutung |
|---------|-----------|
| `Sensor data saved: id=...` | Sensor-Daten erfolgreich gespeichert |
| `MQTT connected with result code: 0` | MQTT-Verbindung OK |
| `Registered X MQTT handlers` | Handler bereit |
| `Job "..." executed successfully` | Background-Job OK |
| `Application startup complete` | Server bereit |

### 8.2 Warnungen

| Pattern | Bedeutung | Aktion |
|---------|-----------|--------|
| `MQTT broker unavailable` | Broker offline | Mosquitto prüfen |
| `Device X timed out` | ESP offline | Normal für Mocks |
| `Rate limit exceeded` | Zu viele Requests | Throttling aktiv |

### 8.3 Fehler

| Pattern | Bedeutung | Aktion |
|---------|-----------|--------|
| `Handler returned False` | Handler-Fehler | Payload prüfen |
| `ValidationError` | Ungültige Daten | Schema prüfen |
| `ConnectionRefusedError` | Service offline | Service starten |
| `Queue bound to different event loop` | AsyncIO Bug | Siehe Bug O |

---

## 9. Zusammenfassung: KI-Agenten Checkliste

Für vollständige System-Analyse diese Logs prüfen:

1. **Server-Log** (IMMER zuerst):
   ```
   Read Tool:
     file_path: c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server\logs\god_kaiser.log
     limit: 100
   ```

2. **Mosquitto LIVE-Logs** (bei MQTT-Problemen):
   ```
   Bash Tool:
     command: "/c/Program Files/mosquitto/mosquitto_sub.exe" -h localhost -t "$SYS/broker/log/#" -v -C 30
     timeout: 15000
   ```

3. **ESP32-Serial** (bei Hardware-Problemen):
   ```
   Read Tool:
     file_path: c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Trabajante\.pio\build\esp32_dev\monitor.log
   ```

4. **Live MQTT-Traffic** (bei Kommunikationsproblemen):
   ```
   Bash Tool:
     command: "/c/Program Files/mosquitto/mosquitto_sub.exe" -h localhost -t "kaiser/#" -v -C 50
     timeout: 30000
   ```

---

**Erstellt:** 2026-01-11
**Version:** 1.1 (MQTT Topic-basiertes Live-Logging)
