# Server Dev Report: DS18B20 Sensor-Konfiguration Analyse

## Modus: A (Analyse)
## Auftrag: DS18B20 auf Wokwi-ESP konfigurieren — Fehleranalyse
## Datum: 2026-03-08

---

## Codebase-Analyse

**Analysierte Dateien:**
- `src/api/v1/sensors.py` (~1960 Zeilen, vollstaendig)
- `src/schemas/sensor.py` (~1067 Zeilen, vollstaendig)
- `src/mqtt/handlers/sensor_handler.py` (~500 Zeilen, vollstaendig)
- `src/services/config_builder.py` (Schluessel-Stellen)
- `src/core/config_mapping.py` (DEFAULT_SENSOR_MAPPINGS)
- `src/db/repositories/sensor_repo.py` (OneWire-Methoden)
- `src/db/models/sensor.py` (Feld-Definitionen)

---

## 1. Sensor-Create Endpoint — Exakter Flow

**Endpoint:** `POST /v1/sensors/{esp_id}/{gpio}`

**Status-Guard (Linie 519):**
```python
if esp_device.status not in ("approved", "online"):
    raise DeviceNotApprovedError(esp_id, esp_device.status)
```
Nur `approved` oder `online` ESPs koennen konfiguriert werden.

**DS18B20 spezifischer Pfad (Single-Value, nicht Multi-Value):**

`ds18b20` ist KEIN Multi-Value-Sensor — nur `sht31`, `bmp280`, `bme280` etc. sind es. Deshalb laeuft es durch den Standard-Pfad (Linie 676ff):

1. `_infer_interface_type("ds18b20")` → `"ONEWIRE"` (Linie 1731)
2. `_validate_onewire_config()` wird aufgerufen (Linie 703)
   - Wenn `onewire_address` NICHT mitgegeben: Generiert Placeholder `SIM_<12 hex>` (Linie 1866)
   - Wenn `onewire_address` mitgegeben: Prueft auf Duplikat per 2-way Lookup (esp_id + address)
3. Sensor-Config wird in DB gespeichert mit `interface_type="ONEWIRE"`, `config_status="pending"`
4. APScheduler-Job wird aktualisiert (Linie 810ff)
5. Subzone-Zuweisung (Linie 832ff)
6. Config wird via MQTT an ESP gepusht: `build_combined_config()` → `send_config()` (Linie 862ff)

**SENSOR_TYPES-Validator (Linie 42-113):**
```python
SENSOR_TYPES = ["ph", "temperature", "humidity", "ec", "moisture",
                "pressure", "co2", "light", "flow", "analog", "digital"]
```
`"ds18b20"` ist NICHT in SENSOR_TYPES. Der Validator gibt aber nur ein `pass` (kein Fehler):
```python
if v not in SENSOR_TYPES:
    pass  # Allow custom types but warn
```
Das ist kein Blocker — der Request wird akzeptiert.

---

## 2. Pflicht- und Optionalfelder fuer DS18B20

**Schema:** `SensorConfigCreate` (sensor.py Linie 116-253)

| Feld | Pflicht | Default | Anmerkung |
|------|---------|---------|-----------|
| `esp_id` | JA | — | Pattern: `^(ESP_[A-F0-9]{6,8}\|MOCK_[A-Z0-9]+)$` |
| `gpio` | JA | — | Kommt aus URL-Parameter |
| `sensor_type` | JA | — | Muss `"ds18b20"` sein |
| `enabled` | NEIN | `true` | |
| `interval_ms` | NEIN | `30000` | 1000-300000 ms |
| `processing_mode` | NEIN | `"pi_enhanced"` | pi_enhanced/local/raw |
| `interface_type` | NEIN | auto-inferred | Server leitet `"ONEWIRE"` ab |
| `onewire_address` | NEIN | auto-generated | Empfohlen wenn ROM-Code bekannt |
| `name` | NEIN | `""` | Anzeigename |
| `unit` | NEIN | `None` | z.B. `"°C"` |

**curl-Beispiel (minimales valides Request):**
```bash
curl -X POST "http://localhost:8000/v1/sensors/ESP_XXXXXXXX/4" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "esp_id": "ESP_XXXXXXXX",
    "gpio": 4,
    "sensor_type": "ds18b20"
  }'
```

**curl-Beispiel (vollstaendig mit ROM-Code):**
```bash
curl -X POST "http://localhost:8000/v1/sensors/ESP_XXXXXXXX/4" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "esp_id": "ESP_XXXXXXXX",
    "gpio": 4,
    "sensor_type": "ds18b20",
    "enabled": true,
    "interval_ms": 30000,
    "processing_mode": "pi_enhanced",
    "interface_type": "ONEWIRE",
    "onewire_address": "28FF641E8D3C0C79",
    "name": "Gewaechshaus Temperatur",
    "unit": "°C"
  }'
```

---

## 3. OneWire-Scan Endpoint

**Endpoint:** `POST /v1/sensors/esp/{esp_id}/onewire/scan?pin=4`

**Flow fuer echten ESP:**
```
1. ESP muss status="online" sein (Linie 1499)
2. MQTT Kommando senden:
   Topic:   kaiser/god/esp/{esp_id}/system/command
   Payload: {"command": "onewire/scan", "pin": 4}
3. Warten auf Response (10s Timeout):
   Topic:   kaiser/god/esp/{esp_id}/onewire/scan_result
   Payload: {"devices": [{"rom_code": "28FF...", "device_type": "ds18b20", "pin": 4}]}
4. Rueckgabe mit enriched Geraeteliste (already_configured Flag)
```

**Flow fuer Mock-ESP (esp_id startet mit "MOCK_"):**
- Direkte Rueckgabe von 3 Fake-Geraeten:
  - `28FF641E8D3C0C79`
  - `28FF123456789ABC`
  - `28FF987654321DEF`
- Kein MQTT, kein Timeout

**curl-Beispiel:**
```bash
curl -X POST "http://localhost:8000/v1/sensors/esp/ESP_XXXXXXXX/onewire/scan?pin=4" \
  -H "Authorization: Bearer <TOKEN>"
```

---

## 4. MQTT-Handler — Eingehende Sensor-Daten

**Topic:** `kaiser/god/esp/{esp_id}/sensor/{gpio}/data`

**Erwartetes Payload-Format:**
```json
{
    "ts": 1735818000,
    "esp_id": "ESP_XXXXXXXX",
    "gpio": 4,
    "sensor_type": "ds18b20",
    "raw": 25.5,
    "value": 0.0,
    "unit": "°C",
    "quality": "good",
    "onewire_address": "28FF641E8D3C0C79"
}
```

**DS18B20 Lookup-Pfad (Linie 203-214):**
Wenn `onewire_address` im Payload vorhanden:
```python
sensor_config = await sensor_repo.get_by_esp_gpio_type_and_onewire(
    esp_device.id, gpio, sensor_type, onewire_address
)
```
= 4-way Lookup: esp_id + gpio + sensor_type + onewire_address

**Wenn kein Match gefunden:**
```
logger.warning("OneWire sensor config not found: ... Saving data without config.")
```
Daten werden trotzdem gespeichert, aber OHNE Pi-Enhanced Processing. Kein HTTP-Fehler.

**Wenn Match gefunden und `config_status="pending"`:**
```python
sensor_config.config_status = "active"
```
Config wird automatisch aktiviert beim ersten erfolgreichen Dateneingeng.

---

## 5. Config-Push an ESP

**Automatisch nach REST-POST (Linie 862-876):**

Topic: `kaiser/god/esp/{esp_id}/config`

Payload enthaelt (aus `DEFAULT_SENSOR_MAPPINGS` in `config_mapping.py`):
- `gpio`: GPIO-Pin
- `sensor_type`: `"ds18b20"`
- `interface_type`: `"ONEWIRE"`
- `onewire_address`: ROM-Code oder `"SIM_..."` Placeholder
- `enabled`, `sample_interval_ms`, `pi_enhanced`, `calibration_data`

Kein Unterschied zwischen echtem ESP und Mock bei Config-Push.

---

## 6. NB1 Bug-Status (DELETE-Endpoint)

**Status: GEFIXT**

Aktueller Endpoint: `DELETE /v1/sensors/{esp_id}/{config_id}` (Linie 892ff)
- `config_id` ist UUID (Primaerschluessel)
- Lookup: `sensor_repo.get_by_id(config_id)` — immer unique
- Kein `scalar_one_or_none` Problem mehr
- Vollstaendige Pipeline: DB delete → rebuild_simulation_config → scheduler stop → MQTT Config-Push → WS event

---

## Qualitaetspruefung: 8-Dimensionen-Checkliste

| # | Dimension | Status |
|---|-----------|--------|
| 1 | Struktur & Einbindung | Analyse-Modus — keine Code-Aenderung |
| 2 | Namenskonvention | Keine Aenderung |
| 3 | Rueckwaertskompatibilitaet | Keine Aenderung |
| 4 | Wiederverwendbarkeit | Keine Aenderung |
| 5 | Speicher & Ressourcen | Keine Aenderung |
| 6 | Fehlertoleranz | Keine Aenderung |
| 7 | Seiteneffekte | Keine Aenderung |
| 8 | Industrielles Niveau | Keine Aenderung |

---

## Identifizierte Probleme — Warum DS18B20-Konfiguration scheitert

### Problem 1 (WAHRSCHEINLICHSTE URSACHE): ESP-Status nicht "approved"

```python
# Linie 519
if esp_device.status not in ("approved", "online"):
    raise DeviceNotApprovedError(esp_id, esp_device.status)
```

Falls der Wokwi-ESP noch `"pending"` ist → HTTP 403. Subzone-Assignment macht approved, aber erst nach expliziter Approval.

**Check:** `GET /v1/esp/ESP_XXXXXXXX` → Feld `status` pruefen.

### Problem 2: `esp_id` Pattern-Mismatch

```python
pattern=r"^(ESP_[A-F0-9]{6,8}|MOCK_[A-Z0-9]+)$"
```

Erlaubt nur A-F nach dem Praefix (Hex-Zeichen). Falls der Wokwi-ESP eine ID wie `ESP_123GHIJK` hat → 422 Validation Error.

Wokwi-Standard-IDs sind meistens 8 Hex-Zeichen — sollte passen, aber pruefen.

### Problem 3: `sensor_type` falsch

Falls `"temperature"` statt `"ds18b20"` als `sensor_type` verwendet wird:
- `_infer_interface_type("temperature")` → `"ANALOG"` (FALSCH)
- GPIO-Konflikt-Check wird durchgefuehrt
- Kein OneWire-Handling

**Korrekt:** `sensor_type` MUSS `"ds18b20"` sein.

### Problem 4: `esp_id` Mismatch URL vs Body

URL-Parameter und Body-`esp_id` muessen identisch sein. Der Body-`esp_id` wird fuer Pydantic-Validierung geprueft, der URL-`esp_id` fuer den DB-Lookup.

### Problem 5 (echte ESP): MQTT-Timeout beim Config-Push

Falls MQTT-Broker nicht verbunden:
- Config-Push schlaegt fehl (Warning im Log, kein HTTP-Fehler)
- `config_status` bleibt `"pending"` — wird nie `"active"` ohne MQTT-Daten vom ESP

### Problem 6 (NB7): Frontend ignoriert User-Inputs fuer DS18B20

Bekanntes Problem aus T02-T08-Verifikation: Der DS18B20-Add-Flow im Frontend (`AddSensorModal.vue`) ignoriert User-Inputs wie `name`, `raw_value`, `unit`. Das heisst, selbst wenn der Server-Endpoint korrekt ist, koennte das Frontend fehlerhafte oder unvollstaendige Requests senden.

---

## Debugging-Checkliste (Reihenfolge)

1. ESP-Status pruefen: `GET /v1/esp/{esp_id}` → `status` muss `"approved"` oder `"online"` sein
2. Exakten HTTP-Fehler des fehlgeschlagenen Requests ansehen (Status-Code + Detail-Body)
3. `sensor_type` pruefen: Muss `"ds18b20"` sein, nicht `"temperature"`
4. `esp_id`-Format pruefen: Nur `ESP_[A-F0-9]{6,8}` erlaubt
5. Body `esp_id` == URL `esp_id` pruefen
6. Server-Log pruefen: `grep "ESP_XXXXXXXX" god_kaiser.log | tail -50`

---

## Cross-Layer Impact

Keine Code-Aenderungen. Kein Cross-Layer Impact.

---

## Verifikation

Kein Code geaendert — keine Verifikation noetig.

---

## Empfehlung

Falls Fix noetig:

- **`SENSOR_TYPES` in `src/schemas/sensor.py`**: `"ds18b20"` explizit hinzufuegen (aktuell als "custom type" durchgelassen — funktioniert, aber unklar)
- **NB7-Fix**: Falls Frontend-Inputs ignoriert werden — `frontend-dev` Agent fuer `AddSensorModal.vue` DS18B20-Pfad
- **Falls konkrete Fehlermeldung bekannt**: `server-debug` Agent fuer Log-Analyse beauftragen

Relevante Dateien:
- `c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server\src\api\v1\sensors.py` (Linie 477-884: create_or_update_sensor)
- `c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server\src\schemas\sensor.py` (Linie 42-54: SENSOR_TYPES, Linie 116-253: SensorConfigCreate)
- `c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server\src\mqtt\handlers\sensor_handler.py` (Linie 203-226: OneWire Lookup)
