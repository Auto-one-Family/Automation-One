# Bug Report: Multi-Value I2C Sensor + Wokwi Integration

> **Datum:** 2026-01-14
> **Status:** Offen - Erfordert tiefere Analyse
> **Betroffene Komponenten:** El Trabajante, El Servador, El Frontend, Wokwi

---

## Zusammenfassung

Bei der Konfiguration eines SHT31 (I2C Multi-Value Sensor) über das Frontend für den Wokwi-simulierten ESP werden die Pins 21/22 als belegt angezeigt, obwohl der Sensor nicht funktioniert. Der Sensor erscheint nicht auf der Orbital Card im Frontend.

---

## Kontext: Multi-Value Sensor Architektur

### Beabsichtigtes Design (KEIN Bug)

Ein SHT31 ist ein **Multi-Value Sensor** - er liefert zwei Messwerte:
- Temperatur (`sht31_temp`)
- Luftfeuchtigkeit (`sht31_humidity`)

Der ESP32 sendet deshalb **zwei separate MQTT-Nachrichten** - eine pro Wert. Das ist beabsichtigt und modular erweiterbar:
- BME280 sendet 3 Werte (temp, humidity, pressure)
- Zukünftige Sensoren können beliebig viele Werte senden

**Relevante Dateien (Multi-Value Logik):**
```
El Trabajante/src/models/sensor_registry.h      # SensorCapability Struct
El Trabajante/src/models/sensor_registry.cpp    # MULTI_VALUE_DEVICES Registry
El Frontend/src/utils/sensorDefaults.ts         # MULTI_VALUE_DEVICES Config (Frontend)
```

---

## Bug T: I2C Sensor GPIO-Zuordnung in Datenbank

### Problem

Die Datenbank speichert für einen SHT31 **zwei separate Sensor-Einträge** mit unterschiedlichen GPIOs:

| DB-Eintrag | GPIO | sensor_type | Bedeutung |
|------------|------|-------------|-----------|
| Eintrag 1 | **21** | `sht31_temp` | SDA Pin |
| Eintrag 2 | **22** | `sht31_humidity` | SCL Pin |

### Warum das problematisch ist

Ein I2C-Sensor nutzt **beide Pins gleichzeitig** als Bus:
- GPIO 21 = SDA (Daten)
- GPIO 22 = SCL (Clock)

Es ist **ein physisches Gerät** auf I2C-Adresse `0x44`, das über den Bus kommuniziert. Die aktuelle DB-Struktur impliziert fälschlich, dass Temperatur auf Pin 21 gemessen wird und Humidity auf Pin 22 - das ist technisch falsch.

### Erwartetes Verhalten

Ein I2C Multi-Value Sensor sollte als **ein logisches Device** gespeichert werden:
- Eine `sensor_config` mit I2C-Adresse `0x44`
- Mehrere `sensor_data` Einträge für die verschiedenen Werte
- ODER: Ein `gpio` Feld das "i2c" oder die Adresse referenziert

### Betroffene Dateien für Analyse

```
El Servador/god_kaiser_server/src/db/models/sensor.py           # SensorConfig Model
El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py # Wie werden Multi-Values verarbeitet?
El Frontend/src/views/DeviceDetailView.vue                      # Wie wird ein Sensor angelegt?
El Frontend/src/components/esp/ESPOrbitalLayout.vue             # Wie werden Sensoren angezeigt?
```

### Fragen für weitere Analyse

1. Wie soll das DB-Schema für I2C Multi-Value Sensoren aussehen?
2. Sendet der ESP32 beide Werte mit demselben GPIO oder verschiedenen?
3. Wie erkennt der Server, dass zwei Nachrichten zum selben physischen Device gehören?

---

## Bug U: NVS_WRITE_FAILED in Wokwi Simulation

### Problem

Bei der Sensor-Konfiguration schlägt das NVS-Schreiben fehl:

```
config_status: failed
config_error: NVS_WRITE_FAILED
```

### Ursache

**Wokwi hat keinen persistenten NVS-Speicher.** Die ESP32-Firmware versucht, die Sensor-Konfiguration im NVS zu speichern, aber Wokwi simuliert diese Hardware-Komponente nicht.

### Datenbank-Evidenz

```sql
-- Wokwi ESP: ESP_00000001 (device_id: d8e2436fdec9414bb2e1adf560b6318d)
SELECT gpio, sensor_type, config_status, config_error FROM sensor_configs
WHERE esp_id = 'd8e2436fdec9414bb2e1adf560b6318d';

-- Ergebnis:
-- gpio=21, type=sht31_temp,     status=failed, error=NVS_WRITE_FAILED
-- gpio=22, type=sht31_humidity, status=failed, error=NVS_WRITE_FAILED
-- gpio=4,  type=ds18b20,        status=failed, error=GPIO_CONFLICT
```

### Betroffene Dateien

```
El Trabajante/src/services/config/storage_manager.cpp   # NVS Write Logic
El Trabajante/src/services/config/config_manager.cpp    # Config Persistence
El Trabajante/docs/NVS_KEYS.md                          # NVS Key Reference
```

### Mögliche Lösungen (zu evaluieren)

1. **Wokwi-Mode Flag:** ESP32 erkennt Wokwi und überspringt NVS-Writes
2. **Graceful Degradation:** NVS-Fehler sollten nicht die gesamte Konfiguration blockieren
3. **In-Memory Fallback:** Konfiguration im RAM halten wenn NVS nicht verfügbar

---

## Bug V: Fehlgeschlagene Sensoren blockieren GPIO-Auswahl im Frontend

### Problem

Im Frontend werden GPIO 21 und 22 als "belegt" angezeigt, obwohl die Sensor-Konfiguration fehlgeschlagen ist (`config_status=failed`). Der User kann diese Pins nicht mehr auswählen.

### Ursache

Das Frontend/die GPIO-Status-Logik filtert nicht nach `config_status`. Es prüft nur, ob ein Sensor-Eintrag für den GPIO existiert - unabhängig davon, ob die Konfiguration erfolgreich war.

### Erwartetes Verhalten

Pins mit `config_status=failed` sollten:
- Entweder automatisch bereinigt werden
- Oder als "verfügbar (Fehler)" angezeigt werden
- Oder einen "Retry/Delete" Button haben

### Betroffene Dateien

```
El Frontend/src/composables/useGpioStatus.ts            # GPIO Status Logic
El Frontend/src/components/esp/GpioPicker.vue           # GPIO Selection UI
El Servador/god_kaiser_server/src/api/v1/sensors.py     # GET /gpio-status Endpoint
```

---

## Bug W: GPIO_CONFLICT auf Pin 4

### Problem

```
gpio=4, type=ds18b20, status=failed, error=GPIO_CONFLICT
```

### Ursache

Die Wokwi-Konfiguration (`El Trabajante/diagram.json`) hat bereits einen DS18B20 auf GPIO 4. Der User hat versucht, einen zweiten Sensor auf demselben Pin zu konfigurieren.

### Warum das ein Problem ist

Der GPIO-Manager hat korrekt den Konflikt erkannt - **das ist erwartetes Verhalten**. Das Problem ist, dass dieser fehlgeschlagene Eintrag in der DB verbleibt und den Pin blockiert (siehe Bug V).

### Wokwi Konfiguration

```json
// El Trabajante/diagram.json (Lines 14-21)
{
  "type": "wokwi-ds18b20",
  "id": "temp1",
  "attrs": { "temperature": "22.5" }
}
// Connection: esp:D4 -> temp1:DQ (Line 56)
```

---

## Bug X: SHT31 nicht in Wokwi Simulation vorhanden

### Problem

Der User hat versucht, einen SHT31 zu konfigurieren, aber Wokwi simuliert keinen SHT31.

### Wokwi diagram.json Inhalt

```
Vorhandene Parts:
- wokwi-esp32-devkit-v1
- wokwi-ds18b20 (GPIO 4)
- wokwi-led (GPIO 5)
- 2x wokwi-resistor

NICHT vorhanden:
- Kein SHT31 / SHT3x
- Kein I2C Sensor
```

### Konsequenz

Selbst wenn die DB-Konfiguration korrekt wäre, kann Wokwi den SHT31 nicht simulieren - es gibt keine Hardware zum Auslesen.

### Betroffene Datei

```
El Trabajante/diagram.json    # Wokwi Hardware Definition
```

---

## Datenbank-Bereinigung (Quick Fix)

Um die blockierten Pins freizugeben:

```sql
-- Alle fehlgeschlagenen Sensoren für Wokwi-ESP löschen
DELETE FROM sensor_configs
WHERE esp_id = 'd8e2436fdec9414bb2e1adf560b6318d';
```

**Achtung:** Das löst nicht die Root-Cause-Probleme (Bug T, U, V).

---

## Zusammenfassung der offenen Fragen

| Bug | Frage | Wer sollte analysieren |
|-----|-------|----------------------|
| **T** | Wie soll das DB-Schema für I2C Multi-Value Sensoren aussehen? | Backend + DB Design |
| **U** | Soll Wokwi-Mode NVS überspringen? Graceful Degradation? | El Trabajante Firmware |
| **V** | Sollen failed Configs automatisch gelöscht werden? | Frontend + Backend API |
| **W/X** | Soll Wokwi einen SHT31 bekommen oder nur DS18B20 testen? | Test-Strategie |

---

## Relevante Code-Locations (Gesamtübersicht)

### El Trabajante (ESP32 Firmware)
```
src/models/sensor_registry.h/.cpp       # Multi-Value Sensor Definitionen
src/services/config/storage_manager.*   # NVS Persistence
src/services/config/config_manager.*    # Config Loading
src/drivers/i2c_bus.*                   # I2C Bus Management
src/drivers/gpio_manager.*              # GPIO Reservation (Safe-Mode)
diagram.json                            # Wokwi Hardware Definition
```

### El Servador (Python Server)
```
src/db/models/sensor.py                 # SensorConfig Model
src/mqtt/handlers/sensor_handler.py     # MQTT Message Processing
src/api/v1/sensors.py                   # REST API (GPIO Status)
```

### El Frontend (Vue.js)
```
src/utils/sensorDefaults.ts             # Multi-Value Device Config
src/utils/gpioConfig.ts                 # GPIO Pin Definitions
src/composables/useGpioStatus.ts        # GPIO Status Composable
src/components/esp/GpioPicker.vue       # GPIO Selection UI
src/components/esp/ESPOrbitalLayout.vue # Sensor Display
src/views/DeviceDetailView.vue          # Device Configuration
```

---

**Nächster Schritt:** Ein Entwickler sollte die Multi-Value Sensor Logik von El Trabajante bis Frontend durchgehen und ein konsistentes Datenmodell für I2C-Sensoren definieren.
