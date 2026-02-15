# Server Debug Report: Sensor Processing Endpoint Analysis

**Erstellt:** 2026-02-05
**Agent:** server-debug
**Auftrag:** Analyse des `/api/v1/sensors/process` Endpoints
**Modus:** Read-Only (keine Code-Aenderungen)

---

## 1. Endpoint-Status

**Der Endpoint existiert und ist vollstaendig implementiert.**

| Eigenschaft | Wert |
|-------------|------|
| Route | `POST /api/v1/sensors/process` |
| Datei | `El Servador/god_kaiser_server/src/api/sensor_processing.py` (Zeilen 49-171) |
| Router-Prefix | `/api/v1/sensors` |
| Response Model | `SensorProcessResponse` |

---

## 2. Authentifizierung

**API-Key erforderlich: JA**

| Aspekt | Details |
|--------|---------|
| Header | `X-API-Key` |
| Dependency | `verify_api_key` |
| Rate Limiting | 100 Requests/Minute/Key |
| Debug-Mode | Wenn `debug_mode=True`, wird API-Key-Validierung uebersprungen |

Akzeptierte API-Keys:
- Keys aus `settings.security.api_key`
- Keys die mit `esp_` beginnen (temporaer)

---

## 3. KRITISCHES PROBLEM GEFUNDEN

### Das Problem: raw_value Schema-Validierung

Der ESP32 sendet:
```json
{
  "esp_id": "ESP_472204",
  "gpio": 21,
  "sensor_type": "sht31_temp",
  "raw_value": 23190
}
```

Das Pydantic-Schema in `api/schemas.py` (Zeilen 44-49) validiert:
```python
raw_value: float = Field(
    ...,
    ge=0,
    le=4095,  # <-- PROBLEM! Erlaubt nur 0-4095 (ADC-Range)
)
```

### Konsequenz

**Der Request wird mit HTTP 422 (Unprocessable Entity) abgelehnt**, bevor er die Processing-Logik erreicht.

Fehlermeldung:
```json
{
  "detail": [
    {
      "type": "less_than_equal",
      "loc": ["body", "raw_value"],
      "msg": "Input should be less than or equal to 4095",
      "input": 23190
    }
  ]
}
```

### Betroffene Sensoren

| Sensor | Raw-Value Range | Schema erlaubt | Status |
|--------|-----------------|----------------|--------|
| SHT31 (Temp) | 0-65535 | 0-4095 | **BLOCKIERT** |
| SHT31 (Humidity) | 0-65535 | 0-4095 | **BLOCKIERT** |
| BMP280 | variabel | 0-4095 | **BLOCKIERT** |
| pH (ADC) | 0-4095 | 0-4095 | OK |
| EC (ADC) | 0-4095 | 0-4095 | OK |

---

## 4. Processing-Logik (falls Schema passiert)

Die Server-seitige Processing-Logik ist korrekt implementiert:

1. `SHT31TemperatureProcessor` existiert in `sensor_libraries/active/temperature.py`
2. Konvertiert 16-bit Rohwert zu Celsius: `-45 + (175 * raw_value / 65535)`
3. Sensor-Type `sht31_temp` ist im Registry korrekt gemappt

**Das Problem ist rein in der Schema-Validierung, nicht in der Verarbeitungslogik.**

---

## 5. Curl-Test-Befehle

### Test mit aktuellem Schema (wird scheitern):
```bash
curl -X POST http://192.168.178.57:8000/api/v1/sensors/process \
  -H "Content-Type: application/json" \
  -H "X-API-Key: esp_test" \
  -d '{"esp_id":"ESP_472204","gpio":21,"sensor_type":"sht31_temp","raw_value":23190}'
```
**Erwartetes Ergebnis:** HTTP 422

### Test mit ADC-kompatiblem Wert:
```bash
curl -X POST http://192.168.178.57:8000/api/v1/sensors/process \
  -H "Content-Type: application/json" \
  -H "X-API-Key: esp_test" \
  -d '{"esp_id":"ESP_472204","gpio":34,"sensor_type":"ph","raw_value":2048}'
```
**Erwartetes Ergebnis:** HTTP 200 mit processed pH value

---

## 6. Root Cause: ESP32 Watchdog-Timeout

**Der ESP32 Watchdog-Timeout ist eine FOLGE dieses Problems:**

1. ESP32 sendet HTTP Request mit `raw_value: 23190`
2. Server antwortet sofort mit HTTP 422 (Validation Error)
3. ESP32 HTTP-Client erwartet HTTP 200 oder verarbeitet Error falsch
4. Timeout tritt auf weil Response nicht korrekt gehandelt wird

---

## 7. Empfehlung

### Server-seitig (PRIORITAET 1)

**Schema in `api/schemas.py` anpassen:**

```python
raw_value: float = Field(
    ...,
    description="Raw sensor value (0-65535 for I2C, 0-4095 for ADC)",
    ge=0,
    le=65535,  # Erhoehen auf 16-bit Maximum
)
```

### ESP32-seitig (PRIORITAET 2)

HTTP-Client muss HTTP 4xx Responses korrekt verarbeiten und nicht blockierend warten.

---

## 8. Zusammenfassung

| Problem | Schweregrad | Location |
|---------|-------------|----------|
| Schema `raw_value` Limit (0-4095) blockiert SHT31 | **KRITISCH** | `api/schemas.py:47-48` |

---

**Report Ende**
