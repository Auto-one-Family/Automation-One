# Backend-Analyse: Sensor + Subzone Flow

**Datum:** 2026-03-04  
**Kontext:** Playwright-Test „Sensor hinzufügen + Subzone + Speichern“  
**Frage:** Was kommt tatsächlich im Backend an, und wo liegen die Fehler?

---

## 1. Request-Flow: Frontend → Backend

### 1.1 AddSensor Request (POST /v1/debug/mock-esp/{esp_id}/sensors)

**Frontend** (`AddSensorModal.vue` → `espStore.addSensor` → `debugApi.addSensor`):

```typescript
// sensorData = { ...newSensor.value }
// Enthält: gpio, sensor_type, name, subzone_id, raw_value, unit, quality, raw_mode, ...
await api.post(`/debug/mock-esp/${espId}/sensors`, sensorData)
```

**Schema** (`schemas/debug.py:61-110`):

```python
class MockSensorConfig(BaseModel):
    gpio: int
    sensor_type: str
    name: Optional[str] = None
    subzone_id: Optional[str] = Field(None, description="Subzone assignment for this sensor")  # ✅
    raw_value: float = 0.0
    unit: str = ""
    quality: QualityLevel = QualityLevel.GOOD
    raw_mode: bool = True
    # ... interface_type, onewire_address, i2c_address, etc.
```

**Ergebnis:** `subzone_id` ist im Schema definiert und wird vom Frontend mitgesendet (z.B. `"test_reihe_1"`).

---

## 2. Backend-Verarbeitung: add_sensor Endpoint

**Datei:** `api/v1/debug.py:768-890`

### 2.1 Sensor-Config-Bau (Zeile 815-834)

```python
sensor_config = {
    "sensor_type": config.sensor_type,
    "raw_value": config.raw_value,
    "base_value": config.raw_value,
    "unit": config.unit,
    "quality": config.quality,
    "name": config.name,
    "subzone_id": config.subzone_id,  # ✅ Wird übernommen
    "raw_mode": config.raw_mode,
    "interval_seconds": ...,
    # ...
}
```

**Ergebnis:** `subzone_id` wird korrekt in `sensor_config` übernommen.

### 2.2 Speicherung in DB (esp_repo.add_sensor_to_mock)

**Datei:** `db/repositories/esp_repo.py:468-515`

```python
sensor_key = f"{gpio}_{sensor_type}"  # z.B. "32_pH"
sensor_config["gpio"] = gpio
sim_config["sensors"][sensor_key] = sensor_config  # Vollständiger Dict inkl. subzone_id
device.device_metadata["simulation_config"] = sim_config
flag_modified(device, "device_metadata")
```

**Speicherort:** `esp_devices.device_metadata` (JSONB) → `simulation_config.sensors["32_pH"]`

**Ergebnis:** `subzone_id` wird vollständig in `device_metadata` gespeichert.

### 2.3 SensorConfig-Tabelle (sensor_repo.create)

**Datei:** `api/v1/debug.py:866-876`

```python
await sensor_repo.create(
    esp_id=device.id,
    gpio=config.gpio,
    sensor_type=config.sensor_type,
    sensor_name=config.name or f"{config.sensor_type}_{config.gpio}",
    enabled=True,
    pi_enhanced=False,
    sample_interval_ms=...,
    interface_type=interface_type,
    onewire_address=...,
    i2c_address=...,
    sensor_metadata={
        "source": "mock_esp",
        "unit": config.unit,
        "subzone_id": config.subzone_id,  # ✅ Auch in SensorConfig
    },
)
```

**Ergebnis:** `subzone_id` wird zusätzlich in `sensor_configs.sensor_metadata` gespeichert.

---

## 3. Response-Flow: Backend → Frontend

### 3.1 Mock-ESP-Response (_build_mock_esp_response)

**Datei:** `api/v1/debug.py:82-139`

```python
sensors_config = device.device_metadata.get("simulation_config", {}).get("sensors", {})
for sensor_key, config in sensors_config.items():
    sensors.append(
        MockSensorResponse(
            gpio=gpio,
            sensor_type=config.get("sensor_type", "GENERIC"),
            name=config.get("name"),
            subzone_id=config.get("subzone_id"),  # ✅ Aus simulation_config
            raw_value=sensor_value,
            unit=config.get("unit", ""),
            quality=config.get("quality", "good"),
            raw_mode=config.get("raw_mode", True),
            last_read=None,
        )
    )
```

**Ergebnis:** `subzone_id` wird in der Mock-ESP-Response zurückgegeben.

### 3.2 Schema MockSensorResponse

**Datei:** `schemas/debug.py:266-278`

```python
class MockSensorResponse(BaseModel):
    gpio: int
    sensor_type: str
    name: Optional[str]
    subzone_id: Optional[str]  # ✅
    raw_value: float
    unit: str
    quality: str
    raw_mode: bool
    last_read: Optional[datetime]
```

---

## 4. Zusammenfassung: Backend ist korrekt

| Schritt | Datei | subzone_id |
|---------|-------|------------|
| Request-Schema | `schemas/debug.py:67` | ✅ Feld vorhanden |
| add_sensor sensor_config | `debug.py:822` | ✅ `config.subzone_id` |
| add_sensor_to_mock | `esp_repo.py:507` | ✅ Vollständiger Dict |
| sensor_repo.create | `debug.py:874` | ✅ In sensor_metadata |
| _build_mock_esp_response | `debug.py:132` | ✅ `config.get("subzone_id")` |
| MockSensorResponse | `debug.py:272` | ✅ Feld im Schema |

**Fazit:** Das Backend speichert und liefert `subzone_id` durchgängig korrekt.

---

## 5. Wo liegt der Fehler? → Frontend

### 5.1 SensorConfigPanel lädt subzone_id nicht für Mock-Devices

**Datei:** `components/esp/SensorConfigPanel.vue:124-183`

```javascript
onMounted(async () => {
  const isMock = espApi.isMockEsp(props.espId)

  if (!isMock) {
    // Real: Lädt von sensorsApi.get() → config.subzone_id
    const config = await sensorsApi.get(props.espId, props.gpio)
    if ((config as any).subzone_id) {
      subzoneId.value = (config as any).subzone_id  // ✅
    }
  } else {
    // Mock: Nur Defaults, KEIN subzone_id-Load
    unitValue.value = defaultUnit.value
    if (sensorConfig.value) {
      alarmLow.value = ...
      warnLow.value = ...
      // subzoneId wird NIRGENDS gesetzt ❌
    }
  }
  // ...
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === props.espId)
  if (device?.subzone_id && !subzoneId.value) {  // device.subzone_id = ESP-Level, nicht Sensor!
    subzoneId.value = device.subzone_id
  }
})
```

**Problem:**
- Für **Real-Devices** wird `sensorsApi.get()` aufgerufen → `config.subzone_id` wird geladen.
- Für **Mock-Devices** wird nur `sensorConfig` (statische SENSOR_TYPE_CONFIG) verwendet → **kein Zugriff auf den Sensor**.
- `device.subzone_id` ist die Subzone des **ESP**, nicht des **Sensors** – falsche Quelle.

**Korrekte Quelle für Mock:** `device.sensors.find(s => s.gpio === props.gpio)?.subzone_id`

### 5.2 Fix-Vorschlag (SensorConfigPanel.vue)

Im Mock-Branch nach dem Setzen der Defaults:

```javascript
} else {
  // Mock: Defaults + subzone_id aus device.sensors
  unitValue.value = defaultUnit.value
  if (sensorConfig.value) {
    alarmLow.value = ...
    warnLow.value = ...
    warnHigh.value = ...
    alarmHigh.value = ...
  }
  // NEU: subzone_id aus Sensor im Device laden
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === props.espId)
  const sensor = device?.sensors?.find(s => 
    s.gpio === props.gpio && 
    (s.sensor_type === props.sensorType || !props.sensorType)
  )
  if (sensor?.subzone_id) {
    subzoneId.value = sensor.subzone_id
  }
}
```

---

## 6. Weitere Backend-Checks (keine Fehler gefunden)

### 6.1 Sensors-API (Real-Devices)

- `GET /sensors/{esp_id}/{gpio}` liefert `metadata` (enthält `sensor_metadata`).
- `subzone_id` steckt in `sensor_metadata` → Frontend muss `config.metadata?.subzone_id` auswerten.
- SensorConfigPanel prüft `(config as any).subzone_id` – bei Real-Devices kommt `subzone_id` ggf. aus einem anderen Feld (z.B. `metadata.subzone_id`). Das müsste im Sensors-Schema geprüft werden.

### 6.2 Subzone-Validierung

- Beim Add-Sensor wird **nicht** geprüft, ob die Subzone in `subzone_configs` existiert.
- Das ist beabsichtigt: `subzone_id` ist ein freier String; Subzonen können später angelegt werden.

---

## 7. Empfehlung

| Priorität | Aktion |
|-----------|--------|
| 1 | **SensorConfigPanel.vue** anpassen: Im Mock-Branch `subzone_id` aus `device.sensors` laden (siehe Fix oben). |
| 2 | Optional: Logging in `add_sensor` ergänzen, um eingehende `subzone_id` zu verifizieren. |
| 3 | Optional: Sensors-API prüfen, ob `subzone_id` für Real-Devices als Top-Level-Feld oder nur in `metadata` zurückgegeben wird. |
