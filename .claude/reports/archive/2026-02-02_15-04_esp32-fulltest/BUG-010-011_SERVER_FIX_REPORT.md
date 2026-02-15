# Server-Debug Report: BUG-010 & BUG-011

**Datum:** 2026-02-02
**Agent:** Server-Debug
**Bugs:** BUG-010 (Config-Endpoint leer), BUG-011 (Feld-Mapping)
**Status:** GEFIXT

---

## 1. Analyse-Ergebnisse

### BUG-010: Config-Endpoint sendet leere `{}`

**Symptom:**
```
POST /api/v1/esp/devices/ESP_472204/config
Body: {"sensors": [{"gpio": 4, "sensor_type": "DS18B20", ...}]}

ESP empfängt: {}  <- LEER!
```

**Root Cause gefunden:**

Das Schema `ESPConfigUpdate` (esp.py:709-762) hatte **KEINE** `sensors` oder `actuators` Felder:

```python
class ESPConfigUpdate(BaseModel):
    wifi_ssid: Optional[str]       # <- System config
    wifi_password: Optional[str]   # <- System config
    mqtt_broker: Optional[str]     # <- System config
    # ... KEINE sensors/actuators!
```

Wenn das Frontend `{"sensors": [...]}` sendete:
1. Pydantic ignorierte die unbekannten Felder
2. `request.model_dump(exclude_unset=True)` gab `{}` zurück
3. Leeres Payload wurde via MQTT gesendet

### BUG-011: Feld-Mapping Server↔ESP falsch

**Symptom:**
Frontend/Server sendete möglicherweise:
```json
{"sensors": [{"type": "DS18B20", "name": "Temp"}]}
```

ESP erwartete aber:
```json
{"sensors": [{"sensor_type": "DS18B20", "sensor_name": "Temp"}]}
```

**Root Cause gefunden:**

Der Endpoint nutzte `model_dump()` direkt ohne Transformation durch `ConfigMappingEngine`.

---

## 2. Gefundene Patterns

### Pattern 1: ConfigMappingEngine (bereits vorhanden, aber nicht genutzt)

**Datei:** `src/core/config_mapping.py`

Der Server hatte bereits ein ausgereiftes Mapping-System:
- `apply_sensor_mapping()` transformiert DB-Models zu ESP-Format
- Unterstützt: `sensor_type`, `sensor_name`, `active`, `raw_mode`
- Problem: Wurde vom Endpoint nicht genutzt

### Pattern 2: publisher.publish_config() (bereits vorhanden)

**Datei:** `src/mqtt/publisher.py:211-271`

Der Publisher hatte bereits eine korrekte `publish_config()` Methode:
- Fügt Timestamp hinzu
- Verwendet QoS 2
- Loggt sensor/actuator counts

Problem: Endpoint nutzte `_publish_with_retry()` direkt statt `publish_config()`.

---

## 3. Implementierte Fixes

### Fix 1: Neue Schemas erstellt

**Datei:** `src/schemas/esp.py`

Drei neue Schemas hinzugefügt:

```python
class ESPSensorConfigItem(BaseModel):
    """Akzeptiert beide Formate (Frontend und ESP)."""
    gpio: int
    sensor_type: Optional[str]  # ESP-Format
    type: Optional[str]         # Frontend-Alias
    sensor_name: Optional[str]  # ESP-Format
    name: Optional[str]         # Frontend-Alias
    active: bool = True
    raw_mode: bool = True

    def to_esp_format(self) -> Dict[str, Any]:
        """Transformiert zu ESP-erwartetem Format."""
        return {
            "gpio": self.gpio,
            "sensor_type": self.sensor_type or self.type or "unknown",
            "sensor_name": self.sensor_name or self.name or f"Sensor_GPIO{self.gpio}",
            "active": self.active,
            "raw_mode": self.raw_mode,
            # ...
        }

class ESPActuatorConfigItem(BaseModel):
    """Analog für Actuators, mit digital->relay Mapping."""
    # ...

    def to_esp_format(self) -> Dict[str, Any]:
        # Map 'digital' to 'relay' für ESP32-Kompatibilität
        raw_type = self.actuator_type or self.type or "relay"
        esp_type = raw_type.lower()
        if esp_type in ("digital", "binary", "switch"):
            esp_type = "relay"
        # ...

class ESPDeviceConfigRequest(BaseModel):
    """Request mit sensors und actuators Listen."""
    sensors: List[ESPSensorConfigItem] = Field(default_factory=list)
    actuators: List[ESPActuatorConfigItem] = Field(default_factory=list)

    def to_esp_payload(self) -> Dict[str, Any]:
        """Transformiert gesamte Config zu ESP-Format."""
        return {
            "sensors": [s.to_esp_format() for s in self.sensors],
            "actuators": [a.to_esp_format() for a in self.actuators],
        }
```

### Fix 2: Endpoint aktualisiert

**Datei:** `src/api/v1/esp.py:602-693`

```python
# VORHER (FALSCH):
async def update_device_config(
    esp_id: str,
    request: ESPConfigUpdate,  # <- Falsches Schema
    ...
):
    config_data = request.model_dump(exclude_unset=True)  # <- Gibt {} zurück
    success = publisher._publish_with_retry(...)  # <- Falsche Methode

# NACHHER (KORREKT):
async def update_device_config(
    esp_id: str,
    request: ESPDeviceConfigRequest,  # <- Richtiges Schema
    ...
):
    config_data = request.to_esp_payload()  # <- Transformiert korrekt
    success = publisher.publish_config(     # <- Richtige Methode
        esp_id=esp_id,
        config=config_data,
    )
```

---

## 4. Verifizierung

### Test 1: Schema-Import
```bash
$ poetry run python -c "from src.schemas import ESPDeviceConfigRequest; print('OK')"
Schema imports OK
```

### Test 2: Transformation
```bash
$ poetry run python << 'EOF'
from src.schemas import ESPDeviceConfigRequest
r = ESPDeviceConfigRequest(
    sensors=[{"gpio": 4, "type": "DS18B20", "name": "Frontend Format"}],
    actuators=[{"gpio": 26, "type": "digital", "name": "Relay"}]
)
print(r.to_esp_payload())
EOF
```

**Ergebnis:**
```json
{
  "sensors": [{
    "gpio": 4,
    "sensor_type": "DS18B20",      <- KORREKT!
    "sensor_name": "Frontend Format",  <- KORREKT!
    "active": true,
    "raw_mode": true
  }],
  "actuators": [{
    "gpio": 26,
    "actuator_type": "relay",       <- "digital" -> "relay" KORREKT!
    "actuator_name": "Relay"
  }]
}
```

### Test 3: FastAPI App kompiliert
```bash
$ poetry run python -c "from src.main import app; print('OK')"
FastAPI app OK
```

---

## 5. Status

| Bug | Status | Beschreibung |
|-----|--------|--------------|
| BUG-010 | GEFIXT | Config-Endpoint akzeptiert jetzt sensors/actuators |
| BUG-011 | GEFIXT | Feld-Mapping transformiert korrekt zu ESP-Format |

---

## 6. Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/schemas/esp.py` | +180 Zeilen: Neue Schemas ESPSensorConfigItem, ESPActuatorConfigItem, ESPDeviceConfigRequest |
| `src/schemas/__init__.py` | +2 Zeilen: Export von ESPDeviceConfigRequest |
| `src/api/v1/esp.py` | ~50 Zeilen modifiziert: Endpoint aktualisiert |

---

## 7. Nächste Schritte

1. **Server neu starten** um Änderungen zu laden
2. **Test via curl:**
   ```bash
   curl -X POST http://localhost:8000/api/v1/esp/devices/ESP_472204/config \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" \
     -d '{
       "sensors": [{"gpio": 32, "sensor_type": "DS18B20", "sensor_name": "Test", "active": true, "raw_mode": true}]
     }'
   ```
3. **ESP-Log prüfen:** Sollte jetzt korrekte Config empfangen

---

## 8. Hinweise

- Der alte Endpoint für System-Config (WiFi, MQTT) wurde durch die neuen Schemas ergänzt, nicht ersetzt
- `ESPConfigUpdate` existiert weiterhin für System-Settings
- `ESPDeviceConfigRequest` ist speziell für Sensor/Actuator-Config
- Das Feld-Mapping unterstützt beide Formate (Frontend und ESP) für maximale Kompatibilität
