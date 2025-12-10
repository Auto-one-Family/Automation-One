# 🔧 **BACKEND-ÄNDERUNGEN ERFORDERLICH**

## **📋 ÜBERSICHT**

Basierend auf der Frontend-Analyse müssen folgende Backend-Änderungen implementiert werden, um die vollständige Integration zu gewährleisten.

---

## **❌ FEHLENDE COMMANDS**

### **1. `delete_esp` Command**

**Datei:** `src/main.cpp`  
**Position:** In `handleSystemCommand()` nach Zeile 2220 hinzufügen

```cpp
else if (command == "delete_esp") {
  DEBUG_PRINT("[System] Delete ESP command received");

  // Alle Sensoren entfernen
  for (int i = 0; i < MAX_SENSORS; i++) {
    if (sensor_configs[i].active) {
      removeSensor(sensor_configs[i].gpio);
    }
  }

  // Alle Aktoren entfernen
  for (int i = 0; i < MAX_ACTUATORS; i++) {
    if (actuator_configs[i].active) {
      // Actuator removal logic
      actuator_configs[i].active = false;
    }
  }

  // Konfiguration zurücksetzen
  preferences.begin("sensor_config", false);
  preferences.clear();
  preferences.end();

  preferences.begin("zone_config", false);
  preferences.clear();
  preferences.end();

  // Bestätigung senden
  StaticJsonDocument<256> ack_doc;
  ack_doc["esp_id"] = esp_id;
  ack_doc["command"] = "delete_esp";
  ack_doc["status"] = "completed";
  ack_doc["timestamp"] = millis();

  String ack_message;
  ArduinoJson::serializeJson(ack_doc, ack_message);

  String ack_topic = "kaiser/" + kaiser_zone.kaiser_id + "/esp/" + esp_id + "/response";
  mqtt_client.publish(ack_topic.c_str(), ack_message.c_str());

  // ESP neu starten
  delay(1000);
  ESP.restart();
}
```

### **2. `status_request` Command**

**Datei:** `src/main.cpp`  
**Position:** In `handleSystemCommand()` nach Zeile 2220 hinzufügen

```cpp
else if (command == "status_request") {
  DEBUG_PRINT("[System] Status request received");

  // Sofortigen Status senden
  sendStatusUpdate();
  sendHeartbeat();

  // Bestätigung senden
  StaticJsonDocument<256> ack_doc;
  ack_doc["esp_id"] = esp_id;
  ack_doc["command"] = "status_request";
  ack_doc["status"] = "completed";
  ack_doc["timestamp"] = millis();

  String ack_message;
  ArduinoJson::serializeJson(ack_doc, ack_message);

  String ack_topic = "kaiser/" + kaiser_zone.kaiser_id + "/esp/" + esp_id + "/response";
  mqtt_client.publish(ack_topic.c_str(), ack_message.c_str());
}
```

---

## **✅ FRONTEND-KORREKTUREN ABGESCHLOSSEN**

### **1. I2C Pin-Korrektur** ✅

- **Vorher:** `i2c: { sda: 5, scl: 6 }`
- **Nachher:** `i2c: { sda: 4, scl: 5 }` (basierend auf `xiao_config.h`)

### **2. Verfügbare Pins korrigiert** ✅

- **Vorher:** `[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 20, 21]`
- **Nachher:** `[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 21]` (basierend auf `xiao_config.h`)

### **3. MQTT Topic-Struktur korrigiert** ✅

- **Vorher:** `kaiser/pi_zero_edge_controller/esp/{espId}/config`
- **Nachher:** `kaiser/{kaiserId}/esp/{espId}/config`

---

## **🎯 MQTT TOPIC-STRUKTUR**

### **Frontend → Backend Commands:**

```
kaiser/{kaiserId}/esp/{espId}/system/command
```

### **Backend → Frontend Responses:**

```
kaiser/{kaiserId}/esp/{espId}/response
```

### **ESP Configuration:**

```
kaiser/{kaiserId}/esp/{espId}/config
```

---

## **📊 VALIDIERUNG**

### **Pin-Validierung für ESP32-C3 XIAO:**

- **Verfügbare Pins:** `[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 21]`
- **I2C Pins:** `SDA=4, SCL=5`
- **Reservierte Pins:** `[0]` (Boot Pin)
- **Input-Only Pins:** `[]` (keine)

### **Board-Typ-Unterstützung:**

- ✅ ESP32_DEVKIT (WROOM-32)
- ✅ ESP32_C3_XIAO (XIAO)

---

## **🚀 IMPLEMENTIERUNGSSTATUS**

### **Frontend:** ✅ **VOLLSTÄNDIG IMPLEMENTIERT**

- [x] I2C Pin-Korrektur
- [x] Verfügbare Pins korrigiert
- [x] MQTT Topic-Struktur angepasst
- [x] delete_esp Command vorbereitet
- [x] status_request Command vorbereitet
- [x] Board-Typ-Validierung
- [x] Rückwärtskompatibilität

### **Backend:** ❌ **ERFORDERLICHE ÄNDERUNGEN**

- [ ] `delete_esp` Command implementieren
- [ ] `status_request` Command implementieren
- [ ] Response-Topics für Commands hinzufügen

---

## **📝 NÄCHSTE SCHRITTE**

1. **Backend-Entwickler:** Implementieren Sie die fehlenden Commands
2. **Testen:** Überprüfen Sie die MQTT-Kommunikation
3. **Validierung:** Testen Sie die Pin-Konfiguration
4. **Integration:** Vollständige End-to-End-Tests

**Das Frontend ist bereit für die Backend-Integration!** 🎯
