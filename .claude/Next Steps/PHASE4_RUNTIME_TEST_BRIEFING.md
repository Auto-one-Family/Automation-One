# 🎯 ENTWICKLER-BRIEFING: Phase 4 Runtime-Test

**Datum:** 2026-01-15  
**Status:** IN PROGRESS - Debug-Logging aktiv  
**Letzter Test:** 12:17:22 CET

---

## 📊 Situation

### Was funktioniert ✅

1. **NVS-Fix erfolgreich implementiert**
   - `KEY_TOO_LONG` Error ist behoben
   - Safe-Mode NVS-Keys von 16+ auf ≤15 Zeichen gekürzt
   - Migration von alten Keys funktioniert

2. **ESP32 Boot-Sequenz**
   - Sauberer Single-Boot (nicht mehr 3x wie vorher)
   - Alle 5 Phasen erfolgreich:
     - Phase 1: Core Infrastructure READY
     - Phase 2: Communication Layer READY
     - Phase 3: Hardware Abstraction READY
     - Phase 4: Sensor System READY
     - Phase 5: Actuator System READY

3. **MQTT-Verbindung**
   - ESP_00000001 connected zum Broker
   - Subscriptions aktiv auf allen relevanten Topics
   - Heartbeats fließen alle 60 Sekunden
   - Server empfängt und verarbeitet Heartbeats korrekt

4. **OneWire Bus**
   - Initialisiert auf GPIO 4
   - "Bus reset failed - no devices present" ist ERWARTET (Wokwi hat keine DS18B20)

### Das Problem ⚠️

**MQTT System-Commands werden empfangen, aber nicht verarbeitet!**

```
Wokwi Serial zeigt:
[341557] [INFO] MQTT message received: kaiser/god/esp/ESP_00000001/system/command
[531176] [INFO] MQTT message received: kaiser/god/esp/ESP_00000001/system/command
[596348] [INFO] MQTT message received: kaiser/god/esp/ESP_00000001/system/command
```

**ABER:** Keine weiteren Logs danach! Die Command-Verarbeitung scheitert STILL.

---

## 🔧 Debug-Logging wurde aktiviert

In `El Trabajante/src/main.cpp` wurde Debug-Logging im MQTT-Callback hinzugefügt (Zeilen 668-694):

```cpp
// DEBUG: Log topic comparison
LOG_INFO("System command topic check:");
LOG_INFO("  Received: " + topic);
LOG_INFO("  Expected: " + system_command_topic);
LOG_INFO("  Match: " + String(topic == system_command_topic ? "YES" : "NO"));

if (topic == system_command_topic) {
  LOG_INFO("Topic matched! Parsing JSON payload...");
  LOG_INFO("Payload: " + payload);
  
  // Parse JSON payload
  DynamicJsonDocument doc(256);
  DeserializationError error = deserializeJson(doc, payload);
  
  if (error) {
    LOG_ERROR("JSON parse error: " + String(error.c_str()));
    LOG_ERROR("Raw payload: " + payload);
    return;
  }
  
  String command = doc["command"].as<String>();
  LOG_INFO("Command parsed: '" + command + "'");
  // ...
}
```

---

## 🧪 Test-Durchführung

### 1. Wokwi starten
- Firmware wurde neu kompiliert mit Debug-Logging
- Wokwi muss neu gestartet werden, um neue Firmware zu laden

### 2. MQTT-Test-Command senden
```powershell
$json = '{"command":"onewire/scan","pin":4}'
& "C:\Program Files\mosquitto\mosquitto_pub.exe" -h localhost -t "kaiser/god/esp/ESP_00000001/system/command" -m $json
```

### 3. Erwartete Debug-Logs im Wokwi Serial

**Szenario A: Topic-Match fehlschlägt**
```
[INFO] MQTT message received: kaiser/god/esp/ESP_00000001/system/command
[INFO] System command topic check:
[INFO]   Received: kaiser/god/esp/ESP_00000001/system/command
[INFO]   Expected: kaiser/xyz/esp/ESP_00000001/system/command  ← UNTERSCHIED!
[INFO]   Match: NO
```

**Szenario B: JSON-Parsing fehlschlägt**
```
[INFO] MQTT message received: kaiser/god/esp/ESP_00000001/system/command
[INFO] System command topic check:
[INFO]   Match: YES
[INFO] Topic matched! Parsing JSON payload...
[INFO] Payload: {"command":"onewire/scan","pin":4}
[ERROR] JSON parse error: InvalidInput
```

**Szenario C: Erfolg**
```
[INFO] MQTT message received: kaiser/god/esp/ESP_00000001/system/command
[INFO] System command topic check:
[INFO]   Match: YES
[INFO] Topic matched! Parsing JSON payload...
[INFO] Payload: {"command":"onewire/scan","pin":4}
[INFO] Command parsed: 'onewire/scan'
[INFO] ╔════════════════════════════════════════╗
[INFO] ║  ONEWIRE SCAN COMMAND RECEIVED        ║
[INFO] ╚════════════════════════════════════════╝
[INFO] OneWire scan on GPIO 4
[INFO] Scanning OneWire bus...
[INFO] OneWire scan complete: 0 devices found
[INFO] Publishing scan result to: kaiser/god/esp/ESP_00000001/onewire/scan_result
[INFO] OneWire scan result published
```

---

## 📁 Relevante Dateien

| Datei | Beschreibung |
|-------|--------------|
| `El Trabajante/src/main.cpp` | MQTT-Callback mit Debug-Logging (Zeile 567-822) |
| `El Trabajante/src/utils/topic_builder.cpp` | Topic-Generierung (Zeile 134-140) |
| `El Trabajante/src/services/communication/mqtt_client.cpp` | MQTT-Client Implementation |
| `El Servador/god_kaiser_server/logs/god_kaiser.log` | Server-Logs (Heartbeats, etc.) |

---

## 🔍 Mögliche Ursachen (zu untersuchen)

1. **Topic-Mismatch**
   - `kaiser_id_` oder `esp_id_` in TopicBuilder stimmt nicht
   - Prüfen: Was gibt `TopicBuilder::buildSystemCommandTopic()` zurück?

2. **JSON-Parsing Problem**
   - PowerShell JSON-Escaping?
   - DynamicJsonDocument zu klein (256 bytes)?

3. **Früher Return im Callback**
   - Ein vorheriger Topic-Handler matcht und returned früher
   - Prüfen: Reihenfolge der `if (topic == ...)` Checks

---

## 📊 MQTT-Broker Status

**ESP Subscriptions (aus Broker-Log):**
```
ESP_00000001 0 kaiser/god/esp/ESP_00000001/system/command     ✅
ESP_00000001 0 kaiser/god/esp/ESP_00000001/config
ESP_00000001 0 kaiser/broadcast/emergency
ESP_00000001 0 kaiser/god/esp/ESP_00000001/actuator/+/command
ESP_00000001 0 kaiser/god/esp/ESP_00000001/actuator/emergency
ESP_00000001 0 kaiser/god/esp/ESP_00000001/zone/assign
ESP_00000001 0 kaiser/god/esp/ESP_00000001/subzone/assign
ESP_00000001 0 kaiser/god/esp/ESP_00000001/subzone/remove
ESP_00000001 0 kaiser/god/esp/ESP_00000001/sensor/+/command
```

**Server Subscriptions:**
```
god_kaiser_server 0 kaiser/god/esp/+/system/heartbeat
god_kaiser_server 1 kaiser/god/esp/+/sensor/+/data
god_kaiser_server 1 kaiser/god/esp/+/system/will
... (weitere)
```

---

## 🎯 Nächste Schritte

1. **Wokwi Serial-Output prüfen** nach Command-Versand
2. **Debug-Logs analysieren** - welches Szenario (A/B/C)?
3. **Problem beheben** basierend auf den Logs
4. **Test wiederholen** bis OneWire-Scan erfolgreich

---

## 💡 Wichtige Hinweise

- **Log-Level ist INFO** (LOG_DEBUG wird nicht angezeigt)
- **Wokwi-Tab muss aktiv sein** um Serial-Output zu sehen
- **ESP sendet Heartbeats alle 60s** - guter Indikator dass MQTT funktioniert
- **OneWire-Scan findet 0 Devices** ist ERWARTET (Wokwi hat keine DS18B20)

---

## 📝 Letzte Änderungen

1. NVS-Key-Fix in `config_manager.cpp`
2. Debug-Logging in `main.cpp` MQTT-Callback
3. Einrückungs-Fix im System-Command-Handler
4. Neukompilierung: `pio run -e wokwi_simulation` ✅
