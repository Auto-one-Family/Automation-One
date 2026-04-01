# ESP32 Dev Report: Bug-Fix P4 is_active-Initialisierung + P1 Race Condition

## Modus: B (Implementierung)

## Auftrag
Zwei bestätigte Bugs im Offline-Safety-System fixen:
- Bug 1 (KRITISCH): P4 `is_active` nicht aus Hardware-State initialisiert beim Aktivieren
- Bug 2 (MITTEL): P1-Timer Race Condition beim MQTT Reconnect

---

## Codebase-Analyse

### Analysierte Dateien
- `El Trabajante/src/services/safety/offline_mode_manager.cpp` — vollständig
- `El Trabajante/src/services/communication/mqtt_client.cpp` — Zeilen 774–840 (mqtt_event_handler)
- `El Trabajante/src/services/communication/mqtt_client.h` — vollständig
- `El Trabajante/src/main.cpp` — Zeilen 100–222 (g_last_server_ack_ms Deklaration + onMqttConnectCallback)
- `El Trabajante/src/services/actuator/actuator_manager.h/.cpp` — getActuatorConfig Signatur
- `El Trabajante/src/models/actuator_types.h` — ActuatorConfig.current_state, ActuatorConfig.gpio Default

### Gefundene Patterns
- `g_mqtt_connected` ist bereits als `extern std::atomic<bool>` in mqtt_client.h deklariert und in mqtt_client.cpp definiert — exakt dieses Pattern wurde für `g_last_server_ack_ms` repliziert
- `getActuatorConfig(uint8_t gpio)` gibt `ActuatorConfig()` mit `gpio=255` zurück wenn nicht gefunden
- `ActuatorConfig.current_state` = `false` als Default; `gpio` Default = `255`
- `activateOfflineMode()` wird aus `checkDelayTimer()` aufgerufen (30s nach Disconnect)

---

## Qualitätsprüfung (8-Dimensionen)

| # | Dimension | Status |
|---|-----------|--------|
| 1 | Struktur & Einbindung | actuator_manager.h bereits included in offline_mode_manager.cpp; mqtt_client.h bekommt neue extern-Deklaration analog zum bestehenden g_mqtt_connected Pattern |
| 2 | Namenskonvention | snake_case, member suffix _, UPPER_SNAKE_CASE Konstanten — alles konsistent |
| 3 | Rückwärtskompatibilität | Keine MQTT-Payload- oder NVS-Änderungen |
| 4 | Wiederverwendbarkeit | getActuatorConfig() wird bereits von anderen Stellen genutzt; kein paralleler Code |
| 5 | Speicher & Ressourcen | Schleife über max. MAX_OFFLINE_RULES Einträge (~8), keine heap-Allokationen |
| 6 | Fehlertoleranz | Guard: `actuatorManager.isInitialized()` + `cfg.gpio != 255` — kein Crash bei nicht-konfiguriertem Aktor |
| 7 | Seiteneffekte | Kein GPIO-Konflikt; `g_last_server_ack_ms` war static in main.cpp und wird jetzt global (kein anderer Code hatte bereits extern-Zugriff) |
| 8 | Industrielles Niveau | atomic<uint32_t>.store() ist ISR-safe; is_active-Init erfolgt einmalig bei Aktivierung; kein Blocking |

---

## Cross-Layer Impact

Keine Server-seitigen Änderungen nötig. Beide Fixes sind rein firmware-intern:
- Kein MQTT-Topic geändert
- Kein NVS-Key geändert
- Kein Error-Code geändert

---

## Ergebnis

### Bug 1: P4 is_active nicht aus Hardware-State initialisiert

**Datei:** `El Trabajante/src/services/safety/offline_mode_manager.cpp`

**Änderung:** In `activateOfflineMode()` — vor dem LOG_W — neue Schleife eingefügt die `is_active` pro Regel aus `actuatorManager.getActuatorConfig(gpio).current_state` initialisiert.

Guards:
- `offline_rule_count_ > 0 && actuatorManager.isInitialized()` — äußere Bedingung
- `rule.enabled && rule.actuator_gpio != 255` — pro Regel
- `cfg.gpio != 255` — Aktor tatsächlich konfiguriert

Logging: LOG_I für jede initialisierte Regel mit GPIO und State (ON/OFF).

**Warum nur in activateOfflineMode():** `parseOfflineRules()` und `loadOfflineRulesFromNVS()` laufen während der Konfiguration (online), wo Aktor-State server-kontrolliert ist. `deactivateOfflineMode()` setzt bewusst auf false zurück (kein Server-State bekannt nach Reconnect). Nur der Aktivierungszeitpunkt kennt den tatsächlichen Aktor-State der server-Seite.

### Bug 2: Race Condition g_last_server_ack_ms

**3 Dateien geändert:**

**1. `El Trabajante/src/main.cpp`**
- `static std::atomic<uint32_t> g_last_server_ack_ms{0}` → `std::atomic<uint32_t> g_last_server_ack_ms{0}` (static entfernt)
- Kommentar erklärt den Grund (Race-Fix)

**2. `El Trabajante/src/services/communication/mqtt_client.h`**
- `extern std::atomic<uint32_t> g_last_server_ack_ms;` hinzugefügt, direkt nach der bestehenden `g_mqtt_connected` extern-Deklaration (gleiche Sektion, gleiche Namenskonvention)

**3. `El Trabajante/src/services/communication/mqtt_client.cpp`**
- In `mqtt_event_handler`, Case `MQTT_EVENT_CONNECTED`: `g_last_server_ack_ms.store(millis())` direkt nach `g_mqtt_connected.store(true)` eingefügt
- Dies schließt das Race-Window: Safety-Task (Core 1) kann nach dem atomic-Store auf g_mqtt_connected noch die alte Zeit lesen; mit dem sofortigen Reset ist g_last_server_ack_ms bereits aktuell bevor der Safety-Task isConnected()==true sieht
- Der zweite Reset in `onMqttConnectCallback()` bleibt (harmlos, leicht aktuellerer Timestamp)

---

## Verifikation

```
Environment    Status    Duration
-------------  --------  ------------
esp32_dev      SUCCESS   00:00:09.710

RAM:   [==        ]  21.3% (used 69652 bytes from 327680 bytes)
Flash: [========= ]  87.0% (used 1368601 bytes from 1572864 bytes)
```

Exit-Code 0, keine Errors, keine neuen Warnings.

---

## Empfehlung

Kein weiterer Agent nötig. Beide Fixes sind firmware-intern. Hardware-Test empfohlen um Bug 1 zu verifizieren: Broker-Disconnect mit laufendem Aktor (GPIO=ON) und prüfen ob P4 beim Aktivieren den korrekten is_active=true übernimmt.
