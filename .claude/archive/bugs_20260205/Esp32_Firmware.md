# ESP32 Firmware - Bug-Dokumentation

> **Zweck:** Zentrale Bug-Dokumentation für ESP32 Firmware (C++)
> **Regel:** Neue Bugs AM ENDE ergänzen, bestehende nicht ändern

---

## Regeln für Bug-Einträge

1. **NIEMALS Datei neu schreiben** - Immer nur ergänzen (am Ende)
2. **Bestehende Bugs IGNORIEREN** - Nicht ändern (außer explizit aufgefordert)
3. **AUSNAHME:** Neuer Bug hängt mit bestehendem zusammen → Bei relevantem Bug ergänzen
4. **Bug-ID fortlaufend** - Nächste freie Nummer verwenden
5. **Datum immer angeben** - Wann wurde der Bug entdeckt?

---

## Bug-Einträge

<!--
Template für neue Bugs:

### Bug [ID]: [Kurztitel]

**Entdeckt:** [YYYY-MM-DD]
**Status:** offen | in_arbeit | behoben
**Schwere:** kritisch | hoch | mittel | niedrig

**Symptom:**
[Was passiert?]

**Ursache:**
[Warum passiert es?]

**Lösung:**
[Wie wurde es behoben? / Workaround]

**Betroffene Dateien:**
- `pfad/zur/datei.cpp`

---
-->

<!-- Neue Bugs hier unten ergänzen -->

### Bug [001]: Race-Condition bei ESP32 Startup (Server erhält Nachrichten vor Heartbeat-Registrierung)

**Entdeckt:** 2026-02-02
**Status:** offen
**Schwere:** hoch

**Symptom:**
- 50+ Fehler [5001] "ESP device not found" in 1 Sekunde nach ESP-Connect
- Server-Handler schlagen fehl: `actuator_handler.py:106`, `zone_ack_handler.py:122`, `error_handler.py:128`
- Alle MQTT-Nachrichten werden abgelehnt bis der Heartbeat verarbeitet wurde

**Ursache:**
ESP32 sendet nach MQTT-Connect sofort mehrere Nachrichten OHNE auf Heartbeat-Registrierung zu warten:

```
Zeitliche Abfolge (FALSCH - aktuell):
┌────────────────────────────────────────────────────────────────┐
│ T+0ms   │ ESP: MQTT connected!                                 │
│ T+10ms  │ ESP: publishHeartbeat() → Server empfängt           │
│ T+15ms  │ ESP: publishActuatorStatus() → Server empfängt      │
│ T+20ms  │ ESP: Zone ACK sendet → Server empfängt              │
│ T+25ms  │ ESP: Config Response sendet → Server empfängt       │
│ T+50ms  │ Server: Heartbeat DB-Write fertig                   │
│         │        → ESP erst jetzt in DB bekannt!              │
└────────────────────────────────────────────────────────────────┘
Ergebnis: Nachrichten bei T+15..25ms scheitern mit [5001]
```

**Code-Lokation:**
1. **main.cpp:282** - `configureActuator()` ruft `publishActuatorStatus()` auf
2. **main.cpp:697-700** - Initial Heartbeat wird gesendet, aber keine Wartezeit
3. **main.cpp:1220** - Zone ACK wird sofort gesendet nach Zone Assignment

**Root Cause im Detail:**
- `main.cpp:699`: `mqttClient.publishHeartbeat(true)` sendet Heartbeat
- Aber MQTT ist fire-and-forget - ESP wartet nicht auf Server-Verarbeitung
- Bei NVS-gespeicherten Actuators wird `publishActuatorStatus()` aufgerufen
- Bei empfangenem Zone-Assignment wird Zone-ACK sofort gesendet
- Server braucht ~50-100ms für Heartbeat-DB-Operation

**Lösung (Vorschlag):**

**Option A: ESP-seitig - Startup-Delay nach Heartbeat**
```cpp
// main.cpp nach Zeile 700:
mqttClient.publishHeartbeat(true);
LOG_INFO("Initial heartbeat sent for ESP registration");
delay(500);  // Warte 500ms für Server-Registrierung
// DANN erst weitere Publishes erlauben
```

**Option B: ESP-seitig - Heartbeat-ACK abwarten**
```cpp
// Warte auf Heartbeat-ACK bevor andere Nachrichten gesendet werden
bool heartbeat_acked = false;
unsigned long start = millis();
while (!heartbeat_acked && millis() - start < 5000) {
    mqttClient.loop();
    // Check if ACK received (needs flag in callback)
}
```

**Option C: Server-seitig - Graceful Handling**
```python
# In jedem Handler: Bei unbekanntem ESP nicht ERROR sondern WARNING
if not esp:
    logger.warning(f"Message from unregistered device: {esp_id} - may be pre-heartbeat")
    return True  # Don't fail - will be processed after heartbeat
```

**Betroffene Dateien:**
- `El Trabajante/src/main.cpp` (Zeilen 697-700, ~1220)
- `El Trabajante/src/services/actuator/actuator_manager.cpp` (Zeile 282)
- `El Servador/god_kaiser_server/src/mqtt/handlers/actuator_handler.py`
- `El Servador/god_kaiser_server/src/mqtt/handlers/zone_ack_handler.py`

---

### Bug [002]: ESP32 sendet leere MQTT-Payloads (Invalid JSON)

**Entdeckt:** 2026-02-02
**Status:** offen
**Schwere:** mittel

**Symptom:**
- Server-Log: `Invalid JSON payload on topic ...: Expecting value: line 1 column 1 (char 0)`
- Betroffene Topics: `config_response`, `zone/ack`, `system/heartbeat`
- Tritt intermittierend auf (nicht bei jeder Nachricht)

**Ursache:**
ESP32 führt MQTT-Publish mit leerem Payload aus. Mögliche Ursachen:

1. **JSON-Serialisierung schlägt fehl** → String bleibt leer
2. **Memory-Pressure** → String-Allokation schlägt fehl
3. **Race-Condition** → Payload wird verwendet bevor vollständig konstruiert

**Evidence aus Server-Log:**
```
[18:24:07] Invalid JSON payload on topic kaiser/god/esp/ESP_472204/config_response
[18:24:26] Invalid JSON payload on topic kaiser/god/esp/ESP_472204/system/heartbeat
[20:49:14] Invalid JSON payload on topic kaiser/god/esp/ESP_472204/zone/ack
```

**Verdächtige Code-Stellen:**

1. **config_response.cpp:78-80**:
   ```cpp
   String json;
   serializeJson(doc, json);  // Kann fehlschlagen wenn doc zu groß
   return json;
   ```

2. **main.cpp:1218-1220** (Zone ACK):
   ```cpp
   String ack_payload;
   serializeJson(ack_doc, ack_payload);  // Keine Validierung ob erfolgreich
   mqttClient.publish(ack_topic, ack_payload);  // ack_payload könnte leer sein
   ```

3. **mqtt_client.cpp:498**:
   ```cpp
   bool success = mqtt_.publish(topic.c_str(), payload.c_str(), qos == 1);
   // Keine Prüfung ob payload leer ist
   ```

**Lösung (Vorschlag):**

**Option A: Payload-Validierung vor Publish**
```cpp
// In mqtt_client.cpp:publish()
bool MQTTClient::publish(const String& topic, const String& payload, uint8_t qos) {
    // NEU: Leere Payloads verhindern
    if (payload.length() == 0) {
        LOG_ERROR("Attempted to publish empty payload to: " + topic);
        return false;
    }
    // ... Rest der Methode
}
```

**Option B: JSON-Serialisierung prüfen**
```cpp
// In main.cpp Zone ACK:
String ack_payload;
size_t written = serializeJson(ack_doc, ack_payload);
if (written == 0 || ack_payload.length() == 0) {
    LOG_ERROR("JSON serialization failed for Zone ACK");
    return;
}
mqttClient.publish(ack_topic, ack_payload);
```

**Option C: Memory-Check vor Serialisierung**
```cpp
// Vor großen JSON-Operationen:
if (ESP.getFreeHeap() < 10000) {
    LOG_ERROR("Low memory - skipping MQTT publish");
    return;
}
```

**Betroffene Dateien:**
- `El Trabajante/src/services/communication/mqtt_client.cpp` (Zeile 498)
- `El Trabajante/src/services/config/config_response.cpp` (Zeilen 78-80)
- `El Trabajante/src/main.cpp` (Zeilen 1218-1220)

---
