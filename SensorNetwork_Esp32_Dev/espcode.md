# 🔍 ESP32 First-Boot-Analyse: Vollständige Entwickler-Dokumentation

## 📋 Executive Summary

**Vollständige Rekonstruktion des ESP32-First-Boot-Ablaufs von Power-On bis OPERATIONAL State mit allen Netzwerkverbindungen, internen Zustandsübergängen und Server-Kommunikationen.**

---

## 🚀 **PHASE 1: System-Initialisierung (Boot-Sequenz)**

### **1.1 Hardware-Initialisierung**

**FRAGE 1.1.1: setup()-Funktion Start**
- **Datei:** `src/main.cpp` Zeile 5700-5822
- **Hardware-Module initialisiert:**
  1. Serial.begin(115200) - Zeile 5701
  2. GPIO Safe Mode - initializeAllPinsToSafeMode() - Zeile 5720
  3. Enhanced Error Handling Components - Zeilen 5726-5757
  4. WebConfigServer - Zeile 5779
- **Reihenfolge:** Serial → GPIO Safe Mode → Error Handling → Config Loading → ESP ID Generation → Web Server → WiFi Connection
- **Hardware-Unterschiede:** ESP32 Dev (24 Pins) vs XIAO ESP32-C3 (12 Pins) - automatisch erkannt via ESP32_DEV_MODE

**FRAGE 1.1.2: GPIO Safe Mode Initialisierung**
- **Aufruf:** Zeile 5720 in setup()
- **Implementierung:** initializeAllPinsToSafeMode() - alle verfügbaren GPIOs auf INPUT_PULLUP
- **Reservierte GPIOs:** I2C Pins (SDA/SCL), Boot Button, LED Pin
- **Code-Nachweis:** Safe Mode System in advanced_features.cpp

**FRAGE 1.1.3: ESP-ID-Generierung**
- **Generierung:** Zeile 5767: `esp_id = "ESP_" + String((uint32_t)ESP.getEfuseMac(), HEX)`
- **Speicherung:** RAM (globale Variable), persistent in NVS via WiFiConfig
- **Persistenz:** Wird bei jedem Boot neu generiert, aber in NVS gespeichert für Wiederherstellung
- **Code-Nachweis:** main.cpp Zeile 5767

### **1.2 Configuration Loading**

**FRAGE 1.2.1: NVS Configuration Loading**
- **Aufruf:** Zeile 5762: loadWiFiConfigFromPreferences()
- **Preferences-Keys gelesen:**
  - "ssid", "password", "server_address", "mqtt_port", "http_port"
  - "username", "password_auth", "esp_name", "friendly", "esp_zone"
  - "configured", "conn", "http_p", "sys_st", "web_act"
- **Default-Values:** Server: 192.168.0.198, MQTT: 1883, HTTP: 80
- **Code-Nachweis:** web_config_server.cpp Zeilen 683-746

**FRAGE 1.2.2: WiFiConfig Structure Population**
- **Felder aus NVS:** Alle oben genannten Keys werden geladen
- **Legacy-Synchronisierung:** 
  - mqtt_server = server_address
  - mqtt_user = username
  - mqtt_password = password_auth
  - pi_server_url = "http://" + server_address + ":" + http_port
- **Code-Nachweis:** wifi_config.h Zeilen 47-137

**FRAGE 1.2.3: Configuration Validation**
- **Validierung:** WebConfigServer::validateConfigurationData() - Zeilen 289-338
- **Validierungen:** Required fields, IP format, port ranges (1-65535)
- **Bei ungültiger Konfiguration:** HTTP 400 Error mit spezifischer Fehlermeldung
- **Code-Nachweis:** web_config_server.cpp Zeilen 289-347

### **1.3 State Machine Initialisierung**

**FRAGE 1.3.1: Initial State Assignment**
- **Initialer State:** STATE_BOOT (Zeile 116 in main.cpp)
- **State-Setzung:** Automatisch beim System-Start
- **State-History-Tracker:** Nein, nur current_state Variable
- **Code-Nachweis:** main.cpp Zeile 116 (enum SystemState)

**FRAGE 1.3.2: State Transition Logic**
- **STATE_BOOT → STATE_WIFI_SETUP:** Wenn WiFi-Verbindung fehlschlägt (Zeile 5814)
- **Zentrale Transition-Funktion:** Nein, direkte Zuweisung in setup()
- **getSystemStateString():** Wird für Logging verwendet (Zeile 5818)
- **Code-Nachweis:** main.cpp Zeilen 5812-5818

---

## 📡 **PHASE 2: WiFi-Verbindungsaufbau**

### **2.1 Configuration Check**

**FRAGE 2.1.1: WiFi Configuration Validation**
- **Prüfung:** Zeile 2189: `!wifi_config.configured || wifi_config.ssid.length() == 0`
- **Erforderliche Felder:** ssid, password, server_address, username, password_auth
- **Bei wifi_config.configured == false:** Startet WebConfigPortal
- **Code-Nachweis:** main.cpp Zeilen 2189-2190

### **2.2 Unconfigured Path: Captive Portal**

**FRAGE 2.2.1: WebConfigServer Start**
- **Aufruf:** Zeile 2195: web_config_server->startConfigPortal()
- **WiFi-Mode:** WIFI_AP_STA (Zeile 23 in web_config_server.cpp)
- **AP-SSID:** "ESP32_Setup_" + esp_id.substring(4) (Zeile 16)
- **Passwort:** "12345678" (Zeile 17)
- **Code-Nachweis:** web_config_server.cpp Zeilen 20-51

**FRAGE 2.2.2: DNS Server Configuration**
- **DNS-Server:** Zeile 30: dnsServer.start(53, "*", WiFi.softAPIP())
- **Port:** 53 (Standard DNS)
- **IP-Adresse:** WiFi.softAPIP() (meist 192.168.4.1)
- **Code-Nachweis:** web_config_server.cpp Zeile 30

**FRAGE 2.2.3: HTTP Server Endpoints**
- **Registrierte Endpunkte:**
  - GET / → handleRoot() (Zeile 32)
  - POST /save → handleSave() (Zeile 33)
  - POST /reset → handleReset() (Zeile 34)
  - GET /status → handleStatus() (Zeile 35)
  - GET /test-mqtt → handleTestMQTT() (Zeile 38)
  - GET /test-pi → handleTestPi() (Zeile 39)
  - GET /scan-network → handleScanNetwork() (Zeile 40)
  - GET /discover-services → handleDiscoverServices() (Zeile 41)
- **Code-Nachweis:** web_config_server.cpp Zeilen 32-43

**FRAGE 2.2.4: User Configuration Flow**
- **User verbindet sich:** Mit ESP32_Setup_XXXXXX
- **Navigation:** Zu 192.168.4.1
- **POST /save Prozess:**
  1. Validierung aller Felder (Zeilen 114-167)
  2. WiFiConfig Objekt erstellen (Zeilen 170-181)
  3. Speicherung in NVS via saveConfiguration() (Zeile 183)
  4. ESP.restart() nach 500ms Delay (Zeile 200)
- **NVS-Keys gespeichert:** Alle oben genannten Keys
- **Code-Nachweis:** web_config_server.cpp Zeilen 100-201

**FRAGE 2.2.5: Service Discovery Integration**
- **Discover Services Button:** Ja, verfügbar
- **GET /discover-services:** Zeilen 500-519
- **IP-Scan:** scanNetworkForPiDevices() - Zeilen 82-149
- **mDNS Verwendung:** discoverRaspberryPi() - Zeilen 19-80
- **Rückgabe:** JSON Array mit gefundenen Services
- **Code-Nachweis:** web_config_server.cpp Zeilen 500-519

### **2.3 Configured Path: WiFi Connection**

**FRAGE 2.3.1: WiFi.begin() Call**
- **Aufruf:** Zeile 2223: WiFi.begin(wifi_config.ssid.c_str(), wifi_config.password.c_str())
- **Funktion:** connectToWiFi() - Zeile 2188
- **WiFi-Mode:** WIFI_STA (automatisch)
- **Timeout:** 20 Versuche × 500ms = 10 Sekunden (Zeilen 2226-2239)
- **Code-Nachweis:** main.cpp Zeilen 2223-2239

**FRAGE 2.3.2: Connection Monitoring**
- **Überwachung:** Polling alle 500ms (Zeile 2230)
- **Maximale Wartezeit:** 10 Sekunden (20 × 500ms)
- **Bei Timeout:** Portal bleibt offen für Troubleshooting
- **Code-Nachweis:** main.cpp Zeilen 2226-2239

**FRAGE 2.3.3: WiFi Connected Event**
- **Event-Handler:** Kein spezieller Handler, direkte Prüfung
- **Aktionen nach WiFi-Connected:**
  1. IP-Adresse abrufen (Zeile 2243)
  2. NTP-Synchronisation starten (Zeilen 2247-2256)
  3. State-Transition zu STATE_WIFI_CONNECTED (Zeile 2244)
- **Code-Nachweis:** main.cpp Zeilen 2241-2258

**FRAGE 2.3.4: NTP Time Synchronization**
- **Automatischer Start:** Ja, nach WiFi-Verbindung (Zeile 2248)
- **NTP-Server:** pool.ntp.org (Standard)
- **Timeout:** 5 Sekunden (Standard)
- **Bei NTP-Fehler:** Fallback zu millis() + Boot-Timestamp
- **Code-Nachweis:** main.cpp Zeilen 2247-2256

### **2.4 State Transition: WIFI_SETUP → WIFI_CONNECTED**

**FRAGE 2.4.1: State Change Logic**
- **Trigger:** WiFi.status() == WL_CONNECTED (Zeile 2241)
- **Zentrale setState() Funktion:** Nein, direkte Zuweisung
- **getSystemStateString():** Wird für Logging verwendet
- **Code-Nachweis:** main.cpp Zeile 2244

**FRAGE 2.4.2: WebServer Management**
- **WebServer nach WiFi-Connected:** Bleibt aktiv für MQTT-Troubleshooting
- **Stop-Bedingung:** Erst bei STATE_OPERATIONAL + mqtt_client.connected()
- **Exakte Logik:** Zeilen 5848-5853 in loop()
- **Code-Nachweis:** main.cpp Zeilen 5848-5853

---

## 🔌 **PHASE 3: MQTT-Verbindungsaufbau**

### **3.1 MQTT Client Initialisierung**

**FRAGE 3.1.1: PubSubClient Setup**
- **setServer() Aufruf:** Zeile 4763: mqtt_client.setServer(mqtt_server.c_str(), mqtt_port)
- **Parameter:** server_address, mqtt_port (aus WiFiConfig)
- **setCallback():** Zeile 4764: mqtt_client.setCallback(onMqttMessage)
- **Callback-Funktion:** onMqttMessage() - Zeile 239
- **Code-Nachweis:** main.cpp Zeilen 4763-4764

**FRAGE 3.1.2: Connection Parameters**
- **Client-ID:** "esp32_" + generateClientId() (Zeile 4767)
- **Clean-Session:** true (Standard)
- **Keep-Alive:** 60 Sekunden (Standard)
- **Code-Nachweis:** main.cpp Zeile 4767

**FRAGE 3.1.3: Authentication**
- **MQTT-Authentifizierung:** Ja, wenn konfiguriert
- **Username:** wifi_config.mqtt_user (Zeile 4775)
- **Password:** wifi_config.mqtt_password (Zeile 4777)
- **Code-Nachweis:** main.cpp Zeilen 4774-4780

### **3.2 Connection Attempt**

**FRAGE 3.2.1: connectToMqtt() Function**
- **Implementierung:** main.cpp Zeilen 4758-4837
- **Schritte:**
  1. setServer() (Zeile 4763)
  2. setCallback() (Zeile 4764)
  3. connect() mit Parametern (Zeilen 4774-4780)
  4. Topic-Subscriptions (Zeilen 4786-4809)
- **Retry-Logic:** MQTTConnectionManager (exponential backoff)
- **Code-Nachweis:** main.cpp Zeilen 4758-4837

**FRAGE 3.2.2: Connection Manager Integration**
- **MQTTConnectionManager-Instanz:** Ja, mqtt_manager (Zeile 44)
- **Initialisierung:** Zeile 5727 in setup()
- **attemptConnection():** Wird in SystemRecovery verwendet
- **Exponential Backoff:** Implementiert in MQTTConnectionManager
- **Code-Nachweis:** main.cpp Zeilen 44, 5727

**FRAGE 3.2.3: Connection Result Handling**
- **Bei erfolgreicher Verbindung:**
  - State-Transition zu STATE_OPERATIONAL (Zeile 4813)
  - Topic-Subscriptions sofort (Zeilen 4786-4809)
  - System-Initialisierung via initializeSystem() (Zeile 4812)
- **Bei Verbindungsfehler:**
  - Retry-Logic via MQTTConnectionManager
  - Error-Logging
  - Bleibt in STATE_WIFI_CONNECTED für Troubleshooting
- **Code-Nachweis:** main.cpp Zeilen 4782-4837

### **3.3 Topic Subscriptions**

**FRAGE 3.3.1: Subscription Timing**
- **Timing:** Sofort nach MQTT-Connect (Zeilen 4786-4809)
- **subscribeToTopics() Funktion:** Nein, direkte Subscriptions
- **Code-Nachweis:** main.cpp Zeilen 4786-4809

**FRAGE 3.3.2: Basis-Topic-Subscriptions**
- **Basis-Topics:**
  - "esp32_{esp_id}/system/command" (Zeile 4786)
  - "esp32_{esp_id}/actuator/+/command" (Zeile 4790)
  - "esp32_{esp_id}/emergency" (Zeile 4794)
  - "esp32_{esp_id}/ui_schema/update" (Zeile 4798)
  - "esp32_{esp_id}/ui_capabilities/request" (Zeile 4802)
  - "esp32_{esp_id}/ui_test/run" (Zeile 4807)
- **Code-Nachweis:** main.cpp Zeilen 4786-4809

**FRAGE 3.3.3: Kaiser-Hierarchie-Topic-Subscriptions**
- **Kaiser-Topics:** subscribeToKaiserTopics() - Zeilen 4839-4855
- **Topics:**
  - "kaiser/{kaiser_id}/esp/{esp_id}/zone/config"
  - "kaiser/{kaiser_id}/esp/{esp_id}/system/command"
  - "kaiser/{kaiser_id}/esp/{esp_id}/response"
  - "kaiser/{kaiser_id}/esp/{esp_id}/commands"
- **kaiser_id Bestimmung:** getKaiserId() - dynamisch via Server Discovery
- **Code-Nachweis:** main.cpp Zeilen 4839-4855

**FRAGE 3.3.4: Dynamic Topic Building**
- **buildTopic() Funktionen:** Ja, in esp32_dev_config.h
- **Definiert:** esp32_dev_config.h Zeilen 75-87
- **Beispiel:** buildSensorTopic(gpio), buildSpecialTopic()
- **Code-Nachweis:** esp32_dev_config.h Zeilen 75-87

### **3.4 State Transition: MQTT_CONNECTED → OPERATIONAL**

**FRAGE 3.4.1: Transition Trigger**
- **Bedingung:** initializeSystem() erfolgreich (Zeile 4812)
- **Topic-Subscriptions:** Müssen erfolgreich sein
- **Configuration-Complete-Flag:** master_zone.assigned
- **Code-Nachweis:** main.cpp Zeilen 4812-4821

**FRAGE 3.4.2: WebServer Shutdown**
- **WebServer-Stop:** Bei STATE_OPERATIONAL + mqtt_client.connected()
- **Timing:** In loop() - Zeilen 5848-5853
- **Exakte Bedingung:** current_state == STATE_OPERATIONAL && mqtt_client.connected()
- **Code-Nachweis:** main.cpp Zeilen 5848-5853

---

## 📤 **PHASE 4: Initial Status Broadcasting**

### **4.1 Status Message Construction**

**FRAGE 4.1.1: sendStatusUpdate() Function**
- **Erster Aufruf:** In loop() alle 30 Sekunden (Zeile 5908)
- **Implementierung:** main.cpp Zeilen 4914-4964
- **JSON-Felder:**
  - esp_id, mac, state, uptime, free_heap, wifi_rssi
  - wifi_connected, wifi_reconnects, mqtt_reconnects
  - broker_ip, broker_port, server_address, http_port
  - system_state, webserver_active
  - zones (kaiser_id, master_zone_id, etc.)
- **Code-Nachweis:** main.cpp Zeilen 4914-4964

**FRAGE 4.1.2: ESP Configuration Broadcast**
- **sendESPConfigurationToFrontend():** Ja, wird aufgerufen
- **Unterschied:** Spezifische ESP-Konfiguration vs. allgemeiner Status
- **Topic:** "esp32_{esp_id}/config/frontend"
- **Message-Format:** JSON mit ESP-spezifischen Daten
- **Code-Nachweis:** main.cpp Zeile 264 (Declaration)

**FRAGE 4.1.3: System State Inclusion**
- **system_state:** Ja, wird inkludiert (Zeile 4938)
- **getSystemStateString():** Wird verwendet für String-Konvertierung
- **webserver_active Flag:** Ja, wird gesetzt (Zeile 4939)
- **Code-Nachweis:** main.cpp Zeilen 4938-4939

### **4.2 Status Topics**

**FRAGE 4.2.1: Status Topic Selection**
- **Basis-Topic:** "esp32_{esp_id}/status"
- **Kaiser-Topic:** "kaiser/{kaiser_id}/esp/{esp_id}/status"
- **Beide gleichzeitig:** Ja, je nach Konfiguration
- **Code-Nachweis:** sendEnhancedStatusUpdate() - Zeilen 6510-6590

### **4.3 Heartbeat Initialization**

**FRAGE 4.3.1: Heartbeat Timer**
- **Heartbeat-Timer:** Ja, alle 30 Sekunden (Zeile 5908)
- **Interval:** 30 Sekunden
- **Timer-Start:** In loop() nach MQTT-Verbindung
- **Code-Nachweis:** main.cpp Zeile 5908

**FRAGE 4.3.2: Heartbeat Message**
- **Topic:** "esp32_{esp_id}/heartbeat"
- **Message-Format:** JSON mit Status-Informationen
- **Daten:** esp_id, timestamp, uptime, system_state
- **Code-Nachweis:** main.cpp Zeile 258 (Declaration)

---

## 🔄 **PHASE 5: Main Loop Integration**

### **5.1 Loop Structure**

**FRAGE 5.1.1: loop() Function Organization**
- **Struktur:** main.cpp Zeilen 5824-5950
- **State-Switch-Statement:** Nein, direkte Prüfungen
- **Aktionen pro State:** Via if-Statements basierend auf current_state
- **Code-Nachweis:** main.cpp Zeilen 5824-5950

**FRAGE 5.1.2: WebServer Handling in Loop**
- **handleClient() Aufruf:** Zeile 5844: web_config_server->handleClient()
- **Bedingungen:** Nur wenn config_portal_active == true
- **WebServer-Stop:** Bei STATE_OPERATIONAL + mqtt_client.connected()
- **Code-Nachweis:** main.cpp Zeilen 5843-5874

**FRAGE 5.1.3: MQTT Loop Integration**
- **mqtt_client.loop():** Zeile 5901: mqtt_client.loop()
- **Bedingung:** Nur wenn mqtt_client.connected()
- **Connection-Check:** Automatisch via mqtt_client.connected()
- **Code-Nachweis:** main.cpp Zeile 5901

### **5.2 State-Specific Actions**

**FRAGE 5.2.1: STATE_BOOT Actions**
- **Aktionen:** Nur in setup(), nicht in loop()
- **Configuration-Load:** Ja, in setup()
- **Hardware-Init:** Ja, in setup()
- **Transition:** Zu STATE_WIFI_SETUP oder STATE_WIFI_CONNECTED
- **Code-Nachweis:** main.cpp setup() Funktion

**FRAGE 5.2.2: STATE_WIFI_SETUP Actions**
- **Aktionen:** WebServer-Handling, WiFi-Connection-Attempts
- **WebServer-Handling:** Ja, web_config_server->handleClient()
- **WiFi-Connection-Attempts:** Ja, automatische Versuche
- **Timeout-Handling:** Ja, 5 Minuten Timeout
- **Code-Nachweis:** main.cpp Zeilen 5843-5874

**FRAGE 5.2.3: STATE_OPERATIONAL Actions**
- **Aktionen:** Sensor-Readings, Actuator-Control, Status-Updates
- **Sensor-Readings:** Ja, via performMeasurements()
- **Actuator-Control:** Ja, via AdvancedActuatorSystem
- **Status-Updates:** Ja, alle 30 Sekunden
- **Code-Nachweis:** main.cpp Zeilen 5900-5950

---

## 🔍 **PHASE 6: Error Handling & Recovery**

### **6.1 Error Tracking**

**FRAGE 6.1.1: Error Logging System**
- **logSystemError() Funktion:** Ja, sendErrorAlert() - Zeile 271
- **Verwendung:** Bei verschiedenen Fehlern
- **Error-Kategorien:** ERROR_WIFI, ERROR_MQTT, ERROR_PI, etc.
- **Code-Nachweis:** main.cpp Zeile 271

**FRAGE 6.1.2: Error MQTT Topics**
- **Fehler via MQTT:** Ja, sendErrorAlert()
- **Topic:** "kaiser/{kaiser_id}/esp/{esp_id}/alert"
- **Message-Format:** JSON mit error_type, error_message, context
- **Code-Nachweis:** main.cpp Zeile 271

### **6.2 Auto-Recovery**

**FRAGE 6.2.1: WiFi Auto-Recovery**
- **Bei WiFi-Disconnect:** Automatischer Reconnect via WiFi.begin()
- **Automatic reconnect:** Ja, in loop()
- **Timeout:** 10 Sekunden
- **Fallback:** Captive Portal bei dauerhaftem Fehler
- **Code-Nachweis:** main.cpp Zeilen 5864-5873

**FRAGE 6.2.2: MQTT Auto-Recovery**
- **Bei MQTT-Disconnect:** MQTTConnectionManager verwendet
- **Exponential Backoff:** Ja, implementiert
- **Max-Retries:** Konfigurierbar
- **Code-Nachweis:** MQTTConnectionManager Klasse

---

## 🌐 **PHASE 7: Network Discovery & Service Testing**

### **7.1 mDNS Discovery**

**FRAGE 7.1.1: mDNS Initialization**
- **MDNS.begin() Aufruf:** Zeile 23 in network_discovery.cpp
- **Hostname:** "esp32_discovery"
- **Services published:** HTTP services
- **Code-Nachweis:** network_discovery.cpp Zeile 23

**FRAGE 7.1.2: Pi-Server Discovery**
- **Automatischer Aufruf:** Ja, in setup() Zeile 5800
- **Hostname-Query:** "raspberrypi.local"
- **Code-Nachweis:** main.cpp Zeile 5800

### **7.2 Pi Circuit Breaker**

**FRAGE 7.2.1: Circuit Breaker Initialization**
- **PiCircuitBreaker-Instanz:** Ja, pi_breaker (Zeile 45)
- **Initialisierung:** Zeile 5728 in setup()
- **Parameter:** failure_threshold=3, timeout=30000ms
- **Code-Nachweis:** main.cpp Zeilen 45, 5728

**FRAGE 7.2.2: Pi Health Checks**
- **Automatische Health-Checks:** Ja, alle 5 Minuten
- **Interval:** 300000ms (5 Minuten)
- **Endpoint:** GET /api/health
- **Code-Nachweis:** main.cpp Zeilen 5914-5924

---

## 📊 **PHASE 8: Timing & Performance**

### **8.1 Boot Time Analysis**

**FRAGE 8.1.1: Time Measurements**
- **Boot-Time gemessen:** Ja, via millis()
- **Timestamps:** Für jede Phase in Serial-Output
- **Serial-Output:** Mit detaillierten Timings
- **Code-Nachweis:** main.cpp setup() Funktion

### **8.2 Memory Analysis**

**FRAGE 8.2.1: Heap Monitoring**
- **ESP.getFreeHeap() Aufruf:** Ja, in sendStatusUpdate()
- **Wann:** Alle 30 Sekunden
- **Memory-Warnings:** Ja, bei Low-Heap
- **Code-Nachweis:** main.cpp Zeile 4922

---

## 📝 **ANALYSE-ERGEBNISSE: Zusammenfassung**

### **1. Vollständiger Ablaufplan mit Zeilennummern**

```
Power-On → setup() (5700)
├── Serial.begin(115200) (5701)
├── initializeAllPinsToSafeMode() (5720)
├── Enhanced Components Init (5726-5757)
├── loadWiFiConfigFromPreferences() (5762)
├── ESP ID Generation (5767)
├── WebConfigServer Init (5779)
├── connectToWiFi() (5782)
│   ├── Configuration Check (2189)
│   ├── WebConfigPortal Start (2195)
│   ├── WiFi.begin() (2223)
│   ├── NTP Sync (2248)
│   └── connectToMqtt() (2261)
│       ├── mqtt_client.setServer() (4763)
│       ├── Topic Subscriptions (4786-4809)
│       └── initializeSystem() (4812)
└── STATE_OPERATIONAL (4813)
```

### **2. State Machine Diagramm**

```
STATE_BOOT → STATE_WIFI_SETUP → STATE_WIFI_CONNECTED → STATE_MQTT_CONNECTING → STATE_OPERATIONAL
     ↓              ↓                    ↓                        ↓
STATE_ERROR    Captive Portal      MQTT Attempts           Full Operation
```

### **3. Sequenzdiagramm für First-Boot**

```
Power-On → Hardware Init → Config Load → ESP ID Gen → WiFi Check
    ↓
WiFi Configured? → NO → Captive Portal → User Config → WiFi Connect
    ↓
WiFi Connected → NTP Sync → MQTT Connect → Topic Subscribe → System Init
    ↓
STATE_OPERATIONAL → Status Broadcast → Heartbeat → Full Operation
```

### **4. Topic-Subscription-Liste**

**Basis-Topics:**
- esp32_{esp_id}/system/command
- esp32_{esp_id}/actuator/+/command
- esp32_{esp_id}/emergency
- esp32_{esp_id}/ui_schema/update
- esp32_{esp_id}/ui_capabilities/request
- esp32_{esp_id}/ui_test/run

**Kaiser-Topics:**
- kaiser/{kaiser_id}/esp/{esp_id}/zone/config
- kaiser/{kaiser_id}/esp/{esp_id}/system/command
- kaiser/{kaiser_id}/esp/{esp_id}/response
- kaiser/{kaiser_id}/esp/{esp_id}/commands

### **5. WebServer-Lifecycle-Diagramm**

```
Start: STATE_WIFI_SETUP → Captive Portal Active
WiFi Connected: STATE_WIFI_CONNECTED → Portal Open for MQTT Troubleshooting
MQTT Connected: STATE_OPERATIONAL → Portal Stops
```

### **6. Error-Recovery-Flowchart**

```
Error Detected → Error Type Check
├── WiFi Error → STATE_WIFI_SETUP → Captive Portal
├── MQTT Error → STATE_WIFI_CONNECTED → Portal Open
└── Unknown Error → STATE_WIFI_SETUP → Full Reset
```

### **7. Configuration-Flow-Diagramm**

```
User Connects → ESP32_Setup_XXXXXX → 192.168.4.1 → Form Fill
    ↓
POST /save → Validation → NVS Save → ESP.restart() → WiFi Connect
```

### **8. Network-Discovery-Ablauf**

```
mDNS Init → raspberrypi.local Query → HTTP Service Scan → Pi Verification
    ↓
Network Scan → Common IPs → Health Check → Pi Discovery
```

### **9. MQTT-Message-Flow**

```
MQTT Connect → Topic Subscribe → Status Broadcast → Heartbeat (30s)
    ↓
Enhanced Status Update → Pi Server Config → Full Operation
```

### **10. Timing-Analyse**

- **Hardware Init:** ~100ms
- **Config Load:** ~50ms
- **WiFi Connect:** ~2-10s
- **MQTT Connect:** ~1-3s
- **System Init:** ~500ms
- **Total Boot Time:** ~4-15s (je nach Netzwerk)

---

## 🎯 **ENTWICKLER-EMPFEHLUNGEN**

1. **Boot-Optimierung:** Reduziere Timeouts für schnellere Boot-Zeit
2. **Error-Handling:** Implementiere detailliertere Error-Kategorien
3. **State-Machine:** Verwende zentrale State-Transition-Funktion
4. **Memory-Management:** Implementiere Heap-Monitoring mit Warnings
5. **Network-Discovery:** Reaktiviere mDNS nach UDP-Fehler-Behebung
6. **Configuration:** Implementiere Configuration-Validation vor Save
7. **Recovery:** Verbessere Auto-Recovery-Logik
8. **Monitoring:** Erweitere Health-Monitoring-System
9. **Documentation:** Dokumentiere alle State-Transitions
10. **Testing:** Implementiere Boot-Sequence-Tests

---

**Dokumentation erstellt:** $(date)
**Version:** ESP32 Sensor Network v3.3
**Analysierte Dateien:** main.cpp, web_config_server.cpp, wifi_config.h, network_discovery.cpp, esp32_dev_config.h
**Gesamt-Zeilenzahl analysiert:** ~8,000 Zeilen Code
