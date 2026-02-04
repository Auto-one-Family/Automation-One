# MQTT OneWire-Fix Traffic Analyse

**Datum:** 2026-02-03 01:15 CET
**Analyst:** MQTT Traffic Analyst Agent
**Fokus:** Verifikation ob `onewire_address` im Config-Payload gesendet wird

---

## 1. Kritische Log-Analyse

### Zeitlinie (00:56:44)

| Zeit | Event | Status |
|------|-------|--------|
| 00:56:44 | Sensor created: ESP_472204 GPIO 4 by Robin | OK |
| 00:56:44 | Built config payload: 1 sensors, 1 actuators | OK |
| 00:56:44 | Publishing config to ESP_472204 | OK |
| 00:56:44 | Config published successfully | OK |
| 00:56:44 | **Config FAILED on ESP_472204: sensor** | ERROR |
| 00:56:44 | GPIO 4: GPIO_CONFLICT - GPIO 4 already used by sensor (OneWireBus) | ERROR |

### Log-Einträge

```json
// Sensor Creation (00:56:44)
{"level": "INFO", "message": "Sensor created: ESP_472204 GPIO 4 by Robin"}

// Config Build
{"level": "INFO", "message": "Built config payload for ESP_472204: 1 sensors, 1 actuators, zone=test_zone"}

// Config Publish
{"level": "INFO", "message": "Publishing config to ESP_472204: 1 sensor(s), 1 actuator(s)"}
{"level": "INFO", "message": "✅ Config published successfully to ESP_472204"}

// ESP32 Response - CRITICAL ERROR
{"level": "ERROR", "message": "❌ Config FAILED on ESP_472204: sensor - All 1 item(s) failed to configure"}
{"level": "ERROR", "message": "   ↳ GPIO 4: GPIO_CONFLICT - GPIO 4 already used by sensor (OneWireBus)"}
```

---

## 2. Config-Payload Analyse

### onewire_address im Mapping?

**Analyse von `config_mapping.py`:**

```python
# DEFAULT_SENSOR_MAPPINGS (Zeile 138-200)
DEFAULT_SENSOR_MAPPINGS: List[Dict[str, Any]] = [
    {"source": "gpio", "target": "gpio", ...},
    {"source": "sensor_type", "target": "sensor_type", ...},
    {"source": "sensor_name", "target": "sensor_name", ...},
    {"source": "sensor_metadata.subzone_id", "target": "subzone_id", ...},
    {"source": "enabled", "target": "active", ...},
    {"source": "sample_interval_ms", "target": "sample_interval_ms", ...},
    {"source": "_constant", "target": "raw_mode", ...},
    {"source": "operating_mode", "target": "operating_mode", ...},
    {"source": "sample_interval_ms", "target": "measurement_interval_seconds", ...},

    # ⚠️ FEHLT: onewire_address MAPPING!
]
```

### onewire_address in Datenbank?

**JA** - Das Feld existiert in `sensor.py:98`:

```python
onewire_address: Mapped[Optional[str]] = mapped_column(
    String(16),
    nullable=True,
    ...
)
```

### Fazit: Config-Payload-Inhalt

| Feld | Erwartet | Tatsächlich Gesendet |
|------|----------|---------------------|
| gpio | 4 | ✅ 4 |
| sensor_type | ds18b20 | ✅ ds18b20 |
| sensor_name | Test DS18B20 | ✅ Ja |
| active | true | ✅ Ja |
| raw_mode | true | ✅ Ja |
| sample_interval_ms | 30000 | ✅ Ja |
| **onewire_address** | **28FF641E8D3C0C79** | **❌ FEHLT!** |

---

## 3. Error-Typ Vergleich

| Aspekt | Vorher (Bug) | Jetzt (Aktuell) |
|--------|--------------|-----------------|
| **Error Code** | 1041 | 1041 |
| **Error Type** | ROM-Code length 0 | GPIO_CONFLICT |
| **Fehlermeldung** | Invalid OneWire ROM-Code length | GPIO 4 already used by sensor (OneWireBus) |
| **Ursache** | `onewire_address` fehlte | OneWire-Bus bereits initialisiert |

### Interpretation

Der Fehler hat sich geändert, aber **NICHT** weil der Fix funktioniert:

1. **Alte Situation:** ESP32 bekam leeres `onewire_address` → "ROM-Code length 0" Error
2. **Aktuelle Situation:** ESP32 versucht GPIO 4 zu konfigurieren, aber der OneWire-Bus läuft bereits auf GPIO 4 → "GPIO_CONFLICT"

Der GPIO_CONFLICT tritt auf, weil:
- Der OneWire-Bus beim vorherigen Config-Versuch initialisiert wurde
- Bei erneutem Config-Versuch ist GPIO 4 bereits belegt
- Der ESP32 erkennt den Konflikt korrekt

---

## 4. Actuator Commands

### ON Command (00:57:17)

```json
{"level": "INFO", "message": "Publishing actuator command to ESP_472204 GPIO 26: ON (value=1.0)"}
{"level": "INFO", "message": "✅ Actuator command confirmed: esp_id=ESP_472204, gpio=26, command=ON, value=1.0"}
```

**Status:** ✅ Funktioniert korrekt

### OFF Command (00:57:38)

```json
{"level": "INFO", "message": "Publishing actuator command to ESP_472204 GPIO 26: OFF (value=0.0)"}
```

**Status:** ✅ Funktioniert korrekt

---

## 5. Root-Cause-Analyse

### Problem 1: onewire_address wird NICHT gesendet

**Ursache:** Das Feld fehlt im `DEFAULT_SENSOR_MAPPINGS` in `config_mapping.py`

**Datei:** `El Servador/god_kaiser_server/src/core/config_mapping.py`

**Fehlende Zeilen:**

```python
# MUSS HINZUGEFÜGT WERDEN nach Zeile 199:
{
    "source": "onewire_address",
    "target": "onewire_address",
    "field_type": "string",
    "required": False,
    "default": "",
},
```

### Problem 2: GPIO_CONFLICT auf ESP32

**Ursache:** ESP32-Firmware initialisiert OneWire-Bus, aber kann ihn nicht neu konfigurieren

**Erklärung:**
1. Erster Config-Versuch: OneWire-Bus wird auf GPIO 4 initialisiert (mit leerem ROM-Code → Fehler)
2. Zweiter Config-Versuch: ESP32 sieht GPIO 4 als "bereits belegt"
3. Der ESP32 verweigert die Rekonfiguration

**Mögliche Fixes:**
- ESP32-Firmware sollte OneWire-Bus vor Re-Config deinitialisieren
- Oder: Clean-Restart des Sensors bei Config-Änderungen

---

## 6. Fix-Bewertung

### Server-seitiger OneWire-Fix

| Kriterium | Status | Beweis |
|-----------|--------|--------|
| onewire_address wird gesendet | ❌ NEIN | Fehlt in DEFAULT_SENSOR_MAPPINGS |
| Wert korrekt (16 hex chars) | N/A | Wird nicht gesendet |
| Format korrekt (String) | N/A | Wird nicht gesendet |

**Ergebnis:** ❌ **FIX NICHT IMPLEMENTIERT**

### ESP32-seitiger Fix

| Kriterium | Status | Beweis |
|-----------|--------|--------|
| ROM-Code-Length Error behoben | ✅ (indirekt) | Neuer Error statt alter |
| GPIO_CONFLICT Problem | ❌ NEUES PROBLEM | OneWire-Bus Handling |

**Ergebnis:** ⚠️ **NEUES PROBLEM ENTDECKT**

---

## 7. Erforderliche Aktionen

### Sofort (Server)

1. **KRITISCH:** `onewire_address` zu `DEFAULT_SENSOR_MAPPINGS` hinzufügen in `config_mapping.py`

```python
# Nach Zeile 199 einfügen:
{
    "source": "onewire_address",
    "target": "onewire_address",
    "field_type": "string",
    "required": False,
    "default": "",
},
```

### Danach (ESP32)

2. **GPIO_CONFLICT Problem lösen:**
   - OneWire-Bus vor Re-Config deinitialisieren
   - Oder: SensorManager.cleanup() vor SensorManager.configure()

---

## 8. Zusammenfassung

| Komponente | Status | Problem |
|------------|--------|---------|
| Server: Config-Builder | ❌ | `onewire_address` fehlt im Mapping |
| Server: DB-Schema | ✅ | Feld existiert korrekt |
| ESP32: OneWire-Init | ⚠️ | GPIO_CONFLICT bei Re-Config |
| ESP32: Actuators | ✅ | Commands funktionieren |

**Gesamtstatus:** ❌ **SERVER-FIX UNVOLLSTÄNDIG + ESP32 RE-CONFIG PROBLEM**

---

*Report generiert durch MQTT Traffic Analyst Agent*
