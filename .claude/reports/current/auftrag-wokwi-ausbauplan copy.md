# Wokwi Ausbauplan — Volle Ausnutzung des Wokwi-Apparats

> **Erstellt:** 2026-03-01
> **Erstellt von:** Automation-Experte (Life-Repo), verifiziert durch Recherche
> **Basis:** Wokwi IST-Zustand Erstanalyse v2.0 (2026-03-01), Recherche-Ergebnis (22 Quellen)
> **Ziel:** Systematischer Ausbau von ~55% auf 82%+ Testabdeckung, alle Wokwi-Features nutzen
> **Charakter:** 7 Stufen, aufeinander aufbauend, jede Stufe eigenstaendig abschliessbar

---

## Gesamtueberblick

```
IST-Zustand (2026-03-01)                      ZIEL-Zustand
┌──────────────────────────┐                   ┌──────────────────────────┐
│ 178 Szenarien (YAML)     │                   │ ~220+ Szenarien          │
│ CI-Header sagt 173 aktiv │ ──── 7 Stufen ──► │ ~210+ aktiv              │
│ ~55-60% Coverage         │                   │ 82%+ Coverage            │
│ Statische Sensorwerte    │                   │ Dynamische Sweeps        │
│ Kein MCP-Server          │                   │ MCP Agent-Driven Testing │
│ ~25% I2C-Tests           │                   │ 70%+ I2C via set-control │
│ Single-Device nur        │                   │ Multi-Device parallel    │
│ Nur wait-serial          │                   │ expect-pin + VCD + mehr  │
└──────────────────────────┘                   └──────────────────────────┘
```

---

## Technische Referenz: set-control (Wokwi Automation Scenarios)

**Zweck:** Diese Referenz ist die Grundlage fuer Stufe 2-4. Alle Parts mit `set-control` Support sind hier vollstaendig aufgelistet. `set-control` aendert den Zustand eines physischen Simulationsteils WAEHREND der Simulation.

**WICHTIG:** `set-control` funktioniert NUR mit Parts die in `diagram.json` definiert sind. Es gibt KEINEN `mqtt`-Part, KEINEN `wifi`-Part, KEINEN `network`-Part. MQTT-Injection muss EXTERN via `mosquitto_pub` erfolgen.

### Vollstaendige Parts-Liste mit set-control Support

| Part-Typ | Part-ID (AutomationOne) | Control | Wertebereich | Beschreibung |
|----------|-------------------------|---------|-------------|--------------|
| `wokwi-ds18b20` | `temp1` | `temperature` | -55 bis 125 °C | Temperatur (NICHT konstant — voller dynamischer Bereich!) |
| `wokwi-dht22` | `dht22` | `temperature` | variabel | Temperatur in Celsius |
| `wokwi-dht22` | `dht22` | `humidity` | variabel | Relative Feuchtigkeit in % |
| `wokwi-potentiometer` | `pot_analog` | `position` | 0.0 bis 1.0 | Drehposition, gemappt auf ADC-Wert |
| `wokwi-pushbutton` | `btn_emergency` | `pressed` | 0 oder 1 | Button-Zustand |
| `wokwi-photoresistor-sensor` | (nicht in diagram.json) | `lux` | variabel | Lichtstaerke |
| `wokwi-mpu6050` | (nicht in diagram.json) | `accX/Y/Z`, `gyroX/Y/Z`, `temperature` | variabel | 6-Achsen IMU |
| `wokwi-hx711` | (nicht in diagram.json) | `weight` | variabel | Gewichtssensor (Waegezelle) |

**NICHT unterstuetzt:** LEDs (nur Output), Widerstaende, ESP32 selbst, I2C-Busse, MQTT, WiFi, Network.

### YAML-Syntax

```yaml
# Temperatur auf DS18B20 setzen
- set-control:
    part-id: "temp1"          # Muss exakt mit "id" in diagram.json uebereinstimmen
    control: "temperature"    # Muss exakt mit dem Control-Namen uebereinstimmen
    value: "35.5"             # Wert als String
```

```yaml
# DHT22 Temperatur und Feuchtigkeit setzen
- set-control:
    part-id: "dht22"
    control: "humidity"
    value: "75"
- set-control:
    part-id: "dht22"
    control: "temperature"
    value: "30"
```

```yaml
# Potentiometer Position setzen (0.0 = ganz links, 1.0 = ganz rechts)
- set-control:
    part-id: "pot_analog"
    control: "position"
    value: "0.75"
```

```yaml
# Emergency-Button druecken/loslassen
- set-control:
    part-id: "btn_emergency"
    control: "pressed"
    value: "1"     # Gedrueckt
- delay: 500ms
- set-control:
    part-id: "btn_emergency"
    control: "pressed"
    value: "0"     # Losgelassen
```

### Alle Automation Scenario Step-Typen (Alpha)

| Step | Parameter | Beschreibung |
|------|-----------|--------------|
| `delay` | Zeit mit Einheit (`200ms`, `5s`) | Pause in Simulation |
| `set-control` | `part-id`, `control`, `value` | Part-Zustand aendern |
| `wait-serial` | Text-String | Wartet auf Serial-Output (Substring-Match) |
| `write-serial` | String oder Byte-Array `[87, 111]` | Sendet an Serial-Port |
| `expect-pin` | `part-id`, `pin`, `expected` | Prueft Pin-Wert (HIGH/LOW) |
| `take-screenshot` | `part-id`, `save-to`, `compare-with` | Display-Screenshot |
| `touch` | `part-id`, `x`, `y`, `duration` | Touch-Tap |
| `touch-press/move/release` | `part-id`, `x`, `y` | Touch-Gesten |

**ACHTUNG:** Automation Scenarios sind **noch in Alpha**. API kann sich aendern.

### expect-pin Syntax

`expect-pin` prueft den Pin am **ESP32-Part** (oder anderem MCU-Part), NICHT an LED-Parts:

```yaml
# RICHTIG: Pin am ESP32 pruefen
- expect-pin:
    part-id: "esp"    # ESP32-Part-ID aus diagram.json
    pin: "2"          # GPIO-Nummer
    expected: 1       # HIGH

# FALSCH: LED-Part hat keinen pin-Parameter fuer expect-pin
# - expect-pin:
#     part-id: "led1"   # ← Funktioniert NICHT
```

### Quellen

- [wokwi-ds18b20 Reference](https://docs.wokwi.com/parts/wokwi-ds18b20)
- [wokwi-dht22 Reference](https://docs.wokwi.com/parts/wokwi-dht22)
- [Automation Scenarios](https://docs.wokwi.com/wokwi-ci/automation-scenarios)
- [Pushbutton](https://docs.wokwi.com/parts/wokwi-pushbutton)
- [Potentiometer](https://docs.wokwi.com/parts/wokwi-potentiometer)

---

## STUFE 1: SOFORT-FIXES (Findings F1-F7)

> **Aufwand:** ~3-4h
> **Voraussetzung:** Keine
> **Coverage-Effekt:** Indirekt — Stabilitaet + Korrektheit, keine neuen Tests
> **Prioritaet:** HOCH — Technische Schulden abbauen bevor neues gebaut wird

### 1.1 Finding F1 (MEDIUM): boot_test.yaml Watchdog-Step

**Problem:** `boot_test.yaml` (Legacy-Datei) erwartet `wait-serial: "Watchdog configured"` — wird in Wokwi NIE ausgegeben weil WDT auf `WDT_DISABLED` gesetzt ist.

**Betroffen:** NUR `boot_test.yaml`. Die Datei `boot_full.yaml` hat KEINEN "Watchdog configured" Step.

> **[VERIFY-PLAN KORREKTUR]:** `boot_test.yaml` existiert NICHT im Repo. In `01-boot/` gibt es nur `boot_full.yaml` und `boot_safe_mode.yaml`. Wenn die Datei gemeint war, muss sie entweder zuerst erstellt werden oder der Fix bezieht sich auf eine bereits geloeschte Legacy-Datei. **Aktion:** Pruefen ob dieser Fix noch relevant ist oder ob F1 entfallen kann.

**Fix:** Die Firmware gibt in Wokwi folgenden String aus (`main.cpp:170`):
```
[WOKWI] Watchdog skipped (not supported in simulation)
```

In `boot_test.yaml` den Step aendern:
```yaml
# Statt: wait-serial: "Watchdog configured"
# Neu:
- wait-serial: "Watchdog skipped"
```

**Betroffene Dateien:**
- `El Trabajante/tests/wokwi/boot_test.yaml` (Legacy) — **[VERIFY-PLAN: Datei existiert NICHT]**

### 1.2 Finding F4 (MEDIUM): sensor_ds18b20_full_flow.yaml

**Problem:** `wait-serial: "Published"` matcht nur bei `LOG_DEBUG`. Default-Loglevel ist `LOG_INFO` → 90s Timeout. `"Published"` steht auf `LOG_D` (DEBUG) in `mqtt_client.cpp:573`.

**Fix:**
```yaml
# Statt: wait-serial: "Published"
# Besser: wait-serial auf LOG_INFO-Level-String
- wait-serial: "heartbeat"  # heartbeat ist INFO-Level und bestaetigt laufenden Sensor-Loop
```

> **[VERIFY-PLAN KORREKTUR]:** `"sensor_data"` existiert NICHT als Log-String in der Firmware. `"Published"` ist LOG_D (mqtt_client.cpp:580). Der naechste INFO-Level-String der Sensor-Aktivitaet bestaetigt ist `"heartbeat"` (bereits Step 7 im Test). Alternativ: `"ConfigResponse published"` (config_response.cpp:48, INFO-Level) wenn vorher ein Config via MQTT gesendet wird. Das bestehende `sensor_ds18b20_full_flow.yaml` hat `"heartbeat"` bereits als letzten Step — der `"Published"` Step kann entfernt oder durch `"heartbeat"` ersetzt werden.

### 1.3 Finding F7 (MEDIUM): Registration Gate in aelteren Szenarien

**Problem:** Ohne Server/geseeded Device: 10s Timeout bevor Sensor/Actuator-Daten publiziert werden. Aeltere Szenarien pruefen `REGISTRATION` nicht.

Die Firmware gibt aus:
- `REGISTRATION CONFIRMED BY SERVER` (`mqtt_client.cpp:768`) — Normalfall
- `Registration timeout - opening gate (fallback)` (`mqtt_client.cpp:538`) — nach 10s Timeout

`wait-serial: "REGISTRATION"` matcht beides als Substring.

**Fix:** In allen Szenarien die Sensor/Actuator-Output erwarten, VOR der Sensor-Pruefung einfuegen:
```yaml
- wait-serial: "MQTT connected"
- wait-serial: "REGISTRATION"  # Gate oeffnet (confirmed oder timeout)
# Erst danach Sensor-Output pruefen
```

**Scope:** Alle Szenarien in 02-sensor, 03-actuator, 04-zone die `wait-serial` fuer Sensor/Actuator-Output nutzen OHNE vorher auf Registration zu warten.

### 1.4 Finding F2/F3 (LOW): Irrefuehrende Szenario-Namen

**Fix:** In `.claude/reference/testing/WOKWI_ERROR_MAPPING.md`:
- `error_watchdog_trigger.yaml` → Beschreibung korrigieren: "Testet System-Stabilitaet unter Last, NICHT echten WDT-Trigger (WDT in Wokwi deaktiviert)"
- `error_nvs_corrupt.yaml` → Beschreibung korrigieren: "Testet MQTT Factory-Reset-Command, NICHT Error-Code 2001 (NVS_INIT_FAILED)"

### 1.5 Finding F5 (LOW): saveSystemConfig() Konsistenz

**Fix:** In `El Trabajante/src/services/config/config_manager.cpp` (Zeile 306: saveZoneConfig, Zeile 1182: saveSystemConfig) den Wokwi-Branch ergaenzen:
```cpp
#ifdef WOKWI_SIMULATION
    // NVS in Wokwi transient — skip fuer Konsistenz mit sensor/actuator
    return true;
#endif
```

**Risiko:** Gering — Wokwi-NVS ist ohnehin pro-Session transient.

### 1.6 Sonstige Fixes

| Fix | Detail | Aufwand |
|-----|--------|---------|
| Szenario-Count | CI-Header sagt 173, tatsaechlich **178** YAML-Dateien (15 Ordner, nicht 14) — in CI-Header + Docs aktualisieren | 15 min |
| `onewire_bus.cpp` Wokwi-Branch | Kommentar ergaenzen warum nur Log (kein Verhalten) | 5 min |

### Akzeptanzkriterien Stufe 1
- [x] ~~F1: boot_test.yaml~~ — **ENTFALLEN** (Datei existiert nicht, war Legacy)
- [x] F4: sensor_ds18b20_full_flow.yaml matcht auf LOG_INFO — `"Published"` (LOG_D) entfernt, `"heartbeat"` (LOG_I) bleibt als Verifikation
- [x] F7: **16 Szenarien** mit Registration Gate Check nacheruestet (02-sensor/4 + 03-actuator/7 + 04-zone/2 + 05-emergency/3)
- [x] F5: saveSystemConfig (Z.1197) + saveZoneConfig (Z.313) in config_manager.cpp mit WOKWI_SIMULATION Guards
- [x] WOKWI_ERROR_MAPPING.md Beschreibungen korrigiert (error_watchdog_trigger + error_nvs_corrupt)
- [x] Szenario-Counts: CI-Header (173) + Makefile (173) sind KORREKT fuer CI-Szenarien. Gesamtzahl auf Disk: **178**
- [ ] **OFFEN:** Build-Verifikation (`pio run -e wokwi_simulation`) — PlatformIO nicht im Pfad, manuell pruefen

---

## STUFE 2: DYNAMISCHE SENSOR-TESTS

> **Aufwand:** ~6-8h
> **Voraussetzung:** Stufe 1
> **Coverage-Effekt:** Sensor-Reading 50% → 75%, Actuator-Command 70% → 80%
> **Prioritaet:** HOCH — Groesster Coverage-Gewinn mit geringstem Aufwand

### 2.1 DS18B20 Dynamische Temperatur (SOFORT MOEGLICH!)

**Erkenntnis aus Recherche (KORREKTUR zur IST-Analyse):** DS18B20 ist NICHT auf konstant 22.5°C beschraenkt! Er hat vollen `set-control` Support mit dynamischem Temperaturbereich von -55°C bis +125°C.

Die IST-Analyse markierte DS18B20 als "konstant 22.5°C, Temperatur-basierte Logic nicht testbar" — das ist **FALSCH**. Quelle: [wokwi-ds18b20 Reference](https://docs.wokwi.com/parts/wokwi-ds18b20).

**Neue Szenarien:**

| Szenario | DS18B20-Werte | Was getestet wird |
|----------|---------------|-------------------|
| `sensor_ds18b20_temp_sweep.yaml` | -10°C → 0°C → 25°C → 50°C → 100°C | Voller Temperaturbereich |
| `sensor_ds18b20_extreme_cold.yaml` | -55°C, -40°C, -20°C | Minusbereich, Grenzwerte |
| `sensor_ds18b20_extreme_hot.yaml` | 80°C, 100°C, 125°C | Hochtemperatur-Bereich |
| `sensor_ds18b20_rapid_change.yaml` | 10°C→50°C→10°C in 5s | Schnelle Aenderung |
| `sensor_ds18b20_precision.yaml` | 22.00, 22.06, 22.12 (0.0625 Steps) | 12-Bit Aufloesung |

**Beispiel-YAML:**
```yaml
name: DS18B20 Temperature Sweep
version: 1
steps:
  - wait-serial: "MQTT connected"
  - wait-serial: "REGISTRATION"
  # Kalt
  - set-control:
      part-id: "temp1"
      control: "temperature"
      value: "-10"
  - delay: 5000ms
  - wait-serial: "sensor_data"
  # Normal
  - set-control:
      part-id: "temp1"
      control: "temperature"
      value: "25"
  - delay: 5000ms
  - wait-serial: "sensor_data"
  # Heiss
  - set-control:
      part-id: "temp1"
      control: "temperature"
      value: "80"
  - delay: 5000ms
  - wait-serial: "sensor_data"
```

### 2.2 DHT22 Dynamische Werte (BEREITS MOEGLICH!)

**Erkenntnis:** DHT22 hat `set-control` Support fuer `temperature` UND `humidity`. Aktuell konstant 23.5°C/65% — das ist verschwendetes Potenzial.

**Neue Szenarien:**

| Szenario | DHT22-Werte | Was getestet wird |
|----------|-------------|-------------------|
| `sensor_dht22_temp_sweep.yaml` | 0°C → 25°C → 50°C | Temperaturbereich, Umrechnung |
| `sensor_dht22_humidity_sweep.yaml` | 20% → 50% → 90% | Feuchtigkeitsbereich |
| `sensor_dht22_extreme_values.yaml` | -10°C, 80°C, 0%, 100% | Grenzwerte, Plausibilitaet |
| `sensor_dht22_rapid_change.yaml` | 20°C→40°C in 2s | Schnelle Aenderung, Glitch-Resistenz |
| `sensor_dht22_combined_change.yaml` | T: 25→35, H: 60→80 | Gleichzeitige Aenderung |

**Beispiel-YAML:**
```yaml
name: DHT22 Temperature Sweep
version: 1
steps:
  - wait-serial: "MQTT connected"
  - wait-serial: "REGISTRATION"
  # Niedrig
  - set-control:
      part-id: "dht22"
      control: "temperature"
      value: "5"
  - delay: 5000ms
  - wait-serial: "sensor_data"
  # Mittel
  - set-control:
      part-id: "dht22"
      control: "temperature"
      value: "25"
  - delay: 5000ms
  - wait-serial: "sensor_data"
  # Hoch
  - set-control:
      part-id: "dht22"
      control: "temperature"
      value: "45"
  - delay: 5000ms
  - wait-serial: "sensor_data"
```

### 2.3 Potentiometer ADC-Range Sweep

**Erkenntnis:** Potentiometer (`pot_analog`) hat `position` Control (0.0-1.0). Aktuell fest auf 50%.

**Neue Szenarien:**

| Szenario | Position-Werte | Was getestet wird |
|----------|----------------|-------------------|
| `sensor_adc_full_sweep.yaml` | 0.0 → 0.25 → 0.5 → 0.75 → 1.0 | Voller ADC-Bereich |
| `sensor_adc_boundaries.yaml` | 0.0, 0.01, 0.99, 1.0 | ADC-Grenzen, Clipping |
| `sensor_adc_rapid_change.yaml` | 0.0→1.0→0.0 in 3s | Schnelle Aenderungen |

### 2.4 Emergency-Button Sequenzen

**Erkenntnis:** `btn_emergency` hat `pressed` Control (0/1). Aktuell nur einfacher Press getestet.

**Neue Szenarien:**

| Szenario | Button-Sequenz | Was getestet wird |
|----------|----------------|-------------------|
| `emergency_double_press.yaml` | Press→Release→Press→Release | Double-Tap Verhalten |
| `emergency_hold_long.yaml` | Press→15s Hold→Release | Langdruck-Erkennung |
| `emergency_bounce.yaml` | 5x schnell Press/Release | Debouncing, Flatter-Resistenz |

### 2.5 Bestehende Szenarien erweitern

Statt nur passiv zu warten, bestehende Szenarien um `set-control` Steps ergaenzen:

| Bestehendes Szenario | Erweiterung |
|----------------------|-------------|
| `05-emergency/emergency_stop_full_flow.yaml` | Button-Press via set-control statt nur MQTT |
| `02-sensor/sensor_dht22_*.yaml` | Dynamische Werte statt konstant |
| `09-pwm/*.yaml` | Potentiometer als Steuerungsquelle |

### Akzeptanzkriterien Stufe 2
- [x] 5 neue DS18B20-Sweep-Szenarien erstellt (temp_sweep, extreme_cold, extreme_hot, rapid_change, precision)
- [x] 5 neue DHT22-Sweep-Szenarien erstellt (temp_sweep, humidity_sweep, extreme_values, rapid_change, combined_change)
- [x] 3 neue ADC-Sweep-Szenarien erstellt (adc_full_sweep, adc_boundaries, adc_rapid_change)
- [ ] ~~3 neue Emergency-Button-Szenarien~~ **BLOCKIERT**: Firmware hat keinen GPIO27 Interrupt-Handler. btn_emergency in diagram.json existiert, aber digitalRead(27) wird nirgends aufgerufen. Erfordert Firmware-Erweiterung (GPIO ISR fuer Emergency Button)
- [x] CI-Pipeline um Nightly-Job `nightly-sensor-dynamic` erweitert (13 neue Szenarien, skip 5 Core)
- [x] Bestehende Szenarien erweitert: sensor_dht22_full_flow.yaml + sensor_analog_flow.yaml mit set-control Steps
- [ ] Alle Szenarien GRUEN lokal — **Manuell pruefen: `wokwi-cli . --timeout 90000 --scenario <file>`**
- [ ] Sensor-Coverage von 50% auf 75% gestiegen — messbar nach CI-Run

---

## STUFE 3: WOKWI MCP-SERVER INTEGRATION

> **Aufwand:** ~8-12h (Setup + erste Agent-Tests)
> **Voraussetzung:** Stufe 1+2
> **Coverage-Effekt:** Indirekt — ermoeglicht Agent-Driven Testing als Paradigmenwechsel
> **Prioritaet:** HOCH — Game Changer fuer AutomationOne

### 3.1 Was ist der Wokwi MCP-Server?

Der Wokwi MCP-Server (`wokwi-cli mcp`) erlaubt AI-Agenten wie Claude Code direkt mit der ESP32-Simulation zu interagieren — OHNE manuellen Orchestrator.

**Status:** Experimentell (v0.26.1, Februar 2026)

**Bestaetigt funktionsfaehig:**
1. ESP32-Simulation starten/stoppen
2. Serial-Output lesen und analysieren
3. Mit virtueller Hardware interagieren (set-control)
4. Automatisierte Tests ausfuehren

**WICHTIGE EINSCHRAENKUNG:** Die **exakten MCP-Tool-Namen und Parameter sind NICHT oeffentlich dokumentiert**. Die Grundfunktionen sind bestaetigt, aber die konkreten Tool-Definitionen muessen durch MCP-Tool-Discovery ermittelt werden:

```bash
# Tool-Discovery: wokwi-cli mcp starten und die exponierten Tools auflisten
wokwi-cli mcp
# Die MCP-Antwort enthaelt tool-Definitionen im JSON-Format
```

Das ist Standard-MCP-Verhalten — der MCP-Client (Claude Code) fragt den Server nach verfuegbaren Tools, und der Server antwortet mit Tool-Definitionen inkl. Parameter-Schema.

**Bedeutung:** Robins Vision von "Agent-driven Runtime Testing" wird damit technisch moeglich.

### 3.2 Setup im Auto-One Repo

**`.mcp.json` muss NEU ERSTELLT werden** (existiert noch nicht im Repo):
```json
{
  "mcpServers": {
    "wokwi": {
      "type": "stdio",
      "command": "wokwi-cli",
      "args": ["mcp"],
      "env": {
        "WOKWI_CLI_TOKEN": "${WOKWI_CLI_TOKEN}"
      }
    }
  }
}
```

**Voraussetzungen:**
- `WOKWI_CLI_TOKEN` als Umgebungsvariable gesetzt
- `wokwi-cli` v0.26.1+ installiert (`npm i -g @anthropic/wokwi-cli` oder `npm i -g wokwi-cli`)
- Firmware gebaut (`.pio/build/wokwi_simulation/firmware.bin`)

### 3.3 Erster Integrationsschritt: Tool-Discovery

**BEVOR** Agent-Skills erstellt werden, muessen die tatsaechlich verfuegbaren MCP-Tools ermittelt werden:

1. `wokwi-cli mcp` starten
2. MCP-Handshake durchfuehren (initialize → initialized)
3. `tools/list` Request senden
4. Antwort dokumentieren: Tool-Name, Parameter, Beschreibung
5. Diese Dokumentation als Referenz fuer Agent-Skills nutzen

**Erwartete Tools (Hypothesen, NICHT verifiziert):**

| Vermuteter Tool-Name | Funktion | Sicherheit |
|----------------------|----------|------------|
| `start_simulation` / `simulation_start` | Simulation starten | WAHRSCHEINLICH |
| `stop_simulation` / `simulation_stop` | Simulation stoppen | WAHRSCHEINLICH |
| `read_serial` / `serial_read` | Serial-Output lesen | WAHRSCHEINLICH |
| `set_control` / `hardware_interact` | Part-Zustand aendern | MOEGLICH |
| `run_scenario` / `run_test` | Automation Scenario ausfuehren | UNKLAR |

**HINWEIS:** Diese Tool-Namen sind Hypothesen. Die tatsaechlichen Namen muessen durch Discovery ermittelt werden.

### 3.4 Agent-Driven Testing Architektur

```
Claude Code (Hauptkontext)
  │
  ├── Wokwi MCP Server
  │     ├── [Tool 1: Simulation starten]
  │     ├── [Tool 2: Serial lesen]
  │     ├── [Tool 3: Hardware interagieren]
  │     └── [Tool 4: Simulation stoppen]
  │
  ├── MQTT (extern via Bash)
  │     └── mosquitto_pub (Test-Injection)
  │
  └── Analyse
        ├── Serial-Output parsen
        ├── Error-Codes erkennen
        └── Fix-Vorschlaege generieren
```

### 3.5 Closed-Loop Testing Flow

```
1. Agent startet Wokwi-Simulation via MCP
2. Agent wartet auf "MQTT connected" im Serial
3. Agent injiziert MQTT-Config via mosquitto_pub (Bash-Tool)
4. Agent liest Serial-Response via MCP
5. Agent vergleicht Response mit Erwartung
6. Bei Fehler: Agent analysiert, diagnostiziert, schlaegt Fix vor
7. Agent stoppt Simulation
```

### 3.6 Neue Agent-Skills/-Hooks

| Komponente | Funktion |
|-----------|----------|
| `wokwi-test` Skill | Startet Wokwi-Simulation, fuehrt benanntes Szenario aus |
| `wokwi-diagnose` Skill | Analysiert fehlgeschlagenen Test, liest Logs, gibt RCA |
| PostToolUse Hook | Nach `wokwi-test` automatisch Ergebnis analysieren |

### 3.7 Integration mit bestehenden Agenten

| Agent | Wokwi-MCP-Nutzung |
|-------|-------------------|
| `esp32-debug` | Serial-Output via MCP lesen statt Logdatei |
| `esp32-dev` | Neuen Code sofort in Simulation testen |
| `test-log-analyst` | Wokwi-Ergebnisse via MCP abfragen |
| `system-control` | Simulation + Docker-Stack koordinieren |

### Akzeptanzkriterien Stufe 3
- [ ] `.mcp.json` mit Wokwi-MCP-Server-Konfiguration erstellt
- [ ] `wokwi-cli mcp` startet und antwortet auf Tool-Calls
- [ ] Tool-Discovery durchgefuehrt, alle verfuegbaren Tools dokumentiert
- [ ] Mindestens 1 Boot-Test vollstaendig via MCP ausgefuehrt
- [ ] Closed-Loop-Test: Boot → MQTT-Inject → Serial-Verify erfolgreich
- [ ] Dokumentation in WOKWI_TESTING.md aktualisiert

---

## STUFE 4: I2C-TESTS AUSBAUEN (Native Parts + optional Custom Chips)

> **Aufwand:** 2-3h (nur Szenarien) BIS 15-20h (mit Custom Chips)
> **Voraussetzung:** Stufe 1
> **Coverage-Effekt:** I2C ~25% → 70%+, Gesamt +10-15%
> **Prioritaet:** MITTEL — Groesster einzelner Coverage-Blocker

### 4.1 IST-Zustand I2C (korrekt!)

Wokwi HAT native `wokwi-bme280` und `wokwi-sht30` Parts. Die existierende `diagram_i2c.json` verwendet diese bereits:

```json
{
  "parts": [
    { "type": "wokwi-esp32-devkit-v1", "id": "esp" },
    { "type": "wokwi-sht30", "id": "sht31", "attrs": { "temperature": "24.5", "humidity": "55" } },
    { "type": "wokwi-bme280", "id": "bmp280", "attrs": { "temperatureC": "23.0", "humidity": "60", "pressure": "1013.25" } },
    { "type": "wokwi-ds18b20", "id": "temp1" },
    { "type": "wokwi-led", "id": "led_status" }
  ],
  "connections": [
    ["esp:D21", "sht31:SDA", "..."],
    ["esp:D22", "sht31:SCL", "..."],
    ["esp:D21", "bmp280:SDA", "..."],
    ["esp:D22", "bmp280:SCL", "..."],
    ["esp:D4", "temp1:DQ", "..."]
  ]
}
```

Die CI-Pipeline (`wokwi-tests.yml`, Job `i2c-core-tests`) kopiert `diagram_i2c.json` nach `diagram.json` und fuehrt damit bereits **5 Core-I2C-Tests** aus. Die I2C-Coverage ist also ~25%, NICHT 0%.

### 4.2 Entscheidungsbaum: Native Parts vs. Custom Chips

```
Haben wokwi-sht30/wokwi-bme280 set-control Support?
  │
  ├── JA → Custom Chips NICHT noetig (~2-3h Aufwand)
  │         ├── Dynamische Szenarien mit set-control schreiben
  │         ├── Restliche 15 Extended-I2C-Tests in CI aufnehmen
  │         └── I2C-Coverage direkt auf 70%+ erhoehen
  │
  └── NEIN → Custom Chips MIT set-control erstellen (~15-20h)
              ├── SHT31 Custom Chip (einfacher, Single-Shot-Read)
              ├── BME280 Custom Chip (komplexer, 3 Werte)
              ├── chip.json mit controls-Array (fuer set-control)
              └── WASM kompilieren + in diagram integrieren
```

**ERSTER SCHRITT:** Pruefen ob `wokwi-sht30` und `wokwi-bme280` `set-control` unterstuetzen:
- `wokwi-sht30` Dokumentation: [SHT30 Reference](https://docs.wokwi.com/parts/wokwi-sht30)
- `wokwi-bme280` Dokumentation: [BME280 Reference](https://docs.wokwi.com/parts/wokwi-bme280) (falls vorhanden)
- Alternative: In Wokwi-Simulation testen ob `set-control` mit diesen Parts funktioniert

### 4.3 Custom Chips API (nur wenn noetig)

Falls native Parts KEIN `set-control` unterstuetzen, muessen Custom Chips erstellt werden.

**Sprachen:** C, Rust, AssemblyScript, Verilog → kompiliert zu WebAssembly (WASM)

**Pro Custom Chip werden 2 Dateien benoetigt:**

**1. `chip.json` — Metadaten, Pins und Controls:**
```json
{
  "name": "SHT31 Sensor (Custom)",
  "author": "AutomationOne",
  "pins": ["VCC", "GND", "", "", "SCL", "SDA"],
  "controls": [
    {
      "id": "temperature",
      "label": "Temperature (°C)",
      "type": "range",
      "min": -40,
      "max": 125,
      "step": 0.1
    },
    {
      "id": "humidity",
      "label": "Humidity (%)",
      "type": "range",
      "min": 0,
      "max": 100,
      "step": 0.1
    }
  ]
}
```

**ENTSCHEIDEND:** Das `controls`-Array in `chip.json` definiert welche Controls via `set-control` in Automation Scenarios steuerbar sind. Ohne `controls`-Array kein `set-control`!

**2. `chip.c` — I2C-Slave-Implementierung:**
```c
#include "wokwi-api.h"

typedef struct {
  float temperature;
  float humidity;
  uint8_t reg_pointer;
  pin_t sda_pin;
  pin_t scl_pin;
} chip_state_t;

// I2C Callbacks
bool on_i2c_connect(void *data, uint32_t address, bool read) {
  return true;  // ACK
}

uint8_t on_i2c_read(void *data) {
  chip_state_t *state = (chip_state_t*)data;
  // Register-basierte Antwort zurueckgeben
  // SHT31: 6 Bytes (Temp MSB, Temp LSB, CRC, Hum MSB, Hum LSB, CRC)
  return state->register_data[state->reg_pointer++];
}

bool on_i2c_write(void *data, uint8_t value) {
  chip_state_t *state = (chip_state_t*)data;
  state->reg_pointer = value;  // Register-Adresse setzen
  return true;  // ACK
}

void chip_init() {
  chip_state_t *state = malloc(sizeof(chip_state_t));
  state->temperature = 24.5;
  state->humidity = 55.0;

  state->sda_pin = pin_init("SDA", INPUT_PULLUP);
  state->scl_pin = pin_init("SCL", INPUT_PULLUP);

  // WICHTIG: i2c_init() MUSS aus chip_init() aufgerufen werden, nicht spaeter!
  i2c_config_t i2c_cfg = {
    .address = 0x44,        // SHT31 Default-Adresse
    .sda = state->sda_pin,
    .scl = state->scl_pin,
    .connect = on_i2c_connect,
    .read = on_i2c_read,
    .write = on_i2c_write,
    .disconnect = NULL,
    .user_data = state
  };
  i2c_init(&i2c_cfg);
}
```

**Integration in diagram.json:**
```json
{
  "id": "sht31_custom",
  "type": "chip-sht31",
  "attrs": { "address": "0x44" }
}
```

Die `type`-Angabe muss zum Chip-Dateinamen matchen (`sht31.chip.c` → `chip-sht31`). Custom-Chip-Dateien muessen im selben Verzeichnis wie `diagram.json` liegen.

**Referenz-Implementierung:** [bonnyr/wokwi-bme280-custom-chip](https://github.com/bonnyr/wokwi-bme280-custom-chip) — MIT-Lizenz, SPI-basiert (NICHT I2C!). Nutzt voraufgezeichnete Sensordaten. Muss fuer I2C-Variante angepasst werden.

**Quellen:** [Custom Chips Getting Started](https://docs.wokwi.com/chips-api/getting-started), [chip.json Format](https://docs.wokwi.com/chips-api/chip-json), [I2C API](https://docs.wokwi.com/chips-api/i2c)

### 4.4 CI Diagram-Wechsel (bereits implementiert!)

Die CI nutzt BEREITS `cp` zum Diagram-Wechsel:
```bash
# Aus wokwi-tests.yml, Job i2c-core-tests (~Zeile 1226):
cp "El Trabajante/tests/wokwi/diagrams/diagram_i2c.json" "El Trabajante/diagram.json"
```

**Alternative via CLI-Flag:**
```bash
wokwi-cli . --timeout 90000 \
  --diagram-file tests/wokwi/diagrams/diagram_i2c.json \
  --scenario tests/wokwi/scenarios/08-i2c/i2c_sht31_read.yaml
```

### 4.5 Entwicklungs-Reihenfolge

1. **ZUERST:** Pruefen ob native `wokwi-sht30`/`wokwi-bme280` `set-control` haben
2. **Falls JA:** Dynamische I2C-Szenarien mit set-control schreiben (~2-3h)
3. **Falls NEIN:** SHT31 Custom Chip zuerst (einfacher, Single-Shot-Read)
4. **Danach:** BME280 Custom Chip (komplexer, 3 Werte + verschiedene Modi)
5. **CI:** Restliche 15 Extended-I2C-Tests in Nightly-Pipeline aufnehmen

### 4.6 Dateien-Inventar

```
El Trabajante/tests/wokwi/
  ├── chips/                   # NEU erstellen (nur wenn Custom Chips noetig)
  │   ├── sht31/
  │   │   ├── sht31.chip.c
  │   │   ├── sht31.chip.json
  │   │   └── Makefile
  │   └── bme280/
  │       ├── bme280.chip.c
  │       ├── bme280.chip.json
  │       └── Makefile
  └── diagrams/
      ├── diagram_extended.json  # EXISTIERT bereits
      └── diagram_i2c.json       # EXISTIERT bereits (native wokwi-sht30 + wokwi-bme280)
```

### Akzeptanzkriterien Stufe 4
- [ ] Geprueft: Haben `wokwi-sht30` und `wokwi-bme280` `set-control` Support?
- [ ] Falls JA: Dynamische I2C-Szenarien geschrieben und GRUEN
- [ ] Falls NEIN: Custom Chips mit `controls` Array erstellt und WASM kompiliert
- [ ] Alle 20 I2C-Szenarien mit `diagram_i2c.json` getestet (5 Core laufen in PR, 15 Extended in Nightly)
- [ ] Restliche 15 I2C-Extended-Tests in Nightly-Pipeline
- [ ] I2C-Coverage von ~25% auf 70%+

---

## STUFE 5: MULTI-DEVICE SIMULATION

> **Aufwand:** ~8-12h
> **Voraussetzung:** Stufe 1+2
> **Coverage-Effekt:** Cross-ESP Logic neu testbar, +5-10%
> **Prioritaet:** MITTEL — Wichtig fuer Multi-ESP-Szenarien

### 5.1 IST-Zustand Multi-Device

- 3 Environments vorbereitet: `wokwi_esp01`, `wokwi_esp02`, `wokwi_esp03`
- 3 DB-Seeds: `ESP_00000001`, `ESP_00000002`, `ESP_00000003`
- **Noch nie parallel getestet**

**HINWEIS:** Multi-Instance ist NICHT offiziell von Wokwi dokumentiert. Die CLI-Architektur ist sequenziell: connect → upload → start → monitor → terminate. Paralleler Betrieb ist technisch moeglich (mehrere `wokwi-cli` Prozesse mit verschiedenen Firmware-Binaries), aber es gibt keine Garantie:
- Quota-Verbrauch verdoppelt sich (jeder Prozess verbraucht CI-Minuten)
- Keine offizielle Dokumentation fuer parallelen Betrieb
- Beide Prozesse teilen sich denselben MQTT-Broker (gewuenscht fuer Cross-ESP-Tests)

### 5.2 Parallel-Simulations-Architektur

```
Terminal 1:                    Terminal 2:
wokwi-cli . --timeout 120000  wokwi-cli . --timeout 120000
  --env wokwi_esp01             --env wokwi_esp02
  --scenario multi_01.yaml      --scenario multi_02.yaml
       │                              │
       └──────── MQTT Broker ─────────┘
                     │
               Cross-ESP Logic
```

**Herausforderung:** Jeder wokwi-cli Prozess braucht eigene Firmware mit eigener ESP-ID. Build-Environments existieren bereits (`wokwi_esp01/02/03`).

### 5.3 Neue Multi-Device Szenarien

| Szenario | ESP1 Rolle | ESP2 Rolle | Was getestet wird |
|----------|-----------|-----------|-------------------|
| `multi_heartbeat_sync.yaml` | Heartbeat senden | Heartbeat senden | Beide registriert im Server |
| `multi_cross_esp_logic.yaml` | Sensor-Daten senden | Aktor steuern | Cross-ESP Rule Execution |
| `multi_emergency_broadcast.yaml` | Emergency triggern | Emergency empfangen | Broadcast-Verhalten |
| `multi_zone_assignment.yaml` | Zone 1 zugewiesen | Zone 1 zugewiesen | Zone-basierte Koordination |

### 5.4 CI-Implementierung

```yaml
multi-device-tests:
  name: Multi-Device Tests
  needs: [build]
  runs-on: ubuntu-latest
  services:
    mosquitto:
      image: eclipse-mosquitto:2
      ports:
        - 1883:1883
  steps:
    - name: Build ESP01 + ESP02
      run: |
        pio run -e wokwi_esp01
        pio run -e wokwi_esp02

    - name: Multi-Heartbeat Test
      run: |
        cd "El Trabajante"
        # ESP01 im Hintergrund
        WOKWI_FIRMWARE=".pio/build/wokwi_esp01/firmware.bin" \
          wokwi-cli . --timeout 60000 --expect-text "MQTT connected" &
        PID1=$!
        # ESP02 im Hintergrund
        WOKWI_FIRMWARE=".pio/build/wokwi_esp02/firmware.bin" \
          wokwi-cli . --timeout 60000 --expect-text "MQTT connected" &
        PID2=$!
        # Warten
        wait $PID1 $PID2
```

### Akzeptanzkriterien Stufe 5
- [ ] 2 parallele Wokwi-Instanzen laufen mit unterschiedlichen ESP-IDs
- [ ] Beide ESPs verbinden sich zum selben MQTT-Broker
- [ ] Mindestens 1 Cross-ESP-Szenario (z.B. Emergency Broadcast) GRUEN
- [ ] CI-Pipeline hat Multi-Device-Job (Nightly)

---

## STUFE 6: ADVANCED WOKWI FEATURES

> **Aufwand:** ~6-10h
> **Voraussetzung:** Stufe 1+2
> **Coverage-Effekt:** Actuator 70% → 85%, PWM 65% → 80%, GPIO 75% → 85%
> **Prioritaet:** MITTEL — Feinschliff und erweiterte Verifikation

### 6.1 expect-pin fuer LED-Verifikation

**Aktuell:** LED-Status wird nur ueber Serial-Log verifiziert ("LED on", "LED off").
**Neu:** Direkte Pin-Zustandspruefung am ESP32:

```yaml
# LED an GPIO 5 einschalten lassen (via MQTT Actuator Command)
- wait-serial: "actuator_response"
# WICHTIG: expect-pin prueft den ESP32-GPIO, nicht den LED-Part!
- expect-pin:
    part-id: "esp"     # ESP32-Part, NICHT "led1"
    pin: "5"           # GPIO-Nummer
    expected: 1        # HIGH = LED an
```

**Anwendbar auf:**
- GPIO 5 (gruen) — Status-LED
- GPIO 13 — Error-LED
- GPIO 14 — Activity-LED

**Neue/erweiterte Szenarien:**
- `actuator_led_pin_verify.yaml` — LED-State ueber expect-pin statt nur Serial
- `actuator_led_all_colors.yaml` — Alle 3 LEDs nacheinander schalten + verifizieren
- `emergency_led_state.yaml` — Nach Emergency: Error-LED=HIGH, Status-LED=LOW via expect-pin

### 6.2 write-serial fuer interaktive Tests

**Step-Typ `write-serial`** sendet Text/Bytes an den ESP32 Serial-Port.

| Szenario | write-serial Wert | Erwartung |
|----------|-------------------|-----------|
| `serial_debug_command.yaml` | `"status\n"` | Status-Dump im Serial |
| `serial_config_dump.yaml` | `"config\n"` | Config-Zusammenfassung |
| `serial_restart_command.yaml` | `"restart\n"` | Reboot-Meldung |

**ACHTUNG — Firmware-Erweiterung noetig!** Die Firmware hat aktuell KEINEN Serial-Input-Parser. Es gibt kein `serialCommandHandler()`, kein `Serial.read()` und kein `parseCommand()`. Diese Szenarien erfordern ZUERST eine Firmware-Erweiterung:
- Serial Command Handler implementieren (empfangen + parsen)
- Mindestens `status`, `config`, `restart` Commands
- Geschaetzter Aufwand: ~4-6h (statt 1-2h wenn bereits vorhanden)

### 6.3 VCD-Export fuer Timing-Analyse

**`--vcd-file` Flag** exportiert Logic-Analyzer-Daten im Value Change Dump Format:

```bash
wokwi-cli . --timeout 30000 \
  --vcd-file logs/wokwi/vcd/i2c_timing.vcd \
  --scenario tests/wokwi/scenarios/08-i2c/i2c_sht31_read.yaml
```

**Nutzen:**
- I2C-Timing verifizieren (Clock-Stretching, Setup/Hold-Times)
- PWM-Frequenz und Duty-Cycle messen
- OneWire-Protokoll-Timing validieren
- UART-Baudrate-Verifikation

**CI-Integration:** VCD-Dateien als Artifact hochladen fuer Debugging.

### 6.4 Screenshots (begrenzt nuetzlich)

`take-screenshot` ist primaer fuer Display-Parts (LCD, OLED). Fuer AutomationOne aktuell nicht relevant, aber fuer zukuenftige Display-Integration vorbereiten.

### Akzeptanzkriterien Stufe 6
- [ ] 3 Szenarien mit expect-pin fuer LED-Verifikation GRUEN
- [ ] Mindestens 1 write-serial Szenario (erst nach Serial Command Handler in Firmware)
- [ ] VCD-Export funktioniert fuer I2C-Szenarien
- [ ] CI-Artifacts beinhalten VCD-Dateien fuer Debugging

---

## STUFE 7: COVERAGE-MAXIMIERUNG (82%+)

> **Aufwand:** ~10-15h
> **Voraussetzung:** Stufe 1-6
> **Coverage-Effekt:** Gesamt 55% → 82%+
> **Prioritaet:** LANGFRISTIG — nach Stufe 1-4

### 7.1 NVS-Persistenz Workaround

**Problem:** 5 NVS-Tests geskippt weil ESP-Reboot in Wokwi NVS loescht.

**Workaround:** Save-and-Verify in EINER Session:
```yaml
name: NVS Save-Read Same Session
version: 1
steps:
  - wait-serial: "MQTT connected"
  # Config senden → NVS speichern
  # (MQTT extern)
  - wait-serial: "config_response"
  - wait-serial: "NVS saved"
  # System-Status abfragen → NVS lesen
  # (MQTT extern: system/command → status)
  - wait-serial: "config_loaded"
```

**Erwartung:** NVS-Coverage 70% → 85% (5 Persistence-Tests durch Same-Session ersetzt).

### 7.2 Error-Recovery Verbesserung

**IST:** Error-Recovery nur 30% abgedeckt.

**Neue Szenarien:**

| Szenario | Was passiert | Was getestet wird |
|----------|-------------|-------------------|
| `error_mqtt_reconnect.yaml` | MQTT-Broker restart (Docker) | Reconnect-Backoff, Circuit Breaker |
| `error_sensor_recover.yaml` | Sensor-Fehler → Recovery | Error-Counter, Re-Init |
| `error_config_rollback.yaml` | Invalide Config → Fallback | Letztes-gutes-Config-Laden |
| `error_heap_recovery.yaml` | Hohe Last → Stabilisierung | Heap-Monitoring, GC |

**Methode:** Kombination aus MQTT-Injection (extern) + Wokwi set-control (Sensor-Disconnect via Config-Aenderung).

### 7.3 Zone-Assignment Coverage

**IST:** 70% — nur basales Assign/Remove getestet.

**Neue Szenarien:**
- `zone_reassign.yaml` — ESP von Zone A nach Zone B umziehen
- `zone_subzone_cascade.yaml` — Subzone loeschen → Sensoren/Aktoren unassigned
- `zone_multi_esp.yaml` — 2 ESPs in gleicher Zone (Multi-Device, Stufe 5)

### 7.4 MQTT-Routing Erweiterung

**IST:** 65% — nur basale Subscribe/Publish Tests.

**Neue Szenarien:**
- `mqtt_wildcard_routing.yaml` — `+` Wildcard in Topics verifizieren
- `mqtt_retained_messages.yaml` — Retained Flag Verhalten
- `mqtt_qos_handling.yaml` — QoS 0 vs. QoS 1 Unterschiede
- `mqtt_lwt_trigger.yaml` — Last-Will-and-Testament nach Disconnect

### 7.5 Nicht im Plan erwaehnte Szenario-Kategorien

Folgende **58** Szenarien existieren auf Disk und sollten in die Coverage-Betrachtung aufgenommen werden:

| Ordner | Anzahl | Inhalt |
|--------|--------|--------|
| `12-correlation/` | 5 | Sequence-Counter Tests (seq in payloads, reconnect, reboot) |
| `gpio/` (ohne Prefix) | 24 | GPIO Safe-Mode, Reservation, Integration, Subzone |
| `08-onewire/` | 29 | OneWire Protocol Tests |

> **[VERIFY-PLAN Ergaenzung]:** Weitere grosse Kategorien nicht separat erwaehnt: `10-nvs/` hat **40** Szenarien (groesste Kategorie!), `08-i2c/` hat **20**, `09-pwm/` hat **18**, `09-hardware/` hat **9**. NVS-Persistenz-Tests (nvs_pers_*.yaml) sind 5 Stueck: bootcount, reboot, sensor, wifi, zone.

### 7.6 Coverage-Ziel-Matrix

| Flow | IST | STUFE 1-2 | STUFE 3-6 | STUFE 7 (Ziel) |
|------|-----|-----------|-----------|----------------|
| Boot-Sequenz | 85% | 90% | 90% | 95% |
| Sensor-Reading | 50% | 75% | 80% | 85% |
| Actuator-Command | 70% | 75% | 85% | 90% |
| Runtime-Config | 60% | 65% | 70% | 80% |
| MQTT-Routing | 65% | 65% | 70% | 80% |
| Error-Recovery | 30% | 35% | 45% | 60% |
| Zone-Assignment | 70% | 70% | 75% | 85% |
| Emergency-Stop | 80% | 85% | 90% | 95% |
| I2C-Bus | ~25% | ~25% | 70% | 75% |
| PWM-Steuerung | 65% | 65% | 80% | 85% |
| NVS-Storage | 70% | 70% | 75% | 85% |
| GPIO-Management | 75% | 75% | 85% | 90% |
| **Gesamt** | **~55%** | **~65%** | **~75%** | **~82%** |

### Akzeptanzkriterien Stufe 7
- [ ] NVS Same-Session-Tests ersetzen 4 der 5 geskippten Tests
- [ ] 4 neue Error-Recovery-Szenarien GRUEN
- [ ] 3 neue Zone-Szenarien GRUEN
- [ ] 4 neue MQTT-Routing-Szenarien GRUEN
- [ ] Gesamtabdeckung >= 80% (manuell verifiziert anhand Flow-Matrix)

---

## Ressourcen und Budget

### Wokwi Pro Plan Nutzung

| Aktivitaet | Geschaetzte CI-Minuten/Monat |
|-----------|------------------------------|
| PR-Tests (52 Core-Szenarien × ~2min × ~20 PRs) | ~2080 min |
| Nightly (180+ Szenarien × ~2min × 22 Werktage) | ~7920 min |
| Manual Dispatch (Debug/Verification) | ~200 min |
| **Gesamt (unoptimiert)** | **~10200 min** |

**Problem:** Pro-Plan hat 2000 min/Monat. Loesung:
- PR-Tests: Nur Core-Szenarien (~52, ~104 min pro PR bei ~10 PRs/Monat = ~1040 min)
- Nightly: Vollstaendig aber nur Mo-Fr (~22 Tage × 180 × 2min / mit Parallelisierung)
- **ABER:** Nightly mit 180 Szenarien × 2min = 360 min/Tag × 22 Tage = 7920 min → PASST NICHT
- **Loesung:** Nightly nur 2x/Woche (Mo+Do) = ~8 Tage × 360 min = 2880 min
- PR-Tests ~1040 min + Nightly 2x/Woche ~2880 min = ~3920 min → IMMER NOCH ZU VIEL
- **Finale Loesung:** PR = 20 Core-Szenarien (~40 min × 10 PRs = 400 min), Nightly 2x/Woche full (~720 min), Reserve 200 min = ~1320 min → PASST in 2000 min

### Wokwi Self-Hosted (Zukunftsoption)

Falls CI-Minuten eng werden: Self-Hosted Wokwi Server evaluieren.

---

## Stufen-Abhaengigkeiten

```
STUFE 1 (Sofort-Fixes)
  │
  ├──► STUFE 2 (Dynamische Sensor-Tests)
  │       │
  │       ├──► STUFE 5 (Multi-Device)
  │       │
  │       └──► STUFE 6 (Advanced Features)
  │
  ├──► STUFE 3 (MCP-Server) ── parallel zu Stufe 2 moeglich
  │
  └──► STUFE 4 (I2C-Ausbau) ── unabhaengig von Stufe 2/3
        │
        └──► STUFE 7 (Coverage-Max) ── braucht alles davor
```

**Empfohlene Reihenfolge:** 1 → 2 + 3 parallel → 4 → 5 + 6 parallel → 7

---

## Auftragszuordnung (Auto-One Agenten)

| Stufe | Primaerer Agent | Unterstuetzender Agent |
|-------|----------------|----------------------|
| 1 | `esp32-dev` | `test-log-analyst` |
| 2 | `esp32-dev` | `system-control` (CI) |
| 3 | `system-control` | `agent-manager` (MCP-Config) |
| 4 | `esp32-dev` (WASM falls noetig) | `system-control` (CI) |
| 5 | `system-control` | `esp32-dev` (Multi-Firmware) |
| 6 | `esp32-dev` | `esp32-debug` (VCD-Analyse) |
| 7 | `esp32-dev` + `test-log-analyst` | `meta-analyst` (Coverage-Report) |

---

## Zusammenfassung

| Stufe | Fokus | Aufwand | Coverage-Effekt |
|-------|-------|---------|----------------|
| **1** | Sofort-Fixes (F1-F7) | 3-4h | Stabilitaet, kein Coverage-Gewinn |
| **2** | Dynamische Sensortests (DS18B20 + DHT22 + Poti + Button) | 6-8h | 55% → 65% |
| **3** | Wokwi MCP-Server (Agent-Driven Testing) | 8-12h | Paradigmenwechsel |
| **4** | I2C-Ausbau (native Parts vorhanden, ggf. Custom Chips) | 2-15h | +10-15% (I2C 25%→70%) |
| **5** | Multi-Device (Cross-ESP) | 8-12h | +5-10% |
| **6** | Advanced Features (expect-pin, VCD, write-serial) | 6-10h | +5% |
| **7** | Coverage-Max (NVS, Error-Recovery, MQTT, Zones) | 10-15h | 75% → 82%+ |
| **Gesamt** | | **~43-76h** | **55% → 82%+** |

**Die groessten Hebel:**
1. **Stufe 2** (DS18B20 + DHT22 + Poti set-control) — Groesster Coverage-Gewinn fuer geringstes Investment, DS18B20 hat VOLLEN set-control Support (nicht konstant wie IST-Analyse behauptet!)
2. **Stufe 4** (I2C-Ausbau) — Groesstmoeglicher I2C-Coverage-Sprung, evtl. nur 2-3h wenn native Parts set-control haben
3. **Stufe 3** (MCP-Server) — Aendert das Testing-Paradigma grundlegend, ermoeglicht Agent-autonomes Testing

---

## Verwandte Dateien (Auto-One Repo)

| Datei | Bezug |
|-------|-------|
| `El Trabajante/tests/wokwi/scenarios/` | **15** Kategorie-Ordner, **178** YAML-Dateien |
| `El Trabajante/tests/wokwi/diagrams/diagram_i2c.json` | I2C-Diagramm mit nativen SHT30 + BME280 |
| `El Trabajante/tests/wokwi/diagrams/diagram_extended.json` | Erweitertes Diagramm |
| `El Trabajante/tests/wokwi/helpers/` | mqtt_inject.py, emergency_cascade.sh, emergency_cascade_stress.sh, preflight_check.sh, wait_for_mqtt.sh |
| `El Trabajante/diagram.json` | Standard-Diagramm (DS18B20, DHT22, Poti, LEDs, Button) |
| `El Trabajante/wokwi.toml` | CLI-Konfiguration (Gateway, Firmware-Path) |
| `.github/workflows/wokwi-tests.yml` | CI Pipeline (16 Jobs, 52 Core-Szenarien) |
| `.claude/reference/testing/WOKWI_TESTING.md` | Agent-Referenz |
| `.claude/reference/testing/WOKWI_ERROR_MAPPING.md` | Error-Code-Mapping |
| `Makefile` | wokwi-test-* Targets |

**Quellen (Wokwi-Dokumentation):**
- [Wokwi MCP Support](https://docs.wokwi.com/wokwi-ci/mcp-support)
- [Custom Chips Getting Started](https://docs.wokwi.com/chips-api/getting-started)
- [Custom Chips I2C API](https://docs.wokwi.com/chips-api/i2c)
- [chip.json Format](https://docs.wokwi.com/chips-api/chip-json)
- [Automation Scenarios](https://docs.wokwi.com/wokwi-ci/automation-scenarios)
- [CLI Usage](https://docs.wokwi.com/wokwi-ci/cli-usage)
- [ESP32 Simulation](https://docs.wokwi.com/guides/esp32)
- [DS18B20 Reference](https://docs.wokwi.com/parts/wokwi-ds18b20)
- [DHT22 Reference](https://docs.wokwi.com/parts/wokwi-dht22)
- [Pushbutton Reference](https://docs.wokwi.com/parts/wokwi-pushbutton)
- [Potentiometer Reference](https://docs.wokwi.com/parts/wokwi-potentiometer)

*Ausbauplan erstellt und verifiziert (22 Quellen). Jede Stufe ist eigenstaendig beauftragbar. Empfehlung: Mit Stufe 1+2 starten (sofortige Verbesserung), dann Stufe 3 (MCP als Game Changer). Stufe 4 erst nach Pruefung ob native Parts set-control unterstuetzen.*

---

## /verify-plan Ergebnis

**Plan:** Wokwi Ausbauplan — 7-Stufen Coverage-Erhoehung von 55% auf 82%+
**Geprueft:** 25+ Pfade, 8 Agents, 1 CI-Pipeline, 5 Firmware-Referenzen, 178 YAML-Dateien

### Bestaetigt
- `diagram.json` Parts (temp1, dht22, pot_analog, btn_emergency, LEDs) — alle korrekt mit IDs
- `diagram_i2c.json` und `diagram_extended.json` existieren in `tests/wokwi/diagrams/`
- CI-Pipeline `wokwi-tests.yml` korrekt: 173 Szenarien (51 core PR + 122 nightly), `i2c-core-tests` Job mit `cp diagram_i2c.json` (Zeile 1228)
- Firmware Watchdog-String bestaetigt: `main.cpp:170` gibt `"[WOKWI] Watchdog skipped (not supported in simulation)"` aus
- Registration-Strings bestaetigt: `mqtt_client.cpp:775` (`REGISTRATION CONFIRMED BY SERVER`) und `:545` (`Registration timeout - opening gate (fallback)`)
- `error_watchdog_trigger.yaml` und `error_nvs_corrupt.yaml` existieren in `11-error-injection/`
- WOKWI_ERROR_MAPPING.md existiert und hat korrekte Mappings
- `wokwi.toml` existiert
- `.mcp.json` existiert noch NICHT — Stufe 3 korrekt
- `onewire_bus.cpp` (Zeile 69-71): WOKWI_SIMULATION Branch existiert bereits (nur LOG_D)
- Agent-Zuordnung (Stufe 1-7) plausibel: esp32-dev, system-control, test-log-analyst, agent-manager korrekt referenziert
- Kategorie-Inventar: 12-correlation (5), gpio (24), 08-onewire (29) — KORREKT
- saveSensorConfig/saveActuatorConfig haben bereits WOKWI_SIMULATION Guards

### Korrekturen (inline im Dokument eingefuegt)

| # | Kategorie | Plan sagt | System sagt | Status |
|---|-----------|-----------|-------------|--------|
| K1 | **F1: Datei fehlt** | `boot_test.yaml` in `01-boot/` | Existiert NICHT. Nur `boot_full.yaml` + `boot_safe_mode.yaml` | KORRIGIERT (Hinweis eingefuegt) |
| K2 | **F4: Falscher String** | `wait-serial: "sensor_data"` | `"sensor_data"` existiert NICHT als Firmware-Log. `"Published"` ist LOG_D (mqtt_client.cpp:580). Bester INFO-Ersatz: `"heartbeat"` | KORRIGIERT |
| K3 | **Szenario-Count** | 180 YAML-Dateien | **178** YAML-Dateien in **15** Ordnern (nicht 14) | KORRIGIERT |
| K4 | **F5: Pfad** | `config_manager.cpp` (ohne Pfad) | `El Trabajante/src/services/config/config_manager.cpp` (Z.306 + Z.1182) | KORRIGIERT |
| K5 | **Helpers** | `mqtt_inject.py, emergency_cascade.sh` | + `emergency_cascade_stress.sh`, `preflight_check.sh`, `wait_for_mqtt.sh` | KORRIGIERT |

### Fehlende Vorbedingungen
- [ ] F1 klaeren: Ist `boot_test.yaml` eine geloeschte Legacy-Datei? Falls ja: F1 komplett streichen
- [ ] F4 pruefen: Ob `"heartbeat"` als Ersatz fuer `"Published"` ausreicht (Test hat `"heartbeat"` bereits als letzten Step)
- [ ] Stufe 3: `WOKWI_CLI_TOKEN` als Umgebungsvariable setzen (lokal + GitHub Secret)
- [ ] Stufe 3: `wokwi-cli` Version pruefen (v0.26.1+ benoetigt fuer MCP)

### Ergaenzungen
- NVS-Kategorie (`10-nvs/`) hat mit **40 Szenarien** die meisten Tests — davon 5 Persistence-Tests (nvs_pers_*.yaml) die in Stufe 7 relevant sind
- CI-Header und Makefile sagen beide "173 Szenarien" — die Differenz zu 178 sind vermutlich 5 Szenarien die nicht in CI aufgenommen sind
- `saveSystemConfig()` wird in Wokwi AUFGERUFEN (config_manager.cpp:1341 im WOKWI_SIMULATION Branch von generateEspId) — F5 Fix ist korrekt und sinnvoll
- Keine YAML-Szenarien nutzen aktuell `wait-serial: "REGISTRATION"` — F7 Scope ist korrekt (0 von 178 haben Registration Gate)

### Zusammenfassung
Plan ist **grundsaetzlich ausfuehrbar** mit 5 Korrekturen. Kritischste Korrektur: F1 (`boot_test.yaml` existiert nicht) muss geklaert werden. F4 String-Ersatz war falsch und wurde korrigiert. Alle Pfade, Parts, CI-Pipeline und Agent-Zuordnungen sind korrekt. Szenario-Count ist 178 (nicht 180).
