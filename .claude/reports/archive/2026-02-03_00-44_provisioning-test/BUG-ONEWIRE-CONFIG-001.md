# BUG-ONEWIRE-CONFIG-001: OneWire ROM-Code wird nicht an ESP32 gesendet

**Status:** GEFIXT (2. Iteration)
**Datum:** 2026-02-03

## Problem

DS18B20 Sensoren erhalten keine `onewire_address` im Config-Payload.
ESP32 meldet Error 1041: "Invalid OneWire ROM-Code length (expected 16, got 0)"

## Root Cause

1. **Erster Fix-Versuch (FALSCH):** `schemas/esp.py` -> `to_esp_format()`
   - Dieser Code-Pfad wird NICHT fuer automatische Config-Pushes verwendet
   - Ist nur fuer manuellen Endpoint `POST /esp/devices/{id}/config`
   - Dieser Endpoint wird vom Frontend NIE aufgerufen

2. **Echter Pfad:** `config_mapping.py` -> `DEFAULT_SENSOR_MAPPINGS`
   - Wird bei JEDEM Sensor CRUD verwendet
   - Fehlte: `onewire_address`, `i2c_address`, `interface_type`

## Loesung

`DEFAULT_SENSOR_MAPPINGS` in `config_mapping.py` erweitert um:
- `interface_type` (default: "ANALOG")
- `onewire_address` (mit `strip_auto_prefix` Transform)
- `i2c_address` (default: 0)

Neuer Transform `strip_auto_prefix`:
```python
"strip_auto_prefix": lambda x: x[5:] if x and isinstance(x, str) and x.startswith("AUTO_") else (x or "")
```

## Betroffene Dateien

- `El Servador/.../core/config_mapping.py` - Mappings + Transform hinzugefuegt
- `El Servador/.../schemas/esp.py` - NICHT RELEVANT (toter Code fuer diesen Flow)

## Architektur-Erkenntnisse

Das System hat zwei parallele Config-Push-Pfade:

### Pfad 1: Schema-basiert (NICHT AKTIV)
```
POST /esp/devices/{id}/config
  -> ESPDeviceRead.to_esp_format()
  -> Manueller Push (nie genutzt)
```

### Pfad 2: Mapping-basiert (AKTIV)
```
Sensor CRUD (create/update/delete)
  -> ConfigPayloadBuilder
  -> ConfigMappingEngine.apply_sensor_mapping()
  -> DEFAULT_SENSOR_MAPPINGS
  -> MQTT Push an ESP32
```

## Empfehlung (mittelfristig)

- `schemas/esp.py` -> `to_esp_format()` und zugehoerigen Endpoint dokumentieren oder entfernen
- Beide Pfade auf gemeinsame Mapping-Basis refactoren

## Verifikation

Nach Server-Neustart:
1. Sensor mit `sensor_type: ds18b20` erstellen
2. ESP32 Serial-Log pruefen: `onewire_address` muss 16 Zeichen haben
3. Kein Error 1041 mehr
