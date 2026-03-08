# Bericht: GPIO vs I2C-Adresse — Analyse & Klarstellung

**Datum:** 2026-03-07
**Referenz:** Teilauftrag 0.2 aus `auftrag-phase0-datenfehler-mock-debugging-2026-03-07.md`
**Status:** Abgeschlossen

---

## IST-Zustand: Alle 9 Prüfpunkte

### Prüfpunkt 1: SensorConfig Model ✅
**Datei:** `El Servador/god_kaiser_server/src/db/models/sensor.py`

- `gpio` (Integer, nullable): GPIO-**Pin-Nummer** (z.B. 21 für SDA). Nullable für I2C/OneWire.
- `i2c_address` (Integer, nullable): I2C-**Adresse** (z.B. 68 für 0x44). Separates Feld.
- `interface_type` (String): "I2C", "ONEWIRE", "ANALOG", "DIGITAL"
- `onewire_address` (String, nullable): ROM-Code für DS18B20.
- **UniqueConstraint:** `(esp_id, gpio, sensor_type, onewire_address, i2c_address)`

**Ergebnis:** gpio und i2c_address sind korrekt separate Spalten.

### Prüfpunkt 2: SensorData Model ✅
**Datei:** `El Servador/god_kaiser_server/src/db/models/sensor.py:269-407`

- `gpio` (Integer, NOT NULL): GPIO-**Pin-Nummer**. Kein i2c_address-Feld in SensorData.
- `subzone_id` (String, nullable): Subzone zum Messzeitpunkt (Phase 0.1).

**Ergebnis:** SensorData speichert gpio als Pin-Nummer. I2C-Adresse wird nicht gespeichert — die Zuordnung erfolgt über sensor_type.

### Prüfpunkt 3: sensor_handler.py ✅
**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py:105-227`

- Topic: `kaiser/god/esp/{esp_id}/sensor/{gpio}/data` → gpio = Pin-Nummer aus Topic
- Payload: `gpio` = Pin-Nummer, `i2c_address` = I2C-Adresse (separat, optional)
- Lookup-Logik:
  - I2C: 4-way lookup `(esp_id, gpio, sensor_type, i2c_address)` via `get_by_esp_gpio_type_and_i2c()`
  - OneWire: 4-way lookup `(esp_id, gpio, sensor_type, onewire_address)` via `get_by_esp_gpio_type_and_onewire()`
  - Standard: 3-way lookup `(esp_id, gpio, sensor_type)` via `get_by_esp_gpio_and_type()`

**Ergebnis:** Handler unterscheidet korrekt zwischen GPIO-Pin und I2C-Adresse.

### Prüfpunkt 4: zone_subzone_resolver.py ⚠️
**Datei:** `El Servador/god_kaiser_server/src/utils/zone_subzone_resolver.py`

- `resolve_zone_subzone_for_sensor(esp_id_str, gpio, ...)` nimmt nur GPIO-Pin
- Ruft `subzone_repo.get_subzone_by_gpio(esp_id_str, gpio)` auf
- **Kein sensor_type, kein i2c_address in der Signatur**

**Ergebnis:** Alle I2C-Sensoren auf GPIO 21 bekommen dieselbe Subzone (siehe Prüfpunkt 10).

### Prüfpunkt 5: SubzoneConfig Model ✅
**Datei:** `El Servador/god_kaiser_server/src/db/models/subzone.py`

- `assigned_gpios` (JSON): Array von GPIO-**Pin-Nummern** `[4, 5, 6]`
- Doc: "JSON array of GPIO pin numbers"

**Ergebnis:** assigned_gpios enthält Pin-Nummern, keine I2C-Adressen.

### Prüfpunkt 6: sensor_type_registry.py — KORRIGIERT
**Datei:** `El Servador/god_kaiser_server/src/sensors/sensor_type_registry.py`

**VOR Fix:**
- `MULTI_VALUE_SENSORS`: sht31 ✅, bmp280 ✅, **bme280 ❌ fehlte**
- `SENSOR_TYPE_MAPPING`: Keine bme280-Varianten

**NACH Fix:**
- bme280 in `MULTI_VALUE_SENSORS` hinzugefügt (temp + pressure + humidity)
- bme280-Varianten in `SENSOR_TYPE_MAPPING` hinzugefügt

### Prüfpunkt 7: Frontend SENSOR_TYPE_CONFIG ✅
**Datei:** `El Frontend/src/utils/sensorDefaults.ts`

Alle registriert:
- `bmp280_temp` ✅ (Zeile 298)
- `bmp280_pressure` ✅ (Zeile 314)
- `bme280_temp` ✅ (Zeile 330)
- `bme280_humidity` ✅ (Zeile 346)
- `bme280_pressure` ✅ (Zeile 362)
- `MULTI_VALUE_DEVICES`: sht31 ✅, bmp280 ✅, bme280 ✅ (Zeile 788-803)

### Prüfpunkt 8: AddSensorModal ✅
**Datei:** `El Frontend/src/components/esp/AddSensorModal.vue`

- I2C-Sensoren: Zeigt **I2C-Adresse-Dropdown** (Zeile 415-423)
- GPIO wird für I2C auf 0 gesetzt (Zeile 91, 228)
- `i2c_address` wird korrekt an API gesendet (Zeile 227)
- `I2C_ADDRESS_REGISTRY` hat Einträge für sht31, bmp280, bme280, bh1750, veml7700

**Ergebnis:** Kein Fix nötig. UI fragt korrekt I2C-Adresse statt GPIO-Pin ab.

### Prüfpunkt 9: Firmware MQTT-Payload ✅
**Datei:** `El Trabajante/src/services/sensor/sensor_manager.cpp:1411-1488`

`buildMQTTPayload()` sendet:
```json
{
  "gpio": 21,            // SDA-Pin-Nummer
  "i2c_address": 68,     // Separate I2C-Adresse (nur wenn != 0)
  "sensor_type": "sht31_temp",
  "onewire_address": "...",  // Nur wenn nicht leer
  ...
}
```

**Ergebnis:** gpio und i2c_address sind separate Felder im MQTT-Payload. Bestätigt.

---

## Subzone-Zuordnung bei I2C (Prüfpunkt 10) ⚠️

### Problem
`get_subzone_by_gpio(esp_id, gpio)` durchsucht `subzone_configs.assigned_gpios`:

```python
# subzone_repo.py:128-143
for subzone in subzones:
    if subzone.assigned_gpios and gpio in subzone.assigned_gpios:
        return subzone
```

Bei I2C: Alle Sensoren auf GPIO 21 → gleiche Subzone.

### Bewertung: **Aktuell kein Problem**

1. I2C-Sensoren auf demselben Bus sind physisch am selben Ort (gleicher SDA/SCL)
2. In einem Gewächshaus-Szenario messen sie typischerweise am gleichen Standort
3. Wenn verschiedene I2C-Sensoren in verschiedenen Subzones nötig wären, bräuchten sie physisch getrennte I2C-Busse (verschiedene GPIO-Pins)

### Wann es ein Problem wird
Falls BME280 auf Bus A (GPIO 21) in Subzone "Bewässerung" und SHT31 auf demselben Bus in Subzone "Belüftung" sein soll → unmöglich mit aktuellem System. Lösung wäre dann Zuordnung über `(gpio, sensor_type)` oder `(gpio, i2c_address)`.

**Empfehlung:** Für Phase 0 nicht ändern. Falls nötig, in späterem Auftrag.

---

## Was korrigiert wurde

| Datei | Änderung |
|-------|----------|
| `sensor_type_registry.py` | bme280 in `MULTI_VALUE_SENSORS` hinzugefügt (temp + pressure + humidity) |
| `sensor_type_registry.py` | bme280-Varianten in `SENSOR_TYPE_MAPPING` hinzugefügt |

---

## BMP280 Init-Sequenz

**Datei:** `El Trabajante/src/drivers/i2c_sensor_protocol.cpp:59-96`

- BMP280_PROTOCOL ist als `REGISTER_BASED` definiert
- Kommentar: "Requires initial configuration write (ctrl_meas 0xF4)"
- Kommentar: "Note: Sensor must be pre-configured via separate init sequence"

**Aber:** Es gibt **keine Implementierung** des ctrl_meas-Register-Writes im Code. Kein `writeRegister(0xF4, ...)` oder ähnliches in `i2c_bus.cpp` oder `sensor_manager.cpp`.

**Konsequenz:** BMP280 wird ohne Mode-Konfiguration gelesen. Das Standardverhalten nach Power-On ist "Sleep Mode" → der Sensor liefert 0x800000 (Raw) für Pressure und Temperature. Dies ist ein **bekanntes Problem** und ein eigener Auftrag (nicht Teil von Teilauftrag 0.2).

---

## Akzeptanzkriterien

- [x] Bericht mit IST-Zustand aller 9 Prüfpunkte
- [x] bme280 im MULTI_VALUE_SENSORS-Registry
- [x] bmp280_temp, bmp280_pressure im Frontend SENSOR_TYPE_CONFIG (war bereits vorhanden)
- [x] AddSensorModal zeigt I2C-Adresse statt GPIO-Pin für I2C-Sensoren (war bereits korrekt)
- [x] Subzone-Zuordnung bei I2C dokumentiert (kein akutes Problem)
- [ ] Build + Tests grün → wird im nächsten Schritt verifiziert
