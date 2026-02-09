# MQTT-Injection Analyse – Wokwi set-control Konvertierung

> Phase 3.1 Dokumentation
> Erstellt: 2026-02-06

## 1. Zusammenfassung

| Metrik | Wert |
|--------|------|
| Szenarien gesamt | 163 |
| Bereits mit set-control | 31 |
| **Konvertiert (Phase 3.1)** | **16** |
| MQTT-Injektionen gesamt | 21+ |
| In SKIP_SCENARIOS (NVS) | 5 |
| Nicht konvertierbar | 0 |

## 2. Inventar – Konvertierte Szenarien

### 2.1 Batch 1: Actuator-Commands (5 Szenarien)

| Szenario | Pfad | Injektionen | Topics |
|----------|------|-------------|--------|
| `actuator_led_on.yaml` | `03-actuator/` | 2x (Config, ON) | config, actuator/5/command |
| `actuator_pwm.yaml` | `03-actuator/` | 2x (Config, SET) | config, actuator/5/command |
| `actuator_binary_full_flow.yaml` | `03-actuator/` | 3x (Config, ON, OFF) | config, actuator/5/command |
| `actuator_pwm_full_flow.yaml` | `03-actuator/` | 4x (Config, SET x2, OFF) | config, actuator/13/command |
| `actuator_timeout_e2e.yaml` | `03-actuator/` | 2x (Config, ON+timeout) | config, actuator/5/command |

### 2.2 Batch 2: Emergency-Szenarien (4 Szenarien)

| Szenario | Pfad | Injektionen | Topics |
|----------|------|-------------|--------|
| `emergency_broadcast.yaml` | `05-emergency/` | 1x (Broadcast Stop) | kaiser/broadcast/emergency |
| `emergency_esp_stop.yaml` | `05-emergency/` | 1x (ESP Stop) | actuator/emergency |
| `emergency_stop_full_flow.yaml` | `05-emergency/` | 4x (Config, ON, Broadcast, Clear) | config, actuator/5/command, broadcast/emergency, actuator/emergency |
| `actuator_emergency_clear.yaml` | `03-actuator/` | 1x (Stop) | actuator/emergency |

**Hinweis:** Broadcast-Topic (`kaiser/broadcast/emergency`) wurde erfolgreich getestet - funktioniert mit set-control (Referenz: `pwm_e2e_fan_control.yaml`).

### 2.3 Batch 3: Config & Zone (3 Szenarien)

| Szenario | Pfad | Injektionen | Topics |
|----------|------|-------------|--------|
| `config_sensor_add.yaml` | `06-config/` | 1x (Sensor Config) | config |
| `config_actuator_add.yaml` | `06-config/` | 1x (Actuator Config) | config |
| `zone_assignment.yaml` | `04-zone/` | 1x (Zone Assign) | zone/assign |

### 2.4 Batch 4: PWM Extended (2 Szenarien)

| Szenario | Pfad | Injektionen | Topics |
|----------|------|-------------|--------|
| `pwm_channel_attach.yaml` | `09-pwm/` | 1x (PWM Config) | config |
| `pwm_channel_multi.yaml` | `09-pwm/` | 1x (Multi-PWM Config) | config |

### 2.5 Batch 5: Combined (2 Szenarien)

| Szenario | Pfad | Injektionen | Delay |
|----------|------|-------------|-------|
| `combined_sensor_actuator.yaml` | `07-combined/` | 3x (Config, ON, OFF) | 1000ms |
| `multi_device_parallel.yaml` | `07-combined/` | 5x (Config, ON x3, OFF) | **1000ms** |

**Hinweis:** Batch 5 verwendet `delay: 1000` statt 500ms wegen Multi-Injection und Wokwi CPU-Throttling.

## 3. Referenz-Pattern

Alle konvertierten Szenarien nutzen das standardisierte Pattern:

```yaml
- wait-serial: "MQTT connected"
- wait-serial: "heartbeat"

# Configuration
- set-control:
    part-id: "mqtt"
    control: "inject"
    value: |
      {
        "topic": "kaiser/god/esp/ESP_00000001/config",
        "payload": {
          "actuators": [{
            "gpio": 5,
            "actuator_type": "binary",
            "actuator_name": "TestActuator",
            "active": true
          }]
        }
      }

- wait-serial: "Actuator initialized"

# Command (mit Delay)
- delay: 500  # oder 1000 für Multi-Injection
- set-control:
    part-id: "mqtt"
    control: "inject"
    value: |
      {
        "topic": "kaiser/god/esp/ESP_00000001/actuator/5/command",
        "payload": {
          "command": "ON",
          "value": 1.0
        }
      }

- wait-serial: "Actuator"
```

## 4. Topic-Referenz

| Funktion | Topic-Pattern |
|----------|--------------|
| Config | `kaiser/god/esp/{esp_id}/config` |
| Actuator ON/OFF/SET | `kaiser/god/esp/{esp_id}/actuator/{gpio}/command` |
| Zone Assignment | `kaiser/god/esp/{esp_id}/zone/assign` |
| Broadcast Emergency | `kaiser/broadcast/emergency` |
| ESP Emergency | `kaiser/god/esp/{esp_id}/actuator/emergency` |

## 5. Payload-Formate

### Actuator Commands

```json
// ON
{"command": "ON", "value": 1.0}

// OFF
{"command": "OFF"}

// PWM SET
{"command": "SET", "value": 0.5}

// ON mit Timeout
{"command": "ON", "value": 1.0, "max_runtime_ms": 5000}
```

### Emergency

```json
// Broadcast Stop
{"action": "stop_all", "reason": "Test broadcast emergency"}

// ESP-spezifischer Stop
{"command": "emergency_stop", "auth_token": "ESP_00000001"}

// Emergency Clear
{"command": "emergency_clear", "auth_token": "ESP_00000001"}
```

### Zone Assignment

```json
{
  "zone_id": "test_zone_1",
  "master_zone_id": "master_test",
  "zone_name": "Test Zone",
  "kaiser_id": "god"
}
```

## 6. SKIP_SCENARIOS Status

### Weiterhin geskippt (NVS-Persistence)

Diese Szenarien bleiben in SKIP_SCENARIOS - Wokwi unterstützt keinen ESP32-Reboot:

| Szenario | Grund |
|----------|-------|
| `nvs_pers_bootcount` | Reboot erforderlich |
| `nvs_pers_reboot` | Reboot erforderlich |
| `nvs_pers_sensor` | Reboot erforderlich |
| `nvs_pers_wifi` | Reboot erforderlich |
| `nvs_pers_zone` | Reboot erforderlich |

### Keine Skips für konvertierte Szenarien

Alle 16 konvertierten Szenarien sind NICHT in SKIP_SCENARIOS - sie werden vom Python-Runner ausgeführt.

## 7. Verifizierung

### Test-Befehle pro Batch

```bash
# Batch 1: Actuator
python scripts/run-wokwi-tests.py --scenario actuator_led_on -v
python scripts/run-wokwi-tests.py --scenario actuator_pwm -v
python scripts/run-wokwi-tests.py --scenario actuator_binary_full_flow -v

# Batch 2: Emergency
python scripts/run-wokwi-tests.py --scenario emergency_broadcast -v
python scripts/run-wokwi-tests.py --scenario emergency_esp_stop -v

# Batch 3: Config & Zone
python scripts/run-wokwi-tests.py --scenario config_sensor_add -v
python scripts/run-wokwi-tests.py --scenario zone_assignment -v

# Batch 4: PWM Extended
python scripts/run-wokwi-tests.py --scenario pwm_channel_attach -v

# Batch 5: Combined
python scripts/run-wokwi-tests.py --scenario multi_device_parallel -v
```

### Kategorieweise Verifizierung

```bash
python scripts/run-wokwi-tests.py --category 03-actuator -v
python scripts/run-wokwi-tests.py --category 04-zone -v
python scripts/run-wokwi-tests.py --category 05-emergency -v
python scripts/run-wokwi-tests.py --category 06-config -v
python scripts/run-wokwi-tests.py --category 07-combined -v
python scripts/run-wokwi-tests.py --category 09-pwm -v
```

## 8. Bekannte Einschränkungen

1. **Wokwi CPU-Throttling**: Bei Multi-Injection (4+ Commands) `delay: 1000` verwenden
2. **Broadcast-Topics**: Funktionieren, aber kein expliziter Part im diagram.json
3. **NVS-Persistence**: Nicht testbar - Wokwi unterstützt keinen Reboot

## 9. Änderungshistorie

| Datum | Änderung |
|-------|----------|
| 2026-02-06 | Phase 3.1: 16 Szenarien von Kommentaren zu set-control konvertiert |
