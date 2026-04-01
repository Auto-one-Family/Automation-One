# ESP32 Dev Report: Fix Bugs 1, 3, 4 — Post-Boot Bugs ESP_EA5484

## Modus: B (Implementierung)

## Auftrag
Drei Post-Boot-Bugs in der ESP32 Firmware beheben:
- Bug 4 (HOCH): P4-Rules laufen weiter nach Server-Reconnect
- Bug 3 (MITTEL): Server-Override-Spam bei Aktor-Commands
- Bug 1 (HOCH): SHT31 Sensor Overwrite — sensor_count=1 statt 2

---

## Codebase-Analyse

**Analysierte Dateien:**
- `El Trabajante/src/services/safety/offline_mode_manager.cpp` (vollständig)
- `El Trabajante/src/services/sensor/sensor_manager.cpp` (Zeilen 208–347, 1530–1572)
- `El Trabajante/src/services/sensor/sensor_manager.h` (Zeilen 188–197)

**Gefundene Patterns:**
- Singleton + extern-Referenz (`offlineModeManager`)
- State-Machine mit `OfflineMode::ONLINE/DISCONNECTED/OFFLINE_ACTIVE/RECONNECTING`
- `deactivateOfflineMode()` Zeile 352 — korrekt, nicht anfassen
- `findSensorConfig()` — GPIO + optionale OneWire/I2C-Adresse Lookup
- `configureSensor()` — multi-value I2C Zweig bei Zeile 252 (Branch-Bedingung: `!existing && is_i2c_sensor`)

---

## Qualitätsprüfung (8 Dimensionen)

| # | Dimension | Ergebnis |
|---|-----------|----------|
| 1 | Struktur & Einbindung | Keine neuen Dateien, nur 2 bestehende CPPs + 1 Header geändert |
| 2 | Namenskonvention | snake_case Member, camelCase Methoden — konform |
| 3 | Rückwärtskompatibilität | Keine MQTT-Payloads, keine NVS-Keys geändert. `findSensorConfig()`-Parameter ist optional (Default `""`), alle existierenden Aufrufe unverändert |
| 4 | Wiederverwendbarkeit | Existierender `deactivateOfflineMode()` wiederverwendet (Bug 4). Kein Parallel-Code gebaut |
| 5 | Speicher & Ressourcen | Kein zusätzlicher Heap. Neuer `sensor_type`-Parameter ist Stack-String-Referenz, kein dynamisches Allokieren |
| 6 | Fehlertoleranz | Bug 4: `deactivateOfflineMode()` enthält eigene Guards. Bug 1: Existing Lookup unverändert für Non-I2C-Pfad — OneWire bleibt korrekt |
| 7 | Seiteneffekte | Bug 1 Call-Site: `sensor_type` wird nur für `is_i2c_sensor == true` übergeben → DS18B20 auf demselben GPIO nicht betroffen. Alle anderen `findSensorConfig()`-Aufrufe (Zeilen 634, 704, 713, 755, 1077, 1386, 1519) erhalten implizit `sensor_type=""` → Verhalten unverändert |
| 8 | Industrielles Niveau | Minimal-invasive Fixes. Kein Blocking. Watchdog-kompatibel |

---

## Fix-Details

### Bug 4 — `onServerAckReceived()` ignoriert OFFLINE_ACTIVE

**Datei:** `El Trabajante/src/services/safety/offline_mode_manager.cpp`, Zeile 45

**Root-Cause:** Wenn nur der Server-Prozess abstürzt (MQTT-Broker bleibt verbunden), löst `onMQTTConnect()` nie aus → `onReconnect()` wird nie aufgerufen → `mode_` bleibt `OFFLINE_ACTIVE` statt zu `RECONNECTING` zu wechseln. Der Guard `mode_ == OfflineMode::RECONNECTING` in `onServerAckReceived()` ist dann `false` → `deactivateOfflineMode()` wird nicht aufgerufen → P4-Rules laufen weiter auch wenn der Server wieder ACK sendet.

**Fix:** `OFFLINE_ACTIVE` als zweite Bedingung in der `if`-Abfrage ergänzt:
```cpp
if (mode_ == OfflineMode::RECONNECTING || mode_ == OfflineMode::OFFLINE_ACTIVE) {
    deactivateOfflineMode();
}
```
Kommentar erklärt das Server-Prozess-Restart-Szenario.

---

### Bug 3 — `setServerOverride()` loggt bei jedem Aktor-Command

**Datei:** `El Trabajante/src/services/safety/offline_mode_manager.cpp`, Zeile 301

**Root-Cause:** `server_override = true` und der zugehörige `LOG_I` werden bei jedem Aktor-Command-Eingang ausgeführt, auch wenn das Flag bereits gesetzt ist. Bei häufigen Commands entsteht Log-Spam.

**Fix:** Guard `if (!offline_rules_[i].server_override)` um Flag-Setzen + Log gewickelt:
```cpp
if (!offline_rules_[i].server_override) {
    offline_rules_[i].server_override = true;
    LOG_I(TAG, "[SAFETY-P4] Server override set for actuator GPIO " + String(actuator_gpio));
}
```
Aktor-Command-Ausführung selbst (aufgerufen vor `setServerOverride()`) ist unberührt.

---

### Bug 1 — `findSensorConfig()` unterscheidet nicht nach `sensor_type` für I2C Multi-Value-Sensoren

**Dateien:**
- `El Trabajante/src/services/sensor/sensor_manager.cpp` Zeilen 1534–1572 (beide Überladungen)
- `El Trabajante/src/services/sensor/sensor_manager.cpp` Zeile 249 (Call-Site)
- `El Trabajante/src/services/sensor/sensor_manager.h` Zeilen 191–194

**Root-Cause:** SHT31 liefert `sht31_temp` und `sht31_humidity` — beide mit GPIO=0 und I2C-Adresse=0x44. `findSensorConfig(gpio=0, onewire="", i2c=0x44)` findet beim zweiten Config-Push immer den ersten eingetragenen Sensor zurück (`existing != nullptr`). Der `!existing && is_i2c_sensor`-Zweig bei Zeile 252 (Multi-Value-Add-Logik) wird nie erreicht. Stattdessen geht der Code in den Update-Zweig (Zeile 313) → `*existing = config` überschreibt `sht31_temp` mit `sht31_humidity` → `sensor_count_` bleibt 1.

**Fix — 3 Stellen:**

1. **Header `sensor_manager.h`:** Optionalen Parameter `const String& sensor_type = ""` an beide Überladungen ergänzt.

2. **Implementierung `sensor_manager.cpp`** (nicht-const + const): Nach dem I2C-Adress-Check zusätzlicher Guard:
   ```cpp
   if (sensor_type.length() > 0) {
       if (sensors_[i].sensor_type != sensor_type) continue;
   }
   ```

3. **Call-Site Zeile 249:** `sensor_type` wird nun conditional übergeben:
   ```cpp
   SensorConfig* existing = findSensorConfig(config.gpio,
       config.onewire_address, effective_i2c_address,
       is_i2c_sensor ? config.sensor_type : String(""));
   ```
   - I2C-Sensoren: `sensor_type` wird übergeben → `sht31_temp` und `sht31_humidity` sind getrennte Einträge
   - OneWire/ADC: leerer String → ROM-Code unterscheidet DS18B20-Instanzen wie bisher; type-change updates bleiben möglich

**Alle anderen `findSensorConfig()`-Aufrufe** übergeben keinen vierten Parameter → `sensor_type=""` (Default) → Verhalten vollständig unverändert.

---

## Cross-Layer Impact

| Komponente | Betroffen? | Aktion |
|------------|-----------|--------|
| Server-MQTT-Handler | Nein | Keine Payload-Änderung |
| NVS-Keys | Nein | Keine Config-Struktur geändert |
| MQTT Topics | Nein | Keine Topic-Änderung |
| Error-Codes | Nein | Keine neuen Error-Codes |
| OneWire DS18B20 | Nicht betroffen | Call-Site übergibt `sensor_type=""` für Non-I2C |

---

## Verifikation

```
Environment    Status    Duration
esp32_dev      SUCCESS   00:00:09.177
```

RAM:   21.3% (69652 / 327680 bytes)
Flash: 87.2% (1371633 / 1572864 bytes)
**Exit-Code: 0 — keine Errors**

---

## Empfehlung

- SHT31 Config-Push mit zwei Sub-Types `sht31_temp` + `sht31_humidity` → erwartetes Log: `sensor_count=2`, kein `Sensor type changed`
- Server-Prozess neu starten (MQTT-Broker bleibt oben) → nach Heartbeat-ACK: `[SAFETY-P4] Offline mode DEACTIVATED - back to server control`
- Mehrere Aktor-Commands auf demselben GPIO → `Server override set` erscheint genau einmal pro Aktor
