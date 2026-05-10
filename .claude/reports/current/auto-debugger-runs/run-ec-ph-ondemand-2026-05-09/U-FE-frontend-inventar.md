# Frontend-Inventar AUT-306: U-FE

**Analysiert:** 2026-05-09 | **Subtask:** AUT-312

---

## U-FE — Frontend-Inventar

### Zusammenfassung: AUT-299 hat F1 und F2 (partial) bereits implementiert

| Feature | Status |
|---------|--------|
| F1: ATC-Picker im SensorConfigPanel | **Fertig** (AUT-299) |
| F2: `default_25c` Badge | **Fertig** (AUT-299) |
| F2: `cached_temp` Badge | **Fehlt** (~8 Zeilen HTML + 4 Zeilen CSS) |
| F2: `temp_read_failed` Badge | **Fehlt** (~8 Zeilen HTML + 4 Zeilen CSS) |

---

### useSensorOptions API

**Parameter:** `filterZoneId?: Ref<string | undefined>` — einziger Parameter.

**Return-Typ:**
```typescript
{
  groupedSensorOptions: ComputedRef<SensorOptionGroup[]>  // Zone → Subzone → SensorOption[]
  flatSensorOptions: ComputedRef<FlatSensorOption[]>       // { id, label }
}
```

Pro SensorOption verfügbar: `label`, `value` ("espId:gpio:sensor_type"), `sensorType`, `espId`, `gpio`, `configId` (UUID).

**Typ-Filter:** Kein eingebauter Typ-Filter in useSensorOptions. SensorConfigPanel implementiert Temp-Filter selbst als eigenes `computed` über `espStore.devices` (Zeile 183–201).

**Zone vs. ESP-Scope:** `filterZoneId` filtert auf `device.zone_id === filterZoneId.value` — alle ESPs einer Zone inklusive. Kein ESP-spezifischer Filter.

---

### SensorConfigPanel — F1 ATC-Picker (bereits implementiert)

**Zeile:** `SensorConfigPanel.vue:925–941`

```html
<div v-if="isAtcCapable" class="sensor-config__field">
  <label class="sensor-config__label">Temperatursensor für ATC (optional)</label>
  <select v-model="tempSensorConfigId" class="sensor-config__select">
    <option :value="null">Keiner (Standardwert 25 °C)</option>
    <option v-for="opt in temperatureSensorOptions" :key="opt.value" :value="opt.value">
      {{ opt.label }}
    </option>
  </select>
</div>
```

`isAtcCapable` (Zeile 163–166): `props.sensorType.toLowerCase() === 'ph' || === 'ec'`

`temperatureSensorOptions` (Zeile 183–201): computed über `espStore.devices`, filtert `TEMP_TYPES = Set(['temperature', 'ds18b20', 'sht31_temp', 'sht31', 'bme280_temp'])`, value = `configId` (UUID).

Save: `config.temp_sensor_config_id = tempSensorConfigId.value ?? null` (Zeile 672).

### Panel-Struktur Zone 1 (Zeilen-Übersicht)

| Feld | ca. Zeile | Bedingung |
|------|-----------|-----------|
| Gerät + Zone (read-only) | 778–794 | immer |
| Name, Beschreibung, Einheit, Aktiv, Subzone | 797–845 | immer |
| Betriebsmodus | 848–856 | immer |
| Stale-Timeout | 858–869 | `operatingMode === 'continuous'` |
| Cron-Zeitplan | 872–896 | `operatingMode === 'scheduled'` |
| Mess-Alter + Kalibrier-Intervall | 898–924 | immer |
| **ATC Temp-Sensor Dropdown (F1)** | **925–941** | **`isAtcCapable` (ph/ec)** |

**Bedingter Render-Pattern für neue Felder:**
```typescript
const guard = computed(() => SENSOR_TYPES.has(props.sensorType.toLowerCase()))
// → v-if="guard" im Template
```

---

### Quality-Badge — SensorCard.vue (F2 partial implementiert)

**Einstiegspunkt:** `SensorCard.vue:476` (Monitor-Mode-Footer, `sensor-card__footer-badges`)

**Bereits implementiert (`atcFallbackWarning`, Zeile 244–252):**
```typescript
const atcFallbackWarning = computed<boolean>(() => {
  const sType = props.sensor.sensor_type.toLowerCase()
  if (sType !== 'ec' && sType !== 'ph') return false
  if (!props.sensor.temp_sensor_config_id) return false
  const meta = props.sensor.metadata
  if (!meta || typeof meta !== 'object') return false
  return meta.temp_source === 'default_25'
})
```

**Erweiterung für vollständige 4-Zustand-Abdeckung:**

```typescript
const atcQualityStatus = computed<'ok' | 'cached_temp' | 'default_25c' | 'temp_read_failed' | null>(() => {
  const sType = props.sensor.sensor_type.toLowerCase()
  if (sType !== 'ec' && sType !== 'ph') return null
  if (!props.sensor.temp_sensor_config_id) return null
  const meta = props.sensor.metadata
  const src = (meta as Record<string, unknown>)?.temp_source as string | undefined
  if (src === 'default_25') return 'default_25c'
  if (src === 'cached') return 'cached_temp'
  if (src === 'read_failed') return 'temp_read_failed'
  return 'ok'
})
```

**Cross-Layer-Abhängigkeit:** Server muss `metadata.temp_source` mit `'cached'` und `'read_failed'` senden (AUT-299 sendet bereits `'default_25'`). Ohne Server-Änderung keine Frontend-Trigger für diese zwei Zustände.

### Safety-Design-Tokens

| Badge-Zustand | CSS-Token | Hex |
|---|---|---|
| `ok` | `var(--color-status-good)` | `#22c55e` |
| `cached_temp` | `var(--color-status-warning)` | `#eab308` |
| `default_25c` | `var(--color-status-warning)` | `#eab308` (bereits `--atc-fallback`) |
| `temp_read_failed` | `var(--color-status-alarm)` | `#ef4444` |

Token-Quelle: `El Frontend/src/styles/tokens.css:264–272`
