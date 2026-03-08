# Auftrag T10-Fix-C: Config-Panel I2C-Routing — Disambiguierung per config_id

> **Bezug:** T10-Verifikationsbericht Phase 3/4 — NB-T10-01 HIGH
> **Prioritaet:** HOCH — Config-Panel zeigt falschen Sensor bei gleichen sensor_types
> **Bereich:** El Frontend (Vue 3) — SensorConfigPanel, ESP Store, Event-Kette
> **Datum:** 2026-03-08
> **Abhaengigkeit:** T10-Fix-A muss ZUERST umgesetzt werden (Backend liefert config_id zuverlaessig)

---

## Problem (IST)

### Bug NB-T10-01: Config-Panel oeffnet falschen Sensor bei 2x SHT31

**Szenario:**
- ESP hat 2x SHT31: "Klima Decke" (I2C 0x44) und "Klima Boden" (I2C 0x45)
- Jeder SHT31 erzeugt 2 Sub-Configs: sht31_temp + sht31_humidity = 4 Configs total
- User klickt auf Satellite "Klima Boden Temperature" (I2C 0x45)
- Config-Panel oeffnet sich, zeigt aber "Klima Decke Temperature" (I2C 0x44)

**Screenshot S19** zeigt das Problem: Im L2 sind 4 Satellites sichtbar (Klima Decke Humidity, Klima Boden Humidity, Klima Decke Temperature, Klima Boden Temperature). Das Config-Panel rechts zeigt aber immer den ERSTEN gefundenen Sensor — nicht den angeklickten.

**Root Cause:** Die Event-Kette beim Satellite-Klick uebergibt `{configId, gpio, sensorType}`. Das Config-Panel (oder der Store-Lookup dahinter) sucht den Sensor aber per `(esp_id, gpio, sensor_type)` — und bei 2x SHT31 auf verschiedenen I2C-Adressen findet es ZWEI Treffer fuer `(esp_id, 0, "sht31_temp")`. Es nimmt den ersten Treffer, der ist zufaellig immer "Klima Decke" (0x44).

**Wichtig:** Bei einem EINZELNEN SHT31 funktioniert das Routing korrekt (T09-Fix-A hat das gefixt). Der Bug tritt NUR auf, wenn ZWEI gleiche Sensoren auf VERSCHIEDENEN I2C-Adressen existieren.

---

## SOLL-Zustand

### Strategie: config_id als primaerer Lookup-Key im Store

Die `config_id` (UUID) wird bereits in der Event-Kette mitgefuehrt (seit T09-Fix-A). Der Store-Lookup muss aber tatsaechlich `config_id` als ERSTES Kriterium verwenden — nicht (gpio, sensor_type).

### 1. Store-Lookup per config_id

Im ESP-Store (oder sensor.store.ts) existiert wahrscheinlich eine Methode wie `getSensorConfig(espId, gpio, sensorType)`. Diese muss erweitert oder ersetzt werden:

```typescript
// sensor.store.ts (oder esp.store.ts) — Lookup AENDERN
function getSensorConfigByConfigId(configId: string): SensorConfig | undefined {
  // Direkt per config_id suchen — immer eindeutig
  return allSensorConfigs.value.find(c => c.config_id === configId)
}

// ODER: Bestehende Methode erweitern mit config_id als erstes Kriterium
function getSensorConfig(
  espId: string,
  gpio: number,
  sensorType: string,
  configId?: string  // NEU: optionaler, aber bevorzugter Parameter
): SensorConfig | undefined {
  if (configId) {
    // Primaerer Lookup per config_id — IMMER eindeutig
    return allSensorConfigs.value.find(c => c.config_id === configId)
  }
  // Fallback: altes Verhalten (gpio + sensor_type) — fuer Abwaertskompatibilitaet
  return allSensorConfigs.value.find(
    c => c.esp_id === espId && c.gpio === gpio && c.sensor_type === sensorType
  )
}
```

### 2. SensorConfigPanel: Props um config_id erweitern

```typescript
// SensorConfigPanel.vue — Props
const props = defineProps<{
  espId: string
  configId: string      // PRIMAERER Identifier (schon vorhanden seit T09-Fix-A)
  gpio: number          // Weiterhin fuer Anzeige ("GPIO 4" Label)
  sensorType: string    // Weiterhin fuer Typ-spezifische UI
}>()

// Beim Laden der Config:
const sensorConfig = computed(() => {
  // VORHER (FALSCH): store.getSensorConfig(props.espId, props.gpio, props.sensorType)
  // NACHHER (RICHTIG):
  return store.getSensorConfigByConfigId(props.configId)
})
```

### 3. Event-Kette verifizieren

Die Event-Kette von T09-Fix-A muss verifiziert werden — alle 4 Stufen muessen `configId` korrekt weiterreichen:

```
SensorColumn (Satellite-Klick)
  → emit('select-sensor', { configId, gpio, sensorType })
    → ESPOrbitalLayout
      → emit('open-sensor-config', { configId, gpio, sensorType })
        → DeviceDetailView
          → emit('open-sensor-config', { configId, gpio, sensorType })
            → HardwareView
              → selectedSensor = { configId, gpio, sensorType }
              → <SensorConfigPanel :config-id="selectedSensor.configId" ... />
```

**Pruefpunkt:** In T09-Fix-A wurde diese Kette etabliert. Jetzt muss geprueft werden, dass der LETZTE Schritt — HardwareView → SensorConfigPanel — tatsaechlich `configId` als Prop uebergibt UND dass SensorConfigPanel diesen Prop auch nutzt (nicht ignoriert und stattdessen (gpio, sensorType) verwendet).

### 4. Sensor-Column: Satellite muss config_id in Click-Event haben

Jeder Satellite in der SensorColumn muss seine `config_id` kennen. Beim Rendern der Satellites wird wahrscheinlich ueber die Sensor-Liste iteriert — jeder Eintrag hat `config_id`. Diese muss im Click-Handler an das Event angehaengt werden.

```vue
<!-- SensorColumn.vue — Satellite-Rendering -->
<div
  v-for="sensor in sortedSensors"
  :key="sensor.config_id"
  @click="$emit('select-sensor', {
    configId: sensor.config_id,  // MUSS config_id sein, nicht index
    gpio: sensor.gpio,
    sensorType: sensor.sensor_type
  })"
>
```

---

## Was NICHT gemacht wird

- Keine Backend-Aenderungen (Backend-Lookup ist Fix-A)
- Keine Aenderung an der Sensor-Erstellung (AddSensorModal)
- Keine Aenderung an der Delete-Logik (das ist Fix-B)
- Kein neues Store-Pattern — nur den bestehenden Lookup per config_id priorisieren

---

## Akzeptanzkriterien

1. **2x SHT31 Routing:** Klick auf "Klima Boden Temperature" (0x45) oeffnet Config-Panel fuer "Klima Boden Temperature" — NICHT "Klima Decke Temperature" (0x44)
2. **2x SHT31 Humidity:** Klick auf "Klima Boden Humidity" (0x45) oeffnet Config-Panel fuer "Klima Boden Humidity" — NICHT "Klima Decke Humidity" (0x44)
3. **Name im Panel:** Config-Panel zeigt den korrekten sensor_name ("Klima Boden Temperature") und die korrekte I2C-Adresse (0x45)
4. **Andere Sensoren unveraendert:** DS18B20 (GPIO 4), BMP280 (0x76) — Config-Panel funktioniert weiterhin korrekt
5. **Event-Kette-Audit:** `console.log` an jeder Stufe (SensorColumn → ESPOrbitalLayout → DeviceDetailView → HardwareView → SensorConfigPanel) zeigt dieselbe config_id

---

## Betroffene Dateien (geschaetzt)

| Datei | Aenderung |
|-------|-----------|
| `SensorConfigPanel.vue` | Lookup per config_id statt (gpio, sensorType) |
| `sensor.store.ts` (oder `esp.store.ts`) | `getSensorConfigByConfigId()` oder bestehenden Lookup erweitern |
| `SensorColumn.vue` | config_id im Click-Event verifizieren |
| `HardwareView.vue` | config_id als Prop an SensorConfigPanel verifizieren |
