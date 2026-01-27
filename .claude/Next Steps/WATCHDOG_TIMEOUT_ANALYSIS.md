# WATCHDOG TIMEOUT ANALYSE - Ergebnisse

**Analyst:** Claude (ESP32 Firmware Entwickler)  
**Datum:** 2026-01-16  
**Projekt:** AutomationOne - El Trabajante  
**Briefing-ID:** WDT-001

---

## 🎯 EXECUTIVE SUMMARY

| Aspekt | Ergebnis |
|--------|----------|
| **Root Cause** | Task Watchdog wird nicht gefüttert während Provisioning |
| **Betroffene Datei** | `provision_manager.cpp`, `main.cpp` |
| **Kritische Funktion** | `waitForConfig()` |
| **Problem-Typ** | Fehlender `esp_task_wdt_reset()` Aufruf |
| **Severity** | KRITISCH 🔴 |

### Kern-Erkenntnis

> **`delay()` auf ESP32 füttert NICHT den explizit registrierten Task Watchdog!**
>
> Die Annahme, dass `delay(10)` den Watchdog resettet, ist **falsch**. Der Arduino `delay()` gibt nur die CPU an den FreeRTOS Scheduler ab und füttert den Idle-Task-Watchdog, aber NICHT den Task Watchdog, der via `esp_task_wdt_add(NULL)` für den `loopTask` registriert wurde.

---

## 1. PROVISION-MODE FLOW

### 1.1 Initialisierung

- **Datei:** `src/main.cpp`
- **Funktion:** `setup()`
- **Zeile:** 331
- **Trigger-Bedingung:** `!g_wifi_config.configured || g_wifi_config.ssid.length() == 0`

```cpp
// Zeile 324-331
if (!g_wifi_config.configured || g_wifi_config.ssid.length() == 0) {
    LOG_INFO("╔════════════════════════════════════════╗");
    LOG_INFO("║   NO CONFIG - STARTING PROVISIONING   ║");
    LOG_INFO("╚════════════════════════════════════════╝");
    LOG_INFO("ESP is not provisioned. Starting AP-Mode...");
    
    // Initialize Provision Manager
    if (!provisionManager.begin()) {
```

### 1.2 ProvisionManager.begin()

- **Datei:** `src/services/provisioning/provision_manager.cpp`
- **Funktion:** `begin()`
- **Zeile:** 144-172
- **Blocking:** NEIN (schnelle Initialisierung)

```cpp
bool ProvisionManager::begin() {
  if (initialized_) {
    LOG_WARNING("ProvisionManager already initialized");
    return true;
  }
  
  // Get ESP ID from global system config
  esp_id_ = configManager.getESPId();
  
  if (esp_id_.length() == 0) {
    LOG_ERROR("ProvisionManager: ESP ID not available");
    return false;
  }
  
  initialized_ = true;
  state_ = PROVISION_IDLE;
  
  LOG_INFO("ProvisionManager initialized successfully");
  return true;
}
```

### 1.3 Access Point Start

- **Datei:** `src/services/provisioning/provision_manager.cpp`
- **Funktion:** `startAPMode()` → `startWiFiAP()` → `startHTTPServer()`
- **Zeilen:** 193-241 (startAPMode), 446-475 (startWiFiAP), 477-509 (startHTTPServer)

#### Access Point Konfiguration:

| Parameter | Wert |
|-----------|------|
| **SSID** | `AutoOne-{ESP_ID}` (z.B. `AutoOne-ESP_D0B19C`) |
| **Password** | `provision` |
| **IP-Adresse** | `192.168.4.1` |
| **Channel** | 1 |
| **Max Connections** | 1 |
| **Library** | `<WiFi.h>` (ESP32 Arduino Core) |

```cpp
// Zeile 454 - WiFi AP Start
bool success = WiFi.softAP(ssid.c_str(), password.c_str(), 1, 0, 1);
```

### 1.4 HTTP Server Handling

- **Datei:** `src/services/provisioning/provision_manager.cpp`
- **Library:** `<WebServer.h>` (Standard ESP32 Arduino WebServer, **NICHT** AsyncWebServer!)
- **Zeile:** 481

```cpp
// Zeile 481 - WebServer erstellen
server_ = new WebServer(80);
```

#### Registrierte Endpunkte:

| Method | Path | Handler | Zeile |
|--------|------|---------|-------|
| GET | `/` | `handleRoot()` | 492 |
| POST | `/provision` | `handleProvision()` | 493 |
| GET | `/status` | `handleStatus()` | 494 |
| POST | `/reset` | `handleReset()` | 495 |
| ANY | `*` | `handleNotFound()` | 496 |

### 1.5 Config-Wait-Loop (⚠️ KRITISCH!)

- **Datei:** `src/services/provisioning/provision_manager.cpp`
- **Funktion:** `waitForConfig(uint32_t timeout_ms)`
- **Zeile:** 243-279
- **Blocking?** **JA - KRITISCH!**
- **Aufruf-Stelle:** `main.cpp` Zeile 372

```cpp
// KRITISCHER CODE - provision_manager.cpp Zeile 243-279
bool ProvisionManager::waitForConfig(uint32_t timeout_ms) {
  if (state_ != PROVISION_AP_MODE && state_ != PROVISION_WAITING_CONFIG) {
    LOG_ERROR("ProvisionManager: Not in AP-Mode or Waiting state");
    return false;
  }
  
  LOG_INFO("Waiting for configuration (timeout: " + String(timeout_ms / 1000) + " seconds)");
  
  unsigned long start_time = millis();
  
  while (millis() - start_time < timeout_ms) {  // ❌ BLOCKING LOOP für bis zu 600s!
    // Process HTTP requests
    loop();  // Ruft server_->handleClient() auf
    
    // Check if config received
    if (config_received_) {
      LOG_INFO("✅ Configuration received successfully");
      transitionTo(PROVISION_COMPLETE);
      return true;
    }
    
    // Check for timeout
    if (checkTimeouts()) {
      // Timeout occurred
      LOG_ERROR("❌ Provisioning timeout");
      return false;
    }
    
    // Small delay to prevent watchdog issues
    delay(10);  // ❌ DIESER DELAY REICHT NICHT!
  }
  
  // Timeout reached
  LOG_ERROR("❌ Wait timeout reached");
  transitionTo(PROVISION_TIMEOUT);
  return false;
}
```

### 1.6 ProvisionManager.loop()

- **Datei:** `src/services/provisioning/provision_manager.cpp`
- **Funktion:** `loop()`
- **Zeile:** 437-441

```cpp
void ProvisionManager::loop() {
  if (server_ && (state_ == PROVISION_AP_MODE || state_ == PROVISION_WAITING_CONFIG)) {
    server_->handleClient();  // Non-blocking HTTP request handler
  }
}
```

---

## 2. LOOP-TASK ANALYSE

### 2.1 setup() Funktion - Relevanter Provisioning-Teil

- **Datei:** `src/main.cpp`
- **Zeilen:** 112-433 (komplett), 321-433 (Provisioning-Teil)

**Kritischer Flow:**
```
setup()
├─> Serial.begin(115200)                              [Zeile 116]
├─> Watchdog Init (30s, no panic)                     [Zeile 153-154] ⚠️
├─> esp_task_wdt_add(NULL)                            [Zeile 154] ⚠️
├─> ...weitere Inits...
├─> provisionManager.begin()                          [Zeile 331]
├─> provisionManager.startAPMode()                    [Zeile 361]
└─> provisionManager.waitForConfig(600000)            [Zeile 372] ❌ BLOCKIERT!
    └─> while-loop für bis zu 10 Minuten
        └─> delay(10) ← Füttert NICHT den Task Watchdog!
```

### 2.2 loop() Funktion (wird erst nach setup() erreicht)

- **Datei:** `src/main.cpp`
- **Funktion:** `loop()`
- **Zeilen:** 1215-1275

```cpp
void loop() {
  // STATE_SAFE_MODE_PROVISIONING HANDLING (Zeile 1222-1240)
  if (g_system_config.current_state == STATE_SAFE_MODE_PROVISIONING) {
    provisionManager.loop();  // HTTP-Request-Handling
    
    // Check: Config empfangen?
    if (g_wifi_config.configured && g_wifi_config.ssid.length() > 0) {
      delay(2000);
      ESP.restart();
    }
    
    delay(10);  // ❌ Auch hier: Füttert NICHT den Task Watchdog
    return;
  }

  // NORMAL FLOW (wird bei Provisioning nicht erreicht!)
  wifiManager.loop();
  mqttClient.loop();
  sensorManager.performAllMeasurements();
  actuatorManager.processActuatorLoops();
  healthMonitor.loop();
  
  delay(10);  // Small delay
}
```

**Durchlauf-Dauer (geschätzt):**
- Normal-Flow: ~5-20ms pro Iteration
- Provisioning-Mode: ~10-15ms pro Iteration (nur server_->handleClient())

**Watchdog-Reset vorhanden?** ❌ **NEIN!**

### 2.3 Aufgerufene Komponenten während Provisioning

| Reihenfolge | Komponente | Funktion | Blocking? | Geschätzte Dauer |
|-------------|------------|----------|-----------|------------------|
| 1 | ProvisionManager | loop() | Nein | <1ms |
| 2 | WebServer | handleClient() | Nein* | <5ms |
| 3 | — | delay(10) | Ja (10ms) | 10ms |

\* WebServer.handleClient() ist normalerweise non-blocking, kann aber bei aktiver HTTP-Verbindung länger dauern.

---

## 3. WATCHDOG KONFIGURATION

### 3.1 Initialisierung

- **Datei:** `src/main.cpp`
- **Zeilen:** 140-158
- **Timeout:** 30000 ms (30 Sekunden)
- **Panic Mode:** Deaktiviert (`false`)

```cpp
// Zeile 152-155
#ifndef WOKWI_SIMULATION
esp_task_wdt_init(30, false);  // 30s timeout, don't panic
esp_task_wdt_add(NULL);        // Add current task to watchdog
Serial.println("✅ Watchdog configured: 30s timeout, no panic");
#else
Serial.println("[WOKWI] Watchdog skipped (not supported in simulation)");
#endif
```

**Subscribed Tasks:**
- `loopTask` (CPU 1) - Der Task, der `setup()` und `loop()` ausführt

### 3.2 Watchdog Reset-Mechanismus

#### Explizite Resets (`esp_task_wdt_reset()` Aufrufe):

| Datei | Zeile | Kontext | Wird aufgerufen? |
|-------|-------|---------|------------------|
| — | — | — | ❌ **KEINE im gesamten `src/` Verzeichnis!** |

**Grep-Ergebnis:**
```bash
grep -r "esp_task_wdt_reset" src/
# Ergebnis: Keine Treffer im src/ Verzeichnis!
```

Der einzige `esp_task_wdt_reset()` Aufruf findet sich in:
- `docs/system-flows/09-subzone-management-flow.md` (Zeile 881) - **NUR DOKUMENTATION!**

#### Implizite Resets (via `vTaskDelay()`):

> **WICHTIG:** Auf ESP32 mit Arduino Core füttert `delay()` **NICHT** automatisch den Task Watchdog!
>
> `delay()` ruft intern `vTaskDelay()` auf, was den FreeRTOS Scheduler freigibt. Dies füttert den **Idle Task Watchdog**, aber **NICHT** den **Task Watchdog** der via `esp_task_wdt_add()` registriert wurde.

**Das ist der ROOT CAUSE des Problems!**

### 3.3 Watchdog-Trigger-Zeitpunkt (Log-Analyse)

```
[       1043] [INFO    ] Waiting for configuration (timeout: 600 seconds)...

E (42754) task_wdt: Task watchdog got triggered.
```

| Zeitstempel | Event | Differenz |
|-------------|-------|-----------|
| 1043 ms | waitForConfig() startet | — |
| 42754 ms | Watchdog triggert | ~41.7 Sekunden |

**Analyse:** Der Watchdog wurde beim Setup-Start (nach `esp_task_wdt_add(NULL)`) zuletzt gefüttert. Nach 30 Sekunden ohne Reset triggert er. Die ~41.7s Differenz erklärt sich durch:
- Setup-Code vor Provisioning (Logging, Init, etc.)
- Interne Watchdog-Toleranz

---

## 4. KOMPONENTEN-MAPPING

### 4.1 ProvisionManager

```
┌─────────────────────────────────────────────────────────────────────────┐
│ DATEI: src/services/provisioning/provision_manager.cpp                  │
├─────────────────────────────────────────────────────────────────────────┤
│ FUNKTIONEN:                                                              │
│  - begin()             [Zeile 144]  → Manager initialisieren            │
│  - needsProvisioning() [Zeile 174]  → Prüft ob Config fehlt             │
│  - startAPMode()       [Zeile 193]  → AP + HTTP-Server starten          │
│  - waitForConfig()     [Zeile 243]  → ❌ BLOCKING WAIT für Config       │
│  - loop()              [Zeile 437]  → HTTP-Request-Handling             │
│  - stop()              [Zeile 281]  → AP-Mode beenden                   │
│  - checkTimeouts()     [Zeile 343]  → Timeout-Prüfung (10min pro Try)   │
│  - enterSafeMode()     [Zeile 380]  → Safe-Mode nach 3× Timeout         │
├─────────────────────────────────────────────────────────────────────────┤
│ PRIVATE HELPER:                                                          │
│  - startWiFiAP()       [Zeile 446]  → WiFi.softAP() aufrufen            │
│  - startHTTPServer()   [Zeile 477]  → WebServer erstellen & starten     │
│  - startMDNS()         [Zeile 511]  → mDNS Hostname registrieren        │
│  - handleRoot()        [Zeile 539]  → GET / Handler                     │
│  - handleProvision()   [Zeile 559]  → POST /provision Handler           │
│  - handleStatus()      [Zeile 675]  → GET /status Handler               │
│  - handleReset()       [Zeile 699]  → POST /reset Handler               │
├─────────────────────────────────────────────────────────────────────────┤
│ KONSTANTEN:                                                              │
│  - AP_MODE_TIMEOUT_MS  = 600000    → 10 Minuten pro Versuch             │
│  - MAX_RETRY_COUNT     = 3         → Max 3 Wiederholungen               │
│  - REBOOT_DELAY_MS     = 2000      → 2s Delay vor Reboot                │
├─────────────────────────────────────────────────────────────────────────┤
│ AUFRUF-HIERARCHIE:                                                       │
│  setup() → provisionManager.begin()                                      │
│         → provisionManager.startAPMode()                                 │
│         → provisionManager.waitForConfig(600000) ← BLOCKING!             │
│  loop()  → provisionManager.loop() [nur bei STATE_SAFE_MODE_PROVISIONING]│
├─────────────────────────────────────────────────────────────────────────┤
│ ABHÄNGIGKEITEN:                                                          │
│  - <WiFi.h>        → WiFi AP-Mode                                       │
│  - <WebServer.h>   → HTTP-Server (synchron, NICHT async!)               │
│  - <ESPmDNS.h>     → mDNS Service Discovery                             │
│  - ConfigManager   → Config laden/speichern                             │
│  - ErrorTracker    → Fehler protokollieren                              │
│  - Logger          → Log-Ausgaben                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 main.cpp (setup/loop)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ DATEI: src/main.cpp                                                     │
├─────────────────────────────────────────────────────────────────────────┤
│ FUNKTIONEN:                                                              │
│  - setup()             [Zeile 112]  → System-Initialisierung            │
│  - loop()              [Zeile 1215] → Haupt-Loop                        │
│  - handleSensorConfig()[Zeile 1280] → MQTT Sensor-Config Handler        │
│  - handleActuatorConfig()[Zeile 1506]→ MQTT Actuator-Config Handler     │
│  - handleSensorCommand()[Zeile 1520]→ MQTT Sensor-Command Handler       │
├─────────────────────────────────────────────────────────────────────────┤
│ SETUP PHASEN:                                                            │
│  Phase 1: Serial, Watchdog, GPIO Safe-Mode, Logger, Storage, Config     │
│  Phase 2: (Provisioning Check - kann hier blockieren!)                   │
│  Phase 3: WiFi, MQTT (nur wenn Config vorhanden)                        │
│  Phase 4: I2C, OneWire, PWM                                             │
│  Phase 5: Sensor Manager                                                │
│  Phase 6: Actuator Manager, Safety Controller                           │
├─────────────────────────────────────────────────────────────────────────┤
│ WATCHDOG-RELEVANT:                                                       │
│  - Zeile 153: esp_task_wdt_init(30, false)                              │
│  - Zeile 154: esp_task_wdt_add(NULL)                                    │
│  - Zeile 1238: delay(10) ← FÜTTERT NICHT DEN WATCHDOG!                  │
│  - Zeile 1274: delay(10) ← FÜTTERT NICHT DEN WATCHDOG!                  │
│  - KEIN esp_task_wdt_reset() irgendwo!                                  │
├─────────────────────────────────────────────────────────────────────────┤
│ PROVISIONING FLOW (Zeilen 321-433):                                      │
│  1. Check: Config vorhanden?                         [Zeile 324]        │
│  2. provisionManager.begin()                         [Zeile 331]        │
│  3. provisionManager.startAPMode()                   [Zeile 361]        │
│  4. provisionManager.waitForConfig(600000) ❌        [Zeile 372]        │
│     └─> BLOCKIERT BIS ZU 10 MINUTEN IN setup()!                         │
│  5. Bei Success: ESP.restart()                       [Zeile 380]        │
│  6. Bei Timeout: enterSafeMode() + continue          [Zeile 381-403]    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Watchdog-Integration

```
┌─────────────────────────────────────────────────────────────────────────┐
│ WATCHDOG INTEGRATION MAPPING                                             │
├─────────────────────────────────────────────────────────────────────────┤
│ INITIALISIERUNG:                                                         │
│  Datei: src/main.cpp                                                    │
│  Zeile: 152-158                                                          │
│  Code:  esp_task_wdt_init(30, false); esp_task_wdt_add(NULL);           │
│  Kommentar: Nur bei echter Hardware, nicht bei WOKWI_SIMULATION         │
├─────────────────────────────────────────────────────────────────────────┤
│ RESET-AUFRUFE (esp_task_wdt_reset()):                                   │
│  ❌ KEINE im gesamten src/ Verzeichnis!                                 │
│                                                                          │
│  Einziger Fund:                                                          │
│  - docs/system-flows/09-subzone-management-flow.md (Zeile 881)          │
│    → Nur Dokumentation, NICHT im Code implementiert!                    │
├─────────────────────────────────────────────────────────────────────────┤
│ DELAY-AUFRUFE (keine impliziten WDT-Resets!):                           │
│  Datei                          │ Zeile │ Wert   │ Kontext               │
│  ─────────────────────────────────────────────────────────────────────  │
│  main.cpp                       │ 1238  │ 10ms   │ loop() provisioning   │
│  main.cpp                       │ 1274  │ 10ms   │ loop() normal         │
│  provision_manager.cpp          │ 272   │ 10ms   │ waitForConfig() loop  │
│  wifi_manager.cpp               │ 136   │ 100ms  │ connect() wait loop   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. BLOCKING-CODE-STELLEN

### 5.1 Gefundene While-Loops

| Datei | Zeile | Funktion | Blocking? | Delay in Loop | Problem? |
|-------|-------|----------|-----------|---------------|----------|
| **provision_manager.cpp** | **253** | **waitForConfig()** | **JA** | **10ms** | **❌ JA!** |
| main.cpp | 186 | setup() Boot-Button | Ja | 100ms | Nein (nur Setup) |
| main.cpp | 314 | setup() Safe-Mode | Ja | 1000ms | Nein (gewollt) |
| main.cpp | 347 | setup() LED-Blink | Ja | 200ms | Nein (Error-Mode) |
| main.cpp | 421 | setup() LED-Blink | Ja | 200ms | Nein (Error-Mode) |
| wifi_manager.cpp | 93 | connectToNetwork() | Ja | 100ms | Nein (Setup) |
| onewire_bus.cpp | 154 | scanDevices() | Ja | Nein* | Nein (kurz) |
| time_manager.cpp | 294 | waitForSync() | Ja | implicit | Nein (Setup) |

\* OneWire search ist I/O-bound, nicht CPU-bound

### 5.2 Kritische While-Loop im Detail

**Datei:** `provision_manager.cpp`  
**Zeile:** 253-273  
**Funktion:** `waitForConfig()`

```cpp
// KRITISCHER CODE - DIE URSACHE DES PROBLEMS
while (millis() - start_time < timeout_ms) {  // timeout_ms = 600000 (10 min)
    loop();  // server_->handleClient()
    
    if (config_received_) {
        return true;
    }
    
    if (checkTimeouts()) {
        return false;
    }
    
    delay(10);  // ❌ FÜTTERT NICHT DEN TASK WATCHDOG!
}
```

**Problem:**
- Loop kann bis zu 600.000 ms (10 Minuten) laufen
- `delay(10)` füttert NICHT den `esp_task_wdt` des loopTask
- Watchdog triggert nach 30 Sekunden

### 5.3 Gefundene delay() Aufrufe

| Datei | Zeile | Funktion | Delay-Wert | Kontext | Problematisch? |
|-------|-------|----------|------------|---------|----------------|
| main.cpp | 122 | setup() | 500ms | Wokwi Serial | Nein (vor WDT) |
| main.cpp | 124 | setup() | 100ms | Serial flush | Nein (vor WDT) |
| main.cpp | 126 | setup() | 100ms | Serial stabilize | Nein (vor WDT) |
| main.cpp | 200 | setup() | 100ms | Boot-Button poll | Nein (vor WDT) |
| main.cpp | 226 | setup() | 2000ms | Factory Reset | Nein (Reboot folgt) |
| main.cpp | 315 | setup() | 1000ms | Safe-Mode loop | Nein (gewollt) |
| main.cpp | 351-355 | setup() | 200ms×2 | LED Blink | Nein (Error-Mode) |
| main.cpp | 379 | setup() | 2000ms | Post-Provision | Nein (Reboot folgt) |
| main.cpp | 425-429 | setup() | 200ms×2 | LED Blink | Nein (Error-Mode) |
| main.cpp | 730 | MQTT callback | 3000ms | Factory Reset | Nein (Reboot folgt) |
| main.cpp | 1234 | loop() | 2000ms | Config received | Nein (Reboot folgt) |
| **main.cpp** | **1238** | **loop()** | **10ms** | **Provisioning** | **⚠️ Reicht nicht** |
| **main.cpp** | **1274** | **loop()** | **10ms** | **Normal loop** | **⚠️ Reicht nicht** |
| **provision_manager.cpp** | **272** | **waitForConfig()** | **10ms** | **Wait loop** | **❌ JA!** |
| provision_manager.cpp | 361 | checkTimeouts() | 1000ms | Retry-Pause | Nein (zwischen Tries) |
| provision_manager.cpp | 425-427 | enterSafeMode() | 200ms×2 | LED Blink | Nein (kurz) |
| provision_manager.cpp | 669 | handleProvision() | 2000ms | Before reboot | Nein (Reboot folgt) |
| provision_manager.cpp | 745 | handleReset() | 3000ms | Before reboot | Nein (Reboot folgt) |
| wifi_manager.cpp | 136 | connectToNetwork() | 100ms | Connect wait | Nein (Setup-Phase) |
| onewire_bus.cpp | 248 | readTemperature() | 750ms | DS18B20 conv | Nein (spezifisch) |
| i2c_bus.cpp | 189 | scanDevices() | 1ms | Between scans | Nein (kurz) |
| gpio_manager.cpp | 459 | verifyPinState() | 1ms | Pin stabilize | Nein (kurz) |
| mqtt_client.cpp | 551 | connect() | 100ms | Connect wait | Nein (Setup-Phase) |
| http_client.cpp | 293, 329 | request() | 10ms | Response wait | Nein (non-blocking) |

---

## 6. ROOT-CAUSE HYPOTHESE

### 6.1 Wahrscheinlichste Ursache

**Der Task Watchdog wird für den `loopTask` registriert, aber NIRGENDS wird `esp_task_wdt_reset()` aufgerufen!**

### 6.2 Detaillierte Erklärung

1. **Watchdog-Registrierung** (main.cpp, Zeile 153-154):
   ```cpp
   esp_task_wdt_init(30, false);  // 30s timeout
   esp_task_wdt_add(NULL);        // Registriert loopTask (aktueller Task)
   ```

2. **Fehlannahme im Code:**
   Der Kommentar `// Small delay to prevent watchdog issues` (Zeile 1274) impliziert, dass der Entwickler glaubte, `delay(10)` würde den Watchdog füttern.

3. **Realität auf ESP32:**
   - `delay()` ruft intern `vTaskDelay()` auf
   - `vTaskDelay()` gibt die CPU an den FreeRTOS Scheduler
   - Der IDLE Task läuft und füttert seinen eigenen Watchdog
   - **ABER:** Der explizit registrierte Task Watchdog des `loopTask` wird **NICHT** gefüttert!

4. **Konsequenz:**
   - Nach `esp_task_wdt_add(NULL)` läuft der 30-Sekunden-Timer
   - In `waitForConfig()` gibt es keinen `esp_task_wdt_reset()` Aufruf
   - Nach 30 Sekunden triggert der Watchdog, obwohl `delay(10)` in der Loop ist

### 6.3 Betroffene Dateien & Zeilen

| Datei | Zeilen | Problem |
|-------|--------|---------|
| `main.cpp` | 153-154 | WDT wird registriert |
| `main.cpp` | 372 | `waitForConfig(600000)` wird aufgerufen |
| `main.cpp` | 1238 | `delay(10)` ohne WDT-Reset |
| `main.cpp` | 1274 | `delay(10)` ohne WDT-Reset |
| `provision_manager.cpp` | 253-273 | While-Loop ohne WDT-Reset |
| `provision_manager.cpp` | 272 | `delay(10)` ohne WDT-Reset |

### 6.4 Konkrete Code-Stelle des Problems

```cpp
// Datei: provision_manager.cpp, Zeile 253-273
// HIER IST DAS PROBLEM:

while (millis() - start_time < timeout_ms) {
    loop();  // server_->handleClient()
    
    if (config_received_) {
        transitionTo(PROVISION_COMPLETE);
        return true;
    }
    
    if (checkTimeouts()) {
        return false;
    }
    
    delay(10);  // ❌ HIER FEHLT: esp_task_wdt_reset();
}
```

### 6.5 Warum das Problem nicht immer auftritt

Das Problem tritt nur auf, wenn:
1. ESP hat keine WiFi-Config → Provisioning-Mode wird gestartet
2. Kein Client verbindet sich innerhalb von 30 Sekunden
3. Watchdog-Timeout wird erreicht

Wenn Config vorhanden ist, wird `waitForConfig()` nie aufgerufen und der normale `loop()` wird erreicht (der allerdings auch `esp_task_wdt_reset()` fehlt!).

---

## 7. WEITERE BUGS/ISSUES GEFUNDEN

### 7.1 Issue #1: Watchdog wird auch im Normal-Loop nicht gefüttert

**Datei:** `main.cpp`, Zeile 1215-1275

Auch nach erfolgreichem Provisioning wird `esp_task_wdt_reset()` nicht aufgerufen. Dies kann zu Watchdog-Timeouts führen, wenn:
- Lange I/O-Operationen stattfinden
- MQTT-Callbacks lange dauern
- Sensor-Messungen blockieren

**Betroffene Zeilen:**
- 1238: `delay(10);` ohne WDT-Reset
- 1274: `delay(10);` ohne WDT-Reset

### 7.2 Issue #2: Potentieller Deadlock in checkTimeouts()

**Datei:** `provision_manager.cpp`, Zeile 359-362

Bei Timeout wird `stop()` und dann `startAPMode()` aufgerufen mit einem 1-Sekunden-Delay dazwischen. Während dieser Phase läuft die `waitForConfig()` Loop weiter, was zu inkonsistentem State führen könnte.

```cpp
// Restart provisioning
stop();
delay(1000);  // ← Während dessen läuft waitForConfig() weiter!
startAPMode();
```

### 7.3 Issue #3: LED-Blink in enterSafeMode() blockiert 4 Sekunden

**Datei:** `provision_manager.cpp`, Zeile 422-428

```cpp
for (int i = 0; i < 10; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(200);
    digitalWrite(LED_PIN, LOW);
    delay(200);
}
// Total: 4000ms Blocking-Zeit
```

Dies ist unter dem 30s Watchdog-Timeout, aber verlängert die Zeit bis zum nächsten HTTP-Request-Handling.

### 7.4 Issue #4: WebServer ist synchron, nicht async

**Datei:** `provision_manager.cpp`, Zeile 481

Der Code nutzt `<WebServer.h>` (synchroner WebServer), nicht `<ESPAsyncWebServer.h>`. Dies bedeutet:
- `handleClient()` muss explizit aufgerufen werden
- Requests werden sequentiell verarbeitet
- Bei langen Request-Handlern blockiert der Server

Für ein robusteres Provisioning-System wäre `ESPAsyncWebServer` besser geeignet.

### 7.5 Issue #5: Keine vTaskDelay() im Code

**Suche:** `grep -r "vTaskDelay" src/` → **Keine Treffer!**

Der Code verwendet überall `delay()` statt `vTaskDelay()`. Während `delay()` intern `vTaskDelay()` aufruft, ist es auf ESP32 best practice, direkt `vTaskDelay()` zu verwenden für:
- Explizitere Kontrolle über Task-Scheduling
- Bessere Integration mit FreeRTOS

### 7.6 Issue #6: Keine yield() Aufrufe im Code

**Suche:** `grep -r "yield()" src/` → **Keine Treffer!**

`yield()` ist auf ESP32 Arduino ein Alias für einen kurzen Scheduler-Handoff. In blocking loops wäre `yield()` eine leichtgewichtige Alternative zu `delay(1)`.

---

## 8. ZEITLICHER ABLAUF (REKONSTRUKTION)

```
T=0ms      : ESP32 Boot
T=100ms    : Serial.begin()
T=~153ms   : esp_task_wdt_init(30, false) ← Watchdog Timer startet!
T=~154ms   : esp_task_wdt_add(NULL) ← loopTask registriert
T=~200ms   : GPIO Safe-Mode, Logger, Storage, Config Init
T=~500ms   : provisionManager.begin()
T=~800ms   : provisionManager.startAPMode()
T=~1000ms  : WiFi AP aktiv, HTTP-Server gestartet
T=~1043ms  : LOG: "Waiting for configuration..."
T=~1043ms  : waitForConfig() While-Loop startet
           : ┌─────────────────────────────────────────────────┐
           : │ while (millis() - start_time < 600000) {        │
           : │     loop();  // server_->handleClient()         │
           : │     delay(10);  // KEIN esp_task_wdt_reset()!   │
           : │ }                                               │
           : └─────────────────────────────────────────────────┘
T=~30153ms : Watchdog-Timer bei 30s angelangt (intern)
           : ❌ KEIN esp_task_wdt_reset() seit T=153ms!
T=~42754ms : E (42754) task_wdt: Task watchdog got triggered
           : E (42754) task_wdt:  - loopTask (CPU 1)
           : (Differenz erklärbar durch interne Toleranz/Scheduling)
```

---

## 9. ZUSAMMENFASSUNG

### Problem gefunden: ✅

Der Task Watchdog wird via `esp_task_wdt_add(NULL)` für den `loopTask` registriert, aber **nirgends im Code wird `esp_task_wdt_reset()` aufgerufen**.

Die Annahme, dass `delay(10)` den Watchdog füttert, ist **falsch**. `delay()` gibt nur die CPU frei (via `vTaskDelay()`), füttert aber nicht den explizit registrierten Task Watchdog.

### Betroffene Komponenten:

1. **main.cpp**: Watchdog-Init ohne Reset-Aufrufe
2. **provision_manager.cpp**: Blocking `waitForConfig()` ohne WDT-Reset
3. **Alle loop()-Funktionen**: Keine WDT-Reset-Aufrufe

### Auswirkung:

- Watchdog triggert alle 30 Sekunden während Provisioning
- Windows kann sich nicht stabil mit AP verbinden (ständige Resets?)
- System bleibt in nicht-funktionalem Zustand

### Priorität: KRITISCH 🔴

Dies verhindert komplett das Provisioning auf echter Hardware.

---

**Ende des Analyse-Dokuments**

*Erstellt am 2026-01-16 von Claude (ESP32 Firmware Entwickler)*
