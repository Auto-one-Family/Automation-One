# Paket 03 (optional): ESP32 Sensor Timing und Lastprofil

> **Stand:** 2026-04-05  

## 1) Zyklus- und Scheduling-Bild

- `safetyTask` (Core 1, Prio 5) laeuft mit `vTaskDelay(10ms)`.
- Jeder Loop enthaelt:
  - `performAllMeasurements()`
  - Queue-Drains (actuator/sensor/config)
  - Offline-Eval-Timerpruefung (alle 5 s bei OFFLINE_ACTIVE)
- Sensorintervalle sind pro Sensor konfigurierbar (`measurement_interval_seconds` -> 1..300 s).

## 2) Sensor-Timingcharakteristika pro Klasse

| Klasse | Dominante Latenzquellen | Typische Burst-Muster | Risiko bei Last |
|---|---|---|---|
| Analog | `analogRead`, GPIO setup | gleichmaessig je Intervall | ADC2/WiFi Konflikt -> Fehlmessungen |
| OneWire | 750 ms Conversion + Retry-Delay | bei mehreren DS18B20 sequentielle Last | blockierende Delay-Anteile im Messpfad |
| I2C Multi-Value | mutex, protocol wait (SHT31 ~20 ms), bus I/O | 1 Read erzeugt 2-3 Publishes | bus contention + publish burst |
| Sensor-Command | Queue-Latenz + Messpfad + Admission | ad-hoc bursts durch mehrere Commands | drop bei queue full mit Intent-Outcome; admission reject ohne Enqueue |

## 3) Queue- und Bufferdruck

| Queue/Buffer | Tiefe/Groesse | Producer | Consumer | Verhalten bei Vollstand |
|---|---|---|---|---|
| `g_sensor_cmd_queue` | 10 | Core0 Router | Core1 SafetyTask | Standard non-blocking; Recovery-Intent bis 20ms `SendToFront`; sonst Drop mit Intent-Outcome |
| `g_publish_queue` | 15 | Core1 publish | Core0 comm task | Drop + Warnlog + CB failure |
| MQTT Outbox (ESP-IDF) | intern | Core0 publish | Broker ACK-Fluss | `msg_id=-2`, Drop |
| `g_config_update_queue` | 5, 100ms enqueue timeout | Core0 | Core1 | timeout -> Drop + Warnlog |

## 4) Lastkritische Kombinationen

1. Multi-Value-I2C plus hohe Sensoranzahl plus kurzer Intervall -> publish burst auf Core0.
2. Gleichzeitige Config-Pushes und Sensor-Commands -> Queue-Konflikt, Sensorcommand-Verlust moeglich.
3. OFFLINE_ACTIVE mit stale Cache -> Rule-Eval skippt haeufig, Aktorzustand bleibt laenger unveraendert.
4. Legacy-No-Task-Pfad entzieht Core-Trennung und veraendert Timing deterministisch.

## 5) Bewertete Verlustkritikalitaet (Input fuer P1.6)

- **Hoch kritisch:** `sensor/{gpio}/data` fuer Sensoren mit direkter Offline-Rule-Relevanz.
- **Mittel:** on-demand `sensor/{gpio}/response` (Diagnostik-/Operatorfluss).
- **Niedrig-mittel:** lokale Preview-Felder (`value`, `unit`) solange `raw` sauber bleibt.

## 6) Messbare Kennzahlen fuer Folgepakete

1. Queue fill-rate (`sensor_cmd`, `publish`, `config_update`) unter Last.
2. Drop-rate pro Queue und pro Topic-Familie.
3. Zeit von Messstart bis erfolgreichem `esp_mqtt_client_publish`.
4. Anteil NaN-Regelbewertungen waehrend OFFLINE_ACTIVE.
5. CB-Oeffnungsrate pro Sensor ueber Zeit.
