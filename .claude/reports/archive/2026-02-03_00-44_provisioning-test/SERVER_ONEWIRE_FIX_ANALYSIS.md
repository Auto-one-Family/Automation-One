# Server OneWire-Fix Log Analyse

**Datum:** 2026-02-03
**Log-Zeitraum:** 00:55 - 00:58 CET
**Fokus:** onewire_address im Config-Payload
**Agent:** SERVER_DEBUG_AGENT v2.0

---

## Executive Summary

**🔴 KRITISCHER BUG: OneWire-Fix funktioniert NICHT**

Das `to_esp_format()` Fix wird **NICHT angewendet**. Der MQTT Config-Payload enthält **KEIN `onewire_address` Feld**, was dazu führt, dass der ESP32 die Sensor-Konfiguration mit `GPIO_CONFLICT` ablehnt.

**Root Cause:** `DEFAULT_SENSOR_MAPPINGS` in `config_mapping.py` enthält kein Mapping für `onewire_address`. Das Feld wird nie aus dem Database-Model extrahiert und nie zum ESP32-Payload hinzugefügt.

---

## 1. Sensor-Erstellung (00:56:44)

### API Request
```json
{
  "timestamp": "2026-02-03 00:56:44",
  "level": "INFO",
  "logger": "src.api.v1.sensors",
  "message": "Sensor created: ESP_472204 GPIO 4 by Robin"
}
```

### Config Building
```json
{
  "timestamp": "2026-02-03 00:56:44",
  "level": "INFO",
  "logger": "src.services.config_builder",
  "message": "Built config payload for ESP_472204: 1 sensors, 1 actuators, zone=test_zone"
}
```

### DB-Speicherung
- **onewire_address gespeichert:** UNBEKANNT (kein Log dafür)
- **Empfehlung:** Mit `db-inspector` prüfen

---

## 2. Config-Publishing (KRITISCH) (00:56:44)

### MQTT Payload gesendet

**Topic:** `kaiser/god/esp/ESP_472204/config`

```json
{
  "sensors": [
    {
      "gpio": 4,
      "sensor_type": "ds18b20",
      "sensor_name": "Test DS18B20 Temperatur",
      "subzone_id": "",
      "active": true,
      "sample_interval_ms": 30000,
      "raw_mode": true,
      "operating_mode": "continuous",
      "measurement_interval_seconds": 30
    }
  ],
  "actuators": [],
  "correlation_id": "e2e5d058-7501-490e-9dfd-0dabf5e1b495",
  "timestamp": 1770076614
}
```

**🔴 onewire_address im Payload?**
- [❌] **NEIN** - Feld fehlt komplett!
- Erwarteter Wert wäre: `"onewire_address": "28FF641E8D3C0C79"`

### to_esp_format() Output
- **Nicht geloggt** - kein DEBUG-Logging vorhanden

---

## 3. Config-Response vom ESP (00:56:44)

### Fehlermeldung
```json
{
  "timestamp": "2026-02-03 00:56:44",
  "level": "ERROR",
  "logger": "src.mqtt.handlers.config_handler",
  "message": "↳ GPIO 4: GPIO_CONFLICT - GPIO 4 already used by sensor (OneWireBus)"
}
```

### ESP32 Response Payload
```json
{
  "status": "error",
  "type": "sensor",
  "count": 0,
  "failed_count": 1,
  "message": "All 1 item(s) failed to configure",
  "failures": [
    {
      "type": "sensor",
      "gpio": 4,
      "error_code": 1002,
      "error": "GPIO_CONFLICT",
      "detail": "GPIO 4 already used by sensor (OneWireBus)"
    }
  ]
}
```

### Error-Typ
- [✅] **GPIO_CONFLICT** (Error Code 1002)
- [❌] ~~ROM-Code Length (alter Bug)~~ - anderer Fehler!

**Analyse:** ESP32 kann GPIO 4 nicht als DS18B20 konfigurieren, weil ohne `onewire_address` der Sensor nicht vom OneWire-Bus unterschieden werden kann.

---

## 4. Actuator-Flow

### Create (00:57:08)
```json
{
  "timestamp": "2026-02-03 00:57:08",
  "level": "INFO",
  "logger": "src.api.v1.actuators",
  "message": "Actuator created: ESP_472204 GPIO 26"
}
```

### Commands
- **ON (00:57:17):** Erfolgreich
- **OFF (00:57:38):** Erfolgreich

### ESP32 Response
```json
{
  "status": "success",
  "type": "actuator",
  "count": 1
}
```

**Actuator funktioniert korrekt** - das Problem ist auf Sensoren isoliert.

---

## 5. Root Cause Analysis

### Das Problem

**Datei:** `El Servador/god_kaiser_server/src/core/config_mapping.py`

`DEFAULT_SENSOR_MAPPINGS` (Lines 138-200) enthält:
- ✅ `gpio`
- ✅ `sensor_type`
- ✅ `sensor_name`
- ✅ `sample_interval_ms`
- ✅ `operating_mode`
- ❌ **`onewire_address` FEHLT!**

### Execution Flow

```
1. API → Sensor in DB erstellt (vermutlich mit onewire_address in sensor_metadata)
2. ConfigBuilder → apply_sensor_mapping()
3. MappingEngine → iteriert durch DEFAULT_SENSOR_MAPPINGS
4. Extraktion → nur definierte Felder werden extrahiert
5. Ergebnis → onewire_address wird NIEMALS extrahiert/gesendet
```

---

## 6. Fazit

| Aspekt | Status |
|--------|--------|
| onewire_address in DB | ❓ UNBEKANNT |
| onewire_address in MQTT Payload | ❌ **FEHLT** |
| AUTO_ Prefix entfernt | ✅ Nicht verwendet |
| ESP meldet GPIO_CONFLICT | ✅ Korrekt (Sensor fehlt ROM) |
| Actuator funktioniert | ✅ Ja |

---

## 7. Server-Fix Bewertung

**Server-seitiger Fix funktioniert?** ❌ **NEIN**

### Begründung

Der Fix ist **unvollständig**. Während Database und API möglicherweise `onewire_address` korrekt handhaben, ist die **Config-Mapping-Layer nicht konfiguriert**, das Feld in den ESP32-Payload einzufügen.

Das fehlende Mapping in `DEFAULT_SENSOR_MAPPINGS` verhindert, dass `onewire_address` jemals zum ESP32 gesendet wird.

---

## 8. Empfohlene Aktion

### Fix in config_mapping.py

**Datei:** `El Servador/god_kaiser_server/src/core/config_mapping.py`

**Hinzufügen zu `DEFAULT_SENSOR_MAPPINGS`:**

```python
{
    "source": "sensor_metadata.onewire_address",
    "target": "onewire_address",
    "field_type": "string",
    "required": False,  # Nur für DS18B20 erforderlich
},
```

### Test nach Fix

Erwarteter MQTT-Payload:
```json
{
  "sensors": [
    {
      "gpio": 4,
      "sensor_type": "ds18b20",
      "onewire_address": "28FF641E8D3C0C79",  // ← MUSS VORHANDEN SEIN
      ...
    }
  ]
}
```

Erwartete ESP32-Response:
```json
{
  "status": "success",
  "type": "sensor",
  "count": 1
}
```

---

## 9. Nächste Schritte

1. **DB prüfen:** `db-inspector` Agent → Ist `onewire_address` in `sensor_metadata`?
2. **Mapping fixen:** `onewire_address` zu `DEFAULT_SENSOR_MAPPINGS` hinzufügen
3. **Server neustarten**
4. **Sensor neu erstellen und testen**

---

**Report Ende**
