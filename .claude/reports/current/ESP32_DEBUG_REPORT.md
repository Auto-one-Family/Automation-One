# ESP32 Debug Report — Firmware Safety bei Netzwerkverlust

**Erstellt:** 2026-03-30
**Modus:** B (Spezifisch: "Firmware Safety Analyse bei MQTT/WiFi-Disconnect")
**Quellen:** Statische Code-Analyse — kein laufendes Geraet, kein Serial-Log

---

## 1. Zusammenfassung

Die Firmware verfuegt ueber eine funktionale Emergency-Stop-Infrastruktur und Runtime-Protection
fuer Aktoren, aber **kein autonomes Failsafe-Verhalten bei Netzwerkverlust**. Ein ESP32 mit
laufenden Aktoren (Pumpe ON, Ventil offen) erkennt einen MQTT-Disconnect zwar (Circuit Breaker,
Heartbeat-Gate), unternimmt aber **nichts gegen den Aktor-Zustand**. Aktoren laufen unbegrenzt
weiter bis der `max_runtime_ms` Timer (default: 1 Stunde) greift — oder bis der Server die
Verbindung wiederherstellt und manuell stoppt. Der Server-seitige LWT liefert zwar eine
`offline`-Message an den Broker, aber ob der Server daraufhin automatisch Aktoren stoppt, liegt
ausserhalb dieser Analyse (ESP-Scope).

**Handlungsbedarf: HOCH.** Fuer sicherheitskritische Aktoren (Pumpen, Ventile) fehlt ein
konfigurierbares `connection_timeout_action` das bei Verbindungsverlust nach X Sekunden
automatisch in einen definierten Sicher-Zustand wechselt.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| `safety_controller.h` / `.cpp` | OK gelesen | Vollstaendig |
| `actuator_manager.h` / `.cpp` | OK gelesen | Vollstaendig (grosse Datei, in Chunks) |
| `mqtt_client.h` / `.cpp` | OK gelesen | Vollstaendig |
| `wifi_manager.h` / `.cpp` | OK gelesen | Vollstaendig |
| `models/actuator_types.h` | OK gelesen | Vollstaendig |
| `models/system_state.h` | Datei leer (1 Zeile) | Kein Inhalt |
| `core/main_loop.cpp` | Datei leer (1 Zeile) | Kein Inhalt — loop() liegt in main.cpp |
| `core/system_controller.cpp` | Datei leer (2 Zeilen) | Kein Inhalt |
| `main.cpp` | OK gelesen | Vollstaendig (Chunks: setup, loop, callbacks) |
| `error_handling/circuit_breaker.h` / `.cpp` | OK gelesen | Vollstaendig |
| `config/system_config.h` | Datei leer (1 Zeile) | Kein Inhalt |
| `actuator_drivers/pump_actuator.cpp` | OK gelesen | Vollstaendig |
| `actuator_drivers/valve_actuator.cpp` | OK gelesen | Vollstaendig |

---

## 3. Befunde

---

### Block 1: SafetyController Vollanalyse

#### 1.1 Safety-Klassen/Structs

**`SafetyController` (safety_controller.h:7)**
Singleton. Felder (private):
- `EmergencyState emergency_state_` — globaler Emergency-Zustand (NORMAL / ACTIVE / CLEARING / RESUMING)
- `String emergency_reason_` — Freitext-Grund des letzten Emergency-Events
- `unsigned long emergency_timestamp_` — `millis()` beim Ausloesen
- `RecoveryConfig recovery_config_` — Wiederherstellungs-Konfiguration
- `bool initialized_` — Initialisierungsflag

**`EmergencyState` Enum (actuator_types.h:10)**
```
EMERGENCY_NORMAL = 0
EMERGENCY_ACTIVE
EMERGENCY_CLEARING
EMERGENCY_RESUMING
```

**`RecoveryConfig` Struct (actuator_types.h:103)**
- `uint32_t inter_actuator_delay_ms = 2000` — Verzoegerung zwischen Aktor-Wiederanlaeufen
- `bool critical_first = true` — Kritische Aktoren zuerst
- `uint32_t verification_timeout_ms = 5000` — Wartezeit vor Clear-Freigabe
- `uint8_t max_retry_attempts = 3` — Max. Wiederholungsversuche

**`RegisteredActuator` Struct (actuator_manager.h:62)**
- `bool in_use = false`
- `uint8_t gpio = 255`
- `std::unique_ptr<IActuatorDriver> driver`
- `ActuatorConfig config`
- `bool emergency_stopped = false` — Flag pro Aktor (nicht global)
- `unsigned long command_duration_end_ms = 0` — Auto-OFF Timer aus MQTT-Command "duration"

**`ActuatorConfig` Struct (actuator_types.h:38)**
Alle Felder:
- `uint8_t gpio = 255`
- `uint8_t aux_gpio = 255`
- `String actuator_type = ""`
- `String actuator_name = ""`
- `String subzone_id = ""`
- `bool active = false`
- `bool critical = false`
- `uint8_t pwm_channel = 255`
- `bool inverted_logic = false`
- `uint8_t default_pwm = 0`
- `bool default_state = false` — Kommentar im Code: "Failsafe state if config lost"
- `bool current_state = false`
- `uint8_t current_pwm = 0`
- `unsigned long last_command_ts = 0`
- `unsigned long accumulated_runtime_ms = 0`
- `RuntimeProtection runtime_protection`

**`RuntimeProtection` Struct (actuator_types.h:32)**
- `unsigned long max_runtime_ms = 3600000UL` — Default: 1 Stunde (3.600.000 ms)
- `bool timeout_enabled = true`
- `unsigned long activation_start_ms = 0`

---

#### 1.2 Emergency-Stop Ausloesepfade

**Pfad A: Manuell via MQTT-Command (main.cpp:910-914)**
```
MQTT topic kaiser/.../actuator/emergency  payload command="emergency_stop"
→ safetyController.emergencyStopAll("ESP emergency command (authenticated)")
```
Auth-Token-Check vorhanden (fail-open wenn kein Token konfiguriert).

**Pfad B: Broadcast Emergency via MQTT (main.cpp:936-966)**
```
MQTT topic kaiser/.../broadcast/emergency
→ safetyController.emergencyStopAll("Broadcast emergency")
```
Separates Auth-Token fuer Broadcast.

**Pfad C: Runtime-Timeout (actuator_manager.cpp:559-565)**
```
processActuatorLoops() → runtime > max_runtime_ms
→ emergencyStopActuator(gpio) + publishActuatorAlert(...)
```
Wird pro Aktor-Iteration geprueft (in jedem loop()-Zyklus).

**Pfad D: Command-Duration Auto-OFF (actuator_manager.cpp:536-545)**
```
processActuatorLoops() → command_duration_end_ms > 0 && millis() >= command_duration_end_ms
→ controlActuatorBinary(gpio, false)  [kein Emergency, sondern clean OFF]
```
Kein Emergency-Stop, sondern normales Ausschalten.

**Pfad E: Subzone-Isolation (safety_controller.cpp:69-89)**
```
safetyController.isolateSubzone(subzone_id, reason)
→ gpioManager.enableSafeModeForSubzone(subzone_id)
```
Delegiert an GPIOManager.

**Luecke:** Es gibt keinen automatischen Emergency-Stop bei MQTT-Disconnect oder WiFi-Disconnect.

---

#### 1.3 Code-Flow Emergency-Stop nach Aktor-Typ

**Flow: `safetyController.emergencyStopAll(reason)` (safety_controller.cpp:43)**

```
1. SafetyController::emergencyStopAll()
   → emergency_state_ = EMERGENCY_ACTIVE
   → emergency_reason_ = reason
   → emergency_timestamp_ = millis()
   → logEmergencyEvent()
   → actuatorManager.emergencyStopAll()

2. ActuatorManager::emergencyStopAll() (actuator_manager.cpp:460)
   → iteriert alle MAX_ACTUATORS (12) Slots
   → fuer jeden in_use-Aktor:
      actuators_[i].driver->emergencyStop("EmergencyStopAll")
      actuators_[i].emergency_stopped = true
      publishActuatorAlert(gpio, "emergency_stop", "Actuator stopped")
```

**Aktor-spezifisches Verhalten bei emergencyStop():**

| Typ | Datei:Zeile | Verhalten |
|-----|-------------|-----------|
| Pump | pump_actuator.cpp:198 | `emergency_stopped_ = true; applyState(false, true)` — force=true umgeht Runtime-Protection, setzt GPIO LOW (oder HIGH bei inverted_logic), `running_ = false` |
| Relay | actuator_manager.cpp:181 | Identisch zu Pump — Relay wird als `new PumpActuator()` erstellt |
| Valve | valve_actuator.cpp:201 | `emergency_stopped_ = true; stopMovement()` — enable_pin_ LOW, direction_pin_ LOW, current_position_ = 0 (geschlossen) |
| PWM | nicht gelesen | Muss `IActuatorDriver::emergencyStop()` implementieren |

**Nach emergencyStop:**
- `emergency_stopped = true` per Aktor-Flag in `RegisteredActuator`
- Jeder nachfolgende `controlActuator()` / `controlActuatorBinary()` prueft dieses Flag und returned `false` (actuator_manager.cpp:393-396, 437-440)
- Aktor reagiert nicht mehr auf Server-Commands bis `clearEmergency()` gerufen wird

---

#### 1.4 `clearEmergencyStop()` Analyse

**Trigger (main.cpp:915-927):**
```
MQTT payload command="clear_emergency"
→ safetyController.clearEmergencyStop()
→ safetyController.resumeOperation()
```
Nur via MQTT-Command moeglich. Kein automatisches Clear. Kein Timer-basiertes Clear.

**Code-Flow (safety_controller.cpp:91):**
```
clearEmergencyStop()
→ emergency_state_ = EMERGENCY_CLEARING
→ verifySystemSafety(): prueft ob elapsed >= verification_timeout_ms (5000ms)
→ wenn OK: actuatorManager.clearEmergencyStop()
           → fuer jeden Aktor: driver->clearEmergency() → emergency_stopped_ = false
           → emergency_state_ = EMERGENCY_RESUMING
resumeOperation()
→ delay(inter_actuator_delay_ms) = 2000ms
→ emergency_state_ = EMERGENCY_NORMAL
```

**Nach clearEmergency():** Aktoren sind OFF (nicht automatisch wieder ON). Server muss neue ON-Commands senden.

---

#### 1.5 Emergency-Flag: pro Aktor oder global?

Beide Ebenen vorhanden:
- Pro Aktor: `RegisteredActuator::emergency_stopped` (bool) — actuator_manager.h:67
- Pro Driver: `PumpActuator::emergency_stopped_` und `ValveActuator::emergency_stopped_`
- Global: `SafetyController::emergency_state_` (EmergencyState Enum)

Globale Ebene ist logisch (spiegelt ob irgendein Emergency aktiv ist). Aktor-Ebene ist operativ (blockiert Commands).

---

### Block 1.2: Runtime Protection

**`processActuatorLoops()` Vollanalyse (actuator_manager.cpp:527-581):**

Zwei Timer werden pro Loop-Iteration geprueft:

**Timer F1 — Command-Duration Auto-OFF:**
```
if command_duration_end_ms > 0
   && current_state == true
   && millis() >= command_duration_end_ms:
  → command_duration_end_ms = 0
  → controlActuatorBinary(gpio, false)   [clean OFF, kein Emergency]
  → continue
```

**Timer F2 — Runtime-Timeout (Phase 2):**
```
if timeout_enabled && current_state == true:
  if activation_start_ms > 0:
    runtime = millis() - activation_start_ms
    if runtime > max_runtime_ms:
      → emergencyStopActuator(gpio)      [Emergency-Stop, nicht clean OFF]
      → publishActuatorAlert("runtime_protection", ...)
      → activation_start_ms = 0
```

**Timer-Uebersicht:**

| Timer | Feld | Default | Typ | Reset |
|-------|------|---------|-----|-------|
| `max_runtime_ms` | `RuntimeProtection::max_runtime_ms` | 3.600.000 ms (1h) | Absolute Laufzeit | `activation_start_ms = 0` bei OFF |
| `command_duration_end_ms` | `RegisteredActuator::command_duration_end_ms` | 0 (inaktiv) | Absoluter Timestamp | 0 bei Ablauf / OFF-Command |
| `activation_start_ms` | `RuntimeProtection::activation_start_ms` | 0 | Startzeit | `= millis()` bei ON, `= 0` bei OFF |

**Default-Wert `max_runtime_ms`:** `3600000UL` — definiert in `actuator_types.h:33`.

**Was passiert bei Timer-Ablauf:**
- `emergencyStopActuator()` wird gerufen — kein clean OFF, sondern Emergency-Stop
- `emergency_stopped = true` permanent
- Aktor reagiert nicht mehr auf Commands bis explizites `clear_emergency`
- Alert publiziert: `alert_type = "runtime_protection"`

**Kann Aktor nach Runtime-Trigger sofort wieder eingeschaltet werden?**
Nein — erst muss `clear_emergency` via MQTT kommen.

**Luecke:** `max_runtime_ms` ist nicht via Server-Config konfigurierbar. Kein entsprechendes Feld in `parseActuatorDefinition()` gefunden. Alle Aktoren haben identischen 1h-Timeout.

---

### Block 1.3: MQTT-Disconnect-Verhalten

**Kein `onDisconnect` Callback:**
PubSubClient bietet keinen Disconnect-Callback. Disconnect-Erkennung passiv via Polling:
- `mqttClient.loop()` prueft `if (!isConnected()) reconnect()` (mqtt_client.cpp:807-810)

**`handleDisconnection()` (mqtt_client.cpp:813):**
```cpp
registration_confirmed_ = false;
registration_start_ms_ = 0;
// LOG_W einmal
reconnect();
```
Kein Aktor-Benachrichtigung. Kein Safety-Aufruf. Kein Timestamp-Speicher fuer Disconnect-Dauer.

**`connection_lost_since` Timestamp:** Nicht vorhanden. Kein dediziertes Disconnect-Timestamp-Feld in `MQTTClient`.

**Reconnect-Implementierung:**
- Exponential Backoff: Start `RECONNECT_BASE_DELAY_MS = 1000` ms (mqtt_client.cpp:23)
- Maximum: `RECONNECT_MAX_DELAY_MS = 60000` ms / 60s (mqtt_client.cpp:24)
- Circuit Breaker: 5 Failures → OPEN (30s blockiert) — mqtt_client.cpp:59

**KeepAlive-Wert:** `mqtt_config.keepalive = 60` (main.cpp:725)
`mqtt_.setKeepAlive(config.keepalive)` aufgerufen in mqtt_client.cpp:147.
Effekt: Broker erkennt haengenden Client nach 1.5 x 60s = 90 Sekunden und loest LWT aus.

**`clean_session`:** Nicht explizit gesetzt. PubSubClient default = `cleanSession = true`.
Konsequenz: Nach Reconnect verliert der ESP alle Broker-seitigen Subscriptions.

**Luecke:** Nach MQTT-Reconnect werden Subscriptions NICHT wiederhergestellt. `subscribe()` wird nur einmalig in `setup()` aufgerufen (main.cpp:823-846). Nach Reconnect kommt kein erneutes Subscribe.

---

### Block 1.4: WiFi-Disconnect-Verhalten

**Kein Event-Handler:**
`WiFi.setAutoReconnect(false)` gesetzt (wifi_manager.cpp:59). Kein `WiFi.onEvent()` registriert.

**Disconnect-Erkennung (wifi_manager.cpp:245-271):**
```
WiFiManager::loop() → if (!isConnected()) handleDisconnection()
handleDisconnection():
  → LOG_W "WiFi disconnected" (einmalig)
  → errorTracker.logCommunicationError(ERROR_WIFI_DISCONNECT)
  → reconnect()
```
Polling-basiert. Nur Log + Reconnect. Keine Aktor-Benachrichtigung.

**AP-Modus:**
Kein autonomer AP-Mode bei WiFi-Disconnect im laufenden Betrieb. AP-Mode bei:
- Erstmaligem Boot ohne Config
- WiFi-Fehler in setup()
- MQTT-Fehler in setup()
- Nach 30s MQTT-Disconnect im Betrieb → `STATE_SAFE_MODE_PROVISIONING` (main.cpp:2484-2491)

**Aktor-Zustand bei WiFi-Verlust:** Unveraendert. Kein Aktor-Eingriff.

**WiFi → MQTT Kopplung:** WiFiManager informiert MQTTClient nicht direkt. MQTT erkennt Ausfall selbst beim naechsten `mqtt_.loop()` wenn TCP weg ist.

---

### Block 1.5: Watchdog

**Konfiguration (main.cpp:396-441):**
- Provisioning Mode: `esp_task_wdt_init(300, false)` — 300s, kein Panic (main.cpp:410)
- Production Mode: `esp_task_wdt_init(60, true)` — 60s, Panic + Auto-Reboot (main.cpp:429)

**Feed (main.cpp:2352-2365):**
Feed-Intervall: 10s (Production) / 60s (Provisioning). In jedem loop()-Durchlauf geprueft.

**Wird bei MQTT-Disconnect getriggert?**
Nicht direkt. WiFi-connect-Loop speist Watchdog intern (wifi_manager.cpp:146: `esp_task_wdt_reset()`). Circuit Breaker verhindert blockierende Reconnect-Loops.

**Task-Watchdog (FreeRTOS):** Ja — `esp_task_wdt_*`. Nur Main-Task registriert.

**3x Watchdog in 24h → SafeMode:**
Code vorhanden aber auskommentiert (main.cpp:461-467):
```cpp
if (watchdog_count >= 3) {
    LOG_C(TAG, "3x Watchdog in 24h SAFE MODE ACTIVATED");
    // TODO: Enter Safe-Mode (after Safe-Mode implementation)
}
```
Luecke: SafeMode-Eintritt bei Watchdog-Threshold ist nicht implementiert.

---

### Block 1.6: main_loop / loop() Sicherheits-Checks

**Loop-Reihenfolge (main.cpp:2333-2563):**
```
1. first_loop_logged (einmalig)
2. Watchdog-Feed (alle 10s)
3. handleWatchdogTimeout()
4. STATE_SAFE_MODE_PROVISIONING → early return
5. STATE_PENDING_APPROVAL → early return
6. Boot-Counter-Reset nach 60s
7. wifiManager.loop()
8. mqttClient.loop()
9. Disconnect-Debounce: 30s Disconnect → Portal oeffnen (main.cpp:2474-2497)
10. MQTT Persistent Failure: 5min OPEN → Portal oeffnen (main.cpp:2506-2538)
11. sensorManager.performAllMeasurements()
12. actuatorManager.processActuatorLoops()   [Timer-Checks hier]
13. publishAllActuatorStatus() alle 30s
14. healthMonitor.loop()
15. delay(10)
```

**"Heartbeat vom Server erwartet" Check:** Nicht vorhanden.
ESP sendet Heartbeats (alle 60s), prueft aber nicht ob `heartbeat_ack` ausbleibt. Kein Timeout-Handler der Aktoren stoppt wenn Server nicht mehr antwortet.

**"Verbindung verloren seit X ms" Check:**
Vorhanden — aber nur fuer Portal-Oeffnen, nicht fuer Aktor-Safety:
- 30s Disconnect → Portal (main.cpp:2484)
- 5min MQTT Failure → Portal (main.cpp:2514)
Kein direkter Aktor-Stop bei diesen Triggern.

**`processActuatorLoops()` in jedem Zyklus:** Ja — Zeile 2547, ohne Bedingung.

---

### Block 2: RegisteredActuator Struct & Aktor-Zustand nach Reconnect

**Vollstaendige Felder `RegisteredActuator` (actuator_manager.h:62):**
```cpp
bool in_use = false;
uint8_t gpio = 255;
std::unique_ptr<IActuatorDriver> driver;
ActuatorConfig config;
bool emergency_stopped = false;
unsigned long command_duration_end_ms = 0;
```

**Relevante Felder — Existenz:**

| Feld | Vorhanden? | Wo |
|------|-----------|-----|
| `last_command_timestamp` | JA — `ActuatorConfig::last_command_ts` | actuator_types.h:56 |
| `last_server_contact` | NEIN | nicht implementiert |
| `safe_state` | NEIN (nur `default_state`) | kein Zustandsziel bei Disconnect |
| `default_state` | JA — `bool default_state = false` | actuator_types.h:51 |

`default_state` ist kommentiert als "Failsafe state if config lost", wird aber nur beim `begin()` als initialer GPIO-Wert verwendet (pump_actuator.cpp:62). Keine Logik wendet diesen Wert bei MQTT-Disconnect an.

**LWT-Konfiguration (mqtt_client.cpp:196-203):**
```
Topic:   kaiser/{kaiser_id}/esp/{esp_id}/system/will
Payload: {"status":"offline","reason":"unexpected_disconnect","timestamp":<unix_ts>}
QoS:     1 (At Least Once)
Retain:  true
```
Broker-Timeout: 90s (1.5 x KeepAlive=60s). LWT wird vom Broker publiziert.

**Nach MQTT-Reconnect — Aktor-Zustand:**
Aktoren behalten letzten Zustand in RAM. Kein Reset auf `default_state`.

**Nach Reconnect — Config-Request:**
Kein automatischer Config-Request. Subscriptions verloren (clean_session=true). Server muss proaktiv pushen oder ESP neu booten.

---

### Block 6: Bestandsaufnahme existierende Failsafe-Ansaetze

**Grep-Ergebnisse:**

| Pattern | Gefunden? | Kontext |
|---------|-----------|---------|
| `failsafe` / `fail_safe` | NEIN | Nicht implementiert |
| `safe_state` | NEIN | Nicht implementiert als Zustandsziel |
| `default_state` | JA — actuator_types.h:51 | Nur Initialisierungs-Wert |
| `connection_lost` | JA — error_codes.h:126 | Nur Error-Code-Definition, kein Aktor-Eingriff |
| `mqtt_disconnected` | NEIN direkt | `MQTT_DISCONNECTED` als PubSubClient State-String |
| `offline_mode` | NEIN | Nicht implementiert |
| `heartbeat_ack` | JA — main.cpp:845, 1897 | Nur Registration-Gate, kein Timeout-Handler |
| `server_heartbeat` | NEIN | Nicht implementiert |
| `server_ping` | NEIN | Nicht implementiert |

**Auskommentierte / unfertige Implementierungen:**
- `main.cpp:461-467`: Watchdog-3x-SafeMode auskommentiert (TODO-Kommentar)
- `main.cpp:454-459`: Watchdog-Diagnostik NVS-Load auskommentiert

**Konfigurierbare Timeout-Felder in `ActuatorConfig`:**
- `max_runtime_ms` — vorhanden aber nicht via MQTT-Config setzbar
- `default_state` — vorhanden aber nicht als Disconnect-Fallback verwendet
- Kein `connection_timeout_ms` Feld
- Kein `on_disconnect_action` Feld

---

## 4. Extended Checks (eigenstaendig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| Serial-Log (`esp32_serial.log`) | Nicht verfuegbar — reine statische Analyse |
| Docker / MQTT / DB | Nicht geprueft — kein laufendes System erforderlich |
| Grep: Failsafe-Pattern in `src/` | Keine Failsafe-Implementierungen gefunden (Details Block 6) |

---

## 5. Bewertung & Empfehlung

### Root-Cause der Safety-Luecke

Die Firmware wurde bewusst Server-Centrisch designed (Kommentare im Code: "ESP triggert NICHT
selbst Emergency (nur bei Server-Command)"). Der Preis dieser Architektur: Wenn der Server nicht
mehr erreichbar ist, gibt es keinen lokalen Fallback der Aktoren in einen sicheren Zustand bringt.

### IST-Zustand (zusammengefasst)

**Vorhanden:**
- Emergency-Stop Mechanismus (global + per-Aktor, beide Ebenen)
- Runtime-Protection: 1h Default-Timeout → Emergency-Stop (actuator_manager.cpp:559)
- Command-Duration Auto-OFF via MQTT `duration` Payload (actuator_manager.cpp:536)
- Circuit Breaker: MQTT 5 Failures → 30s OPEN, WiFi 10 Failures → 60s OPEN
- LWT: `{status:"offline"}`, QoS 1, retain=true, nach 90s Broker-Timeout
- `default_state` Feld in `ActuatorConfig` (Initialisierung, nicht Disconnect-Handler)
- 30s Disconnect → Provisioning-Portal (nur UI-Recovery, kein Aktor-Eingriff)
- Watchdog Production: 60s Timeout mit Auto-Reboot

**Fehlend (Safety-kritisch):**
1. **Kein autonomer Aktor-Stop bei MQTT-Disconnect** — Aktoren laufen weiter (bis zu 1h)
2. **Kein konfigurierbares `connection_timeout_ms` pro Aktor** — 1h ist zu lang fuer Pumpen
3. **Kein `on_disconnect_action`** — kein konfigurierbares Verhalten bei Verbindungsverlust
4. **Subscriptions nach Reconnect nicht wiederhergestellt** — Commands gehen verloren bei clean_session=true
5. **`default_state` bei Disconnect nicht angewendet** — Feld vorhanden aber ungenutzt als Fallback
6. **Kein `heartbeat_ack` Timeout-Check** — ESP merkt nicht wenn Server aufgehoert hat zu antworten
7. **`max_runtime_ms` nicht via Server-Config konfigurierbar** — fest 1h fuer alle Aktor-Typen

### Naechste Schritte (Empfehlung)

1. **Dringend:** `on_disconnect_action` Feld in `ActuatorConfig` einfuehren (enum: KEEP / OFF / EMERGENCY). Default: OFF fuer pump/valve, KEEP fuer relay.
2. **Dringend:** Disconnect-Handling in `mqttClient::handleDisconnection()` oder nach Debounce: Aktoren gemaess `on_disconnect_action` steuern.
3. **Mittel:** `connection_timeout_ms` pro Aktor konfigurierbar (aktuell hardcoded 1h).
4. **Mittel:** Subscriptions nach MQTT-Reconnect wiederherstellen (clean_session=0 oder Re-Subscribe in `connectToBroker()`).
5. **Niedrig:** Watchdog-3x-SafeMode-TODO implementieren (main.cpp:461).
6. **Niedrig:** `max_runtime_ms` in `parseActuatorDefinition()` aus MQTT-Payload lesbar machen.

---

## 6. Code-Referenz Schnellzugriff

| Befund | Datei:Zeile |
|--------|-------------|
| `default_state = false` (Failsafe-Kommentar) | `actuator_types.h:51` |
| `max_runtime_ms = 3600000UL` | `actuator_types.h:33` |
| `emergency_stopped` per Aktor | `actuator_manager.h:67` |
| `command_duration_end_ms` | `actuator_manager.h:68` |
| Emergency-Stop via MQTT | `main.cpp:910-914` |
| Broadcast-Emergency via MQTT | `main.cpp:936-966` |
| Runtime-Timeout → Emergency | `actuator_manager.cpp:559-565` |
| F1 Command-Duration Auto-OFF | `actuator_manager.cpp:536-545` |
| processActuatorLoops() komplett | `actuator_manager.cpp:527-581` |
| controlActuator emergency-check | `actuator_manager.cpp:393-396, 437-440` |
| `handleDisconnection()` MQTT | `mqtt_client.cpp:813-835` |
| `handleDisconnection()` WiFi | `wifi_manager.cpp:256-271` |
| KeepAlive = 60s | `main.cpp:725` |
| LWT Topic / Payload / QoS / Retain | `mqtt_client.cpp:196-203` |
| clean_session | nicht gesetzt → PubSubClient default = true |
| Subscriptions nur in setup() | `main.cpp:823-846` |
| 30s Disconnect → Portal | `main.cpp:2478-2497` |
| 5min MQTT Failure → Portal | `main.cpp:2506-2538` |
| Pump emergencyStop() | `pump_actuator.cpp:198-202` |
| Valve emergencyStop() | `valve_actuator.cpp:201-208` |
| Relay driver = PumpActuator | `actuator_manager.cpp:181` |
| Watchdog Production: 60s | `main.cpp:429` |
| Watchdog-3x-TODO | `main.cpp:461-467` |
| clearEmergencyStop() Flow | `safety_controller.cpp:91-103` |
| resumeOperation() | `safety_controller.cpp:113-123` |
