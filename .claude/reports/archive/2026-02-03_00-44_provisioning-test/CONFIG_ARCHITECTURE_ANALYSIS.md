# AutomationOne Config-Architecture Analyse

**Datum:** 2026-02-03
**Analyst:** Config-Architecture-Analyst
**Einstiegspunkt:** BUG-ONEWIRE-CONFIG-001

---

## Executive Summary

Das System hat ein **fundamentales Architekturproblem**: Es existieren **zwei parallele Pfade** für den Config-Push an ESP32-Geräte, die unterschiedliche Mechanismen für die Payload-Generierung verwenden. Der OneWire-Bug-Fix wurde in `schemas/esp.py` (`ESPSensorConfigItem.to_esp_format()`) implementiert, aber der automatische Config-Push nach Sensor-Erstellung verwendet `ConfigPayloadBuilder` mit `DEFAULT_SENSOR_MAPPINGS` aus `config_mapping.py` - wo `onewire_address` **NICHT** definiert ist.

**Kritikalität: HOCH** - OneWire- und I2C-Sensoren werden bei automatischem Config-Push falsch konfiguriert.

---

## 1. Schema-System (`schemas/`)

### 1.1 Zweck und Verwendung

Das `schemas/` Verzeichnis enthält Pydantic-Models für:
- **API Request/Response Validierung** (primärer Zweck)
- **Datentyp-Konvertierung** zwischen API und internen Systemen
- **Dokumentation** der API-Schnittstelle (OpenAPI-Generierung)

### 1.2 Sensor-bezogene Schemas

| Schema-Klasse | Datei | Verwendung |
|---------------|-------|------------|
| `SensorConfigBase` | sensor.py:57 | Basis-Felder für alle Sensor-Schemas |
| `SensorConfigCreate` | sensor.py:88 | API-Request für Sensor-Erstellung |
| `SensorConfigUpdate` | sensor.py:225 | API-Request für Sensor-Update |
| `SensorConfigResponse` | sensor.py:270 | API-Response für Sensor-Daten |
| `ESPSensorConfigItem` | esp.py:714 | ESP32-Config-Payload-Item |
| `ESPDeviceConfigRequest` | esp.py:828 | Manueller Config-Push Request |

### 1.3 `to_esp_format()` Analyse

**Definiert in:**
- `schemas/esp.py:745` - `ESPSensorConfigItem.to_esp_format()`
- `schemas/esp.py:806` - `ESPActuatorConfigItem.to_esp_format()`
- `schemas/esp.py:847` - `ESPDeviceConfigRequest.to_esp_payload()`

**Aufgerufen von:**
- `api/v1/esp.py:665` - Manueller Config-Push Endpoint `POST /esp/devices/{esp_id}/config`

**Zweck:** Transformiert Frontend-Daten in ESP32-kompatibles Format. Enthält den OneWire-Bug-Fix (Zeilen 768-774).

**PROBLEM:** Diese Methode wird **NUR** beim manuellen Config-Push verwendet, **NICHT** beim automatischen Push nach Sensor-Erstellung!

---

## 2. Config-Mapping-System

### 2.1 Zweck und Architektur

Das Config-Mapping-System in `core/config_mapping.py` bietet:
- Deklaratives Field-Mapping (source → target)
- Typ-Konvertierung
- Default-Werte
- Transformations-Funktionen
- Runtime-Konfigurierbarkeit

```
DB Model (SensorConfig)
    ↓
ConfigMappingEngine.apply_sensor_mapping()
    ↓
DEFAULT_SENSOR_MAPPINGS (Feld-für-Feld Mapping)
    ↓
ESP32-Payload Dict
```

### 2.2 DEFAULT_SENSOR_MAPPINGS

**Aktuell definierte Mappings** (`config_mapping.py:138-200`):

```python
DEFAULT_SENSOR_MAPPINGS = [
    {"source": "gpio", "target": "gpio", "field_type": "int", "required": True},
    {"source": "sensor_type", "target": "sensor_type", "field_type": "string", "required": True},
    {"source": "sensor_name", "target": "sensor_name", "field_type": "string", "default": ""},
    {"source": "sensor_metadata.subzone_id", "target": "subzone_id", "field_type": "string", "default": ""},
    {"source": "enabled", "target": "active", "field_type": "bool", "default": True},
    {"source": "sample_interval_ms", "target": "sample_interval_ms", "field_type": "int", "default": 1000},
    {"source": "_constant", "target": "raw_mode", "field_type": "bool", "default": True},
    {"source": "operating_mode", "target": "operating_mode", "field_type": "string", "default": "continuous"},
    {"source": "sample_interval_ms", "target": "measurement_interval_seconds", "transform": "ms_to_seconds"},
]
```

### 2.3 FEHLENDE Mappings

| Feld | DB-Model vorhanden | Mapping vorhanden | ESP32 erwartet |
|------|-------------------|-------------------|----------------|
| `onewire_address` | ✅ | ❌ **FEHLT** | ✅ |
| `i2c_address` | ✅ | ❌ **FEHLT** | ✅ |
| `interface_type` | ✅ | ❌ **FEHLT** | ✅ |
| `provides_values` | ✅ | ❌ **FEHLT** | ✅ |

---

## 3. Feld-Konsistenz-Matrix

| Feld | DB Model | API Schema (Create) | API Schema (Response) | Config Mapping | ESP Schema (`to_esp_format`) | ESP32 erwartet |
|------|----------|---------------------|----------------------|----------------|------------------------------|----------------|
| gpio | ✅ `sensor.py:59` | ✅ `sensor.py:60` | ✅ `sensor.py:303` | ✅ | ✅ | ✅ |
| sensor_type | ✅ `sensor.py:66` | ✅ `sensor.py:66` | ✅ `sensor.py:66` | ✅ | ✅ | ✅ |
| sensor_name | ✅ `sensor.py:73` | ✅ via base | ✅ via base | ✅ | ✅ | ✅ |
| enabled | ✅ `sensor.py:110` | ✅ `sensor.py:104` | ✅ `sensor.py:287` | ✅ → `active` | ✅ | ✅ |
| sample_interval_ms | ✅ `sensor.py:126` | ✅ `sensor.py:108` | ✅ `sensor.py:291` | ✅ | ✅ | ✅ |
| **interface_type** | ✅ `sensor.py:84` | ✅ `sensor.py:124` | ✅ `sensor.py:303` | ❌ **FEHLT** | ✅ `esp.py:737` | ✅ |
| **i2c_address** | ✅ `sensor.py:91` | ✅ `sensor.py:130` | ✅ `sensor.py:308` | ❌ **FEHLT** | nicht im Schema | ✅ |
| **onewire_address** | ✅ `sensor.py:98` | ✅ `sensor.py:137` | ✅ `sensor.py:313` | ❌ **FEHLT** | ✅ `esp.py:743` | ✅ |
| **provides_values** | ✅ `sensor.py:104` | ✅ `sensor.py:143` | ✅ `sensor.py:318` | ❌ **FEHLT** | nicht im Schema | ⚠️ |

---

## 4. Parallelimplementierungen

### 4.1 Die zwei Config-Push Pfade

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PFAD 1: Manueller Config-Push                   │
│                                                                     │
│   POST /api/v1/esp/devices/{esp_id}/config                         │
│                          ↓                                          │
│   ESPDeviceConfigRequest.to_esp_payload()                          │
│                          ↓                                          │
│   ESPSensorConfigItem.to_esp_format()  ← OneWire-Fix HIER          │
│                          ↓                                          │
│   publisher.publish_config()                                        │
│                          ↓                                          │
│   ESP32 erhält onewire_address ✅                                   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                 PFAD 2: Automatischer Config-Push                   │
│                                                                     │
│   POST /api/v1/sensors/{esp_id}/{gpio}  (Sensor erstellen)         │
│                          ↓                                          │
│   Sensor in DB speichern                                            │
│                          ↓                                          │
│   ConfigPayloadBuilder.build_combined_config()                      │
│                          ↓                                          │
│   mapping_engine.apply_sensor_mapping()                             │
│                          ↓                                          │
│   DEFAULT_SENSOR_MAPPINGS  ← onewire_address NICHT DEFINIERT!      │
│                          ↓                                          │
│   esp_service.send_config()                                         │
│                          ↓                                          │
│   ESP32 erhält onewire_address NICHT ❌                             │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Inkonsistenzen

| Aspekt | Pfad 1 (Manuell) | Pfad 2 (Automatisch) |
|--------|-----------------|---------------------|
| Datenquelle | Request-Body | Datenbank-Model |
| Transformation | `to_esp_format()` | `apply_sensor_mapping()` |
| `onewire_address` | ✅ Enthalten | ❌ FEHLT |
| `i2c_address` | ❌ Nicht explizit | ❌ FEHLT |
| GPIO-Konflikt-Check | ❌ Nicht vorhanden | ✅ Vorhanden |

### 4.3 Empfehlungen zur Konsolidierung

**Option A: Einheitliche Mapping-Engine (Empfohlen)**
- `DEFAULT_SENSOR_MAPPINGS` um fehlende Felder erweitern
- `to_esp_format()` auf Mapping-Engine umstellen
- Single Source of Truth für Feld-Definitionen

**Option B: Einheitliche Schema-Transformation**
- `ConfigPayloadBuilder` entfernen
- Überall `ESPSensorConfigItem.to_esp_format()` verwenden
- Problem: DB-Models müssen in Schema-Objekte konvertiert werden

---

## 5. Datenfluss-Diagramm

### 5.1 Sensor-Erstellung (vollständiger Flow)

```
API Request (SensorConfigCreate)
         ↓
┌────────────────────────────────────┐
│  api/v1/sensors.py:create_sensor() │
│  - Validierung via Pydantic        │
│  - Interface-Type Inference        │
│  - OneWire-Adress-Validierung      │
└────────────────────────────────────┘
         ↓
┌────────────────────────────────────┐
│  sensor_repo.create()              │
│  - SensorConfig Model erstellen    │
│  - In DB speichern (inkl.          │
│    onewire_address!)               │
└────────────────────────────────────┘
         ↓
┌────────────────────────────────────┐
│  db.commit()                       │
└────────────────────────────────────┘
         ↓
┌────────────────────────────────────┐
│  ConfigPayloadBuilder              │
│  .build_combined_config()          │
│                                    │
│  - Lädt alle Sensoren aus DB       │
│  - Wendet DEFAULT_SENSOR_MAPPINGS  │
│    an                              │
│  - onewire_address wird NICHT      │
│    gemappt! ← BUG                  │
└────────────────────────────────────┘
         ↓
┌────────────────────────────────────┐
│  esp_service.send_config()         │
│  - Publiziert zu MQTT              │
│  - ESP32 erhält Config OHNE        │
│    onewire_address!                │
└────────────────────────────────────┘
```

### 5.2 Wo geht `onewire_address` verloren?

**Exakte Stelle:** `config_builder.py:111`

```python
def build_sensor_payload(self, sensor: SensorConfig) -> Dict[str, Any]:
    return self.mapping_engine.apply_sensor_mapping(sensor)
    # ↑ verwendet DEFAULT_SENSOR_MAPPINGS
    # ↑ onewire_address ist dort NICHT definiert
    # ↑ daher wird es NICHT in den Payload aufgenommen
```

---

## 6. Modularitäts-Bewertung

### 6.1 Neuer Sensor-Typ hinzufügen

**Aktueller Aufwand: HOCH (5+ Dateien)**

Für einen neuen Sensor-Typ (z.B. "bme280") müssen geändert werden:

| Datei | Änderung |
|-------|----------|
| `schemas/sensor.py` | `SENSOR_TYPES` Liste erweitern |
| `db/models/sensor.py` | Keine (generisches Model) |
| `core/config_mapping.py` | Ggf. typ-spezifische Mappings |
| `sensors/sensor_libraries/` | Neue Library-Datei erstellen |
| `schemas/sensor_type_defaults.py` | Default-Werte definieren |

### 6.2 Sensor-spezifische Felder

**Aktueller Ansatz:** Generisches Model mit optionalen Feldern

```python
# db/models/sensor.py
interface_type: str          # I2C, ONEWIRE, ANALOG, DIGITAL
i2c_address: Optional[int]   # Nur für I2C
onewire_address: Optional[str]  # Nur für OneWire
```

**Probleme:**
1. Felder existieren im DB-Model, werden aber nicht überall genutzt
2. Keine Validierung ob z.B. `onewire_address` für `interface_type=ONEWIRE` gesetzt ist
3. `provides_values` für Multi-Value-Sensoren ist implementiert aber nicht vollständig integriert

### 6.3 Hardware-Interface-Typen

| Interface | Unterstützt | Feld im DB-Model | Im Config-Mapping |
|-----------|-------------|------------------|-------------------|
| ANALOG | ✅ | `gpio` | ✅ |
| DIGITAL | ✅ | `gpio` | ✅ |
| I2C | ✅ | `i2c_address` | ❌ |
| OneWire | ✅ | `onewire_address` | ❌ |
| SPI | ❌ | - | - |

---

## 7. Validierungs-Analyse

### 7.1 Aktuelle Validierungs-Punkte

| Ebene | Validiert? | Was wird geprüft? | Code-Referenz |
|-------|-----------|-------------------|---------------|
| API (Pydantic) | ✅ | Feldtypen, Ranges, Patterns | `schemas/sensor.py` |
| Service | ✅ Teilweise | Interface-Type Inference, OneWire-Adress-Konflikt | `api/v1/sensors.py:358-421` |
| DB (Constraints) | ✅ | UNIQUE(esp_id, gpio, sensor_type, onewire_address) | `models/sensor.py:226` |
| Config-Builder | ✅ | GPIO-Konflikt-Prüfung | `config_builder.py:184-206` |

### 7.2 Lücken

1. **Kein Validierung vor Config-Push:**
   - Es wird nicht geprüft ob alle erforderlichen Felder für den Sensor-Typ vorhanden sind
   - Ein OneWire-Sensor ohne `onewire_address` wird nicht abgelehnt

2. **Keine Schema-Validierung des Mapping-Outputs:**
   - `apply_sensor_mapping()` gibt ein Dict zurück
   - Es gibt keine Validierung dass das Dict alle von ESP32 erwarteten Felder enthält

3. **Inkonsistente Pflichtfeld-Definition:**
   - `onewire_address` ist in `SensorConfigCreate` optional
   - Aber ESP32 benötigt es für korrekte OneWire-Adressierung

### 7.3 Empfehlung

**Zentrale Validierung vor Config-Push implementieren:**

```python
# Vorgeschlagen in config_builder.py
def validate_sensor_payload(self, payload: Dict, sensor: SensorConfig) -> None:
    """Validiert dass Payload alle benötigten Felder enthält."""
    if sensor.interface_type == "ONEWIRE":
        if not payload.get("onewire_address"):
            raise ConfigValidationError(
                f"OneWire sensor {sensor.sensor_name} requires onewire_address"
            )
    if sensor.interface_type == "I2C":
        if not payload.get("i2c_address"):
            raise ConfigValidationError(
                f"I2C sensor {sensor.sensor_name} requires i2c_address"
            )
```

---

## 8. OneWire-Bug Root-Cause (Architektur-Perspektive)

### 8.1 Warum ist der Bug entstanden?

1. **Zwei parallele Implementierungen** für Config-Push entstanden während der Entwicklung
2. **Pfad 1** (manuell via ESP-API) wurde später implementiert mit vollständiger Feld-Unterstützung
3. **Pfad 2** (automatisch via ConfigPayloadBuilder) wurde früher implementiert und nicht aktualisiert
4. **Keine Tests** die beide Pfade vergleichen
5. **Keine zentrale Feld-Definition** - Felder sind an mehreren Stellen definiert

### 8.2 Warum wurde er falsch gefixt?

Der Bug-Fix in `schemas/esp.py` (`ESPSensorConfigItem.to_esp_format()`) behebt nur **Pfad 1** (manueller Config-Push). Der Entwickler wusste vermutlich nicht, dass **Pfad 2** existiert.

**Code-Referenz des Fixes:**
```python
# schemas/esp.py:768-774
# Include onewire_address for OneWire sensors (DS18B20, etc.)
# Strip AUTO_ prefix if present - ESP32 expects pure 16 hex char ROM-Code
if self.onewire_address:
    addr = self.onewire_address
    if addr.startswith("AUTO_"):
        addr = addr[5:]  # Remove "AUTO_" prefix (5 chars)
    result["onewire_address"] = addr
```

### 8.3 Wie kann man solche Bugs verhindern?

1. **Single Source of Truth für Feld-Definitionen:**
   - Eine zentrale Liste welche Felder für jeden Sensor-Typ benötigt werden
   - Alle Payload-Builder verwenden diese Liste

2. **Integrationstests für Config-Push:**
   - Test: Sensor erstellen → Config-Payload prüfen → alle Felder vorhanden?
   - Test: Manueller Config-Push → gleiche Felder wie automatischer Push?

3. **Architektur-Dokumentation:**
   - Dokumentieren welche Pfade für Config-Push existieren
   - Bei Änderungen alle Pfade prüfen

4. **Payload-Vergleich im Code:**
   - Logging des generierten Payloads vor dem MQTT-Publish
   - Alerting wenn erwartete Felder fehlen

---

## 9. Architektur-Empfehlungen

### 9.1 Kurzfristig (Bug-Fix)

**Priorität: KRITISCH**

`DEFAULT_SENSOR_MAPPINGS` in `config_mapping.py` erweitern:

```python
# Nach dem bestehenden sample_interval_ms Mapping hinzufügen:

# Interface-specific fields (OneWire, I2C)
{
    "source": "interface_type",
    "target": "interface_type",
    "field_type": "string",
    "default": "ANALOG",
},
{
    "source": "onewire_address",
    "target": "onewire_address",
    "field_type": "string",
    "required": False,
    "transform": "strip_auto_prefix",  # Neuer Transform hinzufügen
},
{
    "source": "i2c_address",
    "target": "i2c_address",
    "field_type": "int",
    "required": False,
},
```

**Neuer Transform in `TRANSFORMS` Dict:**
```python
"strip_auto_prefix": lambda x: x[5:] if x and x.startswith("AUTO_") else x,
```

### 9.2 Mittelfristig (Refactoring)

**Priorität: HOCH**

1. **Konsolidierung der Payload-Generierung:**
   - Entscheiden: `ConfigMappingEngine` ODER `to_esp_format()`
   - Nicht beide parallel

2. **Zentrale Feld-Registry:**
   ```python
   # Vorschlag: core/sensor_fields.py
   SENSOR_FIELDS = {
       "base": ["gpio", "sensor_type", "sensor_name", "enabled", ...],
       "onewire": ["onewire_address"],
       "i2c": ["i2c_address"],
       "multi_value": ["provides_values"],
   }
   ```

3. **Validierung vor Push:**
   - Interface-Type-spezifische Feldprüfung
   - Logging fehlender Felder

### 9.3 Langfristig (Architektur-Verbesserung)

**Priorität: MITTEL**

1. **Schema-First Approach:**
   - ESP32-erwartetes Schema als Pydantic-Model definieren
   - Alle Payload-Generierung gegen dieses Schema validieren

2. **Automatische Mapping-Generierung:**
   - Mappings aus DB-Model und ESP-Schema automatisch ableiten
   - Keine manuellen Listen die out-of-sync geraten können

3. **Config-Push Abstraktionsschicht:**
   ```
   SensorConfig (DB)
        ↓
   ConfigTransformer.to_esp_payload(sensor)  # Einziger Einstiegspunkt
        ↓
   ESPConfigPayload (validiertes Schema)
        ↓
   MQTTPublisher.publish_config()
   ```

---

## 10. Anhang: Code-Referenzen

### 10.1 Alle Sensor-Feld-Definitionen

| Feld | Datei:Zeile |
|------|-------------|
| gpio | `models/sensor.py:59`, `schemas/sensor.py:60` |
| sensor_type | `models/sensor.py:66`, `schemas/sensor.py:66` |
| sensor_name | `models/sensor.py:73`, `schemas/sensor.py:70` |
| interface_type | `models/sensor.py:84`, `schemas/sensor.py:124` |
| i2c_address | `models/sensor.py:91`, `schemas/sensor.py:130` |
| onewire_address | `models/sensor.py:98`, `schemas/sensor.py:137`, `schemas/esp.py:743` |
| provides_values | `models/sensor.py:104`, `schemas/sensor.py:143` |
| enabled | `models/sensor.py:110`, `schemas/sensor.py:104` |
| sample_interval_ms | `models/sensor.py:126`, `schemas/sensor.py:108` |

### 10.2 Alle Mapping-Verwendungen

| Ort | Methode |
|-----|---------|
| `config_builder.py:111` | `mapping_engine.apply_sensor_mapping(sensor)` |
| `config_builder.py:136` | `mapping_engine.apply_actuator_mapping(actuator)` |

### 10.3 Alle Config-Push Stellen

| Ort | Methode | Pfad |
|-----|---------|------|
| `sensors.py:487-491` | `ConfigPayloadBuilder` → `esp_service.send_config()` | Automatisch |
| `sensors.py:574-578` | `ConfigPayloadBuilder` → `esp_service.send_config()` | Automatisch |
| `actuators.py:376-377` | `ConfigPayloadBuilder` → automatisch | Automatisch |
| `actuators.py:862-863` | `ConfigPayloadBuilder` → automatisch | Automatisch |
| `esp.py:665` | `request.to_esp_payload()` → `publisher.publish_config()` | Manuell |

---

## 11. Fazit

Das AutomationOne Config-System leidet unter **historisch gewachsener Komplexität** mit zwei parallelen Implementierungen. Der OneWire-Bug zeigt, dass Änderungen in einem Pfad nicht automatisch den anderen betreffen.

**Sofortmaßnahme:** `DEFAULT_SENSOR_MAPPINGS` um `onewire_address` und `i2c_address` erweitern.

**Mittelfristig:** Konsolidierung auf einen einzigen Mechanismus für Payload-Generierung mit zentraler Feld-Definition und Validierung.
