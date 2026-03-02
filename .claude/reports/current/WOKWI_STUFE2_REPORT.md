# Wokwi Stufe 2: Dynamische Sensor-Tests — Implementierungsbericht

> **Datum:** 2026-03-02
> **Agent:** AutoOps / esp32-dev Pattern
> **Basis:** Wokwi Ausbauplan Stufe 2

---

## Verifikation Stufe 1

| Punkt | Status | Detail |
|-------|--------|--------|
| F4: sensor_ds18b20_full_flow.yaml | ERLEDIGT | "Published" (LOG_D) entfernt, "heartbeat" bleibt |
| F7: Registration Gate (16 Szenarien) | ERLEDIGT | 16 Dateien mit `wait-serial: "REGISTRATION"` |
| F5: WOKWI_SIMULATION Guards | ERLEDIGT | saveZoneConfig (Z.313) + saveSystemConfig (Z.1197) |
| WOKWI_ERROR_MAPPING.md | ERLEDIGT | error_watchdog_trigger + error_nvs_corrupt korrigiert |
| Szenario-Count | OK | CI: 173 (korrekt fuer CI-Szenarien), Disk: 178 (5 nicht in CI) |
| Build-Verifikation | OFFEN | PlatformIO nicht im Pfad — manuell pruefen |

---

## Stufe 2: Implementierte Szenarien

### Neue Dateien (13 Szenarien)

**DS18B20 Dynamische Sweeps (5):**

| Datei | Werte | Test-Fokus |
|-------|-------|------------|
| `sensor_ds18b20_temp_sweep.yaml` | -10, 0, 25, 50, 100 | Voller Temperaturbereich |
| `sensor_ds18b20_extreme_cold.yaml` | -55, -40, -20 | Untere Grenzwerte |
| `sensor_ds18b20_extreme_hot.yaml` | 80, 100, 125 | Obere Grenzwerte |
| `sensor_ds18b20_rapid_change.yaml` | 10->50->10->50 | Schnelle Wechsel |
| `sensor_ds18b20_precision.yaml` | 22.00, 22.06, 22.12, 22.50, 23.00 | 12-Bit Aufloesung |

**DHT22 Dynamische Sweeps (5):**

| Datei | Werte | Test-Fokus |
|-------|-------|------------|
| `sensor_dht22_temp_sweep.yaml` | 0, 25, 50 | Temperaturbereich |
| `sensor_dht22_humidity_sweep.yaml` | 20%, 50%, 90% | Feuchtigkeitsbereich |
| `sensor_dht22_extreme_values.yaml` | -10/80 (T), 0%/100% (H) | Grenzwerte |
| `sensor_dht22_rapid_change.yaml` | 20->40->20->40 | Schnelle Wechsel |
| `sensor_dht22_combined_change.yaml` | T+H gleichzeitig | Dual-Value Aenderung |

**ADC/Potentiometer Sweeps (3):**

| Datei | Werte | Test-Fokus |
|-------|-------|------------|
| `sensor_adc_full_sweep.yaml` | 0.0, 0.25, 0.5, 0.75, 1.0 | Voller ADC-Bereich |
| `sensor_adc_boundaries.yaml` | 0.0, 0.01, 0.99, 1.0 | Grenzwerte/Clipping |
| `sensor_adc_rapid_change.yaml` | 0.0->1.0->0.0->1.0 | Full-Swing Oszillation |

### Erweiterte bestehende Szenarien (2)

| Datei | Aenderung |
|-------|-----------|
| `sensor_dht22_full_flow.yaml` | +set-control T=35C nach erstem Published |
| `sensor_analog_flow.yaml` | +set-control position=0.75 nach erstem Published |

### CI-Pipeline

| Aenderung | Detail |
|-----------|--------|
| Neuer Job: `nightly-sensor-dynamic` | 13 neue Szenarien, schedule + workflow_dispatch |
| Core-Szenarien-Skip | 5 Core-Tests werden uebersprungen (heartbeat, ds18b20_read, ds18b20_full_flow, dht22_full_flow, analog_flow) |
| Header aktualisiert | 191 Szenarien (178 Disk + 13 neu), 7 Extended Jobs |

---

## Szenario-Pattern (fuer alle neuen YAMLs)

```yaml
# 1. Boot + MQTT Connect
- wait-serial: "MQTT connected"

# 2. Registration Gate (Server ACK oder 10s Timeout)
- wait-serial: "REGISTRATION"

# 3. Erste Messung abwarten
- wait-serial: "Published"

# 4. Dynamischer Wert via set-control
- set-control:
    part-id: "<part-id>"
    control: "<control>"
    value: "<wert>"
- delay: 8000ms          # 1.6x Measurement-Interval (5000ms)
- wait-serial: "Published"  # Pipeline laeuft weiter

# 5. Weitere Werte (wiederholen)
```

**Technische Basis:**
- Measurement Interval: 5000ms (main.cpp:1915)
- Custom Logger: Gibt ALLE Log-Levels aus (LOG_D sichtbar in Serial)
- "Published" = LOG_D in mqtt_client.cpp:580, aber via Custom Logger sichtbar
- 8s Delay = 1.6x Interval = sicheres Fenster fuer mindestens 1 Messzyklus

---

## BLOCKIERT: Emergency-Button Szenarien

**Problem:** `btn_emergency` (Wokwi pushbutton) ist an GPIO 27 angeschlossen, aber die Firmware hat **keinen Handler** dafuer:
- Kein `digitalRead(27)` in der gesamten Firmware
- Kein GPIO ISR fuer Pin 27
- Emergency Stop wird nur via MQTT ausgeloest (`kaiser/broadcast/emergency`)

**Loesung (Firmware-Erweiterung noetig):**
```cpp
// In main.cpp oder gpio_manager.cpp
constexpr uint8_t EMERGENCY_BUTTON_PIN = 27;
attachInterrupt(digitalPinToInterrupt(EMERGENCY_BUTTON_PIN), emergencyButtonISR, FALLING);
```

**Impact:** 3 geplante Szenarien (emergency_double_press, emergency_hold_long, emergency_bounce) koennen erst nach Firmware-Erweiterung erstellt werden.

---

## Szenario-Zaehlung (nach Stufe 2)

| Ordner | Vorher | Nachher | Diff |
|--------|--------|---------|------|
| 02-sensor/ | 5 | 18 | +13 |
| Gesamt auf Disk | 178 | 191 | +13 |
| CI Core (PR) | 52 | 52 | 0 |
| CI Nightly | 122 | 135 | +13 |

---

## Naechste Schritte

1. **Build verifizieren:** `pio run -e wokwi_simulation` (manuell)
2. **Szenarien lokal testen:** `wokwi-cli . --timeout 90000 --scenario <file>`
3. **CI-Run triggern:** `gh workflow run wokwi-tests.yml` (nightly oder manual dispatch)
4. **Stufe 3 (MCP-Server)** oder **Stufe 4 (I2C-Ausbau)** als naechstes
