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

**Root Cause:** Die Event-Kette beim Satellite-Klick uebergibt `{configId, gpio, sensorType}` korrekt (SensorColumn:94 → ESPOrbitalLayout:170 → DeviceDetailView:70 → HardwareView:645). Die `configId` kommt auch korrekt als Prop bei SensorConfigPanel an (HardwareView:979). ABER: SensorConfigPanel **ignoriert die configId** in `onMounted()` (Zeile 154) und laedt die Config per API-Call `sensorsApi.get(props.espId, props.gpio, props.sensorType)` — also per `GET /sensors/{esp_id}/{gpio}?sensor_type=sht31_temp`. Bei 2x SHT31 auf verschiedenen I2C-Adressen gibt es ZWEI DB-Eintraege mit `(esp_id, gpio=0, sensor_type='sht31_temp')`, und das Backend crasht mit `MultipleResultsFound` (weil `scalar_one_or_none()` in `sensor_repo.py:107`).

> [verify-plan] KORREKTUR: Der Bug ist NICHT im Store-Lookup (es gibt keinen Store-Getter fuer Sensor-Configs). Der Bug ist im API-Call in SensorConfigPanel `onMounted()` Zeile 154. Zusaetzlich: HardwareView:650 hat ebenfalls ein `.find()`-Problem, aber dort wird `configId` korrekt aus dem Payload genommen (Zeile 660), sodass die configId beim Panel ankommt — sie wird nur nicht genutzt.

**Wichtig:** Bei einem EINZELNEN SHT31 funktioniert das Routing korrekt (T09-Fix-A hat das gefixt). Der Bug tritt NUR auf, wenn ZWEI gleiche Sensoren auf VERSCHIEDENEN I2C-Adressen existieren.

---

## SOLL-Zustand

### Strategie: config_id als primaerer Lookup-Key im API-Call

Die `config_id` (UUID) wird bereits in der Event-Kette mitgefuehrt (seit T09-Fix-A) und kommt als Prop beim SensorConfigPanel an. Der API-Call in `onMounted()` muss `config_id` als ERSTES Kriterium verwenden — nicht (gpio, sensor_type).

> [verify-plan] KORREKTUR: "im Store" → "im API-Call". Es gibt keinen Store-Lookup.

### 1. SensorConfigPanel `onMounted`: API-Call per config_id

> [verify-plan] KORREKTUR: Es gibt KEINEN Store-Lookup (`getSensorConfig()`) — weder in `sensor.store.ts` noch in `esp.store.ts`. Auch `allSensorConfigs` existiert nicht. Die Config wird direkt per API-Call in `onMounted()` geladen (SensorConfigPanel.vue:154).

**IST-Code (SensorConfigPanel.vue:154):**
```typescript
const config = await sensorsApi.get(props.espId, props.gpio, props.sensorType)
```

**SOLL-Code — config_id-basierter Lookup (2 Aenderungen noetig):**

**Schritt 1a:** `sensorsApi` erweitern (`El Frontend/src/api/sensors.ts`):
```typescript
// NEU: Get sensor config by config_id (UUID) — immer eindeutig
async getByConfigId(configId: string): Promise<SensorConfigResponse> {
  const response = await api.get<SensorConfigResponse>(`/sensors/config/${configId}`)
  return response.data
}
```

**Schritt 1b:** `SensorConfigPanel.vue` `onMounted` aendern:
```typescript
onMounted(async () => {
  try {
    let config: SensorConfigResponse | null = null

    // Primaer: config_id (eindeutig, kein Ambiguitaets-Risiko)
    if (props.configId) {
      config = await sensorsApi.getByConfigId(props.configId)
    } else {
      // Fallback: gpio + sensorType (Legacy, single-sensor-per-GPIO)
      config = await sensorsApi.get(props.espId, props.gpio, props.sensorType)
    }

    if (config) { /* ... existierende Feld-Zuweisung ... */ }
  } catch { /* ... */ }
})
```

> [verify-plan] ACHTUNG: Dies erfordert einen neuen Backend-Endpoint `GET /sensors/config/{config_id}` — das ist eine Backend-Aenderung die entweder in Fix-A enthalten sein muss oder hier ergaenzt werden muss. Siehe "Backend-Abhaengigkeit" unten.

### 2. SensorConfigPanel: Props — BEREITS KORREKT

> [verify-plan] BESTAETIGT: Die Props sind bereits korrekt definiert (SensorConfigPanel.vue:35-49):
> ```typescript
> interface Props {
>   espId: string
>   gpio: number
>   sensorType: string
>   unit?: string
>   configId?: string      // <-- BEREITS VORHANDEN (optional, Zeile 41)
>   showMetadata?: boolean
> }
> ```
> HardwareView uebergibt `:config-id="configSensorData.configId"` (Zeile 979) — korrekt.
> **Keine Aenderung noetig.** Aber der Plan sollte `configId` als REQUIRED statt optional kennzeichnen, da ohne configId bei 2x SHT31 der Bug bestehen bleibt.

### 3. Event-Kette — BEREITS KORREKT (verifiziert)

> [verify-plan] KORREKTUR der Event-Namen. Die echte Kette (verifiziert gegen Code):

```
SensorColumn:94
  → emit('sensor-click', { configId: sensor.config_id, gpio, sensorType })
    → ESPOrbitalLayout:211 @sensor-click → handler:168
      → emit('sensorClick', payload)                           // camelCase!
        → DeviceDetailView:104 @sensor-click → handler:69
          → emit('sensor-click', { espId, ...payload })        // espId wird ergaenzt
            → HardwareView:920 @sensor-click
              → handleSensorClickFromDetail(payload)           // Zeile 645
              → configSensorData.value = { espId, gpio, sensorType, unit, configId }
              → <SensorConfigPanel :config-id="configSensorData.configId" ... />  // Zeile 979
```

> **BESTAETIGT:** Die `configId` kommt korrekt beim SensorConfigPanel an. Das Problem ist NICHT die Event-Kette, sondern dass `SensorConfigPanel.onMounted()` die configId IGNORIERT und stattdessen `sensorsApi.get(espId, gpio, sensorType)` aufruft (Zeile 154).
>
> **Nebeneffekt in HardwareView:650:** Der `.find(s => s.gpio === payload.gpio && s.sensor_type === payload.sensorType)` liefert bei 2x SHT31 den ERSTEN Treffer — aber da `configId` vom Payload genommen wird (Zeile 660: `payload.configId || sensor.config_id`), ist das unkritisch fuer die configId-Weitergabe. Die daraus genommenen `sensorType` und `unit` sind bei 2x gleichem Sensor ohnehin identisch.

### 4. SensorColumn: config_id im Click-Event — BEREITS KORREKT

> [verify-plan] BESTAETIGT: SensorColumn.vue emittet `config_id` bereits korrekt:
>
> **Zeile 77:** `:key="sensor.config_id || \`sensor-${sensor.gpio}-${sensor.sensor_type}\`"`
> **Zeile 94:** `@click="emit('sensor-click', { configId: sensor.config_id, gpio: sensor.gpio, sensorType: sensor.sensor_type })"`
>
> Das Interface `SensorItem` definiert `config_id?: string` (Zeile 21). **Keine Aenderung noetig.**

---

## Was NICHT gemacht wird

- Keine Aenderung an der Sensor-Erstellung (AddSensorModal)
- Keine Aenderung an der Delete-Logik (das ist Fix-B)

> [verify-plan] KORREKTUR: Folgende Plan-Aussagen sind FALSCH:
>
> 1. ~~"Keine Backend-Aenderungen"~~ — FALSCH. Der aktuelle Backend-Endpoint `GET /sensors/{esp_id}/{gpio}?sensor_type=sht31_temp` crasht bei 2x SHT31 mit `MultipleResultsFound` (sensor_repo.py:107 `scalar_one_or_none()`). Es wird entweder ein neuer Endpoint `GET /sensors/config/{config_id}` benoetigt, oder der bestehende Endpoint muss `config_id` als Query-Param akzeptieren. Falls Fix-A dies bereits abdeckt: EXPLIZIT dokumentieren was Fix-A liefert.
>
> 2. ~~"Kein neues Store-Pattern"~~ — Richtig, aber aus falschem Grund. Es gibt KEINEN bestehenden Store-Lookup den man "priorisieren" koennte. Die Config wird per direktem API-Call geladen, nicht per Store-Getter.

---

## Akzeptanzkriterien

1. **2x SHT31 Routing:** Klick auf "Klima Boden Temperature" (0x45) oeffnet Config-Panel fuer "Klima Boden Temperature" — NICHT "Klima Decke Temperature" (0x44)
2. **2x SHT31 Humidity:** Klick auf "Klima Boden Humidity" (0x45) oeffnet Config-Panel fuer "Klima Boden Humidity" — NICHT "Klima Decke Humidity" (0x44)
3. **Name im Panel:** Config-Panel zeigt den korrekten sensor_name ("Klima Boden Temperature") und die korrekte I2C-Adresse (0x45)
4. **Andere Sensoren unveraendert:** DS18B20 (GPIO 4), BMP280 (0x76) — Config-Panel funktioniert weiterhin korrekt
5. **Event-Kette-Audit:** `console.log` an jeder Stufe (SensorColumn → ESPOrbitalLayout → DeviceDetailView → HardwareView → SensorConfigPanel) zeigt dieselbe config_id

---

## Betroffene Dateien (verifiziert)

> [verify-plan] KORREKTUR: Tabelle gegen echten Code geprueft.

| Datei | Aenderung | Status |
|-------|-----------|--------|
| `El Frontend/src/components/esp/SensorConfigPanel.vue` | `onMounted()` Zeile 154: API-Call per config_id statt (gpio, sensorType) | **AENDERN** |
| `El Frontend/src/api/sensors.ts` | Neue Methode `getByConfigId(configId)` hinzufuegen | **AENDERN** |
| `El Frontend/src/components/esp/SensorColumn.vue` | config_id im Click-Event | BEREITS KORREKT (Zeile 94) |
| `El Frontend/src/views/HardwareView.vue` | config_id als Prop an SensorConfigPanel | BEREITS KORREKT (Zeile 979) |
| `El Frontend/src/components/esp/ESPOrbitalLayout.vue` | configId Weiterreichung | BEREITS KORREKT (Zeile 170) |
| `El Frontend/src/components/esp/DeviceDetailView.vue` | configId Weiterreichung | BEREITS KORREKT (Zeile 70) |
| ~~`sensor.store.ts` (oder `esp.store.ts`)~~ | ~~Store-Lookup~~ | **ENTFAELLT** — kein Store-Getter vorhanden |

### Backend-Abhaengigkeit (KRITISCH)

| Datei | Aenderung | Zustaendigkeit |
|-------|-----------|----------------|
| `El Servador/.../api/v1/sensors.py` | Neuer Endpoint `GET /sensors/config/{config_id}` ODER bestehenden Endpoint um `?config_id=` erweitern | Fix-A (falls nicht enthalten: hier ergaenzen!) |
| `El Servador/.../db/repositories/sensor_repo.py` | `get_by_id(config_id)` existiert bereits (Zeile 315/934) | Kein Aenderungsbedarf |

> **WICHTIG fuer TM:** Bitte pruefen ob Fix-A den Endpoint `GET /sensors/config/{config_id}` liefert. Falls NEIN, muss Fix-C eine Backend-Aenderung enthalten oder Fix-A erweitert werden.
