# Wokwi Local Validation Report

> **Datum:** 2026-02-22
> **Status:** 0/10 PASS (FUNDAMENTAL DESIGN FLAW)
> **Blocker:** Wokwi Quota + falsche MQTT-Injection-Methode
> **Agent:** system-control (Ops-Modus)

---

## Voraussetzungen

| Check | Status | Details |
|-------|--------|---------|
| wokwi-cli Version | OK | v0.19.1 (e0043c48bf15) |
| WOKWI_CLI_TOKEN | OK | Gesetzt in Environment |
| Firmware Build (`wokwi_simulation`) | OK | SUCCESS in 82s (Flash: 90.4%, RAM: 22.4%) |
| `wokwi.toml` | OK | firmware/elf Pfade korrekt, gateway=true, rfc2217=4000 |
| `diagram.json` | OK | ESP32 DevKit + DS18B20 + DHT22 + Pot + 3 LEDs + Emergency Button |
| Mosquitto MQTT Broker | OK | `automationone-mqtt` running, Port 1883 |
| **Wokwi CI Quota** | **EXHAUSTED** | Hobby Plus monthly CI minutes aufgebraucht |
| Baseline-Test (boot_full.yaml) | **BLOCKED** | Quota-Limit verhindert Ausfuehrung |

---

## KRITISCHER BEFUND: Fundamentaler Design-Fehler

### Problem

**Alle 10 Error-Injection-Szenarien verwenden `set-control` mit `part-id: "mqtt"` — dieses Feature existiert in Wokwi NICHT.**

Jedes Szenario enthaelt Steps wie:

```yaml
- set-control:
    part-id: "mqtt"
    control: "inject"
    value: |
      {
        "topic": "kaiser/god/esp/ESP_00000001/config",
        "payload": { ... }
      }
```

### Beweis

1. **Wokwi Dokumentation** (https://docs.wokwi.com/wokwi-ci/automation-scenarios):
   `set-control` funktioniert NUR mit physischen Simulationsparts die Automation Controls haben.
   Unterstuetzte Parts: Photoresistor, HX711, Joystick, MPU6050, Potentiometer, Push Button.
   **Kein MQTT-Part, kein `inject`-Control.**

2. **diagram.json** enthaelt keinen Part mit `id: "mqtt"`:
   Vorhandene Part-IDs: `esp`, `temp1`, `led1`, `r1`, `r2`, `dht22`, `pot_analog`,
   `led_red`, `r_led_red`, `led_blue`, `r_led_blue`, `btn_emergency`.

3. **Funktionierende Szenarien** (Jobs 5-11 in CI) verwenden einen anderen Ansatz:
   - YAML enthaelt NUR `wait-serial` und `delay` Steps
   - MQTT-Injection passiert EXTERN via `mosquitto_pub` in CI-Pipeline-Schritten
   - Beispiel: `actuator_led_on.yaml` sagt explizit `# Requires MQTT injection: mosquitto_pub`

### Konsequenz

- **Alle 10 Szenarien werden IMMER FAIL** — unabhaengig vom Quota-Status
- **CI Pipeline Job 16** wird ebenfalls FAIL fuer alle 10 Tests
- Wokwi CLI wird entweder einen Fehler bei unbekanntem Part werfen oder den `set-control` Step ignorieren, woraufhin `wait-serial` in ein Timeout laeuft

---

## Ergebnisse pro Szenario (Statische Analyse)

### 1. error_sensor_timeout.yaml — PREDICTED FAIL

**Befehl:** `wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/11-error-injection/error_sensor_timeout.yaml`

**Erwartetes Verhalten:** Sensor auf GPIO 32 ohne Device → SENSOR_READ_FAILED (1040)

**Analyse:**
- `set-control` mit `part-id: "mqtt"` wird scheitern → Config-MQTT erreicht ESP nie
- `wait-serial: "SENSOR_READ_FAILED"` wird in Timeout laufen
- **Logik korrekt:** Error-Code 1040 existiert in Firmware, GPIO 32 ist ein valider Pin
- **Sekundaeres Problem:** Keines — nach MQTT-Fix sollte das Szenario funktionieren

**Fix:** Passives YAML + externer `mosquitto_pub`

---

### 2. error_mqtt_disconnect.yaml — PREDICTED FAIL

**Befehl:** `wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/11-error-injection/error_mqtt_disconnect.yaml`

**Erwartetes Verhalten:** MQTT-Traffic nach Config → "Published" + "heartbeat"

**Analyse:**
- `set-control` scheitert → Kein Config-Payload → Kein Sensor-Traffic → "Published" nie auf Serial
- **Szenario-Name irrefuehrend:** Testet NICHT MQTT-Disconnect, sondern MQTT-Aktivitaet nach Config
- **Logik OK:** DS18B20 auf GPIO 4 (ist in diagram.json angeschlossen) → wuerde Published erzeugen

**Fix:** Passives YAML + externer `mosquitto_pub`. Szenarioname ueberdenken.

---

### 3. error_gpio_conflict.yaml — PREDICTED FAIL

**Befehl:** `wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/11-error-injection/error_gpio_conflict.yaml`

**Erwartetes Verhalten:** Zwei Sensoren auf GPIO 4 → "conflict"

**Analyse:**
- Zwei `set-control`-Steps scheitern → Keine Configs → Kein Conflict
- **Logik korrekt:** ConfigErrorCode::GPIO_CONFLICT existiert (Zeile 209 error_codes.h)
- **Sekundaeres Problem:** Zweite Config ersetzt erste (Full-Config-Replacement vs. Delta).
  Das Config-Protokoll sendet immer die GESAMTE Config. Zweiter Config-Push mit GPIO 4 als
  `moisture` wuerde vorherigen DS18B20 auf GPIO 4 ersetzen, NICHT conflict erzeugen.
  Conflict tritt nur auf wenn INNERHALB einer Config zwei Sensoren denselben GPIO nutzen.

**Fix:** Passives YAML + externer `mosquitto_pub`. ZUSAETZLICH: Config-Payload anpassen —
beide Sensoren muessen IN DER GLEICHEN Config-Message auf GPIO 4 definiert sein:
```json
{
  "sensors": [
    {"gpio": 4, "sensor_type": "temp_ds18b20", "sensor_name": "S1", "active": true},
    {"gpio": 4, "sensor_type": "moisture", "sensor_name": "S2", "active": true}
  ],
  "actuators": []
}
```

---

### 4. error_watchdog_trigger.yaml — PREDICTED FAIL

**Befehl:** `wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/11-error-injection/error_watchdog_trigger.yaml`

**Erwartetes Verhalten:** Hochlast → heartbeat weiterhin aktiv (Watchdog ueberlebt)

**Analyse:**
- Drei `set-control`-Steps scheitern → Keine Config, kein Emergency, kein Clear
- `wait-serial: "heartbeat"` koennte trotzdem matchen (Boot-Heartbeat nach ~60s)
- **Aber:** Vorherige Steps `wait-serial: "config_response"` wird timeout-en weil kein Config gesendet
- **Logik OK:** Szenario testet Stabilitaet unter Last, nicht Watchdog-Failure

**Fix:** Passives YAML + externer `mosquitto_pub` (3 Messages mit Timing)

---

### 5. error_config_invalid_json.yaml — PREDICTED FAIL

**Befehl:** `wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/11-error-injection/error_config_invalid_json.yaml`

**Erwartetes Verhalten:** Malformed JSON → JSON_PARSE_ERROR auf Serial

**Analyse:**
- `set-control` scheitert → Malformed JSON erreicht ESP nie
- **Logik korrekt:** ConfigErrorCode::JSON_PARSE_ERROR existiert (Zeile 206 error_codes.h)
- **Sekundaeres Problem:** Payload im YAML ist ein JSON-String mit fehlendem Closing-Brace.
  Wenn via `mosquitto_pub` gesendet: Muss als RAW String gesendet werden, nicht als JSON.

**Fix:** Passives YAML + externer `mosquitto_pub` mit Raw-String-Payload:
```bash
mosquitto_pub -t "kaiser/god/esp/ESP_00000001/config" \
  -m '{"sensors": [{"gpio": 4, "sensor_type": "temp_ds18b20", "broken'
```

---

### 6. error_actuator_timeout.yaml — PREDICTED FAIL

**Befehl:** `wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/11-error-injection/error_actuator_timeout.yaml`

**Erwartetes Verhalten:** Actuator ON mit `max_runtime_ms: 3000` → timeout nach 3s

**Analyse:**
- Zwei `set-control`-Steps scheitern → Kein Config, kein Command
- **Logik Risiko:** `max_runtime_ms` im Actuator-Command muss von Firmware interpretiert werden.
  Pruefe ob ActuatorManager `max_runtime_ms` aus dem Command-Payload liest und einen Timer setzt.
  Falls ja: Timeout-Log muesste "timeout" enthalten.
- wait-serial "timeout" ist ein sehr generischer Pattern — koennte auch durch Wokwi-Timeout matchen

**Fix:** Passives YAML + externer `mosquitto_pub` (2 Messages: Config, dann Command nach Delay)

---

### 7. error_emergency_cascade.yaml — PREDICTED FAIL

**Befehl:** `wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/11-error-injection/error_emergency_cascade.yaml`

**Erwartetes Verhalten:** Config → Activate → Emergency → Clear → Emergency → de-energized

**Analyse:**
- 5 `set-control`-Steps scheitern → Nichts passiert
- **Logik korrekt:** Emergency-Cascade ist das komplexeste Szenario
  - "BROADCAST EMERGENCY-STOP RECEIVED" ist dokumentierter Serial-Output
  - "EMERGENCY-CLEAR" ist dokumentierter Serial-Output
  - "de-energized" muss in der Firmware verifiziert werden
- Timing ist kritisch: Config → 2s → ON → 1s → Emergency → 0.5s → Clear → 0.5s → Emergency

**Fix:** Passives YAML + externer `mosquitto_pub` (5 Messages mit praezisem Timing).
Komplexestes Szenario — braucht ggf. ein Shell-Script statt inline CI-Steps.

---

### 8. error_i2c_bus_stuck.yaml — PREDICTED FAIL

**Befehl:** `wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/11-error-injection/error_i2c_bus_stuck.yaml`

**Erwartetes Verhalten:** I2C Sensor an nicht-existierender Adresse → I2C-Fehlermeldung

**Analyse:**
- `set-control` scheitert → Kein Config → Kein I2C-Versuch
- **Sekundaeres Problem:** `sensor_type: "temperature_sht31"` — verifizieren ob dieser Sensor-Typ
  in der Firmware registriert ist. SHT31 ist ein I2C-Sensor, aber der Typ-Name muss exakt
  dem Firmware-Sensor-Registry entsprechen.
- GPIO 21 ist Standard-SDA, aber I2C braucht auch SCL (typisch GPIO 22).
  Die Config sendet nur `gpio: 21` — pruefe ob die Firmware automatisch SCL ableitet.
- `i2c_address: 68` (0x44 dezimal) ist die Standard-SHT31-Adresse.
  **Achtung:** In der Config steht `68` — das ist dezimal. Die Firmware muss das korrekt
  als I2C-Adresse interpretieren. Typische I2C-Adressen sind 0x44 = 68 dezimal — passt.
- wait-serial "I2C" ist ein sehr generischer Pattern — sollte matchen bei I2C-Fehlern

**Fix:** Passives YAML + externer `mosquitto_pub`. Sensor-Typ-Name verifizieren.

---

### 9. error_nvs_corrupt.yaml — PREDICTED FAIL

**Befehl:** `wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/11-error-injection/error_nvs_corrupt.yaml`

**Erwartetes Verhalten:** Factory Reset → NVS-bezogene Meldung

**Analyse:**
- `set-control` scheitert → Factory-Reset-Command erreicht ESP nie
- **Sekundaeres Problem:** Topic `kaiser/god/esp/ESP_00000001/system/command` — verifizieren ob
  die Firmware dieses System-Command-Topic subscribed und `factory_reset` verarbeitet.
- wait-serial "NVS" ist generisch — koennte auch beim normalen Boot matchen
  (NVS wird waehrend Phase 1 initialisiert und koennte "NVS" im Log haben)
- **ACHTUNG:** Wenn "NVS" auch beim normalen Boot auf Serial erscheint, wuerde das Szenario
  PASS ergeben auch ohne Factory-Reset — False Positive! Pattern verschaerfen.

**Fix:** Passives YAML + externer `mosquitto_pub`. Pattern verschaerfen auf
z.B. "NVS cleared" oder "factory_reset" statt nur "NVS".

---

### 10. error_heap_pressure.yaml — PREDICTED FAIL

**Befehl:** `wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/11-error-injection/error_heap_pressure.yaml`

**Erwartetes Verhalten:** 8 Sensors + 6 Actuators → System ueberlebt (heartbeat)

**Analyse:**
- `set-control` scheitert → Keine Devices konfiguriert → Kein Heap-Druck
- `wait-serial: "config_response"` wird timeout-en
- **Logik OK:** Szenario testet Stabilitaet, nicht Failure
- Einige GPIOs in der Config (32, 33, 25, 23, 26, 27) sind valide ESP32-Pins

**Fix:** Passives YAML + externer `mosquitto_pub`

---

## Zusammenfassung

### Erfolgsquote: 0/10

Kein Szenario kann erfolgreich ausgefuehrt werden — weder lokal noch in CI.

### Fehler-Kategorien

| Kategorie | Anzahl | Betroffene Szenarien |
|-----------|--------|---------------------|
| **YAML Design-Fehler** (set-control mit nicht-existierendem mqtt-Part) | **10/10** | ALLE |
| Infrastruktur-Blocker (Wokwi Quota erschoepft) | 10/10 | ALLE (lokal) |
| Sekundaer: Config-Logik-Fehler | 1 | error_gpio_conflict (Config-Replacement statt Delta) |
| Sekundaer: False-Positive-Risiko | 1 | error_nvs_corrupt ("NVS" zu generisch) |
| Sekundaer: Szenario-Name irrefuehrend | 1 | error_mqtt_disconnect (testet nicht Disconnect) |
| Sekundaer: Sensor-Typ-Verifizierung noetig | 1 | error_i2c_bus_stuck ("temperature_sht31") |

### Root Cause

Die Szenarien wurden unter der Annahme geschrieben, dass Wokwi CLI ein `set-control`-basiertes
MQTT-Injection-Feature hat (`part-id: "mqtt"`, `control: "inject"`). **Dieses Feature existiert nicht.**

Die bestehenden, funktionierenden Wokwi-Tests (CI Jobs 2-11, 42+ Szenarien) verwenden ein
komplett anderes Pattern:

| Aspekt | Funktionierende Tests (Jobs 2-11) | Error-Injection (Job 16) |
|--------|-----------------------------------|--------------------------|
| YAML-Inhalt | NUR `wait-serial` + `delay` | `set-control` + `wait-serial` + `delay` |
| MQTT-Injection | Extern via `mosquitto_pub` | Im YAML via `set-control` (BROKEN) |
| CI-Pattern | Background wokwi-cli + sleep + mosquitto_pub | Direkt wokwi-cli --scenario |
| Funktioniert | JA | NEIN |

---

## Fix-Vorschlaege

### Fix 1: Szenarien auf passives YAML + externes mosquitto_pub umstellen (EMPFOHLEN)

**Fuer jedes Szenario:**

1. YAML auf NUR `wait-serial` + `delay` reduzieren
2. Kommentar im YAML: `# Requires MQTT injection: mosquitto_pub to topic X`
3. CI Pipeline Job 16 umstrukturieren auf Background-Pattern

**Beispiel fuer `error_sensor_timeout.yaml` (NEU):**

```yaml
# Error-Injection: Sensor Read Timeout
# Requires MQTT injection:
#   mosquitto_pub -t "kaiser/god/esp/ESP_00000001/config" \
#     -m '{"sensors":[{"gpio":32,"sensor_type":"temp_ds18b20","sensor_name":"GhostSensor","active":true,"raw_mode":true}],"actuators":[]}'

name: Error Injection - Sensor Read Timeout
version: 1
steps:
  - wait-serial: "Phase 5: Actuator System READY"
  - wait-serial: "MQTT connected"
  - wait-serial: "SENSOR_READ_FAILED"
```

**CI Pipeline Job 16 (NEU — Auszug fuer ein Szenario):**

```yaml
- name: Run Sensor Timeout Error Test
  run: |
    cd "El Trabajante"
    timeout 120 wokwi-cli . --timeout 90000 \
      --scenario tests/wokwi/scenarios/11-error-injection/error_sensor_timeout.yaml \
      2>&1 | tee error_sensor_timeout.log &
    WOKWI_PID=$!
    sleep 25
    
    docker exec mosquitto mosquitto_pub \
      -t "kaiser/god/esp/ESP_00000001/config" \
      -m '{"sensors":[{"gpio":32,"sensor_type":"temp_ds18b20","sensor_name":"GhostSensor","active":true,"raw_mode":true}],"actuators":[]}'
    
    wait $WOKWI_PID && echo "Sensor Timeout: PASS" || echo "Sensor Timeout: FAIL"
```

### Fix 2: MQTT-Injection Helper Script nutzen

`tests/wokwi/helpers/mqtt_inject.py` existiert bereits. Koennte in CI fuer komplexe
Multi-Message-Szenarien genutzt werden (z.B. error_emergency_cascade mit 5 Messages).

### Fix 3: Sekundaere YAML-Korrekturen

| Szenario | Problem | Fix |
|----------|---------|-----|
| `error_gpio_conflict.yaml` | Zwei separate Configs ersetzen sich statt Conflict | Beide Sensoren in EINE Config-Message packen |
| `error_nvs_corrupt.yaml` | `wait-serial: "NVS"` zu generisch, False-Positive moeglich | Pattern verschaerfen: "NVS cleared" oder "factory_reset" |
| `error_mqtt_disconnect.yaml` | Name suggeriert Disconnect-Test, testet aber MQTT-Aktivitaet | Entweder umbenennen oder echten Disconnect-Test implementieren |
| `error_i2c_bus_stuck.yaml` | `sensor_type: "temperature_sht31"` nicht verifiziert | Gegen Firmware Sensor-Registry pruefen |

### Fix 4: Wokwi Quota

- **Kurzfristig:** Warten bis naechster Monat (Quota-Reset)
- **Mittelfristig:** Wokwi Professional Plan evaluieren
- **Alternativ:** Lokal mit wokwi-for-vscode testen (braucht kein CI Quota)

---

## CI/CD-Readiness

**Status: NEIN — Pipeline wird NICHT gruen laufen.**

| Blocker | Severity | Fix-Aufwand |
|---------|----------|-------------|
| `set-control` mit `part-id: "mqtt"` nicht unterstuetzt | CRITICAL | ~2h (alle 10 YAMLs + CI Job 16 umschreiben) |
| Wokwi Quota exhausted | HIGH | Warten oder Plan-Upgrade |
| error_gpio_conflict Config-Logik | MEDIUM | ~15min (YAML anpassen) |
| error_nvs_corrupt False-Positive | LOW | ~5min (Pattern verschaerfen) |

### Priorisierte Aktionsreihenfolge

1. **ALLE 10 YAML-Dateien** auf passives Pattern umstellen (NUR `wait-serial` + `delay`)
2. **CI Pipeline Job 16** (`wokwi-tests.yml` Zeilen 1408-1480) auf Background-Pattern umstellen
3. **error_gpio_conflict.yaml** Config-Payload korrigieren (beide Sensoren in einer Message)
4. **error_nvs_corrupt.yaml** wait-serial Pattern verschaerfen
5. **Quota erneuern** und alle 10 Szenarien lokal + CI ausfuehren
6. **Sekundaere Verifizierungen:** sensor_type "temperature_sht31", system/command Topic, max_runtime_ms Support

---

## Referenzen

| Datei | Relevanz |
|-------|----------|
| `El Trabajante/tests/wokwi/scenarios/11-error-injection/*.yaml` | 10 Error-Injection Szenarien (ALLE broken) |
| `El Trabajante/tests/wokwi/scenarios/01-boot/boot_full.yaml` | Referenz-Szenario (funktioniert, NUR wait-serial) |
| `El Trabajante/tests/wokwi/scenarios/03-actuator/actuator_led_on.yaml` | Referenz: Passives YAML + mosquitto_pub Pattern |
| `.github/workflows/wokwi-tests.yml` | CI Pipeline: Jobs 2-11 (funktionieren), Job 16 (broken) |
| `El Trabajante/src/models/error_codes.h` | Error-Code Definitionen (alle referenzierten Codes existieren) |
| `El Trabajante/wokwi.toml` | Wokwi-Config (korrekt, gateway=true) |
| `El Trabajante/diagram.json` | Simulation-Layout (kein mqtt-Part) |
| `El Trabajante/platformio.ini` | Build-Config (wokwi_simulation Environment korrekt) |
| `El Trabajante/tests/wokwi/helpers/mqtt_inject.py` | MQTT Helper (nutzbar fuer komplexe Szenarien) |
| `https://docs.wokwi.com/wokwi-ci/automation-scenarios` | Wokwi Docs: set-control NUR fuer physische Parts |
